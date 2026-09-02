from __future__ import annotations

from .simbase import *  # noqa: F401,F403 — torch, constants, helpers
from .simbase import _MUTABLE  # noqa: F401 — private names do not ride a star import
from . import simbase  # the PATCHABLE globals (the pool caps/_ALIAS_CHECK) must be read live


class SimMasks:
    def production_mask(self) -> torch.Tensor:
        """[B, RC, W] valid production actions for seat 0's idle cities.

        Seat 0's row of `_seat_production_mask` — the ONE body every seat row
        asks, in the ONE production layout (cpu/core/prodLayout.ts). Seat 0 has
        no mask of its own: a second body is how a seat quietly acquires its own
        legality."""
        return self._seat_production_mask(0)

    def _seat_tech_mask(self, row: int) -> torch.Tensor:
        # EVERY available tech, whether or not one is already underway: real
        # Civ 6 lets a seat switch research at any moment, and `availableTechsIn`
        # never consulted the current selection either. The old
        # `cur_tech == -1` term made the whole tech head illegal for as long as
        # anything was being researched — measured at t60 of seed 9002, a seat
        # with 9 techs had 0 of 68 legal — so "switch research" was a move no
        # policy could express and none could learn.
        return self._available_mask(self.civ_techs[:, row], self._prereq_t)

    def _seat_civic_mask(self, row: int) -> torch.Tensor:
        return self._available_mask(self.civ_civics[:, row], self._prereq_c)

    def tech_mask(self) -> torch.Tensor:
        return self._seat_tech_mask(0)

    def civic_mask(self) -> torch.Tensor:
        return self._seat_civic_mask(0)

    def _seat_envoy_mask(self, row: int) -> torch.Tensor:
        return (self.citystate_alive & self.seat_citystate_met[:, row]
                & (self.civ_envoys_avail[:, row] > 0).unsqueeze(1))

    def envoy_mask(self) -> torch.Tensor:
        return self._seat_envoy_mask(0)

    def war_targets(self, row: int) -> list[int]:
        """The seat ROWS this row's war head addresses: every OTHER major in
        ascending seat order, then the whole city-state roster in ascending id
        order. `warTargets`' twin. The width is fixed for the game — a captured
        minor keeps its column and the column is simply never legal again."""
        majors = [k if k < row else k + 1 for k in range(self.n_majors - 1)]
        return majors + [self.n_majors + s for s in range(self.S)]

    def _cs_suzerain_at_war(self, row: int) -> torch.Tensor:
        """[B, S] — is any seat this row is AT WAR with the suzerain of this
        minor? `sueForPeaceWithCityState`'s block: a minor will not talk while
        its patron is still fighting you."""
        out = torch.zeros(self.B, self.S, dtype=torch.bool, device=self.device)
        for x in range(self.n_majors):
            if x == row:
                continue
            out = out | (self._suzerain_mask(x)[:, : self.S] & self.war[:, row, x].unsqueeze(1))
        return out

    def _seat_war_mask(self, row: int) -> torch.Tensor:
        B, dev = self.B, self.device
        n_opp = self.n_majors - 1
        tgt = self.war_targets(row)
        n = len(tgt)
        if n == 0 or not self._rl_war_active:
            return torch.zeros(B, 2 * n, dtype=torch.bool, device=dev)
        rr = self.rules.seats
        idx = torch.tensor(tgt, dtype=torch.long, device=dev)
        cols = [self.civ_alive[:, t] for t in tgt[:n_opp]]
        # A MINOR column needs the MEETING as well: `declareWarOnCityState`
        # refuses an unmet city-state, and a captured one has left the roster.
        cols += [self.citystate_alive[:, s] & self.seat_citystate_met[:, row, s]
                 for s in range(self.S)]
        live = self.civ_alive[:, row].unsqueeze(1) & torch.stack(cols, dim=1)
        at_war = self.war[:, row, idx]                      # [B, n_targets]
        wt = self.war_turns[:, row, idx]                    # [B, n_targets] THIS war's clock
        cost = rr.get("peaceGold0", 150) + rr.get("peaceGoldSlope", 10) * wt.to(torch.float64)
        declare = live & ~at_war & (self.treaty_turns[:, row, idx] == 0)
        # PEACE. A major sells it for gold up the clock's curve; a minor
        # "will always accept an offer of peace without preconditions" and
        # charges nothing, but will not talk while its suzerain is at war.
        afford = torch.cat([
            self._afford(self.civ_treasury[:, row].unsqueeze(1), cost[:, :n_opp]),
            ~self._cs_suzerain_at_war(row),
        ], dim=1)
        peace = live & at_war & (wt >= rr.get("warMinTurns", 14)) & afford
        return torch.cat([declare, peace], dim=1)


    def _detect_seat_boosts(self, row: int, active: torch.Tensor) -> None:
        """detectBoosts for seat row `row` — ONE
        body, because `checkSatisfied` is seat-generic in TS: every condition
        reads either THIS seat's cities/research/territory or a map-global
        fact, and no arm asks which seat is asking.

        Runs at the row's own block top in the seatPhase loop. `active` is the
        TS loop's eliminated-actor continue — a cityless seat detects nothing.
        """
        alive = self.city_alive[:, row]
        pop = self.city_pop[:, row]
        pop_sum = None
        for brow in self.rules.boosts:
            kind = brow["kind"]
            if kind == "building":
                pred = (self.city_bldg[:, row, :, brow["b"]] & alive).sum(dim=1) >= brow["count"]
            elif kind == "cityPop":
                pred = ((pop >= brow["pop"]) & alive).any(dim=1)
            elif kind == "totalPop":
                if pop_sum is None:
                    pop_sum = (pop * alive.to(pop.dtype)).sum(dim=1)
                pred = pop_sum >= brow["pop"]
            elif kind == "coastalCity":
                # isCoastalLand at each live centre, read off the static tile
                # plane (a dead slot's centre is masked out by `alive`).
                pred = (alive & self.coastal_land.gather(1, self.city_center[:, row].clamp(min=0))).any(dim=1)
            elif kind == "cities":
                pred = alive.sum(dim=1) >= brow["count"]
            elif kind == "greatPeople":
                pred = (self.gp_earned.sum(dim=1) if brow["cls"] < 0 else self.gp_earned[:, brow["cls"]]) >= brow["count"]
            elif kind == "tech":
                pred = self.civ_techs[:, row, brow["t"]]
            elif kind == "anyWonderBuilt":
                pred = self.built_wonder_complete.any(dim=1)
            elif kind == "nearNaturalWonder":
                pred = ((self.tile_seat == row) & self.wonder_near).any(dim=1)
            elif kind == "improvement":
                # a GLOBAL tile scan — TS walks state.map.tiles with no owner
                # filter (pillaged still counts), so one formula serves every
                # seat.
                on = self.improvement == brow["imp"]
                if brow.get("onResource"):
                    on = on & (self.res_priority > 0)
                pred = on.sum(dim=1) >= brow["count"]
            elif kind == "district":
                # The CITY REGISTRY is the list TS walks (`c.districts` of
                # citiesOf(seat)), gated on the TILE's districtComplete. A
                # captured district leaves the registry with its city, so the
                # registry needs no liveness term of its own.
                dtype = brow.get("dtype", -1)
                dt = self.city_dist_tile[:, row]
                comp = self.district_complete.gather(1, dt.clamp(min=0).reshape(self.B, -1)).reshape_as(dt)
                on = (dt >= 0) & comp & alive.unsqueeze(2)
                if dtype < 0:
                    # boosts.ts: with no check.type, only districts that COUNT
                    # TOWARD THE LIMIT qualify (specialty) — aqueducts and the
                    # other support districts are excluded.
                    if brow.get("distinct"):
                        pred = (on.any(dim=1) & self._is_specialty.reshape(1, -1)).sum(dim=1) >= brow["count"]
                    else:
                        pred = (on & self._is_specialty.reshape(1, 1, -1)).sum(dim=(1, 2)) >= brow["count"]
                elif bool(self._is_repeatable[dtype]):
                    # A city may hold SEVERAL of a repeatable district and the
                    # registry keeps ONE tile per type, so the registry cannot
                    # count them. TS walks every `c.districts` entry, which is
                    # the tile plane here — complete, in a live city of this
                    # row. Pillaged still counts, exactly as TS has it.
                    ids = self.city_id[:, row]  # [B, RC]
                    okd = ((self.district == dtype) & self.district_complete
                           & (self.tile_seat == row))
                    per = (okd.unsqueeze(2) & (self.tile_city.unsqueeze(2) == ids.unsqueeze(1))
                           & alive.unsqueeze(1))
                    pred = per.sum(dim=(1, 2)) >= brow["count"]
                else:
                    pred = on[:, :, dtype].sum(dim=1) >= brow["count"]
            elif kind == "policies":
                if self._gov_has_effects and self._npol:
                    pred = self._gov_mods(row)[4].sum(dim=1) >= brow["count"]
                else:
                    pred = torch.zeros(self.B, dtype=torch.bool, device=self.device)
            else:
                continue
            hit = active & pred
            idx = brow["idx"]
            if brow["target"] == "tech":
                # FREE INQUIRY pays era score per EUREKA — fire only where the
                # boost NEWLY lands (the TS `newly` twin).
                done = self.civ_techs[:, row, idx]
                # `newly` must be materialised BEFORE the |=: the boosted
                # slice is a VIEW, so an in-place or would answer the
                # already-updated plane and every era-score event would vanish.
                newly = hit & ~done & ~self.civ_tech_boosted[:, row, idx]
                self.civ_tech_boosted[:, row, idx] |= hit & ~done
                self._dedication_event(row, 1, newly)
            else:
                done = self.civ_civics[:, row, idx]
                newly = hit & ~done & ~self.civ_civic_boosted[:, row, idx]
                self.civ_civic_boosted[:, row, idx] |= hit & ~done
                self._dedication_event(row, 2, newly)


    def _next_random(self, mask: torch.Tensor) -> torch.Tensor:
        a = (self.rng_state + 0x6D2B79F5) & M32
        t = ((a ^ (a >> 15)) * (1 | a)) & M32
        t = (((t + (((t ^ (t >> 7)) * (61 | t)) & M32)) & M32) ^ t) & M32
        out = ((t ^ (t >> 14)) & M32).to(torch.float64) / 4294967296.0
        self.rng_state.copy_(torch.where(mask, a, self.rng_state))
        return out

    def _damage_roll(self, mask: torch.Tensor, diff: torch.Tensor, k: str = "?", tile: torch.Tensor | None = None) -> torch.Tensor:
        if k in WW_BATTLE_KEYS:
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

    def _city_damage_split(self, outer: torch.Tensor, walls_max: torch.Tensor,
                           roll: torch.Tensor, klass: torch.Tensor,
                           assist: torch.Tensor | None = None) -> tuple[torch.Tensor, torch.Tensor]:
        """`cityDamageSplit` — how ONE hit on a city centre divides between the
        outer-defense perimeter and the centre behind it. Both shares come out
        of the same roll and neither draws again.

        `klass` is a HIT_ code per game rather than one string, because a batch
        can be swinging a Swordsman in one world and firing a Catapult in the
        next; `assist` carries the ASSIST_ bits of whatever support chassis
        stands beside the target."""
        o = outer.clamp(min=0)
        wm = walls_max.clamp(min=0).double()
        frac = torch.where(wm > 0, (o.double() / wm.clamp(min=1.0)).clamp(max=1.0),
                           torch.zeros_like(wm))
        f = torch.where(klass == HIT_MELEE,
                        torch.full_like(wm, self._wall_dmg_melee),
                        torch.full_like(wm, self._wall_dmg_ranged))
        full = klass == HIT_BOMBARD
        bypass = torch.zeros_like(full)
        if assist is not None:
            full = full | ((assist & ASSIST_RAM) != 0)
            bypass = (assist & ASSIST_TOWER) != 0
        f = torch.where(full, torch.ones_like(f), f)
        wall = torch.where(
            o > 0,
            torch.minimum(o, js_round(roll.double() * f).clamp(min=1).to(o.dtype)),
            torch.zeros_like(o),
        )
        through = ((1.0 - frac) / (1.0 - self._wall_breach)).clamp(0.0, 1.0)
        through = torch.where(bypass, torch.ones_like(through), through)
        centre = js_round(roll.double() * through).clamp(min=1).to(roll.dtype)
        return wall, centre

    def _hit_class(self, type_idx: torch.Tensor, ranged: bool) -> torch.Tensor:
        """`cityHitClass` — a siege unit's attack "uses Bombard Strength"
        whichever verb ordered it; everything else is the melee/ranged pair the
        reduction table is keyed on."""
        t = type_idx.clamp(min=0, max=self.NU - 1)
        base = HIT_RANGED if ranged else HIT_MELEE
        return torch.where(self._type_bombard[t] > 0,
                           torch.full_like(t, HIT_BOMBARD), torch.full_like(t, base))

    def _walls_tier_at(self, row: torch.Tensor, col: torch.Tensor) -> torch.Tensor:
        """`wallsTier` — the URBAN tier once the owner holds the tech that
        "builds modern fortifications around the City Centers of all current
        and future cities", otherwise the highest walls row the city has
        finished. `row`/`col` are per-game, so a strike can ask about whichever
        seat's city it is pointed at."""
        b = torch.arange(self.B, device=self.device)
        r0, c0 = row.clamp(min=0), col.clamp(min=0)
        bl = self.city_bldg[b, r0, c0]  # [B, NB]
        tier = torch.zeros(self.B, dtype=torch.long, device=self.device)
        for bi in self._walls_rows:
            t = int(self._b_walls[bi])
            tier = torch.maximum(tier, torch.where(bl[:, bi], torch.full_like(tier, t),
                                                   torch.zeros_like(tier)))
        if self._urban_def_tech >= 0:
            tier = torch.where(self.civ_techs[b, r0, self._urban_def_tech],
                               torch.full_like(tier, self._walls_tier_urban), tier)
        return torch.where((row >= 0) & (col >= 0), tier, torch.zeros_like(tier))

    def _owner_city_col(self, seat_row: torch.Tensor, tile: torch.Tensor) -> torch.Tensor:
        """`cityAtTile` — the city SLOT owning this tile, for whichever major
        row owns it, over the whole batch. -1 where nobody does."""
        t0 = tile.clamp(min=0)
        out = torch.full_like(t0, -1)
        for r in range(self.n_majors):
            sl = self.city_slot_at(r).gather(1, t0.unsqueeze(1)).squeeze(1)
            out = torch.where((seat_row == r) & (sl >= 0), sl, out)
        return torch.where(tile >= 0, out, torch.full_like(out, -1))

    def _walls_max_at(self, row: torch.Tensor, col: torch.Tensor) -> torch.Tensor:
        """`wallsMax` — the size of that tier's perimeter pool."""
        return self._walls_tier_hp[self._walls_tier_at(row, col)]

    def _urban_defenses_fit(self, row: int, hit: torch.Tensor) -> None:
        """`urbanDefensesFit` — CIV6: unlocking Urban Defenses "builds modern
        fortifications around the City Centers of all current and future
        cities and their Encampment districts", with no production and no
        building row at all, so the perimeter simply arrives at the new tier's
        full pool. Cities founded afterwards read the same tier through
        `_walls_max_all` and need no write; only the standing ones do, because
        a breach they are already carrying is what the fortifications
        replace."""
        if self._urban_def_tech < 0 or not bool(hit.any()):
            return
        full = int(self._walls_tier_hp[self._walls_tier_urban])
        oh = self.city_outer_hp[:, row]
        alive_hit = hit.unsqueeze(1) & self.city_alive[:, row]
        self.city_outer_hp[:, row] = torch.where(alive_hit, torch.full_like(oh, full), oh)
        if self._encamp_didx >= 0 and self.districts_on:
            et = self.city_dist_tile[:, row, :, self._encamp_didx]
            e0 = et.clamp(min=0)
            w = (alive_hit & (et >= 0) & self.district_complete.gather(1, e0)).nonzero(as_tuple=True)
            if w[0].numel():
                self.encamp_outer_hp[w[0], et[w[0], w[1]]] = full

    def _walls_tier_all(self, row: int) -> torch.Tensor:
        """[B, RC] the walls tier of every one of this seat row's city columns
        at once — the whole-row form of `_walls_tier_at`."""
        bl = self.city_bldg[:, row]  # [B, RC, NB]
        tier = torch.zeros(self.B, self.RC, dtype=torch.long, device=self.device)
        for bi in self._walls_rows:
            t = int(self._b_walls[bi])
            tier = torch.maximum(tier, torch.where(bl[:, :, bi], torch.full_like(tier, t),
                                                   torch.zeros_like(tier)))
        if self._urban_def_tech >= 0:
            tier = torch.where(self.civ_techs[:, row, self._urban_def_tech].unsqueeze(1),
                               torch.full_like(tier, self._walls_tier_urban), tier)
        return tier

    def _walls_level_all(self, row: int) -> torch.Tensor:
        """[B, RC] the walls LEVEL each of this row's columns has BUILT.
        `_walls_tier_all` is the DEFENCE tier, which Urban Defenses raises
        with no wall standing; a housing or yield term wants this one."""
        bl = self.city_bldg[:, row]
        level = torch.zeros(self.B, self.RC, dtype=torch.long, device=self.device)
        for bi in self._walls_rows:
            t = int(self._b_walls[bi])
            level = torch.maximum(level, torch.where(bl[:, :, bi], torch.full_like(level, t),
                                                     torch.zeros_like(level)))
        return level

    def _walls_max_all(self, row: int) -> torch.Tensor:
        """[B, RC] the perimeter pool every one of this row's columns carries."""
        return self._walls_tier_hp[self._walls_tier_all(row)]

    def _walls_build_ok(self, row: int) -> torch.Tensor:
        """[B, RC] — CIV6: "While city defenses are damaged, you cannot build
        higher levels of Walls." Read OUTSIDE `_seat_buildable`, whose cache
        keys on the yield version and would never see a breach."""
        return self.city_outer_hp[:, row] >= self._walls_max_all(row)

    def _walls_tier_row(self, row: int, col: torch.Tensor) -> torch.Tensor:
        """The `_walls_tier_at` a seat-loop body wants: one python row, the
        per-game city column beside it."""
        return self._walls_tier_at(torch.full_like(col, row), col)

    def _fit_encamp_outer(self, bsel: torch.Tensor, row: int, colsel: torch.Tensor,
                          full: torch.Tensor) -> None:
        """`fitEncampOuter` — CIV6 (Encampment): the district's Defenses are
        their OWN pool. "Building any level of Walls in the city will supply
        both", yet destroying one does not destroy the other — so every walls
        site that refits the centre's perimeter refits this pool too, at the
        same tier's `full` value. `bsel`/`colsel`/`full` are aligned batch
        rows, city columns and pool sizes."""
        if self._encamp_didx < 0 or not self.districts_on or bsel.numel() == 0:
            return
        et = self.city_dist_tile[bsel, row, colsel, self._encamp_didx]
        ok = (et >= 0) & self.district_complete[bsel, et.clamp(min=0)]
        r2 = ok.nonzero(as_tuple=True)[0]
        if r2.numel() == 0:
            return
        self.encamp_outer_hp[bsel[r2], et[r2]] = full[r2]

    def _enc_outer_missing(self, row: int) -> torch.Tensor:
        """[B, RC] `encampOuterMissing` — the Encampment perimeter HP each
        column's district is missing, what the repair project must put back
        beyond the centre's own breach."""
        mx = self._walls_max_all(row)
        if self._encamp_didx < 0 or not self.districts_on:
            return torch.zeros_like(mx)
        et = self.city_dist_tile[:, row, :, self._encamp_didx]
        e0 = et.clamp(min=0)
        live = (et >= 0) & self.district_complete.gather(1, e0)
        ecur = torch.minimum(self.encamp_outer_hp.gather(1, e0), mx)
        return torch.where(live, mx - ecur, torch.zeros_like(mx))

    def _repair_available(self, row: int, j: int) -> torch.Tensor:
        """`repairAvailable` — CIV6: the repair "becomes available after
        building Walls. A city can undertake this project if it and/or its
        Encampment district have damaged Walls and have not been attacked in
        the last three turns." The centre and its Encampment each hold their
        OWN pool; a breach in either makes the project available."""
        mx = self._walls_max_all(row)[:, j]
        breached = (self.city_outer_hp[:, row, j] < mx) | (self._enc_outer_missing(row)[:, j] > 0)
        # CIV6 (a City Center caught in a blast): "Repair Outer Defenses is
        # unusable while the fallout lasts."
        _ctr = self.city_center[:, row, j]
        clean = (_ctr >= 0) & ~self._fallout().gather(1, _ctr.clamp(min=0).unsqueeze(1)).squeeze(1)
        return ((mx > 0) & breached & clean
                & ((self.turn - self.city_last_hit[:, row, j]) >= self._repair_quiet))

    def _repair_cost(self, row: int, j: int) -> torch.Tensor:
        """The perimeter HP missing right now — CIV6: "Walls gain HP equal to
        the Production invested into the project", so the whole repair costs
        exactly what it puts back."""
        mx = self._walls_max_all(row)[:, j]
        return ((mx - self.city_outer_hp[:, row, j])
                + self._enc_outer_missing(row)[:, j]).clamp(min=1).to(self.dtype)

    def _repair_drip(self, row: int, before: torch.Tensor) -> None:
        """`repairDrip` — CIV6 (Repair Outer Defenses): "Walls gain HP equal to
        the Production invested into the project (on Standard speed) each turn
        the project runs." `before` is this row's whole progress plane as it
        stood before whatever just paid into it, so a chop and a Great
        Engineer's lump raise the perimeter exactly as the turn's own
        production does — and damage taken mid-repair stays taken, which
        reading the pool off total progress would silently undo."""
        if self._repair_proj_idx < 0:
            return
        head = self._q_head(row) == self.PROJECT_BASE + self._repair_proj_idx
        if not bool(head.any()):
            return
        gain = (js_round(self.city_progress[:, row, :, 0].double())
                - js_round(before.double())).long()
        oh = self.city_outer_hp[:, row]
        mx = self._walls_max_all(row)
        add = torch.minimum(gain, (mx - oh).clamp(min=0))
        self.city_outer_hp[:, row] = torch.where(head, oh + add, oh)
        # what the centre's pool cannot hold falls on the Encampment's own
        if self._encamp_didx >= 0 and self.districts_on:
            rem = (gain - add).clamp(min=0)
            et = self.city_dist_tile[:, row, :, self._encamp_didx]
            e0 = et.clamp(min=0)
            ecur = torch.minimum(self.encamp_outer_hp.gather(1, e0), mx)
            eadd = torch.minimum(rem, (mx - ecur).clamp(min=0))
            w = (head & (et >= 0) & self.district_complete.gather(1, e0)
                 & (eadd > 0)).nonzero(as_tuple=True)
            if w[0].numel():
                self.encamp_outer_hp[w[0], et[w[0], w[1]]] = (ecur + eadd)[w[0], w[1]]

    def _siege_may_shoot(self, pre: str) -> torch.Tensor:
        """[B, U] `siegeMayShoot` — CIV6 (Movement): a unit whose attack "uses
        Bombard Strength" may move and shoot in the same turn only if "its
        maximum Movement is at least 1 greater than normal when it attempts to
        shoot"; and "if a unit has not moved, it can always shoot regardless of
        its maximum Movement". `_spent_mp` is refreshUnits' own gate — the pool
        this unit was GRANTED last refresh, not its type's base moves.
        CIV6 (Expert Crew): "Can attack after moving" lifts the gate outright."""
        typ = getattr(self, f"{pre}_unit_type").clamp(min=0, max=self.NU - 1)
        return ((self._type_bombard[typ] <= 0) | ~self._spent_mp(pre)
                | self._promo_pool_flag(pre, "SIEGE_MOVE_SHOOT")
                | (self._full_mp(pre) > self._mp_scale * self._type_moves[typ]))

    def _siege_assist(self, seat: torch.Tensor, type_idx: torch.Tensor,
                      tile: torch.Tensor, tier: torch.Tensor) -> torch.Tensor:
        """`siegeAssist` — the ASSIST_ bits a friendly Battering Ram or Siege
        Tower ADJACENT to the target lends this attacker. CIV6: "both support
        units are effective for melee and anti-cavalry class units only", and
        Gathering Storm's upgraded walls "gain engineering qualities which
        negate the effects of support units" — the ram stops working above
        Ancient Walls, the tower above Medieval.

        The chassis rides the CIVILIAN plane, which is where this model already
        puts real Civ 6's other support unit, so `civilian_at` is the scan."""
        out = torch.zeros_like(tile)
        t = type_idx.clamp(min=0, max=self.NU - 1)
        helped = self._type_melee[t] | self._type_anticav[t]
        # CIV6 (Akkad's suzerain): "Melee and anti-cavalry units' attacks do
        # full damage to the city's walls" — the ram's own effect, at every
        # walls tier and with no support unit anywhere near.
        if self._suz_c_walls_full >= 0:
            _r = self._row_of(seat).clamp(min=0, max=self.n_majors - 1)
            _held = (self._row_of(seat) >= 0) & (self._row_of(seat) < self.n_majors) & (
                self._suz_effect_rows(self._suz_c_walls_full).gather(1, _r.unsqueeze(1)).squeeze(1))
            out = torch.where(_held, torch.full_like(out, ASSIST_RAM), out)
        if not self._siege_support_any:
            return torch.where(helped, out, torch.zeros_like(out))
        nb = self.neigh[tile.clamp(min=0)]  # [B, 6]
        occ = self.civilian_at.gather(1, nb.clamp(min=0))  # [B, 6]
        live = (nb >= 0) & (occ >= 0)
        o0 = occ.clamp(min=0)
        s = self.unit_seat.gather(1, o0)
        ty = self.unit_type.gather(1, o0).clamp(min=0, max=self.NU - 1)
        chassis = self._type_siege_support[ty]
        ok = live & (s == seat.unsqueeze(1)) & (chassis > 0)
        ok = ok & (tier.unsqueeze(1) <= self._type_siege_max_walls[ty])
        for code, bit in ((1, ASSIST_RAM), (2, ASSIST_TOWER)):
            hit = (ok & (chassis == code)).any(dim=1)
            out = out | torch.where(hit, torch.full_like(out, bit), torch.zeros_like(out))
        return torch.where(helped, out, torch.zeros_like(out))

    def _city_ranged_strength(self, type_idx: torch.Tensor, seat: torch.Tensor,
                              outer: torch.Tensor) -> torch.Tensor:
        """`cityRangedStrength` — what a RANGED order brings against a city or
        district. A siege unit fires at its Bombard Strength and pays no city
        penalty; the -17 it carries is "against land units", which its ranged
        strength already holds. Everything else pays the ranged city penalty,
        which naval ranged owe only while a perimeter stands.

        CIV6 (Particle Beam Siege Cannon): "Ranged attacks against Cities and
        Encampments are 100% effective" — the penalty waived, and the +30 rides
        in beside it."""
        t = type_idx.clamp(min=0, max=self.NU - 1)
        naval = self.unit_naval[t]
        pen = torch.full(outer.shape, self._ranged_city_pen,
                         dtype=torch.float64, device=outer.device)
        pen = torch.where(naval & (outer <= 0), torch.zeros_like(pen), pen)
        beam = self._gdr_beam_cs(t, seat).double()
        pen = torch.where(beam > 0, torch.zeros_like(pen), pen)
        base = self._type_ranged_strength[t].double() + beam - pen
        return torch.where(self._type_bombard[t] > 0, self._type_bombard[t].double(), base)

    def _wound(self, hp: torch.Tensor) -> torch.Tensor:
        """CIV6: "Damage of wounded units is diminished... The formula is
        `round(10 - HP/10)`". The `woundPenalty` twin, RELIGIOUS Strength
        included. hp is a unit-HP tensor; cities / city-states / walls are NOT
        units and never pass through here."""
        return js_round(10.0 - hp.double().clamp(min=0.0) / 10.0)

    # ---- PROMOTIONS ------------------------------------------------------
    # `promoCS` and its siblings, one body each. A unit's `promos` is a bitmask
    # over the rows of its OWN class list, so bit k is column k of the PROMOTE
    # head; every read below indexes the catalog by the chassis's class.

    def _promo_slots(self, utype: torch.Tensor, promos: torch.Tensor):
        """(kinds, vs, masks, live) — the effect slots a unit actually holds,
        each [B, PCOL, PSLOT] and `live` the bool that says the slot counts."""
        rd = self.rules_dev
        cls = rd.u_promo_class[utype.clamp(min=0)]
        clsc = cls.clamp(min=0)
        kinds = rd.promo_kind[clsc]
        vs = rd.promo_v[clsc]
        masks = rd.promo_mask[clsc]
        cols = torch.arange(rd.promo_cols, device=self.device)
        held = ((promos.unsqueeze(1) >> cols.unsqueeze(0)) & 1) > 0  # [B, PCOL]
        live = (held & (cls >= 0).unsqueeze(1)).unsqueeze(2).expand_as(kinds)
        return kinds, vs, masks, live

    def _promo_val(self, utype: torch.Tensor, promos: torch.Tensor, kind: str) -> torch.Tensor:
        """the summed value of one non-combat effect kind, in `promos`' shape —
        one unit, a whole pool, or a pool's six neighbour steps. Reads the
        catalog through the per-(kind, class) folds (`promo_col_val`), never a
        [rows, PCOL, PSLOT] gather; the fold is exact because `promo_v` is
        integral."""
        k = self._pk.get(kind, -1)
        if k < 0:
            return torch.zeros_like(promos)
        rd = self.rules_dev
        cls = rd.u_promo_class[utype.clamp(min=0)].reshape(-1)
        cols = torch.arange(rd.promo_cols, device=self.device)
        held = (promos.reshape(-1).unsqueeze(1) >> cols) & 1
        v = (held * rd.promo_col_val[k][cls.clamp(min=0)]).sum(dim=1)
        return torch.where(cls >= 0, v, torch.zeros_like(v)).reshape(promos.shape)

    def _promo_flag(self, utype: torch.Tensor, promos: torch.Tensor, kind: str) -> torch.Tensor:
        k = self._pk.get(kind, -1)
        if k < 0:
            return torch.zeros_like(promos, dtype=torch.bool)
        rd = self.rules_dev
        cls = rd.u_promo_class[utype.clamp(min=0)]
        return ((promos & rd.promo_flag_bits[k][cls.clamp(min=0)]) != 0) & (cls >= 0)

    def _promo_val_for(self, utype: torch.Tensor, promos: torch.Tensor, kind: str,
                       bit: torch.Tensor) -> torch.Tensor:
        """`promoValueFor` — the summed value of one kind over the slots whose
        mask is open (0) or names `bit`, in `promos`' shape."""
        k = self._pk.get(kind, -1)
        if k < 0:
            return torch.zeros_like(promos)
        kinds, vs, masks, live = self._promo_slots(utype.reshape(-1), promos.reshape(-1))
        b = bit.reshape(-1, 1, 1)
        hit = live & (kinds == k) & ((masks == 0) | ((masks & b) != 0))
        return torch.where(hit, vs, torch.zeros_like(vs)).sum(dim=(1, 2)).reshape(promos.shape)

    def _promo_count(self, promos: torch.Tensor) -> torch.Tensor:
        """`promoCount` — the promotions held, in `promos`' shape."""
        n = torch.zeros_like(promos)
        for k in range(int(self.rules_dev.promo_cols)):
            n = n + ((promos >> k) & 1)
        return n

    def _promo_mult(self, utype: torch.Tensor, promos: torch.Tensor, kind: str) -> torch.Tensor:
        """the flanking/support multiplier a promotion grants; 1 without."""
        k = self._pk.get(kind, -1)
        ones = torch.ones_like(promos)
        if k < 0:
            return ones
        rd = self.rules_dev
        cls = rd.u_promo_class[utype.clamp(min=0)].reshape(-1)
        cols = torch.arange(rd.promo_cols, device=self.device)
        cm = rd.promo_col_max[k][cls.clamp(min=0)]
        held = (((promos.reshape(-1).unsqueeze(1) >> cols) & 1) > 0) & (cls >= 0).unsqueeze(1)
        best = torch.where(held, cm, torch.zeros_like(cm)).amax(dim=1)
        return torch.maximum(best.reshape(promos.shape), ones)

    def _followed_religion(self, pres: torch.Tensor) -> torch.Tensor:
        """the religion a pressure row follows — the argmax with ties to the
        lowest id, and -1 when nothing presses at all. The turn's own resolver
        scans the same way, so a mid-turn read cannot disagree with it."""
        tot = pres.sum(dim=-1)
        return torch.where(tot > 0, pres.argmax(dim=-1), torch.full_like(tot, -1))

    def _promo_first_use(self, utype: torch.Tensor, promos: torch.Tensor,
                         used: torch.Tensor, kind: str):
        """(value, used') — `promoFirstUse`: the value of a ONCE-ONLY promotion
        the first time it fires and 0 for ever after, with the paying column
        stamped into the returned `used` mask."""
        k = self._pk.get(kind, -1)
        val = torch.zeros_like(promos)
        if k < 0:
            return val, used
        rd = self.rules_dev
        cls = rd.u_promo_class[utype.clamp(min=0)]
        kinds = rd.promo_kind[cls.clamp(min=0)]
        vs = rd.promo_v[cls.clamp(min=0)]
        done = torch.zeros_like(promos, dtype=torch.bool)
        for c in range(int(rd.promo_cols)):
            hit = (~done & (cls >= 0) & (((promos >> c) & 1) > 0) & (((used >> c) & 1) == 0)
                   & (kinds[:, c] == k).any(dim=1))
            if not bool(hit.any()):
                continue
            v = torch.where(kinds[:, c] == k, vs[:, c], torch.zeros_like(vs[:, c])).sum(dim=1)
            val = torch.where(hit, v, val)
            used = torch.where(hit, used | (1 << c), used)
            done = done | hit
        return val, used

    def _promo_pool_val(self, pre: str, kind: str) -> torch.Tensor:
        """[B, U] one promotion VALUE over a whole unit pool."""
        typ = getattr(self, f"{pre}_unit_type").clamp(min=0, max=self.NU - 1)
        return self._promo_val(typ, getattr(self, f"{pre}_unit_promos"), kind)

    def _promo_pool_flag(self, pre: str, kind: str) -> torch.Tensor:
        """[B, U] one promotion FLAG over a whole unit pool."""
        typ = getattr(self, f"{pre}_unit_type").clamp(min=0, max=self.NU - 1)
        return self._promo_flag(typ, getattr(self, f"{pre}_unit_promos"), kind)

    def _choke_cover(self, tiles: torch.Tensor) -> torch.Tensor:
        """CIV6 (Choke Points): "defending in Woods, Jungle, Hills, or Marsh"."""
        tc = tiles.clamp(min=0).reshape(self.B, -1)
        out = self.hills.gather(1, tc)
        if self._choke_feats.numel():
            out = out | self._feature_live(tc, self._choke_feats)
        return out.reshape(tiles.shape)

    def _feature_live(self, tc: torch.Tensor, want: torch.Tensor) -> torch.Tensor:
        """[B, N] — does each tile STILL carry one of `want`? `feat_id` keeps a
        chopped tile's old id, so the strip flag is what makes this the live
        `tile.feature` read TS does."""
        fid = self.feat_id.gather(1, tc)
        return (~self.feat_stripped.gather(1, tc)
                & (fid.unsqueeze(2) == want.view(1, 1, -1)).any(dim=2))

    def _barb_unit_plane(self) -> torch.Tensor:
        """[B, T] — does a BARBARIAN unit stand on this tile? Both occupancy
        slots answer, so a raider is found whichever plane holds it."""
        out = torch.zeros(self.B, self.T, dtype=torch.bool, device=self.device)
        for occ in (self.military_at, self.civilian_at):
            here = occ >= 0
            out = out | (here & (self.unit_seat.gather(1, occ.clamp(min=0)) >= BARB_SEAT))
        return out

    def _religious_at(self, tiles: torch.Tensor) -> torch.Tensor:
        """the RELIGIOUS unit standing on each tile, by merged slot; -1 = none.
        Religious units "move in their own layer", so a tile can hold one
        beside a military and a civilian occupant. A religious unit crossing
        water files as a PASSENGER, and no land civilian shares that tile, so
        the two planes never both answer."""
        occ = self.civilian_at.gather(1, tiles)
        emb = self.embarked_at.gather(1, tiles)
        occ = torch.where(occ >= 0, occ, emb)
        rel = torch.zeros_like(occ, dtype=torch.bool)
        oc = occ.clamp(min=0)
        t = self.unit_type.gather(1, oc)
        for i in (getattr(self, "_missionary_idx", -1), getattr(self, "_apostle_idx", -1),
                  getattr(self, "_inquisitor_idx", -1)):
            if i >= 0:
                rel = rel | (t == i)
        return torch.where((occ >= 0) & rel, occ, torch.full_like(occ, -1))

    def _promo_offer_mask(self, sc: torch.Tensor, utype: torch.Tensor) -> torch.Tensor:
        """[B, N, PCOL] `promoReady && promoAvailable` — the columns a unit may
        take right now: it is owed no more XP, the row exists in its own class
        list, it does not hold that row yet, one prerequisite row is held, and
        the row is inside any offer the unit was handed."""
        rd = self.rules_dev
        B, N = sc.shape
        cols = torch.arange(rd.promo_cols, device=self.device).view(1, 1, -1)
        cls = rd.u_promo_class[utype.clamp(min=0)]
        clsc = cls.clamp(min=0)
        level = self.unit_level.gather(1, sc)
        xp = self.unit_xp.gather(1, sc)
        held = self.unit_promos.gather(1, sc)
        offer = self.unit_promo_offer.gather(1, sc)
        need = self._xp_to_next(level)
        ready = (cls >= 0) & (need > 0) & (xp >= need)
        bit = torch.ones_like(held).unsqueeze(2) << cols
        exists = cols < rd.promo_rows[clsc].unsqueeze(2)
        req = rd.promo_req[clsc]                      # [B, N, PCOL]
        open_row = (req == 0) | ((req & held.unsqueeze(2)) != 0)
        offered = (offer.unsqueeze(2) == 0) | ((offer.unsqueeze(2) & bit) != 0)
        return (ready.unsqueeze(2) & exists & ((held.unsqueeze(2) & bit) == 0)
                & open_row & offered)

    def _damaged(self, hp: torch.Tensor) -> torch.Tensor:
        """the "against damaged units" test two promotions ask of their foe."""
        return hp < self.rules.combat.get("unitHp", 100)

    def _on_district(self, tiles: torch.Tensor) -> torch.Tensor:
        """the "occupying a district or Fort" test three promotions ask, over
        any tile shape whose first dim is the batch.

        `inDistrictTile` asks `!!t.district`, and a CITY CENTRE carries
        `tile.district = 'CITY_CENTER'` TS-side — so a unit standing on one IS
        in a district. The `district` plane holds only PLACEABLE districts;
        centres live in the centre registry, which is why it is named here."""
        tc = tiles.clamp(min=0).reshape(self.B, -1)
        out = (self.district.gather(1, tc) >= 0) | (self.centre_slot_at.gather(1, tc) >= 0)
        if self.FORT >= 0:
            out = out | (self.improvement.gather(1, tc) == self.FORT)
        return out.reshape(tiles.shape)

    def _promo_cs(
        self, utype: torch.Tensor, promos: torch.Tensor, *,
        attacking: torch.Tensor, ranged: torch.Tensor | None = None,
        foe_type: torch.Tensor | None = None, foe_damaged: torch.Tensor | None = None,
        foe_fortified: torch.Tensor | None = None, foe_in_district: torch.Tensor | None = None,
        vs_city: torch.Tensor | None = None, vs_air: torch.Tensor | None = None,
        vs_anti_air: torch.Tensor | None = None, tile: torch.Tensor | None = None,
    ) -> torch.Tensor:
        """[B] the whole Combat Strength adder a unit's promotions contribute to
        ONE roll — `promoCS`'s twin, an integer add beside the support terms."""
        rd = self.rules_dev
        B, dev = promos.shape[0], self.device
        NK = len(rd.promo_kinds)
        if NK == 0:
            return torch.zeros_like(promos)
        kinds, vs, masks, live = self._promo_slots(utype, promos)
        false_b = torch.zeros(B, dtype=torch.bool, device=dev)
        atk = attacking.expand(B) if attacking.dim() else attacking.expand(B)
        rng = false_b if ranged is None else ranged
        dmg = false_b if foe_damaged is None else foe_damaged
        frt = false_b if foe_fortified is None else foe_fortified
        fid = false_b if foe_in_district is None else foe_in_district
        cty = false_b if vs_city is None else vs_city
        air = false_b if vs_air is None else vs_air
        aaf = false_b if vs_anti_air is None else vs_anti_air
        cover = false_b if tile is None else self._choke_cover(tile)
        mine = false_b if tile is None else self._on_district(tile)
        cond = torch.zeros(B, NK, dtype=torch.bool, device=dev)
        pk = self._pk

        def put(name: str, val: torch.Tensor) -> None:
            k = pk.get(name, -1)
            if k >= 0:
                cond[:, k] = val

        put("CS_ALL", torch.ones(B, dtype=torch.bool, device=dev))
        put("CS_VS_CLASS_ATK", atk)
        put("CS_VS_CLASS_ANY", torch.ones(B, dtype=torch.bool, device=dev))
        put("CS_DEF_VS_CLASS", ~atk)
        put("CS_DEF_RANGED", ~atk & rng)
        put("CS_DEF_ANY", ~atk)
        put("CS_DEF_VS_CITY", ~atk & cty)
        put("CS_DEF_VS_AIR", ~atk & air)
        put("CS_DEF_VS_AA", ~atk & aaf)
        put("CS_DEF_TERRAIN", ~atk & cover)
        put("CS_IN_DISTRICT", mine)
        put("CS_ATK_DISTRICT", atk & ~rng & (cty | fid))
        put("CS_VS_IN_DISTRICT", fid)
        put("CS_VS_DISTRICT_DEF", cty)
        put("CS_VS_DAMAGED", dmg)
        put("CS_VS_FORTIFIED", atk & frt)

        hit = cond.gather(1, kinds.reshape(B, -1).clamp(min=0, max=NK - 1)).reshape(kinds.shape)
        want_mask = torch.zeros(NK, dtype=torch.bool, device=dev)
        for name in ("CS_VS_CLASS_ATK", "CS_VS_CLASS_ANY", "CS_DEF_VS_CLASS"):
            k = pk.get(name, -1)
            if k >= 0:
                want_mask[k] = True
        uses = want_mask[kinds.clamp(min=0, max=NK - 1)]
        if foe_type is None:
            bit = torch.zeros(B, dtype=torch.long, device=dev)
        else:
            fcls = rd.u_promo_class[foe_type.clamp(min=0)]
            bit = torch.where(fcls >= 0, rd.promo_class_bit[fcls.clamp(min=0)],
                              torch.zeros_like(fcls))
        maskhit = (masks & bit.view(B, 1, 1)) != 0
        ok = live & hit & (~uses | maskhit)
        return torch.where(ok, vs, torch.zeros_like(vs)).sum(dim=(1, 2))

    # ---- THE XP AWARD ----------------------------------------------------
    # EXACT INTEGER ARITHMETIC, exactly as cpu/core/promotions.ts does it: the
    # only fraction in the rule is foeCS/ownCS, so one rational is rounded once
    # and no float ever touches the result.

    def _xp_to_next(self, level: torch.Tensor) -> torch.Tensor:
        """`xpToNextLevel` — the XP this unit still owes; 0 once it is maxed."""
        mx, per = self._promo_max_level, self._promo_xp_per_level
        return torch.where(level >= mx, torch.zeros_like(level), per * level)

    def _bank_xp(self, xp: torch.Tensor, level: torch.Tensor, gain: torch.Tensor) -> torch.Tensor:
        """the new xp pool: it clamps at the level's requirement and stops."""
        need = self._xp_to_next(level)
        return torch.where(need <= 0, xp, torch.minimum(need, torch.where(xp >= need, xp, xp + gain)))

    def _battle_xp(
        self, own_cs: torch.Tensor, foe_cs: torch.Tensor, *,
        foe_died: torch.Tensor, ranged: bool, initiated: bool,
        pct: torch.Tensor, mult: torch.Tensor,
    ) -> torch.Tensor:
        adds = (XP_RANGED_BATTLE if ranged else XP_MELEE_BATTLE) + (XP_INITIATOR if initiated else 0)
        num = (foe_cs * torch.where(foe_died, 2, 1) + adds * own_cs) * (100 + pct) * mult
        den = (own_cs * 100).clamp(min=1)
        out = torch.div(2 * num + den, 2 * den, rounding_mode="floor")
        return torch.where(own_cs > 0, out.clamp(max=XP_BATTLE_CAP), torch.zeros_like(out))

    def _city_xp(self, base: torch.Tensor, pct: torch.Tensor, mult: torch.Tensor) -> torch.Tensor:
        num = base * (100 + pct) * mult
        return torch.div(2 * num + 100, 200, rounding_mode="floor")

    def _xp_strength(self, t: torch.Tensor, shooting: bool) -> torch.Tensor:
        """the strength a chassis brings to the XP ratio: its Ranged Strength
        when it is the one shooting, its Combat Strength otherwise."""
        c = self._type_combat[t.clamp(min=0)].long()
        if not shooting:
            return c
        r = self._type_ranged_strength[t.clamp(min=0)].long()
        return torch.where(r > 0, r, c)

    def _battle_gain(
        self, own_type: torch.Tensor, foe_type: torch.Tensor, own_seat: torch.Tensor,
        own_level: torch.Tensor, own_pct: torch.Tensor, *,
        ranged: bool, initiated: bool, foe_died: torch.Tensor, foe_is_barb: torch.Tensor,
    ) -> torch.Tensor:
        """[B] the XP ONE side earns from ONE battle — `awardBattleXp`'s per-side
        half, the veteran-vs-barbarian flat rate included."""
        own_cs = self._xp_strength(own_type, ranged and initiated)
        foe_cs = self._xp_strength(foe_type, ranged and not initiated)
        mult = self._recon_xp_mult(own_seat, own_type)
        if initiated:
            mult = mult * self._suz_xp_mult(own_seat)
        g = self._battle_xp(own_cs, foe_cs, foe_died=foe_died, ranged=ranged,
                            initiated=initiated, pct=own_pct, mult=mult)
        vet = foe_is_barb & (own_level >= 2)
        return torch.where(vet, torch.full_like(g, XP_BARB_VETERAN), g)

    def _train_xp_pct(self, bldg: torch.Tensor, utype: torch.Tensor) -> torch.Tensor:
        """CIV6: the training city's Encampment and Harbor experience lines,
        SUMMED over the buildings it holds that reach this chassis's class."""
        rd = self.rules_dev
        cls = rd.u_promo_class[utype.clamp(min=0)]
        reach = rd.b_train_xp_cls[:, cls.clamp(min=0)].transpose(0, 1)  # [B, NB]
        pct = (rd.b_train_xp_pct.view(1, -1) * (bldg & reach).long()).sum(dim=1)
        return torch.where(cls >= 0, pct, torch.zeros_like(pct))

    def _river_cross(self, frm: torch.Tensor, to: torch.Tensor) -> torch.Tensor:
        arange6 = torch.arange(6, device=self.device)
        nb = self.neigh[frm.clamp(min=0)]
        match = (nb == to.unsqueeze(1)) & (to.unsqueeze(1) >= 0) & (frm.unsqueeze(1) >= 0)
        rm = self.river_mask.gather(1, frm.clamp(min=0).unsqueeze(1)).squeeze(1)  # [B]
        bits = (rm.unsqueeze(1) >> arange6) & 1  # [B, 6]
        return (bits * match.long()).sum(dim=1)  # 0 or 1

    def _flank_support_live(self, seat: torch.Tensor) -> torch.Tensor:
        """[B] bool `flankSupportLive` — CIV6 (Flanking and Support): both
        bonuses "are unavailable at the start of the game, and are unlocked
        only after researching Military Tradition", and "Barbarians can gain
        Flanking and Support once at least half of the major civilizations have
        researched Military Tradition". Every seat that is not a major reads
        that count."""
        if self._flank_support_civic < 0:
            return torch.zeros_like(seat, dtype=torch.bool)
        col = self.civ_civics[:, :, self._flank_support_civic]  # [B, n_majors]
        half = (col.long().sum(dim=1) * 2) >= self.n_majors
        major = (seat >= 0) & (seat < self.n_majors)
        own = col.gather(1, seat.clamp(min=0, max=self.n_majors - 1).unsqueeze(1)).squeeze(1)
        return torch.where(major, own, half)

    def _congress_unit_cs(self, utype: torch.Tensor, seat: torch.Tensor) -> torch.Tensor:
        """`congressUnitCS`' twin — the flat Combat Strength the WORLD
        CONGRESS hands one unit. MILITARY ADVISORY pays the chassis's promotion
        class, which every fighting chassis now holds;
        CIV6 (World Religion, outcome A): "this outcome also gives Warrior Monks
        +10 Combat Strength", where the monk's religion is its owner's."""
        out, tgt = self._congress_by_id("MILITARY_ADVISORY")
        cls = self.rules_dev.u_promo_class[utype.clamp(min=0)]
        sh = (slice(None),) + (None,) * (cls.dim() - 1)
        z = torch.zeros(cls.shape, dtype=torch.long, device=self.device)
        v = torch.where(out[sh] == 0, z + self._c_advisory_cs, z - self._c_advisory_cs)
        adv = torch.where((out[sh] >= 0) & (cls >= 0) & (cls == tgt[sh]), v, z)
        if self._monk_idx < 0:
            return adv
        return adv + torch.where(utype == self._monk_idx, self._congress_relig_cs(seat), z)

    def _seat_is(self, seat: torch.Tensor, civ: int, leader: int) -> torch.Tensor:
        """bool, `seat`'s shape — `rowIsFor` per absolute seat."""
        NM = self.n_majors
        r = seat.clamp(min=0, max=NM - 1).reshape(self.B, -1)
        key = (self.row_civ if civ >= 0 else self.row_leader).gather(1, r).reshape(seat.shape)
        return (seat >= 0) & (seat < NM) & (key == (civ if civ >= 0 else leader))

    def _roster_cs(self, seat: torch.Tensor, utype: torch.Tensor, tile: torch.Tensor,
                   foe_seat: torch.Tensor, foe_hp: torch.Tensor | None, foe_city: bool) -> torch.Tensor:
        """[B] long — `rosterCS`: the flat Combat Strength a unit's
        civilization or leader adds under its row's clause (`COMBAT_CS_ROWS`):
        against a city-state's unit, a wounded one, a city or district, for a
        class, on a coastal tile (a hull on Coast, a land unit on coastal
        land, never embarked)."""
        z = torch.zeros(seat.shape, dtype=torch.long, device=self.device)
        if not self._combat_cs_rows:
            return z
        t = utype.clamp(min=0, max=self.NU - 1)
        combat = (utype >= 0) & (self._type_combat[t] > 0)
        bit = self.rules_dev.promo_class_bit[self.rules_dev.u_promo_class[t].clamp(min=0)]
        tc = tile.clamp(min=0).reshape(self.B, -1)
        naval = self.unit_naval[t]
        on_coast = torch.where(naval,
                               (self.water.gather(1, tc) & ~self.ocean_tile.gather(1, tc)).reshape(seat.shape),
                               self.coastal_land.gather(1, tc).reshape(seat.shape))
        cap = int(self.rules.combat.get("unitHp", 100))
        out = z
        for civ, lead, amt, mask, when in self._combat_cs_rows:
            who = self._seat_is(seat, civ, lead) & combat
            if mask:
                who = who & ((bit & mask) != 0)
            if when == 1:
                who = who & (foe_seat >= 100) & (foe_seat < BARB_SEAT)
            elif when == 2:
                who = who & (foe_hp < cap) if foe_hp is not None else torch.zeros_like(who)
            elif when == 3:
                who = who if foe_city else torch.zeros_like(who)
            elif when == 4:
                who = who & on_coast
            out = out + who.long() * amt
        return out

    def _roster_embark_mp(self, seat: torch.Tensor, utype: torch.Tensor) -> torch.Tensor:
        """[B, U] long — `rosterEmbarkMoves`: extra Movement while embarked."""
        out = torch.zeros(utype.shape, dtype=torch.long, device=self.device)
        for civ, lead, amt, settler in self._embark_move_rows:
            who = self._seat_is(seat, civ, lead)
            if settler:
                who = who & (utype == self._settler_idx)
            out = out + who.long() * amt
        return out

    def _ignore_shores(self, seat: torch.Tensor, utype: torch.Tensor) -> torch.Tensor:
        """bool — `ignoresShores`: no embark/disembark penalty for this unit."""
        out = torch.zeros(utype.shape, dtype=torch.bool, device=self.device)
        for civ, lead, settler in self._ignore_shores_rows:
            who = self._seat_is(seat, civ, lead)
            if settler:
                who = who & (utype == self._settler_idx)
            out = out | who
        return out

    def _gov_unit_cs(self, utype: torch.Tensor, seat: torch.Tensor) -> torch.Tensor:
        """[B] long — `governmentUnitCS`' twin, the adopted government's flat
        Combat Strength for one unit. CIV6 (Oligarchy): "All land melee,
        anti-cavalry, and naval melee class units gain +4 Combat Strength" —
        the three are PROMOTION classes (`u_promo_class`), so the Galley
        rides NAVAL_MELEE. CIV6 (Fascism): "All units gain +5 Combat
        Strength" — every COMBAT unit; a civilian has no strength to add
        to."""
        z = torch.zeros(utype.shape, dtype=torch.long, device=self.device)
        if not self._gov_has_effects:
            return z
        t = utype.clamp(min=0, max=self.NU - 1)
        tab = self._fx_by_row("ucst")  # [B, n_majors, NU]
        ok = (seat >= 0) & (seat < self.n_majors)
        s0 = seat.clamp(min=0, max=self.n_majors - 1)
        v = tab[torch.arange(self.B, device=self.device), s0, t]
        return torch.where(ok & (utype >= 0), v.long(), z)

    def _era_matchup_cs(self, seat: torch.Tensor, foe_type: torch.Tensor) -> torch.Tensor:
        """[B] long — CIV6 (Cyber Warfare): "+10 Combat Strength against units
        from Information and Future Eras." The card is the ASKER's; the era is
        the FOE's chassis."""
        z = torch.zeros(seat.shape, dtype=torch.long, device=self.device)
        if not self._gov_has_effects:
            return z
        out = z.clone()
        era = self._type_era[foe_type.clamp(min=0, max=self.NU - 1)]
        for _r in range(self.n_majors):
            fx = self._gov_mods(_r)[12]["eracs"]
            if not fx:
                continue
            hit = (seat == _r) & (foe_type >= 0)
            for _on, _min, _cs in fx:
                add = hit & _on.reshape(*([-1] + [1] * (seat.dim() - 1))) & (era >= _min)
                out = out + add.long() * int(_cs)
        return out

    def _governor_territory_cs(self, seat: torch.Tensor, tile: torch.Tensor) -> torch.Tensor:
        """[B] long — CIV6 (Garrison Commander): "Units defending within the
        city's territory get +5 Combat Strength" — the GOVERNED city's own
        tiles, and only for a defender that owns them."""
        z = torch.zeros(seat.shape, dtype=torch.long, device=self.device)
        if not self.n_governors:
            return z
        tc = tile.clamp(min=0)
        own = self.tile_seat.gather(1, tc.reshape(self.B, -1)).reshape(tc.shape) == seat
        out = z.clone()
        for _r in range(self.n_majors):
            per = self._governor_tile_sum(_r, "territoryCS")
            if not bool((per != 0).any()):
                continue
            v = per.gather(1, tc.reshape(self.B, -1)).reshape(tc.shape)
            out = out + ((seat == _r) & own).long() * v.long()
        return out

    def _class_matchup_cs(self, own_type: torch.Tensor, foe_type: torch.Tensor) -> torch.Tensor:
        """[B] long `classMatchupCS` — CIV6 (Combat, "Unit class modifiers"):
        "Melee units receive a +5 CS bonus against anti-cavalry units.
        Anti-cavalry units receive a +10 CS bonus against light cavalry, heavy
        cavalry, or ranged cavalry units." Whichever side of the roll holds the
        class asks this about the other."""
        o = own_type.clamp(min=0, max=self.NU - 1)
        f = foe_type.clamp(min=0, max=self.NU - 1)
        out = torch.zeros_like(o)
        out = torch.where(self._type_melee[o] & self._type_anticav[f],
                          torch.full_like(out, self._class_melee_vs_anticav), out)
        out = torch.where((out == 0) & self._type_anticav[o] & self._type_cavalry[f] & ~self._type_chariot[f],
                          torch.full_like(out, self._class_anticav_vs_cav), out)
        return out

    def _embarked_def_cs(self, seat: torch.Tensor) -> torch.Tensor:
        """[B] long `embarkedDefenseCS` — the normalized CS an embarked unit of
        this seat defends at, off the OWNER's technological era: a major's own
        tree, or a city-state's own (`citystate_techs` / `citystate_civics`).
        The barbarians research nothing and read era 0."""
        era = torch.zeros_like(seat)
        for r in range(self.n_majors):
            era = torch.where(seat == r, self._civ_era(self.civ_techs[:, r], self.civ_civics[:, r]), era)
        for s in range(self.S):
            era = torch.where(seat == 100 + s,
                              self._civ_era(self.citystate_techs[:, s], self.citystate_civics[:, s]), era)
        return self._embarked_def_by_era[era.clamp(min=0, max=self._embarked_def_by_era.numel() - 1)]

    def _stack_fold(self, tc: torch.Tensor, seat, mslot: torch.Tensor,
                    m_seat: torch.Tensor, ok_m: torch.Tensor, cslot: torch.Tensor,
                    c_seat: torch.Tensor, ok_c: torch.Tensor, ranged: bool):
        """`stackDefender`'s twin: fold a hex's PASSENGER into the pair the
        callers resolve on.

        CIV6 (Combat): "All attacks against this tile will be absorbed by the
        military unit of the formation", so a passenger answers in the class
        its OWN chassis belongs to — an embarked Builder is still a civilian,
        and is still captured rather than fought. Between a hull and a military
        passenger, "the unit with the higher Combat Strength will defend
        against ranged attacks", and the page's own note that a "gravely
        injured" passenger still outranks a healthy hull makes that comparison
        the CHASSIS strength, not the wounded one. A melee blow lands on the
        hull; the passenger answers only for a hex without one.

        Both occupants always share a seat (a foreign unit blocks the tile
        outright), so no scope-out downstream has to be re-asked per candidate.

        Returns the folded (mslot, m_seat, ok_m, cslot, c_seat, ok_c)."""
        eslot = self._visible_embarked_at(seat).gather(1, tc.unsqueeze(1)).squeeze(1)
        neg = torch.full_like(eslot, -1)
        e0 = eslot.clamp(min=0).unsqueeze(1)
        e_seat = torch.where(eslot >= 0, self.unit_seat.gather(1, e0).squeeze(1), neg)
        e_civ = self._type_civilian[
            self.unit_type.gather(1, e0).squeeze(1).clamp(min=0, max=self.NU - 1)]
        ok_e = self._seats_hostile(seat, e_seat.unsqueeze(1)).squeeze(1)
        e_mil = ok_e & ~e_civ
        take = e_mil & ~ok_m
        if ranged:
            m_type = self.unit_type.gather(1, mslot.clamp(min=0).unsqueeze(1)).squeeze(1)
            cs_m = (self._type_combat[m_type.clamp(min=0, max=self.NU - 1)]
                    + self._form_cs(mslot) + self._convoy_cs(mslot) - self._fuel_short_cs(mslot))
            take = take | (e_mil & ok_m
                           & (self._embarked_def_cs(e_seat) + self._form_cs(eslot)
                              + self._convoy_cs(eslot) - self._fuel_short_cs(eslot) > cs_m))
        e_pax = ok_e & e_civ
        take_c = e_pax & ~ok_c
        return (torch.where(take, eslot, mslot),
                torch.where(take, e_seat, m_seat),
                ok_m | e_mil,
                torch.where(take_c, eslot, cslot),
                torch.where(take_c, e_seat, c_seat),
                ok_c | e_pax)

    def _unit_sight(self, utype: torch.Tensor, promos: torch.Tensor) -> torch.Tensor:
        """`unitSight`'s twin: the chassis's own SIGHT — 0 in the table means the
        SIGHT_RANGE default — plus what CIV6 (Spyglass / Rutter / Observation)
        calls "+1 sight range"."""
        base = self._type_sight[utype.clamp(min=0, max=self.NU - 1)]
        return (torch.where(base > 0, base, torch.full_like(base, 2))
                + self._promo_val(utype, promos, "SIGHT"))

    def _stealth_hidden(self, seat, plane: torch.Tensor | None = None) -> torch.Tensor:
        """[B, T] — does this tile hold a STEALTH unit `seat` cannot see?

        CIV6 (Unit, "Stealth units"): they "are invisible to non-adjacent
        units"; beside a City Center or an Encampment they "remain hidden as
        long as they don't attack and there's no unit in the district"; one
        that attacks "will become visible for a turn"; and REVEAL STEALTH
        "allows them to see other stealth units within their Sight range".
        `unitVisibleTo` is the twin.

        A district sees nothing of its own, so only UNITS light the map.
        `plane` is the occupancy the answer is wanted for: a stealth CHASSIS is
        always a naval hull, but Twilight Veil hides a land unit, which crosses
        water as a passenger. The eye scan runs over the tiles that actually
        hold a hidden unit, which is none in most games and a handful in the
        rest."""
        occ = self.military_at if plane is None else plane
        hidden = torch.zeros_like(occ, dtype=torch.bool)
        if not self._stealth_live:
            return hidden
        # No stealth-CAPABLE unit alive anywhere in the batch — the plane is
        # all-False without the tile scan. Chassis and veil both need a live
        # carrier, so the unit pool answers before any [B, T] gather.
        ut_all = self.unit_type.clamp(min=0, max=self.NU - 1)
        if not bool((self.unit_alive
                     & (self._type_stealth[ut_all]
                        | self._promo_flag(ut_all, self.unit_promos, "STEALTH"))).any()):
            return hidden
        sc = seat.reshape(self.B, 1) if torch.is_tensor(seat) else seat
        mslot = occ.clamp(min=0)
        mtype = self.unit_type.gather(1, mslot).clamp(min=0, max=self.NU - 1)
        chassis = self._type_stealth[mtype]
        veil = self._promo_flag(mtype, self.unit_promos.gather(1, mslot), "STEALTH")
        hid = ((occ >= 0) & (chassis | veil)
               & (self.unit_revealed_turn.gather(1, mslot) < self.turn)
               & (self.unit_seat.gather(1, mslot) != sc))
        if not bool(hid.any()):
            return hidden
        tsel = hid.any(dim=0).nonzero(as_tuple=True)[0]
        dist = self.pair_dist[:, tsel].to(torch.long)  # [T, K]
        utype = self.unit_type.clamp(min=0, max=self.NU - 1)
        # CIV6 (Twilight Veil): "Only adjacent enemy units can reveal this
        # unit", so Reveal Stealth lengthens the look at a stealth CHASSIS and
        # at nothing else — the reach is a (viewer, hidden tile) pair.
        far = self._unit_sight(utype, self.unit_promos).unsqueeze(2)
        reach = torch.where(self._type_reveal[utype].unsqueeze(2) & chassis[:, tsel].unsqueeze(1),
                            far, torch.ones_like(far))
        mine = self.unit_alive & (self.unit_seat == sc)
        seen = (mine.unsqueeze(2)
                & (dist[self.unit_tile.clamp(min=0)] <= reach)).any(dim=1)
        hidden[:, tsel] = hid[:, tsel] & ~seen
        return hidden

    def _visible_embarked_at(self, seat) -> torch.Tensor:
        """`embarked_at` as `seat` sees it — a veiled passenger is not there."""
        if not self._stealth_live:
            return self.embarked_at
        return torch.where(self._stealth_hidden(seat, self.embarked_at),
                           torch.full_like(self.embarked_at, -1), self.embarked_at)

    def _visible_military_at(self, seat) -> torch.Tensor:
        """`military_at` as `seat` sees it: an unseen stealth hull is not there.
        `visibleHostilesAt` is the twin."""
        if not self._stealth_live:
            return self.military_at
        return torch.where(self._stealth_hidden(seat),
                           torch.full_like(self.military_at, -1), self.military_at)

    def _flank_support(
        self,
        def_tile: torch.Tensor,
        def_seat: torch.Tensor,
        attacker_slot: torch.Tensor,
        attacker_seat: torch.Tensor,
    ) -> tuple[torch.Tensor, torch.Tensor]:
        """`flankCount` / `supportCount` for a UNIT defender on def_tile [B].

        FLANKING counts the military units on the 6 adjacent tiles that the
        ATTACKER owns — "only units that are currently owned by the same player
        can provide Flanking to one another" — never the attacker itself, never
        an EMBARKED one ("embarked land units do not provide Flanking"), and
        never one whose tile is across a River from the target. `attacker_slot`
        is the attacker's own occupancy index, -1 when the attacker holds no
        military slot: a RELIGIOUS attacker shares its tile with a military unit
        that flanks like any other, so the exclusion is by unit, not by tile.

        SUPPORT counts the DEFENDER's own adjacent military, embarked ones
        included ("embarked land units provide Support like normal"), and pays
        nothing at all while the defender stands in a defensible district.

        Stacking blocks foreign units, so each tile holds at most ONE military
        unit — each of the 6 neighbours contributes 0 or 1. Returns
        (flank [B] long, support [B] long)."""
        dt = def_tile.clamp(min=0)
        nb = self.neigh[dt]
        nbc = nb.clamp(min=0)
        on = nb >= 0
        mslot = self.military_at.gather(1, nbc)  # [B, 6]
        here = (mslot >= 0) & on
        emb = self.unit_emb.gather(1, mslot.clamp(min=0))
        n_seat = torch.where(here, self.unit_seat.gather(1, mslot.clamp(min=0)), torch.full_like(nbc, -1))

        riv = (self.river_mask.gather(1, dt.unsqueeze(1)) >> torch.arange(6, device=self.device)) & 1
        is_atk = (mslot == attacker_slot.unsqueeze(1)) & (attacker_slot.unsqueeze(1) >= 0)
        mine = here & ~emb & (n_seat == attacker_seat.unsqueeze(1)) & ~is_atk & (riv == 0)
        flank = mine.long().sum(dim=1) * self._flank_support_live(attacker_seat).long()

        # CIV6 (Flanking and Support): "Embarked land units provide Support
        # like normal. Since naval units provide Support to land units and vice
        # versa, a water tile containing an embarked unit and a naval unit
        # provides +4 Combat Strength to any friendly unit defending in an
        # adjacent tile" — so the passenger plane is counted BESIDE the hull's,
        # and one hex can pay twice. Flanking above takes hulls only.
        eslot = self.embarked_at.gather(1, nbc)
        e_here = (eslot >= 0) & on
        e_seat = torch.where(e_here, self.unit_seat.gather(1, eslot.clamp(min=0)),
                             torch.full_like(nbc, -1))
        # "embarked LAND units" = the military domain: an embarked civilian
        # (a settler crossing water) provides no Support (supportCount's
        # unitDomain gate)
        e_mil = ~self._type_civilian[
            self.unit_type.gather(1, eslot.clamp(min=0)).clamp(min=0, max=self.NU - 1)]
        friendly = (here & (n_seat == def_seat.unsqueeze(1))).long()             + (e_here & e_mil & (e_seat == def_seat.unsqueeze(1))).long()
        sup = friendly.sum(dim=1) * self._flank_support_live(def_seat).long()
        in_district = (self._centre_seat_plane().gather(1, dt.unsqueeze(1)).squeeze(1) >= 0) \
            | self._encamp_live().gather(1, dt.unsqueeze(1)).squeeze(1)
        return flank, torch.where(in_district, torch.zeros_like(sup), sup)

    def _theo_flank_support(
        self, def_tile: torch.Tensor, def_seat: torch.Tensor,
        atk_slot: torch.Tensor, atk_seat: torch.Tensor,
    ) -> tuple[torch.Tensor, torch.Tensor]:
        """`theoFlankCount` / `theoSupportCount` — the SAME two counts a melee
        exchange takes, read off the RELIGIOUS layer. CIV6: religious units
        "move in their own layer", and the advice that a swarm of them wins a
        duel is only true if it is the swarm that provides the bonus."""
        dt = def_tile.clamp(min=0)
        nb = self.neigh[dt]
        nbc = nb.clamp(min=0)
        rslot = self._religious_at(nbc)
        here = (rslot >= 0) & (nb >= 0)
        n_seat = torch.where(here, self.unit_seat.gather(1, rslot.clamp(min=0)),
                             torch.full_like(nbc, -1))
        riv = (self.river_mask.gather(1, dt.unsqueeze(1)) >> torch.arange(6, device=self.device)) & 1
        is_atk = (rslot == atk_slot.unsqueeze(1)) & (atk_slot.unsqueeze(1) >= 0)
        mine = here & (n_seat == atk_seat.unsqueeze(1)) & ~is_atk & (riv == 0)
        flank = mine.long().sum(dim=1) * self._flank_support_live(atk_seat).long()
        friendly = here & (n_seat == def_seat.unsqueeze(1))
        sup = friendly.long().sum(dim=1) * self._flank_support_live(def_seat).long()
        in_district = (self._centre_seat_plane().gather(1, dt.unsqueeze(1)).squeeze(1) >= 0) \
            | self._encamp_live().gather(1, dt.unsqueeze(1)).squeeze(1)
        return flank, torch.where(in_district, torch.zeros_like(sup), sup)

    def _theo_strength(self, utype: torch.Tensor, promos: torch.Tensor, hp: torch.Tensor,
                       tile: torch.Tensor, seat: torch.Tensor) -> torch.Tensor:
        """[B] `theoStrength` — the Religious Strength one unit brings to a
        duel: its chassis stat, the wound penalty, DEBATER's "+20 Religious
        Strength in Theological Combat", and the Inquisitor's "+35 Religious
        Strength when in friendly territory"."""
        _t1 = tile.clamp(min=0).unsqueeze(1)
        _home_t = self.tile_seat.gather(1, _t1).squeeze(1) == seat
        # CIV6 (Inquisition): "All religious units are +15 Religious Combat
        # Strength in friendly territory."
        _card = torch.zeros_like(hp, dtype=torch.float64)
        if self._gov_has_effects:
            _card = self._fx_at_seat("relighome", seat).double() * _home_t.double()
        # CIV6 (Grand Inquisitor): "+10 Religious Strength in theological
        # combat in tiles of this city."
        # CIV6 (Theocracy): "+5 Religious Strength in Theological Combat" —
        # the seat's own, wherever its unit fights.
        if self._gov_has_effects:
            _card = _card + self._fx_at_seat("theocs", seat).double()
        _gov = torch.zeros_like(_card)
        if self.n_governors:
            for _g in range(self.n_majors):
                _gov = _gov + (seat == _g).double() * self._governor_tile_sum(_g, "theologyCS").gather(1, _t1).squeeze(1)
        base = (self._rel_strength[utype.clamp(min=0)] - self._wound(hp)
                + self._promo_val(utype, promos, "RELIG_CS")
                + self._congress_relig_cs(seat)
                + (_card + _gov).to(self._rel_strength.dtype))
        if getattr(self, "_inquisitor_idx", -1) < 0:
            return base
        home = (utype == self._inquisitor_idx) & _home_t
        return base + home.long() * self._inquisitor_home_strength

    def _trade_water_level(self, row: int) -> torch.Tensor:
        """[B] long — how far out to sea this seat's Traders may go
        (`tradeWaterLevel`). CIV6: "The Celestial Navigation technology is
        required to move on Coast tiles. The Cartography technology is required
        to move on Ocean tiles."
        """
        B, dev = self.B, self.device
        out = torch.zeros(B, dtype=torch.long, device=dev)
        if self._celestial_tech < 0:
            return out
        celnav = self.civ_techs[:, row, self._celestial_tech]
        carto = (self.civ_techs[:, row, self._cartography_tech]
                 if self._cartography_tech >= 0 else torch.zeros_like(celnav))
        return torch.where(celnav, torch.where(carto, out + 2, out + 1), out)

    def _canal_pass(self) -> torch.Tensor:
        """[B, T] — CIV6 (Canal): "Allows Naval units to pass through this
        tile" (`canalPassage`). A HULL fact and nothing else: the ground under
        a Canal stays land for every other rule, and a pillaged district
        carries no effect."""
        if self._canal_didx < 0:
            return torch.zeros(self.B, self.T, dtype=torch.bool, device=self.device)
        return ((self.district == self._canal_didx) & self.district_complete
                & ~self.district_pillaged)

    def _trade_walkable(self, rows: torch.Tensor, tiles: torch.Tensor, water: torch.Tensor) -> torch.Tensor:
        """`tradeWalkable` — may a Trader at this water level stand here?
        `water` broadcasts against `tiles`."""
        return (
            self.passable[rows, tiles]
            | ((water >= 1) & self.wpass[rows, tiles]
               & (~self.ocean_tile[rows, tiles] | (water >= 2)))
        )

    def _trade_walk_step(self, rows: torch.Tensor, cur: torch.Tensor, target: torch.Tensor,
                         water: torch.Tensor) -> torch.Tensor:
        """ONE step of a Trader's walk (`tradeWalkStep`): the walkable
        neighbour strictly closer to `target` by hexDistance, ties by
        direction order — the war-march's integer rule, so both engines agree
        by construction. Arrived or stuck rows return `cur` unchanged.
        Zero draws, integer-only."""
        dev = self.device
        ar6 = torch.arange(6, device=dev)
        nb = self.neigh[cur.clamp(min=0)]
        nbc = nb.clamp(min=0)
        okn = (nb >= 0) & self._trade_walkable(rows.unsqueeze(1), nbc, water.unsqueeze(1))
        d_nb = self.pair_dist[target.clamp(min=0).unsqueeze(1), nbc].to(torch.long)
        d_cur = self.pair_dist[target.clamp(min=0), cur.clamp(min=0)].to(torch.long)
        key = torch.where(okn & (d_nb < d_cur.unsqueeze(1)), d_nb * 8 + ar6, 10**9)
        best = key.min(dim=1).values
        ok = (cur >= 0) & (target >= 0) & (cur != target) & (best < 10**9)
        nxt = nb.gather(1, (best % 8).clamp(max=5).unsqueeze(1)).squeeze(1)
        return torch.where(ok, nxt, cur)

    def _trade_walk_ok(self, rows: torch.Tensor, frm: torch.Tensor, dest: torch.Tensor,
                       water: torch.Tensor) -> torch.Tensor:
        """Can a Trader descend from `frm` to `dest` at this water level — the
        `tradeWalkReachable` twin. Only a pair NO descent reaches leaves its
        Trader parked at the origin."""
        if len(rows) == 0:
            return torch.zeros(0, dtype=torch.bool, device=self.device)
        alive = (
            (frm >= 0) & (dest >= 0)
            & self._trade_walkable(rows, frm.clamp(min=0), water)
            & self._trade_walkable(rows, dest.clamp(min=0), water)
        )
        cur = torch.where(alive, frm, torch.full_like(frm, -1))
        arrived = alive & (cur == dest)
        for _ in range(TRADE_ROAD_MAX_STEPS):
            walking = alive & ~arrived
            if not bool(walking.any()):
                break
            nxt = self._trade_walk_step(rows, cur.clamp(min=0), dest.clamp(min=0), water)
            stepped = walking & (nxt != cur)
            cur = torch.where(stepped, nxt, cur)
            alive = alive & (arrived | stepped)
            arrived = arrived | (alive & (cur == dest))
        return arrived

    def _road_terms(self, frm: torch.Tensor, dest: torch.Tensor, river3: torch.Tensor,
                    utype: torch.Tensor | None = None, promos: torch.Tensor | None = None):
        """The (terrain, river) MP terms a step pays, route-aware —
        the `moveCostInto` + `riverCharge` twin. A ROUTE-to-ROUTE step ignores
        the terrain penalty entirely ("roads let a unit pass through Woods or
        Hills as if it were flat") and pays its own tier's published cost
        instead, which for a RAILROAD at both ends is `railroad_mp`. Every tier
        above the Ancient road bridges rivers, so it drops the river charge
        too. A route on only ONE end does nothing, exactly as in real Civ 6.

        CIV6 (Alpine / Ranger): the promotion lets its holder "move onto a tile
        with the appropriate terrain or terrain feature at the cost of only 1
        Movement" — Ranger names Woods and Jungle, Alpine the Hills, and Marsh
        is nobody's. `tmove` is the mover-free schedule, so each waived charge
        is subtracted back out here.

        The pair returned is (what the step costs BEYOND a plain point, river)
        — the caller adds the plain point itself."""
        dc = dest.clamp(min=0)
        tm = self.tmove.gather(1, dc.unsqueeze(1)).squeeze(1)
        if utype is not None and promos is not None:
            d1 = dc.unsqueeze(1)
            hill = self.hills.gather(1, d1).squeeze(1)
            tm = tm - (hill & self._promo_flag(utype, promos, "TERRAIN_MOVE_HILLS")).long() * self._mp_scale
            if self._woods_feats.numel():
                wood = self._feature_live(d1, self._woods_feats).squeeze(1)
                tm = tm - (wood & self._promo_flag(utype, promos, "TERRAIN_MOVE_WOODS")).long() * self._mp_scale
            tm = tm.clamp(min=0)
        fc, dcc = frm.clamp(min=0).unsqueeze(1), dest.clamp(min=0).unsqueeze(1)
        f_rr = self.railroad.gather(1, fc).squeeze(1)
        d_rr = self.railroad.gather(1, dcc).squeeze(1)
        rd = ((self.road.gather(1, fc).squeeze(1) | f_rr)
              & (self.road.gather(1, dcc).squeeze(1) | d_rr))
        step = torch.where(f_rr & d_rr,
                           torch.full_like(tm, self._railroad_mp),
                           torch.full_like(tm, self._road_tier_mp[self.road_tier]))
        terr = torch.where(rd, step - self._mp_scale, tm)
        bridged = bool(self._road_tier_bridges[self.road_tier])
        riv = torch.where(rd, torch.zeros_like(river3), river3) if bridged else river3
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
        civsAtWar(prober, owner) plus "barbarians are hostile to everyone", and
        `_seats_hostile` is that one question, including the "never hostile to
        yourself" arm.
        `seat` may be an int or a [B, 1] tensor (the war-march probes per
        slot)."""
        live = self._encamp_live()
        if not torch.is_tensor(seat) and seat == BARB_SEAT:
            return live
        # the owner is WHOEVER holds the ground — a city-state's Encampment
        # (its type's district) blocks and defends like a major's.
        return live & self._seats_hostile(seat, self.tile_seat)

    def _encamp_block(self, tiles: torch.Tensor, seat) -> torch.Tensor:
        """[B, N] — the same predicate as `_encamp_block_plane`, but evaluated
        AT `tiles` instead of over the whole map. A gather commutes with the
        elementwise chain, and the walkers probe six or twelve tiles where the
        plane is thousands, so this is the form every prober wants."""
        if self._encamp_didx < 0:
            return torch.zeros_like(tiles, dtype=torch.bool)
        t = tiles.clamp(min=0)
        live = (
            (self.district.gather(1, t) == self._encamp_didx)
            & self.district_complete.gather(1, t)
            & ~self.district_pillaged.gather(1, t)
            & (self.encamp_hp.gather(1, t) > 0)
        )
        if not torch.is_tensor(seat) and seat == BARB_SEAT:
            return live
        return live & self._seats_hostile(seat, self.tile_seat.gather(1, t))

    def _border_closed(self, tiles: torch.Tensor, row: int,
                       utype: torch.Tensor | None = None) -> torch.Tensor:
        """Is this ground CLOSED to seat row `row`? `borderClosedTo`'s twin,
        over any `tiles` shape.

        CIV6 (Movement, "Entering other empires' borders"): "In the beginning
        of the game all units may enter freely all other civilizations' and
        city-states' territory. This changes only after a civ (or city-state)
        develops the Early Empire civic ... units of one civ may only enter the
        territory of another civ if they have granted them Open Borders." War
        opens what the civic closed, and an ally needs no grant of its own:
        "Allies automatically have Open Borders." "Traders ignore borders", and
        "Religious units also ignore borders" — with the one exception the
        Inquisitor page names for itself: it "cannot enter another
        civilization's territory without Open Borders".

        CITY-STATE ground closes like anyone's, off the MINOR's own research
        record; CIV6 (Borders): "For city-states, Open Borders is granted to
        players that have reached Suzerain status" - and a war opens any
        border. Only a MAJOR's units are bound: `row` outside the major range
        walks free, which is what a barbarian was going to do anyway.
        """
        zero = torch.zeros(tiles.shape, dtype=torch.bool, device=tiles.device)
        if self._open_borders_civic < 0 or row >= self.n_majors:
            return zero
        R, B = self.n_majors, self.B
        tc = tiles.clamp(min=0).reshape(B, -1)
        owner = self.tile_seat.gather(1, tc)
        valid = (tiles >= 0).reshape(B, -1)
        foreign = valid & (owner >= 0) & (owner < R) & (owner != row)
        cs_own = valid & (owner >= 100) & (owner < 100 + self.S)
        if not bool(foreign.any()) and not bool(cs_own.any()):
            return zero
        closed = torch.zeros_like(foreign)
        if bool(foreign.any()):
            oc = owner.clamp(min=0, max=R - 1)
            civic = self.civ_civics[:, :R, self._open_borders_civic].gather(1, oc)
            at_war = self.war[:, row, :R].gather(1, oc)
            allied = (self.seat_ally_turns[:, row, :R] > 0).gather(1, oc)
            # column `row` of the grant matrix: what each GRANTOR gives this seat.
            granted = (self.seat_borders_turns[:, :R, row] > 0).gather(1, oc)
            closed = foreign & civic & ~at_war & ~allied & ~granted
        if bool(cs_own.any()):
            sc = (owner - 100).clamp(min=0, max=self.S - 1)
            civic_cs = self.citystate_civics[:, :, self._open_borders_civic].gather(1, sc)
            suz = self.citystate_suzerain.gather(1, sc) == row
            hostile = self._seats_hostile(row, owner)
            closed = closed | (cs_own & civic_cs & ~suz & ~hostile)
        if utype is not None:
            ut = utype.clamp(min=0).reshape(B, -1)
            free = (ut == self._trader_idx) | ((self._rel_strength[ut] > 0) & (ut != self._inquisitor_idx))
            closed = closed & ~free.expand_as(closed)
        return closed.reshape(tiles.shape)

    def _advance_open(self, u_type: torch.Tensor, u_seat: torch.Tensor,
                      dest: torch.Tensor) -> torch.Tensor:
        """`tileFreeForUnit`'s BORDER half for a post-battle advance — [B] bool,
        true where the victor may stand on the ground it just cleared.

        Winning a fight is not a grant of entry: CIV6 (Movement) lets a unit
        enter another empire's territory only with Open Borders, an alliance or
        a war, and the advance is an entry like any other. A barbarian killed
        inside a third party's land is the ordinary case — the attacker is at
        war with the barbarian, not with the owner of the ground.

        `_border_closed` asks per SEAT ROW and the attacking slot's seat differs
        across the batch, so the majors are asked one at a time and each answer
        is taken where that seat attacked. A non-major walks free, which is what
        `borderClosedTo` says of anyone `isCiv` refuses."""
        out = torch.ones(dest.shape[0], dtype=torch.bool, device=dest.device)
        if self._open_borders_civic < 0:
            return out
        for r in range(self.n_majors):
            mine = u_seat == r
            if not bool(mine.any()):
                continue
            shut = self._border_closed(dest.unsqueeze(1), r, u_type.unsqueeze(1)).squeeze(1)
            out = out & ~(mine & shut)
        return out

    def _blocked_for(
        self,
        tiles: torch.Tensor,
        seat,
        is_civilian=False,
        is_naval=False,
    ) -> torch.Tensor:
        return (self._stack_blocked(tiles, seat, is_civilian, is_naval)
                | self._encamp_block(tiles, seat))

    def _stack_blocked(
        self,
        tiles: torch.Tensor,
        seat,
        is_civilian=False,
        is_naval=False,
    ) -> torch.Tensor:
        """Pure STACKING check for tiles [B, N] — no Encampment term.

        ONE rule, keyed on the mover's SEAT:

            a FOREIGN unit blocks; an OWN unit of the SAME CLASS blocks;
            own cross-class stacks.

        The class is where the mover would STAND, not what it is ashore: CIV6
        (Movement, "Stacking") makes an embarked unit "a separate class", so a
        land unit probing water asks the passenger plane and a hull asks the
        military one. `tileFreeForUnit` decides it the same way.

        `seat` may be an int or a [B, 1] tensor (the war-march probes per slot);
        `is_civilian` / `is_naval` an int, a bool or a [B] tensor.
        """
        tc = tiles.clamp(min=0)
        mil_slot = self.military_at.gather(1, tc)
        civ_slot = self.civilian_at.gather(1, tc)
        emb_slot = self.embarked_at.gather(1, tc)

        neg = torch.full_like(tc, -1)
        mil_seat = torch.where(
            mil_slot >= 0, self.unit_seat.gather(1, mil_slot.clamp(min=0)), neg
        )
        civ_seat = torch.where(
            civ_slot >= 0, self.unit_seat.gather(1, civ_slot.clamp(min=0)), neg
        )
        emb_seat = torch.where(
            emb_slot >= 0, self.unit_seat.gather(1, emb_slot.clamp(min=0)), neg
        )

        def _flag(v):
            if torch.is_tensor(v):
                return v if v.dim() >= 2 else v.unsqueeze(1)
            return torch.full((1, 1), bool(v), dtype=torch.bool, device=tc.device)

        civ_b = _flag(is_civilian)
        emb_b = (self.water.gather(1, tc) & ~_flag(is_naval)) if self._embark_live \
            else torch.zeros_like(tc, dtype=torch.bool)
        mil_blocks = (mil_seat >= 0) & ((mil_seat != seat) | (~civ_b & ~emb_b))
        civ_blocks = (civ_seat >= 0) & ((civ_seat != seat) | (civ_b & ~emb_b))
        emb_blocks = (emb_seat >= 0) & ((emb_seat != seat) | emb_b)
        return mil_blocks | civ_blocks | emb_blocks

    def _first_free_spot(self, at_tile: torch.Tensor, seat: int, civ_mask: torch.Tensor | None = None, naval_mask: torch.Tensor | None = None, cart: torch.Tensor | None = None) -> tuple[torch.Tensor, torch.Tensor]:
        """Mirrors spawnUnit's placement probe: the anchor if free, else the
        first free neighbor in direction order (the stable distance sort
        keeps exactly that order). `seat` is the ABSOLUTE seat spawning —
        the only thing the probe needs to know about the owner;
        civ_mask [B] bool — True = civilian probe.
        naval_mask [B] bool marks rows spawning a NAVAL unit — those probe over
        enterable WATER (wpass; OCEAN needs the owner's CARTOGRAPHY, passed as
        cart [B]) instead of the land plane, so ships land on water.
        Returns (found [B], spot [B])."""
        cand7 = torch.cat([at_tile.unsqueeze(1), self.neigh[at_tile.clamp(min=0)]], dim=1)
        okc = cand7.clamp(min=0)
        # The SAME stacking rule the movement probe uses, keyed on the spawning
        # seat; the barbarian seat needs no special case, because "hostile to
        # everyone" already makes every occupant block.
        #
        # `_blocked_for`, not `_stack_blocked`: TS's spawnUnit probes with
        # tileFreeForUnit (units.ts), which calls encampmentBlocks — so the
        # Encampment wall belongs here too.
        blocked = self._blocked_for(cand7, seat,
                                    is_civilian=False if civ_mask is None else civ_mask,
                                    is_naval=False if naval_mask is None else naval_mask)
        terr = self.passable.gather(1, okc)
        if naval_mask is not None and bool(naval_mask.any()):
            ocean_ok = ~self.ocean_tile.gather(1, okc)
            if cart is not None:
                ocean_ok = ocean_ok | cart.unsqueeze(1)
            water_terr = ((self.wpass.gather(1, okc) & ocean_ok)
                          | self._canal_pass().gather(1, okc))
            terr = torch.where(naval_mask.unsqueeze(1), water_terr, terr)
        ok7 = (cand7 >= 0) & terr & ~blocked
        first = torch.where(ok7, torch.arange(7, device=self.device), 7).min(dim=1).values
        spot = cand7.gather(1, first.clamp(max=6).unsqueeze(1)).squeeze(1)
        return first < 7, spot

    def _seat_tech(self, seat: torch.Tensor, tech: int) -> torch.Tensor:
        """[B] bool — does the seat named per game in `seat` hold tech `tech`?

        `seat` is an ABSOLUTE seat; anything outside the major rows (a barbarian, a
        city-state, NO_SEAT) holds no tech, and a `tech` the rules table does
        not define is False everywhere. The research planes are the merged
        `civ_techs[:, row]` block, so seat 0 needs no arm of its own."""
        if tech < 0:
            return torch.zeros(self.B, dtype=torch.bool, device=self.device)
        rows = seat.clamp(min=0, max=self.n_majors - 1)
        bidx = torch.arange(self.B, device=self.device)
        return (seat >= 0) & (seat < self.n_majors) & self.civ_techs[bidx, rows, tech]

    def _ocean_open(self, seat: torch.Tensor) -> torch.Tensor:
        """[B] bool — may the seat named per game put a hull on OCEAN: its
        Cartography, or CIV6 (Knarr) Norway's Shipbuilding."""
        return self._seat_tech(seat, self._cartography_tech) | (
            self._seat_plays(seat, "NORWAY") & self._seat_tech(seat, self._shipbuilding_tech))

    def _row_ocean_open(self, row: int) -> torch.Tensor:
        """[B] bool — `_ocean_open` for one seat row."""
        return self._ocean_open(torch.full((self.B,), row, dtype=torch.long, device=self.device))

    def _gdr_has(self, utype: torch.Tensor, seat: torch.Tensor, k: int) -> torch.Tensor:
        """bool — `gdrHas`: the chassis is the robot AND its seat holds the
        Future-Era tech behind upgrade `k`. CIV6 (Giant Death Robot): the
        chassis "gains additional abilities and upgrades via Future Era
        technology research", so the upgrade is empire-wide and no per-unit
        state stands behind it."""
        z = torch.zeros(utype.shape, dtype=torch.bool, device=self.device)
        tech = self._gdr_upgrade_tech[k]
        if self._gdr_idx < 0 or tech < 0:
            return z
        col = self.civ_techs[:, :, tech]
        s0 = seat.clamp(min=0, max=self.n_majors - 1)
        v = col.gather(1, s0.reshape(self.B, -1)).reshape(seat.shape)
        return (utype == self._gdr_idx) & (seat >= 0) & (seat < self.n_majors) & v

    def _gdr_row_up(self, row: int, k: int) -> torch.Tensor:
        """[B] bool — the same question asked of a seat ROW rather than of a
        seat plane."""
        tech = self._gdr_upgrade_tech[k]
        if self._gdr_idx < 0 or tech < 0:
            return torch.zeros(self.B, dtype=torch.bool, device=self.device)
        return self.civ_techs[:, row, tech]

    def _gdr_beam_cs(self, utype: torch.Tensor, seat: torch.Tensor) -> torch.Tensor:
        """long — `gdrBeamCS`. CIV6 (Particle Beam Siege Cannon): "Ranged
        attacks against Cities and Encampments are 100% effective and gain +30
        Ranged Strength. (Applies to both melee and ranged attacks and when
        defending.)" This is the adder, wherever the robot meets a city; the
        effectiveness half is the -17 `_city_ranged_strength` stops taking."""
        z = torch.zeros(utype.shape, dtype=torch.long, device=self.device)
        return z + self._gdr_has(utype, seat, self._gdr_u_beam).long() * int(self._gdr_particle_cs)

    def _gdr_armor_cs(self, utype: torch.Tensor, seat: torch.Tensor,
                      foe_type: torch.Tensor) -> torch.Tensor:
        """long — `gdrArmorCS`. CIV6 (Reinforced Armor Plating): "+10 Combat
        Strength when defending against land and naval units" — an air strike
        is neither, and a city's own shot is neither."""
        z = torch.zeros(utype.shape, dtype=torch.long, device=self.device)
        ok = (self._gdr_has(utype, seat, self._gdr_u_armor) & (foe_type >= 0)
              & (self._type_air[foe_type.clamp(min=0, max=self.NU - 1)] == 0))
        return z + ok.long() * int(self._gdr_plate_cs)

    def _gdr_naval_cs(self, utype: torch.Tensor, foe_type: torch.Tensor) -> torch.Tensor:
        """long — `gdrNavalCS`. CIV6 (Giant Death Robot): "-17 Ranged Strength
        against District defenses and naval units" — a clause of the chassis
        itself, no upgrade behind it. The district half of that sentence is
        `_ranged_city_pen`, which every land ranged unit already pays."""
        z = torch.zeros(utype.shape, dtype=torch.long, device=self.device)
        if self._gdr_idx < 0:
            return z
        hit = (utype == self._gdr_idx) & (foe_type >= 0) & self.unit_naval[foe_type.clamp(min=0, max=self.NU - 1)]
        return z - hit.long() * int(self._gdr_naval_penalty)

    def _advance_terrain(self, u_type: torch.Tensor, u_seat: torch.Tensor,
                         dest: torch.Tensor) -> torch.Tensor:
        """`tileFreeForUnit`'s TERRAIN half for a post-battle ADVANCE — the
        check `_blocked_for` (occupancy only) omits, without which an attacker
        would advance onto the water tile of a just-killed embarked enemy.

        meleeAttack passes allowEmbark FALSE, so a LAND unit takes the land
        plane and never crosses to water; a NAVAL hull takes enterable water,
        OCEAN behind its OWN seat's CARTOGRAPHY, and never comes ashore.
        Barbarians raid by sea too (the GALLEY / QUADRIREME) and hold no tech,
        so their water plane is wpass minus OCEAN — exactly what
        waterEnterable allows them, with no arm of its own."""
        dc = dest.clamp(min=0).unsqueeze(1)
        ut = u_type.clamp(min=0, max=self.NU - 1)
        land_ok = self.passable.gather(1, dc).squeeze(1)
        water_ok = self.wpass.gather(1, dc).squeeze(1) & (
            ~self.ocean_tile.gather(1, dc).squeeze(1)
            | self._ocean_open(u_seat)
        )
        hull_ok = water_ok | self._canal_pass().gather(1, dc).squeeze(1)
        out = torch.where(self.unit_naval[ut], hull_ok, land_ok)
        return torch.where(self.unit_water_walk[ut],
                           land_ok | self.wpass.gather(1, dc).squeeze(1), out)

    def _spawn_barb(self, mask: torch.Tensor, at_tile: torch.Tensor, unit_type: int, naval: bool = False, ladder: bool = True) -> None:
        if not bool(mask.any()):
            return
        # a NAVAL barb probes the WATER plane (its hull cannot stand ashore),
        # exactly as TS's spawnUnit branches on UNITS[type].naval.
        _nm = torch.ones(self.B, dtype=torch.bool, device=self.device) if naval else None
        found, spot = self._first_free_spot(at_tile, BARB_SEAT, naval_mask=_nm)
        can = mask & found
        if not bool(can.any()):
            return
        rows = can.nonzero(as_tuple=True)[0]
        slot = self.next_slot[rows]
        assert int(slot.max()) < simbase.BARB_POOL_MAX, "barbarian slot pool exhausted — raise simbase.BARB_POOL_MAX"
        self.barb_unit_alive[rows, slot] = True
        self.barb_unit_type[rows, slot] = int(self._barb_ladder[unit_type]) if ladder else unit_type
        self.barb_unit_tile[rows, slot] = spot[rows]
        self.barb_unit_hp[rows, slot] = self.rules.combat.get("unitHp", 100)
        self.barb_unit_fortify[rows, slot] = 0  # a fresh (possibly reclaimed) slot starts undug
        self.barb_unit_revealed_turn[rows, slot] = -1
        self.barb_unit_xp[rows, slot] = 0
        self.barb_unit_level[rows, slot] = 1
        self.barb_unit_promos[rows, slot] = 0
        self.barb_unit_promo_offer[rows, slot] = 0
        self.barb_unit_promo_bonus[rows, slot] = 0
        self.barb_unit_xp_pct[rows, slot] = 0
        # TS spawnUnit writes `movesLeft: def.moves` plus the seat's golden
        # dedication and leaves movesFull undefined — a unit trained mid-turn
        # CAN move before its first refresh, and a reclaimed slot must not
        # inherit the dead unit's remainder.
        self.barb_unit_emb[rows, slot] = False
        _m = self._full_mp("barb")[rows, slot]
        self.barb_unit_mp[rows, slot] = _m
        self.barb_unit_mp_full[rows, slot] = _m
        self.barb_unit_attacks[rows, slot] = 1
        self.military_at[(rows, spot[rows])] = slot + self.POOL_LO["barb"]
        self.next_slot[rows] += 1

    def _reveal_around(self, rows: torch.Tensor, seat_row, tiles: torch.Tensor, radius) -> None:
        """revealAround's twin: lift `seat_row`'s fog within `radius` of
        `tiles`. rows [K] batch indices (UNIQUE per call — advanced-index
        assignment is last-write-wins), seat_row an int or [K] long, tiles
        [K] long, radius an int or a [K] long (the SIGHT promotion varies it
        per mover). No-op with fog off — TS's
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
        disk = self.pair_dist[tiles.clamp(min=0)] <= (
            radius.unsqueeze(1) if torch.is_tensor(radius) else radius)
        new = disk & ~self.seat_explored[rows, seat_row]
        self.seat_explored[rows, seat_row] |= disk
        # CIV6 (Hic Sunt Dracones, dark face): "+3 Era Score each time you
        # discover a new Continent or natural wonder" — one continent here,
        # so wonders are the whole event.
        cnt = (new & self.nwonder[rows]).sum(dim=1) * self._dracones_disc
        if bool((cnt > 0).any()):
            full = torch.zeros(self.B, dtype=torch.long, device=self.device)
            if isinstance(seat_row, int):
                full.index_add_(0, rows, cnt)
                self._dedication_event(seat_row, self._ded_dracones, full)
            else:
                for g in range(self.n_majors):
                    m = seat_row == g
                    if bool(m.any()):
                        full.zero_()
                        full.index_add_(0, rows[m], cnt[m])
                        self._dedication_event(g, self._ded_dracones, full)

    def _explored_at(self, seat_row, tiles: torch.Tensor) -> torch.Tensor:
        if not self.fog_of_war:
            return torch.ones_like(tiles, dtype=torch.bool)
        ex = self.seat_explored[:, seat_row] if isinstance(seat_row, int) else self.seat_explored[torch.arange(self.B, device=self.device), seat_row]
        return ex.gather(1, tiles.clamp(min=0).reshape(self.B, -1)).reshape(tiles.shape)

    def _spawn_unit(self, row: int, mask: torch.Tensor, at_tile: torch.Tensor, type_idx, init_xp: torch.Tensor | None = None, charges: torch.Tensor | None = None, gp_at: torch.Tensor | None = None, free_promo: torch.Tensor | None = None, formation: torch.Tensor | None = None) -> torch.Tensor:
        if not bool(mask.any()):
            return torch.zeros_like(mask)
        if isinstance(type_idx, int):
            type_idx = torch.full((self.B,), type_idx, dtype=torch.long, device=self.device)
        elif type_idx.dim() == 0:
            type_idx = type_idx.expand(self.B)
        pre = "major"
        is_civ_u = self._type_civilian[type_idx.clamp(min=0)]
        ti_n = type_idx.clamp(min=0, max=self.NU - 1)
        no_hold = (self._type_air[ti_n] > 0) | (ti_n == self._spy_idx)
        naval_m = self.unit_naval[ti_n] & mask
        cart = self._row_ocean_open(row) if self._cartography_tech >= 0 else None
        found, spot = self._first_free_spot(at_tile, row, civ_mask=is_civ_u, naval_mask=naval_m, cart=cart)
        if bool(no_hold.any()):
            found = torch.where(no_hold, at_tile >= 0, found)
            spot = torch.where(no_hold, at_tile.clamp(min=0), spot)
        can = mask & found
        if not bool(can.any()):
            return can
        rows = can.nonzero(as_tuple=True)[0]
        nxt = getattr(self, self.POOL_NEXT[pre])
        slot = nxt[rows]
        assert int(slot.max()) < simbase.MAJOR_POOL_MAX, "major slot pool exhausted — raise simbase.MAJOR_POOL_MAX"
        getattr(self, f"{pre}_unit_alive")[rows, slot] = True
        self.major_unit_seat[rows, slot] = row
        getattr(self, f"{pre}_unit_type")[rows, slot] = type_idx[rows]
        getattr(self, f"{pre}_unit_tile")[rows, slot] = spot[rows]
        self._reveal_around(rows, row, spot[rows],
                            self._unit_sight(type_idx[rows], torch.zeros_like(slot)))
        getattr(self, f"{pre}_unit_hp")[rows, slot] = self.rules.combat.get("unitHp", 100)
        getattr(self, f"{pre}_unit_fortify")[rows, slot] = 0
        getattr(self, f"{pre}_unit_revealed_turn")[rows, slot] = -1
        # CIV6 (Embrasure): "Military units trained in this city start with a
        # free promotion" — a unit that owes no XP for its first level, which
        # `takePromotion` then zeroes, so nothing carries into the second.
        if free_promo is None:
            getattr(self, f"{pre}_unit_xp")[rows, slot] = 0
        else:
            _cls = self.rules_dev.u_promo_class[type_idx[rows].clamp(min=0)]
            getattr(self, f"{pre}_unit_xp")[rows, slot] = torch.where(
                free_promo[rows] & (_cls >= 0),
                self._xp_to_next(torch.ones_like(slot)), torch.zeros_like(slot))
        getattr(self, f"{pre}_unit_level")[rows, slot] = 1
        getattr(self, f"{pre}_unit_promos")[rows, slot] = 0
        getattr(self, f"{pre}_unit_promo_offer")[rows, slot] = 0
        getattr(self, f"{pre}_unit_promo_used")[rows, slot] = 0
        getattr(self, f"{pre}_unit_promo_bonus")[rows, slot] = 0
        # CIV6: the training city's Encampment and Harbor experience lines are a
        # PERCENTAGE the unit carries for life, not a lump of starting XP.
        getattr(self, f"{pre}_unit_xp_pct")[rows, slot] = (
            torch.zeros_like(slot) if init_xp is None else init_xp[rows]
        )
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
        getattr(self, f"{pre}_unit_attacks")[rows, slot] = 1
        # a GREAT PERSON chassis carries its queue position; every other unit
        # (and every reclaimed slot) carries the -1 sentinel.
        getattr(self, f"{pre}_unit_gp_at")[rows, slot] = (
            torch.full_like(slot, -1) if gp_at is None else gp_at[rows])
        # a reclaimed slot carries the dead occupant's ROCK BAND career and SPY
        # record; TS builds a fresh object, so each starts at its own default
        # and only the chassis that owns the fact ever writes one.
        # a reclaimed slot carries the dead occupant's FORMATION too, and a
        # freshly trained unit is always a single one.
        getattr(self, f"{pre}_unit_formation")[rows, slot] = (
            formation[rows] if formation is not None else 0)
        getattr(self, f"{pre}_unit_escorted")[rows, slot] = False
        getattr(self, f"{pre}_unit_band_level")[rows, slot] = 0
        getattr(self, f"{pre}_unit_band_album")[rows, slot] = 0
        getattr(self, f"{pre}_unit_spy_mission")[rows, slot] = self._spy_idle
        getattr(self, f"{pre}_unit_spy_turns")[rows, slot] = 0
        getattr(self, f"{pre}_unit_spy_target")[rows, slot] = -1
        getattr(self, f"{pre}_unit_spy_level")[rows, slot] = 0
        _ch = self._type_charges[type_idx[rows]] if charges is None else charges[rows]
        getattr(self, f"{pre}_unit_charges")[rows, slot] = _ch + self._extra_charges(row, type_idx, at_tile)[rows]
        off = self.POOL_LO[pre]
        cu_rows = is_civ_u[rows]
        ar_rows = no_hold[rows]
        mil_rows = rows[~cu_rows & ~ar_rows]
        if len(mil_rows) > 0:
            self.military_at[(mil_rows, spot[mil_rows])] = nxt[mil_rows] + off
        cv_rows = rows[cu_rows & ~ar_rows]
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


    def _dig_at(self, gd: torch.Tensor, td: torch.Tensor, civ) -> None:
        """Mark a DIG for the games in `gd` on the tiles in `td` — the
        row-index form of `_mark_antiquity`, which takes a [B] mask.
        Every COMBAT death goes through here, exactly as every TS combat death
        goes through `combat.ts:killUnit`. Maintenance disbands and builder
        charge-exhaustion are NOT deaths and must not call it.

        `civ` is the EVENT's own civilization as a SEAT id: the unit that
        died, or the barbarians whose outpost was razed — an int or a tensor
        ALIGNED WITH `gd`, like `td`."""
        if len(gd) == 0:
            return
        m = torch.zeros(self.B, dtype=torch.bool, device=self.device)
        m[gd] = True
        t = torch.full((self.B,), -1, dtype=torch.long, device=self.device)
        t[gd] = td
        c = torch.full((self.B,), -1, dtype=torch.long, device=self.device)
        c[gd] = int(civ) if isinstance(civ, int) else civ
        self._mark_antiquity(m, t, c)
        self._mark_shipwreck(m, t, c)
        self._air_orphans_die()

    def _mark_antiquity(self, mask: torch.Tensor, tile: torch.Tensor, civ: torch.Tensor) -> None:
        """The markAntiquitySite twin — stamp an ANTIQUITY SITE on
        `tile` for the rows in `mask`. Real Civ 6 creates these from PRE-MODERN
        events (a razed barbarian outpost, a unit dying), so the era gate is the
        sourced part; a tile already carrying a dig does not stack, and water,
        districts and wonder tiles are refused exactly as TS refuses them.

        The dig is dated by the WORLD era at the moment of the event — CIV6
        dates an Artifact by WHEN its battle happened — while the stored
        civilization is the EVENT's own."""
        if not bool(mask.any()):
            return
        t = tile.clamp(min=0)
        era = self._world_era()
        okr = (
            mask
            & (tile >= 0)
            & (era < self._modern_era_index)
            # a tile already carrying a dig does not stack — and since the dig
            # now REMEMBERS its era and civilization, re-stamping would rewrite
            # the provenance TS refuses to touch.
            & ~self.antiquity.gather(1, t.unsqueeze(1)).squeeze(1)
            & ~self.water.gather(1, t.unsqueeze(1)).squeeze(1)
            # TS keeps ONE tile map, so `t.district` refuses EVERY seat's
            # district — and so does this plane: `_place_district` writes it
            # under whichever ROW queued the district, and nothing clears it.
            & (self.district.gather(1, t.unsqueeze(1)).squeeze(1) < 0)
            & (self.built_wonder.gather(1, t.unsqueeze(1)).squeeze(1) < 0)
            # TS refuses a dig on ANY tile carrying a district, and `foundCity`
            # sets `tile.district = 'CITY_CENTER'` (so do both capture paths).
            # The GPU's `district` plane does NOT encode centres — they live in
            # the seat-generic centre registry, so it is named here too.
            & (self.centre_slot_at.gather(1, t.unsqueeze(1)).squeeze(1) < 0)  # any major's centre
            # NOTE: a CITY-STATE centre is deliberately NOT excluded, and no
            # term for it is computed. TS sets `tile.district = 'CITY_CENTER'`
            # on any MAJOR's founding and on both capture paths, but never for
            # a city-state, so `markAntiquitySite` accepts a death on a
            # minor's centre.
        )
        if not bool(okr.any()):
            return
        rows = okr.nonzero(as_tuple=True)[0]
        self.antiquity[rows, t[rows]] = True
        # PROVENANCE travels with the Artifact: a themed museum wants one era
        # and three civilizations. The stored id is the SEAT of the EVENT's own
        # civilization, and a barbarian (seat 200) is a distinct civilization
        # for theming.
        self.antiquity_era[rows, t[rows]] = era[rows] if era.dim() else era
        self.antiquity_seat[rows, t[rows]] = civ[rows]

    def _mark_shipwreck(self, mask: torch.Tensor, tile: torch.Tensor, civ: torch.Tensor) -> None:
        """The markShipwreck twin — the WATER dig. This model sources
        dig placement from DEATHS rather than map generation, so a hull going
        down leaves the wreck, under `markAntiquitySite`'s own era gate and
        one-per-tile rule, and dated by the same WORLD era; the two bodies
        are disjoint because one refuses water and the other requires it, so
        a barbarian or a minor sinking a hull leaves a wreck like any
        major's."""
        if not bool(mask.any()):
            return
        t = tile.clamp(min=0)
        era = self._world_era()
        okr = (
            mask
            & (tile >= 0)
            & (era < self._modern_era_index)
            & self.water.gather(1, t.unsqueeze(1)).squeeze(1)
            & ~self.shipwreck.gather(1, t.unsqueeze(1)).squeeze(1)
        )
        if not bool(okr.any()):
            return
        rows = okr.nonzero(as_tuple=True)[0]
        self.shipwreck[rows, t[rows]] = True
        self.shipwreck_era[rows, t[rows]] = era[rows] if era.dim() else era
        self.shipwreck_seat[rows, t[rows]] = civ[rows]




    def _museum_room(self, row: int) -> torch.Tensor:
        """[B] bool — does this seat hold a city with a free artifact slot
        anywhere — the museum's own or the any-work pool's? The excavation's
        landing place."""
        return (self.city_alive[:, row] & (self._artifact_free(row) > 0)).any(dim=1)

    def _dig_here(self, row: int, tc: torch.Tensor) -> torch.Tensor:
        """[B, N] bool — is there a workable dig under these tiles?
        `digUnderfoot`'s twin: a land site always, a WRECK once this seat
        holds the civic that reveals wrecks."""
        land = self.antiquity.gather(1, tc)
        if self._shipwreck_civic < 0:
            return land
        seen = self.civ_civics[:, row, self._shipwreck_civic].unsqueeze(1)
        return land | (self.shipwreck.gather(1, tc) & seen)

    def _excavate_ok(self, row: int, tc: torch.Tensor, utype: torch.Tensor, charges: torch.Tensor) -> torch.Tensor:
        """[B, N] bool — the EXCAVATE column. An Archaeologist, a charge, a
        dig underfoot, ground this seat may stand on, and a free artifact slot
        to land the find in.

        CIV6 (Archaeologist): "Archaeologists cannot enter another
        civilization's territory without an Open Borders treaty" — ENTRY is
        what the rule gates, so the dig asks the same question the step did."""
        if getattr(self, "_archaeologist_idx", -1) < 0:
            return torch.zeros_like(tc, dtype=torch.bool)
        return (
            (utype == self._archaeologist_idx)
            & (charges > 0)
            & self._dig_here(row, tc)
            & ~self._border_closed(tc, row)
            & self._museum_room(row).unsqueeze(1)
        )

    def _park_cluster(self, tc: torch.Tensor) -> torch.Tensor:
        """[B, N, 6, 4] long — for each unit tile and each neighbour
        direction, the four tiles of the rhombus that pair anchors: the pair
        itself plus the two tiles adjacent to BOTH. -1 where the pair has
        fewer than two shared neighbours (a map edge). `parkCluster`'s twin,
        and like it the four come back SORTED so both engines name one set."""
        B, N = tc.shape
        nb = self.neigh[tc]                                  # [B, N, 6]
        nb_of_nb = self.neigh[nb.clamp(min=0)]               # [B, N, 6, 6]
        # shared = neighbours of the partner that are also neighbours of the
        # anchor, in TILE order (the TS body sorts them).
        same = (nb_of_nb.unsqueeze(4) == nb.unsqueeze(2).unsqueeze(2)).any(dim=4)  # [B, N, 6, 6]
        cand = torch.where(same & (nb_of_nb >= 0), nb_of_nb, torch.full_like(nb_of_nb, 1 << 30))
        srt, _ = cand.sort(dim=3)
        s0, s1 = srt[:, :, :, 0], srt[:, :, :, 1]
        ok = (nb >= 0) & (s1 < (1 << 30))
        quad = torch.stack([tc.unsqueeze(2).expand(B, N, 6), nb, s0, s1], dim=3)
        quad = torch.where(ok.unsqueeze(3), quad, torch.full_like(quad, -1))
        quad, _ = quad.sort(dim=3)
        return quad

    def _park_cluster_legal(self, row: int, quad: torch.Tensor) -> torch.Tensor:
        """[B, N, 6] bool — may this rhombus become a park?
        `parkClusterLegal`'s twin: every tile Charming or better, all four in
        ONE city of this seat, and nothing built on any of them.

        A CITY CENTRE is one of the things built on them: `foundCity` sets
        `tile.district = 'CITY_CENTER'` and both capture paths keep it, so TS
        refuses a rhombus touching one. The `district` plane does NOT encode
        centres — they live in the seat-generic centre registry — so the
        centre term is named separately, exactly as `_mark_antiquity` names
        it. A CITY-STATE centre is deliberately not excluded: TS never writes
        `tile.district` for a minor."""
        B, N, D, _ = quad.shape
        q = quad.clamp(min=0).reshape(B, -1)
        good = (
            (self.tile_seat.gather(1, q) == row)
            & (self.park.gather(1, q) < 0)
            & (self.improvement.gather(1, q) < 0)
            & (self.district.gather(1, q) < 0)
            & (self.centre_slot_at.gather(1, q) < 0)
            & (self.built_wonder.gather(1, q) < 0)
            & (self._tile_appeal().gather(1, q) >= self._park_min_appeal)
        ).reshape(B, N, D, 4)
        city = self.city_slot_at(row).gather(1, q).reshape(B, N, D, 4)
        one_city = (city == city[:, :, :, :1]).all(dim=3) & (city[:, :, :, 0] >= 0)
        return (quad >= 0).all(dim=3) & good.all(dim=3) & one_city

    def _venue_bits(self, tc: torch.Tensor) -> torch.Tensor:
        """[B, N] long — `concertVenueBits`: the venue KINDS a tile is, as
        the bits a band promotion's mask names."""
        vb = self._band_venue_bits
        bits = torch.zeros_like(tc)
        wnd = (self.built_wonder.gather(1, tc) >= 0) & self.built_wonder_complete.gather(1, tc)
        bits = bits | wnd.long() * vb["WONDER"]
        di = self.district.gather(1, tc)
        dc = self.district_complete.gather(1, tc)
        for bit, didx in self._band_venue_districts:
            bits = bits | ((di == didx) & dc).long() * bit
        bits = bits | (self.park.gather(1, tc) >= 0).long() * vb["NATIONAL_PARK"]
        bits = bits | self.nwonder.gather(1, tc).long() * vb["NATURAL_WONDER"]
        if self.SEASIDE >= 0:
            bits = bits | (self.improvement.gather(1, tc) == self.SEASIDE).long() * vb["SEASIDE_RESORT"]
        return bits

    def _concert_venue(self, tc: torch.Tensor, utype: torch.Tensor | None = None,
                       promos: torch.Tensor | None = None) -> torch.Tensor:
        """[B, N] long — the tile's VENUE value, 0 where a Rock Band cannot
        play. `concertVenue`'s twin: a completed World Wonder is 1000, a
        completed DISTRICT tile is worth the best venue building its own city
        holds in that district, and the band's own promotions ADD the venues
        they open (`BAND_VENUE` against the tile's `_venue_bits`)."""
        out = torch.zeros_like(tc)
        wnd = (self.built_wonder.gather(1, tc) >= 0) & self.built_wonder_complete.gather(1, tc)
        out = torch.where(wnd, torch.full_like(out, self._band_wonder_venue), out)
        extra = (self._promo_val_for(utype, promos, "BAND_VENUE", self._venue_bits(tc))
                 if utype is not None and promos is not None else torch.zeros_like(tc))
        di = self.district.gather(1, tc)
        dc = self.district_complete.gather(1, tc)
        live = ~wnd & (di >= 0) & dc
        if not bool(live.any()):
            return out + extra
        best = torch.zeros_like(tc)
        for r in range(self.n_majors):
            sl = self.city_slot_at(r).gather(1, tc)          # owning city SLOT, -1 = not this row's
            hit = live & (sl >= 0)
            if not bool(hit.any()):
                continue
            slc = sl.clamp(min=0)
            for bi, dix, v in self._band_venue:
                has = self.city_bldg[:, r, :, bi].gather(1, slc)
                best = torch.where(hit & has & (di == dix) & (best < v),
                                   torch.full_like(best, v), best)
        return torch.where(live, best, out) + extra

    def _perform_ok(self, row: int, tc: torch.Tensor, utype: torch.Tensor,
                    promos: torch.Tensor) -> torch.Tensor:
        """[B, N] bool — the PERFORM column: CIV6 "Rock Bands must always
        perform in foreign lands", on a tile carrying a venue."""
        if getattr(self, "_band_idx", -1) < 0:
            return torch.zeros_like(tc, dtype=torch.bool)
        owner = self.tile_seat.gather(1, tc)
        foreign = (owner >= 0) & (owner < self.n_majors) & (owner != row)
        return (utype == self._band_idx) & foreign & (self._concert_venue(tc, utype, promos) > 0)

    def _boost_ok(self, row: int, tc: torch.Tensor, utype: torch.Tensor,
                  u_charges: torch.Tensor) -> torch.Tensor:
        """[B, N] bool — the BOOST column: CIV6 (Royal Society) "Builders gain
        the ability to use all of their charges to provide bonus Production to a
        District Project. Once per city per turn"."""
        if getattr(self, "_builder_idx", -1) < 0 or not self._project_charge_live:
            return torch.zeros_like(tc, dtype=torch.bool)
        pct = self._bsum_by_row("projcharge", self._b_project_charge)[:, row]
        col = self._project_boost_slot(row, tc)
        fresh = self.city_boost_turn[:, row].gather(1, col.clamp(min=0)) != self.turn
        return ((utype == self._builder_idx) & (u_charges > 0) & (col >= 0) & fresh
                & (pct > 0).unsqueeze(1))

    def _park_ok(self, row: int, tc: torch.Tensor, utype: torch.Tensor) -> torch.Tensor:
        """[B, N] bool — the PARK column: a Naturalist standing on a tile that
        anchors at least one legal rhombus."""
        if getattr(self, "_naturalist_idx", -1) < 0:
            return torch.zeros_like(tc, dtype=torch.bool)
        legal = self._park_cluster_legal(row, self._park_cluster(tc)).any(dim=2)
        return (utype == self._naturalist_idx) & legal

    def _golden_ded_table(self, kind: int) -> torch.Tensor:
        """[B, n_majors] bool — which civs are in a GOLDEN age holding `kind`."""
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
        # CIV6 (Hic Sunt Dracones, Golden face): "+2 Movement for naval and
        # embarked units."
        emb = getattr(self, f"{pre}_unit_emb", None)
        nsel = self.unit_naval[typ] if emb is None else (self.unit_naval[typ] | emb)
        holds_d = self._golden_ded_table(self._ded_dracones).gather(1, civ)
        out = torch.where(civ_ok & nsel & holds_d, torch.full_like(out, self._golden_move), out)
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

    def _cliff_block_dirs(self, cur: torch.Tensor, nb6: torch.Tensor, own: torch.Tensor | None = None,
                          waive: torch.Tensor | None = None) -> torch.Tensor:
        """[B, N, 6] over unit SLOTS: which of the six steps a cliff closes,
        the whole pool in one dispatch; a caller holding a single unit passes
        N=1. The mask lives on the LAND tile, so read it there and test the bit
        pointing at the water side — from the water side that is the OPPOSITE
        direction ((d + 3) % 6 on this hex layout). Sourced exceptions: a city
        centre and a HARBOR ignore cliffs, and CIV6 (Commando) "can scale Cliff
        walls" — `waive` [B, N] is that promotion. Cliffs never touch
        land-to-land steps.

        SOURCED: the Harbor exception is OWNER-ONLY — "when YOUR units use it
        they will be able to pass the Cliffs... Enemy units won't." Callers
        pass `own` = the tiles this mover's civ holds; without it a Harbor
        would be a hole in the wall for the besieger too."""
        B, N, dev = self.B, cur.shape[1], self.device
        if not self._has_cliffs or (waive is not None and bool(waive.all())):
            return torch.zeros(B, N, 6, dtype=torch.bool, device=dev)
        c = cur.clamp(min=0)                                  # [B, N]
        nbc3 = nb6.clamp(min=0)                               # [B, N, 6]
        flat = nbc3.reshape(B, N * 6)
        cw = self.water.gather(1, c).unsqueeze(2)             # [B, N, 1]
        nw = self.water.gather(1, flat).reshape(B, N, 6)
        trans = (cw != nw) & (nb6 >= 0)
        if not bool(trans.any()):
            return torch.zeros(B, N, 6, dtype=torch.bool, device=dev)
        dirs = torch.arange(6, device=dev).reshape(1, 1, 6)
        land = torch.where(cw, nbc3, c.unsqueeze(2)).reshape(B, N * 6)
        dl = torch.where(cw, (dirs + 3) % 6, dirs).expand(B, N, 6).reshape(B, N * 6)
        bit = ((self.cliff_mask.gather(1, land) >> dl) & 1).bool()
        free = self.centre_slot_at.gather(1, land) >= 0
        if self._harbor_idx >= 0 and own is not None:
            free = free | ((self.district.gather(1, land) == self._harbor_idx) & own.gather(1, land))
        out = trans & bit.reshape(B, N, 6) & ~free.reshape(B, N, 6)
        return out & ~waive.unsqueeze(2) if waive is not None else out

    def _amph_atk_cs(self, emb: torch.Tensor) -> torch.Tensor:
        """[B] the attacker's amphibious penalty. CIV6 (Combat): an attack
        "made by an embarked unit against a unit or district on land that is
        unobstructed by Cliffs ... carries a -10 CS penalty". A Cliff refuses
        the attack outright rather than softening it, so every attack that
        reaches a resolver at all pays the full penalty."""
        return emb.long() * self._amphibious_attack_cs

    def _atk_pens(self, utype: torch.Tensor, promos: torch.Tensor, frm: torch.Tensor,
                  to: torch.Tensor, emb: torch.Tensor) -> torch.Tensor:
        """[B] the river-crossing and from-the-sea penalties an attacker pays.
        CIV6 (Amphibious): "No Combat Strength and Movement penalty when
        attacking from Sea or over a River" waives BOTH."""
        amph = self._promo_flag(utype, promos, "AMPHIBIOUS")
        z = torch.zeros_like(frm)
        pen = 5 * torch.where(amph, z, self._river_cross(frm, to))
        return pen + torch.where(amph, z, self._amph_atk_cs(emb))

    def _assault_promo_cs(self, utype: torch.Tensor, promos: torch.Tensor,
                          frm: torch.Tensor, ranged: bool = False) -> torch.Tensor:
        """the promotion term every attack ON A CITY contributes: attacking,
        versus a city, keyed on the attacker's own tile. `ranged` is what tells
        the district-assault promotions this is not a melee blow."""
        t = torch.ones_like(frm, dtype=torch.bool)
        return self._promo_cs(utype, promos, attacking=t, vs_city=t, tile=frm,
                              ranged=t if ranged else ~t)

    def _clear_camp_at(self, mask: torch.Tensor, tile: torch.Tensor, seat: torch.Tensor, row) -> None:
        """A non-barbarian unit entering a camp tile clears it: +50 gold to
        ITS seat (`seat` is a [B] ABSOLUTE seat — `clearCampFor` banks to
        `seatOf(unit.seat)`) and the camp list splices left (order matters for
        later garrison loops).

        `row` is the ACTING seat's row, which is a DIFFERENT seat from the
        mover when a suzerain walks a levied unit: `clearCampFor` banks the
        gold to the unit's seat and stamps the dig with the order's seat.

        KNOWN CORNER vs TS: a LEVIED city-state unit banks nothing here. TS
        credits `seatOf(unit.seat)` whoever that is and a city-state carries a
        treasury; the GPU's treasury plane has major rows only."""
        if not bool(mask.any()):
            return
        hit = mask & (self.camp_tile == tile.unsqueeze(1)).any(dim=1)
        if not bool(hit.any()):
            return
        # the outpost was the BARBARIANS' — theirs is the civilization buried
        self._mark_antiquity(hit, tile, torch.full_like(tile, BARB_SEAT))
        reward = self.rules.combat.get("campClearReward", 50)
        for b in hit.nonzero(as_tuple=True)[0].tolist():
            camps = self.camp_tile[b]
            k = int((camps == tile[b]).nonzero(as_tuple=True)[0][0])
            camps[k:-1] = camps[k + 1 :].clone()
            camps[-1] = -1
            self.n_camps[b] -= 1
            self._eff_version += 1  # a cleared outpost lifts its neighbours' appeal
            _s = int(seat[b])
            if 0 <= _s < self.n_majors:
                self.civ_treasury[b, _s] += float(reward)


    def _type_civic_slot_ok(self, row: int, per_city: bool) -> torch.Tensor:
        B, dev = self.B, self.device
        civ_ok = (self._type_civic.unsqueeze(0) < 0) | self.civ_civics[:, row].gather(
            1, self._type_civic.clamp(min=0).unsqueeze(0).expand(B, -1)
        )
        if not per_city:
            return civ_ok
        C = self.RC
        need = self._type_needs_slot.reshape(1, 1, -1)
        room = (self._artifact_free(row) > 0).unsqueeze(2)
        out = civ_ok.unsqueeze(1) & (~need | room)
        # CIV6 (Military Engineer): "can only be built in a city that has an
        # Encampment with an Armory" — the building carries its district.
        if bool((self._type_req_bldg >= 0).any()):
            held = torch.ones(B, C, self._type_req_bldg.shape[0], dtype=torch.bool, device=dev)
            for t in (self._type_req_bldg >= 0).nonzero(as_tuple=True)[0].tolist():
                held[:, :, t] = self.city_bldg[:, row, :, int(self._type_req_bldg[t])]
            out = out & held
        return out

    def _seat_slot_map(self, row: int) -> torch.Tensor:
        B = self.B
        mine = self.major_unit_alive & (self.major_unit_seat == row)
        rank = mine.long().cumsum(dim=1) - 1
        out = torch.full((B, simbase.UNIT_SLOTS), -1, dtype=torch.long, device=self.device)
        take = mine & (rank < simbase.UNIT_SLOTS)
        bs, slots = take.nonzero(as_tuple=True)
        out[bs, rank[bs, slots]] = slots + self.POOL_LO["major"]
        return out

    def _centre_seat_plane(self) -> torch.Tensor:
        """[B, T] — the ABSOLUTE seat holding a CITY CENTRE at each tile, -1
        elsewhere: `cityAtIndex` and `cityStateAt` answered by one plane. A
        major's centres come from the centre registry (a centre tile is owned
        by its own city, so `tile_seat` names the holder); a city-state's live
        outside that registry, in its own centre list."""
        neg = torch.full_like(self.tile_seat, -1)
        out = torch.where(self.centre_slot_at >= 0, self.tile_seat, neg)
        S = self.S
        if S > 0:
            ctr = self.citystate_center[:, :S].clamp(min=0)
            sid = torch.arange(S, device=self.device).unsqueeze(0).expand(self.B, S) + 100
            out = out.scatter(1, ctr, torch.where(self.citystate_alive[:, :S], sid, out.gather(1, ctr)))
        return out

    def _citystate_target(self, row: int) -> torch.Tensor:
        """[B, S] — may seat row `row` attack this city-state's centre?

        `meleeAttack`'s cityStateTarget: a DECLARED war on the minor itself,
        or a war with ANY seat that is its SUZERAIN (contesting the suzerain
        drags its minor in). Row-generic — the suzerain clause loops the major
        rows rather than naming seat 0."""
        S = max(self.S, 1)
        cs_row0 = self.n_majors
        out = self.war[:, row, cs_row0:cs_row0 + S][:, :self.S] if self.S > 0 else torch.zeros(self.B, 0, dtype=torch.bool, device=self.device)
        out = out.clone()
        for sx in range(self.n_majors):
            if sx == row:
                continue
            out = out | (self._suzerain_mask(sx)[:, :self.S] & self.war[:, row, sx].unsqueeze(1))
        return out

    def _seat_unit_mask(self, row: int) -> torch.Tensor:
        B, dev = self.B, self.device
        N = simbase.UNIT_SLOTS
        smap = self._seat_slot_map(row)
        present = smap >= 0
        sc = smap.clamp(min=0)
        alive = present.unsqueeze(2)
        tile = self.unit_tile.gather(1, sc)
        tc = tile.clamp(min=0)
        utype = self.unit_type.gather(1, sc)
        ut = utype.clamp(min=0, max=self.NU - 1)
        u_emb = self.unit_emb.gather(1, sc)
        u_charges = self.unit_charges.gather(1, sc)
        techs = self.civ_techs[:, row]
        civics = self.civ_civics[:, row]
        own_tile = self.tile_seat == row
        nb = self.neigh[tc.reshape(-1)].reshape(B, N, 6)
        nbc = nb.clamp(min=0).reshape(B, -1)
        on_map = nb >= 0

        _ms = self._visible_military_at(row).gather(1, nbc)
        _cs = self.civilian_at.gather(1, nbc)
        _es = self.embarked_at.gather(1, nbc)
        neg = torch.full_like(_ms, -1)
        m_seat = torch.where(_ms >= 0, self.unit_seat.gather(1, _ms.clamp(min=0)), neg)
        c_seat = torch.where(_cs >= 0, self.unit_seat.gather(1, _cs.clamp(min=0)), neg)
        e_seat = torch.where(_es >= 0, self.unit_seat.gather(1, _es.clamp(min=0)), neg)

        is_civ = (self._type_civilian[utype.clamp(min=0)]).unsqueeze(2)
        passable = self.passable.gather(1, nbc).reshape(B, N, 6)
        is_nav = self.unit_naval[ut].unsqueeze(2)
        cart = self._row_ocean_open(row).view(B, 1, 1)
        # a HULL floats over enterable water and through a Canal's passage;
        # the OCEAN gate is the seat's Cartography and the passage asks none.
        hull = ((self.wpass.gather(1, nbc).reshape(B, N, 6)
                 & (~self.ocean_tile.gather(1, nbc).reshape(B, N, 6) | cart))
                | self._canal_pass().gather(1, nbc).reshape(B, N, 6))
        if self._embark_live:
            ship = (techs[:, self._shipbuilding_tech] if self._shipbuilding_tech >= 0
                    else torch.zeros(B, dtype=torch.bool, device=dev)).view(B, 1, 1)
            water = (
                self.wpass.gather(1, nbc).reshape(B, N, 6)
                & (~self.ocean_tile.gather(1, nbc).reshape(B, N, 6) | cart)
            )
            any_war = self.war[:, row].any(dim=1).view(B, 1, 1)
            embark = water & ship & ~is_nav & any_war
            terr = torch.where(is_nav, hull, passable | embark)
        else:
            terr = torch.where(is_nav, hull, passable)
        # ...and a WATER-WALKING chassis takes both planes at once, with no
        # embark clause of any kind between them.
        _walk = self.unit_water_walk[ut].unsqueeze(2)
        if bool(_walk.any()):
            terr = torch.where(
                _walk, passable | self.wpass.gather(1, nbc).reshape(B, N, 6), terr)
        # CIV6 (Enhanced Mobility): the robot "can perform a Jump action to
        # cross over mountain terrain" — one hex of mountain, simply enterable.
        _jmp = ((ut == self._gdr_idx) & self._gdr_row_up(row, self._gdr_u_moves).unsqueeze(1)).unsqueeze(2)
        if bool(_jmp.any()):
            terr = terr | (_jmp & self.tile_mountain.gather(1, nbc).reshape(B, N, 6))
        _nav6 = is_nav.expand(B, N, 6).reshape(B, -1)
        _blk = torch.where(
            is_civ,
            self._blocked_for(nbc, row, is_civilian=True, is_naval=_nav6).reshape(B, N, 6),
            self._blocked_for(nbc, row, is_naval=_nav6).reshape(B, N, 6),
        )
        has_mp = (self.unit_mp.gather(1, sc) > 0).unsqueeze(2)
        has_atk = (self.unit_attacks.gather(1, sc) > 0).unsqueeze(2)
        cliff6 = (self._cliff_block_dirs(tc, nb, own_tile,
                                         self._promo_flag(ut, self.unit_promos.gather(1, sc), "CLIFFS")
                                         | self.unit_naval[ut] | self.unit_water_walk[ut]) & alive
                  if self._embark_live else torch.zeros(B, N, 6, dtype=torch.bool, device=dev))
        shut = self._border_closed(nb, row, utype.unsqueeze(2).expand(B, N, 6))
        # THE ESCORT FORMATION. CIV6 (Formations): "A military unit can create a
        # formation with a support or civilian unit at any time" and the pair
        # then moves as one — so a formed civilian has no step of its own. A
        # flag with no military unit beside it is no formation, which is what
        # frees the civilian the moment its escort dies.
        _mil_here = self.military_at.gather(1, tc)
        _esc_here = ((_mil_here >= 0) & (torch.where(
            _mil_here >= 0, self.unit_seat.gather(1, _mil_here.clamp(min=0)),
            torch.full_like(_mil_here, -1)) == row)).unsqueeze(2)
        _u_esc = self.unit_escorted.gather(1, sc).unsqueeze(2)
        in_esc = _u_esc & _esc_here
        # ONE rider to an escort — a second flag on the tile would be a
        # formation nothing moves.
        _rider_here = torch.zeros(B, N, dtype=torch.bool, device=dev)
        for _pl in (self.civilian_at, self.embarked_at):
            _r = _pl.gather(1, tc)
            _rc = _r.clamp(min=0)
            _rider_here = _rider_here | (
                (_r >= 0) & (_r != smap) & self.unit_escorted.gather(1, _rc)
                & (self.unit_seat.gather(1, _rc) == row))
        move = on_map & terr & ~_blk & alive & has_mp & ~cliff6 & ~shut & ~in_esc

        # ---- ATTACK 6-11 -----------------------------------------------------
        # `unitsHostile` for the units, the centre plane for the cities: ONE
        # hostility rule, so no seat needs a target clause of its own.
        hostile_u = (
            self._seats_hostile(row, m_seat) | self._seats_hostile(row, c_seat)
            | self._seats_hostile(row, e_seat)
        ).reshape(B, N, 6)
        ctr_seat = self._centre_seat_plane()
        ctr_nb = ctr_seat.gather(1, nbc)
        ctr_major = (ctr_nb >= 0) & (ctr_nb < 100)
        city_t = (self._seats_hostile(row, torch.where(ctr_major, ctr_nb, neg))).reshape(B, N, 6)
        cs_t = torch.zeros(B, N, 6, dtype=torch.bool, device=dev)
        if self.S > 0:
            _cst = torch.zeros(B, self.T, dtype=torch.bool, device=dev)
            _cst.scatter_(1, self.citystate_center[:, :self.S].clamp(min=0), self._citystate_target(row))
            cs_t = (_cst.gather(1, nbc) & (ctr_nb >= 100)).reshape(B, N, 6)
        can_fight = (self._type_combat[utype] > 0).unsqueeze(2)
        melee = (self._type_ranged_strength[ut] <= 0).unsqueeze(2)
        # A live enemy Encampment is a target in its own right, melee or shot:
        # CIV6 charges a ranged attack -17 "when attacking city and district
        # defenses", which prices the blow rather than refusing it.
        enc_t = self._encamp_block(nbc, row).reshape(B, N, 6)
        # CIV6: "Embarked units with melee attacks may attack targets on land
        # when adjacent to it, but they will suffer the amphibious attack CS
        # penalty", and "may not attack any other unit in the water, including
        # other embarked units". A Cliff closes the shore entirely, and an
        # embarked RANGED unit has no attack at all.
        shore = melee & ~self.water.gather(1, nbc).reshape(B, N, 6) & ~cliff6
        may_shoot = self._siege_may_shoot("major").gather(1, sc).unsqueeze(2)
        attack = (
            on_map & (hostile_u | city_t | cs_t | enc_t)
            & can_fight & (~u_emb.unsqueeze(2) | shore) & alive & has_mp & has_atk & may_shoot
        )

        hold = alive

        if self.improvements_on and self._builder_idx >= 0:
            hf = (civics[:, self._hillfarms_civic] if self._hillfarms_civic >= 0
                  else torch.zeros(B, dtype=torch.bool, device=dev)).unsqueeze(1)
            mining = (techs[:, self._mine_unlock_tech] if self._mine_unlock_tech >= 0
                      else torch.zeros(B, dtype=torch.bool, device=dev)).unsqueeze(1)
            constr = (techs[:, self._lumber_unlock_tech] if self._lumber_unlock_tech >= 0
                      else torch.zeros(B, dtype=torch.bool, device=dev)).unsqueeze(1)
            here_ok = (
                present
                & (utype == self._builder_idx)
                & (u_charges > 0)
                & own_tile.gather(1, tc)
                & (self.centre_slot_at.gather(1, tc) < 0)
                & (self.improvement.gather(1, tc) < 0)
                & (self.district.gather(1, tc) < 0)          # can't improve a district tile
                & (self.built_wonder.gather(1, tc) < 0)      # an in-flight wonder pave refuses improvements
            )
            farmable = self.farm_flat.gather(1, tc) | (self.farm_hill.gather(1, tc) & hf)
            build_f = (here_ok & farmable).unsqueeze(2)
            build_m = (here_ok & self.mine_ok.gather(1, tc) & mining).unsqueeze(2)
            build_l = (here_ok & self.lumber_ok.gather(1, tc) & ~self.feat_stripped.gather(1, tc) & constr).unsqueeze(2)
        else:
            here_ok = torch.zeros(B, N, dtype=torch.bool, device=dev)
            build_f = build_m = build_l = torch.zeros(B, N, 1, dtype=torch.bool, device=dev)
        ftr_t = self.tile_ftr.gather(1, tc)
        ftu_t = self.tile_ftu.gather(1, tc)
        chop = (
            present
            & ((utype == self._builder_idx) if self._builder_idx >= 0 else torch.zeros_like(present))
            & (u_charges > 0)
            & (ftr_t > 0)
            & (ftu_t >= 0) & techs.gather(1, ftu_t.clamp(min=0))
            & ~self.feat_stripped.gather(1, tc)
            & ~self._congress_chop(self.feat_id.gather(1, tc))[0]
        ).unsqueeze(2)
        # REPAIR (`builderRepair`): a builder on an OWN tile whose improvement
        # or district is pillaged. No charge is spent — the turn is.
        repair = (
            present
            & ((utype == self._builder_idx) if self._builder_idx >= 0 else torch.zeros_like(present))
            & own_tile.gather(1, tc)
            & (self.pillaged.gather(1, tc) | self.district_pillaged.gather(1, tc))
        ).unsqueeze(2)
        # THE MILITARY ENGINEER'S GROUND (`engineerTileOk`): its rows go "in
        # your own or neutral territory", so the ownership term is wider than
        # the Builder's, and its improvement columns carry their own catalog
        # clauses rather than a resource match.
        eng_ground = (
            present
            & ((utype == self._eng_idx) if self._eng_idx >= 0 else torch.zeros_like(present))
            & (u_charges > 0)
            & (own_tile | (self.tile_seat < 0)).gather(1, tc)
            & self.passable.gather(1, tc)
            & ~self.water.gather(1, tc)
        )
        # CIV6 (Legion): "Can build a Roman Fort" — the FORT row on the
        # engineer's ground, with the chassis' own charge and no tech.
        fort_ground = (
            present & self._type_fort_builder[utype.clamp(min=0, max=self.NU - 1)] & (u_charges > 0)
            & (own_tile | (self.tile_seat < 0)).gather(1, tc)
            & self.passable.gather(1, tc)
            & ~self.water.gather(1, tc)
        )
        eng_here = (
            (eng_ground | fort_ground)
            & (self.centre_slot_at.gather(1, tc) < 0)
            & (self.improvement.gather(1, tc) < 0)
            & (self.district.gather(1, tc) < 0)
            & (self.built_wonder.gather(1, tc) < 0)
        )
        _res_cols: list[torch.Tensor] = []
        if self.improvements_on and self._builder_idx >= 0:
            _rq = self.res_imp.gather(1, tc)
            for _k in range(3, self._imp_unlock.numel()):
                _ut = int(self._imp_unlock[_k])
                _unl = (techs[:, _ut].unsqueeze(1) if _ut >= 0
                        else torch.ones(B, 1, dtype=torch.bool, device=dev))
                if self.SEASIDE >= 0 and _k == self.SEASIDE:
                    _ok = here_ok & self._seaside_ok().gather(1, tc) & _unl
                elif self._imp_suz[_k]:
                    _ok = here_ok & self._suz_improvement_ok(row, _k).gather(1, tc)
                elif self._imp_uniq[_k] >= 0:
                    _ok = here_ok & self._uniq_improvement_ok(row, _k).gather(1, tc)
                elif self._imp_eng[_k]:
                    _who = (utype == self._eng_idx) & _unl
                    if _k == self.FORT:
                        _who = _who | fort_ground
                    _ok = eng_here & _who & self._imp_ground_ok(_k).gather(1, tc)
                elif self._imp_water[_k]:
                    # WATER-ONLY (the Offshore Wind Farm): the row's own
                    # terrain list is the whole ground rule, on a water plot
                    # with no resource to insist on a different improvement.
                    _ok = (here_ok & _unl & (_rq == -1)
                           & self.water.gather(1, tc) & ~self.tile_submerged.gather(1, tc)
                           & self._imp_ground_ok(_k).gather(1, tc))
                elif self._imp_ground[_k]:
                    # GROUND-ONLY: the row's own clause, on a plot with no
                    # resource of its own to insist on a different improvement.
                    _ok = (here_ok & _unl & (_rq == -1)
                           & ~self.water.gather(1, tc) & self.passable.gather(1, tc)
                           & self._imp_ground_ok(_k).gather(1, tc))
                else:
                    _ok = here_ok & (_rq == _k) & _unl
                _res_cols.append(_ok.unsqueeze(2))
        # PILLAGE needs a WAR with the tile's owner, city-state owners
        # included — `phase.ts`'s replay arm re-validates exactly this and
        # would silently no-op anything wider.
        _ts = self.tile_seat
        _owned = (_ts >= 0) & (_ts < BARB_SEAT)
        _enemy = (_owned & self.war[:, row].gather(
            1, self._seat_row[torch.where(_owned, _ts, torch.zeros_like(_ts))])).gather(1, tc)
        _has_imp = (self.improvement.gather(1, tc) >= 0) & ~self.pillaged.gather(1, tc)
        # CIV6: the Encampment "cannot be pillaged normally" — a melee unit
        # conquers it instead, which is where its pillage is written.
        _has_dis = (
            (self.district.gather(1, tc) >= 0)
            & (self.district.gather(1, tc) != self._encamp_didx)
            & self.district_complete.gather(1, tc)
            & ~self.district_pillaged.gather(1, tc)
            & (self.centre_slot_at.gather(1, tc) < 0)
        )
        pillage = present & (self._type_combat[utype] > 0) & _enemy & (_has_imp | _has_dis)
        # CIV6 (Coastal Raid): a NAVAL RAIDER "must be next to the land
        # improvement or district, and must have at least 3 Movement points
        # remaining" — the same column, over the adjacent ring.
        if bool(self._type_raider.any()):
            _nb = self.neigh[tc]                              # [B, N, 6]
            _nbc = _nb.clamp(min=0).reshape(B, -1)
            _nts = self.tile_seat.gather(1, _nbc)
            _nown = (_nts >= 0) & (_nts < BARB_SEAT)
            _nwar = _nown & self.war[:, row].gather(
                1, self._seat_row[torch.where(_nown, _nts, torch.zeros_like(_nts))])
            _nimp = (self.improvement.gather(1, _nbc) >= 0) & ~self.pillaged.gather(1, _nbc)
            _ndis = (
                (self.district.gather(1, _nbc) >= 0)
                & (self.district.gather(1, _nbc) != self._encamp_didx)
                & self.district_complete.gather(1, _nbc)
                & ~self.district_pillaged.gather(1, _nbc)
                & (self.centre_slot_at.gather(1, _nbc) < 0)
            )
            _nland = ~self.water.gather(1, _nbc)
            _raidable = ((_nb >= 0).reshape(B, -1) & _nland & _nwar
                         & (_nimp | _ndis)).reshape(B, N, 6).any(dim=2)
            # CIV6 (Thunderbolt of the North): "coastal raiding for all naval
            # melee units"
            raid = (present & (self._type_raider[utype]
                               | (self._type_naval_melee[utype] & self._row_leads(row, "HARDRADA").unsqueeze(1)))
                    & self.water.gather(1, tc)
                    & (self.unit_mp.gather(1, sc) >= 3 * self._mp_scale)
                    & _raidable)
            pillage = pillage | raid
        pillage = pillage.unsqueeze(2)

        _sn: list[torch.Tensor] = []
        if getattr(self, "_snipe_on", False):
            rngd = (self._type_ranged_strength[ut] > 0) & (self._type_ranged_range[ut] >= 2)
            ring = self.ring2[tc]
            ringc = ring.clamp(min=0).reshape(B, -1)
            _rm = self.military_at.gather(1, ringc)
            _rc = self.civilian_at.gather(1, ringc)
            _rneg = torch.full_like(_rm, -1)
            _rms = torch.where(_rm >= 0, self.unit_seat.gather(1, _rm.clamp(min=0)), _rneg)
            _rcs = torch.where(_rc >= 0, self.unit_seat.gather(1, _rc.clamp(min=0)), _rneg)
            # the strike's scope-out: a MAJOR's ranged fire engages barbarians
            # only (cpu/core/combat.ts hostileRangedStrike, `!(isCiv(a) &&
            # isCiv(b))`), so a major seat's ring targets are barbarian units.
            _res_ = self.embarked_at.gather(1, ringc)
            _res_s = torch.where(_res_ >= 0, self.unit_seat.gather(1, _res_.clamp(min=0)), _rneg)
            _ring_u = ((_rms == BARB_SEAT) | (_rcs == BARB_SEAT)
                       | (_res_s == BARB_SEAT)).reshape(B, N, 12)
            _ring_ctr = self._centre_seat_plane().gather(1, ringc)
            _ring_c = self._seats_hostile(
                row, torch.where(_ring_ctr < 100, _ring_ctr, _rneg)).reshape(B, N, 12)
            # CIV6: ranged fire bombards a minor's centre on
            # `cityStateAttackable`'s own clauses — a declared war, or a war
            # with its suzerain.
            _ring_csp = torch.zeros(B, self.T, dtype=torch.bool, device=dev)
            if self.S > 0:
                _ring_csp.scatter_(1, self.citystate_center[:, :self.S].clamp(min=0), self._citystate_target(row))
            _ring_cs = (_ring_csp.gather(1, ringc) & (_ring_ctr >= 100)).reshape(B, N, 12)
            # a district's defenses are a target at range too
            _ring_e = self._encamp_block(ringc, row).reshape(B, N, 12)
            _sn = [
                present.unsqueeze(2) & rngd.unsqueeze(2) & ~u_emb.unsqueeze(2)
                & has_atk & may_shoot & (ring >= 0) & (_ring_u | _ring_c | _ring_cs | _ring_e)
            ]

        _sp: list[torch.Tensor] = []
        if getattr(self, "_A_SPREAD", -1) >= 0:
            _relig = torch.zeros_like(present)
            if self._missionary_idx >= 0:
                _relig = _relig | (utype == self._missionary_idx)
            if getattr(self, "_apostle_idx", -1) >= 0:
                _relig = _relig | (utype == self._apostle_idx)
            _sp_ok = present & _relig & (u_charges > 0) & self.civ_religion_done[:, row].unsqueeze(1)
            _sp = [_sp_ok.unsqueeze(2).expand(-1, -1, 7)]

        _fd: list[torch.Tensor] = []
        if getattr(self, "_A_FOUND", -1) >= 0:
            _fd = [(present & (utype == self._settler_idx)).unsqueeze(2)
                   if self._settler_idx >= 0
                   else torch.zeros(B, N, 1, dtype=torch.bool, device=dev)]

        _ex: list[torch.Tensor] = []
        if getattr(self, "_A_EXCAVATE", -1) >= 0:
            _ex = [(present & self._excavate_ok(row, tc, utype, u_charges)).unsqueeze(2)]

        _pk: list[torch.Tensor] = []
        if getattr(self, "_A_PARK", -1) >= 0:
            _pk = [(present & self._park_ok(row, tc, utype)).unsqueeze(2)]

        _pc: list[torch.Tensor] = []
        if getattr(self, "_A_PERFORM", -1) >= 0:
            _pc = [(present & self._perform_ok(row, tc, utype, self.unit_promos.gather(1, sc))).unsqueeze(2)]

        _bp: list[torch.Tensor] = []
        if getattr(self, "_A_BOOST", -1) >= 0:
            _bp = [(present & self._boost_ok(row, tc, utype, u_charges)).unsqueeze(2)]

        _fu: list[torch.Tensor] = []
        if getattr(self, "_A_FORM_UP", -1) >= 0:
            # CIV6 (Formations): two military units of the same type make a
            # Corps once Nationalism is in and three an Army once Mobilization
            # is — a Fleet and an Armada at sea. A tier holds `tier + 1` units,
            # so merging an a-tier into a b-tier asks for tier a + b + 1 and the
            # civic THAT tier waits on. The neighbour is where the second one of
            # a type can stand: this engine seats one military unit to a tile.
            _hm = self.military_at.gather(1, nbc)
            _hok = _hm >= 0
            _hcl = _hm.clamp(min=0)
            _h_seat = torch.where(_hok, self.unit_seat.gather(1, _hcl), neg)
            _h_type = torch.where(_hok, self.unit_type.gather(1, _hcl), neg)
            _h_form = torch.where(_hok, self.unit_formation.gather(1, _hcl),
                                  torch.zeros_like(_hm))
            _tier = _h_form.reshape(B, N, 6) + self.unit_formation.gather(1, sc).unsqueeze(2) + 1
            _civ_ok = torch.zeros(B, N, 6, dtype=torch.bool, device=dev)
            for _k in range(1, self._form_max + 1):
                _ci = self._formation_civic[_k] if _k < len(self._formation_civic) else -1
                if _ci < 0:
                    continue
                _civ_ok = _civ_ok | ((_tier == _k) & civics[:, _ci].view(B, 1, 1))
            # CIV6 (Giant Death Robot): "Cannot form Corps or Armies by any
            # means" — neither as the actor nor as the host.
            _no_form = ((utype == self._gdr_idx).unsqueeze(2)
                        | (_h_type.reshape(B, N, 6) == self._gdr_idx))
            _fu = [can_fight & has_mp & alive & on_map & ~_no_form
                   & _hok.reshape(B, N, 6) & (_h_seat.reshape(B, N, 6) == row)
                   & (_h_type.reshape(B, N, 6) == utype.unsqueeze(2))
                   & _civ_ok]

        _ec: list[torch.Tensor] = []
        if getattr(self, "_A_ESCORT", -1) >= 0:
            _ec = [alive & (is_civ | u_emb.unsqueeze(2)) & (tile >= 0).unsqueeze(2)
                   & ~_u_esc & _esc_here & ~_rider_here.unsqueeze(2)]

        _ue: list[torch.Tensor] = []
        if getattr(self, "_A_UNESCORT", -1) >= 0:
            _ue = [alive & in_esc]

        _pr: list[torch.Tensor] = []
        if getattr(self, "_A_PROMOTE", -1) >= 0:
            _pr = [present.unsqueeze(2) & self._promo_offer_mask(sc, utype)]

        _cd: list[torch.Tensor] = []
        if getattr(self, "_A_CONDEMN", -1) >= 0:
            # CIV6 (Condemn Heretic): "Must be at war with the owner of the
            # religious unit" — a MILITARY unit's verb on an adjacent tile, and
            # a WAR is what it asks for, not the wider hostility relation.
            _hr = self._religious_at(nbc)
            _hs = torch.where(_hr >= 0, self.unit_seat.gather(1, _hr.clamp(min=0)),
                              torch.full_like(nbc, -1))
            _hw = self.war[:, row].gather(
                1, self._seat_row[_hs.clamp(min=0)]) & (_hs >= 0)
            _cd = [(present & (self._type_combat[utype.clamp(min=0)] > 0)).unsqueeze(2)
                   & on_map & _hw.reshape(B, N, 6)]

        _rh: list[torch.Tensor] = []
        if getattr(self, "_A_HERESY", -1) >= 0 and getattr(self, "_inquisitor_idx", -1) >= 0:
            _rh = [(present & (utype == self._inquisitor_idx) & (u_charges > 0)
                    & (self.centre_slot_at.gather(1, tc) >= 0)
                    & (self.tile_seat.gather(1, tc) == row)).unsqueeze(2)]
        elif getattr(self, "_A_HERESY", -1) >= 0:
            _rh = [torch.zeros(B, N, 1, dtype=torch.bool, device=dev)]

        _li: list[torch.Tensor] = []
        if getattr(self, "_A_INQUISITION", -1) >= 0:
            _ok = torch.zeros(B, N, dtype=torch.bool, device=dev)
            if getattr(self, "_apostle_idx", -1) >= 0:
                _ok = (present & (utype == self._apostle_idx)
                       & (u_charges >= self._launch_inquisition_charges)
                       & (self.tile_seat.gather(1, tc) == row)
                       & ~self.civ_inquisition[:, row].unsqueeze(1))
            _li = [_ok.unsqueeze(2)]

        _hc: list[torch.Tensor] = []
        if getattr(self, "_A_HEATHEN", -1) >= 0:
            # CIV6 (Heathen Conversion): "Can convert all adjacent Barbarians to
            # your side by using a religious charge."
            _bs = self._barb_unit_plane()
            _hc = [(present & (u_charges > 0)
                    & self._promo_flag(utype, self.unit_promos.gather(1, sc), "HEATHEN")
                    & (on_map & _bs.gather(1, nbc).reshape(B, N, 6)).any(dim=2)).unsqueeze(2)]

        _ug: list[torch.Tensor] = []
        if getattr(self, "_A_UPGRADE", -1) >= 0:
            _ug = [(present & self._upgrade_ok(row, sc, tc, utype)).unsqueeze(2)]

        _as: list[torch.Tensor] = []
        if getattr(self, "_A_AIR_STRIKE", -1) >= 0:
            _as = [present.unsqueeze(2) & self._air_target_mask(row, sc, tc, utype)]
        _nk: list[torch.Tensor] = []
        if getattr(self, "_A_NUKE", -1) >= 0:
            _nk = [present.unsqueeze(2) & self._nuke_mask(row, sc, tc, utype)]

        _ap: list[torch.Tensor] = []
        if getattr(self, "_A_AIR_PILLAGE", -1) >= 0:
            _ap = [present.unsqueeze(2) & self._air_pillage_mask(row, sc, tc, utype)]
        _rb: list[torch.Tensor] = []
        if getattr(self, "_A_REBASE", -1) >= 0:
            _rb = [present.unsqueeze(2) & self._rebase_mask(row, sc, tc, utype)]

        _st: list[torch.Tensor] = []
        if getattr(self, "_A_SPY_TRAVEL", -1) >= 0:
            _st = [present.unsqueeze(2) & self._spy_travel_mask(row, sc, tc, utype)]
        _sm: list[torch.Tensor] = []
        if getattr(self, "_A_SPY_MISSION", -1) >= 0:
            _sm = [present.unsqueeze(2) & self._spy_mission_mask(row, sc, tc, utype)]

        # CIV6 (Military Engineer): "Can construct Roads ... (uses 1 charge)"
        # (`canBuildRoad`) — a road already laid is nothing to lay again — and
        # "Can spend a charge to complete 20% of an engineering type of
        # district ... and Flood Barrier building" (`engineerFinishCity`).
        _rd: list[torch.Tensor] = []
        if getattr(self, "_A_ROAD", -1) >= 0:
            _rd = [(eng_ground & ~self.road.gather(1, tc)).unsqueeze(2)]
        # CIV6 (Railroad): "Can only be constructed by Military Engineers.
        # Does not cost a charge, but does cost 1 Iron and 1 Coal", once Steam
        # Power is in. Its page names no ground clause of its own, so the
        # Engineer's own territory rule is the whole gate — but the CHARGE term
        # is not one of its conditions, so it rides `eng_ground` rather than
        # `eng_here`.
        _rr: list[torch.Tensor] = []
        if getattr(self, "_A_RAIL", -1) >= 0:
            _rrok = torch.ones(B, 1, dtype=torch.bool, device=dev)
            if self._railroad_tech >= 0:
                _rrok = techs[:, self._railroad_tech].unsqueeze(1)
            for _sl, _n in self._railroad_cost:
                _rrok = _rrok & (self.civ_stockpile[:, row, _sl] >= _n).unsqueeze(1)
            _rrg = (present
                    & ((utype == self._eng_idx) if self._eng_idx >= 0 else torch.zeros_like(present))
                    & (own_tile | (self.tile_seat < 0)).gather(1, tc)
                    & self.passable.gather(1, tc)
                    & ~self.water.gather(1, tc))
            _rr = [(_rrg & _rrok & ~self.railroad.gather(1, tc)).unsqueeze(2)]
        # CIV6: fallout "can be cleaned from affected tiles by Builders,
        # Military Engineers, or any other unit that has at least 1 remaining
        # build charge", and doing so "takes 1 build charge". No chassis clause
        # and no territory clause — the charge and the fallout are the whole
        # gate.
        _cf: list[torch.Tensor] = []
        if getattr(self, "_A_CLEAN", -1) >= 0:
            _cf = [(present & (u_charges > 0)
                    & self._fallout().gather(1, tc)).unsqueeze(2)]
        # REMOVE_IMPROVEMENT — CIV6 (Builder / Military Engineer): "Can
        # Remove Tile Improvements (costs no charge)", both pages verbatim.
        # An OWN tile holding one; the turn is spent, never a charge.
        _ri: list[torch.Tensor] = []
        if getattr(self, "_A_REMOVE_IMP", -1) >= 0:
            _rm_u = torch.zeros_like(present)
            if self._builder_idx >= 0:
                _rm_u = _rm_u | (utype == self._builder_idx)
            if self._eng_idx >= 0:
                _rm_u = _rm_u | (utype == self._eng_idx)
            _ri = [(present & _rm_u & own_tile.gather(1, tc)
                    & (self.improvement.gather(1, tc) >= 0)).unsqueeze(2)]
        _fi: list[torch.Tensor] = []
        if getattr(self, "_A_FINISH", -1) >= 0:
            _fi = [(present
                    & ((utype == self._eng_idx) if self._eng_idx >= 0 else torch.zeros_like(present))
                    & (u_charges > 0)
                    & self._eng_finish_at(row).gather(1, tc)).unsqueeze(2)]

        # THE GREAT PERSON'S ONE VERB: spend a charge where this person's
        # ability may be spent. Which person is acting is the chassis and its
        # queue position, never a column of its own.
        _gp: list[torch.Tensor] = []
        if getattr(self, "_A_GP", -1) >= 0:
            _gp = [(present & self._gp_site_ok(row, sc, tc)).unsqueeze(2)]

        _sn3: list[torch.Tensor] = []
        if getattr(self, "_snipe3_on", False):
            # CIV6: distance 3 needs ATTACK RANGE 3 — chassis range plus the
            # RANGE promotion, which is what `unitAttackRange` sums on TS.
            _rt3 = self._promo_val(ut, self.unit_promos.gather(1, sc), "RANGE")
            rngd3 = (self._type_ranged_strength[ut] > 0) & ((self._type_ranged_range[ut] + _rt3) >= 3)
            ring3 = self.ring3[tc]
            ring3c = ring3.clamp(min=0).reshape(B, -1)
            _rm3 = self.military_at.gather(1, ring3c)
            _rc3 = self.civilian_at.gather(1, ring3c)
            _rneg3 = torch.full_like(_rm3, -1)
            _rms3 = torch.where(_rm3 >= 0, self.unit_seat.gather(1, _rm3.clamp(min=0)), _rneg3)
            _rcs3 = torch.where(_rc3 >= 0, self.unit_seat.gather(1, _rc3.clamp(min=0)), _rneg3)
            _res3 = self.embarked_at.gather(1, ring3c)
            _res3s = torch.where(_res3 >= 0, self.unit_seat.gather(1, _res3.clamp(min=0)), _rneg3)
            # same scope-out as the SNIPE head: a major's ranged fire engages
            # barbarian units, hostile centres, and district defenses.
            _ring3u = ((_rms3 == BARB_SEAT) | (_rcs3 == BARB_SEAT)
                       | (_res3s == BARB_SEAT)).reshape(B, N, 18)
            _ring3ctr = self._centre_seat_plane().gather(1, ring3c)
            _ring3ct = self._seats_hostile(
                row, torch.where(_ring3ctr < 100, _ring3ctr, _rneg3)).reshape(B, N, 18)
            _ring3csp = torch.zeros(B, self.T, dtype=torch.bool, device=dev)
            if self.S > 0:
                _ring3csp.scatter_(1, self.citystate_center[:, :self.S].clamp(min=0), self._citystate_target(row))
            _ring3cs = (_ring3csp.gather(1, ring3c) & (_ring3ctr >= 100)).reshape(B, N, 18)
            _ring3e = self._encamp_block(ring3c, row).reshape(B, N, 18)
            _sn3 = [
                present.unsqueeze(2) & rngd3.unsqueeze(2) & ~u_emb.unsqueeze(2)
                & has_atk & may_shoot & (ring3 >= 0) & (_ring3u | _ring3ct | _ring3cs | _ring3e)
            ]

        out = torch.cat(
            [move, attack, hold, build_f, build_m, build_l, chop, repair]
            + _res_cols + [pillage] + _sn + _sp + _fd + _ex + _pk + _pr + _cd + _rh + _li + _hc
            + _ug + _as + _rb + _st + _sm + _rd + _fi + _gp + _sn3 + _pc + _bp + _fu
            + _ec + _ue + _ap + _rr + _cf + _nk + _ri,
            dim=2,
        )
        if self._act_names and self.improvements_on and self._builder_idx >= 0:
            assert out.shape[-1] == len(self._act_names), (
                f"_seat_unit_mask is {out.shape[-1]} wide but the enum has {len(self._act_names)} entries"
            )
        return out

    def _air_first_k(self, cand: torch.Tensor, width: int) -> torch.Tensor:
        """[B, N, T] bool -> [B, N, width] TILE INDEX, -1 where a row offers
        fewer. The first `width` set tiles in TILE-INDEX order, which is what
        both engines mean by column k."""
        B, N, T = cand.shape
        dev = cand.device
        rank = cand.long().cumsum(dim=2) - 1
        keep = cand & (rank < width)
        col = torch.where(keep, rank, torch.full_like(rank, width))
        idx = torch.arange(T, device=dev).view(1, 1, T).expand(B, N, T)
        pad = torch.full((B, N, width + 1), -1, dtype=torch.long, device=dev)
        pad.scatter_(2, col, idx)
        return pad[:, :, :width]

    def _air_tile_offer(self, row: int) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """[B, T] x3 — hostile LAND units, hostile SHIPS, and a hostile major
        CENTRE, per tile. An aircraft holds neither occupancy plane, so what
        stands on a tile is exactly what those two carry (`airStrikeOffers`)."""
        B, T, dev = self.B, self.T, self.device
        neg = torch.full((B, T), -1, dtype=torch.long, device=dev)
        land = torch.zeros(B, T, dtype=torch.bool, device=dev)
        sea = torch.zeros(B, T, dtype=torch.bool, device=dev)
        for plane in (self._visible_military_at(row), self.civilian_at, self.embarked_at):
            pc = plane.clamp(min=0)
            here = plane >= 0
            s = torch.where(here, self.unit_seat.gather(1, pc), neg)
            t = torch.where(here, self.unit_type.gather(1, pc), neg)
            h = self._seats_hostile(row, s)
            nav = self.unit_naval[t.clamp(min=0, max=self.NU - 1)]
            sea = sea | (h & nav)
            land = land | (h & ~nav)
        cs = self._centre_seat_plane()
        ctr = self._seats_hostile(row, torch.where((cs >= 0) & (cs < 100), cs, neg))
        return land, sea, ctr

    def _air_wreckable(self, row: int) -> torch.Tensor:
        """[B, T] — a tile an air pillage may wreck: at war with its owner,
        carrying an unpillaged improvement or a complete district that is
        neither a centre nor an Encampment (`airPillageOffers`)."""
        ts = self.tile_seat
        own = (ts >= 0) & (ts < BARB_SEAT)
        war = own & self.war[:, row].gather(1, self._seat_row[ts.clamp(min=0)])
        imp = (self.improvement >= 0) & ~self.pillaged
        dis = ((self.district >= 0) & (self.district != self._encamp_didx)
               & self.district_complete & ~self.district_pillaged
               & (self.centre_slot_at < 0))
        return war & (imp | dis)

    def _air_pillage_targets(self, row: int, sc: torch.Tensor, tc: torch.Tensor,
                             utype: torch.Tensor) -> torch.Tensor:
        """[B, N, W] TILE INDEX, -1 on a dead column — `airPillageTargets`.

        CIV6 (Bomber): a bomber "may attack tile improvements and districts,
        though they need more than 50% health to do so (or the Superfortress
        Promotion, which removes the minimum health requirement)"."""
        B, N = tc.shape
        W, dev = self._air_strike_cols, self.device
        out = torch.full((B, N, W), -1, dtype=torch.long, device=dev)
        ti = utype.clamp(min=0, max=self.NU - 1)
        kind = torch.where(utype >= 0, self._type_air[ti], torch.zeros_like(ti))
        cols = self._air_cols(kind)
        if W == 0 or cols.numel() == 0:
            return out
        k, t2 = kind[:, cols], tc[:, cols]
        pr = self.unit_promos.gather(1, sc[:, cols])
        dist = self.pair_dist[t2.reshape(-1)].reshape(B, cols.numel(), self.T).long()
        rngv = (self._type_ranged_range[ti[:, cols]]
                + self._promo_val(ti[:, cols], pr, "RANGE")).unsqueeze(2)
        fit = ((self.unit_hp.gather(1, sc[:, cols]) * 2
                > int(self.rules.combat.get("unitHp", 100)))
               | self._promo_flag(ti[:, cols], pr, "AIR_PILLAGE_ANY_HP"))
        cand = (
            (dist > 0) & (dist <= rngv) & self._air_wreckable(row).unsqueeze(1)
            & (k == 2).unsqueeze(2) & fit.unsqueeze(2)
            & (self.unit_mp.gather(1, sc[:, cols]) > 0).unsqueeze(2)
            & (self.unit_attacks.gather(1, sc[:, cols]) > 0).unsqueeze(2)
        )
        out[:, cols] = self._air_first_k(cand, W)
        return out

    def _air_pillage_mask(self, row: int, sc: torch.Tensor, tc: torch.Tensor,
                          utype: torch.Tensor) -> torch.Tensor:
        return self._air_pillage_targets(row, sc, tc, utype) >= 0

    def _allied_with(self, row: int, seat: torch.Tensor) -> torch.Tensor:
        """bool in `seat`'s shape — `seatsAllied`: an alliance clock still
        running between `row` and the seat named per cell. Only majors keep
        one, so a minor, a barbarian and NO_SEAT are all False."""
        ns = self.seat_ally_turns.shape[2]
        s0 = seat.clamp(min=0, max=ns - 1)
        v = self.seat_ally_turns[:, row].gather(1, s0.reshape(self.B, -1)).reshape(seat.shape)
        return (seat >= 0) & (seat < self.n_majors) & (v > 0)

    def _nuke_hostile(self, row: int) -> torch.Tensor:
        """[B, T] bool — a tile that belongs to, or holds a unit of, a seat
        that is neither `row` nor its ally. `_nuke_offer` asks it of every tile
        in the blast: a device poisons its own ground as readily as a rival's,
        so a target is only offered where the blast reaches somebody else."""
        out = ((self.tile_seat >= 0) & (self.tile_seat != row)
               & ~self._allied_with(row, self.tile_seat))
        for plane in ("military_at", "civilian_at", "embarked_at"):
            sl = getattr(self, plane)
            s = torch.where(sl >= 0, self.unit_seat.gather(1, sl.clamp(min=0)),
                            torch.full_like(sl, -1))
            out = out | ((sl >= 0) & (s != row) & ~self._allied_with(row, s))
        return out

    def _nuke_offer(self, row: int, k: int) -> torch.Tensor:
        """[B, T] bool — `nukeOffers`: a blast of device `k` centred on this
        tile reaches a seat this one would fight."""
        near = (self.pair_dist <= int(self._nuke_radius[k])).to(torch.float32)
        return (self._nuke_hostile(row).to(torch.float32) @ near) > 0

    def _silo_reach(self, row: int, k: int) -> torch.Tensor:
        """[B, T] bool — `siloReaches`: an unpillaged MISSILE SILO this seat
        owns stands within the device's own Range of the tile. CIV6: "When
        deployed from a Missile Silo or a Nuclear Submarine, they have a Range
        of 12" / "of 15"."""
        if self._silo_iid < 0:
            return torch.zeros(self.B, self.T, dtype=torch.bool, device=self.device)
        silo = ((self.improvement == self._silo_iid) & ~self.pillaged
                & (self.tile_seat == row)).to(torch.float32)
        near = (self.pair_dist <= int(self._nuke_range[k])).to(torch.float32)
        return (silo @ near) > 0

    def _nuke_targets(self, row: int, sc: torch.Tensor, tc: torch.Tensor,
                      utype: torch.Tensor) -> torch.Tensor:
        """[B, N, D*W] TILE INDEX, -1 on a dead column — `nukeTargets`, one
        head per device row and `_nuke_cols` wide, in TILE-INDEX order.

        CIV6: a device is deployed by "bomber aircraft, Nuclear Submarines, and
        the Missile Silo" — a BOMBER carries it out to its own operational
        range, a submarine throws it the device's own Range, and the silo is an
        improvement with no column here at all."""
        B, N = tc.shape
        W, D = self._nuke_cols, self._n_devices
        out = torch.full((B, N, W * D), -1, dtype=torch.long, device=self.device)
        if W == 0 or D == 0 or getattr(self, "_A_NUKE", -1) < 0:
            return out
        ti = utype.clamp(min=0, max=self.NU - 1)
        carry = (utype >= 0) & (self._type_nuke_carry[ti] > 0)
        cols = carry.any(dim=0).nonzero(as_tuple=True)[0]
        if cols.numel() == 0:
            return out
        t2 = tc[:, cols]
        dist = self.pair_dist[t2.reshape(-1)].reshape(B, cols.numel(), self.T).long()
        air = self._type_air[ti[:, cols]] > 0
        promos = self.unit_promos.gather(1, sc[:, cols])
        arng = (self._type_ranged_range[ti[:, cols]]
                + self._promo_val(ti[:, cols], promos, "RANGE"))
        live = carry[:, cols] & (self.unit_mp.gather(1, sc[:, cols]) > 0)
        for k in range(D):
            rng = torch.where(air, arng, torch.full_like(arng, int(self._nuke_range[k])))
            cand = ((dist <= rng.unsqueeze(2)) & self._nuke_offer(row, k).unsqueeze(1)
                    & live.unsqueeze(2) & (self.civ_wmd[:, row, k] > 0).reshape(B, 1, 1))
            out[:, cols, k * W:(k + 1) * W] = self._air_first_k(cand, W)
        return out

    def _seat_nuke_candidate(self, row: int) -> tuple[torch.Tensor, torch.Tensor]:
        """(device [B], tile [B]) — the SILO launch a driver would take: the
        first device this seat holds whose silo reaches an offered target, and
        the lowest such tile index. -1 where there is none. The engine
        re-validates both halves at the apply; this only picks."""
        B, dev = self.B, self.device
        kd = torch.full((B,), -1, dtype=torch.long, device=dev)
        tl = torch.full((B,), -1, dtype=torch.long, device=dev)
        for k in range(self._n_devices):
            room = (self.civ_wmd[:, row, k] > 0) & (kd < 0)
            if not bool(room.any()):
                continue
            cand = self._silo_reach(row, k) & self._nuke_offer(row, k) & room.unsqueeze(1)
            has = cand.any(dim=1)
            kd = torch.where(has, torch.full_like(kd, k), kd)
            tl = torch.where(has, cand.long().argmax(dim=1), tl)
        return kd, tl

    def _nuke_mask(self, row: int, sc: torch.Tensor, tc: torch.Tensor,
                   utype: torch.Tensor) -> torch.Tensor:
        return self._nuke_targets(row, sc, tc, utype) >= 0

    def _air_cols(self, kind: torch.Tensor) -> torch.Tensor:
        """the N-columns holding an aircraft in ANY batch row — every air body
        narrows to these before it builds anything [B, N, T]."""
        return (kind > 0).any(dim=0).nonzero(as_tuple=True)[0]

    def _air_strike_targets(self, row: int, sc: torch.Tensor, tc: torch.Tensor,
                            utype: torch.Tensor) -> torch.Tensor:
        """[B, N, W] TILE INDEX, -1 on a dead column — `airStrikeTargets`.

        CIV6 (Air combat): a strike reaches anything inside the aircraft's
        OPERATIONAL RANGE, a FIGHTER's damage is "effective against land units,
        but not against cities and naval units" and a BOMBER's "against cities
        and naval units but not against land units"."""
        B, N = tc.shape
        W, dev = self._air_strike_cols, self.device
        out = torch.full((B, N, W), -1, dtype=torch.long, device=dev)
        ti = utype.clamp(min=0, max=self.NU - 1)
        kind = torch.where(utype >= 0, self._type_air[ti], torch.zeros_like(ti))
        cols = self._air_cols(kind)
        if W == 0 or cols.numel() == 0:
            return out
        k, t2 = kind[:, cols], tc[:, cols]
        dist = self.pair_dist[t2.reshape(-1)].reshape(B, cols.numel(), self.T).long()
        rngv = (self._type_ranged_range[ti[:, cols]]
                + self._promo_val(ti[:, cols], self.unit_promos.gather(1, sc[:, cols]),
                                  "RANGE")).unsqueeze(2)
        land, sea, ctr = self._air_tile_offer(row)
        bomb = (k == 2).unsqueeze(2)
        offer = torch.where(bomb, (ctr | sea).unsqueeze(1), (land & ~ctr).unsqueeze(1))
        cand = (
            (dist > 0) & (dist <= rngv) & offer
            & (k > 0).unsqueeze(2)
            & (self.unit_mp.gather(1, sc[:, cols]) > 0).unsqueeze(2)
            & (self.unit_attacks.gather(1, sc[:, cols]) > 0).unsqueeze(2)
        )
        out[:, cols] = self._air_first_k(cand, W)
        return out

    def _air_target_mask(self, row: int, sc: torch.Tensor, tc: torch.Tensor,
                         utype: torch.Tensor) -> torch.Tensor:
        return self._air_strike_targets(row, sc, tc, utype) >= 0

    def _rebase_targets(self, row: int, sc: torch.Tensor, tc: torch.Tensor,
                        utype: torch.Tensor) -> torch.Tensor:
        """[B, N, W] TILE INDEX, -1 on a dead column — `rebaseTargets`: this
        seat's own bases with room, in tile-index order. CIV6: "The maximum
        re-base distance is twice the Moves of that air unit"."""
        B, N = tc.shape
        W, dev = self._air_rebase_cols, self.device
        out = torch.full((B, N, W), -1, dtype=torch.long, device=dev)
        ti = utype.clamp(min=0, max=self.NU - 1)
        kind = torch.where(utype >= 0, self._type_air[ti], torch.zeros_like(ti))
        cols = self._air_cols(kind)
        if W == 0 or cols.numel() == 0:
            return out
        k, t2 = kind[:, cols], tc[:, cols]
        dist = self.pair_dist[t2.reshape(-1)].reshape(B, cols.numel(), self.T).long()
        reach = (2 * self._type_moves[ti[:, cols]]).unsqueeze(2)
        cand = (
            (dist > 0) & (dist <= reach)
            & self._air_free_at(row).unsqueeze(1)
            & (k > 0).unsqueeze(2)
            & (self.unit_mp.gather(1, sc[:, cols]) > 0).unsqueeze(2)
        )
        out[:, cols] = self._air_first_k(cand, W)
        return out

    def _rebase_mask(self, row: int, sc: torch.Tensor, tc: torch.Tensor,
                     utype: torch.Tensor) -> torch.Tensor:
        return self._rebase_targets(row, sc, tc, utype) >= 0

    def _upgrade_ok(self, row: int, sc: torch.Tensor, tc: torch.Tensor,
                    utype: torch.Tensor) -> torch.Tensor:
        """[B, N] — `canUpgradeUnit`. CIV6 (Unit): the chassis has a successor,
        the successor is unlocked, the unit stands "in friendly territory" with
        "more than 0 Movement left", and the seat can pay the Gold and whatever
        strategic resource the NEW chassis asks for — "unless the unit you're
        upgrading also requires the same resource, in which case you don't
        need any"."""
        B, N = utype.shape
        dev = self.device
        nxt = self._up_to_of(row, utype)
        ok = (nxt >= 0) & (utype >= 0)
        if not bool(ok.any()):
            return torch.zeros(B, N, dtype=torch.bool, device=dev)
        nc = nxt.clamp(min=0)
        rt, rc = self._type_tech[nc], self._type_civic[nc]
        have_t = torch.where(rt >= 0, self.civ_techs[:, row].gather(1, rt.clamp(min=0)),
                             torch.ones_like(ok))
        have_c = torch.where(rc >= 0, self.civ_civics[:, row].gather(1, rc.clamp(min=0)),
                             torch.ones_like(ok))
        ok = ok & have_t & have_c
        ok = ok & (self.tile_seat.gather(1, tc) == row)
        ok = ok & (self.unit_mp.gather(1, sc) > 0)
        # the GOLD: the two chassis' own purchase prices, as `upgradeGoldCost`
        price = (self._type_cost[nc] - self._type_cost[utype.clamp(min=0)]).clamp(min=0).double() \
            * self.rules.gold_purchase_mult
        ok = ok & (self.civ_treasury[:, row].unsqueeze(1) >= price)
        # the BANK: the new chassis' charge, and nothing when both rungs ask
        # for the same resource
        slot, cost = self._type_res_slot[nc], self._type_res_cost[nc]
        same = self._type_res_slot[utype.clamp(min=0)] == slot
        want = (slot >= 0) & (cost > 0) & ~same
        have = self.civ_stockpile[:, row].gather(1, slot.clamp(min=0).reshape(B, -1)) \
            if self._n_strategic else torch.zeros_like(cost)
        return ok & (~want | (have >= cost))

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
        B, N = tile.shape
        dev, dt = self.device, self.dtype
        BIG = float(self.T)
        tc = tile.clamp(min=0)
        nb = self.neigh[tc]
        nbc = nb.clamp(min=0).reshape(B, N * 6)

        d_home = torch.full((B, N), BIG, dtype=dt, device=dev)
        d_nb = torch.full((B, N * 6), BIG, dtype=dt, device=dev)
        for c in range(centers.shape[1]):
            ok = (calive[:, c] & (centers[:, c] >= 0)).unsqueeze(1)
            ctr = centers[:, c].clamp(min=0).unsqueeze(1)
            d_home = torch.where(ok, torch.minimum(d_home, self.pair_dist[tc, ctr].to(dt)), d_home)
            d_nb = torch.where(ok, torch.minimum(d_nb, self.pair_dist[nbc, ctr].to(dt)), d_nb)
        d_nb = torch.where(nb.reshape(B, N * 6) >= 0, d_nb, torch.full_like(d_nb, BIG)).reshape(B, N, 6)

        civ = (self._type_combat[utype.clamp(min=0, max=self.NU - 1)] <= 0)
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
                self.ring2[tc].to(dt),
            ],
            dim=2,
        )
        return torch.where(present.unsqueeze(2), out, torch.zeros_like(out))

    def seat_unit_obs(self, row: int) -> torch.Tensor:
        B, dev = self.B, self.device
        smap = self._seat_slot_map(row)
        sc = smap.clamp(min=0)
        present = smap >= 0
        tiles = self.unit_tile.gather(1, sc)
        at_war = self.war[:, row].any(dim=1)
        war_tgt = torch.full((B, smap.shape[1]), -1, dtype=torch.long, device=dev)
        if bool(at_war.any()):
            tgt_b, hi_b, hc_b = self._war_march_targets(tiles.clamp(min=0), row)
            war_tgt = torch.where((hi_b | hc_b) & present & at_war.unsqueeze(1), tgt_b, war_tgt)
        return self._unit_obs(
            tiles, present,
            self.city_center[:, row], self.city_alive[:, row],
            self.unit_mp.gather(1, sc), self.unit_charges.gather(1, sc),
            self.unit_type.gather(1, sc),
            at_war=at_war, war_tgt=war_tgt,
        )

    def apply_seat_unit_sequence(self, row: int, seq: torch.Tensor) -> None:
        if seq.dim() != 3:
            raise AssertionError(f"unit sequence must be [B, simbase.UNIT_SLOTS, K], got {tuple(seq.shape)}")
        for k in range(int(seq.shape[2])):
            a_k = seq[:, :, k].to(torch.long)
            if k > 0:
                a_k = torch.where(a_k < 6, a_k, torch.full_like(a_k, -1))
            if not bool((a_k >= 0).any()):
                return
            self._apply_seat_unit_actions(row, a_k)
