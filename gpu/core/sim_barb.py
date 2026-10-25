from __future__ import annotations

from .simbase import *  # noqa: F401,F403 — torch, constants, helpers: the shared floor

# a camp's sight (`CAMP_SIGHT`): its owner sees its plot and the six beside it
_CAMP_SIGHT = 1


class SimBarb:
    """THE BARBARIANS' TURN — `cpu/core/barbarians.ts`'s twin (the game's
    barbarian manager, tools/civ6lab/dll_readings.md "H-1: the barbarians'
    turn"): their techs and civics, the camp step, each tribe's turn."""

    # ------------------------------------------------------------------ techs

    def _barb_majors_alive(self) -> torch.Tensor:
        """[B, n_majors] bool — `majorsAlive`: a major with a city or a unit."""
        cities = self.city_alive[:, : self.n_majors].reshape(self.B, self.n_majors, -1).any(dim=2)
        lo, hi = self.POOL_LO["major"], self.POOL_HI["major"]
        alive, seat = self.unit_alive[:, lo:hi], self.unit_seat[:, lo:hi]
        units = torch.stack([(alive & (seat == r)).any(dim=1) for r in range(self.n_majors)], dim=1)
        return cities | units

    def _barb_tech_step(self) -> None:
        """`barbarianTechs`: each tech the barbarians lack that at least
        max(1, (BARBARIAN_TECH_PERCENT x majors + 50) / 100) living majors
        hold, or that the install frees to them, is theirs; the civics alike."""
        live = self._barb_majors_alive()
        need = ((self._bb["techPct"] * live.sum(dim=1) + 50) // 100).clamp(min=1)
        held = (self.civ_techs & live.unsqueeze(2)).sum(dim=1)
        got = held >= need.unsqueeze(1)
        for t in self._bb["freeTechs"]:
            if t >= 0:
                got[:, t] = True
        self.barb_techs |= got
        heldc = (self.civ_civics & live.unsqueeze(2)).sum(dim=1)
        self.barb_civics |= heldc >= need.unsqueeze(1)

    # ------------------------------------------------------------- the sight

    def _barb_seen(self, who: str | int) -> torch.Tensor:
        """[B, T] bool — `plotsSeenNow`: what the majors (`who` "majors"),
        every living player, the barbarians included ("all", `allSeers`), the
        barbarians alone ("barbarians") or one seat (`who` its absolute seat)
        see now — each unit's sight across the plots its line reaches, each
        city centre two plots round, each owned plot with its ring, and the
        barbarians' camps with theirs (`CAMP_SIGHT`)."""
        B, T = self.B, self.T
        seen = torch.zeros(B, T, dtype=torch.bool, device=self.device)

        def seer(seat: torch.Tensor) -> torch.Tensor:
            if isinstance(who, int):
                return seat == who
            if who == "majors":
                return (seat >= 0) & (seat < self.n_majors)
            if who == "barbarians":
                return seat == BARB_SEAT
            return seat >= 0

        live = self.unit_alive & seer(self.unit_seat)
        for u in live.any(dim=0).nonzero(as_tuple=True)[0].tolist():
            rows = live[:, u].nonzero(as_tuple=True)[0]
            ut, pr, st = self.unit_type[rows, u], self.unit_promos[rows, u], self.unit_seat[rows, u]
            rad = self._unit_sight(ut, pr, st, rows)
            seen[rows] |= self._los_disk(rows, self.unit_tile[rows, u].clamp(min=0), rad, self._sees_through(ut, pr))
        ctr = self._centre_seat_plane()
        own_c = (ctr >= 0) & seer(ctr)
        if bool(own_c.any()):
            near2 = self.pair_dist <= 2  # [T, T]
            seen |= (own_c.to(torch.float32) @ near2.to(torch.float32)) > 0
        owned = (self.tile_seat >= 0) & seer(self.tile_seat)
        nb = self.neigh  # [T, 6]
        ring = owned[:, nb.clamp(min=0)] & (nb >= 0)  # [B, T, 6]
        seen |= owned | ring.any(dim=2)
        if who in (barbarians, all) or (isinstance(who, int) and who == BARB_SEAT):
            # a camp's improvement: its owner sees its plot and the six beside it
            cp = self.camp_tile
            camp = torch.zeros(B, T, dtype=torch.bool, device=self.device)
            ok = cp >= 0
            if bool(ok.any()):
                bi = torch.arange(B, device=self.device).unsqueeze(1).expand_as(cp)
                camp[bi[ok], cp[ok]] = True
                seen |= (camp.to(torch.float32) @ (self.pair_dist <= _CAMP_SIGHT).to(torch.float32)) > 0
        return seen

    # --------------------------------------------------------- the unit pick

    def _barb_unit_for(self) -> torch.Tensor:
        """[B, n_tags] long — `barbUnitFor` for every class tag: of the tag's
        units the barbarians' techs and civics allow, the first of the
        highest Combat (a roster index), -1 none."""
        out = []
        for rows in self._bb["tagUnits"]:
            best = torch.full((self.B,), -1, dtype=torch.long, device=self.device)
            bestc = torch.full((self.B,), -1, dtype=torch.long, device=self.device)
            for u, c, t, v in rows:
                ok = torch.ones(self.B, dtype=torch.bool, device=self.device)
                if t >= 0:
                    ok = ok & self.barb_techs[:, t]
                if v >= 0:
                    ok = ok & self.barb_civics[:, v]
                take = ok & ((best < 0) | (c > bestc))
                best = torch.where(take, torch.full_like(best, u), best)
                bestc = torch.where(take, torch.full_like(bestc, c), bestc)
            out.append(best)
        return torch.stack(out, dim=1)

    def _barb_raise(self, mask: torch.Tensor, k: torch.Tensor, tag: torch.Tensor, radius: int, n: int,
                    scout: bool, track: bool = True) -> None:
        """`raise`: up to `n` units of each game's class `tag` (its best unit
        now) on the first free plots `radius` round its tribe `k`'s camp in
        ring order — no city on the plot, the unit's own domain
        (`tileFreeForUnit`) —, counted to the tribe's units (raised in its
        turn) or its scouts where `track`; a new scout has seen nothing."""
        if not bool(mask.count_nonzero()):
            return
        bidx = torch.arange(self.B, device=self.device)
        utype = self._barb_unit_for().gather(1, tag.clamp(min=0).unsqueeze(1)).squeeze(1)
        mask = mask & (utype >= 0)
        if not bool(mask.count_nonzero()):
            return
        plot = self.tribe_plot[bidx, k.clamp(min=0)].clamp(min=0)
        naval = self.unit_naval.take(utype.clamp(min=0, max=self.NU - 1))
        cart = self._ocean_open(torch.full((self.B,), BARB_SEAT, dtype=torch.long, device=self.device))
        L = 1 + 3 * radius * (radius + 1)
        cands = self._barb_ring[plot][:, :L]  # [B, L]
        cc = cands.clamp(min=0)
        ctr = self._centre_seat_plane().gather(1, cc) >= 0
        water = self.water.gather(1, cc)
        for _ in range(n):
            free = self._spot_free(cands, BARB_SEAT, naval_mask=naval, cart=cart)
            ok = (cands >= 0) & ~ctr & (water == naval.unsqueeze(1)) & free
            first = torch.where(ok, torch.arange(L, device=self.device), L).min(dim=1).values
            go = mask & (first < L)
            if not bool(go.count_nonzero()):
                return
            spot = cands.gather(1, first.clamp(max=L - 1).unsqueeze(1)).squeeze(1)
            before = self.next_slot.clone()
            landed = self._spawn_barb(go, spot, utype, cart=cart, naval_rows=naval)
            if track and bool(landed.count_nonzero()):
                rows = landed.nonzero(as_tuple=True)[0]
                self.barb_unit_tribe[rows, before[rows]] = k[rows]
                self.barb_unit_scout[rows, before[rows]] = scout
                if scout:
                    self.tribe_saw[rows, k[rows]] = False
                else:
                    self.barb_unit_fresh[rows, before[rows]] = True

    def _barb_living(self, k: torch.Tensor, scout: bool) -> torch.Tensor:
        """[B] long — the living units (or scouts) tribe `k` raised (`living`)."""
        lo, hi = self.POOL_LO["barb"], self.POOL_HI["barb"]
        alive = self.unit_alive[:, lo:hi]
        return (alive & (self.barb_unit_tribe == k.unsqueeze(1)) & (self.barb_unit_scout == scout)).sum(dim=1)

    # ------------------------------------------------------------- the camps

    def _barb_tribe_kind(self, plot: torch.Tensor) -> torch.Tensor:
        """[B] long — `tribeKindAt`: the first BarbarianTribes row the camp
        meets — a naval tribe an area under BARBARIAN islandPlots or a shore
        with four water plots round it, one no lake; a cavalry one an unowned
        Horses plot within its range; else melee."""
        bidx = torch.arange(self.B, device=self.device)
        p = plot.clamp(min=0)
        area = self.tile_area[bidx, p]
        size = (self.tile_area == area.unsqueeze(1)).sum(dim=1)
        nb = self.neigh[p]  # [B, 6]
        nbc = nb.clamp(min=0)
        wat = (nb >= 0) & self.wpass.gather(1, nbc)
        lake = self.terrain.gather(1, nbc) == int(self._bb["lakeTerrain"])
        kind = torch.full((self.B,), len(self._bb["tribes"]) - 1, dtype=torch.long, device=self.device)
        decided = torch.zeros(self.B, dtype=torch.bool, device=self.device)
        for i, (coastal, res, rng, _pct, _every, _sc, _me, _ra, _de) in enumerate(self._bb["tribes"]):
            if coastal:
                fits = ((area >= 0) & (size < self._bb["islandPlots"])) | (
                    (wat.sum(dim=1) >= self._bb["coastWater"]) & (wat & ~lake).any(dim=1))
            elif res >= 0:
                near = self.pair_dist[p] <= rng  # [B, T]
                fits = (near & (self.res_id == res) & (self.tile_seat < 0)).any(dim=1)
            else:
                fits = torch.ones(self.B, dtype=torch.bool, device=self.device)
            take = ~decided & fits
            kind = torch.where(take, torch.full_like(kind, i), kind)
            decided |= take
        return kind

    def _barb_found_tribe(self, mask: torch.Tensor, plot: torch.Tensor, kind: torch.Tensor,
                          name: torch.Tensor) -> torch.Tensor:
        """`foundTribe`: a tribe on the plot, its clocks at rest, its camp
        standing; [B] long the new tribe's slot."""
        k = self.n_tribes.clone()
        rows = mask.nonzero(as_tuple=True)[0]
        assert bool((k[rows] < self.KT).all()), "barbarian tribe slots exhausted — raise KT"
        self.tribe_plot[rows, k[rows]] = plot[rows]
        self.tribe_alive[rows, k[rows]] = True
        self.tribe_kind[rows, k[rows]] = kind[rows]
        self.tribe_name[rows, k[rows]] = name[rows]
        self.tribe_spawn[rows, k[rows]] = 0
        self.tribe_scoutc[rows, k[rows]] = 0
        self.tribe_bold[rows, k[rows]] = 0
        self.tribe_every[rows, k[rows]] = -1
        self.tribe_queue[rows, k[rows]] = -1
        self.tribe_raidq[rows, k[rows]] = -1
        self.tribe_assq[rows, k[rows]] = -1
        self.tribe_home_slot[rows, k[rows]] = -1
        self.tribe_home_id[rows, k[rows]] = -1
        self.tribe_home_resume[rows, k[rows]] = -1
        self.tribe_home_mu[rows, k[rows]] = False
        self.tribe_defender[rows, k[rows]] = -1
        self.tribe_home_seat[rows, k[rows]] = -1
        self.tribe_home_plot[rows, k[rows]] = -1
        self.tribe_raidp[rows, k[rows]] = -1
        self.tribe_ramp[rows, k[rows]] = -1
        self.tribe_saw[rows, k[rows]] = False
        self.tribe_op[rows, k[rows]] = 0
        self.tribe_op_seat[rows, k[rows]] = -1
        self.tribe_op_id[rows, k[rows]] = -1
        self.n_tribes[rows] += 1
        has = (self.camp_tile[rows] == plot[rows].unsqueeze(1)).any(dim=1)
        put = rows[~has]
        if put.numel():
            self.camp_tile[put, self.n_camps[put]] = plot[put]
            self.n_camps[put] += 1
            self._eff_version += 1  # a new outpost lowers its neighbours' appeal
        return k

    def _barb_raise_camp(self, mask: torch.Tensor, plot: torch.Tensor) -> None:
        """`raiseCamp`: the camp's tribe, named by "Barb Tribe Roll" over the
        kind's names no tribe took (else those only dead tribes took), raises
        its defender on the camp (`tribe_defender`) and its scouts within
        three plots; what the barbarians reveal round it is those units'
        looks."""
        if not bool(mask.count_nonzero()):
            return
        kind = self._barb_tribe_kind(plot)
        nk = int(self._bb["namesPerKind"])
        KT = self.KT
        slot = torch.arange(KT, device=self.device).unsqueeze(0) < self.n_tribes.unsqueeze(1)
        same = slot & (self.tribe_kind == kind.unsqueeze(1))  # [B, KT]
        names = torch.arange(nk, device=self.device)
        hit = same.unsqueeze(2) & (self.tribe_name.unsqueeze(2) == names.view(1, 1, nk))  # [B, KT, nk]
        used = hit.any(dim=1)
        used_alive = (hit & self.tribe_alive.unsqueeze(2)).any(dim=1)
        unused = ~used
        pool = torch.where(unused.any(dim=1, keepdim=True), unused, used & ~used_alive)
        cnt = pool.sum(dim=1)
        roll = self._rand_range(mask & (cnt > 0), cnt)
        pick = (pool.long().cumsum(dim=1) == (roll + 1).unsqueeze(1)) & pool
        name = torch.where(cnt > 0, pick.long().argmax(dim=1), torch.zeros_like(cnt))
        k = self._barb_found_tribe(mask, plot, kind, name)
        tr = self._bb["tribes"]
        dtag = torch.tensor([r[8] for r in tr], dtype=torch.long, device=self.device).take(kind)
        stag = torch.tensor([r[5] for r in tr], dtype=torch.long, device=self.device).take(kind)
        before = self.next_slot.clone()
        self._barb_raise(mask, k, dtag, 0, 1, scout=False, track=False)
        got = (self.next_slot > before).nonzero(as_tuple=True)[0]
        self.tribe_defender[got, k[got]] = before[got]
        self._barb_raise(mask, k, stag, 3, int(self._bb["maxScouts"]), scout=True)

    def _barb_camp_step(self) -> None:
        """`campStep` (0x14fcc0): the target, the first step's share, the
        scored regions, the weighed pick, the camps raised."""
        B, T = self.B, self.T
        bb = self._bb
        live = self._barb_majors_alive()
        nmaj = live.sum(dim=1)
        mx = bb["campsPerMajor"] * nmaj
        go = self.n_camps < mx
        if not bool(go.count_nonzero()):
            return
        seen_maj = self._barb_seen("majors")
        land = ~self.water
        nland = land.sum(dim=1)
        dark = (land & ~seen_maj).sum(dim=1)
        add = (mx * dark) // nland.clamp(min=1) - self.n_camps
        go = go & (add > 0)
        add = torch.where(self.barb_camps_begun, torch.ones_like(add), (add * bb["firstTurnPct"]) // 100)
        self.barb_camps_begun |= go
        go = go & (add > 0)
        if not bool(go.count_nonzero()):
            return
        seen = self._barb_seen("all")
        # the camp's ground: open land of its terrains, bare or under its
        # features, no resource, nothing built
        terr_ok = torch.zeros_like(land)
        for t in bb["campTerrains"]:
            terr_ok |= self.terrain == t
        feat_ok = self.feat_id < 0
        for f in bb["campFeatures"]:
            if f >= 0:
                feat_ok |= self.feat_id == f
        # no resource at all: the ground is asked for no player, who reads
        # every resource
        res_ok = self.res_id < 0
        built = (self.improvement >= 0) | self.tile_goody | (self.district >= 0) | (self.built_wonder >= 0)
        ground = land & ~self.tile_mountain & terr_ok & feat_ok & res_ok & ~built & (self.tile_seat < 0) & ~seen
        # no major's city nearer than the city distance; the farthest one in reach
        reach = max(bb["campDistCity"], bb["campDistCamp"])
        cc = self.city_center[:, : self.n_majors].reshape(B, -1)
        ca = self.city_alive[:, : self.n_majors].reshape(B, -1)
        far = torch.zeros(B, T, dtype=torch.long, device=self.device)
        bad = torch.zeros(B, T, dtype=torch.bool, device=self.device)
        for j in ca.any(dim=0).nonzero(as_tuple=True)[0].tolist():
            on = ca[:, j]
            d = self.pair_dist[cc[:, j].clamp(min=0)].to(torch.long)  # [B, T]
            inr = on.unsqueeze(1) & (d <= reach)
            bad |= inr & (d < bb["campDistCity"])
            far = torch.where(inr, torch.maximum(far, d), far)
        # no standing camp within the camp distance
        for j in range(self.camp_tile.shape[1]):
            ct = self.camp_tile[:, j]
            if not bool((ct >= 0).any()):
                continue
            bad |= (ct >= 0).unsqueeze(1) & (self.pair_dist[ct.clamp(min=0)].to(torch.long) <= bb["campDistCamp"])
        # the nearest and second-nearest tribe, dead ones too (-1 none)
        n1 = torch.full((B, T), -1, dtype=torch.long, device=self.device)
        n2 = torch.full((B, T), -1, dtype=torch.long, device=self.device)
        for j in range(int(self.n_tribes.max())):
            on = (j < self.n_tribes).unsqueeze(1)
            d = self.pair_dist[self.tribe_plot[:, j].clamp(min=0)].to(torch.long)
            nearer = on & ((n1 < 0) | (d < n1))
            second = on & ~nearer & ((n2 < 0) | (d < n2))
            n2 = torch.where(nearer, n1, torch.where(second, d, n2))
            n1 = torch.where(nearer, d, n1)
        # and the nearest camp ever raised (the manager's camp list), 0 before
        # the first: the nearest tribe again
        score = (n1 + n2 + n1.clamp(min=0)).clamp(min=0) + far
        cand = ground & ~bad
        # the regions (`Tile.region`) of more than regionMin plots, or on an
        # area (the region's first plot's) of more
        reg = self.tile_region
        R = int(reg.max()) + 1 if reg.numel() else 0
        if R <= 0:
            return
        size = torch.zeros(B, R, dtype=torch.long, device=self.device)
        size.scatter_add_(1, reg.clamp(min=0), (reg >= 0).long())
        ar = self.tile_area
        A = int(ar.max()) + 1 if ar.numel() else 0
        asize = torch.zeros(B, max(A, 1), dtype=torch.long, device=self.device)
        asize.scatter_add_(1, ar.clamp(min=0), (ar >= 0).long())
        idx = torch.arange(T, device=self.device).expand(B, T)
        first = torch.full((B, R), T, dtype=torch.long, device=self.device)
        first.scatter_reduce_(1, reg.clamp(min=0), torch.where(reg >= 0, idx, torch.full_like(idx, T)),
                              reduce="amin", include_self=True)
        rarea = ar.gather(1, first.clamp(max=T - 1))
        rasize = asize.gather(1, rarea.clamp(min=0))
        big = (size > bb["regionMin"]) | ((rarea >= 0) & (rasize > bb["regionMin"]))
        big = big.gather(1, reg.clamp(min=0))
        cand = cand & (reg >= 0) & big
        sc = torch.where(cand, score, torch.full_like(score, -1))
        best = torch.full((B, R), -1, dtype=torch.long, device=self.device)
        best.scatter_reduce_(1, reg.clamp(min=0), sc, reduce="amax", include_self=True)
        top = best.max(dim=1).values
        at_top = cand & (sc == top.unsqueeze(1)) & (top >= 0).unsqueeze(1)
        weights = torch.zeros(B, R, dtype=torch.long, device=self.device)
        weights.scatter_add_(1, reg.clamp(min=0), at_top.long())
        nadd = int(add[go].max())
        arR = torch.arange(R, device=self.device)
        for i in range(nadd):
            on = go & (i < add) & (weights.sum(dim=1) > 0)
            if not bool(on.count_nonzero()):
                break
            r = self._rand_weighted(on, weights)
            rc = r.clamp(min=0)
            n_in = weights.gather(1, rc.unsqueeze(1)).squeeze(1)
            idx = self._rand_range(on, n_in)
            inr = at_top & (reg == rc.unsqueeze(1))
            pick = inr & (inr.long().cumsum(dim=1) == (idx + 1).unsqueeze(1))
            plot = pick.long().argmax(dim=1)
            weights = torch.where(on.unsqueeze(1) & (arR.unsqueeze(0) == rc.unsqueeze(1)), torch.zeros_like(weights), weights)
            # laying more than one, a plot within the camp distance of a tribe is passed over
            close = torch.zeros(B, dtype=torch.bool, device=self.device)
            for j in range(int(self.n_tribes.max())):
                tp = self.tribe_plot[:, j]
                close |= (j < self.n_tribes) & (self.pair_dist[tp.clamp(min=0), plot].to(torch.long) <= bb["campDistCamp"])
            raise_m = on & ~((add > 1) & close)
            self._barb_raise_camp(raise_m, plot)

    # ------------------------------------------------------------ the tribes

    def _barb_kind_col(self, col: int, kind: torch.Tensor) -> torch.Tensor:
        """[B] long — column `col` of each game's tribe kind's BarbarianTribes row."""
        return torch.tensor([r[col] for r in self._bb["tribes"]], dtype=torch.long, device=self.device).take(kind)

    def _barb_raid_boldness(self, k: int) -> torch.Tensor:
        """[B] long — `raidBoldness`: tribe `k`'s name's own RaidingBoldness,
        else its kind's."""
        rb = torch.full((self.B,), int(self._bb["raidBoldness"]), dtype=torch.long, device=self.device)
        for nk, nn, nv in self._bb["nameRaidBoldness"]:
            if nv >= 0:
                rb = torch.where((self.tribe_kind[:, k] == nk) & (self.tribe_name[:, k] == nn), torch.full_like(rb, nv), rb)
        return rb

    def _barb_pop(self, q: torch.Tensor, rows: torch.Tensor, k: int) -> None:
        """the front of tribe `k`'s list `q` dropped in the games `rows`."""
        if rows.numel():
            q[rows, k, :-1] = q[rows, k, 1:].clone()
            q[rows, k, -1] = -1

    def _barb_push(self, q: torch.Tensor, mask: torch.Tensor, k: int, val: torch.Tensor) -> None:
        """`val` to the back of tribe `k`'s list `q` in the games `mask` (a
        full list keeps what it holds)."""
        rows = mask.nonzero(as_tuple=True)[0]
        if not rows.numel():
            return
        L = q.shape[2]
        free = q[rows, k] < 0
        at = torch.where(free, torch.arange(L, device=self.device), L).min(dim=1).values
        ok = at < L
        q[rows[ok], k, at[ok]] = val[rows[ok]]

    def _barb_tribe_turn(self, k: int) -> None:
        """`tribeTurn` for the tribes in slot `k` that live: the spawn clock at
        its interval (the operation's while it recruits) raising the unit the
        operation asked for, else the ranged roll under NumMilitary; the
        scout's wait; the Boldness; a spent operation forgotten; the assault,
        else the raid, the tribe waits to start."""
        bb = self._bb
        on = self.tribe_alive[:, k] & (k < self.n_tribes)
        if not bool(on.count_nonzero()):
            return
        kk = torch.full((self.B,), k, dtype=torch.long, device=self.device)
        kind = self.tribe_kind[:, k]
        mine = self.barb_unit_tribe == k
        self.barb_unit_fresh &= ~(on.unsqueeze(1) & mine)
        every = torch.where(self.tribe_every[:, k] >= 0, self.tribe_every[:, k], self._barb_kind_col(4, kind))
        self.tribe_spawn[:, k] += on.long()
        hit = on & (self.tribe_spawn[:, k] >= every)
        self.tribe_spawn[:, k] = torch.where(hit, torch.zeros_like(every), self.tribe_spawn[:, k])
        q0 = self.tribe_queue[:, k, 0]
        qhit = hit & (q0 >= 0)
        if bool(qhit.count_nonzero()):
            self._barb_raise(qhit, kk, q0, 1, 1, scout=False)
            self._barb_pop(self.tribe_queue, qhit.nonzero(as_tuple=True)[0], k)
        room = hit & ~qhit & (self._barb_living(kk, False) < bb["maxUnits"])
        pct = self._barb_kind_col(3, kind)
        for nk, nn, np_ in bb["nameRangedPct"]:
            if np_ >= 0:
                pct = torch.where((kind == nk) & (self.tribe_name[:, k] == nn), torch.full_like(pct, np_), pct)
        roll = self._rand_range(room, 100)
        ranged = roll < pct
        tag = torch.where(ranged, self._barb_kind_col(7, kind), self._barb_kind_col(6, kind))
        self._barb_raise(room, kk, tag, 1, 1, scout=False)
        wait = on & ~hit & (self._barb_living(kk, True) < bb["maxScouts"])
        self.tribe_scoutc[:, k] += wait.long()
        due = wait & (self.tribe_scoutc[:, k] >= bb["scoutWait"])
        self._barb_raise(due, kk, self._barb_kind_col(5, kind), 2, 1, scout=True)
        self.tribe_scoutc[:, k] = torch.where(due, torch.zeros_like(self.tribe_scoutc[:, k]), self.tribe_scoutc[:, k])
        self.tribe_bold[:, k] += on.long() * int(bb["boldTurn"])
        # an operation stands until its tree ends
        gone = on & (self.tribe_op[:, k] > 0) & self.tribe_op_done[:, k]
        self.tribe_op[:, k] = torch.where(gone, torch.zeros_like(self.tribe_op[:, k]), self.tribe_op[:, k])
        # the operation forgotten, its members are their tribe's again
        self.barb_unit_op &= ~(gone.unsqueeze(1) & (self.barb_unit_tribe == k))
        op = self.tribe_op[:, k]
        bold = self.tribe_bold[:, k]
        first = on & (self.tribe_assq[:, k, 0] >= 0) & (op != 2)
        start_a = first & (bold >= int(bb["assaultBoldness"])) & (op == 0)
        second = on & ~first & (self.tribe_raidq[:, k, 0] >= 0) & (op != 1)
        start_r = second & (bold >= self._barb_raid_boldness(k)) & (op == 0)
        if bool(start_a.count_nonzero()):
            self._barb_start_op(start_a, k, True, self.tribe_assq[:, k, 0], self.tribe_assp[:, k, 0])
            self._barb_pop(self.tribe_assq, start_a.nonzero(as_tuple=True)[0], k)
            self._barb_pop(self.tribe_assp, start_a.nonzero(as_tuple=True)[0], k)
        if bool(start_r.count_nonzero()):
            self._barb_start_op(start_r, k, False, self.tribe_raidq[:, k, 0], self.tribe_raidp[:, k, 0])
            self._barb_pop(self.tribe_raidq, start_r.nonzero(as_tuple=True)[0], k)
            self._barb_pop(self.tribe_raidp, start_r.nonzero(as_tuple=True)[0], k)

    # ------------------------------------------------------- the operations

    def _barb_scout_look(self, on: torch.Tensor, k: int) -> None:
        """`barbScoutLook` for tribe `k`'s living scout: the owned plots newly
        visible to the barbarian player by its sight (in it now, not at its
        last look, seen by no other unit of theirs) holding an improvement or
        a district (a wonder among them), in plot order — per major the first, once its throttle
        allows, sends the scout home when none walks yet and spares the major
        further reports."""
        sc = self.barb_unit_alive & (self.barb_unit_tribe == k) & self.barb_unit_scout
        has = on & sc.any(dim=1)
        rows = has.nonzero(as_tuple=True)[0]
        if not rows.numel():
            return
        slot = sc[rows].long().argmax(dim=1)
        ut = self.barb_unit_type[rows, slot]
        pr = self.barb_unit_promos[rows, slot]
        st = torch.full_like(ut, BARB_SEAT)
        rad = self._unit_sight(ut, pr, st, rows)
        vis = self._los_disk(rows, self.barb_unit_tile[rows, slot].clamp(min=0), rad, self._sees_through(ut, pr))
        ts = self.tile_seat[rows]
        now = vis & (ts >= 0) & ((ts < BARB_SEAT) | (ts == FREE_SEAT))
        new = now & ~self.tribe_saw[rows, k]
        self.tribe_saw[rows, k] = now
        new &= ~self._barb_others_see(rows, slot, new)
        T = self.T
        # the wonders' plots, built or placed in a queue (the `city_wonder`
        # registry): DISTRICT_WONDER's
        wr = self.city_wonder[rows].reshape(rows.numel(), -1)
        wpl = torch.zeros(rows.numel(), T + 1, dtype=torch.bool, device=self.device)
        wpl.scatter_(1, torch.where(wr >= 0, wr, T), True)
        new &= (self.improvement[rows] >= 0) | (self.district[rows] >= 0) | self._centre_plane()[rows] | wpl[:, :T]
        ar = torch.arange(T, device=self.device)
        best = torch.full((rows.numel(),), T, dtype=torch.long, device=self.device)
        best_g = torch.full((rows.numel(),), -1, dtype=torch.long, device=self.device)
        for g in range(self.n_majors):
            ng = new & (ts == g)
            first = torch.where(ng, ar, T).min(dim=1).values
            ok = (first < T) & (int(self.turn) >= self.barb_spot_next[rows, g])
            self.barb_spot_next[rows, g] = torch.where(
                ok, torch.full_like(first, int(self.turn) + int(self._bb["spotThrottle"])), self.barb_spot_next[rows, g])
            take = ok & (first < best)
            best = torch.where(take, first, best)
            best_g = torch.where(take, torch.full_like(best_g, g), best_g)
        go = (best_g >= 0) & (self.tribe_home_slot[rows, k] == -1)
        r2 = rows[go]
        # the scout's tree starts (0x1485c0): its id the player's next
        start = torch.zeros(self.B, dtype=torch.bool, device=self.device)
        start[r2] = True
        nid = self._bop_next_id(start)
        self.tribe_home_id[r2, k] = nid[r2]
        self.tribe_home_resume[r2, k] = -1
        self.tribe_home_mu[r2, k] = False
        self.tribe_home_slot[r2, k] = slot[go]
        self.tribe_home_seat[r2, k] = best_g[go]
        # the city the plot seen belongs to (`cityCentreOf`)
        bt = best[go]
        cid = self.tile_city[r2, bt]
        g2 = best_g[go]
        hit = (self.city_id[r2, g2] == cid.unsqueeze(1)) & self.city_alive[r2, g2]
        cen = torch.where(hit, self.city_center[r2, g2], torch.full_like(self.city_center[r2, g2], self.T)).min(dim=1).values
        self.tribe_home_plot[r2, k] = torch.where(cen < self.T, cen, torch.full_like(cen, -1))

    def _barb_others_see(self, rows: torch.Tensor, slot: torch.Tensor, plots: torch.Tensor) -> torch.Tensor:
        """[N, T] of `plots` [N, T], those a barbarian unit other than the one
        at local slot `slot` [N] sees where it stands (in games `rows`)"""
        out = torch.zeros_like(plots)
        if not bool(plots.any()):
            return out
        live = self.barb_unit_alive[rows] & (self.barb_unit_seat[rows] == BARB_SEAT) & (self.barb_unit_tile[rows] >= 0)
        live[torch.arange(rows.numel(), device=self.device), slot] = False
        for u in live.any(dim=0).nonzero(as_tuple=True)[0].tolist():
            m = live[:, u]
            ri = m.nonzero(as_tuple=True)[0]
            r = rows[ri]
            ut, pr = self.barb_unit_type[r, u], self.barb_unit_promos[r, u]
            rad = self._unit_sight(ut, pr, torch.full_like(ut, BARB_SEAT), r)
            out[ri] |= self._los_disk(r, self.barb_unit_tile[r, u], rad, self._sees_through(ut, pr)) & plots[ri]
        return out

    def _barbarian_scouts(self) -> None:
        """`barbarianScouts`: each living tribe's scout looks where it stands."""
        for k in range(int(self.n_tribes.max())):
            on = self.tribe_alive[:, k] & (k < self.n_tribes)
            if not bool(on.count_nonzero()):
                continue
            self._barb_scout_look(on, k)

    def _barb_battle_boldness(self, live: torch.Tensor, a_kind: str, u: int, a_seat: torch.Tensor,
                              d_slot: torch.Tensor, d_is_barb: torch.Tensor,
                              a_died: torch.Tensor, d_died: torch.Tensor) -> None:
        """`barbBattleBoldness`: the defender dead, else the attacker — an
        enemy a tribe's unit killed raises its tribe's Boldness, a tribe's
        unit or scout lost lowers it."""
        kd = live & d_died
        ka = live & ~d_died & a_died
        if not bool((kd | ka).count_nonzero()):
            return
        bidx = torch.arange(self.B, device=self.device)
        lo, hi = self.POOL_LO["barb"], self.POOL_HI["barb"]
        neg = torch.full((self.B,), -1, dtype=torch.long, device=self.device)
        a_barb = a_seat == BARB_SEAT
        if a_kind == "barb":
            a_tr, a_sc = self.barb_unit_tribe[:, u], self.barb_unit_scout[:, u]
        else:
            a_tr, a_sc = neg, torch.zeros_like(kd)
        d_in = (d_slot >= lo) & (d_slot < hi)
        dl = (d_slot - lo).clamp(min=0, max=hi - lo - 1)
        d_tr = torch.where(d_in, self.barb_unit_tribe[bidx, dl], neg)
        d_sc = d_in & self.barb_unit_scout[bidx, dl]
        bb = self._bb
        lost = lambda sc: torch.where(sc, int(bb["boldScoutLost"]), int(bb["boldUnitLost"]))  # noqa: E731
        for m, tr, delta in (
            (kd & a_barb & ~d_is_barb, a_tr, torch.full_like(neg, int(bb["boldKill"]))),
            (kd & d_is_barb & ~a_barb, d_tr, lost(d_sc)),
            (ka & d_is_barb & ~a_barb, d_tr, torch.full_like(neg, int(bb["boldKill"]))),
            (ka & a_barb & ~d_is_barb, a_tr, lost(a_sc)),
        ):
            m = m & (tr >= 0)
            rows = m.nonzero(as_tuple=True)[0]
            if rows.numel():
                self.tribe_bold[rows, tr[rows]] += delta[rows]

    def _barbarian_rules(self) -> None:
        """`barbarianRules`: the techs, the camp step, each living tribe's turn
        in the tribes' order, then the military AI's part of the turn (its
        operations refreshed, one a tribe started this turn among them,
        `_barb_ops_refresh`)."""
        self._barb_tech_step()
        self._barb_camp_step()
        for k in range(int(self.n_tribes.max())):
            self._barb_tribe_turn(k)
        self._barb_ops_refresh()
