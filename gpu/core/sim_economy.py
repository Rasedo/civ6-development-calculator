from __future__ import annotations

from .simbase import *  # noqa: F401,F403 — torch, constants, helpers: the shared floor
from .simbase import _MUTABLE  # noqa: F401 — private names do not ride a star import
from . import simbase  # the PATCHABLE globals (the pool caps/_ALIAS_CHECK) must be read live

#: the work-ranking key a LOCKED plot takes. An exact f64 integer four decades
#: above the widest score key, so `base - tileIndex` stays exact and the
#: locked group ties on tile index the way the scored group does.
_LOCK_KEY_BASE = 1e12


class SimEconomy:
    def _luxury_amenities(self, row: int, amen_have: torch.Tensor, amen_need: torch.Tensor) -> torch.Tensor:
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
        rounds = (counts > 0).long().sum(dim=1)
        mx = int(rounds.max().item())
        if mx == 0:
            return out
        seq = torch.arange(cols, device=self.device, dtype=dt)
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
        bad = self._ww_opened != self._ww_hooked
        if bool(bad.any()):
            g = int(bad.nonzero()[0])
            raise AssertionError(
                f"WAR-WEARINESS SITE MISSING: game {g} turn {int(self.turn)} opened "
                f"{int(self._ww_opened[g])} battle(s) but scored {int(self._ww_hooked[g])}. "
                f"A damage roll keyed in WW_BATTLE_KEYS has no `_ww_battle` call "
                f"beside it (or one fires under a different mask): one TS rule, "
                f"{len(WW_BATTLE_KEYS)} GPU appliers."
            )
        self._ww_opened.zero_()
        self._ww_hooked.zero_()

    def _ww_max(self, row: int) -> torch.Tensor:
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
        return getattr(self, f"{atk_kind}_unit_seat")[:, u]

    def _row_of(self, seat: torch.Tensor) -> torch.Tensor:
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
        return ((self.military_at.gather(1, t).squeeze(1) >= 0).long()
                | ((self.civilian_at.gather(1, t).squeeze(1) >= 0).long() << 1))

    def _ww_holds(self, row: int) -> bool:
        """Only MAJOR civs keep an accumulator: rows 0..n_majors-1. A city-state is a
        real OPPONENT - warring one wears you down normally - but has no
        amenities to lose and no research to date its era from. The barbarian
        row is never a war at all."""
        return 0 <= row < self.n_majors

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
        civ = row.clamp(0, self.n_majors - 1)
        T, C = self.civ_techs.shape[2], self.civ_civics.shape[2]
        techs = self.civ_techs.gather(1, civ.view(-1, 1, 1).expand(-1, 1, T)).squeeze(1)
        civics = self.civ_civics.gather(1, civ.view(-1, 1, 1).expand(-1, 1, C)).squeeze(1)
        era = self._civ_era(techs, civics).clamp(0, formal.numel() - 1)
        rr = (row >= 0) & (row < self.n_majors) & (foe_row >= 0) & (foe_row < self.n_majors)
        n = self.seat_warkind.shape[1]
        flat = row.clamp(0, n - 1) * n + foe_row.clamp(0, n - 1)
        kind = self.seat_warkind.reshape(self.B, -1).gather(1, flat.unsqueeze(1)).squeeze(1) & rr
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
        self._ww_hooked += hit.long()
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
            score = live & (self_row >= 0) & (self_row < self.n_majors)
            if not bool(score.any()):
                continue
            base = self._ww_era_base(self_row, foe_row)
            # GlobalParameters carries exactly two location rows -
            # WAR_WEARINESS_PER_COMBAT_IN_ALLIED_LANDS 1 and
            # ..._IN_FOREIGN_LANDS 2 - so an ALLY's territory is home ground
            # too, and unowned ground is foreign. `friendlyLand`'s twin.
            _own = owner == self._ROW_SEAT.gather(0, self_row.clamp(min=0))
            _rr = (self_row >= 0) & (self_row < self.n_majors) & (owner >= 0) & (owner < self.n_majors)
            _n = self.seat_allied.shape[1]
            _fl = self_row.clamp(0, _n - 1) * _n + owner.clamp(0, _n - 1)
            _ally = self.seat_allied.reshape(self.B, -1).gather(1, _fl.unsqueeze(1)).squeeze(1) & _rr
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
            fought = fought | ~mask.unsqueeze(1)
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

    def _citystate_suzerain_release(self, patron: int, foe: int, peace: torch.Tensor) -> None:
        """Making peace with `patron` ALSO ends `foe`'s wars against the
        city-states `patron` is suzerain of — the `makePeace` loop that walks
        `state.cityStates` and clears every `cs.atWar` whose suzerain is the
        seat being made peace with.

        The suzerain test is `isSuzerain`'s: at least `suzerainEnvoys`,
        strictly above every other seat."""
        if self.S <= 0 or not bool(peace.any()):
            return
        _cs0 = self.n_majors
        cs = slice(_cs0, _cs0 + max(self.S, 1))
        rel = self._suzerain_mask(patron) & self.war[:, foe, cs] & peace.unsqueeze(1)
        if not bool(rel.any()):
            return
        self.war[:, foe, cs] &= ~rel
        self.war[:, cs, foe] &= ~rel
        self.war_turns[:, foe, cs].masked_fill_(rel, 0)
        self.war_turns[:, cs, foe].masked_fill_(rel, 0)
        self.treaty_turns[:, foe, cs].masked_fill_(rel, self._treaty_turns)
        self.treaty_turns[:, cs, foe].masked_fill_(rel, self._treaty_turns)
        for _s in range(self.S):
            self._ww_peace(rel[:, _s], foe, _cs0 + _s)

    def _ww_penalty(self, row: int, dtype=None) -> torch.Tensor:
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
        return torch.floor(10 + (6 * (n.to(self.dtype) + 1)) ** 1.3)

    def _builder_cost(self, n: torch.Tensor) -> torch.Tensor:
        r = self.rules
        return js_round((r.builder_base + r.builder_per * n.to(self.dtype)) * r.game_speed)

    def _trader_cost(self, row: int) -> torch.Tensor:
        """traderCost: the roster base x (1 + prog x floor(100 x the furthest
        tree fraction) / 100) — COST_PROGRESSION_GAME_PROGRESS, Param1 400."""
        rdv = self.rules_dev
        t_pct = self.civ_techs[:, row].sum(dim=1).double() / float(rdv.t_cost.shape[0])
        c_pct = self.civ_civics[:, row].sum(dim=1).double() / float(rdv.c_cost.shape[0])
        p = torch.floor(100.0 * torch.maximum(t_pct, c_pct)) / 100.0
        return js_round(self._type_cost[self._trader_idx].double() * (1 + self._trader_cost_prog * p))

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
        )
        return (unl & self._is_specialty.unsqueeze(0)).sum(dim=1)

    def _district_discounted(self, row: int, di: int) -> torch.Tensor:
        if not bool(self._is_specialty[di]):
            return torch.zeros(self.B, dtype=torch.bool, device=self.device)
        U = self._unlocked_specialty_count(self._seat_techs(row), self._seat_civics(row))
        placed = self.city_dist_tile[:, row]
        n = (placed[:, :, di] >= 0).sum(dim=1)
        tiles_f = placed.clamp(min=0).reshape(self.B, -1)
        comp = (placed >= 0) & self.district_complete.gather(1, tiles_f).reshape(placed.shape)
        D = (comp & self._is_specialty.reshape(1, 1, -1)).sum(dim=(1, 2))
        thresh = torch.div(D + U.clamp(min=1) - 1, U.clamp(min=1), rounding_mode="floor")
        return (U > 0) & (D >= U) & (n < thresh)

    def _available_mask(self, done: torch.Tensor, prereq: torch.Tensor) -> torch.Tensor:
        missing = (prereq.unsqueeze(0) & ~done.unsqueeze(1)).any(dim=2)
        return ~done & ~missing

    def _eff_cost(self, cost: torch.Tensor, boosted: torch.Tensor, golden_civ=None, is_civic: bool = False) -> torch.Tensor:
        frac = self.rules.boost_fraction
        if golden_civ is not None:
            g = self._golden_ded(golden_civ, self._ded_pen_brush if is_civic else self._ded_free_inquiry)
            extra = g.to(cost.dtype).reshape(-1, *((1,) * (cost.dim() - 1))) * 0.1
            return torch.where(boosted, js_round(cost * (1 - frac - extra)), cost)
        return torch.where(boosted, js_round(cost * (1 - frac)), cost)

    def _auto_pick(self, cur, done, boosted, cost, prereq, golden_civ=None, is_civic: bool = False):
        """Cheapest-available (effective cost, tie = table order), where cur == -1.
        The key is the DISCOUNTED cost, so a golden Free Inquiry /
        Pen-Brush-and-Voice changes which item is picked, and the cost it
        sorts on is `effectiveResearchCostIn`'s, which carries the same
        bonus."""
        avail = self._available_mask(done, prereq)
        eff = self._eff_cost(cost.unsqueeze(0).expand_as(avail), boosted, golden_civ, is_civic)
        key = torch.where(avail, eff, torch.tensor(float("inf"), dtype=self.dtype, device=self.device)).double()
        key = key + torch.arange(key.shape[1], device=self.device, dtype=torch.float64) * 1e-6
        best = key.argmin(dim=1)
        has = avail.any(dim=1)
        return torch.where((cur == -1) & has, best, cur)

    def _food_base(self) -> torch.Tensor:
        """[B, T] tile FOOD as tileYields has it at the END of the improvement
        block — terrain + feature + resource, less a CHOPPED or
        founding-stripped feature, plus the FARM's own food. Everything a SEAT
        adds (the farm-adjacency tier) belongs on top of THIS, before the tail.

        The stripped feature is subtracted HERE, at the top, because tileYields
        reads `tile.feature` live at the terrain step and the drought floor is
        the LAST thing it does. Subtracting afterwards puts the floor on the
        wrong side: a stripped RAINFOREST/MARSH on a 0-food terrain under
        drought floors to 0 and then goes to −1. Callers must NOT strip
        column 0 again."""
        if self._fbase_cache is not None and self._fbase_cache[0] == self._eff_version:
            return self._fbase_cache[1]
        base = self.tile_yields[:, :, 0]
        if bool(self.feat_stripped.any()):
            base = base - self.feat_yields[:, :, 0] * self.feat_stripped.to(self.dtype)
        if self.improvements_on:
            farm = (self.improvement == self.FARM) & ~self.pillaged
            base = base + farm.to(self.dtype) * self._farm_food
        self._fbase_cache = (self._eff_version, base)
        return base

    def _food_tail(self, base: torch.Tensor) -> torch.Tensor:
        """tileYields' last three lines over a food plane: fertility feeds
        (+1 each, already capped), drought starves (−1, floored at 0), and a
        natural-wonder tile keeps the wonder's fixed food because it
        EARLY-RETURNS above all of it — the disaster STATE still lands on it
        (the trace counts it), but its food never moves."""
        food = base + self.fertility.to(self.dtype)
        food = torch.where(self.drought > 0, (food - 1).clamp(min=0), food)
        return torch.where(self.nwonder, self.tile_yields[:, :, 0], food)

    def _eff_food(self) -> torch.Tensor:
        """[B, T] tile FOOD with the disaster terms applied — the whole of
        tileYields' food column for a seat with no farm-adjacency tier. Food is
        the only column disasters touch; consumers that don't mix columns read
        this directly and skip the full [B, T, 6] assembly."""
        if self._food_cache is not None and self._food_cache[0] == self._eff_version:
            return self._food_cache[1]
        food = self._food_tail(self._food_base())
        self._food_cache = (self._eff_version, food)
        return food

    def _neutral_prod(self) -> torch.Tensor:
        """[B, T] tile PRODUCTION with NO seat's research in it — the base
        every seat shares: the improvement is physically on the tile and
        pillage suspends it, whoever is looking.

        The tech-boosted part is NOT missing, it is per SEAT and cannot live
        in a [B, T] plane: `_seat_city_yields` adds `_mine_boost_amt` from
        THAT row's own techs, which is what TS does when it builds the yield
        context from `getModifiers(state, city.seat)`. Cached per
        _eff_version (improvement/pillage changes bump it)."""
        base = self.tile_yields[:, :, 1] + self.fertility_prod.to(self.dtype)
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
        new_imp = self.improvement >= 3
        if bool(new_imp.any()):
            out = out + (new_imp & live).to(self.dtype) * self._imp_yields[self.improvement.clamp(min=0), 1]
        self._nprod_cache = (self._eff_version, out)
        return out

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
        ok = (self.improvement[rows, tiles] >= 0) & ~self.pillaged[rows, tiles]
        self.pillaged[rows[ok], tiles[ok]] = True

    def _flood_district(self, rows: torch.Tensor, tiles: torch.Tensor) -> None:
        """CIV6 (Gathering Storm): a flood damages the DISTRICT on the
        floodplain, not just the improvement — the buildings inside go dark with
        it, which is what a Dam is built to prevent. The `district` plane never
        encodes a city CENTRE, so centres are outside this by construction."""
        ok = ((self.district[rows, tiles] >= 0) & self.district_complete[rows, tiles]
              & ~self.district_pillaged[rows, tiles])
        self.district_pillaged[rows[ok], tiles[ok]] = True

    def _pick_static(self, mask_hit: torch.Tensor, cand_list: tuple[torch.Tensor, torch.Tensor]) -> tuple[torch.Tensor, torch.Tensor]:
        idx, cnt = cand_list
        has = mask_hit & (cnt > 0)
        r = self._next_random(has)
        k = torch.floor(r * cnt.to(torch.float64)).to(torch.long)
        tile = idx.gather(1, k.clamp(min=0, max=idx.shape[1] - 1).unsqueeze(1)).squeeze(1)
        return has, tile

    def _disaster_phase(self) -> None:
        B, dev = self.B, self.device
        self._eff_version += 1
        self.drought.copy_((self.drought - 1).clamp(min=0))
        every = torch.ones(B, dtype=torch.bool, device=dev)

        r = self._next_random(every)
        hit, tile = self._pick_static(r < 0.05, self._flood_list)
        self._flood_tile(hit, tile)

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
            nb = self.neigh[torch.cat(er_volc)]
            row6 = rows.unsqueeze(1).expand(-1, 6).reshape(-1)
            nbf = nb.reshape(-1)
            on = nbf >= 0
            self._scorch(row6[on], nbf[on])
            self._fertilize_counted(row6[on], nbf[on])

        r = self._next_random(every)
        hit, tile = self._pick_static(r < 0.02, self._droughtc_list)
        if bool(hit.any()):
            rows = hit.nonzero(as_tuple=True)[0]
            area = tiles_from_offsets(tile[rows], self._off2, self.W, self.H)
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
            area = tiles_from_offsets(tile[rows], self._off1, self.W, self.H)
            M = area.shape[1]
            rowm = rows.unsqueeze(1).expand(-1, M).reshape(-1)
            af = area.reshape(-1)
            valid = af >= 0
            self._scorch(rowm[valid], af[valid])
            on = valid & self.desert[rowm, af.clamp(min=0)]
            self._fertilize(rowm[on], af[on])

    def _flood_tile(self, hit: torch.Tensor, tile: torch.Tensor) -> None:
        """`floodTile` — ONE river flood on one Floodplains tile.

        CIV6: a flood "damages or destroys Districts, improvements, and units on
        the Floodplains tiles near the River. This may also include a City
        Center, in which case it loses some HP and Defenses... May kill some
        Citizens in a nearby city... Can fertilize affected tiles." The severity
        ladder decides every magnitude, and the Great Bath cancels the damage
        half while halving the fertility half.

        EIGHT draws, always, whatever the tile holds — the count depends on the
        flood alone, so the two engines cannot slip apart on what stood there.
        """
        B, dev = self.B, self.device
        r_sev = self._next_random(hit)
        sev = torch.zeros(B, dtype=torch.long, device=dev)
        acc = 0.0
        for i, p in enumerate(self._flood_sev_p):
            lo, acc = acc, acc + p
            sev = torch.where((r_sev >= lo) & (r_sev < acc), torch.full_like(sev, i), sev)
        sev = torch.where(r_sev >= acc, torch.full_like(sev, len(self._flood_sev_p) - 1), sev)
        r_destroy = self._next_random(hit)
        r_district = self._next_random(hit)
        r_damage = self._next_random(hit)
        r_civilian = self._next_random(hit)
        r_pop = self._next_random(hit)
        r_food = self._next_random(hit)
        r_prod = self._next_random(hit)
        if not bool(hit.any()):
            return
        tc = tile.clamp(min=0)
        seat_at = self.tile_seat.gather(1, tc.unsqueeze(1)).squeeze(1)
        mit = torch.zeros(B, dtype=torch.bool, device=dev)
        if self._wond_n:
            for _r in range(self.n_majors):
                mit = mit | ((seat_at == _r) & self._seat_wonder_any(_r, self._wond_floodmit))
        raw = hit & ~mit

        rows = raw.nonzero(as_tuple=True)[0]
        if rows.numel():
            self._scorch(rows, tc[rows])
            gone = rows[(r_destroy[rows] < self._flood_destroy_p[sev[rows]])
                        & (self.improvement[rows, tc[rows]] >= 0)]
            if gone.numel():
                self.improvement[gone, tc[gone]] = -1
                self.pillaged[gone, tc[gone]] = False
            dist = rows[r_district[rows] < self._flood_district_p[sev[rows]]]
            if dist.numel():
                self._flood_district(dist, tc[dist])
        lo, hi = self._flood_dmg_lo[sev], self._flood_dmg_hi[sev]
        dmg = lo + torch.floor(r_damage * (hi - lo + 1).double()).to(torch.long)
        dmg = torch.where(raw, dmg, torch.zeros_like(dmg))
        hurt = raw & (dmg > 0)
        if bool(hurt.any()):
            # A CITY CENTER on the floodplain loses HP and, if it has one,
            # perimeter.
            ctr = self._centre_seat_plane().gather(1, tc.unsqueeze(1)).squeeze(1)
            cr = (hurt & (ctr >= 0) & (ctr < self.n_majors)).nonzero(as_tuple=True)[0]
            if cr.numel():
                hrow = ctr[cr]
                hcol = self.centre_slot_at.gather(1, tc.unsqueeze(1)).squeeze(1)[cr].clamp(min=0)
                self.city_hp[cr, hrow, hcol] = (self.city_hp[cr, hrow, hcol] - dmg[cr]).clamp(min=1)
                oh = self.city_outer_hp[cr, hrow, hcol]
                self.city_outer_hp[cr, hrow, hcol] = torch.where(oh > 0, (oh - dmg[cr]).clamp(min=0), oh)
            for pool in ("major", "barb"):
                mil = getattr(self, f"{pool}_unit_alive")
                lo_p, hi_p = self.POOL_LO[pool], self.POOL_HI[pool]
                for plane, civilian in ((self.military_at, False), (self.civilian_at, True)):
                    slot = plane.gather(1, tc.unsqueeze(1)).squeeze(1)
                    on = hurt & (slot >= lo_p) & (slot < hi_p)
                    if not bool(on.any()):
                        continue
                    ur = on.nonzero(as_tuple=True)[0]
                    us = (slot[ur] - lo_p)
                    if civilian:
                        # "Civilians killed" is its own column — a chance, not
                        # damage.
                        keep = r_civilian[ur] < self._flood_pop_p[sev[ur]]
                        ur, us = ur[keep], us[keep]
                        if ur.numel() == 0:
                            continue
                        mil[ur, us] = False
                        self._vacate(pool, ur, us)
                    else:
                        hp = getattr(self, f"{pool}_unit_hp")
                        hp[ur, us] = hp[ur, us] - dmg[ur]
                        dead = hp[ur, us] <= 0
                        if bool(dead.any()):
                            dr, ds = ur[dead], us[dead]
                            mil[dr, ds] = False
                            self._vacate(pool, dr, ds)
        # A CITIZEN of the tile's owning city, on its own roll. TS puts this
        # beside the damage block, not inside it — a city-state's tile pays
        # nothing either way, since only a major keeps a city list.
        pr = (raw & (r_pop < self._flood_pop_p[sev])).nonzero(as_tuple=True)[0]
        if pr.numel():
            for _r in range(self.n_majors):
                sel = pr[seat_at[pr] == _r]
                if sel.numel() == 0:
                    continue
                # gather over the WHOLE batch, then take `sel`: a gather whose
                # index is already narrowed reads batch rows 0..len(sel)-1.
                sl = self.city_slot_at(_r).gather(1, tc.unsqueeze(1)).squeeze(1)[sel]
                ok = sl >= 0
                sel, sl = sel[ok], sl[ok].clamp(min=0)
                if sel.numel() == 0:
                    continue
                pop = self.city_pop[sel, _r, sl]
                self.city_pop[sel, _r, sl] = torch.where(pop > 1, pop - 1, pop)
        # FERTILIZATION. Each yield is its own roll, so one flood may pay both.
        # A mitigated river still silts, at half the rate.
        col = self._flood_fert_col[self.terrain.gather(1, tc.unsqueeze(1)).squeeze(1).clamp(min=0)]
        half = torch.where(mit, torch.full((B,), 0.5, dtype=torch.float64, device=dev),
                           torch.ones(B, dtype=torch.float64, device=dev))
        fr = (hit & (r_food < self._flood_fert_food[sev, col] * half)).nonzero(as_tuple=True)[0]
        if fr.numel():
            self._fertilize(fr, tc[fr])
        pr2 = (hit & (r_prod < self._flood_fert_prod[sev, col] * half)).nonzero(as_tuple=True)[0]
        if pr2.numel():
            ok = self.fertilizable[pr2, tc[pr2]]
            r2, t2 = pr2[ok], tc[pr2][ok]
            self.fertility_prod[r2, t2] = (self.fertility_prod[r2, t2] + 1).clamp(max=3)

    def _seat_buildable(self, row: int, complete: bool = False) -> torch.Tensor:
        """[B, RC, NB] buildings seat row `row`'s cities may QUEUE now —
        `availableBuildings`, which is seat-generic in TS and so has ONE body
        for every row here.

        The district term walks the city's OWN REGISTRY (`city.districts`),
        which TS writes at QUEUE: a Library is offered while its Campus is
        still building, and only `buildingCompletable` — the PURCHASE gate,
        `complete=True` — demands the district be finished.

        WORSHIP buildings are never offered. `availableBuildings` admits one
        only when it IS this seat's founded religion's worship building, and
        nothing in the live engine ever sets `religion.worship` (the founding
        body claims follower/founder/enhancer and no worship id) — the one
        live path to a worship building is `buyWorshipBuilding`.

        `queued` is the one-slot twin of TS's queued SET: the production slot
        holds a BUILDING code exactly when that building is on order, and TS
        offers neither it nor a prerequisite it would satisfy twice.
        """
        key = (row, complete)
        hit = self._bld_cache.get(key)
        if hit is not None and hit[0] == self._eff_version:
            return hit[1]
        rd = self.rules_dev
        B, C, NB, dev = self.B, self.RC, self.NB, self.device
        ones_nb = torch.ones(B, NB, dtype=torch.bool, device=dev)
        have = self.city_bldg[:, row]
        unlocked = torch.where(
            rd.b_unlock.unsqueeze(0) >= 0,
            self.civ_techs[:, row].gather(1, rd.b_unlock.clamp(min=0).unsqueeze(0).expand(B, -1)),
            ones_nb,
        ) & torch.where(
            rd.b_unlock_civic.unsqueeze(0) >= 0,
            self.civ_civics[:, row].gather(1, rd.b_unlock_civic.clamp(min=0).unsqueeze(0).expand(B, -1)),
            ones_nb,
        )  # Temple/Amphitheater/... gate on a CIVIC (availableBuildings' unlocks.buildings)
        cur = self.city_current[:, row]  # [B, C] production layout: [0, NB) IS the building range
        queued = torch.nn.functional.one_hot(cur.clamp(min=0, max=NB - 1), NB).bool() & ((cur >= 0) & (cur < NB)).unsqueeze(2)
        # hasRiver at each centre, read off the static tile plane (a dead
        # slot's centre is -1; its column is masked by `alive` downstream).
        river_c = self.tile_river.gather(1, self.city_center[:, row].clamp(min=0))  # [B, C]
        base = (
            unlocked.unsqueeze(1) & ~have & ~queued
            & (~rd.b_river.reshape(1, 1, -1) | river_c.unsqueeze(2))
            & ~self._b_worship.reshape(1, 1, -1)
        )
        # CIV6 (Urban Development Treaty, outcome B): "No buildings can be
        # created in this district." New picks only — in-flight items finish.
        _pu, _bl = self._congress_udt()
        _blk = (_bl >= 0).unsqueeze(1) & (self._b_req_district.unsqueeze(0) == _bl.unsqueeze(1))
        base = base & ~_blk.unsqueeze(1)
        if self.districts_on and self._b_has_reqs:
            rq = self._b_req_district  # [NB] the district each building needs, -1 = none
            reg = self.city_dist_tile[:, row][:, :, rq.clamp(min=0)]  # [B, C, NB] registry tile per building
            has_d = reg >= 0
            if complete:
                has_d = has_d & self.district_complete.gather(1, reg.clamp(min=0).reshape(B, -1)).reshape(B, C, NB)
            district_ok = (rq < 0).reshape(1, 1, NB) | has_d
            prereq_ok = torch.ones(B, C, NB, dtype=torch.bool, device=dev)
            hq = have | queued  # availableBuildings counts what is ON ORDER too
            # A PURCHASE must satisfy availableBuildings AND buildingCompletable,
            # and the latter reads `city.buildings` alone — so the conjunction
            # wants a BUILT prerequisite, while an exclusion still fires off
            # either list.
            req_src = have if complete else hq
            for nb, reqs in enumerate(self._b_req_buildings):
                if reqs:
                    prereq_ok[:, :, nb] = req_src[:, :, reqs].any(dim=2)
            for nb, excl in enumerate(self._b_excl_buildings):
                if excl:
                    prereq_ok[:, :, nb] &= ~hq[:, :, excl].any(dim=2)
            base = base & district_ok & prereq_ok
        self._bld_cache[key] = (self._eff_version, base)
        return base

    def _naval_capable(self, row: int) -> torch.Tensor:
        B, C = self.B, self.RC
        ctr = self.city_center[:, row].clamp(min=0)  # [B, C]
        nb = self.neigh[ctr]  # [B, C, 6]
        out = ((nb >= 0) & self.wpass.gather(1, nb.clamp(min=0).reshape(B, -1)).reshape(B, C, 6)).any(dim=2)
        if self._harbor_idx >= 0:
            hb = self.city_dist_tile[:, row, :, self._harbor_idx]
            out = out | ((hb >= 0) & self.district_complete.gather(1, hb.clamp(min=0)))
        return out

    def _trainable_units(self, row: int) -> torch.Tensor:
        """[B, RC, NU] chassis seat row `row` may TRAIN or BUY in each city —
        `trainableUnits`, one body for every seat.

        The filters, in TS order: faith-only (MISSIONARY), spawn-only
        (GENERAL/ADMIRAL), the SETTLER (which trains through its own
        escalating column), the tech gate, the civic gate, the
        ARCHAEOLOGIST's free-artifact-slot rule, strategic-resource access,
        and finally NAVAL hulls, which need a naval-capable city.
        """
        B, C, dev = self.B, self.RC, self.device
        if not self.units_mode:
            return torch.zeros(B, C, self.NU, dtype=torch.bool, device=dev)
        ok = (self._type_tech.unsqueeze(0) < 0) | self.civ_techs[:, row].gather(
            1, self._type_tech.clamp(min=0).unsqueeze(0).expand(B, -1)
        )
        ok = ok & self._res_avail_mask(self.tile_seat == row)
        ok = ok & ~(self._type_faith_only | self._type_spawn_only | self._type_settler).reshape(1, -1)
        out = ok.unsqueeze(1) & self._type_civic_slot_ok(row, True)
        if bool(self.unit_naval.any()):
            out = out & (~self.unit_naval.reshape(1, 1, -1) | self._naval_capable(row).unsqueeze(2))
        # CIV6: "when the number of Traders equals the Trading Capacity you
        # cannot build more" — free Traders plus active routes, against
        # tradeCapacity. The trainableUnits twin of the same gate.
        owned = (
            (self.major_unit_alive & (self.major_unit_seat == row)
             & (self.major_unit_type == self._trader_idx)).sum(dim=1)
            + (self.seat_routes[:, row, :, 0] >= 0).sum(dim=1)
        )
        cap_ok = owned < self._trade_capacity(row)
        is_tr = (torch.arange(self.NU, device=dev) == self._trader_idx).reshape(1, 1, -1)
        out = out & (~is_tr | cap_ok.reshape(B, 1, 1))
        return out

    def _worship_bidx_of(self, row: int) -> int:
        if not self._worship_bidx:
            return -1
        return int(self._worship_bidx[row % len(self._worship_bidx)])

    def _worship_city_ok(self, row: int) -> torch.Tensor:
        """[B, RC] cities of seat row `row` that could take its worship
        building NOW — `buyWorshipBuilding`'s city gates: a TEMPLE, a COMPLETE
        unpillaged Holy Site, and no worship building yet. The seat-level
        gates (a founded religion, the faith) sit at the call site."""
        wb = self._worship_bidx_of(row)
        if wb < 0 or self._temple_bidx < 0 or self._hs_idx < 0:
            return torch.zeros(self.B, self.RC, dtype=torch.bool, device=self.device)
        hs = self.city_dist_tile[:, row, :, self._hs_idx]
        hs_ok = (hs >= 0) & self.district_complete.gather(1, hs.clamp(min=0)) & ~self.district_pillaged.gather(1, hs.clamp(min=0))
        return (self.city_alive[:, row] & self.city_bldg[:, row, :, self._temple_bidx]
                & ~self.city_bldg[:, row, :, wb] & hs_ok)

    def _adj_district_count(self) -> torch.Tensor:
        """[B, T] number of adjacent COMPLETED districts — the DISTRICT
        adjacency source. Counts every MAJOR city centre (centre_slot_at —
        those carry tile.district='CITY_CENTER' in TS) and every completed
        specialty district (self.district). No owner filter, mirroring
        matchesAdjacency('DISTRICT')."""
        if self._adjd_cache is not None and self._adjd_cache[0] == self._eff_version:
            return self._adjd_cache[1]
        nb = self.neigh
        nbc = nb.clamp(min=0)
        on_map = (nb >= 0).unsqueeze(0)
        is_d = ((self.centre_slot_at[:, nbc] >= 0) | ((self.district[:, nbc] >= 0) & self.district_complete[:, nbc])) & on_map
        out = is_d.sum(dim=2)
        self._adjd_cache = (self._eff_version, out)
        return out

    def _adj_center_count(self) -> torch.Tensor:
        if self._adjc_cache is not None and self._adjc_cache[0] == self._eff_version:
            return self._adjc_cache[1]
        nb = self.neigh
        nbc = nb.clamp(min=0)
        on_map = (nb >= 0).unsqueeze(0)
        is_c = (self.centre_slot_at[:, nbc] >= 0) & on_map
        out = is_c.sum(dim=2)
        self._adjc_cache = (self._eff_version, out)
        return out

    def _adj_harbor_count(self) -> torch.Tensor:
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
        # memoised on _eff_version like its count siblings above — it reads the
        # same district/district_complete planes, whose every writer bumps the key
        if self._adjt_cache is None or self._adjt_cache[0] != self._eff_version:
            self._adjt_cache = (self._eff_version, {})
        d = self._adjt_cache[1]
        v = d.get(di)
        if v is None:
            nb = self.neigh
            nbc = nb.clamp(min=0)
            v = ((self.district[:, nbc] == di) & self.district_complete[:, nbc] & (nb >= 0).unsqueeze(0)).any(dim=2)
            d[di] = v
        return v

    def _adj_res_live(self, ri: int) -> torch.Tensor:
        nb = self.neigh
        nbc = nb.clamp(min=0)
        hit = (self.res_id[:, nbc] == ri) & ~self.res_stripped[:, nbc] & (nb >= 0).unsqueeze(0)
        return hit.any(dim=2)

    def _adopted_gov(self, civics2: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        B, dev = civics2.shape[0], self.device
        guc = self._gov_unlock_civic
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

    def _slotted_policies(self, civics2: torch.Tensor,
                          extra_slots: torch.Tensor | None = None) -> torch.Tensor:
        """[B, nPol] — the cards a seat's adopted government greedily slots,
        `computeAdoption().policies` as a mask over the card table.

        WILDCARD slots fill with the within-kind OVERFLOW in card-table order
        (TS findIndex: a card whose kind slots are full takes the first open
        W; every catalog government lists its W slots LAST, so kind-first
        matches findIndex). POLICY TREATY outcome B removes one card from the
        pool entirely, exactly as `computeAdoption`'s `blocked` does."""
        B, dev = civics2.shape[0], self.device
        slotted = torch.zeros(B, self._npol, dtype=torch.bool, device=dev)
        if not self._gov_has_effects or not self._ngov or not self._npol:
            return slotted
        adopted, has_gov = self._adopted_gov(civics2)
        nslots = self._gov_slots[adopted] * has_gov.long().unsqueeze(1)  # [B, 4]
        # Wonder- and congress-granted slots — TS appends them to
        # computeAdoption's slot list; a seat with no government slots nothing.
        if extra_slots is not None:
            nslots = nslots + extra_slots * has_gov.long().unsqueeze(1)
        puc = self._pol_unlock_civic  # [nPol]
        pol_unlocked = torch.where(
            puc.unsqueeze(0) >= 0,
            civics2.gather(1, puc.clamp(min=0).unsqueeze(0).expand(B, -1)),
            torch.zeros(B, self._npol, dtype=torch.bool, device=dev),
        )  # [B, nPol]
        banned = self._congress_policy_blocked()  # [B], -1 = nothing forbidden
        pol_unlocked = pol_unlocked & (
            torch.arange(self._npol, device=dev).unsqueeze(0) != banned.unsqueeze(1))
        for k in range(3):  # military/economic/diplomatic
            uk = pol_unlocked & (self._pol_kind == k).unsqueeze(0)  # [B, nPol]
            cum = uk.long().cumsum(dim=1)  # inclusive rank among unlocked-of-kind, table order
            slotted = slotted | (uk & (cum <= nslots[:, k : k + 1]))
        overflow = pol_unlocked & ~slotted
        w_rank = overflow.long().cumsum(dim=1)
        return slotted | (overflow & (w_rank <= nslots[:, 3:4]))

    def _gov_policy_mods(self, civics2: torch.Tensor, extra_slots: torch.Tensor | None = None) -> tuple[
        torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor
    ]:
        """(cityYields [B,6], capitalYields [B,6], housingAll [B], yieldMult
        [B,6], slotted-mask [B,nPol], encampHarborProdMult [B],
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
        amen_all = torch.zeros(B, dtype=dt, device=dev)
        hid = []   # list of (min[B], housing[B])
        nd = []    # list of (min[B], housing[B], amenities[B])
        ymult = torch.ones(B, 6, dtype=dt, device=dev)
        slotted = torch.zeros(B, self._npol, dtype=torch.bool, device=dev)
        emult = torch.ones(B, dtype=dt, device=dev)  # encampHarborProdMult product (VETERANCY)
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
        emult = torch.where(has_gov, self._gov_ehprod[adopted], emult)
        tpmult = torch.where(has_gov, self._gov_tpmult[adopted], tpmult)
        if self._npol:
            slotted = self._slotted_policies(civics2, extra_slots)
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
            emult = emult * torch.where(slotted, self._pol_ehprod.unsqueeze(0).expand(B, -1), torch.ones(B, self._npol, dtype=dt, device=dev)).prod(dim=1)
            tpmult = tpmult * torch.where(slotted, self._pol_tpmult.unsqueeze(0).expand(B, -1), torch.ones(B, self._npol, dtype=dt, device=dev)).prod(dim=1)
        return city_y, cap_y, hous_all, ymult, slotted, emult, tpmult, amen_all, hid, nd

    def _cond_house_amen(self, hid, nd, spec_d):
        """The two district-conditional rules, for ANY seat.

        CIV6 (Insulae / Medina Quarter / New Deal): all three key on SPECIALTY
        districts — `housingIfDistricts` pays housing, `newDeal` pays housing
        AND amenities. TS applies both in `computeHousing`/`computeCityStats`;
        one rule, so one applier, shared by every seat's path.

        `spec_d` is a [B, C] district count; returns (housing, amenities)
        of the same shape."""
        house = torch.zeros_like(spec_d, dtype=self.dtype)
        amen = torch.zeros_like(spec_d, dtype=self.dtype)
        for mn, hs in hid:
            ok = (mn.unsqueeze(1) >= 0) & (spec_d >= mn.unsqueeze(1))
            house = house + ok.to(self.dtype) * hs.unsqueeze(1)
        for mn, hs, am in nd:
            ok = (mn.unsqueeze(1) >= 0) & (spec_d >= mn.unsqueeze(1))
            house = house + ok.to(self.dtype) * hs.unsqueeze(1)
            amen = amen + ok.to(self.dtype) * am.unsqueeze(1)
        return house, amen

    def _gov_mods(self, row: int):
        if self._gov_pol_cache is None or self._gov_pol_cache[0] != self._eff_version:
            self._gov_pol_cache = (self._eff_version, {})
        d = self._gov_pol_cache[1]
        v = d.get(row)
        if v is None:
            v = self._gov_policy_mods(self._seat_civics(row), self._wonder_extra_slots(row))
            d[row] = v
        return v

    def _district_adj_raw(self, di: int, adjc: torch.Tensor) -> torch.Tensor:
        raw = self.d_static_adj[:, :, di] + self._dyn_district[di] * adjc
        if float(self._dyn_bwonder[di]) != 0:
            nbw = self.neigh
            nbwc = nbw.clamp(min=0)
            cntw = ((self.built_wonder[:, nbwc] >= 0) & self.built_wonder_complete[:, nbwc] & (nbw >= 0).unsqueeze(0)).sum(dim=2)
            raw = raw + self._dyn_bwonder[di] * cntw.to(self.dtype)
        if float(self._dyn_center[di]) != 0:
            raw = raw + self._dyn_center[di] * self._adj_center_count().to(self.dtype)
        if float(self._dyn_harbor[di]) != 0:
            raw = raw + self._dyn_harbor[di] * self._adj_harbor_count().to(self.dtype)
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
        if self._dadj_cache is None or self._dadj_cache[0] != self._eff_version:
            self._dadj_cache = (self._eff_version, {})
        d = self._dadj_cache[1]
        v = d.get(di)
        if v is None:
            v = torch.floor(self._district_adj_raw(di, self._adj_district_count().to(self.dtype)))
            d[di] = v
        return v

    def _district_elig_site(self, row: int, j: int) -> torch.Tensor:
        """[B, T] the part of `canPlaceDistrictIn` that depends only on the CITY
        — everything but the surface and the two placement clauses. Every
        district type in one city shares it, so a caller looping the catalog
        computes it ONCE and hands it back through `_district_elig(base=…)`."""
        B, dev = self.B, self.device
        center = self.city_center[:, row, j].clamp(min=0)
        elig = (
            (self.tile_seat == row)
            & (self.tile_city == self.city_id[:, row, j].unsqueeze(1))
            & (self.district < 0)
            & (self.built_wonder < 0)
            & (self.improvement < 0)
            & (self.res_priority <= 1)  # only a BONUS resource may be paved over
            & (self.pair_dist[center] <= 3)  # CITY_WORK_RADIUS
        )
        # A district PAVES the tile, so a removable feature still standing on it
        # must be one this seat could clear — `tile_ftu` is that feature's
        # removal tech, -1 where there is nothing to clear.
        need_clear = (self.tile_ftu >= 0) & ~self.feat_stripped
        if bool(need_clear.any()):
            have = self.civ_techs[:, row].gather(1, self.tile_ftu.clamp(min=0))
            elig = elig & (~need_clear | have)
        # No clone: the `&` chain above already returns a fresh tensor nothing
        # else references. Callers must not write into what they get back.
        elig[torch.arange(B, device=dev), center] = False  # dist === 0 is the centre
        return elig

    def _district_elig(self, row: int, j: int, di: int, placement: int = 0,
                       base: torch.Tensor | None = None) -> torch.Tensor:
        """[B, T] the tiles that may take district `di` in seat row `row`'s city
        slot j — `canPlaceDistrictIn`, which is seat-generic in TS and so has
        ONE body here.

        `seat_masks` asks "can this district be placed AT ALL" without placing
        it, so the mask and `_place_district` MUST share this predicate:
        anything the mask decides without running this can report a district
        legal where the placer rejects it. It answers LEGALITY only — ranking
        the legal tiles is the policy's job (`district_rank_adj`).
        """
        # Harbor sits on coastal water, the Spaceport on FLAT land (no Hills),
        # everything else on any usable land.
        surface = (self.coastal_water if placement == 2
                   else self.d_usable & ~self.hills if placement == 4
                   else self.d_usable)
        elig = (self._district_elig_site(row, j) if base is None else base) & surface
        if placement in (1, 3):  # Aqueduct: adjacent-centre + water source; Encampment: NOT adjacent-centre
            cc = self._adj_center_count()  # [B, T] adjacent CITY_CENTERs (any seat)
            elig = elig & ((cc >= 1) & self.aqsrc if placement == 1 else (cc == 0))
        return elig

    def district_rank_adj(self, di: int, placement: int = 0) -> torch.Tensor:
        """[B, T] the adjacency a district of type `di` WOULD earn on each tile
        — what a placement policy ranks its legal tiles by. The Aqueduct, the
        Encampment and the Spaceport have no adjacency yield at all, so they
        rank flat and fall to the lowest tile index."""
        if placement in (1, 3, 4):
            return torch.zeros(self.B, self.T, dtype=self.dtype, device=self.device)
        return self._district_adj_floor(di)

    def _place_district(self, row: int, j: int, di: int, want: torch.Tensor,
                        placement: int, tile: torch.Tensor) -> torch.Tensor:
        """Queue district `di` in row `row`'s city slot j ON THE TILE THE RECORD
        NAMES. The engine does not choose the plot: `tile` [B] is the policy's
        pick and this body only re-validates it, so a tile that stopped being
        eligible since the mask REFUSES rather than sliding to a neighbour the
        policy never asked for."""
        elig = self._district_elig(row, j, di, placement)
        bt_all = tile.clamp(min=0, max=self.T - 1)
        place = want & (tile >= 0) & (tile < self.T) & elig.gather(1, bt_all.unsqueeze(1)).squeeze(1)
        if bool(place.any()):
            rows = place.nonzero(as_tuple=True)[0]
            bt = bt_all[rows]
            self.district[rows, bt] = di
            self.district_complete[rows, bt] = False  # queued, not complete
            self.improvement[rows, bt] = -1           # queueDistrict clears it
            self.city_qtile[rows, row, j] = bt        # the completion target
            # The city registry, written at queue. A REPEATABLE type keeps its
            # FIRST tile: nothing reads the entry for its own sake (no
            # buildings, no projects, no adjacency of its own), and
            # `_district_counts` reads the tile plane for it.
            if bool(self._is_repeatable[di]):
                _held = self.city_dist_tile[rows, row, j, di]
                self.city_dist_tile[rows, row, j, di] = torch.where(_held < 0, bt, _held)
            else:
                self.city_dist_tile[rows, row, j, di] = bt
            # CIV6: a district paves every feature EXCEPT floodplains — the
            # feature stays under the district and keeps feeding the flood
            # pick (queueDistrict and _queue_wonder_at share this gate).
            nofp = self.feat_id[rows, bt] != self._fp_fid
            if bool(nofp.any()):
                self._strip_feature_at(rows[nofp], bt[nofp])
            fresh_rs = (self.res_priority[rows, bt] == 1) & ~self.res_stripped[rows, bt]
            self.res_stripped[rows, bt] = self.res_stripped[rows, bt] | (self.res_priority[rows, bt] == 1)
            self._withdraw_sea_adj(rows[fresh_rs], bt[fresh_rs])
            self._eff_version += 1
        return place

    def _art_museum_themed(self, row: int) -> torch.Tensor:
        """[B, RC] bool — is this city's ART MUSEUM themed? CIV6: "its slots
        must be filled with Great Works of Art of the same type ... made by
        different Great Artists." `artMuseumThemed` is the twin."""
        n = self._gw_slots_k[1]
        types = self.city_gwart_type[:, row, :, :n]     # [B, RC, n]
        artists = self.city_gwart_artist[:, row, :, :n]
        full = (self.city_gw_art[:, row] >= n) & (types >= 0).all(dim=2)
        one_type = (types == types[:, :, :1]).all(dim=2)
        distinct = torch.ones_like(full)
        for i in range(n):
            for j in range(i + 1, n):
                distinct = distinct & (artists[:, :, i] != artists[:, :, j])
        return full & one_type & distinct

    def _art_themed_works(self, row: int) -> torch.Tensor:
        """[B, RC] long — how many ART works pay TWICE: the themed museum's own
        slots, and only those. A wonder's art slots sit outside the bonus."""
        return self._art_museum_themed(row).long() * ((self._theming_mult - 1) * self._gw_slots_k[1])

    def _place_works(self, row: int, hit: torch.Tensor, culture_val: torch.Tensor, kind: int,
                     artist: torch.Tensor | None = None) -> None:
        bcol, nslots, nworks = self._gw_bidx[kind], self._gw_slots_k[kind], self._gw_works_k[kind]
        dt = torch.float64
        civic = self.civ_civic_prog
        if bcol < 0:
            civic[:, row] = civic[:, row] + hit.to(dt) * nworks * culture_val
            return
        gw_base = (self.city_gw_writing, self.city_gw_art, self.city_gw_music)[kind]
        used = gw_base[:, row]  # [B, RC]
        cap = self.city_bldg[:, row, :, bcol].long() * nslots  # [B, RC] (a city holds 1 such building max)
        if getattr(self, "_wond_gw", None) is not None and int(self._wond_gw[:, kind].sum()) > 0:
            wreg = self.city_wonder[:, row]
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
        overflow = (W - placed).clamp(min=0)
        if kind == 1 and artist is not None and self._artist_works:
            # WHO made it and WHAT it is, for the museum's own slots. The work
            # index is the ARTIST's (their first, second or third), which is
            # what names the type; the slot index is the museum's.
            works = torch.tensor(self._artist_works, dtype=torch.long, device=self.device)
            aw = works[artist.clamp(min=0, max=works.shape[0] - 1)]  # [B, nworks]
            # works already spent by EARLIER cities in slot order
            spent = W.unsqueeze(1) - (W.unsqueeze(1) - prefix).clamp(min=0)
            for sl in range(self._gw_slots_k[1]):
                k = sl - used
                on = (k >= 0) & (k < alloc) & (spent + k < nworks)
                if not bool(on.any()):
                    continue
                wi = (spent + k).clamp(min=0, max=nworks - 1)
                self.city_gwart_type[:, row, :, sl] = torch.where(
                    on, aw.gather(1, wi.clamp(min=0, max=aw.shape[1] - 1)), self.city_gwart_type[:, row, :, sl])
                self.city_gwart_artist[:, row, :, sl] = torch.where(
                    on, artist.unsqueeze(1).expand_as(on), self.city_gwart_artist[:, row, :, sl])
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
        B, O = self.B, self.n_majors
        # Itinerant Preachers: per-religion range — base + the religion's
        # claimed enhancer's presR. A religion is keyed by its FOUNDER's row
        # and every row can claim an enhancer, which is what TS walks:
        # `for (const sx of state.seats) range[sx.seat] += presR`.
        RANGE = torch.full((B, O), int(self._pressure_range), dtype=torch.long, device=self.device)
        if self._enh_any:
            RANGE += self._enh["presR"][self.civ_enhancer[:, :O] + 1].long()
        founded = self.holy_tile >= 0  # [B, O]
        ht = self.holy_tile.clamp(min=0)  # [B, O] valid tile idx (masked where unfounded)
        # ONE flip for every seat.
        NSC = self.n_majors
        cen = self.city_center[:, :NSC].clamp(min=0)
        d_all = self.pair_dist[cen.unsqueeze(3), ht.reshape(B, 1, 1, O)].to(torch.long)
        liv = self.city_alive[:, :NSC]
        add = ((d_all <= RANGE.reshape(B, 1, 1, O)) & founded.reshape(B, 1, 1, O) & liv.unsqueeze(3)).long()
        # CIV6 (Jerusalem's suzerain): "Your cities with Holy Sites exert
        # pressure as if they were Holy Cities (4x Religion pressure on all
        # cities within 10 tiles)." Only Holy Cities exert pressure in this
        # engine, so each completed-unpillaged-Holy-Site city of the suzerain
        # becomes one more source at the holy city's own rate and range; the
        # Holy City itself already exerts and is not doubled.
        if self._suz_c_holy >= 0 and self._hs_idx >= 0:
            for g in range(O):
                jm = self._suz_effect(g, self._suz_c_holy) & founded[:, g]
                if not bool(jm.any()):
                    continue
                hs = self.city_dist_tile[:, g, :, self._hs_idx]  # [B, RC]
                hsc = hs.clamp(min=0)
                src_ok = (jm.unsqueeze(1) & self.city_alive[:, g] & (hs >= 0)
                          & self.district_complete.gather(1, hsc) & ~self.district_pillaged.gather(1, hsc)
                          & (self.city_center[:, g] != self.holy_tile[:, g].unsqueeze(1)))
                if not bool(src_ok.any()):
                    continue
                sc = self.city_center[:, g].clamp(min=0)  # [B, RC] source centres
                d_g = self.pair_dist[cen.unsqueeze(3), sc.reshape(B, 1, 1, -1)].to(torch.long)
                within = (d_g <= RANGE[:, g].reshape(B, 1, 1, 1)) & src_ok.reshape(B, 1, 1, -1) & liv.unsqueeze(3)
                add[:, :, :, g] += within.sum(dim=3)
        self.city_pressure[:, :NSC].copy_(
            torch.where(liv.unsqueeze(3), self.city_pressure[:, :NSC] + add, torch.zeros_like(self.city_pressure[:, :NSC]))
        )
        tot = self.city_pressure[:, :NSC].sum(dim=3)
        best = self.city_pressure[:, :NSC].argmax(dim=3)                  # ties -> lowest id
        # EXODUS pays era score each time a city CONVERTS; compare against the
        # PRE-flip follow set, exactly like `wasFollowed`.
        was = self.city_followed[:, :NSC].clone()
        self.city_followed[:, :NSC].copy_(torch.where(liv & (tot > 0), best, torch.full_like(best, -1)))
        for _g in range(self.n_majors):
            _conv = (self.city_followed[:, :NSC] == _g) & (was != _g) & liv
            if bool(_conv.any()):
                self._dedication_event(_g, 3, _conv.reshape(B, -1).sum(dim=1))

    def _rel_combat_planes(self) -> tuple[torch.Tensor, torch.Tensor]:
        """(near3, terr) — [B, O, T] bool planes for the enhancer combat
        adders. terr[b, g, t] = tile t is OWNED by a city following religion g;
        near3[b, g, t] = some city following g has its CENTER within
        justWarRange of t. ONE derivation per plane over rows 0..n_majors-1 of the merged
        city block — `tile_city` holds PERSISTENT ids for every seat, so one
        id match answers for every row. Keyed (turn, _eff_version):
        followedReligion moves once per turn (_spread_religious_pressure) and
        every city-set/ownership change (founding, capture, transfer, claim,
        compaction) bumps _eff_version — so the keyed cache IS the TS live
        read within a turn."""
        key = (self.turn, self._eff_version)
        if self._rel_planes_cache is not None and self._rel_planes_cache[0] == key:
            return self._rel_planes_cache[1]
        B, T, O = self.B, self.T, self.n_majors
        dev = self.device
        nrow, RC = self.n_majors, self.RC
        alive = self.city_alive[:, :nrow]                  # [B, n_majors, RC]
        fol = self.city_followed[:, :nrow, :RC]            # [B, n_majors, RC]
        ids = self.city_id[:, :nrow, :RC]                  # [B, n_majors, RC]
        # per-tile followed religion of the OWNING city (-1 none). `tile_seat`
        # names the row and `tile_city` the id within it; ids are per-seat
        # monotonic, so the ALIVE match is unique.
        tfol = torch.full((B, T), -1, dtype=torch.long, device=dev)
        for row in range(nrow):
            mine = self.tile_seat == row
            if not bool(mine.any()):
                continue
            hit = (
                mine.unsqueeze(2)
                & (self.tile_city.unsqueeze(2) == ids[:, row].unsqueeze(1))
                & alive[:, row].unsqueeze(1)
            )
            tfol = torch.where(
                hit.any(dim=2), fol[:, row].gather(1, hit.long().argmax(dim=2)), tfol
            )
        terr = tfol.unsqueeze(1) == torch.arange(O, device=dev).reshape(1, O, 1)  # [B, O, T]
        # near3: dilate FOLLOWING city centers by justWarRange (scatter_add
        # then >0 — a masked bool scatter would clobber tile 0 via the clamp)
        near3 = torch.zeros(B, O, T, dtype=torch.bool, device=dev)
        off3 = tiles_within_offsets(self._just_war_range).to(dev)
        win = tiles_from_offsets(
            self.city_center[:, :nrow, :RC].clamp(min=0).reshape(-1), off3, self.W, self.H
        ).reshape(B, nrow * RC, -1)
        for g in range(O):
            srci = torch.zeros(B, T, dtype=torch.long, device=dev)
            fol_g = (alive & (fol == g)).reshape(B, -1)
            if bool(fol_g.any()):
                w = torch.where(fol_g.unsqueeze(2), win, torch.full_like(win, -1)).reshape(B, -1)
                srci.scatter_add_(1, w.clamp(min=0), (w >= 0).long())
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
        founder's seat, so seats 0..n_majors-1 index the belief planes directly and one
        gather serves every seat; anything else — a barbarian, a city-state,
        NO_SEAT — falls outside that range and contributes 0. Returns f64 [B].
        """
        if not self._enh_combat_any or not bool((self.civ_enhancer >= 0).any()):
            return torch.zeros(self.B, dtype=torch.float64, device=self.device)
        g = seat.clamp(min=0, max=self.n_majors - 1)
        has = (seat >= 0) & (seat < self.n_majors) & self.civ_religion_done.gather(1, g.unsqueeze(1)).squeeze(1)
        eidx = self.civ_enhancer.gather(1, g.unsqueeze(1)).squeeze(1) + 1
        eidx = torch.where(has, eidx, torch.zeros_like(eidx))
        gi = g.unsqueeze(1)
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
        B, T, O, dev = self.B, self.T, self.n_majors, self.device
        gi, ai = self._general_unit_idx, self._admiral_unit_idx
        _z = torch.zeros(B, simbase.MAJOR_POOL_MAX, dtype=torch.bool, device=dev)
        m_g = self.major_unit_alive & (self.major_unit_type == gi) if gi >= 0 else _z
        m_a = self.major_unit_alive & (self.major_unit_type == ai) if ai >= 0 else _z
        live = m_g | m_a
        present = bool(live.any())
        if present:
            ar = torch.arange(1, m_g.shape[1] + 1, device=dev)
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

    def _gen_aura_hit(self, seat: torch.Tensor, tile: torch.Tensor, naval: torch.Tensor) -> torch.Tensor:
        """The RAW aura predicate — bool, shaped like `tile` — for a unit of
        `seat` standing on `tile`, ADMIRAL-keyed when `naval`
        (naval|embarked) else GENERAL-keyed. Only a MAJOR owns an aura, so
        callers pass -1 for anyone else and the predicate is False there.
        THE single predicate behind both
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
        valid = (seat >= 0) & (tile >= 0)
        g = seat.clamp(min=0, max=self.n_majors - 1)
        idx = (g * self.T + tile.clamp(min=0)).reshape(self.B, -1)
        land_hit = land.reshape(self.B, -1).gather(1, idx).reshape(tile.shape)
        sea_hit = sea.reshape(self.B, -1).gather(1, idx).reshape(tile.shape)
        return torch.where(naval, sea_hit, land_hit) & valid

    def _gen_aura_cs(self, seat: torch.Tensor, tile: torch.Tensor, naval: torch.Tensor) -> torch.Tensor:
        """The +generalAuraCs adder [B] (dtype) for own military near an own
        GENERAL (land) / ADMIRAL (naval|embarked); `seat` < 0 scores nothing.
        An INTEGER add joining the
        quantized assembly (the JUST_WAR/CRUSADE pattern) — mirrors
        combat.generalAuraCS.

        It joins every unit-vs-unit roll, every unit-vs-CITY roll (rcty/rctyc,
        csty/cstyc, rngcs, vrngc, attacker side) and every
        CITY-STRIKE roll (cstk/estk, DEFENDER side). Absent from
        'rngrc' — TS does not add it there."""
        return self._gen_aura_hit(seat, tile, naval).to(self.dtype) * self._gen_aura_cs_val

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
        center = self.centre_slot_at.gather(1, t) >= 0
        camp = (self.camp_tile.unsqueeze(2) == t.unsqueeze(1)).any(dim=1) if pre == "barb" else None
        heal = torch.where(home & center, torch.full_like(t, 20),
               torch.where(home, torch.full_like(t, 15),
               torch.where(here != NO_SEAT, torch.full_like(t, 5), torch.full_like(t, 10))))
        if camp is not None:
            heal = torch.where(camp & ~home, torch.full_like(t, 20), heal)
        return heal + self._emergency_heal_mp(pre, seat, here)

    def _emergency_heal_mp(self, pre: str, seat: torch.Tensor, here: torch.Tensor) -> torch.Tensor:
        """[B, U] — CIV6 (Military Emergency, success): "Member units gain +5
        Healing in the Target's territory", one count per win."""
        out = torch.zeros_like(here)
        if pre != "major":
            return out
        for row in range(self.n_majors):
            for tgt in range(self.n_majors):
                n = self.civ_emg_heal[:, row, tgt]
                if not bool((n > 0).any()):
                    continue
                out = out + ((seat == row) & (here == tgt)).long() * (n * self._emg_member_heal).unsqueeze(1)
        return out

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
        return base + getattr(self, f"{pre}_unit_aura_mp") + self._emergency_mp(pre)

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
        persistent movesLeft: every walker recomputes the full pool from
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
            self.major_unit_seat,
            self.major_unit_tile,
            self.unit_naval[self.major_unit_type] | self.major_unit_emb,
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

    def _row_era(self, row) -> torch.Tensor:
        """[B] — `civEraIndex(seatOf(state, seat).research)` for an arbitrary
        seat ROW: an int, or a [B] tensor of rows (-1 = nobody).

        A CITY-STATE or BARBARIAN row reads ANCIENT, not an error: `seatOf`
        answers for them and `seats.ts` builds both with empty `techs`/`civics`,
        so `civEraIndex` returns 0 there."""
        if isinstance(row, int):
            if 0 <= row < self.n_majors:
                return self._civ_era(self.civ_techs[:, row], self.civ_civics[:, row])
            return torch.zeros(self.B, dtype=torch.long, device=self.device)
        major = (row >= 0) & (row < self.n_majors)
        idx = torch.where(major, row, torch.zeros_like(row))
        b = torch.arange(self.B, device=self.device)
        era = self._civ_era(self.civ_techs[b, idx], self.civ_civics[b, idx])
        return torch.where(major, era, torch.zeros_like(era))

    def _museum_themed(self, row: int) -> torch.Tensor:
        """[B, RC] bool — is this city's ARCHAEOLOGICAL MUSEUM themed?
        CIV6: every slot full, all Artifacts from ONE era, no two from the
        same civilization; a themed museum DOUBLES the yields of what it
        holds. `museumThemed` is the twin."""
        n = self._artifact_slots
        eras = self.city_artifact_era[:, row, :, :n]   # [B, RC, n]
        seats = self.city_artifact_seat[:, row, :, :n]
        full = self.city_artifacts[:, row] >= n
        one_era = (eras == eras[:, :, :1]).all(dim=2)
        distinct = torch.ones_like(full)
        for i in range(n):
            for j in range(i + 1, n):
                distinct = distinct & (seats[:, :, i] != seats[:, :, j])
        return full & one_era & distinct

    def _tourism_of(self, gw_w: torch.Tensor, gw_a: torch.Tensor, gw_m: torch.Tensor, alive: torch.Tensor, own: torch.Tensor, era: torch.Tensor, relics: torch.Tensor | None = None, printing: torch.Tensor | None = None, artifacts: torch.Tensor | None = None, gw_kmult: torch.Tensor | None = None, themed: torch.Tensor | None = None, relic_mult: torch.Tensor | None = None, resort_mult: torch.Tensor | None = None, park_mult: torch.Tensor | None = None, gov_tile: torch.Tensor | None = None) -> torch.Tensor:
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
        # CIV6 (Heritage Organization): x2 / x0 tourism by Great Work KIND.
        km = gw_kmult if gw_kmult is not None else torch.ones(self.B, 3, dtype=torch.long, device=self.device)
        t = (
            _wmult * km[:, 0] * (gw_w * alive.long()).sum(dim=1)
            + self._gw_tour_k[1] * km[:, 1] * (gw_a * alive.long()).sum(dim=1)
            + self._gw_tour_k[2] * km[:, 2] * (gw_m * alive.long()).sum(dim=1)
        )
        if relics is not None:
            # CIV6 (St. Basil's): the religious-tourism multiplier is the
            # HOLDING city's, so it lands inside the per-city sum.
            rm = relic_mult.long() if relic_mult is not None else torch.ones_like(relics)
            t = t + self._relic_tour * (relics * alive.long() * rm).sum(dim=1)
        if artifacts is not None:
            # a THEMED Archaeological Museum doubles what it holds.
            tm = torch.ones_like(artifacts)
            if themed is not None:
                tm = torch.where(themed, self._theming_mult, 1)
            t = t + self._artifact_tourism * (artifacts * alive.long() * tm).sum(dim=1)
        w_live = (self.built_wonder >= 0) & self.built_wonder_complete & own
        if bool(w_live.any()):
            w_era = self._wonder_era[self.built_wonder.clamp(min=0, max=max(self._wonder_era.numel() - 1, 0))]
            wt = self._wonder_tour_base + (era.unsqueeze(1) - w_era).clamp(min=0)
            if gov_tile is not None:
                # CIV6 (Wish You Were Here, Golden face): "Cities with Governors
                # receive 50% Tourism from World Wonders."
                wt = torch.where(gov_tile,
                                 torch.div(wt * self._wish_wond_num, self._wish_wond_den, rounding_mode="floor"),
                                 wt)
            t = t + (wt * w_live.long()).sum(dim=1)
        if self.SEASIDE >= 0:
            live = (self.improvement == self.SEASIDE) & ~self.pillaged & own
            if bool(live.any()):
                # CIV6 (Cristo Redentor): the resort multiplier is the SEAT's.
                sm = resort_mult.long() if resort_mult is not None else torch.ones(self.B, dtype=torch.long, device=self.device)
                t = t + (self._tile_appeal().clamp(min=0) * live.long()).sum(dim=1) * sm
        # CIV6: a National Park pays "Tourism equal to the total Appeal of all
        # the tiles included in it" — NOT floored, so an ugly neighbour can
        # take a park's payout negative.
        pk = (self.park >= 0) & own
        if bool(pk.any()):
            # CIV6 (Wish You Were Here, Golden face): "+100% Tourism to all
            # National Parks."
            pm = park_mult if park_mult is not None else torch.ones(self.B, dtype=torch.long, device=self.device)
            t = t + (self._tile_appeal() * pk.long()).sum(dim=1) * pm
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
        COMPLETED built wonder +1, a HOLY_SITE/THEATER_SQUARE/
        ENTERTAINMENT_COMPLEX district +1, MINE/QUARRY/OIL_WELL -1, an
        INDUSTRIAL_ZONE/ENCAMPMENT/SPACEPORT district -1, a pillaged tile -1,
        and a BARBARIAN OUTPOST -1. Version-cached like _farmadj_qual — every
        contributing write bumps _eff_version, camps included."""
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
        if self._appeal_good_dist:
            good_d = torch.zeros_like(contrib, dtype=torch.bool)
            for _d in self._appeal_good_dist:
                good_d |= self.district == _d
            contrib = contrib + good_d.long()
        contrib = contrib - self.pillaged.long()
        # A barbarian OUTPOST lowers its neighbours. Camps live in `camp_tile`
        # (-1 padded), the `barbSeat.camps` twin, so the tile view is built
        # here rather than stored.
        if bool((self.camp_tile >= 0).any()):
            _t = torch.arange(contrib.shape[1], device=self.device)
            camp_here = (self.camp_tile.unsqueeze(2) == _t.reshape(1, 1, -1)).any(dim=1)
            contrib = contrib - camp_here.long()
        nb = self.neigh
        nbc = nb.clamp(min=0)
        out = (contrib[:, nbc] * (nb >= 0).unsqueeze(0).long()).sum(dim=2)  # [B, T]
        # The ON-TILE terms (mountain +4, river/lake +1) are the tile's OWN
        # appeal, not a neighbour contribution, so they are added AFTER the
        # gather — the two leading lines of tileAppeal.
        out = out + self.appeal_self
        out = torch.where(self.appeal_over > -999, self.appeal_over, out)
        self._appeal_cache = (self._eff_version, out)
        return out

    def _farmadj_qual(self) -> torch.Tensor:
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
        tier = torch.zeros(self.B, dtype=torch.long, device=self.device)
        if self._farmadj_civic >= 0:
            tier = tier + civics[:, self._farmadj_civic].long()
        if self._farmadj_tech >= 0:
            tier = tier + techs[:, self._farmadj_tech].long()
        return tier

    def _work_window(self, row: int) -> tuple[torch.Tensor, torch.Tensor]:
        """(tiles, valid) [B, RC, M] — every plot inside each city's work
        radius and whether `workableTiles` would offer it. ORACLE: this
        predicate must stay the SAME as `_seat_city_walk`'s `valid` (the walk
        keeps its own copy because its gathers feed the yield ranking too)."""
        B, cols = self.B, self.RC
        ctr = self.city_center[:, row].clamp(min=0)
        ids = self.city_id[:, row]
        tiles = tiles_from_offsets(ctr.reshape(-1), self._off3, self.W, self.H).reshape(B, cols, -1)
        M = tiles.shape[2]
        tcf = tiles.clamp(min=0).reshape(B, cols * M)

        def gat(plane: torch.Tensor) -> torch.Tensor:
            return plane.gather(1, tcf).reshape(B, cols, M)

        valid = (
            (tiles >= 0)
            & (gat(self.tile_seat) == row)
            & (gat(self.tile_city) == ids.unsqueeze(2))
            & gat(self.work_ok)
            & (tiles != ctr.unsqueeze(2))
            & (gat(self.district) < 0)
            & (gat(self.built_wonder) < 0)
        )
        return tiles, valid

    def _workable_count(self, row: int) -> torch.Tensor:
        """[B, RC] — len(workableTiles) per city."""
        return self._work_window(row)[1].sum(dim=2)

    def _city_spec_slots(self, row: int, sl: slice | None = None) -> torch.Tensor:
        """[B, n, nD] long — the specialist SLOTS each district offers: its
        standing buildings, dark while the district is incomplete or pillaged
        and zero for a district type that seats no specialist
        (`citySpecialistSlots`)."""
        if sl is None:
            sl = slice(0, self.RC)
        B = self.B
        alive = self.city_alive[:, row, sl]
        bldg = self.city_bldg[:, row, sl]
        dreg = self.city_dist_tile[:, row, sl]
        dflat = dreg.clamp(min=0).reshape(B, -1)
        dlive = (dreg >= 0) & self.district_complete.gather(1, dflat).reshape_as(dreg) & ~self.district_pillaged.gather(1, dflat).reshape_as(dreg)
        gate = dlive & self._spec_any.reshape(1, 1, -1) & alive.unsqueeze(2)
        return (bldg.double() @ self._b_dist_oh).long() * gate.long()

    def _city_specialists(self, row: int, sl: slice | None = None, workable: torch.Tensor | None = None) -> torch.Tensor:
        """[B, n, nD] long — the `effectiveSpecialists` twin for ANY seat row.
        PINNED citizens (`city_spec_pin`) go in first; then the OVERFLOW —
        population beyond the workable pool — fills whatever slots are still
        free, in PLACEABLE_DISTRICTS order. Slots = the district's standing
        buildings, dark while the district is incomplete or pillaged. Zero-draw
        on both engines."""
        if sl is None:
            sl = slice(0, self.RC)
        B = self.B
        nDc = len(self.districts_cat)
        pop = self.city_pop[:, row, sl]
        alive = self.city_alive[:, row, sl]
        if nDc == 0:
            return torch.zeros(B, pop.shape[1], 1, dtype=torch.long, device=self.device)
        if workable is None:
            workable = self._workable_count(row)[:, sl]
        slots = self._city_spec_slots(row, sl)
        # PINNED citizens first, clamped to the open slots and to population.
        pin = self.city_spec_pin[:, row, sl].clamp(min=0)
        budget = pop.clamp(min=0) * alive.long()
        spec = torch.zeros_like(slots)
        for di in range(nDc):
            tk = torch.minimum(torch.minimum(pin[:, :, di], slots[:, :, di]), budget)
            spec[:, :, di] = tk
            budget = budget - tk
        # then the OVERFLOW — what population is left over the workable pool —
        # spends itself on whatever slots are still free, in catalog order.
        rem = (budget - workable).clamp(min=0)
        for di in range(nDc):
            tk = torch.minimum(slots[:, :, di] - spec[:, :, di], rem)
            spec[:, :, di] = spec[:, :, di] + tk
            rem = rem - tk
        return spec

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

        j: one column, for the per-city callers outside the seat block.
        amen_yf: [B, n] the tier's yieldFactor. The caller ranks amenities,
           because seatPhase ranks luxuryAmenities ONCE per seat turn and feeds
           that same map to every one of that seat's cities."""
        rd = self.rules_dev
        B, dev, F64 = self.B, self.device, torch.float64
        cols = self.RC
        sl = slice(0, cols) if j is None else slice(j, j + 1)
        n = cols if j is None else 1
        alive = self.city_alive[:, row, sl]
        pop = self.city_pop[:, row, sl]
        ctr = self.city_center[:, row, sl].clamp(min=0)
        ids = self.city_id[:, row, sl]
        bldg = self.city_bldg[:, row, sl]  # [B, n, NB]
        dreg = self.city_dist_tile[:, row, sl]  # [B, n, nD] tile per district TYPE
        alivef = alive.double()
        is_cap = (self.city_is_cap[:, row, sl] & alive).double()
        zeros6 = torch.zeros(B, n, 6, dtype=F64, device=dev)

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

        tiles = tiles_from_offsets(ctr.reshape(-1), self._off3, self.W, self.H).reshape(B, n, -1)
        M = tiles.shape[2]
        tc3 = tiles.clamp(min=0)
        tcf = tc3.reshape(B, n * M)

        def gat(plane: torch.Tensor) -> torch.Tensor:
            return plane.gather(1, tcf).reshape(B, n, M)

        valid = (
            (tiles >= 0)
            & (gat(self.tile_seat) == row)
            & (gat(self.tile_city) == ids.unsqueeze(2))
            & gat(self.work_ok)
            & (tiles != ctr.unsqueeze(2))
            & (gat(self.district) < 0)  # !t.district
            & (gat(self.built_wonder) < 0)  # !t.builtWonder
        )
        f = gat(f_plane).double()
        p = gat(p_plane).double()
        if self._mine_boost_tech.numel() > 0 and self.MINE >= 0:
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
        # A LOCKED plot outranks every score: `assignWorkedTiles` takes the
        # locked plots first, in tile order, and only then fills by score. The
        # base sits four decades above the widest score the term above can
        # reach and stays an exact f64 integer, so the index tie-break inside
        # the locked group is bit-exact.
        key = torch.where(valid & gat(self.tile_locked).bool(),
                          _LOCK_KEY_BASE - tiles.double(), key)
        self._tiebreak_key_dtype = key.dtype
        top_vals, top_idx = key.topk(M, dim=2)
        # SPECIALISTS divert the overflow citizens before tiles are taken
        # (assignWorkedTiles runs on population - specialistTotal).
        spec_d = self._city_specialists(row, sl, workable=valid.sum(dim=2))
        pop_t = pop - spec_d.sum(dim=2)
        take = (torch.arange(M, device=dev).reshape(1, 1, M) < pop_t.unsqueeze(2)) & (top_vals > -1e17)
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
        if has_bel:
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
        sel_t = tc3.gather(2, top_idx)
        stf = sel_t.reshape(B, n * M)
        compw = self._completed_wonders(row)
        if compw is not None:
            compw = compw[:, sl]
        # WONDER TILE YIELDS (`wonderTileBonus`) — a wonder naming a TERRAIN or
        # FEATURE pays its yields on the city's own tiles; `emp` widens the
        # payer to every city the seat holds. POST-selection like TS (the score
        # ranks without it). The CENTRE always counts, a worked DISTRICT tile
        # never does. A chopped feature is gone, so the live feature is
        # feat_id masked by feat_stripped.
        if compw is not None and self._wond_tiley and bool(compw.any()):
            und = (self.district.gather(1, stf).reshape(B, n, M) < 0) & take
            terr_w = self.terrain.gather(1, stf).reshape(B, n, M)
            fl = torch.where(self.feat_stripped, torch.full_like(self.feat_id, -1), self.feat_id)
            feat_w = fl.gather(1, stf).reshape(B, n, M)
            terr_c = self.terrain.gather(1, ctr)
            feat_c = fl.gather(1, ctr)
            for _wi, _tid, _fid, _xfid, _emp, _y in self._wond_tiley:
                has = compw[:, :, _wi]
                if _emp:
                    has = has.any(dim=1, keepdim=True).expand_as(has)
                if not bool(has.any()):
                    continue
                qw, qc = und, torch.ones_like(terr_c, dtype=torch.bool)
                if _tid >= 0:
                    qw, qc = qw & (terr_w == _tid), qc & (terr_c == _tid)
                if _fid >= 0:
                    qw, qc = qw & (feat_w == _fid), qc & (feat_c == _fid)
                if _xfid >= 0:
                    qw, qc = qw & (feat_w != _xfid), qc & (feat_c != _xfid)
                nq = (qw & has.unsqueeze(2)).sum(dim=2).double() + (qc & has).double()
                for _k in range(6):
                    if float(_y[_k]) != 0.0:
                        tiles_y[:, :, _k] = tiles_y[:, :, _k] + float(_y[_k]) * nq
        wm = bldg[:, :, rd.b_farmbonus]
        if wm.numel() and bool(wm.any()):
            elig = (
                (self.improvement.gather(1, stf) == self.FARM)
                & (self.res_cat.gather(1, stf) == 1)  # bonus category
                & (self.res_imp.gather(1, stf) == self.FARM)  # ...whose improvement IS the farm
            ).reshape(B, n, M) & take
            tiles_y[:, :, 0] = tiles_y[:, :, 0] + (elig & wm.any(dim=2).unsqueeze(2)).sum(dim=2).double()
        # CIV6 (Lighthouse): "+1 Food in Coast and Lake tiles controlled by the
        # city" — the TILE pays it, so only a worked one materializes.
        lh = bldg[:, :, rd.b_coastfood]
        if lh.numel() and bool(lh.any()) and self._coast_food_terr:
            tw = self.terrain.gather(1, stf).reshape(B, n, M)
            tc = self.terrain.gather(1, ctr)
            wet_w = torch.zeros_like(tw, dtype=torch.bool)
            wet_c = torch.zeros_like(tc, dtype=torch.bool)
            for _t in self._coast_food_terr:
                wet_w = wet_w | (tw == _t)
                wet_c = wet_c | (tc == _t)
            has_lh = lh.any(dim=2)
            tiles_y[:, :, 0] = (tiles_y[:, :, 0]
                                + ((wet_w & take) & has_lh.unsqueeze(2)).sum(dim=2).double()
                                + (wet_c & has_lh).double())

        # ================= bucket 2: DISTRICTS ==============================
        # THE DISTRICT REGISTRY IS THE ONE READ, on every seat row: TS walks
        # `city.districts`, a per-city LIST, so a district stays its city's
        # however the tile's ownership churns and whatever else stands in the
        # work window.
        dist_y = zeros6.clone()
        dflat = dreg.clamp(min=0).reshape(B, -1)
        dcomp = (dreg >= 0) & self.district_complete.gather(1, dflat).reshape_as(dreg)
        dlive = dcomp & ~self.district_pillaged.gather(1, dflat).reshape_as(dreg)
        hs_adj = None
        fi_adj = None
        st_adj = None
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
            elif di == self._commhub_idx or di == self._harbor_idx:
                fi_adj = add if fi_adj is None else fi_adj + add
            elif di == self._campus_idx:
                st_adj = add
        if fol_live and hs_adj is not None:
            dist_y[:, :, 1] = dist_y[:, :, 1] + hs_adj * self._fol_tab("we", fol_id)
        # CIV6 (GS Civilopedia, Free Inquiry, Golden face): "Commercial Hub and
        # Harbor district's Gold adjacency bonus provides Science as well."
        if fi_adj is not None:
            _fi = self._golden_ded(row, self._ded_free_inquiry)
            if bool(_fi.any()):
                dist_y[:, :, 3] = dist_y[:, :, 3] + fi_adj * _fi.double().unsqueeze(1)
        # CIV6 (Heartbeat of Steam, Golden face): "Campus district's Science
        # adjacency bonus provides Production as well."
        if st_adj is not None:
            _st = self._golden_ded(row, self._ded_steam)
            if bool(_st.any()):
                dist_y[:, :, 1] = dist_y[:, :, 1] + st_adj * _st.double().unsqueeze(1)
        # SPECIALISTS (computeCityStats' specialist loop): count x (base +
        # the tier add when the TOP building stands; -2 = any worship
        # building). Integer-valued, so the add order is exact at any
        # association.
        if bool(spec_d.any()):
            for di in range(len(self.districts_cat)):
                cnt = spec_d[:, :, di]
                if not bool(cnt.any()):
                    continue
                t_b = int(self._spec_tb[di])
                if t_b == -2:
                    has_t = (bldg & self._b_worship.reshape(1, 1, -1)).any(dim=2)
                elif t_b >= 0:
                    has_t = bldg[:, :, t_b]
                else:
                    has_t = torch.zeros(B, n, dtype=torch.bool, device=dev)
                y6 = self._spec_y[di].reshape(1, 1, 6) + has_t.double().unsqueeze(2) * self._spec_ta[di].reshape(1, 1, 6)
                dist_y = dist_y + cnt.double().unsqueeze(2) * y6

        bld_y = self._palace_y.double().reshape(1, 1, 6) * is_cap.unsqueeze(2)
        selb = bldg & ~self._bldg_dark(dreg) & ~self._b_regional.reshape(1, 1, -1)
        if bool(selb.any()):
            selbf = selb.double()
            bld_y = bld_y + selbf @ rd.b_yields.double()
            if has_bel or fol_live:
                if has_bel:
                    bld_y = bld_y + torch.einsum("bjn,bnk->bjk", selbf, self._bel_add_pf("bldgY", row))
                if fol_live:
                    bld_y = bld_y + torch.einsum("bjn,bjnk->bjk", selbf, self._fol_tab("bldgY", fol_id))
            if self.S > 0:
                env, acs, nB = self._seat_envoys(row), self.citystate_alive.double(), selb.shape[2]
                per3 = (env >= 3).double() * self._citystate_district_bonus * acs * (self._citystate_b1idx >= 0).double()
                per6 = (env >= 6).double() * self._citystate_district_bonus * acs * (self._citystate_b2idx >= 0).double()
                csf = torch.zeros(B, nB * 6, dtype=F64, device=dev)
                csf.scatter_add_(1, self._citystate_b1idx.clamp(min=0) * 6 + self._citystate_yidx, per3)
                csf.scatter_add_(1, self._citystate_b2idx.clamp(min=0) * 6 + self._citystate_yidx, per6)
                bld_y = bld_y + torch.einsum("bjn,bnk->bjk", selbf, csf.reshape(B, nB, 6))
            if self._harbor_idx >= 0 and self._shipyard_bidx >= 0:
                hb = dreg[:, :, self._harbor_idx]
                hbc = hb.clamp(min=0)
                has_sy = alive & selb[:, :, self._shipyard_bidx] & (hb >= 0) & self.district_complete.gather(1, hbc)
                if bool(has_sy.any()):
                    hadj = self._district_adj_floor(self._harbor_idx).gather(1, hbc).double()
                    bld_y[:, :, 1] = bld_y[:, :, 1] + torch.where(has_sy, hadj, torch.zeros_like(hadj))
        _reg = self._seat_regional(row)
        if _reg is not None:
            bld_y = bld_y + _reg[0][:, sl]
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
            + self._gw_cul_k[1] * (self.city_gw_art[:, row, sl] + self._art_themed_works(row)[:, sl]).double()
            + self._gw_cul_k[2] * self.city_gw_music[:, row, sl].double()
        ) * alivef
        _thm = torch.where(self._museum_themed(row)[:, sl], self._theming_mult, 1).double()
        bld_y[:, :, 4] = bld_y[:, :, 4] + self._artifact_culture * self.city_artifacts[:, row, sl].double() * _thm * alivef
        _pb = self._golden_ded(row, self._ded_pen_brush)
        if bool(_pb.any()):
            bld_y[:, :, 4] = bld_y[:, :, 4] + _pb.double().unsqueeze(1) * self._district_counts(row)[1][:, sl].double() * alivef
        bld_y[:, :, 5] = bld_y[:, :, 5] + self._relic_faith * self.city_relics[:, row, sl].double() * alivef
        # CIV6 (Monument): "+1 additional Culture if city is at maximum Loyalty."
        _ml = bldg[:, :, rd.b_maxloy_culture]
        if _ml.numel() and bool(_ml.any()):
            bld_y[:, :, 4] = bld_y[:, :, 4] + (
                _ml.sum(dim=2).double()
                * (self.city_loyalty[:, row, sl].double() >= self._loyalty_max).double() * alivef)
        # CIV6 (Anshan's suzerain): "+2 Science from each Great Work of
        # Writing. +1 Science from each Relic and Artifact."
        _ans = self._suz_effect(row, self._suz_c_works)
        if bool(_ans.any()):
            bld_y[:, :, 3] = bld_y[:, :, 3] + _ans.double().unsqueeze(1) * (
                self._suz_writing_sci * self.city_gw_writing[:, row, sl].double()
                + self._suz_relic_sci * (self.city_relics[:, row, sl] + self.city_artifacts[:, row, sl]).double()
            ) * alivef

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
            _gcity, _gcap, _gh, gym, *_ = self._gov_mods(row)
            b_city = b_city + _gcity.double()
            b_cap = b_cap + _gcap.double()
        if self.S > 0:
            _env, _acs = self._seat_envoys(row), self.citystate_alive
            b_cap = b_cap.scatter_add(
                1, self._citystate_yidx,
                ((_env >= 1) & _acs).double() * float(self.rules.citystate.get("capitalBonus", 2)))
            # SOVEREIGNTY outcome B silences a whole city-state TYPE's unique
            # suzerain bonus, which is this capital yield and `suzerainEffect`.
            _suz = self._suz_live_mask(row)
            b_cap = b_cap.scatter_add(
                1, self.citystate_suz_key[:, : self.S].clamp(min=0),
                _suz.double() * self._citystate_suz_amt
                * (self.citystate_suz_key[:, : self.S] >= 0).double())
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

        trade = zeros6
        _rt = self._seat_route_income(row)
        if _rt is not None:
            trade = _rt[:, sl] * alivef.unsqueeze(2)

        total = tiles_y + dist_y + bld_y + citz + bon + trade
        total[:, :, 1:] = total[:, :, 1:] * amen_yf.unsqueeze(2)
        if gym is not None:
            total = total * gym.double().unsqueeze(1)
        if compw is not None and bool(compw.any()):
            # Each wonder's cityYieldMult (Ruhr production, Big Ben gold) LAST
            # of the three scalings, as an EXPLICIT ascending wonder-index
            # product — the association `completedWonders` sorts its list into,
            # so two multipliers on the SAME channel fold the same way on both
            # engines.
            ones6 = torch.ones(1, 1, 6, dtype=F64, device=dev)
            wmm = torch.ones(B, n, 6, dtype=F64, device=dev)
            for wi in range(compw.shape[2]):
                wmm = wmm * torch.where(compw[:, :, wi:wi + 1], self._wond_mult[wi].reshape(1, 1, 6), ones6)
            total = total * wmm
        total[:, :, 2] = total[:, :, 2] - self._seat_housing(row)[0][:, sl]  # total.gold -= cityMaintenance
        # Dead columns contribute nothing (their static centre yields preload).
        return torch.where(alive.unsqueeze(2), total, torch.zeros_like(total))

    def _seat_city_stats(self, row: int) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
        """THE loop-top city-stats SNAPSHOT for seat row `row`: the twin of
        seatPhase's `for (const c of actor.cities) cityStats.set(c.id,
        computeCityStats(state, c, luxMap, seatMods))`, one call for the whole
        block. Returns the CityStats fields the walk consumes —
        (total [B, RC, 6], eff_surplus [B, RC], need [B, RC], tier_idx [B, RC]),
        all f64.

        THE SNAPSHOT IS THE RULE, and it is the same rule for every row. A
        completion, a border claim or a growth landing at column j does NOT
        reach column j+1's yields, housing, amenity tier or growth factor this
        turn: seatPhase computes the whole map before it mutates anything, and
        real Civ 6 banks a turn's yields off the state the turn opened with — a
        building finished this turn pays from the next one.

        Recomputing mid-walk behind an (_eff_version, _claim_version) key
        would model a `game.ts` endTurn city loop that does not exist — every
        seat takes its turn through `seatPhase` — and it would let two rows
        read two different economies."""
        tier_idx, growth_f, yield_f, _lux = self._seat_amenity(row)
        total = self._seat_city_walk(row, amen_yf=yield_f)
        housing = self._seat_housing(row)[1]
        pop = self.city_pop[:, row, : self.RC].double()
        surplus = total[:, :, 0] - pop * self.rules.food_per_citizen
        head = housing - pop
        hf = torch.where(head >= 2, torch.ones_like(head),
                         torch.where(head >= 1, torch.full_like(head, 0.5), torch.full_like(head, 0.25)))
        eff = surplus * hf * growth_f
        # `empireGrowthMult`: the Migration Treaty factor FIRST, the wonder
        # products after, ONE number multiplied in — the TS association.
        em = self._congress_growth(row)
        hg = self._wonder_growth_mult(self._completed_wonders(row))
        if hg is not None:
            em = em * hg
        eff = eff * em.unsqueeze(1)
        if self._seat_has_beliefs(row):
            eff = eff * self._bel_mul("growth", row).unsqueeze(1)
        eff = torch.where(surplus > 0, eff, surplus)
        need = torch.floor(15 + 8 * (pop - 1) + (pop - 1).clamp(min=0) ** 1.5)
        return total, eff, need, tier_idx

    def _city_totals(self) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
        tier_idx, growth_f, yield_f, _lux = self._seat_amenity(0)
        total = self._seat_city_walk(0, amen_yf=yield_f)
        return total.to(self.dtype), self._seat_housing(0)[1].to(self.dtype), growth_f.to(self.dtype), tier_idx

    def seat_score(self, row: int) -> torch.Tensor:
        """[B] — empireScore(state, seat, 'balanced') for ANY seat row, in the
        TS ASSOCIATION: per city, pop×popWeight first, then the six yields in
        key order. Science rides non-dyadic 0.7s, so the sum ORDER is worth a
        real ±1 ulp — enough to flip the leader.

        TS iterates state.cities in ARRAY order (splice on death, push on
        found), which is slot order under append+reclaim; the living-first sort
        keeps that true even mid-step, and dead columns add exact 0.0
        (association-neutral).

        Accumulates in f64 like the TS doubles it mirrors, then casts once —
        one body, one precision, so an f32 lane cannot have `leader()` compare
        a rounded row against an unrounded one."""
        rd = self.rules_dev
        w = rd.score_yield_weights
        pw = float(self.rules.score_pop_weight)
        alive = self.city_alive[:, row]
        yt = torch.zeros(self.B, dtype=torch.float64, device=self.device)
        if not bool(alive.any()):
            return yt.to(self.dtype)
        F, PR, SC, CU, GO, FA = self._seat_city_yields_all(row)
        ord_ = torch.argsort((~alive).long(), dim=1, stable=True)
        bidx = self._bidx
        for s in range(self.RC):
            col = ord_[:, s]
            yt = yt + (self.city_pop[bidx, row, col] * alive[bidx, col].long()).double() * pw
            yt = (yt + F[bidx, col] * float(w[0]) + PR[bidx, col] * float(w[1])
                  + GO[bidx, col] * float(w[2]) + SC[bidx, col] * float(w[3])
                  + CU[bidx, col] * float(w[4]) + FA[bidx, col] * float(w[5]))
        return yt.to(self.dtype)

    def _seat_city_yields_all(self, row: int, amen_yf: torch.Tensor | None = None) -> tuple[torch.Tensor, ...]:
        yf = amen_yf if amen_yf is not None else self._seat_amenity(row)[2]
        t = self._seat_city_walk(row, amen_yf=yf)
        return t[:, :, 0], t[:, :, 1], t[:, :, 3], t[:, :, 4], t[:, :, 2], t[:, :, 5]

    def leader(self) -> torch.Tensor:
        """[B] the current score leader's ROW. Ties → the lowest row, matching
        TS's strict-`>` scan — via first_argmax (torch.argmax's tie pick is
        unspecified)."""
        cols = [self.seat_score(row) for row in range(self.n_majors)]
        return first_argmax(torch.stack(cols, dim=1))

    def protagonist(self) -> torch.Tensor:
        cols = [self.seat_score(row) for row in range(self.n_majors)]
        scores = torch.stack(cols, dim=1)  # [B, n_majors]
        has_city = self.city_alive[:, : self.n_majors].any(dim=2)  # [B, n_majors]
        fenced = torch.where(has_city, scores, torch.full_like(scores, float("-inf")))
        pick = torch.where(has_city.any(dim=1), first_argmax(fenced), first_argmax(scores))
        return torch.where(self.winner >= 0, self.winner, pick)

    def _domination(self) -> torch.Tensor:
        B, dev = self.B, self.device
        if self.n_majors == 1:
            return torch.full((B,), -1, dtype=torch.long, device=dev)
        caps = self.civ_cap_tile[:, : self.n_majors]  # [B, n_majors] capitalTiles — survives rc compaction
        # A seat with NO capitalTile yet drops out of `caps` on TS and takes
        # the `caps.length < expected` early return with it. Here it is a -1,
        # which also may not reach `gather` — clamp for the read, refuse on the
        # flag.
        none_yet = (caps < 0).any(dim=1)
        capsc = caps.clamp(min=0)
        held = self.centre_slot_at.gather(1, capsc) >= 0
        seat_at = self.tile_seat.gather(1, capsc)
        owner = torch.where(held, seat_at, torch.full_like(seat_at, -1))
        bad = none_yet | (owner < 0).any(dim=1) | (owner != owner[:, :1]).any(dim=1)
        return torch.where(bad, torch.full((B,), -1, dtype=torch.long, device=dev), owner[:, 0])


    def _res_avail_mask(self, owned: torch.Tensor) -> torch.Tensor:
        B, dev = self.B, self.device
        out = torch.ones(B, self.NU, dtype=torch.bool, device=dev)
        if not self._res_unit_pairs:
            return out
        provides = (self.res_id >= 0) & (self.improvement == self.res_imp) & ~self.pillaged & owned
        for u_idx, res_idx in self._res_unit_pairs:
            out[:, u_idx] = (provides & (self.res_id == res_idx)).any(dim=1)
        return out
