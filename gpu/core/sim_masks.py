"""Legality masks, boosts, the RNG, damage, spawning, unit observations.

One mixin of BatchSim (assembled in engine.py); state and helpers live on
self / gpu/core/simbase.py.
"""
from __future__ import annotations

from .simbase import *  # noqa: F401,F403 — torch, constants, helpers
from .simbase import _MUTABLE  # noqa: F401 — private names do not ride a star import
from . import simbase  # the PATCHABLE globals (the pool caps/_ALIAS_CHECK) must be read live


class SimMasks:
    def production_mask(self) -> torch.Tensor:
        """[B, RC, PURCHASE_BASE + NB+1+NU] valid production actions for seat
        0's idle cities, in the ONE production layout every seat row uses
        (cpu/core/prodLayout.ts): [0, NB) buildings, SETTLER, IDLE, the roster
        units, the scaffold districts, then the gold-purchase block (building /
        settler / unit), which is NOT idle-gated because it buys rather than
        queues.

        Every column asks a row-generic legality body — `_seat_buildable`,
        `_trainable_units`, `_district_elig` — the SAME ones the civ mask and
        the shared apply ask, so no seat sees a different legality and mask and
        apply cannot drift. The wonder and project columns exist for the civ
        rows only; seat 0's head is still the narrower one (task #83).
        """
        B, C, dev = self.B, self.RC, self.device
        pend = self.alive & (self.current == -1)
        # SETTLER: any city over the pop gate, as queueSettler allows. IDLE is
        # always legal.
        settler_col = (self.city_pop[:, 0] >= self.rules.settler_pop_gate).unsqueeze(2)
        idle_col = torch.ones(B, C, 1, dtype=torch.bool, device=dev)
        bld_q = self._seat_buildable(0)
        tr_city = self._trainable_units(0)
        cols = [bld_q, settler_col, idle_col, tr_city]
        nS = len(self._scaffold)
        if nS:
            dcols = torch.zeros(B, C, nS, dtype=torch.bool, device=dev)
            if self.districts_on and self._scaffold:
                for c in range(C):
                    reg_c = self.city_dist_tile[:, 0, c]  # [B, nD] THIS city's registry
                    spec_cnt = ((reg_c >= 0) & self._is_specialty.reshape(1, -1)).sum(dim=1)
                    cap_c = torch.div(self.city_pop[:, 0, c] - 1, 3, rounding_mode="floor") + 1  # maxSpecialtyDistricts(pop)
                    for si, (di, utech, uciv, plc) in enumerate(self._scaffold):
                        has_tech = (self.techs[:, utech] if utech >= 0
                                    else (self.civics[:, uciv] if uciv >= 0
                                          else torch.ones(B, dtype=torch.bool, device=dev)))  # kind-aware
                        under_cap = (spec_cnt < cap_c) if bool(self._is_specialty[di]) else torch.ones(B, dtype=torch.bool, device=dev)
                        # The PLACEMENT SCAN runs HERE, not lazily at apply
                        # time: without it the mask is optimistic, calling a
                        # district legal on the gate tests alone while the apply
                        # also demands a tile that can take it.
                        can_place = self._district_elig(0, c, di, plc)[0].any(dim=1)
                        dcols[:, c, si] = has_tech & (reg_c[:, di] < 0) & under_cap & can_place
            cols.append(dcols)
        # Purchases. Gold is OPTIMISTIC here and RE-validated at apply in slot
        # order (earlier slots drain the shared treasury and a bought settler
        # raises the next slot's price); a unit also needs a free spawn tile
        # there — TS refunds when spawnUnit finds none.
        mult = self.rules.gold_purchase_mult
        tre = self.treasury
        # purchaseBuilding wants buildingCompletable (the district FINISHED) and
        # gold; the seat's own WORSHIP building is the one faith column, priced
        # flat and gated by buyWorshipBuilding's city rules.
        pb = self._seat_buildable(0, True) & self._afford(tre.reshape(B, 1, 1), self.rules_dev.b_cost.reshape(1, 1, -1) * mult)
        wb0 = self._worship_bidx_of(0)
        if wb0 >= 0:
            pb[:, :, wb0] = (
                self.religion_done.unsqueeze(1) & self._worship_city_ok(0)
                & self._afford(self.faith, self._worship_cost).unsqueeze(1)
            )
        n_cities = self.alive.sum(dim=1, keepdim=True)
        queued_s = (self.current == self.SETTLER).sum(dim=1, keepdim=True)
        s_cost = self.rules.settler_base + self.rules.settler_per_city * (
            n_cities - 1 + self._seat_settlers(0).unsqueeze(1) + queued_s
        ).clamp(min=0).to(self.dtype)
        ps = (self._afford(tre.unsqueeze(1), s_cost * mult).unsqueeze(2)
              & (self.city_pop[:, 0] >= self.rules.settler_pop_gate).unsqueeze(2))
        u_cost = self._type_cost.unsqueeze(0).expand(B, -1)
        if self._builder_idx >= 0:
            # the builder column prices off the live escalator, like TS
            # unitPurchaseCost at mask time.
            u_cost = u_cost.clone()
            u_cost[:, self._builder_idx] = self._builder_cost(self.builders_trained)  # ALREADY PRODUCED only — a queued item has produced nothing
        pu = tr_city & self._afford(tre.unsqueeze(1), u_cost * mult).unsqueeze(1)
        cols.append(torch.cat([pb, ps, pu], dim=2))
        # the base columns are idle-gated; the purchase block is not.
        base_w = self.PURCHASE_BASE
        out = torch.cat(cols, dim=2)
        out[:, :, :base_w] &= pend.unsqueeze(2)
        out[:, :, base_w:] &= self.alive.unsqueeze(2)
        return out

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

    def _detect_seat_boosts(self, row: int, active: torch.Tensor) -> None:
        """detectBoosts for seat row `row` (0 = seat 0, r+1 = civ r) — ONE
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
                # checkSatisfied counts buildings in LIVE cities only (it
                # iterates citiesOf). A razed/lost city leaves a dead slot
                # whose stale buildings must NOT count — a leftover Market
                # would inflate the GUILDS "build 2 Markets" inspiration.
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
                # state.claimedGreatPeople is GLOBAL — the same pool answers
                # for every seat.
                pred = (self.gp_earned.sum(dim=1) if brow["cls"] < 0 else self.gp_earned[:, brow["cls"]]) >= brow["count"]
            elif kind == "tech":
                pred = self.civ_techs[:, row, brow["t"]]
            elif kind == "anyWonderBuilt":
                pred = self.built_wonder_complete.any(dim=1)  # global scan, every seat
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
                dt = self.city_dist_tile[:, row]  # [B, RC, nD] registry tiles
                comp = self.district_complete.gather(1, dt.clamp(min=0).reshape(self.B, -1)).reshape_as(dt)
                on = (dt >= 0) & comp & alive.unsqueeze(2)
                if dtype < 0:
                    # boosts.ts: with no check.type, only districts that COUNT
                    # TOWARD THE LIMIT qualify (specialty) — aqueducts and the
                    # other support districts are excluded.
                    if brow.get("distinct"):
                        # CIVIL_ENGINEERING: distinct specialty TYPES across cities.
                        pred = (on.any(dim=1) & self._is_specialty.reshape(1, -1)).sum(dim=1) >= brow["count"]
                    else:
                        pred = (on & self._is_specialty.reshape(1, 1, -1)).sum(dim=(1, 2)) >= brow["count"]
                else:
                    pred = on[:, :, dtype].sum(dim=1) >= brow["count"]
            elif kind == "policies":
                # "run N policy cards" (MEDIEVAL_FAIRES, count 4).
                # checkSatisfied counts this SEAT's non-null government.policies
                # entries. A seat with no policy machinery reads 0 and the row
                # goes live by itself the day that seat gets cards.
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
                # PEN BRUSH AND VOICE pays era score per INSPIRATION.
                done = self.civ_civics[:, row, idx]
                newly = hit & ~done & ~self.civ_civic_boosted[:, row, idx]
                self.civ_civic_boosted[:, row, idx] |= hit & ~done
                self._dedication_event(row, 2, newly)

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
        # never embark, so the merged emb plane answers for every unit with one
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
        cand7 = torch.cat([at_tile.unsqueeze(1), self.neigh[at_tile.clamp(min=0)]], dim=1)  # [B, 7]
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

    def _seat_tech(self, seat: torch.Tensor, tech: int) -> torch.Tensor:
        """[B] bool — does the seat named per game in `seat` hold tech `tech`?

        `seat` is an ABSOLUTE seat; anything outside 0..R (a barbarian, a
        city-state, NO_SEAT) holds no tech, and a `tech` the rules table does
        not define is False everywhere. The research planes are the merged
        `civ_techs[:, row]` block, so seat 0 needs no arm of its own."""
        if tech < 0:
            return torch.zeros(self.B, dtype=torch.bool, device=self.device)
        rows = seat.clamp(min=0, max=self.R)
        bidx = torch.arange(self.B, device=self.device)
        return (seat >= 0) & (seat <= self.R) & self.civ_techs[bidx, rows, tech]

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
        """Barbarians are military; appends to the slot list, which is what
        keeps GPU unit order identical to state.units array order."""
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
        self.military_at[(rows, spot[rows])] = slot + self.POOL_LO["barb"]
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
        order) in the ONE major pool, owned by `unit_seat`; the
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
        pre = "major"
        is_civ_u = self._type_civilian[type_idx.clamp(min=0)]
        # clamp max too: unmasked rows may hold district queue codes.
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
        # a reclaimed slot may have held ANOTHER seat's unit
        self.major_unit_seat[rows, slot] = row
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
        off = self.POOL_LO[pre]  # merged-pool index of this pool's slot 0
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

    def _clear_camp_at(self, mask: torch.Tensor, tile: torch.Tensor, seat: torch.Tensor | None = None) -> None:
        """A non-barbarian unit entering a camp tile clears it: +50 gold to
        ITS seat (`seat` is a [B] ABSOLUTE seat; None means seat 0) and the
        camp list splices left (order matters for later garrison loops)."""
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
            self.civ_treasury[b, 0 if seat is None else int(seat[b])] += float(reward)


    def _type_civic_slot_ok(self, row: int, per_city: bool) -> torch.Tensor:
        """The Archaeologist's two extra trainableUnits gates for seat row
        `row` — the CIVIC unlock (Natural History) and the ARTIFACT-SLOT rule
        (its city must hold an ARCHAEOLOGICAL MUSEUM with a free slot).
        Returns [B, NU] when per_city is False, else [B, RC, NU]."""
        B, dev = self.B, self.device
        civ_ok = (self._type_civic.unsqueeze(0) < 0) | self.civ_civics[:, row].gather(
            1, self._type_civic.clamp(min=0).unsqueeze(0).expand(B, -1)
        )  # [B, NU]
        if not per_city:
            return civ_ok
        C = self.RC
        need = self._type_needs_slot.reshape(1, 1, -1)  # [1, 1, NU]
        if self._artifact_bidx < 0:
            room = torch.zeros(B, C, 1, dtype=torch.bool, device=dev)
        else:
            room = (
                self.city_bldg[:, row, :, self._artifact_bidx] & (self.city_artifacts[:, row] < self._artifact_slots)
            ).unsqueeze(2)  # [B, RC, 1]
        return civ_ok.unsqueeze(1) & (~need | room)

    def _seat_slot_map(self, row: int) -> torch.Tensor:
        """[B, simbase.UNIT_SLOTS] — the MERGED-POOL slot behind each of seat
        row `row`'s unit head rows, in slot (= spawn) order, padded with -1.

        The pool is shared by every major seat, so a seat's units are the slots
        `unit_seat == row` and its ARRAY ORDER is their slot order — the twin of
        `state.units.filter(u => u.seat === row)`, whose relative order the
        stable compaction preserves. Every seat reads the same head layout, so
        one policy and one applier serve all of them."""
        B = self.B
        mine = self.major_unit_alive & (self.major_unit_seat == row)
        rank = mine.long().cumsum(dim=1) - 1  # rank among this seat's living slots
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
        cs_row0 = 1 + max(self.R, 1)
        out = self.war[:, row, cs_row0:cs_row0 + S][:, :self.S] if self.S > 0 else torch.zeros(self.B, 0, dtype=torch.bool, device=self.device)
        out = out.clone()
        for sx in range(1 + self.R):
            if sx == row:
                continue
            out = out | (self._suzerain_mask(sx)[:, :self.S] & self.war[:, row, sx].unsqueeze(1))
        return out

    def _seat_unit_mask(self, row: int) -> torch.Tensor:
        """[B, simbase.UNIT_SLOTS, A] valid orders per unit of seat row `row`,
        A = len(_act_names) — ONE body for every seat.

        0-5 step to that neighbour (seat-aware stacking, the Encampment wall,
        cliffs, the naval/embark terrain planes), 6-11 attack there (a hostile
        unit, an at-war centre, a city-state centre, a live enemy Encampment),
        12 hold, 13/14/15 build FARM/MINE/LUMBER under this seat's own
        unlocks, then chop, repair, the resource improvements, pillage, the
        SNIPE ring, SPREAD and FOUND_CITY.

        The mask is OPTIMISTIC: orders are RE-validated at execution (both
        engines identically), because an earlier unit's move can invalidate a
        later unit's order. What it must NOT do is offer a column no applier
        arm executes — a legal column that silently no-ops teaches a policy
        that the verb is worthless."""
        B, dev = self.B, self.device
        N = simbase.UNIT_SLOTS
        smap = self._seat_slot_map(row)
        present = smap >= 0
        sc = smap.clamp(min=0)
        alive = present.unsqueeze(2)
        tile = self.unit_tile.gather(1, sc)                      # [B, N]
        tc = tile.clamp(min=0)
        utype = self.unit_type.gather(1, sc)
        ut = utype.clamp(min=0, max=self.NU - 1)
        u_emb = self.unit_emb.gather(1, sc)
        u_charges = self.unit_charges.gather(1, sc)
        techs = self.civ_techs[:, row]                            # [B, nTech]
        civics = self.civ_civics[:, row]
        own_tile = self.tile_seat == row                          # [B, T]
        nb = self.neigh[tc.reshape(-1)].reshape(B, N, 6)
        nbc = nb.clamp(min=0).reshape(B, -1)                      # [B, N*6]
        on_map = nb >= 0

        # ---- who stands on each neighbour, by SEAT ---------------------------
        _ms = self.military_at.gather(1, nbc)
        _cs = self.civilian_at.gather(1, nbc)
        neg = torch.full_like(_ms, -1)
        m_seat = torch.where(_ms >= 0, self.unit_seat.gather(1, _ms.clamp(min=0)), neg)
        c_seat = torch.where(_cs >= 0, self.unit_seat.gather(1, _cs.clamp(min=0)), neg)

        # ---- MOVE 0-5 --------------------------------------------------------
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
            # AT WAR WITH ANYONE: a grounded land unit stays land-only at
            # peace. Military embark needs SHIPBUILDING; CARTOGRAPHY only opens
            # OCEAN, so both techs are terms. Row 0 runs the same gate every
            # civ row does (#68 step 4) — the seat-0 order path used to have no
            # embark arm at all.
            any_war = self.war[:, row].any(dim=1).view(B, 1, 1)
            embark = water & ship & ~is_nav & any_war
            terr = torch.where(is_nav, water, passable | embark)
        else:
            terr = passable
        # the step-scan gate is `_blocked_for`, the same body the appliers and
        # the march call: STACKING plus the ENCAMPMENT WALL (a live enemy
        # Encampment bars entry; it is a DISTRICT, so an occupancy probe reads
        # its tile as empty). One legality rule, every surface.
        _blk = torch.where(
            is_civ,
            self._blocked_for(nbc, row, is_civilian=True).reshape(B, N, 6),
            self._blocked_for(nbc, row).reshape(B, N, 6),
        )
        has_mp = (self.unit_mp.gather(1, sc) > 0).unsqueeze(2)
        move = on_map & terr & ~_blk & alive & has_mp
        # CLIFF EDGES, applied at step level exactly as the march applies
        # _cliff_block_dirs. Per-row loop bounded by the LIVE head — rows empty
        # across the whole batch break out.
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
        # a MAJOR centre is a target when its holder is hostile; the minors go
        # through _citystate_target, which carries the suzerain clause.
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
        attack = (
            on_map & (hostile_u | city_t | cs_t | enc_t)
            & can_fight & ~u_emb.unsqueeze(2) & alive & has_mp
        )

        hold = alive

        # ---- BUILDER VERBS ---------------------------------------------------
        # `here_ok` is validImprovements' shared half: a builder with charges on
        # an OWN, empty, non-centre tile.
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
        # CHOP: canRemoveFeature has NO ownership test — the grant checks the
        # owner itself — so this is builder + charges + a removable feature
        # whose tech is in and which is not already stripped.
        ftr_t = self.tile_ftr.gather(1, tc)
        ftu_t = self.tile_ftu.gather(1, tc)
        chop = (
            present
            & ((utype == self._builder_idx) if self._builder_idx >= 0 else torch.zeros_like(present))
            & (u_charges > 0)
            & (ftr_t > 0)
            & (ftu_t >= 0) & techs.gather(1, ftu_t.clamp(min=0))
            & ~self.feat_stripped.gather(1, tc)
        ).unsqueeze(2)
        # REPAIR (`builderRepair`): a builder on an OWN tile whose improvement
        # or district is pillaged. No charge is spent — the turn is.
        repair = (
            present
            & ((utype == self._builder_idx) if self._builder_idx >= 0 else torch.zeros_like(present))
            & own_tile.gather(1, tc)
            & (self.pillaged.gather(1, tc) | self.district_pillaged.gather(1, tc))
        ).unsqueeze(2)
        # the RESOURCE improvements + SEASIDE_RESORT, on this seat's own techs.
        _res_cols: list[torch.Tensor] = []
        if self.improvements_on and self._builder_idx >= 0:
            _rq = self.res_imp.gather(1, tc)  # required improvement idx, -1 = none
            for _k in range(3, self._imp_unlock.numel()):
                _ut = int(self._imp_unlock[_k])
                _unl = (techs[:, _ut].unsqueeze(1) if _ut >= 0
                        else torch.ones(B, 1, dtype=torch.bool, device=dev))
                if self.SEASIDE >= 0 and _k == self.SEASIDE:
                    _ok = here_ok & self._seaside_ok().gather(1, tc) & _unl
                else:
                    _ok = here_ok & (_rq == _k) & _unl
                _res_cols.append(_ok.unsqueeze(2))
        # PILLAGE: a MILITARY unit standing on an ENEMY tile with a live
        # improvement, or a complete non-centre unpillaged district. `seatPillage`'s
        # own enemy test — an AT-WAR major's land, or ANY city-state's (a minor's
        # territory needs no declaration to wreck).
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

        # ---- SNIPE (the distance-2 ring) -------------------------------------
        # Legal iff this unit is ranged with range >= 2, not embarked, and the
        # k-th ring tile holds a target `_hostile_ranged_strike` would resolve:
        # a hostile unit inside the strike's own scope-out, or a hostile CENTRE.
        _sn: list[torch.Tensor] = []
        if getattr(self, "_snipe_on", False):
            rngd = (self._type_ranged_strength[ut] > 0) & (self._type_ranged_range[ut] >= 2)
            ring = self.ring2[tc]                     # [B, N, 12]
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
                & (ring >= 0) & (_ring_u | _ring_c)
            ]

        # ---- SPREAD (religious pressure onto self/neighbour) ------------------
        _sp: list[torch.Tensor] = []
        if getattr(self, "_A_SPREAD", -1) >= 0:
            _relig = torch.zeros_like(present)
            if self._missionary_idx >= 0:
                _relig = _relig | (utype == self._missionary_idx)
            if getattr(self, "_apostle_idx", -1) >= 0:
                _relig = _relig | (utype == self._apostle_idx)
            _sp_ok = present & _relig & (u_charges > 0) & self.civ_religion_done[:, row].unsqueeze(1)
            _sp = [_sp_ok.unsqueeze(2).expand(-1, -1, 7)]

        # ---- FOUND_CITY ------------------------------------------------------
        _fd: list[torch.Tensor] = []
        if getattr(self, "_A_FOUND", -1) >= 0:
            _fd = [(present & (utype == self._settler_idx)).unsqueeze(2)
                   if self._settler_idx >= 0
                   else torch.zeros(B, N, 1, dtype=torch.bool, device=dev)]

        out = torch.cat(
            [move, attack, hold, build_f, build_m, build_l, chop, repair]
            + _res_cols + [pillage] + _sn + _sp + _fd,
            dim=2,
        )
        # the mask's width IS the enum's length, or a dispatch is reading the
        # wrong column. `_res_cols` is empty when improvements are off, which
        # legitimately shortens the row — only assert when they are on.
        if self._act_names and self.improvements_on and self._builder_idx >= 0:
            assert out.shape[-1] == len(self._act_names), (
                f"_seat_unit_mask is {out.shape[-1]} wide but the enum has {len(self._act_names)} entries"
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

        One body for every seat: seat 0 passes `site`/`major_unit_tile`, a civ passes
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

    def seat_unit_obs(self, row: int) -> torch.Tensor:
        """[B, simbase.UNIT_SLOTS, 36] seat row `row`'s per-unit observation —
        ONE layout, so one policy reads any seat.

        The WAR columns: at_war = hostile to ANY other major seat. The march
        target is PER UNIT (`_war_march_target` takes the unit's own tile —
        nearest enemy improvement within 13 OF IT), so the shared method runs
        once per occupied row; a seat fields a handful of units, and rows empty
        across the whole batch are skipped."""
        B, dev = self.B, self.device
        smap = self._seat_slot_map(row)
        sc = smap.clamp(min=0)
        present = smap >= 0
        tiles = self.unit_tile.gather(1, sc)
        at_war = self.war[:, row].any(dim=1)
        # `_war_march_target` still asks the two questions separately: which
        # seats this row fights (`ac`, its own row) and whether seat 0 is among
        # them.
        ac = torch.full((B,), row, dtype=torch.long, device=dev)
        hp_r = self.war[:, row, 0]
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
            self.city_center[:, row], self.city_alive[:, row],
            self.unit_mp.gather(1, sc), self.unit_charges.gather(1, sc),
            self.unit_type.gather(1, sc),
            at_war=at_war, war_tgt=war_tgt,
        )

    def apply_seat_unit_sequence(self, row: int, seq: torch.Tensor) -> None:
        """Apply a unit's order as a SHORT DIRECTION SEQUENCE [B, simbase.UNIT_SLOTS, K].

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
            raise AssertionError(f"unit sequence must be [B, simbase.UNIT_SLOTS, K], got {tuple(seq.shape)}")
        for k in range(int(seq.shape[2])):
            a_k = seq[:, :, k].to(torch.long)
            if k > 0:
                # a non-move verb consumed the turn at an earlier rank
                a_k = torch.where(a_k < 6, a_k, torch.full_like(a_k, -1))
            if not bool((a_k >= 0).any()):
                return
            self._apply_seat_unit_actions(row, a_k)
