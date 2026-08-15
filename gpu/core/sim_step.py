"""step(): the global turn schedule.

NO SEAT IS SHAPED INTO THIS FILE. Every seat's decisions arrive the same way —
`apply_seat_actions(row, ...)` for the draw-free verbs and
`_apply_seat_unit_actions(row, ...)` for the orders — and `step()` takes no
seat arguments at all: it advances the world. Row 0's turn is `_seat_phase`'s
row-0 call, the same body every seat takes.

There is no distinction left near here either. Every major row's unit orders
ride ONE schema — per-unit rank rows over `_seat_slot_map` — and drain at ONE
position, the walkers' own, inside `_seat_phase`. Row 0's triples record and
its pre-turn execution went in #108.

One mixin of BatchSim (assembled in engine.py); state and helpers live on
self / gpu/core/simbase.py.
"""
from __future__ import annotations

from .simbase import *  # noqa: F401,F403 — torch, constants, helpers: the shared floor
from .simbase import _MUTABLE  # noqa: F401 — private names do not ride a star import
from . import simbase  # the PATCHABLE globals (the pool caps/_ALIAS_CHECK) must be read live


class SimStep:
    def step(self) -> None:
        """Advance every game one turn.

        NO ACTIONS ARRIVE HERE. A seat's draw-free choices are written by
        `apply_seat_actions(row, ...)` and its unit orders by
        `_apply_seat_unit_actions(row, ...)` — both before this call, both
        identical for every row, and no row has an interface of its own.
        Whatever was stashed drains at its own position in the phase.
        """
        dev = self.device

        # --- refreshUnits: heal only units that spent NO MP since their last
        # refresh — +20 in a friendly city (barbs: on their camp), +15 own
        # territory, +10 neutral ground, +5 foreign-owned land. The heal
        # precedes the MP reset, so pre-turn orders applied AHEAD of this call
        # and hostile-phase acts from the PREVIOUS step both gate. -------------
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
        self._seat_phase()

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
        # City-slot compaction, every major row (the TS splice mirror): a row
        # compacts whenever it holds a HOLE, so the layout stays the dense
        # array TS keeps by splicing `seat.cities` on every death. High-water
        # = last-alive slot + 1, which is where the next append lands. ONE
        # trigger, ONE body, every row — the seat whose deaths compact
        # EAGERLY and the seat that waits for a threshold were the same rule
        # written twice, and only the eager one is TS's.
        _alive_m = self.city_alive[:, :self.n_majors]
        _hw = (_alive_m.long() * (torch.arange(self.RC, device=dev).reshape(1, 1, -1) + 1)).amax(dim=2)
        if bool((_hw > _alive_m.sum(dim=2)).any()):
            self._reclaim_cities()
        if self.n_majors > 1 and self._civ_city_reg_check:
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
            for _c in range(self.n_majors):
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
            _fw = self.n_majors
            self.civ_faith[:, :_fw].copy_(self.civ_faith[:, :_fw] + _fa[:, :_fw].to(self.civ_faith.dtype))
        dom = self._domination()
        # A SCIENCE victory set during this turn's project completions takes
        # precedence over the domination/score recompute and is preserved,
        # winner and all.
        space_won = self.victory_type == 3
        rel = self._religious_victor()  # on the follow set the spread just flipped
        # CULTURE victory, evaluated only where religion did not already win.
        cul = torch.where(rel >= 0, torch.full_like(rel, -1), self._culture_victor())
        # DIPLOMATIC victory, evaluated only where neither religion nor culture
        # already won.
        dip = torch.where((rel >= 0) | (cul >= 0), torch.full_like(rel, -1), self._diplomatic_victor())
        self.game_over = space_won | (dom >= 0) | (rel >= 0) | (cul >= 0) | (dip >= 0) | (self.turn > self.rules.turn_limit)
        # precedence space > domination > religion > culture > DIPLOMATIC >
        # score. The KIND and the WINNER are two facts and travel separately:
        # each condition above already computed the winning seat, and the pair
        # of codes they used to collapse into said only whether that seat was
        # seat 0.
        self.victory_type.copy_(torch.where(space_won, self.victory_type, torch.where(dom >= 0, torch.full_like(dom, 2), torch.where(rel >= 0, torch.full_like(rel, 4), torch.where(cul >= 0, torch.full_like(cul, 5), torch.where(dip >= 0, torch.full_like(dip, 6), torch.where(self.game_over, torch.ones_like(dom), torch.zeros_like(dom))))))))
        self.victory_row.copy_(torch.where(space_won, self.victory_row, torch.where(dom >= 0, dom, torch.where(rel >= 0, rel, torch.where(cul >= 0, cul, torch.where(dip >= 0, dip, torch.full_like(dom, -1)))))))
        # leader() is a full score pass over every seat and only matters where
        # a game just ENDED; winner stays -1 for running games either way.
        lead = self.leader() if bool(self.game_over.any()) else torch.full_like(dom, -1)
        self.winner = torch.where(dom >= 0, dom, torch.where(self.game_over, lead, torch.full_like(dom, -1)))

        if simbase._ALIAS_CHECK:
            self._check_state_discipline()
