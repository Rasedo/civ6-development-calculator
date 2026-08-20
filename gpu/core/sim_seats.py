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
        alive = self.city_alive[:, row]
        idle = alive & (self.city_current[:, row] == -1)
        # buildings / units: the row-generic legality bodies the APPLY asks too.
        # QUEUE legality wants the district merely PLACED (availableBuildings),
        # which is what these columns offer.
        bld_q = self._seat_buildable(row)  # [B, RC, NB]
        tr_city = self._trainable_units(row)  # [B, RC, NU]
        ones_b = torch.ones(B, dtype=torch.bool, device=dev)
        nW_m = self._wond_n if self.districts_on else 0
        nP_m = len(self._proj_rows) if self.districts_on else 0
        W = bld_q.shape[2] + 2 + tr_city.shape[2] + nS + nW_m + nP_m
        # EVERY column below is `& idle_j`, so a column no game can queue in
        # contributes an all-False row whatever the legality bodies answer —
        # and the district/wonder bodies are the two most expensive in a step.
        dead_col = torch.zeros(B, W, dtype=torch.bool, device=dev)
        # The unit-column overrides and the wonder unlock/built tests ask about
        # the SEAT, not the city: hoisted, they run once instead of RC times.
        ovr: list[tuple[int, torch.Tensor]] = []
        if self.improvements_on and self._builder_idx >= 0:
            has_alive = (self.major_unit_alive & (self.major_unit_seat == row) & (self.major_unit_type == self._builder_idx)).any(dim=1)
            has_q = ((self.city_current[:, row] == self.UNIT_BASE + self._builder_idx) & alive).any(dim=1)
            ovr.append((self._builder_idx, ~(has_alive | has_q) & self._seat_job_mask(row).any(dim=1)))
        if self._seat_eng_live and self._eng_idx >= 0:
            has_alive_e = (self.major_unit_alive & (self.major_unit_seat == row) & (self.major_unit_type == self._eng_idx)).any(dim=1)
            has_q_e = ((self.city_current[:, row] == self.UNIT_BASE + self._eng_idx) & alive).any(dim=1)
            ovr.append((self._eng_idx, ~(has_alive_e | has_q_e) & self._seat_fort_job_mask(row).any(dim=1)))
        if getattr(self, "_archaeologist_idx", -1) >= 0:
            # `_trainable_units` already asks for the museum's free slot; the
            # queue is what it cannot see, so refuse a second one in flight.
            has_alive_a = (self.major_unit_alive & (self.major_unit_seat == row)
                           & (self.major_unit_type == self._archaeologist_idx)).any(dim=1)
            has_q_a = ((self.city_current[:, row] == self.UNIT_BASE + self._archaeologist_idx) & alive).any(dim=1)
            ovr.append((self._archaeologist_idx, ~(has_alive_a | has_q_a)))
        if self._trader_idx >= 0:
            # `_trainable_units` already counts free Traders + active routes
            # against tradeCapacity; the queue is the one thing it cannot see,
            # so refuse while one is mid-production anywhere.
            has_q_t = ((self.city_current[:, row] == self.UNIT_BASE + self._trader_idx) & alive).any(dim=1)
            ovr.append((self._trader_idx, ~has_q_t))
        # A district's unlock and a wonder's unlock/already-built pair are per
        # SEAT too, so both tables are built once for the whole column sweep.
        d_tech = [
            (self.civ_techs[:, row, utech] if utech >= 0
             else (self.civ_civics[:, row, uciv] if uciv >= 0 else ones_b))
            for (_di, utech, uciv, _plc, _fc) in self._scaffold
        ] if (self.districts_on and self._scaffold) else []
        w_okc: list[torch.Tensor | None] = []
        for wi in range(nW_m):
            unl_w = self._wonder_unlock_ok(row, wi)
            okc_m = None if unl_w is None else unl_w & ~(self.built_wonder == wi).any(dim=1)
            w_okc.append(okc_m if okc_m is not None and bool(okc_m.any()) else None)
        prod_cols = []
        for j in range(self.RC):
            if not bool(idle[:, j].any()):
                prod_cols.append(dead_col)
                continue
            ok_b = bld_q[:, j]
            ok_s = (self.city_pop[:, row, j] >= self.rules.settler_pop_gate).unsqueeze(1)
            # units: `trainableUnits` for this row and city — the SAME body the
            # apply re-validates against — narrowed to the MILITARY lane; the
            # civilian columns come back one by one via the overrides above.
            # HULLS ride the same columns: `tr_j` already
            # carries the naval-capable-city gate, which is the only thing real
            # Civ 6 asks. Every override below re-applies tr_j, so no column can
            # smuggle an untrainable chassis past the legality body.
            tr_j = tr_city[:, j]  # [B, NU]
            ok_u = tr_j & (self._type_combat.unsqueeze(0) > 0)
            for _ui, _gate in ovr:
                ok_u[:, _ui] = tr_j[:, _ui] & _gate
            ok_d = torch.zeros(B, nS, dtype=torch.bool, device=dev)
            if self.districts_on and self._scaffold:
                cap_max = torch.div(self.city_pop[:, row, j] - 1, 3, rounding_mode="floor") + 1
                spec_cnt = ((self.city_dist_tile[:, row, j] >= 0) & self._is_specialty).sum(dim=1)
                site = self._district_elig_site(row, j)  # every type in this city shares it
                for si, (di, _ut, _uc, plc, _fc) in enumerate(self._scaffold):
                    not_owned = self._district_slot_free(row, j, di)
                    under_cap = (spec_cnt < cap_max) if bool(self._is_specialty[di]) else ones_b
                    can_place = self._district_elig(row, j, di, plc, base=site).any(dim=1)
                    ok_d[:, si] = d_tech[si] & not_owned & under_cap & can_place
            base_j = torch.cat([ok_b, ok_s, ones_b.unsqueeze(1), ok_u, ok_d], dim=1)
            ok_w = torch.zeros(B, max(nW_m, 0), dtype=torch.bool, device=dev)
            if nW_m > 0:
                base_okm = self._wonder_base_ok(row, j)
                for wi in range(nW_m):
                    okc_m = w_okc[wi]
                    if okc_m is None:
                        continue
                    ok_w[:, wi] = okc_m & self._wonder_cand(row, j, wi, base_okm).any(dim=1)
            # PROJECT columns [nP], the `availableProjects` predicate: the row's
            # district must be COMPLETE on this city; a SPACE row must also be
            # un-done, tech-unlocked, and preceded by its finished step; a
            # LASER row is repeatable and tech-gated only.
            ok_p = torch.zeros(B, max(nP_m, 0), dtype=torch.bool, device=dev)
            for pi_m, prow_m in enumerate(self._proj_rows if self.districts_on else []):
                d_im = int(prow_m.get("d", -1))
                if d_im < 0 or d_im >= self.city_dist_tile.shape[3]:
                    continue
                regp_m = self.city_dist_tile[:, row, j, d_im]
                okp_m = (regp_m >= 0) & self.district_complete.gather(1, regp_m.clamp(min=0).unsqueeze(1)).squeeze(1)
                if int(prow_m.get("sp", 0)):
                    okp_m = okp_m & self._space_step_ok(row, pi_m)
                elif int(prow_m.get("ls", 0)):
                    rt_m = int(prow_m.get("rt", -1))
                    if rt_m >= 0:
                        okp_m = okp_m & self.civ_techs[:, row, rt_m]
                ok_p[:, pi_m] = okp_m
            idle_j = idle[:, j].unsqueeze(1)
            prod_cols.append(torch.cat([base_j & idle_j, ok_w & idle_j, ok_p & idle_j], dim=1))
        return torch.stack(prod_cols, dim=1)

    def seat_masks(self, row: int) -> dict[str, torch.Tensor]:
        return {"production": self._seat_production_mask(row),
                "tech": self._seat_tech_mask(row),
                "civic": self._seat_civic_mask(row),
                "envoy": self._seat_envoy_mask(row),
                "war": self._seat_war_mask(row)}

    def apply_seat_actions(
        self,
        row: int,
        production: torch.Tensor | None = None,
        tech: torch.Tensor | None = None,
        civic: torch.Tensor | None = None,
        war: torch.Tensor | None = None,
        production_pref: torch.Tensor | None = None,
        production_tile: torch.Tensor | None = None,
        envoys: torch.Tensor | None = None,
        buy: tuple | None = None,  # (kind [B], a [B], b [B]) — the wire's GOLD purchase intent (kind 3: a=tile, b=slot)
        worship: torch.Tensor | None = None,  # kind 4: rc slot to faith-buy the worship building in (-1 = none)
        relig: tuple | None = None,  # kinds 5/6: (kind [B], slot [B]) — the religious-unit faith buy
        levy: torch.Tensor | None = None,  # kind 7: CS index to levy (-1 = none)
        monu: tuple | None = None,  # kinds 8/9: (kind [B], slot [B]) — the Monumentality faith-civilian buy (8 builder, 9 settler)
        nat: tuple | None = None,   # kind 10: (kind [B], slot [B]) — the NATURALIST, bought with faith alone
        route: tuple | None = None,  # the route verb: (origin CENTRE [B], dest code [B]) — a CENTRE tile or -(2+csIndex); -1 = none
        spec: torch.Tensor | None = None,  # [B, RC, nD] citizens PINNED per district; -1 = automatic, SPEC_KEEP = unchanged
        lock: torch.Tensor | None = None,  # [B, L] plots whose citizen pin this seat FLIPS this turn; -1 = padding
        vote: torch.Tensor | None = None,  # [B, 3, 3] the congress ballot: [outcome, target, extra votes] per slate slot
    ) -> None:
        """Write seat ROW `row`'s choices BEFORE step(). Codes use the
        seat_masks layout; -1 = no action. Queue writes mirror the picker's exact
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
        columns already ARE a preference order.

        `production_tile` [B, RC, nS] is the TILE each city would put each
        district column on — the placement choice, which is the policy's too. A
        district column whose tile is -1 (or absent) is REFUSED: this function
        re-validates a plot, it never picks one. `policy/ladder.py`'s
        `pick_district_tile` is the body that chooses."""
        self._stash_record(row, tech=tech, civic=civic, envoys=envoys, war=war,
                           production=production, pref=production_pref, dtile=production_tile)
        self._stash_buy(row, buy=buy, worship=worship, relig=relig, levy=levy, monu=monu, nat=nat)
        if route is not None:
            self._driven_route[row] = route
        if spec is not None or lock is not None:
            self._driven_citizens[row] = (spec, lock)
        if vote is not None:
            self._driven_vote[row] = vote

    def _reset_war_clock(self, i: int, j: int, mask: torch.Tensor) -> None:
        self.war_turns[:, i, j] = torch.where(mask, torch.zeros_like(self.war_turns[:, i, j]), self.war_turns[:, i, j])
        self.war_turns[:, j, i] = self.war_turns[:, i, j]

    def _stamp_treaty(self, i: int, j: int, mask: torch.Tensor) -> None:
        """Bind the pair to a PEACE TREATY — the makePeace twin. The term is
        one number for every pairing, majors and city-states alike."""
        term = torch.full_like(self.treaty_turns[:, i, j], self._treaty_turns)
        self.treaty_turns[:, i, j] = torch.where(mask, term, self.treaty_turns[:, i, j])
        self.treaty_turns[:, j, i] = self.treaty_turns[:, i, j]

    def _apply_war_minors(self, row: int, w: torch.Tensor, n_opp: int, n_tgt: int,
                          ext: torch.Tensor, mine: torch.Tensor) -> None:
        """The war head's MINOR half — `declareWarOnCityState` /
        `sueForPeaceWithCityState`. A minor is a seat of its own: the declare
        needs the meeting and a clear treaty, the peace needs the ten-turn
        clock and a suzerain who is not still fighting, and costs nothing."""
        min_turns = self.rules.seats.get("warMinTurns", 14)
        suz_war = self._cs_suzerain_at_war(row)
        for s in range(self.S):
            crow = self.n_majors + s
            live = mine & self.citystate_alive[:, s] & self.seat_citystate_met[:, row, s]
            at_war = self.war[:, row, crow]
            declare = (w == n_opp + s) & ext & live & ~at_war & (self.treaty_turns[:, row, crow] == 0)
            if bool(declare.any()):
                self.war[:, row, crow] |= declare
                self.war[:, crow, row] |= declare
                self._reset_war_clock(row, crow, declare)
                # CIV6: war cancels the routes with the new enemy; the Traders return.
                self._cancel_routes_cs(row, s, declare)
            peace = (
                (w == n_tgt + n_opp + s) & ext & self.war[:, row, crow]
                & (self.war_turns[:, row, crow] >= min_turns) & ~suz_war[:, s]
            )
            if bool(peace.any()):
                self.war[:, row, crow] &= ~peace
                self.war[:, crow, row] &= ~peace
                self._reset_war_clock(row, crow, peace)
                self._stamp_treaty(row, crow, peace)
                self._ww_peace(peace, row, crow)

    def _cancel_routes_cs(self, row: int, s: int, mask: torch.Tensor) -> None:
        """`cancelRoutes(state, seat, r => r.toCs === id)`'s twin — the routes
        this seat runs to one minor end, each handing its Trader back at the
        origin (a cancel is not a plunder — the unit survives)."""
        code = -(2 + s)
        kill = (self.seat_routes[:, row, :, 0] >= 0) & (self.seat_routes[:, row, :, 1] == code) & mask.unsqueeze(1)
        if not bool(kill.any()):
            return
        oc, _dc = self._route_centres(row)
        for k in range(self.seat_routes.shape[2]):
            m = kill[:, k] & (oc[:, k] >= 0)
            if bool(m.any()):
                self._spawn_unit(row, m, oc[:, k].clamp(min=0), self._trader_idx)
        for plane in (self.seat_route_dseat, self.seat_route_dcity, self.seat_route_exp,
                      self.seat_route_born, self.seat_route_walk, self.seat_route_leg):
            plane[:, row][kill] = -1
        self.seat_routes[:, row][kill] = -1

    def _apply_war_column(self, row: int, war: torch.Tensor) -> None:
        targets = self.war_targets(row)
        if not targets:
            return
        n_opp = self.n_majors - 1
        n_tgt = len(targets)
        w = war.to(torch.long)
        sr = self.rules.seats
        ext = self.seat_ext[:, row]
        mine = self.civ_alive[:, row]
        if self.S > 0:
            self._apply_war_minors(row, w, n_opp, n_tgt, ext, mine)
        for k, tgt in enumerate(targets[:n_opp]):
            live = mine & self.civ_alive[:, tgt]
            at_war = self.war[:, row, tgt]
            declare = (w == k) & ext & live & ~at_war & ~self.seat_allied[:, row, tgt]                 & (self.treaty_turns[:, row, tgt] == 0)
            if bool(declare.any()):
                self.war[:, row, tgt] |= declare
                self.war[:, tgt, row] |= declare
                self._reset_war_clock(row, tgt, declare)
                # CIV6: war cancels every route between the two civs; the
                # Traders return.
                self._cancel_routes_pair(row, tgt, declare)
                self.civ_warmonger[:, row] = self.civ_warmonger[:, row] + declare.long() * self._wm_dow
                _dt = self.seat_denounced[:, row, tgt]
                _formal = declare & (_dt >= 0) & ((int(self.turn) - _dt) >= self._formal_war_min)
                self.seat_warkind[:, row, tgt] = torch.where(declare, _formal, self.seat_warkind[:, row, tgt])
                self.seat_warkind[:, tgt, row] = torch.where(declare, _formal, self.seat_warkind[:, tgt, row])
            wt = self.war_turns[:, row, tgt]
            pcost = sr.get("peaceGold0", 150) + sr.get("peaceGoldSlope", 10) * wt.to(torch.float64)
            peace = (
                (w == n_tgt + k) & ext & self.war[:, row, tgt]
                & (wt >= sr.get("warMinTurns", 14))
                & self._afford(self.civ_treasury[:, row], pcost)
            )
            if bool(peace.any()):
                self.civ_treasury[:, row] = torch.where(peace, self.civ_treasury[:, row] - pcost, self.civ_treasury[:, row])
                self.war[:, row, tgt] &= ~peace
                self.war[:, tgt, row] &= ~peace  # the MIRROR cell
                # the ended war's KIND clears; the grudge stamp is permanent
                self.seat_warkind[:, row, tgt] &= ~peace
                self.seat_warkind[:, tgt, row] &= ~peace
                self._ww_peace(peace, row, tgt)  # -2000 on the treaty (the makePeace twin)
                # both sides shed the city-states the other dragged in
                self._citystate_suzerain_release(row, tgt, peace)
                self._citystate_suzerain_release(tgt, row, peace)
                self._reset_war_clock(row, tgt, peace)
                self._stamp_treaty(row, tgt, peace)
                for _pr in (row, tgt):
                    self.peace_turns[:, _pr] = torch.where(peace, torch.zeros_like(self.peace_turns[:, _pr]), self.peace_turns[:, _pr])

    def _stash_record(self, row: int, tech=None, civic=None, envoys=None, war=None,
                      production=None, pref=None, dtile=None) -> None:
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
        if war is not None:
            self._driven_war[row] = war
        if production is not None or pref is not None:
            self._driven_picks[row] = (production, pref, dtile)

    def _seat_record_apply(self, row: int, active: torch.Tensor) -> None:
        """applySeatActionRecord for seat row `row` — ONE body every seat runs,
        at the TS record position (after the CS/quest block, before the gold
        ladder), in the TS arm order: tech, civic, envoys, war, production.

        `active` is the eliminated-actor `continue`: TS's `continue` precedes
        the record apply, so a cityless seat applies NOTHING — but the stash is
        drained either way, because an intent is for THIS turn and a refused one
        must not survive into the next.

        The WAR arm drains here and not at decide time: the walkers drain later
        in the phase, so a same-turn declaration still legalizes this turn's
        own unit orders — and the phase-top geo denounce has already landed, so
        the declare's alliance gate reads the post-denounce axis, as TS's does.

        Every arm re-validates against the LIVE state here; nothing chooses."""
        tech = self._driven_tech.pop(row, None)
        civic = self._driven_civic.pop(row, None)
        envoys = self._driven_envoys.pop(row, None)
        war = self._driven_war.pop(row, None)
        citizens = self._driven_citizens.pop(row, None)
        vote = self._driven_vote.pop(row, None)
        production, pref, dtile = self._driven_picks.pop(row, (None, None, None))
        if not bool(active.any()):
            return
        ext = self.seat_ext[:, row]
        if tech is not None:
            t_act = tech.to(torch.long)
            ok = active & ext & (t_act >= 0) \
                & self._available_mask(self.civ_techs[:, row], self._prereq_t).gather(1, t_act.clamp(min=0).unsqueeze(1)).squeeze(1)
            self._select_research(row, t_act, ok)
        if civic is not None:
            c_act = civic.to(torch.long)
            ok = active & ext & (c_act >= 0) \
                & self._available_mask(self.civ_civics[:, row], self._prereq_c).gather(1, c_act.clamp(min=0).unsqueeze(1)).squeeze(1)
            self._select_research(row, c_act, ok, is_civic=True)
        if envoys is not None and self.S > 0:
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
        if war is not None:
            w_act = war.to(torch.long)
            self._apply_war_column(row, torch.where(active, w_act, torch.full_like(w_act, -1)))
        if citizens is not None:
            self._apply_citizens(row, active, *citizens)
        if vote is not None:
            # BANKED, not spent: the session runs at the turn tail, after every
            # seat has had its phase.
            take = (active & ext).view(-1, 1, 1)
            self.civ_congress_vote[:, row] = torch.where(take, vote.to(torch.long), self.civ_congress_vote[:, row])
        if pref is not None:
            self._apply_seat_pref(row, pref, dtile)
        elif production is not None:
            self._apply_seat_production(row, production, dtile)

    def _apply_citizens(self, row: int, active: torch.Tensor, spec, lock) -> None:
        """The CITIZEN-ASSIGNMENT arm of the record. `spec` pins a count into
        each district's specialist slots (-1 hands one back to the automatic
        rule, SPEC_KEEP leaves it as it was); `lock` flips a plot's own pin.
        Both re-validate here — a pin needs a living city, a flip needs the
        plot to be this seat's ground."""
        ext = self.seat_ext[:, row]
        act = active & ext
        if spec is not None:
            v = spec.to(torch.long)
            take = (v > simbase.SPEC_KEEP) & self.city_alive[:, row].unsqueeze(2) & act.view(-1, 1, 1)
            if bool(take.any()):
                # every negative count means the same thing — hand the slot
                # back to the automatic rule — so they store as one value.
                self.city_spec_pin[:, row] = torch.where(take, v.clamp(min=-1), self.city_spec_pin[:, row])
                self._eff_version += 1
        if lock is not None:
            lt = lock.to(torch.long)
            if lt.dim() == 1:
                lt = lt.unsqueeze(1)
            for k in range(int(lt.shape[1])):
                t = lt[:, k]
                tc = t.clamp(min=0)
                ok = act & (t >= 0) & (self.tile_seat.gather(1, tc.unsqueeze(1)).squeeze(1) == row)
                if bool(ok.any()):
                    rows = ok.nonzero(as_tuple=True)[0]
                    self.tile_locked[rows, tc[rows]] = ~self.tile_locked[rows, tc[rows]]
                    self._eff_version += 1

    def _stash_buy(self, row: int, buy=None, worship=None, relig=None, levy=None, monu=None, nat=None) -> None:
        if buy is not None:
            self._driven_buy[row] = buy
        if worship is not None:
            self._driven_buy_worship[row] = worship
        if relig is not None:
            self._driven_buy_relig[row] = relig
        if levy is not None:
            self._driven_levy[row] = levy
        if monu is not None:
            self._driven_buy_monu[row] = monu
        if nat is not None:
            self._driven_buy_nat[row] = nat

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

    def _building_dedications(self, row: int, bi: torch.Tensor, made: torch.Tensor) -> None:
        """`buildingDedications` — every dedication a COMPLETED BUILDING pays.

        CIV6: Heartbeat of Steam "+2 Era Score for each Industrial or later
        building constructed"; Free Inquiry "+1 Era Score ... when constructing
        a building which provides Science"; Pen, Brush and Voice "+1 Era Score
        ... when you construct a building with a Great Work slot"."""
        self._dedication_event(row, self._ded_steam, made & (self._b_era[bi] >= self._industrial_era))
        self._dedication_event(row, self._ded_free_inquiry, made & self._b_science[bi])
        self._dedication_event(row, self._ded_pen_brush, made & self._b_gwslot[bi])

    def _seat_buy_building(self, row: int, can6: torch.Tensor, jj6: torch.Tensor, bb6: torch.Tensor, price6: torch.Tensor) -> None:
        rows6 = can6.nonzero(as_tuple=True)[0]
        self.city_bldg[rows6, row, jj6[rows6], bb6[rows6]] = True
        self._building_dedications(row, bb6, can6)  # a purchased building is constructed too
        self._eff_version += 1
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
        # No hull on the GOLD rung: it spawns at the capital and asks no city
        # question, and `trainableUnits(state, seat)` with no city refuses every
        # naval chassis outright (`d.naval` returns `!!city && ...`).
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
            left = left & ~has
        return slot, tile, cost, ok

    def _seat_religious_city_ok(self, row: int) -> torch.Tensor:
        if self._shrine_bidx < 0 or self._hs_idx < 0:
            return torch.zeros(self.B, self.RC, dtype=torch.bool, device=self.device)
        hs = self.city_dist_tile[:, row, :, self._hs_idx]
        hs_ok = (hs >= 0) & self.district_complete.gather(1, hs.clamp(min=0)) & ~self.district_pillaged.gather(1, hs.clamp(min=0))
        return self.city_alive[:, row] & self.city_bldg[:, row, :, self._shrine_bidx] & hs_ok

    def _seat_faith_buy_candidates(self, row: int, active: torch.Tensor):
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
            w_ok = founded & self._afford(self.civ_faith[:, row], self._worship_cost) & elig_w.any(dim=1) & ~self._congress_holy_blocked()
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

    def _seat_naturalist_candidate(self, row: int, active: torch.Tensor):
        """Buy-kind 10: the NATURALIST. CIV6 sells it for FAITH ONLY, in any
        city, behind the CONSERVATION civic — no Holy Site and no dedication,
        so this candidate asks only for the civic, a city to spawn beside, and
        the faith. ONE live Naturalist at a time is the LADDER's cap, matching
        the driver's tripwire. Returns (ok [B], slot [B])."""
        B, dev = self.B, self.device
        ok = torch.zeros(B, dtype=torch.bool, device=dev)
        slot = torch.full((B,), -1, dtype=torch.long, device=dev)
        if getattr(self, "_naturalist_idx", -1) < 0:
            return ok, slot
        civ_i = int(self._type_civic[self._naturalist_idx])
        if civ_i < 0:
            return ok, slot
        alive = self.city_alive[:, row]
        is_cap = self.city_is_cap[:, row]
        spawn = torch.where(is_cap.any(dim=1), is_cap.long().argmax(dim=1), alive.long().argmax(dim=1))
        live = (self.major_unit_alive & (self.major_unit_seat == row)
                & (self.major_unit_type == self._naturalist_idx)).sum(dim=1)
        cost = torch.full((B,), float(self._type_cost[self._naturalist_idx]), dtype=torch.float64, device=dev)
        ok = (
            active
            & alive.any(dim=1)
            & self.civ_civics[:, row, civ_i]
            & (live < 1)
            & self._afford(self.civ_faith[:, row], cost)
        )
        slot = torch.where(ok, spawn, slot)
        return ok, slot

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

    def _seat_buy_ladder(self, row: int, active: torch.Tensor, army0: torch.Tensor) -> None:
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
            # CIV6 (GS Civilopedia, Monumentality, Golden face): "Builders and
            # Settlers are 30% cheaper to purchase with Faith and Gold."
            # Literal 0.7 applied LAST, like the TS twin (1.0 - 0.3 != 0.7 in f64).
            sett_price = self._seat_settler_cost(row) * mult
            mon = self._golden_ded(row, self._ded_monumentality)
            sett_price = torch.where(mon, sett_price * 0.7, sett_price)
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
        if kind is not None:
            want_u = active & ext & ~bought & (kind == 2) & (army0 < 2 * n_cities)
            if bool(want_u.any()):
                cand_u = self._seat_buy_unit_candidates(row, self._seat_trainable_units(row))
                elig_u = want_u & cand_u.any(dim=1)
                if bool(elig_u.any()):
                    key_u = self._type_combat.double().unsqueeze(0) * self.NU - torch.arange(self.NU, device=dev, dtype=torch.float64).unsqueeze(0)
                    key_u = torch.where(cand_u, key_u.expand(B, -1), torch.full((B, self.NU), -1e18, dtype=torch.float64, device=dev))
                    pick_ty = key_u.argmax(dim=1)
                    ctr_u = self.city_center[bidx, row, spawn_slot].clamp(min=0)
                    xp_u = (self.city_bldg[bidx, row, spawn_slot].long() * self._b_train_xp.reshape(1, -1)).max(dim=1).values
                    landed_u = self._spawn_unit(row, elig_u, ctr_u, pick_ty, init_xp=xp_u)
                    price_u = self._type_cost.gather(0, pick_ty).double() * mult
                    self.civ_treasury[:, row] = torch.where(landed_u, self.civ_treasury[:, row] - price_u, self.civ_treasury[:, row])
                    bought = bought | landed_u
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
                    self._eff_version += 1
                    self.civ_faith[:, row] = torch.where(buy_w, self.civ_faith[:, row] - self._worship_cost, self.civ_faith[:, row])
        rel_kind, rel_j = self._driven_buy_relig.pop(row) if row in self._driven_buy_relig else (None, None)
        if rel_kind is not None and rel_j is not None:
            rel_city = self._seat_religious_city_ok(row)
            jr = rel_j.clamp(min=0, max=self.RC - 1)
            at_r = self.city_center[bidx, row, jr].clamp(min=0)
            base_r = active & ext & (rel_j >= 0) & self.civ_religion_done[:, row] & rel_city[bidx, jr]
            bought_relig = torch.zeros(B, dtype=torch.bool, device=dev)
            # CIV6 (GS Civilopedia, Exodus of the Evangelists, Golden face):
            # "newly trained ones get +2 Charges" — Missionaries and Apostles.
            exo_chg = self._golden_ded_table(self._ded_exodus)[:, row].long() * 2
            if self._missionary_idx >= 0:
                n_live_m = (self.major_unit_alive & (self.major_unit_seat == row) & (self.major_unit_type == self._missionary_idx)).sum(dim=1)
                mcost = self._enh["mcost"][self.civ_enhancer[:, row] + 1]
                buy_m = base_r & (rel_kind == 5) & (n_live_m < self._missionary_cap) & self._afford(self.civ_faith[:, row], mcost)
                if bool(buy_m.any()):
                    chg_m = self._type_charges[self._missionary_idx] + self._enh["mchg"][self.civ_enhancer[:, row] + 1] + exo_chg
                    landed_m = self._spawn_unit(row, buy_m, at_r, self._missionary_idx, charges=chg_m)
                    self.civ_faith[:, row] = torch.where(landed_m, self.civ_faith[:, row] - mcost, self.civ_faith[:, row])
                    bought_relig = bought_relig | landed_m
            if self._apostle_idx >= 0:
                n_live_a = (self.major_unit_alive & (self.major_unit_seat == row) & (self.major_unit_type == self._apostle_idx)).sum(dim=1)
                acost = torch.full((B,), float(round(self._apostle_cost)), dtype=torch.float64, device=dev)
                buy_a = base_r & (rel_kind == 6) & ~bought_relig & (n_live_a < self._apostle_cap) \
                    & self._afford(self.civ_faith[:, row], acost)
                if bool(buy_a.any()):
                    landed_a = self._spawn_unit(row, buy_a, at_r, self._apostle_idx, charges=self._type_charges[self._apostle_idx].expand(B) + exo_chg)
                    self.civ_faith[:, row] = torch.where(landed_a, self.civ_faith[:, row] - acost, self.civ_faith[:, row])
        m_kind, m_j = self._driven_buy_monu.pop(row) if row in self._driven_buy_monu else (None, None)
        if m_kind is not None and m_j is not None:
            # CIV6 (GS Civilopedia, Monumentality, Golden face): "May purchase
            # civilian units with Faith. Builders and Settlers are 30% cheaper
            # to purchase with Faith and Gold." Literal 0.7 LAST, the TS twin's
            # association (1.0 - 0.3 != 0.7 in f64).
            mon_g = self._golden_ded(row, self._ded_monumentality)
            jm = m_j.clamp(min=0, max=self.RC - 1)
            at_m = self.city_center[bidx, row, jm].clamp(min=0)
            base_m = active & ext & (m_j >= 0) & mon_g & self.city_alive[bidx, row, jm]
            if self._builder_idx >= 0:
                bl_price = self._builder_cost(self.civ_builders_trained[:, row]).double() * self.rules.faith_purchase_mult * 0.7
                buy_bl = base_m & (m_kind == 8) & self._afford(self.civ_faith[:, row], bl_price)
                if bool(buy_bl.any()):
                    landed_bl = self._spawn_unit(row, buy_bl, at_m, self._builder_idx)
                    self.civ_faith[:, row] = torch.where(landed_bl, self.civ_faith[:, row] - bl_price, self.civ_faith[:, row])
                    # a purchased builder escalates builderCost like a trained one
                    self.civ_builders_trained[:, row] = self.civ_builders_trained[:, row] + landed_bl.long()
            if self._settler_idx >= 0:
                s_price = self._seat_settler_cost(row) * self.rules.faith_purchase_mult * 0.7
                pop_m = self.city_pop[bidx, row, jm]
                buy_sl = base_m & (m_kind == 9) & (pop_m >= self.rules.settler_pop_gate) & self._afford(self.civ_faith[:, row], s_price)
                if bool(buy_sl.any()):
                    landed_sl = self._spawn_unit(row, buy_sl, at_m, self._settler_idx)
                    self.civ_faith[:, row] = torch.where(landed_sl, self.civ_faith[:, row] - s_price, self.civ_faith[:, row])
                    _pop_m = self.city_pop[bidx, row, jm]
                    self.city_pop[bidx, row, jm] = torch.where(landed_sl, (_pop_m - 1).clamp(min=1), _pop_m)
        n_kind, n_j = self._driven_buy_nat.pop(row) if row in self._driven_buy_nat else (None, None)
        if n_kind is not None and n_j is not None and getattr(self, "_naturalist_idx", -1) >= 0:
            # CIV6: the Naturalist "can only be purchased with Faith in any
            # city" — its own cost IS the faith price, like the religious
            # units', with no Holy Site and no dedication in the way.
            civ_i = int(self._type_civic[self._naturalist_idx])
            jn = n_j.clamp(min=0, max=self.RC - 1)
            at_n = self.city_center[bidx, row, jn].clamp(min=0)
            n_price = torch.full((B,), float(self._type_cost[self._naturalist_idx]), dtype=torch.float64, device=dev)
            base_n = active & ext & (n_j >= 0) & (n_kind == 10) & self.city_alive[bidx, row, jn]
            if civ_i >= 0:
                base_n = base_n & self.civ_civics[:, row, civ_i]
            buy_n = base_n & self._afford(self.civ_faith[:, row], n_price)
            if bool(buy_n.any()):
                landed_n = self._spawn_unit(row, buy_n, at_n, self._naturalist_idx)
                self.civ_faith[:, row] = torch.where(landed_n, self.civ_faith[:, row] - n_price, self.civ_faith[:, row])
        if kind is not None:
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
                        self._spawn_unit(row, do_l, at_l, ltype_t)
                    self.civ_treasury[:, row] = torch.where(do_l, self.civ_treasury[:, row] - levy_cost, self.civ_treasury[:, row])
                    rows_l = do_l.nonzero(as_tuple=True)[0]
                    self.citystate_last_levy[rows_l, sl[rows_l]] = self.turn

    def _apply_seat_pref(self, row: int, pref: torch.Tensor, dtile: torch.Tensor | None = None,
                         max_tries: int = 8) -> None:
        if pref.dim() != 3:
            raise AssertionError(f"production_pref must be [B, RC, W], got {tuple(pref.shape)}")
        RCj = min(int(pref.shape[1]), self.RC)
        order = pref.argsort(dim=2, descending=True)
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
            self._apply_seat_production(row, code, dtile)

    def _apply_seat_production(self, row: int, production: torch.Tensor,
                               dtile: torch.Tensor | None = None) -> None:
        """THE production apply for seat row `row`: one pass over that seat's
        cities in SLOT order, each taking the code it was given.

        `dtile` [B, RC, nS] is the record's district TILE per city per district
        column; without it no district column can land, because choosing a plot
        is the policy's job and this body only re-validates one.

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
        queued_s = (alive_row & (cur_row == self.SETTLER)).sum(dim=1)
        settlers_live = self._seat_settlers(row)
        nW_a = self._wond_n if self.districts_on else 0
        nP_a = len(self._proj_rows) if self.districts_on else 0
        if dtile is not None and (dtile.dim() != 3 or int(dtile.shape[2]) != nS):
            raise AssertionError(f"production_tile must be [B, RC, {nS}], got {tuple(dtile.shape)}")
        for j in range(min(int(production.shape[1]), self.RC)):
            a = production[:, j].to(torch.long)
            alive_j = self.city_alive[:, row, j]
            cur_j = self.city_current[:, row, j]
            act = (a >= 0) & ext & alive_j & (cur_j == -1)
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
            is_s = act & (a == self.SETTLER) & (self.city_pop[:, row, j] >= rls.settler_pop_gate)
            if bool(is_s.any()):
                s_cost = self._settler_cost(n_cities, settlers_live, queued_s)
                self.city_current[:, row, j] = torch.where(is_s, torch.full_like(cur_j, self.SETTLER), self.city_current[:, row, j])
                self.city_cost[:, row, j] = torch.where(is_s, s_cost, self.city_cost[:, row, j])
                self.city_progress[:, row, j] = torch.where(is_s, torch.zeros_like(self.city_progress[:, row, j]), self.city_progress[:, row, j])
                queued_s = queued_s + is_s.long()
            is_u = act & (a >= self.UNIT_BASE) & (a < self.UNIT_BASE + self.NU)
            if bool(is_u.any()):
                ui = (a - self.UNIT_BASE).clamp(min=0, max=self.NU - 1)
                is_u = is_u & self._trainable_units(row)[:, j].gather(1, ui.unsqueeze(1)).squeeze(1)
                cost_q = self._type_cost.gather(0, ui).double()
                if self._builder_idx >= 0:
                    cost_q = torch.where(ui == self._builder_idx,
                                         self._builder_cost(self.civ_builders_trained[:, row]).double(), cost_q)
                # the TRADER prices off ITS escalator (game progress)
                cost_q = torch.where(ui == self._trader_idx, self._trader_cost(row).double(), cost_q)
                self.city_current[:, row, j] = torch.where(is_u, a, self.city_current[:, row, j])
                self.city_cost[:, row, j] = torch.where(is_u, cost_q, self.city_cost[:, row, j])
                self.city_progress[:, row, j] = torch.where(is_u, torch.zeros_like(self.city_progress[:, row, j]), self.city_progress[:, row, j])
            is_d = act & (a >= self.DISTRICT_BASE) & (a < self.DISTRICT_BASE + nS)
            if bool(is_d.any()) and self.districts_on and self._scaffold \
                    and dtile is not None and j < int(dtile.shape[1]):
                dcp = rls.district_cost
                t_pct = self.civ_techs[:, row].sum(dim=1).double() / float(rdv.t_cost.shape[0])
                c_pct = self.civ_civics[:, row].sum(dim=1).double() / float(rdv.c_cost.shape[0])
                d_cost = torch.floor(dcp.get("base", 32) * (1 + dcp.get("scale", 9) * torch.maximum(t_pct, c_pct))).to(self.dtype)
                reg_j = self.city_dist_tile[:, row, j]  # [B, nD] THIS city's registry — the list TS counts
                spec_cnt = ((reg_j >= 0) & self._is_specialty.reshape(1, -1)).sum(dim=1)
                cap_j = torch.div(self.city_pop[:, row, j] - 1, 3, rounding_mode="floor") + 1
                for si, (di, utech, uciv, plc, fc) in enumerate(self._scaffold):
                    want_d = is_d & (a == self.DISTRICT_BASE + si)
                    if not bool(want_d.any()):
                        continue
                    has_tech = (self.civ_techs[:, row, utech] if utech >= 0
                                else (self.civ_civics[:, row, uciv] if uciv >= 0
                                      else torch.ones(self.B, dtype=torch.bool, device=self.device)))
                    spec_si = bool(self._is_specialty[di])
                    under_cap = (spec_cnt < cap_j) if spec_si else torch.ones_like(want_d)
                    want_d = want_d & has_tech & self._district_slot_free(row, j, di) & under_cap
                    if not bool(want_d.any()):
                        continue
                    if fc >= 0:
                        # A FLAT-priced district (the Spaceport): no research
                        # scaling, no under-represented discount.
                        d_cost_si = torch.full_like(d_cost, float(fc))
                    else:
                        disc = self._district_discounted(row, di)
                        d_cost_si = torch.where(disc, torch.floor(d_cost * 0.6), d_cost)
                    placed = self._place_district(row, j, di, want_d, plc, dtile[:, j, si])
                    if bool(placed.any()):
                        self.city_current[:, row, j] = torch.where(placed, torch.full_like(cur_j, self.DISTRICT_BASE + si), self.city_current[:, row, j])
                        self.city_cost[:, row, j] = torch.where(placed, d_cost_si, self.city_cost[:, row, j])
                        self.city_progress[:, row, j] = torch.where(placed, torch.zeros_like(self.city_progress[:, row, j]), self.city_progress[:, row, j])
                        if spec_si:
                            spec_cnt = spec_cnt + placed.long()
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
                    d_ia = int(prow_a.get("d", -1))
                    if d_ia < 0 or d_ia >= self.city_dist_tile.shape[3]:
                        continue
                    regp_a = self.city_dist_tile[:, row, j, d_ia]
                    has_pa = (regp_a >= 0) & self.district_complete.gather(1, regp_a.clamp(min=0).unsqueeze(1)).squeeze(1)
                    # RE-VALIDATE the chain at apply, not just at mask: a record
                    # is replayed a phase after the mask that justified it, and
                    # the step in front of it may have completed since.
                    if int(prow_a.get("sp", 0)):
                        has_pa = has_pa & self._space_step_ok(row, pi_a)
                    elif int(prow_a.get("ls", 0)):
                        rt_a = int(prow_a.get("rt", -1))
                        if rt_a >= 0:
                            has_pa = has_pa & self.civ_techs[:, row, rt_a]
                    rows_p = is_p & (a == pcode) & has_pa
                    if not bool(rows_p.any()):
                        continue
                    # Space steps and laser stations carry their REAL fixed
                    # price (`pc`); everything else takes the generic curve.
                    pc_fixed = int(prow_a.get("pc", -1))
                    price_a = torch.full_like(pc_a, float(pc_fixed)) if pc_fixed >= 0 else pc_a
                    self.city_current[:, row, j] = torch.where(rows_p, torch.full_like(cur_j, self.PROJECT_BASE + pi_a), self.city_current[:, row, j])
                    self.city_cost[:, row, j] = torch.where(rows_p, price_a, self.city_cost[:, row, j])
                    self.city_progress[:, row, j] = torch.where(rows_p, torch.zeros_like(self.city_progress[:, row, j]), self.city_progress[:, row, j])

    def _select_research(self, row: int, want: torch.Tensor, ok: torch.Tensor, is_civic: bool = False) -> None:
        """The `selectResearch` twin: switch item, keeping the old one's science.

        `ok` is the per-batch legality already computed by the caller; where it
        is False nothing moves. Where it is True and the pick DIFFERS from what
        the seat is researching, the progress pool is parked under the outgoing
        item and the incoming item's parked value replaces it. With NOTHING
        current the pool is a completion's unowned overflow and the pick adds
        it to the loaded value — CIV6 carries overflow into the next research.
        A re-statement of the current pick is a no-op, so a record that repeats
        itself cannot round-trip the pool through the map and lose it to a
        rounding step.
        """
        cur = self.civ_cur_civic[:, row] if is_civic else self.civ_cur_tech[:, row]
        pool = self.civ_civic_prog[:, row] if is_civic else self.civ_tech_prog[:, row]
        park = self.civ_civic_retain[:, row] if is_civic else self.civ_tech_retain[:, row]
        move = ok & (want != cur)
        if not bool(move.any()):
            return
        had = move & (cur >= 0)
        # park the outgoing item's pool
        park.scatter_(1, cur.clamp(min=0).unsqueeze(1), torch.where(had, pool, park.gather(1, cur.clamp(min=0).unsqueeze(1)).squeeze(1)).unsqueeze(1))
        # load the incoming item's parked value, and empty its slot
        want_c = want.clamp(min=0).unsqueeze(1)
        loaded = park.gather(1, want_c).squeeze(1)
        park.scatter_(1, want_c, torch.where(move, torch.zeros_like(loaded), loaded).unsqueeze(1))
        keep = torch.where(had, torch.zeros_like(pool), pool)
        new_pool = torch.where(move, loaded + keep, pool)
        new_cur = torch.where(move, want.clamp(min=0), cur)
        if is_civic:
            self.civ_civic_prog[:, row] = new_pool
            self.civ_cur_civic[:, row] = new_cur
        else:
            self.civ_tech_prog[:, row] = new_pool
            self.civ_cur_tech[:, row] = new_cur

    def _space_step_ok(self, row: int, pi: int) -> torch.Tensor:
        """[B] — may this seat START space-race step `pi` right now?

        The `availableProjects` space arm, term for term: not already in the
        seat's ledger (these are ONE-TIME), its `requiresTech` researched, and
        its `requiresProject` already in the ledger. `rp` indexes the whole
        projects table, so it maps through the same chain-step table the
        completion write uses — the ledger is keyed by STEP, not by row.
        """
        ok = ~self.space_done[:, row, self._space_step[pi]]
        prow = self._proj_rows[pi]
        rt = int(prow.get("rt", -1))
        if rt >= 0:
            ok = ok & self.civ_techs[:, row, rt]
        rp = int(prow.get("rp", -1))
        if rp >= 0:
            ok = ok & self.space_done[:, row, self._space_step[rp]]
        return ok

    def _seat_job_mask(self, row: int) -> torch.Tensor:
        return self._job_mask_core(self.civ_techs[:, row], self.civ_civics[:, row], self.tile_seat == row)

    def _job_mask_core(self, tk: torch.Tensor, cv: torch.Tensor, owned: torch.Tensor) -> torch.Tensor:
        farm = self.farm_flat | (self.farm_hill & cv[:, self._hillfarms_civic].unsqueeze(1)) if self._hillfarms_civic >= 0 else self.farm_flat
        ok = farm
        if self.MINE >= 0 and self._mine_unlock_tech >= 0:
            ok = ok | (self.mine_ok & tk[:, self._mine_unlock_tech].unsqueeze(1))
        if self.LUMBER >= 0 and self._lumber_unlock_tech >= 0:
            ok = ok | (self.lumber_ok & tk[:, self._lumber_unlock_tech].unsqueeze(1))
        if self.SEASIDE >= 0 and self._seaside_unlock_tech >= 0:
            ok = ok | (self._seaside_ok() & tk[:, self._seaside_unlock_tech].unsqueeze(1))
        new_res = self.res_imp >= 3
        if bool(new_res.any()):
            unlocked = tk.gather(1, self._imp_unlock[self.res_imp.clamp(min=0)].clamp(min=0))
            ok = ok | (new_res & unlocked)
        return (
            owned
            & (self.improvement < 0)
            & (self.district < 0)
            & (self.built_wonder < 0)  # an in-flight wonder pave refuses jobs (validImprovementsIn twin)
            # A city CENTRE is a CITY_CENTER district TS-side, refused by
            # validImprovementsIn like any pave, but it lives in the centre
            # registry rather than `district` — so a mid-game city founded on
            # statically-farmable ground stops reading farm_flat=True forever.
            & (self.centre_slot_at < 0)
            & ok
        ) | (owned & self.pillaged) | (owned & self.district_pillaged)

    def _seat_fort_job_mask(self, row: int, techs: torch.Tensor | None = None) -> torch.Tensor:
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
            & ~self.nwonder
            & (self.improvement < 0)
            & (self.district < 0)
            & (self.built_wonder < 0)
            # a city CENTRE is a CITY_CENTER pave that lives in the centre
            # registry rather than `district` — the same term _job_mask_core
            # carries.
            & (self.centre_slot_at < 0)
        )
        if not bool(base.any()):
            return base
        host = torch.zeros(B, self.T, dtype=torch.bool, device=dev)
        for other in range(self.n_majors):
            if other == row:
                continue
            host = host | ((self.tile_seat == other) & self.war[:, row, other].unsqueeze(1))
        nb = self.neigh.clamp(min=0)
        adj = (host[:, nb] & (self.neigh >= 0).unsqueeze(0)).any(dim=2)
        return base & adj

    def _martyr_draw(self, rows: torch.Tensor, seats: torch.Tensor) -> torch.Tensor:
        """One MARTYR draw per fallen apostle, for the games in `rows` — the
        `martyrs()` twin. Returns the [n] keep mask aligned with `rows`; the
        stream advances in exactly those games, which is where TS's own draw
        lands. CIV6 (Mont St. Michel): its owner's Apostles all carry MARTYR,
        and the draw still runs so the stream is the same length either way."""
        m = torch.zeros(self.B, dtype=torch.bool, device=self.device)
        m[rows] = True
        drew = self._next_random(m)[rows] < self._martyr_chance
        if self._wond_n and bool(self._wond_martyr.any()):
            certain = torch.stack([self._seat_wonder_any(r, self._wond_martyr)
                                   for r in range(self.n_majors)], dim=1)  # [B, n_majors]
            drew = drew | certain[rows, seats.clamp(min=0, max=self.n_majors - 1)]
        return drew

    def _theological_combat_phase(self) -> None:
        """THEOLOGICAL COMBAT — ONE pass, every seat, at one schedule position.

        The `theologicalCombatPhase` twin. Only an APOSTLE initiates, and only
        against an ADJACENT religious unit of a DIFFERENT religion (religion id
        == the founding seat, so the test is a seat compare). Both sides roll
        `_damage_roll` on the wounded religious-strength difference; a unit at 0
        HP dies; the loser's religion sheds theoPressureSwing in every city
        within theoPressureRange of the fallen unit while the winner's gains it.
        Two damage draws per fight, ahead of the MARTYR roll taken per fallen
        apostle at the relic site.

        ORDER: slot order for the attacker walk AND the defender pick — the
        twin of TS's `state.units` array order. A dead attacker (killed earlier
        in this same pass, as somebody's defender) is skipped by `alive`.

        It is a PHASE, not a verb: the fight was never a choice. Inside a
        scripted walk it would run only for undriven seats and go inert the
        moment the wire took that seat's decisions. Here it belongs to no seat
        and inherits no replay-position fork.
        """
        if self._apostle_idx < 0 or not self.units_mode:
            return
        rs = self._rel_strength
        nrow = self.n_majors
        sw = int(self._theo_swing)
        # Only slots that hold a live APOSTLE somewhere in the batch can open a
        # fight, and nothing spawns one mid-pass — so this set is a superset of
        # the actors and the pool's other five hundred slots cost nothing. A
        # slot whose apostle DIES mid-pass still falls out on `att` below.
        _open = (self.major_unit_alive & (self.major_unit_type == self._apostle_idx)).any(dim=0)
        for u in _open.nonzero(as_tuple=True)[0].tolist():
            att = self.major_unit_alive[:, u] & (self.major_unit_type[:, u] == self._apostle_idx)
            if not bool(att.any()):
                continue
            a_seat = self.major_unit_seat[:, u]
            a_str = rs[self.major_unit_type[:, u].clamp(min=0)]
            d = self.pair_dist[self.major_unit_tile[:, u].clamp(min=0).unsqueeze(1),
                               self.major_unit_tile.clamp(min=0)]
            elig = (
                self.major_unit_alive & (d == 1)
                & (self.major_unit_seat != a_seat.unsqueeze(1))
                & (rs[self.major_unit_type.clamp(min=0)] > 0)
            ) & att.unsqueeze(1)
            if not bool(elig.any()):
                continue
            first = elig & (elig.long().cumsum(dim=1) == 1)  # lowest slot = TS array order
            rows = first.any(dim=1).nonzero(as_tuple=True)[0]
            if rows.numel() == 0:
                continue
            j = first.long().argmax(dim=1)
            _f = first.long()
            d_str = (rs[self.major_unit_type.clamp(min=0)] * _f).sum(dim=1)
            # The wounded religious strengths, then the two rolls in TS's draw
            # order: the defender's blow first, the attacker's second.
            a_eff = a_str - self._wound(self.major_unit_hp[:, u])
            d_eff = d_str - self._wound((self.major_unit_hp * _f).sum(dim=1))
            d_tile = (self.major_unit_tile * _f).sum(dim=1)
            hit = first.any(dim=1)
            to_def = self._damage_roll(hit, a_eff - d_eff, k="theo", tile=d_tile)
            to_atk = self._damage_roll(hit, d_eff - a_eff, k="theoc", tile=self.major_unit_tile[:, u])
            hp = self.major_unit_hp
            hp[rows, j[rows]] = hp[rows, j[rows]] - to_def[rows].to(hp.dtype)
            hp[rows, u] = hp[rows, u] - to_atk[rows].to(hp.dtype)
            self.major_unit_mp[rows, u] = 0  # the turn is spent (TS movesLeft = 0)
            def_dead = hp[rows, j[rows]] <= 0
            atk_dead = hp[rows, u] <= 0
            # PRESSURE SWING at the fallen unit's tile. When BOTH fall, TS's
            # ternary takes the defender-dead branch — attacker wins, defender
            # loses, and the swing centres on the DEFENDER's tile.
            any_dead = def_dead | atk_dead
            if bool(any_dead.any()):
                win = torch.where(def_dead, a_seat[rows], self.major_unit_seat[rows, j[rows]])
                los = torch.where(def_dead, self.major_unit_seat[rows, j[rows]], a_seat[rows])
                dead_tile = torch.where(def_dead, self.major_unit_tile[rows, j[rows]],
                                        self.major_unit_tile[rows, u])
                dr, dt = rows[any_dead], dead_tile[any_dead]
                wr, lr = win[any_dead], los[any_dead]
                n = dr.numel()
                ctr = self.city_center[dr][:, :nrow]
                near = (
                    self.pair_dist[ctr.clamp(min=0).reshape(n, -1), dt.unsqueeze(1)]
                    .reshape(n, nrow, self.RC) <= self._theo_range
                ) & self.city_alive[dr][:, :nrow]
                for k in range(n):
                    msk = torch.zeros_like(self.city_alive[dr[k]])
                    msk[:nrow] = near[k]
                    if not bool(msk.any()):
                        continue
                    self.city_pressure[dr[k], msk, wr[k]] += sw
                    _cur = self.city_pressure[dr[k], msk, lr[k]]
                    self.city_pressure[dr[k], msk, lr[k]] = (_cur - sw).clamp(min=0)
            # RELICS — a fallen APOSTLE martyrs only if it carried the MARTYR
            # promotion, which is DRAWN here (see MARTYR_CHANCE in
            # data/religion). Drawn and granted BEFORE the disbands and in TS's
            # order, defender then attacker, so both the RNG stream and the
            # relic's slot are order-exact. A dead MISSIONARY yields nothing;
            # the attacker is always an apostle.
            _dr = rows[def_dead]
            _dj = j[_dr]
            _dcand = _dr[self.major_unit_type[_dr, _dj] == self._apostle_idx]
            if _dcand.numel():
                _dseat = self.major_unit_seat[_dcand, j[_dcand]]
                _keep = self._martyr_draw(_dcand, _dseat)
                if bool(_keep.any()) and self._relic_bidx >= 0:
                    self._grant_relic(_dcand[_keep], _dseat[_keep])
            _ar = rows[atk_dead]
            if _ar.numel():
                _keep = self._martyr_draw(_ar, a_seat[_ar])
                if bool(_keep.any()) and self._relic_bidx >= 0:
                    self._grant_relic(_ar[_keep], a_seat[_ar][_keep])
            # A killed unit must also LEAVE ITS TILE: TS's `disbandUnit` drops
            # it from `state.units` entirely, so clearing `alive` alone would
            # leave the occupancy plane pointing at the corpse and block the
            # tile forever for every other seat's movers. NO dig site — the TS
            # twin calls raw `disbandUnit`, not `killUnit`.
            if bool(def_dead.any()):
                _dd = rows[def_dead]
                self.major_unit_alive[_dd, j[_dd]] = False
                self._vacate("major", _dd, j[_dd])
            if bool(atk_dead.any()):
                _ad = rows[atk_dead]
                self.major_unit_alive[_ad, u] = False
                self._vacate("major", _ad, torch.full_like(_ad, u))
        self._eff_version += 1

    def _vacate(self, pool: str, rows: torch.Tensor, slots: torch.Tensor) -> None:
        """Clear whichever occupancy plane points at these slots. A slot whose
        unit is gone must not keep holding its tile — religious units are
        civilians, but clearing both planes means a military defender can never
        leak either."""
        if rows.numel() == 0:
            return
        t = getattr(self, f"{pool}_unit_tile")[rows, slots]
        lo = self.POOL_LO[pool]
        civ = self.civilian_at[rows, t] == slots + lo
        if bool(civ.any()):
            self.civilian_at[(rows[civ], t[civ])] = -1
        mil = self.military_at[rows, t] == slots + lo
        if bool(mil.any()):
            self.military_at[(rows[mil], t[mil])] = -1

    def _relic_cap(self) -> torch.Tensor:
        """[B, n_majors, RC] long — each city's relic capacity: the relic
        building's slots plus every COMPLETE wonder it holds. The `placeRelic`
        capacity expression, computed for every major row at once (the wonder
        registry is majors-only, which is who can hold a wonder)."""
        cap = self.city_bldg[:, : self.n_majors, :, self._relic_bidx].long() * self._relic_slots
        if getattr(self, "_wond_relic", None) is None or int(self._wond_relic.sum()) == 0:
            return cap
        wreg = self.city_wonder  # [B, n_majors, RC, nW] tile index per wonder
        compw = (wreg >= 0) & self.built_wonder_complete.gather(
            1, wreg.clamp(min=0).reshape(self.B, -1)
        ).reshape_as(wreg)
        return cap + (compw.long() * self._wond_relic.reshape(1, 1, 1, -1)).sum(dim=3)

    def _grant_relic(self, rows: torch.Tensor, seat: torch.Tensor) -> None:
        """The `placeRelic` mirror: hand each row's seat ONE relic, placed in the
        LOWEST city with a free relic slot — city ARRAY order, which the dense
        city/rc slot order mirrors. A relic that finds no slot is LOST, as TS
        discards the return value the same way.

        `seat` [n] IS the row in the merged city block, so one walk places
        every seat's relic."""
        if rows.numel() == 0 or self._relic_bidx < 0:
            return
        row = seat.clamp(min=0, max=self.n_majors - 1)
        cap = self._relic_cap()
        placed = torch.zeros(rows.numel(), dtype=torch.bool, device=self.device)
        for j in range(self.RC):
            take = (
                ~placed
                & self.city_alive[rows, row, j]
                & (self.city_relics[rows, row, j] < cap[rows, row, j])
            )
            if bool(take.any()):
                self.city_relics[rows[take], row[take], j] += 1
                placed = placed | take
        # CIV6: a homeless Relic is HELD, not lost — `_drain_relic_reserve`
        # hands it out at the owner's next turn.
        if bool((~placed).any()):
            miss = ~placed
            self.civ_relic_reserve[rows[miss], row[miss]] += 1
        self._eff_version += 1

    def _drain_relic_reserve(self, row: int, active: torch.Tensor) -> None:
        """The `drainRelicReserve` mirror: hand held Relics to open slots,
        LOWEST city first, until the reserve or the capacity runs out. One
        prefix-sum allocation is the same fill a one-at-a-time loop makes."""
        held = self.civ_relic_reserve[:, row]
        run = active & (held > 0)
        if not bool(run.any()):
            return
        cap = self._relic_cap()[:, row]                       # [B, RC]
        used = self.city_relics[:, row]
        openc = (cap - used).clamp(min=0) * self.city_alive[:, row].long()
        want = torch.where(run, held, torch.zeros_like(held))
        prefix = openc.cumsum(dim=1) - openc
        alloc = (want.unsqueeze(1) - prefix).clamp(min=0).minimum(openc)
        if not bool((alloc != 0).any()):
            return
        self.city_relics[:, row] = used + alloc
        self.civ_relic_reserve[:, row] = held - alloc.sum(dim=1)
        self._eff_version += 1

    def _religious_victor(self) -> torch.Tensor:
        B, O, nrow = self.B, self.n_majors, self.n_majors
        # ONE walk over the majors — rows 0..n_majors-1 of the merged city block, seat 0
        # among them. `n` is each seat's city count; a seat holding none is
        # vacuously converted, which is what `cities.length === 0` gives TS.
        alive = self.city_alive[:, :nrow]                # [B, n_majors, RC]
        fol = self.city_followed[:, :nrow, : self.RC]    # [B, n_majors, RC]
        n = alive.sum(dim=2)                             # [B, n_majors]
        any_seat = (n > 0).any(dim=1)
        winner = torch.full((B,), -1, dtype=torch.long, device=self.device)
        for g in range(O):
            nf = (alive & (fol == g)).sum(dim=2)
            ok = (self.holy_tile[:, g] >= 0) & any_seat & ((n == 0) | (2 * nf > n)).all(dim=1)
            winner = torch.where((winner < 0) & ok, torch.full_like(winner, g), winner)
        return winner

    def _suzerain_mask(self, row: int) -> torch.Tensor:
        """[B, S] city-states seat row `row` is Suzerain of — the `isSuzerain`
        twin: >= suzerainEnvoys, alive, and STRICTLY more envoys than every
        other seat row (a tie leaves no suzerain)."""
        suz_min = int(self.rules.citystate.get("suzerainEnvoys", 3))
        env = self.seat_citystate_envoys
        mine = env[:, row]
        m = (mine >= suz_min) & self.citystate_alive
        for o in range(self.n_majors):
            if o != row:
                m = m & (mine > env[:, o])
        return m

    def _suzerain_count(self, row: int) -> torch.Tensor:
        return self._suzerain_mask(row).sum(dim=1)

    def _suz_effect_rows(self, code: int) -> torch.Tensor:
        """`suzerainEffect` for every major row at once — [B, n_majors] bool,
        true where the row holds a suzerain among the live minors whose perk
        is the RULE `code` (an index into the rules' suz-effects order, -1 =
        absent). Keyed (turn, _eff_version): every envoy write bumps
        _eff_version, so the cache IS the TS live read within a turn."""
        key = (self.turn, self._eff_version)
        if self._suz_rows_cache is None or self._suz_rows_cache[0] != key:
            self._suz_rows_cache = (key, {})
        codes = self._suz_rows_cache[1]
        if code not in codes:
            if code < 0 or self.S == 0:
                codes[code] = torch.zeros(self.B, self.n_majors, dtype=torch.bool, device=self.device)
            else:
                hold = self.citystate_suz_code[:, :self.S] == code
                codes[code] = torch.stack(
                    [(self._suzerain_mask(r) & hold).any(dim=1) for r in range(self.n_majors)], dim=1)
        return codes[code]

    def _suz_effect(self, row: int, code: int) -> torch.Tensor:
        """[B] — does seat row `row` hold a suzerain whose perk is `code`?"""
        return self._suz_effect_rows(code)[:, row]

    def _cav_hill_cs(self, seat: torch.Tensor, types: torch.Tensor, tiles: torch.Tensor) -> torch.Tensor:
        """`cavalryHillCS`'s twin, [B] long. CIV6 (Preslav's suzerain): "Your
        light and heavy cavalry units have +5 Strength when fighting on hill
        tiles." The tile is the unit's OWN — the ground it fights from,
        attacking or defending. Barbarians and empty (-1) seats score 0."""
        if self._suz_c_hill < 0 or self.S == 0:
            return torch.zeros_like(tiles)
        ok = (seat >= 0) & (seat < self.n_majors)
        s0 = torch.where(ok, seat, torch.zeros_like(seat))
        suz = self._suz_effect_rows(self._suz_c_hill).gather(1, s0.unsqueeze(1)).squeeze(1) & ok
        cav = self._type_cavalry[types.clamp(min=0, max=self.NU - 1)]
        hill = self.hills.gather(1, tiles.clamp(min=0).unsqueeze(1)).squeeze(1)
        return self._suz_hill_cs * (suz & cav & hill).long()

    def _suz_xp_mult(self, seat: torch.Tensor) -> torch.Tensor:
        """`gainAttackXp`'s multiplier, [B] long. CIV6 (Kabul's suzerain):
        "Your units receive double experience from battles they initiate."
        Defense XP never multiplies, and a barbarian holds no suzerain."""
        if self._suz_c_xp < 0 or self.S == 0:
            return torch.ones_like(seat)
        ok = (seat >= 0) & (seat < self.n_majors)
        s0 = torch.where(ok, seat, torch.zeros_like(seat))
        suz = self._suz_effect_rows(self._suz_c_xp).gather(1, s0.unsqueeze(1)).squeeze(1) & ok
        return 1 + (self._suz_xp_mult_k - 1) * suz.long()

    def _naval_kill_event(self, killer, vict_type: torch.Tensor, vict_barb: torch.Tensor, killed: torch.Tensor) -> None:
        """`navalKillEvent`'s twin — CIV6 (Hic Sunt Dracones, dark face): "+1
        Era Score each time you kill a non-Barbarian naval unit in combat."
        `killer` is a row int or a [B] seat tensor; a non-major killer (a
        city-state or a camp) holds no dedications and scores 0."""
        ev = killed & ~vict_barb & self.unit_naval[vict_type.clamp(min=0, max=self.NU - 1)]
        if not bool(ev.any()):
            return
        if isinstance(killer, int):
            if 0 <= killer < self.n_majors:
                self._dedication_event(killer, self._ded_dracones, ev)
            return
        for g in range(self.n_majors):
            m = ev & (killer == g)
            if bool(m.any()):
                self._dedication_event(g, self._ded_dracones, m)



    def _congress_upcoming(self, turn: int) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
        """(fires, res0, res1, dv) for the Regular Session that would run at
        `turn` — the SLATE a seat's ballot addresses, so a driver deciding for
        the turn ahead and `_world_congress` inside it read one body. Pure:
        `congress_sessions` is not touched here.

        The slate keys on the MAX era across majors (the wiki's "topics
        relevant for the current world") and rotates deterministically by
        session; a one-eligible slate runs its resolution once."""
        B, dev = self.B, self.device
        zero = torch.zeros(B, dtype=torch.bool, device=dev)
        neg = torch.full((B,), -1, dtype=torch.long, device=dev)
        if self._congress_interval <= 0 or (turn % self._congress_interval) != 0:
            return zero, neg, neg.clone(), zero
        world_era = torch.full((B,), -1, dtype=torch.long, device=dev)
        for row in range(self.n_majors):
            world_era = torch.maximum(world_era, self._civ_era(self.civ_techs[:, row], self.civ_civics[:, row]))
        fires = world_era >= self._congress_min_era
        res0, res1 = neg.clone(), neg.clone()
        NR = len(self._congress_res)
        if NR:
            elig = torch.stack([
                fires & (world_era >= r["min"]) & (world_era <= r["max"]) for r in self._congress_res
            ], dim=1)  # [B, NR]
            E = elig.long().sum(dim=1)
            rank = elig.long().cumsum(dim=1) - 1
            sess = self.congress_sessions + fires.long()
            j0 = (2 * (sess - 1)) % E.clamp(min=1)
            j1 = (2 * (sess - 1) + 1) % E.clamp(min=1)
            for r in range(NR):
                er = elig[:, r]
                res0 = torch.where(er & (rank[:, r] == j0), torch.full_like(res0, r), res0)
                res1 = torch.where(er & (rank[:, r] == j1), torch.full_like(res1, r), res1)
            res1 = torch.where(res1 == res0, torch.full_like(res1, -1), res1)
        return fires, res0, res1, fires & (world_era >= self._congress_dv_min)

    def _world_congress(self) -> None:
        """The `worldCongress`/`congressSession` mirror — one Regular Session
        at every congressInterval turn once ANY major is Medieval: two
        era-eligible resolutions off the rotation, then the Diplomatic Victory
        resolution from Modern. Mechanics sourced at the catalog
        (CONGRESS_RESOLUTIONS): the free vote + the 10k favor curve, outcome
        before target, +1 DVP to every winning-combo voter, refund tiers. The
        BALLOT rides the wire; a seat that submits none votes the AI line.
        Zero-draw — a pure function of state."""
        votes = self.civ_congress_vote.clone()
        self.civ_congress_vote[:] = -1  # an intent is for THIS turn
        fires, res0, res1, dv = self._congress_upcoming(int(self.turn))
        if not bool(fires.any()):
            return
        self.congress_sessions.add_(fires.long())
        # The standing set is REPLACED wholesale where a session fires, and
        # the cached legality bodies must see the change.
        for k in range(2):
            for f in range(3):
                self.congress_active[:, k, f] = torch.where(
                    fires, torch.full_like(self.congress_active[:, k, f], -1), self.congress_active[:, k, f])
        self._eff_version += 1
        for slot, sel in ((0, res0), (1, res1)):
            for r in range(len(self._congress_res)):
                m = fires & (sel == r)
                if bool(m.any()):
                    self._congress_regular(r, m, slot, votes)
        if bool(dv.any()):
            self._congress_dv(dv, votes)

    def _congress_space(self, kind: int) -> int:
        if kind == 0:
            return int(self.city_dist_tile.shape[3])
        if kind == 1:
            return int(self.civ_gpp.shape[2])
        if kind == 2:
            return 3
        return self.n_majors

    def _congress_pref(self, kind: int, row: int) -> torch.Tensor:
        """[B] — seat `row`'s AI free-vote target (the `preference` twin):
        outcome A on the target it holds the most of, argmax with ties to the
        LOWER index; kinds 0 district / 1 gpClass / 2 gwKind / 3 self. What a
        seat votes when its record carries no ballot for the slot."""
        B, dev = self.B, self.device
        if kind == 3:
            return torch.full((B,), row, dtype=torch.long, device=dev)
        if kind == 0:
            reg = self.city_dist_tile[:, row]  # [B, C, nD]
            comp = self.district_complete.gather(1, reg.clamp(min=0).reshape(B, -1)).reshape_as(reg)
            counts = ((reg >= 0) & comp & self.city_alive[:, row].unsqueeze(2)).long().sum(dim=1).double()
        elif kind == 1:
            counts = self.civ_gpp[:, row].double()
        else:
            al = self.city_alive[:, row].long()
            counts = torch.stack([
                (self.city_gw_writing[:, row] * al).sum(dim=1),
                (self.city_gw_art[:, row] * al).sum(dim=1),
                (self.city_gw_music[:, row] * al).sum(dim=1),
            ], dim=1).double()
        best = torch.full((B,), float("-inf"), dtype=torch.float64, device=dev)
        at = torch.zeros(B, dtype=torch.long, device=dev)
        for t in range(counts.shape[1]):
            take = counts[:, t] > best
            at = torch.where(take, torch.full_like(at, t), at)
            best = torch.where(take, counts[:, t], best)
        return at

    def _congress_buy(self, row: int, voter: torch.Tensor, want: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """`buyVotes`' twin — EXTRA votes up the sourced curve, the k-th
        costing congressVoteStep*k, the curve restarting for every resolution.
        Debits the bank and reports what it took, because the refund tiers pay
        that back. 64 rungs exhaust only above 20800 favor, beyond any
        250-turn bank."""
        B, dev = self.B, self.device
        fav = self.civ_diplo_favor[:, row].clone()
        start = fav.clone()
        extra = torch.zeros(B, dtype=torch.long, device=dev)
        for k in range(1, 65):
            can = voter & (extra < want) & (fav >= self._congress_vstep * k)
            if not bool(can.any()):
                break
            fav = torch.where(can, fav - self._congress_vstep * k, fav)
            extra = extra + can.long()
        self.civ_diplo_favor[:, row] = torch.where(voter, fav, self.civ_diplo_favor[:, row])
        return extra, torch.where(voter, start - fav, torch.zeros_like(start))

    def _congress_settle(self, m: torch.Tensor, out: torch.Tensor, tgt: torch.Tensor,
                         weight: torch.Tensor, spent: torch.Tensor, size: int) -> tuple[torch.Tensor, torch.Tensor]:
        """`tally` + `settle`: OUTCOME by weight (tie -> A), then TARGET by
        plurality among the winning outcome's votes (tie -> lower index); then
        +1 DVP to every winning-combo voter and the sourced refunds — 100% to
        a losing outcome, 50% to the winning outcome on a different target.
        Returns the winning (outcome, target)."""
        B, dev = self.B, self.device
        nrow = self.n_majors
        voting = weight > 0
        a_w = (weight * ((out == 0) & voting).long()).sum(dim=1)
        b_w = (weight * ((out == 1) & voting).long()).sum(dim=1)
        win_out = (b_w > a_w).long()
        counts = torch.zeros(B, size, dtype=torch.long, device=dev)
        for row in range(nrow):
            oh = torch.nn.functional.one_hot(tgt[:, row].clamp(min=0, max=size - 1), size)
            counts = counts + oh * (weight[:, row] * (voting[:, row] & (out[:, row] == win_out)).long()).unsqueeze(1)
        best = torch.full((B,), -1, dtype=torch.long, device=dev)
        win_t = torch.zeros(B, dtype=torch.long, device=dev)
        for t in range(size):
            take = counts[:, t] > best
            win_t = torch.where(take, torch.full_like(win_t, t), win_t)
            best = torch.where(take, counts[:, t], best)
        for row in range(nrow):
            cast = m & voting[:, row]
            lost = cast & (out[:, row] != win_out)
            near = cast & (out[:, row] == win_out) & (tgt[:, row] != win_t)
            hit = cast & (out[:, row] == win_out) & (tgt[:, row] == win_t)
            zero_s = torch.zeros_like(spent[:, row])
            back = (torch.where(lost, spent[:, row], zero_s)
                    + torch.where(near, torch.div(spent[:, row], 2, rounding_mode="floor"), zero_s))
            self.civ_diplo_favor[:, row] = self.civ_diplo_favor[:, row] + back
            self.civ_diplo_points[:, row] = self.civ_diplo_points[:, row] + hit.long() * self._dvp_per_res
        return win_out, win_t

    def _congress_regular(self, r: int, m: torch.Tensor, slot: int, votes: torch.Tensor) -> None:
        """One non-DV resolution for the games in `m` (the `runResolution`
        twin): every alive major casts its ballot — the recorded one, or the
        AI line, which is outcome A on its own best target and no favor. The
        winner enters `congress_active[slot]`."""
        B, dev = self.B, self.device
        kind = self._congress_res[r]["t"]
        nrow = self.n_majors
        size = self._congress_space(kind)
        zero = torch.zeros(B, dtype=torch.long, device=dev)
        out = torch.zeros(B, nrow, dtype=torch.long, device=dev)
        tgt = torch.zeros(B, nrow, dtype=torch.long, device=dev)
        weight = torch.zeros(B, nrow, dtype=torch.long, device=dev)
        spent = torch.zeros(B, nrow, dtype=self.civ_diplo_favor.dtype, device=dev)
        for row in range(nrow):
            voter = m & self.city_alive[:, row].any(dim=1)
            v = votes[:, row, slot]
            has = v[:, 0] >= 0
            o = torch.where(has, v[:, 0].clamp(min=0, max=1), zero)
            t = torch.where(has, v[:, 1].clamp(min=0, max=size - 1), self._congress_pref(kind, row))
            ex, sp = self._congress_buy(row, voter, torch.where(has, v[:, 2].clamp(min=0), zero))
            out[:, row] = torch.where(voter, o, out[:, row])
            tgt[:, row] = torch.where(voter, t, tgt[:, row])
            weight[:, row] = torch.where(voter, 1 + ex, weight[:, row])
            spent[:, row] = sp
        win_out, win_t = self._congress_settle(m, out, tgt, weight, spent, size)
        voted = m & (weight > 0).any(dim=1)
        for f, val in ((0, torch.full_like(win_t, r)), (1, win_out), (2, win_t)):
            self.congress_active[:, slot, f] = torch.where(voted, val, self.congress_active[:, slot, f])

    def _congress_leader(self, m: torch.Tensor) -> torch.Tensor:
        """[B] the DVP leader among alive majors, ties to the LOWER row; -1
        where no major holds a city."""
        B, dev = self.B, self.device
        lead = torch.full((B,), -1, dtype=torch.long, device=dev)
        best = torch.full((B,), -(2 ** 62), dtype=torch.long, device=dev)
        for row in range(self.n_majors):
            p = self.civ_diplo_points[:, row]
            take = m & self.city_alive[:, row].any(dim=1) & (p > best)
            lead = torch.where(take, torch.full_like(lead, row), lead)
            best = torch.where(take, p, best)
        return lead

    def _congress_dv(self, m: torch.Tensor, votes: torch.Tensor) -> None:
        """The Diplomatic Victory resolution (the `runDvResolution` twin).
        Without a ballot a seat votes the AI line — the leader votes A on
        itself, everyone else B on the leader — and pours ALL its favor in.
        The +/-2 lands on the WINNING TARGET immediately, unclamped: the win
        check is a >= threshold, so negative points are harmless."""
        B, dev = self.B, self.device
        nrow = self.n_majors
        lead = self._congress_leader(m)
        m = m & (lead >= 0)
        if not bool(m.any()):
            return
        huge = torch.full((B,), 2 ** 40, dtype=torch.long, device=dev)
        out = torch.zeros(B, nrow, dtype=torch.long, device=dev)
        tgt = torch.zeros(B, nrow, dtype=torch.long, device=dev)
        weight = torch.zeros(B, nrow, dtype=torch.long, device=dev)
        spent = torch.zeros(B, nrow, dtype=self.civ_diplo_favor.dtype, device=dev)
        for row in range(nrow):
            voter = m & self.city_alive[:, row].any(dim=1)
            v = votes[:, row, 2]
            has = v[:, 0] >= 0
            o = torch.where(has, v[:, 0].clamp(min=0, max=1),
                            torch.where(lead == row, torch.zeros_like(lead), torch.ones_like(lead)))
            t = torch.where(has, v[:, 1].clamp(min=0, max=nrow - 1), lead.clamp(min=0))
            ex, sp = self._congress_buy(row, voter, torch.where(has, v[:, 2].clamp(min=0), huge))
            out[:, row] = torch.where(voter, o, out[:, row])
            tgt[:, row] = torch.where(voter, t, tgt[:, row])
            weight[:, row] = torch.where(voter, 1 + ex, weight[:, row])
            spent[:, row] = sp
        win_out, win_t = self._congress_settle(m, out, tgt, weight, spent, nrow)
        delta = torch.where(win_out == 0,
                            torch.full((B,), self._congress_dv_delta, dtype=torch.long, device=dev),
                            torch.full((B,), -self._congress_dv_delta, dtype=torch.long, device=dev))
        for row in range(nrow):
            hit = m & (weight > 0).any(dim=1) & (win_t == row)
            self.civ_diplo_points[:, row] = self.civ_diplo_points[:, row] + torch.where(hit, delta, torch.zeros_like(delta))

    def _congress_slot(self, r: int) -> tuple[torch.Tensor, torch.Tensor]:
        """(outcome, target) [B] of standing resolution `r` — catalog order:
        0 Urban Development Treaty / 1 Patronage / 2 Migration Treaty /
        3 Heritage Organization (CONGRESS_RESOLUTIONS). Outcome -1 = not
        standing."""
        out = torch.full((self.B,), -1, dtype=torch.long, device=self.device)
        tgt = torch.full_like(out, -1)
        for k in range(self.congress_active.shape[1]):
            hit = self.congress_active[:, k, 0] == r
            out = torch.where(hit, self.congress_active[:, k, 1], out)
            tgt = torch.where(hit, self.congress_active[:, k, 2], tgt)
        return out, tgt

    def _congress_udt(self) -> tuple[torch.Tensor, torch.Tensor]:
        """[B] x2 — (district idx whose buildings take +100% production,
        district idx where buildings are banned); -1 where not standing."""
        out, tgt = self._congress_slot(0)
        return (torch.where(out == 0, tgt, torch.full_like(tgt, -1)),
                torch.where(out == 1, tgt, torch.full_like(tgt, -1)))

    def _congress_gpp_factor(self, cls: int) -> torch.Tensor:
        """[B] f64 — the Patronage factor for GP class `cls`: x2 (A), x0 (B)
        or 1. Covers every point source (the wiki footnote zeroes districts,
        buildings and projects alike)."""
        out, tgt = self._congress_slot(1)
        hit = (out >= 0) & (tgt == cls)
        fac = torch.where(out == 0,
                          torch.full((self.B,), self._c_gpp_mult, dtype=torch.float64, device=self.device),
                          torch.zeros(self.B, dtype=torch.float64, device=self.device))
        return torch.where(hit, fac, torch.ones_like(fac))

    def _congress_growth(self, row: int) -> torch.Tensor:
        """[B] f64 — the Migration Treaty growth factor on this row's cities."""
        out, tgt = self._congress_slot(2)
        hit = (out >= 0) & (tgt == row)
        fac = torch.where(out == 0,
                          torch.full((self.B,), self._c_grow_a, dtype=torch.float64, device=self.device),
                          torch.full((self.B,), self._c_grow_b, dtype=torch.float64, device=self.device))
        return torch.where(hit, fac, torch.ones_like(fac))

    def _congress_loyalty(self, row: int) -> torch.Tensor:
        """[B] f64 — the Migration Treaty loyalty term on this row's cities
        (A pays growth and COSTS loyalty; B is the reverse)."""
        out, tgt = self._congress_slot(2)
        hit = (out >= 0) & (tgt == row)
        term = torch.where(out == 0,
                           torch.full((self.B,), -self._c_mig_loy, dtype=torch.float64, device=self.device),
                           torch.full((self.B,), self._c_mig_loy, dtype=torch.float64, device=self.device))
        return torch.where(hit, term, torch.zeros_like(term))

    def _congress_gw_kmult(self) -> torch.Tensor:
        """[B, 3] long — Heritage Organization tourism factors by Great Work
        kind [writing, art, music]."""
        out, tgt = self._congress_slot(3)
        km = torch.ones(self.B, 3, dtype=torch.long, device=self.device)
        for k in range(3):
            hit = (out >= 0) & (tgt == k)
            km[:, k] = torch.where(
                hit,
                torch.where(out == 0, torch.full_like(km[:, k], self._c_gw_mult), torch.zeros_like(km[:, k])),
                km[:, k])
        return km

    def _congress_holy_blocked(self) -> torch.Tensor:
        """[B] — the Urban Development Treaty ban stands on HOLY_SITE, which
        also refuses the worship faith-buy (a purchase still CREATES the
        building)."""
        _p, blk = self._congress_udt()
        return (blk >= 0) & (blk == self._holy_didx)

    def _diplomatic_victor(self) -> torch.Tensor:
        """The `diplomaticVictor` mirror: [B] the lowest seat id holding
        >= diploVictoryPoints Diplomatic Victory Points and still holding a
        city; -1 none."""
        winner = torch.full((self.B,), -1, dtype=torch.long, device=self.device)
        for row in range(self.n_majors):
            okr = self.city_alive[:, row].any(dim=1) & (self.civ_diplo_points[:, row] >= self._dvp_win)
            winner = torch.where((winner < 0) & okr, torch.full_like(winner, row), winner)
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
        n = (self.ded_picks[:, civ] == kind).sum(dim=1)
        pay = (self.civ_age[:, civ] != 2) & (n > 0)
        if bool(pay.any()):
            self._add_era_score(civ, int(self._ded_event_score[kind]), pay.long() * cnt * n)

    def _grant_free_research(self, row: int, n_tech: torch.Tensor, n_civic: torch.Tensor) -> None:
        """`grantFreeResearch` — complete N techs and N civics outright, taking
        the FIRST available row in catalog order each time, then clearing the
        pick and its parked progress the way the paid completion does."""
        for is_civic in (0, 1):
            n = n_civic if is_civic else n_tech
            for k in range(int(n.max())):
                want = n > k
                if not bool(want.any()):
                    continue
                done = self.civ_civics[:, row] if is_civic else self.civ_techs[:, row]
                pre = self._prereq_c if is_civic else self._prereq_t
                avail = self._available_mask(done, pre)
                hit = want & avail.any(dim=1)
                if not bool(hit.any()):
                    continue
                pick = avail.long().argmax(dim=1)
                r = hit.nonzero(as_tuple=True)[0]
                if is_civic:
                    self.civ_civics[r, row, pick[r]] = True
                    self.civ_civic_retain[r, row, pick[r]] = 0
                    cur = self.civ_cur_civic[:, row]
                    self.civ_cur_civic[:, row] = torch.where(hit & (cur == pick), torch.full_like(cur, -1), cur)
                else:
                    self.civ_techs[r, row, pick[r]] = True
                    self.civ_tech_retain[r, row, pick[r]] = 0
                    cur = self.civ_cur_tech[:, row]
                    self.civ_cur_tech[:, row] = torch.where(hit & (cur == pick), torch.full_like(cur, -1), cur)
                self._eff_version += 1

    def _add_era_score(self, row: int, per: int, count: torch.Tensor) -> None:
        """`addEraScore` — era score for `count` moments each worth `per`.
        CIV6 (Taj Mahal): a moment worth `_era_moment_min` or more pays its
        owner one more, so the per-moment value has to reach this call."""
        cnt = count.long()
        self.era_score[:, row] = self.era_score[:, row] + cnt * int(per)
        if per >= self._era_moment_min and self._wond_n and int(self._wond_erascore.sum()) > 0:
            self.era_score[:, row] = self.era_score[:, row] + cnt * self._seat_wonder_sum(row, self._wond_erascore)

    def _culture_victor(self) -> torch.Tensor:
        """The `cultureVictor` mirror: [B] the lowest seat id whose VISITING
        tourists exceed EVERY other seat's DOMESTIC tourists; -1 none.

        visiting = lifetime tourism // (nCivs * TOURISM_PER_VISITOR_PER_CIV)
        domestic = lifetime culture // CULTURE_PER_DOMESTIC_TOURIST

        Both floor to whole tourists, so the comparison is integer-exact and
        zero-draw. Culture is milli-rounded BEFORE the floor (the bankruptcy
        convention) so a sub-milli float drift cannot move a tourist count.
        A cityless seat cannot win."""
        B, dev = self.B, self.device
        n_civs = self.n_majors
        vis_div = n_civs * self._tourism_per_visitor
        nrow = self.n_majors
        alive = [self.city_alive[:, row].any(dim=1) for row in range(nrow)]
        tour = [self.civ_tourism[:, row] for row in range(nrow)]
        cul = [self.civ_culture[:, row] for row in range(nrow)]
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
            if self.SEASIDE >= 0:
                sr_live = (self.improvement == self.SEASIDE).to(self.dtype) * live_imp
                if bool(sr_live.any()):
                    ty_oth[:, :, 2] = ty_oth[:, :, 2] + self._tile_appeal().clamp(min=0).to(self.dtype) * sr_live
        w = self.rules_dev.focus_base.double()
        oth_score = (ty_oth[:, :, 2:].double() * w[2:].reshape(1, 1, 4)).sum(dim=2)
        g = {"fs": fs, "f_base": f_base, "p_plane": p_plane, "ty_oth": ty_oth, "oth_score": oth_score, "w": w, "f_r": {}}
        self._rcy_cache = (self._eff_version, g)
        return g

    def _rcy_food_plane(self, row: int, g: dict) -> torch.Tensor:
        """[B, T] tile food for seat row `row`. The farm-adjacency tier is the
        row's own (its civics/techs), and tileYields adds it INSIDE the
        improvement block — ahead of fertility and the drought floor — so the
        tier goes onto the pre-tail base and the tail is taken again."""
        if row in g["f_r"]:
            return g["f_r"][row]
        f_plane = g["f_base"]
        if self.improvements_on:
            tier = self._farmadj_tier(self._seat_civics(row), self._seat_techs(row))
            if bool((tier > 0).any()):
                adj = self._farmadj_qual().to(self.dtype) * tier.unsqueeze(1).to(self.dtype)
                f_plane = self._food_tail(self._food_base() + adj)
        g["f_r"][row] = f_plane
        return f_plane

    def _seat_civics(self, row: int) -> torch.Tensor:
        return self.civ_civics[:, row]

    def _seat_techs(self, row: int) -> torch.Tensor:
        return self.civ_techs[:, row]

    def _seat_envoys(self, row: int) -> torch.Tensor:
        return self.seat_citystate_envoys[:, row]

    def _seat_has_beliefs(self, row: int) -> bool:
        return self._bel_any and bool(((self.civ_pantheon[:, row] >= 0) | (self.civ_follower[:, row] >= 0)).any())

    def _bel_add(self, key: str, row: int) -> torch.Tensor:
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
        return (
            self._bel["pan"][key][self.civ_pantheon[:, row] + 1]
            * self._bel["fol"][key][self.civ_follower[:, row] + 1]
            * self._bel["fou"][key][self.civ_founder[:, row] + 1]
        )

    def _bel_add_pf(self, key: str, row: int) -> torch.Tensor:
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
        fbr = torch.full((self.B, self.n_majors), -1, dtype=torch.long, device=self.device)
        n = min(self.n_majors, self.civ_follower.shape[1])
        fbr[:, :n] = self.civ_follower[:, :n]
        return fbr

    def _follower_id_for(self, rel: torch.Tensor) -> torch.Tensor:
        fbr = self._follower_by_rel()
        flat = rel.reshape(self.B, -1)
        fid = fbr.gather(1, flat.clamp(min=0)).reshape_as(rel)
        return torch.where(rel >= 0, fid, torch.full_like(fid, -1))

    def _fol_tab(self, key: str, fol_id: torch.Tensor) -> torch.Tensor:
        return self._bel["fol"][key][fol_id + 1]

    def _city_rel(self, row: int) -> torch.Tensor:
        if self._b18_couple:
            return self.city_followed[:, row]
        return torch.full((self.B, self.RC), row, dtype=torch.long, device=self.device)

    def _belief_feat_plane(self, row: int) -> torch.Tensor:
        """[B, T, 6] belief TILE adds — featureYields at tiles with a LIVE feature
        (fid >= 0 and not stripped), plus improvementOnResource at unpillaged
        improvements on a LIVE resource (category = the res priority code), plus
        improvementYields at unpillaged improvements. TS adds all three inside
        tileYields, so they ride every consumer: worked-tile picks and yields,
        scores, the border ySum. Row-keyed.

        Cached single-slot on (row, _eff_version, _bel_version). Belief inputs
        bump _bel_version at claims/restore; tile inputs (feat_id/feat_stripped/
        improvement/pillaged/res_stripped/res_priority) bump _eff_version at their
        mutation sites. All consumers read-only."""
        key = (row, self._eff_version, self._bel_version)
        if self._belief_feat_cache is not None and self._belief_feat_cache[0] == key:
            return self._belief_feat_cache[1]
        featA = self._bel_add("featY", row)
        plane = featA.gather(1, self.feat_id.clamp(min=0).unsqueeze(2).expand(-1, -1, 6))
        live = ((self.feat_id >= 0) & ~self.feat_stripped).unsqueeze(2).to(plane.dtype)
        plane = plane * live
        impA = self._bel_add("impRes", row)
        cat = torch.where(
            (self.improvement >= 0) & ~self.pillaged & ~self.res_stripped,
            self.res_priority.clamp(max=3),
            torch.zeros_like(self.res_priority),
        )
        plane = plane + impA.gather(1, cat.unsqueeze(2).expand(-1, -1, 6))
        # belief improvementYields, gathered by the tile's improvement
        # (unpillaged; no resource condition — TS keys on the improvement
        # alone). The gather pad (idx 0 = FARM) is masked dead by imp_live.
        impY = self._bel_add("impY", row)  # [B, nImp, 6]
        imp_live = ((self.improvement >= 0) & ~self.pillaged).unsqueeze(2).to(plane.dtype)
        plane = plane + impY.gather(1, self.improvement.clamp(min=0).unsqueeze(2).expand(-1, -1, 6)) * imp_live
        self._belief_feat_cache = (key, plane)
        return plane

    def _seat_route_income(self, row: int) -> torch.Tensor | None:
        """cityTradeYields for ANY seat row — per-COLUMN ORIGIN income from this
        row's outgoing routes, [B, cols, 6] double in engine yield
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
        An INTERNATIONAL leg (seat_route_dcity >= 0, paired with
        seat_route_dseat) pays intlGold + the dest city's completed specialty
        count to GOLD only. A route pays while it LIVES — interdiction is the
        PLUNDER kill in _trade_walk_tick, and a war CANCELS the pair's routes
        at the declaration, so no per-read war or raid gate survives here.

        Every specialty count is a DISTRICT REGISTRY read, for this row's own
        cities and for a foreign destination alike — specialtyDistricts walks
        `city.districts`, so a tile scan is the wrong input on any row.
        Endpoints resolve by PERSISTENT id among LIVING cities.

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
        rr = self.seat_routes[:, row]
        act = rr[:, :, 0] >= 0
        if not bool(act.any()):
            self._seat_route_cache = (key, None)
            return None
        B = self.B
        cols = self.RC
        ids = self.city_id[:, row, :cols]
        alive = self.city_alive[:, row, :cols]
        is_cs = rr[:, :, 1] <= -2  # CS dest encoding -(2+cityStateIdx)
        citystate_s = (-rr[:, :, 1] - 2).clamp(min=0)  # [B, K] cs index (garbage where ~is_cs)
        fm = (rr[:, :, 0].unsqueeze(2) == ids.unsqueeze(1)) & alive.unsqueeze(1)  # [B, K, cols]
        dm = (rr[:, :, 1].unsqueeze(2) == ids.unsqueeze(1)) & alive.unsqueeze(1)
        has_from = fm.any(dim=2)
        has_dest = dm.any(dim=2)
        from_j = fm.long().argmax(dim=2)
        dest_j = dm.long().argmax(dim=2)
        per = (1 + self._district_counts(row)[1] // 2).double()  # [B, cols] routeYields' food (= prod) column
        inc = torch.zeros(B, cols * 6, dtype=torch.float64, device=self.device)
        # domestic legs
        pays_d = act & (rr[:, :, 1] >= 0) & has_from & has_dest
        pd = pays_d.double()
        inc.scatter_add_(1, from_j * 6 + 0, per.gather(1, dest_j) * pd)
        inc.scatter_add_(1, from_j * 6 + 1, per.gather(1, dest_j) * pd)
        if self._enh_any and bool((self.civ_enhancer[:, row] >= 0).any()):
            tr6 = self._enh["tradeRel"][self.civ_enhancer[:, row] + 1]
            if bool((tr6 != 0).any()):
                dest_fol = self.city_followed[:, row, :cols].gather(1, dest_j)
                rel_ok = (pays_d & (dest_fol == row) & self.civ_religion_done[:, row].unsqueeze(1)).double()
                if bool((rel_ok != 0).any()):
                    for _kc in range(6):
                        inc.scatter_add_(1, from_j * 6 + _kc, tr6[:, _kc].unsqueeze(1) * rel_ok)
        if self.S > 0 and bool(is_cs.any()):
            S = self.S
            _tr = self.rules.trade or {}
            citystate_gold = float(_tr.get("cityStateRouteGold", 3))
            citystate_spec = float(_tr.get("cityStateRouteSpec", 1))
            css = citystate_s.clamp(max=S - 1)
            citystate_ok = self.citystate_alive[:, :S].gather(1, css) & (citystate_s < S)
            pays_c = act & is_cs & has_from & citystate_ok
            pc = pays_c.double()
            inc.scatter_add_(1, from_j * 6 + 2, citystate_gold * pc)
            ycol = self._citystate_yidx[:, :S].gather(1, css)
            inc.scatter_add_(1, from_j * 6 + ycol, citystate_spec * pc)
            # CIV6 (Kumasi's suzerain): routes to ANY city-state pay "+2
            # Culture and +1 Gold for every specialty district in the origin
            # city" — the ORIGIN's registry count, on each paying CS leg.
            kum = self._suz_effect(row, self._suz_c_route)
            if bool(kum.any()):
                spec_o = self._district_counts(row)[1].gather(1, from_j).double()
                kf = kum.double().unsqueeze(1) * pc * spec_o
                inc.scatter_add_(1, from_j * 6 + 4, self._suz_route_cul * kf)
                inc.scatter_add_(1, from_j * 6 + 2, self._suz_route_gold * kf)
        # INTERNATIONAL legs: a route to ANY OTHER MAJOR's city
        # (seat_route_dcity >= 0) pays intlGold + the dest city's completed
        # specialty count to GOLD only.
        rd_c = self.seat_route_dcity[:, row]  # [B, K] dest city id (>=0 = intl)
        intl = act & (rd_c >= 0)
        if bool(intl.any()):
            K_i = rd_c.shape[1]
            RCw = self.city_id.shape[2]
            # The dest CITY is the STORED (seat, id) pair looked up among that
            # seat's LIVING cities — `seatOf(toSeat).cities.find(c => c.id ===
            # toSeatCity)`. A capture re-mints the flipped city's id under the
            # captor, so the pair stops resolving and the leg pays nothing.
            dr = self.seat_route_dseat[:, row].clamp(min=0)  # [B, K]
            _rx = dr.unsqueeze(2).expand(B, K_i, RCw)
            hit = (self.city_id.gather(1, _rx) == rd_c.unsqueeze(2)) & self.city_alive.gather(1, _rx)
            valid_dest = intl & hit.any(dim=2)
            _col = hit.long().argmax(dim=2).unsqueeze(2)  # [B, K, 1] the dest's column
            # specialtyDistricts on the DEST — the same DISTRICT REGISTRY read
            # this row takes for its own cities, indexed at the dest's (row,
            # column) instead of a map-wide district-tile scan.
            _reg = self.city_dist_tile  # [B, n_majors, RC, nD]
            _comp = (_reg >= 0) & self.district_complete.gather(1, _reg.clamp(min=0).reshape(B, -1)).reshape_as(_reg)
            _spec_all = (_comp & self._is_specialty.reshape(1, 1, 1, -1)).sum(dim=3)  # [B, n_majors, RC]
            spec_dest = _spec_all.gather(1, _rx).gather(2, _col).squeeze(2)  # [B, K]
            gold_i = (self._trade_intl_gold + spec_dest).double()
            # CIV6 (Reform the Coinage, Golden face): "International Trade
            # Routes provide +3 Gold per specialty district in the foreign
            # city."
            gdc = self._golden_ded(row, self._ded_coinage)
            if bool(gdc.any()):
                gold_i = gold_i + self._coinage_spec_gold * spec_dest.double() * gdc.double().unsqueeze(1)
            pays_i = intl & has_from & valid_dest
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

    def _seat_city_yields(self, row: int, j: int, mask: torch.Tensor, amen_yf: torch.Tensor | None = None) -> tuple[torch.Tensor, ...]:
        yf = amen_yf.unsqueeze(1) if amen_yf is not None else self._seat_amenity(row)[2][:, j:j + 1]
        t = self._seat_city_walk(row, j, amen_yf=yf)[:, 0]
        z = torch.zeros_like(t[:, 0])
        return (
            torch.where(mask, t[:, 0], z),
            torch.where(mask, t[:, 1], z),
            torch.where(mask, t[:, 3], z),
            torch.where(mask, t[:, 4], z),
            torch.where(mask, t[:, 2], z),
            torch.where(mask, t[:, 5], z),
        )

    def _row_hot(self, rows: torch.Tensor | int) -> torch.Tensor:
        """[B] long — 1 on the batch rows named, 0 elsewhere."""
        out = torch.zeros(self.B, dtype=torch.long, device=self.device)
        out[rows] = 1
        return out

    def _completed_wonders(self, row: int) -> torch.Tensor | None:
        if not self._wond_n:
            return None
        cols = self.RC
        reg = self.city_wonder[:, row, :cols]
        return (reg >= 0) & self.built_wonder_complete.gather(1, reg.clamp(min=0).reshape(self.B, -1)).reshape_as(reg)

    def _wonder_extra_slots(self, row: int) -> torch.Tensor | None:
        """[B, 4] long — the policy slots this seat's COMPLETE wonders add, in
        SLOT_KINDS order (the `wonderExtraSlots` twin)."""
        compw = self._completed_wonders(row)
        if compw is None:
            return None
        return (compw.long().unsqueeze(3) * self._wond_slots.reshape(1, 1, -1, 4)).sum(dim=(1, 2))

    def _seat_wonder_sum(self, row: int, per_wonder: torch.Tensor) -> torch.Tensor:
        """[B] — one per-wonder quantity summed over every COMPLETE wonder the
        seat holds (the `seatWonderSum` twin)."""
        compw = self._completed_wonders(row)
        if compw is None:
            return torch.zeros(self.B, dtype=per_wonder.dtype, device=self.device)
        return (compw.to(per_wonder.dtype) * per_wonder.reshape(1, 1, -1)).sum(dim=(1, 2))

    def _seat_wonder_any(self, row: int, flag: torch.Tensor) -> torch.Tensor:
        """[B] bool — does the seat hold a COMPLETE wonder carrying `flag`?"""
        compw = self._completed_wonders(row)
        if compw is None:
            return torch.zeros(self.B, dtype=torch.bool, device=self.device)
        return (compw & flag.reshape(1, 1, -1)).any(dim=2).any(dim=1)

    def _seat_wonder_mult(self, row: int, per_wonder: torch.Tensor) -> torch.Tensor:
        """[B] f64 — the product of one per-wonder multiplier over the seat's
        COMPLETE wonders, folded in CATALOG order like the TS twin."""
        compw = self._completed_wonders(row)
        if compw is None:
            return torch.ones(self.B, dtype=torch.float64, device=self.device)
        return torch.where(
            compw, per_wonder.reshape(1, 1, -1).expand_as(compw), torch.ones_like(compw, dtype=torch.float64)
        ).prod(dim=2).prod(dim=1)

    def _city_wonder_mult(self, row: int, per_wonder: torch.Tensor) -> torch.Tensor:
        """[B, cols] f64 — the product of a per-wonder multiplier over each
        city's OWN complete wonders, folded in catalog order."""
        compw = self._completed_wonders(row)
        if compw is None:
            return torch.ones(self.B, self.RC, dtype=torch.float64, device=self.device)
        return torch.where(
            compw, per_wonder.reshape(1, 1, -1).expand_as(compw), torch.ones_like(compw, dtype=torch.float64)
        ).prod(dim=2)

    def _city_wonder_flat(self, row: int, per_wonder: torch.Tensor) -> torch.Tensor:
        """[B, cols] — a per-wonder amount paid to the city that HOLDS it."""
        compw = self._completed_wonders(row)
        if compw is None:
            return torch.zeros(self.B, self.RC, dtype=per_wonder.dtype, device=self.device)
        return (compw.to(per_wonder.dtype) * per_wonder.reshape(1, 1, -1)).sum(dim=2)

    def _wonder_improvement_amenities(self, row: int) -> torch.Tensor:
        """[B, cols] f64 — `wonderImprovementAmenities`: +1 amenity to the
        HOLDING city per matching improvement within the wonder's reach,
        measured from the WONDER TILE like every other wonder aura."""
        cols = self.RC
        z = torch.zeros(self.B, cols, dtype=torch.float64, device=self.device)
        if not self._wond_n or not self._wond_amen_imp:
            return z
        wreg = self.city_wonder[:, row, :cols]  # [B, cols, nW] tile per wonder
        for _wi, _imps, _rng in self._wond_amen_imp:
            wt = wreg[:, :, _wi]
            has = (wt >= 0) & self.built_wonder_complete.gather(1, wt.clamp(min=0))
            if not bool(has.any()):
                continue
            near = self.pair_dist[wt.clamp(min=0)] <= _rng  # [B, cols, T]
            ok = torch.zeros_like(self.improvement, dtype=torch.bool)
            for _i in _imps:
                ok = ok | (self.improvement == _i)
            z = z + (near & ok.unsqueeze(1)).sum(dim=2).double() * has.double()
        return z

    def _wonder_growth_mult(self, compw: torch.Tensor | None) -> torch.Tensor | None:
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
        """The regionalEffects twin for seat row `row`:
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
        # CIV6 (Mexico City's suzerain): "Regional effects from your Industrial
        # Zone, Water Park, and Entertainment Complex districts reach 3 tiles
        # farther." Districts only — `_wonder_regional_amenities` keeps the base.
        reach = self._regional_range + self._suz_reach_bonus * self._suz_effect(row, self._suz_c_reach).long().reshape(B, 1, 1)
        y6 = am = None
        for n in self._reg_bidx:
            own_n = self.city_bldg[:, row, :cols, n] & alive
            if not bool(own_n.any()):
                continue
            st = dt_all[:, :, int(self._b_req_district[n])]
            stc = st.clamp(min=0)
            ok = own_n & (st >= 0) & self.district_complete.gather(1, stc) & ~self.district_pillaged.gather(1, stc)
            if not bool(ok.any()):
                continue
            dd = self.pair_dist[stc.unsqueeze(2), ctrs.unsqueeze(1)]  # [B, src, recv] int16
            has = (ok.unsqueeze(2) & (dd <= reach)).any(dim=1) & alive  # [B, cols recv]
            hf = has.double()
            if y6 is None:
                y6 = torch.zeros(B, cols, 6, dtype=torch.float64, device=self.device)
                am = torch.zeros(B, cols, dtype=torch.float64, device=self.device)
            y6 = y6 + hf.unsqueeze(2) * self.rules_dev.b_yields[n].double().reshape(1, 1, 6)
            am = am + hf * float(self.rules.b_amenities[n])
        return None if y6 is None else (y6, am)

    def _district_slot_free(self, row: int, j: int, di: int) -> torch.Tensor:
        """canPlaceDistrictIn's one-per-city arm, [B]. A REPEATABLE type is
        never blocked by an existing one — CIV 6 lets a city hold several
        Neighborhoods, which is why they sit outside the population cap."""
        if bool(self._is_repeatable[di]):
            return torch.ones(self.B, dtype=torch.bool, device=self.device)
        return self.city_dist_tile[:, row, j, di] < 0

    def _district_counts(self, row: int) -> tuple[torch.Tensor, torch.Tensor]:
        """[B, cols] × 2 for seat row `row` — completedDistrictCount(city,
        false) and its specialtyOnly twin. CITY_CENTER lives outside the
        placeable catalog, so the registry already applies the TS filter's
        first arm.

        The registry holds ONE tile per type, so a REPEATABLE type is counted
        off the TILE PLANE and its single registry entry subtracted back out;
        TS walks `city.districts`, which lists every one. A repeatable type is
        never specialty (asserted at load), so the specialty twin stays a
        registry read."""
        cols = self.RC
        reg = self.city_dist_tile[:, row, :cols]
        comp = (reg >= 0) & self.district_complete.gather(1, reg.clamp(min=0).reshape(self.B, -1)).reshape_as(reg)
        all_n = comp.sum(dim=2)
        spec_n = (comp & self._is_specialty.reshape(1, 1, -1)).sum(dim=2)
        if self._rep_any:
            rep_t = (self.district >= 0) & self.district_complete \
                & self._is_repeatable[self.district.clamp(min=0)]  # [B, T]
            if bool(rep_t.any()):
                ids = self.city_id[:, row, :cols]
                alive = self.city_alive[:, row, :cols]
                hit = rep_t.unsqueeze(2) & (self.tile_city.unsqueeze(2) == ids.unsqueeze(1)) & alive.unsqueeze(1)
                all_n = all_n + hit.sum(dim=1) - (comp & self._is_repeatable.reshape(1, 1, -1)).sum(dim=2)
        return all_n, spec_n

    def _follower_live(self, row: int) -> bool:
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
        selb_h = bldg & ~self._bldg_dark(dreg)
        housing = water + torch.einsum("bjn,n->bj", selb_h.double(), rd.b_housing.double())
        housing = housing + self._palace_housing * is_cap_a
        if self._nbhd_didx >= 0:
            nb_ok = (self.district == self._nbhd_didx) & self.district_complete & ~self.district_pillaged & (self.tile_seat == row)
            if bool(nb_ok.any()):
                ap = self._tile_appeal()
                hv = torch.full_like(ap, self._appeal_floor)
                for cut, val in sorted(self._appeal_cuts):
                    hv = torch.where(ap >= cut, torch.full_like(ap, val), hv)
                ids = self.city_id[:, row, :cols]  # [B, cols] persistent ids
                hit = nb_ok.unsqueeze(2) & (self.tile_city.unsqueeze(2) == ids.unsqueeze(1)) & alive.unsqueeze(1)  # [B, T, cols]
                housing = housing + ((hv * nb_ok).double().unsqueeze(2) * hit.double()).sum(dim=1)
        if self._follower_live(row):
            housing = housing + torch.einsum("bjn,bjn->bj", selb_h.double(), self._fol_tab("bldgH", self._follower_id_for(self._city_rel(row))))
        if self._seat_has_beliefs(row):
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
        if self._gov_has_effects:
            gm = self._gov_mods(row)
            housing = housing + gm[2].double().unsqueeze(1)
            spec_d = self._district_counts(row)[1]
            housing = housing + self._cond_house_amen(gm[8], gm[9], spec_d)[0]
        housing = housing + self._city_wonder_flat(row, self._wond_cityhouse)[:, :cols]
        return maint, torch.where(alive, housing, torch.zeros_like(housing))

    def _seat_amenity(self, row: int) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
        """THE amenity body, for every seat row — computeCityStats' amenity
        half, in f64.

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
        # NATIONAL PARK amenities join baseHave BEFORE the luxury ranking,
        # exactly where `parkAmenities` sits in city.ts.
        have = have + self._park_amenities(row)
        need = torch.ceil((self.city_pop[:, row, :cols].double() - 2) / 2).clamp(min=0)
        lux_add = self._luxury_amenities(row, have, need)
        if self._gov_has_effects:
            _gm = self._gov_mods(row)
            _g_amen, _g_hid, _g_nd = _gm[7], _gm[8], _gm[9]
            _spec_d = self._district_counts(row)[1]
            _, _cond_amen = self._cond_house_amen(_g_hid, _g_nd, _spec_d)
            have = have + _g_amen.unsqueeze(1) + _cond_amen
        # WONDER amenities (Colosseum's regional reach, Alhambra's and Great
        # Bath's local ones, Temple of Artemis' per-improvement count) join the
        # TIER balance after the grant — city.ts leaves them out of baseHave.
        _wregam = self._wonder_regional_amenities(row, self._completed_wonders(row))
        if _wregam is not None:
            have = have + _wregam
        have = have + self._city_wonder_flat(row, self._wond_cityamen)[:, :cols]
        have = have + self._wonder_improvement_amenities(row)
        extra = None
        if self._seat_has_beliefs(row):
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
        balance = balance - self._ww_penalty(row, torch.float64).unsqueeze(1)
        growth_f, yield_f = self._amenity_factors(balance)
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
        self.city_is_cap[b, row, col] = False
        self.city_pop[b, row, col] = 0
        self.city_growth[b, row, col] = 0
        self.city_cbox[b, row, col] = 0
        self.city_acquired[b, row, col] = 0
        self.city_loyalty[b, row, col] = 100.0
        self.city_hp[b, row, col] = int(self.rules.combat.get("cityMaxHp", 200))
        self.city_outer_hp[b, row, col] = 0
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
        self.city_artifact_era[b, row, col, :] = -1
        self.city_artifact_seat[b, row, col, :] = -1
        self.city_gwart_type[b, row, col, :] = -1
        self.city_gwart_artist[b, row, col, :] = -1
        self.city_dist_tile[b, row, col, :] = -1
        self.city_spec_pin[b, row, col, :] = -1
        self.city_wonder[b, row, col, :] = -1
        self.city_bldg[b, row, col, :] = False
        self.city_followed[b, row, col] = -1
        self.city_pressure[b, row, col, :] = 0

    def _city_col_at(self, row: int, rows: torch.Tensor, tiles: torch.Tensor) -> torch.Tensor:
        """`cityAtTile` in COLUMN space — the column of seat row `row`'s
        city owning each (rows[i], tiles[i]) pair, -1 where the tile is not
        this row's.

        `tile_city` stores the owning city's PERSISTENT id for every seat,
        so the column is that id's position in this row's ALIVE
        registry; ids are per-seat monotonic, so an alive match is unique."""
        ids = self.city_id[rows, row]
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
        old_pop = int(self.city_pop[b, src_row, src_col])
        old_acq = int(self.city_acquired[b, src_row, src_col])
        old_gww = int(self.city_gw_writing[b, src_row, src_col])
        old_gwa = int(self.city_gw_art[b, src_row, src_col])
        old_gwm = int(self.city_gw_music[b, src_row, src_col])
        old_rel = int(self.city_relics[b, src_row, src_col])
        old_art = int(self.city_artifacts[b, src_row, src_col])
        old_prov = [getattr(self, _p)[b, src_row, src_col, :].clone() for _p in
                    ("city_artifact_era", "city_artifact_seat", "city_gwart_type", "city_gwart_artist")]
        old_bldg = self.city_bldg[b, src_row, src_col, :].clone()
        # RELIGION TRAVELS WITH THE CITY (TS copies religionPressure and
        # followedReligion into the flipped literal). Both planes are slot
        # indexed, so the fact has to be carried across by hand.
        old_fol = int(self.city_followed[b, src_row, src_col])
        old_pres = self.city_pressure[b, src_row, src_col, :].clone()
        self._clear_city_slot(b, src_row, src_col)
        self.centre_slot_at[b, c_t] = -1
        # ...and the loser re-crowns immediately, BEFORE the route prune and
        # BEFORE the raze early-out — the TS call order.
        _b1 = torch.tensor([b], dtype=torch.long, device=dev)
        self._relocate_palace(_b1, torch.tensor([src_row], dtype=torch.long, device=dev))
        kill = (self.seat_routes[b, src_row, :, 0] == cid) | (self.seat_routes[b, src_row, :, 1] == cid)
        self.seat_routes[b, src_row][kill] = -1
        self.seat_route_dseat[b, src_row][kill] = -1
        self.seat_route_dcity[b, src_row][kill] = -1
        self.seat_route_exp[b, src_row][kill] = -1
        self.seat_route_born[b, src_row][kill] = -1
        self.seat_route_walk[b, src_row][kill] = -1
        self.seat_route_leg[b, src_row][kill] = -1
        owned = (self.tile_seat[b] == src_row) & (self.tile_city[b] == cid)
        if conquest and int(self.city_alive[b, dst_row].sum()) >= int(self.rules.seats.get("maxCities", 6)):
            # The city simply ceases: tiles freed, centre unpaved (centre_slot_at
            # above — the `district` plane never encodes CITY_CENTER), no plunder.
            self.tile_seat[b] = torch.where(owned, torch.full_like(self.tile_seat[b], NO_SEAT), self.tile_seat[b])
            self.tile_city[b] = torch.where(owned, torch.full_like(self.tile_city[b], -1), self.tile_city[b])
            self._tile_owner_ver += 1
            self._eff_version += 1
            return False
        new_id = int(self.civ_next_city_id[b, dst_row])
        self.tile_seat[b] = torch.where(owned, torch.full_like(self.tile_seat[b], dst_row), self.tile_seat[b])
        self.tile_city[b] = torch.where(owned, torch.full_like(self.tile_city[b], new_id), self.tile_city[b])
        self._tile_owner_ver += 1  # seat + which city: the two halves TS calls ownerSeat/ownerCity
        col = self._seat_city_append(b, dst_row)
        self.city_alive[b, dst_row, col] = True
        self._add_era_score(dst_row, self._era_pts["conquer"], self._row_hot(b))
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
        for _p, _v in zip(("city_artifact_era", "city_artifact_seat",
                           "city_gwart_type", "city_gwart_artist"), old_prov):
            getattr(self, _p)[b, dst_row, col, :] = _v
        self.city_bldg[b, dst_row, col, :] = old_bldg
        # the CONQUEROR manages nothing yet: TS's flipped literal carries no
        # `specialistPref`, so every slot goes back to the automatic rule.
        self.city_spec_pin[b, dst_row, col, :] = -1
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
            _di = int(self.district[b, _t])
            if int(self.city_dist_tile[b, dst_row, col, _di]) < 0:  # a repeatable type keeps its first
                self.city_dist_tile[b, dst_row, col, _di] = _t
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
        if not bool(self.city_alive[b, src_row].any()):
            _elim = torch.zeros(self.B, dtype=torch.bool, device=dev)
            _elim[b] = True
            self._ww_peace(_elim, dst_row, src_row)
            self.war[b, src_row, dst_row] = False
            self.war[b, dst_row, src_row] = False
        self._eff_version += 1
        return True

    def _seat_border_key(self, row: int, center: torch.Tensor):
        B = self.B
        tiles = tiles_from_offsets(center, self._off5, self.W, self.H)
        tc = tiles.clamp(min=0)
        nbs = self.neigh[tc.reshape(-1)].reshape(B, -1, 6)
        g = self._rcy_globals()
        f_plane = self._rcy_food_plane(row, g)
        p_plane = g["p_plane"]
        if self._mine_boost_tech.numel() > 0 and self.MINE >= 0:
            boost_r = (self._seat_techs(row)[:, self._mine_boost_tech].to(self.dtype) * self._mine_boost_amt).sum(dim=1)
            p_plane = p_plane + ((self.improvement == self.MINE) & ~self.pillaged).to(self.dtype) * boost_r.unsqueeze(1)
        y_oth = (self.tile_yields[:, :, 2:] - self.feat_yields[:, :, 2:] * g["fs"].unsqueeze(-1)).sum(dim=2)
        if self.improvements_on:
            live_imp = ((self.improvement >= 0) & ~self.pillaged).to(self.dtype)
            y_oth = y_oth + self._imp_yields[self.improvement.clamp(min=0), 2:].sum(dim=2) * live_imp
            if self.SEASIDE >= 0:
                y_oth = y_oth + self._tile_appeal().clamp(min=0).to(self.dtype) * (
                    (self.improvement == self.SEASIDE).to(self.dtype) * live_imp
                )
        if self._seat_has_beliefs(row):
            featP = self._belief_feat_plane(row)
            f_plane = f_plane + featP[:, :, 0]
            p_plane = p_plane + featP[:, :, 1]
            y_oth = y_oth + featP[:, :, 2:].sum(dim=2)
        # tileYields returns ZERO for a paved tile (yields.ts:37), and an
        # orphaned district from a razed city CAN be an unowned candidate, so
        # the district/wonder mask must zero the key here.
        y_sum = (f_plane.double() + p_plane.double() + y_oth.double()).gather(1, tc) * ((self.district.gather(1, tc) < 0) & (self.built_wonder.gather(1, tc) < 0)).to(torch.float64)
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
            return js_round(base * _bmul).to(base.dtype) if _bmul is not None else base

        if not bool((act & (self.city_cbox[bidx, row, col] >= _cost())).any()):
            return
        tiles, tc, nbs, key0 = self._seat_border_key(row, center)
        unowned = None
        adj_own = None
        for _ in range(64):  # the TS while-loop: multiple claims per turn, escalating cost
            cost = _cost()
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
                unowned[rows, best[rows]] = False
                nb_s = self.neigh[spot]  # [n, 6]
                adj_hit = ((tiles[rows].unsqueeze(2) == nb_s.unsqueeze(1)) & (nb_s >= 0).unsqueeze(1)).any(dim=2)  # [n, M]
                adj_own[rows] = adj_own[rows] | adj_hit
            capped = ready & ~has_cand
            if bool(capped.any()):
                cb = self.city_cbox[bidx, row, col]
                self.city_cbox[bidx, row, col] = torch.where(capped, torch.minimum(cb, cost), cb)
            if not bool(claim.any()):
                return

    def _found_city_at(self, row: int, want: torch.Tensor, tile: torch.Tensor) -> torch.Tensor:
        """FOUND a city for seat row `row` at `tile` [B] where `want` — the
        FOUND_CITY verb's mutation, ONE body for every seat (a major's seat
        IS its block row). canFoundCity is
        re-checked LIVE at the settler's own tile; the settler unit is
        consumed by the CALLER. Returns the games that founded."""
        seat = row
        tc = tile.clamp(min=0)
        unowned = self.tile_seat.gather(1, tc.unsqueeze(1)).squeeze(1) < 0
        okt = (
            (tile >= 0) & unowned
            & self.settle_ok.gather(1, tc.unsqueeze(1)).squeeze(1)
            & (self.district.gather(1, tc.unsqueeze(1)).squeeze(1) < 0)
            & (self.built_wonder.gather(1, tc.unsqueeze(1)).squeeze(1) < 0)
        )
        nrows = self.n_majors
        ctr_all = self.city_center[:, :nrows].reshape(self.B, -1)
        live_all = self.city_alive[:, :nrows].reshape(self.B, -1)
        d_all = torch.where(live_all, self.pair_dist[tc.unsqueeze(1), ctr_all.clamp(min=0)].to(torch.long), 999)
        d_cs = torch.where(
            self.citystate_alive, self.pair_dist[tc.unsqueeze(1), self.citystate_center.clamp(min=0)].to(torch.long),
            torch.full_like(self.citystate_center, 999),
        )
        alive_row = self.city_alive[:, row]
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
        self._add_era_score(row, self._era_pts["found"], self._row_hot(rows))
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
        self.city_prod_bank[rows, row, slot] = 0
        self.city_gw_writing[rows, row, slot] = 0
        self.city_gw_art[rows, row, slot] = 0
        self.city_gw_music[rows, row, slot] = 0
        self.city_relics[rows, row, slot] = 0
        self.city_artifacts[rows, row, slot] = 0
        self.city_artifact_era[rows, row, slot, :] = -1
        self.city_artifact_seat[rows, row, slot, :] = -1
        self.city_gwart_type[rows, row, slot, :] = -1
        self.city_gwart_artist[rows, row, slot, :] = -1
        self.city_spec_pin[rows, row, slot, :] = -1
        self.city_loyalty[rows, row, slot] = 100.0
        self.city_acquired[rows, row, slot] = 0
        self.city_hp[rows, row, slot] = self.rules.combat.get("cityMaxHp", 200)
        self.city_outer_hp[rows, row, slot] = 0
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
        self.tmove[rows, s_idx] = torch.where(frm_f, self.hills[rows, s_idx].long() * 3, self.tmove[rows, s_idx])
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
                & (self.tile_seat[rows, ndc] < 0)
            )
            self.tile_seat[rows[free], n_d[free]] = seat
            self.tile_city[rows[free], n_d[free]] = _new_cid[free]
            self._tile_owner_ver += 1
        self._eff_version += 1
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
        civ_att = att & ~ok_m & ok_c
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
            def_hp = self.unit_hp.gather(1, ds0.unsqueeze(1)).squeeze(1)
            # attacker veterancy, gated on the attacking class's `caps.xp` — one
            # table, never a hardcoded pool name.
            atk_lvl5 = (self._xp_lvl_bonus(a_xp[:, u]) if SEAT_CAPS[POOL_CLASS[atk_kind]]["xp"]
                        else torch.zeros_like(a_hp[:, u]))
            atk_e = atk_cs_all - self._wound(a_hp[:, u]) - 5.0 * self._river_cross(here, tgt) + atk_lvl5
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
            atk_e = atk_e + self._cav_hill_cs(a_seat[:, u], a_type[:, u], here).to(atk_e.dtype)
            def_e = def_e + torch.where(d_emb, torch.zeros_like(def_e), self._rel_def_cs(torch.where(def_is_barb, neg, d_seat_m), tgt).to(def_e.dtype))
            def_e = def_e + torch.where(d_emb, torch.zeros_like(def_e), self._cav_hill_cs(d_seat_m, d_type, ttc).to(def_e.dtype))
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
            _wwd = self._tile_mil_seat(tgt)
            if SEAT_CAPS[POOL_CLASS[atk_kind]]["xp"]:
                a_xp[:, u] = torch.where(mil_att, a_xp[:, u] + XP_ATTACK * self._suz_xp_mult(a_seat[:, u]), a_xp[:, u])
            rows, def_dead, atk_dead = self._melee_exchange(
                mil_att, tgt, ttc, d_slot, ~def_is_barb, a_hp, u, atk_e, def_e,
                self._row_of(a_seat[:, u]))
            self._naval_kill_event(a_seat[:, u], d_type, def_is_barb, def_dead)
            self._naval_kill_event(d_seat_m, a_type[:, u], a_seat[:, u] == BARB_SEAT, atk_dead)
            self._ww_battle(mil_att, self._row_of(self._atk_seat(atk_kind, u)),
                            self._row_of(_wwd), tgt,
                            a_died=atk_dead, d_died=(_wwh & ~self._ww_occ(tgt)) != 0)
            if bool(atk_dead.any()):
                ar = atk_dead.nonzero(as_tuple=True)[0]
                self._dig_at(ar, here[ar], self._row_of(a_seat[ar, u]))
                a_occ[ar, here[ar]] = -1
                a_alive[:, u] = a_alive[:, u] & ~atk_dead
            adv_terr = self._advance_terrain(a_type[:, u], a_seat[:, u], tgt)
            adv = def_dead & ~atk_dead & ~self._blocked_for(tgt.unsqueeze(1), a_seat[:, u].unsqueeze(1)).squeeze(1) & adv_terr
            if bool(adv.any()):
                vr = adv.nonzero(as_tuple=True)[0]
                a_occ[vr, here[vr]] = -1
                a_tile[vr, u] = ttc[vr]
                a_occ[vr, ttc[vr]] = u + a_lo
                if major:
                    self._clear_camp_at(adv, ttc, a_seat[:, u], self._row_of(a_seat[:, u]))
        if bool(civ_att.any()):
            rows = civ_att.nonzero(as_tuple=True)[0]
            if major:
                self._capture_unit(rows, cslot_raw[rows], atk_kind, a_seat[rows, u], ttc[rows])
            else:
                self._dig_at(rows, ttc[rows], self._row_of(a_seat[rows, u]))
                self.civilian_at[(rows, ttc[rows])] = -1
                self.unit_alive[rows, cslot_raw[rows]] = False
                self._gen_ver += 1
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

    def _wonder_charges(self, row: int, type_idx: torch.Tensor) -> torch.Tensor:
        """[B] long — `wonderCharges`: the Pyramids' extra build charge on a
        Builder, the Hagia Sophia's extra spread on a Missionary or Apostle.
        Paid at CREATION, so a unit that predates the wonder keeps its count."""
        z = torch.zeros(self.B, dtype=torch.long, device=self.device)
        if not self._wond_n:
            return z
        if int(self._wond_build_ch.sum()) > 0 and self._builder_idx >= 0:
            z = z + (type_idx == self._builder_idx).long() * self._seat_wonder_sum(row, self._wond_build_ch)
        if int(self._wond_spread.sum()) > 0:
            spread = (type_idx == self._missionary_idx) | (type_idx == self._apostle_idx)
            z = z + spread.long() * self._seat_wonder_sum(row, self._wond_spread)
        return z

    def _wonder_loyalty_aura(self, row: int, here: torch.Tensor) -> torch.Tensor:
        """[B] bool — `wonderLoyaltyAura`: is the city centre at `here` within
        reach of one of this seat's COMPLETE loyalty-aura wonders? Measured
        from the WONDER TILE, like every other wonder aura."""
        z = torch.zeros(self.B, dtype=torch.bool, device=self.device)
        if not self._wond_n or int(self._wond_loyalty.sum()) == 0:
            return z
        compw = self._completed_wonders(row)
        if compw is None:
            return z
        wreg = self.city_wonder[:, row, : self.RC]  # [B, cols, nW]
        for _wi in (self._wond_loyalty > 0).nonzero(as_tuple=True)[0].tolist():
            wt = wreg[:, :, _wi]
            has = (wt >= 0) & self.built_wonder_complete.gather(1, wt.clamp(min=0))
            if not bool(has.any()):
                continue
            d = self.pair_dist[wt.clamp(min=0), here.unsqueeze(1)]  # [B, cols]
            z = z | (has & (d <= int(self._wond_loyalty[_wi]))).any(dim=1)
        return z

    def _occupy_def(self) -> torch.Tensor | None:
        """[B, T] long — the defence a COMPLETE wonder gives the unit standing
        on its tile (`terrainDefense`'s wonder term). None when no such wonder
        is in the catalog."""
        if not self._wond_n or int(self._wond_occdef.sum()) == 0:
            return None
        bw = self.built_wonder
        return self._wond_occdef[bw.clamp(min=0)] * ((bw >= 0) & self.built_wonder_complete).long()

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
        occ = self._occupy_def()
        if occ is not None:
            d = d + occ.gather(1, tiles.unsqueeze(1)).squeeze(1)
        return d

    def _tdef_i(self, bidx: torch.Tensor, tiles: torch.Tensor) -> torch.Tensor:
        d = self.tdef[bidx, tiles]
        if self.FORT >= 0:
            d = d + 4 * (self.improvement[bidx, tiles] == self.FORT).long()
        occ = self._occupy_def()
        if occ is not None:
            d = d + occ[bidx, tiles]
        return d

    def _nonbarb_unit_plane(self) -> torch.Tensor:
        mil = self.military_at
        mseat = torch.where(mil >= 0, self.unit_seat.gather(1, mil.clamp(min=0)), torch.full_like(mil, -1))
        return ((mil >= 0) & (mseat != BARB_SEAT)) | (self.civilian_at >= 0)

    def _nonbarb_unit_at(self, tiles: torch.Tensor) -> torch.Tensor:
        """[B, N] — `_nonbarb_unit_plane` evaluated AT `tiles`. A prober asking
        about one tile per game has no business building the whole map."""
        t = tiles.clamp(min=0)
        mil = self.military_at.gather(1, t)
        mseat = torch.where(mil >= 0, self.unit_seat.gather(1, mil.clamp(min=0)), torch.full_like(mil, -1))
        return ((mil >= 0) & (mseat != BARB_SEAT)) | (self.civilian_at.gather(1, t) >= 0)

    def _nonbarb_mil_plane(self) -> torch.Tensor:
        mil = self.military_at
        mseat = torch.where(mil >= 0, self.unit_seat.gather(1, mil.clamp(min=0)), torch.full_like(mil, -1))
        return (mil >= 0) & (mseat != BARB_SEAT)

    def _pool_at(self, plane: torch.Tensor, pool: str) -> torch.Tensor:
        lo, hi = self.POOL_LO[pool], self.POOL_HI[pool]
        mine = (plane >= lo) & (plane < hi)
        return torch.where(mine, plane - lo, torch.full_like(plane, -1))

    @property
    def barb_at(self) -> torch.Tensor:
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

    def _park_amenities(self, row: int) -> torch.Tensor:
        """[B, cols] f64 — what this seat's National Parks pay each of its
        cities. CIV6 (GlobalParameters NATIONAL_PARK_AMENITIES_OWNING_CITY /
        NATIONAL_PARK_NUM_OTHER_AMENITY_CITIES): 2 to the owning city and 1 to
        the four closest others. `parkAmenities` is the twin: one payout per
        park, taken at the cluster's ANCHOR, and the four are ranked by hex
        distance to that anchor with the city ID breaking ties."""
        B, cols, dev = self.B, self.RC, self.device
        out = torch.zeros(B, cols, dtype=torch.float64, device=dev)
        tix = torch.arange(self.T, device=dev).reshape(1, -1)
        anchor = (self.park == tix) & (self.tile_seat == row)   # [B, T]
        if not bool(anchor.any()):
            return out
        alive = self.city_alive[:, row, :cols]
        ctr = self.city_center[:, row, :cols].clamp(min=0)      # [B, cols]
        owner = self.city_slot_at(row)                          # [B, T] owning slot
        # OWNER: 2 per park whose anchor this city owns.
        own_slot = torch.where(anchor, owner, torch.full_like(owner, -1))
        for j in range(cols):
            out[:, j] = self._park_amen_owner * (own_slot == j).sum(dim=1).double()
        # NEAREST FOUR: rank the OTHER cities per anchor by (distance, id).
        d = self.pair_dist[ctr.unsqueeze(2), tix.unsqueeze(0)]  # [B, cols, T]
        cid = self.city_id[:, row, :cols]                       # [B, cols]
        BIG = 1 << 40
        key = d.long() * (1 << 20) + cid.unsqueeze(2).clamp(min=0)
        skip = (~alive).unsqueeze(2) | (own_slot.unsqueeze(1) == torch.arange(cols, device=dev).reshape(1, -1, 1))
        key = torch.where(skip | ~anchor.unsqueeze(1), torch.full_like(key, BIG), key)
        rank = key.argsort(dim=1).argsort(dim=1)                # [B, cols, T]
        near = (rank < self._park_amen_cities) & (key < BIG)
        out = out + self._park_amen_near * (near & anchor.unsqueeze(1)).sum(dim=2).double()
        return out * alive.double()

    def _do_excavate(self, row: int, mask: torch.Tensor, tile: torch.Tensor, slot: torch.Tensor) -> None:
        """EXCAVATE for the games in `mask` — `archaeologistExcavate`'s twin.
        The find lands in the LOWEST-id own city holding an Archaeological
        Museum with a free slot, carrying the dig's PROVENANCE into that
        museum's next slot; the dig is cleared and a charge is spent. A unit
        out of charges is disbanded, exactly as `spendCharge` does it."""
        if not bool(mask.any()) or self._artifact_bidx < 0:
            return
        tc = tile.clamp(min=0)
        room = (
            self.city_alive[:, row]
            & self.city_bldg[:, row, :, self._artifact_bidx]
            & (self.city_artifacts[:, row] < self._artifact_slots)
        )
        # TS sorts the candidate cities by CITY ID; the id plane holds it.
        BIG = 1 << 30
        key = torch.where(room, self.city_id[:, row], torch.full_like(self.city_id[:, row], BIG))
        best, home = key.min(dim=1)
        go = mask & (best < BIG)
        if not bool(go.any()):
            return
        rows = go.nonzero(as_tuple=True)[0]
        hslot = home[rows]
        land = self.antiquity[rows, tc[rows]]
        era = torch.where(land, self.antiquity_era[rows, tc[rows]], self.shipwreck_era[rows, tc[rows]])
        dseat = torch.where(land, self.antiquity_seat[rows, tc[rows]], self.shipwreck_seat[rows, tc[rows]])
        nxt = self.city_artifacts[rows, row, hslot].clamp(max=self._artifact_slots - 1)
        self.city_artifact_era[rows, row, hslot, nxt] = era
        self.city_artifact_seat[rows, row, hslot, nxt] = dseat
        self.city_artifacts[rows, row, hslot] = self.city_artifacts[rows, row, hslot] + 1
        # CIV6 (Wish You Were Here, dark face): "+1 Era Score for each Artifact
        # extracted."
        self._dedication_event(row, self._ded_wish, go)
        # clear whichever dig was worked
        lr = rows[land]
        wr = rows[~land]
        if lr.numel():
            self.antiquity[lr, tc[lr]] = False
            self.antiquity_era[lr, tc[lr]] = -1
            self.antiquity_seat[lr, tc[lr]] = -1
        if wr.numel():
            self.shipwreck[wr, tc[wr]] = False
            self.shipwreck_era[wr, tc[wr]] = -1
            self.shipwreck_seat[wr, tc[wr]] = -1
        sc = slot[rows]
        self.unit_charges[rows, sc] -= 1
        self.unit_mp[rows, sc] = 0
        spent = self.unit_charges[rows, sc] <= 0
        if bool(spent.any()):
            dr = rows[spent]
            self.unit_alive[dr, sc[spent]] = False
            self.civilian_at[(dr, tc[dr])] = -1
        self._eff_version += 1

    def _do_park(self, row: int, mask: torch.Tensor, tile: torch.Tensor, slot: torch.Tensor) -> None:
        """DESIGNATE a National Park — `naturalistPark`'s twin. The FIRST
        legal rhombus in the anchor's neighbour order (by TILE index, which is
        the order TS sorts them in) is taken, its four tiles join the park,
        and the Naturalist is consumed."""
        if not bool(mask.any()) or getattr(self, "_naturalist_idx", -1) < 0:
            return
        tc = tile.clamp(min=0).unsqueeze(1)                 # [B, 1]
        quad = self._park_cluster(tc)                       # [B, 1, 6, 4]
        legal = self._park_cluster_legal(row, quad)         # [B, 1, 6]
        # TS walks the anchor's neighbours sorted by TILE INDEX and takes the
        # first legal one; rank the same way rather than by direction.
        nb = self.neigh[tc]                                 # [B, 1, 6]
        BIG = 1 << 30
        key = torch.where(legal, nb, torch.full_like(nb, BIG))
        best, pick = key.min(dim=2)                         # [B, 1]
        go = mask & (best.squeeze(1) < BIG)
        if not bool(go.any()):
            return
        rows = go.nonzero(as_tuple=True)[0]
        chosen = quad[rows, 0, pick[rows, 0]]               # [n, 4], sorted
        anchor = chosen[:, 0]                               # the cluster's name
        for k in range(chosen.shape[1]):
            self.park[rows, chosen[:, k]] = anchor
        # the Naturalist is CONSUMED by the designation
        self.unit_alive[rows, slot[rows]] = False
        self.civilian_at[(rows, tile.clamp(min=0)[rows])] = -1
        self._eff_version += 1

    def city_slot_at(self, row: int) -> torch.Tensor:
        """[B, T] — seat `row`'s city SLOT owning each tile, -1 for nobody.

        Not a plain view of `tile_seat`: it answers a different question, not
        "whose tile" but "whose CITY", TS's `ownerCity` beside its `ownerSeat`.
        `tile_city` stores the PERSISTENT city id for every seat, while
        the consumers speak column space — so the derivation matches the row's
        own id registry, ALIVE columns only (dead and never-founded columns
        hold stale ids and the zeros init; ids are per-seat monotonic, so an
        alive match is unique).

        Cached per row on `_tile_owner_ver`. The ownership TEST is
        `tile_seat == row` and needs none of this; ask here only when the
        answer has to be a city SLOT."""
        hit = self._city_slot_cache.get(row)
        if hit is None or hit[0] != self._tile_owner_ver:
            ids = self.city_id[:, row, : self.RC]
            m = (
                (self.tile_seat == row).unsqueeze(2)
                & (self.tile_city.unsqueeze(2) == ids.unsqueeze(1))
                & self.city_alive[:, row].unsqueeze(1)
            )
            out = torch.where(
                m.any(dim=2), m.long().argmax(dim=2),
                torch.full_like(self.tile_city, -1),
            )
            self._city_slot_cache[row] = (self._tile_owner_ver, out)
            return out
        return hit[1]

    @property
    def citystate_at(self) -> torch.Tensor:
        if self._citystate_at_ver != self._tile_owner_ver:
            self._citystate_at_cache = torch.where(
                self.tile_seat >= 100, self.tile_seat - 100,
                torch.full_like(self.tile_seat, -1),
            )
            self._citystate_at_ver = self._tile_owner_ver
        return self._citystate_at_cache


    def _seats_hostile(self, a_seat, b_plane: torch.Tensor) -> torch.Tensor:
        # A seat is never hostile to ITSELF, stated explicitly below: leaving it
        # to the war matrix's unwritten diagonal would make the answer depend on
        # a value nothing maintains.
        B = self.B
        valid = b_plane >= 0
        b_barb = b_plane == BARB_SEAT
        rb = self._seat_row[b_plane.clamp(min=0)]
        if torch.is_tensor(a_seat):
            a = a_seat.reshape(B, 1)
            ra = self._seat_row[a.clamp(min=0)]
            at_war = self.war[self._bidx1, ra, rb]
            a_barb = a == BARB_SEAT
            return valid & (a != b_plane) & ((a_barb ^ b_barb) | (~a_barb & ~b_barb & at_war))
        # An INT acting seat is the common case (the walkers probe on behalf of
        # one seat): one row of the war matrix gathered by the other side's row,
        # with no [B, 1] fill and no advanced index. The two arms below are the
        # tensor formula above with `a_barb` folded out.
        not_same = b_plane != a_seat
        if a_seat == BARB_SEAT:  # a barbarian is hostile to every non-barbarian
            return valid & not_same & ~b_barb
        at_war = self.war[:, int(self._seat_row[max(int(a_seat), 0)])].gather(
            1, rb.reshape(B, -1)).reshape(rb.shape)
        return valid & not_same & (b_barb | at_war)

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
        major = srow < self.n_majors
        if bool(major.any()):
            self._reveal_around(rows[major], srow[major], dest[rows][major], 2)
        if clear_camp:
            self._clear_camp_at(moved, dest, self.unit_seat.gather(1, gs1).squeeze(1), seat)
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
        dn = self.neigh[dest.clamp(min=0)]
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

    def _war_march_target(self, hc: torch.Tensor, row: int):
        """The war-march DESTINATION for seat `row`'s units standing at `hc` —
        the nearest unpillaged enemy improvement or complete district within 13,
        else the nearest enemy city on `hostileUnitAct`'s key: distance, then
        the owner's SEAT id, then the centre TILE. No owner is a separate arm
        and none wins a tie by being row 0.

        The row indexes the war matrix directly, so who this seat fights is
        read here rather than passed in — every cell of the row, including
        the diagonal, which is false against itself.

        ONE implementation shared by the per-unit OBSERVATION and the driver;
        separate copies would drift.
        Returns (tgt, has_imp, has_city).
        """
        B, T, dev = self.B, self.T, self.device
        arangeT = torch.arange(T, device=dev)
        # AT WAR WITH THIS TILE'S OWNER — the TS `tOwned` term, for every major
        # owner alike. A major's absolute seat IS its row, so the war lookup is
        # one gather; a city-state or barbarian tile is masked out by `major`
        # before it can index the row.
        _ts = self.tile_seat
        major = (_ts >= 0) & (_ts < self.n_majors)
        at_war_t = major & self.war[:, row].gather(1, torch.where(major, _ts, torch.zeros_like(_ts)))
        if self.improvements_on or self.districts_on:
            imp_job = (self.improvement >= 0) & ~self.pillaged & at_war_t
            if self.districts_on:
                imp_job = imp_job | ((self.district >= 0) & self.district_complete & ~self.district_pillaged & at_war_t)
            d_imp = self.pair_dist[hc.unsqueeze(1), arangeT.unsqueeze(0)].to(torch.long)
            ikey = torch.where(imp_job & (d_imp < 13), d_imp * (T + 1) + arangeT, torch.full_like(d_imp, 10**9))
            imp_min, imp_tgt = ikey.min(dim=1)
            has_imp = imp_min < 10**9
        else:
            has_imp = torch.zeros(B, dtype=torch.bool, device=dev)
            imp_tgt = hc
        # THE CITY SCAN — one total order over every major this seat is at
        # war with, on the TS key: distance, then the seat id, then the centre
        # tile. No seat is a separate arm and none wins a tie by being row 0.
        # ONE argmin over the whole city block: the key is unique per live
        # city, so the winner is the one a slot-by-slot scan would have kept.
        _cc = self.city_center[:, :self.n_majors].reshape(B, -1).clamp(min=0)  # [B, M]
        _ca = (self.city_alive[:, :self.n_majors].reshape(B, -1)
               & self.war[:, row, :self.n_majors].repeat_interleave(self.RC, dim=1))
        _d2 = self.pair_dist[hc.unsqueeze(1), _cc].to(torch.long)
        _key = torch.where(_ca, _d2 * (2048 * 8) + self._march_seatkey + _cc,
                           torch.full_like(_d2, 10**18))
        ckey_min, _cwin = _key.min(dim=1)
        has_city = ckey_min < 10**18
        city_tgt = torch.where(has_city, _cc.gather(1, _cwin.unsqueeze(1)).squeeze(1), hc)
        tgt = torch.where(has_imp, imp_tgt, city_tgt)
        return tgt, has_imp, has_city

    def _attack_encampment(self, att: torch.Tensor, tile: torch.Tensor, atk_kind: str, u: int) -> None:
        """The `attackEncampment` twin — a melee assault ON an Encampment tile.
        The district fights at its OWNER's seat-level defense floor
        (max(15, bestMeleeCS); no city-centre garrison term, since that +5
        describes a unit standing in the CITY, not on this district), its own
        garrison pool takes the damage, and the attacker never advances.

        ONE roll key whoever owns the district: `enc` for the damage and `encc`
        for the counter — an Encampment is fought the same way on every row, and
        the defense floor above is already one row-generic read. Draw ORDER is
        TS's: damage-to-district, then counter."""
        a_hp, a_tile, a_type, a_xp, a_emb, a_alive, a_seat = self._pool_of(atk_kind)
        a_occ = self.military_at
        atk_cs = self._type_combat[a_type[:, u]]
        major = POOL_CLASS[atk_kind] == "major"
        tc = tile.clamp(min=0)
        hseat = self.tile_seat.gather(1, tc.unsqueeze(1)).squeeze(1)
        hrow = hseat.clamp(min=0, max=self.n_majors - 1)
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
            atk_e = atk_e + self._cav_hill_cs(a_seat[:, u], a_type[:, u], a_tile[:, u]).to(atk_e.dtype)
            atk_e = atk_e + self._gen_aura_cs(a_seat[:, u], a_tile[:, u], atk_naval).to(atk_e.dtype)
        diff, cdiff = atk_e - def_cs, def_cs - atk_e
        d_enc = self._damage_roll(att, diff, k="enc", tile=tc)
        d_self = self._damage_roll(att, cdiff, k="encc", tile=tc)
        if SEAT_CAPS[POOL_CLASS[atk_kind]]["xp"]:
            a_xp[:, u] = torch.where(att, a_xp[:, u] + XP_ATTACK * self._suz_xp_mult(a_seat[:, u]), a_xp[:, u])
        rows = att.nonzero(as_tuple=True)[0]
        if len(rows) > 0:
            tr = tc[rows]
            self.encamp_hp[rows, tr] = (self.encamp_hp[rows, tr] - d_enc[rows]).clamp(min=0)
        _ww_ad = att & ((a_hp[:, u] - d_self) <= 0)
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
            self._dig_at(dr, a_tile[dr, u], self._row_of(self._atk_seat(atk_kind, u)[dr]))
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
        self._gen_ver += 1

    def _pool_of(self, atk_kind: str):
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
        hrow = self.tile_seat.gather(1, ttc.unsqueeze(1)).squeeze(1).clamp(min=0, max=self.n_majors - 1)
        slot = self.centre_slot_at.gather(1, ttc.unsqueeze(1)).squeeze(1).clamp(min=0)
        gslot = self.military_at.gather(1, ttc.unsqueeze(1)).squeeze(1)
        gar = ((gslot >= 0) & (self.unit_seat[bidx, gslot.clamp(min=0)] == hrow)).long()
        best_r = self.civ_best_melee[bidx, hrow]
        def_cs = torch.maximum(best_r, torch.full_like(best_r, 15)) + gar * 5
        atk_e = (self._type_combat[a_type[:, u].clamp(min=0, max=self.NU - 1)]
                 - self._wound(a_hp[:, u])
                 - 5.0 * self._river_cross(a_tile[:, u], tgt))
        if SEAT_CAPS[POOL_CLASS[atk_kind]]["xp"]:
            atk_e = atk_e + self._xp_lvl_bonus(a_xp[:, u])
        if self._city_rel_live:
            atk_e = atk_e + self._rel_atk_cs(a_seat[:, u], tgt).to(atk_e.dtype)
        atk_e = atk_e + self._cav_hill_cs(a_seat[:, u], a_type[:, u], a_tile[:, u]).to(atk_e.dtype)
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
            a_xp[:, u] = torch.where(att, a_xp[:, u] + XP_ATTACK * self._suz_xp_mult(a_seat[:, u]), a_xp[:, u])
        rows = att.nonzero(as_tuple=True)[0]
        hr, sl = hrow[rows], slot[rows]
        outer = self.city_outer_hp[rows, hr, sl]
        wall, centre = self._city_damage_split(outer, d_city[rows], "melee")
        self.city_outer_hp[rows, hr, sl] = outer - wall
        self.city_hp[rows, hr, sl] -= centre
        a_hp[:, u] = torch.where(att, a_hp[:, u] - d_atk, a_hp[:, u])
        died = att & (a_hp[:, u] <= 0)
        self._ww_battle(att, self._row_of(a_seat[:, u]), hrow, tgt, a_died=died, city=True)
        self._naval_kill_event(hrow, a_type[:, u], a_seat[:, u] == BARB_SEAT, died)
        if bool(died.any()):
            dr = died.nonzero(as_tuple=True)[0]
            self._dig_at(dr, a_tile[dr, u], self._row_of(a_seat[dr, u]))
            self.military_at[(dr, a_tile[dr, u])] = -1
            a_alive[:, u] = a_alive[:, u] & ~died
        return rows, hrow, slot, died, ttc

    def _raze_garrison(self, rows: torch.Tensor, centres: torch.Tensor, captor: torch.Tensor) -> None:
        """CIV6: "when a city is captured, all units within it are destroyed" —
        the garrison falls with the centre it was holding, whoever it belongs
        to. Runs BEFORE the transfer, so the centre is still registered and the
        deaths leave no dig, exactly as TS's `markAntiquitySite` refuses a tile
        carrying a district."""
        if rows.numel() == 0:
            return
        for pool in ("major", "barb"):
            tiles = getattr(self, f"{pool}_unit_tile")[rows]
            seats = getattr(self, f"{pool}_unit_seat")[rows]
            hit = (getattr(self, f"{pool}_unit_alive")[rows]
                   & (tiles == centres.unsqueeze(1)) & (seats != captor.unsqueeze(1)))
            if not bool(hit.any()):
                continue
            ri, si = hit.nonzero(as_tuple=True)
            gr = rows[ri]
            self._dig_at(gr, centres[ri], self._row_of(captor[ri]))  # killUnit's ACTING seat
            getattr(self, f"{pool}_unit_alive")[gr, si] = False
            self._vacate(pool, gr, si)

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
        a_seat = self._pool_of(atk_kind)[6]
        self._raze_garrison(fell, self.city_center[fell, hrow[fell], slot[fell]], a_seat[fell, u])
        if POOL_CLASS[atk_kind] == "major":
            for _b in fell.tolist():
                self._transfer_city(_b, int(hrow[_b]), int(slot[_b]), int(a_seat[_b, u]), conquest=True)
            return
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
            nb_r = self.neigh[centers.clamp(min=0)]
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
        atk_e = self._type_combat[at0] - self._wound(a_hp[:, u]) - 5.0 * self._river_cross(here, tgt)
        if SEAT_CAPS[POOL_CLASS[atk_kind]]["xp"]:
            atk_e = atk_e + self._xp_lvl_bonus(a_xp[:, u])
        if self._city_rel_live:
            atk_e = atk_e + self._rel_atk_cs(a_seat[:, u], tgt).to(atk_e.dtype)
        atk_e = atk_e + self._cav_hill_cs(a_seat[:, u], at0, a_tile[:, u]).to(atk_e.dtype)
        aura_civ = torch.where(a_seat[:, u] == BARB_SEAT,
                               torch.full_like(a_seat[:, u], -1), a_seat[:, u])
        atk_naval = self.unit_naval[at0] | a_emb[:, u]
        atk_e = atk_e + self._gen_aura_cs(aura_civ, a_tile[:, u], atk_naval).to(atk_e.dtype)
        d_cs = self._damage_roll(att, atk_e - def_cs, k="csty", tile=tgt)
        d_atk = self._damage_roll(att, def_cs - atk_e, k="cstyc", tile=tgt)
        if SEAT_CAPS[POOL_CLASS[atk_kind]]["xp"]:
            a_xp[:, u] = torch.where(att, a_xp[:, u] + XP_ATTACK * self._suz_xp_mult(a_seat[:, u]), a_xp[:, u])
        rows = att.nonzero(as_tuple=True)[0]
        self.citystate_hp[rows, citystate_sc[rows]] -= d_cs[rows]
        a_hp[:, u] = torch.where(att, a_hp[:, u] - d_atk, a_hp[:, u])
        atk_dead = att & (a_hp[:, u] <= 0)
        if bool(atk_dead.any()):
            ar = atk_dead.nonzero(as_tuple=True)[0]
            self._dig_at(ar, here[ar], self._row_of(a_seat[ar, u]))
            self.military_at[(ar, here[ar])] = -1
            a_alive[:, u] = a_alive[:, u] & ~atk_dead
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
        d = self._damage_roll(strike, atk_cs - def_e, k=key, tile=tt)
        self._ww_battle(strike, striker_row, self._row_of(d_seat), tt,
                        d_died=strike & (d_slot >= 0) & ((def_hp - d) <= 0), city=True)
        self._naval_kill_event(
            striker_row,
            self.unit_type.gather(1, d_slot.clamp(min=0).unsqueeze(1)).squeeze(1),
            d_seat == BARB_SEAT,
            strike & (d_slot >= 0) & ((def_hp - d) <= 0))
        rows = strike.nonzero(as_tuple=True)[0]
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
            self._dig_at(gd, td, striker_row)
            if bool(dead.any()):
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
                        atk_e: torch.Tensor, def_e: torch.Tensor,
                        atk_row: torch.Tensor):
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
            self._dig_at(gd, td, atk_row[gd])
        surv = (att & def_can_xp & ~def_dead).nonzero(as_tuple=True)[0]
        if len(surv) > 0:
            self.unit_xp[surv, d_slot[surv]] += XP_DEFEND
        a_hp[:, u] = torch.where(att, a_hp[:, u] - d_atk, a_hp[:, u])
        atk_dead = att & (a_hp[:, u] <= 0)
        both = def_dead & atk_dead
        a_hp[:, u] = torch.where(both, torch.ones_like(a_hp[:, u]), a_hp[:, u])
        atk_dead = atk_dead & ~def_dead
        return rows, def_dead, atk_dead

    def _hostile_ranged_strike(self, att: torch.Tensor, tgt: torch.Tensor, atk_kind: str, u: int) -> torch.Tensor:
        ttc = tgt.clamp(min=0)
        _hp_p, _tile_p, _type_p, _xp_p, _emb_p, _alive_p, _seat_p = self._pool_of(atk_kind)
        barb = POOL_CLASS[atk_kind] == "hostile"
        ut0 = _type_p[:, u].clamp(min=0, max=self.NU - 1)
        atk_rs = self._type_ranged_strength[ut0]
        a_hp, a_tile, a_seat = _hp_p[:, u], _tile_p[:, u], _seat_p[:, u]
        a_lvl = (self._xp_lvl_bonus(_xp_p[:, u]) if SEAT_CAPS[POOL_CLASS[atk_kind]]["xp"]
                 else torch.zeros_like(a_hp))
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
            hrow = ctr.clamp(min=0, max=self.n_majors - 1)
            hcol = self.centre_slot_at.gather(1, ttc.unsqueeze(1)).squeeze(1).clamp(min=0)
            _gm = self.military_at.gather(1, ttc.unsqueeze(1)).squeeze(1)
            gar = ((_gm >= 0) & (self.unit_seat[_bidx, _gm.clamp(min=0)] == hrow)).long()
            def_cs = torch.maximum(self.civ_best_melee[_bidx, hrow], torch.full_like(hrow, 15)) + gar * 5
            outer_all = self.city_outer_hp[_bidx, hrow, hcol]
            atk_e = atk_rs - self._ranged_city_penalty(ut0, outer_all) - self._wound(a_hp) + a_lvl
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
            outer = self.city_outer_hp[rows, hr_, hc_]
            wall, centre = self._city_damage_split(outer, d_city[rows], "ranged")
            self.city_outer_hp[rows, hr_, hc_] = outer - wall
            self.city_hp[rows, hr_, hc_] = (self.city_hp[rows, hr_, hc_] - centre).clamp(min=1)
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
        civ_def = ~elig_m & elig_c
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
            d_emb = self.unit_emb.gather(1, ds0.unsqueeze(1)).squeeze(1) & (d_slot >= 0)
            def_cs = torch.where(d_emb, torch.full_like(def_cs, self._embarked_defense_cs), def_cs)
            def_hp = self.unit_hp.gather(1, ds0.unsqueeze(1)).squeeze(1)  # wounded defender
            atk_e = atk_rs - self._wound(a_hp) + a_lvl  # wound + attacker veterancy
            def_e = def_cs - self._wound(def_hp)
            _, _sp = self._flank_support(tgt, d_seat, torch.full_like(tgt, -1))
            def_e = def_e + SUPPORT_CS * torch.where(d_emb, torch.zeros_like(_sp), _sp)
            if not barb:
                atk_e = atk_e + (self._rel_atk_cs(a_seat, tgt).to(atk_e.dtype))  # NEVER gated
            def_e = def_e + torch.where(d_emb, torch.zeros_like(def_e), self._rel_def_cs(torch.where(d_barb, neg, d_seat), tgt).to(def_e.dtype))
            def_e = def_e + torch.where(d_emb, torch.zeros_like(def_e), self._cav_hill_cs(d_seat, d_type, ttc).to(def_e.dtype))
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
            self._dig_at(gd, td, self._row_of(self._atk_seat(atk_kind, u)[gd]))  # killUnit's dig
            # Clearing both maps is branch-free and exact: only one of them is
            # set on that tile.
            md = d_is_mil[gd]
            mg, mt = gd[md], td[md]
            cg, ct2 = gd[~md], td[~md]
            self.military_at[mg, mt] = -1
            self.civilian_at[cg, ct2] = -1
            self._ww_battle(unit_att, self._row_of(self._atk_seat(atk_kind, u)),
                            self._row_of(d_seat), tgt,
                            d_died=unit_att & (d_slot >= 0) & ((def_hp0 - d_def) <= 0))
            self._naval_kill_event(self._atk_seat(atk_kind, u), d_type, d_barb,
                                   unit_att & (d_slot >= 0) & ((def_hp0 - d_def) <= 0))
            if bool((unit_att & civ_def).any()):
                self._gen_ver += 1
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
            _xp_p[:, u] = torch.where(city_att | unit_att, _xp_p[:, u] + XP_ATTACK * self._suz_xp_mult(_seat_p[:, u]), _xp_p[:, u])
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
        ctr = self._centre_seat_plane().gather(1, ttc.unsqueeze(1)).squeeze(1)
        city_t = self._seats_hostile(
            aseat.unsqueeze(1), torch.where((ctr >= 0) & (ctr < 100), ctr, neg).unsqueeze(1)).squeeze(1)
        cs_t = torch.zeros_like(att)
        if self.S > 0:
            _cst = torch.zeros(B, self.T, dtype=torch.bool, device=dev)
            _cst.scatter_(1, self.citystate_center[:, :self.S].clamp(min=0), self._citystate_target(row))
            cs_t = _cst.gather(1, ttc.unsqueeze(1)).squeeze(1) & (ctr >= 100)
        city_att = att & city_t
        cs_att = att & ~city_t & cs_t
        rel_city = (self._rel_atk_cs(aseat, tgt).to(atk_base.dtype) if self._city_rel_live
                    else torch.zeros_like(atk_base))

        if bool(city_att.any()):
            hrow = self.tile_seat.gather(1, ttc.unsqueeze(1)).squeeze(1).clamp(min=0, max=self.n_majors - 1)
            slot = self.centre_slot_at.gather(1, ttc.unsqueeze(1)).squeeze(1).clamp(min=0)
            gar = ((mslot >= 0) & (m_seat == hrow)).long()
            def_cs = torch.maximum(self.civ_best_melee[bidx, hrow], torch.full_like(hrow, 15)) + gar * 5
            outer_all = self.city_outer_hp[bidx, hrow, slot]
            pen = self._ranged_city_penalty(at0, outer_all)
            d_city = self._damage_roll(city_att, atk_base + rel_city - pen - def_cs, k="rngrc", tile=tgt)
            self._ww_battle(city_att, self._row_of(aseat), hrow, tgt, city=True)
            rr = city_att.nonzero(as_tuple=True)[0]
            hr, sl = hrow[rr], slot[rr]
            outer = self.city_outer_hp[rr, hr, sl]
            wall, centre = self._city_damage_split(outer, d_city[rr], "ranged")
            self.city_outer_hp[rr, hr, sl] = outer - wall
            self.city_hp[rr, hr, sl] = (self.city_hp[rr, hr, sl] - centre).clamp(min=1)  # ranged never captures
        if bool(cs_att.any()):
            csx = self.citystate_at.gather(1, ttc.unsqueeze(1)).squeeze(1).clamp(min=0)
            mil_idx = int(self.rules.citystate.get("militaristicIdx", -1))
            def_cs = (
                15 + self.citystate_pop.gather(1, csx.unsqueeze(1)).squeeze(1)
                + (self.citystate_type.gather(1, csx.unsqueeze(1)).squeeze(1) == mil_idx).long() * 6
            )
            cs_pen = self._ranged_city_penalty(at0, torch.zeros_like(def_cs))
            d_cs = self._damage_roll(cs_att, atk_base + rel_city - cs_pen - def_cs, k="rngcs", tile=tgt)
            self._ww_battle(cs_att, self._row_of(aseat), self._row_of(100 + csx), tgt, city=True)
            rr = cs_att.nonzero(as_tuple=True)[0]
            self.citystate_hp[rr, csx[rr]] = (self.citystate_hp[rr, csx[rr]] - d_cs[rr]).clamp(min=1)
        unit_att = att & ~city_att & ~cs_att & (ok_m | ok_c)
        if bool(unit_att.any()):
            d_slot = torch.where(ok_m, mslot, torch.where(ok_c, cslot, neg))
            d_seat = torch.where(ok_m, m_seat, torch.where(ok_c, c_seat, neg))
            ds0 = d_slot.clamp(min=0)
            d_barb = d_seat == BARB_SEAT
            d_type = self.unit_type.gather(1, ds0.unsqueeze(1)).squeeze(1)
            def_xp = torch.where(
                ok_m & ~d_barb,
                self._xp_lvl_bonus(self.unit_xp.gather(1, ds0.unsqueeze(1)).squeeze(1)),
                torch.zeros_like(mslot),
            )
            def_cs = (
                self._type_combat[d_type] + self._tdef_g(ttc)
                + self.unit_fortify.gather(1, ds0.unsqueeze(1)).squeeze(1) * 3 + def_xp
            )
            d_emb = self.unit_emb.gather(1, ds0.unsqueeze(1)).squeeze(1) & (d_slot >= 0)
            def_cs = torch.where(d_emb, torch.full_like(def_cs, self._embarked_defense_cs), def_cs)
            def_hp = self.unit_hp.gather(1, ds0.unsqueeze(1)).squeeze(1)
            def_e = def_cs - self._wound(def_hp)
            _, _sp = self._flank_support(tgt, d_seat, torch.full_like(tgt, -1))
            def_e = def_e + SUPPORT_CS * torch.where(d_emb, torch.zeros_like(_sp), _sp)
            atk_e = atk_base + self._rel_atk_cs(aseat, tgt).to(atk_base.dtype)  # unit-vs-unit: never gated
            def_e = def_e + torch.where(
                d_emb, torch.zeros_like(def_e),
                self._rel_def_cs(torch.where(d_barb, neg, d_seat), tgt).to(def_e.dtype))
            def_e = def_e + torch.where(d_emb, torch.zeros_like(def_e), self._cav_hill_cs(d_seat, d_type, ttc).to(def_e.dtype))
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
            self._dig_at(gd, td, self._row_of(self._atk_seat(atk_kind, u)[gd]))  # killUnit's dig
            # Clearing both maps is branch-free and exact: only one of them is
            # set on that tile.
            md = ok_m[gd]
            self.military_at[gd[md], td[md]] = -1
            self.civilian_at[gd[~md], td[~md]] = -1
            self._ww_battle(unit_att, self._row_of(self._atk_seat(atk_kind, u)),
                            self._row_of(d_seat), tgt,
                            d_died=unit_att & (d_slot >= 0) & ((def_hp0 - d_def) <= 0))
            self._naval_kill_event(self._atk_seat(atk_kind, u), d_type, d_barb,
                                   unit_att & (d_slot >= 0) & ((def_hp0 - d_def) <= 0))
            if bool((unit_att & ~ok_m).any()):
                self._gen_ver += 1
            surv = (unit_att & ok_m & ~d_barb).nonzero(as_tuple=True)[0]
            if len(surv) > 0:
                sp = surv[self.unit_hp[surv, d_slot[surv]] > 0]
                if len(sp) > 0:
                    self.unit_xp[sp, d_slot[sp]] += XP_DEFEND
        fired = city_att | cs_att | unit_att
        if SEAT_CAPS[POOL_CLASS[atk_kind]]["xp"]:
            a_xp[:, u] = torch.where(fired, a_xp[:, u] + XP_ATTACK * self._suz_xp_mult(aseat), a_xp[:, u])
        return fired

    def _seat_influence_phase(self, row: int, active: torch.Tensor) -> None:
        """Meet + influence → envoy conversion for ONE seat row — the
        seatPhase CS-diplomacy accrual, one body for every
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
        csc = self.citystate_center[:, :S].clamp(min=0)
        met = self.seat_citystate_met[:, row, :S]
        newly = active.unsqueeze(1) & self.citystate_alive[:, :S] & ~met & self._explored_at(row, csc)
        self.seat_citystate_met[:, row, :S] = met | newly
        met_live = self.seat_citystate_met[:, row, :S] & self.citystate_alive[:, :S]
        any_met = active & met_live.any(dim=1)
        if not bool(any_met.any()):
            return
        civics = self.civ_civics[:, row]
        pt = torch.full((B,), float(rr.get("influencePerTurn", 3)), dtype=torch.float64, device=dev)
        if self._gov_live:
            pt = pt + self._adopted_gov_tier(civics).double()
        self.civ_influence[:, row] = self.civ_influence[:, row] + torch.where(any_met, pt, torch.zeros_like(pt)).to(self.civ_influence.dtype)
        cost = float(rr.get("envoyCost", 100))
        for _ in range(3):
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
        dt = self.city_dist_tile[:, row]
        nCol, nD = dt.shape[1], dt.shape[2]
        di = self._citystate_didx[:, :S].clamp(min=0, max=nD - 1)
        own_tile = dt.unsqueeze(1).expand(B, S, nCol, nD).gather(
            3, di.reshape(B, S, 1, 1).expand(B, S, nCol, 1)
        ).squeeze(3)
        own_dc = self.district_complete.gather(1, own_tile.clamp(min=0).reshape(B, -1)).reshape(B, S, nCol)
        return ((own_tile >= 0) & own_dc).any(dim=2)

    def _seat_quest_phase(self, row: int, active: torch.Tensor) -> None:
        if self.S == 0:
            return
        B, S, dev = self.B, self.S, self.device
        rr = self.rules.citystate
        cooldown = int(rr.get("questCooldown", 12))
        q_env = int(rr.get("questEnvoys", 1))
        csc = self.citystate_center[:, :S].clamp(min=0)
        met_live = self.seat_citystate_met[:, row, :S] & self.citystate_alive[:, :S]
        act = active.unsqueeze(1) & met_live
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
        ).any(dim=2)
        res_camp = act & (cur == 1) & camp_gone
        res_trade = act & (cur == 2) & has_route
        res_dist = act & (cur == 3) & owns_dist
        resolved = res_camp | res_trade | res_dist
        if bool(resolved.any()):
            self.seat_citystate_quest[:, row, :S] = torch.where(resolved, torch.zeros_like(cur), cur)
            # No quest, no target — TS reads campIndex off the LIVE quest
            # object, so a resolved quest must not leave a stale camp here.
            self.seat_citystate_quest_camp[:, row, :S] = torch.where(
                resolved, torch.full_like(cur, -1), self.seat_citystate_quest_camp[:, row, :S])
            self.seat_citystate_quest_issued[:, row, :S] = torch.where(resolved, torch.full_like(cur, self.turn), self.seat_citystate_quest_issued[:, row, :S])
            self.seat_citystate_envoys[:, row, :S] = self.seat_citystate_envoys[:, row, :S] + resolved.long() * q_env
            self._eff_version += 1

        # --- ISSUE on cooldown (deterministic first-satisfiable) ------------
        cur2 = self.seat_citystate_quest[:, row, :S]  # resolved ones now 0
        due = act & (cur2 == 0) & (self.turn - self.seat_citystate_quest_issued[:, row, :S] >= cooldown)  # [B, S]
        if bool(due.any()):
            want_camp = due & has_camp
            want_dist = due & ~has_camp & ~owns_dist
            want_trade = due & ~has_camp & owns_dist & ~has_route
            new_kind = want_camp.long() * 1 + want_dist.long() * 3 + want_trade.long() * 2
            issued = new_kind > 0
            self.seat_citystate_quest[:, row, :S] = torch.where(issued, new_kind, cur2)
            self.seat_citystate_quest_issued[:, row, :S] = torch.where(issued, torch.full_like(cur2, self.turn), self.seat_citystate_quest_issued[:, row, :S])
            self.seat_citystate_quest_camp[:, row, :S] = torch.where(
                want_camp, camp_nearest,
                torch.where(issued, torch.full_like(cur2, -1), self.seat_citystate_quest_camp[:, row, :S]))

    def _city_maritime(self, row: int) -> torch.Tensor:
        """[B, RC] bool — `cityMaritime`. CIV6: "Cities with maritime access are
        those that are adjacent to a body of water connected to the sea, or that
        have a Harbor on such a body."
        """
        ctr = self.city_center[:, row].clamp(min=0)
        out = self.coastal_land.gather(1, ctr)
        if self._harbor_didx >= 0:
            ht = self.city_dist_tile[:, row, :, self._harbor_didx]
            out = out | ((ht >= 0) & self.district_complete.gather(1, ht.clamp(min=0)))
        return out & self.city_alive[:, row]

    def _trade_pair_range(self, row: int, mar_o: torch.Tensor, mar_d: torch.Tensor) -> torch.Tensor:
        """`tradeRouteRange` — 30 tiles when BOTH ends have maritime access and
        the seat can put a Trader on the water, else 15. `mar_o`/`mar_d`
        broadcast to the caller's pair shape."""
        sea = (self._trade_water_level(row) > 0) if row < self.n_majors else torch.zeros(
            self.B, dtype=torch.bool, device=self.device)
        wide = sea.reshape((-1,) + (1,) * (max(mar_o.dim(), mar_d.dim()) - 1)) & mar_o & mar_d
        return torch.where(wide, torch.full_like(wide, self._trade_sea_range, dtype=torch.long),
                           torch.full_like(wide, self._trade_range, dtype=torch.long))

    def _seat_trade_phase(self, row: int, active: torch.Tensor) -> None:
        """The seatPhase trade block, for EVERY seat row: the WALK and PLUNDER
        engine rules, then the wire's route intent (the DECISION lives with
        the policy — `_seat_route_candidate` is what the driver offers it),
        then the round-trip expiry. Expiry ALWAYS runs — TS applies its filter
        outside the intent block, so an at-capacity seat still sheds its
        completing route."""
        self._trade_walk_tick(row, active)
        rv = self._driven_route.pop(row, None)
        if rv is not None:
            frm, dst = rv
            self._apply_route(row, torch.where(active, frm, torch.full_like(frm, -1)), dst)
        self._expire_seat_routes(row)

    def _trade_capacity(self, row: int) -> torch.Tensor:
        """tradeCapacity: FOREIGN_TRADE civic +1, Market-OR-Lighthouse per
        living city +1 (non-cumulative), each COMPLETED Colossus/Great
        Zimbabwe in a city's wonder REGISTRY +1 (`c.wonders`, not a tile
        scan), plus one per trade-type city-state this seat is Suzerain of."""
        B, RC, S, dev = self.B, self.RC, self.S, self.device
        alive = self.city_alive[:, row]
        cap = torch.zeros(B, dtype=torch.long, device=dev)
        if self._trade_ftc >= 0:
            cap = cap + self._seat_civics(row)[:, self._trade_ftc].long()
        bldg = self.city_bldg[:, row]
        mkt = torch.zeros(B, RC, dtype=torch.bool, device=dev)
        if self._trade_mkt >= 0:
            mkt = mkt | bldg[:, :, self._trade_mkt]
        if self._trade_lgh >= 0:
            mkt = mkt | bldg[:, :, self._trade_lgh]
        cap = cap + (mkt & alive).sum(dim=1)
        for wi in self._trade_wonders:
            wt = self.city_wonder[:, row, :, wi]
            cap = cap + ((wt >= 0) & alive & self.built_wonder_complete.gather(1, wt.clamp(min=0))).sum(dim=1)
        if S > 0:
            trade_ti = int(self.rules.citystate.get("tradeIdx", -1))
            cap = cap + (self._suzerain_mask(row)[:, :S] & (self.citystate_type[:, :S] == trade_ti)).sum(dim=1)
        return cap

    def _free_trader(self, row: int) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """The seat's FREE Trader on the LOWEST tile — `freeTrader`'s twin.
        (has [B] bool, major-pool slot [B], tile [B]). The tile is the
        cross-engine key: one civilian per tile makes it unique."""
        al = (
            self.major_unit_alive
            & (self.major_unit_seat == row)
            & (self.major_unit_type == self._trader_idx)
        )
        t = torch.where(al, self.major_unit_tile, torch.full_like(self.major_unit_tile, 1 << 30))
        tile_min, slot = t.min(dim=1)
        return tile_min < (1 << 30), slot, tile_min

    def _route_centres(self, row: int) -> tuple[torch.Tensor, torch.Tensor]:
        """[B, K] (origin centre, dest centre) per route slot, -1 where an
        endpoint no longer names a living city — routeDestCenter plus the
        origin's own lookup, all by PERSISTENT id."""
        B, RC, S, dev = self.B, self.RC, self.S, self.device
        rr = self.seat_routes[:, row]  # [B, K, 2]
        K = rr.shape[1]
        ids = self.city_id[:, row]
        alive = self.city_alive[:, row]
        ctr = self.city_center[:, row]
        arc = torch.arange(RC, device=dev).reshape(1, 1, -1)

        def own_centre(idt: torch.Tensor) -> torch.Tensor:
            m = (idt.unsqueeze(2) == ids.unsqueeze(1)) & alive.unsqueeze(1) & (idt >= 0).unsqueeze(2)
            hit = m.any(dim=2)
            j = (m.long() * arc).sum(dim=2)  # ids unique per row: at most one hit
            return torch.where(hit, ctr.gather(1, j), torch.full_like(idt, -1))

        oc = own_centre(rr[:, :, 0])
        to_id = rr[:, :, 1]
        dc = own_centre(to_id.clamp(min=-1))
        if S > 0:
            csi = (-(to_id + 2)).clamp(min=0, max=S - 1)
            csc = self.citystate_center[:, :S].gather(1, csi.reshape(B, -1)).reshape(B, K)
            dc = torch.where(to_id <= -2, csc, dc)
        rdc = self.seat_route_dcity[:, row]
        if bool((rdc >= 0).any()):
            dr = self.seat_route_dseat[:, row].clamp(min=0)
            RCw = self.city_id.shape[2]
            _rx = dr.unsqueeze(2).expand(B, K, RCw)
            hit = (self.city_id.gather(1, _rx) == rdc.unsqueeze(2)) & self.city_alive.gather(1, _rx)
            _col = hit.long().argmax(dim=2).unsqueeze(2)
            i_ctr = self.city_center.gather(1, _rx).gather(2, _col).squeeze(2)
            dc = torch.where((rdc >= 0) & hit.any(dim=2), i_ctr, dc)
            dc = torch.where((rdc >= 0) & ~hit.any(dim=2), torch.full_like(dc, -1), dc)
        return oc, dc

    def _trade_min_duration(self) -> torch.Tensor:
        """tradeRouteMinDuration: the base term plus the WORLD-era bump
        (+10 per threshold era passed), [B] long."""
        B, dev = self.B, self.device
        we = torch.full((B,), -1, dtype=torch.long, device=dev)
        for r in range(self.n_majors):
            we = torch.maximum(we, self._civ_era(self.civ_techs[:, r], self.civ_civics[:, r]))
        bump = torch.zeros(B, dtype=torch.long, device=dev)
        for be in self._trade_dur_bumps:
            bump = bump + (we >= be).long() * 10
        return self._trade_duration + bump

    def _trade_walk_tick(self, row: int, active: torch.Tensor) -> None:
        """The Trader's WALK, then PLUNDER — phase.ts's trade-block head.

        WALK: every land route's walker takes one descent step toward its leg
        target (dest out, origin home), lays road where it lands, turns
        around at the destination and starts a fresh round trip at home. The
        two legs may descend different lines — the descent is greedy per
        step, not a stored path.

        PLUNDER: a unit hostile to the route's owner standing on the walker's
        tile destroys the route AND its Trader; a MAJOR raider (the lowest
        hostile seat id on a shared tile — the cross-engine tie-break) banks
        the gold. CIV6 (Reform the Coinage, Golden face): "your Traders
        cannot be plundered"."""
        dev = self.device
        act = self.seat_routes[:, row, :, 0] >= 0  # [B, K]
        leg = self.seat_route_leg[:, row]
        walking = act & (leg >= 0) & active.unsqueeze(1)
        if bool(walking.any()):
            oc, dc = self._route_centres(row)
            live = walking & (oc >= 0) & (dc >= 0)
            if bool(live.any()):
                bb, kk = live.nonzero(as_tuple=True)
                cur = self.seat_route_walk[bb, row, kk]
                lg = leg[bb, kk]
                tgt = torch.where(lg == 0, dc[bb, kk], oc[bb, kk])
                wl = self._trade_water_level(row)[bb] if row < self.n_majors else torch.zeros_like(cur)
                nxt = self._trade_walk_step(bb, cur, tgt, wl)
                self.seat_route_walk[bb, row, kk] = nxt
                # roads go on LAND only — a sea leg lays nothing
                moved = (nxt != cur) & self.passable[bb, nxt.clamp(min=0)]
                if bool(moved.any()):
                    self.road[bb[moved], nxt[moved]] = True
                new_leg = torch.where((lg == 0) & (nxt == dc[bb, kk]), torch.ones_like(lg),
                                      torch.where((lg == 1) & (nxt == oc[bb, kk]), torch.zeros_like(lg), lg))
                self.seat_route_leg[bb, row, kk] = new_leg
        wt = self.seat_route_walk[:, row]
        chk = act & (wt >= 0) & active.unsqueeze(1)
        if row < self.n_majors:
            chk = chk & ~self._golden_ded(row, self._ded_coinage).unsqueeze(1)
        if not bool(chk.any()):
            return
        bb, kk = chk.nonzero(as_tuple=True)
        tiles = wt[bb, kk]
        ms = self.military_at[bb, tiles]
        cv = self.civilian_at[bb, tiles]
        s_m = torch.where(ms >= 0, self.unit_seat[bb, ms.clamp(min=0)], torch.full_like(ms, -1))
        s_c = torch.where(cv >= 0, self.unit_seat[bb, cv.clamp(min=0)], torch.full_like(cv, -1))

        def hostile(sp: torch.Tensor) -> torch.Tensor:
            valid = sp >= 0
            barb = sp == BARB_SEAT
            rb = self._seat_row[sp.clamp(min=0)]
            at_war = self.war[bb, row, rb]
            return valid & (sp != row) & (barb | at_war)

        h_m, h_c = hostile(s_m), hostile(s_c)
        big = torch.full_like(s_m, 1 << 30)
        raider = torch.minimum(torch.where(h_m, s_m, big), torch.where(h_c, s_c, big))
        hit = raider < (1 << 30)
        if not bool(hit.any()):
            return
        hb, hk, hr = bb[hit], kk[hit], raider[hit]
        mj = hr < self.n_majors
        if bool(mj.any()):
            self.civ_treasury.index_put_(
                (hb[mj], hr[mj]),
                torch.full((int(mj.sum()),), float(self._trade_plunder_gold), dtype=torch.float64, device=dev),
                accumulate=True,
            )
        self.seat_routes[hb, row, hk] = -1
        self.seat_route_dseat[hb, row, hk] = -1
        self.seat_route_dcity[hb, row, hk] = -1
        self.seat_route_exp[hb, row, hk] = -1
        self.seat_route_born[hb, row, hk] = -1
        self.seat_route_walk[hb, row, hk] = -1
        self.seat_route_leg[hb, row, hk] = -1

    def _free_route_slot(self, rws: torch.Tensor, row: int) -> torch.Tensor:
        K = self.seat_routes.shape[2]
        free = self.seat_routes[rws, row, :, 0] < 0
        s = torch.where(free, torch.arange(K, device=self.device).reshape(1, -1), torch.full((1, K), K, device=self.device)).min(dim=1).values
        assert int(s.max()) < K, "seat_routes columns exhausted — raise K above the capacity bound"
        return s

    def _apply_route(self, row: int, frm: torch.Tensor, dst: torch.Tensor) -> None:
        """Apply the wire's route intent for seat row `row` — [origin CENTRE,
        dest code (a CENTRE tile, or -(2+csIndex))]. Re-validates what canAdd*
        validates — origin resolves, capacity, no duplicate, range, a free
        Trader — then SPENDS the Trader and creates the route: exp = turn +
        the era minimum, born = turn, the walker at the origin, leg 0 on a
        land path (road on the origin) or -1 parked (a sea route)."""
        B, S, dev = self.B, self.S, self.device
        want = frm >= 0
        if not bool(want.any()):
            return
        alive = self.city_alive[:, row]
        ids = self.city_id[:, row]
        centers = self.city_center[:, row]
        rr = self.seat_routes[:, row]
        fm = (centers == frm.unsqueeze(1)) & alive
        has_o = fm.any(dim=1)
        o_j = fm.long().argmax(dim=1)
        used = (rr[:, :, 0] >= 0).sum(dim=1)
        t_has, t_slot, t_tile = self._free_trader(row)
        ok = want & has_o & (used < self._trade_capacity(row)) & t_has
        if not bool(ok.any()):
            return
        o_id = ids.gather(1, o_j.unsqueeze(1)).squeeze(1)
        o_ct = centers.gather(1, o_j.unsqueeze(1)).squeeze(1)
        mar = self._city_maritime(row)
        mar_o = mar.gather(1, o_j.unsqueeze(1)).squeeze(1)
        d = self.pair_dist[o_ct.clamp(min=0), dst.clamp(min=0)].to(torch.long)
        to_code = torch.full((B,), -1, dtype=torch.long, device=dev)
        dseat = torch.full((B,), -1, dtype=torch.long, device=dev)
        dcity = torch.full((B,), -1, dtype=torch.long, device=dev)
        dest_ct = torch.full((B,), -1, dtype=torch.long, device=dev)
        take = torch.zeros(B, dtype=torch.bool, device=dev)
        # DOMESTIC: my alive city with that centre, not the origin
        dm = (centers == dst.unsqueeze(1)) & alive
        dom = ok & (dst >= 0) & (dst != o_ct) & dm.any(dim=1)
        if bool(dom.any()):
            d_j = dm.long().argmax(dim=1)
            d_id = ids.gather(1, d_j.unsqueeze(1)).squeeze(1)
            dup = ((rr[:, :, 0] == o_id.unsqueeze(1)) & (rr[:, :, 1] == d_id.unsqueeze(1))).any(dim=1)
            dom = dom & ~dup & (d <= self._trade_pair_range(row, mar_o, mar.gather(1, d_j.unsqueeze(1)).squeeze(1)))
            to_code = torch.where(dom, d_id, to_code)
            dest_ct = torch.where(dom, dst, dest_ct)
            take = take | dom
        # CITY-STATE: dest code -(2+csIndex); canAddCsTradeRoute's gates
        if S > 0:
            csi = (-(dst + 2)).clamp(min=0, max=S - 1)
            met = self.seat_citystate_met[:, row, :S].gather(1, csi.unsqueeze(1)).squeeze(1)
            csc = self.citystate_center[:, :S].gather(1, csi.unsqueeze(1)).squeeze(1)
            d_cs = self.pair_dist[o_ct.clamp(min=0), csc.clamp(min=0)].to(torch.long)
            dupc = ((rr[:, :, 0] == o_id.unsqueeze(1)) & (rr[:, :, 1] == dst.unsqueeze(1))).any(dim=1)
            mar_cs = self.coastal_land.gather(1, csc.clamp(min=0).unsqueeze(1)).squeeze(1)
            cs_ok = ok & (dst <= -2) & ((-(dst + 2)) < S) & met & ~dupc & (d_cs <= self._trade_pair_range(row, mar_o, mar_cs))
            to_code = torch.where(cs_ok, dst, to_code)
            dest_ct = torch.where(cs_ok, csc, dest_ct)
            take = take | cs_ok
        # INTERNATIONAL: another major's living city with that centre
        intl_p = ok & (dst >= 0) & (dst != o_ct) & ~take
        if bool(intl_p.any()) and self.n_majors > 1:
            for r2 in range(self.n_majors):
                if r2 == row:
                    continue
                m2 = (self.city_center[:, r2] == dst.unsqueeze(1)) & self.city_alive[:, r2]
                hit2 = intl_p & m2.any(dim=1)
                if not bool(hit2.any()):
                    continue
                j2 = m2.long().argmax(dim=1)
                id2 = self.city_id[:, r2].gather(1, j2.unsqueeze(1)).squeeze(1)
                dupi = (
                    (rr[:, :, 0] == o_id.unsqueeze(1))
                    & (self.seat_route_dseat[:, row] == r2)
                    & (self.seat_route_dcity[:, row] == id2.unsqueeze(1))
                ).any(dim=1)
                mar2 = self._city_maritime(r2).gather(1, j2.unsqueeze(1)).squeeze(1)
                hit2 = hit2 & ~dupi & (d <= self._trade_pair_range(row, mar_o, mar2))
                dseat = torch.where(hit2, torch.full_like(dseat, r2), dseat)
                dcity = torch.where(hit2, id2, dcity)
                dest_ct = torch.where(hit2, dst, dest_ct)
                take = take | hit2
                intl_p = intl_p & ~hit2
        if not bool(take.any()):
            return
        rows = take.nonzero(as_tuple=True)[0]
        slot = self._free_route_slot(rows, row)
        self.seat_routes[rows, row, slot, 0] = o_id[rows]
        self.seat_routes[rows, row, slot, 1] = to_code[rows]
        self.seat_route_dseat[rows, row, slot] = dseat[rows]
        self.seat_route_dcity[rows, row, slot] = dcity[rows]
        md = self._trade_min_duration()
        self.seat_route_exp[rows, row, slot] = int(self.turn) + md[rows]
        self.seat_route_born[rows, row, slot] = int(self.turn)
        self.seat_route_walk[rows, row, slot] = o_ct[rows]
        # The walk runs at the seat's own water level: a pure land descent
        # without Celestial Navigation, sea legs with it. Only a pair NO descent
        # reaches parks its Trader at the origin.
        wl = self._trade_water_level(row)[rows]
        walks = self._trade_walk_ok(rows, o_ct[rows], dest_ct[rows], wl)
        self.seat_route_leg[rows, row, slot] = torch.where(walks, torch.zeros_like(slot), torch.full_like(slot, -1))
        lr = rows[walks & self.passable[rows, o_ct[rows]]]
        if len(lr) > 0:
            # the walker lays road on every LAND tile it stands on; the origin is turn 0
            self.road[lr, o_ct[lr]] = True
        # SPEND the Trader
        self.major_unit_alive[rows, t_slot[rows]] = False
        self.civilian_at[rows, t_tile[rows]] = -1

    def _cancel_routes_pair(self, i: int, j: int, mask: torch.Tensor) -> None:
        """cancelRoutesBetween's twin — a DECLARED war cancels every route
        between the pair, both directions; each hands its Trader back at the
        origin (a cancel is not a plunder — the unit survives)."""
        for a, b in ((i, j), (j, i)):
            kill = (self.seat_routes[:, a, :, 0] >= 0) & (self.seat_route_dseat[:, a] == b) & mask.unsqueeze(1)
            if not bool(kill.any()):
                continue
            oc, _dc = self._route_centres(a)
            K = self.seat_routes.shape[2]
            for k in range(K):
                m = kill[:, k] & (oc[:, k] >= 0)
                if bool(m.any()):
                    self._spawn_unit(a, m, oc[:, k].clamp(min=0), self._trader_idx)
            self.seat_routes[:, a][kill] = -1
            self.seat_route_dseat[:, a][kill] = -1
            self.seat_route_dcity[:, a][kill] = -1
            self.seat_route_exp[:, a][kill] = -1
            self.seat_route_born[:, a][kill] = -1
            self.seat_route_walk[:, a][kill] = -1
            self.seat_route_leg[:, a][kill] = -1

    def _seat_route_candidate(self, row: int) -> tuple[torch.Tensor, torch.Tensor]:
        """The route CANDIDATE this seat would take — routeCandidateRow's
        twin: [B] origin CENTRE and [B] dest code (a CENTRE tile, or
        -(2+csIndex)); -1/-1 where none.

        The scan is the old eager rule's, verbatim: for each origin city in
        ARRAY order, its own cities (array order) then the MET city-states
        (index order); the best NEW in-range destination by the route's TOTAL
        yields — domestic 2 + 2*floor(specialtyDistricts(dest)/2), a
        city-state's flat gold+specialty — with strictly-greater-beats
        semantics, so ties keep the FIRST pair in that flat scan order. Only
        when NO domestic or city-state candidate exists does the scan reach
        INTERNATIONAL destinations: any OTHER major's city whose centre this
        seat has EXPLORED, nearest first, ties by the same from-asc /
        seat-asc / city-asc order. Gated on capacity AND a free Trader — the
        unit the verb spends. Slot order IS TS array order for every row."""
        B, RC, S, dev = self.B, self.RC, self.S, self.device
        neg = torch.full((B,), -1, dtype=torch.long, device=dev)
        alive = self.city_alive[:, row]  # [B, RC]
        rr = self.seat_routes[:, row]  # [B, K, 2]
        want = alive.sum(dim=1) >= 1
        used = (rr[:, :, 0] >= 0).sum(dim=1)
        want = want & (used < self._trade_capacity(row)) & self._free_trader(row)[0]
        if not bool(want.any()):
            return neg, neg
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
        ).any(dim=3)
        eye = torch.eye(RC, dtype=torch.bool, device=dev).reshape(1, RC, RC)
        mar = self._city_maritime(row)  # [B, RC]
        valid = (
            alive.unsqueeze(2)
            & alive.unsqueeze(1)
            & ~eye
            & (d <= self._trade_pair_range(row, mar.unsqueeze(2), mar.unsqueeze(1)))
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
            ).any(dim=3)
            valid_cs = (
                alive.unsqueeze(2)
                & (self.seat_citystate_met[:, row, :S] & self.citystate_alive[:, :S]).unsqueeze(1)
                & (d_cs <= self._trade_pair_range(
                    row, mar.unsqueeze(2),
                    self.coastal_land.gather(1, csc).unsqueeze(1)))
                & ~exists_cs
                & want.reshape(B, 1, 1)
            )
            key_cs = torch.where(valid_cs, torch.full((B, RC, S), ysum_cs, dtype=torch.long, device=dev), torch.full((B, RC, S), -1, dtype=torch.long, device=dev))
            key = torch.cat([key, key_cs], dim=2)
            W2 = RC + S
        kf = key.reshape(B, RC * W2)  # i-major flat order = the TS from-asc, dests-then-CS scan
        kmax, _ = kf.max(dim=1)
        first = torch.where(kf == kmax.unsqueeze(1), torch.arange(RC * W2, device=dev).reshape(1, -1), torch.full((1, RC * W2), RC * W2, device=dev)).min(dim=1).values
        frm_c = neg.clone()
        dest_c = neg.clone()
        do = want & (kmax >= 0)
        if bool(do.any()):
            rows = do.nonzero(as_tuple=True)[0]
            i_pick = first[rows] // W2
            jj = first[rows] % W2
            frm_c[rows] = centers[rows, i_pick]
            dest_c[rows] = torch.where(jj < RC, centers[rows, jj.clamp(max=RC - 1)], -(2 + (jj - RC)))
        # international: rows that WANT a route but found no domestic/CS
        # candidate consider ANY OTHER MAJOR's city whose centre this seat has
        # EXPLORED, NEAREST first (ties keep from-asc, then the block-row scan
        # order, which IS `state.seats` order).
        intl_want = want & (kmax < 0)
        dctr_l, dalv_l, did_l, drow_l, dmar_l = [], [], [], [], []
        for r2 in range(self.n_majors):
            if r2 == row:
                continue
            dctr_l.append(self.city_center[:, r2].clamp(min=0))
            dalv_l.append(self.city_alive[:, r2])
            did_l.append(self.city_id[:, r2])
            drow_l.append(torch.full_like(self.city_id[:, r2], r2))
            dmar_l.append(self._city_maritime(r2))
        if bool(intl_want.any()) and dctr_l:
            dctr = torch.cat(dctr_l, dim=1)  # [B, D] dest centre tiles
            dalv = torch.cat(dalv_l, dim=1)  # [B, D]
            did = torch.cat(did_l, dim=1)    # [B, D] dest city id
            drow = torch.cat(drow_l, dim=1)  # [B, D] dest seat row
            dmar = torch.cat(dmar_l, dim=1)  # [B, D] dest maritime access
            D = dctr.shape[1]
            d_ip = self.pair_dist[centers.unsqueeze(2), dctr.unsqueeze(1)]  # [B, RC, D]
            rds = self.seat_route_dseat[:, row]  # [B, K]
            rdc = self.seat_route_dcity[:, row]  # [B, K]
            act2 = rr[:, :, 0] >= 0  # [B, K]
            # already-connected: an ACTIVE intl route from slot i to that
            # (seat, city) — TS's `x.toSeat === other.seat && x.toSeatCity === pc.id`.
            exists_ip = (
                (rr[:, :, 0].reshape(B, 1, 1, -1) == ids.reshape(B, RC, 1, 1))
                & (rdc.reshape(B, 1, 1, -1) >= 0)
                & (rdc.reshape(B, 1, 1, -1) == did.reshape(B, 1, D, 1))
                & (rds.reshape(B, 1, 1, -1) == drow.reshape(B, 1, D, 1))
                & act2.reshape(B, 1, 1, -1)
            ).any(dim=3)  # [B, RC, D]
            valid_ip = (
                alive.unsqueeze(2)
                & dalv.unsqueeze(1)
                & self._explored_at(row, dctr).unsqueeze(1)
                & (d_ip <= self._trade_pair_range(row, mar.unsqueeze(2), dmar.unsqueeze(1)))
                & ~exists_ip
                & intl_want.reshape(B, 1, 1)
            )
            BIG = 1 << 30
            dkey = torch.where(valid_ip, d_ip.long(), torch.full((B, RC, D), BIG, dtype=torch.long, device=dev))
            df = dkey.reshape(B, RC * D)
            dmin, _ = df.min(dim=1)
            firsti = torch.where(df == dmin.unsqueeze(1), torch.arange(RC * D, device=dev).reshape(1, -1), torch.full((1, RC * D), RC * D, device=dev)).min(dim=1).values
            doi = intl_want & (dmin < BIG)
            if bool(doi.any()):
                rows = doi.nonzero(as_tuple=True)[0]
                i_pick = firsti[rows] // D
                c_pick = firsti[rows] % D
                frm_c[rows] = centers[rows, i_pick]
                dest_c[rows] = dctr[rows, c_pick]
        return frm_c, dest_c

    def _expire_seat_routes(self, row: int) -> None:
        """End seat row `row`'s routes. COMPLETION is the minimum term (exp)
        having arrived WITH the Trader home — the round-trip rule; a parked
        sea walker (leg -1) is always home, a stuck one ends at the walk
        rail. A completed or destination-dead route hands its Trader back at
        the origin (only plunder destroys the unit); only COMPLETION scores
        Coinage. An international destination dies when its (seat, city id)
        stops naming a living city — a capture mints the flipped city a fresh
        id under the CAPTOR's seat, so both halves stop matching."""
        act = self.seat_routes[:, row, :, 0] >= 0
        exp = self.seat_route_exp[:, row]
        leg = self.seat_route_leg[:, row]
        wt = self.seat_route_walk[:, row]
        oc, _dc = self._route_centres(row)
        term = act & (exp >= 0) & (exp <= int(self.turn))
        home = (leg < 0) | ((oc >= 0) & (wt == oc))
        rail = (exp >= 0) & (exp + self._trade_walk_rail <= int(self.turn))
        completed = term & (home | rail)
        # CIV6 (Reform the Coinage, dark face): "+1 Era Score each time you
        # successfully complete a Trade Route" — the term running out with the
        # round trip done, never a route cut short.
        if row < self.n_majors:
            self._dedication_event(row, self._ded_coinage, completed.sum(dim=1))
        dst, dc2 = self._route_dest_alive(row)
        dest_gone = act & (dc2 >= 0) & ~dst
        drop = completed | dest_gone
        if bool(drop.any()):
            if row < self.n_majors:
                # ended routes hand their Traders back at the origin, in slot
                # order (TS array order) — the spot search fills outward when
                # the centre is taken.
                K = self.seat_routes.shape[2]
                for k in range(K):
                    m = drop[:, k] & (oc[:, k] >= 0)
                    if bool(m.any()):
                        self._spawn_unit(row, m, oc[:, k].clamp(min=0), self._trader_idx)
            self.seat_routes[:, row][drop] = -1
            self.seat_route_dseat[:, row][drop] = -1
            self.seat_route_dcity[:, row][drop] = -1
            self.seat_route_exp[:, row][drop] = -1
            self.seat_route_born[:, row][drop] = -1
            self.seat_route_walk[:, row][drop] = -1
            self.seat_route_leg[:, row][drop] = -1

    def _route_dest_alive(self, row: int) -> tuple[torch.Tensor, torch.Tensor]:
        """For each of seat row `row`'s route slots: does its INTERNATIONAL
        destination still exist? Returns (alive [B, K], dest city id [B, K],
        -1 where the leg is domestic or city-state). The `.cities.find(c => c.id
        === toSeatCity)` twin — the id is matched inside the STORED seat's own
        block, because ids are only unique within a seat."""
        dc = self.seat_route_dcity[:, row]  # [B, K]
        ds = self.seat_route_dseat[:, row].clamp(min=0)
        _rx = ds.unsqueeze(2).expand(self.B, dc.shape[1], self.city_id.shape[2])
        hit = (self.city_id.gather(1, _rx) == dc.unsqueeze(2)) & self.city_alive.gather(1, _rx)
        return hit.any(dim=2) & (dc >= 0), dc

    def _seat_strengths(self) -> torch.Tensor:
        B, dev = self.B, self.device
        nrow = self.n_majors
        n_c = self.city_alive[:, :nrow].sum(dim=2)
        rstr = torch.zeros(B, nrow, dtype=torch.float64, device=dev)
        vt = self.major_unit_type.clamp(min=0, max=self.NU - 1)
        for row in range(nrow):
            combat = ((self.major_unit_alive & (self.major_unit_seat == row)).long() * self._type_combat[vt]).sum(dim=1)
            rstr[:, row] = js_round(n_c[:, row].double() * 8 + combat.double())
        return rstr

    def _seat_proximity(self, a: int, b: int) -> torch.Tensor:
        B = self.B
        d_ab = self.pair_dist[
            self.city_center[:, a].clamp(min=0).unsqueeze(2), self.city_center[:, b].clamp(min=0).unsqueeze(1)
        ].to(torch.long)
        pair_ok = self.city_alive[:, a].unsqueeze(2) & self.city_alive[:, b].unsqueeze(1)
        return torch.where(pair_ok, d_ab, 999).reshape(B, -1).min(dim=1).values

    def apply_geo(self, row: int, denounce: torch.Tensor | None = None,
                  ally: torch.Tensor | None = None) -> None:
        if denounce is not None:
            if getattr(self, "_driven_denounce", None) is None:
                self._driven_denounce = {}
            self._driven_denounce[row] = denounce
        if ally is not None:
            if getattr(self, "_driven_ally", None) is None:
                self._driven_ally = {}
            self._driven_ally[row] = ally

    def _geo_denounce_and_ally(self) -> None:
        dstash = getattr(self, "_driven_denounce", None)
        astash = getattr(self, "_driven_ally", None)
        if not dstash and not astash:
            return
        nrow = self.n_majors
        n_c = self.city_alive[:, :nrow].sum(dim=2)
        alive_row = self.civ_alive[:, :nrow] & (n_c > 0)
        if dstash:
            for a in sorted(dstash.keys()):
                want = dstash.pop(a)
                for b in range(nrow):
                    if b == a or not bool(want[:, b].any()):
                        continue
                    den = (
                        want[:, b] & alive_row[:, a] & alive_row[:, b]
                        & (self.seat_denounced[:, a, b] < 0) & ~self.war[:, a, b]
                    )
                    if bool(den.any()):
                        self.seat_denounced[:, a, b] = torch.where(
                            den, torch.full_like(self.seat_denounced[:, a, b], int(self.turn)), self.seat_denounced[:, a, b]
                        )
                        self.seat_allied[:, a, b] = self.seat_allied[:, a, b] & ~den
                        self.seat_allied[:, b, a] = self.seat_allied[:, b, a] & ~den
        if astash:
            era_open = int(self.turn) >= self._ally_min_peace
            for a in sorted(astash.keys()):
                want = astash.pop(a)
                if not era_open:
                    continue
                for b in range(nrow):
                    if b == a or not bool(want[:, b].any()):
                        continue
                    form = (
                        want[:, b] & alive_row[:, a] & alive_row[:, b]
                        & ~self.war[:, a, b] & ~self.seat_allied[:, a, b]
                        & (self.seat_denounced[:, a, b] < 0) & (self.seat_denounced[:, b, a] < 0)
                        & (self.civ_warmonger[:, a] <= 0) & (self.civ_warmonger[:, b] <= 0)
                    )
                    if bool(form.any()):
                        self.seat_allied[:, a, b] = self.seat_allied[:, a, b] | form
                        self.seat_allied[:, b, a] = self.seat_allied[:, b, a] | form

