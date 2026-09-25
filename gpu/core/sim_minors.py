from __future__ import annotations

from .simbase import *  # noqa: F401,F403 — torch, constants, helpers: the shared floor


class SimMinors:
    def _city_state_phase(self) -> None:
        if self.S == 0:
            return
        citystate_max = int(self.rules.citystate.get("maxHp", 150))
        self.citystate_hp.copy_(torch.where(self.citystate_alive & (self.citystate_hp < citystate_max), (self.citystate_hp + 10).clamp(max=citystate_max), self.citystate_hp))
        # each minor in turn: its city's yields, then the research they buy,
        # then its Builders' work, then the item the Production goes to — the
        # `minorPhase` order, one minor at a time because a district one minor
        # lands may lend a neighbour's district adjacency across the border —
        # and then its city's ranged strikes, the majors' own body
        # (`cityStrikes`)
        col0 = torch.zeros(self.B, dtype=torch.long, device=self.device)
        for s in range(self.S):
            if not bool(self.citystate_alive[:, s].any()):
                continue
            prod = self._minor_accrue(s)
            self._minor_research(s)
            self._minor_builders(s)
            self._minor_build(s, prod)
            self._city_strikes(self._CITY_MINOR0 + s, col0, self.citystate_alive[:, s])

    def _minor_accrue(self, s: int) -> torch.Tensor:
        """THE MINOR'S CITY PAYS ITS YIELDS, AND THEN GROWS AND CLAIMS ON THEM.

        CIV6 (City-state): a city-state's city is an ordinary city — its Campus
        yields Science, its Commercial Hub Gold — and the install has ONE city
        rule, so it grows on its FOOD BOX and takes ground on its CULTURE BOX
        exactly as a major's does. Its row is a row of the CITY BLOCK,
        so `_seat_city_growth` and `_seat_border_growth` are the majors' own
        bodies called on it, and `citystate_pop` is a VIEW of `city_pop` — the
        growth write moves it with no mirror of its own.

        Science and Culture also feed the two research pots; Gold and Faith are
        banked (`citystate_treasury` / `citystate_faith`) and nothing spends
        either. The [B] Production is returned for `_minor_build`, which pays
        it into the pot under the rows of the item it goes toward."""
        row = self._CITY_MINOR0 + s
        keep = self.citystate_alive[:, s].double()
        total, eff, need, _tier = self._seat_city_stats(row)
        tot = total[:, 0]  # [B, 6], zero where the city is dead
        self.citystate_treasury[:, s] += tot[:, 2] * keep
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

    def _minor_research(self, s: int) -> None:
        """The cheapest available row completes (table order on a price tie),
        at most one per pot per turn — the `minorResearch` twin. Early Empire
        is the row the border refusal reads. CIV6 (Urban Defenses): the tech
        "builds modern fortifications around the City Centers of all current
        and future cities and their Encampment districts", so the minor's
        perimeter arrives at the urban tier's full pool."""
        alive = self.citystate_alive[:, s]
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
            if bool(fire.any()):
                have[fire, s, pick[fire]] = True
                prog[fire, s] = prog[fire, s] - cval[fire]
                # the minor's record now feeds its own yield walk (`_seat_techs`)
                self._eff_version += 1
                if is_tech and self._urban_def_tech >= 0:
                    self._minor_urban_fit(s, fire & (pick == self._urban_def_tech))

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
        city's by construction."""
        B, dev = self.B, self.device
        center = self.citystate_center[:, s].clamp(min=0)
        elig = (
            (self.tile_seat == 100 + s)
            & (self.district < 0)
            & (self.built_wonder < 0)
            & (self.improvement < 0)
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

    def _minor_plan(self, s: int) -> None:
        """`minorPlan` — the episode's draws, once, at the minor's first build:
        one slot of each drawn row in table order (the minor's type), then the
        army cap. `citystate_army_cap` -1 is the undrawn mark."""
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

    def _minor_trainable(self, s: int) -> torch.Tensor:
        """[B, NU] — `minorTrainable`: the land military chassis minor `s` may
        train — its own research unlocks it, it asks no strategic resource
        (a minor holds no stockpile here), it is no civilization's unique, and
        MinorCivUnitBuilds does not bar its class."""
        B = self.B
        cls = self.rules_dev.u_promo_class.to(self.device)
        static = (self._type_military & ~self.unit_naval & (self._type_air <= 0) & ~self._type_faith_only
                  & ~self._type_spawn_only & ~self._type_settler & (self._type_uniq < 0)
                  & (self._type_resource < 0) & (cls >= 0))
        for c in self._mb_excl_cls:
            static = static & (cls != c)
        techs, civics = self.citystate_techs[:, s], self.citystate_civics[:, s]
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
        and CIV6: "While city defenses are damaged, you cannot build higher
        levels of Walls."."""
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
        if int(rd.b_walls[bi]) > 0:
            ok = ok & (self.city_outer_hp[:, row, 0] >= self._walls_tier_hp[self._minor_walls_tier(s)])
        return ok

    def _minor_train(self, s: int, pay: torch.Tensor, ui: torch.Tensor, cost: torch.Tensor) -> None:
        """A unit the pot covers lands on the centre or its ring (`spawnUnit`,
        the ordinary rule) under the minor's seat, carrying what the city's
        buildings hand a unit trained there (`applyTrainingGrants`); only a
        unit that lands is paid for."""
        if not bool(pay.any()):
            return
        row = self._CITY_MINOR0 + s
        col0 = torch.zeros(self.B, dtype=torch.long, device=self.device)
        bl = self.city_bldg[:, row, 0] & ~self._bldg_dark(
            self.city_dist_tile[:, row, 0], self.city_bldg_pillaged[:, row, 0])
        u0 = ui.clamp(min=0)
        xp = self._train_xp_pct(bl, u0, row, col0)
        landed = self._spawn_unit(row, pay, self.citystate_center[:, s].clamp(min=0), u0, init_xp=xp)
        self.citystate_prod[:, s] -= torch.where(landed, cost, torch.zeros_like(cost))
        if self._builder_idx >= 0:
            self.citystate_builders_trained[:, s] += (landed & (u0 == self._builder_idx)).long()
        self._gen_ver += 1

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
        A drawn row wants nothing before its drawn turn (`_minor_plan`)."""
        if self.S == 0:
            return
        alive = self.citystate_alive[:, s]
        if not bool(alive.any()):
            return
        self._minor_plan(s)
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
        d_fac = 1 + dcp.get("scale", 9) * _mprog
        d_per = dcp.get("perDistrict") or []
        _d_pg = dcp.get("progressGame") or []

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
            item = self._mb_item[r][typ]  # [B] the row's item for each game's minor
            if kind == "building":
                for bi in sorted(set(int(x) for x in item[gate].tolist())):
                    if bi < 0:
                        continue
                    avail = gate & (item == bi) & self._minor_building_ok(s, bi)
                    if not bool(avail.any()):
                        continue
                    is_walls = int(rd.b_walls[bi]) > 0
                    toward(avail, walls_pct if is_walls else 0.0)
                    pay = avail & (self.citystate_prod[:, s] >= float(rd.b_cost[bi]))
                    if bool(pay.any()):
                        rr = pay.nonzero(as_tuple=True)[0]
                        self.city_bldg[rr, row, 0, bi] = True
                        self.citystate_prod[rr, s] -= float(rd.b_cost[bi])
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
                splane = site_s & surface & ~self._fallout()
                if plc == 3:
                    splane = splane & (self._adj_center_count() == 0)
                avail = g & ~held & unlock & cap_ok & splane.any(dim=1)
                if not bool(avail.any()):
                    continue
                pct = (torch.full_like(zero_b, harbor_pct) if dv == int(self._harbor_didx)
                       else torch.where(self._citystate_didx[:, s] == dv, type_pct[typ], zero_b))
                toward(avail, pct)
                _b_dv = float(d_per[dv]) if dv < len(d_per) else float(dcp.get("base", 32))
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
                    self.city_dist_tile[rr, row, 0, dv] = tt
                    if dv == self._encamp_didx:
                        self.encamp_hp[rr, tt] = self._encamp_hp_max
                        self.encamp_outer_hp[rr, tt] = self._walls_tier_hp[self._minor_walls_tier(s)][rr]
                    self.citystate_prod[rr, s] -= d_cost[rr]
                    self._eff_version += 1
                halt = halt | avail
        toward(~halt, 0.0)

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
        cand_w = base_ok & ((self.wok >> wi) & 1).bool()
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
        self.improvement[rows_w, bwt] = -1
        nofp = self.feat_id[rows_w, bwt] != self._fp_fid
        if bool(nofp.any()):
            self._strip_feature_at(rows_w[nofp], bwt[nofp])
        fresh_rs = (self.res_priority[rows_w, bwt] == 1) & ~self.res_stripped[rows_w, bwt]
        self.res_stripped[rows_w, bwt] = self.res_stripped[rows_w, bwt] | (self.res_priority[rows_w, bwt] == 1)
        self._withdraw_sea_adj(rows_w[fresh_rs], bwt[fresh_rs])
        self.city_wonder[rows_w, row, j, wi] = bwt
        code_w = self.WONDER_BASE + wi
        # the wonder's PLOT lives in the `city_wonder` registry, which is keyed
        # by wonder rather than by queue slot, so the entry carries no qtile.
        _b1 = torch.ones(self.B, dtype=torch.long, device=self.device)
        self._q_push(row, j, has_w, _b1 * code_w,
                     _b1.to(self.city_cost.dtype) * float(wrow["cost"]))
        self._eff_version += 1

    def _seat_proj_cost(self, row: int) -> torch.Tensor:
        dcp = self.rules.district_cost
        t_pct_r = self.civ_techs[:, row].to(torch.float64).mean(dim=1)
        c_pct_r = self.civ_civics[:, row].to(torch.float64).mean(dim=1)
        d_cost = torch.floor(dcp.get("base", 32) * (1 + dcp.get("scale", 9) * torch.maximum(t_pct_r, c_pct_r)))
        p_floor = float(round(15 * self.rules.game_speed))
        return torch.maximum(torch.full_like(d_cost, p_floor), js_round(d_cost * 0.5))
