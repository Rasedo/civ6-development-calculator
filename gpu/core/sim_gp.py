from __future__ import annotations

from .simbase import *  # noqa: F401,F403 — torch, constants, helpers: the shared floor
from .simbase import _MUTABLE  # noqa: F401 — private names do not ride a star import
from . import simbase  # the PATCHABLE globals must be read live


class SimGp:
    """A GREAT PERSON IS PLACED AND USED — the `gpAbility.ts` twin.

    Every class arrives as a unit carrying a queue position (`unit_gp_at`),
    walks to a site its ability may be spent at, and spends a charge there.
    `_gp_effects` is the sourced per-person row; `_gp_fx_names` names its
    columns so nothing below writes a position down.
    """

    # ---------------------------------------------------------------- lookups
    def _gp_cls_of(self, utype: torch.Tensor) -> torch.Tensor:
        """the GP CLASS each unit type is the chassis for, -1 for the rest."""
        tab = getattr(self, "_unit_gp_cls", None)
        if tab is None:
            tab = torch.full((self.NU,), -1, dtype=torch.long, device=self.device)
            for cls in range(int(self._gp_class_unit.numel())):
                u = int(self._gp_class_unit[cls])
                if 0 <= u < self.NU:
                    tab[u] = cls
            self._unit_gp_cls = tab
        return tab[utype.clamp(min=0, max=self.NU - 1)]

    def _gp_fx(self, cls: torch.Tensor, at: torch.Tensor, name: str) -> torch.Tensor:
        """ONE named column of the person each (cls, at) pair names."""
        k = self._GPFX.get(name, -1)
        if k < 0:
            return torch.zeros_like(cls, dtype=self._gp_effects.dtype)
        return self._gp_effects[cls.clamp(min=0), at.clamp(min=0, max=self._gp_effects.shape[1] - 1), k]

    def _gp_row(self, cls: torch.Tensor, at: torch.Tensor) -> torch.Tensor:
        """the whole record for each (cls, at) pair — [..., fxw]."""
        return self._gp_effects[cls.clamp(min=0), at.clamp(min=0, max=self._gp_effects.shape[1] - 1)]

    # ------------------------------------------------------ the permanent runs
    def _gp_perm(self, row: int, name: str) -> torch.Tensor:
        """[B] — one permanent per-seat channel a spent Great Person left."""
        k = self._gp_perm_names.index(name) if name in self._gp_perm_names else -1
        if k < 0:
            return torch.zeros(self.B, dtype=self.civ_gp_perm.dtype, device=self.device)
        return self.civ_gp_perm[:, row, k]

    def _gp_perm_at(self, seat: torch.Tensor, name: str, b: torch.Tensor | None = None) -> torch.Tensor:
        """the same channel for the seat each element names, 0 off the roster
        (a minor or a barbarian recruits nobody). Pass `b` — each element's
        batch row — wherever the leading dim is not the batch."""
        z = torch.zeros_like(seat, dtype=self.civ_gp_perm.dtype)
        k = self._gp_perm_names.index(name) if name in self._gp_perm_names else -1
        if k < 0:
            return z
        ok = (seat >= 0) & (seat < self.n_majors)
        s0 = seat.clamp(min=0, max=self.n_majors - 1)
        plane = self.civ_gp_perm[:, :, k]
        if b is None:
            return torch.where(ok, plane.gather(1, s0.reshape(self.B, -1)).reshape_as(seat), z)
        return torch.where(ok, plane[b.clamp(min=0, max=self.B - 1), s0], z)

    def _gp_city_perm(self, row: int, name: str) -> torch.Tensor:
        """[B, RC] — one permanent per-city channel."""
        k = self._gp_city_perm_names.index(name) if name in self._gp_city_perm_names else -1
        if k < 0:
            return torch.zeros(self.B, self.RC, dtype=self.city_gp_perm.dtype, device=self.device)
        return self.city_gp_perm[:, row, :, k]

    def _gp_tile_appeal(self, row: int) -> torch.Tensor:
        """[B, T] — what each of this row's tiles gets from the city that owns
        it, the `gpAppealResolver` twin."""
        per = self._gp_city_perm(row, "appeal")
        if not bool((per != 0).any()):
            return torch.zeros(self.B, self.T, dtype=per.dtype, device=self.device)
        col = self.city_slot_at(row)
        return torch.where(col >= 0, per.gather(1, col.clamp(min=0)), torch.zeros_like(per[:, :1]).expand(self.B, self.T))

    def _gp_appeal_plane(self) -> torch.Tensor:
        """[B, T] — the appeal every owner city grants its own tiles, summed
        over the majors (a tile belongs to at most one of them)."""
        out = torch.zeros(self.B, self.T, dtype=self.city_gp_perm.dtype, device=self.device)
        if not bool((self.city_gp_perm != 0).any()):
            return out
        for r in range(self.n_majors):
            out = out + self._gp_tile_appeal(r)
        return out

    def _gp_prod_pct(self, row: int, cur: torch.Tensor) -> torch.Tensor:
        """the share a Great Person permanently adds to what this city is
        building — `prodBoostPct`'s Great-Person half, which stacks ADDITIVELY
        with the cards exactly as CIV6 stacks production modifiers."""
        _sh = (self.B,) + (1,) * (cur.dim() - 1)  # one city column or a whole row
        up = self._gp_perm(row, "unitProdPct").double().reshape(_sh) / 100.0
        spp = self._gp_perm(row, "spaceProdPct").double().reshape(_sh) / 100.0
        is_unit = (cur == self.NB) | ((cur >= self.UNIT_BASE) & (cur < self.UNIT_BASE + self.NU))
        out = is_unit.double() * up
        if self._proj_rows:
            _sp = torch.tensor([1 if i in set(self._space_proj_idx) else 0
                                for i in range(len(self._proj_rows))], dtype=torch.bool, device=self.device)
            _pi = cur - self.PROJECT_BASE
            is_space = (_pi >= 0) & (_pi < len(self._proj_rows)) \
                & _sp[_pi.clamp(min=0, max=len(self._proj_rows) - 1)]
            out = out + is_space.double() * spp
        return out

    # ---------------------------------------------------------------- the site
    def _gp_site_ok(self, row: int, sc: torch.Tensor, tc: torch.Tensor) -> torch.Tensor:
        """[B, N] — may the unit at each rank spend a charge where it stands?

        `sc` is the unit slot per rank, `tc` its tile. Every arm is evaluated
        and selected by the person's own site code: a mask-legal column that
        landed in no arm would silently no-op.
        """
        cls = self._gp_cls_of(self.unit_type.gather(1, sc))
        at = self.unit_gp_at.gather(1, sc)
        ok = (cls >= 0) & (at >= 0) & (self.unit_charges.gather(1, sc) > 0)
        if not bool(ok.any()):
            return ok
        site = self._gp_site[cls.clamp(min=0), at.clamp(min=0, max=self._gp_site.shape[1] - 1)]
        sdist = self._gp_site_district[cls.clamp(min=0), at.clamp(min=0, max=self._gp_site.shape[1] - 1)]
        own = (self.tile_seat == row).gather(1, tc)

        # 0 the class's own COMPLETED district, on this seat's ground — its
        # pillage fact is the DISTRICT plane, never the improvement one
        a_dist = own & (self.district.gather(1, tc) == sdist) & (sdist >= 0) \
            & self.district_complete.gather(1, tc) & ~self.district_pillaged.gather(1, tc)
        # 1 anywhere the unit can already stand
        a_any = torch.ones_like(a_dist)
        # 2 a city of this seat with a free slot of the class's work kind
        a_gw = torch.zeros_like(a_dist)
        for kind, k_cls in enumerate(self._gw_cls):
            if k_cls < 0:
                continue
            col = self.city_slot_at(row).gather(1, tc)
            used = (self.city_gw_writing, self.city_gw_art, self.city_gw_music)[kind][:, row]
            cap = self._gw_capacity(row, kind)
            free = ((cap - used) > 0) & self.city_alive[:, row]
            here = torch.where(col >= 0, free.gather(1, col.clamp(min=0)), torch.zeros_like(col, dtype=torch.bool))
            a_gw = a_gw | (own & here & (cls == k_cls))
        # 3 inside a city-state's territory
        _ts_here = self.tile_seat.gather(1, tc)
        a_cs = (_ts_here >= 100) & (_ts_here < BARB_SEAT)
        # 4 an owned tile carrying a luxury
        a_lux = own & (self.lux_id.gather(1, tc) >= 0)
        # 5 unclaimed ground next to this seat's territory
        _nb = self.neigh[tc.reshape(-1)].reshape(tc.shape[0], tc.shape[1], 6)
        _own_nb = ((self.tile_seat == row).gather(1, _nb.clamp(min=0).reshape(tc.shape[0], -1))
                   .reshape_as(_nb) & (_nb >= 0)).any(dim=2)
        a_adj = (_ts_here < 0) & _own_nb

        arms = torch.stack([a_dist, a_any, a_gw, a_cs, a_lux, a_adj], dim=0)
        pick = arms.gather(0, site.clamp(min=0, max=arms.shape[0] - 1).unsqueeze(0)).squeeze(0)
        return ok & pick

    # ---------------------------------------------------------------- the spend
    def _gp_apply(self, row: int, m: torch.Tensor, sc: torch.Tensor, hc: torch.Tensor) -> None:
        """SPEND ONE CHARGE for every game in `m`. The order below is
        `activateGreatPerson`'s, which matters wherever a clause draws."""
        if not bool(m.any()):
            return
        B, dev, dt = self.B, self.device, torch.float64
        cls = self._gp_cls_of(self.unit_type.gather(1, sc.unsqueeze(1)).squeeze(1))
        at = self.unit_gp_at.gather(1, sc.unsqueeze(1)).squeeze(1)
        era = self._gp_era[cls.clamp(min=0), at.clamp(min=0, max=self._gp_era.shape[1] - 1)]
        mf = m.to(dt)

        def col(name: str) -> torch.Tensor:
            return self._gp_fx(cls, at, name).double() * mf

        # the city the charge lands in: the one owning this tile, else the capital
        ccol = self.city_slot_at(row).gather(1, hc.unsqueeze(1)).squeeze(1)
        cap_col = torch.where(
            self.city_is_cap[:, row] & self.city_alive[:, row],
            torch.arange(self.RC, device=dev).reshape(1, -1).expand(B, self.RC),
            torch.full((B, self.RC), self.RC, dtype=torch.long, device=dev)).min(dim=1).values
        cap_col = torch.where(cap_col >= self.RC, torch.full_like(cap_col, -1), cap_col)
        ccol = torch.where(ccol >= 0, ccol, cap_col)
        has_city = m & (ccol >= 0)
        cc = ccol.clamp(min=0)

        # ---- the lumps
        self.civ_tech_prog[:, row] = self.civ_tech_prog[:, row] + col("science")
        # CIV6 (Mary Leakey): "Gain 350 Science for every Artifact in this
        # city."
        _asci = col("artifactScience")
        if bool((_asci != 0).any()):
            _n = self.city_artifacts[:, row].gather(1, cc.unsqueeze(1)).squeeze(1)
            self.civ_tech_prog[:, row] = (self.civ_tech_prog[:, row]
                                          + _asci * (_n.to(dt) * has_city.to(dt)))
        # CIV6 (Marina Raskova): "District in this tile gains +1 air unit
        # slots" — permanent, on the activating tile.
        _asb = col("airSlotBonus")
        _ab = m & (_asb > 0)
        if bool(_ab.any()):
            _r = _ab.nonzero(as_tuple=True)[0]
            self.tile_air_bonus[_r, hc[_r]] += _asb[_r].long()
        gw_cls = [k for k, c in enumerate(self._gw_cls) if c >= 0]
        wrote = torch.zeros_like(m)
        for kind in gw_cls:
            k_hit = m & (cls == self._gw_cls[kind])
            if bool(k_hit.any()):
                self._place_works(row, k_hit, self._gp_fx(cls, at, "culture").double(), kind, at, only_col=ccol)
                wrote = wrote | k_hit
        self.civ_civic_prog[:, row] = self.civ_civic_prog[:, row] + col("culture") * (~wrote).to(dt)
        self.civ_faith[:, row] = self.civ_faith[:, row] + col("faith")
        self.civ_treasury[:, row] = self.civ_treasury[:, row] + col("gold")
        prod_fx = col("prodCapital")
        if bool((prod_fx != 0).any()):
            _capa = self.city_is_cap[:, row] & self.city_alive[:, row]
            capm = _capa & (self.city_current[:, row] >= 0)
            _drip = self.city_progress[:, row].clone()
            self.city_progress[:, row] = self.city_progress[:, row] + torch.where(
                capm, prod_fx.unsqueeze(1), torch.zeros_like(self.city_progress[:, row]))
            self._repair_drip(row, _drip)
            _capb = _capa & (self.city_current[:, row] < 0)
            self.city_prod_bank[:, row] = self.city_prod_bank[:, row] + torch.where(
                _capb, prod_fx.unsqueeze(1), torch.zeros_like(self.city_prod_bank[:, row]))

        # ---- research: named eurekas, the era sweep, then the draws
        self._gp_named_eurekas(row, m, cls, at)
        self._gp_era_eurekas(row, m, cls, at, era)
        self._gp_boost_draw(row, m, cls, at, era, is_civic=False)
        self._gp_boost_draw(row, m, cls, at, era, is_civic=True)
        _free = self._gp_fx(cls, at, "freeTechRandom").long() * m.long()
        if bool((_free > 0).any()):
            self._grant_free_research(row, _free, torch.zeros_like(_free))

        # ---- the city the charge lands in
        self._gp_instant_buildings(row, has_city, cls, at, cc)
        self._gp_wonder_charge(row, has_city, cls, at, cc)
        _space = self._gp_fx(cls, at, "spaceProduction").double() * has_city.to(dt)
        if bool((_space != 0).any()) and self._proj_rows:
            _cur = self.city_current[:, row].gather(1, cc.unsqueeze(1)).squeeze(1)
            _pi = _cur - self.PROJECT_BASE
            _sp_tab = torch.tensor([1 if i in set(self._space_proj_idx) else 0 for i in range(len(self._proj_rows))],
                                   dtype=torch.bool, device=dev)
            _is_space = (_pi >= 0) & (_pi < len(self._proj_rows)) & _sp_tab[_pi.clamp(min=0, max=len(self._proj_rows) - 1)]
            _sm = has_city & _is_space & (_space != 0)
            if bool(_sm.any()):
                _r = _sm.nonzero(as_tuple=True)[0]
                self.city_progress[_r, row, cc[_r]] += _space[_r].to(self.city_progress.dtype)
        self._gp_per_adjacent(row, m, cls, at, hc)
        self._gp_luxuries(row, m, cls, at)
        _gwk = self._gp_fx(cls, at, "greatWorkKind").long()
        for kind in range(3):
            _km = has_city & (_gwk == kind) & ~wrote
            if bool(_km.any()):
                self._place_works(row, _km, torch.zeros(B, dtype=dt, device=dev), kind,
                                  torch.zeros_like(at), only_col=ccol)

        # ---- the seat's own ledgers
        self.civ_envoys_avail[:, row] = self.civ_envoys_avail[:, row] + col("envoys").to(self.civ_envoys_avail.dtype)
        # CIV6 (Matthew Perry): "Grants enough Envoys to become Suzerain at
        # this City-state, then removes all other players' Envoys" — the
        # rivals' bar is read BEFORE the removal, the clause's own order.
        _sz = col("suzerainSeize") != 0
        if bool(_sz.any()):
            _cst = self.tile_seat.gather(1, hc.unsqueeze(1)).squeeze(1) - 100
            _S = self.seat_citystate_envoys.shape[2]
            _ok = _sz & (_cst >= 0) & (_cst < _S)
            if bool(_ok.any()):
                _r = _ok.nonzero(as_tuple=True)[0]
                _cs2 = _cst[_r]
                _env = self.seat_citystate_envoys
                _suzmin = int(self.rules.citystate.get("suzerainEnvoys", 3))
                _rmax = torch.zeros_like(_cs2)
                for _o in range(self.n_majors):
                    if _o != row:
                        _rmax = torch.maximum(_rmax, _env[_r, _o, _cs2])
                _env[_r, row, _cs2] = torch.maximum(
                    _env[_r, row, _cs2], torch.maximum(_rmax + 1, torch.full_like(_rmax, _suzmin)))
                for _o in range(self.n_majors):
                    if _o != row:
                        _env[_r, _o, _cs2] = 0
        _gpp = col("gppAll")
        if bool((_gpp != 0).any()):
            self.civ_gpp[:, row] = self.civ_gpp[:, row] + _gpp.unsqueeze(1)
        self._gp_strategic(row, m, cls, at)

        # ---- the unit on the tile
        self._gp_unit_grants(row, m, cls, at, hc)

        # ---- the permanent channels
        _rowfx = self._gp_row(cls, at)
        _np = len(self._gp_perm_names)
        if _np:
            self.civ_gp_perm[:, row] = self.civ_gp_perm[:, row] + _rowfx[:, self._GP_PERM0:self._GP_PERM0 + _np] * m.to(self.civ_gp_perm.dtype).unsqueeze(1)
        _nc = len(self._gp_city_perm_names)
        if _nc and bool(has_city.any()):
            _r = has_city.nonzero(as_tuple=True)[0]
            self.city_gp_perm[_r, row, cc[_r]] += _rowfx[_r, self._GP_CPERM0:self._GP_CPERM0 + _nc].to(self.city_gp_perm.dtype)

        # ---- a PROPHET's charge is what founds a religion, not the recruit
        if self._prophet_cls >= 0:
            self.civ_prophets[:, row] = self.civ_prophets[:, row] + (m & (cls == self._prophet_cls)).long()
        self.civ_gp_used[:, row] = self.civ_gp_used[:, row] + m.long()
        self._eff_version += 1

    # ---------------------------------------------------------------- research
    def _gp_named_eurekas(self, row: int, m: torch.Tensor, cls: torch.Tensor, at: torch.Tensor) -> None:
        """CIV6 (Zhang Heng): the named technologies are boosted, and one
        already boosted is COMPLETED instead."""
        if self._gp_eureka.numel() == 0:
            return
        want = self._gp_eureka[cls.clamp(min=0), at.clamp(min=0, max=self._gp_eureka.shape[1] - 1)]
        want = want & m.unsqueeze(1)
        if not bool(want.any()):
            return
        nt = min(want.shape[1], self.civ_techs.shape[2], self.civ_tech_boosted.shape[2])
        w = want[:, :nt]
        held = self.civ_techs[:, row, :nt]
        boosted = self.civ_tech_boosted[:, row, :nt]
        newly = w & ~held & ~boosted
        done = w & ~held & boosted
        self.civ_tech_boosted[:, row, :nt] |= newly
        if bool(done.any()):
            self.civ_techs[:, row, :nt] |= done
            self.civ_tech_retain[:, row, :nt] = torch.where(
                done, torch.zeros_like(self.civ_tech_retain[:, row, :nt]), self.civ_tech_retain[:, row, :nt])
            cur = self.civ_cur_tech[:, row]
            _clr = (cur >= 0) & (cur < nt) & done.gather(1, cur.clamp(min=0, max=nt - 1).unsqueeze(1)).squeeze(1)
            self.civ_cur_tech[:, row] = torch.where(_clr, torch.full_like(cur, -1), cur)
            if self._urban_def_tech >= 0:
                self._urban_defenses_fit(row, _clr & (cur == self._urban_def_tech))
        self._dedication_event(row, self._ded_free_inquiry, newly.sum(dim=1))

    def _gp_era_eurekas(self, row: int, m: torch.Tensor, cls: torch.Tensor,
                        at: torch.Tensor, era: torch.Tensor) -> None:
        """CIV6 (Abdus Salam): every technology of the person's own era at
        once, each one a Free Inquiry event like any other eureka."""
        want = m & (self._gp_fx(cls, at, "eurekaEra") > 0)
        if not bool(want.any()):
            return
        nt = min(self.civ_tech_boosted.shape[2], self._tech_era.numel())
        band = (self._tech_era[:nt].reshape(1, -1) == era.reshape(-1, 1)) & want.reshape(-1, 1)
        newly = band & ~self.civ_techs[:, row, :nt] & ~self.civ_tech_boosted[:, row, :nt]
        self.civ_tech_boosted[:, row, :nt] |= newly
        self._dedication_event(row, self._ded_free_inquiry, newly.sum(dim=1))

    def _gp_boost_draw(self, row: int, m: torch.Tensor, cls: torch.Tensor, at: torch.Tensor,
                       era: torch.Tensor, is_civic: bool) -> None:
        """N eurekas (or inspirations) drawn over the eras `era + lo`..`+ hi`,
        in the catalog order the TS filter walks. A row with nothing open
        spends none of the stream."""
        n = self._gp_fx(cls, at, "inspirationRandom" if is_civic else "eurekaRandom").long() * m.long()
        if not bool((n > 0).any()):
            return
        lo = era + self._gp_fx(cls, at, "eurekaLo").long()
        hi = era + self._gp_fx(cls, at, "eurekaHi").long()
        eras = self._civic_era if is_civic else self._tech_era
        done = self.civ_civics[:, row] if is_civic else self.civ_techs[:, row]
        boosted = self.civ_civic_boosted[:, row] if is_civic else self.civ_tech_boosted[:, row]
        nk = min(done.shape[1], boosted.shape[1], eras.numel())
        band = (eras[:nk].reshape(1, -1) >= lo.reshape(-1, 1)) & (eras[:nk].reshape(1, -1) <= hi.reshape(-1, 1))
        for k in range(int(n.max())):
            want = n > k
            if not bool(want.any()):
                continue
            openm = band & ~done[:, :nk] & ~boosted[:, :nk]
            hit = want & openm.any(dim=1)
            rnd = self._next_random(hit)
            if not bool(hit.any()):
                continue
            pick = self._nth_open(openm, rnd)
            r = hit.nonzero(as_tuple=True)[0]
            boosted[r, pick[r]] = True
            self._dedication_event(
                row, self._ded_pen_brush if is_civic else self._ded_free_inquiry, hit.long())

    # ---------------------------------------------------------------- the city
    def _gp_instant_buildings(self, row: int, m: torch.Tensor, cls: torch.Tensor,
                              at: torch.Tensor, cc: torch.Tensor) -> None:
        if self._gp_bldg.numel() == 0 or not bool(m.any()):
            return
        want = self._gp_bldg[cls.clamp(min=0), at.clamp(min=0, max=self._gp_bldg.shape[1] - 1)]
        want = want & m.unsqueeze(1)
        if not bool(want.any()):
            return
        nb = min(want.shape[1], self.city_bldg.shape[3])
        r = m.nonzero(as_tuple=True)[0]
        self.city_bldg[r, row, cc[r], :nb] |= want[r, :nb]

    def _gp_wonder_charge(self, row: int, m: torch.Tensor, cls: torch.Tensor,
                          at: torch.Tensor, cc: torch.Tensor) -> None:
        """CIV6 (Imhotep and the other four): production into a WONDER under
        construction, doubled when that wonder's era is at or below the row's
        own `wonderEraDouble`."""
        amt = self._gp_fx(cls, at, "wonderProduction").double()
        if not bool(((amt != 0) & m).any()):
            return
        cur = self.city_current[:, row].gather(1, cc.unsqueeze(1)).squeeze(1)
        wi = cur - self.WONDER_BASE
        is_w = (wi >= 0) & (wi < max(self._wond_n, 1))
        dbl_to = self._gp_fx(cls, at, "wonderEraDouble").long()
        w_era = self._wonder_era[wi.clamp(min=0, max=max(self._wond_n - 1, 0))] if self._wond_n else torch.zeros_like(wi)
        mult = torch.where((dbl_to >= 0) & (w_era <= dbl_to), 2.0, 1.0).double()
        hit = m & is_w & (amt != 0)
        if not bool(hit.any()):
            return
        _drip = self.city_progress[:, row].clone()
        r = hit.nonzero(as_tuple=True)[0]
        self.city_progress[r, row, cc[r]] += (amt[r] * mult[r]).to(self.city_progress.dtype)
        self._repair_drip(row, _drip)

    def _gp_per_adjacent(self, row: int, m: torch.Tensor, cls: torch.Tensor,
                         at: torch.Tensor, hc: torch.Tensor) -> None:
        """`amount` per neighbouring tile carrying `source` — and the tile
        itself when the row says `here`."""
        src = self._gp_fx(cls, at, "perAdjSource").long()
        live = m & (src >= 0)
        if not bool(live.any()):
            return
        nb = self.neigh[hc]                       # [B, 6]
        nbc = nb.clamp(min=0)
        on = nb >= 0

        def hits(t: torch.Tensor) -> torch.Tensor:
            mount = self.tile_mountain.gather(1, t)
            nat = self.nwonder.gather(1, t)
            rain = ((self.feat_id.gather(1, t) == self._rainforest_fid)
                    & ~self.feat_stripped.gather(1, t)) if self._rainforest_fid >= 0 \
                else torch.zeros_like(mount)
            arms = torch.stack([mount, nat, rain], dim=0)
            k = src.clamp(min=0, max=2)
            if t.dim() == 2 and k.dim() == 1:
                k = k.unsqueeze(1).expand_as(t)
            return arms.gather(0, k.unsqueeze(0)).squeeze(0)

        n = (hits(nbc) & on).sum(dim=1)
        here_on = self._gp_fx(cls, at, "perAdjHere") > 0
        n = n + (hits(hc.unsqueeze(1)).squeeze(1) & here_on).long()
        amount = self._gp_fx(cls, at, "perAdjAmount").double() * n.double() * live.to(torch.float64)
        if not bool((amount != 0).any()):
            return
        y = self._gp_fx(cls, at, "perAdjYield").long()
        self.civ_tech_prog[:, row] = self.civ_tech_prog[:, row] + amount * (y == 0).to(torch.float64)
        self.civ_civic_prog[:, row] = self.civ_civic_prog[:, row] + amount * (y == 1).to(torch.float64)
        self.civ_treasury[:, row] = self.civ_treasury[:, row] + amount * (y == 2).to(torch.float64)
        self.civ_faith[:, row] = self.civ_faith[:, row] + amount * (y == 3).to(torch.float64)

    def _gp_luxuries(self, row: int, m: torch.Tensor, cls: torch.Tensor, at: torch.Tensor) -> None:
        """CIV6 (John Spilsbury and the three after him): an INVENTED luxury
        serves cities exactly like a worked one, and the row says how many."""
        n = self._gp_fx(cls, at, "luxuryCopies").long() * m.long()
        if not bool((n > 0).any()):
            return
        reach = self._gp_fx(cls, at, "luxuryAmenities").long().clamp(min=1)
        for k in range(int(n.max())):
            want = n > k
            slot = self.civ_gp_lux_n[:, row]
            fits = want & (slot < simbase.GP_LUX_MAX)
            if not bool(fits.any()):
                continue
            r = fits.nonzero(as_tuple=True)[0]
            self.civ_gp_lux[r, row, slot[r]] = reach[r]
            self.civ_gp_lux_n[r, row] = slot[r] + 1

    def _gp_strategic(self, row: int, m: torch.Tensor, cls: torch.Tensor, at: torch.Tensor) -> None:
        k = self._gp_fx(cls, at, "strategicSlot").long()
        amt = self._gp_fx(cls, at, "strategicAmount").long() * m.long()
        live = m & (k >= 0) & (amt > 0)
        if not bool(live.any()):
            return
        cap = self._stockpile_cap(row)
        for s in range(self.civ_stockpile.shape[2]):
            hit = live & (k == s)
            if not bool(hit.any()):
                continue
            self.civ_stockpile[:, row, s] = torch.where(
                hit, torch.minimum(self.civ_stockpile[:, row, s] + amt.to(self.civ_stockpile.dtype),
                                   cap.to(self.civ_stockpile.dtype)),
                self.civ_stockpile[:, row, s])

    def _gp_unit_grants(self, row: int, m: torch.Tensor, cls: torch.Tensor,
                        at: torch.Tensor, hc: torch.Tensor) -> None:
        """a free chassis at the tile, and a promotion level plus a permanent
        experience share for whoever is already standing on it."""
        uidx = self._gp_fx(cls, at, "unitIdx").long()
        made = m & (uidx >= 0)
        if bool(made.any()):
            _xp = (self._gp_fx(cls, at, "unitPromotions").long() > 0)
            for u in sorted({int(x) for x in uidx[made].tolist()}):
                hit = made & (uidx == u)
                if not bool(hit.any()) or not (0 <= u < self.NU):
                    continue
                born = self._spawn_unit(row, hit, hc, u)
                if bool((born & _xp).any()):
                    self._gp_fill_xp(row, born & _xp)
        lvl = self._gp_fx(cls, at, "promotionLevels").long()
        pct = self._gp_fx(cls, at, "xpPct").long()
        touch = m & ((lvl > 0) | (pct > 0))
        if not bool(touch.any()):
            return
        tgt = self.military_at.gather(1, hc.unsqueeze(1)).squeeze(1)
        hit = touch & (tgt >= 0)
        if not bool(hit.any()):
            return
        r = hit.nonzero(as_tuple=True)[0]
        t = tgt[r]
        need = self._xp_to_next(self.unit_level[r, t])
        self.unit_xp[r, t] = torch.where(lvl[r] > 0, need, self.unit_xp[r, t])
        self.unit_xp_pct[r, t] = self.unit_xp_pct[r, t] + pct[r]

    def _gp_fill_xp(self, row: int, m: torch.Tensor) -> None:
        """the unit just spawned starts at its next level's threshold — a
        granted promotion LEVEL, which is what the page's "with one promotion
        level" means."""
        r = m.nonzero(as_tuple=True)[0]
        slot = getattr(self, self.POOL_NEXT["major"])[r] - 1
        self.unit_xp[r, slot] = self._xp_to_next(self.unit_level[r, slot])

    def _xp_to_next(self, level: torch.Tensor) -> torch.Tensor:
        """`xpToNextLevel` — 0 once the unit is maxed."""
        mx, per = self._promo_max_level, self._promo_xp_per_level
        return torch.where(level >= mx, torch.zeros_like(level), per * level)
