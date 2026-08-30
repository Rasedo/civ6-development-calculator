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
        # CIV6 (John Spilsbury and the three after him): an INVENTED luxury
        # serves cities exactly like a worked one, and its own row says how
        # many it reaches. They rank AFTER the worked ones, in creation order.
        gp_n = self.civ_gp_lux_n[:, row]
        gp_reach = self.civ_gp_lux[:, row]
        total = rounds + gp_n
        mx = int(total.max().item())
        if mx == 0:
            return out
        seq = torch.arange(cols, device=self.device, dtype=dt)
        kmax = max(self._lux_k, int(gp_reach.max().item()) if bool((gp_n > 0).any()) else 0)
        k = min(kmax, cols)
        krank = torch.arange(k, device=self.device).reshape(1, -1)
        for rnd in range(mx):
            act = total > rnd
            gi = (rnd - rounds).clamp(min=0, max=gp_reach.shape[1] - 1)
            reach = torch.where(rnd < rounds,
                                torch.full_like(rounds, self._lux_k),
                                gp_reach.gather(1, gi.unsqueeze(1)).squeeze(1))
            need = amen_need - (amen_have + out)
            key = torch.where(alive, need * 64 - seq, torch.full_like(need, -1e9))
            top_v, top_i = key.topk(k, dim=1)
            grant = (top_v > -1e8) & act.unsqueeze(1) & (krank < reach.unsqueeze(1))
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
                | ((self.civilian_at.gather(1, t).squeeze(1) >= 0).long() << 1)
                | ((self.embarked_at.gather(1, t).squeeze(1) >= 0).long() << 2))

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
            _n = self.seat_ally_turns.shape[1]
            _fl = self_row.clamp(0, _n - 1) * _n + owner.clamp(0, _n - 1)
            _ally = (self.seat_ally_turns.reshape(self.B, -1).gather(1, _fl.unsqueeze(1)).squeeze(1) > 0) & _rr
            at_home = (_own | _ally) & (not city)
            gain = base * torch.where(at_home, 1, abroad)
            if died is not None:
                gain = gain + torch.where(died, base * death, zeros)
            # CIV6 (Trung Trac, Joaquim Marques Lisboa): a permanent percentage
            # off everything this seat accrues from here on. Integer both
            # sides — `ww` is a long plane and the TS twin floors to match.
            # CIV6 (Fascism): "War Weariness reduced by 15%" — the adopted
            # government's cut joins additively, capped together.
            _cut = (self._gp_perm_at(self_row, "warWearyPct").long()
                    + self._fx_at_seat("wwcut", self_row).long()).clamp(min=0, max=100)
            gain = torch.div(gain * (100 - _cut), 100, rounding_mode="floor")
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

    # ---- THE CLIMATE ARC -------------------------------------------------

    def _deforestation_level(self) -> torch.Tensor:
        """[B] in 0..1 — CIV6: "a percentage of number of features cleared
        (Marshes, Woods, Rainforests) versus the total number of removable
        features on the entire map". Counting what STANDS against the start
        count catches every removal path, `deforestationLevel`'s twin."""
        stand = torch.zeros(self.B, self.T, dtype=torch.bool, device=self.device)
        for f in self._clear_fids.tolist():
            stand |= self.feat_id == f
        stand = stand & ~self.feat_stripped
        total = self._removable_at_start.clamp(min=1).double()
        gone = (self._removable_at_start - stand.sum(dim=1)).clamp(min=0).double()
        return (gone / total).clamp(max=1.0)

    def _defor_modifier(self) -> torch.Tensor:
        """[B] — the CO2 modifier for the current deforestation level: the
        first descending cut the level clears."""
        lvl = self._deforestation_level()
        out = torch.zeros_like(lvl)
        done = torch.zeros_like(lvl, dtype=torch.bool)
        for cut, mod in self._defor_cuts:
            take = ~done & (lvl >= cut)
            out = torch.where(take, torch.full_like(out, mod), out)
            done = done | take
        return out

    def _world_carbon(self) -> torch.Tensor:
        """[B] — every seat's lifetime carbon together, adjusted by how much of
        the map has been cleared (`worldCarbon`)."""
        return self.civ_co2.sum(dim=1).double() * (1.0 + self._defor_modifier())

    def _climate_points(self) -> torch.Tensor:
        """[B] — Climate Change points, 1 per 0.5 degrees."""
        return (self._world_carbon().clamp(min=0) / self._co2_per_point).floor().long()

    def _flood_level(self) -> torch.Tensor:
        """[B] — the lowland bands the sea has already taken, which is what the
        Flood Barrier prices itself against (`floodLevel`)."""
        out = torch.zeros(self.B, dtype=torch.long, device=self.device)
        for p in range(len(self._cl_ice_melt)):
            at = self.climate_idx >= p
            band = torch.maximum(self._cl_flood[p], self._cl_submerge[p])
            out = torch.where(at, torch.maximum(out, band.expand_as(out)), out)
        return out

    def _fertility_live(self) -> torch.Tensor:
        """[B] — CIV6: "In Phase IV and beyond, Storms and Floods will no
        longer provide fertility"."""
        out = torch.ones(self.B, dtype=torch.bool, device=self.device)
        for p, live in enumerate(self._cl_fertility):
            if not live:
                out &= self.climate_idx != p
        return out

    def _desertification_live(self) -> torch.Tensor:
        """[B] — CIV6: past Phase IV "all Storms and Droughts now start
        removing fertility from tiles instead of adding it"."""
        out = torch.zeros(self.B, dtype=torch.bool, device=self.device)
        for p, strip in enumerate(self._cl_desertify):
            if strip:
                out |= self.climate_idx == p
        return out

    def _disaster_rate(self) -> torch.Tensor:
        """[B] — the per-turn chance multiplier: 1 + the phase's published
        polar-melt fraction (`disasterRateMult`)."""
        out = torch.ones(self.B, dtype=torch.float64, device=self.device)
        for p, melt in enumerate(self._cl_ice_melt):
            out = torch.where(self.climate_idx == p, torch.full_like(out, 1.0 + melt), out)
        return out

    def _severity_split(self, base: list) -> torch.Tensor:
        """[B, n] — the flood severity split at each game's phase: that same
        melt fraction of the mildest band's mass moved onto the worst
        (`severitySplit`)."""
        p = torch.zeros(self.B, len(base), dtype=torch.float64, device=self.device)
        for i, v in enumerate(base):
            p[:, i] = v
        melt = torch.zeros(self.B, dtype=torch.float64, device=self.device)
        for i, m in enumerate(self._cl_ice_melt):
            melt = torch.where(self.climate_idx == i, torch.full_like(melt, m), melt)
        if len(base) >= 2:
            moved = p[:, 0] * melt
            p[:, 0] = p[:, 0] - moved
            p[:, -1] = p[:, -1] + moved
        return p

    def _defertilize(self, rows: torch.Tensor, tiles: torch.Tensor) -> None:
        """CIV6 (past Phase IV): storms and droughts take the silt back off."""
        if not rows.numel():
            return
        for plane in (self.fertility, self.fertility_prod):
            flat = plane.reshape(-1)
            gi = rows * self.T + tiles
            cur = flat.gather(0, gi)
            flat.scatter_(0, gi, (cur - 1).clamp(min=0))

    def _power_cells(self, row: int) -> torch.Tensor:
        """[B] f64 — the share a seat's units still emit: CIV6 (Advanced Power
        Cells) "halves the CO2 emitted by units" (`powerCells`)."""
        one = torch.ones(self.B, dtype=torch.float64, device=self.device)
        if self._carbon_cells_tech < 0:
            return one
        has = self.civ_techs[:, row, self._carbon_cells_tech]
        return torch.where(has, one * self._carbon_cells_share, one)

    def _emit_carbon(self, row: int, raw: torch.Tensor) -> None:
        """Bank raw carbon against a seat. Signed: Carbon Recapture takes the
        lifetime total below zero, so nothing clamps (`emitCarbon`)."""
        self.civ_co2[:, row] += raw.to(self.civ_co2.dtype)
        # ...and THIS TURN's share, which the Climate Accords competition
        # compares across seats and `_resolve_competition` clears when it has.
        self.civ_co2_turn[:, row] += raw.to(self.civ_co2_turn.dtype)

    def _pollution_points(self, raw: torch.Tensor) -> torch.Tensor:
        return (raw.double() / self._pollution_divisor).floor()

    def _pollution_favor_penalty(self, row: int) -> torch.Tensor:
        """[B] — CIV6 (Losing Favor): "-1/turn for every 3 pollution points
        higher than average. This penalty caps at 20"
        (`pollutionFavorPenalty`)."""
        pts = self._pollution_points(self.civ_co2)
        avg = pts.mean(dim=1)
        over = (pts[:, row] - avg).clamp(min=0)
        return (over / self._favor_per_over).floor().clamp(max=self._favor_pollution_cap).long()

    def _city_lowland_count(self, row: int) -> torch.Tensor:
        """[B, RC] — the coastal-lowland tiles each of this row's cities holds,
        which is what a Flood Barrier costs and covers (`cityLowlands`)."""
        low = (self.tile_lowland > 0) & (self.tile_seat == row)  # [B, T]
        ids = self.city_id[:, row]  # [B, RC]
        # a dead column's id is 0, which is a LIVE id on row 0
        per = (low.unsqueeze(2) & (self.tile_city.unsqueeze(2) == ids.unsqueeze(1))
               & self.city_alive[:, row].unsqueeze(1))
        return per.sum(dim=1)

    def _flood_barrier_cost(self, row: int) -> torch.Tensor:
        """[B, RC] — CIV6: "(80 x coastal lowland tiles) + (80 x coastal
        lowland tiles x flood level)" (`floodBarrierCost`)."""
        n = self._city_lowland_count(row)
        return self._barrier_per_tile * n * (1 + self._flood_level().unsqueeze(1))

    def _barrier_tiles(self) -> torch.Tensor:
        """[B, T] — tiles standing behind a completed Flood Barrier."""
        out = torch.zeros(self.B, self.T, dtype=torch.bool, device=self.device)
        if self._barrier_bidx < 0:
            return out
        for r in range(self.n_majors):
            sl = self.city_slot_at(r)  # [B, T], -1 = not this row's
            has = self.city_bldg[:, r, :, self._barrier_bidx]  # [B, RC]
            ok = torch.zeros_like(out)
            for j in range(self.RC):
                ok |= (sl == j) & has[:, j].unsqueeze(1)
            out |= ok
        return out

    def _repair_behind_barrier(self, row: int, col: torch.Tensor, hit: torch.Tensor) -> None:
        """CIV6: a Flood Barrier built late repairs its city's flooded tiles
        "in full ... along with anything that's on them"
        (`repairBehindBarrier`)."""
        if not bool(hit.any()):
            return
        ids = self.city_id[:, row].gather(1, col.clamp(min=0).unsqueeze(1))  # [B, 1]
        mine = ((self.tile_seat == row) & (self.tile_city == ids)
                & self.tile_flooded & hit.unsqueeze(1))
        self.tile_flooded &= ~mine
        self.pillaged &= ~mine
        self.district_pillaged &= ~mine

    def _centre_plane(self) -> torch.Tensor:
        """[B, T] — every live city CENTRE on the map, major and minor alike."""
        out = self.centre_slot_at >= 0
        if self.S > 0:
            ctr = self.citystate_center.clamp(min=0)
            live = self.citystate_alive & (self.citystate_center >= 0)
            out = out.scatter(1, ctr, live | out.gather(1, ctr))
        return out

    def _submerge(self, take: torch.Tensor) -> None:
        """CIV6 (Coastal Lowlands): the sea takes a band "forever"
        (`submergeTile`). The tile becomes open water and unusable besides —
        it yields nothing and no citizen may work it — and what stood on the
        ground goes with it: the improvement, the district and its city's
        record of it, the resource, and any LAND unit caught there. A hull is
        simply afloat now, and so is a chassis water is ground to.

        MODEL: the terrain, the feature and the river edges stay recorded
        under the water, unread. Every ring fact the exporter derives reads
        TERRAIN — `isCoastalLand`, the Seaside Resort's coast, fresh water,
        the Aqueduct's source — so the ONE neighbour answer the sea moves is
        `isCoastalWater`, which asks `isLand`."""
        if not bool(take.any()):
            return
        ty = self.unit_type.clamp(min=0, max=self.NU - 1)
        drown = (self.unit_alive
                 & take.gather(1, self.unit_tile.clamp(min=0))
                 & ~self.unit_naval[ty] & ~self.unit_water_walk[ty]
                 & (self._type_air[ty] == 0))
        for pool in ("major", "barb"):
            lo, hi = self.POOL_LO[pool], self.POOL_HI[pool]
            d = drown[:, lo:hi]
            if not bool(d.any()):
                continue
            r, s = d.nonzero(as_tuple=True)
            getattr(self, f"{pool}_unit_alive")[r, s] = False
            self._vacate(pool, r, s)
        # the district leaves its city's registry with the ground
        _dt = self.city_dist_tile
        _gone = take.gather(1, _dt.reshape(self.B, -1).clamp(min=0)).reshape(_dt.shape) & (_dt >= 0)
        if bool(_gone.any()):
            self.city_dist_tile[_gone] = -1
        # THE TILE. `wpass` is `isWater && !isImpassable`, and the ground's own
        # `passable` already carried that second half.
        self.wpass |= take & self.passable
        self.water |= take
        self.tile_submerged |= take
        for _p in ("passable", "work_ok", "settle_ok", "d_usable", "camp_ok",
                   "coastal_land", "coastal_water", "_sr_c", "district_complete",
                   "district_pillaged", "built_wonder_complete", "road", "railroad",
                   "pillaged", "tile_flooded", "antiquity", "tile_locked"):
            getattr(self, _p)[take] = False
        for _p, _v in (("improvement", -1), ("district", -1), ("built_wonder", -1),
                       ("res_id", -1), ("res_cat", 0), ("res_priority", 0),
                       ("lux_id", -1), ("lux_req", -9), ("res_imp", -1),
                       ("tile_lowland", 0), ("encamp_hp", 0), ("encamp_outer_hp", 0),
                       ("park", -1), ("tile_air_bonus", 0), ("fertility", 0),
                       ("fertility_prod", 0), ("drought", 0), ("wok", 0)):
            getattr(self, _p)[take] = _v
        self.tile_yields[take] = 0
        # water housing is fresh-water first, then coastal — and the ground the
        # sea took is no longer coastal LAND.
        self.tile_wh[take & (self.tile_wh != self._h_fresh)] = self._h_none
        # THE RING: a water tile whose last LAND neighbour just drowned stops
        # being coastal water, and loses the wonders that ask for it.
        _nb = self.neigh
        _nbc = _nb.clamp(min=0)
        _on = (_nb >= 0).unsqueeze(0)
        _ring = (_on & take[:, _nbc]).any(dim=2)
        _lost = _ring & self.water & ~(_on & ~self.water[:, _nbc]).any(dim=2)
        if bool(_lost.any()):
            self.coastal_water[_lost] = False
            self.wok[_lost] = self.wok[_lost] & ~self._wonder_coastal_mask
        self._air_orphans_die()   # an airstrip under water bases nothing
        self._eff_version += 1
        self._gen_ver += 1

    def _melt_ice(self, at: torch.Tensor, fraction: float) -> None:
        """CIV6: "the polar ice starts to melt (i.e., Ice tiles will disappear
        and be replaced by Ocean tiles)". The melted set is always a PREFIX of
        the map's ice in tile order, which is what TS's melt-from-the-front
        walk leaves behind and what this ranks directly (`meltIce`)."""
        ice = self.feat_id == self._ice_fid
        target = (self._ice_at_start.double() * fraction).floor().long()  # [B]
        rank = ice.long().cumsum(dim=1)  # 1-based among ice, in tile order
        take = ice & (rank <= target.unsqueeze(1)) & at.unsqueeze(1)
        self.feat_stripped |= take

    def _climate_turn(self) -> None:
        """The world's climate turn: bank the emissions into points and apply
        every phase crossed. CIV6: "It is not possible to revert climate change
        to an earlier phase" (`climateTurn`)."""
        pts = self._climate_points()
        now = torch.full_like(self.climate_idx, -1)
        for p in range(len(self._cl_ice_melt)):
            now = torch.where(pts >= self._cl_points[p], torch.full_like(now, p), now)
        if not bool((now > self.climate_idx).any()):
            return
        barrier = self._barrier_tiles()
        for p in range(len(self._cl_ice_melt)):
            at = (self.climate_idx < p) & (now >= p)
            if not bool(at.any()):
                continue
            self.climate_idx.copy_(torch.where(at, torch.full_like(self.climate_idx, p),
                                               self.climate_idx))
            self._melt_ice(at, self._cl_ice_melt[p])
            fb = int(self._cl_flood[p])
            if fb > 0:
                wet = ((self.tile_lowland == fb) & ~barrier & at.unsqueeze(1)
                       & ~self.tile_flooded)
                self.tile_flooded |= wet
                self.pillaged |= wet
                self.district_pillaged |= wet & (self.district >= 0)
            sb = int(self._cl_submerge[p])
            if sb > 0:
                self._submerge((self.tile_lowland == sb) & ~barrier
                               & at.unsqueeze(1) & ~self.water
                               & ~self._centre_plane())
        self._eff_version += 1

    def _disaster_phase(self) -> None:
        B, dev = self.B, self.device
        self._eff_version += 1
        self.drought.copy_((self.drought - 1).clamp(min=0))
        every = torch.ones(B, dtype=torch.bool, device=dev)
        # A warming world runs every one of these draws more often, and its
        # storms and droughts take fertility off instead of laying it down.
        rate = self._disaster_rate()
        strip = self._desertification_live()

        r = self._next_random(every)
        hit, tile = self._pick_static(r < self._flood_chance * rate, self._flood_list)
        self._flood_river(hit, tile)

        er_rows, er_volc = [], []
        for k in range(self.volcano_tile.shape[1]):
            volc = self.volcano_tile[:, k]
            active = volc >= 0
            if not bool(active.any()):
                continue
            rv = self._next_random(active)
            erupt = active & (rv < self._eruption_chance * rate)
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
            _live = self._fertility_live()[row6[on]]
            self._fertilize_counted(row6[on][_live], nbf[on][_live])

        r = self._next_random(every)
        hit, tile = self._pick_static(r < self._drought_chance * rate, self._droughtc_list)
        if bool(hit.any()):
            rows = hit.nonzero(as_tuple=True)[0]
            area = tiles_from_offsets(tile[rows], self._off2, self.W, self.H)
            M = area.shape[1]
            rowm = rows.unsqueeze(1).expand(-1, M).reshape(-1)
            af = area.reshape(-1)
            on = (af >= 0) & ~self.water[rowm, af.clamp(min=0)]
            flat = self.drought.reshape(-1)
            gi = rowm[on] * self.T + af[on]
            flat.scatter_reduce_(0, gi, torch.full_like(gi, self._drought_length), reduce="amax")
            dry = on & strip[rowm]
            self._defertilize(rowm[dry], af[dry])

        r = self._next_random(every)
        hit, tile = self._pick_static(r < self._storm_chance * rate, self._land_list)
        if bool(hit.any()):
            rows = hit.nonzero(as_tuple=True)[0]
            area = tiles_from_offsets(tile[rows], self._off1, self.W, self.H)
            M = area.shape[1]
            rowm = rows.unsqueeze(1).expand(-1, M).reshape(-1)
            af = area.reshape(-1)
            valid = af >= 0
            self._scorch(rowm[valid], af[valid])
            # sandstorms deposit silt — until the world warms past Phase IV,
            # from where the same storms take fertility off instead.
            wet = valid & self.desert[rowm, af.clamp(min=0)] & ~strip[rowm] & self._fertility_live()[rowm]
            self._fertilize(rowm[wet], af[wet])
            dry = valid & strip[rowm]
            self._defertilize(rowm[dry], af[dry])

    def _flood_river(self, hit: torch.Tensor, tile: torch.Tensor) -> None:
        """`floodRiver` — CIV6 (Flood): "The level of the water rises, flooding
        all Floodplains tiles found along the River, and then recedes on the
        next turn." ONE severity for the whole flood, then every Floodplains
        tile the river reaches takes the effects at that severity, in ascending
        tile order so the draw stream is the TS walk's."""
        B, dev = self.B, self.device
        r_sev = self._next_random(hit)
        # A warmed world reaches its worst severities more often, so the split
        # is per GAME now, not one scalar ladder.
        sp = self._severity_split(self._flood_sev_p)
        sev = torch.zeros(B, dtype=torch.long, device=dev)
        acc = torch.zeros(B, dtype=torch.float64, device=dev)
        for i in range(sp.shape[1]):
            lo, acc = acc, acc + sp[:, i]
            sev = torch.where((r_sev >= lo) & (r_sev < acc), torch.full_like(sev, i), sev)
        sev = torch.where(r_sev >= acc, torch.full_like(sev, sp.shape[1] - 1), sev)
        if not bool(hit.any()):
            return
        tc = tile.clamp(min=0)
        comp0 = self.river_comp.gather(1, tc.unsqueeze(1))  # [B, 1]
        reach = (
            (self.river_comp == comp0) & (comp0 >= 0)
            & self.floodplain & hit.unsqueeze(1)
        )
        # a Floodplains tile carrying no river at all floods alone
        reach[torch.arange(B, device=dev), tc] |= hit
        shield = self._river_shielded(reach)
        order = reach.long().cumsum(dim=1) * reach.long()  # 1-based rank, 0 off-reach
        for k in range(1, int(order.max()) + 1):
            at = order == k
            hit_k = at.any(dim=1)
            if not bool(hit_k.any()):
                break
            tile_k = at.long().argmax(dim=1)
            self._flood_tile(hit_k, torch.where(hit_k, tile_k, torch.full_like(tile_k, -1)),
                             sev, shield)

    def _river_shielded(self, reach: torch.Tensor) -> torch.Tensor:
        """[B] — CIV6 (Dam): "Prevents damage from Floods on this River", and
        "Reduces yields from Floods (Food and Production bonuses) by 50%", the
        same two halves the GREAT BATH pays. The source's words for both are
        that "a Dam or Great Bath along a River will mitigate floods THERE", so
        the shield belongs to the RIVER: one complete, unpillaged Dam or Great
        Bath standing anywhere along it covers every tile it floods, whoever
        owns them. `riverShielded`'s twin."""
        sh = (self.district >= 0) & self.district_complete & ~self.district_pillaged \
            & self._d_flood_shield[self.district.clamp(min=0)]
        if self._wond_n:
            sh = sh | ((self.built_wonder >= 0) & self.built_wonder_complete
                       & self._wond_floodmit[self.built_wonder.clamp(min=0)])
        return (reach & sh).any(dim=1)

    def _flood_tile(self, hit: torch.Tensor, tile: torch.Tensor, sev: torch.Tensor,
                    mit: torch.Tensor) -> None:
        """`floodTile` — ONE river flood on one Floodplains tile, at the
        severity its whole flood rolled.

        CIV6: a flood "damages or destroys Districts, improvements, and units on
        the Floodplains tiles near the River. This may also include a City
        Center, in which case it loses some HP and Defenses... May kill some
        Citizens in a nearby city... Can fertilize affected tiles." The severity
        ladder decides every magnitude, and a shielded river cancels the damage
        half while halving the fertility half.

        SEVEN draws per tile, always, whatever the tile holds — the count
        depends on the flood alone, so the two engines cannot slip apart on
        what stood there.
        """
        B, dev = self.B, self.device
        # the tile REMEMBERS each flood episode — the Great Bath's faith
        # counts them (`Tile.floodCount`), mitigated floods included
        _fr = hit.nonzero(as_tuple=True)[0]
        self.tile_flood_ct[_fr, tile[_fr]] += 1
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
                for plane, civilian in ((self.military_at, False), (self.civilian_at, True),
                                        (self.embarked_at, False)):
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
        live = self._fertility_live()
        fr = (hit & live & (r_food < self._flood_fert_food[sev, col] * half)).nonzero(as_tuple=True)[0]
        if fr.numel():
            self._fertilize(fr, tc[fr])
        pr2 = (hit & live & (r_prod < self._flood_fert_prod[sev, col] * half)).nonzero(as_tuple=True)[0]
        if pr2.numel():
            ok = self.fertilizable[pr2, tc[pr2]]
            r2, t2 = pr2[ok], tc[pr2][ok]
            self.fertility_prod[r2, t2] = (self.fertility_prod[r2, t2] + 1).clamp(max=3)

    def _building_cost_in(self, row: int, j: int, bi: torch.Tensor) -> torch.Tensor:
        """[B] — `buildingCostIn`: the catalog price for every row but the
        FLOOD BARRIER, whose own is its city's lowland tiles and the sea
        level, then the Global Energy Treaty's discount on the plant it
        names."""
        base = self.rules_dev.b_cost.gather(0, bi).double()
        if self._barrier_bidx >= 0:
            base = torch.where(bi == self._barrier_bidx,
                               self._flood_barrier_cost(row)[:, j].double(), base)
        disc = self._congress_energy_discount()
        return torch.where((disc >= 0) & (bi == disc),
                           js_round(base * self._c_energy_discount), base)

    def _live_building_cost(self, row: int) -> torch.Tensor:
        """[B, RC] — `buildingCostIn` for whatever BUILDING each of this row's
        cities is producing, and the stored price wherever the queue head is
        not a building. TS locks no building price at all: it re-reads
        `buildingCostIn` at every completion check and again for its digest,
        so a price that can MOVE while the item is queued — the Flood
        Barrier's lowland formula, the Global Energy Treaty's discount —
        has to be followed here rather than locked at queue."""
        cur = self.city_current[:, row]                       # [B, RC]
        bi = cur.clamp(min=0, max=self.NB - 1)
        base = self.rules_dev.b_cost.gather(0, bi.reshape(-1)).reshape(bi.shape).double()
        if self._barrier_bidx >= 0:
            base = torch.where(bi == self._barrier_bidx,
                               self._flood_barrier_cost(row).double(), base)
        disc = self._congress_energy_discount().unsqueeze(1)  # [B, 1]
        live = torch.where((disc >= 0) & (bi == disc),
                           js_round(base * self._c_energy_discount), base)
        return torch.where((cur >= 0) & (cur < self.NB),
                           live.to(self.city_cost.dtype), self.city_cost[:, row])

    def _reprice_live(self, row: int) -> None:
        self.city_cost[:, row].copy_(self._live_building_cost(row))

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
        # CIV6: a government building "requires a Tier 2 government (Merchant
        # Republic, Monarchy, or Theocracy)" — the tier of what the seat runs
        # NOW, so a revolution can take an unbuilt row back off the list.
        if bool((self._b_gov_tier > 0).any()):
            _tier = self._adopted_gov_tier(self.civ_civics[:, row])
            base = base & (self._b_gov_tier.reshape(1, 1, -1) <= _tier.reshape(B, 1, 1))
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
        if self._barrier_bidx >= 0:
            # CIV6 (Flood Barrier): "Must be built in a city with one or more
            # Coastal Lowland tiles."
            _low = self._city_lowland_count(row) > 0  # [B, C]
            _fb = torch.zeros(NB, dtype=torch.bool, device=dev)
            _fb[self._barrier_bidx] = True
            base = base & (~_fb.reshape(1, 1, -1) | _low.unsqueeze(2))
        # CIV6 (Global Energy Treaty, outcome B): "Buildings of this type
        # cannot be created by any player." New picks only.
        _eb = self._congress_energy_blocked()  # [B] building index, -1 = none
        if bool((_eb >= 0).any()):
            _bidx = torch.arange(NB, device=dev).reshape(1, 1, -1)
            base = base & ~((_eb >= 0).reshape(B, 1, 1) & (_bidx == _eb.reshape(B, 1, 1)))
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

    def _air_at(self, row: int) -> torch.Tensor:
        """[B, T] — how many of seat row `row`'s aircraft are based on each
        tile. A plane is not a tile OCCUPANT (it takes neither the military nor
        the civilian slot), so its base's load is counted, not looked up."""
        out = torch.zeros(self.B, self.T, dtype=torch.long, device=self.device)
        if not self._any_air:
            return out
        for pre in ("major",):
            alive = getattr(self, f"{pre}_unit_alive")
            seat = getattr(self, f"{pre}_unit_seat")
            typ = getattr(self, f"{pre}_unit_type").clamp(min=0, max=self.NU - 1)
            tile = getattr(self, f"{pre}_unit_tile")
            mine = alive & (seat == row) & (self._type_air[typ] > 0) & (tile >= 0)
            if bool(mine.any()):
                out.scatter_add_(1, tile.clamp(min=0), mine.long())
        return out

    def _air_slots_at(self, row: int) -> torch.Tensor:
        """[B, T] — what each tile can BASE for seat row `row`. CIV6 (Air
        combat): a City Center has 1, an Aerodrome "has 2 slots initially, and
        can reach 4 slots after constructing the Hangar and the Airport", and
        an Aircraft Carrier "starts with 2"; an Airstrip carries its own
        `airSlots`. A pillaged or unfinished district bases nothing."""
        B, T, dev = self.B, self.T, self.device
        out = torch.zeros(B, T, dtype=torch.long, device=dev)
        if not self._any_air:
            return out
        # CIV6 (Airstrip): "+3 aircraft slots", on the seat's own tile and
        # not while it is pillaged.
        if self._imp_air_any:
            out = out + torch.where(
                (self.improvement >= 0) & ~self.pillaged & (self.tile_seat == row),
                self._imp_air_slots[self.improvement.clamp(min=0)],
                torch.zeros_like(out))
        cols = self.RC
        alive = self.city_alive[:, row, :cols]
        ctr = self.city_center[:, row, :cols]
        live = alive & (ctr >= 0)
        if bool(live.any()):
            out.scatter_add_(1, ctr.clamp(min=0),
                             (live.long() * self._city_centre_air_slots))
        if self._aerodrome_didx >= 0:
            at = self.city_dist_tile[:, row, :cols, self._aerodrome_didx]
            atc = at.clamp(min=0)
            good = live & (at >= 0) & self.district_complete.gather(1, atc) \
                & ~self.district_pillaged.gather(1, atc)
            if bool(good.any()):
                extra = torch.einsum("bjn,n->bj",
                                     (self.city_bldg[:, row, :cols]
                                      & (self._b_req_district == self._aerodrome_didx).reshape(1, 1, -1)).long(),
                                     self._b_air_slots)
                # CIV6 (Marina Raskova): the permanent per-tile "+1 air
                # unit slots" rides the aerodrome's own arm
                out.scatter_add_(1, atc, good.long() * (self._aerodrome_air_slots + extra
                                                        + self.tile_air_bonus.gather(1, atc)))
        # a CARRIER is a base wherever it floats. CIV6 (Flight Deck, Hangar
        # Deck, Folding Wings): "+1 additional aircraft slot".
        alive_u = self.major_unit_alive & (self.major_unit_seat == row)
        typ = self.major_unit_type.clamp(min=0, max=self.NU - 1)
        hull = alive_u & (self._type_air_slots[typ] > 0)
        if bool(hull.any()):
            deck = self._type_air_slots[typ] + self._promo_pool_val("major", "AIR_SLOTS")
            out.scatter_add_(1, self.major_unit_tile.clamp(min=0),
                             torch.where(hull, deck, torch.zeros_like(typ)))
        return out

    def _air_free_at(self, row: int) -> torch.Tensor:
        """[B, T] — bases of seat row `row` with room for one more plane."""
        return self._air_slots_at(row) > self._air_at(row)

    def _air_train_tile(self, row: int) -> torch.Tensor:
        """[B, RC] — the Aerodrome tile each city would spawn a plane at, -1
        where it has none with a free slot (`airTrainTile`)."""
        cols = self.RC
        out = torch.full((self.B, cols), -1, dtype=torch.long, device=self.device)
        if self._aerodrome_didx < 0 or not self._any_air:
            return out
        at = self.city_dist_tile[:, row, :cols, self._aerodrome_didx]
        free = self._air_free_at(row)
        ok = (at >= 0) & free.gather(1, at.clamp(min=0)) & self.city_alive[:, row, :cols]
        return torch.where(ok, at, out)

    def _trainable_units(self, row: int) -> torch.Tensor:
        """[B, RC, NU] chassis seat row `row` may TRAIN or BUY in each city —
        `trainableUnits`, one body for every seat.

        The filters, in TS order: faith-only (MISSIONARY), spawn-only
        (GENERAL/ADMIRAL), the SETTLER (which trains through its own
        escalating column), the tech gate, the civic gate, the
        ARCHAEOLOGIST's free-artifact-slot rule, the strategic-resource
        access AND stockpile, and finally NAVAL hulls, which need a
        naval-capable city.
        """
        B, C, dev = self.B, self.RC, self.device
        if not self.units_mode:
            return torch.zeros(B, C, self.NU, dtype=torch.bool, device=dev)
        ok = (self._type_tech.unsqueeze(0) < 0) | self.civ_techs[:, row].gather(
            1, self._type_tech.clamp(min=0).unsqueeze(0).expand(B, -1)
        )
        ok = ok & self._res_avail_mask(self.tile_seat == row, row)
        ok = ok & ~(self._type_faith_only | self._type_spawn_only | self._type_settler).reshape(1, -1)
        out = ok.unsqueeze(1) & self._type_civic_slot_ok(row, True)
        if bool(self.unit_naval.any()):
            out = out & (~self.unit_naval.reshape(1, 1, -1) | self._naval_capable(row).unsqueeze(2))
        # CIV6 (Air combat): aircraft "can only be built in a city with an
        # Aerodrome", and only while that Aerodrome "still has empty slots".
        if self._any_air:
            _air = (self._type_air > 0).reshape(1, 1, -1)
            out = out & (~_air | (self._air_train_tile(row) >= 0).unsqueeze(2))
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
        # CIV6 (Spy): "you can never have more Spies than your current empire's
        # development allows".
        if self._spy_idx >= 0:
            is_spy = (torch.arange(self.NU, device=dev) == self._spy_idx).reshape(1, 1, -1)
            out = out & (~is_spy | self._can_train_spy(row).reshape(B, 1, 1))
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
                          extra_slots: torch.Tensor | None = None,
                          dark: torch.Tensor | None = None,
                          era: torch.Tensor | None = None) -> torch.Tensor:
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
        obs = self._pol_obsolete_civic  # [nPol], -1 = never retires
        # CIV6 (Dark Age policy card): no civic unlocks one — the seat's AGE
        # and the card's own era window are the whole gate, and the window
        # RETIRES it, so the obsolete-civic test never touches these rows.
        is_dark = self._pol_dark_lo.unsqueeze(0) >= 0
        if dark is not None and era is not None:
            in_win = (era.unsqueeze(1) >= self._pol_dark_lo.unsqueeze(0)) \
                & (era.unsqueeze(1) <= self._pol_dark_hi.unsqueeze(0))
            pol_unlocked = torch.where(is_dark, dark.unsqueeze(1) & in_win, pol_unlocked)
        else:
            pol_unlocked = pol_unlocked & ~is_dark
        pol_unlocked = pol_unlocked & ~torch.where(
            obs.unsqueeze(0) >= 0,
            civics2.gather(1, obs.clamp(min=0).unsqueeze(0).expand(B, -1)),
            torch.zeros(B, self._npol, dtype=torch.bool, device=dev),
        )
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

    def _gov_policy_mods(self, civics2: torch.Tensor, extra_slots: torch.Tensor | None = None,
                         dark: torch.Tensor | None = None, era: torch.Tensor | None = None):
        """(cityYields [B,6], capitalYields [B,6], housingAll [B], yieldMult
        [B,6], slotted-mask [B,nPol], encampHarborProdMult [B],
        tilePurchaseMult [B], amenitiesAll [B], housingIfDistricts triples,
        newDeal triples, adjacencyMult [B,nD], buildingYieldBoosts, the
        remaining effect channels as a dict) for a seat's adopted government
        + greedily slotted
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
        # adjacencyMult, one column per PLACEABLE district: the product of the
        # adopted government's and every slotted card's. byb is the list of
        # LIVE buildingYieldBoost rows — (active [B], the exported 7-tuple).
        adjm = torch.ones(B, len(self.districts_cat), dtype=dt, device=dev)
        byb: list = []
        # The channels with no shape of their own: `prod` is a list of
        # (active [B], wonderTarget, class mask, eraMax, pct), the rest are
        # per-batch scalars that ADD, MULTIPLY or OR across the slotted cards.
        _z = torch.zeros(B, dtype=dt, device=dev)
        _o = torch.ones(B, dtype=dt, device=dev)
        fx: dict = {
            "prod": [], "bcharge": _z.clone(), "mcut": _z.clone(), "vbarb": _z.clone(),
            "cdef": _z.clone(), "crng": _z.clone(), "rxp": _o.clone(), "rplun": _o.clone(),
            "pillm": _o.clone(),
            "rgold": _z.clone(), "infl": _z.clone(),
            "envoy1": torch.zeros(B, dtype=torch.bool, device=dev),
            "envoy2": torch.zeros(B, dtype=torch.bool, device=dev),
            "tourroute": torch.zeros(B, dtype=torch.long, device=dev),
            "culsuz": _z.clone(),
            "ucst": torch.zeros(B, self.NU, dtype=torch.float64, device=dev),
            "xppct": _z.clone(), "wwcut": _z.clone(),
            "dch": _z.clone(), "dca": _z.clone(),
            "gppmult": torch.ones(B, dtype=torch.float64, device=dev),
            "gpp": torch.zeros(B, self._gov_gpp.shape[1], dtype=torch.float64, device=dev),
            # ---- the DARK-AGE channels ----
            "routeymul": _o.clone(), "domroute": torch.zeros(B, 6, dtype=dt, device=dev),
            "nosettler": torch.zeros(B, dtype=torch.bool, device=dev),
            "healhome": torch.zeros(B, dtype=torch.bool, device=dev),
            "relighome": _z.clone(),
            "raiderprod": _o.clone(), "raidermove": torch.zeros(B, dtype=torch.long, device=dev),
            "grievhold": torch.zeros(B, dtype=torch.bool, device=dev),
            "projprod": _o.clone(), "loyall": _z.clone(),
            "favorb": [], "noenvoy": torch.zeros(B, dtype=torch.bool, device=dev),
            "eracs": [], "landcost": _o.clone(), "concert": _z.clone(),
            "milmaint": _z.clone(),
            "impy": torch.zeros(B, self._pol_imp_y.shape[1], 6, dtype=dt, device=dev),
            "distym": [], "bldgym": [],
            "govymul": torch.ones(B, 6, dtype=dt, device=dev),
            "govpercit": torch.zeros(B, 6, dtype=dt, device=dev),
            "wallhouse": _z.clone(), "theocs": _z.clone(), "govbldy": _z.clone(),
        }
        if not self._gov_has_effects or not self._ngov:
            return (city_y, cap_y, hous_all, ymult, slotted, emult, tpmult,
                    amen_all, hid, nd, adjm, byb, fx)
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
        fx["govymul"] = torch.where(has_gov.unsqueeze(1), self._gov_gov_ymult[adopted], fx["govymul"])
        fx["govpercit"] = fx["govpercit"] + self._gov_gov_percit[adopted] * gmask
        emult = torch.where(has_gov, self._gov_ehprod[adopted], emult)
        tpmult = torch.where(has_gov, self._gov_tpmult[adopted], tpmult)
        adjm = adjm * torch.where(has_gov.unsqueeze(1), self._gov_adj_mult[adopted],
                                  torch.ones_like(adjm))
        for _gi in range(self._ngov):
            if float(self._gov_byb[_gi, 0]) >= 0:
                byb.append((has_gov & (adopted == _gi), self._gov_byb[_gi]))
        if self._gov_fx_mag > 0:
            _gf = has_gov.to(dt)
            for _k, _t in (("bcharge", self._gov_bcharge), ("mcut", self._gov_mcut),
                           ("vbarb", self._gov_vbarb), ("cdef", self._gov_cdef),
                           ("crng", self._gov_crng), ("rgold", self._gov_rgold),
                           ("infl", self._gov_infl), ("culsuz", self._gov_culsuz),
                           ("xppct", self._gov_xppct),
                           ("wwcut", self._gov_wwcut), ("dch", self._gov_dc_house),
                           ("dca", self._gov_dc_amen), ("wallhouse", self._gov_wallhouse),
                           ("theocs", self._gov_theocs), ("govbldy", self._gov_govbldy)):
                fx[_k] = fx[_k] + _t[adopted] * _gf
            fx["rxp"] = fx["rxp"] * torch.where(has_gov, self._gov_rxp[adopted], _o)
            fx["rplun"] = fx["rplun"] * torch.where(has_gov, self._gov_rplun[adopted], _o)
            fx["pillm"] = fx["pillm"] * torch.where(has_gov, self._gov_pillm[adopted], _o)
            fx["gppmult"] = fx["gppmult"] * torch.where(
                has_gov, self._gov_gppmult[adopted], torch.ones_like(fx["gppmult"]))
            fx["envoy1"] = fx["envoy1"] | (has_gov & self._gov_envoy1[adopted])
            fx["envoy2"] = fx["envoy2"] | (has_gov & self._gov_envoy2[adopted])
            fx["gpp"] = fx["gpp"] + self._gov_gpp[adopted] * _gf.double().unsqueeze(1)
            fx["ucst"] = fx["ucst"] + self._gov_ucs_by_type[adopted] * _gf.double().unsqueeze(1)
            for _gi in range(self._ngov):
                if float(self._gov_prodb[_gi, 0]) >= 0:
                    _r = self._gov_prodb[_gi]
                    fx["prod"].append((has_gov & (adopted == _gi), int(_r[0]), int(_r[1]),
                                       int(_r[2]), float(_r[3])))
        if self._npol:
            slotted = self._slotted_policies(civics2, extra_slots, dark, era)
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
            adjm = adjm * torch.where(
                slotted.unsqueeze(2), self._pol_adj_mult.unsqueeze(0).expand(B, -1, -1),
                torch.ones(1, 1, 1, dtype=dt, device=dev)).prod(dim=1)
            for _pi in range(self._npol):
                if float(self._pol_byb[_pi, 0]) >= 0:
                    byb.append((slotted[:, _pi], self._pol_byb[_pi]))
            ymult = ymult * torch.where(
                slotted.unsqueeze(2), self._pol_ymult.unsqueeze(0).expand(B, -1, -1),
                torch.ones(1, 1, 1, dtype=dt, device=dev)).prod(dim=1)
            if self._pol_fx_mag > 0:
                for _k, _t in (("bcharge", self._pol_bcharge), ("mcut", self._pol_mcut),
                               ("vbarb", self._pol_vbarb), ("cdef", self._pol_cdef),
                               ("crng", self._pol_crng), ("rgold", self._pol_rgold),
                               ("infl", self._pol_infl), ("culsuz", self._pol_culsuz),
                               ("xppct", self._pol_xppct),
                               ("wwcut", self._pol_wwcut), ("dch", self._pol_dc_house),
                               ("dca", self._pol_dc_amen), ("wallhouse", self._pol_wallhouse),
                               ("theocs", self._pol_theocs), ("govbldy", self._pol_govbldy)):
                    fx[_k] = fx[_k] + sd @ _t
                _ones_p = torch.ones(B, self._npol, dtype=dt, device=dev)
                fx["rxp"] = fx["rxp"] * torch.where(slotted, self._pol_rxp.unsqueeze(0).expand(B, -1), _ones_p).prod(dim=1)
                fx["rplun"] = fx["rplun"] * torch.where(slotted, self._pol_rplun.unsqueeze(0).expand(B, -1), _ones_p).prod(dim=1)
                fx["pillm"] = fx["pillm"] * torch.where(slotted, self._pol_pillm.unsqueeze(0).expand(B, -1), _ones_p).prod(dim=1)
                fx["gppmult"] = fx["gppmult"] * torch.where(
                    slotted, self._pol_gppmult.unsqueeze(0).expand(B, -1),
                    torch.ones(B, self._npol, dtype=torch.float64, device=dev)).prod(dim=1)
                fx["envoy1"] = fx["envoy1"] | (slotted & self._pol_envoy1.unsqueeze(0)).any(dim=1)
                fx["envoy2"] = fx["envoy2"] | (slotted & self._pol_envoy2.unsqueeze(0)).any(dim=1)
                fx["tourroute"] = fx["tourroute"] + (slotted.long() * self._pol_tourroute.unsqueeze(0)).sum(dim=1)
                fx["gpp"] = fx["gpp"] + slotted.double() @ self._pol_gpp
                fx["ucst"] = fx["ucst"] + slotted.double() @ self._pol_ucs_by_type
                for _pi in range(self._npol):
                    if float(self._pol_prodb[_pi, 0]) >= 0:
                        _r = self._pol_prodb[_pi]
                        fx["prod"].append((slotted[:, _pi], int(_r[0]), int(_r[1]),
                                           int(_r[2]), float(_r[3])))
                # ---- the DARK-AGE channels ----
                for _k, _t in (("relighome", self._pol_relig_home), ("loyall", self._pol_loyalty_all),
                               ("concert", self._pol_concert), ("milmaint", self._pol_mil_maint)):
                    fx[_k] = fx[_k] + sd @ _t
                for _k, _t in (("routeymul", self._pol_route_ymult), ("raiderprod", self._pol_raider_prod),
                               ("projprod", self._pol_proj_prod), ("landcost", self._pol_land_cost)):
                    fx[_k] = fx[_k] * torch.where(slotted, _t.unsqueeze(0).expand(B, -1), _ones_p).prod(dim=1)
                for _k, _t in (("nosettler", self._pol_no_settlers), ("healhome", self._pol_heal_home),
                               ("grievhold", self._pol_griev_hold), ("noenvoy", self._pol_no_envoy)):
                    fx[_k] = fx[_k] | (slotted & _t.unsqueeze(0)).any(dim=1)
                fx["raidermove"] = fx["raidermove"] + (slotted.long() * self._pol_raider_moves.unsqueeze(0)).sum(dim=1)
                fx["domroute"] = fx["domroute"] + sd @ self._pol_dom_route
                fx["impy"] = fx["impy"] + torch.einsum("bp,pik->bik", sd, self._pol_imp_y)
                fx["govymul"] = fx["govymul"] * torch.where(
                    slotted.unsqueeze(2), self._pol_gov_ymult.unsqueeze(0).expand(B, -1, -1),
                    torch.ones(1, 1, 1, dtype=dt, device=dev)).prod(dim=1)
                fx["govpercit"] = fx["govpercit"] + sd @ self._pol_gov_percit
                for _pi in range(self._npol):
                    _on = slotted[:, _pi]
                    if not bool(_on.any()):
                        continue
                    if int(self._pol_favor_b[_pi]) >= 0:
                        fx["favorb"].append((_on, int(self._pol_favor_b[_pi]), float(self._pol_favor_n[_pi])))
                    if int(self._pol_era_cs_min[_pi]) >= 0:
                        fx["eracs"].append((_on, int(self._pol_era_cs_min[_pi]), float(self._pol_era_cs[_pi])))
                    for _r in self._pol_dist_ym[_pi].tolist():
                        if _r[0] >= 0:
                            fx["distym"].append((_on, _r[0], _r[1], _r[2] / 1000.0))
                    for _r in self._pol_bldg_ym[_pi].tolist():
                        if _r[0] >= 0:
                            fx["bldgym"].append((_on, _r[0], _r[1], _r[2] / 1000.0))
        return (city_y, cap_y, hous_all, ymult, slotted, emult, tpmult,
                amen_all, hid, nd, adjm, byb, fx)

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
        """The seat's government + policy channels, memoised twice over.

        `_eff_version` is the cheap gate; when it moves, the four INPUTS are
        re-derived (under a millisecond) and the standing answer kept if they
        match, because `_gov_policy_mods` reads nothing else BUT the catalog.
        A building completing anywhere moves the version many times a turn and
        changes none of them. `_gov_cat_version` carries the catalog half of
        that key — the four inputs cannot speak for a row that was rewritten
        underneath them."""
        if self._gov_pol_cache is None:
            self._gov_pol_cache = {}
        ver = (self._eff_version, self._gov_cat_version)
        ent = self._gov_pol_cache.get(row)
        if ent is not None and ent[0] == ver:
            return ent[5]
        # `_seat_civics` hands back a VIEW of the live plane; a key that is not
        # a copy compares equal to itself forever and freezes the answer.
        civ = self._seat_civics(row).clone()
        slots = self._wonder_extra_slots(row)
        dark = self.civ_age[:, row] == 0
        era = self._civ_era(self.civ_techs[:, row], self.civ_civics[:, row])
        if ent is not None and ent[0][1] == self._gov_cat_version \
                and torch.equal(ent[1], civ) and torch.equal(ent[2], slots) \
                and torch.equal(ent[3], dark) and torch.equal(ent[4], era):
            val = ent[5]
        else:
            val = self._gov_policy_mods(civ, slots, dark, era)
        self._gov_pol_cache[row] = (ver, civ, slots, dark, era, val)
        return val

    def _seat_slotted(self, row: int) -> torch.Tensor:
        """[B, nPol] — the cards seat row `row` actually holds, its AGE and era
        window included. Every reader that means "what this seat has adopted"
        goes through here so a Dark Age card is never invisible to one of
        them."""
        return self._gov_mods(row)[4]

    def _card_favor_per_building(self, row: int) -> torch.Tensor:
        """[B] f64 — CIV6 (Disinformation Campaign): "+3 Diplomatic Favor per
        turn for each Broadcast Center." The card names a building and pays per
        copy standing."""
        out = torch.zeros(self.B, dtype=torch.float64, device=self.device)
        if not self._gov_has_effects:
            return out
        alive = self.city_alive[:, row]
        for on, bi, amt in self._gov_mods(row)[12]["favorb"]:
            n = (self.city_bldg[:, row, :, bi] & alive).sum(dim=1).double()
            out = out + torch.where(on, n * amt, torch.zeros_like(n))
        return out

    def _fx_by_row(self, key: str) -> torch.Tensor:
        """[B, n_majors] — one government/policy effect channel for EVERY major
        row at once, for the sites that read the OWNER off a tile."""
        if self._fx_row_cache is None or self._fx_row_cache[0] != self._eff_version:
            self._fx_row_cache = (self._eff_version, {})
        d = self._fx_row_cache[1]
        v = d.get(key)
        if v is None:
            v = torch.stack([self._gov_mods(r)[12][key] for r in range(self.n_majors)], dim=1)
            d[key] = v
        return v

    def _bsum_by_row(self, key: str, w: torch.Tensor) -> torch.Tensor:
        """[B, n_majors] — `_seat_building_sum` for EVERY major row at once,
        for the sites that read the OWNER off a unit rather than a loop index.
        Memoised on `_bldg_version`, which every `city_bldg` write moves."""
        if self._bsum_row_cache is None or self._bsum_row_cache[0] != self._bldg_version:
            self._bsum_row_cache = (self._bldg_version, {})
        d = self._bsum_row_cache[1]
        v = d.get(key)
        if v is None:
            v = torch.stack([self._seat_building_sum(r, w) for r in range(self.n_majors)], dim=1)
            d[key] = v
        return v

    def _fx_at_seat(self, key: str, seat: torch.Tensor,
                    rows: torch.Tensor | None = None) -> torch.Tensor:
        """One effect channel for the seat each row names, 0 off the major
        roster (a barbarian or a city-state adopts no government). `rows`
        names the BATCH rows when the caller has already narrowed."""
        z = torch.zeros_like(seat, dtype=self.dtype)
        if not self._gov_has_effects:
            return z
        ok = (seat >= 0) & (seat < self.n_majors)
        s0 = seat.clamp(min=0, max=self.n_majors - 1)
        tab = self._fx_by_row(key)
        v = tab[rows, s0] if rows is not None else tab.gather(1, s0.unsqueeze(1)).squeeze(1)
        return torch.where(ok, v, z)

    def _suz_capital_mask(self, row: int) -> torch.Tensor:
        """[B, S] — the city-states whose flat suzerain channel pays `row` this
        turn. CIV6 (Geneva): "when you are not at war with any civilization",
        which is a MAJOR, so a war with a minor leaves the channel standing."""
        peace = ~self.war[:, row, : self.n_majors].any(dim=1)
        return self._suz_live_mask(row) & (
            peace.unsqueeze(1) | ~self.citystate_suz_peace[:, : self.S])

    def _listening_levels(self) -> torch.Tensor:
        """[B, NM, NM] long — the best Listening Post row v has running in a
        city of column t. CIV6 (Diplomatic Visibility and Gossip): the mission
        "increases visibility by one level", two once the spy is a Secret
        Agent, and only while it RUNS."""
        B, NM, dev = self.B, self.n_majors, self.device
        out = torch.zeros(B, NM * NM, dtype=torch.long, device=dev)
        if NM == 0 or self._spy_idx < 0:
            return out.reshape(B, NM, NM)
        live = (self.unit_alive & (self.unit_type == self._spy_idx)
                & (self.unit_spy_mission == self._spy_m_listening))
        if not bool(live.any()):
            return out.reshape(B, NM, NM)
        hrow, _hcol = self._spy_here(self.unit_tile)
        seat = self.unit_seat
        ok = live & (hrow >= 0) & (hrow < NM) & (seat >= 0) & (seat < NM)
        lvl = torch.where(self.unit_spy_level >= self._spy_secret_level,
                          torch.full_like(self.unit_spy_level, 2),
                          torch.ones_like(self.unit_spy_level))
        idx = (seat.clamp(min=0, max=NM - 1) * NM + hrow.clamp(min=0, max=NM - 1))
        val = torch.where(ok, lvl, torch.zeros_like(lvl))
        return out.scatter_reduce(1, idx, val, reduce="amax").reshape(B, NM, NM)

    def _diplo_vis(self) -> torch.Tensor:
        """[B, NM, NM] long — `diploVisibility`: how much of column t row v can
        see. CIV6: "There are 5 levels of diplomatic visibility: None, Limited,
        Open, Secret, and Top Secret", one per source."""
        B, NM, dev = self.B, self.n_majors, self.device
        if NM == 0:
            return torch.zeros(B, 0, 0, dtype=torch.long, device=dev)
        tgt = torch.arange(NM, device=dev)
        # "Establish a Trade Route to a civilization to increase visibility by
        # one level."
        ds = self.seat_route_dseat[:, :NM]                       # [B, NM, K]
        out = (ds.unsqueeze(3) == tgt.view(1, 1, 1, NM)).any(dim=2).long()
        # "Send a Delegation to a civilization to increase visibility by one
        # level. Once Embassies are available, establishing an Embassy will
        # replace this."
        out = out + (self.seat_delegation[:, :NM, :NM] > 0).long()
        # "...researching the Printing Press technology. This will increase
        # your visibility with ALL civilizations by one level."
        if 0 <= self._vis_tech < self.civ_techs.shape[2]:
            out = out + self.civ_techs[:, :NM, self._vis_tech].long().unsqueeze(2)
        # The post and the alliance are ALTERNATIVES: "These two actions do not
        # add separate Diplomatic Visibility levels".
        ally = (self.seat_ally_turns[:, :NM, :NM] > 0).long()
        out = out + torch.maximum(ally, self._listening_levels())
        off = (tgt.view(NM, 1) != tgt.view(1, NM)).unsqueeze(0)
        return torch.where(off, out.clamp(max=self._vis_max), torch.zeros_like(out))

    def _vis_cs(self, own: torch.Tensor, foe: torch.Tensor) -> torch.Tensor:
        """CIV6 ("Intel on enemy movements"): when two civs read each other at
        different levels, "if one party's level is higher, they will receive a
        permanent bonus in every military encounter" — +3 Combat Strength per
        level of the gap, and nothing for the side that is behind."""
        z = torch.zeros_like(own, dtype=self.dtype)
        NM = self.n_majors
        if NM == 0 or self._vis_cs_per_level == 0:
            return z
        vis = self._diplo_vis()
        a = own.clamp(min=0, max=NM - 1)
        f = foe.clamp(min=0, max=NM - 1)
        bi = torch.arange(self.B, device=self.device)
        bi = bi.reshape((-1,) + (1,) * (own.dim() - 1)).expand_as(own)
        d = vis[bi, a, f] - vis[bi, f, a]
        ok = (own >= 0) & (own < NM) & (foe >= 0) & (foe < NM) & (d > 0)
        return torch.where(ok, (d * self._vis_cs_per_level).to(self.dtype), z)

    def _barb_cs(self, own: torch.Tensor, foe: torch.Tensor) -> torch.Tensor:
        """[B] — CIV6 (Discipline): "+5 Combat Strength when fighting
        Barbarians". A barbarian adopts no government, so the bonus only ever
        runs one way."""
        z = torch.zeros_like(own, dtype=self.dtype)
        if not self._gov_has_effects:
            return z
        return torch.where(foe == BARB_SEAT, self._fx_at_seat("vbarb", own), z)

    def _recon_xp_mult(self, seat: torch.Tensor, types: torch.Tensor,
                       rows: torch.Tensor | None = None) -> torch.Tensor:
        """long — CIV6 (Survey): "Doubles experience for recon units"."""
        one = torch.ones_like(seat, dtype=torch.long)
        if not self._gov_has_effects or not bool(self._type_recon.any()):
            return one
        m = self._fx_at_seat("rxp", seat, rows).long()
        return torch.where(self._type_recon[types.clamp(min=0, max=self.NU - 1)], m.clamp(min=1), one)

    def _unit_upkeep(self, row: int, types: torch.Tensor) -> torch.Tensor:
        """The gold each unit costs this seat per turn — Conscription and
        Levee en Masse take it down, never below free."""
        base = self._type_maintenance[types.clamp(min=0, max=self.NU - 1)]
        if not self._gov_has_effects:
            return base
        cut = self._gov_mods(row)[12]["mcut"]
        # CIV6 (Elite Forces): "+2 Gold to maintain each military unit."
        add = self._gov_mods(row)[12]["milmaint"]
        while cut.dim() < base.dim():
            cut = cut.unsqueeze(-1)
            add = add.unsqueeze(-1)
        mil = (self._type_combat[types.clamp(min=0, max=self.NU - 1)] > 0).to(base.dtype)
        return (base - cut + add * mil).clamp(min=0)

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
        for _amt, _src in ((self._dyn_dam, self._dam_didx),
                           (self._dyn_canal, self._canal_didx),
                           (self._dyn_govplaza, self._govplaza_didx)):
            if float(_amt[di]) == 0 or _src < 0:
                continue
            nb = self.neigh
            nbc = nb.clamp(min=0)
            cnt = ((self.district[:, nbc] == _src) & self.district_complete[:, nbc]
                   & (nb >= 0).unsqueeze(0)).sum(dim=2)
            raw = raw + _amt[di] * cnt.to(self.dtype)
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

    def _district_adj_seat(self, row: int, di: int) -> torch.Tensor:
        """[B, T] — `effectiveAdjacency`: the FLOORED adjacency of a district
        of type `di`, times this seat's adjacencyMult for that type. TS floors
        the raw sum first and multiplies after, so a doubled +3 is +6, never
        floor(3.5 * 2)."""
        base = self._district_adj_floor(di)
        out = base * self._gov_mods(row)[10][:, di].unsqueeze(1)
        if self.n_governors and row < self.n_majors:
            out = out * self._governor_tile_adj(row, di).to(out.dtype)
        return out

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
        # Harbor and Water Park sit on coastal water, the Spaceport and the
        # Canal on FLAT land (no Hills), the Dam on a floodplain, everything
        # else on any usable land.
        surface = (self.coastal_water if placement == 2
                   else self.d_usable & ~self.hills if placement in (4, 6)
                   else self.d_usable & self.floodplain if placement == 5
                   else self.d_usable)
        elig = (self._district_elig_site(row, j) if base is None else base) & surface
        if placement in (1, 3):  # Aqueduct: adjacent-centre + water source; Encampment/Preserve: NOT adjacent-centre
            cc = self._adj_center_count()  # [B, T] adjacent CITY_CENTERs (any seat)
            elig = elig & ((cc >= 1) & self.aqsrc if placement == 1 else (cc == 0))
        elif placement == 5:
            elig = elig & self._dam_plot(di)
        elif placement == 6:
            elig = elig & self._canal_plot()
        if bool(self._d_one_civ[di]):
            # CIV6: "Limit of one per civilization" — one standing anywhere in
            # this seat's empire closes every plot in every city.
            held = ((self.city_dist_tile[:, row, :, di] >= 0) & self.city_alive[:, row]).any(dim=1)
            elig = elig & ~held.unsqueeze(1)
        for _x in self._d_exclusive[di]:
            # CIV6 (Water Park): "cannot be built if an Entertainment Complex
            # already exists in this city."
            elig = elig & ~(self.city_dist_tile[:, row, j, _x] >= 0).unsqueeze(1)
        return elig

    def _dam_plot(self, di: int) -> torch.Tensor:
        """[B, T] CIV6 (Dam): "the River must traverse at least 2 adjacent sides
        of the future Dam tile", with a "Limit of one per River" — one standing
        Dam anywhere along the river closes every plot on it, whoever owns it.
        The floodplain half is the surface test in `_district_elig`."""
        sides = torch.zeros_like(self.river_mask)
        for d in range(6):
            sides = sides + ((self.river_mask >> d) & 1)
        ok = (sides >= 2) & (self.river_comp >= 0)
        taken = (self.district == di) & (self.river_comp >= 0)
        if bool(taken.any()):
            comp = self.river_comp.clamp(min=0)
            nc = int(self.river_comp.max()) + 1
            cnt = torch.zeros(self.B, nc, dtype=torch.long, device=self.device)
            cnt.scatter_add_(1, comp, taken.long())
            ok = ok & (cnt.gather(1, comp) == 0)
        return ok

    def _canal_plot(self) -> torch.Tensor:
        """[B, T] CIV6 (Canal): "a Coast or Lake tile on one side, and either a
        City Center or another body of water on the other. A single canal
        passage may go either straight, or bend 60 degrees" — so the two sides
        sit 2, 3 or 4 directions apart; 1 or 5 is the 120-degree turn the
        source refuses. The flat-land half is the surface test."""
        nb = self.neigh                       # [T, 6]
        nbc = nb.clamp(min=0)
        on = (nb >= 0).unsqueeze(0)           # [1, T, 6]
        entry = self.water[:, nbc] & ~self.ocean_tile[:, nbc] & on   # COAST or LAKE
        exit_ = (self.water[:, nbc] | (self.centre_slot_at[:, nbc] >= 0)) & on
        out = torch.zeros(self.B, self.T, dtype=torch.bool, device=self.device)
        for a in range(6):
            for b in range(6):
                if (b - a) % 6 not in (2, 3, 4):
                    continue
                out = out | (entry[:, :, a] & exit_[:, :, b])
        return out

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
                     artist: torch.Tensor | None = None,
                     only_col: torch.Tensor | None = None) -> None:
        """`only_col` narrows the walk to ONE city column per game — what an
        ACTIVATION does, where the works land in the city the charge was spent
        in rather than across the whole seat."""
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
        if only_col is not None:
            _sel = torch.arange(openc.shape[1], device=openc.device).reshape(1, -1) == only_col.unsqueeze(1)
            openc = openc * _sel.long()
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

    def _gw_capacity(self, row: int, kind: int) -> torch.Tensor:
        """[B, RC] — how many works of `kind` each of this row's cities holds
        room for: its DEDICATED slots, or what it already holds where that is
        more, plus whatever is left of the any-work pool. `gwCapacity`'s twin
        under `gwExtraSlots`, and `_place_works`' own `cap`."""
        held = (self.city_gw_writing, self.city_gw_art, self.city_gw_music)[kind][:, row]
        ded = self._gw_dedicated(row, kind)
        return ded + self._in_pool(ded, held, self._any_work_pool_all()[:, row]) \
            + self._any_work_free_all()[:, row]

    @staticmethod
    def _in_pool(dedicated: torch.Tensor, held: torch.Tensor,
                 pool: torch.Tensor) -> torch.Tensor:
        """How many of the any-work POOL's slots one kind already stands in.
        Never more than the pool: a city that loses a dedicated slot under an
        occupied work keeps the work, not a slot conjured to hold it."""
        return torch.minimum((held - dedicated).clamp(min=0), pool)

    def _any_work_pool_all(self) -> torch.Tensor:
        """[B, n_majors, RC] long — the any-work slots each city's STANDING
        buildings open, before anything takes one."""
        pool = torch.zeros(self.B, self.n_majors, self.RC, dtype=torch.long, device=self.device)
        if not self._any_work_live:
            return pool
        for r in range(self.n_majors):
            stand = self.city_bldg[:, r] & ~self._bldg_dark(self.city_dist_tile[:, r])
            pool[:, r] = torch.einsum("bjn,n->bj", stand.long(), self._b_any_work)
        return pool

    def _any_work_free_all(self) -> torch.Tensor:
        """[B, n_majors, RC] long — CIV6 (National History Museum): "Provides 4
        slots for any Great Work". ONE shared pool per city, which a work of any
        kind falls into once the slots of its OWN kind are full, so what is left
        of it is the pool minus everything already standing in it.
        `anyWorkFree`'s twin."""
        z = torch.zeros(self.B, self.n_majors, self.RC, dtype=torch.long, device=self.device)
        if not self._any_work_live:
            return z
        pool = self._any_work_pool_all()
        used = z.clone()
        rded = self._relic_dedicated()
        for r in range(self.n_majors):
            for k in range(3):
                held = (self.city_gw_writing, self.city_gw_art, self.city_gw_music)[k][:, r]
                used[:, r] = used[:, r] + (held - self._gw_dedicated(r, k)).clamp(min=0)
            used[:, r] = used[:, r] + (self.city_relics[:, r] - rded[:, r]).clamp(min=0)
        return (pool - used).clamp(min=0)

    def _gw_dedicated(self, row: int, kind: int) -> torch.Tensor:
        """[B, RC] — the slots of `kind` each of this row's cities owns outright:
        the slot BUILDING's own plus whatever its completed wonders add."""
        bcol, nslots = self._gw_bidx[kind], self._gw_slots_k[kind]
        base = self.city_gw_writing[:, row]
        if bcol < 0:
            return torch.zeros_like(base)
        cap = self.city_bldg[:, row, :, bcol].long() * nslots
        if getattr(self, "_wond_gw", None) is not None and int(self._wond_gw[:, kind].sum()) > 0:
            wreg = self.city_wonder[:, row]
            compw = (wreg >= 0) & self.built_wonder_complete.gather(
                1, wreg.clamp(min=0).reshape(self.B, -1)
            ).reshape_as(wreg)
            cap = cap + (compw.long() * self._wond_gw[:, kind].reshape(1, 1, -1)).sum(dim=2)
        return cap

    def _gift_work(self, giver: int, taker: int, kind: int, ok: torch.Tensor) -> None:
        """One GREAT WORK changes hands. CIV6 (Trading): "You may trade almost
        anything in the game, including ... Great Works", and the one-sided
        half of that screen is the gift — "Click it and you gift your items to
        your rival."

        The work leaves the giver's first city holding one and lands in the
        taker's first with room, in the same city order `_place_works` fills.
        An ART work carries its provenance with it: a gifted work is still that
        artist's, which is what the receiving museum themes on. `gwTake` and
        `gwGive`'s twin."""
        B, RC = self.B, self.RC
        gw = (self.city_gw_writing, self.city_gw_art, self.city_gw_music)[kind]
        src_have = self.city_alive[:, giver] & (gw[:, giver] > 0)
        dst_room = self.city_alive[:, taker] & (gw[:, taker] < self._gw_capacity(taker, kind))
        move = ok & src_have.any(dim=1) & dst_room.any(dim=1)
        if not bool(move.any()):
            return
        si = src_have.long().argmax(dim=1)
        di = dst_room.long().argmax(dim=1)
        col = torch.arange(RC, device=self.device).reshape(1, RC)
        src_cell = move.unsqueeze(1) & (col == si.unsqueeze(1))
        dst_cell = move.unsqueeze(1) & (col == di.unsqueeze(1))
        if kind == 1:
            ns = self._gw_slots_k[1]
            su = gw[:, giver].gather(1, si.unsqueeze(1)).squeeze(1) - 1  # the giver's LAST filled slot
            du = gw[:, taker].gather(1, di.unsqueeze(1)).squeeze(1)      # the taker's first free one
            held = (su >= 0) & (su < ns)
            sc = su.clamp(0, ns - 1).reshape(B, 1, 1).expand(B, 1, 1)
            gi = si.reshape(B, 1, 1).expand(B, 1, ns)
            ptype = torch.where(held, self.city_gwart_type[:, giver].gather(1, gi).squeeze(1).gather(1, sc.squeeze(2)).squeeze(1),
                                torch.full_like(su, -1))
            partist = torch.where(held, self.city_gwart_artist[:, giver].gather(1, gi).squeeze(1).gather(1, sc.squeeze(2)).squeeze(1),
                                  torch.full_like(su, -1))
            for sl in range(ns):
                out = src_cell & (su.unsqueeze(1) == sl)
                self.city_gwart_type[:, giver, :, sl] = torch.where(
                    out, torch.full_like(self.city_gwart_type[:, giver, :, sl], -1),
                    self.city_gwart_type[:, giver, :, sl])
                self.city_gwart_artist[:, giver, :, sl] = torch.where(
                    out, torch.full_like(self.city_gwart_artist[:, giver, :, sl], -1),
                    self.city_gwart_artist[:, giver, :, sl])
                into = dst_cell & (du.unsqueeze(1) == sl)
                self.city_gwart_type[:, taker, :, sl] = torch.where(
                    into, ptype.unsqueeze(1).expand(B, RC), self.city_gwart_type[:, taker, :, sl])
                self.city_gwart_artist[:, taker, :, sl] = torch.where(
                    into, partist.unsqueeze(1).expand(B, RC), self.city_gwart_artist[:, taker, :, sl])
        gw[:, giver] = gw[:, giver] - src_cell.long()
        gw[:, taker] = gw[:, taker] + dst_cell.long()
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
        # CIV6 (Bishop): "Religious pressure to adjacent cities is 100%
        # stronger from this city" — the SOURCE city's own governor.
        if self.n_governors:
            for g in range(O):
                _m = self._governor_tile_mult(g, "pressureMult").gather(1, ht[:, g:g + 1]).squeeze(1)
                if bool((_m != 1).any()):
                    add[:, :, :, g] = (add[:, :, :, g].double() * _m.reshape(B, 1, 1)).long()
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
                if self.n_governors:
                    _pm = self._governor_mult(g, "pressureMult")           # [B, RC] per SOURCE city
                    add[:, :, :, g] += (within.double() * _pm.reshape(B, 1, 1, -1)).sum(dim=3).long()
                else:
                    add[:, :, :, g] += within.sum(dim=3)
        # CIV6 (Citadel of God): "City ignores pressure ... from Religions not
        # founded by the Governor's player."
        if self.n_governors:
            _own = torch.arange(O, device=self.device).reshape(1, 1, 1, O) \
                == torch.arange(NSC, device=self.device).reshape(1, NSC, 1, 1)
            _deaf = torch.stack([self._governor_flag(g, "ignoreForeignPressure") for g in range(NSC)], dim=1)
            add = torch.where(_deaf.unsqueeze(3) & ~_own, torch.zeros_like(add), add)
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
        15, its own CAMP 20, neutral ground 10, anyone else's land 5 — or 15
        with the promotion that heals outside friendly territory.

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
        # CIV6 (Auxiliary Ships / Supply Fleet): "Heal outside of friendly
        # territory" — the foreign-ground rate becomes the own-ground one.
        foreign = torch.where(self._promo_pool_flag(pre, "HEAL_ANYWHERE"),
                              torch.full_like(t, 15), torch.full_like(t, 5))
        heal = torch.where(home & center, torch.full_like(t, 20),
               torch.where(home, torch.full_like(t, 15),
               torch.where(here != NO_SEAT, foreign, torch.full_like(t, 10))))
        # CIV6 (Laying On Of Hands): "All Governor's units heal fully in one
        # turn in tiles of this city."
        if self.n_governors:
            _fh = torch.zeros_like(home)
            for _r in range(self.n_majors):
                _p = self._governor_tile_flag(_r, "fullHeal")
                if bool(_p.any()):
                    _fh = _fh | ((seat == _r) & _p.gather(1, t))
            heal = torch.where(_fh & home, torch.full_like(heal, 100), heal)
        # CIV6 (Twilight Valor): "Cannot heal outside your territory."
        if self._gov_has_effects:
            _s0 = seat.clamp(min=0, max=self.n_majors - 1)
            _hh = self._fx_by_row("healhome").gather(1, _s0) & (seat >= 0) & (seat < self.n_majors)
            heal = torch.where(_hh & ~home, torch.zeros_like(heal), heal)
        if camp is not None:
            heal = torch.where(camp & ~home, torch.full_like(t, 20), heal)
        heal = heal + self._emergency_heal_mp(pre, seat, here) + self._chaplain_heal(pre) \
            + self._gp_perm_at(seat, "healBonus").to(heal.dtype)
        # a RELIGIOUS unit heals by its own rule and by nothing above it
        _rel = self._rel_strength[getattr(self, f"{pre}_unit_type").clamp(min=0)] > 0
        if bool(_rel.any()):
            heal = torch.where(_rel, self._religious_heal(pre), heal)
        return heal

    def _res_starved(self, pre: str) -> torch.Tensor:
        """[B, U] — CIV6 (Resource, GS): "if you had acquired Iron to produce
        Swordsmen, but have no continuous access to Iron Mines, those Swordsmen
        won't be able to Heal." ACCESS, not the bank: one owned, improved,
        unpillaged source answers. A minor or the barbarians keep no bank and
        are not held to it."""
        typ = getattr(self, f"{pre}_unit_type").clamp(min=0, max=self.NU - 1)
        seat = getattr(self, f"{pre}_unit_seat")
        out = torch.zeros_like(typ, dtype=torch.bool)
        if not self._res_unit_pairs:
            return out
        provides = (self.res_id >= 0) & (self.improvement == self.res_imp) & ~self.pillaged
        rows = torch.arange(self.n_majors, device=self.device).reshape(1, -1, 1)
        mine = self.tile_seat.unsqueeze(1) == rows                     # [B, majors, T]
        acc: dict[int, torch.Tensor] = {}
        for u_idx, res_idx in self._res_unit_pairs:
            want = (typ == u_idx) & (seat >= 0) & (seat < self.n_majors)
            if not bool(want.any()):
                continue
            if res_idx not in acc:
                acc[res_idx] = (mine & (provides & (self.res_id == res_idx)).unsqueeze(1)).any(dim=2)
            has = acc[res_idx].gather(1, seat.clamp(min=0, max=self.n_majors - 1))
            out = out | (want & ~has)
        return out

    def _chaplain_heal(self, pre: str) -> torch.Tensor:
        """[B, U] CIV6 (Chaplain): the Apostle "operates as a Medic, providing
        extra healing to units within 1 tile", and the Medic page prices that
        at "+20 HP/turn" for a stationary neighbour. Military units only, and
        the strongest neighbouring chaplain answers — two do not stack."""
        t = getattr(self, f"{pre}_unit_tile").clamp(min=0)
        typ = getattr(self, f"{pre}_unit_type").clamp(min=0, max=self.NU - 1)
        out = torch.zeros_like(t)
        if self._pk.get("CHAPLAIN", -1) < 0:
            return out
        # every tile's chaplain value, by the RELIGIOUS occupant standing on it
        # — ashore on the civilian plane, at sea on the passenger one.
        nb = self.neigh[t.reshape(-1)].reshape(t.shape[0], t.shape[1], 6)
        nbc = nb.clamp(min=0).reshape(t.shape[0], -1)
        seat = getattr(self, f"{pre}_unit_seat").unsqueeze(2)
        near = torch.zeros(nb.shape, dtype=torch.long, device=self.device)
        for occ in (self.civilian_at, self.embarked_at):
            oc = occ.clamp(min=0)
            val = torch.where(
                occ >= 0,
                self._promo_val(self.unit_type.gather(1, oc).clamp(min=0, max=self.NU - 1),
                                self.unit_promos.gather(1, oc), "CHAPLAIN"),
                torch.zeros_like(occ),
            )
            oseat = torch.where(occ >= 0, self.unit_seat.gather(1, oc), torch.full_like(occ, -1))
            near = torch.maximum(near, val.gather(1, nbc).reshape(nb.shape)
                                 * ((nb >= 0) & (oseat.gather(1, nbc).reshape(nb.shape)
                                                 == seat)).long())
        return torch.where(self._type_civilian[typ], out, near.amax(dim=2))

    def _holy_site_faith(self) -> torch.Tensor:
        """[B, T] long — each live Holy Site's OWN faith output: its adjacency
        plus the faith of the buildings standing in it. Every other tile is 0.
        The `holySiteFaith` twin, memoised on the effect version the district
        adjacency itself is memoised on."""
        if self._hs_faith_cache is not None and self._hs_faith_cache[0] == self._eff_version:
            return self._hs_faith_cache[1]
        B, T, dev = self.B, self.T, self.device
        out = torch.zeros(B, T, dtype=torch.long, device=dev)
        if self._hs_idx < 0:
            self._hs_faith_cache = (self._eff_version, out)
            return out
        live = ((self.district == self._hs_idx) & self.district_complete
                & ~self.district_pillaged)
        if bool(live.any()):
            # the adjacency term is the OWNER's — a card that doubles Holy
            # Site adjacency doubles its OWN seat's Holy Sites, nobody else's.
            bf = torch.zeros(B, T, dtype=torch.long, device=dev)
            for r in range(self.n_majors):
                sl = self.city_slot_at(r)
                mine = (self.tile_seat == r) & (sl >= 0)
                if not bool(mine.any()):
                    continue
                fsum = (self.city_bldg[:, r].long()
                        * self._b_hs_faith.reshape(1, 1, -1)).sum(dim=2)  # [B, RC]
                bf = torch.where(mine, fsum.gather(1, sl.clamp(min=0)), bf)
                out = torch.where(mine, self._district_adj_seat(r, self._hs_idx).long(), out)
            out = torch.where(live, out + bf, torch.zeros_like(out))
        self._hs_faith_cache = (self._eff_version, out)
        return out

    def _religious_heal(self, pre: str) -> torch.Tensor:
        """[B, U] — `religiousHeal`. CIV6: religious units "Heal only when
        standing on or next to a Holy Site in their own territory", at "3 times
        the Faith output of the Holy Site"; the best site in reach, since "the
        healing capability differs from one Holy Site to the next"."""
        t = getattr(self, f"{pre}_unit_tile")
        seat = getattr(self, f"{pre}_unit_seat")
        B, U = t.shape
        tc = t.clamp(min=0)
        cand = torch.cat([tc.unsqueeze(2), self.neigh[tc]], dim=2)  # [B, U, 7]
        on = (cand >= 0) & (t >= 0).unsqueeze(2)
        cc = cand.clamp(min=0).reshape(B, -1)
        f = self._holy_site_faith().gather(1, cc).reshape(B, U, 7)
        own = self.tile_seat.gather(1, cc).reshape(B, U, 7) == seat.unsqueeze(2)
        best = torch.where(on & own, f, torch.zeros_like(f)).amax(dim=2)
        # CIV6 (Monastery): "+15 HP healing every turn for friendly religious
        # units" — the unpillaged improvement it is standing on, in its own
        # ground.
        imp = self.improvement.gather(1, tc)
        mon = torch.where((imp >= 0) & ~self.pillaged.gather(1, tc)
                          & (self.tile_seat.gather(1, tc) == seat) & (t >= 0),
                          self._imp_rel_heal[imp.clamp(min=0)],
                          torch.zeros_like(f[:, :, 0]))
        return best * self._relig_heal_per_faith + mon

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

    def _heal_blocked(self, pre: str) -> torch.Tensor:
        """[B, U] — did this unit spend its turn in the way that silences its
        heal? CIV6 (Tactical Maintenance): "Can heal after attacking" — the kind
        lives on the bomber's list alone, and a sortie is the only thing that
        spends an aircraft's turn, so a spent attack excuses the spent movement.
        The fortify gate keeps `_spent_mp` itself — no aircraft digs in."""
        struck = getattr(self, f"{pre}_unit_attacks") < self._full_attacks(pre)
        return self._spent_mp(pre) & ~(struck & self._promo_pool_flag(pre, "HEAL_AFTER_ATTACK"))

    def _sea_move_mp(self, seat: torch.Tensor, emb: torch.Tensor, naval: torch.Tensor) -> torch.Tensor:
        """[B, U] — `seaMoveBonus` + `embarkTechMoves`. The Mathematics rung
        reaches anything AT SEA (a hull or a passenger); the three embark rungs
        raise the passenger's own pool. A seat with no research desk (a
        barbarian, a city-state) reads neither."""
        row = self._row_of(seat)
        ok = (row >= 0) & (row < self.n_majors)
        r0 = row.clamp(min=0, max=self.n_majors - 1)  # a minor/barb row is masked, not indexed
        out = torch.zeros_like(row)
        if self._sea_move_tech >= 0:
            has = self.civ_techs[:, :, self._sea_move_tech].gather(1, r0)
            out = out + (has & ok & (emb | naval)).long() * self._sea_move_bonus
        for ti, v in self._embark_move_techs:
            has = self.civ_techs[:, :, ti].gather(1, r0)
            out = out + (has & ok & emb & ~naval).long() * v
        return out

    def _full_mp(self, pre: str) -> torch.Tensor:
        """[B, U] — refreshUnits' `full + generalAuraMP(state, unit)`, one rule
        for both windows: an EMBARKED land unit marches on the flat
        EMBARK_MOVES pool, everything else on its type's `moves`, plus whatever
        the frozen general/admiral aura granted.

        CIV6 (Commando): the +1 Movement "also applies while the unit is
        embarked", so the promotion adder joins AFTER the embark override —
        while the emergency march joins BEFORE it, inside the land arm, and the
        aura after, exactly where `unitFullMoves` and refreshUnits put them.

        Every walker and every afford rule (`mp >= full`) must read this same
        expression — `stepUnit` is embark-aware in both windows."""
        typ = getattr(self, f"{pre}_unit_type").clamp(min=0, max=self.NU - 1)
        # The golden dedication raises the unit's OWN movement, so it is added
        # to the type pool and then OVERRIDDEN by the embark pool below —
        # embarkation speed is not a unit's movement stat. `unitFullMoves` has
        # the same shape (`if (embarked && !naval) return EMBARK_MOVES`).
        base = self._type_moves[typ] + self._golden_move_mp(pre) + self._emergency_mp(pre)
        # CIV6 (Letters of Marque): "Naval Raiders: +100% Production, +2
        # Movement."
        if self._gov_has_effects:
            _sd = getattr(self, f"{pre}_unit_seat")
            _s0 = _sd.clamp(min=0, max=self.n_majors - 1)
            _rm = self._fx_by_row("raidermove").gather(1, _s0) \
                * ((_sd >= 0) & (_sd < self.n_majors)).long()
            base = base + _rm * self._type_raider[typ].long()
        naval = self.unit_naval[typ]
        emb = getattr(self, f"{pre}_unit_emb") if self._embark_live else torch.zeros_like(naval)
        if self._embark_live:
            base = torch.where(
                emb & ~naval, torch.full_like(base, self._embark_moves), base
            )
        base = base + self._sea_move_mp(getattr(self, f"{pre}_unit_seat"), emb, naval)
        # ONE multiply, at the end: every figure above is in WHOLE points, and
        # the aura's is already in `mp_scale` units (`unitFullMoves` scales its
        # own sum and refreshUnits adds the aura on top).
        return (self._mp_scale * (base + self._promo_pool_val(pre, "MOVES"))
                + getattr(self, f"{pre}_unit_aura_mp"))

    def _attacks_after_moving(self, utype: torch.Tensor, promos: torch.Tensor) -> torch.Tensor:
        """`attacksAfterMoving`, in `promos`' shape. CIV6 (Sweeping Wind / Elite
        Guard / Breakthrough): "+1 additional attack per turn if Movement
        allows" — every unit starts its turn with one, and moving costs it
        none of these."""
        return torch.ones_like(promos) + self._promo_val(utype, promos, "EXTRA_ATTACK")

    def _attacks_per_turn(self, utype: torch.Tensor, promos: torch.Tensor) -> torch.Tensor:
        """`attacksPerTurn`, in `promos`' shape. CIV6 (Expert Marksman): "+1
        additional attack per turn if unit has not moved", whose own note reads
        it as "the unit cannot make the additional attack if it moves AFTER
        making its first attack. It can still move BEFORE it attacks"."""
        return (self._attacks_after_moving(utype, promos)
                + self._promo_val(utype, promos, "EXTRA_ATTACK_STILL"))

    def _step_attacks_left(self, utype: torch.Tensor, promos: torch.Tensor,
                           left: torch.Tensor) -> torch.Tensor:
        """`stepAttacksLeft` — what a step leaves of the attack budget:
        everything, until the unit has struck once."""
        made = self._attacks_per_turn(utype, promos) - left
        keep = (self._attacks_after_moving(utype, promos) - made).clamp(min=0)
        return torch.where(made > 0, torch.minimum(left, keep), left)

    def _full_attacks(self, pre: str) -> torch.Tensor:
        """[B, U] — `attacksPerTurn` over a whole unit pool."""
        typ = getattr(self, f"{pre}_unit_type").clamp(min=0, max=self.NU - 1)
        return self._attacks_per_turn(typ, getattr(self, f"{pre}_unit_promos"))

    def _reset_mp(self, pre: str) -> None:
        """The movesLeft/movesFull/attacksLeft reset: `granted = full + aura`,
        both movement fields, and the turn's attacks beside them. TS writes the
        pair together at refreshUnits and again at seatPhase; writing only one
        breaks next turn's "spent no MP" gate for a seat that never moved."""
        f = self._full_mp(pre)
        getattr(self, f"{pre}_unit_mp_full").copy_(f)
        getattr(self, f"{pre}_unit_mp").copy_(f)
        getattr(self, f"{pre}_unit_attacks").copy_(self._full_attacks(pre))

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

    def _world_era(self) -> torch.Tensor:
        """[B] — the `worldEraIndex` twin: the furthest era any major has
        reached. -1 before anyone finishes anything."""
        we = torch.full((self.B,), -1, dtype=torch.long, device=self.device)
        for r in range(self.n_majors):
            we = torch.maximum(we, self._civ_era(self.civ_techs[:, r], self.civ_civics[:, r]))
        return we

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

    def _tourism_of(self, gw_w: torch.Tensor, gw_a: torch.Tensor, gw_m: torch.Tensor, alive: torch.Tensor, own: torch.Tensor, era: torch.Tensor, printing: torch.Tensor | None = None, artifacts: torch.Tensor | None = None, gw_kmult: torch.Tensor | None = None, themed: torch.Tensor | None = None, resort_mult: torch.Tensor | None = None, park_mult: torch.Tensor | None = None, gov_tile: torch.Tensor | None = None, suz_tour: torch.Tensor | None = None, gw_mult: torch.Tensor | None = None) -> torch.Tensor:
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
        # CIV6 (Curator): "+100% Tourism from Great Works in this city." The
        # multiplier is the CITY's, so it folds into the per-city term rather
        # than the seat total.
        av = alive.long() if gw_mult is None else alive.long() * gw_mult
        t = (
            _wmult * km[:, 0] * (gw_w * av).sum(dim=1)
            + self._gw_tour_k[1] * km[:, 1] * (gw_a * av).sum(dim=1)
            + self._gw_tour_k[2] * km[:, 2] * (gw_m * av).sum(dim=1)
        )
        if artifacts is not None:
            # a THEMED Archaeological Museum doubles what it holds.
            tm = torch.ones_like(artifacts)
            if themed is not None:
                tm = torch.where(themed, self._theming_mult, 1)
            t = t + self._artifact_tourism * (artifacts * av * tm).sum(dim=1)
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
        if suz_tour is not None:
            t = t + suz_tour
        return t

    def _tourism_religious_of(self, row: int) -> torch.Tensor:
        """[B] — the RELIGIOUS half of a seat's per-turn tourism, banked apart
        (`civ_tourism_rel`) because a rival's Enlightenment or a different
        religion halves THIS half at the read (`_culture_victor`), never the
        general half. CIV6 (Tourism): "Relics generate Religious Tourism"
        (St. Basil's multiplier is the HOLDING city's) and "Holy Cities
        generate +8 Religious Tourism per turn" — a religion's Holy City pays
        its CURRENT owner (`seatTourismReligious`)."""
        alive = self.city_alive[:, row]
        relics = self.city_relics[:, row]
        rm = (self._city_wonder_mult(row, self._wond_relictour).long()
              if self._wond_n else torch.ones_like(relics))
        t = self._relic_tour * (relics * alive.long() * rm).sum(dim=1)
        centres = self.city_center[:, row]
        for g in range(self.n_majors):
            ht = self.holy_tile[:, g]
            holds = (ht >= 0) & ((centres == ht.unsqueeze(1)) & alive).any(dim=1)
            t = t + holds.long() * self._holy_city_tour
        return t

    def _suzerain_tourism(self, row: int, own: torch.Tensor) -> torch.Tensor:
        """[B] — CIV6: the Batey "provides Tourism after researching Flight"
        and the Colossal Heads "provide Tourism from Faith after researching
        Flight", in both cases equal to the improvement's own output of the
        named yield — its catalog row plus what its neighbours pay it
        (`suzerainTourism`)."""
        out = torch.zeros(self.B, dtype=torch.long, device=self.device)
        adj = None
        for k, yi in enumerate(self._imp_tour_y):
            if yi < 0:
                continue
            tt = self._imp_tour_tech[k]
            got = (self.civ_techs[:, row, tt] if tt >= 0
                   else torch.ones(self.B, dtype=torch.bool, device=self.device))
            live = (self.improvement == k) & ~self.pillaged & own
            if not bool(live.any()):
                continue
            if adj is None:
                adj = self._imp_adjacency(row)
            per = torch.full_like(live, 0, dtype=self.dtype) + float(self._imp_yields[k, yi])
            if adj is not None:
                per = per + adj[:, :, yi]
            out = out + (per * live.to(self.dtype)).sum(dim=1).long() * got.long()
        return out

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
        COMPLETED built wonder +1, each district's own `_appeal_adj` column,
        each improvement's own `_imp_appeal_adj` column, a pillaged tile -1,
        and a BARBARIAN OUTPOST -1. Version-cached like _farmadj_qual — every
        contributing write bumps _eff_version, camps included."""
        if self._appeal_cache is not None and self._appeal_cache[0] == self._eff_version:
            return self._appeal_cache[1]
        contrib = self.appeal_base - torch.where(self.feat_stripped, self.appeal_feat, torch.zeros_like(self.appeal_feat))
        contrib = contrib + (self.built_wonder_complete & (self.built_wonder >= 0)).long()
        if self._imp_appeal_any:
            contrib = contrib + torch.where(
                self.improvement >= 0,
                self._imp_appeal_adj[self.improvement.clamp(min=0)],
                torch.zeros_like(contrib))
        if self._appeal_adj_any:
            contrib = contrib + torch.where(
                self.district >= 0,
                self._appeal_adj[self.district.clamp(min=0)],
                torch.zeros_like(contrib))
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
        # CIV6 (Alvar Aalto, Charles Correa): "+N Appeal to any tile it owns".
        # It sits BEFORE the wonder/mountain override, which the TS twin takes
        # as an early return.
        out = out + self._gp_appeal_plane().long()
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
        if has_bel or self._b_appeal_rows:
            featP = self._seat_tile_add(row)
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
            adjv = self._district_adj_seat(row, di).gather(1, t_d.clamp(min=0)).double()  # (memoised)
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
        # the tier add when ANY ONE of the top buildings stands; -2 = any
        # worship building). Integer-valued, so the add order is exact at any
        # association.
        if bool(spec_d.any()):
            for di in range(len(self.districts_cat)):
                cnt = spec_d[:, :, di]
                if not bool(cnt.any()):
                    continue
                has_t = torch.zeros(B, n, dtype=torch.bool, device=dev)
                for t_b in self._spec_tb[di]:
                    if t_b == -2:
                        has_t = has_t | (bldg & self._b_worship.reshape(1, 1, -1)).any(dim=2)
                    elif t_b >= 0:
                        has_t = has_t | bldg[:, :, t_b]
                y6 = self._spec_y[di].reshape(1, 1, 6) + has_t.double().unsqueeze(2) * self._spec_ta[di].reshape(1, 1, 6)
                dist_y = dist_y + cnt.double().unsqueeze(2) * y6

        bld_y = self._palace_y.double().reshape(1, 1, 6) * is_cap.unsqueeze(2)
        selb = bldg & ~self._bldg_dark(dreg) & ~self._b_regional.reshape(1, 1, -1)
        if bool(selb.any()):
            selbf = selb.double()
            bld_y = bld_y + selbf @ rd.b_yields.double()
            # CIV6 (Leonardo da Vinci): "Workshops provide +3 Culture" — the
            # seat-wide permanent, per standing Workshop.
            if self._workshop_bidx >= 0:
                _wc = self._gp_perm(row, "workshopCulture").double()
                if bool((_wc != 0).any()):
                    bld_y[:, :, 4] = bld_y[:, :, 4] + _wc.unsqueeze(1) * selbf[:, :, self._workshop_bidx]
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
            if bool((selb & self._b_pow_y_any.reshape(1, 1, -1)).any()):
                # GS POWER: the second half of a late building's yields, paid
                # while its city meets its whole load.
                _lit = self.city_powered[:, row, sl].double().unsqueeze(2)
                bld_y = bld_y + (selbf * _lit) @ self._b_pow_y
            if self._iz_idx >= 0 and self._iz_adj_bidx:
                # CIV6 (Coal Power Plant): "Grants bonus Production equal to the
                # district's current adjacency bonus", and unlike its two
                # successors that Production is LOCAL.
                izt = dreg[:, :, self._iz_idx]
                izc = izt.clamp(min=0)
                has_cp = torch.zeros(B, n, dtype=torch.bool, device=dev)
                for _bi in self._iz_adj_bidx:
                    has_cp = has_cp | selb[:, :, _bi]
                has_cp = alive & has_cp & (izt >= 0) & self.district_complete.gather(1, izc)
                if bool(has_cp.any()):
                    iadj = self._district_adj_seat(row, self._iz_idx).gather(1, izc).double()
                    bld_y[:, :, 1] = bld_y[:, :, 1] + torch.where(has_cp, iadj, torch.zeros_like(iadj))
            if self._harbor_idx >= 0 and self._shipyard_bidx >= 0:
                hb = dreg[:, :, self._harbor_idx]
                hbc = hb.clamp(min=0)
                has_sy = alive & selb[:, :, self._shipyard_bidx] & (hb >= 0) & self.district_complete.gather(1, hbc)
                if bool(has_sy.any()):
                    hadj = self._district_adj_seat(row, self._harbor_idx).gather(1, hbc).double()
                    bld_y[:, :, 1] = bld_y[:, :, 1] + torch.where(has_sy, hadj, torch.zeros_like(hadj))
        _byb = self._gov_mods(row)[11]
        if _byb and bool(selb.any()):
            for _act, _r7 in _byb:
                _di, _yi = int(_r7[0]), int(_r7[1])
                _live = dlive[:, :, _di] & _act.unsqueeze(1)
                if not bool(_live.any()):
                    continue
                _pct = torch.full((B, n), float(_r7[2]), dtype=F64, device=dev)
                _pct = _pct + (pop >= float(_r7[3])).double() * float(_r7[4])
                _adjv = self._district_adj_seat(row, _di).gather(
                    1, dreg[:, :, _di].clamp(min=0)).double()
                _pct = _pct + (_adjv >= float(_r7[5])).double() * float(_r7[6])
                _mine = (selb & (self._b_req_district.reshape(1, 1, -1) == _di)).double()
                _base = _mine @ rd.b_yields[:, _yi].double()
                bld_y[:, :, _yi] = bld_y[:, :, _yi] + torch.where(
                    _live, _base * _pct, torch.zeros_like(_base))
        _reg = self._seat_regional(row)
        if _reg is not None:
            bld_y = bld_y + _reg[0][:, sl]
        if compw is not None and bool(compw.any()):
            bld_y = bld_y + compw.double() @ self._wond_cy
            # CIV6 (Great Bath): "+1 Faith for every time a tile belonging to
            # this city has been Flooded."
            if bool((self._wond_faithflood != 0).any()):
                _ffw = compw.double() @ self._wond_faithflood  # [B, cols]
                if bool((_ffw != 0).any()):
                    _sl = self.city_slot_at(row)
                    _fc = torch.zeros(self.B, self.RC, dtype=torch.long, device=self.device)
                    _fc.scatter_add_(1, _sl.clamp(min=0),
                                     torch.where(_sl >= 0, self.tile_flood_ct,
                                                 torch.zeros_like(self.tile_flood_ct)))
                    bld_y[:, :, 5] = bld_y[:, :, 5] + _ffw * _fc[:, :bld_y.shape[1]].double()
            _impy = self._wonder_improvement_yields(row)
            if _impy is not None:
                bld_y = bld_y + _impy[:, sl]
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
            _suz = self._suz_capital_mask(row)
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
        # CIV6 (Autocracy): "+1 to all yields for each Government Plaza
        # building, Diplomatic Quarter building, and palace in a city."
        if self._gov_has_effects:
            _gby = self._gov_mods(row)[12]["govbldy"]
            if bool((_gby != 0).any()):
                _stand = self.city_bldg[:, row, :cols] & ~self._bldg_dark(self.city_dist_tile[:, row, :cols])
                _n = (_stand & self._b_gov_yield.reshape(1, 1, -1)).sum(dim=2).double()
                # the PALACE is a capital TERM on this engine, never a
                # `city_bldg` bit, so the count adds it by hand
                if self._palace_gov_yield:
                    _n = _n + is_cap
                bon = bon + (_gby.double().reshape(B, 1, 1) * _n.unsqueeze(2)
                             * alivef.unsqueeze(2))
        # the GOVERNOR's share: its flat cityYields, the per-CITIZEN yields
        # (the promotions' plus the two governments that pay by citizen in a
        # governed city) and the faith per SPECIALTY district.
        if self.n_governors and row < self.n_majors:
            _gpc = self._gov_mods(row)[12]["govpercit"] if self._gov_has_effects \
                else torch.zeros(B, 6, dtype=F64, device=dev)
            _spec = self._district_counts(row)[1] if self.districts_on \
                else torch.zeros(B, self.RC, dtype=torch.long, device=dev)
            bon = bon + self._governor_bonus(row, self.city_pop[:, row, :cols], _spec, _gpc)[:, sl] \
                * alivef.unsqueeze(2)

        trade = zeros6
        _rt = self._seat_route_income(row)
        if _rt is not None:
            trade = _rt[:, sl] * alivef.unsqueeze(2)

        total = tiles_y + dist_y + bld_y + citz + bon + trade
        total[:, :, 1:] = total[:, :, 1:] * amen_yf.unsqueeze(2)
        if gym is not None:
            if self._gov_has_effects:
                _cz = self._gov_mods(row)[12]["culsuz"]
                if bool((_cz != 0).any()):
                    gym = gym.clone()
                    gym[:, 4] = gym[:, 4] * (1 + _cz * self._suzerain_count(row).to(gym.dtype))
            gymc = gym.double().unsqueeze(1)
            # The governor's own multipliers are part of `m.yieldMult` on TS —
            # ONE number scales the total, so they fold in before it lands.
            if self.n_governors and row < self.n_majors:
                _gy = self._gov_mods(row)[12]["govymul"] if self._gov_has_effects \
                    else torch.ones(B, 6, dtype=F64, device=dev)
                gymc = gymc * self._governor_ymult(row, _gy)[:, sl]
            total = total * gymc
        # CIV6 (Monasticism): "+75% Science in cities with a Holy Site";
        # (Robber Barons): "+50% Gold in cities with a Stock Exchange. +25%
        # Production in cities with a Factory." Each names one city FACT and
        # multiplies AFTER m.yieldMult, one card at a time.
        if self._gov_has_effects:
            _fxm = self._gov_mods(row)[12]
            for _on, _di, _yi, _m in _fxm["distym"]:
                if not self.districts_on:
                    continue
                _has = self._dist_counts(row)[:, sl, _di] > 0
                total[:, :, _yi] = total[:, :, _yi] * torch.where(
                    _on.unsqueeze(1) & _has, torch.full_like(alivef, _m), torch.ones_like(alivef))
            for _on, _bi, _yi, _m in _fxm["bldgym"]:
                _has = self.city_bldg[:, row, sl, _bi]
                total[:, :, _yi] = total[:, :, _yi] * torch.where(
                    _on.unsqueeze(1) & _has, torch.full_like(alivef, _m), torch.ones_like(alivef))
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
        # `m.growthMult`: the belief factor and the governor's own
        # (CIV6, Surplus Logistics: "+20% Growth in the city") are ONE number
        # on TS, so they fold together before the single multiply.
        gmul = None
        if self._seat_has_beliefs(row):
            gmul = self._bel_mul("growth", row).unsqueeze(1)
        if self.n_governors and row < self.n_majors:
            gg = self._governor_mult(row, "growthMult")
            gmul = gg if gmul is None else gmul * gg
        if gmul is not None:
            eff = eff * gmul
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


    def _res_avail_mask(self, owned: torch.Tensor, row: int = -1) -> torch.Tensor:
        """[B, NU] — `trainableUnits`' resource arm: ACCESS opens the column
        (an owned, improved, unpillaged source), and the STOCKPILE is what pays
        for the unit. A row of -1 asks the ACCESS half only."""
        B, dev = self.B, self.device
        out = torch.ones(B, self.NU, dtype=torch.bool, device=dev)
        if not self._res_unit_pairs:
            return out
        provides = (self.res_id >= 0) & (self.improvement == self.res_imp) & ~self.pillaged & owned
        for u_idx, res_idx in self._res_unit_pairs:
            out[:, u_idx] = (provides & (self.res_id == res_idx)).any(dim=1)
        if row >= 0:
            for u_idx, slot, cost in self._res_slot_units:
                out[:, u_idx] = out[:, u_idx] & (self.civ_stockpile[:, row, slot] >= cost)
        return out
