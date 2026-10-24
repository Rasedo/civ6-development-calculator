"""THE BARBARIANS' OPERATIONS AND TREES on the GPU (cpu/core/barbarianOps.ts
over the one operation manager cpu/core/operations; tools/civ6lab/dll_readings.md
"C-95: the barbarians' raid", "C-95: the scout's tree"): a tribe's raid
("Raid City") or city assault ("Barbarian City Attack") and its scout's
walk home ("Barbarian Found City"), and a capture's escort of its captive
to a camp ("Escort Worker To Camp", the operation "Barbarian Builder
Capture"), each tree ticked as the interpreter
walks it (cpu/core/behaviorTree.ts) — the walk's statuses, then the
executions in node order — the trees' data read off the install's rows
(`rules`' barbarians.trees).

A tribe holds at most one operation (`tribe_op`: 1 a raid, 2 an assault,
its tree's id `tribe_op_id`, its trigger Sequence's resume `tribe_op_resume`,
its recruit's and its raid's Turn Limiters' first turns `tribe_op_rstart`,
`tribe_raid_from`, its tree ended `tribe_op_done`, its team's readiness of
the military AI's turn `tribe_op_ready`) and at most one scout's tree
(`tribe_home_*`: its scout, the city it saw, its id, its Sequence's resume,
Move Unit's held scout). The player's turn: the military AI's part
refreshes the operations' teams (`_barb_ops_refresh`, before the tribes'
turn); in the tactical pass every tree ticks in id order
(`_barb_trees`), a tree a scout's report starts ticking in the same walk.
"""

from __future__ import annotations

from .simbase import *  # noqa: F401,F403 — torch, constants, helpers: the shared floor
from . import simbase
from .sim_tactics import _CITY_STRIKE_RANGE

# the interpreter's statuses
_S, _R, _F = 1, 2, 3
# the plots about a city in the order the siege walks them (world/hex.ts's
# DIRECTION_TYPES: SE, E, NE, NW, W, SW), as the neighbour table's columns
# (E NE NW W SW SE)
_SIEGE_DIRS = (5, 0, 1, 2, 3, 4)


def _node_data(node: dict, name: str):
    d = node["data"].get(name)
    return None if d is None else d.get("value")


def _num(v, default: int = 0) -> int:
    return default if v in (None, "", "No Value") else int(float(v))


def _flag(v) -> bool | None:
    return None if v is None else (v == "1" or str(v).lower() == "true")


