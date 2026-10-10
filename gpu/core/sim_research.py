from __future__ import annotations

from .simbase import *  # noqa: F401,F403 — torch, constants, helpers: the shared floor

# THE RESEARCH AI (`cpu/core/aiResearch.ts`, GameCore_XP2 AI/Research.cpp;
# tools/civ6lab/dll_readings.md "H-1: the research AI") — the city-states'
# research inside the engine's turn. 24.8 fixed point throughout, in int64.
_FX = 256


def _fx_const(c: float) -> int:
    """a float constant as the DLL converts it (`fxConst`)"""
    import math
    fl = math.floor(c)
    return fl * _FX + int((c - fl) * _FX)


def _fmul(a, b):
    return torch.div(a * b, _FX, rounding_mode="floor")


def _imul(a: int, b: int) -> int:
    """the product of two raw constants"""
    return (a * b) >> 8


def _fdiv(a, b):
    return torch.div(a * _FX, b, rounding_mode="trunc")


def _fpct(a, b):
    return torch.div(a * b, _FX * 100, rounding_mode="trunc")


_HALF = _fx_const(0.5)
_SIXTH = _fx_const(0.16667)
_NEG_SIXTH = _fx_const(-0.16667)
_CENT = _fx_const(0.01)
_TEN = _fx_const(10)


def _present_value(a: torch.Tensor, r: int, n: torch.Tensor) -> torch.Tensor:
    """`presentValue` (0x7a16e0) elementwise: `a` a turn for `n` turns at `r`
    (a raw percent), long tensors of one shape"""
    nn = n.clamp(min=0, max=400)
    nk = _fpct(nn * _FX, r)
    nk2 = _fpct(r, nk)
    n2k2 = _fmul(nk2, (nn - 1) * _FX)
    n2k3 = _fpct(r, n2k2)
    n3k3 = _fmul(n2k3, (nn - 2) * _FX)
    dm1 = _fmul(_HALF, n2k2) + _fmul(_SIXTH, n3k3) + nk
    d = dm1 + _FX
    den = torch.clamp(_fpct(r, d), min=_CENT)
    out = torch.where(d < _FX, torch.zeros_like(a), _fdiv(_fmul(dm1, a), den))
    perp = (r >= 0x3200) | (_fmul(_fmul(torch.full_like(n, r), n * _FX), _CENT) >= _TEN)
    out = torch.where(perp, _fdiv(a, torch.full_like(a, _imul(r, _CENT))), out)
    out = torch.where(n == 0, a, out)
    return torch.where(n < 0, torch.zeros_like(a), out)


def _discounted(a: torch.Tensor, r: int, n: torch.Tensor) -> torch.Tensor:
    """`discounted` (0x7a1240) elementwise"""
    nk = _fmul(_fmul(torch.full_like(n, r), n * _FX), _CENT)
    n2k2 = _fmul(_fmul(_fmul(nk, r), (n - 1) * _FX), _CENT)
    n3k3 = _fmul(_fmul(_fmul(n2k2, r), (n - 2) * _FX), _CENT)
    e = (_fmul(_HALF, n2k2) + _fmul(_NEG_SIXTH, n3k3) - nk + _FX).clamp(min=0)
    out = torch.where(e > _FX, torch.zeros_like(a), _fmul(a, e))
    out = torch.where(n == 0, a, out)
    return torch.where(n < 0, torch.zeros_like(a), out)


def _walk_slots(pre: list, dev) -> list:
    """a tree's prerequisite walk slots three levels deep (each row's
    prerequisites in the install's order, theirs, theirs): per level the
    slot rows [N, K] (-1 empty) and each slot's parent slot in the level
    above"""
    n = len(pre)
    lv1 = [[p for p in pre[t]] for t in range(n)]
    lv1_par = [[0 for _ in pre[t]] for t in range(n)]
    lv2, lv2_par, lv3, lv3_par = [], [], [], []
    for t in range(n):
        a, ap = [], []
        for j, e in enumerate(lv1[t]):
            for q in pre[e]:
                a.append(q)
                ap.append(j)
        lv2.append(a)
        lv2_par.append(ap)
        b, bp = [], []
        for m, e in enumerate(a):
            for q in pre[e]:
                b.append(q)
                bp.append(m)
        lv3.append(b)
        lv3_par.append(bp)

    def pad(rows, fill):
        k = max([len(x) for x in rows] + [1])
        return torch.tensor([x + [fill] * (k - len(x)) for x in rows], dtype=torch.long, device=dev)

    return [(pad(lv1, -1), pad(lv1_par, 0)), (pad(lv2, -1), pad(lv2_par, 0)), (pad(lv3, -1), pad(lv3_par, 0))]


