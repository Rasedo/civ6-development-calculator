from __future__ import annotations

from .simbase import *  # noqa: F401,F403 — torch, constants, helpers: the shared floor
from .simbase import _MUTABLE  # noqa: F401 — private names do not ride a star import
from . import simbase  # the PATCHABLE globals (the pool caps/_ALIAS_CHECK) must be read live


class SimMinors:
    def _city_state_phase(self) -> None:
        if self.S == 0:
            return
        if self.turn % 12 == 0:
            self.citystate_pop.copy_(torch.where(self.citystate_alive, (self.citystate_pop + 1).clamp(max=10), self.citystate_pop))
        citystate_max = int(self.rules.citystate.get("maxHp", 150))
        self.citystate_hp.copy_(torch.where(self.citystate_alive & (self.citystate_hp < citystate_max), (self.citystate_hp + 10).clamp(max=citystate_max), self.citystate_hp))
        # CIV6 (City-state): a minor "develops scientifically and culturally...
        # it will apparently research certain techs" — the record is real, the
        # pace unpublished. POPULATION points a turn into each pot; the
        # cheapest available row completes (table order on a price tie), at
        # most one per pot per turn (`minorResearch` twin). Early Empire is
        # the row the border refusal reads.
        alive = self.citystate_alive
        pop = torch.where(alive, self.citystate_pop.to(torch.float64), torch.zeros_like(self.citystate_tech_prog))
        self.citystate_tech_prog += pop
        self.citystate_civic_prog += pop
        rdv = self.rules_dev
        for have, prog, cost, pre in (
            (self.citystate_techs, self.citystate_tech_prog, rdv.t_cost.to(self.device), self._prereq_t),
            (self.citystate_civics, self.citystate_civic_prog, rdv.c_cost.to(self.device), self._prereq_c),
        ):
            for s in range(self.S):
                avail = self._available_mask(have[:, s], pre)
                if not bool(avail.any()):
                    continue
                key = torch.where(avail, cost.unsqueeze(0).expand_as(avail),
                                  torch.full((1, 1), float("inf"), dtype=torch.float64, device=self.device).expand_as(avail))
                key = key + torch.arange(key.shape[1], device=self.device, dtype=torch.float64) * 1e-6
                pick = key.argmin(dim=1)
                cval = cost[pick]
                fire = alive[:, s] & avail.any(dim=1) & (prog[:, s] >= cval)
                if bool(fire.any()):
                    have[fire, s, pick[fire]] = True
                    prog[fire, s] = prog[fire, s] - cval[fire]
        self._minor_build()


    def _minor_walls_tier(self, s: int) -> torch.Tensor:
        """[B] the highest walls row the minor's city holds — `wallsTier` for
        a seat no urban-defenses tech can reach (`seatOf` answers nothing for
        a minor, so TS reads the buildings alone; this reads the same bits)."""
        return self._minor_walls_tier_at(torch.full((self.B,), s, dtype=torch.long, device=self.device))

    def _minor_walls_tier_at(self, csx: torch.Tensor) -> torch.Tensor:
        """[B] the walls tier of the minor named PER GAME — the combat sites'
        read, where each game may be striking a different city-state."""
        row = self._CITY_MINOR0 + csx.clamp(min=0, max=max(self.S - 1, 0))
        b = torch.arange(self.B, device=self.device)
        bl = self.city_bldg[b, row, 0]
        tier = torch.zeros(self.B, dtype=torch.long, device=self.device)
        for bi in self._walls_rows:
            t_w = int(self.rules_dev.b_walls[bi])
            tier = torch.maximum(tier, torch.where(bl[:, bi], torch.full_like(tier, t_w),
                                                   torch.zeros_like(tier)))
        return tier

    def _minor_district_site(self, s: int) -> torch.Tensor:
        """[B, T] `canPlaceDistrictIn`'s city half for the minor's one city —
        `_district_elig_site` with the minor's OWN ownership (its seat id is
        100+s, never its city-block row) and its own research record on the
        feature-clear clause. No `tile_city` test: a minor's territory is one
        city's by construction."""
        B, dev = self.B, self.device
        center = self.citystate_center[:, s].clamp(min=0)
        elig = (
            (self.tile_seat == 100 + s)
            & (self.district < 0)
            & (self.built_wonder < 0)
            & (self.improvement < 0)
            & (self.res_priority <= 1)
            & (self.pair_dist[center] <= 3)
        )
        need_clear = (self.tile_ftu >= 0) & ~self.feat_stripped
        if bool(need_clear.any()):
            have = self.citystate_techs[:, s].gather(1, self.tile_ftu.clamp(min=0))
            elig = elig & (~need_clear | have)
        elig[torch.arange(B, device=dev), center] = False
        return elig

    def _minor_build(self) -> None:
        """`minorBuildPhase` — CIV6 (City-state): a city-state "will build a
        district within their territory that corresponds to their type", a
        Harbor when it sits on the coast, and walls. The PACE is the
        `minorResearch` stylization: POPULATION points a turn into a
        production pot, and the ladder's first buildable item completes when
        the pot covers it, at most one a turn. The ladder order is the
        model's; each item's own gates — the minor's researched unlock, a
        legal plot, an intact perimeter under a higher wall — are the rules a
        major pays."""
        if self.S == 0 or not self.districts_on:
            return
        rd = self.rules_dev
        dcp = self.rules.district_cost
        alive_all = self.citystate_alive
        if not bool(alive_all.any()):
            return
        self.citystate_prod += torch.where(
            alive_all, self.citystate_pop.to(torch.float64), torch.zeros_like(self.citystate_prod))
        sc_map = {int(di): (int(ut), int(uc), int(plc)) for (di, ut, uc, plc, _fc) in self._scaffold}
        walls_by_tier = sorted(self._walls_rows, key=lambda bi: int(rd.b_walls[bi]))
        nT_c = max(int(rd.t_cost.shape[0]), 1)
        nC_c = max(int(rd.c_cost.shape[0]), 1)
        ones_b = torch.ones(self.B, dtype=torch.bool, device=self.device)
        for s in range(self.S):
            row = self._CITY_MINOR0 + s
            alive = alive_all[:, s]
            if not bool(alive.any()):
                continue
            halt = ~alive
            t_pct = self.citystate_techs[:, s].sum(dim=1).double() / float(nT_c)
            c_pct = self.citystate_civics[:, s].sum(dim=1).double() / float(nC_c)
            d_cost = torch.floor(dcp.get("base", 32) * (1 + dcp.get("scale", 9) * torch.maximum(t_pct, c_pct)))
            site_s = self._minor_district_site(s)
            ladder: list[tuple[str, object]] = [("b", walls_by_tier[0] if walls_by_tier else -1),
                                                ("d", self._citystate_didx[:, s]),
                                                ("d", int(self._harbor_didx))]
            ladder += [("b", bi) for bi in walls_by_tier[1:]]
            for kind, code in ladder:
                if bool(halt.all()):
                    break
                if kind == "b":
                    bi = int(code)  # type: ignore[arg-type]
                    if bi < 0:
                        continue
                    ut_b, uc_b = int(rd.b_unlock[bi]), int(rd.b_unlock_civic[bi])
                    unlock = (self.citystate_techs[:, s, ut_b] if ut_b >= 0
                              else (self.citystate_civics[:, s, uc_b] if uc_b >= 0 else ones_b))
                    # the higher wall wants the lower one standing, and
                    # CIV6: "While city defenses are damaged, you cannot
                    # build higher levels of Walls."
                    tier_now = self._minor_walls_tier(s)
                    prev_ok = tier_now >= int(rd.b_walls[bi]) - 1
                    intact = self.city_outer_hp[:, row, 0] == self._walls_tier_hp[tier_now]
                    avail = ~halt & ~self.city_bldg[:, row, 0, bi] & unlock & prev_ok & intact
                    pay = avail & (self.citystate_prod[:, s] >= float(rd.b_cost[bi]))
                    if bool(pay.any()):
                        rr = pay.nonzero(as_tuple=True)[0]
                        self.city_bldg[rr, row, 0, bi] = True
                        full = self._walls_tier_hp[int(rd.b_walls[bi])]
                        self.city_outer_hp[rr, row, 0] = full
                        self._fit_encamp_outer(rr, row, torch.zeros_like(rr),
                                               torch.full((len(rr),), int(full), dtype=torch.long, device=self.device))
                        self.citystate_prod[rr, s] -= float(rd.b_cost[bi])
                        self._bldg_version += 1
                        self._eff_version += 1
                    halt = halt | avail
                    continue
                dvt = code if torch.is_tensor(code) else torch.full((self.B,), int(code), dtype=torch.long, device=self.device)  # type: ignore[arg-type]
                for dv in sorted(set(int(x) for x in dvt[~halt].tolist())):
                    if dv < 0 or dv not in sc_map:
                        continue
                    ut_d, uc_d, plc = sc_map[dv]
                    if plc not in (0, 2, 3):
                        continue  # the minor menu holds land, coastal and Encampment placements only
                    gate = ~halt & (dvt == dv)
                    unlock = (self.citystate_techs[:, s, ut_d] if ut_d >= 0
                              else (self.citystate_civics[:, s, uc_d] if uc_d >= 0 else ones_b))
                    held = self.city_dist_tile[:, row, 0, dv] >= 0
                    if bool(self._is_specialty[dv]):
                        spec_cnt = ((self.city_dist_tile[:, row, 0] >= 0) & self._is_specialty).sum(dim=1)
                        cap_ok = spec_cnt < (torch.div(self.city_pop[:, row, 0] - 1, 3, rounding_mode="floor") + 1)
                    else:
                        cap_ok = ones_b
                    surface = self.coastal_water if plc == 2 else self.d_usable
                    splane = site_s & surface & ~self._fallout()
                    if plc == 3:
                        splane = splane & (self._adj_center_count() == 0)
                    avail = gate & ~held & unlock & cap_ok & splane.any(dim=1)
                    pay = avail & (self.citystate_prod[:, s] >= d_cost)
                    if bool(pay.any()):
                        rr = pay.nonzero(as_tuple=True)[0]
                        tt = splane.long().argmax(dim=1)[rr]
                        self.district[rr, tt] = dv
                        self.district_complete[rr, tt] = True
                        self.city_dist_tile[rr, row, 0, dv] = tt
                        if dv == self._encamp_didx:
                            self.encamp_hp[rr, tt] = self._encamp_hp_max
                            self.encamp_outer_hp[rr, tt] = self._walls_tier_hp[self._minor_walls_tier(s)][rr]
                        self.citystate_prod[rr, s] -= d_cost[rr]
                        self._eff_version += 1
                    halt = halt | avail

    def _wonder_base_ok(self, row: int, j: int) -> torch.Tensor:
        """[B, T] wonder-tile base predicate for seat row `row`'s city slot j —
        ONE body shared by every seat, the mask and the driven apply, because
        placement legality that exists twice drifts twice."""
        d_ctr = self.pair_dist[self.city_center[:, row, j].clamp(min=0)]
        return (
            (self.tile_seat == row)
            & (self.tile_city == self.city_id[:, row, j].unsqueeze(1))
            & (d_ctr <= 3)
            & (self.district < 0)
            & (self.built_wonder < 0)
            & (self.centre_slot_at < 0)
            & (self.res_priority <= 1)
        )

    def _wonder_unlock_ok(self, row: int, wi: int) -> torch.Tensor | None:
        """[B] unlock for wonder wi, or None when its unlock or adjacency
        requirement sits outside the compact tree (-3: the TS includes() never
        matches, so the wonder is unbuildable for every seat)."""
        wrow = self._wond_rows[wi]
        if int(wrow.get("ut", -1)) == -3 or int(wrow.get("uc", -1)) == -3:
            return None
        if int(wrow.get("adjD", -1)) == -3:
            return None
        ok = torch.ones(self.B, dtype=torch.bool, device=self.device)
        if int(wrow.get("ut", -1)) >= 0:
            ok = ok & self.civ_techs[:, row, int(wrow["ut"])]
        if int(wrow.get("uc", -1)) >= 0:
            ok = ok & self.civ_civics[:, row, int(wrow["uc"])]
        return ok

    def _wadj_plane(self, key: tuple, build) -> torch.Tensor:
        """[B, T] adjacency planes under `_wonder_cand`, memoised on
        `_eff_version`: each plane depends on the catalog row's adjacency
        arguments alone (plus the seat, for the capital plane), and the mask
        walk asks for the same plane once per (city, wonder row). Every
        engine write that could move one bumps `_eff_version`."""
        if self._wadj_cache is None or self._wadj_cache[0] != self._eff_version:
            self._wadj_cache = (self._eff_version, {})
        d = self._wadj_cache[1]
        v = d.get(key)
        if v is None:
            v = build()
            d[key] = v
        return v

    def _wonder_cand(self, row: int, j: int, wi: int, base_ok: torch.Tensor) -> torch.Tensor:
        """`canPlaceWonder`'s live half. The terrain half rides the static
        `wok` bitmask the exporter baked out of `wonderTerrainOk`, so nothing
        here re-derives ground."""
        wrow = self._wond_rows[wi]
        cand_w = base_ok & ((self.wok >> wi) & 1).bool()
        adjD = int(wrow.get("adjD", -1))
        adjDB = int(wrow.get("adjDB", -1))
        if adjD == -2:
            cand_w = cand_w & self._wadj_plane(("ctr",), lambda: self._adj_center_count() > 0)
        elif adjD >= 0:
            near = (self._wadj_plane(("dw", adjD, adjDB), lambda: self._adj_district_with(adjD, adjDB))
                    if adjDB >= 0
                    else self._wadj_plane(("dt", adjD), lambda: self._adj_dtype_complete(adjD)))
            cand_w = cand_w & near
        if int(wrow.get("adjR", -1)) >= 0:
            ri = int(wrow["adjR"])
            cand_w = cand_w & self._wadj_plane(("res", ri), lambda: self._adj_res_live(ri))
        if int(wrow.get("adjI", -1)) >= 0:
            ii = int(wrow["adjI"])
            cand_w = cand_w & self._wadj_plane(("imp", ii), lambda: self._adj_improvement(ii))
        if int(wrow.get("adjCap", 0)):
            cand_w = cand_w & self._wadj_plane(("cap", row), lambda: self._adj_capital(row))
        if int(wrow.get("needRel", 0)):
            cand_w = cand_w & self.civ_religion_done[:, row].unsqueeze(1)
        return cand_w

    def _adj_district_with(self, di: int, bi: int) -> torch.Tensor:
        """[B, T] — a completed district of type `di` next door whose CITY
        holds building `bi` (the Great Library's Library, Big Ben's Bank).
        `cityAtTile`'s twin: the building lives on the city, not the tile."""
        nb = self.neigh
        nbc = nb.clamp(min=0)
        hit = ((self.district[:, nbc] == di) & self.district_complete[:, nbc]
               & (nb >= 0).unsqueeze(0))
        if not bool(hit.any()):
            return torch.zeros(self.B, self.T, dtype=torch.bool, device=self.device)
        has = torch.zeros(self.B, self.T, dtype=torch.bool, device=self.device)
        for r in range(self.n_majors):
            sl = self.city_slot_at(r)  # [B, T] owning city SLOT, -1 = not this row's
            bl = self.city_bldg[:, r, :, bi]
            has |= (sl >= 0) & bl.gather(1, sl.clamp(min=0))
        return (hit & has[:, nbc]).any(dim=2)

    def _adj_improvement(self, ii: int) -> torch.Tensor:
        """[B, T] — a neighbour carries improvement `ii` (Temple of Artemis'
        Camp)."""
        nb = self.neigh
        nbc = nb.clamp(min=0)
        return ((self.improvement[:, nbc] == ii) & (nb >= 0).unsqueeze(0)).any(dim=2)

    def _adj_capital(self, row: int) -> torch.Tensor:
        """[B, T] — a neighbour IS this row's capital centre (the Apadana's
        "adjacent to a civilization's Capital")."""
        nb = self.neigh
        nbc = nb.clamp(min=0)
        cap = torch.zeros(self.B, self.T, dtype=torch.bool, device=self.device)
        ctr = self.city_center[:, row]                    # [B, RC]
        live = self.city_alive[:, row] & self.city_is_cap[:, row] & (ctr >= 0)
        for c in range(self.RC):
            k = live[:, c]
            if bool(k.any()):
                cap[k, ctr[k, c]] = True
        return (cap[:, nbc] & (nb >= 0).unsqueeze(0)).any(dim=2)

    def _queue_wonder_at(self, row: int, j: int, wi: int, has_w: torch.Tensor, cand_w: torch.Tensor) -> None:
        wrow = self._wond_rows[wi]
        keyw = torch.where(cand_w, self._arangeT_f, self._inf_f)
        bw = keyw.argmin(dim=1)
        rows_w = has_w.nonzero(as_tuple=True)[0]
        bwt = bw[rows_w]
        self.built_wonder[rows_w, bwt] = wi
        self.built_wonder_complete[rows_w, bwt] = False
        self.improvement[rows_w, bwt] = -1
        nofp = self.feat_id[rows_w, bwt] != self._fp_fid
        if bool(nofp.any()):
            self._strip_feature_at(rows_w[nofp], bwt[nofp])
        fresh_rs = (self.res_priority[rows_w, bwt] == 1) & ~self.res_stripped[rows_w, bwt]
        self.res_stripped[rows_w, bwt] = self.res_stripped[rows_w, bwt] | (self.res_priority[rows_w, bwt] == 1)
        self._withdraw_sea_adj(rows_w[fresh_rs], bwt[fresh_rs])
        self.city_wonder[rows_w, row, j, wi] = bwt
        code_w = self.WONDER_BASE + wi
        # the wonder's PLOT lives in the `city_wonder` registry, which is keyed
        # by wonder rather than by queue slot, so the entry carries no qtile.
        _b1 = torch.ones(self.B, dtype=torch.long, device=self.device)
        self._q_push(row, j, has_w, _b1 * code_w,
                     _b1.to(self.city_cost.dtype) * float(wrow["cost"]))
        self._eff_version += 1

    def _seat_proj_cost(self, row: int) -> torch.Tensor:
        dcp = self.rules.district_cost
        t_pct_r = self.civ_techs[:, row].to(torch.float64).mean(dim=1)
        c_pct_r = self.civ_civics[:, row].to(torch.float64).mean(dim=1)
        d_cost = torch.floor(dcp.get("base", 32) * (1 + dcp.get("scale", 9) * torch.maximum(t_pct_r, c_pct_r)))
        p_floor = float(round(15 * self.rules.game_speed))
        return torch.maximum(torch.full_like(d_cost, p_floor), js_round(d_cost * 0.5))
