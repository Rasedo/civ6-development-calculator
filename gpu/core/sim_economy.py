"""The economy floor: war weariness, costs, districts, adjacency, yields, city totals, scores.

One mixin of BatchSim (assembled in engine.py); state and helpers live on
self / gpu/core/simbase.py.
"""
from __future__ import annotations

from .simbase import *  # noqa: F401,F403 — torch, constants, helpers: the shared floor
from .simbase import _MUTABLE  # noqa: F401 — private names do not ride a star import
from . import simbase  # the PATCHABLE globals (U_MAX/P_MAX/_ALIAS_CHECK) must be read live


class SimEconomy:
    def _luxury_amenities(self, amen_have: torch.Tensor, amen_need: torch.Tensor) -> torch.Tensor:
        """[B, C] luxuryAmenities mirror: each UNIQUE improved luxury inside
        seat 0's borders — tile.improvement equals the resource's OWN
        improvement, and pillage does NOT suspend it — grants +1 amenity to
        the luxAmenityCities NEEDIEST cities. Grants feed back into the
        ranking (need desc, ties by CITY ID asc = the ACQUISITION order,
        city_seq), and rounds are homogeneous, so only the per-game COUNT of
        active luxuries matters."""
        B, C = self.B, self.C
        out = torch.zeros(B, C, dtype=self.dtype, device=self.device)
        if self._n_lux == 0 or not self.improvements_on:
            return out
        improved = (self.lux_id >= 0) & (self.tile_seat == PLAYER_SEAT) & (self.improvement == self.lux_req)
        counts = torch.zeros(B, self._n_lux, dtype=torch.long, device=self.device)
        counts.scatter_add_(1, self.lux_id.clamp(min=0), improved.long())
        rounds = (counts > 0).long().sum(dim=1)  # [B] unique improved luxuries
        mx = int(rounds.max().item())
        if mx == 0:
            return out
        seq = self.city_seq.to(self.dtype)  # tie: lower city id (acquisition order)
        k = min(self._lux_k, C)
        for rnd in range(mx):
            act = rounds > rnd
            need = amen_need - (amen_have + out)
            key = torch.where(self.alive, need * 64 - seq, torch.full_like(need, -1e9))
            top_v, top_i = key.topk(k, dim=1)
            grant = (top_v > -1e8) & act.unsqueeze(1)
            out.scatter_add_(1, top_i, grant.to(self.dtype))
        return out

    # ------------------------------------------------------------------
    # WAR WEARINESS - the core/weariness.ts twin, seat-generic.
    #
    #     WWP = (EraBase * Location) + Death
    #
    # scored PER BATTLE, by both sides, "without any discrimination". There is
    # one function per rule and every one of them takes a SEAT ROW: seat 0 is
    # row 0, civ index r is row r+1, exactly as the war matrix indexes them.
    # ------------------------------------------------------------------

    def _ww_audit(self) -> None:
        """Every battle OPENED this step must have been SCORED for weariness.

        `_damage_roll` counts the rolls whose key is in `WW_BATTLE_KEYS`;
        `_ww_battle` counts the games it was actually invoked for. An applier
        with no scoring call shows up here as a mismatch on the very first step
        that reaches it, instead of as a silently-zero accumulator.

        It counts INVOCATIONS, not points: a battle involving a barbarian is
        still hooked, and `_ww_battle` declines to score it internally - the
        audit asks only "did the rule get a chance to run".
        """
        bad = self._ww_opened != self._ww_hooked
        if bool(bad.any()):
            g = int(bad.nonzero()[0])
            raise AssertionError(
                f"WAR-WEARINESS SITE MISSING: game {g} turn {int(self.turn)} opened "
                f"{int(self._ww_opened[g])} battle(s) but scored {int(self._ww_hooked[g])}. "
                f"A damage roll keyed in WW_BATTLE_KEYS has no `_ww_battle` call "
                f"beside it (or one fires under a different mask). See task #60: "
                f"one TS rule, {len(WW_BATTLE_KEYS)} GPU appliers."
            )
        self._ww_opened.zero_()
        self._ww_hooked.zero_()

    def _ww_max(self, row: int) -> torch.Tensor:
        """[B] long - the worst of this seat's wars, which is the one it feels.
        Simultaneous wars score separately and only the highest counts."""
        return self.ww[:, row, :].max(dim=1).values

    def _ww_sum(self, row: int) -> torch.Tensor:
        """[B] long - every war added up. NOT a game rule: a GATE column, so a
        disagreement about WHICH war holds the maximum cannot hide behind an
        equal maximum. The `wwSum` twin."""
        return self.ww[:, row, :].sum(dim=1)

    def _tile_mil_seat(self, tile: torch.Tensor) -> torch.Tensor:
        """[B] long - the SEAT of the military unit on `tile`, NO_SEAT if none.
        The unit pool is one plane with `unit_seat` carrying ownership, so this
        is one gather rather than a per-pool chain."""
        s = self.occ_mil.gather(1, tile.clamp(min=0).unsqueeze(1)).squeeze(1)
        return torch.where(s >= 0, self.unit_seat.gather(1, s.clamp(min=0).unsqueeze(1)).squeeze(1),
                           torch.full_like(s, NO_SEAT))

    def _tile_civ_seat(self, tile: torch.Tensor) -> torch.Tensor:
        """[B] long - the SEAT of the civilian on `tile`, NO_SEAT if none."""
        s = self.occ_civ.gather(1, tile.clamp(min=0).unsqueeze(1)).squeeze(1)
        return torch.where(s >= 0, self.unit_seat.gather(1, s.clamp(min=0).unsqueeze(1)).squeeze(1),
                           torch.full_like(s, NO_SEAT))

    def _atk_seat(self, atk_kind: str, u: int) -> torch.Tensor:
        """[B] long - the SEAT of the hostile attacker in pool slot `u`.
        `_hostile_vs_unit` and `_hostile_ranged_strike` are pool-generic over
        atk_kind, so their seat is too."""
        if atk_kind == "civ":
            return self.v_seat[:, u]
        if atk_kind == "player":
            return self.p_seat[:, u]
        return self.u_seat[:, u]

    def _row_of(self, seat: torch.Tensor) -> torch.Tensor:
        """[B] long - the war-matrix ROW for each game's absolute seat, with
        NO_SEAT passed through as -1 (which `_ww_battle` reads as "nobody")."""
        return torch.where(seat >= 0, self._seat_row[seat.clamp(min=0)], torch.full_like(seat, -1))

    def _ww_occ(self, tile: torch.Tensor) -> torch.Tensor:
        """[B] long - an occupancy BITMASK for `tile`.

        Sampled either side of a resolution, a bit that FELL is exactly "the
        defender died": nothing else clears the tile's occupancy mid-battle.
        It needs no knowledge of which pool or slot the defender lived in, and
        that pool-blindness is the point - the same expression works at every
        battle site, where a per-pool death mask would be five different ones.
        """
        t = tile.clamp(min=0).unsqueeze(1)
        # Bit 0 is the military map, bit 1 the civilian one. They are read
        # SEPARATELY and not ORed: a tile can hold one of each, and ORing them
        # hides a military death behind the civilian still standing there.
        return ((self.occ_mil.gather(1, t).squeeze(1) >= 0).long()
                | ((self.occ_civ.gather(1, t).squeeze(1) >= 0).long() << 1))

    def _ww_holds(self, row: int) -> bool:
        """Only MAJOR civs keep an accumulator: rows 0..R. A city-state is a
        real OPPONENT - warring one wears you down normally - but has no
        amenities to lose and no research to date its era from. The barbarian
        row is never a war at all."""
        return 0 <= row <= self.R

    def _ww_era_base(self, row: torch.Tensor, foe_row: torch.Tensor) -> torch.Tensor:
        """[B] long - each game's per-battle base for the seat in `row` fighting
        the seat in `foe_row`: that seat's OWN era's entry in the formal or
        surprise column, clamped at Industrial and beyond.

        Rows are TENSORS because a GPU battle site resolves many games at once
        and the defender is a different civ in each of them.

        The casus belli picks the column. Only the civ-civ axis can ever
        answer FORMAL, because denouncing is the only casus-belli verb either
        engine has and only civs hold it - a missing VERB, not a seat rule
        (`warIsFormal` says the same thing in the same words). SURPRISE is the
        harsher column, so the default costs the defaulting seat.
        """
        rww = self.rules.war_weariness
        formal = torch.tensor(rww.get("eraFormal", [16, 22, 28, 34, 40]), dtype=torch.long, device=self.device)
        surprise = torch.tensor(rww.get("eraSurprise", [16, 25, 34, 43, 52]), dtype=torch.long, device=self.device)
        civ = row.clamp(0, self.R)  # civ_techs/civ_civics cover rows 0..R only
        T, C = self.civ_techs.shape[2], self.civ_civics.shape[2]
        techs = self.civ_techs.gather(1, civ.view(-1, 1, 1).expand(-1, 1, T)).squeeze(1)
        civics = self.civ_civics.gather(1, civ.view(-1, 1, 1).expand(-1, 1, C)).squeeze(1)
        era = self._civ_era(techs, civics).clamp(0, formal.numel() - 1)
        rr = (row >= 1) & (row <= self.R) & (foe_row >= 1) & (foe_row <= self.R)
        n = self.rr_warkind.shape[1]
        flat = (row.clamp(1, max(n, 1)) - 1) * n + (foe_row.clamp(1, max(n, 1)) - 1)
        kind = self.rr_warkind.reshape(self.B, -1).gather(1, flat.unsqueeze(1)).squeeze(1) & rr
        return torch.where(kind, formal[era], surprise[era])

    def _ww_battle(self, hit: torch.Tensor, a_row, d_row, tile: torch.Tensor,
                   a_died=None, d_died=None, city: bool = False) -> None:
        """One BATTLE, scored for both sides - the `warWearinessBattle` twin.

        `hit` [B] masks the games in which the battle happened; `a_row`/`d_row`
        are seat ROWS, an int (the same seat in every game) or a [B] tensor.
        `tile` [B] is the TARGET's tile ("the target location is always the
        location, including for ranged units"), whose OWNER decides each side's
        location multiplier: 1 in your own borders, 2 anywhere else. `city`
        forces the abroad column for both sides, which is what a city giving or
        receiving an attack does regardless of whose land it stands on.

        Call it after the rolls and after the deaths are known but BEFORE any
        capture - the multiplier is the one that applied while the battle was
        fought, not the one that applies once the tile changes hands.
        """
        self._ww_hooked += hit.long()  # a battle was scored
        rww = self.rules.war_weariness
        abroad = int(rww.get("abroad", 2))
        death = int(rww.get("death", 3))
        zeros = torch.zeros(self.B, dtype=torch.long, device=self.device)
        a_row = zeros + a_row if isinstance(a_row, int) else a_row.long()
        d_row = zeros + d_row if isinstance(d_row, int) else d_row.long()
        owner = self.tile_seat.gather(1, tile.clamp(min=0).unsqueeze(1)).squeeze(1)
        turn = zeros + int(self.turn)
        # Barbarians neither accrue weariness nor inflict it: every seat is
        # permanently hostile to them, so counting it would make "at peace with
        # everyone" unreachable and no accumulator could ever drain.
        live = hit & (a_row >= 0) & (d_row >= 0) & (a_row != d_row) \
            & (a_row != self.BARB_ROW) & (d_row != self.BARB_ROW)
        if not bool(live.any()):
            return
        NS = self.NS
        flat_ww = self.ww.view(self.B, NS * NS)
        flat_turn = self.ww_turn.view(self.B, NS * NS)
        for self_row, foe_row, died in ((a_row, d_row, a_died), (d_row, a_row, d_died)):
            # Only MAJOR civs (rows 0..R) keep an accumulator - a city-state is
            # a real opponent but has no amenities to lose and no research to
            # date its era from.
            score = live & (self_row >= 0) & (self_row <= self.R)
            if not bool(score.any()):
                continue
            base = self._ww_era_base(self_row, foe_row)
            # GlobalParameters carries exactly two location rows -
            # WAR_WEARINESS_PER_COMBAT_IN_ALLIED_LANDS 1 and
            # ..._IN_FOREIGN_LANDS 2 - so an ALLY's territory is home ground
            # too, and unowned ground is foreign. `friendlyLand`'s twin.
            _own = owner == self._ROW_SEAT.gather(0, self_row.clamp(min=0))
            _rr = (self_row >= 1) & (self_row <= self.R) & (owner >= 1) & (owner <= self.R)
            _n = self.rr_allied.shape[1]
            _fl = (self_row.clamp(1, max(_n, 1)) - 1) * _n + (owner.clamp(1, max(_n, 1)) - 1)
            _ally = self.rr_allied.reshape(self.B, -1).gather(1, _fl.unsqueeze(1)).squeeze(1) & _rr
            at_home = (_own | _ally) & (not city)
            gain = base * torch.where(at_home, 1, abroad)
            if died is not None:
                gain = gain + torch.where(died, base * death, zeros)
            idx = (self_row.clamp(min=0) * NS + foe_row.clamp(min=0)).unsqueeze(1)
            flat_ww.scatter_add_(1, idx, torch.where(score, gain, zeros).unsqueeze(1))
            flat_turn.scatter_(1, idx, torch.where(
                score, turn, flat_turn.gather(1, idx).squeeze(1)).unsqueeze(1))

    def _ww_decay(self, row: int, mask: torch.Tensor | None = None) -> None:
        """The end-of-turn decay for ONE seat - the `warWearinessTurn` twin,
        called from that seat's own block top.

          * a war in which a battle was fought THIS turn does not decay
          * any other war sheds 50 while this seat is at war with somebody
          * a seat at war with nobody sheds 200 from every war it remembers
        """
        if not self._ww_holds(row):
            return
        rww = self.rules.war_weariness
        at_war = self.war[:, row, :].any(dim=1, keepdim=True)
        shed = torch.where(at_war,
                           torch.tensor(int(rww.get("decayAtWar", 50)), dtype=torch.long, device=self.device),
                           torch.tensor(int(rww.get("decayAtPeace", 200)), dtype=torch.long, device=self.device))
        fought = self.ww_turn[:, row, :] == int(self.turn)
        if mask is not None:
            fought = fought | ~mask.unsqueeze(1)  # an eliminated civ's block is skipped
        self.ww[:, row, :] = torch.where(fought, self.ww[:, row, :],
                                         (self.ww[:, row, :] - shed).clamp(min=0))

    def _ww_peace(self, mask: torch.Tensor, a_row: int, b_row: int) -> None:
        """A peace treaty sheds 2000 from THAT war on both sides - deliberately
        larger than any plausible accumulation, which is how the source stops a
        settled war haunting a civ forever. The `warWearinessPeace` twin."""
        shed = int(self.rules.war_weariness.get("peaceTreaty", 2000))
        for i, j in ((a_row, b_row), (b_row, a_row)):
            if not self._ww_holds(i) or i == j:
                continue
            self.ww[:, i, j] = torch.where(mask, (self.ww[:, i, j] - shed).clamp(min=0), self.ww[:, i, j])

    def _cs_suzerain_release(self, r: int, peace: torch.Tensor) -> None:
        """Making peace with a civ ALSO ends the wars its city-states were
        dragged into — the `makePeace` loop that walks `state.cityStates` and
        clears every `cs.atWar` whose suzerain is that civ.

        The suzerain test is `isSuzerain`'s: at least `suzerainEnvoys`,
        strictly above seat 0, strictly above every other civ."""
        if self.S <= 0 or not bool(peace.any()):
            return
        suz_min = int(self.rules.cs.get("suzerainEnvoys", 3))
        _oth = self.cs_r_envoys.clone()
        _oth[:, r] = -1
        r_suz = (
            (self.cs_r_envoys[:, r] >= suz_min)
            & (self.cs_r_envoys[:, r] > self.cs_envoys)
            & (self.cs_r_envoys[:, r] > _oth.max(dim=1).values)
            & self.cs_alive
        )
        rel = r_suz & self.cs_atwar & peace.unsqueeze(1)
        if not bool(rel.any()):
            return
        self.cs_atwar &= ~rel
        # `cs_war_turns` is a VIEW of `war_turns` — a rebind orphans it, so the
        # clock must be written IN PLACE.
        self.cs_war_turns.masked_fill_(rel, 0)
        _cs0 = 1 + max(self.R, 1)
        for _s in range(self.S):
            self._ww_peace(rel[:, _s], 0, _cs0 + _s)

    def _ww_penalty_player(self) -> torch.Tensor:
        """[B] seat 0's war-weariness amenity penalty (integer floor, then
        dtype) - `warWearinessPenalty(wwMax(...))` on row 0."""
        per = int(self.rules.war_weariness.get("perAmenity", 400))
        return torch.div(self._ww_max(0), per, rounding_mode="floor").to(self.dtype)

    def _ww_penalty_civ(self, r: int) -> torch.Tensor:
        """[B] civ r's amenity penalty - the same function on row r+1."""
        per = int(self.rules.war_weariness.get("perAmenity", 400))
        return torch.div(self._ww_max(r + 1), per, rounding_mode="floor").to(torch.float64)

    def _amenity_factors(self, balance: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        growth = torch.full_like(balance, self.rules.amenity_tiers[-1][1])
        yld = torch.full_like(balance, self.rules.amenity_tiers[-1][2])
        for mn, g, y in reversed(self.rules.amenity_tiers):
            mask = balance >= mn
            growth = torch.where(mask, torch.tensor(g, dtype=self.dtype, device=self.device), growth)
            yld = torch.where(mask, torch.tensor(y, dtype=self.dtype, device=self.device), yld)
        return growth, yld

    def _growth_needed(self, pop: torch.Tensor) -> torch.Tensor:
        p = pop.to(self.dtype)
        return torch.floor(15 + 8 * (p - 1) + (p - 1).clamp(min=0) ** 1.5)

    def _border_cost(self, n: torch.Tensor) -> torch.Tensor:
        # 10 + (6t)^1.3, t = 1-based tile count.
        return torch.floor(10 + (6 * (n.to(self.dtype) + 1)) ** 1.3)

    def _builder_cost(self, n: torch.Tensor) -> torch.Tensor:
        """builderCost — round((base + per·n) · gameSpeed), n = builders ever
        trained + queued (Math.round == js_round)."""
        r = self.rules
        return js_round((r.builder_base + r.builder_per * n.to(self.dtype)) * r.game_speed)

    def _p_settlers(self) -> torch.Tensor:
        """[B] seat 0's LIVE settler units — what the settlerCost escalator
        counts."""
        if self._settler_idx < 0:
            return torch.zeros(self.B, dtype=torch.long, device=self.device)
        return (self.p_alive & (self.p_type == self._settler_idx)).sum(dim=1)

    def _r_settlers_of(self, r: int) -> torch.Tensor:
        """[B] civ r's LIVE settler units."""
        if self._settler_idx < 0:
            return torch.zeros(self.B, dtype=torch.long, device=self.device)
        return (self.v_alive & (self.v_civ == r) & (self.v_type == self._settler_idx)).sum(dim=1)

    def _afford(self, tre: torch.Tensor, cost) -> torch.Tensor:
        """Milli-rounded gold-threshold compare — the `goldAffordable` twin.
        Treasuries accumulate non-dyadic 0.05-unit gold whose sub-milli drift
        differs between the engines, so a raw `treasury >= cost` would split at
        invisible knife-edges."""
        if not torch.is_tensor(cost):
            cost = torch.tensor(float(cost), dtype=tre.dtype, device=tre.device)
        return js_round(tre * 1000) >= js_round(cost * 1000)

    def _unlocked_specialty_count(self, techs2: torch.Tensor, civics2: torch.Tensor) -> torch.Tensor:
        """[B] U — specialty district types whose unlockDistrict tech/civic is
        researched (districtDiscounted's U; -1 = never unlocked)."""
        ut, uc = self._d_unlock_t, self._d_unlock_c
        unl = ((ut >= 0).unsqueeze(0) & techs2[:, ut.clamp(min=0)]) | (
            (uc >= 0).unsqueeze(0) & civics2[:, uc.clamp(min=0)]
        )  # [B, nD]
        return (unl & self._is_specialty.unsqueeze(0)).sum(dim=1)

    def _player_district_discounted(self, di: int) -> torch.Tensor:
        """districtDiscounted for seat 0: [B] bool — 40% off type di while the
        seat has PLACED fewer of it than ceil(D/U) with D = COMPLETED
        specialty districts owned, U = unlocked specialty types, D ≥ U."""
        if not bool(self._is_specialty[di]):
            return torch.zeros(self.B, dtype=torch.bool, device=self.device)
        U = self._unlocked_specialty_count(self.techs, self.civics)
        own = (self.tile_seat == PLAYER_SEAT) & ~self.district_dead  # captured = dead, uncounted
        spec_t = (self.district >= 0) & self._is_specialty[self.district.clamp(min=0)]
        D = (own & spec_t & self.district_complete).sum(dim=1)
        n = (own & (self.district == di)).sum(dim=1)
        thresh = torch.div(D + U.clamp(min=1) - 1, U.clamp(min=1), rounding_mode="floor")  # ceil(D/U)
        return (U > 0) & (D >= U) & (n < thresh)

    def _seat_district_discounted(self, r: int, di: int) -> torch.Tensor:
        """districtDiscounted from THIS civ seat's own research trees and
        rc_dist_tile registry."""
        if not bool(self._is_specialty[di]):
            return torch.zeros(self.B, dtype=torch.bool, device=self.device)
        U = self._unlocked_specialty_count(self.r_techs[:, r], self.r_civics[:, r])
        placed = self.rc_dist_tile[:, r]  # [B, RC, nD] tile per (city, type)
        n = (placed[:, :, di] >= 0).sum(dim=1)
        tiles_f = placed.clamp(min=0).reshape(self.B, -1)
        comp = (placed >= 0) & self.district_complete.gather(1, tiles_f).reshape(placed.shape)
        D = (comp & self._is_specialty.reshape(1, 1, -1)).sum(dim=(1, 2))
        thresh = torch.div(D + U.clamp(min=1) - 1, U.clamp(min=1), rounding_mode="floor")
        return (U > 0) & (D >= U) & (n < thresh)

    def _available_mask(self, done: torch.Tensor, prereq: torch.Tensor) -> torch.Tensor:
        """[B, N] researchable now: not done, all prereqs done."""
        missing = (prereq.unsqueeze(0) & ~done.unsqueeze(1)).any(dim=2)
        return ~done & ~missing

    def _eff_cost(self, cost: torch.Tensor, boosted: torch.Tensor, golden_civ=None, is_civic: bool = False) -> torch.Tensor:
        # A GOLDEN Free Inquiry (techs) or Pen, Brush and Voice (civics) makes
        # a boost refund an EXTRA 10% of the item's cost. Callers that pass no
        # civ get the base behaviour.
        frac = self.rules.boost_fraction
        if golden_civ is not None:
            g = self._golden_ded(golden_civ, self._ded_pen_brush if is_civic else self._ded_free_inquiry)
            extra = g.to(cost.dtype).reshape(-1, *((1,) * (cost.dim() - 1))) * 0.1
            return torch.where(boosted, js_round(cost * (1 - frac - extra)), cost)
        return torch.where(boosted, js_round(cost * (1 - frac)), cost)  # Math.round is half-up

    def _auto_pick(self, cur, done, boosted, cost, prereq, golden_civ=None, is_civic: bool = False):
        """Cheapest-available (effective cost, tie = table order), where cur == -1.
        The key is the DISCOUNTED cost, so a golden Free Inquiry /
        Pen-Brush-and-Voice changes which item is picked — `autoPickResearch`
        sorts by `effectiveResearchCost`, which carries the same bonus."""
        avail = self._available_mask(done, prereq)
        eff = self._eff_cost(cost.unsqueeze(0).expand_as(avail), boosted, golden_civ, is_civic)
        key = torch.where(avail, eff, torch.tensor(float("inf"), dtype=self.dtype, device=self.device)).double()
        # Stable tie-break on index: a tiny index epsilon, in FORCED f64 for
        # the same reason as the worked-tile pick — 1e-6 is below the f32 ULP
        # of a several-thousand-beaker cost, so under self.dtype=f32 it would
        # round away and equal-cost techs/civics would resolve by argmin's own
        # order instead of table order.
        key = key + torch.arange(key.shape[1], device=self.device, dtype=torch.float64) * 1e-6
        best = key.argmin(dim=1)
        has = avail.any(dim=1)
        return torch.where((cur == -1) & has, best, cur)

    def _eff_food(self) -> torch.Tensor:
        """[B, T] tile FOOD with the disaster terms applied: fertility feeds
        (+1 each, already capped), drought starves (−1, floored at 0) —
        mirrors the tail of tileYields. Food is the only column disasters
        touch; consumers that don't mix columns read this directly and skip
        the full [B, T, 6] assembly."""
        if self._food_cache is not None and self._food_cache[0] == self._eff_version:
            return self._food_cache[1]
        base = self.tile_yields[:, :, 0]
        if self.improvements_on:
            # A FARM adds its food to the tile's base yield (part of
            # tileYields, before the fertility/drought tail); a pillaged
            # improvement yields nothing.
            farm = (self.improvement == self.FARM) & ~self.pillaged
            base = base + farm.to(self.dtype) * self._farm_food
        food = base + self.fertility.to(self.dtype)
        food = torch.where(self.drought > 0, (food - 1).clamp(min=0), food)
        # Natural-wonder tiles EARLY-RETURN in tileYields with the wonder's
        # fixed yields, BEFORE the fertility/drought tail — the disaster STATE
        # still lands on them (the trace counts it), but their food never moves.
        food = torch.where(self.nwonder, self.tile_yields[:, :, 0], food)
        self._food_cache = (self._eff_version, food)
        return food

    def _eff_prod(self) -> torch.Tensor:
        """[B, T] tile PRODUCTION with improvement yields applied: a MINE or
        LUMBER_MILL adds its production to the tile's base (mirrors the
        improvement branch of tileYields), a pillaged improvement adds
        nothing. MINE production is tech-boosted — each of Apprenticeship /
        Industrialization adds +1⚙ to EVERY mine — so an existing mine's
        yield RISES when a boost tech completes; _eff_version bumps there so
        the eff/score caches follow. Production has no fertility/drought or
        natural-wonder tail (those touch food only), so base + improvement
        is the whole story."""
        base = self.tile_yields[:, :, 1]
        if not self.improvements_on:
            return base
        live = ~self.pillaged
        out = base
        if self.MINE >= 0:
            if self._mine_boost_tech.numel() > 0:
                researched = self.techs[:, self._mine_boost_tech].to(self.dtype)  # [B, K]
                boost = (researched * self._mine_boost_amt).sum(dim=1)            # [B]
            else:
                boost = torch.zeros(self.B, dtype=self.dtype, device=self.device)
            mine_prod = (self._mine_prod + boost).unsqueeze(1)                    # [B, 1]
            out = out + ((self.improvement == self.MINE) & live).to(self.dtype) * mine_prod
        if self.LUMBER >= 0:
            out = out + ((self.improvement == self.LUMBER) & live).to(self.dtype) * self._lumber_prod
        # The rest of the roster (QUARRY/PASTURE/CAMP/PLANTATION/OIL_WELL,
        # idx >= 3) adds its catalog production via the dense table;
        # FARM/MINE/LUMBER keep their bespoke terms above.
        new_imp = self.improvement >= 3
        if bool(new_imp.any()):
            out = out + (new_imp & live).to(self.dtype) * self._imp_yields[self.improvement.clamp(min=0), 1]
        return out

    def _neutral_prod(self) -> torch.Tensor:
        """[B, T] tile PRODUCTION as a CIV SEAT works it. That path calls
        tileYields with defaultModifiers(): the improvement's BASE production
        applies (the mine/lumber mill is physically on the tile; pillage
        suspends it) but seat 0's mine-boost techs do NOT — those ride
        ctx.mods, which defaultModifiers zeroes. Distinct from _eff_prod(),
        the seat-0-context plane that adds the boosts. Cached per _eff_version
        (improvement/pillage changes bump it)."""
        base = self.tile_yields[:, :, 1]
        if not self.improvements_on:
            return base
        if self._nprod_cache is not None and self._nprod_cache[0] == self._eff_version:
            return self._nprod_cache[1]
        live = ~self.pillaged
        out = base
        if self.MINE >= 0:
            out = out + ((self.improvement == self.MINE) & live).to(self.dtype) * self._mine_prod
        if self.LUMBER >= 0:
            out = out + ((self.improvement == self.LUMBER) & live).to(self.dtype) * self._lumber_prod
        # The rest of the roster's catalog production — context-free
        # (IMPROVEMENTS[imp].yields applies under defaultModifiers too; only
        # the mine-boost ctx.mods stay out of the neutral plane).
        new_imp = self.improvement >= 3
        if bool(new_imp.any()):
            out = out + (new_imp & live).to(self.dtype) * self._imp_yields[self.improvement.clamp(min=0), 1]
        self._nprod_cache = (self._eff_version, out)
        return out

    def _eff_yields(self) -> torch.Tensor:
        """[B, T, 6] tile yields with disaster food AND improvement production
        — for consumers whose cross-column float sums must keep the assembled
        row order.

        Cached per disaster version: fertility/drought mutate ONLY inside
        _disaster_phase, improvement/pillaged state inside the builder/raider
        paths, and mine-boost techs inside research — each bumps the version.
        The cache returns the identical tensor, so downstream float behavior
        is unchanged."""
        if not self.disasters and not self.improvements_on and not bool(self.feat_stripped.any()):
            return self.tile_yields
        if self._eff_cache is not None and self._eff_cache[0] == self._eff_version:
            return self._eff_cache[1]
        ty = self.tile_yields.clone()
        ty[:, :, 0] = self._eff_food()
        if self.improvements_on:
            ty[:, :, 1] = self._eff_prod()
            # gold+ columns — CAMP/PLANTATION add catalog gold. Generic over
            # the whole roster (cols 2-5 are zero for the rest),
            # pillage-suspended like every improvement yield.
            live_imp = (self.improvement >= 0) & ~self.pillaged
            if bool(live_imp.any()):
                ty[:, :, 2:] = ty[:, :, 2:] + self._imp_yields[self.improvement.clamp(min=0), 2:] * live_imp.unsqueeze(-1).to(ty.dtype)
                # The SEASIDE RESORT's gold IS the tile's appeal, so it cannot
                # come from the static catalog row. Floored at 0 like the TS
                # twin. Cached with the rest on _eff_version — _tile_appeal()
                # is keyed the same way.
                if self.SEASIDE >= 0:
                    sr_live = live_imp & (self.improvement == self.SEASIDE)
                    if bool(sr_live.any()):
                        ty[:, :, 2] = ty[:, :, 2] + (
                            self._tile_appeal().clamp(min=0).to(ty.dtype) * sr_live.to(ty.dtype)
                        )
        # A chopped (or founding-stripped) tile loses its feature's own yields
        # on every column — TS reads tile.feature === null live. The center
        # path is separate (it reads the neutral planes and applies its own
        # strip), and _eff_food/_eff_prod rebuild cols 0/1 feature-inclusive,
        # so the subtraction comes after the overwrites.
        if bool(self.feat_stripped.any()):
            ty = ty - self.feat_yields.to(ty.dtype) * self.feat_stripped.unsqueeze(-1).to(ty.dtype)
        self._eff_cache = (self._eff_version, ty)
        return ty

    def _fertilize(self, rows: torch.Tensor, tiles: torch.Tensor) -> None:
        """+1 fertility (capped) on land, non-mountain tiles. (row, tile)
        pairs must be unique — duplicates would collapse to a single +1."""
        ok = self.fertilizable[rows, tiles]
        r2, t2 = rows[ok], tiles[ok]
        self.fertility[r2, t2] = (self.fertility[r2, t2] + 1).clamp(max=3)

    def _fertilize_counted(self, rows: torch.Tensor, tiles: torch.Tensor) -> None:
        """Like _fertilize but duplicate (row, tile) pairs stack: min(3,
        f + n) equals n sequential capped +1s, so a scatter-add then one
        clamp reproduces the TS loop exactly."""
        ok = self.fertilizable[rows, tiles]
        gi = rows[ok] * self.T + tiles[ok]
        cnt = torch.zeros(self.B * self.T, dtype=torch.long, device=self.device)
        cnt.index_put_((gi,), torch.ones_like(gi), accumulate=True)
        touched = cnt > 0
        flat = self.fertility.reshape(-1)
        flat[touched] = (flat[touched] + cnt[touched]).clamp(max=3)

    def _scorch(self, rows: torch.Tensor, tiles: torch.Tensor) -> None:
        """Mirrors scorch(tile): pillage an improved, unpillaged tile.
        Setting pillaged is idempotent, so duplicate (row, tile) pairs are
        harmless."""
        ok = (self.improvement[rows, tiles] >= 0) & ~self.pillaged[rows, tiles]
        self.pillaged[rows[ok], tiles[ok]] = True

    def _pick_static(self, mask_hit: torch.Tensor, cand_list: tuple[torch.Tensor, torch.Tensor]) -> tuple[torch.Tensor, torch.Tensor]:
        """Mirror of pick(): one draw where mask_hit & candidates exist;
        returns (chosen mask, tile). The candidate sets are static, so the
        k-th candidate comes from a precomputed tile-ordered list — one
        gather instead of a [B, T] cumsum."""
        idx, cnt = cand_list
        has = mask_hit & (cnt > 0)
        r = self._next_random(has)
        k = torch.floor(r * cnt.to(torch.float64)).to(torch.long)
        tile = idx.gather(1, k.clamp(min=0, max=idx.shape[1] - 1).unsqueeze(1)).squeeze(1)
        return has, tile

    def _disaster_phase(self) -> None:
        """Mirrors disasterPhase draw for draw: drought clocks tick, then a
        flood roll (+pick), one roll per volcano, a drought roll (+pick),
        and a storm roll (+pick). The lasting effects are fertility and
        drought clocks.

        Area effects are applied BATCHED: no draw in this phase reads
        fertility or the drought clocks, so deferring each event's writes
        past the remaining rolls is exact; +1-capped fertility and max()ed
        drought clocks are order-free (min(3, f+n) equals any sequence of
        capped +1s, max is commutative)."""
        B, dev = self.B, self.device
        self._eff_version += 1
        self.drought.copy_((self.drought - 1).clamp(min=0))
        every = torch.ones(B, dtype=torch.bool, device=dev)

        r = self._next_random(every)
        hit, tile = self._pick_static(r < 0.05, self._flood_list)
        if bool(hit.any()):
            rows = hit.nonzero(as_tuple=True)[0]
            self._scorch(rows, tile[rows])
            self._fertilize(rows, tile[rows])

        # Per-volcano rolls stay sequential (draw order is the contract);
        # the eruptions' neighbor fertilization batches across volcanoes.
        er_rows, er_volc = [], []
        for k in range(self.volcano_tile.shape[1]):
            volc = self.volcano_tile[:, k]
            active = volc >= 0
            if not bool(active.any()):
                continue
            rv = self._next_random(active)
            erupt = active & (rv < 0.02)
            if bool(erupt.any()):
                rows = erupt.nonzero(as_tuple=True)[0]
                er_rows.append(rows)
                er_volc.append(volc[rows])
        if er_rows:
            rows = torch.cat(er_rows)
            nb = self.neigh[torch.cat(er_volc)]  # [R, 6]
            rr6 = rows.unsqueeze(1).expand(-1, 6).reshape(-1)
            nbf = nb.reshape(-1)
            on = nbf >= 0
            self._scorch(rr6[on], nbf[on])
            self._fertilize_counted(rr6[on], nbf[on])

        r = self._next_random(every)
        hit, tile = self._pick_static(r < 0.02, self._droughtc_list)
        if bool(hit.any()):
            rows = hit.nonzero(as_tuple=True)[0]
            area = tiles_from_offsets(tile[rows], self._off2, self.W, self.H)  # [R, 19]
            M = area.shape[1]
            rrm = rows.unsqueeze(1).expand(-1, M).reshape(-1)
            af = area.reshape(-1)
            on = (af >= 0) & ~self.water[rrm, af.clamp(min=0)]
            flat = self.drought.reshape(-1)
            gi = rrm[on] * self.T + af[on]
            flat.scatter_reduce_(0, gi, torch.full_like(gi, 8), reduce="amax")

        r = self._next_random(every)
        hit, tile = self._pick_static(r < 0.04, self._land_list)
        if bool(hit.any()):
            rows = hit.nonzero(as_tuple=True)[0]
            area = tiles_from_offsets(tile[rows], self._off1, self.W, self.H)  # [R, 7]
            M = area.shape[1]
            rrm = rows.unsqueeze(1).expand(-1, M).reshape(-1)
            af = area.reshape(-1)
            valid = af >= 0
            self._scorch(rrm[valid], af[valid])  # a storm scorches its whole area
            on = valid & self.desert[rrm, af.clamp(min=0)]
            self._fertilize(rrm[on], af[on])  # ...and deposits silt on desert tiles

    def _buildable(self, include_worship: bool = False) -> torch.Tensor:
        """[B, C, NB] buildings each city could queue now: unlocked (tech), not
        already built, river gate — and for district buildings, the city owns a
        completed district of the required type and has a prerequisite building
        (mirrors availableBuildings)."""
        if self._bld_cache is not None and self._bld_cache[0] == self._eff_version:
            return self._bld_cache[1]
        rd = self.rules_dev
        B, C, NB, dev = self.B, self.C, self.NB, self.device
        unlocked = torch.where(
            rd.b_unlock.unsqueeze(0) >= 0,
            self.techs.gather(1, rd.b_unlock.clamp(min=0).unsqueeze(0).expand(B, -1)),
            torch.ones(B, NB, dtype=torch.bool, device=dev),
        )
        unlocked_civic = torch.where(
            rd.b_unlock_civic.unsqueeze(0) >= 0,
            self.civics.gather(1, rd.b_unlock_civic.clamp(min=0).unsqueeze(0).expand(B, -1)),
            torch.ones(B, NB, dtype=torch.bool, device=dev),
        )  # Temple/Amphitheater/… gate on a civic (mirrors availableBuildings' unlocks.buildings)
        unlocked = unlocked & unlocked_civic
        base = unlocked.unsqueeze(1) & ~self.buildings & (~rd.b_river.reshape(1, 1, -1) | self.river_center.unsqueeze(2))
        if not include_worship:
            # Worship buildings are faith-purchase ONLY: `queueBuilding`
            # refuses them outright, but they ARE legal for
            # `purchaseBuilding` — hence the two masks.
            base = base & ~self._b_worship.reshape(1, 1, -1)
        if self.districts_on and self._b_has_reqs:
            nD = len(self.districts_cat)
            valid = (self.district >= 0) & self.district_complete & (self.tile_seat == PLAYER_SEAT) & ~self.district_dead  # [B, T] (buildingCompletable: district DONE; captured = dead)
            ow_oh = torch.nn.functional.one_hot(self.owner.clamp(min=0), C).bool() & valid.unsqueeze(2)  # [B, T, C]
            dt_oh = torch.nn.functional.one_hot(self.district.clamp(min=0), nD).bool()  # [B, T, nD]
            has_dtype = (ow_oh.unsqueeze(3) & dt_oh.unsqueeze(2)).any(dim=1)  # [B, C, nD] city owns a district of type d
            rq = self._b_req_district  # [NB]
            district_ok = (rq < 0).reshape(1, 1, NB) | has_dtype[:, :, rq.clamp(min=0)]  # [B, C, NB]
            prereq_ok = torch.ones(B, C, NB, dtype=torch.bool, device=dev)
            for nb, reqs in enumerate(self._b_req_buildings):
                if reqs:
                    prereq_ok[:, :, nb] = self.buildings[:, :, reqs].any(dim=2)
            for nb, excl in enumerate(self._b_excl_buildings):  # exclusiveWith
                if excl:
                    prereq_ok[:, :, nb] &= ~self.buildings[:, :, excl].any(dim=2)
            base = base & district_ok & prereq_ok
        self._bld_cache = (self._eff_version, base)
        return base

    def _adj_district_count(self) -> torch.Tensor:
        """[B, T] number of adjacent COMPLETED districts — the DISTRICT
        adjacency source. Counts seat 0 city centers (center_at), specialty
        districts (self.district) and civ-seat city centers (rc_at, which
        carry tile.district='CITY_CENTER' in TS). No owner filter, mirroring
        matchesAdjacency('DISTRICT')."""
        if self._adjd_cache is not None and self._adjd_cache[0] == self._eff_version:
            return self._adjd_cache[1]
        nb = self.neigh
        nbc = nb.clamp(min=0)
        on_map = (nb >= 0).unsqueeze(0)  # [1, T, 6]
        is_d = ((self.center_at[:, nbc] >= 0) | ((self.district[:, nbc] >= 0) & self.district_complete[:, nbc]) | (self.rc_at[:, nbc] >= 0)) & on_map
        out = is_d.sum(dim=2)  # [B, T]
        self._adjd_cache = (self._eff_version, out)
        return out

    def _adj_center_count(self) -> torch.Tensor:
        """[B, T] adjacent CITY_CENTER districts (seat 0 centers + civ-seat
        centers) — the CITY_CENTER adjacency source.
        matchesAdjacency('CITY_CENTER')."""
        if self._adjc_cache is not None and self._adjc_cache[0] == self._eff_version:
            return self._adjc_cache[1]
        nb = self.neigh
        nbc = nb.clamp(min=0)
        on_map = (nb >= 0).unsqueeze(0)
        is_c = ((self.center_at[:, nbc] >= 0) | (self.rc_at[:, nbc] >= 0)) & on_map
        out = is_c.sum(dim=2)
        self._adjc_cache = (self._eff_version, out)
        return out

    def _adj_harbor_count(self) -> torch.Tensor:
        """[B, T] adjacent completed HARBOR districts — the HARBOR_DISTRICT
        source (Commercial Hub +2/harbor)."""
        if self._harbor_idx < 0:
            return torch.zeros(self.B, self.T, dtype=torch.long, device=self.device)
        if self._adjh_cache is not None and self._adjh_cache[0] == self._eff_version:
            return self._adjh_cache[1]
        nb = self.neigh
        nbc = nb.clamp(min=0)
        on_map = (nb >= 0).unsqueeze(0)
        is_h = (self.district[:, nbc] == self._harbor_idx) & self.district_complete[:, nbc] & on_map
        out = is_h.sum(dim=2)
        self._adjh_cache = (self._eff_version, out)
        return out

    def _adj_dtype_complete(self, di: int) -> torch.Tensor:
        """[B, T] bool — any adjacent COMPLETED district of type di (the
        wonder adjacentDistrict requirement; no owner filter, like
        canPlaceWonder's neighbor scan)."""
        nb = self.neigh
        nbc = nb.clamp(min=0)
        hit = (self.district[:, nbc] == di) & self.district_complete[:, nbc] & (nb >= 0).unsqueeze(0)
        return hit.any(dim=2)

    def _adj_res_live(self, ri: int) -> torch.Tensor:
        """[B, T] bool — any adjacent tile with LIVE resource ri (Stonehenge's
        stone: a stripped bonus resource is gone)."""
        nb = self.neigh
        nbc = nb.clamp(min=0)
        hit = (self.res_id[:, nbc] == ri) & ~self.res_stripped[:, nbc] & (nb >= 0).unsqueeze(0)
        return hit.any(dim=2)

    def _adopted_gov(self, civics2: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """(adopted government index [B], has_gov [B]) for a seat's researched
        civics [B, NC] — the newest unlocked government, highest tier with
        ties broken by lowest table index (effects.computeAdoption)."""
        B, dev = civics2.shape[0], self.device
        guc = self._gov_unlock_civic  # [nGov]
        gov_unlocked = torch.where(
            guc.unsqueeze(0) >= 0,
            civics2.gather(1, guc.clamp(min=0).unsqueeze(0).expand(B, -1)),
            torch.ones(B, self._ngov, dtype=torch.bool, device=dev),
        )  # [B, nGov]
        has_gov = gov_unlocked.any(dim=1)  # [B]
        score = torch.where(
            gov_unlocked,
            self._gov_tier.unsqueeze(0) * self._ngov - self._gov_arange.unsqueeze(0),
            torch.full((B, self._ngov), -(10 ** 9), dtype=torch.long, device=dev),
        )
        return score.argmax(dim=1), has_gov

    def _adopted_gov_tier(self, civics2: torch.Tensor) -> torch.Tensor:
        """[B] the adopted government's tier (0 if none) — the
        GOV_INFLUENCE_TIER lookup, which equals the government tier by
        definition (data/cityStates.ts) — added to the city-state influence
        rate exactly like cityStatePhase."""
        B = civics2.shape[0]
        if not self._ngov:
            return torch.zeros(B, dtype=torch.long, device=self.device)
        adopted, has_gov = self._adopted_gov(civics2)
        return torch.where(has_gov, self._gov_tier[adopted], torch.zeros(B, dtype=torch.long, device=self.device))

    def _gov_policy_mods(self, civics2: torch.Tensor) -> tuple[
        torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor
    ]:
        """(cityYields [B,6], capitalYields [B,6], housingAll [B], yieldMult
        [B,6], slotted-mask [B,nPol], encampmentProdMult [B],
        tilePurchaseMult [B], amenitiesAll [B], housingIfDistricts triples,
        newDeal triples) for a seat's adopted government + greedily slotted
        policies, computed from its researched civics [B, NC]. The
        effects.computeAdoption / applyGovernment twin.

        WILDCARD slots fill with the within-kind OVERFLOW in card-table order
        (TS findIndex: a card whose kind slots are full takes the first open
        W; every catalog government lists its W slots LAST, so kind-first
        matches findIndex). Every channel here is consumed by EVERY seat."""
        B = civics2.shape[0]
        dev, dt = self.device, self.dtype
        city_y = torch.zeros(B, 6, dtype=dt, device=dev)
        cap_y = torch.zeros(B, 6, dtype=dt, device=dev)
        hous_all = torch.zeros(B, dtype=dt, device=dev)
        # Flat amenities, and the two district-conditional rules as
        # (threshold, housing, amenities) triples folded over gov + slotted cards.
        amen_all = torch.zeros(B, dtype=dt, device=dev)
        hid = []   # list of (min[B], housing[B])
        nd = []    # list of (min[B], housing[B], amenities[B])
        ymult = torch.ones(B, 6, dtype=dt, device=dev)
        slotted = torch.zeros(B, self._npol, dtype=torch.bool, device=dev)
        emult = torch.ones(B, dtype=dt, device=dev)  # encampmentProdMult product (VETERANCY)
        # tilePurchaseMult, the SAME shape of channel as emult — multiplicative,
        # from the adopted government and the slotted cards.
        tpmult = torch.ones(B, dtype=dt, device=dev)
        if not self._gov_has_effects or not self._ngov:
            return city_y, cap_y, hous_all, ymult, slotted, emult, tpmult, amen_all, hid, nd
        adopted, has_gov = self._adopted_gov(civics2)
        gmask = has_gov.to(dt).unsqueeze(1)
        city_y = city_y + self._gov_city_y[adopted] * gmask
        cap_y = cap_y + self._gov_cap_y[adopted] * gmask
        amen_all = amen_all + self._gov_amen[adopted] * has_gov.to(dt)
        _neg0 = torch.full((B,), -1, dtype=torch.long, device=dev)
        _z0 = torch.zeros(B, dtype=dt, device=dev)
        hid.append((torch.where(has_gov, self._gov_hid_min[adopted], _neg0),
                    torch.where(has_gov, self._gov_hid_house[adopted], _z0)))
        nd.append((torch.where(has_gov, self._gov_nd_min[adopted], _neg0),
                   torch.where(has_gov, self._gov_nd_house[adopted], _z0),
                   torch.where(has_gov, self._gov_nd_amen[adopted], _z0)))
        hous_all = hous_all + self._gov_housing[adopted] * has_gov.to(dt)
        ymult = torch.where(has_gov.unsqueeze(1), self._gov_ymult[adopted], ymult)
        emult = torch.where(has_gov, self._gov_encamp[adopted], emult)
        tpmult = torch.where(has_gov, self._gov_tpmult[adopted], tpmult)
        if self._npol:
            nslots = self._gov_slots[adopted] * has_gov.long().unsqueeze(1)  # [B, 4]
            puc = self._pol_unlock_civic  # [nPol]
            pol_unlocked = torch.where(
                puc.unsqueeze(0) >= 0,
                civics2.gather(1, puc.clamp(min=0).unsqueeze(0).expand(B, -1)),
                torch.zeros(B, self._npol, dtype=torch.bool, device=dev),
            )  # [B, nPol]
            for k in range(3):  # military/economic/diplomatic
                uk = pol_unlocked & (self._pol_kind == k).unsqueeze(0)  # [B, nPol]
                cum = uk.long().cumsum(dim=1)  # inclusive rank among unlocked-of-kind, table order
                slotted = slotted | (uk & (cum <= nslots[:, k : k + 1]))
            # Wildcard: unlocked cards whose kind slots are full spill into W
            # slots in table order, up to the W count.
            overflow = pol_unlocked & ~slotted
            w_rank = overflow.long().cumsum(dim=1)
            slotted = slotted | (overflow & (w_rank <= nslots[:, 3:4]))
            sd = slotted.to(dt)
            city_y = city_y + sd @ self._pol_city_y
            cap_y = cap_y + sd @ self._pol_cap_y
            hous_all = hous_all + sd @ self._pol_housing
            amen_all = amen_all + sd @ self._pol_amen
            for _pi in range(self._npol):
                _on = slotted[:, _pi]
                if not bool(_on.any()):
                    continue
                _neg = torch.full((B,), -1, dtype=torch.long, device=dev)
                _z = torch.zeros(B, dtype=dt, device=dev)
                hid.append((torch.where(_on, self._pol_hid_min[_pi].expand(B), _neg),
                            torch.where(_on, self._pol_hid_house[_pi].expand(B), _z)))
                nd.append((torch.where(_on, self._pol_nd_min[_pi].expand(B), _neg),
                           torch.where(_on, self._pol_nd_house[_pi].expand(B), _z),
                           torch.where(_on, self._pol_nd_amen[_pi].expand(B), _z)))
            # Multiplicative product over slotted cards
            # (mods.encampmentProdMult *= fx — only VETERANCY carries it).
            emult = emult * torch.where(slotted, self._pol_encamp.unsqueeze(0).expand(B, -1), torch.ones(B, self._npol, dtype=dt, device=dev)).prod(dim=1)
            # `mods.tilePurchaseMult *= fx` — the same multiplicative fold,
            # over the same slotted mask.
            tpmult = tpmult * torch.where(slotted, self._pol_tpmult.unsqueeze(0).expand(B, -1), torch.ones(B, self._npol, dtype=dt, device=dev)).prod(dim=1)
        return city_y, cap_y, hous_all, ymult, slotted, emult, tpmult, amen_all, hid, nd

    def _cond_house_amen(self, hid, nd, all_d, spec_d):
        """The two district-conditional rules, for ANY seat.

        `housingIfDistricts` keys on ALL completed non-centre districts;
        `newDeal` keys on SPECIALTY ones and pays housing AND amenities. TS
        applies both in `computeHousing`/`computeCityStats`; one rule, so one
        applier, shared by every seat's path.

        `all_d`/`spec_d` are [B, C] district counts; returns (housing, amenities)
        of the same shape."""
        house = torch.zeros_like(all_d, dtype=self.dtype)
        amen = torch.zeros_like(all_d, dtype=self.dtype)
        for mn, hs in hid:
            ok = (mn.unsqueeze(1) >= 0) & (all_d >= mn.unsqueeze(1))
            house = house + ok.to(self.dtype) * hs.unsqueeze(1)
        for mn, hs, am in nd:
            ok = (mn.unsqueeze(1) >= 0) & (spec_d >= mn.unsqueeze(1))
            house = house + ok.to(self.dtype) * hs.unsqueeze(1)
            amen = amen + ok.to(self.dtype) * am.unsqueeze(1)
        return house, amen

    def _gov_policy_mods_cached(self, seat_tag, civics2: torch.Tensor):
        """(seat_tag, _eff_version)-keyed wrapper over _gov_policy_mods. The
        only mutable input is civics2 (a seat's researched civics) and every
        civic completion bumps _eff_version, so the eff epoch is a complete
        key. seat_tag is 'p' for seat 0 or the civ index — the tag is the key,
        the tensor is never hashed. Consumers only READ the returned tuple, so
        sharing one object across the per-city loop is safe."""
        if self._gov_pol_cache is None or self._gov_pol_cache[0] != self._eff_version:
            self._gov_pol_cache = (self._eff_version, {})
        d = self._gov_pol_cache[1]
        v = d.get(seat_tag)
        if v is None:
            v = self._gov_policy_mods(civics2)
            d[seat_tag] = v
        return v

    def _district_adj_raw(self, di: int, adjc: torch.Tensor) -> torch.Tensor:
        """[B, T] UNFLOORED districtAdjacency for district di: static (d_static_adj)
        + 0.5·adjacent-districts + CITY_CENTER·adjacent-centers + HARBOR_DISTRICT·
        adjacent-harbors. Callers floor it. The center is counted BOTH by the
        DISTRICT source (in adjc) and by CITY_CENTER — e.g. Harbor gets +2.5/center."""
        raw = self.d_static_adj[:, :, di] + self._dyn_district[di] * adjc  # catalog-driven per-district rate
        if float(self._dyn_bwonder[di]) != 0:
            # Theater Square: +per adjacent COMPLETED world wonder.
            nbw = self.neigh
            nbwc = nbw.clamp(min=0)
            cntw = ((self.built_wonder[:, nbwc] >= 0) & self.built_wonder_complete[:, nbwc] & (nbw >= 0).unsqueeze(0)).sum(dim=2)
            raw = raw + self._dyn_bwonder[di] * cntw.to(self.dtype)
        if float(self._dyn_center[di]) != 0:
            raw = raw + self._dyn_center[di] * self._adj_center_count().to(self.dtype)
        if float(self._dyn_harbor[di]) != 0:
            raw = raw + self._dyn_harbor[di] * self._adj_harbor_count().to(self.dtype)
        # Industrial Zone: adjacent MINE/QUARRY improvements + adjacent
        # completed AQUEDUCT. The amounts are nonzero for that type only.
        if float(self._dyn_mine[di]) != 0 or float(self._dyn_quarry[di]) != 0 or float(self._dyn_aqueduct[di]) != 0:
            nb = self.neigh
            nbc = nb.clamp(min=0)
            on_map = (nb >= 0).unsqueeze(0)
            if float(self._dyn_mine[di]) != 0:
                cnt = ((self.improvement[:, nbc] == self._mine_iidx) & on_map).sum(dim=2)
                raw = raw + self._dyn_mine[di] * cnt.to(self.dtype)
            if float(self._dyn_quarry[di]) != 0:
                cnt = ((self.improvement[:, nbc] == self._quarry_iidx) & on_map).sum(dim=2)
                raw = raw + self._dyn_quarry[di] * cnt.to(self.dtype)
            if float(self._dyn_aqueduct[di]) != 0 and self._aqueduct_idx >= 0:
                cnt = ((self.district[:, nbc] == self._aqueduct_idx) & self.district_complete[:, nbc] & on_map).sum(dim=2)
                raw = raw + self._dyn_aqueduct[di] * cnt.to(self.dtype)
        return raw

    def _district_adj_floor(self, di: int) -> torch.Tensor:
        """(di, _eff_version)-keyed memo of floor(_district_adj_raw(di,
        _adj_district_count())) — the expression every caller needs. Sound
        because d_static_adj's in-place mutation sites all bump _eff_version,
        the three adjacency-count helpers are eff-cached, and the
        improvement/district planes bump eff at their mutation sites. Callers
        only gather/multiply the returned plane — read-only sharing."""
        if self._dadj_cache is None or self._dadj_cache[0] != self._eff_version:
            self._dadj_cache = (self._eff_version, {})
        d = self._dadj_cache[1]
        v = d.get(di)
        if v is None:
            v = torch.floor(self._district_adj_raw(di, self._adj_district_count().to(self.dtype)))
            d[di] = v
        return v

    def _place_district(self, di: int, want: torch.Tensor, c: int, placement: int = 0) -> tuple[torch.Tensor, torch.Tensor]:
        """QUEUE district-type `di` in seat 0's city slot `c` on its best tile,
        for batch rows where `want` is set AND an eligible tile exists.
        Best-tile scan: eligible = owned by city c, district-placeable, empty
        (no district/improvement), no LUXURY/STRATEGIC resource (bonus tiles
        ARE pickable and the pave strips the resource), within radius 3, not
        the center; ranked by floor(static + 0.5·adjacent-completed-districts),
        ties to lowest tile index. placement=1 (Aqueduct): adjacent-center +
        water source; placement=3 (Encampment): NOT adjacent-center.
        queueDistrict semantics — the tile is paved INCOMPLETE and its feature
        stripped (tile.feature = null); completion arrives via the production
        loop. Recomputes adjacency each call, so placing city-by-city in slot
        order reproduces the sequential per-city loop. Returns ([B] placed,
        [B] tile)."""
        B, T, dev = self.B, self.T, self.device
        site_c = self.site[:, c].clamp(min=0)
        surface = self.coastal_water if placement == 2 else self.d_usable  # Harbor sits on coastal water, others on land
        elig = ((self.owner == c) & surface & (self.district < 0) & (self.built_wonder < 0) & (self.improvement < 0) & (self.res_priority <= 1) & (self.dist[:, c] <= 3))
        elig[torch.arange(B, device=dev), site_c] = False
        if placement in (1, 3):  # no-adjacency-yield districts (Aqueduct / Encampment)
            cc = self._adj_center_count()  # [B, T] adjacent CITY_CENTERs (any seat) — the requires/notAdjacentToCityCenter tests
            elig = elig & ((cc >= 1) & self.aqsrc if placement == 1 else (cc == 0))  # Aqueduct: adjacent-center+water; Encampment: NOT adjacent-center
            adjf = torch.zeros(B, T, dtype=self.dtype, device=dev)  # no yield → lowest-index tie-break
        else:  # economic (land) or Harbor (coastal) — full districtAdjacency
            adjf = self._district_adj_floor(di)  # [B, T] (memoised)
        key = torch.where(elig, adjf * T - self._arangeT_f, self._neg_f)
        best = key.argmax(dim=1)  # [B]
        place = want & elig.any(dim=1)
        if bool(place.any()):
            rows = place.nonzero(as_tuple=True)[0]
            bt = best[rows]
            self.district[rows, bt] = di
            self.district_complete[rows, bt] = False  # queued, not complete
            self._strip_feature_at(rows, bt)  # queueDistrict: tile.feature = null
            # queueDistrict removes a bonus resource (only priority-1 tiles
            # carrying a resource are eligible at all); a FRESH sea strip
            # withdraws its lent SEA_RESOURCE adjacency
            fresh_rs = (self.res_priority[rows, bt] == 1) & ~self.res_stripped[rows, bt]
            self.res_stripped[rows, bt] = self.res_stripped[rows, bt] | (self.res_priority[rows, bt] == 1)
            self._withdraw_sea_adj(rows[fresh_rs], bt[fresh_rs])
            self._eff_version += 1
        return place, best

    def _district_elig_civ(self, r: int, j: int, di: int, placement: int = 0):
        """[B, T] eligible tiles (and the adjacency floor) for placing district
        `di` in civ r's city slot j.

        `seat_masks` asks "can this district be placed AT ALL" without placing
        it, so the mask and `_place_district_civ` MUST share this predicate:
        anything the mask decides without running the scan can report a
        district legal where the placer rejects it.
        """
        B, T, dev = self.B, self.T, self.device
        center = self.rc_center[:, r, j].clamp(min=0)
        surface = self.coastal_water if placement == 2 else self.d_usable
        d_center = self.pair_dist[center]  # [B, T]
        elig = (
            (self.civ_at == r)
            & (self.tile_city == self.rc_id[:, r, j].unsqueeze(1))  # THIS city's registry, not merely civ-owned
            & surface
            & (self.district < 0)
            & (self.built_wonder < 0)
            & (self.rc_at < 0)  # sibling centers carry district='CITY_CENTER' in TS
            & (self.improvement < 0)
            & (d_center <= 3)
        )
        # No clone: the `&` chain above already returns a fresh tensor nothing
        # else references, and this runs per district type per city per civ
        # per turn on the scripted hot path.
        elig[torch.arange(B, device=dev), center] = False
        if placement in (1, 3):
            cc = self._adj_center_count()
            elig = elig & ((cc >= 1) & self.aqsrc if placement == 1 else (cc == 0))
            adjf = torch.zeros(B, T, dtype=self.dtype, device=dev)
        else:
            adjf = self._district_adj_floor(di)  # (memoised)
        return elig, adjf

    def _place_district_civ(self, r: int, j: int, di: int, want: torch.Tensor, placement: int = 0) -> torch.Tensor:
        """The civ-seat twin of _place_district — same rank (best
        floor(static + 0.5·adjacent-completed), ties lowest tile index), civ
        eligibility (civ-owned via civ_at, district-usable, empty,
        unimproved, within radius 3 of THIS city's center, not the center) —
        and it QUEUES rather than completes: tile paved (district set,
        complete stays False), rc_qtile remembers the completion target, the
        per-city registry gains the type. Returns the placed mask."""
        elig, adjf = self._district_elig_civ(r, j, di, placement)
        T = self.T
        key = torch.where(elig, adjf * T - self._arangeT_f, self._neg_f)
        best = key.argmax(dim=1)
        place = want & elig.any(dim=1)
        if bool(place.any()):
            rows = place.nonzero(as_tuple=True)[0]
            self.district[rows, best[rows]] = di
            self.rc_qtile[rows, r, j] = best[rows]
            self.rc_dist_tile[rows, r, j, di] = best[rows]
            self.improvement[rows, best[rows]] = -1  # queueDistrict clears it
            # The civ-seat pave strips a bonus resource too (queueDistrict's
            # rule); fresh sea strips withdraw their lent SEA_RESOURCE
            # adjacency
            bt_r = best[rows]
            fresh_rs = (self.res_priority[rows, bt_r] == 1) & ~self.res_stripped[rows, bt_r]
            self.res_stripped[rows, bt_r] = self.res_stripped[rows, bt_r] | (self.res_priority[rows, bt_r] == 1)
            self._withdraw_sea_adj(rows[fresh_rs], bt_r[fresh_rs])
            self._eff_version += 1
        return place

    def _place_player_works(self, can_col: torch.Tensor, culture_val: torch.Tensor, kind: int) -> None:
        """placeGreatWorks for seat 0: distribute gwWorks works per earning
        game across seat 0's cities in state.cities order (city_seq rank),
        lowest slot first, into the AMPHITHEATER (writing) or kind's building
        column at that kind's slot count. Charges that find no open slot
        anywhere overflow to the person's instant culture lump on the current
        civic. Every slot write bumps _eff_version (yield-bearing)."""
        bcol, nslots, nworks = self._gw_bidx[kind], self._gw_slots_k[kind], self._gw_works_k[kind]
        if bcol < 0:  # building absent from the catalog: every charge overflows
            self.civic_prog.add_(can_col.to(self.dtype) * nworks * culture_val)
            return
        used = (self.gw_writing, self.gw_art, self.gw_music)[kind]  # [B, C]
        cap = self.buildings[:, :, bcol].long() * nslots  # [B, C] (a city holds 1 such building max)
        # Plus slots granted by COMPLETED WONDERS (Great Library +2 writing),
        # mirroring greatPeople.ts's `extra` resolver. Seat 0's wonders have no
        # per-city registry the way the civ seats' do, so they attribute by
        # TILE OWNERSHIP — which is also what makes capture carry them.
        if getattr(self, "_wond_gw", None) is not None and int(self._wond_gw[:, kind].sum()) > 0:
            wsl = self._wond_gw[:, kind]  # [nW]
            live_w = (self.built_wonder >= 0) & self.built_wonder_complete  # [B, T]
            tile_sl = torch.where(live_w, wsl[self.built_wonder.clamp(min=0)], torch.zeros_like(self.built_wonder))
            for c in range(self.C):
                cap[:, c] = cap[:, c] + (tile_sl * (self.owner == c).long()).sum(dim=1)
        openc = (cap - used).clamp(min=0) * self.alive.long()  # [B, C] open slots per live city
        W = nworks * can_col.long()  # [B] works to place this earn
        # state.cities array order = city_seq rank (acquisition order).
        ordv = torch.argsort(torch.where(self.alive, self.city_seq, self.city_seq + 10**6), dim=1, stable=True)
        open_ord = openc.gather(1, ordv)  # [B, C] open slots in visit order
        prefix = open_ord.cumsum(dim=1) - open_ord  # exclusive: slots filled before this city
        alloc_ord = (W.unsqueeze(1) - prefix).clamp(min=0).minimum(open_ord)  # greedy lowest-first fill
        alloc = torch.zeros_like(openc).scatter(1, ordv, alloc_ord)  # back to city index
        overflow = (W - alloc_ord.sum(dim=1)).clamp(min=0)  # [B] charges with no slot
        if kind == 0:
            self.gw_writing.add_(alloc)
        elif kind == 1:
            self.gw_art.add_(alloc)
        else:
            self.gw_music.add_(alloc)
        self.civic_prog.add_(overflow.to(self.dtype) * culture_val)
        if bool((alloc != 0).any()):
            self._eff_version += 1

    def _place_civ_works(self, r: int, hit: torch.Tensor, culture_val: torch.Tensor, kind: int) -> None:
        """placeGreatWorks for civ seat r: distribute gwWorks works across its
        cities in rc slot order (= the seat's cities array order), lowest slot
        first; overflow charges fall back to the instant culture lump on this
        seat's civic progress. Every slot write bumps _eff_version."""
        bcol, nslots, nworks = self._gw_bidx[kind], self._gw_slots_k[kind], self._gw_works_k[kind]
        if bcol < 0:
            self.r_civic_prog[:, r] = self.r_civic_prog[:, r] + hit.double() * nworks * culture_val
            return
        used = (self.rc_gw_writing, self.rc_gw_art, self.rc_gw_music)[kind][:, r]  # [B, RC]
        cap = self.rc_bldg[:, r, :, bcol].long() * nslots  # [B, RC]
        # Plus COMPLETED-WONDER slots, the civ-seat twin of the seat-0 term.
        # Civ seats DO carry a per-city wonder registry, so this reads
        # rc_wonder directly instead of going via tile ownership — the same
        # source and completeness test the Petra block uses.
        if getattr(self, "_wond_gw", None) is not None and int(self._wond_gw[:, kind].sum()) > 0:
            wreg = self.rc_wonder[:, r]  # [B, RC, nW]
            compw = (wreg >= 0) & self.built_wonder_complete.gather(
                1, wreg.clamp(min=0).reshape(self.B, -1)
            ).reshape_as(wreg)
            cap = cap + (compw.long() * self._wond_gw[:, kind].reshape(1, 1, -1)).sum(dim=2)
        openc = (cap - used).clamp(min=0) * self.rc_alive[:, r].long()  # [B, RC]
        W = nworks * hit.long()  # [B]
        prefix = openc.cumsum(dim=1) - openc  # exclusive prefix in slot order
        alloc = (W.unsqueeze(1) - prefix).clamp(min=0).minimum(openc)  # [B, RC]
        overflow = (W - alloc.sum(dim=1)).clamp(min=0)  # [B]
        if kind == 0:
            self.rc_gw_writing[:, r] = self.rc_gw_writing[:, r] + alloc
        elif kind == 1:
            self.rc_gw_art[:, r] = self.rc_gw_art[:, r] + alloc
        else:
            self.rc_gw_music[:, r] = self.rc_gw_music[:, r] + alloc
        self.r_civic_prog[:, r] = self.r_civic_prog[:, r] + overflow.double() * culture_val
        if bool((alloc != 0).any()):
            self._eff_version += 1

    def _advance_player_great_people(self) -> None:
        """advanceGreatPeople for seat 0 (runs after research, after seatPhase
        has claimed): each class accrues 1 + (its district's built buildings)
        per city owning a completed district of its type, earns the n-th person
        at gp_costs[n] from the shared gp_earned pool, and applies its effect —
        science→current tech, culture→current civic, gold→treasury,
        production→capital build head. Only Campus/Holy Site/Commercial Hub are
        placeable, so only Scientist/Prophet/Merchant ever accrue."""
        if not self.districts_on or self._gp_nc == 0:
            return
        B, C, dev, nCls = self.B, self.C, self.device, self._gp_nc
        owner_oh = torch.nn.functional.one_hot(self.owner.clamp(min=0), C).bool() & (self.tile_seat == PLAYER_SEAT).unsqueeze(2)  # [B,T,C]
        for cls in range(nCls):
            d = int(self._gp_class_district[cls])
            if d < 0:
                continue
            has_d = (((self.district == d) & self.district_complete & ~self.district_dead & ~self.district_pillaged).unsqueeze(2) & owner_oh).any(dim=1)  # [B,C] city owns a completed LIVE district d (pillaged earns no GPP)
            in_d = self._b_req_district == d  # [NB] buildings of district d
            bcount = self.buildings[:, :, in_d].to(self.dtype).sum(dim=2)  # [B,C]
            self.player_gp_points[:, cls] = self.player_gp_points[:, cls] + (has_d.to(self.dtype) * (1.0 + bcount)).sum(dim=1)
        # Golden EXODUS — +4 Great PROPHET points per turn, empire-wide.
        if 0 <= self._prophet_cls < self._gp_nc:
            _ex = self._golden_ded(0, self._ded_exodus)
            self.player_gp_points[:, self._prophet_cls] = (
                self.player_gp_points[:, self._prophet_cls] + _ex.to(self.dtype) * 4.0
            )
        maxN = self._gp_effects.shape[1]
        for _ in range(maxN):  # usually one earn per class per turn; loop covers the roster
            earned = self.gp_earned[:, :nCls]
            cost = self._gp_costs[earned.clamp(max=self._gp_costs.shape[0] - 1)]  # [B,nCls] gpCost(earned)
            can = (earned < self._gp_roster[:nCls].unsqueeze(0)) & (self.player_gp_points >= cost)
            if not bool(can.any()):
                break
            eff = self._gp_effects[torch.arange(nCls, device=dev).reshape(1, nCls), earned.clamp(max=maxN - 1)]  # [B,nCls,5] (col 4 = faith)
            cf = can.to(self.dtype)
            # WRITER/MUSICIAN culture is slotted as Great Works (deferred
            # +2/turn), not applied instantly — mask those columns out of the
            # standard civic add; _place_player_works handles their slot fill +
            # overflow lump below.
            cf_cult = cf.clone()
            for _kcls in self._gw_cls:  # WRITER / ARTIST / MUSICIAN
                if _kcls >= 0:
                    cf_cult[:, _kcls] = 0
            self.tech_prog.add_((eff[:, :, 0] * cf).sum(dim=1))  # science → current tech (banks for next turn)
            self.civic_prog.add_((eff[:, :, 1] * cf_cult).sum(dim=1))  # culture → current civic (W/M slotted)
            self.treasury.add_((eff[:, :, 2] * cf).sum(dim=1))  # gold → treasury
            if self._gp_effects.shape[2] > 4:  # faith → seat 0's faith bank (mirrors the civ loop)
                self.player_faith.add_((eff[:, :, 4].double() * cf.double()).sum(dim=1))
            prod = (eff[:, :, 3] * cf).sum(dim=1)  # production → capital's current build head
            # applyGreatPersonEffect resolves the capital as
            # `state.cities.find((c) => c.isCapital)` — the FLAG, not the array
            # head. A razed capital leaves column 0 dead while the Palace moves
            # to the highest-pop survivor, so column 0 is not the capital.
            _cap_col = self.is_cap.long().argmax(dim=1)  # [B]; at most one flag
            _cap_live = self.is_cap.any(dim=1) & self.alive.gather(1, _cap_col.unsqueeze(1)).squeeze(1)
            if bool((prod != 0).any()):
                has_build = _cap_live & (self.current.gather(1, _cap_col.unsqueeze(1)).squeeze(1) >= 0)
                if bool(has_build.any()):
                    _hb = has_build.nonzero(as_tuple=True)[0]
                    self.progress[_hb, _cap_col[_hb]] = self.progress[_hb, _cap_col[_hb]] + prod[_hb]
                # With no build queued the lump BANKS rather than vanishing,
                # matching game.ts.
                _nb = (_cap_live & ~has_build).nonzero(as_tuple=True)[0]
                if len(_nb) > 0:
                    self.prod_bank[_nb, _cap_col[_nb]] = self.prod_bank[_nb, _cap_col[_nb]] + prod[_nb]
            self.player_gp_points.sub_(cost * cf)
            self.gp_earned[:, :nCls] = earned + can.long()
            self.era_score[:, 0] += can.long().sum(dim=1) * self._era_pts["gp"]  # per GP earned
            # Slot the earned WRITER/MUSICIAN's Great Works into seat 0's
            # cities (eff holds the pre-increment person's culture).
            for _k, _kcls in enumerate(self._gw_cls):  # kind order 0/1/2
                if _kcls >= 0:
                    self._place_player_works(can[:, _kcls], eff[:, _kcls, 1], _k)
            # A GENERAL/ADMIRAL claim spawns its support unit (civilian, 4 MP)
            # at seat 0's CAPITAL, on top of the instant effect — the
            # applyGreatPersonEffect mirror. Zero RNG. The capital is `is_cap`,
            # not column 0 (see above).
            for guidx, gcls in ((self._general_unit_idx, self._general_cls), (self._admiral_unit_idx, self._admiral_cls)):
                if guidx >= 0 and 0 <= gcls < nCls:
                    sm = can[:, gcls] & _cap_live  # TS: spawn only if a capital exists
                    if bool(sm.any()):
                        cap_site = self.site.gather(1, _cap_col.unsqueeze(1)).squeeze(1)
                        self._spawn_player(sm, cap_site, torch.full((B,), guidx, dtype=torch.long, device=dev))
                        self._gen_ver += 1

    def _spread_religious_pressure(self) -> None:
        """The spreadReligiousPressure twin: each founded religion's HOLY tile
        (holy_tile[:, g], the founding capital center, frozen) adds +1 integer
        pressure to every LIVE city within range; each city then follows the
        religion with the most pressure (>0), ties to the lowest id (argmax
        returns the first max). Religions are the unified civ ids: g=0 is
        seat 0, g=i+1 is civ index i. Deterministic, zero-RNG.

        KILL hygiene: dead/absent slots are zeroed each turn (torch.where on the
        alive mask), so a razed-then-reused slot starts fresh — the TS mirror is
        the fresh City object a founded/flipped city gets. cty_pressure/cty_followed
        permute with their city in _reclaim_rc, so pressure tracks the CITY, not
        the slot, through compaction."""
        B, O = self.B, self._O
        # Itinerant Preachers: per-religion range — base + the religion's
        # claimed enhancer's presR. Religion 0 (seat 0) keeps the base: no
        # founding path assigns it an enhancer.
        RANGE = torch.full((B, O), int(self._pressure_range), dtype=torch.long, device=self.device)
        if self.R > 0 and self._enh_any:
            RANGE[:, 1 : 1 + self.R] += self._enh["presR"][self.r_enhancer + 1].long()
        founded = self.holy_tile >= 0  # [B, O]
        ht = self.holy_tile.clamp(min=0)  # [B, O] valid tile idx (masked where unfounded)
        # ONE flip for every seat.
        NSC = 1 + max(self.R, 0)
        cen = self.cty_center[:, :NSC].clamp(min=0)                     # [B, NSC, RC]
        d_all = self.pair_dist[cen.unsqueeze(3), ht.reshape(B, 1, 1, O)].to(torch.long)
        liv = self.cty_alive[:, :NSC]                                    # [B, NSC, RC]
        add = (d_all <= RANGE.reshape(B, 1, 1, O)) & founded.reshape(B, 1, 1, O) & liv.unsqueeze(3)
        self.cty_pressure[:, :NSC].copy_(
            torch.where(liv.unsqueeze(3), self.cty_pressure[:, :NSC] + add.long(), torch.zeros_like(self.cty_pressure[:, :NSC]))
        )
        tot = self.cty_pressure[:, :NSC].sum(dim=3)
        best = self.cty_pressure[:, :NSC].argmax(dim=3)                  # ties -> lowest id
        # EXODUS pays era score each time a city CONVERTS; compare against the
        # PRE-flip follow set, exactly like `wasFollowed`.
        was = self.cty_followed[:, :NSC].clone()
        self.cty_followed[:, :NSC].copy_(torch.where(liv & (tot > 0), best, torch.full_like(best, -1)))
        for _g in range(self._O):
            _conv = (self.cty_followed[:, :NSC] == _g) & (was != _g) & liv
            if bool(_conv.any()):
                self._dedication_event(_g, 3, _conv.reshape(B, -1).sum(dim=1))  # per CITY

    def _rel_combat_planes(self) -> tuple[torch.Tensor, torch.Tensor]:
        """(near3, terr) — [B, O, T] bool planes for the enhancer combat
        adders. terr[b, g, t] = tile t is OWNED by a city following religion g
        (seat 0 tiles via the owner slot plane; civ-seat tiles via the id-keyed
        registry). near3[b, g, t] = some city following g has its CENTER within
        justWarRange of t. Keyed (turn, _eff_version):
        followedReligion moves once per turn (_spread_religious_pressure) and
        every city-set/ownership change (founding, capture, transfer, claim,
        compaction) bumps _eff_version — so the keyed cache IS the TS live
        read within a turn."""
        key = (self.turn, self._eff_version)
        if self._rel_planes_cache is not None and self._rel_planes_cache[0] == key:
            return self._rel_planes_cache[1]
        B, T, O = self.B, self.T, self._O
        dev = self.device
        # per-tile followed religion of the OWNING city (-1 none)
        tfol = torch.full((B, T), -1, dtype=torch.long, device=dev)
        pf = self.cty_followed[:, 0, :self.C].gather(1, self.owner.clamp(min=0))  # [B, T]
        tfol = torch.where((self.tile_seat == PLAYER_SEAT) & self.alive.gather(1, self.owner.clamp(min=0)), pf, tfol)
        if self.R > 0:
            for r in range(self.R):
                for j in range(self.RC):
                    if not bool(self.rc_alive[:, r, j].any()):
                        continue
                    ring = (self.civ_at == r) & (self.tile_city == self.rc_id[:, r, j].unsqueeze(1)) & self.rc_alive[:, r, j].unsqueeze(1)
                    tfol = torch.where(ring, self.cty_followed[:, r + 1, j].unsqueeze(1).expand(B, T), tfol)
        terr = tfol.unsqueeze(1) == torch.arange(O, device=dev).reshape(1, O, 1)  # [B, O, T]
        # near3: dilate FOLLOWING city centers by justWarRange (scatter_add
        # then >0 — a masked bool scatter would clobber tile 0 via the clamp)
        near3 = torch.zeros(B, O, T, dtype=torch.bool, device=dev)
        off3 = tiles_within_offsets(self._just_war_range).to(dev)
        pc_win = tiles_from_offsets(self.site.clamp(min=0).reshape(-1), off3, self.W, self.H).reshape(B, self.C, -1)  # [B, C, M]
        rc_win = None
        if self.R > 0:
            rc_win = tiles_from_offsets(self.rc_center.clamp(min=0).reshape(-1), off3, self.W, self.H).reshape(B, self.R * self.RC, -1)
        for g in range(O):
            srci = torch.zeros(B, T, dtype=torch.long, device=dev)
            fol_c = self.alive & (self.cty_followed[:, 0, :self.C] == g)  # [B, C]
            if bool(fol_c.any()):
                w = torch.where(fol_c.unsqueeze(2), pc_win, torch.full_like(pc_win, -1)).reshape(B, -1)
                srci.scatter_add_(1, w.clamp(min=0), (w >= 0).long())
            if self.R > 0:
                fol_rc = self.rc_alive & (self.cty_followed[:, 1:1 + self.R] == g)  # [B, R, RC]
                if bool(fol_rc.any()):
                    wr = torch.where(fol_rc.reshape(B, -1).unsqueeze(2), rc_win, torch.full_like(rc_win, -1)).reshape(B, -1)
                    srci.scatter_add_(1, wr.clamp(min=0), (wr >= 0).long())
            near3[:, g] = srci > 0
        out = (near3, terr)
        self._rel_planes_cache = (key, out)
        return out

    def _rel_atk_cs(self, civ_r: torch.Tensor, battle_tile: torch.Tensor) -> torch.Tensor:
        """Enhancer ATTACKER adders (Just War near + Crusade onto
        following-city territory) for units of civ index civ_r ([B], -1 =
        barbarian/none). Seat 0's units carry no religion — holy_tile[:, 0] is
        never set — so the seat-0 term is structurally 0 and omitted at the
        call sites. Returns f64 [B]."""
        if not self._enh_combat_any or self.R == 0 or not bool((self.r_enhancer >= 0).any()):
            return torch.zeros(self.B, dtype=torch.float64, device=self.device)
        cr = civ_r.clamp(min=0, max=self.R - 1)
        has = (civ_r >= 0) & self.r_religion_done.gather(1, cr.unsqueeze(1)).squeeze(1)
        eidx = self.r_enhancer.gather(1, cr.unsqueeze(1)).squeeze(1) + 1  # [B] 0 = pad
        eidx = torch.where(has, eidx, torch.zeros_like(eidx))
        g = (cr + 1).unsqueeze(1)  # religion id [B, 1]
        near3, terr = self._rel_combat_planes()
        bt = battle_tile.clamp(min=0).unsqueeze(1)
        nr = near3.gather(1, g.unsqueeze(2).expand(-1, -1, self.T)).squeeze(1).gather(1, bt).squeeze(1)
        tr = terr.gather(1, g.unsqueeze(2).expand(-1, -1, self.T)).squeeze(1).gather(1, bt).squeeze(1)
        add = self._enh["cnear"][eidx] * nr.double() + self._enh["cvs"][eidx] * tr.double()
        return torch.where(has & (battle_tile >= 0), add, torch.zeros_like(add))

    def _rel_def_cs(self, civ_r: torch.Tensor, def_tile: torch.Tensor) -> torch.Tensor:
        """Enhancer DEFENDER adders (Just War near + Defender of the Faith on
        following-city territory) for unit defenders of civ index civ_r ([B],
        -1 = barbarian/seat 0/none). f64 [B]."""
        if not self._enh_combat_any or self.R == 0 or not bool((self.r_enhancer >= 0).any()):
            return torch.zeros(self.B, dtype=torch.float64, device=self.device)
        cr = civ_r.clamp(min=0, max=self.R - 1)
        has = (civ_r >= 0) & self.r_religion_done.gather(1, cr.unsqueeze(1)).squeeze(1)
        eidx = self.r_enhancer.gather(1, cr.unsqueeze(1)).squeeze(1) + 1
        eidx = torch.where(has, eidx, torch.zeros_like(eidx))
        g = (cr + 1).unsqueeze(1)
        near3, terr = self._rel_combat_planes()
        bt = def_tile.clamp(min=0).unsqueeze(1)
        nr = near3.gather(1, g.unsqueeze(2).expand(-1, -1, self.T)).squeeze(1).gather(1, bt).squeeze(1)
        tr = terr.gather(1, g.unsqueeze(2).expand(-1, -1, self.T)).squeeze(1).gather(1, bt).squeeze(1)
        add = self._enh["cnear"][eidx] * nr.double() + self._enh["cdef"][eidx] * tr.double()
        return torch.where(has & (def_tile >= 0), add, torch.zeros_like(add))

    def _gen_aura_planes(self):
        """Per (batch, unified-civ g, tile) booleans — land[b, g, t] = tile t
        is within gen_aura_range of a LIVE own GENERAL of seat g (g=0 seat 0,
        g=r+1 civ index r); sea[b, g, t] the same for ADMIRALs.

        General positions move mid-turn and change on spawn/kill/capture, none
        of which bump _eff_version, so the cache keys on (turn, _gen_ver, a
        general POSITION fingerprint). The fingerprint is load-bearing: besides
        the _gen_ver-bumped sites (spawn/civ-walk/kill/capture/restore) a
        general is also moved by the MOVE verb in _apply_unit_actions, which
        does NOT bump _gen_ver — keying on _gen_ver alone goes stale mid-apply.
        The weighted tile/pool/type sum changes on ANY general move, kill,
        capture or spawn, so the cache is exact regardless of the mover.

        Returns None when no General/Admiral is alive anywhere (structural 0;
        call sites skip the gather). Dilation mirrors
        _rel_combat_planes.near3 (scatter_add of longs then >0)."""
        B, T, O, dev = self.B, self.T, self._O, self.device
        gi, ai = self._general_unit_idx, self._admiral_unit_idx
        p_g = self.p_alive & (self.p_type == gi) if gi >= 0 else torch.zeros(B, simbase.P_MAX, dtype=torch.bool, device=dev)
        p_a = self.p_alive & (self.p_type == ai) if ai >= 0 else torch.zeros(B, simbase.P_MAX, dtype=torch.bool, device=dev)
        v_g = self.v_alive & (self.v_type == gi) if gi >= 0 else torch.zeros(B, simbase.U_MAX, dtype=torch.bool, device=dev)
        v_a = self.v_alive & (self.v_type == ai) if ai >= 0 else torch.zeros(B, simbase.U_MAX, dtype=torch.bool, device=dev)
        present = bool(p_g.any()) or bool(p_a.any()) or bool(v_g.any()) or bool(v_a.any())
        if present:
            arp = torch.arange(1, p_g.shape[1] + 1, device=dev)
            arv = torch.arange(1, v_g.shape[1] + 1, device=dev)
            # Tile (+1 so tile 0 counts), pool (p vs v via distinct base mults),
            # type (general vs admiral via ×3) and slot — a swap or a same-tile
            # pool transfer (capture) still changes the sum.
            p_fp = int((((self.p_tile + 1) * (1 + 2 * p_a.long()) * arp) * (p_g | p_a).long()).sum())
            v_fp = int((((self.v_tile + 1) * (1 + 2 * v_a.long()) * arv) * (v_g | v_a).long()).sum())
            fp = p_fp * 100003 + v_fp + int((p_g | p_a).sum()) * 31 + int((v_g | v_a).sum())
        else:
            fp = 0
        key = (self.turn, self._gen_ver, fp)
        if self._gen_aura_cache is not None and self._gen_aura_cache[0] == key:
            return self._gen_aura_cache[1]
        if not present:
            self._gen_aura_cache = (key, None)
            return None
        off = self._gen_off
        land = torch.zeros(B, O, T, dtype=torch.bool, device=dev)
        sea = torch.zeros(B, O, T, dtype=torch.bool, device=dev)
        pwin = tiles_from_offsets(self.p_tile.clamp(min=0).reshape(-1), off, self.W, self.H).reshape(B, simbase.P_MAX, -1)
        vwin = tiles_from_offsets(self.v_tile.clamp(min=0).reshape(-1), off, self.W, self.H).reshape(B, simbase.U_MAX, -1) if self.R > 0 else None

        def dilate(mask: torch.Tensor, win: torch.Tensor) -> torch.Tensor:
            src = torch.zeros(B, T, dtype=torch.long, device=dev)
            w = torch.where(mask.unsqueeze(2), win, torch.full_like(win, -1)).reshape(B, -1)
            src.scatter_add_(1, w.clamp(min=0), (w >= 0).long())
            return src > 0

        if bool(p_g.any()):
            land[:, 0] = dilate(p_g, pwin)
        if bool(p_a.any()):
            sea[:, 0] = dilate(p_a, pwin)
        if self.R > 0:
            for r in range(self.R):
                rg = v_g & (self.v_civ == r)
                ra = v_a & (self.v_civ == r)
                if bool(rg.any()):
                    land[:, r + 1] = dilate(rg, vwin)
                if bool(ra.any()):
                    sea[:, r + 1] = dilate(ra, vwin)
        out = (land, sea)
        self._gen_aura_cache = (key, out)
        return out

    def _gen_aura_hit(self, civ_unified: torch.Tensor, tile: torch.Tensor, naval: torch.Tensor) -> torch.Tensor:
        """The RAW aura predicate — bool, shaped like `tile` — for a unit of
        seat `civ_unified` standing on `tile`, ADMIRAL-keyed when `naval`
        (naval|embarked) else GENERAL-keyed. civ_unified: 0 = seat 0, r+1 =
        civ index r, -1 = none/barbarian. THE single predicate behind both
        halves of the aura, mirroring `aura.inGeneralAura` — `_gen_aura_cs`
        scales it to the +CS adder and the refresh-site snapshot scales it to
        the +MP one, so the two cannot drift apart.

        Shape-generic on the trailing dims (leading dim must be B): [B] at the
        combat call sites, [B, simbase.P_MAX] / [B, simbase.U_MAX] at the pooled snapshot.
        Does NOT screen civilians — callers own that (the combat sites only ever
        ask about a combatant; the snapshot masks on _p_combat > 0)."""
        planes = self._gen_aura_planes()
        if planes is None:
            return torch.zeros_like(tile, dtype=torch.bool)
        land, sea = planes
        valid = (civ_unified >= 0) & (tile >= 0)
        g = civ_unified.clamp(min=0, max=self._O - 1)
        idx = (g * self.T + tile.clamp(min=0)).reshape(self.B, -1)
        land_hit = land.reshape(self.B, -1).gather(1, idx).reshape(tile.shape)
        sea_hit = sea.reshape(self.B, -1).gather(1, idx).reshape(tile.shape)
        return torch.where(naval, sea_hit, land_hit) & valid

    def _gen_aura_cs(self, civ_unified: torch.Tensor, tile: torch.Tensor, naval: torch.Tensor) -> torch.Tensor:
        """The +generalAuraCs adder [B] (dtype) for own military near an own
        GENERAL (land) / ADMIRAL (naval|embarked). civ_unified: 0 = seat 0,
        r+1 = civ index r, -1 = none/barbarian. An INTEGER add joining the
        quantized assembly (the JUST_WAR/CRUSADE pattern) — mirrors
        combat.generalAuraCS.

        It joins every unit-vs-unit roll, every unit-vs-CITY roll (rcty/rctyc,
        csty/cstyc, pcty/pctyc, rngcs, vrngc, attacker side) and every
        CITY-STRIKE roll (pcstk/pestk/rcstk/restk, DEFENDER side). Absent from
        'rngrc' — TS does not add it there."""
        return self._gen_aura_hit(civ_unified, tile, naval).to(self.dtype) * self._gen_aura_cs_val

    def _seat_heal(self, pre: str) -> torch.Tensor:
        """What this pool's units heal — the refreshUnits rule.

        ONE rule for every seat: this seat's own city centre 20, its own land
        15, its own CAMP 20, neutral ground 10, anyone else's land 5.

        It reads as three rules only if you look at which terms are non-empty
        per class. A major holds no camps, so its camp term never fires; the
        barbarians hold no land, so their `home` term never does. That is data,
        not a class branch.

        `seat` is a tensor because a civ seat's varies per slot; for the other
        two pools `torch.full_like` keeps it the same expression."""
        t = getattr(self, f"{pre}_tile").clamp(min=0)
        seat = getattr(self, f"{pre}_seat")
        here = self.tile_seat.gather(1, t)
        home = here == seat
        # A city CENTRE here — any seat's; `home` already restricts it to this
        # one, and the one-owner invariant makes a centre tile its own seat's.
        center = (self.center_at.gather(1, t) >= 0) | (self.rc_at.gather(1, t) >= 0)
        camp = (self.camp_tile.unsqueeze(2) == t.unsqueeze(1)).any(dim=1) if pre == "u" else None
        heal = torch.where(home & center, torch.full_like(t, 20),
               torch.where(home, torch.full_like(t, 15),
               torch.where(here != NO_SEAT, torch.full_like(t, 5), torch.full_like(t, 10))))
        if camp is not None:
            # The camp beats neutral/foreign ground but not this seat's own
            # land, which is unreachable for the only class that holds camps.
            heal = torch.where(camp & ~home, torch.full_like(t, 20), heal)
        return heal

    def _spent_mp(self, pre: str) -> torch.Tensor:
        """[B, U] — has this unit spent MP since its last refresh? TS asks
        `unit.movesLeft < grantedLast` and nothing else."""
        return getattr(self, f"{pre}_mp") < getattr(self, f"{pre}_mp_full")

    def _full_mp(self, pre: str) -> torch.Tensor:
        """[B, U] — refreshUnits' `full + generalAuraMP(state, unit)`, one rule
        for all three pools: an EMBARKED land unit marches on the flat
        EMBARK_MOVES pool, everything else on its type's `moves`, plus whatever
        the frozen general/admiral aura granted.

        Every walker and every afford rule (`mp >= full`) must read this same
        expression — `stepUnit` is embark-aware for all three pools."""
        typ = getattr(self, f"{pre}_type").clamp(min=0, max=self.NU - 1)
        # The golden dedication raises the unit's OWN movement, so it is added
        # to the type pool and then OVERRIDDEN by the embark pool below —
        # embarkation speed is not a unit's movement stat. `unitFullMoves` has
        # the same shape (`if (embarked && !naval) return EMBARK_MOVES`).
        base = self._p_moves[typ] + self._golden_move_mp(pre)
        if self._embark_live:
            emb = getattr(self, f"{pre}_emb")
            base = torch.where(
                emb & ~self.unit_naval[typ], torch.full_like(base, self._embark_moves), base
            )
        return base + getattr(self, f"{pre}_aura_mp")

    def _reset_mp(self, pre: str) -> None:
        """The movesLeft/movesFull reset: `granted = full + aura`, both fields.
        TS writes the pair together at refreshUnits and again at seatPhase;
        writing only one breaks next turn's "spent no MP" gate for a seat that
        never moved."""
        f = self._full_mp(pre)
        getattr(self, f"{pre}_mp_full").copy_(f)
        getattr(self, f"{pre}_mp").copy_(f)

    def _refresh_aura_mp(self) -> None:
        """FREEZE the aura's +generalAuraMp per unit slot, at the refreshUnits
        moment. TS computes `granted = full + generalAuraMP(state, unit)`
        inside refreshUnits — the TOP of endTurn, before anything moves — and
        spends movesLeft down from that frozen pool all turn. The GPU keeps no
        persistent movesLeft: every walker recomputes `full_mp` from
        `_p_moves[type]` MID-turn, which is safe only for terms that depend on
        unit TYPE. The aura is not one — it keys on a GENERAL's POSITION, and
        generals move during the very phase the unit orders execute, so a
        recompute could read a POST-move general where TS read a PRE-move one.
        Hence the snapshot; the walkers add p_aura_mp / v_aura_mp.

        Barbarians never own a GENERAL/ADMIRAL, so the u_ pool has no plane
        (mirrors p_xp/v_xp). Civilians are screened here (TS inGeneralAura
        returns false at combat <= 0), as are dead slots, so a stale reclaimed
        slot cannot leak a bonus. Zero RNG, integer arithmetic."""
        gm = self._gen_aura_mp
        p_ok = self.p_alive & (self._p_combat[self.p_type] > 0)
        p_hit = self._gen_aura_hit(
            torch.zeros_like(self.p_tile),  # seat 0 is civ_unified 0
            self.p_tile,
            self.unit_naval[self.p_type] | self.p_emb,  # ADMIRAL-keyed when naval OR embarked
        )
        self.p_aura_mp.copy_((p_hit & p_ok).long() * gm)

    def _refresh_aura_mp_civ(self) -> None:
        """The CIV-SEAT pool freezes at a DIFFERENT moment than seat 0's — the
        top of `_seat_phase`, not the refreshUnits mirror.

        `refreshUnits` does set civ movesLeft at the top of endTurn, but
        `seatPhase` then RE-RESETS every civ unit's pool before the civ walkers
        run. That second reset — not the first — establishes a civ seat's real
        movement budget for the turn, so it is where TS applies the aura and
        rewrites `movesFull`. Freezing here also lands BEFORE the unit-order
        phase moves any general, so both engines read the same pre-move
        positions."""
        v_ok = self.v_alive & (self._p_combat[self.v_type] > 0)
        v_hit = self._gen_aura_hit(
            self.v_civ + 1,  # civ index r is civ_unified r+1
            self.v_tile,
            self.unit_naval[self.v_type] | self.v_emb,
        )
        self.v_aura_mp.copy_((v_hit & v_ok).long() * self._gen_aura_mp)
        # seatPhase writes `u.movesLeft = full + generalAuraMP(...)` and
        # `u.movesFull = u.movesLeft` in this very loop — the reset that
        # establishes a civ seat's budget for the turn.
        self._reset_mp("v")

    def _civ_era(self, techs: torch.Tensor, civics: torch.Tensor) -> torch.Tensor:
        """[B] — the `civEraIndex` twin. The HIGHEST era among a seat's
        completed techs and civics; 0 (Ancient) when nothing is done."""
        nt = min(techs.shape[1], self._tech_era.numel())
        nc = min(civics.shape[1], self._civic_era.numel())
        e = torch.zeros(techs.shape[0], dtype=torch.long, device=self.device)
        if nt:
            e = torch.maximum(e, (techs[:, :nt].long() * self._tech_era[:nt]).max(dim=1).values)
        if nc:
            e = torch.maximum(e, (civics[:, :nc].long() * self._civic_era[:nc]).max(dim=1).values)
        return e

    def _tourism_of(self, gw_w: torch.Tensor, gw_a: torch.Tensor, gw_m: torch.Tensor, alive: torch.Tensor, own: torch.Tensor, era: torch.Tensor, relics: torch.Tensor | None = None, printing: torch.Tensor | None = None, artifacts: torch.Tensor | None = None) -> torch.Tensor:
        """[B] — a seat's per-turn TOURISM, the `seatTourism` twin. Great Works
        pay the values that pair tourism with culture; every OWNED unpillaged
        SEASIDE RESORT pays its tile's APPEAL (floored at 0), attributed by
        tile ownership rather than by worked-tile assignment so the seats
        cannot drift on citizen placement. `gw_w`/`gw_m` are the seat's
        per-city Great Work counts, `alive` the matching per-city alive mask,
        `own` a [B, T] tile-ownership mask."""
        # ALIVE-masked: TS iterates the seat's cities list, which a captured or
        # razed city has already left. Summing every column would keep paying
        # tourism for a city the seat no longer owns.
        # PRINTING doubles the WRITING term (tourism only).
        _wmult = self._gw_tour_k[0] * torch.where(
            printing if printing is not None else torch.zeros(self.B, dtype=torch.bool, device=self.device),
            torch.full((self.B,), self._gw_printing_mult, dtype=torch.long, device=self.device),
            torch.ones(self.B, dtype=torch.long, device=self.device),
        )
        t = (
            _wmult * (gw_w * alive.long()).sum(dim=1)
            + self._gw_tour_k[1] * (gw_a * alive.long()).sum(dim=1)
            + self._gw_tour_k[2] * (gw_m * alive.long()).sum(dim=1)
        )
        # RELICS pay 8 tourism apiece — the densest source in the game.
        # ALIVE-masked for the same reason the Great Works are.
        if relics is not None:
            t = t + self._relic_tour * (relics * alive.long()).sum(dim=1)
        if artifacts is not None:  # artifacts pay tourism too
            t = t + self._artifact_tourism * (artifacts * alive.long()).sum(dim=1)
        # WONDERS: base + eras advanced past each wonder's own era.
        w_live = (self.built_wonder >= 0) & self.built_wonder_complete & own
        if bool(w_live.any()):
            w_era = self._wonder_era[self.built_wonder.clamp(min=0, max=max(self._wonder_era.numel() - 1, 0))]
            t = t + (
                (self._wonder_tour_base + (era.unsqueeze(1) - w_era).clamp(min=0)) * w_live.long()
            ).sum(dim=1)
        if self.SEASIDE >= 0:
            live = (self.improvement == self.SEASIDE) & ~self.pillaged & own
            if bool(live.any()):
                t = t + (self._tile_appeal().clamp(min=0) * live.long()).sum(dim=1)
        return t

    def _seaside_ok(self) -> torch.Tensor:
        """[B, T] bool — where a SEASIDE RESORT may be built, the
        `validImprovementsIn` arm's twin. Static half from `sr_c` (flat
        Grassland/Plains/Desert beside a COAST tile, unpaved, no resource);
        live feature test = carried none at t0 OR has since been chopped;
        appeal must be BREATHTAKING. The unlock tech and ownership are the
        caller's business, exactly as for farm/mine/lumber."""
        if self.SEASIDE < 0:
            return torch.zeros(self.B, self.T, dtype=torch.bool, device=self.device)
        return (
            self._sr_c
            & (self._sr_nf | self.feat_stripped)
            & (self.improvement < 0)
            & (self.district < 0)
            & (self._tile_appeal() >= self._seaside_min_appeal)
        )

    def _tile_appeal(self) -> torch.Tensor:
        """[B, T] tile appeal, the `tileAppeal` (core/appeal.ts) mirror. TS
        sums each NEIGHBOUR's contribution, so build a per-tile contribution
        then gather it over `neigh`.

        `appeal_base` carries the static part (natural wonder +2, mountain +1,
        coast/lake +1) plus the tile's t0 feature term; a chopped tile
        subtracts `appeal_feat` via feat_stripped. The rest is live: a
        COMPLETED built wonder +1, MINE/QUARRY/OIL_WELL -1, and an
        INDUSTRIAL_ZONE or ENCAMPMENT district -1. Version-cached like
        _farmadj_qual — every contributing write already bumps _eff_version."""
        if self._appeal_cache is not None and self._appeal_cache[0] == self._eff_version:
            return self._appeal_cache[1]
        contrib = self.appeal_base - torch.where(self.feat_stripped, self.appeal_feat, torch.zeros_like(self.appeal_feat))
        contrib = contrib + (self.built_wonder_complete & (self.built_wonder >= 0)).long()
        imp = self.improvement
        bad_imp = torch.zeros_like(contrib, dtype=torch.bool)
        for _i in (self.MINE, self.QUARRY, self.OIL_WELL):
            if _i >= 0:
                bad_imp |= imp == _i
        contrib = contrib - bad_imp.long()
        if self._appeal_bad_dist:
            bad_d = torch.zeros_like(contrib, dtype=torch.bool)
            for _d in self._appeal_bad_dist:
                bad_d |= self.district == _d
            contrib = contrib - bad_d.long()
        # "-1 each adjacent pillaged tile" — dynamic, so it joins contrib
        # rather than the exported static plane.
        contrib = contrib - self.pillaged.long()
        nb = self.neigh
        nbc = nb.clamp(min=0)
        out = (contrib[:, nbc] * (nb >= 0).unsqueeze(0).long()).sum(dim=2)  # [B, T]
        # The ON-TILE terms (mountain +4, river/lake +1) are the tile's OWN
        # appeal, not a neighbour contribution, so they are added AFTER the
        # gather — the two leading lines of tileAppeal.
        out = out + self.appeal_self
        # Wonder/mountain tiles ignore every term above — fixed 5 and 4.
        out = torch.where(self.appeal_over > -999, self.appeal_over, out)
        self._appeal_cache = (self._eff_version, out)
        return out

    def _farmadj_qual(self) -> torch.Tensor:
        """[B, T] bool: a non-pillaged FARM with >=2 neighboring FARM tiles
        (tileYields). Tile-based and SEAT-INDEPENDENT — the per-seat tier
        (Feudalism + Replaceable Parts) multiplies it, so every seat reuses
        this same qualifying set."""
        if self._fadjq_cache is not None and self._fadjq_cache[0] == self._eff_version:
            return self._fadjq_cache[1]
        nb = self.neigh
        nbc = nb.clamp(min=0)
        farm_imp = self.improvement == self.FARM  # pillaged neighbors still count
        adj = farm_imp[:, nbc] & (nb >= 0).unsqueeze(0)  # [B, T, 6]
        out = (self.improvement == self.FARM) & ~self.pillaged & (adj.sum(dim=2) >= 2)
        self._fadjq_cache = (self._eff_version, out)
        return out

    def _farmadj_tier(self, civics: torch.Tensor, techs: torch.Tensor) -> torch.Tensor:
        """[B] a seat's farm-adjacency tier from ITS OWN civics/techs
        (Feudalism +1, Replaceable Parts +1). civics/techs are [B, n]."""
        tier = torch.zeros(self.B, dtype=torch.long, device=self.device)
        if self._farmadj_civic >= 0:
            tier = tier + civics[:, self._farmadj_civic].long()
        if self._farmadj_tech >= 0:
            tier = tier + techs[:, self._farmadj_tech].long()
        return tier

    def _farmadj_food(self) -> torch.Tensor:
        """[B, T] seat 0's farm-adjacency food bonus = qual × seat 0's tier.
        Each civ seat adds its OWN via _farmadj_qual × _farmadj_tier in
        _seat_city_yields — every seat applies its own research boosts."""
        if self._fadjf_cache is not None and self._fadjf_cache[0] == self._eff_version:
            return self._fadjf_cache[1]
        z = torch.zeros(self.B, self.T, dtype=self.dtype, device=self.device)
        if not self.improvements_on:
            out = z
        else:
            tier = self._farmadj_tier(self.civics, self.techs)
            if not bool((tier > 0).any()):
                out = z
            else:
                out = self._farmadj_qual().to(self.dtype) * tier.unsqueeze(1).to(self.dtype)
        self._fadjf_cache = (self._eff_version, out)
        return out

    def _pillaged_bf_live(self, bf: torch.Tensor, tcf: torch.Tensor, tiles: torch.Tensor, slot_ids: torch.Tensor, M: int) -> torch.Tensor:
        """bf ([B,C,NB] building presence) with every building in a
        COMPLETE-but-PILLAGED district zeroed (its yields/housing/amenities go
        dark). CITY_CENTER buildings (_b_req_district == -1) never gate — the
        city center is unpillageable. Mirrors pillagedDistrictTypes +
        cityBuildingYields/computeHousing/localBuildingAmenities."""
        if not self.districts_on:
            return bf
        B, C = self.B, self.C
        nD = len(self.districts_cat)
        dt_win = self.district.gather(1, tcf).reshape(B, C, M)
        pil_win = (
            (tiles >= 0)
            & (self.owner.gather(1, tcf).reshape(B, C, M) == slot_ids)
            & self.district_complete.gather(1, tcf).reshape(B, C, M)
            & ~self.district_dead.gather(1, tcf).reshape(B, C, M)
            & self.district_pillaged.gather(1, tcf).reshape(B, C, M)
            & (dt_win >= 0)
        )  # [B, C, M] owned completed pillaged districts
        dt_oh = torch.nn.functional.one_hot(dt_win.clamp(min=0), nD).bool() & pil_win.unsqueeze(3)  # [B,C,M,nD]
        pil_dtype = dt_oh.any(dim=2)  # [B, C, nD] this city holds a pillaged district of type di
        breq = self._b_req_district  # [NB] building's district idx (-1 = CITY_CENTER)
        bdark = pil_dtype.gather(2, breq.clamp(min=0).reshape(1, 1, -1).expand(B, C, -1)) & (breq >= 0).reshape(1, 1, -1)  # [B,C,NB]
        return bf * (~bdark).to(self.dtype)

    def _city_totals(self, lux: torch.Tensor | None = None) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """Seat 0's per-city yields/housing/growth-factor from the current
        state: (total [B, C, 6] alive-masked, housing [B, C], growth_f [B, C],
        tier_idx [B, C]). Mirrors computeCityStats — used both inside step()
        and to score.

        lux: optional FROZEN luxury-amenity map [B, C]. TS endTurn computes
        luxuryAmenities(state) ONCE before its city loop and feeds that same
        map to every city's fresh computeCityStats — so the city walk's
        guard-triggered recomputes must NOT re-rank luxuries with mid-walk
        pops, which can split an amenity tier. The freshly computed map is
        stashed on _last_lux for the walk to freeze."""
        r, B, C, T, dev = self.rules, self.B, self.C, self.T, self.device
        rd = self.rules_dev

        # Workable candidates live within the radius-3 window (37 offsets) —
        # scoring only that window keeps the exact same candidate set, per-tile
        # keys and topk order as a full-map scan, 30× smaller.
        eff_y = self._eff_yields()  # disasters make food dynamic
        if self._score_cache is not None and self._score_cache[0] == self._eff_version:
            tile_score = self._score_cache[1]
        else:
            tile_score = (eff_y * rd.focus_base).sum(dim=2)  # [B, T]
            # Seat 0's farm-adjacency food also scores tiles for selection
            # (assignWorkedTiles uses tileScore WITH the bonus).
            tile_score = tile_score + self._farmadj_food() * float(rd.focus_base[0])
            self._score_cache = (self._eff_version, tile_score)
        tiles = tiles_from_offsets(self.site.clamp(min=0).reshape(-1), self._off3, self.W, self.H).reshape(B, C, -1)
        M = tiles.shape[2]
        tc = tiles.clamp(min=0)
        tcf = tc.reshape(B, -1)
        slot_ids = torch.arange(C, device=dev).reshape(1, C, 1)
        cand = (
            (tiles >= 0)
            & (self.owner.gather(1, tcf).reshape(B, C, M) == slot_ids)
            & self.workable.gather(1, tcf).reshape(B, C, M)
            & (self.dist.gather(2, tc) <= 3)
            & (tiles != self.site.unsqueeze(2))
            & (self.district.gather(1, tcf).reshape(B, C, M) < 0)  # district tiles are paved (mirrors workableTiles !t.district)
            # workableTiles excludes builtWonder tiles too.
            & (self.built_wonder.gather(1, tcf).reshape(B, C, M) < 0)
        )  # [B, C, M]
        # The tie-break runs in FORCED f64, like the civ twin
        # (_seat_city_yields_all builds its key with an explicit .double()).
        # Riding self.dtype would break the f32 lanes: an index epsilon of
        # 1e-9 is far below the f32 ULP of a score around 40 (~4e-6), so it
        # rounds away completely and topk resolves exact ties by its own
        # unspecified order — picking the HIGHEST index where TS (city.ts,
        # `b.score - a.score || a.index - b.index`) takes the lowest.
        # .double() is a no-op on an f64 tensor.
        score = torch.where(cand, tile_score.gather(1, tcf).reshape(B, C, M).double(), torch.tensor(-1e18, dtype=torch.float64, device=dev))
        score = score - tc.double() * 1e-9  # tie: lowest index first
        self._tiebreak_key_dtype = score.dtype  # what the poke lane asserts
        k = min(max(int(self.pop.max().item()), 1), M)
        top_scores, top_idx = score.topk(k, dim=2)
        take = (torch.arange(k, device=dev).reshape(1, 1, k) < self.pop.unsqueeze(2)) & (top_scores > -1e17)
        top_tile = tc.gather(2, top_idx)  # [B, C, k] global tile ids
        ty = eff_y.unsqueeze(1).expand(B, C, T, 6).gather(2, top_tile.unsqueeze(-1).expand(B, C, k, 6))
        worked_y = (ty * take.unsqueeze(-1).to(self.dtype)).sum(dim=2)  # [B, C, 6]
        # Seat 0's farm-adjacency food, summed over the worked FARM tiles.
        fadj = self._farmadj_food()  # [B, T]
        fadj_w = (fadj.unsqueeze(1).expand(B, C, T).gather(2, top_tile) * take.to(self.dtype)).sum(dim=2)  # [B, C]
        worked_y = worked_y.clone()
        worked_y[:, :, 0] = worked_y[:, :, 0] + fadj_w

        # WATER MILL: "Bonus resources improved by Farms gain +1 Food each".
        # POST-selection over the worked set, like the Petra and
        # farm-adjacency terms above, mirroring `waterMillBonus`. Modelled
        # GENERALLY (bonus category + the resource's own required improvement
        # is FARM) rather than as a named rice/wheat pair, so a third farm
        # bonus resource picks it up automatically. The city CENTER never
        # qualifies — it carries no improvement — so it needs no term here.
        wm_city = self.buildings[:, :, rd.b_farmbonus]  # [B, C, n] -> any()
        if wm_city.numel() and bool(wm_city.any()):
            has_wm = wm_city.any(dim=2)  # [B, C]
            elig = (
                (self.improvement == self.FARM)
                & (self.res_cat == 1)  # bonus category
                & (self.res_imp == self.FARM)  # ...whose improvement IS the farm
            )  # [B, T]
            wm_w = (elig.unsqueeze(1).expand(B, C, T).gather(2, top_tile) & take).to(self.dtype).sum(dim=2)
            worked_y[:, :, 0] = worked_y[:, :, 0] + wm_w * has_wm.to(self.dtype)

        # Walk-scoped sub-term cache. The step() walk's guard-triggered
        # recomputes (lux is not None — the frozen luxMap path) mostly fire on
        # POP-only changes; every term below that doesn't read pop is then
        # bit-identical to the last compute. Keyed on _eff_version: every
        # non-pop mutation inside the walk (completion, claim, purchase...)
        # bumps it, and out-of-walk consumers (trace/empire_score, lux=None)
        # never read the cache — they always recompute and refresh the store,
        # so a hit can only return values a fresh recompute would reproduce.
        cc = None
        if lux is not None and self._ct_cache is not None and self._ct_cache[0] == self._eff_version:
            cc = self._ct_cache[1]
        if cc is not None:
            b_y = cc["b_y"]
            bf_live = cc["bf_live"]
        else:
            bf = self.buildings.to(self.dtype)
            # Buildings in a COMPLETE-but-PILLAGED district go dark
            # (yields/housing/amenities). Keyed on _eff_version (pillage/repair
            # bumps it), so caching bf_live is safe — the follower terms below
            # read it on every call (city religion can change without a bump,
            # but the pillage mask cannot).
            bf_live = self._pillaged_bf_live(bf, tcf, tiles, slot_ids, M)
            # Regional buildings leave every LOCAL sum fed by bf_live
            # (yields/amenities; their housing is 0 and no belief row targets
            # them, so the wholesale mask mirrors cityBuildingYields' /
            # localBuildingAmenities' `if (def.regional) continue`). The
            # regional channel below delivers them by range; maintenance
            # stays on the unmasked bf (cityMaintenance has no regional skip).
            bf_live = bf_live * self._b_local_f.reshape(1, 1, -1)
            b_y = torch.einsum("bcn,nk->bck", bf_live, rd.b_yields)
        center_y = self.center_yields
        if self.disasters:
            # fertility/drought hit the center's RAW food before the min-clamp
            sitec = self.site.clamp(min=0)
            cf = self.center_raw_food + self.fertility.gather(1, sitec).to(self.dtype)
            cf = torch.where(self.drought.gather(1, sitec) > 0, (cf - 1).clamp(min=0), cf)
            center_y = self.center_yields.clone()
            center_y[:, :, 0] = torch.maximum(cf, torch.full_like(cf, float(r.center_min_food)))
        total = worked_y + center_y + self.is_cap.unsqueeze(2).to(self.dtype) * self._palace_y.reshape(1, 1, 6) + b_y
        # Per-city FOLLOWER-belief id for seat 0 (from followedReligion when
        # LIVE, else religion 0 = -1 follower = no add). Its building-yield
        # adds (Feed the World / Choral Music) land at the buildings position
        # (pre-amenity), like cityBuildingYields' beliefAdd. Computed fresh
        # (not cached): the term is pop-free but cty_followed can change
        # between turns without an _eff_version bump.
        _pcfol = self._follower_id_for(self._city_rel_player()) if self._bel_any else None
        if _pcfol is not None:
            # (.to(self.dtype): the fol tables are f64 for the civ-seat paths;
            # this walk runs in self.dtype — f32 under gumbel/training, where
            # the raw f64 table would break the einsum. No-op under parity f64.)
            _fol_by = torch.einsum("bcn,bcnk->bck", bf_live, self._fol_tab("bldgY", _pcfol).to(self.dtype))  # dark buildings excluded
            total = total + _fol_by
        reg_y = reg_am = None  # set by the districts_on block; regional buildings need a district
        if self.districts_on:
            if cc is not None:
                # The whole block is pop-free — replay the cached per-district
                # addends in catalog order (same adds, same association as the
                # miss path below).
                d_addends = cc["d_addends"]
                cs_city6 = cc["cs_city6"]
                ship_add = cc["ship_add"]
                d_maint = cc["d_maint"]
                has_aq = cc["has_aq"]
                dcount_all = cc["dcount_all"]  # INSULAE's housingIfDistricts
                spec_count = cc["spec_count"]  # Zen Meditation specialty count
                hs_adj = cc["hs_adj"]  # Holy Site adjacency (follower Work Ethic)
                reg_y = cc["reg_y"]  # regional-building yields [B, C, 6] | None
                reg_am = cc["reg_am"]  # regional-building amenities [B, C] | None
            else:
                # District adjacency yields — cityDistrictYields:
                # floor(adjacency) into the district's yield column, summed
                # into the pre-amenity total.
                dt = self.district.gather(1, tcf).reshape(B, C, M)
                owned_d = (tiles >= 0) & (self.owner.gather(1, tcf).reshape(B, C, M) == slot_ids)
                # yields/maintenance/Aqueduct housing all count COMPLETED districts
                owned_d = owned_d & self.district_complete.gather(1, tcf).reshape(B, C, M)
                owned_d = owned_d & ~self.district_dead.gather(1, tcf).reshape(B, C, M)  # captured = dead
                # FUNCTIONAL districts (contribute adjacency / CS-envoy /
                # Aqueduct-housing / Shipyard) exclude the PILLAGED ones; the
                # COUNT-based static consumers below (dcount_all / spec_count /
                # d_maint) keep the un-gated owned_d — "pillaged is still owned".
                owned_d_live = owned_d & ~self.district_pillaged.gather(1, tcf).reshape(B, C, M)
                # Per-city COMPLETED live district count (ALL types —
                # computeHousing's completedDistrictCount(state, city, false))
                dcount_all = owned_d.to(torch.long).sum(dim=2)  # [B, C]
                # Per-city COMPLETED specialty district count (Zen Meditation min).
                spec_count = (owned_d & self._is_specialty[dt.clamp(min=0)]).to(torch.long).sum(dim=2)  # [B, C]
                # City-state envoy bonus, keyed to BUILDINGS (csEnvoyBonuses):
                # a CS at >=3 envoys grants +districtBonus in its TYPE channel
                # (CS_TYPE_YIELD) to every city holding the type's TIER-1
                # building; at >=6, again on the TIER-2 building — the bonus
                # lands on the district's buildings, not the bare district.
                # Routed through bf_live — the pillaged-dark + regional-masked
                # building presence — so pillage/regional-skip match
                # cityBuildingYields exactly. Scatter per (building, channel),
                # pre-amenity-factor.
                nBc = self.buildings.shape[2]
                cs_city6 = torch.zeros(B, C, 6, dtype=self.dtype, device=dev)
                if self.S > 0:
                    _acs = self.cs_alive.to(self.dtype)  # [B, S]
                    per3 = (self.cs_envoys >= 3).to(self.dtype) * self._cs_district_bonus * _acs * (self._cs_b1idx >= 0).to(self.dtype)
                    per6 = (self.cs_envoys >= 6).to(self.dtype) * self._cs_district_bonus * _acs * (self._cs_b2idx >= 0).to(self.dtype)
                    cs_bld6f = torch.zeros(B, nBc * 6, dtype=self.dtype, device=dev)
                    cs_bld6f.scatter_add_(1, self._cs_b1idx.clamp(min=0) * 6 + self._cs_yidx, per3)
                    cs_bld6f.scatter_add_(1, self._cs_b2idx.clamp(min=0) * 6 + self._cs_yidx, per6)
                    cs_bld6 = cs_bld6f.reshape(B, nBc, 6)
                    cs_city6 = torch.einsum("bcn,bnk->bck", bf_live, cs_bld6)  # [B, C, 6] — pillaged/regional dark via bf_live
                # For each PLACED district with an adjacencyYield: floor(static
                # + 0.5*adjacent-districts) into its yield column, including
                # the type-specific dynamic sources (mine/quarry for the
                # Industrial Zone, city-center for the Harbor, built-wonder for
                # the Theater Square). The addends are built as a list and
                # applied below — total + adjSum + csTerm, the same
                # left-to-right association on cache hit or miss.
                d_addends = []
                hs_adj = None  # Holy Site floored adjacency (follower Work Ethic)
                for d in self.districts_cat:
                    di = int(d["idx"])
                    mask = owned_d_live & (dt == di)  # pillaged = dark (adjacency)
                    yc = int(d.get("adjYield", -1))
                    if yc < 0:
                        continue
                    adjv = self._district_adj_floor(di)  # [B, T] full districtAdjacency (memoised)
                    _adj_sum = (adjv.gather(1, tcf).reshape(B, C, M) * mask.to(self.dtype)).sum(dim=2)  # [B, C]
                    d_addends.append((yc, _adj_sum))
                    if di == self._hs_idx:
                        hs_adj = _adj_sum
                # SHIPYARD special: a city holding a Shipyard adds its
                # completed Harbor's full districtAdjacency as PRODUCTION — the
                # SAME value that fed the Harbor's gold above, re-read here as
                # production, pre-amenity-factor like every district yield.
                ship_add = None
                if self._harbor_idx >= 0 and self._shipyard_bidx >= 0:
                    _hm = (owned_d_live & (dt == self._harbor_idx)).to(self.dtype)  # [B, C, M] this city's LIVE Harbor tiles
                    _hadj = self._district_adj_floor(self._harbor_idx)  # [B, T] (memoised)
                    _hadj_c = (_hadj.gather(1, tcf).reshape(B, C, M) * _hm).sum(dim=2)  # [B, C]
                    ship_add = _hadj_c * self.buildings[:, :, self._shipyard_bidx].to(self.dtype)
                # districtMaintenance: per-type upkeep (0 for City Center / Neighborhood
                # / Aqueduct, else 1); sum over the city's owned completed districts.
                d_maint = (self._d_maint[dt.clamp(min=0)] * (owned_d & (dt >= 0)).to(self.dtype)).sum(dim=2)
                # Aqueduct ownership feeds computeHousing below; it is computed
                # here inside the cacheable block because owned_d/dt live only
                # on this path.
                has_aq = (owned_d_live & (dt == self._aqueduct_idx)).any(dim=2) if self._aqueduct_idx >= 0 else None  # a pillaged Aqueduct gives no housing
                # Regional buildings (regionalEffects) — a regional building on
                # a COMPLETE unpillaged (live) source district reaches EVERY
                # seat-0 city center within regional_range; dedup by building
                # id (any() over sources). Pop-free + every input bumps
                # _eff_version => cacheable.
                reg_y = reg_am = None
                if self._reg_bidx:
                    _sitec_r = self.site.clamp(min=0)  # [B, C] receiver centers
                    for _n in self._reg_bidx:
                        _own_n = self.buildings[:, :, _n] & self.alive  # [B, C] source cities (state.cities = live only)
                        if not bool(_own_n.any()):
                            continue
                        _msrc = _own_n.unsqueeze(2) & owned_d_live & (dt == int(self._b_req_district[_n]))  # [B, C, M]
                        _st = torch.where(_msrc, tiles, torch.full_like(tiles, -1)).max(dim=2).values  # [B, C] source tile (-1 none)
                        if not bool((_st >= 0).any()):
                            continue
                        _ddp = self.pair_dist[_st.clamp(min=0).unsqueeze(2), _sitec_r.unsqueeze(1)]  # [B, Csrc, Crecv] int16
                        _has = ((_st >= 0).unsqueeze(2) & (_ddp <= self._regional_range)).any(dim=1) & self.alive  # [B, C recv]
                        _hf = _has.to(self.dtype)
                        if reg_y is None:
                            reg_y = torch.zeros(B, C, 6, dtype=self.dtype, device=dev)
                            reg_am = torch.zeros(B, C, dtype=self.dtype, device=dev)
                        reg_y = reg_y + _hf.unsqueeze(2) * rd.b_yields[_n].reshape(1, 1, 6)
                        reg_am = reg_am + _hf * rd.b_amenities[_n]
            for yc_a, adj_add in d_addends:
                total[:, :, yc_a] = total[:, :, yc_a] + adj_add
            total = total + cs_city6  # CS envoy district adds (channel columns, all types)
            if reg_y is not None:
                total = total + reg_y  # regional-building yields (pre-tier, the buildings position)
            # Follower Work Ethic — Holy Site floored adjacency ALSO yields
            # production, keyed on each city's followed religion.
            if _pcfol is not None and hs_adj is not None:
                total[:, :, 1] = total[:, :, 1] + hs_adj * self._fol_tab("we", _pcfol).to(self.dtype)
            if ship_add is not None:
                total[:, :, 1] = total[:, :, 1] + ship_add
        popf = self.pop.to(self.dtype)
        total[:, :, 3] += popf * r.citizen_science
        total[:, :, 4] += popf * r.citizen_culture
        # Slotted Great Works — culture/turn per work BY KIND (writing 2,
        # music 4), a building-tier yield (pre-amenity-factor, so it rides
        # yield_f and the government yieldMult below — the buildings-bucket
        # position). Pop-free and version-keyed (every gw write bumps
        # _eff_version), so an unconditional add each call reproduces exactly
        # like the popf terms. Association mirrors greatWorkCulture:
        # culture += (writingTerm + musicTerm).
        total[:, :, 4] += (
            self._gw_cul_k[0] * self.gw_writing.to(self.dtype)
            + self._gw_cul_k[1] * self.gw_art.to(self.dtype)
            + self._gw_cul_k[2] * self.gw_music.to(self.dtype)
        )
        # RELICS pay FAITH in the SAME buildings bucket and at the same
        # position (buildings.faith += relicFaith right after
        # buildings.culture += greatWorkCulture).
        total[:, :, 5] += self._relic_faith * self.relics.to(self.dtype)
        # ARTIFACTS pay CULTURE beside the works, at the same position.
        total[:, :, 4] += self._artifact_culture * self.artifacts.to(self.dtype)
        # Golden PEN, BRUSH AND VOICE — +1 Culture per SPECIALTY district in
        # every city (the completedDistrictCount(specialtyOnly) set).
        _pb = self._golden_ded(0, self._ded_pen_brush)
        if bool(_pb.any()):
            # Reuse `spec_count`, the per-city COMPLETED SPECIALTY district
            # count Zen Meditation already computes: it is bound on BOTH
            # branches of this function (cache hit AND recompute), unlike
            # `owned_d`, which exists only on the recompute path.
            total[:, :, 4] += _pb.to(self.dtype).unsqueeze(1) * spec_count.to(self.dtype)

        # City-state envoy bonuses land on the capital (mods.capitalYields),
        # summed before the amenity multiplier like every other bonus.
        if self.S > 0:
            tier1 = ((self.cs_envoys >= 1) & self.cs_alive).to(self.dtype) * self.rules.cs.get("capitalBonus", 2)
            cap_bonus = torch.zeros(B, 6, dtype=self.dtype, device=dev)
            cap_bonus.scatter_add_(1, self._cs_yidx, tier1)
            # Key on the CAPITAL FLAG, not column 0: TS applies
            # mods.capitalYields via `if (city.isCapital)`, and palace
            # relocation can re-crown any surviving column. Adding 0.0 to
            # non-capital columns is exact, so this is association-safe.
            _cap_m = self.is_cap.to(self.dtype).unsqueeze(2)  # [B, C, 1]
            total += cap_bonus.unsqueeze(1) * _cap_m
            # The suzerain's per-CS unique perk — a flat +suzerainYield in the
            # CS's live channel (cs_suz_key, -1 = descoped) to whichever seat
            # holds the STRICT suzerain contest (csSuzerainCapitalBonus).
            # Seat 0 here — the isSuzerain twin (>= suz_min, strictly > every
            # civ seat).
            suz_min = int(self.rules.cs.get("suzerainEnvoys", 3))
            p_suz = (self.cs_envoys >= suz_min) & self.cs_alive
            if self.R > 0:
                p_suz = p_suz & (self.cs_envoys > self.cs_r_envoys.max(dim=1).values)
            suz_val = p_suz.to(self.dtype) * self._cs_suz_amt * (self.cs_suz_key >= 0).to(self.dtype)  # [B, S]
            suz_bonus = torch.zeros(B, 6, dtype=self.dtype, device=dev)
            suz_bonus.scatter_add_(1, self.cs_suz_key.clamp(min=0), suz_val)
            total += suz_bonus.unsqueeze(1) * _cap_m  # capital FLAG, not column 0

        # Seat 0's adopted government + slotted policies — cityYields to every
        # city, capitalYields to the capital (computeCityStats' `bonuses`),
        # summed pre-amenity-factor. Food (col 0) is left unscaled by the
        # amenity factor below, matching TS.
        if self._gov_has_effects:
            gpc_city, gpc_cap, gpc_hous, gpc_ymult, gpc_slotted, _gpc_emult, _gpc_tp, gpc_amen, gpc_hid, gpc_nd = self._gov_policy_mods_cached("p", self.civics)
            # Both conditional rules once, here — the amenity half is needed
            # BEFORE the tier balance and the housing half AFTER it.
            _cond_house, _cond_amen = (
                self._cond_house_amen(gpc_hid, gpc_nd, dcount_all, spec_count)
                if self.districts_on and (gpc_hid or gpc_nd) else (None, None))
            total += gpc_city.unsqueeze(1)
            total += gpc_cap.unsqueeze(1) * self.is_cap.to(self.dtype).unsqueeze(2)
        else:
            gpc_hous = gpc_ymult = None

        amen_b = cc["amen_b"] if cc is not None else torch.einsum("bcn,n->bc", bf_live, rd.b_amenities)
        amen_have = self.is_cap.to(self.dtype) * self._palace_amenities + amen_b
        # Regional amenities join BEFORE the luxury ranking — the baseHave
        # (localBuildingAmenities + regional.amenities).
        if reg_am is not None:
            amen_have = amen_have + reg_am
        amen_need = torch.ceil((popf - 2) / 2).clamp(min=0)
        lux_add = self._luxury_amenities(amen_have, amen_need) if lux is None else lux  # improved luxuries
        self._last_lux = lux_add  # the walk freezes this (one luxMap per turn)
        amen_have = amen_have + lux_add
        # Follower Zen Meditation — +amenities where the city's completed
        # specialty count meets the belief's min, keyed per-city on the
        # followed religion. Integer terms => the balance sum stays exact.
        if _pcfol is not None and self.districts_on:
            _zen = self._fol_tab("zen", _pcfol).to(self.dtype)  # [B, C, 2] = min, amenities
            amen_have = amen_have + torch.where(spec_count.to(self.dtype) >= _zen[:, :, 0], _zen[:, :, 1], torch.zeros_like(_zen[:, :, 1]))
        # The flat empire-wide war-weariness drag lands after the luxury grant
        # (`have -= warWearinessPenalty(...)`), below in `balance`.
        if gpc_amen is not None:
            amen_have = amen_have + gpc_amen.unsqueeze(1)  # amenitiesAll
        if _cond_amen is not None:
            amen_have = amen_have + _cond_amen  # newDeal amenities
        balance = amen_have - amen_need - self._ww_penalty_player().unsqueeze(1)
        growth_f, yield_f = self._amenity_factors(balance)
        # Amenity-tier INDEX (0 Ecstatic … 4 Unhappy) — loyalty reads it.
        tier_idx = torch.full_like(self.pop, len(self.rules.amenity_tiers) - 1)
        for i in reversed(range(len(self.rules.amenity_tiers))):
            tier_idx = torch.where(balance >= self.rules.amenity_tiers[i][0], torch.full_like(tier_idx, i), tier_idx)
        total[:, :, 1:] *= yield_f.unsqueeze(2)  # non-food × amenity factor
        # Government yieldMult AFTER the tier factor — the computeCityStats
        # order (tier.yieldFactor, then the m.yieldMult loop).
        if gpc_ymult is not None:
            total = total * gpc_ymult.unsqueeze(1)
        maint_b = cc["maint_b"] if cc is not None else torch.einsum("bcn,n->bc", bf, rd.b_maintenance)
        maintenance = self.base_maintenance + maint_b
        if self.districts_on:
            maintenance = maintenance + d_maint  # specialty-district upkeep (Campus = 1 gold)
        total[:, :, 2] -= maintenance

        water_h = self.water_housing
        if self.districts_on and self._aqueduct_idx >= 0:
            # Aqueduct (computeHousing): a fresh-water city gets +aqFreshBonus;
            # a non-fresh city's water housing is raised to aqNoFreshTotal.
            # (has_aq — owns a completed Aqueduct [B, C] — comes from the
            # cacheable district block above.)
            fresh = self.water_housing == self._h_fresh  # [B, C]
            aq_h = torch.where(
                fresh,
                self.water_housing + self._aq_fresh_bonus,
                torch.maximum(self.water_housing, torch.full_like(self.water_housing, self._aq_no_fresh_total)),
            )
            water_h = torch.where(has_aq, aq_h, self.water_housing)
        house_b = cc["house_b"] if cc is not None else torch.einsum("bcn,n->bc", bf_live, rd.b_housing)
        housing = water_h + self.is_cap.to(self.dtype) * self._palace_housing + house_b
        # NEIGHBORHOOD housing is APPEAL-based, so it cannot ride the flat
        # b_housing/district table (its catalog row is housing: 0):
        # `total += appealTier(tileAppeal(map, dt)).housing` per COMPLETE
        # unpillaged Neighborhood the city owns (computeHousing).
        if self._nbhd_didx >= 0:
            _ap = self._tile_appeal()
            _hv = torch.full_like(_ap, self._appeal_floor)
            for _cut, _val in sorted(self._appeal_cuts):  # ascending: higher tiers overwrite
                _hv = torch.where(_ap >= _cut, torch.full_like(_ap, _val), _hv)
            _nb_ok = (self.district == self._nbhd_didx) & self.district_complete & ~self.district_pillaged
            _own = self.owner
            _src = (_hv * _nb_ok.long()).to(self.dtype) * (_own >= 0).to(self.dtype)
            _nb_h = torch.zeros_like(housing)
            _nb_h.scatter_add_(1, _own.clamp(min=0), _src)
            housing = housing + _nb_h
        # Follower Religious Community — +housing on Shrines/Temples
        # (computeHousing beliefHousing), keyed per-city on the followed religion.
        if _pcfol is not None:
            housing = housing + torch.einsum("bcn,bcn->bc", bf_live, self._fol_tab("bldgH", _pcfol).to(self.dtype))  # dark buildings excluded
        if self.improvements_on:
            # +catalog housing per owned improvement within the work radius
            # (pillaged or not — computeHousing does not gate on pillaged,
            # unlike yields). Table-gathered: FARM/PASTURE/CAMP/PLANTATION
            # carry 0.5, MINE/LUMBER/QUARRY/OIL_WELL carry 0.
            if cc is not None:
                imp_add = cc["imp_add"]  # pop-free; improvement/owner writes bump the version
            else:
                imp_win = self.improvement.gather(1, tcf).reshape(B, C, M)
                owned_c = self.owner.gather(1, tcf).reshape(B, C, M) == slot_ids
                imp_owned = (tiles >= 0) & owned_c & (imp_win >= 0)
                imp_add = (self._imp_housing[imp_win.clamp(min=0)] * imp_owned.to(self.dtype)).sum(dim=2)
            housing = housing + imp_add
        # Government/policy housingAll (MONARCHY +1) — the computeHousing
        # `total += m.housingAll` twin; the civ-seat housing path adds its own.
        if gpc_hous is not None:
            housing = housing + gpc_hous.unsqueeze(1)
        # BOTH district-conditional housing rules (housingIfDistricts /
        # newDeal), from the government AND the cards, via the one applier the
        # civ-seat path also calls.
        if _cond_house is not None:
            housing = housing + _cond_house

        # Refresh the store on every miss (lux=None callers always land here,
        # so a fresh walk always starts from a same-version store).
        if cc is None:
            store = {"b_y": b_y, "amen_b": amen_b, "maint_b": maint_b, "house_b": house_b, "bf_live": bf_live}
            if self.districts_on:
                store["d_addends"] = d_addends
                store["cs_city6"] = cs_city6
                store["ship_add"] = ship_add
                store["d_maint"] = d_maint
                store["has_aq"] = has_aq
                store["dcount_all"] = dcount_all
                store["spec_count"] = spec_count  # Zen Meditation
                store["hs_adj"] = hs_adj  # follower Work Ethic
                store["reg_y"] = reg_y  # regional yields (None until one exists)
                store["reg_am"] = reg_am  # regional amenities
            if self.improvements_on:
                store["imp_add"] = imp_add
            self._ct_cache = (self._eff_version, store)

        # Dead slots contribute nothing (their static center yields are preloaded).
        total = total * self.alive.unsqueeze(2).to(self.dtype)
        return total, housing, growth_f, tier_idx

    def empire_score(self) -> torch.Tensor:
        """[B] — mirrors empireScore(state, seat 0, 'balanced') with the TS
        ASSOCIATION — per city: pop×popWeight, then each yield×weight in key
        order. Science rides non-dyadic 0.7s, so the sum ORDER is worth a real
        ±1 ulp, enough to flip the leader. TS iterates state.cities in ARRAY
        order (splice on death, push on found = acquisition order), so the sum
        walks city_seq rank; column order stops matching it after a hole-reuse
        founding. Dead columns sort last and add exact 0.0
        (association-neutral)."""
        total, _, _, _ = self._city_totals()
        rd = self.rules_dev
        w = rd.score_yield_weights
        pw = float(self.rules.score_pop_weight)
        ord_ = torch.argsort(torch.where(self.alive, self.city_seq, self.city_seq + 10**6), dim=1, stable=True)
        bidx = self._bidx
        score = torch.zeros(self.B, dtype=self.dtype, device=self.device)
        for s in range(self.C):
            col = ord_[:, s]
            score = score + (self.pop[bidx, col] * self.alive[bidx, col].long()).to(self.dtype) * pw
            t_c = total[bidx, col]
            for k in range(6):
                score = score + t_c[:, k] * float(w[k])
        return score

    def civ_score(self, r: int) -> torch.Tensor:
        """[B] — the reward-shaping analog of empire_score for civ seat r:
        pop × popWeight + per-city (food, production, science, culture) dotted
        with the balanced weights, plus building gold/faith (the only civ-seat
        sources of those columns in scope). Comparable in scale to
        empire_score, but see civ_empire_score for the clean mirror."""
        rd = self.rules_dev
        w = rd.score_yield_weights
        B = self.B
        pop_term = (self.rc_pop[:, r] * self.rc_alive[:, r].long()).sum(dim=1).to(self.dtype) * self.rules.score_pop_weight
        yt = torch.zeros(B, dtype=torch.float64, device=self.device)
        for j in range(self.RC):
            mask = self.rc_alive[:, r, j]
            if not bool(mask.any()):
                continue
            f, pr, sc, cu, _g, _fa = self._seat_city_yields(r, j, mask)
            yt = yt + f * float(w[0]) + pr * float(w[1]) + sc * float(w[3]) + cu * float(w[4])
            bgf = self.rc_bldg[:, r, j].double() @ rd.b_yields.double()  # [B, 6]
            yt = yt + bgf[:, 2] * float(w[2]) + bgf[:, 5] * float(w[5])
        return pop_term + yt.to(self.dtype)

    def civ_empire_score(self, r: int) -> torch.Tensor:
        """[B] the CLEAN balanced empire score for civ seat r — the exact
        mirror of empire_score('balanced') (Σcity pop*popWeight +
        Σ_k yields[k]·balanced_weight over ALL SIX yields, worked+building
        gold/faith via _seat_city_yields). NOT civ_score (the reward helper).
        Used for the winner/leader."""
        rd = self.rules_dev
        w = rd.score_yield_weights
        B = self.B
        pw = float(self.rules.score_pop_weight)
        # TS association: per city — pop×popWeight FIRST, then the six yields
        # in key order (empireScore's per-city loop).
        yt = torch.zeros(B, dtype=torch.float64, device=self.device)
        if not bool(self.rc_alive[:, r].any()):
            return yt.to(self.dtype)
        # ONE batched pass replaces the RC per-j _seat_city_yields calls (each
        # a full window gather + ~30 plane gathers + topk); the per-j
        # ACCUMULATION below keeps the loop's exact j order and op association
        # (this sum order is worth a real ±1 ulp). Serves every consumer —
        # leader() included — through this one body.
        F, PR, SC, CU, GO, FA = self._seat_city_yields_all(r)
        for j in range(self.RC):
            mask = self.rc_alive[:, r, j]
            if not bool(mask.any()):
                continue
            yt = yt + (self.rc_pop[:, r, j] * self.rc_alive[:, r, j].long()).double() * pw
            yt = yt + F[:, j] * float(w[0]) + PR[:, j] * float(w[1]) + GO[:, j] * float(w[2]) + SC[:, j] * float(w[3]) + CU[:, j] * float(w[4]) + FA[:, j] * float(w[5])
        return yt.to(self.dtype)

    def _rc_spec_count(self, r: int) -> torch.Tensor:
        """[B, RC] — COMPLETED SPECIALTY districts per city of civ seat r, the
        `completedDistrictCount(specialtyOnly)` twin: countsTowardLimit AND
        districtComplete, CITY_CENTER excluded by countsTowardLimit."""
        reg = self.rc_dist_tile[:, r]  # [B, RC, nD]
        comp = (reg >= 0) & self.district_complete.gather(1, reg.clamp(min=0).reshape(self.B, -1)).reshape(reg.shape)
        return (comp & self._is_specialty.reshape(1, 1, -1)).sum(dim=2)

    def _seat_city_yields_all(self, r: int, amen_yf: torch.Tensor | None = None) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
        """The batched-j twin of _seat_city_yields for the POST-STEP
        score/trace path (FRESH amenity factors, state frozen between j's)
        — one [B, RC, M] window + plane gather + a single topk instead of
        RC per-j passes. Returns (food, prod, sci, cul, gold, faith), each
        [B, RC], column j bit-identical to _seat_city_yields(r, j, mask):
        every op is the per-j op batched along the new dim (gathers and
        elementwise ops are shape-blind; the citizen sums ride the same
        _dyadic_fp guard, with the same sequential m-loop when it's off;
        int-valued matmuls/einsums are exact in f64 for any order; the
        wonder-multiplier product runs an explicit wonder-id-order loop —
        the TS registry order). Guards widened from per-j to any-j only
        gate adds of exact 0.0. _seat_phase keeps the per-j function: its
        frozen amen_yf and mid-phase sequencing are per-city by spec."""
        rd = self.rules_dev
        B, RC = self.B, self.RC
        alive = self.rc_alive[:, r]  # [B, RC]
        centers = self.rc_center[:, r]  # [B, RC]
        g = self._rcy_globals()
        # Window cache: centers move only on found/capture/transfer/
        # compaction, and every such site bumps _eff_version, so the per-r
        # window rides g's _eff_version lifetime.
        win = g.setdefault("win_r", {})
        tiles = win.get(r)
        if tiles is None:
            tiles = tiles_from_offsets(centers.reshape(-1), self._off3, self.W, self.H).reshape(B, RC, -1)
            win[r] = tiles
        M = tiles.shape[2]
        tc3 = tiles.clamp(min=0)
        tc = tc3.reshape(B, RC * M)

        def gat(plane: torch.Tensor) -> torch.Tensor:  # [B, T] -> [B, RC, M]
            return plane.gather(1, tc).reshape(B, RC, M)

        districted = (
            (self.center_at.gather(1, tc) >= 0)
            | (self.rc_at.gather(1, tc) >= 0)
            | (self.district.gather(1, tc) >= 0)
            | (self.built_wonder.gather(1, tc) >= 0)  # wonder tiles are not workable
        ).reshape(B, RC, M)
        valid = (
            (tiles >= 0)
            & (gat(self.civ_at) == r)
            # PER-CITY, not civ-level: the registry entry must be THIS city,
            # mirroring `t.cityId === city.id`. Without it two adjacent cities
            # of the same civ seat can both work one tile.
            & (gat(self.tile_city) == self.rc_id[:, r].unsqueeze(2))
            & gat(self.work_ok)
            & (tiles != centers.unsqueeze(2))
            & ~districted
        )
        f_plane = self._rcy_food_plane(r, g)
        p_plane = g["p_plane"]
        ty_oth = g["ty_oth"]
        oth_sc = g["oth_score"]
        _has_bel = self._r_has_beliefs(r)
        # Per-rc FOLLOWER-belief id [B, RC] (followed religion when LIVE, else
        # owner r+1).
        _fol_rc = self._follower_id_for(self._rc_rel(r)) if _has_bel else None
        featP = None
        if _has_bel:
            featP = self._belief_feat_plane(r)
            f_plane = f_plane + featP[:, :, 0]
            p_plane = p_plane + featP[:, :, 1]
            ty_oth = ty_oth + featP
            oth_sc = oth_sc + (featP[:, :, 2:].double() * g["w"][2:].reshape(1, 1, 4)).sum(dim=2)
        f = gat(f_plane).double()
        p = gat(p_plane).double()
        if self._mine_boost_tech.numel() > 0 and self.MINE >= 0:
            boost_r = (self.r_techs[:, r][:, self._mine_boost_tech].to(self.dtype) * self._mine_boost_amt).sum(dim=1).double()
            mine_here = (gat(self.improvement) == self.MINE) & ~gat(self.pillaged)
            p = p + mine_here.double() * boost_r.reshape(B, 1, 1)
        w = g["w"]
        s = f * w[0] + p * w[1] + gat(oth_sc)
        # ties break by GLOBAL tile index like the per-j path; valid keys are
        # collision-free (distinct tiles -> distinct keys), so the batched
        # topk picks the identical set in the identical order.
        key = torch.where(valid, s * 1e6 - tiles.double(), torch.tensor(-1e18, dtype=torch.float64, device=self.device))
        top_vals, top_idx = key.topk(M, dim=2)
        # The batched twin of the specialist merge — same predicate, applied
        # per city column so the two paths cannot drift.
        _ns_all = torch.zeros(B, RC, dtype=torch.long, device=self.device)
        _sa_all = torch.zeros(B, RC, 6, dtype=torch.float64, device=self.device)
        for _j in range(RC):
            _n1, _a1 = self._rc_specialists(r, _j, top_vals[:, _j], self.rc_pop[:, r, _j])
            _ns_all[:, _j] = _n1
            _sa_all[:, _j] = _a1
        take = (
            torch.arange(M, device=self.device).reshape(1, 1, M)
            < (self.rc_pop[:, r] - _ns_all).clamp(min=0).unsqueeze(2)
        ) & (top_vals > -1e17)
        f_sel = f.gather(2, top_idx) * take.double()
        p_sel = p.gather(2, top_idx) * take.double()
        sc = gat(ty_oth[:, :, 3]).double()
        cu = gat(ty_oth[:, :, 4]).double()
        go = gat(ty_oth[:, :, 2]).double()
        fa = gat(ty_oth[:, :, 5]).double()
        sc_sel = sc.gather(2, top_idx) * take.double()
        cu_sel = cu.gather(2, top_idx) * take.double()
        go_sel = go.gather(2, top_idx) * take.double()
        fa_sel = fa.gather(2, top_idx) * take.double()
        # center: real floored yields — the per-j block with [B] -> [B, RC]
        ctr = centers.clamp(min=0)
        r_ = self.rules
        strip = self.feat_stripped.gather(1, ctr).double()  # [B, RC]
        fy_c = self.feat_yields.gather(1, ctr.unsqueeze(2).expand(-1, -1, 6)).double()  # [B, RC, 6]
        cf = torch.maximum(f_plane.gather(1, ctr).double(), torch.tensor(float(r_.center_min_food), dtype=torch.float64, device=self.device))
        cp = torch.maximum(p_plane.gather(1, ctr).double(), torch.tensor(float(r_.center_min_production), dtype=torch.float64, device=self.device))
        c_sc = self.tile_yields[:, :, 3].gather(1, ctr).double() - fy_c[:, :, 3] * strip
        c_cu = self.tile_yields[:, :, 4].gather(1, ctr).double() - fy_c[:, :, 4] * strip
        c_go = self.tile_yields[:, :, 2].gather(1, ctr).double() - fy_c[:, :, 2] * strip
        c_fa = self.tile_yields[:, :, 5].gather(1, ctr).double() - fy_c[:, :, 5] * strip
        if _has_bel:
            featC = featP.gather(1, ctr.unsqueeze(2).expand(-1, -1, 6)).double()  # [B, RC, 6]
            c_sc = c_sc + featC[:, :, 3]
            c_cu = c_cu + featC[:, :, 4]
            c_go = c_go + featC[:, :, 2]
            c_fa = c_fa + featC[:, :, 5]
        if self._dyadic_fp:
            food = cf + f_sel.sum(dim=2) + _sa_all[:, :, 0]
            prod = cp + p_sel.sum(dim=2) + _sa_all[:, :, 1]
            sci = c_sc + sc_sel.sum(dim=2) + _sa_all[:, :, 3]
            cul = c_cu + cu_sel.sum(dim=2) + _sa_all[:, :, 4]
            gold = c_go + go_sel.sum(dim=2) + _sa_all[:, :, 2]
            faith = c_fa + fa_sel.sum(dim=2) + _sa_all[:, :, 5]
        else:
            food = cf + _sa_all[:, :, 0]
            prod = cp + _sa_all[:, :, 1]
            sci = c_sc + _sa_all[:, :, 3]
            gold = c_go + _sa_all[:, :, 2]
            faith = c_fa + _sa_all[:, :, 5]
            cul = c_cu + _sa_all[:, :, 4]
            for m in range(M):  # sequential adds mirror the per-j (TS) loop's rounding
                food = food + f_sel[:, :, m]
                prod = prod + p_sel[:, :, m]
                sci = sci + sc_sel[:, :, m]
                cul = cul + cu_sel[:, :, m]
        # Petra (the any-j guard is safe: absent cities add exact 0)
        compw = None
        if self._wond_n:
            wreg = self.rc_wonder[:, r]  # [B, RC, nW]
            compw = (wreg >= 0) & self.built_wonder_complete.gather(1, wreg.clamp(min=0).reshape(B, -1)).reshape_as(wreg)
            hasP = (compw & self._wond_petra.reshape(1, 1, -1)).any(dim=2)  # [B, RC]
            if bool(hasP.any()):
                sel_tiles = tc3.gather(2, top_idx)  # [B, RC, M] the worked tiles
                st = sel_tiles.reshape(B, RC * M)
                qual = (
                    self.desert.gather(1, st).reshape(B, RC, M)
                    & (self.feat_id.gather(1, st).reshape(B, RC, M) != self._fp_fid)
                    & (self.district.gather(1, st).reshape(B, RC, M) < 0)
                    & take
                )
                nq = (qual & hasP.unsqueeze(2)).sum(dim=2).double()
                food = food + 2.0 * nq
                gold = gold + 2.0 * nq
                prod = prod + nq
        # WATER MILL, the civ-seat twin of the seat-0 term: farm-improved
        # BONUS resources gain +1 food, POST-selection over the worked set
        # like Petra above.
        wm_r = self.rc_bldg[:, r][:, :, rd.b_farmbonus]  # [B, RC, n]
        if wm_r.numel() and bool(wm_r.any()):
            has_wm = wm_r.any(dim=2)  # [B, RC]
            sel_t = tc3.gather(2, top_idx).reshape(B, RC * M)
            elig = (
                (self.improvement.gather(1, sel_t) == self.FARM)
                & (self.res_cat.gather(1, sel_t) == 1)
                & (self.res_imp.gather(1, sel_t) == self.FARM)
            ).reshape(B, RC, M) & take
            food = food + (elig & has_wm.unsqueeze(2)).sum(dim=2).double()
        # Completed-district floored adjacency. State is frozen here
        # (post-step), so ONE _adj_district_count serves every j.
        if self.districts_on:
            reg = self.rc_dist_tile[:, r]  # [B, RC, nD]
            if bool((reg >= 0).any()):
                for di, dd in enumerate(self.districts_cat):
                    yc = int(dd.get("adjYield", -1))
                    if yc < 0:
                        continue
                    tile_d = reg[:, :, di]  # [B, RC]
                    has = alive & (tile_d >= 0)
                    if not bool(has.any()):
                        continue
                    has = has & self.district_complete.gather(1, tile_d.clamp(min=0))
                    has = has & ~self.district_pillaged.gather(1, tile_d.clamp(min=0))  # pillaged = dark
                    if not bool(has.any()):
                        continue
                    adjf = self._district_adj_floor(di).gather(1, tile_d.clamp(min=0)).double()  # (memoised)
                    add = torch.where(has, adjf, torch.zeros_like(adjf))
                    if di == self._hs_idx and _has_bel:  # Work Ethic (per-city)
                        prod = prod + add * self._fol_tab("we", _fol_rc)
                    if yc == 3:
                        sci = sci + add
                    elif yc == 4:
                        cul = cul + add
                    elif yc == 0:
                        food = food + add
                    elif yc == 1:
                        prod = prod + add
                    elif yc == 2:
                        gold = gold + add
                    elif yc == 5:
                        faith = faith + add
        # Building yields (int-valued matmul: exact in any order)
        if self.districts_on:
            selb = self.rc_bldg[:, r] & ~self._rc_bdark(self.rc_dist_tile[:, r]) & ~self._b_regional.reshape(1, 1, -1)  # [B, RC, NB] (pillaged dark; regional delivered by range)
            if bool(selb.any()):
                add6 = selb.double() @ self.rules_dev.b_yields.double()  # [B, RC, 6]
                food = food + add6[:, :, 0]
                prod = prod + add6[:, :, 1]
                gold = gold + add6[:, :, 2]
                faith = faith + add6[:, :, 5]
                sci = sci + add6[:, :, 3]
                cul = cul + add6[:, :, 4]
                if _has_bel:  # belief building adds (int rows)
                    # founder (Stewardship) per-seat + follower (Feed the World
                    # / Choral Music) per-city; disjoint int keys => exact split.
                    badd = torch.einsum("bjn,bnk->bjk", selb.double(), self._bel_add_pf("bldgY", r))
                    badd = badd + torch.einsum("bjn,bjnk->bjk", selb.double(), self._fol_tab("bldgY", _fol_rc))
                    food = food + badd[:, :, 0]
                    prod = prod + badd[:, :, 1]
                    gold = gold + badd[:, :, 2]
                    sci = sci + badd[:, :, 3]
                    cul = cul + badd[:, :, 4]
                    faith = faith + badd[:, :, 5]
                # SHIPYARD: the completed Harbor's LIVE floor(adjacency)
                if self._harbor_idx >= 0 and self._shipyard_bidx >= 0:
                    hb_tile = self.rc_dist_tile[:, r, :, self._harbor_idx]  # [B, RC]
                    has_sy = alive & selb[:, :, self._shipyard_bidx] & (hb_tile >= 0)
                    has_sy = has_sy & self.district_complete.gather(1, hb_tile.clamp(min=0))
                    if bool(has_sy.any()):
                        hadj = self._district_adj_floor(self._harbor_idx).gather(1, hb_tile.clamp(min=0)).double()  # (memoised)
                        prod = prod + torch.where(has_sy, hadj, torch.zeros_like(hadj))
        # PALACE on the capital slot — the per-j twin's add, j-batched.
        _isc_palA = (self.rc_is_cap[:, r] & alive).double()  # [B, RC]
        if bool((_isc_palA != 0).any()):
            _pal6A = self._palace_y.double()
            food = food + _pal6A[0] * _isc_palA
            prod = prod + _pal6A[1] * _isc_palA
            gold = gold + _pal6A[2] * _isc_palA
            sci = sci + _pal6A[3] * _isc_palA
            cul = cul + _pal6A[4] * _isc_palA
            faith = faith + _pal6A[5] * _isc_palA
        # Regional-building yields, j-batched — state is frozen here
        # (post-step), so ONE _seat_regional serves every receiver.
        # Integer f64: batching is exact.
        _regional_all = self._seat_regional(r)
        if _regional_all is not None:
            _ra = _regional_all[0]  # [B, RC, 6]
            food = food + _ra[:, :, 0]
            prod = prod + _ra[:, :, 1]
            gold = gold + _ra[:, :, 2]
            sci = sci + _ra[:, :, 3]
            cul = cul + _ra[:, :, 4]
            faith = faith + _ra[:, :, 5]
        # Completed wonders — flat city yields + belief faithPerWonder
        if compw is not None and bool(compw.any()):
            wcy = compw.double() @ self._wond_cy  # [B, RC, 6] (int-valued)
            food = food + wcy[:, :, 0]
            prod = prod + wcy[:, :, 1]
            gold = gold + wcy[:, :, 2]
            sci = sci + wcy[:, :, 3]
            cul = cul + wcy[:, :, 4]
            faith = faith + wcy[:, :, 5]
            if _has_bel:
                faith = faith + self._fol_tab("fpw", _fol_rc) * compw.sum(dim=2).double()  # per-city Divine Inspiration
        # Founder capital incomes (per-seat values, applied at the capital)
        if _has_bel:
            perF = self._bel_add("perF", r)  # [B, 7]
            perC = self._bel_add("perC", r)  # [B, 6]
            followers = (self.rc_pop[:, r] * self.rc_alive[:, r].long()).sum(dim=1).double()
            times = torch.where(perF[:, 0] > 0, torch.floor(followers / perF[:, 0].clamp(min=1)), torch.zeros_like(followers))
            capY = perF[:, 1:] * times.unsqueeze(1) + perC * self.rc_alive[:, r].sum(dim=1).double().unsqueeze(1)
            isc = (self.rc_is_cap[:, r] & alive).double()  # [B, RC]
            food = food + capY[:, 0].unsqueeze(1) * isc
            prod = prod + capY[:, 1].unsqueeze(1) * isc
            gold = gold + capY[:, 2].unsqueeze(1) * isc
            sci = sci + capY[:, 3].unsqueeze(1) * isc
            cul = cul + capY[:, 4].unsqueeze(1) * isc
            faith = faith + capY[:, 5].unsqueeze(1) * isc
        # This seat's government + slotted-policy flat yields — cityYields to
        # every alive city, capitalYields to the capital — pre-tier, the
        # computeCityStats `bonuses` position. Same channels as seat 0's path
        # (getModifiers layers gov+policy into these mods).
        _gym = None  # bound only inside the branch below
        if self._gov_has_effects:
            gcity, gcap, _gh, _gym, *_ = self._gov_policy_mods_cached(r, self.r_civics[:, r])  # housing is applied on the housing path; slots stay unconsumed here
            acell = alive.double()  # [B, RC]
            gisc = (self.rc_is_cap[:, r] & alive).double()  # [B, RC]
            food = food + gcity[:, 0].unsqueeze(1) * acell + gcap[:, 0].unsqueeze(1) * gisc
            prod = prod + gcity[:, 1].unsqueeze(1) * acell + gcap[:, 1].unsqueeze(1) * gisc
            gold = gold + gcity[:, 2].unsqueeze(1) * acell + gcap[:, 2].unsqueeze(1) * gisc
            sci = sci + gcity[:, 3].unsqueeze(1) * acell + gcap[:, 3].unsqueeze(1) * gisc
            cul = cul + gcity[:, 4].unsqueeze(1) * acell + gcap[:, 4].unsqueeze(1) * gisc
            faith = faith + gcity[:, 5].unsqueeze(1) * acell + gcap[:, 5].unsqueeze(1) * gisc
        # CS envoy bonuses, j-batched — the 3/6 tiers land on this seat's
        # tier-1 (>=3) / tier-2 (>=6) BUILDINGS, the capital yield at 1+
        # envoys, and the suzerain's per-CS unique perk. Integer-valued adds
        # in f64: batching is exact.
        if self.S > 0 and bool((self.cs_r_envoys[:, r] > 0).any()):
            _acs = self.cs_alive.double()
            _isc = (self.rc_is_cap[:, r] & alive).double()  # [B, RC]
            # 3/6-envoy BUILDING adds — the rc_bldg presence with
            # pillaged-dark + regional-skip, so pillage/regional match
            # cityBuildingYields exactly.
            _cols6 = None
            if self.districts_on:
                selb_cs = self.rc_bldg[:, r] & ~self._rc_bdark(self.rc_dist_tile[:, r]) & ~self._b_regional.reshape(1, 1, -1)  # [B, RC, NB]
                if bool(selb_cs.any()):
                    _nBc = selb_cs.shape[2]
                    per3 = (self.cs_r_envoys[:, r] >= 3).double() * self._cs_district_bonus * _acs * (self._cs_b1idx >= 0).double()
                    per6 = (self.cs_r_envoys[:, r] >= 6).double() * self._cs_district_bonus * _acs * (self._cs_b2idx >= 0).double()
                    csb6f = torch.zeros(B, _nBc * 6, dtype=torch.float64, device=self.device)
                    csb6f.scatter_add_(1, self._cs_b1idx.clamp(min=0) * 6 + self._cs_yidx, per3)
                    csb6f.scatter_add_(1, self._cs_b2idx.clamp(min=0) * 6 + self._cs_yidx, per6)
                    csb6 = csb6f.reshape(B, _nBc, 6)
                    _cs6_all = torch.einsum("bjn,bnk->bjk", selb_cs.double(), csb6)  # [B, RC, 6]
                    _cols6 = [_cs6_all[:, :, _k] for _k in range(6)]
            tier1_r = ((self.cs_r_envoys[:, r] >= 1) & self.cs_alive).double() * float(self.rules.cs.get("capitalBonus", 2))
            capb_r = torch.zeros(B, 6, dtype=torch.float64, device=self.device)
            capb_r.scatter_add_(1, self._cs_yidx, tier1_r)
            # Suzerain unique perk — this seat's STRICT isSuzerain
            # (>= suz_min, > seat 0, > every other civ seat).
            suz_min = int(self.rules.cs.get("suzerainEnvoys", 3))
            _oth = self.cs_r_envoys.clone()
            _oth[:, r] = -1
            r_suz = (self.cs_r_envoys[:, r] >= suz_min) & (self.cs_r_envoys[:, r] > self.cs_envoys) & (self.cs_r_envoys[:, r] > _oth.max(dim=1).values) & self.cs_alive
            suz_valr = r_suz.double() * self._cs_suz_amt * (self.cs_suz_key >= 0).double()  # [B, S]
            capb_r.scatter_add_(1, self.cs_suz_key.clamp(min=0), suz_valr)
            if _cols6 is not None:
                food = food + _cols6[0]
                prod = prod + _cols6[1]
                gold = gold + _cols6[2]
                sci = sci + _cols6[3]
                cul = cul + _cols6[4]
                faith = faith + _cols6[5]
            food = food + capb_r[:, 0].unsqueeze(1) * _isc
            prod = prod + capb_r[:, 1].unsqueeze(1) * _isc
            gold = gold + capb_r[:, 2].unsqueeze(1) * _isc
            sci = sci + capb_r[:, 3].unsqueeze(1) * _isc
            cul = cul + capb_r[:, 4].unsqueeze(1) * _isc
            faith = faith + capb_r[:, 5].unsqueeze(1) * _isc
        # Outgoing unraided route income — pre-tier, the per-j twin's position
        # (integer-valued adds in f64: batching is exact).
        _route_inc = self._seat_route_income(r)
        if _route_inc is not None:
            a6 = alive.double()
            food = food + _route_inc[:, :, 0] * a6
            prod = prod + _route_inc[:, :, 1] * a6
            gold = gold + _route_inc[:, :, 2] * a6  # CS-route gold/specialty
            sci = sci + _route_inc[:, :, 3] * a6
            cul = cul + _route_inc[:, :, 4] * a6
            faith = faith + _route_inc[:, :, 5] * a6
        # Slotted Great Works — culture/turn per work BY KIND (writing 2,
        # music 4), the buildings-tier position (pre-tier, so it rides yf
        # below like TS's total.culture). Gated by alive; dead slots reset.
        # The .double() PRECEDES the scalar multiply — a python float times a
        # long tensor promotes to the DEFAULT dtype, not f64. Association
        # mirrors greatWorkCulture.
        cul = cul + (
            self._gw_cul_k[0] * self.rc_gw_writing[:, r].double()
            + self._gw_cul_k[1] * self.rc_gw_art[:, r].double()
            + self._gw_cul_k[2] * self.rc_gw_music[:, r].double()
        ) * alive.double()
        # RELIC faith, at the same position as the seat-0 term.
        faith = faith + self._relic_faith * self.rc_relics[:, r].double() * alive.double()
        # Golden PEN, BRUSH AND VOICE — +1 Culture per COMPLETED SPECIALTY
        # district, keyed on THIS seat's own dedication. PRE-TIER, like every
        # other culture term here, so it rides `yf`.
        _pb_r = self._golden_ded(r + 1, self._ded_pen_brush)
        if bool(_pb_r.any()):
            _spec_r = self._rc_spec_count(r)
            cul = cul + _pb_r.to(cul.dtype).unsqueeze(1) * _spec_r.to(cul.dtype) * alive.to(cul.dtype)
        # FRESH amenity tier on the external-caller path — one call replaces
        # RC identical per-j calls; elementwise scaling is exact. The economy
        # loop passes its loop-top FROZEN factors instead (the amen_yf
        # contract).
        # The CITIZENS bucket sits INSIDE the tier, where computeCityStats
        # puts it: the Amenities yield modifier applies to the city's whole
        # non-food output.
        _popa = self.rc_pop[:, r].double()  # [B, RC]
        sci = sci + self.rules.citizen_science * _popa
        cul = cul + self.rules.citizen_culture * _popa
        yf = amen_yf if amen_yf is not None else self._seat_amenity(r)[2]  # [B, RC]
        prod = prod * yf
        sci = sci * yf
        cul = cul * yf
        gold = gold * yf
        faith = faith * yf
        # This seat's GOVERNMENT/POLICY yieldMult, in the same position as
        # seat 0's — the tier factor first, then ymult, then the wonder
        # multipliers.
        if _gym is not None:
            prod = prod * _gym[:, 1].unsqueeze(1)
            gold = gold * _gym[:, 2].unsqueeze(1)
            sci = sci * _gym[:, 3].unsqueeze(1)
            cul = cul * _gym[:, 4].unsqueeze(1)
            faith = faith * _gym[:, 5].unsqueeze(1)
            food = food * _gym[:, 0].unsqueeze(1)
        # Wonder yield multipliers AFTER the tier scaling — an EXPLICIT
        # wonder-id-order product (the TS registry order): shape-independent.
        if compw is not None and bool(compw.any()):
            ones6 = torch.ones(1, 1, 6, dtype=torch.float64, device=self.device)
            wmm = torch.ones(B, RC, 6, dtype=torch.float64, device=self.device)
            for wi in range(compw.shape[2]):
                wmm = wmm * torch.where(compw[:, :, wi : wi + 1], self._wond_mult[wi].reshape(1, 1, 6), ones6)
            food = food * wmm[:, :, 0]
            prod = prod * wmm[:, :, 1]
            gold = gold * wmm[:, :, 2]
            sci = sci * wmm[:, :, 3]
            cul = cul * wmm[:, :, 4]
            faith = faith * wmm[:, :, 5]
        z = torch.zeros_like(food)
        return (
            torch.where(alive, food, z),
            torch.where(alive, prod, z),
            torch.where(alive, sci, z),
            torch.where(alive, cul, z),
            torch.where(alive, gold, z),
            torch.where(alive, faith, z),
        )

    def _rcy_all_cached(self, r: int, amen_yf: torch.Tensor) -> tuple:
        """The economy loop's keyed slot over the batched twin (with the
        loop's FROZEN amenity factors). Key exactness — every mid-loop
        mutation that can change a LATER column's yields bumps a component:
        completions/paves/founding/civic-completion (_eff_version), belief
        claims (_bel_version), the economy strike-kill (_rp_kill_version,
        the route raided-mask), border claims landing inside a later
        same-seat window (_claim_version — civ_at is the valid-mask input;
        claims elsewhere, and any r0 claim seen by r1, cannot flip a valid
        bit: a claimed tile goes -1 -> r0, never == r1). Pop is own-column
        and written only AT its iteration, after its yields are consumed.
        BUILDINGS are NOT own-column — a regional building completed/bought
        at j's iteration reaches LATER columns via _seat_regional — so every
        rc_bldg write site bumps _eff_version. The one live read a snapshot
        cannot honor is capY's seat-total follower pop under beliefs; the
        economy loop keeps the per-j path for capital columns in that case
        (see the call site). Post-phase callers (trace/leader/civ_score) stay
        on the raw twin: fresh amenity factors, post-war state."""
        key = (self.turn, r, self._eff_version, self._bel_version, self._rp_kill_version, self._claim_version)
        if self._rcy_all_cache is not None and self._rcy_all_cache[0] == key:
            return self._rcy_all_cache[1]
        out = self._seat_city_yields_all(r, amen_yf=amen_yf)
        self._rcy_all_cache = (key, out)
        return out

    def leader(self) -> torch.Tensor:
        """[B] the current score-leader as a unified civ id — 0 = seat 0,
        r+1 = civ index r. Ties → lowest id (seat 0 first, then the lowest
        civ index), matching TS's strict-`>` scan — via first_argmax
        (torch.argmax's tie pick is unspecified)."""
        cols = [self.empire_score()] + [self.civ_empire_score(r) for r in range(self.R)]
        return first_argmax(torch.stack(cols, dim=1))

    def protagonist(self) -> torch.Tensor:
        """[B] the POST-HOC protagonist as a unified civ id (0 = seat 0,
        r+1 = civ index r): the WINNER where the game produced one, else the
        score-leader among actors that still hold a city, else leader()'s
        plain pick. A finished game reads from whichever seat earned the
        horizon, so no single seat's fate invalidates a seed. Read-side
        only: nothing in the simulation consults it, and the wire records
        every seat, so any pick has a complete trajectory to read."""
        cols = [self.empire_score()] + [self.civ_empire_score(r) for r in range(self.R)]
        scores = torch.stack(cols, dim=1)  # [B, 1+R]
        has_city = torch.stack(
            [self.alive.any(dim=1)] + [self.rc_alive[:, r].any(dim=1) for r in range(self.R)], dim=1)
        fenced = torch.where(has_city, scores, torch.full_like(scores, float("-inf")))
        pick = torch.where(has_city.any(dim=1), first_argmax(fenced), first_argmax(scores))
        return torch.where(self.winner >= 0, self.winner, pick)

    def _domination(self) -> torch.Tensor:
        """[B] the unified civ id holding EVERY original capital (capitalTiles:
        cap_tile_player + cap_tile_civ), else -1. Owner of a capital tile: 0 if
        a seat-0 city is centered there (center_at>=0), else rc_at+1 (civ index
        -> civ id), else -1 (razed). Mirrors dominationWinner: a solo game
        (R==0) never dominates; any unowned or split capital -> -1."""
        B, dev = self.B, self.device
        if self.R == 0:
            return torch.full((B,), -1, dtype=torch.long, device=dev)
        caps = torch.cat([self.cap_tile_player.unsqueeze(1), self.cap_tile_civ[:, : self.R]], dim=1)  # [B, 1+R] capitalTiles — survives rc compaction
        p_owns = self.center_at.gather(1, caps) >= 0
        rv = self.rc_at.gather(1, caps)  # civ index or -1
        owner = torch.where(p_owns, torch.zeros_like(rv), torch.where(rv >= 0, rv + 1, torch.full_like(rv, -1)))
        bad = (owner < 0).any(dim=1) | (owner != owner[:, :1]).any(dim=1)
        return torch.where(bad, torch.full((B,), -1, dtype=torch.long, device=dev), owner[:, 0])

    # --- action masks (the macro-action surface) --------------------------------

    def _res_avail_mask(self, owned: torch.Tensor) -> torch.Tensor:
        """[B, NU] — for every roster unit, does the seat owning the `owned`
        [B,T] tiles have strategic-resource ACCESS to build/buy it? A tile
        provides access to its resource iff it carries a resource, its
        improvement matches the resource's required improvement (res_imp, the
        exported `rq` plane), it is unpillaged, and the seat owns it. Ungated
        units are all-True; an empty requirement set short-circuits. Mirrors
        civHasStrategic."""
        B, dev = self.B, self.device
        out = torch.ones(B, self.NU, dtype=torch.bool, device=dev)
        if not self._res_unit_pairs:
            return out
        provides = (self.res_id >= 0) & (self.improvement == self.res_imp) & ~self.pillaged & owned  # [B,T]
        for u_idx, res_idx in self._res_unit_pairs:
            out[:, u_idx] = (provides & (self.res_id == res_idx)).any(dim=1)
        return out
