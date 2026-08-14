"""Legality masks, boosts, the RNG, damage, spawning, unit observations.

One mixin of BatchSim (assembled in engine.py); state and helpers live on
self / gpu/core/simbase.py.
"""
from __future__ import annotations

from .simbase import *  # noqa: F401,F403 — torch, constants, helpers
from .simbase import _MUTABLE  # noqa: F401 — private names do not ride a star import
from . import simbase  # the PATCHABLE globals (POOL_MAX/SEAT0_POOL_MAX/_ALIAS_CHECK) must be read live


class SimMasks:
    def production_mask(self) -> torch.Tensor:
        """[B, C, NB+2+NU+nScaffold(+NB+1+NU)] valid production actions for idle
        cities: columns 0..NB-1 = City Center buildings, NB = settler (any city,
        as queueSettler and seat_masks are), NB+1 = idle, NB+2..NB+1+NU = train
        that roster unit (tech-gated like trainableUnits), NB+2+NU.. = place
        that scaffold district (capital-only, off-script; all-False unless
        _rl_district_active). With _rl_purchase_active the mask WIDENS by
        NB+1+NU gold-purchase columns (buy building / settler / unit at
        gold_purchase_mult× cost); while off, those columns do not exist and the
        head keeps its narrower width. All-False where no decision pends."""
        B, C, dev = self.B, self.C, self.device
        pend = self.alive & (self.current == -1)
        always = torch.ones(B, C, 2, dtype=torch.bool, device=dev)
        cols = [self._buildable(), always]
        if self.units_mode:
            unit_ok = (self._type_tech.unsqueeze(0) < 0) | self.techs.gather(
                1, self._type_tech.clamp(min=0).unsqueeze(0).expand(B, -1)
            )
            unit_ok = unit_ok & self._res_avail_mask(self.tile_seat == 0)  # strategic-resource gate
            unit_ok = unit_ok & ~self._type_faith_only.reshape(1, -1)  # trainableUnits' faithOnly filter (MISSIONARY never queues)
            unit_ok = unit_ok & ~self._type_spawn_only.reshape(1, -1)  # spawn-only filter (GENERAL/ADMIRAL never queue)
            # The Archaeologist's civic + artifact-slot gates. The slot rule is
            # PER-CITY, so it joins after the [B, NU] -> [B, C, NU] expansion
            # rather than collapsing unit_ok's rank early.
            unit_col = unit_ok.unsqueeze(1).expand(-1, C, -1) & self._type_civic_slot_ok(True)
            if bool(self.unit_naval.any()):
                # DEBT: this mask withholds every naval column for seat 0, and
                # the civ mask hand-rolls a single capped galley column — while
                # TS trainableUnits offers ALL naval hulls to EVERY seat, gated
                # only on cityNavalCapable (coastal centre or Harbor). The
                # exclusion lives only in this mask (the decider never sees the
                # columns), so the gate cannot observe the mismatch.
                unit_col = unit_col & ~self.unit_naval.reshape(1, 1, -1)
            cols.append(unit_col)
        else:
            cols.append(torch.zeros(B, C, self.NU, dtype=torch.bool, device=dev))
        nS = len(self._scaffold)
        if nS:
            dcols = torch.zeros(B, C, nS, dtype=torch.bool, device=dev)
            if self._rl_district_active:  # capital (or any city if _rl_any_city) places districts off-script
                ar = torch.arange(B, device=dev)
                spec_tile = (self.district >= 0) & self._is_specialty[self.district.clamp(min=0)] & ~self.district_dead  # [B,T] LIVE specialty district tiles
                cc = self._adj_center_count()  # [B,T] adjacent CITY_CENTERs (global) — Aqueduct requires, Encampment forbids
                for c in range(C if self._rl_any_city else 1):
                    site_c = self.site[:, c].clamp(min=0)
                    near_c = self.pair_dist[site_c] <= 3  # [B, T] hex distance from THIS city's centre
                    cap_c = torch.div(self.pop[:, c] - 1, 3, rounding_mode="floor") + 1  # maxSpecialtyDistricts(pop_c)
                    under_cap = (spec_tile & (self.owner == c)).sum(dim=1) < cap_c  # only specialty districts count
                    base = (self.owner == c) & self.d_usable & (self.district < 0) & (self.built_wonder < 0) & (self.improvement < 0) & (self.res_priority <= 1) & near_c
                    base[ar, site_c] = False
                    cbase = (self.owner == c) & self.coastal_water & (self.district < 0) & (self.built_wonder < 0) & (self.improvement < 0) & (self.res_priority <= 1) & near_c
                    cbase[ar, site_c] = False
                    has_land = base.any(dim=1)  # [B]
                    has_aq = (base & (cc >= 1) & self.aqsrc).any(dim=1)  # [B] adjacent center + water source
                    has_coastal = cbase.any(dim=1)  # [B] a coastal-water tile (Harbor)
                    has_enc = (base & (cc == 0)).any(dim=1)  # [B] a land tile NOT adjacent to any center (Encampment)
                    for si, (di, utech, uciv, plc) in enumerate(self._scaffold):
                        has_tech = self.techs[:, utech] if utech >= 0 else (self.civics[:, uciv] if uciv >= 0 else torch.ones(B, dtype=torch.bool, device=dev))  # kind-aware
                        not_owned = ~((self.district == di) & (self.owner == c) & ~self.district_dead).any(dim=1)  # one-per-type (LIVE)
                        if plc == 1:  # Aqueduct: non-specialty (no cap), aqueduct-eligible tile
                            dcols[:, c, si] = has_tech & has_aq & not_owned
                        elif plc == 2:  # Harbor: specialty (cap), coastal-water tile
                            dcols[:, c, si] = has_tech & under_cap & has_coastal & not_owned
                        elif plc == 3:  # Encampment: specialty (cap), not adjacent to the center
                            dcols[:, c, si] = has_tech & under_cap & has_enc & not_owned
                        else:
                            dcols[:, c, si] = has_tech & under_cap & has_land & not_owned
            cols.append(dcols)
        if self._rl_purchase_active:
            # Purchases. Eligibility mirrors the TS functions at a pending
            # decision (queue empty, so availableBuildings ∧ buildingCompletable
            # collapses to _buildable): building = _buildable & gold; settler =
            # gold at the live settlerCost; unit = trainableUnits & gold. Gold is
            # OPTIMISTIC here and RE-validated at apply in slot order (earlier
            # slots' purchases drain the shared treasury and a bought settler
            # raises the next slot's price); a unit also needs a free spawn tile
            # there — TS refunds when spawnUnit finds none.
            mult = self.rules.gold_purchase_mult
            tre = self.treasury
            # Worship buildings are admitted and priced in FAITH at the flat
            # worship cost — `purchaseBuilding` splits on
            # `BUILDINGS[id].worship`, gold otherwise.
            _pbuy = self._buildable(include_worship=True)
            _w = self._b_worship.reshape(1, 1, -1)
            _gold_ok = self._afford(tre.reshape(B, 1, 1), self.rules_dev.b_cost.reshape(1, 1, -1) * mult)
            _faith_ok = self._afford(self.faith.reshape(B, 1, 1),
                                     torch.full((1, 1, self.NB), self._worship_cost,
                                                dtype=self.dtype, device=dev))
            pb = _pbuy & torch.where(_w, _faith_ok, _gold_ok)
            n_cities = self.alive.sum(dim=1, keepdim=True)
            queued_s = (self.current == self.SETTLER).sum(dim=1, keepdim=True)
            s_cost = self.rules.settler_base + self.rules.settler_per_city * (
                n_cities - 1 + self._seat0_settlers().unsqueeze(1) + queued_s
            ).clamp(min=0).to(self.dtype)
            ps = self._afford(tre.unsqueeze(1), s_cost * mult).unsqueeze(2).expand(B, C, 1)
            if self.units_mode:
                u_ok = (self._type_tech.unsqueeze(0) < 0) | self.techs.gather(
                    1, self._type_tech.clamp(min=0).unsqueeze(0).expand(B, -1)
                )
                u_ok = u_ok & self._type_civic_slot_ok(False)  # civic gate
                u_ok = u_ok & self._res_avail_mask(self.tile_seat == 0)  # strategic-resource gate (purchase)
                u_ok = u_ok & ~self._type_faith_only.reshape(1, -1)  # faith-only never gold-buys (trainableUnits mirror)
                u_ok = u_ok & ~self._type_spawn_only.reshape(1, -1)  # spawn-only never gold-buys (trainableUnits mirror)
                u_cost = self._type_cost.unsqueeze(0).expand(B, -1)
                if self._builder_idx >= 0:
                    # the builder column prices off the live escalator, like TS
                    # unitPurchaseCost at mask time.
                    u_cost = u_cost.clone()
                    u_cost[:, self._builder_idx] = self._builder_cost(self.builders_trained)  # ALREADY PRODUCED only — a queued item has produced nothing
                pu = (u_ok & self._afford(tre.unsqueeze(1), u_cost * mult)).unsqueeze(1).expand(-1, C, -1)
                if bool(self.unit_naval.any()):
                    pu = pu & ~self.unit_naval.reshape(1, 1, -1)  # DEBT: mask-only naval ban; TS purchaseUnit is capability-gated for every seat
            else:
                pu = torch.zeros(B, C, self.NU, dtype=torch.bool, device=dev)
            cols.append(torch.cat([pb, ps, pu], dim=2))
        return torch.cat(cols, dim=2) & pend.unsqueeze(2)

    def tech_mask(self) -> torch.Tensor:
        """[B, NT] valid research picks; all-False where research is busy."""
        return self._available_mask(self.techs, self._prereq_t) & (self.cur_tech == -1).unsqueeze(1)

    def civic_mask(self) -> torch.Tensor:
        """[B, NC] valid civic picks; all-False where the slot is busy."""
        return self._available_mask(self.civics, self._prereq_c) & (self.cur_civic == -1).unsqueeze(1)

    def envoy_mask(self) -> torch.Tensor:
        """[B, S] city-states an available envoy could back right now."""
        return self.citystate_alive & self.citystate_met & (self.envoys_avail > 0).unsqueeze(1)

    def war_mask(self) -> torch.Tensor:
        """[B, 2R] seat-0 diplomacy actions: columns 0..R-1 declare war on that
        civ (declareWar: alive & not already at war — free, no RNG), R..2R-1
        sue for peace (sueForPeace: at war for >= warMinTurns and treasury
        covers peaceGold0 + peaceGoldSlope·warTurns). All-False while
        _rl_war_active is off — the head exists but nothing samples it."""
        B, dev = self.B, self.device
        R = max(self.R, 1)
        if self.R == 0 or not self._rl_war_active:
            return torch.zeros(B, 2 * R, dtype=torch.bool, device=dev)
        rr = self.rules.seats
        declare = self.civ_only_alive & ~self.civ_only_atwar
        cost = rr.get("peaceGold0", 150) + rr.get("peaceGoldSlope", 10) * self.civ_only_warturns.to(self.dtype)
        peace = (
            self.civ_only_alive
            & self.civ_only_atwar
            & (self.civ_only_warturns >= rr.get("warMinTurns", 14))  # ONE min-war-turns rule, every seat
            & self._afford(self.treasury.unsqueeze(1), cost)
        )
        return torch.cat([declare, peace], dim=1)

    # --- eureka detection --------------------------------------------------------

    def _detect_boosts(self, active0: torch.Tensor | None = None) -> None:
        """Mirrors detectBoosts from seat 0's seat: flag every satisfied,
        unresearched, un-boosted condition. Runs at row 0's block top in the
        seatPhase loop (the position every seat shares); `active0` is the TS
        loop's eliminated-actor continue — a cityless seat 0 detects
        nothing."""
        pop_sum = None
        for row in self.rules.boosts:
            kind = row["kind"]
            if kind == "building":
                # detectBoosts counts buildings in LIVE cities only (it iterates
                # state.cities). A razed/lost city leaves a dead slot whose stale
                # buildings must NOT count — mask by self.alive or a leftover
                # Market inflates e.g. the GUILDS "build 2 Markets" inspiration.
                pred = (self.buildings[:, :, row["b"]].bool() & self.alive).sum(dim=1) >= row["count"]
            elif kind == "cityPop":
                pred = ((self.pop >= row["pop"]) & self.alive).any(dim=1)
            elif kind == "totalPop":
                if pop_sum is None:
                    pop_sum = (self.pop * self.alive.to(self.pop.dtype)).sum(dim=1)
                pred = pop_sum >= row["pop"]
            elif kind == "coastalCity":
                # isCoastalLand at each live centre, read off the static tile
                # plane (`site` is -1 on a dead slot, which `alive` masks out).
                pred = (self.alive & self.coastal_land.gather(1, self.site.clamp(min=0))).any(dim=1)
            elif kind == "cities":
                pred = self.alive.sum(dim=1) >= row["count"]
            elif kind == "greatPeople":
                pred = (self.gp_earned.sum(dim=1) if row["cls"] < 0 else self.gp_earned[:, row["cls"]]) >= row["count"]
            elif kind == "tech":
                pred = self.techs[:, row["t"]]
            elif kind == "anyWonderBuilt":
                pred = self.built_wonder_complete.any(dim=1)  # global scan, every seat
            elif kind == "nearNaturalWonder":
                pred = ((self.tile_seat == 0) & self.wonder_near).any(dim=1)
            elif kind == "improvement":
                # count tiles with this improvement (on a resource, if the
                # condition requires it) — pillaged still counts, like
                # detectBoosts. Only FARM is buildable in covered scope.
                on = self.improvement == row["imp"]
                if row.get("onResource"):
                    on = on & (self.res_priority > 0)
                pred = on.sum(dim=1) >= row["count"]
            elif kind == "district":
                # completed districts of a type (dtype>=0) or any specialty
                # (dtype<0). Only specialty districts live in self.district (>=0).
                dtype = row.get("dtype", -1)
                if dtype < 0:
                    # boosts.ts: with no check.type, only districts that COUNT
                    # TOWARD THE LIMIT qualify (specialty) — aqueducts/neighborhoods
                    # and other support districts are excluded. A specific dtype
                    # counts regardless (matching check.type).
                    dsel = (self.district >= 0) & self._is_specialty[self.district.clamp(min=0)]
                else:
                    dsel = self.district == dtype
                on = dsel & self.district_complete & (self.tile_seat == 0) & ~self.district_dead  # seat 0's eurekas count seat 0's live districts
                if row.get("distinct"):
                    # CIVIL_ENGINEERING: count DISTINCT types, not instances.
                    _cntt = torch.zeros(self.B, len(self.districts_cat), dtype=torch.long, device=self.device)
                    _cntt.scatter_add_(1, self.district.clamp(min=0), on.long())
                    pred = (_cntt > 0).sum(dim=1) >= row["count"]
                else:
                    pred = on.sum(dim=1) >= row["count"]
            elif kind == "policies":
                # "run N policy cards" (MEDIEVAL_FAIRES, count 4). checkSatisfied
                # counts non-null state.government.policies entries = the seat's
                # slotted-policy count. Gated on _gov_has_effects (no adoption
                # => empty government.policies => 0).
                if self._gov_has_effects and self._npol:
                    slotted = self._gov_policy_mods_cached("seat0", self.civics)[4]
                    pred = slotted.sum(dim=1) >= row["count"]
                else:
                    pred = torch.zeros(self.B, dtype=torch.bool, device=self.device)
            else:
                continue
            if active0 is not None:
                pred = pred & active0
            if row["target"] == "tech":
                # FREE INQUIRY pays era score per EUREKA — fire only on the rows
                # where the boost NEWLY lands (the TS `newly` twin).
                _new_t = pred & ~self.techs[:, row["idx"]] & ~self.tech_boosted[:, row["idx"]]
                self.tech_boosted[:, row["idx"]] |= pred & ~self.techs[:, row["idx"]]
                self._dedication_event(0, 1, _new_t)
            else:
                # PEN BRUSH AND VOICE pays era score per INSPIRATION.
                _new_c = pred & ~self.civics[:, row["idx"]] & ~self.civic_boosted[:, row["idx"]]
                self.civic_boosted[:, row["idx"]] |= pred & ~self.civics[:, row["idx"]]
                self._dedication_event(0, 2, _new_c)

    def _detect_seat_boosts(self, r: int, active: torch.Tensor) -> None:
        """detectBoosts from civ r's seat: the same condition rows read that
        civ's cities/research/territory, while the map-global rows (improvement
        counts, the shared GP pool) read the same global state every seat's
        check does, so one formula serves every seat. Runs at the civ's block
        top; policy rows aren't exported."""
        alive = self.civ_city_alive[:, r]
        pop_sum = None
        for row in self.rules.boosts:
            kind = row["kind"]
            if kind == "building":
                pred = (self.civ_city_bldg[:, r, :, row["b"]] & alive).sum(dim=1) >= row["count"]
            elif kind == "cityPop":
                pred = ((self.civ_city_pop[:, r] >= row["pop"]) & alive).any(dim=1)
            elif kind == "totalPop":
                if pop_sum is None:
                    pop_sum = (self.civ_city_pop[:, r] * alive.to(self.civ_city_pop.dtype)).sum(dim=1)
                pred = pop_sum >= row["pop"]
            elif kind == "coastalCity":
                pred = (alive & self.coastal_land.gather(1, self.civ_city_center[:, r].clamp(min=0))).any(dim=1)
            elif kind == "cities":
                pred = alive.sum(dim=1) >= row["count"]
            elif kind == "greatPeople":
                pred = (self.gp_earned.sum(dim=1) if row["cls"] < 0 else self.gp_earned[:, row["cls"]]) >= row["count"]
            elif kind == "tech":
                pred = self.civ_only_techs[:, r, row["t"]]
            elif kind == "anyWonderBuilt":
                pred = self.built_wonder_complete.any(dim=1)  # the same global scan
            elif kind == "nearNaturalWonder":
                pred = ((self.civ_at == r) & self.wonder_near).any(dim=1)
            elif kind == "improvement":
                # global tile scan — TS scans state.map.tiles with no owner
                # filter, so every seat runs one formula
                on = self.improvement == row["imp"]
                if row.get("onResource"):
                    on = on & (self.res_priority > 0)
                pred = on.sum(dim=1) >= row["count"]
            elif kind == "district":
                dtype = row.get("dtype", -1)
                dt = self.civ_city_dist_tile[:, r]  # [B, RC, nD] registry tiles
                comp = self.district_complete.gather(1, dt.clamp(min=0).reshape(self.B, -1)).reshape_as(dt)
                on = (dt >= 0) & comp & alive.unsqueeze(2)
                if dtype < 0:
                    if row.get("distinct"):
                        # CIVIL_ENGINEERING: distinct specialty TYPES across cities.
                        pred = (on.any(dim=1) & self._is_specialty.reshape(1, -1)).sum(dim=1) >= row["count"]
                    else:
                        pred = (on & self._is_specialty.reshape(1, 1, -1)).sum(dim=(1, 2)) >= row["count"]
                else:
                    pred = on[:, :, dtype].sum(dim=1) >= row["count"]
            else:
                continue
            hit = active & pred
            if row["target"] == "tech":
                _new_rt = hit & ~self.civ_only_techs[:, r, row["idx"]] & ~self.civ_only_tech_boosted[:, r, row["idx"]]
                self.civ_only_tech_boosted[:, r, row["idx"]] |= hit & ~self.civ_only_techs[:, r, row["idx"]]
                self._dedication_event(r + 1, 1, _new_rt)  # civ EUREKA
            else:
                _new_rc = hit & ~self.civ_only_civics[:, r, row["idx"]] & ~self.civ_only_civic_boosted[:, r, row["idx"]]
                self.civ_only_civic_boosted[:, r, row["idx"]] |= hit & ~self.civ_only_civics[:, r, row["idx"]]
                self._dedication_event(r + 1, 2, _new_rc)  # civ INSPIRATION

    # --- barbarians (phase 4a) ----------------------------------------------------

    def _next_random(self, mask: torch.Tensor) -> torch.Tensor:
        """Mirrors nextRandom (mulberry32 on state.rngState): advances the
        u32 state ONLY where mask, returns [B] float64 draws (garbage
        elsewhere). All arithmetic runs on u32-in-int64; int64 wrap-around
        preserves values mod 2^32, so masking after each op is exact."""
        a = (self.rng_state + 0x6D2B79F5) & M32
        t = ((a ^ (a >> 15)) * (1 | a)) & M32
        t = (((t + (((t ^ (t >> 7)) * (61 | t)) & M32)) & M32) ^ t) & M32
        out = ((t ^ (t >> 14)) & M32).to(torch.float64) / 4294967296.0
        self.rng_state.copy_(torch.where(mask, a, self.rng_state))
        return out

    def _damage_roll(self, mask: torch.Tensor, diff: torch.Tensor, k: str = "?", tile: torch.Tensor | None = None) -> torch.Tensor:
        """Mirrors damageRoll: 30·e^(0.04·Δ)·rand(0.8–1.2) — equal-strength
        hits land 24–36 — JS-rounded, min 1. The exponential comes from the
        fixture's JS-computed table (libm exp() can differ by an ulp between
        runtimes and the result rounds to an integer); Δ may be fractional,
        so the table is keyed on the 0.1-quantised difference."""
        if k in WW_BATTLE_KEYS:  # this roll OPENS a battle
            self._ww_opened += mask.long()
        # Combat log: every roll of the logged game becomes a keyed CB<seq>
        # line — TS damageRoll is the twin. k = the TS call-site tag (one tag
        # per TS function, even when it serves several GPU branches), t =
        # target tile, c = the rng counter BEFORE the draw (absolute stream
        # position, so draws align even when sequences slip). A reordered or
        # extra roll shows as a mismatched CB line, invisible to the rng column.
        b = getattr(self, "_log_combat_b", None)
        log_hit = b is not None and bool(mask[b])
        c0 = int(self.rng_state[b]) if log_hit else 0
        r = self._next_random(mask)
        # diff may be fractional (wounded units subtract hp/10, a river melee
        # subtracts 5). Quantize to 0.1 (q = round(diff·10)) and look up
        # 30·e^(0.04·q/10) — the fixture table (indexed i = q+2000) holds the
        # EXACT JS double damageRoll computes, so parity survives the ulp.
        q = js_round(diff * 10).to(torch.long)
        # The table spans q in [-2000, 2000] (diff +-200), so XP level bonuses
        # (up to +15 CS) cannot push |diff| past it. TS damageRoll has no clamp;
        # the table's reach is what keeps the two engines bit-exact.
        base = self._dmg_base[(q + 2000).clamp(0, 4000)]
        dmg = js_round(base * (0.8 + 0.4 * r)).clamp(min=1).to(torch.long)
        if log_hit:
            t_ = int(tile[b]) if tile is not None else -1
            self._combat_events.append(
                f"k:{k} t:{t_} c:{c0} diff{int(q[b])} r{int(js_round(r[b] * 1e6))} dmg{int(dmg[b])}"
            )
        return dmg

    def _wound(self, hp: torch.Tensor) -> torch.Tensor:
        """A damaged unit's combat-strength penalty: −1 CS per 10 HP lost,
        linear, up to −10 at 0 HP. Float64, no rounding (damageRoll quantizes
        the final diff). hp is a unit-HP tensor; cities / city-states / walls
        are NOT units and never pass through here."""
        return 10.0 * ((100.0 - hp.double()) / 100.0)

    def _xp_lvl_bonus(self, xp: torch.Tensor) -> torch.Tensor:
        """Mirrors combat.ts xpLevelBonus: the flat CS bonus a unit's veterancy
        grants — XP_LEVEL_CS per XP_LEVELS threshold crossed. Integer add (long)
        into the CS assembly. Barbarian slots never carry xp; pass a zero tensor
        for them."""
        level = torch.zeros_like(xp)
        for t in XP_LEVELS:
            level = level + (xp >= t).long()
        return XP_LEVEL_CS * level

    def _river_cross(self, frm: torch.Tensor, to: torch.Tensor) -> torch.Tensor:
        """Mirrors crossesRiver: returns 1 where the melee edge
        frm->to (an adjacent tile pair) crosses a river, else 0. neigh column
        d IS riverMask bit d — the movement walkers read the same bit for the
        +3 crossing charge — so find the neighbour direction of frm that lands
        on `to` and return that river bit (at most one direction matches; a
        non-adjacent or off-map `to` yields 0, exactly like crossesRiver)."""
        arange6 = torch.arange(6, device=self.device)
        nb = self.neigh[frm.clamp(min=0)]  # [B, 6]
        match = (nb == to.unsqueeze(1)) & (to.unsqueeze(1) >= 0) & (frm.unsqueeze(1) >= 0)
        rm = self.river_mask.gather(1, frm.clamp(min=0).unsqueeze(1)).squeeze(1)  # [B]
        bits = (rm.unsqueeze(1) >> arange6) & 1  # [B, 6]
        return (bits * match.long()).sum(dim=1)  # 0 or 1

    def _flank_support(
        self,
        def_tile: torch.Tensor,
        def_seat: torch.Tensor,
        attacker_tile: torch.Tensor,
    ) -> tuple[torch.Tensor, torch.Tensor]:
        """Mirrors combat.ts flankCount/supportCount. For a UNIT defender on
        def_tile [B], count the MILITARY units on the 6 adjacent tiles that
        are hostile to (flanking) or friendly to (support) the defender.

        def_seat [B] long: the defender's seat (0, 1..R civs, BARB_SEAT
        barbarians). attacker_tile [B]: the tile of the melee attacker to
        EXCLUDE from flanking (u != attacker); pass all -1 for a ranged/city
        attacker (support-only sites — the returned flank is then unused).

        Stacking blocks foreign units, so each tile holds at most ONE military
        unit — each of the 6 neighbours contributes 0 or 1. Returns
        (flank [B] long, support [B] long)."""
        nb = self.neigh[def_tile.clamp(min=0)]  # [B, 6]
        nbc = nb.clamp(min=0)
        on = nb >= 0
        # TWO gathers: the defender's SEAT and each neighbour's, in the one
        # absolute space, so the unitsHostile question is asked once.
        #
        # An EMBARKED military unit flanks and supports for NOBODY. Barbarians
        # never embark, so the merged emb plane covers all three pools with one
        # read.
        mslot = self.military_at.gather(1, nbc)  # [B, 6]
        present = (mslot >= 0) & on & ~self.unit_emb.gather(1, mslot.clamp(min=0))
        d_seat = def_seat.reshape(self.B, 1)
        n_seat = torch.where(
            present, self.unit_seat.gather(1, mslot.clamp(min=0)), torch.full_like(nbc, -1)
        )  # [B, 6], -1 = no (unembarked) military neighbour

        # The same question ZOC and the Encampment probe ask. `_seats_hostile`
        # treats -1 as nobody, so `present` is only needed for the FRIENDLY side.
        hostile = self._seats_hostile(d_seat, n_seat)
        # exclude the attacker's own unit (the military at attacker_tile)
        is_atk = (nb == attacker_tile.unsqueeze(1)) & (attacker_tile.unsqueeze(1) >= 0)
        hostile = hostile & ~is_atk
        # friendly = same seat, military
        friendly = present & (n_seat == d_seat)
        return hostile.long().sum(dim=1), friendly.long().sum(dim=1)

    def _lay_trade_road(self, rows: torch.Tensor, frm: torch.Tensor, dest: torch.Tensor) -> None:
        """The `layTradeRoad` twin — lay the ROAD a new trade
        route's Trader would leave behind. From the origin centre, repeatedly
        step to the neighbour with the lowest hexDistance to the destination
        (ties by direction order — the same integer rule the war-march uses, so
        both engines agree by construction). A walk that needs a water or
        impassable tile is a SEA route and lays NOTHING, so the path is
        collected first and committed only if it reaches the destination.
        Zero draws, integer-only."""
        if len(rows) == 0:
            return
        dev = self.device
        ar6 = torch.arange(6, device=dev)
        rows2 = rows.unsqueeze(1)
        cur = frm.clone()
        alive = (
            (frm >= 0)
            & (dest >= 0)
            & self.passable[rows, frm.clamp(min=0)]
            & self.passable[rows, dest.clamp(min=0)]
        )
        arrived = alive & (cur == dest)
        path = [torch.where(alive, cur, torch.full_like(cur, -1))]
        for _ in range(TRADE_ROAD_MAX_STEPS):
            walking = alive & ~arrived
            if not bool(walking.any()):
                break
            nb = self.neigh[cur.clamp(min=0)]  # [n, 6]
            nbc = nb.clamp(min=0)
            okn = (nb >= 0) & self.passable[rows2, nbc]
            d_nb = self.pair_dist[dest.clamp(min=0).unsqueeze(1), nbc].to(torch.long)
            d_cur = self.pair_dist[dest.clamp(min=0), cur.clamp(min=0)].to(torch.long)
            key = torch.where(okn & (d_nb < d_cur.unsqueeze(1)), d_nb * 8 + ar6, 10**9)
            best = key.min(dim=1).values
            step_ok = walking & (best < 10**9)
            nxt = nb.gather(1, (best % 8).clamp(max=5).unsqueeze(1)).squeeze(1)
            cur = torch.where(step_ok, nxt, cur)
            path.append(torch.where(step_ok, cur, torch.full_like(cur, -1)))
            # a walking row that could not step is a SEA route — it dies here
            alive = alive & (arrived | step_ok)
            arrived = arrived | (alive & (cur == dest))
        commit = alive & arrived
        if not bool(commit.any()):
            return
        for pt in path:
            m = commit & (pt >= 0)
            if bool(m.any()):
                self.road[rows[m], pt[m]] = True

    def _road_terms(self, frm: torch.Tensor, dest: torch.Tensor, river3: torch.Tensor):
        """The (terrain, river) MP terms a step pays, road-aware —
        the `moveCostInto` + `riverCharge` twin. A ROAD-to-ROAD step ignores the
        terrain penalty entirely ("roads let a unit pass through Woods or Hills
        as if it were flat"), and once `road_bridged` latches at the first era
        boundary (Classical roads bring bridges) it ignores the river charge
        too. A road on only ONE end does nothing, exactly as in real Civ 6."""
        tm = torch.div(
            self.tmove.gather(1, dest.clamp(min=0).unsqueeze(1)).squeeze(1), 3, rounding_mode="floor"
        )
        rd = (
            self.road.gather(1, frm.clamp(min=0).unsqueeze(1)).squeeze(1)
            & self.road.gather(1, dest.clamp(min=0).unsqueeze(1)).squeeze(1)
        )
        z = torch.zeros_like(tm)
        terr = torch.where(rd, z, tm)
        riv = torch.where(rd, torch.zeros_like(river3), river3) if self.road_bridged else river3
        return terr, riv

    def _encamp_live(self) -> torch.Tensor:
        """[B, T] bool — a LIVE Encampment garrison. The exact
        `encampmentIntact` twin: the district is an ENCAMPMENT, complete,
        unpillaged, and still holding HP. (`district_dead` is deliberately NOT
        a term — TS has no twin for it, and a captured Encampment keeps
        defending its new owner in both engines.)"""
        if self._encamp_didx < 0:
            return torch.zeros(self.B, self.T, dtype=torch.bool, device=self.device)
        return (
            (self.district == self._encamp_didx)
            & self.district_complete
            & ~self.district_pillaged
            & (self.encamp_hp > 0)
        )

    def _encamp_block_plane(self, seat) -> torch.Tensor:
        """[B, T] bool — the `encampmentBlocks` twin over the WHOLE map: does a
        LIVE ENEMY Encampment bar this SEAT from each tile?

        Keyed on the prober's SEAT: whether the prober is military or civilian
        has nothing to do with whether an Encampment's owner is hostile to it.

        Hostility mirrors `unitsHostile` exactly, which is to say it is
        civsAtWar(prober, owner) plus "barbarians are hostile to everyone":
        seat 0 is hostile to at-war civs, a civ to seat 0 when `civ_only_atwar` and to
        another civ when `civ_pair_war`. `seat` may be an int or a [B, 1] tensor (the
        war-march probes per slot)."""
        live = self._encamp_live()  # [B, T]
        tensor_seat = torch.is_tensor(seat)
        if not tensor_seat and seat == BARB_SEAT:
            return live  # barbarians are hostile to every owner
        civ_only_at = self.civ_at  # [B, T] owning civ, else -1
        if not tensor_seat and seat == 0:
            war_r = self.civ_only_atwar.gather(1, civ_only_at.clamp(min=0))
            return live & (civ_only_at >= 0) & war_r
        # The Encampment OWNER's seat per tile, then the one shared hostility
        # question.
        owner_seat = torch.where(
            civ_only_at >= 0,
            civ_only_at + 1,                                   # a civ's district
            torch.where(self.tile_seat == 0, torch.zeros_like(civ_only_at), torch.full_like(civ_only_at, -1)),
        )
        return live & self._seats_hostile(seat, owner_seat)

    def _encamp_block(self, tiles: torch.Tensor, seat) -> torch.Tensor:
        """[B, N] — `_encamp_block_plane` sampled at `tiles` (one source of
        truth for the predicate; the walkers probe a handful of tiles)."""
        if self._encamp_didx < 0:
            return torch.zeros_like(tiles, dtype=torch.bool)
        return self._encamp_block_plane(seat).gather(1, tiles.clamp(min=0))

    def _blocked_for(
        self,
        tiles: torch.Tensor,
        seat,
        is_civilian=False,
    ) -> torch.Tensor:
        """tileFreeForUnit: STACKING plus the Encampment wall — a live enemy
        Encampment bars entry. `_stack_blocked` is the stacking half alone.
        """
        return self._stack_blocked(tiles, seat, is_civilian) | self._encamp_block(tiles, seat)

    def _stack_blocked(
        self,
        tiles: torch.Tensor,
        seat,
        is_civilian=False,
    ) -> torch.Tensor:
        """Pure STACKING check for tiles [B, N] — no Encampment term.

        ONE rule, keyed on the mover's SEAT:

            a FOREIGN unit blocks; an OWN unit of the SAME DOMAIN blocks;
            own cross-domain stacks.

        `seat` may be an int or a [B, 1] tensor (the war-march probes per slot).
        """
        tc = tiles.clamp(min=0)
        # military_at/civilian_at hold a MERGED-pool slot, so the occupant's owner is
        # one more gather into unit_seat.
        mil_slot = self.military_at.gather(1, tc)
        civ_slot = self.civilian_at.gather(1, tc)

        if True:
            # Whose unit occupies this tile, per DOMAIN, in the absolute seat
            # space (-1 = nobody). At most one military and one civilian can
            # stand here, so each domain has a single owner.
            neg = torch.full_like(tc, -1)
            mil_seat = torch.where(
                mil_slot >= 0, self.unit_seat.gather(1, mil_slot.clamp(min=0)), neg
            )
            civ_seat = torch.where(
                civ_slot >= 0, self.unit_seat.gather(1, civ_slot.clamp(min=0)), neg
            )
            # `is_civilian` may be a per-row [B] tensor — the spawn probe
            # decides per GAME whether it is placing a civilian. Normalise to a
            # broadcastable bool tensor so one expression covers both.
            civ_b = (
                is_civilian.unsqueeze(1)
                if torch.is_tensor(is_civilian)
                else torch.full((1, 1), bool(is_civilian), dtype=torch.bool, device=tc.device)
            )
            mil_blocks = (mil_seat >= 0) & ((mil_seat != seat) | ~civ_b)
            civ_blocks = (civ_seat >= 0) & ((civ_seat != seat) | civ_b)
            occupied = mil_blocks | civ_blocks
        return occupied

    def _first_free_spot(self, at_tile: torch.Tensor, side: str, civ_mask: torch.Tensor | None = None, civ: int | None = None, naval_mask: torch.Tensor | None = None, cart: torch.Tensor | None = None) -> tuple[torch.Tensor, torch.Tensor]:
        """Mirrors spawnUnit's placement probe: the anchor if free, else the
        first free neighbor in direction order (the stable distance sort
        keeps exactly that order). side: 'barb' | 'seat0' | 'civ';
        civ_mask [B] bool (either major side) — True = civilian probe.
        naval_mask [B] bool marks rows spawning a NAVAL unit — those probe over
        enterable WATER (wpass; OCEAN needs the owner's CARTOGRAPHY, passed as
        cart [B]) instead of the land plane, so ships land on water.
        Returns (found [B], spot [B])."""
        cand7 = torch.cat([at_tile.unsqueeze(1), self.neigh[at_tile.clamp(min=0)]], dim=1)  # [B, 7]
        okc = cand7.clamp(min=0)
        # The SAME stacking rule the movement probe uses, keyed on the spawning
        # seat; the barbarian seat needs no special case, because "hostile to
        # everyone" already makes every occupant block.
        #
        # `_blocked_for`, not `_stack_blocked`: TS's spawnUnit probes with
        # tileFreeForUnit (units.ts), which calls encampmentBlocks — so the
        # Encampment wall belongs here too.
        if side == "seat0":
            blocked = self._blocked_for(cand7, 0, is_civilian=civ_mask)
        elif side == "civ" and civ is not None:
            blocked = self._blocked_for(cand7, civ + 1, is_civilian=False if civ_mask is None else civ_mask)
        else:
            blocked = self._blocked_for(cand7, BARB_SEAT)
        terr = self.passable.gather(1, okc)
        if naval_mask is not None and bool(naval_mask.any()):
            # naval rows use the water plane — wpass, OCEAN gated on the
            # owner's CARTOGRAPHY (else all-false → coast/lake only).
            ocean_ok = ~self.ocean_tile.gather(1, okc)
            if cart is not None:
                ocean_ok = ocean_ok | cart.unsqueeze(1)
            water_terr = self.wpass.gather(1, okc) & ocean_ok
            terr = torch.where(naval_mask.unsqueeze(1), water_terr, terr)
        ok7 = (cand7 >= 0) & terr & ~blocked
        first = torch.where(ok7, torch.arange(7, device=self.device), 7).min(dim=1).values
        spot = cand7.gather(1, first.clamp(max=6).unsqueeze(1)).squeeze(1)
        return first < 7, spot

    def _barb_water_ok(self, tiles: torch.Tensor) -> torch.Tensor:
        """The water plane a BARBARIAN hull may enter — wpass minus
        OCEAN. Barbarians own no tech, so TS's waterEnterable (which gates
        OCEAN on the owner's CARTOGRAPHY) always refuses ocean for them."""
        tc = tiles.clamp(min=0).unsqueeze(1)
        return (self.wpass.gather(1, tc) & ~self.ocean_tile.gather(1, tc)).squeeze(1)

    def _spawn_barb(self, mask: torch.Tensor, at_tile: torch.Tensor, unit_type: int, naval: bool = False) -> None:
        """Barbarians are military; appends to the slot list, which is what
        keeps GPU unit order identical to state.units array order."""
        if not bool(mask.any()):
            return
        # a NAVAL barb probes the WATER plane (its hull cannot stand ashore),
        # exactly as TS's spawnUnit branches on UNITS[type].naval.
        _nm = torch.ones(self.B, dtype=torch.bool, device=self.device) if naval else None
        found, spot = self._first_free_spot(at_tile, "barb", naval_mask=_nm)
        can = mask & found
        if not bool(can.any()):
            return
        rows = can.nonzero(as_tuple=True)[0]
        slot = self.next_slot[rows]
        assert int(slot.max()) < simbase.POOL_MAX, "barbarian slot pool exhausted — raise simbase.POOL_MAX"
        self.barb_unit_alive[rows, slot] = True
        # callers pass a ladder POSITION; barb_unit_type stores the ROSTER index it
        # names, so every downstream read uses the roster tables.
        self.barb_unit_type[rows, slot] = int(self._barb_ladder[unit_type])
        self.barb_unit_tile[rows, slot] = spot[rows]
        self.barb_unit_hp[rows, slot] = self.rules.combat.get("unitHp", 100)
        self.barb_unit_fortify[rows, slot] = 0  # a fresh (possibly reclaimed) slot starts undug
        # TS spawnUnit writes `movesLeft: def.moves` plus the seat's golden
        # dedication and leaves movesFull undefined — a unit trained mid-turn
        # CAN move before its first refresh, and a reclaimed slot must not
        # inherit the dead unit's remainder.
        self.barb_unit_emb[rows, slot] = False
        # BEFORE _full_mp, which READS `emb`: a reclaimed slot carries the dead
        # occupant's flag, and _full_mp overrides an embarked unit's pool to the
        # flat EMBARK_MOVES. Only reachable once a slot is REUSED, i.e. after a
        # compaction.
        _m = self._full_mp("barb")[rows, slot]
        self.barb_unit_mp[rows, slot] = _m
        self.barb_unit_mp_full[rows, slot] = _m
        self.military_at[(rows, spot[rows])] = slot + simbase.SEAT0_POOL_MAX + simbase.POOL_MAX
        self.next_slot[rows] += 1

    def _reveal_around(self, rows: torch.Tensor, seat_row, tiles: torch.Tensor, radius: int) -> None:
        """revealAround's twin: lift `seat_row`'s fog within `radius` of
        `tiles`. rows [K] batch indices (UNIQUE per call — advanced-index
        assignment is last-write-wins), seat_row an int or [K] long (0 =
        seat 0, r+1 = civ r), tiles [K] long. No-op with fog off — TS's
        revealAround gates on state.fogOfWar the same way, so a fog-off
        world accrues NO explored state on either engine.

        WIRED — the full TS reveal-site set: t0 fixture load (r2/unit), the
        three major spawn bodies (r2), both founding bodies (r3), every walk
        hop through _step_verb's one tile write (r2 — all movers route
        there), tile acquisition r1 at all three sites (seat-0 border
        growth, civ border growth, the driven tile buy), and the captor's
        r3 at all five capture bodies (seat-0/civ city captures + transfers,
        both CS conquests). NOT reveals on either engine: the melee
        advance-into-freed-tile and unit capture/transfers (TS writes
        tileIndex directly — no stepUnit, no reveal). FOG-DEBT remaining:
        the goody-hut maps reward r5 has no twin because the GPU has no
        goody-hut mechanic at all (a pre-existing feature gap, not a fog
        one)."""
        if not self.fog_of_war or rows.numel() == 0:
            return
        disk = self.pair_dist[tiles.clamp(min=0)] <= radius  # [K, T]
        self.seat_explored[rows, seat_row] |= disk

    def _explored_at(self, seat_row, tiles: torch.Tensor) -> torch.Tensor:
        """isExplored's twin over a tile tensor: True wherever `seat_row` has
        lifted the fog (fog off = everything explored). tiles [...]-shaped
        long; returns a same-shaped bool."""
        if not self.fog_of_war:
            return torch.ones_like(tiles, dtype=torch.bool)
        ex = self.seat_explored[:, seat_row] if isinstance(seat_row, int) else self.seat_explored[torch.arange(self.B, device=self.device), seat_row]
        return ex.gather(1, tiles.clamp(min=0).reshape(self.B, -1)).reshape(tiles.shape)

    def _spawn_unit(self, row: int, mask: torch.Tensor, at_tile: torch.Tensor, type_idx, init_xp: torch.Tensor | None = None, charges: torch.Tensor | None = None) -> torch.Tensor:
        """spawnUnit for any major seat row (0 = seat 0, r+1 = civ r): the
        unit appears at/near `at_tile` (the first free spot in direction
        order). ONE body over the pooled planes via the pool prefix; the
        roster's civilian bit picks the occupancy plane (and zeroes the
        military-only fields), and naval types probe water with OCEAN gated
        on this row's own CARTOGRAPHY. type_idx: int or [B] long. init_xp
        ([B] long) seeds a MILITARY unit's starting XP from its city's
        Encampment training buildings — civilians stay 0. charges ([B]
        long) overrides the roster charge count (the MISSIONARY buy's
        SCRIPTURE +1). Returns the LANDED mask — a caller that paid refunds
        where no spot was free."""
        if not bool(mask.any()):
            return torch.zeros_like(mask)
        if isinstance(type_idx, int):
            type_idx = torch.full((self.B,), type_idx, dtype=torch.long, device=self.device)
        elif type_idx.dim() == 0:
            type_idx = type_idx.expand(self.B)
        pre = "seat0" if row == 0 else "civ"
        is_civ_u = self._type_civilian[type_idx.clamp(min=0)]
        # clamp max too: unmasked rows may hold district queue codes.
        ti_n = type_idx.clamp(min=0, max=self.NU - 1)
        naval_m = self.unit_naval[ti_n] & mask
        techs2 = self.techs if row == 0 else self.civ_only_techs[:, row - 1]
        cart = techs2[:, self._cartography_tech] if self._cartography_tech >= 0 else None
        found, spot = self._first_free_spot(at_tile, pre, civ_mask=is_civ_u, civ=row - 1, naval_mask=naval_m, cart=cart)
        can = mask & found
        if not bool(can.any()):
            return can
        rows = can.nonzero(as_tuple=True)[0]
        nxt = getattr(self, f"{pre}_unit_next")
        slot = nxt[rows]
        if row == 0:
            assert int(slot.max()) < simbase.SEAT0_POOL_MAX, "p slot pool exhausted — raise simbase.SEAT0_POOL_MAX"
        else:
            assert int(slot.max()) < simbase.POOL_MAX, "civ slot pool exhausted — raise simbase.POOL_MAX"
        getattr(self, f"{pre}_unit_alive")[rows, slot] = True
        if row > 0:
            # a reclaimed civ slot may have held ANOTHER civ's unit
            self.civ_unit_civ[rows, slot] = row - 1
            self.civ_unit_seat[rows, slot] = row
        getattr(self, f"{pre}_unit_type")[rows, slot] = type_idx[rows]
        getattr(self, f"{pre}_unit_tile")[rows, slot] = spot[rows]
        self._reveal_around(rows, row, spot[rows], 2)  # spawnUnit's revealAround (SIGHT_RANGE)
        getattr(self, f"{pre}_unit_hp")[rows, slot] = self.rules.combat.get("unitHp", 100)
        getattr(self, f"{pre}_unit_fortify")[rows, slot] = 0  # a fresh (possibly reclaimed) slot starts undug
        if init_xp is None:
            getattr(self, f"{pre}_unit_xp")[rows, slot] = 0  # a fresh (possibly reclaimed) slot starts at 0 xp
        else:
            # MILITARY rows inherit the training city's Encampment XP; civilians stay 0.
            getattr(self, f"{pre}_unit_xp")[rows, slot] = torch.where(is_civ_u[rows], torch.zeros_like(slot), init_xp[rows])
        # a unit spawned MID-turn has no frozen grant yet — TS leaves movesFull
        # undefined until its first refreshUnits and the `?? full` fallback
        # means no aura, so 0 is the faithful mirror (and it scrubs a reclaimed
        # slot's stale value).
        getattr(self, f"{pre}_unit_aura_mp")[rows, slot] = 0
        getattr(self, f"{pre}_unit_emb")[rows, slot] = False  # a fresh (possibly reclaimed) slot is ashore
        # BEFORE _full_mp, which READS `emb`: a reclaimed slot carries the dead
        # occupant's flag, and _full_mp overrides an embarked unit's pool to the
        # flat EMBARK_MOVES. The pool itself is `def.moves` plus the seat's
        # golden dedication.
        _m = self._full_mp(pre)[rows, slot]
        getattr(self, f"{pre}_unit_mp")[rows, slot] = _m
        getattr(self, f"{pre}_unit_mp_full")[rows, slot] = _m
        getattr(self, f"{pre}_unit_charges")[rows, slot] = self._type_charges[type_idx[rows]] if charges is None else charges[rows]
        off = 0 if row == 0 else simbase.SEAT0_POOL_MAX  # merged-pool index of this pool's slot 0
        cu_rows = is_civ_u[rows]
        mil_rows = rows[~cu_rows]
        if len(mil_rows) > 0:
            self.military_at[(mil_rows, spot[mil_rows])] = nxt[mil_rows] + off
        cv_rows = rows[cu_rows]
        if len(cv_rows) > 0:
            self.civilian_at[(cv_rows, spot[cv_rows])] = nxt[cv_rows] + off
        nxt[rows] += 1
        # track the seat's strongest MELEE ever fielded (city defense) — a
        # civilian's combat 0 never raises it. Gated on `can` like TS: a
        # no-spot spawn never lands the unit.
        melee_cs = torch.where(
            can & (self._type_ranged_strength[ti_n] == 0),
            self._type_combat[ti_n],
            torch.zeros_like(self.civ_best_melee[:, row]),
        )
        self.civ_best_melee[:, row] = torch.maximum(self.civ_best_melee[:, row], melee_cs)
        return can


    def _dig_at(self, gd: torch.Tensor, td: torch.Tensor) -> None:
        """Mark a DIG for the games in `gd` on the tiles in `td` — the
        row-index form of `_mark_antiquity`, which takes a [B] mask.
        Every COMBAT death goes through here, exactly as every TS combat death
        goes through `combat.ts:killUnit`. Maintenance disbands and builder
        charge-exhaustion are NOT deaths and must not call it."""
        if len(gd) == 0:
            return
        m = torch.zeros(self.B, dtype=torch.bool, device=self.device)
        m[gd] = True
        t = torch.full((self.B,), -1, dtype=torch.long, device=self.device)
        t[gd] = td
        self._mark_antiquity(m, t)

    def _mark_antiquity(self, mask: torch.Tensor, tile: torch.Tensor) -> None:
        """The markAntiquitySite twin — stamp an ANTIQUITY SITE on
        `tile` for the rows in `mask`. Real Civ 6 creates these from PRE-MODERN
        events (a razed barbarian outpost, a unit dying), so the era gate is the
        sourced part; a tile already carrying a dig does not stack, and water,
        districts and wonder tiles are refused exactly as TS refuses them."""
        if not bool(mask.any()):
            return
        t = tile.clamp(min=0)
        era = self._civ_era(self.techs, self.civics)  # [B] seat 0's era
        if self.S > 0:
            _citystate_s = self.citystate_at.gather(1, t.unsqueeze(1)).squeeze(1)
            _citystate_ctr = (_citystate_s >= 0) & (
                self.citystate_center.gather(1, _citystate_s.clamp(min=0).unsqueeze(1)).squeeze(1) == t)
        else:
            _citystate_ctr = torch.zeros(self.B, dtype=torch.bool, device=self.device)
        # TS keeps ONE tile map, so `t.district` is set for EVERY seat's
        # district and `markAntiquitySite` refuses them all. The GPU splits the
        # fact: `self.district` is seat 0's, while a civ's live in the
        # `civ_city_dist_tile` registry — both must be refused.
        _rv_dist = (self.civ_city_dist_tile == t.view(self.B, 1, 1, 1)).any(3).any(2).any(1)
        okr = (
            mask
            & (tile >= 0)
            & (era < self._modern_era_index)
            & ~self.water.gather(1, t.unsqueeze(1)).squeeze(1)
            & (self.district.gather(1, t.unsqueeze(1)).squeeze(1) < 0)
            & (self.built_wonder.gather(1, t.unsqueeze(1)).squeeze(1) < 0)
            # TS refuses a dig on ANY tile carrying a district, and `foundCity`
            # sets `tile.district = 'CITY_CENTER'` (so do both capture paths).
            # The GPU's `district` plane does NOT encode centres — they live in
            # `center_at` / `civ_city_at` (cf. the adjacency scan, which spells out
            # `center_at >= 0 | district >= 0 | civ_city_at >= 0`), so both are named
            # here.
            & (self.center_at.gather(1, t.unsqueeze(1)).squeeze(1) < 0)  # seat 0's centre
            & (self.civ_city_at.gather(1, t.unsqueeze(1)).squeeze(1) < 0)  # civ centre
            # NOTE: a CITY-STATE centre is deliberately NOT excluded. TS sets
            # `tile.district = 'CITY_CENTER'` on seat-0 founding, on both
            # capture paths and on CIV founding, but NOT for a city-state,
            # so `markAntiquitySite` accepts a death on a minor's centre.
            & ~_rv_dist  # a CIV's district tile
        )
        if not bool(okr.any()):
            return
        rows = okr.nonzero(as_tuple=True)[0]
        self.antiquity[rows, t[rows]] = True




    def _golden_ded_table(self, kind: int) -> torch.Tensor:
        """[B, 1+R] bool — which civs are in a GOLDEN age holding `kind`."""
        return (self.civ_age == 2) & (self.ded_picks == kind).any(dim=2)

    def _golden_move_mp(self, pre: str) -> torch.Tensor:
        """[B, U] — the `goldenMoveBonus` twin.

        Civilopedia (Gathering Storm): MONUMENTALITY is "+2 Movement for all
        Builders", EXODUS OF THE EVANGELISTS "+2 Movement for all Missionaries,
        Apostles, and Inquisitors" — this roster has no INQUISITOR. Keyed on the
        unit's OWN seat, so every seat in a Golden age gets it on the same rule;
        barbarians and city-states hold no dedications."""
        typ = getattr(self, f"{pre}_unit_type").clamp(min=0, max=self.NU - 1)
        out = torch.zeros_like(typ)
        if self._golden_move <= 0:
            return out
        seat = getattr(self, f"{pre}_unit_seat")
        civ_ok = (seat >= 0) & (seat < self.civ_age.shape[1])
        civ = torch.where(civ_ok, seat, torch.zeros_like(seat))
        for kind, types in (
            (self._ded_monumentality, (self._builder_idx,)),
            (self._ded_exodus, (self._missionary_idx, self._apostle_idx)),
        ):
            tsel = None
            for t in types:
                if t < 0:
                    continue
                tsel = (typ == t) if tsel is None else (tsel | (typ == t))
            if tsel is None:
                continue
            holds = self._golden_ded_table(kind).gather(1, civ)
            out = torch.where(civ_ok & tsel & holds, torch.full_like(out, self._golden_move), out)
        return out

    def _golden_ded(self, civ, kind: int) -> torch.Tensor:
        """[B] bool: is `civ` in a GOLDEN age holding dedication `kind`? The
        goldenDedication twin. `civ` is a unified seat index — an int when the
        caller knows it (the per-r civ phases) or a [B] tensor when it varies
        per row. A Golden age trades the Dark/Normal era-score payout for the
        standing bonuses, so every one of them gates on exactly this."""
        tab = self._golden_ded_table(kind)
        if torch.is_tensor(civ):
            return tab.gather(1, civ.clamp(min=0).unsqueeze(1)).squeeze(1)
        return tab[:, civ]

    def _cliff_block_dirs(self, cur: torch.Tensor, nb6: torch.Tensor, own: torch.Tensor | None = None) -> torch.Tensor:
        """[B, 6]: per-direction, is the step cur->neighbour a
        land/water crossing closed by a CLIFF? Applied at STEP-legality level so
        a walker routes AROUND a cliff instead of halting at it.
        The mask lives on the LAND tile, so read it there and test the bit
        pointing at the water side — from the water side that is the opposite
        direction ((d + 3) % 6). Sourced exceptions: a city centre, and a HARBOR
        belonging to the mover's OWN civ ("enemy units won't" pass it)."""
        B, dev = self.B, self.device
        if not bool(self.cliff_mask.any()):
            return torch.zeros(B, 6, dtype=torch.bool, device=dev)
        c = cur.clamp(min=0)
        nbc = nb6.clamp(min=0)
        cw = self.water.gather(1, c.unsqueeze(1))            # [B, 1]
        nw = self.water.gather(1, nbc)                        # [B, 6]
        trans = (cw != nw) & (nb6 >= 0)
        if not bool(trans.any()):
            return torch.zeros(B, 6, dtype=torch.bool, device=dev)
        dirs = torch.arange(6, device=dev).reshape(1, 6).expand(B, 6)
        land = torch.where(cw.expand(B, 6), nbc, c.unsqueeze(1).expand(B, 6))
        dl = torch.where(cw.expand(B, 6), (dirs + 3) % 6, dirs)
        bit = ((self.cliff_mask.gather(1, land) >> dl) & 1).bool()
        free = (self.center_at.gather(1, land) >= 0) | (self.civ_city_at.gather(1, land) >= 0)
        if self._harbor_idx >= 0 and own is not None:
            free = free | ((self.district.gather(1, land) == self._harbor_idx) & own.gather(1, land))
        return trans & bit & ~free

    def _cliff_edge(self, cur: torch.Tensor, dest: torch.Tensor, dir_i, own: torch.Tensor | None = None) -> torch.Tensor:
        """[B] bool: is the step cur->dest a land/water crossing that a
        CLIFF closes? The `cliffBlocks` twin. The mask lives on the LAND tile, so
        read it there and test the bit pointing at the water side — from the
        water side that is the OPPOSITE direction ((d + 3) % 6 on this hex
        layout). Sourced exceptions: a city centre and a HARBOR ignore cliffs.
        Cliffs never touch land-to-land steps."""
        if not bool(self.cliff_mask.any()):
            return torch.zeros(self.B, dtype=torch.bool, device=self.device)
        c = cur.clamp(min=0)
        d = dest.clamp(min=0)
        cw = self.water.gather(1, c.unsqueeze(1)).squeeze(1)
        dw = self.water.gather(1, d.unsqueeze(1)).squeeze(1)
        trans = cw != dw
        if not bool(trans.any()):
            return torch.zeros_like(trans)
        land = torch.where(cw, d, c)
        di = dir_i if torch.is_tensor(dir_i) else torch.full_like(c, int(dir_i))
        dl = torch.where(cw, (di + 3) % 6, di)
        bit = ((self.cliff_mask.gather(1, land.unsqueeze(1)).squeeze(1) >> dl) & 1).bool()
        free = (self.center_at.gather(1, land.unsqueeze(1)).squeeze(1) >= 0) | (
            self.civ_city_at.gather(1, land.unsqueeze(1)).squeeze(1) >= 0
        )
        # SOURCED: the Harbor exception is OWNER-ONLY — "when YOUR units use it
        # they will be able to pass the Cliffs... Enemy units won't." Callers
        # pass `own` = the tiles this mover's civ holds; without it a Harbor
        # would be a hole in the wall for the besieger too.
        if self._harbor_idx >= 0 and own is not None:
            harbor = self.district.gather(1, land.unsqueeze(1)).squeeze(1) == self._harbor_idx
            free = free | (harbor & own.gather(1, land.unsqueeze(1)).squeeze(1))
        return trans & bit & ~free

    def _clear_camp_at(self, mask: torch.Tensor, tile: torch.Tensor, civ: torch.Tensor | None = None) -> None:
        """A non-barbarian unit entering a camp tile clears it: +50 gold to
        ITS seat (pass civ=[B] civ ids; None banks it to seat 0) and the camp
        list splices left (order matters for later garrison loops)."""
        if not bool(mask.any()):
            return
        hit = mask & (self.camp_tile == tile.unsqueeze(1)).any(dim=1)
        if not bool(hit.any()):
            return
        self._mark_antiquity(hit, tile)  # a razed outpost leaves a dig
        reward = self.rules.combat.get("campClearReward", 50)
        for b in hit.nonzero(as_tuple=True)[0].tolist():
            row = self.camp_tile[b]
            k = int((row == tile[b]).nonzero(as_tuple=True)[0][0])
            row[k:-1] = row[k + 1 :].clone()
            row[-1] = -1
            self.n_camps[b] -= 1
            if civ is None:
                self.treasury[b] += reward
            else:
                self.civ_only_treasury[b, int(civ[b])] += float(reward)

    # --- seat-0 unit actions (phase 4b) ---------------------------------------


    def _type_civic_slot_ok(self, per_city: bool) -> torch.Tensor:
        """The Archaeologist's two extra trainableUnits gates — the CIVIC unlock
        (Natural History) and the ARTIFACT-SLOT rule (its city must hold an
        ARCHAEOLOGICAL MUSEUM with a free slot). Returns [B, NU] when per_city
        is False, else [B, C, NU]."""
        B, dev = self.B, self.device
        civ_ok = (self._type_civic.unsqueeze(0) < 0) | self.civics.gather(
            1, self._type_civic.clamp(min=0).unsqueeze(0).expand(B, -1)
        )  # [B, NU]
        if not per_city:
            return civ_ok
        C = self.C
        need = self._type_needs_slot.reshape(1, 1, -1)  # [1, 1, NU]
        if self._artifact_bidx < 0:
            room = torch.zeros(B, C, 1, dtype=torch.bool, device=dev)
        else:
            room = (
                self.buildings[:, :, self._artifact_bidx] & (self.artifacts < self._artifact_slots)
            ).unsqueeze(2)  # [B, C, 1]
        return civ_ok.unsqueeze(1) & (~need | room)

    def unit_action_mask(self) -> torch.Tensor:
        """[B, simbase.SEAT0_POOL_MAX, A] valid orders per seat-0 unit, A = len(_act_names):
        0–5 step to that neighbor, 6–11 melee-attack the enemy there, 12 hold,
        13/14/15 build a FARM / MINE / LUMBER_MILL (builders only, on a tile
        where that improvement is valid), then chop, repair, the resource
        improvements and pillage. The mask is OPTIMISTIC: orders are
        RE-validated at execution (both engines identically), because an
        earlier unit's move can invalidate a later unit's order."""
        B, dev = self.B, self.device
        nb = self.neigh[self.seat0_unit_tile.clamp(min=0).reshape(-1)].reshape(B, simbase.SEAT0_POOL_MAX, 6)
        nbc = nb.clamp(min=0).reshape(B, -1)
        # two gathers into the merged maps; the occupant's SEAT answers the rest.
        mslot = self.military_at.gather(1, nbc)
        cslot = self.civilian_at.gather(1, nbc)
        neg = torch.full_like(mslot, -1)
        m_seat = torch.where(mslot >= 0, self.unit_seat.gather(1, mslot.clamp(min=0)), neg)
        c_seat = torch.where(cslot >= 0, self.unit_seat.gather(1, cslot.clamp(min=0)), neg)
        barb = (m_seat == BARB_SEAT).reshape(B, simbase.SEAT0_POOL_MAX, 6)
        pmil = (m_seat == 0).reshape(B, simbase.SEAT0_POOL_MAX, 6)
        pciv = (c_seat == 0).reshape(B, simbase.SEAT0_POOL_MAX, 6)
        vm_here = (m_seat > 0) & (m_seat != BARB_SEAT)
        vm_civ = (m_seat - 1).clamp(min=0, max=max(self.R - 1, 0))
        vm_war = (vm_here & self.civ_only_atwar.gather(1, vm_civ)).reshape(B, simbase.SEAT0_POOL_MAX, 6)
        vm_any = vm_here.reshape(B, simbase.SEAT0_POOL_MAX, 6)
        # at-war civ CITY CENTERS are melee targets (attackTargets).
        rcn = self.civ_city_at.gather(1, nbc)
        civ_city_war = ((rcn >= 0) & self.civ_only_atwar.gather(1, rcn.clamp(min=0).clamp(max=max(self.R - 1, 0)))).reshape(B, simbase.SEAT0_POOL_MAX, 6)
        vc_civ_n = ((c_seat > 0) & (c_seat != BARB_SEAT)).reshape(B, simbase.SEAT0_POOL_MAX, 6)
        passable = self.passable.gather(1, nbc).reshape(B, simbase.SEAT0_POOL_MAX, 6)
        on_map = nb >= 0
        civ = self._type_civilian[self.seat0_unit_type]
        dom = torch.where(civ.unsqueeze(2), pciv, pmil)
        # TS walkPath loops while `movesLeft > 0` and attackTargets returns []
        # at `movesLeft <= 0`. Builds are NOT gated (builderImprove checks
        # charges, never MP).
        alive = self.seat0_unit_alive.unsqueeze(2) & (self.seat0_unit_mp > 0).unsqueeze(2)
        move = on_map & passable & ~barb & ~vm_any & ~vc_civ_n & ~dom & alive
        can_fight = (self._type_combat[self.seat0_unit_type] > 0).unsqueeze(2)
        # rangedAttack bombards cities too, so civ_city_war is a target for every
        # fighter. City-state centres join once seat 0 has DECLARED war
        # (citystate_atwar); the war gate is what keeps a PEACEFUL city-state from ever
        # being offered as a target.
        csn = self.citystate_at.gather(1, nbc)
        citystate_war = ((csn >= 0) & self.citystate_atwar.gather(1, csn.clamp(min=0))).reshape(B, simbase.SEAT0_POOL_MAX, 6)
        attack = on_map & (barb | vm_war | civ_city_war | citystate_war) & can_fight & alive
        hold = self.seat0_unit_alive.unsqueeze(2)
        # 13/14/15: build FARM / MINE / LUMBER_MILL — a builder with charges
        # standing on an owned, unimproved, non-center tile where that
        # improvement is valid (mirrors validImprovements: FARM's hill case is
        # hillFarms-civic-gated, MINE gated by MINING, LUMBER_MILL by
        # CONSTRUCTION; each static mask carries the terrain/resource part).
        if self.improvements_on and self._builder_idx >= 0:
            tc = self.seat0_unit_tile.clamp(min=0)  # [B, simbase.SEAT0_POOL_MAX]
            if self._hillfarms_civic >= 0:
                civ_done = self.civics[:, self._hillfarms_civic].unsqueeze(1)
            else:
                civ_done = torch.zeros(B, 1, dtype=torch.bool, device=dev)
            mining = self.techs[:, self._mine_unlock_tech].unsqueeze(1) if self._mine_unlock_tech >= 0 else torch.zeros(B, 1, dtype=torch.bool, device=dev)
            constr = self.techs[:, self._lumber_unlock_tech].unsqueeze(1) if self._lumber_unlock_tech >= 0 else torch.zeros(B, 1, dtype=torch.bool, device=dev)
            here_ok = (
                self.seat0_unit_alive
                & (self.seat0_unit_type == self._builder_idx)
                & (self.seat0_unit_charges > 0)
                & (self.owner.gather(1, tc) >= 0)
                & (self.center_at.gather(1, tc) < 0)
                & (self.improvement.gather(1, tc) < 0)
                & (self.district.gather(1, tc) < 0)  # can't improve a district tile (mirrors validImprovements)
                & (self.built_wonder.gather(1, tc) < 0)  # an in-flight wonder pave refuses improvements
            )
            farmable = self.farm_flat.gather(1, tc) | (self.farm_hill.gather(1, tc) & civ_done)
            build_f = (here_ok & farmable).unsqueeze(2)
            build_m = (here_ok & self.mine_ok.gather(1, tc) & mining).unsqueeze(2)
            build_l = (here_ok & self.lumber_ok.gather(1, tc) & ~self.feat_stripped.gather(1, tc) & constr).unsqueeze(2)  # chopped woods -> no lumber mill
        else:
            zc = torch.zeros(B, simbase.SEAT0_POOL_MAX, 1, dtype=torch.bool, device=dev)
            build_f = build_m = build_l = zc
        ftr_t = self.tile_ftr.gather(1, tc)
        ftu_t = self.tile_ftu.gather(1, tc).clamp(min=0)
        ft_unlocked = self.techs.gather(1, ftu_t) & (self.tile_ftu.gather(1, tc) >= 0)
        not_stripped = ~self.feat_stripped.gather(1, tc)
        chop = (here_ok & (ftr_t > 0) & ft_unlocked & not_stripped).unsqueeze(2)
        # 17 = builder REPAIR (`builderRepair`, units.ts): a builder standing on
        # an OWNED tile whose improvement or district is pillaged. No charge is
        # spent — the turn is.
        # 18-23 = the RESOURCE improvements + SEASIDE_RESORT. `builderImprove`
        # validates any id through validImprovements; the mask offers the same
        # roster both seats can place.
        _res_cols = []
        if self.improvements_on and self._builder_idx >= 0:
            _tc2 = self.seat0_unit_tile.clamp(min=0)
            _base = (
                self.seat0_unit_alive
                & (self.seat0_unit_type == self._builder_idx)
                & (self.seat0_unit_charges > 0)
                & (self.owner.gather(1, _tc2) >= 0)
                & (self.center_at.gather(1, _tc2) < 0)
                & (self.improvement.gather(1, _tc2) < 0)
                & (self.district.gather(1, _tc2) < 0)
                & (self.built_wonder.gather(1, _tc2) < 0)
            )
            _rq = self.res_imp.gather(1, _tc2)  # required improvement idx, -1 = none
            for _k in range(3, self._imp_unlock.numel()):
                _ut = int(self._imp_unlock[_k])
                _unl = self.techs[:, _ut].unsqueeze(1) if _ut >= 0 else torch.ones(B, 1, dtype=torch.bool, device=dev)
                if self.SEASIDE >= 0 and _k == self.SEASIDE:
                    _ok = _base & self._seaside_ok().gather(1, _tc2) & _unl
                else:
                    _ok = _base & (_rq == _k) & _unl
                _res_cols.append(_ok.unsqueeze(2))
        else:
            _res_cols = []
        rep_t = self.seat0_unit_tile.clamp(min=0)
        repair = (
            self.seat0_unit_alive
            & (self.seat0_unit_type == self._builder_idx if self._builder_idx >= 0 else torch.zeros_like(self.seat0_unit_alive))
            & (self.owner.gather(1, rep_t) >= 0)
            & (self.pillaged.gather(1, rep_t) | self.district_pillaged.gather(1, rep_t))
        ).unsqueeze(2)
        # 24 = PILLAGE. A military unit standing on an ENEMY tile (an at-war
        # civ's or a city-state's) with a live improvement, or a complete
        # non-centre unpillaged district.
        _pt = self.seat0_unit_tile.clamp(min=0)
        _rv_t = self.civ_at.gather(1, _pt)
        _enemy = ((_rv_t >= 0) & self.civ_only_atwar.gather(1, _rv_t.clamp(min=0))) | (self.citystate_at.gather(1, _pt) >= 0)
        _has_imp = (self.improvement.gather(1, _pt) >= 0) & ~self.pillaged.gather(1, _pt)
        _has_dis = (
            (self.district.gather(1, _pt) >= 0)
            & self.district_complete.gather(1, _pt)
            & ~self.district_pillaged.gather(1, _pt)
            & (self.center_at.gather(1, _pt) < 0)
            & (self.civ_city_at.gather(1, _pt) < 0)
        )
        pillage = (
            self.seat0_unit_alive & (self._type_combat[self.seat0_unit_type] > 0) & _enemy & (_has_imp | _has_dis)
        ).unsqueeze(2)
        # DEBT: the SNIPE ring columns are ALL-FALSE here because seat 0 has
        # no snipe DISPATCH arm — the TS walker's SNIPE arm is seat-generic
        # and would execute one. All-False keeps the width equal to the enum
        # and stops a legal column nothing executes becoming a no-op trap;
        # the CIV's columns are live.
        _sn_p = (
            [torch.zeros(B, simbase.SEAT0_POOL_MAX, 12, dtype=torch.bool, device=dev)]
            if getattr(self, "_snipe_on", False) else []
        )
        # DEBT: SPREAD columns are all-False here — seat 0 fields no religious
        # units because it cannot found a religion yet (the TS walker's SPREAD
        # arm is seat-generic and gates only on charges + a founded religion).
        # The columns exist so the width tracks the enum; the driven pipeline's
        # spread legality lives in the driver's target scan + the apply arm.
        _sp_p = [torch.zeros_like(hold).expand(-1, -1, 7)] if getattr(self, "_A_SPREAD", -1) >= 0 else []
        # FOUND_CITY: legal for a live SETTLER (optimistic — canFoundCity is
        # re-validated at apply).
        _fd_p = (
            [(self.seat0_unit_alive & (self.seat0_unit_type == self._settler_idx)).unsqueeze(2)]
            if getattr(self, "_A_FOUND", -1) >= 0 and self._settler_idx >= 0
            else ([torch.zeros(B, simbase.SEAT0_POOL_MAX, 1, dtype=torch.bool, device=dev)] if getattr(self, "_A_FOUND", -1) >= 0 else [])
        )
        out = torch.cat(
            [move, attack, hold, build_f, build_m, build_l, chop, repair] + _res_cols + [pillage] + _sn_p + _sp_p + _fd_p, dim=2
        )
        # the mask's width IS the enum's length, or a dispatch is reading the
        # wrong column. `_res_cols` is empty when improvements are off, which
        # legitimately shortens the row — only assert when they are on.
        if self._act_names and self.improvements_on and self._builder_idx >= 0:
            assert out.shape[-1] == len(self._act_names), (
                f"unit_action_mask is {out.shape[-1]} wide but the enum has {len(self._act_names)} entries"
            )
        return out

    def seat_slot_map(self, r: int) -> torch.Tensor:
        """[B, simbase.SEAT0_POOL_MAX] the v-slot index behind each civ-r unit row (slot
        order = spawn order, padded with -1) — every seat's units head rides the
        same simbase.SEAT0_POOL_MAX row layout."""
        B = self.B
        civ_units = self.civ_unit_alive & (self.civ_unit_civ == r)  # [B, simbase.POOL_MAX]
        rank = civ_units.long().cumsum(dim=1) - 1  # rank among the civ's alive slots
        out = torch.full((B, simbase.SEAT0_POOL_MAX), -1, dtype=torch.long, device=self.device)
        take = civ_units & (rank < simbase.SEAT0_POOL_MAX)
        bs, slots = take.nonzero(as_tuple=True)
        out[bs, rank[bs, slots]] = slots
        return out

    def seat_unit_mask(self, r: int) -> torch.Tensor:
        """[B, simbase.SEAT0_POOL_MAX, A] valid orders per CONTROLLED civ-r unit, in the
        same head layout `unit_action_mask` uses: 0-5 step (seat-aware
        blocking), 6-11 attack the barbarian there or — at war — the enemy
        unit/centre there, 12 hold, 13/14/15 build FARM/MINE/LUMBER under the
        civ's own unlocks. The mask is OPTIMISTIC; execution re-validates."""
        B, dev = self.B, self.device
        smap = self.seat_slot_map(r)
        present = smap >= 0
        sc = smap.clamp(min=0)
        tile = self.civ_unit_tile.gather(1, sc)  # [B, simbase.SEAT0_POOL_MAX]
        nb = self.neigh[tile.clamp(min=0).reshape(-1)].reshape(B, simbase.SEAT0_POOL_MAX, 6)
        nbc = nb.clamp(min=0).reshape(B, -1)
        # two gathers, then the occupant's SEAT answers each per-pool question.
        _ms = self.military_at.gather(1, nbc)
        _cs = self.civilian_at.gather(1, nbc)
        _mseat = torch.where(_ms >= 0, self.unit_seat.gather(1, _ms.clamp(min=0)), torch.full_like(_ms, -1))
        _cseat = torch.where(_cs >= 0, self.unit_seat.gather(1, _cs.clamp(min=0)), torch.full_like(_cs, -1))
        barb = (_mseat == BARB_SEAT).reshape(B, simbase.SEAT0_POOL_MAX, 6)
        pmil = (_mseat == 0).reshape(B, simbase.SEAT0_POOL_MAX, 6)
        pciv = (_cseat == 0).reshape(B, simbase.SEAT0_POOL_MAX, 6)
        vmn = torch.where((_mseat > 0) & (_mseat != BARB_SEAT), _ms - self.POOL_LO["civ"], torch.full_like(_ms, -1))
        rcn = torch.where((_cseat > 0) & (_cseat != BARB_SEAT), _cs - self.POOL_LO["civ"], torch.full_like(_cs, -1))
        passable = self.passable.gather(1, nbc).reshape(B, simbase.SEAT0_POOL_MAX, 6)
        on_map = nb >= 0
        is_civ = (self._type_charges[self.civ_unit_type.gather(1, sc)] > 0).unsqueeze(2)  # builders
        alive = present.unsqueeze(2)
        # The water half of the step gate mirrors the war march's own term:
        # wpass, ocean behind cartography, land units only while embark is live
        # (naval hulls keep wpass through `passable`'s own semantics).
        # `_step_verb` still re-validates cost/afford at execution.
        if self._embark_live:
            _vt_mv = self.civ_unit_type.gather(1, sc).clamp(min=0, max=self.NU - 1)
            _is_nav_mv = self.unit_naval[_vt_mv].unsqueeze(2)
            _cart_r = (
                self.civ_only_techs[:, r, self._cartography_tech]
                if self._cartography_tech >= 0
                else torch.zeros(B, dtype=torch.bool, device=dev)
            ).view(B, 1, 1)
            # AT WAR ONLY: a grounded land unit stays land-only — no embarking
            # at peace. Military embarks on SHIPBUILDING; CARTOGRAPHY only opens
            # OCEAN, so both techs are terms of this gate.
            _ship_r = (
                self.civ_only_techs[:, r, self._shipbuilding_tech]
                if self._shipbuilding_tech >= 0
                else torch.zeros(B, dtype=torch.bool, device=dev)
            ).view(B, 1, 1)
            _wgate = (
                self.wpass.gather(1, nbc).reshape(B, simbase.SEAT0_POOL_MAX, 6)
                & (~self.ocean_tile.gather(1, nbc).reshape(B, simbase.SEAT0_POOL_MAX, 6) | _cart_r)
                & _ship_r
                & ~_is_nav_mv
                # AT WAR WITH ANYONE: the war walker has no per-enemy term
                # (running it IS the war context), so gating on civ_only_atwar alone
                # (war with seat 0) would refuse every civ-vs-civ embark.
                & (self.civ_only_atwar[:, r] | self.civ_pair_war[:, r].any(dim=1)).view(B, 1, 1)
            )
        else:
            _wgate = torch.zeros(B, simbase.SEAT0_POOL_MAX, 6, dtype=torch.bool, device=dev)
        # ENEMY centres can't be entered (real Civ 6) — capture comes through
        # ATTACK. Occupancy-based blocking never sees centre TILES, so the
        # centre block is spelled out here. Own-civ centres stay enterable
        # (garrisoning your own city is legal).
        _rvc_mv = self.civ_city_at.gather(1, nbc).reshape(B, simbase.SEAT0_POOL_MAX, 6)
        # only ENEMY centres are closed, so a NEUTRAL civ's centre is walkable:
        # the vc arm gates on civ_pair_war. Seat 0's centres stay blocked (no
        # capture-by-walk).
        _rvc_war_mv = (
            (_rvc_mv >= 0)
            & (_rvc_mv != r)
            & self.civ_pair_war[:, r].gather(1, _rvc_mv.clamp(min=0).reshape(B, -1)).reshape(B, simbase.SEAT0_POOL_MAX, 6)
        )
        # NO city-state term: the march's step scan has no centre term at all
        # ("can't be entered" lives in the TARGET-stop logic, not the step
        # scan), so the mask must not block what the engine walks.
        _centre_block = (
            _rvc_war_mv
            | (self.center_at.gather(1, nbc).reshape(B, simbase.SEAT0_POOL_MAX, 6) >= 0)
        )
        # the step-scan gate is `_blocked_for`, the same body the march calls —
        # STACKING plus the ENCAMPMENT WALL (a live enemy Encampment bars entry;
        # it is a DISTRICT, so occupancy probes read its tile as empty). One
        # legality rule, both surfaces.
        _nbf = nbc  # [B, simbase.SEAT0_POOL_MAX*6]
        _blk_mil = self._blocked_for(_nbf, r + 1).reshape(B, simbase.SEAT0_POOL_MAX, 6)
        _blk_civ = self._blocked_for(_nbf, r + 1, is_civilian=True).reshape(B, simbase.SEAT0_POOL_MAX, 6)
        _blk_sel = torch.where(is_civ, _blk_civ, _blk_mil)
        # NAVAL movers: the terrain term is `where(is_naval, water_gate,
        # land | embark)` — a galley NEVER walks on land. Naval water is gated
        # on cartography-for-ocean only (SHIPBUILDING is the LAND unit's embark
        # tech) and is NOT war-gated: a galley sails at peace.
        if self._embark_live:
            _nav_water = (
                self.wpass.gather(1, nbc).reshape(B, simbase.SEAT0_POOL_MAX, 6)
                & (~self.ocean_tile.gather(1, nbc).reshape(B, simbase.SEAT0_POOL_MAX, 6) | _cart_r)
            )
            _terr_mv = torch.where(_is_nav_mv, _nav_water, passable | _wgate)
        else:
            _terr_mv = passable
        move = on_map & _terr_mv & ~_blk_sel & ~_centre_block & alive
        # CLIFF EDGES, applied at step level exactly as the march applies
        # _cliff_block_dirs. Per-row loop bounded by live units — rows empty
        # across the whole batch break out, the same pattern as the war-target
        # loop in seat_unit_obs.
        if self._embark_live:
            _own_r = self.civ_at == r
            for _n in range(simbase.SEAT0_POOL_MAX):
                if not bool(present[:, _n].any()):
                    break
                _clf = self._cliff_block_dirs(tile[:, _n].clamp(min=0), nb[:, _n], _own_r)
                move[:, _n] = move[:, _n] & ~_clf
        can_fight = (self._type_combat[self.civ_unit_type.gather(1, sc)] > 0).unsqueeze(2)
        at_war = self.civ_only_atwar[:, r].reshape(B, 1, 1)
        p_target = (pmil | pciv | (self.center_at.gather(1, nbc) >= 0).reshape(B, simbase.SEAT0_POOL_MAX, 6)) & at_war
        # the MELEE-only target classes:
        #   * enemy AT-WAR civ UNITS (a civ's ranged never attacks enemy civs)
        #   * enemy at-war civ CENTRES (d == 1)
        #   * seat-0-suzerain CS centres while hostile to seat 0 (joining the
        #     suzerain's war; d == 1)
        _vt_att = self.civ_unit_type.gather(1, sc).clamp(min=0, max=self.NU - 1)
        _melee_att = (self._type_ranged_strength[_vt_att] <= 0).unsqueeze(2)
        _vciv_nb = torch.where(vmn >= 0, self.civ_unit_civ.gather(1, vmn.clamp(min=0)), torch.full_like(vmn, -1))
        # BOTH halves of the war act's target set (`war_m | war_c`): enemy
        # CIVILIANS are war targets too. rcn (the civilian map's civ slots) was
        # computed above for the stacking terms and is reused here.
        _rvcivC_nb = torch.where(rcn >= 0, self.civ_unit_civ.gather(1, rcn.clamp(min=0)), torch.full_like(rcn, -1))
        _civ_pair_u = (
            ((_vciv_nb >= 0) & self.civ_pair_war[:, r].gather(1, _vciv_nb.clamp(min=0)))
            | ((_rvcivC_nb >= 0) & self.civ_pair_war[:, r].gather(1, _rvcivC_nb.clamp(min=0)))
        ).reshape(B, simbase.SEAT0_POOL_MAX, 6)
        _rvc_nb = self.civ_city_at.gather(1, nbc)
        _civ_pair_c = ((_rvc_nb >= 0) & self.civ_pair_war[:, r].gather(1, _rvc_nb.clamp(min=0))).reshape(B, simbase.SEAT0_POOL_MAX, 6)
        S_ = self.S
        _suz_min = int(self.rules.cityStates.get("suzerainMin", 3)) if hasattr(self.rules, "cityStates") and isinstance(getattr(self.rules, "cityStates", None), dict) else 3
        _suz_p = (
            (self.citystate_envoys[:, :S_] >= _suz_min)
            & (self.citystate_envoys[:, :S_] > self.civ_only_citystate_envoys[:, :, :S_].max(dim=1).values)
            & self.citystate_alive[:, :S_]
        )
        _citystate_nb = self.citystate_at.gather(1, nbc)
        _citystate_ctr = torch.zeros(B, self.T, dtype=torch.bool, device=dev)
        _citystate_ctr.scatter_(1, self.citystate_center[:, :S_].clamp(min=0), _suz_p)
        _citystate_tgt = (_citystate_ctr.gather(1, nbc) & (_citystate_nb >= 0)).reshape(B, simbase.SEAT0_POOL_MAX, 6) & at_war
        civ_pair_target = (_civ_pair_u | _civ_pair_c | _citystate_tgt) & _melee_att
        # EMBARKED UNITS CANNOT ATTACK — the war act's own gate is
        # `attack = act & ... & ~civ_unit_emb`.
        _emb_att = self.civ_unit_emb.gather(1, sc).unsqueeze(2)
        attack = on_map & (barb | p_target | civ_pair_target) & can_fight & ~_emb_att & alive
        hold = present.unsqueeze(2)
        tc = tile.clamp(min=0)  # `chop` below reads this outside the branch
        _res_cols_r: list[torch.Tensor] = []
        if self.improvements_on and self._builder_idx >= 0:
            hf = self.civ_only_civics[:, r, self._hillfarms_civic].unsqueeze(1) if self._hillfarms_civic >= 0 else torch.zeros(B, 1, dtype=torch.bool, device=dev)
            mining = self.civ_only_techs[:, r, self._mine_unlock_tech].unsqueeze(1) if self._mine_unlock_tech >= 0 else torch.zeros(B, 1, dtype=torch.bool, device=dev)
            constr = self.civ_only_techs[:, r, self._lumber_unlock_tech].unsqueeze(1) if self._lumber_unlock_tech >= 0 else torch.zeros(B, 1, dtype=torch.bool, device=dev)
            here_ok = (
                present
                & (self.civ_unit_type.gather(1, sc) == self._builder_idx)
                & (self.civ_unit_charges.gather(1, sc) > 0)
                & (self.civ_at.gather(1, tc) == r)
                & (self.civ_city_at.gather(1, tc) < 0)
                & (self.improvement.gather(1, tc) < 0)
                & (self.district.gather(1, tc) < 0)
                & (self.built_wonder.gather(1, tc) < 0)  # an in-flight wonder pave refuses improvements
            )
            farmable = self.farm_flat.gather(1, tc) | (self.farm_hill.gather(1, tc) & hf)
            build_f = (here_ok & farmable).unsqueeze(2)
            build_m = (here_ok & self.mine_ok.gather(1, tc) & mining).unsqueeze(2)
            build_l = (here_ok & self.lumber_ok.gather(1, tc) & ~self.feat_stripped.gather(1, tc) & constr).unsqueeze(2)  # chopped woods -> no lumber mill
        else:
            zc = torch.zeros(B, simbase.SEAT0_POOL_MAX, 1, dtype=torch.bool, device=dev)
            build_f = build_m = build_l = zc
        if self.improvements_on and self._builder_idx >= 0:
            # the RESOURCE improvements, mirroring seat 0's `_res_cols` but
            # gated on THIS CIV's techs. `here_ok` is the seat's twin of `_base`
            # (builder, charges, own tile, nothing already on it), so only the
            # unlock source differs.
            _rq_r = self.res_imp.gather(1, tc)  # required improvement idx, -1 = none
            for _k in range(3, self._imp_unlock.numel()):
                _ut = int(self._imp_unlock[_k])
                _unl = (
                    self.civ_only_techs[:, r, _ut].unsqueeze(1) if _ut >= 0
                    else torch.ones(B, 1, dtype=torch.bool, device=dev)
                )
                if self.SEASIDE >= 0 and _k == self.SEASIDE:
                    _okk = here_ok & self._seaside_ok().gather(1, tc) & _unl
                else:
                    _okk = here_ok & (_rq_r == _k) & _unl
                _res_cols_r.append(_okk.unsqueeze(2))
        # civ builders chop on the same rule: removable feature present, THAT
        # CIV's removal tech in, unstripped.
        ftr_t = self.tile_ftr.gather(1, tc)
        ftu_t = self.tile_ftu.gather(1, tc)
        unlocked = self.civ_only_techs[:, r, :].gather(1, ftu_t.clamp(min=0)) & (ftu_t >= 0)
        chop = (is_civ.squeeze(2) & (self.civ_unit_charges.gather(1, sc) > 0) & (ftr_t > 0) & unlocked & ~self.feat_stripped.gather(1, tc)).unsqueeze(2)
        # the same MP gate `unit_action_mask` applies — one rule, both seats.
        has_mp = (self.civ_unit_mp.gather(1, sc) > 0).unsqueeze(2)
        move = move & has_mp
        attack = attack & has_mp
        # REPAIR — the job `_civ_job_mask`'s PILLAGED branch runs. Ownership is
        # the CIV plane: `self.owner` is seat 0's per-city map and means nothing
        # here.
        _bidx_ok = (
            (self.civ_unit_type.gather(1, sc) == self._builder_idx) if self._builder_idx >= 0
            else torch.zeros_like(present)
        )
        repair_r = (
            present
            & _bidx_ok
            & (self.civ_at.gather(1, tc) == r)
            & (self.pillaged.gather(1, tc) | self.district_pillaged.gather(1, tc))
        ).unsqueeze(2)
        # PILLAGE — the twin of seat 0's column. A military unit on an ENEMY
        # tile with a live improvement, or a complete non-centre unpillaged
        # district. Enemy for a civ = seat 0's land while at war with it, or any
        # city-state's.
        _enemy_r = (
            ((self.owner.gather(1, tc) >= 0) & self.civ_only_atwar[:, r].unsqueeze(1))
            | (self.citystate_at.gather(1, tc) >= 0)
        )
        _has_imp_r = (self.improvement.gather(1, tc) >= 0) & ~self.pillaged.gather(1, tc)
        _has_dis_r = (
            (self.district.gather(1, tc) >= 0)
            & self.district_complete.gather(1, tc)
            & ~self.district_pillaged.gather(1, tc)
            & (self.center_at.gather(1, tc) < 0)
            & (self.civ_city_at.gather(1, tc) < 0)
        )
        _mil_r = self._type_combat[self.civ_unit_type.gather(1, sc).clamp(min=0)] > 0
        pillage_r = (present & _mil_r & _enemy_r & (_has_imp_r | _has_dis_r)).unsqueeze(2)
        # SNIPE_0..11 — the distance-2 ring, LIVE for the civ. Legal iff this
        # unit is ranged with range >= 2, not embarked, and the k-th ring tile
        # holds a REAL target: a barbarian always; a seat-0 unit or centre while
        # at war with seat 0. Targets the resolver would refuse into a HOLD
        # (other civs' centres) are NOT offered — a mask column whose execution
        # is a guaranteed no-op teaches a policy that the verb is worthless.
        vt_sn = self.civ_unit_type.gather(1, sc).clamp(min=0, max=self.NU - 1)
        _rngd_sn = (self._type_ranged_strength[vt_sn] > 0) & (self._type_ranged_range[vt_sn] >= 2)
        _emb_sn = self.civ_unit_emb.gather(1, sc)
        ring = self.ring2[tc]                     # [B, simbase.SEAT0_POOL_MAX, 12]
        ringc = ring.clamp(min=0).reshape(B, -1)  # [B, simbase.SEAT0_POOL_MAX*12]
        _rm = self.military_at.gather(1, ringc)
        _rc_ = self.civilian_at.gather(1, ringc)
        _rms = torch.where(_rm >= 0, self.unit_seat.gather(1, _rm.clamp(min=0)), torch.full_like(_rm, -1))
        _rcs = torch.where(_rc_ >= 0, self.unit_seat.gather(1, _rc_.clamp(min=0)), torch.full_like(_rc_, -1))
        _barb_ring = (_rms == BARB_SEAT).reshape(B, simbase.SEAT0_POOL_MAX, 12)
        _pu_ring = ((_rms == 0) | (_rcs == 0)).reshape(B, simbase.SEAT0_POOL_MAX, 12)
        _pc_ring = (self.center_at.gather(1, ringc) >= 0).reshape(B, simbase.SEAT0_POOL_MAX, 12)
        _hp_sn = self.civ_only_atwar[:, r].view(B, 1, 1)
        snipe_r = (
            present.unsqueeze(2)
            & _rngd_sn.unsqueeze(2)
            & ~_emb_sn.unsqueeze(2)
            & (ring >= 0)
            & (_barb_ring | ((_pu_ring | _pc_ring) & _hp_sn))
        )
        _sn_r = [snipe_r] if getattr(self, "_snipe_on", False) else []
        # FOUND_CITY: legal for a live SETTLER (optimistic — canFoundCity is
        # re-validated at apply).
        _fd_r = (
            [(present & (vt_sn == self._settler_idx)).unsqueeze(2)]
            if getattr(self, "_A_FOUND", -1) >= 0 and self._settler_idx >= 0
            else ([torch.zeros(B, simbase.SEAT0_POOL_MAX, 1, dtype=torch.bool, device=dev)] if getattr(self, "_A_FOUND", -1) >= 0 else [])
        )
        out = torch.cat(
            [move, attack, hold, build_f, build_m, build_l, chop, repair_r] + _res_cols_r + [pillage_r] + _sn_r
            + ([torch.zeros_like(hold).expand(-1, -1, 7)] if getattr(self, "_A_SPREAD", -1) >= 0 else [])
            + _fd_r,
            dim=2,
        )
        # the SAME width assert `unit_action_mask` carries — a guard on one seat
        # is not a guard.
        if self._act_names and self.improvements_on and self._builder_idx >= 0:
            assert out.shape[-1] == len(self._act_names), (
                f"seat_unit_mask is {out.shape[-1]} wide but the enum has {len(self._act_names)} entries"
            )
        return out

    #: per-unit observation layout. Keep in step with `_unit_obs`.
    UNIT_OBS = (
        "d_home",           # 0    distance to this seat's nearest live city
        *(f"d_home_n{i}" for i in range(6)),   # 1-6  same, per neighbour
        *(f"nb_tile{i}" for i in range(6)),    # 7-12 neighbour tile index, -1 = none
        "mp", "charges", "is_civilian",        # 13-15
        # the WAR half: the march destination is a FIXED enemy target — nearest
        # unpillaged enemy improvement/district within 13, else the nearest
        # enemy city (seat 0 wins ties). The rule that CHOOSES between them is
        # policy and lives in the ladder; the observation carries the
        # distances, 1-hop like d_home.
        "at_war",                              # 16
        "d_war",            # 17   distance to the chosen war target (BIG if none)
        *(f"d_war_n{i}" for i in range(6)),    # 18-23 same, per neighbour
        # the ring-2 tile ids, so the attack pick can interleave adjacent and
        # ring targets by TILE INDEX (the engine scans all tiles in index
        # order — d1 and d2 targets compete on one key). -1 = no tile (edge).
        *(f"ring_tile{i}" for i in range(12)),  # 24-35
    )

    def _unit_obs(self, tile, present, centers, calive, mp, charges, utype,
                  at_war=None, war_tgt=None):
        """[B, N, 36] the per-unit half of the observation, seat-generic.

        The masks say WHICH ORDERS ARE LEGAL, never which one the verb wants.
        "How far is home, and which neighbour is closer" is what a policy needs
        and nothing in the empire/city/civ scalars carries it. Distances are
        what the OBSERVATION owes the verb; the direction tie-break and the stop
        radius stay POLICY and live in gpu/ladder.py.

        One body for every seat: seat 0 passes `site`/`seat0_unit_tile`, a civ passes
        `civ_city_center[:, r]`/its slot-mapped tiles.
        """
        B, N = tile.shape
        dev, dt = self.device, self.dtype
        BIG = float(self.T)
        tc = tile.clamp(min=0)
        nb = self.neigh[tc]                                   # [B, N, 6]
        nbc = nb.clamp(min=0).reshape(B, N * 6)

        d_home = torch.full((B, N), BIG, dtype=dt, device=dev)
        d_nb = torch.full((B, N * 6), BIG, dtype=dt, device=dev)
        for c in range(centers.shape[1]):
            ok = (calive[:, c] & (centers[:, c] >= 0)).unsqueeze(1)
            ctr = centers[:, c].clamp(min=0).unsqueeze(1)
            d_home = torch.where(ok, torch.minimum(d_home, self.pair_dist[tc, ctr].to(dt)), d_home)
            d_nb = torch.where(ok, torch.minimum(d_nb, self.pair_dist[nbc, ctr].to(dt)), d_nb)
        # a missing neighbour is unreachable, not adjacent to home
        d_nb = torch.where(nb.reshape(B, N * 6) >= 0, d_nb, torch.full_like(d_nb, BIG)).reshape(B, N, 6)

        civ = (self._type_combat[utype.clamp(min=0, max=self.NU - 1)] <= 0)
        # the WAR half. `war_tgt` [B, N] is PER UNIT — the march destination
        # is the nearest enemy improvement within 13 OF THAT UNIT (else nearest
        # enemy city), so a per-seat target would misdirect every unit but one.
        # It comes from `_war_march_target`, the SAME implementation the march
        # itself calls, so the observation cannot drift from the rule it feeds.
        # -1 rows mean no target; their distances read BIG.
        if at_war is None:
            at_war = torch.zeros(B, dtype=torch.bool, device=dev)
        if war_tgt is None:
            war_tgt = torch.full((B, N), -1, dtype=torch.long, device=dev)
        has_wt = at_war.unsqueeze(1) & (war_tgt >= 0)
        wtc = war_tgt.clamp(min=0)
        d_war = torch.where(has_wt, self.pair_dist[tc, wtc].to(dt),
                            torch.full((B, N), BIG, dtype=dt, device=dev))
        wt6 = wtc.unsqueeze(2).expand(B, N, 6).reshape(B, N * 6)
        d_war_nb = torch.where(has_wt.unsqueeze(2).expand(B, N, 6).reshape(B, N * 6),
                               self.pair_dist[nbc, wt6].to(dt),
                               torch.full((B, N * 6), BIG, dtype=dt, device=dev))
        d_war_nb = torch.where(nb.reshape(B, N * 6) >= 0, d_war_nb,
                               torch.full_like(d_war_nb, BIG)).reshape(B, N, 6)
        out = torch.cat(
            [
                d_home.unsqueeze(2),
                d_nb,
                nb.to(dt),
                mp.to(dt).unsqueeze(2),
                charges.to(dt).unsqueeze(2),
                civ.to(dt).unsqueeze(2),
                at_war.to(dt).unsqueeze(1).expand(B, N).unsqueeze(2),
                d_war.unsqueeze(2),
                d_war_nb,
                self.ring2[tc].to(dt),   # [B, N, 12] ring tile ids, -1 pad
            ],
            dim=2,
        )
        return torch.where(present.unsqueeze(2), out, torch.zeros_like(out))

    def unit_obs(self) -> torch.Tensor:
        """[B, simbase.SEAT0_POOL_MAX, 36] seat 0's per-unit observation."""
        return self._unit_obs(
            self.seat0_unit_tile, self.seat0_unit_alive, self.site, self.site >= 0,
            self.seat0_unit_mp, self.seat0_unit_charges, self.seat0_unit_type,
        )

    def seat_unit_obs(self, r: int) -> torch.Tensor:
        """[B, simbase.SEAT0_POOL_MAX, 36] a civ's per-unit observation, the same layout
        every seat uses so one policy reads either."""
        smap = self.seat_slot_map(r)
        sc = smap.clamp(min=0)
        # the WAR columns. at_war = hostile to seat 0 OR to any other civ. The
        # march target is PER UNIT (`_war_march_target` takes the unit's own
        # tile — nearest enemy improvement within 13 OF IT), so the shared
        # method runs once per occupied row; civs field a handful of units, and
        # rows empty across the whole batch are skipped.
        B, dev = self.B, self.device
        present = smap >= 0
        tiles = self.civ_unit_tile.gather(1, sc)
        hp_r = self.civ_only_atwar[:, r]
        # civ_pair_war is [b, ownCiv, otherCiv] with 0-based civ indices (see the
        # picker's `civ_pair_war[arange, ac, r2]`), so row r, not 1+r.
        civ_pair_any = self.civ_pair_war[:, r].any(dim=1) if self.R > 0 else torch.zeros(B, dtype=torch.bool, device=dev)
        at_war = hp_r | civ_pair_any
        ac = torch.full((B,), r, dtype=torch.long, device=dev)
        war_tgt = torch.full((B, smap.shape[1]), -1, dtype=torch.long, device=dev)
        if bool(at_war.any()):
            for n in range(int(present.any(dim=0).sum())):
                if not bool(present[:, n].any()):
                    break
                tgt_n, hi, hpc, hrc = self._war_march_target(tiles[:, n].clamp(min=0), ac, hp_r)
                has = (hi | hpc | hrc) & present[:, n] & at_war
                war_tgt[:, n] = torch.where(has, tgt_n, war_tgt[:, n])
        return self._unit_obs(
            tiles, present,
            self.civ_city_center[:, r], self.civ_city_alive[:, r],
            self.civ_unit_mp.gather(1, sc), self.civ_unit_charges.gather(1, sc),
            self.civ_unit_type.gather(1, sc),
            at_war=at_war, war_tgt=war_tgt,
        )

    def apply_seat_unit_sequence(self, r: int, seq: torch.Tensor) -> None:
        """Apply a unit's order as a SHORT DIRECTION SEQUENCE [B, simbase.SEAT0_POOL_MAX, K].

        A unit walks REAL MP and covers several tiles in a turn, so one order
        per unit-turn cannot express a full move; the sequence is what lets the
        ACTION SPACE reach the mobility the engine allows.

        Column k is applied in order. Only MOVE columns (0-5) continue a
        sequence: any other verb ends the unit's turn, so k>0 entries are
        blanked for units that did something else.

        NO NEW MP BOOKKEEPING. `_step_verb` owns the contract ("movesLeft <
        cost && movesLeft < full refuses, so a unit at FULL MP always gets its
        first step"), so a unit out of movement simply has its next step refused
        and later columns are no-ops.

        The ENGINE NEVER EXTENDS A MOVE. Every step it walks was named by the
        policy; "repeat the chosen direction until MP is spent" would put a
        movement policy back inside the engine.
        """
        if seq.dim() != 3:
            raise AssertionError(f"unit sequence must be [B, simbase.SEAT0_POOL_MAX, K], got {tuple(seq.shape)}")
        for k in range(int(seq.shape[2])):
            a_k = seq[:, :, k].to(torch.long)
            if k > 0:
                # a non-move verb consumed the turn at an earlier rank
                a_k = torch.where(a_k < 6, a_k, torch.full_like(a_k, -1))
            if not bool((a_k >= 0).any()):
                return
            self._apply_seat_unit_actions(r, a_k)
