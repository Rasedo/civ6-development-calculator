"""THE CITY-STATES' CITY AI AND THE FREE CITIES' PICK on the GPU
(cpu/core/minorCityAi.ts, minorBuild.ts's `freeCityBuild`; GameCore_XP2
AI/CityBuild.cpp, AI/Economic.cpp; `tools/civ6lab/dll_readings.md` "C-96: the
city events, trees and contracts"). Each city-state's turn after its step
(`_minor_build`), as the game's Control Manager runs a player's lists:

 - B: the Economic AI's savings turn (0x687bf0, `_cv_savings_turn`), the
   military AI's turn (`_mops_evaluate`, sim_minorops.py) — both
   `_minor_military_turn`, before the knowledge base's look;
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
a unit's id is its slot in the majors' pool. A Free City's AI runs no event
(the Free Cities' event list names "Simple City Tree", which the install
defines no nodes for) and holds no contract (their one operation tree names
no Contract ID): its update's threat, under threat the defensive cancel, on
an empty queue the Default Specialization. A Free City's signals start its
raid (`_free_raid_start`, sim_minorops.py's operations on the row `FR`).
"""

from __future__ import annotations

from .simbase import *  # noqa: F401,F403 — torch, constants, helpers: the shared floor
from .sim_citytrees import (
    building_event, city_contracts, defense_event, district_event, free_slots, goals_reached,
    improvement_event, in_hand_check, pick_improvement, queue_contract, takes_turn, tick_city_trees, _cget, _cset,
    gold_purchasable, CP_ACCEPTED, CP_COMPLETED,
)
from .sim_cityvalue import _FX_MIN, _MinorFacts, _t
from .sim_research import _FX, _discounted, _fmul, _fx_const, _present_value
from .sim_minorops import _ARMY_READ_AGE

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
# the distance of the holder's operation's target within which an undamaged
# city's threat passes over the operation's enemy (`OWN_OPERATION_RANGE`)
_OWN_OPERATION_RANGE = 5
# the enemy at the gates (CityBuildAI +0x218): more than 2 of a player's
# records within 2, each of a strength of 5 or more
_NEAR_RANGE, _NEAR_LEAST, _NEAR_ABOVE = 2, 5, 2
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

    def _minor_military_turn(self, s: int) -> None:
        """`minorMilitaryTurn` — B: the savings and the military AI's turn, on
        the knowledge base as its last look left it"""
        alive = self.citystate_alive[:, s] & (self.citystate_center[:, s] >= 0)
        if not bool(alive.count_nonzero()):
            return
        tre = torch.trunc(self.citystate_treasury[:, s] * _FX).long()
        # its GREAT_PEOPLE slot stands apart while the game has a class available
        sav, bal = self._cv_savings_turn(self.citystate_savings[:, s], self.citystate_balance[:, s], tre,
                                         self._minor_gp_class())
        self.citystate_savings[:, s] = torch.where(alive.unsqueeze(1), sav, self.citystate_savings[:, s])
        self.citystate_balance[:, s] = torch.where(alive, bal, self.citystate_balance[:, s])
        # its contract purchases, in its city on the threat its last update stored
        self._minor_contract_purchases(s, alive)
        self._mops_evaluate(s)

    def _minor_gp_class(self) -> torch.Tensor:
        """[B] `minorGreatPersonClass` (0x2f7eb0): a class of the AI's list
        the engine keeps no offer for, or one whose offer is not exhausted"""
        idx = list(self.rules.ai_city_build["gpClasses"])
        if any(i < 0 for i in idx):
            return torch.ones(self.B, dtype=torch.bool, device=self.device)
        cols = torch.tensor(idx, dtype=torch.long, device=self.device)
        return (self.gp_offer[:, cols] != -2).any(dim=1)

    def _minor_contract_purchases(self, s: int, act: torch.Tensor) -> None:
        """`purchaseContracts` where `act` (0x687bf0 after the savings): the
        purchase list keeps the contracts alive, ACCEPTED and gold-bought;
        each unit's, in id order, tries TryPurchaseUnits in the minor's city
        (its price; the purchase request: the city may train the unit, the
        purse covers it, the centre takes the unit) and is COMPLETED where it
        buys (`minorBuyUnit`)"""
        ai = self.cityai
        cs = (slice(None), s)
        live = ai.c_id[cs] >= 0
        gold = gold_purchasable(ai, ai.c_unit[cs], ai.c_building[cs], ai.c_district[cs])
        keep = ai.c_purchase[cs] & live & (ai.c_progress[cs] == CP_ACCEPTED) & gold
        ai.c_purchase[cs] = torch.where(act.unsqueeze(1), keep, ai.c_purchase[cs])
        units = act.unsqueeze(1) & ai.c_purchase[cs] & (ai.c_unit[cs] >= 0)
        if not bool(units.any()):
            return
        E = self._cv_tables()["engine"]
        eu = torch.tensor(E["unit"] or [-1], dtype=torch.long, device=self.device)
        order = torch.where(units, ai.c_id[cs], torch.full_like(ai.c_id[cs], 1 << 40)).argsort(dim=1)
        seat = 100 + s
        ctr = self.citystate_center[:, s].clamp(min=0)
        for r in range(order.shape[1]):
            j = order[:, r]
            on = units.gather(1, j.unsqueeze(1)).squeeze(1)
            if not bool(on.any()):
                break
            ui = torch.where(on, eu.take(_cget(ai.c_unit, s, j).clamp(min=0)), torch.full_like(j, -1))
            on = on & (ui >= 0)
            price = self._minor_gold_price(s, ui.clamp(min=0))
            # the purchase request (0x977570): the city may train the unit (an
            # obsolete unit's contract stays ACCEPTED, unbought) and the centre
            # itself takes it (`purchaseSpotBlocked`: a hull by its own water rule)
            pk = ui.clamp(min=0, max=self.NU - 1)
            found = self.unit_naval.take(pk) | ~self._purchase_blocked(
                ctr, seat, is_civilian=self._type_civilian.take(pk), is_support=self._type_support.take(pk))
            can = on & self._minor_can_train(s, ui) & found & self._afford(self.citystate_treasury[:, s], price)
            sav, bal, bought = self._cv_try_purchase(self.citystate_savings[:, s], self.citystate_balance[:, s],
                                                     price.long(), self.citystate_threat[:, s], can)
            bought = bought & on
            self.citystate_savings[:, s] = torch.where(bought.unsqueeze(1), sav, self.citystate_savings[:, s])
            self.citystate_balance[:, s] = torch.where(bought, bal, self.citystate_balance[:, s])
            self._minor_buy_unit(s, bought, ui, price)
            _cset(ai.c_progress, s, j, CP_COMPLETED, bought)

    def _minor_ai_turn(self, s: int) -> None:
        """`minorAiTurn` — THE MINOR'S CITY AI TURN (the order above, after
        `_minor_military_turn` and the knowledge base's look)"""
        alive = self.citystate_alive[:, s] & (self.citystate_center[:, s] >= 0)
        if not bool(alive.count_nonzero()):
            return
        ai = self.cityai
        fresh = alive & ~self.citystate_ai_on[:, s]
        self.citystate_ai_on[:, s] |= alive
        # A: the city's update
        f = self._cv_minor_facts(s)
        # a founding turn's first look: the unit production table with no
        # known unit (`minorAiTurn`)
        f.no_known = fresh
        b_tab, u_tab, p_tab = self._cv_minor_tables(s, f)
        # the tables the research and civics values' city terms read next turn
        self.citystate_unit_values[:, s] = torch.where(alive.unsqueeze(1), torch.stack(u_tab, dim=1),
                                                       self.citystate_unit_values[:, s])
        self.citystate_unit_on[:, s] |= alive
        counted = alive & ~fresh
        if bool(counted.count_nonzero()):
            self.citystate_res_counts[:, s] = torch.where(counted.unsqueeze(1), self._minor_res_counts(s),
                                                          self.citystate_res_counts[:, s])
        lvl, near = self._minor_threat(s)
        threat = torch.where(alive, lvl, torch.full_like(self.citystate_threat[:, s], -1))
        self.citystate_threat[:, s] = torch.where(alive, threat, self.citystate_threat[:, s])
        self.citystate_threat_near[:, s] = torch.where(alive, near, self.citystate_threat_near[:, s])
        self.citystate_standing_short[:, s] = torch.where(alive, self._minor_standing_army(s, alive),
                                                         self.citystate_standing_short[:, s])
        evals = self._minor_plot_evals(s, f, b_tab)
        w = _MinorWorld(self, s, f, (b_tab, u_tab, p_tab), evals, threat)
        goals_reached(ai, s, w, alive)
        free_slots(ai, s, w, alive)
        in_hand_check(ai, s, w, alive)
        best_imp = pick_improvement(ai, s, w, alive)
        ev = alive & ~fresh
        if bool(ev.count_nonzero()):
            lst = self.rules.ai_city_build["cityEventLists"].get("MINOR_CIV_DEFAULT_TRAIT", {})
            # its Food focus (0x5cdae0), set before the events
            self._minor_food_focus(s, ev)
            # the City Defense event (0x5cced0) opens with the defensive cancel
            self._minor_defensive_cancel(s, w, f, (b_tab, u_tab, p_tab), evals, ev)
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
                self.citystate_prod_set_value[:, s] = torch.where(q, _cget(ai.c_value, s, hand), self.citystate_prod_set_value[:, s])
            # the queue's refusal FAILS the contract and the turn falls to the pick
            rest = idle & ~q
            ai.in_hand[:, s] = torch.where(rest, -1, ai.in_hand[:, s])
            if bool(rest.count_nonzero()):
                kind, row, val = self._cv_pick(b_tab, u_tab, p_tab, f, bests)
                pkey = self._minor_pick_key(kind, row)
                ok2 = rest & (pkey >= 0) & self._minor_queue_ok(s, pkey, torch.full_like(pkey, -1))
                if bool(ok2.count_nonzero()):
                    self._minor_set_item(s, ok2, pkey, torch.full_like(pkey, -1))
                    self.citystate_prod_set_value[:, s] = torch.where(ok2, val, self.citystate_prod_set_value[:, s])
        # the purchases: a threatened city buys its list's first unit while it may
        buy = alive & (threat > -1)
        if bool(buy.count_nonzero()):
            self._minor_purchases(s, f, threat, buy)
        # the trees' tick
        tick_city_trees(ai, s, w, int(self.turn), alive)

    def _minor_defensive_cancel(self, s: int, w, f, tables, evals: dict, mask: torch.Tensor) -> None:
        """`defensiveCancel` (0x5d7640) of minor `s`'s city where `mask` and
        it is under threat (`w.under_threat()`, `_defensive_cancel`): its
        queue's head the minor's item (a repair its building's, a district
        valued at its plot by the plot analysis)"""
        go = mask & _t(w.under_threat(), f.like()).bool()
        if not bool(go.count_nonzero()):
            return
        B, dev = self.B, self.device
        T = self._cv_tables()
        nd = len(self.rules.ai_city_build["districts"])
        key = self.citystate_item[:, s]
        is_u, is_b, is_d, is_p, is_r = self._mk_kinds(key)
        hu = torch.where(is_u, T["engine_row"].to(dev).take(key.clamp(min=0, max=T["engine_row"].numel() - 1)), torch.full_like(key, -1))
        br = T["building_row"].to(dev)
        bkey = torch.where(is_r, key - self._mk_r0, key - self._mk_b0).clamp(min=0, max=br.numel() - 1)
        hb = torch.where(is_b | is_r, br.take(bkey), torch.full_like(key, -1))
        dr = T["district_row"].to(dev)
        hd = torch.where(is_d, dr.take((key - self._mk_d0).clamp(min=0, max=dr.numel() - 1)), torch.full_like(key, -1))
        p_row = self._ai_project_rows()
        hp = torch.where(is_p, p_row.take((key - self._mk_p0).clamp(min=0, max=p_row.numel() - 1)), torch.full_like(key, -1))
        site = self.citystate_prod_site[:, s]
        at = (evals["plot"] == site.unsqueeze(1)) & (site >= 0).unsqueeze(1) & (hd >= 0).unsqueeze(1)
        dsel = evals["dists"].gather(2, hd.clamp(min=0, max=max(nd - 1, 0)).view(B, 1, 1).expand(-1, at.shape[1], 1)).squeeze(2)
        dv = torch.where(at.any(dim=1), (dsel * at.long()).sum(dim=1), torch.zeros_like(key))
        heads = (is_u, is_b | is_r, is_d, is_p, torch.zeros_like(is_u), hu, hb, hd, hp, dv)
        self._defensive_cancel(s, f, tables, go, heads, lambda m: self._minor_set_item(s, m, -1))

    def _ai_project_rows(self) -> torch.Tensor:
        """[engine projects] each engine project's AI project row, -1 none"""
        T = self._cv_tables()
        p_eng = list(T["engine"]["project"])
        p_row = torch.full((max(max(p_eng, default=-1) + 1, 1),), -1, dtype=torch.long, device=self.device)
        for i, e in enumerate(p_eng):
            if e >= 0 and int(p_row[e]) < 0:
                p_row[e] = i
        return p_row

    def _defensive_cancel(self, s: int, f, tables, go: torch.Tensor, heads: tuple, clear) -> None:
        """`defensiveCancel` (0x5d7640) over the book's row `s` (its city's
        hand and list in the row's `in_hand` / `c_listed`) where `go` (the
        city under threat): the item in hand — the contract in hand, else the
        queue's head (`heads`: its kind — unit, building, district, project,
        wonder — its AI rows and a district's value at its plot) — not
        defensive (a unit without Combat or with a Bombard, a building
        without a DefenseModifier, a district without hit points, any
        project, a wonder); its OLD VALUE the contract's (else 0) raised to
        the head's table value (a queued unit with no contract whose
        PseudoYieldType is none or PSEUDOYIELD_UNIT_COMBAT keeps its task; a
        wonder 0); an empty queue keeps its task; the bar OLD + max(OLD,
        AI_CURRENT_TASK_BIAS); it cancels where a listed contract stands
        ACCEPTED at the bar or above, the item is not defensive, the plain
        pick's best building reaches the bar or the defensive pick's best
        unit passes it: the contract in hand FAILED, the production cleared
        (`clear(mask)`)"""
        from .sim_citytrees import CP_ACCEPTED, CP_FAILED, N_CONTRACTS, contract_at, _cset
        B, dev = self.B, self.device
        ai = self.cityai
        T = self._cv_tables()
        b_tab, u_tab, p_tab = tables
        urows, brows = T["unit_rows"], T["bld_rows"]
        drows = self.rules.ai_city_build["districts"]
        u_off_t = torch.tensor([int(r["combat"]) == 0 or int(r["bombard"]) > 0 for r in urows] + [True], dtype=torch.bool, device=dev)
        u_keep_t = torch.tensor([r["pseudo"] in (None, "PSEUDOYIELD_UNIT_COMBAT") for r in urows] + [True], dtype=torch.bool, device=dev)
        b_off_t = torch.tensor([int(r["defenseModifier"]) == 0 for r in brows] + [True], dtype=torch.bool, device=dev)
        b_won_t = torch.tensor([bool(r["wonder"]) for r in brows] + [False], dtype=torch.bool, device=dev)
        d_off_t = torch.tensor([not ((r["hitPoints"] or 0) > 0) for r in drows] + [True], dtype=torch.bool, device=dev)
        nu, nb, nd = len(urows), len(brows), len(drows)
        ku, kb, kd, kp, kw, hu, hb, hd, hp, dv = heads
        # the contract in hand
        hand = contract_at(ai, s, ai.in_hand[:, s])
        has = go & (hand >= 0)
        cu, cb_, cd = _cget(ai.c_unit, s, hand), _cget(ai.c_building, s, hand), _cget(ai.c_district, s, hand)
        c_off = torch.where(cu >= 0, u_off_t[torch.where(cu >= 0, cu, nu)],
                            torch.where(cb_ >= 0, b_off_t[torch.where(cb_ >= 0, cb_, nb)],
                                        torch.where(cd >= 0, d_off_t[torch.where(cd >= 0, cd, nd)], torch.zeros_like(go))))
        # a head with no AI row: not defensive, valued FX(-9999) (a district 0)
        q_off = torch.where(ku, u_off_t[torch.where(hu >= 0, hu, nu)],
                            torch.where(kb, b_off_t[torch.where(hb >= 0, hb, nb)],
                                        torch.where(kd, d_off_t[torch.where(hd >= 0, hd, nd)], kp | kw)))
        off = torch.where(has, c_off, q_off)
        # the OLD VALUE
        like = hu
        old = torch.where(has, _cget(ai.c_value, s, hand), torch.zeros_like(like))
        ut = torch.stack(u_tab, dim=1) if u_tab else torch.zeros(B, 1, dtype=torch.long, device=dev)
        bt = torch.stack(b_tab, dim=1) if b_tab else torch.zeros(B, 1, dtype=torch.long, device=dev)
        pt = torch.stack(p_tab, dim=1) if p_tab else torch.zeros(B, 1, dtype=torch.long, device=dev)
        fxmin = torch.full_like(like, _FX_MIN)
        uv = torch.where(hu >= 0, ut.gather(1, hu.clamp(min=0, max=ut.shape[1] - 1).unsqueeze(1)).squeeze(1), fxmin)
        bv = torch.where(hb >= 0, torch.where(b_won_t[torch.where(hb >= 0, hb, nb)], torch.zeros_like(like),
                                              bt.gather(1, hb.clamp(min=0, max=bt.shape[1] - 1).unsqueeze(1)).squeeze(1)), fxmin)
        bv = torch.where(kw, torch.zeros_like(like), bv)
        pv = torch.where(hp >= 0, pt.gather(1, hp.clamp(min=0, max=pt.shape[1] - 1).unsqueeze(1)).squeeze(1), fxmin)
        head_v = torch.where(ku, uv, torch.where(kb | kw, bv, torch.where(kd, dv, pv)))
        any_head = ku | kb | kd | kp | kw
        old = torch.where(any_head, torch.maximum(old, head_v), old)
        keep = ku & ~has & u_keep_t[torch.where(hu >= 0, hu, nu)]
        go = go & any_head & ~keep
        if not bool(go.count_nonzero()):
            return
        bar = old + torch.maximum(old, torch.full_like(old, 80 * _FX))
        listed = torch.zeros_like(go)
        for j in range(N_CONTRACTS):
            jj = torch.full((B,), j, dtype=torch.long, device=dev)
            listed |= (ai.c_listed[:, s, j] & (ai.c_id[:, s, j] >= 0) & (_cget(ai.c_progress, s, jj) == CP_ACCEPTED)
                       & (_cget(ai.c_value, s, jj) >= bar))
        bests_plain = self._cv_bests(b_tab, u_tab, p_tab, _DefenseAs(f, 0))
        bests_def = self._cv_bests(b_tab, u_tab, p_tab, _DefenseAs(f, 1))
        cancel = go & (listed | off | (bests_plain[0][1] >= bar) | (bests_def[1][1] > bar))
        if not bool(cancel.count_nonzero()):
            return
        _cset(ai.c_progress, s, hand, CP_FAILED, cancel & has)
        clear(cancel)

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

    def _minor_under_threat(self, s: int, threat: torch.Tensor) -> torch.Tensor:
        """[B] bool — `minorUnderThreat` (0x5cdc50): minor `s`'s threat above
        -1 with its centre's hit points damaged or the enemy at its gates
        (CityBuildAI +0x218, `citystate_threat_near`; the war footing a
        city-state's held clear)"""
        return (threat > -1) & ((self.citystate_hp[:, s] < self._cs_max_hp) | self.citystate_threat_near[:, s])

    def _minor_threat(self, s: int) -> tuple[torch.Tensor, torch.Tensor]:
        """[B] long, [B] bool — `minorThreat` (0x5cbd10) on minor `s`'s knowledge base's
        records, with no operation of its own (`_known_threat`): the players
        of the game in its order but the minor — a full civ hostile where the
        minor fights it, the barbarians hostile, a city-state or the Free
        Cities only where the minor fights them; its level (`threatLevel`: 2,
        3 above two districts the centre included; +2 its capital, the
        city-state's one city holding the Palace; no wonder; + its citizens /
        5)."""
        B, dev = self.B, self.device
        row = self._CITY_MINOR0 + s
        nd = (self.city_dist_tile[:, row, 0] >= 0).sum(dim=1) + 1
        level = (torch.where(nd > 2, 3, 2) + 2
                 + torch.div(self.citystate_pop[:, s].long(), 5, rounding_mode="trunc"))
        seats = list(range(self.n_majors)) + [100 + k for k in range(self.S) if k != s] + [FREE_SEAT, BARB_SEAT]
        return self._known_threat(s, self.citystate_center[:, s], torch.full((B,), row, dtype=torch.long, device=dev),
                                  torch.zeros(B, dtype=torch.long, device=dev), level, seats,
                                  lambda p: self.war[:, row, int(self._seat_row[p])])

    def _free_city_threat(self, j: int) -> tuple[torch.Tensor, torch.Tensor]:
        """[B] long, [B] bool — `freeCityThreat` (0x5cbd10) of the Free City in column
        `j` on the Free Cities' knowledge base (the row `FK`) and their
        running operations against a player (their raids, the row `FR`): the
        full civs are the players it fights, the city-states not; its level
        2, 3 above two districts the centre included, +1 with a wonder
        complete, + its citizens / 5 (no capital)."""
        B, dev = self.B, self.device
        row = self.FREE_ROW
        nd = (self.city_dist_tile[:, row, j] >= 0).sum(dim=1)
        wt = self.city_wonder[:, row, j]
        won = ((wt >= 0) & self.built_wonder_complete.gather(1, wt.clamp(min=0))).any(dim=1)
        level = (torch.where(nd > 2, 3, 2) + won.long()
                 + torch.div(self.city_pop[:, row, j].long(), 5, rounding_mode="trunc"))
        seats = list(range(self.n_majors)) + [100 + k for k in range(self.S)] + [BARB_SEAT]
        full = torch.ones(B, dtype=torch.bool, device=dev)
        none = torch.zeros(B, dtype=torch.bool, device=dev)
        centre = self.city_center[:, row, j]
        damaged = self.city_hp[:, row, j] < int(self.rules.combat["cityMaxHp"])

        def op_near(p: int) -> torch.Tensor:
            # `freeOpNear` (0x723cf0): a raid against the player whose target
            # lies within 5 of the city
            t = self.mops_target[:, self.FR]
            d = self.pair_dist[t.clamp(min=0), centre.clamp(min=0).unsqueeze(1)].to(torch.long)
            return ((self.mops_def[:, self.FR] >= 0) & (self.mops_enemy[:, self.FR] == p) & (t >= 0)
                    & (d <= _OWN_OPERATION_RANGE)).any(dim=1)
        return self._known_threat(self.FK, centre, torch.full((B,), row, dtype=torch.long, device=dev),
                                  torch.full((B,), j, dtype=torch.long, device=dev), level, seats,
                                  lambda p: full if p < self.n_majors else none, op_near, damaged)

    def _known_threat(self, r: int, centre: torch.Tensor, hrow: torch.Tensor, hcol: torch.Tensor, level: torch.Tensor,
                      seats: list, war_of, op_near=None, damaged: torch.Tensor | None = None) -> tuple[torch.Tensor, torch.Tensor]:
        """[B] long — 0x5cbd10 on the knowledge base row `r`'s records aged at
        most ARMY_READ_AGE (all where the row never aged), the city at
        `centre` held by (`hrow`, `hcol`): per player of `seats` in order —
        hostile where `war_of` says the holder fights it (the barbarians
        always), a full civ counted either way, any other only where fought —
        the player's known units within 5 (a full civ's) or 3 of the city
        summed by their threat strengths (the larger of Combat, RangedCombat
        and Bombard + 20; a Bombard unit counts, a ranged one above the
        defense less 15, any above the defense less 5; never an explorer nor
        a barbarian camp defender); at the city's defense plus the margin
        (5.0 hostile, else 20.0 or the centre's garrison term) the city is
        threatened at `level`, at most 1 not hostile; a player the holder runs
        an operation against near the city (`op_near(p)`, 0x723cf0) passed
        over while the city is whole (not `damaged`). The first such player
        decides; -1 none. Each player read sets the enemy at the gates
        (CityBuildAI +0x218, for good once set) where more than 2 of its
        records of a strength of 5 or more stand within 2 of the city; a
        player the holder fights then threatens it, the margin
        unread. [B] the level, [B] bool the enemy at the gates."""
        B, dev = self.B, self.device
        T = self._cv_tables()
        rows = T["unit_rows"]
        # D holds no garrison (GetDefenseStrength with its flag set)
        dcs = self._city_defense_cs(hrow, hcol, False)[0]
        d = dcs * _FX
        # the centre's garrison term (0x24a180) the margin over a full civ
        # not hostile reads
        gar = torch.trunc(self._garrison_cs(hrow, hcol, self._ROW_SEAT.take(hrow), self._holder_strength(hrow, hcol)) * _FX)
        slot = self.citystate_kb_slot[:, r].long()
        owner = self.citystate_kb_owner[:, r].long()
        typ = self.citystate_kb_type[:, r].long()
        plot = self.citystate_kb_plot[:, r].long()
        aged = self.citystate_kb_aged[:, r].unsqueeze(1)
        rec = (slot != -2) & ((aged < 0) | (aged - self.citystate_kb_seen[:, r].long() <= _ARMY_READ_AGE))
        er = T["engine_row"].to(dev)
        arow = torch.where(typ >= 0, er.take(typ.clamp(min=0, max=er.numel() - 1)), torch.full_like(typ, -1))
        comb = torch.tensor([int(x["combat"]) for x in rows] or [0], dtype=torch.long, device=dev)
        rng = torch.tensor([int(x["rangedCombat"]) for x in rows] or [0], dtype=torch.long, device=dev)
        bomb = torch.tensor([int(x["bombard"]) for x in rows] or [0], dtype=torch.long, device=dev)
        expl = torch.tensor([x["pseudo"] == "PSEUDOYIELD_UNIT_EXPLORER" for x in rows] or [False], dtype=torch.bool, device=dev)
        # the barbarians' camp defenders (their manager's CLASS_ANTI_CAVALRY
        # types, 0x153e40) count for none
        acav = torch.tensor([x["promotionClass"] == "PROMOTION_CLASS_ANTI_CAVALRY" for x in rows] or [False],
                            dtype=torch.bool, device=dev)
        a0 = arow.clamp(min=0)
        bb = bomb.take(a0)
        bv = torch.where(bb > 0, bb + 20, torch.zeros_like(bb))
        st = torch.maximum(comb.take(a0), torch.maximum(bv, rng.take(a0))) * _FX
        dd = d.unsqueeze(1)
        counts = (bb > 0) | ((rng.take(a0) > 0) & (st.double() > dd - 15 * _FX)) | (st.double() > dd - 5 * _FX)
        strength = torch.where((arow >= 0) & counts & ~expl.take(a0), st, torch.zeros_like(st))
        dist = self.pair_dist[centre.clamp(min=0).unsqueeze(1), plot.clamp(min=0)].long()
        # the enemy at the gates' records (0x5eadb0 at radius 2, least
        # strength 5: its list's per-type counts)
        tc = typ.clamp(min=0, max=self.NU - 1)
        kc, kr = self._type_combat.take(tc), self._type_ranged_strength.take(tc)
        gate = rec & (typ >= 0) & (torch.maximum(kc, kr) >= _NEAR_LEAST) & (dist <= _NEAR_RANGE)
        near = torch.zeros(B, dtype=torch.bool, device=dev)
        out = torch.full((B,), -1, dtype=torch.long, device=dev)
        for p in seats:
            full = p < self.n_majors
            barb = p == BARB_SEAT
            war = war_of(p) if not barb else torch.zeros(B, dtype=torch.bool, device=dev)
            hostile = war | barb
            if not full and not barb:
                if not bool(war.count_nonzero()):
                    continue
            margin = torch.where(hostile, torch.full_like(d, _MARGIN_HOSTILE),
                                 torch.maximum(torch.full_like(d, _MARGIN_OTHER), gar))
            mine = rec & (owner == p) & (dist <= (_RANGE_CIV if full else _RANGE_OTHER))
            anyu = mine.any(dim=1)
            sums = mine & ~acav.take(a0) if barb else mine
            tot = torch.where(sums, strength, torch.zeros_like(strength)).sum(dim=1)
            read = (out < 0) & anyu & (centre >= 0)
            if op_near is not None:
                read = read & ~(op_near(p) & ~damaged)
            if not full and not barb:
                read = read & war
            at_gates = (gate & (owner == p)).sum(dim=1) > _NEAR_ABOVE
            near = near | (read & at_gates)
            hit = read & ((tot.double() >= d + margin) | (war & near))
            out = torch.where(hit, torch.where(hostile, level, level.clamp(max=1)), out)
        return out, near

    # -- the plot analysis ---------------------------------------------------

    def _minor_ground_imps(self, s: int, standing: bool = False, drought: bool = True) -> torch.Tensor:
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
        each on its own ground; no row a governor gates; with `drought` none a
        drought bars"""
        B, T, dev = self.B, self.T, self.device
        K = int(self._imp_unlock.numel())
        PN = self._cv_tables()["plot_names"]
        tabs = self._cv_tables()
        civ = self.citystate_civics[:, s]
        hf = (civ[:, self._hillfarms_civic] if self._hillfarms_civic >= 0
              else torch.zeros(B, dtype=torch.bool, device=dev)).unsqueeze(1)
        # a resource the minor cannot see is none: its plot reads as plain
        # ground (`seenGround`)
        live = self._res_live()
        hid = live & self._res_hidden(self._CITY_MINOR0 + s)
        res = live & ~hid
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
        land = base & ~live & ~self.water
        sea = base & ~live & self.water
        # `standing`: the plot as it stands alone (`standingImprovements`)
        keep = torch.full_like(base, not standing)
        # a hidden resource's plot reads the resource-free planes, as a
        # harvested one does, as it stands too
        land_h = (base & harvestable & ~self.water & keep) | (base & hid & ~self.water)
        sea_h = (base & harvestable & self.water & keep) | (base & hid & self.water)
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
            if drought and k in self._drought_imps:
                ok = ok & ~dry
            out[:, :, k] = ok
        return out

    def _city_regions(self, centre: torch.Tensor) -> torch.Tensor:
        """[B, 37] `cityRegions` — A CITY'S PRIMARY REGIONS (0x700630): the
        region of every plot within three of the centre `centre` ([B]), -1
        past the map's edge, off any region, and everywhere where the centre
        is off any region or no city stands"""
        disk = self._cv_disk3(centre)
        reg = torch.where(disk >= 0, self.tile_region.gather(1, disk.clamp(min=0)), torch.full_like(disk, -1))
        own = reg[:, 0]
        return torch.where(((centre >= 0) & (own >= 0)).unsqueeze(1), reg, torch.full_like(reg, -1))

    def _minor_combat_desire(self, s: int) -> None:
        """`minorCombatDesire` — THE COMBAT DESIRE of minor `s` at its
        military AI's turn (`citystate_combat_desire`, raw 24.8, its
        PSEUDOYIELD_UNIT_COMBAT weight), on the records as its last update
        aged them (the turn before): its primary regions (`_city_regions`), its unit in
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
        regions = self._city_regions(centre)
        rec_area = self.tile_region.gather(1, plot.clamp(min=0))
        turn = int(self.turn) - 1
        in_list = ((rec_area.unsqueeze(2) == regions.unsqueeze(1)) & (regions >= 0).unsqueeze(1)).any(dim=2)
        counted = (slot != -2) & (turn - seen <= 2) & in_list
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

    def _free_combat_desire(self, act: torch.Tensor) -> None:
        """`freeCombatDesire` — THE FREE CITIES' COMBAT DESIRE at their
        military AI's turn, in the games of `act`, with or without a city
        (`citystate_combat_desire` on the row `FR`), on the records of their
        knowledge base (the row `FK`) as their last update aged them (the
        turn before): the regions of their cities' 37 plots (`_city_regions`),
        each city's unit in training, the majors at war with them, the city-states not, the
        barbarians a tribe at war; a city threatened at its last update
        (`city_ai_threat`); no war footing, no standing-army term."""
        B, dev = self.B, self.device
        if not bool(act.count_nonzero()):
            return
        row, r = self.FREE_ROW, self.FK
        T = self._cv_tables()
        rows = T["unit_rows"]
        er = T["engine_row"].to(dev)
        st_row = torch.tensor([max(int(x["combat"]), int(x["rangedCombat"])) for x in rows] + [0],
                              dtype=torch.long, device=dev)

        def strength_of(typ: torch.Tensor) -> torch.Tensor:
            ar = torch.where(typ >= 0, er.take(typ.clamp(min=0, max=er.numel() - 1)), torch.full_like(typ, -1))
            return st_row.take(torch.where(ar >= 0, ar, torch.full_like(ar, len(rows))))
        slot = self.citystate_kb_slot[:, r].long()
        owner = self.citystate_kb_owner[:, r].long()
        typ = self.citystate_kb_type[:, r].long()
        seen = self.citystate_kb_seen[:, r].long()
        plot = self.citystate_kb_plot[:, r].long()
        alive_c = self.city_alive[:, row, : self.RC]
        ctr = self.city_center[:, row, : self.RC]
        # their primary region list: every region of each city's 37 plots
        regs = torch.cat([self._city_regions(torch.where(alive_c[:, j], ctr[:, j], torch.full_like(ctr[:, j], -1)))
                          for j in range(self.RC)], dim=1)
        rec_area = self.tile_region.gather(1, plot.clamp(min=0))
        in_area = ((rec_area.unsqueeze(2) == regs.unsqueeze(1)) & (regs >= 0).unsqueeze(1)).any(dim=2)
        turn = int(self.turn) - 1
        counted = (slot != -2) & (turn - seen <= 2) & in_area
        strength = strength_of(typ)
        best = torch.maximum(torch.ones(B, dtype=torch.long, device=dev),
                             torch.maximum(self.free_best_melee.long(),
                                           torch.full((B,), self._city_min_strike, dtype=torch.long, device=dev)))
        queued = torch.zeros(B, dtype=torch.long, device=dev)
        for j in range(self.RC):
            cur = self.city_current[:, row, j, 0].long()
            is_u = alive_c[:, j] & (cur >= self.UNIT_BASE) & (cur < self.UNIT_BASE + self.NU)
            q = torch.where(is_u, strength_of((cur - self.UNIT_BASE).clamp(min=0)), torch.zeros_like(cur))
            queued = queued + torch.where(q + 20 > best, q, torch.zeros_like(q))
        cities = alive_c.sum(dim=1).long()
        full = torch.ones(B, dtype=torch.bool, device=dev)
        none = torch.zeros(B, dtype=torch.bool, device=dev)
        players = ([(p, full, False, False) for p in range(self.n_majors)]
                   + [(100 + k, none, False, False) for k in range(self.S)]
                   + [(FREE_SEAT, none, False, False), (BARB_SEAT, True, True, False)])
        threatened = (alive_c & (self.city_ai_threat[:, row, : self.RC] >= 0)).any(dim=1)
        _r, _e, _o, w = self._cv_combat_desire(owner, strength, counted, best, cities, players, FREE_SEAT, queued,
                                              none, threatened, torch.zeros(B, dtype=torch.long, device=dev))
        self.citystate_combat_desire[:, self.FR] = torch.where(act, w, self.citystate_combat_desire[:, self.FR])

    def _free_knowledge(self, act: torch.Tensor, age: bool) -> None:
        """`freeKnowledge` — the Free Cities' knowledge base's look (row
        `FK`) over the plots they see (`_barb_seen` of their seat)."""
        if not bool(act.count_nonzero()):
            return
        self._knowledge_look(self.FK, FREE_SEAT, self._barb_seen(FREE_SEAT), act, age)

    def _minor_standing_army(self, s: int, act: torch.Tensor) -> torch.Tensor:
        """[B] `minorStandingArmy` — THE STANDING ARMY of minor `s`'s city
        (0x5ca7e0, its full update) in the games of `act`: its quota, the
        whole part of PSEUDOYIELD_STANDING_ARMY_NUMBER (1.0 at a minor's
        weight) times the square root of its population (float32, as the
        game's fixed point); its list the units of AI type DEFENDER
        (`unit_defender`) in pool order, then each COMBAT unit (not
        civilian, not recon, a fighter) outside every running operation, of
        the land or — the city coastal — the sea, in pool order, joining
        while the list is below the quota, else replacing the list's weakest
        (the first of the lowest Combat, `_ai_combat`) where its Combat is
        higher; the
        count it lacks, the quota less the list (CityBuildAI +0x2d8)"""
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
        act = act & (centre >= 0)
        own = self.major_unit_alive & (self.major_unit_seat == 100 + s) & act.unsqueeze(1)
        flag = self.major_unit_defender & own
        ok = own & ~flag & ~self._mops_busy(s) & fights.take(ar) & (land.take(ar) | (sea.take(ar) & coastal.unsqueeze(1)))
        P = own.shape[1]
        BIG = 1 << 40
        pslot = self.major_unit_pslot
        order = torch.where(own, torch.where(pslot >= 0, pslot, torch.full_like(pslot, P)), torch.full_like(pslot, BIG))
        order = order.argsort(dim=1, stable=True)
        n_own = own.sum(dim=1)
        comb = self._ai_combat("major")
        # each member's place in the list: the DEFENDERs in pool order, a
        # joiner after them all
        place = torch.where(flag, order.argsort(dim=1), torch.full_like(pslot, BIG))
        n = flag.sum(dim=1)
        bidx = torch.arange(B, device=dev)
        for j in range(int(n_own.max()) if B else 0):
            u_b = order[:, j]
            e = (j < n_own) & ok[bidx, u_b]
            if not bool(e.count_nonzero()):
                continue
            join = e & (n < quota)
            key = torch.where(flag, comb * (1 << 30) + place, torch.full_like(place, 1 << 62))
            w = key.argmin(dim=1)
            rep = e & ~join & flag.any(dim=1) & (comb[bidx, w] < comb[bidx, u_b])
            if bool(rep.count_nonzero()):
                r = rep.nonzero(as_tuple=True)[0]
                flag[r, w[r]] = False
                place[r, w[r]] = BIG
            add = join | rep
            if bool(add.count_nonzero()):
                r = add.nonzero(as_tuple=True)[0]
                flag[r, u_b[r]] = True
                place[r, u_b[r]] = P + 1 + j
            n = n + join.long()
        mine = own
        self.major_unit_defender[mine] = flag[mine]
        return torch.where(act, quota - n, torch.zeros_like(n))

    def _minor_eruption_turns(self) -> torch.Tensor:
        """[B, T] `eruptionHazardTurns` — the turns the AI expects to an
        eruption beside each plot (raw fixed point): a plot beside a volcano
        reads 100 over the volcano rows' sum of 100 / (N /
        OccurrencesPerGame); raw -1 (none) elsewhere."""
        def fx_of(x: float) -> int:
            return (math.floor(x) << 8) | int((x - math.floor(x)) * 256)

        def fx_div(a: int, b: int) -> int:
            q = abs(a) * 256 // abs(b)
            return q if (a >= 0) == (b >= 0) else -q
        tot = 0
        for occ, on in zip(self._eruption_weight, self._er_on_volcano):
            if on:
                tot += fx_div(fx_of(100), fx_div(fx_of(self._event_turns), fx_of(occ)))
        turns = fx_div(fx_of(100), tot) if tot > 0 else -1
        nb = self.neigh
        beside = (self.volcano_at[:, nb.clamp(min=0)] & (nb >= 0).unsqueeze(0)).any(dim=2)
        return torch.where(beside, torch.full_like(beside, turns, dtype=torch.long),
                           torch.full_like(beside, -1, dtype=torch.long))

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

    def _minor_plot_evals(self, s: int, f: _MinorFacts, b_tab: list) -> dict:
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
        hazards' turns (flood `_minor_flood_turns`, eruption
        `_minor_eruption_turns`); an inland city-state on a
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
        # an improvement a drought on the plot bars, which its ground takes
        # otherwise, is valued 0: the plot test asks no drought
        dry_ground = self._minor_ground_imps(s, drought=False) if bool((self.drought > 0).any()) else ground
        gd = dry_ground.gather(1, p0.unsqueeze(-1).expand(-1, -1, K)) & (owned & ev).unsqueeze(-1)
        # 0x5ce970's +0x54: an improvement the plot test takes, a plot
        # holding one among them, its own valued 0
        improvable = owned & ev & gd.any(-1)
        # the plot of the city's own pillaged district values that district
        # alone, its repair (`minorRepairsDistrictAt`): per district row its
        # plots, each other value FX(-9999)
        held = self.city_dist_tile[:, row, 0]
        repairs = []
        rep_any = torch.zeros_like(valid)
        for i, r in enumerate(dist_rows):
            dv = int(E["district"][i])
            if r["trait"] or r["type"] in ("DISTRICT_CITY_CENTER", "DISTRICT_WONDER") or dv < 0:
                continue
            tt = held[:, dv]
            t0 = tt.clamp(min=0)
            rep = (alive & (tt >= 0) & self.district_pillaged[self._bidx, t0] & (self.district[self._bidx, t0] == dv)
                   & (self.tile_seat[self._bidx, t0] == seat))
            hit = valid & (plots == tt.unsqueeze(1)) & rep.unsqueeze(1)
            if bool(hit.count_nonzero()):
                imps[hit] = _FX_MIN
                dists[hit] = _FX_MIN
                rep_any = rep_any | hit
                repairs.append((i, r["type"], hit))
        out = {"plot": plots, "valid": valid, "owned": owned, "improvable": improvable, "near_owned": near,
               "imps": imps, "dists": dists}
        if not bool(ev.count_nonzero()) and not repairs:
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
        cand_rows = []
        for i, r in enumerate(dist_rows):
            dv = int(E["district"][i])
            if r["trait"] or r["type"] in ("DISTRICT_CITY_CENTER", "DISTRICT_WONDER") or dv < 0:
                continue
            # the plot test (0x35f2d0) asks no population limit
            pl = self._minor_district_plane(s, dv, False, False, limit=False).gather(1, p0) & ev & (held[:, dv] < 0).unsqueeze(1)
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
        ctx = _PlotCtx(self, s, f, plots, owned, b_tab)
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
                gdi = gd[bb, pp, ke]
                ti = impT[i][bb]
                # landing at or past the horizon: FX(-9999)
                if not bool(gdi.any()) or bool((ti >= hz).all()):
                    continue
                v = (self._cv_improvement(pf, r["type"], ti, torch.full_like(bb, hz)) if bool(gi.any())
                     else torch.zeros_like(bb))
                barred = torch.where(gdi & (ti < hz), torch.zeros_like(v), torch.full_like(v, _FX_MIN))
                imps[bb, pp, i] = torch.where(gi, v, barred)
            for (i, name, _dv, pl, ok_t) in cand_rows:
                ci = pl[bb, pp] & ok_t[bb]
                ti = distT[i][bb]
                # landing past the horizon: FX(-9999)
                if not bool(ci.any()) or bool((ti > hz).all()):
                    continue
                v = self._cv_district(pf, name, ti, torch.full_like(bb, hz))
                dists[bb, pp, i] = torch.where(ci, v, torch.full_like(v, _FX_MIN))
        # the repairs' values
        for (i, dname, hit) in repairs:
            ok_t = T["minor_dverdict"].to(dev)[self.citystate_type[:, s].clamp(min=0), i] >= 0
            hk = torch.where(hit, ((imp + 1) * NR + (rid + 1)) * NF + (fid + 1), torch.full_like(plots, -1))
            for k in torch.unique(hk[hit]).tolist():
                bb, pp = (hk == k).nonzero(as_tuple=True)
                ii = int(imp[bb[0], pp[0]])
                ri = int(rid[bb[0], pp[0]])
                fi = int(fid[bb[0], pp[0]])
                pf = _PlotFacts(ctx, bb, pp,
                                PN["improvement"][ii] if ii >= 0 else None,
                                PN["resourceType"][ri] if ri >= 0 else None,
                                PN["feature"][fi] if fi >= 0 else None,
                                [(name, torch.zeros_like(bb, dtype=torch.bool)) for (_i, name, _dv, _pl, _ok) in cand_rows])
                pf.repair_of = dname
                ti = distT[i][bb]
                if bool((ti > hz).all()):
                    continue
                v = self._cv_district(pf, dname, ti, torch.full_like(bb, hz))
                dists[bb, pp, i] = torch.where(ok_t[bb], v, torch.full_like(v, _FX_MIN))
        out["district_ok"] = (ev | rep_any) & ((dists > _FX_MIN) & (dists != 0)).any(-1)
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
        # a strategic one's copies its stockpile (0x4a93c0)
        if ri in self._strat_rid:
            have = self.citystate_stockpile[:, s, self._strat_rid.index(ri)].take(bb)
        n = count.long() if torch.is_tensor(count) else torch.full_like(t, count)
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
            v = torch.where((have > 0) & (n > 0), zero, v)
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
        # a turn's income (Player_Resources +0x350) short of the units' fuel
        # bill (+0x12e8 +0x1168) with half the need above what it has: the
        # need at least the shortfall
        k_s = self._strat_rid.index(ri) if ri in self._strat_rid and s < self.S else -1
        row_s = self._CITY_MINOR0 + s
        if k_s >= 0:
            gap = (self._unit_upkeep_bill(row_s)[:, k_s] - self._seat_stock_income(row_s)[:, k_s])
            raise_ = (gap > 0) & ((need.double() * 0.5) > self.citystate_stockpile[:, s, k_s].double())
            used = used | raise_
            need = torch.where(raise_, torch.maximum(need, gap), need)
        nd, us = need.take(bb), used.take(bb)
        late = (t != h) & (h != 0)
        short = (have < 2 * nd) & ~late & (n <= 0)
        n = torch.where(n > 0, torch.clamp(torch.minimum(n, 2 * nd - have), min=0), n)
        chrono = (f.era() + 1).take(bb)
        w = chrono * _fx_const(25.0)
        w = torch.where(nd > 0, torch.div(w * _FX, (nd * _FX).clamp(min=1), rounding_mode="trunc"), w)
        w = torch.where(have == 0, _fmul(w, torch.full_like(w, 2 * _FX)), w)
        # at T = H (or H 0), the copies held to the room its cap leaves (the
        # cap 0x4aabe0 less its stock less its reservations, 0x4aa790)
        if k_s >= 0:
            room = (self._stockpile_cap(row_s) - (self.citystate_stockpile[:, s, k_s] - self._stock_reserved(row_s)[:, k_s])).take(bb)
            n = torch.where(~late & (n > 0), torch.minimum(n, room), n)
        w = torch.where((have > nd) & (n + have < nd), _fmul(w, torch.full_like(w, _fx_const(1.5))), w)
        v = _fmul(_discounted(w, rate, t), n * _FX)
        v = torch.where(us & ~short, v, torch.where(short, torch.full_like(v, _FX_MIN), zero))
        return v.clamp(max=800 * _FX)

    # -- the purchases ---------------------------------------------------------

    def _minor_purchase_rows(self, s: int, f: _MinorFacts) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """the minor's unit list (CityBuildAI +0x650: the military AI's unit
        production table copied to the city, 0x79a320) in 0x79d3a0's order —
        the buildable first, then by the at-war players' sums, every
        player's sums and the strength, each the larger first (equal entries
        in database order): [B, R] the AI unit rows, [B, R] the entries, [B, R]
        the entries ranked at or above 0"""
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
        # an entry ranked at or above 0 (+0x30 every player's sums, +0x2c the
        # at-war players')
        ranked = (all_s >= 0) & (war_s >= 0)
        return order, entry.gather(1, order), ranked.gather(1, order)

    def _minor_purchases(self, s: int, f: _MinorFacts, threat: torch.Tensor, act: torch.Tensor) -> None:
        """the purchases (`purchaseTurn`, 0x5ce5b0's tail): where `act` (a
        threatened city) the first unit of the list the minor may train and
        need not buy (0x5d2810), bought while TryPurchaseUnits (0x68be60)
        succeeds on its savings or, threatened, its balance — the Gold price
        a minor pays, the game letting the purchase through where its purse
        covers the price and the centre takes the unit; the
        minor's treasury pays (`minorBuyUnit`)"""
        T = self._cv_tables()
        E = T["engine"]
        rows = T["unit_rows"]
        dev = self.device
        order, entry, ranked = self._minor_purchase_rows(s, f)
        eu = torch.tensor(E["unit"] or [-1], dtype=torch.long, device=dev)
        must = torch.tensor([bool(r["mustPurchase"]) for r in rows], dtype=torch.bool, device=dev)
        go = act.clone()
        seat = 100 + s
        ctr = self.citystate_center[:, s].clamp(min=0)
        for _ in range(64):
            if not bool(go.count_nonzero()):
                return
            # the first entry it may train decides: its unit where ranked at
            # or above 0, else none (0x5d2941)
            pick = torch.full_like(threat, -1)
            seen = torch.zeros_like(go)
            for c in range(order.shape[1]):
                k = order[:, c]
                ui = eu.take(k)
                cand = go & ~seen & entry[:, c] & (ui >= 0) & ~must.take(k)
                if not bool(cand.count_nonzero()):
                    continue
                cand = cand & self._minor_can_train(s, ui)
                pick = torch.where(cand & ranked[:, c], ui, pick)
                seen = seen | cand
            go = go & (pick >= 0)
            if not bool(go.count_nonzero()):
                return
            price = self._minor_gold_price(s, pick)
            # the purchase request (0x977570): the centre itself takes the unit
            # (`purchaseSpotBlocked`: a hull by its own water rule)
            pk = pick.clamp(min=0, max=self.NU - 1)
            found = self.unit_naval.take(pk) | ~self._purchase_blocked(
                ctr, seat, is_civilian=self._type_civilian.take(pk), is_support=self._type_support.take(pk))
            can = found & self._afford(self.citystate_treasury[:, s], price)
            sav, bal, bought = self._cv_try_purchase(self.citystate_savings[:, s], self.citystate_balance[:, s],
                                                     price.long(), threat, can)
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
        banks. Then its city AI's update stores the city's threat
        (`city_ai_threat`) and, on an empty queue, the Default Specialization
        over the city's tables (`_FreeFacts`) queues its pick."""
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
                fin = fin | self._spawn_barb(m, ctr, ui, seat=FREE_SEAT, home=torch.full((B,), -1, dtype=torch.long, device=dev),
                                               stack=True)
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
        # its city AI's update: the city's threat (`_free_city_threat`); under
        # threat the City Defense event's defensive cancel on the item queued;
        # on an empty queue the Default Specialization
        threat, near = self._free_city_threat(j)
        self.city_ai_threat[:, row, j] = torch.where(act, threat, self.city_ai_threat[:, row, j])
        self.city_ai_near[:, row, j] = torch.where(act, near, self.city_ai_near[:, row, j])
        under = act & (threat > -1) & ((self.city_hp[:, row, j] < int(self.rules.combat["cityMaxHp"])) | near)
        go = act & ((self.city_current[:, row, j, 0] < 0) | under)
        if not bool(go.count_nonzero()):
            return
        f = _FreeFacts(self, j)
        b_tab = self._cv_building_table(f)
        u_tab = [torch.where(read, v, torch.full_like(v, _FX_MIN)) for v, read in self._cv_unit_table(f)]
        p_tab = self._cv_project_table(f)
        self._free_defensive_cancel(j, f, (b_tab, u_tab, p_tab), go & under & (self.city_current[:, row, j, 0] >= 0))
        idle = go & (self.city_current[:, row, j, 0] < 0)
        if not bool(idle.count_nonzero()):
            return
        kind, prow, _val = self._cv_pick(b_tab, u_tab, p_tab, f)
        code, cost = f.queue_item(kind, prow)
        ok = idle & (code >= 0)
        if bool(ok.count_nonzero()):
            self._q_push(row, jc, ok, code, cost)
        _ = bidx

    def _free_defensive_cancel(self, j: int, f, tables, go: torch.Tensor) -> None:
        """`defensiveCancel` (0x5d7640, `_defensive_cancel`) of the Free City
        in column `j` where `go` (under threat, its queue holding an item),
        over the row `FR`'s empty book (no contract in hand, none listed):
        its queue's head (a unit, a building, a wonder, a project — the walls'
        repair); a Free City holds no district item; the production cleared
        empties its queue"""
        if not bool(go.count_nonzero()):
            return
        dev = self.device
        row = self.FREE_ROW
        T = self._cv_tables()
        code = self.city_current[:, row, j, 0]
        ku = (code >= self.UNIT_BASE) & (code < self.UNIT_BASE + self.NU)
        kb = (code >= 0) & (code < self.NB)
        kw = (code >= self.WONDER_BASE) & (code < self.PROJECT_BASE)
        kp = (code >= self.PROJECT_BASE) & (code < self.FORM_BASE)
        kd = torch.zeros_like(ku)
        neg = torch.full_like(code, -1)
        er = T["engine_row"].to(dev)
        hu = torch.where(ku, er.take((code - self.UNIT_BASE).clamp(min=0, max=er.numel() - 1)), neg)
        br = T["building_row"].to(dev)
        hb = torch.where(kb, br.take(code.clamp(min=0, max=br.numel() - 1)), neg)
        p_row = self._ai_project_rows()
        hp = torch.where(kp, p_row.take((code - self.PROJECT_BASE).clamp(min=0, max=p_row.numel() - 1)), neg)
        heads = (ku, kb, kd, kp, kw, hu, hb, neg, hp, torch.zeros_like(code))

        def clear(m: torch.Tensor) -> None:
            rows = m.nonzero(as_tuple=True)[0]
            if rows.numel():
                self._q_clear(rows, row, j)
        self._defensive_cancel(self.FR, f, tables, go, heads, clear)

    # -- the Free Cities' raid -------------------------------------------------

    def _first_city_centre(self, player: torch.Tensor) -> torch.Tensor:
        """[B] the centre of `player`'s first city (a major's first in its
        order, a city-state's one), -1 none"""
        out = torch.full_like(player, -1)
        for p in sorted(set(player.tolist())):
            m = player == p
            if 0 <= p < self.n_majors:
                al = self.city_alive[:, p, :self.RC] & (self.city_center[:, p, :self.RC] >= 0)
                first = al.long().argmax(dim=1, keepdim=True)
                c = torch.where(al.any(dim=1), self.city_center[:, p].gather(1, first).squeeze(1), out)
            elif 100 <= p < 100 + self.S:
                c = torch.where(self.citystate_alive[:, p - 100], self.citystate_center[:, p - 100], out)
            else:
                continue
            out = torch.where(m, c, out)
        return out

    def _free_raid_start(self, m: torch.Tensor, j: int, player: torch.Tensor) -> None:
        """`freeRaidStart` (0x274ea0) for the Free City in column `j` where
        `m`, against `player` [B]: where the city never raided, "Free Cities
        Raid" on the operations' row `FR` against no enemy — the target the
        player's first city's centre (none: no start), the rally the Free
        City's centre — and its record the player and the operation's tree
        id"""
        row = self.FREE_ROW
        m = m & self.city_alive[:, row, j] & (self.city_free_raid[:, row, j, 0] < 0)
        if not bool(m.count_nonzero()):
            return
        target = self._first_city_centre(player)
        m = m & (target >= 0)
        if not bool(m.count_nonzero()):
            return
        T = self._mops_tables()
        tid = self._mops_start(self.FR, T.d_raid, target, self.city_center[:, row, j], m)
        rec = self.city_free_raid[:, row, j]
        rec[:, 0] = torch.where(m, player, rec[:, 0])
        rec[:, 1] = torch.where(m, tid, rec[:, 1])

    def _free_raid_signal(self, mask: torch.Tensor, hrow: torch.Tensor, hcol: torch.Tensor, player: torch.Tensor) -> None:
        """`freeRaidSignal` for a blow on a city's district (0x276d90) where
        `mask`: the city held at (`hrow`, `hcol`) [B] a Free City, the
        attacker's player `player` [B] (none, the Free Cities: none) starts
        its raid"""
        m = mask & (hrow == self.FREE_ROW) & (player >= 0) & (player != FREE_SEAT)
        if not bool(m.count_nonzero()):
            return
        for j in range(self.RC):
            g = m & (hcol == j)
            if bool(g.count_nonzero()):
                self._free_raid_start(g, j, player)

    def _free_raid_plot(self, mask: torch.Tensor, plot: torch.Tensor, player: torch.Tensor) -> None:
        """`freeRaidSignal` for a Free City's plot `plot` [B] (its centre, a
        district or an improvement of its pillaged, 0x276e70 / 0x276ff0) by
        `player`'s unit on it: the Free City holding the plot starts its
        raid"""
        m = mask & (plot >= 0) & (player >= 0) & (player != FREE_SEAT)
        if not bool(m.count_nonzero()):
            return
        row = self.FREE_ROW
        pc = plot.clamp(min=0).unsqueeze(1)
        al = self.city_alive[:, row, :self.RC]
        owned = (self.tile_seat.gather(1, pc).squeeze(1) == FREE_SEAT)
        tcity = self.tile_city.gather(1, pc).squeeze(1)
        for j in range(self.RC):
            at = al[:, j] & ((self.city_center[:, row, j] == plot)
                             | (owned & (tcity == self.city_id[:, row, j])))
            g = m & at
            if bool(g.count_nonzero()):
                self._free_raid_start(g, j, player)
                m = m & ~g

    def _free_raid_check(self, act: torch.Tensor, j: int) -> None:
        """`freeRaidCheck` (0x274010's head): the Free City in column `j`'s
        raid's tree gone, its record's tree cleared, the player kept"""
        rec = self.city_free_raid[:, self.FREE_ROW, j]
        op = rec[:, 1]
        gone = act & (op >= 0) & ~self._mops_live(self.FR, op)
        rec[:, 1] = torch.where(gone, -1, op)


