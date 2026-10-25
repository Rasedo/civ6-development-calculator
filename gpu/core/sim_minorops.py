"""THE CITY-STATES' AND THE FREE CITIES' OPERATIONS on the GPU
(cpu/core/minorOps.ts and cpu/core/freeOps.ts over the one operation manager
cpu/core/operations; `tools/civ6lab/dll_readings.md` "C-97: the operations",
"C-96: the city-states' operations", "C-60: the Free Cities Raid"): each
holder's manager state as `mops_*` planes ([B, S + 1, ...]: a row per minor,
then the Free Cities' `FR`), a minor's turn in three parts as the game's
Control Manager runs a player's lists —

 - B: the military AI's turn (`_mops_evaluate`, from `_minor_military_turn`,
   before the turn's knowledge base look): the
   members gone leave their operations, the candidates — Attack Barb Camp
   against each camp its knowledge base holds, Naval Superiority off its
   coastal city, the running operations' naming their backups on the
   strengths the last run refreshed — and the new one to start chosen under
   the trait's limits;
 - A: the city's defence event starts City Defense (`_mops_start`, the
   minor world's `start_operation`);
 - C: in its tactical pass, once each unit's planning is taken
   (`_mops_run`, from `_minor_pass`): each running operation's strengths
   refreshed, the chosen one started, then each operation's tree ticks in
   priority order (the highest first, of equals in slot order) — the
   interpreter of sim_citytrees.py over the operation's
   nodes — and the operations' units' turns are theirs.

A minor runs Attack Barb Camp, Barb Camp Tech Boost (never started),
Civilian Builder Capture (never started), City Defense and Naval Superiority
(`MINOR_OP_DEFS`); the Free Cities the Free Cities Raid, started by a Free
City's signal (`_free_raid_start`) and run in their tactical pass. A unit is
its slot in its holder's pool (a minor's the majors' pool, the Free Cities'
the hostile pool); an operation's tree id is the holder's city AI's tree
serial; its contracts are the city AI's book's (`cai_*`, the holder's row),
held in the operation's tree.
"""

from __future__ import annotations