def _turns_at(rem: torch.Tensor, rate: torch.Tensor) -> torch.Tensor:
    """`turnsAt` (0x8c4540) elementwise: the turns `rem` raw left needs at
    `rate` raw a turn — the truncated quotient, one more where a remainder
    is left; 1 where nothing is left; -1 where the rate is none"""
    n = torch.div(torch.div(rem * _FX, rate.clamp(min=1), rounding_mode="trunc"), _FX, rounding_mode="floor")
    t = torch.where(rem > rate * n, n + 1, n)
    t = torch.where(rem <= 0, torch.ones_like(t), t)
    return torch.where(rate <= 0, torch.full_like(t, -1), t)


class SimResearch:
    def _rai_tables(self) -> dict:
        """the static tables of the research AI, built once: the table order,
        each row's prerequisite walk slots three levels deep, the leaf rows,
        the value's terms"""
        cached = getattr(self, "_rai_cache", None)
        if cached is not None:
            return cached
        rules, dev = self.rules, self.device
        pre = [list(p) for p in rules.t_prereqs]
        nt = len(pre)
        required = torch.zeros(nt, dtype=torch.bool, device=dev)
        for t in range(nt):
            for p in pre[t]:
                required[p] = True
        ra, av = rules.research_ai, rules.ai_value
        cached = {
            "order": torch.argsort(self._tech_rank).tolist(),
            "lv": _walk_slots(pre, dev),
            "leaf": ~required,
            "unlocks": rules.t_ai_unlocks.to(dev),
            "embark": rules.t_embark_all.to(dev),
            "era": rules.t_era.to(dev),
            "repeat": rules.t_repeat.to(dev),
            "horizon": int(av["horizon"]),
            "rate": _fx_const(float(av["discountPct"])),
            "bias": int(ra["taskBias"]) * 10 * _FX,
            "own": _imul(_FX, _fx_const(float(av["pyTechnology"]))),
            "embark_add": _fx_const(float(ra["embarkAll"])),
            "share": _fx_const(float(av["unlockShare"])),
            "py_district": _fx_const(float(av["pyDistrict"])),
            "py_wonder": _fx_const(float(av["pyWonder"])),
        }
        self._rai_cache = cached
        return cached

    def _rai_from_landing(self, a: torch.Tensor, n: torch.Tensor) -> torch.Tensor:
        """`fromLanding`: a yield a turn from the turn a row `n` away lands to
        the horizon (the AI's value tables, shared by the civics AI)"""
        T = self._rai_tables()
        h, r = T["horizon"], T["rate"]
        full = _present_value(a, r, torch.full_like(n, h))
        return torch.where(n == h, _discounted(a, r, n), full - _present_value(a, r, n))

    def _rai_levels(self, have: torch.Tensor, gate: torch.Tensor | None):
        """the research walk's slots (`_tree_levels` over the tech tree)"""
        return self._tree_levels(self._rai_tables()["lv"], have, gate)

    def _tree_levels(self, lv: list, have: torch.Tensor, gate: torch.Tensor | None):
        """the walk's slots that hold, per level ([B, N, K] each): a slot
        holds where its parent held (the row itself at the first level), is
        unowned, is the first of its row in the level, and — with `gate`
        ([B, N] the researchable rows, the analysis' walk) — its parent is
        not researchable"""
        B = have.shape[0]
        out = []
        parent_on = None
        parent_tech = None
        for depth, (slot, par) in enumerate(lv):
            K = slot.shape[1]
            tech = slot.unsqueeze(0).expand(B, -1, -1)
            valid = tech >= 0
            tc = tech.clamp(min=0)
            owned = have.gather(1, tc.reshape(B, -1)).reshape(B, -1, K)
            if depth == 0:
                up = torch.ones_like(valid)
                if gate is not None:
                    up = up & ~gate.unsqueeze(2)
            else:
                pidx = par.unsqueeze(0).expand(B, -1, -1)
                up = parent_on.gather(2, pidx)
                if gate is not None:
                    pt = parent_tech.gather(2, pidx).clamp(min=0)
                    up = up & ~gate.gather(1, pt.reshape(B, -1)).reshape(B, -1, K)
            cand = valid & up & ~owned
            on = torch.zeros_like(cand)
            for k in range(K):
                dup = torch.zeros_like(cand[:, :, k])
                for k2 in range(k):
                    dup = dup | (on[:, :, k2] & (tech[:, :, k2] == tech[:, :, k]))
                on[:, :, k] = cand[:, :, k] & ~dup
            out.append((tech, on))
            parent_on, parent_tech = on, tech
        return out

    def _rai_analysis(self, s: int, sci: torch.Tensor):
        """`researchAnalysis` for minor `s` ([B] Science a turn): per row
        (engine order) its turns (-1 spent or out of reach), next step, base,
        score after the propagation, owned flag"""
        T = self._rai_tables()
        have = self.citystate_techs[:, s]
        B, NT = have.shape
        cur = self.citystate_cur_tech[:, s]
        res = self._available_mask(have, self._prereq_t, T["repeat"])
        spent = have & ~T["repeat"].unsqueeze(0)
        # each row's turns left at the rate (`turnsLeft`)
        cost = self._research_cost(False)
        col = torch.arange(NT, device=self.device).unsqueeze(0)
        kept = torch.where(col == cur.unsqueeze(1), self.citystate_tech_prog[:, s].unsqueeze(1), self.citystate_tech_retain[:, s])
        prog = torch.floor((kept + self.citystate_tech_ovf[:, s].clamp(min=0).unsqueeze(1)) * _FX + 0.5).long()
        rate = torch.floor(sci * _FX + 0.5).long().unsqueeze(1)
        tl = _turns_at(cost * _FX - prog, rate)
        tl = torch.where(tl < 0, cost, tl)
        # the walk: turns through levels 0..2, out of reach where level 3 holds
        lv = self._rai_levels(have, res)
        turns = tl.clone()
        nxt = col.expand(B, -1).clone()
        for depth, (tech, on) in enumerate(lv):
            tc = tech.clamp(min=0)
            if depth < 2:
                turns = turns + (tl.gather(1, tc.reshape(B, -1)).reshape(tc.shape) * on.long()).sum(dim=2)
            for k in range(tech.shape[2]):
                take = on[:, :, k] & (tech[:, :, k] != cur.unsqueeze(1))
                nxt = torch.where(take, tech[:, :, k], nxt)
        far = lv[2][1].any(dim=2)
        turns = torch.where(far | spent, torch.full_like(turns, -1), turns)
        nxt = torch.where(spent, col.expand(B, -1), nxt)
        val = self._rai_value(s, turns)
        base = torch.where(turns < 0, torch.zeros_like(val), val)
        score = base + self._rai_upstream(have, base, turns)
        return turns, nxt, base, score, spent

    def _ai_district_share(self, s: int) -> torch.Tensor:
        """[B] a district's share at minor `s`'s pseudo-yield weight
        (`pseudoYieldWeights`): PSEUDOYIELD_DISTRICT's factor 1 + 0.5 x the
        ChronologyIndex of the minor's era (the latest of its techs' and
        civics'), the trees' only weighted pseudo-yield for a city-state"""
        T = self._rai_tables()
        w = (self._civ_era(self.citystate_techs[:, s], self.citystate_civics[:, s]) + 1) * (_FX // 2)
        return _fmul(torch.full_like(w, T["share"]), _fmul(_FX + w, torch.full_like(w, T["py_district"])))

    def _rai_value(self, s: int, turns: torch.Tensor) -> torch.Tensor:
        """`techValue` [B, NT] for minor `s`: landing each row in `turns`
        turns — its own pseudo-yield (EmbarkAll adds; a row of an era before
        the game's counts once per era between, plus one), a share per
        building, a district's and a wonder's at their pseudo-yields (the
        district's at the minor's weight), each from landing to the horizon;
        past the horizon -9999"""
        T = self._rai_tables()
        B, NT = turns.shape
        era = T["era"].unsqueeze(0)
        game = self.game_era.unsqueeze(1)
        own = torch.full((B, NT), T["own"], dtype=torch.long, device=self.device)
        own = own + T["embark"].long().unsqueeze(0) * T["embark_add"]
        own = torch.where(era < game, _fmul(own, (game - era + 1) * _FX), own)
        nn = turns.clamp(min=0)
        u = T["unlocks"].unsqueeze(0)
        val = (self._rai_from_landing(own, nn) + u[:, :, 0] * self._rai_from_landing(torch.full_like(own, T["share"]), nn)
               + u[:, :, 1] * self._rai_from_landing(self._ai_district_share(s).unsqueeze(1).expand(B, NT), nn)
               + u[:, :, 2] * self._rai_from_landing(torch.full_like(own, _imul(T["share"], T["py_wonder"])), nn))
        return torch.where(turns > T["horizon"], torch.full_like(val, _fx_const(-9999)), val)

    def _rai_upstream(self, have: torch.Tensor, base: torch.Tensor, turns: torch.Tensor) -> torch.Tensor:
        """`propagate`'s sum: per row in reach, its unowned prerequisites' own
        values one and two levels up (a negative one counts nothing)"""
        B = have.shape[0]
        lv = self._rai_levels(have, None)
        add = torch.zeros_like(base)
        pos = base.clamp(min=0)
        for tech, on in lv[:2]:
            tc = tech.clamp(min=0)
            add = add + (pos.gather(1, tc.reshape(B, -1)).reshape(tc.shape) * on.long()).sum(dim=2)
        return torch.where(turns >= 0, add, torch.zeros_like(add))

    def _rai_best(self, ent, key: torch.Tensor) -> torch.Tensor:
        """`best` (0x75d530): the comparator's row over the entries in table
        order, the rows whose next step is `key` ([B], -1 none) passed over"""
        T = self._rai_tables()
        turns, nxt, _base, score, owned = ent
        leaf = T["leaf"]
        order = T["order"]
        B = turns.shape[0]
        bi = torch.full((B,), order[0], dtype=torch.long, device=self.device)

        def at(x, i):
            return x.gather(1, i.unsqueeze(1)).squeeze(1)

        for c in order[1:]:
            ci = torch.full_like(bi, c)
            bn, cn = at(nxt, bi), nxt[:, c]
            bt, ct = at(turns, bi), turns[:, c]
            bo, co = at(owned, bi), owned[:, c]
            bl, cl = leaf[bi], leaf[c]
            bd, cd = bn == bi, cn == ci
            gen = torch.where(bo != co, bo,
                              torch.where(bl & ~cl & bd & ~cd, torch.zeros_like(bo),
                                          torch.where(~bl & cl & cd & ~bd, torch.ones_like(bo), at(score, bi) < score[:, c])))
            same = bn == cn
            take = torch.where(same, torch.where(bt * ct <= 0, bt < ct, gen),
                               torch.where(bn == key, torch.ones_like(bo), torch.where(cn == key, torch.zeros_like(bo), gen)))
            bi = torch.where(take, ci, bi)
        return bi

    def _rai_choice(self, s: int, go: torch.Tensor, ent, key: torch.Tensor):
        """`researchChoice` (0x763020) where `go` [B]: (pick [B] the research
        to take or -1, goal [B]); the random pick draws "BT Research Choice"
        over the researchable rows"""
        T = self._rai_tables()
        turns, nxt, _b, _s, _o = ent
        have = self.citystate_techs[:, s]
        res = self._available_mask(have, self._prereq_t, T["repeat"])
        bi = self._rai_best(ent, key)
        bn = nxt.gather(1, bi.unsqueeze(1)).squeeze(1)
        ok = go & (turns.gather(1, bi.unsqueeze(1)).squeeze(1) > 0) & res.gather(1, bn.unsqueeze(1)).squeeze(1)
        pick = torch.where(ok, bn, torch.full_like(bn, -1))
        goal0 = self.citystate_tech_goal[:, s]
        goal = torch.where(ok, bi, goal0)
        spent = have & ~T["repeat"].unsqueeze(0)
        held = (goal0 >= 0) & ~spent.gather(1, goal0.clamp(min=0).unsqueeze(1)).squeeze(1)
        open_ = res & ~have
        order = torch.tensor(T["order"], dtype=torch.long, device=self.device)
        open_o = open_[:, order]
        cnt = open_o.sum(dim=1)
        rnd = go & ~ok & ~held & (cnt > 0)
        if bool(rnd.count_nonzero()):
            k = self._rand_range(rnd, cnt)
            nth = (open_o.long().cumsum(dim=1) == (k + 1).unsqueeze(1)) & open_o
            r_pick = order[nth.long().argmax(dim=1)]
            pick = torch.where(rnd, r_pick, pick)
            goal = torch.where(rnd, torch.full_like(goal, -1), goal)
        return pick, goal

    def _rai_take(self, s: int, pick: torch.Tensor, goal: torch.Tensor) -> None:
        """the choice taken (`selectResearch`): the research in hand parks its
        progress (or, with none, the pool goes to the overflow), the pick
        resumes what it kept; the goal set"""
        go = pick >= 0
        if not bool(go.count_nonzero()):
            return
        cur = self.citystate_cur_tech[:, s]
        prog = self.citystate_tech_prog[:, s]
        ret = self.citystate_tech_retain[:, s]
        col = torch.arange(ret.shape[1], device=self.device).unsqueeze(0)
        same = cur == pick
        sw = go & ~same
        park = sw & (cur >= 0)
        ret = torch.where(park.unsqueeze(1) & (col == cur.unsqueeze(1)), prog.unsqueeze(1), ret)
        self.citystate_tech_ovf[:, s] = torch.where(sw & (cur < 0), self.citystate_tech_ovf[:, s] + prog, self.citystate_tech_ovf[:, s])
        kept = ret.gather(1, pick.clamp(min=0).unsqueeze(1)).squeeze(1)
        self.citystate_tech_prog[:, s] = torch.where(sw, kept, prog)
        self.citystate_tech_retain[:, s] = torch.where(sw.unsqueeze(1) & (col == pick.unsqueeze(1)), torch.zeros_like(ret), ret)
        self.citystate_cur_tech[:, s] = torch.where(sw, pick, cur)
        self.citystate_tech_goal[:, s] = torch.where(go, goal, self.citystate_tech_goal[:, s])

    def _rai_store(self, s: int, mask: torch.Tensor, ent) -> None:
        """the turn's analysis kept for the next completion (`aiEntries`)"""
        turns, nxt, base, score, owned = ent
        m = mask.unsqueeze(1)
        self.citystate_ai_turns[:, s] = torch.where(m, turns, self.citystate_ai_turns[:, s])
        self.citystate_ai_next[:, s] = torch.where(m, nxt, self.citystate_ai_next[:, s])
        self.citystate_ai_base[:, s] = torch.where(m, base, self.citystate_ai_base[:, s])
        self.citystate_ai_score[:, s] = torch.where(m, score, self.citystate_ai_score[:, s])
        self.citystate_ai_owned[:, s] = torch.where(m, owned, self.citystate_ai_owned[:, s])
        self.citystate_ai_valid[:, s] = self.citystate_ai_valid[:, s] | mask

    def _rai_completion(self, s: int, fire: torch.Tensor, done: torch.Tensor, sci: torch.Tensor) -> None:
        """`researchCompletionChoice` where `fire` [B] completed row `done`:
        the turn before's analysis (a fresh one before the first) adds its
        prerequisites' values once more, the choice passes the row over"""
        fresh = self._rai_analysis(s, sci)
        v = self.citystate_ai_valid[:, s].unsqueeze(1)
        turns = torch.where(v, self.citystate_ai_turns[:, s], fresh[0])
        nxt = torch.where(v, self.citystate_ai_next[:, s], fresh[1])
        base = torch.where(v, self.citystate_ai_base[:, s], fresh[2])
        score = torch.where(v, self.citystate_ai_score[:, s], fresh[3])
        owned = torch.where(v, self.citystate_ai_owned[:, s], fresh[4])
        score = score + self._rai_upstream(self.citystate_techs[:, s], base, turns)
        pick, goal = self._rai_choice(s, fire, (turns, nxt, base, score, owned), done)
        self._rai_take(s, pick, goal)

    def _rai_turn(self, s: int, alive: torch.Tensor, sci: torch.Tensor) -> None:
        """the turn's analysis (kept) and its choice (`researchTurnChoice`):
        with nothing in hand the choice; else a researchable row scoring the
        task bias more than the goal (or the research) replaces it"""
        T = self._rai_tables()
        ent = self._rai_analysis(s, sci)
        self._rai_store(s, alive, ent)
        turns, nxt, _base, score, owned = ent
        cur = self.citystate_cur_tech[:, s]
        goal = self.citystate_tech_goal[:, s]
        ref = score.gather(1, torch.where(goal >= 0, goal, cur).clamp(min=0).unsqueeze(1)).squeeze(1)
        order = T["order"]
        bi = torch.full_like(cur, order[0])
        for c in order[1:]:
            take = (score.gather(1, bi.unsqueeze(1)).squeeze(1) < score[:, c]) & ~owned[:, c]
            bi = torch.where(take, torch.full_like(bi, c), bi)
        bn = nxt.gather(1, bi.unsqueeze(1)).squeeze(1)
        have = self.citystate_techs[:, s]
        res = self._available_mask(have, self._prereq_t, T["repeat"])
        switch = ((cur >= 0) & (bn != cur) & (score.gather(1, bi.unsqueeze(1)).squeeze(1) > ref + T["bias"])
                  & res.gather(1, bn.unsqueeze(1)).squeeze(1) & (bi == bn))
        go = alive & ((cur < 0) | switch)
        if bool(go.count_nonzero()):
            pick, g = self._rai_choice(s, go, ent, torch.full_like(cur, -1))
            self._rai_take(s, pick, g)
