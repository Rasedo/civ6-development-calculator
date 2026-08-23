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

    def _wonder_cand(self, row: int, j: int, wi: int, base_ok: torch.Tensor) -> torch.Tensor:
        """`canPlaceWonder`'s live half. The terrain half rides the static
        `wok` bitmask the exporter baked out of `wonderTerrainOk`, so nothing
        here re-derives ground."""
        wrow = self._wond_rows[wi]
        cand_w = base_ok & ((self.wok >> wi) & 1).bool()
        adjD = int(wrow.get("adjD", -1))
        adjDB = int(wrow.get("adjDB", -1))
        if adjD == -2:
            cand_w = cand_w & (self._adj_center_count() > 0)
        elif adjD >= 0:
            near = (self._adj_district_with(adjD, adjDB) if adjDB >= 0
                    else self._adj_dtype_complete(adjD))
            cand_w = cand_w & near
        if int(wrow.get("adjR", -1)) >= 0:
            cand_w = cand_w & self._adj_res_live(int(wrow["adjR"]))
        if int(wrow.get("adjI", -1)) >= 0:
            cand_w = cand_w & self._adj_improvement(int(wrow["adjI"]))
        if int(wrow.get("adjCap", 0)):
            cand_w = cand_w & self._adj_capital(row)
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
            for c in range(self.RC):
                mine = (sl == c) & self.city_bldg[:, r, c, bi].unsqueeze(1)
                if bool(mine.any()):
                    has |= mine
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
        self.city_current[:, row, j] = torch.where(has_w, torch.full_like(self.city_current[:, row, j], code_w), self.city_current[:, row, j])
        self.city_cost[:, row, j] = torch.where(has_w, torch.full_like(self.city_cost[:, row, j], float(wrow["cost"])), self.city_cost[:, row, j])
        self.city_progress[:, row, j] = torch.where(has_w, torch.zeros_like(self.city_progress[:, row, j]), self.city_progress[:, row, j])
        self._eff_version += 1

    def _seat_proj_cost(self, row: int) -> torch.Tensor:
        dcp = self.rules.district_cost
        t_pct_r = self.civ_techs[:, row].to(torch.float64).mean(dim=1)
        c_pct_r = self.civ_civics[:, row].to(torch.float64).mean(dim=1)
        d_cost = torch.floor(dcp.get("base", 32) * (1 + dcp.get("scale", 9) * torch.maximum(t_pct_r, c_pct_r)))
        p_floor = float(round(15 * self.rules.game_speed))
        return torch.maximum(torch.full_like(d_cost, p_floor), js_round(d_cost * 0.5))
