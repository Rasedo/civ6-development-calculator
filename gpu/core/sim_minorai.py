"""THE CITY-STATES' CITY AI AND THE FREE CITIES' PICK on the GPU
(cpu/core/minorCityAi.ts, minorBuild.ts's `freeCityBuild`; GameCore_XP2
AI/CityBuild.cpp, AI/Economic.cpp; `tools/civ6lab/dll_readings.md` "C-96: the
city events, trees and contracts"). Each city-state's turn after its step
(`_minor_build`), as the game's Control Manager runs a player's lists:

 - B: the Economic AI's savings turn (0x687bf0, `_cv_savings_turn`), the
   military AI's turn (`_mops_evaluate`, sim_minorops.py);
 - A: the city's update (0x5ce680): its threat (0x5cbd10, `_minor_threat`),
   the contract in hand checked (0x5d7e00), the slots of trees no longer
   running freed, the plot analysis (0x5ce970, `_minor_plot_evals`), the
   improvement pick (0x5c9a00) and the events — City Defense (its operation
   manager's start, `_mops_start`), the building or unit event, the district
   event, the improvement event — a city its AI first sees this turn running
   none;
 - C: the Default Specialization where the queue is empty (0x5d4d70: the
   contract in hand where it takes the turn, else the pick), the purchases
   (0x5ce5b0's tail: a threatened city buys the first unit of its list while
   TryPurchaseUnits succeeds), the trees' tick (0x7ffdd0), their orders
   carried out at once; its operations' trees tick in its units' turn
   (`_mops_run`).

The city AI's state is the sim's `cai_*` planes (`CityAi`, sim_citytrees.py);
a unit's id is its slot in the majors' pool. A Free City's AI is its Default
Specialization alone (the Free Cities' event list names "Simple City Tree",
which the install defines no nodes for).
"""

from __future__ import annotations

from .simbase import *  # noqa: F401,F403 — torch, constants, helpers: the shared floor
from .sim_citytrees import (
    building_event, city_contracts, defense_event, district_event, free_slots, goals_reached,
    improvement_event, in_hand_check, pick_improvement, queue_contract, takes_turn, tick_city_trees, _cget,
)
from .sim_cityvalue import _FX_MIN, _MinorFacts, _t
from .sim_research import _FX, _discounted, _fmul, _fx_const, _present_value

# the city's plots, the centre first, as axial offsets from it (the city's
# plot order, AI_CityBuild.csv's PLOT ANALYSIS LOG)
CITY_PLOT_OFFSETS = (
    (0, 0), (0, 1), (1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1),
    (0, 2), (1, 1), (2, 0), (2, -1), (2, -2), (1, -2), (0, -2), (-1, -1), (-2, 0), (-2, 1), (-2, 2), (-1, 2),
    (0, 3), (1, 2), (2, 1), (3, 0), (3, -1), (3, -2), (3, -3), (2, -3), (1, -3), (0, -3), (-1, -2), (-2, -1), (-3, 0),
    (-3, 1), (-3, 2), (-3, 3), (-2, 3), (-1, 3),
)
# the range a full civ's units threaten from, and a city-state's or the
# barbarians'; the margins over the city's defense (0x5cbd10)
_RANGE_CIV, _RANGE_OTHER = 5, 3
_MARGIN_HOSTILE, _MARGIN_OTHER = 5 * _FX, 20 * _FX
_YIELDS = ["YIELD_FOOD", "YIELD_PRODUCTION", "YIELD_GOLD", "YIELD_SCIENCE", "YIELD_CULTURE", "YIELD_FAITH"]


def _between(a: torch.Tensor, t: torch.Tensor, h: torch.Tensor, r: int) -> torch.Tensor:
    """`valueBetween`: `a` a turn from `t` to `h`, discounted to `t` where they meet"""
    return torch.where(t == h, _discounted(a, r, t), _present_value(a, r, h) - _present_value(a, r, t))


