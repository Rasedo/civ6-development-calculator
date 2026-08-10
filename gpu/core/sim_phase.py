"""The seat phase: rules processing for the civ seats (yields, growth, borders, completion, loyalty, transfers).

One mixin of BatchSim (assembled in engine.py); state and helpers live on
self / gpu/core/simbase.py.
"""
from __future__ import annotations

from .simbase import *  # noqa: F401,F403 — torch, constants, helpers: the shared floor
from .simbase import _MUTABLE  # noqa: F401 — private names do not ride a star import
from . import simbase  # the PATCHABLE globals (POOL_MAX/SEAT0_POOL_MAX/_ALIAS_CHECK) must be read live


class SimPhase:
    def _seat_phase(
        self,
        production: torch.Tensor | None = None,
        tech: torch.Tensor | None = None,
        civic: torch.Tensor | None = None,
        envoy: torch.Tensor | None = None,
        war: torch.Tensor | None = None,
    ) -> None:
        """Runs EVERY seat in id order — the seatPhase twin. Row 0 (seat 0,
        driven by the wire arguments) takes its turn first through _seat0_row;
        the civ rows follow through the loop below, one body each.

        Per seat: ww decay, boosts, CS diplomacy/quests, record picks, the
        buy ladder, trade, per-city economy (yields, growth, queue progress/
        completion — settlers and units spawn at their own city), border
        growth, loyalty, research, upkeep, great-people/pantheon/belief races
        (draws), then war or peace acts with their end-of-branch rolls."""
        rr, B, dev = self.rules.seats, self.B, self.device
        # Freeze the MAJORS' aura MP here: the seatPhase movesLeft reset
        # covers every isCiv unit — seat 0's pool included — ahead of any
        # general war-walk, so both engines read the same pre-move general
        # positions.
        if self.units_mode:
            self._refresh_aura_mp()
            self._reset_mp("seat0")
        if self.R > 0:
            self._refresh_aura_mp_civ()
        # The geopolitics arms run BEFORE the per-seat loop — denounce and
        # alliance first (a fresh grudge blocks a same-turn alliance and
        # starts the formal clock), then the declarations in ACTOR order
        # (seat 0's declare arm leads, then the civ↔civ pass — the war is
        # live for both sides' war-acts this turn); peace at the tail.
        if self.R > 0:
            self._geo_denounce_and_ally()
        # Seat 0 declares through the geo pass like every seat (the rec.war
        # self-guard's twin: its own war column can never mean itself). The
        # arm re-validates against the LIVE mask at this position.
        if war is not None and self._rl_war_active and self.R > 0:
            w0 = war.to(torch.long)
            ok0 = self.alive.any(dim=1) & (w0 >= 0) & self.war_mask().gather(1, w0.clamp(min=0).unsqueeze(1)).squeeze(1)
            decl = ok0 & (w0 < self.R)
            if bool(decl.any()):
                oh = torch.nn.functional.one_hot(w0.clamp(min=0, max=self.R - 1), self.R).bool() & decl.unsqueeze(1)
                self.civ_only_atwar.logical_or_(oh)
                self.war[:, 1:1 + self.civ_only_atwar.shape[1], 0] |= oh
                self.civ_only_warturns.copy_(torch.where(oh, torch.zeros_like(self.civ_only_warturns), self.civ_only_warturns))
        if self.R > 0:
            self._geo_declare_wars()
        # ROW 0: seat 0's whole turn, through the same body order as every
        # civ row below (the TS loop iterates state.seats — seat 0 first).
        self._seat0_row(production=production, tech=tech, civic=civic, envoy=envoy)
        for r in range(self.R):
            n_cities = self.civ_city_alive[:, r].sum(dim=1)
            active = self.civ_only_alive[:, r] & (n_cities > 0)
            # The driven production pick applies HERE — after seat 0's units
            # have already acted this turn.
            self._consume_driven_picks(r)
            if not bool(active.any()):
                continue
            # War weariness SETTLES here: accrual happens per BATTLE as the
            # fighting resolves, so what is left for the block top is the
            # decay. The same function every seat calls, on this civ's row.
            # civ_pair_war is fixed for the turn by the phase-top declaration pass,
            # so the "at war with somebody" test inside is stable.
            self._ww_decay(r + 1, active)
            # Eurekas/inspirations from this seat — the TS twin runs at the
            # same point (the seat's block top).
            self._detect_seat_boosts(r, active)
            # The CS-diplomacy block sits right after boost detection — the
            # seatPhase position.
            self._seat_cs_phase(r, active)
            # CS quests resolve/issue right after the envoy accrual (the
            # seatPhase quest block sits at the tail of the same CS block), so
            # a completed quest's envoy is visible to the levy suzerain test
            # later this phase. Row addressing: civ r is seat row r+1.
            self._seat_quest_phase(r + 1, active)
            # Queue PICKS for the PRE-TURN city set, in slot order: the FIRST
            # idle city takes the settler (one in flight per civ), everyone
            # else trains units up to the cap. Counts update sequentially, like
            # the TS pick loop — that sequencing is load-bearing.
            # Best-of-roster type pick, data-driven over the unit tables. This
            # civ's per-unit strategic access and trainable mask (requiresTech
            # satisfied over the FULL tech tree civ_only_techs, via _type_tech; -1 =
            # ungated) gate both lanes.
            tr_u_r = self._seat_trainable_units(r)  # [B, NU]
            rng_type = self._type_ranged_strength > 0  # [NU]
            # melee lane: highest combat among non-ranged non-naval military;
            # ranged lane: highest ranged strength among ranged non-naval units.
            # key = strength·NU − idx ⇒ argmax ties to the LOWEST unit index =
            # the TS strict-`>` first-wins over UNITS-table order. WARRIOR /
            # SLINGER are ungated so each lane always has a candidate; SCOUT
            # (combat 10) is dominated by WARRIOR (20); BUILDER is combat 0.
            # Army composition — military only (builders excluded via combat
            # 0), live + queued, updated through the pick loop like TS's
            # meleeCount/rangedCount; train ranged while the army holds fewer
            # than 1 ranged per 2 melee.
            vt_all = self.civ_unit_type.clamp(min=0, max=self.NU - 1)
            mil_live = self.civ_unit_alive & (self.civ_unit_civ == r) & (self._type_combat[vt_all] > 0)
            n_ranged = (mil_live & rng_type[vt_all]).sum(dim=1)
            n_melee = (mil_live & ~rng_type[vt_all]).sum(dim=1)
            qcur = self.civ_city_current[:, r]
            q_ty = (qcur - 1).clamp(min=0, max=self.NU - 1)
            q_mil = (qcur >= 1) & (qcur <= self.NU) & (self._type_combat[q_ty] > 0)
            n_ranged = n_ranged + (q_mil & rng_type[q_ty]).sum(dim=1)
            n_melee = n_melee + (q_mil & ~rng_type[q_ty]).sum(dim=1)
            # Production picks arrive on the wire (_consume_driven_picks
            # above); a seat with no record queues nothing.
            # ONE gold purchase per civ per turn, priority BUILDING > SETTLER >
            # UNIT. Building: the cheapest completable building anywhere in the
            # civ (cost, then catalog id, then city slot), bought INSTANTLY at
            # goldPurchaseMult×. A building queued in that same city is skipped
            # (completion would duplicate it). exclusiveWith stays TS-only,
            # absent from the GPU catalog like the queue paths. `bought_r5`
            # threads the priority: settler/unit run only where no building was
            # bought (the apply_seat_actions purchase spec).
            bought_r5 = torch.zeros(B, dtype=torch.bool, device=dev)
            if self.districts_on:
                # _seat_buy_candidates is the SHARED legality body: this block
                # and the wire driver's _buy_ctx are its two consumers. Driven
                # rows consume the wire's BUY intent at THIS position.
                bought_r5 = bought_r5 | self._consume_driven_buy(r, active)
                jj6, bb6, can6, price6, _ = self._seat_buy_candidates(r, active)
                can6 = can6 & torch.zeros(self.B, dtype=torch.bool, device=self.device)  # force-False: only the wire's intent buys
                if bool(can6.any()):
                    self._seat_buy_building(r, can6, jj6, bb6, price6)
                    bought_r5 = bought_r5 | can6

            # Kind 1: the SETTLER buy is a UNIT purchase. It spawns at the
            # capital (else the first alive city), which must have the pop to
            # pay (a 1-pop city may not buy one) — WHERE it founds is a later
            # FOUND_CITY order, not part of the purchase. Only the wire's
            # kind-1 intent reaches this rung.
            mult_r5 = self.rules.gold_purchase_mult
            n_cities = self.civ_city_alive[:, r].sum(dim=1)
            _sq_r = (self.civ_city_alive[:, r] & (self.civ_city_current[:, r] == 0)).sum(dim=1)
            sett_price5 = (
                rr.get("settlerBase", 48)
                + rr.get("settlerPer", 18)
                * (n_cities - 1 + self._civ_only_settlers_of(r) + _sq_r).clamp(min=0).to(self.dtype)
            ) * mult_r5
            dbuy_s = getattr(self, "_driven_buy_settler", None)
            if dbuy_s is not None and r in dbuy_s and self._settler_idx >= 0:
                cap_is_s = self.civ_city_is_cap[:, r]
                has_cap_s = cap_is_s.any(dim=1)
                spawn_slot_s = torch.where(has_cap_s, cap_is_s.long().argmax(dim=1), self.civ_city_alive[:, r].long().argmax(dim=1))
                ctr_s = self.civ_city_center[:, r].gather(1, spawn_slot_s.unsqueeze(1)).squeeze(1).clamp(min=0)
                pop_s = self.civ_city_pop[:, r].gather(1, spawn_slot_s.unsqueeze(1)).squeeze(1)
                want_ds = dbuy_s.pop(r) & active & self.controlled[:, r] & ~bought_r5 \
                    & (n_cities > 0) & (pop_s >= 2) & self._afford(self.civ_only_treasury[:, r], sett_price5)
                if bool(want_ds.any()):
                    landed_ds = self._spawn_unit(r + 1, want_ds, ctr_s, self._settler_idx)
                    self.civ_only_treasury[:, r] = torch.where(landed_ds, self.civ_only_treasury[:, r] - sett_price5, self.civ_only_treasury[:, r])
                    # purchased settlers cost the spawn city a pop (real Civ 6)
                    _bidx_ds = torch.arange(self.B, device=dev)
                    _pop_col = self.civ_city_pop[_bidx_ds, r, spawn_slot_s]
                    self.civ_city_pop[_bidx_ds, r, spawn_slot_s] = torch.where(
                        landed_ds, (_pop_col - 1).clamp(min=1), _pop_col)
                    bought_r5 = bought_r5 | landed_ds
            # MILITARY UNIT — nothing else bought and live+queued military
            # under the quota (2× cities). Buy the STRONGEST affordable
            # trainable military unit (highest _type_combat, ties to lowest unit
            # index = table order), spawned via _spawn_unit at the capital
            # (else the first alive city); pay only where it LANDED (no free
            # spot = refund).
            mil_count5 = n_melee + n_ranged
            # Kind 2: this rung fires only on the wire's intent; re-validation
            # below is the shared candidate body + quota.
            dbuy_u5 = getattr(self, "_driven_buy_unit", None)
            drv_u5 = torch.zeros(B, dtype=torch.bool, device=dev)
            if dbuy_u5 is not None and r in dbuy_u5:
                drv_u5 = dbuy_u5.pop(r) & self.controlled[:, r]
            want_u5 = active & ~bought_r5 & (mil_count5 < 2 * n_cities) & drv_u5
            if bool(want_u5.any()):
                # Candidate = every non-naval military unit the civ has the
                # tech + strategic access for (_seat_buy_unit_candidates, the
                # one body this rung shares with the wire's _buy_ctx).
                cand_u5 = self._seat_buy_unit_candidates(r, tr_u_r)
                elig_u5 = want_u5 & cand_u5.any(dim=1)
                if bool(elig_u5.any()):
                    # highest combat wins; combat·NU − index breaks ties to the
                    # lowest index (table order), matching the TS strict-`>` scan
                    key_u5 = self._type_combat.double().unsqueeze(0) * self.NU - torch.arange(self.NU, device=dev, dtype=torch.float64).unsqueeze(0)
                    key_u5 = torch.where(cand_u5, key_u5.expand(B, -1), torch.full((B, self.NU), -1e18, dtype=torch.float64, device=dev))
                    pick_ty5 = key_u5.argmax(dim=1)
                    cap_is5 = self.civ_city_is_cap[:, r]
                    has_cap5 = cap_is5.any(dim=1)
                    spawn_slot5 = torch.where(has_cap5, cap_is5.long().argmax(dim=1), self.civ_city_alive[:, r].long().argmax(dim=1))
                    ctr5 = self.civ_city_center[:, r].gather(1, spawn_slot5.unsqueeze(1)).squeeze(1).clamp(min=0)
                    # A bought military unit inherits the SPAWN city's (capital, else first alive) Encampment training XP.
                    bidx5 = torch.arange(self.B, device=self.device)
                    xp_cap5 = (self.civ_city_bldg[bidx5, r, spawn_slot5].long() * self._b_train_xp.reshape(1, -1)).max(dim=1).values
                    landed_u5 = self._spawn_unit(r + 1, elig_u5, ctr5, pick_ty5, init_xp=xp_cap5)
                    price_u5 = self._type_cost.gather(0, pick_ty5).double() * mult_r5
                    self.civ_only_treasury[:, r] = torch.where(landed_u5, self.civ_only_treasury[:, r] - price_u5, self.civ_only_treasury[:, r])
                    bought_r5 = bought_r5 | landed_u5
            # Kind 4: the WORSHIP faith buy is a wire DECISION — the driver
            # names the city SLOT. Re-validation here is the
            # buyWorshipBuilding twin: founded religion, TEMPLE, complete
            # unpillaged Holy Site, no worship building yet, afford the flat
            # worshipFaithCost. The building's identity is a RULE:
            # WORSHIP_BUILDINGS[(r+1) % 5] (owner religion = civ index + 1).
            # Faith is a separate currency — independent of bought_r5.
            dbuy_w = getattr(self, "_driven_buy_worship", None)
            if dbuy_w is not None and r in dbuy_w:
                wj5 = dbuy_w.pop(r)
                if self._worship_bidx and self._temple_bidx >= 0 and self._hs_idx >= 0:
                    wb5 = self._worship_bidx[(r + 1) % len(self._worship_bidx)]
                    want_w5 = active & self.controlled[:, r] & (wj5 >= 0) & self.civ_only_religion_done[:, r] \
                        & self._afford(self.civ_only_faith[:, r], self._worship_cost)
                    if wb5 >= 0 and bool(want_w5.any()):
                        bidx_w = torch.arange(B, device=dev)
                        jw5 = wj5.clamp(min=0, max=self.RC - 1)
                        hs_t5 = self.civ_city_dist_tile[bidx_w, r, jw5, self._hs_idx]  # [B]
                        hs_ok5 = (hs_t5 >= 0) & self.district_complete[bidx_w, hs_t5.clamp(min=0)] & ~self.district_pillaged[bidx_w, hs_t5.clamp(min=0)]
                        buy_w5 = want_w5 & self.civ_city_alive[bidx_w, r, jw5] & ~self.civ_city_bldg[bidx_w, r, jw5, wb5] \
                            & self.civ_city_bldg[bidx_w, r, jw5, self._temple_bidx] & hs_ok5
                        if bool(buy_w5.any()):
                            rows_w5 = buy_w5.nonzero(as_tuple=True)[0]
                            self.civ_city_bldg[rows_w5, r, jw5[rows_w5], wb5] = True
                            self._eff_version += 1  # invariant: every civ_city_bldg write bumps it
                            self.civ_only_faith[:, r] = torch.where(buy_w5, self.civ_only_faith[:, r] - self._worship_cost, self.civ_only_faith[:, r])
            # Kind 5: MISSIONARY — after the worship buy (the phase.ts order;
            # worship saturates first). A wire DECISION: the driver names the
            # SLOT; re-validation is the purchaseReligiousUnit twin — founded,
            # cap missionaryCap LIVE, enhancer-adjusted price (mcost pad 60,
            # HOLY_ORDER row 42 — exporter-rounded integers), SHRINE + COMPLETE
            # unpillaged Holy Site at the NAMED city, spawn at its center via
            # the civilian spawner (no free spot = refund). SCRIPTURE ships
            # mchg=+1 charge, applied at purchase. `_bought_relig` threads the
            # one-religious-unit rule.
            _bought_relig = torch.zeros(B, dtype=torch.bool, device=dev)
            dbuy_rel = getattr(self, "_driven_buy_relig", None)
            if dbuy_rel is not None and r in dbuy_rel:
                rel_kind, rel_j = dbuy_rel.pop(r)
            else:
                rel_kind, rel_j = None, None
            if rel_kind is not None and rel_j is not None and self._missionary_idx >= 0 and self._shrine_bidx >= 0 and self._hs_idx >= 0:
                n_live_m5 = (self.civ_unit_alive & (self.civ_unit_civ == r) & (self.civ_unit_type == self._missionary_idx)).sum(dim=1)
                mcost5 = self._enh["mcost"][self.civ_only_enhancer[:, r] + 1]  # [B] f64
                want_m5 = active & self.controlled[:, r] & (rel_kind == 5) & (rel_j >= 0) & self.civ_only_religion_done[:, r] \
                    & (n_live_m5 < self._missionary_cap) & self._afford(self.civ_only_faith[:, r], mcost5)
                if bool(want_m5.any()):
                    bidx_m = torch.arange(B, device=dev)
                    jm5 = rel_j.clamp(min=0, max=self.RC - 1)
                    hs_tm5 = self.civ_city_dist_tile[bidx_m, r, jm5, self._hs_idx]  # [B]
                    hs_okm5 = (hs_tm5 >= 0) & self.district_complete[bidx_m, hs_tm5.clamp(min=0)] & ~self.district_pillaged[bidx_m, hs_tm5.clamp(min=0)]
                    buy_m5 = want_m5 & self.civ_city_alive[bidx_m, r, jm5] & self.civ_city_bldg[bidx_m, r, jm5, self._shrine_bidx] & hs_okm5
                    if bool(buy_m5.any()):
                        at_m5 = self.civ_city_center[bidx_m, r, jm5].clamp(min=0)
                        chg_m5 = self._type_charges[self._missionary_idx] + self._enh["mchg"][self.civ_only_enhancer[:, r] + 1]
                        landed_m5 = self._spawn_unit(r + 1, buy_m5, at_m5, self._missionary_idx, charges=chg_m5)
                        self.civ_only_faith[:, r] = torch.where(landed_m5, self.civ_only_faith[:, r] - mcost5, self.civ_only_faith[:, r])
                        _bought_relig = _bought_relig | landed_m5
            # Kind 6: the APOSTLE buy — the missionary block's twin, run AFTER
            # it so the cheaper unit saturates first (the TS ordering). A wire
            # DECISION on the NAMED slot, same SHRINE + complete unpillaged
            # HOLY_SITE gate, same spawn-refund convention.
            if rel_kind is not None and rel_j is not None and self._apostle_idx >= 0 and self._shrine_bidx >= 0 and self._hs_idx >= 0:
                n_live_a = (self.civ_unit_alive & (self.civ_unit_civ == r) & (self.civ_unit_type == self._apostle_idx)).sum(dim=1)
                # FLAT cost — missionaryCostMult is a MISSIONARY discount and
                # does not extend to apostles.
                acost = torch.full((self.B,), float(round(self._apostle_cost)), dtype=torch.float64, device=self.device)
                # ONE religious unit per civ per turn — skip rows that just
                # bought a missionary (the boughtRelig twin), regardless of
                # what the wire asks.
                want_a = active & self.controlled[:, r] & (rel_kind == 6) & (rel_j >= 0) & self.civ_only_religion_done[:, r] \
                    & ~_bought_relig & (n_live_a < self._apostle_cap) & self._afford(self.civ_only_faith[:, r], acost)
                if bool(want_a.any()):
                    bidx_a = torch.arange(B, device=dev)
                    ja5 = rel_j.clamp(min=0, max=self.RC - 1)
                    hs_ta = self.civ_city_dist_tile[bidx_a, r, ja5, self._hs_idx]  # [B]
                    hs_oka = (hs_ta >= 0) & self.district_complete[bidx_a, hs_ta.clamp(min=0)] & ~self.district_pillaged[bidx_a, hs_ta.clamp(min=0)]
                    buy_a = want_a & self.civ_city_alive[bidx_a, r, ja5] & self.civ_city_bldg[bidx_a, r, ja5, self._shrine_bidx] & hs_oka
                    if bool(buy_a.any()):
                        at_a = self.civ_city_center[bidx_a, r, ja5].clamp(min=0)
                        landed_a = self._spawn_unit(r + 1, buy_a, at_a, self._apostle_idx, charges=self._type_charges[self._apostle_idx].expand(self.B))
                        self.civ_only_faith[:, r] = torch.where(landed_a, self.civ_only_faith[:, r] - acost, self.civ_only_faith[:, r])
            # Kind 3: TILE PURCHASE — the LAST rung of the gold ladder, a wire
            # DECISION. Position matters: the buy sits in the gold block, which
            # runs BEFORE _seat_border_growth, and a claim feeds the yields
            # computed in between — so this must NOT be folded into the border
            # walker. The driver names [tile, slot] (candidate + key from the
            # SHARED _seat_tile_buy_candidate — the same _seat_border_key pick
            # the culture claim uses); re-validation here is the buyTile twin:
            # the NAMED tile must be unclaimed, adjacent to the NAMED city's
            # own territory, within radius 5, and afforded at the LIVE price
            # (_seat_tile_price — ring base, research mult, empire escalator,
            # this seat's OWN tilePurchaseMult). The claim does NOT advance
            # civ_city_cbox (purchases and culture keep separate clocks), but
            # civ_city_acquired DOES (the next border tile costs more however this
            # one was gained). `bought_r5` is the gold ladder's one-purchase
            # priority thread.
            dbuy_t = getattr(self, "_driven_buy_tile", None)
            if dbuy_t is not None and r in dbuy_t:
                rows_t, tile_t, slot_t = dbuy_t.pop(r)
                want_t = rows_t & active & self.controlled[:, r] & ~bought_r5 & (slot_t >= 0) & (tile_t >= 0)
                if bool(want_t.any()):
                    bidx_t = torch.arange(B, device=dev)
                    jt5 = slot_t.clamp(min=0, max=self.RC - 1)
                    tt5 = tile_t.clamp(min=0, max=self.owner.shape[1] - 1)
                    ctr_t = self.civ_city_center[bidx_t, r, jt5].clamp(min=0)
                    ok_t = want_t & self.civ_city_alive[bidx_t, r, jt5] \
                        & (self.pair_dist[ctr_t, tt5] <= 5) \
                        & self._seat_tile_unclaimed(tt5.unsqueeze(1)).squeeze(1) \
                        & self._seat_tile_adj_city(r, self.civ_city_id[bidx_t, r, jt5], tt5.unsqueeze(1)).squeeze(1)
                    cost_t = self._seat_tile_price(r, ctr_t, tt5)
                    ok_t = ok_t & self._afford(self.civ_only_treasury[:, r], cost_t)
                    if bool(ok_t.any()):
                        _rows = ok_t.nonzero(as_tuple=True)[0]
                        self.civ_only_treasury[_rows, r] -= cost_t[_rows]
                        self.tile_seat[_rows, tt5[_rows]] = r + 1  # civ tile ownership lives in tile_seat
                        self._tile_owner_ver += 1  # one storage: nothing else to retag
                        self._reveal_around(_rows, r + 1, tt5[_rows], 1)  # acquireTile's revealAround(seat, tile, 1)
                        self.tile_city[_rows, tt5[_rows]] = self.civ_city_id[_rows, r, jt5[_rows]]
                        self.civ_city_acquired[_rows, r, jt5[_rows]] += 1
                        self.civ_only_tiles_purchased[_rows, r] += 1
                        self._eff_version += 1
                        bought_r5 = bought_r5 | ok_t
            # Kind 7: the LEVY — the levyUnits twin, AFTER every purchase (the
            # gold-block tail, just before the trade block: the seatPhase
            # position). A wire DECISION: the driver names the CS (at-war is
            # ITS policy gate, not a rule — levyUnits has no war test, so a
            # mid-turn peace does not refuse). Re-validation on the NAMED CS =
            # militaristic, suzerain (strict-most envoys, ≥ min, > seat 0, >
            # every other civ), levyCooldown ready (per-CS, SHARED across
            # seats — citystate_last_levy), afford levyGoldCost. Spawns levy_units_n
            # of the 2-step ladder (WARRIOR ≤ spearmanAfterTurn else SPEARMAN)
            # at the CS center. Payment + cooldown are UNCONDITIONAL on a free
            # spawn spot (levyUnits pays before spawnUnit).
            dlevy = getattr(self, "_driven_levy", None)
            if dlevy is not None and r in dlevy and self.S > 0:
                lv5 = dlevy.pop(r)
                Sl = self.S
                mil_idx_l = int(self.rules.citystate.get("militaristicIdx", -1))
                levy_cost = float(self.rules.citystate.get("levyGoldCost", 120))
                levy_units_n = int(self.rules.citystate.get("levyUnits", 2))
                suz_min_l = int(self.rules.citystate.get("suzerainEnvoys", 3))
                want_l = active & self.controlled[:, r] & (lv5 >= 0) & (lv5 < Sl)
                if bool(want_l.any()):
                    bidx_l = torch.arange(self.B, device=dev)
                    sl5 = lv5.clamp(min=0, max=Sl - 1)
                    mine_el = self.civ_only_citystate_envoys[bidx_l, r, sl5]  # [B]
                    oth_el = self.civ_only_citystate_envoys[:, :, :Sl].clone()
                    oth_el[:, r] = -1
                    oth_max_l = oth_el.max(dim=1).values[bidx_l, sl5]  # [B]
                    suz_rl = (  # suzerain: strict-most envoys, ≥ min, > seat 0, > every other civ
                        (mine_el >= suz_min_l)
                        & (mine_el > self.citystate_envoys[bidx_l, sl5])
                        & (mine_el > oth_max_l)
                        & self.citystate_alive[bidx_l, sl5]
                    )
                    ready_l = (self.turn - self.citystate_last_levy[bidx_l, sl5]) >= self._levy_cooldown
                    do_l = want_l & (self.citystate_type[bidx_l, sl5] == mil_idx_l) & suz_rl & ready_l \
                        & self._afford(self.civ_only_treasury[:, r], levy_cost)
                    if bool(do_l.any()):
                        at_l = self.citystate_center[bidx_l, sl5].clamp(min=0)
                        ltype = self._civ_only_spearman if self.turn > int(self.rules.combat.get("spearmanAfterTurn", 60)) else self._warrior_idx
                        ltype_t = torch.full((self.B,), ltype, dtype=torch.long, device=dev)
                        for _ in range(levy_units_n):
                            self._spawn_unit(r + 1, do_l, at_l, ltype_t)  # best-effort; refunds nothing (TS pays before spawnUnit)
                        self.civ_only_treasury[:, r] = torch.where(do_l, self.civ_only_treasury[:, r] - levy_cost, self.civ_only_treasury[:, r])
                        rows_l = do_l.nonzero(as_tuple=True)[0]
                        self.citystate_last_levy[rows_l, sl5[rows_l]] = self.turn
            # The trade creation block sits between the buy block and the
            # city-loop snapshot — the seatPhase position.
            self._seat_trade_phase(r, active)
            # The city-loop snapshot is taken AFTER the buy block (the
            # [...civ.cities] discipline): a bought-settler newborn acts this
            # turn (amenity + yields), a queue-completion newborn (founded
            # inside the loop, later) does not.
            alive_c = self.civ_city_alive[:, r].clone()

            # phase-top unlock snapshot
            prod_sum = torch.zeros(B, dtype=torch.float64, device=dev)
            sci_sum = torch.zeros(B, dtype=torch.float64, device=dev)
            cul_sum = torch.zeros(B, dtype=torch.float64, device=dev)
            gold_sum = torch.zeros(B, dtype=torch.float64, device=dev)
            faith_sum = torch.zeros(B, dtype=torch.float64, device=dev)
            # The amenity map freezes at the loop top (the luxMap discipline)
            # — loyalty, growth and yields all read it.
            amen_tidx, amen_gf, amen_yf = self._seat_amenity(r)
            # This civ's governor seats for THIS turn — the loop-top
            # governorPicks mirror (quantized milli loyalty snapshot, ties by
            # slot index == TS array order; alive-masked).
            _titles_r = (self.civ_only_civics[:, r].sum(dim=1) // self._gov_per).clamp(max=self._gov_max)  # [B]
            _q_rloy = js_round(self.civ_city_loyalty[:, r] * 1000).long()
            _gk = torch.where(self.civ_city_alive[:, r], _q_rloy * 64 + torch.arange(self.RC, device=dev).reshape(1, -1), torch.full_like(_q_rloy, 1 << 40))
            _gr = torch.empty_like(_gk)
            _gr.scatter_(1, _gk.argsort(dim=1, stable=True), torch.arange(self.RC, device=dev).expand(B, self.RC))
            civ_city_gov = (_gr < _titles_r.unsqueeze(1)) & self.civ_city_alive[:, r]  # [B, RC]
            civ_city_flip = torch.zeros(B, self.RC, dtype=torch.bool, device=dev)
            # Unbesieged cities heal the flat rate, war or not (real Civ 6) —
            # the same cityHealPerTurn rules field _barbarian_phase reads.
            heal = int(self.rules.combat.get("cityHealPerTurn", 20))
            # The Hanging-Gardens growth product reads the CIV-wide wonder
            # registry — identical for every j, so it is hoisted per r. A
            # wonder COMPLETION mid-loop (the only in-loop write to its inputs:
            # a settler founding only rewrites an all--1 free slot, product
            # term 1.0 either way) drops the cache and the next j recomputes
            # the same expression on the fresh state.
            gw_cache = None
            if self._wond_n:
                wregG = self.civ_city_wonder[:, r]  # [B, RC, nW]
                compG = (wregG >= 0) & self.built_wonder_complete.gather(1, wregG.clamp(min=0).reshape(B, -1)).reshape_as(wregG)
                gw_cache = torch.where(compG, self._wond_grow.reshape(1, 1, -1).expand_as(compG).double(), torch.ones_like(compG, dtype=torch.float64)).prod(dim=2).prod(dim=1)
            # One guard sync for the whole economy loop. This is exact because
            # alive_c is a pre-loop CLONE (a queue-completion newborn founded
            # inside the loop does not act this turn — the [...civ.cities]
            # discipline above) and `active` is a loop-invariant local, so the
            # precomputed columns equal a per-j compute.
            cact_all = active.unsqueeze(1) & alive_c  # [B, RC]
            cact_any_l = cact_all.any(dim=0).tolist()
            _rcy_bel = self._seat_has_beliefs(r + 1)  # capital fallback gate (capY live-pop)
            # The per-j housing/maintenance/growth-need math, batched over j.
            # Inputs are planes (eff-covered), own-column registries (a city's
            # own completions land at the END of its iteration, after these
            # values are consumed — no cross-column write exists), and ONE live
            # edge: civ_at at window tiles in the improvement-housing term (a
            # mid-loop border claim can put an ORPHANED improvement into a
            # later city's window), so the batch recomputes when
            # (_eff_version, _claim_version) moves — the same key discipline as
            # the yields cache. Every batched sum is dyadic/int-valued:
            # bit-exact in any shape.
            _gmul_r = self._bel_mul("growth", r + 1) if _rcy_bel else 1.0
            _riv_h = self._bel_add("river", r + 1)[:, 1] if _rcy_bel else None
            _fol_h_rc = self._follower_id_for(self._city_rel(r + 1)) if _rcy_bel else None
            _ctr_r = self.civ_city_center[:, r].clamp(min=0)  # [B, RC]

            def _g5_hm() -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
                dt_all = self.civ_city_dist_tile[:, r]  # [B, RC, nD]
                dd_all = (dt_all >= 0) & self.district_complete.gather(1, dt_all.clamp(min=0).reshape(B, -1)).reshape_as(dt_all)
                maint = (self._d_maint.reshape(1, 1, -1) * dd_all.to(torch.float64)).sum(dim=2)
                maint = maint + torch.einsum("bjn,n->bj", self.civ_city_bldg[:, r].to(torch.float64), self.rules_dev.b_maintenance.double())
                wh = self.tile_wh.gather(1, _ctr_r)  # [B, RC]
                fresh = wh == float(self._h_fresh)
                if self._aqueduct_idx >= 0:
                    aq_t = self.civ_city_dist_tile[:, r, :, self._aqueduct_idx]  # [B, RC]
                    has_aq = (aq_t >= 0) & self.district_complete.gather(1, aq_t.clamp(min=0)) & ~self.district_pillaged.gather(1, aq_t.clamp(min=0))
                else:
                    has_aq = torch.zeros(B, self.RC, dtype=torch.bool, device=dev)
                water = torch.where(
                    has_aq,
                    torch.where(fresh, wh + self._aq_fresh_bonus, torch.maximum(wh, torch.full_like(wh, self._aq_no_fresh_total))),
                    wh,
                )
                selb_h = self.civ_city_bldg[:, r] & ~self._civ_city_bdark(dt_all)  # buildings in a pillaged district give no housing
                bh = selb_h.double() @ self.rules.b_housing.to(dev).double()  # [B, RC]
                win3a = tiles_from_offsets(_ctr_r.reshape(-1), self._off3, self.W, self.H).reshape(B, self.RC, -1)
                w3f = win3a.clamp(min=0).reshape(B, -1)
                imp_w3 = self.improvement.gather(1, w3f).reshape_as(win3a)
                # The tile must belong to THIS CITY, not merely to this civ:
                # Civ 6 pays the improvement's housing to the city whose
                # CULTURE BORDERS contain the tile, and a tile lies inside
                # exactly one. Keying on the civ alone would pay one Farm to
                # every same-civ city holding it in a radius-3 window.
                # https://civilization.fandom.com/wiki/Housing_(Civ6)
                _own_rc = self.tile_city.gather(1, w3f).reshape_as(win3a)  # [B, RC, M]
                imp_own = (
                    (win3a >= 0)
                    & (self.civ_at.gather(1, w3f).reshape_as(win3a) == r)
                    & (_own_rc == self.civ_city_id[:, r].unsqueeze(2))
                    & (imp_w3 >= 0)
                )
                farm = (self._imp_housing[imp_w3.clamp(min=0)].double() * imp_own.double()).sum(dim=2)
                # PALACE housing on the capital slot (civ_city_bldg holds the
                # founding PALACE; CITY_CENTER never pillages, so no darkness
                # gate), plus this seat's GOVERNMENT/POLICY housing — a
                # government belongs to the seat that ADOPTED it.
                _gpm = self._gov_policy_mods_cached(r, self.civ_only_civics[:, r])
                _gp_hous = _gpm[2].double()
                housing = water + bh + self._palace_housing * (self.civ_city_is_cap[:, r] & self.civ_city_alive[:, r]).double() + farm + _gp_hous.unsqueeze(1)
                # This civ's housingIfDistricts + newDeal housing, through the
                # applier every seat shares.
                _civ_city_all_d = ((self.civ_city_dist_tile[:, r] >= 0) & self.district_complete.gather(
                    1, self.civ_city_dist_tile[:, r].clamp(min=0).reshape(B, -1)).reshape_as(self.civ_city_dist_tile[:, r])).sum(dim=2)
                _rh, _ = self._cond_house_amen(_gpm[8], _gpm[9], _civ_city_all_d, self._civ_city_spec_count(r))
                housing = housing + _rh
                # Appeal-based NEIGHBORHOOD housing (the computeHousing twin).
                # rc tiles are keyed by the per-city registry tile_city, so
                # sum per rc SLOT over its own tiles.
                if self._nbhd_didx >= 0:
                    _ap = self._tile_appeal()
                    _hv = torch.full_like(_ap, self._appeal_floor)
                    for _cut, _val in sorted(self._appeal_cuts):
                        _hv = torch.where(_ap >= _cut, torch.full_like(_ap, _val), _hv)
                    _nb_ok = (self.district == self._nbhd_didx) & self.district_complete & ~self.district_pillaged
                    _mine = _nb_ok & (self.civ_at == r)
                    _srcd = (_hv * _mine.long()).double()
                    _rid = self.tile_city  # [B, T] persistent rc id, -1 = none
                    _nbh = torch.zeros_like(housing)
                    for _j in range(self.RC):
                        _idj = self.civ_city_id[:, r, _j].unsqueeze(1)  # [B, 1]
                        _nbh[:, _j] = (_srcd * ((_rid == _idj) & (_idj >= 0)).double()).sum(dim=1)
                    housing = housing + _nbh
                if _rcy_bel:
                    housing = housing + torch.einsum("bjn,bjn->bj", selb_h.double(), self._fol_tab("bldgH", _fol_h_rc))
                    housing = housing + _riv_h.unsqueeze(1) * self.tile_river.gather(1, _ctr_r).double()
                p64a = self.civ_city_pop[:, r].double()
                need = torch.floor(15 + 8 * (p64a - 1) + (p64a - 1).clamp(min=0) ** 1.5)
                return maint, housing, need

            _h_key = None
            maint_all = housing_all = need_all = None
            for j in range(self.RC):
                if not cact_any_l[j]:
                    continue
                cact = cact_all[:, j]  # post-buy snapshot (a bought settler's city acts this turn)
                # City loyalty at the loop top (before yields/growth) — own =
                # THIS civ, foreign = seat 0 + every other civ; LIVE pops
                # (earlier slots in this loop have already grown, the TS
                # mid-loop mirror). The capital is immune, identified by
                # civ_city_is_cap per BATCH because compaction can move it off slot 0.
                cap_j = self.civ_city_is_cap[:, r, j]
                pin = cact & cap_j
                if bool(pin.any()):
                    self.civ_city_loyalty[:, r, j] = torch.where(pin, torch.full_like(self.civ_city_loyalty[:, r, j], 100.0), self.civ_city_loyalty[:, r, j])
                ncap = cact & ~cap_j
                if bool(ncap.any()):
                    lrng = int(rr.get("loyaltyRange", 9))
                    lscale = float(rr.get("loyaltyScale", 20))
                    here_j = self.civ_city_center[:, r, j].clamp(min=0)
                    # Per-SOURCE-seat age factors. Terms are multiples of 0.5,
                    # so the f64 sum is exact and association-free.
                    f_own = self._age_factor[self.civ_age[:, r + 1]]
                    d_own = self.pair_dist[here_j.unsqueeze(1), self.civ_city_center[:, r].clamp(min=0)].to(torch.float64)
                    own_p = ((lrng + 1 - d_own).clamp(min=0) * self.civ_city_pop[:, r].double() * self.civ_city_alive[:, r].double()).sum(dim=1) * f_own
                    d_pl = self.pair_dist[here_j.unsqueeze(1), self.site.clamp(min=0)].to(torch.float64)
                    for_p = ((lrng + 1 - d_pl).clamp(min=0) * self.pop.double() * self.alive.double()).sum(dim=1) * self._age_factor[self.civ_age[:, 0]]
                    others = self.alive.any(dim=1)
                    oth = [r2 for r2 in range(self.R) if r2 != r]
                    if oth:
                        ctr_o = self.civ_city_center[:, oth].reshape(B, -1)
                        alive_o = self.civ_city_alive[:, oth].reshape(B, -1)
                        d_o = self.pair_dist[here_j.unsqueeze(1), ctr_o.clamp(min=0)].to(torch.float64)
                        sub_o = ((lrng + 1 - d_o).clamp(min=0) * self.civ_city_pop[:, oth].reshape(B, -1).double() * alive_o.double()).reshape(B, len(oth), self.RC).sum(dim=2)
                        f_oth = self._age_factor[self.civ_age[:, [r2 + 1 for r2 in oth]]]  # [B, len(oth)]
                        for_p = for_p + (sub_o * f_oth).sum(dim=1)
                        others = others | alive_o.any(dim=1)
                    tot_p = own_p + for_p
                    press = torch.where(tot_p > 0, lscale * (own_p - for_p) / tot_p.clamp(min=1e-9), torch.zeros_like(tot_p))
                    delta_l = press + self._loyalty_amenity[amen_tidx[:, j].clamp(min=0, max=self._loyalty_amenity.shape[0] - 1)].double() + civ_city_gov[:, j].double() * self._gov_loy
                    upd_l = ncap & others
                    nxt_l = (self.civ_city_loyalty[:, r, j] + delta_l).clamp(min=0, max=float(rr.get("loyaltyMax", 100)))
                    self.civ_city_loyalty[:, r, j] = torch.where(upd_l, nxt_l, self.civ_city_loyalty[:, r, j])
                    civ_city_flip[:, j] = upd_l & (self.civ_city_loyalty[:, r, j] <= 0)
                # Column j of the keyed batched twin stands in for a per-j pass
                # (see _rcy_all_cached's exactness argument). The one
                # snapshot-vs-live divergence is capY's civ-total follower pop
                # under beliefs — TS sums pops LIVE at the capital's own loop
                # position, so capital columns take the per-j path.
                if _rcy_bel and bool(self.civ_city_is_cap[:, r, j].any()):
                    food, prod, sci, cul, gold_y, faith_y = self._seat_city_yields(r, j, cact, amen_yf=amen_yf[:, j])
                else:
                    F6 = self._rcy_all_cached(r, amen_yf)
                    zj = torch.zeros_like(F6[0][:, j])
                    food = torch.where(cact, F6[0][:, j], zj)
                    prod = torch.where(cact, F6[1][:, j], zj)
                    sci = torch.where(cact, F6[2][:, j], zj)
                    cul = torch.where(cact, F6[3][:, j], zj)
                    gold_y = torch.where(cact, F6[4][:, j], zj)
                    faith_y = torch.where(cact, F6[5][:, j], zj)
                prod_sum = torch.where(cact, prod_sum + prod, prod_sum)
                # Tile/center columns plus the citizens' contribution.
                # ASSOCIATION MATTERS: TS `sciSum += y.science + 0.7*pop`
                # desugars to sciSum + (y.science + 0.7*pop) — the city term
                # sums FIRST. (cul_sum + cul) + 0.3*pop is one ulp off and
                # flips completions when a cost lands inside it. The citizens'
                # term is already inside sci/cul, and inside the amenity tier
                # with it.
                sci_sum = torch.where(cact, sci_sum + sci, sci_sum)
                cul_c = cul  # pre-growth pop; feeds civics AND this city's border box
                cul_sum = torch.where(cact, cul_sum + cul_c, cul_sum)
                # Net of the city's upkeep — completed districts + buildings
                # (TS: y.gold - maintenance as ONE term inside the +=).
                # Batched above; the key check re-runs the batch after a
                # mid-loop eff/claim event.
                if _h_key != (self._eff_version, self._claim_version):
                    _h_key = (self._eff_version, self._claim_version)
                    maint_all, housing_all, need_all = _g5_hm()
                maint_j = maint_all[:, j]
                gold_sum = torch.where(cact, gold_sum + (gold_y - maint_j), gold_sum)
                faith_sum = torch.where(cact, faith_sum + faith_y, faith_sum)
                # Growth accounting: true surplus (can be negative), the
                # unscaled Civ 6 curve, grow SUBTRACTS the need, starvation
                # shrinks (pop floor 1, box reset). Housing throttles positive
                # surplus (housingGrowthFactor). The whole housing chain
                # (water/aqueduct, building housing, windowed improvement
                # housing, belief housing) is batched in _g5_hm above; the
                # dyadic/int-valued sums make the batched shapes bit-exact.
                housing_j = housing_all[:, j]
                head_j = housing_j - self.civ_city_pop[:, r, j].double()
                hfac = torch.where(head_j >= 2, torch.ones_like(head_j), torch.where(head_j >= 1, torch.full_like(head_j, 0.5), torch.full_like(head_j, 0.25)))
                surplus = food - self.rules.food_per_citizen * self.civ_city_pop[:, r, j].double()
                # Fertility Rites — the belief growth multiplier rides the
                # chain like computeCityStats (hf × tier × growthMult). Hoisted
                # (belief ids are static mid-loop, claims are post-phase);
                # gmul rebinds below, never mutates in place.
                gmul = _gmul_r
                # Hanging Gardens — the civ-wide completed-wonder growth
                # product, LIVE per city; hoisted per r above and recomputed
                # when a completion drops the cache.
                if self._wond_n:
                    if gw_cache is None:
                        wregG = self.civ_city_wonder[:, r]  # [B, RC, nW]
                        compG = (wregG >= 0) & self.built_wonder_complete.gather(1, wregG.clamp(min=0).reshape(B, -1)).reshape_as(wregG)
                        gw_cache = torch.where(compG, self._wond_grow.reshape(1, 1, -1).expand_as(compG).double(), torch.ones_like(compG, dtype=torch.float64)).prod(dim=2).prod(dim=1)
                    gmul = gmul * gw_cache
                self.civ_city_growth[:, r, j] = torch.where(cact, self.civ_city_growth[:, r, j] + torch.where(surplus > 0, surplus * hfac * amen_gf[:, j] * gmul, surplus), self.civ_city_growth[:, r, j])
                need = need_all[:, j]  # pre-growth pop == the batch's entry value for this column
                grow = cact & (self.civ_city_growth[:, r, j] >= need)
                self.civ_city_pop[:, r, j] = self.civ_city_pop[:, r, j] + grow.long()
                self.civ_city_growth[:, r, j] = torch.where(grow, self.civ_city_growth[:, r, j] - need, self.civ_city_growth[:, r, j])
                starve = cact & ~grow & (self.civ_city_growth[:, r, j] < 0)
                self.civ_city_pop[:, r, j] = torch.where(starve, (self.civ_city_pop[:, r, j] - 1).clamp(min=1), self.civ_city_pop[:, r, j])
                self.civ_city_growth[:, r, j] = torch.where(starve, torch.zeros_like(self.civ_city_growth[:, r, j]), self.civ_city_growth[:, r, j])
                # Queue progress + completion; a completed unit spawns at THIS
                # city, drawing no RNG. Clear-then-resolve mirrors the TS
                # shift-then-act order.
                cur = self.civ_city_current[:, r, j].clone()
                has_q = cact & (cur >= 0)
                if bool(has_q.any()):
                    # The bank pays in right after the production add, where
                    # phase.ts spends it. Then this civ's OWN
                    # encampmentProdMult, on the queue head only: the
                    # multiplier keys on the ITEM (an Encampment district or
                    # one of its buildings), not on the seat.
                    _rem = self._gov_policy_mods_cached(r, self.civ_only_civics[:, r])[5] if self._gov_has_effects else None
                    if _rem is not None:
                        # The civ-seat production space has its OWN encoding,
                        # distinct from seat 0's: 0 settler, 1..NU units,
                        # 1+NU+si a scaffold/district, 1+NU+nS+bi a building.
                        # Decode a building index from it, never off seat 0's
                        # layout, or unit codes read as building indices.
                        _nS = len(self._scaffold)
                        _bi = cur - (1 + self.NU + _nS)
                        _enc_i = (_bi >= 0) & (_bi < self.NB) & (
                            self._b_req_district[_bi.clamp(min=0, max=self.NB - 1)] == self._encamp_didx)
                        if self._encamp_si >= 0:
                            _enc_i = _enc_i | (cur == 1 + self.NU + self._encamp_si)
                        prod = torch.where(_enc_i, prod * _rem, prod)
                    self.civ_city_progress[:, r, j] = torch.where(
                        has_q, self.civ_city_progress[:, r, j] + prod + self.civ_city_prod_bank[:, r, j], self.civ_city_progress[:, r, j])
                    self.civ_city_prod_bank[:, r, j] = torch.where(
                        has_q, torch.zeros_like(self.civ_city_prod_bank[:, r, j]), self.civ_city_prod_bank[:, r, j])
                    done_q = has_q & (self.civ_city_progress[:, r, j] >= self.civ_city_cost[:, r, j])
                    if bool(done_q.any()):
                        cost_locked = self.civ_city_cost[:, r, j].clone()  # the project lump reads the LOCKED cost
                        self.civ_city_current[:, r, j] = torch.where(done_q, torch.full_like(cur, -1), self.civ_city_current[:, r, j])
                        # BANK the overflow — the phase.ts twin. Most city
                        # completions carry some, so dropping it would be a
                        # large standing production leak.
                        _rovf = (self.civ_city_progress[:, r, j] - self.civ_city_cost[:, r, j]).clamp(min=0)
                        self.civ_city_prod_bank[:, r, j] = torch.where(
                            done_q, self.civ_city_prod_bank[:, r, j] + _rovf, self.civ_city_prod_bank[:, r, j])
                        self.civ_city_progress[:, r, j] = torch.where(done_q, torch.zeros_like(self.civ_city_progress[:, r, j]), self.civ_city_progress[:, r, j])
                        self.civ_city_cost[:, r, j] = torch.where(done_q, torch.zeros_like(self.civ_city_cost[:, r, j]), self.civ_city_cost[:, r, j])
                        found_s = done_q & (cur == 0)
                        if bool(found_s.any()):
                            # A completed settler is a UNIT: it spawns at the
                            # city and the producing city pays 1 pop (floored
                            # at 1). WHERE it founds is a later FOUND_CITY
                            # order.
                            self.civ_city_pop[:, r, j] = torch.where(
                                found_s, (self.civ_city_pop[:, r, j] - 1).clamp(min=1), self.civ_city_pop[:, r, j]
                            )
                            if self._settler_idx >= 0:
                                self._spawn_unit(r + 1, found_s, self.civ_city_center[:, r, j], self._settler_idx)
                        spawn_u = done_q & (cur >= 1) & (cur <= self.NU)
                        is_bldr = spawn_u & (cur - 1 == self._builder_idx)
                        if bool(is_bldr.any()):
                            self._spawn_unit(r + 1, is_bldr, self.civ_city_center[:, r, j], self._builder_idx)
                            self.civ_only_builders_trained[:, r] = self.civ_only_builders_trained[:, r] + is_bldr.long()
                        spawn_u = spawn_u & ~is_bldr
                        # The MILITARY ENGINEER is a CIVILIAN chassis (charges,
                        # no combat), so it spawns through the civilian path
                        # like the Builder — the military spawner would leave
                        # it without charges. Charges come from the roster.
                        if self._seat_eng_live and self._eng_idx >= 0:
                            is_eng = spawn_u & (cur - 1 == self._eng_idx)
                            if bool(is_eng.any()):
                                self._spawn_unit(r + 1, is_eng, self.civ_city_center[:, r, j], self._eng_idx)
                            spawn_u = spawn_u & ~is_eng
                        if bool(spawn_u.any()):
                            # A trained military unit inherits city j's Encampment training XP (best tier).
                            xp_rj = (self.civ_city_bldg[:, r, j, :].long() * self._b_train_xp.reshape(1, -1)).max(dim=1).values
                            self._spawn_unit(r + 1, spawn_u, self.civ_city_center[:, r, j], (cur - 1).clamp(min=0), init_xp=xp_rj)
                        # a finished district completes its paved tile
                        nS_b4 = len(self._scaffold)
                        done_d = done_q & (cur > self.NU) & (cur <= self.NU + nS_b4)
                        if bool(done_d.any()):
                            dr = done_d.nonzero(as_tuple=True)[0]
                            dtile = self.civ_city_qtile[:, r, j]
                            _dt = dtile[dr].clamp(min=0)
                            self.district_complete[dr, _dt] = True
                            # MONUMENTALITY fires on the district completion.
                            _monr = torch.zeros(self.B, dtype=torch.bool, device=self.device)
                            _monr[dr] = True
                            self._dedication_event(r + 1, 0, _monr)
                            # a completed ENCAMPMENT musters its garrison
                            _enc = self.district[dr, _dt] == self._encamp_didx
                            self.encamp_hp[dr, _dt] = torch.where(
                                _enc, torch.full_like(_dt, self._encamp_hp_max), self.encamp_hp[dr, _dt]
                            )
                            self.civ_city_qtile[dr, r, j] = -1
                            self._eff_version += 1
                        # a finished building joins the registry (bounded
                        # above: project codes sit past NB)
                        NBc = self.rules_dev.b_cost.shape[0]
                        done_b = done_q & (cur > self.NU + nS_b4) & (cur <= self.NU + nS_b4 + NBc)
                        if bool(done_b.any()):
                            br = done_b.nonzero(as_tuple=True)[0]
                            bi_done = (cur - 1 - self.NU - nS_b4).clamp(min=0)
                            self.civ_city_bldg[br, r, j, bi_done[br]] = True
                            # A completed REGIONAL building reaches OTHER
                            # cities' yields THIS phase (TS accrues later
                            # cities live), so an civ_city_bldg write must
                            # invalidate the economy caches.
                            self._eff_version += 1
                            if self._walls_bidx >= 0:
                                wm = br[bi_done[br] == self._walls_bidx]
                                if len(wm) > 0:
                                    self.civ_city_outer_hp[wm, r, j] = self._walls_hp
                        # a finished wonder completes its tile (effects read
                        # built_wonder_complete live from the registry)
                        if self._wond_n:
                            base_w = self.NU + nS_b4 + NBc + len(self._proj_rows)
                            done_w = done_q & (cur > base_w)
                            if bool(done_w.any()):
                                wi_done = (cur - 1 - base_w).clamp(min=0)
                                wr_ = done_w.nonzero(as_tuple=True)[0]
                                wt_ = self.civ_city_wonder[wr_, r, j, wi_done[wr_]]
                                self.built_wonder_complete[wr_, wt_.clamp(min=0)] = True
                                self.era_score[wr_, r + 1] += self._era_pts["wonder"]
                                self._eff_version += 1
                                gw_cache = None  # the hoisted growth product changed
                        # A finished project pays js_round(cost×frac) into the
                        # CIV's own streams + GPP (the completeProject twin).
                        if self._proj_rows:
                            done_p = done_q & (cur > self.NU + nS_b4 + NBc) & (cur <= self.NU + nS_b4 + NBc + len(self._proj_rows))
                            if bool(done_p.any()):
                                pi_done = (cur - 1 - self.NU - nS_b4 - NBc).clamp(min=0)
                                amt_y = js_round(cost_locked * self._proj_yf)
                                for pi_, prow in enumerate(self._proj_rows):
                                    hitp = done_p & (pi_done == pi_)
                                    if not bool(hitp.any()):
                                        continue
                                    y_i = int(prow.get("y", -1))
                                    if y_i == 3:
                                        self.civ_only_tech_prog[:, r] = torch.where(hitp, self.civ_only_tech_prog[:, r] + amt_y, self.civ_only_tech_prog[:, r])
                                    elif y_i == 4:
                                        self.civ_only_civic_prog[:, r] = torch.where(hitp, self.civ_only_civic_prog[:, r] + amt_y, self.civ_only_civic_prog[:, r])
                                    elif y_i == 2:
                                        self.civ_only_treasury[:, r] = torch.where(hitp, self.civ_only_treasury[:, r] + amt_y, self.civ_only_treasury[:, r])
                                    elif y_i == 5:
                                        self.civ_only_faith[:, r] = torch.where(hitp, self.civ_only_faith[:, r] + amt_y, self.civ_only_faith[:, r])
                                    # Pay EVERY listed class at THIS row's rate
                                    # — the Festival pays Writer/Artist/
                                    # Musician at 0.11 each, every other
                                    # project one class at 0.22. `gs`/`gf` fall
                                    # back to a single `g` + the global
                                    # fraction when the row omits them.
                                    amt_g = js_round(cost_locked * float(prow.get("gf", self._proj_gf)))
                                    g_list = prow.get("gs")
                                    if not g_list:
                                        g_one = int(prow.get("g", -1))
                                        g_list = [g_one] if g_one >= 0 else []
                                    for g_i in (int(x) for x in g_list):
                                        if 0 <= g_i < self.civ_only_gpp.shape[2]:
                                            self.civ_only_gpp[:, r, g_i] = torch.where(hitp, self.civ_only_gpp[:, r, g_i] + amt_g, self.civ_only_gpp[:, r, g_i])
                                    # A space-race step records chain progress
                                    # (space_done, seat r+1); completing the
                                    # VICTORY step ends the game as a seat-0
                                    # DEFEAT — victory_type 4, the
                                    # domination-defeat mirror. Space rows
                                    # carry y=g=-1, so the yield/GPP blocks
                                    # above are no-ops for them.
                                    if int(prow.get("sp", 0)):
                                        self.space_done[hitp, r + 1, self._space_step[pi_]] = True
                                        if pi_ in self._space_victory_idx:
                                            self.victory_type.copy_(torch.where(hitp, torch.full_like(self.victory_type, 4), self.victory_type))
                                            self.game_over.logical_or_(hitp)
                self._seat_border_growth(r, j, cact, cul_c)
                # City strike: a civ city with ANCIENT_WALLS fires once/turn at
                # the nearest unit hostile to THIS civ (barbarians always;
                # at-war seats' units, civilians included), range 2, lowest
                # tile index breaking ties. One roll at the city's defense vs
                # the target's (single roll, no retaliation, never captures).
                # rc (slot) order, before the heal — a kill advances the RNG.
                if self._walls_bidx >= 0:
                    Bn, Tn, dev2 = self.B, self.T, self.device
                    bidx = torch.arange(Bn, device=dev2)
                    walled = cact & self.civ_city_bldg[:, r, j, self._walls_bidx]
                    if bool(walled.any()):
                        ctr = self.civ_city_center[:, r, j].clamp(min=0)  # [B]
                        dist = self.pair_dist[ctr].to(torch.long)  # [B, T]
                        # ANY unit hostile to this civ, read off _seats_hostile
                        # — the war relation is one symmetric matrix, so
                        # hostility is looked up rather than transcribed.
                        _mil, _civ = self.military_at, self.civilian_at
                        _mseat = torch.where(_mil >= 0, self.unit_seat.gather(1, _mil.clamp(min=0)), torch.full_like(_mil, -1))
                        _cseat = torch.where(_civ >= 0, self.unit_seat.gather(1, _civ.clamp(min=0)), torch.full_like(_civ, -1))
                        hm = self._seats_hostile(r + 1, _mseat)
                        hc = self._seats_hostile(r + 1, _cseat)
                        hostile = hm | hc  # [B, T]
                        valid = walled.unsqueeze(1) & hostile & (dist >= 1) & (dist <= 2)
                        arangeT = torch.arange(Tn, device=dev2)
                        key = torch.where(valid, dist * (Tn + 1) + arangeT.reshape(1, -1), torch.full((Bn, Tn), 10**9, device=dev2, dtype=torch.long))
                        best_key = key.min(dim=1).values
                        tt = key.argmin(dim=1)  # [B]
                        strike = walled & (best_key < 10**9)
                        if bool(strike.any()):
                            # ONE defender slot; "military first" is the entire
                            # priority (one military + one civilian per tile
                            # makes the rest unreachable).
                            _okm, _okc = hm[bidx, tt], hc[bidx, tt]
                            d_slot = torch.where(_okm, _mil[bidx, tt], torch.where(_okc, _civ[bidx, tt], torch.full_like(tt, -1)))
                            d_seat = torch.where(_okm, _mseat[bidx, tt], torch.where(_okc, _cseat[bidx, tt], torch.full_like(tt, -1)))
                            ds0 = d_slot.clamp(min=0)
                            is_barb = d_seat == BARB_SEAT
                            # A MILITARY target whose seat class earns xp
                            # (caps.xp) — seat 0 or a civ seat, never a
                            # barbarian.
                            is_vet_mil = _okm & ~is_barb
                            d_type = self.unit_type[bidx, ds0]
                            # only a target whose class earns xp carries veterancy
                            def_xp = torch.where(is_vet_mil, self._xp_lvl_bonus(self.unit_xp[bidx, ds0]), torch.zeros_like(tt))
                            def_cs = self._type_combat[d_type] + self._tdef_i(bidx, tt) + def_xp
                            # An embarked target (military or civilian; barbs
                            # never embark) → flat CS, no terrain, no support.
                            d_emb = self.unit_emb[bidx, ds0] & (d_slot >= 0)
                            def_cs = torch.where(d_emb, torch.full_like(def_cs, self._embarked_defense_cs), def_cs)
                            # Garrison bonus: this civ's OWN military standing
                            # on the city's centre tile.
                            gslot = self.military_at[bidx, ctr]
                            gar = ((gslot >= 0) & (self.unit_seat[bidx, gslot.clamp(min=0)] == r + 1)).long()
                            atk_cs = torch.maximum(self.civ_only_best_melee[:, r], torch.full_like(self.civ_only_best_melee[:, r], 15)) + gar * 5
                            # the defending unit is wounded (the attacker is the city)
                            def_hp = self.unit_hp[bidx, ds0]
                            def_e = def_cs - self._wound(def_hp)
                            # The struck unit gains support from adjacent
                            # same-side military; the attacker is the city, so
                            # there is no flanking.
                            # Support keys on the DEFENDER's own seat:
                            # supportCount counts units with
                            # `u.seat === defender.seat`, which is what
                            # `d_seat` holds.
                            _, _sp = self._flank_support(tt, d_seat, torch.full((Bn,), -1, dtype=torch.long, device=dev2))
                            def_e = def_e + SUPPORT_CS * torch.where(d_emb, torch.zeros_like(_sp), _sp)  # embarked → no support
                            # DEFENDER-side general aura (the roll is
                            # atk_cs - def_e, so the aura REDUCES the damage
                            # taken), outside the embarked override. The aura
                            # is the DEFENDER's OWN seat's, which is what
                            # `d_seat` holds. Barbs own no general (-1) and a
                            # CIVILIAN is combat-0, so the aura is 0 for both.
                            _def_civ_u = torch.where(is_vet_mil, d_seat, torch.full_like(tt, -1))
                            _def_nav = torch.where(is_vet_mil, self.unit_naval[d_type.clamp(min=0, max=self.NU - 1)], torch.zeros_like(d_emb))
                            def_e = def_e + self._gen_aura_cs(_def_civ_u, tt, d_emb | _def_nav).to(def_e.dtype)
                            self._city_strike_resolve(  # one rule, four callers
                                strike, tt, d_slot, d_seat, _okm, _okc, is_vet_mil, atk_cs,
                                def_e, def_hp, r + 1, "rcstk")
                # The ADDITIONAL Encampment strike (k="restk", the twin of
                # walls' "rcstk"). City (r, j), if it owns a COMPLETE
                # unpillaged ENCAMPMENT, fires the same once/turn ranged strike
                # right AFTER its walls strike — walls first, then Encampment,
                # per rc, before the heal. civ_city_dist_tile is districts_cat-
                # indexed, matching self._encamp_didx and self.district.
                if self._encamp_didx >= 0 and self.districts_on:
                    Bn, Tn, dev2 = self.B, self.T, self.device
                    bidx = torch.arange(Bn, device=dev2)
                    enc_reg = self.civ_city_dist_tile[:, r, j, self._encamp_didx]  # [B]
                    # `encamp_hp > 0` is part of the gate: a beaten-down
                    # Encampment is occupied and fires nothing (the pestk twin).
                    enc_ok = (enc_reg >= 0) & self.district_complete.gather(1, enc_reg.clamp(min=0).unsqueeze(1)).squeeze(1) & ~self.district_pillaged.gather(1, enc_reg.clamp(min=0).unsqueeze(1)).squeeze(1) & (self.encamp_hp.gather(1, enc_reg.clamp(min=0).unsqueeze(1)).squeeze(1) > 0)
                    has_enc = cact & enc_ok
                    if bool(has_enc.any()):
                        ctr = self.civ_city_center[:, r, j].clamp(min=0)  # [B]
                        dist = self.pair_dist[ctr].to(torch.long)  # [B, T]
                        # ANY unit hostile to this civ, read off _seats_hostile
                        # — the war relation is one symmetric matrix, so
                        # hostility is looked up rather than transcribed.
                        _mil, _civ = self.military_at, self.civilian_at
                        _mseat = torch.where(_mil >= 0, self.unit_seat.gather(1, _mil.clamp(min=0)), torch.full_like(_mil, -1))
                        _cseat = torch.where(_civ >= 0, self.unit_seat.gather(1, _civ.clamp(min=0)), torch.full_like(_civ, -1))
                        hm = self._seats_hostile(r + 1, _mseat)
                        hc = self._seats_hostile(r + 1, _cseat)
                        hostile = hm | hc  # [B, T]
                        valid = has_enc.unsqueeze(1) & hostile & (dist >= 1) & (dist <= 2)
                        arangeT = torch.arange(Tn, device=dev2)
                        key = torch.where(valid, dist * (Tn + 1) + arangeT.reshape(1, -1), torch.full((Bn, Tn), 10**9, device=dev2, dtype=torch.long))
                        best_key = key.min(dim=1).values
                        tt = key.argmin(dim=1)  # [B]
                        strike = has_enc & (best_key < 10**9)
                        if bool(strike.any()):
                            # ONE defender slot; "military first" is the entire
                            # priority (one military + one civilian per tile
                            # makes the rest unreachable).
                            _okm, _okc = hm[bidx, tt], hc[bidx, tt]
                            d_slot = torch.where(_okm, _mil[bidx, tt], torch.where(_okc, _civ[bidx, tt], torch.full_like(tt, -1)))
                            d_seat = torch.where(_okm, _mseat[bidx, tt], torch.where(_okc, _cseat[bidx, tt], torch.full_like(tt, -1)))
                            ds0 = d_slot.clamp(min=0)
                            is_barb = d_seat == BARB_SEAT
                            # A MILITARY target whose seat class earns xp
                            # (caps.xp) — seat 0 or a civ seat, never a
                            # barbarian.
                            is_vet_mil = _okm & ~is_barb
                            d_type = self.unit_type[bidx, ds0]
                            def_xp = torch.where(is_vet_mil, self._xp_lvl_bonus(self.unit_xp[bidx, ds0]), torch.zeros_like(tt))
                            def_cs = self._type_combat[d_type] + self._tdef_i(bidx, tt) + def_xp
                            d_emb = self.unit_emb[bidx, ds0] & (d_slot >= 0)
                            def_cs = torch.where(d_emb, torch.full_like(def_cs, self._embarked_defense_cs), def_cs)
                            # Garrison bonus: this civ's OWN military standing
                            # on the city's centre tile.
                            gslot = self.military_at[bidx, ctr]
                            gar = ((gslot >= 0) & (self.unit_seat[bidx, gslot.clamp(min=0)] == r + 1)).long()
                            atk_cs = torch.maximum(self.civ_only_best_melee[:, r], torch.full_like(self.civ_only_best_melee[:, r], 15)) + gar * 5
                            def_hp = self.unit_hp[bidx, ds0]
                            def_e = def_cs - self._wound(def_hp)
                            # Support keys on the DEFENDER's own seat:
                            # supportCount counts units with
                            # `u.seat === defender.seat`, which is what
                            # `d_seat` holds.
                            _, _sp = self._flank_support(tt, d_seat, torch.full((Bn,), -1, dtype=torch.long, device=dev2))
                            def_e = def_e + SUPPORT_CS * torch.where(d_emb, torch.zeros_like(_sp), _sp)
                            # The rcstk mirror: defender-side general aura
                            # (MILITARY only), outside the embarked override.
                            _def_civ_u = torch.where(is_vet_mil, d_seat, torch.full_like(tt, -1))  # the DEFENDER's own seat
                            _def_nav = torch.where(is_vet_mil, self.unit_naval[d_type.clamp(min=0, max=self.NU - 1)], torch.zeros_like(d_emb))
                            def_e = def_e + self._gen_aura_cs(_def_civ_u, tt, d_emb | _def_nav).to(def_e.dtype)
                            self._city_strike_resolve(  # one rule, four callers
                                strike, tt, d_slot, d_seat, _okm, _okc, is_vet_mil, atk_cs,
                                def_e, def_hp, r + 1, "restk")
                # A siege pins the HP: any adjacent unit hostile to THIS civ —
                # an at-war seat's units, CIVILIANS included per unitsHostile,
                # or barbarians — read live at this point in the city loop.
                nbh = self.neigh[self.civ_city_center[:, r, j].clamp(min=0)]  # [B, 6]
                nbhc = nbh.clamp(min=0)
                _ha_m = self.military_at.gather(1, nbhc)
                _ha_s = torch.where(_ha_m >= 0, self.unit_seat.gather(1, _ha_m.clamp(min=0)), torch.full_like(_ha_m, -1))
                _ha_c = self.civilian_at.gather(1, nbhc)
                _ha_cs = torch.where(_ha_c >= 0, self.unit_seat.gather(1, _ha_c.clamp(min=0)), torch.full_like(_ha_c, -1))
                hostile_adj = (_ha_s == BARB_SEAT) | (
                    ((_ha_s == 0) | (_ha_cs == 0))
                    & self.civ_only_atwar[:, r].unsqueeze(1)
                )
                # An adjacent AT-WAR civ seat's unit (military or civilian)
                # besieges this city too — the symmetric unitsHostile. civ_pair_war[:,
                # r] is gathered by the neighbour's civ index, read straight off
                # its seat; own-civ units (== r) never besiege.
                vmn = torch.where((_ha_s > 0) & (_ha_s != BARB_SEAT), _ha_m, torch.full_like(_ha_m, -1))
                vcn = torch.where((_ha_cs > 0) & (_ha_cs != BARB_SEAT), _ha_c, torch.full_like(_ha_c, -1))
                vmn_civ = torch.where(vmn >= 0, _ha_s - 1, torch.full_like(vmn, -1))
                vcn_civ = torch.where(vcn >= 0, _ha_cs - 1, torch.full_like(vcn, -1))
                war_vmn = (vmn >= 0) & (vmn_civ != r) & self.civ_pair_war[:, r].gather(1, vmn_civ.clamp(min=0))
                war_vcn = (vcn >= 0) & (vcn_civ != r) & self.civ_pair_war[:, r].gather(1, vcn_civ.clamp(min=0))
                hostile_adj = hostile_adj | war_vmn | war_vcn
                besieged_j = ((nbh >= 0) & hostile_adj).any(dim=1)
                self.civ_city_hp[:, r, j] = torch.where(
                    cact & ~besieged_j, (self.civ_city_hp[:, r, j] + heal).clamp(max=rr.get("cityMaxHp", 200)), self.civ_city_hp[:, r, j]
                )
                # the outer wall pool heals on the same gate
                if self._walls_bidx >= 0:
                    heal_oj = cact & ~besieged_j & self.civ_city_bldg[:, r, j, self._walls_bidx]
                    self.civ_city_outer_hp[:, r, j] = torch.where(
                        heal_oj, (self.civ_city_outer_hp[:, r, j] + heal).clamp(max=self._walls_hp), self.civ_city_outer_hp[:, r, j]
                    )
                # The Encampment garrison repairs on the same gate and rate.
                # civ_city_dist_tile is districts_cat-indexed, so the Encampment
                # column holds the tile.
                if self._encamp_didx >= 0:
                    _et = self.civ_city_dist_tile[:, r, j, self._encamp_didx]  # [B]
                    _etc = _et.clamp(min=0)
                    _live = (
                        (_et >= 0)
                        & self.district_complete.gather(1, _etc.unsqueeze(1)).squeeze(1)
                        & ~self.district_pillaged.gather(1, _etc.unsqueeze(1)).squeeze(1)
                    )
                    _ok = cact & ~besieged_j & _live
                    _cur = self.encamp_hp.gather(1, _etc.unsqueeze(1)).squeeze(1)
                    self.encamp_hp[:, :] = self.encamp_hp.scatter(
                        1,
                        _etc.unsqueeze(1),
                        torch.where(_ok, (_cur + heal).clamp(max=self._encamp_hp_max), _cur).unsqueeze(1),
                    )

            # Loyalty collapses resolve after the city loop, to the
            # max-pressure seat (first_argmax over [seat 0, civ 0, civ 1, ...],
            # so seat 0 wins ties, then civs by id); the transfer reuses the
            # capture machinery WITHOUT plunder.
            if bool(civ_city_flip.any()):
                lrng = int(rr.get("loyaltyRange", 9))
                # Every slot is walked, slot 0 included: compaction can move a
                # survivor into slot 0, so slot 0 is not capital-by-
                # construction. civ_city_flip is only ever set for non-capitals.
                for j2 in range(self.RC):
                    fl = civ_city_flip[:, j2] & self.civ_city_alive[:, r, j2]
                    if not bool(fl.any()):
                        continue
                    here_j = self.civ_city_center[:, r, j2].clamp(min=0)
                    d_pl = self.pair_dist[here_j.unsqueeze(1), self.site.clamp(min=0)].to(torch.float64)
                    p_pl = ((lrng + 1 - d_pl).clamp(min=0) * self.pop.double() * self.alive.double()).sum(dim=1)
                    press_all = [p_pl]
                    for r2 in range(self.R):
                        if r2 == r:
                            press_all.append(torch.full_like(p_pl, -1.0))
                        else:
                            d_o = self.pair_dist[here_j.unsqueeze(1), self.civ_city_center[:, r2].clamp(min=0)].to(torch.float64)
                            press_all.append(((lrng + 1 - d_o).clamp(min=0) * self.civ_city_pop[:, r2].double() * self.civ_city_alive[:, r2].double()).sum(dim=1))
                    winner = first_argmax(torch.stack(press_all, dim=1))  # index 0 = seat 0
                    for b in fl.nonzero(as_tuple=True)[0].tolist():
                        w_ = int(winner[b])
                        if w_ == 0:
                            self._capture_civ_city(
                                torch.tensor([b], device=dev), torch.tensor([r], device=dev),
                                torch.tensor([j2], device=dev), self.civ_city_center[b, r, j2].reshape(1),
                                plunder=False,
                            )
                        else:
                            self._transfer_rc_to_rc(b, r, j2, w_ - 1)


            # Research: the seat's own boosts drive a cheapest-first pick over
            # effectiveResearchCostIn, ties by table order (_auto_pick's index
            # epsilon reproduces the TS stable sort). Progress banks and drains
            # the same way for every seat. Research picks ride the wire.
            rdv = self.rules_dev
            self.civ_only_tech_prog[:, r] = torch.where(active, self.civ_only_tech_prog[:, r] + sci_sum, self.civ_only_tech_prog[:, r])
            # LIFETIME science — Seat.scienceTotal's twin, beside the stream
            # add (the same row of seat_science_total seat 0's add writes).
            self.civ_only_science_total[:, r] = torch.where(active, self.civ_only_science_total[:, r] + sci_sum.to(self.dtype), self.civ_only_science_total[:, r])
            self.civ_only_treasury[:, r] = torch.where(active, self.civ_only_treasury[:, r] + gold_sum, self.civ_only_treasury[:, r])
            self.civ_only_faith[:, r] = torch.where(active, self.civ_only_faith[:, r] + faith_sum, self.civ_only_faith[:, r])
            # Unit upkeep + the bankruptcy rule — the ONE pooled body every
            # seat row calls at this position (right after the gold lands,
            # before war marches).
            self._seat_upkeep_and_bankruptcy(r + 1, active)
            for _ in range(RESEARCH_LOOPS):
                curt = self.civ_only_cur_tech[:, r]
                # boosted techs complete at the discounted cost (_eff_cost —
                # identical rounding to effectiveResearchCostIn)
                cost_t = self._eff_cost(
                    rdv.t_cost.gather(0, curt.clamp(min=0)),
                    self.civ_only_tech_boosted[:, r].gather(1, curt.clamp(min=0).unsqueeze(1)).squeeze(1),
                    golden_civ=r + 1,  # golden FREE_INQUIRY, per seat
                ).double()
                fin = active & (curt >= 0) & (self.civ_only_tech_prog[:, r] >= cost_t)
                if not bool(fin.any()):
                    break
                rows = fin.nonzero(as_tuple=True)[0]
                self.civ_only_techs[rows, r, curt[rows]] = True
                self._eff_version += 1  # the per-r farm-adj/mine planes key on it
                self.civ_only_tech_prog[:, r] = torch.where(fin, self.civ_only_tech_prog[:, r] - cost_t, self.civ_only_tech_prog[:, r])
                self.civ_only_cur_tech[:, r] = torch.where(fin, torch.full_like(curt, -1), self.civ_only_cur_tech[:, r])
            no_t = active & (self.civ_only_cur_tech[:, r] == -1) & ~self._available_mask(self.civ_only_techs[:, r], self._prereq_t).any(dim=1)
            self.civ_only_tech_prog[:, r] = torch.where(no_t, torch.minimum(self.civ_only_tech_prog[:, r], torch.zeros_like(self.civ_only_tech_prog[:, r])), self.civ_only_tech_prog[:, r])
            # TOURISM — the `civ.tourism` twin. POSITION IS LOAD-BEARING: the
            # accrual sits AFTER this turn's TECH completions but BEFORE any
            # civic completes, and the wonder term reads the seat's ERA off
            # completed research, so a step either way shifts every wonder's
            # era term.
            _tour_r = self._tourism_of(
                self.civ_city_gw_writing[:, r],
                self.civ_city_gw_art[:, r],
                self.civ_city_gw_music[:, r],
                self.civ_city_alive[:, r],
                self.civ_at == r,
                self._civ_era(self.civ_only_techs[:, r], self.civ_only_civics[:, r]),
                self.civ_city_relics[:, r],
                self.civ_only_techs[:, r, self._gw_printing_tech] if self._gw_printing_tech >= 0 else None,
            )
            self.civ_only_tourism[:, r] = torch.where(active, self.civ_only_tourism[:, r] + _tour_r, self.civ_only_tourism[:, r])
            # DIPLOMATIC FAVOR — every seat's twin, at the same position.
            _fav_r = self._adopted_gov_tier(self.civ_only_civics[:, r]) + self._favor_per_suz * self._suzerain_count(r + 1)
            self.civ_only_diplo_favor[:, r] = torch.where(active, self.civ_only_diplo_favor[:, r] + _fav_r, self.civ_only_diplo_favor[:, r])
            # grievances DECAY by 1 per turn at peace, on every axis
            _at_peace = ~self.civ_only_atwar[:, r] & ~self.civ_pair_war[:, r].any(dim=1)
            self.civ_only_warmonger[:, r] = torch.where(
                active & _at_peace & (self.civ_only_warmonger[:, r] > 0),
                self.civ_only_warmonger[:, r] - 1,
                self.civ_only_warmonger[:, r],
            )
            self.civ_only_civic_prog[:, r] = torch.where(active, self.civ_only_civic_prog[:, r] + cul_sum, self.civ_only_civic_prog[:, r])
            # LIFETIME culture — the `civ.cultureTotal` twin, immediately after
            # civicProgress takes the same sum. Draws no RNG.
            self.civ_only_culture[:, r] = torch.where(active, self.civ_only_culture[:, r] + cul_sum, self.civ_only_culture[:, r])
            for _ in range(RESEARCH_LOOPS):
                curc = self.civ_only_cur_civic[:, r]
                cost_c = self._eff_cost(
                    rdv.c_cost.gather(0, curc.clamp(min=0)),
                    self.civ_only_civic_boosted[:, r].gather(1, curc.clamp(min=0).unsqueeze(1)).squeeze(1),
                    golden_civ=r + 1, is_civic=True,  # golden PEN_BRUSH_AND_VOICE
                ).double()
                fin = active & (curc >= 0) & (self.civ_only_civic_prog[:, r] >= cost_c)
                if not bool(fin.any()):
                    break
                rows = fin.nonzero(as_tuple=True)[0]
                self.civ_only_civics[rows, r, curc[rows]] = True
                self._eff_version += 1  # Feudalism moves this civ's farm-adj plane
                self.civ_only_civic_prog[:, r] = torch.where(fin, self.civ_only_civic_prog[:, r] - cost_c, self.civ_only_civic_prog[:, r])
                self.civ_only_cur_civic[:, r] = torch.where(fin, torch.full_like(curc, -1), self.civ_only_cur_civic[:, r])
            no_c = active & (self.civ_only_cur_civic[:, r] == -1) & ~self._available_mask(self.civ_only_civics[:, r], self._prereq_c).any(dim=1)
            self.civ_only_civic_prog[:, r] = torch.where(no_c, torch.minimum(self.civ_only_civic_prog[:, r], torch.zeros_like(self.civ_only_civic_prog[:, r])), self.civ_only_civic_prog[:, r])

            # Builder verbs and missionary SPREAD verbs ride the wire; their
            # phase.ts call positions are here, builders then missionaries.

            # Great-people race (advanceGreatPeople) — ONE row-generic body,
            # shared with row 0 (which calls it at its own loop position).
            self._advance_great_people(r + 1, active)

            # The BELIEF RACES (pantheon / religion / enhancer) — one
            # row-generic body per fact, shared with row 0 (#73).
            self._seat_belief_claims(r + 1, active)

            # Great General moves ride the wire; their phase.ts call position
            # is here, BEFORE the war loop, so the aura reflects the advanced
            # position (a general spawned in the GP claim above walks this turn
            # on full MP).

            # War or peace (branch on the value at entry; a peace made this
            # turn still runs the war branch, like the TS if/else). A seat at
            # war with ANYONE takes the WAR branch — its units run the war-act,
            # which scans every at-war seat's units and cities. civ_only_warturns
            # tracks the seat-0 war only (atw), while the seat-0 declaration
            # roll is skipped for a seat already in ANY war via
            # pea = ~atw_any, so both engines drop the conditional draw in
            # lockstep.
            atw = active & self.civ_only_atwar[:, r]
            atw_any = atw | (active & self.civ_pair_war[:, r, : self.R].any(dim=1))
            self.civ_only_warturns[:, r] = self.civ_only_warturns[:, r] + atw.long()
            # This seat's live slots, computed once (deaths only shrink
            # mid-loop; neither loop spawns) — the war AND peace walks reuse it.
            # Replayed unit acts fire HERE, at the walkers' own position in the
            # phase, never before step(): battles DRAW, so they must consume
            # their combat draws at the same position in the stream as the TS
            # in-phase replay. Draw-free actions (production/tech/civic) stay
            # pre-step. War rows here, peace rows at the peace loop below.
            _dsq = getattr(self, "_driven_useq", None)
            if _dsq is not None and r in _dsq:
                _rows_w = atw_any & self.controlled[:, r]
                if bool(_rows_w.any()):
                    _ord_w = torch.where(_rows_w.view(-1, 1, 1), _dsq[r], torch.full_like(_dsq[r], -1))
                    self.apply_seat_unit_sequence(r, _ord_w)
            # Suing for peace rides the wire's war verb.
            pea = active & ~atw_any  # a seat at ANY war neither patrols nor rolls the seat-0 declaration
            self.civ_only_peaceturns[:, r] = self.civ_only_peaceturns[:, r] + pea.long()
            if _dsq is not None and r in _dsq:
                _rows_p = pea & self.controlled[:, r]
                if bool(_rows_p.any()):
                    _ord_p = torch.where(_rows_p.view(-1, 1, 1), _dsq[r], torch.full_like(_dsq[r], -1))
                    self.apply_seat_unit_sequence(r, _ord_p)
            # War declarations arrive on the wire.

        # Drop the route-income cache at phase end: its key
        # (turn, r, eff, _rp_kill_version) does not cover unit deaths in the
        # war/peace acts above, so post-phase callers (leader/domination/
        # trace) must recompute against post-war state. With R>=2 the single
        # slot is overwritten before any same-r re-read, but that must not be
        # load-bearing for R=1 configs.
        self._seat_route_cache = None

        # The PEACE pass runs AFTER every seat acted, in actor order — seat
        # 0's sue-for-peace arm leads (the geoPeace pass position), then the
        # civ↔civ pairs. Re-validated against the LIVE mask; the gold
        # schedule is the seat-0 war verb's own rule (the TS geoPeace arm
        # carries no terms — a WAR_COLUMN_SEAT-family residual).
        if war is not None and self._rl_war_active and self.R > 0:
            w0p = war.to(torch.long)
            okp = self.alive.any(dim=1) & (w0p >= 0) & self.war_mask().gather(1, w0p.clamp(min=0).unsqueeze(1)).squeeze(1)
            pea = okp & (w0p >= self.R)
            if bool(pea.any()):
                ri = (w0p - self.R).clamp(min=0, max=self.R - 1)
                cost = rr.get("peaceGold0", 150) + rr.get("peaceGoldSlope", 10) * self.civ_only_warturns.gather(
                    1, ri.unsqueeze(1)
                ).squeeze(1).to(self.dtype)
                oh = torch.nn.functional.one_hot(ri, self.R).bool() & pea.unsqueeze(1)
                self.treasury.copy_(torch.where(pea, self.treasury - cost, self.treasury))
                self.civ_only_atwar.logical_and_(~oh)
                self.war[:, 1:1 + self.civ_only_atwar.shape[1], 0] &= ~oh
                self.civ_only_warturns.copy_(torch.where(oh, torch.zeros_like(self.civ_only_warturns), self.civ_only_warturns))
                self.civ_only_peaceturns.copy_(torch.where(oh, torch.zeros_like(self.civ_only_peaceturns), self.civ_only_peaceturns))
        if self.R > 0:
            self._geo_make_peace()

    def _advance_great_people(self, row: int, active: torch.Tensor) -> None:
        """advanceGreatPeople(state, seat) — ONE body for every seat row
        (0 = seat 0, r+1 = civ r), at the shared loop position after the
        research tail. Accrual per class: 1 + beliefGppFlat + (that
        district's built buildings) per city owning a COMPLETED unpillaged
        district of the class, read through the seat-axis registry
        (captured districts never ENTER a registry, so the tile plane's
        district_dead needs no gate here). Claims come from the SHARED
        earned pool at gpCost(earned), overflow kept; effects land in this
        row's own streams (tech/civic progress, treasury, faith, the
        capital's build head); WRITER/ARTIST/MUSICIAN culture slots Great
        Works; GENERAL/ADMIRAL spawn at the capital; a PROPHET banks for
        the belief races. No RNG draws."""
        if self._gp_nc == 0:
            return
        B, dev = self.B, self.device
        for cls in range(self._gp_nc):  # all GP classes (incl Admiral/General)
            # Accrual = 1 + (that district's buildings) per city owning a
            # COMPLETED district of the class, so a seat accrues nothing
            # until its first Campus/Holy Site/Commercial Hub completes.
            d_cls = int(self._gp_class_district[cls]) if cls < self._gp_nc else -1
            if d_cls >= 0 and self.districts_on:
                reg_c = self.city_dist_tile[:, row, :, d_cls]  # [B, cols]
                comp_c = (reg_c >= 0) & self.district_complete.gather(1, reg_c.clamp(min=0)) & ~self.district_pillaged.gather(1, reg_c.clamp(min=0))  # a pillaged district earns no GPP
                bmask_c = (self.rules_dev.b_req_district == d_cls).reshape(1, 1, -1)
                nb_of = (self.city_bldg[:, row] & bmask_c).sum(dim=2)  # [B, cols]
                # Divine Spark: the belief's flat GPP joins the per-city
                # term (1 + gppFlat + buildings), the
                # greatPersonPointsPerTurn form.
                if self._bel_any and cls < self._bel["pan"]["gpp"].shape[1]:
                    gflat = self._bel_add("gpp", row)[:, cls].double().unsqueeze(1)  # [B, 1]
                else:
                    gflat = torch.zeros(B, 1, dtype=torch.float64, device=dev)
                pts = (comp_c.double() * (1.0 + gflat + nb_of.double())).sum(dim=1)
            else:
                pts = torch.zeros(B, dtype=torch.float64, device=dev)
            # Golden EXODUS pays +4 PROPHET points a turn, seat-wide and
            # district-free — greatPersonPointsPerTurn adds it OUTSIDE its
            # per-city loop, so it joins `pts` before the `pts > 0` guard,
            # not after.
            if cls == self._prophet_cls:
                pts = pts + self._golden_ded(row, self._ded_exodus).double() * 4.0
            self.civ_gpp[:, row, cls] = torch.where(
                active & (pts > 0), self.civ_gpp[:, row, cls] + pts, self.civ_gpp[:, row, cls]
            )
            # Claim loop: overflow is KEPT (gpp −= cost, not zeroed) and
            # the person's effect lands in this seat's own streams,
            # mirroring applyGreatPersonEffect. PROPHETs gate the religion.
            maxN = self._gp_effects.shape[1]
            for _ in range(maxN):
                earned_c = self.gp_earned[:, cls]
                has_person = earned_c < self._gp_roster[cls]
                gcost = self._gp_costs[earned_c.clamp(max=self._gp_costs.shape[0] - 1)]
                hit = active & has_person & (self.civ_gpp[:, row, cls] >= gcost)
                if not bool(hit.any()):
                    break
                hf = hit.to(torch.float64)
                eff = self._gp_effects[cls, earned_c.clamp(max=maxN - 1)]  # [B, 5]
                self.civ_tech_prog[:, row] = self.civ_tech_prog[:, row] + eff[:, 0].double() * hf
                # WRITER/ARTIST/MUSICIAN culture is slotted as Great Works
                # into this seat's cities (deferred per-kind culture);
                # overflow charges fall back to the instant lump inside
                # _place_works.
                _kind = self._gw_cls.index(cls) if cls in self._gw_cls else -1
                if _kind >= 0:
                    self._place_works(row, hit, eff[:, 1].double(), _kind)
                else:
                    self.civ_civic_prog[:, row] = self.civ_civic_prog[:, row] + eff[:, 1].double() * hf
                self.civ_treasury[:, row] = self.civ_treasury[:, row] + eff[:, 2].double() * hf
                prod_fx = eff[:, 3].double() * hf
                if bool((prod_fx != 0).any()):
                    # The capital's build head (cities.find(isCapital),
                    # queue non-empty). city_is_cap identifies it because
                    # compaction can move the capital off slot 0; at most
                    # one flag per (b, row), so the masked add lands on
                    # exactly the capital's head or nowhere.
                    _capa = self.city_is_cap[:, row] & self.city_alive[:, row]
                    capm = _capa & (self.city_current[:, row] >= 0)
                    self.city_progress[:, row] = self.city_progress[:, row] + torch.where(capm, prod_fx.unsqueeze(1), torch.zeros_like(self.city_progress[:, row]))
                    # the phase.ts twin: bank it rather than drop it when
                    # the capital has nothing queued
                    _capb = _capa & (self.city_current[:, row] < 0)
                    self.city_prod_bank[:, row] = self.city_prod_bank[:, row] + torch.where(
                        _capb, prod_fx.unsqueeze(1), torch.zeros_like(self.city_prod_bank[:, row]))
                if self._gp_effects.shape[2] > 4:
                    self.civ_faith[:, row] = self.civ_faith[:, row] + eff[:, 4].double() * hf
                if cls == self._prophet_cls:
                    self.civ_prophets[:, row] = self.civ_prophets[:, row] + hit.long()
                self.civ_gpp[:, row, cls] = torch.where(hit, self.civ_gpp[:, row, cls] - gcost, self.civ_gpp[:, row, cls])
                self.gp_earned[:, cls] = self.gp_earned[:, cls] + hit.long()
                self.era_score[:, row] += hit.long() * self._era_pts["gp"]  # per GP earned
                # A GENERAL/ADMIRAL claim spawns its support unit
                # (civilian, 4 MP) at the seat's capital (city_is_cap
                # center), on top of the instant effect — the phase.ts
                # spawn-at-claim mirror. Draws no RNG.
                if (cls == self._general_cls and self._general_unit_idx >= 0) or (cls == self._admiral_cls and self._admiral_unit_idx >= 0):
                    guidx = self._general_unit_idx if cls == self._general_cls else self._admiral_unit_idx
                    if bool(hit.any()):
                        cap_t = torch.where(self.city_is_cap[:, row] & self.city_alive[:, row], self.city_center[:, row], torch.full_like(self.city_center[:, row], -1)).max(dim=1).values
                        self._spawn_unit(row, hit & (cap_t >= 0), cap_t, guidx)
                        self._gen_ver += 1

    def _seat_belief_claims(self, row: int, active: torch.Tensor) -> None:
        """The BELIEF RACES for ONE seat row (0 = seat 0, r+1 = civ r), at the
        loop position right after the GP race. The picks' IDENTITIES matter:
        the effects apply to this seat. The draw takes the k-th OPEN id in
        data order — open[floor(rand * open.length)], the open list filtering
        the claimed pool. The pantheon costs pantheonFaithCost from this
        seat's own faith (deducted only when a pick lands); religion needs
        the canFoundReligion gates — pantheon, completed Holy Site (the
        seat-axis registry), an earned Prophet; the enhancer a SECOND
        Prophet. Each draw advances only where its own open-mask fires, so
        the RNG stream stays aligned with the TS block turn by turn."""
        rr, B, dev = self.rules.seats, self.B, self.device
        pfc = float(rr.get("pantheonFaithCost", 25))
        pdue = active & ~self.civ_pantheon_done[:, row] & (self.civ_faith[:, row] >= pfc)
        popen = pdue & (self.pantheon_claimed_n < rr.get("pantheonPool", 8))
        rp_ = self._next_random(popen)
        if bool(popen.any()) and self._bel_any:
            n_open = (~self.pan_claimed).sum(dim=1)
            k = torch.floor(rp_ * n_open.to(torch.float64)).to(torch.long)
            cum = (~self.pan_claimed).long().cumsum(dim=1)
            sel = (~self.pan_claimed) & (cum == (k + 1).unsqueeze(1))
            pid = sel.long().argmax(dim=1)
            prow = popen.nonzero(as_tuple=True)[0]
            self.pan_claimed[prow, pid[prow]] = True
            self.civ_pantheon[prow, row] = pid[prow]
            self._bel_version += 1  # belief change -> _bel_add / _belief_feat_plane invalidate
        self.civ_faith[:, row] = torch.where(popen, self.civ_faith[:, row] - pfc, self.civ_faith[:, row])
        self.pantheon_claimed_n.add_(popen.long())
        self.civ_pantheon_done[:, row] = self.civ_pantheon_done[:, row] | popen
        self.era_score[:, row] += popen.long() * self._era_pts["pantheon"]
        d_hs = int(self._gp_class_district[self._prophet_cls]) if self._prophet_cls < self._gp_nc else -1
        if d_hs >= 0 and self.districts_on:
            reg_hs = self.city_dist_tile[:, row, :, d_hs]  # [B, cols]
            has_hs = ((reg_hs >= 0) & self.district_complete.gather(1, reg_hs.clamp(min=0))).any(dim=1)
        else:
            has_hs = torch.zeros(B, dtype=torch.bool, device=dev)
        rdue = active & ~self.civ_religion_done[:, row] & self.civ_pantheon_done[:, row] & (self.civ_prophets[:, row] > 0) & has_hs
        ropen = rdue & (self.claimed_f_n < rr.get("followerPool", 8)) & (self.claimed_o_n < rr.get("founderPool", 8))
        rf_ = self._next_random(ropen)  # follower first, founder second — the TS draw order
        ro_ = self._next_random(ropen)
        if bool(ropen.any()) and self._bel_any:
            orow = ropen.nonzero(as_tuple=True)[0]
            for claimed_m, ids_t, rnd in ((self.fol_claimed, self.civ_follower, rf_), (self.fou_claimed, self.civ_founder, ro_)):
                n_open = (~claimed_m).sum(dim=1)
                k = torch.floor(rnd * n_open.to(torch.float64)).to(torch.long)
                cum = (~claimed_m).long().cumsum(dim=1)
                sel = (~claimed_m) & (cum == (k + 1).unsqueeze(1))
                bid = sel.long().argmax(dim=1)
                claimed_m[orow, bid[orow]] = True
                ids_t[orow, row] = bid[orow]
            self._bel_version += 1  # follower/founder change -> _bel_add / _belief_feat_plane invalidate
        self.claimed_f_n.add_(ropen.long())
        self.claimed_o_n.add_(ropen.long())
        self.civ_religion_done[:, row] = self.civ_religion_done[:, row] | ropen
        self.era_score[:, row] += ropen.long() * self._era_pts["religion"]
        # Freeze this religion's holy tile at founding — it is the pressure
        # source. civ_religion_done latches, so ropen fires once and the tile
        # never re-writes. The tile is the LIVE capital at founding time,
        # else the FIRST LIVE CITY (`cities.find(isCapital) ?? cities[0]`);
        # a static capital tile would go stale when the capital fell before
        # founding. The city planes are still split by row (the city-block
        # base unification collapses this branch).
        if row == 0:
            _alv = self.alive
            _cap = self.is_cap & _alv
            _ctr = self.site
        else:
            _alv = self.civ_city_alive[:, row - 1]
            _cap = self.civ_city_is_cap[:, row - 1] & _alv
            _ctr = self.civ_city_center[:, row - 1]
        _h_slot = torch.where(_cap.any(dim=1), _cap.long().argmax(dim=1), _alv.long().argmax(dim=1))
        _holy = _ctr.gather(1, _h_slot.unsqueeze(1)).squeeze(1)
        _holy = torch.where(_alv.any(dim=1), _holy, torch.full_like(_holy, -1))  # ?? null
        self.holy_tile[:, row] = torch.where(ropen, _holy, self.holy_tile[:, row])

        # Enhance the founded religion: a SECOND earned Prophet claims an
        # enhancer belief, denying it from the shared pool (the mirror of
        # the follower/founder claim). The draw sits AFTER the founder
        # draw, gated on religionFounded && !enhancerClaimed &&
        # prophets >= 2 && pool-open, and advances only where eopen, so it
        # is RNG-neutral when it never fires. The effects are live: presR
        # (pressure range), tradeRel (route income), cnear/cdef/cvs
        # (combat CS) read civ_enhancer through the _enh tables.
        edue = active & self.civ_religion_done[:, row] & ~self.civ_enhancer_done[:, row] & (self.civ_prophets[:, row] >= 2)
        eopen = edue & (self.claimed_e_n < rr.get("enhancerPool", 0))
        re_ = self._next_random(eopen)  # third belief draw — after follower/founder
        if bool(eopen.any()) and self._enh_any:
            erow = eopen.nonzero(as_tuple=True)[0]
            n_open = (~self.enh_claimed).sum(dim=1)
            k = torch.floor(re_ * n_open.to(torch.float64)).to(torch.long)
            cum = (~self.enh_claimed).long().cumsum(dim=1)
            sel = (~self.enh_claimed) & (cum == (k + 1).unsqueeze(1))
            eid = sel.long().argmax(dim=1)
            self.enh_claimed[erow, eid[erow]] = True
            self.civ_enhancer[erow, row] = eid[erow]
            self._bel_version += 1  # an enhancer claim moves the belief epoch too
        self.claimed_e_n.add_(eopen.long())
        self.civ_enhancer_done[:, row] = self.civ_enhancer_done[:, row] | eopen

    def _apply_loyalty_and_flips(self, tier_idx: torch.Tensor, pop_before: torch.Tensor) -> None:
        """Applies seat-0 loyalty inside the city loop, then the deferred flips.

        Mirrors applyLoyalty. City c's own-pressure mixes pops: cities EARLIER
        in the loop already grew this turn, later ones did not. Capitals pin to
        100. A city at 0 defects to the highest-pressure civ (ties → lowest
        id)."""
        if self.R == 0:
            return
        B, C, dev = self.B, self.C, self.device
        any_rc = (self.civ_city_alive.any(dim=2) & self.civ_only_alive).any(dim=1)
        if not bool(any_rc.any()):
            return
        rng = int(self.rules.seats.get("loyaltyRange", 9))
        scale = float(self.rules.seats.get("loyaltyScale", 20))
        sitec = self.site.clamp(min=0)
        d_cc = self.pair_dist[sitec.unsqueeze(2), sitec.unsqueeze(1)].to(self.dtype)
        # d_cc[b, c, c'] = dist(site[c], site[c']) — weight by source c'
        w = (rng + 1 - d_cc).clamp(min=0)
        # "Earlier in the loop" is ARRAY order (acquisition order, city_seq),
        # NOT column order: a hole-reuse founding puts the NEWEST city in a LOW
        # column, so column order would drop same-turn growth from the
        # own-pressure sum of every array-earlier, column-later city.
        seq = self.city_seq
        earlier = seq.unsqueeze(1) < seq.unsqueeze(2)  # [B, c, c'] → seq[c'] < seq[c]
        pop_mix = torch.where(earlier, self.pop.unsqueeze(1).to(self.dtype), pop_before.unsqueeze(1).to(self.dtype))
        # Contributions scale by the SOURCE seat's age factor (the loyaltyDelta
        # mirror: per-seat subtotal × factor — halves-exact in this dtype, so
        # grouping stays association-free).
        f_age = self._age_factor[self.civ_age].to(self.dtype)  # [B, 1+R]
        own = (w * pop_mix * self.alive.unsqueeze(1).to(self.dtype)).sum(dim=2) * f_age[:, 0].unsqueeze(1)
        # foreign pressure from civ-seat cities, per SOURCE civ × its factor
        civ_city_flat = self.civ_city_center.reshape(B, -1).clamp(min=0)
        civ_city_live = self.civ_city_alive.reshape(B, -1)
        d_cr = self.pair_dist[sitec.unsqueeze(2), civ_city_flat.unsqueeze(1)].to(self.dtype)
        wf = (rng + 1 - d_cr).clamp(min=0)
        foreign_r = (
            wf.reshape(B, C, self.R, self.RC)
            * self.civ_city_pop.reshape(B, 1, self.R, self.RC).to(self.dtype)
            * self.civ_city_alive.reshape(B, 1, self.R, self.RC).to(self.dtype)
        ).sum(dim=3)  # [B, C, R]
        foreign = (foreign_r * f_age[:, 1 : 1 + self.R].unsqueeze(1)).sum(dim=2)
        tot = own + foreign
        pressure = torch.where(tot > 0, scale * (own - foreign) / tot.clamp(min=1e-9), torch.zeros_like(tot))
        # Seat 0's governor seats — the endTurn governorPicks mirror. Rank
        # alive cities on QUANTIZED milli loyalty (raw-f64 ranking is
        # float-association-fragile), ties by city_seq (TS array position).
        # Pick from the PRE-update snapshot.
        titles_p = (self.civics.sum(dim=1) // self._gov_per).clamp(max=self._gov_max)  # [B]
        q_loy = js_round(self.loyalty * 1000).long()
        gov_key = torch.where(self.alive, q_loy * 256 + self.city_seq, torch.full_like(q_loy, 1 << 40))
        gov_rank = torch.empty_like(gov_key)
        gov_rank.scatter_(1, gov_key.argsort(dim=1, stable=True), torch.arange(C, device=dev).expand(B, C))
        gov_b = (gov_rank < titles_p.unsqueeze(1)) & self.alive
        delta = pressure + self._loyalty_amenity[tier_idx.clamp(min=0, max=self._loyalty_amenity.shape[0] - 1)] + gov_b.to(self.dtype) * self._gov_loy
        upd = self.alive & any_rc.unsqueeze(1)
        nxt = (self.loyalty + delta).clamp(min=0, max=float(self.rules.seats.get("loyaltyMax", 100)))
        self.loyalty.copy_(torch.where(upd, nxt, self.loyalty))
        # pin/guard by IDENTITY (isCapital), not column 0
        cap_pin = upd & self.is_cap
        self.loyalty.copy_(torch.where(cap_pin, torch.full_like(self.loyalty, 100.0), self.loyalty))
        flip = upd & (self.loyalty <= 0) & ~self.is_cap
        if not bool(flip.any()):
            return
        # Winner per flipping city: the civ with the most pressure (ties →
        # lowest id; zero pressure still wins over the -1 sentinel).
        # Defectors resolve in ACQUISITION order (the TS array-order loop) with
        # pressures read LIVE per defection — an earlier transfer moves pops
        # that later defections must see.
        pairs: list[tuple[int, int, int]] = []
        for c in range(C):
            for b in flip[:, c].nonzero(as_tuple=True)[0].tolist():
                pairs.append((b, int(self.city_seq[b, c]), c))
        for b, _, c in sorted(pairs):
            site_c = int(self.site[b, c])
            d_rc1 = self.pair_dist[site_c, civ_city_flat[b].clamp(min=0)].to(self.dtype)
            wr = (rng + 1 - d_rc1).clamp(min=0) * self.civ_city_pop[b].reshape(-1).to(self.dtype) * civ_city_live[b].to(self.dtype)
            press_r = wr.reshape(self.R if self.R > 0 else 1, self.RC).sum(dim=1)
            press_r = torch.where(self.civ_only_alive[b], press_r, torch.full_like(press_r, -1.0))
            winner = int(first_argmax(press_r.unsqueeze(0))[0])  # ties -> lowest civ id (the strict-`>` scan)
            self._transfer_city_to_civ(b, c, winner)

    def _transfer_city_to_civ(self, b: int, c: int, w_: int, conquest: bool = False) -> bool:
        """Moves a seat-0 city to civ seat `w_` — loyalty flips and captures share it.

        Returns False when a CONQUEST razes at the winner's city cap: the city
        ceases — tiles freed, center unpaved, no plunder. Loyalty flips are
        uncapped."""
        old_pop = int(self.pop[b, c])
        # the city leaves the empire
        self.alive[b, c] = False
        self.is_cap[b, c] = False  # identity dies with the city (a refound sets it fresh)
        self.pop[b, c] = 0
        self.current[b, c] = -1
        # the row-0 registry rows die with the city — the receiver rebuilds
        # its own below, and the conquest-raze path needs the clear too
        self.dist_tile[b, c, :] = -1
        self.wonder_reg[b, c, :] = -1
        # relocatePalace runs right after the cities filter — BEFORE the
        # cityHp/route prune and BEFORE the conquest-raze early return below.
        self._relocate_palace(torch.tensor([b], dtype=torch.long, device=self.device), torch.tensor([0], dtype=torch.long, device=self.device))
        owned = self.owner[b] == c
        # Snapshot the transferring city's COMPLETE placeable-district and
        # wonder tiles from the LIVE owner mask (CITY_CENTER is never in the
        # district plane, so it is excluded) plus its buildings row, BEFORE the
        # owner mask is cleared below. Conquest keeps this infrastructure; only
        # COMPLETE districts carry (incomplete = paved-but-dead).
        b30_dist_t = (owned & (self.district[b] >= 0) & self.district_complete[b]).nonzero(as_tuple=True)[0]
        b30_wond_t = (owned & (self.built_wonder[b] >= 0)).nonzero(as_tuple=True)[0]
        b30_bldg = self.buildings[b, c, :].clone()
        if conquest and int(self.civ_city_alive[b, w_].sum()) >= int(self.rules.seats.get("maxCities", 6)):
            s_t = int(self.site[b, c])
            self.tile_city[b] = torch.where(owned, torch.full_like(self.tile_city[b], -1), self.tile_city[b])
            self.tile_seat[b] = torch.where(owned, torch.full_like(self.tile_seat[b], NO_SEAT), self.tile_seat[b])  # seat + which city: the two halves TS calls ownerSeat/ownerCity
            self._tile_owner_ver += 1
            self.centre_slot_at[b, s_t] = -1
            self.district[b, s_t] = -1
            self.district_complete[b, s_t] = False
            self._eff_version += 1
            return False
        self.tile_seat[b] = torch.where(owned, torch.full_like(self.tile_seat[b], w_ + 1), self.tile_seat[b])  # seat + which city: the two halves TS calls ownerSeat/ownerCity
        self._tile_owner_ver += 1
        # The defecting city's tiles re-key to the receiving city's id (read
        # here from civ_only_next_city_id, assigned to the slot below).
        self.tile_city[b] = torch.where(owned, torch.full_like(self.tile_city[b], int(self.civ_only_next_city_id[b, w_])), self.tile_city[b])
        self.centre_slot_at[b, self.site[b, c]] = -1
        # ...and joins the winner at last-alive+1, NOT the alive count: a
        # capture hole would make the count point at a live city. TS appends,
        # so new cities iterate last.
        alive_w = self.civ_city_alive[b, w_].nonzero(as_tuple=True)[0]
        slot = int(alive_w.max()) + 1 if len(alive_w) else 0
        assert slot < self.RC, "civ city slots exhausted — raise RC (compaction already ran; this is true living capacity)"
        self.civ_city_alive[b, w_, slot] = True
        self.era_score[b, w_ + 1] += self._era_pts["conquer"]  # gained a city (flip/conquest; the raze path returned above)
        if self.fog_of_war:  # the captor reveals around the taken city (revealAround r3)
            self.seat_explored[b, w_ + 1] |= self.pair_dist[int(self.site[b, c])] <= 3
        self.civ_city_is_cap[b, w_, slot] = False  # a received city is never the capital
        self.civ_city_center[b, w_, slot] = self.site[b, c]
        self.civ_city_pop[b, w_, slot] = max(1, (old_pop * 3) // 4)
        self.civ_city_growth[b, w_, slot] = 0
        self.civ_city_cbox[b, w_, slot] = 0  # the transfer resets cultureBox
        # GREAT WORKS RIDE WITH THE CITY: real Civ 6 hands the conqueror the
        # works housed in a captured city, relics and artifacts included. All
        # five counts are written unconditionally, which also keeps a REUSED
        # slot from inheriting the dead city's works.
        self.civ_city_gw_writing[b, w_, slot] = int(self.gw_writing[b, c])
        self.civ_city_gw_art[b, w_, slot] = int(self.gw_art[b, c])
        self.civ_city_gw_music[b, w_, slot] = int(self.gw_music[b, c])
        self.civ_city_relics[b, w_, slot] = int(self.relics[b, c])
        self.civ_city_artifacts[b, w_, slot] = int(self.artifacts[b, c])
        self.civ_city_loyalty[b, w_, slot] = 100.0
        self.civ_city_acquired[b, w_, slot] = int(self.tiles_acquired[b, c])
        self.civ_city_hp[b, w_, slot] = round(self.rules.seats.get("cityMaxHp", 200) / 2)
        self.civ_city_id[b, w_, slot] = int(self.civ_only_next_city_id[b, w_])
        self.civ_city_current[b, w_, slot] = -1
        self.civ_city_progress[b, w_, slot] = 0.0
        self.civ_city_cost[b, w_, slot] = 0.0
        # A transferred city carries NO banked production: the TS twin pushes
        # a FRESH city literal rather than moving the object, so
        # productionBank is undefined there. Here the receiving civ SLOT may
        # hold a recycled leftover, so the zero must be written explicitly.
        self.civ_city_prod_bank[b, w_, slot] = 0.0
        self.civ_city_qtile[b, w_, slot] = -1
        # Conquest keeps infrastructure. Adopt the transferring city's
        # districts (registry keyed by placeable-district type -> tile),
        # wonders (keyed by wonder index -> tile), and buildings (the index
        # spaces match — buildings and civ_city_bldg both key on the b_cost catalog,
        # which excludes PALACE). ANCIENT_WALLS rides along; the outer pool
        # starts at 0 and heals back, since the heal gate reads the walls bit
        # in civ_city_bldg.
        self.civ_city_dist_tile[b, w_, slot, :] = -1
        for _t in b30_dist_t.tolist():
            self.civ_city_dist_tile[b, w_, slot, int(self.district[b, _t])] = _t
        self.civ_city_wonder[b, w_, slot, :] = -1
        for _t in b30_wond_t.tolist():
            self.civ_city_wonder[b, w_, slot, int(self.built_wonder[b, _t])] = _t
        self.civ_city_bldg[b, w_, slot, :] = b30_bldg
        self.civ_city_outer_hp[b, w_, slot] = 0  # walls (if any) arrive with an empty outer pool
        self.civ_only_next_city_id[b, w_] += 1
        self.centre_slot_at[b, self.site[b, c]] = slot
        self._eff_version += 1  # the receiver just gained civ_city_bldg/districts/tiles mid-phase
        return True


    def _found_seat0_city_at(self, want: torch.Tensor, tile: torch.Tensor) -> torch.Tensor:
        """FOUNDs a seat-0 city at `tile` [B] where `want` — the FOUND_CITY verb's mutation.

        canFoundCity legality is re-checked LIVE at the settler's own tile;
        centre stats derive from the tile planes (the fixture ships no site
        metas); the settler unit is consumed by the CALLER. Returns the games
        that founded."""
        B, C = self.B, self.C
        sc = tile.clamp(min=0)
        # canFoundCity: static legality (land / passable / no natural wonder /
        # no oasis = settle_ok), unowned by anyone, no district or wonder,
        # >= CITY_MIN_DIST from EVERY centre (own, civ, city-state), cap 6.
        free = (
            (self.owner.gather(1, sc.unsqueeze(1)).squeeze(1) < 0)
            & (self.citystate_at.gather(1, sc.unsqueeze(1)).squeeze(1) < 0)
            & (self.civ_at.gather(1, sc.unsqueeze(1)).squeeze(1) < 0)
        )
        dcity = torch.where(self.alive, self.pair_dist[sc.unsqueeze(1), self.site.clamp(min=0)].to(torch.long), 999)
        civ_city_flat = self.civ_city_center.reshape(B, -1).clamp(min=0)
        drc = torch.where(self.civ_city_alive.reshape(B, -1), self.pair_dist[sc.unsqueeze(1), civ_city_flat].to(torch.long), 999)
        cap_ok = self.alive.sum(dim=1) < 6
        hole = first_argmax((~self.alive).long())
        slot_new = torch.where(self.founded_n < C, self.founded_n, hole)
        no_district = self.district.gather(1, sc.unsqueeze(1)).squeeze(1) < 0
        citystate_ctr = self.citystate_center[:, : max(self.S, 1)].clamp(min=0)
        dcs = torch.where(
            self.citystate_alive[:, : max(self.S, 1)],
            self.pair_dist[sc.unsqueeze(1), citystate_ctr].to(torch.long),
            torch.full_like(citystate_ctr, 999),
        )
        ok = (
            (tile >= 0) & self.settle_ok.gather(1, sc.unsqueeze(1)).squeeze(1)
            & free & (dcity.min(dim=1).values >= 4) & (drc.min(dim=1).values >= 4)
            & no_district & (self.built_wonder.gather(1, sc.unsqueeze(1)).squeeze(1) < 0)
            & (dcs.min(dim=1).values >= 4) & cap_ok
        )  # CITY_MIN_DIST = 4
        valid = want & ok
        if not bool(valid.any()):
            return valid
        rows = valid.nonzero(as_tuple=True)[0]
        c_new = slot_new[rows]
        new_cap = self.alive[rows].sum(dim=1) == 0  # first city (or total-collapse refound) IS the capital
        s_idx = tile[rows]
        self._reveal_around(rows, 0, s_idx, 3)  # foundCityAt's revealAround(seat, tile, 3)
        self.site[rows, c_new] = s_idx
        # LIVE centre stats, the same convention the civ centres use: stripped-
        # tile yields with the centre floors, pre-clamp raw food, water housing
        # / coastal / river from the planes, base upkeep = the Palace's for a
        # capital and 0 otherwise.
        frm_pre = self.feat_removable[rows, s_idx] | self.feat_stripped[rows, s_idx]
        cy = self.tile_yields[rows, s_idx].clone()
        cy = cy - self.feat_yields[rows, s_idx].to(cy.dtype) * frm_pre.unsqueeze(1).to(cy.dtype)
        raw_food = cy[:, 0].clone()
        cy[:, 0] = torch.maximum(cy[:, 0], torch.full_like(cy[:, 0], float(self.rules.center_min_food)))
        cy[:, 1] = torch.maximum(cy[:, 1], torch.full_like(cy[:, 1], float(self.rules.center_min_production)))
        self.center_yields[rows, c_new] = cy.to(self.center_yields.dtype)
        self.center_raw_food[rows, c_new] = raw_food.to(self.center_raw_food.dtype)
        self.base_maintenance[rows, c_new] = torch.where(
            new_cap,
            torch.full_like(self.base_maintenance[rows, c_new], float(self.rules.palace_maintenance)),
            torch.zeros_like(self.base_maintenance[rows, c_new]),
        )
        self.water_housing[rows, c_new] = torch.where(
            self.fresh_water[rows, s_idx],
            torch.full_like(self.water_housing[rows, c_new], float(self.rules.housing_fresh)),
            torch.where(
                self.coastal_land[rows, s_idx],
                torch.full_like(self.water_housing[rows, c_new], float(self.rules.housing_coastal)),
                torch.full_like(self.water_housing[rows, c_new], float(self.rules.housing_none)),
            ),
        )
        self.coastal[rows, c_new] = self.coastal_land[rows, s_idx]
        self.river_center[rows, c_new] = self.tile_river[rows, s_idx]
        self.dist[rows, c_new] = self.pair_dist[s_idx]
        self.alive[rows, c_new] = True
        self.pop[rows, c_new] = 1
        self.food_box[rows, c_new] = 0
        self.culture_box[rows, c_new] = 0
        self.gw_writing[rows, c_new] = 0  # a freshly settled city holds no works
        self.gw_music[rows, c_new] = 0
        self.tiles_acquired[rows, c_new] = 0
        self.current[rows, c_new] = -1
        self.progress[rows, c_new] = 0
        # A freshly settled city holds NO BANKED PRODUCTION; a reused slot
        # would otherwise inherit the dead city's bank.
        self.prod_bank[rows, c_new] = 0
        self.loyalty[rows, c_new] = 100.0
        self.city_hp[rows, c_new] = self.rules.combat.get("cityMaxHp", 200)
        # Slot hygiene for hole-reuse foundings: buildings / walls / cost /
        # district-queue tile all reset.
        self.buildings[rows, c_new] = False
        self.outer_hp[rows, c_new] = 0
        self.cur_cost[rows, c_new] = 0.0
        self.q_dtile[rows, c_new] = -1
        self.dist_tile[rows, c_new, :] = -1  # row-0 registry hygiene
        self.wonder_reg[rows, c_new, :] = -1
        # founded_n bumps only for append slots — a hole-fallback founding
        # reuses a dead column.
        self.founded_n[rows] += (c_new == self.founded_n[rows]).long()
        self.era_score[rows, 0] += self._era_pts["found"]  # the foundCity moment
        self.city_seq[rows, c_new] = self.city_seq_next[rows]
        self.city_seq_next[rows] += 1
        self.is_cap[rows, c_new] = new_cap
        self.cap_tile[rows] = torch.where(new_cap, s_idx, self.cap_tile[rows])
        # Claim the center (unconditionally, as foundCity does) plus any
        # unowned first-ring tiles; the center becomes a district tile.
        self.tile_city[rows, s_idx] = c_new
        self.tile_seat[rows, s_idx] = 0
        self._tile_owner_ver += 1
        self.workable[rows, s_idx] = False
        self.centre_slot_at[rows, s_idx] = c_new
        # foundCity strips the removable feature (defense/movement drop to the
        # hills component; unremovable features survive LIVE).
        frm_f = self.feat_removable[rows, s_idx]
        self.tdef[rows, s_idx] = torch.where(frm_f, self.hills[rows, s_idx].long() * 3, self.tdef[rows, s_idx])
        self.tmove[rows, s_idx] = torch.where(frm_f, self.hills[rows, s_idx].long() * 3, self.tmove[rows, s_idx])
        fresh_f = ~self.feat_stripped[rows, s_idx] & frm_f
        self.feat_stripped[rows, s_idx] |= frm_f
        self.improvement[rows, s_idx] = -1
        self._eff_version += 1
        # ...and drops the district adjacency that feature lent to neighbours,
        # then claims any unowned first-ring tile (water included).
        contrib = self._feat_adj[rows, s_idx] * fresh_f.unsqueeze(1).to(self._feat_adj.dtype)  # [R, nD]
        nb = self.neigh[s_idx]  # [R, 6]
        for d in range(6):
            n_d = nb[:, d]
            ndc = n_d.clamp(min=0)
            on_map = n_d >= 0
            if bool(on_map.any()):
                om = on_map.nonzero(as_tuple=True)[0]
                self.d_static_adj[rows[om], n_d[om], :] -= contrib[om]
            free_nb = (
                on_map
                & (self.owner[rows, ndc] == -1)
                & (self.citystate_at[rows, ndc] < 0)
                & (self.civ_at[rows, ndc] < 0)
            )
            self.tile_city[rows[free_nb], n_d[free_nb]] = c_new[free_nb]
            self.tile_seat[rows[free_nb], n_d[free_nb]] = 0
            self._tile_owner_ver += 1
        self._eff_version += 1  # d_static_adj changed
        return valid

    def _apply_settlers_and_purchases(self, act: torch.Tensor, buildable: torch.Tensor) -> None:
        """Queues settlers and applies gold purchases for seat 0, in city-slot order.

        Only runs when _rl_purchase_active. Settler prices and the treasury are
        order-coupled across cities deciding in the same turn: queueing OR
        buying a settler raises the next slot's settlerCost (both feed the same
        `cities-1 + settlers + queued` counter, mirroring settlerCost /
        purchaseSettler), and every purchase drains the shared treasury. The TS
        replay applies act.p entries sequentially in slot order, so this walk
        mirrors it. Failed purchases (gold ran out by this slot, or a unit with
        no free spawn tile — spawnUnit refunds) are no-ops, not errors,
        matching the units-head revalidation convention. Purchased
        buildings/units land instantly (before _city_totals), so they take
        effect this very turn.
        """
        r, rd, C = self.rules, self.rules_dev, self.C
        mult = r.gold_purchase_mult
        pbase = self.UNIT_BASE + self.NU + len(self._scaffold)
        n_cities = self.alive.sum(dim=1)
        # live counters: settlers-in-production from EARLIER turns (pending
        # cities are -1 and building/unit codes never write SETTLER)…
        queued_live = (self.current == self.SETTLER).sum(dim=1)
        # …and the settler stock, which purchases grow as the walk proceeds
        settlers_live = self._seat0_settlers()  # LIVE units, not a bank
        # The builder escalator's live count: builders queued in EARLIER turns
        # plus, as the walk proceeds, this turn's queues and purchases (act.p
        # applies sequentially and both move builderCost).
        bcode_w = (self.UNIT_BASE + self._builder_idx) if self._builder_idx >= 0 else -999
        for c in range(C):
            ac = act[:, c]
            # --- queue a settler (cost from the live counters, queueSettler)
            is_s = ac == self.SETTLER
            if bool(is_s.any()):
                s_cost = r.settler_base + r.settler_per_city * (
                    n_cities - 1 + settlers_live + queued_live
                ).clamp(min=0).to(self.dtype)
                self.progress[:, c] = torch.where(is_s, torch.zeros_like(self.progress[:, c]), self.progress[:, c])
                self.cur_cost[:, c] = torch.where(is_s, s_cost, self.cur_cost[:, c])
                self.current[:, c] = torch.where(is_s, torch.full_like(self.current[:, c], self.SETTLER), self.current[:, c])
                queued_live = queued_live + is_s.long()
            # --- queue a builder (excluded from the vectorized unit block in
            # purchase mode; priced off the live escalator here)
            if self._builder_idx >= 0:
                is_bq = (ac == bcode_w) & self.alive[:, c] & (self.current[:, c] == -1)
                if bool(is_bq.any()):
                    b_cost = self._builder_cost(self.builders_trained)  # ALREADY PRODUCED only — a queued item has produced nothing
                    self.progress[:, c] = torch.where(is_bq, torch.zeros_like(self.progress[:, c]), self.progress[:, c])
                    self.cur_cost[:, c] = torch.where(is_bq, b_cost, self.cur_cost[:, c])
                    self.current[:, c] = torch.where(is_bq, torch.full_like(self.current[:, c], bcode_w), self.current[:, c])
            pi = ac - pbase
            # --- buy a building (purchaseBuilding: _buildable ∧ gold; instant)
            is_pb = (pi >= 0) & (pi < self.NB)
            if bool(is_pb.any()):
                idx = pi.clamp(min=0, max=self.NB - 1)
                cost = rd.b_cost[idx] * mult
                _isw = self._b_worship.gather(0, idx)
                _wcost = torch.full_like(cost, self._worship_cost)
                can = is_pb & buildable[:, c].gather(1, idx.unsqueeze(1)).squeeze(1) & torch.where(
                    _isw, self._afford(self.faith, _wcost), self._afford(self.treasury, cost))
                if bool(can.any()):
                    rows = can.nonzero(as_tuple=True)[0]
                    self.buildings[rows, c, idx[rows]] = True
                    # a purchased ANCIENT_WALLS fills the outer pool
                    if self._walls_bidx >= 0:
                        wm = rows[idx[rows] == self._walls_bidx]
                        if len(wm) > 0:
                            self.outer_hp[wm, c] = self._walls_hp
                    self._eff_version += 1  # _buildable keys on it (a bought building must vanish from later masks)
                    # worship pays FAITH, everything else gold
                    self.faith.copy_(torch.where(can & _isw, self.faith - _wcost, self.faith))
                    self.treasury.copy_(torch.where(can & ~_isw, self.treasury - cost, self.treasury))
            # --- buy a settler (purchaseSettler: settlers += 1 immediately,
            # which raises every later slot's price)
            is_ps = pi == self.NB
            if bool(is_ps.any()) and self._settler_idx >= 0:
                s_cost = (
                    r.settler_base + r.settler_per_city * (n_cities - 1 + settlers_live + queued_live).clamp(min=0).to(self.dtype)
                ) * mult
                # The settler SPAWNS at the buying city (pop >= 2, and no free
                # spot = refund — the purchaseSettler rule).
                found_ps, _ = self._first_free_spot(self.site[:, c], "seat0", torch.ones(self.B, dtype=torch.bool, device=self.device))
                can = is_ps & (self.pop[:, c] >= 2) & self._afford(self.treasury, s_cost) & found_ps
                self.treasury.copy_(torch.where(can, self.treasury - s_cost, self.treasury))
                if bool(can.any()):
                    self._spawn_unit(0, can, self.site[:, c], self._settler_idx)
                self.pop[:, c] = torch.where(can, (self.pop[:, c] - 1).clamp(min=1), self.pop[:, c])  # purchased settlers cost the pop too
                settlers_live = settlers_live + can.long()
            # --- buy a unit (purchaseUnit: trainable ∧ gold ∧ a free spawn
            # tile at/near the center — no tile means refund, i.e. a no-op)
            pu = pi - (self.NB + 1)
            is_pu = (pu >= 0) & (pu < self.NU)
            if bool(is_pu.any()):
                utp = pu.clamp(min=0, max=self.NU - 1)
                p_tech = self._type_tech[utp]
                tech_ok = (p_tech < 0) | self.techs.gather(1, p_tech.clamp(min=0).unsqueeze(1)).squeeze(1)
                # Strategic-resource access gates the purchase (purchaseUnit →
                # trainableUnits), per this slot's chosen unit.
                res_ok = self._res_avail_mask(self.tile_seat == 0).gather(1, utp.unsqueeze(1)).squeeze(1)
                tech_ok = tech_ok & res_ok & ~self._type_faith_only[utp]  # faith-only units never gold-buy
                cost = self._type_cost[utp] * mult
                if self._builder_idx >= 0:
                    # bought builders price off the live escalator…
                    b_now = self._builder_cost(self.builders_trained)  # ALREADY PRODUCED only — a queued item has produced nothing
                    b_now = b_now * mult
                    cost = torch.where(utp == self._builder_idx, b_now, cost)
                found, _ = self._first_free_spot(self.site[:, c], "seat0", self._type_civilian[utp])
                can = is_pu & tech_ok & self._afford(self.treasury, cost) & found
                if bool(can.any()):
                    self.treasury.copy_(torch.where(can, self.treasury - cost, self.treasury))
                    # a purchased military unit inherits city c's Encampment training XP (best tier)
                    xp_c = (self.buildings[:, c, :].long() * self._b_train_xp.reshape(1, -1)).max(dim=1).values
                    self._spawn_unit(0, can, self.site[:, c], utp, init_xp=xp_c)
                    if self._builder_idx >= 0:
                        # …and move it for every later slot (purchaseUnit)
                        self.builders_trained.add_((can & (utp == self._builder_idx)).long())

    # --- one full turn -----------------------------------------------------------

    #: Every per-slot plane a captured unit must carry. One list, so a NEW
    #: plane cannot be silently forgotten by a capture. Ownership-reset planes
    #: are named separately below rather than copied.
    _CAPTURE_CARRY = ("type", "hp", "charges", "emb", "xp", "mp_full")
    #: Reset on an ownership change: a captured civilian never fortifies, never
    #: auras, and has movesLeft = 0 (acted) so the heal skips it this turn.
    _CAPTURE_RESET = {"fortify": 0, "aura_mp": 0, "mp": 0}

    def _carry_capture(self, rows: torch.Tensor, src: torch.Tensor, dst: torch.Tensor) -> None:
        """Move a unit's per-slot state from MERGED slot `src` to `dst`.

        One loop over _CAPTURE_CARRY instead of a hand-written block per
        capture path. Reads are taken BEFORE any write, so src and dst may be
        in the same pool.
        """
        vals = {k: getattr(self, f"unit_{k}")[rows, src].clone() for k in self._CAPTURE_CARRY}
        for k, v in vals.items():
            getattr(self, f"unit_{k}")[rows, dst] = v
        for k, v in self._CAPTURE_RESET.items():
            getattr(self, f"unit_{k}")[rows, dst] = v

    def _reclaim_pool(self, prefix: str) -> None:
        """Stably compacts a unit pool when its high-water nears the cap.

        TS arrays SPLICE dead units, so the LIVING's relative order IS the
        spec — a stable compaction preserves it exactly (slot loops visit the
        same units in the same order; draws unchanged). Tile->slot maps remap
        by VALUE through the inverse permutation, needing no semantic rebuild.
        CIV6_RECLAIM_AT lowers the trigger for forced-compaction gates."""
        # The field list is DERIVED from the pool's plane list, never
        # transcribed — a hand-written list drifts and silently leaves a plane
        # behind at the old slot index. `alive` permutes separately, and civ_unit_civ
        # is the one field that is not a merged plane.
        counter = {"barb": "next_slot", "civ": "civ_unit_next"}.get(prefix, "seat0_unit_next")
        maps: list = []
        fields = [f"{prefix}_unit_{pl}" for pl in self._UNIT_PLANES if pl != "alive"]
        if prefix == "civ":
            fields.append("civ_unit_civ")
        alive = getattr(self, f"{prefix}_unit_alive")
        B, U = alive.shape
        perm = torch.argsort((~alive).long(), dim=1, stable=True)  # living first, order kept
        inv = torch.empty_like(perm)
        inv.scatter_(1, perm, torch.arange(U, device=alive.device).unsqueeze(0).expand(B, -1))
        # Write the permutation IN PLACE: p_/v_/u_ are VIEWS of one merged pool
        # tensor, so a setattr rebind would swap in fresh storage and orphan
        # every alias. gather() cannot target itself, hence the temporary.
        for name in fields:
            t = getattr(self, name)
            t.copy_(t.gather(1, perm))
        alive.copy_(alive.gather(1, perm))
        getattr(self, counter).copy_(alive.sum(dim=1))
        for m in maps:
            at = getattr(self, m)
            at.copy_(torch.where(at >= 0, inv.gather(1, at.clamp(min=0)), at))
        # The merged maps hold MERGED slots, so the inverse permutation applies
        # only to entries inside THIS pool's range.
        lo, hi = self.POOL_LO[prefix], self.POOL_HI[prefix]
        for m in ("military_at", "civilian_at"):
            at = getattr(self, m)
            mine = (at >= lo) & (at < hi)
            # gather evaluates EVERY lane, including the ones torch.where
            # discards, so the index must be clamped to inv's width — a slot
            # from another pool is out of range by construction.
            at.copy_(torch.where(mine, inv.gather(1, (at - lo).clamp(min=0, max=inv.shape[1] - 1)) + lo, at))

    _RC_SLOT_FIELDS = (
        "civ_city_alive", "civ_city_center", "civ_city_pop", "civ_city_growth", "civ_city_cbox", "civ_city_loyalty",
        "civ_city_acquired", "civ_city_hp", "civ_city_outer_hp", "civ_city_id", "civ_city_is_cap", "civ_city_current", "civ_city_progress",
        "civ_city_prod_bank",  # banked overflow: it rides the permutation with
                         # civ_city_progress or a compaction hands one city's bank
                         # to its neighbour
        "civ_city_cost", "civ_city_qtile",
        # ALL work counts must ride the compaction permutation; one left out
        # stays at the old slot index, so the city loses its works or inherits
        # its neighbour's.
        "civ_city_gw_writing", "civ_city_gw_art", "civ_city_gw_music", "civ_city_relics", "civ_city_artifacts",
    )

    def _reclaim_civ_cities(self) -> None:
        """Stably compacts the rc city slots, per (game, civ).

        TS SPLICES civ.cities on capture/flip/transfer and pushes on
        settle/receive, so the LIVING's relative order IS the spec — stable
        compaction preserves it exactly (the per-slot loops, the arange
        tie-breaks and civ_empire_score's sequential association all see the
        same cities in the same order). No tile map keys on the SLOT
        (civ_city_at/civ_at are civ-keyed; civ_city_center carries tile VALUES and permutes
        with its row), so no inverse-map rebuild is needed — but the capital is
        an identity, not a slot, so civ_city_is_cap permutes along. Runs at the step
        END like _reclaim_pool: the controlled head samples slot-keyed city
        actions from the PRE-step masks, so the layout must hold through this
        step's applies. CIV6_RC_RECLAIM_AT lowers the trigger for
        forced-compaction gates."""
        alive = self.civ_city_alive  # [B, R, RC]
        perm = torch.argsort((~alive).long(), dim=2, stable=True)  # living first, order kept
        # In place, for the same reason as _reclaim_pool: these rc_* planes are
        # views of one merged city tensor, and a setattr rebind here would
        # orphan every alias at the first compaction.
        for name in self._RC_SLOT_FIELDS:
            t = getattr(self, name)
            t.copy_(t.gather(2, perm))
        for name in ("civ_city_dist_tile", "civ_city_bldg", "civ_city_wonder"):
            t = getattr(self, name)
            t.copy_(t.gather(2, perm.unsqueeze(3).expand(-1, -1, -1, t.shape[3])))
        # The religion pair lives on ONE seat-indexed plane, so its civ rows
        # are permuted by slice rather than by name. Both MUST ride the
        # permutation or a compaction hands one city's faith to its neighbour.
        _fol = self.city_followed[:, 1:1 + self.R]
        _fol.copy_(_fol.gather(2, perm))
        _pre = self.city_pressure[:, 1:1 + self.R]
        _pre.copy_(_pre.gather(2, perm.unsqueeze(3).expand(-1, -1, -1, _pre.shape[3])))
        self._eff_version += 1  # no (r, j)-keyed cache may survive the permutation

    def _check_rc_registry_invariant(self) -> None:
        """Machine-checks district/wonder <-> tile-registry coherence for every alive civ city.

        Env-gated via self._civ_city_reg_check, so it costs nothing on the hot path
        when off. Two directions of the tile_city contract:

          (1) FORWARD: every district tile (civ_city_dist_tile) and wonder tile
              (civ_city_wonder) an rc lists registers BACK to that rc — its
              tile_city equals civ_city_id (a district/wonder sits on a tile owned
              by THAT city). A tile registered to a SIBLING fails here.
          (2) BACKWARD: every populated registry cell points at a tile whose
              civ_at is a live civ (no dangling index into re-owned/razed
              land). The registry never lists a tile it does not own.

        Raises AssertionError naming (game, civ, slot, kind, di/wi, tile,
        expected id, actual tile_city) on the first violation."""
        if self.R == 0:
            return
        B = self.B
        for r in range(self.R):
            expect = self.civ_city_id[:, r].unsqueeze(2)  # [B, RC, 1] this rc's id
            alive = self.civ_city_alive[:, r].unsqueeze(2)  # [B, RC, 1]
            for name in ("civ_city_dist_tile", "civ_city_wonder"):
                reg = getattr(self, name)[:, r]  # [B, RC, K] tile per (city, type/slot)
                has = (reg >= 0) & alive
                if not bool(has.any()):
                    continue
                # tile_city at the listed tile, per cell
                rt = self.tile_city.gather(1, reg.clamp(min=0).reshape(B, -1)).reshape_as(reg)  # [B, RC, K]
                ra = self.civ_at.gather(1, reg.clamp(min=0).reshape(B, -1)).reshape_as(reg)
                bad_fwd = has & (rt != expect)  # (1) registers to a sibling / no one
                bad_bwd = has & (ra < 0)        # (2) tile no longer civ-owned
                bad = bad_fwd | bad_bwd
                if bool(bad.any()):
                    idx = bad.nonzero(as_tuple=False)[0]
                    b, j, k = int(idx[0]), int(idx[1]), int(idx[2])
                    tile = int(reg[b, j, k])
                    raise AssertionError(
                        f"A-24 registry incoherence: game={b} civ={r} slot={j} "
                        f"{name}[{k}] tile={tile} expected_id={int(self.civ_city_id[b, r, j])} "
                        f"actual_rc_tile_id={int(self.tile_city[b, tile])} "
                        f"civ_at={int(self.civ_at[b, tile])} turn={self.turn}"
                    )
