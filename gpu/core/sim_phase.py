"""The seat phase: EVERY seat's turn (yields, growth, borders, completion, loyalty, transfers).

One mixin of BatchSim (assembled in engine.py); state and helpers live on
self / gpu/core/simbase.py.
"""
from __future__ import annotations

from .simbase import *  # noqa: F401,F403 — torch, constants, helpers: the shared floor
from .simbase import _MUTABLE  # noqa: F401 — private names do not ride a star import
from . import simbase  # the PATCHABLE globals (the pool caps/_ALIAS_CHECK) must be read live


class SimPhase:
    def _seat_phase(self, war: torch.Tensor | None = None) -> None:
        """Runs EVERY seat in id order — the seatPhase twin. This function holds
        the schedule AROUND the seat loop (the MP reset, the geopolitics arms,
        the peace pass); every row's turn itself is ONE call to _seat_row.
        Decisions arrive through the same stash for every row (`_stash_record`
        / `_stash_buy`, keyed by absolute row), so the only wire argument left
        here is `war` — seat 0's declare column, which applies at the geo pass
        below rather than at the record position.

        What remains per-row in this file is the war-or-peace tail: the civ
        counters and the driven unit-sequence replay (WAR_COLUMN_SEAT)."""
        rr = self.rules.seats
        # Freeze the MAJORS' aura MP here: the seatPhase movesLeft reset
        # covers every isCiv unit — seat 0's pool included — ahead of any
        # general war-walk, so both engines read the same pre-move general
        # positions.
        if self.units_mode:
            self._refresh_aura_mp()
            self._reset_mp("major")
        # The geopolitics arms run BEFORE the per-seat loop — denounce and
        # alliance first (a fresh grudge blocks a same-turn alliance and
        # starts the formal clock), then the declarations in ACTOR order
        # (seat 0's declare arm leads, then the civ↔civ pass — the war is
        # live for both sides' war-acts this turn); peace at the tail.
        if self.R > 0:
            self._geo_denounce_and_ally()
        # Seat 0 declares through the geo pass like every seat (the rec.war
        # self-guard's twin: its own war column can never mean itself). The
        # arm re-validates against the LIVE mask at this position.
        if war is not None and self._rl_war_active and self.R > 0:
            w0 = war.to(torch.long)
            ok0 = self.alive.any(dim=1) & (w0 >= 0) & self.war_mask().gather(1, w0.clamp(min=0).unsqueeze(1)).squeeze(1)
            decl = ok0 & (w0 < self.R)
            if bool(decl.any()):
                oh = torch.nn.functional.one_hot(w0.clamp(min=0, max=self.R - 1), self.R).bool() & decl.unsqueeze(1)
                self.civ_only_atwar.logical_or_(oh)
                self.war[:, 1:1 + self.civ_only_atwar.shape[1], 0] |= oh
                self.civ_only_warturns.copy_(torch.where(oh, torch.zeros_like(self.civ_only_warturns), self.civ_only_warturns))
        if self.R > 0:
            self._geo_declare_wars()
        # THE SEAT LOOP — state.seats in id order, seat 0 first, ONE body per
        # row. Row 0's war/peace tail is its peace counter alone: warTurns
        # counts war with WAR_COLUMN_SEAT and a seat is never at war with
        # itself, and row 0's unit orders replay in the order phase, not here.
        act0 = self._seat_row(0)
        self.peace_turns[:, 0] += (act0 & ~self.civ_only_atwar.any(dim=1)).long()
        for r in range(self.R):
            active = self._seat_row(r + 1)
            if not bool(active.any()):
                continue

            # Builder verbs and missionary SPREAD verbs ride the wire; their
            # phase.ts call positions are here, builders then missionaries.

            # Great General moves ride the wire; their phase.ts call position
            # is here, BEFORE the war loop, so the aura reflects the advanced
            # position (a general spawned in the GP claim above walks this turn
            # on full MP).

            # War or peace (branch on the value at entry; a peace made this
            # turn still runs the war branch, like the TS if/else). A seat at
            # war with ANYONE takes the WAR branch — its units run the war-act,
            # which scans every at-war seat's units and cities. civ_only_warturns
            # tracks the seat-0 war only (atw), while the seat-0 declaration
            # roll is skipped for a seat already in ANY war via
            # pea = ~atw_any, so both engines drop the conditional draw in
            # lockstep.
            atw = active & self.civ_only_atwar[:, r]
            atw_any = atw | (active & self.civ_pair_war[:, r, : self.R].any(dim=1))
            self.civ_only_warturns[:, r] = self.civ_only_warturns[:, r] + atw.long()
            # This seat's live slots, computed once (deaths only shrink
            # mid-loop; neither loop spawns) — the war AND peace walks reuse it.
            # Replayed unit acts fire HERE, at the walkers' own position in the
            # phase, never before step(): battles DRAW, so they must consume
            # their combat draws at the same position in the stream as the TS
            # in-phase replay. Draw-free actions (production/tech/civic) stay
            # pre-step. War rows here, peace rows at the peace loop below.
            _dsq = getattr(self, "_driven_useq", None)
            if _dsq is not None and r in _dsq:
                _rows_w = atw_any & self.controlled[:, r]
                if bool(_rows_w.any()):
                    _ord_w = torch.where(_rows_w.view(-1, 1, 1), _dsq[r], torch.full_like(_dsq[r], -1))
                    self.apply_seat_unit_sequence(r + 1, _ord_w)
            # Suing for peace rides the wire's war verb.
            pea = active & ~atw_any  # a seat at ANY war neither patrols nor rolls the seat-0 declaration
            self.civ_only_peaceturns[:, r] = self.civ_only_peaceturns[:, r] + pea.long()
            if _dsq is not None and r in _dsq:
                _rows_p = pea & self.controlled[:, r]
                if bool(_rows_p.any()):
                    _ord_p = torch.where(_rows_p.view(-1, 1, 1), _dsq[r], torch.full_like(_dsq[r], -1))
                    self.apply_seat_unit_sequence(r + 1, _ord_p)
            # War declarations arrive on the wire.

        # Drop the route-income cache at phase end: its key
        # (turn, r, eff, _rp_kill_version) does not cover unit deaths in the
        # war/peace acts above, so post-phase callers (leader/domination/
        # trace) must recompute against post-war state. With R>=2 the single
        # slot is overwritten before any same-r re-read, but that must not be
        # load-bearing for R=1 configs.
        self._seat_route_cache = None

        # The PEACE pass runs AFTER every seat acted, in actor order — seat
        # 0's sue-for-peace arm leads (the geoPeace pass position), then the
        # civ↔civ pairs. Re-validated against the LIVE mask; the gold
        # schedule is the seat-0 war verb's own rule (the TS geoPeace arm
        # carries no terms — a WAR_COLUMN_SEAT-family residual).
        if war is not None and self._rl_war_active and self.R > 0:
            w0p = war.to(torch.long)
            okp = self.alive.any(dim=1) & (w0p >= 0) & self.war_mask().gather(1, w0p.clamp(min=0).unsqueeze(1)).squeeze(1)
            pea = okp & (w0p >= self.R)
            if bool(pea.any()):
                ri = (w0p - self.R).clamp(min=0, max=self.R - 1)
                cost = rr.get("peaceGold0", 150) + rr.get("peaceGoldSlope", 10) * self.civ_only_warturns.gather(
                    1, ri.unsqueeze(1)
                ).squeeze(1).to(self.dtype)
                oh = torch.nn.functional.one_hot(ri, self.R).bool() & pea.unsqueeze(1)
                self.treasury.copy_(torch.where(pea, self.treasury - cost, self.treasury))
                self.civ_only_atwar.logical_and_(~oh)
                self.war[:, 1:1 + self.civ_only_atwar.shape[1], 0] &= ~oh
                self.civ_only_warturns.copy_(torch.where(oh, torch.zeros_like(self.civ_only_warturns), self.civ_only_warturns))
                self.civ_only_peaceturns.copy_(torch.where(oh, torch.zeros_like(self.civ_only_peaceturns), self.civ_only_peaceturns))
        if self.R > 0:
            self._geo_make_peace()

    def _seat_city_strike(self, row: int, col: torch.Tensor, fire: torch.Tensor, key: str) -> None:
        """ONE city's once-per-turn RANGED STRIKE — target scan plus the battle.

        `col` [B] is the city slot per batch row, `fire` [B] whether it may
        shoot at all (walls present / a live Encampment). The target is the
        NEAREST unit hostile to seat row `row` at range 1-2, ties broken by the
        lowest tile index; one roll at the city's defense strength against the
        target's, no retaliation, never captures.

        Hostility is `_seats_hostile` on the row's own line of the war matrix —
        `unitsHostile` asked of the whole map at once — so barbarians, at-war
        majors and at-war city-states all answer through one lookup and no seat
        gets a hand-written hostility set of its own."""
        Bn, Tn, dev2 = self.B, self.T, self.device
        if not bool(fire.any()):
            return
        bidx = torch.arange(Bn, device=dev2)
        ctr = self.city_center[bidx, row, col].clamp(min=0)  # [B]
        dist = self.pair_dist[ctr].to(torch.long)  # [B, T]
        _mil, _civ = self.military_at, self.civilian_at
        _mseat = torch.where(_mil >= 0, self.unit_seat.gather(1, _mil.clamp(min=0)), torch.full_like(_mil, -1))
        _cseat = torch.where(_civ >= 0, self.unit_seat.gather(1, _civ.clamp(min=0)), torch.full_like(_civ, -1))
        hm = self._seats_hostile(row, _mseat)
        hc = self._seats_hostile(row, _cseat)
        valid = fire.unsqueeze(1) & (hm | hc) & (dist >= 1) & (dist <= 2)
        arangeT = torch.arange(Tn, device=dev2)
        k = torch.where(valid, dist * (Tn + 1) + arangeT.reshape(1, -1), torch.full((Bn, Tn), 10**9, device=dev2, dtype=torch.long))
        best_key = k.min(dim=1).values
        tt = k.argmin(dim=1)  # [B] target tile (garbage where no target)
        strike = fire & (best_key < 10**9)
        if not bool(strike.any()):
            return
        # ONE defender slot; "military first" is the entire priority (one
        # military and one civilian per tile makes the rest unreachable).
        _okm, _okc = hm[bidx, tt], hc[bidx, tt]
        d_slot = torch.where(_okm, _mil[bidx, tt], torch.where(_okc, _civ[bidx, tt], torch.full_like(tt, -1)))
        d_seat = torch.where(_okm, _mseat[bidx, tt], torch.where(_okc, _cseat[bidx, tt], torch.full_like(tt, -1)))
        ds0 = d_slot.clamp(min=0)
        # A MILITARY target whose seat class earns xp — never a barbarian.
        is_vet_mil = _okm & (d_seat != BARB_SEAT)
        d_type = self.unit_type[bidx, ds0]
        def_xp = torch.where(is_vet_mil, self._xp_lvl_bonus(self.unit_xp[bidx, ds0]), torch.zeros_like(tt))
        def_cs = self._type_combat[d_type] + self._tdef_i(bidx, tt) + def_xp
        # An embarked target (military or civilian; barbs never embark) → flat
        # CS, no terrain and no support.
        d_emb = self.unit_emb[bidx, ds0] & (d_slot >= 0)
        def_cs = torch.where(d_emb, torch.full_like(def_cs, self._embarked_defense_cs), def_cs)
        # Garrison bonus: this seat's OWN military standing on the centre tile.
        gslot = self.military_at[bidx, ctr]
        gar = ((gslot >= 0) & (self.unit_seat[bidx, gslot.clamp(min=0)] == row)).long()
        bm = self.civ_best_melee[:, row]
        atk_cs = torch.maximum(bm, torch.full_like(bm, 15)) + gar * 5
        # the defending unit is wounded (the attacker is the city)
        def_hp = self.unit_hp[bidx, ds0]
        def_e = def_cs - self._wound(def_hp)
        # Support keys on the DEFENDER's own seat (supportCount counts units
        # with `u.seat === defender.seat`); the attacker is a city, so there is
        # no flanking.
        _, _sp = self._flank_support(tt, d_seat, torch.full((Bn,), -1, dtype=torch.long, device=dev2))
        def_e = def_e + SUPPORT_CS * torch.where(d_emb, torch.zeros_like(_sp), _sp)
        # DEFENDER-side general aura (the roll is atk_cs - def_e, so it REDUCES
        # the damage taken), outside the embarked override. Barbs own no
        # general and a civilian is combat-0, so both read 0.
        _def_seat = torch.where(is_vet_mil, d_seat, torch.full_like(tt, -1))
        _def_nav = torch.where(is_vet_mil, self.unit_naval[d_type.clamp(min=0, max=self.NU - 1)], torch.zeros_like(d_emb))
        def_e = def_e + self._gen_aura_cs(_def_seat, tt, d_emb | _def_nav).to(def_e.dtype)
        self._city_strike_resolve(strike, tt, d_slot, d_seat, _okm, _okc, is_vet_mil,
                                  atk_cs, def_e, def_hp, row, key)

    def _seat_row(self, row: int) -> torch.Tensor:
        """ONE seat's turn — the seatPhase loop body, for ANY major seat row
        (0 = seat 0, r+1 = civ r). Returns the row's `active` mask so the
        caller can drive its war-or-peace tail.

        In seatPhase order: the war-weariness decay, boost detection,
        city-state diplomacy and quests, the recorded picks, the gold/faith
        ladder, trade, the per-city block (loyalty, the empire streams, growth,
        the queue, border growth, the city's own defense), the loyalty
        collapses, then the research/upkeep/tourism/great-people tail.

        What the CALLER still owns is the war-or-peace tail: its counters and
        its driven unit-sequence replay still differ between row 0 and a civ
        row (the WAR_COLUMN_SEAT residual)."""
        B, dev = self.B, self.device
        active = self.civ_alive[:, row] & self.city_alive[:, row].any(dim=1)
        if not bool(active.any()):
            # TS's eliminated-actor `continue` — but the record intents are
            # for THIS turn and must not survive into the next one.
            self._seat_record_apply(row, active)
            return active
        # War weariness SETTLES here: accrual happens per BATTLE as the
        # fighting resolves, so what is left for the block top is the
        # decay. The same function every seat calls, on its own row.
        # civ_pair_war is fixed for the turn by the phase-top declaration pass,
        # so the "at war with somebody" test inside is stable.
        self._ww_decay(row, active)
        # Eurekas/inspirations from this seat — the TS twin runs at the
        # same point (the seat's block top).
        self._detect_seat_boosts(row, active)
        # The CS-diplomacy block sits right after boost detection — the
        # seatPhase position.
        self._seat_influence_phase(row, active)
        # CS quests resolve/issue right after the envoy accrual (the
        # seatPhase quest block sits at the tail of the same CS block), so
        # a completed quest's envoy is visible to the levy suzerain test
        # later this phase.
        self._seat_quest_phase(row, active)
        # THE RECORD: tech, civic, envoys, production — one body, every seat
        # row, at applySeatActionRecord's own position.
        self._seat_record_apply(row, active)
        # THE gold/faith block — one body, every seat row.
        self._seat_buy_ladder(row, active)
        # The trade creation block sits between the buy block and the
        # city-loop snapshot — the seatPhase position.
        self._seat_trade_phase(row, active)
        # The city-loop snapshot is taken AFTER the buy block (the
        # [...actor.cities] discipline): a bought-settler newborn acts this
        # turn (amenity + yields), a queue-completion newborn (founded
        # inside the loop, later) does not.
        alive_c = self.city_alive[:, row].clone()

        sci_sum = torch.zeros(B, dtype=torch.float64, device=dev)
        cul_sum = torch.zeros(B, dtype=torch.float64, device=dev)
        gold_sum = torch.zeros(B, dtype=torch.float64, device=dev)
        faith_sum = torch.zeros(B, dtype=torch.float64, device=dev)
        # THE loop-top stats snapshot — one body, every seat row. Every
        # column below reads THIS map: yields, amenity tier, effective food
        # surplus and growth need all freeze here, and nothing inside the
        # loop refreshes them.
        total, eff, need, tier_idx = self._seat_city_stats(row)
        gov = self._seat_governor_seats(row)  # [B, RC]
        flip = torch.zeros(B, self.RC, dtype=torch.bool, device=dev)
        # One guard sync for the whole economy loop: alive_c is a pre-loop
        # CLONE (a queue-completion newborn founded inside the loop does not
        # act this turn — the [...actor.cities] discipline above) and `active`
        # is a loop-invariant local.
        cact_all = active.unsqueeze(1) & alive_c  # [B, RC]
        cact_any_l = cact_all.any(dim=0).tolist()
        for j in range(self.RC):
            if not cact_any_l[j]:
                continue
            cact = cact_all[:, j]  # post-buy snapshot (a bought settler's city acts this turn)
            jc = torch.full((B,), j, dtype=torch.long, device=dev)
            # City loyalty at its loop-top position — one body, every seat row.
            flip[:, j] = self._seat_city_loyalty(row, jc, cact, tier_idx[:, j], gov[:, j])
            # The empire streams, in seatPhase's own order. ASSOCIATION
            # MATTERS: TS `sciSum += y.science + 0.7*pop` desugars to
            # sciSum + (y.science + 0.7*pop) — the city term sums FIRST.
            # (cul_sum + cul) + 0.3*pop is one ulp off and flips completions
            # when a cost lands inside it. The citizens' term is already
            # inside the snapshot's science/culture, and inside the amenity
            # tier with it.
            # `total.gold` is ALREADY net of the city's upkeep — the walk
            # subtracts cityMaintenance where computeCityStats does, so
            # phase.ts adds stats.total.gold straight in.
            gold_sum = torch.where(cact, gold_sum + total[:, j, 2], gold_sum)
            faith_sum = torch.where(cact, faith_sum + total[:, j, 5], faith_sum)
            sci_sum = torch.where(cact, sci_sum + total[:, j, 3], sci_sum)
            cul_c = torch.where(cact, total[:, j, 4], torch.zeros_like(total[:, j, 4]))
            cul_sum = torch.where(cact, cul_sum + cul_c, cul_sum)
            # seatGrowth, then the queue, then borders, then the city's own
            # defense — four shared bodies, one call each, every seat row.
            self._seat_city_growth(row, jc, cact, eff[:, j], need[:, j])
            self._seat_city_produce(row, jc, cact, total[:, j, 1])
            self._seat_border_growth(row, jc, cact, cul_c)
            self._seat_city_fire_and_heal(row, jc, cact)

        # Loyalty collapses resolve after the city loop — one body, every
        # seat row.
        self._seat_loyalty_flips(row, flip)
        # The seat block's TAIL — banking, upkeep, research, tourism,
        # favor, grievances, the great-people and belief races: ONE body,
        # every seat row, on this row's own city sums.
        self._seat_research_tail(row, active, sci_sum, cul_sum, gold_sum, faith_sum)
        return active

    def _seat_governor_seats(self, row: int) -> torch.Tensor:
        """[B, RC] — seat row `row`'s governor-held cities for THIS turn, the
        loop-top governorPicks mirror. Rank the row's ALIVE cities on QUANTIZED
        milli loyalty (a raw-f64 ranking is float-association fragile), ties by
        column index == TS array order (#110), and seat the top
        governorTitles(civics) of them. Read once per seat block, before any
        loyalty moves."""
        dev, B, RC = self.device, self.B, self.RC
        titles = (self.civ_civics[:, row].sum(dim=1) // self._gov_per).clamp(max=self._gov_max)  # [B]
        alive = self.city_alive[:, row]
        q = js_round(self.city_loyalty[:, row] * 1000).long()
        key = torch.where(alive, q * 256 + torch.arange(RC, device=dev).reshape(1, -1), torch.full_like(q, 1 << 40))
        rank = torch.empty_like(key)
        rank.scatter_(1, key.argsort(dim=1, stable=True), torch.arange(RC, device=dev).expand(B, RC))
        return (rank < titles.unsqueeze(1)) & alive

    def _seat_city_loyalty(self, row: int, col: torch.Tensor, act: torch.Tensor,
                           tier: torch.Tensor, gov: torch.Tensor) -> torch.Tensor:
        """applyLoyalty for ONE column of seat row `row`; returns the FLIP mask.

        Loyalty only moves while SOMEBODY ELSE holds a city. A capital pins to
        loyaltyMax — and only past that guard, which is where applyLoyalty puts
        it. Everything else takes nearby population pressure scaled per SOURCE
        seat by that seat's own age factor, plus the amenity term and the
        governor bonus.

        Pops are read LIVE, which is why this is a per-city body and not a
        batched pass: cities EARLIER in this seat's loop have already grown,
        later ones have not, and seats later in the seat loop have not taken
        their turn at all. Every pressure term is pop x an integer weight and
        every age factor is a half, so the subtotals are exact and their sum
        order does not matter."""
        B, dev, F = self.B, self.device, torch.float64
        bidx, nrow = self._bidx, 1 + self.R
        rr = self.rules.seats
        rng = int(rr.get("loyaltyRange", 9))
        scale = float(rr.get("loyaltyScale", 20))
        lmax = float(rr.get("loyaltyMax", 100))
        # "somebody else holds a city": the majors that EXIST and hold one,
        # this row excluded.
        held = self.city_alive[:, :nrow].any(dim=2) & self.civ_alive[:, :nrow]  # [B, 1+R]
        others = torch.cat((held[:, :row], held[:, row + 1:]), dim=1)
        others = others.any(dim=1) if others.shape[1] else torch.zeros(B, dtype=torch.bool, device=dev)
        here = self.city_center[bidx, row, col].clamp(min=0)  # [B]
        ctr = self.city_center[:, :nrow].reshape(B, -1).clamp(min=0)
        d = self.pair_dist[here.unsqueeze(1), ctr].to(F)
        w = ((rng + 1 - d).clamp(min=0)
             * self.city_pop[:, :nrow].reshape(B, -1).double()
             * self.city_alive[:, :nrow].reshape(B, -1).double())
        sub = w.reshape(B, nrow, self.RC).sum(dim=2) * self._age_factor[self.civ_age[:, :nrow]]  # [B, 1+R]
        own = sub[:, row]
        keep = torch.ones(nrow, dtype=F, device=dev)
        keep[row] = 0.0  # own is not foreign; a 0.0 term leaves the sum exact
        foreign = (sub * keep.reshape(1, -1)).sum(dim=1)
        tot = own + foreign
        press = torch.where(tot > 0, scale * (own - foreign) / tot.clamp(min=1e-9), torch.zeros_like(tot))
        delta = (press
                 + self._loyalty_amenity[tier.clamp(min=0, max=self._loyalty_amenity.shape[0] - 1)].double()
                 + gov.double() * self._gov_loy)
        loy = self.city_loyalty[bidx, row, col]
        upd = act & others
        nxt = torch.where(upd, (loy + delta).clamp(min=0, max=lmax), loy)
        cap = self.city_is_cap[bidx, row, col]
        self.city_loyalty[bidx, row, col] = torch.where(upd & cap, torch.full_like(nxt, lmax), nxt)
        return upd & ~cap & (self.city_loyalty[bidx, row, col] <= 0)

    def _seat_loyalty_flips(self, row: int, flip: torch.Tensor) -> None:
        """flipCity for every column of seat row `row` that hit 0 — resolved
        AFTER the seat's city loop, the TS defectors-list position.

        The city defects to the major seat exerting the most RAW pressure: no
        age factor here, which is flipCity's deliberate difference from
        loyaltyDelta. Its own owner is excluded (a city does not defect to
        itself) and so is a seat that does not exist; a seat that EXISTS but
        holds no city still exerts 0 and still beats the sentinel, exactly as
        the TS scan's `best = -1` does. Ties go to the lowest seat id (the
        strict-`>` scan == first_argmax).

        Defections resolve in ARRAY order with pressures read LIVE: an earlier
        transfer moves pops a later one must see."""
        nrow = 1 + self.R
        rng = int(self.rules.seats.get("loyaltyRange", 9))
        for j in range(self.RC):
            fl = flip[:, j] & self.city_alive[:, row, j]
            if not bool(fl.any()):
                continue
            for b in fl.nonzero(as_tuple=True)[0].tolist():
                here = int(self.city_center[b, row, j])
                d = self.pair_dist[here, self.city_center[b, :nrow].reshape(-1).clamp(min=0)].to(torch.float64)
                w = ((rng + 1 - d).clamp(min=0)
                     * self.city_pop[b, :nrow].reshape(-1).double()
                     * self.city_alive[b, :nrow].reshape(-1).double())
                press = w.reshape(nrow, self.RC).sum(dim=1)
                press = torch.where(self.civ_alive[b, :nrow], press, torch.full_like(press, -1.0))
                press[row] = -1.0
                # A flip is never a conquest, so it never razes and never
                # plunders, whoever receives.
                self._transfer_city(b, row, j, int(first_argmax(press.unsqueeze(0))[0]), conquest=False)

    def _seat_city_growth(self, row: int, col: torch.Tensor, act: torch.Tensor,
                          eff: torch.Tensor, need: torch.Tensor) -> None:
        """seatGrowth — bank the effective surplus, then grow OR starve. ONE
        body, every seat row, at the per-city seatPhase position (after this
        city's yields, before its queue).

        `eff` and `need` are THIS column's snapshot effectiveFoodSurplus and
        growthNeeded (_seat_city_stats): the housing, amenity-tier, wonder and
        belief factors are already folded into `eff`, and `need` reads the pop
        the turn opened with.

        The two arms are EXCLUSIVE (seatGrowth's `else if`): a city that grows
        never starves the same turn. Starvation floors the pop at 1 and empties
        the box."""
        bidx = self._bidx
        old = self.city_growth[bidx, row, col]
        box = old + eff
        grow = act & (box >= need)
        starve = act & ~grow & (box < 0)
        nxt = torch.where(grow, box - need, torch.where(starve, torch.zeros_like(box), box))
        self.city_growth[bidx, row, col] = torch.where(act, nxt, old)
        pop = self.city_pop[bidx, row, col] + grow.long()
        self.city_pop[bidx, row, col] = torch.where(starve, (pop - 1).clamp(min=1), pop)

    def _seat_city_produce(self, row: int, col: torch.Tensor, act: torch.Tensor,
                           prod: torch.Tensor) -> None:
        """The queue head's turn — the production add, the banked chop, the
        completion and every completion's payout. ONE body, every seat row, at
        the per-city seatPhase position (after growth, before border growth).

        The GPU queue is depth ONE: `city_current < 0` IS an empty queue, so a
        completion always banks its overflow rather than carrying it (the TS
        twin declares the same loss — banked overflow pays a turn late).

        Row 0 ran a short copy of this that knew settlers, units, buildings and
        districts only. Three things fell through it: a seat-0 WONDER completed
        into nothing (the head cleared, the overflow banked, the wonder was
        never registered and no era score was paid), a seat-0 PROJECT paid no
        yield, no great-person points and no space-race step, and the head's
        `city_cost` was left standing where TS reads 0 off an empty queue."""
        bidx = self._bidx
        cur = self.city_current[bidx, row, col].clone()
        has_q = act & (cur >= 0)
        if not bool(has_q.any()):
            return
        # The seat's own encampmentProdMult, on the queue head only: the
        # multiplier keys on the ITEM (an Encampment district or one of its
        # buildings), not on the seat. A building head is its own production
        # column (0..NB-1) on every row, so one decode serves every seat.
        if self._gov_has_effects and self._encamp_didx >= 0:
            em = self._gov_mods(row)[5]
            enc_i = (cur >= 0) & (cur < self.NB) & (
                self._b_req_district[cur.clamp(min=0, max=self.NB - 1)] == self._encamp_didx)
            if self._encamp_si >= 0:
                enc_i = enc_i | (cur == self.DISTRICT_BASE + self._encamp_si)
            prod = torch.where(enc_i, prod * em, prod)
        # VETERANCY multiplies FIRST, then the banked chop adds unmultiplied —
        # phase.ts spends the bank right after the production add.
        prog = self.city_progress[bidx, row, col]
        bank = self.city_prod_bank[bidx, row, col]
        self.city_progress[bidx, row, col] = torch.where(has_q, prog + prod + bank, prog)
        self.city_prod_bank[bidx, row, col] = torch.where(has_q, torch.zeros_like(bank), bank)
        cost = self.city_cost[bidx, row, col].clone()  # the project lump reads the LOCKED cost
        done = has_q & (self.city_progress[bidx, row, col] >= cost)
        if not bool(done.any()):
            return
        # queue.shift() — the head clears BEFORE completeQueueItem runs, and an
        # empty queue reads cost 0 on the TS side of the digest.
        self.city_current[bidx, row, col] = torch.where(done, torch.full_like(cur, -1), self.city_current[bidx, row, col])
        ovf = (self.city_progress[bidx, row, col] - cost).clamp(min=0)
        self.city_prod_bank[bidx, row, col] = torch.where(done, self.city_prod_bank[bidx, row, col] + ovf, self.city_prod_bank[bidx, row, col])
        self.city_progress[bidx, row, col] = torch.where(done, torch.zeros_like(prog), self.city_progress[bidx, row, col])
        self.city_cost[bidx, row, col] = torch.where(done, torch.zeros_like(cost), cost)
        ctr = self.city_center[bidx, row, col]

        # --- SETTLER: a unit like any other. It spawns at the city and the city
        # pays 1 pop (floored at 1); WHERE it founds is a later FOUND_CITY order.
        made_s = done & (cur == self.SETTLER)
        if bool(made_s.any()):
            pop = self.city_pop[bidx, row, col]
            self.city_pop[bidx, row, col] = torch.where(made_s, (pop - 1).clamp(min=1), pop)
            if self._settler_idx >= 0:
                self._spawn_unit(row, made_s, ctr, self._settler_idx)

        # --- UNITS. _spawn_unit reads the roster's civilian bit itself, so the
        # Builder and the Military Engineer arrive with their charges and a
        # civilian's 0 xp through this one call; a military unit inherits the
        # city's best Encampment training tier.
        made_u = done & (cur >= self.UNIT_BASE) & (cur < self.UNIT_BASE + self.NU)
        if bool(made_u.any()):
            ui = (cur - self.UNIT_BASE).clamp(min=0, max=self.NU - 1)
            xp = (self.city_bldg[bidx, row, col, :].long() * self._b_train_xp.reshape(1, -1)).max(dim=1).values
            self._spawn_unit(row, made_u, ctr, ui, init_xp=xp)
            if self._builder_idx >= 0:
                # a completed builder moves this seat's cost escalator
                made_b = made_u & (ui == self._builder_idx)
                self.civ_builders_trained[:, row] = self.civ_builders_trained[:, row] + made_b.long()

        # --- DISTRICT: the paved tile completes (reserved at queue time in
        # city_qtile) and an Encampment musters its garrison.
        made_d = done & (cur >= self.DISTRICT_BASE) & (cur < self.WONDER_BASE)
        if bool(made_d.any()):
            dr = made_d.nonzero(as_tuple=True)[0]
            dt = self.city_qtile[bidx, row, col][dr].clamp(min=0)
            self.district_complete[dr, dt] = True
            # MONUMENTALITY pays era score per SPECIALTY district completed
            # (a city centre is never queued here).
            mon = torch.zeros(self.B, dtype=torch.bool, device=self.device)
            mon[dr] = True
            self._dedication_event(row, 0, mon)
            enc = self.district[dr, dt] == self._encamp_didx
            self.encamp_hp[dr, dt] = torch.where(enc, torch.full_like(dt, self._encamp_hp_max), self.encamp_hp[dr, dt])
            self.city_qtile[bidx, row, col] = torch.where(made_d, torch.full_like(cur, -1), self.city_qtile[bidx, row, col])
            self._eff_version += 1

        # --- BUILDING: it joins the registry (bounded above — district,
        # wonder and project codes all sit past NB).
        made_b2 = done & (cur >= 0) & (cur < self.NB)
        if bool(made_b2.any()):
            br = made_b2.nonzero(as_tuple=True)[0]
            bi = cur.clamp(min=0, max=self.NB - 1)
            self.city_bldg[br, row, col[br], bi[br]] = True
            # A completed REGIONAL building reaches OTHER cities' yields, so
            # the caches must see the write even though this turn's own walk
            # reads the loop-top snapshot.
            self._eff_version += 1
            if self._walls_bidx >= 0:
                # ANCIENT_WALLS fills the outer pool
                wm = br[bi[br] == self._walls_bidx]
                if len(wm) > 0:
                    self.city_outer_hp[wm, row, col[wm]] = self._walls_hp

        # --- WONDER: the tile completes (effects read built_wonder_complete
        # live off the registry) and the seat banks the era score.
        if self._wond_n:
            made_w = done & (cur >= self.WONDER_BASE) & (cur < self.WONDER_BASE + self._wond_n)
            if bool(made_w.any()):
                wr = made_w.nonzero(as_tuple=True)[0]
                wi = (cur - self.WONDER_BASE).clamp(min=0)
                wt = self.city_wonder[bidx, row, col, :][wr, wi[wr]]
                self.built_wonder_complete[wr, wt.clamp(min=0)] = True
                self.era_score[wr, row] += self._era_pts["wonder"]
                self._eff_version += 1

        # --- PROJECT: js_round(cost × frac) into the seat's own streams plus
        # the great-person points (the completeProject twin).
        if self._proj_rows:
            made_p = done & (cur >= self.PROJECT_BASE) & (cur < self.PROJECT_BASE + len(self._proj_rows))
            if bool(made_p.any()):
                pi = (cur - self.PROJECT_BASE).clamp(min=0)
                amt_y = js_round(cost * self._proj_yf)
                for pidx, prow in enumerate(self._proj_rows):
                    hit = made_p & (pi == pidx)
                    if not bool(hit.any()):
                        continue
                    y_i = int(prow.get("y", -1))
                    if y_i == 3:
                        self.civ_tech_prog[:, row] = torch.where(hit, self.civ_tech_prog[:, row] + amt_y, self.civ_tech_prog[:, row])
                    elif y_i == 4:
                        self.civ_civic_prog[:, row] = torch.where(hit, self.civ_civic_prog[:, row] + amt_y, self.civ_civic_prog[:, row])
                    elif y_i == 2:
                        self.civ_treasury[:, row] = torch.where(hit, self.civ_treasury[:, row] + amt_y, self.civ_treasury[:, row])
                    elif y_i == 5:
                        self.civ_faith[:, row] = torch.where(hit, self.civ_faith[:, row] + amt_y, self.civ_faith[:, row])
                    # Pay EVERY listed class at THIS row's rate — the Festival
                    # pays Writer/Artist/Musician at 0.11 each, every other
                    # project one class at 0.22. `gs`/`gf` fall back to a
                    # single `g` + the global fraction when the row omits them.
                    amt_g = js_round(cost * float(prow.get("gf", self._proj_gf)))
                    g_list = prow.get("gs")
                    if not g_list:
                        g_one = int(prow.get("g", -1))
                        g_list = [g_one] if g_one >= 0 else []
                    for g_i in (int(x) for x in g_list):
                        if 0 <= g_i < self.civ_gpp.shape[2]:
                            self.civ_gpp[:, row, g_i] = torch.where(hit, self.civ_gpp[:, row, g_i] + amt_g, self.civ_gpp[:, row, g_i])
                    # A space-race step records chain progress; completing the
                    # VICTORY step ends the game — a seat-0 win when seat 0
                    # flies it, a seat-0 DEFEAT when a rival does (the
                    # domination mirror). Space rows carry y=g=-1, so the
                    # yield/GPP blocks above are no-ops for them.
                    if int(prow.get("sp", 0)):
                        self.space_done[hit, row, self._space_step[pidx]] = True
                        if pidx in self._space_victory_idx:
                            vt = 3 if row == 0 else 4
                            self.victory_type.copy_(torch.where(hit, torch.full_like(self.victory_type, vt), self.victory_type))
                            self.game_over.logical_or_(hit)

    def _seat_city_fire_and_heal(self, row: int, col: torch.Tensor, act: torch.Tensor) -> None:
        """A city's WALLS strike, its ADDITIONAL Encampment strike and the
        unbesieged heal — ONE body, every seat row, at the per-city position
        game.ts's seatPhase uses (right after border growth, before the next
        city's block).

        DRAW ORDER: walls first, then Encampment, then the heal, per city. A
        city holding both rolls twice, and a walls kill removes a target the
        Encampment roll would have taken.

        There is no second application anywhere: the seat-0 copy that used to
        run inside barbarianPhase is gone from BOTH engines. Real Civ 6 fires
        and heals a city in its OWNER's turn, once."""
        Bn, dev2 = self.B, self.device
        bidx = torch.arange(Bn, device=dev2)
        heal = int(self.rules.combat.get("cityHealPerTurn", 20))
        walled = None
        if self._walls_bidx >= 0:
            walled = act & self.city_bldg[bidx, row, col, self._walls_bidx]
            self._seat_city_strike(row, col, walled, "cstk")
        enc_reg = e0 = None
        if self._encamp_didx >= 0 and self.districts_on:
            # the city's OWN registry, which a capture clears — the districts
            # walk TS makes.
            enc_reg = self.city_dist_tile[bidx, row, col, self._encamp_didx]  # [B]
            e0 = enc_reg.clamp(min=0)
            enc_live = (enc_reg >= 0) & self.district_complete[bidx, e0] & ~self.district_pillaged[bidx, e0]
            # `encamp_hp > 0` is part of the FIRING gate but not of the repair
            # gate: an Encampment beaten to 0 is occupied and shoots nothing,
            # yet it still heals back.
            self._seat_city_strike(row, col, act & enc_live & (self.encamp_hp[bidx, e0] > 0), "estk")
        # A SIEGE pins the HP: any adjacent unit hostile to this seat —
        # civilians included, per unitsHostile — read live at this point.
        ctr = self.city_center[bidx, row, col].clamp(min=0)
        nbh = self.neigh[ctr]  # [B, 6]
        nbc = nbh.clamp(min=0)
        _am = self.military_at.gather(1, nbc)
        _ac = self.civilian_at.gather(1, nbc)
        _as = torch.where(_am >= 0, self.unit_seat.gather(1, _am.clamp(min=0)), torch.full_like(_am, -1))
        _acs = torch.where(_ac >= 0, self.unit_seat.gather(1, _ac.clamp(min=0)), torch.full_like(_ac, -1))
        besieged = ((self._seats_hostile(row, _as) | self._seats_hostile(row, _acs)) & (nbh >= 0)).any(dim=1)
        ok = act & ~besieged
        # Unbesieged cities heal the flat rate, war or not (real Civ 6). The
        # outer wall pool heals on the SAME gate and rate, full-HP or not.
        hp = self.city_hp[bidx, row, col]
        self.city_hp[bidx, row, col] = torch.where(
            ok, (hp + heal).clamp(max=int(self.rules.combat.get("cityMaxHp", 200))), hp)
        if walled is not None:
            oh = self.city_outer_hp[bidx, row, col]
            self.city_outer_hp[bidx, row, col] = torch.where(
                ok & self.city_bldg[bidx, row, col, self._walls_bidx], (oh + heal).clamp(max=self._walls_hp), oh)
        if e0 is not None:
            # The Encampment garrison repairs on the same gate and rate — the
            # gate is the CITY's siege state, not the district's own adjacency.
            rep = ok & (enc_reg >= 0) & self.district_complete[bidx, e0] & ~self.district_pillaged[bidx, e0]
            cur = self.encamp_hp[bidx, e0]
            self.encamp_hp[bidx, e0] = torch.where(rep, (cur + heal).clamp(max=self._encamp_hp_max), cur)

    def _seat_research_tail(self, row: int, active: torch.Tensor, sci_sum: torch.Tensor,
                            cul_sum: torch.Tensor, gold_sum: torch.Tensor,
                            faith_sum: torch.Tensor) -> None:
        """The seat block's TAIL, for seat row `row` — ONE body every seat runs.

        In seatPhase order: bank this turn's city sums (science, gold, faith),
        pay unit upkeep, complete techs, drain a dead tech bank, accrue TOURISM,
        DIPLOMATIC FAVOR and the grievance decay, bank culture, complete civics,
        drain a dead civic bank, then the great-people and belief races.

        POSITION IS LOAD-BEARING between tourism and the civics: the wonder
        term reads the seat's ERA off completed research, so tourism must sit
        AFTER this turn's tech completions and BEFORE any civic completes.

        The sums arrive from the caller's city walk because that walk is where
        game.ts computes them, per city, in slot order — the float association
        is part of the contract."""
        rdv = self.rules_dev

        def bank(plane: torch.Tensor, add: torch.Tensor) -> None:
            """`plane[:, row] += add` where the seat is active. Written as ONE
            expression so no row accumulates at a different precision: the sum
            adds at ITS dtype and the store casts, on every row alike."""
            plane[:, row] = plane[:, row] + torch.where(active, add, torch.zeros_like(add))

        bank(self.civ_tech_prog, sci_sum)
        # LIFETIME science — Seat.scienceTotal's twin, beside the stream add.
        bank(self.seat_science_total, sci_sum)
        bank(self.civ_treasury, gold_sum)
        bank(self.civ_faith, faith_sum)
        # Unit upkeep + the bankruptcy rule, right after the gold lands and
        # before any war march.
        self._seat_upkeep_and_bankruptcy(row, active)
        for _ in range(RESEARCH_LOOPS):
            curt = self.civ_cur_tech[:, row]
            # a boosted tech completes at the discounted cost (_eff_cost —
            # identical rounding to effectiveResearchCostIn)
            cost_t = self._eff_cost(
                rdv.t_cost.gather(0, curt.clamp(min=0)),
                self.civ_tech_boosted[:, row].gather(1, curt.clamp(min=0).unsqueeze(1)).squeeze(1),
                golden_civ=row,  # golden FREE_INQUIRY, per seat
            )
            fin = active & (curt >= 0) & (self.civ_tech_prog[:, row] >= cost_t)
            if not bool(fin.any()):
                break
            rows = fin.nonzero(as_tuple=True)[0]
            self.civ_techs[rows, row, curt[rows]] = True
            # ANY tech completion bumps: unlocks feed _seat_buildable, and the
            # mine-boost/Replaceable-Parts techs feed the yield/score caches.
            self._eff_version += 1
            self.civ_tech_prog[:, row] = torch.where(fin, self.civ_tech_prog[:, row] - cost_t, self.civ_tech_prog[:, row])
            self.civ_cur_tech[:, row] = torch.where(fin, torch.full_like(curt, -1), self.civ_cur_tech[:, row])
        # Banked progress only drains once the tree is exhausted (advanceResearch:
        # progress banks while the slot is undecided).
        no_t = active & (self.civ_cur_tech[:, row] == -1) & ~self._available_mask(self.civ_techs[:, row], self._prereq_t).any(dim=1)
        self.civ_tech_prog[:, row] = torch.where(no_t, torch.minimum(self.civ_tech_prog[:, row], torch.zeros_like(self.civ_tech_prog[:, row])), self.civ_tech_prog[:, row])
        # TOURISM — once per turn at the seat level, in the load-bearing slot.
        bank(self.civ_tourism, self._tourism_of(
            self.city_gw_writing[:, row],
            self.city_gw_art[:, row],
            self.city_gw_music[:, row],
            self.city_alive[:, row],
            self.tile_seat == row,
            self._civ_era(self.civ_techs[:, row], self.civ_civics[:, row]),
            self.city_relics[:, row],
            self.civ_techs[:, row, self._gw_printing_tech] if self._gw_printing_tech >= 0 else None,
            self.city_artifacts[:, row],
        ))
        # DIPLOMATIC FAVOR — government TIER + suzerainties.
        bank(self.civ_diplo_favor,
             self._adopted_gov_tier(self.civ_civics[:, row]) + self._favor_per_suz * self._suzerain_count(row))
        # grievances DECAY by 1 per turn at peace with every MAJOR — the row's
        # own line of the war matrix, minus the city-state columns (TS's
        # atWarWithAny reads Seat.wars, the majors' list).
        at_peace = ~self.war[:, row, :1 + self.R].any(dim=1)
        self.civ_warmonger[:, row] = torch.where(
            active & at_peace & (self.civ_warmonger[:, row] > 0),
            self.civ_warmonger[:, row] - 1,
            self.civ_warmonger[:, row],
        )
        bank(self.civ_civic_prog, cul_sum)
        # LIFETIME culture — the cultureTotal twin, immediately after
        # civicProgress takes the same sum. Draws no RNG.
        bank(self.civ_culture, cul_sum)
        for _ in range(RESEARCH_LOOPS):
            curc = self.civ_cur_civic[:, row]
            cost_c = self._eff_cost(
                rdv.c_cost.gather(0, curc.clamp(min=0)),
                self.civ_civic_boosted[:, row].gather(1, curc.clamp(min=0).unsqueeze(1)).squeeze(1),
                golden_civ=row, is_civic=True,  # golden PEN_BRUSH_AND_VOICE
            )
            fin = active & (curc >= 0) & (self.civ_civic_prog[:, row] >= cost_c)
            if not bool(fin.any()):
                break
            rows = fin.nonzero(as_tuple=True)[0]
            self.civ_civics[rows, row, curc[rows]] = True
            self._eff_version += 1  # Feudalism moves this seat's farm-adj plane
            self.civ_civic_prog[:, row] = torch.where(fin, self.civ_civic_prog[:, row] - cost_c, self.civ_civic_prog[:, row])
            self.civ_cur_civic[:, row] = torch.where(fin, torch.full_like(curc, -1), self.civ_cur_civic[:, row])
        no_c = active & (self.civ_cur_civic[:, row] == -1) & ~self._available_mask(self.civ_civics[:, row], self._prereq_c).any(dim=1)
        self.civ_civic_prog[:, row] = torch.where(no_c, torch.minimum(self.civ_civic_prog[:, row], torch.zeros_like(self.civ_civic_prog[:, row])), self.civ_civic_prog[:, row])
        # Great-people race (advanceGreatPeople), then the BELIEF RACES
        # (pantheon / religion / enhancer, #73) — the loop position every seat
        # shares.
        self._advance_great_people(row, active)
        self._seat_belief_claims(row, active)

    def _advance_great_people(self, row: int, active: torch.Tensor) -> None:
        """advanceGreatPeople(state, seat) — ONE body for every seat row
        (0 = seat 0, r+1 = civ r), at the shared loop position after the
        research tail. Accrual per class: 1 + beliefGppFlat + (that
        district's built buildings) per city owning a COMPLETED unpillaged
        district of the class, read through the seat-axis registry
        (captured districts never ENTER a registry, so the tile plane's
        district_dead needs no gate here). Claims come from the SHARED
        earned pool at gpCost(earned), overflow kept; effects land in this
        row's own streams (tech/civic progress, treasury, faith, the
        capital's build head); WRITER/ARTIST/MUSICIAN culture slots Great
        Works; GENERAL/ADMIRAL spawn at the capital; a PROPHET banks for
        the belief races. No RNG draws."""
        if self._gp_nc == 0:
            return
        B, dev = self.B, self.device
        for cls in range(self._gp_nc):  # all GP classes (incl Admiral/General)
            # Accrual = 1 + (that district's buildings) per city owning a
            # COMPLETED district of the class, so a seat accrues nothing
            # until its first Campus/Holy Site/Commercial Hub completes.
            d_cls = int(self._gp_class_district[cls]) if cls < self._gp_nc else -1
            if d_cls >= 0 and self.districts_on:
                reg_c = self.city_dist_tile[:, row, :, d_cls]  # [B, cols]
                comp_c = (reg_c >= 0) & self.district_complete.gather(1, reg_c.clamp(min=0)) & ~self.district_pillaged.gather(1, reg_c.clamp(min=0))  # a pillaged district earns no GPP
                bmask_c = (self.rules_dev.b_req_district == d_cls).reshape(1, 1, -1)
                nb_of = (self.city_bldg[:, row] & bmask_c).sum(dim=2)  # [B, cols]
                # Divine Spark: the belief's flat GPP joins the per-city
                # term (1 + gppFlat + buildings), the
                # greatPersonPointsPerTurn form.
                if self._bel_any and cls < self._bel["pan"]["gpp"].shape[1]:
                    gflat = self._bel_add("gpp", row)[:, cls].double().unsqueeze(1)  # [B, 1]
                else:
                    gflat = torch.zeros(B, 1, dtype=torch.float64, device=dev)
                pts = (comp_c.double() * (1.0 + gflat + nb_of.double())).sum(dim=1)
            else:
                pts = torch.zeros(B, dtype=torch.float64, device=dev)
            # Golden EXODUS pays +4 PROPHET points a turn, seat-wide and
            # district-free — greatPersonPointsPerTurn adds it OUTSIDE its
            # per-city loop, so it joins `pts` before the `pts > 0` guard,
            # not after.
            if cls == self._prophet_cls:
                pts = pts + self._golden_ded(row, self._ded_exodus).double() * 4.0
            self.civ_gpp[:, row, cls] = torch.where(
                active & (pts > 0), self.civ_gpp[:, row, cls] + pts, self.civ_gpp[:, row, cls]
            )
            # Claim loop: overflow is KEPT (gpp −= cost, not zeroed) and
            # the person's effect lands in this seat's own streams,
            # mirroring applyGreatPersonEffect. PROPHETs gate the religion.
            maxN = self._gp_effects.shape[1]
            for _ in range(maxN):
                earned_c = self.gp_earned[:, cls]
                has_person = earned_c < self._gp_roster[cls]
                gcost = self._gp_costs[earned_c.clamp(max=self._gp_costs.shape[0] - 1)]
                hit = active & has_person & (self.civ_gpp[:, row, cls] >= gcost)
                if not bool(hit.any()):
                    break
                hf = hit.to(torch.float64)
                eff = self._gp_effects[cls, earned_c.clamp(max=maxN - 1)]  # [B, 5]
                self.civ_tech_prog[:, row] = self.civ_tech_prog[:, row] + eff[:, 0].double() * hf
                # WRITER/ARTIST/MUSICIAN culture is slotted as Great Works
                # into this seat's cities (deferred per-kind culture);
                # overflow charges fall back to the instant lump inside
                # _place_works.
                _kind = self._gw_cls.index(cls) if cls in self._gw_cls else -1
                if _kind >= 0:
                    self._place_works(row, hit, eff[:, 1].double(), _kind)
                else:
                    self.civ_civic_prog[:, row] = self.civ_civic_prog[:, row] + eff[:, 1].double() * hf
                self.civ_treasury[:, row] = self.civ_treasury[:, row] + eff[:, 2].double() * hf
                prod_fx = eff[:, 3].double() * hf
                if bool((prod_fx != 0).any()):
                    # The capital's build head (cities.find(isCapital),
                    # queue non-empty). city_is_cap identifies it because
                    # compaction can move the capital off slot 0; at most
                    # one flag per (b, row), so the masked add lands on
                    # exactly the capital's head or nowhere.
                    _capa = self.city_is_cap[:, row] & self.city_alive[:, row]
                    capm = _capa & (self.city_current[:, row] >= 0)
                    self.city_progress[:, row] = self.city_progress[:, row] + torch.where(capm, prod_fx.unsqueeze(1), torch.zeros_like(self.city_progress[:, row]))
                    # the phase.ts twin: bank it rather than drop it when
                    # the capital has nothing queued
                    _capb = _capa & (self.city_current[:, row] < 0)
                    self.city_prod_bank[:, row] = self.city_prod_bank[:, row] + torch.where(
                        _capb, prod_fx.unsqueeze(1), torch.zeros_like(self.city_prod_bank[:, row]))
                if self._gp_effects.shape[2] > 4:
                    self.civ_faith[:, row] = self.civ_faith[:, row] + eff[:, 4].double() * hf
                if cls == self._prophet_cls:
                    self.civ_prophets[:, row] = self.civ_prophets[:, row] + hit.long()
                self.civ_gpp[:, row, cls] = torch.where(hit, self.civ_gpp[:, row, cls] - gcost, self.civ_gpp[:, row, cls])
                self.gp_earned[:, cls] = self.gp_earned[:, cls] + hit.long()
                self.era_score[:, row] += hit.long() * self._era_pts["gp"]  # per GP earned
                # A GENERAL/ADMIRAL claim spawns its support unit
                # (civilian, 4 MP) at the seat's capital (city_is_cap
                # center), on top of the instant effect — the phase.ts
                # spawn-at-claim mirror. Draws no RNG.
                if (cls == self._general_cls and self._general_unit_idx >= 0) or (cls == self._admiral_cls and self._admiral_unit_idx >= 0):
                    guidx = self._general_unit_idx if cls == self._general_cls else self._admiral_unit_idx
                    if bool(hit.any()):
                        cap_t = torch.where(self.city_is_cap[:, row] & self.city_alive[:, row], self.city_center[:, row], torch.full_like(self.city_center[:, row], -1)).max(dim=1).values
                        self._spawn_unit(row, hit & (cap_t >= 0), cap_t, guidx)
                        self._gen_ver += 1

    def _seat_belief_claims(self, row: int, active: torch.Tensor) -> None:
        """The BELIEF RACES for ONE seat row (0 = seat 0, r+1 = civ r), at the
        loop position right after the GP race. The picks' IDENTITIES matter:
        the effects apply to this seat. The draw takes the k-th OPEN id in
        data order — open[floor(rand * open.length)], the open list filtering
        the claimed pool. The pantheon costs pantheonFaithCost from this
        seat's own faith (deducted only when a pick lands); religion needs
        the canFoundReligion gates — pantheon, completed Holy Site (the
        seat-axis registry), an earned Prophet; the enhancer a SECOND
        Prophet. Each draw advances only where its own open-mask fires, so
        the RNG stream stays aligned with the TS block turn by turn."""
        rr, B, dev = self.rules.seats, self.B, self.device
        pfc = float(rr.get("pantheonFaithCost", 25))
        pdue = active & ~self.civ_pantheon_done[:, row] & (self.civ_faith[:, row] >= pfc)
        popen = pdue & (self.pantheon_claimed_n < rr.get("pantheonPool", 8))
        rp_ = self._next_random(popen)
        if bool(popen.any()) and self._bel_any:
            n_open = (~self.pan_claimed).sum(dim=1)
            k = torch.floor(rp_ * n_open.to(torch.float64)).to(torch.long)
            cum = (~self.pan_claimed).long().cumsum(dim=1)
            sel = (~self.pan_claimed) & (cum == (k + 1).unsqueeze(1))
            pid = sel.long().argmax(dim=1)
            prow = popen.nonzero(as_tuple=True)[0]
            self.pan_claimed[prow, pid[prow]] = True
            self.civ_pantheon[prow, row] = pid[prow]
            self._bel_version += 1  # belief change -> _bel_add / _belief_feat_plane invalidate
        self.civ_faith[:, row] = torch.where(popen, self.civ_faith[:, row] - pfc, self.civ_faith[:, row])
        self.pantheon_claimed_n.add_(popen.long())
        self.civ_pantheon_done[:, row] = self.civ_pantheon_done[:, row] | popen
        self.era_score[:, row] += popen.long() * self._era_pts["pantheon"]
        d_hs = int(self._gp_class_district[self._prophet_cls]) if self._prophet_cls < self._gp_nc else -1
        if d_hs >= 0 and self.districts_on:
            reg_hs = self.city_dist_tile[:, row, :, d_hs]  # [B, cols]
            has_hs = ((reg_hs >= 0) & self.district_complete.gather(1, reg_hs.clamp(min=0))).any(dim=1)
        else:
            has_hs = torch.zeros(B, dtype=torch.bool, device=dev)
        rdue = active & ~self.civ_religion_done[:, row] & self.civ_pantheon_done[:, row] & (self.civ_prophets[:, row] > 0) & has_hs
        ropen = rdue & (self.claimed_f_n < rr.get("followerPool", 8)) & (self.claimed_o_n < rr.get("founderPool", 8))
        rf_ = self._next_random(ropen)  # follower first, founder second — the TS draw order
        ro_ = self._next_random(ropen)
        if bool(ropen.any()) and self._bel_any:
            orow = ropen.nonzero(as_tuple=True)[0]
            for claimed_m, ids_t, rnd in ((self.fol_claimed, self.civ_follower, rf_), (self.fou_claimed, self.civ_founder, ro_)):
                n_open = (~claimed_m).sum(dim=1)
                k = torch.floor(rnd * n_open.to(torch.float64)).to(torch.long)
                cum = (~claimed_m).long().cumsum(dim=1)
                sel = (~claimed_m) & (cum == (k + 1).unsqueeze(1))
                bid = sel.long().argmax(dim=1)
                claimed_m[orow, bid[orow]] = True
                ids_t[orow, row] = bid[orow]
            self._bel_version += 1  # follower/founder change -> _bel_add / _belief_feat_plane invalidate
        self.claimed_f_n.add_(ropen.long())
        self.claimed_o_n.add_(ropen.long())
        self.civ_religion_done[:, row] = self.civ_religion_done[:, row] | ropen
        self.era_score[:, row] += ropen.long() * self._era_pts["religion"]
        # Freeze this religion's holy tile at founding — it is the pressure
        # source. civ_religion_done latches, so ropen fires once and the tile
        # never re-writes. The tile is the LIVE capital at founding time,
        # else the FIRST LIVE CITY (`cities.find(isCapital) ?? cities[0]`);
        # a static capital tile would go stale when the capital fell before
        # founding. The city planes are still split by row (the city-block
        # base unification collapses this branch).
        if row == 0:
            _alv = self.alive
            _cap = self.is_cap & _alv
            _ctr = self.site
        else:
            _alv = self.civ_city_alive[:, row - 1]
            _cap = self.civ_city_is_cap[:, row - 1] & _alv
            _ctr = self.civ_city_center[:, row - 1]
        _h_slot = torch.where(_cap.any(dim=1), _cap.long().argmax(dim=1), _alv.long().argmax(dim=1))
        _holy = _ctr.gather(1, _h_slot.unsqueeze(1)).squeeze(1)
        _holy = torch.where(_alv.any(dim=1), _holy, torch.full_like(_holy, -1))  # ?? null
        self.holy_tile[:, row] = torch.where(ropen, _holy, self.holy_tile[:, row])

        # Enhance the founded religion: a SECOND earned Prophet claims an
        # enhancer belief, denying it from the shared pool (the mirror of
        # the follower/founder claim). The draw sits AFTER the founder
        # draw, gated on religionFounded && !enhancerClaimed &&
        # prophets >= 2 && pool-open, and advances only where eopen, so it
        # is RNG-neutral when it never fires. The effects are live: presR
        # (pressure range), tradeRel (route income), cnear/cdef/cvs
        # (combat CS) read civ_enhancer through the _enh tables.
        edue = active & self.civ_religion_done[:, row] & ~self.civ_enhancer_done[:, row] & (self.civ_prophets[:, row] >= 2)
        eopen = edue & (self.claimed_e_n < rr.get("enhancerPool", 0))
        re_ = self._next_random(eopen)  # third belief draw — after follower/founder
        if bool(eopen.any()) and self._enh_any:
            erow = eopen.nonzero(as_tuple=True)[0]
            n_open = (~self.enh_claimed).sum(dim=1)
            k = torch.floor(re_ * n_open.to(torch.float64)).to(torch.long)
            cum = (~self.enh_claimed).long().cumsum(dim=1)
            sel = (~self.enh_claimed) & (cum == (k + 1).unsqueeze(1))
            eid = sel.long().argmax(dim=1)
            self.enh_claimed[erow, eid[erow]] = True
            self.civ_enhancer[erow, row] = eid[erow]
            self._bel_version += 1  # an enhancer claim moves the belief epoch too
        self.claimed_e_n.add_(eopen.long())
        self.civ_enhancer_done[:, row] = self.civ_enhancer_done[:, row] | eopen

    #: Every per-slot plane a captured unit must carry. One list, so a NEW
    #: plane cannot be silently forgotten by a capture. Ownership-reset planes
    #: are named separately below rather than copied.
    _CAPTURE_CARRY = ("type", "hp", "charges", "emb", "xp", "mp_full")
    #: Reset on an ownership change: a captured civilian never fortifies, never
    #: auras, and has movesLeft = 0 (acted) so the heal skips it this turn.
    _CAPTURE_RESET = {"fortify": 0, "aura_mp": 0, "mp": 0}

    def _carry_capture(self, rows: torch.Tensor, src: torch.Tensor, dst: torch.Tensor) -> None:
        """Move a unit's per-slot state from MERGED slot `src` to `dst`.

        One loop over _CAPTURE_CARRY instead of a hand-written block per
        capture path. Reads are taken BEFORE any write, so src and dst may be
        in the same pool.
        """
        vals = {k: getattr(self, f"unit_{k}")[rows, src].clone() for k in self._CAPTURE_CARRY}
        for k, v in vals.items():
            getattr(self, f"unit_{k}")[rows, dst] = v
        for k, v in self._CAPTURE_RESET.items():
            getattr(self, f"unit_{k}")[rows, dst] = v

    def _reclaim_due(self, pool: str) -> bool:
        """Has this pool's append head come within `_reclaim_headroom` of its
        OWN cap? One headroom serves both windows, so the two sizes need no
        threshold each. CIV6_RECLAIM_AT forces an absolute trigger for the
        forced-compaction gate."""
        hw = int(getattr(self, self.POOL_NEXT[pool]).max())
        if self._reclaim_force_at is not None:
            return hw >= self._reclaim_force_at
        return hw >= (self.POOL_HI[pool] - self.POOL_LO[pool]) - self._reclaim_headroom

    def _reclaim_pool(self, prefix: str) -> None:
        """Stably compacts a unit pool when its high-water nears the cap.

        TS arrays SPLICE dead units, so the LIVING's relative order IS the
        spec — a stable compaction preserves it exactly (slot loops visit the
        same units in the same order; draws unchanged). Tile->slot maps remap
        by VALUE through the inverse permutation, needing no semantic rebuild.
        CIV6_RECLAIM_AT lowers the trigger for forced-compaction gates."""
        # The field list is DERIVED from the pool's plane list, never
        # transcribed — a hand-written list drifts and silently leaves a plane
        # behind at the old slot index. `alive` permutes separately.
        counter = self.POOL_NEXT[prefix]
        maps: list = []
        fields = [f"{prefix}_unit_{pl}" for pl in self._UNIT_PLANES if pl != "alive"]
        alive = getattr(self, f"{prefix}_unit_alive")
        B, U = alive.shape
        perm = torch.argsort((~alive).long(), dim=1, stable=True)  # living first, order kept
        inv = torch.empty_like(perm)
        inv.scatter_(1, perm, torch.arange(U, device=alive.device).unsqueeze(0).expand(B, -1))
        # Write the permutation IN PLACE: p_/v_/u_ are VIEWS of one merged pool
        # tensor, so a setattr rebind would swap in fresh storage and orphan
        # every alias. gather() cannot target itself, hence the temporary.
        for name in fields:
            t = getattr(self, name)
            t.copy_(t.gather(1, perm))
        alive.copy_(alive.gather(1, perm))
        getattr(self, counter).copy_(alive.sum(dim=1))
        for m in maps:
            at = getattr(self, m)
            at.copy_(torch.where(at >= 0, inv.gather(1, at.clamp(min=0)), at))
        # The merged maps hold MERGED slots, so the inverse permutation applies
        # only to entries inside THIS pool's range.
        lo, hi = self.POOL_LO[prefix], self.POOL_HI[prefix]
        for m in ("military_at", "civilian_at"):
            at = getattr(self, m)
            mine = (at >= lo) & (at < hi)
            # gather evaluates EVERY lane, including the ones torch.where
            # discards, so the index must be clamped to inv's width — a slot
            # from another pool is out of range by construction.
            at.copy_(torch.where(mine, inv.gather(1, (at - lo).clamp(min=0, max=inv.shape[1] - 1)) + lo, at))

    _CITY_SLOT_FIELDS = (
        "city_alive", "city_center", "city_pop", "city_growth", "city_cbox", "city_loyalty",
        "city_acquired", "city_hp", "city_outer_hp", "city_id", "city_is_cap", "city_current", "city_progress",
        "city_prod_bank",  # banked overflow: it rides the permutation with
                         # city_progress or a compaction hands one city's bank
                         # to its neighbour
        "city_cost", "city_qtile",
        # ALL work counts must ride the compaction permutation; one left out
        # stays at the old slot index, so the city loses its works or inherits
        # its neighbour's.
        "city_gw_writing", "city_gw_art", "city_gw_music", "city_relics", "city_artifacts",
    )
    def _reclaim_cities(self) -> None:
        """Stably compacts city slots per (game, seat row), every major row.

        TS SPLICES seat.cities on capture/flip/transfer and pushes on
        settle/receive, so the LIVING's relative order IS the spec — stable
        compaction preserves it exactly (the per-slot loops, the arange
        tie-breaks and empire-score's sequential association all see the
        same cities in the same order). tile_city needs no rebuild — it is
        id-keyed for every seat (#110) — but centre_slot_at carries SLOT
        VALUES, so live centres re-map through their row's inverse
        permutation. Runs at the step END like _reclaim_pool: the controlled
        head samples slot-keyed city actions from the PRE-step masks, so the
        layout must hold through this step's applies.
        CIV6_RC_RECLAIM_AT lowers the trigger for forced-compaction gates."""
        nrows = 1 + self.R
        alive = self.city_alive[:, :nrows]  # [B, nrows, RC]
        perm = torch.argsort((~alive).long(), dim=2, stable=True)  # living first, order kept
        # In place, for the same reason as _reclaim_pool: these planes are
        # views of one merged city tensor, and a setattr rebind here would
        # orphan every alias at the first compaction.
        for name in self._CITY_SLOT_FIELDS:
            t = getattr(self, name)[:, :nrows]
            t.copy_(t.gather(2, perm))
        for name in ("city_dist_tile", "city_bldg", "city_wonder"):
            t = getattr(self, name)[:, :nrows]
            t.copy_(t.gather(2, perm.unsqueeze(3).expand(-1, -1, -1, t.shape[3])))
        # The religion pair lives on the same seat axis. Both MUST ride the
        # permutation or a compaction hands one city's faith to its neighbour.
        _fol = self.city_followed[:, :nrows]
        _fol.copy_(_fol.gather(2, perm))
        _pre = self.city_pressure[:, :nrows]
        _pre.copy_(_pre.gather(2, perm.unsqueeze(3).expand(-1, -1, -1, _pre.shape[3])))
        # centre_slot_at: the owning row's slot at each live centre, re-mapped
        # through the inverse permutation. This also ends the civ-row
        # staleness latent (AUDIT A-27(2)) — center_at's value-readers see
        # fresh slots after every compaction.
        inv = torch.argsort(perm, dim=2)  # [B, nrows, RC] slot -> new slot
        seat_t = self.tile_seat
        is_major_ctr = (seat_t >= 0) & (seat_t < nrows) & (self.centre_slot_at >= 0)
        rowt = seat_t.clamp(min=0, max=nrows - 1)  # a major's seat IS its block row
        inv_flat = inv.reshape(self.B, -1)
        idx = (rowt * self.RC + self.centre_slot_at.clamp(min=0)).clamp(max=inv_flat.shape[1] - 1)
        self.centre_slot_at.copy_(torch.where(is_major_ctr, inv_flat.gather(1, idx), self.centre_slot_at))
        self._eff_version += 1  # no (row, j)-keyed cache may survive the permutation
        self._tile_owner_ver += 1  # owner / center_at derive slots from permuted state

    def _check_rc_registry_invariant(self) -> None:
        """Machine-checks district/wonder <-> tile-registry coherence for every alive civ city.

        Env-gated via self._civ_city_reg_check, so it costs nothing on the hot path
        when off. Two directions of the tile_city contract:

          (1) FORWARD: every district tile (civ_city_dist_tile) and wonder tile
              (civ_city_wonder) an rc lists registers BACK to that rc — its
              tile_city equals civ_city_id (a district/wonder sits on a tile owned
              by THAT city). A tile registered to a SIBLING fails here.
          (2) BACKWARD: every populated registry cell points at a tile whose
              civ_at is a live civ (no dangling index into re-owned/razed
              land). The registry never lists a tile it does not own.

        Raises AssertionError naming (game, civ, slot, kind, di/wi, tile,
        expected id, actual tile_city) on the first violation."""
        if self.R == 0:
            return
        B = self.B
        for r in range(self.R):
            expect = self.civ_city_id[:, r].unsqueeze(2)  # [B, RC, 1] this rc's id
            alive = self.civ_city_alive[:, r].unsqueeze(2)  # [B, RC, 1]
            for name in ("civ_city_dist_tile", "civ_city_wonder"):
                reg = getattr(self, name)[:, r]  # [B, RC, K] tile per (city, type/slot)
                has = (reg >= 0) & alive
                if not bool(has.any()):
                    continue
                # tile_city at the listed tile, per cell
                rt = self.tile_city.gather(1, reg.clamp(min=0).reshape(B, -1)).reshape_as(reg)  # [B, RC, K]
                ra = self.civ_at.gather(1, reg.clamp(min=0).reshape(B, -1)).reshape_as(reg)
                bad_fwd = has & (rt != expect)  # (1) registers to a sibling / no one
                bad_bwd = has & (ra < 0)        # (2) tile no longer civ-owned
                bad = bad_fwd | bad_bwd
                if bool(bad.any()):
                    idx = bad.nonzero(as_tuple=False)[0]
                    b, j, k = int(idx[0]), int(idx[1]), int(idx[2])
                    tile = int(reg[b, j, k])
                    raise AssertionError(
                        f"A-24 registry incoherence: game={b} civ={r} slot={j} "
                        f"{name}[{k}] tile={tile} expected_id={int(self.civ_city_id[b, r, j])} "
                        f"actual_rc_tile_id={int(self.tile_city[b, tile])} "
                        f"civ_at={int(self.civ_at[b, tile])} turn={self.turn}"
                    )
