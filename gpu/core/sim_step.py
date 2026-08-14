"""step(): the turn loop and seat-0's half of it.

One mixin of BatchSim (assembled in engine.py); state and helpers live on
self / gpu/core/simbase.py.
"""
from __future__ import annotations

from .simbase import *  # noqa: F401,F403 — torch, constants, helpers: the shared floor
from .simbase import _MUTABLE  # noqa: F401 — private names do not ride a star import
from . import simbase  # the PATCHABLE globals (the pool caps/_ALIAS_CHECK) must be read live


class SimStep:
    def step(
        self,
        production: torch.Tensor | None = None,
        tech: torch.Tensor | None = None,
        civic: torch.Tensor | None = None,
        units: torch.Tensor | None = None,
        envoy: torch.Tensor | None = None,
        war: torch.Tensor | None = None,
        buy: tuple | None = None,  # (kind [B], a [B], b [B]) — the GOLD purchase intent (kind 3: a=tile, b=slot)
        worship: torch.Tensor | None = None,  # kind 4: the city slot to faith-buy the worship building in (-1 = none)
        relig: tuple | None = None,  # kinds 5/6: (kind [B], slot [B]) — the religious-unit faith buy
        levy: torch.Tensor | None = None,  # kind 7: the CS index to levy (-1 = none)
    ) -> None:
        """Advance every game one turn, applying seat 0's orders.

        Every argument is optional and None means "seat 0 decides nothing" —
        no queue, no pick, no order. Invalid entries are masked to no-ops.

        production: [B, RC] long — per-city action in the ONE production
        layout every seat row uses (cpu/core/prodLayout.ts): [0, NB)
        buildings, SETTLER, IDLE, the roster units, the scaffold districts,
        the world wonders and the district projects. Spending is not here — it
        rides `buy`/`worship`/`relig`/`levy` below.
        tech/civic: [B] long picks applied where the research slot is empty
        (validated against the masks; -1 = no pick).
        units: [B, simbase.UNIT_SLOTS] long unit orders (0–5 move, 6–11 attack, 12
        hold), executed in slot order before the turn advances.
        envoy: [B] or [B, K] long — back that city-state with one available
        envoy (validated; -1 = none).
        war: [B] long (ignored while _rl_war_active is off) — 0..R-1 declare
        war on that civ seat, R..2R-1 sue for peace with it, -1 none. Applied
        at the GEO pass positions inside _seat_phase (declare at the phase
        top, peace at the tail) — seat 0 declares through the geo pass like
        every seat, AFTER this step's unit orders ran, so a same-turn
        declaration legalizes nothing until next turn (the TS schedule).
        buy/worship/relig/levy: the GOLD and FAITH spending intents, in the
        same shapes every seat's `apply_seat_actions` takes — stashed here and
        drained by _seat_buy_ladder at the gold block's own phase position.
        """
        dev = self.device
        self._stash_record(0, tech=tech, civic=civic, envoys=envoy, production=production)
        self._stash_buy(0, buy=buy, worship=worship, relig=relig, levy=levy)

        # --- seat-0 unit orders (before the turn advances) ----------------------
        if units is not None and self.units_mode:
            self._apply_seat_unit_actions(0, units)

        # --- refreshUnits: heal only units that spent NO MP since their last
        # refresh — +20 in a friendly city (barbs: on their camp), +15 own
        # territory, +10 neutral ground, +5 foreign-owned land. The heal
        # precedes the MP reset, so seat-0 orders from THIS step and
        # hostile-phase acts from the PREVIOUS step both gate. -------------------
        if self.units_mode:
            cap = self.rules.combat.get("unitHp", 100)
            # ONE heal rule, both windows. See _seat_heal.
            for _pre in ("barb", "major"):
                _hp = getattr(self, f"{_pre}_unit_hp")
                _hp.copy_(torch.where(
                    getattr(self, f"{_pre}_unit_alive") & ~self._spent_mp(_pre),
                    (_hp + self._seat_heal(_pre)).clamp(max=cap), _hp,
                ))
            # FORTIFY: co-located with the heal and keyed on the EXACT SAME
            # gate (movesLeft >= movesFull = spent no MP since the last
            # refresh). A live MILITARY unit that stayed put digs in (+1, cap
            # 2); a move or attack resets it. Civilians and NAVAL units never
            # fortify. ONE rule, both windows — either can hold a hull, so the
            # naval gate applies to both.
            for _pre in ("barb", "major"):
                _alive = getattr(self, f"{_pre}_unit_alive")
                _typ = getattr(self, f"{_pre}_unit_type")
                _spent = self._spent_mp(_pre)
                _fort = getattr(self, f"{_pre}_unit_fortify")
                _mil = (self._type_combat[_typ] > 0) & ~self.unit_naval[_typ]
                _fort.copy_(torch.where(
                    _alive & _mil & ~_spent, (_fort + 1).clamp(max=2),
                    torch.where(_alive & _mil & _spent, torch.zeros_like(_fort), _fort),
                ))
            # The movesLeft reset: a fresh turn begins, granting
            # `full + generalAuraMP`. The aura is FROZEN here, inside the
            # refreshUnits mirror, so every later walker reads the snapshot
            # rather than the live (by then possibly moved) generals.
            self._refresh_aura_mp()
            # The movesLeft/movesFull reset itself, for BOTH windows —
            # refreshUnits loops every unit regardless of seat. The major
            # window then re-resets at the seatPhase top with the aura
            # re-frozen there (the TS reset loop covers every isCiv unit, seat
            # 0 included), and the barb window at the barbarian phase.
            for _pre in ("major", "barb"):
                self._reset_mp(_pre)

        # --- the hostile world, then the city-states' own turn --------------------
        # endTurn's global schedule: refreshUnits (above) -> barbarianPhase ->
        # disasterPhase -> cityStatePhase (the CS seats' OWN turn) -> seatPhase
        # (EVERY major's turn, row 0 first) -> religion spread -> the boundary
        # tail. Seat 0's turn lives in _seat0_row, called by _seat_phase.
        if self.units_mode:
            self._barbarian_phase()
        if self.disasters:
            self._disaster_phase()
        self._city_state_phase()
        self._seat_phase(war=war)

        # --- Dead-slot reclamation, at the step END and never the top:
        # callers sample slot-keyed unit actions from the PRE-step masks, so
        # the layout must hold from _seat_unit_mask() through this step's
        # applies. Stable compaction is otherwise behavior-invariant (the TS
        # arrays splice; living relative order is the spec). Fires when a
        # pool's own append head nears its own cap, or constantly under
        # CIV6_RECLAIM_AT.
        if self.units_mode:
            for _pre in ("barb", "major"):
                if self._reclaim_due(_pre):
                    self._reclaim_pool(_pre)
        # City-slot compaction, every major row (the TS splice mirror). Row 0
        # compacts whenever it holds a hole (deaths are rare; a dense layout
        # keeps the append head in range); civ rows at their high-water
        # threshold. ONE body compacts all rows together.
        hw0 = (self.alive.long() * (torch.arange(self.RC, device=dev).reshape(1, -1) + 1)).amax(dim=1)
        need_rc = bool((hw0 > self.alive.sum(dim=1)).any())
        if self.R > 0 and not need_rc:
            # rc high-water = last-alive slot + 1 (what the next append uses)
            civ_city_hw = (self.civ_city_alive.long() * (torch.arange(self.RC, device=dev).reshape(1, 1, -1) + 1)).amax(dim=2)
            need_rc = int(civ_city_hw.max()) >= self._civ_city_reclaim_at
        if need_rc:
            self._reclaim_cities()
        if self.R > 0 and self._civ_city_reg_check:
            # After compaction (the riskiest registry reshuffle) and all of
            # this step's placements/captures — env-gated, so free when off.
            self._check_rc_registry_invariant()

        # Religious pressure spread — after all foundings/settles/flips and the
        # rc compaction, mirroring endTurn's tail.
        self._spread_religious_pressure()

        self._ww_audit()
        self.turn += 1
        # Era boundary — the eraBoundary mirror, run right after the turn
        # increment. Every seat's Age for the NEW era comes from the just-ended
        # window's score (Dark < darkT ≤ Normal < goldenT ≤ Golden), THEN the
        # window resets. Padded/dead seats get Dark from score 0 — harmless:
        # their factor only ever multiplies alive-masked zero contributions.
        if self._era_len > 0 and self.turn % self._era_len == 0:
            # Roads reach the CLASSICAL tier (bridges) at the first era
            # boundary, latched at the same site TS latches it.
            self.road_bridged = True
            sc = self.era_score
            # The PREVIOUS age, the Heroic test's substrate. CLONED because
            # civ_age is written IN PLACE below — a bare reference would read
            # back the NEW age and the Dark->Golden test could never fire.
            _was = self.civ_age.clone()
            self.civ_age.copy_(torch.where(
                sc < self._era_dark,
                torch.zeros_like(self.civ_age),
                torch.where(sc >= self._era_gold, torch.full_like(self.civ_age, 2), torch.ones_like(self.civ_age)),
            ))
            # DEDICATIONS. One per seat per era, except the HEROIC age —
            # Dark -> Golden — which grants heroicDedications. The current age
            # alone cannot tell a Heroic age from an ordinary Golden one, which
            # is why prev_age is substrate. prev_age is preallocated in
            # __init__; write it rather than rebind it, so it stays the same
            # tensor for aliasing and _MUTABLE.
            self.prev_age.copy_(_was)
            self.dedications.copy_(torch.where(
                (_was == 0) & (self.civ_age == 2),
                torch.full_like(self.dedications, self._heroic_ded),
                torch.ones_like(self.dedications),
            ))
            # Commit to NAMED dedications — the stateless round-robin twin:
            # catalog index (era + civ + k) % N, taking `dedications[c]`
            # entries (three on a Heroic age).
            _era_i = int(self.turn // self._era_len)
            self.ded_picks[:] = -1
            for _c in range(1 + self.R):
                for _k in range(self.ded_picks.shape[2]):
                    _take = self.dedications[:, _c] > _k
                    self.ded_picks[:, _c, _k] = torch.where(
                        _take,
                        torch.full_like(self.ded_picks[:, _c, _k], (_era_i + _c + _k) % self._n_ded),
                        torch.full_like(self.ded_picks[:, _c, _k], -1),
                    )
            self.era_score[:] = 0
        # The WORLD CONGRESS convenes on the same post-increment turn number
        # the era boundary uses.
        self._world_congress()
        # DEDICATION payouts, every turn, immediately after eraBoundary. A
        # GOLDEN/HEROIC age pays faith; a DARK or NORMAL age pays era score
        # (the climb-out dedication). Both scale with the dedication COUNT, so
        # a Heroic age pays triple. Zero-draw, integer-only.
        if self._ded_payouts_live and (self._ded_faith > 0 or self._ded_era > 0):
            _gold = self.civ_age == 2
            _fa = torch.where(_gold, self.dedications * self._ded_faith, torch.zeros_like(self.dedications))
            _es = torch.where(_gold, torch.zeros_like(self.dedications), self.dedications * self._ded_era)
            self.era_score.add_(_es)
            self.faith.copy_(self.faith + _fa[:, 0].to(self.faith.dtype))
            if self.R > 0:
                self.civ_only_faith.copy_(self.civ_only_faith + _fa[:, 1 : 1 + self.R].to(self.civ_only_faith.dtype))
        dom = self._domination()
        # A science victory (3, seat 0) / defeat (4, a civ seat) set during
        # THIS turn's project completions takes precedence over the
        # domination/score recompute and is preserved.
        space_won = (self.victory_type == 3) | (self.victory_type == 4)
        rel = self._religious_victor()  # on the follow set the spread just flipped
        # CULTURE victory, evaluated only where religion did not already win.
        cul = torch.where(rel >= 0, torch.full_like(rel, -1), self._culture_victor())
        # DIPLOMATIC victory, evaluated only where neither religion nor culture
        # already won.
        dip = torch.where((rel >= 0) | (cul >= 0), torch.full_like(rel, -1), self._diplomatic_victor())
        self.game_over = space_won | (dom >= 0) | (rel >= 0) | (cul >= 0) | (dip >= 0) | (self.turn > self.rules.turn_limit)
        # precedence space > domination > religion (5/6) > culture (7/8) > DIPLOMATIC (9/10) > score
        rel_vt = torch.where(rel == 0, torch.full_like(rel, 5), torch.full_like(rel, 6))
        cul_vt = torch.where(cul == 0, torch.full_like(cul, 7), torch.full_like(cul, 8))
        dip_vt = torch.where(dip == 0, torch.full_like(dip, 9), torch.full_like(dip, 10))
        self.victory_type.copy_(torch.where(space_won, self.victory_type, torch.where(dom >= 0, torch.full_like(dom, 2), torch.where(rel >= 0, rel_vt, torch.where(cul >= 0, cul_vt, torch.where(dip >= 0, dip_vt, torch.where(self.game_over, torch.ones_like(dom), torch.zeros_like(dom))))))))
        # leader() is a full score pass over every seat and only matters where
        # a game just ENDED; winner stays -1 for running games either way.
        lead = self.leader() if bool(self.game_over.any()) else torch.full_like(dom, -1)
        self.winner = torch.where(dom >= 0, dom, torch.where(self.game_over, lead, torch.full_like(dom, -1)))

        if simbase._ALIAS_CHECK:
            self._check_state_discipline()

    def _seat0_row(self) -> None:
        """Seat 0's turn — ROW 0 of the seatPhase loop, in the civ arm's
        proven internal order: ww decay -> boosts -> CS diplomacy + quests ->
        the record (tech/civic/envoys/production) -> the buy ladder ->
        trade -> the city econ walk -> loyalty flips -> the research/upkeep/
        accumulator tail -> great people -> the war counters. Its decisions
        arrive through the SAME stash every seat uses, so this body takes no
        wire arguments of its own. The war verb
        does NOT apply here: seat 0 declares and sues at the GEO pass
        positions in _seat_phase, like every seat (the rec.war self-guard's
        twin). An actor with no cities takes no turn (the TS loop's
        eliminated-actor continue) — active0 gates every seat-level arm;
        the city walks are alive-masked already, so their zero sums need no
        gate."""
        r, B, C, dev = self.rules, self.B, self.RC, self.device
        active0 = self.alive.any(dim=1)  # actor.cities.length > 0

        # --- war weariness: the block-top decay (warWearinessTurn), the same
        # call every civ row makes on its own row. The pairwise war state is
        # fixed for the turn by the phase-top declare pass.
        self._ww_decay(0, active0)

        # --- eurekas: detectBoosts at the row's own block top ------------------
        self._detect_seat_boosts(0, active0)

        # --- CS diplomacy (meet/influence) + quests — the loop-body position,
        # through the SAME shared bodies every civ row calls (row 0) ----------
        self._seat_influence_phase(0, active0)
        self._seat_quest_phase(0, active0)

        # --- THE RECORD: tech, civic, envoys, production, at
        # applySeatActionRecord's own position — one body, every seat row.
        # step() stashed row 0's intents exactly as apply_seat_actions stashes
        # a civ's, so this call is byte-for-byte the civ arm's.
        self._seat_record_apply(0, active0)

        # THE gold/faith block — one body, every seat row, at the seatPhase
        # position between the picks and the trade block.
        self._seat_buy_ladder(0, active0)

        # Trade — the route pick + expiry arm at the seatPhase position
        # (between the buy block and the city loop), row 0's body.
        self._seat_trade_phase(0, active0)

        # --- worked tiles + city yields: the PER-CITY interleave ------------------
        # endTurn recomputes computeCityStats FRESH for every city inside its
        # loop, so an EARLIER city's mid-turn mutation — a district/building
        # completion shifting a later city's adjacency gold, a growth
        # reshuffling the luxury ranking, a border claim — feeds every LATER
        # city's APPLIED yields the same turn. Mirror with an invalidation-gated
        # recompute: totals refresh only when _eff_version moved or a pop
        # changed since the last compute (completions/claims bump the version;
        # growth rides the pop dirty flag).
        total, housing, growth_f, tier_idx = self._city_totals()
        lux0 = self._last_lux  # frozen for the whole walk (luxMap semantics)
        # The recompute guard: an _eff_version move (completion, purchase,
        # civic) OR a border CLAIM (_claim_version — a claimed tile widens a
        # later city's workable window) OR a pop change.
        _tot_ver = (self._eff_version, self._claim_version)
        # Pop changes ride a dirty FLAG set at the walk's only pop writes
        # (settler completion, growth, starvation). A clamp-at-1 write that
        # leaves pop unchanged forces a spurious recompute of identical values
        # (bit-exact, rare).
        _pop_dirty = False
        # Seat 0's belief hoist (ids are static inside the walk — claims live
        # in the phase, not here): Fertility Rites rides the growth chain. The
        # border-claim beliefs (Religious Settlements' cost multiplier, the
        # tile-add plane in the pick key) live in _seat_border_growth with the
        # rest of the claim.
        _bel0 = self._seat_has_beliefs(0)
        gmul0 = self._bel_mul("growth", 0).to(self.dtype) if _bel0 else None
        # Hanging Gardens (empireGrowthMult) — seat 0's completed-wonder growth
        # product, the civ loop's gw_cache twin. Wonders reach row 0 only by
        # CAPTURE (#83), which resolves in the order phase, so hoisting it out
        # of the city walk reads the same state every column would.
        _hg = self._wonder_growth_mult(self._completed_wonders(0))
        hg0 = None if _hg is None else _hg.to(self.dtype)
        # Loyalty mirrors the loop-top view: city c's tier and pop are captured
        # FRESH at its own iteration (post earlier cities' same-turn mutations,
        # pre its own production/growth) — applyLoyalty runs at the top of the
        # per-city block; the flips still resolve after the loop.
        tier_fresh = tier_idx.clone()
        pop_loyal = self.pop.clone()
        gold_add = torch.zeros(B, dtype=self.dtype, device=dev)
        sci_add = torch.zeros(B, dtype=self.dtype, device=dev)
        cul_add = torch.zeros(B, dtype=self.dtype, device=dev)
        fth_add = torch.zeros(B, dtype=self.dtype, device=dev)
        # The TS side iterates state.cities in ARRAY order (splice on death,
        # push on found/capture) — which IS slot order under append+reclaim
        # (#110). Every cross-city coupling in this walk — a completion's
        # _eff_version bump feeding a later city's totals, a border claim
        # consuming a shared candidate tile, spawn-spot contention, the
        # accumulators' float association — depends on that order, so walk
        # living columns first, in column order (per-batch gathers).
        # Dead/unfounded columns sort last and stay masked no-ops. Cities
        # cannot be founded or die inside the walk, so the order is fixed here.
        walk_ord = torch.argsort((~self.alive).long(), dim=1, stable=True)
        bidx = self._bidx
        for s_rank in range(C):
            col = walk_ord[:, s_rank]  # [B] — each game's s_rank-th living city (TS array order)
            if (self._eff_version, self._claim_version) != _tot_ver or _pop_dirty:
                total, housing, growth_f, tier_idx = self._city_totals(lux=lux0)
                _tot_ver = (self._eff_version, self._claim_version)
                _pop_dirty = False
            tier_fresh[bidx, col] = tier_idx[bidx, col]
            pop_loyal[bidx, col] = self.pop[bidx, col]
            t_c = total[bidx, col]  # [B, 6] this city's FRESH yields
            popf_c = self.pop[bidx, col].to(self.dtype)
            pop_c0 = self.pop[bidx, col].clone()  # loop-top pop — stats.growthNeeded freezes here

            # --- growth: BEFORE the queue, the seatPhase order ------------------
            # game.ts runs seatGrowth and only THEN the queue block. The order
            # is observable: a settler completion costs a pop with a floor of 1,
            # so growing then shrinking is not the same city as shrinking then
            # growing when the city sits at pop 1.
            surplus = t_c[:, 0] - popf_c * r.food_per_citizen
            head = housing[bidx, col] - popf_c
            hf = torch.where(head >= 2, 1.0, torch.where(head >= 1, 0.5, 0.25).to(self.dtype)).to(self.dtype)
            _gf_c = surplus * hf * growth_f[bidx, col]
            if hg0 is not None:
                _gf_c = _gf_c * hg0  # Hanging Gardens (empireGrowthMult)
            if gmul0 is not None:
                # left-to-right like computeCityStats:
                # ((s×hf)×tier)×empireGrowthMult×growthMult
                _gf_c = _gf_c * gmul0
            effective = torch.where(surplus > 0, _gf_c, surplus)
            self.food_box[bidx, col] = self.food_box[bidx, col] + effective
            need = self._growth_needed(pop_c0)  # stats.growthNeeded: loop-top pop
            alive_c = self.alive[bidx, col]
            grow = alive_c & (self.food_box[bidx, col] >= need)
            self.pop[bidx, col] = self.pop[bidx, col] + grow.long()
            fb = self.food_box[bidx, col]
            self.food_box[bidx, col] = torch.where(grow, fb - need, fb)
            starve = alive_c & ~grow & (self.food_box[bidx, col] < 0)
            self.pop[bidx, col] = torch.where(starve, (self.pop[bidx, col] - 1).clamp(min=1), self.pop[bidx, col])
            fb2 = self.food_box[bidx, col]
            self.food_box[bidx, col] = torch.where(starve, torch.zeros_like(fb2), fb2)
            # --- production (this city's column) -----------------------------------
            cur_c = self.current[bidx, col]
            has_item = cur_c >= 0
            # Banked chop production pays into the head the moment a build
            # exists (game.ts consumes productionBank inside the production
            # add). VETERANCY: production toward an ENCAMPMENT item (the
            # district or its buildings) is multiplied FIRST, then the bank
            # adds unmultiplied — that order matters.
            prod_add = t_c[:, 1]
            if self._gov_has_effects and self._encamp_didx >= 0:
                emult_p = self._gov_mods(0)[5]
                en_item = (cur_c >= 0) & (cur_c < self.NB) & (self._b_req_district[cur_c.clamp(min=0, max=self.NB - 1)] == self._encamp_didx)
                if self._encamp_si >= 0:
                    en_item = en_item | (cur_c == self.DISTRICT_BASE + self._encamp_si)
                prod_add = torch.where(en_item, t_c[:, 1] * emult_p, t_c[:, 1])
            self.progress[bidx, col] = torch.where(has_item, self.progress[bidx, col] + prod_add + self.prod_bank[bidx, col], self.progress[bidx, col])
            self.prod_bank[bidx, col] = torch.where(has_item, torch.zeros_like(self.prod_bank[bidx, col]), self.prod_bank[bidx, col])
            done = has_item & (self.progress[bidx, col] >= self.cur_cost[bidx, col])
            made_settler = done & (cur_c == self.SETTLER)
            if self._settler_idx >= 0 and bool(made_settler.any()):
                # Completion SPAWNS the settler at the city — a unit like any
                # other; WHERE it founds is a later FOUND_CITY order.
                self._spawn_unit(0, made_settler, self.site[bidx, col], self._settler_idx)
            # A completed Settler costs the city 1 pop; the dirty flag
            # refreshes later cities' totals.
            self.pop[bidx, col] = torch.where(made_settler, (self.pop[bidx, col] - 1).clamp(min=1), self.pop[bidx, col])
            made_building = done & (cur_c < self.NB)
            if bool(made_building.any()):
                bi = made_building.nonzero(as_tuple=True)[0]
                self.buildings[bi, col[bi], cur_c[bi]] = True
                # completing ANCIENT_WALLS fills the outer pool.
                if self._walls_bidx >= 0:
                    wm = bi[cur_c[bi] == self._walls_bidx]
                    if len(wm) > 0:
                        self.outer_hp[wm, col[wm]] = self._walls_hp
                self._eff_version += 1  # its yields join LATER cities' totals this turn
            made_unit = done & (cur_c >= self.UNIT_BASE) & (cur_c < self.UNIT_BASE + self.NU)
            if bool(made_unit.any()):
                # clamp max too: unmasked rows may hold district codes.
                # A trained military unit inherits city `col`'s Encampment training XP (best tier).
                xp_col = (self.buildings[bidx, col, :].long() * self._b_train_xp.reshape(1, -1)).max(dim=1).values
                self._spawn_unit(0, made_unit, self.site[bidx, col], (cur_c - self.UNIT_BASE).clamp(min=0, max=self.NU - 1), init_xp=xp_col)
                if self._builder_idx >= 0:
                    # a completed builder moves the cost escalator
                    made_b = made_unit & (cur_c == self.UNIT_BASE + self._builder_idx)
                    self.builders_trained.add_(made_b.long())
            # A finished district completes its paved tile (the tile was
            # reserved at queue time in q_dtile).
            made_district = done & (cur_c >= self.DISTRICT_BASE) & (cur_c < self.WONDER_BASE)
            if bool(made_district.any()):
                db_ = made_district.nonzero(as_tuple=True)[0]
                _dt = self.q_dtile[db_, col[db_]].clamp(min=0)
                self.district_complete[db_, _dt] = True
                # MONUMENTALITY pays era score per SPECIALTY district completed
                # (a city centre is never queued here).
                _mon = torch.zeros(self.B, dtype=torch.bool, device=self.device)
                _mon[db_] = True
                self._dedication_event(0, 0, _mon)
                # a completed ENCAMPMENT musters its garrison.
                _enc = self.district[db_, _dt] == self._encamp_didx
                self.encamp_hp[db_, _dt] = torch.where(
                    _enc, torch.full_like(_dt, self._encamp_hp_max), self.encamp_hp[db_, _dt]
                )
                self.q_dtile[db_, col[db_]] = -1
                self._eff_version += 1
            self.current[bidx, col] = torch.where(done, torch.full_like(cur_c, -1), cur_c)
            # Completion OVERFLOW is BANKED. game.ts carries it into a queued
            # item where one exists and banks otherwise; a single-slot build
            # head always has an empty queue after a completion, so the bank is
            # the only branch reachable here.
            _ovf = (self.progress[bidx, col] - self.cur_cost[bidx, col]).clamp(min=0)
            self.prod_bank[bidx, col] = torch.where(done, self.prod_bank[bidx, col] + _ovf, self.prod_bank[bidx, col])
            self.progress[bidx, col] = torch.where(done, torch.zeros_like(self.progress[bidx, col]), self.progress[bidx, col])
            # all three pop-write masks of this rank in one host check
            if bool((made_settler | grow | starve).any()):
                _pop_dirty = True

            # --- borders (later cities see earlier claims) -------------------
            # pickBorderTile reads the LIVE map: refresh the yield ranking if
            # THIS city's own completion/growth just changed it (the box add
            # itself stays the loop-top stats value).
            if (self._eff_version, self._claim_version) != _tot_ver or _pop_dirty:
                total, housing, growth_f, tier_idx = self._city_totals(lux=lux0)
                _tot_ver = (self._eff_version, self._claim_version)
                _pop_dirty = False
            # Cultural border growth — THE shared body, row 0's call.
            self._seat_border_growth(0, col, self.alive[bidx, col], t_c[:, 4])

            # THE CITY'S OWN DEFENSE: walls strike, Encampment strike, then the
            # unbesieged heal — ONE body, every seat row, at this per-city
            # position. Row 0's copy used to run a phase earlier inside
            # _barbarian_phase; it is gone from both engines.
            self._seat_city_fire_and_heal(0, col, self.alive[bidx, col])

            # --- empire accumulators (FRESH values; the seq-order walk makes
            # each game's float association match game.ts exactly) ------------
            gold_add = gold_add + t_c[:, 2]
            sci_add = sci_add + t_c[:, 3]
            cul_add = cul_add + t_c[:, 4]
            fth_add = fth_add + t_c[:, 5]  # faith rides the same walk

        # --- loyalty & defections (right after the city loop) ------------------------------
        self._apply_loyalty_and_flips(tier_fresh, pop_loyal)
        # Every POST-WALK consumer (empire_score, the state digest) must see
        # FRESH stats: computeCityStats re-ranks luxuryAmenities LIVE, so a
        # mid-walk pop change can move a luxury grant and flip amenity tiers
        # away from the walk's FROZEN map. The walk's accumulators keep the
        # frozen-map yields; only the cached totals must not leak past the walk.
        self._eff_version += 1

        # --- the seat block's TAIL: banking, upkeep, research, tourism,
        # favor, grievances, the great-people and belief races. ONE body,
        # every seat row, on row 0's own city sums. ------------------------
        self._seat_research_tail(0, active0, sci_add, cul_add, gold_add, fth_add)

        # War counters — the loop's war/peace arm, row 0. warTurns counts
        # war-with-WAR_COLUMN_SEAT only and a seat is never at war with
        # itself, so seat 0's warTurns never moves; peaceTurns ticks while at
        # war with NO civ seat (atWarWithAny reads Seat.wars — the majors'
        # list — so a city-state war does not hold it back).
        self.peace_turns[:, 0] += (active0 & ~self.civ_only_atwar.any(dim=1)).long()
