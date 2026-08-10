"""The city-state phase and the minor-seat machinery.

One mixin of BatchSim (assembled in engine.py); state and helpers live on
self / gpu/core/simbase.py.
"""
from __future__ import annotations

from .simbase import *  # noqa: F401,F403 — torch, constants, helpers: the shared floor
from .simbase import _MUTABLE  # noqa: F401 — private names do not ride a star import
from . import simbase  # the PATCHABLE globals (POOL_MAX/SEAT0_POOL_MAX/_ALIAS_CHECK) must be read live


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

    # --- civ-seat units -----------------------------------------------------------

    def _spawn_seat_unit(self, mask: torch.Tensor, at_tile: torch.Tensor, type_idx: torch.Tensor, civ: int, init_xp: torch.Tensor | None = None) -> torch.Tensor:
        """Spawn one military unit for civ seat `civ` at `at_tile`.

        Civ units share the append-only v_ pool (per-civ order = state.units
        order filtered by civ, which the per-civ loops walk). Returns the
        LANDED mask — a caller that paid for the unit refunds where no spawn
        spot was free. init_xp ([B] long) seeds starting XP from the spawn
        city's Encampment training buildings."""
        if not bool(mask.any()):
            return torch.zeros_like(mask)
        # Naval units probe over water (OCEAN gated on this civ's
        # CARTOGRAPHY). type_idx may be scalar or [B].
        ti_n = (type_idx if type_idx.dim() > 0 else type_idx.expand(self.B)).clamp(min=0, max=self.NU - 1)
        naval_m = self.unit_naval[ti_n] & mask
        cart_r = self.civ_only_techs[:, civ, self._cartography_tech] if self._cartography_tech >= 0 else None
        found, spot = self._first_free_spot(at_tile, "civ", civ=civ, naval_mask=naval_m, cart=cart_r)
        can = mask & found
        if not bool(can.any()):
            return can
        rows = can.nonzero(as_tuple=True)[0]
        slot = self.civ_unit_next[rows]
        assert int(slot.max()) < simbase.POOL_MAX, "civ slot pool exhausted — raise simbase.POOL_MAX"
        self.civ_unit_alive[rows, slot] = True
        self.civ_unit_civ[rows, slot] = civ
        self.civ_unit_seat[rows, slot] = civ + 1  # seat id of civ index `civ`
        self.civ_unit_type[rows, slot] = type_idx[rows] if type_idx.dim() > 0 else type_idx
        self.civ_unit_tile[rows, slot] = spot[rows]
        self._reveal_around(rows, civ + 1, spot[rows], 2)  # spawnUnit's revealAround (SIGHT_RANGE)
        self.civ_unit_hp[rows, slot] = self.rules.combat.get("unitHp", 100)
        self.civ_unit_fortify[rows, slot] = 0  # a fresh (possibly reclaimed) slot starts undug
        # a fresh slot starts at 0 xp unless the training city grants Encampment XP.
        self.civ_unit_xp[rows, slot] = 0 if init_xp is None else init_xp[rows]
        self.civ_unit_aura_mp[rows, slot] = 0  # no frozen grant until the first refresh (TS movesFull undefined)
        # `emb` MUST be cleared BEFORE _full_mp, which reads it: a reclaimed
        # slot carries the dead occupant's flag, and _full_mp overrides an
        # embarked unit's pool to the flat EMBARK_MOVES.
        self.civ_unit_emb[rows, slot] = False
        # `movesLeft: def.moves` + this seat's golden dedication.
        _m = self._full_mp("civ")[rows, slot]
        self.civ_unit_mp[rows, slot] = _m
        self.civ_unit_mp_full[rows, slot] = _m
        self.civ_unit_charges[rows, slot] = 0  # military; builder spawns set their own charges
        self.military_at[(rows, spot[rows])] = slot + simbase.SEAT0_POOL_MAX  # merged-pool index of the v_ slot
        self.civ_unit_next[rows] += 1
        # the seat's strongest melee ever (city defense); a roster type counts
        # as melee unless it carries ranged strength.
        # clamp max too: unmasked rows may hold district queue codes.
        ti = (type_idx if type_idx.dim() > 0 else type_idx.expand(self.B)).clamp(min=0, max=self.NU - 1)
        melee_cs = torch.where(
            can & (self._type_ranged_strength[ti] == 0),
            self._type_combat[ti],
            torch.zeros_like(self.civ_only_best_melee[:, civ]),
        )
        self.civ_only_best_melee[:, civ] = torch.maximum(self.civ_only_best_melee[:, civ], melee_cs)
        return can

    def _wonder_base_ok(self, r: int, j: int) -> torch.Tensor:
        """[B, T] wonder-tile base predicate for city (r, j) — ONE body shared
        by the scripted pick, seat_masks and the driven apply, because
        placement legality that exists twice drifts twice."""
        d_ctr = self.pair_dist[self.civ_city_center[:, r, j].clamp(min=0)]  # [B, T]
        return (
            (self.civ_at == r)
            & (self.tile_city == self.civ_city_id[:, r, j].unsqueeze(1))  # THIS city's registry
            & (d_ctr <= 3)
            & (self.district < 0)
            & (self.built_wonder < 0)
            & (self.civ_city_at < 0)
            & (self.center_at < 0)
            & (self.res_priority <= 1)
        )

    def _wonder_unlock_ok(self, r: int, wi: int) -> torch.Tensor | None:
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
            ok = ok & self.civ_only_techs[:, r, int(wrow["ut"])]
        if int(wrow.get("uc", -1)) >= 0:
            ok = ok & self.civ_only_civics[:, r, int(wrow["uc"])]
        return ok

    def _wonder_cand(self, r: int, j: int, wi: int, base_ok: torch.Tensor) -> torch.Tensor:
        """[B, T] candidate tiles for wonder wi at city (r, j) — the wok
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

    def _queue_civ_wonder_at(self, r: int, j: int, wi: int, has_w: torch.Tensor, cand_w: torch.Tensor) -> None:
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
        self.civ_city_wonder[rows_w, r, j, wi] = bwt
        code_w = 1 + self.NU + len(self._scaffold) + self.rules_dev.b_cost.shape[0] + len(self._proj_rows) + wi
        self.civ_city_current[:, r, j] = torch.where(has_w, torch.full_like(self.civ_city_current[:, r, j], code_w), self.civ_city_current[:, r, j])
        self.civ_city_cost[:, r, j] = torch.where(has_w, torch.full_like(self.civ_city_cost[:, r, j], float(wrow["cost"])), self.civ_city_cost[:, r, j])
        self.civ_city_progress[:, r, j] = torch.where(has_w, torch.zeros_like(self.civ_city_progress[:, r, j]), self.civ_city_progress[:, r, j])
        self._eff_version += 1  # a pave: features/improvements changed under the caches

    def _seat_proj_cost(self, r: int) -> torch.Tensor:
        """The project cost — max(round(15·speed), round(dCost·0.5)) on THIS
        civ's research; the districtCostIn twin the phase hoists."""
        dcp = self.rules.district_cost
        t_pct_r = self.civ_only_techs[:, r].to(torch.float64).mean(dim=1)
        c_pct_r = self.civ_only_civics[:, r].to(torch.float64).mean(dim=1)
        d_cost = torch.floor(dcp.get("base", 32) * (1 + dcp.get("scale", 9) * torch.maximum(t_pct_r, c_pct_r)))
        p_floor = float(round(15 * self.rules.game_speed))
        return torch.maximum(torch.full_like(d_cost, p_floor), js_round(d_cost * 0.5))
