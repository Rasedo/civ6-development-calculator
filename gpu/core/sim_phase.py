from __future__ import annotations

from .simbase import *  # noqa: F401,F403 — torch, constants, helpers: the shared floor
from .simbase import _MUTABLE  # noqa: F401 — private names do not ride a star import
from . import simbase  # the PATCHABLE globals (the pool caps/_ALIAS_CHECK) must be read live


class SimPhase:
    def _seat_phase(self) -> None:
        if self.units_mode:
            self._refresh_aura_mp()
            self._reset_mp("major")
        if self.n_majors > 1:
            self._geo_agreements()
        for row in range(self.n_majors):
            self._seat_turn(row)

            # THE UNIT WALK IS NOT THE ECONOMY TURN. `_seat_turn` answers for a
            # seat that owns a CITY; this walk answers for a seat that owns a
            # UNIT, and a settler start owns nothing else. Gating it on the
            # economy's mask locks a city-less seat out of the FOUND verb —
            # the one verb that would give it a city — for the whole game.
            # CIV6: a civ is eliminated when it holds neither a city nor a
            # settler, and until then it takes its turn.
            _dsq = getattr(self, "_driven_useq", None)
            if _dsq is None or row not in _dsq:
                continue
            walk = self.civ_alive[:, row] & self.seat_ext[:, row]
            if not bool(walk.any()):
                continue
            # Replayed unit acts fire HERE, at the walkers' own position in the
            # phase, never before step(): battles DRAW, so they must consume
            # their combat draws at the same position in the stream as the TS
            # in-phase replay. Draw-free actions (production/tech/civic) stay
            # pre-step. The walk branches on the war state at entry (a peace
            # made this turn still runs the war branch, like the TS if/else):
            # a seat at war with ANYONE takes the WAR branch, whose act scans
            # every at-war seat's units and cities.
            atw = walk & self.war[:, row, :self.n_majors].any(dim=1)
            for _rows in (atw, walk & ~atw):
                if bool(_rows.any()):
                    self.apply_seat_unit_sequence(row, torch.where(
                        _rows.view(-1, 1, 1), _dsq[row], torch.full_like(_dsq[row], -1)))

        self._seat_route_cache = None


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
        tt = k.argmin(dim=1)
        strike = fire & (best_key < 10**9)
        if not bool(strike.any()):
            return
        _okm, _okc = hm[bidx, tt], hc[bidx, tt]
        d_slot = torch.where(_okm, _mil[bidx, tt], torch.where(_okc, _civ[bidx, tt], torch.full_like(tt, -1)))
        d_seat = torch.where(_okm, _mseat[bidx, tt], torch.where(_okc, _cseat[bidx, tt], torch.full_like(tt, -1)))
        ds0 = d_slot.clamp(min=0)
        # A MILITARY target whose seat class earns xp — never a barbarian.
        is_vet_mil = _okm & (d_seat != BARB_SEAT)
        d_type = self.unit_type[bidx, ds0]
        _t = torch.ones_like(tt, dtype=torch.bool)
        def_promo = self._promo_cs(
            d_type, self.unit_promos[bidx, ds0],
            attacking=~_t, ranged=_t, vs_city=_t, tile=tt)
        def_cs = self._type_combat[d_type] + self._tdef_i(bidx, tt) + def_promo
        # An embarked target (military or civilian; barbs never embark) → the
        # era's normalized CS, no terrain and no support.
        d_emb = self.unit_emb[bidx, ds0] & (d_slot >= 0)
        if bool(d_emb.any()):
            def_cs = torch.where(d_emb, self._embarked_def_cs(d_seat).to(def_cs.dtype), def_cs)
        gslot = self.military_at[bidx, ctr]
        gar = ((gslot >= 0) & (self.unit_seat[bidx, gslot.clamp(min=0)] == row)).long()
        bm = self.civ_best_melee[:, row]
        atk_cs = (torch.maximum(bm, torch.full_like(bm, 15)) + gar * 5
                  + self._walls_tier_cs[self._walls_tier_row(row, col)])
        if self._gov_has_effects:
            atk_cs = atk_cs + self._gov_mods(row)[12]["crng"].to(atk_cs.dtype)
        # a SURVIVED Military Emergency pays its target +2 CS on every City
        # Strike against a member, forever
        _emg_s = torch.zeros(Bn, dtype=torch.float64, device=dev2)
        for _d in range(self.n_majors):
            _emg_s = _emg_s + (d_seat == _d).double() * self._emergency_strike_cs(row, _d)
        atk_cs = atk_cs + _emg_s.to(atk_cs.dtype)
        def_hp = self.unit_hp[bidx, ds0]
        # a CITY STRIKE is a ranged attack, and "ranged attacks ignore any
        # Support received by the defender"
        def_e = def_cs - self._wound(def_hp)
        _def_seat = torch.where(is_vet_mil, d_seat, torch.full_like(tt, -1))
        _def_nav = torch.where(is_vet_mil, self.unit_naval[d_type.clamp(min=0, max=self.NU - 1)], torch.zeros_like(d_emb))
        def_e = def_e + self._gen_aura_cs(_def_seat, tt, d_emb | _def_nav).to(def_e.dtype)
        self._city_strike_resolve(strike, tt, d_slot, d_seat, _okm, _okc, is_vet_mil,
                                  atk_cs, def_e, def_hp, row, key)

    def _seat_turn(self, row: int) -> torch.Tensor:
        B, dev = self.B, self.device
        active = self.civ_alive[:, row] & self.city_alive[:, row].any(dim=1)
        if not bool(active.any()):
            # TS's eliminated-actor `continue` — but the stashed intents are for
            # THIS turn and must not survive into the next one. Both drains pop
            # unconditionally and apply nothing under an all-False mask.
            army0 = self._seat_army_count(row)
            self._seat_record_apply(row, active)
            self._seat_buy_ladder(row, active, army0)
            return active
        self._drain_relic_reserve(row, active)
        self._ww_decay(row, active)
        # Eurekas/inspirations from this seat — the TS twin runs at the
        # same point (the seat's block top).
        self._detect_seat_boosts(row, active)
        self._seat_influence_phase(row, active)
        self._seat_quest_phase(row, active)
        # ORACLE: TS takes its melee+ranged census at the seat block TOP,
        # BEFORE applySeatActionRecord writes this turn's queue picks — so the
        # buy ladder's quota must read the pre-apply count, not the live one.
        army0 = self._seat_army_count(row)
        self._seat_record_apply(row, active)
        self._seat_buy_ladder(row, active, army0)
        self._seat_trade_phase(row, active)
        alive_c = self.city_alive[:, row].clone()

        sci_sum = torch.zeros(B, dtype=torch.float64, device=dev)
        cul_sum = torch.zeros(B, dtype=torch.float64, device=dev)
        gold_sum = torch.zeros(B, dtype=torch.float64, device=dev)
        faith_sum = torch.zeros(B, dtype=torch.float64, device=dev)
        total, eff, need, tier_idx = self._seat_city_stats(row)
        gov = self._seat_governor_seats(row)
        flip = torch.zeros(B, self.RC, dtype=torch.bool, device=dev)
        # One guard sync for the whole economy loop: alive_c is a pre-loop
        # CLONE (a queue-completion newborn founded inside the loop does not
        # act this turn — the [...actor.cities] discipline above) and `active`
        # is a loop-invariant local.
        cact_all = active.unsqueeze(1) & alive_c  # [B, RC]
        cact_any_l = cact_all.any(dim=0).tolist()
        # The seat's science/turn off the SAME loop-top snapshot, folded in
        # slot order — the Moon Landing lump reads it. TS folds the identical
        # city-stats values in array order, so the f64 association agrees.
        sci_turn = torch.zeros(B, dtype=torch.float64, device=dev)
        for j in range(self.RC):
            if cact_any_l[j]:
                sci_turn = torch.where(cact_all[:, j], sci_turn + total[:, j, 3], sci_turn)
        for j in range(self.RC):
            if not cact_any_l[j]:
                continue
            cact = cact_all[:, j]
            jc = torch.full((B,), j, dtype=torch.long, device=dev)
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
            self._seat_city_growth(row, jc, cact, eff[:, j], need[:, j])
            self._seat_city_produce(row, jc, cact, total[:, j, 1], sci_turn)
            self._seat_border_growth(row, jc, cact, cul_c)
            self._seat_city_fire_and_heal(row, jc, cact)

        self._seat_loyalty_flips(row, flip)
        self._seat_research_tail(row, active, sci_sum, cul_sum, gold_sum, faith_sum, gov)
        self._seat_war_peace_tail(row, active)
        return active

    def _seat_war_peace_tail(self, row: int, active: torch.Tensor) -> None:
        """The seat block's war-or-peace COUNTERS — one body, every seat row,
        at the tail seatPhase gives them.

        `war_turns` is the pair clock: each war has ONE clock, ticked once per
        turn at the pair's LOWER row's tail — every column above `row` (higher
        majors, every city-state) is exactly the set this row is the lower
        member of, and the mirror write keeps the matrix symmetric. A seat
        fighting two opponents has two clocks and can sue either on that war's
        own terms. `peace_turns`
        ticks while the seat is at war with NOBODY — `Seat.wars` holds the
        city-states too, so a minor war holds the clock back exactly as a
        major one does. The two are exclusive: a war clock only moves inside a
        war, which is a war with somebody.

        The war MATRIX makes this row-generic with nothing special-cased. A
        row's cell against ITSELF is structurally False, so it never counts a
        war with itself — exactly what `civsAtWar(state, s, s)` does on the TS
        side, and the reason row 0 looked like it needed a rule of its own."""
        any_war = active & self.war[:, row].any(dim=1)
        pair = active.unsqueeze(1) & self.war[:, row]
        pair[:, :row + 1] = False
        self.war_turns[:, row] += pair.long()
        self.war_turns[:, :, row] += pair.long()
        # The TREATY counts DOWN on the same discipline — once per pair per turn
        # at the pair's lower row, over the pairs that are NOT at war.
        bound = active.unsqueeze(1) & (self.treaty_turns[:, row] > 0)
        bound[:, :row + 1] = False
        self.treaty_turns[:, row] -= bound.long()
        self.treaty_turns[:, :, row] -= bound.long()
        # Every DIPLOMATIC AGREEMENT runs the same countdown on the same
        # discipline, and expires by reaching zero. Friendship and the alliance
        # are symmetric, so one tick writes both cells; the Open Borders grant
        # is DIRECTED, so the pair carries two clocks and both tick here.
        if row < self.n_majors:
            hi = active.unsqueeze(1).expand(self.B, self.n_majors).clone()
            hi[:, :row + 1] = False
            for plane in (self.seat_friend_turns, self.seat_ally_turns):
                run = hi & (plane[:, row] > 0)
                plane[:, row] -= run.long()
                plane[:, :, row] -= run.long()
            ob = self.seat_borders_turns
            out = hi & (ob[:, row] > 0)
            ob[:, row] -= out.long()
            inb = hi & (ob[:, :, row] > 0)
            ob[:, :, row] -= inb.long()
        self.peace_turns[:, row] = self.peace_turns[:, row] + (active & ~any_war).long()

    def _seat_governor_seats(self, row: int) -> torch.Tensor:
        """[B, RC] — seat row `row`'s governor-held cities for THIS turn, the
        loop-top governorPicks mirror. Rank the row's ALIVE cities on QUANTIZED
        milli loyalty (a raw-f64 ranking is float-association fragile), ties by
        column index == TS array order, and seat the top
        governorTitles(civics) of them. Read once per seat block, before any
        loyalty moves."""
        dev, B, RC = self.device, self.B, self.RC
        titles = (self.civ_civics[:, row].sum(dim=1) // self._gov_per).clamp(max=self._gov_max)
        alive = self.city_alive[:, row]
        q = js_round(self.city_loyalty[:, row] * 1000).long()
        key = torch.where(alive, q * 256 + torch.arange(RC, device=dev).reshape(1, -1), torch.full_like(q, 1 << 40))
        rank = torch.empty_like(key)
        rank.scatter_(1, key.argsort(dim=1, stable=True), torch.arange(RC, device=dev).expand(B, RC))
        return (rank < titles.unsqueeze(1)) & alive

    def _governor_tiles(self, row: int, gov: torch.Tensor) -> torch.Tensor:
        """[B, T] bool — the row's tiles whose OWNING city is governor-seated,
        all-False unless the seat is riding the GOLDEN Wish dedication (nothing
        else reads it). `gov` is the loop-top seating, taken before any loyalty
        moved, which is the snapshot `seatTourism` is handed."""
        golden = self._golden_ded(row, self._ded_wish)
        if not bool(golden.any()):
            return torch.zeros(self.B, self.T, dtype=torch.bool, device=self.device)
        slot = self.city_slot_at(row)
        return golden.unsqueeze(1) & (slot >= 0) & gov.gather(1, slot.clamp(min=0))

    def _seat_city_loyalty(self, row: int, col: torch.Tensor, act: torch.Tensor,
                           tier: torch.Tensor, gov: torch.Tensor) -> torch.Tensor:
        B, dev, F = self.B, self.device, torch.float64
        bidx, nrow = self._bidx, self.n_majors
        rr = self.rules.seats
        rng = int(rr.get("loyaltyRange", 9))
        scale = float(rr.get("loyaltyScale", 20))
        lmax = float(rr.get("loyaltyMax", 100))
        # "somebody else holds a city": the majors that EXIST and hold one,
        # this row excluded.
        held = self.city_alive[:, :nrow].any(dim=2) & self.civ_alive[:, :nrow]  # [B, n_majors]
        others = torch.cat((held[:, :row], held[:, row + 1:]), dim=1)
        others = others.any(dim=1) if others.shape[1] else torch.zeros(B, dtype=torch.bool, device=dev)
        here = self.city_center[bidx, row, col].clamp(min=0)
        ctr = self.city_center[:, :nrow].reshape(B, -1).clamp(min=0)
        d = self.pair_dist[here.unsqueeze(1), ctr].to(F)
        w = ((rng + 1 - d).clamp(min=0)
             * self.city_pop[:, :nrow].reshape(B, -1).double()
             * self.city_alive[:, :nrow].reshape(B, -1).double())
        sub = w.reshape(B, nrow, self.RC).sum(dim=2) * self._age_factor[self.civ_age[:, :nrow]]
        own = sub[:, row]
        keep = torch.ones(nrow, dtype=F, device=dev)
        keep[row] = 0.0
        foreign = (sub * keep.reshape(1, -1)).sum(dim=1)
        tot = own + foreign
        press = torch.where(tot > 0, scale * (own - foreign) / tot.clamp(min=1e-9), torch.zeros_like(tot))
        delta = (press
                 + self._loyalty_amenity[tier.clamp(min=0, max=self._loyalty_amenity.shape[0] - 1)].double()
                 + gov.double() * self._gov_loy
                 + self._congress_loyalty(row)
                 + self._building_loyalty(row, bidx, col)
                 + self._emergency_loyalty(row).gather(1, col.unsqueeze(1)).squeeze(1))
        loy = self.city_loyalty[bidx, row, col]
        upd = act & others
        nxt = torch.where(upd, (loy + delta).clamp(min=0, max=lmax), loy)
        cap = self.city_is_cap[bidx, row, col] | self._wonder_loyalty_aura(row, here)
        # f64 intermediates, stored at the PLANE's dtype (an f32 sim keeps an
        # f32 loyalty plane).
        self.city_loyalty[bidx, row, col] = torch.where(
            upd & cap, torch.full_like(nxt, lmax), nxt).to(self.city_loyalty.dtype)
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
        nrow = self.n_majors
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
        bidx = self._bidx
        old = self.city_growth[bidx, row, col]
        box = old + eff
        grow = act & (box >= need)
        starve = act & ~grow & (box < 0)
        nxt = torch.where(grow, box - need, torch.where(starve, torch.zeros_like(box), box))
        # f64 intermediates, stored at the PLANE's dtype (see _seat_city_loyalty)
        self.city_growth[bidx, row, col] = torch.where(act, nxt, old).to(old.dtype)
        pop = self.city_pop[bidx, row, col] + grow.long()
        self.city_pop[bidx, row, col] = torch.where(starve, (pop - 1).clamp(min=1), pop)

    def _seat_city_produce(self, row: int, col: torch.Tensor, act: torch.Tensor,
                           prod: torch.Tensor, sci_turn: torch.Tensor | None = None) -> None:
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
        # ONE multiplier, assembled in phase.ts's own order and applied once:
        # a military unit under To Arms AND a production card takes
        # `production * (a * b)`, never `(production * a) * b`.
        _emall = torch.ones_like(prod)
        if self._gov_has_effects and self._encamp_didx >= 0:
            em = self._gov_mods(row)[5]
            _bd = self._b_req_district[cur.clamp(min=0, max=self.NB - 1)]
            enc_i = (cur >= 0) & (cur < self.NB) & ((_bd == self._encamp_didx) | (_bd == self._harbor_didx))
            if self._encamp_si >= 0:
                enc_i = enc_i | (cur == self.DISTRICT_BASE + self._encamp_si)
            if self._harbor_si >= 0:
                enc_i = enc_i | (cur == self.DISTRICT_BASE + self._harbor_si)
            _emall = torch.where(enc_i, em.to(_emall.dtype), _emall)
        # CIV6 (To Arms!, Golden face): "+15% Production towards military
        # units." (Heartbeat of Steam, Golden face): "+10% Production toward
        # Industrial era and later wonders." Item classes are disjoint, so the
        # multiplier order is association-free.
        ta = self._golden_ded(row, self._ded_to_arms)
        if bool(ta.any()):
            mil_i = (cur >= self.UNIT_BASE) & (cur < self.UNIT_BASE + self.NU) \
                & ~self._type_civilian[(cur - self.UNIT_BASE).clamp(min=0, max=self.NU - 1)]
            _emall = torch.where(ta & mil_i, _emall * self._to_arms_prod, _emall)
        stm = self._golden_ded(row, self._ded_steam)
        if bool(stm.any()):
            nw = self._wonder_era.shape[0]
            wid = (cur - self.WONDER_BASE).clamp(min=0, max=nw - 1)
            won_i = (cur >= self.WONDER_BASE) & (cur < self.WONDER_BASE + nw) \
                & (self._wonder_era[wid] >= self._industrial_era)
            _emall = torch.where(stm & won_i, _emall * self._steam_wonder_prod, _emall)
        # CIV6 (Urban Development Treaty, outcome A): "+100% Production
        # towards buildings in this district." The x2 is exact in f64, so the
        # multiplier order against VETERANCY cannot re-associate anything.
        _cp, _cb = self._congress_udt()
        _bldg_i = (cur >= 0) & (cur < self.NB) & (_cp >= 0) \
            & (self._b_req_district[cur.clamp(min=0, max=self.NB - 1)] == _cp)
        _emall = torch.where(_bldg_i, _emall * self._c_prod_mult, _emall)
        # CIV6 (Public Works Program): "+100% / -50% Production towards this
        # Project."
        if self._proj_rows:
            nP = len(self._proj_rows)
            pidx = cur - self.PROJECT_BASE
            for _p in range(nP):
                on = (pidx == _p)
                if bool(on.any()):
                    _emall = torch.where(on, _emall * self._congress_project_mult(_p), _emall)
        # The slotted production cards: CIV6 stacks production modifiers
        # ADDITIVELY, so two cards that both name the item pay their
        # percentages summed rather than compounded.
        if self._gov_has_effects:
            _pb = self._gov_mods(row)[12]["prod"]
            if _pb:
                _add = torch.zeros_like(prod)
                for _pact, _isw, _cmask, _eramax, _pct in _pb:
                    if _isw:
                        _nw = self._wonder_era.shape[0]
                        _wid = (cur - self.WONDER_BASE).clamp(min=0, max=_nw - 1)
                        _hit = (cur >= self.WONDER_BASE) & (cur < self.WONDER_BASE + _nw)
                        if _eramax >= 0:
                            _hit = _hit & (self._wonder_era[_wid] <= _eramax)
                    else:
                        _ui = (cur - self.UNIT_BASE).clamp(min=0, max=self.NU - 1)
                        _hit = (cur >= self.UNIT_BASE) & (cur < self.UNIT_BASE + self.NU) \
                            & ((self._type_cls[_ui] & _cmask) != 0)
                        if _eramax >= 0:
                            _hit = _hit & (self._type_era[_ui] <= _eramax)
                    _add = _add + (_pact & _hit).to(_add.dtype) * _pct
                _emall = _emall * (1 + _add)
        prod = prod * _emall
        # VETERANCY multiplies FIRST, then the banked chop adds unmultiplied —
        # phase.ts spends the bank right after the production add.
        prog = self.city_progress[bidx, row, col]
        bank = self.city_prod_bank[bidx, row, col]
        _drip0 = self.city_progress[:, row].clone()
        # f64 intermediates, stored at the PLANE's dtype (see _seat_city_loyalty)
        self.city_progress[bidx, row, col] = torch.where(has_q, prog + prod + bank, prog).to(prog.dtype)
        self.city_prod_bank[bidx, row, col] = torch.where(has_q, torch.zeros_like(bank), bank)
        # the perimeter takes its share BEFORE the completion below zeroes the
        # progress it is measured against
        self._repair_drip(row, _drip0)
        cost = self.city_cost[bidx, row, col].clone()
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

        made_s = done & (cur == self.SETTLER)
        if bool(made_s.any()):
            pop = self.city_pop[bidx, row, col]
            self.city_pop[bidx, row, col] = torch.where(made_s, (pop - 1).clamp(min=1), pop)
            if self._settler_idx >= 0:
                self._spawn_unit(row, made_s, ctr, self._settler_idx)

        made_u = done & (cur >= self.UNIT_BASE) & (cur < self.UNIT_BASE + self.NU)
        if bool(made_u.any()):
            ui = (cur - self.UNIT_BASE).clamp(min=0, max=self.NU - 1)
            xp = self._train_xp_pct(self.city_bldg[bidx, row, col, :], ui)
            self._spawn_unit(row, made_u, ctr, ui, init_xp=xp)
            # CIV6 (Venetian Arsenal): a TRAINED naval unit arrives twice.
            # Purchases are excluded in the real game and take another path.
            if self._wond_n and bool(self._wond_dupnaval.any()):
                twin = made_u & self.unit_naval[ui] & self._seat_wonder_any(row, self._wond_dupnaval)
                if bool(twin.any()):
                    self._spawn_unit(row, twin, ctr, ui, init_xp=xp)
            if self._builder_idx >= 0:
                made_b = made_u & (ui == self._builder_idx)
                self.civ_builders_trained[:, row] = self.civ_builders_trained[:, row] + made_b.long()

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
            # BORDER CONTROL outcome A: this row's new districts are bombs.
            bomb = self._congress_culture_bomb_seat()[dr] == row
            if bool(bomb.any()):
                br2 = dr[bomb]
                self._culture_bomb(row, br2, dt[bomb], col[br2])
            self.city_qtile[bidx, row, col] = torch.where(made_d, torch.full_like(cur, -1), self.city_qtile[bidx, row, col])
            self._eff_version += 1

        made_b2 = done & (cur >= 0) & (cur < self.NB)
        if bool(made_b2.any()):
            br = made_b2.nonzero(as_tuple=True)[0]
            bi = cur.clamp(min=0, max=self.NB - 1)
            self.city_bldg[br, row, col[br], bi[br]] = True
            self._building_dedications(row, bi, made_b2)
            # A completed REGIONAL building reaches OTHER cities' yields, so
            # the caches must see the write even though this turn's own walk
            # reads the loop-top snapshot.
            self._eff_version += 1
            if self._walls_rows:
                wm = br[(self._b_walls[bi[br]] > 0)]
                if len(wm) > 0:
                    self.city_outer_hp[wm, row, col[wm]] = self._walls_max_at(
                        torch.full_like(col, row), col)[wm]

        if self._wond_n:
            made_w = done & (cur >= self.WONDER_BASE) & (cur < self.WONDER_BASE + self._wond_n)
            if bool(made_w.any()):
                wr = made_w.nonzero(as_tuple=True)[0]
                wi = (cur - self.WONDER_BASE).clamp(min=0)
                wt = self.city_wonder[bidx, row, col, :][wr, wi[wr]]
                self.built_wonder_complete[wr, wt.clamp(min=0)] = True
                self._add_era_score(row, self._era_pts["wonder"], made_w.long())
                # CIV6: Statue of Liberty +4 Diplomatic Victory points on
                # completion, Potala Palace +1.
                self.civ_diplo_points[wr, row] += self._wond_dvp[wi[wr]]
                # CIV6 (Big Ben): the treasury is multiplied once, at completion.
                tmul = self._wond_treasury[wi[wr]]
                self.civ_treasury[wr, row] = self.civ_treasury[wr, row] * tmul.to(self.civ_treasury.dtype)
                self._eff_version += 1
                # CIV6 (Apadana): every wonder completing in its city pays
                # envoys, itself included — so the count is read AFTER the
                # complete bit is set, and only the HOLDING city's wonders pay.
                if int(self._wond_envoy.sum()) > 0:
                    creg = self.city_wonder[bidx, row, col, :]
                    chas = (creg >= 0) & self.built_wonder_complete.gather(1, creg.clamp(min=0))
                    env = (chas.long() * self._wond_envoy.reshape(1, -1)).sum(dim=1)
                    self.civ_envoys_avail[wr, row] += env[wr]
                # CIV6 (Oxford, Bolshoi): free technologies and civics.
                if int(self._wond_freetech.sum()) > 0 or int(self._wond_freeciv.sum()) > 0:
                    ft = torch.zeros(self.B, dtype=torch.long, device=self.device)
                    fc = torch.zeros(self.B, dtype=torch.long, device=self.device)
                    ft[wr] = self._wond_freetech[wi[wr]]
                    fc[wr] = self._wond_freeciv[wi[wr]]
                    self._grant_free_research(row, ft, fc)
                # CIV6 (Great Library): "Receive boosts to all Ancient and
                # Classical era technologies" — one eureka per technology not
                # already boosted or researched, each a Free Inquiry event.
                if int((self._wond_boost_era >= 0).sum()) > 0:
                    be = torch.full((self.B,), -1, dtype=torch.long, device=self.device)
                    be[wr] = self._wond_boost_era[wi[wr]]
                    if bool((be >= 0).any()):
                        nt = min(self.civ_tech_boosted.shape[2], self._tech_era.numel())
                        want = (self._tech_era[:nt].reshape(1, -1) <= be.reshape(-1, 1)) & (be >= 0).reshape(-1, 1)
                        newly = want & ~self.civ_techs[:, row, :nt] & ~self.civ_tech_boosted[:, row, :nt]
                        self.civ_tech_boosted[:, row, :nt] |= newly
                        self._dedication_event(row, 1, newly.sum(dim=1))

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
                    # ORACLE: applyLumpYield's science/culture arms feed the
                    # LIFETIME banks alongside the pools.
                    if y_i == 3:
                        self.civ_tech_prog[:, row] = torch.where(hit, self.civ_tech_prog[:, row] + amt_y, self.civ_tech_prog[:, row])
                        self.seat_science_total[:, row] = torch.where(hit, self.seat_science_total[:, row] + amt_y, self.seat_science_total[:, row])
                    elif y_i == 4:
                        self.civ_civic_prog[:, row] = torch.where(hit, self.civ_civic_prog[:, row] + amt_y, self.civ_civic_prog[:, row])
                        self.civ_culture[:, row] = torch.where(hit, self.civ_culture[:, row] + amt_y, self.civ_culture[:, row])
                    elif y_i == 2:
                        self.civ_treasury[:, row] = torch.where(hit, self.civ_treasury[:, row] + amt_y, self.civ_treasury[:, row])
                    elif y_i == 5:
                        self.civ_faith[:, row] = torch.where(hit, self.civ_faith[:, row] + amt_y, self.civ_faith[:, row])
                    amt_g = js_round(cost * float(prow.get("gf", self._proj_gf)))
                    g_list = prow.get("gs")
                    if not g_list:
                        g_one = int(prow.get("g", -1))
                        g_list = [g_one] if g_one >= 0 else []
                    for g_i in (int(x) for x in g_list):
                        if 0 <= g_i < self.civ_gpp.shape[2]:
                            # CIV6 (Patronage): project points scale too.
                            amt_gc = amt_g * self._congress_gpp_factor(g_i)
                            self.civ_gpp[:, row, g_i] = torch.where(hit, self.civ_gpp[:, row, g_i] + amt_gc, self.civ_gpp[:, row, g_i])
                    if int(prow.get("rep", 0)):
                        # CIV6: "Once completed, it fully restores the HP of
                        # the city's (and Encampment's) Outer Defenses." One
                        # perimeter serves both here.
                        _rr = hit.nonzero(as_tuple=True)[0]
                        if len(_rr) > 0:
                            _mx = self._walls_max_at(torch.full_like(col, row), col)
                            self.city_outer_hp[_rr, row, col[_rr]] = _mx[_rr]
                    if int(prow.get("ls", 0)):
                        # A laser station: repeatable, +1 LY/turn for the craft.
                        self.space_lasers[:, row] += hit.long()
                    if int(prow.get("sp", 0)):
                        step_k = self._space_step[pidx]
                        self.space_done[hit, row, step_k] = True
                        # The sourced per-step side effects (`completeProject`'s
                        # space arm; step 2, Mars Colony, has none).
                        if step_k == 0 and self.fog_of_war:
                            # CIV6: Launch Earth Satellite reveals the entire
                            # map — the same fog gate as every reveal site.
                            self.seat_explored[hit, row] = True
                        if step_k == 1 and sci_turn is not None:
                            # CIV6: one-time Culture of 10x science/turn, the
                            # applyLumpYield culture arm (pool + lifetime bank).
                            amt_c = js_round(10.0 * sci_turn)
                            self.civ_civic_prog[:, row] = torch.where(hit, self.civ_civic_prog[:, row] + amt_c, self.civ_civic_prog[:, row])
                            self.civ_culture[:, row] = torch.where(hit, self.civ_culture[:, row] + amt_c, self.civ_culture[:, row])
                        if pidx in self._space_victory_idx:
                            # CIV6: completing the Exoplanet Expedition LAUNCHES
                            # the craft; the win fires on ARRIVAL, in step().
                            self.space_ly[hit, row] = 0

    def _seat_city_fire_and_heal(self, row: int, col: torch.Tensor, act: torch.Tensor) -> None:
        """A city's WALLS strike, its ADDITIONAL Encampment strike and the
        unbesieged heal — ONE body, every seat row, at the per-city position
        game.ts's seatPhase uses (right after border growth, before the next
        city's block).

        DRAW ORDER: walls first, then Encampment, then the heal, per city. A
        city holding both rolls twice, and a walls kill removes a target the
        Encampment roll would have taken.

        There is no second application anywhere, on either engine. Real Civ 6
        fires and heals a city in its OWNER's turn, once."""
        Bn, dev2 = self.B, self.device
        bidx = torch.arange(Bn, device=dev2)
        heal = int(self.rules.combat.get("cityHealPerTurn", 20))
        # CIV6: walls give a city its ranged strike, and once the Outer Defense
        # "has been completely destroyed, its ranged strike again becomes
        # unavailable". The Encampment's defenses are the same perimeter —
        # "building any level of Walls in the city will supply both" — so it
        # strikes only "while its Wall defenses are still up".
        walled = act & (self._walls_max_at(torch.full_like(col, row), col) > 0)
        perimeter = walled & (self.city_outer_hp[bidx, row, col] > 0)
        self._seat_city_strike(row, col, perimeter, "cstk")
        enc_reg = e0 = None
        if self._encamp_didx >= 0 and self.districts_on:
            # the city's OWN registry, which a capture clears — the districts
            # walk TS makes.
            enc_reg = self.city_dist_tile[bidx, row, col, self._encamp_didx]  # [B]
            e0 = enc_reg.clamp(min=0)
            enc_live = (enc_reg >= 0) & self.district_complete[bidx, e0] & ~self.district_pillaged[bidx, e0]
            self._seat_city_strike(row, col, perimeter & enc_live & (self.encamp_hp[bidx, e0] > 0), "estk")
        ctr = self.city_center[bidx, row, col].clamp(min=0)
        nbh = self.neigh[ctr]
        nbc = nbh.clamp(min=0)
        _am = self.military_at.gather(1, nbc)
        _as = torch.where(_am >= 0, self.unit_seat.gather(1, _am.clamp(min=0)), torch.full_like(_am, -1))
        # CIV6's siege: "if the invading army manages to establish zone of
        # control on all passable tiles surrounding the City Center, it will no
        # longer be able to repair the damage it suffers". EVERY passable
        # neighbour has to be held, and it takes a MILITARY unit — a civilian
        # exerts no zone of control. `encircled` is the twin.
        held = self._seats_hostile(row, _as) & (_am >= 0)
        passable = (nbh >= 0) & (self.passable | self.wpass).gather(1, nbc)
        besieged = passable.any(dim=1) & ~(passable & ~held).any(dim=1)
        ok = act & ~besieged
        # "The city will automatically regain 20 HP per turn" until it is
        # encircled. The outer defenses are NOT on this gate: "once damaged,
        # the outer defenses of a City Center or defensible district will not
        # regenerate on their own", and come back only through the repair
        # project.
        hp = self.city_hp[bidx, row, col]
        self.city_hp[bidx, row, col] = torch.where(
            ok, (hp + heal).clamp(max=int(self.rules.combat.get("cityMaxHp", 200))), hp)
        if e0 is not None:
            # "This is an automatic action, which happens if its tile is not
            # occupied" — an enemy standing on the district holds it silent.
            _em = self.military_at.gather(1, e0.unsqueeze(1)).squeeze(1)
            _ec = self.civilian_at.gather(1, e0.unsqueeze(1)).squeeze(1)
            _es = torch.where(_em >= 0, self.unit_seat.gather(1, _em.clamp(min=0).unsqueeze(1)).squeeze(1), torch.full_like(_em, -1))
            _ecs = torch.where(_ec >= 0, self.unit_seat.gather(1, _ec.clamp(min=0).unsqueeze(1)).squeeze(1), torch.full_like(_ec, -1))
            occupied = (self._seats_hostile(row, _es.unsqueeze(1)) | self._seats_hostile(row, _ecs.unsqueeze(1))).squeeze(1)
            rep = ok & ~occupied & (enc_reg >= 0) & self.district_complete[bidx, e0] & ~self.district_pillaged[bidx, e0]
            cur = self.encamp_hp[bidx, e0]
            self.encamp_hp[bidx, e0] = torch.where(rep, (cur + heal).clamp(max=self._encamp_hp_max), cur)

    def _seat_research_tail(self, row: int, active: torch.Tensor, sci_sum: torch.Tensor,
                            cul_sum: torch.Tensor, gold_sum: torch.Tensor,
                            faith_sum: torch.Tensor, gov: torch.Tensor) -> None:
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
            plane[:, row] = plane[:, row] + torch.where(active, add, torch.zeros_like(add))

        bank(self.civ_tech_prog, sci_sum)
        bank(self.seat_science_total, sci_sum)
        bank(self.civ_treasury, gold_sum)
        # a WON City-State Emergency pays +1 gold/turn per envoy, banked before
        # upkeep exactly as seatAccumulators is
        bank(self.civ_treasury, self._emergency_envoy_gold(row).to(self.civ_treasury.dtype))
        bank(self.civ_faith, faith_sum)
        self._seat_upkeep_and_bankruptcy(row, active)
        for _ in range(RESEARCH_LOOPS):
            curt = self.civ_cur_tech[:, row]
            cost_t = self._eff_cost(
                rdv.t_cost.gather(0, curt.clamp(min=0)),
                self.civ_tech_boosted[:, row].gather(1, curt.clamp(min=0).unsqueeze(1)).squeeze(1),
                golden_civ=row,
            )
            fin = active & (curt >= 0) & (self.civ_tech_prog[:, row] >= cost_t)
            if not bool(fin.any()):
                break
            rows = fin.nonzero(as_tuple=True)[0]
            self.civ_techs[rows, row, curt[rows]] = True
            self._eff_version += 1
            self._urban_defenses_fit(row, fin & (curt == self._urban_def_tech))
            self.civ_tech_prog[:, row] = torch.where(fin, self.civ_tech_prog[:, row] - cost_t, self.civ_tech_prog[:, row])
            # A finished tech holds no parked science — its slot was emptied
            # when it became current — but clear it anyway, so the partition
            # cannot be broken by a future writer. The overflow stays in the
            # pool and belongs to whatever the next record picks.
            self.civ_tech_retain[rows, row, curt[rows]] = 0
            self.civ_cur_tech[:, row] = torch.where(fin, torch.full_like(curt, -1), self.civ_cur_tech[:, row])
        no_t = active & (self.civ_cur_tech[:, row] == -1) & ~self._available_mask(self.civ_techs[:, row], self._prereq_t).any(dim=1)
        self.civ_tech_prog[:, row] = torch.where(no_t, torch.minimum(self.civ_tech_prog[:, row], torch.zeros_like(self.civ_tech_prog[:, row])), self.civ_tech_prog[:, row])
        bank(self.civ_tourism, self._tourism_of(
            self.city_gw_writing[:, row],
            self.city_gw_art[:, row] + self._art_themed_works(row),
            self.city_gw_music[:, row],
            self.city_alive[:, row],
            self.tile_seat == row,
            self._civ_era(self.civ_techs[:, row], self.civ_civics[:, row]),
            self.city_relics[:, row],
            self.civ_techs[:, row, self._gw_printing_tech] if self._gw_printing_tech >= 0 else None,
            self.city_artifacts[:, row],
            gw_kmult=self._congress_gw_kmult(),
            themed=self._museum_themed(row),
            relic_mult=self._city_wonder_mult(row, self._wond_relictour) if self._wond_n else None,
            resort_mult=self._seat_wonder_mult(row, self._wond_resorttour) if self._wond_n else None,
            park_mult=torch.where(self._golden_ded(row, self._ded_wish),
                                  torch.full((self.B,), int(self._wish_park), dtype=torch.long, device=self.device),
                                  torch.ones(self.B, dtype=torch.long, device=self.device)),
            gov_tile=self._governor_tiles(row, gov),
        ))
        # POLICY TREATY outcome A pays every seat holding the named card, on
        # top of the government tier, the (Treaty-Organization-weighted)
        # suzerain term and CIV6 (Alliance): "In Gathering Storm, each Alliance
        # gives you +1 Diplomatic Favor per turn per level" — levels are not
        # modeled, so every live alliance pays the level-1 rate. Each ORIGINAL
        # CAPITAL this row sits in costs it. The rate can go negative, and the
        # bank floors at zero.
        bank(self.civ_diplo_favor,
             self._adopted_gov_tier(self.civ_civics[:, row])
             + self._favor_per_suz * self._suzerain_count(row)
             + self._favor_per_alliance * (self.seat_ally_turns[:, row] > 0).sum(dim=1)
             + self._congress_policy_favor(
                 self._slotted_policies(self._seat_civics(row), self._wonder_extra_slots(row)))
             - self._favor_occ_capital * self._occupied_capitals(row))
        self.civ_diplo_favor[:, row] = self.civ_diplo_favor[:, row].clamp(min=0)
        # grievances DECAY by 1 per turn at peace with every MAJOR — the row's
        # own line of the war matrix, minus the city-state columns, because
        # `atPeaceWithAllCivs` walks `state.seats` and nothing else.
        at_peace = ~self.war[:, row, :self.n_majors].any(dim=1)
        self.civ_warmonger[:, row] = torch.where(
            active & at_peace & (self.civ_warmonger[:, row] > 0),
            self.civ_warmonger[:, row] - 1,
            self.civ_warmonger[:, row],
        )
        bank(self.civ_civic_prog, cul_sum)
        bank(self.civ_culture, cul_sum)
        for _ in range(RESEARCH_LOOPS):
            curc = self.civ_cur_civic[:, row]
            cost_c = self._eff_cost(
                rdv.c_cost.gather(0, curc.clamp(min=0)),
                self.civ_civic_boosted[:, row].gather(1, curc.clamp(min=0).unsqueeze(1)).squeeze(1),
                golden_civ=row, is_civic=True,
            )
            fin = active & (curc >= 0) & (self.civ_civic_prog[:, row] >= cost_c)
            if not bool(fin.any()):
                break
            rows = fin.nonzero(as_tuple=True)[0]
            self.civ_civics[rows, row, curc[rows]] = True
            self._eff_version += 1
            self.civ_civic_prog[:, row] = torch.where(fin, self.civ_civic_prog[:, row] - cost_c, self.civ_civic_prog[:, row])
            self.civ_civic_retain[rows, row, curc[rows]] = 0
            self.civ_cur_civic[:, row] = torch.where(fin, torch.full_like(curc, -1), self.civ_cur_civic[:, row])
        no_c = active & (self.civ_cur_civic[:, row] == -1) & ~self._available_mask(self.civ_civics[:, row], self._prereq_c).any(dim=1)
        self.civ_civic_prog[:, row] = torch.where(no_c, torch.minimum(self.civ_civic_prog[:, row], torch.zeros_like(self.civ_civic_prog[:, row])), self.civ_civic_prog[:, row])
        self._advance_great_people(row, active)
        self._seat_belief_claims(row, active)

    def _gp_cost(self, cls: int, at: torch.Tensor, world_era: torch.Tensor) -> torch.Tensor:
        """[B] float64 — what the person at queue position `at` costs. CIV6:
        "GPP cost = base cost * (1 + 0.3 * difference in era) ^ difference in
        era", the difference measured from the WORLD era and never negative;
        art-related People and the Great Prophet stay at the base."""
        p_era = self._gp_era[cls, at].clamp(min=0, max=8)
        d = (p_era - world_era).clamp(min=0, max=8)
        if bool(self._gp_flat_cost[cls]):
            d = torch.zeros_like(d)
        return self._gp_cost_table[p_era, d]

    def _advance_great_people(self, row: int, active: torch.Tensor) -> None:
        if self._gp_nc == 0:
            return
        B, dev = self.B, self.device
        world_era = self._world_era()
        # CIV6 (Oracle): "Districts in this city provide +2 Great Person points
        # of their type" — the HOLDING city's own districts only.
        dgpp = (self._city_wonder_flat(row, self._wond_distgpp)
                if self._wond_n and float(self._wond_distgpp.sum()) != 0.0
                else torch.zeros(B, 1, dtype=torch.float64, device=dev))
        for cls in range(self._gp_nc):
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
                    gflat = self._bel_add("gpp", row)[:, cls].double().unsqueeze(1)
                else:
                    gflat = torch.zeros(B, 1, dtype=torch.float64, device=dev)
                # a policy card's flat points join the SAME per-city term:
                # `mods.gppFlat` is one map over beliefs and cards alike.
                if self._gov_has_effects:
                    _pg = self._gov_mods(row)[12]["gpp"]
                    if cls < _pg.shape[1]:
                        gflat = gflat + _pg[:, cls].unsqueeze(1)
                pts = (comp_c.double() * (1.0 + gflat + dgpp + nb_of.double())).sum(dim=1)
            else:
                pts = torch.zeros(B, dtype=torch.float64, device=dev)
            if cls == self._prophet_cls:
                pts = pts + self._golden_ded(row, self._ded_exodus).double() * 4.0
            # CIV6: a wonder's per-turn points are the OWNER's, paid whether or
            # not the holding city has the class's district.
            if self._wond_n and cls < self._wond_gpp.shape[1] and float(self._wond_gpp[:, cls].sum()) != 0.0:
                pts = pts + self._seat_wonder_sum(row, self._wond_gpp[:, cls])
            # CIV6 (Patronage resolution): the factor covers every per-turn
            # source, the golden prophet term included.
            pts = pts * self._congress_gpp_factor(cls)
            self.civ_gpp[:, row, cls] = torch.where(
                active & (pts > 0), self.civ_gpp[:, row, cls] + pts, self.civ_gpp[:, row, cls]
            )
            maxN = self._gp_effects.shape[1]
            floor_c = self._gp_first_of_era[cls][world_era.clamp(min=0, max=8)]
            for _ in range(maxN):
                # the OFFER: never behind the queue, never behind the era gate
                at_c = torch.maximum(self.gp_next[:, cls], floor_c)
                has_person = at_c < self._gp_roster[cls]
                gcost = self._gp_cost(cls, at_c.clamp(max=maxN - 1), world_era)
                hit = active & has_person & (self.civ_gpp[:, row, cls] >= gcost)
                if not bool(hit.any()):
                    break
                hf = hit.to(torch.float64)
                eff = self._gp_effects[cls, at_c.clamp(max=maxN - 1)]
                self.civ_tech_prog[:, row] = self.civ_tech_prog[:, row] + eff[:, 0].double() * hf
                _kind = self._gw_cls.index(cls) if cls in self._gw_cls else -1
                if _kind >= 0:
                    self._place_works(row, hit, eff[:, 1].double(), _kind, at_c)
                else:
                    self.civ_civic_prog[:, row] = self.civ_civic_prog[:, row] + eff[:, 1].double() * hf
                self.civ_treasury[:, row] = self.civ_treasury[:, row] + eff[:, 2].double() * hf
                prod_fx = eff[:, 3].double() * hf
                if bool((prod_fx != 0).any()):
                    _capa = self.city_is_cap[:, row] & self.city_alive[:, row]
                    capm = _capa & (self.city_current[:, row] >= 0)
                    _drip_gp = self.city_progress[:, row].clone()
                    self.city_progress[:, row] = self.city_progress[:, row] + torch.where(capm, prod_fx.unsqueeze(1), torch.zeros_like(self.city_progress[:, row]))
                    self._repair_drip(row, _drip_gp)
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
                self.gp_next[:, cls] = torch.where(hit, at_c + 1, self.gp_next[:, cls])
                self._add_era_score(row, self._era_pts["gp"], hit.long())  # per GP earned
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
        """The BELIEF RACES for ONE seat row, at the
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
            self._bel_version += 1
        self.civ_faith[:, row] = torch.where(popen, self.civ_faith[:, row] - pfc, self.civ_faith[:, row])
        self.pantheon_claimed_n.add_(popen.long())
        self.civ_pantheon_done[:, row] = self.civ_pantheon_done[:, row] | popen
        self._add_era_score(row, self._era_pts["pantheon"], popen.long())
        d_hs = int(self._gp_class_district[self._prophet_cls]) if self._prophet_cls < self._gp_nc else -1
        if d_hs >= 0 and self.districts_on:
            reg_hs = self.city_dist_tile[:, row, :, d_hs]
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
            self._bel_version += 1
        self.claimed_f_n.add_(ropen.long())
        self.claimed_o_n.add_(ropen.long())
        self.civ_religion_done[:, row] = self.civ_religion_done[:, row] | ropen
        self._add_era_score(row, self._era_pts["religion"], ropen.long())
        _alv = self.city_alive[:, row]
        _cap = self.city_is_cap[:, row] & _alv
        _ctr = self.city_center[:, row]
        _h_slot = torch.where(_cap.any(dim=1), _cap.long().argmax(dim=1), _alv.long().argmax(dim=1))
        _holy = _ctr.gather(1, _h_slot.unsqueeze(1)).squeeze(1)
        _holy = torch.where(_alv.any(dim=1), _holy, torch.full_like(_holy, -1))
        self.holy_tile[:, row] = torch.where(ropen, _holy, self.holy_tile[:, row])

        edue = active & self.civ_religion_done[:, row] & ~self.civ_enhancer_done[:, row] & (self.civ_prophets[:, row] >= 2)
        eopen = edue & (self.claimed_e_n < rr.get("enhancerPool", 0))
        re_ = self._next_random(eopen)
        if bool(eopen.any()) and self._enh_any:
            erow = eopen.nonzero(as_tuple=True)[0]
            n_open = (~self.enh_claimed).sum(dim=1)
            k = torch.floor(re_ * n_open.to(torch.float64)).to(torch.long)
            cum = (~self.enh_claimed).long().cumsum(dim=1)
            sel = (~self.enh_claimed) & (cum == (k + 1).unsqueeze(1))
            eid = sel.long().argmax(dim=1)
            self.enh_claimed[erow, eid[erow]] = True
            self.civ_enhancer[erow, row] = eid[erow]
            self._bel_version += 1
        self.claimed_e_n.add_(eopen.long())
        self.civ_enhancer_done[:, row] = self.civ_enhancer_done[:, row] | eopen

    #: Reset on an ownership change: a captured unit never carries its old
    #: fortification, its old owner's aura, or movement — movesLeft = 0
    #: (acted) so the heal skips it this turn.
    _CAPTURE_RESET = {"fortify": 0, "aura_mp": 0, "mp": 0}
    #: Written by the capture itself, from its own arguments.
    _CAPTURE_SET = ("alive", "seat", "tile")

    def _carry_capture(self, rows: torch.Tensor, src: torch.Tensor, dst: torch.Tensor) -> None:
        """TS re-seats the SAME object, so EVERY field rides. The carry list is
        DERIVED from the pool's plane list rather than transcribed: a
        hand-written one drifts, and the destination slot may be a RECLAIMED
        one still holding a dead unit's promotions."""
        carry = [pl for pl in self._UNIT_PLANES
                 if pl not in self._CAPTURE_RESET and pl not in self._CAPTURE_SET]
        vals = {k: getattr(self, f"unit_{k}")[rows, src].clone() for k in carry}
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
        perm = torch.argsort((~alive).long(), dim=1, stable=True)
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
        "city_acquired", "city_hp", "city_outer_hp", "city_last_hit", "city_id", "city_is_cap", "city_orig_cap", "city_current", "city_progress",
        "city_prod_bank",
        "city_cost", "city_qtile",
        "city_gw_writing", "city_gw_art", "city_gw_music", "city_relics", "city_artifacts",
    )
    def _reclaim_cities(self) -> None:
        """Stably compacts city slots per (game, seat row), every major row.

        TS SPLICES seat.cities on capture/flip/transfer and pushes on
        settle/receive, so the LIVING's relative order IS the spec — stable
        compaction preserves it exactly (the per-slot loops, the arange
        tie-breaks and empire-score's sequential association all see the
        same cities in the same order). tile_city needs no rebuild — it is
        id-keyed for every seat — but centre_slot_at carries SLOT
        VALUES, so live centres re-map through their row's inverse
        permutation. Runs at the step END like _reclaim_pool: the controlled
        head samples slot-keyed city actions from the PRE-step masks, so the
        layout must hold through this step's applies. The trigger is the
        step's own hole test, so every death compacts and the layout is never
        seen with a hole in it."""
        nrows = self.n_majors
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
        # staleness latent — center_at's value-readers see
        # fresh slots after every compaction.
        inv = torch.argsort(perm, dim=2)  # [B, nrows, RC] slot -> new slot
        seat_t = self.tile_seat
        is_major_ctr = (seat_t >= 0) & (seat_t < nrows) & (self.centre_slot_at >= 0)
        rowt = seat_t.clamp(min=0, max=nrows - 1)
        inv_flat = inv.reshape(self.B, -1)
        idx = (rowt * self.RC + self.centre_slot_at.clamp(min=0)).clamp(max=inv_flat.shape[1] - 1)
        self.centre_slot_at.copy_(torch.where(is_major_ctr, inv_flat.gather(1, idx), self.centre_slot_at))
        self._eff_version += 1  # no (row, j)-keyed cache may survive the permutation
        self._tile_owner_ver += 1  # owner / center_at derive slots from permuted state

    def _check_rc_registry_invariant(self) -> None:
        B = self.B
        for row in range(self.n_majors):
            expect = self.city_id[:, row].unsqueeze(2)  # [B, RC, 1] this city's id
            alive = self.city_alive[:, row].unsqueeze(2)  # [B, RC, 1]
            for name in ("city_dist_tile", "city_wonder"):
                reg = getattr(self, name)[:, row]
                has = (reg >= 0) & alive
                if not bool(has.any()):
                    continue
                # tile_city at the listed tile, per cell
                rt = self.tile_city.gather(1, reg.clamp(min=0).reshape(B, -1)).reshape_as(reg)  # [B, RC, K]
                ra = self.tile_seat.gather(1, reg.clamp(min=0).reshape(B, -1)).reshape_as(reg)
                bad_fwd = has & (rt != expect)  # (1) registers to a sibling / no one
                bad_bwd = has & (ra != row)     # (2) tile no longer owned by this seat
                bad = bad_fwd | bad_bwd
                if bool(bad.any()):
                    idx = bad.nonzero(as_tuple=False)[0]
                    b, j, k = int(idx[0]), int(idx[1]), int(idx[2])
                    tile = int(reg[b, j, k])
                    raise AssertionError(
                        f"registry incoherence: game={b} seat={row} slot={j} "
                        f"{name}[{k}] tile={tile} expected_id={int(self.city_id[b, row, j])} "
                        f"actual_city_tile_id={int(self.tile_city[b, tile])} "
                        f"tile_seat={int(self.tile_seat[b, tile])} turn={self.turn}"
                    )
