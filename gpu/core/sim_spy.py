"""THE ESPIONAGE SYSTEM on the GPU — the `cpu/core/espionage.ts` twin.

CIV6 (Espionage): "Spies aren't moved like regular units; they jump from city
to city using air, sea, road, or foot travel, each with their own travel time."
So a Spy holds no plot and walks no path: its whole state is four pool planes
(`unit_spy_mission`, `unit_spy_turns`, `unit_spy_target`, `unit_spy_level`)
plus the two city clocks a finished mission leaves behind.
"""

from __future__ import annotations

import torch


class SimSpy:
    # ---- what a seat may field --------------------------------------------
    def _spy_capacity(self, row: int) -> torch.Tensor:
        """[B] — CIV6 (Spy): "A player's Spy capacity increases by 1 for each
        of these", never past the cap."""
        n = torch.zeros(self.B, dtype=torch.long, device=self.device)
        if self._spy_idx < 0:
            return n
        for c in self._spy_cap_civics:
            n = n + self.civ_civics[:, row, c].long()
        for t in self._spy_cap_techs:
            n = n + self.civ_techs[:, row, t].long()
        # CIV6 (Intelligence Agency): "+1 Spy and Spy capacity."
        if bool((self._b_spy_capacity > 0).any()):
            n = n + self._seat_building_sum(row, self._b_spy_capacity)
        return n.clamp(max=self._spy_cap_max)

    def _spies_of(self, row: int) -> torch.Tensor:
        """[B, U] — this seat's live spies, in merged pool slots."""
        return (self.unit_alive & (self.unit_seat == row)
                & (self.unit_type == self._spy_idx))

    def _can_train_spy(self, row: int) -> torch.Tensor:
        """[B] — CIV6: "you can never have more Spies than your current
        empire's development allows"."""
        if self._spy_idx < 0:
            return torch.zeros(self.B, dtype=torch.bool, device=self.device)
        return self._spies_of(row).sum(dim=1) < self._spy_capacity(row)

    # ---- the narrowing every spy body starts from -------------------------
    def _spy_cols(self, utype: torch.Tensor) -> torch.Tensor:
        """the N-columns holding a spy in ANY batch row — a [B, N, T] build
        over the whole rank width would be gigabytes."""
        if self._spy_idx < 0:
            return torch.zeros(0, dtype=torch.long, device=self.device)
        return (utype == self._spy_idx).any(dim=0).nonzero(as_tuple=True)[0]

    def _spy_idle_at(self, sc: torch.Tensor) -> torch.Tensor:
        return self.unit_spy_mission.gather(1, sc) == self._spy_idle

    # ---- where a spy may go ------------------------------------------------
    def _spy_destinations(self, row: int, sc: torch.Tensor, tc: torch.Tensor,
                          utype: torch.Tensor) -> torch.Tensor:
        """[B, N, W] CENTRE TILE indices this spy may jump to, in tile-index
        order and cut to the head's width — `spyDestinations`.

        CIV6: "You may send a Spy to any city you have revealed (provided you
        don't have an Alliance with that civilization)". Under the vanilla
        ruleset a spy cannot act in a city-state, so only MAJOR centres are
        offered — which is exactly what `centre_slot_at` registers."""
        B, N = tc.shape
        W, dev = self._spy_travel_cols, self.device
        out = torch.full((B, N, W), -1, dtype=torch.long, device=dev)
        cols = self._spy_cols(utype)
        if W == 0 or cols.numel() == 0:
            return out
        holder = torch.where(self.centre_slot_at >= 0, self.tile_seat,
                             torch.full_like(self.tile_seat, -1))
        allied = self.seat_ally_turns[:, row, : self.n_majors].gather(
            1, holder.clamp(min=0)) > 0
        ok = (holder >= 0) & ~allied
        if self.fog_of_war:
            ok = ok & self.seat_explored[:, row]
        cand = ok.unsqueeze(1) & (
            torch.arange(self.T, device=dev).view(1, 1, self.T)
            != tc[:, cols].unsqueeze(2))
        cand = cand & (self._spy_idle_at(sc[:, cols])
                       & (utype[:, cols] == self._spy_idx)).unsqueeze(2)
        out[:, cols] = self._air_first_k(cand, W)
        return out

    def _spy_travel_mask(self, row: int, sc: torch.Tensor, tc: torch.Tensor,
                         utype: torch.Tensor) -> torch.Tensor:
        return self._spy_destinations(row, sc, tc, utype) >= 0

    def _spy_travel_turns(self, frm: torch.Tensor, to: torch.Tensor) -> torch.Tensor:
        """MODEL: the source names four travel modes with "their own travel
        time" and publishes none of them; distance is what this model reads."""
        d = self.pair_dist[frm.clamp(min=0), to.clamp(min=0)].long()
        return (self._spy_travel_min
                + torch.div(d, self._spy_travel_per, rounding_mode="floor")
                ).clamp(max=self._spy_travel_max)

    # ---- what a spy may start ---------------------------------------------
    def _spy_here(self, tc: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """(holder row, city column) for the major centre each spy stands on,
        -1/-1 where it stands on none — `spyCity`."""
        flat = tc.clamp(min=0).reshape(self.B, -1)
        col = self.centre_slot_at.gather(1, flat).reshape(tc.shape)
        seat = self.tile_seat.gather(1, flat).reshape(tc.shape)
        live = col >= 0
        return (torch.where(live, seat, torch.full_like(seat, -1)),
                torch.where(live, col, torch.full_like(col, -1)))

    def _city_cell(self, plane: torch.Tensor, hrow: torch.Tensor,
                   hcol: torch.Tensor) -> torch.Tensor:
        """`plane[b, hrow, hcol]` for a [B, R, RC] city plane, zero off-city."""
        flat = plane.reshape(self.B, -1)
        idx = (hrow.clamp(min=0) * self.RC + hcol.clamp(min=0)).reshape(self.B, -1)
        got = flat.gather(1, idx).reshape(hrow.shape)
        return torch.where(hrow >= 0, got, torch.zeros_like(got))

    def _city_district_tile(self, hrow: torch.Tensor, hcol: torch.Tensor,
                            di: int) -> torch.Tensor:
        """the district tile of an ARBITRARY (row, column) city, -1 for none."""
        got = self._city_cell(self.city_dist_tile[:, :, :, di], hrow, hcol)
        return torch.where(hrow >= 0, got, torch.full_like(got, -1))

    def _district_live(self, dt: torch.Tensor) -> torch.Tensor:
        c = dt.clamp(min=0).reshape(self.B, -1)
        return ((dt >= 0)
                & self.district_complete.gather(1, c).reshape(dt.shape)
                & ~self.district_pillaged.gather(1, c).reshape(dt.shape))

    def _spy_mission_mask(self, row: int, sc: torch.Tensor, tc: torch.Tensor,
                          utype: torch.Tensor) -> torch.Tensor:
        """[B, N, M] — `spyMissionMask`: what this spy could start where it
        stands, one column per mission in catalog order."""
        B, N = tc.shape
        M, dev = self._n_spy_missions, self.device
        out = torch.zeros(B, N, M, dtype=torch.bool, device=dev)
        cols = self._spy_cols(utype)
        if M == 0 or cols.numel() == 0:
            return out
        base = self._spy_idle_at(sc[:, cols]) & (utype[:, cols] == self._spy_idx)
        if not bool(base.any()):
            return out
        hrow, hcol = self._spy_here(tc[:, cols])
        base = base & (hrow >= 0)
        mine = hrow == row
        for m, mdef in enumerate(self._spy_missions):
            ok = base & (mine if mdef["athome"] else ~mine)
            di = mdef["district"]
            if di >= 0:
                ok = ok & self._district_live(self._city_district_tile(hrow, hcol, di))
            ok = ok & self._spy_mission_extra(row, m, hrow, hcol)
            out[:, cols, m] = ok
        return out

    def _spy_mission_extra(self, row: int, m: int, hrow: torch.Tensor,
                           hcol: torch.Tensor) -> torch.Tensor:
        """the per-mission gates beyond "the district is there"."""
        if m == self._spy_m_heist:
            return self._heist_kind(hrow, hcol) >= 0
        if m == self._spy_m_steal:
            return self._steal_first(row).gather(
                1, hrow.clamp(min=0).reshape(self.B, -1)).reshape(hrow.shape) >= 0
        if m == self._spy_m_governor:
            return self._city_has_governor(hrow, hcol)
        return torch.ones_like(hrow, dtype=torch.bool)

    def _gw_plane(self, kind: int) -> torch.Tensor:
        return (self.city_gw_writing, self.city_gw_art, self.city_gw_music)[kind]

    def _heist_kind(self, hrow: torch.Tensor, hcol: torch.Tensor) -> torch.Tensor:
        """CIV6 (Great Work Heist): "Great Works of Writing will be displayed
        first, Great Works of Art and Artifacts second, and Great Works of
        Music last" — the first non-empty of the three, -1 for none."""
        out = torch.full_like(hrow, -1)
        for kind in (2, 1, 0):
            have = self._city_cell(self._gw_plane(kind), hrow, hcol) > 0
            out = torch.where(have, torch.full_like(out, kind), out)
        return out

    def _steal_first(self, row: int) -> torch.Tensor:
        """[B, n_majors] — the FIRST tech each major holds that `row` has
        neither researched nor boosted, -1 for none (`stealableTech`)."""
        mine = (self.civ_techs[:, row] | self.civ_tech_boosted[:, row]).unsqueeze(1)
        gap = self.civ_techs[:, : self.n_majors] & ~mine
        first = gap.long().argmax(dim=2)
        out = torch.where(gap.any(dim=2), first, torch.full_like(first, -1))
        out[:, row] = -1
        return out

    def _city_has_governor(self, hrow: torch.Tensor, hcol: torch.Tensor) -> torch.Tensor:
        """CIV6 (Neutralize Governor): "can only be performed in a city with a
        Governor" — the holder's roster answers directly now."""
        out = torch.zeros_like(hrow, dtype=torch.bool)
        idx = hcol.clamp(min=0).reshape(self.B, -1)
        for g in range(self.n_majors):
            cell = self._seat_governor_seats(g).gather(1, idx).reshape(hrow.shape)
            out = out | ((hrow == g) & cell)
        return out

    # ---- the verbs ---------------------------------------------------------
    def _begin_travel(self, hit: torch.Tensor, sc: torch.Tensor,
                      dest: torch.Tensor) -> None:
        g = (hit & (dest >= 0)).nonzero(as_tuple=True)[0]
        if g.numel() == 0:
            return
        s = sc[g]
        self.unit_spy_turns[g, s] = self._spy_travel_turns(self.unit_tile[g, s], dest[g])
        self.unit_spy_mission[g, s] = self._spy_travelling
        self.unit_spy_target[g, s] = dest[g]
        self.unit_mp[g, s] = 0

    def _spy_mission_turns(self, row: int, m: int) -> torch.Tensor:
        """CIV6 (Bodyguard of Lies, Golden face): "Time to complete all
        offensive spy operations reduced by 25%"."""
        base = torch.full((self.B,), self._spy_mission_turns_base,
                          dtype=torch.long, device=self.device)
        if not self._spy_missions[m]["offensive"]:
            return base
        cut = torch.div(base * self._bodyguard_num, self._bodyguard_den,
                        rounding_mode="floor").clamp(min=1)
        return torch.where(self._golden_ded(row, self._ded_bodyguard), cut, base)

    def _begin_mission(self, row: int, hit: torch.Tensor, sc: torch.Tensor,
                       m: int) -> None:
        g = hit.nonzero(as_tuple=True)[0]
        if g.numel() == 0:
            return
        s = sc[g]
        self.unit_spy_mission[g, s] = m
        self.unit_spy_turns[g, s] = self._spy_mission_turns(row, m)[g]
        self.unit_mp[g, s] = 0

    # ---- the turn ----------------------------------------------------------
    def _tick_spies(self, row: int) -> None:
        """One turn of every spy this seat owns — arrivals first, then the
        missions that ran out their clock (`tickSpies`)."""
        if self._spy_idx < 0:
            return
        busy = self._spies_of(row) & (self.unit_spy_mission != self._spy_idle)
        if not bool(busy.any()):
            return
        self.unit_spy_turns[busy] = (self.unit_spy_turns[busy] - 1).clamp(min=0)
        done = busy & (self.unit_spy_turns <= 0)
        if not bool(done.any()):
            return
        landed = done & (self.unit_spy_mission == self._spy_travelling)
        if bool(landed.any()):
            g, v = landed.nonzero(as_tuple=True)
            self.unit_tile[g, v] = self.unit_spy_target[g, v]
            self.unit_spy_target[g, v] = -1
            self.unit_spy_mission[g, v] = self._spy_idle
        ran = done & (self.unit_spy_mission >= 0)
        for g, v in zip(*(x.tolist() for x in ran.nonzero(as_tuple=True))):
            self._resolve_mission(row, g, v)

    def _tick_spy_effects(self, row: int) -> None:
        """the per-turn decay of the two clocks a mission leaves behind."""
        for plane in (self.city_spy_sources[:, row],):
            plane.copy_((plane - (plane > 0).long()).clamp(min=0))

    def _spy_roll(self, b: int, pct: int) -> bool:
        one = torch.zeros(self.B, dtype=torch.bool, device=self.device)
        one[b] = True
        return int(self._next_random(one)[b] * 100) < pct

    def _resolve_mission(self, row: int, b: int, v: int) -> None:
        m = int(self.unit_spy_mission[b, v])
        mdef = self._spy_missions[m]
        self.unit_spy_mission[b, v] = self._spy_idle
        tile = self.unit_tile[b, v].reshape(1, 1)
        hrow, hcol = self._spy_here(tile)
        hr, hc = int(hrow[0, 0]), int(hcol[0, 0])
        if hr < 0:
            return
        if m == self._spy_m_counterspy:
            # counter-espionage stands its post rather than ending: the source
            # has it running until the spy is sent elsewhere.
            self.unit_spy_mission[b, v] = m
            self.unit_spy_turns[b, v] = int(self._spy_mission_turns(row, m)[b])
            return
        lvl = int(self.unit_spy_level[b, v]) + (
            self._spy_sources_levels
            if int(self.city_spy_sources[b, hr, hc, row]) > 0 else 0)
        lvl = max(0, lvl - self._counter_levels(b, hr, hc))
        ok = bool(mdef["certain"]) or self._spy_roll(
            b, self._spy_success_base + self._spy_success_per_level * lvl)
        if ok:
            self._apply_mission(row, b, v, m, hr, hc, lvl)
            if mdef["offensive"]:
                # CIV6: Spies "gain levels by successfully completing offensive
                # missions", and Bodyguard of Lies pays "+1 Era Score for each
                # successful offensive operation."
                self.unit_spy_level[b, v] = min(
                    self._spy_max_level, int(self.unit_spy_level[b, v]) + 1)
                one = torch.zeros(self.B, dtype=torch.bool, device=self.device)
                one[b] = True
                self._dedication_event(row, self._ded_bodyguard, one)
        if mdef["certain"]:
            return
        # CIV6: "when enemy Spies are performing missions in those districts,
        # there is a much higher chance than normal that they will be caught."
        guard = bool((self._spies_of(hr)[b]
                      & (self.unit_tile[b] == int(tile[0, 0]))
                      & (self.unit_spy_mission[b] == self._spy_m_counterspy)).any())
        caught = self._spy_capture_pct + (self._spy_counterspy_pct if guard else 0)
        if not ok and self._spy_roll(b, caught):
            self.unit_alive[b, v] = False

    def _apply_mission(self, row: int, b: int, v: int, m: int, hr: int, hc: int,
                       lvl: int) -> None:
        if m == self._spy_m_sources:
            self.city_spy_sources[b, hr, hc, row] = self._spy_sources_turns
        elif m == self._spy_m_siphon:
            # CIV6: "The Spy will steal the Gold income this district has
            # accumulated for the duration of the mission."
            live = self._district_live(
                self.city_dist_tile[b, hr, hc, self._commhub_idx].reshape(1, 1))
            take = float(int(live[0, 0]) * self._spy_mission_turns_base)
            self.civ_treasury[b, hr] = max(0.0, float(self.civ_treasury[b, hr]) - take)
            self.civ_treasury[b, row] += take
        elif m == self._spy_m_heist:
            kind = int(self._heist_kind(
                torch.tensor([[hr]], device=self.device),
                torch.tensor([[hc]], device=self.device))[0, 0])
            if kind >= 0:
                plane = self._gw_plane(kind)
                plane[b, hr, hc] -= 1
                home = int(self.city_alive[b, row].long().argmax())
                if bool(self.city_alive[b, row, home]):
                    plane[b, row, home] += 1
                self._eff_version += 1
        elif m == self._spy_m_sabotage:
            self._pillage_city_district(b, hr, hc, self._iz_idx)
        elif m == self._spy_m_rocketry:
            self._pillage_city_district(b, hr, hc, self._spaceport_didx)
        elif m == self._spy_m_partisans:
            # CIV6: "2-4 rebel anti-cavalry units ... their level will match the
            # current World Era", and the mission "pillages the Neighborhood
            # district to prevent Spies from completing it in rapid succession."
            one = torch.zeros(self.B, dtype=torch.bool, device=self.device)
            one[b] = True
            span = self._spy_partisans_max - self._spy_partisans_min + 1
            n = self._spy_partisans_min + int(self._next_random(one)[b] * span)
            chassis = int(self._partisan_chassis()[b])
            if chassis >= 0:
                ctr = self.city_center[b, hr, hc].expand(self.B)
                for _ in range(n):
                    self._spawn_barb(one, ctr, chassis, ladder=False)
            self._pillage_city_district(b, hr, hc, self._nbhd_didx)
        elif m == self._spy_m_steal:
            t = int(self._steal_first(row)[b, hr])
            if t >= 0:
                self.civ_tech_boosted[b, row, t] = True
        elif m == self._spy_m_unrest:
            drop = self._spy_unrest + self._spy_unrest_per_level * lvl
            self.city_loyalty[b, hr, hc] = max(
                0.0, float(self.city_loyalty[b, hr, hc]) - drop)
        elif m == self._spy_m_governor:
            # the clock follows the PERSON: they leave the city and cannot be
            # assigned again until it runs out.
            gi = int(self._governor_at(int(hr))[b, hc].item())
            if gi >= 0:
                self.neutralize_governor(b, int(hr), gi,
                                         self._spy_gov_turns + self._spy_gov_per_level * lvl)
        elif m == self._spy_m_breach:
            # CIV6 (Breach Dam): "damage (i.e., pillage) the district, causing a
            # Flood and leaving the city vulnerable to damage from Floods until
            # the Dam is repaired" — the pillage lands FIRST, so the flood it
            # starts finds the shield already down.
            dt = -1
            for _di in range(self.city_dist_tile.shape[3]):
                if not bool(self._d_flood_shield[_di]):
                    continue
                _t = int(self.city_dist_tile[b, hr, hc, _di])
                if _t >= 0 and bool(self.district_complete[b, _t]):
                    dt = _t
                    break
            if dt < 0:
                return
            self.district_pillaged[b, dt] = True
            self._eff_version += 1
            one = torch.zeros(self.B, dtype=torch.bool, device=self.device)
            one[b] = True
            self._flood_river(one, torch.full((self.B,), dt, dtype=torch.long, device=self.device))

    def _counter_levels(self, b: int, hr: int, hc: int) -> int:
        """CIV6 (Diplomatic Quarter): "Enemy Spies operate at 2 levels below
        normal when targeting this district or adjacent districts", and
        (Consulate) "Spies operate at one level lower when targeting this
        city" — both read as whole-city terms here, which is what a mission
        that names a district but not a tile can address. `cityCounterLevels`'
        twin."""
        reg = self.city_dist_tile[b, hr, hc]              # [nD]
        # per INSTANCE off the tile plane — the registry keeps one per type
        live = self._dist_counts(hr)[b, hc]
        n = int((live * self._d_spy_pen).sum())
        if bool((self._b_spy_pen > 0).any()):
            stand = self.city_bldg[b, hr, hc] & ~self._bldg_dark(reg.reshape(1, 1, -1))[0, 0]
            n += int((stand.long() * self._b_spy_pen).sum())
        # CIV6 (Local Informants): "Enemy Spies operate at 3 levels below
        # normal in this city."
        if self.n_governors and hr < self.n_majors:
            n += int(self._governor_sum(int(hr), "spyLevelPenalty")[b, hc])
        return n

    def _partisan_chassis(self) -> torch.Tensor:
        """[B] — the ANTI-CAVALRY chassis of the world era, the rebels' own
        class: the latest roster row whose era the world has reached."""
        era = self._world_era()
        dev, B, NU = self.device, self.B, self.NU
        idx = torch.arange(NU, device=dev).unsqueeze(0)
        okay = self._type_anticav.unsqueeze(0) & (self._type_era.unsqueeze(0) <= era.unsqueeze(1))
        key = torch.where(okay, self._type_era.unsqueeze(0) * NU + idx,
                          torch.full((B, NU), -1, dtype=torch.long, device=dev))
        return torch.where(okay.any(dim=1), key.argmax(dim=1),
                           torch.full((B,), -1, dtype=torch.long, device=dev))

    def _pillage_city_district(self, b: int, hr: int, hc: int, di: int) -> None:
        if di < 0:
            return
        dt = int(self.city_dist_tile[b, hr, hc, di])
        if dt >= 0 and bool(self.district_complete[b, dt]):
            self.district_pillaged[b, dt] = True
            self._eff_version += 1
