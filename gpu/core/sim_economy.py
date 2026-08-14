"""The economy floor: war weariness, costs, districts, adjacency, yields, city totals, scores.

One mixin of BatchSim (assembled in engine.py); state and helpers live on
self / gpu/core/simbase.py.
"""
from __future__ import annotations

from .simbase import *  # noqa: F401,F403 — torch, constants, helpers: the shared floor
from .simbase import _MUTABLE  # noqa: F401 — private names do not ride a star import
from . import simbase  # the PATCHABLE globals (the pool caps/_ALIAS_CHECK) must be read live


class SimEconomy:
    def _luxury_amenities(self, row: int, amen_have: torch.Tensor, amen_need: torch.Tensor) -> torch.Tensor:
        """[B, cols] luxuryAmenities mirror for seat row `row` (0 = seat 0,
        r+1 = civ r): each UNIQUE improved luxury inside THIS seat's borders —
        tile.improvement equals the resource's OWN improvement, and pillage
        does NOT suspend it — grants +1 amenity to the luxAmenityCities
        NEEDIEST cities. Grants feed back into the ranking (need desc, ties by
        array position asc = column order under append+reclaim), and rounds are
        homogeneous, so only the per-game COUNT of active luxuries matters.
        Runs in the CALLER's dtype: the grants add straight into `amen_have`,
        which is self.dtype on row 0 and f64 on a civ row."""
        B = self.B
        cols = self.RC
        dt = amen_have.dtype
        out = torch.zeros(B, cols, dtype=dt, device=self.device)
        if self._n_lux == 0 or not self.improvements_on:
            return out
        alive = self.city_alive[:, row, :cols]
        improved = (self.lux_id >= 0) & (self.tile_seat == row) & (self.improvement == self.lux_req)
        counts = torch.zeros(B, self._n_lux, dtype=torch.long, device=self.device)
        counts.scatter_add_(1, self.lux_id.clamp(min=0), improved.long())
        rounds = (counts > 0).long().sum(dim=1)  # [B] unique improved luxuries
        mx = int(rounds.max().item())
        if mx == 0:
            return out
        seq = torch.arange(cols, device=self.device, dtype=dt)  # tie: earlier array position = lower column
        k = min(self._lux_k, cols)
        for rnd in range(mx):
            act = rounds > rnd
            need = amen_need - (amen_have + out)
            key = torch.where(alive, need * 64 - seq, torch.full_like(need, -1e9))
            top_v, top_i = key.topk(k, dim=1)
            grant = (top_v > -1e8) & act.unsqueeze(1)
            out.scatter_add_(1, top_i, grant.to(dt))
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
        s = self.military_at.gather(1, tile.clamp(min=0).unsqueeze(1)).squeeze(1)
        return torch.where(s >= 0, self.unit_seat.gather(1, s.clamp(min=0).unsqueeze(1)).squeeze(1),
                           torch.full_like(s, NO_SEAT))

    def _tile_civ_seat(self, tile: torch.Tensor) -> torch.Tensor:
        """[B] long - the SEAT of the civilian on `tile`, NO_SEAT if none."""
        s = self.civilian_at.gather(1, tile.clamp(min=0).unsqueeze(1)).squeeze(1)
        return torch.where(s >= 0, self.unit_seat.gather(1, s.clamp(min=0).unsqueeze(1)).squeeze(1),
                           torch.full_like(s, NO_SEAT))

    def _atk_seat(self, atk_kind: str, u: int) -> torch.Tensor:
        """[B] long - the SEAT of the attacker in pool slot `u`.
        `_hostile_vs_unit` and `_hostile_ranged_strike` are pool-generic over
        atk_kind, so their seat is too."""
        return getattr(self, f"{atk_kind}_unit_seat")[:, u]

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
        return ((self.military_at.gather(1, t).squeeze(1) >= 0).long()
                | ((self.civilian_at.gather(1, t).squeeze(1) >= 0).long() << 1))

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
        n = self.civ_pair_warkind.shape[1]
        flat = (row.clamp(1, max(n, 1)) - 1) * n + (foe_row.clamp(1, max(n, 1)) - 1)
        kind = self.civ_pair_warkind.reshape(self.B, -1).gather(1, flat.unsqueeze(1)).squeeze(1) & rr
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
            _n = self.civ_pair_allied.shape[1]
            _fl = (self_row.clamp(1, max(_n, 1)) - 1) * _n + (owner.clamp(1, max(_n, 1)) - 1)
            _ally = self.civ_pair_allied.reshape(self.B, -1).gather(1, _fl.unsqueeze(1)).squeeze(1) & _rr
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

    def _citystate_suzerain_release(self, r: int, peace: torch.Tensor) -> None:
        """Making peace with a civ ALSO ends the wars its city-states were
        dragged into — the `makePeace` loop that walks `state.cityStates` and
        clears every `cs.atWar` whose suzerain is that civ.

        The suzerain test is `isSuzerain`'s: at least `suzerainEnvoys`,
        strictly above seat 0, strictly above every other civ."""
        if self.S <= 0 or not bool(peace.any()):
            return
        suz_min = int(self.rules.citystate.get("suzerainEnvoys", 3))
        _oth = self.civ_only_citystate_envoys.clone()
        _oth[:, r] = -1
        civ_only_suz = (
            (self.civ_only_citystate_envoys[:, r] >= suz_min)
            & (self.civ_only_citystate_envoys[:, r] > self.citystate_envoys)
            & (self.civ_only_citystate_envoys[:, r] > _oth.max(dim=1).values)
            & self.citystate_alive
        )
        rel = civ_only_suz & self.citystate_atwar & peace.unsqueeze(1)
        if not bool(rel.any()):
            return
        self.citystate_atwar &= ~rel
        # `citystate_war_turns` is a VIEW of `war_turns` — a rebind orphans it, so the
        # clock must be written IN PLACE.
        self.citystate_war_turns.masked_fill_(rel, 0)
        _cs0 = 1 + max(self.R, 1)
        for _s in range(self.S):
            self._ww_peace(rel[:, _s], 0, _cs0 + _s)

    def _ww_penalty(self, row: int, dtype=None) -> torch.Tensor:
        """[B] a seat row's war-weariness amenity penalty (integer floor, then
        dtype) - `warWearinessPenalty(wwMax(...))` on that row. The civ yield
        paths pass float64 explicitly; seat 0 takes the engine dtype."""
        per = int(self.rules.war_weariness.get("perAmenity", 400))
        return torch.div(self._ww_max(row), per, rounding_mode="floor").to(dtype or self.dtype)

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

    def _seat_settlers(self, row: int) -> torch.Tensor:
        """[B] seat row `row`'s LIVE settler units — what the settlerCost
        escalator counts. `settlerCount` filters ONE array by seat; so does
        this, over the ONE shared window."""
        if self._settler_idx < 0:
            return torch.zeros(self.B, dtype=torch.long, device=self.device)
        return (self.major_unit_alive & (self.major_unit_seat == row)
                & (self.major_unit_type == self._settler_idx)).sum(dim=1)

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

    def _district_discounted(self, row: int, di: int) -> torch.Tensor:
        """districtDiscounted for seat-row `row` (0 = seat 0, r+1 = civ r):
        [B] bool — 40% off specialty type di while the seat has PLACED fewer
        of it than ceil(D/U) with D = COMPLETED specialty districts in the
        row's city registry, U = its OWN unlocked specialty types, D ≥ U."""
        if not bool(self._is_specialty[di]):
            return torch.zeros(self.B, dtype=torch.bool, device=self.device)
        U = self._unlocked_specialty_count(self._seat_techs(row), self._seat_civics(row))
        placed = self.city_dist_tile[:, row]  # [B, cols, nD] tile per (city, type)
        n = (placed[:, :, di] >= 0).sum(dim=1)
        tiles_f = placed.clamp(min=0).reshape(self.B, -1)
        comp = (placed >= 0) & self.district_complete.gather(1, tiles_f).reshape(placed.shape)
        D = (comp & self._is_specialty.reshape(1, 1, -1)).sum(dim=(1, 2))
        thresh = torch.div(D + U.clamp(min=1) - 1, U.clamp(min=1), rounding_mode="floor")  # ceil(D/U)
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
        the full [B, T, 6] assembly.

        A CHOPPED or founding-stripped feature is subtracted HERE, at the top,
        because tileYields reads `tile.feature` live at the terrain step and
        the drought floor is the LAST thing it does. Subtracting afterwards
        (as every caller used to) puts the floor on the wrong side: a stripped
        RAINFOREST/MARSH on a 0-food terrain under drought floors to 0 and
        then goes to −1. Callers must NOT strip column 0 again."""
        if self._food_cache is not None and self._food_cache[0] == self._eff_version:
            return self._food_cache[1]
        base = self.tile_yields[:, :, 0]
        if bool(self.feat_stripped.any()):
            base = base - self.feat_yields[:, :, 0] * self.feat_stripped.to(self.dtype)
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
        # on every column — TS reads tile.feature === null live. Columns 1: only:
        # _eff_food already stripped column 0 BEFORE its drought floor, which is
        # where tileYields puts it, and the floor is not commutative with the
        # subtraction. Production and the static columns carry no floor, so
        # subtracting after their overwrites is exact.
        if bool(self.feat_stripped.any()):
            ty[:, :, 1:] = ty[:, :, 1:] - self.feat_yields[:, :, 1:].to(ty.dtype) * self.feat_stripped.unsqueeze(-1).to(ty.dtype)
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
            row6 = rows.unsqueeze(1).expand(-1, 6).reshape(-1)
            nbf = nb.reshape(-1)
            on = nbf >= 0
            self._scorch(row6[on], nbf[on])
            self._fertilize_counted(row6[on], nbf[on])

        r = self._next_random(every)
        hit, tile = self._pick_static(r < 0.02, self._droughtc_list)
        if bool(hit.any()):
            rows = hit.nonzero(as_tuple=True)[0]
            area = tiles_from_offsets(tile[rows], self._off2, self.W, self.H)  # [R, 19]
            M = area.shape[1]
            rowm = rows.unsqueeze(1).expand(-1, M).reshape(-1)
            af = area.reshape(-1)
            on = (af >= 0) & ~self.water[rowm, af.clamp(min=0)]
            flat = self.drought.reshape(-1)
            gi = rowm[on] * self.T + af[on]
            flat.scatter_reduce_(0, gi, torch.full_like(gi, 8), reduce="amax")

        r = self._next_random(every)
        hit, tile = self._pick_static(r < 0.04, self._land_list)
        if bool(hit.any()):
            rows = hit.nonzero(as_tuple=True)[0]
            area = tiles_from_offsets(tile[rows], self._off1, self.W, self.H)  # [R, 7]
            M = area.shape[1]
            rowm = rows.unsqueeze(1).expand(-1, M).reshape(-1)
            af = area.reshape(-1)
            valid = af >= 0
            self._scorch(rowm[valid], af[valid])  # a storm scorches its whole area
            on = valid & self.desert[rowm, af.clamp(min=0)]
            self._fertilize(rowm[on], af[on])  # ...and deposits silt on desert tiles

    def _buildable(self, include_worship: bool = False) -> torch.Tensor:
        """[B, C, NB] buildings each city could queue now: unlocked (tech), not
        already built, river gate — and for district buildings, the city owns a
        completed district of the required type and has a prerequisite building
        (mirrors availableBuildings)."""
        if self._bld_cache is not None and self._bld_cache[0] == self._eff_version:
            return self._bld_cache[1]
        rd = self.rules_dev
        B, C, NB, dev = self.B, self.RC, self.NB, self.device
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
        # hasRiver at each centre, read off the static tile plane (a dead
        # slot's site is -1; its column is masked by `alive` downstream).
        river_c = self.tile_river.gather(1, self.site.clamp(min=0))  # [B, C]
        base = unlocked.unsqueeze(1) & ~self.buildings & (~rd.b_river.reshape(1, 1, -1) | river_c.unsqueeze(2))
        if not include_worship:
            # Worship buildings are faith-purchase ONLY: `queueBuilding`
            # refuses them outright, but they ARE legal for
            # `purchaseBuilding` — hence the two masks.
            base = base & ~self._b_worship.reshape(1, 1, -1)
        if self.districts_on and self._b_has_reqs:
            nD = len(self.districts_cat)
            valid = (self.district >= 0) & self.district_complete & (self.tile_seat == 0) & ~self.district_dead  # [B, T] (buildingCompletable: district DONE; captured = dead)
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
        districts (self.district) and civ-seat city centers (civ_city_at, which
        carry tile.district='CITY_CENTER' in TS). No owner filter, mirroring
        matchesAdjacency('DISTRICT')."""
        if self._adjd_cache is not None and self._adjd_cache[0] == self._eff_version:
            return self._adjd_cache[1]
        nb = self.neigh
        nbc = nb.clamp(min=0)
        on_map = (nb >= 0).unsqueeze(0)  # [1, T, 6]
        is_d = ((self.center_at[:, nbc] >= 0) | ((self.district[:, nbc] >= 0) & self.district_complete[:, nbc]) | (self.civ_city_at[:, nbc] >= 0)) & on_map
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
        is_c = ((self.center_at[:, nbc] >= 0) | (self.civ_city_at[:, nbc] >= 0)) & on_map
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

    def _gov_mods(self, row: int):
        """getModifiers' government + slotted-policy layer for seat row `row`,
        cached on (row, _eff_version).

        The only mutable input is the row's researched civics and every civic
        completion bumps _eff_version, so the eff epoch is a complete key; the
        ABSOLUTE row is the rest of it, and the tensor is never hashed.
        Consumers only READ the returned tuple, so sharing one object across
        the per-city loop is safe."""
        if self._gov_pol_cache is None or self._gov_pol_cache[0] != self._eff_version:
            self._gov_pol_cache = (self._eff_version, {})
        d = self._gov_pol_cache[1]
        v = d.get(row)
        if v is None:
            v = self._gov_policy_mods(self._seat_civics(row))
            d[row] = v
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
        elig = ((self.owner == c) & surface & (self.district < 0) & (self.built_wonder < 0) & (self.improvement < 0) & (self.res_priority <= 1) & (self.pair_dist[site_c] <= 3))
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
            self.dist_tile[rows, c, di] = bt  # row-0 registry, written at queue like the civ arm's
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
        center = self.civ_city_center[:, r, j].clamp(min=0)
        surface = self.coastal_water if placement == 2 else self.d_usable
        d_center = self.pair_dist[center]  # [B, T]
        elig = (
            (self.civ_at == r)
            & (self.tile_city == self.civ_city_id[:, r, j].unsqueeze(1))  # THIS city's registry, not merely civ-owned
            & surface
            & (self.district < 0)
            & (self.built_wonder < 0)
            & (self.civ_city_at < 0)  # sibling centers carry district='CITY_CENTER' in TS
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
        complete stays False), civ_city_qtile remembers the completion target, the
        per-city registry gains the type. Returns the placed mask."""
        elig, adjf = self._district_elig_civ(r, j, di, placement)
        T = self.T
        key = torch.where(elig, adjf * T - self._arangeT_f, self._neg_f)
        best = key.argmax(dim=1)
        place = want & elig.any(dim=1)
        if bool(place.any()):
            rows = place.nonzero(as_tuple=True)[0]
            self.district[rows, best[rows]] = di
            self.civ_city_qtile[rows, r, j] = best[rows]
            self.civ_city_dist_tile[rows, r, j, di] = best[rows]
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

    def _place_works(self, row: int, hit: torch.Tensor, culture_val: torch.Tensor, kind: int) -> None:
        """placeGreatWorks for seat row `row`: distribute gwWorks works per
        earning game across the row's cities in ITS cities-array order —
        slot order for every row under append+reclaim (#110), dead slots
        holding zero open slots — into the kind's building column at that
        kind's slot count. Charges with no
        open slot anywhere overflow to the seat's instant culture lump on its
        current civic. Every slot write bumps _eff_version (yield-bearing).

        The completed-WONDER slot term (Great Library +2 writing) still has
        two sources: row 0 attributes wonders by TILE OWNERSHIP (its wonder
        registry rows carry no writes yet), a civ row reads its
        civ_city_wonder registry — the same source the Petra block uses."""
        bcol, nslots, nworks = self._gw_bidx[kind], self._gw_slots_k[kind], self._gw_works_k[kind]
        dt = self.dtype if row == 0 else torch.float64  # the civ yield paths run f64
        civic = self.civ_civic_prog
        if bcol < 0:  # building absent from the catalog: every charge overflows
            civic[:, row] = civic[:, row] + hit.to(dt) * nworks * culture_val
            return
        gw_base = (self.city_gw_writing, self.city_gw_art, self.city_gw_music)[kind]
        used = gw_base[:, row]  # [B, RC]
        cap = self.city_bldg[:, row, :, bcol].long() * nslots  # [B, RC] (a city holds 1 such building max)
        if getattr(self, "_wond_gw", None) is not None and int(self._wond_gw[:, kind].sum()) > 0:
            if row == 0:
                wsl = self._wond_gw[:, kind]  # [nW]
                live_w = (self.built_wonder >= 0) & self.built_wonder_complete  # [B, T]
                tile_sl = torch.where(live_w, wsl[self.built_wonder.clamp(min=0)], torch.zeros_like(self.built_wonder))
                for c in range(self.RC):
                    cap[:, c] = cap[:, c] + (tile_sl * (self.owner == c).long()).sum(dim=1)
            else:
                wreg = self.civ_city_wonder[:, row - 1]  # [B, RC, nW]
                compw = (wreg >= 0) & self.built_wonder_complete.gather(
                    1, wreg.clamp(min=0).reshape(self.B, -1)
                ).reshape_as(wreg)
                cap = cap + (compw.long() * self._wond_gw[:, kind].reshape(1, 1, -1)).sum(dim=2)
        alive = self.city_alive[:, row]  # [B, RC]
        openc = (cap - used).clamp(min=0) * alive.long()  # [B, RC] open slots per live city
        W = nworks * hit.long()  # [B] works to place this earn
        prefix = openc.cumsum(dim=1) - openc  # exclusive prefix in slot order
        alloc = (W.unsqueeze(1) - prefix).clamp(min=0).minimum(openc)
        placed = alloc.sum(dim=1)
        overflow = (W - placed).clamp(min=0)  # [B] charges with no slot
        gw_base[:, row] = gw_base[:, row] + alloc
        civic[:, row] = civic[:, row] + overflow.to(dt) * culture_val
        if bool((alloc != 0).any()):
            self._eff_version += 1

    def _spread_religious_pressure(self) -> None:
        """The spreadReligiousPressure twin: each founded religion's HOLY tile
        (holy_tile[:, g], the founding capital center, frozen) adds +1 integer
        pressure to every LIVE city within range; each city then follows the
        religion with the most pressure (>0), ties to the lowest id (argmax
        returns the first max). Religions are the unified civ ids: g=0 is
        seat 0, g=i+1 is civ index i. Deterministic, zero-RNG.

        KILL hygiene: dead/absent slots are zeroed each turn (torch.where on the
        alive mask), so a razed-then-reused slot starts fresh — the TS mirror is
        the fresh City object a founded/flipped city gets. city_pressure/city_followed
        permute with their city in _reclaim_cities, so pressure tracks the CITY, not
        the slot, through compaction."""
        B, O = self.B, self._O
        # Itinerant Preachers: per-religion range — base + the religion's
        # claimed enhancer's presR. Religion 0 (seat 0) keeps the base: no
        # founding path assigns it an enhancer.
        RANGE = torch.full((B, O), int(self._pressure_range), dtype=torch.long, device=self.device)
        if self.R > 0 and self._enh_any:
            RANGE[:, 1 : 1 + self.R] += self._enh["presR"][self.civ_only_enhancer + 1].long()
        founded = self.holy_tile >= 0  # [B, O]
        ht = self.holy_tile.clamp(min=0)  # [B, O] valid tile idx (masked where unfounded)
        # ONE flip for every seat.
        NSC = 1 + max(self.R, 0)
        cen = self.city_center[:, :NSC].clamp(min=0)                     # [B, NSC, RC]
        d_all = self.pair_dist[cen.unsqueeze(3), ht.reshape(B, 1, 1, O)].to(torch.long)
        liv = self.city_alive[:, :NSC]                                    # [B, NSC, RC]
        add = (d_all <= RANGE.reshape(B, 1, 1, O)) & founded.reshape(B, 1, 1, O) & liv.unsqueeze(3)
        self.city_pressure[:, :NSC].copy_(
            torch.where(liv.unsqueeze(3), self.city_pressure[:, :NSC] + add.long(), torch.zeros_like(self.city_pressure[:, :NSC]))
        )
        tot = self.city_pressure[:, :NSC].sum(dim=3)
        best = self.city_pressure[:, :NSC].argmax(dim=3)                  # ties -> lowest id
        # EXODUS pays era score each time a city CONVERTS; compare against the
        # PRE-flip follow set, exactly like `wasFollowed`.
        was = self.city_followed[:, :NSC].clone()
        self.city_followed[:, :NSC].copy_(torch.where(liv & (tot > 0), best, torch.full_like(best, -1)))
        for _g in range(self._O):
            _conv = (self.city_followed[:, :NSC] == _g) & (was != _g) & liv
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
        pf = self.city_followed[:, 0, :self.RC].gather(1, self.owner.clamp(min=0))  # [B, T]
        tfol = torch.where((self.tile_seat == 0) & self.alive.gather(1, self.owner.clamp(min=0)), pf, tfol)
        if self.R > 0:
            for r in range(self.R):
                for j in range(self.RC):
                    if not bool(self.civ_city_alive[:, r, j].any()):
                        continue
                    ring = (self.civ_at == r) & (self.tile_city == self.civ_city_id[:, r, j].unsqueeze(1)) & self.civ_city_alive[:, r, j].unsqueeze(1)
                    tfol = torch.where(ring, self.city_followed[:, r + 1, j].unsqueeze(1).expand(B, T), tfol)
        terr = tfol.unsqueeze(1) == torch.arange(O, device=dev).reshape(1, O, 1)  # [B, O, T]
        # near3: dilate FOLLOWING city centers by justWarRange (scatter_add
        # then >0 — a masked bool scatter would clobber tile 0 via the clamp)
        near3 = torch.zeros(B, O, T, dtype=torch.bool, device=dev)
        off3 = tiles_within_offsets(self._just_war_range).to(dev)
        pc_win = tiles_from_offsets(self.site.clamp(min=0).reshape(-1), off3, self.W, self.H).reshape(B, self.RC, -1)  # [B, C, M]
        civ_city_win = None
        if self.R > 0:
            civ_city_win = tiles_from_offsets(self.civ_city_center.clamp(min=0).reshape(-1), off3, self.W, self.H).reshape(B, self.R * self.RC, -1)
        for g in range(O):
            srci = torch.zeros(B, T, dtype=torch.long, device=dev)
            fol_c = self.alive & (self.city_followed[:, 0, :self.RC] == g)  # [B, C]
            if bool(fol_c.any()):
                w = torch.where(fol_c.unsqueeze(2), pc_win, torch.full_like(pc_win, -1)).reshape(B, -1)
                srci.scatter_add_(1, w.clamp(min=0), (w >= 0).long())
            if self.R > 0:
                fol_rc = self.civ_city_alive & (self.city_followed[:, 1:1 + self.R] == g)  # [B, R, RC]
                if bool(fol_rc.any()):
                    wr = torch.where(fol_rc.reshape(B, -1).unsqueeze(2), civ_city_win, torch.full_like(civ_city_win, -1)).reshape(B, -1)
                    srci.scatter_add_(1, wr.clamp(min=0), (wr >= 0).long())
            near3[:, g] = srci > 0
        out = (near3, terr)
        self._rel_planes_cache = (key, out)
        return out

    def _rel_combat_adder(self, seat: torch.Tensor, tile: torch.Tensor, terr_key: str) -> torch.Tensor:
        """The shared body of the two enhancer combat adders — `terr_key`
        picks the TERRITORY clause ("cvs" Crusade for an attacker, "cdef"
        Defender of the Faith for a defender); the Just War proximity clause
        ("cnear") is common to both.

        `seat` is an ABSOLUTE seat per game ([B] long). A religion's id IS its
        founder's seat, so seats 0..R index the belief planes directly and one
        gather serves every seat; anything else — a barbarian, a city-state,
        NO_SEAT — falls outside that range and contributes 0. Returns f64 [B].
        """
        if not self._enh_combat_any or not bool((self.civ_enhancer >= 0).any()):
            return torch.zeros(self.B, dtype=torch.float64, device=self.device)
        g = seat.clamp(min=0, max=self._O - 1)
        has = (seat >= 0) & (seat < self._O) & self.civ_religion_done.gather(1, g.unsqueeze(1)).squeeze(1)
        eidx = self.civ_enhancer.gather(1, g.unsqueeze(1)).squeeze(1) + 1  # [B] 0 = pad
        eidx = torch.where(has, eidx, torch.zeros_like(eidx))
        gi = g.unsqueeze(1)  # religion id [B, 1]
        near3, terr = self._rel_combat_planes()
        bt = tile.clamp(min=0).unsqueeze(1)
        nr = near3.gather(1, gi.unsqueeze(2).expand(-1, -1, self.T)).squeeze(1).gather(1, bt).squeeze(1)
        tr = terr.gather(1, gi.unsqueeze(2).expand(-1, -1, self.T)).squeeze(1).gather(1, bt).squeeze(1)
        add = self._enh["cnear"][eidx] * nr.double() + self._enh[terr_key][eidx] * tr.double()
        return torch.where(has & (tile >= 0), add, torch.zeros_like(add))

    def _rel_atk_cs(self, seat: torch.Tensor, battle_tile: torch.Tensor) -> torch.Tensor:
        """`religionAttackCS` — the enhancer ATTACKER adders (Just War near +
        Crusade onto following-city territory) for the units of ABSOLUTE seat
        `seat` ([B] long). f64 [B]."""
        return self._rel_combat_adder(seat, battle_tile, "cvs")

    def _rel_def_cs(self, seat: torch.Tensor, def_tile: torch.Tensor) -> torch.Tensor:
        """`religionDefenseCS` — the enhancer DEFENDER adders (Just War near +
        Defender of the Faith on following-city territory) for the units of
        ABSOLUTE seat `seat` ([B] long). f64 [B]."""
        return self._rel_combat_adder(seat, def_tile, "cdef")

    def _gen_aura_planes(self):
        """Per (batch, unified-civ g, tile) booleans — land[b, g, t] = tile t
        is within gen_aura_range of a LIVE own GENERAL of seat g (g=0 seat 0,
        g=r+1 civ index r); sea[b, g, t] the same for ADMIRALs.

        General positions move mid-turn and change on spawn/kill/capture, none
        of which bump _eff_version, so the cache keys on (turn, _gen_ver, a
        general POSITION fingerprint). The fingerprint is load-bearing: besides
        the _gen_ver-bumped sites (spawn/civ-walk/kill/capture/restore) a
        general is also moved by the MOVE verb in _apply_seat_unit_actions,
        which does NOT bump _gen_ver — keying on _gen_ver alone goes stale
        mid-apply. The weighted tile/seat/type sum changes on ANY general move,
        kill, capture or spawn, so the cache is exact regardless of the mover.

        Returns None when no General/Admiral is alive anywhere (structural 0;
        call sites skip the gather). Dilation mirrors
        _rel_combat_planes.near3 (scatter_add of longs then >0)."""
        B, T, O, dev = self.B, self.T, self._O, self.device
        gi, ai = self._general_unit_idx, self._admiral_unit_idx
        _z = torch.zeros(B, simbase.MAJOR_POOL_MAX, dtype=torch.bool, device=dev)
        m_g = self.major_unit_alive & (self.major_unit_type == gi) if gi >= 0 else _z
        m_a = self.major_unit_alive & (self.major_unit_type == ai) if ai >= 0 else _z
        live = m_g | m_a
        present = bool(live.any())
        if present:
            ar = torch.arange(1, m_g.shape[1] + 1, device=dev)
            # Tile (+1 so tile 0 counts), OWNER (+1 so seat 0 counts), type
            # (general vs admiral via ×3) and slot — a move, a kill, a spawn or
            # a same-tile ownership flip (capture) all change the sum.
            fp = int((((self.major_unit_tile + 1) * (1 + 2 * m_a.long()) * ar
                       * (self.major_unit_seat + 1)) * live.long()).sum()) + int(live.sum()) * 31
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
        mwin = tiles_from_offsets(self.major_unit_tile.clamp(min=0).reshape(-1), off, self.W, self.H).reshape(B, simbase.MAJOR_POOL_MAX, -1)

        def dilate(mask: torch.Tensor, win: torch.Tensor) -> torch.Tensor:
            src = torch.zeros(B, T, dtype=torch.long, device=dev)
            w = torch.where(mask.unsqueeze(2), win, torch.full_like(win, -1)).reshape(B, -1)
            src.scatter_add_(1, w.clamp(min=0), (w >= 0).long())
            return src > 0

        # ONE loop over the major rows — the pool is shared, so a seat's
        # generals are the slots its own `unit_seat` names.
        for _row in range(O):
            rg = m_g & (self.major_unit_seat == _row)
            ra = m_a & (self.major_unit_seat == _row)
            if bool(rg.any()):
                land[:, _row] = dilate(rg, mwin)
            if bool(ra.any()):
                sea[:, _row] = dilate(ra, mwin)
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
        combat call sites, [B, MAJOR_POOL_MAX] at the pooled snapshot.
        Does NOT screen civilians — callers own that (the combat sites only ever
        ask about a combatant; the snapshot masks on _type_combat > 0)."""
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
        t = getattr(self, f"{pre}_unit_tile").clamp(min=0)
        seat = getattr(self, f"{pre}_unit_seat")
        here = self.tile_seat.gather(1, t)
        home = here == seat
        # A city CENTRE here — any seat's; `home` already restricts it to this
        # one, and the one-owner invariant makes a centre tile its own seat's.
        center = (self.center_at.gather(1, t) >= 0) | (self.civ_city_at.gather(1, t) >= 0)
        camp = (self.camp_tile.unsqueeze(2) == t.unsqueeze(1)).any(dim=1) if pre == "barb" else None
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
        return getattr(self, f"{pre}_unit_mp") < getattr(self, f"{pre}_unit_mp_full")

    def _full_mp(self, pre: str) -> torch.Tensor:
        """[B, U] — refreshUnits' `full + generalAuraMP(state, unit)`, one rule
        for both windows: an EMBARKED land unit marches on the flat
        EMBARK_MOVES pool, everything else on its type's `moves`, plus whatever
        the frozen general/admiral aura granted.

        Every walker and every afford rule (`mp >= full`) must read this same
        expression — `stepUnit` is embark-aware in both windows."""
        typ = getattr(self, f"{pre}_unit_type").clamp(min=0, max=self.NU - 1)
        # The golden dedication raises the unit's OWN movement, so it is added
        # to the type pool and then OVERRIDDEN by the embark pool below —
        # embarkation speed is not a unit's movement stat. `unitFullMoves` has
        # the same shape (`if (embarked && !naval) return EMBARK_MOVES`).
        base = self._type_moves[typ] + self._golden_move_mp(pre)
        if self._embark_live:
            emb = getattr(self, f"{pre}_unit_emb")
            base = torch.where(
                emb & ~self.unit_naval[typ], torch.full_like(base, self._embark_moves), base
            )
        return base + getattr(self, f"{pre}_unit_aura_mp")

    def _reset_mp(self, pre: str) -> None:
        """The movesLeft/movesFull reset: `granted = full + aura`, both fields.
        TS writes the pair together at refreshUnits and again at seatPhase;
        writing only one breaks next turn's "spent no MP" gate for a seat that
        never moved."""
        f = self._full_mp(pre)
        getattr(self, f"{pre}_unit_mp_full").copy_(f)
        getattr(self, f"{pre}_unit_mp").copy_(f)

    def _refresh_aura_mp(self) -> None:
        """FREEZE the aura's +generalAuraMp per unit slot, at the refreshUnits
        moment. TS computes `granted = full + generalAuraMP(state, unit)`
        inside refreshUnits — the TOP of endTurn, before anything moves — and
        spends movesLeft down from that frozen pool all turn. The GPU keeps no
        persistent movesLeft: every walker recomputes `full_mp` from
        `_type_moves[type]` MID-turn, which is safe only for terms that depend on
        unit TYPE. The aura is not one — it keys on a GENERAL's POSITION, and
        generals move during the very phase the unit orders execute, so a
        recompute could read a POST-move general where TS read a PRE-move one.
        Hence the snapshot; the walkers add `major_unit_aura_mp`.

        ONE body, keyed on each slot's OWN seat — refreshUnits loops every
        unit and asks `generalAuraMP(state, unit)`, which reads that unit's
        owner. It runs TWICE a turn on the majors, exactly as TS does: once
        here at the refreshUnits mirror and again at the seatPhase reset that
        establishes every isCiv seat's real budget (seat 0 included — `isCiv`
        covers it).

        Barbarians never own a GENERAL/ADMIRAL, so the barb window has no
        plane (mirrors `unit_xp`). Civilians are screened here (TS
        inGeneralAura returns false at combat <= 0), as are dead slots, so a
        stale reclaimed slot cannot leak a bonus. Zero RNG, integer
        arithmetic."""
        ok = self.major_unit_alive & (self._type_combat[self.major_unit_type] > 0)
        hit = self._gen_aura_hit(
            self.major_unit_seat,  # a major's ABSOLUTE seat IS its block row
            self.major_unit_tile,
            self.unit_naval[self.major_unit_type] | self.major_unit_emb,  # ADMIRAL-keyed when naval OR embarked
        )
        self.major_unit_aura_mp.copy_((hit & ok).long() * self._gen_aura_mp)

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
        """[B, T] seat 0's farm-adjacency food bonus = qual × seat 0's tier —
        the border-pick ranking plane's copy. The city walk takes the same
        term for EVERY row through _rcy_food_plane, which folds it into the
        food plane where tileYields carries it."""
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

    def _seat_city_walk(self, row: int, j: int | None = None, *, amen_yf: torch.Tensor) -> torch.Tensor:
        """THE computeCityStats twin — [B, n, 6] f64 per-city totals in engine
        yield order (food, production, gold, science, culture, faith) for ANY
        seat row, dead columns zeroed and gold NET of cityMaintenance. n is the
        row's column width (C on row 0, RC on a civ row), or 1 when `j` picks a
        single column.

        TS fills SIX buckets and sums them in ONE order — tiles, districts,
        buildings, citizens, bonuses, trade — then scales: the amenity tier on
        the five non-food columns, then m.yieldMult, then each wonder's
        cityYieldMult, then `total.gold -= maintenance`. That order is LOAD
        BEARING. CITIZEN_CULTURE is 0.3, the one non-dyadic term in the whole
        walk, so every add on the culture column is position-sensitive to a ulp
        and a ulp of culture flips a border-growth ceil. Everything else is
        integer- or dyadic-valued, which f64 sums exactly at any association —
        so the order INSIDE a bucket is free, and each bucket accumulates on
        its own before joining the total once, exactly as TS does.

        The walk runs in f64 on every row; row 0's f32 lane casts on return.

        j: one column, for the economy loop's mid-phase per-city pass — the
           state it reads has moved since the batched call, and its frozen
           amenity factor is per-city by spec.
        amen_yf: [B, n] the tier's yieldFactor. The caller ranks amenities,
           because TS's endTurn ranks luxuryAmenities ONCE per turn and feeds
           that same map to every city's fresh computeCityStats."""
        rd = self.rules_dev
        B, dev, F64 = self.B, self.device, torch.float64
        cols = self.RC
        sl = slice(0, cols) if j is None else slice(j, j + 1)
        n = cols if j is None else 1
        alive = self.city_alive[:, row, sl]  # [B, n]
        pop = self.city_pop[:, row, sl]
        ctr = self.city_center[:, row, sl].clamp(min=0)
        ids = self.city_id[:, row, sl]
        bldg = self.city_bldg[:, row, sl]  # [B, n, NB]
        dreg = self.city_dist_tile[:, row, sl]  # [B, n, nD] tile per district TYPE
        alivef = alive.double()
        is_cap = (self.city_is_cap[:, row, sl] & alive).double()
        zeros6 = torch.zeros(B, n, 6, dtype=F64, device=dev)

        # --- this row's TILE CONTEXT: the strip-adjusted planes, ITS OWN
        # research boosts (farm adjacency here, mine tech at the gather) and
        # ITS OWN belief feature adds, which tileYields carries through
        # ctx.mods on every read — worked yields, selection score and centre.
        g = self._rcy_globals()
        f_plane = self._rcy_food_plane(row, g)
        p_plane, ty_oth, oth_sc, w = g["p_plane"], g["ty_oth"], g["oth_score"], g["w"]
        has_bel = self._seat_has_beliefs(row)  # PANTHEON + FOUNDER: a seat's own claim
        # The FOLLOWER half keys on the religion each CITY follows, which under
        # live coupling need not be one this seat founded (withFollowerBelief
        # has no owner test), so it gates on _follower_live, not the own claim.
        fol_live = self._follower_live(row)
        fol_id = self._follower_id_for(self._city_rel(row)[:, sl]) if fol_live else None
        featP = None
        if has_bel:
            featP = self._belief_feat_plane(row)
            f_plane = f_plane + featP[:, :, 0]
            p_plane = p_plane + featP[:, :, 1]
            ty_oth = ty_oth + featP
            oth_sc = oth_sc + (featP[:, :, 2:].double() * w[2:].reshape(1, 1, 4)).sum(dim=2)

        # ================= bucket 1: TILES ==================================
        # Candidates live within the radius-3 window (37 offsets) — scoring
        # only that window keeps the exact candidate set, per-tile keys and
        # topk order of a full-map scan, 30x smaller.
        tiles = tiles_from_offsets(ctr.reshape(-1), self._off3, self.W, self.H).reshape(B, n, -1)
        M = tiles.shape[2]
        tc3 = tiles.clamp(min=0)
        tcf = tc3.reshape(B, n * M)

        def gat(plane: torch.Tensor) -> torch.Tensor:  # [B, T] -> [B, n, M]
            return plane.gather(1, tcf).reshape(B, n, M)

        # workableTiles: tileBelongsTo(t, city) && t.index !== centre &&
        # !t.district && !t.builtWonder && !isImpassable(t). tileBelongsTo is
        # ONE pair on every row — tileSeat/tileCity against (seat, id), and a
        # major's seat IS its city-block row. ANOTHER city's centre fails the
        # id half and this city's own fails the centre test, so `!t.district`
        # has only real districts left to refuse.
        valid = (
            (tiles >= 0)
            & (gat(self.tile_seat) == row)
            & (gat(self.tile_city) == ids.unsqueeze(2))
            & gat(self.work_ok)  # !isImpassable
            & (tiles != ctr.unsqueeze(2))
            & (gat(self.district) < 0)  # !t.district
            & (gat(self.built_wonder) < 0)  # !t.builtWonder
        )
        f = gat(f_plane).double()
        p = gat(p_plane).double()
        if self._mine_boost_tech.numel() > 0 and self.MINE >= 0:
            # The OWNER's mine boosts ride ctx.mods; the neutral plane stays
            # boost-free for cross-owner reads.
            boost = (self._seat_techs(row)[:, self._mine_boost_tech].to(self.dtype) * self._mine_boost_amt).sum(dim=1).double()
            p = p + ((gat(self.improvement) == self.MINE) & ~gat(self.pillaged)).double() * boost.reshape(B, 1, 1)
        # tileScore('balanced') = SUM yields . FOCUS_BASE, ties to the LOWEST
        # GLOBAL index (assignWorkedTiles' `b.score - a.score || a.index -
        # b.index`), never window position. FORCED f64: under f32 the index
        # term rounds away entirely and topk resolves exact ties by its own
        # unspecified order, picking the HIGHEST index where TS takes the
        # lowest.
        key = torch.where(
            valid,
            (f * w[0] + p * w[1] + gat(oth_sc)) * 1e6 - tiles.double(),
            torch.tensor(-1e18, dtype=F64, device=dev),
        )
        self._tiebreak_key_dtype = key.dtype  # what the poke lane asserts
        top_vals, top_idx = key.topk(M, dim=2)
        # No specialists: assigning a citizen to a district slot is a manual
        # act on both engines (setSpecialists is a UI verb; nothing in the turn
        # loop writes city.specialists), so every citizen works a tile.
        take = (torch.arange(M, device=dev).reshape(1, 1, M) < pop.unsqueeze(2)) & (top_vals > -1e17)
        takef = take.double()
        sel = [
            c.gather(2, top_idx) * takef
            for c in (f, p, gat(ty_oth[:, :, 2]).double(), gat(ty_oth[:, :, 3]).double(),
                      gat(ty_oth[:, :, 4]).double(), gat(ty_oth[:, :, 5]).double())
        ]
        # The CENTRE is worked for free (tileYieldsForCenter). Its food and
        # production come from the ALREADY strip-adjusted dynamic planes and
        # take their floors LAST — after the feature strip, the disaster tail
        # and this row's belief adds; the four static columns strip here, and
        # subtracting again on food/production would double-strip a flipped
        # centre. TS passes `{...center, district: null}`, so the centre's own
        # CITY_CENTER never suppresses it.
        strip = self.feat_stripped.gather(1, ctr).double().unsqueeze(2)  # [B, n, 1]
        _c6 = ctr.unsqueeze(2).expand(-1, -1, 6)
        ctr6 = self.tile_yields.gather(1, _c6).double() - self.feat_yields.gather(1, _c6).double() * strip
        if has_bel:  # a LIVE-featured centre keeps its belief feature yields
            ctr6 = ctr6 + featP.gather(1, _c6).double()
        ctr6[:, :, 0] = torch.maximum(f_plane.gather(1, ctr).double(), torch.tensor(float(self.rules.center_min_food), dtype=F64, device=dev))
        ctr6[:, :, 1] = torch.maximum(p_plane.gather(1, ctr).double(), torch.tensor(float(self.rules.center_min_production), dtype=F64, device=dev))
        if self._dyadic_fp:
            # every term is an exact dyadic, so .sum() is bit-identical to the
            # TS reduce over the worked loop
            tiles_y = ctr6 + torch.stack([c.sum(dim=2) for c in sel], dim=2)
        else:
            tiles_y = ctr6
            for m in range(M):  # sequential adds mirror the TS loop's rounding
                tiles_y = tiles_y + torch.stack([c[:, :, m] for c in sel], dim=2)
        sel_t = tc3.gather(2, top_idx)  # [B, n, M] the worked tiles
        stf = sel_t.reshape(B, n * M)
        compw = self._completed_wonders(row)
        if compw is not None:
            compw = compw[:, sl]
        # PETRA — +2 food / +2 gold / +1 production on each WORKED desert
        # non-floodplain undistricted tile (petraBonus), POST-selection like TS
        # (the score ranks without it). TS also calls petraBonus(center), but
        # founding sets the centre's district to CITY_CENTER, so its
        # `!t.district` arm can never fire there.
        if compw is not None and bool(compw.any()):
            hasP = (compw & self._wond_petra.reshape(1, 1, -1)).any(dim=2)  # [B, n]
            if bool(hasP.any()):
                qual = (
                    self.desert.gather(1, stf).reshape(B, n, M)
                    & (self.feat_id.gather(1, stf).reshape(B, n, M) != self._fp_fid)
                    & (self.district.gather(1, stf).reshape(B, n, M) < 0)
                    & take
                )
                nq = (qual & hasP.unsqueeze(2)).sum(dim=2).double()
                tiles_y[:, :, 0] = tiles_y[:, :, 0] + 2.0 * nq
                tiles_y[:, :, 1] = tiles_y[:, :, 1] + nq
                tiles_y[:, :, 2] = tiles_y[:, :, 2] + 2.0 * nq
        # WATER MILL: "Bonus resources improved by Farms gain +1 Food each",
        # POST-selection beside Petra (waterMillBonus). Modelled GENERALLY
        # (bonus category + the resource's own required improvement is FARM),
        # so a third farm bonus resource picks it up automatically. The centre
        # carries no improvement and never qualifies.
        wm = bldg[:, :, rd.b_farmbonus]
        if wm.numel() and bool(wm.any()):
            elig = (
                (self.improvement.gather(1, stf) == self.FARM)
                & (self.res_cat.gather(1, stf) == 1)  # bonus category
                & (self.res_imp.gather(1, stf) == self.FARM)  # ...whose improvement IS the farm
            ).reshape(B, n, M) & take
            tiles_y[:, :, 0] = tiles_y[:, :, 0] + (elig & wm.any(dim=2).unsqueeze(2)).sum(dim=2).double()

        # ================= bucket 2: DISTRICTS ==============================
        # THE DISTRICT REGISTRY IS THE ONE READ, on every seat row: TS walks
        # `city.districts`, a per-city LIST, so a district stays its city's
        # however the tile's ownership churns and whatever else stands in the
        # work window.
        dist_y = zeros6.clone()
        dflat = dreg.clamp(min=0).reshape(B, -1)
        dcomp = (dreg >= 0) & self.district_complete.gather(1, dflat).reshape_as(dreg)
        # FUNCTIONAL districts (contributing adjacency) exclude the PILLAGED
        # ones; the COUNTS elsewhere keep the un-gated dcomp — "pillaged is
        # still built".
        dlive = dcomp & ~self.district_pillaged.gather(1, dflat).reshape_as(dreg)
        hs_adj = None
        for di, dd in enumerate(self.districts_cat):
            yc = int(dd.get("adjYield", -1))
            if yc < 0:
                continue
            t_d = dreg[:, :, di]  # [B, n] this city's tile of type di (-1 none)
            adjv = self._district_adj_floor(di).gather(1, t_d.clamp(min=0)).double()  # (memoised)
            add = torch.where(dlive[:, :, di], adjv, torch.zeros_like(adjv))
            dist_y[:, :, yc] = dist_y[:, :, yc] + add
            if di == self._hs_idx:
                hs_adj = add
        # Follower Work Ethic — the Holy Site's floored adjacency ALSO yields
        # production, keyed on each city's followed religion.
        if fol_live and hs_adj is not None:
            dist_y[:, :, 1] = dist_y[:, :, 1] + hs_adj * self._fol_tab("we", fol_id)

        # ================= bucket 3: BUILDINGS ==============================
        # PALACE — cityBuildingYields' capital grant.
        bld_y = self._palace_y.double().reshape(1, 1, 6) * is_cap.unsqueeze(2)
        # Buildings in a COMPLETE-but-PILLAGED district go dark. Regional
        # buildings leave every LOCAL sum (cityBuildingYields' `if
        # (def.regional) continue`) and are delivered by range below.
        selb = bldg & ~self._bldg_dark(dreg) & ~self._b_regional.reshape(1, 1, -1)
        if bool(selb.any()):
            selbf = selb.double()
            bld_y = bld_y + selbf @ rd.b_yields.double()
            if has_bel or fol_live:
                # Founder (Stewardship) bldgY stays per-SEAT; the follower
                # half (Feed the World / Choral Music) keys per-CITY. The
                # building keys are disjoint and the rows integer, so the
                # two einsums sum bit-identically to one combined pass, and
                # each half carries its own gate.
                if has_bel:
                    bld_y = bld_y + torch.einsum("bjn,bnk->bjk", selbf, self._bel_add_pf("bldgY", row))
                if fol_live:
                    bld_y = bld_y + torch.einsum("bjn,bjnk->bjk", selbf, self._fol_tab("bldgY", fol_id))
            if self.S > 0:
                # City-state envoy bonuses, keyed to BUILDINGS
                # (cityStateEnvoyBonuses): a CS at >=3 envoys grants
                # +districtBonus in its TYPE channel to every city holding
                # the type's TIER-1 building; at >=6, again on the TIER-2
                # building. Routed through selb, so pillage-dark and the
                # regional skip match cityBuildingYields exactly.
                env, acs, nB = self._seat_envoys(row), self.citystate_alive.double(), selb.shape[2]
                per3 = (env >= 3).double() * self._citystate_district_bonus * acs * (self._citystate_b1idx >= 0).double()
                per6 = (env >= 6).double() * self._citystate_district_bonus * acs * (self._citystate_b2idx >= 0).double()
                csf = torch.zeros(B, nB * 6, dtype=F64, device=dev)
                csf.scatter_add_(1, self._citystate_b1idx.clamp(min=0) * 6 + self._citystate_yidx, per3)
                csf.scatter_add_(1, self._citystate_b2idx.clamp(min=0) * 6 + self._citystate_yidx, per6)
                bld_y = bld_y + torch.einsum("bjn,bnk->bjk", selbf, csf.reshape(B, nB, 6))
            # SHIPYARD: a city holding one adds its COMPLETE Harbor's full
            # districtAdjacency as PRODUCTION — the same value that fed the
            # Harbor's gold above, re-read here. cityBuildingYields gates on
            # districtComplete ONLY: a PILLAGED Harbor still pays, because
            # the pillage already darkened the Shipyard through selb.
            if self._harbor_idx >= 0 and self._shipyard_bidx >= 0:
                hb = dreg[:, :, self._harbor_idx]
                hbc = hb.clamp(min=0)
                has_sy = alive & selb[:, :, self._shipyard_bidx] & (hb >= 0) & self.district_complete.gather(1, hbc)
                if bool(has_sy.any()):
                    hadj = self._district_adj_floor(self._harbor_idx).gather(1, hbc).double()  # (memoised)
                    bld_y[:, :, 1] = bld_y[:, :, 1] + torch.where(has_sy, hadj, torch.zeros_like(hadj))
        # regionalEffects — the buildings-bucket position (after the local
        # buildings, before the wonder flat yields).
        _reg = self._seat_regional(row)
        if _reg is not None:
            bld_y = bld_y + _reg[0][:, sl]
        # Completed WONDERS pay their flat cityYields into this bucket, and the
        # belief faithPerWonder (Divine Inspiration) pays per wonder held.
        if compw is not None and bool(compw.any()):
            bld_y = bld_y + compw.double() @ self._wond_cy
            if fol_live:
                bld_y[:, :, 5] = bld_y[:, :, 5] + self._fol_tab("fpw", fol_id) * compw.sum(dim=2).double()
        # Slotted GREAT WORKS (culture/turn per work BY KIND), ARTIFACT culture,
        # the Golden PEN, BRUSH AND VOICE culture per COMPLETED SPECIALTY
        # district, and RELIC faith — TS's own four consecutive lines at the
        # tail of the buildings bucket.
        bld_y[:, :, 4] = bld_y[:, :, 4] + (
            self._gw_cul_k[0] * self.city_gw_writing[:, row, sl].double()
            + self._gw_cul_k[1] * self.city_gw_art[:, row, sl].double()
            + self._gw_cul_k[2] * self.city_gw_music[:, row, sl].double()
        ) * alivef
        bld_y[:, :, 4] = bld_y[:, :, 4] + self._artifact_culture * self.city_artifacts[:, row, sl].double() * alivef
        _pb = self._golden_ded(row, self._ded_pen_brush)
        if bool(_pb.any()):
            bld_y[:, :, 4] = bld_y[:, :, 4] + _pb.double().unsqueeze(1) * self._district_counts(row)[1][:, sl].double() * alivef
        bld_y[:, :, 5] = bld_y[:, :, 5] + self._relic_faith * self.city_relics[:, row, sl].double() * alivef

        # ================= bucket 4: CITIZENS ===============================
        # THE non-dyadic term (CITIZEN_CULTURE = 0.3), so its POSITION is the
        # walk's one real association constraint: after districts+buildings,
        # before bonuses+trade. It sits INSIDE the tier, where computeCityStats
        # puts it — Civ 6 applies the Amenities modifier to the city's whole
        # non-food output.
        citz = zeros6.clone()
        popf = pop.double()
        citz[:, :, 3] = self.rules.citizen_science * popf
        citz[:, :, 4] = self.rules.citizen_culture * popf

        # ================= bucket 5: BONUSES ================================
        # m.cityYields to every city + m.capitalYields to the capital, summed as
        # ONE bucket before joining the total (TS builds `bonuses` then adds it
        # once, and after the citizen term that grouping is not free).
        b_city = torch.zeros(B, 6, dtype=F64, device=dev)
        b_cap = torch.zeros(B, 6, dtype=F64, device=dev)
        gym = None
        if self._gov_has_effects:
            _gcity, _gcap, _gh, gym, *_ = self._gov_mods(row)  # housing/slots ride other paths
            b_city = b_city + _gcity.double()
            b_cap = b_cap + _gcap.double()
        if self.S > 0:
            # The CS capital yield at 1+ envoys, and the suzerain's per-CS
            # unique perk (citystate_suz_key, -1 = descoped) — isSuzerain is
            # >= suzerainEnvoys and STRICTLY above every OTHER seat's count at
            # that city-state, which one max over the other rows answers.
            _env, _acs = self._seat_envoys(row), self.citystate_alive
            b_cap = b_cap.scatter_add(
                1, self._citystate_yidx,
                ((_env >= 1) & _acs).double() * float(self.rules.citystate.get("capitalBonus", 2)))
            _oth = self.seat_citystate_envoys.clone()
            _oth[:, row] = -1
            _suz = (_env >= int(self.rules.citystate.get("suzerainEnvoys", 3))) & (_env > _oth.max(dim=1).values) & _acs
            b_cap = b_cap.scatter_add(
                1, self.citystate_suz_key.clamp(min=0),
                _suz.double() * self._citystate_suz_amt * (self.citystate_suz_key >= 0).double())
        if has_bel:
            # Founder capital incomes — perF (per-N followers, empire-wide) +
            # perC (per live city). Followers = this row's own live pop sum
            # (a city's religion follows its owner while uncoupled).
            perF = self._bel_add("perF", row)  # [B, 7] = N, then the 6 yields
            perC = self._bel_add("perC", row)  # [B, 6]
            _liv = self.city_alive[:, row, :cols]
            _fol = (self.city_pop[:, row, :cols] * _liv.long()).sum(dim=1).double()
            _times = torch.where(perF[:, 0] > 0, torch.floor(_fol / perF[:, 0].clamp(min=1)), torch.zeros_like(_fol))
            b_cap = b_cap + perF[:, 1:] * _times.unsqueeze(1) + perC * _liv.sum(dim=1).double().unsqueeze(1)
        bon = b_city.unsqueeze(1) * alivef.unsqueeze(2) + b_cap.unsqueeze(1) * is_cap.unsqueeze(2)

        # ================= bucket 6: TRADE ==================================
        trade = zeros6
        _rt = self._seat_route_income(row)
        if _rt is not None:
            trade = _rt[:, sl] * alivef.unsqueeze(2)

        # ================= the totals =======================================
        total = tiles_y + dist_y + bld_y + citz + bon + trade
        total[:, :, 1:] = total[:, :, 1:] * amen_yf.unsqueeze(2)  # tier.yieldFactor — food is left unscaled
        if gym is not None:
            total = total * gym.double().unsqueeze(1)  # m.yieldMult, every column
        if compw is not None and bool(compw.any()):
            # Each wonder's cityYieldMult (Ruhr production, Big Ben gold) LAST
            # of the three scalings, as an EXPLICIT wonder-id-order product. TS
            # walks city.wonders in BUILD order; the registry is keyed by wonder
            # id and cannot express that, so two multipliers on the SAME channel
            # in one city can associate differently (AUDIT A-27 residual).
            ones6 = torch.ones(1, 1, 6, dtype=F64, device=dev)
            wmm = torch.ones(B, n, 6, dtype=F64, device=dev)
            for wi in range(compw.shape[2]):
                wmm = wmm * torch.where(compw[:, :, wi:wi + 1], self._wond_mult[wi].reshape(1, 1, 6), ones6)
            total = total * wmm
        total[:, :, 2] = total[:, :, 2] - self._seat_housing(row)[0][:, sl]  # total.gold -= cityMaintenance
        # Dead columns contribute nothing (their static centre yields preload).
        return torch.where(alive.unsqueeze(2), total, torch.zeros_like(total))

    def _city_totals(self, lux: torch.Tensor | None = None) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
        """Seat 0's (total [B, C, 6], housing [B, C], growth_f [B, C],
        tier_idx [B, C]) — row 0's call into THE walk, cast back to the engine
        dtype for the f32 lanes.

        lux: an optional FROZEN luxury-amenity map [B, C]. TS endTurn computes
        luxuryAmenities(state) ONCE before its city loop and feeds that same map
        to every city's fresh computeCityStats — so the city walk's
        guard-triggered recomputes must NOT re-rank luxuries with mid-walk pops,
        which can split an amenity tier. The freshly computed map is stashed on
        _last_lux for the walk to freeze."""
        tier_idx, growth_f, yield_f, lux_add = self._seat_amenity(0, lux=lux)
        self._last_lux = lux_add
        total = self._seat_city_walk(0, amen_yf=yield_f)
        return total.to(self.dtype), self._seat_housing(0)[1].to(self.dtype), growth_f.to(self.dtype), tier_idx

    def empire_score(self) -> torch.Tensor:
        """[B] — mirrors empireScore(state, seat 0, 'balanced') with the TS
        ASSOCIATION — per city: pop×popWeight, then each yield×weight in key
        order. Science rides non-dyadic 0.7s, so the sum ORDER is worth a real
        ±1 ulp, enough to flip the leader. TS iterates state.cities in ARRAY
        order (splice on death, push on found) — slot order under
        append+reclaim (#110), so the sum walks living columns first, in
        column order. Dead columns sort last and add exact 0.0
        (association-neutral)."""
        total, _, _, _ = self._city_totals()
        rd = self.rules_dev
        w = rd.score_yield_weights
        pw = float(self.rules.score_pop_weight)
        ord_ = torch.argsort((~self.alive).long(), dim=1, stable=True)
        bidx = self._bidx
        score = torch.zeros(self.B, dtype=self.dtype, device=self.device)
        for s in range(self.RC):
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
        pop_term = (self.civ_city_pop[:, r] * self.civ_city_alive[:, r].long()).sum(dim=1).to(self.dtype) * self.rules.score_pop_weight
        yt = torch.zeros(B, dtype=torch.float64, device=self.device)
        for j in range(self.RC):
            mask = self.civ_city_alive[:, r, j]
            if not bool(mask.any()):
                continue
            f, pr, sc, cu, _g, _fa = self._seat_city_yields(r, j, mask)
            yt = yt + f * float(w[0]) + pr * float(w[1]) + sc * float(w[3]) + cu * float(w[4])
            bgf = self.civ_city_bldg[:, r, j].double() @ rd.b_yields.double()  # [B, 6]
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
        if not bool(self.civ_city_alive[:, r].any()):
            return yt.to(self.dtype)
        # ONE batched pass replaces the RC per-j _seat_city_yields calls (each
        # a full window gather + ~30 plane gathers + topk); the per-j
        # ACCUMULATION below keeps the loop's exact j order and op association
        # (this sum order is worth a real ±1 ulp). Serves every consumer —
        # leader() included — through this one body.
        F, PR, SC, CU, GO, FA = self._seat_city_yields_all(r)
        for j in range(self.RC):
            mask = self.civ_city_alive[:, r, j]
            if not bool(mask.any()):
                continue
            yt = yt + (self.civ_city_pop[:, r, j] * self.civ_city_alive[:, r, j].long()).double() * pw
            yt = yt + F[:, j] * float(w[0]) + PR[:, j] * float(w[1]) + GO[:, j] * float(w[2]) + SC[:, j] * float(w[3]) + CU[:, j] * float(w[4]) + FA[:, j] * float(w[5])
        return yt.to(self.dtype)

    def _seat_city_yields_all(self, r: int, amen_yf: torch.Tensor | None = None) -> tuple[torch.Tensor, ...]:
        """Civ seat r's six [B, RC] yield channels — THE walk's civ-row call,
        unpacked as (food, production, science, culture, gold, faith). The
        economy loop passes its loop-top FROZEN amenity factors; every other
        caller (trace/leader/civ_score, post-phase) ranks fresh."""
        yf = amen_yf if amen_yf is not None else self._seat_amenity(r + 1)[2]
        t = self._seat_city_walk(r + 1, amen_yf=yf)
        return t[:, :, 0], t[:, :, 1], t[:, :, 3], t[:, :, 4], t[:, :, 2], t[:, :, 5]

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
        civ_city_bldg write site bumps _eff_version. The one live read a snapshot
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
            [self.alive.any(dim=1)] + [self.civ_city_alive[:, r].any(dim=1) for r in range(self.R)], dim=1)
        fenced = torch.where(has_city, scores, torch.full_like(scores, float("-inf")))
        pick = torch.where(has_city.any(dim=1), first_argmax(fenced), first_argmax(scores))
        return torch.where(self.winner >= 0, self.winner, pick)

    def _domination(self) -> torch.Tensor:
        """[B] the unified civ id holding EVERY original capital (civ_cap_tile),
        else -1. Owner of a capital tile: 0 if a seat-0 city is centered there
        (center_at>=0), else civ_city_at+1 (civ index -> civ id), else -1 (razed).
        Mirrors dominationWinner: a solo game (R==0) never dominates; any
        unowned or split capital -> -1."""
        B, dev = self.B, self.device
        if self.R == 0:
            return torch.full((B,), -1, dtype=torch.long, device=dev)
        caps = self.civ_cap_tile[:, : 1 + self.R]  # [B, 1+R] capitalTiles — survives rc compaction
        p_owns = self.center_at.gather(1, caps) >= 0
        rv = self.civ_city_at.gather(1, caps)  # civ index or -1
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