class SimMinorAi:
    # -- the city's plots ---------------------------------------------------

    def _city_plots(self) -> torch.Tensor:
        """[T, 37] per centre its city's plots in the city's plot order (-1
        off the map)"""
        c = getattr(self, "_city_plot_cache", None)
        if c is not None:
            return c
        W, H, wrap = self.W, self.H, bool(self.wrap_x)
        out = []
        for t in range(W * H):
            col, rw = t % W, t // W
            q = col - ((rw - (rw & 1)) >> 1)
            line = []
            for dq, dr in CITY_PLOT_OFFSETS:
                r2 = rw + dr
                c2 = (q + dq) + ((r2 - (r2 & 1)) >> 1)
                if r2 < 0 or r2 >= H or (not wrap and (c2 < 0 or c2 >= W)):
                    line.append(-1)
                    continue
                line.append(r2 * W + (c2 % W if wrap else c2))
            out.append(line)
        c = self._city_plot_cache = torch.tensor(out, dtype=torch.long, device=self.device)
        return c

    # -- the minor's AI turn -------------------------------------------------

    def _minor_ai_turn(self, s: int) -> None:
        """`minorAiTurn` — THE MINOR'S AI TURN (the order above)"""
        alive = self.citystate_alive[:, s] & (self.citystate_center[:, s] >= 0)
        if not bool(alive.count_nonzero()):
            return
        ai = self.cityai
        fresh = alive & ~self.citystate_ai_on[:, s]
        self.citystate_ai_on[:, s] |= alive
        # B: the savings
        tre = torch.trunc(self.citystate_treasury[:, s] * _FX).long()
        sav, bal = self._cv_savings_turn(self.citystate_savings[:, s], self.citystate_balance[:, s], tre,
                                         torch.zeros_like(alive))
        self.citystate_savings[:, s] = torch.where(alive.unsqueeze(1), sav, self.citystate_savings[:, s])
        self.citystate_balance[:, s] = torch.where(alive, bal, self.citystate_balance[:, s])
        # B: the military AI's turn
        self._mops_evaluate(s)
        # A: the city's update
        f = self._cv_minor_facts(s)
        b_tab, u_tab, p_tab = self._cv_minor_tables(s, f)
        threat = torch.where(alive, self._minor_threat(s), torch.full_like(self.citystate_threat[:, s], -1))
        self.citystate_threat[:, s] = torch.where(alive, threat, self.citystate_threat[:, s])
        self.citystate_standing_short[:, s] = torch.where(alive, self._minor_standing_short(s),
                                                         self.citystate_standing_short[:, s])
        evals = self._minor_plot_evals(s, f)
        w = _MinorWorld(self, s, f, (b_tab, u_tab, p_tab), evals, threat)
        goals_reached(ai, s, w, alive)
        free_slots(ai, s, w, alive)
        in_hand_check(ai, s, w, alive)
        best_imp = pick_improvement(ai, s, w, alive)
        ev = alive & ~fresh
        if bool(ev.count_nonzero()):
            lst = self.rules.ai_city_build["cityEventLists"].get("MINOR_CIV_DEFAULT_TRAIT", {})
            defense_event(ai, s, w, lst.get("CITY_UNDER_THREAT"), ev)
            building_event(ai, s, w, ev)
            district_event(ai, s, w, ev)
            improvement_event(ai, s, w, best_imp, ev)
        # C: the Default Specialization on an empty queue
        idle = alive & (self.citystate_item[:, s] < 0)
        if bool(idle.count_nonzero()):
            hand = city_contracts(ai, s, w, idle)
            bests = self._cv_bests(b_tab, u_tab, p_tab, f)
            take = idle & takes_turn(ai, s, hand, bests[1][1], bests[2][1])
            key, site = self._minor_contract_item(s, hand)
            ok = (key >= 0) & self._minor_queue_ok(s, key, site)
            q = queue_contract(ai, s, hand, w, ok, take)
            if bool(q.count_nonzero()):
                self._minor_set_item(s, q, key, site)
                self.citystate_prod_set_turn[:, s] = torch.where(q, int(self.turn), self.citystate_prod_set_turn[:, s])
                self.citystate_prod_set_value[:, s] = torch.where(q, _cget(ai.c_value, s, hand), self.citystate_prod_set_value[:, s])
            rest = idle & ~take
            ai.in_hand[:, s] = torch.where(rest, -1, ai.in_hand[:, s])
            if bool(rest.count_nonzero()):
                kind, row, val = self._cv_pick(b_tab, u_tab, p_tab, f, bests)
                pkey = self._minor_pick_key(kind, row)
                ok2 = rest & (pkey >= 0) & self._minor_queue_ok(s, pkey, torch.full_like(pkey, -1))
                if bool(ok2.count_nonzero()):
                    self._minor_set_item(s, ok2, pkey, torch.full_like(pkey, -1))
                    self.citystate_prod_set_turn[:, s] = torch.where(ok2, int(self.turn), self.citystate_prod_set_turn[:, s])
                    self.citystate_prod_set_value[:, s] = torch.where(ok2, val, self.citystate_prod_set_value[:, s])
        # the purchases: a threatened city buys its list's first unit while it may
        buy = alive & (threat > -1)
        if bool(buy.count_nonzero()):
            self._minor_purchases(s, f, threat, buy)
        # the trees' tick
        tick_city_trees(ai, s, w, int(self.turn), alive)

    def _minor_contract_item(self, s: int, hand: torch.Tensor):
        """the contract in hand's item as the minor's item key and its plot
        (a district at the contract's plot), -1 none"""
        ai = self.cityai
        T = self._cv_tables()
        E = T["engine"]
        dev = self.device
        neg = torch.full_like(hand, -1)
        u = torch.where(hand >= 0, _cget(ai.c_unit, s, hand), neg)
        b = torch.where(hand >= 0, _cget(ai.c_building, s, hand), neg)
        d = torch.where(hand >= 0, _cget(ai.c_district, s, hand), neg)
        plot = torch.where(hand >= 0, _cget(ai.c_plot, s, hand), neg)
        eu = torch.tensor(E["unit"] or [-1], dtype=torch.long, device=dev)
        eb = torch.tensor(E["building"] or [-1], dtype=torch.long, device=dev)
        ed = torch.tensor(E["district"] or [-1], dtype=torch.long, device=dev)
        uk = eu.take(u.clamp(min=0))
        bk = eb.take(b.clamp(min=0))
        dk = ed.take(d.clamp(min=0))
        key = torch.where(u >= 0, torch.where(uk >= 0, uk, neg),
                          torch.where(b >= 0, torch.where(bk >= 0, self._mk_b0 + bk, neg),
                                      torch.where((d >= 0) & (dk >= 0) & (plot >= 0), self._mk_d0 + dk, neg)))
        site = torch.where((d >= 0) & (u < 0) & (b < 0), plot, neg)
        return key, site

    def _minor_pick_key(self, kind: torch.Tensor, row: torch.Tensor) -> torch.Tensor:
        """the Default Specialization's pick (kind 0 building, 1 unit, 2
        project) as the minor's item key, -1 none"""
        E = self._cv_tables()["engine"]
        dev = self.device
        neg = torch.full_like(row, -1)
        r0 = row.clamp(min=0)
        eb = torch.tensor(E["building"] or [-1], dtype=torch.long, device=dev).take(r0.clamp(max=max(len(E["building"]) - 1, 0)))
        eu = torch.tensor(E["unit"] or [-1], dtype=torch.long, device=dev).take(r0.clamp(max=max(len(E["unit"]) - 1, 0)))
        ep = torch.tensor(E["project"] or [-1], dtype=torch.long, device=dev).take(r0.clamp(max=max(len(E["project"]) - 1, 0)))
        return torch.where((kind == 0) & (eb >= 0), self._mk_b0 + eb,
                           torch.where((kind == 1) & (eu >= 0), eu,
                                       torch.where((kind == 2) & (ep >= 0), self._mk_p0 + ep, neg)))

    # -- the threat ---------------------------------------------------------

    def _minor_threat(self, s: int) -> torch.Tensor:
        """[B] long — `minorThreat` (0x5cbd10) on minor `s`'s knowledge base's
        records, with no operation of its own: per player of the game in its
        order but the minor — a full civ (the barbarians not) hostile where
        the minor fights it, the barbarians hostile, a city-state or the Free
        Cities only where the minor fights them — the player's known units
        within 5 (a full civ's) or 3 of the city summed by their threat
        strengths (the larger of Combat, RangedCombat and Bombard + 20; a
        Bombard unit counts, a ranged one above the defense less 15, any above
        the defense less 5; never an explorer); at the city's defense plus
        the margin (5.0 hostile, else 20.0 or the city's strength) the city
        is threatened: 2 hostile, 1 not. The first such player decides; -1
        none."""
        B, dev = self.B, self.device
        row = self._CITY_MINOR0 + s
        T = self._cv_tables()
        rows = T["unit_rows"]
        hrow = torch.full((B,), row, dtype=torch.long, device=dev)
        col0 = torch.zeros(B, dtype=torch.long, device=dev)
        dcs = self._city_defense_cs(hrow, col0)[0]
        d = dcs * _FX
        slot = self.citystate_kb_slot[:, s].long()
        owner = self.citystate_kb_owner[:, s].long()
        typ = self.citystate_kb_type[:, s].long()
        plot = self.citystate_kb_plot[:, s].long()
        rec = slot != -2
        er = T["engine_row"].to(dev)
        arow = torch.where(typ >= 0, er.take(typ.clamp(min=0, max=er.numel() - 1)), torch.full_like(typ, -1))
        comb = torch.tensor([int(r["combat"]) for r in rows] or [0], dtype=torch.long, device=dev)
        rng = torch.tensor([int(r["rangedCombat"]) for r in rows] or [0], dtype=torch.long, device=dev)
        bomb = torch.tensor([int(r["bombard"]) for r in rows] or [0], dtype=torch.long, device=dev)
        expl = torch.tensor([r["pseudo"] == "PSEUDOYIELD_UNIT_EXPLORER" for r in rows] or [False], dtype=torch.bool, device=dev)
        a0 = arow.clamp(min=0)
        bb = bomb.take(a0)
        bv = torch.where(bb > 0, bb + 20, torch.zeros_like(bb))
        st = torch.maximum(comb.take(a0), torch.maximum(bv, rng.take(a0))) * _FX
        dd = d.unsqueeze(1)
        counts = (bb > 0) | ((rng.take(a0) > 0) & (st.double() > dd - 15 * _FX)) | (st.double() > dd - 5 * _FX)
        strength = torch.where((arow >= 0) & counts & ~expl.take(a0), st, torch.zeros_like(st))
        centre = self.citystate_center[:, s].clamp(min=0)
        dist = self.pair_dist[centre.unsqueeze(1), plot.clamp(min=0)].long()
        out = torch.full((B,), -1, dtype=torch.long, device=dev)
        seats = list(range(self.n_majors)) + [100 + k for k in range(self.S) if k != s] + [FREE_SEAT, BARB_SEAT]
        for p in seats:
            full = p < self.n_majors
            barb = p == BARB_SEAT
            war = (self.war[:, row, int(self._seat_row[p])] if not barb
                   else torch.zeros(B, dtype=torch.bool, device=dev))
            hostile = war | barb
            if not full and not barb:
                if not bool(war.count_nonzero()):
                    continue
            margin = torch.where(hostile, torch.full_like(d, _MARGIN_HOSTILE),
                                 torch.maximum(torch.full_like(d, _MARGIN_OTHER), dcs * _FX))
            mine = rec & (owner == p) & (dist <= (_RANGE_CIV if full else _RANGE_OTHER))
            anyu = mine.any(dim=1)
            tot = torch.where(mine, strength, torch.zeros_like(strength)).sum(dim=1)
            hit = (out < 0) & anyu & (tot.double() >= d + margin)
            if not full and not barb:
                hit = hit & war
            out = torch.where(hit, torch.where(hostile, 2, 1), out)
        return out

    # -- the plot analysis ---------------------------------------------------

    def _minor_ground_imps(self, s: int, standing: bool = False) -> torch.Tensor:
        """[B, T, K] — `groundImprovements` (with `standing`,
        `standingImprovements`: the plot as it stands alone, the trees'
        nodes' test): the improvements the ground of
        each plot takes for minor `s`, the improvements' own research waived
        and a ground row's civic held (the Farm on Hills, the Lumber Mill's
        Rainforest) (CanHaveImprovement 0x35fd60, `validImprovementsIn`): of
        the plot as it stands, with its resource harvested (one with
        Resource_Harvests rows) and with its removable feature cleared — its
        own plots with no district, centre, wonder or natural wonder and
        passable; a resource's plot its own improvement alone; a water plot
        the water rows; land the minor's own trait improvement, the Farm, the
        Mine, the Lumber Mill, the Seaside Resort and the ground-only rows,
        each on its own ground; no row a governor gates; none a drought bars"""
        B, T, dev = self.B, self.T, self.device
        K = int(self._imp_unlock.numel())
        PN = self._cv_tables()["plot_names"]
        tabs = self._cv_tables()
        civ = self.citystate_civics[:, s]
        hf = (civ[:, self._hillfarms_civic] if self._hillfarms_civic >= 0
              else torch.zeros(B, dtype=torch.bool, device=dev)).unsqueeze(1)
        res = self._res_live()
        harv_tab = torch.tensor([bool(tabs["res"].get(n, {}).get("harvests")) for n in PN["resourceType"]] + [False],
                                dtype=torch.bool, device=dev)
        rem_tab = torch.tensor([bool(tabs["feat"].get(n, {}).get("removable")) for n in PN["feature"]] + [False],
                               dtype=torch.bool, device=dev)
        live_feat = (self.feat_id >= 0) & ~self.feat_stripped
        harvestable = res & harv_tab[torch.where(self.res_id >= 0, self.res_id, len(PN["resourceType"]))]
        clearable = live_feat & rem_tab[torch.where(self.feat_id >= 0, self.feat_id, len(PN["feature"]))]
        base = ((self.tile_seat == 100 + s) & (self.district < 0) & ~self._centre_plane() & ~self.nwonder
                & (self.built_wonder < 0) & (self.passable | self.wpass))
        dry = self.drought > 0
        bare = ~live_feat
        appeal_ok = self._tile_appeal() >= self._seaside_min_appeal
        nr = self._nr_bare
        gone = self.feat_stripped
        # the resource-free planes (a harvested plot's), on a plot whose
        # feature is gone the bare ground's
        nr_farm_flat = torch.where(gone, nr["_fa_f_c"], nr["farm_flat"])
        nr_farm_hill = torch.where(gone, nr["_fa_h_c"], nr["farm_hill"])
        nr_mine = torch.where(gone, nr["_mi_c"], nr["mine_ok"])
        lumber_civic = torch.ones(B, T, dtype=torch.bool, device=dev)
        for _lf, _lc in self._lumber_feat_civic:
            lumber_civic = lumber_civic & ~((self.feat_id == _lf) & ~civ[:, _lc].unsqueeze(1))
        lumber_live = ~gone & (self.feat_id == self.feat_id0) & lumber_civic
        # the three readings: as it stands, harvested, cleared (and both)
        land = base & ~res & ~self.water
        sea = base & ~res & self.water
        # `standing`: the plot as it stands alone (`standingImprovements`)
        keep = torch.full_like(base, not standing)
        land_h = base & harvestable & ~self.water & keep
        sea_h = base & harvestable & self.water & keep
        land_c = base & clearable & (~res | harvestable) & ~self.water & keep
        sea_c = base & clearable & (~res | harvestable) & self.water & keep
        any_c = bool(land_c.any()) or bool(sea_c.any())
        out = torch.zeros(B, T, K, dtype=torch.bool, device=dev)
        for k in range(K):
            ok = base & res & (self.res_imp == k)
            gov = self._imp_gov_promo[k] < 0
            if self._imp_water[k]:
                if self._imp_uniq[k] < 0 and gov:
                    ok = ok | ((sea | sea_h) & self._imp_ground_ok(k))
                    if any_c:
                        ok = ok | (sea_c & self._imp_ground_compute(k, cleared=True))
            elif k == self.FARM:
                ok = (ok | (land & (self.farm_flat | (self.farm_hill & hf)))
                      | (land_h & (nr_farm_flat | (nr_farm_hill & hf)))
                      | (land_c & (nr["_fa_f_c"] | (nr["_fa_h_c"] & hf))))
            elif k == self.MINE:
                ok = ok | (land & self.mine_ok) | (land_h & nr_mine) | (land_c & nr["_mi_c"])
            elif k == self.LUMBER:
                ok = ok | (land & self.lumber_ok & lumber_live) | (land_h & nr["lumber_ok"] & lumber_live)
            elif self.SEASIDE >= 0 and k == self.SEASIDE:
                ok = ok | (((land & self._sr_c & bare) | (land_h & nr["_sr_c"] & bare) | (land_c & nr["_sr_c"]))
                           & appeal_ok)
            elif self._imp_suz[k] and self._imp_built_by[k] < 0:
                if gov:
                    mine_k = (self.citystate_suz_imp[:, s] == k).unsqueeze(1)
                    ok = ok | ((land | land_h) & mine_k & self._imp_ground_ok(k))
                    if any_c:
                        ok = ok | (land_c & mine_k & self._imp_ground_compute(k, cleared=True))
            elif self._imp_ground[k] and self._imp_built_by[k] < 0 and self._imp_uniq[k] < 0:
                if gov:
                    ok = ok | ((land | land_h) & self._imp_ground_ok(k))
                    if any_c:
                        ok = ok | (land_c & self._imp_ground_compute(k, cleared=True))
            if k in self._drought_imps:
                ok = ok & ~dry
            out[:, :, k] = ok
        return out

    def _minor_combat_desire(self, s: int) -> None:
        """`minorCombatDesire` — THE COMBAT DESIRE of minor `s` at its
        military AI's turn (`citystate_combat_desire`, raw 24.8, its
        PSEUDOYIELD_UNIT_COMBAT weight), on the records as its last update
        aged them (the turn before): the area of its city, its unit in
        training, the players in the game's order — the majors, the
        city-states, the Free Cities, the barbarians (a tribe, always at war)
        — at war where its seat is; on turn 1 it holds no city (the game's
        city-states found theirs after their military AI's turn); its city's
        threat and its standing army's shortfall as its last city update left
        them (`citystate_threat`, `citystate_standing_short`). The player
        flags read none."""
        B, dev = self.B, self.device
        alive = self.citystate_alive[:, s]
        if not bool(alive.count_nonzero()):
            return
        row = self._CITY_MINOR0 + s
        T = self._cv_tables()
        rows = T["unit_rows"]
        er = T["engine_row"].to(dev)
        st_row = torch.tensor([max(int(r["combat"]), int(r["rangedCombat"])) for r in rows] + [0],
                              dtype=torch.long, device=dev)

        def strength_of(typ: torch.Tensor) -> torch.Tensor:
            ar = torch.where(typ >= 0, er.take(typ.clamp(min=0, max=er.numel() - 1)), torch.full_like(typ, -1))
            return st_row.take(torch.where(ar >= 0, ar, torch.full_like(ar, len(rows))))
        slot = self.citystate_kb_slot[:, s].long()
        owner = self.citystate_kb_owner[:, s].long()
        typ = self.citystate_kb_type[:, s].long()
        seen = self.citystate_kb_seen[:, s].long()
        plot = self.citystate_kb_plot[:, s].long()
        centre = self.citystate_center[:, s]
        area = torch.where(centre >= 0, self.tile_area.gather(1, centre.clamp(min=0).unsqueeze(1)).squeeze(1),
                           torch.full_like(centre, -1))
        rec_area = self.tile_area.gather(1, plot.clamp(min=0))
        turn = int(self.turn) - 1
        counted = (slot != -2) & (turn - seen <= 2) & (area >= 0).unsqueeze(1) & (rec_area == area.unsqueeze(1))
        strength = strength_of(typ)
        best = torch.maximum(torch.maximum(torch.ones_like(centre), self.citystate_best_melee[:, s].long()),
                             self.citystate_best_ranged[:, s].long().clamp(min=self._city_min_strike))
        item = self.citystate_item[:, s].long()
        q = torch.where((item >= 0) & (item < self._mk_b0), strength_of(item), torch.zeros_like(item))
        queued = torch.where(q + 20 > best, q, torch.zeros_like(q))
        cities = ((centre >= 0) & (int(self.turn) > 1)).long()
        players = []
        for p in list(range(self.n_majors)) + [100 + k for k in range(self.S)] + [FREE_SEAT, BARB_SEAT]:
            if p == BARB_SEAT:
                players.append((p, True, True, False))
            elif p == 100 + s:
                players.append((p, False, False, False))
            else:
                players.append((p, self.war[:, row, int(self._seat_row[p])], False, False))
        zero = torch.zeros(B, dtype=torch.bool, device=dev)
        threatened = self.citystate_threat[:, s] >= 0
        each = self._cv_pseudo(torch.full((B,), _FX, dtype=torch.long, device=dev), "PSEUDOYIELD_STANDING_ARMY_VALUE")
        standing = _fmul(each, self.citystate_standing_short[:, s] * _FX)
        _r, _e, _o, w = self._cv_combat_desire(owner, strength, counted, best, cities, players, 100 + s, queued,
                                              zero, threatened, standing)
        self.citystate_combat_desire[:, s] = torch.where(alive, w, self.citystate_combat_desire[:, s])

    def _minor_standing_short(self, s: int) -> torch.Tensor:
        """[B] `minorStandingArmyShort` — THE STANDING ARMY of minor `s`'s city
        (0x5ca7e0, its full update): its quota, the whole part of
        PSEUDOYIELD_STANDING_ARMY_NUMBER (1.0 at a minor's weight) times the
        square root of its population (float32, as the game's fixed point);
        its combat units outside every running operation fill it (a land
        unit, a sea one where the city is coastal; a recon unit not); the
        count it lacks (CityBuildAI +0x2d8)"""
        B, dev = self.B, self.device
        T = self._cv_tables()
        rows = T["unit_rows"]
        er = T["engine_row"].to(dev)
        centre = self.citystate_center[:, s]
        pop = self.city_pop[:, self._CITY_MINOR0 + s, 0].float()
        root = torch.sqrt(pop)
        fl = torch.floor(root)
        rfx = fl.long() * _FX + torch.trunc((root - fl) * 256).long()
        one = self._cv_pseudo(torch.full((B,), _FX, dtype=torch.long, device=dev), "PSEUDOYIELD_STANDING_ARMY_NUMBER")
        quota = torch.div(_fmul(one, rfx), _FX, rounding_mode="floor")
        coastal = self.coastal_land.gather(1, centre.clamp(min=0).unsqueeze(1)).squeeze(1)
        land = torch.tensor([r["domain"] == "DOMAIN_LAND" for r in rows] + [False], dtype=torch.bool, device=dev)
        sea = torch.tensor([r["domain"] == "DOMAIN_SEA" for r in rows] + [False], dtype=torch.bool, device=dev)
        fights = torch.tensor([not r["civilian"] and not r["recon"]
                               and max(int(r["combat"]), int(r["rangedCombat"]), int(r["bombard"])) > 0 for r in rows] + [False],
                              dtype=torch.bool, device=dev)
        ut = self.major_unit_type.clamp(min=0, max=self.NU - 1)
        ar = er.take(ut)
        ar = torch.where(ar >= 0, ar, torch.full_like(ar, len(rows)))
        own = self.major_unit_alive & (self.major_unit_seat == 100 + s) & ~self._mops_busy(s)
        ok = own & fights.take(ar) & (land.take(ar) | (sea.take(ar) & coastal.unsqueeze(1)))
        short = (quota - ok.sum(dim=1)).clamp(min=0)
        return torch.where(centre >= 0, short, torch.zeros_like(short))

    def _minor_flood_turns(self) -> torch.Tensor:
        """[B, T] `floodHazardTurns` — THE TURNS THE AI EXPECTS TO A FLOOD of
        each plot (0xa2af70 at severity 1, raw fixed point): over the flood
        rivers whose Floodplains list holds the plot and that have their
        name (`_flood_open`), each severity from MAJOR up adds 100 / (N /
        OccurrencesPerGame), and the turns are 100 over the sum; -1.0 (raw
        -256) where no such river is named; raw -1 (none) for a plot no
        flood river's list holds."""
        B, T, dev = self.B, self.T, self.device

        def fx_of(x: float) -> int:
            return (math.floor(x) << 8) | int((x - math.floor(x)) * 256)

        def fx_div(a: int, b: int) -> int:
            q = abs(a) * 256 // abs(b)
            return q if (a >= 0) == (b >= 0) else -q
        per_river = 0
        for occ in self._flood_weight[1:]:
            turns = fx_div(fx_of(self._event_turns), fx_of(occ)) if occ > 0 else -fx_of(1)
            per_river += fx_div(fx_of(100), turns)
        lists = self._flood_lists
        R = lists.shape[1]
        member = torch.zeros(B, R, T + 1, dtype=torch.bool, device=dev)
        member.scatter_(2, torch.where(lists >= 0, lists, T), True)
        member = member[:, :, :T]
        named = (member & self._flood_open().unsqueeze(2)).sum(dim=1)
        tot = named * per_river
        turns = torch.where(tot > 0, torch.div(fx_of(100) * 256, tot.clamp(min=1), rounding_mode="trunc"),
                            torch.full_like(tot, -fx_of(1)))
        return torch.where(member.any(dim=1), turns, torch.full_like(turns, -1))

    def _minor_plot_evals(self, s: int, f: _MinorFacts) -> dict:
        """`minorPlotEvals` — THE PLOT ANALYSIS of minor `s`'s city (0x5ce970
        per plot, the centre first): per plot its flags — the minor owns it,
        an improvement may stand on its ground (research waived) where no
        district stands, a district may stand where the analysis values one,
        an unowned plot beside one of the minor's — and its improvements' and
        districts' values in database order. An improvement the ground does
        not take, a district the plot cannot hold or the city has, one the
        minor's type disfavours (`minorDistrictVerdict`): FX(-9999).
        The centre and a district's plot stand unanalysed (0). T: an
        improvement's the research and civics AIs' turns to its technology
        and civic (the larger), a district's its build turns plus those. The
        hazards' turns (flood, eruption) read none; an inland city-state on a
        river trains ships."""
        B, dev = self.B, self.device
        T = self._cv_tables()
        E = T["engine"]
        cb = self.rules.ai_city_build
        imp_rows, dist_rows = cb["improvements"], cb["districts"]
        NI, ND = len(imp_rows), len(dist_rows)
        row = self._CITY_MINOR0 + s
        seat = 100 + s
        ctr = self.citystate_center[:, s]
        alive = self.citystate_alive[:, s] & (ctr >= 0)
        plots = self._city_plots()[ctr.clamp(min=0)]
        valid = (plots >= 0) & alive.unsqueeze(1)
        plots = torch.where(valid, plots, torch.full_like(plots, -1))
        p0 = plots.clamp(min=0)
        P = plots.shape[1]
        own_t = self.tile_seat == seat
        owned = own_t.gather(1, p0) & valid
        nb = self.neigh[p0]                                                    # [B, P, 6]
        nown = own_t.gather(1, nb.clamp(min=0).reshape(B, -1)).reshape(B, P, -1) & (nb >= 0)
        near = valid & ~owned & nown.any(-1)
        skip = (self.district.gather(1, p0) >= 0) | self._centre_plane().gather(1, p0)
        ev = valid & ~skip
        imps = torch.where(ev.unsqueeze(-1), torch.full((B, P, NI), _FX_MIN, dtype=torch.long, device=dev),
                           torch.zeros(B, P, NI, dtype=torch.long, device=dev))
        dists = torch.where(ev.unsqueeze(-1), torch.full((B, P, ND), _FX_MIN, dtype=torch.long, device=dev),
                            torch.zeros(B, P, ND, dtype=torch.long, device=dev))
        ground = self._minor_ground_imps(s)
        K = ground.shape[2]
        g = ground.gather(1, p0.unsqueeze(-1).expand(-1, -1, K)) & (owned & ev).unsqueeze(-1)
        # a plot holding an improvement takes no other (0x5ce970's +0x54)
        improvable = owned & ev & g.any(-1) & (self.improvement.gather(1, p0) < 0)
        out = {"plot": plots, "valid": valid, "owned": owned, "improvable": improvable, "near_owned": near,
               "imps": imps, "dists": dists}
        if not bool(ev.count_nonzero()):
            out["district_ok"] = torch.zeros_like(valid)
            return out
        hz = int(T["horizon"])
        impT = [torch.maximum(_t(f.tech_turns(r["tech"]), f.like()), _t(f.civic_turns(r["civic"]), f.like())) for r in imp_rows]
        distT = [_t(f.build_turns(r["type"]), f.like()) + torch.maximum(_t(f.tech_turns(r["tech"]), f.like()),
                                                                       _t(f.civic_turns(r["civic"]), f.like()))
                 for r in dist_rows]
        # the districts the analysis values: no civilization's, no centre or
        # wonder, an engine row the city does not hold, the plot taking it
        # (research waived, any owner)
        held = self.city_dist_tile[:, row, 0]
        cand_rows = []
        for i, r in enumerate(dist_rows):
            dv = int(E["district"][i])
            if r["trait"] or r["type"] in ("DISTRICT_CITY_CENTER", "DISTRICT_WONDER") or dv < 0:
                continue
            pl = self._minor_district_plane(s, dv, False, False).gather(1, p0) & ev & (held[:, dv] < 0).unsqueeze(1)
            if bool(pl.count_nonzero()):
                # the minor's type's verdict: a district it disfavours is
                # valued at none of its plots (it stays among the others)
                ok_t = T["minor_dverdict"].to(dev)[self.citystate_type[:, s].clamp(min=0), i] >= 0
                cand_rows.append((i, r["type"], dv, pl, ok_t))
        # each plot's facts, the plots grouped by their improvement,
        # resource and feature
        PN = T["plot_names"]
        imp = self.improvement.gather(1, p0)
        rid = torch.where(self._res_live() & ~self._res_hidden(row), self.res_id, torch.full_like(self.res_id, -1)).gather(1, p0)
        fid = torch.where((self.feat_id >= 0) & ~self.feat_stripped, self.feat_id, torch.full_like(self.feat_id, -1)).gather(1, p0)
        NR = max(len(PN["resourceType"]), 1) + 1
        NF = max(len(PN["feature"]), 1) + 1
        key = ((imp + 1) * NR + (rid + 1)) * NF + (fid + 1)
        key = torch.where(ev, key, torch.full_like(key, -1))
        ctx = _PlotCtx(self, s, f, plots, owned)
        imp_eng = E["improvement"]
        for k in torch.unique(key[ev]).tolist():
            bb, pp = (key == k).nonzero(as_tuple=True)
            ii = int(imp[bb[0], pp[0]])
            ri = int(rid[bb[0], pp[0]])
            fi = int(fid[bb[0], pp[0]])
            pf = _PlotFacts(ctx, bb, pp,
                            PN["improvement"][ii] if ii >= 0 else None,
                            PN["resourceType"][ri] if ri >= 0 else None,
                            PN["feature"][fi] if fi >= 0 else None,
                            [(name, pl[bb, pp]) for (_i, name, _dv, pl, _ok) in cand_rows])
            for i, r in enumerate(imp_rows):
                ke = int(imp_eng[i])
                if ke < 0:
                    continue
                gi = g[bb, pp, ke]
                ti = impT[i][bb]
                # landing at or past the horizon: FX(-9999)
                if not bool(gi.any()) or bool((ti >= hz).all()):
                    continue
                v = self._cv_improvement(pf, r["type"], ti, torch.full_like(bb, hz))
                imps[bb, pp, i] = torch.where(gi, v, torch.full_like(v, _FX_MIN))
            for (i, name, _dv, pl, ok_t) in cand_rows:
                ci = pl[bb, pp] & ok_t[bb]
                ti = distT[i][bb]
                # landing past the horizon: FX(-9999)
                if not bool(ci.any()) or bool((ti > hz).all()):
                    continue
                v = self._cv_district(pf, name, ti, torch.full_like(bb, hz))
                dists[bb, pp, i] = torch.where(ci, v, torch.full_like(v, _FX_MIN))
        out["district_ok"] = ev & ((dists > _FX_MIN) & (dists != 0)).any(-1)
        return out

    # -- the resource value --------------------------------------------------

    def _cv_resource_value(self, s: int, f: _MinorFacts, res: str, count: int, t: torch.Tensor, h: torch.Tensor,
                           bb: torch.Tensor) -> torch.Tensor:
        """`resourceValue` (0x7a21e0) of `count` more of resource `res` to
        minor `s` landing in `t` turns to the horizon `h`, per element of the
        games `bb`: a bonus resource 0; a luxury 0 where the minor holds one
        and `count` is positive, else one Amenity more in its one city (a
        resource that gives one) at least PSEUDOYIELD_RESOURCE_LUXURY, at most
        200.0; a strategic the copies worth taking up to twice the need of the
        minor's unit table, each 25.0 per era chronology step over the need
        (x2 where it has none), discounted to `t` — FX(-9999) where it has
        less than twice the need and none comes, the horizon not cut; at
        most 800.0"""
        T = self._cv_tables()
        R = self._rai_res_tables()
        rate = T["rate"]
        row = T["res"].get(res)
        zero = torch.zeros_like(t)
        ri = T["engine"]["resource"].get(res, -1)
        if row is None or ri < 0:
            return zero
        seat = 100 + s
        mine_t = (self.tile_seat == seat) & self._res_extracting() & (self.res_id == ri)
        have = mine_t.sum(dim=1).take(bb)
        cls = row["class"]
        if cls == "RESOURCECLASS_LUXURY":
            lux = self._cv_pseudo(torch.full_like(t, _FX), "PSEUDOYIELD_RESOURCE_LUXURY", 0)
            floor = _between(lux, t, h, rate)
            e = zero
            if int(R["happy"][ri]) > 0:
                bal, ys = f.amenity()
                a = self._cv_amenity_per_turn(f, _t(bal, f.like()), ys)
                e = _between(a.take(bb), t, h, rate)
            v = torch.maximum(e, floor)
            if count > 0:
                v = torch.where(have > 0, zero, v)
            return v.clamp(max=200 * _FX)
        if cls != "RESOURCECLASS_STRATEGIC":
            return zero
        B = self.B
        dev = self.device
        techs, civs = self.citystate_techs[:, s], self.citystate_civics[:, s]
        need = torch.zeros(B, dtype=torch.long, device=dev)
        used = torch.zeros(B, dtype=torch.bool, device=dev)
        if R["n_ent"]:
            obs = ((techs.unsqueeze(1) & R["e_obs_t"].unsqueeze(0)).any(dim=2)
                   | (civs.unsqueeze(1) & R["e_obs_c"].unsqueeze(0)).any(dim=2))
            mineu = self.major_unit_alive & (self.major_unit_seat == seat)
            ut = self.major_unit_type.clamp(min=0, max=self.NU - 1)
            own_t = torch.zeros(B, self.NU, dtype=torch.long, device=dev)
            own_t.scatter_add_(1, ut, mineu.long())
            owned = (own_t.unsqueeze(1) * R["e_eng"].unsqueeze(0).long()).sum(dim=2)
            intab = R["e_ver"].unsqueeze(0) & (~obs | (owned > 0)) & (R["e_res"] == ri).unsqueeze(0)
            need = torch.where(intab, R["e_need"].unsqueeze(0), torch.zeros_like(owned)).max(dim=1).values
            used = intab.any(dim=1)
        nd, us = need.take(bb), used.take(bb)
        late = (t != h) & (h != 0)
        n = torch.full_like(t, count)
        short = (have < 2 * nd) & ~late & (n <= 0)
        if count > 0:
            n = torch.clamp(torch.minimum(n, 2 * nd - have), min=0)
        chrono = (f.era() + 1).take(bb)
        w = chrono * _fx_const(25.0)
        w = torch.where(nd > 0, torch.div(w * _FX, (nd * _FX).clamp(min=1), rounding_mode="trunc"), w)
        w = torch.where(have == 0, _fmul(w, torch.full_like(w, 2 * _FX)), w)
        w = torch.where((have > nd) & (n + have < nd), _fmul(w, torch.full_like(w, _fx_const(1.5))), w)
        v = _fmul(_discounted(w, rate, t), n * _FX)
        v = torch.where(us & ~short, v, torch.where(short, torch.full_like(v, _FX_MIN), zero))
        return v.clamp(max=800 * _FX)

    # -- the purchases ---------------------------------------------------------

    def _minor_purchase_rows(self, s: int, f: _MinorFacts) -> tuple[torch.Tensor, torch.Tensor]:
        """the minor's unit list (CityBuildAI +0x650: the military AI's unit
        production table copied to the city, 0x79a320) in 0x79d3a0's order —
        the buildable first, then by the at-war players' sums, every
        player's sums and the strength, each the larger first (equal entries
        in database order): [B, R] the AI unit rows, [B, R] the entries"""
        T = self._cv_tables()
        rows = T["unit_rows"]
        E = T["engine"]
        B, dev = self.B, self.device
        nu = len(rows)
        _v, entry = f._production_table()
        obs = f._obsolete()
        known = self._cv_known(s)
        # the known units' counts by owner at war with the minor
        slot = self.citystate_kb_slot[:, s]
        typ = self.citystate_kb_type[:, s].long()
        owner = self.citystate_kb_owner[:, s].long()
        er = T["engine_row"].to(dev)
        arow = torch.where(typ >= 0, er.take(typ.clamp(min=0, max=er.numel() - 1)), torch.full_like(typ, -1))
        row = self._CITY_MINOR0 + s
        orow = self._seat_row.take(owner.clamp(min=0, max=self._seat_row.numel() - 1))
        atwar = (owner >= 0) & self.war[:, row].gather(1, orow)
        live = (slot != -2) & (arow >= 0) & atwar
        war_n = torch.zeros(B, nu + 1, dtype=torch.long, device=dev)
        war_n.scatter_add_(1, torch.where(live, arow, torch.full_like(arow, nu)), live.long())
        war_n = war_n[:, :nu]
        combat = torch.tensor([r["combat"] != 0 and (not r["pseudo"] or r["pseudo"] in
                                                     ("PSEUDOYIELD_UNIT_COMBAT", "PSEUDOYIELD_UNIT_NAVAL_COMBAT",
                                                      "PSEUDOYIELD_UNIT_AIR_COMBAT")) for r in rows],
                              dtype=torch.bool, device=dev)
        opp = combat & ~obs & (known > 0)
        n_all = torch.where(opp, known, torch.zeros_like(known))
        n_war = torch.where(opp, war_n, torch.zeros_like(war_n))
        # an entry's sums read the table the other way from the value's (the
        # entry's row against the opposing unit's column)
        eff_t = T["eff"].to(dev).t()                              # [opposing, entry]
        all_s = n_all @ eff_t
        war_s = n_war @ eff_t
        have_t, have_c = self.citystate_techs[:, s], self.citystate_civics[:, s]
        buildable = torch.ones(B, nu, dtype=torch.bool, device=dev)
        for k, r in enumerate(rows):
            for nm in (r["tech"], r["civic"]):
                if not nm:
                    continue
                ti = E["tech"].get(nm, -1)
                ci = E["civic"].get(nm, -1)
                hold = (have_t[:, ti] if ti >= 0 else torch.zeros(B, dtype=torch.bool, device=dev)) | \
                       (have_c[:, ci] if ci >= 0 else torch.zeros(B, dtype=torch.bool, device=dev))
                buildable[:, k] &= hold
        strength = torch.tensor([max(int(r["combat"]), int(r["rangedCombat"])) for r in rows], dtype=torch.long,
                                device=dev).unsqueeze(0).expand(B, -1)
        order = torch.arange(nu, device=dev).unsqueeze(0).expand(B, -1)
        for keyv in (strength, all_s, war_s, buildable.long(), entry.long()):
            kk = keyv.gather(1, order)
            idx = torch.sort(kk, dim=1, descending=True, stable=True).indices
            order = order.gather(1, idx)
        return order, entry.gather(1, order)

    def _minor_purchases(self, s: int, f: _MinorFacts, threat: torch.Tensor, act: torch.Tensor) -> None:
        """the purchases (`purchaseTurn`, 0x5ce5b0's tail): where `act` (a
        threatened city) the first unit of the list the minor may train and
        need not buy (0x5d2810), bought while TryPurchaseUnits (0x68be60)
        succeeds on its savings or, threatened, its balance — the Gold price
        a minor pays, the game letting the purchase through where the centre
        or a plot beside it takes a unit; the minor's treasury pays where it
        covers the price (`minorBuyUnit`)"""
        T = self._cv_tables()
        E = T["engine"]
        rows = T["unit_rows"]
        dev = self.device
        order, entry = self._minor_purchase_rows(s, f)
        eu = torch.tensor(E["unit"] or [-1], dtype=torch.long, device=dev)
        must = torch.tensor([bool(r["mustPurchase"]) for r in rows], dtype=torch.bool, device=dev)
        go = act.clone()
        seat = 100 + s
        ctr = self.citystate_center[:, s].clamp(min=0)
        warrior = self._warrior_idx if getattr(self, "_warrior_idx", -1) >= 0 else 0
        for _ in range(64):
            if not bool(go.count_nonzero()):
                return
            pick = torch.full_like(threat, -1)
            for c in range(order.shape[1]):
                k = order[:, c]
                ui = eu.take(k)
                cand = go & (pick < 0) & entry[:, c] & (ui >= 0) & ~must.take(k)
                if not bool(cand.count_nonzero()):
                    continue
                cand = cand & self._minor_can_train(s, ui)
                pick = torch.where(cand, ui, pick)
            go = go & (pick >= 0)
            if not bool(go.count_nonzero()):
                return
            price = self._minor_gold_price(s, pick)
            found, _spot = self._first_free_spot(ctr, seat, civ_mask=torch.zeros_like(go), naval_mask=torch.zeros_like(go),
                                                 utype=torch.full_like(pick, warrior))
            sav, bal, bought = self._cv_try_purchase(self.citystate_savings[:, s], self.citystate_balance[:, s],
                                                     price.long(), threat, found)
            bought = bought & go
            self.citystate_savings[:, s] = torch.where(bought.unsqueeze(1), sav, self.citystate_savings[:, s])
            self.citystate_balance[:, s] = torch.where(bought, bal, self.citystate_balance[:, s])
            self._minor_buy_unit(s, bought, pick, price)
            go = bought

    def _minor_gold_price(self, s: int, ui: torch.Tensor) -> torch.Tensor:
        """[B] f64 — `minorUnitPrice` in Gold: the unit's Production cost (a
        Builder's and a Trader's climbing) times the purchase multiplier,
        floored to the purchase step"""
        row = self._CITY_MINOR0 + s
        u0 = ui.clamp(min=0, max=self.NU - 1)
        cost = self._type_cost.take(u0).double()
        if self._builder_idx >= 0:
            cost = torch.where(u0 == self._builder_idx, self._builder_cost(self.citystate_builders_trained[:, s]).double(), cost)
        if self._trader_idx >= 0 and bool((u0 == self._trader_idx).any()):
            cost = torch.where(u0 == self._trader_idx, self._trader_cost(row).double(), cost)
        return self._purchase_step(cost * float(self.rules.gold_purchase_mult))

    def _minor_buy_unit(self, s: int, mask: torch.Tensor, ui: torch.Tensor, price: torch.Tensor) -> torch.Tensor:
        """`minorBuyUnit` in Gold where `mask`: the treasury covers the price,
        the unit stands on or beside the centre with the city's training
        grants (none bought with no free tile), the treasury pays; [B] the
        games where it landed"""
        go = mask & self._afford(self.citystate_treasury[:, s], price)
        if not bool(go.count_nonzero()):
            return go
        landed = self._minor_spawn(s, go, ui)
        self.citystate_treasury[:, s] -= torch.where(landed, price, torch.zeros_like(price))
        return landed

    # -- the trees' orders -----------------------------------------------------

    def _minor_lump(self, s: int, mask: torch.Tensor, ykey: int, amount: torch.Tensor) -> None:
        """`minorLump` and `applyLumpYield` for minor `s` where `mask`: Gold
        and Faith to its purse, Science and Culture to its research, Food to
        its city's box (a full box grows it), Production to the item in hand —
        completing it at its price, the rest stored as a step's overflow — or
        to the store with nothing in hand; a district's progress waits for
        the step"""
        if not bool(mask.count_nonzero()):
            return
        # the facts' memos of the build turns read the progress
        self._mi_ver = getattr(self, "_mi_ver", 0) + 1
        row = self._CITY_MINOR0 + s
        amt = torch.where(mask, amount.double(), torch.zeros_like(amount, dtype=torch.float64))
        if ykey == 2:
            self.citystate_treasury[:, s] += amt
            return
        if ykey == 5:
            self.citystate_faith[:, s] += amt
            return
        if ykey == 3:
            self.citystate_tech_prog[:, s] += amt.to(self.citystate_tech_prog.dtype)
            return
        if ykey == 4:
            self.citystate_civic_prog[:, s] += amt.to(self.citystate_civic_prog.dtype)
            return
        if ykey == 0:
            for b in mask.nonzero(as_tuple=True)[0].tolist():
                self._lump_food(b, row, 0, float(amt[b]))
            return
        key = self.citystate_item[:, s]
        none = mask & (key < 0)
        self.citystate_ovf[:, s] += torch.where(none, amt, torch.zeros_like(amt))
        has = mask & (key >= 0)
        if not bool(has.count_nonzero()):
            return
        before = self.citystate_prod[:, s].clone()
        self.citystate_prod[:, s] = torch.where(has, before + amt, before)
        _u, _b, is_d, _p, _r = self._mk_kinds(key)
        chk = has & ~is_d
        if not bool(chk.count_nonzero()):
            return
        cost = self._minor_item_cost(s, key)
        done = chk & (self.citystate_prod[:, s] >= cost)
        if not bool(done.count_nonzero()):
            return
        fin = self._minor_finish(s, done, key)
        self.citystate_ovf[:, s] += torch.where(fin, (before + amt - cost).clamp(min=0), torch.zeros_like(amt))

    def _minor_clear(self, s: int, mask: torch.Tensor, g: torch.Tensor, plot: torch.Tensor) -> None:
        """CLEAR PLOT's order carried out by the minor's Builder in global
        slot `g` on its plot where `mask`: a feature it may remove goes
        (`builderRemoveFeature`: its Feature_Removes rows as lumps where the
        minor owns the plot, the Lumber Mill on it with it, the Deforestation
        Treaty's Gold), else a resource it may harvest (`builderHarvest`: the
        harvest's lump where it owns the plot and its research unlocks the
        resource's improvement); a charge and the turn spent"""
        row = self._CITY_MINOR0 + s
        seat = 100 + s
        bidx = self._bidx
        pc = plot.clamp(min=0)
        fid = self.feat_id[bidx, pc]
        live_f = (fid >= 0) & ~self.feat_stripped[bidx, pc]
        ftr = self.tile_ftr[bidx, pc]
        ftu = self.tile_ftu[bidx, pc]
        researched = (ftu >= 0) & self.citystate_techs[:, s].gather(1, ftu.clamp(min=0).unsqueeze(1)).squeeze(1)
        ban = self._congress_chop(fid)[0]
        chop = mask & live_f & (ftr > 0) & researched & ~ban
        mine = self.tile_seat[bidx, pc] == seat
        if bool(chop.count_nonzero()):
            cr = chop.nonzero(as_tuple=True)[0]
            ct = pc[cr]
            rows_c = self._chop_rows[ftr[cr]]
            food = torch.zeros(self.B, dtype=torch.float64, device=self.device)
            prod = torch.zeros_like(food)
            food[cr] = self._lump_value(row, rows_c[:, 0], cr, ct).double()
            prod[cr] = self._lump_value(row, rows_c[:, 1], cr, ct).double()
            gold = self._congress_chop(fid)[1] & chop
            self._strip_feature_at(cr, ct)
            if self.LUMBER >= 0:
                was = self.improvement[cr, ct] == self.LUMBER
                self.improvement[cr, ct] = torch.where(was, torch.full_like(self.improvement[cr, ct], -1), self.improvement[cr, ct])
            pay = chop & mine
            self._minor_lump(s, pay & (food > 0), 0, food)
            self._minor_lump(s, pay & (prod > 0), 1, prod)
            self._minor_lump(s, gold, 2, food + prod)
            self._spend_build_charge(cr, g, pc)
            self._eff_version += 1
        rest = mask & ~chop
        rid = self.res_id[bidx, pc]
        live_r = self._res_live()[bidx, pc]
        nres = int(self._res_harvest_y.numel())
        rc = rid.clamp(min=0, max=max(nres - 1, 0))
        hy = torch.where(rid >= 0, self._res_harvest_y.take(rc), torch.full_like(rid, -1))
        hamt = torch.where(rid >= 0, self._res_harvest_amt.take(rc), torch.zeros_like(rid))
        himp = torch.where(rid >= 0, self._res_harvest_imp.take(rc), torch.full_like(rid, -1))
        hi = himp.clamp(min=0)
        it = self._imp_unlock.take(hi)
        ic = torch.tensor(self._imp_unlock_civic, dtype=torch.long, device=self.device).take(hi)
        unl = (himp >= 0) & ((it < 0) | self.citystate_techs[:, s].gather(1, it.clamp(min=0).unsqueeze(1)).squeeze(1)) \
            & ((ic < 0) | self.citystate_civics[:, s].gather(1, ic.clamp(min=0).unsqueeze(1)).squeeze(1))
        hv = rest & live_r & (hy >= 0) & mine & unl
        if bool(hv.count_nonzero()):
            hr = hv.nonzero(as_tuple=True)[0]
            ht = pc[hr]
            amt = torch.zeros(self.B, dtype=torch.float64, device=self.device)
            amt[hr] = self._lump_value(row, hamt[hr], hr, ht).double()
            self._drop_resource(hr, ht)
            for k in sorted(set(hy[hr].tolist())):
                self._minor_lump(s, hv & (hy == k), int(k), amt)
            self._spend_build_charge(hr, g, pc)
            self._eff_version += 1

    # -- the Free Cities -------------------------------------------------------

    def _free_city_build(self, j: int, act: torch.Tensor, prod: torch.Tensor) -> None:
        """`freeCityBuild` for the Free City in column `j`, in the games of
        `act`: the step pays the turn's Production (`prod`) and the bank
        (`city_prod_bank`) into the item in hand (the queue's head); it
        completes when its progress covers its price — a unit on or beside
        the centre (with no free tile it waits), a building raised (walls at
        full), the walls' repair at the HP it puts back — leaving the bank the
        Production less what it lacked; with nothing in hand the Production
        banks. Then, on an empty queue, the Default Specialization over the
        city's tables (`_FreeFacts`) queues its pick."""
        from .sim_cityvalue import _FreeFacts
        B, dev = self.B, self.device
        row = self.FREE_ROW
        rd = self.rules_dev
        jc = torch.full((B,), j, dtype=torch.long, device=dev)
        bidx = self._bidx
        cur = self.city_current[:, row, j, 0]
        bank = self.city_prod_bank[:, row, j].double().clone()
        none = act & (cur < 0)
        self.city_prod_bank[:, row, j] = torch.where(none, (bank + prod).to(self.city_prod_bank.dtype),
                                                     self.city_prod_bank[:, row, j])
        has = act & (cur >= 0)
        if bool(has.count_nonzero()):
            before = self.city_progress[:, row, j, 0].double().clone()
            prog = before + prod + bank
            self.city_progress[:, row, j, 0] = torch.where(has, prog.to(self.city_progress.dtype), self.city_progress[:, row, j, 0])
            self.city_prod_bank[:, row, j] = torch.where(has, torch.zeros_like(self.city_prod_bank[:, row, j]),
                                                         self.city_prod_bank[:, row, j])
            is_b = (cur >= 0) & (cur < self.NB)
            is_u = (cur >= self.UNIT_BASE) & (cur < self.UNIT_BASE + self.NU)
            is_p = (cur >= self.PROJECT_BASE) & (cur < self.FORM_BASE)
            bi = cur.clamp(min=0, max=self.NB - 1)
            cost = torch.where(is_b, rd.b_cost.to(torch.float64).take(bi), self.city_cost[:, row, j, 0].double())
            if bool((has & is_p).any()):
                cost = torch.where(is_p, self._free_repair(j)[1], cost)
            cost = torch.where(is_b | is_u | is_p, cost, torch.full_like(cost, float("inf")))
            done = has & (prog >= cost)
            fin = torch.zeros_like(done)
            m = done & is_u
            if bool(m.count_nonzero()):
                ctr = self.city_center[:, row, j].clamp(min=0)
                ui = (cur - self.UNIT_BASE).clamp(min=0, max=self.NU - 1)
                fin = fin | self._spawn_barb(m, ctr, ui, seat=FREE_SEAT, home=torch.full((B,), -1, dtype=torch.long, device=dev))
            m = done & is_b
            if bool(m.count_nonzero()):
                rr = m.nonzero(as_tuple=True)[0]
                self.city_bldg[rr, row, j, bi[rr]] = True
                wl = m & (rd.b_walls.to(dev).take(bi) > 0)
                if bool(wl.count_nonzero()):
                    ww = wl.nonzero(as_tuple=True)[0]
                    full = self._free_walls_max(j)
                    self.city_outer_hp[ww, row, j] = full[ww].to(self.city_outer_hp.dtype)
                    self._fit_encamp_outer(ww, row, jc[ww], full[ww])
                self._bldg_version += 1
                self._eff_version += 1
                fin = fin | m
            m = done & is_p
            if bool(m.count_nonzero()):
                rp = m & ((cur - self.PROJECT_BASE) == self._repair_proj_idx)
                if bool(rp.count_nonzero()):
                    ww = rp.nonzero(as_tuple=True)[0]
                    full = self._free_walls_max(j)
                    self.city_outer_hp[ww, row, j] = full[ww].to(self.city_outer_hp.dtype)
                    self._fit_encamp_outer(ww, row, jc[ww], full[ww])
                fin = fin | m
            if bool(fin.count_nonzero()):
                self._q_pop(row, jc, fin)
                left = (prod - (cost - before).clamp(min=0)).clamp(min=0)
                self.city_prod_bank[:, row, j] = torch.where(fin, left.to(self.city_prod_bank.dtype), self.city_prod_bank[:, row, j])
        idle = act & (self.city_current[:, row, j, 0] < 0)
        if not bool(idle.count_nonzero()):
            return
        f = _FreeFacts(self, j)
        b_tab = self._cv_building_table(f)
        u_tab = [torch.where(read, v, torch.full_like(v, _FX_MIN)) for v, read in self._cv_unit_table(f)]
        p_tab = self._cv_project_table(f)
        kind, prow, _val = self._cv_pick(b_tab, u_tab, p_tab, f)
        code, cost = f.queue_item(kind, prow)
        go = idle & (code >= 0)
        if bool(go.count_nonzero()):
            self._q_push(row, jc, go, code, cost)
        _ = bidx


