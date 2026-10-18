"""THE CITY-STATES' OPERATIONS on the GPU (cpu/core/minorOps.ts over the one
operation manager cpu/core/operations; `tools/civ6lab/dll_readings.md`
"C-97: the operations", "C-96: the city-states' operations"): each minor's
manager state as `mops_*` planes ([B, S, ...]), its turn in three parts as
the game's Control Manager runs a player's lists —

 - B: the military AI's turn (`_mops_evaluate`, from `_minor_military_turn`,
   before the turn's knowledge base look): the
   members gone leave their operations, the candidates — Attack Barb Camp
   against each camp its knowledge base holds, the running operation's
   naming its backup on the strengths the last run refreshed — and
   the new one to start chosen under the trait's limits;
 - A: the city's defence event starts City Defense (`_mops_start`, the
   minor world's `start_operation`);
 - C: in its tactical pass, once each unit's planning is taken
   (`_mops_run`, from `_minor_pass`): each running operation's strengths
   refreshed, the chosen one started, then each operation's tree ticks in
   slot order — the interpreter of sim_citytrees.py over the operation's
   nodes — and the operations' units' turns are theirs.

A minor runs Attack Barb Camp, Barb Camp Tech Boost (never started) and
City Defense (`MINOR_OP_DEFS`). A unit is its slot in the majors' pool; an
operation's tree id is the minor's city AI's tree serial; its contracts are
the city AI's book's (`cai_*`), held in the operation's tree.
"""

from __future__ import annotations

from .simbase import *  # noqa: F401,F403 — torch, constants, helpers: the shared floor
from . import simbase
from .sim_citytrees import (
    BT_FAILURE, BT_FRESH, BT_RUNNING, BT_SKIPPED, BT_SUCCESS, CP_ACCEPTED, CP_CANCELLED, CP_CLAIMED,
    CP_COMPLETED, CP_FAILED, CP_IN_PROGRESS, NONE, SHAPE_SELECTOR, _NEXT_MEM, _Tree, _cget, _cset,
    _propagate, _u_contract_manager, new_contract, submit_contract,
)
from .sim_research import _FX
from .sim_tactics import _AI_COMBAT, _AI_DEFENDER

# the pool's slots, the teams of an operation, a team's members, the camps
# the knowledge base holds, the Operation Move nodes of a tree
N_OPS = 3
N_TEAMS = 2
N_MEMBERS = 16
N_CAMPS = 16
N_MOVES = 2
# a goal of a team (Operation Move's "Move To (enum)" slots)
G_RALLY, G_TARGET, G_CENTRE, G_LINE, G_MARCH = 0, 1, 3, 4, 5
# the list's unit entries the operations' attacks take (0x80c080: a
# civilian through a HIGH unit; the GPU list's kinds 1-3 and 7)
_UNIT_KINDS = (1, 2, 3, 7)
# the city's garrison heal a turn (COMBAT_HEAL_CITY_GARRISON)
_GARRISON_HEAL = 20
# the 24.8 product
_F32 = torch.float32


def _f(x: torch.Tensor) -> torch.Tensor:
    """Math.fround of a float64 tensor"""
    return x.to(_F32).to(torch.float64)


class MinorOpsTables:
    """the static tables of the city-states' operations: the definitions
    (by index: Attack Barb Camp, Barb Camp Tech Boost, City Defense), their
    teams and requirements, the trees compiled, the unit AI types of each AI
    unit row, the Priority types, the trait's limits"""

    def __init__(self, rules):
        ao = rules.ai_operations
        cb = rules.ai_city_build
        self.defs = list(ao["defs"])
        self.names = [d["name"] for d in self.defs]
        self.d_abc = self.names.index("Attack Barb Camp")
        self.d_boost = self.names.index("Barb Camp Tech Boost")
        self.d_cd = self.names.index("City Defense")
        self.teams = {k: list(ao["teams"][d["name"]]) for k, d in enumerate(self.defs)}
        self.reqs = {t: list(r) for t, r in ao["reqs"].items()}
        self.trees = {k: _Tree(d["tree"], ao["trees"][d["tree"]]) for k, d in enumerate(self.defs) if d.get("tree")}
        types: list[str] = []
        for lst in ao["unitAi"]:
            for t in lst:
                if t not in types:
                    types.append(t)
        for rs in self.reqs.values():
            for r in rs:
                if r["aiType"] not in types:
                    types.append(r["aiType"])
        self.ai_types = types
        self.ai_index = {t: i for i, t in enumerate(types)}
        nu = len(cb["units"])
        ua = torch.zeros(nu, len(types), dtype=torch.bool)
        for k, lst in enumerate(ao["unitAi"]):
            for t in lst:
                ua[k, self.ai_index[t]] = True
        self.unit_ai = ua
        pr = torch.zeros(len(types), dtype=torch.bool)
        for t in ao["priority"]:
            if t in self.ai_index:
                pr[self.ai_index[t]] = True
        self.prio = pr
        self.limits = {k: int(v) for k, v in ao["limits"].items()}
        self.n_nodes = max([t.n for t in self.trees.values()] + [1])
        self.n_tags = max([len(t.tags) for t in self.trees.values()] + [1])
        # each tree's Operation Move nodes, by node, their store
        self.move_store = {k: {n["index"]: j for j, n in enumerate([x for x in t.nodes if x["type"] == "Operation Move"])}
                           for k, t in self.trees.items()}
        assert all(len(v) <= N_MOVES for v in self.move_store.values()), "minor operations: raise N_MOVES"
        # per definition per team its requirements as tensors: AI type index,
        # min (-1 none), max (-1 none), min/max percentage
        self.team_reqs = {}
        for k, ts in self.teams.items():
            out = []
            for t in ts:
                rs = self.reqs.get(t["team"], [])
                out.append({
                    "type": torch.tensor([self.ai_index[r["aiType"]] for r in rs], dtype=torch.long),
                    "min": torch.tensor([-1 if r["min"] is None else int(r["min"]) for r in rs], dtype=torch.long),
                    "max": torch.tensor([-1 if r["max"] is None else int(r["max"]) for r in rs], dtype=torch.long),
                    "minp": torch.tensor([float(r["minPercentage"]) for r in rs], dtype=torch.float64),
                    "maxp": torch.tensor([float(r["maxPercentage"]) for r in rs], dtype=torch.float64),
                    "dep": [r["dependence"] for r in rs],
                    "n": len(rs),
                })
            self.team_reqs[k] = out
        self.n_reqs = max([tr["n"] for ts in self.team_reqs.values() for tr in ts] + [1])


_TABLES: dict[int, tuple] = {}


def minor_ops_tables(rules) -> MinorOpsTables:
    hit = _TABLES.get(id(rules))
    if hit is None or hit[0] is not rules:
        hit = (rules, MinorOpsTables(rules))
        _TABLES[id(rules)] = hit
    return hit[1]


class _OpCtx:
    """one pool slot's operation of one minor, over the games whose operation
    there runs definition `d`: the planes the interpreter and the contract
    nodes read (sim_citytrees.py's `_Ctx` shape)"""

    def __init__(self, sim, s: int, k: int, d: int, view: dict):
        self.sim, self.s, self.k, self.d = sim, s, k, d
        self.ai = sim.cityai
        T = sim._mops_tables()
        self.T = T
        self.tree: _Tree = T.trees[d]
        self.st = sim.mops_st[:, s, k]
        self.ma = sim.mops_ma[:, s, k]
        self.mb = sim.mops_mb[:, s, k]
        self.bb = sim.mops_bb[:, s, k]
        self.ref = sim.mops_id[:, s, k]
        self.view = view

    def tag(self, i: int, name: str) -> torch.Tensor:
        t = self.tree.tag(i, name)
        return torch.full_like(self.ref, NONE) if t is None else self.bb[:, t].clone()

    def set_tag(self, i: int, name: str, v, mask: torch.Tensor) -> None:
        t = self.tree.tag(i, name)
        if t is not None:
            vv = v if torch.is_tensor(v) else torch.full_like(self.ref, int(v))
            self.bb[:, t] = torch.where(mask, vv, self.bb[:, t])

    def tree_contract(self, cid: torch.Tensor) -> torch.Tensor:
        """[B] the slot of the operation's own contract of the id, -1 none"""
        ai, s = self.ai, self.s
        m = ((ai.c_id[:, s] == cid.unsqueeze(1)) & (cid.unsqueeze(1) >= 0) & ai.c_in_tree[:, s]
             & (ai.c_tree[:, s] == self.ref.unsqueeze(1)))
        j = m.long().argmax(dim=1)
        return torch.where(m.any(dim=1), j, torch.full_like(j, -1))


