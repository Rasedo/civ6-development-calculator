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
        self.city_outer_hp[:, row] = torch.where(
            hit.unsqueeze(1) & self.city_alive[:, row], torch.full_like(oh, full), oh)

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

    def _repair_available(self, row: int, j: int) -> torch.Tensor:
        """`repairAvailable` — CIV6: the repair "becomes available after
        building Walls. A city can undertake this project if it and/or its
        Encampment district have damaged Walls and have not been attacked in
        the last three turns." One perimeter serves the centre and its
        Encampment here, so one pool answers both."""
        mx = self._walls_max_all(row)[:, j]
        return ((mx > 0) & (self.city_outer_hp[:, row, j] < mx)
                & ((self.turn - self.city_last_hit[:, row, j]) >= self._repair_quiet))

    def _repair_cost(self, row: int, j: int) -> torch.Tensor:
        """The perimeter HP missing right now — CIV6: "Walls gain HP equal to
        the Production invested into the project", so the whole repair costs
        exactly what it puts back."""
        mx = self._walls_max_all(row)[:, j]
        return (mx - self.city_outer_hp[:, row, j]).clamp(min=1).to(self.dtype)

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
        head = self.city_current[:, row] == self.PROJECT_BASE + self._repair_proj_idx
        if not bool(head.any()):
            return
        gain = (js_round(self.city_progress[:, row].double())
                - js_round(before.double())).long()
        oh = self.city_outer_hp[:, row]
        self.city_outer_hp[:, row] = torch.where(
            head, torch.minimum(oh + gain, self._walls_max_all(row)), oh)

    def _siege_may_shoot(self, pre: str) -> torch.Tensor:
        """[B, U] `siegeMayShoot` — CIV6 (Movement): a unit whose attack "uses
        Bombard Strength" may move and shoot in the same turn only if "its
        maximum Movement is at least 1 greater than normal when it attempts to
        shoot"; and "if a unit has not moved, it can always shoot regardless of
        its maximum Movement". `_spent_mp` is refreshUnits' own gate — the pool
        this unit was GRANTED last refresh, not its type's base moves."""
        typ = getattr(self, f"{pre}_unit_type").clamp(min=0, max=self.NU - 1)
        return ((self._type_bombard[typ] <= 0) | ~self._spent_mp(pre)
                | (self._full_mp(pre) > self._type_moves[typ]))

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
        if not self._siege_support_any:
            return out
        t = type_idx.clamp(min=0, max=self.NU - 1)
        helped = self._type_melee[t] | self._type_anticav[t]
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

    def _city_ranged_strength(self, type_idx: torch.Tensor, outer: torch.Tensor) -> torch.Tensor:
        """`cityRangedStrength` — what a RANGED order brings against a city or
        district. A siege unit fires at its Bombard Strength and pays no city
        penalty; the -17 it carries is "against land units", which its ranged
        strength already holds. Everything else pays the ranged city penalty,
        which naval ranged owe only while a perimeter stands."""
        t = type_idx.clamp(min=0, max=self.NU - 1)
        naval = self.unit_naval[t]
        pen = torch.full(outer.shape, self._ranged_city_pen,
                         dtype=torch.float64, device=outer.device)
        pen = torch.where(naval & (outer <= 0), torch.zeros_like(pen), pen)
        base = self._type_ranged_strength[t].double() - pen
        return torch.where(self._type_bombard[t] > 0, self._type_bombard[t].double(), base)

    def _wound(self, hp: torch.Tensor) -> torch.Tensor:
        """CIV6: "Damage of wounded units is diminished... The formula is
        `round(10 - HP/10)`". The `woundPenalty` twin, RELIGIOUS Strength
        included. hp is a unit-HP tensor; cities / city-states / walls are NOT
        units and never pass through here."""
        return js_round(10.0 - hp.double().clamp(min=0.0) / 10.0)

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
        arange6 = torch.arange(6, device=self.device)
        nb = self.neigh[frm.clamp(min=0)]
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

        def_seat [B] long: the defender's seat (0..n_majors-1 for the majors, BARB_SEAT
        barbarians). attacker_tile [B]: the tile of the melee attacker to
        EXCLUDE from flanking (u != attacker); pass all -1 for a ranged/city
        attacker (support-only sites — the returned flank is then unused).

        Stacking blocks foreign units, so each tile holds at most ONE military
        unit — each of the 6 neighbours contributes 0 or 1. Returns
        (flank [B] long, support [B] long)."""
        nb = self.neigh[def_tile.clamp(min=0)]
        nbc = nb.clamp(min=0)
        on = nb >= 0
        # TWO gathers: the defender's SEAT and each neighbour's, in the one
        # absolute space, so the unitsHostile question is asked once.
        #
        # An EMBARKED military unit flanks and supports for NOBODY. Barbarians
        # never embark, so the merged emb plane answers for every unit with one
        # read.
        mslot = self.military_at.gather(1, nbc)  # [B, 6]
        present = (mslot >= 0) & on & ~self.unit_emb.gather(1, mslot.clamp(min=0))
        d_seat = def_seat.reshape(self.B, 1)
        n_seat = torch.where(
            present, self.unit_seat.gather(1, mslot.clamp(min=0)), torch.full_like(nbc, -1)
        )

        hostile = self._seats_hostile(d_seat, n_seat)
        is_atk = (nb == attacker_tile.unsqueeze(1)) & (attacker_tile.unsqueeze(1) >= 0)
        hostile = hostile & ~is_atk
        friendly = present & (n_seat == d_seat)
        return hostile.long().sum(dim=1), friendly.long().sum(dim=1)

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
        civsAtWar(prober, owner) plus "barbarians are hostile to everyone", and
        `_seats_hostile` is that one question, including the "never hostile to
        yourself" arm.
        `seat` may be an int or a [B, 1] tensor (the war-march probes per
        slot)."""
        live = self._encamp_live()
        if not torch.is_tensor(seat) and seat == BARB_SEAT:
            return live
        owner_seat = torch.where(
            (self.tile_seat >= 0) & (self.tile_seat < self.n_majors),
            self.tile_seat, torch.full_like(self.tile_seat, -1),
        )
        return live & self._seats_hostile(seat, owner_seat)

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
        ow = self.tile_seat.gather(1, t)
        owner_seat = torch.where((ow >= 0) & (ow < self.n_majors), ow, torch.full_like(ow, -1))
        return live & self._seats_hostile(seat, owner_seat)

    def _blocked_for(
        self,
        tiles: torch.Tensor,
        seat,
        is_civilian=False,
    ) -> torch.Tensor:
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
        mil_slot = self.military_at.gather(1, tc)
        civ_slot = self.civilian_at.gather(1, tc)

        if True:
            neg = torch.full_like(tc, -1)
            mil_seat = torch.where(
                mil_slot >= 0, self.unit_seat.gather(1, mil_slot.clamp(min=0)), neg
            )
            civ_seat = torch.where(
                civ_slot >= 0, self.unit_seat.gather(1, civ_slot.clamp(min=0)), neg
            )
            civ_b = (
                is_civilian.unsqueeze(1)
                if torch.is_tensor(is_civilian)
                else torch.full((1, 1), bool(is_civilian), dtype=torch.bool, device=tc.device)
            )
            mil_blocks = (mil_seat >= 0) & ((mil_seat != seat) | ~civ_b)
            civ_blocks = (civ_seat >= 0) & ((civ_seat != seat) | civ_b)
            occupied = mil_blocks | civ_blocks
        return occupied

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
        blocked = self._blocked_for(cand7, seat, is_civilian=False if civ_mask is None else civ_mask)
        terr = self.passable.gather(1, okc)
        if naval_mask is not None and bool(naval_mask.any()):
            ocean_ok = ~self.ocean_tile.gather(1, okc)
            if cart is not None:
                ocean_ok = ocean_ok | cart.unsqueeze(1)
            water_terr = self.wpass.gather(1, okc) & ocean_ok
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
        land_ok = self.passable.gather(1, dc).squeeze(1)
        water_ok = self.wpass.gather(1, dc).squeeze(1) & (
            ~self.ocean_tile.gather(1, dc).squeeze(1)
            | self._seat_tech(u_seat, self._cartography_tech)
        )
        return torch.where(self.unit_naval[u_type.clamp(min=0, max=self.NU - 1)], water_ok, land_ok)

    def _spawn_barb(self, mask: torch.Tensor, at_tile: torch.Tensor, unit_type: int, naval: bool = False) -> None:
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
        self.barb_unit_type[rows, slot] = int(self._barb_ladder[unit_type])
        self.barb_unit_tile[rows, slot] = spot[rows]
        self.barb_unit_hp[rows, slot] = self.rules.combat.get("unitHp", 100)
        self.barb_unit_fortify[rows, slot] = 0  # a fresh (possibly reclaimed) slot starts undug
        # TS spawnUnit writes `movesLeft: def.moves` plus the seat's golden
        # dedication and leaves movesFull undefined — a unit trained mid-turn
        # CAN move before its first refresh, and a reclaimed slot must not
        # inherit the dead unit's remainder.
        self.barb_unit_emb[rows, slot] = False
        _m = self._full_mp("barb")[rows, slot]
        self.barb_unit_mp[rows, slot] = _m
        self.barb_unit_mp_full[rows, slot] = _m
        self.military_at[(rows, spot[rows])] = slot + self.POOL_LO["barb"]
        self.next_slot[rows] += 1

    def _reveal_around(self, rows: torch.Tensor, seat_row, tiles: torch.Tensor, radius: int) -> None:
        """revealAround's twin: lift `seat_row`'s fog within `radius` of
        `tiles`. rows [K] batch indices (UNIQUE per call — advanced-index
        assignment is last-write-wins), seat_row an int or [K] long, tiles
        [K] long. No-op with fog off — TS's
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
        disk = self.pair_dist[tiles.clamp(min=0)] <= radius
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

    def _spawn_unit(self, row: int, mask: torch.Tensor, at_tile: torch.Tensor, type_idx, init_xp: torch.Tensor | None = None, charges: torch.Tensor | None = None) -> torch.Tensor:
        if not bool(mask.any()):
            return torch.zeros_like(mask)
        if isinstance(type_idx, int):
            type_idx = torch.full((self.B,), type_idx, dtype=torch.long, device=self.device)
        elif type_idx.dim() == 0:
            type_idx = type_idx.expand(self.B)
        pre = "major"
        is_civ_u = self._type_civilian[type_idx.clamp(min=0)]
        ti_n = type_idx.clamp(min=0, max=self.NU - 1)
        naval_m = self.unit_naval[ti_n] & mask
        techs2 = self.civ_techs[:, row]
        cart = techs2[:, self._cartography_tech] if self._cartography_tech >= 0 else None
        found, spot = self._first_free_spot(at_tile, row, civ_mask=is_civ_u, naval_mask=naval_m, cart=cart)
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
        self._reveal_around(rows, row, spot[rows], 2)
        getattr(self, f"{pre}_unit_hp")[rows, slot] = self.rules.combat.get("unitHp", 100)
        getattr(self, f"{pre}_unit_fortify")[rows, slot] = 0
        if init_xp is None:
            getattr(self, f"{pre}_unit_xp")[rows, slot] = 0
        else:
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
        _ch = self._type_charges[type_idx[rows]] if charges is None else charges[rows]
        getattr(self, f"{pre}_unit_charges")[rows, slot] = _ch + self._wonder_charges(row, type_idx)[rows]
        off = self.POOL_LO[pre]
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


    def _dig_at(self, gd: torch.Tensor, td: torch.Tensor, row) -> None:
        """Mark a DIG for the games in `gd` on the tiles in `td` — the
        row-index form of `_mark_antiquity`, which takes a [B] mask.
        Every COMBAT death goes through here, exactly as every TS combat death
        goes through `combat.ts:killUnit`. Maintenance disbands and builder
        charge-exhaustion are NOT deaths and must not call it.

        `row` is the ACTING seat's row — `killUnit(state, unit, seat)` passes
        the seat whose ORDER this is, and the era gate reads that seat. An int
        or a tensor ALIGNED WITH `gd`, like `td`."""
        if len(gd) == 0:
            return
        m = torch.zeros(self.B, dtype=torch.bool, device=self.device)
        m[gd] = True
        t = torch.full((self.B,), -1, dtype=torch.long, device=self.device)
        t[gd] = td
        if not isinstance(row, int):
            r = torch.full((self.B,), -1, dtype=torch.long, device=self.device)
            r[gd] = row
            row = r
        self._mark_antiquity(m, t, row)
        self._mark_shipwreck(m, t, row)

    def _mark_antiquity(self, mask: torch.Tensor, tile: torch.Tensor, row) -> None:
        """The markAntiquitySite twin — stamp an ANTIQUITY SITE on
        `tile` for the rows in `mask`. Real Civ 6 creates these from PRE-MODERN
        events (a razed barbarian outpost, a unit dying), so the era gate is the
        sourced part; a tile already carrying a dig does not stack, and water,
        districts and wonder tiles are refused exactly as TS refuses them.

        The era is the ACTING seat's, never one fixed seat's:
        `markAntiquitySite` takes the seat and reads ITS research."""
        if not bool(mask.any()):
            return
        t = tile.clamp(min=0)
        era = self._row_era(row)
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
        # and three civilizations. The stored id is the SEAT, not the row —
        # `markAntiquitySite` records the seat it was handed, and a barbarian
        # (seat 200) is a distinct civilization for theming.
        self.antiquity_era[rows, t[rows]] = era[rows] if era.dim() else era
        _r = row if torch.is_tensor(row) else torch.full((self.B,), int(row), dtype=torch.long, device=self.device)
        self.antiquity_seat[rows, t[rows]] = self._seat_of_row(_r[rows])

    def _seat_of_row(self, row: torch.Tensor) -> torch.Tensor:
        """[n] — the SEAT ids behind these rows. Storage is row-indexed;
        anything a seat WRITES about another seat's identity is a seat id."""
        return torch.where(row >= 0, self._ROW_SEAT.to(row.device)[row.clamp(min=0)], torch.full_like(row, -1))

    def _mark_shipwreck(self, mask: torch.Tensor, tile: torch.Tensor, row) -> None:
        """The markShipwreck twin — the WATER dig. This model sources
        dig placement from DEATHS rather than map generation, so a hull going
        down leaves the wreck, under `markAntiquitySite`'s own era gate and
        one-per-tile rule. `row` is the ACTING seat, like `_mark_antiquity`'s,
        and its era and id are the wreck's provenance; the two bodies are
        disjoint because one refuses water and the other requires it. A
        barbarian or city-state actor leaves nothing to theme, which is what
        `row < 0` says here."""
        if not bool(mask.any()):
            return
        t = tile.clamp(min=0)
        era = self._row_era(row)
        _r = row if torch.is_tensor(row) else torch.full((self.B,), int(row), dtype=torch.long, device=self.device)
        okr = (
            mask
            & (tile >= 0)
            & (_r >= 0)
            & (era < self._modern_era_index)
            & self.water.gather(1, t.unsqueeze(1)).squeeze(1)
            & ~self.shipwreck.gather(1, t.unsqueeze(1)).squeeze(1)
        )
        if not bool(okr.any()):
            return
        rows = okr.nonzero(as_tuple=True)[0]
        self.shipwreck[rows, t[rows]] = True
        self.shipwreck_era[rows, t[rows]] = era[rows] if era.dim() else era
        self.shipwreck_seat[rows, t[rows]] = self._seat_of_row(_r[rows])




    def _museum_room(self, row: int) -> torch.Tensor:
        """[B] bool — does this seat hold an ARCHAEOLOGICAL MUSEUM with a
        free artifact slot anywhere? The excavation's landing place."""
        if self._artifact_bidx < 0:
            return torch.zeros(self.B, dtype=torch.bool, device=self.device)
        return (
            self.city_alive[:, row]
            & self.city_bldg[:, row, :, self._artifact_bidx]
            & (self.city_artifacts[:, row] < self._artifact_slots)
        ).any(dim=1)

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
        dig underfoot, the tile own-or-unclaimed (real Civ 6 also allows
        foreign ground under OPEN BORDERS, which neither engine models), and
        a free artifact slot to land the find in."""
        if getattr(self, "_archaeologist_idx", -1) < 0:
            return torch.zeros_like(tc, dtype=torch.bool)
        ts = self.tile_seat.gather(1, tc)
        own_ok = (ts < 0) | (ts == row)
        return (
            (utype == self._archaeologist_idx)
            & (charges > 0)
            & self._dig_here(row, tc)
            & own_ok
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
        ONE city of this seat, and nothing built on any of them."""
        B, N, D, _ = quad.shape
        q = quad.clamp(min=0).reshape(B, -1)
        good = (
            (self.tile_seat.gather(1, q) == row)
            & (self.park.gather(1, q) < 0)
            & (self.improvement.gather(1, q) < 0)
            & (self.district.gather(1, q) < 0)
            & (self.built_wonder.gather(1, q) < 0)
            & (self._tile_appeal().gather(1, q) >= self._park_min_appeal)
        ).reshape(B, N, D, 4)
        city = self.city_slot_at(row).gather(1, q).reshape(B, N, D, 4)
        one_city = (city == city[:, :, :, :1]).all(dim=3) & (city[:, :, :, 0] >= 0)
        return (quad >= 0).all(dim=3) & good.all(dim=3) & one_city

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

    def _cliff_block_dirs(self, cur: torch.Tensor, nb6: torch.Tensor, own: torch.Tensor | None = None) -> torch.Tensor:
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
        free = self.centre_slot_at.gather(1, land) >= 0
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
        free = self.centre_slot_at.gather(1, land.unsqueeze(1)).squeeze(1) >= 0
        # SOURCED: the Harbor exception is OWNER-ONLY — "when YOUR units use it
        # they will be able to pass the Cliffs... Enemy units won't." Callers
        # pass `own` = the tiles this mover's civ holds; without it a Harbor
        # would be a hole in the wall for the besieger too.
        if self._harbor_idx >= 0 and own is not None:
            harbor = self.district.gather(1, land.unsqueeze(1)).squeeze(1) == self._harbor_idx
            free = free | (harbor & own.gather(1, land.unsqueeze(1)).squeeze(1))
        return trans & bit & ~free

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
        self._mark_antiquity(hit, tile, row)
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
        if self._artifact_bidx < 0:
            room = torch.zeros(B, C, 1, dtype=torch.bool, device=dev)
        else:
            room = (
                self.city_bldg[:, row, :, self._artifact_bidx] & (self.city_artifacts[:, row] < self._artifact_slots)
            ).unsqueeze(2)
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

        _ms = self.military_at.gather(1, nbc)
        _cs = self.civilian_at.gather(1, nbc)
        neg = torch.full_like(_ms, -1)
        m_seat = torch.where(_ms >= 0, self.unit_seat.gather(1, _ms.clamp(min=0)), neg)
        c_seat = torch.where(_cs >= 0, self.unit_seat.gather(1, _cs.clamp(min=0)), neg)

        is_civ = (self._type_civilian[utype.clamp(min=0)]).unsqueeze(2)
        passable = self.passable.gather(1, nbc).reshape(B, N, 6)
        is_nav = self.unit_naval[ut].unsqueeze(2)
        cart = (techs[:, self._cartography_tech] if self._cartography_tech >= 0
                else torch.zeros(B, dtype=torch.bool, device=dev)).view(B, 1, 1)
        if self._embark_live:
            ship = (techs[:, self._shipbuilding_tech] if self._shipbuilding_tech >= 0
                    else torch.zeros(B, dtype=torch.bool, device=dev)).view(B, 1, 1)
            water = (
                self.wpass.gather(1, nbc).reshape(B, N, 6)
                & (~self.ocean_tile.gather(1, nbc).reshape(B, N, 6) | cart)
            )
            any_war = self.war[:, row].any(dim=1).view(B, 1, 1)
            embark = water & ship & ~is_nav & any_war
            terr = torch.where(is_nav, water, passable | embark)
        else:
            terr = passable
        _blk = torch.where(
            is_civ,
            self._blocked_for(nbc, row, is_civilian=True).reshape(B, N, 6),
            self._blocked_for(nbc, row).reshape(B, N, 6),
        )
        has_mp = (self.unit_mp.gather(1, sc) > 0).unsqueeze(2)
        move = on_map & terr & ~_blk & alive & has_mp
        if self._embark_live:
            for _n in range(N):
                if not bool(present[:, _n].any()):
                    break
                move[:, _n] = move[:, _n] & ~self._cliff_block_dirs(tc[:, _n], nb[:, _n], own_tile)

        # ---- ATTACK 6-11 -----------------------------------------------------
        # `unitsHostile` for the units, the centre plane for the cities: ONE
        # hostility rule, so no seat needs a target clause of its own.
        hostile_u = (
            self._seats_hostile(row, m_seat) | self._seats_hostile(row, c_seat)
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
        # a live enemy Encampment is a MELEE target in its own right — the only
        # way to open its tile. `rangedAttack` has no district arm.
        enc_t = self._encamp_block(nbc, row).reshape(B, N, 6) & melee
        # EMBARKED UNITS CANNOT ATTACK (meleeAttack/rangedAttack both refuse).
        may_shoot = self._siege_may_shoot("major").gather(1, sc).unsqueeze(2)
        attack = (
            on_map & (hostile_u | city_t | cs_t | enc_t)
            & can_fight & ~u_emb.unsqueeze(2) & alive & has_mp & may_shoot
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
        _res_cols: list[torch.Tensor] = []
        if self.improvements_on and self._builder_idx >= 0:
            _rq = self.res_imp.gather(1, tc)
            for _k in range(3, self._imp_unlock.numel()):
                _ut = int(self._imp_unlock[_k])
                _unl = (techs[:, _ut].unsqueeze(1) if _ut >= 0
                        else torch.ones(B, 1, dtype=torch.bool, device=dev))
                if self.SEASIDE >= 0 and _k == self.SEASIDE:
                    _ok = here_ok & self._seaside_ok().gather(1, tc) & _unl
                else:
                    _ok = here_ok & (_rq == _k) & _unl
                _res_cols.append(_ok.unsqueeze(2))
        _ts = self.tile_seat
        _enemy = (
            ((_ts >= 0) & (_ts < 100) & self.war[:, row].gather(1, _ts.clamp(min=0, max=self.NS - 1)))
            | ((_ts >= 100) & (_ts < BARB_SEAT))
        ).gather(1, tc)
        _has_imp = (self.improvement.gather(1, tc) >= 0) & ~self.pillaged.gather(1, tc)
        _has_dis = (
            (self.district.gather(1, tc) >= 0)
            & self.district_complete.gather(1, tc)
            & ~self.district_pillaged.gather(1, tc)
            & (self.centre_slot_at.gather(1, tc) < 0)
        )
        pillage = (present & (self._type_combat[utype] > 0) & _enemy & (_has_imp | _has_dis)).unsqueeze(2)

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
            _ring_u = ((_rms == BARB_SEAT) | (_rcs == BARB_SEAT)).reshape(B, N, 12)
            _ring_c = self._seats_hostile(row, self._centre_seat_plane().gather(1, ringc)).reshape(B, N, 12)
            _sn = [
                present.unsqueeze(2) & rngd.unsqueeze(2) & ~u_emb.unsqueeze(2)
                & may_shoot & (ring >= 0) & (_ring_u | _ring_c)
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

        out = torch.cat(
            [move, attack, hold, build_f, build_m, build_l, chop, repair]
            + _res_cols + [pillage] + _sn + _sp + _fd + _ex + _pk,
            dim=2,
        )
        if self._act_names and self.improvements_on and self._builder_idx >= 0:
            assert out.shape[-1] == len(self._act_names), (
                f"_seat_unit_mask is {out.shape[-1]} wide but the enum has {len(self._act_names)} entries"
            )
        return out

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
            for n in range(int(present.any(dim=0).sum())):
                if not bool(present[:, n].any()):
                    break
                tgt_n, hi, hc_n = self._war_march_target(tiles[:, n].clamp(min=0), row)
                has = (hi | hc_n) & present[:, n] & at_war
                war_tgt[:, n] = torch.where(has, tgt_n, war_tgt[:, n])
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
