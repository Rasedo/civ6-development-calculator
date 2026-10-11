from __future__ import annotations

from .simbase import *  # noqa: F401,F403 — torch, constants, helpers: the shared floor
from . import simbase

# the pathfinder's fixed point: one Movement is 256
_FIX = 256
# UnitAiTypes (unit +0x1c0)
_AI_EXPLORE = 2
_AI_COMBAT = 3
_AI_DEFENDER = 4
# WANDER NEAR CAMP's radius (0x77b9a0), DEFEND CAMPS' reach (0x774e90), the
# planning's breadth-first search (0x7920d0)
_WANDER_CAMP_RANGE = 5
_DEFEND_CAMP_TURNS = 3
_PLAN_TURNS = 2
# an open node's key: its cost, then its order among equal costs
_KEY_SHIFT = 1 << 22
_TIE_OFF = 1 << 21
_KEY_NONE = 1 << 62
# BARBARIAN_DEFENSE_ALL_UNITS / BARBARIAN_DEFENSE_RANGED_UNITS (GlobalParameters)
_BARB_DEFENSE_ALL = 4
_BARB_DEFENSE_RANGED = 1
# the reach of a rampaging tribe's city from its camp (0x1479e0)
_CHASE_RANGE = 16
# CHASE TARGET's reach of a target (0x775170)
_CHASE_SIGHT = 8
# WANDER NEAR CITY's radius (0x77bf50) and the one FindAlternateLocation searches
# round the city (0x585940)
_WANDER_CITY_RANGE = 5
_WANDER_BACK_RANGE = 3


