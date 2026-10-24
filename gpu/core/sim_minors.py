from __future__ import annotations

from .simbase import *  # noqa: F401,F403 — torch, constants, helpers: the shared floor
from . import simbase


class SimMinors:
    def _city_state_phase(self) -> None:
        if self.S == 0:
            return
        # each minor in turn — the `minorPhase` order, one minor at a time
        # because a district one minor lands may lend a neighbour's district
        # adjacency across the border: its levied army home when due, its
        # strategic resources' income (`_seat_accrue_stockpile`, a major's
        # body over its own bank), its grid; its economy and the research it
        # completes; its city — the
        # step works the item in hand, then growth and borders on the city as
        # it stands after that (its city presses a religion it follows on the
        # founder's turn); its military AI's Combat Desire; its savings and
        # military AI's turn (`_minor_military_turn`); its knowledge
        # base's look; then its actions — the
        # upgrades a completion triggers, its city AI's turn (`_minor_ai_turn`:
        # its builds, purchases and trees, the trees' Builders' work), its
        # trade routes, its city's ranged strikes (the majors' own body,
        # `cityStrikes`), its units' tactical turn; its look again; and the
        # boosts the turn earned (`_detect_minor_boosts`); its turn's end
        # holds each stockpile to its cap (`_seat_cap_stockpile`)
        col0 = torch.zeros(self.B, dtype=torch.long, device=self.device)
        for s in range(self.S):
            alive = self.citystate_alive[:, s]
            if not bool(alive.count_nonzero()):
                continue
            self._minor_levy_return(s)
            self._seat_accrue_stockpile(self._CITY_MINOR0 + s)
            # its units' fuel, out of the same bank, before its grid
            self._seat_charge_upkeep(self._CITY_MINOR0 + s)
            self._minor_power(s)
            gained = self._minor_economy(s)
            self._store_unit_strength(s, alive)
            self._minor_build(s, self._minor_production(s))
            # its city AI's full update reads its growth here, before the growth
            g = self._cv_minor_facts(s).growth()
            now = torch.stack([g["surplus"], g["housing"], g["population"], g["stored"], g["multiplier"]], -1)
            self.citystate_ai_growth[:, s] = torch.where(alive.unsqueeze(-1), now, self.citystate_ai_growth[:, s])
            self._minor_growth(s)
            self._minor_research_ai(s)
            self._minor_combat_desire(s)
            self._minor_military_turn(s)
            self._minor_knowledge(s, True)
            self._minor_upgrades(s, gained)
            self._minor_ai_turn(s)
            self._minor_trade(s)
            self._city_strikes(self._CITY_MINOR0 + s, col0, alive)
            self._minor_tactics(s)
            # its knowledge base's trade record at its tactical turn
            self._minor_trade_value(s, alive)
            self._minor_knowledge(s, False)
            # the boosts its turn earned
            self._detect_minor_boosts(s, alive)
            self._seat_cap_stockpile(self._CITY_MINOR0 + s)

    def _detect_minor_boosts(self, s: int, active: torch.Tensor) -> None:
        """`detectBoosts` for city-state `s`: every trigger read off the state
        as it stands (`_boost_triggers` on its city row), then each target
        landed (`_land_minor_boosts`), techs first; a city-state pays no
        dedication"""
        tab = self._boost_tables()
        hit = self._boost_triggers(self._CITY_MINOR0 + s, s) & active.unsqueeze(1)
        for target, held in (("tech", self.citystate_techs), ("civic", self.citystate_civics)):
            w = torch.zeros_like(held[:, s])
            for i, idx in tab["to_" + target]:
                w[:, idx] |= hit[:, i]
            if bool(w.count_nonzero()):
                self._land_minor_boosts(s, w, target == "civic")

    def _land_minor_boosts(self, s: int, want: torch.Tensor, is_civic: bool) -> torch.Tensor:
        """`markBoost` on city-state `s` over every item at once: the items of
        `want` [B, N] neither held nor boosted that carry a `Boosts` row are
        marked boosted and their percent (`_boost_amount`, no points) lands as
        progress — the item in hand's pool or the progress kept on it —,
        never past its cost; an item that reaches its cost completes at once
        (`_minor_complete_now`). Returns the items newly boosted."""
        held = (self.citystate_civics if is_civic else self.citystate_techs)[:, s]
        boosted = (self.citystate_civic_boosted if is_civic else self.citystate_tech_boosted)[:, s]
        pct = self._civic_boost_pct if is_civic else self._tech_boost_pct
        n = min(want.shape[1], held.shape[1], pct.numel())
        newly = torch.zeros_like(held)
        newly[:, :n] = want[:, :n] & ~held[:, :n] & ~boosted[:, :n] & (pct[:n] > 0).unsqueeze(0)
        if not bool(newly.count_nonzero()):
            return newly
        boosted |= newly
        cost_n = self._research_cost(is_civic)[:, :n]
        prog = self.citystate_civic_prog if is_civic else self.citystate_tech_prog
        retain = self.citystate_civic_retain if is_civic else self.citystate_tech_retain
        cur = (self.citystate_cur_civic if is_civic else self.citystate_cur_tech)[:, s]
        is_cur = torch.arange(n, device=self.device).unsqueeze(0) == cur.unsqueeze(1)
        have = torch.where(is_cur, prog[:, s].unsqueeze(1), retain[:, s, :n])
        amt = self._boost_amount(cost_n, pct[:n].long().unsqueeze(0), torch.zeros_like(cost_n[:, :1])).to(have.dtype)
        add = torch.minimum(cost_n.to(have.dtype) - have, amt)
        go = newly[:, :n] & (add > 0)
        add = torch.where(go, add, torch.zeros_like(add))
        prog[:, s] += (add * is_cur.to(add.dtype)).sum(dim=1)
        retain[:, s, :n] += torch.where(is_cur, torch.zeros_like(add), add)
        full = torch.zeros_like(held)
        full[:, :n] = go & (have + add >= cost_n.to(have.dtype))
        if bool(full.count_nonzero()):
            self._minor_complete_now(s, full, is_civic)
        return newly

    def _minor_complete_now(self, s: int, full: torch.Tensor, is_civic: bool) -> None:
        """`minorCompleteNow`: the items of `full` [B, N] COMPLETED outside
        city-state `s`'s research step — held, the progress kept on them
        spent, Urban Defenses' walls fitted; the item in hand makes the
        completion's choice over the analysis its last turn left (none where
        it has none), the completed row the key"""
        held = self.citystate_civics if is_civic else self.citystate_techs
        retain = self.citystate_civic_retain if is_civic else self.citystate_tech_retain
        prog = self.citystate_civic_prog if is_civic else self.citystate_tech_prog
        curp = self.citystate_cur_civic if is_civic else self.citystate_cur_tech
        held[:, s] |= full
        retain[:, s] = torch.where(full, torch.zeros_like(retain[:, s]), retain[:, s])
        if not is_civic and 0 <= self._urban_def_tech < full.shape[1]:
            hit = full[:, self._urban_def_tech]
            if bool(hit.count_nonzero()):
                self._minor_urban_fit(s, hit)
        cur = curp[:, s]
        on_cur = (cur >= 0) & full.gather(1, cur.clamp(min=0).unsqueeze(1)).squeeze(1)
        if not bool(on_cur.count_nonzero()):
            return
        done = torch.where(on_cur, cur, torch.full_like(cur, -1))
        curp[:, s] = torch.where(on_cur, torch.full_like(cur, -1), cur)
        prog[:, s] = torch.where(on_cur, torch.zeros_like(prog[:, s]), prog[:, s])
        if is_civic:
            fire = on_cur & self.citystate_cai_valid[:, s]
            if bool(fire.count_nonzero()):
                ent = (self.citystate_cai_turns[:, s], self.citystate_cai_next[:, s], self.citystate_cai_base[:, s],
                       self.citystate_cai_score[:, s], self.citystate_cai_owned[:, s])
                self._cai_take(s, self._cai_choice(s, fire, ent, done))
            return
        fire = on_cur & self.citystate_ai_valid[:, s]
        if bool(fire.count_nonzero()):
            turns, base = self.citystate_ai_turns[:, s], self.citystate_ai_base[:, s]
            score = self.citystate_ai_score[:, s] + self._rai_upstream(self.citystate_techs[:, s], base, turns)
            score = score + self._rai_contracts(s, score, self.citystate_ai_owned[:, s], live=True)
            pick, goal = self._rai_choice(s, fire, (turns, self.citystate_ai_next[:, s], base, score, self.citystate_ai_owned[:, s]), done)
            self._rai_take(s, pick, goal)

    def _minor_sight(self, s: int) -> torch.Tensor:
        """[B, T] bool — `cityStateSight`: the plots minor `s` sees now — its
        plots and those beside them, the plots within two of its centre, and
        each of its units' look (`_unit_sight`, cut by `_los_disk`)."""
        B, T = self.B, self.T
        seat = 100 + s
        if getattr(self, "_ring1", None) is None:
            # each plot and the plots beside it, padded with -1
            near = self.pair_dist.to(torch.long) <= 1
            w = int(near.sum(dim=1).max())
            order = torch.argsort((~near).to(torch.int8), dim=1, stable=True)[:, :w]
            self._ring1 = torch.where(near.gather(1, order), order, torch.full_like(order, -1))
        ring = self._ring1
        own = self.tile_seat == seat
        seen = (own.gather(1, ring.clamp(min=0).reshape(1, -1).expand(B, -1)).reshape(B, T, -1)
                & (ring >= 0).unsqueeze(0)).any(dim=2)
        centre = self.citystate_center[:, s]
        seen = seen | ((self.pair_dist[centre.clamp(min=0)].to(torch.long) <= 2) & (centre >= 0).unsqueeze(1))
        mine = self.unit_alive & (self.unit_seat == seat)
        for j in mine.any(dim=0).nonzero(as_tuple=True)[0].tolist():
            k = mine[:, j].nonzero(as_tuple=True)[0]
            utp = self.unit_type[k, j]
            upr = self.unit_promos[k, j]
            rad = self._unit_sight(utp, upr, self.unit_seat[k, j], k)
            seen[k] = seen[k] | self._los_disk(k, self.unit_tile[k, j].clamp(min=0), rad, self._sees_through(utp, upr))
        return seen

    def _minor_knowledge(self, s: int, age: bool) -> None:
        """`minorKnowledge` — minor `s`'s knowledge base's look over the plots
        it sees (`_minor_sight`): its army records, its camps."""
        alive = self.citystate_alive[:, s]
        if not bool(alive.count_nonzero()):
            return
        sight = self._minor_sight(s)
        self._knowledge_look(s, 100 + s, sight, alive, age)
        self._mops_camps_look(s, sight, alive)

    def _knowledge_look(self, r: int, seat: int, sight: torch.Tensor, alive: torch.Tensor, age: bool) -> None:
        """`knowledgeLook` — the knowledge base's army records on row `r` of
        the knowledge tensors (a city-state's, or the barbarians' `BK`) for
        player `seat` (CivKnowledge 0x5e9530), in the games of `alive`.
        `age`: the player's tactical turn (0x785f30) — every record ages and
        one past 21 turns drops — then the look; else the look alone (its
        turn's end). The look: each unit on a plot of `sight` (a hidden
        stealth unit or another's Spy not) refreshes its record — the one of
        its pool slot, owner and type — with the turn and its plot, or takes a
        free record, numbered after the last added (`citystate_kb_seq`, the
        records' order). A record's slot is -1 once the pool reclaims it (its
        unit long dead), -2 a free one."""
        B, dev = self.B, self.device
        turn = int(self.turn)
        slot = self.citystate_kb_slot[:, r]
        owner = self.citystate_kb_owner[:, r]
        typ = self.citystate_kb_type[:, r]
        seen_t = self.citystate_kb_seen[:, r]
        plot = self.citystate_kb_plot[:, r]
        seq = self.citystate_kb_seq[:, r]
        K = slot.shape[1]
        if age:
            self.citystate_kb_aged[:, r] = torch.where(alive, turn, self.citystate_kb_aged[:, r])
            drop = (slot != -2) & (turn - seen_t.long() > 21) & alive.unsqueeze(1)
            if bool(drop.count_nonzero()):
                slot[drop] = -2
                for q in (owner, typ, seen_t, plot, seq):
                    q[drop] = -1
        tile = self.unit_tile.clamp(min=0)
        vis = self.unit_alive & (self.unit_tile >= 0) & sight.gather(1, tile) & alive.unsqueeze(1)
        if self._stealth_live:
            ut = self.unit_type.clamp(min=0, max=self.NU - 1)
            stealthy = self._type_stealth.take(ut) | self._promo_flag(ut, self.unit_promos, "STEALTH")
            vis = vis & ~(stealthy & self._stealth_hidden(seat).gather(1, tile) & (self.unit_seat != seat))
        if self._spy_idx >= 0:
            vis = vis & ~((self.unit_type == self._spy_idx) & (self.unit_seat != seat))
        # the barbarians' look reads the map's layer 0: no Trader
        if seat == BARB_SEAT:
            vis = vis & (self.unit_type != self._trader_idx)
        if not bool(vis.count_nonzero()):
            return
        U = vis.shape[1]
        sl = slot.long()
        cur_t = self.unit_type.gather(1, sl.clamp(min=0))
        cur_o = self.unit_seat.gather(1, sl.clamp(min=0))
        match = (sl >= 0) & (typ.long() == cur_t) & (owner.long() == cur_o)
        rec = torch.full((B, U + 1), -1, dtype=torch.long, device=dev)
        rec.scatter_(1, torch.where(match, sl, torch.full_like(sl, U)),
                     torch.arange(K, device=dev).unsqueeze(0).expand(B, -1).contiguous())
        rec = rec[:, :U]
        hit = vis & (rec >= 0)
        dmg = self.citystate_kb_damage[:, r]
        hp_max = int(self.rules.combat["unitHp"])
        if bool(hit.count_nonzero()):
            b, u = hit.nonzero(as_tuple=True)
            k = rec[b, u]
            seen_t[b, k] = turn
            plot[b, k] = self.unit_tile[b, u].to(plot.dtype)
            dmg[b, k] = (hp_max - self.unit_hp[b, u]).to(dmg.dtype)
        new = vis & (rec < 0)
        if bool(new.count_nonzero()):
            free = slot == -2
            if bool((new.sum(dim=1) > free.sum(dim=1)).any()):
                raise RuntimeError(f"_knowledge_look: more than KB_RECORDS={K} army records")
            pos = torch.argsort((~free).to(torch.int8), dim=1, stable=True)
            rank = new.long().cumsum(dim=1) - 1
            b, u = new.nonzero(as_tuple=True)
            k = pos[b, rank[b, u]]
            slot[b, k] = u.to(slot.dtype)
            owner[b, k] = self.unit_seat[b, u].to(owner.dtype)
            typ[b, k] = self.unit_type[b, u].to(typ.dtype)
            seen_t[b, k] = turn
            plot[b, k] = self.unit_tile[b, u].to(plot.dtype)
            dmg[b, k] = (hp_max - self.unit_hp[b, u]).to(dmg.dtype)
            nxt = self.citystate_kb_next[:, r]
            seq[b, k] = (nxt[b] + rank[b, u]).to(seq.dtype)
            self.citystate_kb_next[:, r] = nxt + new.sum(dim=1)

    def _minor_levy_return(self, s: int) -> None:
        """`minorLevyReturn` — CIV6 (LOC_CITY_STATES_LEVY_MILITARY_DETAILS):
        the levied army "will return to the city-state after {2_TurnLimit}
        Turns, or if the Suzerain changes". Every unit still standing that the
        levy took from minor `s` (`unit_levy_src`) is the minor's again where
        it stands, its mark cleared."""
        alive = self.citystate_alive[:, s]
        ls = self.citystate_levy_seat[:, s]
        back = alive & (ls >= 0) & ((int(self.turn) + 1 >= self.citystate_levy_ends[:, s])
                                    | (self.citystate_suzerain[:, s] != ls))
        if not bool(back.count_nonzero()):
            return
        m = self.major_unit_alive & (self.major_unit_levy_src == 100 + s) & back.unsqueeze(1)
        if bool(m.count_nonzero()):
            self.major_unit_seat[m] = 100 + s
            self.major_unit_levied[m] = False
            self.major_unit_levy_src[m] = -1
            self._gen_ver += 1
        self.citystate_levy_seat[:, s] = torch.where(back, torch.full_like(ls, -1), ls)
        self.citystate_levy_ends[:, s] = torch.where(back, torch.full_like(ls, -1), self.citystate_levy_ends[:, s])

    def _minor_power(self, s: int) -> None:
        """`minorPower` — CIV6 (Power): the minor city's load is met all at
        once or not at all. No plant runs for a city-state (its stockpile
        feeds none): its renewables — a Dam's supply, the generators on its own
        plots — carry the whole load (`cityPower`'s fuel-free half, the
        governor, wonder and suzerain terms a city-state never holds aside),
        or a running `fullyPowered` project meets it."""
        row = self._CITY_MINOR0 + s
        B, dev = self.B, self.device
        alive = self.city_alive[:, row, 0]
        dreg = self.city_dist_tile[:, row, :1]
        stand = (self.city_bldg[:, row, :1]
                 & ~self._bldg_dark(dreg, self.city_bldg_pillaged[:, row, :1]))[:, 0]  # [B, NB]
        demand = (stand.double() * self._b_cols(row)["power"]).sum(dim=1)
        demand = demand + self._laser_power_load * self.city_lasers[:, row, 0].double()
        demand = torch.where(alive, demand, torch.zeros_like(demand))
        supply = torch.zeros(B, dtype=torch.float64, device=dev)
        if bool((demand > 0).count_nonzero()):
            if bool((self._b_power_supply > 0).count_nonzero()):
                supply = supply + stand.double() @ self._b_power_supply
            if self._imp_power_any:
                live = ((self.improvement >= 0) & ~self.pillaged & (self.tile_seat == 100 + s)
                        & (self.tile_city == -1))
                supply = supply + (self._imp_power[self.improvement.clamp(min=0)] * live.double()).sum(dim=1)
        self.city_powered[:, row, 0] = (demand > 0) & ((supply >= demand) | self.citystate_full_power[:, s])

    def _minor_traders(self, s: int) -> torch.Tensor:
        """[B] long — minor `s`'s Traders out on a route or standing
        (`minorTraders`)."""
        row = self._CITY_MINOR0 + s
        out = (self.seat_routes[:, row, :, 0] >= 0).sum(dim=1)
        if self._trader_idx >= 0:
            out = out + (self.major_unit_alive & (self.major_unit_seat == 100 + s)
                         & (self.major_unit_type == self._trader_idx)).sum(dim=1)
        return out

    def _minor_route_candidate(self, s: int, want: torch.Tensor):
        """`minorRouteCandidate` — where minor `s`'s free Trader goes: the new
        in-range destination whose route pays the most, its six yields summed
        (`_minor_route_yield6`), strictly-greater beats in the scan order —
        the other city-states by index, then every major's cities in row and
        slot order — so ties keep the first. The gates: the range (the walk
        from its city, in the games `want`), the route not already running, no
        war with the destination's holder, Trade Policy's ban. Returns ([B] found, [B] dest code (-(2+cs) or -1),
        [B] dest seat row, [B] dest city id, [B] dest centre)."""
        B, S, dev = self.B, self.S, self.device
        row = self._CITY_MINOR0 + s
        rr = self.seat_routes[:, row]
        act = rr[:, :, 0] >= 0
        reach = self._trade_reach_rows(row, want.nonzero(as_tuple=True)[0].tolist(),
                                       self.citystate_center[:, s:s + 1])[:, 0]  # [B, T]
        best = torch.full((B,), -1.0, dtype=torch.float64, device=dev)
        found = torch.zeros(B, dtype=torch.bool, device=dev)
        code = torch.full((B,), -1, dtype=torch.long, device=dev)
        dseat = torch.full((B,), -1, dtype=torch.long, device=dev)
        dcity = torch.full((B,), -1, dtype=torch.long, device=dev)
        dct = torch.full((B,), -1, dtype=torch.long, device=dev)
        per_cs = self._cs_route_y6().sum(dim=2) if S > 0 else None  # [B, S]
        for s2 in range(S):
            if s2 == s:
                continue
            ctr = self.citystate_center[:, s2].clamp(min=0)
            has = (act & (rr[:, :, 1] == -(2 + s2))).any(dim=1)
            ok = (self.citystate_alive[:, s2] & ~has & reach.gather(1, ctr.unsqueeze(1)).squeeze(1))
            key = per_cs[:, s2]
            take = ok & (~found | (key > best))
            best = torch.where(take, key, best)
            found = found | take
            code = torch.where(take, torch.full_like(code, -(2 + s2)), code)
            dseat = torch.where(take, torch.full_like(dseat, -1), dseat)
            dcity = torch.where(take, torch.full_like(dcity, -1), dcity)
            dct = torch.where(take, ctr, dct)
        y6 = self._route_centre_intl.sum()
        for r2 in range(self.n_majors):
            free = ~self.war[:, row, r2] & ~self._congress_intl_banned(r2)
            dreg = self.city_dist_tile[:, r2]
            comp = (dreg >= 0) & self.district_complete.gather(1, dreg.clamp(min=0).reshape(B, -1)).reshape_as(dreg)
            ysum = comp.double() @ self._route_intl_y.sum(dim=1) + float(y6)  # [B, RC]
            for j in range(self.RC):
                live = self.city_alive[:, r2, j] & free
                if not bool(live.count_nonzero()):
                    continue
                ctr = self.city_center[:, r2, j].clamp(min=0)
                cid = self.city_id[:, r2, j]
                has = (act & (self.seat_route_dseat[:, row] == r2)
                       & (self.seat_route_dcity[:, row] == cid.unsqueeze(1))).any(dim=1)
                ok = live & ~has & reach.gather(1, ctr.unsqueeze(1)).squeeze(1)
                key = ysum[:, j]
                take = ok & (~found | (key > best))
                best = torch.where(take, key, best)
                found = found | take
                code = torch.where(take, torch.full_like(code, -1), code)
                dseat = torch.where(take, torch.full_like(dseat, r2), dseat)
                dcity = torch.where(take, cid, dcity)
                dct = torch.where(take, ctr, dct)
        return found, code, dseat, dcity, dct

    def _minor_trade_cands(self, s: int) -> tuple[torch.Tensor, torch.Tensor]:
        """the known cities of minor `s`'s trade AI (`knownTradeCities`):
        ([B, ND] standing, [B, ND] centre) over the other city-states by
        index, then every major's cities in row and slot order"""
        S = self.S
        live, ctr = [], []
        for s2 in range(S):
            c = self.citystate_center[:, s2]
            live.append(self.citystate_alive[:, s2] & (c >= 0) & (s2 != s))
            ctr.append(c)
        for r2 in range(self.n_majors):
            for j in range(self.RC):
                live.append(self.city_alive[:, r2, j])
                ctr.append(self.city_center[:, r2, j])
        return torch.stack(live, dim=1), torch.stack(ctr, dim=1)

    def _minor_trade_list(self, s: int, mask: torch.Tensor) -> None:
        """`minorTradeList` where `mask` [B]: minor `s`'s city's trade list
        (CityBuildAI +0x870, 0x78f210) kept a turn on — each known city not
        yet sorted whose centre the minor has revealed (`mops_revealed`,
        0x2d2220; an unrevealed one is not tried) that a trade path from the
        city reaches is listed (`citystate_trade_ok`), any other tried
        rejected (`citystate_trade_no`); once the list holds a city at most
        two are tried a turn; a turn that
        tries none clears the rejected; a city gone leaves the list"""
        row = self._CITY_MINOR0 + s
        live, ctr = self._minor_trade_cands(s)
        ok_l = self.citystate_trade_ok[:, s] & live
        no_l = self.citystate_trade_no[:, s].clone()
        limited = ok_l.any(dim=1)
        seen = self.mops_revealed[:, s].gather(1, ctr.clamp(min=0))
        todo = mask.unsqueeze(1) & live & ~ok_l & ~no_l & seen
        tried = torch.zeros(self.B, dtype=torch.long, device=self.device)
        games = todo.any(dim=1).nonzero(as_tuple=True)[0].tolist()
        if games:
            reach = self._trade_reach_rows(row, games, self.citystate_center[:, s:s + 1])[:, 0]   # [B, T]
            for d in range(todo.shape[1]):
                t = todo[:, d]
                if not bool(t.count_nonzero()):
                    continue
                tried = tried + (t & limited).long()
                go = t & (~limited | (tried <= 2))
                inr = reach.gather(1, ctr[:, d].clamp(min=0).unsqueeze(1)).squeeze(1)
                ok_l[:, d] = ok_l[:, d] | (go & inr)
                no_l[:, d] = no_l[:, d] | (go & ~inr)
        no_l = no_l & ~(tried == 0).unsqueeze(1)
        m = mask.unsqueeze(1)
        self.citystate_trade_ok[:, s] = torch.where(m, ok_l, self.citystate_trade_ok[:, s])
        self.citystate_trade_no[:, s] = torch.where(m, no_l, self.citystate_trade_no[:, s])

    def _minor_trade_value(self, s: int, mask: torch.Tensor) -> None:
        """`minorTradeValue` where `mask` [B]: minor `s`'s route value K
        (0x5e9b20, `citystate_trade_value` raw) — over its listed cities whose
        holder it is not at war with, the most a route there pays it, its
        origin yields with no path term (`minorRouteOriginYields` on a route
        with no course: the destination's rows, the Trading Post there, a
        major city's foreign-route Gold and its wonders' sender yields) each
        valued (`yieldValue`) and summed; never below 0"""
        from .sim_cityvalue import _YIELDS
        B, S, dev = self.B, self.S, self.device
        row = self._CITY_MINOR0 + s
        live, ctr = self._minor_trade_cands(s)
        ok_l = self.citystate_trade_ok[:, s] & live
        best = torch.zeros(B, dtype=torch.long, device=dev)
        if not bool((ok_l & mask.unsqueeze(1)).count_nonzero()):
            self.citystate_trade_value[:, s] = torch.where(mask, best, self.citystate_trade_value[:, s])
            return
        f = self._cv_minor_facts(s)
        y6 = []
        free = []
        cs6 = self._cs_route_y6() if S > 0 else None
        for s2 in range(S):
            y6.append(cs6[:, s2])
            free.append(~self.war[:, row, self._CITY_MINOR0 + s2])
        reg = self.city_dist_tile
        comp = (reg >= 0) & self.district_complete.gather(1, reg.clamp(min=0).reshape(B, -1)).reshape_as(reg)
        fgk = self._gp_city_perm_names.index("foreignRouteGold")
        wond = getattr(self, "_wond_sender_gold", None) is not None
        for r2 in range(self.n_majors):
            for j in range(self.RC):
                y = self._route_centre_intl.reshape(1, 6).double() + comp[:, r2, j].double() @ self._route_intl_y
                y = y.clone()
                y[:, 2] += self.city_gp_perm[:, r2, j, fgk].double()
                if wond:
                    wr = self.city_wonder[:, r2, j]
                    wc = (wr >= 0) & self.built_wonder_complete.gather(1, wr.clamp(min=0))
                    y[:, 2] += wc.double() @ self._wond_sender_gold
                    y[:, 3] += wc.double() @ self._wond_sender_sci
                y6.append(y)
                free.append(~self.war[:, row, r2])
        post = self._route_post_gold(row, ctr).double()                     # [B, ND]
        for d in range(len(y6)):
            on = ok_l[:, d] & free[d] & mask
            if not bool(on.count_nonzero()):
                continue
            y = y6[d].clone()
            y[:, 2] += post[:, d]
            v = torch.zeros(B, dtype=torch.long, device=dev)
            for k, name in enumerate(_YIELDS):
                amt = torch.floor(y[:, k] * 256 + 0.5).long()
                v = v + self._cv_yield(amt, name, f.yield_w(name))
            best = torch.where(on & (v > best), v, best)
        self.citystate_trade_value[:, s] = torch.where(mask, best, self.citystate_trade_value[:, s])

    def _minor_trade(self, s: int) -> None:
        """`minorTrade` — minor `s`'s routes walk and meet their raiders
        (`_trade_walk_tick`); a free Trader under its capacity takes the
        scorer's destination (`_minor_route_candidate`) and is spent on it —
        the commit `commitRoute` makes: the term, the stored course, the
        walker at the centre on leg 0, road on the centre; then the round
        trips that are done end (`_expire_seat_routes`)."""
        row = self._CITY_MINOR0 + s
        alive = self.citystate_alive[:, s]
        self._trade_walk_tick(row, alive)
        if self._trader_idx >= 0:
            used = (self.seat_routes[:, row, :, 0] >= 0).sum(dim=1)
            t_has, t_slot, t_tile = self._free_trader(row)
            want = alive & (used < self._trade_capacity(row)) & t_has
            if bool(want.count_nonzero()):
                found, code, dseat, dcity, dct = self._minor_route_candidate(s, want)
                go = want & found
                if bool(go.count_nonzero()):
                    rows = go.nonzero(as_tuple=True)[0]
                    slot = self._free_route_slot(rows, row)
                    o_ct = self.citystate_center[:, s].clamp(min=0)
                    self.seat_routes[rows, row, slot, 0] = 0
                    self.seat_routes[rows, row, slot, 1] = code[rows]
                    self.seat_route_dseat[rows, row, slot] = dseat[rows]
                    self.seat_route_dcity[rows, row, slot] = dcity[rows]
                    self.seat_route_exp[rows, row, slot] = int(self.turn) + self._trade_min_duration()[rows]
                    self.seat_route_born[rows, row, slot] = int(self.turn)
                    self.seat_route_walk[rows, row, slot] = o_ct[rows]
                    self.seat_route_leg[rows, row, slot] = 0
                    self._trade_store_course(row, rows, slot, o_ct[rows], dct[rows])
                    lr = rows[~self.water[rows, o_ct[rows]]]
                    if len(lr) > 0:
                        self.road[lr, o_ct[lr]] = True
                    self.major_unit_alive[rows, t_slot[rows]] = False
                    self._occ_clear(rows, t_tile[rows], t_slot[rows] + self.POOL_LO["major"])
        self._expire_seat_routes(row)

    def _minor_route_income(self, s: int) -> torch.Tensor | None:
        """[B, RC, 6] f64 — `minorRouteYields` over minor `s`'s routes, on its
        one city's column (`_minor_route_k` summed). None with no route."""
        rk = self._minor_route_k(s)
        if rk is None:
            return None
        row = self._CITY_MINOR0 + s
        out = torch.zeros(self.B, self.RC, 6, dtype=torch.float64, device=self.device)
        out[:, 0] = rk.sum(dim=1) * self.city_alive[:, row, 0].double().unsqueeze(1)
        return out

    def _minor_route_k(self, s: int) -> torch.Tensor | None:
        """[B, K, 6] f64 — what each of minor `s`'s routes pays its city
        (`minorRouteOriginYields`): the international column of
        `District_TradeRouteYields` over the destination city's completed
        districts plus the centre row (`_cs_route_y6`; a minor sender holds
        no Sovereignty factor), the path term, and its own Trading Post
        at the destination (`_route_post_gold`). A destination gone pays
        nothing. None with no route."""
        row = self._CITY_MINOR0 + s
        rr = self.seat_routes[:, row]
        act = rr[:, :, 0] >= 0
        if not bool(act.count_nonzero()):
            return None
        B, S, dev = self.B, self.S, self.device
        rk = torch.zeros(B, rr.shape[1], 6, dtype=torch.float64, device=dev)
        # the PATH TERM's inputs per paying leg (`routePathGold`): D, the Gold
        # the destination's rows pay
        _p_d = torch.zeros(rr.shape[:2], dtype=torch.float64, device=dev)
        _p_want = torch.zeros_like(act)
        if S > 0:
            raw = -rr[:, :, 1] - 2
            css = raw.clamp(min=0, max=S - 1)
            ok_c = act & (rr[:, :, 1] <= -2) & (raw < S) & self.citystate_alive[:, :S].gather(1, css)
            m = ok_c.double()  # [B, K]
            cs6 = self._cs_route_y6().gather(1, css.unsqueeze(2).expand(-1, -1, 6)) * m.unsqueeze(2)
            rk = rk + cs6
            # D is every Gold the destination pays the route
            _p_d = torch.where(ok_c, cs6[:, :, 2], _p_d)
            _p_want = _p_want | ok_c
        rd_c = self.seat_route_dcity[:, row]
        intl = act & (rd_c >= 0)
        if bool(intl.count_nonzero()):
            K = rd_c.shape[1]
            RCw = self.city_id.shape[2]
            dr = self.seat_route_dseat[:, row].clamp(min=0)
            _rx = dr.unsqueeze(2).expand(B, K, RCw)
            hit = (self.city_id.gather(1, _rx) == rd_c.unsqueeze(2)) & self.city_alive.gather(1, _rx)
            valid = intl & hit.any(dim=2)
            _col = hit.long().argmax(dim=2).unsqueeze(2)
            _reg = self.city_dist_tile
            _comp = (_reg >= 0) & self.district_complete.gather(1, _reg.clamp(min=0).reshape(B, -1)).reshape_as(_reg)
            _nD = _comp.shape[3]
            _comp_d = _comp.gather(1, _rx.unsqueeze(3).expand(B, K, RCw, _nD)).gather(
                2, _col.unsqueeze(3).expand(B, K, 1, _nD)).squeeze(2)  # [B, K, nD]
            intl6 = self._route_centre_intl.reshape(1, 1, 6) + _comp_d.double() @ self._route_intl_y  # [B, K, 6]
            rk = rk + intl6 * valid.double().unsqueeze(2)
            _p_d = torch.where(valid, intl6[:, :, 2], _p_d)
            _p_want = _p_want | valid
            # a major's city paying other players' routes into it
            # (..._YIELD_TO_OTHERS: Zhang Qian, Marco Polo, Zheng He's Gold,
            # Sankore's Science and Gold) — a city-state's route is another
            # player's
            _fgk = self._gp_city_perm_names.index("foreignRouteGold")
            _fgd = self.city_gp_perm[:, :, :, _fgk]
            if bool(_fgd.count_nonzero()):
                rk[:, :, 2] += _fgd.gather(1, _rx).gather(2, _col).squeeze(2).double() * valid.double()
            if getattr(self, "_wond_sender_gold", None) is not None and (
                    bool(self._wond_sender_gold.count_nonzero()) or bool(self._wond_sender_sci.count_nonzero())):
                _nwW = self.city_wonder.shape[3]
                _wr4 = self.city_wonder.gather(1, _rx.unsqueeze(3).expand(B, K, RCw, _nwW))
                _wr = _wr4.gather(2, _col.unsqueeze(3).expand(B, K, 1, _nwW)).squeeze(2)  # [B, K, nW]
                _wcp = (_wr >= 0) & self.built_wonder_complete.gather(
                    1, _wr.clamp(min=0).reshape(B, -1)).reshape_as(_wr)
                rk[:, :, 2] += (_wcp.double() @ self._wond_sender_gold) * valid.double()
                rk[:, :, 3] += (_wcp.double() @ self._wond_sender_sci) * valid.double()
        if bool(_p_want.count_nonzero()):
            _oc, _dc = self._route_centres(row)
            rk[:, :, 2] += self._route_path_gold(row, _p_d, _p_want) \
                + (self._route_post_gold(row, _dc) * _p_want.long()).double()
        return rk

    def _minor_repair(self, s: int) -> tuple[torch.Tensor, torch.Tensor]:
        """([B] bool, [B] f64) — `repairAvailable` and `projectCost` for minor
        `s`'s city: walls standing and breached (the centre's pool or its
        Encampment's), the centre clean, three quiet turns since its last hit;
        the price the HP it puts back, at least 1."""
        row = self._CITY_MINOR0 + s
        mx = self._walls_tier_hp.take(self._minor_walls_tier(s)).long()
        outer = torch.minimum(self.city_outer_hp[:, row, 0], mx)
        enc_missing = torch.zeros_like(mx)
        if self._encamp_didx >= 0:
            et = self.city_dist_tile[:, row, 0, self._encamp_didx]
            e0 = et.clamp(min=0).unsqueeze(1)
            live = (et >= 0) & self.district_complete.gather(1, e0).squeeze(1)
            ecur = torch.minimum(self.encamp_outer_hp.gather(1, e0).squeeze(1), mx)
            enc_missing = torch.where(live, mx - ecur, torch.zeros_like(mx))
        breached = (outer < mx) | (enc_missing > 0)
        ctr = self.citystate_center[:, s]
        clean = (ctr >= 0) & ~self._fallout().gather(1, ctr.clamp(min=0).unsqueeze(1)).squeeze(1)
        ok = ((mx > 0) & breached & clean
              & ((int(self.turn) - self.city_last_hit[:, row, 0]) >= self._repair_quiet))
        cost = ((mx - outer) + enc_missing).clamp(min=1).double()
        return ok, cost

    def _minor_worship(self, s: int) -> torch.Tensor:
        """[B] long — `minorWorship`: the worship building minor `s`'s majority
        religion's Worship belief names, -1 where none or while its city holds
        a worship building."""
        fol = self._minor_followed()[:, s]
        n = self.civ_worship.shape[1]
        wi = torch.where((fol >= 0) & (fol < n),
                         self.civ_worship.gather(1, fol.clamp(min=0, max=n - 1).unsqueeze(1)).squeeze(1),
                         torch.full_like(fol, -1))
        if self._worship_bidx.numel() == 0:
            return torch.full_like(wi, -1)
        wb = self._worship_bidx[wi.clamp(min=0, max=self._worship_bidx.numel() - 1)]
        holds = (self.city_bldg[:, self._CITY_MINOR0 + s, 0] & self._b_worship.unsqueeze(0)).any(dim=1)
        return torch.where((wi >= 0) & ~holds, wb, torch.full_like(wi, -1))

    def _pave_plot(self, rows: torch.Tensor, tiles: torch.Tensor, keep: tuple[int, ...] = ()) -> None:
        """`paveGround` — the ground a district or a wonder takes, for every
        seat: the improvement goes, every feature but floodplains and those of
        `keep` (a wonder's required features, its `onFeat`) goes, a bonus
        resource goes. The improvement goes with its pillage."""
        self.improvement[rows, tiles] = -1
        self.pillaged[rows, tiles] = False
        fid = self.feat_id[rows, tiles]
        nofp = (fid < 0) | ~self._fp_feat[fid.clamp(min=0)]
        for f in keep:
            nofp = nofp & (fid != int(f))
        if bool(nofp.count_nonzero()):
            self._strip_feature_at(rows[nofp], tiles[nofp])
        # the bonus resource goes as a harvest takes it: every baked plane to
        # its resource-free value, so a plot whose district is later gone
        # reads bare ground (TS deleted `tile.resource`)
        fresh_rs = (self.res_priority[rows, tiles] == 1) & ~self.res_stripped[rows, tiles]
        if bool(fresh_rs.count_nonzero()):
            self._drop_resource(rows[fresh_rs], tiles[fresh_rs])

    def _minor_military_count(self, s: int) -> torch.Tensor:
        """[B] long — minor `s`'s military units."""
        mine = self.major_unit_alive & (self.major_unit_seat == 100 + s)
        mt = self.major_unit_type.clamp(min=0, max=self.NU - 1)
        return (mine & self._type_military.take(mt)).sum(dim=1)

    def _minor_economy(self, s: int) -> torch.Tensor:
        """`minorEconomy` — THE MINOR'S ECONOMY, in the order every player's
        start of turn runs (tools/civ6lab/turn_order_civ6.md). CIV6
        (City-state): a city-state's city is an ordinary city — its Campus
        yields Science, its Commercial Hub Gold. Its Science and Culture as
        the turn opens feed the two research pots and the research completes
        on them (`_minor_research_bank`); then, off the city as that research left
        it, Gold banks into `citystate_treasury` and pays the minor's units'
        upkeep — each unit's own Maintenance, a minor carrying no card that
        cuts it — and meets the `_bankruptcy` every seat meets, and Faith
        banks into `citystate_faith`. Returns [B] long, the upgrade trigger's
        count."""
        row = self._CITY_MINOR0 + s
        alive = self.citystate_alive[:, s]
        keep = alive.double()
        tot = self._seat_city_stats(row, record=False)[0][:, 0]  # [B, 6], zero where the city is dead
        gained = self._minor_research_bank(s, tot[:, 3] * keep, tot[:, 4] * keep)
        if bool((gained > 0).count_nonzero()):
            fresh = self._seat_city_stats(row, record=False)[0][:, 0]
            tot = torch.where((gained > 0).unsqueeze(1), fresh, tot)
        mine = self.major_unit_alive & (self.major_unit_seat == 100 + s)
        upkeep = (self._unit_maintenance(self.major_unit_type, self.major_unit_formation,
                                         self.major_unit_levied).double() * mine.double()).sum(dim=1)
        tre = self.citystate_treasury[:, s] + tot[:, 2] * keep
        paid = torch.where(alive, tre - upkeep, tre)
        maint = self._unit_maintenance(self.unit_type, self.unit_formation, self.unit_levied).double()
        self.citystate_treasury[:, s] = self._bankruptcy(row, paid, alive, maint)
        self.citystate_faith[:, s] += tot[:, 5] * keep
        return gained

    def _minor_production(self, s: int) -> torch.Tensor:
        """[B] — the Production minor `s`'s city makes as it stands now, for
        `_minor_build`, which pays it into the pot under the rows of the item
        it goes toward; 0 where the city is dead."""
        row = self._CITY_MINOR0 + s
        tot = self._seat_city_stats(row, record=False)[0][:, 0]
        return tot[:, 1] * self.citystate_alive[:, s].double()

    def _minor_growth(self, s: int) -> None:
        """`minorGrowth` — THE MINOR'S CITY GROWS AND CLAIMS, on the city as it
        stands after its production. CIV6 (City-state): the install has ONE
        city rule, so it grows on its FOOD BOX and takes ground on its CULTURE
        BOX exactly as a major's does. Its row is a row of the CITY BLOCK, so
        `_seat_city_growth` and `_seat_border_growth` are the majors' own
        bodies called on it, and `citystate_pop` is a VIEW of `city_pop` — the
        growth write moves it with no mirror of its own."""
        row = self._CITY_MINOR0 + s
        act = self.citystate_alive[:, s]
        total, eff, need, _tier, lux = self._seat_city_stats(row)
        col = torch.zeros(self.B, dtype=torch.long, device=self.device)
        pop0 = self.city_pop[:, row, 0].clone()
        self._seat_city_growth(row, col, act, eff[:, 0], need[:, 0])
        # a citizen grown is placed beside the rest, a starved city re-places
        # them all (0x1b41e0 -> 0x194fb0)
        pop1 = self.city_pop[:, row, 0].clone()
        self._minor_place_citizens(s, act & (pop1 > pop0), pop1 - pop0)
        self._minor_replace_citizens(s, act & (pop1 < pop0))
        acq0 = self.city_acquired[:, row, 0].clone()
        self._seat_border_growth(row, col, act,
                                 self._culture_after_growth(row, 0, pop0, total[:, 0, 4], lux) * act.double())
        # the border's annex re-places every citizen (AnnexPlot 0x1a8b70)
        self._minor_replace_citizens(s, act & (self.city_acquired[:, row, 0] != acq0))

    def _minor_envoy_tiles(self, games: torch.Tensor) -> None:
        """A MINOR TAKES GROUND FROM THE INFLUENCE SPENT ON IT — `envoyTiles`,
        walked over every minor of the games in `games` ([B] bool), the games
        whose envoy write just landed (`addEnvoys`' `receiveEnvoyTiles`). A
        game with no write claims nothing: a minor whose last draw found
        nothing in reach keeps its pending count until its OWN game next adds
        an envoy.

        CIV6 (`CivilizationLevels.CanAnnexTilesWithReceivedInfluence`): TRUE
        for CITY_STATE and FALSE for a full civ, the Free Cities player and a
        tribe — the one column of that table only a minor owns, and the reason
        its culture box banks and claims nothing. Measured on one minor over
        fifteen readings on a SINGLE turn, so nothing but the envoys moved:
        exactly +1 owned plot per envoy received, `plots = envoys + 6`, no cap
        through sixteen, and the suzerain contest does not change the slope. A
        minor is founded on seven plots, so its first envoy takes none
        (`envoyTiles`).

        The LEDGER is `city_acquired` itself — the `tilesAcquired` twin — so
        the rule needs no counter of its own: a minor's box buys nothing, so
        every tile that counter holds was bought by an envoy past the first. The count it
        claims up to is the RAW store, `seat_citystate_envoys` and never
        `_envoys_here`, because a governor POSTING is not an envoy RECEIVED.
        Claiming up to the count rather than on each delta is what makes the
        measured equation an invariant, and it settles the one case the lab
        did not reach: an envoy REMOVED (a spy's Fabricate Scandal) takes no
        ground back and buys nothing new until the count passes its own mark.

        WHICH plot is `_seat_border_draw`, the culture claim's own draw and
        its own refusals, clause for clause with `drawBorderPlot` (the DLL's
        acquire-N loop: one draw per plot); a plot another player holds is
        not taken and a plot with no owned neighbour is out of reach.
        """
        if self.S == 0:
            return
        bidx = self._bidx
        col = torch.zeros(self.B, dtype=torch.long, device=self.device)
        env = self._minor_envoys_received()
        for s in range(self.S):
            row = self._CITY_MINOR0 + s
            if not bool(self._row_annex_influence[row]):
                continue
            # a dead minor receives nothing; a negative difference (a removal)
            # claims nothing and gives nothing back
            want = (env[:, s] - 1 - self.city_acquired[bidx, row, col]) * (self.citystate_alive[:, s] & games).long()
            if not bool((want > 0).count_nonzero()):
                continue
            took = torch.zeros(self.B, dtype=torch.bool, device=self.device)
            center = self.city_center[bidx, row, col]
            cid = self.city_id[bidx, row, col]
            for _ in range(int(want.max())):  # the TS while-loop, one plot at a time
                ready = want > 0
                spot_all = self._seat_border_draw(row, center, cid, ready)
                claim = ready & (spot_all >= 0)
                if not bool(claim.count_nonzero()):
                    break
                rows = claim.nonzero(as_tuple=True)[0]
                spot = spot_all[rows]
                self.tile_seat[rows, spot] = int(self._ROW_SEAT[row])  # setTileOwner's two halves:
                self.tile_city[rows, spot] = cid[rows]  # the seat and the city id
                self._tile_owner_ver += 1
                # acquireTile's revealAround: nothing reads a city-state's fog;
                # its suzerain sees the plot's ring (`_suzerain_look`)
                self._suzerain_look(rows, torch.full_like(rows, s), spot, 1, None)
                # A claim widens a LATER city's workable candidates.
                self._claim_version += 1
                self.city_acquired[rows, row, col[rows]] += 1
                took = took | claim
                want = want - claim.long()
                # a game whose draw found nothing stops, as TS breaks
                want = torch.where(ready & ~claim, torch.zeros_like(want), want)
            # each annex re-places every citizen (AnnexPlot 0x1a8b70 -> 0x196320)
            self._minor_replace_citizens(s, took)

    def _minor_research(self, s: int, sci: torch.Tensor, cul: torch.Tensor) -> torch.Tensor:
        """`minorResearch` for research row `s` — the Free Cities' (`FR`, every
        game every turn) — the bank (`_minor_research_bank`) and the AIs' turns
        (`_minor_research_turn`) at once. Returns [B] long, how many trees
        completed a row."""
        gained = self._minor_research_bank(s, sci, cul)
        self._minor_research_turn(s, sci, cul)
        return gained

    def _minor_research_turn(self, s: int, sci: torch.Tensor, cul: torch.Tensor) -> None:
        """`minorResearchTurn` for research row `s`: the research AI analyses
        the tree on the Science `sci` [B] and makes its turn's choice
        (`_rai_turn`); the civics AI analyses its tree on the Culture `cul`
        and, with nothing in hand, chooses (`_cai_turn`)"""
        alive = (torch.ones(self.B, dtype=torch.bool, device=self.device) if s == self.FR
                 else self.citystate_alive[:, s])
        self._rai_turn(s, alive, sci)
        self._cai_turn(s, alive, cul)

    def _minor_research_ai(self, s: int) -> None:
        """`minorResearchAi`: city-state `s`'s research and civics AIs' turns on
        its city as its production and growth left it"""
        keep = self.citystate_alive[:, s].double()
        tot = self._seat_city_stats(self._CITY_MINOR0 + s, record=False)[0][:, 0]
        self._minor_research_turn(s, tot[:, 3] * keep, tot[:, 4] * keep)

    def _minor_research_bank(self, s: int, sci: torch.Tensor, cul: torch.Tensor) -> torch.Tensor:
        """`minorResearchBank` for research row `s` — a city-state's, or the
        Free Cities' — the TECHNOLOGIES first: the CATCH-UP (`minorCatchUp`,
        read inline), the turn's Science (`sci` [B]) and the overflow bank, a
        completion at the cost leaving the rest, whose choice reads the
        research AI's analysis of the turn before (`_rai_completion`). Then
        the CIVICS the same way: the catch-up, the turn's Culture (`cul`) and
        the overflow bank and complete the civic in hand at its cost, whose
        choice reads the civics AI's analysis of the turn before
        (`_cai_completion`). CIV6 (Urban Defenses): the tech "builds modern
        fortifications around the City Centers of all current and future
        cities and their Encampment districts", so the holder's perimeters
        arrive at the urban tier's full pool. Returns [B] long, how many trees
        completed a row — the upgrade trigger's count."""
        free = s == self.FR
        alive = (torch.ones(self.B, dtype=torch.bool, device=self.device) if free
                 else self.citystate_alive[:, s])
        gained = torch.zeros(self.B, dtype=torch.long, device=self.device)
        live = self._barb_majors_alive()
        need = ((int(self.rules.citystate["catchUpPct"]) * live.sum(dim=1) + 50) // 100).clamp(min=1)

        def catch_up(have, prog, cur, retain, rc, majors, seen):
            # THE CATCH-UP: a row the minor lacks that `need` living majors
            # hold, their count grown since its last turn (`seen`), is set at
            # its cost less one
            n = rc.shape[1]
            col = torch.arange(n, device=self.device).unsqueeze(0)
            held = (majors[:, : self.n_majors] & live.unsqueeze(2)).sum(dim=1)
            lack = ~have[:, s] & alive.unsqueeze(1)
            hit = (held >= need.unsqueeze(1)) & (held > seen[:, s]) & lack
            if bool(hit.count_nonzero()):
                c0 = cur[:, s]
                floor = (rc - 1).to(retain.dtype)
                on_cur = hit & (col == c0.unsqueeze(1))
                retain[:, s] = torch.where(hit & ~on_cur, floor, retain[:, s])
                cfloor = (rc - 1).gather(1, c0.clamp(min=0).unsqueeze(1)).squeeze(1).to(prog.dtype)
                prog[:, s] = torch.where(on_cur.any(dim=1), cfloor, prog[:, s])
            seen[:, s] = torch.where(alive.unsqueeze(1), torch.where(lack, held, torch.zeros_like(held)), seen[:, s])

        # THE TECHNOLOGIES
        rc = self._research_cost(False)
        catch_up(self.citystate_techs, self.citystate_tech_prog, self.citystate_cur_tech, self.citystate_tech_retain, rc,
                 self.civ_techs, self.citystate_tech_catch)
        prog = self.citystate_tech_prog
        prog[:, s] = torch.where(alive, prog[:, s] + sci + self.citystate_tech_ovf[:, s], prog[:, s])
        self.citystate_tech_ovf[:, s] = torch.where(alive, torch.zeros_like(self.citystate_tech_ovf[:, s]),
                                                    self.citystate_tech_ovf[:, s])
        # the research in hand, kept apart from the column the completion clears
        c = self.citystate_cur_tech[:, s].clone()
        cval = rc.gather(1, c.clamp(min=0).unsqueeze(1)).squeeze(1).to(prog.dtype)
        fire = alive & (c >= 0) & (prog[:, s] >= cval)
        gained = gained + fire.long()
        if bool(fire.count_nonzero()):
            self.citystate_techs[fire, s, c[fire]] = True
            prog[:, s] = torch.where(fire, prog[:, s] - cval, prog[:, s])
            col = torch.arange(rc.shape[1], device=self.device).unsqueeze(0)
            self.citystate_tech_retain[:, s] = torch.where(fire.unsqueeze(1) & (col == c.unsqueeze(1)),
                                                           torch.zeros_like(self.citystate_tech_retain[:, s]),
                                                           self.citystate_tech_retain[:, s])
            self.citystate_cur_tech[:, s] = torch.where(fire, torch.full_like(c, -1), c)
            # the minor's record now feeds its own yield walk (`_seat_techs`)
            self._eff_version += 1
            self._rai_completion(s, fire, torch.where(fire, c, torch.full_like(c, -1)), sci)
            if self._urban_def_tech >= 0:
                hit = fire & (c == self._urban_def_tech)
                if free:
                    self._urban_defenses_fit(self.FREE_ROW, hit)
                else:
                    self._minor_urban_fit(s, hit)

        # THE CIVICS
        have, prog, cur = self.citystate_civics, self.citystate_civic_prog, self.citystate_cur_civic
        retain, ovf = self.citystate_civic_retain, self.citystate_civic_ovf
        rc = self._research_cost(True)
        col = torch.arange(rc.shape[1], device=self.device).unsqueeze(0)
        catch_up(have, prog, cur, retain, rc, self.civ_civics, self.citystate_civic_catch)
        # the turn's yield and the overflow
        prog[:, s] = torch.where(alive, prog[:, s] + cul + ovf[:, s], prog[:, s])
        ovf[:, s] = torch.where(alive, torch.zeros_like(ovf[:, s]), ovf[:, s])
        # THE COMPLETION and its choice
        # the civic in hand, kept apart from the column the completion clears
        c = cur[:, s].clone()
        cval = rc.gather(1, c.clamp(min=0).unsqueeze(1)).squeeze(1).to(prog.dtype)
        fire = alive & (c >= 0) & (prog[:, s] >= cval)
        gained = gained + fire.long()
        if bool(fire.count_nonzero()):
            have[fire, s, c[fire]] = True
            prog[:, s] = torch.where(fire, prog[:, s] - cval, prog[:, s])
            retain[:, s] = torch.where(fire.unsqueeze(1) & (col == c.unsqueeze(1)), torch.zeros_like(retain[:, s]), retain[:, s])
            cur[:, s] = torch.where(fire, torch.full_like(c, -1), c)
            self._eff_version += 1
            self._cai_completion(s, fire, torch.where(fire, c, torch.full_like(c, -1)), cul)
        return gained

    def _minor_urban_fit(self, s: int, hit: torch.Tensor) -> None:
        """`minorResearch`'s Urban Defenses fit: the centre's perimeter and its
        Encampment's own pool arrive at the urban tier's full pool."""
        if not bool(hit.count_nonzero()):
            return
        row = self._CITY_MINOR0 + s
        full = int(self._walls_tier_hp[self._walls_tier_urban])
        self.city_outer_hp[:, row, 0] = torch.where(hit, torch.full_like(self.city_outer_hp[:, row, 0], full),
                                                    self.city_outer_hp[:, row, 0])
        if self._encamp_didx >= 0:
            et = self.city_dist_tile[:, row, 0, self._encamp_didx]
            w = (hit & (et >= 0) & self.district_complete.gather(1, et.clamp(min=0).unsqueeze(1)).squeeze(1)
                 ).nonzero(as_tuple=True)[0]
            if w.numel():
                self.encamp_outer_hp[w, et[w]] = full


    def _minor_walls_tier(self, s: int) -> torch.Tensor:
        """[B] `wallsTier` for minor `s`'s city — the URBAN tier once its own
        research holds Urban Defenses, else the highest walls row it holds."""
        return self._minor_walls_tier_at(torch.full((self.B,), s, dtype=torch.long, device=self.device))

    def _minor_walls_tier_at(self, csx: torch.Tensor) -> torch.Tensor:
        """[B] the walls tier of the minor named PER GAME — the combat sites'
        read, where each game may be striking a different city-state. TS
        `wallsTier` reads the minor's own research through `seatOf`, so the
        Urban Defenses clause reads `citystate_techs`."""
        s0 = csx.clamp(min=0, max=max(self.S - 1, 0))
        row = self._CITY_MINOR0 + s0
        b = torch.arange(self.B, device=self.device)
        bl = self.city_bldg[b, row, 0]
        tier = torch.zeros(self.B, dtype=torch.long, device=self.device)
        for bi in self._walls_rows:
            t_w = int(self.rules_dev.b_walls[bi])
            tier = torch.maximum(tier, torch.where(bl[:, bi], torch.full_like(tier, t_w),
                                                   torch.zeros_like(tier)))
        if self._urban_def_tech >= 0:
            urban = self.citystate_techs[b, s0, self._urban_def_tech]
            tier = torch.where(urban, torch.full_like(tier, self._walls_tier_urban), tier)
        return tier

    def _minor_envoys_received(self) -> torch.Tensor:
        """[B, S] long — `envoysReceived`: every envoy each minor holds, the
        raw store summed over the majors that sent them, an established
        Amani's included."""
        return self.seat_citystate_envoys[:, : self.n_majors, : self.S].sum(dim=1).long()

    def _init_minor_build(self, rules) -> None:
        """THE MINOR'S STEP'S TABLES (`minorBuild`): the percents its step pays
        toward an item (a Builder, a military unit while the minor holds few,
        walls, the Harbor, the type's own district), the repair's resume
        percent, the upgrade's price, the levy's turns, the strategic-resource
        waivers, the research eras; the item keys (`minorItemKey`'s index) and
        the item in hand, the overflow store and each item's kept progress."""
        cs = rules.citystate
        dev = self.device
        self._mb_excl_cls = [int(c) for c in cs["excludedUnitClasses"]]
        self._mb_builder_pct = float(cs["builderProdPct"])
        self._mb_military_pct = float(cs["militaryProdPct"])
        self._mb_small_military = int(cs["smallMilitary"])
        self._mb_walls_pct = float(cs["wallsProdPct"])
        self._mb_harbor_pct = float(cs["harborProdPct"])
        self._mb_type_pct = torch.tensor([float(x) for x in cs["typeDistrictProdPct"]], dtype=torch.float64, device=dev)
        # a pillaged building resumes at this percent of its cost
        self._mb_repair_resume_pct = float(cs["repairResumePct"])
        self._mb_upgrade_gold = float(cs["upgradeGold"])
        # THE LEVY: the army's turns away
        self._levy_turns = int(cs["levyTurns"])
        _lv = {d["level"]: d for d in rules.civ_levels}
        self._minor_any_res = bool(_lv["CITY_STATE"]["ignoresUnitStrategicResourceRequirements"])
        self._free_any_res = bool(_lv["FREE_CITIES"]["ignoresUnitStrategicResourceRequirements"])
        self._tech_era = torch.tensor([int(x) for x in rules.seats["techEra"]], dtype=torch.long, device=dev)
        self._civic_era = torch.tensor([int(x) for x in rules.seats["civicEra"]], dtype=torch.long, device=dev)
        # THE ITEM KEYS (`minorItemKey`'s index): a unit its chassis, then a
        # building, a district, a project, a pillaged building's repair
        n_u, n_b = len(rules.units or [None]), len(rules.b_cost)
        n_d, n_p = len(rules.districts), len(rules.projects["rows"])
        self._mk_b0 = n_u
        self._mk_d0 = n_u + n_b
        self._mk_p0 = self._mk_d0 + n_d
        self._mk_r0 = self._mk_p0 + n_p
        # a district's own install Cost and climb (`districtScaledBase`)
        dcp = rules.district_cost
        self._mb_d_base = torch.tensor([int(dcp["perDistrict"][d]) if d < len(dcp["perDistrict"]) else int(dcp["base"])
                                        for d in range(n_d)] or [0], dtype=torch.long, device=dev)
        self._mb_d_k = torch.tensor([int(dcp["perK"][d]) if d < len(dcp["perK"]) else int(dcp["k"]) for d in range(n_d)] or [0],
                                    dtype=torch.long, device=dev)
        B, S = self.citystate_prod.shape
        # the item in hand (-1 nothing), the overflow store, and the progress
        # each item it switched away from keeps (`minorBuild`)
        self.citystate_item = torch.full((B, S), -1, dtype=torch.long, device=dev)
        self.citystate_ovf = torch.zeros(B, S, dtype=torch.float64, device=dev)
        self.citystate_kept = torch.zeros(B, S, self._mk_r0 + n_b, dtype=torch.float64, device=dev)

    def _mb_proj(self) -> dict:
        """per project row its `projectCost` terms and its conversion: the
        progress base and climb (-1 none), the fixed cost, the yield (-1
        none), the full-power flag"""
        c = getattr(self, "_mb_proj_cache", None)
        if c is None:
            dev = self.device
            rows = self._proj_rows or [{"pgb": -1, "pk": 0, "pc": 0, "y": -1}]
            fp = set(self._proj_fp)
            c = self._mb_proj_cache = {
                "pgb": torch.tensor([int(p["pgb"]) for p in rows], dtype=torch.long, device=dev),
                "pk": torch.tensor([int(p["pk"]) for p in rows], dtype=torch.long, device=dev),
                "pc": torch.tensor([max(int(p["pc"]), 0) for p in rows], dtype=torch.long, device=dev),
                "y": torch.tensor([int(p["y"]) for p in rows], dtype=torch.long, device=dev),
                "fp": torch.tensor([i in fp for i in range(len(rows))], dtype=torch.bool, device=dev),
                "d": torch.tensor([int(p["d"]) for p in rows], dtype=torch.long, device=dev),
            }
        return c

    def _mk_kinds(self, key: torch.Tensor):
        """a minor item key's kind: unit, building, district, project, repair"""
        return ((key >= 0) & (key < self._mk_b0), (key >= self._mk_b0) & (key < self._mk_d0),
                (key >= self._mk_d0) & (key < self._mk_p0), (key >= self._mk_p0) & (key < self._mk_r0),
                key >= self._mk_r0)

    def _minor_item_cost(self, s: int, key: torch.Tensor) -> torch.Tensor:
        """[B] f64 — `minorItemCost` of the key per game: a unit's Production
        cost (a Builder's and a Trader's climbing), a building's (the Flood
        Barrier's off the lowland it covers), a district's own base (the
        price it locked at its placement where it stands on its plot), a
        project's (the walls' repair the HP it puts back), a repair's rest
        past `MINOR_REPAIR_RESUME_PCT`"""
        row = self._CITY_MINOR0 + s
        rd = self.rules_dev
        is_u, is_b, is_d, is_p, is_r = self._mk_kinds(key)
        ui = key.clamp(min=0, max=self.NU - 1)
        out = self._type_cost.take(ui).double()
        if self._builder_idx >= 0:
            out = torch.where(ui == self._builder_idx, self._builder_cost(self.citystate_builders_trained[:, s]).double(), out)
        if self._trader_idx >= 0 and bool((is_u & (ui == self._trader_idx)).any()):
            out = torch.where(ui == self._trader_idx, self._trader_cost(row).double(), out)
        nb = int(rd.b_cost.shape[0])
        bcost = rd.b_cost.to(torch.float64)
        bi = torch.where(is_r, key - self._mk_r0, key - self._mk_b0).clamp(min=0, max=nb - 1)
        full = bcost.take(bi)
        if self._barrier_bidx >= 0 and bool(((is_b | is_r) & (bi == self._barrier_bidx)).any()):
            full = torch.where(bi == self._barrier_bidx, self._flood_barrier_cost(row)[:, 0].double(), full)
        out = torch.where(is_b, full, out)
        out = torch.where(is_r, full - torch.floor(full * self._mb_repair_resume_pct / 100), out)
        pct = self._progress_pct_of(self.citystate_techs[:, s].sum(dim=1), self.citystate_civics[:, s].sum(dim=1))
        if bool(is_d.any()):
            dv = (key - self._mk_d0).clamp(min=0, max=int(self._mb_d_base.shape[0]) - 1)
            dfull = self._progress_cost(self._mb_d_base.take(dv), self._mb_d_k.take(dv), pct).double()
            # one placed on the plot: the price it locked at its placement
            site = self.citystate_prod_site[:, s]
            on = (site >= 0) & (self.district.gather(1, site.clamp(min=0).unsqueeze(1)).squeeze(1) == dv)
            lk = self.citystate_dist_cost[:, s].gather(1, dv.unsqueeze(1)).squeeze(1)
            dfull = torch.where(on & (lk > 0), lk.double(), dfull)
            # a district's repair: the rest past the repair's resume percent
            rep = torch.zeros_like(is_d)
            for d in sorted({int(x) for x in dv[is_d].tolist()}):
                rep = rep | (is_d & (dv == d) & self._minor_repairs_district_at(s, d, site))
            dfull = torch.where(rep, dfull - torch.floor(dfull * self._mb_repair_resume_pct / 100), dfull)
            out = torch.where(is_d, dfull, out)
        if bool(is_p.any()):
            P = self._mb_proj()
            pi = (key - self._mk_p0).clamp(min=0, max=int(P["pgb"].shape[0]) - 1)
            pg = P["pgb"].take(pi)
            pc = torch.where(pg >= 0, self._progress_cost(pg.clamp(min=0), P["pk"].take(pi), pct), P["pc"].take(pi)).double()
            if self._repair_proj_idx >= 0:
                pc = torch.where(pi == self._repair_proj_idx, self._minor_repair(s)[1], pc)
            out = torch.where(is_p, pc, out)
        return out

    def _minor_item_pct(self, s: int, key: torch.Tensor) -> torch.Tensor:
        """[B] f64 — `minorItemPct`: a Builder +200%, a unit not of the civilian formation +200%
        while the minor holds fewer than ten, walls +200%, the Harbor and the
        type's own district +500%; else 0"""
        rd = self.rules_dev
        is_u, is_b, is_d, _is_p, _is_r = self._mk_kinds(key)
        zero = torch.zeros(self.B, dtype=torch.float64, device=self.device)
        ui = key.clamp(min=0, max=self.NU - 1)
        mil = self._unit_formation_military().take(ui) & (self._minor_military_count(s) < self._mb_small_military)
        pu = torch.where(mil, zero + self._mb_military_pct, zero)
        if self._builder_idx >= 0:
            pu = torch.where(ui == self._builder_idx, zero + self._mb_builder_pct, pu)
        bi = (key - self._mk_b0).clamp(min=0, max=int(rd.b_walls.shape[0]) - 1)
        pb = torch.where(rd.b_walls.to(self.device).take(bi) > 0, zero + self._mb_walls_pct, zero)
        dv = key - self._mk_d0
        pd = torch.where(dv == self._citystate_didx[:, s], self._mb_type_pct.take(self.citystate_type[:, s].clamp(min=0)), zero)
        if self._harbor_didx >= 0:
            pd = torch.where(dv == int(self._harbor_didx), zero + self._mb_harbor_pct, pd)
        return torch.where(is_u, pu, torch.where(is_b, pb, torch.where(is_d, pd, zero)))

    def _minor_set_item(self, s: int, mask: torch.Tensor, key, site=None) -> None:
        """`minorSetItem` where `mask` (`key` an int or [B] long, -1 none, a
        district's plot `site`): the item left keeps its progress
        (`citystate_kept`, where it holds any), the one taken resumes at what
        it kept; a district's plot rides with it (`citystate_prod_site`)"""
        k_all = key if torch.is_tensor(key) else torch.full((self.B,), int(key), dtype=torch.long, device=self.device)
        # the facts' memos of the build turns read the item in hand
        self._mi_ver = getattr(self, "_mi_ver", 0) + 1
        is_d = (k_all >= self._mk_d0) & (k_all < self._mk_p0)
        st = site if site is not None else torch.full_like(k_all, -1)
        self.citystate_prod_site[:, s] = torch.where(mask, torch.where(is_d, st, torch.full_like(st, -1)),
                                                     self.citystate_prod_site[:, s])
        self._minor_place_district(s, mask & is_d, k_all, st)
        cur = self.citystate_item[:, s]
        ch = mask & (cur != k_all)
        if not bool(ch.count_nonzero()):
            return
        self.citystate_prod_reserved[:, s] = torch.where(ch, torch.full_like(self.citystate_prod_reserved[:, s], -1),
                                                         self.citystate_prod_reserved[:, s])
        rr = ch.nonzero(as_tuple=True)[0]
        old = cur[rr]
        prog = self.citystate_prod[rr, s]
        keep = (old >= 0) & (prog > 0)
        if bool(keep.any()):
            self.citystate_kept[rr[keep], s, old[keep]] = prog[keep]
        k = k_all[rr]
        has = k >= 0
        resume = torch.zeros_like(prog)
        if bool(has.any()):
            resume[has] = self.citystate_kept[rr[has], s, k[has]]
            self.citystate_kept[rr[has], s, k[has]] = 0
        self.citystate_prod[rr, s] = resume
        self.citystate_item[rr, s] = k

    def _minor_place_district(self, s: int, mask: torch.Tensor, key: torch.Tensor, site: torch.Tensor) -> None:
        """`minorPlaceDistrict` where `mask` (`key` the item, `site` its plot):
        the district stands on its plot from its production's start, under
        construction and paved, the city's own (`city_dist_tile`), its
        citizens re-placed off it; one standing there already is resumed"""
        row = self._CITY_MINOR0 + s
        is_d = (key >= self._mk_d0) & (key < self._mk_p0) & (site >= 0)
        dv_all = (key - self._mk_d0).clamp(min=0)
        sc = site.clamp(min=0)
        go = mask & is_d & (self.district[self._bidx, sc] != dv_all)
        if not bool(go.count_nonzero()):
            return
        rr = go.nonzero(as_tuple=True)[0]
        dv = dv_all[rr]
        tt = sc[rr]
        self.district[rr, tt] = dv
        self.district_complete[rr, tt] = False
        self._pave_plot(rr, tt)
        # its price locks at the placement, on the research as it stands
        pct = self._progress_pct_of(self.citystate_techs[rr, s].sum(dim=1), self.citystate_civics[rr, s].sum(dim=1))
        locked = self._progress_cost(self._mb_d_base.take(dv), self._mb_d_k.take(dv), pct)
        for d in sorted(set(dv.tolist())):
            k = dv == d
            r_d, t_d = rr[k], tt[k]
            _held = self.city_dist_tile[r_d, row, 0, d]
            self.city_dist_tile[r_d, row, 0, d] = torch.where(_held >= 0, _held, t_d) if bool(self._is_repeatable[d]) else t_d
            self.citystate_dist_cost[r_d, s, d] = locked[k]
        self._eff_version += 1
        self._minor_replace_citizens(s, go)

    def _minor_can_train(self, s: int, ui: torch.Tensor) -> torch.Tensor:
        """[B] — `minorCanTrain` of chassis `ui` ([B], -1 none): the minor's
        research unlocks it, no civilization's unique, none faith-bought,
        spawned or a spy, a naval unit at a coastal centre, an air unit beside
        a complete Aerodrome, a Trader below the trade capacity, the
        Archaeologist with an Archaeological Museum; a city-state ignores the
        strategic resources"""
        row = self._CITY_MINOR0 + s
        u0 = ui.clamp(min=0, max=self.NU - 1)
        ok = (ui >= 0) & (self._type_uniq.take(u0) < 0) & ~self._type_faith_only.take(u0) & ~self._type_spawn_only.take(u0)
        if self._spy_idx >= 0:
            ok = ok & (u0 != self._spy_idx)
        if not self._minor_any_res:
            ok = ok & (self._type_resource.take(u0) < 0)
        tt, tc = self._type_tech.take(u0), self._type_civic.take(u0)
        ok = ok & ((tt < 0) | self.citystate_techs[:, s].gather(1, tt.clamp(min=0).unsqueeze(1)).squeeze(1))
        ok = ok & ((tc < 0) | self.citystate_civics[:, s].gather(1, tc.clamp(min=0).unsqueeze(1)).squeeze(1))
        nav = self.unit_naval.take(u0)
        if bool((ok & nav).any()):
            ok = ok & (~nav | self._naval_capable_minor(s))
        air = self._type_air.take(u0) > 0
        if bool((ok & air).any()):
            if self._aerodrome_didx >= 0:
                at = self.city_dist_tile[:, row, 0, self._aerodrome_didx]
                aero = (at >= 0) & self.district_complete.gather(1, at.clamp(min=0).unsqueeze(1)).squeeze(1)
            else:
                aero = torch.zeros_like(ok)
            ok = ok & (~air | aero)
        if self._trader_idx >= 0 and bool((ok & (u0 == self._trader_idx)).any()):
            ok = ok & ((u0 != self._trader_idx) | (self._minor_traders(s) < self._trade_capacity(row)))
        if self._archaeologist_idx >= 0 and bool((ok & (u0 == self._archaeologist_idx)).any()):
            T = self._cv_tables()
            names = [r["type"] for r in T["bld_rows"]]
            mus = T["engine"]["building"][names.index("BUILDING_MUSEUM_ARTIFACT")] if "BUILDING_MUSEUM_ARTIFACT" in names else -1
            has = self.city_bldg[:, row, 0, mus] if mus >= 0 else torch.zeros_like(ok)
            ok = ok & ((u0 != self._archaeologist_idx) | has)
        return ok

    def _minor_district_plane(self, s: int, dv: int, own: bool, research: bool, limit: bool = True) -> torch.Tensor:
        """[B, T] — `canPlaceDistrictIn` of district `dv` in minor `s`'s city
        on each plot: with `own` the minor's own plots alone, else any; with
        `research` its research unlocks the district and clears the plot's
        feature, else neither is asked. Within three of the centre and not
        on it, no district, centre or wonder there, a bonus resource at most
        (an unseen one plain ground), the district's surface and placement
        (`_district_elig`), one of a type to the city (a repeatable one
        aside), a specialty district under the population's limit (`limit`; the
        plot analysis asks none, `anyCount`) — and the
        plot holding this district the city placed and is building (no
        resource asked, the city's count without it)."""
        row = self._CITY_MINOR0 + s
        B, dev = self.B, self.device
        sc = {int(di): (int(ut), int(uc), int(plc)) for (di, ut, uc, plc, _fc) in self._scaffold}
        if dv not in sc:
            return torch.zeros(B, self.T, dtype=torch.bool, device=dev)
        ut, uc, plc = sc[dv]
        center = self.citystate_center[:, s].clamp(min=0)
        dist_t = self.city_dist_tile[:, row, 0, dv]
        held_p = ((self.district == dv) & ~self.district_complete & (dist_t >= 0).unsqueeze(1)
                  & (torch.arange(self.T, device=dev).unsqueeze(0) == dist_t.unsqueeze(1)))
        base = (((self.district < 0) | held_p) & (self.built_wonder < 0) & ~self._centre_plane()
                & (self.pair_dist[center] <= 3) & (self.citystate_center[:, s] >= 0).unsqueeze(1))
        base = base & (held_p | (self.res_priority <= 1) | self._res_hidden(row))
        if own:
            base = base & (self.tile_seat == 100 + s)
        if research:
            need_clear = (self.tile_ftu >= 0) & ~self.feat_stripped
            if bool(need_clear.count_nonzero()):
                have = self.citystate_techs[:, s].gather(1, self.tile_ftu.clamp(min=0))
                base = base & (~need_clear | have)
            unl = (self.citystate_techs[:, s, ut] if ut >= 0
                   else self.citystate_civics[:, s, uc] if uc >= 0 else torch.ones(B, dtype=torch.bool, device=dev))
            base = base & unl.unsqueeze(1)
        base[torch.arange(B, device=dev), center] = False
        elig = self._district_elig(row, 0, dv, plc, base=base)
        held = (self.city_dist_tile[:, row, 0, dv] >= 0) & ~self._is_repeatable[dv]
        ok = (~held).unsqueeze(1)
        ok_h = held_p
        if limit and bool(self._is_specialty[dv]):
            spec = ((self.city_dist_tile[:, row, 0] >= 0) & self._is_specialty).sum(dim=1)
            cap = torch.div(self.city_pop[:, row, 0].long() - 1, 3, rounding_mode="floor") + 1
            ok = ok & (spec < cap).unsqueeze(1)
            ok_h = ok_h & (spec - 1 < cap).unsqueeze(1)
        return elig & (ok | ok_h)

    def _minor_repairs_district_at(self, s: int, dv: int, site: torch.Tensor) -> torch.Tensor:
        """[B] — `minorRepairsDistrictAt` for engine district `dv`: the plot
        `site` holds the minor's own `dv`, pillaged"""
        row = self._CITY_MINOR0 + s
        sc = site.clamp(min=0)
        return ((site >= 0) & (self.district[self._bidx, sc] == dv) & self.district_pillaged[self._bidx, sc]
                & (self.tile_seat[self._bidx, sc] == 100 + s) & (self.city_dist_tile[:, row, 0, dv] == site))

    def _minor_queue_ok(self, s: int, key: torch.Tensor, site: torch.Tensor) -> torch.Tensor:
        """[B] — `minorQueueOk`: may the minor's queue take the item now? A
        building it may raise (a worship building only the one its religion
        offers), a district its plot takes (the one it placed there among
        them, the repair of its own pillaged one there), a unit it may train,
        a project it may run (the walls' repair while available)"""
        row = self._CITY_MINOR0 + s
        is_u, is_b, is_d, is_p, _is_r = self._mk_kinds(key)
        ok = torch.zeros(self.B, dtype=torch.bool, device=self.device)
        if bool(is_u.any()):
            ok = ok | (is_u & self._minor_can_train(s, key))
        if bool(is_b.any()):
            worship = self._minor_worship(s)
            for bi in sorted({int(x) - self._mk_b0 for x in key[is_b].tolist()}):
                m = is_b & (key == self._mk_b0 + bi)
                w = bool(self._b_worship[bi])
                ok = ok | (m & self._minor_building_ok(s, bi) & ((worship == bi) if w else True))
        if bool(is_d.any()):
            for dv in sorted({int(x) - self._mk_d0 for x in key[is_d].tolist()}):
                m = is_d & (key == self._mk_d0 + dv) & (site >= 0)
                if bool(m.any()):
                    pl = self._minor_district_plane(s, dv, True, True)
                    ok = ok | (m & pl.gather(1, site.clamp(min=0).unsqueeze(1)).squeeze(1))
                    # the repair of its own pillaged district there
                    ok = ok | (m & self._minor_repairs_district_at(s, dv, site))
        if bool(is_p.any()):
            P = self._mb_proj()
            for pi in sorted({int(x) - self._mk_p0 for x in key[is_p].tolist()}):
                m = is_p & (key == self._mk_p0 + pi)
                if pi == self._repair_proj_idx:
                    ok = ok | (m & self._minor_repair(s)[0])
                    continue
                d = int(P["d"][pi])
                if d < 0:
                    continue
                t = self.city_dist_tile[:, row, 0, d]
                t0 = t.clamp(min=0).unsqueeze(1)
                ok = ok | (m & (t >= 0) & self.district_complete.gather(1, t0).squeeze(1) & ~self._fallout().gather(1, t0).squeeze(1))
        return ok

    def _trainable_in(self, techs: torch.Tensor, civics: torch.Tensor, any_res: bool,
                      naval: bool = False) -> torch.Tensor:
        """[B, NU] — `trainableIn`: the land (with `naval`, the naval)
        military chassis a research record ([B, NT], [B, NC]) unlocks, asking
        no strategic resource unless `any_res`, no civilization's unique, of a
        class MinorCivUnitBuilds does not bar."""
        B = self.B
        cls = self.rules_dev.u_promo_class.to(self.device)
        hull = self.unit_naval if naval else ~self.unit_naval
        static = (self._type_military & hull & (self._type_air <= 0) & ~self._type_faith_only
                  & ~self._type_spawn_only & ~self._type_settler & (self._type_uniq < 0) & (cls >= 0))
        if not any_res:
            static = static & (self._type_resource < 0)
        for c in self._mb_excl_cls:
            static = static & (cls != c)
        tech_ok = (self._type_tech < 0).unsqueeze(0) | techs.gather(
            1, self._type_tech.clamp(min=0).unsqueeze(0).expand(B, -1))
        civic_ok = (self._type_civic < 0).unsqueeze(0) | civics.gather(
            1, self._type_civic.clamp(min=0).unsqueeze(0).expand(B, -1))
        return static.unsqueeze(0) & tech_ok & civic_ok

    def _minor_best_of_class(self, trainable: torch.Tensor, c: int) -> torch.Tensor:
        """[B] long — the strongest chassis of promotion class `c` in the
        set, ties by catalog order; -1 where it has none
        (`minorBestOfClass`)."""
        ok = trainable & (self.rules_dev.u_promo_class.to(self.device) == c).unsqueeze(0)
        cs = torch.where(ok, self._type_combat.unsqueeze(0).long(),
                         torch.full((1, self.NU), -1, dtype=torch.long, device=self.device))
        pick = cs.argmax(dim=1)  # the FIRST maximum: catalog order on a tie
        return torch.where(ok.any(dim=1), pick, torch.full_like(pick, -1))

    def _minor_building_ok(self, s: int, bi: int) -> torch.Tensor:
        """[B] — `minorBuildingOk`: the minor's own research unlocks building
        `bi`; it is not already held; its district stands complete, unpillaged and clean
        (the centre for a City Center row); the row it requires is held and
        the one it excludes is not; a Water Mill wants a river at the centre;
        a Flood Barrier wants Coastal Lowland; and CIV6: "While city defenses
        are damaged, you cannot build higher levels of Walls." A worship
        building carries no research gate (`b_unlock` -1)."""
        B, dev = self.B, self.device
        rd = self.rules_dev
        row = self._CITY_MINOR0 + s
        bidx = self._bidx
        ones = torch.ones(B, dtype=torch.bool, device=dev)
        ut, uc = int(rd.b_unlock[bi]), int(rd.b_unlock_civic[bi])
        ok = ~self.city_bldg[:, row, 0, bi]
        ok = ok & (self.citystate_techs[:, s, ut] if ut >= 0 else ones)
        ok = ok & (self.citystate_civics[:, s, uc] if uc >= 0 else ones)
        ctr = self.citystate_center[:, s].clamp(min=0)
        rq = int(self._b_req_district[bi])
        if rq < 0:
            home = ctr
            ok = ok & ~self._fallout()[bidx, ctr]
        else:
            home = self.city_dist_tile[:, row, 0, rq]
            # the queue's CanConstruct (0x1714d0) refuses a building of a
            # pillaged district (LOC_BUILDING_CONSTRUCT_DISTRICT_IS_PILLAGED)
            ok = ok & (home >= 0) & self.district_complete[bidx, home.clamp(min=0)] \
                & ~self.district_pillaged[bidx, home.clamp(min=0)] & ~self._fallout()[bidx, home.clamp(min=0)]
        have = self.city_bldg[:, row, 0]
        reqs = self._b_req_buildings[bi]
        if reqs:
            ok = ok & have[:, reqs].any(dim=1)
        excl = self._b_excl_buildings[bi]
        if excl:
            ok = ok & ~have[:, excl].any(dim=1)
        if bool(rd.b_river[bi]):
            ok = ok & self.tile_river[bidx, ctr]
        if bi == self._barrier_bidx:
            # CIV6 (Flood Barrier): "Must be built in a city with one or more
            # Coastal Lowland tiles."
            ok = ok & (self._city_lowland_count(row)[:, 0] > 0)
        if int(rd.b_walls[bi]) > 0:
            ok = ok & (self.city_outer_hp[:, row, 0] >= self._walls_tier_hp.take(self._minor_walls_tier(s)))
        return ok

    def _minor_repair_target(self, s: int) -> torch.Tensor:
        """[B] long — `minorRepairTarget`: the pillaged building minor `s`
        repairs next, the first in the layout whose district stands complete
        and unpillaged (a City Center row always); -1 for none."""
        row = self._CITY_MINOR0 + s
        NB = int(self._b_req_district.shape[0])
        pil = self.city_bldg_pillaged[:, row, 0] & self.city_bldg[:, row, 0]            # [B, NB]
        rq = self._b_req_district
        dt = self.city_dist_tile[:, row, 0][:, rq.clamp(min=0)]                          # [B, NB]
        d0 = dt.clamp(min=0)
        clean = (dt >= 0) & self.district_complete.gather(1, d0) & ~self.district_pillaged.gather(1, d0)
        ok = pil & ((rq < 0).unsqueeze(0) | clean)
        first = torch.where(ok, torch.arange(NB, device=self.device).unsqueeze(0), torch.full_like(dt, NB)).min(dim=1).values
        return torch.where(first < NB, first, torch.full_like(first, -1))

    def _minor_spawn(self, s: int, mask: torch.Tensor, ui: torch.Tensor,
                     grants: bool = True) -> torch.Tensor:
        """[B] — a unit of chassis `ui` lands on the minor's centre or its ring
        (`spawnUnit`, the ordinary rule) under its seat, carrying what the
        city's buildings hand a unit trained there (`applyTrainingGrants`)
        unless `grants` is off; a Builder counts toward the next one's price.
        Every such unit is trained or bought, so it raises the minor's best
        melee (`_raise_best_trained`). The games where it landed."""
        if not bool(mask.count_nonzero()):
            return torch.zeros_like(mask)
        row = self._CITY_MINOR0 + s
        col0 = torch.zeros(self.B, dtype=torch.long, device=self.device)
        u0 = ui.clamp(min=0)
        xp = None
        if grants:
            bl = self.city_bldg[:, row, 0] & ~self._bldg_dark(
                self.city_dist_tile[:, row, 0], self.city_bldg_pillaged[:, row, 0])
            xp = self._train_xp_pct(bl, u0, row, col0)
        landed = self._spawn_unit(row, mask, self.citystate_center[:, s].clamp(min=0), u0, init_xp=xp)
        self._raise_best_trained(row, landed, u0)
        if self._builder_idx >= 0:
            self.citystate_builders_trained[:, s] += (landed & (u0 == self._builder_idx)).long()
        self._gen_ver += 1
        return landed

    def _minor_build(self, s: int, prod: torch.Tensor | None = None) -> None:
        """`minorBuild` — THE MINOR'S STEP (City_BuildQueue 0x16f050) works
        the item in hand, its city AI's pick (`_minor_ai_turn`, after the
        step). The city keeps each item's progress apart: the item it turns
        from keeps what it holds and one it turns back to resumes there
        (`_minor_set_item`, `citystate_kept`). The step pays the city's
        Production (A, `prod`, the minor's -50% among its percents) plus the
        overflow store, the sum under the item's own row (`_minor_item_pct`),
        and the item completes when its progress covers its cost
        (`_minor_item_cost`), one a turn — a unit also needs a free tile on or
        beside the centre — leaving the store A less what it lacked before
        the step, never below 0; with nothing in hand the step adds A to the
        store. A district project converts the row's percent of what the step
        paid in (never above its cost) into its yield, which the city's
        yields read until the next step; the step clears the last conversion
        first. A PILLAGED building is queued after the item the minor was
        working on when it fell (`citystate_repair_wait`) and then comes
        first, or at once with nothing in hand (`_minor_repair_target`); a
        repair in hand stands only while its building is the one to repair."""
        if self.S == 0:
            return
        alive = self.citystate_alive[:, s]
        if not bool(alive.count_nonzero()):
            return
        B, dev = self.B, self.device
        self.citystate_full_power[:, s] = False
        self.citystate_build_proj[:, s] = -1
        row = self._CITY_MINOR0 + s
        self.city_proj_conv[:, row, 0] = 0
        self.city_proj_yield[:, row, 0] = -1
        zero_b = torch.zeros(B, dtype=torch.float64, device=dev)
        made = torch.where(alive, prod, zero_b) if prod is not None else zero_b
        rep = self._minor_repair_target(s)
        rep_key = torch.where(rep >= 0, self._mk_r0 + rep, torch.full_like(rep, -1))
        cur = self.citystate_item[:, s]
        first = (rep >= 0) & ~self.citystate_repair_wait[:, s]
        held = torch.where((cur >= self._mk_r0) & (cur != rep_key), torch.full_like(cur, -1), cur)
        self.citystate_repair_wait[:, s] &= ~(alive & ~first & (held < 0))
        item = torch.where(first, rep_key, torch.where(held >= 0, held, rep_key))
        site = torch.where(item == cur, self.citystate_prod_site[:, s], torch.full_like(item, -1))
        self._minor_set_item(s, alive, item, site)
        # the queue's front check (0x17f070 -> 0x17f3a0): a unit with a
        # strategic cost and no progress reserves its cost where the stock
        # less the reservations covers it, else leaves the front
        if self._n_strategic:
            ui = item.clamp(min=0, max=self.NU - 1)
            slot = self._type_res_slot.take(ui)
            need = self._type_res_cost.take(ui)
            fresh = (alive & (item >= 0) & (item < self._mk_b0) & (slot >= 0) & (need > 0)
                     & (self.citystate_prod[:, s] <= 0) & (self.citystate_prod_reserved[:, s] < 0))
            if bool(fresh.count_nonzero()):
                free = (self.citystate_stockpile[:, s] - self._stock_reserved(row)).gather(1, slot.clamp(min=0).unsqueeze(1)).squeeze(1)
                drop = fresh & (free < need)
                self.citystate_prod_reserved[:, s] = torch.where(fresh & ~drop, need, self.citystate_prod_reserved[:, s])
                if bool(drop.count_nonzero()):
                    self._minor_set_item(s, drop, -1)
                    item = torch.where(drop, torch.full_like(item, -1), item)
        none = alive & (item < 0)
        self.citystate_ovf[:, s] += torch.where(none, made, zero_b)
        act = alive & (item >= 0)
        if not bool(act.count_nonzero()):
            return
        pct = self._minor_item_pct(s, item)
        cost = self._minor_item_cost(s, item)
        before = self.citystate_prod[:, s].clone()
        paid = made + self.citystate_ovf[:, s]
        self.citystate_prod[:, s] = torch.where(act, before + paid * ((100 + pct) / 100), before)
        self.citystate_ovf[:, s] = torch.where(act, zero_b, self.citystate_ovf[:, s])
        _is_u, _is_b, is_d, is_p, _is_r = self._mk_kinds(item)
        if bool((act & is_p).any()):
            P = self._mb_proj()
            pi = (item - self._mk_p0).clamp(min=0, max=int(P["y"].shape[0]) - 1)
            yi = P["y"].take(pi)
            conv = act & is_p & (yi >= 0)
            self.city_proj_conv[:, row, 0] = torch.where(conv, torch.minimum(paid, cost) * self._proj_rate_t.take(pi),
                                                         self.city_proj_conv[:, row, 0])
            self.city_proj_yield[:, row, 0] = torch.where(conv, yi, self.city_proj_yield[:, row, 0])
        if self._log_diff and bool((act & is_d).any()):
            for _b in (act & is_d).nonzero(as_tuple=True)[0].tolist():
                _nm = self.districts_cat[int(item[_b]) - self._mk_d0]['id']
                self._diff_events.setdefault(_b, []).append(
                    f"dm:{100 + s}:{int(self.turn)}:{_nm} t{int(float(cost[_b]))}"
                    f" pot{int(float(self.citystate_prod[_b, s]))}")
        short = act & (self.citystate_prod[:, s] < cost)
        if bool((short & is_p).any()):
            P = self._mb_proj()
            pi = (item - self._mk_p0).clamp(min=0, max=int(P["fp"].shape[0]) - 1)
            sp = short & is_p
            self.citystate_build_proj[:, s] = torch.where(sp, pi, self.citystate_build_proj[:, s])
            self.citystate_full_power[:, s] |= sp & P["fp"].take(pi)
        done = act & ~short
        if not bool(done.count_nonzero()):
            return
        fin = self._minor_finish(s, done, item)
        self.citystate_ovf[:, s] = torch.where(fin, (made - (cost - before).clamp(min=0)).clamp(min=0),
                                               self.citystate_ovf[:, s])

    def _minor_finish(self, s: int, done: torch.Tensor, item: torch.Tensor) -> torch.Tensor:
        """`minorFinish` where `done`: the unit stands on or beside the centre
        with the city's training grants (none with no free tile: the item
        waits), the building rises (the walls at full, the Flood Barrier
        drying what it covers), the district is laid on its plot — where the
        plot no longer takes it the item leaves the queue — the walls'
        repair restores the walls at the HP it puts back, the pillaged
        building is whole. The item in hand is done; its contracts hear of
        it (`contract_built`). [B] the games where it completed."""
        from .sim_citytrees import contract_built
        B, dev = self.B, self.device
        row = self._CITY_MINOR0 + s
        rd = self.rules_dev
        is_u, is_b, is_d, is_p, is_r = self._mk_kinds(item)
        fin = torch.zeros(B, dtype=torch.bool, device=dev)
        neg = torch.full((B,), -1, dtype=torch.long, device=dev)
        uid = neg.clone()
        u_row, b_row, d_row = neg.clone(), neg.clone(), neg.clone()
        T = self._cv_tables()
        m = done & is_u
        if bool(m.any()):
            ui = item.clamp(min=0, max=self.NU - 1)
            slot0 = self.unit_next.clone()
            landed = self._minor_spawn(s, m, ui)
            uid = torch.where(landed, self.POOL_LO["major"] + slot0, uid)
            u_row = torch.where(landed, T["engine_row"].to(dev).take(ui), u_row)
            fin = fin | landed
            # its reservation released and its strategic cost charged
            # together (0x1856b3 / 0x185a2a)
            if self._n_strategic:
                slot = self._type_res_slot.take(ui)
                held = self.citystate_prod_reserved[:, s]
                bank = self.citystate_stockpile[:, s]
                pay = landed & (slot >= 0) & (held >= 0)
                if bool(pay.count_nonzero()):
                    have = bank.gather(1, slot.clamp(min=0).unsqueeze(1)).squeeze(1)
                    take = torch.minimum(held, have).clamp(min=0)
                    bank.scatter_add_(1, slot.clamp(min=0).unsqueeze(1), -(pay.long() * take).unsqueeze(1))
                    self._log_stock(pay.nonzero(as_tuple=True)[0], row, slot[pay], "mu")
                self.citystate_prod_reserved[:, s] = torch.where(landed, torch.full_like(held, -1), held)
        m = done & is_b
        if bool(m.any()):
            bi = (item - self._mk_b0).clamp(min=0, max=int(rd.b_cost.shape[0]) - 1)
            rr = m.nonzero(as_tuple=True)[0]
            self.city_bldg[rr, row, 0, bi[rr]] = True
            if self._barrier_bidx >= 0 and bool((m & (bi == self._barrier_bidx)).any()):
                self._repair_behind_barrier(row, torch.zeros(B, dtype=torch.long, device=dev), m & (bi == self._barrier_bidx))
            wl = m & (rd.b_walls.to(dev).take(bi) > 0)
            if bool(wl.any()):
                ww = wl.nonzero(as_tuple=True)[0]
                full = self._walls_tier_hp[self._minor_walls_tier(s)]
                self.city_outer_hp[ww, row, 0] = full[ww]
                self._fit_encamp_outer(ww, row, torch.zeros_like(ww), full[ww])
            self._bldg_version += 1
            self._eff_version += 1
            b_row = torch.where(m, T["building_row"].to(dev).take(bi), b_row)
            fin = fin | m
        m = done & is_d
        if bool(m.any()):
            site = self.citystate_prod_site[:, s]
            ok = self._minor_queue_ok(s, item, site)
            gone = m & ~ok
            if bool(gone.any()):
                self._minor_set_item(s, gone, -1)
            place = m & ok
            if bool(place.any()):
                self._minor_place_district(s, place, item, site)
                rr = place.nonzero(as_tuple=True)[0]
                dv = (item - self._mk_d0)[rr]
                tt = site[rr]
                self.district_complete[rr, tt] = True
                # a repair stands the district unpillaged; its pillaged
                # buildings wait for their own repairs
                self.district_pillaged[rr, tt] = False
                for d in sorted(set(dv.tolist())):
                    k = dv == d
                    r_d, t_d = rr[k], tt[k]
                    if d == self._encamp_didx:
                        self.encamp_hp[r_d, t_d] = self._encamp_hp_max
                        self.encamp_outer_hp[r_d, t_d] = self._walls_tier_hp[self._minor_walls_tier(s)][r_d]
                self._eff_version += 1
                dr = T["district_row"].to(dev)
                d_row = torch.where(place, dr.take((item - self._mk_d0).clamp(min=0, max=dr.numel() - 1)), d_row)
                fin = fin | place
        m = done & is_p
        if bool(m.any()):
            rp = m & ((item - self._mk_p0) == self._repair_proj_idx)
            if bool(rp.any()):
                rr = rp.nonzero(as_tuple=True)[0]
                full = self._walls_tier_hp[self._minor_walls_tier(s)]
                self.city_outer_hp[rr, row, 0] = full[rr]
                self._fit_encamp_outer(rr, row, torch.zeros_like(rr), full[rr])
            fin = fin | m
        m = done & is_r
        if bool(m.any()):
            rr = m.nonzero(as_tuple=True)[0]
            self.city_bldg_pillaged[rr, row, 0, (item - self._mk_r0)[rr]] = False
            self._bldg_version += 1
            self._eff_version += 1
            fin = fin | m
        self.citystate_repair_wait[:, s] &= ~(fin & ~is_r)
        self.citystate_prod[:, s] = torch.where(fin, torch.zeros_like(self.citystate_prod[:, s]), self.citystate_prod[:, s])
        self.citystate_item[:, s] = torch.where(fin, torch.full_like(item, -1), self.citystate_item[:, s])
        self.citystate_prod_site[:, s] = torch.where(fin, torch.full_like(item, -1), self.citystate_prod_site[:, s])
        built = fin & ((u_row >= 0) | (b_row >= 0) | (d_row >= 0)) & self.citystate_ai_on[:, s]
        if bool(built.any()):
            contract_built(self.cityai, s, -1, u_row, b_row, d_row, uid, built,
                           join=lambda tree, unit, m: self._mops_join(s, tree, unit - self.POOL_LO["major"], m))
        return fin

    def _minor_upgrades(self, s: int, gained: torch.Tensor) -> None:
        """`minorUpgrades` — CIV6 (Leaders.xml, MinorCivTriggeredTrees): a
        minor's "Upgrade Units" tree runs on a technology or civic gained; the
        census reads one upgrade per completion at `upgradeGold` each. Each of
        the turn's completions (`gained`, [B]) upgrades the first unit in slot
        order whose chassis' upgrade the minor's research unlocks, standing on
        the minor's ground with Movement left, while the treasury covers the
        price; the minor asks no strategic resource, paying the new chassis'
        cost where its stock covers it. The upgrade spends the unit's turn."""
        alive = self.citystate_alive[:, s]
        top = int((gained * alive.long()).max())
        if top <= 0:
            return
        seat = 100 + s
        techs, civics = self.citystate_techs[:, s], self.citystate_civics[:, s]
        for n in range(top):
            act = alive & (gained > n) & self._afford(self.citystate_treasury[:, s], self._mb_upgrade_gold)
            if not bool(act.count_nonzero()):
                return
            mine = self.major_unit_alive & (self.major_unit_seat == seat)
            ut = self.major_unit_type.clamp(min=0, max=self.NU - 1)
            nxt = self._type_up_to[ut]
            nc = nxt.clamp(min=0)
            rt, rc = self._type_tech[nc], self._type_civic[nc]
            ok_t = (rt < 0) | techs.gather(1, rt.clamp(min=0))
            ok_c = (rc < 0) | civics.gather(1, rc.clamp(min=0))
            tile = self.major_unit_tile.clamp(min=0)
            own = self.tile_seat.gather(1, tile) == seat
            cand = mine & (nxt >= 0) & ok_t & ok_c & own & (self.major_unit_mp > 0)
            go = act & cand.any(dim=1)
            if not bool(go.count_nonzero()):
                return
            first = cand.long().argmax(dim=1)
            rr = go.nonzero(as_tuple=True)[0]
            u = first[rr]
            self.citystate_treasury[rr, s] -= self._mb_upgrade_gold
            # the new chassis' strategic cost where its stock covers it, none
            # where both rungs ask the same resource (a city-state upgrades
            # without it)
            if self._n_strategic:
                was, to = ut[rr, u], nxt[rr, u].clamp(min=0)
                k = self._type_res_slot.take(to)
                n_res = self._type_res_cost.take(to)
                bank = self.citystate_stockpile[rr, s]
                have = bank.gather(1, k.clamp(min=0).unsqueeze(1)).squeeze(1)
                pay = (k >= 0) & (n_res > 0) & (k != self._type_res_slot.take(was)) & (have >= n_res)
                if bool(pay.count_nonzero()):
                    bank.scatter_add_(1, k.clamp(min=0).unsqueeze(1), -(pay.long() * n_res).unsqueeze(1))
                    self.citystate_stockpile[rr, s] = bank
            self.major_unit_type[rr, u] = nxt[rr, u]
            self.major_unit_mp[rr, u] = 0
            self._gen_ver += 1
            # the upgraded chassis raises the minor's base (`raiseBestTrained`)
            self._raise_best_trained(self._CITY_MINOR0 + s, go, nxt.gather(1, first.unsqueeze(1)).squeeze(1),
                                   formation=self.major_unit_formation.gather(1, first.unsqueeze(1)).squeeze(1))

    def _naval_capable_minor(self, s: int) -> torch.Tensor:
        """[B] — `cityNavalCapable` for minor `s`'s city: enterable water
        beside the centre, or a completed Harbor."""
        row = self._CITY_MINOR0 + s
        ctr = self.citystate_center[:, s].clamp(min=0)
        nb = self.neigh[ctr]
        nbc = nb.clamp(min=0)
        out = ((nb >= 0) & self.wpass.gather(1, nbc)).any(dim=1)
        if self._harbor_didx >= 0:
            ht = self.city_dist_tile[:, row, 0, self._harbor_didx]
            out = out | ((ht >= 0) & self.district_complete.gather(1, ht.clamp(min=0).unsqueeze(1)).squeeze(1))
        return out


    def _free_walls_max(self, j: int) -> torch.Tensor:
        """[B] long — `wallsMax` of the Free City in column `j`."""
        B, dev = self.B, self.device
        return self._walls_max_at(torch.full((B,), self.FREE_ROW, dtype=torch.long, device=dev),
                                  torch.full((B,), j, dtype=torch.long, device=dev))

    def _free_building_ok(self, j: int, bi: int, techs: torch.Tensor, civics: torch.Tensor) -> torch.Tensor:
        """[B] — `freeCityBuildingOk`: the Free Cities' research unlocks
        building `bi`; the city does not hold it; its district stands complete,
        unpillaged and clean (the centre for a City Center row); the row it requires is
        held and the one it excludes is not; a Water Mill wants a river at the
        centre; and no higher Walls while the walls are damaged."""
        B, dev = self.B, self.device
        rd = self.rules_dev
        row = self.FREE_ROW
        bidx = self._bidx
        ones = torch.ones(B, dtype=torch.bool, device=dev)
        ut, uc = int(rd.b_unlock[bi]), int(rd.b_unlock_civic[bi])
        ok = ~self.city_bldg[:, row, j, bi]
        ok = ok & (techs[:, ut] if ut >= 0 else ones)
        ok = ok & (civics[:, uc] if uc >= 0 else ones)
        ctr = self.city_center[:, row, j].clamp(min=0)
        rq = int(self._b_req_district[bi])
        if rq < 0:
            ok = ok & ~self._fallout()[bidx, ctr]
        else:
            home = self.city_dist_tile[:, row, j, rq]
            ok = ok & (home >= 0) & self.district_complete[bidx, home.clamp(min=0)] \
                & ~self.district_pillaged[bidx, home.clamp(min=0)] & ~self._fallout()[bidx, home.clamp(min=0)]
        have = self.city_bldg[:, row, j]
        reqs = self._b_req_buildings[bi]
        if reqs:
            ok = ok & have[:, reqs].any(dim=1)
        excl = self._b_excl_buildings[bi]
        if excl:
            ok = ok & ~have[:, excl].any(dim=1)
        if bool(rd.b_river[bi]):
            ok = ok & self.tile_river[bidx, ctr]
        if int(rd.b_walls[bi]) > 0:
            ok = ok & (self.city_outer_hp[:, row, j] >= self._free_walls_max(j))
        return ok

    def _free_repair(self, j: int) -> tuple[torch.Tensor, torch.Tensor]:
        """([B] bool, [B] f64) — `repairAvailable` and `projectCost` for the
        Free City in column `j`: walls standing and breached (the centre's
        pool or its Encampment's), the centre clean, three quiet turns; the
        price the HP it puts back, at least 1."""
        row = self.FREE_ROW
        mx = self._free_walls_max(j)
        outer = torch.minimum(self.city_outer_hp[:, row, j], mx)
        enc_missing = torch.zeros_like(mx)
        if self._encamp_didx >= 0:
            et = self.city_dist_tile[:, row, j, self._encamp_didx]
            e0 = et.clamp(min=0).unsqueeze(1)
            live = (et >= 0) & self.district_complete.gather(1, e0).squeeze(1)
            ecur = torch.minimum(self.encamp_outer_hp.gather(1, e0).squeeze(1), mx)
            enc_missing = torch.where(live, mx - ecur, torch.zeros_like(mx))
        breached = (outer < mx) | (enc_missing > 0)
        ctr = self.city_center[:, row, j]
        clean = (ctr >= 0) & ~self._fallout().gather(1, ctr.clamp(min=0).unsqueeze(1)).squeeze(1)
        ok = (mx > 0) & breached & clean & ((int(self.turn) - self.city_last_hit[:, row, j]) >= self._repair_quiet)
        cost = ((mx - outer) + enc_missing).clamp(min=1).double()
        return ok, cost

    def _free_nearest_col(self) -> torch.Tensor:
        """[B, U] long — the Free Cities column nearest each hostile-pool
        unit's plot (`freeHome`'s nearest), ties to the lowest column; -1 with no
        Free City."""
        row = self.FREE_ROW
        alive = self.city_alive[:, row]  # [B, RC]
        ctr = self.city_center[:, row].clamp(min=0)
        tile = self.barb_unit_tile.clamp(min=0)  # [B, U]
        d = self.pair_dist[ctr.unsqueeze(2), tile.unsqueeze(1)].long()  # [B, RC, U]
        rc = self.RC
        key = torch.where(alive.unsqueeze(2), d * rc + torch.arange(rc, device=self.device).reshape(1, rc, 1),
                          torch.full_like(d, 1 << 40))
        best = key.min(dim=1).values
        return torch.where(best < (1 << 40), best % rc, torch.full_like(best, -1))

    def _wonder_base_ok(self, row: int, j: int) -> torch.Tensor:
        """[B, T] wonder-tile base predicate for seat row `row`'s city slot j —
        ONE body shared by every seat, the mask and the driven apply, because
        placement legality that exists twice drifts twice."""
        d_ctr = self.pair_dist[self.city_center[:, row, j].clamp(min=0)]
        return (
            (self.tile_seat == row)
            & (self.tile_city == self.city_id[:, row, j].unsqueeze(1))
            & (d_ctr <= 3)
            & (self.district < 0)
            & (self.built_wonder < 0)
            & (self.centre_slot_at < 0)
            & ((self.res_priority <= 1) | self._res_hidden(row))   # an unseen strategic is plain ground
        )

    def _wonder_unlock_ok(self, row: int, wi: int) -> torch.Tensor | None:
        """[B] unlock for wonder wi, or None when its unlock or adjacency
        requirement sits outside the compact tree (-3: the TS includes() never
        matches, so the wonder is unbuildable for every seat)."""
        wrow = self._wond_rows[wi]
        if int(wrow["ut"]) == -3 or int(wrow["uc"]) == -3:
            return None
        if int(wrow["adjD"]) == -3:
            return None
        ok = torch.ones(self.B, dtype=torch.bool, device=self.device)
        if int(wrow["ut"]) >= 0:
            ok = ok & self.civ_techs[:, row, int(wrow["ut"])]
        if int(wrow["uc"]) >= 0:
            ok = ok & self.civ_civics[:, row, int(wrow["uc"])]
        return ok

    def _wadj_plane(self, key: tuple, build) -> torch.Tensor:
        """[B, T] adjacency planes under `_wonder_cand`, memoised on
        `_eff_version`: each plane depends on the catalog row's adjacency
        arguments alone (plus the seat, for the capital plane), and the mask
        walk asks for the same plane once per (city, wonder row). Every
        engine write that could move one bumps `_eff_version`."""
        if self._wadj_cache is None or self._wadj_cache[0] != self._eff_version:
            self._wadj_cache = (self._eff_version, {})
        d = self._wadj_cache[1]
        v = d.get(key)
        if v is None:
            v = build()
            d[key] = v
        return v

    def _wonder_site_plane(self, wi: int) -> torch.Tensor:
        """[B, T] — wonder `wi`'s terrain bit off the baked `wok` mask, less
        every fire's plot: the half of `_wonder_cand` that names no city.
        Cached under the write counters of the planes it reads."""
        planes = (self.wok, self._fire_feat, self.feat_id, self.feat_stripped)
        ent = self._wsite_cache
        if ent is None or not simbase.stamp_holds(ent[0], planes):
            ent = self._wsite_cache = (simbase.plane_stamp(planes), {})
        out = ent[1].get(wi)
        if out is None:
            out = ent[1][wi] = ((self.wok >> wi) & 1).bool() & ~self._fire_plots()
        return out

    def _wonder_cand(self, row: int, j: int, wi: int, base_ok: torch.Tensor) -> torch.Tensor:
        """`canPlaceWonder`'s live half. The terrain half rides the static
        `wok` bitmask the exporter baked out of `wonderTerrainOk`, so nothing
        here re-derives ground."""
        wrow = self._wond_rows[wi]
        # ...and `canPlaceWonder` refuses a fire's plot (`fireFeature`)
        cand_w = base_ok & self._wonder_site_plane(wi)
        adjD = int(wrow["adjD"])
        adjDB = int(wrow["adjDB"])
        if adjD == -2:
            cand_w = cand_w & self._wadj_plane(("ctr",), lambda: self._adj_center_count() > 0)
        elif adjD >= 0:
            near = (self._wadj_plane(("dw", adjD, adjDB), lambda: self._adj_district_with(adjD, adjDB))
                    if adjDB >= 0
                    else self._wadj_plane(("dt", adjD), lambda: self._adj_dtype_complete(adjD)))
            cand_w = cand_w & near
        if int(wrow["adjR"]) >= 0:
            ri = int(wrow["adjR"])
            cand_w = cand_w & self._wadj_plane(("res", ri), lambda: self._adj_res_live(ri))
        if int(wrow["adjI"]) >= 0:
            ii = int(wrow["adjI"])
            cand_w = cand_w & self._wadj_plane(("imp", ii), lambda: self._adj_improvement(ii))
        if int(wrow["adjCap"]):
            cand_w = cand_w & self._wadj_plane(("cap", row), lambda: self._adj_capital(row))
        if int(wrow["needRel"]):
            cand_w = cand_w & self.civ_religion_done[:, row].unsqueeze(1)
        if self._wond_coastland[wi]:
            # CIV6 `Coast` (Kilwa Kisiwani): land beside the sea, live
            cand_w = cand_w & self.coastal_land
        if wrow["onFeat"]:
            # the plot still carries one of the wonder's features
            live = ~self.feat_stripped
            on = torch.zeros_like(cand_w)
            for f in wrow["onFeat"]:
                on = on | (live & (self.feat_id == int(f)))
            cand_w = cand_w & on
        return cand_w

    def _adj_district_with(self, di: int, bi: int) -> torch.Tensor:
        """[B, T] — a completed district of type `di` next door whose CITY
        holds building `bi` (the Great Library's Library, Big Ben's Bank).
        `cityAtTile`'s twin: the building lives on the city, not the tile,
        and the city may be any major's or a Free City's."""
        nb = self.neigh
        nbc = nb.clamp(min=0)
        hit = ((self.district[:, nbc] == di) & self.district_complete[:, nbc]
               & (nb >= 0).unsqueeze(0))
        if not bool(hit.count_nonzero()):
            return torch.zeros(self.B, self.T, dtype=torch.bool, device=self.device)
        has = torch.zeros(self.B, self.T, dtype=torch.bool, device=self.device)
        for r in [*range(self.n_majors), self.FREE_ROW]:
            sl = self.city_slot_at(r)  # [B, T] owning city SLOT, -1 = not this row's
            bl = self.city_bldg[:, r, :, bi]
            has |= (sl >= 0) & bl.gather(1, sl.clamp(min=0))
        return (hit & has[:, nbc]).any(dim=2)

    def _adj_improvement(self, ii: int) -> torch.Tensor:
        """[B, T] — a neighbour carries improvement `ii` (Temple of Artemis'
        Camp)."""
        nb = self.neigh
        nbc = nb.clamp(min=0)
        return ((self.improvement[:, nbc] == ii) & (nb >= 0).unsqueeze(0)).any(dim=2)

    def _adj_capital(self, row: int) -> torch.Tensor:
        """[B, T] — a neighbour IS this row's capital centre (the Apadana's
        "adjacent to a civilization's Capital")."""
        nb = self.neigh
        nbc = nb.clamp(min=0)
        cap = torch.zeros(self.B, self.T, dtype=torch.bool, device=self.device)
        ctr = self.city_center[:, row]                    # [B, RC]
        live = self.city_alive[:, row] & self.city_is_cap[:, row] & (ctr >= 0)
        for c in range(self.RC):
            k = live[:, c]
            if bool(k.count_nonzero()):
                cap[k, ctr[k, c]] = True
        return (cap[:, nbc] & (nb >= 0).unsqueeze(0)).any(dim=2)

    def _queue_wonder_at(self, row: int, j: int, wi: int, has_w: torch.Tensor, cand_w: torch.Tensor) -> None:
        wrow = self._wond_rows[wi]
        keyw = torch.where(cand_w, self._arangeT_f, self._inf_f)
        bw = keyw.argmin(dim=1)
        rows_w = has_w.nonzero(as_tuple=True)[0]
        bwt = bw[rows_w]
        self.built_wonder[rows_w, bwt] = wi
        self.built_wonder_complete[rows_w, bwt] = False
        self._pave_plot(rows_w, bwt, tuple(int(f) for f in wrow["onFeat"] if int(f) >= 0))
        self.city_wonder[rows_w, row, j, wi] = bwt
        code_w = self.WONDER_BASE + wi
        # the wonder's PLOT lives in the `city_wonder` registry, which is keyed
        # by wonder rather than by queue slot, so the entry carries no qtile.
        _b1 = torch.ones(self.B, dtype=torch.long, device=self.device)
        self._q_push(row, j, has_w, _b1 * code_w,
                     _b1.to(self.city_cost.dtype) * float(wrow["cost"]))
        self._eff_version += 1

    # -- THE CITIZEN MANAGER (`citizens.ts`) for the city-states ------------

    def _city_plot_yields(self, row: int, col: torch.Tensor) -> torch.Tensor:
        """[B, T, 6] f64 — each plot's yields as the city in column `col` ([B])
        of seat row `row` works it: the city walk's tile planes (`tileYields`)
        and the city's plot bonuses (`cityPlotBonus`: its completed wonders'
        tile rows and the seat's empire-wide ones, the Great Bath's Faith per
        flood, the Water Mill's Farm resources, the lit buildings' Coast rows,
        the coastal resources', the feature rows and a unique building's, the
        governor's Gold on an unimproved feature), none under an impassable
        feature"""
        bidx = self._bidx
        g = self._rcy_globals()
        y = g["ty_oth"].double().clone()
        y[:, :, 0] = self._rcy_food_plane(row, g).double()
        y[:, :, 1] = g["p_plane"].double()
        y = y + self._seat_tile_add(row).double()
        hid = self._res_hidden_yields(row)
        if hid is not None:
            y = y - hid.double()
        rd = self.rules_dev
        lit = self.city_bldg[bidx, row, col] & ~self._bldg_dark(self.city_dist_tile[bidx, row, col],
                                                                 self.city_bldg_pillaged[bidx, row, col])
        bon = torch.zeros_like(y)
        fl = torch.where(self.feat_stripped, torch.full_like(self.feat_id, -1), self.feat_id)
        compw = self._completed_wonders(row)
        if compw is not None and self._wond_tiley and bool(compw.count_nonzero()):
            alive = self.city_alive[:, row, : compw.shape[1]]
            mine_w = compw[bidx, col]  # [B, nW]
            any_w = (compw & alive.unsqueeze(2)).any(dim=1)
            undist = self.district < 0
            for _wi, _tid, _fid, _xfid, _emp, _y in self._wond_tiley:
                has = any_w[:, _wi] if _emp else mine_w[:, _wi]
                if not bool(has.count_nonzero()):
                    continue
                q = undist & has.unsqueeze(1)
                if _tid >= 0:
                    q = q & (self.terrain == _tid)
                if _fid >= 0:
                    q = q & (fl == _fid)
                if _xfid >= 0:
                    q = q & (fl != _xfid)
                bon = bon + q.double().unsqueeze(2) * torch.as_tensor(_y, dtype=torch.float64, device=self.device).view(1, 1, 6)
        if compw is not None and bool(self._wond_faithflood.count_nonzero()):
            ffw = compw[bidx, col].double() @ self._wond_faithflood  # [B]
            if bool(ffw.count_nonzero()):
                ffp = (fl >= 0) & self._fp_feat[fl.clamp(min=0)]
                ffc = torch.where(ffp, self.tile_flood_ct, torch.zeros_like(self.tile_flood_ct)).double()
                bon[:, :, 5] = bon[:, :, 5] + ffw.unsqueeze(1) * ffc
        wm = lit[:, rd.b_farmbonus]
        if wm.numel() and bool(wm.count_nonzero()):
            wq = self._res_live() & (self.res_cat == 1) & (self.res_imp == self.FARM)
            bon[:, :, 0] = bon[:, :, 0] + (wq & wm.any(dim=1, keepdim=True)).double()
        if self._coast_plot_terr:
            wet = torch.zeros_like(self.terrain, dtype=torch.bool)
            for t in self._coast_plot_terr:
                wet = wet | (self.terrain == t)
            wet = wet & ~self.tile_submerged
            for bi, y6, un in self._b_coast_plot:
                has = lit[:, bi]
                if not bool(has.count_nonzero()):
                    continue
                q = wet & has.unsqueeze(1)
                if un:
                    q = q & (self.improvement < 0)
                bon = bon + q.double().unsqueeze(2) * y6.double().view(1, 1, 6)
        for bi, civ, y6 in self._b_coast:
            sv = lit[:, bi]
            if civ is not None:
                sv = sv & self._row_plays_idx(row, civ).reshape(-1)
            if not bool(sv.count_nonzero()):
                continue
            rl = self._res_live() & ~self._res_hidden(row)
            q = (self.terrain == self._coast_terr) & rl & sv.unsqueeze(1)
            bon = bon + q.double().unsqueeze(2) * y6.double().view(1, 1, 6)
        for bi, fid, y6, vcs in self._b_feat_plot:
            sv = lit[:, bi]
            for vc in vcs:
                sv = sv & ~self._row_plays_idx(row, vc).reshape(-1)
            if not bool(sv.count_nonzero()):
                continue
            q = (self.feat_id == fid) & ~self.feat_stripped & sv.unsqueeze(1)
            bon = bon + q.double().unsqueeze(2) * y6.double().view(1, 1, 6)
        for (mbi, mciv), my6 in self._bvar_feature_y.items():
            msv = lit[:, mbi] & self._row_plays_idx(row, mciv).reshape(-1)
            if not bool(msv.count_nonzero()):
                continue
            q = (fl >= 0) & msv.unsqueeze(1)
            bon = bon + q.double().unsqueeze(2) * my6.double().view(1, 1, 6)
        if self.n_governors and row < self.n_majors:
            fg = self._governor_sum(row, "goldPerFeature")[bidx, col]
            if bool(fg.count_nonzero()):
                bon[:, :, 2] = bon[:, :, 2] + fg.unsqueeze(1) * self._unimproved_feature().double()
        live = fl >= 0
        bar = live & ~self._feat_passable[fl.clamp(min=0)]
        return y + torch.where(bar.unsqueeze(2), torch.zeros_like(bon), bon)

    def _minor_place_citizens(self, s: int, mask: torch.Tensor, n: torch.Tensor, full: bool = False) -> None:
        """`minorPlaceCitizens` (with `full`, `minorReplaceCitizens`) for minor
        `s` where `mask`: `_place_citizens` on its city, Food favored by its
        city AI (`citystate_fav_food`)"""
        self._place_citizens(self._CITY_MINOR0 + s, torch.zeros(self.B, dtype=torch.long, device=self.device),
                             mask & self.citystate_alive[:, s], n, full, self.citystate_fav_food[:, s])

    def _place_citizens(self, row: int, col: torch.Tensor, mask: torch.Tensor, n: torch.Tensor | None,
                        full: bool = False, fav_food: torch.Tensor | None = None) -> None:
        """`placeCitizens` (with `full`, `replaceAllCitizens`) for the city in
        column `col` ([B]) of seat row `row` where `mask`: the Food need with
        the assigned citizens alone working, the entries of the DLL's hexspace
        (a free plot once, a district's free specialist slots each), the table
        over entries x count (an earlier entry keeps a tie), the plots of the
        count's cell locked and its slots pinned, the rest idle; `fav_food`
        [B] the city's Food favored, none favored where None"""
        bidx = self._bidx
        mask = mask & self.city_alive[bidx, row, col]
        if not bool(mask.count_nonzero()):
            return
        B, dev = self.B, self.device
        seat = int(self._ROW_SEAT[row])
        cid = self.city_id[bidx, row, col]
        ctr = self.city_center[bidx, row, col].clamp(min=0)
        mine = (self.tile_seat == seat) & (self.tile_city == cid.unsqueeze(1))
        nD = self.city_spec_pin.shape[3]
        if full:
            self.tile_locked[mask.unsqueeze(1) & mine] = False
            self.city_spec_pin[bidx, row, col] = torch.where(mask.unsqueeze(1), 0, self.city_spec_pin[bidx, row, col])
            n = self.city_pop[bidx, row, col]
        n = torch.where(mask, n, torch.zeros_like(n)).clamp(min=0)
        self.city_spec_pin[bidx, row, col] = torch.where(mask.unsqueeze(1), self.city_spec_pin[bidx, row, col].clamp(min=0),
                                                         self.city_spec_pin[bidx, row, col])
        self.city_idle[bidx, row, col] = torch.where(mask, n, self.city_idle[bidx, row, col])
        total = self._seat_city_stats(row, record=False)[0]
        surplus = total[bidx, col, 0] - self.city_pop[bidx, row, col].double() * self.rules.food_per_citizen
        need = (-torch.floor(surplus)).clamp(min=0)
        y = self._city_plot_yields(row, col)
        win = tiles_from_offsets(ctr, self._hex37_off, self.W, self.H, self.wrap_x)  # [B, 37]
        P = win.shape[1]
        wc = win.clamp(min=0)

        def at(plane):
            return plane.gather(1, wc)

        tile_ok = ((win >= 0) & (win != ctr.unsqueeze(1)) & at(mine) & (at(self.district) < 0)
                   & (at(self.built_wonder) < 0) & ~at(self.tile_locked))
        yt = torch.trunc(y.gather(1, wc.unsqueeze(2).expand(-1, -1, 6)))  # [B, P, 6]
        tile_ok = tile_ok & (y.gather(1, wc.unsqueeze(2).expand(-1, -1, 6)) > 0).any(dim=2)
        # a district of the city at a plot: its specialists' yields and free slots
        dreg = self.city_dist_tile[bidx, row, col]  # [B, nD]
        slots = self._city_spec_slots(row)[bidx, col]  # [B, nD]
        free = (slots - self.city_spec_pin[bidx, row, col].clamp(min=0)).clamp(min=0)
        bldg = self.city_bldg[bidx, row, col]
        spec_y = torch.zeros(B, nD, 6, dtype=torch.float64, device=dev)
        for di in range(min(nD, len(self.districts_cat))):
            if not bool(self._spec_any[di]):
                continue
            has_t = torch.zeros(B, dtype=torch.bool, device=dev)
            for t_b in self._spec_tb[di]:
                if t_b == -2:
                    has_t = has_t | (bldg & self._b_worship.reshape(1, -1)).any(dim=1)
                elif t_b >= 0:
                    has_t = has_t | bldg[:, t_b]
            spec_y[:, di] = self._spec_y[di].reshape(1, 6) + has_t.double().unsqueeze(1) * self._spec_ta[di].reshape(1, 6)
        spec_on = self._spec_any[:nD].reshape(1, nD) & (dreg >= 0)
        K = max(int(free.max()) if free.numel() else 0, 1)
        # the entries in hexspace order: per plot its tile entry, or the
        # free slots of the district standing on it
        fav_k = torch.zeros(B, 6, dtype=torch.bool, device=dev)
        if fav_food is not None:
            fav_k[:, 0] = fav_food
        wts = torch.tensor([2.0, 2.0, 1.0, 2.0, 2.0, 2.0], dtype=torch.float64, device=dev)

        def score(y6):  # [B, ..., 6] -> food, favored, other
            v = y6 * wts
            f6 = fav_k.reshape(B, *([1] * (y6.dim() - 2)), 6)
            return y6[..., 0], (v * f6).sum(-1), (v * ~f6).sum(-1)

        e_food, e_fav, e_oth, e_ok, e_plot, e_dist = [], [], [], [], [], []
        tf, tv, to = score(yt)
        for p in range(P):
            on_p = (dreg == win[:, p].unsqueeze(1)) & (win[:, p] >= 0).unsqueeze(1) & spec_on & at(mine)[:, p].unsqueeze(1)
            di = torch.where(on_p.any(dim=1), on_p.long().argmax(dim=1), torch.full_like(win[:, p], -1))
            has_d = di >= 0
            dsy = torch.trunc(spec_y.gather(1, di.clamp(min=0).view(B, 1, 1).expand(-1, 1, 6)).squeeze(1))
            df, dv, do = score(dsy)
            dfree = free.gather(1, di.clamp(min=0).unsqueeze(1)).squeeze(1)
            for k in range(K):
                d_ok = has_d & (dfree > k)
                if k == 0:
                    ok = torch.where(has_d, d_ok, tile_ok[:, p])
                    e_food.append(torch.where(has_d, df, tf[:, p]))
                    e_fav.append(torch.where(has_d, dv, tv[:, p]))
                    e_oth.append(torch.where(has_d, do, to[:, p]))
                    e_plot.append(torch.where(has_d, torch.full_like(win[:, p], -1), win[:, p]))
                else:
                    ok = d_ok
                    e_food.append(df)
                    e_fav.append(dv)
                    e_oth.append(do)
                    e_plot.append(torch.full_like(win[:, p], -1))
                e_ok.append(ok)
                e_dist.append(torch.where(has_d, di, torch.full_like(di, -1)))
        E = len(e_ok)
        nmax = int(n.max())
        if nmax <= 0:
            self.city_idle[bidx, row, col] = torch.where(mask, torch.zeros_like(n), self.city_idle[bidx, row, col])
            return
        cf = torch.zeros(B, nmax + 1, dtype=torch.float64, device=dev)
        cv = torch.zeros_like(cf)
        co = torch.zeros_like(cf)
        picks = torch.zeros(B, nmax + 1, E, dtype=torch.bool, device=dev)
        need2 = need.unsqueeze(1)
        for e in range(E):
            ok = e_ok[e].unsqueeze(1)
            pf, pv, po, pp = cf[:, :-1], cv[:, :-1], co[:, :-1], picks[:, :-1]
            nf = pf + e_food[e].unsqueeze(1)
            nv = pv + e_fav[e].unsqueeze(1)
            no = po + e_oth[e].unsqueeze(1)
            of, ov, oo = cf[:, 1:], cv[:, 1:], co[:, 1:]
            better = ((of < need2) & (nf >= need2)) | ((nv != ov) & (nv > ov)) | ((nv == ov) & (no > oo))
            take = ok & better
            cf = torch.cat([cf[:, :1], torch.where(take, nf, of)], dim=1)
            cv = torch.cat([cv[:, :1], torch.where(take, nv, ov)], dim=1)
            co = torch.cat([co[:, :1], torch.where(take, no, oo)], dim=1)
            np_ = pp.clone()
            np_[:, :, e] = True
            picks = torch.cat([picks[:, :1], torch.where(take.unsqueeze(2), np_, picks[:, 1:])], dim=1)
        chosen = picks.gather(1, n.view(B, 1, 1).expand(-1, 1, E)).squeeze(1) & mask.unsqueeze(1)  # [B, E]
        plot_e = torch.stack(e_plot, dim=1)
        dist_e = torch.stack(e_dist, dim=1)
        lay = chosen & (plot_e >= 0)
        if bool(lay.count_nonzero()):
            r, e = lay.nonzero(as_tuple=True)
            self.tile_locked[r, plot_e[r, e]] = True
        pin = chosen & (plot_e < 0) & (dist_e >= 0)
        if bool(pin.count_nonzero()):
            add = torch.zeros(B, nD, dtype=torch.long, device=dev)
            add.scatter_add_(1, dist_e.clamp(min=0), pin.long())
            self.city_spec_pin[bidx, row, col] = self.city_spec_pin[bidx, row, col] + add
        placed = chosen.sum(dim=1)
        self.city_idle[bidx, row, col] = torch.where(mask, (n - placed).clamp(min=0), self.city_idle[bidx, row, col])
        self._eff_version += 1

    def _minor_replace_citizens(self, s: int, mask: torch.Tensor) -> None:
        """`minorReplaceCitizens`: every citizen of minor `s`'s city re-placed
        where `mask` (0x196320)"""
        self._minor_place_citizens(s, mask, self.city_pop[:, self._CITY_MINOR0 + s, 0], full=True)

    def _minor_food_focus(self, s: int, mask: torch.Tensor) -> None:
        """`minorFoodFocus` where `mask`: Food favored below a surplus of 1.0
        with Housing above the population, cleared otherwise, each change a
        full re-place (0x5cdae0)"""
        row = self._CITY_MINOR0 + s
        total = self._seat_city_stats(row, record=False)[0]
        pop = self.city_pop[:, row, 0]
        surplus = total[:, 0, 0] - pop.double() * self.rules.food_per_citizen
        housing = self._seat_housing(row)[1][:, 0]
        want = (surplus < 1) & (housing > pop.double())
        change = mask & (want != self.citystate_fav_food[:, s])
        if not bool(change.count_nonzero()):
            return
        self.citystate_fav_food[:, s] = torch.where(change, want, self.citystate_fav_food[:, s])
        self._minor_replace_citizens(s, change)