class _DefenseAs:
    """a city's pick facts with the defensive pick's flag set as given
    (the defensive cancel's plain building and defensive unit)"""

    def __init__(self, f, on: int):
        self._f, self._on = f, on

    def __getattr__(self, name):
        return getattr(self._f, name)

    def defense(self):
        return self._on


class _PlotCtx:
    """the planes the plot facts of one minor's analysis share"""

    def __init__(self, sim, s: int, f: _MinorFacts, plots: torch.Tensor, owned: torch.Tensor, b_tab: list):
        self.sim, self.s, self.f = sim, s, f
        # the city centre's BUILDINGS table, [B] per building row
        self.b_tab = b_tab
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
        # the plots' own pillaged district whose repair is valued, None none
        self.repair_of = None

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
        return self.ctx.get("erupt", self.sim._minor_eruption_turns)[self.bb, self.tiles]

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
        out = plane[self.bb, self.tiles, _YIELDS.index(y)].long()
        # a Farm's Food per whole group of live Farms beside the plot, at the
        # research's adjacency row (`improvementAdjacency`)
        if k == sim.FARM and y == "YIELD_FOOD":
            def farms():
                nb = sim.neigh
                live = (sim.improvement == sim.FARM) & ~sim.pillaged
                n = (live[:, nb.clamp(min=0)] & (nb >= 0).unsqueeze(0)).sum(dim=2)
                per, food = sim._farmadj_row(sim._seat_civics(self.ctx.row), sim._seat_techs(self.ctx.row))
                pc = per.clamp(min=1).unsqueeze(1)
                return torch.where((per > 0).unsqueeze(1), food.unsqueeze(1) * torch.div(n, pc, rounding_mode="floor"),
                                   torch.zeros_like(n))
            out = out + self.ctx.get("farmadj", farms)[self.bb, self.tiles].long()
        return out

    def housing_value(self, housing, t, h):
        sim = self.sim
        g = self.mf.growth()
        fc = self.mf._get("fc", lambda: sim._cv_forecast(g))
        gn = {k: v.take(self.bb) for k, v in g.items()}
        fcn = tuple(x[self.bb] for x in fc)
        return sim._cv_housing_value(gn, fcn, housing, t, h)

    def resource_value(self, res, count, t, h):
        return self.sim._cv_resource_value(self.s, self.mf, res, count, t, h, self.bb)

    def buildings_value(self, d):
        """the most the city's analysis values a building of district `d`
        (its centre's BUILDINGS row), per element; FX(-9999) none"""
        best = torch.full_like(self.like(), _FX_MIN)
        for i, b in enumerate(self.sim._cv_tables()["bld_rows"]):
            if b["district"] == d:
                best = torch.maximum(best, self.ctx.b_tab[i].take(self.bb))
        return best

    def accumulation_pct(self):
        """the city's percent more accumulation on each plot's terrain
        (EFFECT_ADJUST_EXTRA_ACCUMALATION_TERRAIN, the row's rate rows)"""
        sim, row = self.sim, self.ctx.row
        pct = self.like()
        for _sc, _sl, _sr, _st, _sa, _sp in sim._live_rows(row, sim._stockpile_rate_rows):
            if _st >= 0 and _sp:
                on = sim._row_is(row, _sc, _sl).take(self.bb) & (sim.terrain[self.bb, self.tiles] == _st)
                pct = pct + on.long() * _sp
        return pct

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
        return self.repair_of

    def plot_district_pillaged(self):
        return 1 if self.repair_of is not None else 0

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
        # its danger map as the trees first read it in the turn (`dangerPlane`)
        self._danger = None
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
        return self.sim._minor_under_threat(self.s, self._threat)

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

    def founded_turn(self):
        return self.sim.citystate_founded_turn[:, self.s]

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
            # held complete and unpillaged (a pillaged one's repair it takes)
            return ((sim.district == dv) & sim.district_complete & ~sim.district_pillaged
                    & (sim.tile_seat == self.seat)).any(dim=1)
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
        # Build Unit's test reads the city's buildings, not its queue
        return self._rows_apply(row, lambda r: _t(self.f.has_building(names[r]), self.f.like()).bool())

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
            # the plot of its own pillaged district takes that district's repair
            dv = int(self.E["district"][int(r)]) if int(r) < len(self.E["district"]) else -1
            if dv >= 0 and flat.shape[1] > 0:
                rep = torch.stack([sim._minor_repairs_district_at(self.s, dv, flat[:, k]) for k in range(flat.shape[1])], dim=1)
                v = v | rep.reshape(plot.shape)
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
        # a plot holding an improvement takes none but its own pillaged
        # one's repair
        cur = sim.improvement.gather(1, flat_p).reshape(plot.shape)
        pil = sim.pillaged.gather(1, flat_p).reshape(plot.shape)
        free = (cur < 0) | ((cur == k) & pil)
        return v & free & (imp >= 0) & (k >= 0) & (plot >= 0)

    def plot_owner(self, plot):
        sim = self.sim
        flat = plot.reshape(sim.B, -1)
        return sim.tile_seat.gather(1, flat.clamp(min=0)).reshape(plot.shape)

    def plot_ground(self, plot):
        """`plotGround` at [B] plots: the engine feature and the engine
        resource the minor sees there, -1 none"""
        sim = self.sim
        p = plot.clamp(min=0)
        b = sim._bidx
        fid = sim.feat_id[b, p]
        live_f = (fid >= 0) & ~sim.feat_stripped[b, p]
        seen = sim._res_live()[b, p] & ~sim._res_hidden(sim._CITY_MINOR0 + self.s)[b, p]
        return torch.where(live_f, fid, -1), torch.where(seen, sim.res_id[b, p], -1)

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
        """[B, U] per unit of `among` ([B, U]) the turns it takes to stand on
        the plot, 0 none — with Movement left there where `moves` asks it:
        one turn its planning (`reachPlots`), no limit its path
        (`turnsToPlot`: the path's search under flag 0x1000)"""
        sim = self.sim
        u = self.units()
        out = torch.zeros_like(u["id"])
        lo = sim.POOL_LO["major"]
        for j in range(u["id"].shape[1]):
            m = u["valid"][:, j] & (plot >= 0) & among[:, j]
            if not bool(m.count_nonzero()):
                continue
            rows = m.nonzero(as_tuple=True)[0]
            # one turn: the whole planning; no limit: the path, stopped once
            # the plot closes
            one = max_turns == 1
            res = sim._tac_search(rows, u["id"][rows, j] - lo, self.seat, max_turns, not one,
                                  None if one else plot[rows], pre="major", later_turns=not one)
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

    def _danger_map(self):
        if self._danger is None:
            need = torch.ones(self.sim.B, self.sim.T, dtype=torch.bool, device=self.sim.device)
            self._danger = self.sim._danger_plane(self.seat, need)
        return self._danger

    def danger(self, plot):
        """[B] the danger map at the plot (0x716a60)"""
        return self._danger_map().gather(1, plot.clamp(min=0).unsqueeze(1)).squeeze(1)

    def order(self, uid, kind, plot, imp, mask, safe: bool = False):
        sim = self.sim
        lo = sim.POOL_LO["major"]
        g = uid.clamp(min=lo) - lo
        alive = mask & (uid >= lo) & sim.major_unit_alive.gather(1, g.unsqueeze(1)).squeeze(1) \
            & (sim.major_unit_seat.gather(1, g.unsqueeze(1)).squeeze(1) == self.seat)
        if not bool(alive.count_nonzero()):
            return
        if kind == "move":
            # a move with `safe` takes no walk ending on a plot of danger
            sim._tac_move_to(alive, g, plot, pre="major", seat=self.seat, strike=False,
                             avoid=(self._danger_map() > 0) if safe else None)
            sim._gen_ver += 1
            return
        here = alive & (sim.major_unit_tile.gather(1, g.unsqueeze(1)).squeeze(1) == plot)
        if not bool(here.count_nonzero()):
            return
        ch = sim.major_unit_charges.gather(1, g.unsqueeze(1)).squeeze(1)
        pc = plot.clamp(min=0)
        cur = sim.improvement[sim._bidx, pc]
        if kind == "improve":
            k = self._ei.take(imp.clamp(min=0))
            # the repair of the plot's own pillaged improvement: no charge
            fix = here & (imp >= 0) & (k >= 0) & (cur == k) & sim.pillaged[sim._bidx, pc]
            if bool(fix.count_nonzero()):
                rr = fix.nonzero(as_tuple=True)[0]
                sim.pillaged[rr, pc[rr]] = False
                sim.unit_mp[rr, uid[rr]] = 0
                sim._eff_version += 1
                sim._gen_ver += 1
            lay = here & (imp >= 0) & (k >= 0) & ~fix
            spent = lay & (ch <= 1)
            if bool(spent.count_nonzero()):
                self._spent.append(torch.where(spent, uid, -1))
            if bool(lay.count_nonzero()):
                rr = lay.nonzero(as_tuple=True)[0]
                tt = plot[rr]
                sim.improvement[rr, tt] = k[rr]
                sim.pillaged[rr, tt] = False
                sim._eff_version += 1
                sim._spend_build_charge(rr, uid, plot)
                sim._gen_ver += 1
                # an improvement laid re-places the citizens of the city it
                # stands in (0xa4cee0 -> 0x196320)
                sim._minor_replace_citizens(self.s, lay & (sim.tile_seat[sim._bidx, pc] == self.seat))
            return
        # the plot's improvement goes first, at no charge; then its feature,
        # else its resource
        rem = here & (cur >= 0)
        if bool(rem.count_nonzero()):
            rr = rem.nonzero(as_tuple=True)[0]
            sim.improvement[rr, pc[rr]] = -1
            sim.pillaged[rr, pc[rr]] = False
            sim.unit_mp[rr, uid[rr]] = 0
            sim._eff_version += 1
        rest = here & ~rem
        spent = rest & (ch <= 1)
        if bool(spent.count_nonzero()):
            self._spent.append(torch.where(spent, uid, -1))
        sim._minor_clear(self.s, rest, uid, plot)
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