class _PlotCtx:
    """the planes the plot facts of one minor's analysis share"""

    def __init__(self, sim, s: int, f: _MinorFacts, plots: torch.Tensor, owned: torch.Tensor):
        self.sim, self.s, self.f = sim, s, f
        self.row = sim._CITY_MINOR0 + s
        self.seat = 100 + s
        self.plots = plots
        self._memo = {}

    def get(self, key, fn):
        if key not in self._memo:
            self._memo[key] = fn()
        return self._memo[key]

    def beside_housing(self) -> torch.Tensor:
        """[B, T] a plot beside a district (complete or not; a city centre)
        whose row gives Housing"""
        def build():
            sim = self.sim
            dh = torch.tensor([int(d["housing"]) > 0 for d in sim.districts_cat] or [False], dtype=torch.bool, device=sim.device)
            has = (sim.district >= 0) & dh.take(sim.district.clamp(min=0))
            if int(sim.rules.ai_city_build["centreHousing"]) > 0:
                has = has | sim._centre_plane()
            nb = sim.neigh
            return (has[:, nb.clamp(min=0)] & (nb >= 0).unsqueeze(0)).any(dim=2)
        return self.get("beside", build)

    def purchase_cost(self) -> torch.Tensor:
        """[B, T] a plot's purchase price for the minor's city: 0 owned by
        anyone, the plot's price where it borders the minor's
        (`borderCandidates`: the analysed plots lie within three of the
        centre, inside BORDER_MAX_RADIUS), else -1"""
        def build():
            sim = self.sim
            s = self.s
            ctr = sim.citystate_center[:, s].clamp(min=0)
            ring = sim.pair_dist[ctr].long()                                  # [B, T]
            own = sim.tile_seat == self.seat
            nb = sim.neigh
            beside = (own[:, nb.clamp(min=0)] & (nb >= 0).unsqueeze(0)).any(dim=2)
            cand = (sim.tile_seat < 0) & beside
            pct = sim._progress_pct_of(sim.citystate_techs[:, s].sum(dim=1), sim.citystate_civics[:, s].sum(dim=1))
            price = sim._plot_price(ring, pct.unsqueeze(1).expand_as(ring))
            return torch.where(sim.tile_seat >= 0, torch.zeros_like(price), torch.where(cand, price, torch.full_like(price, -1)))
        return self.get("price", build)


