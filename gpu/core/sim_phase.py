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
            # What the standing deals owe each other, before any new one is
            # struck: the per-turn payments, the clock, and the stale offer.
            self._deal_phase()
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


    def _seat_city_strike(self, row: int, col: torch.Tensor, fire: torch.Tensor, key: str,
                          origin: torch.Tensor | None = None) -> None:
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
        # CIV6: the Encampment conducts a ranged strike of its OWN — the scan
        # measures from the district's tile, the centre's otherwise.
        org = ctr if origin is None else origin.clamp(min=0)
        dist = self.pair_dist[org].to(torch.long)  # [B, T]
        _mil, _civ = self._visible_military_at(row), self.civilian_at
        _mseat = torch.where(_mil >= 0, self.unit_seat.gather(1, _mil.clamp(min=0)), torch.full_like(_mil, -1))
        _cseat = torch.where(_civ >= 0, self.unit_seat.gather(1, _civ.clamp(min=0)), torch.full_like(_civ, -1))
        _emb = self.embarked_at
        _eseat = torch.where(_emb >= 0, self.unit_seat.gather(1, _emb.clamp(min=0)), torch.full_like(_emb, -1))
        hm = self._seats_hostile(row, _mseat)
        hc = self._seats_hostile(row, _cseat)
        he = self._seats_hostile(row, _eseat)
        valid = fire.unsqueeze(1) & (hm | hc | he) & (dist >= 1) & (dist <= 2)
        arangeT = torch.arange(Tn, device=dev2)
        k = torch.where(valid, dist * (Tn + 1) + arangeT.reshape(1, -1), torch.full((Bn, Tn), 10**9, device=dev2, dtype=torch.long))
        best_key = k.min(dim=1).values
        tt = k.argmin(dim=1)
        strike = fire & (best_key < 10**9)
        if not bool(strike.any()):
            return
        _okm, _okc = hm[bidx, tt], hc[bidx, tt]
        # a city strike is a SHOT, so `stackDefender`'s higher-chassis arm picks
        _ms_t, _mq_t, _okm, _cs_t, _cq_t, _okc = self._stack_fold(
            tt, row, _mil[bidx, tt], _mseat[bidx, tt], _okm,
            _civ[bidx, tt], _cseat[bidx, tt], _okc, ranged=True)
        d_slot = torch.where(_okm, _ms_t, torch.where(_okc, _cs_t, torch.full_like(tt, -1)))
        d_seat = torch.where(_okm, _mq_t, torch.where(_okc, _cq_t, torch.full_like(tt, -1)))
        ds0 = d_slot.clamp(min=0)
        # A MILITARY target whose seat class earns xp — never a barbarian.
        is_vet_mil = _okm & (d_seat != BARB_SEAT)
        d_type = self.unit_type[bidx, ds0]
        _t = torch.ones_like(tt, dtype=torch.bool)
        def_promo = self._promo_cs(
            d_type, self.unit_promos[bidx, ds0],
            attacking=~_t, ranged=_t, vs_city=_t, tile=tt)
        def_cs = (self._type_combat[d_type] + self._tdef_i(bidx, tt) + def_promo
                  + self._formation_cs[self.unit_formation[bidx, ds0].clamp(min=0, max=self._form_max)])
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
        # CIV6 (Redoubt): "Increase city garrison Combat Strength by 5" — this
        # model fires a strike from the same base it defends with, so the
        # governor's adder rides both.
        if self.n_governors:
            atk_cs = atk_cs + self._governor_city_defense(
                torch.full_like(col, row), col).to(atk_cs.dtype)
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
        # CIV6 (Military Advisory / Oligarchy / Fascism): a flat unit adder is
        # the unit's own strength wherever it fights, a city's shot included.
        def_e = def_e + (self._gdr_beam_cs(d_type, d_seat)  # "...and when defending"
                         + self._congress_unit_cs(d_type, _def_seat)
                         + self._gov_unit_cs(d_type, _def_seat)).to(def_e.dtype)
        self._city_strike_resolve(strike, tt, d_slot, d_seat, _okm, _okc, is_vet_mil,
                                  atk_cs, def_e, def_hp, row, key)

    def _seat_turn(self, row: int) -> torch.Tensor:
        B, dev = self.B, self.device
        active = self.civ_alive[:, row] & self.city_alive[:, row].any(dim=1)
        # CIV6 (Kupe's Voyage): "+2 Science and +2 Culture per turn before you
        # settle your first city" — the only yield a CITY-LESS seat makes, so
        # it banks here, above the economy block both engines skip; it
        # completes with the turn the first city gives the seat.
        for _cc, _cl, _cpop, _ch, _ca, _cy in self._capital_rows:
            if not (_cy[3] or _cy[4]):
                continue
            _nc = self.civ_alive[:, row] & ~active & self._row_is(row, _cc, _cl)
            if bool(_nc.any()):
                _ncf = _nc.to(self.civ_tech_prog.dtype)
                self.civ_tech_prog[:, row] += _ncf * _cy[3]
                self.civ_civic_prog[:, row] += _ncf * _cy[4]
                self.seat_science_total[:, row] += _ncf * _cy[3]
                self.civ_culture[:, row] += _ncf * _cy[4]
        if not bool(active.any()):
            # TS's eliminated-actor `continue` — but the stashed intents are for
            # THIS turn and must not survive into the next one. Both drains pop
            # unconditionally and apply nothing under an all-False mask.
            army0 = self._seat_army_count(row)
            self._seat_record_apply(row, active)
            self._seat_buy_ladder(row, active, army0)
            return active
        # THE TURN'S RESOURCES, before anything reads them: every improved
        # source pays into the bank, then the plants burn what they need and
        # the POWERED flag every yield reader takes is set for the turn.
        self._seat_accrue_stockpile(row)
        self._seat_charge_upkeep(row)
        self._resolve_seat_power(row)
        # THE GOVERNORS, before anything reads the roster: earned titles are
        # spent, idle governors take a city, and both clocks tick. Every
        # ability the city walk reads is settled here.
        self._governor_phase(row)
        # ESPIONAGE: this seat's own spies move a turn closer to arriving or to
        # resolving, and the clocks their missions left behind tick down.
        self._tick_spies(row)
        self._tick_spy_effects(row)
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
                if plane is self.seat_ally_turns and bool(run.any()):
                    # a threshold crossing or an expiry changes what the
                    # (turn, _eff_version)-keyed suzerain-share cache answers
                    self._eff_version += 1
                    # CIV6 (Alliance): points accrue "every turn", faster when
                    # the pair trades - either direction pays its own
                    # quarter-point. Once per pair, the tick's own discipline.
                    NM = self.n_majors
                    to_o = (self.seat_route_dseat[:, row, :].unsqueeze(2)
                            == torch.arange(NM, device=self.device).view(1, 1, NM)).any(dim=1)
                    from_o = (self.seat_route_dseat[:, :NM] == row).any(dim=2)
                    # CIV6 (Mediterranean's Bride): "Trading with Allies earns
                    # twice as many bonus Alliance Points"; (Adventures of
                    # Enkidu): "Their Alliances gain Alliance Points for being
                    # at war with a common foe."
                    _cl = self._leads_vec("CLEOPATRA") | self._row_leads(row, "CLEOPATRA").unsqueeze(1)
                    _qpr = self._al_qp_route * torch.where(_cl, self._cleo_trade_qp_mult, 1)
                    _gl = self._leads_vec("GILGAMESH") | self._row_leads(row, "GILGAMESH").unsqueeze(1)
                    _common = (self.war[:, row, :].unsqueeze(1) & self.war[:, :NM, :]).any(dim=2)  # [B, NM]
                    add = run.long() * (self._al_qp_turn + _qpr * (to_o.long() + from_o.long())
                                        + self._enkidu_qp * (_common & _gl).long())
                    self.seat_alliance_pts[:, row] += add
                    self.seat_alliance_pts[:, :, row] += add
                    # CIV6 (Military alliance 2): "Allies share visibility" -
                    # each side's explored map folds into the other's.
                    m2 = (run & (self.seat_alliance_type[:, row, :NM] == 3)
                          & (self.seat_alliance_pts[:, row, :NM] >= self._al_l2_qp))
                    for _o in m2.any(dim=0).nonzero(as_tuple=True)[0].tolist():
                        _u = self.seat_explored[:, row] | self.seat_explored[:, _o]
                        _m = m2[:, _o].unsqueeze(1)
                        self.seat_explored[:, row] = torch.where(_m, _u, self.seat_explored[:, row])
                        self.seat_explored[:, _o] = torch.where(_m, _u, self.seat_explored[:, _o])
                    # CIV6 (Research alliance 2): "Every 30 turns (on
                    # Standard), you unlock a Eureka for a tech that your ally
                    # has researched or boosted, but you have not" - each side
                    # takes the first such tech in catalog order. A side's
                    # pick is a tech the other already holds, so the two
                    # picks never feed each other.
                    if self._al_r2_boost_turns > 0 and int(self.turn) % self._al_r2_boost_turns == 0:
                        r2 = (run & (self.seat_alliance_type[:, row, :NM] == 0)
                              & (self.seat_alliance_pts[:, row, :NM] >= self._al_l2_qp))
                        for _o in r2.any(dim=0).nonzero(as_tuple=True)[0].tolist():
                            for _me, _al in ((row, _o), (_o, row)):
                                cand = ((self.civ_techs[:, _al] | self.civ_tech_boosted[:, _al])
                                        & ~self.civ_techs[:, _me] & ~self.civ_tech_boosted[:, _me])
                                has = cand.any(dim=1) & r2[:, _o]
                                pick = cand.long().argmax(dim=1, keepdim=True)
                                cur = self.civ_tech_boosted[:, _me].gather(1, pick)
                                self.civ_tech_boosted[:, _me].scatter_(1, pick, cur | has.unsqueeze(1))
                plane[:, row] -= run.long()
                plane[:, :, row] -= run.long()
                if plane is self.seat_ally_turns:
                    # the TYPE is the live alliance's; the points stay
                    ended = run & (plane[:, row] == 0)
                    if bool(ended.any()):
                        gone = torch.full_like(self.seat_alliance_type[:, row], -1)
                        self.seat_alliance_type[:, row] = torch.where(ended, gone, self.seat_alliance_type[:, row])
                        self.seat_alliance_type[:, :, row] = torch.where(ended, gone, self.seat_alliance_type[:, :, row])
            ob = self.seat_borders_turns
            out = hi & (ob[:, row] > 0)
            ob[:, row] -= out.long()
            inb = hi & (ob[:, :, row] > 0)
            ob[:, :, row] -= inb.long()
        self.peace_turns[:, row] = self.peace_turns[:, row] + (active & ~any_war).long()
        # CIV6 (Warlord's Throne): the conquest window runs 5 turns and expires
        # by reaching zero, beside every other per-seat clock.
        _cq = active & (self.conquest_turns[:, row] > 0)
        self.conquest_turns[:, row] -= _cq.long()

    def _seat_governor_seats(self, row: int) -> torch.Tensor:
        """[B, RC] — the row's governor-held cities, straight off the roster.
        Read once per seat block, after `_governor_phase` seated every idle
        governor and before any loyalty moves."""
        return self._governor_at(row) >= 0

    def _granted_titles(self, row: int) -> torch.Tensor:
        """[B] long — CIV6 (Government Plaza, and every building in it):
        "Awards +1 Governor Title", over every city this seat holds. A pillaged
        Plaza pays none of them."""
        out = torch.zeros(self.B, dtype=torch.long, device=self.device)
        reg = self.city_dist_tile[:, row]  # [B, RC, nD]
        alive = self.city_alive[:, row]
        if self.districts_on and reg.shape[-1]:
            # per INSTANCE off the tile plane — the registry keeps one per type
            live = self._dist_counts(row) * alive.unsqueeze(2).long()
            out = out + torch.einsum("bjn,n->b", live, self._d_gov_title)
        if bool((self._b_gov_title > 0).any()):
            out = out + self._seat_building_sum(row, self._b_gov_title)
        # CIV6 (Grand Vizier): "Gain ... a Governor Title when the Gunpowder
        # technology is researched" — RunOnce, and a title is DERIVED on both
        # engines, so the HELD tech is what makes it permanent
        for _tc, _tl, _tt, _ta in self._governor_title_grant_rows:
            if _tt < 0:
                continue
            out = out + (self.civ_techs[:, row, _tt] & self._row_is(row, _tc, _tl)).long() * _ta
        return out

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
        loy_gov = self._ungoverned_loyalty(row)
        ctr = self.city_center[:, :nrow].reshape(B, -1).clamp(min=0)
        d = self.pair_dist[here.unsqueeze(1), ctr].to(F)
        w = ((rng + 1 - d).clamp(min=0)
             * self.city_pop[:, :nrow].reshape(B, -1).double()
             * self.city_alive[:, :nrow].reshape(B, -1).double())
        sub = w.reshape(B, nrow, self.RC).sum(dim=2) * self._age_factor[self.civ_age[:, :nrow]]
        own = sub[:, row]
        keep = torch.ones(B, nrow, dtype=F, device=dev)
        keep[:, row] = 0.0
        # CIV6 (Cultural alliance 1): "Allies do not exert Loyalty pressure
        # on each other."
        cul_ally = ((self.seat_alliance_type[:, row, :nrow] == 1)
                    & (self.seat_ally_turns[:, row, :nrow] > 0))
        keep = torch.where(cul_ally, torch.zeros_like(keep), keep)
        foreign = (sub * keep).sum(dim=1)
        tot = own + foreign
        press = torch.where(tot > 0, scale * (own - foreign) / tot.clamp(min=1e-9), torch.zeros_like(tot))
        delta = (press
                 + self._loyalty_amenity[tier.clamp(min=0, max=self._loyalty_amenity.shape[0] - 1)].double()
                 + torch.where(gov, torch.full_like(loy_gov, self._gov_loy), loy_gov)
                 + self._congress_loyalty(row)
                 + self._standing_loyalty(row, bidx, col)
                 + self._emergency_loyalty(row).gather(1, col.unsqueeze(1)).squeeze(1)
                 + self._gp_city_perm(row, "loyalty").gather(1, col.unsqueeze(1)).squeeze(1).double()
                 # CIV6 (Eleanor): "Great Works in Eleanor's cities each cause
                 # -1 Loyalty per turn in FOREIGN cities within 9 tiles"
                 + self._great_work_loyalty(row, here))
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
                # CIV6 (Cultural alliance 1): an ally exerts nothing, so it
                # never receives the flip either.
                for _o in range(nrow):
                    if _o != row and int(self.seat_alliance_type[b, row, _o]) == 1                             and int(self.seat_ally_turns[b, row, _o]) > 0:
                        press[_o] = -1.0
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

        Only the HEAD accrues — a deeper entry keeps whatever hammers it
        already holds and waits — and a completion SHIFTS the queue, so CIV6's
        overflow carries onto the item behind it. Nothing but an empty queue
        banks: with somewhere item-shaped to put them, the hammers go there."""
        bidx = self._bidx
        cur = self.city_current[bidx, row, col, 0].clone()
        # A FORMATION head is the unit's own column to every multiplier and to
        # the completion below — TS's `kind === 'unit'` tests cannot tell them
        # apart — and only the spawn asks the tier.
        form_t = self._q_form_tier(cur)
        cur = self._q_unit_of(cur)
        # the head's PLOT, read before the shift takes it away
        qt0 = self.city_qtile[bidx, row, col, 0].clone()
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
                & self._type_military[(cur - self.UNIT_BASE).clamp(min=0, max=self.NU - 1)]
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
        # CIV6 (EFFECT_ADJUST_BUILDING_PRODUCTION): the roster's building rows —
        # a named building or every building of a district
        # a named building, every building of a district, EVERY building, or a
        # DISTRICT item (EFFECT_ADJUST_DISTRICT_PRODUCTION); the unit arms below
        for _rc, _rl, _rb, _rd, _rp, _pct, _rdi, _rev, _ru in self._prod_mult_rows:
            if _rp >= 0 or _ru >= 0 or _rev == 2:
                continue
            _who = self._row_is(row, _rc, _rl)
            if not bool(_who.any()):
                continue
            _is_b = (cur >= 0) & (cur < self.NB)
            if _rb >= 0:
                _hit = cur == _rb
            elif _rd >= 0:
                _hit = _is_b & (self._b_req_district[cur.clamp(min=0, max=self.NB - 1)] == _rd)
            elif _rdi >= 0:
                # a district queue code is a SCAFFOLD slot; the row names the
                # district, so the slot's own district answers
                _ds = cur - self.DISTRICT_BASE
                _in_d = (_ds >= 0) & (_ds < len(self._scaffold))
                _hit = _in_d & (self._scaffold_di[_ds.clamp(min=0, max=max(len(self._scaffold) - 1, 0))] == _rdi)
            else:
                _hit = _is_b
            _emall = torch.where(_hit & _who, _emall * (1.0 + _pct / 100.0), _emall)
        # CIV6 (Public Works Program): "+100% / -50% Production towards this
        # Project."
        if self._proj_rows:
            nP = len(self._proj_rows)
            pidx = cur - self.PROJECT_BASE
            for _p in range(nP):
                on = (pidx == _p)
                if bool(on.any()):
                    _emall = torch.where(on, _emall * self._congress_project_mult(_p), _emall)
        _is_unit = (cur >= self.UNIT_BASE) & (cur < self.UNIT_BASE + self.NU)
        _ut = (cur - self.UNIT_BASE).clamp(min=0, max=self.NU - 1)
        if self._gov_has_effects:
            _fxp = self._gov_mods(row)[12]
            # CIV6 (Letters of Marque): "Naval Raiders: +100% Production";
            # (Flower Power): land units other than Rock Bands cost double,
            # which this model pays as a slower fill rather than a moved cost.
            _rp = _fxp["raiderprod"].to(_emall.dtype)
            if bool((_rp != 1).any()):
                _emall = torch.where(_is_unit & self._type_raider[_ut],
                                     _emall * _rp, _emall)
            _lc = _fxp["landcost"].to(_emall.dtype)
            if bool((_lc != 1).any()):
                _land = _is_unit & ~self.unit_naval[_ut] & (self._type_air[_ut] == 0) \
                    & (_ut != self._band_idx)
                _emall = torch.where(_land, _emall / _lc, _emall)
            # CIV6 (Automated Workforce): "+20% Production towards city
            # projects."
            _pp = _fxp["projprod"].to(_emall.dtype)
            if bool((_pp != 1).any()) and self._proj_rows:
                _proj_i = (cur >= self.PROJECT_BASE) & (cur < self.PROJECT_BASE + len(self._proj_rows))
                _emall = torch.where(_proj_i, _emall * _pp, _emall)
        # CIV6 (Zoning Commissioner): "+20% Production towards constructing
        # Districts in the city"; (Grants): "+30% Production towards City
        # Projects." The governor's are per CITY, not per seat.
        if self.n_governors and row < self.n_majors:
            _dm = self._governor_mult(row, "districtProdMult")[bidx, col].to(_emall.dtype)
            if bool((_dm != 1).any()):
                _dist_i = (cur >= self.DISTRICT_BASE) & (cur < self.DISTRICT_BASE + len(self.districts_cat))
                _emall = torch.where(_dist_i, _emall * _dm, _emall)
            _pm = self._governor_mult(row, "projectProdMult")[bidx, col].to(_emall.dtype)

            if bool((_pm != 1).any()) and self._proj_rows:
                _proj_i = (cur >= self.PROJECT_BASE) & (cur < self.PROJECT_BASE + len(self._proj_rows))
                _emall = torch.where(_proj_i, _emall * _pm, _emall)
        # CIV6 (Founder of Carthage): "+50% Production toward districts in the
        # city with the Government Plaza" (`PLAZA_DISTRICT_PROD_ROWS`)
        if self._plaza_district_prod_rows and self._govplaza_didx >= 0:
            _pd_i = (cur >= self.DISTRICT_BASE) & (cur < self.DISTRICT_BASE + len(self.districts_cat))
            _pz = self.city_dist_tile[bidx, row, col, self._govplaza_didx]
            _pz_ok = (_pz >= 0) & self.district_complete[bidx, _pz.clamp(min=0)]
            for _zc, _zl, _zp in self._plaza_district_prod_rows:
                _zw = self._row_is(row, _zc, _zl)[bidx]
                _emall = torch.where(_pd_i & _pz_ok & _zw, _emall * (1.0 + _zp / 100.0), _emall)
        # CIV6 (Thunderbolt of the North): "+50% Production toward all naval
        # melee units."
        _hard = self._row_leads(row, "HARDRADA")
        if bool(_hard.any()):
            _emall = torch.where(_is_unit & self._type_naval_melee[_ut] & _hard, _emall * self._hard_naval_prod, _emall)
        # CIV6 (EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION): the roster's unit-class rows
        # a promotion class, ONE unit type (EFFECT_ADJUST_UNIT_PRODUCTION), or every unit
        for _rc, _rl, _rb, _rd, _rp, _pct, _rdi, _rev, _ru in self._prod_mult_rows:
            if _rp < 0 and _ru < 0 and _rev != 2:
                continue
            _who = self._row_is(row, _rc, _rl)
            if not bool(_who.any()):
                continue
            if _rp >= 0:
                _cls_i = _is_unit & (self.rules_dev.u_promo_class[_ut] == _rp)
            elif _ru >= 0:
                _cls_i = _is_unit & (_ut == _ru)
            else:
                _cls_i = _is_unit
            _emall = torch.where(_cls_i & _who, _emall * (1.0 + _pct / 100.0), _emall)
        # CIV6 (Iteru): "+15% Production towards Districts and Wonders built
        # next to a River."
        _egypt = self._row_plays(row, "EGYPT")
        if bool(_egypt.any()):
            _nw = self._wonder_era.shape[0]
            _d_i = (cur >= self.DISTRICT_BASE) & (cur < self.DISTRICT_BASE + len(self.districts_cat))
            _w_i = (cur >= self.WONDER_BASE) & (cur < self.WONDER_BASE + _nw)
            # a wonder's plot lives in the `city_wonder` registry, a district's
            # rides the queue entry
            _wplot = self.city_wonder[bidx, row, col, (cur - self.WONDER_BASE).clamp(min=0, max=_nw - 1)]
            _plot = torch.where(_w_i, _wplot, qt0)
            _riv = (_plot >= 0) & self.tile_river[bidx, _plot.clamp(min=0)]
            _emall = torch.where((_d_i | _w_i) & _riv & _egypt, _emall * self._iteru_mult, _emall)
        # CIV6 (France, EFFECT_ADJUST_WONDER_ERA_PRODUCTION): "+20% Production
        # toward Medieval, Renaissance, and Industrial era wonders" — an ERA
        # BAND, inclusive at both ends (`WONDER_ERA_PROD_ROWS`)
        for _fc, _fl, _fs, _fe, _fp in self._wonder_era_prod_rows:
            _fw = self._row_is(row, _fc, _fl)
            if not bool(_fw.any()) or _fs < 0 or _fe < 0:
                continue
            _nw = self._wonder_era.shape[0]
            _wid = (cur - self.WONDER_BASE).clamp(min=0, max=max(_nw - 1, 0))
            _isw = (cur >= self.WONDER_BASE) & (cur < self.WONDER_BASE + _nw)
            _band = _isw & (self._wonder_era[_wid] >= _fs) & (self._wonder_era[_wid] <= _fe)
            _emall = torch.where(_band & _fw[bidx], _emall * (1.0 + _fp / 100.0), _emall)
        # CIV6 (Pearl of the Danube): "+50% Production to Districts and
        # Buildings constructed ACROSS A RIVER from a City Center." A building
        # is built in its district, so its tile is that district's; a City
        # Center building never crosses a river from the centre it stands on.
        if self._river_cross_prod_rows:
            _hd = (cur >= self.DISTRICT_BASE) & (cur < self.DISTRICT_BASE + len(self.districts_cat))
            _hb = (cur >= 0) & (cur < self.NB)
            _hbd = self._b_req_district[cur.clamp(min=0, max=self.NB - 1)]
            # a district's plot rides the queue entry; a building's is the
            # tile its own district stands on
            _hbt = self.city_dist_tile[bidx, row, col].gather(
                1, _hbd.clamp(min=0).unsqueeze(1)).squeeze(1)
            _hat = torch.where(_hd, qt0, torch.where(_hb & (_hbd >= 0), _hbt, torch.full_like(qt0, -1)))
            _hctr = self.city_center[bidx, row, col]
            #  answers 0 or 1 as a LONG, not a bool
            _hcross = ((_hat >= 0) & (_hctr >= 0)
                       & (self._river_cross(_hctr.clamp(min=0), _hat.clamp(min=0)) != 0))
            for _rc, _rl, _rk, _rp in self._river_cross_prod_rows:
                _rw = self._row_is(row, _rc, _rl)[bidx]
                _kind = _hd if _rk == 1 else (_hb & (_hbd >= 0))
                _emall = torch.where(_hcross & _kind & _rw, _emall * (1.0 + _rp / 100.0), _emall)
        # The slotted production cards: CIV6 stacks production modifiers
        # ADDITIVELY, so two cards that both name the item pay their
        # percentages summed rather than compounded.
        _add = torch.zeros_like(prod)
        if self._gov_has_effects:
            _pb = self._gov_mods(row)[12]["prod"]
            if _pb:
                for _pact, _isw, _cmask, _eramax, _pct in _pb:
                    if _isw == 1:
                        _nw = self._wonder_era.shape[0]
                        _wid = (cur - self.WONDER_BASE).clamp(min=0, max=_nw - 1)
                        _hit = (cur >= self.WONDER_BASE) & (cur < self.WONDER_BASE + _nw)
                        if _eramax >= 0:
                            _hit = _hit & (self._wonder_era[_wid] <= _eramax)
                    elif _isw == 2:
                        # CIV6 (Fascism): "+50% Production toward Units" —
                        # class-FREE, every unit the queue can hold.
                        _ui = (cur - self.UNIT_BASE).clamp(min=0, max=self.NU - 1)
                        _hit = (cur >= self.UNIT_BASE) & (cur < self.UNIT_BASE + self.NU)
                        if _eramax >= 0:
                            _hit = _hit & (self._type_era[_ui] <= _eramax)
                    else:
                        _ui = (cur - self.UNIT_BASE).clamp(min=0, max=self.NU - 1)
                        _hit = (cur >= self.UNIT_BASE) & (cur < self.UNIT_BASE + self.NU) \
                            & ((self._type_cls[_ui] & _cmask) != 0)
                        if _eramax >= 0:
                            _hit = _hit & (self._type_era[_ui] <= _eramax)
                    _add = _add + (_pact & _hit).to(_add.dtype) * _pct
        # CIV6 (Ancestral Hall): "50% increased Production toward Settlers in
        # this city"; (Warlord's Throne): "Capturing an enemy City grants 20%
        # bonus Production in all Cities for 5 turns". Percentages both, so
        # they join the SAME additive sum rather than compounding on it.
        if bool((self._b_settler_prod != 0).any()):
            _stand_b = self.city_bldg[bidx, row, col] & ~self._bldg_dark(self.city_dist_tile[bidx, row, col])
            _sp = (_stand_b.double() * self._b_settler_prod.unsqueeze(0)).sum(dim=1) / 100
            _add = _add + torch.where(cur == self.SETTLER, _sp, torch.zeros_like(_sp)).to(_add.dtype)
        if bool((self._b_conquest_pct != 0).any()):
            _cqp = self._seat_building_sum(row, self._b_conquest_pct) / 100
            _add = _add + torch.where(self.conquest_turns[:, row] > 0,
                                      _cqp, torch.zeros_like(_cqp)).to(_add.dtype)
        # CIV6 (Military alliance 2): "+15% Production toward military units
        # when you or your ally are at war."
        if self._al_m2_mil_prod_pct:
            _m2 = self._allied_type(row, 3, 2)
            if bool(_m2.any()):
                _anyw = self.war.any(dim=2)                          # [B, NS]
                _m2w = (_m2 & (_anyw[:, row].unsqueeze(1) | _anyw[:, : self.n_majors])).any(dim=1)
                _m2i = (cur >= self.UNIT_BASE) & (cur < self.UNIT_BASE + self.NU) \
                    & self._type_military[(cur - self.UNIT_BASE).clamp(min=0, max=self.NU - 1)]
                _add = _add + (_m2w & _m2i).to(_add.dtype) * (self._al_m2_mil_prod_pct / 100)
        # A Great Person's permanent share joins the SAME additive sum.
        _add = _add + self._gp_prod_pct(row, cur).to(_add.dtype)
        _emall = _emall * (1 + _add)
        prod = prod * _emall
        # VETERANCY multiplies FIRST, then the banked chop adds unmultiplied —
        # phase.ts spends the bank right after the production add.
        prog = self.city_progress[bidx, row, col, 0]
        bank = self.city_prod_bank[bidx, row, col]
        _drip0 = self.city_progress[:, row, :, 0].clone()
        # f64 intermediates, stored at the PLANE's dtype (see _seat_city_loyalty)
        self.city_progress[bidx, row, col, 0] = torch.where(has_q, prog + prod + bank, prog).to(prog.dtype)
        self.city_prod_bank[bidx, row, col] = torch.where(has_q, torch.zeros_like(bank), bank)
        # the perimeter takes its share BEFORE the completion below zeroes the
        # progress it is measured against
        self._repair_drip(row, _drip0)
        # A BUILDING'S PRICE IS NEVER LOCKED. TS reads `buildingCostIn` at
        # every completion check, and two rows can move under it: the Flood
        # Barrier, whose price is "variable based on the number of Coastal
        # Lowland tiles in this city and the current sea level", and whatever
        # plant the Global Energy Treaty is discounting this session.
        self._reprice_live(row)
        cost = self.city_cost[bidx, row, col, 0].clone()
        done = has_q & (self.city_progress[bidx, row, col, 0] >= cost)
        if not bool(done.any()):
            return
        # queue.shift() — the head goes BEFORE completeQueueItem runs, and the
        # item behind it moves up carrying the hammers it had already earned.
        ovf = (self.city_progress[bidx, row, col, 0] - cost).clamp(min=0)
        self._q_pop(row, col, done)
        # CIV6: the overflow carries into the next item. Only a queue that ran
        # EMPTY has nowhere to put it, and that is the one case it banks.
        nxt = self.city_current[bidx, row, col, 0] >= 0
        carry = done & nxt
        _hp = self.city_progress[bidx, row, col, 0]
        self.city_progress[bidx, row, col, 0] = torch.where(carry, _hp + ovf, _hp)
        _bk = self.city_prod_bank[bidx, row, col]
        self.city_prod_bank[bidx, row, col] = torch.where(done & ~nxt, _bk + ovf, _bk)
        ctr = self.city_center[bidx, row, col]

        # CIV6 (Citadel of God): "Gain Faith equal to 25% of the construction
        # cost when finishing buildings." Districts are construction too and
        # the page groups them with the buildings; wonders are not.
        if self.n_governors:
            _bd = done & (((cur >= 0) & (cur < self.NB))
                          | ((cur >= self.DISTRICT_BASE) & (cur < self.WONDER_BASE)))
            if bool(_bd.any()):
                _pct = self._governor_sum(row, "faithOnBuildPct")[bidx, col]
                _pay = torch.floor(cost.double() * _pct / 100.0) * _bd.double()
                self.civ_faith[:, row] = self.civ_faith[:, row] + torch.zeros_like(
                    self.civ_faith[:, row]).index_add_(0, bidx, _pay.to(self.civ_faith.dtype))

        made_s = done & (cur == self.SETTLER)
        if bool(made_s.any()):
            pop = self.city_pop[bidx, row, col]
            # CIV6 (Provision): "Settlers trained in the city do not consume a
            # Population."
            _free = self._governor_flag(row, "settlerFreePop")[bidx, col] if self.n_governors \
                else torch.zeros_like(made_s)
            self.city_pop[bidx, row, col] = torch.where(made_s & ~_free, (pop - 1).clamp(min=1), pop)
            if self._settler_idx >= 0:
                self._spawn_unit(row, made_s, ctr, self._settler_idx)

        made_u = done & (cur >= self.UNIT_BASE) & (cur < self.UNIT_BASE + self.NU)
        if bool(made_u.any()):
            ui = (cur - self.UNIT_BASE).clamp(min=0, max=self.NU - 1)
            xp = self._train_xp_pct(self.city_bldg[bidx, row, col, :], ui, row, col)
            fp = (self._governor_flag(row, "freePromoOnTrain").gather(1, col.unsqueeze(1)).squeeze(1)
                  if self.n_governors else torch.zeros_like(made_u))
            # CIV6 (Military alliance 3): "Units start with a free Promotion."
            fp = fp | self._allied_type(row, 3, 3).any(dim=1)
            self._spawn_unit(row, made_u, self._air_spawn_at(row, ui, col, ctr), ui, init_xp=xp, free_promo=fp, formation=form_t)
            # CIV6 (People of the Steppe): "Receive a second light cavalry
            # unit ... each time you train a light cavalry unit" — a TRAINED
            # one, the Arsenal's own door (`EXTRA_UNIT_COPY_ROWS`)
            for _ec, _el, _ecls, _en in self._extra_unit_copy_rows:
                if _ecls != 0:  # COPY_CLASSES[0] = LIGHT_CAVALRY
                    continue
                _ew = made_u & self._type_lightcav[ui] & self._row_is(row, _ec, _el)
                if not bool(_ew.any()):
                    continue
                for _ in range(_en):
                    self._spawn_unit(row, _ew, ctr, ui, init_xp=xp, free_promo=fp, formation=form_t)
            # CIV6 (Venetian Arsenal): a TRAINED naval unit arrives twice.
            # Purchases are excluded in the real game and take another path.
            if self._wond_n and bool(self._wond_dupnaval.any()):
                twin = made_u & self.unit_naval[ui] & self._seat_wonder_any(row, self._wond_dupnaval)
                if bool(twin.any()):
                    # what was trained arrives twice, tier and all
                    self._spawn_unit(row, twin, ctr, ui, init_xp=xp, free_promo=fp, formation=form_t)
            if self._builder_idx >= 0:
                made_b = made_u & (ui == self._builder_idx)
                self.civ_builders_trained[:, row] = self.civ_builders_trained[:, row] + made_b.long()

        made_d = done & (cur >= self.DISTRICT_BASE) & (cur < self.WONDER_BASE)
        if bool(made_d.any()):
            dr = made_d.nonzero(as_tuple=True)[0]
            dt = qt0[dr].clamp(min=0)
            self.district_complete[dr, dt] = True
            # The registry holds ONE tile per type; TS walks every instance. So
            # for a type a city may hold SEVERAL of, point the entry at the one
            # that just finished — then "the registry names a complete tile"
            # holds exactly when TS's `some(complete)` does.
            _rep = self._is_repeatable[self.district[dr, dt].clamp(min=0)]
            if bool(_rep.any()):
                _rr = dr[_rep]
                self.city_dist_tile[_rr, row, col[_rr], self.district[_rr, dt[_rep]]] = dt[_rep]
            # CIV6 (Religious Convert): "Receives an Apostle each time he
            # finishes a ... Theater Square district" (`DISTRICT_UNIT_ROWS`)
            for _dc, _dl, _dd, _du in self._district_unit_rows:
                if _du < 0 or _dd < 0:
                    continue
                _dw = torch.zeros(self.B, dtype=torch.bool, device=self.device)
                _dw[dr] = self.district[dr, dt] == _dd
                _dw = _dw & self._row_is(row, _dc, _dl)
                if bool(_dw.any()):
                    _dat = torch.full((self.B,), -1, dtype=torch.long, device=self.device)
                    _dat[dr] = dt
                    self._spawn_unit(row, _dw, _dat, _du)
            # MONUMENTALITY pays era score per SPECIALTY district completed
            # (a city centre is never queued here).
            mon = torch.zeros(self.B, dtype=torch.bool, device=self.device)
            mon[dr] = True
            self._dedication_event(row, 0, mon)
            enc = self.district[dr, dt] == self._encamp_didx
            self.encamp_hp[dr, dt] = torch.where(enc, torch.full_like(dt, self._encamp_hp_max), self.encamp_hp[dr, dt])
            # its OWN perimeter arrives at whatever tier the city's walls
            # already supply — 0 where none stand yet (`fitEncampOuter`)
            _ewf = self._walls_max_at(torch.full_like(col, row), col)[dr]
            self.encamp_outer_hp[dr, dt] = torch.where(enc, _ewf, self.encamp_outer_hp[dr, dt])
            # BORDER CONTROL outcome A: this row's new districts are bombs —
            # and it takes FOREIGN tiles too, so it subsumes the Preserve's own
            # and only one of the two ever runs.
            bomb = self._congress_culture_bomb_seat()[dr] == row
            if bool(bomb.any()):
                br2 = dr[bomb]
                self._culture_bomb(row, br2, dt[bomb], col[br2])
            own_bomb = ~bomb & self._d_bomb_unowned[self.district[dr, dt].clamp(min=0)]
            if bool(own_bomb.any()):
                br3 = dr[own_bomb]
                self._culture_bomb(row, br3, dt[own_bomb], col[br3], unowned_only=True)
            # CIV6 (Diplomatic Quarter): "+1 Envoy when built next to the City
            # Center."
            env = self._d_envoy_centre[self.district[dr, dt].clamp(min=0)]
            if bool((env > 0).any()):
                _ctr = self.city_center[bidx, row, col][dr].clamp(min=0)
                _touch = (self.neigh[dt] == _ctr.unsqueeze(1)).any(dim=1)
                _add = torch.zeros(self.B, dtype=torch.long, device=self.device)
                _add.index_add_(0, dr, env * _touch.long())
                self.civ_envoys_avail[:, row] = self.civ_envoys_avail[:, row] + _add
            self._eff_version += 1

        made_b2 = done & (cur >= 0) & (cur < self.NB)
        if bool(made_b2.any()):
            br = made_b2.nonzero(as_tuple=True)[0]
            bi = cur.clamp(min=0, max=self.NB - 1)
            self.city_bldg[br, row, col[br], bi[br]] = True
            self._bldg_version += 1
            self._building_dedications(row, bi, made_b2)
            # A completed REGIONAL building reaches OTHER cities' yields, so
            # the caches must see the write even though this turn's own walk
            # reads the loop-top snapshot.
            self._eff_version += 1
            if self._walls_rows:
                wm = br[(self._b_walls[bi[br]] > 0)]
                if len(wm) > 0:
                    _wf = self._walls_max_at(torch.full_like(col, row), col)[wm]
                    self.city_outer_hp[wm, row, col[wm]] = _wf
                    self._fit_encamp_outer(wm, row, col[wm], _wf)
            # CIV6 (Flood Barrier): built late, "those tiles can be repaired in
            # full and used again, along with anything that's on them".
            if self._barrier_bidx >= 0:
                self._repair_behind_barrier(row, col, made_b2 & (bi == self._barrier_bidx))
            # CIV6 (Intelligence Agency): "+1 Spy" — the free unit, at the
            # completing city.
            if bool((self._b_grant_unit >= 0).any()):
                bg = torch.full((self.B,), -1, dtype=torch.long, device=self.device)
                bg[br] = self._b_grant_unit[bi[br]]
                ctr_b = self.city_center[bidx, row, col]
                for u_i in sorted(set(int(x) for x in bg[bg >= 0].tolist())):
                    self._spawn_unit(row, made_b2 & (bg == u_i), ctr_b, u_i)
                    self._gen_ver += 1

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
                # CIV6 (Mausoleum): the charge reaches the engineers ALREADY
                # standing, not just the ones born after it.
                if int(self._wond_eng_ch.sum()) > 0:
                    _ec = torch.zeros(self.B, dtype=torch.long, device=self.device)
                    _ec[wr] = self._wond_eng_ch[wi[wr]]
                    if bool((_ec > 0).any()):
                        _mine = self.major_unit_alive & (self.major_unit_seat == row)                             & self._engineer_types(self.major_unit_type.clamp(min=0))
                        self.major_unit_charges += torch.where(
                            _mine, _ec.reshape(-1, 1).expand_as(self.major_unit_charges),
                            torch.zeros_like(self.major_unit_charges))
                        self._gen_ver += 1
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
                # CIV6 (Pyramids): "Grants a free Builder" — at the
                # completing city.
                if bool((self._wond_grant_unit >= 0).any()):
                    gu = torch.full((self.B,), -1, dtype=torch.long, device=self.device)
                    gu[wr] = self._wond_grant_unit[wi[wr]]
                    ctr_w = self.city_center[bidx, row, col]
                    for u_i in sorted(set(int(x) for x in gu[gu >= 0].tolist())):
                        self._spawn_unit(row, made_w & (gu == u_i), ctr_w, u_i)
                        self._gen_ver += 1
                # CIV6 (Stonehenge): the free Great Prophet, with the
                # Apostle fallback.
                if bool(self._wond_grant_prophet.any()):
                    sto = torch.zeros(self.B, dtype=torch.bool, device=self.device)
                    sto[wr] = self._wond_grant_prophet[wi[wr]]
                    self._grant_free_prophet(row, sto & made_w, self.city_center[bidx, row, col])

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
                    if int(prow.get("cr", 0)):
                        # CIV6 (Carbon Recapture): "-50 lifetime carbon
                        # emissions" and "+30 Diplomatic Favor" per
                        # completion, repeatable, and the total may go below
                        # zero — `_emit_carbon` never clamps.
                        self._emit_carbon(row, torch.where(
                            hit, torch.full_like(hit, -self._recapture_units, dtype=torch.float64),
                            torch.zeros(self.B, dtype=torch.float64, device=self.device)))
                        self.civ_diplo_favor[:, row] += hit.long() * self._recapture_favor
                    if int(prow.get("rec", 0)):
                        # CIV6 (Recommission Nuclear Reactor): the age counts
                        # the turns since the plant was built, converted to, or
                        # last recommissioned, so the project puts it back to 0.
                        _cr = hit.nonzero(as_tuple=True)[0]
                        if len(_cr) > 0:
                            self.city_reactor_age[_cr, row, col[_cr]] = 0
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
                        # The ORBITAL one is the seat's and pays whatever
                        # happens; the terrestrial one belongs to the city that
                        # has to power it.
                        if pidx in self._orbital_proj_idx:
                            self.civ_orbital_lasers[:, row] += hit.long()
                        else:
                            _lr = hit.nonzero(as_tuple=True)[0]
                            if len(_lr) > 0:
                                self.city_lasers[_lr, row, col[_lr]] += 1
                    _wk = int(prow.get("wmd", 0))
                    if _wk > 0:
                        # CIV6: the finished device joins the seat INVENTORY,
                        # not any city's.
                        self.civ_wmd[:, row, _wk - 1] += hit.long()
                    if int(prow["one"]):
                        step_k = self._once_step[pidx]
                        self.project_done[hit, row, step_k] = True
                        # The sourced per-step side effects (`completeProject`'s
                        # space arm; Mars Colony has none).
                        if pidx == self._proj_reveal_idx and self.fog_of_war:
                            # CIV6: Launch Earth Satellite reveals the entire
                            # map — the same fog gate as every reveal site.
                            self.seat_explored[hit, row] = True
                        if pidx == self._proj_moon_idx and sci_turn is not None:
                            # CIV6: one-time Culture of 10x science/turn, the
                            # applyLumpYield culture arm (pool + lifetime bank).
                            amt_c = js_round(10.0 * sci_turn)
                            self.civ_civic_prog[:, row] = torch.where(hit, self.civ_civic_prog[:, row] + amt_c, self.civ_civic_prog[:, row])
                            self.civ_culture[:, row] = torch.where(hit, self.civ_culture[:, row] + amt_c, self.civ_culture[:, row])
                        if pidx in self._once_victory_idx:
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

        Real Civ 6 fires and heals a city in its OWNER's turn, once — and
        CIV6 (Embrasure) buys the city one more shot from each district that
        has one."""
        Bn, dev2 = self.B, self.device
        bidx = torch.arange(Bn, device=dev2)
        heal = int(self.rules.combat.get("cityHealPerTurn", 20))
        # CIV6: walls give a city its ranged strike, and once the Outer Defense
        # "has been completely destroyed, its ranged strike again becomes
        # unavailable". "Building any level of Walls in the city will supply
        # both" the centre and its Encampment — each with its OWN pool — so
        # the district strikes only while ITS defenses are still up.
        walled = act & (self._walls_max_at(torch.full_like(col, row), col) > 0)
        perimeter = walled & (self.city_outer_hp[bidx, row, col] > 0)
        extra = (self._governor_sum(row, "extraStrikes")[bidx, col].long()
                 if self.n_governors else torch.zeros_like(col))
        n_strike = 1 + int(extra.max())
        for _sk in range(n_strike):
            self._seat_city_strike(row, col, perimeter & (extra >= _sk), "cstk")
        enc_reg = e0 = None
        if self._encamp_didx >= 0 and self.districts_on:
            # the city's OWN registry, which a capture clears — the districts
            # walk TS makes.
            enc_reg = self.city_dist_tile[bidx, row, col, self._encamp_didx]  # [B]
            e0 = enc_reg.clamp(min=0)
            enc_live = (enc_reg >= 0) & self.district_complete[bidx, e0] & ~self.district_pillaged[bidx, e0]
            _eperim = walled & (torch.minimum(
                self.encamp_outer_hp[bidx, e0],
                self._walls_max_at(torch.full_like(col, row), col)) > 0)
            _efire = _eperim & enc_live & (self.encamp_hp[bidx, e0] > 0)
            for _sk in range(n_strike):
                self._seat_city_strike(row, col, _efire & (extra >= _sk), "estk", origin=e0)
        ctr = self.city_center[bidx, row, col].clamp(min=0)
        nbh = self.neigh[ctr]
        nbc = nbh.clamp(min=0)
        _am = self.military_at.gather(1, nbc)
        _at = self.unit_type.gather(1, _am.clamp(min=0)).clamp(min=0, max=self.NU - 1)
        _as = torch.where(_am >= 0, self.unit_seat.gather(1, _am.clamp(min=0)), torch.full_like(_am, -1))
        # CIV6's siege: "if the invading army manages to establish zone of
        # control on all passable tiles surrounding the City Center, it will no
        # longer be able to repair the damage it suffers". EVERY passable
        # neighbour has to be held by a unit that EXERTS one: a civilian does
        # not, "Ranged and Bombard class units do not exert ZOC" (SUPPRESSION
        # hands it back), and CIV6 gives the two submarines "Does not exert
        # zone of control". `encircled` is the twin.
        _ap = self.unit_promos.gather(1, _am.clamp(min=0))
        _apc = self.rules_dev.u_promo_class[_at]
        _no_ex = ((_apc == self._pc_ranged) | (_apc == self._pc_siege))             & ~self._promo_flag(_at, _ap, "ZOC_EXERT")
        held = self._seats_hostile(row, _as) & (_am >= 0) & ~self._type_zoc_none[_at] & ~_no_ex
        passable = (nbh >= 0) & (self.passable | self.wpass).gather(1, nbc)
        besieged = passable.any(dim=1) & ~(passable & ~held).any(dim=1)
        # CIV6 (Defense Logistics): "City cannot be put under siege" — the ring
        # may close and the heal still runs.
        if self.n_governors:
            besieged = besieged & ~self._governor_flag(row, "noSiege")[bidx, col]
        # CIV6: a City Center caught in a blast has its HP reduced to 0 and
        # "Healing is impossible ... while the fallout lasts".
        _fo = self._fallout()
        ok = act & ~besieged & ~_fo[bidx, self.city_center[bidx, row, col].clamp(min=0)]
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
            rep = (ok & ~occupied & (enc_reg >= 0) & self.district_complete[bidx, e0]
                   & ~self.district_pillaged[bidx, e0] & ~_fo[bidx, e0])
            cur = self.encamp_hp[bidx, e0]
            self.encamp_hp[bidx, e0] = torch.where(rep, (cur + heal).clamp(max=self._encamp_hp_max), cur)

    def _bank_tourism_per_rival(self, row: int, active: torch.Tensor,
                                general: torch.Tensor, religious: torch.Tensor) -> None:
        """`bankTourismPerRival`'s twin: the national output lands on EACH
        foreign civ through its own summed international modifier, and the two
        RELIGIOUS-ONLY halvings — CIV6 (Tourism): "-50% (Religious Tourism
        only) for Different Religions. Note that this penalty doesn't apply if
        you haven't founded a religion" and "-50% ... if the foreign
        civilization has The Enlightenment", which Cristo Redentor's shield
        cancels — are summed into the religious half's own percent. Below
        -100% the rival takes nothing rather than draining the bank."""
        B, dev = self.B, self.device
        half = int(self.rules.seats.get("tourismReligiousPenaltyPct", 50))
        shielded = (self._seat_wonder_any(row, self._wond_holy_shield) if self._wond_n
                    else torch.zeros(B, dtype=torch.bool, device=dev))
        founded = self.civ_religion_done[:, row]
        dom = self._dominant_religion()  # [B, nrow]
        gen_l, rel_l = general.long(), religious.long()
        for o in range(self.n_majors):
            if o == row:
                continue
            pct = self._tourism_intl_pct(row, o)
            rel_pct = pct.clone()
            enl = (self._seat_civics(o)[:, self._enl_cidx] if self._enl_cidx >= 0
                   else torch.zeros(B, dtype=torch.bool, device=dev))
            rel_pct = rel_pct - (enl & ~shielded).long() * half
            other = founded & (dom[:, o] >= 0) & (dom[:, o] != row)
            rel_pct = rel_pct - other.long() * half
            add_g = torch.div(gen_l * (100 + pct).clamp(min=0), 100, rounding_mode="floor")
            add_r = torch.div(rel_l * (100 + rel_pct).clamp(min=0), 100, rounding_mode="floor")
            zero = torch.zeros_like(add_g)
            self.civ_tourism_to[:, row, o] += torch.where(active, add_g, zero)
            self.civ_tourism_rel_to[:, row, o] += torch.where(active, add_r, zero)

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

        # CIV6 (Alliance, level 1): the ally's routes INTO this seat pay the
        # receiver half of the typed route bonus - empire-level, per route.
        # CIV6 (Religious alliance 3): "+1 Faith for each of your Citizens
        # following your ally's religion."
        NMa = self.n_majors
        for _o in range(NMa):
            if _o == row:
                continue
            _aty = self.seat_alliance_type[:, row, _o]
            _live = self.seat_ally_turns[:, row, _o] > 0
            if bool((_live & (_aty >= 0)).any()):
                _a0 = _aty.clamp(min=0)
                _n = (self.seat_route_dseat[:, _o] == row).sum(dim=1).double()
                _amt = torch.where(_live & (_aty >= 0),
                                   self._al_route_from[_a0].double() * _n,
                                   torch.zeros_like(_n))
                _yc = self._al_route_ycol[_a0]
                sci_sum = sci_sum + torch.where(_yc == 3, _amt, torch.zeros_like(_amt))
                cul_sum = cul_sum + torch.where(_yc == 4, _amt, torch.zeros_like(_amt))
                gold_sum = gold_sum + torch.where(_yc == 2, _amt, torch.zeros_like(_amt))
                faith_sum = faith_sum + torch.where(_yc == 5, _amt, torch.zeros_like(_amt))
            _r3 = self._allied_type(row, 4, 3)[:, _o]
            if bool(_r3.any()):
                _fol = ((self.city_followed[:, row] == _o) & self.city_alive[:, row]).double()
                faith_sum = faith_sum + (_r3.double() * self._al_rel3_faith_pop
                                         * (_fol * self.city_pop[:, row].double()).sum(dim=1))
        # CIV6 (The Last Prophet): "+1 Science for each foreign city following
        # Arabia's Religion" (`FOREIGN_FOLLOWER_YIELD_ROWS`)
        for _fc, _fl, _fy, _fa, _fp in self._foreign_follower_yield_rows:
            _fw = self._row_is(row, _fc, _fl)
            if not bool(_fw.any()):
                continue
            _n = torch.div(self._foreign_follower_count(row), max(1, _fp), rounding_mode="floor")
            _amt = _fw.double() * _n.double() * _fa
            if _fy == 3:
                sci_sum = sci_sum + _amt
            elif _fy == 4:
                cul_sum = cul_sum + _amt
            elif _fy == 2:
                gold_sum = gold_sum + _amt
            elif _fy == 5:
                faith_sum = faith_sum + _amt
        # the seat's OUTPUT this turn, stored for allies' percentage reads -
        # written before those reads, so the terms never compound
        self.civ_sci_rate[:, row] = torch.where(active, sci_sum, self.civ_sci_rate[:, row])
        self.civ_cul_rate[:, row] = torch.where(active, cul_sum, self.civ_cul_rate[:, row])
        for _o in range(NMa):
            if _o == row:
                continue
            # CIV6 (Research alliance 3): "+10% of your ally's Science" while
            # researching a tech the ally completed, or the tech the ally is on
            _r3a = self._allied_type(row, 0, 3)[:, _o]
            if bool(_r3a.any()):
                curt = self.civ_cur_tech[:, row]
                done_o = self.civ_techs[:, _o].gather(1, curt.clamp(min=0).unsqueeze(1)).squeeze(1)
                co = (curt >= 0) & (done_o | (self.civ_cur_tech[:, _o] == curt))
                sci_sum = sci_sum + torch.where(
                    _r3a & co, self._al_r3_sci_pct * self.civ_sci_rate[:, _o], torch.zeros_like(sci_sum))
            # CIV6 (Cultural alliance 3): "+10% of your ally's Culture".
            _c3a = self._allied_type(row, 1, 3)[:, _o]
            if bool(_c3a.any()):
                cul_sum = cul_sum + torch.where(
                    _c3a, self._al_c3_cul_pct * self.civ_cul_rate[:, _o], torch.zeros_like(cul_sum))
        bank(self.civ_tech_prog, sci_sum)
        bank(self.seat_science_total, sci_sum)
        bank(self.civ_treasury, gold_sum)
        # a WON City-State Emergency pays +1 gold/turn per envoy, banked before
        # upkeep exactly as seatAccumulators is
        bank(self.civ_treasury, self._emergency_envoy_gold(row).to(self.civ_treasury.dtype))
        # CIV6 (Satyagraha): "+5 Faith for each civilization (including India)
        # they have met that has founded a Religion and is not currently at
        # war". Acquaintance between MAJORS is not modelled on either engine —
        # every one is known — so "met" is every live major.
        for _pc, _pl, _pa in self._peaceful_founder_rows:
            _pw = self._row_is(row, _pc, _pl)
            if not bool(_pw.any()):
                continue
            _n = torch.zeros(self.B, dtype=torch.float64, device=self.device)
            for _o in range(self.n_majors):
                _ok = self.civ_religion_done[:, _o]
                if _o != row:
                    _ok = _ok & ~self.war[:, row, _o]
                _n = _n + _ok.double()
            faith_sum = faith_sum + _pw.double() * _n * _pa
        bank(self.civ_faith, faith_sum)
        self._seat_upkeep_and_bankruptcy(row, active)
        for _ in range(RESEARCH_LOOPS):
            curt = self.civ_cur_tech[:, row]
            cost_t = self._eff_cost(
                rdv.t_cost.gather(0, curt.clamp(min=0)),
                self.civ_tech_boosted[:, row].gather(1, curt.clamp(min=0).unsqueeze(1)).squeeze(1),
                row,
            )
            fin = active & (curt >= 0) & (self.civ_tech_prog[:, row] >= cost_t)
            if not bool(fin.any()):
                break
            rows = fin.nonzero(as_tuple=True)[0]
            self.civ_techs[rows, row, curt[rows]] = True
            self._eff_version += 1
            # CIV6 (EFFECT_GRANT_UNIT_IN_CITY): the roster's free unit at this
            # technology, in the capital (`GRANT_UNIT_ROWS`)
            for _gc, _gl, _gu, _gt, _gf in self._grant_unit_rows:
                if _gt < 0 or _gu < 0:
                    continue
                _gm = fin & (curt == _gt) & self._row_is(row, _gc, _gl) & (self.civ_cap_tile[:, row] >= 0)
                if bool(_gm.any()):
                    self._spawn_unit(row, _gm, self.civ_cap_tile[:, row].clamp(min=0),
                                     torch.full((self.B,), _gu, dtype=torch.long, device=self.device))
            self._urban_defenses_fit(row, fin & (curt == self._urban_def_tech))
            # CIV6 (Global Warming Mitigation): "Awards 3 Envoys / Awards 1
            # Diplomatic Victory point" — once, at completion.
            if int(rdv.t_award_env.sum()) or int(rdv.t_award_dvp.sum()):
                self.civ_envoys_avail[:, row] += torch.where(fin, rdv.t_award_env.gather(0, curt.clamp(min=0)), torch.zeros_like(curt))
                self.civ_diplo_points[:, row] += torch.where(fin, rdv.t_award_dvp.gather(0, curt.clamp(min=0)), torch.zeros_like(curt))
            self.civ_tech_prog[:, row] = torch.where(fin, self.civ_tech_prog[:, row] - cost_t, self.civ_tech_prog[:, row])
            # A finished tech holds no parked science — its slot was emptied
            # when it became current — but clear it anyway, so the partition
            # cannot be broken by a future writer. The overflow stays in the
            # pool and belongs to whatever the next record picks.
            self.civ_tech_retain[rows, row, curt[rows]] = 0
            self.civ_cur_tech[:, row] = torch.where(fin, torch.full_like(curt, -1), self.civ_cur_tech[:, row])
        no_t = active & (self.civ_cur_tech[:, row] == -1) & ~self._available_mask(self.civ_techs[:, row], self._prereq_t).any(dim=1)
        self.civ_tech_prog[:, row] = torch.where(no_t, torch.minimum(self.civ_tech_prog[:, row], torch.zeros_like(self.civ_tech_prog[:, row])), self.civ_tech_prog[:, row])
        _nat_gen = self._tourism_of(
            self.city_gw_writing[:, row],
            self.city_gw_art[:, row] + self._art_themed_works(row),
            self.city_gw_music[:, row],
            self.city_alive[:, row],
            self.tile_seat == row,
            self._civ_era(self.civ_techs[:, row], self.civ_civics[:, row]),
            self.civ_techs[:, row, self._gw_printing_tech] if self._gw_printing_tech >= 0 else None,
            self._artifact_theming_counts(row),
            gw_kmult=self._congress_gw_kmult(),
            resort_mult=self._seat_wonder_mult(row, self._wond_resorttour) if self._wond_n else None,
            park_mult=torch.where(self._golden_ded(row, self._ded_wish),
                                  torch.full((self.B,), int(self._wish_park), dtype=torch.long, device=self.device),
                                  torch.ones(self.B, dtype=torch.long, device=self.device)),
            gov_tile=self._governor_tiles(row, gov),
            wonder_pct=sum(r[2] for r in self._wonder_tourism_rows
                           if bool(self._row_is(row, r[0], r[1]).any())),
            suz_tour=self._suzerain_tourism(row, self.tile_seat == row),
            gw_mult=js_round(self._governor_mult(row, "gwTourismMult")).long() if self.n_governors else None,
        )
        _rel_t = self._tourism_religious_of(row)
        self.civ_tour_rate[:, row] = torch.where(active, (_nat_gen + _rel_t).long(), self.civ_tour_rate[:, row])
        # CIV6 (Cultural alliance 3): "+20% of your ally's Tourism".
        _c3t = self._allied_type(row, 1, 3)
        for _o in range(self.n_majors):
            if _o != row and bool(_c3t[:, _o].any()):
                _nat_gen = _nat_gen + torch.where(
                    _c3t[:, _o],
                    torch.floor(self._al_c3_tour_pct * self.civ_tour_rate[:, _o].double()).long(),
                    torch.zeros_like(_nat_gen))
        bank(self.civ_tourism, _nat_gen)
        bank(self.civ_tourism_rel, _rel_t)
        self._bank_tourism_per_rival(row, active, _nat_gen, _rel_t)
        # POLICY TREATY outcome A pays every seat holding the named card, on
        # top of the government tier, the (Treaty-Organization-weighted)
        # suzerain term and CIV6 (Alliance): "In Gathering Storm, each Alliance
        # gives you +1 Diplomatic Favor per turn per level". Each ORIGINAL
        # CAPITAL this row sits in costs it. The rate can go negative, and the
        # bank floors at zero.
        bank(self.civ_diplo_favor,
             self._adopted_gov_tier(self.civ_civics[:, row])
             + self._favor_per_suz * self._suzerain_count(row)
             + self._favor_per_alliance * self._alliance_levels_of(row).sum(dim=1)
             + self._congress_policy_favor(self._seat_slotted(row))
             # CIV6 (Foreign Ministry, GS): "+3 Diplomatic Favor per turn."
             + self._seat_building_sum(row, self._b_favor)
             + self._card_favor_per_building(row)
             # CIV6 (Losing Favor): "-1/turn for every 3 pollution points
             # higher than average", capped at 20.
             - self._pollution_favor_penalty(row)
             # CIV6 (Losing Favor): "200 Grievance = -1 Diplomatic Favor.
             # Every 50 Grievance = -1", to a floor of -10.
             - self._grievance_favor_penalty(row).double()
             - self._favor_occ_capital * self._occupied_capitals(row)
             # CIV6 (Faces of Peace): "For every 100 Tourism per turn earn 1
             # Diplomatic Favor per turn" — this turn's OWN rate, the number
             # stored just above (`TOURISM_FAVOR_ROWS`)
             + self._tourism_favor_of(row).double()
             # CIV6 (Founding Fathers): "+1 Diplomatic Favor per turn for every
             # Wildcard slot in their government" (`SLOT_FAVOR_ROWS`)
             + self._slot_favor_of(row).double())
        self.civ_diplo_favor[:, row] = self.civ_diplo_favor[:, row].clamp(min=0)
        # The GRIEVANCE ledger's own turn: every original capital this row
        # sits in keeps charging while that war is over, and each pair decays
        # once, on its lower seat.
        self._grievance_held_capitals(row)
        self._grievance_decay(row)
        bank(self.civ_civic_prog, cul_sum)
        bank(self.civ_culture, cul_sum)
        for _ in range(RESEARCH_LOOPS):
            curc = self.civ_cur_civic[:, row]
            cost_c = self._eff_cost(
                rdv.c_cost.gather(0, curc.clamp(min=0)),
                self.civ_civic_boosted[:, row].gather(1, curc.clamp(min=0).unsqueeze(1)).squeeze(1),
                row, is_civic=True,
            )
            fin = active & (curc >= 0) & (self.civ_civic_prog[:, row] >= cost_c)
            if not bool(fin.any()):
                break
            rows = fin.nonzero(as_tuple=True)[0]
            self.civ_civics[rows, row, curc[rows]] = True
            self._eff_version += 1
            # CIV6 (Global Warming Mitigation): "Awards 3 Envoys / Awards 1
            # Diplomatic Victory point" — once, at completion.
            if int(rdv.c_award_env.sum()) or int(rdv.c_award_dvp.sum()):
                self.civ_envoys_avail[:, row] += torch.where(fin, rdv.c_award_env.gather(0, curc.clamp(min=0)), torch.zeros_like(curc))
                self.civ_diplo_points[:, row] += torch.where(fin, rdv.c_award_dvp.gather(0, curc.clamp(min=0)), torch.zeros_like(curc))
            self.civ_civic_prog[:, row] = torch.where(fin, self.civ_civic_prog[:, row] - cost_c, self.civ_civic_prog[:, row])
            self.civ_civic_retain[rows, row, curc[rows]] = 0
            self.civ_cur_civic[:, row] = torch.where(fin, torch.full_like(curc, -1), self.civ_cur_civic[:, row])
        # CIV6 (Legacy policy card): the card is unlocked by having BEEN in
        # its government, so the seat remembers the one it is in now. Only a
        # completed civic can move it, which is why this sits at the loop's
        # exit — the position `seatPhase` writes it at.
        if self._ngov:
            _adopted, _has = self._adopted_gov(self.civ_civics[:, row])
            self.civ_gov_held[:, row] |= torch.where(
                _has, torch.ones_like(_adopted) << _adopted, torch.zeros_like(_adopted))
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
        # CIV6 (The Last Prophet): the guarantee is checked on this seat's own
        # turn, ahead of the race, exactly as `advanceGreatPeople` does
        self._grant_guaranteed_great_people(row, active)
        # CIV6 (Oracle): "Districts in this city provide +2 Great Person points
        # of their type" — the HOLDING city's own districts only.
        dgpp = (self._city_wonder_flat(row, self._wond_distgpp)
                if self._wond_n and float(self._wond_distgpp.sum()) != 0.0
                else torch.zeros(B, 1, dtype=torch.float64, device=dev))
        # CIV6 (Cultural alliance 2): +1 Great Person point per class-matched
        # district in origin cities holding a Trade Route to the ally.
        c2 = torch.zeros(B, self.RC, dtype=torch.float64, device=dev)
        if self._al_c2_gpp:
            c2ally = self._allied_type(row, 1, 2)
            if bool(c2ally.any()):
                ds = self.seat_route_dseat[:, row]
                to_ally = (ds >= 0) & (ds < self.n_majors) & c2ally.gather(1, ds.clamp(min=0, max=self.n_majors - 1))
                ids = self.city_id[:, row]
                hit = ((self.seat_routes[:, row, :, 0].unsqueeze(2) == ids.unsqueeze(1))
                       & to_ally.unsqueeze(2)).any(dim=1)
                c2 = (hit & self.city_alive[:, row]).double() * float(self._al_c2_gpp)
        # CIV6 (Grants): "+100% Great People points generated per turn in
        # the city" — a PER-CITY factor over everything the city generates.
        gm = (self._governor_mult(row, "gppMult") if self.n_governors
              else torch.ones(B, self.RC, dtype=torch.float64, device=dev))
        for cls in range(self._gp_nc):
            d_cls = int(self._gp_class_district[cls]) if cls < self._gp_nc else -1
            comp_c = torch.zeros(B, self.RC, dtype=torch.bool, device=dev)
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
                # CIV6 (Nobel Prize, EFFECT_ADJUST_GREAT_PERSON_POINTS): the
                # roster's own per-BUILDING points, in the same per-city term
                nb_r = torch.zeros(B, self.RC, dtype=torch.float64, device=dev)
                for _gc, _gl, _gb, _gcls, _ga in self._gpp_building_rows:
                    if _gcls != cls or _gb < 0:
                        continue
                    nb_r = nb_r + (self.city_bldg[:, row, :, _gb]
                                   & self._row_is(row, _gc, _gl).unsqueeze(1)).double() * _ga
                pts = (comp_c.double() * (1.0 + gflat + dgpp + nb_of.double() + nb_r + c2) * gm).sum(dim=1)
            else:
                pts = torch.zeros(B, dtype=torch.float64, device=dev)
            if cls == self._prophet_cls:
                pts = pts + self._golden_ded(row, self._ded_exodus).double() * 4.0
            # CIV6: a wonder's per-turn points are the OWNER's, paid whether or
            # not the holding city has the class's district — and generated IN
            # the holding city, so Grants reaches them.
            if self._wond_n and cls < self._wond_gpp.shape[1] and float(self._wond_gpp[:, cls].sum()) != 0.0:
                pts = pts + (self._city_wonder_flat(row, self._wond_gpp[:, cls]).double() * gm).sum(dim=1)
            # CIV6 (Patronage resolution): the factor covers every per-turn
            # source, the golden prophet term included.
            pts = pts * self._congress_gpp_factor(cls)
            # CIV6 (Classical Republic): "+15% Great Person points" — the
            # government's factor covers every per-turn source the same way.
            if self._gov_has_effects:
                pts = pts * self._gov_mods(row)[12]["gppmult"]
            # CIV6 (EFFECT_ADJUST_GREAT_PERSON_POINTS_PERCENT): the roster's
            # per-class factor, over every source like the government's
            if self._gpp_class_rows:
                pts = pts * self._gpp_class_mult(row, cls)
            # CIV6 (EFFECT_ADJUST_CITY_HAPPINESS_GREAT_PERSON): the roster's
            # happiness rows (`HAPPY_GPP_ROWS`) — a FLAT add per city at the
            # named tier holding the named district, after every factor
            for _hc, _hl, _ht, _hcls, _hd, _ha in self._happy_gpp_rows:
                if _hcls != cls:
                    continue
                _hw = self._row_is(row, _hc, _hl)
                if not bool(_hw.any()) or not self.districts_on:
                    continue
                _reg = self.city_dist_tile[:, row, :, _hd]
                _stand = ((_reg >= 0) & self.district_complete.gather(1, _reg.clamp(min=0))
                          & ~self.district_pillaged.gather(1, _reg.clamp(min=0))
                          & self.city_alive[:, row])
                _tier = self._seat_amenity(row)[0]
                pts = pts + (_stand & (_tier == _ht) & _hw.unsqueeze(1)).sum(dim=1).double() * _ha
            # CIV6 (Mana): "Great Writers cannot be earned"; (Religious
            # Convert): no Great Prophets — the class banks nothing and
            # recruits nothing (`SEAT_BAN_ROWS`)
            _ban = torch.zeros(B, dtype=torch.bool, device=dev)
            if cls == self._writer_cls:
                _ban = _ban | self._row_banned(row, self.BAN_GREAT_WRITER)
            if cls == self._prophet_cls:
                _ban = _ban | self._row_banned(row, self.BAN_GREAT_PROPHET)
            if bool(_ban.any()):
                pts = torch.where(_ban, torch.zeros_like(pts), pts)
                self.civ_gpp[:, row, cls] = torch.where(
                    _ban, torch.zeros_like(self.civ_gpp[:, row, cls]), self.civ_gpp[:, row, cls])
            self.civ_gpp[:, row, cls] = torch.where(
                active & (pts > 0), self.civ_gpp[:, row, cls] + pts, self.civ_gpp[:, row, cls]
            )
            maxN = self._gp_effects.shape[1]
            # maxN + 1: a turn claiming the WHOLE roster still reaches the
            # exhaustion draw, so both engines convert the same turn.
            for _ in range(maxN + 1):
                self._gp_ensure_offer(active, cls)
                has_person = self.gp_offer[:, cls] >= 0
                gcost = self.gp_price[:, cls]
                # the PASSER is locked out of this individual — points wait
                hit = active & has_person & (self.gp_passed_by[:, cls] != row) \
                    & (self.civ_gpp[:, row, cls] >= gcost) & ~_ban
                if not bool(hit.any()):
                    break
                self.civ_gpp[:, row, cls] = torch.where(hit, self.civ_gpp[:, row, cls] - gcost, self.civ_gpp[:, row, cls])
                self._gp_claim(row, hit, cls)
            # CIV6: "GPPs that can no longer be used are converted to Faith,
            # in a 1:1 ratio" — the exhausted class's stock and flow alike.
            exh = active & (self.gp_offer[:, cls] == -2) & (self.civ_gpp[:, row, cls] > 0)
            if bool(exh.any()):
                self.civ_faith[:, row] = torch.where(
                    exh, self.civ_faith[:, row] + self.civ_gpp[:, row, cls].to(self.dtype),
                    self.civ_faith[:, row])
                self.civ_gpp[:, row, cls] = torch.where(
                    exh, torch.zeros_like(self.civ_gpp[:, row, cls]), self.civ_gpp[:, row, cls])

    def _gp_ensure_offer(self, active: torch.Tensor, cls: int) -> None:
        """The DRAW, where pending. CIV6: "the replacement is chosen randomly
        from those available in the current era, or the next if all those
        from the current era have been claimed" — the pool is the FIRST era
        at or past the world's with an unclaimed member; the price freezes
        with the pick; no pool anywhere ahead = -2 for good, and that
        verdict draws no random (`ensureGpOffer`)."""
        nR = int(self._gp_roster[cls]) if cls < int(self._gp_roster.numel()) else 0
        need = active & (self.gp_offer[:, cls] == -1)
        if not bool(need.any()) or nR <= 0:
            return
        dev = self.device
        world_era = self._world_era()
        uncl = ~self.gp_claimed[:, cls, :nR]
        p_eras = self._gp_era[cls, :nR].clamp(min=0, max=8)
        e9 = torch.arange(9, device=dev)
        era_open = (uncl.unsqueeze(2)
                    & (p_eras.reshape(1, -1, 1) == e9.reshape(1, 1, 9))).sum(dim=1)
        e_ok = (e9.reshape(1, 9) >= world_era.unsqueeze(1)) & (era_open > 0)
        has_pool = e_ok.any(dim=1)
        e_pick = e_ok.long().argmax(dim=1)
        pool = uncl & (p_eras.reshape(1, -1) == e_pick.unsqueeze(1))
        rp = self._next_random(need & has_pool)
        n_open = pool.sum(dim=1)
        k = torch.floor(rp * n_open.to(torch.float64)).to(torch.long)
        cum = pool.long().cumsum(dim=1)
        sel = pool & (cum == (k + 1).unsqueeze(1))
        pid = sel.long().argmax(dim=1)
        dr = (need & has_pool).nonzero(as_tuple=True)[0]
        self.gp_offer[dr, cls] = pid[dr]
        self.gp_price[:, cls] = torch.where(
            need & has_pool, self._gp_cost(cls, pid, world_era), self.gp_price[:, cls])
        xr = (need & ~has_pool).nonzero(as_tuple=True)[0]
        self.gp_offer[xr, cls] = -2

    def _grant_guaranteed_great_people(self, row: int, active: torch.Tensor) -> None:
        """CIV6 (The Last Prophet): "Automatically receive the final Great
        Prophet when the next-to-last one is claimed (if you have not earned a
        Great Prophet already)." Read on this seat's OWN turn, so a class
        another seat claimed down to its last member is caught the turn after —
        both engines read it at the same point in the seat loop
        (`grantGuaranteedGreatPeople`, `GP_GUARANTEE_ROWS`)."""
        for _gc, _gl, _cls in self._gp_guarantee_rows:
            if _cls < 0 or _cls >= self._gp_nc:
                continue
            who = active & self._row_is(row, _gc, _gl)
            if not bool(who.any()):
                continue
            nR = int(self._gp_roster[_cls]) if _cls < int(self._gp_roster.numel()) else 0
            if nR <= 0:
                continue
            claimed = self.gp_claimed[:, _cls, :nR].sum(dim=1)
            due = who & (self.civ_gp_earned[:, row, _cls] == 0) & (claimed == nR - 1)
            if not bool(due.any()):
                continue
            self._gp_ensure_offer(due, _cls)
            self._gp_claim(row, due & (self.gp_offer[:, _cls] >= 0), _cls)

    def _grant_free_prophet(self, row: int, sto: torch.Tensor, centre: torch.Tensor) -> None:
        """CIV6 (Stonehenge): "Grants a free Great Prophet (or a free Apostle
        if no Prophets are available)" — religion founded or the class spent
        pays an Apostle; a standing Prophet with no religion pays nothing;
        otherwise the class's offer is claimed FREE (`grantFreeProphet`)."""
        if not bool(sto.any()):
            return
        cls = self._prophet_cls
        if cls < 0 or cls >= self._gp_nc:
            return
        founded = self.civ_religion_done[:, row]
        p_ut = int(self._gp_class_unit[cls]) if cls < int(self._gp_class_unit.numel()) else -1
        if p_ut >= 0:
            standing = (self.major_unit_alive & (self.major_unit_seat == row)
                        & (self.major_unit_type == p_ut)).any(dim=1)
        else:
            standing = torch.zeros(self.B, dtype=torch.bool, device=self.device)
        self._gp_ensure_offer(sto, cls)
        none_m = sto & ~founded & standing  # the page's "you will not receive a unit"
        free = sto & ~founded & ~standing & (self.gp_offer[:, cls] >= 0)
        self._gp_claim(row, free, cls)
        apo = sto & ~none_m & ~free
        if self._apostle_idx >= 0 and bool(apo.any()):
            self._spawn_unit(row, apo, centre, self._apostle_idx)
            self._gen_ver += 1

    def _gp_claim(self, row: int, hit: torch.Tensor, cls: int) -> None:
        """The CLAIM shared by the seat-phase race and patronage (the
        `recruit` twin): mark the person claimed, retire the offer, pay era
        score and the dedication, and stand the person up as a UNIT — in the
        city holding a completed district of its own class (lowest centre
        tile), the capital otherwise. Nothing is paid out here; the redraw
        waits for the race loop. The ONE draw is the Great Library's — a
        SCIENTIST claim hands every other holder a random boost."""
        if not bool(hit.any()):
            return
        maxN = self._gp_effects.shape[1]
        at_c = self.gp_offer[:, cls].clamp(min=0)
        # CIV6 (Magnanimous): "After recruiting or patronizing a Great Person,
        # 20% of its Great Person point cost is refunded" — read the price
        # BEFORE the offer is retired below (`GP_REFUND_ROWS`)
        for _rc, _rl, _rp in self._gp_refund_rows:
            _rw = hit & self._row_is(row, _rc, _rl)
            if not bool(_rw.any()):
                continue
            _back = torch.floor(self.gp_price[:, cls].double() * _rp / 100.0)
            self.civ_gpp[:, row, cls] = torch.where(
                _rw, self.civ_gpp[:, row, cls] + _back, self.civ_gpp[:, row, cls])
        self.gp_earned[:, cls] = self.gp_earned[:, cls] + hit.long()
        # this SEAT's own tally of the class, beside the global one
        self.civ_gp_earned[:, row, cls] = self.civ_gp_earned[:, row, cls] + hit.long()
        hr = hit.nonzero(as_tuple=True)[0]
        self.gp_claimed[hr, cls, at_c[hr]] = True
        self.gp_offer[:, cls] = torch.where(hit, torch.full_like(at_c, -1), self.gp_offer[:, cls])
        # the claim ends the pass: the NEXT person starts with nobody locked out
        self.gp_passed_by[:, cls] = torch.where(hit, torch.full_like(at_c, -1), self.gp_passed_by[:, cls])
        # CIV6 (Nobel Prize): "+50 Diplomatic Favor when earning a Great
        # Person" — every class, patronage included (`GP_FAVOR_ROWS`)
        for _fc, _fl, _fa in self._gp_favor_rows:
            _fw = hit & self._row_is(row, _fc, _fl)
            self.civ_diplo_favor[:, row] = self.civ_diplo_favor[:, row] + _fw.to(self.civ_diplo_favor.dtype) * _fa
        self._add_era_score(row, self._era_pts["gp"], hit.long())  # per GP earned
        # CIV6 (Sky and Stars): "+1 Era Score each time a Great
        # Person is Earned."
        self._dedication_event(row, self._ded_sky, hit)
        # CIV6 (Great Library): "Receive a random tech boost after another
        # player recruits a Great Scientist" — every OTHER holder of a
        # completed carrier draws one, ascending seat order, so the stream is
        # identical on both engines.
        if cls == self._gp_scientist and bool(self._wond_rival_sci.any()):
            wsel = self._wond_rival_sci.nonzero(as_tuple=True)[0]
            for b in hr.tolist():
                one = torch.zeros(self.B, dtype=torch.bool, device=self.device)
                one[b] = True
                for o in range(self.n_majors):
                    if o == row:
                        continue
                    reg = self.city_wonder[b, o][:, wsel]
                    if not bool(((reg >= 0) & self.built_wonder_complete[b, reg.clamp(min=0)]).any()):
                        continue
                    pool = (~self.civ_techs[b, o] & ~self.civ_tech_boosted[b, o]).nonzero(as_tuple=True)[0]
                    if pool.numel() == 0:
                        continue
                    k = int(self._next_random(one)[b] * pool.numel())
                    self.civ_tech_boosted[b, o, int(pool[min(k, pool.numel() - 1)])] = True
        guidx = int(self._gp_class_unit[cls]) if cls < int(self._gp_class_unit.numel()) else -1
        if guidx < 0:
            return
        cap_t = torch.where(self.city_is_cap[:, row] & self.city_alive[:, row],
                            self.city_center[:, row],
                            torch.full_like(self.city_center[:, row], -1)).max(dim=1).values
        d_cls = int(self._gp_class_district[cls]) if cls < self._gp_nc else -1
        if d_cls >= 0 and self.districts_on:
            reg_c = self.city_dist_tile[:, row, :, d_cls]
            comp_c = (reg_c >= 0) & self.district_complete.gather(1, reg_c.clamp(min=0)) & ~self.district_pillaged.gather(1, reg_c.clamp(min=0))
            _okc = comp_c & self.city_alive[:, row]
            _cand = torch.where(_okc, self.city_center[:, row],
                                torch.full_like(self.city_center[:, row], 1 << 30))
            _at = _cand.min(dim=1).values
            born_t = torch.where(_at >= (1 << 30), cap_t, _at)
        else:
            born_t = cap_t
        self._spawn_unit(row, hit & (born_t >= 0), born_t, guidx,
                         charges=self._gp_charges[cls, at_c.clamp(max=maxN - 1)],
                         gp_at=at_c.clamp(max=maxN - 1))
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
        # CIV6 (Stonehenge): "Prophets may found a religion on Stonehenge
        # instead of a Holy Site."
        if self._wond_n and bool(self._wond_religion_site.any()):
            has_hs = has_hs | self._seat_wonder_any(row, self._wond_religion_site)
        # CIV6 (Religious Convert): "May not ... found Religions"
        rdue = (active & ~self.civ_religion_done[:, row] & self.civ_pantheon_done[:, row]
                & (self.civ_prophets[:, row] > 0) & has_hs
                & ~self._row_banned(row, self.BAN_FOUND_RELIGION))
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
        for m in ("military_at", "civilian_at", "embarked_at"):
            at = getattr(self, m)
            mine = (at >= lo) & (at < hi)
            # gather evaluates EVERY lane, including the ones torch.where
            # discards, so the index must be clamped to inv's width — a slot
            # from another pool is out of range by construction.
            at.copy_(torch.where(mine, inv.gather(1, (at - lo).clamp(min=0, max=inv.shape[1] - 1)) + lo, at))

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
        # EVERY city plane rides the permutation, the list DERIVED from
        # `_MUTABLE` by geometry <EM> a hand-transcribed list drifts and silently
        # leaves a new plane's facts at the old slot index, handing one city's
        # founder or pins to its neighbour at the first compaction.
        # In place, for the same reason as _reclaim_pool: these planes are
        # views of one merged city tensor, and a setattr rebind here would
        # orphan every alias at the first compaction.
        for name in simbase._MUTABLE:
            if not name.startswith("city_"):
                continue
            full = getattr(self, name)
            assert full.dim() >= 3 and full.shape[2] == self.RC and full.shape[1] >= nrows,                 f"{name} is not a (B, rows, RC, ...) city-slot plane"
            t = full[:, :nrows]
            p = perm if t.dim() == 3 else perm.reshape(
                perm.shape + (1,) * (t.dim() - 3)).expand_as(t)
            t.copy_(t.gather(2, p))
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
