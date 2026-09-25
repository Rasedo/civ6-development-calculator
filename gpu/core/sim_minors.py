from __future__ import annotations

from .simbase import *  # noqa: F401,F403 — torch, constants, helpers: the shared floor


class SimMinors:
    def _city_state_phase(self) -> None:
        if self.S == 0:
            return
        citystate_max = int(self.rules.citystate.get("maxHp", 150))
        self.citystate_hp.copy_(torch.where(self.citystate_alive & (self.citystate_hp < citystate_max), (self.citystate_hp + 10).clamp(max=citystate_max), self.citystate_hp))
        # each minor in turn — the `minorPhase` order, one minor at a time
        # because a district one minor lands may lend a neighbour's district
        # adjacency across the border: its levied army home when due, the loss
        # its army shows, its grid, its city's yields and its units' upkeep,
        # the research they buy, the episode's draws, the upgrades a
        # completion triggers, its purchases, its Builders' work, its trade
        # routes, the item the Production goes to, its city's ranged strikes
        # (the majors' own body, `cityStrikes`), its army's walk, and the army
        # it ends the turn with
        col0 = torch.zeros(self.B, dtype=torch.long, device=self.device)
        for s in range(self.S):
            alive = self.citystate_alive[:, s]
            if not bool(alive.any()):
                continue
            self._minor_levy_return(s)
            n_mil = self._minor_military_count(s)
            seen = self.citystate_army_seen[:, s]
            lost = alive & (seen >= 0) & (n_mil < seen)
            self.citystate_loss_turn[:, s] = torch.where(
                lost, torch.full_like(seen, int(self.turn)), self.citystate_loss_turn[:, s])
            self._minor_power(s)
            prod = self._minor_accrue(s)
            gained = self._minor_research(s)
            self._minor_plan(s)
            self._minor_upgrades(s, gained)
            self._minor_purchases(s)
            self._minor_builders(s)
            self._minor_trade(s)
            self._minor_build(s, prod)
            self._city_strikes(self._CITY_MINOR0 + s, col0, alive)
            self._minor_walk(s)
            self.citystate_army_seen[:, s] = torch.where(alive, self._minor_military_count(s), seen)

    def _minor_levy_return(self, s: int) -> None:
        """`minorLevyReturn` — CIV6 (LOC_CITY_STATES_LEVY_MILITARY_DETAILS):
        the levied army "will return to the city-state after {2_TurnLimit}
        Turns, or if the Suzerain changes". Every unit still standing that the
        levy took from minor `s` (`unit_levy_src`) is the minor's again where
        it stands, its mark cleared."""
        alive = self.citystate_alive[:, s]
        ls = self.citystate_levy_seat[:, s]
        back = alive & (ls >= 0) & ((int(self.turn) >= self.citystate_levy_ends[:, s])
                                    | (self.citystate_suzerain[:, s] != ls))
        if not bool(back.any()):
            return
        m = self.major_unit_alive & (self.major_unit_levy_src == 100 + s) & back.unsqueeze(1)
        if bool(m.any()):
            self.major_unit_seat[m] = 100 + s
            self.major_unit_levied[m] = False
            self.major_unit_levy_src[m] = -1
            self._gen_ver += 1
        self.citystate_levy_seat[:, s] = torch.where(back, torch.full_like(ls, -1), ls)
        self.citystate_levy_ends[:, s] = torch.where(back, torch.full_like(ls, -1), self.citystate_levy_ends[:, s])

    def _minor_power(self, s: int) -> None:
        """`minorPower` — CIV6 (Power): the minor city's load is met all at
        once or not at all. A city-state holds no stockpile, so no plant runs
        for it: its renewables — a Dam's supply, the generators on its own
        plots — carry the whole load (`cityPower`'s fuel-free half, the
        governor, wonder and suzerain terms a city-state never holds aside)."""
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
        if bool((demand > 0).any()):
            if bool((self._b_power_supply > 0).any()):
                supply = supply + stand.double() @ self._b_power_supply
            if self._imp_power_any:
                live = ((self.improvement >= 0) & ~self.pillaged & (self.tile_seat == 100 + s)
                        & (self.tile_city == -1))
                supply = supply + (self._imp_power[self.improvement.clamp(min=0)] * live.double()).sum(dim=1)
        self.city_powered[:, row, 0] = (demand > 0) & (supply >= demand)

    def _minor_traders(self, s: int) -> torch.Tensor:
        """[B] long — minor `s`'s Traders out on a route or standing
        (`minorTraders`)."""
        row = self._CITY_MINOR0 + s
        out = (self.seat_routes[:, row, :, 0] >= 0).sum(dim=1)
        if self._trader_idx >= 0:
            out = out + (self.major_unit_alive & (self.major_unit_seat == 100 + s)
                         & (self.major_unit_type == self._trader_idx)).sum(dim=1)
        return out

    def _minor_route_candidate(self, s: int):
        """`minorRouteCandidate` — where minor `s`'s free Trader goes: the new
        in-range destination whose route pays the most, its six yields summed
        (`_minor_route_yield6`), strictly-greater beats in the scan order —
        the other city-states by index, then every major's cities in row and
        slot order — so ties keep the first. The gates: one leg of range, the
        route not already running, no war with the destination's holder,
        Trade Policy's ban. Returns ([B] found, [B] dest code (-(2+cs) or -1),
        [B] dest seat row, [B] dest city id, [B] dest centre)."""
        B, S, dev = self.B, self.S, self.device
        row = self._CITY_MINOR0 + s
        rr = self.seat_routes[:, row]
        act = rr[:, :, 0] >= 0
        reach = self._route_reach_from(row)[:, 0]  # [B, T]
        best = torch.full((B,), -1.0, dtype=torch.float64, device=dev)
        found = torch.zeros(B, dtype=torch.bool, device=dev)
        code = torch.full((B,), -1, dtype=torch.long, device=dev)
        dseat = torch.full((B,), -1, dtype=torch.long, device=dev)
        dcity = torch.full((B,), -1, dtype=torch.long, device=dev)
        dct = torch.full((B,), -1, dtype=torch.long, device=dev)
        mult = self._congress_cs_route_mult()  # [B, S]
        per_cs = self._minor_cs_route_gold + self._minor_cs_route_spec
        for s2 in range(S):
            if s2 == s:
                continue
            ctr = self.citystate_center[:, s2].clamp(min=0)
            has = (act & (rr[:, :, 1] == -(2 + s2))).any(dim=1)
            ok = (self.citystate_alive[:, s2] & ~has & reach.gather(1, ctr.unsqueeze(1)).squeeze(1))
            key = per_cs * mult[:, s2].double()
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
                if not bool(live.any()):
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

    def _minor_trade(self, s: int) -> None:
        """`minorTrade` — minor `s`'s routes walk and meet their raiders
        (`_trade_walk_tick`); a free Trader under its capacity takes the
        scorer's destination (`_minor_route_candidate`) and is spent on it —
        the commit `commitRoute` makes: the term, the walker at the centre, no
        chain (a city-state holds no Trading Post), leg 0 on a land descent and
        road on the centre, -1 parked where none reaches; then the round trips
        that are done end (`_expire_seat_routes`)."""
        B, dev = self.B, self.device
        row = self._CITY_MINOR0 + s
        alive = self.citystate_alive[:, s]
        self._trade_walk_tick(row, alive)
        if self._trader_idx >= 0:
            used = (self.seat_routes[:, row, :, 0] >= 0).sum(dim=1)
            t_has, t_slot, t_tile = self._free_trader(row)
            want = alive & (used < self._trade_capacity(row)) & t_has
            if bool(want.any()):
                found, code, dseat, dcity, dct = self._minor_route_candidate(s)
                go = want & found
                if bool(go.any()):
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
                    self.seat_route_chain[rows, row, slot] = -1
                    wl = self._trade_water_level(row)[rows]
                    walks = self._trade_walk_ok(rows, o_ct[rows], dct[rows], wl)
                    self.seat_route_leg[rows, row, slot] = torch.where(
                        walks, torch.zeros_like(slot), torch.full_like(slot, -1))
                    lr = rows[walks & self.passable[rows, o_ct[rows]]]
                    if len(lr) > 0:
                        self.road[lr, o_ct[lr]] = True
                    self.major_unit_alive[rows, t_slot[rows]] = False
                    self._occ_clear(rows, t_tile[rows], t_slot[rows] + self.POOL_LO["major"])
        self._expire_seat_routes(row)

    def _minor_route_income(self, s: int) -> torch.Tensor | None:
        """[B, RC, 6] f64 — `minorRouteYields` over minor `s`'s routes, on its
        one city's column: a city-state destination's flat Gold and specialty
        under Sovereignty's multiplier, a major city the international column
        of `District_TradeRouteYields` over its completed districts plus the
        centre row. A destination gone pays nothing. None with no route."""
        row = self._CITY_MINOR0 + s
        rr = self.seat_routes[:, row]
        act = rr[:, :, 0] >= 0
        if not bool(act.any()):
            return None
        B, S, dev = self.B, self.S, self.device
        inc = torch.zeros(B, 6, dtype=torch.float64, device=dev)
        if S > 0:
            raw = -rr[:, :, 1] - 2
            css = raw.clamp(min=0, max=S - 1)
            ok_c = act & (rr[:, :, 1] <= -2) & (raw < S) & self.citystate_alive[:, :S].gather(1, css)
            m = self._congress_cs_route_mult().gather(1, css).double() * ok_c.double()  # [B, K]
            inc[:, 2] = inc[:, 2] + (self._minor_cs_route_gold * m).sum(dim=1)
            ycol = self._citystate_yidx[:, :S].gather(1, css)
            inc.scatter_add_(1, ycol, self._minor_cs_route_spec * m)
        rd_c = self.seat_route_dcity[:, row]
        intl = act & (rd_c >= 0)
        if bool(intl.any()):
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
            inc = inc + (intl6 * valid.double().unsqueeze(2)).sum(dim=1)
        out = torch.zeros(B, self.RC, 6, dtype=torch.float64, device=dev)
        out[:, 0] = inc * self.city_alive[:, row, 0].double().unsqueeze(1)
        return out

    def _minor_repair(self, s: int) -> tuple[torch.Tensor, torch.Tensor]:
        """([B] bool, [B] f64) — `repairAvailable` and `projectCost` for minor
        `s`'s city: walls standing and breached (the centre's pool or its
        Encampment's), the centre clean, three quiet turns since its last hit;
        the price the HP it puts back, at least 1."""
        row = self._CITY_MINOR0 + s
        mx = self._walls_tier_hp[self._minor_walls_tier(s)].long()
        outer = torch.minimum(self.city_outer_hp[:, row, 0], mx)
        enc_missing = torch.zeros_like(mx)
        if self._encamp_didx >= 0 and self.districts_on:
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
        religion's Worship belief names, -1 where none."""
        fol = self._minor_followed()[:, s]
        n = self.civ_worship.shape[1]
        wi = torch.where((fol >= 0) & (fol < n),
                         self.civ_worship.gather(1, fol.clamp(min=0, max=n - 1).unsqueeze(1)).squeeze(1),
                         torch.full_like(fol, -1))
        if self._worship_bidx.numel() == 0:
            return torch.full_like(wi, -1)
        wb = self._worship_bidx[wi.clamp(min=0, max=self._worship_bidx.numel() - 1)]
        return torch.where(wi >= 0, wb, torch.full_like(wi, -1))

    def _pave_plot(self, rows: torch.Tensor, tiles: torch.Tensor) -> None:
        """`paveGround` — the ground a district or a wonder takes, for every
        seat: the improvement goes, every feature but floodplains goes, a bonus
        resource goes."""
        self.improvement[rows, tiles] = -1
        nofp = self.feat_id[rows, tiles] != self._fp_fid
        if bool(nofp.any()):
            self._strip_feature_at(rows[nofp], tiles[nofp])
        fresh_rs = (self.res_priority[rows, tiles] == 1) & ~self.res_stripped[rows, tiles]
        self.res_stripped[rows, tiles] = self.res_stripped[rows, tiles] | (self.res_priority[rows, tiles] == 1)
        self._withdraw_sea_adj(rows[fresh_rs], tiles[fresh_rs])

    def _minor_military_count(self, s: int) -> torch.Tensor:
        """[B] long — minor `s`'s military units (`minorMilitary`)."""
        mine = self.major_unit_alive & (self.major_unit_seat == 100 + s)
        mt = self.major_unit_type.clamp(min=0, max=self.NU - 1)
        return (mine & self._type_military[mt]).sum(dim=1)

    def _minor_accrue(self, s: int) -> torch.Tensor:
        """THE MINOR'S CITY PAYS ITS YIELDS, AND THEN GROWS AND CLAIMS ON THEM.

        CIV6 (City-state): a city-state's city is an ordinary city — its Campus
        yields Science, its Commercial Hub Gold — and the install has ONE city
        rule, so it grows on its FOOD BOX and takes ground on its CULTURE BOX
        exactly as a major's does. Its row is a row of the CITY BLOCK,
        so `_seat_city_growth` and `_seat_border_growth` are the majors' own
        bodies called on it, and `citystate_pop` is a VIEW of `city_pop` — the
        growth write moves it with no mirror of its own.

        Science and Culture also feed the two research pots; Gold banks into
        `citystate_treasury` and pays the minor's units' upkeep — each unit's
        own Maintenance, a minor carrying no card that cuts it — the balance
        stopping at 0 (the census never read a minor below 0); Faith banks into
        `citystate_faith`. The [B] Production is returned for `_minor_build`,
        which pays it into the pot under the rows of the item it goes toward."""
        row = self._CITY_MINOR0 + s
        alive = self.citystate_alive[:, s]
        keep = alive.double()
        total, eff, need, _tier = self._seat_city_stats(row)
        tot = total[:, 0]  # [B, 6], zero where the city is dead
        mine = self.major_unit_alive & (self.major_unit_seat == 100 + s)
        upkeep = (self._type_maintenance[self.major_unit_type.clamp(min=0, max=self.NU - 1)].double()
                  * mine.double()).sum(dim=1)
        tre = self.citystate_treasury[:, s] + tot[:, 2] * keep
        self.citystate_treasury[:, s] = torch.where(alive, (tre - upkeep).clamp(min=0), tre)
        self.citystate_tech_prog[:, s] += tot[:, 3] * keep
        self.citystate_civic_prog[:, s] += tot[:, 4] * keep
        self.citystate_faith[:, s] += tot[:, 5] * keep
        col = torch.zeros(self.B, dtype=torch.long, device=self.device)
        act = self.citystate_alive[:, s]
        self._seat_city_growth(row, col, act, eff[:, 0], need[:, 0])
        self._seat_border_growth(row, col, act, tot[:, 4] * keep)
        return tot[:, 1] * keep

    def _minor_envoy_tiles(self) -> None:
        """A MINOR TAKES GROUND FROM THE INFLUENCE SPENT ON IT — `envoyTiles`.

        CIV6 (`CivilizationLevels.CanAnnexTilesWithReceivedInfluence`): TRUE
        for CITY_STATE and FALSE for a full civ, the Free Cities player and a
        tribe — the one column of that table only a minor owns, and the reason
        its culture box banks and claims nothing. Measured on one minor over
        fifteen readings on a SINGLE turn, so nothing but the envoys moved:
        exactly +1 owned plot per envoy received, `plots = envoys + 6` (the six
        the minor is seated with), no cap through sixteen, and the suzerain
        contest does not change the slope.

        The LEDGER is `city_acquired` itself — the `tilesAcquired` twin — so
        the rule needs no counter of its own: a minor's box buys nothing, so
        every tile that counter holds was bought by an envoy. The count it
        claims up to is the RAW store, `seat_citystate_envoys` and never
        `_envoys_here`, because a governor POSTING is not an envoy RECEIVED.
        Claiming up to the count rather than on each delta is what makes the
        measured equation an invariant, and it settles the one case the lab
        did not reach: an envoy REMOVED (a spy's Fabricate Scandal) takes no
        ground back and buys nothing new until the count passes its own mark.

        WHICH plot is `_seat_border_key`, the culture claim's own pick and its
        own refusals, clause for clause with `pickBorderTile` — nearest first,
        then resource priority, then yield sum, then tile index; a plot
        another player holds is not taken and a plot with no owned neighbour
        is out of reach. The GAME's choice rule is unmeasured.
        """
        if self.S == 0:
            return
        bidx = self._bidx
        col = torch.zeros(self.B, dtype=torch.long, device=self.device)
        env = self.seat_citystate_envoys[:, : self.n_majors, : self.S].sum(dim=1).long()
        for s in range(self.S):
            row = self._CITY_MINOR0 + s
            if not bool(self._row_annex_influence[row]):
                continue
            # a dead minor receives nothing; a negative difference (a removal)
            # claims nothing and gives nothing back
            want = (env[:, s] - self.city_acquired[bidx, row, col]) * self.citystate_alive[:, s].long()
            if not bool((want > 0).any()):
                continue
            center = self.city_center[bidx, row, col]
            cid = self.city_id[bidx, row, col]
            tiles, tc, nbs, key0 = self._seat_border_key(row, center)
            unowned = self._seat_tile_unclaimed(tc)
            adj_own = self._seat_tile_adj_city(row, cid, tc, nbs)
            for _ in range(int(want.max())):  # the TS while-loop, one plot at a time
                ready = want > 0
                ok = (tiles >= 0) & unowned & adj_own & ready.unsqueeze(1)
                claim = ready & ok.any(dim=1)
                if not bool(claim.any()):
                    break
                key = torch.where(ok, key0, self._inf_f)
                best = key.argmin(dim=1)
                rows = claim.nonzero(as_tuple=True)[0]
                spot = tiles[rows, best[rows]]
                self.tile_seat[rows, spot] = int(self._ROW_SEAT[row])  # setTileOwner's two halves:
                self.tile_city[rows, spot] = cid[rows]  # the seat and the city id
                self._tile_owner_ver += 1
                # acquireTile's revealAround is a MAJOR's alone ("nothing reads
                # a city-state's fog"), so this row reveals nothing.
                # A claim widens a LATER city's workable candidates.
                self._claim_version += 1
                self.city_acquired[rows, row, col[rows]] += 1
                want = want - claim.long()
                unowned[rows, best[rows]] = False
                nb_s = self.neigh[spot]  # [n, 6]
                adj_hit = ((tiles[rows].unsqueeze(2) == nb_s.unsqueeze(1)) & (nb_s >= 0).unsqueeze(1)).any(dim=2)  # [n, M]
                adj_own[rows] = adj_own[rows] | adj_hit

    def _minor_research(self, s: int) -> torch.Tensor:
        """The cheapest available row completes (table order on a price tie),
        at most one per pot per turn — the `minorResearch` twin. Early Empire
        is the row the border refusal reads. CIV6 (Urban Defenses): the tech
        "builds modern fortifications around the City Centers of all current
        and future cities and their Encampment districts", so the minor's
        perimeter arrives at the urban tier's full pool. Returns [B] long,
        how many trees completed a row — the upgrade trigger's count."""
        alive = self.citystate_alive[:, s]
        gained = torch.zeros(self.B, dtype=torch.long, device=self.device)
        rdv = self.rules_dev
        for is_tech, have, prog, cost, pre in (
            (True, self.citystate_techs, self.citystate_tech_prog, rdv.t_cost.to(self.device), self._prereq_t),
            (False, self.citystate_civics, self.citystate_civic_prog, rdv.c_cost.to(self.device), self._prereq_c),
        ):
            avail = self._available_mask(have[:, s], pre)
            if not bool(avail.any()):
                continue
            key = torch.where(avail, cost.unsqueeze(0).expand_as(avail),
                              torch.full((1, 1), float("inf"), dtype=torch.float64, device=self.device).expand_as(avail))
            key = key + torch.arange(key.shape[1], device=self.device, dtype=torch.float64) * 1e-6
            pick = key.argmin(dim=1)
            cval = cost[pick]
            fire = alive & avail.any(dim=1) & (prog[:, s] >= cval)
            gained = gained + fire.long()
            if bool(fire.any()):
                have[fire, s, pick[fire]] = True
                prog[fire, s] = prog[fire, s] - cval[fire]
                # the minor's record now feeds its own yield walk (`_seat_techs`)
                self._eff_version += 1
                if is_tech and self._urban_def_tech >= 0:
                    self._minor_urban_fit(s, fire & (pick == self._urban_def_tech))
        return gained

    def _minor_urban_fit(self, s: int, hit: torch.Tensor) -> None:
        """`minorResearch`'s Urban Defenses fit: the centre's perimeter and its
        Encampment's own pool arrive at the urban tier's full pool."""
        if not bool(hit.any()):
            return
        row = self._CITY_MINOR0 + s
        full = int(self._walls_tier_hp[self._walls_tier_urban])
        self.city_outer_hp[:, row, 0] = torch.where(hit, torch.full_like(self.city_outer_hp[:, row, 0], full),
                                                    self.city_outer_hp[:, row, 0])
        if self._encamp_didx >= 0 and self.districts_on:
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

    def _minor_centre_cs(self, s: int) -> torch.Tensor:
        """[B] long — `minorCityCS`: the minor's centre strength, 15 plus its
        population, +6 for a militaristic minor, and its walls tier's adder.
        Its city's ranged strike leaves from it."""
        mil_idx = int(self.rules.citystate.get("militaristicIdx", -1))
        return (15 + self.citystate_pop[:, s].long()
                + (self.citystate_type[:, s] == mil_idx).long() * 6
                + self._walls_tier_cs[self._minor_walls_tier(s)].long())

    def _minor_district_site(self, s: int) -> torch.Tensor:
        """[B, T] `canPlaceDistrictIn`'s city half for the minor's one city —
        `_district_elig_site` with the minor's OWN ownership (its seat id is
        100+s, never its city-block row) and its own research record on the
        feature-clear clause. No `tile_city` test: a minor's territory is one
        city's by construction. An improved plot is a site: the pave removes
        the improvement."""
        B, dev = self.B, self.device
        center = self.citystate_center[:, s].clamp(min=0)
        elig = (
            (self.tile_seat == 100 + s)
            & (self.district < 0)
            & (self.built_wonder < 0)
            & ((self.res_priority <= 1) | self._res_hidden(self._CITY_MINOR0 + s))   # an unseen strategic is plain ground
            & (self.pair_dist[center] <= 3)
        )
        need_clear = (self.tile_ftu >= 0) & ~self.feat_stripped
        if bool(need_clear.any()):
            have = self.citystate_techs[:, s].gather(1, self.tile_ftu.clamp(min=0))
            elig = elig & (~need_clear | have)
        elig[torch.arange(B, device=dev), center] = False
        return elig

    def _init_minor_build(self, rules) -> None:
        """THE MINOR'S BUILD TABLE, off the wire (`MINOR_BUILD_ROWS`): per row
        its kind, its item per minor type (a building or district index, -1
        none), its unit class and `below`, whether it draws and its slots per
        type; the army cap's slots and class weights; the Builder's rate and
        reach; the unit toward-rows."""
        cs = rules.citystate
        dev = self.device
        kinds = list(cs["buildKinds"])
        rows = cs["buildRows"]
        self._mb_kind = [kinds[int(r["k"])] for r in rows]
        self._mb_item = torch.tensor([[int(x) for x in r["item"]] for r in rows], dtype=torch.long, device=dev)
        self._mb_cls = [int(r["c"]) for r in rows]
        self._mb_below = [int(r["n"]) for r in rows]
        self._mb_drawn = [bool(r["d"]) for r in rows]
        self._mb_from = torch.tensor([r["from"] for r in rows], dtype=torch.long, device=dev)  # [R, types, slots]
        self._mb_slots = int(cs["buildSlots"])
        self._mb_cap_slots = torch.tensor([int(x) for x in cs["armyCapSlots"]], dtype=torch.long, device=dev)
        self._mb_army = [(int(c), int(w)) for c, w in cs["armyClasses"]]
        self._mb_excl_cls = [int(c) for c in cs["excludedUnitClasses"]]
        self._mb_builder_rate = int(cs["builderRatePermille"])
        self._mb_builder_radius = int(cs["builderRadius"])
        self._mb_builder_pct = float(cs["builderProdPct"])
        self._mb_military_pct = float(cs["militaryProdPct"])
        self._mb_small_military = int(cs["smallMilitary"])
        # THE MINOR'S PURSE (`minorPurchases`, `minorUpgrades`)
        self._mb_buy_slots = torch.tensor([int(x) for x in cs["builderBuySlots"]], dtype=torch.long, device=dev)
        self._mb_buy_floor = float(cs["militaryBuyFloor"])
        self._mb_buy_bp = [int(x) for x in cs["militaryBuyBp"]]
        self._mb_loss_mult = int(cs["lossBuyMult"])
        self._mb_loss_turns = int(cs["lossBuyTurns"])
        self._mb_upgrade_gold = float(cs["upgradeGold"])
        self._mb_naval_bp = int(cs["navalBuyBp"])
        self._mb_naval_cls = int(cs["navalClass"])
        # THE LEVY: the army's turns away, and its price's share
        self._levy_turns = int(cs["levyTurns"])
        self._levy_cost_pct = float(cs["levyCostPct"])
        # what a city-state destination pays a city-state's route
        self._minor_cs_route_gold = float(rules.trade["cityStateRouteGold"])
        self._minor_cs_route_spec = float(rules.trade["cityStateRouteSpec"])
        _lv = {d["level"]: d for d in rules.civ_levels}
        self._minor_any_res = bool(_lv["CITY_STATE"]["ignoresUnitStrategicResourceRequirements"])
        self._free_any_res = bool(_lv["FREE_CITIES"]["ignoresUnitStrategicResourceRequirements"])
        # THE WALKER (`walkUnit`): per-mille step tables, distance weights
        tbl = lambda k: torch.tensor([int(x) for x in cs[k]], dtype=torch.long, device=dev)  # noqa: E731
        self._walk_steps_peace = tbl("walkStepsPeace")
        self._walk_steps_war = tbl("walkStepsWar")
        self._walk_steps_damaged = tbl("walkStepsDamaged")
        self._walk_w_peace = tbl("walkWeightsPeace")
        self._walk_w_war = tbl("walkWeightsWar")
        self._free_walk_steps = tbl("freeWalkSteps")
        self._free_walk_w = tbl("freeWalkWeights")
        # THE FREE CITY'S BUILD TABLE (`FREE_CITY_BUILD_ROWS`) and the research
        # it reads — every tech and civic of an era at or below the world's
        fkinds = list(cs["freeBuildKinds"])
        self._fb_rows = [(fkinds[int(r["k"])], int(r["c"]), [int(x) for x in r["items"]])
                         for r in cs["freeBuildRows"]]
        self._tech_era = torch.tensor([int(x) for x in rules.seats["techEra"]], dtype=torch.long, device=dev)
        self._civic_era = torch.tensor([int(x) for x in rules.seats["civicEra"]], dtype=torch.long, device=dev)

    def _minor_plan(self, s: int) -> None:
        """`minorPlan` — the episode's draws, once, at the minor's first turn:
        one slot of each drawn row in table order (the minor's type), then the
        army cap, then the Builder purchase rate. `citystate_army_cap` -1 is
        the undrawn mark."""
        fresh = self.citystate_alive[:, s] & (self.citystate_army_cap[:, s] < 0)
        if not bool(fresh.any()):
            return
        typ = self.citystate_type[:, s].clamp(min=0)
        sl = self._mb_slots
        for r, drawn in enumerate(self._mb_drawn):
            if not drawn:
                continue
            k = torch.floor(self._next_random(fresh) * sl).long()
            self.citystate_build_from[:, s, r] = torch.where(
                fresh, self._mb_from[r][typ, k], self.citystate_build_from[:, s, r])
        k = torch.floor(self._next_random(fresh) * sl).long()
        self.citystate_army_cap[:, s] = torch.where(fresh, self._mb_cap_slots[k], self.citystate_army_cap[:, s])
        nb = int(self._mb_buy_slots.numel())
        k = torch.floor(self._next_random(fresh) * nb).long().clamp(max=nb - 1)
        self.citystate_builder_buy[:, s] = torch.where(fresh, self._mb_buy_slots[k], self.citystate_builder_buy[:, s])

    def _minor_trainable(self, s: int, naval: bool = False) -> torch.Tensor:
        """[B, NU] — the land (or naval) military chassis minor `s` may train,
        off its own research; CIV6 (`CivilizationLevels`, CITY_STATE) a minor
        ignores the strategic resource a chassis asks."""
        return self._trainable_in(self.citystate_techs[:, s], self.citystate_civics[:, s], self._minor_any_res,
                                  naval)

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
        minor's set, ties by catalog order; -1 where it has none
        (`minorBestOfClass`)."""
        ok = trainable & (self.rules_dev.u_promo_class.to(self.device) == c).unsqueeze(0)
        cs = torch.where(ok, self._type_combat.unsqueeze(0).long(),
                         torch.full((1, self.NU), -1, dtype=torch.long, device=self.device))
        pick = cs.argmax(dim=1)  # the FIRST maximum: catalog order on a tie
        return torch.where(ok.any(dim=1), pick, torch.full_like(pick, -1))

    def _minor_army_unit(self, trainable: torch.Tensor, n_cls: dict) -> torch.Tensor:
        """[B] long — `minorArmyUnit`: the class, among those the minor can
        field, its army holds fewest of against the census weights — (held +
        1) / weight, compared crosswise in integers, table order on a tie —
        and that class's strongest chassis; -1 where it can field none."""
        pick = torch.full((self.B,), -1, dtype=torch.long, device=self.device)
        held = torch.zeros(self.B, dtype=torch.long, device=self.device)
        weight = torch.ones(self.B, dtype=torch.long, device=self.device)
        for c, w in self._mb_army:
            ui = self._minor_best_of_class(trainable, c)
            n = n_cls[c]
            better = (ui >= 0) & ((pick < 0) | ((n + 1) * weight < (held + 1) * w))
            pick = torch.where(better, ui, pick)
            held = torch.where(better, n, held)
            weight = torch.where(better, torch.full_like(weight, w), weight)
        return pick

    def _minor_building_ok(self, s: int, bi: int) -> torch.Tensor:
        """[B] — `minorBuildingOk`: the minor's own research unlocks building
        `bi`; it is not already held; its district stands complete and clean
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
            ok = ok & (home >= 0) & self.district_complete[bidx, home.clamp(min=0)] \
                & ~self._fallout()[bidx, home.clamp(min=0)]
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
            ok = ok & (self.city_outer_hp[:, row, 0] >= self._walls_tier_hp[self._minor_walls_tier(s)])
        return ok

    def _minor_train(self, s: int, pay: torch.Tensor, ui: torch.Tensor, cost: torch.Tensor) -> None:
        """A unit the pot covers lands (`_minor_spawn`); only a unit that lands
        is paid for."""
        landed = self._minor_spawn(s, pay, ui)
        self.citystate_prod[:, s] -= torch.where(landed, cost, torch.zeros_like(cost))

    def _minor_spawn(self, s: int, mask: torch.Tensor, ui: torch.Tensor,
                     grants: bool = True) -> torch.Tensor:
        """[B] — a unit of chassis `ui` lands on the minor's centre or its ring
        (`spawnUnit`, the ordinary rule) under its seat, carrying what the
        city's buildings hand a unit trained there (`applyTrainingGrants`)
        unless `grants` is off; a Builder counts toward the next one's price.
        The games where it landed."""
        if not bool(mask.any()):
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
        if self._builder_idx >= 0:
            self.citystate_builders_trained[:, s] += (landed & (u0 == self._builder_idx)).long()
        self._gen_ver += 1
        return landed

    def _minor_build(self, s: int, prod: torch.Tensor | None = None) -> None:
        """`minorBuild` — the first row of the build table (`MINOR_BUILD_ROWS`,
        fitted to C-38's census) that wants an item the minor can make now is
        the one the turn's Production (`prod`, [B], `_minor_accrue`'s; none is
        zero) goes toward: the pot takes it under the minor's percent on its
        city's Production and that item's toward-row (walls +200%, the Harbor
        and the type's district +500%, a Builder +200%, a military unit +200%
        while it holds fewer than ten military units — the MINOR_CIV rows of
        Leaders.xml), and the item completes when the pot covers it, at most
        one a turn; a unit also needs a free tile on or beside the centre.
        With no row wanting anything the pot takes it under the percent alone.
        A drawn row wants nothing before its drawn turn (`_minor_plan`). A
        Trader waits on a route open to it and room under its capacity; the
        repair restores the walls at the HP it puts back; a district project
        pays its yield conversion into the minor's own pot; a district paves
        its plot (`_pave_plot`)."""
        if self.S == 0:
            return
        alive = self.citystate_alive[:, s]
        if not bool(alive.any()):
            return
        B, dev = self.B, self.device
        rd = self.rules_dev
        row = self._CITY_MINOR0 + s
        seat = 100 + s
        bidx = self._bidx
        dcp = self.rules.district_cost
        cs_rules = self.rules.citystate
        pen = (100 + float(cs_rules["productionPct"])) / 100
        walls_pct = float(cs_rules["wallsProdPct"])
        harbor_pct = float(cs_rules["harborProdPct"])
        type_pct = torch.tensor([float(x) for x in cs_rules["typeDistrictProdPct"]],
                                dtype=torch.float64, device=dev)
        zero_b = torch.zeros(B, dtype=torch.float64, device=dev)
        ones_b = torch.ones(B, dtype=torch.bool, device=dev)
        turn = prod if prod is not None else zero_b

        def toward(avail: torch.Tensor, pct) -> None:
            # `minorProduction`: the city's Production under the minor's
            # percent, then the item's toward-row, paid where it is the target
            self.citystate_prod[:, s] += torch.where(avail, turn * pen * ((100 + pct) / 100), zero_b)

        typ = self.citystate_type[:, s].clamp(min=0)
        # the minor's units, counted once before the walk
        mine = self.major_unit_alive & (self.major_unit_seat == seat)
        mt = self.major_unit_type.clamp(min=0, max=self.NU - 1)
        n_mil = (mine & self._type_military[mt]).sum(dim=1)
        ucls = self.rules_dev.u_promo_class.to(dev)[mt]
        n_cls = {c: (mine & (ucls == c)).sum(dim=1) for c in {c for c, _w in self._mb_army} | set(self._mb_cls)}
        n_builder = ((mine & (self.major_unit_type == self._builder_idx)).sum(dim=1) if self._builder_idx >= 0
                     else torch.ones(B, dtype=torch.long, device=dev))
        mil_pct = torch.where(n_mil < self._mb_small_military,
                              torch.full_like(zero_b, self._mb_military_pct), zero_b)
        trainable = None
        sc_map = {int(di): (int(ut), int(uc), int(plc)) for (di, ut, uc, plc, _fc) in self._scaffold}
        t_pct = self.citystate_techs[:, s].sum(dim=1).double() / float(max(int(rd.t_cost.shape[0]), 1))
        c_pct = self.citystate_civics[:, s].sum(dim=1).double() / float(max(int(rd.c_cost.shape[0]), 1))
        # the research factor is the minor's; the BASE is the row's own
        _mprog = torch.maximum(t_pct, c_pct)
        d_fac = 1 + dcp["scale"] * _mprog
        d_per = dcp["perDistrict"]
        _d_pg = dcp["progressGame"]

        halt = ~alive
        for r, kind in enumerate(self._mb_kind):
            if bool(halt.all()):
                break
            gate = ~halt
            if self._mb_drawn[r]:
                fr = self.citystate_build_from[:, s, r]
                gate = gate & (fr >= 0) & (fr <= self.turn)
            if not bool(gate.any()):
                continue
            if kind == "builder":
                if self._builder_idx < 0:
                    continue
                avail = gate & (n_builder == 0)
                if not bool(avail.any()):
                    continue
                toward(avail, self._mb_builder_pct)
                cost = self._builder_cost(self.citystate_builders_trained[:, s]).double()
                self._minor_train(s, avail & (self.citystate_prod[:, s] >= cost),
                                  torch.full((B,), self._builder_idx, dtype=torch.long, device=dev), cost)
                halt = halt | avail
                continue
            if kind in ("unit", "army"):
                if trainable is None:
                    trainable = self._minor_trainable(s)
                if kind == "unit":
                    c, below = self._mb_cls[r], self._mb_below[r]
                    want = (n_mil < below) if below >= 0 else (n_cls[c] == 0)
                    ui = self._minor_best_of_class(trainable, c)
                else:
                    want = n_mil < self.citystate_army_cap[:, s]
                    ui = self._minor_army_unit(trainable, n_cls)
                avail = gate & want & (ui >= 0)
                if not bool(avail.any()):
                    continue
                toward(avail, mil_pct)
                cost = self._type_cost[ui.clamp(min=0)].double()
                self._minor_train(s, avail & (self.citystate_prod[:, s] >= cost), ui, cost)
                halt = halt | avail
                continue
            if kind == "trader":
                if self._trader_idx < 0:
                    continue
                unl = ones_b
                ut_t, uc_t = int(self._type_tech[self._trader_idx]), int(self._type_civic[self._trader_idx])
                if ut_t >= 0:
                    unl = unl & self.citystate_techs[:, s, ut_t]
                if uc_t >= 0:
                    unl = unl & self.citystate_civics[:, s, uc_t]
                avail = gate & unl & (self._minor_traders(s) < self._trade_capacity(row))
                if not bool(avail.any()):
                    continue
                avail = avail & self._minor_route_candidate(s)[0]
                if not bool(avail.any()):
                    continue
                toward(avail, 0.0)
                cost = self._trader_cost(row).double()
                self._minor_train(s, avail & (self.citystate_prod[:, s] >= cost),
                                  torch.full((B,), self._trader_idx, dtype=torch.long, device=dev), cost)
                halt = halt | avail
                continue
            if kind == "repair":
                ok_r, cost_r = self._minor_repair(s)
                avail = gate & ok_r
                if not bool(avail.any()):
                    continue
                toward(avail, 0.0)
                pay = avail & (self.citystate_prod[:, s] >= cost_r)
                if bool(pay.any()):
                    rr = pay.nonzero(as_tuple=True)[0]
                    self.citystate_prod[rr, s] -= cost_r[rr]
                    full = self._walls_tier_hp[self._minor_walls_tier(s)]
                    self.city_outer_hp[rr, row, 0] = full[rr]
                    self._fit_encamp_outer(rr, row, torch.zeros_like(rr), full[rr])
                halt = halt | avail
                continue
            item = self._mb_item[r][typ]  # [B] the row's item for each game's minor
            if kind == "project":
                for pi in sorted(set(int(x) for x in item[gate].tolist())):
                    if pi < 0:
                        continue
                    prow = self._proj_rows[pi]
                    dpi = int(prow["d"])
                    dt = self.city_dist_tile[:, row, 0, dpi]
                    d0 = dt.clamp(min=0)
                    avail = (gate & (item == pi) & (dt >= 0) & self.district_complete[bidx, d0]
                             & ~self._fallout()[bidx, d0])
                    if not bool(avail.any()):
                        continue
                    toward(avail, 0.0)
                    # `projectCost`: the row's own Cost plus the GAME_PROGRESS climb
                    cost_p = float(max(int(prow["pc"]), 0)) + torch.floor(float(prow["pcg"]) * _mprog)
                    pay = avail & (self.citystate_prod[:, s] >= cost_p)
                    if bool(pay.any()):
                        self.citystate_prod[:, s] -= torch.where(pay, cost_p, zero_b)
                        yi = int(prow["y"])
                        amt = torch.where(pay, js_round(cost_p * self._proj_yf), zero_b)
                        if yi == 2:
                            self.citystate_treasury[:, s] += amt
                        elif yi == 3:
                            self.citystate_tech_prog[:, s] += amt
                        elif yi == 4:
                            self.citystate_civic_prog[:, s] += amt
                        elif yi == 5:
                            self.citystate_faith[:, s] += amt
                    halt = halt | avail
                continue
            if kind in ("building", "worship"):
                items_b = self._minor_worship(s) if kind == "worship" else item
                for bi in sorted(set(int(x) for x in items_b[gate].tolist())):
                    if bi < 0:
                        continue
                    avail = gate & (items_b == bi) & self._minor_building_ok(s, bi)
                    if not bool(avail.any()):
                        continue
                    is_walls = int(rd.b_walls[bi]) > 0
                    toward(avail, walls_pct if is_walls else 0.0)
                    # a Flood Barrier is priced off the lowland it covers
                    cost_b = (self._flood_barrier_cost(row)[:, 0].double() if bi == self._barrier_bidx
                              else torch.full_like(zero_b, float(rd.b_cost[bi])))
                    pay = avail & (self.citystate_prod[:, s] >= cost_b)
                    if bool(pay.any()):
                        rr = pay.nonzero(as_tuple=True)[0]
                        self.city_bldg[rr, row, 0, bi] = True
                        self.citystate_prod[rr, s] -= cost_b[rr]
                        if bi == self._barrier_bidx:
                            self._repair_behind_barrier(row, torch.zeros(B, dtype=torch.long, device=dev), pay)
                        if is_walls:
                            full = self._walls_tier_hp[self._minor_walls_tier(s)]
                            self.city_outer_hp[rr, row, 0] = full[rr]
                            self._fit_encamp_outer(rr, row, torch.zeros_like(rr), full[rr])
                        self._bldg_version += 1
                        self._eff_version += 1
                    halt = halt | avail
                continue
            # a DISTRICT row: the type's district, the Harbor, the Neighborhood
            if not self.districts_on:
                continue
            site_s = self._minor_district_site(s)
            for dv in sorted(set(int(x) for x in item[gate].tolist())):
                if dv < 0 or dv not in sc_map:
                    continue
                ut_d, uc_d, plc = sc_map[dv]
                if plc not in (0, 2, 3):
                    continue  # the minor menu holds land, coastal and Encampment placements only
                g = gate & (item == dv)
                unlock = (self.citystate_techs[:, s, ut_d] if ut_d >= 0
                          else (self.citystate_civics[:, s, uc_d] if uc_d >= 0 else ones_b))
                held = self.city_dist_tile[:, row, 0, dv] >= 0
                if bool(self._is_specialty[dv]):
                    spec_cnt = ((self.city_dist_tile[:, row, 0] >= 0) & self._is_specialty).sum(dim=1)
                    cap_ok = spec_cnt < (torch.div(self.city_pop[:, row, 0] - 1, 3, rounding_mode="floor") + 1)
                else:
                    cap_ok = ones_b
                surface = (self.coastal_water if plc == 2
                           else self.d_usable | (self.d_usable0 & self._res_hidden(row)))
                splane = site_s & surface & ~self._fallout() & ~self._fire_plots()
                if plc == 3:
                    splane = splane & (self._adj_center_count() == 0)
                avail = g & ~held & unlock & cap_ok & splane.any(dim=1)
                if not bool(avail.any()):
                    continue
                pct = (torch.full_like(zero_b, harbor_pct) if dv == int(self._harbor_didx)
                       else torch.where(self._citystate_didx[:, s] == dv, type_pct[typ], zero_b))
                toward(avail, pct)
                _b_dv = float(d_per[dv]) if dv < len(d_per) else float(dcp["base"])
                # the row's OWN cost model — a minor builds real districts
                # and the GAME_PROGRESS rows climb differently.
                _g_dv = float(_d_pg[dv]) if dv < len(_d_pg) else 0.0
                d_cost = (torch.full_like(d_fac, _b_dv) + torch.floor(_g_dv * _mprog)
                          if _g_dv > 0 else torch.floor(_b_dv * d_fac))
                if self._log_diff:
                    _nm = self.districts_cat[dv].get('id')
                    for _b in range(B):
                        if not bool(avail[_b]):
                            continue
                        _t = float(d_cost[_b])
                        _g = float(torch.floor(_g_dv * _mprog[_b])) if _g_dv > 0 else 0.0
                        self._diff_events.setdefault(_b, []).append(
                            f"dm:{seat}:{int(self.turn)}:{_nm}"
                            f" b{int(_t - _g)} g{int(_g)} t{int(_t)}"
                            f" pot{int(float(self.citystate_prod[_b, s]))}")
                pay = avail & (self.citystate_prod[:, s] >= d_cost)
                if bool(pay.any()):
                    rr = pay.nonzero(as_tuple=True)[0]
                    tt = splane.long().argmax(dim=1)[rr]
                    self.district[rr, tt] = dv
                    self.district_complete[rr, tt] = True
                    self._pave_plot(rr, tt)
                    self.city_dist_tile[rr, row, 0, dv] = tt
                    if dv == self._encamp_didx:
                        self.encamp_hp[rr, tt] = self._encamp_hp_max
                        self.encamp_outer_hp[rr, tt] = self._walls_tier_hp[self._minor_walls_tier(s)][rr]
                    self.citystate_prod[rr, s] -= d_cost[rr]
                    self._eff_version += 1
                halt = halt | avail
        toward(~halt, 0.0)

    def _minor_upgrades(self, s: int, gained: torch.Tensor) -> None:
        """`minorUpgrades` — CIV6 (Leaders.xml, MinorCivTriggeredTrees): a
        minor's "Upgrade Units" tree runs on a technology or civic gained; the
        census reads one upgrade per completion at `upgradeGold` each. Each of
        the turn's completions (`gained`, [B]) upgrades the first unit in slot
        order whose chassis' upgrade the minor's research unlocks, standing on
        the minor's ground with Movement left, while the treasury covers the
        price; the minor asks no strategic resource. The upgrade spends the
        unit's turn."""
        alive = self.citystate_alive[:, s]
        top = int((gained * alive.long()).max())
        if top <= 0:
            return
        B = self.B
        seat = 100 + s
        techs, civics = self.citystate_techs[:, s], self.citystate_civics[:, s]
        for n in range(top):
            act = alive & (gained > n) & self._afford(self.citystate_treasury[:, s], self._mb_upgrade_gold)
            if not bool(act.any()):
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
            if not bool(go.any()):
                return
            first = cand.long().argmax(dim=1)
            rr = go.nonzero(as_tuple=True)[0]
            u = first[rr]
            self.citystate_treasury[rr, s] -= self._mb_upgrade_gold
            self.major_unit_type[rr, u] = nxt[rr, u]
            self.major_unit_mp[rr, u] = 0
            self._gen_ver += 1

    def _minor_monk_ok(self, s: int) -> torch.Tensor:
        """[B] — `minorMonkOk`: may minor `s`'s city sell a Warrior Monk — its
        majority religion's follower belief is Warrior Monks, it holds a
        Temple and a complete, unpillaged Holy Site."""
        B, dev = self.B, self.device
        if self._monk_idx < 0 or self._monk_follower < 0 or self._temple_bidx < 0 or self._hs_idx < 0:
            return torch.zeros(B, dtype=torch.bool, device=dev)
        row = self._CITY_MINOR0 + s
        fol = self._minor_followed()[:, s]
        n = self.civ_follower.shape[1]
        belief = torch.where((fol >= 0) & (fol < n),
                             self.civ_follower.gather(1, fol.clamp(min=0, max=n - 1).unsqueeze(1)).squeeze(1),
                             torch.full_like(fol, -1))
        hs = self.city_dist_tile[:, row, 0, self._hs_idx]
        h0 = hs.clamp(min=0).unsqueeze(1)
        hs_ok = ((hs >= 0) & self.district_complete.gather(1, h0).squeeze(1)
                 & ~self.district_pillaged.gather(1, h0).squeeze(1))
        return (belief == self._monk_follower) & self.city_bldg[:, row, 0, self._temple_bidx] & hs_ok

    def _minor_purchases(self, s: int) -> None:
        """`minorPurchases` (C-38's census). A Builder, on a turn none stands
        and the treasury covers its price: one draw at the episode's rate
        (`citystate_builder_buy`). Then a military unit, on a turn the
        treasury holds the floor — or a Warrior Monk is in reach — one draw at
        the rate its military count sets (per ten thousand), tripled within the
        loss window. A drawn purchase buys a Warrior Monk with Faith where the
        minor may and its faith covers one, else the army row's chassis with
        Gold where the treasury covers it. Every price is the chassis' own cost
        at the gold (faith) rate, floored to five. A bought unit lands as a
        trained one does; with no free tile nothing is paid. Then a ship
        (`_minor_buy_naval`)."""
        self._minor_buy_land(s)
        self._minor_buy_naval(s)

    def _minor_buy_land(self, s: int) -> None:
        """The Builder, then the military unit — `minorPurchases` up to the
        ship."""
        alive = self.citystate_alive[:, s]
        B, dev = self.B, self.device
        seat = 100 + s
        mine = self.major_unit_alive & (self.major_unit_seat == seat)
        mt = self.major_unit_type.clamp(min=0, max=self.NU - 1)
        gold_mult = float(self.rules.gold_purchase_mult)
        if self._builder_idx >= 0:
            has_b = (mine & (self.major_unit_type == self._builder_idx)).any(dim=1)
            price_b = self._purchase_step(
                self._builder_cost(self.citystate_builders_trained[:, s]).double() * gold_mult)
            elig = alive & ~has_b & self._afford(self.citystate_treasury[:, s], price_b)
            if bool(elig.any()):
                r = self._next_random(elig)
                buy = elig & (torch.floor(r * 1000).long() < self.citystate_builder_buy[:, s])
                if bool(buy.any()):
                    landed = self._minor_spawn(s, buy, torch.full((B,), self._builder_idx, dtype=torch.long,
                                                                  device=dev))
                    self.citystate_treasury[:, s] -= torch.where(landed, price_b, torch.zeros_like(price_b))
        n_mil = (mine & self._type_military[mt]).sum(dim=1)
        nt = len(self._mb_buy_bp)
        bp_tab = torch.tensor(self._mb_buy_bp, dtype=torch.long, device=dev)
        bp = torch.where(n_mil < nt, bp_tab[n_mil.clamp(max=nt - 1)], torch.zeros_like(n_mil))
        if self._monk_idx >= 0:
            monk_price = self._purchase_step(
                js_round(self._type_cost[self._monk_idx].double() * float(self.rules.faith_purchase_mult))
                * torch.ones(B, dtype=torch.float64, device=dev))
            monk = self._minor_monk_ok(s) & self._afford(self.citystate_faith[:, s], monk_price)
        else:
            monk_price = torch.zeros(B, dtype=torch.float64, device=dev)
            monk = torch.zeros(B, dtype=torch.bool, device=dev)
        gate = alive & (bp > 0) & (monk | self._afford(self.citystate_treasury[:, s], self._mb_buy_floor))
        if not bool(gate.any()):
            return
        lt = self.citystate_loss_turn[:, s]
        recent = (lt >= 0) & ((int(self.turn) - lt) <= self._mb_loss_turns)
        rate = torch.where(recent, bp * self._mb_loss_mult, bp)
        r = self._next_random(gate)
        go = gate & (torch.floor(r * 10000).long() < rate)
        if not bool(go.any()):
            return
        gm = go & monk
        if bool(gm.any()):
            landed = self._minor_spawn(s, gm, torch.full((B,), self._monk_idx, dtype=torch.long, device=dev),
                                       grants=False)
            self.citystate_faith[:, s] -= torch.where(landed, monk_price, torch.zeros_like(monk_price))
        gg = go & ~monk
        if not bool(gg.any()):
            return
        ucls = self.rules_dev.u_promo_class.to(dev)[mt]
        n_cls = {c: (mine & (ucls == c)).sum(dim=1) for c, _w in self._mb_army}
        ui = self._minor_army_unit(self._minor_trainable(s), n_cls)
        price = self._purchase_step(self._type_cost[ui.clamp(min=0)].double() * gold_mult)
        can = gg & (ui >= 0) & self._afford(self.citystate_treasury[:, s], price)
        if bool(can.any()):
            landed = self._minor_spawn(s, can, ui)
            self.citystate_treasury[:, s] -= torch.where(landed, price, torch.zeros_like(price))

    def _minor_buy_naval(self, s: int) -> None:
        """`minorBuyNaval` — a ship (C-38's census: a minor buys its naval
        units, the naval melee line, and never builds one). On a turn minor `s`
        holds no ship, its city may field one (water beside the centre, or a
        Harbor), it may train a naval melee chassis and the treasury covers
        that chassis' Gold price: one draw at the census rate, and the
        strongest such chassis lands."""
        alive = self.citystate_alive[:, s]
        B, dev = self.B, self.device
        row = self._CITY_MINOR0 + s
        mine = self.major_unit_alive & (self.major_unit_seat == 100 + s)
        mt = self.major_unit_type.clamp(min=0, max=self.NU - 1)
        has_ship = (mine & self.unit_naval[mt]).any(dim=1)
        ui = self._minor_best_of_class(self._minor_trainable(s, naval=True), self._mb_naval_cls)
        price = self._purchase_step(self._type_cost[ui.clamp(min=0)].double() * float(self.rules.gold_purchase_mult))
        elig = (alive & ~has_ship & self._naval_capable_minor(s) & (ui >= 0)
                & self._afford(self.citystate_treasury[:, s], price))
        if not bool(elig.any()):
            return
        r = self._next_random(elig)
        go = elig & (torch.floor(r * 10000).long() < self._mb_naval_bp)
        if bool(go.any()):
            landed = self._minor_spawn(s, go, ui)
            self.citystate_treasury[:, s] -= torch.where(landed, price, torch.zeros_like(price))

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

    def _minor_walk(self, s: int) -> None:
        """`minorWalk` — minor `s`'s land military, in slot order, walk around
        its centre (`_walk_units`): the war tables while any major is at war
        with it, a damaged unit on the damaged step table."""
        alive = self.citystate_alive[:, s]
        row = self._CITY_MINOR0 + s
        at_war = self.war[:, row, : self.n_majors].any(dim=1)
        home = self.pair_dist[self.citystate_center[:, s].clamp(min=0)].long()  # [B, T]
        steps_ok = torch.where(at_war.unsqueeze(1), self._walk_steps_war.unsqueeze(0),
                               self._walk_steps_peace.unsqueeze(0))
        hp_max = int(self.rules.combat.get("unitHp", 100))
        self._walk_units("major", 100 + s, alive,
                         lambda hp: torch.where((hp < hp_max).unsqueeze(1),
                                                self._walk_steps_damaged.unsqueeze(0), steps_ok),
                         self._walk_weight_plane(home, at_war, self._walk_w_war, self._walk_w_peace))

    def _walk_weight_plane(self, home: torch.Tensor, which: torch.Tensor, w_a: torch.Tensor,
                           w_b: torch.Tensor) -> torch.Tensor:
        """[B, T] long — each plot's weight at its distance from home: table
        `w_a` where `which`, else `w_b`; 0 past the table."""
        out = torch.zeros_like(home)
        for w, sel in ((w_a, which), (w_b, ~which)):
            n = int(w.numel())
            plane = torch.where(home < n, w[home.clamp(max=n - 1)], torch.zeros_like(home))
            out = torch.where(sel.unsqueeze(1), plane, out)
        return out

    def _walk_ground(self, seat: int) -> torch.Tensor:
        """[B, T] — `walkerGround`: land, nothing impassable, and no city
        centre but one of `seat`'s own."""
        ctr = self._centre_seat_plane()
        return self.passable & ~self.water & ((ctr < 0) | (ctr == seat))

    def _walk_units(self, pre: str, seat: int, act: torch.Tensor, steps_of, wplane: torch.Tensor) -> None:
        """`walkUnit` over every land military unit of `seat` in pool `pre`,
        in slot order, off a list taken before anyone moves, in the games of
        `act`. `wplane` [B, T] is each plot's weight at its distance from home,
        `steps_of(hp)` the [B, 4] per-mille step table for a unit
        of that hit points. A unit's turn: ONE draw over its step table, then
        — for a step k > 0 — ONE draw over the walker ground exactly k away,
        weighted, in tile order; then up to k steps toward that plot, each to
        the first neighbour in direction order strictly closer, walker ground
        and free for it (`_blocked_for`), paid by `_step_verb`; it stops at
        the plot, where it cannot step, or with no Movement left."""
        B, T, dev = self.B, self.T, self.device
        alive = getattr(self, f"{pre}_unit_alive")
        typ = getattr(self, f"{pre}_unit_type").clamp(min=0, max=self.NU - 1)
        cand = (act.unsqueeze(1) & alive & (getattr(self, f"{pre}_unit_seat") == seat)
                & self._type_military[typ] & ~self.unit_naval[typ] & (self._type_air[typ] <= 0)
                & ~getattr(self, f"{pre}_unit_emb"))
        if not bool(cand.any()):
            return
        lo = self.POOL_LO[pre]
        ground = self._walk_ground(seat)
        rank = cand.long().cumsum(dim=1) - 1
        arange6 = torch.arange(6, device=dev)
        zeros_b = torch.zeros(B, dtype=torch.bool, device=dev)
        for k in range(int(cand.sum(dim=1).max())):
            here_m = cand & (rank == k)
            on = here_m.any(dim=1)
            if not bool(on.any()):
                continue
            g = here_m.long().argmax(dim=1) + lo  # the walker's merged slot
            cur = self.unit_tile.gather(1, g.unsqueeze(1)).squeeze(1).clamp(min=0)
            hp = self.unit_hp.gather(1, g.unsqueeze(1)).squeeze(1)
            cum = steps_of(hp).cumsum(dim=1)  # [B, 4]
            r = self._next_random(on)
            x = torch.floor(r * 1000).long()
            kstep = (cum <= x.unsqueeze(1)).sum(dim=1).clamp(max=cum.shape[1] - 1)
            go = on & (kstep > 0)
            if not bool(go.any()):
                continue
            ring = (self.pair_dist[cur].long() == kstep.unsqueeze(1)) & ground
            w = torch.where(ring, wplane, torch.zeros_like(wplane))
            total = w.sum(dim=1)
            go = go & (total > 0)
            if not bool(go.any()):
                continue
            r2 = self._next_random(go)
            pick = torch.floor(r2 * total.double()).long()
            target = (w.cumsum(dim=1) <= pick.unsqueeze(1)).sum(dim=1).clamp(max=T - 1)
            moving = go & (cur != target)
            for step in range(int(kstep.max())):
                mp = self.unit_mp.gather(1, g.unsqueeze(1)).squeeze(1)
                moving = moving & (step < kstep) & (cur != target) & (mp > 0)
                if not bool(moving.any()):
                    break
                nb = self.neigh[cur]  # [B, 6]
                nbc = nb.clamp(min=0)
                d0 = self.pair_dist[target, cur].long()
                closer = (nb >= 0) & (self.pair_dist[target.unsqueeze(1), nbc].long() < d0.unsqueeze(1))
                ok = (closer & ground.gather(1, nbc)
                      & ~self._blocked_for(nb, seat))
                has = ok.any(dim=1)
                d_i = torch.where(ok, arange6, torch.full_like(nb, 6)).min(dim=1).values.clamp(max=5)
                dest = nbc.gather(1, d_i.unsqueeze(1)).squeeze(1)
                mv = self._step_verb(moving & has, g, cur, dest, d_i, seat, zeros_b)
                cur = torch.where(mv, dest, cur)
                moving = mv

    def _free_research(self) -> tuple[torch.Tensor, torch.Tensor]:
        """([B, NT], [B, NC]) — `freeCityResearch`: every technology and civic
        of an era at or below the world's."""
        era = self._world_era().clamp(min=0).unsqueeze(1)
        return self._tech_era.unsqueeze(0) <= era, self._civic_era.unsqueeze(0) <= era

    def _free_walls_max(self, j: int) -> torch.Tensor:
        """[B] long — `wallsMax` of the Free City in column `j`."""
        B, dev = self.B, self.device
        return self._walls_max_at(torch.full((B,), self.FREE_ROW, dtype=torch.long, device=dev),
                                  torch.full((B,), j, dtype=torch.long, device=dev))

    def _free_building_ok(self, j: int, bi: int, techs: torch.Tensor, civics: torch.Tensor) -> torch.Tensor:
        """[B] — `freeCityBuildingOk`: the Free Cities' research unlocks
        building `bi`; the city does not hold it; its district stands complete
        and clean (the centre for a City Center row); the row it requires is
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
                & ~self._fallout()[bidx, home.clamp(min=0)]
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
        if self._encamp_didx >= 0 and self.districts_on:
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
        unit's plot (`nearestFreeCity`), ties to the lowest column; -1 with no
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

    def _free_city_build(self, j: int, act: torch.Tensor, prod: torch.Tensor, techs: torch.Tensor,
                         civics: torch.Tensor, trainable: torch.Tensor) -> None:
        """`freeCityBuild` for the Free City in column `j`, in the games of
        `act`: the turn's Production (`prod`) banks into `city_free_pot`, and
        the first row of `FREE_CITY_BUILD_ROWS` that wants an item the city
        can make now completes it when the pot covers it, one item a turn — a
        unit row its class's strongest chassis the Free Cities may train while
        no Free Cities unit of the class calls the city its nearest Free City
        (landing on or beside the centre, paid only where it lands), a
        building row the first of its items the city may raise, the repair
        row the walls restored when the repair is available."""
        B, dev = self.B, self.device
        rd = self.rules_dev
        row = self.FREE_ROW
        pot = self.city_free_pot[:, row, j] + torch.where(act, prod, torch.zeros_like(prod))
        self.city_free_pot[:, row, j] = torch.where(act, pot, self.city_free_pot[:, row, j])
        ctr = self.city_center[:, row, j].clamp(min=0)
        balive = self.barb_unit_alive & (self.barb_unit_seat == FREE_SEAT)
        bt = self.barb_unit_type.clamp(min=0, max=self.NU - 1)
        near = balive & self._type_military[bt] & (self._free_nearest_col() == j)
        bcls = self.rules_dev.u_promo_class.to(dev)[bt]
        jc = torch.full((B,), j, dtype=torch.long, device=dev)
        halt = ~act
        for kind, c, items in self._fb_rows:
            if bool(halt.all()):
                return
            if kind == "unit":
                ui = self._minor_best_of_class(trainable, c)
                want = ~halt & ~(near & (bcls == c)).any(dim=1) & (ui >= 0)
                if not bool(want.any()):
                    continue
                cost = self._type_cost[ui.clamp(min=0)].double()
                pay = want & (self.city_free_pot[:, row, j] >= cost)
                if bool(pay.any()):
                    landed = self._spawn_barb(pay, ctr, ui.clamp(min=0), ladder=False, seat=FREE_SEAT,
                                              home=torch.full((B,), -1, dtype=torch.long, device=dev))
                    self.city_free_pot[:, row, j] -= torch.where(landed, cost, torch.zeros_like(cost))
                halt = halt | want
                continue
            if kind == "repair":
                avail, cost = self._free_repair(j)
                want = ~halt & avail
                if not bool(want.any()):
                    continue
                pay = want & (self.city_free_pot[:, row, j] >= cost)
                if bool(pay.any()):
                    rr = pay.nonzero(as_tuple=True)[0]
                    self.city_free_pot[rr, row, j] -= cost[rr]
                    full = self._free_walls_max(j)
                    self.city_outer_hp[rr, row, j] = full[rr].to(self.city_outer_hp.dtype)
                    self._fit_encamp_outer(rr, row, jc[rr], full[rr])
                halt = halt | want
                continue
            chosen = torch.zeros(B, dtype=torch.bool, device=dev)
            for bi in items:
                if bi < 0:
                    continue
                sel = ~halt & ~chosen & self._free_building_ok(j, bi, techs, civics)
                if not bool(sel.any()):
                    continue
                chosen = chosen | sel
                cost = float(rd.b_cost[bi])
                pay = sel & (self.city_free_pot[:, row, j] >= cost)
                if bool(pay.any()):
                    rr = pay.nonzero(as_tuple=True)[0]
                    self.city_bldg[rr, row, j, bi] = True
                    self.city_free_pot[rr, row, j] -= cost
                    if int(rd.b_walls[bi]) > 0:
                        full = self._free_walls_max(j)
                        self.city_outer_hp[rr, row, j] = full[rr].to(self.city_outer_hp.dtype)
                        self._fit_encamp_outer(rr, row, jc[rr], full[rr])
                    self._bldg_version += 1
                    self._eff_version += 1
            halt = halt | chosen

    def _free_walk(self, act: torch.Tensor) -> None:
        """The Free Cities' land units walk (`walkUnit`, C-60's tables) around
        the nearest Free City, in the games of `act`."""
        row = self.FREE_ROW
        alive = self.city_alive[:, row]
        ctr = self.city_center[:, row].clamp(min=0)  # [B, RC]
        d = self.pair_dist[ctr].long()  # [B, RC, T]
        d = torch.where(alive.unsqueeze(2), d, torch.full_like(d, 1 << 30))
        home = d.min(dim=1).values
        wplane = self._walk_weight_plane(home, torch.ones_like(act), self._free_walk_w, self._free_walk_w)
        steps = self._free_walk_steps.unsqueeze(0).expand(self.B, -1)
        self._walk_units("barb", FREE_SEAT, act, lambda hp: steps, wplane)

    def _minor_imp_legal(self, s: int) -> torch.Tensor:
        """[B, T, K] — `validImprovements(state, tile, 100 + s)` on a LAND plot,
        the Builder's arms with minor `s`'s own research, arm for arm with the
        majors' builder column (`_seat_unit_mask`): a visible resource offers
        its own improvement alone, bare ground the Farm, the Mine, the Lumber
        Mill, the Seaside Resort and the ground-only rows. A minor lays no
        suzerain row (it is no one's suzerain), no unique row (it plays no
        civilization), no named unit's or Engineer's row and, standing on
        land, no water row. A drought's own improvements wait for the rain
        (`droughtBars`). Paving, ownership and standing are the caller's."""
        row = self._CITY_MINOR0 + s
        B, T, dev = self.B, self.T, self.device
        K = int(self._imp_unlock.numel())
        techs, civics = self.citystate_techs[:, s], self.citystate_civics[:, s]
        ones = torch.ones(B, dtype=torch.bool, device=dev)
        zeros = torch.zeros(B, dtype=torch.bool, device=dev)

        def unl(k: int) -> torch.Tensor:
            ut, uc = int(self._imp_unlock[k]), int(self._imp_unlock_civic[k])
            ok = techs[:, ut] if ut >= 0 else ones
            if uc >= 0:
                ok = ok & civics[:, uc]
            return ok.unsqueeze(1)

        rq = torch.where(self._res_hidden(row), torch.full_like(self.res_imp, -1), self.res_imp)
        dry = self.drought > 0
        land = ~self.water & self.passable
        out = torch.zeros(B, T, K, dtype=torch.bool, device=dev)
        for k in range(K):
            if k == self.FARM:
                ok = self._farm_ground(row, civics) & unl(k)
            elif k == self.MINE:
                ok = self._plane_seen("mine_ok", row) & (
                    techs[:, self._mine_unlock_tech] if self._mine_unlock_tech >= 0 else zeros).unsqueeze(1)
            elif k == self.LUMBER:
                ok = self._plane_seen("lumber_ok", row) & ~self.feat_stripped & (
                    techs[:, self._lumber_unlock_tech] if self._lumber_unlock_tech >= 0 else zeros).unsqueeze(1)
            elif self.SEASIDE >= 0 and k == self.SEASIDE:
                ok = self._seaside_ok(row) & unl(k)
            elif (self._imp_built_by[k] >= 0 or self._imp_suz[k] or self._imp_uniq[k] >= 0
                  or k == self.TUNNEL or self._imp_eng[k] or self._imp_water[k]):
                continue
            elif self._imp_ground[k]:
                ok = unl(k) & (rq == -1) & land & self._imp_ground_ok(k) & self._imp_gov_ok(row, k)
            else:
                ok = (rq == k) & unl(k)
            if k in self._drought_imps:
                ok = ok & ~dry
            out[:, :, k] = ok
        return out

    def _minor_builders(self, s: int) -> None:
        """`minorBuilders` — each of minor `s`'s Builders holding a charge, in
        slot order, may lay one improvement a turn: a draw at the census rate
        (`builderRatePermille`), then ONE draw over every (plot, improvement)
        pair `_minor_imp_legal` offers on the minor's land plots within
        `builderRadius` of its centre that the Builder may stand on — plots
        ascending, improvements in catalog order, TS's pick order. Which pair
        a minor picks is unmeasured (LAB C-38-S1), so the pick is uniform. The
        Builder stands on the plot, spends a charge and its turn, and is gone
        with its last charge (`_spend_build_charge`). No pair, no draw."""
        if self._builder_idx < 0 or not self.improvements_on:
            return
        seat = 100 + s
        mine = (self.major_unit_alive & (self.major_unit_seat == seat)
                & (self.major_unit_type == self._builder_idx) & (self.major_unit_charges > 0))
        if not bool(mine.any()):
            return
        B, T, dev = self.B, self.T, self.device
        K = int(self._imp_unlock.numel())
        bidx = self._bidx
        lo = self.POOL_LO["major"]
        rank = mine.long().cumsum(dim=1) - 1
        ctr = self.citystate_center[:, s].clamp(min=0)
        for k in range(int(mine.sum(dim=1).max())):
            here = mine & (rank == k)
            act = here.any(dim=1) & self.citystate_alive[:, s]
            if not bool(act.any()):
                continue
            g = here.long().argmax(dim=1) + lo  # the builder's global slot
            own = self.unit_tile[bidx, g].clamp(min=0)
            base = ((self.tile_seat == seat) & (self.pair_dist[ctr] <= self._mb_builder_radius)
                    & ~self.water & self.passable & ~self.nwonder
                    & (self.improvement < 0) & (self.district < 0) & (self.built_wonder < 0)
                    & (self.centre_slot_at < 0))
            base[bidx, ctr] = False
            # where the Builder may stand: its own plot, or one the stacking
            # rule opens to a civilian of its seat (`tileFreeForUnit`)
            stand = ~self._blocked_for(torch.arange(T, device=dev).unsqueeze(0).expand(B, T), seat,
                                       is_civilian=True)
            stand[bidx, own] = True
            cand = (self._minor_imp_legal(s) & (base & stand).unsqueeze(2)).reshape(B, T * K)
            n = cand.sum(dim=1)
            go = act & (n > 0)
            if not bool(go.any()):
                continue
            r1 = self._next_random(go)
            build = go & (torch.floor(r1 * 1000) < self._mb_builder_rate)
            if not bool(build.any()):
                continue
            r2 = self._next_random(build)
            pick = torch.floor(r2 * n.double()).long()
            hit = cand & (cand.long().cumsum(dim=1) == (pick + 1).unsqueeze(1))
            flat = hit.long().argmax(dim=1)
            tt = torch.div(flat, K, rounding_mode="floor")
            kk = flat % K
            rr = build.nonzero(as_tuple=True)[0]
            self._occ_clear(rr, self.unit_tile[rr, g[rr]], g[rr])
            self.unit_tile[rr, g[rr]] = tt[rr]
            self._occ_set(rr, tt[rr], g[rr])
            self.improvement[rr, tt[rr]] = kk[rr]
            self.pillaged[rr, tt[rr]] = False
            self._eff_version += 1
            self._spend_build_charge(rr, g, tt)
            self._gen_ver += 1

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
        if int(wrow.get("ut", -1)) == -3 or int(wrow.get("uc", -1)) == -3:
            return None
        if int(wrow.get("adjD", -1)) == -3:
            return None
        ok = torch.ones(self.B, dtype=torch.bool, device=self.device)
        if int(wrow.get("ut", -1)) >= 0:
            ok = ok & self.civ_techs[:, row, int(wrow["ut"])]
        if int(wrow.get("uc", -1)) >= 0:
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

    def _wonder_cand(self, row: int, j: int, wi: int, base_ok: torch.Tensor) -> torch.Tensor:
        """`canPlaceWonder`'s live half. The terrain half rides the static
        `wok` bitmask the exporter baked out of `wonderTerrainOk`, so nothing
        here re-derives ground."""
        wrow = self._wond_rows[wi]
        # ...and `canPlaceWonder` refuses a fire's plot (`fireFeature`)
        cand_w = base_ok & ((self.wok >> wi) & 1).bool() & ~self._fire_plots()
        adjD = int(wrow.get("adjD", -1))
        adjDB = int(wrow.get("adjDB", -1))
        if adjD == -2:
            cand_w = cand_w & self._wadj_plane(("ctr",), lambda: self._adj_center_count() > 0)
        elif adjD >= 0:
            near = (self._wadj_plane(("dw", adjD, adjDB), lambda: self._adj_district_with(adjD, adjDB))
                    if adjDB >= 0
                    else self._wadj_plane(("dt", adjD), lambda: self._adj_dtype_complete(adjD)))
            cand_w = cand_w & near
        if int(wrow.get("adjR", -1)) >= 0:
            ri = int(wrow["adjR"])
            cand_w = cand_w & self._wadj_plane(("res", ri), lambda: self._adj_res_live(ri))
        if int(wrow.get("adjI", -1)) >= 0:
            ii = int(wrow["adjI"])
            cand_w = cand_w & self._wadj_plane(("imp", ii), lambda: self._adj_improvement(ii))
        if int(wrow.get("adjCap", 0)):
            cand_w = cand_w & self._wadj_plane(("cap", row), lambda: self._adj_capital(row))
        if int(wrow.get("needRel", 0)):
            cand_w = cand_w & self.civ_religion_done[:, row].unsqueeze(1)
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
        if not bool(hit.any()):
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
            if bool(k.any()):
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
        self._pave_plot(rows_w, bwt)
        self.city_wonder[rows_w, row, j, wi] = bwt
        code_w = self.WONDER_BASE + wi
        # the wonder's PLOT lives in the `city_wonder` registry, which is keyed
        # by wonder rather than by queue slot, so the entry carries no qtile.
        _b1 = torch.ones(self.B, dtype=torch.long, device=self.device)
        self._q_push(row, j, has_w, _b1 * code_w,
                     _b1.to(self.city_cost.dtype) * float(wrow["cost"]))
        self._eff_version += 1