class SimTactics:
    """THE GAME'S UNIT AI — `cpu/core/tactical.ts`'s twin: the unit
    pathfinder's reach and path, and the barbarians' tactical pass
    (GameCore_XP2 TacticalAI; tools/civ6lab/dll_readings.md "C-95: the unit
    pathfinder and the planning's reach", "C-95: the tactical pass")."""

    # what a tactical pass holds while it runs: the steps' costs (dropped at
    # a pillage) and the units' full Movement
    _tac_in_pass = False
    _tac_cost_held = None
    _tac_full_held = None

    # ------------------------------------------------------- the unit pool

    def _barb_slots(self) -> None:
        """`barbSlots`: the slots whose unit was gone when the barbarians'
        last turn ended go free, pushed in ascending order; each barbarian
        unit without a slot takes one in pool order — the slot pushed last,
        else a new one past the end."""
        P = simbase.BARB_POOL_MAX
        dy = self.barb_pool_dying
        if bool(dy.count_nonzero()):
            pos = self.barb_pool_nfree.unsqueeze(1) + dy.long().cumsum(dim=1) - 1
            b_i, s_i = dy.nonzero(as_tuple=True)
            self.barb_pool_free[b_i, pos[b_i, s_i]] = s_i
            self.barb_pool_nfree += dy.sum(dim=1)
            self.barb_pool_dying.zero_()
        need = self.barb_unit_alive & (self.barb_unit_seat == BARB_SEAT) & (self.barb_unit_slotno < 0)
        if not bool(need.count_nonzero()):
            return
        r = need.long().cumsum(dim=1) - 1
        nf = self.barb_pool_nfree.unsqueeze(1)
        s_free = self.barb_pool_free.gather(1, (nf - 1 - r).clamp(min=0, max=P - 1))
        s_new = self.barb_pool_size.unsqueeze(1) + (r - nf)
        self.barb_unit_slotno.copy_(torch.where(need, torch.where(r < nf, s_free, s_new), self.barb_unit_slotno))
        n = need.sum(dim=1)
        used = torch.minimum(n, self.barb_pool_nfree)
        self.barb_pool_nfree -= used
        self.barb_pool_size += n - used
        assert int(self.barb_pool_size.max()) <= P, "barbarian slot numbers exhausted — raise simbase.BARB_POOL_MAX"

    def _barb_slots_dying(self) -> None:
        """`barbSlotsDying`: the barbarians' turn ends, and the slots no unit
        holds and none free wait for the next turn to go free."""
        P = simbase.BARB_POOL_MAX
        dev = self.device
        B = self.B
        ar = torch.arange(P, device=dev).unsqueeze(0)
        held = torch.zeros(B, P + 1, dtype=torch.bool, device=dev)
        hm = self.barb_unit_alive & (self.barb_unit_seat == BARB_SEAT) & (self.barb_unit_slotno >= 0)
        held.scatter_(1, torch.where(hm, self.barb_unit_slotno, P), True)
        infree = torch.zeros(B, P + 1, dtype=torch.bool, device=dev)
        infree.scatter_(1, torch.where(ar < self.barb_pool_nfree.unsqueeze(1), self.barb_pool_free, P), True)
        self.barb_pool_dying.copy_((ar < self.barb_pool_size.unsqueeze(1)) & ~held[:, :P] & ~infree[:, :P])

    # ------------------------------------------------------ the pathfinder

    def _tac_entry(self) -> torch.Tensor:
        """[B, T] long — `moveCostInto` of each land plot off no route, in
        `mp_scale` units: its terrain's cost, an improvement's Movement in its
        place."""
        tm = self.tmove
        if self._imp_move_cost_any:
            mi = self.improvement
            mc = self._imp_move_cost.take(mi.clamp(min=0)) * ((mi >= 0) & ~self.pillaged).long()
            tm = torch.where(mc > 0, (mc - 1) * self._mp_scale, tm)
        return self._mp_scale + tm

    def _tac_step_cost(self) -> torch.Tensor:
        """[B, T, 6] long — `stepCost` for a step off each plot along each
        neighbour column onto LAND, in `mp_scale` units: the plot's own cost
        (an improvement's Movement in its place), a route at both ends its
        tier's instead, the river crossing a bridging tier drops and none
        where either plot is a city's (0x531510); a step into a city costs
        one Movement at most (CITY_MOVEMENT_COST, 0x531660). No chassis here
        waives terrain."""
        nb = self.neigh.clamp(min=0)  # [T, 6]
        tm = self._tac_entry()[:, nb] - self._mp_scale
        rr_f = self.railroad.unsqueeze(2)
        rr_t = self.railroad[:, nb]
        rd = (self.road.unsqueeze(2) | rr_f) & (self.road[:, nb] | rr_t)
        tier = self._road_tier_mp.take(self.road_tier).view(-1, 1, 1)
        step = torch.where(rr_f & rr_t, torch.full_like(tm, self._railroad_mp), tier.expand_as(tm))
        terr = torch.where(rd, step - self._mp_scale, tm)
        bits = torch.arange(6, device=self.device).view(1, 1, 6)
        river_mp = (2 * self._mp_scale) * ((self.river_mask.unsqueeze(2) >> bits) & 1)
        bridged = self._road_tier_bridges.take(self.road_tier).view(-1, 1, 1)
        riv = torch.where(rd & bridged, torch.zeros_like(river_mp), river_mp)
        ctr = self._centre_plane()
        ctr_to = ctr[:, nb]
        riv = torch.where(ctr.unsqueeze(2) | ctr_to, torch.zeros_like(riv), riv)
        cost = self._mp_scale + terr + riv
        return torch.where(ctr_to, cost.clamp(max=self._mp_scale), cost)

    def _tac_foreign(self, seat: int) -> torch.Tensor:
        """[B, T] bool — a unit of another player than `seat` holds the plot
        (an aircraft or a spy holds none)."""
        out = torch.zeros(self.B, self.T, dtype=torch.bool, device=self.device)
        for pl in (self.military_at, self.civilian_at, self.support_at, self.embarked_at):
            s = torch.where(pl >= 0, self.unit_seat.gather(1, pl.clamp(min=0)), torch.full_like(pl, seat))
            out |= s != seat
        return out

    def _tac_hostile(self, seat: int) -> torch.Tensor:
        """[B, T] bool — a unit of a player at war with `seat` holds the plot
        (an aircraft or a spy holds none)."""
        out = torch.zeros(self.B, self.T, dtype=torch.bool, device=self.device)
        for pl in (self.military_at, self.civilian_at, self.support_at, self.embarked_at):
            s = torch.where(pl >= 0, self.unit_seat.gather(1, pl.clamp(min=0)), torch.full_like(pl, -1))
            out |= (pl >= 0) & self._seats_hostile(seat, s)
        return out

    def _tac_closed(self, seat: int) -> torch.Tensor:
        """[B, T] bool — `majorClosedToMinor`: for a city-state's `seat`, a
        major's territory where the major holds the open-borders civic and is
        not at war with it; nothing for any other seat."""
        zero = torch.zeros(self.B, self.T, dtype=torch.bool, device=self.device)
        if not (100 <= seat < 100 + self.S) or self._open_borders_civic < 0 or self.n_majors == 0:
            return zero
        R = self.n_majors
        own = self.tile_seat
        maj = (own >= 0) & (own < R)
        oc = own.clamp(min=0, max=R - 1)
        civic = self.civ_civics[:, :R, self._open_borders_civic].gather(1, oc)
        war = self.war[:, self._CITY_MINOR0 + seat - 100, :R].gather(1, oc)
        return maj & civic & ~war

    def _tac_enter(self, seat: int) -> tuple[torch.Tensor, torch.Tensor]:
        """[B, T] bool twice — the plots a LAND and a NAVAL unit of `seat` may
        enter (`enterable`): its domain's ground, no unit of a player at war
        with it (another player's unit it passes), no city centre but its
        own, no live enemy Encampment, no major's ground closed to a
        city-state (`_tac_closed`). The NAVAL plane is the water an embarking
        land unit takes too."""
        block = (self._tac_hostile(seat) | (self._centre_plane() & (self.tile_seat != seat))
                 | self._tac_closed(seat))
        if self._encamp_didx >= 0:
            block = block | self._encamp_block_plane(seat)
        cart = self._ocean_open(torch.full((self.B,), seat, dtype=torch.long, device=self.device))
        land = self.passable & ~block
        naval = self.wpass & (~self.ocean_tile | cart.unsqueeze(1)) & ~block
        return land, naval

    def _tac_attack_planes(self, seat: int) -> tuple[torch.Tensor, torch.Tensor]:
        """[B, T] bool twice — the plots a LAND and a NAVAL unit of `seat`
        attacks into (`groundOf`'s attack): a unit of a player at war with it
        on ground of the mover's domain, a city centre of such a player, an
        Encampment that blocks a land mover."""
        foe = self._tac_hostile(seat)
        ctr = self._centre_plane() & (self.tile_seat != seat) & self._seats_hostile(seat, self.tile_seat)
        land = self.passable & ((foe & ~self.water) | ctr)
        if self._encamp_didx >= 0:
            land = land | (self.passable & self._encamp_block_plane(seat))
        naval = (self.wpass & foe) | (self.passable & ctr)
        return land, naval

    def _tac_zoc(self, seat: int) -> torch.Tensor:
        """[B, T] bool — `inEnemyZoc` for a military mover of `seat` at every
        plot: a military unit hostile to it beside the plot that exerts a zone
        (no Ranged or Siege class without SUPPRESSION, none embarked, none of a
        chassis that exerts none), none across a river. The mover's own
        ignoring is the caller's."""
        mil = self.military_at
        here = mil >= 0
        ms = mil.clamp(min=0)
        mtype = self.unit_type.gather(1, ms).clamp(min=0, max=self.NU - 1)
        mseat = torch.where(here, self.unit_seat.gather(1, ms), torch.full_like(mil, -1))
        pc = self.rules_dev.u_promo_class.take(mtype)
        no_ex = (pc == self._pc_ranged) | (pc == self._pc_siege)
        if bool(no_ex.count_nonzero()):
            no_ex = no_ex & ~self._promo_flag(mtype, self.unit_promos.gather(1, ms), "ZOC_EXERT")
        ex = here & ~self.unit_emb.gather(1, ms) & ~self._type_zoc_none.take(mtype) & ~no_ex
        ex = ex & self._seats_hostile(seat, mseat)
        nb = self.neigh.clamp(min=0)
        bits = torch.arange(6, device=self.device).view(1, 1, 6)
        riv = (self.river_mask.unsqueeze(2) >> bits) & 1
        return ((self.neigh >= 0).unsqueeze(0) & (riv == 0) & ex[:, nb]).any(dim=2)

    def _tac_zoc_ignored(self, utype: torch.Tensor) -> torch.Tensor:
        """bool — the chassis ignores zones of control (a naval raider, the
        cavalry classes but the chariot)."""
        ign = self._type_zoc_ignore | (self._type_cavalry & ~self._type_chariot)
        return ign.take(utype.clamp(min=0, max=self.NU - 1))

    def _tac_cost(self) -> torch.Tensor:
        """`_tac_step_cost`, held through a tactical pass until a pillage
        changes the ground"""
        if not self._tac_in_pass:
            return self._tac_step_cost()
        if self._tac_cost_held is None:
            self._tac_cost_held = self._tac_step_cost()
        return self._tac_cost_held

    def _tac_full(self, pre: str = "barb") -> tuple[torch.Tensor, torch.Tensor]:
        """[B, P] twice — each unit of pool `pre`'s full Movement
        (`unitFullMoves`, no aura) ashore and embarked, held through a
        tactical pass"""
        held = self._tac_full_held if self._tac_in_pass else None
        if held is not None and pre in held:
            return held[pre]
        emb = getattr(self, f"{pre}_unit_emb")
        aura = getattr(self, f"{pre}_unit_aura_mp")
        f = (self._full_mp(pre, torch.zeros_like(emb)) - aura, self._full_mp(pre, torch.ones_like(emb)) - aura)
        if self._tac_in_pass:
            if self._tac_full_held is None:
                self._tac_full_held = {}
            self._tac_full_held[pre] = f
        return f

    def _tac_full_now(self, pre: str = "barb") -> torch.Tensor:
        """[B, P] — `unitFullMoves` of each unit of pool `pre` as it stands,
        embarked or ashore"""
        f_land, f_sea = self._tac_full(pre)
        return torch.where(getattr(self, f"{pre}_unit_emb"), f_sea, f_land)

    def _tac_tech(self, seat: int, tech: int) -> torch.Tensor:
        """[B] bool — `seat` holds `tech`: a major's research, a city-state's,
        the barbarians'; the Free Cities hold none here."""
        if tech < 0:
            return torch.zeros(self.B, dtype=torch.bool, device=self.device)
        if 0 <= seat < self.n_majors:
            return self.civ_techs[:, seat, tech]
        if 100 <= seat < 100 + self.S:
            return self.citystate_techs[:, seat - 100, tech]
        if seat == BARB_SEAT:
            return self.barb_techs[:, tech]
        return torch.zeros(self.B, dtype=torch.bool, device=self.device)

    def _tac_embarks(self, rows: torch.Tensor, utype: torch.Tensor, seat: int) -> torch.Tensor:
        """[N] bool — `canEmbark` for land units of `utype` [N] of `seat` in
        the games `rows`: Sailing for a civilian, Shipbuilding for any other;
        the barbarians' planning takes no water (`groundOf`)."""
        if seat == BARB_SEAT:
            return torch.zeros_like(utype, dtype=torch.bool)
        civ = self._type_civilian.take(utype) | self._type_support.take(utype)
        ok = torch.where(civ, self._tac_tech(seat, self._sailing_tech)[rows],
                         self._tac_tech(seat, self._shipbuilding_tech)[rows])
        return ok & ~self.unit_naval.take(utype) & ~self.unit_water_walk.take(utype)

    def _tac_cliffs(self, seat: int) -> torch.Tensor:
        """[B, T, 6] bool, neighbour columns — `cliffBlocks` on a land/water
        step off each plot: the cliff bit of the land plot toward the water,
        none at a city centre or at a Harbor of `seat`'s own."""
        B, T, dev = self.B, self.T, self.device
        if not self._has_cliffs:
            return torch.zeros(B, T, 6, dtype=torch.bool, device=dev)
        nb = self.neigh.clamp(min=0)  # [T, 6]
        w_f = self.water.unsqueeze(2)
        w_t = self.water[:, nb]
        trans = (w_f != w_t) & (self.neigh >= 0).unsqueeze(0)
        dirs = torch.arange(6, device=dev).view(1, 1, 6)
        land = torch.where(w_f, nb.unsqueeze(0).expand(B, -1, -1), torch.arange(T, device=dev).view(1, T, 1).expand(B, T, 6))
        dl = torch.where(w_f, (dirs + 3) % 6, dirs.expand(B, T, 6))
        lf = land.reshape(B, -1)
        bit = ((self.cliff_mask.gather(1, lf) >> dl.reshape(B, -1)) & 1).bool().reshape(B, T, 6)
        free = self._centre_plane().gather(1, lf).reshape(B, T, 6)
        if self._harbor_idx >= 0:
            free = free | ((self.district.gather(1, lf) == self._harbor_idx)
                           & (self.tile_seat.gather(1, lf) == seat)).reshape(B, T, 6)
        return trans & bit & ~free

    def _tac_search(self, rows: torch.Tensor, slots: torch.Tensor, seat: int, max_turns: int, zoc: bool,
                    dest: torch.Tensor | None = None, pre: str = "barb") -> dict:
        """THE PATHFINDER (`search`) for the units at local `slots` of pool
        `pre` in the games `rows` [N]: Dijkstra from each unit's plot over
        the open nodes by (cost, tie) — a node inserted where its cost lies
        nearer the cheapest open node goes before its equals, else after them;
        a node made cheaper goes after its new equals; each closed node links
        its neighbours in DirectionTypes order. A land unit whose player may
        embark it takes water too, a turn starting on the Movement of the
        domain its plot holds it in. Returns the closing rank and turns of each
        plot it may end on ([N, T], -1 never closed or only passed: another
        player's unit holds it) and each node's parent; with `dest` [N] each
        row stops once its plot closes."""
        dev = self.device
        N, T = rows.shape[0], self.T
        NONE = _KEY_NONE
        ar = torch.arange(N, device=dev)
        utype = getattr(self, f"{pre}_unit_type")[rows, slots].clamp(min=0, max=self.NU - 1)
        naval = self.unit_naval.take(utype)
        start = getattr(self, f"{pre}_unit_tile")[rows, slots].clamp(min=0)
        mp = getattr(self, f"{pre}_unit_mp")[rows, slots]
        granted = getattr(self, f"{pre}_unit_mp_full")[rows, slots]
        f_land, f_sea = self._tac_full(pre)
        full_l = torch.div(f_land[rows, slots] * _FIX, self._mp_scale, rounding_mode="floor")
        full_s = torch.div(f_sea[rows, slots] * _FIX, self._mp_scale, rounding_mode="floor")
        unmoved = mp >= granted
        land, wat = self._tac_enter(seat)
        embarks = self._tac_embarks(rows, utype, seat)
        ent_n = torch.where(naval.unsqueeze(1), wat[rows], land[rows] | (wat[rows] & embarks.unsqueeze(1)))  # [N, T]
        water_n = self.water[rows]
        # the plots each unit attacks into (`groundOf`'s attack): an enemy
        # unit's of its own domain, a hostile city centre, an Encampment for a
        # land unit — the path's end, the attack spending the Movement left
        a_land, a_nav = self._tac_attack_planes(seat)
        fights = self._type_combat.take(utype) > 0
        atk_n = torch.where(naval.unsqueeze(1), a_nav[rows], a_land[rows]) & fights.unsqueeze(1) & ~ent_n
        cost_b = self._tac_cost()  # [B, T, 6]
        any_embark = bool(embarks.count_nonzero())
        if any_embark:
            entry_n = self._tac_entry()[rows]
            ctr_n = self._centre_plane()[rows]
            coastal_n = self.coastal_land[rows]
            ut_pool = getattr(self, f"{pre}_unit_type")
            ign_shore = self._ignore_shores(torch.full_like(ut_pool, seat), ut_pool)[rows, slots]
            cliffs_b = self._tac_cliffs(seat)
            waive_cliff = self._promo_flag(utype, getattr(self, f"{pre}_unit_promos")[rows, slots], "CLIFFS")
        zp = (self._tac_zoc(seat)[rows] & ~self._tac_zoc_ignored(utype).unsqueeze(1)) if zoc else None
        tseat = self.tile_seat
        g = torch.full((N, T), NONE, dtype=torch.long, device=dev)
        tie = torch.zeros(N, T, dtype=torch.long, device=dev)
        mv = torch.zeros(N, T, dtype=torch.long, device=dev)
        tn = torch.zeros(N, T, dtype=torch.long, device=dev)
        st = torch.zeros(N, T, dtype=torch.long, device=dev)
        par = torch.full((N, T), -1, dtype=torch.long, device=dev)
        rank = torch.full((N, T), -1, dtype=torch.long, device=dev)
        rturn = torch.full((N, T), -1, dtype=torch.long, device=dev)
        # each open node's key (cost, then its order among equal costs), NONE
        # off the open list
        key = torch.full((N, T), NONE, dtype=torch.long, device=dev)
        g[ar, start] = 0
        mv[ar, start] = torch.div(mp * _FIX, self._mp_scale, rounding_mode="floor")
        tn[ar, start] = 1
        st[ar, start] = 1
        key[ar, start] = _TIE_OFF
        # the open list's dearest key (-1 empty)
        hi = torch.full((N,), _TIE_OFF, dtype=torch.long, device=dev)
        seq = torch.zeros(N, dtype=torch.long, device=dev)
        cnt = torch.zeros(N, dtype=torch.long, device=dev)
        run = torch.ones(N, dtype=torch.bool, device=dev)
        found = torch.zeros(N, dtype=torch.bool, device=dev)
        cols = torch.tensor(list(self._DIRECTION_TYPES), device=dev)
        neigh = self.neigh[:, cols]  # [T, 6] in DirectionTypes order
        none6 = torch.full((N, 6), NONE, dtype=torch.long, device=dev)
        neg6 = torch.full((N, 6), -1, dtype=torch.long, device=dev)
        big6 = torch.full((N, 6), NONE, dtype=torch.long, device=dev)
        two = 2 if T >= 2 else 1
        while True:
            # the cheapest open node, and the cheapest once it is out
            vals, idx = key.topk(two, dim=1, largest=False)
            kmin, best = vals[:, 0], idx[:, 0]
            act = run & (kmin < NONE)
            if not bool(act.count_nonzero()):
                break
            lo = vals[:, 1] if two == 2 else torch.full_like(kmin, NONE)
            b1 = best.unsqueeze(1)
            st.scatter_(1, b1, torch.where(act, 2, st.gather(1, b1).squeeze(1)).unsqueeze(1))
            key.scatter_(1, b1, torch.where(act, NONE, kmin).unsqueeze(1))
            rank.scatter_(1, b1, torch.where(act, cnt, rank.gather(1, b1).squeeze(1)).unsqueeze(1))
            rturn.scatter_(1, b1, torch.where(act, tn.gather(1, b1).squeeze(1), rturn.gather(1, b1).squeeze(1)).unsqueeze(1))
            cnt += act.long()
            hi = torch.where(act & (lo >= NONE), -1, hi)
            if dest is not None:
                hit = act & (best == dest)
                found |= hit
                act &= ~hit
            run &= act
            # an attack's plot is the path's end: no step leaves it
            act = act & ~atk_n.gather(1, b1).squeeze(1)
            if not bool(act.count_nonzero()):
                continue
            bg, bm, bt = g.gather(1, b1), mv.gather(1, b1), tn.gather(1, b1)  # [N, 1]
            nb = neigh[best]  # [N, 6]
            nbc = nb.clamp(min=0)
            cst = cost_b[rows, best][:, cols]
            fw = water_n.gather(1, b1)  # [N, 1]
            cliff6 = None
            if any_embark:
                # an embarked step costs one Movement; a land/water step
                # (`stepCost`'s transition) the plot's own cost and the
                # embarking's, waived at a Harbor or a coastal city centre,
                # one Movement at most into a city
                tw = water_n.gather(1, nbc)
                tr = (fw != tw) & (nb >= 0)
                w_end = torch.where(tw, nbc, best.unsqueeze(1).expand(-1, 6))
                l_end = torch.where(tw, best.unsqueeze(1).expand(-1, 6), nbc)
                dock = (self.district[rows].gather(1, w_end) == self._harbor_didx) | (
                    ctr_n.gather(1, l_end) & coastal_n.gather(1, l_end))
                tcost = torch.where(tw, torch.full_like(cst, self._mp_scale), entry_n.gather(1, nbc))
                tcost = tcost + torch.where(dock | ign_shore.unsqueeze(1), 0, self._embark_transition_mp)
                tcost = torch.where(ctr_n.gather(1, nbc), tcost.clamp(max=self._mp_scale), tcost)
                cst = torch.where(fw & tw, self._mp_scale, torch.where(tr, tcost, cst))
                cliff6 = cliffs_b[rows, best][:, cols] & tr & ~waive_cliff.unsqueeze(1)
            cst = torch.where(naval.unsqueeze(1), self._mp_scale, cst)
            cst = torch.div(cst * _FIX, self._mp_scale, rounding_mode="floor")
            fresh = bm <= 0
            full_here = torch.where(fw.squeeze(1) & ~naval, full_s, full_l)
            pm = torch.where(fresh, full_here.unsqueeze(1), bm).expand(-1, 6)
            turns = (bt + fresh.long()).expand(-1, 6)
            moves = pm - cst
            short = moves < 0
            moves = moves.clamp(min=0)
            at_start = ((best == start) & unmoved).unsqueeze(1)
            same_turn = bt == turns
            cst = torch.where(short & at_start, pm, cst)
            turns = torch.where(short & ~at_start & same_turn, turns + 1, turns)
            cst = torch.where(short & ~at_start & ~same_turn, torch.where(pm > 0, pm, _FIX), cst)
            if zp is not None:
                inz = zp.gather(1, nbc) & (moves > 0)
                cst = torch.where(inz, pm, cst)
                moves = torch.where(inz, 0, moves)
            a6 = atk_n.gather(1, nbc) & (nb >= 0)
            cst = torch.where(a6, pm, cst)
            moves = torch.where(a6, 0, moves)
            turns = torch.where(a6, (bt + fresh.long()).expand(-1, 6), turns)
            ok = act.unsqueeze(1) & (nb >= 0) & (ent_n.gather(1, nbc) | a6) & (turns <= max_turns)
            if cliff6 is not None:
                ok = ok & ~cliff6
            ends = torch.where(moves <= 0, (tseat[rows.unsqueeze(1), nbc] != seat).long() * 3 + 4, 0)
            gn = bg + cst * 1000 + (ends + 2) * _FIX
            s0 = st.gather(1, nbc)
            g0 = g.gather(1, nbc)
            t0 = tie.gather(1, nbc)
            new6 = ok & (s0 == 0)
            upd6 = ok & (s0 != 0) & (gn < g0)
            upo6 = upd6 & (s0 == 1)
            chg = new6 | upd6
            if not bool(chg.count_nonzero()):
                continue
            ins6 = new6 | upo6
            # the keys the six plots hold in the open list as the links land
            cur6 = key.gather(1, nbc)
            cur6 = torch.where(s0 == 1, cur6, none6)
            if bool((upo6 & (cur6 == hi.unsqueeze(1))).count_nonzero()):
                # a link makes the dearest open node cheaper: the links land
                # one by one, the dearest found again past it
                kx = key.clone()
                kx.scatter_(1, torch.where(nb >= 0, nbc, b1), NONE)
                hi_rest = torch.where(kx < NONE, kx, -1).max(dim=1).values
                tie6 = t0.clone()
                for j in range(6):
                    new = new6[:, j]
                    upo = upo6[:, j]
                    ins = new | upo
                    if not bool(ins.count_nonzero()):
                        continue
                    gj = gn[:, j]
                    lo_g = torch.div(lo, _KEY_SHIFT, rounding_mode="floor")
                    hi_g = torch.div(hi, _KEY_SHIFT, rounding_mode="floor")
                    inr = new & (lo < NONE) & (gj >= lo_g) & (gj <= hi_g)
                    head = (gj - lo_g).abs() <= (gj - hi_g).abs()
                    seq += inr.long()
                    tnew = torch.where(inr, torch.where(head, -seq, seq), 0)
                    seq += upo.long()
                    tj = torch.where(new, tnew, torch.where(upo, seq, t0[:, j]))
                    tie6[:, j] = tj
                    nk = gj * _KEY_SHIFT + tj + _TIE_OFF
                    lo = torch.where(ins, torch.minimum(lo, nk), lo)
                    old = cur6[:, j].clone()
                    cur6[:, j] = torch.where(ins, nk, old)
                    hi = torch.where(new, torch.maximum(hi, nk), hi)
                    fix = upo & (old == hi)
                    if bool(fix.count_nonzero()):
                        top6 = torch.where(cur6 < NONE, cur6, neg6).max(dim=1).values
                        hi = torch.where(fix, torch.maximum(hi_rest, top6), hi)
                nk6 = gn * _KEY_SHIFT + tie6 + _TIE_OFF
            else:
                # no link touches the dearest open node: each link's cheapest
                # and dearest are the open list's widened by the links before it
                gi = torch.where(ins6, gn, big6)
                gx = torch.where(new6, gn, neg6)
                lo_g0 = torch.div(lo, _KEY_SHIFT, rounding_mode="floor")
                hi_g0 = torch.div(hi, _KEY_SHIFT, rounding_mode="floor")
                cmin = torch.cat((lo_g0.unsqueeze(1), gi[:, :5]), dim=1).cummin(dim=1).values
                hi_g0 = torch.where(hi >= 0, hi_g0, -1)
                cmax = torch.cat((hi_g0.unsqueeze(1), gx[:, :5]), dim=1).cummax(dim=1).values
                open_j = torch.cat(((lo < NONE).unsqueeze(1), ins6[:, :5]), dim=1).long().cummax(dim=1).values.bool()
                lo_gj = cmin
                inr = new6 & open_j & (gn >= lo_gj) & (gn <= cmax)
                head = (gn - lo_gj).abs() <= (gn - cmax).abs()
                steps = (inr | upo6).long().cumsum(dim=1) + seq.unsqueeze(1)
                tie6 = torch.where(new6, torch.where(inr, torch.where(head, -steps, steps), 0),
                                   torch.where(upo6, steps, t0))
                seq = steps[:, 5]
                nk6 = gn * _KEY_SHIFT + tie6 + _TIE_OFF
                hi = torch.maximum(hi, torch.where(new6, nk6, neg6).max(dim=1).values)

            def put(t: torch.Tensor, vals: torch.Tensor, m: torch.Tensor = chg) -> None:
                t.scatter_(1, torch.where(m, nbc, b1), torch.where(m, vals, t.gather(1, b1).expand(-1, 6)))

            put(g, gn)
            put(mv, moves)
            put(tn, turns)
            put(par, best.unsqueeze(1).expand(-1, 6))
            put(tie, tie6)
            put(st, torch.ones_like(s0), new6)
            put(key, nk6, ins6)
        # the planning's list keeps the plots the unit may end on (0x586900):
        # none another player's unit holds, but where it attacks
        stand = ~self._tac_foreign(seat)[rows] | atk_n
        rank = torch.where(stand, rank, torch.full_like(rank, -1))
        rturn = torch.where(stand, rturn, torch.full_like(rturn, -1))
        return {"rank": rank, "turns": rturn, "parent": par, "found": found, "start": start, "attack": atk_n,
                "moves": mv}

    def _tac_step(self, rows: torch.Tensor, frm: torch.Tensor, to: torch.Tensor, dcol: torch.Tensor,
                  utype: torch.Tensor, ign_shore: torch.Tensor) -> torch.Tensor:
        """[R] long — `stepCost` of one step `frm` -> `to` (neighbour column
        `dcol`) for units of `utype` in the games `rows`, in `mp_scale`
        units: a hull's and an embarked unit's one Movement, a land/water
        step its plot's own cost and the embarking's (waived at a Harbor, a
        coastal city centre or by `ign_shore`), a land step the held plane's;
        one Movement at most into a city."""
        naval = self.unit_naval.take(utype)
        fw = self.water[rows, frm]
        tw = self.water[rows, to]
        mp1 = torch.full_like(frm, self._mp_scale)
        land = self._tac_cost()[rows, frm, dcol]
        w_end = torch.where(tw, to, frm)
        l_end = torch.where(tw, frm, to)
        ctr = self._centre_plane()
        dock = (self.district[rows, w_end] == self._harbor_didx) | (ctr[rows, l_end] & self.coastal_land[rows, l_end])
        trans = torch.where(tw, mp1, self._tac_entry()[rows, to])
        trans = trans + torch.where(dock | ign_shore, torch.zeros_like(trans),
                                    torch.full_like(trans, self._embark_transition_mp))
        trans = torch.where(ctr[rows, to], trans.clamp(max=self._mp_scale), trans)
        cost = torch.where(fw & tw, mp1, torch.where(fw != tw, trans, land))
        return torch.where(naval, mp1, cost)

    def _tac_move_to(self, mask: torch.Tensor, us: torch.Tensor, dest: torch.Tensor, pre: str = "barb",
                     seat: int = BARB_SEAT, strike: bool = True) -> None:
        """`moveTo` for the unit at local slot `us` [B] of pool `pre` (its
        player `seat`) in the games of `mask`: the pathfinder's path to `dest`
        with zones of control, walked as far as its Movement carries it this
        turn (a zone of control ends it); it walks through its own units and
        other players' but never ends on another player's unit or its own
        that stacks with it. A path ending on a plot it attacks into stops at
        its side, and with `strike` (the barbarians') it strikes there."""
        if not bool(mask.count_nonzero()):
            return
        dev = self.device
        B = self.B
        rows = mask.nonzero(as_tuple=True)[0]
        sr = us[rows]
        dr = dest[rows].clamp(min=0)
        res = self._tac_search(rows, sr, seat, 1 << 30, True, dr, pre=pre)
        par = res["parent"]
        start = res["start"]
        R = rows.shape[0]
        ar = torch.arange(R, device=dev)
        # the path, dest first, back to the unit's plot
        back = []
        cur = torch.where(res["found"], dr, start)
        while True:
            more = cur != start
            if not bool(more.count_nonzero()):
                break
            back.append(torch.where(more, cur, torch.full_like(cur, -1)))
            cur = torch.where(more, par[ar, cur], cur)
        if not back:
            return
        L = len(back)
        path = torch.stack(back[::-1], dim=1)  # [R, L], -1 before each row's first plot
        lead = (path < 0).sum(dim=1)
        # each row's path from column 0, -1 past its end
        idx = (lead.unsqueeze(1) + torch.arange(L, device=dev).unsqueeze(0))
        path = torch.where(idx < L, path.gather(1, idx.clamp(max=L - 1)), torch.full_like(path, -1))
        plen = L - lead
        # a path ending on a plot it attacks into: it walks to its side
        into = res["found"] & res["attack"][ar, dr] & (plen > 0)
        plen = plen - into.long()
        path = torch.where(torch.arange(L, device=dev).unsqueeze(0) < plen.unsqueeze(1), path, torch.full_like(path, -1))
        tile_p = getattr(self, f"{pre}_unit_tile")
        mp_p = getattr(self, f"{pre}_unit_mp")
        ut_pool = getattr(self, f"{pre}_unit_type")
        ut = ut_pool[rows, sr].clamp(min=0, max=self.NU - 1)
        naval = self.unit_naval.take(ut)
        ign_shore = self._ignore_shores(torch.full_like(ut_pool, seat), ut_pool)[rows, sr]
        halts = self._tac_zoc(seat)[rows] & ~self._tac_zoc_ignored(ut).unsqueeze(1)

        def own_at(pl: torch.Tensor) -> torch.Tensor:
            return (pl >= 0) & (self.unit_seat[rows].gather(1, pl.clamp(min=0)) == seat)

        # where it may not end: its own military-domain unit (ashore, afloat
        # or embarked), any other player's unit
        no_end = own_at(self.military_at[rows]) | own_at(self.embarked_at[rows]) | self._tac_foreign(seat)[rows]
        # how far its Movement carries it
        mp = mp_p[rows, sr].clone()
        full = getattr(self, f"{pre}_unit_mp_full")[rows, sr]
        frm = start.clone()
        stop = torch.zeros(R, dtype=torch.long, device=dev)
        on = torch.ones(R, dtype=torch.bool, device=dev)
        for i in range(L):
            p = path[:, i]
            on = on & (i < plen)
            if not bool(on.count_nonzero()):
                break
            pc = p.clamp(min=0)
            dcol = (self.neigh[frm] == pc.unsqueeze(1)).long().argmax(dim=1)
            c = self._tac_step(rows, frm, pc, dcol, ut, ign_shore)
            on = on & ~((mp < c) & (mp < full))
            mp = torch.where(on, (mp - c).clamp(min=0), mp)
            stop = torch.where(on, torch.full_like(stop, i + 1), stop)
            frm = torch.where(on, pc, frm)
            on = on & (mp > 0) & ~halts[ar, pc]
        for _ in range(L):
            back_off = (stop > 0) & no_end[ar, path.gather(1, (stop - 1).clamp(min=0).unsqueeze(1)).squeeze(1).clamp(min=0)]
            if not bool(back_off.count_nonzero()):
                break
            stop = stop - back_off.long()
        gslot = torch.zeros(B, dtype=torch.long, device=dev)
        gslot[rows] = sr + self.POOL_LO[pre]
        going = stop > 0
        # the unit the walker passes over in the occupancy plane it enters
        # (the military plane, or the embarked one at sea: a merged slot, -1
        # none): the plane holds one unit, so it goes back once the walker
        # steps on
        under = torch.full((R,), -1, dtype=torch.long, device=dev)
        under_emb = torch.zeros(R, dtype=torch.bool, device=dev)
        for i in range(L):
            go = going & (i < stop)
            if not bool(go.count_nonzero()):
                break
            here = tile_p[rows, sr].clamp(min=0)
            nxc = path[:, i].clamp(min=0)
            dcol = (self.neigh[here] == nxc.unsqueeze(1)).long().argmax(dim=1)
            emb_to = self.water[rows, nxc] & ~naval
            occ = torch.where(emb_to, self.embarked_at[rows, nxc], self.military_at[rows, nxc])
            okB = torch.zeros(B, dtype=torch.bool, device=dev)
            okB[rows] = go
            hereB = torch.zeros(B, dtype=torch.long, device=dev)
            hereB[rows] = here
            nxtB = torch.zeros(B, dtype=torch.long, device=dev)
            nxtB[rows] = nxc
            dirB = torch.zeros(B, dtype=torch.long, device=dev)
            dirB[rows] = dcol
            mvB = self._step_verb(okB, gslot, hereB, nxtB, dirB, seat, torch.zeros_like(okB),
                                  clear_camp=seat != BARB_SEAT)
            moved = mvB[rows]
            back_on = moved & (under >= 0)
            if bool(back_on.count_nonzero()):
                bm = back_on & ~under_emb
                if bool(bm.count_nonzero()):
                    self.military_at[rows[bm], here[bm]] = under[bm]
                be = back_on & under_emb
                if bool(be.count_nonzero()):
                    self.embarked_at[rows[be], here[be]] = under[be]
            under = torch.where(moved, torch.where(occ >= 0, occ, torch.full_like(occ, -1)), under)
            under_emb = torch.where(moved, emb_to, under_emb)
            going = moved & (mp_p[rows, sr] > 0)
        # the strike, where its Movement and attacks last beside the plot
        if strike and bool(into.count_nonzero()):
            here = tile_p[rows, sr].clamp(min=0)
            hit = (into & getattr(self, f"{pre}_unit_alive")[rows, sr] & (mp_p[rows, sr] > 0)
                   & (getattr(self, f"{pre}_unit_attacks")[rows, sr] > 0) & (self.pair_dist[here, dr].to(torch.long) == 1))
            for u in torch.unique(sr[hit]).tolist():
                m = torch.zeros(B, dtype=torch.bool, device=dev)
                m[rows[hit & (sr == u)]] = True
                tt = torch.zeros(B, dtype=torch.long, device=dev)
                tt[rows] = dr
                self._barb_melee_at(m, u, tt)

    # --------------------------------------------------- the target list

    def _tac_targets(self, seat: int = BARB_SEAT) -> dict:
        """THE TACTICAL TARGET LIST of `seat` (`tacticalTargets`) as plot
        planes over the plots it sees, the plots in index order and each
        plot's district entry before its other: `dk` [B, T] the district
        entry (0 none, 1 COMBAT_DISTRICT, 2 PASSIVE_DISTRICT) and `ds` its
        player; `ok` the other entry (0 none, 1 LOW, 2 MEDIUM, 3 HIGH, 4 CAMP,
        5 GOODY, 6 TRADER, 7 CIVILIAN, 8 RELIGIOUS, 9 IMPROVEMENT) and `os` its
        player (-1 for a camp, a goody hut or an improvement); `unit` [B, T]
        the global slot of a unit entry's defender (-1 none). The barbarians'
        prioritization makes HIGH a unit near one of their camps; any other
        player's a unit that threatens one of its districts (FRIENDLY_CITY)."""
        seen = self._barb_seen("barbarians" if seat == BARB_SEAT else seat)
        ts = self.tile_seat

        def hostile(s: torch.Tensor) -> torch.Tensor:
            return (s >= 0) & (s != seat) & self._seats_hostile(seat, s)

        ctr = self._centre_plane()
        enc = (self.district == self._encamp_didx) if self._encamp_didx >= 0 else torch.zeros_like(ctr)
        dd = self.district
        spec = self._is_specialty.take(dd.clamp(min=0)) & (dd >= 0)
        combat = ctr | enc
        passive = (dd >= 0) & ~enc & ~ctr & self.district_complete & ~self.district_pillaged & spec
        h_own = hostile(ts)
        dk = torch.zeros_like(ts)
        dk = torch.where(seen & h_own & combat, 1, torch.where(seen & h_own & passive, 2, dk))
        ds = torch.where(dk > 0, ts, torch.full_like(ts, -1))
        none = torch.full_like(ts, -1)

        def seat_of(pl: torch.Tensor) -> torch.Tensor:
            return torch.where(pl >= 0, self.unit_seat.gather(1, pl.clamp(min=0)), none)

        mil = self._visible_military_at(seat)
        ms = seat_of(mil)
        emb = self.embarked_at
        es = seat_of(emb)
        et = self.unit_type.gather(1, emb.clamp(min=0)).clamp(min=0, max=self.NU - 1)
        efight = (emb >= 0) & self._type_dom_mil.take(et) & hostile(es)
        mfight = (mil >= 0) & hostile(ms)
        fight = (mfight | efight) & seen & ~combat
        dslot = torch.where(mfight, mil, torch.where(efight, emb, none))
        dseat = torch.where(mfight, ms, torch.where(efight, es, none))
        civ = self.civilian_at
        cs_ = seat_of(civ)
        ct = self.unit_type.gather(1, civ.clamp(min=0)).clamp(min=0, max=self.NU - 1)
        sup = self.support_at
        ss = seat_of(sup)
        trader = (civ >= 0) & (ct == self._trader_idx)
        relig = (civ >= 0) & (self._rel_strength.take(ct) > 0)
        n_civ = ((civ >= 0) & ~trader & ~relig).long() + (sup >= 0).long()
        civ_seat = torch.where((civ >= 0) & ~trader & ~relig, cs_, ss)
        civ_slot = torch.where((civ >= 0) & ~trader & ~relig, civ, sup)
        camp = torch.zeros_like(seen)
        cp = self.camp_tile
        if cp.numel():
            camp.scatter_(1, cp.clamp(min=0), cp >= 0)
            # the scatter's clamped -1 slots land on plot 0: put it back
            camp[:, 0] = (cp == 0).any(dim=1)
        goody = self.tile_goody.bool() if self.tile_goody.dtype != torch.bool else self.tile_goody
        rest = seen & ~combat & ~fight
        okk = torch.zeros_like(ts)
        oss = none.clone()
        # the first of the chain, each plot taking the first that holds
        taken = ~rest
        for kind, cond, who in (
            (4, camp, none), (5, goody, none),
            (6, trader & hostile(cs_), cs_),
            (7, n_civ == 1, civ_seat),
            (8, relig & hostile(cs_), cs_),
            (9, (self.improvement >= 0) & ~self.pillaged & h_own & ~goody, none),
        ):
            hit = cond & ~taken
            okk = torch.where(hit, kind, okk)
            oss = torch.where(hit, who, oss)
            taken = taken | hit
            if kind in (6, 7):
                # a Trader or a lone civilian ends the plot's chain, ours or not
                taken = taken | (cond & ~taken)
        # a CIVILIAN or a RELIGIOUS entry only of a player at war with `seat`
        okk = torch.where(((okk == 7) | (okk == 8)) & ~hostile(oss), 0, okk)
        # LOW, MEDIUM where a unit that cannot fight shares the plot
        lowk = torch.ones_like(ts)
        nonc = (civ >= 0) | (sup >= 0)
        lowk = torch.where(fight & nonc, 2, lowk)
        dt = self.unit_type.gather(1, dslot.clamp(min=0)).clamp(min=0, max=self.NU - 1)
        rs = self._type_ranged_strength.take(dt)
        rng = self._type_ranged_range.take(dt) + self._promo_val(dt, self.unit_promos.gather(1, dslot.clamp(min=0)), "RANGE")
        if seat == BARB_SEAT:
            # HIGH within BARBARIAN_DEFENSE_ALL_UNITS of a camp of the list, or
            # a ranged one within its range + BARBARIAN_DEFENSE_RANGED_UNITS
            lcamp = rest & camp
            if bool(lcamp.count_nonzero()):
                # the list's camps: each camp plot seen with no foe on it
                cl = (cp >= 0) & lcamp.gather(1, cp.clamp(min=0))  # [B, K]
                dk_ = self.pair_dist[cp.clamp(min=0)].to(torch.long)  # [B, K, T]
                dmin = torch.where(cl.unsqueeze(2), dk_, torch.full_like(dk_, 1 << 20)).min(dim=1).values  # [B, T]
                high = (dmin <= _BARB_DEFENSE_ALL) | ((rs > 0) & (dmin <= rng + _BARB_DEFENSE_RANGED))
                lowk = torch.where(fight & high, 3, lowk)
        else:
            # HIGH where it threatens a district of `seat`'s it sees: a ranged
            # or bombard unit within its range, any other nearer than twice
            # its Movement
            own = seen & (ts == seat) & ((dd >= 0) | ctr)
            if bool((own.any(dim=1) & fight.any(dim=1)).count_nonzero()):
                b_i, q_i = own.nonzero(as_tuple=True)
                dmin = torch.full((self.B, self.T), 1 << 20, dtype=torch.long, device=self.device)
                dmin.index_reduce_(0, b_i, self.pair_dist[q_i].to(torch.long), "amin")  # [B, T]
                full_all = torch.cat((self._full_mp("major") - self.major_unit_aura_mp,
                                      self._full_mp("barb") - self.barb_unit_aura_mp), dim=1)
                moves = torch.div(full_all.gather(1, dslot.clamp(min=0)), self._mp_scale, rounding_mode="floor")
                shoots = (rs > 0) | (self._type_bombard.take(dt) > 0)
                reach = torch.where(rs > 0, rng, torch.ones_like(rng))
                high = torch.where(shoots, dmin <= reach, dmin < 2 * moves)
                lowk = torch.where(fight & high, 3, lowk)
        okk = torch.where(fight, lowk, okk)
        oss = torch.where(fight, dseat, oss)
        unit = torch.where(fight, dslot, torch.where(okk == 7, civ_slot, none))
        return {"dk": dk, "ds": ds, "ok": okk, "os": oss, "unit": unit}

    # ------------------------------------------------------ the tactical pass

    def _tac_ai(self) -> tuple[torch.Tensor, torch.Tensor]:
        """[B, P] long twice — each barbarian's AI type (`aiTypeOf`: its
        tribe's camp defender DEFENDER while the camp stands, its scouts
        EXPLORE, a civilian none (-1), every other COMBAT) and the tribe that
        raised it (`tribeOf`, its defender included; -1 none)."""
        dev = self.device
        ut = self.barb_unit_type.clamp(min=0, max=self.NU - 1)
        fighter = self._type_dom_mil.take(ut)
        tribe = self.barb_unit_tribe.clone()
        isdef = torch.zeros_like(fighter)
        kt = torch.arange(self.KT, device=dev).unsqueeze(0)
        has = (self.tribe_defender >= 0) & (kt < self.n_tribes.unsqueeze(1))
        if bool(has.count_nonzero()):
            b_i, k_i = has.nonzero(as_tuple=True)
            d = self.tribe_defender[b_i, k_i]
            tribe[b_i, d] = k_i
            isdef[b_i, d] = self.tribe_alive[b_i, k_i]
        scout = self.barb_unit_scout & (self.barb_unit_tribe >= 0)
        ai = torch.where(isdef, _AI_DEFENDER, torch.where(scout, _AI_EXPLORE, _AI_COMBAT))
        return torch.where(fighter, ai, torch.full_like(ai, -1)), tribe

    def _barbarian_tactics(self, acting: torch.Tensor) -> None:
        """THE BARBARIANS' TACTICAL PASS (`barbarianTactics`) for the units
        of `acting` [B, P] — those that stood before their camps raised this
        turn's: each one's planning reach taken before any moves, then the
        moves of Tactics.xml's "Default Barbarian" and "Default Barbarian HL"
        lists in order, each walking the units the moves before it left — in
        their pool's slot order (`barb_unit_slotno`), the stand-ins in the
        engine's unit order."""
        self._tac_in_pass = True
        self._tac_cost_held = None
        self._tac_full_held = None
        try:
            self._tac_pass(acting)
        finally:
            self._tac_in_pass = False
            self._tac_cost_held = None
            self._tac_full_held = None

    def _tac_range(self, b: torch.Tensor, s: torch.Tensor, pre: str = "barb") -> torch.Tensor:
        """`rangeOf` for the units at local slots `s` of pool `pre` in the
        games `b`: a ranged unit's range with its promotions, 0 in melee."""
        ut = getattr(self, f"{pre}_unit_type")[b, s].clamp(min=0, max=self.NU - 1)
        rng = self._type_ranged_range.take(ut) + self._promo_val(ut, getattr(self, f"{pre}_unit_promos")[b, s], "RANGE")
        return torch.where(self._type_ranged_strength.take(ut) > 0, rng, torch.zeros_like(rng))

    def _tac_stacked_other(self, us: torch.Tensor, pre: str = "barb", seat: int = BARB_SEAT) -> torch.Tensor:
        """[B, T] — a military unit of `seat` (ashore, afloat or embarked)
        other than the one at local slot `us` [B] of pool `pre` holds the
        plot (`stackedOther`)."""
        g = (us + self.POOL_LO[pre]).unsqueeze(1)
        out = torch.zeros(self.B, self.T, dtype=torch.bool, device=self.device)
        for pl in (self.military_at, self.embarked_at):
            out |= (pl >= 0) & (self.unit_seat.gather(1, pl.clamp(min=0)) == seat) & (pl != g)
        return out

    def _tac_rampage(self, live, done: torch.Tensor, utribe: torch.Tensor, rowof: torch.Tensor, res: dict,
                     tg: dict, order: torch.Tensor, npass: torch.Tensor) -> None:
        """BARBARIAN RAMPAGE (`rampage`): each unit, in pool order, of a tribe
        whose camp a player's unit took goes after that player's targets among
        its planning's — one it has a spot to strike from first, then the
        nearest, the list's first of equals — struck (`strike`); with none it
        heads for the city of that player its tribe goes after (`chaseCity`),
        to the first plot of its reach of this turn within its range (1 at
        least) of the city with none of its own stacking there, else it stays.
        The picks read the target list and the reach as the pass began."""
        dev = self.device
        B, T = self.B, self.T
        P = simbase.BARB_POOL_MAX
        bidx = torch.arange(B, device=dev)
        tr = utribe.clamp(min=0)
        rp = self.tribe_ramp.gather(1, tr)
        ramp = (utribe >= 0) & ~self.tribe_alive.gather(1, tr) & (rp >= 0)
        cand = live() & ramp & (rowof >= 0)
        if not bool(cand.count_nonzero()):
            return
        b_k, s_k = cand.nonzero(as_tuple=True)
        rsel = rowof[b_k, s_k]
        K = b_k.numel()
        Pk = rp[b_k, s_k]
        here = self.barb_unit_tile[b_k, s_k].clamp(min=0)
        rng = self._tac_range(b_k, s_k)
        lim = torch.div(self._tac_full_now()[b_k, s_k], self._mp_scale, rounding_mode="floor") * _PLAN_TURNS + rng
        d = self.pair_dist[here].to(torch.long)  # [K, T]
        inplan = d <= lim.unsqueeze(1)
        rt = res["turns"][rsel]
        atk = res["attack"][rsel]
        inr = rt >= 1
        # a ranged unit's spots: within its range of a plot of its reach it
        # stands on, in its sight beyond one
        rspot = torch.zeros(K, T, dtype=torch.bool, device=dev)
        rk = (rng > 0).nonzero(as_tuple=True)[0]
        if rk.numel():
            stand = inr[rk] & ~atk[rk]
            kk, pp = stand.nonzero(as_tuple=True)
            if kk.numel():
                disk = self._los_disk(b_k[rk][kk], pp, rng[rk][kk], torch.zeros(kk.numel(), dtype=torch.bool, device=dev))
                disk[torch.arange(kk.numel(), device=dev), pp] = False
                acc = torch.zeros(rk.numel(), T, dtype=torch.float32, device=dev)
                acc.index_add_(0, kk, disk.float())
                rspot[rk] = acc > 0
        dk, ds = tg["dk"][b_k], tg["ds"][b_k]
        okk, os_ = tg["ok"][b_k], tg["os"][b_k]
        ranged = (rng > 0).unsqueeze(1)
        spot_a = (dk == 1) & torch.where(ranged, rspot, inr)
        civ_b = okk == 7
        spot_b = (((okk >= 1) & (okk <= 3)) | civ_b) & torch.where(ranged & ~civ_b, rspot, inr)
        cand_a = (dk > 0) & (ds == Pk.unsqueeze(1)) & inplan
        cand_b = (okk > 0) & (os_ == Pk.unsqueeze(1)) & inplan
        ar = torch.arange(T, device=dev).unsqueeze(0)
        W2 = 2 * T + 2
        MAXK = 1 << 60
        ka = torch.where(cand_a, (~spot_a).long() * (W2 * W2) + d * W2 + 2 * ar, MAXK)
        kb = torch.where(cand_b, (~spot_b).long() * (W2 * W2) + d * W2 + 2 * ar + 1, MAXK)
        ma, ia = ka.min(dim=1)
        mb, ib = kb.min(dim=1)
        use_b = mb < ma
        pick = torch.full((B, P), -1, dtype=torch.long, device=dev)
        pick_cd = torch.zeros(B, P, dtype=torch.bool, device=dev)
        has = torch.minimum(ma, mb) < MAXK
        pt = torch.where(use_b, ib, ia)
        pick[b_k, s_k] = torch.where(has, pt, torch.full_like(pt, -1))
        pick_cd[b_k, s_k] = has & ~use_b & (dk.gather(1, pt.unsqueeze(1)).squeeze(1) == 1)
        rank, turns, moves = res["rank"], res["turns"], res["moves"]
        BIG = 1 << 40

        def first_in_reach(row: torch.Tensor, ok: torch.Tensor) -> torch.Tensor:
            """[B] the plot of each game's reach row that closed first among `ok` [B, T], -1 none"""
            rk_ = rank[row.clamp(min=0)]
            key = torch.where(ok & (rk_ >= 0), rk_, torch.full_like(rk_, BIG))
            m, i = key.min(dim=1)
            return torch.where(m < BIG, i, torch.full_like(i, -1))

        # the pool positions a rampaging unit holds in some game
        npos = int(npass.max()) if B else 0
        js: list[int] = []
        if npos:
            held = cand.gather(1, order[:, :npos]) & (torch.arange(npos, device=dev).unsqueeze(0) < npass.unsqueeze(1))
            js = held.any(dim=0).nonzero(as_tuple=True)[0].tolist()
        for j in js:
            u_b = order[:, j]
            onj = (j < npass) & live()[bidx, u_b] & cand[bidx, u_b]
            if not bool(onj.count_nonzero()):
                continue
            row = rowof[bidx, u_b]
            tgt = pick[bidx, u_b]
            st = onj & (tgt >= 0)
            tc = tgt.clamp(min=0)
            urng = self._tac_range(bidx, u_b)
            if bool(st.count_nonzero()):
                mil = self.military_at.gather(1, tc.unsqueeze(1)).squeeze(1)
                ms = torch.where(mil >= 0, self.unit_seat.gather(1, mil.clamp(min=0).unsqueeze(1)).squeeze(1),
                                 torch.full_like(mil, -1))
                emb = self.embarked_at.gather(1, tc.unsqueeze(1)).squeeze(1)
                es = torch.where(emb >= 0, self.unit_seat.gather(1, emb.clamp(min=0).unsqueeze(1)).squeeze(1),
                                 torch.full_like(emb, -1))
                et = self.unit_type.gather(1, emb.clamp(min=0).unsqueeze(1)).squeeze(1).clamp(min=0, max=self.NU - 1)
                foe = ((mil >= 0) & (ms != BARB_SEAT)) | ((emb >= 0) & (es != BARB_SEAT) & self._type_dom_mil.take(et))
                fight = pick_cd[bidx, u_b] | foe
                shoot = st & fight & (urng > 0)
                if bool(shoot.count_nonzero()):
                    at = self.barb_unit_tile[bidx, u_b].clamp(min=0)
                    far = shoot & (self.pair_dist[at, tc].to(torch.long) > urng)
                    if bool(far.count_nonzero()):
                        rr = row.clamp(min=0)
                        dtp = self.pair_dist[tc].to(torch.long)  # [B, T]
                        ok = ((turns[rr] == 1) & (moves[rr] > 0) & ~res["attack"][rr] & (dtp <= urng.unsqueeze(1))
                              & ~self._tac_stacked_other(u_b) & far.unsqueeze(1))
                        spot = first_in_reach(row, ok)
                        self._tac_move_to(far & (spot >= 0), u_b, spot)
                    at = self.barb_unit_tile[bidx, u_b].clamp(min=0)
                    fire = (shoot & self.barb_unit_alive[bidx, u_b] & (self.pair_dist[at, tc].to(torch.long) <= urng)
                            & (self.barb_unit_mp[bidx, u_b] > 0) & (self.barb_unit_attacks[bidx, u_b] > 0))
                    for u in torch.unique(u_b[fire]).tolist():
                        self._hostile_ranged_strike(fire & (u_b == u), tc, "barb", u)
                self._tac_move_to(st & ~shoot, u_b, tc)
                done[bidx[st], u_b[st]] = True
            ch = onj & (tgt < 0)
            if not bool(ch.count_nonzero()):
                continue
            city = self._tac_chase_city(ch, utribe[bidx, u_b].clamp(min=0), rp[bidx, u_b])
            go = ch & (city >= 0)
            if not bool(go.count_nonzero()):
                continue
            rr = row.clamp(min=0)
            dc = self.pair_dist[city.clamp(min=0)].to(torch.long)
            ok = ((turns[rr] == 1) & (dc <= urng.clamp(min=1).unsqueeze(1))
                  & ~self._tac_stacked_other(u_b) & go.unsqueeze(1))
            spot = first_in_reach(row, ok)
            mv = go & (spot >= 0)
            self._tac_move_to(mv, u_b, spot)
            done[bidx[mv], u_b[mv]] = True

    def _tac_reachers(self, cand: torch.Tensor, ai: torch.Tensor, order: torch.Tensor) -> torch.Tensor:
        """`reachers`' DEFENDER rule over the candidates `cand` [B, P]: in
        pool order a DEFENDER before the first other unit goes in only as the
        last such before it; with no other unit none goes in."""
        P = cand.shape[1]
        c_o = cand.gather(1, order)
        d_o = (ai == _AI_DEFENDER).gather(1, order)
        pos = torch.arange(P, device=self.device).unsqueeze(0)
        nd = c_o & ~d_o
        k = torch.where(nd, pos, torch.full_like(pos, P)).min(dim=1).values.unsqueeze(1)
        before = pos < k
        lastd = torch.where(c_o & d_o & before, pos, torch.full_like(pos, -1)).max(dim=1).values.unsqueeze(1)
        keep = ((c_o & ~before) | (c_o & d_o & (pos == lastd))) & (k < P)
        out = torch.zeros_like(cand)
        out.scatter_(1, order, keep)
        return out

    def _tac_can_fight(self) -> torch.Tensor:
        """[B, P] — the barbarian has a strength to fight with"""
        ut = self.barb_unit_type.clamp(min=0, max=self.NU - 1)
        return ((self._type_combat.take(ut) > 0) | (self._type_ranged_strength.take(ut) > 0)
                | (self._type_bombard.take(ut) > 0))

    def _tac_attack_civilians(self, live, done: torch.Tensor, ai: torch.Tensor, reach_at, tg: dict,
                              order: torch.Tensor, npass: torch.Tensor) -> None:
        """ATTACK CIVILIANS (`attackCivilians`): each CIVILIAN target of the
        list in plot order, the units whose reach takes its plot within two
        turns go for it in pool order — each that can act moves onto it, a
        melee one's turn then done, until the civilian is taken; then each
        ranged one within its range strikes it."""
        dev = self.device
        B, T = self.B, self.T
        bidx = torch.arange(B, device=dev)
        civ = tg["ok"] == 7
        n = civ.sum(dim=1)
        J = int(n.max()) if B else 0
        if not J:
            return
        tiles = torch.where(civ, self._arange_bt, torch.full_like(self._arange_bt, T)).sort(dim=1).values
        fights = self._tac_can_fight()
        npos = int(npass.max())
        for j in range(J):
            t = tiles[:, j].clamp(max=T - 1)
            act = j < n
            s0 = tg["unit"][bidx, t].clamp(min=0)
            seat0 = tg["os"][bidx, t]

            def held() -> torch.Tensor:
                return (self.unit_alive[bidx, s0] & (self.unit_tile[bidx, s0] == t)
                        & (self.unit_seat[bidx, s0] == seat0))

            on = act & held()
            if not bool(on.count_nonzero()):
                continue
            rt = reach_at(t)
            cand = self._tac_reachers(live() & fights & (rt >= 1) & (rt <= _PLAN_TURNS) & on.unsqueeze(1), ai, order)
            if not bool(cand.count_nonzero()):
                continue
            gone = torch.zeros(B, dtype=torch.bool, device=dev)
            c_o = cand.gather(1, order[:, :npos])
            js = c_o.any(dim=0).nonzero(as_tuple=True)[0].tolist()
            for jj in js:
                u_b = order[:, jj]
                go = cand[bidx, u_b] & ~gone & live()[bidx, u_b] & (self.barb_unit_mp[bidx, u_b] > 0)
                if not bool(go.count_nonzero()):
                    continue
                self._tac_move_to(go, u_b, t)
                melee = go & (self._tac_range(bidx, u_b) == 0)
                done[bidx[melee], u_b[melee]] = True
                gone |= go & ~held()
            for jj in js:
                u_b = order[:, jj]
                rng = self._tac_range(bidx, u_b)
                at = self.barb_unit_tile[bidx, u_b].clamp(min=0)
                go = (cand[bidx, u_b] & ~gone & live()[bidx, u_b] & (self.barb_unit_mp[bidx, u_b] > 0) & (rng > 0)
                      & (self.pair_dist[at, t].to(torch.long) <= rng))
                if not bool(go.count_nonzero()):
                    continue
                fire = go & (self.barb_unit_attacks[bidx, u_b] > 0)
                for u in torch.unique(u_b[fire]).tolist():
                    self._hostile_ranged_strike(fire & (u_b == u), t, "barb", u)
                done[bidx[go], u_b[go]] = True

    def _tac_plunder(self, live, done: torch.Tensor, ai: torch.Tensor, reach_at, tg: dict,
                     order: torch.Tensor, npass: torch.Tensor) -> None:
        """PLUNDER TRADER (`plunderTraders`): each TRADER target of the list
        in plot order, the units whose reach takes its plot this turn go for
        it in pool order — each that can act moves onto it, its turn done,
        until one stands on its plot."""
        dev = self.device
        B, T = self.B, self.T
        bidx = torch.arange(B, device=dev)
        trd = tg["ok"] == 6
        n = trd.sum(dim=1)
        J = int(n.max()) if B else 0
        if not J:
            return
        tiles = torch.where(trd, self._arange_bt, torch.full_like(self._arange_bt, T)).sort(dim=1).values
        fights = self._tac_can_fight()
        npos = int(npass.max())
        for j in range(J):
            t = tiles[:, j].clamp(max=T - 1)
            act = j < n
            rt = reach_at(t)
            cand = self._tac_reachers(live() & fights & (rt == 1) & act.unsqueeze(1), ai, order)
            if not bool(cand.count_nonzero()):
                continue
            stood = torch.zeros(B, dtype=torch.bool, device=dev)
            js = cand.gather(1, order[:, :npos]).any(dim=0).nonzero(as_tuple=True)[0].tolist()
            for jj in js:
                u_b = order[:, jj]
                go = cand[bidx, u_b] & ~stood & live()[bidx, u_b] & (self.barb_unit_mp[bidx, u_b] > 0)
                if not bool(go.count_nonzero()):
                    continue
                self._tac_move_to(go, u_b, t)
                done[bidx[go], u_b[go]] = True
                stood |= go & self.barb_unit_alive[bidx, u_b] & (self.barb_unit_tile[bidx, u_b] == t)

    def _tac_chase(self, live, done: torch.Tensor, rowof: torch.Tensor, res: dict, tg: dict,
                   order: torch.Tensor, npass: torch.Tensor, pre: str = "barb", seat: int = BARB_SEAT,
                   strike: bool = True) -> None:
        """CHASE TARGET (`chaseTarget`): each land unit left, in pool order,
        takes the LOW target standing where it does, else the last of the list
        within 8 of it whose plot its reach takes within two turns, and moves
        to the first plot of its reach of this turn within its range (1 at
        least) of the target with none of its own stacking there — the
        units of pool `pre`, the player `seat`, the move striking with
        `strike`."""
        dev = self.device
        B = self.B
        bidx = torch.arange(B, device=dev)
        low = tg["ok"] == 1
        if not bool(low.count_nonzero()):
            return
        npos = int(npass.max()) if B else 0
        land = ~self.unit_naval.take(getattr(self, f"{pre}_unit_type").clamp(min=0, max=self.NU - 1))
        rank, turns = res["rank"], res["turns"]
        BIG = 1 << 40
        for j in range(npos):
            u_b = order[:, j]
            row = rowof[bidx, u_b]
            on = (j < npass) & live()[bidx, u_b] & land[bidx, u_b] & (row >= 0)
            if not bool(on.count_nonzero()):
                continue
            rr = row.clamp(min=0)
            at = getattr(self, f"{pre}_unit_tile")[bidx, u_b].clamp(min=0)
            d = self.pair_dist[at].to(torch.long)  # [B, T]
            rt = turns[rr]
            here = low & (d == 0)
            far = low & (d > 0) & (d < _CHASE_SIGHT) & (rt >= 1) & (rt <= _PLAN_TURNS)
            tgt = torch.where(here.any(dim=1), here.long().argmax(dim=1),
                              torch.where(far, self._arange_bt, torch.full_like(self._arange_bt, -1)).max(dim=1).values)
            on = on & (tgt >= 0)
            if not bool(on.count_nonzero()):
                continue
            tc = tgt.clamp(min=0)
            r = self._tac_range(bidx, u_b, pre).clamp(min=1)
            ok = ((rt == 1) & (self.pair_dist[tc].to(torch.long) <= r.unsqueeze(1))
                  & ~self._tac_stacked_other(u_b, pre, seat) & on.unsqueeze(1))
            rk_ = rank[rr]
            key = torch.where(ok & (rk_ >= 0), rk_, torch.full_like(rk_, BIG))
            m, spot = key.min(dim=1)
            mv = on & (m < BIG)
            self._tac_move_to(mv, u_b, spot, pre, seat, strike)
            done[bidx[mv], u_b[mv]] = True

    def _tac_chase_city(self, on: torch.Tensor, k: torch.Tensor, seat: torch.Tensor) -> torch.Tensor:
        """`chaseCity` for tribe `k` [B] going after `seat` [B]: of the cities
        its raid waits for that `seat` holds, the nearest its camp within 16,
        else `seat`'s nearest city; -1 none."""
        dev = self.device
        B = self.B
        bidx = torch.arange(B, device=dev)
        camp = self.tribe_plot[bidx, k].clamp(min=0)
        lim = _CHASE_RANGE + 1
        rq = self.tribe_raidq[bidx, k]   # [B, TL]
        rpl = self.tribe_raidp[bidx, k]
        pc = rpl.clamp(min=0)
        held = (rq >= 0) & (rq == seat.unsqueeze(1)) & (rpl >= 0) & (self.tile_seat.gather(1, pc) == seat.unsqueeze(1))
        dr = self.pair_dist[camp.unsqueeze(1), pc].to(torch.long)
        kr = torch.where(held & (dr < lim), dr * (rq.shape[1] + 1) + torch.arange(rq.shape[1], device=dev), 1 << 40)
        m, i = kr.min(dim=1)
        out = torch.where(on & (m < (1 << 40)), pc.gather(1, i.unsqueeze(1)).squeeze(1), torch.full_like(m, -1))
        rest = on & (out < 0)
        if bool(rest.count_nonzero()):
            maj = rest & (seat >= 0) & (seat < self.n_majors)
            if bool(maj.count_nonzero()):
                g = seat.clamp(min=0, max=max(self.n_majors - 1, 0))
                cc = self.city_center[bidx, g].clamp(min=0)   # [B, M]
                ca = self.city_alive[bidx, g]
                dcc = self.pair_dist[camp.unsqueeze(1), cc].to(torch.long)
                M = cc.shape[1]
                kc = torch.where(ca & (dcc < lim), dcc * (M + 1) + torch.arange(M, device=dev), 1 << 40)
                m2, i2 = kc.min(dim=1)
                out = torch.where(maj & (m2 < (1 << 40)), cc.gather(1, i2.unsqueeze(1)).squeeze(1), out)
            if self.S > 0:
                mi = rest & (seat >= 100) & (seat < 100 + self.S)
                if bool(mi.count_nonzero()):
                    j = (seat - 100).clamp(min=0, max=self.S - 1)
                    cen = self.citystate_center[bidx, j]
                    okc = (mi & self.citystate_alive[bidx, j] & (cen >= 0)
                           & (self.pair_dist[camp, cen.clamp(min=0)].to(torch.long) < lim))
                    out = torch.where(okc, cen, out)
        return out

    def _tac_pass(self, acting: torch.Tensor) -> None:
        """`_barbarian_tactics`' moves"""
        dev = self.device
        B, T = self.B, self.T
        P = simbase.BARB_POOL_MAX
        BIG = 1 << 40
        bidx = torch.arange(B, device=dev)
        done = torch.zeros(B, P, dtype=torch.bool, device=dev)
        ai, utribe = self._tac_ai()

        def live() -> torch.Tensor:
            return acting & ~done & self.barb_unit_alive & (self.barb_unit_seat == BARB_SEAT)

        # the planning's reach, two turns, no zones of control
        want = live() & (ai >= _AI_EXPLORE)
        rows, slots = want.nonzero(as_tuple=True)
        rowof = torch.full((B, P), -1, dtype=torch.long, device=dev)
        if rows.numel():
            rowof[rows, slots] = torch.arange(rows.shape[0], device=dev)
            res = self._tac_search(rows, slots, BARB_SEAT, _PLAN_TURNS, False)
            rank, rturn = res["rank"], res["turns"]
        else:
            rank = torch.full((1, T), -1, dtype=torch.long, device=dev)
            rturn = rank.clone()
        rsafe = rowof.clamp(min=0)

        def reach_at(tiles: torch.Tensor) -> torch.Tensor:
            """[B, P] the turn each unit's reach reaches the game's plot, -1 none"""
            if not rows.numel():
                return torch.full((B, P), -1, dtype=torch.long, device=dev)
            v = rturn[rsafe, tiles.clamp(min=0, max=T - 1).unsqueeze(1).expand(-1, P)]
            return torch.where(rowof >= 0, v, torch.full_like(v, -1))

        slotno = torch.where(acting, self.barb_unit_slotno, torch.full_like(self.barb_unit_slotno, BIG))
        order = torch.argsort(slotno, dim=1, stable=True)
        npass = acting.sum(dim=1)

        def first_by_slot(cand: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
            k = torch.where(cand, slotno, torch.full_like(slotno, BIG))
            return cand.any(dim=1), k.argmin(dim=1)

        # the tactical target list as the pass begins
        tg = self._tac_targets()
        # an operation's units are the operation's
        op = self.barb_unit_op.clone()
        done |= self._barb_stand_in(live, lambda u, tgt: op[:, u])
        done |= op & acting
        if rows.numel():
            self._tac_rampage(live, done, utribe, rowof, res, tg, order, npass)
        # Attack High Priority
        done |= self._barb_stand_in(live, lambda u, tgt: None if tgt is None else (ai[:, u] >= _AI_COMBAT) & (tgt < T))

        # DEFEND CAMPS: each camp in plot order, its first DEFENDER by slot
        # whose reach takes it within three turns
        camps = torch.where(self.camp_tile >= 0, self.camp_tile, torch.full_like(self.camp_tile, BIG))
        camps = camps.sort(dim=1).values
        for c in range(camps.shape[1]):
            camp = camps[:, c]
            on = camp < BIG
            if not bool(on.count_nonzero()):
                break
            rt = reach_at(camp)
            cand = live() & (ai == _AI_DEFENDER) & (rt >= 1) & (rt <= _DEFEND_CAMP_TURNS) & on.unsqueeze(1)
            has, u_b = first_by_slot(cand)
            if not bool(has.count_nonzero()):
                continue
            away = has & (self.barb_unit_tile[bidx, u_b] != camp)
            self._tac_move_to(away, u_b, camp)
            done[bidx[has], u_b[has]] = True

        if rows.numel():
            self._tac_attack_civilians(live, done, ai, reach_at, tg, order, npass)
            self._tac_plunder(live, done, ai, reach_at, tg, order, npass)

        # PILLAGE District, then Improvement: the plots the barbarians see
        own = self.tile_seat
        terr = (own >= 0) & ((own < BARB_SEAT) | (own == FREE_SEAT))
        for districts in (True, False):
            # the list's PASSIVE_DISTRICT, then IMPROVEMENT, targets still pillageable
            if districts:
                ok = ((tg["dk"] == 2) & (self.district >= 0) & (self.district != self._encamp_didx)
                      & self.district_complete & ~self.district_pillaged)
            else:
                ok = (tg["ok"] == 9) & (self.improvement >= 0) & ~self.pillaged
            tgt = terr & ok
            el = live() & (ai >= _AI_EXPLORE)
            er = el[rows, slots] if rows.numel() else torch.zeros(0, dtype=torch.bool, device=dev)
            if not bool(er.count_nonzero()):
                continue
            r1 = torch.zeros(B, T, dtype=torch.float32, device=dev)
            r1.index_add_(0, rows[er], (rturn[er] == 1).float())
            tgt &= r1 > 0
            ntg = tgt.sum(dim=1)
            J = int(ntg.max())
            tiles = torch.where(tgt, self._arange_bt, torch.full_like(self._arange_bt, T)).sort(dim=1).values
            for j in range(J):
                t = tiles[:, j]
                active = j < ntg
                last = torch.full((B,), -1, dtype=torch.long, device=dev)
                while bool(active.count_nonzero()):
                    rt = reach_at(t)
                    here = self.barb_unit_tile.clamp(min=0)
                    at_t = self.barb_unit_tile == t.unsqueeze(1)
                    if districts:
                        stand = (self.district.gather(1, here) >= 0) | self._centre_plane().gather(1, here)
                    else:
                        stand = self.improvement.gather(1, here) >= 0
                    cand = (live() & (ai >= _AI_EXPLORE) & (rt == 1) & (slotno > last.unsqueeze(1))
                            & (at_t | ~stand) & active.unsqueeze(1))
                    has, u_b = first_by_slot(cand)
                    if not bool(has.count_nonzero()):
                        break
                    last = torch.where(has, slotno[bidx, u_b], last)
                    away = has & ~at_t[bidx, u_b]
                    self._tac_move_to(away, u_b, t)
                    there = has & (self.barb_unit_tile[bidx, u_b] == t)
                    self._barb_pillage_here(there, u_b)
                    done[bidx[has], u_b[has]] = True
                    active = has & ~there

        if rows.numel():
            self._tac_chase(live, done, rowof, res, tg, order, npass)

        # WANDER NEAR CAMP: by slot, each unit above EXPLORE whose camp stands
        for j in range(int(npass.max()) if B else 0):
            u_b = order[:, j]
            ok = (j < npass) & live()[bidx, u_b] & (ai[bidx, u_b] > _AI_EXPLORE)
            tr = utribe[bidx, u_b]
            ok &= (tr >= 0) & self.tribe_alive[bidx, tr.clamp(min=0)]
            if not bool(ok.count_nonzero()):
                continue
            camp = self.tribe_plot[bidx, tr.clamp(min=0)].clamp(min=0)
            row = rowof[bidx, u_b]
            rtu = torch.where((row >= 0).unsqueeze(1), rturn[row.clamp(min=0)], torch.full((B, T), -1, dtype=torch.long, device=dev))
            rku = rank[row.clamp(min=0)]
            stacked = self._tac_own_mil(BARB_SEAT)
            cseat = self.tile_seat[bidx, camp]
            ccity = self.tile_city[bidx, camp]
            bound = (cseat != NO_SEAT) & (ccity != -1)
            same = (self.tile_seat == cseat.unsqueeze(1)) & (self.tile_city == ccity.unsqueeze(1))
            cand = ((rtu == 1) & ~self._tac_foreign(BARB_SEAT) & ~stacked
                    & (self.pair_dist[camp].to(torch.long) <= _WANDER_CAMP_RANGE)
                    & (~bound.unsqueeze(1) | same))
            count = cand.sum(dim=1)
            pick = self._rand_range(ok & (count > 0), count)
            by_rank = torch.where(cand, rku, torch.full_like(rku, BIG)).argsort(dim=1, stable=True)
            dest = torch.where(count > 0, by_rank.gather(1, pick.clamp(max=T - 1).unsqueeze(1)).squeeze(1), camp)
            self._tac_move_to(ok, u_b, dest)
            done[bidx[ok], u_b[ok]] = True

        # Explore Land (the homeland list); the rest end their turn
        self._barb_stand_in(live, lambda u, tgt: ai[:, u] == _AI_EXPLORE)

    # ------------------------------------- the city-states' and Free Cities' pass

    def _tac_own_mil(self, seat: int) -> torch.Tensor:
        """[B, T] — a military unit of `seat` (ashore, afloat or embarked)
        holds the plot (`stackedAt` for a military unit, itself counted)."""
        out = torch.zeros(self.B, self.T, dtype=torch.bool, device=self.device)
        for pl in (self.military_at, self.embarked_at):
            out |= (pl >= 0) & (self.unit_seat.gather(1, pl.clamp(min=0)) == seat)
        return out

    def _seat_pool_slots(self, k: int, pre: str, seat: int, act: torch.Tensor) -> None:
        """`poolSlots` for pool row `k` (a city-state's, or the Free Cities'
        at row S) in the games of `act`: the slots whose unit was gone when
        the player's last tactical turn ended go free, pushed in ascending
        order; each unit of `seat` in pool `pre` without a slot takes one in
        pool order — the slot pushed last, else a new one past the end."""
        P = simbase.SEAT_POOL_MAX
        dy = self.seat_pool_dying[:, k] & act.unsqueeze(1)
        if bool(dy.count_nonzero()):
            nf0 = self.seat_pool_nfree[:, k]
            pos = nf0.unsqueeze(1) + dy.long().cumsum(dim=1) - 1
            b_i, s_i = dy.nonzero(as_tuple=True)
            self.seat_pool_free[b_i, k, pos[b_i, s_i]] = s_i
            self.seat_pool_nfree[:, k] = nf0 + dy.sum(dim=1)
            self.seat_pool_dying[:, k] = self.seat_pool_dying[:, k] & ~act.unsqueeze(1)
        slot = getattr(self, f"{pre}_unit_pslot")
        need = (act.unsqueeze(1) & getattr(self, f"{pre}_unit_alive") & (getattr(self, f"{pre}_unit_seat") == seat)
                & (slot < 0))
        if not bool(need.count_nonzero()):
            return
        r = need.long().cumsum(dim=1) - 1
        nf = self.seat_pool_nfree[:, k].unsqueeze(1)
        s_free = self.seat_pool_free[:, k].gather(1, (nf - 1 - r).clamp(min=0, max=P - 1))
        s_new = self.seat_pool_size[:, k].unsqueeze(1) + (r - nf)
        slot.copy_(torch.where(need, torch.where(r < nf, s_free, s_new), slot))
        n = need.sum(dim=1)
        used = torch.minimum(n, self.seat_pool_nfree[:, k])
        self.seat_pool_nfree[:, k] -= used
        self.seat_pool_size[:, k] += n - used
        assert int(self.seat_pool_size[:, k].max()) <= P, "a seat's pool slots exhausted — raise simbase.SEAT_POOL_MAX"

    def _seat_pool_dying(self, k: int, pre: str, seat: int, act: torch.Tensor) -> None:
        """`poolDying` for pool row `k` in the games of `act`: the slots none
        of `seat`'s units holds wait for its next turn to go free."""
        P = simbase.SEAT_POOL_MAX
        dev = self.device
        ar = torch.arange(P, device=dev).unsqueeze(0)
        slot = getattr(self, f"{pre}_unit_pslot")
        hm = getattr(self, f"{pre}_unit_alive") & (getattr(self, f"{pre}_unit_seat") == seat) & (slot >= 0)
        held = torch.zeros(self.B, P + 1, dtype=torch.bool, device=dev)
        held.scatter_(1, torch.where(hm, slot, P), True)
        infree = torch.zeros(self.B, P + 1, dtype=torch.bool, device=dev)
        infree.scatter_(1, torch.where(ar < self.seat_pool_nfree[:, k].unsqueeze(1), self.seat_pool_free[:, k], P), True)
        dying = (ar < self.seat_pool_size[:, k].unsqueeze(1)) & ~held[:, :P] & ~infree[:, :P]
        self.seat_pool_dying[:, k] = torch.where(act.unsqueeze(1), self.seat_pool_dying[:, k] | dying,
                                                 self.seat_pool_dying[:, k])

    def _tac_alt_table(self) -> torch.Tensor:
        """[T, K] long — FindAlternateLocation's plots round each plot
        (0x585940 -> 0x1e000), in its order: the game's axial steps (dx, dy)
        over -3..3, dx the outer, within 3; -1 off the map."""
        tab = getattr(self, "_tac_alt_cache", None)
        if tab is not None:
            return tab
        W, H = self.W, self.H
        rng = _WANDER_BACK_RANGE
        steps = [(dx, dy) for dx in range(-rng, rng + 1) for dy in range(-rng, rng + 1)
                 if (max(abs(dx), abs(dy)) if (dx < 0) != (dy < 0) and dx != 0 and dy != 0 else abs(dx) + abs(dy)) <= rng]
        rows = []
        for t in range(W * H):
            col, row = t % W, t // W
            q = col - ((row - (row & 1)) >> 1)
            out = []
            for dx, dy in steps:
                r = row + dy
                c = q + dx + ((r - (r & 1)) >> 1)
                if self.wrap_x:
                    c %= W
                out.append(r * W + c if 0 <= r < H and 0 <= c < W else -1)
            rows.append(out)
        tab = torch.tensor(rows, dtype=torch.long, device=self.device)
        self._tac_alt_cache = tab
        return tab

    def _tac_alternate(self, mask: torch.Tensor, us: torch.Tensor, home: torch.Tensor, pre: str, seat: int,
                       ent: torch.Tensor) -> torch.Tensor:
        """[B] — `alternateLocation` for the unit at local slot `us` of pool
        `pre` round `home` [B] in the games of `mask`: of the plots within 3 in
        the table's order that its ground takes (`ent` [B, T]) with no other
        player's unit and none of its own stacking with it, the nearest
        `home`, a plot of another area counted three times as far, the first
        of equals; -1 none."""
        B, T, dev = self.B, self.T, self.device
        bidx = torch.arange(B, device=dev)
        cand = self._tac_alt_table()[home.clamp(min=0)]  # [B, K]
        cc = cand.clamp(min=0)
        g = (us + self.POOL_LO[pre]).unsqueeze(1)
        own_other = torch.zeros(B, T, dtype=torch.bool, device=dev)
        for pl in (self.military_at, self.embarked_at):
            own_other |= (pl >= 0) & (self.unit_seat.gather(1, pl.clamp(min=0)) == seat) & (pl != g)
        ok = (cand >= 0) & ent.gather(1, cc) & ~self._tac_foreign(seat).gather(1, cc) & ~own_other.gather(1, cc)
        d = self.pair_dist[home.clamp(min=0).unsqueeze(1), cc].to(torch.long)
        area = self.tile_area
        d = torch.where(area.gather(1, cc) != area[bidx, home.clamp(min=0)].unsqueeze(1), d * 3, d)
        K = cand.shape[1]
        key = torch.where(ok & mask.unsqueeze(1), d * (K + 1) + torch.arange(K, device=dev), torch.full_like(d, 1 << 40))
        m, i = key.min(dim=1)
        return torch.where(m < (1 << 40), cc.gather(1, i.unsqueeze(1)).squeeze(1), torch.full_like(m, -1))

    def _seat_pass_open(self, pre: str, seat: int, act: torch.Tensor) -> dict:
        """a player's tactical pass as it opens (`openPass`): its military
        units of pool `pre` in pool-slot order, their planning reach (two
        turns, no zones of control) and its tactical target list"""
        dev = self.device
        B, T = self.B, self.T
        BIG = 1 << 40
        ut = getattr(self, f"{pre}_unit_type").clamp(min=0, max=self.NU - 1)
        units = (act.unsqueeze(1) & getattr(self, f"{pre}_unit_alive") & (getattr(self, f"{pre}_unit_seat") == seat)
                 & self._type_dom_mil.take(ut))
        P = units.shape[1]
        slot = getattr(self, f"{pre}_unit_pslot")
        key = torch.where(units, slot, torch.full_like(slot, BIG))
        order = torch.argsort(key, dim=1, stable=True)
        npass = units.sum(dim=1)
        rows, slots = units.nonzero(as_tuple=True)
        rowof = torch.full((B, P), -1, dtype=torch.long, device=dev)
        if rows.numel():
            rowof[rows, slots] = torch.arange(rows.shape[0], device=dev)
            res = self._tac_search(rows, slots, seat, _PLAN_TURNS, False, pre=pre)
        else:
            empty = torch.full((1, T), -1, dtype=torch.long, device=dev)
            res = {"rank": empty, "turns": empty.clone()}
        return {"units": units, "order": order, "npass": npass, "rowof": rowof, "res": res}

    def _tac_foe_near(self, units: torch.Tensor, pre: str, seat: int, radius: int) -> bool:
        """is a unit of a player at war with `seat` within `radius` of one of
        `units` [B, P] of pool `pre` in some game — else no target of the
        list is one a move of the pass could take"""
        rows, slots = units.nonzero(as_tuple=True)
        if not rows.numel():
            return False
        tiles = getattr(self, f"{pre}_unit_tile")[rows, slots].clamp(min=0)
        near = torch.zeros(self.B, self.T, dtype=torch.float32, device=self.device)
        near.index_add_(0, rows, (self.pair_dist[tiles].to(torch.long) <= radius).to(torch.float32))
        return bool(((near > 0) & self._tac_hostile(seat)).any())

    def _seat_reach_turns(self, op: dict, u_b: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """[B, T] twice — the reach turn (-1 none) and closing rank of each
        game's unit at local slot `u_b`"""
        B, T = self.B, self.T
        bidx = torch.arange(B, device=self.device)
        row = op["rowof"][bidx, u_b]
        rr = row.clamp(min=0)
        rt = torch.where((row >= 0).unsqueeze(1), op["res"]["turns"][rr], torch.full((B, T), -1, dtype=torch.long,
                                                                                   device=self.device))
        return rt, op["res"]["rank"][rr]

    def _minor_tactics(self, s: int) -> None:
        """A CITY-STATE'S TACTICAL TURN (`cityStateTactics`) for minor `s`:
        its unit pool (`_seat_pool_slots`), each unit's planning reach taken
        before any moves, its tactical target list, then Heal, Chase Target
        (no strike) and Wander Near City in pool order; the rest end their
        turn."""
        seat = 100 + s
        act = self.citystate_alive[:, s] & (self.citystate_center[:, s] >= 0)
        if not bool(act.count_nonzero()):
            return
        self._seat_pool_slots(s, "major", seat, act)
        self._tac_in_pass = True
        self._tac_cost_held = None
        self._tac_full_held = None
        try:
            self._minor_pass(s, act)
        finally:
            self._tac_in_pass = False
            self._tac_cost_held = None
            self._tac_full_held = None
        self._seat_pool_dying(s, "major", seat, act)

    def _minor_pass(self, s: int, act: torch.Tensor) -> None:
        """`_minor_tactics`' moves"""
        dev = self.device
        B, T = self.B, self.T
        bidx = torch.arange(B, device=dev)
        seat = 100 + s
        pre = "major"
        op = self._seat_pass_open(pre, seat, act)
        units, order, npass = op["units"], op["order"], op["npass"]
        # the tactical target list as the pass begins, where a foe stands
        # within a chase's sight of a unit (no move of the pass takes a target
        # farther)
        tg = self._tac_targets(seat) if self._tac_foe_near(units, pre, seat, _CHASE_SIGHT) else None
        done = torch.zeros_like(units)
        alive = self.major_unit_alive

        def live() -> torch.Tensor:
            return units & ~done & alive & (self.major_unit_seat == seat)

        npos = int(npass.max()) if B else 0
        home = self.citystate_center[:, s].clamp(min=0)
        # HEAL: a hurt unit holds its plot; a hull outside its own waters
        # heads for its city
        hp_max = int(self.rules.combat["unitHp"])
        ut = self.major_unit_type.clamp(min=0, max=self.NU - 1)
        naval = self.unit_naval.take(ut)
        hurt = live() & (self.major_unit_hp < hp_max)
        away = hurt & naval & (self.tile_seat.gather(1, self.major_unit_tile.clamp(min=0)) != seat)
        if bool(away.count_nonzero()):
            for j in range(npos):
                u_b = order[:, j]
                go = (j < npass) & away[bidx, u_b] & live()[bidx, u_b]
                if bool(go.count_nonzero()):
                    self._tac_move_to(go, u_b, home, pre, seat, False)
        done |= hurt
        # CHASE TARGET: a LOW target within 8 of a unit (the list taken as the
        # pass began: only where a foe stands near is there one to take)
        if tg is not None:
            self._tac_chase(live, done, op["rowof"], op["res"], tg, order, npass, pre, seat, False)
        # WANDER NEAR CITY: by slot, each unit with Movement left
        land_ent, wat_ent = self._tac_enter(seat)
        for j in range(npos):
            u_b = order[:, j]
            ok = (j < npass) & live()[bidx, u_b] & (self.major_unit_mp[bidx, u_b] > 0)
            if not bool(ok.count_nonzero()):
                continue
            rt, rk = self._seat_reach_turns(op, u_b)
            cand = ((rt == 1) & ~self._tac_hostile(seat) & ~self._tac_own_mil(seat)
                    & (self.pair_dist[home].to(torch.long) <= _WANDER_CITY_RANGE))
            count = cand.sum(dim=1)
            wander = ok & (count > 0)
            pick = self._rand_range(wander, count)
            by_rank = torch.where(cand, rk, torch.full_like(rk, 1 << 40)).argsort(dim=1, stable=True)
            dest = by_rank.gather(1, pick.clamp(min=0, max=T - 1).unsqueeze(1)).squeeze(1)
            self._tac_move_to(wander, u_b, dest, pre, seat, False)
            back = ok & (count == 0)
            if bool(back.count_nonzero()):
                ut_b = self.major_unit_type[bidx, u_b].clamp(min=0, max=self.NU - 1)
                nav_b = self.unit_naval.take(ut_b)
                emb_b = self._tac_embarks(bidx, ut_b, seat)
                ent = torch.where(nav_b.unsqueeze(1), wat_ent,
                                  land_ent | (wat_ent & emb_b.unsqueeze(1)))
                alt = self._tac_alternate(back, u_b, home, pre, seat, ent)
                self._tac_move_to(back & (alt >= 0), u_b, alt, pre, seat, False)
            done[bidx[ok], u_b[ok]] = True

    def _free_tactics(self, act: torch.Tensor) -> None:
        """THE FREE CITIES' TACTICAL TURN (`freeCityTactics`) in the games of
        `act`: their unit pool (row S), each unit's planning reach, then
        Wander Near Camp round each unit's home (`freeHome`) in pool order;
        the rest end their turn."""
        dev = self.device
        B, T = self.B, self.T
        bidx = torch.arange(B, device=dev)
        k = self.S
        pre = "barb"
        seat = FREE_SEAT

        if not bool(act.count_nonzero()):
            return
        self._seat_pool_slots(k, pre, seat, act)
        self._tac_in_pass = True
        self._tac_cost_held = None
        self._tac_full_held = None
        try:
            op = self._seat_pass_open(pre, seat, act)
            units, order, npass = op["units"], op["order"], op["npass"]
            done = torch.zeros_like(units)
            homes = self._free_homes()

            def live() -> torch.Tensor:
                return units & ~done & self.barb_unit_alive & (self.barb_unit_seat == seat)

            for j in range(int(npass.max()) if B else 0):
                u_b = order[:, j]
                home = homes[bidx, u_b]
                ok = (j < npass) & live()[bidx, u_b] & (home >= 0)
                if not bool(ok.count_nonzero()):
                    continue
                camp = home.clamp(min=0)
                rt, rk = self._seat_reach_turns(op, u_b)
                cseat = self.tile_seat[bidx, camp]
                ccity = self.tile_city[bidx, camp]
                bound = (cseat != NO_SEAT) & (ccity != -1)
                same = (self.tile_seat == cseat.unsqueeze(1)) & (self.tile_city == ccity.unsqueeze(1))
                cand = ((rt == 1) & ~self._tac_hostile(seat) & ~self._tac_own_mil(seat)
                        & (self.pair_dist[camp].to(torch.long) <= _WANDER_CAMP_RANGE)
                        & (~bound.unsqueeze(1) | same))
                count = cand.sum(dim=1)
                pick = self._rand_range(ok & (count > 0), count)
                by_rank = torch.where(cand, rk, torch.full_like(rk, 1 << 40)).argsort(dim=1, stable=True)
                dest = torch.where(count > 0, by_rank.gather(1, pick.clamp(min=0, max=T - 1).unsqueeze(1)).squeeze(1),
                                   camp)
                self._tac_move_to(ok, u_b, dest, pre, seat, False)
                done[bidx[ok], u_b[ok]] = True
        finally:
            self._tac_in_pass = False
            self._tac_cost_held = None
            self._tac_full_held = None
        self._seat_pool_dying(k, pre, seat, act)

    def _free_homes(self) -> torch.Tensor:
        """[B, U] long — `freeHome` of each hostile-pool unit: the centre of
        the Free City that granted it, else of the nearest Free City (the
        lowest column of equals); -1 none."""
        row = self.FREE_ROW
        alive = self.city_alive[:, row]  # [B, RC]
        ctr = self.city_center[:, row]
        cid = self.city_id[:, row]
        fc = self.barb_unit_free_city  # [B, U]
        mine = alive.unsqueeze(1) & (cid.unsqueeze(1) == fc.unsqueeze(2)) & (fc >= 0).unsqueeze(2)  # [B, U, RC]
        has = mine.any(dim=2)
        own = ctr.gather(1, mine.long().argmax(dim=2))
        near = self._free_nearest_col()
        nearest = torch.where(near >= 0, ctr.gather(1, near.clamp(min=0)), torch.full_like(near, -1))
        return torch.where(has, own, nearest)
