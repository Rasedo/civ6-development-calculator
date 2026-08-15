"""Unit-order application (every seat), captures, founding mutations, the barbarian phase.

One mixin of BatchSim (assembled in engine.py); state and helpers live on
self / gpu/core/simbase.py.
"""
from __future__ import annotations

from .simbase import *  # noqa: F401,F403 — torch, constants, helpers: the shared floor
from .simbase import _MUTABLE  # noqa: F401 — private names do not ride a star import
from . import simbase  # the PATCHABLE globals (the pool caps/_ALIAS_CHECK) must be read live


class SimOrders:
    def _apply_seat_unit_actions(self, row: int, actions: torch.Tensor) -> None:
        """Execute seat row `row`'s unit orders — THE applier, for every seat.

        `actions` is [B, simbase.UNIT_SLOTS]: head row n carries the order for
        the n-th of this seat's living units in slot (= spawn) order, the
        layout `_seat_slot_map` and `_seat_unit_mask` both speak. -1 and 12 are
        HOLD.

        That head order IS `state.units.filter(u => u.seat === row)`: every
        major seat appends at the one shared cursor and the step-end compaction
        is stable, so a seat's slots keep their relative order forever.

        Orders are RE-VALIDATED here (an earlier unit's move can invalidate a
        later one's) and combat draws from the shared RNG stream, so this walk
        order is part of the parity contract.

        The combat arms dispatch one GAME at a time, because a head row maps to
        a different merged slot per game; every other verb stays batched.
        """
        B, dev = self.B, self.device
        smap = self._seat_slot_map(row)
        ctl = self.seat_ext[:, row]
        techs, civics = self.civ_techs[:, row], self.civ_civics[:, row]
        own_tile = self.tile_seat == row
        for n in range(simbase.UNIT_SLOTS):
            slot = smap[:, n]
            if not bool((slot >= 0).any()):
                break  # the head is dense: an empty row in every game ends it
            sc = slot.clamp(min=0)
            # LIVE, not merely mapped: `smap` is a loop-top snapshot and an
            # earlier order can disband its own unit or lose it to a counter.
            present = (slot >= 0) & ctl & self.unit_alive.gather(1, sc.unsqueeze(1)).squeeze(1)
            a = actions[:, n].to(torch.long)
            act = present & (a >= 0) & (a != 12)
            if not bool(act.any()):
                continue
            here = self.unit_tile.gather(1, sc.unsqueeze(1)).squeeze(1)
            hc = here.clamp(min=0)
            utp = self.unit_type.gather(1, sc.unsqueeze(1)).squeeze(1)
            ut = utp.clamp(min=0, max=self.NU - 1)
            is_civ = self._type_civilian[utp.clamp(min=0)]
            u_emb = self.unit_emb.gather(1, sc.unsqueeze(1)).squeeze(1)
            u_charges = self.unit_charges.gather(1, sc.unsqueeze(1)).squeeze(1)
            nb = self.neigh[hc]  # [B, 6]

            # --- FOUND_CITY: a settler founds where it stands, consumed ------
            if getattr(self, "_A_FOUND", -1) >= 0 and self._settler_idx >= 0:
                fnd = act & (a == self._A_FOUND) & (utp == self._settler_idx)
                if bool(fnd.any()):
                    made = self._found_city_at(row, fnd, here)
                    if bool(made.any()):
                        fr = made.nonzero(as_tuple=True)[0]
                        self.civilian_at[fr, here[fr]] = -1
                        self.unit_alive[fr, sc[fr]] = False

            # --- MOVE 0-5 ---------------------------------------------------
            mv = act & (a < 6)
            if bool(mv.any()):
                dirs = a.clamp(min=0, max=5)
                tgt = nb.gather(1, dirs.unsqueeze(1)).squeeze(1)
                tc = tgt.clamp(min=0)
                blocked = torch.where(
                    is_civ,
                    self._blocked_for(tgt.unsqueeze(1), row, is_civilian=True).squeeze(1),
                    self._blocked_for(tgt.unsqueeze(1), row).squeeze(1),
                )
                # The MASK's three-way terrain body, at the apply surface: one
                # legality rule, both surfaces. A naval hull takes the water
                # plane (OCEAN behind CARTOGRAPHY); a land unit takes the land
                # plane, or the EMBARK gate (SHIPBUILDING, at war with anyone).
                terr = self.passable.gather(1, tc.unsqueeze(1)).squeeze(1)
                is_nav = self.unit_naval[ut]
                if self._embark_live:
                    cart = (techs[:, self._cartography_tech] if self._cartography_tech >= 0
                            else torch.zeros(B, dtype=torch.bool, device=dev))
                    ship = (techs[:, self._shipbuilding_tech] if self._shipbuilding_tech >= 0
                            else torch.zeros(B, dtype=torch.bool, device=dev))
                    water = self.wpass.gather(1, tc.unsqueeze(1)).squeeze(1) & (
                        ~self.ocean_tile.gather(1, tc.unsqueeze(1)).squeeze(1) | cart
                    )
                    any_war = self.war[:, row].any(dim=1)
                    terr = torch.where(is_nav, water, terr | (water & ship & ~is_nav & any_war))
                # stepUnit refuses a cliff edge internally and `_step_verb` does
                # not, so the refusal is spelled out here; walkPath's
                # movesLeft > 0 loop gate likewise (the DISEMBARK arm costs "all
                # remaining", which the afford test alone reads as free at 0).
                clf = self._cliff_block_dirs(hc, nb, own_tile).gather(1, dirs.unsqueeze(1)).squeeze(1)
                mp = self.unit_mp.gather(1, sc.unsqueeze(1)).squeeze(1)
                ok = mv & (tgt >= 0) & terr & ~blocked & ~clf & (mp > 0)
                if bool(ok.any()):
                    self._step_verb(ok, sc, here, tgt, dirs, row, is_civ)  # the shared step contract

            # --- ATTACK 6-11 ------------------------------------------------
            atk = (
                act & (a >= 6) & (a < 12)
                & (self._type_combat[utp.clamp(min=0)] > 0)  # civilians cannot attack
                & ~u_emb                                     # nor can an embarked unit
            )
            if bool(atk.any()):
                dirs = (a - 6).clamp(min=0, max=5)
                tgt = nb.gather(1, dirs.unsqueeze(1)).squeeze(1)
                tc = tgt.clamp(min=0)
                valid = atk & (tgt >= 0)
                if bool(valid.any()):
                    # WHO is on the target tile, and is any of them hostile to
                    # this seat? `unitsHostile` answers for every pair, so no
                    # seat needs a clause of its own.
                    _ms = self.military_at.gather(1, tc.unsqueeze(1)).squeeze(1)
                    _cs = self.civilian_at.gather(1, tc.unsqueeze(1)).squeeze(1)
                    neg = torch.full_like(_ms, -1)
                    m_seat = torch.where(_ms >= 0, self.unit_seat.gather(1, _ms.clamp(min=0).unsqueeze(1)).squeeze(1), neg)
                    c_seat = torch.where(_cs >= 0, self.unit_seat.gather(1, _cs.clamp(min=0).unsqueeze(1)).squeeze(1), neg)
                    host_m = self._seats_hostile(row, m_seat.unsqueeze(1)).squeeze(1)
                    host_c = self._seats_hostile(row, c_seat.unsqueeze(1)).squeeze(1)
                    # cityFirst = no hostile occupant, or a hostile MILITARY
                    # among them. A LONE hostile civilian shields the centre —
                    # it is captured (or shot) instead.
                    city_first = ~(host_c & ~host_m)
                    ctr = self._centre_seat_plane().gather(1, tc.unsqueeze(1)).squeeze(1)
                    city_t = self._seats_hostile(
                        row, torch.where((ctr >= 0) & (ctr < 100), ctr, neg).unsqueeze(1)).squeeze(1)
                    cs_t = torch.zeros_like(valid)
                    if self.S > 0:
                        _cst = torch.zeros(B, self.T, dtype=torch.bool, device=dev)
                        _cst.scatter_(1, self.citystate_center[:, :self.S].clamp(min=0), self._citystate_target(row))
                        cs_t = _cst.gather(1, tc.unsqueeze(1)).squeeze(1) & (ctr >= 100)
                    melee = self._type_ranged_strength[ut] <= 0
                    # meleeAttackInner's precedence as DISJOINT arms (a legal
                    # column landing in none of them is a silent no-op):
                    #   1. a live enemy Encampment — only with the tile clear of
                    #      hostile units and no centre on it (`rangedAttack` has
                    #      no district arm at all),
                    #   2. a MAJOR centre under city-first,
                    #   3. a CITY-STATE centre under city-first,
                    #   4. the unit resolver.
                    enc_t = (
                        self._encamp_block(tc.unsqueeze(1), row).squeeze(1)
                        & melee & ~host_m & ~host_c & ~city_t & ~cs_t
                        if self._encamp_didx >= 0 else torch.zeros_like(valid)
                    )
                    city_hit = city_t & city_first
                    cs_hit = cs_t & ~city_t & city_first
                    unit_hit = (host_m | host_c) & ~city_hit & ~cs_hit
                    _css = self.citystate_at.gather(1, tc.unsqueeze(1)).squeeze(1).clamp(min=0)
                    for b_ in valid.nonzero(as_tuple=True)[0].tolist():
                        v = int(sc[b_])
                        one = torch.zeros(B, dtype=torch.bool, device=dev)
                        one[b_] = True
                        if bool(melee[b_]):
                            if bool(enc_t[b_]):
                                self._attack_encampment(one, tc, "major", v)
                            elif bool(city_hit[b_]):
                                self._melee_city(one, tgt, "major", v)
                            elif bool(cs_hit[b_]):
                                _csr = self._assault_city_state(one, _css, tgt, "major", v)
                                if _csr is not None and bool(_csr[2].any()):
                                    self._capture_city_state(
                                        _csr[2].nonzero(as_tuple=True)[0], _css, self.unit_seat[:, v])
                            elif bool(unit_hit[b_]):
                                self._hostile_vs_unit(one, tgt, "major", v)
                            else:
                                continue  # nothing to attack — TS's `no(...)`, no MP spent
                            self.unit_mp[b_, v] = 0  # the turn is spent (TS movesLeft = 0)
                        else:
                            # rangedAttack: one roll, no retaliation, no
                            # advance. It re-derives its own target and returns
                            # the rows that actually fired — its refusals are
                            # TS's early returns, which leave movesLeft alone.
                            if bool(self._ranged_attack(one, tgt, "major", v)[b_]):
                                self.unit_mp[b_, v] = 0

            # --- SNIPE (the distance-2 ring) --------------------------------
            if getattr(self, "_snipe_on", False):
                snp = act & (a >= self._A_SNIPE) & (a < self._A_SNIPE + 12) & ~is_civ
                if bool(snp.any()):
                    tgt_s = self.ring2[hc].gather(1, (a - self._A_SNIPE).clamp(min=0, max=11).unsqueeze(1)).squeeze(1)
                    ok_s = (
                        snp & (tgt_s >= 0) & ~u_emb
                        & (self._type_ranged_strength[ut] > 0) & (self._type_ranged_range[ut] >= 2)
                    )
                    for b_ in ok_s.nonzero(as_tuple=True)[0].tolist():
                        v = int(sc[b_])
                        one = torch.zeros(B, dtype=torch.bool, device=dev)
                        one[b_] = True
                        # SNIPE is `hostileRangedStrike`, NOT `rangedAttack`:
                        # its city arm floors at 1 HP without the melee counter
                        # and its scope-out keeps a major's fire off another
                        # major's units. Spend only when it fired.
                        if bool(self._hostile_ranged_strike(one, tgt_s, "major", v)[b_]):
                            self.unit_mp[b_, v] = 0

            # --- CHOP (builderRemoveFeature) --------------------------------
            # canRemoveFeature has NO ownership test — the GRANT checks the
            # owner itself — so the lump lands only inside this seat's borders,
            # in the city that owns the tile: food -> its growth box,
            # production -> its head progress, banked when the queue is idle.
            if self._builder_idx >= 0:
                ftr = self.tile_ftr.gather(1, hc.unsqueeze(1)).squeeze(1)
                ftu = self.tile_ftu.gather(1, hc.unsqueeze(1)).squeeze(1)
                chp = (
                    act & (a == self._A_CHOP)
                    & (utp == self._builder_idx)
                    & (u_charges > 0)
                    & (ftr > 0)
                    & (ftu >= 0) & techs.gather(1, ftu.clamp(min=0).unsqueeze(1)).squeeze(1)
                    & ~self.feat_stripped.gather(1, hc.unsqueeze(1)).squeeze(1)
                )
                if bool(chp.any()):
                    cr = chp.nonzero(as_tuple=True)[0]
                    ct = hc[cr]
                    self.unit_mp[cr, sc[cr]] = 0  # the turn is spent (TS movesLeft = 0)
                    self._strip_feature_at(cr, ct)
                    if self.LUMBER >= 0:
                        was_l = self.improvement[cr, ct] == self.LUMBER
                        self.improvement[cr, ct] = torch.where(
                            was_l, torch.full_like(self.improvement[cr, ct], -1), self.improvement[cr, ct])
                    done = (techs.sum(dim=1) + civics.sum(dim=1)).to(self.dtype)
                    amount = js_round(20.0 + 2.5 * done)
                    col_c = self._city_col_at(row, cr, ct)
                    for i2 in range(len(cr)):
                        b2, j2 = int(cr[i2]), int(col_c[i2])
                        if j2 < 0:
                            continue  # outside this seat's borders: chopped, no lump
                        amt = float(amount[b2])
                        if int(ftr[cr[i2]]) == 1:
                            self.city_growth[b2, row, j2] += amt
                        elif int(self.city_current[b2, row, j2]) >= 0:
                            self.city_progress[b2, row, j2] += amt
                        else:
                            self.city_prod_bank[b2, row, j2] += amt
                    self.unit_charges[cr, sc[cr]] -= 1
                    spent = chp & (self.unit_charges.gather(1, sc.unsqueeze(1)).squeeze(1) <= 0)
                    if bool(spent.any()):
                        dr = spent.nonzero(as_tuple=True)[0]
                        self.unit_alive[dr, sc[dr]] = False
                        self.civilian_at[(dr, hc[dr])] = -1

            # --- BUILD / REPAIR / RESOURCE IMPROVEMENTS ---------------------
            if self.improvements_on and self._builder_idx >= 0:
                hf = (civics[:, self._hillfarms_civic] if self._hillfarms_civic >= 0
                      else torch.zeros(B, dtype=torch.bool, device=dev))
                mining = (techs[:, self._mine_unlock_tech] if self._mine_unlock_tech >= 0
                          else torch.zeros(B, dtype=torch.bool, device=dev))
                constr = (techs[:, self._lumber_unlock_tech] if self._lumber_unlock_tech >= 0
                          else torch.zeros(B, dtype=torch.bool, device=dev))
                # validImprovements' shared half: a builder with charges on an
                # OWN, empty, non-centre tile.
                here_ok = (
                    act & (utp == self._builder_idx) & (u_charges > 0)
                    & own_tile.gather(1, hc.unsqueeze(1)).squeeze(1)
                    & (self.centre_slot_at.gather(1, hc.unsqueeze(1)).squeeze(1) < 0)
                    & (self.improvement.gather(1, hc.unsqueeze(1)).squeeze(1) < 0)
                    & (self.district.gather(1, hc.unsqueeze(1)).squeeze(1) < 0)
                    & (self.built_wonder.gather(1, hc.unsqueeze(1)).squeeze(1) < 0)  # an in-flight wonder pave refuses improvements
                )
                _rq = self.res_imp.gather(1, hc.unsqueeze(1)).squeeze(1)
                did = torch.zeros(B, dtype=torch.bool, device=dev)
                for _k in range(self._imp_unlock.numel()):
                    _col = self._A_IMP[_k] if _k < len(self._A_IMP) else -1
                    if _col < 0:
                        continue
                    if _k == self.FARM:
                        _valid = self.farm_flat.gather(1, hc.unsqueeze(1)).squeeze(1) | (
                            self.farm_hill.gather(1, hc.unsqueeze(1)).squeeze(1) & hf)
                    elif _k == self.MINE:
                        _valid = self.mine_ok.gather(1, hc.unsqueeze(1)).squeeze(1) & mining
                    elif _k == self.LUMBER:
                        _valid = (self.lumber_ok.gather(1, hc.unsqueeze(1)).squeeze(1)
                                  & ~self.feat_stripped.gather(1, hc.unsqueeze(1)).squeeze(1) & constr)  # a chopped tile has no woods left to mill
                    else:
                        _ut = int(self._imp_unlock[_k])
                        _unl = (techs[:, _ut] if _ut >= 0
                                else torch.ones(B, dtype=torch.bool, device=dev))
                        if self.SEASIDE >= 0 and _k == self.SEASIDE:
                            _valid = self._seaside_ok().gather(1, hc.unsqueeze(1)).squeeze(1) & _unl
                        else:
                            _valid = (_rq == _k) & _unl
                    _ok = here_ok & (a == _col) & _valid
                    if bool(_ok.any()):
                        _r = _ok.nonzero(as_tuple=True)[0]
                        self.improvement[_r, hc[_r]] = _k
                        self.pillaged[_r, hc[_r]] = False
                        did[_r] = True
                if bool(did.any()):
                    _r = did.nonzero(as_tuple=True)[0]
                    self.unit_charges[_r, sc[_r]] -= 1
                    self.unit_mp[_r, sc[_r]] = 0  # the turn is spent (TS movesLeft = 0)
                    self._eff_version += 1
                    _sp = did & (self.unit_charges.gather(1, sc.unsqueeze(1)).squeeze(1) <= 0)
                    if bool(_sp.any()):
                        _dr = _sp.nonzero(as_tuple=True)[0]
                        self.unit_alive[_dr, sc[_dr]] = False
                        self.civilian_at[(_dr, hc[_dr])] = -1
                # REPAIR (`builderRepair`): improvement first, else district;
                # the turn is spent, NO charge.
                _rp = (
                    act & (a == self._A_REPAIR) & (utp == self._builder_idx)
                    & own_tile.gather(1, hc.unsqueeze(1)).squeeze(1)
                    & (self.pillaged.gather(1, hc.unsqueeze(1)).squeeze(1)
                       | self.district_pillaged.gather(1, hc.unsqueeze(1)).squeeze(1))
                )
                if bool(_rp.any()):
                    _r = _rp.nonzero(as_tuple=True)[0]
                    _tt = hc[_r]
                    _imp = self.pillaged[_r, _tt]
                    self.pillaged[_r[_imp], _tt[_imp]] = False
                    _dis = ~_imp & self.district_pillaged[_r, _tt]
                    self.district_pillaged[_r[_dis], _tt[_dis]] = False
                    self.unit_mp[_r, sc[_r]] = 0
                    self._eff_version += 1

            # --- PILLAGE (`seatPillage`) ------------------------------------
            # A MILITARY unit on an ENEMY tile wrecks the improvement, else a
            # complete non-centre district. Enemy = an AT-WAR major's land, or
            # ANY city-state's (a minor's territory needs no declaration).
            if self._act_names and self._A_PILLAGE > 0:
                _ts = self.tile_seat.gather(1, hc.unsqueeze(1)).squeeze(1)
                _en = (
                    ((_ts >= 0) & (_ts < 100)
                     & self.war[:, row].gather(1, _ts.clamp(min=0, max=self.NS - 1).unsqueeze(1)).squeeze(1))
                    | ((_ts >= 100) & (_ts < BARB_SEAT))
                )
                _hi = (self.improvement.gather(1, hc.unsqueeze(1)).squeeze(1) >= 0) & ~self.pillaged.gather(1, hc.unsqueeze(1)).squeeze(1)
                _hd = (
                    (self.district.gather(1, hc.unsqueeze(1)).squeeze(1) >= 0)
                    & self.district_complete.gather(1, hc.unsqueeze(1)).squeeze(1)
                    & ~self.district_pillaged.gather(1, hc.unsqueeze(1)).squeeze(1)
                    & (self.centre_slot_at.gather(1, hc.unsqueeze(1)).squeeze(1) < 0)
                )
                _pl = act & (a == self._A_PILLAGE) & (self._type_combat[utp.clamp(min=0)] > 0) & _en & (_hi | _hd)
                if bool(_pl.any()):
                    _r = _pl.nonzero(as_tuple=True)[0]
                    _tt = hc[_r]
                    _pi = _hi[_r]
                    self.pillaged[_r[_pi], _tt[_pi]] = True
                    # FOOD improvements (PILLAGE_HEAL) heal their pillager +25,
                    # capped at full HP — every pillage arm carries it.
                    _impv = self.improvement[_r[_pi], _tt[_pi]]
                    _hl = self._imp_heals[_impv.clamp(min=0)] & (_impv >= 0)
                    _hr = _r[_pi][_hl]
                    if _hr.numel():
                        _cap = int(self.rules.combat.get("unitHp", 100))
                        self.unit_hp[_hr, sc[_hr]] = (self.unit_hp[_hr, sc[_hr]] + 25).clamp(max=_cap)
                    _pd = ~_pi & _hd[_r]
                    self.district_pillaged[_r[_pd], _tt[_pd]] = True
                    self.unit_mp[_r, sc[_r]] = 0
                    self._eff_version += 1

            # --- SPREAD (religious pressure) --------------------------------
            # The lump into the target city's accumulator for religion `row` —
            # a religion's id IS its founder's seat. Charge -1, disband at 0.
            if getattr(self, "_A_SPREAD", -1) >= 0:
                spx = act & (a >= self._A_SPREAD) & (a < self._A_SPREAD + 7)
                if bool(spx.any()):
                    _relig = torch.zeros_like(spx)
                    if self._missionary_idx >= 0:
                        _relig = _relig | (utp == self._missionary_idx)
                    if getattr(self, "_apostle_idx", -1) >= 0:
                        _relig = _relig | (utp == self._apostle_idx)
                    dsp = (a - self._A_SPREAD).clamp(min=0)
                    tgt_sp = torch.where(
                        dsp == 0, here,
                        nb.gather(1, (dsp - 1).clamp(min=0, max=5).unsqueeze(1)).squeeze(1),
                    )
                    ok_sp = (
                        spx & _relig & (tgt_sp >= 0) & (u_charges > 0)
                        & self.civ_religion_done[:, row]
                    )
                    if bool(ok_sp.any()):
                        nrows = 1 + self.R
                        tc_sp = tgt_sp.clamp(min=0)
                        lump = self._enh["mlump"][self.civ_enhancer[:, row] + 1]
                        pm = (
                            ok_sp.reshape(B, 1, 1)
                            & self.city_alive[:, :nrows]
                            & (self.city_center[:, :nrows] == tc_sp.reshape(B, 1, 1))
                        )
                        pb, pr, pj = pm.nonzero(as_tuple=True)
                        if len(pb):
                            self.city_pressure[pb, pr, pj, row] += lump[pb]
                        landed = pm.reshape(B, -1).any(dim=1)
                        if bool(landed.any()):
                            lr = landed.nonzero(as_tuple=True)[0]
                            self.unit_charges[lr, sc[lr]] -= 1
                            self.unit_mp[lr, sc[lr]] = 0
                            dead = landed & (self.unit_charges.gather(1, sc.unsqueeze(1)).squeeze(1) <= 0)
                            if bool(dead.any()):
                                dr = dead.nonzero(as_tuple=True)[0]
                                self.unit_alive[dr, sc[dr]] = False
                                self.civilian_at[(dr, hc[dr])] = -1

    def _relocate_palace(self, rows: torch.Tensor, seat_row: torch.Tensor) -> None:
        """Re-crown a seat's capital — the `relocatePalace` mirror, ONE body
        for every seat row. `rows`/`seat_row` are parallel [n] tensors: the
        losing seat per game row.

        Call it immediately after a city leaves its seat's list (capture,
        loyalty defection or raze) — TS calls relocatePalace right there.
        No-op when the seat is gone (no live city) or still holds a capital;
        otherwise the surviving city with the HIGHEST population is
        re-crowned, ties to the EARLIEST array position (TS scans the array
        with a strict `>`). The scan order is the seat's cities-ARRAY order —
        slot order for EVERY row under append+reclaim (#110).

        The PALACE BUILDING needs no write: both engines model it as a
        capital TERM (city_is_cap × the palace yield/housing/amenity terms),
        never a b_cost row. `civ_cap_tile` deliberately does NOT move: the
        ORIGINAL capital stays the domination anchor, as in real Civ 6, while
        the relocated Palace carries the capital BONUSES."""
        if rows.numel() == 0:
            return
        alive = self.city_alive[rows, seat_row]  # [n, RC]
        need = alive.any(dim=1) & ~(self.city_is_cap[rows, seat_row] & alive).any(dim=1)  # [n]
        if not bool(need.any()):
            return
        seq = torch.arange(self.RC, device=self.device).reshape(1, -1).expand_as(alive)
        key = torch.where(alive, self.city_pop[rows, seat_row] * (1 << 20) - seq, torch.full_like(seq, -(1 << 60)))
        pick = key.max(dim=1).indices  # [n] (garbage where ~need, masked below)
        self.city_is_cap[rows[need], seat_row[need], pick[need]] = True
        self._eff_version += 1  # yield-bearing: the palace term just moved

    def _capture_city_state(self, rows: torch.Tensor, citystate_of: torch.Tensor, dst_rows) -> None:
        """Annex a city-state into ANY seat row — the `captureCityState` twin.

        The minor ceases and its envoys die with it (citystate_alive gates every
        consumer). Territory within radius 2 that the minor owns transfers, pop
        lands at ×0.75 floor 1, and the new city starts at half HP with zero
        boxes, zero tilesAcquired, no buildings, no districts beyond its
        CITY_CENTER and no religion. The seat city cap applies here too: a FULL
        empire RAZES the city-state instead of annexing it — the minor dies, its
        ring frees, and NO city is founded.

        `dst_rows` is the receiving block row: an int, or a [B] tensor when the
        row is the conquering unit's and so is read per game."""
        dev = self.device
        half_hp = (int(self.rules.combat.get("cityMaxHp", 200)) + 1) // 2  # Math.round(CITY_MAX_HP / 2)
        max_cities = int(self.rules.seats.get("maxCities", 6))
        for i in range(len(rows)):
            b = int(rows[i]); s = int(citystate_of[rows[i]])
            row = dst_rows if isinstance(dst_rows, int) else int(dst_rows[b])
            c_t = int(self.citystate_center[b, s])
            pop = max(1, (int(self.citystate_pop[b, s]) * 3) // 4)
            self.citystate_alive[b, s] = False
            # A route dies with its endpoint, for WHICHEVER seat holds it — the
            # minor is encoded -(2+s) in every row's dest column, seat 0's too.
            dead_cs = self.seat_routes[b, :, :, 1] == -(2 + s)  # [NS, K]
            self.seat_routes[b] = torch.where(dead_cs.unsqueeze(2), torch.full_like(self.seat_routes[b], -1), self.seat_routes[b])
            self.seat_route_dest[b] = torch.where(dead_cs, torch.full_like(self.seat_route_dest[b], -1), self.seat_route_dest[b])
            self.seat_route_exp[b] = torch.where(dead_cs, torch.full_like(self.seat_route_exp[b], -1), self.seat_route_exp[b])
            # tilesWithin(centre, 2) that this minor owns — a city-state's tile
            # ownership lives in tile_seat as 100+s.
            ring = (self.pair_dist[c_t] <= 2) & (self.tile_seat[b] == 100 + s)
            self.tile_seat[b] = torch.where(ring, torch.full_like(self.tile_seat[b], NO_SEAT), self.tile_seat[b])
            self._tile_owner_ver += 1
            if int(self.city_alive[b, row].sum()) >= max_cities:
                continue  # razed at the seat city cap — the TS early return, before nextCityId++
            col = self._seat_city_append(b, row)
            new_id = int(self.civ_next_city_id[b, row])
            self.civ_next_city_id[b, row] += 1
            # setTileOwner's two halves — the seat and the city id — over the
            # ring and, unconditionally, over the centre.
            self.tile_seat[b] = torch.where(ring, torch.full_like(self.tile_seat[b], row), self.tile_seat[b])
            self.tile_city[b] = torch.where(ring, torch.full_like(self.tile_city[b], new_id), self.tile_city[b])
            self.tile_seat[b, c_t] = row
            self.tile_city[b, c_t] = new_id
            self._tile_owner_ver += 1
            self.city_alive[b, row, col] = True
            self.era_score[b, row] += self._era_pts["conquer"]  # gained a city (the raze path continued above)
            self._reveal_around(torch.tensor([b], dtype=torch.long, device=dev), row,
                                torch.tensor([c_t], dtype=torch.long, device=dev), 3)
            self.city_id[b, row, col] = new_id
            self.city_is_cap[b, row, col] = False  # an annexed minor is never a capital
            self.city_center[b, row, col] = c_t
            self.city_pop[b, row, col] = pop
            self.city_hp[b, row, col] = half_hp
            self.city_loyalty[b, row, col] = 100.0
            self.centre_slot_at[b, c_t] = col
            # Everything the TS literal leaves empty. A city-state carries no
            # buildings, districts, wonders, works or religion, so all of this is
            # SLOT HYGIENE: the append head is a compacted-away city's index, and
            # a fact left behind would serve the previous occupant's.
            self.city_growth[b, row, col] = 0
            self.city_cbox[b, row, col] = 0
            self.city_acquired[b, row, col] = 0
            self.city_outer_hp[b, row, col] = 0
            self.city_current[b, row, col] = -1
            self.city_progress[b, row, col] = 0
            self.city_cost[b, row, col] = 0
            self.city_qtile[b, row, col] = -1
            self.city_prod_bank[b, row, col] = 0
            self.city_gw_writing[b, row, col] = 0
            self.city_gw_art[b, row, col] = 0
            self.city_gw_music[b, row, col] = 0
            self.city_relics[b, row, col] = 0
            self.city_artifacts[b, row, col] = 0
            self.city_dist_tile[b, row, col, :] = -1
            self.city_wonder[b, row, col, :] = -1
            self.city_bldg[b, row, col, :] = False
            self.city_followed[b, row, col] = -1
            self.city_pressure[b, row, col, :] = 0
        self._eff_version += 1

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

    def _seat_upkeep_and_bankruptcy(self, row: int, active: torch.Tensor) -> None:
        """Unit upkeep + the bankruptcy rule for ONE seat row (0 = seat 0,
        r+1 = civ r), at the loop position right after the seat's gold lands:
        charge maintenance for every living unit of this seat off the POOLED
        planes, then disband while insolvent. An eliminated actor charges
        nothing (the TS loop's eliminated-actor continue)."""
        if not self.units_mode:
            return
        mine = self.unit_alive & (self.unit_seat == row)
        upkeep = (self._type_maintenance[self.unit_type.clamp(min=0, max=self.NU - 1)] * mine.to(self.dtype)).sum(dim=1)
        tre = self.civ_treasury[:, row]
        self.civ_treasury[:, row] = torch.where(active, tre - upkeep, tre)
        self._bankrupt_disband(row, active)

    def _bankrupt_disband(self, row: int = 0, active: torch.Tensor | None = None) -> None:
        """Disband ONE unit of seat-row `row` per turn while its treasury is
        insolvent — milli-rounded test (sub-milli non-dyadic gold drift must
        not trip the < 0 boundary here but not on TS). The priciest alive
        unit goes; ties break to the lowest slot (= oldest, matching TS's
        lowest id: the window only ever appends, so ONE seat's slots ascend in
        that seat's own spawn order even though every major seat interleaves
        into it). Only upkeep>0 units are candidates, and there is no refund.
        `active` is the TS loop's eliminated-actor continue."""
        insolvent = js_round(self.civ_treasury[:, row] * 1000) < 0  # [B]
        if active is not None:
            insolvent = insolvent & active
        if not bool(insolvent.any()):
            return
        maint = self._type_maintenance[self.unit_type.clamp(min=0, max=self.NU - 1)]  # [B, W]
        cand = self.unit_alive & (self.unit_seat == row) & (maint > 0)
        W = cand.shape[1]
        slots = torch.arange(W, device=self.device, dtype=maint.dtype).unsqueeze(0)  # [1, W]
        # maximize (upkeep, -slot): upkeep*(W+1) - slot lets upkeep dominate, tie -> lowest slot
        score = torch.where(cand, maint * float(W + 1) - slots, torch.full_like(maint, -1e30))
        victim = score.argmax(dim=1)  # [B]
        do_kill = insolvent & cand.any(dim=1)
        if not bool(do_kill.any()):
            return
        rows = do_kill.nonzero(as_tuple=True)[0]
        vslot = victim[rows]
        vtile = self.unit_tile[rows, vslot]
        vciv = self._type_civilian[self.unit_type[rows, vslot].clamp(min=0, max=self.NU - 1)]  # clear military vs civilian occupancy
        mil = ~vciv
        if bool(mil.any()):
            self.military_at[(rows[mil], vtile[mil])] = -1
        if bool(vciv.any()):
            self.civilian_at[(rows[vciv], vtile[vciv])] = -1
        self.unit_alive[rows, vslot] = False

    def _barb_reset_mp(self) -> None:
        """Reset barbarian MP: `u.movesLeft = UNITS[u.type].moves`.

        Deliberately NOT `_reset_mp`: TS writes movesLeft ONLY, so movesFull
        keeps refreshUnits' embark-aware value — which is what stepUnit's
        afford rule and next turn's "spent no MP" gate both read — and it uses
        the plain type pool, not the embark one.
        """
        self.barb_unit_mp.copy_(self._type_moves[self.barb_unit_type.clamp(min=0, max=self.NU - 1)])

    def _barbarian_phase(self) -> None:
        """Run the barbarian phase, turn for turn and draw for draw.

        Camp roll → camp placement → per-camp garrison rolls → raider actions
        (attack else march) in unit order. NOTHING city-side runs here: a city
        fires and heals in its OWNER's block, through the one shared body."""
        cb, B, T, dev = self.rules.combat, self.B, self.T, self.device
        self._barb_reset_mp()  # barbarianPhase's own movesLeft reset
        # The shared barbarian MELEE era-ladder type index (barb_unit_type 0/1/2/3 =
        # WARRIOR/SPEARMAN/PIKEMAN/MUSKETMAN), the TS barbMeleeType twin.
        # self.turn is a batch scalar, so one index serves the whole batch, and
        # it feeds ALL THREE spawn sites (new camp, empty-camp regarrison, the
        # 0.1-roll raid). Barbarian barb_unit_type 6 = SCOUT in the unitCombat table.
        self._barb_scout_type = 6 if self._barb_ladder.numel() > 6 else 0
        self._barb_scout_live = bool(self.rules.combat.get("barbScoutOpenerLive", False))
        melee_type = (
            3 if self.turn > cb.get("musketmanAfterTurn", 180)
            else 2 if self.turn > cb.get("pikemanAfterTurn", 120)
            else 1 if self.turn > cb.get("spearmanAfterTurn", 60)
            else 0
        )
        # The RANGED barbarian ladder (barbRangedType): barb_unit_type 4 = ARCHER,
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
        any_city = self.city_alive[:, :1 + self.R].reshape(B, -1).any(dim=1)
        can_roll = any_city & (self.n_camps < self.max_camps)
        r1 = self._next_random(can_roll)
        want = can_roll & (r1 < cb.get("campSpawnChance", 0.08))
        if bool(want.any()):
            # Only the `want` rows consume the candidate planes, so build them
            # on the want sub-batch (boolean/integer ops row-restrict exactly;
            # the RNG calls keep their full-B masks unchanged).
            wr = want.nonzero(as_tuple=True)[0]
            near_city_w = ((self.pair_dist[self.city_center[wr, 0].clamp(min=0)] < 5) & self.city_alive[wr, 0].unsqueeze(2)).any(dim=1)  # [n, T]
            # campCandidates excludes t.district LIVE: camp_ok is static, but
            # paves are not, and an orphaned pave left over from a razed city
            # would pad the set and shift the draw-indexed camp spot.
            # Camps rise away from EVERY seat, so live CIV city centres repel
            # candidates too.
            rcc_w = self.city_center[wr, 1:1 + max(self.R, 1)].reshape(len(wr), -1)
            near_rc_w = ((self.pair_dist[rcc_w.clamp(min=0)] < 5) & self.city_alive[wr, 1:1 + max(self.R, 1)].reshape(len(wr), -1).unsqueeze(2)).any(dim=1)
            cand_w = self.camp_ok[wr] & (self.tile_seat[wr] < 0) & ~near_city_w & ~near_rc_w & (self.district[wr] < 0) & (self.built_wonder[wr] < 0)  # a live builtWonder excludes the tile too
            if self.fog_of_war:
                # camps rise IN THE FOG — only on tiles dark to EVERY major
                # seat (unexploredByAll; combat.ts's preferFog term).
                cand_w = cand_w & ~self.seat_explored[wr].any(dim=1)
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
                # (barb_unit_type 6), the TS barbScoutType twin, while regarrison and
                # raid sites keep the melee/ranged ladders. Spawn TYPE only, so
                # the camp roll above is untouched and this is draw-neutral.
                self._spawn_barb(has, spot, self._barb_scout_type if self._barb_scout_live else melee_type)

        # Garrisons + growth. The near-camp check uses the unit list as it
        # stood BEFORE this loop (TS snapshots `barbs` first); the cap check
        # recounts live (TS calls barbUnits() fresh inside the condition).
        # The camp↔unit distance matrix is hoisted: camps don't move, and units
        # spawned mid-loop are invisible to the pre_alive mask.
        pre_alive = self.barb_unit_alive.clone()
        any_camp = bool((self.camp_tile >= 0).any())
        if any_camp:
            du_all = self.pair_dist[self.camp_tile.clamp(min=0).unsqueeze(2), self.barb_unit_tile.unsqueeze(1)].to(torch.long)  # [B, K, U]
            near_any_all = (pre_alive.unsqueeze(1) & (du_all <= 1)).any(dim=2)  # [B, K]
        for k in range(self.K if any_camp else 0):
            camp = self.camp_tile[:, k]
            active = camp >= 0
            if not bool(active.any()):
                continue
            near_any = near_any_all[:, k]
            self._spawn_barb(active & ~near_any, camp, melee_type)  # era ladder (empty camp regarrisons)
            can_grow = active & near_any & (self.barb_unit_alive.sum(dim=1) < self.n_camps * cb.get("maxBarbPerCamp", 3))
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
                    & (self.military_at.gather(1, _nbc) < 0)  # no unit at all
                    & (self.civilian_at.gather(1, _nbc) < 0)
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
        guard = torch.zeros(B, simbase.BARB_POOL_MAX, dtype=torch.bool, device=dev)
        if any_camp:
            du_g = self.pair_dist[self.camp_tile.clamp(min=0).unsqueeze(2), self.barb_unit_tile.unsqueeze(1)].to(torch.long)  # [B, K, U]
        for k in range(self.K if any_camp else 0):
            camp = self.camp_tile[:, k]
            active = camp >= 0
            if not bool(active.any()):
                continue
            near = self.barb_unit_alive & (du_g[:, k] <= 1) & ~guard & active.unsqueeze(1)
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
        u_live = self.barb_unit_alive[:, :u_high].any(dim=0).nonzero(as_tuple=True)[0].tolist() if u_high else []
        # Which barbarian slots are RANGED (ARCHER/CROSSBOWMAN). Hoisted:
        # nothing spawns barbarians inside the raider loop, so barb_unit_type is fixed
        # here, and the batch-wide flag costs ONE host sync per turn instead of
        # one per slot.
        u_rngd_all = self.barb_unit_alive & (self._type_ranged_strength[self.barb_unit_type.clamp(min=0, max=self.NU - 1)] > 0)
        any_rngd = bool(u_rngd_all.any())
        for u in u_live:
            act = self.barb_unit_alive[:, u] & ~guard[:, u]
            if not bool(act.any()):
                continue
            here = self.barb_unit_tile[:, u]
            nb = self.neigh[here]  # [B, 6]
            nbc = nb.clamp(min=0)
            # A MAJOR's centre is a melee target whoever holds it —
            # `caps.alwaysHostile` needs no war and `cityAtIndex` names no
            # seat. `centre_slot_at` carries only major centres, so this one
            # predicate is the whole test.
            ctr = self.centre_slot_at.gather(1, nbc) >= 0
            # A NON-BARBARIAN unit is adjacent (a barbarian is not a target for
            # a barbarian). Civilians are never barbarian, so only the military
            # plane needs the seat test.
            _mn = self.military_at.gather(1, nbc)
            _mn_seat = torch.where(_mn >= 0, self.unit_seat.gather(1, _mn.clamp(min=0)), torch.full_like(_mn, -1))
            has_unit = ((_mn >= 0) & (_mn_seat != BARB_SEAT)) | (self.civilian_at.gather(1, nbc) >= 0)
            # An adjacent LIVE Encampment is a melee target for a barbarian too
            # (hostile to every owner) — attackTargets' encampTarget.
            enc_nb = self._encamp_block(nb, BARB_SEAT) if self._encamp_didx >= 0 else None
            valid = (nb >= 0) & (ctr | has_unit | (enc_nb if enc_nb is not None else False))
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
                rng_u = self._type_ranged_range[self.barb_unit_type[:, u].clamp(min=0, max=self.NU - 1)]
                d_all = self.pair_dist[here.clamp(min=0)].to(torch.long)  # [B, T]
                rng_valid = (
                    (d_all >= 1)
                    & (d_all <= rng_u.unsqueeze(1))
                    & (
                        self._nonbarb_unit_plane()
                        | (self.centre_slot_at >= 0)
                    )
                )
                rng_key = torch.where(rng_valid, self._arangeT.unsqueeze(0).expand(B, T), torch.full((B, T), T + 1, dtype=torch.long, device=dev))
                target_tile = torch.where(rngd, rng_key.min(dim=1).values, target_tile)
            attack = act & (target_tile <= T)
            ttc = target_tile.clamp(max=T - 1)
            # meleeAttackInner's precedence, ONE set of arms for every
            # centre: a city is attacked THROUGH a MILITARY garrison, but a
            # LONE CIVILIAN draws the blow itself — it is captured roll-free,
            # so it cannot be the thing a city is attacked through. Seat 0's
            # centre used to skip that test; TS never did.
            ctr_here = self.centre_slot_at.gather(1, ttc.unsqueeze(1)).squeeze(1) >= 0
            # a NON-BARBARIAN unit stands on the target tile
            has_u = self._nonbarb_unit_plane().gather(1, ttc.unsqueeze(1)).squeeze(1)
            has_mil = self._nonbarb_mil_plane().gather(1, ttc.unsqueeze(1)).squeeze(1)
            city_hit = ctr_here & (~has_u | has_mil)
            city_att = attack & ~rngd & city_hit
            unit_att = attack & ~rngd & has_u & ~city_hit
            enc_att = (
                attack
                & ~rngd
                & ~ctr_here
                & ~has_u
                & self._encamp_block(ttc.unsqueeze(1), BARB_SEAT).squeeze(1)
                if self._encamp_didx >= 0
                else None
            )

            if bool(city_att.any()):
                self._melee_city(city_att, ttc, "barb", u)
            if bool(unit_att.any()):
                self._hostile_vs_unit(unit_att, ttc, "barb", u)
            if enc_att is not None and bool(enc_att.any()):
                self._attack_encampment(enc_att, ttc, "barb", u)
            acted_att = city_att | unit_att
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
            rng_att = attack & rngd
            if any_rngd and bool(rng_att.any()):
                acted_att = acted_att | self._hostile_ranged_strike(rng_att, ttc, "barb", u)
            self.barb_unit_mp[:, u] = torch.where(acted_att, torch.zeros_like(self.barb_unit_mp[:, u]), self.barb_unit_mp[:, u])  # the turn is spent (TS movesLeft = 0)

            # Pillage: a raider that did not attack, standing on an owned,
            # improved, unpillaged tile, pillages it and holds (no march this
            # turn) — hostileUnitAct's pillage branch. Only FOOD improvements
            # heal the pillager (+25).
            pillage = torch.zeros_like(act)
            if self.improvements_on:
                h_imp = self.improvement.gather(1, here.unsqueeze(1)).squeeze(1) >= 0
                h_unpil = ~self.pillaged.gather(1, here.unsqueeze(1)).squeeze(1)
                # barbarians raid CIV improvements too
                # barbarians raid any MAJOR's improvements; a city-state's
                # are not in hostileUnitAct's set.
                _h_seat = self.tile_seat.gather(1, here.unsqueeze(1)).squeeze(1)
                h_owned = (_h_seat >= 0) & (_h_seat <= self.R)
                pillage = act & ~attack & h_imp & h_unpil & h_owned
                if bool(pillage.any()):
                    rows = pillage.nonzero(as_tuple=True)[0]
                    heal_r = self._imp_heals[self.improvement[rows, here[rows]].clamp(min=0)]
                    self.pillaged[rows, here[rows]] = True
                    self.barb_unit_mp[rows, u] = 0  # the turn is spent (TS movesLeft = 0)
                    self._eff_version += 1  # a farm's yield just dropped
                    hp_cap = self.rules.combat.get("unitHp", 100)
                    self.barb_unit_hp[rows, u] = torch.where(
                        heal_r, (self.barb_unit_hp[rows, u] + 25).clamp(max=hp_cap), self.barb_unit_hp[rows, u]
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
                _hd_seat = self.tile_seat.gather(1, here.unsqueeze(1)).squeeze(1)
                h_downed = (_hd_seat >= 0) & (_hd_seat <= self.R)
                dist_pillage = act & ~attack & ~pillage & (h_dist >= 0) & h_dcomp & h_dunpil & h_downed
                if bool(dist_pillage.any()):
                    rows = dist_pillage.nonzero(as_tuple=True)[0]
                    self.district_pillaged[rows, here[rows]] = True
                    self.barb_unit_mp[rows, u] = 0  # the turn is spent (TS movesLeft = 0)
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
                # `isCiv(tileSeat(t))` — owned by ANY major. A barbarian is
                # hostile to all of them, so no war term joins it.
                _owned = (self.tile_seat >= 0) & (self.tile_seat <= self.R)  # [B, T]
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
            # BARBARIANS MARCH ON ANYONE — every major's cities, on the TS
            # key: distance, then the seat id, then the centre tile
            # (`caps.alwaysHostile`, so no war term). Scanning row 0 alone left
            # a civ city un-besieged however close it stood.
            ckey_min = torch.full((B,), 10**18, dtype=torch.long, device=dev)
            city_tgt = here.clamp(min=0)
            for row2 in range(1 + self.R):
                for j in range(self.RC):
                    ct2 = self.city_center[:, row2, j].clamp(min=0)
                    d2 = self.pair_dist[here.clamp(min=0), ct2].to(torch.long)
                    key2 = torch.where(self.city_alive[:, row2, j],
                                       d2 * (2048 * 8) + row2 * 2048 + ct2,
                                       torch.full_like(d2, 10**18))
                    upd = key2 < ckey_min
                    ckey_min = torch.where(upd, key2, ckey_min)
                    city_tgt = torch.where(upd, ct2, city_tgt)
            tgt = torch.where(has_imp, imp_tgt, city_tgt)
            has_tgt = has_imp | (ckey_min < 10**18)
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
            gslot = torch.full_like(cur, u + self.POOL_LO["barb"])
            moving = march & has_tgt
            while bool(moving.any()):
                nb2 = self.neigh[cur.clamp(min=0)]
                nb2c = nb2.clamp(min=0)
                # A NAVAL barbarian walks the WATER plane. Land hulls and water
                # hulls never share a plane, so the plane swap is the whole
                # difference (TS's tileFreeForUnit branches on
                # UNITS[type].naval the same way).
                _navm = self.unit_naval[self.barb_unit_type[:, u].clamp(min=0)].unsqueeze(1)
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
                mp = self.barb_unit_mp[:, u]
                d_cur = torch.where(mv, torch.div(best, 8, rounding_mode="floor"), d_cur)
                cur = torch.where(mv, dest, cur)
                moving = mv & (mp > 0)

        # A seat-0 city's WALLS strike, its Encampment strike and its heal used
        # to run HERE, a phase early and in three all-cities passes, while every
        # other seat's ran per city inside its own seat block. Both engines now
        # run one body — `_seat_city_fire_and_heal` — at the per-city seatPhase
        # position, for every seat row. Nothing city-side belongs in the
        # barbarian phase.

    # --- city-states (phase 4c) ---------------------------------------------------
