from __future__ import annotations

from .simbase import *  # noqa: F401,F403 — torch, constants, helpers: the shared floor
from .simbase import _MUTABLE  # noqa: F401 — private names do not ride a star import
from . import simbase  # the PATCHABLE globals (the pool caps/_ALIAS_CHECK) must be read live


class SimStep:
    def step(self) -> None:
        dev = self.device

        if self.units_mode:
            cap = self.rules.combat.get("unitHp", 100)
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
                _mil = ((self._type_combat[_typ] > 0) & ~self.unit_naval[_typ]
                        & (self._type_air[_typ] == 0))
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
            self._check_rc_registry_invariant()

        self._theological_combat_phase()
        self._spread_religious_pressure()
        self._climate_turn()

        self._ww_audit()
        self.turn += 1
        if self._era_len > 0 and self.turn % self._era_len == 0:
            # CIV6: "all roads in your territory will upgrade to the next
            # level automatically" on reaching the era that brings the tier,
            # latched at the same site TS latches it.
            _era = self.turn // self._era_len
            _tier = 0
            for _i, _e in enumerate(self._road_tier_era):
                if _era >= _e:
                    _tier = _i
            if _tier > self.road_tier:
                self.road_tier = _tier
            sc = self.era_score
            # The PREVIOUS age, the Heroic test's substrate. CLONED because
            # civ_age is written IN PLACE below — a bare reference would read
            # back the NEW age and the Dark->Golden test could never fire.
            _was = self.civ_age.clone()
            # CIV6 (Ages): the bars are THIS CIV's — cities counted as the
            # era begins, past dark ages lowering them and past golden or
            # heroic ages raising them, the Golden bar a fixed gap above.
            _nc = self.city_alive[:, :self.n_majors].long().sum(dim=2)
            _dt = self._era_dark + _nc + self._age_step * (self.golden_ages - self.dark_ages)
            _gt = _dt + (self._era_gold - self._era_dark)
            self.civ_age.copy_(torch.where(
                sc < _dt,
                torch.zeros_like(self.civ_age),
                torch.where(sc >= _gt, torch.full_like(self.civ_age, 2), torch.ones_like(self.civ_age)),
            ))
            self.prev_age.copy_(_was)
            self.dark_ages += (self.civ_age == 0).long()
            self.golden_ages += (self.civ_age == 2).long()
            self._eff_version += 1  # a new AGE is a new Dark-Age card pool
            self.dedications.copy_(torch.where(
                (_was == 0) & (self.civ_age == 2),
                torch.full_like(self.dedications, self._heroic_ded),
                torch.ones_like(self.dedications),
            ))
            _era_i = int(self.turn // self._era_len)
            # Each civ picks from the WINDOW its world era offers, round-robin
            # over that window rather than over the whole catalog.
            _ew = min(_era_i, len(self._ded_eras) - 1)
            _wlen = self._ded_era_len[_ew]
            self.ded_picks[:] = -1
            for _c in range(self.n_majors):
                for _k in range(self.ded_picks.shape[2]):
                    if _wlen == 0:
                        continue
                    _take = self.dedications[:, _c] > _k
                    _pick = self._ded_eras[_ew][(_era_i + _c + _k) % _wlen]
                    self.ded_picks[:, _c, _k] = torch.where(
                        _take,
                        torch.full_like(self.ded_picks[:, _c, _k], _pick),
                        torch.full_like(self.ded_picks[:, _c, _k], -1),
                    )
            self._commit_golden_grants(_era_i)
            self.era_score[:] = 0
            self._era_inspirations()
        self._world_congress()
        # THE EXOPLANET FLIGHT — CIV6: 1 light-year/turn plus one per laser
        # station standing behind it, and the win fires on ARRIVAL, not launch.
        # Ties in one turn go to the lowest row (argmax takes the FIRST True),
        # and the victory_type guard keeps an already-won space game's victor.
        fly = self.space_ly >= 0  # [B, n_majors]
        if bool(fly.any()):
            lz = torch.stack([self._laser_speed(r) for r in range(self.n_majors)], dim=1)
            self.space_ly.copy_(torch.where(fly, self.space_ly + 1 + lz, self.space_ly))
            arrive = fly & (self.space_ly >= int(self.rules.space_ly_target))
            landed = arrive.any(dim=1) & (self.victory_type != 3)
            if bool(landed.any()):
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
        self.victory_row.copy_(torch.where(space_won, self.victory_row, torch.where(dom >= 0, dom, torch.where(rel >= 0, rel, torch.where(cul >= 0, cul, torch.where(dip >= 0, dip, torch.full_like(dom, -1)))))))
        # The WINNER is whoever the outcome names — `victory_row` for every
        # condition that has a victor. Only the turn-limit score result has
        # none, and there the score leader is the winner.
        # `lead` is read ONLY where the game is over with no named victor —
        # the turn-limit score finish. Gating on those exact rows (not
        # game_over.any()) keeps three full seat_score city walks out of
        # every turn that follows the batch's first finished game.
        need_lead = self.game_over & (self.victory_row < 0)
        lead = self.leader() if bool(need_lead.any()) else torch.full_like(dom, -1)
        self.winner = torch.where(self.victory_row >= 0, self.victory_row,
                                  torch.where(self.game_over, lead, torch.full_like(dom, -1)))

        if simbase._ALIAS_CHECK:
            self._check_state_discipline()
