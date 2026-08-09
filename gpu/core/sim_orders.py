"""Unit-order application (every seat), captures, founding mutations, the barbarian phase.

One mixin of BatchSim (assembled in engine.py); state and helpers live on
self / gpu/core/simbase.py.
"""
from __future__ import annotations

from .simbase import *  # noqa: F401,F403 — torch, constants, helpers: the shared floor
from .simbase import _MUTABLE  # noqa: F401 — private names do not ride a star import
from . import simbase  # the PATCHABLE globals (U_MAX/P_MAX/_ALIAS_CHECK) must be read live


class SimOrders:
    def _apply_seat_unit_actions(self, r: int, actions: torch.Tensor) -> None:
        """Execute a controlled civ seat's unit orders in slot order.

        Slot order is the seat_unit_mask layout; -1/12 = hold. Orders are
        re-validated at execution, exactly like the seat-0 applier, and
        combat draws from the shared RNG stream.
        """
        B, dev = self.B, self.device
        smap = self.seat_slot_map(r)
        ctl = self.controlled[:, r]
        for row in range(simbase.P_MAX):
            slot = smap[:, row]
            present = (slot >= 0) & ctl
            if not bool(present.any()):
                continue
            sc = slot.clamp(min=0)
            a = actions[:, row].to(torch.long)
            act = present & (a >= 0) & (a != 12)
            if not bool(act.any()):
                continue
            here = self.v_tile.gather(1, sc.unsqueeze(1)).squeeze(1)
            is_civ = self._p_charges[self.v_type.gather(1, sc.unsqueeze(1)).squeeze(1)] > 0
            # --- FOUND_CITY: a settler founds where it stands, consumed —
            if getattr(self, "_A_FOUND", -1) >= 0 and self._settler_idx >= 0:
                fnd = act & (a == self._A_FOUND) & (self.v_type.gather(1, sc.unsqueeze(1)).squeeze(1) == self._settler_idx)
                if bool(fnd.any()):
                    made_f = self._found_rc_at(r, fnd, here)
                    if bool(made_f.any()):
                        rows_f = made_f.nonzero(as_tuple=True)[0]
                        self.occ_civ[rows_f, here[rows_f]] = -1
                        self.v_alive[rows_f, sc[rows_f]] = False
            # --- moves 0-5 ---
            mv = act & (a < 6)
            if bool(mv.any()):
                nb = self.neigh[here.clamp(min=0)]  # [B, 6]
                tgt = nb.gather(1, a.clamp(min=0, max=5).unsqueeze(1)).squeeze(1)
                tc = tgt.clamp(min=0)
                blocked_mil = self._blocked_for(tgt.unsqueeze(1), r + 1).squeeze(1)
                blocked_civ = self._blocked_for(tgt.unsqueeze(1), r + 1, is_civilian=True).squeeze(1)
                blocked = torch.where(is_civ, blocked_civ, blocked_mil)
                # The embark gate, mirroring the mask — _step_verb owns the
                # transition itself (EMBARK_MOVES pool, cost, disembark).
                _pass_d = self.passable.gather(1, tc.unsqueeze(1)).squeeze(1)
                if self._embark_live:
                    # The mask's three-way terrain body, at the apply surface:
                    # one legality rule, both surfaces. Naval hulls take wpass
                    # behind cartography-for-ocean, war-free; land units take
                    # passable, or the embark gate (SHIPBUILDING, ocean behind
                    # cartography, at war with ANYONE).
                    _vt_mv2 = self.v_type.gather(1, sc.unsqueeze(1)).squeeze(1).clamp(min=0, max=self.NU - 1)
                    _is_nav_d = self.unit_naval[_vt_mv2]
                    _cart_r2 = (
                        self.r_techs[:, r, self._cartography_tech]
                        if self._cartography_tech >= 0
                        else torch.zeros(B, dtype=torch.bool, device=dev)
                    )
                    _ship_d = (
                        self.r_techs[:, r, self._shipbuilding_tech]
                        if self._shipbuilding_tech >= 0
                        else torch.zeros(B, dtype=torch.bool, device=dev)
                    )
                    _wp_d = self.wpass.gather(1, tc.unsqueeze(1)).squeeze(1) & (
                        ~self.ocean_tile.gather(1, tc.unsqueeze(1)).squeeze(1) | _cart_r2
                    )
                    _at_war_d = self.r_atwar[:, r] | self.rr_war[:, r].any(dim=1)  # war with ANYONE, matching the walker
                    _wg2 = _wp_d & _ship_d & ~_is_nav_d & _at_war_d  # war-march only, no embark at peace
                    _pass_d = torch.where(_is_nav_d, _wp_d, _pass_d | _wg2)
                # Cliffs: TS stepUnit refuses them internally and _step_verb
                # does not, so the refusal is spelled out here.
                _clf_d = self._cliff_block_dirs(here.clamp(min=0), self.neigh[here.clamp(min=0)], self.civ_at == r)
                _clf_dir = _clf_d.gather(1, a.clamp(min=0, max=5).unsqueeze(1)).squeeze(1)
                # A unit with NO movement cannot step. _step_verb's afford
                # test does not cover the DISEMBARK arm on its own: that cost
                # is "all remaining movement", so at 0 MP the test (mp < cost
                # && mp < full) reads 0 < 0 = False and would walk a spent
                # embarked unit ashore.
                _mp_d = self.v_mp.gather(1, sc.unsqueeze(1)).squeeze(1)
                ok = mv & (tgt >= 0) & _pass_d & ~blocked & ~_clf_dir & (_mp_d > 0)
                if bool(ok.any()):
                    self._step_verb(  # the shared step contract
                        ok, sc + simbase.P_MAX, here, tgt, a.clamp(min=0, max=5),
                        r + 1, is_civ,
                        camp_civ=torch.full((B,), r, dtype=torch.long, device=dev),
                    )
            # --- attacks 6-11 (military only; the shared resolution handles
            # barbarian and seat-0 defenders, lone civilians and city
            # targets) ---
            atk = act & (a >= 6) & (a < 12) & ~is_civ & ~self.v_emb.gather(1, sc.unsqueeze(1)).squeeze(1)  # embarked cannot attack (the war act's ~v_emb)
            if bool(atk.any()):
                nb = self.neigh[here.clamp(min=0)]
                tgt = nb.gather(1, (a - 6).clamp(min=0, max=5).unsqueeze(1)).squeeze(1)
                valid_t = atk & (tgt >= 0)
                if bool(valid_t.any()):
                    tc = tgt.clamp(min=0)
                    # who stands on the target tile, by seat
                    _mt = self.occ_mil.gather(1, tc.unsqueeze(1)).squeeze(1)
                    _ct = self.occ_civ.gather(1, tc.unsqueeze(1)).squeeze(1)
                    _mts = torch.where(_mt >= 0, self.unit_seat.gather(1, _mt.clamp(min=0).unsqueeze(1)).squeeze(1), torch.full_like(_mt, -1))
                    _cts = torch.where(_ct >= 0, self.unit_seat.gather(1, _ct.clamp(min=0).unsqueeze(1)).squeeze(1), torch.full_like(_ct, -1))
                    barb_t = _mts == BARB_SEAT
                    at_war = self.r_atwar[:, r]
                    p_unit = (_mts == 0) | (_cts == 0)
                    p_city = self.center_at.gather(1, tc.unsqueeze(1)).squeeze(1) >= 0
                    # The other melee target classes: at-war civ units and
                    # centres, plus city-state centres whose suzerain is
                    # seat 0 while this civ is at war with seat 0.
                    _vt_d2 = self.v_type.gather(1, sc.unsqueeze(1)).squeeze(1).clamp(min=0, max=self.NU - 1)
                    _melee_d2 = self._p_rng_str[_vt_d2] <= 0
                    _tciv = torch.where((_mts > 0) & (_mts != BARB_SEAT), _mts - 1, torch.full_like(_mts, -1))
                    _tcivC = torch.where((_cts > 0) & (_cts != BARB_SEAT), _cts - 1, torch.full_like(_cts, -1))
                    _rr_u2 = (
                        ((_tciv >= 0) & self.rr_war[:, r].gather(1, _tciv.clamp(min=0).unsqueeze(1)).squeeze(1))
                        | ((_tcivC >= 0) & self.rr_war[:, r].gather(1, _tcivC.clamp(min=0).unsqueeze(1)).squeeze(1))
                    )
                    _rvc2 = self.rc_at.gather(1, tc.unsqueeze(1)).squeeze(1)
                    _rr_c2 = (_rvc2 >= 0) & self.rr_war[:, r].gather(1, _rvc2.clamp(min=0).unsqueeze(1)).squeeze(1)
                    S2_ = self.S
                    _suz2 = (
                        (self.cs_envoys[:, :S2_] >= 3)
                        & (self.cs_envoys[:, :S2_] > self.cs_r_envoys[:, :, :S2_].max(dim=1).values)
                        & self.cs_alive[:, :S2_]
                    )
                    _csc2 = torch.zeros(B, self.T, dtype=torch.bool, device=dev)
                    _csc2.scatter_(1, self.cs_center[:, :S2_].clamp(min=0), _suz2)
                    _cs2 = _csc2.gather(1, tc.unsqueeze(1)).squeeze(1) & at_war
                    # Melee dispatch, in meleeAttackInner's precedence:
                    #   1. a seat-0 centre takes the melee UNCONDITIONALLY (a
                    #      garrison shields nothing; it adds to the city's
                    #      strength instead),
                    #   2. a civ or city-state centre takes it when the tile
                    #      is EMPTY of enemy units OR holds a MILITARY
                    #      garrison (city-first; a LONE CIVILIAN is captured
                    #      instead),
                    #   3. otherwise the unit resolver.
                    # Each class needs its own resolver — _hostile_vs_unit
                    # no-ops on an empty centre — so centres route to
                    # _hostile_city_attack / _civ_attack_civ_city /
                    # _assault_city_state (+capture).
                    # cityFirst counts HOSTILE occupants only (TS filters
                    # unitsAt through unitsHostile), so the attacker's OWN
                    # civilian parked on an enemy centre never blocks the
                    # siege.
                    # A RANGED attacker never runs the melee chain: TS forks
                    # to hostileRangedStrike, whose conventions differ on BOTH
                    # ends (a seat-0 city takes the hit first and holds at
                    # 1 HP; a civilian TAKES THE ROLL instead of being
                    # captured).
                    _rngd_att = valid_t & ~_melee_d2
                    if bool(_rngd_att.any()):
                        for b_ in _rngd_att.nonzero(as_tuple=True)[0].tolist():
                            v_ = int(sc[b_])
                            one_ = torch.zeros(B, dtype=torch.bool, device=dev)
                            one_[b_] = True
                            _fired_ = self._hostile_ranged_strike(one_, tgt, "v", v_)
                            # Spend ONLY when the strike actually resolved:
                            # hostileRangedStrike's early returns (no city, no
                            # eligible defender) leave TS movesLeft untouched,
                            # and a refused attempt must not feed the heal /
                            # fortify gates a phantom act.
                            if bool(_fired_[b_]):
                                self.v_mp[b_, v_] = 0  # a strike spends the turn (TS movesLeft = 0)
                    valid_t = valid_t & _melee_d2
                    _host_mil = barb_t | ((_mts == 0) & at_war) | ((_tciv >= 0) & self.rr_war[:, r].gather(1, _tciv.clamp(min=0).unsqueeze(1)).squeeze(1))
                    _host_civ = ((_cts == BARB_SEAT)
                                 | ((_cts == 0) & at_war)
                                 | ((_tcivC >= 0) & self.rr_war[:, r].gather(1, _tcivC.clamp(min=0).unsqueeze(1)).squeeze(1)))
                    _civ_only = _host_civ & ~_host_mil          # LONE hostile civilian -> capture, not the city
                    # the seat-0-centre arm has NO civilian exception: TS's
                    # `if (enemyCity)` returns before the capture block, so
                    # even a lone civilian on the centre tile watches the CITY
                    # take the hit.
                    pcity_att = valid_t & _melee_d2 & p_city & at_war
                    _cf = ~_civ_only                            # city-first: empty or military-garrisoned
                    rrc_att = valid_t & _melee_d2 & _rr_c2 & _cf & ~pcity_att
                    cs_att2 = valid_t & _melee_d2 & _cs2 & _cf & ~pcity_att & ~rrc_att
                    rru_att = valid_t & _melee_d2 & _rr_u2 & ~pcity_att & ~rrc_att & ~cs_att2
                    unit_att = valid_t & ~pcity_att & ~rrc_att & ~cs_att2 & (barb_t | (p_unit & at_war) | rru_att)
                    city_att = pcity_att
                    for b_ in range(B):
                        if not bool(valid_t[b_]):
                            continue
                        v = int(sc[b_])
                        one = torch.zeros(B, dtype=torch.bool, device=dev)
                        one[b_] = True
                        if bool(unit_att[b_]):
                            self._hostile_vs_unit(one, tgt, "v", v)
                            self.v_mp[b_, v] = 0  # the turn is spent (TS movesLeft = 0)
                        elif bool(rrc_att[b_]):
                            self._civ_attack_civ_city(one, tgt.clamp(min=0), v)
                            self.v_mp[b_, v] = 0
                        elif bool(cs_att2[b_]):
                            _css = self.cs_at.gather(1, tc.unsqueeze(1)).squeeze(1).clamp(min=0)
                            _csr2 = self._assault_city_state(one, _css, tgt.clamp(min=0), "v", v)
                            if _csr2 is not None:
                                _rows2, _dead2, _cap2 = _csr2
                                if bool(_cap2.any()):
                                    self._capture_city_state_seat(_cap2.nonzero(as_tuple=True)[0], _css, v)
                            self.v_mp[b_, v] = 0
                        elif bool(city_att[b_]):
                            self._hostile_city_attack(one, self.center_at.gather(1, tc.unsqueeze(1)).squeeze(1), "v", v)
                            self.v_mp[b_, v] = 0  # the turn is spent (TS movesLeft = 0)
            # --- SNIPE (ranged ring-2 strike) ---
            snp = (
                act & (a >= self._A_SNIPE) & (a < self._A_SNIPE + 12) & ~is_civ
                if getattr(self, "_snipe_on", False)
                else torch.zeros_like(act)
            )
            if bool(snp.any()):
                ringd = self.ring2[here.clamp(min=0)]  # [B, 12]
                tgt_s = ringd.gather(1, (a - self._A_SNIPE).clamp(min=0, max=11).unsqueeze(1)).squeeze(1)
                vt_d = self.v_type.gather(1, sc.unsqueeze(1)).squeeze(1).clamp(min=0, max=self.NU - 1)
                ok_s2 = (
                    snp & (tgt_s >= 0)
                    & (self._p_rng_str[vt_d] > 0) & (self._p_rng_rng[vt_d] >= 2)
                    & ~self.v_emb.gather(1, sc.unsqueeze(1)).squeeze(1)
                )
                if bool(ok_s2.any()):
                    tcs = tgt_s.clamp(min=0)
                    _mt2 = self.occ_mil.gather(1, tcs.unsqueeze(1)).squeeze(1)
                    _ct2 = self.occ_civ.gather(1, tcs.unsqueeze(1)).squeeze(1)
                    _mts2 = torch.where(_mt2 >= 0, self.unit_seat.gather(1, _mt2.clamp(min=0).unsqueeze(1)).squeeze(1), torch.full_like(_mt2, -1))
                    _cts2 = torch.where(_ct2 >= 0, self.unit_seat.gather(1, _ct2.clamp(min=0).unsqueeze(1)).squeeze(1), torch.full_like(_ct2, -1))
                    at_war2 = self.r_atwar[:, r]
                    u_hit = ok_s2 & ((_mts2 == BARB_SEAT) | (((_mts2 == 0) | (_cts2 == 0)) & at_war2))
                    c_hit = ok_s2 & ~u_hit & (self.center_at.gather(1, tcs.unsqueeze(1)).squeeze(1) >= 0) & at_war2
                    for b_ in range(B):
                        if not bool(ok_s2[b_]):
                            continue
                        v = int(sc[b_])
                        one = torch.zeros(B, dtype=torch.bool, device=dev)
                        one[b_] = True
                        if bool(u_hit[b_] | c_hit[b_]):
                            # ONE resolver for both target classes:
                            # hostileRangedStrike does its own city-first
                            # internally (vrngc — one roll, NO retaliation,
                            # floor 1 HP, never the melee counter draw).
                            # Spend only when it actually fired: the
                            # resolver's internal refusals are TS's early
                            # returns, which leave movesLeft untouched.
                            _fired2 = self._hostile_ranged_strike(one, tgt_s, "v", v)
                            if bool(_fired2[b_]):
                                self.v_mp[b_, v] = 0
            # --- builds 13-15 (builders) ---
            # Civ chop (16): strip + grant into the owning civ's NEAREST
            # alive city (food -> rc_growth, production -> rc_progress); the
            # charge spends via the applier's slot-gather pattern, disband
            # at 0.
            ftr_c = self.tile_ftr.gather(1, here.unsqueeze(1)).squeeze(1)
            ftu_c = self.tile_ftu.gather(1, here.unsqueeze(1)).squeeze(1)
            unlocked_c = (ftu_c >= 0) & self.r_techs[:, r, :].gather(1, ftu_c.clamp(min=0).unsqueeze(1)).squeeze(1)
            chp = (
                act
                & (a == self._A_CHOP)
                & is_civ
                & (self.v_charges.gather(1, sc.unsqueeze(1)).squeeze(1) > 0)
                & (ftr_c > 0)
                & unlocked_c
                & ~self.feat_stripped.gather(1, here.unsqueeze(1)).squeeze(1)
            )
            if bool(chp.any()):
                rows_c = chp.nonzero(as_tuple=True)[0]
                tiles_c = here[rows_c]
                self._strip_feature_at(rows_c, tiles_c)
                if self.LUMBER >= 0:
                    was_l = self.improvement[rows_c, tiles_c] == self.LUMBER
                    self.improvement[rows_c, tiles_c] = torch.where(was_l, torch.full_like(self.improvement[rows_c, tiles_c], -1), self.improvement[rows_c, tiles_c])
                done_r = (self.r_techs[:, r, :].sum(dim=1) + self.r_civics[:, r, :].sum(dim=1)).to(self.dtype)
                amount_r = js_round(20.0 + 2.5 * done_r)
                own_r = self.civ_at[rows_c, tiles_c]
                for i2 in range(len(rows_c)):
                    b2 = int(rows_c[i2])
                    if int(own_r[i2]) != r:
                        continue  # outside this civ's borders: chopped, no lump
                    aliv = self.rc_alive[b2, r]
                    if not bool(aliv.any()):
                        continue
                    ctrs = self.rc_center[b2, r].clamp(min=0)
                    d = self.pair_dist[int(tiles_c[i2])][ctrs].float()
                    d = torch.where(aliv, d, torch.full_like(d, 1e9))
                    j = int(d.argmin())
                    amt = float(amount_r[b2])
                    if int(ftr_c[rows_c[i2]]) == 1:
                        self.rc_growth[b2, r, j] += amt
                    else:
                        # This add is DELIBERATELY left to vanish when there
                        # is no current item, and must NOT be banked:
                        # rc_progress is zeroed on the next queue push, so the
                        # production is destroyed. TS's `chopGrant` /
                        # `harvestGrant` / `applyLumpYield` / `chopValue`
                        # (core/economy.ts) are seat-generic, but nothing on
                        # the TS side calls them for a civ, so banking here
                        # would hand the GPU production TS never grants.
                        #
                        # Real Civ 6 civs do chop; matching that needs a TS
                        # civ chop verb. Neither engine can reach this path
                        # today — no gate drives a controlled civ seat, and
                        # the TS oracle has no seat axis to drive one.
                        self.rc_progress[b2, r, j] += amt
                self.v_charges[rows_c, sc[rows_c]] -= 1
                self.v_mp[rows_c, sc[rows_c]] = 0  # the turn is spent (TS movesLeft = 0)
                spent_c = chp & (self.v_charges.gather(1, sc.unsqueeze(1)).squeeze(1) <= 0)
                if bool(spent_c.any()):
                    dr = spent_c.nonzero(as_tuple=True)[0]
                    self.v_alive[dr, sc[dr]] = False
                    self.occ_civ[(dr, here[dr])] = -1
            bld = act & (a >= 13) & (a < 16) & is_civ
            if bool(bld.any()):
                tc = here.clamp(min=0)
                imp_for = {13: self.FARM, 14: self.MINE, 15: self.LUMBER}
                hf = self.r_civics[:, r, self._hillfarms_civic] if self._hillfarms_civic >= 0 else torch.zeros(B, dtype=torch.bool, device=dev)
                mining = self.r_techs[:, r, self._mine_unlock_tech] if self._mine_unlock_tech >= 0 else torch.zeros(B, dtype=torch.bool, device=dev)
                constr = self.r_techs[:, r, self._lumber_unlock_tech] if self._lumber_unlock_tech >= 0 else torch.zeros(B, dtype=torch.bool, device=dev)
                base_ok = (
                    bld
                    & (self.v_charges.gather(1, sc.unsqueeze(1)).squeeze(1) > 0)
                    & (self.civ_at.gather(1, tc.unsqueeze(1)).squeeze(1) == r)
                    & (self.rc_at.gather(1, tc.unsqueeze(1)).squeeze(1) < 0)
                    & (self.improvement.gather(1, tc.unsqueeze(1)).squeeze(1) < 0)
                    & (self.district.gather(1, tc.unsqueeze(1)).squeeze(1) < 0)
                    & (self.built_wonder.gather(1, tc.unsqueeze(1)).squeeze(1) < 0)  # an in-flight wonder pave refuses improvements
                )
                farm_ok = base_ok & (a == 13) & (self.farm_flat.gather(1, tc.unsqueeze(1)).squeeze(1) | (self.farm_hill.gather(1, tc.unsqueeze(1)).squeeze(1) & hf))
                mine_ok2 = base_ok & (a == 14) & self.mine_ok.gather(1, tc.unsqueeze(1)).squeeze(1) & mining & (self.MINE >= 0)
                lum_ok = base_ok & (a == 15) & self.lumber_ok.gather(1, tc.unsqueeze(1)).squeeze(1) & ~self.feat_stripped.gather(1, tc.unsqueeze(1)).squeeze(1) & constr & (self.LUMBER >= 0)  # a chopped tile has no woods left to mill
                did = torch.zeros(B, dtype=torch.bool, device=dev)
                for code, okm in ((13, farm_ok), (14, mine_ok2), (15, lum_ok)):
                    if bool(okm.any()):
                        rows_ = okm.nonzero(as_tuple=True)[0]
                        self.improvement[rows_, tc[rows_]] = imp_for[code]
                        self.pillaged[rows_, tc[rows_]] = False
                        did[rows_] = True
                if bool(did.any()):
                    rows_ = did.nonzero(as_tuple=True)[0]
                    self.v_charges[rows_, sc[rows_]] -= 1
                    self.v_mp[rows_, sc[rows_]] = 0  # the turn is spent (TS movesLeft = 0)
                    self._eff_version += 1
                    spent = did & (self.v_charges.gather(1, sc.unsqueeze(1)).squeeze(1) <= 0)
                    if bool(spent.any()):
                        dr = spent.nonzero(as_tuple=True)[0]
                        self.v_alive[dr, sc[dr]] = False
                        self.occ_civ[(dr, here[dr])] = -1
            # The dispatch for the builder/military columns. Every column the
            # mask calls legal must land in exactly one arm here: a legal
            # column nothing executes is a silent no-op on both engines.
            _tcd = here.clamp(min=0)
            # -- RESOURCE IMPROVEMENTS (18..): the seat-0 `_res_cols` twin,
            #    unlocked on THIS civ's techs. Column 18+i is improvement 3+i,
            #    the same offset the mask uses.
            if self.improvements_on and self._builder_idx >= 0 and self._act_names:
                _res_lo = self._A_REPAIR + 1
                _rbase = (
                    act & is_civ
                    & (a >= _res_lo) & (a < self._A_PILLAGE)
                    & (self.v_charges.gather(1, sc.unsqueeze(1)).squeeze(1) > 0)
                    & (self.civ_at.gather(1, _tcd.unsqueeze(1)).squeeze(1) == r)
                    & (self.rc_at.gather(1, _tcd.unsqueeze(1)).squeeze(1) < 0)
                    & (self.improvement.gather(1, _tcd.unsqueeze(1)).squeeze(1) < 0)
                    & (self.district.gather(1, _tcd.unsqueeze(1)).squeeze(1) < 0)
                    & (self.built_wonder.gather(1, _tcd.unsqueeze(1)).squeeze(1) < 0)
                )
                if bool(_rbase.any()):
                    _rqd = self.res_imp.gather(1, _tcd.unsqueeze(1)).squeeze(1)
                    _didr = torch.zeros(B, dtype=torch.bool, device=dev)
                    for _k in range(3, self._imp_unlock.numel()):
                        _col = _res_lo + (_k - 3)
                        _ut = int(self._imp_unlock[_k])
                        _unl = self.r_techs[:, r, _ut] if _ut >= 0 else torch.ones(B, dtype=torch.bool, device=dev)
                        if self.SEASIDE >= 0 and _k == self.SEASIDE:
                            _okk = _rbase & (a == _col) & self._seaside_ok().gather(1, _tcd.unsqueeze(1)).squeeze(1) & _unl
                        else:
                            _okk = _rbase & (a == _col) & (_rqd == _k) & _unl
                        if bool(_okk.any()):
                            _rw = _okk.nonzero(as_tuple=True)[0]
                            self.improvement[_rw, _tcd[_rw]] = _k
                            self.pillaged[_rw, _tcd[_rw]] = False
                            _didr[_rw] = True
                    if bool(_didr.any()):
                        _rw = _didr.nonzero(as_tuple=True)[0]
                        self.v_charges[_rw, sc[_rw]] -= 1
                        self.v_mp[_rw, sc[_rw]] = 0  # the turn is spent
                        self._eff_version += 1
                        _sp = _didr & (self.v_charges.gather(1, sc.unsqueeze(1)).squeeze(1) <= 0)
                        if bool(_sp.any()):
                            _dr = _sp.nonzero(as_tuple=True)[0]
                            self.v_alive[_dr, sc[_dr]] = False
                            self.occ_civ[(_dr, here[_dr])] = -1
                # -- REPAIR (the builderRepair twin): improvement first, else
                #    district, turn spent, NO charge. Ownership is the CIV plane.
                _okrp = (
                    act & is_civ & (a == self._A_REPAIR)
                    & (self.v_type.gather(1, sc.unsqueeze(1)).squeeze(1) == self._builder_idx)
                    & (self.civ_at.gather(1, _tcd.unsqueeze(1)).squeeze(1) == r)
                    & (
                        self.pillaged.gather(1, _tcd.unsqueeze(1)).squeeze(1)
                        | self.district_pillaged.gather(1, _tcd.unsqueeze(1)).squeeze(1)
                    )
                )
                if bool(_okrp.any()):
                    _rw = _okrp.nonzero(as_tuple=True)[0]
                    _tt = _tcd[_rw]
                    _imp = self.pillaged[_rw, _tt]
                    self.pillaged[_rw[_imp], _tt[_imp]] = False
                    _dis = ~_imp & self.district_pillaged[_rw, _tt]
                    self.district_pillaged[_rw[_dis], _tt[_dis]] = False
                    self.v_mp[_rw, sc[_rw]] = 0
                    self._eff_version += 1
            # -- PILLAGE (the seatPillage twin): a MILITARY unit on enemy land
            #    wrecks the improvement, else a complete non-centre district.
            if self._act_names and self._A_PILLAGE > 0:
                _enp = (
                    ((self.owner.gather(1, _tcd.unsqueeze(1)).squeeze(1) >= 0) & self.r_atwar[:, r])
                    | (self.cs_at.gather(1, _tcd.unsqueeze(1)).squeeze(1) >= 0)
                )
                _hip = (self.improvement.gather(1, _tcd.unsqueeze(1)).squeeze(1) >= 0) & ~self.pillaged.gather(1, _tcd.unsqueeze(1)).squeeze(1)
                _hdp = (
                    (self.district.gather(1, _tcd.unsqueeze(1)).squeeze(1) >= 0)
                    & self.district_complete.gather(1, _tcd.unsqueeze(1)).squeeze(1)
                    & ~self.district_pillaged.gather(1, _tcd.unsqueeze(1)).squeeze(1)
                    & (self.center_at.gather(1, _tcd.unsqueeze(1)).squeeze(1) < 0)
                    & (self.rc_at.gather(1, _tcd.unsqueeze(1)).squeeze(1) < 0)
                )
                _okpl = (
                    act & (a == self._A_PILLAGE)
                    & (self._p_combat[self.v_type.gather(1, sc.unsqueeze(1)).squeeze(1).clamp(min=0)] > 0)
                    & _enp & (_hip | _hdp)
                )
                if bool(_okpl.any()):
                    _rw = _okpl.nonzero(as_tuple=True)[0]
                    _tt = _tcd[_rw]
                    _pi = _hip[_rw]
                    self.pillaged[_rw[_pi], _tt[_pi]] = True
                    # FOOD improvements (PILLAGE_HEAL) heal their pillager
                    # +25, capped at full HP — every pillage arm carries it.
                    _impv = self.improvement[_rw[_pi], _tt[_pi]]
                    _hl = self._imp_heals[_impv.clamp(min=0)] & (_impv >= 0)
                    _hr = _rw[_pi][_hl]
                    if _hr.numel():
                        self.v_hp[_hr, sc[_hr]] = torch.minimum(
                            self.v_hp[_hr, sc[_hr]] + 25,
                            torch.full_like(self.v_hp[_hr, sc[_hr]], 100),
                        )
                    _pd = ~_pi & _hdp[_rw]
                    self.district_pillaged[_rw[_pd], _tt[_pd]] = True
                    self.v_mp[_rw, sc[_rw]] = 0
                    self._eff_version += 1
            # --- SPREAD (religious pressure) -----------------------------
            # The lump into the target city's accumulator for religion
            # g = r+1, charge -1, disband at 0. Re-validated: a religious unit
            # with charges, a founded religion, and an ALIVE centre on the
            # named tile.
            if getattr(self, "_A_SPREAD", -1) >= 0:
                spx = act & (a >= self._A_SPREAD) & (a < self._A_SPREAD + 7)
                if bool(spx.any()):
                    vt_sp = self.v_type.gather(1, sc.unsqueeze(1)).squeeze(1).clamp(min=0, max=self.NU - 1)
                    _relig_sp = torch.zeros_like(spx)
                    if self._missionary_idx >= 0:
                        _relig_sp = _relig_sp | (vt_sp == self._missionary_idx)
                    if getattr(self, "_apostle_idx", -1) >= 0:
                        _relig_sp = _relig_sp | (vt_sp == self._apostle_idx)
                    dsp = (a - self._A_SPREAD).clamp(min=0)
                    tgt_sp = torch.where(
                        dsp == 0, here,
                        self.neigh[here.clamp(min=0)].gather(1, (dsp - 1).clamp(min=0, max=5).unsqueeze(1)).squeeze(1),
                    )
                    ok_sp = (
                        spx & _relig_sp & (tgt_sp >= 0)
                        & (self.v_charges.gather(1, sc.unsqueeze(1)).squeeze(1) > 0)
                        & self.r_religion_done[:, r]
                    )
                    if bool(ok_sp.any()):
                        # rc_at names the CIV, not the per-civ slot j, so
                        # cty_pressure cannot be indexed through it. Resolve
                        # the slot by matching rc_center == target across
                        # (civ, slot).
                        g_sp = r + 1
                        tc_sp = tgt_sp.clamp(min=0)
                        lump_sp = self._enh["mlump"][self.r_enhancer[:, r] + 1]
                        pm_sp = ok_sp.unsqueeze(1) & self.alive & (self.site == tc_sp.unsqueeze(1))
                        pr_, pj_ = pm_sp.nonzero(as_tuple=True)
                        if len(pr_):
                            self.cty_pressure[pr_, 0, pj_, g_sp] += lump_sp[pr_]
                        hit_p = pm_sp.any(dim=1)
                        hit_r = torch.zeros_like(hit_p)
                        if self.R > 0:
                            rm_sp = (ok_sp & ~hit_p).reshape(B, 1, 1) & self.rc_alive & (self.rc_center == tc_sp.reshape(B, 1, 1))
                            rr_, rc_, rj_ = rm_sp.nonzero(as_tuple=True)
                            if len(rr_):
                                self.cty_pressure[rr_, rc_ + 1, rj_, g_sp] += lump_sp[rr_]
                            hit_r = rm_sp.reshape(B, -1).any(dim=1)
                        landed = hit_p | hit_r
                        if bool(landed.any()):
                            lr = landed.nonzero(as_tuple=True)[0]
                            self.v_charges[lr, sc[lr]] -= 1
                            self.v_mp[lr, sc[lr]] = 0
                            dead_sp = landed & (self.v_charges.gather(1, sc.unsqueeze(1)).squeeze(1) <= 0)
                            if bool(dead_sp.any()):
                                dr_ = dead_sp.nonzero(as_tuple=True)[0]
                                self.v_alive[dr_, sc[dr_]] = False
                                self.occ_civ[(dr_, here[dr_])] = -1

    def _relocate_palace_c(self, rows: torch.Tensor) -> None:
        """Re-crown seat 0's capital — the phase.ts `relocatePalace` mirror.

        Call it on the LOSER rows immediately after a seat-0 city leaves the
        empire (capture, loyalty defection or raze). No-op when the empire is
        gone (no live column) or still holds a capital; otherwise the
        surviving city with the HIGHEST population is re-crowned, ties to the
        EARLIEST acquisition (TS scans the array with a strict `>`, and array
        order is city_seq rank, never the column index).

        The PALACE BUILDING needs no write: both engines model it as a
        capital TERM (`is_cap` × `_palace_y` / `_palace_housing` /
        `_palace_amenities`), never a b_cost row — the rules export drops
        PALACE from the catalog — so moving `is_cap` moves the building.

        `cap_tile` (TS `capitalTile`) deliberately does NOT move: it is
        the STATIC domination anchor, as in real Civ 6 — the ORIGINAL capital
        stays the domination target while the relocated Palace carries the
        capital BONUSES."""
        if rows.numel() == 0:
            return
        alive = self.alive[rows]  # [n, C]
        need = alive.any(dim=1) & ~(self.is_cap[rows] & alive).any(dim=1)  # [n]
        if not bool(need.any()):
            return
        # ONE strictly-ordered key: population DESC, acquisition (city_seq)
        # ASC. city_seq is unique across live columns, so the argmax is
        # tie-free and reproduces TS's strict-`>` first-wins scan exactly.
        seq = self.city_seq[rows]
        key = torch.where(alive, self.pop[rows] * (1 << 20) - seq, torch.full_like(seq, -(1 << 60)))
        pick = key.max(dim=1).indices  # [n] (garbage where ~need, masked below)
        self.is_cap[rows[need], pick[need]] = True
        self._eff_version += 1  # yield-bearing: the palace term (yields/housing/amenities) just moved

    def _relocate_palace_rc(self, rows: torch.Tensor, civ: torch.Tensor) -> None:
        """Re-crown a civ seat's capital — the rc-side twin.

        `relocatePalace(seat.cities)` for a civ seat. `rows` and `civ` are parallel [n] index tensors: the losing civ per
        row. rc SLOT order IS the acquisition rank (founding, capture and both
        transfers all append at last-alive+1 and _reclaim_rc is stable, so rc
        slot order matches TS array order), so the tie-break runs on the slot
        index. rc_bldg is untouched (PALACE is not in the b_cost catalog) and
        `r_cap_tile` stays put for the same reason as the seat-0 side."""
        if rows.numel() == 0:
            return
        alive = self.rc_alive[rows, civ]  # [n, RC]
        need = alive.any(dim=1) & ~(self.rc_is_cap[rows, civ] & alive).any(dim=1)  # [n]
        if not bool(need.any()):
            return
        idx = torch.arange(self.RC, device=self.device).reshape(1, -1).expand_as(alive)
        key = torch.where(alive, self.rc_pop[rows, civ] * (1 << 20) - idx, torch.full_like(idx, -(1 << 60)))
        pick = key.max(dim=1).indices  # [n]
        self.rc_is_cap[rows[need], civ[need], pick[need]] = True
        self._eff_version += 1  # yield-bearing: civ yields/housing/amenities all read rc_is_cap

    def _capture_civ_city(self, rows: torch.Tensor, civ: torch.Tensor, slot: torch.Tensor, ctr: torch.Tensor, plunder: bool = True) -> None:
        """Transfer a civ seat's city to seat 0 — the TS `transferCity` twin.

        Into a FREE seat-0 slot when one exists; TS carries the matching cap,
        so beyond the city cap the capture razes instead. The city's OWN tiles
        (registry scan) re-tag to the new city id, pop lands at x0.75 (min 1),
        and the slot initializes from the live planes (site = the center,
        water housing from wh, river from riv, dist from the pair_dist row).
        """
        for i in range(len(rows)):
            b = int(rows[i]); r = int(civ[i]); j = int(slot[i]); c_t = int(ctr[i])
            # Taking a civ city earns GRIEVANCES, accrued at the TOP of the
            # loop like TS's — ABOVE the raze `continue`s, so a razed capture
            # earns them too.
            self.p_warmonger[b] += self._wm_cap
            pop = max(1, (int(self.rc_pop[b, r, j]) * 3) // 4)
            # Conquest keeps infrastructure: snapshot the civ city's buildings
            # BEFORE the rc-slot hygiene wipes them, so the new seat-0 city
            # can inherit them (minus PALACE, which is not in this catalog —
            # it is the implicit is_cap building).
            kept_bldg = self.rc_bldg[b, r, j, :].clone()
            # The civ city dies either way, and its registries die with it —
            # TS removes the City object, so no stale rc_* row may survive.
            self.rc_alive[b, r, j] = False
            self.rc_is_cap[b, r, j] = False  # capital identity dies with the city (r_cap_tile keeps the tile)
            self.centre_slot_at[b, c_t] = -1
            self.rc_dist_tile[b, r, j, :] = -1
            self.rc_wonder[b, r, j, :] = -1
            self.rc_bldg[b, r, j, :] = False
            self.rc_outer_hp[b, r, j] = 0  # walls die with the city
            # The dead city's QUEUE dies with it: a stale rc_current would
            # make has_q see a phantom queued item civ-wide.
            self.rc_current[b, r, j] = -1
            self.rc_cost[b, r, j] = 0
            self.rc_progress[b, r, j] = 0
            self.rc_qtile[b, r, j] = -1
            # The losing civ re-crowns its biggest surviving city the moment
            # the city leaves its list — TS calls relocatePalace right after
            # `seat.cities = filter(...)`, BEFORE the route prune and the raze
            # early-outs below.
            self._relocate_palace_rc(
                torch.tensor([b], dtype=torch.long, device=self.device),
                torch.tensor([r], dtype=torch.long, device=self.device),
            )
            # Exactly this city's tiles leave the civ, found by registry scan
            # (TS `tileBelongsTo`): a radius sweep would leak the outer ring
            # as orphaned civ territory and steal sibling cities' frontage.
            cid = int(self.rc_id[b, r, j])
            ring = (self.tile_city[b] == cid) & (self.civ_at[b] == r)
            # routes die with their endpoint (the TS filter twin)
            kill = (self.r_routes[b, r, :, 0] == cid) | (self.r_routes[b, r, :, 1] == cid)
            self.r_routes[b, r][kill] = -1
            self.r_route_dest[b, r][kill] = -1
            self.r_route_exp[b, r][kill] = -1
            self.tile_seat[b] = torch.where(ring, torch.full_like(self.tile_seat[b], NO_SEAT), self.tile_seat[b])  # civ tile ownership lives in tile_seat
            self._tile_owner_ver += 1
            self.tile_city[b] = torch.where(ring, torch.full_like(self.tile_city[b], -1), self.tile_city[b])
            # TS APPENDS the captured city, so the slot is the founding
            # HIGH-WATER mark (founded_n) — last-alive+1 would land in the
            # newest hole when the most recent city was the one that died.
            # Raze at TS's count cap; the hole-reuse fallback only fires when
            # the column space is exhausted below the cap, and behaviour rides
            # city_seq rather than the column index, so reuse stays order-safe.
            if int(self.alive[b].sum()) >= 6:
                continue  # razed at the seat city cap
            c_new = int(self.founded_n[b])
            if c_new >= self.C:
                free = (~self.alive[b]).nonzero(as_tuple=True)[0]
                if len(free) == 0:
                    continue  # razed: no slot at all
                c_new = int(free[0])
            else:
                self.founded_n[b] += 1
            self.alive[b, c_new] = True
            self.era_score[b, 0] += self._era_pts["conquer"]  # gained a city (the raze paths continue above)
            self.city_seq[b, c_new] = int(self.city_seq_next[b])
            self.city_seq_next[b] += 1
            self.is_cap[b, c_new] = False  # captured cities are never capitals (TS isCapital: false)
            self.site[b, c_new] = c_t
            # A captured city carries no banked production (TS pushes a fresh City literal); `prod_bank` is slot-indexed, so a reused slot must be cleared.
            self.prod_bank[b, c_new] = 0
            self.centre_slot_at[b, c_t] = c_new
            _take = ring & (self.tile_seat[b] == NO_SEAT)
            self.tile_city[b] = torch.where(_take, torch.full_like(self.tile_city[b], c_new), self.tile_city[b])
            self.tile_seat[b] = torch.where(_take, torch.zeros_like(self.tile_seat[b]), self.tile_seat[b])
            self.tile_city[b, c_t] = c_new
            self.tile_seat[b, c_t] = 0  # seat + which city: TS's setTileOwner pair
            self._tile_owner_ver += 1
            # Conquest KEEPS the captured city's COMPLETE districts: the tiles
            # re-own to c_new above and their district/complete planes are
            # untouched, so completed districts become live seat-0 districts
            # (captured wonders ride the shared built_wonder planes).
            # INCOMPLETE captured districts stay paved-but-dead — TS drops them
            # from the new city's districts array, so they must be excluded
            # from one-per-type / yields / availability here too.
            dead_ring = ring & (self.district[b] >= 0) & ~self.district_complete[b]
            dead_ring[c_t] = False  # the center is the new city's live CITY_CENTER
            self.district_dead[b] = self.district_dead[b] | dead_ring
            # CLEAR stale dead marks on re-owned COMPLETE district tiles. TS
            # derives the captured city's districts from tiles (complete =
            # listed = live), so a tile marked dead at an earlier
            # capture-while-incomplete that has since completed returns to life
            # with the new owner, maintenance and yields included.
            live_ring = ring & (self.district[b] >= 0) & self.district_complete[b]
            self.district_dead[b] = self.district_dead[b] & ~live_ring
            self.pop[b, c_new] = pop
            self.food_box[b, c_new] = 0.0
            self.culture_box[b, c_new] = 0.0
            # The conqueror INHERITS the great works. All five are written, so
            # a reused slot cannot leak the dead city's art/relics/artifacts.
            self.gw_writing[b, c_new] = int(self.rc_gw_writing[b, r, j])
            self.gw_art[b, c_new] = int(self.rc_gw_art[b, r, j])
            self.gw_music[b, c_new] = int(self.rc_gw_music[b, r, j])
            self.relics[b, c_new] = int(self.rc_relics[b, r, j])
            self.artifacts[b, c_new] = int(self.rc_artifacts[b, r, j])
            self.tiles_acquired[b, c_new] = int(self.rc_acquired[b, r, j]) if hasattr(self, "rc_acquired") else 0
            self.city_hp[b, c_new] = self.rules.combat.get("cityMaxHp", 200) // 2
            self.current[b, c_new] = -1
            # Slot hygiene: a reused slot must not leak a dead city's queue
            # progress/cost (TS starts queue = []).
            self.progress[b, c_new] = 0.0
            self.cur_cost[b, c_new] = 0.0
            self.q_dtile[b, c_new] = -1
            self.warrior_trained[b, c_new] = False
            # Inherit the civ city's buildings — the index spaces match, since
            # rc_bldg and buildings both key on the b_cost catalog (PALACE
            # excluded). ANCIENT_WALLS rides along at outer pool 0 and heals
            # back, because the heal gate reads the walls bit in this plane.
            self.buildings[b, c_new] = kept_bldg
            self.outer_hp[b, c_new] = 0  # walls (if any) kept at outer pool 0
            self.water_housing[b, c_new] = float(self.tile_wh[b, c_t])
            self.river_center[b, c_new] = bool(self.tile_river[b, c_t])
            self.dist[b, c_new] = self.pair_dist[c_t].to(self.dist.dtype)
            self.loyalty[b, c_new] = 100.0
            self._init_center_live(b, c_new, c_t)
            # The transfer tail: conquest plunders +40 gold, and the war ends
            # if it was the civ's last city. The raze path (`continue` above)
            # mirrors TS's early return — no gold, war state untouched.
            if plunder:  # loyalty defections transfer without the +40
                self.treasury[b] += 40.0
            if not bool(self.rc_alive[b, r].any()):
                self.r_atwar[b, r] = False
                # Elimination ends the war, so it settles like any other peace.
                _elim = torch.zeros(self.B, dtype=torch.bool, device=self.device)
                _elim[b] = True
                self._ww_peace(_elim, 0, r + 1)
                self.war[b, 0, 1 + r] = False
                self.war[b, 1 + r, 0] = False
        self._eff_version += 1

    def _capture_city_state(self, rows: torch.Tensor, cs_of: torch.Tensor) -> None:
        """Annex a city-state into seat 0's empire — the `captureCityState` twin.

        Territory within radius 2 whose csId matches transfers (owner set only
        where unclaimed), pop lands at x0.75 (min 1), and the new city starts
        at half HP with zero boxes and zero tilesAcquired. The seat city cap
        applies here too: a FULL empire (>= 6 live cities) RAZES the
        city-state instead of annexing it."""
        for i in range(len(rows)):
            b = int(rows[i]); s = int(cs_of[rows[i]])
            c_t = int(self.cs_center[b, s])
            pop = max(1, (int(self.cs_pop[b, s]) * 3) // 4)
            self.cs_alive[b, s] = False
            # Every civ seat's routes to this city-state die with it (TS
            # prunes each seat's tradeRoutes; dest encoding -(2+s)).
            dead_cs = self.r_routes[b, :, :, 1] == -(2 + s)  # [R, K]
            self.r_routes[b] = torch.where(dead_cs.unsqueeze(2), torch.full_like(self.r_routes[b], -1), self.r_routes[b])
            self.r_route_dest[b] = torch.where(dead_cs, torch.full_like(self.r_route_dest[b], -1), self.r_route_dest[b])
            self.r_route_exp[b] = torch.where(dead_cs, torch.full_like(self.r_route_exp[b], -1), self.r_route_exp[b])
            ring = (self.pair_dist[c_t] <= 2) & (self.tile_seat[b] == 100 + s)
            self.tile_seat[b] = torch.where(
                ring, torch.full_like(self.tile_seat[b], NO_SEAT), self.tile_seat[b]
            )  # city-state tile ownership lives in tile_seat
            self._tile_owner_ver += 1
            # Raze at the seat city cap: the CS dies and its ring frees, but
            # NO city is founded (TS early-returns before nextCityId++).
            if int(self.alive[b].sum()) >= 6:
                continue
            # Append at the founding HIGH-WATER mark, as in _capture_civ_city.
            c_new = int(self.founded_n[b])
            if c_new >= self.C:
                free = (~self.alive[b]).nonzero(as_tuple=True)[0]
                if len(free) == 0:
                    continue  # no slot: the CS still dies (see docstring)
                c_new = int(free[0])
            else:
                self.founded_n[b] += 1
            self.alive[b, c_new] = True
            self.era_score[b, 0] += self._era_pts["conquer"]  # gained a city (the raze paths continue above)
            self.city_seq[b, c_new] = int(self.city_seq_next[b])
            self.city_seq_next[b] += 1
            self.is_cap[b, c_new] = False  # captured cities are never capitals (TS isCapital: false)
            self.site[b, c_new] = c_t
            # A captured city carries no banked production (TS pushes a fresh City literal); `prod_bank` is slot-indexed, so a reused slot must be cleared.
            self.prod_bank[b, c_new] = 0
            self.centre_slot_at[b, c_t] = c_new
            _take = ring & (self.tile_seat[b] == NO_SEAT)
            self.tile_city[b] = torch.where(_take, torch.full_like(self.tile_city[b], c_new), self.tile_city[b])
            self.tile_seat[b] = torch.where(_take, torch.zeros_like(self.tile_seat[b]), self.tile_seat[b])
            self.tile_city[b, c_t] = c_new
            self.tile_seat[b, c_t] = 0  # seat + which city: TS's setTileOwner pair
            self._tile_owner_ver += 1
            self.pop[b, c_new] = pop
            self.food_box[b, c_new] = 0.0
            self.culture_box[b, c_new] = 0.0
            # A city-state holds no great works, so there is nothing to
            # inherit — but all five zero explicitly, so a reused slot cannot
            # serve the previous city's art/relics/artifacts.
            self.gw_writing[b, c_new] = 0
            self.gw_art[b, c_new] = 0
            self.gw_music[b, c_new] = 0
            self.relics[b, c_new] = 0
            self.artifacts[b, c_new] = 0
            self.tiles_acquired[b, c_new] = 0
            self.city_hp[b, c_new] = self.rules.combat.get("cityMaxHp", 200) // 2
            self.current[b, c_new] = -1
            # Full slot hygiene: a reused slot must not leak the dead city's
            # queue progress/cost into the fresh city (TS starts queue = []).
            self.progress[b, c_new] = 0.0
            self.cur_cost[b, c_new] = 0.0
            self.q_dtile[b, c_new] = -1
            self.warrior_trained[b, c_new] = False
            self.buildings[b, c_new] = False
            self.outer_hp[b, c_new] = 0  # no walls: the buildings plane was wiped
            self.water_housing[b, c_new] = float(self.tile_wh[b, c_t])
            self.river_center[b, c_new] = bool(self.tile_river[b, c_t])
            self.dist[b, c_new] = self.pair_dist[c_t].to(self.dist.dtype)
            self.loyalty[b, c_new] = 100.0
            self._init_center_live(b, c_new, c_t)
        self._eff_version += 1

    def _capture_city_state_seat(self, rows: torch.Tensor, cs_of: torch.Tensor, v: int) -> None:
        """Annex a city-state into a conquering civ seat — `captureCityStateFor`.

        Pop x0.75 floor 1, the ring-2 csId territory re-tags to the new rc,
        envoys die with the CS (cs_alive gates every consumer), the maxCities
        raze rule applies, routes are pruned with the endpoint. Append
        bookkeeping mirrors _transfer_city_to_civ: last-alive+1 slot (rc slot
        order is TS array order), full slot hygiene, id from r_next_city_id.
        """
        for i in range(len(rows)):
            b = int(rows[i]); s = int(cs_of[rows[i]])
            r = int(self.v_civ[b, v])
            c_t = int(self.cs_center[b, s])
            pop = max(1, (int(self.cs_pop[b, s]) * 3) // 4)
            self.cs_alive[b, s] = False
            # routes die with the city-state (every civ; dest encoded -(2+s))
            dead_cs = self.r_routes[b, :, :, 1] == -(2 + s)
            self.r_routes[b] = torch.where(dead_cs.unsqueeze(2), torch.full_like(self.r_routes[b], -1), self.r_routes[b])
            self.r_route_dest[b] = torch.where(dead_cs, torch.full_like(self.r_route_dest[b], -1), self.r_route_dest[b])
            self.r_route_exp[b] = torch.where(dead_cs, torch.full_like(self.r_route_exp[b], -1), self.r_route_exp[b])
            ring = (self.pair_dist[c_t] <= 2) & (self.tile_seat[b] == 100 + s)
            self.tile_seat[b] = torch.where(
                ring, torch.full_like(self.tile_seat[b], NO_SEAT), self.tile_seat[b]
            )  # city-state tile ownership lives in tile_seat
            self._tile_owner_ver += 1
            if int(self.rc_alive[b, r].sum()) >= int(self.rules.seats.get("maxCities", 6)):
                continue  # razed: the CS dies, its ring frees, NO city (TS early-return)
            alive_w = self.rc_alive[b, r].nonzero(as_tuple=True)[0]
            slot = int(alive_w.max()) + 1 if len(alive_w) else 0
            assert slot < self.RC, "civ city slots exhausted — raise RC (compaction already ran; this is true living capacity)"
            new_id = int(self.r_next_city_id[b, r])
            self.tile_seat[b] = torch.where(ring, torch.full_like(self.tile_seat[b], r + 1), self.tile_seat[b])  # civ tile ownership lives in tile_seat
            self._tile_owner_ver += 1
            self.tile_city[b] = torch.where(ring, torch.full_like(self.tile_city[b], new_id), self.tile_city[b])
            self.rc_alive[b, r, slot] = True
            self.era_score[b, r + 1] += self._era_pts["conquer"]  # gained a city (the raze path continues above)
            self.rc_is_cap[b, r, slot] = False
            self.rc_center[b, r, slot] = c_t
            self.rc_pop[b, r, slot] = pop
            self.rc_growth[b, r, slot] = 0
            self.rc_cbox[b, r, slot] = 0
            self.rc_gw_writing[b, r, slot] = 0  # a fresh civ city holds no great works
            self.rc_gw_music[b, r, slot] = 0
            self.rc_loyalty[b, r, slot] = 100.0
            self.rc_acquired[b, r, slot] = 0  # TS tilesAcquired: 0
            self.rc_hp[b, r, slot] = round(self.rules.seats.get("cityMaxHp", 200) / 2)
            self.rc_id[b, r, slot] = new_id
            self.rc_current[b, r, slot] = -1
            self.rc_progress[b, r, slot] = 0.0
            self.rc_cost[b, r, slot] = 0.0
            self.rc_qtile[b, r, slot] = -1
            self.rc_dist_tile[b, r, slot, :] = -1
            self.rc_wonder[b, r, slot, :] = -1
            self.rc_bldg[b, r, slot, :] = False
            self.r_next_city_id[b, r] += 1
            self.centre_slot_at[b, c_t] = slot
        self._eff_version += 1

    def _init_center_live(self, b: int, c_new: int, c_t: int) -> None:
        """Recompute a captured city's center yields from the LIVE tile.

        TS tileYieldsForCenter reads the tile fresh: raw tile yields,
        strip-adjusted, with food/production min-clamped. Settle sites use the
        precomputed site_cy instead; a captured centre was never a fixture
        site, so its slot must be filled here.
        """
        strip_c = float(self.feat_stripped[b, c_t])
        cy = (self.tile_yields[b, c_t].to(self.dtype) - self.feat_yields[b, c_t].to(self.dtype) * strip_c).clone()
        self.center_raw_food[b, c_new] = float(cy[0])  # pre-clamp (fertility/drought redo the clamp live)
        cy[0] = max(float(cy[0]), float(self.rules.center_min_food))
        cy[1] = max(float(cy[1]), float(self.rules.center_min_production))
        self.center_yields[b, c_new] = cy
        self.base_maintenance[b, c_new] = 0.0  # City Center 0 upkeep; no Palace, no buildings
        nb_c = self.neigh[c_t]
        self.coastal[b, c_new] = bool(self.coastal_water[b, nb_c.clamp(min=0)][nb_c >= 0].any())

    def _p_attack_civ_city(self, att: torch.Tensor, tgt: torch.Tensor, p: int) -> None:
        """Resolve seat 0's melee assault on a civ city.

        The shared battle in `_assault_civ_city`, then seat 0's own CAPTURE
        aftermath."""
        _r = self._assault_civ_city(att, tgt, "p", p)
        if _r is None:
            return
        rows, civ, slot, died, ttc = _r
        if bool(died.any()):
            dr = died.nonzero(as_tuple=True)[0]
            here_d = self.p_tile[dr, p]
            self._dig_at(dr, here_d)  # killUnit's dig
            self.occ_mil[(dr, here_d)] = -1
            self.p_alive[dr, p] = False
        # The capture fires even when the attacker DIED to the counter
        # (TS kills the unit before the city-hp check), so an attacker can
        # trade itself for the city — `died` must not gate this.
        cap = att
        cap_rows = cap.nonzero(as_tuple=True)[0]
        cap_rows = cap_rows[self.rc_hp[cap_rows, civ[cap_rows], slot[cap_rows]] <= 0]
        if len(cap_rows) > 0:
            self._capture_civ_city(cap_rows, civ[cap_rows], slot[cap_rows], ttc[cap_rows])

    def _strip_feature_at(self, rows: torch.Tensor, tiles: torch.Tensor) -> None:
        """Remove a removable feature physically.

        Marks feat_stripped and withdraws the adjacency the feature lent to
        its neighbours. The founding strip does the same inline, entangled
        with its tile-grab loop — keep the two twins in sync.

        IDEMPOTENT: TS `tile.feature = null` on an already-bare tile is a
        no-op, but the adjacency withdrawal below is CUMULATIVE, so a second
        strip of the same tile (queueDistrict paving a chopped tile) would
        double-subtract the lent adjacency.
        """
        fresh = ~self.feat_stripped[rows, tiles]
        if not bool(fresh.any()):
            return
        rows, tiles = rows[fresh], tiles[fresh]
        self.feat_stripped[rows, tiles] = True
        self.tdef[rows, tiles] = self.hills[rows, tiles].long() * 3  # a stripped feature no longer defends (TS terrainDefense reads live)
        self.tmove[rows, tiles] = self.hills[rows, tiles].long() * 3  # nor slows movement (hills-only cost)
        # TS builderRemoveFeature: chopping WOODS removes a LUMBER_MILL (it
        # requires woods), else a stale mill keeps +production on a bare tile.
        if self.LUMBER >= 0:
            lm = self.improvement[rows, tiles] == self.LUMBER
            if bool(lm.any()):
                self.improvement[rows[lm], tiles[lm]] = -1
            self.lumber_ok[rows, tiles] = False  # no WOODS -> no LUMBER_MILL buildable (TS gates on live tile.feature==='WOODS')
        # chopping the feature ENABLES farm/mine on the now-bare terrain (TS's
        # live gate) — switch the static masks to their post-chop variants.
        self.farm_flat[rows, tiles] = self._fa_f_c[rows, tiles]
        self.farm_hill[rows, tiles] = self._fa_h_c[rows, tiles]
        self.mine_ok[rows, tiles] = self._mi_c[rows, tiles]
        # Withdraw BOTH feature classes: every TS strip site that reaches this
        # function nulls ANY feature (queueDistrict paves a REEF too). A tile
        # has one feature, so exactly one of the two planes is nonzero.
        contrib = self._feat_adj[rows, tiles] + self._nfeat_adj[rows, tiles]
        nb = self.neigh[tiles]
        for d in range(6):
            n_d = nb[:, d]
            on_map = n_d >= 0
            if bool(on_map.any()):
                om = on_map.nonzero(as_tuple=True)[0]
                self.d_static_adj[rows[om], n_d[om], :] -= contrib[om]
        self._eff_version += 1

    def _withdraw_sea_adj(self, rows: torch.Tensor, tiles: torch.Tensor) -> None:
        """Withdraw the SEA_RESOURCE adjacency a paved-over water tile lent.

        SEA_RESOURCE adjacency is baked into d_static_adj, but TS reads the
        neighbour's resource LIVE (isWater(n) && n.resource !== null), so
        paving over a sea resource must take the adjacency back. The
        _strip_feature_at twin: callers pass only FRESH strips, because the
        subtraction is cumulative.
        """
        if not len(rows):
            return
        wet = self.water[rows, tiles]
        if not bool(wet.any()):
            return
        rows, tiles = rows[wet], tiles[wet]
        contrib = self._dyn_searesource.reshape(1, -1).expand(len(rows), -1)
        nb = self.neigh[tiles]
        for d in range(6):
            n_d = nb[:, d]
            on_map = n_d >= 0
            if bool(on_map.any()):
                om = on_map.nonzero(as_tuple=True)[0]
                self.d_static_adj[rows[om], n_d[om], :] -= contrib[om]
        self._eff_version += 1

    def _apply_unit_actions(self, actions: torch.Tensor) -> None:
        """Execute seat 0's unit orders in slot (= spawn) order.

        Orders resolve one by one before the turn ends. Combat draws from the
        shared RNG, so this order is part of the parity contract.
        """
        p_high = int(self.p_next.max().item())
        # Iterate the slots alive in SOME game at loop top, ascending. Nothing
        # spawns seat-0 units in here and deaths only shrink the set, so the
        # snapshot is a superset: a slot that dies in ALL games mid-loop
        # no-ops through the body, since every mutation and every
        # _damage_roll sits under a mask ⊆ alive with its own any() guard.
        # Additionally require a non-HOLD (12), valid (>=0) order in some
        # game. A slot HOLD/invalid in EVERY game runs a fully masked no-op:
        # every mutation mask (civk/siege/att/r_att/r_civ/cs_hit/r_sieg/r_cs/
        # ok_c/bld/mv/ok) carries (a in 6..11)/(a==16)/(a in 13..15)/(a in 0..5)
        # and is all-False; the single unconditional spend (att|r_att -> mp 0)
        # is |False; and every _damage_roll sits inside an if-any block keyed
        # on one of those masks, so a HOLD unit draws no RNG — the skip is
        # exact and draw-count-neutral.
        if p_high:
            live_any = self.p_alive[:, :p_high].any(dim=0)
            ord_any = ((actions[:, :p_high] != 12) & (actions[:, :p_high] >= 0)).any(dim=0)
            p_live = (live_any & ord_any).nonzero(as_tuple=True)[0].tolist()
        else:
            p_live = []
        for p in p_live:
            a = actions[:, p].to(torch.long)
            alive = self.p_alive[:, p]
            here = self.p_tile[:, p]
            nb = self.neigh[here.clamp(min=0)]  # [B, 6]
            # This attacker's veterancy bonus (pre-attack xp), added to every
            # atk CS assembly below; xp itself accrues at the loop-body end.
            p_lvl5 = self._xp_lvl_bonus(self.p_xp[:, p])

            # --- FOUND_CITY: a settler founds where it stands, consumed —
            if getattr(self, "_A_FOUND", -1) >= 0 and self._settler_idx >= 0:
                fnd = alive & (a == self._A_FOUND) & (self.p_type[:, p] == self._settler_idx)
                if bool(fnd.any()):
                    made_f = self._found_c_at(fnd, here)
                    if bool(made_f.any()):
                        rows_f = made_f.nonzero(as_tuple=True)[0]
                        self.occ_civ[rows_f, self.p_tile[rows_f, p]] = -1
                        self.p_alive[rows_f, p] = False

            # --- melee attack (6..11): a barbarian or an at-war civ unit -----
            dirs = (a - 6).clamp(min=0, max=5)
            tgt = nb.gather(1, dirs.unsqueeze(1)).squeeze(1)
            tc = tgt.clamp(min=0)
            # The tile's military occupant, split back into the pool-local
            # slots the death table addresses.
            _tm = self.occ_mil.gather(1, tc.unsqueeze(1)).squeeze(1)
            _tms = torch.where(_tm >= 0, self.unit_seat.gather(1, _tm.clamp(min=0).unsqueeze(1)).squeeze(1), torch.full_like(_tm, -1))
            bslot = torch.where(_tms == BARB_SEAT, _tm - self.POOL_LO["u"], torch.full_like(_tm, -1))
            vslot = torch.where((_tms > 0) & (_tms != BARB_SEAT), _tm - self.POOL_LO["v"], torch.full_like(_tm, -1))
            v_civ = (torch.where(vslot >= 0, _tms - 1, torch.zeros_like(_tms))).clamp(min=0, max=max(self.R - 1, 0))
            v_ok = (vslot >= 0) & self.r_atwar.gather(1, v_civ.unsqueeze(1)).squeeze(1)
            rc_civ_t = self.rc_at.gather(1, tc.unsqueeze(1)).squeeze(1)
            rc_ok = (rc_civ_t >= 0) & self.r_atwar.gather(1, rc_civ_t.clamp(min=0).clamp(max=max(self.R - 1, 0)).unsqueeze(1)).squeeze(1)
            _tc_ = self.occ_civ.gather(1, tc.unsqueeze(1)).squeeze(1)
            _tcs = torch.where(_tc_ >= 0, self.unit_seat.gather(1, _tc_.clamp(min=0).unsqueeze(1)).squeeze(1), torch.full_like(_tc_, -1))
            rvc_slot_t = torch.where((_tcs > 0) & (_tcs != BARB_SEAT), _tc_ - self.POOL_LO["v"], torch.full_like(_tc_, -1))
            rvc_civ_t = (torch.where(rvc_slot_t >= 0, _tcs - 1, torch.zeros_like(_tcs))).clamp(min=0, max=max(self.R - 1, 0))
            rvc_ok = (rvc_slot_t >= 0) & self.r_atwar.gather(1, rvc_civ_t.unsqueeze(1)).squeeze(1)
            if self._rl_ranged_active:
                rngd = self._p_rng_str[self.p_type[:, p]] > 0
            else:
                rngd = torch.zeros_like(alive)
            # CITY-FIRST for seat 0's own attacks — the third dispatch
            # surface. `cs_s`/`cs_sc` are hoisted here because the branches
            # below all need them.
            cs_s = self.cs_at.gather(1, tc.unsqueeze(1)).squeeze(1)
            cs_sc = cs_s.clamp(min=0)
            cs_here = (
                (cs_s >= 0)
                & (self.cs_center.gather(1, cs_sc.unsqueeze(1)).squeeze(1) == tgt)
                & self.cs_alive.gather(1, cs_sc.unsqueeze(1)).squeeze(1)
                # A city-state is a separate seat you must DECLARE on:
                # `meleeAttack`'s csTarget is undefined unless the minor is at
                # war. The term belongs on `cs_here`, not on `cs_hit`, because
                # `cs_here` also feeds `city_here` — at peace the centre must
                # stop being a city for CITY-FIRST too, so the melee branch
                # takes the garrison instead.
                & self.cs_atwar.gather(1, cs_sc.unsqueeze(1)).squeeze(1)
            )
            city_here = rc_ok | cs_here
            garrisoned = (bslot >= 0) | v_ok
            # TS meleeAttack: units ON the tile take the hit FIRST. A lone
            # hostile CIVILIAN is taken ROLL-FREE, and the city underneath is
            # NOT besieged through its occupant.
            civk = alive & (a >= 6) & (a < 12) & (tgt >= 0) & (bslot < 0) & ~v_ok & rvc_ok & (self._p_combat[self.p_type[:, p]] > 0) & ~rngd
            if bool(civk.any()):
                # A melee on a lone civ civilian CAPTURES it: roll-free
                # (draw-count neutral), the attacker spends its attack but
                # does NOT advance (single-occupancy model). Pool TRANSFER —
                # despawn from the civ v_* pool, append to the seat-0 p_* pool
                # in spawn order (last-alive+1) with hp and charges carried;
                # movesLeft = 0, so the heal skips it this turn.
                kr = civk.nonzero(as_tuple=True)[0]
                ks = rvc_slot_t[kr]
                ct = tc[kr]
                self.v_alive[kr, ks] = False
                nslot = self.p_next[kr]
                assert int(nslot.max()) < simbase.P_MAX, "p slot pool exhausted — raise simbase.P_MAX"
                self.p_alive[kr, nslot] = True
                self.p_tile[kr, nslot] = ct
                self.p_seat[kr, nslot] = 0
                self._carry_capture(kr, ks + self.POOL_LO["v"], nslot + self.POOL_LO["p"])
                self.occ_civ[(kr, ct)] = nslot + self.POOL_LO["p"]
                self.p_next[kr] += 1
                self._gen_ver += 1  # the captured civilian may be a general (owner flip) → invalidate the aura plane
                self.p_mp[:, p] = torch.where(civk, torch.zeros_like(self.p_mp[:, p]), self.p_mp[:, p])  # the turn is spent (TS movesLeft = 0)
            # TS cityFirst = enemies.length == 0 || enemies.some(military): a
            # hostile CIVILIAN shields the city only when it is ALONE (civk
            # captures it); a military garrison puts the CITY first, civilian
            # or not. Both terms are needed, or a garrison+civilian centre
            # lands in no arm at all.
            city_first = ~rvc_ok | garrisoned
            siege = alive & (a >= 6) & (a < 12) & (tgt >= 0) & city_first & rc_ok & (self._p_combat[self.p_type[:, p]] > 0) & (self._p_rng_str[self.p_type[:, p]] == 0)
            if bool(siege.any()):
                self._p_attack_civ_city(siege, tgt, p)
                self.p_mp[:, p] = torch.where(siege, torch.zeros_like(self.p_mp[:, p]), self.p_mp[:, p])  # the turn is spent (TS movesLeft = 0)
            # A LIVE enemy Encampment on the target tile is assaulted
            # (meleeAttack's encamp arm). Requires the tile to hold no unit
            # and no civ city — the TS precedence — and a MELEE attacker.
            if self._encamp_didx >= 0:
                enc_ok = self._encamp_block(tc.unsqueeze(1), 0).squeeze(1)
                enc_att = (
                    alive
                    & (a >= 6)
                    & (a < 12)
                    & (tgt >= 0)
                    & (bslot < 0)
                    & ~v_ok
                    & ~rvc_ok
                    & ~rc_ok
                    & enc_ok
                    & (self._p_combat[self.p_type[:, p]] > 0)
                    & (self._p_rng_str[self.p_type[:, p]] == 0)
                )
                if bool(enc_att.any()):
                    self._attack_encampment(enc_att, tc, "p", p)
                    self.p_mp[:, p] = torch.where(enc_att, torch.zeros_like(self.p_mp[:, p]), self.p_mp[:, p])  # the turn is spent (TS movesLeft = 0)
            att = alive & (a >= 6) & (a < 12) & (tgt >= 0) & garrisoned & ~city_here & (self._p_combat[self.p_type[:, p]] > 0)
            # Ranged units strike instead of meleeing (rangedAttack — one
            # roll, no retaliation, no advance). Legality is the same
            # adjacent-hostile condition, so the mask above is shared.
            r_att = att & rngd
            att = att & ~rngd
            if bool(att.any()):
                is_b = bslot >= 0
                atk_cs = self._p_combat[self.p_type[:, p]]
                b_cs = self._p_combat[self.u_type.gather(1, bslot.clamp(min=0).unsqueeze(1)).squeeze(1)]
                v_cs = self._p_combat[self.v_type.gather(1, vslot.clamp(min=0).unsqueeze(1)).squeeze(1)]
                b_fy = self.u_fortify.gather(1, bslot.clamp(min=0).unsqueeze(1)).squeeze(1)
                v_fy = self.v_fortify.gather(1, vslot.clamp(min=0).unsqueeze(1)).squeeze(1)
                # A civ defender's veterancy (barbarians have no xp), folded
                # into the base def_cs so the embarked override below drops it
                # along with support, exactly as TS defenderCS does.
                v_lvl5 = torch.where(is_b, torch.zeros_like(is_b, dtype=torch.long), self._xp_lvl_bonus(self.v_xp.gather(1, vslot.clamp(min=0).unsqueeze(1)).squeeze(1)))
                def_cs = torch.where(is_b, b_cs, v_cs) + self._tdef_g(tc) + torch.where(is_b, b_fy, v_fy) * 3 + v_lvl5
                # An EMBARKED civ defender overrides to a flat CS — no
                # terrain/fortify (and no support below); barbarians never embark.
                v_embd = self.v_emb.gather(1, vslot.clamp(min=0).unsqueeze(1)).squeeze(1) & ~is_b
                def_cs = torch.where(v_embd, torch.full_like(def_cs, self._embarked_defense_cs), def_cs)
                # Attacker AND defender fight at HP-reduced strength.
                b_hp = self.u_hp.gather(1, bslot.clamp(min=0).unsqueeze(1)).squeeze(1)
                v_hpd = self.v_hp.gather(1, vslot.clamp(min=0).unsqueeze(1)).squeeze(1)
                atk_e = atk_cs - self._wound(self.p_hp[:, p]) - 5.0 * self._river_cross(here, tgt) + p_lvl5  # river crossing + attacker veterancy
                def_e = def_cs - self._wound(torch.where(is_b, b_hp, v_hpd))
                # Flanking helps the attacker, support helps the defender
                # (barbarian or at-war civ). Applied once, so both paired rolls
                # see the same adjusted CS; an embarked defender gets NO
                # support.
                _fl, _sp = self._flank_support(tgt, torch.where(is_b, torch.full_like(v_civ, BARB_SEAT), v_civ + 1), here)
                atk_e = atk_e + FLANKING_CS * _fl
                def_e = def_e + SUPPORT_CS * torch.where(v_embd, torch.zeros_like(_sp), _sp)
                # Religious enhancer defender adders, for CIV defenders only
                # (barbarians carry none; embarked takes the flat override, no
                # term; the seat-0 attacker term is structurally 0).
                def_e = def_e + torch.where(v_embd, torch.zeros_like(def_e), self._rel_def_cs(torch.where(is_b, torch.full_like(v_civ, -1), v_civ), tgt).to(def_e.dtype))
                # Great General/Admiral aura. Seat 0's attacker is keyed on
                # `here`; a civ defender (v_civ+1) on `tgt` (barbarian → no
                # aura). Embarked/naval select the ADMIRAL plane, added on top
                # of the embarked defender's flat CS, as generalAuraCS does.
                atk_naval = self.unit_naval[self.p_type[:, p].clamp(min=0, max=self.NU - 1)] | self.p_emb[:, p]
                atk_e = atk_e + self._gen_aura_cs(torch.zeros_like(v_civ), here, atk_naval).to(atk_e.dtype)
                _v_def_nav = self.unit_naval[self.v_type.gather(1, vslot.clamp(min=0).unsqueeze(1)).squeeze(1).clamp(min=0, max=self.NU - 1)]
                def_naval = v_embd | torch.where(is_b, torch.zeros_like(v_embd), _v_def_nav)
                def_civ_u = torch.where(is_b, torch.full_like(v_civ, -1), v_civ + 1)
                def_e = def_e + self._gen_aura_cs(def_civ_u, tgt, def_naval).to(def_e.dtype)
                # Sample the defender BEFORE the rolls: once a death clears
                # `occ_mil` the tile reads NO_SEAT, and the war-weariness hook
                # would score every kill as nothing.
                _wwp, _wwps = self._ww_occ(tgt), self._tile_mil_seat(tgt)
                # the defender's MERGED slot, whichever pool it lives in
                _dsl = torch.where(is_b, bslot + self.POOL_LO["u"], vslot + self.POOL_LO["v"])
                rows, def_dead, atk_dead = self._melee_exchange(
                    att, tgt, tc, _dsl, ~is_b, self.p_hp, p, atk_e, def_e)
                # ONE battle, scored for both sides — before the advance moves
                # anybody and before the tile can change hands.
                self._ww_battle(att, self._row_of(self.p_seat[:, p]),
                                self._row_of(_wwps), tgt,
                                a_died=atk_dead, d_died=(_wwp & ~self._ww_occ(tgt)) != 0)
                if bool(atk_dead.any()):
                    ar = atk_dead.nonzero(as_tuple=True)[0]
                    self._dig_at(ar, here[ar])  # killUnit's dig
                    self.occ_mil[(ar, here[ar])] = -1
                    self.p_alive[:, p] = self.p_alive[:, p] & ~atk_dead
                # Advance into the freed tile (and clear any camp there).
                # tileFreeForUnit's TERRAIN check applies: a LAND unit may not
                # advance onto a WATER tile, e.g. where an embarked enemy was
                # just killed. `_blocked_for` only checks occupancy, so the
                # passable plane is tested separately. Seat 0 builds no naval
                # (production_mask excludes it), so the land plane is exact.
                adv_terr = self.passable.gather(1, tgt.clamp(min=0).unsqueeze(1)).squeeze(1)
                adv = def_dead & ~atk_dead & ~self._blocked_for(tgt.unsqueeze(1), 0).squeeze(1) & adv_terr
                if bool(adv.any()):
                    vr = adv.nonzero(as_tuple=True)[0]
                    self.occ_mil[(vr, here[vr])] = -1
                    self.p_tile[vr, p] = tgt[vr]
                    self.occ_mil[(vr, tgt[vr])] = p
                    self._clear_camp_at(adv, tgt)

            # --- ranged strike (same codes 6..11 for ranged units): mirrors
            # rangedAttack — ONE damage roll against the defender (combat +
            # terrain defense), no retaliation, no advance, no camp clear; the
            # attacker never moves or takes damage.
            if bool(r_att.any()):
                is_b = bslot >= 0
                atk_rs = self._p_rng_str[self.p_type[:, p]]
                b_cs = self._p_combat[self.u_type.gather(1, bslot.clamp(min=0).unsqueeze(1)).squeeze(1)]
                v_cs = self._p_combat[self.v_type.gather(1, vslot.clamp(min=0).unsqueeze(1)).squeeze(1)]
                b_fy = self.u_fortify.gather(1, bslot.clamp(min=0).unsqueeze(1)).squeeze(1)
                v_fy = self.v_fortify.gather(1, vslot.clamp(min=0).unsqueeze(1)).squeeze(1)
                # Civ defender veterancy (barbarians none), dropped by the
                # embarked override below along with support.
                v_lvl5 = torch.where(is_b, torch.zeros_like(is_b, dtype=torch.long), self._xp_lvl_bonus(self.v_xp.gather(1, vslot.clamp(min=0).unsqueeze(1)).squeeze(1)))
                def_cs = torch.where(is_b, b_cs, v_cs) + self._tdef_g(tc) + torch.where(is_b, b_fy, v_fy) * 3 + v_lvl5
                # embarked civ defender → flat CS, no terrain/support
                v_embd = self.v_emb.gather(1, vslot.clamp(min=0).unsqueeze(1)).squeeze(1) & ~is_b
                def_cs = torch.where(v_embd, torch.full_like(def_cs, self._embarked_defense_cs), def_cs)
                # ranged attacker + defender wounded (no river term for ranged)
                b_hp = self.u_hp.gather(1, bslot.clamp(min=0).unsqueeze(1)).squeeze(1)
                v_hpd = self.v_hp.gather(1, vslot.clamp(min=0).unsqueeze(1)).squeeze(1)
                atk_e = atk_rs - self._wound(self.p_hp[:, p]) + p_lvl5  # attacker veterancy
                def_e = def_cs - self._wound(torch.where(is_b, b_hp, v_hpd))
                # support only (no flanking: a ranged attacker takes no retaliation)
                _, _sp = self._flank_support(tgt, torch.where(is_b, torch.full_like(v_civ, BARB_SEAT), v_civ + 1), torch.full_like(tgt, -1))
                def_e = def_e + SUPPORT_CS * torch.where(v_embd, torch.zeros_like(_sp), _sp)
                # civ-defender enhancer adders (embarked = flat, none)
                def_e = def_e + torch.where(v_embd, torch.zeros_like(def_e), self._rel_def_cs(torch.where(is_b, torch.full_like(v_civ, -1), v_civ), tgt).to(def_e.dtype))
                # Aura: seat 0's attacker keyed on its own tile; a civ defender
                # (v_civ+1) on `tgt` (barbarian → none). Naval/embarked take the
                # ADMIRAL plane.
                atk_naval = self.unit_naval[self.p_type[:, p].clamp(min=0, max=self.NU - 1)] | self.p_emb[:, p]
                atk_e = atk_e + self._gen_aura_cs(torch.zeros_like(v_civ), self.p_tile[:, p], atk_naval).to(atk_e.dtype)
                _v_def_nav = self.unit_naval[self.v_type.gather(1, vslot.clamp(min=0).unsqueeze(1)).squeeze(1).clamp(min=0, max=self.NU - 1)]
                def_naval = v_embd | torch.where(is_b, torch.zeros_like(v_embd), _v_def_nav)
                def_e = def_e + self._gen_aura_cs(torch.where(is_b, torch.full_like(v_civ, -1), v_civ + 1), tgt, def_naval).to(def_e.dtype)
                _wwr = (self._ww_occ(tgt), self._tile_mil_seat(tgt))
                d_def = self._damage_roll(r_att, atk_e - def_e, k="rng", tile=tgt)
                rows = r_att.nonzero(as_tuple=True)[0]
                r_def_dead = torch.zeros_like(r_att)
                # One merged write: the merged slot already says which pool the
                # defender lives in, and only one military occupant can stand
                # on the tile, so clearing it is branch-free and exact.
                if len(rows) > 0:
                    _lo = torch.where(is_b, torch.full_like(bslot, self.POOL_LO["u"]), torch.full_like(bslot, self.POOL_LO["v"]))
                    _ds = (torch.where(is_b, bslot, vslot) + _lo)[rows]
                    self.unit_hp[rows, _ds] -= d_def[rows]
                    _dead = self.unit_hp[rows, _ds] <= 0
                    r_def_dead[rows[_dead]] = True
                    _gd, _td = rows[_dead], tc[rows[_dead]]
                    self._dig_at(_gd, _td)  # killUnit's dig
                    self.unit_alive[_gd, _ds[_dead]] = False
                    self.occ_mil[_gd, _td] = -1
                # A surviving civ MILITARY defender earns defence xp. The
                # war-weariness multiplier comes off the TARGET tile, not the
                # one the archer stands on — that holds for ranged too.
                self._ww_battle(r_att, self._row_of(self.p_seat[:, p]),
                                self._row_of(_wwr[1]), tgt,
                                d_died=(_wwr[0] & ~self._ww_occ(tgt)) != 0)
                surv_rv = (r_att & ~is_b & ~r_def_dead).nonzero(as_tuple=True)[0]
                if len(surv_rv) > 0:
                    self.unit_xp[surv_rv, vslot[surv_rv] + self.POOL_LO["v"]] += XP_DEFEND
            # Any fight spends the attacker's MP (att|r_att is the original
            # validated attack set — both branches always execute).
            self.p_mp[:, p] = torch.where(att | r_att, torch.zeros_like(self.p_mp[:, p]), self.p_mp[:, p])  # the turn is spent (TS movesLeft = 0)

            # TS rangedAttack with no military defender falls back to
            # enemies[0]: the CIVILIAN takes a damage ROLL (combat 0 + terrain
            # defense) and dies at 0; no retaliation, no advance.
            r_civ = alive & (a >= 6) & (a < 12) & (tgt >= 0) & (bslot < 0) & ~v_ok & rvc_ok & (self._p_combat[self.p_type[:, p]] > 0) & rngd
            if bool(r_civ.any()):
                atk_rs = self._p_rng_str[self.p_type[:, p]]
                def_cs = self._tdef_g(tc).to(atk_rs.dtype)  # civilian combat 0 + terrain
                # An embarked lone civilian defends at the flat CS: TS
                # defenderCS applies the override to any defender.
                civ_embd = self.v_emb.gather(1, rvc_slot_t.clamp(min=0).unsqueeze(1)).squeeze(1)
                def_cs = torch.where(civ_embd, torch.full_like(def_cs, self._embarked_defense_cs), def_cs)
                # Attacker and the lone civilian defender are both wounded; the
                # civilian never fights, so it carries no veterancy term.
                civ_hp = self.v_hp.gather(1, rvc_slot_t.clamp(min=0).unsqueeze(1)).squeeze(1)
                atk_e = atk_rs - self._wound(self.p_hp[:, p]) + p_lvl5  # attacker veterancy
                def_e = def_cs - self._wound(civ_hp)
                # The lone civilian is aided by adjacent same-civ military (no
                # flanking on a ranged strike); embarked receives NO support.
                _, _sp = self._flank_support(tgt, rvc_civ_t + 1, torch.full_like(tgt, -1))
                def_e = def_e + SUPPORT_CS * torch.where(civ_embd, torch.zeros_like(_sp), _sp)
                # A civilian defender takes the enhancer defender adders too
                # (TS defenderCS applies to any unit).
                def_e = def_e + torch.where(civ_embd, torch.zeros_like(def_e), self._rel_def_cs(rvc_civ_t, tgt).to(def_e.dtype))
                # Attacker aura only: the defender is a CIVILIAN (combat 0) and
                # generalAuraCS returns 0 for civilians.
                atk_naval = self.unit_naval[self.p_type[:, p].clamp(min=0, max=self.NU - 1)] | self.p_emb[:, p]
                atk_e = atk_e + self._gen_aura_cs(torch.zeros(self.B, dtype=torch.long, device=self.device), self.p_tile[:, p], atk_naval).to(atk_e.dtype)
                _wwc = (self._ww_occ(tgt), self._tile_civ_seat(tgt))
                d_def = self._damage_roll(r_civ, atk_e - def_e, k="rng", tile=tgt)
                rows = r_civ.nonzero(as_tuple=True)[0]
                ks = rvc_slot_t[rows]
                self.v_hp[rows, ks] -= d_def[rows]
                dead = self.v_hp[rows, ks] <= 0
                self._dig_at(rows[dead], tc[rows[dead]])  # killUnit's dig
                self.v_alive[rows[dead], ks[dead]] = False
                self.occ_civ[(rows[dead], tc[rows[dead]])] = -1
                self._ww_battle(r_civ, self._row_of(self.p_seat[:, p]),
                                self._row_of(_wwc[1]), tgt,
                                d_died=(_wwc[0] & ~self._ww_occ(tgt)) != 0)
                if bool(dead.any()):
                    self._gen_ver += 1  # the killed civilian may be a general → invalidate the aura plane
                self.p_mp[:, p] = torch.where(r_civ, torch.zeros_like(self.p_mp[:, p]), self.p_mp[:, p])  # the turn is spent (TS movesLeft = 0)

            # --- melee vs a CITY-STATE CENTER — meleeAttack's csTarget
            # fallback: fires only when no hostile unit holds the tile and it
            # is not a civ city (TS branch precedence). defCS = 15 + pop
            # (+6 militaristic), CS-damage roll then the counter, in that draw
            # order; the attacker is consumed and does NOT advance; capture at
            # 0 HP. Ranged bombardment has its own branches below: one roll,
            # floor 1 HP, no capture.
            cs_hit = (
                alive & (a >= 6) & (a < 12) & (tgt >= 0)
                & city_first & (rc_civ_t < 0) & cs_here  # city-first (garrison does not shield; lone civilian does)
                & (self._p_combat[self.p_type[:, p]] > 0) & ~rngd
            )
            _csr = self._assault_city_state(cs_hit, cs_sc, tgt, "p", p)
            if _csr is not None:
                rows, atk_dead, cap = _csr
                if bool(cap.any()):
                    self._capture_city_state(cap.nonzero(as_tuple=True)[0], cs_sc)
                self.p_mp[:, p] = torch.where(cs_hit, torch.zeros_like(self.p_mp[:, p]), self.p_mp[:, p])  # the turn is spent (TS movesLeft = 0)

            # --- ranged BOMBARDMENT of cities (rangedAttack's city fallback):
            # one roll against the city defense, no retaliation, HP floors at
            # 1 (ranged never captures; melee finishes).
            r_sieg = alive & (a >= 6) & (a < 12) & (tgt >= 0) & city_first & rc_ok & (self._p_combat[self.p_type[:, p]] > 0) & rngd  # rangedAttackInner shares the exact cityFirst rule
            if bool(r_sieg.any()):
                bidx2 = torch.arange(self.B, device=self.device)
                civ2 = rc_civ_t.clamp(min=0)
                slot2 = torch.zeros_like(civ2)
                for j2 in range(self.RC):
                    hit2 = (self.rc_center[bidx2, civ2, j2] == tc) & self.rc_alive[bidx2, civ2, j2]
                    slot2 = torch.where(r_sieg & hit2, torch.full_like(slot2, j2), slot2)
                best_r2 = self.r_best_melee[bidx2, civ2]
                # the city owner's OWN military on the centre tile
                gslot2 = self.occ_mil.gather(1, tc.unsqueeze(1)).squeeze(1)
                gar2 = ((gslot2 >= 0) & (self.unit_seat[bidx2, gslot2.clamp(min=0)] == civ2 + 1)).long()
                def_cs2 = torch.maximum(best_r2, torch.full_like(best_r2, 15)) + gar2 * 5
                atk_e2 = self._p_rng_str[self.p_type[:, p]] - self._wound(self.p_hp[:, p]) + p_lvl5  # wound (the city is not a unit) + veterancy
                # The general/admiral aura covers ranged bombardment of a civ
                # city too (the 'rngrc' roll). Seat 0 keys on civ 0;
                # naval/embarked select the ADMIRAL plane.
                _rngrc_nav = self.unit_naval[self.p_type[:, p].clamp(min=0, max=self.NU - 1)] | self.p_emb[:, p]
                atk_e2 = atk_e2 + self._gen_aura_cs(
                    torch.zeros(self.B, dtype=torch.long, device=self.device), self.p_tile[:, p], _rngrc_nav
                ).to(atk_e2.dtype)
                d_city2 = self._damage_roll(r_sieg, atk_e2 - def_cs2, k="rngrc", tile=tgt)
                self._ww_battle(r_sieg, self._row_of(self.p_seat[:, p]),
                                self._row_of(civ2 + 1), tgt, city=True)
                rows2 = r_sieg.nonzero(as_tuple=True)[0]
                self.rc_hp[rows2, civ2[rows2], slot2[rows2]] = torch.maximum(
                    self.rc_hp[rows2, civ2[rows2], slot2[rows2]] - d_city2[rows2],
                    torch.ones_like(d_city2[rows2]),
                )
                self.p_mp[:, p] = torch.where(r_sieg, torch.zeros_like(self.p_mp[:, p]), self.p_mp[:, p])  # the turn is spent (TS movesLeft = 0)
            r_cs = (
                alive & (a >= 6) & (a < 12) & (tgt >= 0)
                & city_first & (rc_civ_t < 0) & cs_here  # city-first (garrison does not shield; lone civilian does)
                & (self._p_combat[self.p_type[:, p]] > 0) & rngd
            )
            if bool(r_cs.any()):
                mil_idx2 = int(self.rules.cs.get("militaristicIdx", -1))
                def_cs3 = (
                    15 + self.cs_pop.gather(1, cs_sc.unsqueeze(1)).squeeze(1)
                    + (self.cs_type.gather(1, cs_sc.unsqueeze(1)).squeeze(1) == mil_idx2).long() * 6
                )
                atk_e3 = self._p_rng_str[self.p_type[:, p]] - self._wound(self.p_hp[:, p]) + p_lvl5  # wound (the CS centre is not a unit) + veterancy
                # Aura inside the ranged-strength parentheses, after
                # xpLevelBonus (rangedAttack's city-state branch).
                atk_naval = self.unit_naval[self.p_type[:, p].clamp(min=0, max=self.NU - 1)] | self.p_emb[:, p]
                atk_e3 = atk_e3 + self._gen_aura_cs(torch.zeros_like(here), self.p_tile[:, p], atk_naval).to(atk_e3.dtype)
                d_cs3 = self._damage_roll(r_cs, atk_e3 - def_cs3, k="rngcs", tile=tgt)
                self._ww_battle(r_cs, self._row_of(self.p_seat[:, p]),
                                self._row_of(100 + cs_sc), tgt, city=True)
                rows3 = r_cs.nonzero(as_tuple=True)[0]
                self.cs_hp[rows3, cs_sc[rows3]] = torch.maximum(
                    self.cs_hp[rows3, cs_sc[rows3]] - d_cs3[rows3],
                    torch.ones_like(d_cs3[rows3]),
                )
                self.p_mp[:, p] = torch.where(r_cs, torch.zeros_like(self.p_mp[:, p]), self.p_mp[:, p])  # the turn is spent (TS movesLeft = 0)

            # The attacker earns attack xp for ANY attack in this iteration
            # that produced a damage roll (melee vs unit, ranged vs
            # unit/civilian, city-state melee, civ-city/CS bombardment, and
            # the civ-city siege). The roll-free civilian CAPTURE (civk) grants
            # none. Seat-0 units are never barbarian, so this is unconditional.
            p_attacked = att | r_att | r_civ | cs_hit | r_sieg | r_cs | siege
            self.p_xp[:, p] = torch.where(p_attacked, self.p_xp[:, p] + XP_ATTACK, self.p_xp[:, p])

            # --- build FARM/MINE/LUMBER_MILL (13/14/15): a builder on a tile
            # where that improvement is valid. No RNG, re-validated at
            # execution (an earlier unit may have taken the tile or spent the
            # state), so an invalid build is a no-op — builderImprove fails
            # soft the same way. Each row's action is one value, so at most one
            # improvement builds per unit (charges spend once).
            # --- chop (16): a builder on a removable-feature tile whose
            # removal tech is in — builderRemoveFeature exactly:
            # canRemoveFeature has NO ownership test (the grant checks the
            # owner itself), the LUMBER_MILL dies with its WOODS, the lump
            # goes food -> foodBox / production -> head progress (bank when
            # idle), and the charge spends (disband at 0).
            if self._builder_idx >= 0:
                hc0 = here.clamp(min=0)
                ftr_t = self.tile_ftr.gather(1, hc0.unsqueeze(1)).squeeze(1)
                # PILLAGE — the seatPillage twin. Improvement first, else a
                # complete non-centre district; PILLAGE_HEAL improvements heal
                # +25; the turn is spent.
                _rvp = self.civ_at.gather(1, hc0.unsqueeze(1)).squeeze(1)
                _en = ((_rvp >= 0) & self.r_atwar.gather(1, _rvp.clamp(min=0).unsqueeze(1)).squeeze(1)) | (
                    self.cs_at.gather(1, hc0.unsqueeze(1)).squeeze(1) >= 0
                )
                _hi = (self.improvement.gather(1, hc0.unsqueeze(1)).squeeze(1) >= 0) & ~self.pillaged.gather(1, hc0.unsqueeze(1)).squeeze(1)
                _hd = (
                    (self.district.gather(1, hc0.unsqueeze(1)).squeeze(1) >= 0)
                    & self.district_complete.gather(1, hc0.unsqueeze(1)).squeeze(1)
                    & ~self.district_pillaged.gather(1, hc0.unsqueeze(1)).squeeze(1)
                    & (self.center_at.gather(1, hc0.unsqueeze(1)).squeeze(1) < 0)
                    & (self.rc_at.gather(1, hc0.unsqueeze(1)).squeeze(1) < 0)
                )
                ok_pl = (a == self._A_PILLAGE) & self.p_alive[:, p] & (self._p_combat[self.p_type[:, p]] > 0) & _en & (_hi | _hd)
                if bool(ok_pl.any()):
                    _pi = ok_pl & _hi
                    if bool(_pi.any()):
                        _r3 = _pi.nonzero(as_tuple=True)[0]
                        self.pillaged[_r3, hc0[_r3]] = True
                        _heal = self._imp_heals[self.improvement[_r3, hc0[_r3]].clamp(min=0)]
                        _cap = self.rules.combat.get("unitHp", 100)
                        self.p_hp[_r3, p] = torch.where(
                            _heal, (self.p_hp[_r3, p] + 25).clamp(max=_cap), self.p_hp[_r3, p]
                        )
                    _pd = ok_pl & ~_hi & _hd
                    if bool(_pd.any()):
                        _r4 = _pd.nonzero(as_tuple=True)[0]
                        self.district_pillaged[_r4, hc0[_r4]] = True
                    self.p_mp[:, p] = torch.where(ok_pl, torch.zeros_like(self.p_mp[:, p]), self.p_mp[:, p])  # the turn is spent (TS movesLeft = 0)
                    self._eff_version += 1
                # 18-23 = place a RESOURCE improvement (or the Seaside Resort)
                # on the builder's tile — the builderImprove twin, re-validated
                # here exactly as the mask computed it.
                if self.improvements_on and self._builder_idx >= 0:
                    _rq2 = self.res_imp.gather(1, hc0.unsqueeze(1)).squeeze(1)
                    _b2 = (
                        self.p_alive[:, p]
                        & (self.p_type[:, p] == self._builder_idx)
                        & (self.p_charges[:, p] > 0)
                        & (self.owner.gather(1, hc0.unsqueeze(1)).squeeze(1) >= 0)
                        & (self.center_at.gather(1, hc0.unsqueeze(1)).squeeze(1) < 0)
                        & (self.improvement.gather(1, hc0.unsqueeze(1)).squeeze(1) < 0)
                        & (self.district.gather(1, hc0.unsqueeze(1)).squeeze(1) < 0)
                        & (self.built_wonder.gather(1, hc0.unsqueeze(1)).squeeze(1) < 0)
                    )
                    for _k in range(3, self._imp_unlock.numel()):
                        _ut2 = int(self._imp_unlock[_k])
                        _unl2 = self.techs[:, _ut2] if _ut2 >= 0 else torch.ones_like(_b2)
                        if self.SEASIDE >= 0 and _k == self.SEASIDE:
                            _valid = self._seaside_ok().gather(1, hc0.unsqueeze(1)).squeeze(1)
                        else:
                            _valid = _rq2 == _k
                        _ok2 = (a == self._A_IMP[_k]) & _b2 & _valid & _unl2
                        if bool(_ok2.any()):
                            _r2 = _ok2.nonzero(as_tuple=True)[0]
                            self.improvement[_r2, hc0[_r2]] = _k
                            self.p_charges[:, p] = torch.where(_ok2, self.p_charges[:, p] - 1, self.p_charges[:, p])
                            _gone = _ok2 & (self.p_charges[:, p] <= 0)
                            if bool(_gone.any()):
                                _g2 = _gone.nonzero(as_tuple=True)[0]
                                self.occ_civ[(_g2, self.p_tile[_g2, p])] = -1
                                self.p_alive[:, p] = self.p_alive[:, p] & ~_gone
                            self._eff_version += 1
                # 17 = builder REPAIR — the `builderRepair` twin. Clears a
                # pillaged IMPROVEMENT first, else a pillaged DISTRICT (the TS
                # order), spends the turn, costs NO charge.
                ok_rp = (
                    (a == self._A_REPAIR)
                    & self.p_alive[:, p]
                    & (self.p_type[:, p] == self._builder_idx)
                    & (self.owner.gather(1, hc0.unsqueeze(1)).squeeze(1) >= 0)
                    & (
                        self.pillaged.gather(1, hc0.unsqueeze(1)).squeeze(1)
                        | self.district_pillaged.gather(1, hc0.unsqueeze(1)).squeeze(1)
                    )
                )
                if bool(ok_rp.any()):
                    rr_ = ok_rp.nonzero(as_tuple=True)[0]
                    tt_ = hc0[rr_]
                    _imp = self.pillaged[rr_, tt_]
                    self.pillaged[rr_[_imp], tt_[_imp]] = False
                    _dis = ~_imp & self.district_pillaged[rr_, tt_]
                    self.district_pillaged[rr_[_dis], tt_[_dis]] = False
                    self.p_mp[:, p] = torch.where(ok_rp, torch.zeros_like(self.p_mp[:, p]), self.p_mp[:, p])  # the turn is spent (TS movesLeft = 0)
                    self._eff_version += 1
                ftu_t = self.tile_ftu.gather(1, hc0.unsqueeze(1)).squeeze(1)
                unlocked = (ftu_t >= 0) & self.techs.gather(1, ftu_t.clamp(min=0).unsqueeze(1)).squeeze(1)
                ok_c = (
                    (a == self._A_CHOP)
                    & self.p_alive[:, p]
                    & (self.p_type[:, p] == self._builder_idx)
                    & (self.p_charges[:, p] > 0)
                    & (ftr_t > 0)
                    & unlocked
                    & ~self.feat_stripped.gather(1, hc0.unsqueeze(1)).squeeze(1)
                )
                if bool(ok_c.any()):
                    rows_c = ok_c.nonzero(as_tuple=True)[0]
                    tiles_c = hc0[rows_c]
                    self.p_mp[:, p] = torch.where(ok_c, torch.zeros_like(self.p_mp[:, p]), self.p_mp[:, p])  # the turn is spent (TS movesLeft = 0)
                    self._strip_feature_at(rows_c, tiles_c)
                    if self.LUMBER >= 0:
                        was_l = self.improvement[rows_c, tiles_c] == self.LUMBER
                        self.improvement[rows_c, tiles_c] = torch.where(was_l, torch.full_like(self.improvement[rows_c, tiles_c], -1), self.improvement[rows_c, tiles_c])
                    done = (self.techs.sum(dim=1) + self.civics.sum(dim=1)).to(self.dtype)
                    amount = js_round(20.0 + 2.5 * done)
                    own_c = self.owner[rows_c, tiles_c]
                    for i2 in range(len(rows_c)):
                        b2, c2 = int(rows_c[i2]), int(own_c[i2])
                        if c2 < 0:
                            continue  # outside borders: chopped, no lump
                        amt = float(amount[b2])
                        if int(ftr_t[rows_c[i2]]) == 1:
                            self.food_box[b2, c2] += amt
                        elif int(self.current[b2, c2]) >= 0:
                            self.progress[b2, c2] += amt
                        else:
                            self.prod_bank[b2, c2] += amt
                    self.p_charges[:, p] = torch.where(ok_c, self.p_charges[:, p] - 1, self.p_charges[:, p])
                    spent = ok_c & (self.p_charges[:, p] <= 0)
                    if bool(spent.any()):
                        dr = spent.nonzero(as_tuple=True)[0]
                        self.occ_civ[(dr, self.p_tile[dr, p])] = -1
                        self.p_alive[dr, p] = False

            if self.improvements_on and self._builder_idx >= 0:
                hc = here.clamp(min=0).unsqueeze(1)
                if self._hillfarms_civic >= 0:
                    civ_done = self.civics[:, self._hillfarms_civic]
                else:
                    civ_done = torch.zeros(self.B, dtype=torch.bool, device=self.device)
                mining = self.techs[:, self._mine_unlock_tech] if self._mine_unlock_tech >= 0 else torch.zeros(self.B, dtype=torch.bool, device=self.device)
                constr = self.techs[:, self._lumber_unlock_tech] if self._lumber_unlock_tech >= 0 else torch.zeros(self.B, dtype=torch.bool, device=self.device)
                farmable = self.farm_flat.gather(1, hc).squeeze(1) | (self.farm_hill.gather(1, hc).squeeze(1) & civ_done)
                mineable = self.mine_ok.gather(1, hc).squeeze(1) & mining
                woodsy = self.lumber_ok.gather(1, hc).squeeze(1) & constr
                base_ok = (
                    self.p_alive[:, p]
                    & (self.p_type[:, p] == self._builder_idx)
                    & (self.p_charges[:, p] > 0)
                    & (self.owner.gather(1, hc).squeeze(1) >= 0)
                    & (self.center_at.gather(1, hc).squeeze(1) < 0)
                    & (self.improvement.gather(1, hc).squeeze(1) < 0)
                    & (self.district.gather(1, hc).squeeze(1) < 0)  # not a district tile (mirrors validImprovements)
                    & (self.built_wonder.gather(1, hc).squeeze(1) < 0)  # an in-flight wonder pave refuses improvements
                )
                for act, valid, imp in ((13, farmable, self.FARM), (14, mineable, self.MINE), (15, woodsy, self.LUMBER)):
                    if imp < 0:
                        continue
                    bld = base_ok & (a == act) & valid
                    if bool(bld.any()):
                        rows = bld.nonzero(as_tuple=True)[0]
                        self.improvement[rows, here[rows]] = imp
                        self.p_charges[rows, p] -= 1
                        self.p_mp[:, p] = torch.where(bld, torch.zeros_like(self.p_mp[:, p]), self.p_mp[:, p])  # the turn is spent (TS movesLeft = 0)
                        self._eff_version += 1
                        gone = bld & (self.p_charges[:, p] <= 0)
                        if bool(gone.any()):
                            gr = gone.nonzero(as_tuple=True)[0]
                            self.occ_civ[(gr, here[gr])] = -1
                            self.p_alive[:, p] = self.p_alive[:, p] & ~gone

            # --- step to a neighbor (0..5) --------------------------------------
            mv = self.p_alive[:, p] & (a >= 0) & (a < 6)
            if not bool(mv.any()):
                continue
            dirs = a.clamp(min=0, max=5)
            tgt = nb.gather(1, dirs.unsqueeze(1)).squeeze(1)
            civ = self._p_civ[self.p_type[:, p]]
            # `_blocked_for` IS tileFreeForUnit: foreign units block, an own
            # unit of the SAME domain blocks, own cross-domain units stack, and
            # a live enemy Encampment bars the step (walkPath's blockedByEnemy).
            ok = (
                mv
                & (tgt >= 0)
                & self.passable.gather(1, tgt.clamp(min=0).unsqueeze(1)).squeeze(1)
                & ~self._blocked_for(tgt.clamp(min=0).unsqueeze(1), 0, is_civilian=civ).squeeze(1)
            )
            if bool(ok.any()):
                self._step_verb(  # the shared step contract
                    ok, torch.full_like(here, p), here, tgt, dirs, 0, civ,
                )

    def _bankrupt_disband(self) -> None:
        """Disband ONE seat-0 unit per turn while the treasury is insolvent.

        The priciest alive unit goes; ties break to the lowest slot (= oldest,
        matching TS's lowest id, since both spawn orders are append-only).
        Only upkeep>0 units (military) are candidates, and there is no refund.
        """
        insolvent = js_round(self.treasury * 1000) < 0  # [B] test at MILLI precision: sub-milli non-dyadic gold drift must not trip the < 0 boundary here but not on TS
        if not bool(insolvent.any()):
            return
        P = self.p_alive.shape[1]
        maint = self._p_maint[self.p_type]  # [B, P] upkeep per slot
        cand = self.p_alive & (maint > 0)
        slots = torch.arange(P, device=self.device, dtype=maint.dtype).unsqueeze(0)  # [1, P]
        # maximize (upkeep, -slot): upkeep*(P+1) - slot lets upkeep dominate, tie -> lowest slot
        score = torch.where(cand, maint * float(P + 1) - slots, torch.full_like(maint, -1e30))
        victim = score.argmax(dim=1)  # [B]
        do_kill = insolvent & cand.any(dim=1)
        if not bool(do_kill.any()):
            return
        rows = do_kill.nonzero(as_tuple=True)[0]
        vslot = victim[rows]
        vtile = self.p_tile[rows, vslot]
        vciv = self._p_civ[self.p_type[rows, vslot]]  # clear military vs civilian occupancy
        mil = ~vciv
        if bool(mil.any()):
            self.occ_mil[(rows[mil], vtile[mil])] = -1
        if bool(vciv.any()):
            self.occ_civ[(rows[vciv], vtile[vciv])] = -1
        self.p_alive[rows, vslot] = False

    def _barb_reset_mp(self) -> None:
        """Reset barbarian MP: `u.movesLeft = UNITS[u.type].moves`.

        Deliberately NOT `_reset_mp`: TS writes movesLeft ONLY, so movesFull
        keeps refreshUnits' embark-aware value — which is what stepUnit's
        afford rule and next turn's "spent no MP" gate both read — and it uses
        the plain type pool, not the embark one.
        """
        self.u_mp.copy_(self._p_moves[self.u_type.clamp(min=0, max=self.NU - 1)])

    def _barbarian_phase(self) -> None:
        """Run the barbarian phase, turn for turn and draw for draw.

        Camp roll → camp placement → per-camp garrison rolls → raider actions
        (attack else march) in unit order → city healing."""
        cb, B, T, dev = self.rules.combat, self.B, self.T, self.device
        self._barb_reset_mp()  # barbarianPhase's own movesLeft reset
        city_max_hp = int(cb.get("cityMaxHp", 200))
        # The shared barbarian MELEE era-ladder type index (u_type 0/1/2/3 =
        # WARRIOR/SPEARMAN/PIKEMAN/MUSKETMAN), the TS barbMeleeType twin.
        # self.turn is a batch scalar, so one index serves the whole batch, and
        # it feeds ALL THREE spawn sites (new camp, empty-camp regarrison, the
        # 0.1-roll raid). Barbarian u_type 6 = SCOUT in the unitCombat table.
        self._barb_scout_type = 6 if self._barb_ladder.numel() > 6 else 0
        self._barb_scout_live = bool(self.rules.combat.get("barbScoutOpenerLive", False))
        melee_type = (
            3 if self.turn > cb.get("musketmanAfterTurn", 180)
            else 2 if self.turn > cb.get("pikemanAfterTurn", 120)
            else 1 if self.turn > cb.get("spearmanAfterTurn", 60)
            else 0
        )
        # The RANGED barbarian ladder (barbRangedType): u_type 4 = ARCHER,
        # 5 = CROSSBOWMAN after turn 120. Used at the RAID spawn site only, and
        # only for every THIRD camp by its INDEX in the camp list
        # (campNo % 3 === 0). Spawn TYPE only, so the 0.1 raid roll is
        # untouched and this stays draw-count neutral.
        ranged_type = 5 if self.turn > cb.get("crossbowmanAfterTurn", 120) else 4
        # The barbarian NAVAL ladder: GALLEY, then QUADRIREME past the same era
        # turn the crossbow ladder uses.
        self._barb_naval_type = (
            self._barb_quad_idx
            if self.turn > cb.get("crossbowmanAfterTurn", 120)
            else self._barb_galley_idx
        )

        # New camp? One draw whenever below the cap AND any seat still holds a
        # city (seat 0 or a civ seat), so only a fully citiless world skips the
        # roll. The short-circuit is part of the draw-count contract. A second
        # draw picks the spot, and only if any candidate exists.
        any_city = self.alive.any(dim=1) | self.rc_alive.reshape(B, -1).any(dim=1)
        can_roll = any_city & (self.n_camps < self.max_camps)
        r1 = self._next_random(can_roll)
        want = can_roll & (r1 < cb.get("campSpawnChance", 0.08))
        if bool(want.any()):
            # Only the `want` rows consume the candidate planes, so build them
            # on the want sub-batch (boolean/integer ops row-restrict exactly;
            # the RNG calls keep their full-B masks unchanged).
            wr = want.nonzero(as_tuple=True)[0]
            near_city_w = ((self.dist[wr] < 5) & self.alive[wr].unsqueeze(2)).any(dim=1)  # [n, T]
            # campCandidates excludes t.district LIVE: camp_ok is static, but
            # paves are not, and an orphaned pave left over from a razed city
            # would pad the set and shift the draw-indexed camp spot.
            # Camps rise away from EVERY seat, so live CIV city centres repel
            # candidates too.
            rcc_w = self.rc_center[wr].reshape(len(wr), -1)
            near_rc_w = ((self.pair_dist[rcc_w.clamp(min=0)] < 5) & self.rc_alive[wr].reshape(len(wr), -1).unsqueeze(2)).any(dim=1)
            cand_w = self.camp_ok[wr] & (self.owner[wr] == -1) & (self.cs_at[wr] < 0) & (self.civ_at[wr] < 0) & ~near_city_w & ~near_rc_w & (self.district[wr] < 0) & (self.built_wonder[wr] < 0)  # a live builtWonder excludes the tile too
            if self.K > 0:
                camp_d_w = self.pair_dist[self.camp_tile[wr].clamp(min=0)].to(torch.long)  # [n, K, T]
                near_camp_w = ((camp_d_w < 5) & (self.camp_tile[wr] >= 0).unsqueeze(2)).any(dim=1)
                cand_w = cand_w & ~near_camp_w
            has = torch.zeros_like(want)
            has[wr] = cand_w.any(dim=1)  # want[wr] is all-True, so has == want & cand.any
            r2 = self._next_random(has)
            if bool(has.any()):
                k_w = torch.floor(r2[wr] * cand_w.sum(dim=1).to(torch.float64)).to(torch.long)
                cum_w = cand_w.long().cumsum(dim=1)
                sel_w = cand_w & (cum_w == (k_w + 1).unsqueeze(1))
                spot = torch.zeros(B, dtype=torch.long, device=dev)
                spot[wr] = sel_w.long().argmax(dim=1)
                rows = has.nonzero(as_tuple=True)[0]
                self.camp_tile[rows, self.n_camps[rows]] = spot[rows]
                self.n_camps[rows] += 1
                # SCOUT-THEN-RAID: a BRAND-NEW camp opens with a SCOUT
                # (u_type 6), the TS barbScoutType twin, while regarrison and
                # raid sites keep the melee/ranged ladders. Spawn TYPE only, so
                # the camp roll above is untouched and this is draw-neutral.
                self._spawn_barb(has, spot, self._barb_scout_type if self._barb_scout_live else melee_type)

        # Garrisons + growth. The near-camp check uses the unit list as it
        # stood BEFORE this loop (TS snapshots `barbs` first); the cap check
        # recounts live (TS calls barbUnits() fresh inside the condition).
        # The camp↔unit distance matrix is hoisted: camps don't move, and units
        # spawned mid-loop are invisible to the pre_alive mask.
        pre_alive = self.u_alive.clone()
        any_camp = bool((self.camp_tile >= 0).any())
        if any_camp:
            du_all = self.pair_dist[self.camp_tile.clamp(min=0).unsqueeze(2), self.u_tile.unsqueeze(1)].to(torch.long)  # [B, K, U]
            near_any_all = (pre_alive.unsqueeze(1) & (du_all <= 1)).any(dim=2)  # [B, K]
        for k in range(self.K if any_camp else 0):
            camp = self.camp_tile[:, k]
            active = camp >= 0
            if not bool(active.any()):
                continue
            near_any = near_any_all[:, k]
            self._spawn_barb(active & ~near_any, camp, melee_type)  # era ladder (empty camp regarrisons)
            can_grow = active & near_any & (self.u_alive.sum(dim=1) < self.n_camps * cb.get("maxBarbPerCamp", 3))
            r = self._next_random(can_grow)
            # Every THIRD camp raids RANGED, the rest melee. `k` IS the TS
            # `campNo`: camps append at n_camps and _clear_camp_at splices left
            # exactly like state.barbCamps.splice, so slots 0..n_camps-1 are
            # dense and in the same order as the TS array.
            grow_type = ranged_type if k % 3 == 0 else melee_type
            _raid = can_grow & (r < cb.get("garrisonGrowChance", 0.1))
            # Every FOURTH camp (a residue that never collides with the ranged
            # rule) puts out a naval HULL instead when it is coastal, on the
            # LOWEST-index free water neighbour. Zero-draw: the 0.1 roll above
            # already fired and nothing else is consulted.
            _nav_done = torch.zeros_like(_raid)
            if k % 4 == 1 and self._barb_naval_type >= 0:
                _nb = self.neigh[camp.clamp(min=0)]  # [B, 6]
                _nbc = _nb.clamp(min=0)
                _free = (
                    (_nb >= 0)
                    & self.wpass.gather(1, _nbc)
                    & ~self.ocean_tile.gather(1, _nbc)  # barbarians have no CARTOGRAPHY
                    & (self.occ_mil.gather(1, _nbc) < 0)  # no unit at all
                    & (self.occ_civ.gather(1, _nbc) < 0)
                )
                _key = torch.where(_free, _nb, torch.full_like(_nb, self.T + 1))
                _best = _key.min(dim=1).values
                _nav = _raid & (_best <= self.T)
                if bool(_nav.any()):
                    self._spawn_barb(_nav, _best.clamp(max=self.T - 1), self._barb_naval_type, naval=True)
                    _nav_done = _nav
            self._spawn_barb(_raid & ~_nav_done, camp, grow_type)

        # One guard stays home per camp: first unit (in unit order) within
        # reach of each camp (in camp order), like the TS guard set. Only
        # `guard` mutates inside this loop, so the distances hoist too
        # (fresh — garrison spawns just added units).
        guard = torch.zeros(B, simbase.U_MAX, dtype=torch.bool, device=dev)
        if any_camp:
            du_g = self.pair_dist[self.camp_tile.clamp(min=0).unsqueeze(2), self.u_tile.unsqueeze(1)].to(torch.long)  # [B, K, U]
        for k in range(self.K if any_camp else 0):
            camp = self.camp_tile[:, k]
            active = camp >= 0
            if not bool(active.any()):
                continue
            near = self.u_alive & (du_g[:, k] <= 1) & ~guard & active.unsqueeze(1)
            any_near = near.any(dim=1)
            first = near.long().argmax(dim=1)
            rows = any_near.nonzero(as_tuple=True)[0]
            guard[rows, first[rows]] = True

        # Raiders act in unit order: attack something adjacent (a seat-0 city,
        # any hostile unit, or a civ city; lowest tile index first, as
        # attackTargets scans the map), else march toward the nearest seat-0
        # city. Slots resolve sequentially like the TS loop, so a second raider
        # hitting the same target sees the first one's damage.
        u_high = int(self.next_slot.max().item())
        arange6 = torch.arange(6, device=dev)
        # Iterate only slots alive in SOME game: deaths can only shrink the set
        # mid-loop and nothing spawns barbarians here, so the snapshot is a
        # superset; ascending order (and thus the TS unit order) is unchanged.
        u_live = self.u_alive[:, :u_high].any(dim=0).nonzero(as_tuple=True)[0].tolist() if u_high else []
        # Which barbarian slots are RANGED (ARCHER/CROSSBOWMAN). Hoisted:
        # nothing spawns barbarians inside the raider loop, so u_type is fixed
        # here, and the batch-wide flag costs ONE host sync per turn instead of
        # one per slot.
        u_rngd_all = self.u_alive & (self._p_rng_str[self.u_type.clamp(min=0, max=self.NU - 1)] > 0)
        any_rngd = bool(u_rngd_all.any())
        for u in u_live:
            act = self.u_alive[:, u] & ~guard[:, u]
            if not bool(act.any()):
                continue
            here = self.u_tile[:, u]
            nb = self.neigh[here]  # [B, 6]
            nbc = nb.clamp(min=0)
            ctr = self.center_at.gather(1, nbc)
            # A NON-BARBARIAN unit is adjacent (a barbarian is not a target for
            # a barbarian). Civilians are never barbarian, so only the military
            # plane needs the seat test.
            _mn = self.occ_mil.gather(1, nbc)
            _mn_seat = torch.where(_mn >= 0, self.unit_seat.gather(1, _mn.clamp(min=0)), torch.full_like(_mn, -1))
            has_unit = ((_mn >= 0) & (_mn_seat != BARB_SEAT)) | (self.occ_civ.gather(1, nbc) >= 0)
            rvc = self.rc_at.gather(1, nbc) >= 0
            # An adjacent LIVE Encampment is a melee target for a barbarian too
            # (hostile to every owner) — attackTargets' encampTarget.
            enc_nb = self._encamp_block(nb, BARB_SEAT) if self._encamp_didx >= 0 else None
            valid = (nb >= 0) & ((ctr >= 0) | has_unit | rvc | (enc_nb if enc_nb is not None else False))
            tkey = torch.where(valid, nb, T + 1)
            target_tile = tkey.min(dim=1).values
            # A RANGED raider (ARCHER/CROSSBOWMAN) scans its FULL range
            # instead: attackTargets over the whole map in TILE ORDER, d in
            # [1, range]. Target classes are attackTargets' for a barbarian —
            # `hasEnemy` (any hostile unit, military or civilian; a barbarian
            # is never hostile to a barbarian) and `cityTarget`, which
            # barbarians hold against every seat, so EVERY city-centre tile is
            # in reach at d <= range. City-state centres carry no district in
            # TS, so they are NOT targets, same as the melee scan. Gated on
            # `.any()` so a batch with no ranged barbarian pays nothing for the
            # [B, T] scan.
            rngd = u_rngd_all[:, u]
            if any_rngd and bool((act & rngd).any()):
                rng_u = self._p_rng_rng[self.u_type[:, u].clamp(min=0, max=self.NU - 1)]
                d_all = self.pair_dist[here.clamp(min=0)].to(torch.long)  # [B, T]
                r_valid = (
                    (d_all >= 1)
                    & (d_all <= rng_u.unsqueeze(1))
                    & (
                        self._nonbarb_unit_plane()
                        | (self.center_at >= 0) | (self.rc_at >= 0)
                    )
                )
                r_key = torch.where(r_valid, self._arangeT.unsqueeze(0).expand(B, T), torch.full((B, T), T + 1, dtype=torch.long, device=dev))
                target_tile = torch.where(rngd, r_key.min(dim=1).values, target_tile)
            attack = act & (target_tile <= T)
            ttc = target_tile.clamp(max=T - 1)
            # meleeAttack routes seat-0 centre tiles to the city even with a
            # garrison; units defend everywhere else.
            tgt_city = self.center_at.gather(1, ttc.unsqueeze(1)).squeeze(1)
            # a NON-BARBARIAN unit stands on the target tile
            has_u = self._nonbarb_unit_plane().gather(1, ttc.unsqueeze(1)).squeeze(1)
            # A CIV centre is attacked THROUGH its garrison, exactly as a
            # seat-0 centre is (`city_att` never tests `has_u`). A LONE
            # CIVILIAN still wins — it is killed roll-free — so the city only
            # beats a MILITARY occupant.
            _has_mil = self._nonbarb_mil_plane().gather(1, ttc.unsqueeze(1)).squeeze(1)
            _civ_only = has_u & ~_has_mil
            _rvc_here = self.rc_at.gather(1, ttc.unsqueeze(1)).squeeze(1) >= 0
            _city_wins = _rvc_here & ~_civ_only
            city_att = attack & ~rngd & (tgt_city >= 0)
            unit_att = attack & ~rngd & (tgt_city < 0) & has_u & ~_city_wins
            rvc_att = attack & ~rngd & (tgt_city < 0) & _city_wins
            enc_att = (
                attack
                & ~rngd
                & (tgt_city < 0)
                & ~has_u
                & ~_rvc_here
                & self._encamp_block(ttc.unsqueeze(1), BARB_SEAT).squeeze(1)
                if self._encamp_didx >= 0
                else None
            )

            if bool(city_att.any()):
                self._hostile_city_attack(city_att, tgt_city, "u", u)
            if bool(unit_att.any()):
                self._hostile_vs_unit(unit_att, ttc, "u", u)
            if bool(rvc_att.any()):
                self._attack_civ_city(rvc_att, ttc, u)
            if enc_att is not None and bool(enc_att.any()):
                self._attack_encampment(enc_att, ttc, "u", u)
            acted_att = city_att | unit_att | rvc_att
            if enc_att is not None:
                acted_att = acted_att | enc_att
            # A RANGED raider strikes instead: hostileUnitAct routes any
            # UNITS[type].ranged attacker through hostileRangedStrike — ONE
            # roll, no retaliation, no advance, civilians take the roll, and a
            # seat-0 city floors at 1 HP and is never captured. The method
            # returns the rows that actually rolled; a row that reaches only an
            # ungarrisoned CIV centre (TS `enemyCity` resolves to seat-0 cities
            # only) spends nothing, but `attack` still HOLDS the unit, because
            # TS returns from hostileUnitAct before the pillage/march branches.
            r_att = attack & rngd
            if any_rngd and bool(r_att.any()):
                acted_att = acted_att | self._hostile_ranged_strike(r_att, ttc, "u", u)
            self.u_mp[:, u] = torch.where(acted_att, torch.zeros_like(self.u_mp[:, u]), self.u_mp[:, u])  # the turn is spent (TS movesLeft = 0)

            # Pillage: a raider that did not attack, standing on an owned,
            # improved, unpillaged tile, pillages it and holds (no march this
            # turn) — hostileUnitAct's pillage branch. Only FOOD improvements
            # heal the pillager (+25).
            pillage = torch.zeros_like(act)
            if self.improvements_on:
                h_imp = self.improvement.gather(1, here.unsqueeze(1)).squeeze(1) >= 0
                h_unpil = ~self.pillaged.gather(1, here.unsqueeze(1)).squeeze(1)
                # barbarians raid CIV improvements too
                h_owned = (self.owner.gather(1, here.unsqueeze(1)).squeeze(1) >= 0) | (
                    self.civ_at.gather(1, here.unsqueeze(1)).squeeze(1) >= 0
                )
                pillage = act & ~attack & h_imp & h_unpil & h_owned
                if bool(pillage.any()):
                    rows = pillage.nonzero(as_tuple=True)[0]
                    heal_r = self._imp_heals[self.improvement[rows, here[rows]].clamp(min=0)]
                    self.pillaged[rows, here[rows]] = True
                    self.u_mp[rows, u] = 0  # the turn is spent (TS movesLeft = 0)
                    self._eff_version += 1  # a farm's yield just dropped
                    hp_cap = self.rules.combat.get("unitHp", 100)
                    self.u_hp[rows, u] = torch.where(
                        heal_r, (self.u_hp[rows, u] + 25).clamp(max=hp_cap), self.u_hp[rows, u]
                    )

            # Else pillage the DISTRICT underfoot — a COMPLETE, unpillaged
            # enemy district (self.district excludes centres by construction).
            # No heal, no loot. Barbarians raid CIV districts too; this is
            # hostileUnitAct's district branch.
            dist_pillage = torch.zeros_like(act)
            if self.districts_on:
                h_dist = self.district.gather(1, here.unsqueeze(1)).squeeze(1)
                h_dcomp = self.district_complete.gather(1, here.unsqueeze(1)).squeeze(1)
                h_dunpil = ~self.district_pillaged.gather(1, here.unsqueeze(1)).squeeze(1)
                h_downed = (self.owner.gather(1, here.unsqueeze(1)).squeeze(1) >= 0) | (
                    self.civ_at.gather(1, here.unsqueeze(1)).squeeze(1) >= 0
                )
                dist_pillage = act & ~attack & ~pillage & (h_dist >= 0) & h_dcomp & h_dunpil & h_downed
                if bool(dist_pillage.any()):
                    rows = dist_pillage.nonzero(as_tuple=True)[0]
                    self.district_pillaged[rows, here[rows]] = True
                    self.u_mp[rows, u] = 0  # the turn is spent (TS movesLeft = 0)
                    self._eff_version += 1  # district yields just dropped

            # March target: the nearest unpillaged owned improvement OR
            # district within dist < 13 (ties → lowest tile index), else the
            # nearest alive city (ties → founding order) — hostileUnitAct's
            # target scan.
            march = act & ~attack & ~pillage & ~dist_pillage
            if not bool(march.any()):
                continue
            arangeT = torch.arange(T, device=dev)
            if self.improvements_on or self.districts_on:
                _owned = (self.tile_seat == 0) | (self.civ_at >= 0)  # [B, T] — civ tiles tempt barbarians too
                imp_job = (self.improvement >= 0) & ~self.pillaged & _owned  # [B, T]
                if self.districts_on:  # pillageable districts join the union
                    imp_job = imp_job | ((self.district >= 0) & self.district_complete & ~self.district_pillaged & _owned)
                d_imp = self.pair_dist[here.unsqueeze(1), arangeT.unsqueeze(0)].to(torch.long)
                ikey = torch.where(imp_job & (d_imp < 13), d_imp * (T + 1) + arangeT, torch.full_like(d_imp, 10**9))
                imp_min, imp_tgt = ikey.min(dim=1)
                has_imp = imp_min < 10**9
            else:
                has_imp = torch.zeros_like(act)
                imp_tgt = here.clamp(min=0)
            dc = self.pair_dist[here.unsqueeze(1), self.site.clamp(min=0)].to(torch.long)  # [B, C]
            # Distance ties break by TS ARRAY order, which is the FOUNDING
            # sequence and diverges from the slot index once a capture reuses a
            # hole. city_seq IS that sequence, so rank on it.
            ckey = torch.where(self.alive, dc * 4096 + self.city_seq, 10**9)
            city_min = ckey.min(dim=1).values
            city_tgt = self.site.gather(1, ckey.argmin(dim=1, keepdim=True)).squeeze(1).clamp(min=0)
            tgt = torch.where(has_imp, imp_tgt, city_tgt)
            has_tgt = has_imp | (city_min < 10**9)
            d_here = self.pair_dist[here, tgt].to(torch.long)
            # The raider walks REAL MP toward the (fixed) target, exactly as
            # the civ march does. Per step: the passable free neighbour closest
            # to it (ties → direction order), move only if strictly closer,
            # walkPath's charge (1 + tmove//3, live/strip-adjusted, +3 per
            # river-edge crossing); a full-MP unit always affords its first
            # step. An improvement target is walked ONTO; a CITY target stops
            # the march ADJACENT (dir >= 1 — enemy centres cannot be entered,
            # and the start-of-phase attack scan already met any adjacent
            # target). Any step spends MP, which blocks the heal. MP comes from
            # the unit's own type — barbarian types do not all share one value
            # (the SCOUT opener has 3 where the melee ladder has 2). Camps are
            # a barbarian no-op (clearCampFor skips barbarians).
            cur = here.clone()
            d_cur = d_here.clone()
            gslot = torch.full_like(cur, u + self.POOL_LO["u"])
            moving = march & has_tgt
            while bool(moving.any()):
                nb2 = self.neigh[cur.clamp(min=0)]
                nb2c = nb2.clamp(min=0)
                # A NAVAL barbarian walks the WATER plane. Land hulls and water
                # hulls never share a plane, so the plane swap is the whole
                # difference (TS's tileFreeForUnit branches on
                # UNITS[type].naval the same way).
                _navm = self.unit_naval[self.u_type[:, u].clamp(min=0)].unsqueeze(1)
                _plane = torch.where(
                    _navm,
                    self.wpass.gather(1, nb2c) & ~self.ocean_tile.gather(1, nb2c),  # no CARTOGRAPHY
                    self.passable.gather(1, nb2c),
                )
                step_ok = (nb2 >= 0) & _plane & ~self._blocked_for(nb2, BARB_SEAT)
                d_nb = self.pair_dist[tgt.unsqueeze(1), nb2c].to(torch.long)  # dist(neighbor, target); symmetric
                skey = torch.where(step_ok, d_nb * 8 + arange6, 10**9)
                best = skey.min(dim=1).values
                dir_i = (best % 8).clamp(max=5)
                dest = nb2.gather(1, dir_i.unsqueeze(1)).squeeze(1)
                # An improvement target is walked ONTO; a CITY target stops the
                # march adjacent. Everything past the destination — cost,
                # afford, the occupancy pair, the tile, the MP spend, the ZOC
                # halt — is the shared step contract.
                mv = self._step_verb(
                    moving
                    & (best < 10**9)
                    & (torch.div(best, 8, rounding_mode="floor") < d_cur)
                    & (has_imp | (torch.div(best, 8, rounding_mode="floor") >= 1)),
                    gslot, cur, dest, dir_i, BARB_SEAT, torch.zeros_like(moving),
                    clear_camp=False,  # TS clearCampFor no-ops for a barbarian
                )
                if not bool(mv.any()):
                    break
                mp = self.u_mp[:, u]
                d_cur = torch.where(mv, torch.div(best, 8, rounding_mode="floor"), d_cur)
                cur = torch.where(mv, dest, cur)
                moving = mv & (mp > 0)

        # A seat-0 city with ANCIENT_WALLS fires once/turn at the nearest unit
        # hostile to seat 0 (barbarians always; at-war civ units, civilians
        # included), range 2, lowest tile index breaking ties. One roll at
        # cityDefenseStrength vs the target's defense, mirroring
        # hostileRangedStrike: single roll, no retaliation, civilians take the
        # roll, never captures. Cities walk in walk_ord (TS array order); a
        # kill removes the target for later cities and advances the shared
        # per-row RNG, so this pass runs immediately BEFORE the heal loop.
        if self._walls_bidx >= 0:
            Bn, Tn, dev2 = self.B, self.T, self.device
            bidx = torch.arange(Bn, device=dev2)
            arangeT = torch.arange(Tn, device=dev2)
            walk_ord = torch.argsort(torch.where(self.alive, self.city_seq, self.city_seq + 10**6), dim=1, stable=True)
            for s_rank in range(self.C):
                col = walk_ord[:, s_rank]  # [B] — this game's s_rank-th city (TS array order)
                walled = self.alive[bidx, col] & self.buildings[bidx, col, self._walls_bidx]
                if not bool(walled.any()):
                    continue
                ctr = self.site[bidx, col].clamp(min=0)  # [B]
                dist = self.pair_dist[ctr].to(torch.long)  # [B, T]
                # "hostile to seat 0" over the whole map, from the merged
                # planes — TS's `unitsHostile` against the seat-0 side.
                _mil, _civ = self.occ_mil, self.occ_civ
                _mseat = torch.where(_mil >= 0, self.unit_seat.gather(1, _mil.clamp(min=0)), torch.full_like(_mil, -1))
                _cseat = torch.where(_civ >= 0, self.unit_seat.gather(1, _civ.clamp(min=0)), torch.full_like(_civ, -1))
                hm = self._seats_hostile(0, _mseat)
                hc = self._seats_hostile(0, _cseat)
                hostile = hm | hc  # [B, T]
                valid = walled.unsqueeze(1) & hostile & (dist >= 1) & (dist <= 2)
                key = torch.where(valid, dist * (Tn + 1) + arangeT.reshape(1, -1), torch.full((Bn, Tn), 10**9, device=dev2, dtype=torch.long))
                best_key = key.min(dim=1).values
                tt = key.argmin(dim=1)  # [B] target tile (garbage where no target)
                strike = walled & (best_key < 10**9)
                if not bool(strike.any()):
                    continue
                # ONE defender slot. "Military first" is the whole priority:
                # only one military and one civilian can stand on a tile.
                _okm, _okc = hm[bidx, tt], hc[bidx, tt]
                d_slot = torch.where(_okm, _mil[bidx, tt], torch.where(_okc, _civ[bidx, tt], torch.full_like(tt, -1)))
                d_seat = torch.where(_okm, _mseat[bidx, tt], torch.where(_okc, _cseat[bidx, tt], torch.full_like(tt, -1)))
                ds0 = d_slot.clamp(min=0)
                is_barb = d_seat == BARB_SEAT
                is_rmil = _okm & ~is_barb
                d_type = self.unit_type[bidx, ds0]
                # Only a civ MILITARY target (is_rmil) carries veterancy.
                def_xp = torch.where(is_rmil, self._xp_lvl_bonus(self.unit_xp[bidx, ds0]), torch.zeros_like(tt))
                def_cs = self._p_combat[d_type] + self._tdef_i(bidx, tt) + def_xp
                # An embarked civ target (military or civilian; barbarians
                # never embark) → flat CS, no terrain and no support below.
                d_emb = self.unit_emb[bidx, ds0] & (d_slot >= 0)
                def_cs = torch.where(d_emb, torch.full_like(def_cs, self._embarked_defense_cs), def_cs)
                # a seat-0 military standing on the centre tile.
                _g = self.occ_mil[bidx, ctr]
                gar = ((_g >= 0) & (self.unit_seat[bidx, _g.clamp(min=0)] == 0)).long()
                atk_cs = torch.maximum(self.best_melee, torch.full_like(self.best_melee, 15)) + gar * 5
                # The defending unit is wounded (the attacker is the city).
                def_hp = self.unit_hp[bidx, ds0]
                def_e = def_cs - self._wound(def_hp)
                # The struck unit gains support from adjacent same-side
                # military; the attacker is the city, not a unit, so there is
                # no flanking.
                _dciv = torch.where(is_barb, torch.full_like(tt, -1), d_seat - 1)
                _, _sp = self._flank_support(tt, d_seat, torch.full((Bn,), -1, dtype=torch.long, device=dev2))
                def_e = def_e + SUPPORT_CS * torch.where(d_emb, torch.zeros_like(_sp), _sp)  # embarked → no support
                # A general/admiral shields its units from CITY fire too. This
                # is the DEFENDER side — the roll is atk_cs - def_e, so the
                # aura REDUCES the damage taken — and it is added OUTSIDE the
                # embarked override, since an embarked defender keeps its flat
                # CS but still gets its ADMIRAL's aura. Only a civ MILITARY
                # target carries one: barbarians have no generals, and a
                # civilian is combat-0, for which generalAuraCS returns 0.
                _def_civ_u = torch.where(is_rmil, d_seat, torch.full_like(tt, -1))
                _def_nav = torch.where(is_rmil, self.unit_naval[d_type.clamp(min=0, max=self.NU - 1)], torch.zeros_like(d_emb))
                def_e = def_e + self._gen_aura_cs(_def_civ_u, tt, d_emb | _def_nav).to(def_e.dtype)
                self._city_strike_resolve(  # one rule, four callers
                    strike, tt, d_slot, d_seat, _okm, _okc, is_rmil, atk_cs,
                    def_e, def_hp, 0, "pcstk")

        # The ADDITIONAL Encampment strike (the "pestk" twin of the "pcstk"
        # walls strike above). A seat-0 city owning a COMPLETE LIVE unpillaged
        # ENCAMPMENT fires the same once/turn ranged strike: range 2, nearest
        # seat-0-hostile unit, one roll at cityDefenseStrength, no retaliation,
        # never captures. DRAW ORDER: this pass runs AFTER the whole walls
        # pass, both scanning cities in walk_ord order, so a city with both
        # rolls twice.
        if self._encamp_didx >= 0 and self.districts_on:
            Bn, Tn, dev2 = self.B, self.T, self.device
            bidx = torch.arange(Bn, device=dev2)
            arangeT = torch.arange(Tn, device=dev2)
            walk_ord = torch.argsort(torch.where(self.alive, self.city_seq, self.city_seq + 10**6), dim=1, stable=True)
            owner_oh = torch.nn.functional.one_hot(self.owner.clamp(min=0), self.C).bool() & (self.tile_seat == 0).unsqueeze(2)  # [B,T,C]
            has_enc = (((self.district == self._encamp_didx) & self.district_complete & ~self.district_dead & ~self.district_pillaged & (self.encamp_hp > 0)).unsqueeze(2) & owner_oh).any(dim=1)  # [B,C] the city owns a completed LIVE unpillaged Encampment; one beaten to 0 HP is occupied and fires nothing
            for s_rank in range(self.C):
                col = walk_ord[:, s_rank]  # [B] — this game's s_rank-th city (TS array order)
                enc_city = self.alive[bidx, col] & has_enc[bidx, col]
                if not bool(enc_city.any()):
                    continue
                ctr = self.site[bidx, col].clamp(min=0)  # [B]
                dist = self.pair_dist[ctr].to(torch.long)  # [B, T]
                # "hostile to seat 0" over the whole map, from the merged
                # planes — TS's `unitsHostile` against the seat-0 side.
                _mil, _civ = self.occ_mil, self.occ_civ
                _mseat = torch.where(_mil >= 0, self.unit_seat.gather(1, _mil.clamp(min=0)), torch.full_like(_mil, -1))
                _cseat = torch.where(_civ >= 0, self.unit_seat.gather(1, _civ.clamp(min=0)), torch.full_like(_civ, -1))
                hm = self._seats_hostile(0, _mseat)
                hc = self._seats_hostile(0, _cseat)
                hostile = hm | hc  # [B, T]
                valid = enc_city.unsqueeze(1) & hostile & (dist >= 1) & (dist <= 2)
                key = torch.where(valid, dist * (Tn + 1) + arangeT.reshape(1, -1), torch.full((Bn, Tn), 10**9, device=dev2, dtype=torch.long))
                best_key = key.min(dim=1).values
                tt = key.argmin(dim=1)  # [B] target tile (garbage where no target)
                strike = enc_city & (best_key < 10**9)
                if not bool(strike.any()):
                    continue
                # ONE defender slot. "Military first" is the whole priority:
                # only one military and one civilian can stand on a tile.
                _okm, _okc = hm[bidx, tt], hc[bidx, tt]
                d_slot = torch.where(_okm, _mil[bidx, tt], torch.where(_okc, _civ[bidx, tt], torch.full_like(tt, -1)))
                d_seat = torch.where(_okm, _mseat[bidx, tt], torch.where(_okc, _cseat[bidx, tt], torch.full_like(tt, -1)))
                ds0 = d_slot.clamp(min=0)
                is_barb = d_seat == BARB_SEAT
                is_rmil = _okm & ~is_barb
                d_type = self.unit_type[bidx, ds0]
                def_xp = torch.where(is_rmil, self._xp_lvl_bonus(self.unit_xp[bidx, ds0]), torch.zeros_like(tt))
                def_cs = self._p_combat[d_type] + self._tdef_i(bidx, tt) + def_xp
                d_emb = self.unit_emb[bidx, ds0] & (d_slot >= 0)
                def_cs = torch.where(d_emb, torch.full_like(def_cs, self._embarked_defense_cs), def_cs)
                # a seat-0 military standing on the centre tile.
                _g = self.occ_mil[bidx, ctr]
                gar = ((_g >= 0) & (self.unit_seat[bidx, _g.clamp(min=0)] == 0)).long()
                atk_cs = torch.maximum(self.best_melee, torch.full_like(self.best_melee, 15)) + gar * 5
                def_hp = self.unit_hp[bidx, ds0]
                def_e = def_cs - self._wound(def_hp)
                _dciv = torch.where(is_barb, torch.full_like(tt, -1), d_seat - 1)
                _, _sp = self._flank_support(tt, d_seat, torch.full((Bn,), -1, dtype=torch.long, device=dev2))
                def_e = def_e + SUPPORT_CS * torch.where(d_emb, torch.zeros_like(_sp), _sp)
                # The walls-strike mirror: defender-side aura (civ MILITARY
                # only; barbarian/civilian none), outside the embarked override.
                _def_civ_u = torch.where(is_rmil, d_seat, torch.full_like(tt, -1))
                _def_nav = torch.where(is_rmil, self.unit_naval[d_type.clamp(min=0, max=self.NU - 1)], torch.zeros_like(d_emb))
                def_e = def_e + self._gen_aura_cs(_def_civ_u, tt, d_emb | _def_nav).to(def_e.dtype)
                self._city_strike_resolve(  # one rule, four callers
                    strike, tt, d_slot, d_seat, _okm, _okc, is_rmil, atk_cs,
                    def_e, def_hp, 0, "pestk")

        # Cities heal +20 when no hostile stands adjacent — barbarians, or civ
        # units whose civ is at war. TS unitsHostile counts civ CIVILIANS too,
        # so an at-war builder besieges: both occupancy planes are read.
        nb_c = self.neigh[self.site.clamp(min=0)]  # [B, C, 6]
        nbf = nb_c.clamp(min=0).reshape(B, -1)
        _mf = self.occ_mil.gather(1, nbf)
        _mfs = torch.where(_mf >= 0, self.unit_seat.gather(1, _mf.clamp(min=0)), torch.full_like(_mf, -1))
        adj_b = (_mfs == BARB_SEAT).reshape(B, self.C, 6)
        rvn = torch.where((_mfs > 0) & (_mfs != BARB_SEAT), _mf - self.POOL_LO["v"], torch.full_like(_mf, -1))
        rv_war = (rvn >= 0) & self.r_atwar.gather(1, self.v_civ.gather(1, rvn.clamp(min=0)).clamp(max=max(self.R - 1, 0)))
        _cf = self.occ_civ.gather(1, nbf)
        _cfs = torch.where(_cf >= 0, self.unit_seat.gather(1, _cf.clamp(min=0)), torch.full_like(_cf, -1))
        rvcn = torch.where((_cfs > 0) & (_cfs != BARB_SEAT), _cf - self.POOL_LO["v"], torch.full_like(_cf, -1))
        rvc_war = (rvcn >= 0) & self.r_atwar.gather(1, self.v_civ.gather(1, rvcn.clamp(min=0)).clamp(max=max(self.R - 1, 0)))
        besieged = ((adj_b | (rv_war | rvc_war).reshape(B, self.C, 6)) & (nb_c >= 0)).any(dim=2)
        healable = self.alive & (self.city_hp < city_max_hp) & ~besieged
        self.city_hp.copy_(torch.where(healable, (self.city_hp + cb.get("cityHealPerTurn", 20)).clamp(max=city_max_hp), self.city_hp))
        # The outer wall pool heals on the SAME unbesieged gate and rate (cap
        # wallsHp), even at full city HP — there is no full-HP skip.
        if self._walls_bidx >= 0:
            heal_o = self.alive & self.buildings[:, :, self._walls_bidx] & ~besieged
            self.outer_hp.copy_(torch.where(heal_o, (self.outer_hp + cb.get("cityHealPerTurn", 20)).clamp(max=self._walls_hp), self.outer_hp))
        # The ENCAMPMENT garrison repairs on the SAME unbesieged gate and rate
        # as the wall pool: the gate is the CITY's siege state, not the
        # district's own adjacency.
        if self._encamp_didx >= 0:
            _enc_t = (
                (self.district == self._encamp_didx)
                & self.district_complete
                & ~self.district_pillaged
                & ~self.district_dead  # captured: TS's fresh City has no districts
                & (self.tile_seat == 0)
            )
            _unbes = self.alive & ~besieged  # [B, C]
            _heal_t = _enc_t & _unbes.gather(1, self.owner.clamp(min=0))
            self.encamp_hp.copy_(torch.where(
                _heal_t,
                (self.encamp_hp + cb.get("cityHealPerTurn", 20)).clamp(max=self._encamp_hp_max),
                self.encamp_hp,
            ))

    # --- city-states (phase 4c) ---------------------------------------------------
