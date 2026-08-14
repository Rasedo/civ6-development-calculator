"""Per-seat decision surfaces: masks/apply for driven seats, buys, religion, trade.

One mixin of BatchSim (assembled in engine.py); state and helpers live on
self / gpu/core/simbase.py.
"""
from __future__ import annotations

from .simbase import *  # noqa: F401,F403 — torch, constants, helpers: the shared floor
from .simbase import _MUTABLE  # noqa: F401 — private names do not ride a star import
from . import simbase  # the PATCHABLE globals (the pool caps/_ALIAS_CHECK) must be read live


class SimSeats:
    def _seat_production_mask(self, row: int) -> torch.Tensor:
        """[B, RC, W] — THE production decision space, for seat row `row`.

        ONE body for every seat, in the ONE production layout
        (cpu/core/prodLayout.ts): NB queue-building columns, 1 settler, 1 idle,
        NU train-unit columns, nScaffold district columns, then nW wonder and
        nP project columns — every one idle-gated. Gold and faith spending is
        NOT here: it is the BUY WIRE, decided per seat per turn.

        Every column asks a row-generic legality body — `_seat_buildable`,
        `_trainable_units`, `_district_elig`, `_wonder_cand` — the SAME ones the
        shared apply re-validates against, so mask and apply cannot drift and no
        seat sees a legality another seat does not.

        Masks read the CURRENT state — call before step()."""
        B, dev = self.B, self.device
        nS = len(self._scaffold)
        alive = self.city_alive[:, row]  # [B, RC]
        idle = alive & (self.city_current[:, row] == -1)
        # buildings / units: the row-generic legality bodies the APPLY asks too.
        # QUEUE legality wants the district merely PLACED (availableBuildings),
        # which is what these columns offer.
        bld_q = self._seat_buildable(row)  # [B, RC, NB]
        tr_city = self._trainable_units(row)  # [B, RC, NU]
        prod_cols = []
        for j in range(self.RC):
            ok_b = bld_q[:, j]
            # SETTLER: queueSettler's own rule — a 1-pop city may not train one.
            # This column carries LEGALITY only; the one-settler-in-flight and
            # city-cap terms are POLICY and live in gpu/ladder.py's ctx
            # (`settler_queued`, `city_cap`).
            ok_s = (self.city_pop[:, row, j] >= self.rules.settler_pop_gate).unsqueeze(1)
            # units: `trainableUnits` for this row and city — the SAME body the
            # apply re-validates against — narrowed to the MILITARY LAND lane
            # the production ladder selects from. Naval hulls get the dedicated
            # galley column below; civilians (combat 0) are produced by no seat
            # ladder. Every override below re-applies tr_j, so no column can
            # smuggle an untrainable chassis past the legality body.
            tr_j = tr_city[:, j]  # [B, NU]
            ok_u = tr_j & (self._type_combat.unsqueeze(0) > 0) & ~self.unit_naval.unsqueeze(0)
            if self.improvements_on and self._builder_idx >= 0:
                has_alive = (self.major_unit_alive & (self.major_unit_seat == row) & (self.major_unit_type == self._builder_idx)).any(dim=1)
                has_q = ((self.city_current[:, row] == self.UNIT_BASE + self._builder_idx) & alive).any(dim=1)  # alive-masked
                ok_u[:, self._builder_idx] = tr_j[:, self._builder_idx] & ~(has_alive | has_q) & self._seat_job_mask(row).any(dim=1)
            # MILITARY ENGINEER: one per seat (live or queued), and only while a
            # FORT job exists. Combat 0 keeps it out of both lanes above, so this
            # column is the only way a net can express one.
            if self._seat_eng_live and self._eng_idx >= 0:
                has_alive_e = (self.major_unit_alive & (self.major_unit_seat == row) & (self.major_unit_type == self._eng_idx)).any(dim=1)
                has_q_e = ((self.city_current[:, row] == self.UNIT_BASE + self._eng_idx) & alive).any(dim=1)
                ok_u[:, self._eng_idx] = tr_j[:, self._eng_idx] & ~(has_alive_e | has_q_e) & self._seat_fort_job_mask(row).any(dim=1)
            # GALLEY: SAILING plus a naval-capable CITY (center adjacent to water
            # OR a completed Harbor), and the seat owns zero naval units live or
            # queued. Per-city, hence inside this j loop. ~unit_naval above
            # excludes every hull, so this is the only column that floats a ship.
            if self._galley_idx >= 0 and self._sailing_tech >= 0:
                has_sail_g = self.civ_techs[:, row, self._sailing_tech]
                vt_allm = self.major_unit_type.clamp(min=0, max=self.NU - 1)
                naval_live_g = (self.major_unit_alive & (self.major_unit_seat == row) & self.unit_naval[vt_allm]).any(dim=1)
                qcur_g = self.city_current[:, row]
                q_nav_g = (qcur_g >= self.UNIT_BASE) & (qcur_g < self.UNIT_BASE + self.NU) & alive \
                    & self.unit_naval[(qcur_g - self.UNIT_BASE).clamp(min=0, max=self.NU - 1)]
                # cityNavalCapable rides in tr_j (a hull column is False in a
                # landlocked city); the rest is the ladder's own policy.
                ok_u[:, self._galley_idx] = (
                    tr_j[:, self._galley_idx] & has_sail_g & ~(naval_live_g | q_nav_g.any(dim=1))
                )
            # scaffold districts: placeable NOW
            ok_d = torch.zeros(B, nS, dtype=torch.bool, device=dev)
            if self.districts_on and self._scaffold:
                cap_max = torch.div(self.city_pop[:, row, j] - 1, 3, rounding_mode="floor") + 1
                spec_cnt = ((self.city_dist_tile[:, row, j] >= 0) & self._is_specialty).sum(dim=1)
                for si, (di, utech, uciv, plc) in enumerate(self._scaffold):
                    has_tech = self.civ_techs[:, row, utech] if utech >= 0 else (self.civ_civics[:, row, uciv] if uciv >= 0 else torch.ones(B, dtype=torch.bool, device=dev))  # kind-aware
                    not_owned = self.city_dist_tile[:, row, j, di] < 0
                    under_cap = (spec_cnt < cap_max) if bool(self._is_specialty[di]) else torch.ones(B, dtype=torch.bool, device=dev)
                    # The PLACEMENT SCAN runs HERE, not lazily at apply time:
                    # without it the mask is optimistic, calling a district legal
                    # on the gate tests alone while the apply also demands a tile
                    # that can take it (and otherwise falls through to a BUILDING).
                    # The predicate is shared with _place_district so the two
                    # cannot drift.
                    can_place = self._district_elig(row, j, di, plc)[0].any(dim=1)
                    ok_d[:, si] = has_tech & not_owned & under_cap & can_place
            base_j = torch.cat([ok_b, ok_s, torch.ones(B, 1, dtype=torch.bool, device=dev), ok_u, ok_d], dim=1)
            # WONDER columns [nW]: unlock + one-per-world (in-flight tiles count,
            # like wonderExists) + a live placement candidate — placeSeatWonder's
            # own scan bodies. No capital-only term: any city may raise an
            # unlocked wonder.
            nW_m = self._wond_n if self.districts_on else 0
            ok_w = torch.zeros(B, max(nW_m, 0), dtype=torch.bool, device=dev)
            if nW_m > 0:
                base_okm = self._wonder_base_ok(row, j)
                for wi in range(nW_m):
                    unl_w = self._wonder_unlock_ok(row, wi)
                    if unl_w is None or not bool(unl_w.any()):
                        continue
                    okc_m = unl_w & ~(self.built_wonder == wi).any(dim=1)
                    if not bool(okc_m.any()):
                        continue
                    ok_w[:, wi] = okc_m & self._wonder_cand(row, j, wi, base_okm).any(dim=1)
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
                if d_im < 0 or d_im >= self.city_dist_tile.shape[3]:
                    continue
                regp_m = self.city_dist_tile[:, row, j, d_im]
                ok_p[:, pi_m] = (regp_m >= 0) & self.district_complete.gather(1, regp_m.clamp(min=0).unsqueeze(1)).squeeze(1)
            idle_j = idle[:, j].unsqueeze(1)
            prod_cols.append(torch.cat([base_j & idle_j, ok_w & idle_j, ok_p & idle_j], dim=1))
        return torch.stack(prod_cols, dim=1)  # [B, RC, W]

    def seat_masks(self, row: int) -> dict[str, torch.Tensor]:
        """Seat ROW `row`'s decision space, in the shared head layouts so one
        net serves every seat — ONE body, seat 0 among them.

        production [B, RC, W] is `_seat_production_mask`; tech [B, NT] and
        civic [B, NC] are `_seat_tech_mask` / `_seat_civic_mask` (available
        picks where that row's slot is idle); envoy [B, S] is
        `_seat_envoy_mask` — EVERY seat courts city-states
        (`_seat_influence_phase` banks the influence, `_seat_record_apply`
        spends it on any row), so no seat's envoy head is structurally empty.

        THE WAR HEAD is the one place a row still forks, and the fork is
        WAR_COLUMN_SEAT's, not seat 0's standing: the wire carries ONE war
        axis, so a civ row's [B, 2R] head declares on / sues to that seat
        (column 0 / column R) while that seat's own head names WHICH civ.
        Closing it is wire work, not a rule difference.

        Masks read the CURRENT state — call before step(); apply_seat_actions()
        writes the choices the seat phase honors."""
        B, dev = self.B, self.device
        production = self._seat_production_mask(row)
        tech = self._seat_tech_mask(row)
        civic = self._seat_civic_mask(row)
        envoy = self._seat_envoy_mask(row)
        if row == 0:
            war = self.war_mask()
        else:
            sr = self.rules.seats
            Rw = max(self.R, 1)
            war = torch.zeros(B, 2 * Rw, dtype=torch.bool, device=dev)
            atw = self.war[:, row, 0]
            war[:, 0] = self.civ_alive[:, row] & ~atw
            pcost_m = sr.get("peaceGold0", 150) + sr.get("peaceGoldSlope", 10) * self.war_turns[:, row].to(torch.float64)
            war[:, Rw] = (
                self.civ_alive[:, row] & atw
                & (self.war_turns[:, row] >= sr.get("warMinTurns", 14))
                & self._afford(self.civ_treasury[:, row], pcost_m)
            )
        return {"production": production, "tech": tech, "civic": civic,
                "envoy": envoy, "war": war}

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
        # everything else STASHES and applies at the RECORD POSITION inside the
        # seat phase. Every stash is keyed by the ABSOLUTE seat row, so seat 0's
        # own intents (set by step()) share the dicts and the bodies that drain
        # them.
        self._stash_record(r + 1, tech=tech, civic=civic, envoys=envoys,
                           production=production, pref=production_pref)
        self._stash_buy(r + 1, buy=buy, worship=worship, relig=relig, levy=levy)

    def _stash_record(self, row: int, tech=None, civic=None, envoys=None,
                      production=None, pref=None) -> None:
        """Park a seat row's applySeatActionRecord intents for
        `_seat_record_apply` to drain at the record position.

        WHY NOT APPLY NOW. Draw-free is not ORDER-free. TS applies the record
        inside seatPhase, AFTER the eliminated-actor `continue` and after the
        CS/quest block: a pre-step apply would set research for a seat TS skips
        entirely, spend an envoy before the quest that grants one, and queue (or
        district-PAVE) for a city another seat captures later the same turn. The
        stash makes the GPU's refusal happen where TS's does."""
        if tech is not None:
            self._driven_tech[row] = tech
        if civic is not None:
            self._driven_civic[row] = civic
        if envoys is not None and self.S > 0:
            self._driven_envoys[row] = envoys
        if production is not None or pref is not None:
            self._driven_picks[row] = (production, pref)

    def _seat_record_apply(self, row: int, active: torch.Tensor) -> None:
        """applySeatActionRecord for seat row `row` — ONE body every seat runs,
        at the TS record position (after the CS/quest block, before the gold
        ladder), in the TS arm order: tech, civic, envoys, production.

        `active` is the eliminated-actor `continue`: TS's `continue` precedes
        the record apply, so a cityless seat applies NOTHING — but the stash is
        drained either way, because an intent is for THIS turn and a refused one
        must not survive into the next.

        The WAR arm is deliberately absent and is the LAST split left in the
        record: seat 0's declare column applies at the geo pass in
        `_seat_phase`, a civ's in `apply_seat_actions` at decide time — the
        WAR_COLUMN_SEAT residual, which owns its own task.

        Every arm re-validates against the LIVE state here; nothing chooses."""
        tech = self._driven_tech.pop(row, None)
        civic = self._driven_civic.pop(row, None)
        envoys = self._driven_envoys.pop(row, None)
        production, pref = self._driven_picks.pop(row, (None, None))
        if not bool(active.any()):
            return
        ext = self.seat_ext[:, row]
        if tech is not None:
            t_act = tech.to(torch.long)
            ok = active & ext & (self.civ_cur_tech[:, row] == -1) & (t_act >= 0) \
                & self._available_mask(self.civ_techs[:, row], self._prereq_t).gather(1, t_act.clamp(min=0).unsqueeze(1)).squeeze(1)
            self.civ_cur_tech[:, row] = torch.where(ok, t_act.clamp(min=0), self.civ_cur_tech[:, row])
        if civic is not None:
            c_act = civic.to(torch.long)
            ok = active & ext & (self.civ_cur_civic[:, row] == -1) & (c_act >= 0) \
                & self._available_mask(self.civ_civics[:, row], self._prereq_c).gather(1, c_act.clamp(min=0).unsqueeze(1)).squeeze(1)
            self.civ_cur_civic[:, row] = torch.where(ok, c_act.clamp(min=0), self.civ_cur_civic[:, row])
        if envoys is not None and self.S > 0:
            # A [B, K] SEQUENCE; a [B] single pick is accepted too. Each pick
            # re-validates against the LIVE mask, and every increment bumps
            # _eff_version — an envoy crossing the 1/3/6 thresholds changes the
            # backed seat's cached yields. BANK ONLY: conversion is an eager
            # rule in the influence block above, so a decide-time pick can never
            # exceed the bank.
            e_seq = envoys.to(torch.long)
            if e_seq.dim() == 1:
                e_seq = e_seq.unsqueeze(1)
            for _ek in range(int(e_seq.shape[1])):
                e_act = e_seq[:, _ek]
                ei = e_act.clamp(min=0, max=self.S - 1)
                ok = active & ext & (e_act >= 0) & (e_act < self.S) \
                    & self._seat_envoy_mask(row).gather(1, ei.unsqueeze(1)).squeeze(1)
                if bool(ok.any()):
                    rows = ok.nonzero(as_tuple=True)[0]
                    self.seat_citystate_envoys[rows, row, ei[rows]] += 1
                    self.civ_envoys_avail[:, row] = self.civ_envoys_avail[:, row] - ok.long()
                    self._eff_version += 1
        if pref is not None:
            self._apply_seat_pref(row, pref)
        elif production is not None:
            self._apply_seat_production(row, production)

    def _stash_buy(self, row: int, buy=None, worship=None, relig=None, levy=None) -> None:
        """Park a seat row's GOLD/FAITH/LEVY intents for `_seat_buy_ladder` to
        drain at the gold block's phase position. One dict per verb, keyed by
        the ABSOLUTE row — decide-time and apply-time are different points in
        the turn for every seat, so the stash is not a seat-0 detour."""
        if buy is not None:
            self._driven_buy[row] = buy
        if worship is not None:
            self._driven_buy_worship[row] = worship
        if relig is not None:
            self._driven_buy_relig[row] = relig
        if levy is not None:
            self._driven_levy[row] = levy

    def _seat_buy_candidates(self, row: int, active: torch.Tensor):
        """The gold-purchase BUILDING candidate for seat row `row` — ONE
        legality body shared by the wire driver's _buy_ctx and the buy ladder.

        Returns (jj, bb, can, price, elig): the cheapest completable building
        anywhere in the seat (argmin of (cost*1024 + bIdx)*32 + citySlot) and
        whether the treasury clears price + the peace-gold RESERVE (a POLICY
        war chest, not a rule). Legality is `_seat_buildable(row, True)` —
        purchaseBuilding's own availableBuildings + buildingCompletable pair.
        The affordability test is milli-quantised via js_round to match TS."""
        B, dev = self.B, self.device
        rdv6 = self.rules_dev
        NB6 = rdv6.b_cost.shape[0]
        elig6 = self._seat_buildable(row, True) & (active.unsqueeze(1) & self.city_alive[:, row]).unsqueeze(2)
        key6 = (rdv6.b_cost.reshape(1, 1, -1) * 1024 + torch.arange(NB6, device=dev, dtype=rdv6.b_cost.dtype).reshape(1, 1, -1)) * 32 \
            + torch.arange(self.RC, device=dev, dtype=rdv6.b_cost.dtype).reshape(1, -1, 1)
        key6 = torch.where(elig6, key6.expand(B, -1, -1), torch.tensor(float("inf"), dtype=rdv6.b_cost.dtype, device=dev))
        flat6 = key6.reshape(B, -1)
        best6 = flat6.argmin(dim=1)
        has6 = active & torch.isfinite(flat6.gather(1, best6.unsqueeze(1)).squeeze(1))
        jj6 = torch.div(best6, NB6, rounding_mode="floor")
        bb6 = best6 % NB6
        price6 = rdv6.b_cost.gather(0, bb6).double() * self.rules.gold_purchase_mult
        reserve6 = float(self.rules.seats.get("peaceGold0", 150))
        can6 = has6 & (js_round(self.civ_treasury[:, row] * 1000) >= js_round((price6 + reserve6) * 1000))
        return jj6, bb6, can6, price6, elig6

    def _seat_buy_building(self, row: int, can6: torch.Tensor, jj6: torch.Tensor, bb6: torch.Tensor, price6: torch.Tensor) -> None:
        """The building-purchase EXECUTOR — the candidates (or the wire's
        re-validation) decide WHO buys; this only writes."""
        rows6 = can6.nonzero(as_tuple=True)[0]
        self.city_bldg[rows6, row, jj6[rows6], bb6[rows6]] = True
        self._eff_version += 1  # a bought regional building reaches other cities this phase
        if self._walls_bidx >= 0:
            wm6 = rows6[bb6[rows6] == self._walls_bidx]
            if len(wm6) > 0:
                self.city_outer_hp[wm6, row, jj6[wm6]] = self._walls_hp
        self.civ_treasury[:, row] = torch.where(can6, self.civ_treasury[:, row] - price6, self.civ_treasury[:, row])

    def _seat_trainable_units(self, row: int) -> torch.Tensor:
        """[B, NU] the SEAT-level trainable set: tech-unlocked (via _type_tech;
        -1 = ungated) AND strategic-resource access in ITS territory. The
        city-free half of `trainableUnits` — the gold UNIT rung spawns at the
        capital and TS's arm asks no city question either."""
        B = self.B
        return (
            (self._type_tech.unsqueeze(0) < 0)
            | self.civ_techs[:, row].gather(1, self._type_tech.clamp(min=0).unsqueeze(0).expand(B, -1))
        ) & self._res_avail_mask(self.tile_seat == row)

    def _seat_buy_unit_candidates(self, row: int, tr_u: torch.Tensor) -> torch.Tensor:
        """Buy-kind 2 [B, NU]: the gold UNIT-purchase candidate set — ONE
        legality body for the wire's _buy_ctx and the ladder's rung. Non-naval
        military among tr_u (SCOUT masked out: affordability can otherwise
        leave it the only candidate; BUILDER is combat 0), affordable at cost x
        mult, with NO war-chest reserve. The military-quota gate stays at the
        call sites — its COUNT is positional, tracking mid-phase spawns and
        queues."""
        mil = tr_u & (self._type_combat.unsqueeze(0) > 0) & ~self.unit_naval.unsqueeze(0)
        if self._scout_idx >= 0:
            mil[:, self._scout_idx] = False
        afford = self._afford(self.civ_treasury[:, row].unsqueeze(1), self._type_cost.double().unsqueeze(0) * self.rules.gold_purchase_mult)
        return mil & afford

    def _seat_tile_unclaimed(self, tc: torch.Tensor) -> torch.Tensor:
        """[B, K] — `tileClaimed(t)` is `tileSeat(t) !== NO_SEAT`, so ONE plane
        answers it for every owner class (seat 0, a civ, a city-state).
        tc must be clamped in-range."""
        return self.tile_seat.gather(1, tc) < 0

    def _seat_tile_adj_city(self, row: int, cid: torch.Tensor, tc: torch.Tensor,
                            nbs: torch.Tensor | None = None) -> torch.Tensor:
        """[B, K] — the borderCandidates adjacency twin: any of the 6
        neighbours `tileBelongsTo` THIS city, the same (tileSeat, tileCity)
        pair the work window tests. `cid` is the city's persistent id; `nbs`
        may be passed to reuse a scan's neighbour tensor."""
        if nbs is None:
            nbs = self.neigh[tc.reshape(-1)].reshape(self.B, -1, 6)
        nbf = nbs.clamp(min=0).reshape(self.B, -1)
        return (
            (self.tile_seat.gather(1, nbf).reshape(self.B, -1, 6) == row)
            & (self.tile_city.gather(1, nbf).reshape(self.B, -1, 6) == cid.reshape(self.B, 1, 1))
            & (nbs >= 0)
        ).any(dim=2)

    def _seat_tile_price(self, row: int, ctr: torch.Tensor, tgt: torch.Tensor) -> torch.Tensor:
        """[B] f64 — the tilePurchaseCost twin: ring-based base (50 ring <= 2,
        +25/ring), speed-scaled, x(1 + 4*max(tech%, civic%)), + 5*speed per
        tile EVER purchased empire-wide, x this seat's own tilePurchaseMult
        (LAND_SURVEYORS is a policy card every seat can slot)."""
        ring = self.pair_dist[ctr, tgt].clamp(min=2)
        tpct = self.civ_techs[:, row].sum(dim=1).double() / max(1, self.civ_techs.shape[2])
        cpct = self.civ_civics[:, row].sum(dim=1).double() / max(1, self.civ_civics.shape[2])
        base = js_round(torch.full_like(tpct, 1.0) * (50.0 + 25.0 * (ring - 2).double()) * self.rules.game_speed)
        step = js_round(torch.full_like(tpct, 5.0 * self.rules.game_speed))
        tpm = self._gov_mods(row)[6].double()
        return js_round((base * (1.0 + 4.0 * torch.maximum(tpct, cpct)) + step * self.civ_tiles_purchased[:, row].double()) * tpm)

    def _seat_tile_buy_candidate(self, row: int, active: torch.Tensor):
        """Buy-kind 3: the TILE-BUY candidate — ONE legality body for the wire
        driver's _buy_ctx and the TS driver's tripwire twin. Walks city slots in
        order; the FIRST slot with a border candidate names the pick (best
        _seat_border_key, the same key the culture claim uses), and an
        UNAFFORDABLE pick ABORTS the seat's tile buy outright rather than trying
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
            live = left & self.city_alive[:, row, j]
            if not bool(live.any()):
                continue
            ctr = self.city_center[:, row, j]
            tiles, tc, nbs, key0 = self._seat_border_key(row, ctr)
            okt = (
                (tiles >= 0)
                & self._seat_tile_unclaimed(tc)
                & self._seat_tile_adj_city(row, self.city_id[:, row, j], tc, nbs)
                & live.unsqueeze(1)
            )
            has = okt.any(dim=1)
            if not bool(has.any()):
                continue
            best = torch.where(okt, key0, self._inf_f).argmin(dim=1)
            tgt = tiles.gather(1, best.unsqueeze(1)).squeeze(1)
            c = self._seat_tile_price(row, ctr.clamp(min=0), tgt.clamp(min=0))
            buy = has & self._afford(self.civ_treasury[:, row], c)
            slot = torch.where(buy, torch.full_like(slot, j), slot)
            tile = torch.where(buy, tgt, tile)
            cost = torch.where(buy, c, cost)
            ok = ok | buy
            left = left & ~has  # first slot WITH a candidate ends the walk (buy or abort)
        return slot, tile, cost, ok

    def _seat_religious_city_ok(self, row: int) -> torch.Tensor:
        """[B, RC] cities of seat row `row` that can birth a religious unit —
        purchaseReligiousUnit's city gates: a SHRINE and a COMPLETE unpillaged
        Holy Site."""
        if self._shrine_bidx < 0 or self._hs_idx < 0:
            return torch.zeros(self.B, self.RC, dtype=torch.bool, device=self.device)
        hs = self.city_dist_tile[:, row, :, self._hs_idx]  # [B, RC]
        hs_ok = (hs >= 0) & self.district_complete.gather(1, hs.clamp(min=0)) & ~self.district_pillaged.gather(1, hs.clamp(min=0))
        return self.city_alive[:, row] & self.city_bldg[:, row, :, self._shrine_bidx] & hs_ok

    def _seat_faith_buy_candidates(self, row: int, active: torch.Tensor):
        """Buy-kinds 4-6: the FAITH-purchase candidates — worship building,
        missionary, apostle — each (ok [B], slot [B]) with the ladder's own
        gates. Worship: founded religion, afford the flat cost, FIRST alive
        city in slot order that `_worship_city_ok` admits. Missionary/apostle:
        founded, live count under the unit's own cap, afford (enhancer-adjusted
        / flat), FIRST city `_seat_religious_city_ok` admits.
        Missionary-before-apostle (one religious unit per turn) is the LADDER's
        pick, not encoded here."""
        B, dev = self.B, self.device
        neg = torch.full((B,), -1, dtype=torch.long, device=dev)
        no = torch.zeros(B, dtype=torch.bool, device=dev)
        w_ok, w_j = no.clone(), neg.clone()
        m_ok, m_j = no.clone(), neg.clone()
        a_ok, a_j = no.clone(), neg.clone()
        if self._hs_idx < 0 or not bool(self.civ_religion_done[:, row].any()):
            return w_ok, w_j, m_ok, m_j, a_ok, a_j
        founded = active & self.civ_religion_done[:, row]
        elig_w = self._worship_city_ok(row)
        if bool(elig_w.any()):
            w_ok = founded & self._afford(self.civ_faith[:, row], self._worship_cost) & elig_w.any(dim=1)
            w_j = torch.where(w_ok, elig_w.long().argmax(dim=1), w_j)
        elig_s = self._seat_religious_city_ok(row)
        first_s = elig_s.long().argmax(dim=1)
        if self._missionary_idx >= 0:
            n_m = (self.major_unit_alive & (self.major_unit_seat == row) & (self.major_unit_type == self._missionary_idx)).sum(dim=1)
            mcost = self._enh["mcost"][self.civ_enhancer[:, row] + 1]
            m_ok = founded & (n_m < self._missionary_cap) & self._afford(self.civ_faith[:, row], mcost) & elig_s.any(dim=1)
            m_j = torch.where(m_ok, first_s, m_j)
        if self._apostle_idx >= 0:
            n_a = (self.major_unit_alive & (self.major_unit_seat == row) & (self.major_unit_type == self._apostle_idx)).sum(dim=1)
            acost = torch.full((B,), float(round(self._apostle_cost)), dtype=torch.float64, device=dev)
            a_ok = founded & (n_a < self._apostle_cap) & self._afford(self.civ_faith[:, row], acost) & elig_s.any(dim=1)
            a_j = torch.where(a_ok, first_s, a_j)
        return w_ok, w_j, m_ok, m_j, a_ok, a_j

    def _seat_levy_candidate(self, row: int, active: torch.Tensor):
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
        ready = (self.turn - self.citystate_last_levy[:, :Sl]) >= self._levy_cooldown
        elig = active.unsqueeze(1) & (self.citystate_type[:, :Sl] == mil_idx) & self._suzerain_mask(row)[:, :Sl] & ready \
            & self._afford(self.civ_treasury[:, row], levy_cost).unsqueeze(1)
        ok = elig.any(dim=1)
        cs = torch.where(ok, elig.long().argmax(dim=1), cs)
        return ok, cs

    def _seat_army_count(self, row: int) -> torch.Tensor:
        """[B] seat row `row`'s MILITARY strength count — live units plus
        what its cities have on order (builders are combat 0 and never count).
        The meleeCount + rangedCount twin TS builds before its buy block, and
        the input to the gold ladder's unit quota."""
        vt = self.major_unit_type.clamp(min=0, max=self.NU - 1)
        live = (self.major_unit_alive & (self.major_unit_seat == row) & (self._type_combat[vt] > 0)).sum(dim=1)
        cur = self.city_current[:, row]
        q_ty = (cur - self.UNIT_BASE).clamp(min=0, max=self.NU - 1)
        q_mil = (cur >= self.UNIT_BASE) & (cur < self.UNIT_BASE + self.NU) & (self._type_combat[q_ty] > 0) & self.city_alive[:, row]
        return live + q_mil.sum(dim=1)

    def _settler_cost(self, n_cities: torch.Tensor, live: torch.Tensor,
                      queued: torch.Tensor) -> torch.Tensor:
        """settlerCost — the ONE transcription, for every seat and caller.

        `settlerBase + settlerPerCity * max(0, cities - 1 + LIVE settlers +
        QUEUED settlers)`. TS calls it afresh per commit, so the production walk
        feeds its own RUNNING queued count (a settler queued at column j raises
        the price for column j+1) while the buy ladder and the observation feed
        a plain snapshot."""
        return self.rules.settler_base + self.rules.settler_per_city * (
            n_cities - 1 + live + queued
        ).clamp(min=0).to(self.dtype)

    def _seat_settler_cost(self, row: int) -> torch.Tensor:
        """[B] the settler price seat row `row` faces right now — the counts
        read off the merged city block, then `_settler_cost`. Read by the buy
        ladder and by the observation, so what a seat PAYS and what its policy
        SEES cannot drift."""
        alive_row = self.city_alive[:, row]
        return self._settler_cost(
            alive_row.sum(dim=1), self._seat_settlers(row),
            (alive_row & (self.city_current[:, row] == self.SETTLER)).sum(dim=1),
        )

    def _seat_buy_ladder(self, row: int, active: torch.Tensor) -> None:
        """THE gold/faith spending block for seat row `row`, at the seatPhase
        position (after the production picks, before the trade block) — ONE
        body every seat runs.

        The wire names ONE gold purchase per seat per turn and the rungs fire
        in the TS order BUILDING > SETTLER > UNIT > TILE, `bought` threading
        the priority. The FAITH buys ride BESIDE it (their own currency): the
        worship building, then ONE religious unit, missionary before apostle.
        The LEVY is gold but a diplomacy action, so it pays its own way outside
        the one-purchase slot.

        Nothing here CHOOSES: every arm re-validates the named intent against
        the LIVE state at this position and refuses silently if it no longer
        holds — the same contract TS's arms keep.
        """
        B, dev = self.B, self.device
        mult = self.rules.gold_purchase_mult
        ext = self.seat_ext[:, row]
        alive_row = self.city_alive[:, row]
        n_cities = alive_row.sum(dim=1)
        bought = torch.zeros(B, dtype=torch.bool, device=dev)
        # Kind 0: the BUILDING buy. The wire names (slot, buildingIdx); the
        # shared candidate body re-validates it against the LIVE state.
        kind = jjw = bbw = None
        if row in self._driven_buy:
            kind, jjw, bbw = self._driven_buy.pop(row)
        if kind is not None and self.districts_on:
            want = active & ext & (kind == 0) & (jjw >= 0) & (bbw >= 0)
            if bool(want.any()):
                _, _, _, _, elig = self._seat_buy_candidates(row, active)
                jc = jjw.clamp(min=0, max=self.RC - 1)
                bc = bbw.clamp(min=0, max=self.rules_dev.b_cost.shape[0] - 1)
                price = self.rules_dev.b_cost.gather(0, bc).double() * mult
                reserve = float(self.rules.seats.get("peaceGold0", 150))
                ok = want & elig[torch.arange(B, device=dev), jc, bc] \
                    & (js_round(self.civ_treasury[:, row] * 1000) >= js_round((price + reserve) * 1000))
                if bool(ok.any()):
                    self._seat_buy_building(row, ok, jc, bc, price)
                    bought = bought | ok
        # Kind 1: the SETTLER buy is a UNIT purchase. It spawns at the capital
        # (else the first alive city), which must have the pop to pay — WHERE
        # it founds is a later FOUND_CITY order, not part of the purchase.
        cap_is = self.city_is_cap[:, row]
        has_cap = cap_is.any(dim=1)
        spawn_slot = torch.where(has_cap, cap_is.long().argmax(dim=1), alive_row.long().argmax(dim=1))
        bidx = torch.arange(B, device=dev)
        if kind is not None and self._settler_idx >= 0:
            sett_price = self._seat_settler_cost(row) * mult
            ctr_s = self.city_center[bidx, row, spawn_slot].clamp(min=0)
            pop_s = self.city_pop[bidx, row, spawn_slot]
            want_s = (kind == 1) & active & ext & ~bought & (n_cities > 0) \
                & (pop_s >= self.rules.settler_pop_gate) & self._afford(self.civ_treasury[:, row], sett_price)
            if bool(want_s.any()):
                landed_s = self._spawn_unit(row, want_s, ctr_s, self._settler_idx)
                self.civ_treasury[:, row] = torch.where(landed_s, self.civ_treasury[:, row] - sett_price, self.civ_treasury[:, row])
                # purchased settlers cost the spawn city a pop (real Civ 6)
                _pop_col = self.city_pop[bidx, row, spawn_slot]
                self.city_pop[bidx, row, spawn_slot] = torch.where(landed_s, (_pop_col - 1).clamp(min=1), _pop_col)
                bought = bought | landed_s
        # Kind 2: the MILITARY UNIT buy — nothing else bought and the live +
        # queued military under the quota (2x cities). The STRONGEST affordable
        # candidate wins (highest combat, ties to the lowest unit index = table
        # order), spawned at the capital; pay only where it LANDED.
        if kind is not None:
            want_u = active & ext & ~bought & (kind == 2) & (self._seat_army_count(row) < 2 * n_cities)
            if bool(want_u.any()):
                cand_u = self._seat_buy_unit_candidates(row, self._seat_trainable_units(row))
                elig_u = want_u & cand_u.any(dim=1)
                if bool(elig_u.any()):
                    key_u = self._type_combat.double().unsqueeze(0) * self.NU - torch.arange(self.NU, device=dev, dtype=torch.float64).unsqueeze(0)
                    key_u = torch.where(cand_u, key_u.expand(B, -1), torch.full((B, self.NU), -1e18, dtype=torch.float64, device=dev))
                    pick_ty = key_u.argmax(dim=1)
                    ctr_u = self.city_center[bidx, row, spawn_slot].clamp(min=0)
                    # a bought military unit inherits the SPAWN city's Encampment training XP
                    xp_u = (self.city_bldg[bidx, row, spawn_slot].long() * self._b_train_xp.reshape(1, -1)).max(dim=1).values
                    landed_u = self._spawn_unit(row, elig_u, ctr_u, pick_ty, init_xp=xp_u)
                    price_u = self._type_cost.gather(0, pick_ty).double() * mult
                    self.civ_treasury[:, row] = torch.where(landed_u, self.civ_treasury[:, row] - price_u, self.civ_treasury[:, row])
                    bought = bought | landed_u
        # Kinds 4/5/6: the FAITH buys, beside the gold ladder. WORSHIP first
        # (buyWorshipBuilding: its identity is a RULE — WORSHIP_BUILDINGS[seat
        # % n] — and the city needs a Temple, a complete unpillaged Holy Site
        # and no worship building yet), then ONE religious unit.
        if row in self._driven_buy_worship:
            wj = self._driven_buy_worship.pop(row)
            wb = self._worship_bidx_of(row)
            if wb >= 0:
                jw = wj.clamp(min=0, max=self.RC - 1)
                buy_w = active & ext & (wj >= 0) & self.civ_religion_done[:, row] \
                    & self._afford(self.civ_faith[:, row], self._worship_cost) \
                    & self._worship_city_ok(row)[bidx, jw]
                if bool(buy_w.any()):
                    rows_w = buy_w.nonzero(as_tuple=True)[0]
                    self.city_bldg[rows_w, row, jw[rows_w], wb] = True
                    self._eff_version += 1  # invariant: every city_bldg write bumps it
                    self.civ_faith[:, row] = torch.where(buy_w, self.civ_faith[:, row] - self._worship_cost, self.civ_faith[:, row])
        rel_kind, rel_j = self._driven_buy_relig.pop(row) if row in self._driven_buy_relig else (None, None)
        if rel_kind is not None and rel_j is not None:
            rel_city = self._seat_religious_city_ok(row)
            jr = rel_j.clamp(min=0, max=self.RC - 1)
            at_r = self.city_center[bidx, row, jr].clamp(min=0)
            base_r = active & ext & (rel_j >= 0) & self.civ_religion_done[:, row] & rel_city[bidx, jr]
            bought_relig = torch.zeros(B, dtype=torch.bool, device=dev)
            if self._missionary_idx >= 0:
                n_live_m = (self.major_unit_alive & (self.major_unit_seat == row) & (self.major_unit_type == self._missionary_idx)).sum(dim=1)
                mcost = self._enh["mcost"][self.civ_enhancer[:, row] + 1]  # [B] f64
                buy_m = base_r & (rel_kind == 5) & (n_live_m < self._missionary_cap) & self._afford(self.civ_faith[:, row], mcost)
                if bool(buy_m.any()):
                    # SCRIPTURE ships +1 charge, applied at purchase
                    chg_m = self._type_charges[self._missionary_idx] + self._enh["mchg"][self.civ_enhancer[:, row] + 1]
                    landed_m = self._spawn_unit(row, buy_m, at_r, self._missionary_idx, charges=chg_m)
                    self.civ_faith[:, row] = torch.where(landed_m, self.civ_faith[:, row] - mcost, self.civ_faith[:, row])
                    bought_relig = bought_relig | landed_m
            if self._apostle_idx >= 0:
                # the APOSTLE rung runs AFTER the missionary so the cheaper
                # unit saturates first; ONE religious unit per seat per turn,
                # whatever the wire asks. FLAT cost — missionaryCostMult is a
                # MISSIONARY discount and does not extend to apostles.
                n_live_a = (self.major_unit_alive & (self.major_unit_seat == row) & (self.major_unit_type == self._apostle_idx)).sum(dim=1)
                acost = torch.full((B,), float(round(self._apostle_cost)), dtype=torch.float64, device=dev)
                buy_a = base_r & (rel_kind == 6) & ~bought_relig & (n_live_a < self._apostle_cap) \
                    & self._afford(self.civ_faith[:, row], acost)
                if bool(buy_a.any()):
                    landed_a = self._spawn_unit(row, buy_a, at_r, self._apostle_idx, charges=self._type_charges[self._apostle_idx].expand(B))
                    self.civ_faith[:, row] = torch.where(landed_a, self.civ_faith[:, row] - acost, self.civ_faith[:, row])
        # Kind 3: the TILE buy — the LAST rung of the gold ladder. Position
        # matters: it sits in the gold block, which runs BEFORE the border
        # walker, and a claim feeds the yields computed in between. The driver
        # names [tile, slot]; re-validation here is the buyTile twin — the
        # NAMED tile unclaimed, adjacent to the NAMED city's own territory,
        # within radius 5, afforded at the LIVE price. The claim does NOT
        # advance city_cbox (purchases and culture keep separate clocks), but
        # city_acquired DOES (the next border tile costs more however this one
        # was gained).
        if kind is not None:
            # for kind 3 the wire's a/b ARE (tileIndex, city slot)
            want_t = (kind == 3) & active & ext & ~bought & (bbw >= 0) & (jjw >= 0)
            if bool(want_t.any()):
                jt = bbw.clamp(min=0, max=self.RC - 1)
                tt = jjw.clamp(min=0, max=self.tile_seat.shape[1] - 1)
                ctr_t = self.city_center[bidx, row, jt].clamp(min=0)
                ok_t = want_t & self.city_alive[bidx, row, jt] \
                    & (self.pair_dist[ctr_t, tt] <= 5) \
                    & self._seat_tile_unclaimed(tt.unsqueeze(1)).squeeze(1) \
                    & self._seat_tile_adj_city(row, self.city_id[bidx, row, jt], tt.unsqueeze(1)).squeeze(1)
                cost_t = self._seat_tile_price(row, ctr_t, tt)
                ok_t = ok_t & self._afford(self.civ_treasury[:, row], cost_t)
                if bool(ok_t.any()):
                    _rows = ok_t.nonzero(as_tuple=True)[0]
                    self.civ_treasury[_rows, row] -= cost_t[_rows]
                    self.tile_seat[_rows, tt[_rows]] = row  # ONE storage for tile ownership
                    self._tile_owner_ver += 1  # nothing else to retag
                    self._reveal_around(_rows, row, tt[_rows], 1)  # acquireTile's revealAround(seat, tile, 1)
                    self.tile_city[_rows, tt[_rows]] = self.city_id[_rows, row, jt[_rows]]
                    self.city_acquired[_rows, row, jt[_rows]] += 1
                    self.civ_tiles_purchased[_rows, row] += 1
                    self._eff_version += 1
                    bought = bought | ok_t
        # Kind 7: the LEVY — the levyUnits twin, AFTER every purchase (the
        # gold-block tail, just before the trade block). A wire DECISION: the
        # driver names the CS (at-war is ITS policy gate, not a rule).
        # Payment and cooldown are UNCONDITIONAL on a free spawn spot
        # (levyUnits pays before spawnUnit).
        if row in self._driven_levy and self.S > 0:
            lv = self._driven_levy.pop(row)
            Sl = self.S
            mil_idx_l = int(self.rules.citystate.get("militaristicIdx", -1))
            levy_cost = float(self.rules.citystate.get("levyGoldCost", 120))
            levy_units_n = int(self.rules.citystate.get("levyUnits", 2))
            want_l = active & ext & (lv >= 0) & (lv < Sl)
            if bool(want_l.any()):
                sl = lv.clamp(min=0, max=Sl - 1)
                ready_l = (self.turn - self.citystate_last_levy[bidx, sl]) >= self._levy_cooldown
                do_l = want_l & (self.citystate_type[bidx, sl] == mil_idx_l) & self._suzerain_mask(row)[bidx, sl] \
                    & ready_l & self._afford(self.civ_treasury[:, row], levy_cost)
                if bool(do_l.any()):
                    at_l = self.citystate_center[bidx, sl].clamp(min=0)
                    ltype = self._spearman_idx if self.turn > int(self.rules.combat.get("spearmanAfterTurn", 60)) else self._warrior_idx
                    ltype_t = torch.full((B,), ltype, dtype=torch.long, device=dev)
                    for _ in range(levy_units_n):
                        self._spawn_unit(row, do_l, at_l, ltype_t)  # best-effort; refunds nothing
                    self.civ_treasury[:, row] = torch.where(do_l, self.civ_treasury[:, row] - levy_cost, self.civ_treasury[:, row])
                    rows_l = do_l.nonzero(as_tuple=True)[0]
                    self.citystate_last_levy[rows_l, sl[rows_l]] = self.turn

    def _apply_seat_pref(self, row: int, pref: torch.Tensor, max_tries: int = 8) -> None:
        """Apply a PREFERENCE ORDER [B, RC, W] — best legal column wins.

        Walks the ranking best-first, re-running the ordinary apply for whatever
        is still idle. The pass is idempotent (its `act` gate needs
        `city_current == -1`), so a city that landed on an earlier rank is
        simply skipped by later ones — no bookkeeping, no partial rollback.

        The ENGINE NEVER CHOOSES. Every column it tries came from the policy's
        own ranking; all this does is discover which of them the live state
        actually accepts. That is the whole difference between this and letting
        apply fall through to "the next class", which would put the ladder's
        priority chain back inside the engine.

        `-inf` marks a column the policy rules out; the walk stops offering a
        city anything once its ranks run dry.

        `max_tries` bounds the walk. Districts are the only realistic failure, so
        it terminates on rank 0 or 1 in practice; the cap exists so a pathological
        ranking cannot spin.
        """
        if pref.dim() != 3:
            raise AssertionError(f"production_pref must be [B, RC, W], got {tuple(pref.shape)}")
        RCj = min(int(pref.shape[1]), self.RC)
        order = pref.argsort(dim=2, descending=True)  # [B, RC, W]
        scores = pref.gather(2, order)
        live = torch.isfinite(scores)
        for k in range(min(max_tries, int(pref.shape[2]))):
            idle = (self.city_current[:, row, :RCj] == -1) & self.city_alive[:, row, :RCj]
            if not bool(idle.any()):
                return
            code = order[:, :RCj, k].clone()
            code = torch.where(live[:, :RCj, k], code, torch.full_like(code, -1))
            if k > 0:
                code = torch.where(idle, code, torch.full_like(code, -1))
            if not bool((code >= 0).any()):
                return
            self._apply_seat_production(row, code)

    def _apply_seat_production(self, row: int, production: torch.Tensor) -> None:
        """THE production apply, for seat row `row` (0 = seat 0, r+1 = civ r):
        one pass over that seat's cities in SLOT order, each taking the code it
        was given.

        The walk is SEQUENTIAL because the decisions are order-coupled: a
        queued settler raises the next slot's settlerCost and a queued builder
        moves the builder escalator. TS applies a seat's recorded entries in the
        same slot order.

        Idempotent across passes by construction — the `act` gate needs
        `city_current == -1`, so a city assigned by an earlier pass is untouched
        by a later one, which is what the preference walk relies on.

        Every gate below is the TS rule re-validated AT APPLY, never a mask term
        trusted from before the walk: the mask is a snapshot, and an earlier
        slot of this very loop can invalidate it.
        """
        rdv = self.rules_dev
        rls = self.rules
        NBn = rdv.b_cost.shape[0]
        nS = len(self._scaffold)
        ext = self.seat_ext[:, row]
        alive_row = self.city_alive[:, row]
        n_cities = alive_row.sum(dim=1)
        cur_row = self.city_current[:, row]
        # The LIVE counters this walk moves. settlerCost reads
        # `cities - 1 + settlerCount + queued`, so a queue AND a purchase both
        # raise the price for every later slot.
        queued_s = (alive_row & (cur_row == self.SETTLER)).sum(dim=1)
        settlers_live = self._seat_settlers(row)
        nW_a = self._wond_n if self.districts_on else 0
        nP_a = len(self._proj_rows) if self.districts_on else 0
        for j in range(min(int(production.shape[1]), self.RC)):
            a = production[:, j].to(torch.long)
            alive_j = self.city_alive[:, row, j]
            cur_j = self.city_current[:, row, j]
            act = (a >= 0) & ext & alive_j & (cur_j == -1)
            # --- buildings [0, NB) ------------------------------------------
            is_b = act & (a >= 0) & (a < NBn)
            if bool(is_b.any()):
                bi = a.clamp(min=0, max=NBn - 1)
                # queueBuilding: availableBuildings, and never a worship
                # building (faith-purchased, never built) — both live in
                # _seat_buildable, which the mask asks too.
                is_b = is_b & self._seat_buildable(row)[:, j].gather(1, bi.unsqueeze(1)).squeeze(1)
                self.city_current[:, row, j] = torch.where(is_b, bi, self.city_current[:, row, j])
                self.city_cost[:, row, j] = torch.where(is_b, rdv.b_cost.gather(0, bi).double(), self.city_cost[:, row, j])
                self.city_progress[:, row, j] = torch.where(is_b, torch.zeros_like(self.city_progress[:, row, j]), self.city_progress[:, row, j])
            # --- the SETTLER column -----------------------------------------
            # queueSettler: a city under the pop gate may not train one.
            is_s = act & (a == self.SETTLER) & (self.city_pop[:, row, j] >= rls.settler_pop_gate)
            if bool(is_s.any()):
                s_cost = self._settler_cost(n_cities, settlers_live, queued_s)
                self.city_current[:, row, j] = torch.where(is_s, torch.full_like(cur_j, self.SETTLER), self.city_current[:, row, j])
                self.city_cost[:, row, j] = torch.where(is_s, s_cost, self.city_cost[:, row, j])
                self.city_progress[:, row, j] = torch.where(is_s, torch.zeros_like(self.city_progress[:, row, j]), self.city_progress[:, row, j])
                queued_s = queued_s + is_s.long()
            # --- the roster unit columns ------------------------------------
            is_u = act & (a >= self.UNIT_BASE) & (a < self.UNIT_BASE + self.NU)
            if bool(is_u.any()):
                ui = (a - self.UNIT_BASE).clamp(min=0, max=self.NU - 1)
                is_u = is_u & self._trainable_units(row)[:, j].gather(1, ui.unsqueeze(1)).squeeze(1)
                cost_q = self._type_cost.gather(0, ui).double()
                if self._builder_idx >= 0:
                    # a queued builder LOCKS the escalated price; the escalator
                    # counts builders ALREADY PRODUCED — a queue has produced none.
                    cost_q = torch.where(ui == self._builder_idx,
                                         self._builder_cost(self.civ_builders_trained[:, row]).double(), cost_q)
                self.city_current[:, row, j] = torch.where(is_u, a, self.city_current[:, row, j])
                self.city_cost[:, row, j] = torch.where(is_u, cost_q, self.city_cost[:, row, j])
                self.city_progress[:, row, j] = torch.where(is_u, torch.zeros_like(self.city_progress[:, row, j]), self.city_progress[:, row, j])
            # --- the scaffold districts -------------------------------------
            is_d = act & (a >= self.DISTRICT_BASE) & (a < self.DISTRICT_BASE + nS)
            if bool(is_d.any()) and self.districts_on and self._scaffold:
                # districtCost: floor(base·(1 + scale·max(tech%, civic%))) off
                # THIS seat's own trees — the formula every other site uses.
                dcp = rls.district_cost
                t_pct = self.civ_techs[:, row].sum(dim=1).double() / float(rdv.t_cost.shape[0])
                c_pct = self.civ_civics[:, row].sum(dim=1).double() / float(rdv.c_cost.shape[0])
                d_cost = torch.floor(dcp.get("base", 32) * (1 + dcp.get("scale", 9) * torch.maximum(t_pct, c_pct))).to(self.dtype)
                reg_j = self.city_dist_tile[:, row, j]  # [B, nD] THIS city's registry — the list TS counts
                spec_cnt = ((reg_j >= 0) & self._is_specialty.reshape(1, -1)).sum(dim=1)
                cap_j = torch.div(self.city_pop[:, row, j] - 1, 3, rounding_mode="floor") + 1  # maxSpecialtyDistricts(pop)
                for si, (di, utech, uciv, plc) in enumerate(self._scaffold):
                    want_d = is_d & (a == self.DISTRICT_BASE + si)
                    if not bool(want_d.any()):
                        continue
                    has_tech = (self.civ_techs[:, row, utech] if utech >= 0
                                else (self.civ_civics[:, row, uciv] if uciv >= 0
                                      else torch.ones(self.B, dtype=torch.bool, device=self.device)))
                    spec_si = bool(self._is_specialty[di])
                    under_cap = (spec_cnt < cap_j) if spec_si else torch.ones_like(want_d)
                    want_d = want_d & has_tech & (reg_j[:, di] < 0) & under_cap  # allowMultiple is False for every scaffold type
                    if not bool(want_d.any()):
                        continue
                    disc = self._district_discounted(row, di)  # the discount reads BEFORE the placement registers
                    d_cost_si = torch.where(disc, torch.floor(d_cost * 0.6), d_cost)
                    placed = self._place_district(row, j, di, want_d, plc)
                    if bool(placed.any()):
                        self.city_current[:, row, j] = torch.where(placed, torch.full_like(cur_j, self.DISTRICT_BASE + si), self.city_current[:, row, j])
                        self.city_cost[:, row, j] = torch.where(placed, d_cost_si, self.city_cost[:, row, j])
                        self.city_progress[:, row, j] = torch.where(placed, torch.zeros_like(self.city_progress[:, row, j]), self.city_progress[:, row, j])
                        if spec_si:
                            spec_cnt = spec_cnt + placed.long()
            # --- WONDER / PROJECT -------------------------------------------
            # The code names WHICH wonder; the engine re-runs the WHOLE
            # legality, because one-per-world is CROSS-SEAT (any seat may have
            # claimed it since the mask was taken) — the apply refuses rather
            # than double-building.
            is_w = act & (a >= self.WONDER_BASE) & (a < self.WONDER_BASE + nW_a)
            if bool(is_w.any()):
                base_okA = self._wonder_base_ok(row, j)
                for wcode in sorted(set(a[is_w].tolist())):
                    wi_a = int(wcode) - self.WONDER_BASE
                    unl_a = self._wonder_unlock_ok(row, wi_a)
                    if unl_a is None:
                        continue
                    rows_a = is_w & (a == wcode) & unl_a & ~(self.built_wonder == wi_a).any(dim=1)
                    if not bool(rows_a.any()):
                        continue
                    cand_a = self._wonder_cand(row, j, wi_a, base_okA)
                    rows_a = rows_a & cand_a.any(dim=1)
                    if bool(rows_a.any()):
                        self._queue_wonder_at(row, j, wi_a, rows_a, cand_a)
            is_p = act & (a >= self.PROJECT_BASE) & (a < self.PROJECT_BASE + nP_a)
            if bool(is_p.any()):
                pc_a = self._seat_proj_cost(row)
                for pcode in sorted(set(a[is_p].tolist())):
                    pi_a = int(pcode) - self.PROJECT_BASE
                    prow_a = self._proj_rows[pi_a]
                    if int(prow_a.get("sp", 0)) or int(prow_a.get("vic", 0)):
                        continue  # base rows only — the mask never offers these
                    d_ia = int(prow_a.get("d", -1))
                    if d_ia < 0 or d_ia >= self.city_dist_tile.shape[3]:
                        continue
                    regp_a = self.city_dist_tile[:, row, j, d_ia]
                    has_pa = (regp_a >= 0) & self.district_complete.gather(1, regp_a.clamp(min=0).unsqueeze(1)).squeeze(1)
                    rows_p = is_p & (a == pcode) & has_pa
                    if not bool(rows_p.any()):
                        continue
                    self.city_current[:, row, j] = torch.where(rows_p, torch.full_like(cur_j, self.PROJECT_BASE + pi_a), self.city_current[:, row, j])
                    self.city_cost[:, row, j] = torch.where(rows_p, pc_a, self.city_cost[:, row, j])
                    self.city_progress[:, row, j] = torch.where(rows_p, torch.zeros_like(self.city_progress[:, row, j]), self.city_progress[:, row, j])

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

    def _seat_fort_job_mask(self, row: int, techs: torch.Tensor | None = None) -> torch.Tensor:
        """[B, T]: the MILITARY ENGINEER's job set for seat row `row`. Owned,
        LAND, unimproved, un-districted, not a centre, FORT unlocked, and
        ADJACENT to a tile held by a major seat this row is AT WAR with.

        ONE body for every seat: ownership reads `tile_seat == row` and
        hostility reads the row's OWN LINE of the war matrix, which is a single
        seat space with row 0 in it. The FORT terms themselves are
        validImprovementsIn's MILITARY_ENGINEER arm; the adjacency term is the
        production ladder's policy for WHEN a seat wants one."""
        B = self.B
        dev = self.device
        if self.FORT < 0 or self._eng_idx < 0:
            return torch.zeros(B, self.T, dtype=torch.bool, device=dev)
        tk = techs if techs is not None else self.civ_techs[:, row]
        ut = int(self._imp_unlock[self.FORT])
        unl = tk[:, ut].unsqueeze(1) if ut >= 0 else torch.ones(B, 1, dtype=torch.bool, device=dev)
        owned = self.tile_seat == row
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
            # a seat-0 centre is a CITY_CENTER pave that lives in `center_at`
            # rather than `district` — the same term _job_mask_core carries.
            & (self.center_at < 0)
        )
        if not bool(base.any()):
            return base
        # hostile territory: the tiles of every MAJOR seat this row is at war
        # with (the civsAtWar test, applied per tile owner). Compact war row ==
        # absolute seat for the majors, so one loop covers seat 0 and the civs.
        host = torch.zeros(B, self.T, dtype=torch.bool, device=dev)
        for other in range(1 + self.R):
            if other == row:
                continue
            host = host | ((self.tile_seat == other) & self.war[:, row, other].unsqueeze(1))
        nb = self.neigh.clamp(min=0)
        adj = (host[:, nb] & (self.neigh >= 0).unsqueeze(0)).any(dim=2)
        return base & adj

    def _grant_relic(self, rows: torch.Tensor, civ: torch.Tensor) -> None:
        """The `placeRelic` mirror: hand each row's seat ONE relic, placed in the
        LOWEST city holding a TEMPLE with a free relic slot — city ARRAY order,
        which the dense city/rc slot order mirrors. A relic that finds no slot is
        LOST, as TS discards the return value the same way.

        `civ` [n] IS the seat's ROW in the merged city block (0 = seat 0,
        r+1 = civ r), so one walk places every seat's relic."""
        if rows.numel() == 0 or self._relic_bidx < 0:
            return
        row = civ.clamp(min=0, max=self.R)
        placed = torch.zeros(rows.numel(), dtype=torch.bool, device=self.device)
        for j in range(self.RC):
            take = (
                ~placed
                & self.city_alive[rows, row, j]
                & self.city_bldg[rows, row, j, self._relic_bidx].bool()
                & (self.city_relics[rows, row, j] < self._relic_slots)
            )
            if bool(take.any()):
                self.city_relics[rows[take], row[take], j] += 1
                placed = placed | take
        self._eff_version += 1  # relics are a yield-bearing write (faith)

    def _religious_victor(self) -> torch.Tensor:
        """The religiousVictor mirror: [B] the lowest religion id g such that
        EVERY seat holding at least one city has MORE THAN HALF of its cities
        following g; -1 none. Requires g founded (holy_tile set) and at least one
        living seat. At most one g can predominate within a seat, so the
        ascending scan needs no tie-break."""
        B, O, nrow = self.B, self._O, 1 + self.R
        # ONE walk over the majors — rows 0..R of the merged city block, seat 0
        # among them. `n` is each seat's city count; a seat holding none is
        # vacuously converted, which is what `cities.length === 0` gives TS.
        alive = self.city_alive[:, :nrow]                # [B, 1+R, RC]
        fol = self.city_followed[:, :nrow, : self.RC]    # [B, 1+R, RC]
        n = alive.sum(dim=2)                             # [B, 1+R]
        any_seat = (n > 0).any(dim=1)
        winner = torch.full((B,), -1, dtype=torch.long, device=self.device)
        for g in range(O):
            nf = (alive & (fol == g)).sum(dim=2)         # [B, 1+R]
            ok = (self.holy_tile[:, g] >= 0) & any_seat & ((n == 0) | (2 * nf > n)).all(dim=1)
            winner = torch.where((winner < 0) & ok, torch.full_like(winner, g), winner)
        return winner

    def _suzerain_mask(self, row: int) -> torch.Tensor:
        """[B, S] city-states seat row `row` is Suzerain of — the `isSuzerain`
        twin: >= suzerainEnvoys, alive, and STRICTLY more envoys than every
        other seat row (a tie leaves no suzerain)."""
        suz_min = int(self.rules.citystate.get("suzerainEnvoys", 3))
        env = self.seat_citystate_envoys  # [B, 1+R, S]
        mine = env[:, row]
        m = (mine >= suz_min) & self.citystate_alive
        for o in range(1 + self.R):
            if o != row:
                m = m & (mine > env[:, o])
        return m

    def _suzerain_count(self, row: int) -> torch.Tensor:
        """[B] how many of them there are."""
        return self._suzerain_mask(row).sum(dim=1)

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
        """The row-independent planes shared by the city walk and
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
        # _eff_food already subtracts a stripped feature's food, ahead of its
        # drought floor (the tileYields order) — do NOT strip column 0 again.
        f_base = self._eff_food()
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

    def _rcy_food_plane(self, row: int, g: dict) -> torch.Tensor:
        """Seat row `row`'s food plane — f_base plus ITS OWN farm-adjacency
        (Feudalism/Replaceable Parts tier × the shared qualifying set); every
        seat applies its own research boosts."""
        if row in g["f_r"]:
            return g["f_r"][row]
        f_plane = g["f_base"]
        if self.improvements_on:
            tier = self._farmadj_tier(self._seat_civics(row), self._seat_techs(row))
            if bool((tier > 0).any()):
                f_plane = f_plane + self._farmadj_qual().to(self.dtype) * tier.unsqueeze(1).to(self.dtype)
        g["f_r"][row] = f_plane
        return f_plane

    def _seat_civics(self, row: int) -> torch.Tensor:
        """[B, nCivics] seat row `row`'s own completed civics."""
        return self.civ_civics[:, row]

    def _seat_techs(self, row: int) -> torch.Tensor:
        """[B, nTechs] seat row `row`'s own completed techs."""
        return self.civ_techs[:, row]

    def _seat_envoys(self, row: int) -> torch.Tensor:
        """[B, S] seat row `row`'s envoys at each city-state."""
        return self.seat_citystate_envoys[:, row]

    def _seat_has_beliefs(self, row: int) -> bool:
        """Fast path: most seats/turns carry no claimed beliefs (a founder
        implies a follower, so pantheon|follower covers all three).
        Row-keyed: 0 = seat 0, r+1 = civ r."""
        return self._bel_any and bool(((self.civ_pantheon[:, row] >= 0) | (self.civ_follower[:, row] >= 0)).any())

    def _bel_add(self, key: str, row: int) -> torch.Tensor:
        """Seat-row `row`'s summed ADDITIVE belief effect rows (pantheon +
        follower + founder; unclaimed ids land on the zero pad row). Memoised
        on _bel_version — the only mutable inputs are civ_pantheon/
        civ_follower/civ_founder[:, row], which change solely at the
        belief-claim sites and at restore/reset, each of which bumps
        _bel_version. Consumers read-only."""
        if self._bel_add_memo is None or self._bel_add_memo[0] != self._bel_version:
            self._bel_add_memo = (self._bel_version, {})
        d = self._bel_add_memo[1]
        mk = ("add", key, row)
        v = d.get(mk)
        if v is None:
            v = (
                self._bel["pan"][key][self.civ_pantheon[:, row] + 1]
                + self._bel["fol"][key][self.civ_follower[:, row] + 1]
                + self._bel["fou"][key][self.civ_founder[:, row] + 1]
            )
            d[mk] = v
        return v

    def _bel_mul(self, key: str, row: int) -> torch.Tensor:
        """The MULTIPLICATIVE twin of _bel_add (pad row = 1.0) — border/growth."""
        return (
            self._bel["pan"][key][self.civ_pantheon[:, row] + 1]
            * self._bel["fol"][key][self.civ_follower[:, row] + 1]
            * self._bel["fou"][key][self.civ_founder[:, row] + 1]
        )

    def _bel_add_pf(self, key: str, row: int) -> torch.Tensor:
        """The pantheon + FOUNDER additive rows ONLY (NO follower) — the
        per-seat remainder, since the follower channel is a per-city lookup
        keyed on the followed religion. Used for bldgY (founder Stewardship
        keeps its Library/University/Market/Bank adds per-seat). Memoised on
        _bel_version, sharing _bel_add's memo under a disjoint key tag."""
        if self._bel_add_memo is None or self._bel_add_memo[0] != self._bel_version:
            self._bel_add_memo = (self._bel_version, {})
        d = self._bel_add_memo[1]
        mk = ("pf", key, row)
        v = d.get(mk)
        if v is None:
            v = (
                self._bel["pan"][key][self.civ_pantheon[:, row] + 1]
                + self._bel["fou"][key][self.civ_founder[:, row] + 1]
            )
            d[mk] = v
        return v

    def _follower_by_rel(self) -> torch.Tensor:
        """[B, O] follower-belief id per religion id — religion g is founded
        by seat row g (0 = seat 0, i+1 = civ i), so the map IS the
        civ_follower base. Pad id -1 gathers the neutral row 0 in the
        follower tables."""
        fbr = torch.full((self.B, self._O), -1, dtype=torch.long, device=self.device)
        n = min(self._O, self.civ_follower.shape[1])
        fbr[:, :n] = self.civ_follower[:, :n]
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

    def _city_rel(self, row: int) -> torch.Tensor:
        """The religion id each of seat-row `row`'s cities draws its follower
        belief from — followedReligion when the coupling is LIVE, else the
        row's OWN religion id (which IS the row: seat 0 = 0, civ r = r+1)."""
        if self._b18_couple:
            return self.city_followed[:, row]
        return torch.full((self.B, self.RC), row, dtype=torch.long, device=self.device)

    def _belief_feat_plane(self, row: int) -> torch.Tensor:
        """[B, T, 6] belief TILE adds — featureYields at tiles with a LIVE feature
        (fid >= 0 and not stripped), plus improvementOnResource at unpillaged
        improvements on a LIVE resource (category = the res priority code), plus
        improvementYields at unpillaged improvements. TS adds all three inside
        tileYields, so they ride every consumer: worked-tile picks and yields,
        scores, the border ySum. Row-keyed (0 = seat 0, r+1 = civ r).

        Cached single-slot on (row, _eff_version, _bel_version). Belief inputs
        bump _bel_version at claims/restore; tile inputs (feat_id/feat_stripped/
        improvement/pillaged/res_stripped/res_priority) bump _eff_version at their
        mutation sites. All consumers read-only."""
        key = (row, self._eff_version, self._bel_version)
        if self._belief_feat_cache is not None and self._belief_feat_cache[0] == key:
            return self._belief_feat_cache[1]
        featA = self._bel_add("featY", row)  # [B, nFeat, 6]
        plane = featA.gather(1, self.feat_id.clamp(min=0).unsqueeze(2).expand(-1, -1, 6))
        live = ((self.feat_id >= 0) & ~self.feat_stripped).unsqueeze(2).to(plane.dtype)
        plane = plane * live
        impA = self._bel_add("impRes", row)  # [B, 4, 6] rows by category code
        cat = torch.where(
            (self.improvement >= 0) & ~self.pillaged & ~self.res_stripped,
            self.res_priority.clamp(max=3),
            torch.zeros_like(self.res_priority),
        )  # 0 = no add (pad row)
        plane = plane + impA.gather(1, cat.unsqueeze(2).expand(-1, -1, 6))
        # belief improvementYields, gathered by the tile's improvement
        # (unpillaged; no resource condition — TS keys on the improvement
        # alone). The gather pad (idx 0 = FARM) is masked dead by imp_live.
        impY = self._bel_add("impY", row)  # [B, nImp, 6]
        imp_live = ((self.improvement >= 0) & ~self.pillaged).unsqueeze(2).to(plane.dtype)
        plane = plane + impY.gather(1, self.improvement.clamp(min=0).unsqueeze(2).expand(-1, -1, 6)) * imp_live
        self._belief_feat_cache = (key, plane)
        return plane

    def _route_raided_near(self, row: int, tiles: torch.Tensor) -> torch.Tensor:
        """routeRaidedAt for seat row `row` over a tile set [..., N] — true where
        a HOSTILE unit sits within 3. TS asks ONE predicate of every unit,
        `isBarbSeat(u.seat) || (u.seat !== seat && civsAtWar(u.seat, seat))`,
        which the war matrix answers for any seat pair; its diagonal is false,
        so the row's OWN units drop out of both live arms without a special
        case. unitsMode off raids nothing."""
        out = torch.zeros(*tiles.shape, dtype=torch.bool, device=self.device)
        if not self.units_mode:
            return out
        if self.barb_unit_tile.numel():  # barbarians: hostile to everyone
            d_b = self.pair_dist[tiles.unsqueeze(-1), self.barb_unit_tile.clamp(min=0).unsqueeze(1)] <= 3
            out = out | (d_b & self.barb_unit_alive.unsqueeze(1)).any(dim=-1)
        if self.major_unit_tile.numel():
            # ONE major arm: the war row gathered by each slot's own seat
            # already answers for seat 0 and every civ, and the matrix
            # diagonal drops this row's own units.
            hostv = self.major_unit_alive & self.war[:, row, :].gather(1, self._seat_row[self.major_unit_seat.clamp(min=0)])
            if bool(hostv.any()):
                d_v = self.pair_dist[tiles.unsqueeze(-1), self.major_unit_tile.clamp(min=0).unsqueeze(1)] <= 3
                out = out | (d_v & hostv.unsqueeze(1)).any(dim=-1)
        return out

    def _seat_route_income(self, row: int) -> torch.Tensor | None:
        """cityTradeYields for ANY seat row — per-COLUMN ORIGIN income from this
        row's unraided outgoing routes, [B, cols, 6] double in engine yield
        order (food, prod, gold, sci, cul, faith), or None when the row holds
        no active route batch-wide.

        DOMESTIC legs pay routeYields' 1 + floor(destCompletedSpecialty/2) to
        food AND production, plus Messenger of the Gods (the enhancer's
        tradeReligionYields) when the DEST city follows this row's own religion
        — religion ids ARE seat ids, and the seat is the row. A CS leg (dest
        encoded -(2+cityStateIdx)) pays cityStateRouteGold to gold +
        cityStateRouteSpec to the CS type's specialty column (_citystate_yidx),
        gated on citystate_alive — TS removes a captured CS and prunes its
        routes at capture, and this gate is the mirror for the same-turn read.
        An INTERNATIONAL leg (seat_route_dest >= 0 holds the dest CENTRE TILE)
        pays intlGold + the dest city's completed specialty count to GOLD only,
        refused while at war with the dest's seat.

        Every specialty count is a DISTRICT REGISTRY read, for this row's own
        cities and for a foreign destination alike — specialtyDistricts walks
        `city.districts`, so a tile scan is the wrong input on any row.
        Endpoints resolve by PERSISTENT id among LIVING cities.

        KNOWN CORNER vs TS (unchanged in kind, now uniform across rows): the
        intl dest is stored as a TILE, so a dest CAPTURED by another major
        resolves to the CAPTOR's city here where TS's (toSeat, toSeatCity)
        lookup drops the route. Closing it needs a route-store schema change.

        Cached single-slot on (turn, row, _eff_version, _rp_kill_version,
        _bel_version): trade and war run outside the walk that consumes this,
        district completions bump _eff_version (so a later origin's raised dest
        bonus recomputes), a strike-kill bumps _rp_kill_version, and an
        enhancer claim — which moves the Messenger term — bumps _bel_version.
        Callers iterate rows strictly sequentially, so the slot is always
        overwritten by a different row before the same row is re-requested.
        Consumers read one column, read-only."""
        key = (self.turn, row, self._eff_version, self._rp_kill_version, self._bel_version)
        if self._seat_route_cache is not None and self._seat_route_cache[0] == key:
            return self._seat_route_cache[1]
        rr = self.seat_routes[:, row]  # [B, K, 2]
        act = rr[:, :, 0] >= 0
        if not bool(act.any()):
            self._seat_route_cache = (key, None)
            return None
        B = self.B
        cols = self.RC
        ids = self.city_id[:, row, :cols]  # [B, cols]
        alive = self.city_alive[:, row, :cols]
        is_cs = rr[:, :, 1] <= -2  # CS dest encoding -(2+cityStateIdx)
        citystate_s = (-rr[:, :, 1] - 2).clamp(min=0)  # [B, K] cs index (garbage where ~is_cs)
        fm = (rr[:, :, 0].unsqueeze(2) == ids.unsqueeze(1)) & alive.unsqueeze(1)  # [B, K, cols]
        dm = (rr[:, :, 1].unsqueeze(2) == ids.unsqueeze(1)) & alive.unsqueeze(1)
        has_from = fm.any(dim=2)
        has_dest = dm.any(dim=2)
        from_j = fm.long().argmax(dim=2)  # ids unique per row → at most one hit
        dest_j = dm.long().argmax(dim=2)
        per = (1 + self._district_counts(row)[1] // 2).double()  # [B, cols] routeYields' food (= prod) column
        centers = self.city_center[:, row, :cols].clamp(min=0)  # [B, cols]
        # ONE hostile-near-endpoint mask [B, cols], reused by all three endpoint
        # scans below — this row's own cities, a city-state destination and an
        # international destination — because TS asks `routeRaidedAt(state,
        # [origin, dest], seat)`, the same walk over every unit, for each.
        near = self._route_raided_near(row, centers)
        inc = torch.zeros(B, cols * 6, dtype=torch.float64, device=self.device)
        # domestic legs
        raided_d = near.gather(1, from_j) | near.gather(1, dest_j)  # [B, K]
        pays_d = act & (rr[:, :, 1] >= 0) & has_from & has_dest & ~raided_d
        pd = pays_d.double()
        inc.scatter_add_(1, from_j * 6 + 0, per.gather(1, dest_j) * pd)
        inc.scatter_add_(1, from_j * 6 + 1, per.gather(1, dest_j) * pd)
        # Messenger of the Gods: +tradeRel yields on each DOMESTIC route whose
        # destination city follows THIS ROW's religion, at the route-loop
        # position, pre-tier. Religion ids are seat ids and the seat is the row,
        # so the test is `followedReligion === seat` on every row. CS
        # destinations carry no religion.
        if self._enh_any and bool((self.civ_enhancer[:, row] >= 0).any()):
            tr6 = self._enh["tradeRel"][self.civ_enhancer[:, row] + 1]  # [B, 6]
            if bool((tr6 != 0).any()):
                dest_fol = self.city_followed[:, row, :cols].gather(1, dest_j)  # [B, K]
                rel_ok = (pays_d & (dest_fol == row) & self.civ_religion_done[:, row].unsqueeze(1)).double()
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
            near_cs = self._route_raided_near(row, csc)
            css = citystate_s.clamp(max=S - 1)  # index-safe; the `< S` gate below is the real test
            citystate_ok = self.citystate_alive[:, :S].gather(1, css) & (citystate_s < S)
            raided_c = near.gather(1, from_j) | near_cs.gather(1, css)
            pays_c = act & is_cs & has_from & citystate_ok & ~raided_c
            pc = pays_c.double()
            inc.scatter_add_(1, from_j * 6 + 2, citystate_gold * pc)
            ycol = self._citystate_yidx[:, :S].gather(1, css)  # [B, K] specialty column per route
            inc.scatter_add_(1, from_j * 6 + ycol, citystate_spec * pc)
        # INTERNATIONAL legs: a route to ANY OTHER MAJOR's city
        # (seat_route_dest = the dest CENTRE TILE, >=0) pays intlGold + the dest
        # city's completed specialty count to GOLD only. Suspended while at war
        # with the DEST's seat or while a hostile prowls within 3 of either
        # endpoint.
        rd_i = self.seat_route_dest[:, row]  # [B, K] dest centre tile (>=0 = intl)
        intl = act & (rd_i >= 0)
        if bool(intl.any()):
            K_i = rd_i.shape[1]
            dest_tile = rd_i.clamp(min=0)  # [B, K]
            # The dest CITY, resolved the way tileBelongsTo names it: a centre
            # tile carries its own city's (seat, id), and a major's seat IS its
            # city-block row. A CS- or barbarian-held tile is not a major's city
            # and falls out on the row test.
            nrow, RCw = self.city_id.shape[1], self.city_id.shape[2]
            d_row = self.tile_seat.gather(1, dest_tile)  # [B, K] absolute seat
            d_id = self.tile_city.gather(1, dest_tile)  # [B, K] its persistent city id
            d_major = (d_row >= 0) & (d_row < nrow) & (d_row != row)
            dr = torch.where(d_major, d_row, torch.zeros_like(d_row))  # index-safe
            _rx = dr.unsqueeze(2).expand(B, K_i, RCw)
            hit = (self.city_id.gather(1, _rx) == d_id.unsqueeze(2)) & self.city_alive.gather(1, _rx)  # [B, K, RC]
            valid_dest = d_major & hit.any(dim=2)
            # specialtyDistricts on the DEST — the same DISTRICT REGISTRY read
            # this row takes for its own cities, indexed at the dest's (row,
            # column) instead of a map-wide district-tile scan.
            _reg = self.city_dist_tile  # [B, 1+R, RC, nD]
            _comp = (_reg >= 0) & self.district_complete.gather(1, _reg.clamp(min=0).reshape(B, -1)).reshape_as(_reg)
            _spec_all = (_comp & self._is_specialty.reshape(1, 1, 1, -1)).sum(dim=3)  # [B, 1+R, RC]
            spec_dest = _spec_all.gather(1, _rx).gather(2, hit.long().argmax(dim=2).unsqueeze(2)).squeeze(2)  # [B, K]
            gold_i = (self._trade_intl_gold + spec_dest).double()
            raided_i = near.gather(1, from_j) | self._route_raided_near(row, dest_tile)
            pays_i = intl & has_from & valid_dest & ~self.war[:, row, :].gather(1, dr) & ~raided_i
            inc.scatter_add_(1, from_j * 6 + 2, gold_i * pays_i.double())
        inc = inc.reshape(B, cols, 6)
        self._seat_route_cache = (key, inc)
        return inc

    def _bldg_dark(self, dt_reg: torch.Tensor) -> torch.Tensor:
        """Given a city district-tile registry [..., nD] (tile per district type,
        -1 = none), return [..., NB] bool = building b is dark because its
        district is COMPLETE-but-PILLAGED. CITY_CENTER buildings (_b_req_district
        == -1) never gate. The pillagedDistrictTypes twin, for any seat row —
        TS reads `city.districts`, a per-city LIST, so the registry (not a tile
        window) is the faithful input on every row."""
        if not self.districts_on or dt_reg.shape[-1] == 0:
            return torch.zeros(*dt_reg.shape[:-1], self.NB, dtype=torch.bool, device=self.device)
        B0 = dt_reg.shape[0]
        flat = dt_reg.clamp(min=0).reshape(B0, -1)
        comp = self.district_complete.gather(1, flat).reshape_as(dt_reg)
        pilf = self.district_pillaged.gather(1, flat).reshape_as(dt_reg)
        pil = (dt_reg >= 0) & comp & pilf  # [..., nD]
        breq = self._b_req_district  # [NB]
        return pil[..., breq.clamp(min=0)] & (breq >= 0)  # [..., NB]

    def _seat_city_yields(self, r: int, j: int, mask: torch.Tensor, amen_yf: torch.Tensor | None = None) -> tuple[torch.Tensor, ...]:
        """ONE COLUMN of THE walk for civ seat r — the economy loop's mid-phase
        per-city pass, which reads state the batched call could not have seen
        (an earlier column's completion, claim or purchase). Returns (food,
        production, science, culture, gold, faith), each [B], zeroed outside
        `mask` — the post-buy ACTIVE snapshot, a subset of alive, which the
        walk has already masked against. amen_yf is the loop's FROZEN factor
        for this column."""
        yf = amen_yf.unsqueeze(1) if amen_yf is not None else self._seat_amenity(r + 1)[2][:, j:j + 1]
        t = self._seat_city_walk(r + 1, j, amen_yf=yf)[:, 0]  # [B, 6]
        z = torch.zeros_like(t[:, 0])
        return (
            torch.where(mask, t[:, 0], z),
            torch.where(mask, t[:, 1], z),
            torch.where(mask, t[:, 3], z),
            torch.where(mask, t[:, 4], z),
            torch.where(mask, t[:, 2], z),
            torch.where(mask, t[:, 5], z),
        )

    def _completed_wonders(self, row: int) -> torch.Tensor | None:
        """[B, cols, nW] — completedWonders(state, city) for every column of
        seat `row`: a registry entry whose tile carries a COMPLETE wonder.
        cols = C on row 0, RC on a civ row. None when the catalog is empty."""
        if not self._wond_n:
            return None
        cols = self.RC
        reg = self.city_wonder[:, row, :cols]
        return (reg >= 0) & self.built_wonder_complete.gather(1, reg.clamp(min=0).reshape(self.B, -1)).reshape_as(reg)

    def _wonder_growth_mult(self, compw: torch.Tensor | None) -> torch.Tensor | None:
        """[B] f64 — empireGrowthMult: the product of growthAllMult over every
        COMPLETE wonder the seat holds (Hanging Gardens 1.15). Empire-wide, so
        it is identical for every city of the row."""
        if compw is None:
            return None
        return torch.where(
            compw, self._wond_grow.reshape(1, 1, -1).expand_as(compw).double(), torch.ones_like(compw, dtype=torch.float64)
        ).prod(dim=2).prod(dim=1)

    def _wonder_regional_amenities(self, row: int, compw: torch.Tensor | None) -> torch.Tensor | None:
        """[B, cols] f64 — wonderRegionalAmenities: every COMPLETE wonder held
        by one of this seat's live cities pays its regionalAmenities to each
        live city centre within regional_range of the WONDER TILE (TS measures
        from the wonder, not from the city that holds it). No dedup — a wonder
        is unique world-wide. Joins the TIER balance only; the luxury ranking's
        baseHave is buildings + regional BUILDINGS (city.ts luxuryAmenities).
        None when no reaching wonder stands."""
        if compw is None or not bool((self._wond_regam > 0).any()):
            return None
        B, cols = self.B, compw.shape[1]
        alive = self.city_alive[:, row, :cols]
        src = compw & alive.unsqueeze(2) & (self._wond_regam > 0).reshape(1, 1, -1)
        if not bool(src.any()):
            return None
        nW = compw.shape[2]
        st = self.city_wonder[:, row, :cols].clamp(min=0).reshape(B, cols * nW)  # source tiles
        ctr = self.city_center[:, row, :cols].clamp(min=0)  # [B, cols] receivers
        dd = self.pair_dist[st.unsqueeze(2), ctr.unsqueeze(1)]  # [B, cols*nW, cols]
        hit = src.reshape(B, cols * nW).unsqueeze(2) & (dd <= self._regional_range)
        amt = self._wond_regam.reshape(1, 1, nW).expand(B, cols, nW).reshape(B, cols * nW, 1)
        return (hit.double() * amt).sum(dim=1) * alive.double()

    def _seat_regional(self, row: int) -> tuple[torch.Tensor, torch.Tensor] | None:
        """The regionalEffects twin for seat row `row` (0 = seat 0, r+1 = civ r):
        each regional building owned by one of this seat's cities whose source
        district (city_dist_tile of the building's type) is COMPLETE and
        unpillaged reaches every ALIVE same-seat city center within
        regional_range of the source tile; the same building id never stacks
        (any() over sources — TS's `seen` set). Reads LIVE state at call time
        (the per-j path sees mid-phase completions, like TS). Returns
        ([B, cols, 6] yields, [B, cols] amenities) in f64, or None when no city
        of this seat owns a regional building."""
        if not self._reg_bidx or not self.districts_on:
            return None
        B = self.B
        cols = self.RC
        alive = self.city_alive[:, row, :cols]
        dt_all = self.city_dist_tile[:, row, :cols]  # [B, cols, nD]
        ctrs = self.city_center[:, row, :cols].clamp(min=0)  # [B, cols] receiver centers
        y6 = am = None
        for n in self._reg_bidx:
            own_n = self.city_bldg[:, row, :cols, n] & alive  # [B, cols] source cities
            if not bool(own_n.any()):
                continue
            st = dt_all[:, :, int(self._b_req_district[n])]  # [B, cols] source district tile (-1 none)
            stc = st.clamp(min=0)
            ok = own_n & (st >= 0) & self.district_complete.gather(1, stc) & ~self.district_pillaged.gather(1, stc)  # pillaged source is dark
            if not bool(ok.any()):
                continue
            dd = self.pair_dist[stc.unsqueeze(2), ctrs.unsqueeze(1)]  # [B, src, recv] int16
            has = (ok.unsqueeze(2) & (dd <= self._regional_range)).any(dim=1) & alive  # [B, cols recv]
            hf = has.double()
            if y6 is None:
                y6 = torch.zeros(B, cols, 6, dtype=torch.float64, device=self.device)
                am = torch.zeros(B, cols, dtype=torch.float64, device=self.device)
            y6 = y6 + hf.unsqueeze(2) * self.rules_dev.b_yields[n].double().reshape(1, 1, 6)
            am = am + hf * float(self.rules.b_amenities[n])
        return None if y6 is None else (y6, am)

    def _district_counts(self, row: int) -> tuple[torch.Tensor, torch.Tensor]:
        """[B, cols] × 2 for seat row `row` — completedDistrictCount(city,
        false) and its specialtyOnly twin, off the city district REGISTRY
        (`city.districts`). CITY_CENTER lives outside the placeable catalog, so
        the registry already applies the TS filter's first arm."""
        cols = self.RC
        reg = self.city_dist_tile[:, row, :cols]
        comp = (reg >= 0) & self.district_complete.gather(1, reg.clamp(min=0).reshape(self.B, -1)).reshape_as(reg)
        return comp.sum(dim=2), (comp & self._is_specialty.reshape(1, 1, -1)).sum(dim=2)

    def _follower_live(self, row: int) -> bool:
        """Can a city of seat row `row` carry a FOLLOWER belief? Follower
        effects key on the city's FOLLOWED religion, which under live religion
        coupling can be one this seat never founded — so the seat's own
        pantheon/follower claim is not the question there. Uncoupled, every
        city follows its owner's religion and the two tests coincide (an
        unclaimed id gathers the neutral pad row, adding exact 0)."""
        return self._bel_any and (self._b18_couple or self._seat_has_beliefs(row))

    def _seat_housing(self, row: int) -> tuple[torch.Tensor, torch.Tensor]:
        """THE computeHousing + cityMaintenance body, for every seat row
        (0 = seat 0, r+1 = civ r). Returns (maintenance, housing), each
        [B, cols] f64.

        Every term is dyadic (water 2/3/5, building housing integral,
        improvement housing 0.5), so the f64 sum is exact in any order and the
        bucket order below — TS's water → districts → buildings → river →
        improvements → housingAll → conditional — costs nothing to keep.
        Water access DERIVES from the centre tile on every read
        (hasFreshWater/isCoastalLand, exported per tile as `wh`); nothing is
        stored per city, so a captured centre needs no rebuild."""
        B = self.B
        cols = self.RC
        alive = self.city_alive[:, row, :cols]
        is_cap_a = (self.city_is_cap[:, row, :cols] & alive).double()
        ctr = self.city_center[:, row, :cols].clamp(min=0)
        bldg = self.city_bldg[:, row, :cols]
        dreg = self.city_dist_tile[:, row, :cols]
        dflat = dreg.clamp(min=0).reshape(B, -1)
        dcomp = (dreg >= 0) & self.district_complete.gather(1, dflat).reshape_as(dreg)
        rd = self.rules_dev
        # cityMaintenance — per-type district upkeep over COMPLETED districts
        # (no pillage gate) + buildingMaintenance over EVERY building (no
        # pillage and no regional skip; cityMaintenance has neither), + the
        # capital's PALACE, which TS carries as an autoCapital entry in
        # city.buildings and the GPU carries as an is_cap bonus.
        maint = (self._d_maint.double().reshape(1, 1, -1) * dcomp.double()).sum(dim=2)
        maint = maint + torch.einsum("bjn,n->bj", bldg.double(), rd.b_maintenance.double())
        maint = maint + float(self.rules.palace_maintenance) * is_cap_a
        # WATER: fresh > coastal > none, then the Aqueduct — a fresh city gains
        # aqFreshBonus, a dry one is raised to aqNoFreshTotal. A pillaged
        # Aqueduct gives nothing.
        wh = self.tile_wh.gather(1, ctr)  # [B, cols] f64
        if self._aqueduct_idx >= 0:
            aq_t = dreg[:, :, self._aqueduct_idx]
            aq_c = aq_t.clamp(min=0)
            has_aq = (aq_t >= 0) & self.district_complete.gather(1, aq_c) & ~self.district_pillaged.gather(1, aq_c)
            water = torch.where(
                has_aq,
                torch.where(wh == float(self._h_fresh), wh + self._aq_fresh_bonus,
                            torch.maximum(wh, torch.full_like(wh, self._aq_no_fresh_total))),
                wh,
            )
        else:
            water = wh
        # BUILDINGS — housing goes dark in a pillaged district; regional
        # buildings are NOT skipped here (computeHousing has no regional arm,
        # and their catalog housing is 0 anyway).
        selb_h = bldg & ~self._bldg_dark(dreg)
        housing = water + torch.einsum("bjn,n->bj", selb_h.double(), rd.b_housing.double())
        housing = housing + self._palace_housing * is_cap_a
        # NEIGHBORHOOD housing is APPEAL-based, so it cannot ride the flat
        # district table (its catalog row is housing: 0) and it cannot ride the
        # one-tile-per-type REGISTRY either — NEIGHBORHOOD is the only
        # allowMultiple district. Tile scan, keyed to the city that owns the
        # tile, and skipped entirely while none stands.
        if self._nbhd_didx >= 0:
            nb_ok = (self.district == self._nbhd_didx) & self.district_complete & ~self.district_pillaged & (self.tile_seat == row)
            if bool(nb_ok.any()):
                ap = self._tile_appeal()
                hv = torch.full_like(ap, self._appeal_floor)
                for cut, val in sorted(self._appeal_cuts):  # ascending: higher tiers overwrite
                    hv = torch.where(ap >= cut, torch.full_like(ap, val), hv)
                ids = self.city_id[:, row, :cols]  # [B, cols] persistent ids
                hit = nb_ok.unsqueeze(2) & (self.tile_city.unsqueeze(2) == ids.unsqueeze(1)) & alive.unsqueeze(1)  # [B, T, cols]
                housing = housing + ((hv * nb_ok).double().unsqueeze(2) * hit.double()).sum(dim=1)
        if self._follower_live(row):
            # Religious Community — a FOLLOWER belief: +housing on Shrines /
            # Temples, keyed per-city on the religion the city FOLLOWS. Dark
            # buildings excluded, like the flat table above.
            housing = housing + torch.einsum("bjn,bjn->bj", selb_h.double(), self._fol_tab("bldgH", self._follower_id_for(self._city_rel(row))))
        if self._seat_has_beliefs(row):
            # River Goddess' housing half on river CENTERS — a PANTHEON belief,
            # so it keys on the seat.
            housing = housing + self._bel_add("river", row)[:, 1].unsqueeze(1) * self.tile_river.gather(1, ctr).double()
        if self.improvements_on:
            # +catalog housing per owned improvement within the work radius
            # (pillaged or not — computeHousing does not gate on pillaged,
            # unlike yields). The tile must belong to THIS CITY, not merely to
            # this seat: Civ 6 pays the improvement's housing to the city whose
            # culture borders contain the tile, and a tile lies inside exactly
            # one. https://civilization.fandom.com/wiki/Housing_(Civ6)
            win = tiles_from_offsets(ctr.reshape(-1), self._off3, self.W, self.H).reshape(B, cols, -1)
            wf = win.clamp(min=0).reshape(B, -1)
            imp_w = self.improvement.gather(1, wf).reshape_as(win)
            own = (
                (win >= 0)
                & (self.tile_seat.gather(1, wf).reshape_as(win) == row)
                & (self.tile_city.gather(1, wf).reshape_as(win) == self.city_id[:, row, :cols].unsqueeze(2))
                & (imp_w >= 0)
            )
            housing = housing + (self._imp_housing[imp_w.clamp(min=0)].double() * own.double()).sum(dim=2)
        # This seat's government/policy housingAll (MONARCHY +1) and BOTH
        # district-conditional rules (housingIfDistricts / newDeal).
        if self._gov_has_effects:
            gm = self._gov_mods(row)
            housing = housing + gm[2].double().unsqueeze(1)
            all_d, spec_d = self._district_counts(row)
            housing = housing + self._cond_house_amen(gm[8], gm[9], all_d, spec_d)[0]
        return maint, torch.where(alive, housing, torch.zeros_like(housing))

    def _seat_amenity(self, row: int) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
        """THE amenity body, for every seat row (0 = seat 0, r+1 = civ r) —
        computeCityStats' amenity half, in f64.

        baseHave = local (non-regional, unpillaged) building amenities + the
        capital PALACE + regional BUILDING amenities; luxuryAmenities ranks on
        THAT and grants +1 to its luxAmenityCities neediest cities. The terms
        city.ts leaves OUT of the ranking then join the TIER balance only:
        government/policy amenitiesAll + newDeal, regional WONDER amenities,
        follower Zen Meditation and pantheon River Goddess. War weariness is
        subtracted last.

        Returns (tier_idx, growth_f, yield_f, lux_add), each [B, cols]; the
        factors are f64 and a caller running self.dtype casts them. The seat
        block calls this ONCE per row, at its loop top (_seat_city_stats), so
        the luxury ranking freezes there for the whole walk."""
        cols = self.RC
        rd = self.rules_dev
        alive = self.city_alive[:, row, :cols]
        is_cap = self.city_is_cap[:, row, :cols]
        dreg = self.city_dist_tile[:, row, :cols]
        # Local building amenities, pillaged-dark. Regional buildings leave the
        # local sum (localBuildingAmenities' `if (def.regional) continue`) — the
        # regional channel below delivers them by RANGE.
        selb = self.city_bldg[:, row, :cols] & ~self._bldg_dark(dreg) & ~self._b_regional.reshape(1, 1, -1)
        have = torch.einsum("bjn,n->bj", selb.to(torch.float64), rd.b_amenities.double())
        # PALACE amenity on the capital — baseHave sums city.buildings, which
        # hold the founding PALACE, so it joins BEFORE the luxury ranking.
        # CITY_CENTER never pillages.
        have = have + self._palace_amenities * (is_cap & alive).double()
        # regional BUILDING amenities (Zoo/Stadium) join baseHave BEFORE the
        # luxury ranking — the city.ts luxuryAmenities mirror.
        _regional = self._seat_regional(row)
        if _regional is not None:
            have = have + _regional[1]
        need = torch.ceil((self.city_pop[:, row, :cols].double() - 2) / 2).clamp(min=0)
        lux_add = self._luxury_amenities(row, have, need)
        # this seat's OWN government/policy flat amenities and the newDeal
        # specialty rule — computeCityStats' two arms.
        if self._gov_has_effects:
            _gm = self._gov_mods(row)
            _g_amen, _g_hid, _g_nd = _gm[7], _gm[8], _gm[9]
            _all_d, _spec_d = self._district_counts(row)
            _, _cond_amen = self._cond_house_amen(_g_hid, _g_nd, _all_d, _spec_d)
            have = have + _g_amen.unsqueeze(1) + _cond_amen
        # Regional WONDER amenities (Great Bath / Alhambra / Colosseum) join the
        # TIER balance after the grant — city.ts leaves them out of baseHave.
        _wregam = self._wonder_regional_amenities(row, self._completed_wonders(row))
        if _wregam is not None:
            have = have + _wregam
        extra = None
        if self._seat_has_beliefs(row):
            # River Goddess — a PANTHEON belief, so it keys on the SEAT: +amenities
            # on river CENTERS, tier balance only (the luxury ranking above stays
            # building-amenities-based).
            ctr = self.city_center[:, row, :cols].clamp(min=0)
            extra = self._bel_add("river", row)[:, 0].unsqueeze(1) * self.tile_river.gather(1, ctr).double()
        if self._follower_live(row) and self.districts_on:
            # Zen Meditation — a FOLLOWER belief, so it keys per-city on the
            # religion the city FOLLOWS, which need not be this seat's.
            zen = self._fol_tab("zen", self._follower_id_for(self._city_rel(row)))  # [B, cols, 2] = min, amenities
            zmin, zamt = zen[:, :, 0], zen[:, :, 1]
            if bool((zamt != 0).any()):
                _spec = self._district_counts(row)[1].double()
                _z = torch.where(_spec >= zmin, zamt, torch.zeros_like(_spec))
                extra = _z if extra is None else extra + _z
        balance = have + lux_add - need if extra is None else have + lux_add + extra - need
        # war-weariness drag, subtracted from the tier balance after the luxury
        # grants — the same position every seat uses.
        balance = balance - self._ww_penalty(row, torch.float64).unsqueeze(1)
        growth_f, yield_f = self._amenity_factors(balance)
        # Amenity-tier INDEX (0 Ecstatic … 4 Unhappy) — loyalty reads it.
        tier_idx = torch.full_like(self.city_pop[:, row, :cols], len(self.rules.amenity_tiers) - 1)
        for i in reversed(range(len(self.rules.amenity_tiers))):
            tier_idx = torch.where(balance >= self.rules.amenity_tiers[i][0], torch.full_like(tier_idx, i), tier_idx)
        return tier_idx, growth_f.double(), yield_f.double(), lux_add

    def _clear_city_slot(self, b: int, row: int, col: int) -> None:
        """Empty a city slot — the `seat.cities = seat.cities.filter(...)` twin.

        TS DELETES the City object, so nothing of it may survive. A GPU slot is
        a storage ADDRESS the next occupant reaches through append-at-
        last-alive+1 or a compaction, and every field left behind is a fact of a
        city that no longer exists — a queue front, a works count, a walls pool.
        `center` and `id` are deliberately kept: the caller reads them to re-tag
        territory after the slot is gone, and every arrival path overwrites both.
        """
        self.city_alive[b, row, col] = False
        self.city_is_cap[b, row, col] = False  # capital identity dies with the city (civ_cap_tile keeps the tile)
        self.city_pop[b, row, col] = 0
        self.city_growth[b, row, col] = 0
        self.city_cbox[b, row, col] = 0
        self.city_acquired[b, row, col] = 0
        self.city_loyalty[b, row, col] = 100.0
        self.city_hp[b, row, col] = int(self.rules.combat.get("cityMaxHp", 200))
        self.city_outer_hp[b, row, col] = 0
        # The dead city's QUEUE dies with it: a stale `current` makes the row's
        # has-queue test see a phantom item.
        self.city_current[b, row, col] = -1
        self.city_progress[b, row, col] = 0
        self.city_cost[b, row, col] = 0
        self.city_qtile[b, row, col] = -1
        self.city_prod_bank[b, row, col] = 0
        self.city_gw_writing[b, row, col] = 0
        self.city_gw_art[b, row, col] = 0
        self.city_gw_music[b, row, col] = 0
        self.city_relics[b, row, col] = 0
        self.city_artifacts[b, row, col] = 0
        self.city_dist_tile[b, row, col, :] = -1
        self.city_wonder[b, row, col, :] = -1
        self.city_bldg[b, row, col, :] = False
        self.city_followed[b, row, col] = -1
        self.city_pressure[b, row, col, :] = 0

    def _city_col_at(self, row: int, rows: torch.Tensor, tiles: torch.Tensor) -> torch.Tensor:
        """`cityAtTile` in COLUMN space — the column of seat row `row`'s
        city owning each (rows[i], tiles[i]) pair, -1 where the tile is not
        this row's.

        `tile_city` stores the owning city's PERSISTENT id for every seat
        (#110), so the column is that id's position in this row's ALIVE
        registry; ids are per-seat monotonic, so an alive match is unique."""
        ids = self.city_id[rows, row]  # [k, RC]
        m = (
            (self.tile_seat[rows, tiles] == row).unsqueeze(1)
            & (self.tile_city[rows, tiles].unsqueeze(1) == ids)
            & self.city_alive[rows, row]
        )
        return torch.where(m.any(dim=1), m.long().argmax(dim=1), torch.full_like(tiles, -1))

    def _seat_city_append(self, b: int, row: int) -> int:
        """The `seat.cities.push` mirror for ANY seat row: a received city takes
        last-alive+1, never the alive COUNT — a capture hole would point the
        count at a live city, and TS appends, so new cities iterate LAST. The
        step-end reclaim compacts the holes away, which is what keeps the head
        inside RC while the cap allows only maxCities living."""
        occ = self.city_alive[b, row].nonzero(as_tuple=True)[0]
        col = int(occ.max()) + 1 if len(occ) else 0
        assert col < self.RC, "city slots exhausted — raise RC (this is true living capacity)"
        return col

    def _transfer_city(self, b: int, src_row: int, src_col: int, dst_row: int, *, conquest: bool) -> bool:
        """ONE `transferCity` for every pair of MAJOR seat rows — conquest and
        loyalty flip, seat 0 and civ alike. There is no seat-0 transfer and no
        other-seat transfer: a city leaves one row's list and joins another's.

        The receiver earns GRIEVANCES, the loser re-crowns and loses its routes
        to the city, the city's OWN tiles (registry scan, never a radius sweep)
        re-tag to the receiver's next id, pop lands at ×0.75 floor 1, the boxes
        reset, and the COMPLETE districts, the wonders, the buildings, the great
        works, the relics and the religion all ride along.

        Returns False when a CONQUEST razes at the receiver's city cap: the city
        ceases — territory freed, centre unpaved, no plunder. LOYALTY FLIPS ARE
        UNCAPPED IN EITHER DIRECTION; TS gates that arm on `why === 'conquered'`,
        never on who is receiving."""
        dev = self.device
        half_hp = (int(self.rules.combat.get("cityMaxHp", 200)) + 1) // 2  # Math.round(CITY_MAX_HP / 2)
        # Read the identity BEFORE the slot is emptied — a major's block row IS
        # its tile_seat value, which is how the territory scan finds its tiles.
        c_t = int(self.city_center[b, src_row, src_col])
        cid = int(self.city_id[b, src_row, src_col])
        # Taking a city earns GRIEVANCES — every receiver, accrued at the TOP
        # like TS's, so a raze at the cap earns them too.
        self.civ_warmonger[b, dst_row] += self._wm_cap
        # Conquest keeps infrastructure: snapshot everything that rides with the
        # city before the loser slot is emptied. `old_bldg` carries the
        # Amphitheater / Museum / Temple slots that house the great works, which
        # is why the works ride along with it.
        old_pop = int(self.city_pop[b, src_row, src_col])
        old_acq = int(self.city_acquired[b, src_row, src_col])
        old_gww = int(self.city_gw_writing[b, src_row, src_col])
        old_gwa = int(self.city_gw_art[b, src_row, src_col])
        old_gwm = int(self.city_gw_music[b, src_row, src_col])
        old_rel = int(self.city_relics[b, src_row, src_col])
        old_art = int(self.city_artifacts[b, src_row, src_col])
        old_bldg = self.city_bldg[b, src_row, src_col, :].clone()
        # RELIGION TRAVELS WITH THE CITY (TS copies religionPressure and
        # followedReligion into the flipped literal). Both planes are slot
        # indexed, so the fact has to be carried across by hand.
        old_fol = int(self.city_followed[b, src_row, src_col])
        old_pres = self.city_pressure[b, src_row, src_col, :].clone()
        # The city leaves the loser's list...
        self._clear_city_slot(b, src_row, src_col)
        self.centre_slot_at[b, c_t] = -1
        # ...and the loser re-crowns immediately, BEFORE the route prune and
        # BEFORE the raze early-out — the TS call order.
        _b1 = torch.tensor([b], dtype=torch.long, device=dev)
        self._relocate_palace(_b1, torch.tensor([src_row], dtype=torch.long, device=dev))
        # Routes die with their endpoint. Foreign routes INTO this city heal at
        # the loop's dead-destination filter — city ids are per-seat, so no
        # other row's list can name this one.
        kill = (self.seat_routes[b, src_row, :, 0] == cid) | (self.seat_routes[b, src_row, :, 1] == cid)
        self.seat_routes[b, src_row][kill] = -1
        self.seat_route_dest[b, src_row][kill] = -1
        self.seat_route_exp[b, src_row][kill] = -1
        # Exactly this city's tiles move, found by registry scan (tileBelongsTo):
        # a work-radius sweep would leak the outer ring as orphaned territory and
        # steal a sibling city's frontage.
        owned = (self.tile_seat[b] == src_row) & (self.tile_city[b] == cid)
        if conquest and int(self.city_alive[b, dst_row].sum()) >= int(self.rules.seats.get("maxCities", 6)):
            # The city simply ceases: tiles freed, centre unpaved (centre_slot_at
            # above — the `district` plane never encodes CITY_CENTER), no plunder.
            self.tile_seat[b] = torch.where(owned, torch.full_like(self.tile_seat[b], NO_SEAT), self.tile_seat[b])
            self.tile_city[b] = torch.where(owned, torch.full_like(self.tile_city[b], -1), self.tile_city[b])
            self._tile_owner_ver += 1
            self._eff_version += 1
            return False
        # The re-tagged tiles register to the RECEIVING city — its id is read
        # here and assigned to the slot below, the same value.
        new_id = int(self.civ_next_city_id[b, dst_row])
        self.tile_seat[b] = torch.where(owned, torch.full_like(self.tile_seat[b], dst_row), self.tile_seat[b])
        self.tile_city[b] = torch.where(owned, torch.full_like(self.tile_city[b], new_id), self.tile_city[b])
        self._tile_owner_ver += 1  # seat + which city: the two halves TS calls ownerSeat/ownerCity
        col = self._seat_city_append(b, dst_row)
        self.city_alive[b, dst_row, col] = True
        self.era_score[b, dst_row] += self._era_pts["conquer"]  # gained a city (the raze path returned above)
        self._reveal_around(_b1, dst_row, torch.tensor([c_t], dtype=torch.long, device=dev), 3)
        self.city_is_cap[b, dst_row, col] = False  # a received city is never a capital (TS isCapital: false)
        self.city_center[b, dst_row, col] = c_t
        self.city_id[b, dst_row, col] = new_id
        self.civ_next_city_id[b, dst_row] += 1
        self.centre_slot_at[b, c_t] = col
        self.city_pop[b, dst_row, col] = max(1, (old_pop * 3) // 4)
        self.city_growth[b, dst_row, col] = 0  # the transfer resets foodBox...
        self.city_cbox[b, dst_row, col] = 0  # ...and cultureBox
        self.city_acquired[b, dst_row, col] = old_acq
        self.city_loyalty[b, dst_row, col] = 100.0
        self.city_hp[b, dst_row, col] = half_hp
        self.city_outer_hp[b, dst_row, col] = 0  # ANCIENT_WALLS rides along at an EMPTY outer pool; it heals back, because the heal gate reads the walls bit in city_bldg
        self.city_current[b, dst_row, col] = -1  # TS queue: []
        self.city_progress[b, dst_row, col] = 0
        self.city_cost[b, dst_row, col] = 0
        self.city_qtile[b, dst_row, col] = -1
        self.city_prod_bank[b, dst_row, col] = 0  # TS pushes a FRESH literal, so productionBank is undefined there
        self.city_gw_writing[b, dst_row, col] = old_gww
        self.city_gw_art[b, dst_row, col] = old_gwa
        self.city_gw_music[b, dst_row, col] = old_gwm
        self.city_relics[b, dst_row, col] = old_rel
        self.city_artifacts[b, dst_row, col] = old_art
        self.city_bldg[b, dst_row, col, :] = old_bldg
        self.city_followed[b, dst_row, col] = old_fol
        self.city_pressure[b, dst_row, col, :] = old_pres
        # The receiver's district registry is DERIVED from the tiles that just
        # re-owned, COMPLETE ones only — never copied from the loser's registry,
        # which is written at QUEUE time and so lists paves that never finished.
        # An incomplete captured district stays paved-but-dead: TS drops it from
        # the new city's array, and `availableBuildings` keys on a district
        # merely being present.
        live_ring = owned & (self.district[b] >= 0) & self.district_complete[b]
        self.city_dist_tile[b, dst_row, col, :] = -1
        for _t in live_ring.nonzero(as_tuple=True)[0].tolist():
            self.city_dist_tile[b, dst_row, col, int(self.district[b, _t])] = _t
        # ...and a tile marked dead at an EARLIER capture-while-incomplete that
        # has since completed returns to life with the new owner, maintenance
        # and yields included.
        dead_ring = owned & (self.district[b] >= 0) & ~self.district_complete[b]
        self.district_dead[b] = (self.district_dead[b] | dead_ring) & ~live_ring
        # Wonders are keyed by wonder index -> tile and carry no completeness
        # test, mirroring the TS `wonders.filter(tileBelongsTo(...))`.
        self.city_wonder[b, dst_row, col, :] = -1
        for _t in (owned & (self.built_wonder[b] >= 0)).nonzero(as_tuple=True)[0].tolist():
            self.city_wonder[b, dst_row, col, int(self.built_wonder[b, _t])] = _t
        # Real Civ 6 pays the captor gold for taking a city. ONE rate, every
        # captor — TS's `plunder` defaults to `why === 'conquered'`.
        if conquest:
            self.civ_treasury[b, dst_row] += 40.0
        # Losing the last city ends that war — elimination settles like any peace.
        if not bool(self.city_alive[b, src_row].any()):
            _elim = torch.zeros(self.B, dtype=torch.bool, device=dev)
            _elim[b] = True
            self._ww_peace(_elim, dst_row, src_row)
            self.war[b, src_row, dst_row] = False
            self.war[b, dst_row, src_row] = False
        self._eff_version += 1
        return True

    def _seat_border_key(self, row: int, center: torch.Tensor):
        """The SHARED border-candidate pick key for ONE city of seat row `row` —
        dist asc, resource priority desc, milli-rounded yield sum desc, global
        tile index asc (the pickBorderTile twin). Factored out so the CULTURE
        claim (_seat_border_growth) and the GOLD tile purchase use ONE
        construction and cannot drift apart. Loop-invariant: claims mutate
        ownership only, never the key. Returns (tiles, tc, nbs, key0)."""
        B = self.B
        tiles = tiles_from_offsets(center, self._off5, self.W, self.H)  # [B, M]
        tc = tiles.clamp(min=0)
        nbs = self.neigh[tc.reshape(-1)].reshape(B, -1, 6)  # [B, M, 6]
        g = self._rcy_globals()
        f_plane = self._rcy_food_plane(row, g)
        p_plane = g["p_plane"]
        if self._mine_boost_tech.numel() > 0 and self.MINE >= 0:
            boost_r = (self._seat_techs(row)[:, self._mine_boost_tech].to(self.dtype) * self._mine_boost_amt).sum(dim=1)
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
        if self._seat_has_beliefs(row):
            # belief featureYields ride the pick key too — pickBorderTile's ctx
            # carries the seat's modifiers
            featP = self._belief_feat_plane(row)
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

    def _seat_border_growth(self, row: int, col: torch.Tensor, act: torch.Tensor, cul_c: torch.Tensor) -> None:
        """Cultural border growth for ONE city of seat row `row` — box += this
        city's culture, then consume against `_border_cost` using the shared
        pick key (dist asc, resource priority desc, yield-sum desc, index asc;
        radius 5; unclaimed tiles, with water, impassables and natural wonders
        all claimable, like borderCandidates). `col` is the city's column, a
        [B] tensor because row 0 walks its columns in a per-batch order.

        The two predicates are the ones TS names: `tileClaimed(t)` is
        `tileSeat(t) !== NO_SEAT`, and the adjacency test is `tileBelongsTo(n,
        city)` — the same (tileSeat, tileCity) pair the work window uses, so a
        city cannot claim across a sibling's frontier."""
        bidx = self._bidx
        box = self.city_cbox[bidx, row, col]
        self.city_cbox[bidx, row, col] = torch.where(act, box + cul_c.to(box.dtype), box)
        center = self.city_center[bidx, row, col]
        cid = self.city_id[bidx, row, col]
        # Religious Settlements — Math.round(base * borderCostMult), the
        # city.ts form. Without beliefs the mult is 1 and js_round of the
        # integral base curve is exact, so the expression is unchanged.
        _bmul = self._bel_mul("border", row) if self._seat_has_beliefs(row) else None

        def _cost() -> torch.Tensor:
            base = self._border_cost(self.city_acquired[bidx, row, col])
            # the belief multiplier is f64; the box is the engine dtype, so the
            # threshold comes back in the box's dtype on every row.
            return js_round(base * _bmul).to(base.dtype) if _bmul is not None else base

        # most calls have no border-ready city — bail before building anything
        # (the loop re-checks per claim).
        if not bool((act & (self.city_cbox[bidx, row, col] >= _cost())).any()):
            return
        # Claims only mutate OWNERSHIP, so the candidate window, the row's ySum
        # plane and the pick key are loop-invariant and are built ONCE.
        tiles, tc, nbs, key0 = self._seat_border_key(row, center)
        unowned = None  # window planes dense once, then incremental per claim
        adj_own = None
        for _ in range(64):  # the TS while-loop: multiple claims per turn, escalating cost
            cost = _cost()  # belief border multiplier applied
            ready = act & (self.city_cbox[bidx, row, col] >= cost)
            if not bool(ready.any()):
                return
            if unowned is None:
                unowned = self._seat_tile_unclaimed(tc)
                adj_own = self._seat_tile_adj_city(row, cid, tc, nbs)
            ok = (tiles >= 0) & unowned & adj_own & ready.unsqueeze(1)
            key = torch.where(ok, key0, self._inf_f)
            best = key.argmin(dim=1)
            has_cand = ok.any(dim=1)
            claim = ready & has_cand
            if bool(claim.any()):
                rows = claim.nonzero(as_tuple=True)[0]
                spot = tiles[rows, best[rows]]
                self.tile_seat[rows, spot] = row  # setTileOwner's two halves:
                self.tile_city[rows, spot] = cid[rows]  # the seat and the city id
                self._tile_owner_ver += 1
                self._reveal_around(rows, row, spot, 1)  # acquireTile's revealAround(seat, tile, 1)
                # A claim widens a LATER city's workable candidates, so every
                # walk that already ran this turn is stale.
                self._claim_version += 1
                self.city_acquired[rows, row, col[rows]] += 1
                self.city_cbox[rows, row, col[rows]] -= cost[rows]
                # Only tile_seat[spot] changed (-1 -> row, per the unclaimed
                # gate). The spot leaves the unowned plane and window tiles
                # ADJACENT to it gain this city's adjacency — the same booleans
                # a dense re-derive would produce, since nothing else moved.
                unowned[rows, best[rows]] = False
                nb_s = self.neigh[spot]  # [n, 6]
                adj_hit = ((tiles[rows].unsqueeze(2) == nb_s.unsqueeze(1)) & (nb_s >= 0).unsqueeze(1)).any(dim=2)  # [n, M]
                adj_own[rows] = adj_own[rows] | adj_hit
            capped = ready & ~has_cand
            if bool(capped.any()):
                # Nowhere to grow: cap the box at the current threshold.
                cb = self.city_cbox[bidx, row, col]
                self.city_cbox[bidx, row, col] = torch.where(capped, torch.minimum(cb, cost), cb)
            if not bool(claim.any()):
                return

    def _found_city_at(self, row: int, want: torch.Tensor, tile: torch.Tensor) -> torch.Tensor:
        """FOUND a city for seat row `row` at `tile` [B] where `want` — the
        FOUND_CITY verb's mutation, ONE body for every seat (row 0 = seat 0,
        r+1 = civ r; a major's seat IS its block row). canFoundCity is
        re-checked LIVE at the settler's own tile; the settler unit is
        consumed by the CALLER. Returns the games that founded."""
        seat = row
        tc = tile.clamp(min=0)
        # canFoundCity: static legality (land / passable / no natural wonder /
        # no oasis = settle_ok), unowned by ANY seat, no district or wonder,
        # >= CITY_MIN_DIST from EVERY centre, and under the seat city cap.
        unowned = (
            (self.owner.gather(1, tc.unsqueeze(1)).squeeze(1) < 0)
            & (self.citystate_at.gather(1, tc.unsqueeze(1)).squeeze(1) < 0)
            & (self.civ_at.gather(1, tc.unsqueeze(1)).squeeze(1) < 0)
        )
        okt = (
            (tile >= 0) & unowned
            & self.settle_ok.gather(1, tc.unsqueeze(1)).squeeze(1)
            & (self.district.gather(1, tc.unsqueeze(1)).squeeze(1) < 0)
            & (self.built_wonder.gather(1, tc.unsqueeze(1)).squeeze(1) < 0)
        )
        # tooClose (CITY_MIN_DIST = 4) against every MAJOR centre (one flat
        # scan over the seat axis now that the block is one table) and every
        # city-state's.
        nrows = 1 + self.R
        ctr_all = self.city_center[:, :nrows].reshape(self.B, -1)
        live_all = self.city_alive[:, :nrows].reshape(self.B, -1)
        d_all = torch.where(live_all, self.pair_dist[tc.unsqueeze(1), ctr_all.clamp(min=0)].to(torch.long), 999)
        d_cs = torch.where(
            self.citystate_alive, self.pair_dist[tc.unsqueeze(1), self.citystate_center.clamp(min=0)].to(torch.long),
            torch.full_like(self.citystate_center, 999),
        )
        alive_row = self.city_alive[:, row]  # [B, RC]
        found = (
            want & okt
            & (d_all.min(dim=1).values >= 4)
            & (d_cs.min(dim=1).values >= 4)
            & (alive_row.sum(dim=1) < int(self.rules.seats.get("maxCities", 6)))
        )
        if not bool(found.any()):
            return found
        rows = found.nonzero(as_tuple=True)[0]
        # Append at last-alive+1 — the TS push mirror. The alive COUNT is not a
        # free slot while a hole stands (it would land on a live city); the
        # step-end reclaim compacts, so new cities iterate LAST and slot order
        # stays array order.
        occ_idx = torch.arange(self.RC, device=self.device).reshape(1, -1)
        slot = (torch.where(alive_row[rows], occ_idx, torch.full_like(occ_idx, -1)).max(dim=1).values + 1)
        assert int(slot.max()) < self.RC, "city slots exhausted — the step-end reclaim must have compacted"
        s_idx = tile[rows]
        self._reveal_around(rows, seat, s_idx, 3)  # foundCityAt's revealAround(seat, tile, 3)
        # isCapital = seat.cities.length === 0: a total-collapse refound
        # re-crowns and updates capitalTiles[row]; every other settle founds a
        # non-capital.
        new_cap = ~alive_row[rows].any(dim=1)
        self.city_alive[rows, row, slot] = True
        self.era_score[rows, row] += self._era_pts["found"]  # the foundCity moment
        self.city_is_cap[rows, row, slot] = new_cap
        self.civ_cap_tile[rows, row] = torch.where(new_cap, s_idx, self.civ_cap_tile[rows, row])
        self.city_center[rows, row, slot] = s_idx
        self.city_pop[rows, row, slot] = 1
        self.city_growth[rows, row, slot] = 0
        self.city_cbox[rows, row, slot] = 0
        # A NEWLY FOUNDED city starts with NO religion. `city_pressure` and
        # `city_followed` are indexed by SLOT and the per-turn block only zeroes
        # slots that are NOT alive, so a slot handed straight from a dead city to
        # a new one would inherit the previous occupant's accumulated pressure.
        # TS builds a fresh City with empty `religionPressure` and null
        # `followedReligion`, so these two writes are required.
        #
        # TRANSFERS deliberately do NOT reset: a transfer moves the existing city
        # and its pressure travels with it.
        self.city_pressure[rows, row, slot, :] = 0
        self.city_followed[rows, row, slot] = -1
        # Full SLOT HYGIENE — the append head is a compacted-away city's old
        # index, so every per-city fact a fresh City literal zeroes is written
        # here or the new city inherits the dead one's.
        self.city_prod_bank[rows, row, slot] = 0
        self.city_gw_writing[rows, row, slot] = 0  # a fresh city holds no works
        self.city_gw_art[rows, row, slot] = 0
        self.city_gw_music[rows, row, slot] = 0
        self.city_relics[rows, row, slot] = 0
        self.city_artifacts[rows, row, slot] = 0
        self.city_loyalty[rows, row, slot] = 100.0
        self.city_acquired[rows, row, slot] = 0
        self.city_hp[rows, row, slot] = self.rules.combat.get("cityMaxHp", 200)
        self.city_outer_hp[rows, row, slot] = 0  # walls come with the building
        self.city_current[rows, row, slot] = -1
        self.city_progress[rows, row, slot] = 0
        self.city_cost[rows, row, slot] = 0
        self.city_qtile[rows, row, slot] = -1
        self.city_dist_tile[rows, row, slot, :] = -1
        self.city_wonder[rows, row, slot, :] = -1
        self.city_bldg[rows, row, slot, :] = False
        # Persistent id — foundCityAt's `nextCityId++`; tile_city stores it
        # (TS ownerCity), the slot stays a storage address only.
        _new_cid = self.civ_next_city_id[rows, row].clone()
        self.city_id[rows, row, slot] = _new_cid
        self.civ_next_city_id[rows, row] += 1
        self.centre_slot_at[rows, s_idx] = slot
        # Claim the centre (unconditionally, as foundCity does); seat + which
        # city are the two halves TS calls ownerSeat/ownerCity.
        self.tile_seat[rows, s_idx] = seat
        self.tile_city[rows, s_idx] = _new_cid
        self._tile_owner_ver += 1
        # Founding strips like foundCity: the removable feature dies (tdef drops
        # to the hills component, feature yields vanish via feat_stripped, the
        # lent district adjacency withdraws) and the improvement dies with it.
        # `fresh_f` guards idempotence — an already-CHOPPED tile has nothing left
        # to withdraw. An UNREMOVABLE feature (oasis/floodplains) SURVIVES the
        # founding, so both writes gate on feat_removable: a blanket strip would
        # starve _belief_feat_plane of yields TS still pays.
        frm_f = self.feat_removable[rows, s_idx]
        self.tdef[rows, s_idx] = torch.where(frm_f, self.hills[rows, s_idx].long() * 3, self.tdef[rows, s_idx])
        self.tmove[rows, s_idx] = torch.where(frm_f, self.hills[rows, s_idx].long() * 3, self.tmove[rows, s_idx])  # a stripped feature does not slow movement
        fresh_f = ~self.feat_stripped[rows, s_idx] & frm_f
        self.feat_stripped[rows, s_idx] |= frm_f
        self.improvement[rows, s_idx] = -1
        # Founding does NOT clear tile.pillaged: a pillaged farm's flag survives
        # the founding — the improvement dies, the flag stays, and later readers
        # see it.
        contrib = self._feat_adj[rows, s_idx] * fresh_f.unsqueeze(1).to(self._feat_adj.dtype)  # [n, nD]
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
            self.tile_seat[rows[free], n_d[free]] = seat
            self.tile_city[rows[free], n_d[free]] = _new_cid[free]  # ring joins the founder's registry
            self._tile_owner_ver += 1
        self._eff_version += 1  # feat_stripped / d_static_adj changed
        return found

    def _hostile_vs_unit(self, att: torch.Tensor, tgt: torch.Tensor, atk_kind: str, u: int) -> None:
        """`meleeAttackInner`'s unit arm — the ONE melee-vs-unit
        resolution, for slot `u` of whichever pool `atk_kind` names.

        A military defender takes the defender-first roll pair with terrain
        defense and the victor-survives rule; a LONE hostile civilian is taken
        roll-free — captured by a major, killed by a barbarian — and the
        attacker advances into a tile its kill emptied.

        Nothing here branches on the pool a unit lives in: the attacker's
        planes come from `_pool_of`, what it MAY do from `SEAT_CAPS`, and who
        it may hit from `_seats_hostile`."""
        a_hp, a_tile, a_type, a_xp, a_emb, a_alive, a_seat = self._pool_of(atk_kind)
        a_occ, a_lo = self.military_at, self.POOL_LO[atk_kind]
        atk_cs_all = self._type_combat[a_type[:, u]]
        # WHAT the attacker is, asked of the capability table rather than of
        # the pool name: a MAJOR promotes, carries a religion and an aura, and
        # CAPTURES civilians; the hostile class does none of those.
        major = POOL_CLASS[atk_kind] == "major"
        ttc = tgt.clamp(min=0)
        here = a_tile[:, u]
        # the tile's military and civilian occupants, by MERGED slot and SEAT.
        # `unitsHostile` answers eligibility for both: a barbarian is hostile to
        # every non-barbarian and to no barbarian, and every other pair is the
        # symmetric war matrix — so no seat needs a clause of its own.
        mslot_raw = self.military_at.gather(1, ttc.unsqueeze(1)).squeeze(1)
        cslot_raw = self.civilian_at.gather(1, ttc.unsqueeze(1)).squeeze(1)
        neg = torch.full_like(mslot_raw, -1)
        m_seat = torch.where(mslot_raw >= 0, self.unit_seat.gather(1, mslot_raw.clamp(min=0).unsqueeze(1)).squeeze(1), neg)
        c_seat = torch.where(cslot_raw >= 0, self.unit_seat.gather(1, cslot_raw.clamp(min=0).unsqueeze(1)).squeeze(1), neg)
        a_seat_h = a_seat[:, u].unsqueeze(1)
        ok_m = self._seats_hostile(a_seat_h, m_seat.unsqueeze(1)).squeeze(1)
        ok_c = self._seats_hostile(a_seat_h, c_seat.unsqueeze(1)).squeeze(1)
        d_slot = torch.where(ok_m, mslot_raw, torch.where(ok_c, cslot_raw, neg))
        def_is_barb = ok_m & (m_seat == BARB_SEAT)
        mil_att = att & ok_m
        civ_att = att & ~ok_m & ok_c  # a LONE hostile civilian, whichever seat's
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
            # answers for every unit).
            d_emb = self.unit_emb.gather(1, ds0.unsqueeze(1)).squeeze(1) & ok_m
            def_cs = torch.where(d_emb, torch.full_like(def_cs, self._embarked_defense_cs), def_cs)
            # attacker AND defender fight at HP-reduced strength.
            def_hp = self.unit_hp.gather(1, ds0.unsqueeze(1)).squeeze(1)
            # attacker veterancy, gated on the attacking class's `caps.xp` — one
            # table, never a hardcoded pool name.
            atk_lvl5 = (self._xp_lvl_bonus(a_xp[:, u]) if SEAT_CAPS[POOL_CLASS[atk_kind]]["xp"]
                        else torch.zeros_like(a_hp[:, u]))
            atk_e = atk_cs_all - self._wound(a_hp[:, u]) - 5.0 * self._river_cross(here, tgt) + atk_lvl5  # wound + river + veterancy
            def_e = def_cs - self._wound(def_hp)
            # flanking helps the hostile attacker (barb/civ at `here`), support
            # helps the defender, whichever seat it belongs to.
            d_seat_m = torch.where(ok_m, m_seat, neg)
            _fl, _sp = self._flank_support(tgt, d_seat_m, here)
            atk_e = atk_e + FLANKING_CS * _fl
            def_e = def_e + SUPPORT_CS * torch.where(d_emb, torch.zeros_like(_sp), _sp)  # embarked → no support
            # enhancer adders — a MAJOR attacker gets the attack terms (Just
            # War near + Crusade onto following territory); the defender gets
            # the defense terms (embarked = flat, none). A religion's id is its
            # founder's seat, so both sides read the same planes; barbarians
            # found none and score 0.
            if major:
                atk_e = atk_e + (self._rel_atk_cs(a_seat[:, u], tgt).to(atk_e.dtype))  # unit-vs-unit: never city-gated
            def_e = def_e + torch.where(d_emb, torch.zeros_like(def_e), self._rel_def_cs(torch.where(def_is_barb, neg, d_seat_m), tgt).to(def_e.dtype))
            # Great General / Admiral aura. Attacker keyed on its own tile `here`
            # (a CIV attacker gets its civ's aura; a BARB has none); defender
            # keyed on `tgt` — seat 0, a civ seat, or barb (-1). Embarked/naval →
            # the ADMIRAL (sea) plane, NOT zeroed for embarked: generalAuraCS
            # gives an embarked defender the admiral aura on top of its flat CS.
            if major:
                atk_naval = self.unit_naval[a_type[:, u].clamp(min=0, max=self.NU - 1)] | a_emb[:, u]
                atk_e = atk_e + self._gen_aura_cs(a_seat[:, u], here, atk_naval).to(atk_e.dtype)
            def_naval = d_emb | (~def_is_barb & self.unit_naval[d_type.clamp(min=0, max=self.NU - 1)])
            def_civ_u = torch.where(def_is_barb, neg, d_seat_m)
            def_e = def_e + self._gen_aura_cs(def_civ_u, tgt, def_naval).to(def_e.dtype)
            _wwh = self._ww_occ(tgt)
            _wwd = self._tile_mil_seat(tgt)  # the defender, before it falls
            if SEAT_CAPS[POOL_CLASS[atk_kind]]["xp"]:
                a_xp[:, u] = torch.where(mil_att, a_xp[:, u] + XP_ATTACK, a_xp[:, u])
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
            adv_terr = self._advance_terrain(a_type[:, u], a_seat[:, u], tgt)
            # the advance probe, by seat (see _blocked_for).
            adv = def_dead & ~atk_dead & ~self._blocked_for(tgt.unsqueeze(1), a_seat[:, u].unsqueeze(1)).squeeze(1) & adv_terr
            if bool(adv.any()):
                vr = adv.nonzero(as_tuple=True)[0]
                a_occ[vr, here[vr]] = -1
                a_tile[vr, u] = ttc[vr]
                a_occ[vr, ttc[vr]] = u + a_lo
                if major:
                    self._clear_camp_at(adv, ttc, seat=a_seat[:, u])
        if bool(civ_att.any()):
            # A melee on a LONE hostile civilian is roll-free either way, and
            # only WHO is attacking decides which: a MAJOR captures it (the
            # `defender.seat = attacker.seat` arm), a barbarian kills it (no
            # prisoner system is modeled). Whose civilian it was never enters.
            rows = civ_att.nonzero(as_tuple=True)[0]
            if major:
                self._capture_unit(rows, cslot_raw[rows], atk_kind, a_seat[rows, u], ttc[rows])
            else:
                self._dig_at(rows, ttc[rows])  # a barb KILL leaves a dig
                self.civilian_at[(rows, ttc[rows])] = -1
                self.unit_alive[rows, cslot_raw[rows]] = False
                self._gen_ver += 1  # the killed civilian may be a general → invalidate the aura plane
        # a captured civilian is NOT killed — its captor does NOT advance onto
        # it (single occupancy, and the tile is still held). Only the barbarian
        # KILL frees the tile.
        kill_adv = civ_att if not major else torch.zeros_like(civ_att)
        if bool(kill_adv.any()):
            # the SAME naval-plane gate as the melee advance above — a roll-free
            # civilian kill by a barb GALLEY must not walk the hull onto the
            # (land) tile it just cleared.
            adv = (
                kill_adv
                & self._advance_terrain(a_type[:, u], a_seat[:, u], tgt)
                & ~self._blocked_for(tgt.unsqueeze(1), a_seat[:, u].unsqueeze(1)).squeeze(1)
            )
            if bool(adv.any()):
                vr = adv.nonzero(as_tuple=True)[0]
                a_occ[vr, here[vr]] = -1
                a_tile[vr, u] = ttc[vr]
                a_occ[vr, ttc[vr]] = u + a_lo

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
    def barb_at(self) -> torch.Tensor:
        """[B, T] — the BARBARIAN window's own slot at each tile, -1 else."""
        return self._pool_at(self.military_at, "barb")

    def _occ_slot_of(self, plane: torch.Tensor, seat) -> torch.Tensor:
        """[B, T] — `plane`'s occupant where it belongs to `seat`, -1 else.

        Every major seat shares one unit window, so "whose unit stands
        here" is a SEAT question and never a pool one. `seat` is an int or
        a [B, 1] tensor."""
        mine = (plane >= 0) & (self.unit_seat.gather(1, plane.clamp(min=0)) == seat)
        return torch.where(mine, plane, torch.full_like(plane, -1))

    def mil_slot_of(self, seat) -> torch.Tensor:
        """[B, T] — the MERGED slot of `seat`'s MILITARY unit per tile."""
        return self._occ_slot_of(self.military_at, seat)

    def civilian_slot_of(self, seat) -> torch.Tensor:
        """[B, T] — the MERGED slot of `seat`'s CIVILIAN unit per tile."""
        return self._occ_slot_of(self.civilian_at, seat)

    @property
    def owner(self) -> torch.Tensor:
        """[B, T] — the seat-0 city SLOT owning each tile, -1 for nobody.

        Not a plain view of `tile_seat`: it answers a different question, not
        "whose tile" but "whose CITY", TS's `ownerCity` beside its `ownerSeat`.
        `tile_city` stores the PERSISTENT city id for every seat (#110), while
        the ~30 consumers here speak column space — so the derivation matches
        row 0's id registry, ALIVE columns only (dead and never-founded columns
        hold stale ids and the zeros init; ids are per-seat monotonic, so an
        alive match is unique)."""
        if self._owner_ver != self._tile_owner_ver:
            ids0 = self.city_id[:, 0, : self.RC]  # [B, C]
            m = (
                (self.tile_seat == 0).unsqueeze(2)
                & (self.tile_city.unsqueeze(2) == ids0.unsqueeze(1))
                & self.alive.unsqueeze(1)
            )  # [B, T, C]
            self._owner_cache = torch.where(
                m.any(dim=2), m.long().argmax(dim=2),
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
            # the camp reward banks to the MOVER's own seat, read off the
            # merged pool rather than passed down by each caller.
            self._clear_camp_at(moved, dest, seat=self.unit_seat.gather(1, gs1).squeeze(1))
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
        # exerts no ZOC; barbarians never embark, so the merged emb plane answers
        # for every unit uniformly.
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
        seat = self.major_unit_seat[:, v].unsqueeze(1)  # [B, 1]
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
        ckey = torch.where(self.alive & hpT, dc * 4096 + torch.arange(self.RC, device=self.device), 10**9)
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

        ONE roll key whoever owns the district: `enc` for the damage and `encc`
        for the counter. The key used to split by owner seat, which was the last
        place the combat log claimed a seat-0 Encampment is fought differently —
        it is not, and the defense floor above is already one row-generic read.
        Draw ORDER is TS's: damage-to-district, then counter."""
        a_hp, a_tile, a_type, a_xp, a_emb, a_alive, a_seat = self._pool_of(atk_kind)
        a_occ = self.military_at
        atk_cs = self._type_combat[a_type[:, u]]
        major = POOL_CLASS[atk_kind] == "major"
        tc = tile.clamp(min=0)
        # The district fights at its OWNER's seat-level floor, whoever that
        # is — ONE row-generic read of the merged best-melee block. Only a
        # MAJOR ever paves an Encampment, so the row clamp is exact.
        hseat = self.tile_seat.gather(1, tc.unsqueeze(1)).squeeze(1)
        hrow = hseat.clamp(min=0, max=self.R)
        bidx = torch.arange(self.B, device=self.device)
        def_cs = torch.maximum(self.civ_best_melee[bidx, hrow], torch.full_like(hrow, 15))
        # Attacker CS assembled exactly as `_assault_city` assembles it.
        # ASK THE TABLE, never branch on the pool name: veterancy is
        # `SEAT_CAPS[...]["xp"]` at every site, so the fact has one source.
        # `hostile` is the only class with xp False, so barbs contribute 0.
        atk_lvl5 = (self._xp_lvl_bonus(a_xp[:, u]) if SEAT_CAPS[POOL_CLASS[atk_kind]]["xp"]
                    else torch.zeros_like(a_hp[:, u]))
        atk_e = atk_cs - self._wound(a_hp[:, u]) - 5.0 * self._river_cross(a_tile[:, u], tc) + atk_lvl5
        if major:
            atk_naval = self.unit_naval[a_type[:, u].clamp(min=0, max=self.NU - 1)] | a_emb[:, u]
            atk_e = atk_e + (self._rel_atk_cs(a_seat[:, u], tc).to(atk_e.dtype) if self._city_rel_live else 0)
            atk_e = atk_e + self._gen_aura_cs(a_seat[:, u], a_tile[:, u], atk_naval).to(atk_e.dtype)
        diff, cdiff = atk_e - def_cs, def_cs - atk_e
        d_enc = self._damage_roll(att, diff, k="enc", tile=tc)
        d_self = self._damage_roll(att, cdiff, k="encc", tile=tc)
        if SEAT_CAPS[POOL_CLASS[atk_kind]]["xp"]:
            a_xp[:, u] = torch.where(att, a_xp[:, u] + XP_ATTACK, a_xp[:, u])
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

    def _capture_unit(self, rows: torch.Tensor, src: torch.Tensor, pool: str,
                      dst_seat: torch.Tensor, tile: torch.Tensor) -> None:
        """`meleeAttack`'s roll-free civilian CAPTURE — ONE body, whichever
        major seat takes whichever major seat's civilian.

        TS re-seats the defender and then splices it to the END of
        `state.units`; the pooled twin despawns MERGED slot `src` and respawns
        at `pool`'s append head, so both engines iterate the captured unit LAST
        in every array-order walk. hp / charges / xp / embark ride along
        (`_CAPTURE_CARRY`); movesLeft is 0, so the heal skips it this turn. The
        captor does NOT advance — single occupancy, and the tile is still held.
        """
        lo = self.POOL_LO[pool]
        cur = getattr(self, self.POOL_NEXT[pool])
        nslot = cur[rows]
        assert int(nslot.max()) < self.POOL_HI[pool] - lo, (
            f"{pool} slot pool exhausted — raise its window"
        )
        dst = nslot + lo
        self.unit_alive[rows, src] = False
        self.unit_alive[rows, dst] = True
        self.unit_seat[rows, dst] = dst_seat
        self.unit_tile[rows, dst] = tile
        self._carry_capture(rows, src, dst)
        self.civilian_at[(rows, tile)] = dst
        cur[rows] += 1
        self._gen_ver += 1  # the captured civilian may be a general → invalidate the aura plane

    def _pool_of(self, atk_kind: str):
        """The unit-pool views for an attacker CLASS — "major" (every major
        seat shares one window) or "barb".

        Spelled once so a shared resolver can be written against "the
        attacker" instead of against near-identical copies keyed on which
        window it lives in.
        """
        return tuple(getattr(self, f"{atk_kind}_unit_{f}")
                     for f in ("hp", "tile", "type", "xp", "emb", "alive", "seat"))

    def _assault_city(self, att: torch.Tensor, tgt: torch.Tensor,
                      atk_kind: str, u: int):
        """`attackCity` — ONE melee assault on a MAJOR seat's city, whoever
        attacks and whoever holds.

        The DEFENDER is read off the seat-generic registries: `tile_seat` names
        the holder row at a centre tile and `centre_slot_at` names its column,
        so the same two gathers serve every row, under TS's one `cityAssault`
        roll-key pair ('rcty'/'rctyc') whoever the defender is.

        The only per-CLASS terms are the ones TS's own `assaultAtkCS` keys on,
        never pool accidents:
          * the veterancy bonus rides `SEAT_CAPS[...]["xp"]` — barbarians never
            accrue XP, so TS's unconditional `xpLevelBonus` is 0 for them and
            omitting it is byte-identical;
          * the religion adder keys on the attacker's SEAT, which is also its
            religion's id — a barbarian founds none and scores 0;
          * the general/admiral aura keys on the attacker's own seat, and a
            barbarian has none (seat -1).

        Returns `(rows, hrow, slot, died, ttc)`; the AFTERMATH stays with
        `_melee_city`, because a major CONQUERS and a barbarian SACKS.
        """
        if not bool(att.any()):
            return None
        B, dev = self.B, self.device
        bidx = torch.arange(B, device=dev)
        a_hp, a_tile, a_type, a_xp, a_emb, a_alive, a_seat = self._pool_of(atk_kind)
        ttc = tgt.clamp(min=0)
        hrow = self.tile_seat.gather(1, ttc.unsqueeze(1)).squeeze(1).clamp(min=0, max=self.R)
        slot = self.centre_slot_at.gather(1, ttc.unsqueeze(1)).squeeze(1).clamp(min=0)
        # the city fights at its holder's best-melee-ever, floored at 15, +5 for
        # a garrison of ITS OWN seat standing on the centre.
        gslot = self.military_at.gather(1, ttc.unsqueeze(1)).squeeze(1)
        gar = ((gslot >= 0) & (self.unit_seat[bidx, gslot.clamp(min=0)] == hrow)).long()
        best_r = self.civ_best_melee[bidx, hrow]
        def_cs = torch.maximum(best_r, torch.full_like(best_r, 15)) + gar * 5
        # wound + river (a city is not a unit), then veterancy.
        atk_e = (self._type_combat[a_type[:, u].clamp(min=0, max=self.NU - 1)]
                 - self._wound(a_hp[:, u])
                 - 5.0 * self._river_cross(a_tile[:, u], tgt))
        if SEAT_CAPS[POOL_CLASS[atk_kind]]["xp"]:
            atk_e = atk_e + self._xp_lvl_bonus(a_xp[:, u])
        if self._city_rel_live:
            atk_e = atk_e + self._rel_atk_cs(a_seat[:, u], tgt).to(atk_e.dtype)
        aura_civ = torch.where(a_seat[:, u] == BARB_SEAT,
                               torch.full_like(hrow, -1), a_seat[:, u])
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
        if SEAT_CAPS[POOL_CLASS[atk_kind]]["xp"]:
            a_xp[:, u] = torch.where(att, a_xp[:, u] + XP_ATTACK, a_xp[:, u])
        rows = att.nonzero(as_tuple=True)[0]
        hr, sl = hrow[rows], slot[rows]
        # the ANCIENT_WALLS outer pool soaks the hit first.
        outer = self.city_outer_hp[rows, hr, sl]
        absorbed = torch.minimum(outer, d_city[rows])
        self.city_outer_hp[rows, hr, sl] = outer - absorbed
        self.city_hp[rows, hr, sl] -= d_city[rows] - absorbed
        a_hp[:, u] = torch.where(att, a_hp[:, u] - d_atk, a_hp[:, u])
        died = att & (a_hp[:, u] <= 0)
        self._ww_battle(att, self._row_of(a_seat[:, u]), hrow, tgt, a_died=died, city=True)
        if bool(died.any()):
            dr = died.nonzero(as_tuple=True)[0]
            self._dig_at(dr, a_tile[dr, u])  # killUnit's dig
            self.military_at[(dr, a_tile[dr, u])] = -1
            a_alive[:, u] = a_alive[:, u] & ~died
        return rows, hrow, slot, died, ttc

    def _melee_city(self, att: torch.Tensor, tgt: torch.Tensor, atk_kind: str, u: int) -> None:
        """The battle in `_assault_city`, then the aftermath the ATTACKER's
        class decides: a MAJOR takes the city (one `_transfer_city`, which pays
        the +40 plunder and razes at the winner's cap), a BARBARIAN sacks it
        (barbs never hold ground).

        The city falling is NOT gated on the attacker surviving — TS kills the
        unit before the city-hp check, so an attacker can trade itself for the
        city.
        """
        _r = self._assault_city(att, tgt, atk_kind, u)
        if _r is None:
            return
        rows, hrow, slot, died, ttc = _r
        if rows.numel() == 0:
            return
        fell = rows[self.city_hp[rows, hrow[rows], slot[rows]] <= 0]
        if fell.numel() == 0:
            return
        if POOL_CLASS[atk_kind] == "major":
            a_seat = self._pool_of(atk_kind)[6]
            for _b in fell.tolist():
                self._transfer_city(_b, int(hrow[_b]), int(slot[_b]), int(a_seat[_b, u]), conquest=True)
            return
        # sackCity: -25% population (min 1), a milli-rounded 20% gold loss
        # (cap 100), half HP back, and the pillage ring around the centre.
        hr, sl = hrow[fell], slot[fell]
        self.city_pop[fell, hr, sl] = ((self.city_pop[fell, hr, sl] * 3) // 4).clamp(min=1)
        loss = torch.minimum(
            torch.tensor(100.0, dtype=torch.float64, device=self.device),
            js_round(js_round(self.civ_treasury[fell, hr].double() * 1000) / 1000 * 0.2).double(),
        )
        self.civ_treasury[fell, hr] -= loss.to(self.civ_treasury.dtype)
        self.city_hp[fell, hr, sl] = round(int(self.rules.combat.get("cityMaxHp", 200)) / 2)
        if self.improvements_on:
            centers = self.city_center[fell, hr, sl]
            nb_r = self.neigh[centers.clamp(min=0)]  # [K, 6]
            for d_ in range(6):
                n_d = nb_r[:, d_]
                on = (n_d >= 0) & (centers >= 0)
                r2, t2 = fell[on], n_d[on]
                hit = (self.improvement[r2, t2] >= 0) & ~self.pillaged[r2, t2]
                self.pillaged[r2[hit], t2[hit]] = True
            self._eff_version += 1

    def _assault_city_state(self, att: torch.Tensor, citystate_sc: torch.Tensor,
                            tgt: torch.Tensor, atk_kind: str, u: int):
        """ONE melee assault on a CITY-STATE centre, for any attacking seat —
        the `attackCityState` twin.

        Defense is `15 + pop (+6 militaristic)`; the csty/cstyc draw pair and the
        attacker-death cleanup are shared by every attacking seat, so the
        war-weariness death term is scored in exactly one place.

        The per-CLASS terms are TS's own `assaultAtkCS` clauses, not pool
        accidents — the same ones `_assault_city` documents.

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
        if self._city_rel_live:
            atk_e = atk_e + self._rel_atk_cs(a_seat[:, u], tgt).to(atk_e.dtype)
        # the aura joins attackCityState's atkCS ONCE, so the cstyc counter-roll
        # sees the same atk_e.
        aura_civ = torch.where(a_seat[:, u] == BARB_SEAT,
                               torch.full_like(a_seat[:, u], -1), a_seat[:, u])
        atk_naval = self.unit_naval[at0] | a_emb[:, u]
        atk_e = atk_e + self._gen_aura_cs(aura_civ, a_tile[:, u], atk_naval).to(atk_e.dtype)
        # DRAW ORDER is the parity contract: the minor's damage, then the counter.
        d_cs = self._damage_roll(att, atk_e - def_cs, k="csty", tile=tgt)
        d_atk = self._damage_roll(att, def_cs - atk_e, k="cstyc", tile=tgt)
        if SEAT_CAPS[POOL_CLASS[atk_kind]]["xp"]:
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
        """A CITY firing on the best target in range — the resolution half of
        both strikes.

        `cstk` (walls) and `estk` (Encampment) are the same rule under different
        FIRING GATES — one roll at the city's strength, no retaliation, never
        captures, the damaged defender's occupancy cleared on death and
        XP_DEFEND to a MILITARY survivor. There is no seat in the key: every
        seat's city fires the same two rolls.

        TARGET SELECTION stays with the caller (`_seat_city_strike`), because an
        Encampment strike needs a live garrison its walls counterpart does not.
        What is shared is the BATTLE.

        `striker_row` is the firing seat's war-matrix row, so the war-weariness
        hook is written once instead of once per caller.
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

    def _hostile_ranged_strike(self, att: torch.Tensor, tgt: torch.Tensor, atk_kind: str, u: int) -> torch.Tensor:
        """A hostile RANGED unit strikes tile tgt — the hostileRangedStrike twin:
        one roll, no retaliation, no advance.

        POOL-GENERIC, like _hostile_vs_unit: `atk_kind` names the pool and
        `_pool_of` reads slot u out of it (the barbarian ARCHER / CROSSBOWMAN
        raiders included). Hostility follows unitsHostile, then the strike's
        own scope-out: a MAJOR's ranged unit engages barbarians only, a
        barbarian's engages every major and never another barb.

        A HOSTILE seat's city takes the hit first even through a garrison
        (meleeAttack's city precedence) and HOLDS at 1 HP — ranged fire never
        captures; else the units on the tile (military first; civilians take
        the roll too, which is rangedAttack's convention, not the melee
        roll-free kill or capture). A centre this attacker is NOT hostile to
        falls through to the units, exactly as the melee scan does. Barbs
        carry no religion, no general aura and never accrue XP (gainXp guards
        that). Returns the rows that actually struck (the acted set)."""
        ttc = tgt.clamp(min=0)
        _hp_p, _tile_p, _type_p, _xp_p, _emb_p, _alive_p, _seat_p = self._pool_of(atk_kind)
        barb = POOL_CLASS[atk_kind] == "hostile"
        ut0 = _type_p[:, u].clamp(min=0, max=self.NU - 1)
        atk_rs = self._type_ranged_strength[ut0]
        a_hp, a_tile, a_seat = _hp_p[:, u], _tile_p[:, u], _seat_p[:, u]
        a_lvl = (self._xp_lvl_bonus(_xp_p[:, u]) if SEAT_CAPS[POOL_CLASS[atk_kind]]["xp"]
                 else torch.zeros_like(a_hp))
        # `a_naval` only selects the general-vs-ADMIRAL aura plane, and a
        # barbarian has no aura at all — every read of it below sits under
        # `not barb`.
        a_naval = self.unit_naval[ut0] | _emb_p[:, u]
        # `cityAtIndex` finds ANY major's centre, so this arm was never seat
        # 0's alone; `unitsHostile` decides who may be hit, exactly as the
        # melee scan's `seatTarget` does — a barbarian is hostile to every
        # holder, and a seat is never hostile to itself.
        _bidx = torch.arange(self.B, device=self.device)
        ctr = self._centre_seat_plane().gather(1, ttc.unsqueeze(1)).squeeze(1)
        _cneg = torch.full_like(ctr, -1)
        city_att = att & self._seats_hostile(
            a_seat.unsqueeze(1), torch.where((ctr >= 0) & (ctr < 100), ctr, _cneg).unsqueeze(1)).squeeze(1)
        if bool(city_att.any()):
            # cityDefenseStrength: max(15, the holder's strongest melee ever),
            # +5 when the holder's OWN military stands on the centre.
            hrow = ctr.clamp(min=0, max=self.R)
            hcol = self.centre_slot_at.gather(1, ttc.unsqueeze(1)).squeeze(1).clamp(min=0)
            _gm = self.military_at.gather(1, ttc.unsqueeze(1)).squeeze(1)
            gar = ((_gm >= 0) & (self.unit_seat[_bidx, _gm.clamp(min=0)] == hrow)).long()
            def_cs = torch.maximum(self.civ_best_melee[_bidx, hrow], torch.full_like(hrow, 15)) + gar * 5
            atk_e = atk_rs - self._wound(a_hp) + a_lvl  # wound (city not a unit) + veterancy
            if not barb:
                # aura inside hostileRangedStrike's ranged-strength
                # parentheses, after xpLevelBonus.
                # the enhancer ATTACKER adders apply to city assaults too —
                # Crusade/Just War key on where the UNIT stands, not on what it hits.
                # Inserted BEFORE the aura add so term order matches the TS assembly.
                atk_e = atk_e + (self._rel_atk_cs(a_seat, tgt).to(atk_e.dtype) if self._city_rel_live else 0)
                atk_e = atk_e + self._gen_aura_cs(a_seat, a_tile, a_naval).to(atk_e.dtype)
            d_city = self._damage_roll(city_att, atk_e - def_cs, k="vrngc", tile=tgt)
            self._ww_battle(city_att, self._row_of(self._atk_seat(atk_kind, u)), hrow, tgt, city=True)
            rows = city_att.nonzero(as_tuple=True)[0]
            hr_, hc_ = hrow[rows], hcol[rows]
            self.city_hp[rows, hr_, hc_] = (self.city_hp[rows, hr_, hc_] - d_city[rows]).clamp(min=1)
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
        elig_m = self._seats_hostile(a_seat.unsqueeze(1), m_seat.unsqueeze(1)).squeeze(1)
        elig_c = self._seats_hostile(a_seat.unsqueeze(1), c_seat.unsqueeze(1)).squeeze(1)
        if not barb:
            # `!(isCiv(attacker.seat) && isCiv(u.seat))` — a MAJOR's ranged
            # strike does not engage another MAJOR's units at all, a scope-out
            # ON TOP of hostility rather than instead of it. `isCiv` covers
            # seat 0 (cpu/core/seats.ts: 0 <= seat < 100), so seat-0 units are
            # inside the scope-out exactly as every civ's are.
            _major_m = (m_seat >= 0) & (m_seat < 100)
            _major_c = (c_seat >= 0) & (c_seat < 100)
            elig_m = elig_m & ~_major_m
            elig_c = elig_c & ~_major_c
        d_is_mil = elig_m
        civ_def = ~elig_m & elig_c  # a lone CIVILIAN defender (either owner)
        d_slot = torch.where(elig_m, mslot, torch.where(elig_c, cslot, neg))
        d_seat = torch.where(elig_m, m_seat, torch.where(elig_c, c_seat, neg))
        unit_att = att & ~city_att & (d_slot >= 0)
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
            # enhancer adders. A CIV attacker gets the attack terms; a
            # BARB carries no faith. A CIV DEFENDER gets the defense terms.
            if not barb:
                atk_e = atk_e + (self._rel_atk_cs(a_seat, tgt).to(atk_e.dtype))  # NEVER gated
            def_e = def_e + torch.where(d_emb, torch.zeros_like(def_e), self._rel_def_cs(torch.where(d_barb, neg, d_seat), tgt).to(def_e.dtype))
            # attacker aura on its OWN tile (barb: none); a barb or
            # a lone CIVILIAN defender gets none.
            if not barb:
                atk_e = atk_e + self._gen_aura_cs(a_seat, a_tile, a_naval).to(atk_e.dtype)
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
        # the MAJOR attacker earns +5 for the attack executed (vs city or
        # unit); a barbarian never accrues (gainXp guards); a strike that hit
        # neither returns empty and spends nothing.
        if SEAT_CAPS[POOL_CLASS[atk_kind]]["xp"]:
            _xp_p[:, u] = torch.where(city_att | unit_att, _xp_p[:, u] + XP_ATTACK, _xp_p[:, u])
        return city_att | unit_att

    def _ranged_attack(self, att: torch.Tensor, tgt: torch.Tensor, atk_kind: str,
                       u: int, row: int) -> torch.Tensor:
        """`rangedAttack` — the ORDER path's ranged resolution, for any seat.

        One roll, no retaliation, no advance. City-first over a MILITARY
        garrison, then the fallback chain meleeAttack uses (a MAJOR centre,
        then a CITY-STATE centre), then the units on the tile. Ranged fire
        never captures: a centre floors at 1 HP until melee finishes it, and a
        LONE hostile civilian TAKES THE ROLL rather than being taken.

        This is NOT `hostileRangedStrike`: that one is the AUTONOMOUS strike
        (the barbarian raider, and the SNIPE column), and it carries a
        scope-out keeping a major's fire off another major's units. An ORDERED
        ranged attack has no such clause on either engine.

        Returns the rows that actually fired; every refusal below is a TS early
        return, which leaves movesLeft untouched.
        """
        B, dev = self.B, self.device
        ttc = tgt.clamp(min=0)
        bidx = torch.arange(B, device=dev)
        a_hp, a_tile, a_type, a_xp, a_emb, a_alive, a_seat = self._pool_of(atk_kind)
        at0 = a_type[:, u].clamp(min=0, max=self.NU - 1)
        aseat = a_seat[:, u]
        a_lvl = (self._xp_lvl_bonus(a_xp[:, u]) if SEAT_CAPS[POOL_CLASS[atk_kind]]["xp"]
                 else torch.zeros_like(a_hp[:, u]))
        # The attacker assembly every arm shares: ranged strength, the wound
        # penalty, veterancy and the general/ADMIRAL aura keyed on the tile the
        # attacker stands on.
        a_naval = self.unit_naval[at0] | a_emb[:, u]
        atk_base = self._type_ranged_strength[at0] - self._wound(a_hp[:, u]) + a_lvl
        atk_base = atk_base + self._gen_aura_cs(aseat, a_tile[:, u], a_naval).to(atk_base.dtype)

        # who holds the tile, and is any of them hostile? `unitsHostile`
        # answers for every pair, so no seat needs a clause of its own.
        mslot = self.military_at.gather(1, ttc.unsqueeze(1)).squeeze(1)
        cslot = self.civilian_at.gather(1, ttc.unsqueeze(1)).squeeze(1)
        neg = torch.full_like(mslot, -1)
        m_seat = torch.where(mslot >= 0, self.unit_seat.gather(1, mslot.clamp(min=0).unsqueeze(1)).squeeze(1), neg)
        c_seat = torch.where(cslot >= 0, self.unit_seat.gather(1, cslot.clamp(min=0).unsqueeze(1)).squeeze(1), neg)
        ok_m = self._seats_hostile(aseat.unsqueeze(1), m_seat.unsqueeze(1)).squeeze(1)
        ok_c = self._seats_hostile(aseat.unsqueeze(1), c_seat.unsqueeze(1)).squeeze(1)
        city_first = ~(ok_c & ~ok_m)  # a LONE hostile civilian shields the centre
        ctr = self._centre_seat_plane().gather(1, ttc.unsqueeze(1)).squeeze(1)
        city_t = self._seats_hostile(
            aseat.unsqueeze(1), torch.where((ctr >= 0) & (ctr < 100), ctr, neg).unsqueeze(1)).squeeze(1)
        cs_t = torch.zeros_like(att)
        if self.S > 0:
            _cst = torch.zeros(B, self.T, dtype=torch.bool, device=dev)
            _cst.scatter_(1, self.citystate_center[:, :self.S].clamp(min=0), self._citystate_target(row))
            cs_t = _cst.gather(1, ttc.unsqueeze(1)).squeeze(1) & (ctr >= 100)
        city_att = att & city_first & city_t
        cs_att = att & city_first & ~city_t & cs_t
        # the enhancer ATTACKER adders (Just War near + Crusade onto following
        # territory) key on where the UNIT stands, not on what it hits, so they
        # join the city arms too — behind the same live flag every other
        # city-attack path asks.
        rel_city = (self._rel_atk_cs(aseat, tgt).to(atk_base.dtype) if self._city_rel_live
                    else torch.zeros_like(atk_base))

        if bool(city_att.any()):
            # cityDefenseStrength: max(15, the holder's strongest melee ever),
            # +5 when the holder's OWN military stands on the centre.
            hrow = self.tile_seat.gather(1, ttc.unsqueeze(1)).squeeze(1).clamp(min=0, max=self.R)
            slot = self.centre_slot_at.gather(1, ttc.unsqueeze(1)).squeeze(1).clamp(min=0)
            gar = ((mslot >= 0) & (m_seat == hrow)).long()
            def_cs = torch.maximum(self.civ_best_melee[bidx, hrow], torch.full_like(hrow, 15)) + gar * 5
            d_city = self._damage_roll(city_att, atk_base + rel_city - def_cs, k="rngrc", tile=tgt)
            self._ww_battle(city_att, self._row_of(aseat), hrow, tgt, city=True)
            rr = city_att.nonzero(as_tuple=True)[0]
            hr, sl = hrow[rr], slot[rr]
            self.city_hp[rr, hr, sl] = (self.city_hp[rr, hr, sl] - d_city[rr]).clamp(min=1)  # ranged never captures
        if bool(cs_att.any()):
            csx = self.citystate_at.gather(1, ttc.unsqueeze(1)).squeeze(1).clamp(min=0)
            mil_idx = int(self.rules.citystate.get("militaristicIdx", -1))
            def_cs = (
                15 + self.citystate_pop.gather(1, csx.unsqueeze(1)).squeeze(1)
                + (self.citystate_type.gather(1, csx.unsqueeze(1)).squeeze(1) == mil_idx).long() * 6
            )
            d_cs = self._damage_roll(cs_att, atk_base + rel_city - def_cs, k="rngcs", tile=tgt)
            self._ww_battle(cs_att, self._row_of(aseat), self._row_of(100 + csx), tgt, city=True)
            rr = cs_att.nonzero(as_tuple=True)[0]
            self.citystate_hp[rr, csx[rr]] = (self.citystate_hp[rr, csx[rr]] - d_cs[rr]).clamp(min=1)
        # No city took the shot — fall through to the units on the tile
        # (military first; a lone civilian takes the roll).
        unit_att = att & ~city_att & ~cs_att & (ok_m | ok_c)
        if bool(unit_att.any()):
            d_slot = torch.where(ok_m, mslot, torch.where(ok_c, cslot, neg))
            d_seat = torch.where(ok_m, m_seat, torch.where(ok_c, c_seat, neg))
            ds0 = d_slot.clamp(min=0)
            d_barb = d_seat == BARB_SEAT
            d_type = self.unit_type.gather(1, ds0.unsqueeze(1)).squeeze(1)
            # only a MILITARY defender fortifies or carries veterancy; a
            # civilian holds 0 in both merged planes.
            def_xp = torch.where(
                ok_m & ~d_barb,
                self._xp_lvl_bonus(self.unit_xp.gather(1, ds0.unsqueeze(1)).squeeze(1)),
                torch.zeros_like(mslot),
            )
            def_cs = (
                self._type_combat[d_type] + self._tdef_g(ttc)
                + self.unit_fortify.gather(1, ds0.unsqueeze(1)).squeeze(1) * 3 + def_xp
            )
            # an EMBARKED defender overrides to a flat CS — no terrain, no
            # fortify, no support.
            d_emb = self.unit_emb.gather(1, ds0.unsqueeze(1)).squeeze(1) & (d_slot >= 0)
            def_cs = torch.where(d_emb, torch.full_like(def_cs, self._embarked_defense_cs), def_cs)
            def_hp = self.unit_hp.gather(1, ds0.unsqueeze(1)).squeeze(1)
            def_e = def_cs - self._wound(def_hp)
            # support only — a ranged attacker takes no retaliation, so there
            # is no flanking term.
            _, _sp = self._flank_support(tgt, d_seat, torch.full_like(tgt, -1))
            def_e = def_e + SUPPORT_CS * torch.where(d_emb, torch.zeros_like(_sp), _sp)
            atk_e = atk_base + self._rel_atk_cs(aseat, tgt).to(atk_base.dtype)  # unit-vs-unit: never gated
            def_e = def_e + torch.where(
                d_emb, torch.zeros_like(def_e),
                self._rel_def_cs(torch.where(d_barb, neg, d_seat), tgt).to(def_e.dtype))
            def_naval = d_emb | (~d_barb & self.unit_naval[d_type.clamp(min=0, max=self.NU - 1)])
            def_e = def_e + self._gen_aura_cs(
                torch.where(ok_m & ~d_barb, d_seat, neg), tgt, def_naval).to(def_e.dtype)
            def_hp0 = self.unit_hp[bidx, ds0]
            d_def = self._damage_roll(unit_att, atk_e - def_e, k="rng", tile=tgt)
            g = unit_att.nonzero(as_tuple=True)[0]
            ds = d_slot[g]  # paired rows — gather(1, …) would read rows 0..|g|
            self.unit_hp[g, ds] -= d_def[g]
            dead = self.unit_hp[g, ds] <= 0
            gd, td = g[dead], ttc[g[dead]]
            self.unit_alive[gd, ds[dead]] = False
            self._dig_at(gd, td)  # killUnit's dig
            # Clearing both maps is branch-free and exact: only one of them is
            # set on that tile.
            md = ok_m[gd]
            self.military_at[gd[md], td[md]] = -1
            self.civilian_at[gd[~md], td[~md]] = -1
            # the war-weariness location multiplier is the TARGET tile's, for
            # ranged as much as for melee.
            self._ww_battle(unit_att, self._row_of(self._atk_seat(atk_kind, u)),
                            self._row_of(d_seat), tgt,
                            d_died=unit_att & (d_slot >= 0) & ((def_hp0 - d_def) <= 0))
            if bool((unit_att & ~ok_m).any()):
                self._gen_ver += 1  # a struck lone civilian may be a general
            # +2 to a surviving MILITARY defender that can earn it.
            surv = (unit_att & ok_m & ~d_barb).nonzero(as_tuple=True)[0]
            if len(surv) > 0:
                sp = surv[self.unit_hp[surv, d_slot[surv]] > 0]
                if len(sp) > 0:
                    self.unit_xp[sp, d_slot[sp]] += XP_DEFEND
        fired = city_att | cs_att | unit_att
        if SEAT_CAPS[POOL_CLASS[atk_kind]]["xp"]:
            a_xp[:, u] = torch.where(fired, a_xp[:, u] + XP_ATTACK, a_xp[:, u])
        return fired

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

    def _seat_trade_phase(self, row: int, active: torch.Tensor) -> None:
        """ONE new route per seat per turn while under capacity, then expiry —
        the seatPhase creation block, for EVERY seat row.

        Capacity mirrors tradeCapacity: FOREIGN_TRADE civic +1, Market-OR-
        Lighthouse per living city +1 (non-cumulative), each COMPLETED
        Colossus/Great Zimbabwe in a city's wonder REGISTRY +1 (`c.wonders`,
        not a tile scan), plus one per trade-type city-state this seat is
        Suzerain of.

        The pick mirrors the TS scan exactly: for each origin city in ARRAY
        order, its own cities (array order) then the MET city-states (index
        order); the best NEW in-range destination by the route's TOTAL yields —
        domestic 2 + 2*floor(specialtyDistricts(dest)/2), a city-state's flat
        gold+specialty — with strictly-greater-beats semantics, so ties keep the
        FIRST pair in that flat scan order. `specialtyDistricts` counts the
        destination's district REGISTRY, the same source TS filters.

        Only when NO domestic or city-state candidate exists does the scan reach
        INTERNATIONAL destinations: any OTHER major seat's city whose centre this
        seat has EXPLORED (fog is the meeting rule here, as for city-states),
        nearest first, ties by the same from-asc / seat-asc / city-asc order.
        Rows are walked in block order, which IS `state.seats` order.

        Slot order IS TS array order for every row: founding, capture and
        transfer all append at last-alive+1 and _reclaim_cities is stable."""
        B, RC, S, dev = self.B, self.RC, self.S, self.device
        alive = self.city_alive[:, row]  # [B, RC]
        rr = self.seat_routes[:, row]  # [B, K, 2]
        # ONE city suffices — a met CS is a routable dest, and the TS gate is
        # actor.cities.length >= 1. Domestic pairs still need 2, via the pair
        # masks below.
        want = active & (alive.sum(dim=1) >= 1)
        if not bool(want.any()):
            self._expire_seat_routes(row)  # expiry is unconditional
            return
        cap = torch.zeros(B, dtype=torch.long, device=dev)
        if self._trade_ftc >= 0:
            cap = cap + self._seat_civics(row)[:, self._trade_ftc].long()
        bldg = self.city_bldg[:, row]  # [B, RC, NB]
        mkt = torch.zeros(B, RC, dtype=torch.bool, device=dev)
        if self._trade_mkt >= 0:
            mkt = mkt | bldg[:, :, self._trade_mkt]
        if self._trade_lgh >= 0:
            mkt = mkt | bldg[:, :, self._trade_lgh]
        cap = cap + (mkt & alive).sum(dim=1)
        for wi in self._trade_wonders:
            wt = self.city_wonder[:, row, :, wi]  # [B, RC] — wonder wi's tile per slot
            cap = cap + ((wt >= 0) & alive & self.built_wonder_complete.gather(1, wt.clamp(min=0))).sum(dim=1)
        if S > 0:
            trade_ti = int(self.rules.citystate.get("tradeIdx", -1))
            cap = cap + (self._suzerain_mask(row)[:, :S] & (self.citystate_type[:, :S] == trade_ti)).sum(dim=1)
        used = (rr[:, :, 0] >= 0).sum(dim=1)
        want = want & (used < cap)
        if not bool(want.any()):
            self._expire_seat_routes(row)  # expiry runs even at capacity
            return
        # dest score (destination-only): routeYields food+prod =
        # 2 + 2*floor(destCompletedSpecialty/2)
        dt = self.city_dist_tile[:, row]  # [B, RC, nD] tile per district TYPE
        comp = (dt >= 0) & self.district_complete.gather(1, dt.clamp(min=0).reshape(B, -1)).reshape_as(dt)
        spec = (comp & self._is_specialty.reshape(1, 1, -1)).sum(dim=2)  # [B, RC]
        ysum = 2 + 2 * (spec // 2)  # [B, RC] long, >= 2
        centers = self.city_center[:, row].clamp(min=0)  # [B, RC]
        d = self.pair_dist[centers.unsqueeze(2), centers.unsqueeze(1)]  # [B, RC, RC]
        # routes hold PERSISTENT ids; stale ids at dead columns are masked by
        # the alive gates in every valid* below.
        ids = self.city_id[:, row]  # [B, RC]
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
                & (self.seat_citystate_met[:, row, :S] & self.citystate_alive[:, :S]).unsqueeze(1)
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
        K = self.seat_routes.shape[2]
        exp_val = int(self.turn) + self._trade_duration

        def _free_slot(rws: torch.Tensor) -> torch.Tensor:
            free = self.seat_routes[rws, row, :, 0] < 0  # [n, K]
            s = torch.where(free, torch.arange(K, device=dev).reshape(1, -1), torch.full((1, K), K, device=dev)).min(dim=1).values
            assert int(s.max()) < K, "seat_routes columns exhausted — raise K above the capacity bound"
            return s

        do = want & (kmax >= 0)
        if bool(do.any()):
            rows = do.nonzero(as_tuple=True)[0]
            i_pick = (first[rows] // W2)
            jj_pick = (first[rows] % W2)
            to_id = torch.where(jj_pick < RC, ids[rows, jj_pick.clamp(max=RC - 1)], -(2 + (jj_pick - RC)))
            slot = _free_slot(rows)
            self.seat_routes[rows, row, slot, 0] = ids[rows, i_pick]
            self.seat_routes[rows, row, slot, 1] = to_id
            self.seat_route_dest[rows, row, slot] = -1  # domestic/CS
            self.seat_route_exp[rows, row, slot] = exp_val
            # The route's Trader lays road along its land path. i_pick / jj_pick
            # ARE the slot indices `ids` is keyed by, so the centres come
            # straight off them (CS destinations sit past RC).
            _o = centers[rows, i_pick]
            _d = torch.where(
                jj_pick < RC,
                centers[rows, jj_pick.clamp(max=RC - 1)],
                self.citystate_center[rows, (jj_pick - RC).clamp(min=0, max=max(S - 1, 0))],
            )
            self._lay_trade_road(rows, _o, _d)

        # international: rows that WANT a route but found no domestic/CS
        # candidate consider ANY OTHER MAJOR's city whose centre this seat has
        # EXPLORED, NEAREST first (ties keep from-asc, then the block-row scan
        # order, which IS TS's `state.seats` order).
        intl_want = want & (kmax < 0)
        dctr_l, dalv_l = [], []
        for r2 in range(1 + self.R):
            if r2 == row:
                continue
            dctr_l.append(self.city_center[:, r2].clamp(min=0))
            dalv_l.append(self.city_alive[:, r2])
        if bool(intl_want.any()) and dctr_l:
            dctr = torch.cat(dctr_l, dim=1)  # [B, D] dest centre tiles
            dalv = torch.cat(dalv_l, dim=1)  # [B, D]
            D = dctr.shape[1]
            d_ip = self.pair_dist[centers.unsqueeze(2), dctr.unsqueeze(1)]  # [B, RC, D]
            rdst = self.seat_route_dest[:, row]  # [B, K]
            act2 = rr[:, :, 0] >= 0  # [B, K]
            # already-connected: an ACTIVE intl route from slot i to dest tile d
            exists_ip = (
                (rr[:, :, 0].reshape(B, 1, 1, -1) == ids.reshape(B, RC, 1, 1))
                & (rdst.reshape(B, 1, 1, -1) == dctr.reshape(B, 1, D, 1))
                & act2.reshape(B, 1, 1, -1)
            ).any(dim=3)  # [B, RC, D] (rdst is -1 for domestic/CS -> never == dctr>=0)
            valid_ip = (
                alive.unsqueeze(2)
                & dalv.unsqueeze(1)
                & self._explored_at(row, dctr).unsqueeze(1)  # isExplored gate
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
                dest_tile = dctr[rows, c_pick]
                slot = _free_slot(rows)
                self.seat_routes[rows, row, slot, 0] = ids[rows, i_pick]
                self.seat_routes[rows, row, slot, 1] = -1  # intl: dest carried in seat_route_dest
                self.seat_route_dest[rows, row, slot] = dest_tile
                self.seat_route_exp[rows, row, slot] = exp_val
                # the international route lays road too (dest_tile is already the
                # destination city's CENTRE tile).
                self._lay_trade_road(rows, centers[rows, i_pick], dest_tile)

        # after the pick, expire due routes; freed capacity re-picks NEXT turn.
        # This ALWAYS runs — TS applies the expiry filter OUTSIDE the
        # capacity-gated pick block, so an at-capacity seat still sheds its
        # expiring route, which is why the early returns above call it too.
        self._expire_seat_routes(row)

    def _expire_seat_routes(self, row: int) -> None:
        """Drop seat row `row`'s routes whose expiresTurn has arrived, plus any
        international route whose destination is no longer a live MAJOR city
        centre (the tradeRoutes filter twin — seat-0 centres via center_at, civ
        centres via civ_city_at). Consumers gate on active
        (seat_routes[..., 0] >= 0), so this is idempotent per turn.
        KNOWN CORNER vs TS: the dest is stored as a TILE, not (seat, city), so a
        dest CAPTURED by another major still reads as a live centre here while
        TS's (toSeat, toSeatCity) filter drops the route — closing it needs a
        route-store schema change."""
        act = self.seat_routes[:, row, :, 0] >= 0
        exp = self.seat_route_exp[:, row]
        expired = act & (exp >= 0) & (exp <= int(self.turn))
        rd = self.seat_route_dest[:, row]
        rdc = rd.clamp(min=0)
        dest_gone = act & (rd >= 0) & (self.center_at.gather(1, rdc) < 0) & (self.civ_city_at.gather(1, rdc) < 0)
        drop = expired | dest_gone  # [B, K]
        if bool(drop.any()):
            self.seat_routes[:, row][drop] = -1
            self.seat_route_dest[:, row][drop] = -1
            self.seat_route_exp[:, row][drop] = -1

    def _civ_pair_strengths(self) -> torch.Tensor:
        """[B, R] seatStrength = js_round(nCities*8 + Σ own-unit combat) for every
        civ seat (civilians carry combat 0). Feeds the DoW/peace arms; computed
        pre-phase, before this turn's spawns and combat."""
        B, dev = self.B, self.device
        n_c = self.civ_city_alive.sum(dim=2)  # [B, R]
        rstr = torch.zeros(B, self.R, dtype=torch.float64, device=dev)
        vt = self.major_unit_type.clamp(min=0, max=self.NU - 1)
        for r in range(self.R):
            combat = ((self.major_unit_alive & (self.major_unit_seat == r + 1)).long() * self._type_combat[vt]).sum(dim=1)
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
