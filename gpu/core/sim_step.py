"""step(): the global turn schedule, and the WIRE seat 0's decisions arrive on.

Seat 0's TURN is not here — it is `_seat_phase`'s row-0 call, the same body
every seat takes. What is seat-0-shaped in this file is the action interface
(the step() arguments) and the unit-order replay position, which rides the
triples schema rather than the per-unit rows a civ uses (#108).

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
        # (EVERY major's turn, row 0 first) -> theological combat -> religion
        # spread -> the boundary tail. Seat 0's turn is _seat_phase's row-0
        # call, like every seat's.
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

        # THEOLOGICAL COMBAT, then the religious pressure spread — the fight
        # first, so the turn's spread reads the swing the fallen unit caused.
        # Both run after all foundings/settles/flips and the rc compaction,
        # mirroring endTurn's tail. The fight is ZERO-DRAW, so its position
        # cannot move the stream.
        self._theological_combat_phase()
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