from .simbase import *  # noqa: F401,F403 — torch, constants, helpers: the shared floor
from . import simbase
from .sim_citytrees import (
    BT_ERROR, BT_FAILURE, BT_FRESH, BT_RUNNING, BT_SKIPPED, BT_SUCCESS, CP_ACCEPTED, CP_CANCELLED, CP_CLAIMED,
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
# the age at most of a record the army strength reads (`ARMY_READ_AGE`,
# 0x5eadb0 -> 0x5ef760 with 2)
_ARMY_READ_AGE = 2
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
    """the static tables of the operations: the definitions (by index:
    Attack Barb Camp, Barb Camp Tech Boost, Civilian Builder Capture, City
    Defense, Naval Superiority, the Free Cities Raid), their teams and requirements,
    the trees compiled, the unit AI types of each AI unit row, the Priority
    types, the trait's limits"""

    def __init__(self, rules):
        ao = rules.ai_operations
        cb = rules.ai_city_build
        self.defs = list(ao["defs"])
        self.names = [d["name"] for d in self.defs]
        self.d_abc = self.names.index("Attack Barb Camp")
        self.d_cd = self.names.index("City Defense")
        self.d_nav = self.names.index("Naval Superiority")
        self.d_raid = self.names.index("Free Cities Raid")
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
        # the "Upgrade Units" trees' priority (TriggeredBehaviorTrees)
        self.upgrade_priority = int(ao["upgradeTreePriority"])
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
    # -- the holder: a minor's row `s`, else the Free Cities' `FR` ----------

    def _mops_pre(self, s: int) -> str:
        """the pool of the holder's units"""
        return "barb" if s == self.FR else "major"

    def _mops_seat(self, s: int) -> int:
        return FREE_SEAT if s == self.FR else 100 + s

    def _mops_kb(self, s: int) -> int:
        """the holder's knowledge base row"""
        return self.FK if s == self.FR else s

    def _mops_u(self, s: int, name: str) -> torch.Tensor:
        """the holder's pool plane `name` [B, P]"""
        return getattr(self, f"{self._mops_pre(s)}_unit_{name}")

    def _mops_best(self, s: int) -> torch.Tensor:
        """[B] the holder's best melee Combat Strength (`bestCombatStrength`)"""
        return self.free_best_melee.long() if s == self.FR else self.citystate_best_melee[:, s].long()

    def _mops_fights(self, s: int, owner: torch.Tensor) -> torch.Tensor:
        """the holder at war with each player of `owner` [B, N] (the Free
        Cities with every full civ, `freeFights`)"""
        seat = self._mops_seat(s)
        orow = self._seat_row.take(owner.clamp(min=0, max=self._seat_row.numel() - 1))
        war = (owner >= 0) & self.war[:, int(self._seat_row[seat])].gather(1, orow)
        if s == self.FR:
            war = war | ((owner >= 0) & (owner < self.n_majors))
        return war

    # -- the state --------------------------------------------------------

    def _mops_tables(self) -> MinorOpsTables:
        return minor_ops_tables(self.rules)

    def _init_minor_ops(self, rules, B: int, s_pad: int, device) -> None:
        """the planes of each holder's operation manager (`OpsAi`), `s_pad`
        rows: the minors', then the Free Cities'"""
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
        # the player it is against (op +0x2a0, -1 none)
        self.mops_enemy = torch.full((B, S, NO), -1, dtype=L, device=device)
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
        # (over the holder's pool, its first slots) and the goal they are held
        # for (-1 none: no store yet)
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
        # the camps the knowledge base holds, in its order (-1 padded); the
        # barbarians' (`barbSeat.campsKnown`)
        self.mops_camps = torch.full((B, S, N_CAMPS), -1, dtype=L, device=device)
        self.barb_camps_known = torch.full((B, N_CAMPS), -1, dtype=L, device=device)
        # the plots its knowledge base's looks have seen or a meeting revealed
        # (`CityState.revealed`)
        self.mops_revealed = torch.zeros(B, S, self.T, dtype=torch.bool, device=device)
        # the "Upgrade Units" trees (`CityState.upgrading`): their units over
        # the holder's pool, whether a tree runs, a technology or civic gained
        # since their last tick
        self.mops_upg = torch.zeros(B, S, P, dtype=torch.bool, device=device)
        self.mops_upg_on = torch.zeros(B, S, dtype=torch.bool, device=device)
        self.mops_upg_trig = torch.zeros(B, S, dtype=torch.bool, device=device)

    # -- the minor's units --------------------------------------------------

    def _mops_units(self, s: int) -> dict:
        """holder `s`'s units as its operations read them (`MajorUnitView`),
        over its pool [B, P]: alive and its own, the pool order's key
        (its pool slot, an unslotted unit as slot 0, the pool's order among
        equals), its AI unit row, plot, combat, ranged and bombard strengths,
        base range, damage, Movement left (in the pool's scale and whole),
        base Movement"""
        seat = self._mops_seat(s)
        pu = lambda n: self._mops_u(s, n)  # noqa: E731
        P = pu("alive").shape[1]
        dev = self.device
        own = pu("alive") & (pu("seat") == seat)
        ut = pu("type").clamp(min=0, max=self.NU - 1)
        key = pu("pslot").clamp(min=0) * P + torch.arange(P, device=dev).unsqueeze(0)
        er = self._cv_tables()["engine_row"].to(dev)
        row = er.take(ut)
        hp_max = int(self.rules.combat["unitHp"])
        naval = self.unit_naval.take(ut)
        base = self._type_moves.take(ut)
        emb = pu("emb") & ~naval
        if bool(emb.any()):
            techs = self.citystate_techs[:, s]
            extra = torch.zeros(self.B, dtype=torch.long, device=dev)
            for t, v in self._embark_move_techs:
                if t >= 0:
                    extra = extra + techs[:, t].long() * v
            base = torch.where(emb, self._embark_moves + extra.unsqueeze(1), base)
        mp = pu("mp")
        return {
            "own": own, "key": key, "row": row, "tile": pu("tile"),
            "combat": self._ai_combat(self._mops_pre(s)), "ranged": self._type_ranged_strength.take(ut),
            "bombard": self._type_bombard.take(ut), "range": self._type_ranged_range.take(ut),
            "dmg": hp_max - pu("hp"), "mp": mp, "mp_whole": torch.div(mp, self._mp_scale, rounding_mode="floor"),
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
        self.mops_revealed[:, s] |= sight & alive.unsqueeze(1)
        self.mops_camps[:, s] = torch.where(alive.unsqueeze(1), self._kb_camps(self.mops_camps[:, s], self.mops_revealed[:, s]),
                                            self.mops_camps[:, s])

    def _kb_camps(self, known: torch.Tensor, sight: torch.Tensor) -> torch.Tensor:
        """`lookCamps`: the knowledge base's camps `known` [B, N_CAMPS] in its
        order, a camp whose plot `sight` [B, T] holds with none there
        dropped, each camp on a plot it holds added in plot order"""
        T = self.T
        dev = self.device
        now = torch.zeros(self.B, T + 1, dtype=torch.bool, device=dev)
        cp = self.camp_tile
        now.scatter_(1, torch.where(cp >= 0, cp, T), True)
        now = now[:, :T]
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
        return torch.where(ar < n.unsqueeze(1), new, torch.full_like(new, -1))

    def _barb_kb_camps(self, seen: torch.Tensor) -> None:
        """the barbarians' knowledge base's camps (`barbCampsLook`): over the
        plots they see or have revealed (`barb_explored`; every plot where
        they revealed none)"""
        ex = self.barb_explored
        rev = seen | ex | ~ex.any(dim=1, keepdim=True)
        self.barb_camps_known = self._kb_camps(self.barb_camps_known, rev)

    def _mops_records(self, s: int) -> dict:
        """the knowledge base's army records of row `s` (a minor, the barbarians'
        `BK`) ([B, K]): live, those the
        army strength reads (`recentOf`: aged at most ARMY_READ_AGE, all
        where the row never aged), owner, AI unit row, plot, combat and
        ranged strengths, damage"""
        T = self._cv_tables()
        dev = self.device
        slot = self.citystate_kb_slot[:, s]
        typ = self.citystate_kb_type[:, s].long()
        er = T["engine_row"].to(dev)
        tc = typ.clamp(min=0, max=self.NU - 1)
        live = slot != -2
        aged = self.citystate_kb_aged[:, s].unsqueeze(1)
        recent = live & ((aged < 0) | (aged - self.citystate_kb_seen[:, s].long() <= _ARMY_READ_AGE))
        return {"live": live, "recent": recent, "slot": slot.long(), "owner": self.citystate_kb_owner[:, s].long(),
                "row": torch.where(typ >= 0, er.take(tc), torch.full_like(typ, -1)),
                "plot": self.citystate_kb_plot[:, s].long(),
                "combat": self._type_combat.take(tc), "ranged": self._type_ranged_strength.take(tc),
                "dmg": self.citystate_kb_damage[:, s].long()}

    # -- the unit production entries ----------------------------------------

    def _mops_unit_rows(self, s: int, u: dict) -> dict:
        """`seatUnitRows` for holder `s` (the military AI's unit production
        entries as the unit choice reads them, `unitProductionEntries`): per
        AI unit row [B, NU] the entry, obsolete, buildable, maintained, the
        at-war and every player's sums (24.8), the strength"""
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
            mres = torch.tensor([E["resource"].get(r["maintenanceResource"], -2) if r["maintenanceResource"] else -1
                                 for r in rows], dtype=torch.long, device=dev)
            cache = self._mops_rows_static = {"version": version, "combat": combat, "strength": strength, "res": res,
                                              "mres": mres}
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
        # a StrategicResource the minor's stock less its reservations holds
        # (0x7989e0 at 0x798d11: 0x4aa790, ownership 0, the reservations off)
        res = cache["res"]
        srow = self._CITY_MINOR0 + s
        if bool((res >= 0).any()):
            free = self._stock_bank(srow) - self._stock_reserved(srow)
            for k in (res >= 0).nonzero(as_tuple=True)[0].tolist():
                slot = int(self._strat_slot_of[int(res[k])])
                if slot >= 0:
                    buildable[:, k] &= free[:, slot] > 0
                else:
                    buildable[:, k] = False
        buildable &= res != -2
        # the maintenance resource's turn income above its units' fuel bill
        # (0x79c277: Player_Resources +0x350 against 0x4ab270)
        mres = cache["mres"]
        maintained = torch.ones(B, nu, dtype=torch.bool, device=dev)
        if bool((mres >= 0).any()):
            income = self._seat_stock_income(srow)
            bill = self._unit_upkeep_bill(srow)
            for k in (mres >= 0).nonzero(as_tuple=True)[0].tolist():
                slot = int(self._strat_slot_of[int(mres[k])])
                if slot >= 0:
                    maintained[:, k] &= income[:, slot] > bill[:, slot]
        # the minor's own units by row
        own = torch.zeros(B, nu + 1, dtype=torch.long, device=dev)
        own.scatter_add_(1, torch.where(u["own"] & (u["row"] >= 0), u["row"], torch.full_like(u["row"], nu)), u["own"].long())
        own = own[:, :nu]
        entry = cache["version"].unsqueeze(0) & ~(obsolete & (own <= 0))
        rec = self._mops_records(self._mops_kb(s))
        live = rec["live"] & (rec["row"] >= 0)
        n_all = torch.zeros(B, nu + 1, dtype=torch.long, device=dev)
        n_all.scatter_add_(1, torch.where(live, rec["row"], torch.full_like(rec["row"], nu)), live.long())
        n_all = n_all[:, :nu]
        war = live & self._mops_fights(s, rec["owner"])
        n_war = torch.zeros(B, nu + 1, dtype=torch.long, device=dev)
        n_war.scatter_add_(1, torch.where(war, rec["row"], torch.full_like(rec["row"], nu)), war.long())
        n_war = n_war[:, :nu]
        opp = cache["combat"].unsqueeze(0) & ~obsolete & (n_all > 0)
        n_all = torch.where(opp, n_all, torch.zeros_like(n_all))
        n_war = torch.where(opp, n_war, torch.zeros_like(n_war))
        eff_t = T["eff"].to(dev).t()                                  # [opposing, entry]
        return {"entry": entry, "obsolete": obsolete, "buildable": buildable, "maintained": maintained,
                "all": n_all @ eff_t, "war": n_war @ eff_t,
                "strength": cache["strength"].unsqueeze(0).expand(B, -1)}

    def _mops_fits(self, rows: dict, need: torch.Tensor, full: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """per entry [B, NU]: it may be chosen for the team's needed types
        `need` and full ones `full` ([B, NAT]) — standing, of a needed type, of
        no full one, maintained — and whether a needed type it carries is a
        Priority one"""
        Tm = self._mops_tables()
        ua = Tm.unit_ai.to(self.device).to(torch.long)                  # [NU, NAT]
        pr = Tm.prio.to(self.device)
        matched = (need.long() @ ua.t()) > 0
        prio = ((need & pr.unsqueeze(0)).long() @ ua.t()) > 0
        fullh = (full.long() @ ua.t()) > 0
        ok = rows["entry"] & rows["buildable"] & ~rows["obsolete"] & matched & ~fullh & rows["maintained"]
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
        P = self._mops_u(s, "alive").shape[1]
        m = self.mops_mem[:, s, k, ti]
        out = torch.zeros(self.B, P + 1, dtype=torch.bool, device=self.device)
        out.scatter_(1, torch.where(m >= 0, m, P), True)
        return out[:, :P]

    def _mops_member_rank(self, s: int, k: int, ti: int) -> torch.Tensor:
        """[B, P] each listed member's place in the team's list, -1 none"""
        P = self._mops_u(s, "alive").shape[1]
        m = self.mops_mem[:, s, k, ti]
        out = torch.full((self.B, P + 1), -1, dtype=torch.long, device=self.device)
        pos = torch.arange(m.shape[1], device=self.device).unsqueeze(0).expand_as(m)
        out.scatter_(1, torch.where(m >= 0, m, P), pos)
        return out[:, :P]

    def _mops_held(self, s: int) -> torch.Tensor:
        """[B, P] the units in a job of holder `s` but the pass's (`jobOf`):
        any of its operations' teams lists, its "Upgrade Units" trees hold"""
        P = self._mops_u(s, "alive").shape[1]
        m = self.mops_mem[:, s].reshape(self.B, -1)
        out = torch.zeros(self.B, P + 1, dtype=torch.bool, device=self.device)
        out.scatter_(1, torch.where(m >= 0, m, P), True)
        return out[:, :P] | self.mops_upg[:, s, :P]

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
        urow = er.take(self._mops_u(s, "type").gather(1, uid.clamp(min=0).unsqueeze(1)).squeeze(1).clamp(min=0, max=self.NU - 1))
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
        ours = self._mops_best(s)
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
        near = rec["recent"] & (rec["plot"] >= 0) & (rd <= 3) & on.unsqueeze(1)
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
        estr = self._ops_enemy_str(self._mops_seat(s), self._mops_kb(s), tgt, self.mops_enemy[:, s, k])
        self.mops_estr[:, s, k] = torch.where(on, estr, self.mops_estr[:, s, k])
        for ti in range(N_TEAMS):
            self._mops_team_update(s, k, ti, on, u, rows)
            self._mops_update_team(s, k, ti, on, u, tg)
        tot = torch.where(self.mops_tm[:, s, k] >= 0, self.mops_tstr[:, s, k], torch.zeros_like(self.mops_tstr[:, s, k])).sum(dim=1)
        self.mops_str[:, s, k] = torch.where(on, tot, self.mops_str[:, s, k])

    # -- the pool -------------------------------------------------------------

    def _mops_start(self, s: int, d: int, target: torch.Tensor, rally: torch.Tensor, mask: torch.Tensor,
                    enemy: torch.Tensor | None = None) -> torch.Tensor:
        """`startOperation` (0x73a120) of definition `d` where `mask`: a pool
        slot (the one freed last, else a new one), its tree's id the city AI's
        next, its teams (a team's Condition: IsCoastalTarget, water within 1
        of the target), target, rally and the player it is against (`enemy`,
        none: -1), its tree fresh. [B] its id (-1 none)"""
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
        ene = enemy if enemy is not None else torch.full((B,), -1, dtype=torch.long, device=dev)
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
            self.mops_enemy[rows, s, kk] = ene[rows]
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
        self.mops_enemy[rows, s, k] = -1
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
        """[B, P] the units in a job of holder `s` (unit +0x7d0, `minorJobUnits`):
        listed in any of its running operations, held by its "Upgrade Units"
        trees"""
        return self._mops_op_units(s) | self.mops_upg[:, s, :self._mops_u(s, "alive").shape[1]]

    def _mops_op_units(self, s: int) -> torch.Tensor:
        """[B, P] the units listed in any running operation of holder `s`"""
        P = self._mops_u(s, "alive").shape[1]
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
        units as they stand and its knowledge base's records (`recentOf`) of
        its units gone (`own`), or its records of the barbarians'"""
        r = self._mops_records(s)
        pz = plot.clamp(min=0).unsqueeze(1)
        rd = self.pair_dist[r["plot"].clamp(min=0), pz].to(torch.long)
        rterm = self._mops_army_term(r["combat"], r["ranged"], r["dmg"])
        if not own:
            m = r["recent"] & (r["owner"] == BARB_SEAT) & (rd <= radius)
            return torch.where(m, rterm, torch.zeros_like(rterm)).sum(dim=1)
        P = u["own"].shape[1]
        rel = r["slot"] - self.POOL_LO[self._mops_pre(s)]
        standing = (rel >= 0) & (rel < P) & u["own"].gather(1, rel.clamp(min=0, max=P - 1))
        gone = r["recent"] & (r["owner"] == self._mops_seat(s)) & ~standing & (rd <= radius)
        d = self.pair_dist[u["tile"].clamp(min=0), pz].to(torch.long)
        term = self._mops_army_term(u["combat"], u["ranged"], u["dmg"])
        m = u["own"] & (d <= radius)
        return (torch.where(m, term, torch.zeros_like(term)).sum(dim=1)
                + torch.where(gone, rterm, torch.zeros_like(rterm)).sum(dim=1))

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
        sea = self._mops_naval_target(s)
        # the running operations' candidates name their backups, on the
        # strengths the last run refreshed (`operationsEvaluate`)
        for k in range(N_OPS):
            for d in (Tm.d_abc, Tm.d_nav):
                m = alive & (self.mops_def[:, s, k] == d)
                if not bool(m.any()):
                    continue
                if d == Tm.d_abc:
                    v, t = self._mops_camp_eval(s, self.mops_target[:, s, k], self.mops_str[:, s, k], m, u)
                else:
                    v, t = self._mops_naval_eval(self.mops_target[:, s, k], sea), sea
                ok = m & v
                self.mops_bk_target[:, s, k] = torch.where(ok, t, self.mops_bk_target[:, s, k])
                self.mops_bk_rally[:, s, k] = torch.where(ok, self.mops_target[:, s, k], self.mops_bk_rally[:, s, k])
        # of the new candidates that start themselves (Attack Barb Camp,
        # priority 3, then Naval Superiority, priority 2) the first valid one
        # under the trait's limits; a valid one at its limit leaves the next
        # its place
        centre = self.citystate_center[:, s]
        v_abc, t_abc = self._mops_camp_eval(s, centre, None, alive, u)
        v_nav = self._mops_naval_eval(centre, sea)
        ok_abc = alive & v_abc & self._mops_under_limit(s, Tm.d_abc)
        ok_nav = alive & v_nav & self._mops_under_limit(s, Tm.d_nav) & ~ok_abc
        ok = ok_abc | ok_nav
        pick = torch.where(ok_abc, Tm.d_abc, torch.where(ok_nav, Tm.d_nav, -1))
        self.mops_pick[:, s] = torch.where(alive, pick, self.mops_pick[:, s])
        self.mops_pick_target[:, s] = torch.where(ok_abc, t_abc, torch.where(ok_nav, sea, self.mops_pick_target[:, s]))
        self.mops_pick_rally[:, s] = torch.where(ok, centre, self.mops_pick_rally[:, s])

    def _mops_under_limit(self, s: int, d: int) -> torch.Tensor:
        """[B] minor `s` runs fewer operations of definition `d`'s
        OperationType than its trait's limit"""
        Tm = self._mops_tables()
        typ = Tm.defs[d]["operationType"]
        same = torch.zeros(self.B, dtype=torch.long, device=self.device)
        for dd, dfn in enumerate(Tm.defs):
            if dfn["operationType"] == typ:
                same += (self.mops_def[:, s] == dd).sum(dim=1)
        return same < Tm.limits.get(typ, 0)

    def _mops_naval_target(self, s: int) -> torch.Tensor:
        """TARGET_NAVAL_SUPERIORITY of minor `s` (0x747230): where its city is
        coastal land, the first sea plot (not a Lake) of the ring walk within
        4 of it; [B] -1 none. Its value 100 and the enemy strength (the
        majors' largest best combat strength) weigh no other target"""
        ring = getattr(self, "_mops_ring4", None)
        if ring is None:
            ring = self._mops_ring4 = torch.tensor(simbase.barb_ring_table(self.W, self.H, self.wrap_x, 4),
                                                   dtype=torch.long, device=self.device)
        ctr = self.citystate_center[:, s]
        cc = ctr.clamp(min=0)
        pl = ring[cc]
        pc = pl.clamp(min=0)
        sea = (pl >= 0) & self.water.gather(1, pc) & (self.terrain.gather(1, pc) != self._terr_lake)
        first = sea.long().argmax(dim=1, keepdim=True)
        has = (sea.any(dim=1) & (ctr >= 0) & self.coastal_land.gather(1, cc.unsqueeze(1)).squeeze(1)
               & (self.citystate_pop[:, s] > 0))
        return torch.where(has, pl.gather(1, first).squeeze(1), torch.full_like(ctr, -1))

    def _mops_naval_eval(self, rally: torch.Tensor, sea: torch.Tensor) -> torch.Tensor:
        """`evaluate` of Naval Superiority from one rally [B]: valid where the
        target stands and lies off the rally (no distance limit, no least
        odds)"""
        ok = (sea >= 0) & (rally >= 0)
        d = self.pair_dist[rally.clamp(min=0), sea.clamp(min=0)].to(torch.long)
        return ok & (d != 0)

    # -- the operations' run (C) ------------------------------------------------

    def _mops_run(self, s: int, act: torch.Tensor, op: dict, done: torch.Tensor) -> None:
        """`operationsRun` for holder `s` in its pass (`op` the pass's opening,
        `done` its units' turns): each running operation refreshed, the pick
        started, the trees by priority (the highest first, of equals in slot
        order); the operations' units' turns end; the units whose moves an
        order ended (0x56d6f0) read no Movement through the run and take it
        back after it (their rest kept)"""
        Tm = self._mops_tables()
        on = act & ((self.mops_def[:, s] >= 0).any(dim=1) | (self.mops_pick[:, s] >= 0))
        upg = s != self.FR and bool((act & (self.mops_upg_on[:, s] | self.mops_upg_trig[:, s])).any())
        if not bool(on.any()):
            if upg:
                self._mops_upgrade_trees(s, act, done)
            return
        tg = op["tg"] if op["tg"] is not None else self._tac_targets(self._mops_seat(s), self._mops_kb(s))
        view = {"op": op, "done": done, "tg": tg, "rows": None, "world": None,
                "ended": torch.zeros_like(self.major_unit_mp, dtype=torch.bool),
                "ended_mp": torch.zeros_like(self.major_unit_mp)}
        u = self._mops_units(s)
        rows = view["rows"] = self._mops_unit_rows(s, u)
        for k in range(N_OPS):
            self._mops_refresh(s, k, on, u, rows, tg)
        for d in (Tm.d_abc, Tm.d_nav):
            pick = on & (self.mops_pick[:, s] == d)
            if bool(pick.any()):
                self._mops_start(s, d, self.mops_pick_target[:, s], self.mops_pick_rally[:, s], pick)
        self.mops_pick[:, s] = torch.where(on, -1, self.mops_pick[:, s])
        # the trees by priority, the highest first, of equals in slot order
        # (`operationsRun`: the tree manager's tick per priority), the
        # "Upgrade Units" trees after the operations of their own
        prios = {int(Tm.defs[d]["priority"]) for d in Tm.trees} | ({Tm.upgrade_priority} if upg else set())
        for prio in sorted(prios, reverse=True):
            for k in range(N_OPS):
                for d in Tm.trees:
                    if int(Tm.defs[d]["priority"]) != prio:
                        continue
                    m = on & (self.mops_def[:, s, k] == d)
                    if bool(m.any()):
                        self._mops_tick(s, k, d, m, view)
            if upg and prio == Tm.upgrade_priority:
                self._mops_upgrade_trees(s, act, done)
        busy = self._mops_busy(s) & self._mops_u(s, "alive") & (self._mops_u(s, "seat") == self._mops_seat(s))
        done |= busy & on.unsqueeze(1) & (op["rowof"] >= 0)
        if bool(view["ended"].any()):
            self.major_unit_mp.copy_(torch.where(view["ended"], view["ended_mp"], self.major_unit_mp))

    def _mops_upgrade_trees(self, s: int, act: torch.Tensor, done: torch.Tensor) -> None:
        """`upgradeTreesTick` for minor `s` where `act` (its pass, `done` its
        units' turns): where a tree runs or the trigger stands — Find
        Available Unit's offer (the units in no job, their turn not done, then
        those of its operations of a lower priority, which leave them) each
        whose upgrade its research unlocks joining, none held ending the
        trees; Find Unit Targets (the city centre, a ship's a coastal centre
        or else the Harbor's plot), none ending the trees; Upgrade Units'
        execution (in pool order, the full test and the treasury, the
        economic AI's purchase); Move Unit's (each left for its target); the
        units' turns done"""
        Tm = self._mops_tables()
        trig = act & self.mops_upg_trig[:, s]
        self.mops_upg_trig[:, s] &= ~act
        go = act & (self.mops_upg_on[:, s] | trig)
        if not bool(go.any()):
            return
        u = self._mops_units(s)
        P = u["own"].shape[1]
        own = u["own"]
        held = self.mops_upg[:, s, :P] & own & go.unsqueeze(1)
        vis = self._minor_upgrade_visible(s)[:, :P]
        # Find Available Unit: the free units, then the lower-priority operations'
        free = own & ~self._mops_op_units(s) & ~held & ~done & go.unsqueeze(1)
        held = held | (free & vis)
        for k in range(N_OPS):
            low = torch.zeros_like(go)
            for dd, dfn in enumerate(Tm.defs):
                if int(dfn["priority"]) < Tm.upgrade_priority:
                    low |= self.mops_def[:, s, k] == dd
            low &= go
            if not bool(low.any()):
                continue
            for ti in range(N_TEAMS):
                mem = self.mops_mem[:, s, k, ti]
                mc = mem.clamp(min=0)
                take = (mem >= 0) & low.unsqueeze(1) & own.gather(1, mc) & ~done.gather(1, mc) & vis.gather(1, mc)
                if bool(take.any()):
                    rows = take.nonzero(as_tuple=True)
                    held[rows[0], mem[rows]] = True
                gone = (mem >= 0) & held.gather(1, mc)
                self._mops_compact(s, k, ti, ~gone, low)
        some = held.any(dim=1)
        # Find Unit Targets: the city centre; a ship's a coastal centre, else
        # the city's Harbor
        centre = self.citystate_center[:, s]
        cc = centre.clamp(min=0)
        coastal = self.coastal_land.gather(1, cc.unsqueeze(1)).squeeze(1)
        harbor = torch.full_like(centre, -1)
        if self._harbor_didx >= 0:
            harbor = self.city_dist_tile[:, self._CITY_MINOR0 + s, 0, self._harbor_didx]
        naval = self.unit_naval.take(self._mops_u(s, "type").clamp(min=0, max=self.NU - 1))
        sea_t = torch.where(coastal, centre, harbor)
        target = torch.where(naval, sea_t.unsqueeze(1), centre.unsqueeze(1))
        target = torch.where(centre.unsqueeze(1) >= 0, target, torch.full_like(target, -1))
        aimed = (held & (target >= 0)).any(dim=1)
        live = go & some & aimed
        held &= live.unsqueeze(1)
        # Upgrade Units' execution, then Move Unit's, in pool order
        order, _n = self._mops_in_order(held, u["key"])
        cost = torch.full_like(self.citystate_balance[:, s], int(self._mb_upgrade_gold * _FX))
        for j in range(order.shape[1]):
            us = order[:, j]
            m = live & (us >= 0)
            if not bool(m.any()):
                continue
            uc = us.clamp(min=0)
            can = (self._minor_can_upgrade(s)[:, :P].gather(1, uc.unsqueeze(1)).squeeze(1)
                   & self._afford(self.citystate_treasury[:, s], self._mb_upgrade_gold) & m)
            if not bool(can.any()):
                continue
            sv, bal, bought = self._cv_upgrade_purchase(self.citystate_savings[:, s], self.citystate_balance[:, s], cost)
            bought &= can
            self.citystate_savings[:, s] = torch.where(bought.unsqueeze(1), sv, self.citystate_savings[:, s])
            self.citystate_balance[:, s] = torch.where(bought, bal, self.citystate_balance[:, s])
            up = self._minor_upgrade_unit(s, bought, us)
            if bool(up.any()):
                rr = up.nonzero(as_tuple=True)[0]
                held[rr, us[rr]] = False
        order, _n = self._mops_in_order(held, u["key"])
        for j in range(order.shape[1]):
            us = order[:, j]
            m = live & (us >= 0)
            if not bool(m.any()):
                continue
            dest = target.gather(1, us.clamp(min=0).unsqueeze(1)).squeeze(1)
            self._mops_move(s, us, dest, m)
        done |= held
        self.mops_upg[:, s, :P] = torch.where(go.unsqueeze(1), held, self.mops_upg[:, s, :P])
        self.mops_upg_on[:, s] = torch.where(go, live, self.mops_upg_on[:, s])

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
            # a selector's update runs its children, as Not's (the decorator
            # update 0x6a7bd0 returns 0)
            if (n["shape"] == SHAPE_SELECTOR or n["type"] == "Not") and h is None:
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
            if n["type"] == "Naval Choose Target":
                own = torch.where(run & (c.ma[:, i] == 1), torch.full_like(cur, i + 1), torch.full_like(cur, n["end"]))
            elif n["type"] in _NEXT_MEM:
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
        ours = self._mops_best(s)
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
        P = self._mops_u(s, "alive").shape[1]
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
        seat = self._mops_seat(s)
        pre = self._mops_pre(s)
        pu = lambda n: self._mops_u(s, n)  # noqa: E731
        tg, op = view["tg"], view["op"]
        danger = op["danger"]
        ut = pu("type")[b, jc].clamp(min=0, max=self.NU - 1)
        cb_all = self._ai_combat()
        mcb = cb_all[:, self.POOL_LO[pre]:self.POOL_HI[pre]][b, jc]
        fights = (mcb > 0) | (self._type_ranged_strength.take(ut) > 0) | (self._type_bombard.take(ut) > 0)
        plot = pu("tile")[b, jc].clamp(min=0)
        near = 2 * self._type_moves.take(ut)
        d = self.pair_dist[plot].to(torch.long)  # [B, T]
        own = pu("alive") & (pu("seat") == seat)
        own_d = self.pair_dist[plot.unsqueeze(1), pu("tile").clamp(min=0)].to(torch.long)
        others = torch.arange(own.shape[1], device=dev).unsqueeze(0) != jc.unsqueeze(1)
        beside = (own & others & (own_d == 1) & (pu("tile") >= 0)).any(dim=1)
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
        dmg_now = hp_max - pu("hp")[b, jc].long()
        weak = (total > 0) & ~fights
        land = ~self.water[b, plot]
        return on & ((weak & land) | (~weak & (dmg_now + total > hp_max)))

    def _mops_hurt(self, s: int, j: torch.Tensor, pct: int) -> torch.Tensor:
        """[B] bool — holder `s`'s unit at pool slot `j` hurt to `pct` percent
        of its hit points (single precision)"""
        b = torch.arange(self.B, device=self.device)
        hp_max = int(self.rules.combat["unitHp"])
        bar = float(torch.tensor(hp_max, dtype=_F32) * torch.tensor(float(torch.tensor(pct, dtype=_F32) * torch.tensor(0.01, dtype=_F32)), dtype=_F32))
        return (hp_max - self._mops_u(s, "hp")[b, j.clamp(min=0)].long()).to(torch.float64) >= bar

    def _mops_move(self, s: int, us: torch.Tensor, dest: torch.Tensor, mask: torch.Tensor) -> None:
        """a member's move order to `dest` (tactical `moveTo`, no strike):
        none where it stands there or has no Movement left"""
        m = mask & (us >= 0)
        if not bool(m.any()):
            return
        b = torch.arange(self.B, device=self.device)
        uc = us.clamp(min=0)
        m &= (self._mops_u(s, "tile")[b, uc] != dest) & (self._mops_u(s, "mp")[b, uc] > 0) & (dest >= 0)
        self._tac_move_to(m, uc, dest, self._mops_pre(s), self._mops_seat(s), strike=False)

    def _mops_strike(self, s: int, us: torch.Tensor, plot: torch.Tensor, mask: torch.Tensor) -> None:
        """a member's blow on `plot` (`passOrders.strike`): a ranged unit within
        its range strikes from where it stands, with Movement and an attack
        left; any other goes for the plot with the attack flag"""
        m = mask & (us >= 0) & (plot >= 0)
        if not bool(m.any()):
            return
        b = torch.arange(self.B, device=self.device)
        uc = us.clamp(min=0)
        pre = self._mops_pre(s)
        ut = self._mops_u(s, "type")[b, uc].clamp(min=0, max=self.NU - 1)
        ranged = self._type_ranged_strength.take(ut) > 0
        rng = self._tac_range(b, uc, pre)
        here = self._mops_u(s, "tile")[b, uc].clamp(min=0)
        inr = ranged & (self.pair_dist[here, plot.clamp(min=0)].to(torch.long) <= rng)
        fire = m & inr & (self._mops_u(s, "mp")[b, uc] > 0) & (self._mops_u(s, "attacks")[b, uc] > 0)
        for u in torch.unique(uc[fire]).tolist():
            self._hostile_ranged_strike(fire & (uc == u), plot.clamp(min=0), pre, u)
        self._tac_move_to(m & ~inr, uc, plot, pre, self._mops_seat(s), strike=True)

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
        here = self._mops_u(s, "tile")[b, uc]
        g = uc + self.POOL_LO[self._mops_pre(s)]
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

    def _mops_attack_spot(self, s: int, view: dict, us: torch.Tensor, p: torch.Tensor) -> torch.Tensor:
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
        here = self._mops_u(s, "tile")[b, uc]
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
    """`targetGone` (0x73a8e0) of the operation's target: a camp target no
    camp the knowledge base holds stands on; a district target no city
    stands on"""
    tt = c.T.defs[c.d]["targetType"]
    if tt == "TARGET_BARBARIAN_CAMP":
        return _camp_gone(sim, c)
    if tt in ("TARGET_ENEMY_COMBAT_DISTRICT", "TARGET_ENEMY_PASSIVE_DISTRICT"):
        t = sim.mops_target[:, c.s, c.k]
        return (t < 0) | ~sim._centre_plane().gather(1, t.clamp(min=0).unsqueeze(1)).squeeze(1)
    return torch.zeros_like(c.ref, dtype=torch.bool)


def _n_live(sim, c: _OpCtx) -> torch.Tensor:
    """[B] the operation's living members (`holdsUnits`)"""
    u = sim._mops_units(c.s)
    n = torch.zeros_like(c.ref)
    for ti in range(N_TEAMS):
        n = n + (sim._mops_member_mask(c.s, c.k, ti) & u["own"]).sum(dim=1)
    return n


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
    unit targets not its own within max(2, a member's Movement left) of one
    (with an enemy named, its units or a civilian),
    the assignment (the exchange filter where unequal attacks are not allowed
    and one unit goes, the survival filter always) carried out"""
    s, k = c.s, c.k
    tree = c.tree
    seat = sim._mops_seat(s)
    assert tree.flag(i, "Attack Nearby Units"), "minor operations: Attack Units without Attack Nearby Units"
    unequal = bool(tree.flag(i, "Allow Unequal Attacks"))
    pre = sim._mops_pre(s)
    enemy = sim.mops_enemy[:, s, k]
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
        theirs = (enemy.unsqueeze(1) < 0) | (us_ == enemy.unsqueeze(1)) | (uk == 7)
        near = near.repeat(1, L) & (uk > 0) & (us_ != seat) & standing & theirs
        cand = mem & (op["rowof"] >= 0)
        if not bool((cand.any(dim=1) & near.any(dim=1)).any()):
            continue
        ai = torch.where(op["units"], torch.where(sim._mops_u(s, "defender"), _AI_DEFENDER, _AI_COMBAT), -1)
        one = mem.sum(dim=1) == 1
        exch = (~torch.full((B,), unequal, dtype=torch.bool, device=dev)) & one
        # the operation's units (its job), every team's
        held = torch.zeros_like(memm)
        for t in range(N_TEAMS):
            held |= sim._mops_member_mask(s, k, t)
        peers = sim._tac_peers(held & u["own"], pre)
        order = sim._tac_team_order(op["order"], sim._mops_member_rank(s, k, ti))
        out = sim._tac_assign(cand, order, ai, near, op["res"], op["rowof"], uu, exch, True, uk, tg["uo"], peers, pre, seat)
        sim._tac_carry_out(out, done, op["rowof"], op["res"], pre, seat)


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
    # the operation's units (the player's walk 0x6092c0) each take their
    # type's own AI type (unit +0x168, 0x79b9c0): a DEFENDER turns COMBAT
    dfd = sim._mops_u(s, "defender")
    for ti in range(N_TEAMS):
        mine = sim._mops_member_mask(s, k, ti) & at.unsqueeze(1)
        dfd &= ~mine
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
    if s == sim.FR:
        raise NotImplementedError("operations: the Free Cities' trees make no contract")
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
    """OPERATION MOVE's update (0x81a130): the node's one arrival flag
    (`c.mb`) cleared, the teams in turn — one ready with no member passed
    over — each its members' update (`_op_move_update`) over the node's
    store for it writing the flag; a team with no goal FAILS; AlwaysRunning,
    the first team leaves the flag clear and the node RUNNING; a team
    reaching the target ends the update SUCCESS; else SUCCESS where the flag
    stands, else RUNNING"""
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
    always = tree.flag(i, "AlwaysRunning")
    fail = torch.zeros_like(at)
    won = torch.zeros_like(at)
    live = at.clone()
    flag = torch.zeros_like(at)
    for ti in range(N_TEAMS):
        tm = sim.mops_tm[:, s, k, ti]
        empty = sim.mops_ready[:, s, k, ti] & ~sim._mops_member_mask(s, k, ti).any(dim=1)
        on = live & (tm >= 0) & ~empty
        if not bool(on.any()):
            continue
        goal = sim.mops_goal[:, s, k, ti, slot]
        nog = on & (goal < 0)
        fail |= nog
        live &= ~nog
        on &= ~nog
        if always:
            live &= ~on
            continue
        mem = sim._mops_member_mask(s, k, ti) & u["own"]
        P = mem.shape[1]
        store = sim.mops_mvs[:, s, k, j, ti, :P].clone()
        sg = sim.mops_mvg[:, s, k, j, ti].clone()
        _, arr, rest, win = sim._op_move_update(on, mem, sim._mops_member_rank(s, k, ti), store, sg, goal, slot == 1, rng,
                                                spread, op["rowof"], op["res"],
                                                sim._mops_pre(s), sim._mops_seat(s))
        rr = rest.nonzero(as_tuple=True)[0]
        if rr.numel():
            sim.mops_mvs[rr, s, k, j, ti, :P] = store[rr]
            sim.mops_mvg[rr, s, k, j, ti] = sg[rr]
        flag = torch.where(on, arr, flag)
        won |= on & win
        live &= ~(on & win)
    c.mb[:, i] = torch.where(at, flag.long(), c.mb[:, i])
    out = torch.where(won | flag, BT_SUCCESS, BT_RUNNING)
    return torch.where(fail, BT_FAILURE, out)


def _x_move(sim, c: _OpCtx, i: int, on: torch.Tensor) -> None:
    """OPERATION MOVE's execution (0x816cb0): each team (`_op_move_exec`)
    unless the node's arrival flag stands in an operation ready (the node
    names no Leader Tag)"""
    s, k = c.s, c.k
    tree = c.tree
    assert tree.value(i, "Leader Tag") is None, "minor operations: an Operation Move's Leader Tag"
    slot = tree.int_(i, "Move To (enum)")
    slot = 1 if slot is None else slot
    # the radius cap: the node's Unit distance (1 where it names none)
    rng = tree.int_(i, "Unit distance")
    rng = 1 if rng is None else rng
    op = c.view["op"]
    ready = ((sim.mops_tm[:, s, k] < 0) | sim.mops_ready[:, s, k]).all(dim=1)
    arrived = c.mb[:, i] == 1
    for ti in range(N_TEAMS):
        tm = sim.mops_tm[:, s, k, ti]
        goal = sim.mops_goal[:, s, k, ti, slot]
        g = on & (tm >= 0) & (goal >= 0)
        if not bool(g.any()):
            continue
        u = sim._mops_units(s)
        mem = sim._mops_member_mask(s, k, ti) & u["own"]
        sim._op_move_exec(g, mem, sim._mops_member_rank(s, k, ti), goal, rng, arrived, ready, c.view["done"], op["rowof"], op["res"],
                          sim._mops_pre(s), sim._mops_seat(s))


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
            best = sim._mops_attack_spot(s, view, us, target)
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
    """IS CITY THREATENED (0x813050): the target gone, or the city on it
    threatened (its city AI's threat above -1: a minor's own city, a Free
    City): SUCCESS; else FAILURE"""
    t = sim.mops_target[:, c.s, c.k]
    if c.s == sim.FR:
        row = sim.FREE_ROW
        hit = (sim.city_alive[:, row] & (sim.city_center[:, row] == t.unsqueeze(1)) & (t >= 0).unsqueeze(1))
        thr = torch.where(hit, sim.city_ai_threat[:, row], torch.full_like(sim.city_ai_threat[:, row], -1)).max(dim=1).values
    else:
        thr = torch.where(t == sim.citystate_center[:, c.s], sim.citystate_threat[:, c.s], torch.full_like(t, -1))
    return torch.where(_gone(sim, c) | ((t >= 0) & (thr > -1)), BT_SUCCESS, BT_FAILURE)


def _u_can_alpha(sim, c: _OpCtx, i: int, at: torch.Tensor) -> torch.Tensor:
    """CAN ALPHA CITY (0x812cc0) on the minor's own city: no unit's planning
    strikes it (the list holds it as FRIENDLY_CITY, no spots), so the sum is 0
    against half its hit points left"""
    t = sim.mops_target[:, c.s, c.k]
    city = (t >= 0) & (t == sim.citystate_center[:, c.s])
    hp = sim.citystate_hp[:, c.s]
    return torch.where(city & (hp <= 0), BT_SUCCESS, BT_FAILURE)


def _u_running_units(sim, c: _OpCtx, i: int, at: torch.Tensor) -> torch.Tensor:
    """GARRISON CITY (0x8133c0) on the minor's own city: RUNNING while the
    operation holds units, else FAILURE"""
    return torch.where(_n_units(sim, c) > 0, BT_RUNNING, BT_FAILURE)


def _u_attack_city(sim, c: _OpCtx, i: int, at: torch.Tensor) -> torch.Tensor:
    """OPERATION ATTACK CITY (0x813250): SUCCESS once the target is gone; a
    target that is no city nor a district FAILS; RUNNING while the operation
    holds a living unit, else FAILURE"""
    t = sim.mops_target[:, c.s, c.k]
    tc = t.clamp(min=0).unsqueeze(1)
    place = (t >= 0) & (sim._centre_plane().gather(1, tc).squeeze(1) | (sim.district.gather(1, tc).squeeze(1) >= 0))
    run = torch.where(_n_live(sim, c) > 0, BT_RUNNING, BT_FAILURE)
    return torch.where(_gone(sim, c), BT_SUCCESS, torch.where(place, run, BT_FAILURE))


def _u_pillage(sim, c: _OpCtx, i: int, at: torch.Tensor) -> torch.Tensor:
    """OPERATION PILLAGE (0x8134a0): ERROR where its three data are all
    present and false; SUCCESS once the target is gone or while the
    operation holds a living unit, else FAILURE"""
    if not any(_pillage_flag(c, i, n) for n in ("Pillage Districts", "Pillage Improvements", "Get Goody Huts")):
        return _status(c, BT_ERROR)
    return torch.where(_gone(sim, c) | (_n_live(sim, c) > 0), BT_SUCCESS, BT_FAILURE)


def _u_siege(sim, c: _OpCtx, i: int, at: torch.Tensor) -> torch.Tensor:
    """OPERATION SIEGE CITY (0x8136a0): SUCCESS once the target is gone;
    ERROR with no enemy; SUCCESS while the operation holds a living unit,
    else FAILURE"""
    enemy = sim.mops_enemy[:, c.s, c.k]
    out = torch.where(_n_live(sim, c) > 0, BT_SUCCESS, BT_FAILURE)
    return torch.where(_gone(sim, c), BT_SUCCESS, torch.where(enemy < 0, BT_ERROR, out))


def _pillage_flag(c: _OpCtx, i: int, name: str) -> bool:
    v = c.tree.flag(i, name)
    return True if v is None else bool(v)


def _team_members(sim, c: _OpCtx) -> tuple[torch.Tensor, torch.Tensor]:
    """the operation's members [B, P] of the holder's pool, alive, and
    each one's place in the teams' order (team then join, `op.teams`'
    members) [B, P]"""
    u = sim._mops_units(c.s)
    mem = torch.zeros_like(u["own"])
    rank = torch.full(u["own"].shape, 1 << 30, dtype=torch.long, device=sim.device)
    for ti in range(N_TEAMS):
        m = sim._mops_member_mask(c.s, c.k, ti) & u["own"]
        r = sim._mops_member_rank(c.s, c.k, ti)
        rank = torch.where(m & ~mem, ti * N_MEMBERS + r, rank)
        mem |= m
    return mem, rank


def _x_pillage(sim, c: _OpCtx, i: int, on: torch.Tensor) -> None:
    """OPERATION PILLAGE's execution (0x811390, `pillageExecute`) of the Free
    Cities' operation over the holder's pool (`_op_pillage`)"""
    if c.s != sim.FR:
        raise NotImplementedError("operations: Operation Pillage over the majors' pool")
    view = c.view
    op = view["op"]
    if op["tg"] is None:
        return
    mem, rank = _team_members(sim, c)
    t = sim.mops_target[:, c.s, c.k]
    ctx = {"rowof": op["rowof"], "res": op["res"], "tg": op["tg"], "done": view["done"]}
    sim._op_pillage(on, mem, rank, t, ctx, _pillage_flag(c, i, "Pillage Districts"),
                    _pillage_flag(c, i, "Pillage Improvements"), _pillage_flag(c, i, "Get Goody Huts"), FREE_SEAT)


def _x_siege(sim, c: _OpCtx, i: int, on: torch.Tensor) -> None:
    """OPERATION SIEGE CITY's execution (0x811e80, `siegeCityExecute`) of the
    Free Cities' operation over the holder's pool (`_op_siege`)"""
    if c.s != sim.FR:
        raise NotImplementedError("operations: Operation Siege City over the majors' pool")
    view = c.view
    op = view["op"]
    mem, rank = _team_members(sim, c)
    ctx = {"done": view["done"], "order": op["order"], "rowof": op["rowof"], "res": op["res"], "tg": op["tg"],
           "danger": op["danger"]}
    sim._op_siege(on, mem, sim.mops_target[:, c.s, c.k], rank, ctx, seat=FREE_SEAT)


def _x_garrison(sim, c: _OpCtx, i: int, on: torch.Tensor) -> None:
    """GARRISON CITY's execution (0x810d30): over the operation's units in
    the player's unit order, the one on the city its garrison; of those whose
    planning reaches
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
    # the operation's units in the player's unit order (0x6092c0: pool order,
    # `garrisonExecute`), not the teams'
    mc = mem.clamp(min=0)
    key = torch.where(mem >= 0, sim.major_unit_pslot.gather(1, mc).clamp(min=0), torch.full_like(mem, 1 << 30))
    mem = mem.gather(1, key.argsort(dim=1, stable=True))
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
    """OPERATION ATTACK CITY's execution (0x8109e0, `attackCityExecute`): per
    team its members alive with Movement left; the list's COMBAT_DISTRICT
    targets within 3 of the operation's target; the assignment over them
    (no exchange filter, the survival filter on) carried out"""
    s, k = c.s, c.k
    view = c.view
    op, tg, done = view["op"], view["tg"], view["done"]
    t = sim.mops_target[:, s, k]
    on = on & (t >= 0)
    if not bool(on.any()) or op["tg"] is None:
        return
    pre, seat = sim._mops_pre(s), sim._mops_seat(s)
    near = (tg["dk"] == 1) & (sim.pair_dist[t.clamp(min=0)].to(torch.long) <= 3) & on.unsqueeze(1)
    held = torch.zeros_like(op["units"])
    for ti in range(N_TEAMS):
        held |= sim._mops_member_mask(s, k, ti)
    for ti in range(N_TEAMS):
        u = sim._mops_units(s)
        g = on & (sim.mops_tm[:, s, k, ti] >= 0)
        units = sim._mops_member_mask(s, k, ti) & u["own"] & (u["mp"] > 0) & g.unsqueeze(1) & (op["rowof"] >= 0)
        if not bool((units.any(dim=1) & near.any(dim=1)).any()):
            continue
        ai = torch.where(op["units"], torch.where(sim._mops_u(s, "defender"), _AI_DEFENDER, _AI_COMBAT), -1)
        out = sim._tac_assign(units, sim._tac_team_order(op["order"], sim._mops_member_rank(s, k, ti)), ai, near, op["res"],
                              op["rowof"], tg["uu"], torch.zeros_like(on), True,
                              torch.zeros_like(tg["dk"]), sim._arange_bt, sim._tac_peers(held & u["own"], pre), pre, seat,
                              district=True)
        sim._tac_carry_out(out, done, op["rowof"], op["res"], pre, seat)


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
            # a land unit (+0x650 == 2) afloat in danger
            land = ~sim.unit_naval.take(sim.major_unit_type[b, uc].clamp(min=0, max=sim.NU - 1))
            afloat = land & sim.water[b, plot] & (danger.gather(1, plot.unsqueeze(1)).squeeze(1) > 0)
            marked |= ok & (sim._mops_endangered(s, us, ok, view) | sim._mops_hurt(s, us, pct) | afloat)
    c.ma[:, i] = torch.where(at, marked.long(), c.ma[:, i])
    return _status(c, BT_SUCCESS)


def _promote_due(sim, m: torch.Tensor, uc: torch.Tensor) -> None:
    """a promotion due taken where `m` by the minor's unit at the major
    pool's slot `uc` [B]: the AI's pick (`aiPromotionPick`, the first row of
    the highest Level it may take), `takePromotion` (its turn spent)"""
    if not bool(m.any()):
        return
    rd = sim.rules_dev
    B, dev = sim.B, sim.device
    g = (uc + sim.POOL_LO["major"]).unsqueeze(1)
    utp = sim.unit_type.gather(1, g)
    ok = sim._promo_offer_mask(g, utp) & m.view(B, 1, 1)
    has = ok.any(dim=2).squeeze(1)
    if not bool(has.any()):
        return
    P = rd.promo_cols
    tier = rd.promo_tier[rd.u_promo_class.take(utp.clamp(min=0)).clamp(min=0)]
    col = torch.arange(P, device=dev).view(1, 1, -1)
    key = torch.where(ok, tier * P + (P - 1 - col), torch.full_like(tier, -1))
    pick = key.argmax(dim=2).squeeze(1)
    r = has.nonzero(as_tuple=True)[0]
    sim._take_promotion(r, g[r, 0], pick[r], utp[r, 0])
    sim._gen_ver += 1


def _plunder(sim, m: torch.Tensor, uc: torch.Tensor, plot: torch.Tensor) -> None:
    """`hostilePillageAmount` above 0, then `hostilePillage`, where `m` (the
    plot's owner one the minor fights) for its unit at the major pool's slot
    `uc` [B] on `plot` [B]: an unpillaged improvement's plunder, else a
    complete district's (no centre, no Encampment); the wreck, its turn
    spent; a minor banks no purse, a HEAL plunder heals the unit"""
    if not bool(m.any()):
        return
    b = torch.arange(sim.B, device=sim.device)
    imp = sim.improvement[b, plot]
    i_on = (imp >= 0) & ~sim.pillaged[b, plot]
    iv = imp.clamp(min=0)
    pi = m & i_on & (sim._imp_plun_amt[iv] > 0)
    dv_raw = sim.district[b, plot]
    dv = dv_raw.clamp(min=0)
    pd = (m & ~i_on & (dv_raw >= 0) & (dv_raw != sim._encamp_didx) & sim.district_complete[b, plot]
          & ~sim.district_pillaged[b, plot] & (sim.centre_slot_at[b, plot] < 0) & (sim._d_plun_amt[dv] > 0))
    if not bool((pi | pd).any()):
        return
    kind = torch.where(pi, sim._imp_plun_kind[iv], sim._d_plun_kind[dv])
    amt = torch.where(pi, sim._imp_plun_amt[iv], sim._d_plun_amt[dv])
    sim.pillaged[b[pi], plot[pi]] = True
    sim.district_pillaged[b[pd], plot[pd]] = True
    if bool(pd.any()):
        sim._air_scatter_from(b[pd], plot[pd])
    did = pi | pd
    cap = int(sim.rules.combat["unitHp"])
    heal = did & (kind == 1) & (amt > 0)
    hp = sim.major_unit_hp[b, uc]
    sim.major_unit_hp[b, uc] = torch.where(heal, (hp + amt.to(hp.dtype)).clamp(max=cap), hp)
    sim.major_unit_mp[b, uc] = torch.where(did, torch.zeros_like(sim.major_unit_mp[b, uc]), sim.major_unit_mp[b, uc])
    sim._eff_version += 1
    sim._tac_cost_held = None


def _x_defend(sim, c: _OpCtx, i: int, on: torch.Tensor) -> None:
    """OPERATION DEFEND UNITS' execution (0x80d790) where marked, per team
    over its members outside Protect Outside Range of the target: the
    endangered — not bombard, with Movement, out of a city — to their safe
    plots (0x716b90); then the hurt (or a land unit afloat in danger): a
    promotion due taken (`_promote_due`); not bombard: a ship (+0x650 == 0)
    off friendly ground released, its orders ending there (0x73d1f0 removes it
    from copies of the teams, so it stays the team's); a land unit afloat to its safe
    plot; one with Movement on a plot paying a plunder pillages it
    (`_plunder`); one with no Movement left is left there, its turn not
    done; one on the ground of a player it is at war with or a plot of
    danger to its safe plot; each fortified (its turn ends where it
    stands). One arrived on its safe plot by the endangered's or the
    afloat's move, and each fortified, has its moves ended (0x56d6f0: no
    Movement through the run, `view["ended"]`). A city-state's alone: the
    Free Cities' one tree ("Free Cities Assault") holds no such node."""
    s, k = c.s, c.k
    assert s != sim.FR, "minor operations: Operation Defend Units in the Free Cities' tree"
    g = on & (c.ma[:, i] == 1)
    if not bool(g.any()):
        return
    pct = _defend_pct(c, i)
    rng = c.tree.int_(i, "Protect Outside Range")
    rng = -1 if rng is None else rng
    view = c.view
    op, done = view["op"], view["done"]
    ended, ended_mp = view["ended"], view["ended_mp"]
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

    def end(us: torch.Tensor, m: torch.Tensor) -> None:
        uc = us.clamp(min=0)
        m = m & ~ended[b, uc]
        if not bool(m.any()):
            return
        mp = sim.major_unit_mp[b, uc]
        ended_mp[b, uc] = torch.where(m, mp, ended_mp[b, uc])
        ended[b, uc] = ended[b, uc] | m
        sim.major_unit_mp[b, uc] = torch.where(m, torch.zeros_like(mp), mp)

    def to_safe(us: torch.Tensor, m: torch.Tensor, stay_ok: bool) -> None:
        if not bool(m.any()):
            return
        uc = us.clamp(min=0)
        dest = sim._tac_safe_plot(m, uc, "major", seat, danger, op["rowof"], op["res"], none_taken)
        done[b, uc] = torch.where(m, True, done[b, uc])
        here = sim.major_unit_tile[b, uc]
        go = m & (dest >= 0) & (stay_ok | (dest != here))
        sim._mops_move(s, us, dest, go)
        # arrived, its moves end
        if stay_ok:
            end(us, go & live(us) & (sim.major_unit_tile[b, uc] == dest))

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
        for jj in range(n_m):
            us = sim.mops_mem[:, s, k, ti, jj]
            ok = gt & live(us)
            if not bool(ok.any()):
                continue
            uc = us.clamp(min=0)
            ok &= (sim.major_unit_mp[b, uc] > 0) & off(us)
            plot = sim.major_unit_tile[b, uc].clamp(min=0)
            ut = sim.major_unit_type[b, uc].clamp(min=0, max=sim.NU - 1)
            ship = sim.unit_naval.take(ut)
            wat = sim.water[b, plot]
            dang = danger.gather(1, plot.unsqueeze(1)).squeeze(1) > 0
            ok &= sim._mops_hurt(s, us, pct) | (~ship & wat & dang)
            # a promotion due: the AI's pick, its turn done
            _promote_due(sim, ok, uc)
            done[b, uc] = torch.where(ok & (sim.major_unit_mp[b, uc] <= 0), True, done[b, uc])
            ok &= sim._type_bombard.take(ut) <= 0
            if not bool(ok.any()):
                continue
            # a ship (+0x650 == 0) off friendly ground released, its orders
            # ending there; a land unit afloat to its safe plot
            ok &= ~(ship & (sim.tile_seat[b, plot] != seat))
            sea = ok & ~ship & wat
            to_safe(us, sea, True)
            ok &= live(us)
            plot = sim.major_unit_tile[b, uc].clamp(min=0)
            owner = sim.tile_seat[b, plot]
            orow = sim._seat_row.take(owner.clamp(min=0, max=sim._seat_row.numel() - 1))
            war = (owner >= 0) & (owner != seat) & sim.war[b, int(sim._seat_row[seat])].gather(1, orow.unsqueeze(1)).squeeze(1)
            # with Movement, a pillage where the plot pays a plunder
            _plunder(sim, ok & (sim.major_unit_mp[b, uc] > 0) & war, uc, plot)
            # with no Movement left its orders end there: no fortification,
            # its turn not done
            ok &= sim.major_unit_mp[b, uc] > 0
            dang = danger.gather(1, plot.unsqueeze(1)).squeeze(1) > 0
            to_safe(us, ok & (war | dang), False)
            ok &= live(us)
            # fortified, its moves end
            end(us, ok)
            done[b, uc] = torch.where(ok, True, done[b, uc])


def _u_naval_units(sim, c: _OpCtx, i: int, at: torch.Tensor) -> torch.Tensor:
    """NAVAL PATROL, NAVAL PILLAGE (0x803880): RUNNING while the operation
    holds units, else FAILURE"""
    return torch.where(_n_units(sim, c) > 0, BT_RUNNING, BT_FAILURE)


def _x_naval_patrol(sim, c: _OpCtx, i: int, on: torch.Tensor) -> None:
    """NAVAL PATROL's execution (0x803060): over the operation's units in the
    player's unit order (pool order), each alive with Movement left takes HL
    Explore's target (`_tac_explore_pick` on a chosen list of its own, the
    fallbacks taken), its turn done, and moves there (no line)."""
    s, k = c.s, c.k
    dev = sim.device
    B, T = sim.B, sim.T
    b = torch.arange(B, device=dev)
    seat = 100 + s
    mem = sim.mops_mem[:, s, k].reshape(B, -1)
    mc = mem.clamp(min=0)
    key = torch.where(mem >= 0, sim.major_unit_pslot.gather(1, mc).clamp(min=0), torch.full_like(mem, 1 << 30))
    mem = mem.gather(1, key.argsort(dim=1, stable=True))
    danger = c.view["op"]["danger"]
    treg = sim._tac_seen_regions(seat)
    for j in range(mem.shape[1]):
        us = mem[:, j]
        uc = us.clamp(min=0)
        ok = (on & (us >= 0) & sim.major_unit_alive[b, uc] & (sim.major_unit_seat[b, uc] == seat)
              & (sim.major_unit_tile[b, uc] >= 0) & (sim.major_unit_mp[b, uc] > 0))
        if not bool(ok.any()):
            continue
        known = sim._tac_known(seat)
        revealed = known if known is not None else torch.ones(B, T, dtype=torch.bool, device=dev)
        seen_now = sim._barb_seen(seat)
        rows = ok.nonzero(as_tuple=True)[0]
        res, v1, v2, rt = sim._tac_explore_counts(rows, uc[rows], "major", seat, danger, revealed, seen_now)
        r = torch.zeros(B, dtype=torch.long, device=dev)
        r[rows] = torch.arange(rows.numel(), device=dev)
        chosen = torch.zeros(B, T, dtype=torch.bool, device=dev)
        pick, _ = sim._tac_explore_pick(ok, uc, r, res, v1, v2, rt, chosen, revealed, treg, "major", seat, True)
        c.view["done"][b[ok], uc[ok]] = True
        sim._mops_move(s, us, pick, ok & (pick >= 0))


def _x_naval_pillage(sim, c: _OpCtx, i: int, on: torch.Tensor) -> None:
    """NAVAL PILLAGE's execution (0x803250, `passNavalPillage`): the operation's
    units alive with Movement left listed (pool order); then each listed unit
    still with Movement left and a planning takes the first of its planning's
    targets that is a COMBAT_DISTRICT with a spot, else — a unit with a range
    — the first LOW, MEDIUM or HIGH one; the attack assignment of the whole
    list over that one target (no exchange filter, the survival filter on)
    carried out"""
    s, k = c.s, c.k
    view = c.view
    op, tg, done = view["op"], view["tg"], view["done"]
    if op["tg"] is None:
        return
    res, rowof = op["res"], op["rowof"]
    dev = sim.device
    B, T = sim.B, sim.T
    b = torch.arange(B, device=dev)
    seat = 100 + s
    mem = sim.mops_mem[:, s, k].reshape(B, -1)
    mc = mem.clamp(min=0)
    key = torch.where(mem >= 0, sim.major_unit_pslot.gather(1, mc).clamp(min=0), torch.full_like(mem, 1 << 30))
    mem = mem.gather(1, key.argsort(dim=1, stable=True))

    def live(us: torch.Tensor) -> torch.Tensor:
        uc = us.clamp(min=0)
        return ((us >= 0) & sim.major_unit_alive[b, uc] & (sim.major_unit_seat[b, uc] == seat)
                & (sim.major_unit_tile[b, uc] >= 0) & (sim.major_unit_mp[b, uc] > 0))
    listed = torch.zeros_like(sim.major_unit_alive)
    for j in range(mem.shape[1]):
        us = mem[:, j]
        ok = on & live(us)
        listed[b[ok], us[ok]] = True
    if not bool(listed.any()):
        return
    uk = tg["uk"]
    ai = torch.where(op["units"], torch.where(sim.major_unit_defender, _AI_DEFENDER, _AI_COMBAT), -1)
    peers = sim._tac_peers(listed, "major")
    for j in range(mem.shape[1]):
        us = mem[:, j]
        uc = us.clamp(min=0)
        ok = on & live(us) & listed[b, uc] & (rowof[b, uc] >= 0)
        if not bool(ok.any()):
            continue
        r = rowof[b, uc].clamp(min=0)
        tp, te, sn = res["tp"][r], res["te"][r], res["spot_n"][r]
        dist_e = (tp >= 0) & (te < 0) & (sn > 0)
        kd = uk.gather(1, te.clamp(min=0))
        fighter = (tp >= 0) & (te >= 0) & (kd >= 1) & (kd <= 3)
        d_has = ok & dist_e.any(dim=1)
        u_has = ok & ~d_has & (sim._tac_range(b, uc, "major") > 0) & fighter.any(dim=1)
        cand = listed & (rowof >= 0)
        if bool(d_has.any()):
            e = dist_e.long().argmax(dim=1)
            plot = tp.gather(1, e.unsqueeze(1)).squeeze(1)
            near = torch.zeros(B, T, dtype=torch.bool, device=dev)
            near[b[d_has], plot[d_has]] = True
            out = sim._tac_assign(cand & d_has.unsqueeze(1), op["order"], ai, near, res, rowof, tg["uu"],
                                  torch.zeros_like(on), True, torch.zeros_like(tg["dk"]), sim._arange_bt, peers,
                                  "major", seat, district=True)
            sim._tac_carry_out(out, done, rowof, res, "major", seat)
        if bool(u_has.any()):
            e = fighter.long().argmax(dim=1)
            ent = te.gather(1, e.unsqueeze(1)).squeeze(1)
            near = torch.zeros_like(uk, dtype=torch.bool)
            near[b[u_has], ent[u_has]] = True
            out = sim._tac_assign(cand & u_has.unsqueeze(1), op["order"], ai, near, res, rowof, tg["uu"],
                                  torch.zeros_like(on), True, uk, tg["uo"], peers, "major", seat)
            sim._tac_carry_out(out, done, rowof, res, "major", seat)


def _u_naval_choose(sim, c: _OpCtx, i: int, at: torch.Tensor) -> torch.Tensor:
    """NAVAL CHOOSE TARGET (0x803590, its list 0x802ea0): of the minor's
    tactical target list, the unit targets (civilian through high priority:
    the list's kinds 1-3 and 7) on a plot of the node's Target Domain
    (DOMAIN_SEA: water; any other, the default DOMAIN_LAND among them:
    land), the nearest the operation's target, the first of equals in the
    list's order, becomes its target and rally with each team's goals
    (0x73e7d0) and its children run (`ma` 1: the tick's cursor to its first
    child), SUCCESS; with none the walk skips them (the cursor to the node's
    end), FAILURE where the node says Fail for no target (unset: it does),
    else SUCCESS"""
    s, k = c.s, c.k
    B, T, dev = sim.B, sim.T, sim.device
    tg = c.view["tg"]
    sea = (c.tree.value(i, "Target Domain") or "DOMAIN_LAND") == "DOMAIN_SEA"
    fl = c.tree.flag(i, "Fail for no target")
    fail = True if fl is None else bool(fl)
    uk, uo = tg["uk"], tg["uo"]
    L = uk.shape[1] // T
    kind = (uk == 1) | (uk == 2) | (uk == 3) | (uk == 7)
    ok = kind & (sim.water.repeat(1, L) == sea)
    tgt = sim.mops_target[:, s, k]
    d = sim.pair_dist[tgt.clamp(min=0)].to(torch.long).repeat(1, L)
    big = 1 << 62
    key = torch.where(ok, (d << 32) + uo, torch.full_like(uo, big))
    kmin, j = key.min(dim=1)
    has = at & (kmin < big)
    best = j % T
    sim.mops_target[:, s, k] = torch.where(has, best, sim.mops_target[:, s, k])
    sim.mops_rally[:, s, k] = torch.where(has, best, sim.mops_rally[:, s, k])
    g = sim.mops_goal[:, s, k]
    tm = sim.mops_tm[:, s, k] >= 0
    for slot in (G_RALLY, G_TARGET):
        g[:, :, slot] = torch.where(has.unsqueeze(1) & tm, best.unsqueeze(1), g[:, :, slot])
    c.ma[:, i] = torch.where(at, has.long(), c.ma[:, i])
    return torch.where(has, BT_SUCCESS, BT_FAILURE if fail else BT_SUCCESS)


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
    "Operation Attack City": _u_attack_city,
    "Operation Pillage": _u_pillage,
    "Operation Siege City": _u_siege,
    "Naval Choose Target": _u_naval_choose,
    "Naval Pillage": _u_naval_units,
    "Naval Patrol": _u_naval_units,
}

_EXECUTE = {
    "Operation Defend Units": _x_defend,
    "Recruit Units": _x_recruit,
    "Operation Move": _x_move,
    "Operation Attack Units": _x_attack_units,
    "Operation Attack": _x_operation_attack,
    "Garrison City": _x_garrison,
    "Operation Attack City": _x_attack_city,
    "Operation Pillage": _x_pillage,
    "Operation Siege City": _x_siege,
    "Naval Pillage": _x_naval_pillage,
    "Naval Patrol": _x_naval_patrol,
}