class _PlotFacts:
    """A group of plots of one minor's analysis sharing their improvement,
    resource and feature, as the improvement and district values read them
    (`PlotValueFacts`, `DistrictValueFacts`): per element the game `bb`
    and the plot"""

    def __init__(self, ctx: _PlotCtx, bb: torch.Tensor, pp: torch.Tensor, imp, res, feat, cand: list):
        self.ctx = ctx
        self.sim, self.s, self.mf = ctx.sim, ctx.s, ctx.f
        self.bb = bb
        self.tiles = ctx.plots[bb, pp]
        self._imp, self._res, self._feat = imp, res, feat
        self._cand = cand
        # a district's rows value, once per plot group (`_cv_rows_value`)
        self.rows_memo = {}

    def _at(self, x):
        """a [B] fact at the elements' games, or a number as is"""
        return x.take(self.bb) if torch.is_tensor(x) else x

    def like(self):
        return torch.zeros(self.bb.shape[0], dtype=torch.long, device=self.sim.device)

    def yield_w(self, y):
        return 0

    def pseudo_w(self, p):
        return self._at(self.mf.pseudo_w(p))

    def plot_improvement(self):
        return self._imp

    def resource(self):
        return self._res

    def feature(self):
        return self._feat

    def plot_pillaged(self):
        return self.sim.pillaged[self.bb, self.tiles].long()

    def flood_turns(self):
        return self.ctx.get("flood", self.sim._minor_flood_turns)[self.bb, self.tiles]

    def eruption_turns(self):
        return -1

    def appeal(self):
        return self.sim._tile_appeal()[self.bb, self.tiles].long()

    def beside_housing(self):
        return self.ctx.beside_housing()[self.bb, self.tiles].long()

    def unit_cost(self, u):
        return self._at(_t(self.mf.unit_cost(u), self.mf.like()))

    def builds_unit(self, u):
        return int(self.mf.unit_version(u) == u)

    def extra_charges(self, u):
        return 0

    def progress_pct(self):
        return self._at(self.mf.progress_pct())

    def escalation(self):
        return int(self.sim.rules.lump["escalation"])

    def speed_scaled(self, n):
        sp = int(self.sim.rules.progress["speedPct"])
        return torch.div(n * sp, 100, rounding_mode="floor")

    def adjacency(self, imp, y):
        sim = self.sim
        T = sim._cv_tables()
        names = [r["type"] for r in sim.rules.ai_city_build["improvements"]]
        if imp not in names:
            return 0
        k = int(T["engine"]["improvement"][names.index(imp)])
        if k < 0:
            return 0
        plane = self.ctx.get(("adj", k), lambda: sim._imp_adj_at(self.ctx.row, k))
        return plane[self.bb, self.tiles, _YIELDS.index(y)].long()

    def housing_value(self, housing, t, h):
        sim = self.sim
        g = self.mf.growth()
        fc = self.mf._get("fc", lambda: sim._cv_forecast(g))
        gn = {k: v.take(self.bb) for k, v in g.items()}
        fcn = tuple(x[self.bb] for x in fc)
        return sim._cv_housing_value(gn, fcn, housing, t, h)

    def resource_value(self, res, count, t, h):
        return self.sim._cv_resource_value(self.s, self.mf, res, count, t, h, self.bb)

    # the district value's facts
    def owned(self):
        return (self.sim.tile_seat[self.bb, self.tiles] >= 0).long()

    def purchase_cost(self):
        return self.ctx.purchase_cost()[self.bb, self.tiles]

    def lake(self):
        lt = int(self.sim.rules.ai_city_build["lakeTerrain"])
        return (self.sim.terrain[self.bb, self.tiles] == lt).long()

    def keeps_feature(self, d):
        if not self._feat:
            return False
        row = self.sim._cv_tables()["feat"].get(self._feat)
        return not (row and row["removable"])

    def plot_district(self):
        return None

    def plot_district_pillaged(self):
        return 0

    def is_city(self):
        return 0

    def district_adjacency(self, d, y):
        sim = self.sim
        T = sim._cv_tables()
        names = [r["type"] for r in sim.rules.ai_city_build["districts"]]
        if d not in names:
            return 0
        dv = int(T["engine"]["district"][names.index(d)])
        if dv < 0 or int(sim.districts_cat[dv]["adjYield"]) != _YIELDS.index(y):
            return 0
        plane = self.ctx.get(("dadj", dv), lambda: sim._district_adj_base(self.ctx.row, dv))
        return plane[self.bb, self.tiles].long()

    def rows_adjacency(self, d, y):
        return self.district_adjacency(d, y)

    def other_districts(self, d):
        return [(name, m) for name, m in self._cand if name != d]

    def chronology(self):
        return self._at(self.mf.era()) + 1

    def district_count(self):
        sim = self.sim
        row = self.ctx.row
        return self._at(((sim.city_dist_tile[:, row, 0] >= 0) & sim._is_specialty).sum(dim=1))

    def district_cap(self):
        sim = self.sim
        return self._at(1 + torch.div(sim.city_pop[:, self.ctx.row, 0].long() - 1, 3, rounding_mode="floor"))

    def _trains(self, dom):
        sim = self.sim
        t = _t(self.mf.trains_domain(dom), self.mf.like()).bool()
        if dom == "DOMAIN_SEA":
            ctr = sim.citystate_center[:, self.s].clamp(min=0)
            t = t | sim.tile_river.gather(1, ctr.unsqueeze(1)).squeeze(1)
        return self._at(t)

    def city_trains(self, dom):
        return self._trains(dom)

    def player_trains(self, dom):
        return self._trains(dom)

    def domain_units_value(self, dom):
        return 0

    def regional_cities(self, d, r):
        return 0

    def river_plots(self):
        return 0, 0

    def canal_trade(self):
        return 0

    def project_value(self, p, t, h):
        return torch.zeros_like(t)

    def space_race(self, p):
        return False

    def favoured(self, p):
        return False

    def districts_of(self, d, flag):
        sim = self.sim
        names = [r["type"] for r in sim.rules.ai_city_build["districts"]]
        if d not in names:
            return 0
        dv = int(sim._cv_tables()["engine"]["district"][names.index(d)])
        if dv < 0:
            return 0
        n = ((sim.district == dv) & (sim.tile_seat == self.ctx.seat)).sum(dim=1)
        return self._at(n)


