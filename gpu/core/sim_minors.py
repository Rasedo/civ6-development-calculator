"""The city-state phase and the minor-seat machinery.

One mixin of BatchSim (assembled in engine.py); state and helpers live on
self / gpu/core/simbase.py.
"""
from __future__ import annotations

from .simbase import *  # noqa: F401,F403 — torch, constants, helpers: the shared floor
from .simbase import _MUTABLE  # noqa: F401 — private names do not ride a star import
from . import simbase  # the PATCHABLE globals (the pool caps/_ALIAS_CHECK) must be read live


class SimMinors:
    def _city_state_phase(self) -> None:
        """The city-states' OWN turn — the cityStatePhase twin: the seat-0
        war clock, cosmetic growth every 12 turns, siege recovery. Every
        seat's CS DIPLOMACY (meet/influence/quests) runs in the seatPhase
        loop instead — ONE body per fact for every row:
        _seat_influence_phase + _seat_quest_phase (row 0 called from
        _seat0_row, civ rows via _seat_cs_phase)."""
        if self.S == 0:
            return
        # The seat-0 <-> city-state war clock ticks FIRST, exactly where
        # cityStatePhase does.
        self.citystate_war_turns.add_(self.citystate_atwar.long())
        if self.turn % 12 == 0:
            self.citystate_pop.copy_(torch.where(self.citystate_alive, (self.citystate_pop + 1).clamp(max=10), self.citystate_pop))
        # siege recovery — +10/turn toward maxHp (cityStatePhase tail).
        citystate_max = int(self.rules.citystate.get("maxHp", 150))
        self.citystate_hp.copy_(torch.where(self.citystate_alive & (self.citystate_hp < citystate_max), (self.citystate_hp + 10).clamp(max=citystate_max), self.citystate_hp))

    # civ-seat unit SPAWNS ride _spawn_unit(row, ...) — one body, every major row.

    def _wonder_base_ok(self, row: int, j: int) -> torch.Tensor:
        """[B, T] wonder-tile base predicate for seat row `row`'s city slot j —
        ONE body shared by every seat, the mask and the driven apply, because
        placement legality that exists twice drifts twice."""
        d_ctr = self.pair_dist[self.city_center[:, row, j].clamp(min=0)]  # [B, T]
        return (
            (self.tile_seat == row)
            & (self.tile_city == self.city_id[:, row, j].unsqueeze(1))  # THIS city's registry
            & (d_ctr <= 3)
            & (self.district < 0)
            & (self.built_wonder < 0)
            & (self.centre_slot_at < 0)  # no seat's centre, sibling or foreign
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
        """[B, T] candidate tiles for wonder wi at (row, j) — the wok
        bitplane plus the adjacency arms, exactly the scripted pick's terms."""
        wrow = self._wond_rows[wi]
        cand_w = base_ok & ((self.wok >> wi) & 1).bool()
        adjD = int(wrow.get("adjD", -1))
        if adjD == -2:
            cand_w = cand_w & (self._adj_center_count() > 0)
        elif adjD >= 0:
            cand_w = cand_w & self._adj_dtype_complete(adjD)
        if int(wrow.get("adjR", -1)) >= 0:
            cand_w = cand_w & self._adj_res_live(int(wrow["adjR"]))
        return cand_w

    def _queue_wonder_at(self, row: int, j: int, wi: int, has_w: torch.Tensor, cand_w: torch.Tensor) -> None:
        """queueWonder's writes for rows `has_w` (each has a candidate in
        cand_w): pave the LOWEST-index tile, improvement dies, feature dies
        except floodplains, a bonus resource is stripped, registry + queue
        code + locked cost."""
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
        self._eff_version += 1  # a pave: features/improvements changed under the caches

    def _seat_proj_cost(self, row: int) -> torch.Tensor:
        """The project cost — max(round(15·speed), round(dCost·0.5)) on THIS
        seat's research; the districtCostIn twin the phase hoists."""
        dcp = self.rules.district_cost
        t_pct_r = self.civ_techs[:, row].to(torch.float64).mean(dim=1)
        c_pct_r = self.civ_civics[:, row].to(torch.float64).mean(dim=1)
        d_cost = torch.floor(dcp.get("base", 32) * (1 + dcp.get("scale", 9) * torch.maximum(t_pct_r, c_pct_r)))
        p_floor = float(round(15 * self.rules.game_speed))
        return torch.maximum(torch.full_like(d_cost, p_floor), js_round(d_cost * 0.5))
