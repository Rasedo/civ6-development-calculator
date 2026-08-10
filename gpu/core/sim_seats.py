"""Per-seat decision surfaces: masks/apply for driven seats, buys, religion, trade.

One mixin of BatchSim (assembled in engine.py); state and helpers live on
self / gpu/core/simbase.py.
"""
from __future__ import annotations

from .simbase import *  # noqa: F401,F403 — torch, constants, helpers: the shared floor
from .simbase import _MUTABLE  # noqa: F401 — private names do not ride a star import
from . import simbase  # the PATCHABLE globals (POOL_MAX/SEAT0_POOL_MAX/_ALIAS_CHECK) must be read live


class SimSeats:
    def seat_masks(self, r: int, lite: bool = False) -> dict[str, torch.Tensor]:
        """A controlled civ seat's decision space, in the shared head layouts
        so one net serves every seat.

        production [B, RC, W], per city slot, in column order: NB queue-building
        columns, 1 settler, 1 idle, NU train-unit columns, nScaffold district
        columns (all six idle-gated), then the gold-purchase block (NB building /
        1 settler / NU unit, not idle-gated), then nW wonder and nP project
        columns (idle-gated). tech [B, NT] / civic [B, NC] = available picks
        where cur == -1. war [B, 2R]: column 0 declares, column R sues for peace.

        Masks read the CURRENT state — call before step(); apply_seat_actions()
        writes the choices the seat phase honors. lite=True zeroes the purchase
        block for the driver, whose ladder has no purchase class."""
        B, dev = self.B, self.device
        rdv = self.rules_dev
        NBn = rdv.b_cost.shape[0]
        nS = len(self._scaffold)
        rr = self.rules.seats
        alive = self.civ_city_alive[:, r]  # [B, RC]
        idle = alive & (self.civ_city_current[:, r] == -1)
        # buildings: the B4b-2 gate block, vectorized over cities
        ones_nb = torch.ones(B, NBn, dtype=torch.bool, device=dev)
        unl_b = torch.where(
            rdv.b_unlock.unsqueeze(0) >= 0,
            self.civ_only_techs[:, r].gather(1, rdv.b_unlock.clamp(min=0).unsqueeze(0).expand(B, -1)),
            ones_nb,
        ) & torch.where(
            rdv.b_unlock_civic.unsqueeze(0) >= 0,
            self.civ_only_civics[:, r].gather(1, rdv.b_unlock_civic.clamp(min=0).unsqueeze(0).expand(B, -1)),
            ones_nb,
        )  # [B, NB]
        prod_cols = []
        for j in range(self.RC):
            have_b = self.civ_city_bldg[:, r, j]
            ctile = self.civ_city_center[:, r, j].clamp(min=0)
            riv_c = self.tile_river.gather(1, ctile.unsqueeze(1)).squeeze(1)
            ok_b = unl_b & ~have_b & (~rdv.b_river.reshape(1, -1) | riv_c.unsqueeze(1)) & ~self._b_worship.reshape(1, -1)  # worship buildings are faith-only
            reqd_b = rdv.b_req_district
            reg_t = self.civ_city_dist_tile[:, r, j].gather(1, reqd_b.clamp(min=0).unsqueeze(0).expand(B, -1))
            dcomp = (reg_t >= 0) & self.district_complete.gather(1, reg_t.clamp(min=0))
            ok_b &= torch.where(reqd_b.unsqueeze(0) >= 0, dcomp, ones_nb)
            for bi2, reqs in enumerate(self.rules.b_req_buildings):
                if reqs:
                    ok_b[:, bi2] &= have_b[:, torch.tensor(reqs, device=dev, dtype=torch.long)].any(dim=1)
            for bi2, excl in enumerate(self.rules.b_excl_buildings):  # exclusiveWith
                if excl:
                    ok_b[:, bi2] &= ~have_b[:, torch.tensor(excl, device=dev, dtype=torch.long)].any(dim=1)
            # settler: ANY city, as queueSettler allows. This column carries
            # LEGALITY only. The one-settler-in-flight and city-cap terms are
            # POLICY and live in the scripted picker and in gpu/ladder.py's ctx
            # (`settler_queued`, `city_cap`); mask and picker may diverge on
            # policy, never on legality.
            n_cities = self.civ_city_alive[:, r].sum(dim=1)
            ok_s = torch.ones(B, 1, dtype=torch.bool, device=dev)
            # units: derived from the picker's OWN predicate, never a second
            # hardcoded ladder — the two must not drift. Trainable = tech
            # satisfied over this civ's real techs (-1 = ungated) AND strategic
            # access (the same `tr_u_r` the picker builds), narrowed to MILITARY
            # LAND units, which is what the production lanes select from. Naval
            # hulls get the dedicated galley column below; civilians (combat 0)
            # are produced by no seat ladder.
            tr_u_r = (
                (self._type_tech.unsqueeze(0) < 0)
                | self.civ_only_techs[:, r].gather(1, self._type_tech.clamp(min=0).unsqueeze(0).expand(B, -1))
            )
            ok_u = tr_u_r & (self._type_combat.unsqueeze(0) > 0) & ~self.unit_naval.unsqueeze(0)
            if self.improvements_on and self._builder_idx >= 0:
                has_alive = (self.civ_unit_alive & (self.civ_unit_civ == r) & (self.civ_unit_type == self._builder_idx)).any(dim=1)
                has_q = ((self.civ_city_current[:, r] == self._builder_idx + 1) & self.civ_city_alive[:, r]).any(dim=1)  # alive-masked
                ok_u[:, self._builder_idx] = ~(has_alive | has_q) & self._civ_job_mask(r).any(dim=1)
            # MILITARY ENGINEER: one per civ (live or queued), and only while a
            # FORT job exists. Combat 0 keeps it out of both lanes above, so this
            # column is the only way a net can express one.
            if self._seat_eng_live and self._eng_idx >= 0:
                has_alive_e = (self.civ_unit_alive & (self.civ_unit_civ == r) & (self.civ_unit_type == self._eng_idx)).any(dim=1)
                has_q_e = ((self.civ_city_current[:, r] == self._eng_idx + 1) & self.civ_city_alive[:, r]).any(dim=1)
                ok_u[:, self._eng_idx] = ~(has_alive_e | has_q_e) & self._seat_fort_job_mask_r(r).any(dim=1)
            # GALLEY: SAILING plus a naval-capable CITY (center adjacent to water
            # OR a completed Harbor), and the civ owns zero naval units live or
            # queued. Per-city, hence inside this j loop. ~unit_naval above
            # excludes every hull, so this is the only column that floats a ship.
            if self._galley_idx >= 0 and self._sailing_tech >= 0:
                has_sail_g = self.civ_only_techs[:, r, self._sailing_tech]
                ctr_jg = self.civ_city_center[:, r, j].clamp(min=0)
                nb_jg = self.neigh[ctr_jg]
                coastal_jg = ((nb_jg >= 0) & self.wpass.gather(1, nb_jg.clamp(min=0))).any(dim=1)
                if self._harbor_idx >= 0:
                    hb_jg = self.civ_city_dist_tile[:, r, j, self._harbor_idx]
                    harbor_jg = (hb_jg >= 0) & self.district_complete.gather(1, hb_jg.clamp(min=0).unsqueeze(1)).squeeze(1)
                else:
                    harbor_jg = torch.zeros(B, dtype=torch.bool, device=dev)
                vt_allm = self.civ_unit_type.clamp(min=0, max=self.NU - 1)
                naval_live_g = (self.civ_unit_alive & (self.civ_unit_civ == r) & self.unit_naval[vt_allm]).any(dim=1)
                qcur_g = self.civ_city_current[:, r]
                q_nav_g = (qcur_g >= 1) & (qcur_g <= self.NU) & self.civ_city_alive[:, r] & self.unit_naval[(qcur_g - 1).clamp(min=0, max=self.NU - 1)]
                ok_u[:, self._galley_idx] = (
                    has_sail_g & (coastal_jg | harbor_jg) & ~(naval_live_g | q_nav_g.any(dim=1))
                )
            ok_u = ok_u & self._res_avail_mask(self.civ_at == r)  # civ strategic-resource gate (builder ungated → all-True)
            # scaffold districts: placeable NOW
            ok_d = torch.zeros(B, nS, dtype=torch.bool, device=dev)
            if self.districts_on and self._scaffold:
                cap_max = torch.div(self.civ_city_pop[:, r, j] - 1, 3, rounding_mode="floor") + 1
                spec_cnt = ((self.civ_city_dist_tile[:, r, j] >= 0) & self._is_specialty).sum(dim=1)
                for si, (di, utech, uciv, plc) in enumerate(self._scaffold):
                    has_tech = self.civ_only_techs[:, r, utech] if utech >= 0 else (self.civ_only_civics[:, r, uciv] if uciv >= 0 else torch.ones(B, dtype=torch.bool, device=dev))  # kind-aware
                    not_owned = self.civ_city_dist_tile[:, r, j, di] < 0
                    under_cap = (spec_cnt < cap_max) if bool(self._is_specialty[di]) else torch.ones(B, dtype=torch.bool, device=dev)
                    # The PLACEMENT SCAN runs HERE, not lazily at apply time:
                    # without it the mask is optimistic, calling a district legal
                    # on the gate tests alone while the picker also demands a tile
                    # that can take it (and otherwise falls through to a BUILDING).
                    # The predicate is shared with _place_district_civ so the two
                    # cannot drift.
                    can_place = self._district_elig_civ(r, j, di, plc)[0].any(dim=1)
                    ok_d[:, si] = has_tech & not_owned & under_cap & can_place
            row = torch.cat([ok_b, ok_s, torch.ones(B, 1, dtype=torch.bool, device=dev), ok_u, ok_d], dim=1)
            # The purchase block (building / settler / unit at goldPurchaseMult x
            # cost from the CIV's shared treasury) is NOT idle-gated, matching
            # seat 0's purchase columns. The settler column is priced off the
            # civ's own curve; its apply founds immediately (civ seats have no
            # settler bank) and refunds when no valid site exists.
            # The driver's ladder names no purchase class, so computing the
            # affordability + re-validation columns costs it nothing but time:
            # `lite=True` zeroes them, the net/pref surfaces keep the full mask.
            if lite:
                pb = torch.zeros(B, NBn, dtype=torch.bool, device=dev)
                ps = torch.zeros(B, 1, dtype=torch.bool, device=dev)
                pu = torch.zeros(B, self.NU, dtype=torch.bool, device=dev)
            else:
                mult = self.rules.gold_purchase_mult
                afford_b = self._afford(self.civ_only_treasury[:, r].unsqueeze(1), (rdv.b_cost.double() * mult).unsqueeze(0))
                pb = ok_b & afford_b & self.controlled[:, r].unsqueeze(1)
                s_cost_r = rr.get("settlerBase", 48) + rr.get("settlerPer", 18) * (n_cities.double() - 1).clamp(min=0)
                ps = (
                    (n_cities < rr.get("maxCities", 6))
                    & self._afford(self.civ_only_treasury[:, r], s_cost_r * mult)
                    & self.controlled[:, r]
                ).unsqueeze(1) & self.civ_city_is_cap[:, r, j].unsqueeze(1)
                # ^ the capital gate is deliberate — do not "fix" it to match ok_s
                # above. The TS twin buys a settler at CIV level with no city
                # involved, so this per-city mask needs ONE canonical column to
                # carry a civ-level verb. Ungating it would let a net buy one
                # settler PER CITY for a single civ-level action.
                u_cost_r = self._type_cost.double().unsqueeze(0).expand(B, -1)
                if self._builder_idx >= 0:
                    # the builder column prices off THIS civ's escalator
                    rb_n = self.civ_only_builders_trained[:, r]  # ALREADY PRODUCED only — a queued item has produced nothing
                    u_cost_r = u_cost_r.clone()
                    u_cost_r[:, self._builder_idx] = self._builder_cost(rb_n).double()
                afford_u = self._afford(self.civ_only_treasury[:, r].unsqueeze(1), u_cost_r * mult)
                pu = ok_u & afford_u & self.controlled[:, r].unsqueeze(1)
            # WONDER columns [nW]: unlock + one-per-world (in-flight tiles count,
            # like wonderExists) + a live placement candidate — the scripted
            # pick's own scan bodies. No capital-only term: that is the scripted
            # chain's policy, and any city may raise an unlocked wonder.
            nW_m = self._wond_n if self.districts_on else 0
            ok_w = torch.zeros(B, max(nW_m, 0), dtype=torch.bool, device=dev)
            if nW_m > 0:
                base_okm = self._wonder_base_ok(r, j)
                for wi in range(nW_m):
                    unl_w = self._wonder_unlock_ok(r, wi)
                    if unl_w is None or not bool(unl_w.any()):
                        continue
                    okc_m = unl_w & ~(self.built_wonder == wi).any(dim=1)
                    if not bool(okc_m.any()):
                        continue
                    ok_w[:, wi] = okc_m & self._wonder_cand(r, j, wi, base_okm).any(dim=1)
            # PROJECT columns [nP]: BASE rows only (district complete on THIS
            # city). Space/victory rows keep their column for layout stability
            # but never read True — their chain (requiresTech, requiresProject,
            # the one-shot spaceProjects ledger) is a separate queue path.
            nP_m = len(self._proj_rows) if self.districts_on else 0
            ok_p = torch.zeros(B, max(nP_m, 0), dtype=torch.bool, device=dev)
            for pi_m, prow_m in enumerate(self._proj_rows if self.districts_on else []):
                if int(prow_m.get("sp", 0)) or int(prow_m.get("vic", 0)):
                    continue
                d_im = int(prow_m.get("d", -1))
                if d_im < 0 or d_im >= self.civ_city_dist_tile.shape[3]:
                    continue
                regp_m = self.civ_city_dist_tile[:, r, j, d_im]
                ok_p[:, pi_m] = (regp_m >= 0) & self.district_complete.gather(1, regp_m.clamp(min=0).unsqueeze(1)).squeeze(1)
            idle_j = idle[:, j].unsqueeze(1)
            prod_cols.append(torch.cat([row & idle_j, pb, ps, pu, ok_w & idle_j, ok_p & idle_j], dim=1))
        production = torch.stack(prod_cols, dim=1)  # [B, RC, base + NB+1+NU purchase]
        tech = self._available_mask(self.civ_only_techs[:, r], self._prereq_t) & (self.civ_only_cur_tech[:, r] == -1).unsqueeze(1)
        civic = self._available_mask(self.civ_only_civics[:, r], self._prereq_c) & (self.civ_only_cur_civic[:, r] == -1).unsqueeze(1)
        # symmetric war head (seat-invariant [B, 2R] layout): a civ seat's only
        # opponent under war rules is seat 0 — column 0 = declare (alive, at
        # peace), column R = sue for peace (warTurns >= min AND the same gold
        # schedule every seat pays, charged against civ_only_treasury).
        sr = self.rules.seats
        Rw = max(self.R, 1)
        war = torch.zeros(B, 2 * Rw, dtype=torch.bool, device=dev)
        war[:, 0] = self.civ_only_alive[:, r] & ~self.civ_only_atwar[:, r]
        pcost_m = sr.get("peaceGold0", 150) + sr.get("peaceGoldSlope", 10) * self.civ_only_warturns[:, r].to(torch.float64)
        war[:, Rw] = (
            self.civ_only_alive[:, r] & self.civ_only_atwar[:, r]
            & (self.civ_only_warturns[:, r] >= sr.get("warMinTurns", 14))
            & self._afford(self.civ_only_treasury[:, r], pcost_m)
        )
        return {"production": production, "tech": tech, "civic": civic, "war": war}

    def apply_seat_actions(
        self,
        r: int,
        production: torch.Tensor | None = None,
        tech: torch.Tensor | None = None,
        civic: torch.Tensor | None = None,
        war: torch.Tensor | None = None,
        production_pref: torch.Tensor | None = None,
        envoys: torch.Tensor | None = None,
        buy: tuple | None = None,  # (kind [B], a [B], b [B]) — the wire's GOLD purchase intent (kind 3: a=tile, b=slot)
        worship: torch.Tensor | None = None,  # kind 4: rc slot to faith-buy the worship building in (-1 = none)
        relig: tuple | None = None,  # kinds 5/6: (kind [B], slot [B]) — the religious-unit faith buy
        levy: torch.Tensor | None = None,  # kind 7: CS index to levy (-1 = none)
    ) -> None:
        """Write a civ seat's choices BEFORE step(). Codes use the seat_masks
        layout; -1 = no action. Queue writes mirror the picker's exact
        cost/progress semantics (districts run the same placement scan).

        `production` [B, RC] is a single code per city. `production_pref`
        [B, RC, W] is a PREFERENCE ORDER: a score per column, illegal columns at
        -inf. Apply walks it best-first and takes the first column that lands.

        WHY A PREFERENCE ORDER. A district can be legal when the mask is taken
        and unplaceable by the time it is applied — two cities can be offered
        the last eligible tile. With one code per city the loser simply IDLES,
        while the scripted picker falls through and builds something. The engine
        must not pick the replacement itself: that would transcribe the policy
        ladder into the engine and credit the policy for a decision it never
        made. With a preference order the CHOICE stays wholly in the policy and
        this function only validates. Near-free for a net, whose logits over the
        columns already ARE a preference order."""
        if tech is not None:
            ok = (tech >= 0) & self.controlled[:, r] & (self.civ_only_cur_tech[:, r] == -1)
            self.civ_only_cur_tech[:, r] = torch.where(ok, tech.clamp(min=0), self.civ_only_cur_tech[:, r])
        if civic is not None:
            ok = (civic >= 0) & self.controlled[:, r] & (self.civ_only_cur_civic[:, r] == -1)
            self.civ_only_cur_civic[:, r] = torch.where(ok, civic.clamp(min=0), self.civ_only_cur_civic[:, r])
        if war is not None:
            Rw = max(self.R, 1)
            w = war.to(torch.long)
            declare = (w == 0) & self.controlled[:, r] & self.civ_only_alive[:, r] & ~self.civ_only_atwar[:, r]
            if bool(declare.any()):
                self.civ_only_atwar[:, r] = self.civ_only_atwar[:, r] | declare
                self.war[:, 1 + r, 0] |= declare  # the store IS war[0, 1+r]; this writes the MIRROR cell
                self.civ_only_warturns[:, r] = torch.where(declare, torch.zeros_like(self.civ_only_warturns[:, r]), self.civ_only_warturns[:, r])
            # peace costs the civ seat the same schedule every seat pays, out of
            # civ_only_treasury (the mask prices it; the apply re-validates it).
            sr = self.rules.seats
            pcost_c = sr.get("peaceGold0", 150) + sr.get("peaceGoldSlope", 10) * self.civ_only_warturns[:, r].to(torch.float64)
            peace = (
                (w == Rw) & self.controlled[:, r] & self.civ_only_atwar[:, r]
                & (self.civ_only_warturns[:, r] >= sr.get("warMinTurns", 14))
                & self._afford(self.civ_only_treasury[:, r], pcost_c)
            )
            if bool(peace.any()):
                self.civ_only_treasury[:, r] = torch.where(peace, self.civ_only_treasury[:, r] - pcost_c, self.civ_only_treasury[:, r])
                self.civ_only_atwar[:, r] = self.civ_only_atwar[:, r] & ~peace
                self._ww_peace(peace, 0, r + 1)  # -2000 on the treaty (the makePeace twin)
                self._citystate_suzerain_release(r, peace)
                self.war[:, 1 + r, 0] &= ~peace  # the store IS war[0, 1+r]; this writes the MIRROR cell
                self.civ_only_warturns[:, r] = torch.where(peace, torch.zeros_like(self.civ_only_warturns[:, r]), self.civ_only_warturns[:, r])
                self.civ_only_peaceturns[:, r] = torch.where(peace, torch.zeros_like(self.civ_only_peaceturns[:, r]), self.civ_only_peaceturns[:, r])
        # ENVOY verb: STASHED here, consumed at _seat_cs_phase's own position,
        # right after the accrual. The totals commute with the accrual, but
        # SUZERAINTY is a THRESHOLD that seat 0's favor accrual reads, so
        # applying pre-step would flip suzerainty a turn earlier than TS's
        # in-block apply. Positions must match, like the unit stash.
        if envoys is not None and self.S > 0:
            if not hasattr(self, "_driven_envoys") or self._driven_envoys is None:
                self._driven_envoys = {}
            self._driven_envoys[r] = envoys
        # PRODUCTION stashes like the envoys — consumed at _seat_phase's own pick
        # position via _consume_driven_picks. Draw-free is not ORDER-free: a
        # pre-step apply would queue (and district-PAVE) for a city another seat
        # captures later that same turn, while TS's seatPhase apply runs after
        # those units act and finds no city at that centre. civ_city_alive gates inside
        # the appliers make the consume-time refusal exact.
        if production_pref is not None or production is not None:
            if not hasattr(self, "_driven_picks") or self._driven_picks is None:
                self._driven_picks = {}
            self._driven_picks[r] = (production, production_pref)
        # the BUY intent stashes like production — consumed at the gold block's
        # own position (_consume_driven_buy).
        if buy is not None:
            if not hasattr(self, "_driven_buy") or self._driven_buy is None:
                self._driven_buy = {}
            self._driven_buy[r] = buy
        # the FAITH intents and the LEVY stash like the buy — each is
        # consumed at its own scripted sub-position in _seat_phase (worship →
        # missionary/apostle → ... → levy), re-validated there.
        if worship is not None:
            if not hasattr(self, "_driven_buy_worship") or self._driven_buy_worship is None:
                self._driven_buy_worship = {}
            self._driven_buy_worship[r] = worship
        if relig is not None:
            if not hasattr(self, "_driven_buy_relig") or self._driven_buy_relig is None:
                self._driven_buy_relig = {}
            self._driven_buy_relig[r] = relig
        if levy is not None:
            if not hasattr(self, "_driven_levy") or self._driven_levy is None:
                self._driven_levy = {}
            self._driven_levy[r] = levy

    def _seat_buy_candidates(self, r: int, active: torch.Tensor):
        """The gold-purchase BUILDING candidate — ONE legality body shared by the
        scripted gold block and the wire driver's _buy_ctx.

        Returns (jj, bb, can, price, elig): the cheapest completable building
        anywhere in the civ (argmin of (cost*1024 + bIdx)*32 + citySlot) and
        whether the treasury clears price + the peace-gold RESERVE. The
        affordability test is milli-quantised via js_round to match TS exactly."""
        B, dev = self.B, self.device
        rr = self.rules.seats
        rdv6 = self.rules_dev
        NB6 = rdv6.b_cost.shape[0]
        ones6 = torch.ones(B, NB6, dtype=torch.bool, device=dev)
        unl6 = torch.where(
            rdv6.b_unlock.unsqueeze(0) >= 0,
            self.civ_only_techs[:, r].gather(1, rdv6.b_unlock.clamp(min=0).unsqueeze(0).expand(B, -1)),
            ones6,
        ) & torch.where(
            rdv6.b_unlock_civic.unsqueeze(0) >= 0,
            self.civ_only_civics[:, r].gather(1, rdv6.b_unlock_civic.clamp(min=0).unsqueeze(0).expand(B, -1)),
            ones6,
        )
        elig6 = torch.zeros(B, self.RC, NB6, dtype=torch.bool, device=dev)
        for j6 in self.civ_city_alive[:, r].any(dim=0).nonzero(as_tuple=True)[0].tolist():  # only slots alive in some row
            al6 = active & self.civ_city_alive[:, r, j6]
            if not bool(al6.any()):
                continue
            have6 = self.civ_city_bldg[:, r, j6]
            ctile6 = self.civ_city_center[:, r, j6].clamp(min=0)
            riv6 = self.tile_river.gather(1, ctile6.unsqueeze(1)).squeeze(1)
            ok6 = unl6 & ~have6 & (~rdv6.b_river.reshape(1, -1) | riv6.unsqueeze(1)) & ~self._b_worship.reshape(1, -1)  # worship buildings are faith-only
            reg6 = self.civ_city_dist_tile[:, r, j6].gather(1, rdv6.b_req_district.clamp(min=0).unsqueeze(0).expand(B, -1))
            dc6 = (reg6 >= 0) & self.district_complete.gather(1, reg6.clamp(min=0))
            ok6 = ok6 & torch.where(rdv6.b_req_district.unsqueeze(0) >= 0, dc6, ones6)
            for bi6, reqs6 in enumerate(self.rules.b_req_buildings):
                if reqs6:
                    ok6[:, bi6] &= have6[:, torch.tensor(reqs6, device=dev, dtype=torch.long)].any(dim=1)
            for bi6, excl6 in enumerate(self.rules.b_excl_buildings):  # exclusiveWith
                if excl6:
                    ok6[:, bi6] &= ~have6[:, torch.tensor(excl6, device=dev, dtype=torch.long)].any(dim=1)
            qb6 = self.civ_city_current[:, r, j6] - (1 + self.NU + len(self._scaffold))
            is_qb = (qb6 >= 0) & (qb6 < NB6)
            if bool(is_qb.any()):
                rows_q = is_qb.nonzero(as_tuple=True)[0]
                ok6[rows_q, qb6[rows_q]] = False
            elig6[:, j6] = ok6 & al6.unsqueeze(1)
        key6 = (rdv6.b_cost.reshape(1, 1, -1) * 1024 + torch.arange(NB6, device=dev, dtype=rdv6.b_cost.dtype).reshape(1, 1, -1)) * 32 \
            + torch.arange(self.RC, device=dev, dtype=rdv6.b_cost.dtype).reshape(1, -1, 1)
        key6 = torch.where(elig6, key6.expand(B, -1, -1), torch.tensor(float("inf"), dtype=rdv6.b_cost.dtype, device=dev))
        flat6 = key6.reshape(B, -1)
        best6 = flat6.argmin(dim=1)
        has6 = active & torch.isfinite(flat6.gather(1, best6.unsqueeze(1)).squeeze(1))
        jj6 = torch.div(best6, NB6, rounding_mode="floor")
        bb6 = best6 % NB6
        price6 = rdv6.b_cost.gather(0, bb6).double() * self.rules.gold_purchase_mult
        reserve6 = float(rr.get("peaceGold0", 150))
        can6 = has6 & (js_round(self.civ_only_treasury[:, r] * 1000) >= js_round((price6 + reserve6) * 1000))
        return jj6, bb6, can6, price6, elig6

    def _seat_trainable_units(self, r: int) -> torch.Tensor:
        """[B, NU] the units civ r may train or gold-buy: tech-unlocked
        (via _type_tech; -1 = ungated) AND strategic-resource access in ITS
        territory — the ONE formula behind the phase's tr_u_r and the
        wire driver's _buy_ctx."""
        B = self.B
        res_ok = self._res_avail_mask(self.civ_at == r)
        return (
            (self._type_tech.unsqueeze(0) < 0)
            | self.civ_only_techs[:, r].gather(1, self._type_tech.clamp(min=0).unsqueeze(0).expand(B, -1))
        ) & res_ok

    def _seat_buy_unit_candidates(self, r: int, tr_u: torch.Tensor) -> torch.Tensor:
        """Buy-kind 2 [B, NU]: the gold UNIT-purchase candidate set — ONE legality
        body for the scripted gold rung and the wire's _buy_ctx. Non-naval
        military among tr_u (SCOUT masked out: affordability can otherwise leave
        it the only candidate; BUILDER is combat 0), affordable at cost x mult,
        with NO war-chest reserve. The military-quota gate stays at the call
        sites — its COUNT is positional, tracking mid-phase spawns and queues."""
        mil = tr_u & (self._type_combat.unsqueeze(0) > 0) & ~self.unit_naval.unsqueeze(0)
        if self._scout_idx >= 0:
            mil[:, self._scout_idx] = False
        afford = self._afford(self.civ_only_treasury[:, r].unsqueeze(1), self._type_cost.double().unsqueeze(0) * self.rules.gold_purchase_mult)
        return mil & afford

    def _seat_tile_unclaimed(self, tc: torch.Tensor) -> torch.Tensor:
        """[B, K] — the tileClaimed twin over the split ownership planes: a tile
        is claimable only when NO plane family owns it (seat 0's `owner`,
        `citystate_at`, `civ_at`). tc must be clamped in-range."""
        return (self.owner.gather(1, tc) < 0) & (self.citystate_at.gather(1, tc) < 0) & (self.civ_at.gather(1, tc) < 0)

    def _seat_tile_adj_city(self, r: int, cid: torch.Tensor, tc: torch.Tensor,
                            nbs: torch.Tensor | None = None) -> torch.Tensor:
        """[B, K] — the borderCandidates adjacency twin: any of the 6
        neighbours is a tile of THIS city (seat- AND id-matched via the
        tile_city registry — the n.cityId === city.id check). `cid` is the
        per-row civ_city_id of the city; `nbs` may be passed to reuse a scan's
        neighbour tensor."""
        if nbs is None:
            nbs = self.neigh[tc.reshape(-1)].reshape(self.B, -1, 6)
        nbf = nbs.clamp(min=0).reshape(self.B, -1)
        return (
            (self.civ_at.gather(1, nbf).reshape(self.B, -1, 6) == r)
            & (self.tile_city.gather(1, nbf).reshape(self.B, -1, 6) == cid.reshape(self.B, 1, 1))
            & (nbs >= 0)
        ).any(dim=2)

    def _seat_tile_price(self, r: int, ctr: torch.Tensor, tgt: torch.Tensor) -> torch.Tensor:
        """[B] f64 — the tilePurchaseCost twin: ring-based base (50 ring ≤2,
        +25/ring), speed-scaled, ×(1 + 4·max(tech%, civic%)), + 5·speed per
        tile EVER purchased empire-wide, × this seat's own tilePurchaseMult
        (LAND_SURVEYORS is a policy card every seat can slot)."""
        ring = self.pair_dist[ctr, tgt].clamp(min=2)
        tpct = self.civ_only_techs[:, r].sum(dim=1).double() / max(1, self.civ_only_techs.shape[2])
        cpct = self.civ_only_civics[:, r].sum(dim=1).double() / max(1, self.civ_only_civics.shape[2])
        base = js_round(torch.full_like(tpct, 1.0) * (50.0 + 25.0 * (ring - 2).double()) * self.rules.game_speed)
        step = js_round(torch.full_like(tpct, 5.0 * self.rules.game_speed))
        tpm = self._gov_policy_mods_cached(r, self.civ_only_civics[:, r])[6].double()
        return js_round((base * (1.0 + 4.0 * torch.maximum(tpct, cpct)) + step * self.civ_only_tiles_purchased[:, r].double()) * tpm)

    def _seat_tile_buy_candidate(self, r: int, active: torch.Tensor):
        """Buy-kind 3: the TILE-BUY candidate — ONE legality body for the wire
        driver's _buy_ctx and the TS driver's tripwire twin. Walks rc slots in
        order; the FIRST slot with a border candidate names the pick (best
        _seat_border_key, the same key the culture claim uses), and an
        UNAFFORDABLE pick ABORTS the civ's tile buy outright rather than trying
        the next city — TS breaks out of the walk.
        Returns (slot [B], tile [B], cost [B] f64, ok [B])."""
        B, dev = self.B, self.device
        slot = torch.full((B,), -1, dtype=torch.long, device=dev)
        tile = torch.full((B,), -1, dtype=torch.long, device=dev)
        cost = torch.zeros(B, dtype=torch.float64, device=dev)
        ok = torch.zeros(B, dtype=torch.bool, device=dev)
        left = active.clone()
        for j in range(self.RC):
            if not bool(left.any()):
                break
            live = left & self.civ_city_alive[:, r, j]
            if not bool(live.any()):
                continue
            ctr = self.civ_city_center[:, r, j]
            tiles, tc, nbs, key0 = self._seat_border_key(r, j, ctr)
            okt = (
                (tiles >= 0)
                & self._seat_tile_unclaimed(tc)
                & self._seat_tile_adj_city(r, self.civ_city_id[:, r, j], tc, nbs)
                & live.unsqueeze(1)
            )
            has = okt.any(dim=1)
            if not bool(has.any()):
                continue
            best = torch.where(okt, key0, self._inf_f).argmin(dim=1)
            tgt = tiles.gather(1, best.unsqueeze(1)).squeeze(1)
            c = self._seat_tile_price(r, ctr.clamp(min=0), tgt.clamp(min=0))
            buy = has & self._afford(self.civ_only_treasury[:, r], c)
            slot = torch.where(buy, torch.full_like(slot, j), slot)
            tile = torch.where(buy, tgt, tile)
            cost = torch.where(buy, c, cost)
            ok = ok | buy
            left = left & ~has  # first slot WITH a candidate ends the walk (buy or abort)
        return slot, tile, cost, ok

    def _seat_faith_buy_candidates(self, r: int, active: torch.Tensor):
        """Buy-kinds 4-6: the FAITH-purchase candidates — worship building,
        missionary, apostle — each (ok [B], slot [B]) with the scripted
        ladder's own gates. Worship: founded religion, afford the flat cost,
        FIRST alive city in slot order with TEMPLE + a complete unpillaged
        Holy Site and no worship building yet. Missionary/apostle: founded,
        live count under the unit's own cap, afford (enhancer-adjusted /
        flat), FIRST alive city with the SHRINE + complete unpillaged Holy
        Site. Missionary-before-apostle (one religious unit per turn) is the
        LADDER's pick, not encoded here."""
        B, dev = self.B, self.device
        neg = torch.full((B,), -1, dtype=torch.long, device=dev)
        no = torch.zeros(B, dtype=torch.bool, device=dev)
        w_ok, w_j = no.clone(), neg.clone()
        m_ok, m_j = no.clone(), neg.clone()
        a_ok, a_j = no.clone(), neg.clone()
        if self._hs_idx < 0 or not bool(self.civ_only_religion_done[:, r].any()):
            return w_ok, w_j, m_ok, m_j, a_ok, a_j
        hs_t = self.civ_city_dist_tile[:, r, :, self._hs_idx]  # [B, RC]
        hs_c = (hs_t >= 0) & self.district_complete.gather(1, hs_t.clamp(min=0)) & ~self.district_pillaged.gather(1, hs_t.clamp(min=0))
        founded = active & self.civ_only_religion_done[:, r]
        if self._worship_bidx and self._temple_bidx >= 0:
            wb = self._worship_bidx[(r + 1) % len(self._worship_bidx)]
            if wb >= 0:
                elig_w = self.civ_city_alive[:, r] & ~self.civ_city_bldg[:, r, :, wb] & self.civ_city_bldg[:, r, :, self._temple_bidx] & hs_c
                w_ok = founded & self._afford(self.civ_only_faith[:, r], self._worship_cost) & elig_w.any(dim=1)
                w_j = torch.where(w_ok, elig_w.long().argmax(dim=1), w_j)
        if self._shrine_bidx >= 0:
            elig_s = self.civ_city_alive[:, r] & self.civ_city_bldg[:, r, :, self._shrine_bidx] & hs_c
            first_s = elig_s.long().argmax(dim=1)
            if self._missionary_idx >= 0:
                n_m = (self.civ_unit_alive & (self.civ_unit_civ == r) & (self.civ_unit_type == self._missionary_idx)).sum(dim=1)
                mcost = self._enh["mcost"][self.civ_only_enhancer[:, r] + 1]
                m_ok = founded & (n_m < self._missionary_cap) & self._afford(self.civ_only_faith[:, r], mcost) & elig_s.any(dim=1)
                m_j = torch.where(m_ok, first_s, m_j)
            if self._apostle_idx >= 0:
                n_a = (self.civ_unit_alive & (self.civ_unit_civ == r) & (self.civ_unit_type == self._apostle_idx)).sum(dim=1)
                acost = torch.full((B,), float(round(self._apostle_cost)), dtype=torch.float64, device=dev)
                a_ok = founded & (n_a < self._apostle_cap) & self._afford(self.civ_only_faith[:, r], acost) & elig_s.any(dim=1)
                a_j = torch.where(a_ok, first_s, a_j)
        return w_ok, w_j, m_ok, m_j, a_ok, a_j

    def _seat_levy_candidate(self, r: int, active: torch.Tensor):
        """Buy-kind 7: the LEVY candidate — the RULE half only (militaristic
        CS, this seat suzerain, cooldown ready, afford) over the FIRST
        eligible CS in slot order. At-war is the DRIVER's policy gate, not a
        rule (TS levyUnits has no war test), so it joins in _buy_ctx.
        Returns (ok [B], cs [B])."""
        B, dev = self.B, self.device
        ok = torch.zeros(B, dtype=torch.bool, device=dev)
        cs = torch.full((B,), -1, dtype=torch.long, device=dev)
        if self.S <= 0:
            return ok, cs
        Sl = self.S
        mil_idx = int(self.rules.citystate.get("militaristicIdx", -1))
        levy_cost = float(self.rules.citystate.get("levyGoldCost", 120))
        suz_min = int(self.rules.citystate.get("suzerainEnvoys", 3))
        mine = self.civ_only_citystate_envoys[:, r, :Sl]
        oth = self.civ_only_citystate_envoys[:, :, :Sl].clone()
        oth[:, r] = -1
        suz = (
            (mine >= suz_min)
            & (mine > self.citystate_envoys[:, :Sl])
            & (mine > oth.max(dim=1).values)
            & self.citystate_alive[:, :Sl]
        )
        ready = (self.turn - self.citystate_last_levy[:, :Sl]) >= self._levy_cooldown
        elig = active.unsqueeze(1) & (self.citystate_type[:, :Sl] == mil_idx) & suz & ready \
            & self._afford(self.civ_only_treasury[:, r], levy_cost).unsqueeze(1)
        ok = elig.any(dim=1)
        cs = torch.where(ok, elig.long().argmax(dim=1), cs)
        return ok, cs

    def _consume_driven_buy(self, r: int, active: torch.Tensor) -> torch.Tensor:
        """Execute the wire's BUY intent at the gold block's own phase position —
        draw-free is not order-free. Re-validates the RECORDED (j, b) against the
        LIVE eligibility scan + affordability, exactly as TS's arm does; a stale
        intent refuses silently on both engines. Returns the rows that bought
        (they consume the one-purchase-per-turn slot)."""
        dbuy = getattr(self, "_driven_buy", None)
        B, dev = self.B, self.device
        bought = torch.zeros(B, dtype=torch.bool, device=dev)
        if not dbuy or r not in dbuy:
            return bought
        kind, jjw, bbw = dbuy.pop(r)
        # kind 1 (SETTLER) executes at the settler SUB-POSITION (after
        # bank-first, the TS order) — forward it there.
        if bool((kind == 1).any()):
            if not hasattr(self, "_driven_buy_settler") or self._driven_buy_settler is None:
                self._driven_buy_settler = {}
            self._driven_buy_settler[r] = kind == 1
        # kind 2 (UNIT) executes at the unit SUB-POSITION (after building and
        # settler, the TS rung order) — forward it there.
        if bool((kind == 2).any()):
            if not hasattr(self, "_driven_buy_unit") or self._driven_buy_unit is None:
                self._driven_buy_unit = {}
            self._driven_buy_unit[r] = kind == 2
        # kind 3 (TILE) executes at the tile SUB-POSITION (the gold ladder's last
        # rung) — forward (rows, tile, slot) there. For kind 3 the wire's a/b are
        # (tileIndex, rc slot).
        if bool((kind == 3).any()):
            if not hasattr(self, "_driven_buy_tile") or self._driven_buy_tile is None:
                self._driven_buy_tile = {}
            self._driven_buy_tile[r] = (kind == 3, jjw, bbw)
        want = active & self.controlled[:, r] & (kind == 0) & (jjw >= 0) & (bbw >= 0)
        if not bool(want.any()):
            return bought
        _, _, _, _, elig = self._seat_buy_candidates(r, active)
        jc = jjw.clamp(min=0, max=self.RC - 1)
        bc = bbw.clamp(min=0, max=self.rules_dev.b_cost.shape[0] - 1)
        ok = want & elig[torch.arange(B, device=dev), jc, bc]
        price = self.rules_dev.b_cost.gather(0, bc).double() * self.rules.gold_purchase_mult
        reserve = float(self.rules.seats.get("peaceGold0", 150))
        ok = ok & (js_round(self.civ_only_treasury[:, r] * 1000) >= js_round((price + reserve) * 1000))
        if bool(ok.any()):
            self._seat_buy_building(r, ok, jc, bc, price)
            bought = ok
        return bought

    def _seat_buy_building(self, r: int, can6: torch.Tensor, jj6: torch.Tensor, bb6: torch.Tensor, price6: torch.Tensor) -> None:
        """The building-purchase EXECUTOR — shared by the scripted gold block and
        the driven buy arm. The candidates (or the wire's re-validation) decide
        WHO buys; this only writes."""
        rows6 = can6.nonzero(as_tuple=True)[0]
        self.civ_city_bldg[rows6, r, jj6[rows6], bb6[rows6]] = True
        self._eff_version += 1  # a bought regional building reaches other cities this phase
        if self._walls_bidx >= 0:
            wm6 = rows6[bb6[rows6] == self._walls_bidx]
            if len(wm6) > 0:
                self.civ_city_outer_hp[wm6, r, jj6[wm6]] = self._walls_hp
        self.civ_only_treasury[:, r] = torch.where(can6, self.civ_only_treasury[:, r] - price6, self.civ_only_treasury[:, r])

    def _consume_driven_picks(self, r: int) -> None:
        """The production half of the stash-and-consume convention:
        apply_seat_actions stores the driven pick and THIS position — the
        scripted picker's slot at the top of _seat_phase's r-iteration —
        executes it, so recorder, GPU replay and TS replay share one within-turn
        ordering."""
        dp = getattr(self, "_driven_picks", None)
        if not dp or r not in dp:
            return
        production, pref = dp.pop(r)
        if pref is not None:
            self._apply_seat_pref(r, pref)
        elif production is not None:
            self._apply_seat_production(r, production)

    def _apply_seat_pref(self, r: int, pref: torch.Tensor, max_tries: int = 8) -> None:
        """Apply a PREFERENCE ORDER [B, RC, W] — best legal column wins.

        Walks the ranking best-first, re-running the ordinary apply for whatever
        is still idle. The pass is idempotent (its `act` gate needs
        `civ_city_current == -1`), so a city that landed on an earlier rank is simply
        skipped by later ones — no bookkeeping, no partial rollback.

        The ENGINE NEVER CHOOSES. Every column it tries came from the policy's
        own ranking; all this does is discover which of them the live state
        actually accepts. That is the whole difference between this and letting
        apply fall through to "the next class", which would put the ladder's
        priority chain back inside the engine.

        `-inf` marks a column the policy rules out; the walk stops offering a
        city anything once its ranks run dry. PURCHASES are attempted on the
        first pass only — they deliberately bypass the idle gate, so re-offering
        them each rank would buy once per rank. Blanking them to -1 disables the
        branch, which keys on `>= base_w`.

        `max_tries` bounds the walk. Districts are the only realistic failure, so
        it terminates on rank 0 or 1 in practice; the cap exists so a pathological
        ranking cannot spin.
        """
        if pref.dim() != 3:
            raise AssertionError(f"production_pref must be [B, RC, W], got {tuple(pref.shape)}")
        RCj = min(int(pref.shape[1]), self.RC)
        base_w = self.rules_dev.b_cost.shape[0] + 2 + self.NU + len(self._scaffold)
        order = pref.argsort(dim=2, descending=True)  # [B, RC, W]
        scores = pref.gather(2, order)
        live = torch.isfinite(scores)
        for k in range(min(max_tries, int(pref.shape[2]))):
            idle = (self.civ_city_current[:, r, :RCj] == -1) & self.civ_city_alive[:, r, :RCj]
            if not bool(idle.any()):
                return
            code = order[:, :RCj, k].clone()
            code = torch.where(live[:, :RCj, k], code, torch.full_like(code, -1))
            if k > 0:
                # purchases already had their one attempt on rank 0. The bound is
                # the purchase RANGE only — wonder/project columns sit above it,
                # are idle-gated like base columns, and must stay offered on
                # later ranks (a wonder whose tile was claimed falls through to
                # the next preference).
                _pw_hi = base_w + self.rules_dev.b_cost.shape[0] + 1 + self.NU
                code = torch.where((code >= base_w) & (code < _pw_hi), torch.full_like(code, -1), code)
                code = torch.where(idle, code, torch.full_like(code, -1))
            if not bool((code >= 0).any()):
                return
            self._apply_seat_production(r, code)

    def _apply_seat_production(self, r: int, production: torch.Tensor) -> None:
        """One pass of the production apply: every still-IDLE city takes the
        code it was given. Idempotent across passes by construction — the `act`
        gate below requires `civ_city_current == -1`, so a city assigned by an earlier
        pass is untouched by a later one. The preference walk relies on that.
        Purchase columns do NOT share the idle gate, so the walk blanks them
        after its first pass rather than buying once per rank."""
        rdv = self.rules_dev
        NBn = rdv.b_cost.shape[0]
        nS = len(self._scaffold)
        rr = self.rules.seats
        for j in range(min(int(production.shape[1]), self.RC)):
            a = production[:, j].to(torch.long)
            act = (a >= 0) & self.controlled[:, r] & self.civ_city_alive[:, r, j] & (self.civ_city_current[:, r, j] == -1)
            if not bool(act.any()):
                continue
            # buildings 0..NB-1
            is_b = act & (a < NBn)
            if bool(is_b.any()):
                bi = a.clamp(min=0, max=NBn - 1)
                self.civ_city_current[:, r, j] = torch.where(is_b, 1 + self.NU + nS + bi, self.civ_city_current[:, r, j])
                self.civ_city_cost[:, r, j] = torch.where(is_b, rdv.b_cost.gather(0, bi).double(), self.civ_city_cost[:, r, j])
                self.civ_city_progress[:, r, j] = torch.where(is_b, torch.zeros_like(self.civ_city_progress[:, r, j]), self.civ_city_progress[:, r, j])
            # settler = NB
            is_s = act & (a == NBn)
            if bool(is_s.any()):
                n_cities = self.civ_city_alive[:, r].sum(dim=1)
                # the exporter ships this knob as "settlerPer" — read it under
                # that key so the cost tracks the export.
                settle_cost = js_round(rr.get("settlerBase", 48) + rr.get("settlerPer", 18) * (n_cities.double() - 1).clamp(min=0))
                self.civ_city_current[:, r, j] = torch.where(is_s, torch.zeros_like(self.civ_city_current[:, r, j]), self.civ_city_current[:, r, j])
                self.civ_city_cost[:, r, j] = torch.where(is_s, settle_cost, self.civ_city_cost[:, r, j])
                self.civ_city_progress[:, r, j] = torch.where(is_s, torch.zeros_like(self.civ_city_progress[:, r, j]), self.civ_city_progress[:, r, j])
            # WONDER/PROJECT codes sit past the purchase block. The code names
            # WHICH wonder/project; the engine re-runs the WHOLE legality —
            # one-per-world is CROSS-SEAT (any seat may have claimed it since the
            # mask was taken), so the apply refuses rather than double-building.
            w_lo = NBn + 2 + self.NU + nS + NBn + 1 + self.NU
            nW_a = self._wond_n if self.districts_on else 0
            nP_a = len(self._proj_rows) if self.districts_on else 0
            is_w = act & (a >= w_lo) & (a < w_lo + nW_a)
            if bool(is_w.any()):
                base_okA = self._wonder_base_ok(r, j)
                for wcode in sorted(set(a[is_w].tolist())):
                    wi_a = int(wcode) - w_lo
                    rows_a = is_w & (a == wcode)
                    unl_a = self._wonder_unlock_ok(r, wi_a)
                    if unl_a is None:
                        continue
                    rows_a = rows_a & unl_a & ~(self.built_wonder == wi_a).any(dim=1)
                    if not bool(rows_a.any()):
                        continue
                    cand_a = self._wonder_cand(r, j, wi_a, base_okA)
                    rows_a = rows_a & cand_a.any(dim=1)
                    if not bool(rows_a.any()):
                        continue
                    self._queue_civ_wonder_at(r, j, wi_a, rows_a, cand_a)
            p_lo = w_lo + nW_a
            is_p = act & (a >= p_lo) & (a < p_lo + nP_a)
            if bool(is_p.any()):
                pc_a = self._seat_proj_cost(r)
                for pcode in sorted(set(a[is_p].tolist())):
                    pi_a = int(pcode) - p_lo
                    prow_a = self._proj_rows[pi_a]
                    if int(prow_a.get("sp", 0)) or int(prow_a.get("vic", 0)):
                        continue  # base rows only — the mask never offers these
                    d_ia = int(prow_a.get("d", -1))
                    if d_ia < 0 or d_ia >= self.civ_city_dist_tile.shape[3]:
                        continue
                    regp_a = self.civ_city_dist_tile[:, r, j, d_ia]
                    has_pa = (regp_a >= 0) & self.district_complete.gather(1, regp_a.clamp(min=0).unsqueeze(1)).squeeze(1)
                    rows_p = is_p & (a == pcode) & has_pa
                    if not bool(rows_p.any()):
                        continue
                    code_pr = 1 + self.NU + nS + NBn + pi_a
                    self.civ_city_current[:, r, j] = torch.where(rows_p, torch.full_like(self.civ_city_current[:, r, j], code_pr), self.civ_city_current[:, r, j])
                    self.civ_city_cost[:, r, j] = torch.where(rows_p, pc_a, self.civ_city_cost[:, r, j])
                    self.civ_city_progress[:, r, j] = torch.where(rows_p, torch.zeros_like(self.civ_city_progress[:, r, j]), self.civ_city_progress[:, r, j])
            # purchase codes live past the base width — buildings
            # base..base+NB-1, then the settler column, then units. Purchases
            # bypass the idle gate and revalidate LIVE: the treasury may have
            # drained on an earlier slot in this same walk.
            base_w = NBn + 2 + self.NU + nS
            pa = production[:, j].to(torch.long)
            mult = self.rules.gold_purchase_mult
            can_p = (pa >= base_w) & (pa < w_lo) & self.controlled[:, r] & self.civ_city_alive[:, r, j]  # wonder/project codes sit past the purchases
            if bool(can_p.any()):
                pb_i = pa - base_w
                is_pb = can_p & (pb_i >= 0) & (pb_i < NBn)
                if bool(is_pb.any()):
                    bi = pb_i.clamp(min=0, max=NBn - 1)
                    cost_b = rdv.b_cost.gather(0, bi).double() * mult
                    ok_now = is_pb & ~self.civ_city_bldg[torch.arange(self.B, device=self.device), r, j].gather(1, bi.unsqueeze(1)).squeeze(1) & self._afford(self.civ_only_treasury[:, r], cost_b)
                    # full re-validation — the completed-district prerequisite
                    # and the required buildings, i.e. purchaseBuilding's own
                    # buildingCompletable gates.
                    reqd_i = rdv.b_req_district.gather(0, bi)
                    reg_i = self.civ_city_dist_tile[:, r, j].gather(1, reqd_i.clamp(min=0).unsqueeze(1)).squeeze(1)
                    d_ok = (reqd_i < 0) | ((reg_i >= 0) & self.district_complete.gather(1, reg_i.clamp(min=0).unsqueeze(1)).squeeze(1))
                    rb_ok = torch.ones_like(d_ok)
                    for bi2, reqs in enumerate(self.rules.b_req_buildings):
                        if reqs:
                            m2 = bi == bi2
                            if bool(m2.any()):
                                have2 = self.civ_city_bldg[:, r, j][:, torch.tensor(reqs, device=self.device, dtype=torch.long)].any(dim=1)
                                rb_ok = rb_ok & (~m2 | have2)
                    for bi2, excl in enumerate(self.rules.b_excl_buildings):  # exclusiveWith
                        if excl:
                            m2 = bi == bi2
                            if bool(m2.any()):
                                havex = self.civ_city_bldg[:, r, j][:, torch.tensor(excl, device=self.device, dtype=torch.long)].any(dim=1)
                                rb_ok = rb_ok & (~m2 | ~havex)
                    ok_now = ok_now & d_ok & rb_ok & ~self._b_worship.gather(0, bi)  # worship is faith-only
                    if bool(ok_now.any()):
                        rows_ = ok_now.nonzero(as_tuple=True)[0]
                        self.civ_city_bldg[rows_, r, j, bi[rows_]] = True
                        self._eff_version += 1  # a bought regional building reaches other cities this phase
                        if self._walls_bidx >= 0:
                            wm = rows_[bi[rows_] == self._walls_bidx]
                            if len(wm) > 0:
                                self.civ_city_outer_hp[wm, r, j] = self._walls_hp
                        self.civ_only_treasury[:, r] = torch.where(ok_now, self.civ_only_treasury[:, r] - cost_b, self.civ_only_treasury[:, r])
                # buy a SETTLER — a UNIT purchase. It spawns at city j, which
                # pays the pop; no free spot = refund (the spawnUnit-refund
                # convention). Founding is a later FOUND_CITY order.
                is_ps2 = can_p & (pb_i == NBn)
                if bool(is_ps2.any()) and self._settler_idx >= 0:
                    sr2 = self.rules.seats
                    n_cities2 = self.civ_city_alive[:, r].sum(dim=1)
                    _sq2 = (self.civ_city_alive[:, r] & (self.civ_city_current[:, r] == 0)).sum(dim=1)
                    s_cost2 = (sr2.get("settlerBase", 48) + sr2.get("settlerPer", 18)
                               * (n_cities2.double() - 1 + self._civ_only_settlers_of(r) + _sq2).clamp(min=0)) * mult
                    ok_ps = is_ps2 & (self.civ_city_pop[:, r, j] >= 2) & self._afford(self.civ_only_treasury[:, r], s_cost2)
                    if bool(ok_ps.any()):
                        landed_ps = self._spawn_seat_civilian(ok_ps, self.civ_city_center[:, r, j], r, type_idx=self._settler_idx)
                        self.civ_only_treasury[:, r] = torch.where(landed_ps, self.civ_only_treasury[:, r] - s_cost2, self.civ_only_treasury[:, r])
                        self.civ_city_pop[:, r, j] = torch.where(landed_ps, (self.civ_city_pop[:, r, j] - 1).clamp(min=1), self.civ_city_pop[:, r, j])
                pu_i = pb_i - (NBn + 1)
                is_pu = can_p & (pu_i >= 0) & (pu_i < self.NU)
                if bool(is_pu.any()):
                    ui = pu_i.clamp(min=0, max=self.NU - 1)
                    cost_u = self._type_cost.gather(0, ui).double() * mult
                    if self._builder_idx >= 0:
                        # bought civ builders price off THEIR escalator
                        rb_n = self.civ_only_builders_trained[:, r]  # ALREADY PRODUCED only — a queued item has produced nothing
                        cost_u = torch.where(ui == self._builder_idx, self._builder_cost(rb_n).double() * mult, cost_u)
                    ok_now = is_pu & self._afford(self.civ_only_treasury[:, r], cost_u)
                    if bool(ok_now.any()):
                        is_bldr = ok_now & (self._type_charges[ui] > 0)
                        is_mil = ok_now & ~is_bldr
                        ctr = self.civ_city_center[:, r, j].clamp(min=0)
                        # deduct only where the spawn LANDED — the spawnUnit-
                        # refund convention, as in the settler branch above.
                        landed = torch.zeros_like(ok_now)
                        if bool(is_mil.any()):
                            # a purchased military unit inherits city j's Encampment training XP (best tier).
                            xp_rj = (self.civ_city_bldg[:, r, j, :].long() * self._b_train_xp.reshape(1, -1)).max(dim=1).values
                            landed = landed | self._spawn_seat_unit(is_mil, ctr, ui, r, init_xp=xp_rj)
                        if bool(is_bldr.any()):
                            landed_civ = self._spawn_seat_civilian(is_bldr, ctr, r)
                            landed = landed | landed_civ
                            self.civ_only_builders_trained[:, r] = self.civ_only_builders_trained[:, r] + landed_civ.long()
                        self.civ_only_treasury[:, r] = torch.where(landed, self.civ_only_treasury[:, r] - cost_u, self.civ_only_treasury[:, r])
            # idle = NB+1 (explicit no-op); units NB+2..NB+1+NU
            is_u = act & (a >= NBn + 2) & (a < NBn + 2 + self.NU)
            if bool(is_u.any()):
                ui = (a - (NBn + 2)).clamp(min=0, max=self.NU - 1)
                cost_q = self._type_cost.gather(0, ui).double()
                if self._builder_idx >= 0:
                    # queued civ builders lock the escalated price
                    # (earlier j-slots' queues are already in civ_city_current).
                    rb_n = self.civ_only_builders_trained[:, r]  # ALREADY PRODUCED only — a queued item has produced nothing
                    cost_q = torch.where(ui == self._builder_idx, self._builder_cost(rb_n).double(), cost_q)
                self.civ_city_current[:, r, j] = torch.where(is_u, ui + 1, self.civ_city_current[:, r, j])
                self.civ_city_cost[:, r, j] = torch.where(is_u, cost_q, self.civ_city_cost[:, r, j])
                self.civ_city_progress[:, r, j] = torch.where(is_u, torch.zeros_like(self.civ_city_progress[:, r, j]), self.civ_city_progress[:, r, j])
            # scaffold districts: NB+2+NU..
            is_d = act & (a >= NBn + 2 + self.NU) & (a < NBn + 2 + self.NU + nS)
            if bool(is_d.any()) and self.districts_on and self._scaffold:
                # district cost: floor(base·(1+9·max(t%, c%))) off THIS civ's own
                # trees — the same formula every other site uses.
                dcp = self.rules.district_cost
                t_pct_r = self.civ_only_techs[:, r].sum(dim=1).double() / float(rdv.t_cost.shape[0])
                c_pct_r = self.civ_only_civics[:, r].sum(dim=1).double() / float(rdv.c_cost.shape[0])
                d_cost = torch.floor(dcp.get("base", 32) * (1 + dcp.get("scale", 9) * torch.maximum(t_pct_r, c_pct_r)))
                for si, (di, utech, uciv, plc) in enumerate(self._scaffold):
                    want_d = is_d & (a == NBn + 2 + self.NU + si)
                    if not bool(want_d.any()):
                        continue
                    # discount read BEFORE the placement registers
                    disc = self._district_discounted(r + 1, di)
                    d_cost_si = torch.where(disc, torch.floor(d_cost * 0.6), d_cost)
                    placed = self._place_district_civ(r, j, di, want_d, plc)
                    if bool(placed.any()):
                        self.civ_city_current[:, r, j] = torch.where(placed, torch.full_like(self.civ_city_current[:, r, j], 1 + self.NU + si), self.civ_city_current[:, r, j])
                        self.civ_city_cost[:, r, j] = torch.where(placed, d_cost_si, self.civ_city_cost[:, r, j])
                        self.civ_city_progress[:, r, j] = torch.where(placed, torch.zeros_like(self.civ_city_progress[:, r, j]), self.civ_city_progress[:, r, j])

    def _civ_job_mask(self, r: int) -> torch.Tensor:
        """[B, T] tiles a civ-r builder could work NOW: civ-owned and either
        BUILDABLE (unimproved, un-districted, not a center — FARM baseline with
        the hillFarms civic gate, MINE/LUMBER on the civ's unlock techs, and the
        resource roster QUARRY/PASTURE/CAMP/PLANTATION/OIL_WELL on THEIR unlock
        techs) or PILLAGED (repair jobs — the pillaged branch consults no
        validity gates, since pillage implies a live improvement implies land,
        so no water term is needed). The hasJob twin under the civ's unlocks.
        Reads LIVE research: both engines decide pre-turn, so no mid-phase
        snapshot exists to pass."""
        return self._job_mask_core(self.civ_only_techs[:, r], self.civ_only_civics[:, r], self.civ_at == r)

    def _seat_job_mask(self, seat: int) -> torch.Tensor:
        """The ONE builder-job predicate for ANY seat. Seat 0 routes its own
        planes (owner >= 0, self.techs/self.civics); seats k >= 1 route the
        r-planes. Both run the SAME _job_mask_core text, so the predicate cannot
        fork by seat."""
        if seat >= 1:
            return self._civ_job_mask(seat - 1)
        return self._job_mask_core(self.techs, self.civics, self.owner >= 0)

    def _job_mask_core(self, tk: torch.Tensor, cv: torch.Tensor, owned: torch.Tensor) -> torch.Tensor:
        farm = self.farm_flat | (self.farm_hill & cv[:, self._hillfarms_civic].unsqueeze(1)) if self._hillfarms_civic >= 0 else self.farm_flat
        ok = farm
        if self.MINE >= 0 and self._mine_unlock_tech >= 0:
            ok = ok | (self.mine_ok & tk[:, self._mine_unlock_tech].unsqueeze(1))
        if self.LUMBER >= 0 and self._lumber_unlock_tech >= 0:
            ok = ok | (self.lumber_ok & tk[:, self._lumber_unlock_tech].unsqueeze(1))
        # the SEASIDE RESORT joins the job set on RADIO.
        if self.SEASIDE >= 0 and self._seaside_unlock_tech >= 0:
            ok = ok | (self._seaside_ok() & tk[:, self._seaside_unlock_tech].unsqueeze(1))
        # grown-roster resource tiles (rq >= 3; rq 0-2 resource tiles
        # already ride the fa_f/mi planes with the right gates).
        new_res = self.res_imp >= 3
        if bool(new_res.any()):
            unlocked = tk.gather(1, self._imp_unlock[self.res_imp.clamp(min=0)].clamp(min=0))
            ok = ok | (new_res & unlocked)
        return (
            owned
            & (self.improvement < 0)
            & (self.district < 0)
            & (self.built_wonder < 0)  # an in-flight wonder pave refuses jobs (validImprovementsIn twin)
            & (self.civ_city_at < 0)
            # A seat-0 centre is a CITY_CENTER district TS-side, refused by
            # validImprovementsIn like any pave, but it lives in center_at rather
            # than `district`. A no-op for seats >= 1 (a seat-0 centre never sits
            # in civ territory; captured cities ride civ_city_at), REQUIRED for seat 0:
            # a mid-game city founded on statically-farmable ground would
            # otherwise read farm_flat=True forever.
            & (self.center_at < 0)
            & ok
        ) | (owned & self.pillaged) | (owned & self.district_pillaged)  # pillaged district = repair job

    def _seat_fort_job_mask_r(self, r: int, techs: torch.Tensor | None = None) -> torch.Tensor:
        """[B, T]: the MILITARY ENGINEER's job set. Owned, LAND, unimproved,
        un-districted, not a centre, FORT unlocked, and ADJACENT to a tile held
        by a seat this civ is AT WAR with. ONE mask serves all three consumers —
        the production arm, the engineer's build-here test and its walk target —
        and the TS twin likewise uses a single predicate; three separate ones
        would drift."""
        B = self.B
        dev = self.device
        if self.FORT < 0 or self._eng_idx < 0:
            return torch.zeros(B, self.T, dtype=torch.bool, device=dev)
        tk = techs if techs is not None else self.civ_only_techs[:, r]
        ut = int(self._imp_unlock[self.FORT])
        unl = tk[:, ut].unsqueeze(1) if ut >= 0 else torch.ones(B, 1, dtype=torch.bool, device=dev)
        owned = self.civ_at == r
        base = (
            owned
            & unl
            & self.passable
            & ~self.water
            & ~self.nwonder  # validImprovementsIn refuses natural-wonder tiles
            & (self.improvement < 0)
            & (self.district < 0)
            & (self.built_wonder < 0)
            & (self.civ_city_at < 0)
        )
        if not bool(base.any()):
            return base
        # hostile territory: seat 0's tiles while at war with seat 0, plus the
        # tiles of any civ seat this one is at war with (the civsAtWar test,
        # applied per tile owner).
        host = torch.zeros(B, self.T, dtype=torch.bool, device=dev)
        at_war_pl = self.civ_only_atwar[:, r].unsqueeze(1)
        host = host | ((self.tile_seat == 0) & at_war_pl)
        for r2 in range(self.R):
            if r2 == r:
                continue
            pair = self.civ_pair_war[:, r, r2].unsqueeze(1) if self.civ_pair_war is not None else None
            if pair is None:
                continue
            host = host | ((self.civ_at == r2) & pair)
        nb = self.neigh.clamp(min=0)
        adj = (host[:, nb] & (self.neigh >= 0).unsqueeze(0)).any(dim=2)
        return base & adj

    def _spawn_seat_civilian(self, mask: torch.Tensor, at_tile: torch.Tensor, civ: int, type_idx: int | None = None, charges: torch.Tensor | None = None) -> torch.Tensor:
        """Spawn a civ CIVILIAN (default BUILDER) — the civilian twin of
        _spawn_seat_unit, with civilian blocking and charges seeded from the
        roster. type_idx/charges override for the MISSIONARY buy (charges [B]
        carries the SCRIPTURE +1 per game).
        Returns the LANDED mask; purchases refund when no spawn spot exists."""
        if not bool(mask.any()):
            return torch.zeros_like(mask)
        cand7 = torch.cat([at_tile.unsqueeze(1), self.neigh[at_tile.clamp(min=0)]], dim=1)
        okc = cand7.clamp(min=0)
        ok7 = (cand7 >= 0) & self.passable.gather(1, okc) & ~self._blocked_for(cand7, civ + 1, is_civilian=True)
        first = torch.where(ok7, torch.arange(7, device=self.device), 7).min(dim=1).values
        spot = cand7.gather(1, first.clamp(max=6).unsqueeze(1)).squeeze(1)
        can = mask & (first < 7)
        if not bool(can.any()):
            return can
        rows = can.nonzero(as_tuple=True)[0]
        slot = self.civ_unit_next[rows]
        assert int(slot.max()) < simbase.POOL_MAX, "civ slot pool exhausted — raise simbase.POOL_MAX"
        ti = self._builder_idx if type_idx is None else type_idx
        self.civ_unit_alive[rows, slot] = True
        self.civ_unit_civ[rows, slot] = civ
        self.civ_unit_seat[rows, slot] = civ + 1  # civ index i lives at seat i+1
        self.civ_unit_type[rows, slot] = ti
        self.civ_unit_tile[rows, slot] = spot[rows]
        self._reveal_around(rows, civ + 1, spot[rows], 2)  # spawnUnit's revealAround (SIGHT_RANGE)
        self.civ_unit_hp[rows, slot] = self.rules.combat.get("unitHp", 100)
        self.civ_unit_fortify[rows, slot] = 0  # civilian never fortifies; keep the (reclaimed) slot clean
        self.civ_unit_xp[rows, slot] = 0  # civilian never fights; keep the (reclaimed) slot at 0 xp
        self.civ_unit_aura_mp[rows, slot] = 0  # civilian never auras; keep the (reclaimed) slot clean
        self.civ_unit_emb[rows, slot] = False  # a fresh (possibly reclaimed) slot is ashore
        # The civ_unit_emb clear above MUST precede _full_mp, which READS it: a
        # reclaimed slot carries the dead occupant's `emb`, and _full_mp
        # overrides an embarked unit's pool to the flat EMBARK_MOVES. Reachable
        # only once a slot is REUSED, i.e. after a compaction.
        # `movesLeft: def.moves` + the seat's golden dedication.
        _m = self._full_mp("civ")[rows, slot]
        self.civ_unit_mp[rows, slot] = _m
        self.civ_unit_mp_full[rows, slot] = _m
        self.civ_unit_charges[rows, slot] = self._type_charges[ti] if charges is None else charges[rows]
        self.civilian_at[(rows, spot[rows])] = slot + simbase.SEAT0_POOL_MAX
        self.civ_unit_next[rows] += 1
        return can

    def _theological_combat(self, r: int, act: torch.Tensor) -> torch.Tensor:
        """The theological-combat mirror. For each APOSTLE slot of
        civ r flagged in `act` (slot order), find an ADJACENT religious unit
        of a DIFFERENT religion, damage both by the RELIGIOUS-STRENGTH
        difference, kill at 0 HP, and swing pressure in cities within
        theoPressureRange of the fallen unit. Returns [B, U] — the slots that
        fought and therefore skip the spread/walk (the TS `continue`).

        Target pick is the LOWEST SLOT among adjacent enemies, which is the
        v-pool's spawn order and so mirrors TS's lowest-unit-id. Zero RNG."""
        fought = torch.zeros_like(act)
        if not bool(act.any()):
            return fought
        U = self.civ_unit_alive.shape[1]
        rs = self._rel_strength
        for u in range(U):
            a_on = act[:, u] & self.civ_unit_alive[:, u]
            if not bool(a_on.any()):
                continue
            a_tile = self.civ_unit_tile[:, u]
            a_str = rs[self.civ_unit_type[:, u].clamp(min=0)]
            # adjacency + different religion + carries religious strength
            d = self.pair_dist[a_tile.unsqueeze(1), self.civ_unit_tile]  # [B, U]
            elig = (
                self.civ_unit_alive & (d == 1) & (self.civ_unit_civ != r)
                & (rs[self.civ_unit_type.clamp(min=0)] > 0)
            )
            elig = elig & a_on.unsqueeze(1)
            if not bool(elig.any()):
                continue
            first = elig & (elig.long().cumsum(dim=1) == 1)  # lowest slot
            has = first.any(dim=1)
            d_str = (rs[self.civ_unit_type.clamp(min=0)] * first.long()).sum(dim=1)
            to_def = (self._theo_base + self._theo_dmg * (a_str - d_str)).clamp(min=1)
            to_atk = (self._theo_base + self._theo_dmg * (d_str - a_str)).clamp(min=1)
            rows = has.nonzero(as_tuple=True)[0]
            if rows.numel() == 0:
                continue
            j = first.long().argmax(dim=1)  # defender slot
            self.civ_unit_hp[rows, j[rows]] = self.civ_unit_hp[rows, j[rows]] - to_def[rows].to(self.civ_unit_hp.dtype)
            self.civ_unit_hp[rows, u] = self.civ_unit_hp[rows, u] - to_atk[rows].to(self.civ_unit_hp.dtype)
            self.civ_unit_mp[rows, u] = 0  # the turn is spent (TS movesLeft = 0)
            fought[rows, u] = True
            def_dead = self.civ_unit_hp[rows, j[rows]] <= 0
            atk_dead = self.civ_unit_hp[rows, u] <= 0
            # pressure swing at the fallen unit's tile
            win_rel = torch.where(def_dead, torch.full_like(j[rows], r + 1), self.civ_unit_civ[rows, j[rows]] + 1)
            los_rel = torch.where(def_dead, self.civ_unit_civ[rows, j[rows]] + 1, torch.full_like(j[rows], r + 1))
            any_dead = def_dead | atk_dead
            dead_tile = torch.where(def_dead, self.civ_unit_tile[rows, j[rows]], self.civ_unit_tile[rows, u])
            if bool(any_dead.any()):
                dr = rows[any_dead]
                dt = dead_tile[any_dead]
                wr = win_rel[any_dead]
                lr = los_rel[any_dead]
                sw = int(self._theo_swing)
                dpc = self.pair_dist[self.site[dr].clamp(min=0), dt.unsqueeze(1)]  # [n, C]
                near_pc = (dpc <= self._theo_range) & self.alive[dr]
                for _k in range(dr.numel()):
                    m = near_pc[_k]
                    # ONE seat-wide [NS, RC] mask, written once for all seats.
                    msk = torch.zeros_like(self.city_alive[dr[_k]])
                    msk[0, : self.C] = m
                    drc = self.pair_dist[self.civ_city_center[dr[_k]].clamp(min=0), dt[_k]]  # [R, RC]
                    msk[1:1 + self.R] = (drc <= self._theo_range) & self.civ_city_alive[dr[_k]]
                    if bool(msk.any()):
                        self.city_pressure[dr[_k], msk, wr[_k]] += sw
                        self.city_pressure[dr[_k], msk, lr[_k]] = (self.city_pressure[dr[_k], msk, lr[_k]] - sw).clamp(min=0)
            # A killed unit must also LEAVE ITS TILE: `disbandUnit` drops it from
            # `state.units` entirely, so clearing civ_unit_alive alone would leave the
            # occupancy plane pointing at the corpse and block the tile forever
            # for every other seat's movers. Religious units are civilians, but
            # clear whichever plane actually points at the slot so a military
            # defender can never leak either.
            def _vacate(_rws: torch.Tensor, _slots: torch.Tensor) -> None:
                if _rws.numel() == 0:
                    return
                _t = self.civ_unit_tile[_rws, _slots]
                _c = self.civilian_at[_rws, _t] == _slots + self.POOL_LO["civ"]
                if bool(_c.any()):
                    self.civilian_at[(_rws[_c], _t[_c])] = -1
                _m = self.military_at[_rws, _t] == _slots + self.POOL_LO["civ"]
                if bool(_m.any()):
                    self.military_at[(_rws[_m], _t[_m])] = -1

            # RELICS — an APOSTLE killed in theological combat martyrs and hands
            # its owner a relic. Granted BEFORE the disbands and in the TS order
            # (defender first, then attacker) so slot placement is order-exact.
            # A dead MISSIONARY yields nothing; the attacker is always an apostle.
            if self._relic_bidx >= 0 and self._apostle_idx >= 0:
                if bool(def_dead.any()):
                    _dr = rows[def_dead]
                    _ap = self.civ_unit_type[_dr, j[_dr]] == self._apostle_idx
                    if bool(_ap.any()):
                        self._grant_relic(_dr[_ap], self.civ_unit_civ[_dr[_ap], j[_dr][_ap]] + 1)
                if bool(atk_dead.any()):
                    _ar = rows[atk_dead]
                    self._grant_relic(_ar, torch.full_like(_ar, r + 1))
            if bool(def_dead.any()):
                dd = rows[def_dead]
                # NO dig here. THEOLOGICAL combat's TS twin (the apostle /
                # missionary exchange in phase.ts) calls raw `disbandUnit`, not
                # `killUnit`, so no antiquity site is created for a religious
                # death and adding one here over-digs against TS. Whether real
                # Civ 6 leaves a dig for theological combat is UNSOURCED, so
                # changing it needs its own verification on both engines.
                self.civ_unit_alive[dd, j[dd]] = False
                _vacate(dd, j[dd])
            if bool(atk_dead.any()):
                ad = rows[atk_dead]
                self.civ_unit_alive[ad, u] = False
                _vacate(ad, torch.full_like(ad, u))
        return fought

    def _grant_relic(self, rows: torch.Tensor, civ: torch.Tensor) -> None:
        """The `placeRelic` mirror: hand each row's seat (`civ` [n]: 0 = seat 0,
        r+1 = civ r) ONE relic, placed in the LOWEST city holding a TEMPLE with a
        free relic slot — city ARRAY order, which the dense city/rc slot order
        mirrors. A relic that finds no slot is LOST, as TS discards the return
        value the same way."""
        if rows.numel() == 0 or self._relic_bidx < 0:
            return
        pl = civ == 0
        if bool(pl.any()):
            pr = rows[pl]
            placed = torch.zeros(pr.numel(), dtype=torch.bool, device=self.device)
            for c in range(self.C):
                take = (
                    ~placed
                    & self.alive[pr, c]
                    & self.buildings[pr, c, self._relic_bidx].bool()
                    & (self.relics[pr, c] < self._relic_slots)
                )
                if bool(take.any()):
                    self.relics[pr[take], c] += 1
                    placed = placed | take
        rv = ~pl
        if bool(rv.any()) and self.R > 0:
            rr = rows[rv]
            rc = (civ[rv] - 1).clamp(min=0, max=max(self.R - 1, 0))
            placed = torch.zeros(rr.numel(), dtype=torch.bool, device=self.device)
            for j in range(self.RC):
                take = (
                    ~placed
                    & self.civ_city_alive[rr, rc, j]
                    & self.civ_city_bldg[rr, rc, j, self._relic_bidx].bool()
                    & (self.civ_city_relics[rr, rc, j] < self._relic_slots)
                )
                if bool(take.any()):
                    self.civ_city_relics[rr[take], rc[take], j] += 1
                    placed = placed | take
        self._eff_version += 1  # relics are a yield-bearing write (faith)

    def _religious_victor(self) -> torch.Tensor:
        """The religiousVictor mirror: [B] the lowest religion id g such that
        EVERY seat holding at least one city has MORE THAN HALF of its cities
        following g; -1 none. Requires g founded (holy_tile set) and at least one
        living seat. At most one g can predominate within a seat, so the
        ascending scan needs no tie-break."""
        B, O = self.B, self._O
        npl = self.alive.sum(dim=1)  # [B] seat-0 cities
        n_r = self.civ_city_alive.sum(dim=2) if self.R > 0 else None  # [B, R]
        any_civ = npl > 0
        if self.R > 0:
            any_civ = any_civ | (n_r > 0).any(dim=1)
        winner = torch.full((B,), -1, dtype=torch.long, device=self.device)
        for g in range(O):
            founded_g = self.holy_tile[:, g] >= 0
            nf = (self.alive & (self.city_followed[:, 0, :self.C] == g)).sum(dim=1)
            ok = founded_g & any_civ & ((npl == 0) | (2 * nf > npl))
            if self.R > 0:
                nf_r = (self.civ_city_alive & (self.city_followed[:, 1:1 + self.R] == g)).sum(dim=2)  # [B, R]
                ok = ok & ((n_r == 0) | (2 * nf_r > n_r)).all(dim=1)
            winner = torch.where((winner < 0) & ok, torch.full_like(winner, g), winner)
        return winner

    def _suzerain_count(self, row: int) -> torch.Tensor:
        """[B] city-states seat row `row` is Suzerain of — the `isSuzerain`
        twin: >= suzerainEnvoys, alive, and STRICTLY more envoys than every
        other seat row (a tie leaves no suzerain)."""
        suz_min = int(self.rules.citystate.get("suzerainEnvoys", 3))
        env = self.seat_citystate_envoys  # [B, 1+R, S]
        mine = env[:, row]
        m = (mine >= suz_min) & self.citystate_alive
        for o in range(1 + self.R):
            if o != row:
                m = m & (mine > env[:, o])
        return m.sum(dim=1)

    def _world_congress(self) -> None:
        """The `worldCongress` mirror. At every congressInterval turn, once ANY
        seat has reached congressMinEra (Medieval), one resolution runs: every
        seat commits ALL its favor as votes, the LARGEST commitment wins
        DVP_PER_RESOLUTION Diplomatic Victory Points, and every commitment is
        spent. Ties keep the LOWER seat id (the ascending scan). A seat with zero
        favor casts no vote and cannot win. Zero-draw — a pure function of
        state."""
        if self._congress_interval <= 0:
            return
        fires = (self.turn % self._congress_interval) == 0
        if not fires:
            return
        era_ok = self._civ_era(self.techs, self.civics) >= self._congress_min_era
        for r in range(self.R):
            era_ok = era_ok | (self._civ_era(self.civ_only_techs[:, r], self.civ_only_civics[:, r]) >= self._congress_min_era)
        if not bool(era_ok.any()):
            return
        self.congress_sessions.add_(era_ok.long())
        # the ascending scan: strictly-greater keeps the LOWER id on a tie
        best = self.diplo_favor.clone()
        win = torch.where(best > 0, torch.zeros_like(best), torch.full_like(best, -1))
        for r in range(self.R):
            v = self.civ_only_diplo_favor[:, r]
            take = (v > 0) & (v > best)
            win = torch.where(take, torch.full_like(win, r + 1), win)
            best = torch.where(take, v, best)
        # commitments are spent whether or not they won (only where the
        # session actually convened)
        self.diplo_favor.copy_(torch.where(era_ok, torch.zeros_like(self.diplo_favor), self.diplo_favor))
        for r in range(self.R):
            self.civ_only_diplo_favor[:, r] = torch.where(era_ok, torch.zeros_like(self.civ_only_diplo_favor[:, r]), self.civ_only_diplo_favor[:, r])
        self.diplo_points.add_((era_ok & (win == 0)).long() * self._dvp_per_res)
        for r in range(self.R):
            self.civ_only_diplo_points[:, r] = self.civ_only_diplo_points[:, r] + (era_ok & (win == r + 1)).long() * self._dvp_per_res

    def _diplomatic_victor(self) -> torch.Tensor:
        """The `diplomaticVictor` mirror: [B] the lowest seat id holding
        >= diploVictoryPoints Diplomatic Victory Points and still holding a
        city; -1 none."""
        winner = torch.full((self.B,), -1, dtype=torch.long, device=self.device)
        ok = self.alive.any(dim=1) & (self.diplo_points >= self._dvp_win)
        winner = torch.where(ok, torch.zeros_like(winner), winner)
        for r in range(self.R):
            okr = self.civ_city_alive[:, r].any(dim=1) & (self.civ_only_diplo_points[:, r] >= self._dvp_win)
            winner = torch.where((winner < 0) & okr, torch.full_like(winner, r + 1), winner)
        return winner

    def _dedication_event(self, civ: int, kind: int, count: torch.Tensor) -> None:
        """The `dedicationEvent` mirror: the DARK/NORMAL face of a seat's
        committed dedications pays ERA SCORE off a specific EVENT. A GOLDEN age
        takes a standing bonus instead and earns nothing here. Every MATCHING
        committed dedication pays, so a HEROIC age holding the same one twice
        pays twice. Zero-draw.

        `count` [B] is HOW MANY TIMES the event fired this turn, and it MUST be a
        count, not a mask: TS calls `dedicationEvent` once per OCCURRENCE (per
        converted city, per eureka, per completed district), so N occurrences in
        one turn must pay N times. A bool is still accepted and reads as 0/1 for
        the sites that genuinely fire at most once per call."""
        if not self._ded_payouts_live:
            return
        cnt = count.long()
        if not bool((cnt > 0).any()):
            return
        n = (self.ded_picks[:, civ] == kind).sum(dim=1)  # [B]
        pay = (self.civ_age[:, civ] != 2) & (n > 0)
        if bool(pay.any()):
            self.era_score[:, civ] = self.era_score[:, civ] + pay.long() * cnt * n * self._ded_event_score[kind]

    def _culture_victor(self) -> torch.Tensor:
        """The `cultureVictor` mirror: [B] the lowest seat id (0 = seat 0,
        r+1 = civ r) whose VISITING tourists exceed EVERY other seat's DOMESTIC
        tourists; -1 none.

        visiting = lifetime tourism // (nCivs * TOURISM_PER_VISITOR_PER_CIV)
        domestic = lifetime culture // CULTURE_PER_DOMESTIC_TOURIST

        Both floor to whole tourists, so the comparison is integer-exact and
        zero-draw. Culture is milli-rounded BEFORE the floor (the bankruptcy
        convention) so a sub-milli float drift cannot move a tourist count.
        A cityless seat cannot win."""
        B, dev = self.B, self.device
        n_civs = 1 + self.R
        vis_div = n_civs * self._tourism_per_visitor
        alive = [self.alive.any(dim=1)]
        tour = [self.tourism_total]
        cul = [self.culture_total]
        for r in range(self.R):
            alive.append(self.civ_city_alive[:, r].any(dim=1))
            tour.append(self.civ_only_tourism[:, r])
            cul.append(self.civ_only_culture[:, r])
        visiting = [torch.div(t.long(), vis_div, rounding_mode="floor") for t in tour]
        domestic = [
            torch.div(js_round(c * 1000).long(), 1000 * self._culture_per_tourist, rounding_mode="floor")
            for c in cul
        ]
        winner = torch.full((B,), -1, dtype=torch.long, device=dev)
        for c in range(n_civs):
            ok = alive[c]
            for o in range(n_civs):
                if o == c:
                    continue
                ok = ok & (visiting[c] > domestic[o])
            winner = torch.where((winner < 0) & ok, torch.full_like(winner, c), winner)
        return winner

    def _rcy_globals(self) -> dict:
        """The r-independent planes shared by _seat_city_yields and
        _seat_border_growth: strip-adjusted food/production, the strip-adjusted
        static columns, and the balanced-score sum of the four static columns.
        Keyed on _eff_version like every derived cache; research completions bump
        it for every seat, so a mid-phase tech/civic completion invalidates the
        per-r entries before the next read. Cached tensors are the IDENTICAL
        values a fresh compute produces (same ops, same order), so float
        association is untouched."""
        if self._rcy_cache is not None and self._rcy_cache[0] == self._eff_version:
            return self._rcy_cache[1]
        fs = self.feat_stripped.to(self.dtype)
        f_base = (self._eff_food() if (self.disasters or self.improvements_on) else self.tile_yields[:, :, 0]) - self.feat_yields[:, :, 0] * fs
        p_plane = self._neutral_prod() - self.feat_yields[:, :, 1] * fs
        ty_oth = self.tile_yields - self.feat_yields * fs.unsqueeze(-1)  # strip-adjusted static (cols 2-5)
        # CAMP/PLANTATION catalog gold joins the static columns
        # (TS tileYields adds improvement yields in every context; pillage
        # suspends them). Cols 0/1 stay untouched — food/production ride
        # f_base/p_plane, adding here would double-count.
        if self.improvements_on:
            live_imp = ((self.improvement >= 0) & ~self.pillaged).to(self.dtype)
            ty_oth[:, :, 2:] = ty_oth[:, :, 2:] + self._imp_yields[self.improvement.clamp(min=0), 2:] * live_imp.unsqueeze(-1)
            # the SEASIDE RESORT's gold is the tile's APPEAL, not a catalog
            # constant — the same term _eff_yields applies, or a resort would pay
            # nothing on this path.
            if self.SEASIDE >= 0:
                sr_live = (self.improvement == self.SEASIDE).to(self.dtype) * live_imp
                if bool(sr_live.any()):
                    ty_oth[:, :, 2] = ty_oth[:, :, 2] + self._tile_appeal().clamp(min=0).to(self.dtype) * sr_live
        w = self.rules_dev.focus_base.double()
        oth_score = (ty_oth[:, :, 2:].double() * w[2:].reshape(1, 1, 4)).sum(dim=2)  # [B, T]
        g = {"fs": fs, "f_base": f_base, "p_plane": p_plane, "ty_oth": ty_oth, "oth_score": oth_score, "w": w, "f_r": {}}
        self._rcy_cache = (self._eff_version, g)
        return g

    def _rcy_food_plane(self, r: int, g: dict) -> torch.Tensor:
        """Civ r's food plane — f_base plus ITS OWN farm-adjacency
        (Feudalism/Replaceable Parts tier × the shared qualifying set)."""
        if r in g["f_r"]:
            return g["f_r"][r]
        f_plane = g["f_base"]
        if self.improvements_on:
            tier_r = self._farmadj_tier(self.civ_only_civics[:, r], self.civ_only_techs[:, r])
            if bool((tier_r > 0).any()):
                f_plane = f_plane + self._farmadj_qual().to(self.dtype) * tier_r.unsqueeze(1).to(self.dtype)
        g["f_r"][r] = f_plane
        return f_plane

    def _civ_only_has_beliefs(self, r: int) -> bool:
        """Fast path: most civs/turns carry no claimed beliefs (a founder
        implies a follower, so pantheon|follower covers all three)."""
        return self._bel_any and bool(((self.civ_only_pantheon[:, r] >= 0) | (self.civ_only_follower[:, r] >= 0)).any())

    def _bel_add(self, key: str, r: int) -> torch.Tensor:
        """Civ r's summed ADDITIVE belief effect rows (pantheon + follower +
        founder; unclaimed ids land on the zero pad row). Memoised on
        _bel_version — the only mutable inputs are civ_only_pantheon/civ_only_follower/
        civ_only_founder[:,r], which change solely at the belief-claim sites and at
        restore/reset, each of which bumps _bel_version. Consumers read-only."""
        if self._bel_add_memo is None or self._bel_add_memo[0] != self._bel_version:
            self._bel_add_memo = (self._bel_version, {})
        d = self._bel_add_memo[1]
        mk = ("add", key, r)
        v = d.get(mk)
        if v is None:
            v = (
                self._bel["pan"][key][self.civ_only_pantheon[:, r] + 1]
                + self._bel["fol"][key][self.civ_only_follower[:, r] + 1]
                + self._bel["fou"][key][self.civ_only_founder[:, r] + 1]
            )
            d[mk] = v
        return v

    def _bel_mul(self, key: str, r: int) -> torch.Tensor:
        """The MULTIPLICATIVE twin of _bel_add (pad row = 1.0) — border/growth."""
        return (
            self._bel["pan"][key][self.civ_only_pantheon[:, r] + 1]
            * self._bel["fol"][key][self.civ_only_follower[:, r] + 1]
            * self._bel["fou"][key][self.civ_only_founder[:, r] + 1]
        )

    def _bel_add_pf(self, key: str, r: int) -> torch.Tensor:
        """The pantheon + FOUNDER additive rows ONLY (NO follower) — the per-civ
        remainder, since the follower channel is a per-city lookup keyed on the
        followed religion. Used for bldgY (founder Stewardship keeps its
        Library/University/Market/Bank adds per-civ). Memoised on _bel_version,
        sharing _bel_add's memo under a disjoint key tag."""
        if self._bel_add_memo is None or self._bel_add_memo[0] != self._bel_version:
            self._bel_add_memo = (self._bel_version, {})
        d = self._bel_add_memo[1]
        mk = ("pf", key, r)
        v = d.get(mk)
        if v is None:
            v = (
                self._bel["pan"][key][self.civ_only_pantheon[:, r] + 1]
                + self._bel["fou"][key][self.civ_only_founder[:, r] + 1]
            )
            d[mk] = v
        return v

    def _follower_by_rel(self) -> torch.Tensor:
        """[B, O] follower-belief id per religion id (religion 0 belongs to seat 0
        and always reads -1, since seat 0 never founds here; i+1 = civ i's
        civ_only_follower). Pad id -1 gathers the neutral row 0 in the follower
        tables."""
        fbr = torch.full((self.B, self._O), -1, dtype=torch.long, device=self.device)
        if self.R > 0:
            fbr[:, 1:1 + self.R] = self.civ_only_follower[:, :self.R]
        return fbr

    def _follower_id_for(self, rel: torch.Tensor) -> torch.Tensor:
        """Map religion ids `rel` (any shape [B, ...], -1 = none) to the
        follower-belief id of that religion's founding seat (-1 = none/pad)."""
        fbr = self._follower_by_rel()  # [B, O]
        flat = rel.reshape(self.B, -1)
        fid = fbr.gather(1, flat.clamp(min=0)).reshape_as(rel)
        return torch.where(rel >= 0, fid, torch.full_like(fid, -1))

    def _fol_tab(self, key: str, fol_id: torch.Tensor) -> torch.Tensor:
        """Gather the FOLLOWER-belief effect table `key` per element of
        `fol_id` (-1 pad -> neutral row 0). Result shape = fol_id.shape + the
        table's trailing dims."""
        return self._bel["fol"][key][fol_id + 1]

    def _city_rel_seat0(self) -> torch.Tensor:
        """The religion id each SEAT-0 city draws its follower belief from —
        followedReligion when the coupling is LIVE, else seat 0's religion id 0."""
        if self._b18_couple:
            return self.city_followed[:, 0, :self.C]
        return torch.zeros(self.B, self.C, dtype=torch.long, device=self.device)

    def _civ_city_rel(self, r: int) -> torch.Tensor:
        """The religion id each civ-r city [B, RC] draws its follower belief from
        — civ_city_followed when the coupling is LIVE, else the owner religion r+1."""
        if self._b18_couple:
            return self.city_followed[:, r + 1]
        return torch.full((self.B, self.RC), r + 1, dtype=torch.long, device=self.device)

    def _belief_feat_plane(self, r: int) -> torch.Tensor:
        """[B, T, 6] belief TILE adds — featureYields at tiles with a LIVE feature
        (fid >= 0 and not stripped), plus improvementOnResource at unpillaged
        improvements on a LIVE resource (category = the res priority code), plus
        improvementYields at unpillaged improvements. TS adds all three inside
        tileYields, so they ride every consumer: worked-tile picks and yields,
        scores, the border ySum.

        Cached single-slot on (r, _eff_version, _bel_version). Belief inputs bump
        _bel_version at claims/restore; tile inputs (feat_id/feat_stripped/
        improvement/pillaged/res_stripped/res_priority) bump _eff_version at their
        mutation sites. All consumers read-only."""
        key = (r, self._eff_version, self._bel_version)
        if self._belief_feat_cache is not None and self._belief_feat_cache[0] == key:
            return self._belief_feat_cache[1]
        featA = self._bel_add("featY", r)  # [B, nFeat, 6]
        plane = featA.gather(1, self.feat_id.clamp(min=0).unsqueeze(2).expand(-1, -1, 6))
        live = ((self.feat_id >= 0) & ~self.feat_stripped).unsqueeze(2).to(plane.dtype)
        plane = plane * live
        impA = self._bel_add("impRes", r)  # [B, 4, 6] rows by category code
        cat = torch.where(
            (self.improvement >= 0) & ~self.pillaged & ~self.res_stripped,
            self.res_priority.clamp(max=3),
            torch.zeros_like(self.res_priority),
        )  # 0 = no add (pad row)
        plane = plane + impA.gather(1, cat.unsqueeze(2).expand(-1, -1, 6))
        # belief improvementYields, gathered by the tile's improvement
        # (unpillaged; no resource condition — TS keys on the improvement
        # alone). The gather pad (idx 0 = FARM) is masked dead by imp_live.
        impY = self._bel_add("impY", r)  # [B, nImp, 6]
        imp_live = ((self.improvement >= 0) & ~self.pillaged).unsqueeze(2).to(plane.dtype)
        plane = plane + impY.gather(1, self.improvement.clamp(min=0).unsqueeze(2).expand(-1, -1, 6)) * imp_live
        self._belief_feat_cache = (key, plane)
        return plane

    def _seat_route_income(self, r: int) -> torch.Tensor | None:
        """Per-slot ORIGIN income from this civ's unraided routes — [B, RC, 6]
        double in engine yield order (food, prod, gold, sci, cul, faith), or None
        when the civ holds no routes batch-wide.

        Domestic routes pay routeYields' 1 + floor(destCompletedSpecialty/2) to
        food AND production; a CS route (dest encoded -(2+cityStateIdx) in civ_only_routes)
        pays cityStateRouteGold to gold + cityStateRouteSpec to the CS type's specialty column
        (_citystate_yidx), gated on citystate_alive — TS removes a captured CS and prunes its
        routes at capture, and this gate is the mirror for the same-turn read.
        Dest is resolved by rc id among LIVING cities; a route is suspended while
        a barbarian (always) or a seat-0 unit (at war) sits within 3 of either
        endpoint.

        Cached single-slot on (turn, r, _eff_version, _rp_kill_version). Reads
        civ_only_routes/civ_city_id/civ_city_alive/civ_city_center/civ_city_dist_tile/civ_only_atwar[:,r], all constant
        through the economy loop for this r since trade and war run outside it,
        plus district_complete (mid-loop completions bump _eff_version, so a
        later origin's raised dest bonus recomputes) and barb_unit_alive/seat0_unit_alive (a
        strike-kill bumps _rp_kill_version). Every other caller runs after the
        full civ phase and iterates r strictly sequentially, so with R >= 2 the
        single slot is always overwritten by a different r before the same r is
        re-requested and the recompute sees current state. Consumers read only
        column j, read-only."""
        key = (self.turn, r, self._eff_version, self._rp_kill_version, self._bel_version)  # + bel (enhancer claims move the Messenger term)
        if self._seat_route_cache is not None and self._seat_route_cache[0] == key:
            return self._seat_route_cache[1]
        rr = self.civ_only_routes[:, r]  # [B, K, 2]
        act = rr[:, :, 0] >= 0
        if not bool(act.any()):
            self._seat_route_cache = (key, None)
            return None
        B, RC = self.B, self.RC
        ids = self.civ_city_id[:, r]  # [B, RC]
        alive = self.civ_city_alive[:, r]
        is_cs = rr[:, :, 1] <= -2  # CS dest encoding -(2+cityStateIdx)
        citystate_s = (-rr[:, :, 1] - 2).clamp(min=0)  # [B, K] cs index (garbage where ~is_cs)
        fm = (rr[:, :, 0].unsqueeze(2) == ids.unsqueeze(1)) & alive.unsqueeze(1)  # [B, K, RC]
        dm = (rr[:, :, 1].unsqueeze(2) == ids.unsqueeze(1)) & alive.unsqueeze(1)
        has_from = fm.any(dim=2)
        has_dest = dm.any(dim=2)
        from_j = fm.long().argmax(dim=2)  # ids unique per civ → at most one hit
        dest_j = dm.long().argmax(dim=2)
        dt = self.civ_city_dist_tile[:, r]  # [B, RC, nD]
        comp = (dt >= 0) & self.district_complete.gather(1, dt.clamp(min=0).reshape(B, -1)).reshape_as(dt)
        spec = (comp & self._is_specialty.reshape(1, 1, -1)).sum(dim=2)  # [B, RC]
        per = (1 + spec // 2).double()  # [B, RC] — routeYields' food (= prod) column
        centers = self.civ_city_center[:, r].clamp(min=0)  # [B, RC]
        # hostile-near-endpoint [B, RC]: barbarians always; seat-0 units at war;
        # civ units at war with THIS civ. The civ arm is read off the war matrix
        # so it cannot drift from civsAtWar, and is built once here.
        # TS asks `routeRaidedAt(state, [origin, dest], seat)`, which walks every
        # unit for EVERY endpoint, so this mask must feed ALL THREE endpoint
        # scans below — the civ's own cities, a city-state destination, and an
        # international destination (any other major's city).
        _v_host = None
        if self.civ_unit_tile.numel():
            _hv = self.war[:, int(self._seat_row[r + 1]), :].gather(1, self._seat_row[self.civ_unit_seat.clamp(min=0)])  # [B, V]
            _v_host = self.civ_unit_alive & _hv  # [B, V]

        def _near_of(tiles: torch.Tensor, seat0_arm: bool = True) -> torch.Tensor:
            """Hostiles within 3 of each tile in `tiles` [B, N] — the
            `routeRaidedAt` twin for one set of endpoints."""
            out = torch.zeros(*tiles.shape, dtype=torch.bool, device=self.device)
            if self.barb_unit_tile.numel():  # barbarians: always
                d_b = self.pair_dist[tiles.unsqueeze(2), self.barb_unit_tile.clamp(min=0).unsqueeze(1)] <= 3
                out = out | (d_b & self.barb_unit_alive.unsqueeze(1)).any(dim=2)
            if seat0_arm and self.seat0_unit_tile.numel():  # seat 0: only at war
                d_p = self.pair_dist[tiles.unsqueeze(2), self.seat0_unit_tile.clamp(min=0).unsqueeze(1)] <= 3
                out = out | ((d_p & self.seat0_unit_alive.unsqueeze(1)).any(dim=2) & self.civ_only_atwar[:, r].reshape(B, 1))
            if _v_host is not None:  # a civ, only at war
                d_v = self.pair_dist[tiles.unsqueeze(2), self.civ_unit_tile.clamp(min=0).unsqueeze(1)] <= 3
                out = out | (d_v & _v_host.unsqueeze(1)).any(dim=2)
            return out

        near = _near_of(centers)
        inc = torch.zeros(B, RC * 6, dtype=torch.float64, device=self.device)
        # domestic legs
        raided_d = near.gather(1, from_j) | near.gather(1, dest_j)  # [B, K]
        pays_d = act & ~is_cs & has_from & has_dest & ~raided_d
        pd = pays_d.double()
        inc.scatter_add_(1, from_j * 6 + 0, per.gather(1, dest_j) * pd)
        inc.scatter_add_(1, from_j * 6 + 1, per.gather(1, dest_j) * pd)
        # Messenger of the Gods: +tradeRel yields on each DOMESTIC route whose
        # destination city follows this civ's religion (r+1), at the route-loop
        # position, pre-tier. CS destinations carry no religion.
        if self._enh_any and bool((self.civ_only_enhancer[:, r] >= 0).any()):
            tr6 = self._enh["tradeRel"][self.civ_only_enhancer[:, r] + 1]  # [B, 6]
            if bool((tr6 != 0).any()):
                dest_fol = self.city_followed[:, r + 1].gather(1, dest_j)  # [B, K]
                rel_ok = (pays_d & (dest_fol == (r + 1)) & self.civ_only_religion_done[:, r].unsqueeze(1)).double()
                if bool((rel_ok != 0).any()):
                    for _kc in range(6):
                        inc.scatter_add_(1, from_j * 6 + _kc, tr6[:, _kc].unsqueeze(1) * rel_ok)
        # CS legs
        if self.S > 0 and bool(is_cs.any()):
            S = self.S
            _tr = self.rules.trade or {}
            citystate_gold = float(_tr.get("cityStateRouteGold", 3))
            citystate_spec = float(_tr.get("cityStateRouteSpec", 1))
            csc = self.citystate_center[:, :S].clamp(min=0)  # [B, S]
            near_cs = _near_of(csc)
            citystate_ok = self.citystate_alive[:, :S].gather(1, citystate_s) & (citystate_s < S)
            raided_c = near.gather(1, from_j) | near_cs.gather(1, citystate_s)
            pays_c = act & is_cs & has_from & citystate_ok & ~raided_c
            pc = pays_c.double()
            inc.scatter_add_(1, from_j * 6 + 2, citystate_gold * pc)
            ycol = self._citystate_yidx[:, :S].gather(1, citystate_s)  # [B, K] specialty column per route
            inc.scatter_add_(1, from_j * 6 + ycol, citystate_spec * pc)
        # international legs: a route to ANY OTHER MAJOR's city
        # (civ_only_route_dest = the dest CENTER TILE, >=0) pays intlGold +
        # dest completed specialty count to GOLD only. Suspended while at war
        # with the DESTINATION seat (interdiction shortcut, the proven seat-0
        # convention) or while a hostile prowls within 3 of either endpoint.
        rd_i = self.civ_only_route_dest[:, r]  # [B, K] dest center tile (>=0 = intl)
        intl = act & (rd_i >= 0)
        if bool(intl.any()):
            K_i = rd_i.shape[1]
            dest_tile = rd_i.clamp(min=0)  # [B, K]
            dest_slot = self.center_at.gather(1, dest_tile)  # [B, K] seat-0 city slot (-1 = none)
            d_civ = self.civ_city_at.gather(1, dest_tile)  # [B, K] dest CIV index (-1 = none)
            is_p_dest = dest_slot >= 0
            is_v_dest = ~is_p_dest & (d_civ >= 0) & (d_civ != r)
            valid_dest = is_p_dest | is_v_dest
            # completed specialty districts, tile-keyed once for both dest kinds
            own_spec = (self.district >= 0) & self._is_specialty[self.district.clamp(min=0)] & self.district_complete
            # per seat-0-city count [B, C]
            p_city_spec = torch.zeros(B, self.C, dtype=torch.long, device=self.device).scatter_add_(
                1, self.owner.clamp(min=0), (own_spec & (self.tile_seat == 0)).long()
            )  # [B, C]
            # per civ-dest count: this route's dest city's own tiles (id-keyed
            # via tile_city — per-seat ids collide across seats, so the civ
            # index qualifies the match)
            dcid = self.tile_city.gather(1, dest_tile)  # [B, K] dest city id
            v_spec = (
                (own_spec & (self.civ_at >= 0)).unsqueeze(1)
                & (self.civ_at.unsqueeze(1) == d_civ.reshape(B, K_i, 1))
                & (self.tile_city.unsqueeze(1) == dcid.reshape(B, K_i, 1))
            ).sum(dim=2)  # [B, K]
            spec_dest = torch.where(is_p_dest, p_city_spec.gather(1, dest_slot.clamp(min=0)), v_spec)
            gold_i = (self._trade_intl_gold + spec_dest).double()
            # seat-0 arm off for SEAT-0 destinations: `pays_i` already requires
            # PEACE with seat 0 there, so a seat-0 unit term cannot change the
            # answer. A CIV-dest leg keeps the seat-0 arm — a seat-0 unit at
            # war with this civ interdicts like any hostile.
            near_dest = torch.where(is_p_dest, _near_of(dest_tile, seat0_arm=False), _near_of(dest_tile))
            atwar_dest = torch.where(
                is_p_dest,
                self.civ_only_atwar[:, r].reshape(B, 1).expand(B, K_i),
                self.civ_pair_war[:, r].gather(1, d_civ.clamp(min=0)),
            )
            raided_i = near.gather(1, from_j) | near_dest
            pays_i = act & intl & has_from & valid_dest & ~atwar_dest & ~raided_i
            inc.scatter_add_(1, from_j * 6 + 2, gold_i * pays_i.double())
        inc = inc.reshape(B, RC, 6)
        self._seat_route_cache = (key, inc)
        return inc

    def _civ_city_bdark(self, dt_reg: torch.Tensor) -> torch.Tensor:
        """Given an rc district-tile registry [..., nD] (tile per district type,
        -1 = none), return [..., NB] bool = building b is dark because its
        district is COMPLETE-but-PILLAGED. CITY_CENTER buildings (_b_req_district
        == -1) never gate. The pillagedDistrictTypes twin over rc buildings."""
        if not self.districts_on or dt_reg.shape[-1] == 0:
            return torch.zeros(*dt_reg.shape[:-1], self.NB, dtype=torch.bool, device=self.device)
        B0 = dt_reg.shape[0]
        flat = dt_reg.clamp(min=0).reshape(B0, -1)
        comp = self.district_complete.gather(1, flat).reshape_as(dt_reg)
        pilf = self.district_pillaged.gather(1, flat).reshape_as(dt_reg)
        pil = (dt_reg >= 0) & comp & pilf  # [..., nD]
        breq = self._b_req_district  # [NB]
        return pil[..., breq.clamp(min=0)] & (breq >= 0)  # [..., NB]

    def _civ_city_specialists(self, r: int, j: int, top_vals: torch.Tensor, pop: torch.Tensor):
        """(nSpec [B], yields [B, 6]) for civ r's city j.

        Open slots per district = that city's buildings belonging to it, and
        the district must be registered, COMPLETE and unpillaged. Each
        slot is scored with the same `focus_base` weighting the tile ranking
        uses, so the two are directly comparable; slots are consumed in
        score-descending district order (ties by district index), exactly the
        order TS sorts them in."""
        nD = self._spec_yields.shape[0]
        B, dev = self.B, self.device
        nspec = torch.zeros(B, dtype=torch.long, device=dev)
        add = torch.zeros(B, 6, dtype=torch.float64, device=dev)
        if nD == 0 or self.civ_city_bldg.shape[3] == 0:
            return nspec, add
        # `sc_d` and the district ORDER depend only on the rules, and this runs
        # hundreds of times per turn, so both are cached rather than re-sorted
        # per call. Identical values either way, so the result is bit-exact.
        cache = getattr(self, "_spec_order_cache", None)
        if cache is None:
            w = self.rules_dev.focus_base.double()
            sc_d = (self._spec_yields.double() * w.reshape(1, 6)).sum(dim=1)  # [nD]
            order = sorted(range(nD), key=lambda d: (-float(sc_d[d]), d))
            order = [d for d in order if float(sc_d[d]) > 0.0]
            cache = (sc_d, order)
            self._spec_order_cache = cache
        sc_d, order = cache
        dt = self.civ_city_dist_tile[:, r, j]  # [B, nD]
        live = (
            (dt >= 0)
            & self.district_complete.gather(1, dt.clamp(min=0))
            & ~self.district_pillaged.gather(1, dt.clamp(min=0))
        )
        nb = self.civ_city_bldg.shape[3]
        req = self._b_req_district[:nb]
        kkm = top_vals.shape[1]
        for d in order:  # pre-filtered to sc_d > 0 by the cache above
            cnt = (self.civ_city_bldg[:, r, j] & (req == d).unsqueeze(0)).sum(dim=1) * live[:, d].long()
            if not bool((cnt > 0).any()):
                continue
            for _k in range(int(cnt.max().item())):
                idx = (pop - nspec - 1).clamp(min=0, max=max(kkm - 1, 0))
                t_key = top_vals.gather(1, idx.unsqueeze(1)).squeeze(1)
                # no tile left to displace -> that slot's civ is -1e18
                t_key = torch.where((pop - nspec - 1) < 0, torch.full_like(t_key, -1e18), t_key)
                cond = (_k < cnt) & (nspec < pop) & ((sc_d[d] * 1e6 - float(self.T)) > t_key)
                nspec = nspec + cond.long()
                add = add + cond.double().unsqueeze(1) * self._spec_yields[d].double().unsqueeze(0)
        return nspec, add

    def _seat_city_yields(self, r: int, j: int, mask: torch.Tensor, amen_yf: torch.Tensor | None = None) -> tuple[torch.Tensor, torch.Tensor]:
        """The computeCityStats twin for a civ seat — the real citizen path under
        defaultModifiers. Candidates = owned, citizen-workable (water yes,
        impassable no), non-district tiles in the work radius; district and
        center tiles are EXCLUDED like workableTiles, not wasted as empty slots.
        Scored by the real tileScore ('balanced' focus_base weights over all six
        yields, ties to the lowest index) and topped by population; the center
        adds its floored tileYieldsForCenter.
        Returns (food, production, science, culture) — the research streams ride
        the same worked-tile selection. Food takes the disaster/farm tail;
        production takes improvement BASE yields via the defaultModifiers plane,
        never a seat's own boosts."""
        rd = self.rules_dev
        center = self.civ_city_center[:, r, j]
        tiles = tiles_from_offsets(center, self._off3, self.W, self.H)  # [B, M]
        tc = tiles.clamp(min=0)
        # !t.district in TS: districts, seat-0 centers AND civ-seat centers
        # (founding sets tile.district) all disqualify a candidate.
        districted = (
            (self.center_at.gather(1, tc) >= 0)
            | (self.civ_city_at.gather(1, tc) >= 0)
            | (self.district.gather(1, tc) >= 0)
            | (self.built_wonder.gather(1, tc) >= 0)  # wonder tiles are not workable
        )
        valid = (
            (tiles >= 0)
            & (self.civ_at.gather(1, tc) == r)
            # PER-CITY (see the _all twin).
            & (self.tile_city.gather(1, tc) == self.civ_city_id[:, r, j].unsqueeze(1))
            & self.work_ok.gather(1, tc)
            & (tiles != center.unsqueeze(1))
            & ~districted
        )
        # the strip-adjusted planes (TS reads tile.feature===null live) and the
        # per-r farm-adjacency plane come from the shared _eff_version-keyed
        # cache; the center path below applies its own strip via fy_c, so it
        # reads the raw plane untouched.
        g = self._rcy_globals()
        f_plane = self._rcy_food_plane(r, g)
        p_plane = g["p_plane"]
        ty_oth = g["ty_oth"]
        oth_sc = g["oth_score"]
        # this civ's belief featureYields join every tile column (TS
        # adds them inside tileYields) — worked picks, scores and yields all
        # see them; the score adds stay exact (dyadic ints, f64).
        _has_bel = self._civ_only_has_beliefs(r)
        # this city's FOLLOWER-belief id (from its followed religion when the
        # coupling is LIVE, else the owner religion r+1, which is byte-identical
        # to _bel_add's fol term). pan/founder stay per-civ via _bel_add and
        # _bel_add_pf.
        _fol_j = self._follower_id_for(self._civ_city_rel(r)[:, j]) if _has_bel else None
        if _has_bel:
            featP = self._belief_feat_plane(r)
            f_plane = f_plane + featP[:, :, 0]
            p_plane = p_plane + featP[:, :, 1]
            ty_oth = ty_oth + featP
            oth_sc = oth_sc + (featP[:, :, 2:].double() * g["w"][2:].reshape(1, 1, 4)).sum(dim=2)
        f = f_plane.gather(1, tc).double()
        p = p_plane.gather(1, tc).double()
        # the OWNER's mine boosts apply to worked tiles (and via w[1] to the
        # selection score); the neutral plane stays boost-free for cross-owner
        # reads.
        if self._mine_boost_tech.numel() > 0 and self.MINE >= 0:
            boost_r = (self.civ_only_techs[:, r][:, self._mine_boost_tech].to(self.dtype) * self._mine_boost_amt).sum(dim=1).double()
            mine_here = (self.improvement.gather(1, tc) == self.MINE) & ~self.pillaged.gather(1, tc)
            p = p + mine_here.double() * boost_r.unsqueeze(1)
        # tileScore('balanced') = Σ yields · focus_base — food/production from
        # the dynamic (defaultModifiers) planes, the other four columns static.
        # All shipped yields are dyadic (asserted via _dyadic_fp over all six
        # columns), so this sum order is bit-equal to the TS per-key loop.
        w = g["w"]
        s = f * w[0] + p * w[1] + oth_sc.gather(1, tc)
        M = tiles.shape[1]
        # ties break by GLOBAL tile index (assignWorkedTiles' a.index - b.index),
        # NOT window position.
        key = torch.where(valid, s * 1e6 - tiles.double(), torch.tensor(-1e18, dtype=torch.float64, device=self.device))
        kk = M  # no pop cap — a city's pop may exceed the window's tile count
        top_vals, top_idx = key.topk(kk, dim=1)
        # SPECIALISTS. TS merges open specialist slots
        # into the SAME ranking as the tiles and takes the top `population`.
        # Equivalent (and cheaper here): count how many slots outrank the tile
        # they would displace, shrink the tile take by that many, and add their
        # yields. Ties go to TILES because a slot's tie index (>= T) always
        # exceeds any tile index in `s * 1e6 - tileIndex`.
        _pop_j = self.civ_city_pop[:, r, j]
        _nspec, _spec_add = self._civ_city_specialists(r, j, top_vals, _pop_j)
        take = (torch.arange(kk, device=self.device).unsqueeze(0) < (_pop_j - _nspec).clamp(min=0).unsqueeze(1)) & (top_vals > -1e17)
        f_sel = f.gather(1, top_idx) * take.double()
        p_sel = p.gather(1, top_idx) * take.double()
        # science/culture columns ride the same selection (static
        # planes — no dynamic tail touches them in scope); the center's
        # science/culture pass through unclamped like the TS center.
        sc = ty_oth[:, :, 3].gather(1, tc).double()
        cu = ty_oth[:, :, 4].gather(1, tc).double()
        go = ty_oth[:, :, 2].gather(1, tc).double()
        fa = ty_oth[:, :, 5].gather(1, tc).double()
        sc_sel = sc.gather(1, top_idx) * take.double()
        cu_sel = cu.gather(1, top_idx) * take.double()
        go_sel = go.gather(1, top_idx) * take.double()
        fa_sel = fa.gather(1, top_idx) * take.double()
        # center: real floored yields (tileYieldsForCenter) — food after the
        # fertility/drought tail, production from the neutral plane
        sitec = center.clamp(min=0).unsqueeze(1)
        r_ = self.rules
        # A center founded by any seat (reachable here via loyalty flips) was
        # stripped of its removable feature at founding, so its yields must drop
        # exactly ONCE. f_plane/p_plane are ALREADY strip-adjusted above, so
        # cf/cp read them directly; only the static cols 2-5 read the RAW
        # tile_yields and subtract here. Subtracting again on cf/cp would
        # double-strip a flipped center's feature.
        strip = self.feat_stripped.gather(1, sitec).squeeze(1).double()
        fy_c = self.feat_yields.gather(1, sitec.unsqueeze(2).expand(-1, 1, 6)).squeeze(1).double()  # [B, 6]
        cf = torch.maximum(f_plane.gather(1, sitec).squeeze(1).double(), torch.tensor(float(r_.center_min_food), dtype=torch.float64, device=self.device))
        cp = torch.maximum(p_plane.gather(1, sitec).squeeze(1).double(), torch.tensor(float(r_.center_min_production), dtype=torch.float64, device=self.device))
        c_sc = self.tile_yields[:, :, 3].gather(1, sitec).squeeze(1).double() - fy_c[:, 3] * strip
        c_cu = self.tile_yields[:, :, 4].gather(1, sitec).squeeze(1).double() - fy_c[:, 4] * strip
        c_go = self.tile_yields[:, :, 2].gather(1, sitec).squeeze(1).double() - fy_c[:, 2] * strip
        c_fa = self.tile_yields[:, :, 5].gather(1, sitec).squeeze(1).double() - fy_c[:, 5] * strip
        if _has_bel:
            # a LIVE-featured center (e.g. an unremovable floodplain)
            # keeps its belief feature yields — cf/cp read the adjusted
            # planes already; the raw static cols 2-5 add them here.
            featC = featP.gather(1, sitec.unsqueeze(2).expand(-1, 1, 6)).squeeze(1).double()  # [B, 6]
            c_sc = c_sc + featC[:, 3]
            c_cu = c_cu + featC[:, 4]
            c_go = c_go + featC[:, 2]
            c_fa = c_fa + featC[:, 5]
        if self._dyadic_fp:
            # every term is an exact dyadic, so .sum() is bit-identical to
            # the TS reduce
            food = cf + f_sel.sum(dim=1)
            prod = cp + p_sel.sum(dim=1)
            sci = c_sc + sc_sel.sum(dim=1)
            cul = c_cu + cu_sel.sum(dim=1)
            gold = c_go + go_sel.sum(dim=1)
            faith = c_fa + fa_sel.sum(dim=1)
            # the specialists that displaced tiles pay their yields.
            food = food + _spec_add[:, 0]
            prod = prod + _spec_add[:, 1]
            gold = gold + _spec_add[:, 2]
            sci = sci + _spec_add[:, 3]
            cul = cul + _spec_add[:, 4]
            faith = faith + _spec_add[:, 5]
        else:
            food = cf + _spec_add[:, 0]
            prod = cp + _spec_add[:, 1]
            sci = c_sc + _spec_add[:, 3]
            gold = c_go + _spec_add[:, 2]
            faith = c_fa + _spec_add[:, 5]
            cul = c_cu + _spec_add[:, 4]
            for m in range(kk):  # sequential adds mirror the TS loop's rounding
                food = food + f_sel[:, m]
                prod = prod + p_sel[:, m]
                sci = sci + sc_sel[:, m]
                cul = cul + cu_sel[:, m]
        # Petra: +2 food +2 gold +1 production per WORKED desert
        # non-floodplain unpaved tile — POST-selection, exactly like
        # computeCityStats' petraBonus (the score ranks without it; the
        # center carries CITY_CENTER and never qualifies).
        if self._wond_n:
            wreg_p = self.civ_city_wonder[:, r, j]
            compw_p = (wreg_p >= 0) & self.built_wonder_complete.gather(1, wreg_p.clamp(min=0))
            hasP = (compw_p & self._wond_petra.reshape(1, -1)).any(dim=1)
            if bool(hasP.any()):
                sel_tiles = tc.gather(1, top_idx)  # [B, kk] the worked tiles
                qual = (
                    self.desert.gather(1, sel_tiles)
                    & (self.feat_id.gather(1, sel_tiles) != self._fp_fid)
                    & (self.district.gather(1, sel_tiles) < 0)
                    & take
                )
                nq = (qual & hasP.unsqueeze(1)).sum(dim=1).double()
                food = food + 2.0 * nq
                gold = gold + 2.0 * nq
                prod = prod + nq
        # WATER MILL, the per-j twin of the batched term: farm-improved BONUS
        # resources gain +1 food, POST-selection over the worked set like Petra
        # above. Kept structurally identical to _seat_city_yields_all's version
        # so column j stays bit-identical.
        wm_p = self.civ_city_bldg[:, r, j][:, rd.b_farmbonus]  # [B, n]
        if wm_p.numel() and bool(wm_p.any()):
            has_wm = wm_p.any(dim=1)  # [B]
            sel_t = tc.gather(1, top_idx)  # [B, kk]
            elig = (
                (self.improvement.gather(1, sel_t) == self.FARM)
                & (self.res_cat.gather(1, sel_t) == 1)
                & (self.res_imp.gather(1, sel_t) == self.FARM)
            ) & take
            food = food + (elig & has_wm.unsqueeze(1)).sum(dim=1).double()
        # COMPLETED districts add floor(adjacency) into their yield column
        # (cityDistrictYields under empty modifiers; the gold/faith columns have
        # no consumer on this path). Adjacency is recomputed LIVE per city so a
        # completion earlier in this same phase is seen, like TS's sequential
        # loop.
        if self.districts_on:
            reg = self.civ_city_dist_tile[:, r, j]  # [B, nD]
            if bool((reg >= 0).any()):
                for di, dd in enumerate(self.districts_cat):
                    yc = int(dd.get("adjYield", -1))
                    if yc < 0:
                        continue
                    tile_d = reg[:, di]
                    has = mask & (tile_d >= 0)
                    if not bool(has.any()):
                        continue
                    has = has & self.district_complete.gather(1, tile_d.clamp(min=0).unsqueeze(1)).squeeze(1)
                    has = has & ~self.district_pillaged.gather(1, tile_d.clamp(min=0).unsqueeze(1)).squeeze(1)  # pillaged = dark
                    if not bool(has.any()):
                        continue
                    adjf = self._district_adj_floor(di).gather(1, tile_d.clamp(min=0).unsqueeze(1)).squeeze(1).double()  # memoised
                    add = torch.where(has, adjf, torch.zeros_like(adjf))
                    # Work Ethic: Holy Site adjacency ALSO yields production
                    # (the floored-adjacency twin in phase.ts)
                    if di == self._hs_idx and _has_bel:
                        prod = prod + add * self._fol_tab("we", _fol_j)  # per-city follower Work Ethic
                    if yc == 3:
                        sci = sci + add
                    elif yc == 4:
                        cul = cul + add
                    elif yc == 0:
                        food = food + add
                    elif yc == 1:
                        prod = prod + add
                    elif yc == 2:
                        gold = gold + add  # Harbor/Hub adjacency
                    elif yc == 5:
                        faith = faith + add  # Holy Site adjacency
        # building yields under empty modifiers (worship never
        # queues, so the plain def.yields sum matches cityBuildingYields).
        if self.districts_on:
            selb = self.civ_city_bldg[:, r, j] & ~self._civ_city_bdark(self.civ_city_dist_tile[:, r, j]) & ~self._b_regional.reshape(1, -1)  # pillaged-dark; regional buildings are delivered by range
            if bool(selb.any()):
                add6 = selb.double() @ self.rules_dev.b_yields.double()  # [B, 6] (int-valued: dtype roundtrip is exact)
                food = food + add6[:, 0]
                prod = prod + add6[:, 1]
                gold = gold + add6[:, 2]
                faith = faith + add6[:, 5]
                sci = sci + add6[:, 3]
                cul = cul + add6[:, 4]
                # belief building adds (Feed the World / Choral Music —
                # the beliefAdd twin, unscaled, pre-tier like TS)
                if _has_bel:
                    # founder (Stewardship) bldgY stays per-civ; the follower
                    # part (Feed the World / Choral Music) keys per-city. The
                    # building keys are disjoint and the rows integer, so summing
                    # the two einsums is bit-identical to one combined pass.
                    badd = torch.einsum("bn,bnk->bk", selb.double(), self._bel_add_pf("bldgY", r))
                    badd = badd + torch.einsum("bn,bnk->bk", selb.double(), self._fol_tab("bldgY", _fol_j))
                    food = food + badd[:, 0]
                    prod = prod + badd[:, 1]
                    gold = gold + badd[:, 2]
                    sci = sci + badd[:, 3]
                    cul = cul + badd[:, 4]
                    faith = faith + badd[:, 5]
                # the SHIPYARD special: production += the completed Harbor's LIVE
                # floor(adjacency), the twin of yields.ts:171 under empty
                # modifiers (all int-valued, so order-exact in f64).
                if self._harbor_idx >= 0 and self._shipyard_bidx >= 0:
                    hb_tile = self.civ_city_dist_tile[:, r, j, self._harbor_idx]
                    has_sy = mask & selb[:, self._shipyard_bidx] & (hb_tile >= 0)
                    has_sy = has_sy & self.district_complete.gather(1, hb_tile.clamp(min=0).unsqueeze(1)).squeeze(1)
                    if bool(has_sy.any()):
                        hadj = self._district_adj_floor(self._harbor_idx).gather(1, hb_tile.clamp(min=0).unsqueeze(1)).squeeze(1).double()  # memoised
                        prod = prod + torch.where(has_sy, hadj, torch.zeros_like(hadj))
        # PALACE — the civ's FIRST city holds it. civ_city_is_cap mirrors TS's founding
        # grant: capture strips it, nothing relocates or re-grants. Its yields
        # sit at the rc.buildings loop position — integer f64, order-exact.
        _isc_pal = (self.civ_city_is_cap[:, r, j] & mask).double()
        if bool((_isc_pal != 0).any()):
            _pal6 = self._palace_y.double()
            food = food + _pal6[0] * _isc_pal
            prod = prod + _pal6[1] * _isc_pal
            gold = gold + _pal6[2] * _isc_pal
            sci = sci + _pal6[3] * _isc_pal
            cul = cul + _pal6[4] * _isc_pal
            faith = faith + _pal6[5] * _isc_pal
        # regional-building yields — regionalEffects at the city.ts:445-446
        # position (after the local buildings, before the wonder flat yields),
        # pre-tier. Computed LIVE per j, like TS.
        _regional_j = self._seat_regional(r)
        if _regional_j is not None:
            _rj = _regional_j[0][:, j] * mask.double().unsqueeze(1)  # [B, 6]
            food = food + _rj[:, 0]
            prod = prod + _rj[:, 1]
            gold = gold + _rj[:, 2]
            sci = sci + _rj[:, 3]
            cul = cul + _rj[:, 4]
            faith = faith + _rj[:, 5]
        # this city's completed wonders — flat city yields pre-tier
        # (computeCityStats' buildings position) + the belief faithPerWonder.
        compw = None
        if self._wond_n:
            wreg = self.civ_city_wonder[:, r, j]  # [B, nW]
            compw = (wreg >= 0) & self.built_wonder_complete.gather(1, wreg.clamp(min=0))
            if bool(compw.any()):
                wcy = compw.double() @ self._wond_cy  # [B, 6]
                food = food + wcy[:, 0]
                prod = prod + wcy[:, 1]
                gold = gold + wcy[:, 2]
                sci = sci + wcy[:, 3]
                cul = cul + wcy[:, 4]
                faith = faith + wcy[:, 5]
                if _has_bel:
                    faith = faith + self._fol_tab("fpw", _fol_j) * compw.sum(dim=1).double()  # per-city follower Divine Inspiration
        # the founder's capital incomes (perFollowers on the civ's LIVE total pop
        # + perCity) land on the capital BEFORE the tier scaling, at
        # computeCityStats' capitalYields position.
        if _has_bel:
            perF = self._bel_add("perF", r)  # [B, 7] = per, then the 6 yields
            perC = self._bel_add("perC", r)  # [B, 6]
            followers = (self.civ_city_pop[:, r] * self.civ_city_alive[:, r].long()).sum(dim=1).double()
            times = torch.where(perF[:, 0] > 0, torch.floor(followers / perF[:, 0].clamp(min=1)), torch.zeros_like(followers))
            capY = perF[:, 1:] * times.unsqueeze(1) + perC * self.civ_city_alive[:, r].sum(dim=1).double().unsqueeze(1)
            isc = (self.civ_city_is_cap[:, r, j] & mask).double()
            food = food + capY[:, 0] * isc
            prod = prod + capY[:, 1] * isc
            gold = gold + capY[:, 2] * isc
            sci = sci + capY[:, 3] * isc
            cul = cul + capY[:, 4] * isc
            faith = faith + capY[:, 5] * isc
        # government + slotted-policy flat yields (cityYields all cities,
        # capitalYields the capital) — pre-tier, the batched twin's addition.
        _gym = None  # bound only inside the branch below
        if self._gov_has_effects:
            gcity, gcap, _gh, _gym, *_ = self._gov_policy_mods_cached(r, self.civ_only_civics[:, r])  # _gh housing, _gym ymult; slots unconsumed here
            mcell = mask.double()  # [B]
            gisc = (self.civ_city_is_cap[:, r, j] & mask).double()  # [B]
            food = food + gcity[:, 0] * mcell + gcap[:, 0] * gisc
            prod = prod + gcity[:, 1] * mcell + gcap[:, 1] * gisc
            gold = gold + gcity[:, 2] * mcell + gcap[:, 2] * gisc
            sci = sci + gcity[:, 3] * mcell + gcap[:, 3] * gisc
            cul = cul + gcity[:, 4] * mcell + gcap[:, 4] * gisc
            faith = faith + gcity[:, 5] * mcell + gcap[:, 5] * gisc
        # this civ's CS envoy bonuses — the 3/6 tiers land on its tier-1 (>=3) /
        # tier-2 (>=6) BUILDINGS, plus the capital yield at 1+ envoys and the
        # suzerain's per-CS unique perk. Pre-tier, before the trade income.
        if self.S > 0 and bool((self.civ_only_citystate_envoys[:, r] > 0).any()):
            _acs = self.citystate_alive.double()
            _isc = (self.civ_city_is_cap[:, r, j] & mask).double()  # [B]
            # 3/6-envoy BUILDING adds — selb is the per-j civ_city_bldg presence
            # with pillaged-dark + regional-skip, as in the b_yields sum above.
            _cols6 = None
            if self.districts_on:
                selb_cs = self.civ_city_bldg[:, r, j] & ~self._civ_city_bdark(self.civ_city_dist_tile[:, r, j]) & ~self._b_regional.reshape(1, -1)  # [B, NB]
                if bool(selb_cs.any()):
                    _nBc = selb_cs.shape[1]
                    per3 = (self.civ_only_citystate_envoys[:, r] >= 3).double() * self._citystate_district_bonus * _acs * (self._citystate_b1idx >= 0).double()
                    per6 = (self.civ_only_citystate_envoys[:, r] >= 6).double() * self._citystate_district_bonus * _acs * (self._citystate_b2idx >= 0).double()
                    csb6f = torch.zeros(self.B, _nBc * 6, dtype=torch.float64, device=self.device)
                    csb6f.scatter_add_(1, self._citystate_b1idx.clamp(min=0) * 6 + self._citystate_yidx, per3)
                    csb6f.scatter_add_(1, self._citystate_b2idx.clamp(min=0) * 6 + self._citystate_yidx, per6)
                    csb6 = csb6f.reshape(self.B, _nBc, 6)
                    _cs6_j = torch.einsum("bn,bnk->bk", selb_cs.double(), csb6)  # [B, 6]
                    _cols6 = [_cs6_j[:, _k] for _k in range(6)]
            tier1_r = ((self.civ_only_citystate_envoys[:, r] >= 1) & self.citystate_alive).double() * float(self.rules.citystate.get("capitalBonus", 2))
            capb_r = torch.zeros(self.B, 6, dtype=torch.float64, device=self.device)
            capb_r.scatter_add_(1, self._citystate_yidx, tier1_r)
            # suzerain unique perk — this civ's STRICT isSuzerain.
            suz_min = int(self.rules.citystate.get("suzerainEnvoys", 3))
            _oth = self.civ_only_citystate_envoys.clone()
            _oth[:, r] = -1
            civ_only_suz = (self.civ_only_citystate_envoys[:, r] >= suz_min) & (self.civ_only_citystate_envoys[:, r] > self.citystate_envoys) & (self.civ_only_citystate_envoys[:, r] > _oth.max(dim=1).values) & self.citystate_alive
            suz_valr = civ_only_suz.double() * self._citystate_suz_amt * (self.citystate_suz_key >= 0).double()  # [B, S]
            capb_r.scatter_add_(1, self.citystate_suz_key.clamp(min=0), suz_valr)
            if _cols6 is not None:
                food = food + _cols6[0]
                prod = prod + _cols6[1]
                gold = gold + _cols6[2]
                sci = sci + _cols6[3]
                cul = cul + _cols6[4]
                faith = faith + _cols6[5]
            food = food + capb_r[:, 0] * _isc
            prod = prod + capb_r[:, 1] * _isc
            gold = gold + capb_r[:, 2] * _isc
            sci = sci + capb_r[:, 3] * _isc
            cul = cul + capb_r[:, 4] * _isc
            faith = faith + capb_r[:, 5] * _isc
        # outgoing unraided route income — pre-tier, the trade position
        # in computeCityStats (production scales with the tier, food doesn't).
        _route_inc = self._seat_route_income(r)
        if _route_inc is not None:
            m6 = mask.double()
            food = food + _route_inc[:, j, 0] * m6
            prod = prod + _route_inc[:, j, 1] * m6
            gold = gold + _route_inc[:, j, 2] * m6  # CS-route gold/specialty
            sci = sci + _route_inc[:, j, 3] * m6
            cul = cul + _route_inc[:, j, 4] * m6
            faith = faith + _route_inc[:, j, 5] * m6
        # slotted Great Works for city j — culture/turn per work BY KIND,
        # pre-tier; gated by mask so column j matches the batched twin.
        cul = cul + (
            self._gw_cul_k[0] * self.civ_city_gw_writing[:, r, j].double()
            + self._gw_cul_k[1] * self.civ_city_gw_art[:, r, j].double()
            + self._gw_cul_k[2] * self.civ_city_gw_music[:, r, j].double()
        ) * mask.double()
        # RELIC faith, the batched twin's position.
        faith = faith + self._relic_faith * self.civ_city_relics[:, r, j].double() * mask.double()
        # golden PEN, BRUSH AND VOICE, the batched twin's position.
        _pb_j = self._golden_ded(r + 1, self._ded_pen_brush)
        if bool(_pb_j.any()):
            cul = cul + _pb_j.to(cul.dtype) * self._civ_city_spec_count(r)[:, j].to(cul.dtype) * mask.to(cul.dtype)
        # The amenity tier scales the non-food columns, as at computeCityStats'
        # tail. External callers re-rank FRESH; the phase loop passes its
        # loop-top frozen factors.
        # The CITIZENS bucket belongs INSIDE the tier, where computeCityStats
        # puts it: Civ 6 applies the Amenities yield modifier to the city's whole
        # non-food output, so adding these two after `yf` would let citizen
        # science and culture escape the multiplier.
        _popj = self.civ_city_pop[:, r, j].double()
        sci = sci + self.rules.citizen_science * _popj
        cul = cul + self.rules.citizen_culture * _popj
        yf = amen_yf if amen_yf is not None else self._seat_amenity(r)[2][:, j]
        prod = prod * yf
        sci = sci * yf
        cul = cul * yf
        gold = gold * yf
        faith = faith * yf
        # the per-city twin of the civ-level ymult — same position (tier factor,
        # ymult, then wonder multipliers). Both paths must carry it or they
        # disagree with each other.
        if _gym is not None:
            food = food * _gym[:, 0]
            prod = prod * _gym[:, 1]
            gold = gold * _gym[:, 2]
            sci = sci * _gym[:, 3]
            cul = cul * _gym[:, 4]
            faith = faith * _gym[:, 5]
        # the owning city's wonder yield multipliers (Oxford/Big Ben) AFTER the
        # tier scaling — the computeCityStats order. The product runs in
        # wonder-id order, which is the TS registry push order.
        if compw is not None and bool(compw.any()):
            wmm = torch.where(
                compw.unsqueeze(2),
                self._wond_mult.reshape(1, -1, 6).expand(compw.shape[0], -1, -1),
                torch.ones(compw.shape[0], compw.shape[1], 6, dtype=torch.float64, device=self.device),
            ).prod(dim=1)
            food = food * wmm[:, 0]
            prod = prod * wmm[:, 1]
            gold = gold * wmm[:, 2]
            sci = sci * wmm[:, 3]
            cul = cul * wmm[:, 4]
            faith = faith * wmm[:, 5]
        z = torch.zeros_like(food)
        return (
            torch.where(mask, food, z),
            torch.where(mask, prod, z),
            torch.where(mask, sci, z),
            torch.where(mask, cul, z),
            torch.where(mask, gold, z),
            torch.where(mask, faith, z),
        )

    def _seat_regional(self, r: int) -> tuple[torch.Tensor, torch.Tensor] | None:
        """The regionalEffects twin for a civ seat: each regional building owned
        by one of this civ's cities whose source district (civ_city_dist_tile of the
        building's type) is COMPLETE and unpillaged reaches every ALIVE
        same-civ city center within regional_range of the source tile; the
        same building id never stacks (any() over sources). Reads LIVE state
        at call time (the per-j path sees mid-phase completions, like TS).
        Returns ([B, RC, 6] yields, [B, RC] amenities) in f64, or None when
        no city of this civ owns a regional building."""
        if not self._reg_bidx or not self.districts_on:
            return None
        B, RC = self.B, self.RC
        alive = self.civ_city_alive[:, r]
        dt_all = self.civ_city_dist_tile[:, r]  # [B, RC, nD]
        ctrs = self.civ_city_center[:, r].clamp(min=0)  # [B, RC] receiver centers
        y6 = am = None
        for n in self._reg_bidx:
            own_n = self.civ_city_bldg[:, r, :, n] & alive  # [B, RC] source cities
            if not bool(own_n.any()):
                continue
            st = dt_all[:, :, int(self._b_req_district[n])]  # [B, RC] source district tile (-1 none)
            stc = st.clamp(min=0)
            ok = own_n & (st >= 0) & self.district_complete.gather(1, stc) & ~self.district_pillaged.gather(1, stc)  # pillaged source is dark
            if not bool(ok.any()):
                continue
            dd = self.pair_dist[stc.unsqueeze(2), ctrs.unsqueeze(1)]  # [B, RCsrc, RCrecv] int16
            has = (ok.unsqueeze(2) & (dd <= self._regional_range)).any(dim=1) & alive  # [B, RC recv]
            hf = has.double()
            if y6 is None:
                y6 = torch.zeros(B, RC, 6, dtype=torch.float64, device=self.device)
                am = torch.zeros(B, RC, dtype=torch.float64, device=self.device)
            y6 = y6 + hf.unsqueeze(2) * self.rules_dev.b_yields[n].double().reshape(1, 1, 6)
            am = am + hf * float(self.rules.b_amenities[n])
        return None if y6 is None else (y6, am)

    def _seat_amenity(self, r: int) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """The luxuryAmenities twin for a civ seat: each UNIQUE improved luxury on
        THIS civ's territory grants +1 to its luxAmenityCities neediest cities
        (need desc, slot asc = rc.id acquisition order); tier from have − needed,
        with have = local building amenities + regional effects + the capital
        PALACE, and no policy sources. Returns (tier_idx, growth_f, yield_f),
        each [B, RC]."""
        B, RC = self.B, self.RC
        rd = self.rules_dev
        selb_a = self.civ_city_bldg[:, r] & ~self._civ_city_bdark(self.civ_city_dist_tile[:, r]) & ~self._b_regional.reshape(1, 1, -1)  # pillaged-dark; regional buildings are delivered by range
        have = torch.einsum("bjn,n->bj", selb_a.to(torch.float64), rd.b_amenities.double())
        # PALACE amenity on the capital slot — baseHave sums rc.buildings, which
        # hold the founding PALACE, so it joins BEFORE the luxury ranking.
        # CITY_CENTER never pillages.
        have = have + self._palace_amenities * (self.civ_city_is_cap[:, r] & self.civ_city_alive[:, r]).double()
        # regional amenities (Zoo/Stadium) join baseHave BEFORE the luxury
        # ranking — the city.ts:292 mirror.
        _regional = self._seat_regional(r)
        if _regional is not None:
            have = have + _regional[1]
        need = torch.ceil((self.civ_city_pop[:, r].double() - 2) / 2).clamp(min=0)
        out = torch.zeros(B, RC, dtype=torch.float64, device=self.device)
        alive = self.civ_city_alive[:, r]
        if self._n_lux > 0 and self.improvements_on:
            improved = (self.lux_id >= 0) & (self.civ_at == r) & (self.improvement == self.lux_req)
            counts = torch.zeros(B, self._n_lux, dtype=torch.long, device=self.device)
            counts.scatter_add_(1, self.lux_id.clamp(min=0), improved.long())
            rounds = (counts > 0).long().sum(dim=1)
            mx = int(rounds.max().item())
            slot = torch.arange(RC, device=self.device, dtype=torch.float64).reshape(1, RC)
            k = min(self._lux_k, RC)
            for rnd in range(mx):
                act = rounds > rnd
                needr = need - (have + out)
                key = torch.where(alive, needr * 64 - slot, torch.full_like(needr, -1e9))
                top_v, top_i = key.topk(k, dim=1)
                grant = (top_v > -1e8) & act.unsqueeze(1)
                out.scatter_add_(1, top_i, grant.to(torch.float64))
        # this civ's OWN government/policy flat amenities and the newDeal
        # specialty rule — computeCityStats' two arms, sharing
        # `_cond_house_amen` with the seat-0 path.
        _g_amen = _g_nd = None
        if self._gov_has_effects:
            _gm = self._gov_policy_mods_cached(r, self.civ_only_civics[:, r])
            _g_amen, _g_hid, _g_nd = _gm[7], _gm[8], _gm[9]
            _civ_city_all = ((self.civ_city_dist_tile[:, r] >= 0) & self.district_complete.gather(
                1, self.civ_city_dist_tile[:, r].clamp(min=0).reshape(B, -1)).reshape_as(self.civ_city_dist_tile[:, r])).sum(dim=2)
            _, _civ_only_cond_amen = self._cond_house_amen(_g_hid, _g_nd, _civ_city_all, self._civ_city_spec_count(r))
            have = have + _g_amen.unsqueeze(1) + _civ_only_cond_amen
        if self._civ_only_has_beliefs(r):
            # River Goddess (river centers) + Zen Meditation (2+ completed
            # specialty districts) join the TIER balance ONLY — the luxury-grant
            # RANKING stays building-amenities-based.
            ctr = self.civ_city_center[:, r].clamp(min=0)
            extra = self._bel_add("river", r)[:, 0].unsqueeze(1) * self.tile_river.gather(1, ctr).double()
            # Zen Meditation keys per-city on the followed religion's follower
            # belief (the owner religion when uncoupled: byte-identical).
            zen_rc = self._fol_tab("zen", self._follower_id_for(self._civ_city_rel(r)))  # [B, RC, 2] = min, amenities
            zmin, zamt = zen_rc[:, :, 0], zen_rc[:, :, 1]  # each [B, RC]
            if bool((zamt != 0).any()):
                dt_ = self.civ_city_dist_tile[:, r]
                comp_ = (dt_ >= 0) & self.district_complete.gather(1, dt_.clamp(min=0).reshape(B, -1)).reshape_as(dt_)
                spec_ = (comp_ & self._is_specialty.reshape(1, 1, -1)).sum(dim=2).double()
                extra = extra + torch.where(spec_ >= zmin, zamt, torch.zeros_like(spec_))
            balance = have + out + extra - need
        else:
            balance = have + out - need
        # war-weariness drag, subtracted from the tier balance after the luxury
        # grants — the same position every seat uses.
        balance = balance - self._ww_penalty(r + 1, torch.float64).unsqueeze(1)
        growth_f, yield_f = self._amenity_factors(balance)
        tier_idx = torch.full_like(self.civ_city_pop[:, r], len(self.rules.amenity_tiers) - 1)
        for i in reversed(range(len(self.rules.amenity_tiers))):
            tier_idx = torch.where(balance >= self.rules.amenity_tiers[i][0], torch.full_like(tier_idx, i), tier_idx)
        return tier_idx, growth_f.double(), yield_f.double()

    def _transfer_rc_to_rc(self, b: int, civ_only_from: int, j: int, civ_only_to: int) -> None:
        """A loyalty flip between civ seats — pop ×0.75 floor 1, fresh boxes,
        CITY_CENTER-only registry, half HP, and the city's own tiles re-tag
        through the tile_city registry. The loser slot dies with full
        queue/registry hygiene."""
        # taking a civ's city earns GRIEVANCES.
        self.civ_only_warmonger[b, civ_only_to] += self._wm_cap
        c_t = int(self.civ_city_center[b, civ_only_from, j])
        old_pop = int(self.civ_city_pop[b, civ_only_from, j])
        old_acq = int(self.civ_city_acquired[b, civ_only_from, j])
        # conquest keeps infrastructure — snapshot the flipping city's
        # district/wonder/building registries BEFORE the loser-slot hygiene wipes
        # them. The tiles do not move, so the registry indices stay valid for the
        # receiving slot.
        b30_dist = self.civ_city_dist_tile[b, civ_only_from, j, :].clone()
        b30_wond = self.civ_city_wonder[b, civ_only_from, j, :].clone()
        b30_bldg = self.civ_city_bldg[b, civ_only_from, j, :].clone()
        # GREAT WORKS AND RELICS RIDE WITH THE CITY: the victor gains control of
        # the Great Works held in a captured city's buildings/districts/wonders,
        # and those buildings (the Amphitheater / Museum / Temple slots holding
        # them) are exactly what b30_bldg carries. Snapshot them alongside the
        # registries above, for the same reason.
        b20_gww = int(self.civ_city_gw_writing[b, civ_only_from, j])
        b20_gwa = int(self.civ_city_gw_art[b, civ_only_from, j])
        b20_gwm = int(self.civ_city_gw_music[b, civ_only_from, j])
        b20_rel = int(self.civ_city_relics[b, civ_only_from, j])
        b20_art = int(self.civ_city_artifacts[b, civ_only_from, j])
        self.civ_city_alive[b, civ_only_from, j] = False
        # SLOT HYGIENE: the dead slot must not keep a work count. `slot =
        # occ.max() + 1` REUSES indices and nothing else clears these five, so a
        # later city landing on this index would inherit a DEAD city's works and
        # relics.
        self.civ_city_gw_writing[b, civ_only_from, j] = 0
        self.civ_city_gw_art[b, civ_only_from, j] = 0
        self.civ_city_gw_music[b, civ_only_from, j] = 0
        self.civ_city_relics[b, civ_only_from, j] = 0
        self.civ_city_artifacts[b, civ_only_from, j] = 0
        self.civ_city_is_cap[b, civ_only_from, j] = False  # identity dies with the slot
        self.civ_city_dist_tile[b, civ_only_from, j, :] = -1
        self.civ_city_wonder[b, civ_only_from, j, :] = -1
        self.civ_city_bldg[b, civ_only_from, j, :] = False
        self.civ_city_outer_hp[b, civ_only_from, j] = 0
        self.civ_city_current[b, civ_only_from, j] = -1
        self.civ_city_cost[b, civ_only_from, j] = 0
        self.civ_city_progress[b, civ_only_from, j] = 0
        self.civ_city_qtile[b, civ_only_from, j] = -1
        # relocatePalace(from.cities) — the loser re-crowns immediately after its
        # city list loses the slot, before the route prune and territory re-tag,
        # matching the TS order.
        self._relocate_palace(
            torch.tensor([b], dtype=torch.long, device=self.device),
            torch.tensor([civ_only_from + 1], dtype=torch.long, device=self.device),
        )
        # exactly the flipping city's tiles re-tag (registry scan). civ_city_id is read
        # before the hygiene writes; the slot's id field is never reset on death.
        id_from = int(self.civ_city_id[b, civ_only_from, j])
        own_t = (self.tile_city[b] == id_from) & (self.civ_at[b] == civ_only_from)
        # the loser's routes die with their endpoint; the receiver starts
        # route-less (the from.tradeRoutes filter twin).
        kill = (self.civ_only_routes[b, civ_only_from, :, 0] == id_from) | (self.civ_only_routes[b, civ_only_from, :, 1] == id_from)
        self.civ_only_routes[b, civ_only_from][kill] = -1
        self.civ_only_route_dest[b, civ_only_from][kill] = -1
        self.civ_only_route_exp[b, civ_only_from][kill] = -1
        self.tile_seat[b] = torch.where(own_t, torch.full_like(self.tile_seat[b], civ_only_to + 1), self.tile_seat[b])  # tile ownership lives in tile_seat
        self._tile_owner_ver += 1  # one storage: nothing else to retag
        # re-tagged tiles register to the receiving rc (its id is
        # assigned below from civ_only_next_city_id — same value, read here first)
        self.tile_city[b] = torch.where(own_t, torch.full_like(self.tile_city[b], int(self.civ_only_next_city_id[b, civ_only_to])), self.tile_city[b])
        occ = self.civ_city_alive[b, civ_only_to].nonzero(as_tuple=True)[0]
        slot = int(occ.max()) + 1 if len(occ) else 0
        assert slot < self.RC, "civ city slots exhausted - raise RC (compaction already ran; this is true living capacity)"
        self.civ_city_alive[b, civ_only_to, slot] = True
        self.era_score[b, civ_only_to + 1] += self._era_pts["conquer"]  # gained a city
        if self.fog_of_war:  # the captor reveals around the taken city (revealAround r3)
            self.seat_explored[b, civ_only_to + 1] |= self.pair_dist[c_t] <= 3
        self.civ_city_is_cap[b, civ_only_to, slot] = False  # a transferred city is never a capital
        self.civ_city_center[b, civ_only_to, slot] = c_t
        self.civ_city_pop[b, civ_only_to, slot] = max(1, (old_pop * 3) // 4)
        self.civ_city_growth[b, civ_only_to, slot] = 0
        self.civ_city_cbox[b, civ_only_to, slot] = 0
        self.civ_city_gw_writing[b, civ_only_to, slot] = b20_gww  # works ride with the city
        self.civ_city_gw_art[b, civ_only_to, slot] = b20_gwa
        self.civ_city_gw_music[b, civ_only_to, slot] = b20_gwm
        self.civ_city_relics[b, civ_only_to, slot] = b20_rel
        self.civ_city_artifacts[b, civ_only_to, slot] = b20_art
        self.civ_city_loyalty[b, civ_only_to, slot] = 100.0
        self.civ_city_acquired[b, civ_only_to, slot] = old_acq
        self.civ_city_hp[b, civ_only_to, slot] = round(self.rules.seats.get("cityMaxHp", 200) / 2)
        self.civ_city_current[b, civ_only_to, slot] = -1
        self.civ_city_progress[b, civ_only_to, slot] = 0
        self.civ_city_cost[b, civ_only_to, slot] = 0
        self.civ_city_qtile[b, civ_only_to, slot] = -1
        # adopt the flipping city's districts, wonders and buildings (registry
        # indices carried verbatim — the tiles stay put). ANCIENT_WALLS rides
        # along with the outer pool reset to 0; it heals back, since the heal
        # gate reads civ_city_bldg's walls bit.
        self.civ_city_dist_tile[b, civ_only_to, slot, :] = b30_dist
        self.civ_city_wonder[b, civ_only_to, slot, :] = b30_wond
        self.civ_city_bldg[b, civ_only_to, slot, :] = b30_bldg
        self.civ_city_outer_hp[b, civ_only_to, slot] = 0  # walls (if any) kept at outer pool 0
        self.civ_city_id[b, civ_only_to, slot] = int(self.civ_only_next_city_id[b, civ_only_to])
        self.civ_only_next_city_id[b, civ_only_to] += 1
        self.centre_slot_at[b, c_t] = slot
        self._eff_version += 1

    def _seat_border_key(self, r: int, j: int, center: torch.Tensor):
        """The SHARED border-candidate pick key for rc slot j — dist asc, resource
        priority desc, milli-rounded yield sum desc, global tile index asc (the
        pickBorderTile twin). Factored out so the CULTURE claim
        (_seat_border_growth) and the GOLD tile purchase use ONE construction and
        cannot drift apart. Loop-invariant: claims mutate ownership only, never
        the key. Returns (tiles, tc, nbs, key0)."""
        B = self.B
        _bmul = self._bel_mul("border", r) if self._civ_only_has_beliefs(r) else None
        tiles = tiles_from_offsets(center, self._off5, self.W, self.H)  # [B, M]
        tc = tiles.clamp(min=0)
        nbs = self.neigh[tc.reshape(-1)].reshape(B, -1, 6)  # [B, M, 6]
        g = self._rcy_globals()
        f_plane = self._rcy_food_plane(r, g)
        p_plane = g["p_plane"]
        if self._mine_boost_tech.numel() > 0 and self.MINE >= 0:
            boost_r = (self.civ_only_techs[:, r][:, self._mine_boost_tech].to(self.dtype) * self._mine_boost_amt).sum(dim=1)
            p_plane = p_plane + ((self.improvement == self.MINE) & ~self.pillaged).to(self.dtype) * boost_r.unsqueeze(1)
        y_oth = (self.tile_yields[:, :, 2:] - self.feat_yields[:, :, 2:] * g["fs"].unsqueeze(-1)).sum(dim=2)
        # CAMP/PLANTATION catalog gold joins the border ySum: tileYields carries
        # it, and orphaned improvements DO reach frontier candidates after a
        # raze.
        if self.improvements_on:
            live_imp = ((self.improvement >= 0) & ~self.pillaged).to(self.dtype)
            y_oth = y_oth + self._imp_yields[self.improvement.clamp(min=0), 2:].sum(dim=2) * live_imp
            # the resort's appeal-gold rides the border pick key too.
            if self.SEASIDE >= 0:
                y_oth = y_oth + self._tile_appeal().clamp(min=0).to(self.dtype) * (
                    (self.improvement == self.SEASIDE).to(self.dtype) * live_imp
                )
        if _bmul is not None or self._civ_only_has_beliefs(r):
            # belief featureYields ride the pick key too — pickBorderTile's ctx
            # carries the seat's modifiers
            featP = self._belief_feat_plane(r)
            f_plane = f_plane + featP[:, :, 0]
            p_plane = p_plane + featP[:, :, 1]
            y_oth = y_oth + featP[:, :, 2:].sum(dim=2)
        # tileYields returns ZERO for a paved tile (yields.ts:37), and an
        # orphaned district from a razed city CAN be an unowned candidate, so
        # the district/wonder mask must zero the key here.
        y_sum = (f_plane.double() + p_plane.double() + y_oth.double()).gather(1, tc) * ((self.district.gather(1, tc) < 0) & (self.built_wonder.gather(1, tc) < 0)).to(torch.float64)
        # the key every seat uses: dist asc, res priority desc, milli-rounded
        # yield sum desc, global tile index asc. Priority reads LIVE — a paved
        # bonus resource is gone.
        d = self.pair_dist[center.unsqueeze(1), tc].to(self.dtype)
        key0 = (
            d * 1e12
            - (self.res_priority * (~self.res_stripped).long()).gather(1, tc).to(self.dtype) * 1e9
            - torch.round(y_sum * 1000) * 1e4
            + tiles.to(self.dtype)
        )
        return tiles, tc, nbs, key0

    def _seat_border_growth(self, r: int, j: int, cact: torch.Tensor, cul_c: torch.Tensor) -> None:
        """Cultural border growth for rc slot j — box += this city's culture, then
        consume against _border_cost using the shared pick key (dist asc,
        resource priority desc, yield-sum desc, index asc; radius 5; fully
        unowned tiles, with water, impassables and natural wonders all claimable
        like borderCandidates). The yield sum uses the CIV's planes:
        strip-adjusted food/prod plus its own farm-adjacency and mine boosts.
        Adjacency is PER-CITY via the tile_city registry, mirroring
        borderCandidates' n.cityId === city.id check."""
        self.civ_city_cbox[:, r, j] = torch.where(cact, self.civ_city_cbox[:, r, j] + cul_c, self.civ_city_cbox[:, r, j])
        B = self.B
        center = self.civ_city_center[:, r, j]
        # Religious Settlements — Math.round(base * borderCostMult), the
        # city.ts:507 form. Without beliefs the mult is 1 and js_round of the
        # integral base curve is exact, so the expression is unchanged.
        _bmul = self._bel_mul("border", r) if self._civ_only_has_beliefs(r) else None
        def _civ_city_cost():
            base = self._border_cost(self.civ_city_acquired[:, r, j])
            return js_round(base * _bmul) if _bmul is not None else base
        # most calls have no border-ready city — bail before building anything
        # (the loop re-checks per claim).
        if not bool((cact & (self.civ_city_cbox[:, r, j] >= _civ_city_cost())).any()):
            return
        # claims only mutate OWNERSHIP, so the candidate window, the civ ySum
        # plane and the pick key are loop-invariant and are built ONCE. The
        # strip-adjusted planes come from the shared cache — the same
        # construction _seat_city_yields scores worked tiles with, bit-equal to
        # tileYields under modifiersFromResearch since all shipped yields are
        # dyadic.
        tiles, tc, nbs, key0 = self._seat_border_key(r, j, center)
        unowned = None  # window planes dense once, then incremental per claim
        adj_own = None
        for _ in range(64):  # the TS while-loop: multiple claims per turn, escalating cost
            cost = _civ_city_cost()  # belief border multiplier applied
            ready = cact & (self.civ_city_cbox[:, r, j] >= cost)
            if not bool(ready.any()):
                return
            if unowned is None:
                unowned = (self.owner.gather(1, tc) < 0) & (self.citystate_at.gather(1, tc) < 0) & (self.civ_at.gather(1, tc) < 0)
                # adjacency is PER-CITY — the neighbor must belong to THIS rc's
                # registry, as pickBorderTile requires. civ_at alone would let a
                # city claim across a sibling's frontier.
                nb_flat = nbs.clamp(min=0).reshape(B, -1)
                adj_own = (
                    (self.civ_at.gather(1, nb_flat).reshape(B, -1, 6) == r)
                    & (self.tile_city.gather(1, nb_flat).reshape(B, -1, 6) == self.civ_city_id[:, r, j].reshape(B, 1, 1))
                    & (nbs >= 0)
                ).any(dim=2)
            ok = (tiles >= 0) & unowned & adj_own & ready.unsqueeze(1)
            key = torch.where(ok, key0, self._inf_f)
            best = key.argmin(dim=1)
            has_cand = ok.any(dim=1)
            claim = ready & has_cand
            if bool(claim.any()):
                rows = claim.nonzero(as_tuple=True)[0]
                spot = tiles[rows, best[rows]]
                self.tile_seat[rows, spot] = r + 1  # tile ownership lives in tile_seat
                self._tile_owner_ver += 1  # one storage: nothing else to retag
                self.tile_city[rows, spot] = self.civ_city_id[rows, r, j]  # claim registers to THIS city
                self._reveal_around(rows, r + 1, spot, 1)  # acquireTile's revealAround(seat, tile, 1)
                # invalidate the batched-yields cache ONLY if this claim
                # can change a later column — i.e. the spot lands inside a
                # LATER same-civ city's radius-3 worked window (columns <= j
                # are already consumed this turn; padding -1 never matches a
                # real spot >= 0). Cross-civ claims can't flip a valid bit.
                if j + 1 < self.RC:
                    _win = self._rcy_globals().get("win_r", {}).get(r)
                    if _win is None or bool((_win[rows, j + 1 :, :] == spot.reshape(-1, 1, 1)).any()):
                        self._claim_version += 1
                self.civ_city_acquired[rows, r, j] += 1
                self.civ_city_cbox[rows, r, j] -= cost[rows]
                # only civ_at[spot] changed (-1 → r, per the unowned gate). The
                # spot leaves the unowned plane and window tiles ADJACENT to it
                # gain r-adjacency — the same booleans a dense re-derive would
                # produce, since owner/citystate_at never move in-loop.
                unowned[rows, best[rows]] = False
                nb_s = self.neigh[spot]  # [n, 6]
                adj_hit = ((tiles[rows].unsqueeze(2) == nb_s.unsqueeze(1)) & (nb_s >= 0).unsqueeze(1)).any(dim=2)  # [n, M]
                adj_own[rows] = adj_own[rows] | adj_hit
            capped = ready & ~has_cand
            if bool(capped.any()):
                # Nowhere to grow: cap the box at the current threshold.
                self.civ_city_cbox[:, r, j] = torch.where(capped, torch.minimum(self.civ_city_cbox[:, r, j], cost), self.civ_city_cbox[:, r, j])
            if not bool(claim.any()):
                return

    def _found_civ_city_at(self, r: int, want: torch.Tensor, tile: torch.Tensor) -> torch.Tensor:
        """FOUND a city for civ r at `tile` [B] where `want` — the FOUND_CITY
        verb's mutation. Legality is the site scan's per-candidate gate applied
        at the settler's tile. The settler unit is consumed by the CALLER.
        Returns the games that founded."""
        B = self.B
        sr = self.rules.seats
        tc = tile.clamp(min=0)
        unowned = (
            (self.owner.gather(1, tc.unsqueeze(1)).squeeze(1) < 0)
            & (self.citystate_at.gather(1, tc.unsqueeze(1)).squeeze(1) < 0)
            & (self.civ_at.gather(1, tc.unsqueeze(1)).squeeze(1) < 0)
        )
        okt = (
            (tile >= 0) & unowned
            & self.settle_ok.gather(1, tc.unsqueeze(1)).squeeze(1)
            & (self.civ_city_at.gather(1, tc.unsqueeze(1)).squeeze(1) < 0)
            & (self.district.gather(1, tc.unsqueeze(1)).squeeze(1) < 0)
            & (self.built_wonder.gather(1, tc.unsqueeze(1)).squeeze(1) < 0)
        )
        # tooClose (CITY_MIN_DIST = 4) against every centre.
        d_pl = torch.where(self.alive, self.pair_dist[tc.unsqueeze(1), self.site.clamp(min=0)].to(torch.long), 999)
        d_cs = torch.where(
            self.citystate_alive, self.pair_dist[tc.unsqueeze(1), self.citystate_center.clamp(min=0)].to(torch.long),
            torch.full_like(self.citystate_center, 999),
        )
        civ_city_flat = self.civ_city_center.reshape(B, -1)
        civ_city_live = self.civ_city_alive.reshape(B, -1)
        d_rc = torch.where(civ_city_live, self.pair_dist[tc.unsqueeze(1), civ_city_flat.clamp(min=0)].to(torch.long), 999)
        found = (
            want & okt
            & (d_pl.min(dim=1).values >= 4)
            & (d_cs.min(dim=1).values >= 4)
            & (d_rc.min(dim=1).values >= 4)
        )
        best_site = torch.where(found, tile, torch.full_like(tile, -1))
        if not bool(found.any()):
            return found
        rows = found.nonzero(as_tuple=True)[0]
        if not bool(found.any()):
            return
        rows = found.nonzero(as_tuple=True)[0]
        # The alive COUNT is NOT a free slot once a capture punches a hole
        # mid-pool — it would land on a live city and overwrite it. TS appends,
        # so the mirror is last-alive+1: new cities iterate LAST, matching the
        # array order, and holes stay holes until reclamation.
        occ_idx = torch.arange(self.RC, device=self.device).reshape(1, -1)
        slot = (torch.where(self.civ_city_alive[rows, r], occ_idx, torch.full_like(occ_idx, -1)).max(dim=1).values + 1)
        assert int(slot.max()) < self.RC, "civ city slots exhausted — raise RC (compaction already ran; this is true living capacity)"
        self._reveal_around(rows, r + 1, best_site[rows], 3)  # foundCityAt's revealAround(seat, tile, 3)
        s_idx = best_site[rows]
        # isCapital = civ.cities.length === 0: a total-collapse refound re-crowns
        # and updates capitalTiles[r+1]; every other settle founds a
        # non-capital.
        new_cap = ~self.civ_city_alive[rows, r].any(dim=1)
        self.civ_city_alive[rows, r, slot] = True
        self.era_score[rows, r + 1] += self._era_pts["found"]  # the founding moment
        self.civ_city_is_cap[rows, r, slot] = new_cap
        self.civ_only_cap_tile[rows, r] = torch.where(new_cap, s_idx, self.civ_only_cap_tile[rows, r])
        self.civ_city_center[rows, r, slot] = s_idx
        self.civ_city_pop[rows, r, slot] = 1
        self.civ_city_growth[rows, r, slot] = 0
        self.civ_city_cbox[rows, r, slot] = 0
        # A NEWLY FOUNDED city starts with NO religion. `city_pressure` and
        # `city_followed` are indexed by SLOT and the per-turn block only zeroes
        # slots that are NOT alive, so a slot handed straight from a dead city to
        # a new one would inherit the previous occupant's accumulated pressure.
        # TS builds a fresh City with empty `religionPressure` and null
        # `followedReligion`, so these two writes are required.
        #
        # TRANSFERS deliberately do NOT reset: a transfer moves the existing city
        # and its pressure travels with it.
        self.city_pressure[rows, r + 1, slot, :] = 0
        self.city_followed[rows, r + 1, slot] = -1
        self.civ_city_prod_bank[rows, r, slot] = 0  # same slot-inheritance risk
        self.civ_city_gw_writing[rows, r, slot] = 0  # a fresh city holds no works
        self.civ_city_gw_music[rows, r, slot] = 0
        self.civ_city_loyalty[rows, r, slot] = 100.0
        self.civ_city_acquired[rows, r, slot] = 0
        self.civ_city_hp[rows, r, slot] = sr.get("cityMaxHp", 200)
        self.civ_city_current[rows, r, slot] = -1
        self.civ_city_progress[rows, r, slot] = 0
        self.civ_city_cost[rows, r, slot] = 0
        self.civ_city_qtile[rows, r, slot] = -1
        self.civ_city_dist_tile[rows, r, slot, :] = -1
        self.civ_city_wonder[rows, r, slot, :] = -1
        self.civ_city_bldg[rows, r, slot, :] = False
        self.civ_city_id[rows, r, slot] = self.civ_only_next_city_id[rows, r]
        _new_cid = self.civ_only_next_city_id[rows, r].clone()  # this city's persistent id
        self.civ_only_next_city_id[rows, r] += 1
        self.centre_slot_at[rows, s_idx] = slot
        self.tile_seat[rows, s_idx] = r + 1  # tile ownership lives in tile_seat
        self._tile_owner_ver += 1  # one storage: nothing else to retag
        self.tile_city[rows, s_idx] = _new_cid
        # Founding strips like foundCity: the removable feature dies (tdef drops
        # to the hills component, feature yields vanish via feat_stripped, the
        # lent district adjacency withdraws) and the improvement dies with it.
        # `fresh_f` guards idempotence — an already-CHOPPED tile has nothing left
        # to withdraw, and t0 capitals bake the strip into the exported statics.
        # An UNREMOVABLE feature (oasis/floodplains) SURVIVES the founding, so
        # both writes gate on feat_removable: a blanket strip would starve
        # _belief_feat_plane of yields TS still pays.
        frm_f = self.feat_removable[rows, s_idx]
        self.tdef[rows, s_idx] = torch.where(frm_f, self.hills[rows, s_idx].long() * 3, self.tdef[rows, s_idx])
        self.tmove[rows, s_idx] = torch.where(frm_f, self.hills[rows, s_idx].long() * 3, self.tmove[rows, s_idx])  # a stripped feature does not slow movement
        fresh_f = ~self.feat_stripped[rows, s_idx] & frm_f
        self.feat_stripped[rows, s_idx] |= frm_f
        self.improvement[rows, s_idx] = -1
        # Founding does NOT clear tile.pillaged: a pillaged farm's flag survives
        # the founding — the improvement dies, the flag stays, and later readers
        # see it.
        contrib = self._feat_adj[rows, s_idx] * fresh_f.unsqueeze(1).to(self._feat_adj.dtype)  # [R, nD]
        nb = self.neigh[s_idx]
        for d in range(6):
            n_d = nb[:, d]
            ndc = n_d.clamp(min=0)
            on_map = n_d >= 0
            if bool(on_map.any()):
                om = on_map.nonzero(as_tuple=True)[0]
                self.d_static_adj[rows[om], n_d[om], :] -= contrib[om]
            free = (
                # the full first ring, water included, mirroring foundCity — a
                # coastal city must own its harbor water or the Harbor line is
                # unreachable
                on_map
                & (self.owner[rows, ndc] < 0)
                & (self.citystate_at[rows, ndc] < 0)
                & (self.civ_at[rows, ndc] < 0)
            )
            self.tile_seat[rows[free], n_d[free]] = r + 1  # tile ownership lives in tile_seat
            self._tile_owner_ver += 1  # one storage: nothing else to retag
            self.tile_city[rows[free], n_d[free]] = _new_cid[free]  # ring joins the founder's registry
        self._eff_version += 1  # feat_stripped / d_static_adj changed

    def _hostile_vs_unit(self, att: torch.Tensor, tgt: torch.Tensor, atk_kind: str, u: int) -> None:
        """Shared melee resolution for a hostile attacker (barb slot u of
        u_/barb maps, or civ slot u of v_/rv maps) striking the units on
        tile tgt: military defender takes defender-first rolls with terrain
        defense and the victor-survives rule; a lone civilian dies without a
        roll; the attacker advances into an emptied tile."""
        if atk_kind == "barb":
            a_hp, a_tile = self.barb_unit_hp, self.barb_unit_tile
            a_occ, a_lo = self.military_at, simbase.SEAT0_POOL_MAX + simbase.POOL_MAX
            a_alive = self.barb_unit_alive
            atk_cs_all = self._type_combat[self.barb_unit_type[:, u]]
        else:
            a_hp, a_tile = self.civ_unit_hp, self.civ_unit_tile
            a_occ, a_lo = self.military_at, simbase.SEAT0_POOL_MAX
            a_alive = self.civ_unit_alive
            atk_cs_all = self._type_combat[self.civ_unit_type[:, u]]
        ttc = tgt.clamp(min=0)
        here = a_tile[:, u]
        # the tile's military and civilian occupants, by MERGED slot and SEAT.
        # Eligibility is asymmetric on purpose: a barbarian is never hostile to a
        # barbarian; a CIV attacker always targets seat-0 units (this is only
        # reached from the war act) but its civ targets are ENEMY AT-WAR civs
        # only — the symmetric unitsHostile, never its own civ.
        mslot_raw = self.military_at.gather(1, ttc.unsqueeze(1)).squeeze(1)
        cslot_raw = self.civilian_at.gather(1, ttc.unsqueeze(1)).squeeze(1)
        neg = torch.full_like(mslot_raw, -1)
        m_seat = torch.where(mslot_raw >= 0, self.unit_seat.gather(1, mslot_raw.clamp(min=0).unsqueeze(1)).squeeze(1), neg)
        c_seat = torch.where(cslot_raw >= 0, self.unit_seat.gather(1, cslot_raw.clamp(min=0).unsqueeze(1)).squeeze(1), neg)
        is_rv_m = (m_seat > 0) & (m_seat != BARB_SEAT)
        is_rv_c = (c_seat > 0) & (c_seat != BARB_SEAT)
        a_seat_h = BARB_SEAT if atk_kind == "barb" else self.civ_unit_seat[:, u].unsqueeze(1)
        ok_m = self._seats_hostile(a_seat_h, m_seat.unsqueeze(1)).squeeze(1)
        ok_c = self._seats_hostile(a_seat_h, c_seat.unsqueeze(1)).squeeze(1)
        d_slot = torch.where(ok_m, mslot_raw, torch.where(ok_c, cslot_raw, neg))
        def_is_barb = ok_m & (m_seat == BARB_SEAT)
        def_is_rv = ok_m & is_rv_m
        mil_att = att & ok_m
        civ_att = att & ~ok_m & ok_c & (c_seat == 0)
        vciv_att = att & ~ok_m & ok_c & is_rv_c  # lone civ civilian
        # POOL-LOCAL slots for the capture branches below, which address the
        # p_/v_ ranges directly rather than through the merged pool.
        dc_ = torch.where(ok_c & (c_seat == 0), cslot_raw - self.POOL_LO["seat0"], neg)
        dvc = torch.where(ok_c & is_rv_c, cslot_raw - self.POOL_LO["civ"], neg)
        if bool(mil_att.any()):
            ds0 = d_slot.clamp(min=0)
            d_type = self.unit_type.gather(1, ds0.unsqueeze(1)).squeeze(1)
            def_fort = self.unit_fortify.gather(1, ds0.unsqueeze(1)).squeeze(1) * 3
            # defender veterancy — the vectorized form of `caps.xp`. Barbs hold 0
            # in the merged plane, which _check_seat_invariant proves every step
            # under CIV6_ALIAS_CHECK=1, so this gate is belt-and-braces.
            def_xp = torch.where(
                def_is_barb, torch.zeros_like(mslot_raw),
                self._xp_lvl_bonus(self.unit_xp.gather(1, ds0.unsqueeze(1)).squeeze(1)),
            )
            def_cs = self._type_combat[d_type] + self._tdef_g(ttc) + def_fort + def_xp
            # an EMBARKED defender overrides to a flat CS, no
            # terrain/fortify/support (barbs never embark, so one merged plane
            # covers all three pools).
            d_emb = self.unit_emb.gather(1, ds0.unsqueeze(1)).squeeze(1) & ok_m
            def_cs = torch.where(d_emb, torch.full_like(def_cs, self._embarked_defense_cs), def_cs)
            # attacker AND defender fight at HP-reduced strength.
            def_hp = self.unit_hp.gather(1, ds0.unsqueeze(1)).squeeze(1)
            # attacker veterancy, gated on the attacking class's `caps.xp` — one
            # table, never a hardcoded pool name.
            atk_lvl5 = (self._xp_lvl_bonus(self.civ_unit_xp[:, u]) if SEAT_CAPS[POOL_CLASS[atk_kind]]["xp"]
                        else torch.zeros_like(a_hp[:, u]))
            atk_e = atk_cs_all - self._wound(a_hp[:, u]) - 5.0 * self._river_cross(here, tgt) + atk_lvl5  # wound + river + veterancy
            def_e = def_cs - self._wound(def_hp)
            # flanking helps the hostile attacker (barb/civ at `here`), support
            # helps the defender, whichever seat it belongs to.
            d_seat_m = torch.where(ok_m, m_seat, neg)
            _dciv = torch.where(def_is_rv, d_seat_m - 1, neg)  # civ index, else -1
            _fl, _sp = self._flank_support(tgt, d_seat_m, here)
            atk_e = atk_e + FLANKING_CS * _fl
            def_e = def_e + SUPPORT_CS * torch.where(d_emb, torch.zeros_like(_sp), _sp)  # embarked → no support
            # enhancer adders — a CIV attacker gets the attack terms (Just War
            # near + Crusade onto following territory); a CIV defender gets the
            # defense terms (embarked = flat, none). Barbs and seat-0 units carry
            # no religion here.
            if atk_kind == "civ":
                atk_e = atk_e + (self._rel_atk_cs(self.civ_unit_civ[:, u], tgt).to(atk_e.dtype))  # unit-vs-unit: never city-gated
            def_e = def_e + torch.where(d_emb, torch.zeros_like(def_e), self._rel_def_cs(torch.where(def_is_rv, _dciv, torch.full_like(_dciv, -1)), tgt).to(def_e.dtype))
            # Great General / Admiral aura. Attacker keyed on its own tile `here`
            # (a CIV attacker gets its civ's aura; a BARB has none); defender
            # keyed on `tgt` — seat 0, a civ seat, or barb (-1). Embarked/naval →
            # the ADMIRAL (sea) plane, NOT zeroed for embarked: generalAuraCS
            # gives an embarked defender the admiral aura on top of its flat CS.
            if atk_kind == "civ":
                atk_naval = self.unit_naval[self.civ_unit_type[:, u].clamp(min=0, max=self.NU - 1)] | self.civ_unit_emb[:, u]
                atk_e = atk_e + self._gen_aura_cs(self.civ_unit_civ[:, u] + 1, here, atk_naval).to(atk_e.dtype)
            def_naval = d_emb | (~def_is_barb & self.unit_naval[d_type.clamp(min=0, max=self.NU - 1)])
            def_civ_u = torch.where(def_is_barb, neg, d_seat_m)
            def_e = def_e + self._gen_aura_cs(def_civ_u, tgt, def_naval).to(def_e.dtype)
            _wwh = self._ww_occ(tgt)
            _wwd = self._tile_mil_seat(tgt)  # the defender, before it falls
            if atk_kind == "civ":
                self.civ_unit_xp[:, u] = torch.where(mil_att, self.civ_unit_xp[:, u] + XP_ATTACK, self.civ_unit_xp[:, u])
            rows, def_dead, atk_dead = self._melee_exchange(
                mil_att, tgt, ttc, d_slot, ~def_is_barb, a_hp, u, atk_e, def_e)
            # the same battle rule every seat scores, on whichever seat is
            # attacking here. Runs BEFORE the advance.
            self._ww_battle(mil_att, self._row_of(self._atk_seat(atk_kind, u)),
                            self._row_of(_wwd), tgt,
                            a_died=atk_dead, d_died=(_wwh & ~self._ww_occ(tgt)) != 0)
            if bool(atk_dead.any()):
                ar = atk_dead.nonzero(as_tuple=True)[0]
                self._dig_at(ar, here[ar])  # killUnit's dig
                a_occ[ar, here[ar]] = -1
                a_alive[:, u] = a_alive[:, u] & ~atk_dead
            # tileFreeForUnit's TERRAIN check, which _blocked_for (occupancy
            # only) omits. A LAND attacker (barb, or a land/embarked civ) may not
            # advance onto WATER — meleeAttack passes allowEmbark false; a NAVAL
            # civ advances onto enterable water (wpass, OCEAN needing its civ's
            # CARTOGRAPHY) but never onto land. Without it an attacker would
            # advance onto the water tile of a just-killed embarked enemy.
            ttc_adv = tgt.clamp(min=0)
            land_ok = self.passable.gather(1, ttc_adv.unsqueeze(1)).squeeze(1)
            if atk_kind == "civ":
                naval_att = self.unit_naval[self.civ_unit_type[:, u].clamp(min=0, max=self.NU - 1)]
                civ_u = self.civ_unit_civ[:, u].clamp(min=0)
                cart_u = (
                    self.civ_only_techs[torch.arange(self.B, device=self.device), civ_u, self._cartography_tech]
                    if self._cartography_tech >= 0 else torch.zeros(self.B, dtype=torch.bool, device=self.device)
                )
                water_ok = self.wpass.gather(1, ttc_adv.unsqueeze(1)).squeeze(1) & (
                    ~self.ocean_tile.gather(1, ttc_adv.unsqueeze(1)).squeeze(1) | cart_u
                )
                adv_terr = torch.where(naval_att, water_ok, land_ok)
            else:
                # barbarians CAN be naval (the GALLEY / QUADRIREME raiders), so
                # this must not shortcut to the land plane — a hull that killed
                # an adjacent land civilian would advance ASHORE. A barb owns no
                # tech, so its water plane is wpass minus OCEAN, exactly what
                # tileFreeForUnit/waterEnterable allows it.
                adv_terr = torch.where(
                    self.unit_naval[self.barb_unit_type[:, u].clamp(min=0)],
                    self._barb_water_ok(ttc_adv),
                    land_ok,
                )
            # the advance probe, by seat (see _blocked_for).
            _bseat = BARB_SEAT if atk_kind == "barb" else self.civ_unit_seat[:, u].unsqueeze(1)
            adv = def_dead & ~atk_dead & ~self._blocked_for(tgt.unsqueeze(1), _bseat).squeeze(1) & adv_terr
            if bool(adv.any()):
                vr = adv.nonzero(as_tuple=True)[0]
                a_occ[vr, here[vr]] = -1
                a_tile[vr, u] = ttc[vr]
                a_occ[vr, ttc[vr]] = u + a_lo
                if atk_kind == "civ":
                    self._clear_camp_at(adv, ttc, civ=self.civ_unit_civ[:, u])
        if bool(civ_att.any()):
            rows = civ_att.nonzero(as_tuple=True)[0]
            ds = dc_[rows]
            if atk_kind == "civ":
                # an at-war civ melee on a lone seat-0 civilian CAPTURES it —
                # roll-free (draw-count neutral) and no advance
                # (single-occupancy). Pool TRANSFER p_* -> v_* in spawn order
                # (last-alive+1), keyed to the attacker's civ, hp and charges
                # carried, movesLeft = 0 so the heal skips it this turn.
                ct = ttc[rows]
                self.seat0_unit_alive[rows, ds] = False
                nslot = self.civ_unit_next[rows]
                assert int(nslot.max()) < simbase.POOL_MAX, "civ slot pool exhausted — raise simbase.POOL_MAX"
                self.civ_unit_alive[rows, nslot] = True
                self.civ_unit_civ[rows, nslot] = self.civ_unit_civ[rows, u]
                self.civ_unit_seat[rows, nslot] = self.civ_unit_seat[rows, u]  # the capture carries the seat
                self.civ_unit_tile[rows, nslot] = ct
                self._carry_capture(rows, ds + self.POOL_LO["seat0"], nslot + self.POOL_LO["civ"])
                self.civilian_at[(rows, ct)] = nslot + self.POOL_LO["civ"]
                self.civ_unit_next[rows] += 1
            else:
                self._dig_at(rows, ttc[rows])  # a barb KILL leaves a dig
                self.civilian_at[(rows, ttc[rows])] = -1
                self.seat0_unit_alive[rows, ds] = False
            self._gen_ver += 1  # a captured/killed civilian may be a general → invalidate the aura plane
        if bool(vciv_att.any()):
            rows = vciv_att.nonzero(as_tuple=True)[0]
            ds = dvc[rows]
            if atk_kind == "civ":
                # a civ CAPTURES an enemy civ's lone civilian, symmetric with the
                # seat-0 branch above — despawn the old slot, respawn at POOL END
                # under the attacker's civ; hp/charges/xp/embark kept, moves 0.
                ct = ttc[rows]
                self.civ_unit_alive[rows, ds] = False
                nslot = self.civ_unit_next[rows]
                assert int(nslot.max()) < simbase.POOL_MAX, "civ slot pool exhausted — raise simbase.POOL_MAX"
                self.civ_unit_alive[rows, nslot] = True
                self.civ_unit_civ[rows, nslot] = self.civ_unit_civ[rows, u]
                self.civ_unit_seat[rows, nslot] = self.civ_unit_seat[rows, u]  # the capture carries the seat
                self.civ_unit_tile[rows, nslot] = ct
                self._carry_capture(rows, ds + self.POOL_LO["civ"], nslot + self.POOL_LO["civ"])
                self.civilian_at[(rows, ct)] = nslot + self.POOL_LO["civ"]
                self.civ_unit_next[rows] += 1
            else:
                # a barbarian kills a lone civ civilian roll-free.
                self._dig_at(rows, ttc[rows])  # a barb KILL leaves a dig
                self.civilian_at[(rows, ttc[rows])] = -1
                self.civ_unit_alive[rows, ds] = False
            self._gen_ver += 1  # the killed/captured civilian may be a general → invalidate the aura plane
        # a captured civilian is NOT killed — its captor does NOT advance
        # onto it. Only a barbarian kill (barb attacker) frees the tile for the
        # advance; a civ captor (civ_att under atk_kind=="civ") stays put.
        kill_adv = (civ_att | vciv_att) if atk_kind == "barb" else torch.zeros_like(civ_att)
        if bool(kill_adv.any()):
            _bseat2 = BARB_SEAT if atk_kind == "barb" else self.civ_unit_seat[:, u].unsqueeze(1)
            # the SAME naval-plane gate as the melee advance above — a roll-free
            # civilian kill by a barb GALLEY must not walk the hull onto the
            # (land) tile it just cleared.
            _kt = tgt.clamp(min=0)
            _kterr = (
                torch.where(
                    self.unit_naval[self.barb_unit_type[:, u].clamp(min=0)],
                    self._barb_water_ok(_kt),
                    self.passable.gather(1, _kt.unsqueeze(1)).squeeze(1),
                )
                if atk_kind == "barb"
                else torch.ones_like(kill_adv)
            )
            adv = kill_adv & _kterr & ~self._blocked_for(tgt.unsqueeze(1), _bseat2).squeeze(1)
            if bool(adv.any()):
                vr = adv.nonzero(as_tuple=True)[0]
                a_occ[vr, here[vr]] = -1
                a_tile[vr, u] = ttc[vr]
                a_occ[vr, ttc[vr]] = u + a_lo
                if atk_kind == "civ":
                    self._clear_camp_at(adv, ttc, civ=self.civ_unit_civ[:, u])

    def _attack_civ_city(self, att: torch.Tensor, tgt: torch.Tensor, u: int) -> None:
        """A BARBARIAN's melee assault on a civ city — the shared battle in
        `_assault_civ_city`, then the barbarian SACK (barbs never hold)."""
        _r = self._assault_civ_city(att, tgt, "barb", u)
        if _r is None:
            return
        rows, civ, slot, died, ttc = _r
        if bool(died.any()):
            dr = died.nonzero(as_tuple=True)[0]
            self._dig_at(dr, self.barb_unit_tile[dr, u])  # killUnit's dig
            self.military_at[(dr, self.barb_unit_tile[dr, u])] = -1
            self.barb_unit_alive[:, u] = self.barb_unit_alive[:, u] & ~died
        sacked = rows[self.civ_city_hp[rows, civ[rows], slot[rows]] <= 0]
        if len(sacked) > 0:
            sc, sj = civ[sacked], slot[sacked]
            self.civ_city_pop[sacked, sc, sj] = ((self.civ_city_pop[sacked, sc, sj] * 3) // 4).clamp(min=1)
            # the sack mirrors sackCity — milli-rounded 20% gold loss (cap 100)
            # plus the pillage ring around the center.
            loss_r = torch.minimum(
                torch.tensor(100.0, dtype=torch.float64, device=self.device),
                js_round(js_round(self.civ_only_treasury[sacked, sc] * 1000) / 1000 * 0.2).double(),
            )
            self.civ_only_treasury[sacked, sc] -= loss_r
            if self.improvements_on:
                centers_r = self.civ_city_center[sacked, sc, sj]
                nb_r = self.neigh[centers_r.clamp(min=0)]  # [K, 6]
                for d_ in range(6):
                    n_d = nb_r[:, d_]
                    on = (n_d >= 0) & (centers_r >= 0)
                    r2, t2 = sacked[on], n_d[on]
                    hit = (self.improvement[r2, t2] >= 0) & ~self.pillaged[r2, t2]
                    self.pillaged[r2[hit], t2[hit]] = True
                self._eff_version += 1
            self.civ_city_hp[sacked, sc, sj] = round(self.rules.seats.get("cityMaxHp", 200) / 2)

    def _civ_attack_civ_city(self, att: torch.Tensor, tgt: torch.Tensor, u: int) -> None:
        """A CIV's melee assault on another civ's city — the shared battle
        in `_assault_civ_city`, then the CONQUEST transfer."""
        _r = self._assault_civ_city(att, tgt, "civ", u)
        if _r is None:
            return
        rows, civ, slot, died, ttc = _r
        if bool(died.any()):
            dr = died.nonzero(as_tuple=True)[0]
            self._dig_at(dr, self.civ_unit_tile[dr, u])  # killUnit's dig
            self.military_at[(dr, self.civ_unit_tile[dr, u])] = -1
            self.civ_unit_alive[:, u] = self.civ_unit_alive[:, u] & ~died
        captured = rows[self.civ_city_hp[rows, civ[rows], slot[rows]] <= 0]
        if len(captured) > 0:
            atk_civ = self.civ_unit_civ[:, u]
            for b in captured.tolist():
                # the conqueror is the attacker's civ; no +40 plunder on a
                # civ-vs-civ take. The transfer runs per row, reusing the
                # loyalty-flip machinery.
                self._transfer_rc_to_rc(b, int(civ[b]), int(slot[b]), int(atk_civ[b]))

    def _tdef_g(self, tiles: torch.Tensor) -> torch.Tensor:
        """[B] terrain defence at `tiles`, INCLUDING a live FORT (+4).

        `terrainDefense` reads `tile.improvement` LIVE, so the fort bonus cannot
        be baked into the static `tdef` plane: a fort is built, pillaged and
        replaced mid-game, and the chop/found paths rewrite `tdef` from hills
        alone, which would silently erase it.
        """
        d = self.tdef.gather(1, tiles.unsqueeze(1)).squeeze(1)
        if self.FORT >= 0:
            d = d + 4 * (self.improvement.gather(1, tiles.unsqueeze(1)).squeeze(1) == self.FORT).long()
        return d

    def _tdef_i(self, bidx: torch.Tensor, tiles: torch.Tensor) -> torch.Tensor:
        """The advanced-indexing twin of _tdef_g (same rule, same +4)."""
        d = self.tdef[bidx, tiles]
        if self.FORT >= 0:
            d = d + 4 * (self.improvement[bidx, tiles] == self.FORT).long()
        return d

    def _nonbarb_unit_plane(self) -> torch.Tensor:
        """[B, T] — does a NON-BARBARIAN unit stand on each tile?

        The question a barbarian's target scan asks (a barb is not a target for a
        barb), written once. Civilians are never barbarians, so only the military
        plane needs the seat test.
        """
        mil = self.military_at
        mseat = torch.where(mil >= 0, self.unit_seat.gather(1, mil.clamp(min=0)), torch.full_like(mil, -1))
        return ((mil >= 0) & (mseat != BARB_SEAT)) | (self.civilian_at >= 0)

    def _nonbarb_mil_plane(self) -> torch.Tensor:
        """The MILITARY-only twin of `_nonbarb_unit_plane`.

        City-first needs to tell a GARRISON from a LONE CIVILIAN: a city is
        attacked THROUGH a military garrison, but a lone civilian is still killed
        first, roll-free. The combined plane cannot answer that, so the military
        arm is written on its own."""
        mil = self.military_at
        mseat = torch.where(mil >= 0, self.unit_seat.gather(1, mil.clamp(min=0)), torch.full_like(mil, -1))
        return (mil >= 0) & (mseat != BARB_SEAT)

    # ------------------------------------------------------------------
    # the five per-pool occupancy maps, as DERIVED READ-ONLY views.
    #
    # Storage is military_at/civilian_at holding a merged-pool slot, with unit_seat
    # saying whose it is. These views exist so assertions and debugging can ask
    # "which of THIS pool's units is on that tile?" without every caller
    # re-deriving the offset and the seat test.
    #
    # Deliberately properties with NO SETTER: a write raises AttributeError
    # rather than silently updating a plane nothing reads.
    # ------------------------------------------------------------------
    def _pool_at(self, plane: torch.Tensor, pool: str) -> torch.Tensor:
        lo, hi = self.POOL_LO[pool], self.POOL_HI[pool]
        mine = (plane >= lo) & (plane < hi)
        return torch.where(mine, plane - lo, torch.full_like(plane, -1))

    @property
    def pmil_at(self) -> torch.Tensor:
        return self._pool_at(self.military_at, "seat0")

    @property
    def pciv_at(self) -> torch.Tensor:
        return self._pool_at(self.civilian_at, "seat0")

    @property
    def civ_military_at(self) -> torch.Tensor:
        return self._pool_at(self.military_at, "civ")

    @property
    def civ_civilian_at(self) -> torch.Tensor:
        return self._pool_at(self.civilian_at, "civ")

    @property
    def barb_at(self) -> torch.Tensor:
        return self._pool_at(self.military_at, "barb")

    @property
    def owner(self) -> torch.Tensor:
        """[B, T] — which SEAT-0 city owns each tile, -1 for nobody.

        Not a plain view of `tile_seat`: it answers a different question, not
        "whose tile" but "whose CITY", TS's `ownerCity` beside its `ownerSeat`.
        `tile_city` is the second half of that pair, and `owner` is the two read
        together."""
        if self._owner_ver != self._tile_owner_ver:
            self._owner_cache = torch.where(
                self.tile_seat == 0, self.tile_city,
                torch.full_like(self.tile_city, -1),
            )
            self._owner_ver = self._tile_owner_ver
        return self._owner_cache

    @property
    def civ_at(self) -> torch.Tensor:
        """[B, T] — which civ owns each tile, -1 for nobody.

        A VIEW of `tile_seat`, cached on `_tile_owner_ver`: dozens of call sites
        each recomputing a `where` would be dozens more kernel launches in a
        dispatch-bound step."""
        if self._civ_at_ver != self._tile_owner_ver:
            s = self.tile_seat
            self._civ_at_cache = torch.where(
                (s >= 1) & (s < 100), s - 1, torch.full_like(s, -1)
            )
            self._civ_at_ver = self._tile_owner_ver
        return self._civ_at_cache

    @property
    def center_at(self) -> torch.Tensor:
        """[B, T] — seat 0's city SLOT at its centre tiles, -1 elsewhere: the
        seat-generic centre registry (centre_slot_at) masked to seat-0 tiles.
        Cached on _tile_owner_ver — every centre write co-occurs with an
        ownership write, so the version covers both."""
        if self._center_at_ver != self._tile_owner_ver:
            self._center_at_cache = torch.where(
                self.tile_seat == 0, self.centre_slot_at,
                torch.full_like(self.centre_slot_at, -1))
            self._center_at_ver = self._tile_owner_ver
        return self._center_at_cache

    @property
    def civ_city_at(self) -> torch.Tensor:
        """[B, T] — the civ INDEX at a civ centre, -1 elsewhere: the centre
        registry joined with civ_at (a centre tile is owned by its city, so
        the tile's seat names the civ). Cached on _tile_owner_ver."""
        if self._civ_city_at_ver != self._tile_owner_ver:
            self._civ_city_at_cache = torch.where(
                self.centre_slot_at >= 0, self.civ_at,
                torch.full_like(self.centre_slot_at, -1))
            self._civ_city_at_ver = self._tile_owner_ver
        return self._civ_city_at_cache

    @property
    def citystate_at(self) -> torch.Tensor:
        """[B, T] — which city-state owns each tile, -1 for nobody.

        A VIEW of `tile_seat`, not a plane. Cached on `_tile_owner_ver` for the
        same reason as `civ_at`: dozens of call sites each recomputing a `where`
        would be dozens more kernel launches in a dispatch-bound step."""
        if self._citystate_at_ver != self._tile_owner_ver:
            self._citystate_at_cache = torch.where(
                self.tile_seat >= 100, self.tile_seat - 100,
                torch.full_like(self.tile_seat, -1),
            )
            self._citystate_at_ver = self._tile_owner_ver
        return self._citystate_at_cache


    def _check_tile_owner_invariant(self) -> None:
        """A tile has at most ONE owner.

        Two consumers reading different ownership answers would each pick a
        different winner, so this runs every step under CIV6_ALIAS_CHECK."""
        # All three of `owner`, `civ_at` and `citystate_at` are views of `tile_seat`
        # (+ `tile_city`), so one-owner is a property of the ENCODING rather than
        # an agreement between planes. The count below can only be 0 or 1 by
        # construction; it stays as a cheap tripwire against a future write
        # reintroducing a second store.
        n = (self.tile_seat == 0).long() + (self.civ_at >= 0).long() + (self.citystate_at >= 0).long()
        if not bool((n <= 1).all()):
            b, t = [int(x[0]) for x in (n > 1).nonzero(as_tuple=True)]
            raise AssertionError(
                f"TILE OWNER DRIFT: game {b} tile {t} is claimed by "
                f"{int(n[b, t])} seats at once — owner={int(self.owner[b, t])}, "
                f"civ_at={int(self.civ_at[b, t])}, citystate_at={int(self.citystate_at[b, t])}"
            )

    def _seats_hostile(self, a_seat, b_plane: torch.Tensor) -> torch.Tensor:
        """unitsHostile over a PLANE of seats — [B, T] bool.

        The ONE hostility question, asked of a whole map at once. `a_seat` is the
        asker (int, or [B, 1]/[B] tensor); `b_plane` [B, T] holds the other
        party's seat, -1 for nobody.

        A barbarian is hostile to every non-barbarian and vice versa; two
        barbarians are not hostile; every other pair is civsAtWar, read as a
        single gather into the symmetric war matrix.
        """
        B = self.B
        a = a_seat if torch.is_tensor(a_seat) else torch.full(
            (B, 1), a_seat, dtype=torch.long, device=self.device
        )
        a = a.reshape(B, 1)
        valid = b_plane >= 0
        a_barb, b_barb = a == BARB_SEAT, b_plane == BARB_SEAT
        # ONE lookup. Exactly one side barbarian -> hostile (both -> not); every
        # other pair is the war matrix, whichever seats they are.
        bidx = torch.arange(B, device=self.device).unsqueeze(1)
        ra = self._seat_row[a.clamp(min=0)]
        rb = self._seat_row[b_plane.clamp(min=0)]
        at_war = self.war[bidx, ra, rb]
        # A seat is never hostile to ITSELF, stated explicitly: leaving it to the
        # war matrix's unwritten diagonal would make the answer depend on a value
        # nothing maintains.
        return valid & (a != b_plane) & ((a_barb ^ b_barb) | (~a_barb & ~b_barb & at_war))

    def _step_verb(
        self,
        ok: torch.Tensor,
        gslot: torch.Tensor,
        here: torch.Tensor,
        dest: torch.Tensor,
        dir_i: torch.Tensor,
        seat,
        is_civ: torch.Tensor,
        camp_civ: torch.Tensor | None = None,
        clear_camp: bool = True,
    ) -> torch.Tensor:
        """The `stepUnit` twin for the ACTION appliers — [B] masks in, the
        mask of units that actually stepped out.

        `ok` is the caller's terrain/occupancy verdict (walkPath's
        blockedByEnemy + tileFreeForUnit); everything downstream of it is the
        same for every mover and lives here:

          * COST — moveCostInto + riverCharge, road-aware (`_road_terms`).
          * AFFORD — `movesLeft < cost && movesLeft < full` refuses, so a unit
            at FULL MP always gets its first step and pays everything it has.
          * ZOC — ending adjacent to a hostile military zeroes what is left.
          * the camp clear, for any landing unit.

        `gslot` is a MERGED pool slot, so the occupancy and tile writes below are
        the same two lines whoever is moving.
          * EMBARK/DISEMBARK — a LAND unit crossing land<->water pays ALL
            remaining MP and flips `emb`; a water->water step enters at 1 with
            no river charge. LIVE-gated (`_embark_live`), like TS's embarkState.
            The candidate scan stays with the caller: which neighbours are
            enterable, and the cliff that closes a transition edge, are
            target-choice questions.
          * the camp clear, for any landing unit. `clear_camp=False` is the
            BARBARIAN mover — clearCampFor no-ops for them.

        The autonomous walkers call this too; what is left of each of them is its
        candidate set and its stop condition, which is exactly what TS says
        should differ."""
        hc = here.clamp(min=0)
        river3 = 3 * ((self.river_mask.gather(1, hc.unsqueeze(1)).squeeze(1) >> dir_i) & 1)
        terr, riv = self._road_terms(here, dest, river3)
        land_cost = 1 + terr + riv
        gs1 = gslot.unsqueeze(1)
        mp = self.unit_mp.gather(1, gs1).squeeze(1)
        full = self.unit_mp_full.gather(1, gs1).squeeze(1)
        if self._embark_live:
            naval = self.unit_naval[
                self.unit_type.gather(1, gs1).squeeze(1).clamp(min=0, max=self.NU - 1)
            ]
            emb = self.unit_emb.gather(1, gs1).squeeze(1)
            to_water = self.wpass.gather(1, dest.clamp(min=0).unsqueeze(1)).squeeze(1)
            transition = (emb != to_water) & ~naval
            cost = torch.where(
                transition, mp, torch.where(to_water, torch.ones_like(land_cost), land_cost)
            )
        else:
            cost = land_cost
        moved = ok & ((mp >= cost) | (mp >= full))
        if not bool(moved.any()):
            return moved
        rows = moved.nonzero(as_tuple=True)[0]
        gs = gslot[rows]
        civ_rows = rows[is_civ[rows]]
        mil_rows = rows[~is_civ[rows]]
        if len(civ_rows):
            self.civilian_at[(civ_rows, here[civ_rows])] = -1
            self.civilian_at[(civ_rows, dest[civ_rows])] = gslot[civ_rows]
        if len(mil_rows):
            self.military_at[(mil_rows, here[mil_rows])] = -1
            self.military_at[(mil_rows, dest[mil_rows])] = gslot[mil_rows]
        self.unit_tile[rows, gs] = dest[rows]
        # stepUnit's revealAround: EVERY hop lifts the mover's fog (r2).
        # Major seats only — revealAround gates to isCiv on TS the same way,
        # so barbarian/city-state movers accrue nothing on either engine.
        srow = self.unit_seat[rows, gs]
        major = srow <= self.R
        if bool(major.any()):
            self._reveal_around(rows[major], srow[major], dest[rows][major], 2)
        if clear_camp:
            if camp_civ is None:
                self._clear_camp_at(moved, dest)
            else:
                self._clear_camp_at(moved, dest, civ=camp_civ)
        if self._embark_live:
            self.unit_emb[rows, gs] = (to_water & ~naval)[rows]
        spent = (mp - cost).clamp(min=0)
        spent = torch.where(self._in_enemy_zoc(dest, seat), torch.zeros_like(spent), spent)
        self.unit_mp[rows, gs] = spent[rows]
        return moved

    def _in_enemy_zoc(self, dest: torch.Tensor, seat) -> torch.Tensor:
        """ZOC, mirroring units.inEnemyZoc: does `dest` sit adjacent to a MILITARY
        unit hostile to a mover of `seat`? [B] -> [B].

        ONE function for every mover — the rule is identical whoever asks.
        Hostility is unitsHostile, exactly: barbarians are hostile to every
        non-barbarian and vice versa; otherwise it is civsAtWar(seat, other).

        EMBARKED military exert NO ZOC (barbarians never embark)."""
        mil = self.military_at
        here = mil >= 0
        mslot = mil.clamp(min=0)
        # Whose military stands on each tile, and does it EXERT? An embarked unit
        # exerts no ZOC; barbarians never embark, so the merged emb plane covers
        # all three pools uniformly.
        mseat = torch.where(here, self.unit_seat.gather(1, mslot), torch.full_like(mil, -1))
        exert = here & ~self.unit_emb.gather(1, mslot)
        hostmil = exert & self._seats_hostile(seat, mseat)
        dn = self.neigh[dest.clamp(min=0)]  # [B, 6] neighbor tile indices
        return ((dn >= 0) & hostmil.gather(1, dn.clamp(min=0))).any(dim=1)

    def _civ_pair_hostile_units_at(self, v: int) -> tuple[torch.Tensor, torch.Tensor]:
        """Per-tile masks [B, T] of ENEMY AT-WAR civ units (military, civilian)
        relative to unit slot v's civ — the symmetric unitsHostile for the
        civ-civ war-act target scan. Own-civ units are never hostile."""
        # the merged maps + the shared hostility rule, CIV-ONLY by construction.
        # Seat 0 and the barbarians are hostile to this civ too, but they belong
        # to other target scans, so they are filtered out rather than folded in —
        # folding them in would silently widen the civ-vs-civ war act's targets.
        seat = self.civ_unit_seat[:, v].unsqueeze(1)  # [B, 1]
        neg_m = torch.full_like(self.military_at, -1)
        m_seat = torch.where(
            self.military_at >= 0, self.unit_seat.gather(1, self.military_at.clamp(min=0)), neg_m
        )
        c_seat = torch.where(
            self.civilian_at >= 0, self.unit_seat.gather(1, self.civilian_at.clamp(min=0)), neg_m
        )
        civ_m = (m_seat > 0) & (m_seat != BARB_SEAT)
        civ_c = (c_seat > 0) & (c_seat != BARB_SEAT)
        war_m = civ_m & self._seats_hostile(seat, m_seat)
        war_c = civ_c & self._seats_hostile(seat, c_seat)
        return war_m, war_c

    def _war_march_target(self, hc: torch.Tensor, ac: torch.Tensor, hp: torch.Tensor):
        """The war-march DESTINATION for units at `hc` of civs `ac` (hp = at war
        with seat 0) — the nearest unpillaged enemy improvement or complete
        district within 13, else the nearest enemy city, with seat 0 winning
        ties and distance ties breaking on the founding sequence.

        ONE implementation shared by the per-unit OBSERVATION and the scripted
        picker; separate copies would drift.
        Returns (tgt, has_imp, has_pc, has_rc).
        """
        B, T, dev = self.B, self.T, self.device
        arangeT = torch.arange(T, device=dev)
        # the improvement/district march targets SEAT-0 tiles only while at war
        # with seat 0 (hp) — a civ at war only with other civs heads for their
        # cities, not neutral seat-0 improvements.
        hpT = hp.unsqueeze(1)
        if self.improvements_on or self.districts_on:
            imp_job = (self.improvement >= 0) & ~self.pillaged & (self.tile_seat == 0) & hpT
            if self.districts_on:  # pillageable seat-0 districts join the union
                imp_job = imp_job | ((self.district >= 0) & self.district_complete & ~self.district_pillaged & (self.tile_seat == 0) & hpT)
            d_imp = self.pair_dist[hc.unsqueeze(1), arangeT.unsqueeze(0)].to(torch.long)
            ikey = torch.where(imp_job & (d_imp < 13), d_imp * (T + 1) + arangeT, torch.full_like(d_imp, 10**9))
            imp_min, imp_tgt = ikey.min(dim=1)
            has_imp = imp_min < 10**9
        else:
            has_imp = torch.zeros(B, dtype=torch.bool, device=dev)
            imp_tgt = hc
        dc = self.pair_dist[hc.unsqueeze(1), self.site.clamp(min=0)].to(torch.long)
        # Distance ties break by the FOUNDING sequence (TS array order), NOT the
        # slot index — the same rule the barbarian twin uses.
        # Seat-0 cities are march targets only at war with seat 0 (hp); a civ
        # ALSO marches to its at-war ENEMY civs' cities (key
        # d*16384 + civIdx*2048 + centerTile), with seat 0 winning ties.
        ckey = torch.where(self.alive & hpT, dc * 4096 + self.city_seq, 10**9)
        city_min = ckey.min(dim=1).values
        pc_dist = torch.div(city_min, 4096, rounding_mode="floor")  # seat-0 city distance (1e9//4096 stays huge)
        city_tgt = self.site.gather(1, ckey.argmin(dim=1, keepdim=True)).squeeze(1).clamp(min=0)
        civ_city_key_min = torch.full((B,), 10**18, dtype=torch.long, device=dev)
        civ_city_tgt = hc.clone()
        for r2 in range(self.R):
            war2 = self.civ_pair_war[torch.arange(B, device=dev), ac, r2]  # [B]; diagonal false -> r2==ac safe
            if not bool(war2.any()):
                continue
            for j in range(self.RC):
                ct2 = self.civ_city_center[:, r2, j].clamp(min=0)
                alive2 = self.civ_city_alive[:, r2, j] & war2
                d2 = self.pair_dist[hc, ct2].to(torch.long)
                key2 = torch.where(alive2, d2 * (2048 * 8) + r2 * 2048 + ct2, torch.full_like(d2, 10**18))
                upd = key2 < civ_city_key_min
                civ_city_key_min = torch.where(upd, key2, civ_city_key_min)
                civ_city_tgt = torch.where(upd, ct2, civ_city_tgt)
        has_pc = city_min < 10**9
        has_rc = civ_city_key_min < 10**18
        civ_city_dist = torch.div(civ_city_key_min, 2048 * 8, rounding_mode="floor")
        # seat 0 wins ties (pc_dist <= civ_city_dist); else the nearest enemy civ city
        city_target = torch.where(has_pc & (~has_rc | (pc_dist <= civ_city_dist)), city_tgt, civ_city_tgt)
        tgt = torch.where(has_imp, imp_tgt, city_target)
        return tgt, has_imp, has_pc, has_rc

    def _attack_encampment(self, att: torch.Tensor, tile: torch.Tensor, atk_kind: str, u: int) -> None:
        """The `attackEncampment` twin — a melee assault ON an Encampment tile.
        The district fights at its OWNER's seat-level defense floor
        (max(15, bestMeleeCS); no city-centre garrison term, since that +5
        describes a unit standing in the CITY, not on this district), its own
        garrison pool takes the damage, and the attacker never advances.

        The roll KEY differs by target owner ('penc' vs 'renc'), so the two
        owner classes roll under DISJOINT masks. Rows are independent games and
        `_damage_roll` advances only masked rows, so every attacking row still
        draws exactly twice, in TS's order (damage-to-district, then counter)."""
        if atk_kind == "barb":
            a_hp, a_tile, a_alive = self.barb_unit_hp, self.barb_unit_tile, self.barb_unit_alive
            a_occ = self.military_at
            atk_cs = self._type_combat[self.barb_unit_type[:, u]]
        elif atk_kind == "seat0":
            a_hp, a_tile, a_alive = self.seat0_unit_hp, self.seat0_unit_tile, self.seat0_unit_alive
            a_occ = self.military_at
            atk_cs = self._type_combat[self.seat0_unit_type[:, u]]
        else:
            a_hp, a_tile, a_alive = self.civ_unit_hp, self.civ_unit_tile, self.civ_unit_alive
            a_occ = self.military_at
            atk_cs = self._type_combat[self.civ_unit_type[:, u]]
        tc = tile.clamp(min=0)
        civ_only_at = self.civ_at.gather(1, tc.unsqueeze(1)).squeeze(1)  # [B] owning civ, else -1
        floor = torch.full_like(self.best_melee, 15)
        p_def = torch.maximum(self.best_melee, floor)
        civ_only_def = torch.maximum(
            self.civ_only_best_melee.gather(1, civ_only_at.clamp(min=0).unsqueeze(1)).squeeze(1), floor
        )
        def_cs = torch.where(civ_only_at >= 0, civ_only_def, p_def)
        # Attacker CS assembled exactly as _hostile_city_attack assembles it.
        # ASK THE TABLE, never branch on the pool name: veterancy is
        # `SEAT_CAPS[...]["xp"]` at every site, so the fact has one source.
        # `hostile` is the only class with xp False, so barbs contribute 0.
        if not SEAT_CAPS[POOL_CLASS[atk_kind]]["xp"]:
            atk_lvl5 = torch.zeros_like(a_hp[:, u])
        elif atk_kind == "seat0":
            atk_lvl5 = self._xp_lvl_bonus(self.seat0_unit_xp[:, u])
        else:
            atk_lvl5 = self._xp_lvl_bonus(self.civ_unit_xp[:, u])
        atk_e = atk_cs - self._wound(a_hp[:, u]) - 5.0 * self._river_cross(a_tile[:, u], tc) + atk_lvl5
        if atk_kind == "seat0":
            # seat 0's aura. Its religion adder is structurally absent here —
            # seat 0 holds no holy city, and TS gates that term on civ seats.
            p_naval = self.unit_naval[self.seat0_unit_type[:, u].clamp(min=0, max=self.NU - 1)] | self.seat0_unit_emb[:, u]
            atk_e = atk_e + self._gen_aura_cs(
                torch.zeros_like(tc), a_tile[:, u], p_naval
            ).to(atk_e.dtype)
        if atk_kind == "civ":
            atk_naval = self.unit_naval[self.civ_unit_type[:, u].clamp(min=0, max=self.NU - 1)] | self.civ_unit_emb[:, u]
            atk_e = atk_e + (self._rel_atk_cs(self.civ_unit_civ[:, u], tc).to(atk_e.dtype) if self._city_rel_live else 0)
            atk_e = atk_e + self._gen_aura_cs(self.civ_unit_civ[:, u] + 1, a_tile[:, u], atk_naval).to(atk_e.dtype)
        p_att, civ_only_att = att & (civ_only_at < 0), att & (civ_only_at >= 0)
        diff, cdiff = atk_e - def_cs, def_cs - atk_e
        # CAREFUL: _damage_roll returns a value on EVERY row — only the RNG
        # ADVANCE is masked. Each roll must therefore be gated to its own rows
        # before the two owner classes are combined; summing them raw would
        # roughly DOUBLE both the damage dealt and the counter taken.
        _z = torch.zeros_like(tc)
        _dp = self._damage_roll(p_att, diff, k="penc", tile=tc)
        _sp = self._damage_roll(p_att, cdiff, k="pencc", tile=tc)
        _dr = self._damage_roll(civ_only_att, diff, k="renc", tile=tc)
        _sr = self._damage_roll(civ_only_att, cdiff, k="rencc", tile=tc)
        d_enc = torch.where(p_att, _dp, _z) + torch.where(civ_only_att, _dr, _z)
        d_self = torch.where(p_att, _sp, _z) + torch.where(civ_only_att, _sr, _z)
        if atk_kind == "civ":
            self.civ_unit_xp[:, u] = torch.where(att, self.civ_unit_xp[:, u] + XP_ATTACK, self.civ_unit_xp[:, u])
        elif atk_kind == "seat0":
            self.seat0_unit_xp[:, u] = torch.where(att, self.seat0_unit_xp[:, u] + XP_ATTACK, self.seat0_unit_xp[:, u])
        rows = att.nonzero(as_tuple=True)[0]
        if len(rows) > 0:
            tr = tc[rows]
            self.encamp_hp[rows, tr] = (self.encamp_hp[rows, tr] - d_enc[rows]).clamp(min=0)
        _ww_ad = att & ((a_hp[:, u] - d_self) <= 0)  # before the hp write
        a_hp[:, u] = torch.where(att, a_hp[:, u] - d_self, a_hp[:, u])
        died = att & (a_hp[:, u] <= 0)
        # an Encampment is part of its city's defenses and fights at that city's
        # strength, so it scores as CITY combat for both sides — the
        # `attackEncampment` hook's twin.
        self._ww_battle(att, self._row_of(self._atk_seat(atk_kind, u)),
                        self._row_of(self.tile_seat.gather(1, tc.unsqueeze(1)).squeeze(1)),
                        tc, a_died=_ww_ad, city=True)
        if bool(died.any()):
            dr = died.nonzero(as_tuple=True)[0]
            self._dig_at(dr, a_tile[dr, u])  # killUnit's dig
            a_occ[dr, a_tile[dr, u]] = -1
            a_alive[:, u] = a_alive[:, u] & ~died

    def _pool_of(self, atk_kind: str):
        """The unit-pool views for an attacker CLASS.

        `p` is seat 0's pool, `v` a civ seat's, `u` the barbarians'. Spelled once
        so a shared resolver can be written against "the attacker" instead of
        against three near-identical copies keyed on which array it lives in.
        """
        return tuple(getattr(self, f"{atk_kind}_unit_{f}")
                     for f in ("hp", "tile", "type", "xp", "emb", "alive", "seat"))

    def _assault_civ_city(self, att: torch.Tensor, tgt: torch.Tensor,
                            atk_kind: str, u: int):
        """ONE melee assault on a CIV city, for ANY attacking seat — the
        `cityAssault` twin.

        The only per-CLASS terms are the ones TS's own `assaultAtkCS` keys on,
        never pool accidents:
          * the veterancy bonus rides `SEAT_CAPS[...]["xp"]` — barbarians never
            accrue XP, so TS's unconditional `xpLevelBonus` is 0 for them and
            omitting it is byte-identical;
          * the religion adder is gated the same way in TS, on the attacker
            being a civ seat, since seat 0 holds no holy city here;
          * the general/admiral aura keys on the attacker's own civ, and a
            barbarian has none (civ -1).

        Returns `(rows, civ, slot, died, ttc)` so each caller can apply its OWN
        aftermath — seat 0 CAPTURES, a civ CONQUERS, a barbarian SACKS. TS
        branches there too; what is shared is the battle.
        """
        if not bool(att.any()):
            return None
        B, dev = self.B, self.device
        bidx = torch.arange(B, device=dev)
        a_hp, a_tile, a_type, a_xp, a_emb, a_alive, a_seat = self._pool_of(atk_kind)
        ttc = tgt.clamp(min=0)
        civ = self.civ_city_at.gather(1, ttc.unsqueeze(1)).squeeze(1).clamp(min=0)  # defender civ
        slot = torch.zeros_like(civ)
        for j in range(self.RC):
            hit = (self.civ_city_center[bidx, civ, j] == ttc) & self.civ_city_alive[bidx, civ, j]
            slot = torch.where(att & hit, torch.full_like(slot, j), slot)
        # the city fights at its owner's best-melee-ever, floored at 15, +5 for a
        # garrison of its OWN seat standing on the centre.
        gslot = self.military_at.gather(1, ttc.unsqueeze(1)).squeeze(1)
        gar = ((gslot >= 0) & (self.unit_seat[bidx, gslot.clamp(min=0)] == civ + 1)).long()
        best_r = self.civ_only_best_melee[bidx, civ]
        def_cs = torch.maximum(best_r, torch.full_like(best_r, 15)) + gar * 5
        # wound + river (a city is not a unit), then veterancy.
        atk_e = (self._type_combat[a_type[:, u].clamp(min=0, max=self.NU - 1)]
                 - self._wound(a_hp[:, u])
                 - 5.0 * self._river_cross(a_tile[:, u], tgt))
        if SEAT_CAPS[POOL_CLASS[atk_kind]]["xp"]:
            atk_e = atk_e + self._xp_lvl_bonus(a_xp[:, u])
        if atk_kind == "civ" and self._city_rel_live:
            atk_e = atk_e + self._rel_atk_cs(self.civ_unit_civ[:, u], tgt).to(atk_e.dtype)
        aura_civ = torch.where(a_seat[:, u] == BARB_SEAT,
                               torch.full_like(civ, -1), a_seat[:, u])
        atk_naval = self.unit_naval[a_type[:, u].clamp(min=0, max=self.NU - 1)] | a_emb[:, u]
        atk_e = atk_e + self._gen_aura_cs(aura_civ, a_tile[:, u], atk_naval).to(atk_e.dtype)
        if getattr(self, "_battle_probe", False) and bool(att.any()):
            for _b in att.nonzero(as_tuple=True)[0].tolist():
                print(f"GPU-BATTLE b={_b} t={self.turn} tgt={int(tgt[_b])} "
                      f"atk_e={float(atk_e[_b]):.1f} def_cs={float(def_cs[_b]):.1f} "
                      f"combat={float(self._type_combat[int(a_type[_b, u])]):.0f} "
                      f"wound={float(self._wound(a_hp[:, u])[_b]):.1f} "
                      f"xp={int(a_xp[_b, u])} best_r={float(best_r[_b]):.0f} gar={int(gar[_b])}")
        # DRAW ORDER is the parity contract: the city's damage first, the
        # counter second, exactly as TS's cityAssault draws them.
        d_city = self._damage_roll(att, atk_e - def_cs, k="rcty", tile=tgt)
        d_atk = self._damage_roll(att, def_cs - atk_e, k="rctyc", tile=tgt)
        if atk_kind == "civ":
            a_xp[:, u] = torch.where(att, a_xp[:, u] + XP_ATTACK, a_xp[:, u])
        rows = att.nonzero(as_tuple=True)[0]
        # the ANCIENT_WALLS outer pool soaks the hit first.
        outer = self.civ_city_outer_hp[rows, civ[rows], slot[rows]]
        absorbed = torch.minimum(outer, d_city[rows])
        self.civ_city_outer_hp[rows, civ[rows], slot[rows]] = outer - absorbed
        self.civ_city_hp[rows, civ[rows], slot[rows]] -= d_city[rows] - absorbed
        a_hp[:, u] = torch.where(att, a_hp[:, u] - d_atk, a_hp[:, u])
        died = att & (a_hp[:, u] <= 0)
        self._ww_battle(att, self._row_of(a_seat[:, u]), self._row_of(civ + 1), tgt,
                        a_died=died, city=True)
        if bool(died.any()):
            dr = died.nonzero(as_tuple=True)[0]
            self._dig_at(dr, a_tile[dr, u])  # killUnit's dig
            self.military_at[(dr, a_tile[dr, u])] = -1
            a_alive[:, u] = a_alive[:, u] & ~died
        return rows, civ, slot, died, ttc

    def _assault_city_state(self, att: torch.Tensor, citystate_sc: torch.Tensor,
                            tgt: torch.Tensor, atk_kind: str, u: int):
        """ONE melee assault on a CITY-STATE centre, for any attacking seat —
        the `attackCityState` twin.

        Defense is `15 + pop (+6 militaristic)`; the csty/cstyc draw pair and the
        attacker-death cleanup are shared by every attacking seat, so the
        war-weariness death term is scored in exactly one place.

        The per-CLASS terms are TS's own `assaultAtkCS` clauses, not pool
        accidents — the same three `_assault_civ_city` documents.

        Returns `(rows, atk_dead, cap)`; the CAPTURE aftermath stays with the
        caller, since a suzerain and a conqueror take a minor differently.
        """
        if not bool(att.any()):
            return None
        a_hp, a_tile, a_type, a_xp, a_emb, a_alive, a_seat = self._pool_of(atk_kind)
        at0 = a_type[:, u].clamp(min=0, max=self.NU - 1)
        here = a_tile[:, u].clamp(min=0)
        mil_idx = int(self.rules.citystate.get("militaristicIdx", -1))
        def_cs = (
            15 + self.citystate_pop.gather(1, citystate_sc.unsqueeze(1)).squeeze(1)
            + (self.citystate_type.gather(1, citystate_sc.unsqueeze(1)).squeeze(1) == mil_idx).long() * 6
        )
        # wound + river (a CS centre is not a unit), then veterancy.
        atk_e = self._type_combat[at0] - self._wound(a_hp[:, u]) - 5.0 * self._river_cross(here, tgt)
        if SEAT_CAPS[POOL_CLASS[atk_kind]]["xp"]:
            atk_e = atk_e + self._xp_lvl_bonus(a_xp[:, u])
        if atk_kind == "civ" and self._city_rel_live:
            atk_e = atk_e + self._rel_atk_cs(self.civ_unit_civ[:, u], tgt).to(atk_e.dtype)
        # the aura joins attackCityState's atkCS ONCE, so the cstyc counter-roll
        # sees the same atk_e.
        aura_civ = torch.where(a_seat[:, u] == BARB_SEAT,
                               torch.full_like(a_seat[:, u], -1), a_seat[:, u])
        atk_naval = self.unit_naval[at0] | a_emb[:, u]
        atk_e = atk_e + self._gen_aura_cs(aura_civ, a_tile[:, u], atk_naval).to(atk_e.dtype)
        # DRAW ORDER is the parity contract: the minor's damage, then the counter.
        d_cs = self._damage_roll(att, atk_e - def_cs, k="csty", tile=tgt)
        d_atk = self._damage_roll(att, def_cs - atk_e, k="cstyc", tile=tgt)
        if atk_kind == "civ":
            a_xp[:, u] = torch.where(att, a_xp[:, u] + XP_ATTACK, a_xp[:, u])
        rows = att.nonzero(as_tuple=True)[0]
        self.citystate_hp[rows, citystate_sc[rows]] -= d_cs[rows]
        a_hp[:, u] = torch.where(att, a_hp[:, u] - d_atk, a_hp[:, u])
        atk_dead = att & (a_hp[:, u] <= 0)
        if bool(atk_dead.any()):
            ar = atk_dead.nonzero(as_tuple=True)[0]
            self._dig_at(ar, here[ar])  # killUnit's dig
            self.military_at[(ar, here[ar])] = -1
            a_alive[:, u] = a_alive[:, u] & ~atk_dead
        # warring a city-state wearies you exactly as warring a major does; the
        # minor keeps no accumulator (no amenities, no research to date an era
        # from). Scored BEFORE the caller's capture branch, so the location
        # multiplier is the pre-capture one.
        self._ww_battle(att, self._row_of(a_seat[:, u]), self._row_of(100 + citystate_sc), tgt,
                        a_died=atk_dead, city=True)
        cap = att & (self.citystate_hp.gather(1, citystate_sc.unsqueeze(1)).squeeze(1) <= 0)
        return rows, atk_dead, cap

    def _city_strike_resolve(self, strike: torch.Tensor, tt: torch.Tensor,
                             d_slot: torch.Tensor, d_seat: torch.Tensor,
                             okm: torch.Tensor, okc: torch.Tensor,
                             is_mil: torch.Tensor, atk_cs: torch.Tensor,
                             def_e: torch.Tensor, def_hp: torch.Tensor,
                             striker_row, key: str) -> None:
        """A CITY firing on the best target in range — the resolution half,
        shared by all four strikes.

        The four roll keys `pcstk`, `pestk`, `rcstk` and `restk` are the same rule
        under different striker/target classes — one roll at the city's strength,
        no retaliation, never captures, the damaged defender's occupancy cleared
        on death and XP_DEFEND to a MILITARY survivor. Only WHICH city fires
        (`best_melee` vs `civ_only_best_melee[:, r]`) and hence the roll key differ.

        TARGET SELECTION stays with each caller: a seat-0 city and a civ city
        scan for hostiles differently, and an Encampment strike needs a live
        garrison its walls counterpart does not. What is shared is the BATTLE.

        `striker_row` is the firing seat's war-matrix row — 0 for seat 0, r+1 for
        civ r — so the war-weariness hook is written once instead of four times.
        """
        d = self._damage_roll(strike, atk_cs - def_e, k=key, tile=tt)
        # a city GIVING the attack is city combat, so both sides score at the
        # abroad column. The death term MUST come from the HP the defender is
        # about to have, not from tile occupancy: occupancy is not cleared until
        # the loop below, so reading it here would always say "alive".
        self._ww_battle(strike, striker_row, self._row_of(d_seat), tt,
                        d_died=strike & (d_slot >= 0) & ((def_hp - d) <= 0), city=True)
        rows = strike.nonzero(as_tuple=True)[0]
        # ONE defender slot, military first. Clearing both maps is branch-free
        # and exact — only one of them is ever set.
        for grp, occ_map in ((okm, self.military_at), (~okm & okc, self.civilian_at)):
            g = rows[grp[rows]]
            if len(g) == 0:
                continue
            ds = d_slot[g]
            self.unit_hp[g, ds] -= d[g]
            dead = self.unit_hp[g, ds] <= 0
            gd, td = g[dead], tt[g[dead]]
            occ_map[gd, td] = -1
            self.unit_alive[gd, ds[dead]] = False
            # a combat death leaves a DIG on the tile the dead unit stood on —
            # `combat.ts:killUnit`, not only at a razed outpost.
            self._dig_at(gd, td)
            if bool(dead.any()):
                # A death changes `_seat_route_income`'s raided mask, and that
                # cache is keyed on `_rp_kill_version`. A strike firing
                # mid-seat-phase can invalidate income already computed for
                # another seat this turn, so the bump is REQUIRED there and
                # merely redundant where the cache is still cold — bump it
                # UNCONDITIONALLY rather than behind a per-caller flag.
                self._rp_kill_version += 1
        # +2 to a surviving MILITARY defender (the attacker is a city, so
        # there is no attacker xp; barbarians never accrue).
        surv = (strike & is_mil).nonzero(as_tuple=True)[0]
        if len(surv) > 0:
            alive_now = self.unit_hp[surv, d_slot[surv]] > 0
            sp = surv[alive_now]
            if len(sp) > 0:
                self.unit_xp[sp, d_slot[sp]] += XP_DEFEND

    def _melee_exchange(self, att: torch.Tensor, tgt: torch.Tensor, tile_c: torch.Tensor,
                        d_slot: torch.Tensor, def_can_xp: torch.Tensor,
                        a_hp: torch.Tensor, u: int,
                        atk_e: torch.Tensor, def_e: torch.Tensor):
        """ONE melee exchange between two units — the `meleeAttack` core.

        The paired rolls, the defender-death write, XP_DEFEND to a survivor that
        can hold XP and the victor-survives rule are shared by every attacking
        pool. Only the CORE is shared: target selection, the roll-free civilian
        capture, the city-first precedence and the advance rules stay with each
        caller — those genuinely differ, and TS branches on them too.

        `d_slot` is the defender's MERGED pool slot, so this function never asks
        which pool the defender lives in. `def_can_xp` is the
        defender-earns-veterancy mask — barbarians never accrue, which is
        `SEAT_CAPS[...]["xp"]` expressed per row.

        DRAW ORDER is the parity contract: the defender's damage first, the
        counter second, exactly as TS's meleeAttack draws them.
        """
        d_def = self._damage_roll(att, atk_e - def_e, k="mel", tile=tgt)
        d_atk = self._damage_roll(att, def_e - atk_e, k="melc", tile=tgt)
        rows = att.nonzero(as_tuple=True)[0]
        def_dead = torch.zeros_like(att)
        if len(rows) > 0:
            ds = d_slot[rows]
            self.unit_hp[rows, ds] -= d_def[rows]
            dead = self.unit_hp[rows, ds] <= 0
            def_dead[rows[dead]] = True
            gd, td = rows[dead], tile_c[rows[dead]]
            self.unit_alive[gd, ds[dead]] = False
            self.military_at[gd, td] = -1
            self._dig_at(gd, td)  # killUnit's dig
        # +2 to a surviving MILITARY defender that can earn it.
        surv = (att & def_can_xp & ~def_dead).nonzero(as_tuple=True)[0]
        if len(surv) > 0:
            self.unit_xp[surv, d_slot[surv]] += XP_DEFEND
        a_hp[:, u] = torch.where(att, a_hp[:, u] - d_atk, a_hp[:, u])
        atk_dead = att & (a_hp[:, u] <= 0)
        both = def_dead & atk_dead
        a_hp[:, u] = torch.where(both, torch.ones_like(a_hp[:, u]), a_hp[:, u])  # victor survives
        atk_dead = atk_dead & ~def_dead
        return rows, def_dead, atk_dead

    def _hostile_city_attack(self, att: torch.Tensor, slot: torch.Tensor, atk_kind: str, u: int) -> None:
        """A hostile unit battering a SEAT-0 city (attackCity): garrison-aware
        defense, city-first rolls, sack at 0 HP."""
        if atk_kind == "barb":
            a_hp, a_tile, a_alive = self.barb_unit_hp, self.barb_unit_tile, self.barb_unit_alive
            a_occ = self.military_at
            atk_cs = self._type_combat[self.barb_unit_type[:, u]]
        else:
            a_hp, a_tile, a_alive = self.civ_unit_hp, self.civ_unit_tile, self.civ_unit_alive
            a_occ = self.military_at
            atk_cs = self._type_combat[self.civ_unit_type[:, u]]
        city_max_hp = int(self.rules.combat.get("cityMaxHp", 200))
        sitec = self.site.clamp(min=0)
        # cityDefenseStrength: max(15, strongest melee ever) + 5 when seat 0's
        # OWN military garrisons the center — a hostile standing there is a
        # besieger, not a garrison. No population term.
        _gm = self.military_at.gather(1, sitec)
        gm = torch.where((_gm >= 0) & (self.unit_seat.gather(1, _gm.clamp(min=0)) == 0), _gm, torch.full_like(_gm, -1))
        gar = (gm.gather(1, slot.clamp(min=0).unsqueeze(1)).squeeze(1) >= 0).long()
        def_cs = torch.maximum(self.best_melee, torch.full_like(self.best_melee, 15)) + gar * 5
        _ct = self.site.gather(1, slot.clamp(min=0).unsqueeze(1)).squeeze(1)
        # attacker veterancy, gated on the attacking class's `caps.xp` (see
        # _hostile_vs_unit for the same line).
        atk_lvl5 = (self._xp_lvl_bonus(self.civ_unit_xp[:, u]) if SEAT_CAPS[POOL_CLASS[atk_kind]]["xp"]
                    else torch.zeros_like(a_hp[:, u]))
        atk_e = atk_cs - self._wound(a_hp[:, u]) - 5.0 * self._river_cross(a_tile[:, u], _ct) + atk_lvl5  # wound + river (city not a unit) + veterancy
        # attackCity's atkCS carries the aura. Only a CIV attacker has one; a
        # BARBARIAN is civ -1 and structurally 0, so its branch emits no term.
        # Added once, before both paired rolls (pcty + the pctyc counter).
        if atk_kind == "civ":
            atk_naval = self.unit_naval[self.civ_unit_type[:, u].clamp(min=0, max=self.NU - 1)] | self.civ_unit_emb[:, u]
            # the enhancer ATTACKER adders apply to city assaults too —
            # Crusade/Just War key on where the UNIT stands, not on what it hits.
            # Added BEFORE the aura so term order matches the TS assembly.
            atk_e = atk_e + (self._rel_atk_cs(self.civ_unit_civ[:, u], _ct).to(atk_e.dtype) if self._city_rel_live else 0)
            atk_e = atk_e + self._gen_aura_cs(self.civ_unit_civ[:, u] + 1, a_tile[:, u], atk_naval).to(atk_e.dtype)
        d_city = self._damage_roll(att, atk_e - def_cs, k="pcty", tile=_ct)
        d_self = self._damage_roll(att, def_cs - atk_e, k="pctyc", tile=_ct)
        # the same city combat from the other side of the board.
        _ww_ad = att & ((a_hp[:, u] - d_self) <= 0)  # BEFORE the hp write
        # +5 for the attack executed (city is not a unit — no defender xp).
        if atk_kind == "civ":
            self.civ_unit_xp[:, u] = torch.where(att, self.civ_unit_xp[:, u] + XP_ATTACK, self.civ_unit_xp[:, u])
        rows = att.nonzero(as_tuple=True)[0]
        cs = slot[rows]
        # the ANCIENT_WALLS outer pool soaks the hit first, only
        # the spillover reaches city HP (mirrors attackCity).
        outer = self.outer_hp[rows, cs]
        absorbed = torch.minimum(outer, d_city[rows])
        self.outer_hp[rows, cs] = outer - absorbed
        self.city_hp[rows, cs] -= d_city[rows] - absorbed
        a_hp[:, u] = torch.where(att, a_hp[:, u] - d_self, a_hp[:, u])
        died = att & (a_hp[:, u] <= 0)
        # the same city combat from the other side of the board, carrying the
        # attacker's DEATH term.
        self._ww_battle(att, self._row_of(self._atk_seat(atk_kind, u)), 0, _ct,
                        a_died=_ww_ad, city=True)
        if bool(died.any()):
            dr = died.nonzero(as_tuple=True)[0]
            self._dig_at(dr, a_tile[dr, u])  # killUnit's dig
            a_occ[dr, a_tile[dr, u]] = -1
            a_alive[:, u] = a_alive[:, u] & ~died
        sacked_rows = rows[self.city_hp[rows, cs] <= 0]
        # a CIV conqueror TAKES the city, reusing the loyalty-flip transfer;
        # barbarians sack.
        if atk_kind == "civ" and len(sacked_rows) > 0:
            w_civ = self.civ_unit_civ[sacked_rows, u]
            for i in range(len(sacked_rows)):
                # the conqueror plunders +40 on a REAL transfer only — a raze at
                # the city cap pays nothing, as in TS.
                if self._transfer_city_to_civ(int(sacked_rows[i]), int(slot[sacked_rows[i]]), int(w_civ[i]), conquest=True):
                    self.civ_only_treasury[int(sacked_rows[i]), int(w_civ[i])] += 40.0
            sacked_rows = sacked_rows[:0]  # transferred, not sacked
        if len(sacked_rows) > 0:
            sc = slot[sacked_rows]
            self.pop[sacked_rows, sc] = ((self.pop[sacked_rows, sc] * 3) // 4).clamp(min=1)
            loss = torch.minimum(
                torch.tensor(100.0, dtype=self.dtype, device=self.device),
                # GS: milli-round the treasury first — sub-milli non-dyadic-gold drift (invisible at
                # the milli trace tolerance) otherwise tips the ×0.2 round across a .5 boundary,
                # making the sack differ by 1 gold vs TS (which mirrors this same milli-round).
                js_round(js_round(self.treasury[sacked_rows] * 1000) / 1000 * 0.2).to(self.dtype),
            )
            self.treasury[sacked_rows] -= loss
            self.city_hp[sacked_rows, sc] = round(city_max_hp / 2)
            if self.improvements_on:
                # sackCity pillages the improvements on the 6 tiles adjacent
                # to the sacked city's center.
                centers = self.site[sacked_rows, sc]  # [K]
                nb = self.neigh[centers]  # [K, 6]
                for d in range(6):
                    n_d = nb[:, d]
                    on = n_d >= 0
                    r2, t2 = sacked_rows[on], n_d[on]
                    hit = (self.improvement[r2, t2] >= 0) & ~self.pillaged[r2, t2]
                    self.pillaged[r2[hit], t2[hit]] = True
                self._eff_version += 1

    def _hostile_ranged_strike(self, att: torch.Tensor, tgt: torch.Tensor, atk_kind: str, u: int) -> torch.Tensor:
        """A hostile RANGED unit strikes tile tgt — the hostileRangedStrike twin:
        one roll, no retaliation, no advance.

        POOL-GENERIC, like _hostile_vs_unit: atk_kind 'civ' reads slot u of the
        v_ pool, 'barb' reads slot u of the u_ pool (the ARCHER / CROSSBOWMAN
        raiders). Hostility follows unitsHostile — a CIV attacker hits seat-0
        units and barbs but not other civs' units; a BARB attacker hits seat-0
        AND civ units and never another barb.

        A SEAT-0 city takes the hit first even through a garrison (meleeAttack's
        city precedence) and HOLDS at 1 HP — ranged fire never captures; else the
        units on the tile (military first; civilians take the roll too, which is
        rangedAttack's convention, not the melee roll-free kill or capture). A
        civ seat's center tile is the melee scan's same no-op: nothing happens,
        nothing is spent, so a barb ARCHER never batters an ungarrisoned CIV
        city, since TS's `enemyCity` only resolves to a seat-0 city. Barbs carry
        no religion, no general aura and never accrue XP (gainXp guards that).
        Returns the rows that actually struck (the acted set)."""
        ttc = tgt.clamp(min=0)
        barb = atk_kind == "barb"
        if barb:
            ut0 = self.barb_unit_type[:, u].clamp(min=0, max=self.NU - 1)
            atk_rs = self._type_ranged_strength[ut0]
            a_hp, a_tile = self.barb_unit_hp[:, u], self.barb_unit_tile[:, u]
            a_lvl = torch.zeros_like(a_hp)  # barbarians never accrue XP
            # A barb hull IS naval, but this flag only selects the
            # general-vs-ADMIRAL aura and a barbarian (civ -1) has no aura at
            # all, so the constant false is behaviourally exact.
            a_naval = torch.zeros(self.B, dtype=torch.bool, device=self.device)
        else:
            vt0 = self.civ_unit_type[:, u].clamp(min=0, max=self.NU - 1)
            atk_rs = self._type_ranged_strength[vt0]
            a_hp, a_tile = self.civ_unit_hp[:, u], self.civ_unit_tile[:, u]
            a_lvl = self._xp_lvl_bonus(self.civ_unit_xp[:, u])
            a_naval = self.unit_naval[vt0] | self.civ_unit_emb[:, u]
        tgt_city = self.center_at.gather(1, ttc.unsqueeze(1)).squeeze(1)
        city_att = att & (tgt_city >= 0)
        if bool(city_att.any()):
            # cityDefenseStrength: max(15, strongest melee ever) + 5 when seat
            # 0's own military garrisons the center
            _sitec = self.site.clamp(min=0)
            _gm = self.military_at.gather(1, _sitec)
            gm = torch.where((_gm >= 0) & (self.unit_seat.gather(1, _gm.clamp(min=0)) == 0), _gm, torch.full_like(_gm, -1))
            gar = (gm.gather(1, tgt_city.clamp(min=0).unsqueeze(1)).squeeze(1) >= 0).long()
            def_cs = torch.maximum(self.best_melee, torch.full_like(self.best_melee, 15)) + gar * 5
            atk_e = atk_rs - self._wound(a_hp) + a_lvl  # wound (city not a unit) + veterancy
            if not barb:
                # aura inside hostileRangedStrike's ranged-strength
                # parentheses, after xpLevelBonus.
                # the enhancer ATTACKER adders apply to city assaults too —
                # Crusade/Just War key on where the UNIT stands, not on what it hits.
                # Inserted BEFORE the aura add so term order matches the TS assembly.
                atk_e = atk_e + (self._rel_atk_cs(self.civ_unit_civ[:, u], tgt).to(atk_e.dtype) if self._city_rel_live else 0)
                atk_e = atk_e + self._gen_aura_cs(self.civ_unit_civ[:, u] + 1, a_tile, a_naval).to(atk_e.dtype)
            d_city = self._damage_roll(city_att, atk_e - def_cs, k="vrngc", tile=tgt)
            self._ww_battle(city_att, self._row_of(self._atk_seat(atk_kind, u)), 0, tgt, city=True)
            rows = city_att.nonzero(as_tuple=True)[0]
            cs_ = tgt_city[rows]
            self.city_hp[rows, cs_] = (self.city_hp[rows, cs_] - d_city[rows]).clamp(min=1)
        # units: the defender is the tile's MILITARY if any, else the lone
        # civilian — stacking blocks foreign units, so at most one owner
        # occupies the tile and the chain below is a priority, not a sum.
        # ONE defender slot in the merged pool: a military defender outranks a
        # civilian and stacking allows at most one of each per tile, so
        # "military if any, else civilian" is the whole priority chain, and every
        # defender term below is a single gather.
        mslot = self.military_at.gather(1, ttc.unsqueeze(1)).squeeze(1)
        cslot = self.civilian_at.gather(1, ttc.unsqueeze(1)).squeeze(1)
        neg = torch.full_like(mslot, -1)
        m_seat = torch.where(mslot >= 0, self.unit_seat.gather(1, mslot.clamp(min=0).unsqueeze(1)).squeeze(1), neg)
        c_seat = torch.where(cslot >= 0, self.unit_seat.gather(1, cslot.clamp(min=0).unsqueeze(1)).squeeze(1), neg)
        # The two ATTACKER-DEPENDENT scope-outs: a barb is never hostile to a
        # barb, and a civ ranged attacker never engages another civ's units.
        a_seat_r = BARB_SEAT if barb else self.civ_unit_seat[:, u].unsqueeze(1)
        elig_m = self._seats_hostile(a_seat_r, m_seat.unsqueeze(1)).squeeze(1)
        elig_c = self._seats_hostile(a_seat_r, c_seat.unsqueeze(1)).squeeze(1)
        if not barb:
            # a CIV's RANGED unit does not engage another civ's units at all —
            # a scope-out ON TOP of hostility, not instead of it.
            elig_m = elig_m & ~((m_seat > 0) & (m_seat != BARB_SEAT))
            elig_c = elig_c & ~((c_seat > 0) & (c_seat != BARB_SEAT))
        d_is_mil = elig_m
        civ_def = ~elig_m & elig_c  # a lone CIVILIAN defender (either owner)
        d_slot = torch.where(elig_m, mslot, torch.where(elig_c, cslot, neg))
        d_seat = torch.where(elig_m, m_seat, torch.where(elig_c, c_seat, neg))
        unit_att = att & (tgt_city < 0) & (d_slot >= 0)
        if bool(unit_att.any()):
            ds0 = d_slot.clamp(min=0)
            d_barb = d_seat == BARB_SEAT
            d_type = self.unit_type.gather(1, ds0.unsqueeze(1)).squeeze(1)
            def_cs = self._type_combat[d_type]
            def_fort = self.unit_fortify.gather(1, ds0.unsqueeze(1)).squeeze(1) * 3  # civilians hold 0
            # only a MILITARY defender carries veterancy; barbs and
            # civilians hold 0 in the merged xp plane, so this gate is belt
            # and braces rather than load-bearing.
            def_xp = torch.where(
                d_is_mil & ~d_barb,
                self._xp_lvl_bonus(self.unit_xp.gather(1, ds0.unsqueeze(1)).squeeze(1)),
                torch.zeros_like(mslot),
            )
            def_cs = def_cs + self._tdef_g(ttc) + def_fort + def_xp
            # an embarked defender → flat CS, no terrain/fortify/support.
            d_emb = self.unit_emb.gather(1, ds0.unsqueeze(1)).squeeze(1) & (d_slot >= 0)
            def_cs = torch.where(d_emb, torch.full_like(def_cs, self._embarked_defense_cs), def_cs)
            def_hp = self.unit_hp.gather(1, ds0.unsqueeze(1)).squeeze(1)  # wounded defender
            atk_e = atk_rs - self._wound(a_hp) + a_lvl  # wound + attacker veterancy
            def_e = def_cs - self._wound(def_hp)
            # support: the defender's own side's adjacent MILITARY aids it;
            # no flanking (ranged, no retaliation).
            _, _sp = self._flank_support(tgt, d_seat, torch.full_like(tgt, -1))
            def_e = def_e + SUPPORT_CS * torch.where(d_emb, torch.zeros_like(_sp), _sp)
            _dciv = torch.where((d_seat > 0) & ~d_barb, d_seat - 1, neg)  # civ index, else -1
            # enhancer adders. A CIV attacker gets the attack terms; a
            # BARB carries no faith. A CIV DEFENDER gets the defense terms.
            if not barb:
                atk_e = atk_e + (self._rel_atk_cs(self.civ_unit_civ[:, u], tgt).to(atk_e.dtype))  # NEVER gated
            def_e = def_e + torch.where(d_emb, torch.zeros_like(def_e), self._rel_def_cs(_dciv, tgt).to(def_e.dtype))
            # attacker aura on its OWN tile (barb: none); a barb or
            # a lone CIVILIAN defender gets none.
            if not barb:
                atk_e = atk_e + self._gen_aura_cs(self.civ_unit_civ[:, u] + 1, a_tile, a_naval).to(atk_e.dtype)
            def_civ_u = torch.where(d_is_mil & ~d_barb, d_seat, neg)
            def_naval = d_emb | (~d_barb & self.unit_naval[d_type.clamp(min=0, max=self.NU - 1)])
            def_e = def_e + self._gen_aura_cs(def_civ_u, tgt, def_naval).to(def_e.dtype)
            def_hp0 = self.unit_hp[torch.arange(self.B, device=self.device), d_slot.clamp(min=0)]
            d_def = self._damage_roll(unit_att, atk_e - def_e, k="vrng", tile=tgt)
            g = unit_att.nonzero(as_tuple=True)[0]
            ds = d_slot[g]  # paired rows — gather(1, …) would read rows 0..|g|
            self.unit_hp[g, ds] -= d_def[g]
            dead = self.unit_hp[g, ds] <= 0
            gd, td = g[dead], ttc[g[dead]]
            self.unit_alive[gd, ds[dead]] = False
            self._dig_at(gd, td)  # killUnit's dig
            # Clearing both maps is branch-free and exact: only one of them is
            # set on that tile.
            md = d_is_mil[gd]
            mg, mt = gd[md], td[md]
            cg, ct2 = gd[~md], td[~md]
            self.military_at[mg, mt] = -1
            self.civilian_at[cg, ct2] = -1
            # `d_seat` is the DEFENDER this arm actually picked, military OR
            # civilian. Reading the tile's military occupant instead would drop
            # every strike on a lone civilian from the war-weariness score.
            self._ww_battle(unit_att, self._row_of(self._atk_seat(atk_kind, u)),
                            self._row_of(d_seat), tgt,
                            d_died=unit_att & (d_slot >= 0) & ((def_hp0 - d_def) <= 0))
            if bool((unit_att & civ_def).any()):
                self._gen_ver += 1  # a struck lone civilian may be a general
            # a surviving MILITARY defender earns +2 (barbs never accrue).
            surv = (unit_att & d_is_mil & ~d_barb).nonzero(as_tuple=True)[0]
            if len(surv) > 0:
                sd = d_slot[surv]
                sp = surv[self.unit_hp[surv, sd] > 0]
                if len(sp) > 0:
                    self.unit_xp[sp, d_slot[sp]] += XP_DEFEND
        # the CIV attacker earns +5 for the attack executed (vs city or unit); a
        # barbarian never accrues (gainXp guards); a strike that hit neither
        # returns empty and spends nothing.
        if not barb:
            self.civ_unit_xp[:, u] = torch.where(city_att | unit_att, self.civ_unit_xp[:, u] + XP_ATTACK, self.civ_unit_xp[:, u])
        return city_att | unit_att

    def _seat_influence_phase(self, row: int, active: torch.Tensor) -> None:
        """Meet + influence → envoy conversion for ONE seat row (0 = seat 0,
        r+1 = civ r) — the seatPhase CS-diplomacy accrual, one body for every
        seat. Meet is by EXPLORATION (isExplored at the CS centre — fog is
        live; the proximity surrogate is deleted, scouting is what meets, the
        real Civ 6 rule). The accrual is influencePerTurn + this seat's own
        adopted-government tier (computeAdoption on ITS civics). CONVERSION
        IS A RULE: Civ 6 grants the envoy the moment the meter fills,
        assigned or not — WHERE it goes is the wire's decision, applied at
        each row's own pick position."""
        if self.S == 0:
            return
        B, S, dev = self.B, self.S, self.device
        rr = self.rules.citystate
        csc = self.citystate_center[:, :S].clamp(min=0)  # [B, S]
        met = self.seat_citystate_met[:, row, :S]
        newly = active.unsqueeze(1) & self.citystate_alive[:, :S] & ~met & self._explored_at(row, csc)
        self.seat_citystate_met[:, row, :S] = met | newly
        met_live = self.seat_citystate_met[:, row, :S] & self.citystate_alive[:, :S]
        any_met = active & met_live.any(dim=1)
        if not bool(any_met.any()):
            return
        civics = self.civics if row == 0 else self.civ_only_civics[:, row - 1]
        pt = torch.full((B,), float(rr.get("influencePerTurn", 3)), dtype=torch.float64, device=dev)
        if self._gov_live:
            pt = pt + self._adopted_gov_tier(civics).double()
        self.civ_influence[:, row] = self.civ_influence[:, row] + torch.where(any_met, pt, torch.zeros_like(pt)).to(self.civ_influence.dtype)
        cost = float(rr.get("envoyCost", 100))
        for _ in range(3):  # the conversion loop's bound
            earn = any_met & (self.civ_influence[:, row] >= cost)
            if not bool(earn.any()):
                break
            self.civ_influence[:, row] = torch.where(earn, self.civ_influence[:, row] - cost, self.civ_influence[:, row])
            self.civ_envoys_avail[:, row] = self.civ_envoys_avail[:, row] + earn.long()

    def _seat_cs_phase(self, r: int, active: torch.Tensor) -> None:
        """CS diplomacy from a civ seat — the seatPhase block after boost
        detection: the shared meet/influence/conversion body on this row,
        then the driven envoy picks at the post-accrual position."""
        if self.S == 0:
            return
        S = self.S
        self._seat_influence_phase(r + 1, active)
        # the DRIVEN envoy picks consume HERE, at the post-accrual position,
        # so every threshold reader (suzerainty, and the favor it feeds) sees
        # the same within-turn sequence on both engines. BANK ONLY:
        # conversion is an eager rule above, so a decide-time pick can never
        # exceed the bank.
        _dse = getattr(self, "_driven_envoys", None)
        if _dse is not None and r in _dse:
            _env_s = _dse.pop(r)
            for _k in range(int(_env_s.shape[1])):
                e_k = _env_s[:, _k]
                citystate_i = e_k.clamp(min=0, max=S - 1)
                ok_e = (
                    (e_k >= 0) & (e_k < S) & self.controlled[:, r] & self.civ_only_alive[:, r]
                    & self.citystate_alive[:, :S].gather(1, citystate_i.unsqueeze(1)).squeeze(1)
                    & self.civ_only_citystate_met[:, r, :S].gather(1, citystate_i.unsqueeze(1)).squeeze(1)
                )
                land_e = ok_e & (self.civ_only_envoys_avail[:, r] > 0)
                if not bool(land_e.any()):
                    continue
                self.civ_only_envoys_avail[:, r] = self.civ_only_envoys_avail[:, r] - land_e.long()
                self.civ_only_citystate_envoys[:, r, :S].scatter_add_(1, citystate_i.unsqueeze(1), land_e.long().unsqueeze(1))

    def _quest_owns_dist(self, row: int) -> torch.Tensor:
        """[B, S] — does seat-row `row` own a COMPLETE district of each CS's
        asked type (the CS type's own, _citystate_didx):
        questSatisfied's buildDistrict and issueQuest's `alreadyBuilt`. ONE
        registry read for every row — city_dist_tile[:, row]; dead columns
        are cleared at every city-exit path, so no alive gate is needed."""
        B, S = self.B, self.S
        if not self.districts_on:
            return torch.zeros(B, S, dtype=torch.bool, device=self.device)
        dt = self.city_dist_tile[:, row]  # [B, cols, nD]
        nCol, nD = dt.shape[1], dt.shape[2]
        di = self._citystate_didx[:, :S].clamp(min=0, max=nD - 1)  # [B, S]
        own_tile = dt.unsqueeze(1).expand(B, S, nCol, nD).gather(
            3, di.reshape(B, S, 1, 1).expand(B, S, nCol, 1)
        ).squeeze(3)  # [B, S, cols] tile of the CS-type district per city
        own_dc = self.district_complete.gather(1, own_tile.clamp(min=0).reshape(B, -1)).reshape(B, S, nCol)
        return ((own_tile >= 0) & own_dc).any(dim=2)  # [B, S]

    def _seat_quest_phase(self, row: int, active: torch.Tensor) -> None:
        """City-state quests for ONE seat row (0 = seat 0, r+1 = civ r) — the
        ZERO-DRAW twin of the seatPhase quest loop (issueQuest /
        questSatisfied), called right after the CS-diplomacy accrual. Each
        MET CS keeps ONE quest per seat (seat_citystate_quest[:, row]); a
        satisfied one resolves here (+questEnvoys to this seat's
        seat_citystate_envoys — a yield-bearing write, so _eff_version
        bumps), else a new one issues on cooldown expiry. The kind is
        DETERMINISTIC — no RNG: the FIRST SATISFIABLE option in the fixed
        order [clearCamp (nearest camp ≤6, ties lowest tile idx),
        buildDistrict (the CS type's district, from _citystate_didx),
        sendTradeRoute]. The asked district is NOT stored — it is always the
        CS type's own, so resolve re-derives it (the old seat-0
        citystate_quest_district plane is dead)."""
        if self.S == 0:
            return
        B, S, dev = self.B, self.S, self.device
        rr = self.rules.citystate
        cooldown = int(rr.get("questCooldown", 12))
        q_env = int(rr.get("questEnvoys", 1))
        csc = self.citystate_center[:, :S].clamp(min=0)  # [B, S]
        met_live = self.seat_citystate_met[:, row, :S] & self.citystate_alive[:, :S]
        act = active.unsqueeze(1) & met_live  # [B, S]
        if not bool(act.any()):
            return
        # --- seat state used by BOTH resolve and issue (loop-invariant) -----
        owns_dist = self._quest_owns_dist(row)  # [B, S]
        # sendTradeRoute: this seat routes to CS s (route dest == -(2+s)).
        route_dest = self.seat_routes[:, row, :, 1]  # [B, K_routes]
        s_ar = torch.arange(S, device=dev)
        has_route = (route_dest.unsqueeze(1) == (-(2 + s_ar)).reshape(1, S, 1)).any(dim=2)  # [B, S]
        # clearCamp: the NEAREST camp within range 6, ties to the lowest tile
        # index (key = dist·(T+1)+tile, issueQuest's key).
        cdist = self.pair_dist[csc.unsqueeze(2), self.camp_tile.clamp(min=0).unsqueeze(1)].to(torch.long)  # [B, S, K]
        near_c = (self.camp_tile >= 0).unsqueeze(1) & (cdist <= 6)  # [B, S, K]
        span = self.T + 1
        key_c = torch.where(near_c, cdist * span + self.camp_tile.clamp(min=0).unsqueeze(1), torch.full_like(cdist, 10**18))
        best_k = key_c.argmin(dim=2)  # [B, S]
        has_camp = near_c.any(dim=2)  # [B, S]
        camp_nearest = torch.where(has_camp, self.camp_tile.gather(1, best_k), torch.full((B, S), -1, dtype=torch.long, device=dev))

        # --- RESOLVE existing quests (questSatisfied) ------------------------
        cur = self.seat_citystate_quest[:, row, :S]  # [B, S]
        camp_gone = ~(
            (self.camp_tile.unsqueeze(1) == self.seat_citystate_quest_camp[:, row, :S].unsqueeze(2)) & (self.camp_tile >= 0).unsqueeze(1)
        ).any(dim=2)  # [B, S]
        res_camp = act & (cur == 1) & camp_gone
        res_trade = act & (cur == 2) & has_route
        res_dist = act & (cur == 3) & owns_dist
        resolved = res_camp | res_trade | res_dist
        if bool(resolved.any()):
            self.seat_citystate_quest[:, row, :S] = torch.where(resolved, torch.zeros_like(cur), cur)
            self.seat_citystate_quest_issued[:, row, :S] = torch.where(resolved, torch.full_like(cur, self.turn), self.seat_citystate_quest_issued[:, row, :S])
            self.seat_citystate_envoys[:, row, :S] = self.seat_citystate_envoys[:, row, :S] + resolved.long() * q_env
            self._eff_version += 1  # envoy bonuses feed this seat's city yields this phase

        # --- ISSUE on cooldown (deterministic first-satisfiable) ------------
        cur2 = self.seat_citystate_quest[:, row, :S]  # resolved ones now 0
        due = act & (cur2 == 0) & (self.turn - self.seat_citystate_quest_issued[:, row, :S] >= cooldown)  # [B, S]
        if bool(due.any()):
            want_camp = due & has_camp
            want_dist = due & ~has_camp & ~owns_dist
            want_trade = due & ~has_camp & owns_dist & ~has_route
            new_kind = want_camp.long() * 1 + want_dist.long() * 3 + want_trade.long() * 2  # 0 = nothing applies
            issued = new_kind > 0
            self.seat_citystate_quest[:, row, :S] = torch.where(issued, new_kind, cur2)
            self.seat_citystate_quest_issued[:, row, :S] = torch.where(issued, torch.full_like(cur2, self.turn), self.seat_citystate_quest_issued[:, row, :S])
            self.seat_citystate_quest_camp[:, row, :S] = torch.where(want_camp, camp_nearest, self.seat_citystate_quest_camp[:, row, :S])

    def _seat_trade_phase(self, r: int, active: torch.Tensor) -> None:
        """ONE new domestic route per civ per turn while under capacity — the
        seatPhase creation block. Capacity mirrors tradeCapacity: FOREIGN_TRADE
        civic +1, Market-OR-Lighthouse per living city +1 (non-cumulative),
        completed Colossus/Great Zimbabwe +1 each, plus the trade-CS suzerain
        term below. Pair pick mirrors the TS scan exactly: best NEW in-range pair
        by routeYields(dest) food+prod sum — dest-only, 2 + 2*floor(
        destCompletedSpecialty/2) — with strictly-greater-beats semantics, so
        ties keep the FIRST pair in (from asc, to asc) slot order. rc slot order
        IS TS array order: founding/capture/transfer all append at last-alive+1
        and _reclaim_civ_cities is stable."""
        B, RC, dev = self.B, self.RC, self.device
        alive = self.civ_city_alive[:, r]  # [B, RC]
        # ONE city suffices — a met CS is a routable dest, and the TS gate is
        # civ.cities.length >= 1. Domestic pairs still need 2, via the pair masks
        # below.
        want = active & (alive.sum(dim=1) >= 1)
        if not bool(want.any()):
            self._expire_seat_routes(r)  # expiry is unconditional
            return
        cap = torch.zeros(B, dtype=torch.long, device=dev)
        if self._trade_ftc >= 0:
            cap = cap + self.civ_only_civics[:, r, self._trade_ftc].long()
        mkt = torch.zeros(B, RC, dtype=torch.bool, device=dev)
        if self._trade_mkt >= 0:
            mkt = mkt | self.civ_city_bldg[:, r, :, self._trade_mkt]
        if self._trade_lgh >= 0:
            mkt = mkt | self.civ_city_bldg[:, r, :, self._trade_lgh]
        cap = cap + (mkt & alive).sum(dim=1)
        for wi in self._trade_wonders:
            wt = self.civ_city_wonder[:, r, :, wi]  # [B, RC] — wonder wi's tile per slot
            cap = cap + ((wt >= 0) & alive & self.built_wonder_complete.gather(1, wt.clamp(min=0))).sum(dim=1)
        # +1 per trade-type CS this civ is SUZERAIN of — the strict contest:
        # >= suzerainEnvoys, strictly more than seat 0 AND every other civ,
        # alive-gated like TS's existing-cityStates iteration.
        S = self.S
        if S > 0:
            trade_ti = int(self.rules.citystate.get("tradeIdx", -1))
            suz_min = int(self.rules.citystate.get("suzerainEnvoys", 3))
            mine_e = self.civ_only_citystate_envoys[:, r, :S]  # [B, S]
            oth_e = self.civ_only_citystate_envoys[:, :, :S].clone()
            oth_e[:, r] = -1
            oth_max = oth_e.max(dim=1).values  # [B, S]
            suz_r = (
                (mine_e >= suz_min)
                & (mine_e > self.citystate_envoys[:, :S])
                & (mine_e > oth_max)
                & self.citystate_alive[:, :S]
            )
            cap = cap + (suz_r & (self.citystate_type[:, :S] == trade_ti)).sum(dim=1)
        used = (self.civ_only_routes[:, r, :, 0] >= 0).sum(dim=1)
        want = want & (used < cap)
        if not bool(want.any()):
            self._expire_seat_routes(r)  # expiry runs even at capacity
            return
        # dest score (j-only): routeYields food+prod = 2 + 2*floor(spec/2)
        dt = self.civ_city_dist_tile[:, r]  # [B, RC, nD]
        comp = (dt >= 0) & self.district_complete.gather(1, dt.clamp(min=0).reshape(B, -1)).reshape_as(dt)
        spec = (comp & self._is_specialty.reshape(1, 1, -1)).sum(dim=2)  # [B, RC]
        ysum = 2 + 2 * (spec // 2)  # [B, RC] long, >= 2
        centers = self.civ_city_center[:, r].clamp(min=0)  # [B, RC]
        d = self.pair_dist[centers.unsqueeze(2), centers.unsqueeze(1)]  # [B, RC, RC]
        ids = self.civ_city_id[:, r]  # [B, RC]
        rr = self.civ_only_routes[:, r]  # [B, K, 2]
        exists = (
            (rr[:, :, 0].reshape(B, 1, 1, -1) == ids.reshape(B, RC, 1, 1))
            & (rr[:, :, 1].reshape(B, 1, 1, -1) == ids.reshape(B, 1, RC, 1))
        ).any(dim=3)  # [B, RC, RC]
        eye = torch.eye(RC, dtype=torch.bool, device=dev).reshape(1, RC, RC)
        valid = (
            alive.unsqueeze(2)
            & alive.unsqueeze(1)
            & ~eye
            & (d <= self._trade_range)
            & ~exists
            & want.reshape(B, 1, 1)
        )
        key = torch.where(valid, ysum.unsqueeze(1).expand(B, RC, RC), torch.full((B, RC, RC), -1, dtype=torch.long, device=dev))
        # MET city-states join each origin's candidate list AFTER the domestic
        # dests, matching TS's per-from iteration order (cities asc, then CS
        # asc); the i-major flat scan preserves it. A CS route's ySum is the flat
        # cityStateRouteYields total (gold + specialty).
        W2 = RC
        if S > 0:
            _tr = self.rules.trade or {}
            ysum_cs = int(_tr.get("cityStateRouteGold", 3)) + int(_tr.get("cityStateRouteSpec", 1))
            csc = self.citystate_center[:, :S].clamp(min=0)  # [B, S]
            d_cs = self.pair_dist[centers.unsqueeze(2), csc.unsqueeze(1)]  # [B, RC, S]
            citystate_to = -(2 + torch.arange(S, device=dev))  # encoded dest ids
            exists_cs = (
                (rr[:, :, 0].reshape(B, 1, 1, -1) == ids.reshape(B, RC, 1, 1))
                & (rr[:, :, 1].reshape(B, 1, 1, -1) == citystate_to.reshape(1, 1, S, 1))
            ).any(dim=3)  # [B, RC, S]
            valid_cs = (
                alive.unsqueeze(2)
                & (self.civ_only_citystate_met[:, r, :S] & self.citystate_alive[:, :S]).unsqueeze(1)
                & (d_cs <= self._trade_range)
                & ~exists_cs
                & want.reshape(B, 1, 1)
            )
            key_cs = torch.where(valid_cs, torch.full((B, RC, S), ysum_cs, dtype=torch.long, device=dev), torch.full((B, RC, S), -1, dtype=torch.long, device=dev))
            key = torch.cat([key, key_cs], dim=2)  # [B, RC, RC+S]
            W2 = RC + S
        kf = key.reshape(B, RC * W2)  # i-major flat order = the TS from-asc, dests-then-CS scan
        kmax, _ = kf.max(dim=1)
        first = torch.where(kf == kmax.unsqueeze(1), torch.arange(RC * W2, device=dev).reshape(1, -1), torch.full((1, RC * W2), RC * W2, device=dev)).min(dim=1).values
        K = self.civ_only_routes.shape[2]
        exp_val = int(self.turn) + self._trade_duration

        def _free_slot(rws: torch.Tensor) -> torch.Tensor:
            free = self.civ_only_routes[rws, r, :, 0] < 0  # [n, K]
            s = torch.where(free, torch.arange(K, device=dev).reshape(1, -1), torch.full((1, K), K, device=dev)).min(dim=1).values
            assert int(s.max()) < K, "civ_only_routes columns exhausted — raise K above the capacity bound"
            return s

        do = want & (kmax >= 0)
        if bool(do.any()):
            rows = do.nonzero(as_tuple=True)[0]
            i_pick = (first[rows] // W2)
            jj_pick = (first[rows] % W2)
            from_id = ids[rows, i_pick]
            to_id = torch.where(jj_pick < RC, ids[rows, jj_pick.clamp(max=RC - 1)], -(2 + (jj_pick - RC)))
            slot = _free_slot(rows)
            self.civ_only_routes[rows, r, slot, 0] = from_id
            self.civ_only_routes[rows, r, slot, 1] = to_id
            self.civ_only_route_dest[rows, r, slot] = -1  # domestic/CS
            self.civ_only_route_exp[rows, r, slot] = exp_val
            # the route's Trader lays road along its land path.
            # i_pick / jj_pick ARE the slot indices the ids arrays are keyed by,
            # so the centres come straight off them (CS destinations sit past RC).
            _o = self.civ_city_center[rows, r, i_pick]
            _d = torch.where(
                jj_pick < RC,
                self.civ_city_center[rows, r, jj_pick.clamp(max=RC - 1)],
                self.citystate_center[rows, (jj_pick - RC).clamp(min=0, max=max(self.S - 1, 0))],
            )
            self._lay_trade_road(rows, _o, _d)

        # international: rows that WANT a route but found no domestic/CS
        # candidate consider ANY OTHER MAJOR's city whose centre this civ has
        # EXPLORED (fog is the meeting rule here, as for city-states) —
        # NEAREST-city preference (min hex distance; ties keep from-asc,
        # dest-asc in the TS state.seats scan order: seat 0's cities first,
        # then the other civ seats by id). civ↔civ routes exist since the
        # geopolitics verbs did; the old civs-cannot-meet descope is dead.
        intl_want = want & (kmax < 0)
        C = self.C
        if bool(intl_want.any()) and C > 0:
            dctr_l = [self.site.clamp(min=0)]  # seat 0's centres lead the scan
            dalv_l = [self.alive]
            for r2 in range(self.R):
                if r2 == r:
                    continue
                dctr_l.append(self.civ_city_center[:, r2].clamp(min=0))
                dalv_l.append(self.civ_city_alive[:, r2])
            dctr = torch.cat(dctr_l, dim=1)  # [B, D] dest centre tiles
            dalv = torch.cat(dalv_l, dim=1)  # [B, D]
            D = dctr.shape[1]
            centers = self.civ_city_center[:, r].clamp(min=0)  # [B, RC]
            d_ip = self.pair_dist[centers.unsqueeze(2), dctr.unsqueeze(1)]  # [B, RC, D]
            rts = self.civ_only_routes[:, r]  # [B, K, 2]
            rd = self.civ_only_route_dest[:, r]  # [B, K]
            act2 = rts[:, :, 0] >= 0  # [B, K]
            # already-connected: an ACTIVE intl route from rc i to dest tile d
            exists_ip = (
                (rts[:, :, 0].reshape(B, 1, 1, -1) == ids.reshape(B, RC, 1, 1))
                & (rd.reshape(B, 1, 1, -1) == dctr.reshape(B, 1, D, 1))
                & act2.reshape(B, 1, 1, -1)
            ).any(dim=3)  # [B, RC, D] (rd is -1 for domestic/CS → never == dctr>=0)
            valid_ip = (
                alive.unsqueeze(2)
                & dalv.unsqueeze(1)
                & self._explored_at(r + 1, dctr).unsqueeze(1)  # isExplored gate
                & (d_ip <= self._trade_range)
                & ~exists_ip
                & intl_want.reshape(B, 1, 1)
            )
            BIG = 1 << 30
            dkey = torch.where(valid_ip, d_ip.long(), torch.full((B, RC, D), BIG, dtype=torch.long, device=dev))
            df = dkey.reshape(B, RC * D)  # i-major = from-asc, dest-asc (scan order)
            dmin, _ = df.min(dim=1)
            firsti = torch.where(df == dmin.unsqueeze(1), torch.arange(RC * D, device=dev).reshape(1, -1), torch.full((1, RC * D), RC * D, device=dev)).min(dim=1).values
            doi = intl_want & (dmin < BIG)
            if bool(doi.any()):
                rows = doi.nonzero(as_tuple=True)[0]
                i_pick = (firsti[rows] // D)
                c_pick = (firsti[rows] % D)
                from_id = ids[rows, i_pick]
                dest_tile = dctr[rows, c_pick]
                slot = _free_slot(rows)
                self.civ_only_routes[rows, r, slot, 0] = from_id
                self.civ_only_routes[rows, r, slot, 1] = -1  # intl: dest carried in civ_only_route_dest
                self.civ_only_route_dest[rows, r, slot] = dest_tile
                self.civ_only_route_exp[rows, r, slot] = exp_val
                # the international route lays road too (dest_tile is already the
                # destination city's CENTRE tile).
                self._lay_trade_road(rows, self.civ_city_center[rows, r, i_pick], dest_tile)

        # after the pick, expire due routes; freed capacity re-picks NEXT turn.
        # This ALWAYS runs — TS applies the expiry filter OUTSIDE the
        # capacity-gated pick block, so an at-capacity civ still sheds its
        # expiring route, which is why the early returns above call it too.
        self._expire_seat_routes(r)

    def _seat0_trade_phase(self, active0: torch.Tensor) -> None:
        """Seat 0's trade arm — the seatPhase loop-body position (row 0's
        block): ONE new route per turn while under capacity, then expiry.
        The _seat_trade_phase twin over seat-0 planes, writing
        seat_routes[:, 0] with the shared encoding (from/to = seat-0 city
        COLUMNS, CS dest -(2+s), intl dest -1 + centre tile in
        seat_route_dest). Capacity mirrors tradeCapacity: FOREIGN_TRADE +
        Market-or-Lighthouse per living city + completed Colossus/GZ +
        trade-CS suzerainty. ORDER: TS scans actor.cities in ARRAY order,
        which for seat 0 is city_seq order, NOT column order (foundings
        reuse holes) — so ties break on an explicit seq-rank key, unlike the
        civ arm whose slots are append-only."""
        B, C, S, dev = self.B, self.C, self.S, self.device
        want = active0 & (self.alive.sum(dim=1) >= 1)
        rts0 = self.seat_routes[:, 0]  # [B, K, 2]
        if not bool(want.any()):
            self._expire_seat0_routes()
            return
        cap = torch.zeros(B, dtype=torch.long, device=dev)
        if self._trade_ftc >= 0:
            cap = cap + self.civics[:, self._trade_ftc].long()
        mkt0 = torch.zeros(B, C, dtype=torch.bool, device=dev)
        if self._trade_mkt >= 0:
            mkt0 = mkt0 | self.buildings[:, :, self._trade_mkt]
        if self._trade_lgh >= 0:
            mkt0 = mkt0 | self.buildings[:, :, self._trade_lgh]
        cap = cap + (mkt0 & self.alive).sum(dim=1)
        for wi in self._trade_wonders:
            cap = cap + ((self.built_wonder == wi) & self.built_wonder_complete & (self.tile_seat == 0)).sum(dim=1)
        if S > 0:
            trade_ti = int(self.rules.citystate.get("tradeIdx", -1))
            suz_min = int(self.rules.citystate.get("suzerainEnvoys", 3))
            mine0 = self.citystate_envoys[:, :S]  # [B, S] seat 0's envoys
            civ_max = self.civ_only_citystate_envoys[:, :, :S].max(dim=1).values if self.R > 0 else torch.zeros_like(mine0)
            suz0 = (mine0 >= suz_min) & (mine0 > civ_max) & self.citystate_alive[:, :S]
            cap = cap + (suz0 & (self.citystate_type[:, :S] == trade_ti)).sum(dim=1)
        used = (rts0[:, :, 0] >= 0).sum(dim=1)
        want = want & (used < cap)
        if not bool(want.any()):
            self._expire_seat0_routes()
            return
        # dest score: routeYields food+prod = 2 + 2*floor(destCompletedSpecialty/2)
        own_spec0 = (self.district >= 0) & self._is_specialty[self.district.clamp(min=0)] & self.district_complete & (self.tile_seat == 0)
        spec0 = torch.zeros(B, C, dtype=torch.long, device=dev).scatter_add_(1, self.owner.clamp(min=0), own_spec0.long())
        ysum0 = 2 + 2 * (spec0 // 2)  # [B, C]
        sites = self.site.clamp(min=0)  # [B, C]
        d00 = self.pair_dist[sites.unsqueeze(2), sites.unsqueeze(1)]  # [B, C, C]
        cols = torch.arange(C, device=dev)
        exists0 = (
            (rts0[:, :, 0].reshape(B, 1, 1, -1) == cols.reshape(1, C, 1, 1))
            & (rts0[:, :, 1].reshape(B, 1, 1, -1) == cols.reshape(1, 1, C, 1))
        ).any(dim=3)  # [B, C, C]
        eye0 = torch.eye(C, dtype=torch.bool, device=dev).reshape(1, C, C)
        valid0 = (
            self.alive.unsqueeze(2) & self.alive.unsqueeze(1) & ~eye0
            & (d00 <= self._trade_range) & ~exists0 & want.reshape(B, 1, 1)
        )
        # seq-rank tie-break: rank[c] = this column's position in city_seq
        # order among LIVE cities (dead columns sort last, masked anyway).
        seq_key = torch.where(self.alive, self.city_seq, self.city_seq + 10**6)
        rank = torch.empty(B, C, dtype=torch.long, device=dev)
        rank.scatter_(1, seq_key.argsort(dim=1, stable=True), cols.expand(B, C))
        W2 = C + max(S, 0)
        # key = score·BIG − scan position (from-rank major, then dests: own
        # cities by rank, then CS by index) → argmax = strictly-greater-wins,
        # ties keep the FIRST pair in the TS scan order.
        BIGT = C * W2 + 1
        tie00 = rank.reshape(B, C, 1) * W2 + rank.reshape(B, 1, C)
        key0 = torch.where(valid0, ysum0.reshape(B, 1, C).expand(B, C, C) * BIGT - tie00, torch.full((B, C, C), -(10**12), dtype=torch.long, device=dev))
        if S > 0:
            _tr0 = self.rules.trade or {}
            ysum_cs0 = int(_tr0.get("cityStateRouteGold", 3)) + int(_tr0.get("cityStateRouteSpec", 1))
            csc0 = self.citystate_center[:, :S].clamp(min=0)
            d_cs0 = self.pair_dist[sites.unsqueeze(2), csc0.unsqueeze(1)]  # [B, C, S]
            citystate_to0 = -(2 + torch.arange(S, device=dev))
            exists_cs0 = (
                (rts0[:, :, 0].reshape(B, 1, 1, -1) == cols.reshape(1, C, 1, 1))
                & (rts0[:, :, 1].reshape(B, 1, 1, -1) == citystate_to0.reshape(1, 1, S, 1))
            ).any(dim=3)  # [B, C, S]
            valid_cs0 = (
                self.alive.unsqueeze(2)
                & (self.citystate_met[:, :S] & self.citystate_alive[:, :S]).unsqueeze(1)
                & (d_cs0 <= self._trade_range) & ~exists_cs0 & want.reshape(B, 1, 1)
            )
            tie_cs0 = rank.reshape(B, C, 1) * W2 + C + torch.arange(S, device=dev).reshape(1, 1, S)
            key_cs0 = torch.where(valid_cs0, ysum_cs0 * BIGT - tie_cs0, torch.full((B, C, S), -(10**12), dtype=torch.long, device=dev))
            key0 = torch.cat([key0, key_cs0], dim=2)  # [B, C, W2]
        kf0 = key0.reshape(B, C * W2)
        kmax0, karg0 = kf0.max(dim=1)
        K0 = rts0.shape[1]
        exp_val0 = int(self.turn) + self._trade_duration

        def _free_slot0(rws: torch.Tensor) -> torch.Tensor:
            free = self.seat_routes[rws, 0, :, 0] < 0
            s_ = torch.where(free, torch.arange(K0, device=dev).reshape(1, -1), torch.full((1, K0), K0, device=dev)).min(dim=1).values
            assert int(s_.max()) < K0, "seat_routes row-0 columns exhausted — raise K above the capacity bound"
            return s_

        do0 = want & (kmax0 > -(10**12))
        if bool(do0.any()):
            rows = do0.nonzero(as_tuple=True)[0]
            i_pick = karg0[rows] // W2
            jj_pick = karg0[rows] % W2
            to_enc = torch.where(jj_pick < C, jj_pick.clamp(max=C - 1), -(2 + (jj_pick - C)))
            slot = _free_slot0(rows)
            self.seat_routes[rows, 0, slot, 0] = i_pick
            self.seat_routes[rows, 0, slot, 1] = to_enc
            self.seat_route_dest[rows, 0, slot] = -1
            self.seat_route_exp[rows, 0, slot] = exp_val0
            _o0 = sites[rows, i_pick]
            _d0 = torch.where(
                jj_pick < C,
                sites[rows, jj_pick.clamp(max=C - 1)],
                self.citystate_center[rows, (jj_pick - C).clamp(min=0, max=max(S - 1, 0))],
            )
            self._lay_trade_road(rows, _o0, _d0)
        # international: no domestic/CS candidate → the nearest EXPLORED
        # other-major city (the TS scan: seat 0's actor sees civ seats only).
        intl_want0 = want & (kmax0 <= -(10**12))
        if bool(intl_want0.any()) and self.R > 0:
            vctr = self.civ_city_center.reshape(B, -1).clamp(min=0)  # [B, R*RC] civ centres, seat-asc city-asc
            valv = self.civ_city_alive.reshape(B, -1)
            Dv = vctr.shape[1]
            rd0 = self.seat_route_dest[:, 0]  # [B, K]
            act0r = rts0[:, :, 0] >= 0
            exists_i0 = (
                (rts0[:, :, 0].reshape(B, 1, 1, -1) == cols.reshape(1, C, 1, 1))
                & (rd0.reshape(B, 1, 1, -1) == vctr.reshape(B, 1, Dv, 1))
                & act0r.reshape(B, 1, 1, -1)
            ).any(dim=3)  # [B, C, Dv]
            d_i0 = self.pair_dist[sites.unsqueeze(2), vctr.unsqueeze(1)]  # [B, C, Dv]
            valid_i0 = (
                self.alive.unsqueeze(2) & valv.unsqueeze(1)
                & self._explored_at(0, vctr).unsqueeze(1)
                & (d_i0 <= self._trade_range) & ~exists_i0 & intl_want0.reshape(B, 1, 1)
            )
            # nearest-first, ties by (from seq-rank, dest scan position)
            BIGD = C * Dv + 1
            tie_i0 = rank.reshape(B, C, 1) * Dv + torch.arange(Dv, device=dev).reshape(1, 1, Dv)
            ikey = torch.where(valid_i0, d_i0.long() * BIGD + tie_i0, torch.full((B, C, Dv), 10**15, dtype=torch.long, device=dev))
            ifl = ikey.reshape(B, C * Dv)
            imin, iarg = ifl.min(dim=1)
            doi0 = intl_want0 & (imin < 10**15)
            if bool(doi0.any()):
                rows = doi0.nonzero(as_tuple=True)[0]
                i_pick = iarg[rows] // Dv
                c_pick = iarg[rows] % Dv
                slot = _free_slot0(rows)
                self.seat_routes[rows, 0, slot, 0] = i_pick
                self.seat_routes[rows, 0, slot, 1] = -1
                self.seat_route_dest[rows, 0, slot] = vctr[rows, c_pick]
                self.seat_route_exp[rows, 0, slot] = exp_val0
                self._lay_trade_road(rows, sites[rows, i_pick], vctr[rows, c_pick])
        self._expire_seat0_routes()

    def _seat0_route_income(self) -> torch.Tensor | None:
        """Row 0 of _seat_route_income: per-COLUMN origin income from seat
        0's unraided routes — [B, C, 6] double in engine yield order, or None
        when no routes exist batch-wide. Domestic pays routeYields' 1 +
        floor(destCompletedSpecialty/2) to food AND production; a CS route
        pays cityStateRouteGold + cityStateRouteSpec to the CS type's
        specialty column; an intl route pays intlGold + the dest civ city's
        completed specialty count to GOLD only. Suspended while a unit
        hostile to seat 0 (a barbarian always; any civ-seat unit whose civ is
        at war with seat 0 — routeRaidedAt counts civilians too) prowls
        within 3 of either endpoint, and unitsMode off suspends nothing;
        intl legs also refuse while at war with the DEST civ (the proven
        interdiction shortcut). Uncached — the route set and unit positions
        are fixed across the city walk that consumes it."""
        rr0 = self.seat_routes[:, 0]  # [B, K, 2]
        act = rr0[:, :, 0] >= 0
        if not bool(act.any()):
            return None
        B, C, S, dev = self.B, self.C, self.S, self.device
        K = rr0.shape[1]
        from_c = rr0[:, :, 0].clamp(min=0, max=C - 1)  # origin COLUMN
        has_from = act & self.alive.gather(1, from_c)
        is_cs = rr0[:, :, 1] <= -2
        is_dom = act & (rr0[:, :, 1] >= 0)
        dest_c = rr0[:, :, 1].clamp(min=0, max=C - 1)
        citystate_s = (-rr0[:, :, 1] - 2).clamp(min=0)
        sites = self.site.clamp(min=0)

        def _near0(tiles: torch.Tensor) -> torch.Tensor:  # [B, K] hostile within 3
            out = torch.zeros(B, K, dtype=torch.bool, device=dev)
            if not self.units_mode:
                return out  # routeRaidedAt: unitsMode off -> never raided
            if self.barb_unit_tile.numel():
                bd = self.pair_dist[tiles.unsqueeze(2), self.barb_unit_tile.clamp(min=0).unsqueeze(1)]
                out = out | ((bd <= 3) & self.barb_unit_alive.unsqueeze(1)).any(dim=2)
            if self.R > 0 and self.civ_unit_tile.numel():
                vhost = self.civ_unit_alive & self.civ_only_atwar.gather(1, self.civ_unit_civ.clamp(min=0))
                vd = self.pair_dist[tiles.unsqueeze(2), self.civ_unit_tile.clamp(min=0).unsqueeze(1)]
                out = out | ((vd <= 3) & vhost.unsqueeze(1)).any(dim=2)
            return out

        near_from = _near0(sites.gather(1, from_c))
        inc = torch.zeros(B, C * 6, dtype=torch.float64, device=dev)
        own_spec0 = (self.district >= 0) & self._is_specialty[self.district.clamp(min=0)] & self.district_complete & (self.tile_seat == 0)
        spec0 = torch.zeros(B, C, dtype=torch.long, device=dev).scatter_add_(1, self.owner.clamp(min=0), own_spec0.long())
        if bool(is_dom.any()):
            per0 = (1 + spec0.gather(1, dest_c) // 2).double()
            pays_d = is_dom & has_from & self.alive.gather(1, dest_c) & ~(near_from | _near0(sites.gather(1, dest_c)))
            pd = pays_d.double()
            inc.scatter_add_(1, from_c * 6 + 0, per0 * pd)
            inc.scatter_add_(1, from_c * 6 + 1, per0 * pd)
        if S > 0 and bool(is_cs.any()):
            _tr = self.rules.trade or {}
            citystate_gold = float(_tr.get("cityStateRouteGold", 3))
            citystate_spec = float(_tr.get("cityStateRouteSpec", 1))
            css = citystate_s.clamp(max=S - 1)
            citystate_ok = self.citystate_alive[:, :S].gather(1, css) & (citystate_s < S)
            raided_c = near_from | _near0(self.citystate_center[:, :S].clamp(min=0).gather(1, css))
            pays_c = act & is_cs & has_from & citystate_ok & ~raided_c
            pc = pays_c.double()
            inc.scatter_add_(1, from_c * 6 + 2, citystate_gold * pc)
            ycol = self._citystate_yidx[:, :S].gather(1, css)
            inc.scatter_add_(1, from_c * 6 + ycol, citystate_spec * pc)
        rd0 = self.seat_route_dest[:, 0]
        intl = act & (rd0 >= 0)
        if bool(intl.any()) and self.R > 0:
            dt0 = rd0.clamp(min=0)
            d_civ = self.civ_city_at.gather(1, dt0)  # dest CIV index (-1 = gone)
            dcid = self.tile_city.gather(1, dt0)
            v_spec_src = (self.district >= 0) & self._is_specialty[self.district.clamp(min=0)] & self.district_complete & (self.civ_at >= 0)
            v_spec = (
                v_spec_src.unsqueeze(1)
                & (self.civ_at.unsqueeze(1) == d_civ.reshape(B, K, 1))
                & (self.tile_city.unsqueeze(1) == dcid.reshape(B, K, 1))
            ).sum(dim=2)
            gold_i = (self._trade_intl_gold + v_spec).double()
            pays_i = intl & has_from & (d_civ >= 0) & ~self.civ_only_atwar.gather(1, d_civ.clamp(min=0)) & ~(near_from | _near0(dt0))
            inc.scatter_add_(1, from_c * 6 + 2, gold_i * pays_i.double())
        return inc.reshape(B, C, 6)

    def _expire_seat0_routes(self) -> None:
        """Row 0 of _expire_seat_routes: drop seat 0's due routes and any
        intl route whose dest is no longer a live CIV city centre (the same
        tile-keyed test, with the same captured-dest corner)."""
        act0 = self.seat_routes[:, 0, :, 0] >= 0
        exp0 = self.seat_route_exp[:, 0]
        expired = act0 & (exp0 >= 0) & (exp0 <= int(self.turn))
        rd0 = self.seat_route_dest[:, 0]
        rd0c = rd0.clamp(min=0)
        dest_gone = act0 & (rd0 >= 0) & (self.civ_city_at.gather(1, rd0c) < 0) & (self.center_at.gather(1, rd0c) < 0)
        drop = expired | dest_gone
        if bool(drop.any()):
            self.seat_routes[:, 0][drop] = -1
            self.seat_route_dest[:, 0][drop] = -1
            self.seat_route_exp[:, 0][drop] = -1

    def _expire_seat_routes(self, r: int) -> None:
        """Drop civ r's routes whose expiresTurn has arrived, plus any
        international route whose destination is no longer a live MAJOR city
        centre (the tradeRoutes filter twin — seat-0 centres via center_at,
        civ centres via civ_city_at). Consumers gate on active
        (civ_only_routes[..., 0] >= 0), so this is idempotent per turn.
        KNOWN CORNER vs TS: the dest is stored as a TILE, not (seat, city),
        so a dest CAPTURED by another major still reads as a live centre here
        while TS's (toSeat, toSeatCity) filter drops the route — closing it
        needs a route-store schema change (the body-merge slice)."""
        act3 = self.civ_only_routes[:, r, :, 0] >= 0
        expired = act3 & (self.civ_only_route_exp[:, r] >= 0) & (self.civ_only_route_exp[:, r] <= int(self.turn))
        rd3 = self.civ_only_route_dest[:, r]
        rd3c = rd3.clamp(min=0)
        dest_gone = act3 & (rd3 >= 0) & (self.center_at.gather(1, rd3c) < 0) & (self.civ_city_at.gather(1, rd3c) < 0)
        drop = expired | dest_gone  # [B, K]
        if bool(drop.any()):
            self.civ_only_routes[:, r][drop] = -1
            self.civ_only_route_dest[:, r][drop] = -1
            self.civ_only_route_exp[:, r][drop] = -1

    def _civ_pair_strengths(self) -> torch.Tensor:
        """[B, R] seatStrength = js_round(nCities*8 + Σ own-unit combat) for every
        civ seat (civilians carry combat 0). Feeds the DoW/peace arms; computed
        pre-phase, before this turn's spawns and combat."""
        B, dev = self.B, self.device
        n_c = self.civ_city_alive.sum(dim=2)  # [B, R]
        rstr = torch.zeros(B, self.R, dtype=torch.float64, device=dev)
        vt = self.civ_unit_type.clamp(min=0, max=self.NU - 1)
        for r in range(self.R):
            combat = ((self.civ_unit_alive & (self.civ_unit_civ == r)).long() * self._type_combat[vt]).sum(dim=1)
            rstr[:, r] = js_round(n_c[:, r].double() * 8 + combat.double())
        return rstr

    def _civ_pair_proximity(self, a: int, b: int) -> torch.Tensor:
        """[B] closest city-pair distance between civs a and b (999 if either
        cityless) — the seatPairProximity twin."""
        B = self.B
        d_ab = self.pair_dist[
            self.civ_city_center[:, a].clamp(min=0).unsqueeze(2), self.civ_city_center[:, b].clamp(min=0).unsqueeze(1)
        ].to(torch.long)  # [B, RC, RC]
        pair_ok = self.civ_city_alive[:, a].unsqueeze(2) & self.civ_city_alive[:, b].unsqueeze(1)
        return torch.where(pair_ok, d_ab, 999).reshape(B, -1).min(dim=1).values

    def apply_geo(self, r: int, denounce: torch.Tensor | None = None,
                  ally: torch.Tensor | None = None,
                  civ_pair_war: torch.Tensor | None = None,
                  civ_pair_peace: torch.Tensor | None = None) -> None:
        """Stash civ r's GEOPOLITICS intents for this turn, consumed at
        the phase's own pass positions (_geo_denounce_and_ally and
        _geo_declare_wars at the phase top, _geo_make_peace at the tail) and
        re-validated there. denounce/ally/civ_pair_peace are [B, R] bool target
        masks; civ_pair_war is [B] long (the one target civ, -1 = none). ally and
        civ_pair_peace name a PAIR — the driver emits them on the LOWER civ
        index's record; the arm writes both sides either way."""
        if denounce is not None:
            if getattr(self, "_driven_denounce", None) is None:
                self._driven_denounce = {}
            self._driven_denounce[r] = denounce
        if ally is not None:
            if getattr(self, "_driven_ally", None) is None:
                self._driven_ally = {}
            self._driven_ally[r] = ally
        if civ_pair_war is not None:
            if getattr(self, "_driven_geo_war", None) is None:
                self._driven_geo_war = {}
            self._driven_geo_war[r] = civ_pair_war
        if civ_pair_peace is not None:
            if getattr(self, "_driven_geo_peace", None) is None:
                self._driven_geo_peace = {}
            self._driven_geo_peace[r] = civ_pair_peace

    def _geo_denounce_and_ally(self) -> None:
        """The DENOUNCE and ALLIANCE arms — wire DECISIONS at the pass's
        own position (phase top, before the declare arm, so a fresh grudge
        blocks a same-turn alliance and starts today's formal clock, and a
        fresh alliance blocks a same-turn declaration). Rules re-validated on
        the named pair: both civs alive with cities, no existing stamp, at
        peace (denounce); at peace, unallied, no grudge either way, no
        grievances, the alliance-era turn floor (ally). Effects: the
        persistent directed grudge stamp; a denouncement breaks the alliance
        both ways; an alliance writes symmetrically."""
        dstash = getattr(self, "_driven_denounce", None)
        astash = getattr(self, "_driven_ally", None)
        if not dstash and not astash:
            return
        n_c = self.civ_city_alive.sum(dim=2)
        alive_civ = self.civ_only_alive[:, : self.R] & (n_c > 0)  # [B, R]
        if dstash:
            for a in sorted(dstash.keys()):
                want = dstash.pop(a)  # [B, R]
                for b in range(self.R):
                    if b == a or not bool(want[:, b].any()):
                        continue
                    den = (
                        want[:, b] & alive_civ[:, a] & alive_civ[:, b]
                        & (self.civ_pair_denounced[:, a, b] < 0) & ~self.civ_pair_war[:, a, b]
                    )
                    if bool(den.any()):
                        self.civ_pair_denounced[:, a, b] = torch.where(
                            den, torch.full_like(self.civ_pair_denounced[:, a, b], int(self.turn)), self.civ_pair_denounced[:, a, b]
                        )
                        self.civ_pair_allied[:, a, b] = self.civ_pair_allied[:, a, b] & ~den
                        self.civ_pair_allied[:, b, a] = self.civ_pair_allied[:, b, a] & ~den
        if astash:
            era_open = int(self.turn) >= self._civ_pair_ally_min_peace
            for a in sorted(astash.keys()):
                want = astash.pop(a)  # [B, R]
                if not era_open:
                    continue  # popped either way — a stale intent never lingers
                for b in range(self.R):
                    if b == a or not bool(want[:, b].any()):
                        continue
                    form = (
                        want[:, b] & alive_civ[:, a] & alive_civ[:, b]
                        & ~self.civ_pair_war[:, a, b] & ~self.civ_pair_allied[:, a, b]
                        & (self.civ_pair_denounced[:, a, b] < 0) & (self.civ_pair_denounced[:, b, a] < 0)
                        & (self.civ_only_warmonger[:, a] <= 0) & (self.civ_only_warmonger[:, b] <= 0)
                    )
                    if bool(form.any()):
                        self.civ_pair_allied[:, a, b] = self.civ_pair_allied[:, a, b] | form
                        self.civ_pair_allied[:, b, a] = self.civ_pair_allied[:, b, a] | form

    def _geo_declare_wars(self) -> None:
        """The civ↔civ DECLARE arm — a wire DECISION at the pass's own
        position (phase top, after denounce/ally, so the war is live for
        both civs' war-acts this turn). Rules re-validated: both alive with
        cities, at peace, not allied (LIVE — this turn's grudge already
        broke, this turn's alliance already formed). Effects: war both ways,
        the aggressor's grievances, and the war's KIND — FORMAL iff the
        aggressor's stamp on the target is at least formalWarMinTurns old (a
        same-turn stamp is 0 old: a surprise). Pacing — one new war per civ
        per turn, the war-weariness gates — is the driver's policy."""
        stash = getattr(self, "_driven_geo_war", None)
        if not stash:
            return
        formal_min = int(self.rules.seats.get("formalWarMinTurns", 5))
        n_c = self.civ_city_alive.sum(dim=2)
        alive_civ = self.civ_only_alive[:, : self.R] & (n_c > 0)
        for a in sorted(stash.keys()):
            want = stash.pop(a)  # [B] long target
            for b in range(self.R):
                if b == a:
                    continue
                declare = (
                    (want == b) & alive_civ[:, a] & alive_civ[:, b]
                    & ~self.civ_pair_war[:, a, b] & ~self.civ_pair_allied[:, a, b]
                )
                if bool(declare.any()):
                    self.civ_pair_war[:, a, b] = self.civ_pair_war[:, a, b] | declare
                    self.civ_pair_war[:, b, a] = self.civ_pair_war[:, b, a] | declare
                    self.civ_only_warmonger[:, a] = self.civ_only_warmonger[:, a] + declare.long() * self._wm_dow
                    dt = self.civ_pair_denounced[:, a, b]
                    formal = declare & (dt >= 0) & ((int(self.turn) - dt) >= formal_min)
                    self.civ_pair_warkind[:, a, b] = torch.where(declare, formal, self.civ_pair_warkind[:, a, b])
                    self.civ_pair_warkind[:, b, a] = torch.where(declare, formal, self.civ_pair_warkind[:, b, a])

    def _geo_make_peace(self) -> None:
        """The civ↔civ PEACE arm — a wire DECISION at the pass's own
        position (the phase tail, after every civ acted). The rule is only
        "at war"; the war-weariness threshold that CHOOSES to sue is the
        driver's, read from the pre-turn observation like the seat-0 sue
        verb. Effects: peace both ways, the treaty's war-weariness relief,
        the war's kind cleared (the grudge stamp stays)."""
        stash = getattr(self, "_driven_geo_peace", None)
        if not stash:
            return
        for a in sorted(stash.keys()):
            want = stash.pop(a)  # [B, R]
            for b in range(self.R):
                if b == a or not bool(want[:, b].any()):
                    continue
                peace = want[:, b] & self.civ_pair_war[:, a, b]
                if bool(peace.any()):
                    self.civ_pair_war[:, a, b] = self.civ_pair_war[:, a, b] & ~peace
                    self.civ_pair_war[:, b, a] = self.civ_pair_war[:, b, a] & ~peace
                    self.civ_pair_warkind[:, a, b] = self.civ_pair_warkind[:, a, b] & ~peace
                    self.civ_pair_warkind[:, b, a] = self.civ_pair_warkind[:, b, a] & ~peace
                    self._ww_peace(peace, a + 1, b + 1)