class _MinorWorld:
    """The minor's world as its contracts, events and trees read it and act
    on it (`TreeWorld`, `minorTreeCity` and `minorTreeWorld`): a unit's id is
    its slot in the majors' pool"""

    def __init__(self, sim, s: int, f: _MinorFacts, tables, evals: dict, threat: torch.Tensor):
        self.sim, self.s, self.f = sim, s, f
        self.seat = 100 + s
        self.row = sim._CITY_MINOR0 + s
        b, u, _p = tables
        self._bt = torch.stack(b, dim=1)
        self._ut = torch.stack(u, dim=1)
        self._evals = evals
        self._threat = threat
        # the units whose last charge an order took ([B] ids per order, -1 none)
        self._spent: list = []
        T = sim._cv_tables()
        self.T = T
        self.E = T["engine"]
        dev = sim.device
        self._eb = torch.tensor(self.E["building"] or [-1], dtype=torch.long, device=dev)
        self._eu = torch.tensor(self.E["unit"] or [-1], dtype=torch.long, device=dev)
        self._ed = torch.tensor(self.E["district"] or [-1], dtype=torch.long, device=dev)
        self._ei = torch.tensor(self.E["improvement"] or [-1], dtype=torch.long, device=dev)
        self._b_names = [r["type"] for r in T["bld_rows"]]
        self._d_names = [r["type"] for r in sim.rules.ai_city_build["districts"]]
        self._ground = None
        self._ground_ver = None

    def _rows_apply(self, rows: torch.Tensor, fn) -> torch.Tensor:
        """`fn(r)` -> [B] bool per distinct row value `r` of `rows` ([B, ...])"""
        B = self.sim.B
        flat = rows.reshape(B, -1)
        out = torch.zeros_like(flat, dtype=torch.bool)
        for r in sorted(set(flat.reshape(-1).tolist())):
            if r < 0:
                continue
            m = flat == r
            out = out | (m & fn(int(r)).unsqueeze(1))
        return out.reshape(rows.shape)

    # the city
    def home_city(self):
        return -1

    def city_alive(self):
        return self.sim.citystate_alive[:, self.s]

    def city_plot(self):
        return self.sim.citystate_center[:, self.s]

    def under_threat(self):
        return self._threat > -1

    def _current_rows(self):
        sim = self.sim
        key = sim.citystate_item[:, self.s]
        is_u, is_b, is_d, _p, _r = sim._mk_kinds(key)
        T = self.T
        er = T["engine_row"].to(sim.device)
        u = torch.where(is_u, er.take(key.clamp(min=0, max=er.numel() - 1)), torch.full_like(key, -1))
        br = T["building_row"].to(sim.device)
        b = torch.where(is_b, br.take((key - sim._mk_b0).clamp(min=0, max=br.numel() - 1)), torch.full_like(key, -1))
        dr = T["district_row"].to(sim.device)
        d = torch.where(is_d, dr.take((key - sim._mk_d0).clamp(min=0, max=dr.numel() - 1)), torch.full_like(key, -1))
        return u, b, d

    def cur_unit(self):
        return self._current_rows()[0]

    def cur_building(self):
        return self._current_rows()[1]

    def cur_district(self):
        return self._current_rows()[2]

    def production_turn(self):
        return self.sim.citystate_prod_set_turn[:, self.s]

    def current_value(self):
        return self.sim.citystate_prod_set_value[:, self.s]

    def building_blocked(self, row):
        sim = self.sim

        def one(r):
            bi = int(self.E["building"][r])
            if bi < 0:
                return torch.ones(sim.B, dtype=torch.bool, device=sim.device)
            return sim.city_bldg[:, self.row, 0, bi]
        return self._rows_apply(row, one) | (row < 0)

    def district_blocked(self, row, plot):
        sim = self.sim

        def one(r):
            dv = int(self.E["district"][r])
            if dv < 0:
                return torch.ones(sim.B, dtype=torch.bool, device=sim.device)
            return ((sim.district == dv) & sim.district_complete & (sim.tile_seat == self.seat)).any(dim=1)
        return self._rows_apply(row, one) | (row < 0)

    def can_train(self, row):
        sim = self.sim
        r0 = row.clamp(min=0)
        ui = self._eu.take(r0.reshape(-1)).reshape(row.shape)
        if ui.dim() == 1:
            return (row >= 0) & (ui >= 0) & sim._minor_can_train(self.s, ui)
        return self._rows_apply(row, lambda r: sim._minor_can_train(self.s, torch.full((sim.B,), int(self.E["unit"][r]), dtype=torch.long, device=sim.device)))

    def trains_sea(self):
        return _t(self.f.trains_domain("DOMAIN_SEA"), self.f.like()).bool()

    def build_turns(self, unit, bld, dist):
        sim = self.sim
        out = torch.full_like(unit, 500)
        T = self.T
        for kind, rows, names in (("u", unit, [r["type"] for r in T["unit_rows"]]), ("b", bld, self._b_names),
                                  ("d", dist, self._d_names)):
            for r in sorted(set(rows.tolist())):
                if r < 0:
                    continue
                m = rows == r
                if kind != "u":
                    m = m & (unit < 0)
                if kind == "d":
                    m = m & (bld < 0)
                out = torch.where(m, _t(self.f.build_turns(names[r]), self.f.like()), out)
        _ = sim
        return out

    def item_value(self, unit, bld, dist, plot):
        u = torch.where(unit >= 0, self._ut.gather(1, unit.clamp(min=0).unsqueeze(1)).squeeze(1), _FX_MIN)
        b = torch.where(bld >= 0, self._bt.gather(1, bld.clamp(min=0).unsqueeze(1)).squeeze(1), _FX_MIN)
        return torch.where(unit >= 0, u, b)

    def building_held(self, row):
        names = self._b_names
        return self._rows_apply(row, lambda r: _t(self.f.building_held(names[r]), self.f.like()).bool())

    def district_held(self, row):
        names = self._d_names
        return self._rows_apply(row, lambda r: _t(self.f.has_district(names[r]), self.f.like()).bool())

    def threat(self):
        return self._threat

    def event_building(self):
        """0x5d0860 with neither the checks nor the defensive filter: the best
        building not held or in hand whose prerequisite building and district
        stand, FX(-9999) none"""
        f = self.f
        like = f.like()
        idx = torch.full_like(like, -1)
        val = torch.full_like(like, _FX_MIN)
        for k, b in enumerate(self.T["bld_rows"]):
            ok = ~_t(f.building_held(b["type"]), like).bool()
            if b["district"]:
                ok = ok & _t(f.has_district(b["district"]), like).bool()
            if b["prereqs"]:
                anyp = torch.zeros_like(ok)
                for p in b["prereqs"]:
                    anyp = anyp | _t(f.has_building(p), like).bool()
                ok = ok & anyp
            v = self._bt[:, k]
            take = ok & (v > val)
            val = torch.where(take, v, val)
            idx = torch.where(take, k, idx)
        return idx, val

    def event_unit(self):
        """0x5d2600 unchecked, defensive: the best combat unit with no
        FoundCity, no build charges, no CLASS_RECON, FX(-9999) none"""
        like = self.f.like()
        idx = torch.full_like(like, -1)
        val = torch.full_like(like, _FX_MIN)
        for k, u in enumerate(self.T["unit_rows"]):
            if u["foundCity"] or u["buildCharges"] > 0 or u["combat"] == 0 or u["recon"]:
                continue
            v = self._ut[:, k]
            take = v > val
            val = torch.where(take, v, val)
            idx = torch.where(take, k, idx)
        return idx, val

    def evals(self):
        return self._evals

    def tables(self):
        return self._bt, self._ut

    # the seat
    def tech_held(self, code):
        t = self.sim.citystate_techs[:, self.s]
        flat = code.reshape(self.sim.B, -1)
        v = t.gather(1, flat.clamp(min=0, max=t.shape[1] - 1)) & (flat >= 0)
        return v.reshape(code.shape)

    def civic_held(self, code):
        c = self.sim.citystate_civics[:, self.s]
        flat = code.reshape(self.sim.B, -1)
        v = c.gather(1, flat.clamp(min=0, max=c.shape[1] - 1)) & (flat >= 0)
        return v.reshape(code.shape)

    def researching_tech(self, code):
        cur = self.sim.citystate_cur_tech[:, self.s]
        flat = code.reshape(self.sim.B, -1)
        return ((flat == cur.unsqueeze(1)) & (flat >= 0)).reshape(code.shape)

    def researching_civic(self, code):
        cur = self.sim.citystate_cur_civic[:, self.s]
        flat = code.reshape(self.sim.B, -1)
        return ((flat == cur.unsqueeze(1)) & (flat >= 0)).reshape(code.shape)

    def owns(self, plot):
        sim = self.sim
        flat = plot.reshape(sim.B, -1)
        v = (sim.tile_seat.gather(1, flat.clamp(min=0)) == self.seat) & (flat >= 0)
        return v.reshape(plot.shape)

    def operation_live(self, ids):
        return self.sim._mops_live(self.s, ids)

    def start_operation(self, name, plot, mask):
        T = self.sim._mops_tables()
        return self.sim._mops_start(self.s, T.names.index(name), plot, plot, mask)

    def builder_type(self, imp):
        T = self.T
        bu = T["unit_index"].get("UNIT_BUILDER", -1)
        ok = self.f.unit_version("UNIT_BUILDER") == "UNIT_BUILDER" and bu >= 0
        return torch.where(imp >= 0, bu if ok else -1, -1)

    def district_tie(self, mask):
        # the game's draw 'City Build District Choice' (0x5d0c20)
        return self.sim._rand_range(mask, 2)

    def plot_city(self, plot):
        return torch.where(self.owns(plot), -1, -2)

    def can_place_district(self, plot, d):
        sim = self.sim

        def one(r):
            dv = int(self.E["district"][r]) if r < len(self.E["district"]) else -1
            if dv < 0:
                return torch.zeros(sim.B, sim.T, dtype=torch.bool, device=sim.device)
            return sim._minor_district_plane(self.s, dv, True, False)
        out = torch.zeros_like(plot, dtype=torch.bool)
        for r in sorted(set(d.reshape(-1).tolist())):
            if r < 0:
                continue
            pl = one(int(r))
            flat = plot.reshape(sim.B, -1)
            v = pl.gather(1, flat.clamp(min=0)).reshape(plot.shape)
            out = out | ((d == r) & v & (plot >= 0))
        return out

    def _ground_now(self):
        sim = self.sim
        ver = (sim._eff_version, sim._gen_ver)
        if self._ground is None or self._ground_ver != ver:
            self._ground = sim._minor_ground_imps(self.s, standing=True)
            self._ground_ver = ver
        return self._ground

    def can_improve(self, plot, imp):
        sim = self.sim
        g = self._ground_now()
        k = self._ei.take(imp.clamp(min=0).reshape(-1)).reshape(imp.shape)
        flat_p = plot.reshape(sim.B, -1).clamp(min=0)
        flat_k = k.reshape(sim.B, -1).clamp(min=0)
        v = g[torch.arange(sim.B, device=sim.device).unsqueeze(1), flat_p, flat_k].reshape(plot.shape)
        return v & (imp >= 0) & (k >= 0) & (plot >= 0)

    def plot_owner(self, plot):
        sim = self.sim
        flat = plot.reshape(sim.B, -1)
        return sim.tile_seat.gather(1, flat.clamp(min=0)).reshape(plot.shape)

    def units(self):
        """the minor's units in the pool's order: id (its global slot), AI
        row, plot, charges, valid ([B, U] each)"""
        sim = self.sim
        ver = (sim._gen_ver, sim._eff_version)
        if getattr(self, "_units_ver", None) == ver:
            return self._units
        mine = sim.major_unit_alive & (sim.major_unit_seat == self.seat)
        U = max(int(mine.sum(dim=1).max()), 1)
        order = torch.sort((~mine).to(torch.int8), dim=1, stable=True).indices[:, :U]
        valid = mine.gather(1, order)
        lo = sim.POOL_LO["major"]
        er = self.T["engine_row"].to(sim.device)
        typ = sim.major_unit_type.gather(1, order).clamp(min=0, max=er.numel() - 1)
        neg = torch.full_like(order, -1)
        self._units = {"id": torch.where(valid, order + lo, neg), "type": torch.where(valid, er.take(typ), neg),
                       "plot": torch.where(valid, sim.major_unit_tile.gather(1, order), neg),
                       "charges": torch.where(valid, sim.major_unit_charges.gather(1, order).long(), neg), "valid": valid}
        self._units_ver = ver
        return self._units

    def distance(self, plots, plot):
        sim = self.sim
        return sim.pair_dist[plots.clamp(min=0), plot.clamp(min=0).unsqueeze(1).expand_as(plots)].long()

    def _reach_turns(self, plot, among, max_turns: int, moves: bool):
        """[B, U] per unit of `among` ([B, U]) the turns its planning (the
        pathfinder within `max_turns`, no zone of control) takes to stand on
        the plot, 0 none — with Movement left there where `moves` asks it"""
        sim = self.sim
        u = self.units()
        out = torch.zeros_like(u["id"])
        lo = sim.POOL_LO["major"]
        for j in range(u["id"].shape[1]):
            m = u["valid"][:, j] & (plot >= 0) & among[:, j]
            if not bool(m.count_nonzero()):
                continue
            rows = m.nonzero(as_tuple=True)[0]
            # one turn: the whole planning; no limit: stopped once the plot closes
            res = sim._tac_search(rows, u["id"][rows, j] - lo, self.seat, max_turns, False,
                                  None if max_turns == 1 else plot[rows], pre="major")
            ar = torch.arange(rows.shape[0], device=sim.device)
            p = plot[rows]
            t = res["turns"][ar, p]
            ok = t > 0
            if moves:
                ok &= res["moves"][ar, p] > 0
            out[rows, j] = torch.where(ok, t, torch.zeros_like(t))
        return out

    def reach_this_turn(self, plot, moves: bool, among):
        """[B, U] the unit of `among` whose planning reaches the plot this
        turn (one turn, range 0), with Movement left there where `moves`
        asks it (MOVE UNIT, BUILD IMPROVEMENT)"""
        return self._reach_turns(plot, among, 1, moves) == 1

    def turns_to(self, plot, among):
        """[B, U] the turns the path of the unit of `among` takes to the plot
        (0x272a60), 0 none (MOVE UNIT)"""
        return self._reach_turns(plot, among, 1 << 30, False)

    def order(self, uid, kind, plot, imp, mask):
        sim = self.sim
        lo = sim.POOL_LO["major"]
        g = uid.clamp(min=lo) - lo
        alive = mask & (uid >= lo) & sim.major_unit_alive.gather(1, g.unsqueeze(1)).squeeze(1) \
            & (sim.major_unit_seat.gather(1, g.unsqueeze(1)).squeeze(1) == self.seat)
        if not bool(alive.count_nonzero()):
            return
        if kind == "move":
            sim._tac_move_to(alive, g, plot, pre="major", seat=self.seat, strike=False)
            sim._gen_ver += 1
            return
        here = alive & (sim.major_unit_tile.gather(1, g.unsqueeze(1)).squeeze(1) == plot)
        if not bool(here.count_nonzero()):
            return
        ch = sim.major_unit_charges.gather(1, g.unsqueeze(1)).squeeze(1)
        spent = here & (ch <= 1)
        if bool(spent.count_nonzero()):
            self._spent.append(torch.where(spent, uid, -1))
        if kind == "improve":
            k = self._ei.take(imp.clamp(min=0))
            lay = here & (imp >= 0) & (k >= 0)
            if bool(lay.count_nonzero()):
                rr = lay.nonzero(as_tuple=True)[0]
                tt = plot[rr]
                sim.improvement[rr, tt] = k[rr]
                sim.pillaged[rr, tt] = False
                sim._eff_version += 1
                sim._spend_build_charge(rr, uid, plot)
                sim._gen_ver += 1
            return
        sim._minor_clear(self.s, here, uid, plot)
        sim._gen_ver += 1

    def unit_alive(self, ids):
        sim = self.sim
        lo = sim.POOL_LO["major"]
        flat = ids.reshape(sim.B, -1)
        g = (flat - lo).clamp(min=0, max=sim.major_unit_alive.shape[1] - 1)
        ok = (flat >= lo) & sim.major_unit_alive.gather(1, g) & (sim.major_unit_seat.gather(1, g) == self.seat)
        if self._spent:
            gone = torch.stack(self._spent, dim=1)
            ok = ok & ~(flat.unsqueeze(2) == gone.unsqueeze(1)).any(-1)
        return ok.reshape(ids.shape)

    def builders_make_wonders(self):
        return False

    def builders_make_districts(self):
        return False

    def clear_production(self, mask):
        self.sim._minor_set_item(self.s, mask, -1)
