from __future__ import annotations

from .simbase import *  # noqa: F401,F403 — torch, constants, helpers: the shared floor
from .sim_research import _FX, _fmul, _fx_const, _imul, _turns_at, _walk_slots

# THE CIVICS AI (`cpu/core/aiCivics.ts`, GameCore_XP2 AI/CultureAi.cpp;
# tools/civ6lab/dll_readings.md "H-1: the civics AI") — the city-states'
# civics inside the engine's turn. 24.8 fixed point throughout, in int64;
# the value's arithmetic is the research AI's (`_rai_from_landing`).


class SimCivics:
    def _cai_tables(self) -> dict:
        """the static tables of the civics AI, built once: the table order,
        each row's prerequisite walk slots three levels deep, its lineage
        (the row, its prerequisites, theirs — each level's rows once), the
        value's terms"""
        cached = getattr(self, "_cai_cache", None)
        if cached is not None:
            return cached
        rules, dev = self.rules, self.device
        pre = [list(p) for p in rules.c_prereqs]
        lineage = []
        for c in range(len(pre)):
            out, front = [c], [c]
            for _ in range(2):
                added: list = []
                for e in front:
                    for p in pre[e]:
                        if p not in added:
                            added.append(p)
                out += added
                front = added
            lineage.append(out)
        k = max(len(x) for x in lineage)
        av, ca = rules.ai_value, rules.civic_ai
        share = _fx_const(float(av["unlockShare"]))
        cached = {
            "order": torch.argsort(self._civic_rank).tolist(),
            "lv": _walk_slots(pre, dev),
            "lineage": torch.tensor([x + [-1] * (k - len(x)) for x in lineage], dtype=torch.long, device=dev),
            "unlocks": rules.c_ai_unlocks.to(dev),
            "era": rules.c_era.to(dev),
            "repeat": rules.c_repeat.to(dev),
            "horizon": int(av["horizon"]),
            "own": _imul(_FX, _fx_const(float(av["pyCivic"]))),
            "share": share,
            "district": _imul(share, _fx_const(float(av["pyDistrict"]))),
            "wonder": _imul(share, _fx_const(float(av["pyWonder"]))),
            "floor": _fx_const(float(ca["policyFloor"])),
        }
        self._cai_cache = cached
        return cached

    def _cai_analysis(self, s: int, cul: torch.Tensor):
        """`civicAnalysis` for minor `s` ([B] Culture a turn): per row (engine
        order) its turns (-1 spent or out of reach), next step, own value,
        score after the propagation, owned flag"""
        T = self._cai_tables()
        have = self.citystate_civics[:, s]
        B, NC = have.shape
        cur = self.citystate_cur_civic[:, s]
        res = self._available_mask(have, self._prereq_c, T["repeat"])
        spent = have & ~T["repeat"].unsqueeze(0)
        # each row's turns left at the rate (`turnsLeft`, 0x39c0e0)
        cost = self._research_cost(True)
        col = torch.arange(NC, device=self.device).unsqueeze(0)
        kept = torch.where(col == cur.unsqueeze(1), self.citystate_civic_prog[:, s].unsqueeze(1), self.citystate_civic_retain[:, s])
        prog = torch.floor((kept + self.citystate_civic_ovf[:, s].unsqueeze(1)) * _FX + 0.5).long()
        rate = torch.floor(cul * _FX + 0.5).long().unsqueeze(1)
        tl = _turns_at(cost * _FX - prog, rate)
        tl = torch.where(tl <= 0, cost, tl)
        # the walk: turns through levels 0..2, out of reach where level 3 holds
        lv = self._tree_levels(T["lv"], have, res)
        turns = tl.clone()
        nxt = col.expand(B, -1).clone()
        for depth, (row, on) in enumerate(lv):
            rc = row.clamp(min=0)
            if depth < 2:
                turns = turns + (tl.gather(1, rc.reshape(B, -1)).reshape(rc.shape) * on.long()).sum(dim=2)
            for k in range(row.shape[2]):
                take = on[:, :, k] & (row[:, :, k] != cur.unsqueeze(1))
                nxt = torch.where(take, row[:, :, k], nxt)
        far = lv[2][1].any(dim=2)
        turns = torch.where(far | spent, torch.full_like(turns, -1), turns)
        nxt = torch.where(spent, col.expand(B, -1), nxt)
        val = self._cai_value(turns)
        base = torch.where(turns < 0, torch.zeros_like(val), val)
        # the propagation (0x61ee30): a row in reach scores its lineage's own
        # values, a negative one counting nothing
        lin = T["lineage"]
        pos = base.clamp(min=0)
        idx = lin.clamp(min=0).unsqueeze(0).expand(B, -1, -1)
        g = pos.gather(1, idx.reshape(B, -1)).reshape(idx.shape) * (lin >= 0).long().unsqueeze(0)
        score = torch.where(turns >= 0, g.sum(dim=2), base)
        return turns, nxt, base, score, spent

    def _cai_value(self, turns: torch.Tensor) -> torch.Tensor:
        """`civicValue` [B, NC]: landing each row in `turns` turns — its own
        pseudo-yield from landing to the horizon, once per era between its
        era and the game's plus one; a share per building, a wonder's and a
        district's at their pseudo-yields, each from landing to the horizon;
        the policy floor. At the horizon or past it -9999"""
        T = self._cai_tables()
        B, NC = turns.shape
        nn = turns.clamp(min=0)
        era = T["era"].unsqueeze(0)
        game = self.game_era.unsqueeze(1)
        own = self._rai_from_landing(torch.full((B, NC), T["own"], dtype=torch.long, device=self.device), nn)
        own = torch.where(era <= game, _fmul(own, (game - era + 1) * _FX), own)
        u = T["unlocks"].unsqueeze(0)

        def land(a: int) -> torch.Tensor:
            return self._rai_from_landing(torch.full((B, NC), a, dtype=torch.long, device=self.device), nn)

        val = own + u[:, :, 0] * land(T["share"]) + u[:, :, 2] * land(T["wonder"]) + u[:, :, 1] * land(T["district"]) + T["floor"]
        return torch.where(turns >= T["horizon"], torch.full_like(val, _fx_const(-9999)), val)

    def _cai_best(self, ent, key: torch.Tensor) -> torch.Tensor:
        """`best` (0x6182e0): the comparator's row over the entries in table
        order, the rows whose next step is `key` ([B], -1 none) passed over"""
        T = self._cai_tables()
        turns, nxt, _base, score, owned = ent
        order = T["order"]
        B = turns.shape[0]
        bi = torch.full((B,), order[0], dtype=torch.long, device=self.device)

        def at(x, i):
            return x.gather(1, i.unsqueeze(1)).squeeze(1)

        for c in order[1:]:
            bn, cn = at(nxt, bi), nxt[:, c]
            bt, ct = at(turns, bi), turns[:, c]
            bo, co = at(owned, bi), owned[:, c]
            gen = torch.where(bt * ct <= 0, bt < ct, at(score, bi) < score[:, c])
            take = torch.where(bo != co, bo,
                               torch.where((bn == key) & (cn != key), torch.ones_like(bo),
                                           torch.where((cn == key) & (bn != key), torch.zeros_like(bo), gen)))
            bi = torch.where(take, torch.full_like(bi, c), bi)
        return bi

    def _cai_choice(self, s: int, go: torch.Tensor, ent, key: torch.Tensor) -> torch.Tensor:
        """`civicChoice` (0x626600) where `go` [B]: the civic to study [B] or
        -1; the random pick draws ("Random Civic Choice") over the
        researchable rows in table order"""
        T = self._cai_tables()
        nxt = ent[1]
        have = self.citystate_civics[:, s]
        res = self._available_mask(have, self._prereq_c, T["repeat"])
        bi = self._cai_best(ent, key)
        bn = nxt.gather(1, bi.unsqueeze(1)).squeeze(1)
        ok = go & res.gather(1, bn.unsqueeze(1)).squeeze(1)
        pick = torch.where(ok, bn, torch.full_like(bn, -1))
        order = torch.tensor(T["order"], dtype=torch.long, device=self.device)
        open_o = (res & ~have)[:, order]
        cnt = open_o.sum(dim=1)
        rnd = go & ~ok & (cnt > 0)
        if bool(rnd.count_nonzero()):
            k = self._rand_range(rnd, cnt)
            nth = (open_o.long().cumsum(dim=1) == (k + 1).unsqueeze(1)) & open_o
            pick = torch.where(rnd, order[nth.long().argmax(dim=1)], pick)
        return pick

    def _cai_take(self, s: int, pick: torch.Tensor) -> None:
        """the choice taken (`selectResearch`): the civic in hand parks its
        progress (or, with none, the pool goes to the overflow), the pick
        resumes what it kept"""
        go = pick >= 0
        if not bool(go.count_nonzero()):
            return
        cur = self.citystate_cur_civic[:, s]
        prog = self.citystate_civic_prog[:, s]
        ret = self.citystate_civic_retain[:, s]
        col = torch.arange(ret.shape[1], device=self.device).unsqueeze(0)
        sw = go & (cur != pick)
        park = sw & (cur >= 0)
        ret = torch.where(park.unsqueeze(1) & (col == cur.unsqueeze(1)), prog.unsqueeze(1), ret)
        self.citystate_civic_ovf[:, s] = torch.where(sw & (cur < 0), self.citystate_civic_ovf[:, s] + prog, self.citystate_civic_ovf[:, s])
        kept = ret.gather(1, pick.clamp(min=0).unsqueeze(1)).squeeze(1)
        self.citystate_civic_prog[:, s] = torch.where(sw, kept, prog)
        self.citystate_civic_retain[:, s] = torch.where(sw.unsqueeze(1) & (col == pick.unsqueeze(1)), torch.zeros_like(ret), ret)
        self.citystate_cur_civic[:, s] = torch.where(sw, pick, cur)

    def _cai_completion(self, s: int, fire: torch.Tensor, done: torch.Tensor, cul: torch.Tensor) -> None:
        """a completion's choice where `fire` [B] completed civic `done`: over
        the turn before's analysis (a fresh one before the first), the
        completed civic the key (0x6293e0)"""
        fresh = self._cai_analysis(s, cul)
        v = self.citystate_cai_valid[:, s].unsqueeze(1)
        ent = (torch.where(v, self.citystate_cai_turns[:, s], fresh[0]), torch.where(v, self.citystate_cai_next[:, s], fresh[1]),
               torch.where(v, self.citystate_cai_base[:, s], fresh[2]), torch.where(v, self.citystate_cai_score[:, s], fresh[3]),
               torch.where(v, self.citystate_cai_owned[:, s], fresh[4]))
        self._cai_take(s, self._cai_choice(s, fire, ent, done))

    def _cai_turn(self, s: int, alive: torch.Tensor, cul: torch.Tensor) -> None:
        """the AI's turn (0x620110): the analysis, kept for the next
        completion, and with nothing in hand the choice"""
        ent = self._cai_analysis(s, cul)
        turns, nxt, base, score, owned = ent
        m = alive.unsqueeze(1)
        self.citystate_cai_turns[:, s] = torch.where(m, turns, self.citystate_cai_turns[:, s])
        self.citystate_cai_next[:, s] = torch.where(m, nxt, self.citystate_cai_next[:, s])
        self.citystate_cai_base[:, s] = torch.where(m, base, self.citystate_cai_base[:, s])
        self.citystate_cai_score[:, s] = torch.where(m, score, self.citystate_cai_score[:, s])
        self.citystate_cai_owned[:, s] = torch.where(m, owned, self.citystate_cai_owned[:, s])
        self.citystate_cai_valid[:, s] = self.citystate_cai_valid[:, s] | alive
        go = alive & (self.citystate_cur_civic[:, s] < 0)
        if bool(go.count_nonzero()):
            self._cai_take(s, self._cai_choice(s, go, ent, torch.full_like(self.citystate_cur_civic[:, s], -1)))
