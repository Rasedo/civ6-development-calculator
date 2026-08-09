"""The city-state phase and the minor-seat machinery.

One mixin of BatchSim (assembled in engine.py); state and helpers live on
self / gpu/core/simbase.py.
"""
from __future__ import annotations

from .simbase import *  # noqa: F401,F403 — torch, constants, helpers: the shared floor
from .simbase import _MUTABLE  # noqa: F401 — private names do not ride a star import
from . import simbase  # the PATCHABLE globals (U_MAX/P_MAX/_ALIAS_CHECK) must be read live


class SimMinors:
    def _city_state_phase(self) -> None:
        """Mirrors cityStatePhase draw for draw: meeting (instant, fog off) →
        influence → envoys → quest resolve/issue per city-state in id order
        (issuing draws twice: the askable district, then the option pick —
        the trade-route option always exists here, so the pool is never
        empty) → cosmetic growth every 12 turns."""
        if self.S == 0:
            return
        # The seat-0 <-> city-state war clock ticks FIRST, exactly where
        # cityStatePhase does — before meeting/influence/envoys.
        self.cs_war_turns.add_(self.cs_atwar.long())
        r = self.rules.cs
        self.cs_met.logical_or_(self.cs_alive)
        any_met = self.cs_met.any(dim=1)
        # Seat 0's adopted-government influence tier joins the flat rate
        # (cityStates.ts `INFLUENCE_PER_TURN + GOV_INFLUENCE_TIER`); tier 0
        # while government adoption is switched off.
        per_turn = float(r.get("influencePerTurn", 3))
        if self._gov_live:
            per_turn = per_turn + self._adopted_gov_tier(self.civics).to(self.dtype)
        self.influence.copy_(self.influence + torch.where(any_met, per_turn, torch.zeros_like(self.influence)))
        cost = float(r.get("envoyCost", 100))
        for _ in range(3):
            earn = any_met & (self.influence >= cost)
            if not bool(earn.any()):
                break
            self.influence.copy_(torch.where(earn, self.influence - cost, self.influence))
            self.envoys_avail.add_(earn.long())

        cooldown = int(r.get("questCooldown", 12))
        # "seat 0 owns a live complete district of askable type a" is constant
        # across the s loop (quest resolution never touches the district
        # planes) — one [B, nAskable] table per turn, gathered per s below,
        # instead of 2·S full [B, T] scans.
        if self._askable.numel() > 0 and self.districts_on:
            own_live = self.district_complete & (self.tile_seat == 0) & ~self.district_dead  # [B, T]
            own_tbl = ((self.district.unsqueeze(2) == self._askable.reshape(1, 1, -1)) & own_live.unsqueeze(2)).any(dim=1)  # [B, nA]
        else:
            own_tbl = None
        for s in range(self.S):
            act = self.cs_alive[:, s] & self.cs_met[:, s]
            # Resolve: clear-the-camp, or a buildDistrict quest for a district
            # seat 0 has since completed. Trade-route quests are uncompletable.
            camp_gone = ~((self.camp_tile == self.cs_quest_camp[:, s].unsqueeze(1)) & (self.camp_tile >= 0)).any(dim=1)
            resolved_camp = act & (self.cs_quest[:, s] == 1) & camp_gone
            if own_tbl is not None:
                # cs_quest_district holds a DISTRICT-TYPE index (the CS type's
                # own district, what the seat-generic issuer writes) — NOT an
                # askable-list index, so it must not be read through own_tbl.
                qd = self.cs_quest_district[:, s]
                _tc_r = self.tile_city.clamp(min=0)
                _live_r = self.alive.gather(1, _tc_r) & (self.tile_city >= 0)
                owns_asked = ((self.district == qd.unsqueeze(1)) & self.district_complete & _live_r & ~self.district_dead).any(dim=1) & (qd >= 0)
            else:
                owns_asked = torch.zeros(self.B, dtype=torch.bool, device=self.device)
            resolved_dist = act & (self.cs_quest[:, s] == 3) & owns_asked
            resolved = resolved_camp | resolved_dist
            if bool(resolved.any()):
                rows = resolved.nonzero(as_tuple=True)[0]
                self.cs_quest[rows, s] = 0
                self.cs_quest_issued[rows, s] = self.turn
                self.cs_envoys[rows, s] += int(r.get("questEnvoys", 1))
                self._eff_version += 1  # quest envoys move capital yields too
            # ZERO-DRAW issue, matching _seat_quest_phase: fixed order
            # clearCamp -> buildDistrict -> sendTradeRoute, with the district
            # the CS TYPE's own (_cs_didx) rather than a draw from a flat
            # askable list. Issuing must not move the shared PRNG.
            due = act & (self.cs_quest[:, s] == 0) & (self.turn - self.cs_quest_issued[:, s] >= cooldown)
            # clearCamp: NEAREST camp within 6, ties to the lowest tile index
            # (key = dist*(T+1)+tile, the shared issueQuest key).
            cdist = self.pair_dist[self.cs_center[:, s].unsqueeze(1), self.camp_tile.clamp(min=0)].to(torch.long)
            near = (self.camp_tile >= 0) & (cdist <= 6)
            has_camp = near.any(dim=1)
            span_q = self.T + 1
            key_c = torch.where(near, cdist * span_q + self.camp_tile.clamp(min=0), torch.full_like(cdist, 10**18))
            camp_idx = self.camp_tile.gather(1, key_c.argmin(dim=1).unsqueeze(1)).squeeze(1)
            # buildDistrict: the CS type's own district, unless already complete.
            # _cs_didx is a DISTRICT-TYPE index; own_tbl is keyed by ASKABLE
            # index. They are different index spaces, so the ownership test
            # reads the district plane directly (the civ path's own shape).
            di_p = self._cs_didx[:, s]
            if self.districts_on:
                # The test is whether a LIVE CITY OF THIS SEAT lists the
                # district, not whether the seat happens to own the tile —
                # those diverge the moment a district tile changes hands.
                # tile_city is the owning city column, so gate on it being alive.
                _tc = self.tile_city.clamp(min=0)
                _city_live = self.alive.gather(1, _tc) & (self.tile_city >= 0)
                own_live_q = self.district_complete & _city_live & ~self.district_dead
                owns_type = ((self.district == di_p.unsqueeze(1)) & own_live_q).any(dim=1)
            else:
                owns_type = torch.zeros(self.B, dtype=torch.bool, device=self.device)
            want_camp = due & has_camp
            want_dist = due & ~has_camp & ~owns_type
            # seat 0's own routes: dest encoding -(2 + s) for city-state s.
            # seat_routes covers every seat, so this arm needs no per-seat fork.
            has_route = (self.seat_routes[:, 0, :, 1] == -(2 + s)).any(dim=1)
            want_trade = due & ~has_camp & owns_type & ~has_route
            kind = torch.where(want_camp, torch.ones(self.B, dtype=torch.long, device=self.device),
                   torch.where(want_dist, torch.full((self.B,), 3, dtype=torch.long, device=self.device),
                   torch.where(want_trade, torch.full((self.B,), 2, dtype=torch.long, device=self.device),
                               torch.zeros(self.B, dtype=torch.long, device=self.device))))
            issued = want_camp | want_dist | want_trade
            if bool(issued.any()):
                rows = issued.nonzero(as_tuple=True)[0]
                self.cs_quest[rows, s] = kind[rows]
                self.cs_quest_issued[rows, s] = self.turn
                if bool(want_camp.any()):
                    cr = want_camp.nonzero(as_tuple=True)[0]
                    self.cs_quest_camp[cr, s] = camp_idx[cr]
                if bool(want_dist.any()):
                    dr = want_dist.nonzero(as_tuple=True)[0]
                    self.cs_quest_district[dr, s] = di_p[dr]

        if self.turn % 12 == 0:
            self.cs_pop.copy_(torch.where(self.cs_alive, (self.cs_pop + 1).clamp(max=10), self.cs_pop))
        # siege recovery — +10/turn toward maxHp (cityStatePhase tail).
        cs_max = int(self.rules.cs.get("maxHp", 150))
        self.cs_hp.copy_(torch.where(self.cs_alive & (self.cs_hp < cs_max), (self.cs_hp + 10).clamp(max=cs_max), self.cs_hp))

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
        cart_r = self.r_techs[:, civ, self._cartography_tech] if self._cartography_tech >= 0 else None
        found, spot = self._first_free_spot(at_tile, "v", civ=civ, naval_mask=naval_m, cart=cart_r)
        can = mask & found
        if not bool(can.any()):
            return can
        rows = can.nonzero(as_tuple=True)[0]
        slot = self.v_next[rows]
        assert int(slot.max()) < simbase.U_MAX, "civ slot pool exhausted — raise simbase.U_MAX"
        self.v_alive[rows, slot] = True
        self.v_civ[rows, slot] = civ
        self.v_seat[rows, slot] = civ + 1  # seat id of civ index `civ`
        self.v_type[rows, slot] = type_idx[rows] if type_idx.dim() > 0 else type_idx
        self.v_tile[rows, slot] = spot[rows]
        self.v_hp[rows, slot] = self.rules.combat.get("unitHp", 100)
        self.v_fortify[rows, slot] = 0  # a fresh (possibly reclaimed) slot starts undug
        # a fresh slot starts at 0 xp unless the training city grants Encampment XP.
        self.v_xp[rows, slot] = 0 if init_xp is None else init_xp[rows]
        self.v_aura_mp[rows, slot] = 0  # no frozen grant until the first refresh (TS movesFull undefined)
        # `emb` MUST be cleared BEFORE _full_mp, which reads it: a reclaimed
        # slot carries the dead occupant's flag, and _full_mp overrides an
        # embarked unit's pool to the flat EMBARK_MOVES.
        self.v_emb[rows, slot] = False
        # `movesLeft: def.moves` + this seat's golden dedication.
        _m = self._full_mp("v")[rows, slot]
        self.v_mp[rows, slot] = _m
        self.v_mp_full[rows, slot] = _m
        self.v_charges[rows, slot] = 0  # military; builder spawns set their own charges
        self.occ_mil[(rows, spot[rows])] = slot + simbase.P_MAX  # merged-pool index of the v_ slot
        self.v_next[rows] += 1
        # the seat's strongest melee ever (city defense); a roster type counts
        # as melee unless it carries ranged strength.
        # clamp max too: unmasked rows may hold district queue codes.
        ti = (type_idx if type_idx.dim() > 0 else type_idx.expand(self.B)).clamp(min=0, max=self.NU - 1)
        melee_cs = torch.where(
            can & (self._p_rng_str[ti] == 0),
            self._p_combat[ti],
            torch.zeros_like(self.r_best_melee[:, civ]),
        )
        self.r_best_melee[:, civ] = torch.maximum(self.r_best_melee[:, civ], melee_cs)
        return can

    def _wonder_base_ok(self, r: int, j: int) -> torch.Tensor:
        """[B, T] wonder-tile base predicate for city (r, j) — ONE body shared
        by the scripted pick, seat_masks and the driven apply, because
        placement legality that exists twice drifts twice."""
        d_ctr = self.pair_dist[self.rc_center[:, r, j].clamp(min=0)]  # [B, T]
        return (
            (self.civ_at == r)
            & (self.tile_city == self.rc_id[:, r, j].unsqueeze(1))  # THIS city's registry
            & (d_ctr <= 3)
            & (self.district < 0)
            & (self.built_wonder < 0)
            & (self.rc_at < 0)
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
            ok = ok & self.r_techs[:, r, int(wrow["ut"])]
        if int(wrow.get("uc", -1)) >= 0:
            ok = ok & self.r_civics[:, r, int(wrow["uc"])]
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
        self.rc_wonder[rows_w, r, j, wi] = bwt
        code_w = 1 + self.NU + len(self._scaffold) + self.rules_dev.b_cost.shape[0] + len(self._proj_rows) + wi
        self.rc_current[:, r, j] = torch.where(has_w, torch.full_like(self.rc_current[:, r, j], code_w), self.rc_current[:, r, j])
        self.rc_cost[:, r, j] = torch.where(has_w, torch.full_like(self.rc_cost[:, r, j], float(wrow["cost"])), self.rc_cost[:, r, j])
        self.rc_progress[:, r, j] = torch.where(has_w, torch.zeros_like(self.rc_progress[:, r, j]), self.rc_progress[:, r, j])
        self._eff_version += 1  # a pave: features/improvements changed under the caches

    def _seat_proj_cost(self, r: int) -> torch.Tensor:
        """The project cost — max(round(15·speed), round(dCost·0.5)) on THIS
        civ's research; the districtCostIn twin the phase hoists."""
        dcp = self.rules.district_cost
        t_pct_r = self.r_techs[:, r].to(torch.float64).mean(dim=1)
        c_pct_r = self.r_civics[:, r].to(torch.float64).mean(dim=1)
        d_cost = torch.floor(dcp.get("base", 32) * (1 + dcp.get("scale", 9) * torch.maximum(t_pct_r, c_pct_r)))
        p_floor = float(round(15 * self.rules.game_speed))
        return torch.maximum(torch.full_like(d_cost, p_floor), js_round(d_cost * 0.5))