class SimMinorOps:
    # -- the state --------------------------------------------------------

    def _mops_tables(self) -> MinorOpsTables:
        return minor_ops_tables(self.rules)

    def _init_minor_ops(self, rules, B: int, s_pad: int, device) -> None:
        """the planes of each minor's operation manager (`OpsAi`)"""
        T = minor_ops_tables(rules)
        L = torch.long
        NO, NTM, NM = N_OPS, N_TEAMS, N_MEMBERS
        N, NT, NR = T.n_nodes, T.n_tags, T.n_reqs
        P = simbase.MAJOR_POOL_MAX
        S = s_pad
        # the pool: per slot its definition (-1 free), its tree id, target,
        # rally, backup (target -1 none), started turn, strengths
        self.mops_def = torch.full((B, S, NO), -1, dtype=L, device=device)
        self.mops_id = torch.full((B, S, NO), -1, dtype=L, device=device)
        self.mops_target = torch.full((B, S, NO), -1, dtype=L, device=device)
        self.mops_rally = torch.full((B, S, NO), -1, dtype=L, device=device)
        self.mops_bk_target = torch.full((B, S, NO), -1, dtype=L, device=device)
        self.mops_bk_rally = torch.full((B, S, NO), -1, dtype=L, device=device)
        self.mops_started = torch.full((B, S, NO), -1, dtype=L, device=device)
        self.mops_estr = torch.zeros(B, S, NO, dtype=L, device=device)
        self.mops_str = torch.zeros(B, S, NO, dtype=L, device=device)
        # the tree's run: node statuses, the two memories, the tagged data
        self.mops_st = torch.zeros(B, S, NO, N, dtype=L, device=device)
        self.mops_ma = torch.full((B, S, NO, N), NONE, dtype=L, device=device)
        self.mops_mb = torch.full((B, S, NO, N), NONE, dtype=L, device=device)
        self.mops_bb = torch.full((B, S, NO, NT), NONE, dtype=L, device=device)
        # the teams: the definition's team (-1 none), members (major pool
        # slots in join order, -1 padded), per requirement the members
        # carrying its AI type, the goals, engaged, minimums met, ready,
        # ongoing, the unit to build (AI unit row, -1 none), the strength
        self.mops_tm = torch.full((B, S, NO, NTM), -1, dtype=L, device=device)
        self.mops_mem = torch.full((B, S, NO, NTM, NM), -1, dtype=L, device=device)
        self.mops_cnt = torch.zeros(B, S, NO, NTM, NR, dtype=L, device=device)
        self.mops_goal = torch.full((B, S, NO, NTM, 6), -1, dtype=L, device=device)
        self.mops_eng = torch.zeros(B, S, NO, NTM, dtype=torch.bool, device=device)
        self.mops_mins = torch.zeros(B, S, NO, NTM, dtype=torch.bool, device=device)
        self.mops_ready = torch.zeros(B, S, NO, NTM, dtype=torch.bool, device=device)
        self.mops_ong = torch.zeros(B, S, NO, NTM, dtype=torch.bool, device=device)
        self.mops_unit = torch.full((B, S, NO, NTM), -1, dtype=L, device=device)
        self.mops_tstr = torch.zeros(B, S, NO, NTM, dtype=L, device=device)
        # the units each team has taken in (its join's second list, team +0x58)
        self.mops_join = torch.zeros(B, S, NO, NTM, dtype=L, device=device)
        # Operation Move's stores: per move node per team the members held out
        # and the goal they are held for (-1 none: no store yet)
        self.mops_mvs = torch.zeros(B, S, NO, N_MOVES, NTM, P, dtype=torch.bool, device=device)
        self.mops_mvg = torch.full((B, S, NO, N_MOVES, NTM), -1, dtype=L, device=device)
        # the pool's free slots, the last freed on top; its size
        self.mops_free = torch.full((B, S, NO), -1, dtype=L, device=device)
        self.mops_nfree = torch.zeros(B, S, dtype=L, device=device)
        self.mops_size = torch.zeros(B, S, dtype=L, device=device)
        # the military AI's pick to start at the run: definition (-1 none),
        # target, rally
        self.mops_pick = torch.full((B, S), -1, dtype=L, device=device)
        self.mops_pick_target = torch.full((B, S), -1, dtype=L, device=device)
        self.mops_pick_rally = torch.full((B, S), -1, dtype=L, device=device)
        # the camps the knowledge base holds, in its order (-1 padded)
        self.mops_camps = torch.full((B, S, N_CAMPS), -1, dtype=L, device=device)
        # the plots its knowledge base's looks have seen or a meeting revealed
        # (`CityState.revealed`)
        self.mops_revealed = torch.zeros(B, S, self.T, dtype=torch.bool, device=device)

    # -- the minor's units --------------------------------------------------

    def _mops_units(self, s: int) -> dict:
        """minor `s`'s units as its operations read them (`MajorUnitView`),
        over the majors' pool [B, P]: alive and its own, the pool order's key
        (its pool slot, an unslotted unit as slot 0, the pool's order among
        equals), its AI unit row, plot, combat, ranged and bombard strengths,
        base range, damage, Movement left (in the pool's scale and whole),
        base Movement"""
        seat = 100 + s
        P = self.major_unit_alive.shape[1]
        dev = self.device
        own = self.major_unit_alive & (self.major_unit_seat == seat)
        ut = self.major_unit_type.clamp(min=0, max=self.NU - 1)
        key = self.major_unit_pslot.clamp(min=0) * P + torch.arange(P, device=dev).unsqueeze(0)
        er = self._cv_tables()["engine_row"].to(dev)
        row = er.take(ut)
        hp_max = int(self.rules.combat["unitHp"])
        naval = self.unit_naval.take(ut)
        base = self._type_moves.take(ut)
        emb = self.major_unit_emb & ~naval
        if bool(emb.any()):
            techs = self.citystate_techs[:, s]
            extra = torch.zeros(self.B, dtype=torch.long, device=dev)
            for t, v in self._embark_move_techs:
                if t >= 0:
                    extra = extra + techs[:, t].long() * v
            base = torch.where(emb, self._embark_moves + extra.unsqueeze(1), base)
        mp = self.major_unit_mp
        return {
            "own": own, "key": key, "row": row, "tile": self.major_unit_tile,
            "combat": self._ai_combat("major"), "ranged": self._type_ranged_strength.take(ut),
            "bombard": self._type_bombard.take(ut), "range": self._type_ranged_range.take(ut),
            "dmg": hp_max - self.major_unit_hp, "mp": mp, "mp_whole": torch.div(mp, self._mp_scale, rounding_mode="floor"),
            "base_moves": base,
        }

    def _mops_in_order(self, mask: torch.Tensor, key: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """the slots of `mask` [B, P] in the order of `key`: [B, M] (-1 past
        each game's count) and the counts [B]"""
        big = 1 << 50
        k = torch.where(mask, key, torch.full_like(key, big))
        o = k.argsort(dim=1, stable=True)
        n = mask.sum(dim=1)
        M = max(int(n.max()) if n.numel() else 0, 1)
        o = o[:, :M]
        return torch.where(torch.arange(M, device=self.device).unsqueeze(0) < n.unsqueeze(1), o, torch.full_like(o, -1)), n

    @staticmethod
    def _mops_strength(u: dict) -> torch.Tensor:
        """a member's strength (0x73fba0): the larger of its combat and
        ranged strengths less a tenth of its damage"""
        return torch.maximum(u["combat"], u["ranged"]) - torch.div(u["dmg"], 10, rounding_mode="floor")

    @staticmethod
    def _mops_army_term(combat: torch.Tensor, ranged: torch.Tensor, dmg: torch.Tensor) -> torch.Tensor:
        """a unit in the knowledge base's army strength (0x5eadb0): its larger
        of combat and ranged strength, less its damage x 10 x -0.01 (single
        precision) cut toward 0"""
        c = float(torch.tensor(-0.01, dtype=_F32))
        t = (dmg.to(torch.float64) * 10.0 * c).to(_F32).to(torch.float64).trunc().long()
        return torch.maximum(combat, ranged) + t

    # -- the knowledge base --------------------------------------------------

    def _mops_camps_look(self, s: int, sight: torch.Tensor, alive: torch.Tensor) -> None:
        """`minorCampsLook` on minor `s`'s camps where `alive`: the plots it
        sees join its revealed ones (`mops_revealed`); a camp whose plot it
        has revealed with none there dropped, each camp on a plot it has
        revealed added in plot order (`lookCamps`)"""
        T = self.T
        dev = self.device
        self.mops_revealed[:, s] |= sight & alive.unsqueeze(1)
        sight = self.mops_revealed[:, s]
        now = torch.zeros(self.B, T + 1, dtype=torch.bool, device=dev)
        cp = self.camp_tile
        now.scatter_(1, torch.where(cp >= 0, cp, T), True)
        now = now[:, :T]
        known = self.mops_camps[:, s]
        kc = known.clamp(min=0)
        keep = (known >= 0) & (~sight.gather(1, kc) | now.gather(1, kc))
        held = torch.zeros(self.B, T + 1, dtype=torch.bool, device=dev)
        held.scatter_(1, torch.where(keep, known, T), True)
        add = sight & now & ~held[:, :T]
        big = 1 << 40
        ar = torch.arange(N_CAMPS, device=dev).unsqueeze(0)
        kkey = torch.where(keep, ar, torch.full_like(known, big))
        akey = torch.where(add, self._arange_bt + N_CAMPS, torch.full_like(self._arange_bt, big))
        allk = torch.cat((kkey, akey), dim=1)
        vals = torch.cat((known, self._arange_bt), dim=1)
        o = allk.argsort(dim=1, stable=True)
        n = (allk < big).sum(dim=1)
        assert int(n.max()) <= N_CAMPS, "minor operations: raise N_CAMPS"
        new = vals.gather(1, o[:, :N_CAMPS])
        new = torch.where(ar < n.unsqueeze(1), new, torch.full_like(new, -1))
        self.mops_camps[:, s] = torch.where(alive.unsqueeze(1), new, known)

    def _mops_records(self, s: int) -> dict:
        """minor `s`'s knowledge base's army records ([B, K]): live, owner,
        AI unit row, plot, combat and ranged strengths, damage"""
        T = self._cv_tables()
        dev = self.device
        slot = self.citystate_kb_slot[:, s]
        typ = self.citystate_kb_type[:, s].long()
        er = T["engine_row"].to(dev)
        tc = typ.clamp(min=0, max=self.NU - 1)
        live = slot != -2
        return {"live": live, "owner": self.citystate_kb_owner[:, s].long(),
                "row": torch.where(typ >= 0, er.take(tc), torch.full_like(typ, -1)),
                "plot": self.citystate_kb_plot[:, s].long(),
                "combat": self._type_combat.take(tc), "ranged": self._type_ranged_strength.take(tc),
                "dmg": self.citystate_kb_damage[:, s].long()}

    # -- the unit production entries ----------------------------------------

    def _mops_unit_rows(self, s: int, u: dict) -> dict:
        """`seatUnitRows` for minor `s` (the military AI's unit production
        entries as the unit choice reads them, `unitProductionEntries`): per
        AI unit row [B, NU] the entry, obsolete, buildable, the at-war and
        every player's sums (24.8), the strength"""
        T = self._cv_tables()
        rows = T["unit_rows"]
        E = T["engine"]
        B, dev = self.B, self.device
        nu = len(rows)
        cache = getattr(self, "_mops_rows_static", None)
        if cache is None:
            version = torch.tensor([bool(r["canTrain"]) and not r["trait"] and not r["majorOnly"] for r in rows], dtype=torch.bool, device=dev)
            combat = torch.tensor([r["combat"] != 0 and (not r["pseudo"] or r["pseudo"] in
                                                         ("PSEUDOYIELD_UNIT_COMBAT", "PSEUDOYIELD_UNIT_NAVAL_COMBAT",
                                                          "PSEUDOYIELD_UNIT_AIR_COMBAT")) for r in rows],
                                  dtype=torch.bool, device=dev)
            strength = torch.tensor([max(int(r["combat"]), int(r["rangedCombat"])) for r in rows], dtype=torch.long, device=dev)
            res = torch.tensor([E["resource"].get(r["resource"], -2) if r["resource"] else -1 for r in rows], dtype=torch.long, device=dev)
            cache = self._mops_rows_static = {"version": version, "combat": combat, "strength": strength, "res": res}
        techs, civics = self.citystate_techs[:, s], self.citystate_civics[:, s]

        def holds(nm: str) -> torch.Tensor:
            ti = E["tech"].get(nm, -1)
            ci = E["civic"].get(nm, -1)
            out = torch.zeros(B, dtype=torch.bool, device=dev)
            if nm.startswith("TECH_") and ti >= 0:
                out = out | techs[:, ti]
            if nm.startswith("CIVIC_") and ci >= 0:
                out = out | civics[:, ci]
            return out
        obsolete = torch.zeros(B, nu, dtype=torch.bool, device=dev)
        buildable = torch.ones(B, nu, dtype=torch.bool, device=dev)
        for k, r in enumerate(rows):
            for nm in r["obsolete"]:
                obsolete[:, k] |= holds(nm)
            for nm in (r["tech"], r["civic"]):
                if nm:
                    buildable[:, k] &= holds(nm)
        # a StrategicResource the minor owns a plot of
        res = cache["res"]
        if bool((res >= 0).any()):
            seat = 100 + s
            mine = self.tile_seat == seat
            for k in (res >= 0).nonzero(as_tuple=True)[0].tolist():
                buildable[:, k] &= (mine & (self.res_id == int(res[k]))).any(dim=1)
        buildable &= res != -2
        # the minor's own units by row
        own = torch.zeros(B, nu + 1, dtype=torch.long, device=dev)
        own.scatter_add_(1, torch.where(u["own"] & (u["row"] >= 0), u["row"], torch.full_like(u["row"], nu)), u["own"].long())
        own = own[:, :nu]
        entry = cache["version"].unsqueeze(0) & ~(obsolete & (own <= 0))
        rec = self._mops_records(s)
        live = rec["live"] & (rec["row"] >= 0)
        n_all = torch.zeros(B, nu + 1, dtype=torch.long, device=dev)
        n_all.scatter_add_(1, torch.where(live, rec["row"], torch.full_like(rec["row"], nu)), live.long())
        n_all = n_all[:, :nu]
        row = self._CITY_MINOR0 + s
        orow = self._seat_row.take(rec["owner"].clamp(min=0, max=self._seat_row.numel() - 1))
        war = live & (rec["owner"] >= 0) & self.war[:, row].gather(1, orow)
        n_war = torch.zeros(B, nu + 1, dtype=torch.long, device=dev)
        n_war.scatter_add_(1, torch.where(war, rec["row"], torch.full_like(rec["row"], nu)), war.long())
        n_war = n_war[:, :nu]
        opp = cache["combat"].unsqueeze(0) & ~obsolete & (n_all > 0)
        n_all = torch.where(opp, n_all, torch.zeros_like(n_all))
        n_war = torch.where(opp, n_war, torch.zeros_like(n_war))
        eff_t = T["eff"].to(dev).t()                                  # [opposing, entry]
        return {"entry": entry, "obsolete": obsolete, "buildable": buildable, "all": n_all @ eff_t, "war": n_war @ eff_t,
                "strength": cache["strength"].unsqueeze(0).expand(B, -1)}

    def _mops_fits(self, rows: dict, need: torch.Tensor, full: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """per entry [B, NU]: it may be chosen for the team's needed types
        `need` and full ones `full` ([B, NAT]) — standing, of a needed type, of
        no full one — and whether a needed type it carries is a Priority one"""
        Tm = self._mops_tables()
        ua = Tm.unit_ai.to(self.device).to(torch.long)                  # [NU, NAT]
        pr = Tm.prio.to(self.device)
        matched = (need.long() @ ua.t()) > 0
        prio = ((need & pr.unsqueeze(0)).long() @ ua.t()) > 0
        fullh = (full.long() @ ua.t()) > 0
        ok = rows["entry"] & rows["buildable"] & ~rows["obsolete"] & matched & ~fullh
        return ok, prio & ok

    def _mops_choose(self, rows: dict, need: torch.Tensor, full: torch.Tensor, mask: torch.Tensor) -> torch.Tensor:
        """`chooseUnit` (0x79bd30) against no player: [B] the AI unit row the
        team asks to be built, -1 none"""
        B, dev = self.B, self.device
        ok, prio = self._mops_fits(rows, need, full)
        ok &= mask.unsqueeze(1)
        nu = ok.shape[1]
        order = torch.arange(nu, device=dev).unsqueeze(0).expand(B, -1)
        for keyv in (rows["strength"], rows["all"], rows["war"], rows["buildable"].long(), rows["entry"].long()):
            kk = keyv.gather(1, order)
            idx = torch.sort(kk, dim=1, descending=True, stable=True).indices
            order = order.gather(1, idx)
        chosen = torch.full((B,), -1, dtype=torch.long, device=dev)
        cprio = torch.zeros(B, dtype=torch.bool, device=dev)
        call = torch.zeros(B, dtype=torch.long, device=dev)
        cwar = torch.zeros(B, dtype=torch.long, device=dev)
        okk = ok.gather(1, order)
        cols = okk.any(dim=0).nonzero(as_tuple=True)[0].tolist()
        for j in cols:
            e = order[:, j]
            f = okk[:, j]
            p = prio.gather(1, e.unsqueeze(1)).squeeze(1)
            a = rows["all"].gather(1, e.unsqueeze(1)).squeeze(1)
            w = rows["war"].gather(1, e.unsqueeze(1)).squeeze(1)
            take = f & ~(cprio & ~p)
            has = chosen >= 0
            take &= ~has | (p & ~cprio) | ((a > call) & (w > cwar))
            chosen = torch.where(take, e, chosen)
            cprio = torch.where(take, p, cprio)
            call = torch.where(take, a, call)
            cwar = torch.where(take, w, cwar)
        return chosen

    def _mops_keep(self, rows: dict, unit: torch.Tensor, need: torch.Tensor, full: torch.Tensor) -> torch.Tensor:
        """`keepUnit` (0x79cba0): the unit still one the choice could take"""
        ok, _p = self._mops_fits(rows, need, full)
        return (unit >= 0) & ok.gather(1, unit.clamp(min=0).unsqueeze(1)).squeeze(1)

    # -- the teams ------------------------------------------------------------

    def _mops_member_mask(self, s: int, k: int, ti: int) -> torch.Tensor:
        """[B, P] the team's listed members"""
        P = self.major_unit_alive.shape[1]
        m = self.mops_mem[:, s, k, ti]
        out = torch.zeros(self.B, P + 1, dtype=torch.bool, device=self.device)
        out.scatter_(1, torch.where(m >= 0, m, P), True)
        return out[:, :P]

    def _mops_add_member(self, s: int, k: int, ti: int, uid: torch.Tensor, mask: torch.Tensor) -> None:
        """`addMember` where `mask`: the unit [B] joins the team's members, each
        requirement it carries counting it"""
        m = mask & (uid >= 0)
        if not bool(m.any()):
            return
        mem = self.mops_mem[:, s, k, ti]
        has = (mem == uid.unsqueeze(1)).any(dim=1)
        m = m & ~has
        if not bool(m.any()):
            return
        free = mem < 0
        assert bool(free.any(dim=1)[m].all()), "minor operations: raise N_MEMBERS"
        j = free.long().argmax(dim=1)
        rows = m.nonzero(as_tuple=True)[0]
        mem[rows, j[rows]] = uid[rows]
        self.mops_join[rows, s, k, ti] += 1
        Tm = self._mops_tables()
        d = self.mops_def[:, s, k]
        tm = self.mops_tm[:, s, k, ti]
        er = self._cv_tables()["engine_row"].to(self.device)
        urow = er.take(self.major_unit_type.gather(1, uid.clamp(min=0).unsqueeze(1)).squeeze(1).clamp(min=0, max=self.NU - 1))
        ua = Tm.unit_ai.to(self.device)
        for dd, ts in Tm.team_reqs.items():
            for tj, tr in enumerate(ts):
                g = m & (d == dd) & (tm == tj)
                if not bool(g.any()):
                    continue
                has_t = ua[urow.clamp(min=0)][:, tr["type"].to(self.device)] & (urow >= 0).unsqueeze(1)   # [B, R]
                cnt = self.mops_cnt[:, s, k, ti, :tr["n"]]
                cnt += (has_t & g.unsqueeze(1)).long()

    def _mops_team_update(self, s: int, k: int, ti: int, live: torch.Tensor, u: dict, rows: dict) -> None:
        """`teamUpdate` (0x73fba0) of team `ti` of slot `k` where `live`: the
        counts, the strength, the minimums, ready and ongoing against the
        enemy strength about the target, the unit to build"""
        Tm = self._mops_tables()
        dev = self.device
        B = self.B
        d = self.mops_def[:, s, k]
        tm = self.mops_tm[:, s, k, ti]
        on = live & (tm >= 0)
        if not bool(on.any()):
            return
        memm = self._mops_member_mask(s, k, ti)
        alive = memm & u["own"]
        n = (self.mops_mem[:, s, k, ti] >= 0).sum(dim=1)
        ua = Tm.unit_ai.to(dev)
        urow = u["row"].clamp(min=0)
        strength = torch.where(alive, self._mops_strength(u), torch.zeros_like(u["combat"])).sum(dim=1)
        estr = self.mops_estr[:, s, k]
        ours = self.citystate_best_melee[:, s].long()
        NAT = len(Tm.ai_types)
        for dd, ts in Tm.team_reqs.items():
            for tj, tr in enumerate(ts):
                g = on & (d == dd) & (tm == tj)
                if not bool(g.any()):
                    continue
                assert all(x is None for x in tr["dep"]), "minor operations: a team requirement's Dependence"
                R = tr["n"]
                tix = tr["type"].to(dev)
                carries = ua[urow][:, :, tix] & alive.unsqueeze(2) & (u["row"] >= 0).unsqueeze(2)   # [B, P, R]
                cnt = carries.sum(dim=1)                                                          # [B, R]
                self.mops_cnt[:, s, k, ti, :R] = torch.where(g.unsqueeze(1), cnt, self.mops_cnt[:, s, k, ti, :R])
                need = torch.zeros(B, NAT, dtype=torch.bool, device=dev)
                have = torch.zeros(B, NAT, dtype=torch.bool, device=dev)
                full = torch.zeros(B, NAT, dtype=torch.bool, device=dev)
                mins = torch.ones(B, dtype=torch.bool, device=dev)
                nf = n.to(torch.float64)
                for i in range(R):
                    c = cnt[:, i]
                    t = int(tix[i])
                    mn, mx = int(tr["min"][i]), int(tr["max"][i])
                    mp_, xp_ = float(tr["minp"][i]), float(tr["maxp"][i])
                    if mn >= 0:
                        mins &= c >= mn
                        lack = c < mn
                    else:
                        want = _f(nf * mp_)
                        mins &= c >= want.trunc().long()
                        lack = want > c.to(torch.float64)
                    need[:, t] |= lack
                    have[:, t] |= ~lack
                    if mx >= 0:
                        full[:, t] |= c >= mx
                    else:
                        full[:, t] |= (c + 1).to(torch.float64) > _f((nf + 1) * xp_)
                tdef = Tm.teams[dd][tj]
                was = self.mops_ready[:, s, k, ti].clone()

                def reaches(adv: float) -> torch.Tensor:
                    if adv <= -5:
                        des = -estr.to(torch.float64)
                    else:
                        des = adv * ours.to(torch.float64)
                    return strength >= (estr.to(torch.float64) + des).trunc().long()
                ia, oa = float(tdef["initialStrengthAdvantage"]), float(tdef["ongoingStrengthAdvantage"])
                ready = mins & (torch.ones_like(mins) if ia == 0 else reaches(ia))
                ong = ready & (torch.ones_like(mins) if oa == 0 else reaches(oa))
                self.mops_tstr[:, s, k, ti] = torch.where(g, strength, self.mops_tstr[:, s, k, ti])
                self.mops_mins[:, s, k, ti] = torch.where(g, mins, self.mops_mins[:, s, k, ti])
                self.mops_ready[:, s, k, ti] = torch.where(g, ready, self.mops_ready[:, s, k, ti])
                self.mops_ong[:, s, k, ti] = torch.where(g, ong, self.mops_ong[:, s, k, ti])
                wanted = torch.where(need.any(dim=1, keepdim=True), need, have)
                old = self.mops_unit[:, s, k, ti]
                keep = (old >= 0) & (was == ready) & self._mops_keep(rows, old, wanted, full)
                unit = torch.where(keep, old, torch.full_like(old, -1))
                again = g & ((unit < 0) | (was != ready))
                if bool(again.any()):
                    unit = torch.where(again, self._mops_choose(rows, wanted, full, again), unit)
                self.mops_unit[:, s, k, ti] = torch.where(g, unit, old)

    def _mops_update_team(self, s: int, k: int, ti: int, live: torch.Tensor, u: dict, tg: dict) -> None:
        """`updateTeam` (0x738f20) of team `ti` of slot `k` where `live`: the
        members' centre (goal 3), the march point (goal 5: the target, the
        operation against no enemy) and, with targets of the list within twice
        a member's base Movement of it, the battle line (goal 4), engaged"""
        dev = self.device
        B, T, W = self.B, self.T, self.W
        on = live & (self.mops_tm[:, s, k, ti] >= 0)
        if not bool(on.any()):
            return
        memm = self._mops_member_mask(s, k, ti) & u["own"]
        n = memm.sum(dim=1)
        tile = u["tile"].clamp(min=0)
        x = tile % W
        y = torch.div(tile, W, rounding_mode="floor")
        q = x - torch.div(y, 2, rounding_mode="floor")
        sq = torch.where(memm, q, torch.zeros_like(q)).sum(dim=1)
        sy = torch.where(memm, y, torch.zeros_like(y)).sum(dim=1)
        self.mops_eng[:, s, k, ti] &= ~on
        go = on & (n > 0)
        if not bool(go.any()):
            return
        nn = n.clamp(min=1)
        cq = torch.where(sq >= 0, torch.div(sq, nn, rounding_mode="floor"), -torch.div(-sq, nn, rounding_mode="floor"))
        cy = torch.div(sy, nn, rounding_mode="floor")

        def plot_at(px: torch.Tensor, py: torch.Tensor) -> torch.Tensor:
            ok = (px >= 0) & (px < W) & (py >= 0) & (py < self.H)
            return torch.where(ok, py * W + px, torch.full_like(px, -1))
        g = self.mops_goal[:, s, k, ti]
        g[:, G_CENTRE] = torch.where(go, plot_at(cq + torch.div(cy, 2, rounding_mode="floor"), cy), g[:, G_CENTRE])
        g[:, G_MARCH] = torch.where(go, g[:, G_TARGET], g[:, G_MARCH])
        # the list's weighed entries: a plot's district entry (COMBAT or
        # PASSIVE) and each of its unit entries one
        ent = (tg["dk"] > 0).long() + (tg["uk"] > 0).view(B, -1, T).sum(dim=1)     # [B, T]
        reach = 2 * u["base_moves"]
        near = torch.zeros(B, T, dtype=torch.bool, device=dev)
        for j in memm.any(dim=0).nonzero(as_tuple=True)[0].tolist():
            mj = memm[:, j]
            dq = self.pair_dist[tile[:, j]].to(torch.long)
            near |= mj.unsqueeze(1) & (dq <= reach[:, j].unsqueeze(1))
        cnt = torch.where(near, ent, torch.zeros_like(ent))
        nt = cnt.sum(dim=1)
        eng = go & (nt > 0)
        if not bool(eng.any()):
            return
        self.mops_eng[:, s, k, ti] |= eng
        ax = self._arange_bt % W
        ay = torch.div(self._arange_bt, W, rounding_mode="floor")
        aq = ax - torch.div(ay, 2, rounding_mode="floor")
        tq = (cnt * aq).sum(dim=1)
        ty = (cnt * ay).sum(dim=1)
        ntc = nt.clamp(min=1)
        u32 = 1 << 32
        uq = torch.remainder(tq, u32)
        avq = torch.div(uq, ntc, rounding_mode="floor")
        avq = torch.where(avq >= (1 << 31), avq - u32, avq)
        avy = torch.div(torch.remainder(ty, u32), ntc, rounding_mode="floor")
        avy = torch.where(avy >= (1 << 31), avy - u32, avy)

        def trunc2(a: torch.Tensor) -> torch.Tensor:
            return torch.where(a >= 0, torch.div(a, 2, rounding_mode="floor"), -torch.div(-a, 2, rounding_mode="floor"))
        bq = trunc2(avq + cq)
        by = trunc2(avy + cy)
        g[:, G_LINE] = torch.where(eng, plot_at(bq + torch.div(by, 2, rounding_mode="floor"), by), g[:, G_LINE])

    def _ops_counted(self, seat: int, other: torch.Tensor, enemy: torch.Tensor) -> torch.Tensor:
        """the players an operation of `seat` against `enemy` [B] (-1 none)
        counts in its enemy strength (0x73eb60): its enemy, else every player
        at war with it (the barbarians with everyone); `other` [B, N] seats"""
        oc = other.clamp(min=0)
        rows = self._seat_row.to(self.device)[oc.clamp(max=self._seat_row.numel() - 1)]
        war = self.war[:, int(self._seat_row[seat])].gather(1, rows)
        barb = (other == BARB_SEAT) | (seat == BARB_SEAT)
        e = enemy.unsqueeze(1)
        return (other >= 0) & (other != seat) & ((other == e) | ((e < 0) & (war | barb)))

    def _ops_enemy_str(self, seat: int, r: int, target: torch.Tensor, enemy: torch.Tensor) -> torch.Tensor:
        """[B] `enemyStrengthAbout` (0x73eb60) for an operation of `seat` (its
        knowledge base row `r`) on `target` against `enemy` [B]: of the
        players it counts the army records within 3 of the target (0x5eadb0),
        then each known city within 3 its defense (0x5eb2c0 without its byte:
        its centre's defense, less 10 without walls, 0 at least), the first of
        them with a defense above 0, where the enemy is none or a major, the
        shortfall of the enemy's records' strength there below its owner's best
        combat strength (PlayerStats +0xf0)"""
        B, dev = self.B, self.device
        tc = target.clamp(min=0)
        on = target >= 0
        rec = self._mops_records(r)
        rd = self.pair_dist[rec["plot"].clamp(min=0), tc.unsqueeze(1)].to(torch.long)
        near = rec["live"] & (rec["plot"] >= 0) & (rd <= 3) & on.unsqueeze(1)
        term = self._mops_army_term(rec["combat"], rec["ranged"], rec["dmg"])
        counted = near & self._ops_counted(seat, rec["owner"], enemy)
        strength = torch.where(counted, term, torch.zeros_like(term)).sum(dim=1)
        theirs = near & (rec["owner"] == enemy.unsqueeze(1)) & (enemy >= 0).unsqueeze(1)
        enemy_units = torch.where(theirs, term, torch.zeros_like(term)).sum(dim=1)
        garrison = (enemy >= 0) & (enemy >= self.n_majors)
        known = self._tac_known(seat)
        bidx = self._bidx
        order = list(range(self.n_majors)) + [self._CITY_MINOR0 + s for s in range(self.S)] + [self.FREE_ROW]
        for row in order:
            hseat = int(self._ROW_SEAT[row])
            cnt = self._ops_counted(seat, torch.full((B, 1), hseat, dtype=torch.long, device=dev), enemy).squeeze(1) & on
            if not bool(cnt.any()):
                continue
            minor = self._CITY_MINOR0 <= row < self._CITY_MINOR0 + self.S
            for c in range(1 if minor else self.city_alive.shape[2]):
                ctr = self.city_center[:, row, c]
                m = cnt & self.city_alive[:, row, c] & (ctr >= 0)
                if not bool(m.any()):
                    continue
                cc = ctr.clamp(min=0)
                if known is not None:
                    m &= known.gather(1, cc.unsqueeze(1)).squeeze(1)
                m &= self.pair_dist[cc, tc].to(torch.long) <= 3
                if not bool(m.any()):
                    continue
                col = torch.full((B,), c, dtype=torch.long, device=dev)
                rt = torch.full_like(col, row)
                pool = torch.minimum(self.city_outer_hp[bidx, row, col].long(), self._walls_max_at(rt, col).long())
                d = self._city_defense_cs(rt, col)[0].to(torch.float64)
                cdef = torch.where(pool > 0, d, (d - 10).clamp(min=0)).trunc().long()
                strength = strength + torch.where(m, cdef, torch.zeros_like(cdef))
                g = m & (cdef > 0) & ~garrison
                if bool(g.any()):
                    if row < self.n_majors:
                        best = self.civ_best_melee[:, row].long()
                    elif minor:
                        best = self.citystate_best_melee[:, row - self._CITY_MINOR0].long()
                    else:
                        best = self.free_best_melee.long()
                    strength = strength + torch.where(g & (enemy_units < best), best - enemy_units, torch.zeros_like(best))
                    garrison = garrison | g
        return strength

    def _mops_refresh(self, s: int, k: int, live: torch.Tensor, u: dict, rows: dict, tg: dict) -> None:
        """`refreshStrengths` of slot `k` where `live`: the enemy strength
        about the target, each team's update, the teams' strength summed"""
        on = live & (self.mops_def[:, s, k] >= 0)
        if not bool(on.any()):
            return
        tgt = self.mops_target[:, s, k]
        self.mops_estr[:, s, k] = torch.where(on, self._ops_enemy_str(100 + s, s, tgt, torch.full_like(tgt, -1)), self.mops_estr[:, s, k])
        for ti in range(N_TEAMS):
            self._mops_team_update(s, k, ti, on, u, rows)
            self._mops_update_team(s, k, ti, on, u, tg)
        tot = torch.where(self.mops_tm[:, s, k] >= 0, self.mops_tstr[:, s, k], torch.zeros_like(self.mops_tstr[:, s, k])).sum(dim=1)
        self.mops_str[:, s, k] = torch.where(on, tot, self.mops_str[:, s, k])

    # -- the pool -------------------------------------------------------------

    def _mops_start(self, s: int, d: int, target: torch.Tensor, rally: torch.Tensor, mask: torch.Tensor) -> torch.Tensor:
        """`startOperation` (0x73a120) of definition `d` where `mask`: a pool
        slot (the one freed last, else a new one), its tree's id the city AI's
        next, its teams (a team's Condition: IsCoastalTarget, water within 1
        of the target), target and rally, its tree fresh. [B] its id (-1 none)"""
        B, dev = self.B, self.device
        m = mask.clone()
        if not bool(m.any()):
            return torch.full((B,), -1, dtype=torch.long, device=dev)
        Tm = self._mops_tables()
        ai = self.cityai
        tid = ai.t_serial[:, s].clone()
        ai.t_serial[:, s] += m.long()
        nf = self.mops_nfree[:, s]
        use_free = m & (nf > 0)
        top = self.mops_free[:, s].gather(1, (nf - 1).clamp(min=0).unsqueeze(1)).squeeze(1)
        k = torch.where(use_free, top, self.mops_size[:, s])
        self.mops_nfree[:, s] = torch.where(use_free, nf - 1, nf)
        self.mops_size[:, s] = torch.where(m & ~use_free, self.mops_size[:, s] + 1, self.mops_size[:, s])
        assert int(self.mops_size[:, s].max()) <= N_OPS, "minor operations: raise N_OPS"
        tgt = target if torch.is_tensor(target) else torch.full((B,), int(target), dtype=torch.long, device=dev)
        ral = rally if torch.is_tensor(rally) else torch.full((B,), int(rally), dtype=torch.long, device=dev)
        coastal = (self.water & (self.pair_dist[tgt.clamp(min=0)] <= 1)).any(dim=1) & (tgt >= 0)
        for kk in range(N_OPS):
            g = m & (k == kk)
            if not bool(g.any()):
                continue
            rows = g.nonzero(as_tuple=True)[0]
            self.mops_def[rows, s, kk] = d
            self.mops_id[rows, s, kk] = tid[rows]
            self.mops_target[rows, s, kk] = tgt[rows]
            self.mops_rally[rows, s, kk] = ral[rows]
            self.mops_bk_target[rows, s, kk] = -1
            self.mops_bk_rally[rows, s, kk] = -1
            self.mops_started[rows, s, kk] = int(self.turn)
            self.mops_estr[rows, s, kk] = 0
            self.mops_str[rows, s, kk] = 0
            self.mops_st[rows, s, kk] = BT_FRESH
            self.mops_ma[rows, s, kk] = NONE
            self.mops_mb[rows, s, kk] = NONE
            self.mops_bb[rows, s, kk] = NONE
            self.mops_tm[rows, s, kk] = -1
            self.mops_mem[rows, s, kk] = -1
            self.mops_cnt[rows, s, kk] = 0
            self.mops_goal[rows, s, kk] = -1
            self.mops_eng[rows, s, kk] = False
            self.mops_mins[rows, s, kk] = False
            self.mops_ready[rows, s, kk] = False
            self.mops_ong[rows, s, kk] = False
            self.mops_unit[rows, s, kk] = -1
            self.mops_tstr[rows, s, kk] = 0
            self.mops_join[rows, s, kk] = 0
            self.mops_mvs[rows, s, kk] = False
            self.mops_mvg[rows, s, kk] = -1
            # the definition's teams, those whose Condition holds, in order
            ti = torch.zeros(rows.numel(), dtype=torch.long, device=dev)
            for tj, t in enumerate(Tm.teams[d]):
                ok = torch.ones_like(ti, dtype=torch.bool)
                if t["condition"] == "IsCoastalTarget":
                    ok = coastal[rows]
                elif t["condition"]:
                    ok = torch.zeros_like(ok)
                for slot in range(N_TEAMS):
                    put = ok & (ti == slot)
                    if bool(put.any()):
                        r2 = rows[put]
                        self.mops_tm[r2, s, kk, slot] = tj
                        self.mops_goal[r2, s, kk, slot, G_RALLY] = ral[r2]
                        self.mops_goal[r2, s, kk, slot, G_TARGET] = tgt[r2]
                ti = ti + ok.long()
            assert int(ti.max()) <= N_TEAMS, "minor operations: raise N_TEAMS"
        return torch.where(m, tid, torch.full_like(tid, -1))

    def _mops_end(self, s: int, k: int, mask: torch.Tensor) -> None:
        """`endOperation` of slot `k` where `mask`: the slot free, pushed on
        the free list"""
        if not bool(mask.any()):
            return
        rows = mask.nonzero(as_tuple=True)[0]
        self.mops_def[rows, s, k] = -1
        self.mops_id[rows, s, k] = -1
        self.mops_tm[rows, s, k] = -1
        self.mops_mem[rows, s, k] = -1
        nf = self.mops_nfree[rows, s]
        self.mops_free[rows, s, nf] = k
        self.mops_nfree[rows, s] = nf + 1

    def _mops_live(self, s: int, ids: torch.Tensor) -> torch.Tensor:
        """the operation of the id ([B, ...]) runs"""
        B = self.B
        flat = ids.reshape(B, -1)
        run = self.mops_def[:, s] >= 0
        hit = (self.mops_id[:, s].unsqueeze(1) == flat.unsqueeze(2)) & run.unsqueeze(1) & (flat >= 0).unsqueeze(2)
        return hit.any(-1).reshape(ids.shape)

    def _mops_busy(self, s: int) -> torch.Tensor:
        """[B, P] the units listed in any running operation of minor `s`"""
        P = self.major_unit_alive.shape[1]
        m = torch.where((self.mops_def[:, s] >= 0).unsqueeze(2).unsqueeze(3), self.mops_mem[:, s], torch.full_like(self.mops_mem[:, s], -1))
        flat = m.reshape(self.B, -1)
        out = torch.zeros(self.B, P + 1, dtype=torch.bool, device=self.device)
        out.scatter_(1, torch.where(flat >= 0, flat, P), True)
        return out[:, :P]

    def _mops_compact(self, s: int, k: int, ti: int, keep: torch.Tensor, mask: torch.Tensor) -> None:
        """the team's members kept where `keep` [B, NM] (in order) where `mask`"""
        mem = self.mops_mem[:, s, k, ti]
        kk = keep & (mem >= 0)
        o = (~kk).to(torch.int8).argsort(dim=1, stable=True)
        new = mem.gather(1, o)
        n = kk.sum(dim=1)
        new = torch.where(torch.arange(mem.shape[1], device=self.device).unsqueeze(0) < n.unsqueeze(1), new, torch.full_like(new, -1))
        self.mops_mem[:, s, k, ti] = torch.where(mask.unsqueeze(1), new, mem)

    def _mops_drop_gone(self, s: int, mask: torch.Tensor, u: dict) -> None:
        """the units gone leave their operations"""
        for k in range(N_OPS):
            on = mask & (self.mops_def[:, s, k] >= 0)
            if not bool(on.any()):
                continue
            for ti in range(N_TEAMS):
                mem = self.mops_mem[:, s, k, ti]
                alive = (mem >= 0) & u["own"].gather(1, mem.clamp(min=0))
                self._mops_compact(s, k, ti, alive, on)

    # -- the military AI's turn (B) ------------------------------------------

    def _mops_odds(self, ours: torch.Tensor, enemy: torch.Tensor, dist: torch.Tensor, best: torch.Tensor) -> torch.Tensor:
        """`oddsOf` against no enemy (single precision as the engine takes
        it): [B] float64 holding the single"""
        mine = best.clamp(min=1).to(torch.float64)
        theirs = torch.ones_like(mine)
        f09 = float(torch.tensor(0.9, dtype=_F32))
        q = _f(_f((ours - enemy).to(torch.float64)) / torch.minimum(mine, theirs))
        base = torch.minimum(torch.full_like(q, f09), _f(_f(q + 1) * 0.5))
        m075 = float(torch.tensor(-0.75, dtype=_F32))
        e = (enemy - ours).clamp(min=0) - _f(dist.to(torch.float64) * m075).trunc().long()
        Tm = self.rules.ai_operations["oddsDecay"]
        dec = getattr(self, "_mops_decay", None)
        if dec is None:
            dec = self._mops_decay = torch.tensor(Tm, dtype=torch.float64, device=self.device)
        assert int(e.max()) < dec.numel(), "minor operations: the odds' exponent past the table"
        return _f(dec.take(e.clamp(min=0)) * base)

    @staticmethod
    def _mops_fixed(odds: torch.Tensor) -> torch.Tensor:
        """`fixed`: a float as 24.8"""
        w = odds.floor()
        frac = (_f(_f(odds - w) * 256)).trunc().long() & 0xFF
        return (w.long() << 8) | frac

    def _mops_army_near(self, s: int, plot: torch.Tensor, radius: int, own: bool, u: dict) -> torch.Tensor:
        """`armyStrength` about `plot` [B] within `radius`: the minor's own
        units (`own`) or the barbarians' records of its knowledge base"""
        if own:
            m = u["own"]
            d = self.pair_dist[u["tile"].clamp(min=0), plot.clamp(min=0).unsqueeze(1)].to(torch.long)
            term = self._mops_army_term(u["combat"], u["ranged"], u["dmg"])
        else:
            r = self._mops_records(s)
            m = r["live"] & (r["owner"] == BARB_SEAT)
            d = self.pair_dist[r["plot"].clamp(min=0), plot.clamp(min=0).unsqueeze(1)].to(torch.long)
            term = self._mops_army_term(r["combat"], r["ranged"], r["dmg"])
        m = m & (d <= radius)
        return torch.where(m, term, torch.zeros_like(term)).sum(dim=1)

    def _mops_camp_eval(self, s: int, rally: torch.Tensor, preset: torch.Tensor | None, alive: torch.Tensor, u: dict):
        """`evaluate` of Attack Barb Camp from one rally [B] (`preset` its
        fixed strength, None: the own units within 10 of the rally): over the
        knowledge base's camps in order, [B] valid, target, rally"""
        Tm = self._mops_tables()
        dfn = Tm.defs[Tm.d_abc]
        B, dev = self.B, self.device
        camps = self.mops_camps[:, s]
        n = (camps >= 0).sum(dim=1)
        value = (n * 50) << 8
        best = self.citystate_best_melee[:, s].long()
        ours = preset if preset is not None else self._mops_army_near(s, rally, 10, True, u)
        tgt = torch.full((B,), -1, dtype=torch.long, device=dev)
        codds = torch.full((B,), -1.0, dtype=torch.float64, device=dev)
        valid = torch.zeros(B, dtype=torch.bool, device=dev)
        ra = rally.clamp(min=0)
        area_r = self.tile_area.gather(1, ra.unsqueeze(1)).squeeze(1)
        reg_r = self.tile_region.gather(1, ra.unsqueeze(1)).squeeze(1)
        for j in range(N_CAMPS):
            c = camps[:, j]
            on = alive & (c >= 0) & (rally >= 0)
            if not bool(on.any()):
                break
            cc = c.clamp(min=0)
            estr = 6 + self._mops_army_near(s, cc, 3, False, u)
            dd = self.pair_dist[ra, cc].to(torch.long)
            on &= dd != 0
            area_c = self.tile_area.gather(1, cc.unsqueeze(1)).squeeze(1)
            reg_c = self.tile_region.gather(1, cc.unsqueeze(1)).squeeze(1)
            lim = torch.where(area_r != area_c, torch.full_like(dd, int(dfn["maxTargetDistInWorld"])),
                              torch.where(reg_r == reg_c, torch.full_like(dd, int(dfn["maxTargetDistInRegion"])),
                                          torch.full_like(dd, int(dfn["maxTargetDistInArea"]))))
            on &= ~((lim >= 0) & (dd > lim))
            odds = self._mops_odds(ours, estr, dd, best)
            mo = float(dfn["minOddsOfSuccess"])
            if mo > 0:
                on &= odds > mo
            fo = self._mops_fixed(odds)
            fc = self._mops_fixed(codds.clamp(min=0))
            worse = (tgt >= 0) & (torch.div(fo * value, 256, rounding_mode="trunc") < torch.div(value * fc, 256, rounding_mode="trunc"))
            on &= ~worse
            tgt = torch.where(on, c, tgt)
            codds = torch.where(on, odds, codds)
            valid |= on
        return valid, tgt

    def _mops_evaluate(self, s: int) -> None:
        """`operationsEvaluate` for minor `s` (B)"""
        alive = self.citystate_alive[:, s] & (self.citystate_center[:, s] >= 0)
        if not bool(alive.any()):
            return
        Tm = self._mops_tables()
        u = self._mops_units(s)
        self._mops_drop_gone(s, alive, u)
        # the running operations' candidates name their backups, on the
        # strengths the last run refreshed (`operationsEvaluate`)
        for k in range(N_OPS):
            m = alive & (self.mops_def[:, s, k] == Tm.d_abc)
            if not bool(m.any()):
                continue
            v, t = self._mops_camp_eval(s, self.mops_target[:, s, k], self.mops_str[:, s, k], m, u)
            ok = m & v
            self.mops_bk_target[:, s, k] = torch.where(ok, t, self.mops_bk_target[:, s, k])
            self.mops_bk_rally[:, s, k] = torch.where(ok, self.mops_target[:, s, k], self.mops_bk_rally[:, s, k])
        # the new candidate that starts itself, under the trait's limits
        centre = self.citystate_center[:, s]
        v, t = self._mops_camp_eval(s, centre, None, alive, u)
        typ = Tm.defs[Tm.d_abc]["operationType"]
        same = torch.zeros_like(alive, dtype=torch.long)
        for dd, dfn in enumerate(Tm.defs):
            if dfn["operationType"] == typ:
                same += (self.mops_def[:, s] == dd).sum(dim=1)
        ok = alive & v & (same < Tm.limits.get(typ, 0))
        self.mops_pick[:, s] = torch.where(alive, torch.where(ok, Tm.d_abc, -1), self.mops_pick[:, s])
        self.mops_pick_target[:, s] = torch.where(ok, t, self.mops_pick_target[:, s])
        self.mops_pick_rally[:, s] = torch.where(ok, centre, self.mops_pick_rally[:, s])

    # -- the operations' run (C) ------------------------------------------------

    def _mops_run(self, s: int, act: torch.Tensor, op: dict, done: torch.Tensor) -> None:
        """`operationsRun` for minor `s` in its pass (`op` the pass's opening,
        `done` its units' turns): each running operation refreshed, the pick
        started, the trees in slot order; the operations' units' turns end"""
        Tm = self._mops_tables()
        on = act & ((self.mops_def[:, s] >= 0).any(dim=1) | (self.mops_pick[:, s] >= 0))
        if not bool(on.any()):
            return
        tg = op["tg"] if op["tg"] is not None else self._tac_targets(100 + s, s)
        view = {"op": op, "done": done, "tg": tg, "rows": None, "world": None}
        u = self._mops_units(s)
        rows = view["rows"] = self._mops_unit_rows(s, u)
        for k in range(N_OPS):
            self._mops_refresh(s, k, on, u, rows, tg)
        pick = on & (self.mops_pick[:, s] >= 0)
        if bool(pick.any()):
            self._mops_start(s, Tm.d_abc, self.mops_pick_target[:, s], self.mops_pick_rally[:, s], pick)
        self.mops_pick[:, s] = torch.where(on, -1, self.mops_pick[:, s])
        for k in range(N_OPS):
            for d in Tm.trees:
                m = on & (self.mops_def[:, s, k] == d)
                if bool(m.any()):
                    self._mops_tick(s, k, d, m, view)
        busy = self._mops_busy(s) & self.major_unit_alive & (self.major_unit_seat == 100 + s)
        done |= busy & on.unsqueeze(1) & (op["rowof"] >= 0)

    def _mops_tick(self, s: int, k: int, d: int, act: torch.Tensor, view: dict) -> None:
        """ONE TICK of slot `k`'s tree (definition `d`) where `act` (the
        interpreter of sim_citytrees.py's `tick_tree`): the walk, then the
        actions' execution; a root ending anything but RUNNING (or nothing)
        ends the operation"""
        c = _OpCtx(self, s, k, d, view)
        tree = c.tree
        cur = torch.zeros_like(c.ref)
        for i, n in enumerate(tree.nodes):
            at = act & (cur == i)
            if not bool(at.any()):
                continue
            h = _UPDATE.get(n["type"])
            skipped = at & (c.st[:, n["parent"]] == BT_SKIPPED) if n["parent"] >= 0 else torch.zeros_like(at)
            run = at & ~skipped
            if n["shape"] == SHAPE_SELECTOR and h is None:
                if n["type"] == "Concurrent":
                    c.ma[:, i] = torch.where(run, 0, c.ma[:, i])
                    c.mb[:, i] = torch.where(run, 0, c.mb[:, i])
                v = torch.full_like(c.ref, BT_FRESH)
            elif h is None:
                if bool(run.any()):
                    raise RuntimeError(f"minor operations: no handler for {n['type']} ({tree.name} node {i})")
                v = torch.full_like(c.ref, BT_FRESH)
            else:
                v = h(self, c, i, run) if bool(run.any()) else torch.full_like(c.ref, BT_FRESH)
            v = torch.where(skipped, BT_SKIPPED, v)
            c.st[:, i] = torch.where(at, v, c.st[:, i])
            if n["type"] in _NEXT_MEM:
                own = torch.where(c.ma[:, i] == NONE, n["first"], c.ma[:, i])
            elif n["type"] == "Sequence":
                own = torch.maximum(torch.where(c.ma[:, i] == NONE, n["first"], c.ma[:, i]), torch.full_like(cur, i + 1))
            else:
                own = torch.full_like(cur, i + 1)
            cur = torch.where(at, torch.maximum(own, _propagate(c, i, at)), cur)
        root = c.st[:, 0].clone()
        ex = act & ((root == BT_SUCCESS) | (root == BT_RUNNING) | (root == BT_FAILURE))
        for i, n in enumerate(tree.nodes):
            x = _EXECUTE.get(n["type"])
            if x is None:
                continue
            on = ex & ((c.st[:, i] == BT_SUCCESS) | (c.st[:, i] == BT_RUNNING))
            if bool(on.any()):
                x(self, c, i, on)
        keep = act & ((root == BT_RUNNING) | (root == BT_FRESH))
        c.st[:] = torch.where(keep.unsqueeze(1), torch.full_like(c.st, BT_FRESH), c.st)
        self._mops_end(s, k, act & ~keep)

    # -- the recruit (Operation.cpp 0x738050) ---------------------------------

    def _mops_seq_append(self, seq: torch.Tensor, n: torch.Tensor, items: torch.Tensor, cnt: torch.Tensor):
        """`seq` [B, Q] with `n` [B] filled, `items` [B, M] (in order, -1
        padded, `cnt` [B] of them) appended"""
        B, Q = seq.shape
        M = items.shape[1]
        pos = n.unsqueeze(1) + torch.arange(M, device=self.device).unsqueeze(0)
        ok = torch.arange(M, device=self.device).unsqueeze(0) < cnt.unsqueeze(1)
        assert bool((pos[ok] < Q).all()), "minor operations: the recruit's list overflows"
        rows = ok.nonzero(as_tuple=True)
        seq[rows[0], pos[rows]] = items[rows]
        return seq, n + cnt

    def _mops_dedupe(self, seq: torch.Tensor) -> torch.Tensor:
        """`dedupe`: each unit's first place, in order, -1 padded"""
        Q = seq.shape[1]
        same = (seq.unsqueeze(2) == seq.unsqueeze(1)) & (seq >= 0).unsqueeze(2)
        earlier = torch.ones(Q, Q, dtype=torch.bool, device=self.device).tril(-1)
        dup = (same & earlier.unsqueeze(0)).any(dim=2)
        keep = (seq >= 0) & ~dup
        o = (~keep).to(torch.int8).argsort(dim=1, stable=True)
        out = seq.gather(1, o)
        n = keep.sum(dim=1)
        return torch.where(torch.arange(Q, device=self.device).unsqueeze(0) < n.unsqueeze(1), out, torch.full_like(out, -1))

    def _mops_recruit_team(self, s: int, k: int, ti: int, offer: torch.Tensor, in_prog: bool, rng: int, u: dict,
                           mask: torch.Tensor) -> torch.Tensor:
        """`recruitOperation`'s team `ti` where `mask`: from `offer` [B, L]
        (unit slots in order, -1 padded) its minimums (`recruitMinimums`) then
        its strength (`recruitStrength`); the units taken join it in that
        order. [B, Q] the units taken"""
        Tm = self._mops_tables()
        B, dev = self.B, self.device
        L = offer.shape[1]
        d = self.mops_def[:, s, k]
        tm = self.mops_tm[:, s, k, ti]
        on = mask & (tm >= 0)
        Q = 8 * L + L
        taken_all = torch.full((B, Q), -1, dtype=torch.long, device=dev)
        if not bool(on.any()):
            return taken_all
        goal = self.mops_goal[:, s, k, ti, G_TARGET if in_prog else G_RALLY]
        rally = self.mops_goal[:, s, k, ti, G_RALLY]
        oc = offer.clamp(min=0)
        valid = offer >= 0
        tile = u["tile"].gather(1, oc)
        if rng > 0:
            dg = self.pair_dist[tile.clamp(min=0), goal.clamp(min=0).unsqueeze(1)].to(torch.long)
            valid &= ~((goal >= 0).unsqueeze(1) & (dg > rng))
        drally = torch.where((rally >= 0).unsqueeze(1), self.pair_dist[tile.clamp(min=0), rally.clamp(min=0).unsqueeze(1)].to(torch.long),
                             torch.zeros_like(tile))
        pos = torch.arange(L, device=dev).unsqueeze(0).expand(B, L)
        big = 1 << 30
        ua = Tm.unit_ai.to(dev)
        urow = u["row"].gather(1, oc)
        carries_all = ua[urow.clamp(min=0)] & (urow >= 0).unsqueeze(2) & valid.unsqueeze(2)           # [B, L, NAT]
        ustr = torch.maximum(u["combat"], u["ranged"])
        ostr = ustr.gather(1, oc)
        estr = self.mops_estr[:, s, k]
        ours = self.citystate_best_melee[:, s].long()
        members = (self.mops_mem[:, s, k, ti] >= 0).sum(dim=1)
        memm = self._mops_member_mask(s, k, ti) & u["own"]
        cur_mem = torch.where(memm, ustr, torch.zeros_like(ustr)).sum(dim=1)
        ready = self.mops_ready[:, s, k, ti]
        for dd, ts in Tm.team_reqs.items():
            for tj, tr in enumerate(ts):
                g = on & (d == dd) & (tm == tj)
                if not bool(g.any()):
                    continue
                R = tr["n"]
                tix = tr["type"].to(dev)
                cnt = self.mops_cnt[:, s, k, ti, :R]
                car = carries_all[:, :, tix]                                                     # [B, L, R]
                none = g & ~valid.any(dim=1)
                met = torch.where(none, ready, torch.ones_like(ready))
                seq = torch.full((B, Q), -1, dtype=torch.long, device=dev)
                n_out = torch.zeros(B, dtype=torch.long, device=dev)
                gg = g & valid.any(dim=1)
                # THE MINIMUMS
                for i in range(R):
                    mn = int(tr["min"][i])
                    mp_ = float(tr["minp"][i])
                    need = torch.full((B,), max(mn, 0), dtype=torch.long, device=dev)
                    have = cnt[:, i]
                    run_i = gg.clone()
                    over = have >= need
                    skip = over & ~(((members + n_out).to(torch.float64) * mp_) > have.to(torch.float64))
                    run_i &= ~skip
                    need = torch.where(over, (members.to(torch.float64) * mp_).trunc().long(), need)
                    deficit = need - have
                    # the other requirements' maxima with `deficit` more
                    ok_o = torch.ones(B, L, dtype=torch.bool, device=dev)
                    for j in range(R):
                        if j == i:
                            continue
                        mx = int(tr["max"][j])
                        xp_ = float(tr["maxp"][j])
                        mpj = float(tr["minp"][j])
                        cj = cnt[:, j].unsqueeze(1)
                        hasj = car[:, :, j]
                        bad = torch.zeros(B, L, dtype=torch.bool, device=dev)
                        if mx >= 0:
                            bad |= hasj & (cj >= mx)
                        if xp_ >= 0:
                            bad |= hasj & ((cj + deficit.unsqueeze(1)).to(torch.float64)
                                           > (members + deficit).unsqueeze(1).to(torch.float64) * xp_)
                        if mpj > 0 and mpj == 1:
                            bad |= ~hasj
                        ok_o &= ~bad
                    matches = valid & car[:, :, i] & ok_o & run_i.unsqueeze(1)
                    nm = matches.sum(dim=1)
                    met = torch.where(run_i & (nm < deficit), torch.zeros_like(met), met)
                    allm = run_i & (nm <= deficit)
                    # all of them, in the offer's order
                    items = torch.where(matches, offer, torch.full_like(offer, -1))
                    o = (~matches).to(torch.int8).argsort(dim=1, stable=True)
                    items_all = items.gather(1, o)
                    # else the shortfall's count nearest the rally
                    key = torch.where(matches, drally * L + pos, torch.full_like(pos, big))
                    o2 = key.argsort(dim=1, stable=True)
                    items_near = offer.gather(1, o2)
                    take_n = torch.where(allm, nm, torch.where(run_i, deficit.clamp(min=0), torch.zeros_like(nm)))
                    take_n = torch.minimum(take_n, nm)
                    picked = torch.where(allm.unsqueeze(1), items_all, items_near)
                    seq, n_out = self._mops_seq_append(seq, n_out, picked, take_n)
                taken = self._mops_dedupe(seq)
                # THE STRENGTH, where the minimums were met or the recruit goes
                # on an operation in progress
                if in_prog:
                    go = gg.clone()
                else:
                    go = gg & met
                tdef = Tm.teams[dd][tj]
                adv = float(tdef["ongoingStrengthAdvantage"] if in_prog else tdef["initialStrengthAdvantage"])
                if adv <= -5:
                    desired = -estr.to(torch.float64)
                else:
                    desired = adv * ours.to(torch.float64)
                tgt = estr.to(torch.float64) + desired
                in_taken = (offer.unsqueeze(2) == taken.unsqueeze(1)).any(dim=2) & valid
                rest = valid & ~in_taken
                go &= (tgt > 0) & rest.any(dim=1)
                if bool(go.any()):
                    ntak = (taken >= 0).sum(dim=1)
                    cur = cur_mem + torch.where(in_taken, ostr, torch.zeros_like(ostr)).sum(dim=1)
                    elig = rest.clone()
                    matched = torch.zeros(B, L, dtype=torch.bool, device=dev)
                    for j in range(R):
                        mx = int(tr["max"][j])
                        xp_ = float(tr["maxp"][j])
                        mpj = float(tr["minp"][j])
                        cj = cnt[:, j].unsqueeze(1)
                        hasj = car[:, :, j]
                        bad = torch.zeros(B, L, dtype=torch.bool, device=dev)
                        if mx >= 0:
                            bad |= hasj & (cj >= mx)
                        if xp_ >= 0:
                            bad |= hasj & ((cj + 1).to(torch.float64) > (members + ntak + 1).unsqueeze(1).to(torch.float64) * xp_)
                        if mpj > 0 and mpj == 1:
                            bad |= ~hasj
                        elig &= ~bad
                        matched |= hasj
                    elig &= matched & go.unsqueeze(1)
                    key = torch.where(elig, drally * L + pos, torch.full_like(pos, big))
                    o3 = key.argsort(dim=1, stable=True)
                    s3 = ostr.gather(1, o3)
                    e3 = elig.gather(1, o3)
                    before = cur.unsqueeze(1) + torch.cumsum(torch.where(e3, s3, torch.zeros_like(s3)), dim=1) - torch.where(e3, s3, torch.zeros_like(s3))
                    tt = tgt.trunc().long().unsqueeze(1)
                    take = e3 & (before < tt)
                    # the picks stop at the first that reaches the target
                    stop = (~take & e3).long().cumsum(dim=1) > 0
                    take &= ~stop
                    picked = torch.where(take, offer.gather(1, o3), torch.full_like(offer, -1))
                    o4 = (~take).to(torch.int8).argsort(dim=1, stable=True)
                    picked = picked.gather(1, o4)
                    ns = take.sum(dim=1)
                    seq2 = torch.full((B, Q), -1, dtype=torch.long, device=dev)
                    seq2, n2 = self._mops_seq_append(seq2, torch.zeros_like(ns), taken[:, :min(Q, taken.shape[1])], ntak)
                    seq2, n2 = self._mops_seq_append(seq2, n2, picked, ns)
                    taken = torch.where(go.unsqueeze(1), self._mops_dedupe(seq2), taken)
                # the units taken join, in order
                for q in range(Q):
                    uid = taken[:, q]
                    if not bool((g & (uid >= 0)).any()):
                        break
                    self._mops_add_member(s, k, ti, uid, g & (uid >= 0))
                taken_all = torch.where(g.unsqueeze(1), taken, taken_all)
        return taken_all

    def _mops_recruit(self, s: int, k: int, offer: torch.Tensor, in_prog: bool, rng: int, u: dict,
                      mask: torch.Tensor) -> torch.Tensor:
        """`recruitOperation` (0x738050): each team in turn takes from the
        offer [B, L], the units it takes leaving it. [B, P] the units taken"""
        P = self.major_unit_alive.shape[1]
        got = torch.zeros(self.B, P + 1, dtype=torch.bool, device=self.device)
        for ti in range(N_TEAMS):
            t = self._mops_recruit_team(s, k, ti, offer, in_prog, rng, u, mask)
            got.scatter_(1, torch.where(t >= 0, t, P), True)
            gone = (offer.unsqueeze(2) == t.unsqueeze(1)).any(dim=2) & (offer >= 0)
            o = gone.to(torch.int8).argsort(dim=1, stable=True)
            offer = torch.where(gone, torch.full_like(offer, -1), offer).gather(1, o)
        return got[:, :P]

    # -- the contracts ------------------------------------------------------------

    def _mops_world(self, s: int, view: dict):
        """the minor's world its operations' contracts read (sim_minorai.py's
        `_MinorWorld`, as `minorContractCity`), made once a run"""
        w = view.get("world")
        if w is None:
            from .sim_minorai import _MinorWorld
            f = self._cv_minor_facts(s)
            tables = self._cv_minor_tables(s, f)
            w = view["world"] = _MinorWorld(self, s, f, tables, {}, self.citystate_threat[:, s])
        return w

    def _mops_join(self, s: int, tree: torch.Tensor, uid: torch.Tensor, mask: torch.Tensor) -> None:
        """`joinBuilt`: a unit trained for a contract an operation's tree made
        joins the operation's first team, where no operation holds it already"""
        m = mask & (tree >= 0)
        if not bool(m.any()):
            return
        busy = self._mops_busy(s).gather(1, uid.clamp(min=0).unsqueeze(1)).squeeze(1)
        for k in range(N_OPS):
            g = m & (self.mops_def[:, s, k] >= 0) & (self.mops_id[:, s, k] == tree) & (self.mops_tm[:, s, k, 0] >= 0) & ~busy
            if bool(g.any()):
                self._mops_add_member(s, k, 0, uid, g)

    # -- the units' orders ----------------------------------------------------------

    def _mops_endangered(self, s: int, j: torch.Tensor, on: torch.Tensor, view: dict) -> torch.Tensor:
        """[B] bool — the team update's endangered (`endangered`, 0x738f20)
        for minor `s`'s unit at pool slot `j` [B] where `on`: the target
        list's entries within twice its base Movement — a unit of an entry
        that fights, where no unit of the minor stands beside the member and
        its plot holds danger or the entry is HIGH, within the unit's
        Movement or its range, adds its blow on the member (`damageExpected`
        on their strengths); a combat district's city that strikes, the
        member within its range of the centre, its strike — and the member
        the sum leaves with no hit points (one that does not fight, any blow
        at all on land) is endangered"""
        B, dev = self.B, self.device
        b = torch.arange(B, device=dev)
        jc = j.clamp(min=0)
        seat = 100 + s
        tg, op = view["tg"], view["op"]
        danger = op["danger"]
        ut = self.major_unit_type[b, jc].clamp(min=0, max=self.NU - 1)
        cb_all = self._ai_combat()
        mcb = cb_all[:, self.POOL_LO["major"]:self.POOL_HI["major"]][b, jc]
        fights = (mcb > 0) | (self._type_ranged_strength.take(ut) > 0) | (self._type_bombard.take(ut) > 0)
        plot = self.major_unit_tile[b, jc].clamp(min=0)
        near = 2 * self._type_moves.take(ut)
        d = self.pair_dist[plot].to(torch.long)  # [B, T]
        own = self.major_unit_alive & (self.major_unit_seat == seat)
        own_d = self.pair_dist[plot.unsqueeze(1), self.major_unit_tile.clamp(min=0)].to(torch.long)
        others = torch.arange(own.shape[1], device=dev).unsqueeze(0) != jc.unsqueeze(1)
        beside = (own & others & (own_d == 1) & (self.major_unit_tile >= 0)).any(dim=1)
        here = danger.gather(1, plot.unsqueeze(1)).squeeze(1)
        # the unit entries, each at its plot
        uk, uu = tg["uk"], tg["uu"]
        uc = uu.clamp(min=0)
        du = d.repeat(1, uk.shape[1] // self.T)  # [B, U]
        et = self.unit_type.gather(1, uc).clamp(min=0, max=self.NU - 1)
        ecb, erg, ebm = cb_all.gather(1, uc), self._type_ranged_strength.take(et), self._type_bombard.take(et)
        full_all = torch.cat((self._full_mp("major") - self.major_unit_aura_mp,
                              self._full_mp("barb") - self.barb_unit_aura_mp), dim=1)
        emm = torch.div(full_all.gather(1, uc), self._mp_scale, rounding_mode="floor")
        lo = self.POOL_LO["barb"]
        bi = b.unsqueeze(1).expand_as(uc)
        r_major = self._tac_range(bi, uc.clamp(max=self.major_unit_type.shape[1] - 1), "major")
        r_barb = self._tac_range(bi, (uc - lo).clamp(min=0, max=self.barb_unit_type.shape[1] - 1), "barb")
        erng = torch.where(uc >= lo, r_barb, r_major)
        ent = ((uk > 0) & (uu >= 0) & (du <= near.unsqueeze(1)) & ((ecb > 0) | (erg > 0) | (ebm > 0))
               & ~beside.unsqueeze(1) & ((here > 0).unsqueeze(1) | (uk == 3)) & ((du <= emm) | (du <= erng)))
        dmg = self._damage_expected((torch.maximum(ecb, erg) - mcb.unsqueeze(1)).to(torch.float64))
        total = torch.where(ent, dmg, torch.zeros_like(dmg)).sum(dim=1)
        # the combat districts' cities: each entry its city's strike
        dk = tg["dk"]
        ent_d = (dk == 1) & (d <= near.unsqueeze(1))
        if bool((ent_d & on.unsqueeze(1)).any()):
            for row in range(self.city_alive.shape[1]):
                rs = int(self._ROW_SEAT[row])
                if rs == seat:
                    continue
                for col in range(self.city_alive.shape[2]):
                    alive = self.city_alive[:, row, col]
                    if not bool((alive & on).any()):
                        continue
                    mine = ent_d & (self.tile_seat == rs) & (self.tile_city == self.city_id[:, row, col].unsqueeze(1))
                    n = mine.sum(dim=1)
                    if not bool((n > 0).any()):
                        continue
                    ctr = self.city_center[:, row, col].clamp(min=0)
                    str_ = self._strike_strength(row, torch.full_like(ctr, col))
                    if row < self.n_majors:
                        str_ = str_ + self._gov_mods(row)[12]["crng"].to(str_.dtype)
                    ok = alive & (n > 0) & (str_ > 0) & (self.pair_dist[plot, ctr].to(torch.long) <= 2)
                    hit = self._damage_expected(str_ - mcb.to(torch.float64))
                    total = total + torch.where(ok, n * hit, torch.zeros_like(hit))
        hp_max = int(self.rules.combat["unitHp"])
        dmg_now = hp_max - self.major_unit_hp[b, jc].long()
        weak = (total > 0) & ~fights
        land = ~self.water[b, plot]
        return on & ((weak & land) | (~weak & (dmg_now + total > hp_max)))

    def _mops_hurt(self, j: torch.Tensor, pct: int) -> torch.Tensor:
        """[B] bool — the unit at pool slot `j` hurt to `pct` percent of its
        hit points (single precision)"""
        b = torch.arange(self.B, device=self.device)
        hp_max = int(self.rules.combat["unitHp"])
        bar = float(torch.tensor(hp_max, dtype=_F32) * torch.tensor(float(torch.tensor(pct, dtype=_F32) * torch.tensor(0.01, dtype=_F32)), dtype=_F32))
        return (hp_max - self.major_unit_hp[b, j.clamp(min=0)].long()).to(torch.float64) >= bar

    def _mops_move(self, s: int, us: torch.Tensor, dest: torch.Tensor, mask: torch.Tensor) -> None:
        """a member's move order to `dest` (tactical `moveTo`, no strike):
        none where it stands there or has no Movement left"""
        m = mask & (us >= 0)
        if not bool(m.any()):
            return
        b = torch.arange(self.B, device=self.device)
        uc = us.clamp(min=0)
        m &= (self.major_unit_tile[b, uc] != dest) & (self.major_unit_mp[b, uc] > 0) & (dest >= 0)
        self._tac_move_to(m, uc, dest, "major", 100 + s, strike=False)

    def _mops_strike(self, s: int, us: torch.Tensor, plot: torch.Tensor, mask: torch.Tensor) -> None:
        """a member's blow on `plot` (`passOrders.strike`): a ranged unit within
        its range strikes from where it stands, with Movement and an attack
        left; any other goes for the plot with the attack flag"""
        m = mask & (us >= 0) & (plot >= 0)
        if not bool(m.any()):
            return
        b = torch.arange(self.B, device=self.device)
        uc = us.clamp(min=0)
        ut = self.major_unit_type[b, uc].clamp(min=0, max=self.NU - 1)
        ranged = self._type_ranged_strength.take(ut) > 0
        rng = self._tac_range(b, uc, "major")
        here = self.major_unit_tile[b, uc].clamp(min=0)
        inr = ranged & (self.pair_dist[here, plot.clamp(min=0)].to(torch.long) <= rng)
        fire = m & inr & (self.major_unit_mp[b, uc] > 0) & (self.major_unit_attacks[b, uc] > 0)
        for u in torch.unique(uc[fire]).tolist():
            self._hostile_ranged_strike(fire & (uc == u), plot.clamp(min=0), "major", u)
        self._tac_move_to(m & ~inr, uc, plot, "major", 100 + s, strike=True)

    def _mops_plan_spot(self, s: int, view: dict, us: torch.Tensor, p: torch.Tensor, turns: int, need_moves: bool,
                        rng: torch.Tensor) -> torch.Tensor:
        """`planSpot` on the pass's planning: [B] the first plot of the unit's
        reach within `turns` exactly `rng` from `p` (Movement left there where
        asked), its own plot, or one with no other unit of its domain that
        fights as it does; -1 none"""
        op = view["op"]
        B, T = self.B, self.T
        dev = self.device
        b = torch.arange(B, device=dev)
        uc = us.clamp(min=0)
        n = op["rowof"][b, uc]
        res = op["res"]
        nn = n.clamp(min=0)
        rt, rk, mv = res["turns"][nn], res["rank"][nn], res["moves"][nn]
        dq = self.pair_dist[p.clamp(min=0)].to(torch.long)
        here = self.major_unit_tile[b, uc]
        g = uc + self.POOL_LO["major"]
        ut = self.unit_type.gather(1, g.unsqueeze(1)).squeeze(1).clamp(min=0, max=self.NU - 1)
        fights = self._type_combat.take(ut) > 0
        block = torch.zeros(B, T, dtype=torch.bool, device=dev)
        for pl in (self.military_at, self.embarked_at):
            x = pl
            xt = self.unit_type.gather(1, x.clamp(min=0)).clamp(min=0, max=self.NU - 1)
            block |= (x >= 0) & (x != g.unsqueeze(1)) & ((self._type_combat.take(xt) > 0) == fights.unsqueeze(1))
        ok = (dq == rng.unsqueeze(1)) & (rt >= 0) & (rt <= turns) & ((self._arange_bt == here.unsqueeze(1)) | ~block)
        if need_moves:
            ok &= mv > 0
        ok &= (n >= 0).unsqueeze(1) & (us >= 0).unsqueeze(1) & (p >= 0).unsqueeze(1)
        big = 1 << 40
        key = torch.where(ok, rk, torch.full_like(rk, big))
        best = key.min(dim=1)
        return torch.where(best.values < big, best.indices, torch.full_like(best.indices, -1))

    def _mops_reach1(self, view: dict, us: torch.Tensor, p: torch.Tensor) -> torch.Tensor:
        """[B] the unit's planning reaches `p` this turn"""
        op = view["op"]
        b = torch.arange(self.B, device=self.device)
        uc = us.clamp(min=0)
        n = op["rowof"][b, uc]
        rt = op["res"]["turns"][n.clamp(min=0), p.clamp(min=0)]
        return (n >= 0) & (us >= 0) & (p >= 0) & (rt >= 1) & (rt <= 1)

    def _mops_attack_spot(self, view: dict, us: torch.Tensor, p: torch.Tensor) -> torch.Tensor:
        """`attackSpots`'s pick (Operation Attack's second pass): [B] the plan
        entry's spot for `p` of the fewest turns (the first of equals), -1
        none or where one is the unit's own plot"""
        op = view["op"]
        res = op["res"]
        B = self.B
        dev = self.device
        out = torch.full((B,), -1, dtype=torch.long, device=dev)
        if "tp" not in res:
            return out
        b = torch.arange(B, device=dev)
        uc = us.clamp(min=0)
        n = op["rowof"][b, uc]
        nn = n.clamp(min=0)
        tp = res["tp"][nn]                                                    # [B, E]
        hit = (tp == p.unsqueeze(1)) & (tp >= 0)
        e = hit.long().argmax(dim=1)
        has = hit.any(dim=1) & (n >= 0) & (us >= 0)
        sp = res["spot"][nn, e]                                               # [B, 6]
        st = res["spot_turns"][nn, e]
        sn = res["spot_n"][nn, e]
        here = self.major_unit_tile[b, uc]
        k6 = torch.arange(6, device=dev).unsqueeze(0)
        val = k6 < sn.unsqueeze(1)
        own = (val & (sp == here.unsqueeze(1))).any(dim=1)
        big = 1 << 40
        key = torch.where(val, st * 8 + k6, torch.full_like(st, big))
        j = key.argmin(dim=1)
        best = sp.gather(1, j.unsqueeze(1)).squeeze(1)
        return torch.where(has & val.any(dim=1) & ~own, best, out)


# -- the nodes (the operation nodes of cpu/core/operations/nodes.ts, assault.ts) --


def _n_units(sim, c: _OpCtx) -> torch.Tensor:
    """[B] the members the operation lists, every team's (`opUnits`)"""
    return (sim.mops_mem[:, c.s, c.k] >= 0).sum(dim=(1, 2))


def _status(c: _OpCtx, v: int) -> torch.Tensor:
    return torch.full_like(c.ref, v)


def _u_success(sim, c: _OpCtx, i: int, at: torch.Tensor) -> torch.Tensor:
    return _status(c, BT_SUCCESS)


def _u_decode(sim, c: _OpCtx, i: int, at: torch.Tensor) -> torch.Tensor:
    """DECODE TRIGGER (0x7f2970): the trigger's units (none) and value (0)
    into their tags"""
    c.set_tag(i, "Trigger Units", NONE, at)
    c.set_tag(i, "Trigger Value", 0, at)
    return _status(c, BT_SUCCESS)


def _u_is_ready(sim, c: _OpCtx, i: int, at: torch.Tensor) -> torch.Tensor:
    """OPERATION IS READY (0x81a090): every team ready"""
    tm = sim.mops_tm[:, c.s, c.k]
    ok = ((tm < 0) | sim.mops_ready[:, c.s, c.k]).all(dim=1)
    return torch.where(ok, BT_SUCCESS, BT_FAILURE)


def _camp_gone(sim, c: _OpCtx) -> torch.Tensor:
    """`targetGone` of a camp target: no camp the knowledge base holds on it"""
    t = sim.mops_target[:, c.s, c.k]
    return ~((sim.mops_camps[:, c.s] == t.unsqueeze(1)) & (t >= 0).unsqueeze(1)).any(dim=1)


def _gone(sim, c: _OpCtx) -> torch.Tensor:
    """`targetGone` (0x73a8e0) of the operation's target"""
    if c.T.defs[c.d]["targetType"] == "TARGET_BARBARIAN_CAMP":
        return _camp_gone(sim, c)
    return torch.zeros_like(c.ref, dtype=torch.bool)


def _switch_backup(sim, c: _OpCtx, m: torch.Tensor) -> None:
    """`switchToBackup` (0x73e870) where `m`"""
    s, k = c.s, c.k
    if not bool(m.any()):
        return
    bt, br = sim.mops_bk_target[:, s, k], sim.mops_bk_rally[:, s, k]
    sim.mops_target[:, s, k] = torch.where(m, bt, sim.mops_target[:, s, k])
    sim.mops_rally[:, s, k] = torch.where(m, br, sim.mops_rally[:, s, k])
    sim.mops_bk_target[:, s, k] = torch.where(m, -1, bt)
    sim.mops_bk_rally[:, s, k] = torch.where(m, -1, br)
    g = sim.mops_goal[:, s, k]
    has = sim.mops_tm[:, s, k] >= 0
    g[:, :, G_RALLY] = torch.where(m.unsqueeze(1) & has, sim.mops_rally[:, s, k].unsqueeze(1), g[:, :, G_RALLY])
    g[:, :, G_TARGET] = torch.where(m.unsqueeze(1) & has, sim.mops_target[:, s, k].unsqueeze(1), g[:, :, G_TARGET])


def _u_change_target(sim, c: _OpCtx, i: int, at: torch.Tensor) -> torch.Tensor:
    """OPERATION CHANGE TARGET (0x8196d0)"""
    s, k = c.s, c.k
    tree = c.tree
    assert tree.flag(i, "Always Swap") is None and tree.flag(i, "Fail on Invalid Team") is None \
        and tree.value(i, "Required Tag") is None, "minor operations: an unported Change Target datum"
    out = _status(c, BT_SUCCESS)
    backup = sim.mops_bk_target[:, s, k] >= 0
    tgt = sim.mops_target[:, s, k]
    valid = tgt >= 0
    inv = at & ~valid
    swap = inv & backup
    out = torch.where(inv & ~backup, BT_FAILURE, out)
    estr = sim.mops_estr[:, s, k]
    rest = at & valid & (estr > 0)
    ours = sim.citystate_best_melee[:, s].long().to(torch.float64)
    ef = estr.to(torch.float64)

    def need(adv: float) -> torch.Tensor:
        des = -ef if adv <= -5 else adv * ours
        return des.trunc().long() + estr
    bv = tree.value(i, "Backup Amount")
    fv = tree.value(i, "Failure Amount")
    b_need = need(float(bv) if bv not in (None, "") else 0.0)
    f_need = need(float(fv) if fv not in (None, "") else -1.0)
    st = sim.mops_str[:, s, k]
    weak = rest & (st < b_need) & backup
    swap = swap | weak
    rest = rest & ~weak
    out = torch.where(rest & (st < f_need), BT_FAILURE, out)
    _switch_backup(sim, c, swap)
    return out


def _u_attack_units(sim, c: _OpCtx, i: int, at: torch.Tensor) -> torch.Tensor:
    """OPERATION ATTACK UNITS (0x80ecf0): SUCCESS (no Always Running)"""
    assert c.tree.flag(i, "Always Running") is None, "minor operations: Attack Units' Always Running"
    return _status(c, BT_SUCCESS)


def _x_attack_units(sim, c: _OpCtx, i: int, on: torch.Tensor) -> None:
    """OPERATION ATTACK UNITS' EXECUTION (0x80ceb0): per team engaged or with a unit
    taken in (team +0x90, +0x58) its members alive
    with Movement left (a bombard unit only against an enemy city), the list's
    unit targets not its own within max(2, a member's Movement left) of one,
    the assignment (the exchange filter where unequal attacks are not allowed
    and one unit goes, the survival filter always) carried out"""
    s, k = c.s, c.k
    tree = c.tree
    seat = 100 + s
    assert tree.flag(i, "Attack Nearby Units"), "minor operations: Attack Units without Attack Nearby Units"
    unequal = bool(tree.flag(i, "Allow Unequal Attacks"))
    view = c.view
    op, tg, done = view["op"], view["tg"], view["done"]
    dev = sim.device
    B = sim.B
    tgt = sim.mops_target[:, s, k]
    city = sim._centre_plane().gather(1, tgt.clamp(min=0).unsqueeze(1)).squeeze(1) & (tgt >= 0)
    enemy_city = city & (sim.tile_seat.gather(1, tgt.clamp(min=0).unsqueeze(1)).squeeze(1) != seat)
    for ti in range(N_TEAMS):
        tm = sim.mops_tm[:, s, k, ti]
        g = on & (tm >= 0) & (sim.mops_eng[:, s, k, ti] | (sim.mops_join[:, s, k, ti] > 0))
        if not bool(g.any()):
            continue
        u = sim._mops_units(s)
        memm = sim._mops_member_mask(s, k, ti) & u["own"]
        mem = memm & (u["mp"] > 0) & ((u["bombard"] <= 0) | enemy_city.unsqueeze(1)) & g.unsqueeze(1)
        reach = u["mp_whole"].clamp(min=2)
        near = torch.zeros(B, sim.T, dtype=torch.bool, device=dev)
        for j in mem.any(dim=0).nonzero(as_tuple=True)[0].tolist():
            mj = mem[:, j]
            dq = sim.pair_dist[u["tile"][:, j].clamp(min=0)].to(torch.long)
            near |= mj.unsqueeze(1) & (dq <= reach[:, j].unsqueeze(1))
        uk, uu, us_ = tg["uk"], tg["uu"], tg["us"]
        L = uk.shape[1] // sim.T
        sl = uu.clamp(min=0)
        # each unit entry's unit still on its plot
        standing = (uu >= 0) & sim.unit_alive.gather(1, sl) & (sim.unit_tile.gather(1, sl) == sim._arange_bt.repeat(1, L)) \
            & (sim.unit_seat.gather(1, sl) == us_)
        near = near.repeat(1, L) & (uk > 0) & (us_ != seat) & standing
        cand = mem & (op["rowof"] >= 0)
        if not bool((cand.any(dim=1) & near.any(dim=1)).any()):
            continue
        ai = torch.where(op["units"], torch.where(sim.major_unit_defender, _AI_DEFENDER, _AI_COMBAT), -1)
        one = mem.sum(dim=1) == 1
        exch = (~torch.full((B,), unequal, dtype=torch.bool, device=dev)) & one
        out = sim._tac_assign(cand, op["order"], ai, near, op["res"], op["rowof"], uu, exch, True, uk, tg["uo"], "major", seat)
        sim._tac_carry_out(out, done, op["rowof"], op["res"], "major", seat)


def _u_recruit(sim, c: _OpCtx, i: int, at: torch.Tensor) -> torch.Tensor:
    """RECRUIT UNITS (0x81c820): the recruit from the free units, then from
    the units the recruit signal frees (the lower-priority operations'); the
    strengths refreshed; the contract's state; the node's status"""
    s, k = c.s, c.k
    tree = c.tree
    Tm = c.T
    view = c.view
    in_prog = bool(tree.flag(i, "Already in progress"))
    cre = tree.flag(i, "Allow creation")
    creation = True if cre is None else bool(cre)
    rng = tree.int_(i, "Recruit Range")
    rng = -1 if rng is None else rng
    u = sim._mops_units(s)
    busy = sim._mops_busy(s)
    offer, _n = sim._mops_in_order(u["own"] & ~busy & at.unsqueeze(1), u["key"])
    sim._mops_recruit(s, k, offer, in_prog, rng, u, at)
    # the lower-priority operations' units, in slot then team then join order
    prio = Tm.defs[c.d]["priority"]
    parts = []
    for kk in range(N_OPS):
        if kk == k:
            continue
        low = torch.zeros_like(at)
        for dd, dfn in enumerate(Tm.defs):
            if dfn["priority"] < prio:
                low |= sim.mops_def[:, s, kk] == dd
        low &= at
        for ti in range(N_TEAMS):
            mem = sim.mops_mem[:, s, kk, ti]
            ok = (mem >= 0) & u["own"].gather(1, mem.clamp(min=0)) & low.unsqueeze(1)
            parts.append(torch.where(ok, mem, torch.full_like(mem, -1)))
    if parts:
        freed = torch.cat(parts, dim=1)
        o = (freed < 0).to(torch.int8).argsort(dim=1, stable=True)
        freed = freed.gather(1, o)
        if bool((freed >= 0).any()):
            got = sim._mops_recruit(s, k, freed, in_prog, rng, u, at & (freed >= 0).any(dim=1))
            for kk in range(N_OPS):
                if kk == k:
                    continue
                for ti in range(N_TEAMS):
                    mem = sim.mops_mem[:, s, kk, ti]
                    keep = ~((mem >= 0) & got.gather(1, mem.clamp(min=0)))
                    sim._mops_compact(s, kk, ti, keep, at)
    rows = view["rows"]
    sim._mops_refresh(s, k, at, sim._mops_units(s), rows, view["tg"])
    after = _n_units(sim, c)
    unit = torch.full_like(c.ref, -1)
    for ti in range(N_TEAMS - 1, -1, -1):
        tu = sim.mops_unit[:, s, k, ti]
        unit = torch.where((sim.mops_tm[:, s, k, ti] >= 0) & (tu >= 0), tu, unit)
    done = c.ma[:, i] == 1
    out = torch.where(done & (after == 0), BT_FAILURE, torch.full_like(c.ref, -9))
    rest = at & (out == -9)
    has_c = torch.zeros_like(at)
    tag = tree.tag(i, "Contract ID")
    if tag is not None:
        j = c.tree_contract(c.bb[:, tag])
        has_c = (j >= 0) & rest
        prog = _cget(c.ai.c_progress, s, j)
        failed = has_c & (prog == CP_FAILED)
        _cset(c.ai.c_in_tree, s, j, False, failed | (has_c & (prog == CP_COMPLETED)))
        out = torch.where(failed, BT_FAILURE, out)
        rest = rest & ~failed
    if creation:
        c.mb[:, i] = torch.where(rest & (unit >= 0), unit, c.mb[:, i])
    ready = ((sim.mops_tm[:, s, k] < 0) | sim.mops_ready[:, s, k]).all(dim=1)
    fin = rest & (done | torch.full_like(at, in_prog) | ready)
    c.ma[:, i] = torch.where(fin, 1, c.ma[:, i])
    out = torch.where(fin, BT_SUCCESS, out)
    rest = rest & ~fin
    keep = has_c | (torch.full_like(at, creation) & (c.mb[:, i] != NONE))
    out = torch.where(rest & keep, BT_RUNNING, torch.where(rest, BT_FAILURE, out))
    return torch.where(at, out, torch.full_like(out, BT_FRESH))


def _x_recruit(sim, c: _OpCtx, i: int, on: torch.Tensor) -> None:
    """RECRUIT UNITS' EXECUTION (0x8189f0): for the unit the update asked,
    with a Contract ID tag — the tag's contract accepted or in progress for
    that unit stays; any other is cancelled and leaves the tree — a contract
    for it (its value the Recruit Value tag's x 3 for a Bombard unit, its turn
    limit the Time Limit's), held by the tree, submitted, the tag holding it"""
    s = c.s
    tree = c.tree
    tag = tree.tag(i, "Contract ID")
    if tag is None:
        return
    unit = c.mb[:, i]
    m = on & (unit != NONE) & (unit >= 0)
    if not bool(m.any()):
        return
    ai = c.ai
    j = c.tree_contract(c.bb[:, tag])
    held = m & (j >= 0)
    prog = _cget(ai.c_progress, s, j)
    stays = held & ((prog == CP_ACCEPTED) | (prog == CP_IN_PROGRESS)) & (_cget(ai.c_unit, s, j) == unit)
    cancel = held & ~stays
    _cset(ai.c_progress, s, j, CP_CANCELLED, cancel)
    _cset(ai.c_in_tree, s, j, False, cancel)
    go = m & ~stays
    if not bool(go.any()):
        return
    rows = sim._cv_tables()["unit_rows"]
    bomb = torch.tensor([int(r["bombard"]) > 0 for r in rows], dtype=torch.bool, device=sim.device)
    rv = c.tag(i, "Recruit Value")
    base = torch.where(rv == NONE, torch.zeros_like(rv), rv)
    value = base * _FX * torch.where(bomb.take(unit.clamp(min=0)), 3, 1)
    limit = tree.int_(i, "Time Limit")
    limit = limit if limit is not None and limit > 0 else 0
    cid = ai.c_serial[:, s].clone()
    jj = new_contract(ai, s, go, tree=c.ref, unit=unit, value=value, max_turns=limit, assign=True, in_tree=True,
                      progress=CP_CLAIMED)
    submit_contract(ai, s, jj, sim._mops_world(s, c.view), int(sim.turn), go)
    c.bb[:, tag] = torch.where(go, cid, c.bb[:, tag])


def _u_move(sim, c: _OpCtx, i: int, at: torch.Tensor) -> torch.Tensor:
    """OPERATION MOVE's update (0x81a130): per team its members' update
    (`_op_move_update`) over the node's store for it; SUCCESS where every
    team's is, else RUNNING (AlwaysRunning: RUNNING); a team with no goal
    FAILS"""
    s, k = c.s, c.k
    tree = c.tree
    slot = tree.int_(i, "Move To (enum)")
    slot = 1 if slot is None else slot
    rng = tree.int_(i, "Range to goal") or 0
    spread = tree.int_(i, "Unit distance")
    spread = 1 if spread is None else spread
    j = c.T.move_store[c.d][i]
    view = c.view
    op = view["op"]
    u = sim._mops_units(s)
    all_ok = torch.ones_like(at)
    fail = torch.zeros_like(at)
    arrived_bits = torch.zeros_like(c.ref)
    for ti in range(N_TEAMS):
        tm = sim.mops_tm[:, s, k, ti]
        on = at & (tm >= 0) & ~fail
        if not bool(on.any()):
            continue
        goal = sim.mops_goal[:, s, k, ti, slot]
        nog = on & (goal < 0)
        fail |= nog
        on &= ~nog
        listed = sim._mops_member_mask(s, k, ti)
        mem = listed & u["own"]
        dead = listed.sum(dim=1) - mem.sum(dim=1)
        store = sim.mops_mvs[:, s, k, j, ti].clone()
        sg = sim.mops_mvg[:, s, k, j, ti].clone()
        st, arr, rest = sim._op_move_update(on, mem, dead, store, sg, goal, slot == 1, rng, spread, op["rowof"], op["res"],
                                            "major", 100 + s)
        rr = rest.nonzero(as_tuple=True)[0]
        if rr.numel():
            sim.mops_mvs[rr, s, k, j, ti] = store[rr]
            sim.mops_mvg[rr, s, k, j, ti] = sg[rr]
        all_ok &= ~on | (st == BT_SUCCESS)
        arrived_bits = torch.where(on & arr, arrived_bits | (1 << ti), arrived_bits)
    c.mb[:, i] = torch.where(at, arrived_bits, c.mb[:, i])
    if tree.flag(i, "AlwaysRunning"):
        out = _status(c, BT_RUNNING)
    else:
        out = torch.where(all_ok, BT_SUCCESS, BT_RUNNING)
    return torch.where(fail, BT_FAILURE, out)


def _x_move(sim, c: _OpCtx, i: int, on: torch.Tensor) -> None:
    """OPERATION MOVE's execution (0x816cb0): each team (`_op_move_exec`)
    but one arrived of an operation ready (the node names no Leader Tag)"""
    s, k = c.s, c.k
    tree = c.tree
    assert tree.value(i, "Leader Tag") is None, "minor operations: an Operation Move's Leader Tag"
    slot = tree.int_(i, "Move To (enum)")
    slot = 1 if slot is None else slot
    rng = tree.int_(i, "Range to goal") or 0
    op = c.view["op"]
    ready = ((sim.mops_tm[:, s, k] < 0) | sim.mops_ready[:, s, k]).all(dim=1)
    bits = torch.where(c.mb[:, i] == NONE, 0, c.mb[:, i])
    for ti in range(N_TEAMS):
        tm = sim.mops_tm[:, s, k, ti]
        goal = sim.mops_goal[:, s, k, ti, slot]
        g = on & (tm >= 0) & (goal >= 0)
        if not bool(g.any()):
            continue
        u = sim._mops_units(s)
        mem = sim._mops_member_mask(s, k, ti) & u["own"]
        arrived = (bits & (1 << ti)) != 0
        sim._op_move_exec(g, mem, goal, rng, arrived, ready, c.view["done"], op["rowof"], op["res"], "major", 100 + s)


def _u_operation_attack(sim, c: _OpCtx, i: int, at: torch.Tensor) -> torch.Tensor:
    """OPERATION ATTACK (0x80ec10): SUCCESS once the target is gone, RUNNING
    while the operation holds units, else FAILURE"""
    gone = _gone(sim, c)
    return torch.where(gone, BT_SUCCESS, torch.where(_n_units(sim, c) > 0, BT_RUNNING, BT_FAILURE))


def _x_operation_attack(sim, c: _OpCtx, i: int, on: torch.Tensor) -> None:
    """OPERATION ATTACK's execution (0x80c180): per team toward its target
    (goal 1), four passes over its members alive with Movement left — beyond
    its reach (max(1, its range)) to its planning's spot that far within two
    turns, else straight for the target; to its attack spot of the fewest
    turns (none where it stands on one); with a unit on the target each
    ranged member strikes it; each onto the target"""
    s, k = c.s, c.k
    view = c.view
    dev = sim.device
    B = sim.B
    b = torch.arange(B, device=dev)
    for ti in range(N_TEAMS):
        tm = sim.mops_tm[:, s, k, ti]
        target = sim.mops_goal[:, s, k, ti, G_TARGET]
        g = on & (tm >= 0) & (target >= 0)
        if not bool(g.any()):
            continue
        mem = sim.mops_mem[:, s, k, ti].clone()
        NM = mem.shape[1]

        def member(j: int):
            us = mem[:, j]
            uc = us.clamp(min=0)
            ok = g & (us >= 0) & sim.major_unit_alive[b, uc] & (sim.major_unit_seat[b, uc] == 100 + s) \
                & (sim.major_unit_mp[b, uc] > 0)
            return us, uc, ok
        for j in range(NM):
            us, uc, ok = member(j)
            if not bool(ok.any()):
                continue
            ut = sim.major_unit_type[b, uc].clamp(min=0, max=sim.NU - 1)
            reach = sim._type_ranged_range.take(ut).clamp(min=1)
            here = sim.major_unit_tile[b, uc]
            far = ok & (sim.pair_dist[here.clamp(min=0), target.clamp(min=0)].to(torch.long) > reach)
            if not bool(far.any()):
                continue
            spot = sim._mops_plan_spot(s, view, us, target, 2, False, reach)
            sim._mops_move(s, us, torch.where(spot >= 0, spot, target), far)
        for j in range(NM):
            us, uc, ok = member(j)
            if not bool(ok.any()):
                continue
            best = sim._mops_attack_spot(view, us, target)
            sim._mops_move(s, us, best, ok & (best >= 0))
        t_c = target.clamp(min=0)
        occupied = (sim.unit_alive & (sim.unit_tile == t_c.unsqueeze(1)) & (sim.unit_hp > 0)).any(dim=1)
        for j in range(NM):
            us, uc, ok = member(j)
            ut = sim.major_unit_type[b, uc].clamp(min=0, max=sim.NU - 1)
            ok &= occupied & (sim._type_ranged_range.take(ut) > 0)
            if bool(ok.any()):
                sim._mops_strike(s, us, target, ok)
        for j in range(NM):
            us, uc, ok = member(j)
            if not bool(ok.any()):
                continue
            hostile = _hostile_at(sim, s, target)
            sim._mops_strike(s, us, target, ok & hostile)
            sim._mops_move(s, us, target, ok & ~hostile)


def _hostile_at(sim, s: int, plot: torch.Tensor) -> torch.Tensor:
    """[B] a hostile unit minor `s` sees (one with a strength) or a hostile
    city it sees stands on the plot (`moveOnto`)"""
    seat = 100 + s
    seen = sim._barb_seen(seat)
    pc = plot.clamp(min=0)
    tile = sim.unit_tile
    ut = sim.unit_type.clamp(min=0, max=sim.NU - 1)
    vis = sim.unit_alive & (tile == pc.unsqueeze(1)) & sim._seats_hostile(seat, sim.unit_seat)
    if sim._stealth_live:
        stealthy = sim._type_stealth.take(ut) | sim._promo_flag(ut, sim.unit_promos, "STEALTH")
        vis = vis & ~(stealthy & sim._stealth_hidden(seat).gather(1, tile.clamp(min=0)) & (sim.unit_seat != seat))
    if sim._spy_idx >= 0:
        vis = vis & ~((sim.unit_type == sim._spy_idx) & (sim.unit_seat != seat))
    bomb = sim._type_bombard.take(ut)
    rng = torch.where(bomb > 0, torch.zeros_like(bomb), sim._type_ranged_strength.take(ut))
    vis &= (sim._type_combat.take(ut) > 0) | (rng > 0) | (bomb > 0)
    s_at = seen.gather(1, pc.unsqueeze(1)).squeeze(1)
    unit = vis.any(dim=1) & s_at
    ctr = sim._centre_seat_plane().gather(1, pc.unsqueeze(1)).squeeze(1)
    city = (ctr >= 0) & sim._seats_hostile(seat, ctr.unsqueeze(1)).squeeze(1) & s_at
    return (plot >= 0) & (unit | city)


def _u_city_threatened(sim, c: _OpCtx, i: int, at: torch.Tensor) -> torch.Tensor:
    """IS CITY THREATENED (0x813050): the city on the target threatened"""
    t = sim.mops_target[:, c.s, c.k]
    thr = torch.where(t == sim.citystate_center[:, c.s], sim.citystate_threat[:, c.s], torch.full_like(t, -1))
    return torch.where((t >= 0) & (thr > -1), BT_SUCCESS, BT_FAILURE)


def _u_can_alpha(sim, c: _OpCtx, i: int, at: torch.Tensor) -> torch.Tensor:
    """CAN ALPHA CITY (0x812cc0) on the minor's own city: no unit's planning
    strikes it (the list holds it as FRIENDLY_CITY, no spots), so the sum is 0
    against half its hit points left"""
    t = sim.mops_target[:, c.s, c.k]
    city = (t >= 0) & (t == sim.citystate_center[:, c.s])
    hp = sim.citystate_hp[:, c.s]
    return torch.where(city & (hp <= 0), BT_SUCCESS, BT_FAILURE)


def _u_running_units(sim, c: _OpCtx, i: int, at: torch.Tensor) -> torch.Tensor:
    """GARRISON CITY (0x8133c0), OPERATION ATTACK CITY (0x813250) on the
    minor's own city: RUNNING while the operation holds units, else FAILURE"""
    return torch.where(_n_units(sim, c) > 0, BT_RUNNING, BT_FAILURE)


def _x_garrison(sim, c: _OpCtx, i: int, on: torch.Tensor) -> None:
    """GARRISON CITY's execution (0x810d30): over the operation's units in
    order, the one on the city its garrison; of those whose planning reaches
    the city this turn the candidate (the ranged, the bombard, the combat
    strength above the best and the garrison's); with no garrison and no
    military unit of the minor on the city the candidate moves in; with a
    stronger candidate it moves beside the city"""
    s, k = c.s, c.k
    view = c.view
    dev = sim.device
    B = sim.B
    b = torch.arange(B, device=dev)
    city = sim.mops_target[:, s, k]
    g = on & (city >= 0)
    if not bool(g.any()):
        return
    mem = sim.mops_mem[:, s, k].reshape(B, -1)
    gar = torch.full((B,), -1, dtype=torch.long, device=dev)
    g_r = torch.zeros(B, dtype=torch.long, device=dev)
    g_c = torch.zeros(B, dtype=torch.long, device=dev)
    b_r = torch.zeros(B, dtype=torch.long, device=dev)
    b_c = torch.zeros(B, dtype=torch.long, device=dev)
    pick = torch.full((B,), -1, dtype=torch.long, device=dev)
    cb_all = sim._ai_combat("major")
    for j in range(mem.shape[1]):
        us = mem[:, j]
        uc = us.clamp(min=0)
        ok = g & (us >= 0) & sim.major_unit_alive[b, uc] & (sim.major_unit_seat[b, uc] == 100 + s)
        if not bool(ok.any()):
            continue
        ut = sim.major_unit_type[b, uc].clamp(min=0, max=sim.NU - 1)
        cb, rg, bm = cb_all[b, uc], sim._type_ranged_strength.take(ut), sim._type_bombard.take(ut)
        on_city = ok & (sim.major_unit_tile[b, uc] == city)
        gar = torch.where(on_city, us, gar)
        g_c = torch.where(on_city, cb, g_c)
        g_r = torch.where(on_city, torch.maximum(rg, bm - 5), g_r)
        cand = ok & ~on_city & sim._mops_reach1(view, us, city)
        a = cand & (rg > b_r) & (rg > g_r)
        b_r = torch.where(a, rg, b_r)
        pick = torch.where(a, us, pick)
        bb = cand & ~a & (bm - 5 > b_r) & (g_r == 0)
        b_r = torch.where(bb, bm - 5, b_r)
        pick = torch.where(bb, us, pick)
        cc = cand & (cb > b_c) & (cb > g_c)
        b_c = torch.where(cc, cb, b_c)
        pick = torch.where(cc & (pick < 0) & (g_r == 0) & (b_r == 0), us, pick)
    seat = 100 + s
    no_g = g & (gar < 0)
    if bool(no_g.any()):
        cc = city.clamp(min=0)
        held = torch.zeros(B, dtype=torch.bool, device=dev)
        own = sim.major_unit_alive & (sim.major_unit_seat == seat) & (sim.major_unit_tile == cc.unsqueeze(1))
        ut = sim.major_unit_type.clamp(min=0, max=sim.NU - 1)
        fights = (sim._type_combat.take(ut) + sim._type_ranged_strength.take(ut) + sim._type_bombard.take(ut)) > 0
        held = (own & fights).any(dim=1)
        sim._mops_move(s, pick, city, no_g & ~held & (pick >= 0))
    with_g = g & (gar >= 0)
    stronger = (g_r < b_r) | ((g_r <= 0) & (g_c < b_c))
    m = with_g & stronger & (pick >= 0)
    if bool(m.any()):
        spot = sim._mops_plan_spot(s, view, pick, city, 1, True, torch.ones_like(city))
        here = sim.major_unit_tile[b, pick.clamp(min=0)]
        sim._mops_move(s, pick, spot, m & (spot >= 0) & (spot != here))


def _x_attack_city(sim, c: _OpCtx, i: int, on: torch.Tensor) -> None:
    """OPERATION ATTACK CITY's execution (0x8109e0): the list's COMBAT_DISTRICT
    targets within 3 of the target — about a city-state's own city one only
    at war with a city's owner beside it; the assignment over a district
    target is the TS twin's alone"""
    tg = c.view["tg"]
    t = sim.mops_target[:, c.s, c.k].clamp(min=0)
    near = (tg["dk"] == 1) & (sim.pair_dist[t] <= 3)
    u = sim._mops_units(c.s)
    any_m = torch.zeros_like(on)
    for ti in range(N_TEAMS):
        any_m |= (sim._mops_member_mask(c.s, c.k, ti) & u["own"] & (u["mp"] > 0)).any(dim=1)
    if bool((on & any_m & near.any(dim=1)).any()):
        raise NotImplementedError("minor operations: Operation Attack City over a district target (the TS twin's assignment)")


def _defend_pct(c: _OpCtx, i: int) -> int:
    v = c.tree.int_(i, "AutoProtect Percentage")
    return 33 if v is None else v


def _u_defend(sim, c: _OpCtx, i: int, at: torch.Tensor) -> torch.Tensor:
    """OPERATION DEFEND UNITS' update (0x80ee70): SUCCESS, the node marked
    where a team's member is endangered, hurt to AutoProtect Percentage of
    its hit points, or fortified on a plot of danger"""
    s, k = c.s, c.k
    pct = _defend_pct(c, i)
    view = c.view
    danger = view["op"]["danger"]
    u = sim._mops_units(s)
    b = torch.arange(sim.B, device=sim.device)
    marked = torch.zeros_like(at)
    for ti in range(N_TEAMS):
        for jj in range(sim.mops_mem.shape[-1]):
            us = sim.mops_mem[:, s, k, ti, jj]
            ok = at & (us >= 0) & u["own"].gather(1, us.clamp(min=0).unsqueeze(1)).squeeze(1)
            if not bool(ok.any()):
                continue
            uc = us.clamp(min=0)
            plot = sim.major_unit_tile[b, uc].clamp(min=0)
            fort = sim.major_unit_fortify[b, uc] >= 2
            marked |= ok & (sim._mops_endangered(s, us, ok, view) | sim._mops_hurt(us, pct)
                            | (fort & (danger.gather(1, plot.unsqueeze(1)).squeeze(1) > 0)))
    c.ma[:, i] = torch.where(at, marked.long(), c.ma[:, i])
    return _status(c, BT_SUCCESS)


def _x_defend(sim, c: _OpCtx, i: int, on: torch.Tensor) -> None:
    """OPERATION DEFEND UNITS' execution (0x80d790) where marked, per team
    over its members outside Protect Outside Range of the target: the
    endangered — not bombard, with Movement, out of a city — to their safe
    plots (0x716b90); then the hurt (or fortified afloat in danger), not
    bombard: one not dug in off friendly ground released from the team; one
    fortified afloat to its safe plot; one with Movement on the ground of a
    player it is at war with or a plot of danger to its safe plot; each fortified (its turn
    ends where it stands)"""
    s, k = c.s, c.k
    g = on & (c.ma[:, i] == 1)
    if not bool(g.any()):
        return
    pct = _defend_pct(c, i)
    rng = c.tree.int_(i, "Protect Outside Range")
    rng = -1 if rng is None else rng
    view = c.view
    op, done = view["op"], view["done"]
    danger = op["danger"]
    seat = 100 + s
    B, dev = sim.B, sim.device
    b = torch.arange(B, device=dev)
    target = sim.mops_target[:, s, k].clamp(min=0)
    none_taken = torch.zeros(B, sim.T, dtype=torch.bool, device=dev)

    def live(us: torch.Tensor) -> torch.Tensor:
        uc = us.clamp(min=0)
        return (us >= 0) & sim.major_unit_alive[b, uc] & (sim.major_unit_seat[b, uc] == seat) & (sim.major_unit_tile[b, uc] >= 0)

    def off(us: torch.Tensor) -> torch.Tensor:
        if rng < 0:
            return torch.ones(B, dtype=torch.bool, device=dev)
        return sim.pair_dist[sim.major_unit_tile[b, us.clamp(min=0)].clamp(min=0), target].to(torch.long) >= rng

    def to_safe(us: torch.Tensor, m: torch.Tensor, stay_ok: bool) -> None:
        if not bool(m.any()):
            return
        uc = us.clamp(min=0)
        dest = sim._tac_safe_plot(m, uc, "major", seat, danger, op["rowof"], op["res"], none_taken)
        done[b, uc] = torch.where(m, True, done[b, uc])
        here = sim.major_unit_tile[b, uc]
        go = m & (dest >= 0) & (stay_ok | (dest != here))
        sim._mops_move(s, us, dest, go)

    for ti in range(N_TEAMS):
        tm = sim.mops_tm[:, s, k, ti]
        gt = g & (tm >= 0)
        if not bool(gt.any()):
            continue
        n_m = sim.mops_mem.shape[-1]
        # the endangered, in the team's order
        for jj in range(n_m):
            us = sim.mops_mem[:, s, k, ti, jj]
            ok = gt & live(us)
            if not bool(ok.any()):
                continue
            uc = us.clamp(min=0)
            ok &= sim._mops_endangered(s, us, ok, view)
            ut = sim.major_unit_type[b, uc].clamp(min=0, max=sim.NU - 1)
            ok &= off(us) & (sim._type_bombard.take(ut) <= 0) & (sim.major_unit_mp[b, uc] > 0) & ~sim._centre_plane()[b, sim.major_unit_tile[b, uc].clamp(min=0)]
            to_safe(us, ok, True)
        # the hurt
        release = torch.zeros(B, n_m, dtype=torch.bool, device=dev)
        for jj in range(n_m):
            us = sim.mops_mem[:, s, k, ti, jj]
            ok = gt & live(us)
            if not bool(ok.any()):
                continue
            uc = us.clamp(min=0)
            ok &= (sim.major_unit_mp[b, uc] > 0) & off(us)
            plot = sim.major_unit_tile[b, uc].clamp(min=0)
            fort = sim.major_unit_fortify[b, uc]
            wat = sim.water[b, plot]
            dang = danger.gather(1, plot.unsqueeze(1)).squeeze(1) > 0
            afloat = (fort >= 2) & wat & dang
            ok &= sim._mops_hurt(us, pct) | afloat
            ut = sim.major_unit_type[b, uc].clamp(min=0, max=sim.NU - 1)
            ok &= sim._type_bombard.take(ut) <= 0
            if not bool(ok.any()):
                continue
            rel = ok & (fort == 0) & (sim.tile_seat[b, plot] != seat)
            release[:, jj] = rel
            ok &= ~rel
            sea = ok & (fort >= 2) & wat
            to_safe(us, sea, True)
            ok &= live(us)
            plot = sim.major_unit_tile[b, uc].clamp(min=0)
            owner = sim.tile_seat[b, plot]
            orow = sim._seat_row.take(owner.clamp(min=0, max=sim._seat_row.numel() - 1))
            war = (owner >= 0) & (owner != seat) & sim.war[b, int(sim._seat_row[seat])].gather(1, orow.unsqueeze(1)).squeeze(1)
            dang = danger.gather(1, plot.unsqueeze(1)).squeeze(1) > 0
            to_safe(us, ok & (sim.major_unit_mp[b, uc] > 0) & (war | dang), False)
            ok &= live(us)
            done[b, uc] = torch.where(ok, True, done[b, uc])
        if bool(release.any()):
            sim._mops_compact(s, k, ti, ~release, gt)


_UPDATE = {
    "Decode Trigger": _u_decode,
    "Operation Defend Units": _u_defend,
    "Operation Change Target": _u_change_target,
    "Contract Manager Decorator": lambda sim, c, i, at: _u_contract_manager(c, i, at),
    "Recruit Units": _u_recruit,
    "Operation Move": _u_move,
    "Operation Attack Units": _u_attack_units,
    "Operation Attack": _u_operation_attack,
    "Operation Is Ready": _u_is_ready,
    "Is City Threatened": _u_city_threatened,
    "Can Alpha City": _u_can_alpha,
    "Garrison City": _u_running_units,
    "Operation Attack City": _u_running_units,
}

_EXECUTE = {
    "Operation Defend Units": _x_defend,
    "Recruit Units": _x_recruit,
    "Operation Move": _x_move,
    "Operation Attack Units": _x_attack_units,
    "Operation Attack": _x_operation_attack,
    "Garrison City": _x_garrison,
    "Operation Attack City": _x_attack_city,
}