class _Trees:
    """the data of the barbarians' trees the ticks read, each tree's shape
    checked against the walk the tick is written for"""

    def __init__(self, trees: dict, bb: dict):
        raid = trees["Raid City"]
        ass = trees["Barbarian City Attack"]
        sc = trees["Barbarian Found City"]
        assert [n["type"] for n in raid] == [
            "Sequence", "Decode Trigger", "Sequence", "Barbarian Spawn Change", "Priority", "Turn Limiter",
            "Barbarian Recruit", "Barbarian Spawn Change", "Barbarian Spawn Change", "Concurrent", "Operation Attack Units",
            "Operation Move", "Priority", "Barbarian Raid Check", "Turn Limiter", "Concurrent", "Operation Attack Units",
            "Operation Pillage", "In Difficulty Range", "Operation Attack City", "Operation Defend Units", "Operation Move",
            "Concurrent", "Operation Attack Units", "Operation Move", "Notify Owner"], "Raid City's walk"
        assert [n["type"] for n in ass] == [
            "Concurrent", "Operation Defend Units", "Sequence", "Decode Trigger", "Sequence", "Barbarian Spawn Change",
            "Priority", "Turn Limiter", "Barbarian Recruit", "Barbarian Spawn Change", "Barbarian Spawn Change",
            "Concurrent", "Make Formation", "Operation Move", "Concurrent", "Operation Attack Units", "Make Formation",
            "Operation Move", "Concurrent", "Operation Siege City", "Operation Attack City", "Operation Attack Units",
            "Make Formation", "Operation Pillage", "Operation Move", "Notify Owner"], "Barbarian City Attack's walk"
        assert [n["type"] for n in sc] == ["Sequence", "Decode Trigger", "Concurrent", "Protect Unit", "Move Unit",
                                           "Notify Owner"], "Barbarian Found City's walk"
        cap = trees["Escort Worker To Camp"]
        assert [n["type"] for n in cap] == [
            "Sequence", "Make Formation", "Operation Change Target", "Concurrent", "Operation Is Ready",
            "Operation Defend Units", "Operation Move", "Make Formation", "Operation Move"], "Escort Worker To Camp's walk"
        assert _node_data(cap[1], "Combat Unit") == "UNITTYPE_LAND_COMBAT" and _node_data(cap[1], "Civilian Unit") == "UNITTYPE_CIVILIAN"
        assert _flag(_node_data(cap[7], "Destroy Formations")), "the capture's second Make Formation forms"
        assert _num(_node_data(cap[2], "Backup Amount")) == 0 and _num(_node_data(cap[2], "Failure Amount")) == -1
        for n in (cap[6], cap[8]):
            assert _num(_node_data(n, "Move To (enum)"), 1) == 1, "the capture's Operation Move to its target"
        for n in (ass[12], ass[16], ass[22]):
            # a formation of a civilian alone: none of the assault's pairs
            assert _node_data(n, "Civilian Unit") is None, "Make Formation with a civilian"

        def move(n: dict) -> tuple[int, int, int]:
            return (_num(_node_data(n, "Move To (enum)"), 1), _num(_node_data(n, "Range to goal")),
                    _num(_node_data(n, "Unit distance"), 1))

        def defend(n: dict) -> tuple[int, int]:
            # (AutoProtect Percentage, Protect Outside Range)
            return (_num(_node_data(n, "AutoProtect Percentage"), 33), _num(_node_data(n, "Protect Outside Range"), -1))

        self.raid_defend = defend(raid[20])
        self.ass_defend = defend(ass[1])
        self.cap_defend = defend(cap[5])
        self.raid_recruit = _num(_node_data(raid[5], "Turns to Run"))
        self.raid_moves = [move(raid[11]), move(raid[21]), move(raid[24])]
        self.cap_moves = [move(cap[6]), move(cap[8])]
        self.raid_score = _num(_node_data(raid[13], "Score"))
        # IN DIFFICULTY RANGE 18 over Operation Attack City 19 (0x7f1d70):
        # the bounds, the opponent's handicap asked, a skip SUCCEEDING
        names = list(bb["difficulties"])
        lo, hi = _node_data(raid[18], "Low Difficulty"), _node_data(raid[18], "High Difficulty")
        self.raid_city_lo = names.index(lo) if lo else -1
        self.raid_city_hi = names.index(hi) if hi else -1
        assert _flag(_node_data(raid[18], "Apply to opponent")) and not _flag(_node_data(raid[18], "Fail if Outside")),             "Raid City's In Difficulty Range asks the opponent and succeeds outside"
        assert _flag(_node_data(raid[14], "Limit Is Min")) and _flag(_node_data(raid[14], "Fail at Limit")) is False
        self.raid_turns = _num(_node_data(raid[14], "Turns to Run"))
        self.ass_recruit = _num(_node_data(ass[7], "Turns to Run"))
        self.ass_moves = [move(ass[13]), move(ass[17]), move(ass[24])]
        for n in (raid[10], raid[16], raid[23], ass[15], ass[21]):
            assert _flag(_node_data(n, "Attack Nearby Units")), "Attack Units without Attack Nearby Units"
        pct = float(_node_data(sc[3], "Damage Percentage") or 0)
        whole = int(pct // 1)
        # Protect Unit's share in 8.8
        self.protect = whole + int((pct - whole) * 256) / 256
        self.to_range = _num(_node_data(sc[4], "To Range"))
        assert _flag(_node_data(sc[4], "Allow Danger")) is not False


class SimBarbOps:
    def _bop_trees(self) -> _Trees:
        t = getattr(self, "_bop_trees_cache", None)
        if t is None:
            t = self._bop_trees_cache = _Trees(self._bb["trees"], self._bb)
        return t

    # -- the operation and its members ---------------------------------------

    def _bop_members(self, k: int) -> torch.Tensor:
        """[B, P] tribe `k`'s operation's living members"""
        return self.barb_unit_alive & self.barb_unit_op & (self.barb_unit_tribe == k)

    def _bop_next_id(self, mask: torch.Tensor) -> torch.Tensor:
        """the barbarian player's next tree's id where `mask` (taken)"""
        nid = self.barb_tree_next.clone()
        self.barb_tree_next += mask.long()
        return nid

    def _barb_start_op(self, mask: torch.Tensor, k: int, assault: bool, seat: torch.Tensor, plot: torch.Tensor) -> None:
        """`barbOpStart`: tribe `k`'s raid or city assault on `seat`'s city at
        `plot` in the games `mask` — its rally the camp, its tree's id the
        player's next, its tree fresh, its team empty and not ready"""
        rows = mask.nonzero(as_tuple=True)[0]
        if not rows.numel():
            return
        nid = self._bop_next_id(mask)
        self.tribe_op[rows, k] = 2 if assault else 1
        self.tribe_op_seat[rows, k] = seat[rows]
        self.tribe_op_plot[rows, k] = plot[rows]
        self.tribe_rally[rows, k] = self.tribe_plot[rows, k]
        self.tribe_op_id[rows, k] = nid[rows]
        self.tribe_op_resume[rows, k] = -1
        self.tribe_op_rstart[rows, k] = -1
        self.tribe_raid_from[rows, k] = -1
        self.tribe_op_done[rows, k] = False
        self.tribe_op_ready[rows, k] = False
        self.tribe_op_dead[rows, k] = 0
        self.tribe_store[rows, k] = False
        self.tribe_store_goal[rows, k] = -1
        self.barb_unit_op[rows] &= self.barb_unit_tribe[rows] != k

    def _barb_op_bury(self) -> None:
        """an operation's members killed are counted to it (they stay its
        members, off the map) and their slots let go"""
        dead = self.barb_unit_op & ~self.barb_unit_alive & (self.barb_unit_tribe >= 0)
        if not bool(dead.count_nonzero()):
            return
        tr = self.barb_unit_tribe.clamp(min=0)
        add = torch.zeros_like(self.tribe_op_dead)
        add.scatter_add_(1, tr, dead.long())
        self.tribe_op_dead += add
        self.barb_unit_op &= ~dead

    # -- the military AI's part of the turn ----------------------------------

    def _barb_ops_refresh(self) -> None:
        """`barbarianOpsTurn` (`operationsRefresh`): each running operation's
        team updated — its readiness (0x73fba0): a member carrying
        UNITAI_COMBAT, and the members' strength (each its larger of combat
        and ranged strength less a tenth of its damage) at the enemy's about
        the target or more (`_ops_enemy_str`; their best trained strength
        none, the desired advantage none)"""
        self._barb_op_bury()
        ut = self.barb_unit_type.clamp(min=0, max=self.NU - 1)
        combat_ai = self._bop_combat_ai.take(ut)
        full = int(self.rules.combat["unitHp"])
        dmg = (full - self.barb_unit_hp).clamp(min=0)
        st = torch.maximum(self._ai_combat("barb"), self._type_ranged_strength.take(ut)) - torch.div(dmg, 10, rounding_mode="floor")
        for k in range(int(self.n_tribes.max()) if self.B else 0):
            on = (self.tribe_op[:, k] > 0) & ~self.tribe_op_done[:, k]
            if not bool(on.count_nonzero()):
                continue
            mem = self._bop_members(k)
            mins = (mem & combat_ai).any(dim=1)
            strength = torch.where(mem, st, torch.zeros_like(st)).sum(dim=1)
            against = torch.where(self.tribe_op[:, k] == 2, self.tribe_op_seat[:, k], torch.full_like(self.tribe_op_seat[:, k], -1))
            enemy = self._ops_enemy_str(BARB_SEAT, self.BK, self.tribe_op_plot[:, k], against)
            self.tribe_op_ready[:, k] = torch.where(on, mins & (strength >= enemy), self.tribe_op_ready[:, k])
        self._bcap_refresh(st, combat_ai)

    # -- the Builder Capture ("Escort Worker To Camp") ------------------------

    def _barb_capture_event(self, rows: torch.Tensor, captive: torch.Tensor, by: int) -> None:
        """AI_EVENT_UNIT_CAPTURED (0x212500) of a barbarian capture in games
        `rows`: the captive's local slot `captive` [n] and its captor's `by`
        to the turn's queue"""
        q = self.barb_capq[rows, :, 0]
        free = (q < 0).long().argmax(dim=1)
        assert bool((q < 0).any(dim=1).all()), "the barbarians' captures: raise BARB_CAP_MAX"
        self.barb_capq[rows, free, 0] = captive
        self.barb_capq[rows, free, 1] = by

    def _bcap_members(self) -> torch.Tensor:
        """[B, P] the units the captures' operations hold"""
        out = torch.zeros_like(self.barb_unit_alive)
        bidx = self._bidx
        for c in range(self.bcap_id.shape[1]):
            on = self.bcap_id[:, c] >= 0
            for pl in (self.bcap_civ, self.bcap_esc):
                sl = pl[:, c]
                m = on & (sl >= 0)
                out[bidx[m], sl[m]] = True
        return out & self.barb_unit_alive

    def _barb_captures(self) -> None:
        """`barbarianCaptures`: each of the turn's captures starts "Barbarian
        Builder Capture" by name (0x7265b0) on the captive's plot, its rally
        the plot, its tree the player's next; the captive, then its captor,
        join its team (0x737e80), the captor leaving the operation it held"""
        for j in range(self.barb_capq.shape[1]):
            civ = self.barb_capq[:, j, 0]
            esc = self.barb_capq[:, j, 1]
            go = (civ >= 0) & self.barb_unit_alive.gather(1, civ.clamp(min=0).unsqueeze(1)).squeeze(1)
            if not bool(go.any()):
                continue
            cs = civ.clamp(min=0)
            es = esc.clamp(min=0)
            esc_ok = go & (esc >= 0) & self.barb_unit_alive.gather(1, es.unsqueeze(1)).squeeze(1)
            rows = esc_ok.nonzero(as_tuple=True)[0]
            if rows.numel():
                # the captor leaves its tribe's operation and any capture's
                self.barb_unit_op[rows, es[rows]] = False
                for c in range(self.bcap_id.shape[1]):
                    for pl in (self.bcap_civ, self.bcap_esc):
                        hit = esc_ok & (pl[:, c] == esc)
                        pl[:, c] = torch.where(hit, torch.full_like(esc, -1), pl[:, c])
            free = (self.bcap_id < 0)
            assert bool((free.any(dim=1) | ~go).all()), "the barbarians' captures' operations: raise BARB_CAP_MAX"
            c_ix = free.long().argmax(dim=1)
            nid = self._bop_next_id(go)
            r = go.nonzero(as_tuple=True)[0]
            ci = c_ix[r]
            plot = self.barb_unit_tile[r, cs[r]]
            self.bcap_id[r, ci] = nid[r]
            self.bcap_civ[r, ci] = cs[r]
            self.bcap_esc[r, ci] = torch.where(esc_ok[r], es[r], torch.full_like(es[r], -1))
            self.bcap_target[r, ci] = plot
            self.bcap_rally[r, ci] = plot
            self.bcap_bk_target[r, ci] = -1
            self.bcap_bk_rally[r, ci] = -1
            self.bcap_resume[r, ci] = -1
            self.bcap_form[r, ci] = False
            self.bcap_ready[r, ci] = False
            self.bcap_str[r, ci] = 0
            self.bcap_estr[r, ci] = 0
            self.bcap_store[r, ci] = False
            self.bcap_store_goal[r, ci] = -1
        self.barb_capq.fill_(-1)

    def _bcap_bury(self) -> None:
        """a capture's member killed lets its slot go"""
        bidx = self._bidx
        for c in range(self.bcap_id.shape[1]):
            on = self.bcap_id[:, c] >= 0
            for pl in (self.bcap_civ, self.bcap_esc):
                sl = pl[:, c]
                gone = on & (sl >= 0) & ~self.barb_unit_alive[bidx, sl.clamp(min=0)]
                pl[:, c] = torch.where(gone, torch.full_like(sl, -1), sl)

    def _bcap_refresh(self, st: torch.Tensor, combat_ai: torch.Tensor) -> None:
        """the captures' part of `barbarianOpsTurn`: each team's update
        (0x73fba0: a civilian and a UNITAI_COMBAT member — the
        InitialStrengthAdvantage 0 asks no strength — the members' strength),
        the enemy's about the target (`_ops_enemy_str`), and the running
        operation's candidate as its backup (0x73e610, `evaluate`, before
        the strengths' refresh: of the knowledge base's camps in its order, the one of the
        best odds from the target at the strength the last refresh left —
        none on the turn after the start — against the walk's 6; a camp on
        the target, or off its area, none)"""
        self._bcap_bury()
        B, dev = self.B, self.device
        bidx = self._bidx
        ut = self.barb_unit_type.clamp(min=0, max=self.NU - 1)
        civ_ai = self._bop_civ_ai.take(ut)
        cp = self.barb_camps_known
        n_camps = (cp >= 0).sum(dim=1)
        best = 1  # the barbarians' best trained strength none: max(1, 0)
        for c in range(self.bcap_id.shape[1]):
            on = self.bcap_id[:, c] >= 0
            if not bool(on.any()):
                continue
            ours = self.bcap_str[:, c].clone()
            cs, es = self.bcap_civ[:, c], self.bcap_esc[:, c]
            civ_in = on & (cs >= 0) & civ_ai[bidx, cs.clamp(min=0)]
            esc_in = on & (es >= 0) & combat_ai[bidx, es.clamp(min=0)]
            self.bcap_ready[:, c] = torch.where(on, civ_in & esc_in, self.bcap_ready[:, c])
            stc = torch.where(cs >= 0, st[bidx, cs.clamp(min=0)], torch.zeros_like(cs))
            ste = torch.where(es >= 0, st[bidx, es.clamp(min=0)], torch.zeros_like(es))
            self.bcap_str[:, c] = torch.where(on, stc + ste, self.bcap_str[:, c])
            tgt = self.bcap_target[:, c]
            self.bcap_estr[:, c] = torch.where(on, self._ops_enemy_str(BARB_SEAT, self.BK, tgt, torch.full_like(tgt, -1)),
                                               self.bcap_estr[:, c])
            # the backup: the knowledge base's camps in its order, the last
            # of the best
            rally = tgt
            rc = rally.clamp(min=0)
            value = n_camps * 50 * 256
            got_t = torch.full_like(tgt, -1)
            got_v = torch.zeros_like(tgt)
            got_o = torch.zeros(B, dtype=torch.float64, device=dev)
            for j in range(cp.shape[1]):
                camp = cp[:, j]
                ok = on & (rally >= 0) & (camp >= 0)
                if not bool(ok.any()):
                    continue
                cc = camp.clamp(min=0)
                d = self.pair_dist[rc, cc].to(torch.long)
                same_area = self.tile_area[bidx, rc] == self.tile_area[bidx, cc]
                ok &= (d > 0) & same_area
                enemy = torch.full_like(ours, 6)
                odds = self._mops_odds(ours, enemy, d, torch.full_like(ours, best))
                prod = torch.div(self._mops_fixed(odds) * value, 256, rounding_mode="trunc")
                held = torch.div(got_v * self._mops_fixed(got_o), 256, rounding_mode="trunc")
                take = ok & ((got_t < 0) | ~(prod < held))
                got_t = torch.where(take, camp, got_t)
                got_v = torch.where(take, value, got_v)
                got_o = torch.where(take, odds, got_o)
            has = on & (got_t >= 0)
            self.bcap_bk_target[:, c] = torch.where(has, got_t, self.bcap_bk_target[:, c])
            self.bcap_bk_rally[:, c] = torch.where(has, rally, self.bcap_bk_rally[:, c])

    def _bop_capture_tick(self, m: torch.Tensor, c: int, ctx: dict) -> None:
        """"Escort Worker To Camp"'s tick for capture `c` in the games `m`:
        the root Sequence from the child it resumes at — Make Formation 1
        (the captive and its escort: SUCCESS where the escort's planning
        reaches the captive's plot within a turn, or none can within two;
        else RUNNING), Operation Change Target 2 (the target no camp: the
        backup, else FAILURE; weaker than the enemy, the backup (WEAK), else
        FAILURE), Concurrent 3 (Operation Is Ready 4: FAILURE where the team
        is not ready; Operation Defend Units 5; Operation Move 6 to the
        target, range 1, unit distance 2), Make Formation 7 (the formation
        undone), Operation Move 8 onto the target; then the executions in
        node order; a tree that ends frees its slot"""
        bidx = self._bidx
        rowof, res, done = ctx["rowof"], ctx["res"], ctx["done"]
        cs, es = self.bcap_civ[:, c].clone(), self.bcap_esc[:, c].clone()
        civ_ok = m & (cs >= 0)
        esc_ok = m & (es >= 0)
        csc, esc_ = cs.clamp(min=0), es.clamp(min=0)
        resume = self.bcap_resume[:, c]
        start1 = m & (resume <= 1)
        start3 = m & (resume == 3)
        start8 = m & (resume == 8)
        # Make Formation 1
        ut = self.barb_unit_type.clamp(min=0, max=self.NU - 1)
        land = self._bop_land_ai.take(ut)
        civ_ai = self._bop_civ_ai.take(ut)
        pair = (start1 & civ_ok & esc_ok & ~self.bcap_form[:, c]
                & land[bidx, esc_] & (self._type_combat.take(ut)[bidx, esc_] > 0)
                & civ_ai[bidx, csc] & ~(self._type_combat.take(ut)[bidx, csc] > 0))
        civ_plot = self.barb_unit_tile[bidx, csc]
        r1 = torch.full_like(cs, -1)
        r2 = torch.full_like(cs, -1)
        rows = (pair & (rowof[bidx, esc_] >= 0)).nonzero(as_tuple=True)[0]
        if rows.numel():
            r1[rows] = self._op_reach_at(rows, esc_[rows], civ_plot[rows], 1, False, torch.zeros_like(rows), rowof, res)
            r2[rows] = self._op_reach_at(rows, esc_[rows], civ_plot[rows], 2, False, torch.zeros_like(rows), rowof, res)
        pair &= r2 >= 0
        mf1 = torch.where(pair & (r1 < 0), 2, 1)
        run_mf = start1 & (mf1 == 2)
        # Operation Change Target 2
        ct_on = start1 & (mf1 == 1)
        tgt = self.bcap_target[:, c]
        cp = self.barb_camps_known
        is_camp = ((cp == tgt.unsqueeze(1)) & (cp >= 0)).any(dim=1) & (tgt >= 0)
        bk_ok = self.bcap_bk_target[:, c] >= 0
        swap_inv = ct_on & ~is_camp & bk_ok
        fail_inv = ct_on & ~is_camp & ~bk_ok
        estr = self.bcap_estr[:, c]
        stren = self.bcap_str[:, c]
        valid = ct_on & is_camp
        weak = valid & (estr > 0) & (stren < estr)
        swap_weak = weak & bk_ok
        fail_weak = weak & ~bk_ok
        swap = swap_inv | swap_weak
        if bool(swap.any()):
            self.bcap_target[:, c] = torch.where(swap, self.bcap_bk_target[:, c], self.bcap_target[:, c])
            self.bcap_rally[:, c] = torch.where(swap, self.bcap_bk_rally[:, c], self.bcap_rally[:, c])
            self.bcap_bk_target[:, c] = torch.where(swap, torch.full_like(tgt, -1), self.bcap_bk_target[:, c])
            self.bcap_bk_rally[:, c] = torch.where(swap, torch.full_like(tgt, -1), self.bcap_bk_rally[:, c])
        ct_fail = fail_inv | fail_weak
        # Concurrent 3
        c3_on = (ct_on & ~ct_fail) | start3
        ready = self.bcap_ready[:, c]
        rdy_fail = c3_on & ~ready
        mv_on = c3_on & ready
        goal = self.bcap_target[:, c]
        mem = torch.zeros_like(self.barb_unit_alive)
        mem[bidx[civ_ok], csc[civ_ok]] = True
        mem[bidx[esc_ok], esc_[esc_ok]] = True
        mem &= self.barb_unit_alive
        no_goal = goal < 0
        tr = self._bop_trees()
        _, rg6, sp6 = tr.cap_moves[0]
        _, rg8, sp8 = tr.cap_moves[1]
        # Operation Defend Units 5 over the team, the captive then its captor
        cteam = [torch.where(civ_ok, cs, -1), torch.where(esc_ok, es, -1)]
        pct5, rng5 = tr.cap_defend
        mk5 = self._bop_defend_update(mv_on, cteam, pct5, ctx)
        st6, ar6 = self._bcap_move_update(mv_on & ~no_goal, c, 0, mem, goal, rg6, sp6, ctx)
        c6 = torch.where(no_goal, 3, st6)
        c3 = torch.where(rdy_fail, 3, torch.maximum(torch.ones_like(c6), c6))
        c3 = torch.where(c3_on, c3, torch.zeros_like(c3))
        # Make Formation 7 and Operation Move 8
        seq7 = c3_on & (c3 == 1)
        on8 = seq7 | start8
        st8, ar8 = self._bcap_move_update(on8 & ~no_goal, c, 1, mem, goal, rg8, sp8, ctx)
        c8 = torch.where(no_goal, 3, st8)
        root_fail = ct_fail | (c3_on & (c3 == 3)) | (on8 & (c8 == 3))
        root_ok = on8 & (c8 == 1)
        self.bcap_resume[:, c] = torch.where(run_mf, 1, torch.where(c3_on & (c3 == 2), 3,
                                             torch.where(on8 & (c8 == 2), 8, torch.where(m, -1, self.bcap_resume[:, c]))))
        # the executions in node order
        ex1 = start1 & pair
        if bool(ex1.any()):
            move = ex1 & (self.barb_unit_tile[bidx, esc_] != civ_plot)
            self._tac_move_to(move, esc_, civ_plot.clamp(min=0), strike=False)
            meet = ex1 & (self.barb_unit_tile[bidx, esc_] == self.barb_unit_tile[bidx, csc])
            self.bcap_form[:, c] |= meet
        # Defend Units 5: a member released leaves the capture's team
        rel = self._bop_defend_exec(mv_on & mk5, cteam, goal, pct5, rng5, ctx)
        for us, r, plane in zip(cteam, rel, (self.bcap_civ, self.bcap_esc)):
            if bool(r.any()):
                plane[:, c] = torch.where(r, torch.full_like(us, -1), plane[:, c])
                mem[bidx[r], us[r].clamp(min=0)] = False
        zero = torch.zeros_like(self.barb_unit_alive)
        formed = self.bcap_form[:, c]
        zero[bidx[formed & civ_ok], csc[formed & civ_ok]] = True
        zero[bidx[formed & esc_ok], esc_[formed & esc_ok]] = True
        ex6 = mv_on & ~no_goal & ((c6 == 1) | (c6 == 2))
        if bool(ex6.any()):
            self._op_move_exec(ex6, mem, self._bcap_rank(c), goal, sp6, ar6, self.bcap_ready[:, c], done, rowof, res, zero=zero)
        self.bcap_form[:, c] &= ~seq7
        ex8 = on8 & ~no_goal & ((c8 == 1) | (c8 == 2))
        if bool(ex8.any()):
            self._op_move_exec(ex8, mem, self._bcap_rank(c), goal, sp8, ar8, self.bcap_ready[:, c], done, rowof, res)
        end = root_ok | root_fail
        self.bcap_id[:, c] = torch.where(end, torch.full_like(self.bcap_id[:, c], -1), self.bcap_id[:, c])
        self.bcap_civ[:, c] = torch.where(end, torch.full_like(cs, -1), self.bcap_civ[:, c])
        self.bcap_esc[:, c] = torch.where(end, torch.full_like(es, -1), self.bcap_esc[:, c])

    def _bcap_rank(self, c: int) -> torch.Tensor:
        """[B, P] capture `c`'s team's member order: the captive, then its
        captor"""
        rank = torch.full_like(self.barb_unit_join, -1)
        bidx = self._bidx
        for i, pl in enumerate((self.bcap_civ, self.bcap_esc)):
            sl = pl[:, c]
            m = sl >= 0
            rank[bidx[m], sl[m]] = i
        return rank

    def _bcap_move_update(self, on: torch.Tensor, c: int, node: int, mem: torch.Tensor, goal: torch.Tensor, rng: int,
                          spread: int, ctx: dict) -> tuple[torch.Tensor, torch.Tensor]:
        """OPERATION MOVE's update (`passMoveUpdate`) for capture `c`'s team
        at its store `node`, its goal the target: its status and whether the
        team arrived"""
        store = self.bcap_store[:, c, node].clone()
        sg = self.bcap_store_goal[:, c, node].clone()
        status, arrived, rest, _ = self._op_move_update(on, mem, self._bcap_rank(c), store, sg, goal, True, rng, spread,
                                                        ctx["rowof"], ctx["res"])
        st = rest.nonzero(as_tuple=True)[0]
        if st.numel():
            self.bcap_store[st, c, node] = store[st]
            self.bcap_store_goal[st, c, node] = sg[st]
        return status, arrived

    # -- the trees' walk -----------------------------------------------------

    def _barb_trees(self, done: torch.Tensor, ai: torch.Tensor, order: torch.Tensor, rowof: torch.Tensor,
                    res: dict, tg: dict, danger: torch.Tensor) -> None:
        """`barbarianTrees`: every tree of the barbarians — their tribes'
        operations', their captures' and their scouts' — in id order, a tree
        started in the walk ticking in it after the others; the operations'
        members' turns are theirs"""
        B = self.B
        dev = self.device
        if not B:
            return
        self._barb_op_bury()
        ctx = {"done": done, "ai": ai, "order": order, "rowof": rowof, "res": res, "tg": tg, "danger": danger}
        last = torch.full((B,), -1, dtype=torch.long, device=dev)
        big = 1 << 40
        while True:
            K = int(self.n_tribes.max())
            op_on = (self.tribe_op[:, :K] > 0) & ~self.tribe_op_done[:, :K] & (self.tribe_op_id[:, :K] > last.unsqueeze(1))
            hm_on = (self.tribe_home_slot[:, :K] != -1) & (self.tribe_home_id[:, :K] > last.unsqueeze(1))
            cp_on = (self.bcap_id >= 0) & (self.bcap_id > last.unsqueeze(1))
            ids = torch.cat((torch.where(op_on, self.tribe_op_id[:, :K], big), torch.where(hm_on, self.tribe_home_id[:, :K], big),
                             torch.where(cp_on, self.bcap_id, big)), dim=1)
            nxt = ids.min(dim=1).values
            go = nxt < big
            if not bool(go.any()):
                break
            for c in range(self.bcap_id.shape[1]):
                m = go & cp_on[:, c] & (self.bcap_id[:, c] == nxt)
                if bool(m.any()):
                    self._bop_capture_tick(m, c, ctx)
            for k in range(K):
                m = go & op_on[:, k] & (self.tribe_op_id[:, k] == nxt)
                if bool(m.any()):
                    raid = m & (self.tribe_op[:, k] == 1)
                    if bool(raid.any()):
                        self._bop_raid_tick(raid, k, ctx)
                    ass = m & (self.tribe_op[:, k] == 2)
                    if bool(ass.any()):
                        self._bop_assault_tick(ass, k, ctx)
                h = go & hm_on[:, k] & (self.tribe_home_id[:, k] == nxt)
                if bool(h.any()):
                    self._bop_scout_tick(h, k, ctx)
            last = torch.where(go, nxt, last)
        self._barb_op_bury()

    # -- Raid City -----------------------------------------------------------

    def _bop_recruit_seq(self, m: torch.Tensor, k: int, raiding: bool, limit: int) -> torch.Tensor:
        """the recruit's Sequence (Spawn Change, Priority over the Turn Limiter
        over Barbarian Recruit and Spawn Change, Spawn Change) in the games
        `m`: [B] the Sequence SUCCEEDED (its recruit whole, or its limiter
        spent); its spawn changes executed (the force's rate on its first
        tick, the tribe's own once it ends)"""
        turn = int(self.turn)
        first = m & (self.tribe_op_rstart[:, k] < 0)
        self.tribe_op_rstart[:, k] = torch.where(first, turn, self.tribe_op_rstart[:, k])
        whole = self._bop_recruit(m, k, raiding)
        elapsed = turn - self.tribe_op_rstart[:, k]
        spent = m & ~whole & (elapsed >= limit * int(self._bb["costPct"]) // 100)
        ok = m & (whole | spent)
        kind = self.tribe_kind[:, k]
        forces = self._bb["forces"]
        rate = torch.tensor([[f[0] for f in fk] for fk in forces], dtype=torch.long, device=self.device)[kind, 0 if raiding else 1]
        self.tribe_every[:, k] = torch.where(first & (rate >= 0), rate, self.tribe_every[:, k])
        self.tribe_every[:, k] = torch.where(ok, torch.full_like(rate, -1), self.tribe_every[:, k])
        return ok

    def _bop_raid_tick(self, m: torch.Tensor, k: int, ctx: dict) -> None:
        """"Raid City"'s tick (the root Sequence from the child it resumes at:
        the recruit 2, the march 9, the raid 12, the way home 22): the walk's
        statuses, then the executions in node order — Attack Units 10, Move
        11, Attack Units 16, Pillage 17, Attack City 19, Defend Units 20, Move
        21, Attack Units 23, Move 24, Notify Owner 25"""
        tr = self._bop_trees()
        turn = int(self.turn)
        resume = self.tribe_op_resume[:, k]
        target = self.tribe_op_plot[:, k]
        rally = self.tribe_rally[:, k]
        end = torch.zeros_like(m)
        rec = m & (resume <= 2)
        ok2 = self._bop_recruit_seq(rec, k, True, tr.raid_recruit)
        self.tribe_op_resume[:, k] = torch.where(rec & ~ok2, 2, self.tribe_op_resume[:, k])
        # the march (Concurrent 9: Attack Units, Operation Move to the target)
        march = m & ((resume == 9) | ok2)
        no_goal = target < 0
        sl, rg, sp = tr.raid_moves[0]
        st11, ar11 = self._bop_move_update(march & ~no_goal, k, 0, target, sl == 1, rg, sp, ctx)
        c9 = torch.where(no_goal, _F, st11)
        self.tribe_op_resume[:, k] = torch.where(march & (c9 == _R), 9, self.tribe_op_resume[:, k])
        end |= march & (c9 == _F)
        # the raid (Priority 12: Raid Check, else the Turn Limiter over
        # Concurrent 15)
        raid = m & ((resume == 12) | (march & (c9 == _S)))
        check = raid & (self.tribe_score[:, k] >= tr.raid_score)
        r14 = raid & ~check
        self.tribe_raid_from[:, k] = torch.where(r14 & (self.tribe_raid_from[:, k] < 0), turn, self.tribe_raid_from[:, k])
        gone = no_goal | ~self._centre_plane().gather(1, target.clamp(min=0).unsqueeze(1)).squeeze(1)
        living = self._bop_members(k).any(dim=1)
        pil_ok = gone | living
        cont = r14 & pil_ok
        team = self._bop_team(k)
        pct20, rng20 = tr.raid_defend
        mk20 = self._bop_defend_update(cont, team, pct20, ctx)
        # the target owner's handicap — every seat's the one the rules give
        h = int(self._bb["handicap"])
        inside = (tr.raid_city_lo < 0 or h >= tr.raid_city_lo) and (tr.raid_city_hi < 0 or h <= tr.raid_city_hi)
        ac = torch.where(gone, _S, _R)
        sl, rg, sp = tr.raid_moves[1]
        st21, ar21 = self._bop_move_update(cont, k, 1, target, sl == 1, rg, sp, ctx)
        c15 = torch.where(r14 & ~pil_ok, _F, torch.maximum(ac, st21) if inside else st21)
        elapsed = turn - self.tribe_raid_from[:, k]
        lim = torch.where((elapsed <= tr.raid_turns) & (c15 != _F), _R,
                          torch.where((c15 == _R) & (elapsed >= tr.raid_turns * int(self._bb["costPct"]) // 100), _S, c15))
        p12 = torch.where(check, _S, lim)
        self.tribe_op_resume[:, k] = torch.where(raid & (p12 == _R), 12, self.tribe_op_resume[:, k])
        end |= raid & (p12 == _F)
        # the way home (Concurrent 22: Attack Units, Operation Move to the rally)
        home = m & ((resume == 22) | (raid & (p12 == _S)))
        sl, rg, sp = tr.raid_moves[2]
        st24, ar24 = self._bop_move_update(home, k, 2, rally, sl == 1, rg, sp, ctx)
        self.tribe_op_resume[:, k] = torch.where(home & (st24 == _R), 22, self.tribe_op_resume[:, k])
        notify = home & (st24 == _S)
        end |= notify
        # the executions in node order
        ready = self.tribe_op_ready[:, k]
        self._bop_attack_units(march, k, ctx)
        self._bop_move_exec(march & ~no_goal, k, target, tr.raid_moves[0][2], ar11, ready, ctx)
        self._bop_attack_units(r14, k, ctx)
        self._bop_pillage(cont, k, ctx)
        if inside:
            self._bop_attack_city(cont, k, ctx)
        self._bop_defend(cont, mk20, k, team, pct20, rng20, ctx)
        self._bop_move_exec(cont, k, target, tr.raid_moves[1][2], ar21, ready, ctx)
        self._bop_attack_units(home, k, ctx)
        self._bop_move_exec(home, k, rally, tr.raid_moves[2][2], ar24, ready, ctx)
        # NOTIFY OWNER: the raid's city to the tribe's assault list
        self._barb_push(self.tribe_assq, notify, k, self.tribe_op_seat[:, k])
        self._barb_push(self.tribe_assp, notify, k, target)
        self.tribe_op_done[:, k] |= end

    # -- Barbarian City Attack -----------------------------------------------

    def _bop_assault_tick(self, m: torch.Tensor, k: int, ctx: dict) -> None:
        """"Barbarian City Attack"'s tick (the root Concurrent over Defend
        Units and the Sequence 2 from the child it resumes at: the recruit 4,
        the gathering 11, the march 14, the assault 18): the walk's statuses,
        then the executions in node order — Defend Units 1, Move 13, Attack
        Units 15, Move 17,
        Siege City 19, Attack City 20, Attack Units 21, Pillage 23, Move 24
        (Make Formation forms no pair: its formations take a civilian)"""
        tr = self._bop_trees()
        resume = self.tribe_op_resume[:, k]
        target = self.tribe_op_plot[:, k]
        rally = self.tribe_rally[:, k]
        end = torch.zeros_like(m)
        # Operation Defend Units 1, the root Concurrent's first child
        team = self._bop_team(k)
        pct1, rng1 = tr.ass_defend
        mk1 = self._bop_defend_update(m, team, pct1, ctx)
        rec = m & (resume <= 4)
        ok4 = self._bop_recruit_seq(rec, k, False, tr.ass_recruit)
        self.tribe_op_resume[:, k] = torch.where(rec & ~ok4, 4, self.tribe_op_resume[:, k])
        # the gathering (Concurrent 11: Make Formation, Operation Move to the rally)
        gather = m & ((resume == 11) | ok4)
        sl, rg, sp = tr.ass_moves[0]
        goal0 = torch.where(torch.full_like(target, sl) == 1, target, rally)
        no0 = goal0 < 0
        st13, ar13 = self._bop_move_update(gather & ~no0, k, 0, goal0, sl == 1, rg, sp, ctx)
        c11 = torch.where(no0, _F, st13)
        self.tribe_op_resume[:, k] = torch.where(gather & (c11 == _R), 11, self.tribe_op_resume[:, k])
        end |= gather & (c11 == _F)
        # the march (Concurrent 14: Attack Units, Make Formation, Operation Move
        # to the target)
        march = m & ((resume == 14) | (gather & (c11 == _S)))
        sl, rg, sp = tr.ass_moves[1]
        goal1 = target if sl == 1 else rally
        no1 = goal1 < 0
        st17, ar17 = self._bop_move_update(march & ~no1, k, 1, goal1, sl == 1, rg, sp, ctx)
        c14 = torch.where(no1, _F, st17)
        self.tribe_op_resume[:, k] = torch.where(march & (c14 == _R), 14, self.tribe_op_resume[:, k])
        end |= march & (c14 == _F)
        # the assault (Concurrent 18: Siege City, Attack City, Attack Units,
        # Make Formation, Pillage, Operation Move onto the target)
        ass = m & ((resume == 18) | (march & (c14 == _S)))
        gone = (target < 0) | ~self._centre_plane().gather(1, target.clamp(min=0).unsqueeze(1)).squeeze(1)
        living = self._bop_members(k).any(dim=1)
        s19 = torch.where(gone, _S, torch.where(living, _S, _F))
        a20 = torch.where(gone, _S, torch.where(living, _R, _F))
        c18 = torch.maximum(s19, a20)
        fail18 = ass & (c18 == _F)
        on23 = ass & ~fail18
        sl, rg, sp = tr.ass_moves[2]
        goal2 = target if sl == 1 else rally
        st24, ar24 = self._bop_move_update(on23 & (goal2 >= 0), k, 2, goal2, sl == 1, rg, sp, ctx)
        c18 = torch.where(fail18, _F, torch.maximum(c18, torch.where(goal2 >= 0, st24, _F)))
        self.tribe_op_resume[:, k] = torch.where(ass & (c18 == _R), 18, self.tribe_op_resume[:, k])
        end |= ass & (c18 != _R)
        # the executions in node order
        ready = self.tribe_op_ready[:, k]
        self._bop_defend(m, mk1, k, team, pct1, rng1, ctx)
        self._bop_move_exec(gather & ~no0, k, goal0, tr.ass_moves[0][2], ar13, ready, ctx)
        self._bop_attack_units(march, k, ctx)
        self._bop_move_exec(march & ~no1, k, goal1, tr.ass_moves[1][2], ar17, ready, ctx)
        self._bop_siege(ass & (s19 == _S), k, ctx)
        self._bop_attack_city(ass & ~fail18, k, ctx)
        self._bop_attack_units(on23, k, ctx)
        self._bop_pillage(on23, k, ctx)
        self._bop_move_exec(on23 & (goal2 >= 0), k, goal2, tr.ass_moves[2][2], ar24, ready, ctx)
        # the assault's Notify Owner: no city to a list (a bribed tribe's alone)
        self.tribe_op_done[:, k] |= end

    # -- Operation Defend Units ----------------------------------------------

    def _bop_endangered(self, j: torch.Tensor, on: torch.Tensor, ctx: dict) -> torch.Tensor:
        """[B] bool — the team update's endangered (`endangered`, 0x738f20)
        for the barbarians' unit at pool slot `j` [B] where `on`: the pass's
        targets within twice its base Movement — a unit of an entry that
        fights, where no barbarian unit stands beside the member and its plot
        holds danger or the entry is HIGH, within the unit's Movement or its
        range, adds its blow on the member (`damageExpected` on their
        strengths); a combat district's city that strikes, the member within
        its range of the centre, its strike — and the member the sum leaves
        with no hit points (one that does not fight, any blow at all on land)
        is endangered"""
        B, dev = self.B, self.device
        b = self._bidx
        jc = j.clamp(min=0)
        tg, danger = ctx["tg"], ctx["danger"]
        ut = self.barb_unit_type[b, jc].clamp(min=0, max=self.NU - 1)
        cb_all = self._ai_combat()
        mcb = cb_all[:, self.POOL_LO["barb"]:self.POOL_HI["barb"]][b, jc]
        fights = (mcb > 0) | (self._type_ranged_strength.take(ut) > 0) | (self._type_bombard.take(ut) > 0)
        plot = self.barb_unit_tile[b, jc].clamp(min=0)
        near = 2 * self._type_moves.take(ut)
        d = self.pair_dist[plot].to(torch.long)  # [B, T]
        own = self.barb_unit_alive & (self.barb_unit_tile >= 0)
        own_d = self.pair_dist[plot.unsqueeze(1), self.barb_unit_tile.clamp(min=0)].to(torch.long)
        others = torch.arange(own.shape[1], device=dev).unsqueeze(0) != jc.unsqueeze(1)
        beside = (own & others & (own_d == 1)).any(dim=1)
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
        ent_d = (tg["dk"] == 1) & (d <= near.unsqueeze(1))
        if bool((ent_d & on.unsqueeze(1)).any()):
            for row in range(self.city_alive.shape[1]):
                rs = int(self._ROW_SEAT[row])
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
                    ok = alive & (n > 0) & (str_ > 0) & (self.pair_dist[plot, ctr].to(torch.long) <= _CITY_STRIKE_RANGE)
                    hit = self._damage_expected(str_ - mcb.to(torch.float64))
                    total = total + torch.where(ok, n * hit, torch.zeros_like(hit))
        hp_max = int(self.rules.combat["unitHp"])
        dmg_now = hp_max - self.barb_unit_hp[b, jc].long()
        weak = (total > 0) & ~fights
        land = ~self.water[b, plot]
        return on & ((weak & land) | (~weak & (dmg_now + total > hp_max)))

    def _bop_hurt(self, j: torch.Tensor, pct: int) -> torch.Tensor:
        """[B] bool — the barbarians' unit at pool slot `j` hurt to `pct`
        percent of its hit points (single precision)"""
        hp_max = int(self.rules.combat["unitHp"])
        f32 = torch.float32
        bar = float(torch.tensor(hp_max, dtype=f32) * torch.tensor(float(torch.tensor(pct, dtype=f32) * torch.tensor(0.01, dtype=f32)), dtype=f32))
        return (hp_max - self.barb_unit_hp[self._bidx, j.clamp(min=0)].long()).to(torch.float64) >= bar

    def _bop_live(self, us: torch.Tensor) -> torch.Tensor:
        uc = us.clamp(min=0)
        return (us >= 0) & self.barb_unit_alive[self._bidx, uc] & (self.barb_unit_tile[self._bidx, uc] >= 0)

    def _bop_defend_update(self, on: torch.Tensor, team: list, pct: int, ctx: dict) -> torch.Tensor:
        """OPERATION DEFEND UNITS' update (`flagged`, 0x80ee70) for a team of
        the barbarians' pool slots `team` (each [B], -1 none) in the games
        `on`: [B] the node marked — a member endangered, hurt to `pct`
        percent, or fortified on a plot of danger (the node SUCCEEDS)"""
        b = self._bidx
        danger = ctx["danger"]
        marked = torch.zeros_like(on)
        for us in team:
            ok = on & self._bop_live(us)
            if not bool(ok.any()):
                continue
            uc = us.clamp(min=0)
            plot = self.barb_unit_tile[b, uc].clamp(min=0)
            fort = self.barb_unit_fortify[b, uc] >= 2
            marked |= ok & (self._bop_endangered(us, ok, ctx) | self._bop_hurt(us, pct)
                            | (fort & (danger.gather(1, plot.unsqueeze(1)).squeeze(1) > 0)))
        return marked

    def _bop_defend_exec(self, g: torch.Tensor, team: list, target: torch.Tensor, pct: int, rng: int,
                         ctx: dict) -> list:
        """OPERATION DEFEND UNITS' execution (`DefendOrders.execute`, 0x80d790)
        where `g` (marked) over the team's slots `team` in its order, the
        members outside `rng` of `target` (-1: all): the endangered — not
        bombard, with Movement, out of a city centre — to their safe plots
        (0x716b90); then the hurt (or fortified afloat in danger), not
        bombard: one not dug in released from the team (no plot is the
        barbarians' own ground); one fortified afloat to its safe plot; one
        with Movement on a plot of danger to its safe plot (the barbarians
        hold no war rows); each fortified, its turn ended. [B] per member,
        released"""
        B, dev = self.B, self.device
        b = self._bidx
        danger, done = ctx["danger"], ctx["done"]
        rowof, res = ctx["rowof"], ctx["res"]
        none_taken = torch.zeros(B, self.T, dtype=torch.bool, device=dev)
        tc = target.clamp(min=0)
        released = [torch.zeros_like(g) for _ in team]
        if not bool(g.any()):
            return released

        def off(us: torch.Tensor) -> torch.Tensor:
            if rng < 0:
                return torch.ones(B, dtype=torch.bool, device=dev)
            return self.pair_dist[self.barb_unit_tile[b, us.clamp(min=0)].clamp(min=0), tc].to(torch.long) >= rng

        def to_safe(us: torch.Tensor, m: torch.Tensor, stay_ok: bool) -> None:
            if not bool(m.any()):
                return
            uc = us.clamp(min=0)
            dest = self._tac_safe_plot(m, uc, "barb", BARB_SEAT, danger, rowof, res, none_taken)
            done[b, uc] = torch.where(m, True, done[b, uc])
            here = self.barb_unit_tile[b, uc]
            go = m & (dest >= 0) & (stay_ok | (dest != here)) & (here != dest) & (self.barb_unit_mp[b, uc] > 0)
            if bool(go.any()):
                self._tac_move_to(go, uc, dest.clamp(min=0), strike=False)

        # the endangered, listed as the execution opens, in the team's order
        listed = [self._bop_endangered(us, g & self._bop_live(us), ctx) for us in team]
        for us, ok in zip(team, listed):
            ok = ok & self._bop_live(us)
            if not bool(ok.any()):
                continue
            uc = us.clamp(min=0)
            ut = self.barb_unit_type[b, uc].clamp(min=0, max=self.NU - 1)
            ok &= (off(us) & (self._type_bombard.take(ut) <= 0) & (self.barb_unit_mp[b, uc] > 0)
                   & ~self._centre_plane()[b, self.barb_unit_tile[b, uc].clamp(min=0)])
            to_safe(us, ok, True)
        # the hurt
        for i, us in enumerate(team):
            ok = g & self._bop_live(us)
            if not bool(ok.any()):
                continue
            uc = us.clamp(min=0)
            ok &= (self.barb_unit_mp[b, uc] > 0) & off(us)
            plot = self.barb_unit_tile[b, uc].clamp(min=0)
            fort = self.barb_unit_fortify[b, uc]
            wat = self.water[b, plot]
            dang = danger.gather(1, plot.unsqueeze(1)).squeeze(1) > 0
            ok &= self._bop_hurt(us, pct) | ((fort >= 2) & wat & dang)
            ut = self.barb_unit_type[b, uc].clamp(min=0, max=self.NU - 1)
            ok &= self._type_bombard.take(ut) <= 0
            if not bool(ok.any()):
                continue
            rel = ok & (fort == 0)
            released[i] = rel
            # a member released still ends its turn in the walk that held it
            done[b, uc] = torch.where(rel, True, done[b, uc])
            ok &= ~rel
            to_safe(us, ok & (fort >= 2) & wat, True)
            ok &= self._bop_live(us)
            plot = self.barb_unit_tile[b, uc].clamp(min=0)
            dang = danger.gather(1, plot.unsqueeze(1)).squeeze(1) > 0
            to_safe(us, ok & (self.barb_unit_mp[b, uc] > 0) & dang, False)
            ok &= self._bop_live(us)
            done[b, uc] = torch.where(ok, True, done[b, uc])
        return released

    def _bop_team(self, k: int) -> list:
        """tribe `k`'s operation's living members as a team in pool slot
        order: one [B] slot tensor (-1 none) per slot any game fills"""
        mem = self._bop_members(k)
        cols = mem.any(dim=0).nonzero(as_tuple=True)[0].tolist()
        return [torch.where(mem[:, j], j, -1) for j in cols]

    def _bop_defend(self, upd: torch.Tensor, marked: torch.Tensor, k: int, team: list, pct: int, rng: int,
                    ctx: dict) -> None:
        """tribe `k`'s Defend Units executed where walked (`upd`) and marked,
        a member released leaving the operation"""
        rel = self._bop_defend_exec(upd & marked, team, self.tribe_op_plot[:, k], pct, rng, ctx)
        b = self._bidx
        for us, r in zip(team, rel):
            if bool(r.any()):
                self.barb_unit_op[b[r], us[r]] = False

    # -- the nodes -----------------------------------------------------------

    def _bop_move_update(self, on: torch.Tensor, k: int, node: int, goal: torch.Tensor, target: bool, rng: int,
                         spread: int, ctx: dict) -> tuple[torch.Tensor, torch.Tensor]:
        """OPERATION MOVE's update (`passMoveUpdate`) for tribe `k`'s team in
        the games `on` at the node's store `node`: its status (1 SUCCESS, 2
        RUNNING) and whether the team arrived"""
        mem = self._bop_members(k)
        store = self.tribe_store[:, k, node].clone()
        sg = self.tribe_store_goal[:, k, node].clone()
        status, arrived, rest, _ = self._op_move_update(on, mem, self.barb_unit_join, store, sg, goal, target, rng, spread,
                                                        ctx["rowof"], ctx["res"])
        st = rest.nonzero(as_tuple=True)[0]
        if st.numel():
            self.tribe_store[st, k, node] = store[st]
            self.tribe_store_goal[st, k, node] = sg[st]
        return status, arrived

    def _bop_move_exec(self, on: torch.Tensor, k: int, goal: torch.Tensor, rng: int, arrived: torch.Tensor,
                       ready: torch.Tensor, ctx: dict) -> None:
        """OPERATION MOVE's execution (`passMoveExec`) for tribe `k`'s team in
        the games `on`: nothing where its team is ready and arrived"""
        if not bool(on.any()):
            return
        self._op_move_exec(on, self._bop_members(k), self.barb_unit_join, goal, rng, arrived, ready, ctx["done"], ctx["rowof"], ctx["res"])

    def _bop_recruit(self, act: torch.Tensor, k: int, raiding: bool) -> torch.Tensor:
        """BARBARIAN RECRUIT (0x7c7580) for tribe `k`'s operation in the games
        `act`: the force (the BarbarianAttackForces row of the AI's handicap,
        a raid's or an assault's) from the tribe's units of each class not
        raised this turn and in no operation, in pool slot order (the unit
        evaluator's walk, 0x60a8c0): each class's first n held, a later one
        with less damage taking the place of the first held with more
        (0x7c62f0); whole, it joins the team in slot
        order (`barb_unit_join`); else the rest is asked for, melee first.
        [B] the force joined."""
        if not bool(act.count_nonzero()):
            return torch.zeros_like(act)
        bb = self._bb
        dev = self.device
        kind = self.tribe_kind[:, k]
        col = 0 if raiding else 1
        forces = bb["forces"]  # [kind][raid 0 / assault 1] = [rate, [[tag, n] ...]]
        unit_for = self._barb_unit_for()  # [B, n_tags]
        free = (self.barb_unit_alive & (self.barb_unit_tribe == k) & ~self.barb_unit_scout & ~self.barb_unit_fresh
                & ~self.barb_unit_op & ~self._bcap_members() & act.unsqueeze(1))
        bidx = self._bidx
        dmg = int(self.rules.combat["unitHp"]) - self.barb_unit_hp.long()
        taken = torch.zeros_like(free)
        rank = torch.full_like(self.barb_unit_join, -1)
        queue = torch.full((self.B, self.TQ), -1, dtype=torch.long, device=dev)
        off = torch.zeros(self.B, dtype=torch.long, device=dev)
        n_e = max(len(f[1]) for fk in forces for f in fk)
        ptype = self.barb_unit_type.clamp(min=0, max=self.NU - 1)
        for e in range(n_e):
            tag_t = torch.tensor([[f[1][e][0] if e < len(f[1]) else -1 for f in fk] for fk in forces],
                                 dtype=torch.long, device=dev)[kind, col]
            n_t = torch.tensor([[f[1][e][1] if e < len(f[1]) else 0 for f in fk] for fk in forces],
                               dtype=torch.long, device=dev)[kind, col]
            utype = unit_for.gather(1, tag_t.clamp(min=0).unsqueeze(1)).squeeze(1)
            valid = act & (tag_t >= 0) & (utype >= 0) & (n_t > 0)
            member = self._barb_tag_member[tag_t.clamp(min=0).unsqueeze(1), ptype]  # [B, P]
            elig = free & ~taken & member & valid.unsqueeze(1)
            # the request's fill in slot order: the first n held, a later
            # one with less damage taking the place of the first held with more
            nmax = int(n_t.max()) if n_t.numel() else 0
            held = torch.full((self.B, max(nmax, 1)), -1, dtype=torch.long, device=dev)
            cnt = torch.zeros(self.B, dtype=torch.long, device=dev)
            for j in [int(x) for x in elig.any(dim=0).nonzero(as_tuple=True)[0].tolist()]:
                e = elig[:, j]
                fill = e & (cnt < n_t)
                if bool(fill.any()):
                    held[bidx[fill], cnt[fill]] = j
                rep_ = e & ~fill
                done_r = torch.zeros_like(rep_)
                for q in range(nmax):
                    hq = held[:, q]
                    hd = dmg.gather(1, hq.clamp(min=0).unsqueeze(1)).squeeze(1)
                    c = rep_ & ~done_r & (q < n_t) & (hq >= 0) & (dmg[:, j] < hd)
                    held[:, q] = torch.where(c, torch.full_like(hq, j), hq)
                    done_r |= c
                cnt = cnt + fill.long()
            take = torch.zeros_like(elig)
            for q in range(nmax):
                hq = held[:, q]
                ok_q = hq >= 0
                take[bidx[ok_q], hq[ok_q]] = True
            taken |= take
            miss = torch.where(valid, n_t - take.long().sum(dim=1), torch.zeros_like(n_t))
            for j in range(int(n_t.max()) if n_t.numel() else 0):
                put = valid & (j < miss) & (off + j < self.TQ)
                rows = put.nonzero(as_tuple=True)[0]
                queue[rows, (off + j)[rows]] = utype[rows]
            off = off + miss
        need = act & (off > 0)
        self.tribe_queue[need, k] = queue[need]
        whole = act & (off == 0)
        add = taken & whole.unsqueeze(1)
        # the operation's units listed by the player's walk (0x6092c0) join
        # in slot order
        rank = torch.where(add, add.long().cumsum(dim=1) - 1, rank)
        self.barb_unit_op |= add
        self.barb_unit_join = torch.where(add, rank, self.barb_unit_join)
        return whole

    def _bop_attack_units(self, on: torch.Tensor, k: int, ctx: dict) -> None:
        """OPERATION ATTACK UNITS' execution (0x80ceb0, `attackUnitsExecute`)
        for tribe `k`'s team in the games `on`, a team that took units in:
        its living members with Movement left and a planning (a bombard unit
        only against a city of another player), the list's unit targets near
        them (Attack Nearby Units: not their own, within max(2, a member's
        Movement left) of one; with an enemy named, its units or a civilian),
        the assignment (the exchange filter for a team of one, the survival
        filter) carried out"""
        if not bool(on.count_nonzero()):
            return
        B, T = self.B, self.T
        dev = self.device
        rowof, res, tg, done = ctx["rowof"], ctx["res"], ctx["tg"], ctx["done"]
        mem = self._bop_members(k)
        joined = mem.any(dim=1) | (self.tribe_op_dead[:, k] > 0)
        on = on & joined
        ut = self.barb_unit_type.clamp(min=0, max=self.NU - 1)
        tplot = self.tribe_op_plot[:, k]
        city = self._centre_plane().gather(1, tplot.clamp(min=0).unsqueeze(1)).squeeze(1) & (tplot >= 0)
        enemy_city = city & (self.tile_seat.gather(1, tplot.clamp(min=0).unsqueeze(1)).squeeze(1) != BARB_SEAT)
        bomb = self._type_bombard.take(ut) > 0
        units = mem & (self.barb_unit_mp > 0) & on.unsqueeze(1) & (~bomb | enemy_city.unsqueeze(1)) & (rowof >= 0)
        if not bool(units.count_nonzero()):
            return
        reach = torch.where(units, torch.div(self.barb_unit_mp, self._mp_scale, rounding_mode="floor").clamp(min=2),
                            torch.full_like(self.barb_unit_mp, -1))
        unit_pl, kinds, owner = tg["uu"], tg["uk"], tg["us"]
        L = kinds.shape[1] // T
        s = unit_pl.clamp(min=0)
        # each unit entry's unit still on its plot
        standing = ((unit_pl >= 0) & self.unit_alive.gather(1, s) & (self.unit_tile.gather(1, s) == self._arange_bt.repeat(1, L))
                    & (self.unit_seat.gather(1, s) != BARB_SEAT))
        enemy = torch.where(self.tribe_op[:, k] == 2, self.tribe_op_seat[:, k], torch.full_like(tplot, -1))
        theirs = (enemy.unsqueeze(1) < 0) | (owner == enemy.unsqueeze(1)) | (kinds == 7)
        near = torch.zeros(B, T, dtype=torch.bool, device=dev)
        for j in units.any(dim=0).nonzero(as_tuple=True)[0].tolist():
            mj = units[:, j]
            dq = self.pair_dist[self.barb_unit_tile[:, j].clamp(min=0)].to(torch.long)
            near |= mj.unsqueeze(1) & (dq <= reach[:, j].unsqueeze(1))
        near = near.repeat(1, L) & (kinds > 0) & standing & theirs & (owner != BARB_SEAT)
        if not bool(near.count_nonzero()):
            return
        one = units.sum(dim=1) == 1
        out = self._tac_assign(units, ctx["order"], ctx["ai"], near, res, rowof, unit_pl, one, True, kinds, tg["uo"],
                               self._tac_peers(mem))
        self._tac_carry_out(out, done, rowof, res)

    def _bop_pillage(self, on: torch.Tensor, k: int, ctx: dict) -> None:
        """OPERATION PILLAGE's execution (0x811390, `pillageExecute`) for tribe
        `k`'s team in the games `on` (`_op_pillage`, every kind)"""
        self._op_pillage(on, self._bop_members(k), self.barb_unit_join, self.tribe_op_plot[:, k], ctx, True, True, True,
                         BARB_SEAT)

    def _op_pillage(self, on: torch.Tensor, mem: torch.Tensor, join: torch.Tensor, tplot: torch.Tensor, ctx: dict,
                    districts: bool, improvements: bool, goodies: bool, seat: int) -> None:
        """OPERATION PILLAGE's execution (0x811390, `pillageExecute`) for an
        operation's members `mem` [B, P] of the hostile pool (their order
        `join`, player `seat`) against the target `tplot` in the games `on`:
        per IMPROVEMENT, PASSIVE_DISTRICT or GOODY entry of the list (each
        kind unless the node's flag says false) in its order on the ground of
        the target's owner, of the living members with Movement left and no
        bombard strength (a ship's not for a water plot; a goody hut any,
        else one that fights): each on it pillages there; else the nearest
        whose planning reaches it within two turns with Movement left there
        (none of its domain and kind on it) and within twice its Movement (a
        goody hut at any distance), the first of equals in that order, goes
        and pillages on arrival"""
        if not bool(on.count_nonzero()):
            return
        B = self.B
        dev = self.device
        bidx = torch.arange(B, device=dev)
        rowof, res, tg, done = ctx["rowof"], ctx["res"], ctx["tg"], ctx["done"]
        owner = torch.where(tplot >= 0, self.tile_seat.gather(1, tplot.clamp(min=0).unsqueeze(1)).squeeze(1),
                            torch.full_like(tplot, -1))
        ground = (owner.unsqueeze(1) < 0) | (self.tile_seat == owner.unsqueeze(1))
        nil = torch.zeros_like(ground)
        imp = (tg["ok"] == 9) & ground if improvements else nil
        dis = (tg["dk"] == 2) & ground if districts else nil
        goody = (tg["ok"] == 5) & ground if goodies else nil
        ut = self.barb_unit_type.clamp(min=0, max=self.NU - 1)
        mp_whole = torch.div(self.barb_unit_mp, self._mp_scale, rounding_mode="floor")
        P = self.barb_unit_op.shape[1]
        naval = self.unit_naval.take(ut)
        water = self.water
        for p in (on.unsqueeze(1) & (imp | dis | goody)).any(dim=0).nonzero(as_tuple=True)[0].tolist():
            for kindm, is_goody in ((dis[:, p], False), (imp[:, p], False), (goody[:, p], True)):
                g = on & kindm
                if not bool(g.any()):
                    continue
                el = (mem & self.barb_unit_alive & (self.barb_unit_seat == seat) & (self.barb_unit_mp > 0)
                      & (self._type_bombard.take(ut) <= 0) & g.unsqueeze(1) & ~(naval & water[:, p].unsqueeze(1)))
                if not is_goody:
                    el &= self._type_combat.take(ut) > 0
                here = el & (self.barb_unit_tile == p)
                for j in here.any(dim=0).nonzero(as_tuple=True)[0].tolist():
                    hj = here[:, j]
                    us = torch.full((B,), j, dtype=torch.long, device=dev)
                    self._barb_pillage_here(hj, us)
                    done[bidx[hj], j] = True
                cand = el & ~here
                if not is_goody:
                    cand &= self.pair_dist[self.barb_unit_tile.clamp(min=0), torch.full_like(self.barb_unit_tile, p)].to(torch.long) \
                        < 2 * mp_whole
                if not bool(cand.any()):
                    continue
                # the planning's spot on the plot within two turns with
                # Movement left, none of its domain and kind there
                spot_ok = torch.zeros_like(cand)
                cb, cs = cand.nonzero(as_tuple=True)
                pp = torch.full_like(cb, p)
                sp = self._op_reach_at(cb, cs, pp, 2, True, torch.zeros_like(cb), rowof, res, "barb", seat)
                blocked = self._bop_spot_held(cb, cs, pp)
                spot_ok[cb, cs] = (sp >= 0) & ~blocked
                d = self.pair_dist[self.barb_unit_tile.clamp(min=0), torch.full_like(self.barb_unit_tile, p)].to(torch.long)
                key = torch.where(spot_ok, d * (P + 1) + join.clamp(min=0), torch.full_like(d, 1 << 40))
                best = key.min(dim=1)
                go = best.values < (1 << 40)
                if not bool(go.any()):
                    continue
                us = best.indices
                dest = torch.full((B,), p, dtype=torch.long, device=dev)
                self._tac_move_to(go, us, dest, "barb", seat, strike=False)
                there = go & self.barb_unit_alive[bidx, us] & (self.barb_unit_tile[bidx, us] == p)
                self._barb_pillage_here(there, us)
                done[bidx[there], us[there]] = True

    def _bop_spot_held(self, rows: torch.Tensor, us: torch.Tensor, plot: torch.Tensor) -> torch.Tensor:
        """[N] another unit of the barbarian's domain and kind (one that fights,
        one that does not) stands on `plot` (`planSpot`)"""
        ut = self.barb_unit_type[rows, us].clamp(min=0, max=self.NU - 1)
        fights = self._type_combat.take(ut) > 0
        naval = self.unit_naval.take(ut)
        mil = self.military_at[rows, plot]
        civ = self.civilian_at[rows, plot]
        lo = self.POOL_LO["barb"]
        me = us + lo
        held_m = (mil >= 0) & (mil != me)
        held_c = (civ >= 0) & (civ != me)
        mt = self.unit_type[rows, mil.clamp(min=0)].clamp(min=0, max=self.NU - 1)
        same_dom = self.unit_naval.take(mt) == naval
        return torch.where(fights, held_m & same_dom, held_c)

    def _bop_attack_city(self, on: torch.Tensor, k: int, ctx: dict) -> None:
        """OPERATION ATTACK CITY's execution (0x8109e0, `attackCityExecute`)
        for tribe `k`'s team in the games `on`: its living members with
        Movement left, the list's COMBAT_DISTRICT targets within 3 of the
        target, the assignment (the survival filter) carried out"""
        if not bool(on.count_nonzero()):
            return
        rowof, res, tg, done = ctx["rowof"], ctx["res"], ctx["tg"], ctx["done"]
        tplot = self.tribe_op_plot[:, k]
        mem = self._bop_members(k)
        units = mem & (self.barb_unit_mp > 0) & on.unsqueeze(1) & (rowof >= 0)
        near = ((tg["dk"] == 1) & (self.pair_dist[tplot.clamp(min=0)].to(torch.long) <= 3) & (tplot >= 0).unsqueeze(1)
                & on.unsqueeze(1))
        if not bool((units.any(dim=1) & near.any(dim=1)).any()):
            return
        out = self._tac_assign(units, ctx["order"], ctx["ai"], near, res, rowof, tg["uu"], torch.zeros_like(on), True,
                               torch.zeros_like(tg["dk"]), self._arange_bt, self._tac_peers(mem), district=True)
        self._tac_carry_out(out, done, rowof, res)

    def _bop_siege(self, on: torch.Tensor, k: int, ctx: dict) -> None:
        """OPERATION SIEGE CITY's execution (0x811e80, `siegeCityExecute`) for
        tribe `k`'s team in the games `on`"""
        if not bool(on.count_nonzero()):
            return
        self._op_siege(on, self._bop_members(k), self.tribe_op_plot[:, k], self.barb_unit_join, ctx)

    # -- Operation Siege City -------------------------------------------------

    def _city_encircled(self, tgt: torch.Tensor) -> torch.Tensor:
        """[B] `encircled`: every passable plot beside the city centre at `tgt`
        holds a unit at war with the city's holder that exerts a zone of
        control (none of the Ranged or Siege class without SUPPRESSION, none
        embarked, none of a chassis that exerts none); none passable, no"""
        tc = tgt.clamp(min=0)
        ctr = self._centre_seat_plane().gather(1, tc.unsqueeze(1)).squeeze(1)
        nbh = self.neigh[tc]
        nbc = nbh.clamp(min=0)
        am = self.military_at.gather(1, nbc)
        at = self.unit_type.gather(1, am.clamp(min=0)).clamp(min=0, max=self.NU - 1)
        aseat = torch.where(am >= 0, self.unit_seat.gather(1, am.clamp(min=0)), torch.full_like(am, -1))
        ap = self.unit_promos.gather(1, am.clamp(min=0))
        apc = self.rules_dev.u_promo_class.take(at)
        no_ex = ((apc == self._pc_ranged) | (apc == self._pc_siege)) & ~self._promo_flag(at, ap, "ZOC_EXERT")
        emb = self.unit_emb.gather(1, am.clamp(min=0)) & (am >= 0)
        held = (self._seats_hostile(ctr.unsqueeze(1), aseat) & (am >= 0) & ~self._type_zoc_none.take(at) & ~no_ex & ~emb)
        passable = (nbh >= 0) & (self.passable.gather(1, nbc) | self.wpass.gather(1, nbc))
        return (tgt >= 0) & (ctr >= 0) & passable.any(dim=1) & ~(passable & ~held).any(dim=1)

    def _op_siege(self, on: torch.Tensor, mem: torch.Tensor, target: torch.Tensor, join: torch.Tensor, ctx: dict,
                  seat: int = BARB_SEAT) -> None:
        """OPERATION SIEGE CITY's execution (0x811e80, `siegeCityExecute`) for
        an operation's members `mem` [B, P] of the hostile pool (their order
        `join`, player `seat`) in the games
        `on`: the city encircled, each member in join order with Movement left
        and a range strikes it; else the six plots about it shared out by the
        generalized assignment (three passes) — a unit on one starts there; a
        plot's gain for a unit of its domain whose fresh planning reaches it
        (`reachOf`) is 0 where every plot is held and it holds none of this
        one, else (1, + 1 the plot unheld or held by it alone) plus the same
        for each plot it joins where the unit exerts a zone of control, times
        (1 + 1 reached this turn + 1 with Movement left there), + 100 where it
        completes the ring; a unit reaching a plot this turn rings it (and,
        with a zone of control, the plots it joins) — then plot by plot each
        holder not on a held plot moves to its own, again while one moved"""
        if not bool(on.any()):
            return
        B, dev = self.B, self.device
        bidx = torch.arange(B, device=dev)
        on = on & (target >= 0)
        enc = on & self._city_encircled(target)
        ut = self.barb_unit_type.clamp(min=0, max=self.NU - 1)
        order = torch.where(mem, join, torch.full_like(join, 1 << 30)).argsort(dim=1, stable=True)
        nmem = mem.sum(dim=1)
        if bool(enc.any()):
            for r in range(int(nmem.max())):
                us = order[:, r]
                m = enc & (r < nmem) & self.barb_unit_alive[bidx, us] & (self.barb_unit_mp[bidx, us] > 0) \
                    & (self._type_ranged_range.take(ut[bidx, us]) > 0)
                if not bool(m.any()):
                    continue
                ranged = self._type_ranged_strength.take(ut[bidx, us]) > 0
                here = self.barb_unit_tile[bidx, us].clamp(min=0)
                inr = ranged & (self.pair_dist[here, target.clamp(min=0)].to(torch.long) <= self._tac_range(bidx, us))
                fire = m & inr & (self.barb_unit_attacks[bidx, us] > 0)
                for u in torch.unique(us[fire]).tolist():
                    self._hostile_ranged_strike(fire & (us == u), target.clamp(min=0), "barb", u)
                self._tac_move_to(m & ~inr, us, target.clamp(min=0), "barb", seat, strike=True)
        go = on & ~enc
        if not bool(go.any()):
            return
        tc = target.clamp(min=0)
        # the slots in the direction order the TS twin walks (DIRECTION_TYPES:
        # SE, E, NE, NW, W, SW), a slot's river edges by their direction
        dirs = torch.tensor(_SIEGE_DIRS, dtype=torch.long, device=dev)
        sl = self.neigh[tc][:, dirs]                                            # [B, 6]
        valid = sl >= 0
        slc = sl.clamp(min=0)
        sea = self.water.gather(1, slc)
        bits = torch.arange(6, device=dev).unsqueeze(0)
        riv = lambda p, e: ((self.river_mask.gather(1, p) >> e) & 1) != 0  # noqa: E731
        nxt_i = (bits + 1) % 6
        prv_i = (bits + 5) % 6
        n_n = sl.gather(1, nxt_i.expand(B, 6))
        n_p = sl.gather(1, prv_i.expand(B, 6))
        e_n = dirs[(bits + 2) % 6].expand(B, 6)
        e_p = dirs[(bits + 4) % 6].expand(B, 6)
        joins_n = valid & (n_n >= 0) & (self.water.gather(1, n_n.clamp(min=0)) == sea) & ~riv(slc, e_n)
        joins_p = valid & (n_p >= 0) & (self.water.gather(1, n_p.clamp(min=0)) == sea) & ~riv(slc, e_p)
        count = torch.where(valid, 0, 1).to(torch.long)
        holder = torch.full((B, 6), -1, dtype=torch.long, device=dev)
        # the units: members alive with Movement left and no bombard strength, in join order
        cand = mem & (self.barb_unit_mp > 0) & (self._type_bombard.take(ut) <= 0) & go.unsqueeze(1)
        corder = torch.where(cand, join, torch.full_like(join, 1 << 30)).argsort(dim=1, stable=True)
        nU = cand.sum(dim=1)
        U = int(nU.max())
        if U == 0:
            return
        uslot = corder[:, :U]
        uv = torch.arange(U, device=dev).unsqueeze(0) < nU.unsqueeze(1)
        # each unit's fresh planning (`reachOf`): the turn and Movement left it reaches each plot with
        rt = torch.full((B, U, 6), -1, dtype=torch.long, device=dev)
        rm = torch.zeros((B, U, 6), dtype=torch.long, device=dev)
        for i in range(U):
            rows = (go & uv[:, i]).nonzero(as_tuple=True)[0]
            if not rows.numel():
                continue
            res = self._tac_search(rows, uslot[rows, i], seat, 2, False, pre="barb")
            t6 = res["turns"].gather(1, slc[rows])
            m6 = res["moves"].gather(1, slc[rows])
            naval = self.unit_naval.take(ut[rows, uslot[rows, i]])
            dom = valid[rows] & (naval.unsqueeze(1) == sea[rows]) & (t6 >= 0)
            rt[rows, i] = torch.where(dom, t6, torch.full_like(t6, -1))
            rm[rows, i] = torch.where(dom, m6, torch.zeros_like(m6))
        uz = torch.zeros(B, U, dtype=torch.bool, device=dev)
        for i in range(U):
            us = uslot[:, i]
            u_t = ut[bidx, us]
            pc = self.rules_dev.u_promo_class.take(u_t)
            no_ex = ((pc == self._pc_ranged) | (pc == self._pc_siege)) & ~self._promo_flag(u_t, self.barb_unit_promos[bidx, us], "ZOC_EXERT")
            uz[:, i] = uv[:, i] & ~self._type_zoc_none.take(u_t) & ~no_ex & ~self.barb_unit_emb[bidx, us]

        def take(i: int, j: torch.Tensor, d: int, m: torch.Tensor) -> None:
            jc = j.clamp(min=0)
            ok = m & (j >= 0) & (rt[bidx, i, jc] == 1)
            count[bidx, jc] += torch.where(ok, d, 0)
            z = ok & uz[:, i]
            jn, jp = (jc + 1) % 6, (jc + 5) % 6
            count[bidx, jn] += torch.where(z & joins_n[bidx, jc], d, 0)
            count[bidx, jp] += torch.where(z & joins_p[bidx, jc], d, 0)

        def gain(i: int, j: int, cur: torch.Tensor, m: torch.Tensor) -> torch.Tensor:
            r_t = rt[:, i, j]
            live = m & valid[:, j] & (r_t >= 0)
            take(i, cur, -1, live & (cur >= 0))
            mult = 1 + (r_t == 1).long() + (rm[:, i, j] != 0).long()
            empty = (count == 0).sum(dim=1)
            own = holder[:, j] == i
            full = own & (empty == 0)
            bail = live & (empty == 0) & ~own
            c = count[:, j]
            s_ = 1 + (c == own.long()).long()
            full = torch.where(own, full & (c == 1), full)
            empty = torch.where(~own & (c == 0), empty - 1, empty)
            for nb, jm in (((j + 1) % 6, joins_n[:, j]), ((j + 5) % 6, joins_p[:, j])):
                zz = uz[:, i] & jm
                cn = count[:, nb]
                s_ = s_ + torch.where(zz, 1 + (cn == own.long()).long(), 0)
                full = torch.where(zz & own, full & (cn == 1), full)
                empty = torch.where(zz & ~own & (cn == 0), empty - 1, empty)
            full = full | (~own & (r_t == 1) & (empty == 0))
            ok = live & ~bail
            take(i, cur, 1, ok & (cur >= 0))
            return torch.where(ok, s_ * mult + torch.where(full, 100, 0), torch.zeros_like(s_))

        def move(i: int, j: int, cur: torch.Tensor, m: torch.Tensor) -> torch.Tensor:
            curc = cur.clamp(min=0)
            let = m & (cur >= 0) & (holder[bidx, curc] == i)
            holder[bidx[let], curc[let]] = -1
            take(i, cur, -1, let)
            old = torch.where(m, holder[:, j], torch.full_like(cur, -1))
            holder[:, j] = torch.where(m, i, holder[:, j])
            take(i, torch.full_like(cur, j), 1, m)
            return old

        at = torch.full((B, U), -1, dtype=torch.long, device=dev)
        here = self.barb_unit_tile.gather(1, uslot)
        for j in range(6):
            for i in range(U):
                m = go & uv[:, i] & valid[:, j] & (here[:, i] == sl[:, j])
                if bool(m.any()):
                    move(i, j, torch.full((B,), -1, dtype=torch.long, device=dev), m)
                    at[:, i] = torch.where(m, j, at[:, i])
        # THE GENERALIZED ASSIGNMENT (`generalizedAssignment`, three passes)
        moved = go.clone()
        for _p in range(3):
            if not bool(moved.any()):
                break
            act = moved.clone()
            moved = torch.zeros_like(go)
            for j in range(6):
                pick = torch.full((B,), -1, dtype=torch.long, device=dev)
                top = torch.zeros(B, dtype=torch.long, device=dev)
                for i in range(U):
                    m = act & uv[:, i]
                    cur = at[:, i]
                    first = (cur == -1) | (cur == j)
                    g1 = gain(i, j, torch.full_like(cur, -1), m & first)
                    g2 = gain(i, j, cur, m & ~first)
                    # the gain at its own plot, the plot it would leave
                    g3 = torch.zeros_like(g2)
                    for jj in range(6):
                        mj = m & ~first & (cur == jj)
                        if bool(mj.any()):
                            g3 = torch.where(mj, gain(i, jj, torch.full_like(cur, -1), mj), g3)
                    w = torch.where(first, g1, g2 - g3)
                    better = m & ((pick < 0) | (w > top))
                    pick = torch.where(better, i, pick)
                    top = torch.where(better, w, top)
                pc = pick.clamp(min=0)
                sel = act & (pick >= 0) & (top > 0) & (at[bidx, pc] != j)
                for i in range(U):
                    mi = sel & (pick == i)
                    if not bool(mi.any()):
                        continue
                    old = move(i, j, at[:, i], mi)
                    at[:, i] = torch.where(mi, j, at[:, i])
                    for o in range(U):
                        mo = mi & (old == o)
                        at[:, o] = torch.where(mo, -1, at[:, o])
                moved |= sel
        # the holders to their plots, plot by plot, again while one moved
        again = go.clone()
        while bool(again.any()):
            prev_again = again
            again = torch.zeros_like(go)
            for j in range(6):
                h = holder[:, j]
                hc = h.clamp(min=0)
                us = uslot.gather(1, hc.unsqueeze(1)).squeeze(1)
                alive = prev_again & (h >= 0) & self.barb_unit_alive[bidx, us]
                now = self.barb_unit_tile[bidx, us]
                # a holder of a plot already standing on this one
                held_tiles = torch.full((B, 6), -2, dtype=torch.long, device=dev)
                for jj in range(6):
                    hj = holder[:, jj]
                    uj = uslot.gather(1, hj.clamp(min=0).unsqueeze(1)).squeeze(1)
                    held_tiles[:, jj] = torch.where((hj >= 0) & self.barb_unit_alive[bidx, uj], self.barb_unit_tile[bidx, uj], -2)
                on_slot = (held_tiles == sl[:, j:j + 1]).any(dim=1)
                m = alive & (now != sl[:, j]) & ~on_slot & valid[:, j]
                if not bool(m.any()):
                    continue
                self._tac_move_to(m, us, slc[:, j], "barb", seat, strike=False)
                after = self.barb_unit_tile[bidx, us]
                again |= m & (after != now)

    # -- Barbarian Found City ------------------------------------------------

    def _bop_scout_tick(self, m: torch.Tensor, k: int, ctx: dict) -> None:
        """"Barbarian Found City"'s tick (`tickScout`: Decode Trigger, the
        Concurrent over Protect Unit and Move Unit, Notify Owner): the walk,
        then Protect Unit's, Move Unit's and Notify Owner's executions; a tree
        that ends leaves the tribe"""
        tr = self._bop_trees()
        B = self.B
        dev = self.device
        bidx = torch.arange(B, device=dev)
        rowof, res, done, danger = ctx["rowof"], ctx["res"], ctx["done"], ctx["danger"]
        hs = self.tribe_home_slot[:, k]
        su = hs.clamp(min=0)
        alive = m & (hs >= 0) & self.barb_unit_alive[bidx, su] & (self.barb_unit_seat[bidx, su] == BARB_SEAT)
        here = self.barb_unit_tile[bidx, su].clamp(min=0)
        full = int(self.rules.combat["unitHp"])
        hurt = (full - self.barb_unit_hp[bidx, su]).to(torch.float64) >= tr.protect * full
        endangered = alive & hurt & (danger.gather(1, here.unsqueeze(1)).squeeze(1) > 0)
        # Protect Unit: none FAILS, one endangered RUNS, else SUCCESS
        p3 = torch.where(~alive, _F, torch.where(endangered, _R, _S))
        # Move Unit (run where Protect Unit did not fail)
        mu_on = m & (p3 != _F)
        camp = self.tribe_plot[:, k]
        held = mu_on & self.tribe_home_mu[:, k]
        planned = rowof[bidx, su] >= 0
        m4 = torch.full_like(hs, _S)
        rows = (held & planned).nonzero(as_tuple=True)[0]
        reach_rng = torch.full((B,), -1, dtype=torch.long, device=dev)
        if rows.numel():
            reach_rng[rows] = self._op_reach_at(rows, su[rows], camp[rows], 1, False,
                                                torch.full_like(rows, tr.to_range), rowof, res)
        m4 = torch.where(held, torch.where(~planned, _F, torch.where(reach_rng >= 0, _S, _R)), m4)
        fresh = mu_on & ~held
        reach0 = torch.full((B,), -1, dtype=torch.long, device=dev)
        reach0m = torch.full((B,), -1, dtype=torch.long, device=dev)
        rows = (fresh & planned).nonzero(as_tuple=True)[0]
        if rows.numel():
            reach0[rows] = self._op_reach_at(rows, su[rows], camp[rows], 1, False, torch.zeros_like(rows), rowof, res)
            reach0m[rows] = self._op_reach_at(rows, su[rows], camp[rows], 1, True, torch.zeros_like(rows), rowof, res)
        reaches = fresh & planned & (reach0 >= 0)
        rest = fresh & ~reaches
        # else the planning's path (0x272a60: no zone of control, no turn
        # limit, stopped once the camp closes) standing on it in any turns
        path = torch.zeros_like(rest)
        rows = rest.nonzero(as_tuple=True)[0]
        if rows.numel():
            cp = camp[rows].clamp(min=0)
            turns = self._tac_search(rows, su[rows], BARB_SEAT, 1 << 30, False, cp)["turns"]
            path[rows] = turns[torch.arange(rows.shape[0], device=dev), cp] > 0
        picked = reaches | (rest & path)
        m4 = torch.where(fresh, torch.where(picked, torch.where(reaches & (reach0m >= 0), _S, _R), _F), m4)
        self.tribe_home_mu[:, k] = torch.where(fresh, picked, self.tribe_home_mu[:, k])
        c2 = torch.where(p3 == _F, _F, torch.maximum(p3, m4))
        self.tribe_home_resume[:, k] = torch.where(m & (c2 == _R), 2, self.tribe_home_resume[:, k])
        notify = m & (c2 == _S)
        end = m & (c2 != _R)
        # the executions: Protect Unit's, Move Unit's, Notify Owner's
        prot = m & (p3 == _R) & endangered
        if bool(prot.any()):
            safe = self._tac_safe_plot(prot, su, "barb", BARB_SEAT, danger, rowof, res, torch.zeros(B, self.T, dtype=torch.bool, device=dev))
            mv = prot & (safe >= 0) & (safe != here)
            self._tac_move_to(mv, su, safe.clamp(min=0), strike=False)
            done[bidx[prot], su[prot]] = True
        mexe = mu_on & ((m4 == _S) | (m4 == _R)) & self.tribe_home_mu[:, k] & alive
        if bool(mexe.any()):
            rows = (mexe & planned).nonzero(as_tuple=True)[0]
            dest = camp.clone()
            if rows.numel():
                r = self._op_reach_at(rows, su[rows], camp[rows], 1, False, torch.full_like(rows, tr.to_range), rowof, res)
                dest[rows] = torch.where(r >= 0, r, camp[rows])
            done[bidx[mexe], su[mexe]] = True
            now = self.barb_unit_tile[bidx, su]
            self._tac_move_to(mexe & (now != dest), su, dest.clamp(min=0), strike=False)
        # NOTIFY OWNER (the scout's tree): a raid at once where the Boldness
        # reaches the raid's and no raid of the tribe stands, else the city to
        # its raid list
        seat = self.tribe_home_seat[:, k].clone()
        plot = self.tribe_home_plot[:, k].clone()
        self.tribe_home_slot[:, k] = torch.where(end, torch.full_like(hs, -1), hs)
        self.tribe_home_mu[:, k] &= ~end
        start = notify & (self.tribe_op[:, k] == 0) & (self.tribe_bold[:, k] >= self._barb_raid_boldness(k))
        self._barb_start_op(start, k, False, seat, plot)
        self._barb_push(self.tribe_raidq, notify & ~start, k, seat)
        self._barb_push(self.tribe_raidp, notify & ~start, k, plot)
