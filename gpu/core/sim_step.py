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
        gate.

        The per-city block below is the civ arm's, column for column: one
        loop-top stats snapshot, then growth, the queue, borders and the city's
        own defense through the four shared bodies. What is left in this file is
        the row-0 LOYALTY shape (batched pressures, flips after the loop) and
        the peace counter."""
        B, C, dev = self.B, self.RC, self.device
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

        # --- the per-city block, the seatPhase loop's own shape --------------
        # THE loop-top stats snapshot — one body, every seat row. Every column
        # below reads THIS map: yields, amenity tier, effective food surplus and
        # growth need all freeze here, and nothing inside the loop refreshes
        # them. Row 0 used to re-run _city_totals mid-walk behind an
        # (_eff_version, _claim_version) key so a completion could feed a later
        # city the same turn; that modelled a game.ts endTurn city loop which no
        # longer exists.
        total, eff, need, tier_idx = self._seat_city_stats(0)
        # The city-loop snapshot is taken AFTER the buy block (the
        # [...actor.cities] discipline): a bought-settler newborn acts this turn,
        # a queue-completion newborn (founded inside the loop, later) does not.
        alive_c = self.alive.clone()
        # Loyalty reads the FROZEN tier and the loop-top pops; the flips still
        # resolve after the loop.
        pop_loyal = self.pop.clone()
        gold_add = torch.zeros(B, dtype=torch.float64, device=dev)
        sci_add = torch.zeros(B, dtype=torch.float64, device=dev)
        cul_add = torch.zeros(B, dtype=torch.float64, device=dev)
        fth_add = torch.zeros(B, dtype=torch.float64, device=dev)
        # TS iterates state.cities in ARRAY order (splice on death, push on
        # found/capture) — which IS ascending slot order under append+reclaim
        # (#110), holes and all: a hole is a city already spliced out. Walking
        # columns in index order and skipping the dead ones visits exactly the
        # array, in its order, which is what the accumulators' float association
        # and the border walk's shared-candidate contention depend on.
        cact_all = active0.unsqueeze(1) & alive_c  # [B, C]
        cact_any_l = cact_all.any(dim=0).tolist()
        for j in range(C):
            if not cact_any_l[j]:
                continue
            cact = cact_all[:, j]
            jc = torch.full((B,), j, dtype=torch.long, device=dev)
            gold_add = torch.where(cact, gold_add + total[:, j, 2], gold_add)
            fth_add = torch.where(cact, fth_add + total[:, j, 5], fth_add)
            sci_add = torch.where(cact, sci_add + total[:, j, 3], sci_add)
            cul_c = torch.where(cact, total[:, j, 4], torch.zeros_like(total[:, j, 4]))
            cul_add = torch.where(cact, cul_add + cul_c, cul_add)
            # seatGrowth, then the queue, then borders, then the city's own
            # defense — four shared bodies, one call each, every seat row.
            self._seat_city_growth(0, jc, cact, eff[:, j], need[:, j])
            self._seat_city_produce(0, jc, cact, total[:, j, 1])
            self._seat_border_growth(0, jc, cact, cul_c)
            self._seat_city_fire_and_heal(0, jc, cact)

        # --- loyalty & defections (right after the city loop) ----------------
        self._apply_loyalty_and_flips(tier_idx, pop_loyal)

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
