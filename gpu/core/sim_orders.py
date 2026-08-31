from __future__ import annotations

from .simbase import *  # noqa: F401,F403 — torch, constants, helpers: the shared floor
from .simbase import _MUTABLE  # noqa: F401 — private names do not ride a star import
from . import simbase  # the PATCHABLE globals (the pool caps/_ALIAS_CHECK) must be read live


class SimOrders:
    def _spend_build_charge(self, r: torch.Tensor, sc: torch.Tensor, hc: torch.Tensor) -> None:
        """A charge and the turn, and the unit vanishes on its last one — the
        tail every Builder and Military Engineer verb shares."""
        self.unit_charges[r, sc[r]] -= 1
        self.unit_mp[r, sc[r]] = 0  # the turn is spent (TS movesLeft = 0)
        gone = self.unit_charges[r, sc[r]] <= 0
        if bool(gone.any()):
            d = r[gone]
            self.unit_alive[d, sc[d]] = False
            self._occ_clear(d, hc[d], sc[d])

    def _apply_seat_unit_actions(self, row: int, actions: torch.Tensor) -> None:
        B, dev = self.B, self.device
        smap = self._seat_slot_map(row)
        ctl = self.seat_ext[:, row]
        techs, civics = self.civ_techs[:, row], self.civ_civics[:, row]
        own_tile = self.tile_seat == row
        # Which RANKS are worth opening at all, decided once over the whole
        # [B, UNIT_SLOTS] block: the slot map and the action block are both
        # fixed for the call, so a rank no game commands can be skipped without
        # touching the sim. Liveness is NOT folded in — a unit can die to an
        # earlier rank's retaliation, so `present` below still reads it fresh.
        _n = min(smap.shape[1], actions.shape[1], simbase.UNIT_SLOTS)
        _held = smap[:, :_n] >= 0
        _cmd = _held & (actions[:, :_n] >= 0) & (actions[:, :_n] != 12) & ctl.unsqueeze(1)
        # Which ARMS can fire at each rank, decided from the action block alone
        # (fixed for the call, like the rank tables). Each arm's exact mask
        # still runs where its bit is set — the table only skips arms that are
        # PROVABLY empty, which is most of them on most ranks (a k>0 sequence
        # pass is moves-only by construction) and collapses the per-rank
        # guard-sync storm into this ONE sync.
        _ab = torch.where(_cmd, actions[:, :_n], torch.full_like(actions[:, :_n], -1))
        _no = torch.zeros_like(_cmd)
        _fc = getattr(self, "_A_FOUND", -1)
        _sn = getattr(self, "_A_SNIPE", -1) if getattr(self, "_snipe_on", False) else -1
        _sn3 = getattr(self, "_A_SNIPE3", -1) if getattr(self, "_snipe3_on", False) else -1
        _sp = getattr(self, "_A_SPREAD", -1)
        _xc = getattr(self, "_A_EXCAVATE", -1)
        _pk = getattr(self, "_A_PARK", -1)
        _pm = getattr(self, "_A_PROMOTE", -1)
        _cn = getattr(self, "_A_CONDEMN", -1)
        _hx = getattr(self, "_A_HERESY", -1)
        _lq = getattr(self, "_A_INQUISITION", -1)
        _hn = getattr(self, "_A_HEATHEN", -1)
        _ug = getattr(self, "_A_UPGRADE", -1)
        _ar = getattr(self, "_A_AIR_STRIKE", -1)
        _apc = getattr(self, "_A_AIR_PILLAGE", -1)
        _rbc = getattr(self, "_A_REBASE", -1)
        _asw = self._air_strike_cols
        _rbw = self._air_rebase_cols
        _stc = getattr(self, "_A_SPY_TRAVEL", -1)
        _smc = getattr(self, "_A_SPY_MISSION", -1)
        _rdc = getattr(self, "_A_ROAD", -1)
        _rrc = getattr(self, "_A_RAIL", -1)
        _cfc = getattr(self, "_A_CLEAN", -1)
        _nkc = getattr(self, "_A_NUKE", -1)
        _nkw = self._nuke_cols * self._n_devices
        _fnc = getattr(self, "_A_FINISH", -1)
        _gpc = getattr(self, "_A_GP", -1)
        _pfc = getattr(self, "_A_PERFORM", -1)
        _bpc = getattr(self, "_A_BOOST", -1)
        _fuc = getattr(self, "_A_FORM_UP", -1)
        _ecc = getattr(self, "_A_ESCORT", -1)
        _uec = getattr(self, "_A_UNESCORT", -1)
        _stw = self._spy_travel_cols
        _smw = self._n_spy_missions
        _pcol = self.rules.promo_cols
        _ic = [c for c in getattr(self, "_A_IMP", []) if c >= 0]
        if getattr(self, "_A_REPAIR", -1) >= 0:
            _ic.append(self._A_REPAIR)
        if getattr(self, "_A_REMOVE_IMP", -1) >= 0:
            _ic.append(self._A_REMOVE_IMP)
        _tab = torch.stack([
            _held.any(dim=0),
            _cmd.any(dim=0),
            ((_ab >= 0) & (_ab < 6)).any(dim=0),                                # move
            ((_ab >= 6) & (_ab < 12)).any(dim=0),                               # attack
            ((_ab == _fc) if _fc >= 0 else _no).any(dim=0),                     # found
            ((((_ab >= _sn) & (_ab < _sn + 12)) if _sn >= 0 else _no)
             | (((_ab >= _sn3) & (_ab < _sn3 + 18)) if _sn3 >= 0 else _no)).any(dim=0),  # snipe
            ((_ab == getattr(self, "_A_CHOP", -1)) if getattr(self, "_A_CHOP", -1) >= 0 else _no).any(dim=0),
            (torch.isin(_ab, torch.tensor(_ic, dtype=_ab.dtype, device=dev)) if _ic else _no).any(dim=0),
            ((_ab == self._A_PILLAGE) if self._act_names and self._A_PILLAGE > 0 else _no).any(dim=0),
            (((_ab >= _sp) & (_ab < _sp + 7)) if _sp >= 0 else _no).any(dim=0),  # spread
            ((_ab == _xc) if _xc >= 0 else _no).any(dim=0),                     # excavate
            ((_ab == _pk) if _pk >= 0 else _no).any(dim=0),                     # park
            (((_ab >= _pm) & (_ab < _pm + _pcol)) if _pm >= 0 else _no).any(dim=0),  # promote
            (((_ab >= _cn) & (_ab < _cn + 6)) if _cn >= 0 else _no).any(dim=0),  # condemn
            ((_ab == _hx) if _hx >= 0 else _no).any(dim=0),                     # remove heresy
            ((_ab == _lq) if _lq >= 0 else _no).any(dim=0),                     # launch inquisition
            ((_ab == _hn) if _hn >= 0 else _no).any(dim=0),                      # convert heathen
            ((_ab == _ug) if _ug >= 0 else _no).any(dim=0),                      # upgrade
            (((_ab >= _ar) & (_ab < _ar + _asw)) if _ar >= 0 else _no).any(dim=0),   # air strike
            (((_ab >= _rbc) & (_ab < _rbc + _rbw)) if _rbc >= 0 else _no).any(dim=0),  # rebase
            (((_ab >= _stc) & (_ab < _stc + _stw)) if _stc >= 0 else _no).any(dim=0),  # spy travel
            (((_ab >= _smc) & (_ab < _smc + _smw)) if _smc >= 0 else _no).any(dim=0),  # spy mission
            ((_ab == _rdc) if _rdc >= 0 else _no).any(dim=0),                    # build road
            ((_ab == _fnc) if _fnc >= 0 else _no).any(dim=0),                    # finish district
            ((_ab == _gpc) if _gpc >= 0 else _no).any(dim=0),  # activate a great person
            ((_ab == _pfc) if _pfc >= 0 else _no).any(dim=0),   # perform a concert
            ((_ab == _bpc) if _bpc >= 0 else _no).any(dim=0),   # pay a district project
            (((_ab >= _fuc) & (_ab < _fuc + 6)) if _fuc >= 0 else _no).any(dim=0),  # form up
            ((_ab == _ecc) if _ecc >= 0 else _no).any(dim=0),   # join an escort
            ((_ab == _uec) if _uec >= 0 else _no).any(dim=0),   # and leave it
            (((_ab >= _apc) & (_ab < _apc + _asw)) if _apc >= 0 else _no).any(dim=0),  # air pillage
            ((_ab == _rrc) if _rrc >= 0 else _no).any(dim=0),                     # lay a railroad
            ((_ab == _cfc) if _cfc >= 0 else _no).any(dim=0),                     # clean fallout
            (((_ab >= _nkc) & (_ab < _nkc + _nkw)) if _nkc >= 0 else _no).any(dim=0),  # a nuclear strike
        ]).tolist()
        (_rank_held, _rank_cmd, _rk_move, _rk_atk, _rk_found,
         _rk_snipe, _rk_chop, _rk_imp, _rk_pillage, _rk_spread,
         _rk_excavate, _rk_park, _rk_promote, _rk_condemn,
         _rk_heresy, _rk_inquis, _rk_heathen, _rk_upgrade,
         _rk_air, _rk_rebase, _rk_travel, _rk_mission,
         _rk_road, _rk_finish, _rk_gp, _rk_perform, _rk_boost, _rk_form,
         _rk_escort, _rk_unescort, _rk_airpil, _rk_rail, _rk_clean, _rk_nuke) = _tab
        for n in range(_n):
            if not _rank_held[n]:
                break
            if not _rank_cmd[n]:
                continue
            slot = smap[:, n]
            sc = slot.clamp(min=0)
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
            nb = self.neigh[hc]

            if _rk_found[n] and self._settler_idx >= 0:
                fnd = act & (a == self._A_FOUND) & (utp == self._settler_idx)
                if bool(fnd.any()):
                    made = self._found_city_at(row, fnd, here)
                    if bool(made.any()):
                        fr = made.nonzero(as_tuple=True)[0]
                        self._occ_clear(fr, here[fr], sc[fr])
                        self.unit_alive[fr, sc[fr]] = False
                        self._grant_new_city_unit(row, made, hc)

            if _rk_excavate[n] and _xc >= 0:
                exc = act & (a == _xc) & self._excavate_ok(
                    row, here.unsqueeze(1), utp.unsqueeze(1),
                    u_charges.unsqueeze(1)).squeeze(1)
                if bool(exc.any()):
                    self._do_excavate(row, exc, here, sc)

            if _rk_park[n] and _pk >= 0:
                pkm = act & (a == _pk) & self._park_ok(row, here.unsqueeze(1), utp.unsqueeze(1)).squeeze(1)
                if bool(pkm.any()):
                    self._do_park(row, pkm, here, sc)

            if _rk_perform[n] and _pfc >= 0:
                pfm = act & (a == _pfc) & self._perform_ok(
                    row, here.unsqueeze(1), utp.unsqueeze(1)).squeeze(1)
                if bool(pfm.any()):
                    self._do_concert(row, pfm, here, sc)

            # THE ROYAL SOCIETY'S ONE VERB: the whole charge bank in one blow,
            # 2% of the project's own cost each, and the city takes one such
            # payment a turn. The site predicate is the mask's own.
            if _rk_boost[n] and _bpc >= 0:
                _bpm = act & (a == _bpc) & self._boost_ok(
                    row, hc.unsqueeze(1), utp.unsqueeze(1), u_charges.unsqueeze(1)).squeeze(1)
                if bool(_bpm.any()):
                    _r = _bpm.nonzero(as_tuple=True)[0]
                    _c = self._project_boost_slot(row, hc.unsqueeze(1)).squeeze(1)[_r]
                    _pct = self._bsum_by_row("projcharge", self._b_project_charge)[_r, row]
                    _ch = self.unit_charges[_r, sc[_r]].double()
                    _cst = self.city_cost[_r, row, _c, 0].double()
                    self.city_progress[_r, row, _c, 0] += js_round(
                        _cst * _pct.double() * _ch / 100).to(self.city_progress.dtype)
                    self.city_boost_turn[_r, row, _c] = self.turn
                    self.unit_charges[_r, sc[_r]] = 0
                    self.unit_mp[_r, sc[_r]] = 0
                    self.unit_alive[_r, sc[_r]] = False
                    self._occ_clear(_r, hc[_r], sc[_r])

            if _rk_promote[n] and _pm >= 0:
                pmv = act & (a >= _pm) & (a < _pm + _pcol)
                if bool(pmv.any()):
                    pk_c = (a - _pm).clamp(min=0, max=_pcol - 1)
                    okp = pmv & self._promo_offer_mask(
                        sc.unsqueeze(1), utp.unsqueeze(1)
                    ).squeeze(1).gather(1, pk_c.unsqueeze(1)).squeeze(1)
                    if bool(okp.any()):
                        pr = okp.nonzero(as_tuple=True)[0]
                        ps = sc[pr]
                        self.unit_promos[pr, ps] |= torch.ones_like(ps) << pk_c[pr]
                        self.unit_level[pr, ps] += 1
                        self.unit_xp[pr, ps] = 0
                        # "Upon selecting a promotion, a unit recovers 50 HP
                        # and its turn ends."
                        _cap = int(self.rules.combat.get("unitHp", 100))
                        self.unit_hp[pr, ps] = (self.unit_hp[pr, ps] + PROMOTE_HEAL).clamp(max=_cap)
                        self.unit_mp[pr, ps] = 0
                        # CIV6 (Orator): "Can spread Religion 2 extra times" —
                        # the charges arrive with the CHOICE, which is where
                        # this roster's Apostle picks its promotion.
                        self.unit_charges[pr, ps] += self._promo_val(
                            utp[pr], self.unit_promos[pr, ps], "SPREAD_CHARGES")
                        # CIV6 (Patron Saint): the training city's banked
                        # promotion, spent by re-arming the unit.
                        _pb = self.unit_promo_bonus[pr, ps]
                        self.unit_promo_bonus[pr, ps] = (_pb - 1).clamp(min=0)
                        self.unit_xp[pr, ps] = torch.where(
                            _pb > 0, self._xp_to_next(self.unit_level[pr, ps]),
                            self.unit_xp[pr, ps])

            if _rk_escort[n] and _ecc >= 0:
                # CIV6 (Formations): the civilian joins the military unit
                # already standing with it, and the pair moves as one.
                _em = act & (a == _ecc) & (is_civ | u_emb) & (here >= 0)
                if bool(_em.any()):
                    _mh = self.military_at.gather(1, hc.unsqueeze(1)).squeeze(1)
                    _ms = torch.where(
                        _mh >= 0,
                        self.unit_seat.gather(1, _mh.clamp(min=0).unsqueeze(1)).squeeze(1),
                        torch.full_like(_mh, -1))
                    _em = _em & (_mh >= 0) & (_ms == row)
                    for _pl in (self.civilian_at, self.embarked_at):
                        _r = _pl.gather(1, hc.unsqueeze(1)).squeeze(1)
                        _rc = _r.clamp(min=0).unsqueeze(1)
                        _em = _em & ~((_r >= 0) & (_r != slot)
                                      & self.unit_escorted.gather(1, _rc).squeeze(1)
                                      & (self.unit_seat.gather(1, _rc).squeeze(1) == row))
                    if bool(_em.any()):
                        _r = _em.nonzero(as_tuple=True)[0]
                        self.unit_escorted[_r, sc[_r]] = True

            if _rk_unescort[n] and _uec >= 0:
                _bm = act & (a == _uec)
                if bool(_bm.any()):
                    _r = _bm.nonzero(as_tuple=True)[0]
                    self.unit_escorted[_r, sc[_r]] = False

            if _rk_form[n] and _fuc >= 0:
                fum = act & (a >= _fuc) & (a < _fuc + 6)
                if bool(fum.any()):
                    dfu = (a - _fuc).clamp(min=0, max=5)
                    ftg = nb.gather(1, dfu.unsqueeze(1)).squeeze(1)
                    ftc = ftg.clamp(min=0)
                    hsl = self.military_at.gather(1, ftc.unsqueeze(1)).squeeze(1)
                    hcl = hsl.clamp(min=0)
                    _live = hsl >= 0
                    h_seat = torch.where(_live, self.unit_seat.gather(1, hcl.unsqueeze(1)).squeeze(1),
                                         torch.full_like(hsl, -1))
                    h_type = torch.where(_live, self.unit_type.gather(1, hcl.unsqueeze(1)).squeeze(1),
                                         torch.full_like(hsl, -1))
                    h_form = torch.where(_live, self.unit_formation.gather(1, hcl.unsqueeze(1)).squeeze(1),
                                         torch.zeros_like(hsl))
                    tier = h_form + self.unit_formation.gather(1, sc.unsqueeze(1)).squeeze(1) + 1
                    civ_ok = torch.zeros_like(fum)
                    for _k in range(1, self._form_max + 1):
                        _ci = self._formation_civic[_k] if _k < len(self._formation_civic) else -1
                        if _ci < 0:
                            continue
                        civ_ok = civ_ok | ((tier == _k) & self.civ_civics[:, row, _ci])
                    okf = (fum & (ftg >= 0) & _live & (h_seat == row) & (h_type == utp)
                           # CIV6: "Cannot form Corps or Armies by any means"
                           & (utp != self._gdr_idx) & (h_type != self._gdr_idx)
                           & (self._type_combat[utp.clamp(min=0)] > 0)
                           & (self.unit_mp.gather(1, sc.unsqueeze(1)).squeeze(1) > 0) & civ_ok)
                    if bool(okf.any()):
                        self._form_up(row, okf, hcl, sc, tier)

            if _rk_condemn[n] and _cn >= 0:
                cdm = act & (a >= _cn) & (a < _cn + 6)
                if bool(cdm.any()):
                    dcn = (a - _cn).clamp(min=0, max=5)
                    ctg = nb.gather(1, dcn.unsqueeze(1)).squeeze(1)
                    ctc = ctg.clamp(min=0)
                    rel = self._religious_at(ctc.unsqueeze(1)).squeeze(1)
                    rsx = torch.where(rel >= 0,
                                      self.unit_seat.gather(1, rel.clamp(min=0).unsqueeze(1)).squeeze(1),
                                      torch.full_like(rel, -1))
                    okc = (
                        cdm & (ctg >= 0) & (rel >= 0) & (rsx >= 0) & (rsx != row)
                        & (self._type_combat[utp.clamp(min=0)] > 0)
                        & self.war[:, row].gather(1, self._seat_row[rsx.clamp(min=0)].unsqueeze(1)).squeeze(1)
                    )
                    if bool(okc.any()):
                        self._condemn_heretic(row, okc, ctc, rel, sc)

            if _rk_heresy[n] and _hx >= 0 and getattr(self, "_inquisitor_idx", -1) >= 0:
                _cslot = self.centre_slot_at.gather(1, hc.unsqueeze(1)).squeeze(1)
                hxm = (act & (a == _hx) & (utp == self._inquisitor_idx) & (u_charges > 0)
                       & (_cslot >= 0)
                       & (self.tile_seat.gather(1, hc.unsqueeze(1)).squeeze(1) == row))
                if bool(hxm.any()):
                    hr = hxm.nonzero(as_tuple=True)[0]
                    # CIV6 (GS): an Inquisitor's Remove Heresy leaves "only 75%
                    # presence of other Religions" removed, not all of it.
                    keep = 100 - self._remove_heresy_pct
                    cs_h = _cslot[hr]
                    for g in range(self.n_majors):
                        if g == row:
                            continue
                        _cur = self.city_pressure[hr, row, cs_h, g]
                        self.city_pressure[hr, row, cs_h, g] = torch.div(
                            _cur * keep, 100, rounding_mode="floor")
                    self.unit_charges[hr, sc[hr]] -= 1
                    self.unit_mp[hr, sc[hr]] = 0

            if _rk_inquis[n] and _lq >= 0 and getattr(self, "_apostle_idx", -1) >= 0:
                lqm = (act & (a == _lq) & (utp == self._apostle_idx)
                       & (u_charges >= self._launch_inquisition_charges)
                       & (self.tile_seat.gather(1, hc.unsqueeze(1)).squeeze(1) == row)
                       & ~self.civ_inquisition[:, row])
                if bool(lqm.any()):
                    lr = lqm.nonzero(as_tuple=True)[0]
                    self.civ_inquisition[lr, row] = True
                    self.unit_alive[lr, sc[lr]] = False
                    self._occ_clear(lr, hc[lr], sc[lr])
                    self._gen_ver += 1

            if _rk_heathen[n] and _hn >= 0:
                hnm = (act & (a == _hn) & (u_charges > 0)
                       & self._promo_flag(utp, self.unit_promos.gather(1, sc.unsqueeze(1)).squeeze(1),
                                          "HEATHEN")
                       & (self._barb_unit_plane().gather(1, nb.clamp(min=0).reshape(B, -1))
                          .reshape(B, 6) & (nb >= 0)).any(dim=1))
                if bool(hnm.any()):
                    self._convert_heathens(row, hnm, here, sc)

            if _rk_upgrade[n] and _ug >= 0:
                ugm = act & (a == _ug)
                if bool(ugm.any()):
                    self._upgrade_units(row, ugm, sc, utp)

            # THE MILITARY ENGINEER'S TWO NON-IMPROVEMENT VERBS. Each spends a
            # charge and the turn, and the unit vanishes on its last one.
            if _rk_road[n] and _rdc >= 0 and self._eng_idx >= 0:
                _rdm = (
                    act & (a == _rdc) & (utp == self._eng_idx) & (u_charges > 0)
                    & (own_tile | (self.tile_seat < 0)).gather(1, hc.unsqueeze(1)).squeeze(1)
                    & self.passable.gather(1, hc.unsqueeze(1)).squeeze(1)
                    & ~self.water.gather(1, hc.unsqueeze(1)).squeeze(1)
                    & ~self.road.gather(1, hc.unsqueeze(1)).squeeze(1)
                )
                if bool(_rdm.any()):
                    _r = _rdm.nonzero(as_tuple=True)[0]
                    self.road[_r, hc[_r]] = True
                    self._spend_build_charge(_r, sc, hc)

            # CIV6 (Railroad): "Does not cost a charge, but does cost 1 Iron
            # and 1 Coal" — so the Engineer survives it and may lay another the
            # next turn. The Coal it burns discharges the same per-resource
            # carbon a plant's does (`layRailroad`).
            if _rk_rail[n] and _rrc >= 0 and self._eng_idx >= 0:
                _rrm = (
                    act & (a == _rrc) & (utp == self._eng_idx)
                    & (own_tile | (self.tile_seat < 0)).gather(1, hc.unsqueeze(1)).squeeze(1)
                    & self.passable.gather(1, hc.unsqueeze(1)).squeeze(1)
                    & ~self.water.gather(1, hc.unsqueeze(1)).squeeze(1)
                    & ~self.railroad.gather(1, hc.unsqueeze(1)).squeeze(1)
                )
                if self._railroad_tech >= 0:
                    _rrm = _rrm & techs[:, self._railroad_tech]
                for _sl, _cn in self._railroad_cost:
                    _rrm = _rrm & (self.civ_stockpile[:, row, _sl] >= _cn)
                if bool(_rrm.any()):
                    _r = _rrm.nonzero(as_tuple=True)[0]
                    for _sl, _cn in self._railroad_cost:
                        self.civ_stockpile[_r, row, _sl] -= _cn
                        self._emit_carbon(row, _rrm.double() * float(_cn * self._carbon_per_resource[_sl]))
                    self.railroad[_r, hc[_r]] = True
                    self.unit_mp[_r, sc[_r]] = 0

            # CIV6: cleaning fallout "takes 1 build charge", and any chassis
            # carrying one may do it — no territory clause, no chassis clause.
            if _rk_clean[n] and _cfc >= 0:
                _cfm = (act & (a == _cfc) & (u_charges > 0)
                        & self._fallout().gather(1, hc.unsqueeze(1)).squeeze(1))
                if bool(_cfm.any()):
                    _r = _cfm.nonzero(as_tuple=True)[0]
                    self.tile_fallout[_r, hc[_r]] = 0
                    self._spend_build_charge(_r, sc, hc)

            if _rk_finish[n] and _fnc >= 0 and self._eng_idx >= 0:
                _fnm = act & (a == _fnc) & (utp == self._eng_idx) & (u_charges > 0)
                if bool(_fnm.any()):
                    _col = self._eng_finish_slot(row, here.unsqueeze(1)).squeeze(1)
                    _fnm = _fnm & (_col >= 0)
                    if bool(_fnm.any()):
                        _r = _fnm.nonzero(as_tuple=True)[0]
                        _c = _col[_r]
                        # `itemCost`: a district's price locked at queue, a
                        # building's read live.
                        _cst = self._live_building_cost(row)[_r, _c, 0].double()
                        self.city_progress[_r, row, _c, 0] += js_round(
                            _cst * self._eng_finish_frac).to(self.city_progress.dtype)
                        self._spend_build_charge(_r, sc, hc)

            # THE GREAT PERSON'S ONE VERB. The site predicate is the mask's
            # own, so a legal column cannot land in no arm.
            if _rk_gp[n] and _gpc >= 0:
                _gpm = act & (a == _gpc) & self._gp_site_ok(
                    row, sc.unsqueeze(1), hc.unsqueeze(1)).squeeze(1)
                if bool(_gpm.any()):
                    self._gp_apply(row, _gpm, sc, hc)
                    _r = _gpm.nonzero(as_tuple=True)[0]
                    self._spend_build_charge(_r, sc, hc)

            if _rk_nuke[n] and _nkc >= 0:
                nkm = act & (a >= _nkc) & (a < _nkc + _nkw)
                if bool(nkm.any()):
                    _cols = self._nuke_targets(
                        row, sc.unsqueeze(1), hc.unsqueeze(1), utp.unsqueeze(1)).squeeze(1)
                    _kk = (a - _nkc).clamp(min=0, max=_nkw - 1)
                    _tg = _cols.gather(1, _kk.unsqueeze(1)).squeeze(1)
                    _okN = nkm & (_tg >= 0)
                    for _d in range(self._n_devices):
                        _dm = _okN & (torch.div(_kk, self._nuke_cols, rounding_mode="floor") == _d)
                        if bool(_dm.any()):
                            self._detonate(_dm, row, _d, _tg)
                    # the carrier spends its whole turn on the delivery
                    _mp = self.unit_mp
                    _mp[_okN.nonzero(as_tuple=True)[0], sc[_okN]] = 0
                    self.unit_attacks[_okN.nonzero(as_tuple=True)[0], sc[_okN]] = 0

            if _rk_air[n] and _ar >= 0:
                asm = act & (a >= _ar) & (a < _ar + _asw)
                if bool(asm.any()):
                    _cols = self._air_strike_targets(
                        row, sc.unsqueeze(1), hc.unsqueeze(1), utp.unsqueeze(1)).squeeze(1)
                    _k = (a - _ar).clamp(min=0, max=_asw - 1)
                    _tg = _cols.gather(1, _k.unsqueeze(1)).squeeze(1)
                    _okA = asm & (_tg >= 0)
                    for b_ in _okA.nonzero(as_tuple=True)[0].tolist():
                        v = int(sc[b_])
                        one = torch.zeros(B, dtype=torch.bool, device=dev)
                        one[b_] = True
                        self._air_strike(one, _tg, "major", v, row)

            if _rk_airpil[n] and _apc >= 0:
                apm = act & (a >= _apc) & (a < _apc + _asw)
                if bool(apm.any()):
                    _cols = self._air_pillage_targets(
                        row, sc.unsqueeze(1), hc.unsqueeze(1), utp.unsqueeze(1)).squeeze(1)
                    _k = (a - _apc).clamp(min=0, max=_asw - 1)
                    _tg = _cols.gather(1, _k.unsqueeze(1)).squeeze(1)
                    _okP = apm & (_tg >= 0)
                    for b_ in _okP.nonzero(as_tuple=True)[0].tolist():
                        v = int(sc[b_])
                        one = torch.zeros(B, dtype=torch.bool, device=dev)
                        one[b_] = True
                        self._air_pillage(one, _tg, "major", v, row)

            if _rk_rebase[n] and _rbc >= 0:
                rbm = act & (a >= _rbc) & (a < _rbc + _rbw)
                if bool(rbm.any()):
                    _cols = self._rebase_targets(
                        row, sc.unsqueeze(1), hc.unsqueeze(1), utp.unsqueeze(1)).squeeze(1)
                    _k = (a - _rbc).clamp(min=0, max=_rbw - 1)
                    _tg = _cols.gather(1, _k.unsqueeze(1)).squeeze(1)
                    _okR = (rbm & (_tg >= 0)).nonzero(as_tuple=True)[0]
                    if _okR.numel():
                        self.unit_tile[_okR, sc[_okR]] = _tg[_okR]
                        self.unit_mp[_okR, sc[_okR]] = 0

            if _rk_travel[n] and _stc >= 0:
                stm = act & (a >= _stc) & (a < _stc + _stw)
                if bool(stm.any()):
                    _cols = self._spy_destinations(
                        row, sc.unsqueeze(1), hc.unsqueeze(1), utp.unsqueeze(1)).squeeze(1)
                    _k = (a - _stc).clamp(min=0, max=_stw - 1)
                    self._begin_travel(row, stm, sc,
                                       _cols.gather(1, _k.unsqueeze(1)).squeeze(1))

            if _rk_mission[n] and _smc >= 0:
                smm = act & (a >= _smc) & (a < _smc + _smw)
                if bool(smm.any()):
                    _mk = self._spy_mission_mask(
                        row, sc.unsqueeze(1), hc.unsqueeze(1), utp.unsqueeze(1)).squeeze(1)
                    _k = (a - _smc).clamp(min=0, max=_smw - 1)
                    _okS = smm & _mk.gather(1, _k.unsqueeze(1)).squeeze(1)
                    for _m in _k[_okS].unique().tolist():
                        self._begin_mission(row, _okS & (_k == _m), sc, _m)

            mv = act & (a < 6) if _rk_move[n] else None
            if mv is not None and bool(mv.any()):
                dirs = a.clamp(min=0, max=5)
                tgt = nb.gather(1, dirs.unsqueeze(1)).squeeze(1)
                tc = tgt.clamp(min=0)
                # Both arms are pure reads; build the civilian plane only when
                # a civilian is actually moving this rank — most ranks are
                # military-only and the second _blocked_for was half the cost.
                is_nav = self.unit_naval[ut]
                blocked = self._blocked_for(tgt.unsqueeze(1), row, is_naval=is_nav).squeeze(1)
                if bool((mv & is_civ).any()):
                    blocked = torch.where(
                        is_civ,
                        self._blocked_for(tgt.unsqueeze(1), row, is_civilian=True,
                                          is_naval=is_nav).squeeze(1),
                        blocked,
                    )
                terr = self.passable.gather(1, tc.unsqueeze(1)).squeeze(1)
                _canal = self._canal_pass().gather(1, tc.unsqueeze(1)).squeeze(1)
                cart = (techs[:, self._cartography_tech] if self._cartography_tech >= 0
                        else torch.zeros(B, dtype=torch.bool, device=dev))
                _wet = self.wpass.gather(1, tc.unsqueeze(1)).squeeze(1)
                _hull = (_wet & (~self.ocean_tile.gather(1, tc.unsqueeze(1)).squeeze(1) | cart)) | _canal
                if self._embark_live:
                    ship = (techs[:, self._shipbuilding_tech] if self._shipbuilding_tech >= 0
                            else torch.zeros(B, dtype=torch.bool, device=dev))
                    water = _wet & (
                        ~self.ocean_tile.gather(1, tc.unsqueeze(1)).squeeze(1) | cart
                    )
                    any_war = self.war[:, row].any(dim=1)
                    terr = torch.where(is_nav, _hull, terr | (water & ship & ~is_nav & any_war))
                else:
                    terr = torch.where(is_nav, _hull, terr)
                _wlk = self.unit_water_walk[ut]
                if bool(_wlk.any()):
                    terr = torch.where(
                        _wlk, self.passable.gather(1, tc.unsqueeze(1)).squeeze(1) | _wet, terr)
                # CIV6 (Enhanced Mobility): the robot "can perform a Jump action
                # to cross over mountain terrain".
                _jmp = (ut == self._gdr_idx) & self._gdr_row_up(row, self._gdr_u_moves)
                if bool(_jmp.any()):
                    terr = terr | (_jmp & self.tile_mountain.gather(1, tc.unsqueeze(1)).squeeze(1))
                _scale = self._promo_flag(ut, self.unit_promos.gather(1, sc.unsqueeze(1)).squeeze(1), "CLIFFS")
                clf = self._cliff_block_dirs(
                    hc.unsqueeze(1), nb.unsqueeze(1), own_tile,
                    (_scale | is_nav | self.unit_water_walk[ut]).unsqueeze(1),
                )[:, 0].gather(1, dirs.unsqueeze(1)).squeeze(1)
                mp = self.unit_mp.gather(1, sc.unsqueeze(1)).squeeze(1)
                shut = self._border_closed(tgt.unsqueeze(1), row, ut.unsqueeze(1)).squeeze(1)
                ok = mv & (tgt >= 0) & terr & ~blocked & ~clf & ~shut & (mp > 0)
                if bool(ok.any()):
                    self._step_verb(ok, sc, here, tgt, dirs, row, is_civ)

            atk = (
                act & (a >= 6) & (a < 12)
                & (self._type_combat[utp.clamp(min=0)] > 0)  # civilians cannot attack
            ) if _rk_atk[n] else None
            if atk is not None and bool(atk.any()):
                dirs = (a - 6).clamp(min=0, max=5)
                tgt = nb.gather(1, dirs.unsqueeze(1)).squeeze(1)
                tc = tgt.clamp(min=0)
                valid = atk & (tgt >= 0)
                if bool(u_emb.any()):
                    # the amphibious reach: an embarked unit strikes an open
                    # LAND shore, with a MELEE attack, and nothing afloat.
                    valid = valid & (~u_emb | (
                        ~self.water.gather(1, tc.unsqueeze(1)).squeeze(1)
                        & ~self._cliff_block_dirs(
                            hc.unsqueeze(1), nb.unsqueeze(1), own_tile,
                            self._promo_flag(ut, self.unit_promos.gather(1, sc.unsqueeze(1)).squeeze(1),
                                             "CLIFFS").unsqueeze(1))[:, 0].gather(1, dirs.unsqueeze(1)).squeeze(1)
                        & (self._type_ranged_strength[ut] <= 0)
                    ))
                if bool(valid.any()):
                    # WHO is on the target tile, and is any of them hostile to
                    # this seat? `unitsHostile` answers for every pair, so no
                    # seat needs a clause of its own.
                    _ms = self._visible_military_at(row).gather(1, tc.unsqueeze(1)).squeeze(1)
                    _cs = self.civilian_at.gather(1, tc.unsqueeze(1)).squeeze(1)
                    _es = self.embarked_at.gather(1, tc.unsqueeze(1)).squeeze(1)
                    neg = torch.full_like(_ms, -1)
                    m_seat = torch.where(_ms >= 0, self.unit_seat.gather(1, _ms.clamp(min=0).unsqueeze(1)).squeeze(1), neg)
                    c_seat = torch.where(_cs >= 0, self.unit_seat.gather(1, _cs.clamp(min=0).unsqueeze(1)).squeeze(1), neg)
                    e_seat = torch.where(_es >= 0, self.unit_seat.gather(1, _es.clamp(min=0).unsqueeze(1)).squeeze(1), neg)
                    # the passenger is a target in its own right
                    host_m = (self._seats_hostile(row, m_seat.unsqueeze(1))
                              | self._seats_hostile(row, e_seat.unsqueeze(1))).squeeze(1)
                    host_c = self._seats_hostile(row, c_seat.unsqueeze(1)).squeeze(1)
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
                    #   1. a live enemy Encampment, WHOEVER stands on it — a
                    #      unit sheltering there is invulnerable while the
                    #      district holds,
                    #   2. a MAJOR centre under city-first,
                    #   3. a CITY-STATE centre under city-first,
                    #   4. the unit resolver.
                    enc_t = (
                        self._encamp_block(tc.unsqueeze(1), row).squeeze(1)
                        & ~city_t & ~cs_t
                        if self._encamp_didx >= 0 else torch.zeros_like(valid)
                    )
                    city_hit = city_t
                    cs_hit = cs_t & ~city_t
                    unit_hit = (host_m | host_c) & ~city_hit & ~cs_hit & ~enc_t
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
                                # spends through `spendAttack`, inside the body
                                self._hostile_vs_unit(one, tgt, "major", v)
                                continue
                            else:
                                continue  # nothing to attack — TS's `no(...)`, no MP spent
                            self.unit_mp[b_, v] = 0  # the turn is spent (TS movesLeft = 0)
                        else:
                            # rangedAttack: one roll, no retaliation, no
                            # advance. It re-derives its own target and spends
                            # the turn itself; its refusals are TS's early
                            # returns, which leave movesLeft alone.
                            self._ranged_attack(one, tgt, "major", v, row)

            if _rk_snipe[n]:
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
                        # major's units. It spends the turn itself, and only
                        # when it fired.
                        self._hostile_ranged_strike(one, tgt_s, "major", v, row=row)

                if getattr(self, "_A_SNIPE3", -1) >= 0:
                    snp3 = act & (a >= self._A_SNIPE3) & (a < self._A_SNIPE3 + 18) & ~is_civ
                    if bool(snp3.any()):
                        tgt_3 = self.ring3[hc].gather(1, (a - self._A_SNIPE3).clamp(min=0, max=17).unsqueeze(1)).squeeze(1)
                        # CIV6: distance 3 needs ATTACK RANGE 3 — chassis
                        # range plus the RANGE promotion (`unitAttackRange`).
                        rng3 = (self._type_ranged_range[ut]
                                + self._promo_val(ut, self.unit_promos.gather(1, sc.unsqueeze(1)).squeeze(1), "RANGE"))
                        ok_3 = (
                            snp3 & (tgt_3 >= 0) & ~u_emb
                            & (self._type_ranged_strength[ut] > 0) & (rng3 >= 3)
                        )
                        for b_ in ok_3.nonzero(as_tuple=True)[0].tolist():
                            v = int(sc[b_])
                            one = torch.zeros(B, dtype=torch.bool, device=dev)
                            one[b_] = True
                            self._hostile_ranged_strike(one, tgt_3, "major", v, row=row)

            if _rk_chop[n] and self._builder_idx >= 0:
                ftr = self.tile_ftr.gather(1, hc.unsqueeze(1)).squeeze(1)
                ftu = self.tile_ftu.gather(1, hc.unsqueeze(1)).squeeze(1)
                chp = (
                    act & (a == self._A_CHOP)
                    & (utp == self._builder_idx)
                    & (u_charges > 0)
                    & (ftr > 0)
                    & (ftu >= 0) & techs.gather(1, ftu.clamp(min=0).unsqueeze(1)).squeeze(1)
                    & ~self.feat_stripped.gather(1, hc.unsqueeze(1)).squeeze(1)
                    & ~self._congress_chop(self.feat_id.gather(1, hc.unsqueeze(1)).squeeze(1))[0]
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
                    # CIV6 (harvest progression): x10 at 100% of the
                    # LARGER tree — 1 + 9 * max(techs/67, civics/50)
                    _psc = 1.0 + 9.0 * torch.maximum(techs.sum(dim=1).double() / 67.0,
                                                     civics.sum(dim=1).double() / 50.0)
                    # CIV6 (Groundbreaker): "+50% yields from plot harvests and
                    # feature removals in city" — the harvested tile's own city.
                    _hm = torch.ones_like(_psc)
                    if self.n_governors:
                        _hm = self._governor_tile_mult(row, "harvestMult")[cr, ct]
                    amount = js_round(20.0 * _psc * _hm).to(self.dtype)
                    # the Deforestation Treaty pays a SECOND lump, in gold —
                    # decided over the WHOLE batch, because `ct` is narrowed
                    _dgold = self._congress_chop(self.feat_id.gather(1, hc.unsqueeze(1)).squeeze(1))[1]
                    col_c = self._city_col_at(row, cr, ct)
                    _drip_c = self.city_progress[:, row, :, 0].clone()
                    for i2 in range(len(cr)):
                        b2, j2 = int(cr[i2]), int(col_c[i2])
                        amt = float(amount[b2])
                        # gold lands in the BANK, so it needs no city column
                        if bool(_dgold[b2]):
                            self.civ_treasury[b2, row] += amt
                        if j2 < 0:
                            continue
                        if int(ftr[cr[i2]]) == 1:
                            self.city_growth[b2, row, j2] += amt
                        elif int(self.city_current[b2, row, j2, 0]) >= 0:
                            self.city_progress[b2, row, j2, 0] += amt
                        else:
                            self.city_prod_bank[b2, row, j2] += amt
                    self._repair_drip(row, _drip_c)
                    self.unit_charges[cr, sc[cr]] -= 1
                    spent = chp & (self.unit_charges.gather(1, sc.unsqueeze(1)).squeeze(1) <= 0)
                    if bool(spent.any()):
                        dr = spent.nonzero(as_tuple=True)[0]
                        self.unit_alive[dr, sc[dr]] = False
                        self._occ_clear(dr, hc[dr], sc[dr])

            if _rk_imp[n] and self.improvements_on and self._builder_idx >= 0:
                hf = (civics[:, self._hillfarms_civic] if self._hillfarms_civic >= 0
                      else torch.zeros(B, dtype=torch.bool, device=dev))
                mining = (techs[:, self._mine_unlock_tech] if self._mine_unlock_tech >= 0
                          else torch.zeros(B, dtype=torch.bool, device=dev))
                constr = (techs[:, self._lumber_unlock_tech] if self._lumber_unlock_tech >= 0
                          else torch.zeros(B, dtype=torch.bool, device=dev))
                _paved = (
                    (self.centre_slot_at.gather(1, hc.unsqueeze(1)).squeeze(1) < 0)
                    & (self.improvement.gather(1, hc.unsqueeze(1)).squeeze(1) < 0)
                    & (self.district.gather(1, hc.unsqueeze(1)).squeeze(1) < 0)
                    & (self.built_wonder.gather(1, hc.unsqueeze(1)).squeeze(1) < 0)
                )
                here_ok = (
                    act & (utp == self._builder_idx) & (u_charges > 0)
                    & own_tile.gather(1, hc.unsqueeze(1)).squeeze(1) & _paved
                )
                # the MILITARY ENGINEER's rows reach neutral ground too
                # (`engineerTileOk`), so its base differs from the Builder's.
                eng_ok = (
                    act & (utp == self._eng_idx) & (u_charges > 0)
                    & (own_tile | (self.tile_seat < 0)).gather(1, hc.unsqueeze(1)).squeeze(1)
                    & self.passable.gather(1, hc.unsqueeze(1)).squeeze(1)
                    & ~self.water.gather(1, hc.unsqueeze(1)).squeeze(1)
                    & _paved
                ) if self._eng_idx >= 0 else torch.zeros(B, dtype=torch.bool, device=dev)
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
                                  & ~self.feat_stripped.gather(1, hc.unsqueeze(1)).squeeze(1) & constr)
                    else:
                        _ut = int(self._imp_unlock[_k])
                        _unl = (techs[:, _ut] if _ut >= 0
                                else torch.ones(B, dtype=torch.bool, device=dev))
                        if self.SEASIDE >= 0 and _k == self.SEASIDE:
                            _valid = self._seaside_ok().gather(1, hc.unsqueeze(1)).squeeze(1) & _unl
                        elif self._imp_suz[_k]:
                            _valid = self._suz_improvement_ok(row, _k).gather(
                                1, hc.unsqueeze(1)).squeeze(1)
                        elif self._imp_eng[_k]:
                            _valid = _unl & self._imp_ground_ok(_k).gather(
                                1, hc.unsqueeze(1)).squeeze(1)
                        elif self._imp_water[_k]:
                            _valid = (
                                _unl & (_rq == -1)
                                & self.water.gather(1, hc.unsqueeze(1)).squeeze(1)
                                & ~self.tile_submerged.gather(1, hc.unsqueeze(1)).squeeze(1)
                                & self._imp_ground_ok(_k).gather(1, hc.unsqueeze(1)).squeeze(1)
                            )
                        elif self._imp_ground[_k]:
                            _valid = (
                                _unl & (_rq == -1)
                                & ~self.water.gather(1, hc.unsqueeze(1)).squeeze(1)
                                & self.passable.gather(1, hc.unsqueeze(1)).squeeze(1)
                                & self._imp_ground_ok(_k).gather(1, hc.unsqueeze(1)).squeeze(1)
                            )
                        else:
                            _valid = (_rq == _k) & _unl
                    _base = eng_ok if self._imp_eng[_k] else here_ok
                    _ok = _base & (a == _col) & _valid
                    if bool(_ok.any()):
                        _r = _ok.nonzero(as_tuple=True)[0]
                        self.improvement[_r, hc[_r]] = _k
                        self.pillaged[_r, hc[_r]] = False
                        did[_r] = True
                if bool(did.any()):
                    _r = did.nonzero(as_tuple=True)[0]
                    self._eff_version += 1
                    self._spend_build_charge(_r, sc, hc)
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
                # REMOVE_IMPROVEMENT — CIV6 (Builder / Military Engineer):
                # "Can Remove Tile Improvements (costs no charge)". GONE, not
                # pillaged; based aircraft scatter; the turn is spent.
                _rmv = (
                    act & (a == getattr(self, "_A_REMOVE_IMP", -2))
                    & (((utp == self._builder_idx) if self._builder_idx >= 0
                        else torch.zeros_like(act))
                       | ((utp == self._eng_idx) if self._eng_idx >= 0
                          else torch.zeros_like(act)))
                    & own_tile.gather(1, hc.unsqueeze(1)).squeeze(1)
                    & (self.improvement.gather(1, hc.unsqueeze(1)).squeeze(1) >= 0)
                )
                if bool(_rmv.any()):
                    _r = _rmv.nonzero(as_tuple=True)[0]
                    _tt = hc[_r]
                    self.improvement[_r, _tt] = -1
                    self.pillaged[_r, _tt] = False
                    self.unit_mp[_r, sc[_r]] = 0
                    self._eff_version += 1
                    self._air_scatter_from(_r, _tt)

            if _rk_pillage[n]:
                _ts = self.tile_seat.gather(1, hc.unsqueeze(1)).squeeze(1)
                # a WAR with the tile's owner, city-state owners included —
                # the mask's own clause, and `phase.ts`' replay arm
                _en = (
                    ((_ts >= 0) & (_ts < BARB_SEAT))
                    & self.war[:, row].gather(
                        1, self._seat_row[_ts.clamp(min=0)].unsqueeze(1)).squeeze(1)
                )
                _hi = (self.improvement.gather(1, hc.unsqueeze(1)).squeeze(1) >= 0) & ~self.pillaged.gather(1, hc.unsqueeze(1)).squeeze(1)
                _hd = (
                    (self.district.gather(1, hc.unsqueeze(1)).squeeze(1) >= 0)
                    & self.district_complete.gather(1, hc.unsqueeze(1)).squeeze(1)
                    & ~self.district_pillaged.gather(1, hc.unsqueeze(1)).squeeze(1)
                    & (self.centre_slot_at.gather(1, hc.unsqueeze(1)).squeeze(1) < 0)
                )
                _pl = act & (a == self._A_PILLAGE) & (self._type_combat[utp.clamp(min=0)] > 0) & _en & (_hi | _hd)
                # CIV6 (Coastal Raid): a NAVAL RAIDER on water beside enemy
                # land infrastructure, holding 3+ MP, raids the adjacent tile
                # — the same column, fired only when the tile underfoot
                # offers nothing.
                _rd = (act & (a == self._A_PILLAGE) & self._type_raider[utp.clamp(min=0)]
                       & self.water.gather(1, hc.unsqueeze(1)).squeeze(1)
                       & (self.unit_mp[torch.arange(B, device=self.device), sc] >= 3 * self._mp_scale)
                       & ~(_en & (_hi | _hd)))
                if bool((_pl | _rd).any()):
                    _r = (_pl | _rd).nonzero(as_tuple=True)[0]
                    _tt = hc[_r].clone()
                    _isr = _rd[_r]
                    if bool(_isr.any()):
                        # the raid target: the lowest-index adjacent enemy
                        # LAND tile with an unpillaged improvement, else with
                        # a wreckable district — `phase.ts`' raid arm ranks
                        # by the same key.
                        _rr = _r[_isr]
                        _cand = self.neigh[hc[_rr]]                    # [n, 6]
                        _cc = _cand.clamp(min=0)
                        _ri = _rr.unsqueeze(1)
                        _cts = self.tile_seat[_ri, _cc]
                        _cown = (_cts >= 0) & (_cts < BARB_SEAT)
                        _csr = self._seat_row[torch.where(_cown, _cts, torch.zeros_like(_cts))]
                        _cwar = _cown & self.war[:, row][_ri, _csr]
                        _ok0 = (_cand >= 0) & ~self.water[_ri, _cc] & _cwar
                        _cimp = _ok0 & (self.improvement[_ri, _cc] >= 0) & ~self.pillaged[_ri, _cc]
                        _cdis = (_ok0 & (self.district[_ri, _cc] >= 0)
                                 & (self.district[_ri, _cc] != self._encamp_didx)
                                 & self.district_complete[_ri, _cc]
                                 & ~self.district_pillaged[_ri, _cc]
                                 & (self.centre_slot_at[_ri, _cc] < 0))
                        _big = torch.full_like(_cand, 1 << 30)
                        _ki = torch.where(_cimp, _cand, _big).min(dim=1).values
                        _kd = torch.where(_cdis, _cand, _big).min(dim=1).values
                        _pick = torch.where(_ki < (1 << 30), _ki, _kd)
                        _tt[_isr] = torch.where(_pick < (1 << 30), _pick, _tt[_isr])
                    # one wreck body for underfoot and raid alike, keyed on
                    # the RESOLVED tile — a raid with no live target no-ops
                    _hi2 = (self.improvement[_r, _tt] >= 0) & ~self.pillaged[_r, _tt]
                    _hd2 = ((self.district[_r, _tt] >= 0)
                            & (self.district[_r, _tt] != self._encamp_didx)
                            & self.district_complete[_r, _tt]
                            & ~self.district_pillaged[_r, _tt]
                            & (self.centre_slot_at[_r, _tt] < 0))
                    _live = _hi2 | _hd2
                    _r, _tt = _r[_live], _tt[_live]
                    _pi = _hi2[_live]
                    _pd = ~_pi
                    self.pillaged[_r[_pi], _tt[_pi]] = True
                    self.district_pillaged[_r[_pd], _tt[_pd]] = True
                    self._air_scatter_from(_r[_pd], _tt[_pd])
                    # ---- the plunder rows (`pillagePlunder`) ----
                    _kind = torch.zeros(len(_r), dtype=torch.long, device=self.device)
                    _amt = torch.zeros_like(_kind)
                    _iv = self.improvement[_r, _tt].clamp(min=0)
                    _kind[_pi] = self._imp_plun_kind[_iv[_pi]]
                    _amt[_pi] = self._imp_plun_amt[_iv[_pi]]
                    _dv = self.district[_r, _tt].clamp(min=0)
                    _kind[_pd] = self._d_plun_kind[_dv[_pd]]
                    _amt[_pd] = self._d_plun_amt[_dv[_pd]]
                    # CIV6 (Grand Master's Chapel): "Pillaging improvements
                    # and Districts provides bonus Faith" — the data's flat
                    # 15 / 30 per wreck, whatever the plunder row says.
                    if bool((self._b_pill_faith_imp > 0).any()):
                        _ownb = self.city_bldg[:, row].any(dim=1)  # [B, NB]
                        _fa_i = (_ownb.long() * self._b_pill_faith_imp.reshape(1, -1)).amax(dim=1)
                        _fa_d = (_ownb.long() * self._b_pill_faith_dist.reshape(1, -1)).amax(dim=1)
                        _fadd = torch.where(_pi, _fa_i[_r], _fa_d[_r])
                        _fr2 = _fadd > 0
                        if bool(_fr2.any()):
                            self.civ_faith[_r[_fr2], row] += _fadd[_fr2].to(self.dtype)
                    _hl = (_kind == 1) & (_amt > 0)
                    if bool(_hl.any()):
                        _hr = _r[_hl]
                        _cap = int(self.rules.combat.get("unitHp", 100))
                        self.unit_hp[_hr, sc[_hr]] = (self.unit_hp[_hr, sc[_hr]] + _amt[_hl]).clamp(max=_cap)
                    _bk = (_kind >= 2) & (_amt > 0)
                    if bool(_bk.any()):
                        # a progress-scaled lump into the pillager's own
                        # purse, times the policy multiplier (`TOTAL_WAR`)
                        _br = _r[_bk]
                        _psc = 1.0 + 9.0 * torch.maximum(techs.sum(dim=1).double() / 67.0,
                                                         civics.sum(dim=1).double() / 50.0)
                        _mult = torch.ones(len(_br), dtype=torch.float64, device=self.device)
                        if self._gov_has_effects:
                            _mult = self._fx_at_seat("pillm", torch.full_like(_br, row), _br).double()
                        _lump = js_round(_amt[_bk].double() * _psc[_br] * _mult).to(self.dtype)
                        _kk = _kind[_bk]
                        for _kv, _purse in ((2, self.civ_treasury), (3, self.civ_faith),
                                            (4, self.civ_tech_prog), (5, self.civ_civic_prog)):
                            _m2 = _kk == _kv
                            if bool(_m2.any()):
                                _purse[_br[_m2], row] += _lump[_m2]
                    # CIV6 (Loot): "+50 Gold from coastal raids", flat and on
                    # top of whatever the wrecked target's plunder row pays.
                    _lg = self._promo_val(utp[_r], self.unit_promos[_r, sc[_r]], "RAID_GOLD")
                    _lm = _isr[_live] & (_lg > 0)
                    if bool(_lm.any()):
                        self.civ_treasury[_r[_lm], row] += _lg[_lm].to(self.dtype)
                    # CIV6: pillaging takes "3 Movement Points, or all of
                    # your movement"; Depredation prices it at 1.
                    _pc = self._promo_val(utp[_r], self.unit_promos[_r, sc[_r]], "PILLAGE_CHEAP")
                    _cost = self._mp_scale * torch.where(_pc > 0, _pc, torch.full_like(_pc, 3))
                    _left = self.unit_mp[_r, sc[_r]]
                    self.unit_mp[_r, sc[_r]] = (_left - _cost).clamp(min=0)
                    self._eff_version += 1

            if _rk_spread[n]:
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
                        # the minor city rows are spread targets too — a
                        # city-state CAN be converted (`spreadFromUnit` finds
                        # the minor by centre tile the same way)
                        nrows = self.n_majors + self.S
                        tc_sp = tgt_sp.clamp(min=0)
                        lump = self._enh["mlump"][self.civ_enhancer[:, row] + 1]
                        pm = (
                            ok_sp.reshape(B, 1, 1)
                            & self.city_alive[:, :nrows]
                            & (self.city_center[:, :nrows] == tc_sp.reshape(B, 1, 1))
                        )
                        pb, pr, pj = pm.nonzero(as_tuple=True)
                        if len(pb):
                            _was = self._followed_religion(self.city_pressure[pb, pr, pj])
                            # CIV6 (Translator): "Religious spread is triple
                            # strength in cities of other civilizations."
                            _tr = self._promo_val(utp[pb], self.unit_promos[pb, sc[pb]], "TRANSLATOR")
                            _mul = torch.where((pr != row) & (_tr > 1), _tr, torch.ones_like(_tr))
                            # CIV6 (Spread Religion): "Pressure = 2.2 * the
                            # spreader's current HP" — floor(lump * hp / 100),
                            # the full-health lump being the enhancer's own.
                            _hp = self.unit_hp[pb, sc[pb]]
                            _lp = torch.div(lump[pb] * _hp, 100, rounding_mode="floor")
                            self.city_pressure[pb, pr, pj, row] += _lp * _mul
                            # CIV6 (Proselytizer): "Religious spread eliminates
                            # 75% of existing pressure from other Religions in
                            # the target city."
                            # CIV6 (Spread Religion): the spread itself
                            # "reduces total Religious Pressure of all foreign
                            # religions in the city by 25%"; PROSELYTIZER
                            # raises the strip to its 75.
                            _st = self._promo_val(utp[pb], self.unit_promos[pb, sc[pb]], "PROSELYTIZER").clamp(min=25)
                            _hit = _st > 0
                            if bool(_hit.any()):
                                _hb, _hr, _hj, _hs = pb[_hit], pr[_hit], pj[_hit], _st[_hit]
                                _cur = self.city_pressure[_hb, _hr, _hj]
                                _keep = torch.div(_cur * (100 - _hs).unsqueeze(1), 100,
                                                  rounding_mode="floor")
                                _mine = torch.arange(_cur.shape[1], device=self.device) == row
                                self.city_pressure[_hb, _hr, _hj] = torch.where(_mine, _cur, _keep)
                            # CIV6 (Indulgence Vendor): "Gain 100 Gold if this
                            # unit converts a city to your Religion for the
                            # first time."
                            _now = self._followed_religion(self.city_pressure[pb, pr, pj])
                            _flip = (_now == row) & (_was != row)
                            if bool(_flip.any()):
                                _gv, _gu = self._promo_first_use(
                                    utp[pb], self.unit_promos[pb, sc[pb]],
                                    self.unit_promo_used[pb, sc[pb]], "INDULGENCE")
                                _gv = torch.where(_flip, _gv, torch.zeros_like(_gv))
                                self.unit_promo_used[pb, sc[pb]] = torch.where(
                                    _gv > 0, _gu, self.unit_promo_used[pb, sc[pb]])
                                self.civ_treasury[pb, row] += _gv.to(self.civ_treasury.dtype)
                        landed = pm.reshape(B, -1).any(dim=1)
                        if bool(landed.any()):
                            lr = landed.nonzero(as_tuple=True)[0]
                            self.unit_charges[lr, sc[lr]] -= 1
                            self.unit_mp[lr, sc[lr]] = 0
                            dead = landed & (self.unit_charges.gather(1, sc.unsqueeze(1)).squeeze(1) <= 0)
                            if bool(dead.any()):
                                dr = dead.nonzero(as_tuple=True)[0]
                                self.unit_alive[dr, sc[dr]] = False
                                self._occ_clear(dr, hc[dr], sc[dr])

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
        slot order for EVERY row under append+reclaim.

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
        pick = key.max(dim=1).indices
        self.city_is_cap[rows[need], seat_row[need], pick[need]] = True
        self._eff_version += 1

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
        half_hp = (int(self.rules.combat.get("cityMaxHp", 200)) + 1) // 2
        max_cities = int(self.rules.seats.get("maxCities", 6))
        for i in range(len(rows)):
            b = int(rows[i]); s = int(citystate_of[rows[i]])
            row = dst_rows if isinstance(dst_rows, int) else int(dst_rows[b])
            c_t = int(self.citystate_center[b, s])
            pop = max(1, (int(self.citystate_pop[b, s]) * 3) // 4)
            self.citystate_alive[b, s] = False
            # CIV6: "City-state conquered: 50 (all civs gain Grievances against
            # you)", and "City-state razed: 100" when the captor is at its cap.
            _one = torch.zeros(self.B, dtype=torch.bool, device=dev)
            _one[b] = True
            self._grievance_cs_taken(
                row, torch.full_like(_one, int(self.city_alive[b, row].sum()) >= max_cities), _one)
            # A route dies with its endpoint, for WHICHEVER seat holds it — the
            # minor is encoded -(2+s) in every row's dest column, seat 0's too.
            dead_cs = self.seat_routes[b, :, :, 1] == -(2 + s)  # [NS, K]
            self.seat_routes[b] = torch.where(dead_cs.unsqueeze(2), torch.full_like(self.seat_routes[b], -1), self.seat_routes[b])
            self.seat_route_dseat[b] = torch.where(dead_cs, torch.full_like(self.seat_route_dseat[b], -1), self.seat_route_dseat[b])
            self.seat_route_dcity[b] = torch.where(dead_cs, torch.full_like(self.seat_route_dcity[b], -1), self.seat_route_dcity[b])
            self.seat_route_exp[b] = torch.where(dead_cs, torch.full_like(self.seat_route_exp[b], -1), self.seat_route_exp[b])
            ring = (self.pair_dist[c_t] <= 2) & (self.tile_seat[b] == 100 + s)
            # a plot changing HANDS drops its LOCK (`setTileOwner`'s clear)
            self.tile_locked[b] &= ~ring
            self.tile_seat[b] = torch.where(ring, torch.full_like(self.tile_seat[b], NO_SEAT), self.tile_seat[b])
            self._tile_owner_ver += 1
            if int(self.city_alive[b, row].sum()) >= max_cities:
                continue  # razed at the seat city cap — the TS early return, before nextCityId++
            col = self._seat_city_append(b, row)
            new_id = int(self.civ_next_city_id[b, row])
            self.civ_next_city_id[b, row] += 1
            self.tile_seat[b] = torch.where(ring, torch.full_like(self.tile_seat[b], row), self.tile_seat[b])
            self.tile_city[b] = torch.where(ring, torch.full_like(self.tile_city[b], new_id), self.tile_city[b])
            self.tile_seat[b, c_t] = row
            self.tile_city[b, c_t] = new_id
            self._tile_owner_ver += 1
            self.city_alive[b, row, col] = True
            self._add_era_score(row, self._era_pts["conquer"], self._row_hot(b))
            self._reveal_around(torch.tensor([b], dtype=torch.long, device=dev), row,
                                torch.tensor([c_t], dtype=torch.long, device=dev), 3)
            self.city_id[b, row, col] = new_id
            self.city_is_cap[b, row, col] = False  # an annexed minor is never a capital
            self.city_orig_cap[b, row, col] = -1   # ...and never anyone's original one
            self.city_founder[b, row, col] = -1     # a minor founded it, and minors keep no ledger
            # CIV6 (City-State Emergency): the minor's PATRONS — met, with at
            # least one envoy — are who may bring it to the Congress.
            _cs_kind = self._emg_at.get("CITY_STATE", -1)
            if _cs_kind >= 0:
                _aff = torch.zeros(self.B, self.n_majors, dtype=torch.bool, device=dev)
                _aff[b] = (self.seat_citystate_met[b, : self.n_majors, s]
                           & (self.seat_citystate_envoys[b, : self.n_majors, s] >= 1))
                _aff[b, row] = False
                _hot = torch.zeros(self.B, dtype=torch.bool, device=dev)
                _hot[b] = True
                self._raise_emergency(
                    _cs_kind,
                    torch.full((self.B,), row, dtype=torch.long, device=dev),
                    torch.full((self.B,), new_id, dtype=torch.long, device=dev), _aff, _hot)
            self.city_center[b, row, col] = c_t
            self.city_pop[b, row, col] = pop
            self.city_hp[b, row, col] = half_hp
            self.city_loyalty[b, row, col] = 100.0
            self.centre_slot_at[b, c_t] = col
            # Everything the TS literal leaves empty is SLOT HYGIENE (the
            # append head is a compacted-away city's index) — except what the
            # minor BUILT, which the conquest carries: the tiles already hold
            # its districts, so a registry that said "none" would disagree
            # with them.
            self.city_growth[b, row, col] = 0
            self.city_cbox[b, row, col] = 0
            self.city_acquired[b, row, col] = 0
            self.city_outer_hp[b, row, col] = self.city_outer_hp[b, self._CITY_MINOR0 + s, 0]
            self._q_clear(b, row, col)
            self.city_prod_bank[b, row, col] = 0
            self.city_gw_writing[b, row, col] = 0
            self.city_gw_art[b, row, col] = 0
            self.city_gw_music[b, row, col] = 0
            self.city_relics[b, row, col] = 0
            self.city_artifacts[b, row, col] = 0
            self.city_artifact_era[b, row, col, :] = -1
            self.city_artifact_seat[b, row, col, :] = -1
            self.city_gwart_type[b, row, col, :] = -1
            self.city_gwart_artist[b, row, col, :] = -1
            self.city_dist_tile[b, row, col, :] = self.city_dist_tile[b, self._CITY_MINOR0 + s, 0, :]
            self.city_spec_pin[b, row, col, :] = -1
            self.city_wonder[b, row, col, :] = -1
            self.city_bldg[b, row, col, :] = self.city_bldg[b, self._CITY_MINOR0 + s, 0, :]
            self._bldg_version += 1
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
        self.tmove[rows, tiles] = self.hills[rows, tiles].long() * self._mp_scale  # nor slows movement (hills-only cost)
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
        """Unit upkeep + the bankruptcy rule for ONE seat row, at the loop
        position right after the seat's gold lands:
        charge maintenance for every living unit of this seat off the POOLED
        planes, then disband while insolvent. An eliminated actor charges
        nothing (the TS loop's eliminated-actor continue)."""
        if not self.units_mode:
            return
        mine = self.unit_alive & (self.unit_seat == row)
        upkeep = (self._unit_upkeep(row, self.unit_type) * mine.to(self.dtype)).sum(dim=1)
        upkeep = upkeep + self._wmd_upkeep(row)
        tre = self.civ_treasury[:, row]
        self.civ_treasury[:, row] = torch.where(active, tre - upkeep, tre)
        self._bankrupt_disband(row, active)

    def _wmd_upkeep(self, row: int) -> torch.Tensor:
        '''[B] gold the seat's nuclear devices bill this turn. CIV6: 14 Gold
        per turn for a Nuclear Device, 16 for a Thermonuclear one, halved by
        Second Strike Capability.'''
        if self._n_devices <= 0:
            return torch.zeros(self.B, dtype=self.dtype, device=self.device)
        up = torch.tensor(self._nuke_upkeep, dtype=self.dtype, device=self.device)
        gold = (self.civ_wmd[:, row].to(self.dtype) * up.unsqueeze(0)).sum(dim=1)
        pct = self._fx_by_row("wmdup")[:, row].to(self.dtype)
        return gold * (100.0 + pct) / 100.0

    def _bankrupt_disband(self, row: int = 0, active: torch.Tensor | None = None) -> None:
        """Disband ONE unit of seat-row `row` per turn while its treasury is
        insolvent — milli-rounded test (sub-milli non-dyadic gold drift must
        not trip the < 0 boundary here but not on TS). The priciest alive
        unit goes; ties break to the lowest slot (= oldest, matching TS's
        lowest id: the window only ever appends, so ONE seat's slots ascend in
        that seat's own spawn order even though every major seat interleaves
        into it). Only upkeep>0 units are candidates, and there is no refund.
        `active` is the TS loop's eliminated-actor continue."""
        insolvent = js_round(self.civ_treasury[:, row] * 1000) < 0
        if active is not None:
            insolvent = insolvent & active
        if not bool(insolvent.any()):
            return
        maint = self._unit_upkeep(row, self.unit_type)
        cand = self.unit_alive & (self.unit_seat == row) & (maint > 0)
        W = cand.shape[1]
        slots = torch.arange(W, device=self.device, dtype=maint.dtype).unsqueeze(0)  # [1, W]
        # maximize (upkeep, -slot): upkeep*(W+1) - slot lets upkeep dominate, tie -> lowest slot
        score = torch.where(cand, maint * float(W + 1) - slots, torch.full_like(maint, -1e30))
        victim = score.argmax(dim=1)
        do_kill = insolvent & cand.any(dim=1)
        if not bool(do_kill.any()):
            return
        rows = do_kill.nonzero(as_tuple=True)[0]
        vslot = victim[rows]
        vtile = self.unit_tile[rows, vslot]
        self._occ_clear(rows, vtile, vslot)
        self.unit_alive[rows, vslot] = False

    def _barb_reset_mp(self) -> None:
        """Reset barbarian MP: `u.movesLeft = UNITS[u.type].moves`.

        Deliberately NOT `_reset_mp`: TS writes movesLeft ONLY, so movesFull
        keeps refreshUnits' embark-aware value — which is what stepUnit's
        afford rule and next turn's "spent no MP" gate both read — and it uses
        the plain type pool, not the embark one.
        """
        self.barb_unit_mp.copy_(
            self._mp_scale * self._type_moves[self.barb_unit_type.clamp(min=0, max=self.NU - 1)])

    def _barbarian_phase(self) -> None:
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
        ranged_type = 5 if self.turn > cb.get("crossbowmanAfterTurn", 120) else 4
        self._barb_naval_type = (
            self._barb_quad_idx
            if self.turn > cb.get("crossbowmanAfterTurn", 120)
            else self._barb_galley_idx
        )
        cav_type = (
            self._barb_knight_idx
            if self.turn > cb.get("crossbowmanAfterTurn", 120)
            else self._barb_horseman_idx
        )

        any_city = self.city_alive[:, :self.n_majors].reshape(B, -1).any(dim=1)
        can_roll = any_city & (self.n_camps < self.max_camps)
        r1 = self._next_random(can_roll)
        want = can_roll & (r1 < cb.get("campSpawnChance", 0.08))
        if bool(want.any()):
            wr = want.nonzero(as_tuple=True)[0]
            # campCandidates excludes t.district LIVE: camp_ok is static, but
            # paves are not, and an orphaned pave left over from a razed city
            # would pad the set and shift the draw-indexed camp spot. Camps rise
            # away from EVERY major's live centre — ONE scan over the whole city
            # block, which is also one gather instead of two.
            cc_w = self.city_center[wr, :self.n_majors].reshape(len(wr), -1)
            alive_w = self.city_alive[wr, :self.n_majors].reshape(len(wr), -1)
            near_city_w = ((self.pair_dist[cc_w.clamp(min=0)] < 5) & alive_w.unsqueeze(2)).any(dim=1)  # [n, T]
            cand_w = self.camp_ok[wr] & (self.tile_seat[wr] < 0) & ~near_city_w & (self.district[wr] < 0) & (self.built_wonder[wr] < 0)
            if self.fog_of_war:
                # camps rise IN THE FOG — only on tiles dark to EVERY major
                # seat (unexploredByAll; combat.ts's preferFog term).
                cand_w = cand_w & ~self.seat_explored[wr].any(dim=1)
            if self.K > 0:
                camp_d_w = self.pair_dist[self.camp_tile[wr].clamp(min=0)].to(torch.long)
                near_camp_w = ((camp_d_w < 5) & (self.camp_tile[wr] >= 0).unsqueeze(2)).any(dim=1)
                cand_w = cand_w & ~near_camp_w
            has = torch.zeros_like(want)
            has[wr] = cand_w.any(dim=1)
            r2 = self._next_random(has)
            if bool(has.any()):
                k_w = torch.floor(r2[wr] * cand_w.sum(dim=1).to(torch.float64)).to(torch.long)
                cum_w = cand_w.long().cumsum(dim=1)
                sel_w = cand_w & (cum_w == (k_w + 1).unsqueeze(1))
                spot = torch.zeros(B, dtype=torch.long, device=dev)
                spot[wr] = sel_w.long().argmax(dim=1)
                rows = has.nonzero(as_tuple=True)[0]
                self.camp_tile[rows, self.n_camps[rows]] = spot[rows]
                self._eff_version += 1  # a new outpost lowers its neighbours' appeal
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
            # A camp's CLASS is its LOCATION's: Horses within barbHorseRange
            # makes it a cavalry outpost, a reachable coast a pirate camp. The
            # horse test is per game because the camp tile is.
            horse = (
                ((self.pair_dist[camp.clamp(min=0)] <= self._barb_horse_range)
                 & (self.res_id == self._barb_horse_res)).any(dim=1)
                & active & (cav_type >= 0)
            )
            # REGARRISON on the camp's own land ladder — a hull cannot hold a
            # camp. Per game only one of the two masks fires, so the pool's
            # append order is the TS spawn order in every game.
            _rg = active & ~near_any
            self._spawn_barb(_rg & horse, camp, cav_type)
            self._spawn_barb(_rg & ~horse, camp, melee_type)
            can_grow = active & near_any & (self.barb_unit_alive.sum(dim=1) < self.n_camps * cb.get("maxBarbPerCamp", 3))
            r = self._next_random(can_grow)
            _raid = can_grow & (r < cb.get("garrisonGrowChance", 0.1))
            # The raid ROTATES: the camp's CLASS unit, then ranged, then melee,
            # so every camp fields melee and ranged whatever it stands on. `k`
            # IS the TS `campNo`: camps append at n_camps and _clear_camp_at
            # splices left exactly like state.barbCamps.splice, so slots
            # 0..n_camps-1 are dense and in the same order as the TS array.
            # Zero-draw: the 0.1 roll above already fired and nothing else is
            # consulted.
            _slot = (k + self.turn) % 3
            if _slot == 1:
                self._spawn_barb(_raid, camp, ranged_type)
            elif _slot == 2:
                self._spawn_barb(_raid, camp, melee_type)
            else:
                _nav = torch.zeros_like(_raid)
                if self._barb_naval_type >= 0:
                    _nb = self.neigh[camp.clamp(min=0)]
                    _nbc = _nb.clamp(min=0)
                    _free = (
                        (_nb >= 0)
                        & ((self.wpass.gather(1, _nbc)
                            & ~self.ocean_tile.gather(1, _nbc))  # barbarians have no CARTOGRAPHY
                           | self._canal_pass().gather(1, _nbc))
                        & (self.military_at.gather(1, _nbc) < 0)  # no unit at all
                        & (self.civilian_at.gather(1, _nbc) < 0)
                        & (self.embarked_at.gather(1, _nbc) < 0)
                    )
                    _key = torch.where(_free, _nb, torch.full_like(_nb, self.T + 1))
                    _best = _key.min(dim=1).values
                    _nav = _raid & (_best <= self.T)
                    if bool(_nav.any()):
                        self._spawn_barb(_nav, _best.clamp(max=self.T - 1), self._barb_naval_type, naval=True)
                _land = _raid & ~_nav
                self._spawn_barb(_land & horse, camp, cav_type)
                self._spawn_barb(_land & ~horse, camp, melee_type)

        # One guard stays home per camp: first unit (in unit order) within
        # reach of each camp (in camp order), like the TS guard set. Only
        # `guard` mutates inside this loop, so the distances hoist too
        # (fresh — garrison spawns just added units).
        guard = torch.zeros(B, simbase.BARB_POOL_MAX, dtype=torch.bool, device=dev)
        if any_camp:
            du_g = self.pair_dist[self.camp_tile.clamp(min=0).unsqueeze(2), self.barb_unit_tile.unsqueeze(1)].to(torch.long)
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
        u_rngd_all = self.barb_unit_alive & (self._type_ranged_strength[self.barb_unit_type.clamp(min=0, max=self.NU - 1)] > 0)
        any_rngd = bool(u_rngd_all.any())
        for u in u_live:
            act = self.barb_unit_alive[:, u] & ~guard[:, u]
            if not bool(act.any()):
                continue
            here = self.barb_unit_tile[:, u]
            nb = self.neigh[here]
            nbc = nb.clamp(min=0)
            # ANY adjacent centre is a melee target — `caps.alwaysHostile`
            # needs no war, `cityAtIndex` names no seat, and a CITY-STATE
            # centre answers through `attackTargets`'s cityStateTarget arm
            # (adjacent, either weapon). `centre_slot_at` carries the majors'
            # centres, `citystate_at` the minors'.
            ctr = self.centre_slot_at.gather(1, nbc) >= 0
            # the CENTRE tile only — TS's cityStateTarget arm keys on
            # `centerIndex`, never on territory, and only for a LIVE minor
            cs_nb = self._centre_seat_plane().gather(1, nbc) >= 100
            # A NON-BARBARIAN unit is adjacent (a barbarian is not a target for
            # a barbarian). Civilians are never barbarian, so only the military
            # plane needs the seat test.
            _mn = self._visible_military_at(BARB_SEAT).gather(1, nbc)
            _mn_seat = torch.where(_mn >= 0, self.unit_seat.gather(1, _mn.clamp(min=0)), torch.full_like(_mn, -1))
            has_unit = (((_mn >= 0) & (_mn_seat != BARB_SEAT))
                        | (self.civilian_at.gather(1, nbc) >= 0)
                        | (self.embarked_at.gather(1, nbc) >= 0))
            enc_nb = self._encamp_block(nb, BARB_SEAT) if self._encamp_didx >= 0 else None
            valid = (nb >= 0) & (ctr | cs_nb | has_unit | (enc_nb if enc_nb is not None else False))
            tkey = torch.where(valid, nb, T + 1)
            target_tile = tkey.min(dim=1).values
            # A RANGED raider (ARCHER/CROSSBOWMAN) scans its FULL range
            # instead: attackTargets over the whole map in TILE ORDER. Target
            # classes are attackTargets' for a barbarian — `hasEnemy` (any
            # hostile unit, military or civilian; a barbarian is never hostile
            # to a barbarian) at d in [1, range], and `cityTarget`, which for
            # an alwaysHostile seat is ADJACENT ONLY (`d === 1`) whatever the
            # weapon — a barbarian never shoots a city from range — and a
            # CITY-STATE centre joins that adjacent clause exactly like a
            # major's. Gated on `.any()` so a batch with no ranged barbarian
            # pays nothing for the [B, T] scan.
            rngd = u_rngd_all[:, u]
            if any_rngd and bool((act & rngd).any()):
                # CIV6 (Forward Observers / Coincidence Rangefinding): "+1
                # Range" — the only thing that moves a chassis's own.
                rng_u = (self._type_ranged_range[self.barb_unit_type[:, u].clamp(min=0, max=self.NU - 1)]
                         + self._promo_pool_val("barb", "RANGE")[:, u])
                d_all = self.pair_dist[here.clamp(min=0)].to(torch.long)
                # a district's defenses are a target at range, priced by the
                # -17 rather than refused; every centre — a major's or a live
                # minor's — stays adjacent-only.
                _enc_plane = (self._encamp_block_plane(BARB_SEAT) if self._encamp_didx >= 0
                              else torch.zeros_like(self.centre_slot_at, dtype=torch.bool))
                _cs_ctr = torch.zeros_like(self.centre_slot_at, dtype=torch.bool)
                if self.S > 0:
                    _cs_ctr.scatter_(1, self.citystate_center[:, :self.S].clamp(min=0),
                                     self.citystate_alive[:, :self.S])
                rng_valid = (
                    (d_all >= 1)
                    & (d_all <= rng_u.unsqueeze(1))
                    & (self._nonbarb_unit_plane() | _enc_plane)
                ) | ((d_all == 1) & ((self.centre_slot_at >= 0) | _cs_ctr))
                rng_key = torch.where(rng_valid, self._arange_bt, self._tile_miss)
                target_tile = torch.where(rngd, rng_key.min(dim=1).values, target_tile)
            attack = act & (target_tile <= T)
            ttc = target_tile.clamp(max=T - 1)
            ctr_here = self.centre_slot_at.gather(1, ttc.unsqueeze(1)).squeeze(1) >= 0
            _csp = self._centre_seat_plane().gather(1, ttc.unsqueeze(1)).squeeze(1)
            cs_here = _csp >= 100
            _csi = (_csp - 100).clamp(min=0)
            has_u = self._nonbarb_unit_at(ttc.unsqueeze(1)).squeeze(1)
            _enc_here = (
                self._encamp_block(ttc.unsqueeze(1), BARB_SEAT).squeeze(1)
                if self._encamp_didx >= 0
                else torch.zeros_like(attack)
            )
            city_att = attack & ~rngd & ctr_here
            cs_att = attack & ~rngd & cs_here & ~ctr_here
            # the district shelters whoever stands on it, so it answers first
            unit_att = attack & ~rngd & has_u & ~ctr_here & ~cs_here & ~_enc_here
            enc_att = attack & ~rngd & ~ctr_here & ~cs_here & _enc_here

            if bool(city_att.any()):
                self._melee_city(city_att, ttc, "barb", u)
            if bool(cs_att.any()):
                # the shared assault floors the minor at 1 HP for a barbarian
                # attacker, so the capture tail it returns is always empty here
                self._assault_city_state(cs_att, _csi.clamp(min=0), ttc, "barb", u)
            if bool(unit_att.any()):
                self._hostile_vs_unit(unit_att, ttc, "barb", u)
            if bool(enc_att.any()):
                self._attack_encampment(enc_att, ttc, "barb", u)
            # A blow at a CITY or an Encampment ends the raider's turn
            # outright; the unit arms spend inside their own bodies, where the
            # promotion that waives it is read.
            city_spent = city_att | cs_att | enc_att
            self.barb_unit_mp[:, u] = torch.where(
                city_spent, torch.zeros_like(self.barb_unit_mp[:, u]), self.barb_unit_mp[:, u])
            # A RANGED raider strikes instead: hostileUnitAct routes any
            # UNITS[type].ranged attacker through hostileRangedStrike — ONE
            # roll, no retaliation, no advance, civilians take the roll, and a
            # seat-0 city floors at 1 HP and is never captured. The method
            # spends the turn itself; a row that reaches only an ungarrisoned
            # CIV centre (TS `enemyCity` resolves to seat-0 cities only) spends
            # nothing, but `attack` still HOLDS the unit, because TS returns
            # from hostileUnitAct before the pillage/march branches.
            rng_att = attack & rngd
            if any_rngd and bool(rng_att.any()):
                self._hostile_ranged_strike(rng_att, ttc, "barb", u)

            pillage = torch.zeros_like(act)
            if self.improvements_on:
                h_imp = self.improvement.gather(1, here.unsqueeze(1)).squeeze(1) >= 0
                h_unpil = ~self.pillaged.gather(1, here.unsqueeze(1)).squeeze(1)
                _h_seat = self.tile_seat.gather(1, here.unsqueeze(1)).squeeze(1)
                # `isTerritorial` — owned by any major OR city-state
                h_owned = (_h_seat >= 0) & (_h_seat < BARB_SEAT)
                pillage = act & ~attack & h_imp & h_unpil & h_owned
                if bool(pillage.any()):
                    rows = pillage.nonzero(as_tuple=True)[0]
                    _impv = self.improvement[rows, here[rows]].clamp(min=0)
                    # the plunder row's HEAL pays anyone; a barbarian has no
                    # purse to bank the other kinds (`pillagePlunder`)
                    heal_amt = torch.where(self._imp_plun_kind[_impv] == 1,
                                           self._imp_plun_amt[_impv], torch.zeros_like(_impv))
                    self.pillaged[rows, here[rows]] = True
                    self.barb_unit_mp[rows, u] = 0  # the turn is spent (TS movesLeft = 0)
                    self._eff_version += 1  # a farm's yield just dropped
                    hp_cap = self.rules.combat.get("unitHp", 100)
                    self.barb_unit_hp[rows, u] = torch.where(
                        heal_amt > 0, (self.barb_unit_hp[rows, u] + heal_amt).clamp(max=hp_cap),
                        self.barb_unit_hp[rows, u]
                    )

            dist_pillage = torch.zeros_like(act)
            if self.districts_on:
                h_dist = self.district.gather(1, here.unsqueeze(1)).squeeze(1)
                h_dcomp = self.district_complete.gather(1, here.unsqueeze(1)).squeeze(1)
                h_dunpil = ~self.district_pillaged.gather(1, here.unsqueeze(1)).squeeze(1)
                _hd_seat = self.tile_seat.gather(1, here.unsqueeze(1)).squeeze(1)
                # `isTerritorial` — owned by any major OR city-state
                h_downed = (_hd_seat >= 0) & (_hd_seat < BARB_SEAT)
                # CIV6: the Encampment "cannot be pillaged normally".
                dist_pillage = (act & ~attack & ~pillage & (h_dist >= 0)
                                & (h_dist != self._encamp_didx)
                                & h_dcomp & h_dunpil & h_downed)
                if bool(dist_pillage.any()):
                    rows = dist_pillage.nonzero(as_tuple=True)[0]
                    _dvv = h_dist[rows].clamp(min=0)
                    # a HEAL-plunder district pays its wrecker like a farm
                    _dheal = torch.where(self._d_plun_kind[_dvv] == 1,
                                         self._d_plun_amt[_dvv], torch.zeros_like(_dvv))
                    self.district_pillaged[rows, here[rows]] = True
                    self._air_scatter_from(rows, here[rows])
                    self.barb_unit_mp[rows, u] = 0  # the turn is spent (TS movesLeft = 0)
                    hp_cap = self.rules.combat.get("unitHp", 100)
                    self.barb_unit_hp[rows, u] = torch.where(
                        _dheal > 0, (self.barb_unit_hp[rows, u] + _dheal).clamp(max=hp_cap),
                        self.barb_unit_hp[rows, u]
                    )
                    self._eff_version += 1  # district yields just dropped

            march = act & ~attack & ~pillage & ~dist_pillage
            if not bool(march.any()):
                continue
            arangeT = self._arangeT
            if self.improvements_on or self.districts_on:
                # `isTerritorial(tileSeat(t))` — owned by any major or
                # city-state. A barbarian is hostile to all of them, so no war
                # term joins it.
                _owned = (self.tile_seat >= 0) & (self.tile_seat < BARB_SEAT)  # [B, T]
                imp_job = (self.improvement >= 0) & ~self.pillaged & _owned  # [B, T]
                if self.districts_on:  # pillageable districts join the union
                    imp_job = imp_job | ((self.district >= 0) & (self.district != self._encamp_didx)
                                         & self.district_complete & ~self.district_pillaged & _owned)
                d_imp = self.pair_dist[here].to(torch.long)
                ikey = torch.where(imp_job & (d_imp < 13), d_imp * (T + 1) + arangeT, self._march_miss)
                imp_min, imp_tgt = ikey.min(dim=1)
                has_imp = imp_min < 10**9
            else:
                has_imp = torch.zeros_like(act)
                imp_tgt = here.clamp(min=0)
            # BARBARIANS MARCH ON ANYONE — `hostileUnitAct`'s city scan over
            # majors AND city-states (real Civ 6 barbarians raid whoever is
            # near the camp), on its key: distance, then the seat id, then the
            # centre tile (`caps.alwaysHostile`, so no war term). An adjacent
            # minor centre is a melee target now, so a parked raider fights
            # rather than stands. ONE argmin over the whole city block: the
            # key is unique per live city, so the winner is the same one a
            # slot-by-slot scan would have kept.
            _cc = self.city_center.reshape(B, -1).clamp(min=0)  # [B, M]
            _ca = self.city_alive.reshape(B, -1)                # [B, M]
            _d2 = self.pair_dist[here.clamp(min=0).unsqueeze(1), _cc].to(torch.long)
            _key = torch.where(_ca, _d2 * (2048 * 256) + self._march_seatkey + _cc,
                               torch.full_like(_d2, 10**18))
            ckey_min, _cwin = _key.min(dim=1)
            city_tgt = torch.where(ckey_min < 10**18,
                                   _cc.gather(1, _cwin.unsqueeze(1)).squeeze(1),
                                   here.clamp(min=0))
            tgt = torch.where(has_imp, imp_tgt, city_tgt)
            has_tgt = has_imp | (ckey_min < 10**18)
            d_here = self.pair_dist[here, tgt].to(torch.long)
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
                    ((self.wpass.gather(1, nb2c) & ~self.ocean_tile.gather(1, nb2c))
                     | self._canal_pass().gather(1, nb2c)),
                    self.passable.gather(1, nb2c),
                )
                step_ok = (nb2 >= 0) & _plane & ~self._blocked_for(nb2, BARB_SEAT, is_naval=_navm)
                d_nb = self.pair_dist[tgt.unsqueeze(1), nb2c].to(torch.long)
                skey = torch.where(step_ok, d_nb * 8 + arange6, 10**9)
                best = skey.min(dim=1).values
                dir_i = (best % 8).clamp(max=5)
                dest = nb2.gather(1, dir_i.unsqueeze(1)).squeeze(1)
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


