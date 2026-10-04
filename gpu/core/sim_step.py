from __future__ import annotations

from .simbase import *  # noqa: F401,F403 — torch, constants, helpers: the shared floor
from . import simbase  # `_ALIAS_CHECK` is patched by tests/gpu/state_discipline_test.py, so it is read live


class SimStep:
    def step(self) -> None:
        dev = self.device
        # ONE GAME TURN, as Civ 6 runs it (`endTurn`; tools/civ6lab/
        # turn_order_civ6.md, runs/turnorder/): the players one at a time in
        # ascending player id — the majors, the city-states, the Free Cities,
        # the barbarians (16 of 16 turns); then the World Congress session and
        # the heal of every unit and every city, both before the counter
        # moves; then, on the new turn, the storms, the volcano roll and the
        # random event, the climate step, the era and Ages, and the victory
        # checks.
        self._seat_phase()
        self._city_state_phase()
        self._free_cities_phase()
        if self.units_mode:
            self._barbarian_phase()

        self._theological_combat_phase()
        self._world_congress()
        # every unit's heal, fortification and movement (`refreshUnits`), then
        # every city's (`healCities`)
        if self.units_mode:
            cap = self.rules.combat["unitHp"]
            for _pre in ("barb", "major"):
                _hp = getattr(self, f"{_pre}_unit_hp")
                _hp.copy_(torch.where(
                    getattr(self, f"{_pre}_unit_alive") & ~self._heal_blocked(_pre)
                    & ~self._res_starved(_pre),
                    (_hp + self._seat_heal(_pre)).clamp(max=cap), _hp,
                ))
            for _pre in ("barb", "major"):
                _alive = getattr(self, f"{_pre}_unit_alive")
                _typ = getattr(self, f"{_pre}_unit_type")
                _spent = self._spent_mp(_pre)
                _fort = getattr(self, f"{_pre}_unit_fortify")
                # CIV6: a plane is based inside a city centre, an Aerodrome or a
                # carrier and a Spy carries no Combat Strength — neither digs in.
                _mil = ((self._type_combat.take(_typ) > 0) & ~self.unit_naval.take(_typ)
                        & (self._type_air.take(_typ) == 0))
                _dug = torch.where(
                    _alive & _mil & ~_spent, (_fort + 1).clamp(max=2),
                    torch.where(_alive & _mil & _spent, torch.zeros_like(_fort), _fort),
                )
                # CIV6 (Alhambra, Mont St. Michel): a unit occupying the wonder
                # "automatically gains 2 turns of fortification" — a floor.
                _occ = self._occupy_def()
                if _occ is not None:
                    _on = _occ.gather(1, getattr(self, f"{_pre}_unit_tile").clamp(min=0)) > 0
                    _dug = torch.where(_alive & _mil & _on, torch.full_like(_dug, 2), _dug)
                # CIV6 (`Improvements.GrantFortification`): the Fort, the Great
                # Wall and the Pa say the same on their own rows — the floor is
                # the larger of the two.
                if self._imp_fortify_any:
                    _it = getattr(self, f"{_pre}_unit_tile").clamp(min=0)
                    _iv = self.improvement.gather(1, _it)
                    _gf = self._imp_fortify.take(_iv.clamp(min=0)) * (_iv >= 0).long()
                    _dug = torch.where(_alive & _mil, torch.maximum(_dug, _gf.clamp(max=2)), _dug)
                _fort.copy_(_dug)
            self._refresh_aura_mp()
            # The movesLeft/movesFull reset itself, for BOTH windows —
            # refreshUnits loops every unit regardless of seat. The major
            # window then re-resets at the seatPhase top with the aura
            # re-frozen there (the TS reset loop covers every isCiv unit, seat
            # 0 included), and the barb window at the barbarian phase.
            for _pre in ("major", "barb"):
                self._reset_mp(_pre)
            self._fallout_toll()
        self._heal_cities()

        self._ww_audit()
        self.turn += 1
        # a return's Anarchy ends as the turn reaches `civ_gov_anarchy_end`:
        # the government channels change with no record behind them
        if self._ngov and bool((self.civ_gov_anarchy_end == self.turn).count_nonzero()):
            self._eff_version += 1
        if self.disasters:
            self._disaster_phase()
        self._climate_turn()

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
        # trigger, ONE body, every row: every seat compacts EAGERLY, as TS
        # does.
        # ...the Free Cities row too, whose holes a joining city leaves
        _alive_m = torch.cat((self.city_alive[:, :self.n_majors],
                              self.city_alive[:, self.FREE_ROW:self.FREE_ROW + 1]), dim=1)
        _hw = (_alive_m.long() * (torch.arange(self.RC, device=dev).reshape(1, 1, -1) + 1)).amax(dim=2)
        if bool((_hw > _alive_m.sum(dim=2)).count_nonzero()):
            self._reclaim_cities()
        if self.n_majors > 1 and self._civ_city_reg_check:
            self._check_rc_registry_invariant()

        self._record_moments()
        self._game_era_turn()
        # THE EXOPLANET FLIGHT — CIV6: 1 light-year/turn plus one per laser
        # station standing behind it, and the win fires on ARRIVAL, not launch.
        # Ties in one turn go to the lowest row (argmax takes the FIRST True),
        # and the victory_type guard keeps an already-won space game's victor.
        fly = self.space_ly >= 0  # [B, n_majors]
        if bool(fly.count_nonzero()):
            # ...plus CIV6 (ISS_FIRST_PLACE_SPACESHIP_SPEED) the Space Station winner's +3
            lz = torch.stack([self._laser_speed(r) + self._gp_perm(r, "exoSpeed").long()
                              for r in range(self.n_majors)], dim=1)
            self.space_ly.copy_(torch.where(fly, self.space_ly + 1 + lz, self.space_ly))
            arrive = fly & (self.space_ly >= int(self.rules.space_ly_target))
            landed = arrive.any(dim=1) & (self.victory_type != 3)
            if bool(landed.count_nonzero()):
                first = torch.argmax(arrive.long(), dim=1)
                self.victory_type.copy_(torch.where(landed, torch.full_like(self.victory_type, 3), self.victory_type))
                self.victory_row.copy_(torch.where(landed, first, self.victory_row))
        dom = self._domination()
        space_won = self.victory_type == 3
        rel = self._religious_victor()  # on the follow set the spread just flipped
        # CULTURE victory, evaluated only where religion did not already win.
        cul = torch.where(rel >= 0, torch.full_like(rel, -1), self._culture_victor())
        dip = torch.where((rel >= 0) | (cul >= 0), torch.full_like(rel, -1), self._diplomatic_victor())
        self.game_over = space_won | (dom >= 0) | (rel >= 0) | (cul >= 0) | (dip >= 0) | (self.turn > self.rules.turn_limit)
        self.victory_type.copy_(torch.where(space_won, self.victory_type, torch.where(dom >= 0, torch.full_like(dom, 2), torch.where(rel >= 0, torch.full_like(rel, 4), torch.where(cul >= 0, torch.full_like(cul, 5), torch.where(dip >= 0, torch.full_like(dip, 6), torch.where(self.game_over, torch.ones_like(dom), torch.zeros_like(dom))))))))
        # THE SCORE VICTORY names the seat with the highest Civ 6 Score
        # (`leader()`, the `scoreLeader` twin) wherever the turn limit ended
        # the game with no other victor. `leader()` runs only on a turn where
        # some game of the batch stands ended on the score.
        by_score = self.victory_type == 1
        lead = self.leader() if bool(by_score.count_nonzero()) else torch.full_like(dom, -1)
        self.victory_row.copy_(torch.where(space_won, self.victory_row, torch.where(dom >= 0, dom, torch.where(rel >= 0, rel, torch.where(cul >= 0, cul, torch.where(dip >= 0, dip, torch.where(by_score, lead, torch.full_like(dom, -1))))))))

        # THE POPULATION SNAPSHOT, at the census's own moment and over the
        # census's own rows — `_city_rows` walks the majors and then the Free
        # Cities row, and so does this. It rode the amenity walk once, which
        # never reaches a Free City on either engine, and therefore agreed
        # about every city except the one that differed.
        if self._log_diff:
            _rows = list(range(self.n_majors)) + [self.FREE_ROW]
            for _b in range(self.B):
                _ev = self._diff_events.setdefault(_b, [])
                for _r in _rows:
                    for _c in range(self.RC):
                        if not bool(self.city_alive[_b, _r, _c]):
                            continue
                        # THE TURN JUST PLAYED. `self.turn` was advanced at
                        # the top of this same `step()`, and every other
                        # emitter on this engine stamps from inside the turn —
                        # so a snapshot taken here has to step back one, or it
                        # pairs against the OTHER engine's next turn and reads
                        # every ordinary growth as a divergence.
                        _ev.append(
                            f"pop:{int(self._ROW_SEAT[_r])}:{int(self.turn) - 1}"
                            f":{int(self.city_center[_b, _r, _c])}:sn"
                            f" {int(self.city_pop[_b, _r, _c])}")

        if simbase._ALIAS_CHECK:
            self._check_state_discipline()
