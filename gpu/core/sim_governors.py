"""THE GOVERNOR ROSTER — the batched mirror of `cpu/core/governors.ts`.

Seven agents per seat row, each appointed with a Governor Title, assigned to
one city, and promoted with further titles. The roster is STATE carried into
the turn, which is what lets the city walk read a governor-conditional fact
without asking loyalty (which reads the amenity tier, which reads the walk).

CIV6 (Governor): the Loyalty boost "transfers immediately" on assignment while
the ABILITIES wait out the establishment clock, so a city can hold a governor
for loyalty and pay nothing else for several turns.
"""

from __future__ import annotations

import torch

from .simbase import js_round


class SimGovernors:
    # ---------------------------------------------------------------- titles

    def _governor_titles_earned(self, row: int) -> torch.Tensor:
        """[B] long — the thirteen named civics, plus the Government Plaza and
        every building in it. A pillaged Plaza pays none of them."""
        civics = self.civ_civics[:, row]  # [B, nC] bool
        keep = self._gov_title_civics[self._gov_title_civics >= 0]
        out = civics[:, keep].sum(dim=1).long() if keep.numel() else \
            torch.zeros(self.B, dtype=torch.long, device=self.device)
        return out + self._granted_titles(row)

    def _governor_titles_spent(self, row: int) -> torch.Tensor:
        """[B] long — one per appointment plus one per promotion held."""
        ap = self.civ_gov_appointed[:, row]                       # [B, NG]
        bits = self._popcount(self.civ_gov_promos[:, row])        # [B, NG]
        return (ap.long() + torch.where(ap, bits, torch.zeros_like(bits))).sum(dim=1)

    @staticmethod
    def _popcount(x: torch.Tensor) -> torch.Tensor:
        """Set bits of a non-negative long tensor — Kernighan, bounded by the
        widest promotion mask this catalog can hold."""
        out = torch.zeros_like(x)
        v = x.clone()
        while bool((v != 0).any()):
            out = out + (v & 1)
            v = v >> 1
        return out

    # ------------------------------------------------------------ the phase

    def _governor_phase(self, row: int) -> None:
        """The seat's governor turn, at the top of its own turn and before
        anything reads the roster: spend the available titles, seat every idle
        governor, then tick both clocks.

        The CHOICE is a deterministic heuristic both engines mirror exactly —
        appoint in catalog order, promote the first legal promotion in catalog
        order, and seat an idle governor in the seat's lowest-loyalty
        ungoverned city (quantized milli loyalty, ties by array position)."""
        NG = self.n_governors
        if NG == 0:
            return
        live = self.civ_alive[:, row]
        if not bool(live.any()):
            return

        titles = (self._governor_titles_earned(row) - self._governor_titles_spent(row)).clamp(min=0)
        titles = torch.where(live, titles, torch.zeros_like(titles))
        _fp = self._governor_appeal_fingerprint(row)
        self._governor_spend(row, titles)
        self._governor_post_minor(row, live)
        self._governor_seat(row, live)
        self._governor_tick(row)
        # Appointing, promoting, seating and the establishment clock all move
        # `_gov_appeal_plane`, and `_tile_appeal` is version-cached — without
        # this the appeal a governor grants arrives a turn late, and the
        # Preserve band it pushes a tile into arrives with it. The fingerprint
        # keeps a quiet turn from invalidating anything.
        if self._gov_appeal_any and int(_fp) != int(self._governor_appeal_fingerprint(row)):
            self._eff_version += 1
        # A posting is an envoy count, so the minors' stored answer moves with
        # it — `resolveSuzerains`' position.
        if self.S:
            self._cs_resolve_suzerain()

    def _governor_appeal_fingerprint(self, row: int) -> torch.Tensor:
        """A scalar that moves whenever this row's governors could grant a
        different appeal: who is appointed, what they hold, where they sit and
        how much of the establishment clock is left."""
        return (self.civ_gov_appointed[:, row].long().sum()
                + self.civ_gov_promos[:, row].sum()
                + self.civ_gov_city[:, row].sum()
                + self.civ_gov_minor[:, row].sum()
                + self.civ_gov_establish[:, row].sum())

    def _governor_spend(self, row: int, titles: torch.Tensor) -> None:
        """Spend every available title: a title buys an appointment while one
        governor is unappointed, otherwise the first legal promotion in catalog
        order. The DEFAULT ability (tier 0) rides the appointment and is never
        bought."""
        dev, NG, NP = self.device, self.n_governors, self.n_gov_promos
        ap = self.civ_gov_appointed[:, row]
        pr = self.civ_gov_promos[:, row]
        gidx = torch.arange(NG, device=dev)
        pidx = torch.arange(NP, device=dev)
        # promotion -> its governor slot, as a [NG, NP] membership grid
        mine = self._gpromo_gov.reshape(1, -1) == gidx.reshape(-1, 1)
        buyable = mine & (self._gpromo_tier.reshape(1, -1) > 0)

        for _ in range(int(titles.max().item()) if titles.numel() else 0):
            act = titles > 0
            if not bool(act.any()):
                break
            # (a) APPOINT the first unappointed governor
            unap = act.unsqueeze(1) & ~ap
            take_ap = unap.any(dim=1)
            first = torch.where(take_ap, unap.long().argmax(dim=1), torch.full((self.B,), -1, device=dev))
            if bool(take_ap.any()):
                rows = take_ap.nonzero(as_tuple=True)[0]
                ap[rows, first[rows]] = True
                self._governance_doctrine(row, rows, first[rows])
            # (b) otherwise PROMOTE — the first legal promotion, scanning
            #     governors in catalog order and promotions inside each
            want = act & ~take_ap
            any_legal = torch.zeros_like(act)
            if bool(want.any()):
                have = ((pr.unsqueeze(2) >> pidx.reshape(1, 1, -1)) & 1).bool()  # [B, NG, NP]
                # a prerequisite is a bitmask over the promotion list: at least
                # ONE of the named promotions must be held (0 = none required)
                req = self._gpromo_req.reshape(1, 1, -1)
                met = (req == 0) | ((pr.unsqueeze(2) & req) != 0)
                legal = ap.unsqueeze(2) & buyable.unsqueeze(0) & ~have & met
                flat = legal.reshape(self.B, NG * NP)
                any_legal = want & flat.any(dim=1)
                if bool(any_legal.any()):
                    rows = any_legal.nonzero(as_tuple=True)[0]
                    pick = flat[rows].long().argmax(dim=1)
                    g, p = pick // NP, pick % NP
                    pr[rows, g] = pr[rows, g] | (torch.ones_like(p) << p)
                    self._governance_doctrine(row, rows, g)
            # a row that bought nothing has nothing left to buy: TS breaks out
            # of the whole spend loop there, so its unspent titles simply stay
            spent = take_ap | any_legal
            titles = torch.where(spent, titles - 1, torch.zeros_like(titles))

    def _governance_doctrine(self, row: int, rows: torch.Tensor, governor: torch.Tensor) -> None:
        """CIV6 (Governance Doctrine, A): "Appointing and promoting a Governor
        of this type yields 15 Diplomatic Favor"."""
        out, tgt = self._congress_by_id("GOVERNANCE_DOCTRINE")
        pay = (out[rows] == 0) & (tgt[rows] == governor)
        if bool(pay.any()):
            hit = rows[pay]
            self.civ_diplo_favor[hit, row] = self.civ_diplo_favor[hit, row] + self._gov_doctrine_favor

    def _minor_gov_row(self, row: int, key: str) -> torch.Tensor:
        """[B, S] f64 — one governor channel, summed over whatever this seat has
        ESTABLISHED at each city-state. `minorGovernorEffects`' twin: the
        DEFAULT ability rides the appointment and a posting still establishing
        pays nothing."""
        B, S, dev = self.B, self.S, self.device
        out = torch.zeros(B, max(S, 1), dtype=torch.float64, device=dev)
        if S == 0 or self.n_governors == 0 or key not in self._gpromo:
            return out
        tab = self._gpromo[key]
        pidx = torch.arange(self.n_gov_promos, device=dev)
        cols = torch.arange(S, device=dev).reshape(1, -1)
        for g in range(self.n_governors):
            if not bool(self._gov_minor_ok[g]):
                continue
            at = self.civ_gov_minor[:, row, g]
            on = (self.civ_gov_appointed[:, row, g] & (at >= 0)
                  & (self.civ_gov_establish[:, row, g] <= 0))
            if not bool(on.any()):
                continue
            held = ((self.civ_gov_promos[:, row, g].unsqueeze(1) >> pidx.reshape(1, -1)) & 1).bool()
            val = (tab.reshape(1, -1) * held.double()).sum(dim=1) + tab[int(self._gov_base_promo[g])]
            out = out + (on.unsqueeze(1) & (cols == at.unsqueeze(1))).double() * val.unsqueeze(1)
        return out

    def _envoys_with(self, row: int, raw: torch.Tensor) -> torch.Tensor:
        """[B, S] long — `envoysWith`'s twin: a raw envoy count plus whatever a
        posted governor is worth. CIV6 (Messenger): she "acts as 2 Envoys";
        (Puppeteer) "doubles the number of Envoys you have there" — she is part
        of the number she doubles."""
        if self.S == 0 or self.n_governors == 0:
            return raw
        n = raw + self._minor_gov_row(row, "envoysAtMinor").long()
        return torch.where(self._minor_gov_row(row, "envoyDoubleAtMinor") > 0, n * 2, n)

    def _envoys_here(self, row: int) -> torch.Tensor:
        """[B, S] long — `envoysHere`'s twin, the count every question about who
        LEADS and what a seat has EARNED here asks."""
        return self._envoys_with(row, self.seat_citystate_envoys[:, row].to(torch.long))

    def _envoys_here_all(self) -> torch.Tensor:
        """[B, majors, S] long — the effective count for every seat at once,
        which is what both halves of the suzerain contest weigh."""
        env = self.seat_citystate_envoys[:, : self.n_majors].to(torch.long)
        if self.S == 0 or self.n_governors == 0 or not bool((self.civ_gov_minor >= 0).any()):
            return env
        return torch.stack([self._envoys_here(r) for r in range(self.n_majors)], dim=1)

    def _governor_post_minor(self, row: int, live: torch.Tensor) -> None:
        """CIV6 (Amani, Messenger): "Can be assigned to a City-state" — she is
        the only governor the catalog sends abroad, and she goes before the
        cities are handed out. WHICH minor is this model's own line, like every
        other governor choice here: the one where the seat already holds the
        most envoys, since that is where her two and Puppeteer's doubling decide
        a suzerainty. Ties take the lowest roster index."""
        S, dev = self.S, self.device
        if S == 0 or self.n_governors == 0:
            return
        env = self.seat_citystate_envoys[:, row, :S].to(torch.long)
        ok = self.citystate_alive[:, :S] & self.seat_citystate_met[:, row, :S]
        key = torch.where(ok, env * S - torch.arange(S, device=dev).reshape(1, -1),
                          torch.full_like(env, -(1 << 40)))
        pick = key.argmax(dim=1)
        for g in range(self.n_governors):
            if not bool(self._gov_minor_ok[g]):
                continue
            idle = (live & self.civ_gov_appointed[:, row, g] & (self.civ_gov_city[:, row, g] < 0)
                    & (self.civ_gov_minor[:, row, g] < 0) & (self.civ_gov_out[:, row, g] <= 0)
                    & ok.any(dim=1))
            if not bool(idle.any()):
                continue
            rows = idle.nonzero(as_tuple=True)[0]
            self.civ_gov_minor[rows, row, g] = pick[rows]
            self.civ_gov_establish[rows, row, g] = self._gov_establish[g]

    def _governor_seat(self, row: int, live: torch.Tensor) -> None:
        """Seat every idle governor in the lowest-loyalty ungoverned city. A
        city already holding one is not a candidate, and a neutralized governor
        "cannot be assigned to any city"."""
        dev, NG, RC = self.device, self.n_governors, self.RC
        ap = self.civ_gov_appointed[:, row]
        city = self.civ_gov_city[:, row]
        est = self.civ_gov_establish[:, row]
        out = self.civ_gov_out[:, row]
        alive = self.city_alive[:, row]                    # [B, RC]
        ids = self.city_id[:, row]                         # [B, RC]

        # the cities already taken, as a slot mask
        taken = torch.zeros(self.B, RC, dtype=torch.bool, device=dev)
        for g in range(NG):
            has = ap[:, g] & (city[:, g] >= 0)
            taken |= has.unsqueeze(1) & (ids == city[:, g].unsqueeze(1)) & alive

        q = js_round(self.city_loyalty[:, row] * 1000).long()
        for g in range(NG):
            idle = (live & ap[:, g] & (city[:, g] < 0) & (out[:, g] <= 0)
                    & (self.civ_gov_minor[:, row, g] < 0))
            if not bool(idle.any()):
                continue
            free = alive & ~taken
            key = torch.where(free, q * RC + torch.arange(RC, device=dev).reshape(1, -1),
                              torch.full_like(q, 1 << 40))
            pick = key.argmin(dim=1)
            got = idle & free.any(dim=1)
            if not bool(got.any()):
                continue
            rows = got.nonzero(as_tuple=True)[0]
            sl = pick[rows]
            city[rows, g] = ids[rows, sl]
            est[rows, g] = self._gov_establish[g]
            taken[rows, sl] = True

    def _governor_tick(self, row: int) -> None:
        """Both clocks, and the governor whose city is gone goes back to the
        Palace."""
        NG = self.n_governors
        ap = self.civ_gov_appointed[:, row]
        city = self.civ_gov_city[:, row]
        est = self.civ_gov_establish[:, row]
        out = self.civ_gov_out[:, row]
        alive = self.city_alive[:, row]
        ids = self.city_id[:, row]
        minor = self.civ_gov_minor[:, row]
        S = self.S
        for g in range(NG):
            live_g = ap[:, g]
            out[:, g] = torch.where(live_g & (out[:, g] > 0), out[:, g] - 1, out[:, g])
            seated = live_g & (city[:, g] >= 0)
            still = (alive & (ids == city[:, g].unsqueeze(1))).any(dim=1)
            gone = seated & ~still
            city[:, g] = torch.where(gone, torch.full_like(city[:, g], -1), city[:, g])
            est[:, g] = torch.where(gone, torch.zeros_like(est[:, g]), est[:, g])
            # ...and a governor whose MINOR is gone comes home too: a conquered
            # city-state leaves the roster entirely.
            posted = live_g & (minor[:, g] >= 0)
            if S > 0:
                mstill = self.citystate_alive[:, :S].gather(
                    1, minor[:, g].clamp(min=0, max=S - 1).unsqueeze(1)).squeeze(1)
            else:
                mstill = torch.zeros_like(posted)
            mgone = posted & ~mstill
            minor[:, g] = torch.where(mgone, torch.full_like(minor[:, g], -1), minor[:, g])
            est[:, g] = torch.where(mgone, torch.zeros_like(est[:, g]), est[:, g])
            ticking = ((seated & still) | (posted & mstill)) & (est[:, g] > 0)
            est[:, g] = torch.where(ticking, est[:, g] - 1, est[:, g])

    def neutralize_governor(self, b: int, row: int, g: int, turns: int) -> None:
        """CIV6 (Neutralize Governor / Governance Doctrine B): the governor
        leaves the city and cannot be assigned again until the clock runs
        out."""
        self.civ_gov_city[b, row, g] = -1
        self.civ_gov_minor[b, row, g] = -1
        self.civ_gov_establish[b, row, g] = 0
        self.civ_gov_out[b, row, g] = max(int(self.civ_gov_out[b, row, g].item()), turns)
        if self._gov_appeal_any:
            self._eff_version += 1  # the appeal it granted leaves with it

    # ------------------------------------------------------------- the read

    def _governor_at(self, row: int) -> torch.Tensor:
        """[B, RC] long — the governor index seated in each city slot, -1 where
        none is. A neutralized governor holds no city, and the LOWEST index
        wins a slot two of them somehow claim.

        One [B, NG, RC] test rather than a walk of the roster: this is the
        widest-called read in the seat phase, and every ability channel is
        derived from it."""
        dev, NG, RC = self.device, self.n_governors, self.RC
        if NG == 0:
            return torch.full((self.B, RC), -1, dtype=torch.long, device=dev)
        live = (self.civ_gov_appointed[:, row] & (self.civ_gov_out[:, row] <= 0)).unsqueeze(2)
        holds = (live & self.city_alive[:, row].unsqueeze(1)
                 & (self.city_id[:, row].unsqueeze(1) == self.civ_gov_city[:, row].unsqueeze(2)))
        g = torch.arange(NG, device=dev).reshape(1, NG, 1).expand_as(holds)
        best = torch.where(holds, g, torch.full_like(g, NG)).amin(dim=1)
        return torch.where(best < NG, best, torch.full_like(best, -1))

    def _governor_established(self, row: int, at: torch.Tensor | None = None) -> torch.Tensor:
        """[B, RC] bool — the city slots whose governor has finished
        establishing; the channel every ABILITY rides. Pass `at` where the
        caller already holds it — the derivation is not free."""
        at = self._governor_at(row) if at is None else at
        if self.n_governors == 0:
            return torch.zeros_like(at, dtype=torch.bool)
        est = self.civ_gov_establish[:, row].gather(1, at.clamp(min=0))
        return (at >= 0) & (est <= 0)

    def _governor_mask(self, row: int) -> torch.Tensor:
        """[B, RC, NP] bool — the promotion rows an established governor pays
        in each city slot, its DEFAULT ability included."""
        dev, NP, RC = self.device, self.n_gov_promos, self.RC
        at = self._governor_at(row)
        est = self._governor_established(row, at)
        out = torch.zeros(self.B, RC, NP, dtype=torch.bool, device=dev)
        if NP == 0:
            return out
        held = self.civ_gov_promos[:, row].gather(1, at.clamp(min=0))  # [B, RC]
        pidx = torch.arange(NP, device=dev).reshape(1, 1, -1)
        out = ((held.unsqueeze(2) >> pidx) & 1).bool()
        base = self._gov_base_promo[at.clamp(min=0)]                   # [B, RC]
        out = out | (pidx == base.unsqueeze(2))
        return out & est.unsqueeze(2)

    def _governor_sum(self, row: int, channel: str) -> torch.Tensor:
        """[B, RC] f64 — one ADDITIVE promotion channel, summed per city."""
        col = self._gpromo.get(channel)
        if col is None:
            return torch.zeros(self.B, self.RC, dtype=torch.float64, device=self.device)
        return torch.einsum("bjn,n->bj", self._governor_mask(row).double(), col)

    def _governor_mult(self, row: int, channel: str) -> torch.Tensor:
        """[B, RC] f64 — one MULTIPLICATIVE promotion channel, per city. A row
        the mask does not hold contributes its identity 1."""
        col = self._gpromo.get(channel)
        if col is None:
            return torch.ones(self.B, self.RC, dtype=torch.float64, device=self.device)
        m = self._governor_mask(row)
        return torch.where(m, col.reshape(1, 1, -1), torch.ones_like(col).reshape(1, 1, -1)).prod(dim=2)

    def _governor_flag(self, row: int, channel: str) -> torch.Tensor:
        """[B, RC] bool — is a promotion FLAG set by this city's governor?"""
        col = self._gpromo.get(channel)
        if col is None:
            return torch.zeros(self.B, self.RC, dtype=torch.bool, device=self.device)
        return (self._governor_mask(row) & (col > 0).reshape(1, 1, -1)).any(dim=2)

    def _governor_vec(self, row: int, channel: str) -> torch.Tensor:
        """[B, RC, K] f64 — one VECTOR channel (yields, adjacency), summed."""
        col = self._gpromo.get(channel)
        if col is None:
            return torch.zeros(self.B, self.RC, 1, dtype=torch.float64, device=self.device)
        return torch.einsum("bjn,nk->bjk", self._governor_mask(row).double(), col)

    def _governor_vec_mult(self, row: int, channel: str) -> torch.Tensor:
        """[B, RC, K] f64 — one VECTOR channel multiplied (yieldMult)."""
        col = self._gpromo.get(channel)
        if col is None:
            return torch.ones(self.B, self.RC, 1, dtype=torch.float64, device=self.device)
        m = self._governor_mask(row).unsqueeze(3)
        return torch.where(m, col.reshape(1, 1, *col.shape), torch.ones_like(col).reshape(1, 1, *col.shape)).prod(dim=2)

    def _governor_tile_sum(self, row: int, channel: str) -> torch.Tensor:
        """[B, T] f64 — an additive channel spread to the TILES of the city
        that pays it (the promotions written "in tiles of this city")."""
        slot = self.city_slot_at(row)
        per = self._governor_sum(row, channel)
        return torch.where(slot >= 0, per.gather(1, slot.clamp(min=0)), torch.zeros_like(per[:, :1]))

    def _governor_tile_mult(self, row: int, channel: str) -> torch.Tensor:
        """[B, T] f64 — the multiplicative twin of `_governor_tile_sum`."""
        slot = self.city_slot_at(row)
        per = self._governor_mult(row, channel)
        return torch.where(slot >= 0, per.gather(1, slot.clamp(min=0)), torch.ones_like(per[:, :1]))

    def _governor_tile_flag(self, row: int, channel: str) -> torch.Tensor:
        """[B, T] bool — the flag twin of `_governor_tile_sum`."""
        slot = self.city_slot_at(row)
        per = self._governor_flag(row, channel)
        return (slot >= 0) & per.gather(1, slot.clamp(min=0))

    def _unimproved_feature(self) -> torch.Tensor:
        """[B, T] bool — a tile still carrying a FEATURE and no improvement,
        which is what Forestry Management counts and stands beside."""
        return (self.feat_id >= 0) & ~self.feat_stripped & (self.improvement < 0)

    def _gov_appeal_plane(self) -> torch.Tensor:
        """[B, T] long — CIV6 (Forestry Management): "Tiles adjacent to
        unimproved features receive +1 Appeal in this city." Summed over the
        majors, a tile belonging to at most one of them."""
        out = torch.zeros(self.B, self.T, dtype=torch.long, device=self.device)
        if not self.n_governors:
            return out
        nb = self.neigh
        beside = None
        for r in range(self.n_majors):
            per = self._governor_tile_sum(r, "appealNearFeature")
            if not bool((per != 0).any()):
                continue
            if beside is None:
                _f = self._unimproved_feature()
                beside = (_f[:, nb.clamp(min=0)] & (nb >= 0).unsqueeze(0)).any(dim=2)
            out = out + torch.where(beside, per.long(), torch.zeros_like(out))
        return out

    def _governor_feature_gold(self, row: int) -> torch.Tensor:
        """[B, RC] f64 — CIV6 (Forestry Management): "This city receives +2
        Gold for each unimproved feature", counted over the tiles it OWNS."""
        per = self._governor_sum(row, "goldPerFeature")
        if not bool((per != 0).any()):
            return per
        slot = self.city_slot_at(row)
        live = self._unimproved_feature() & (slot >= 0)
        cnt = torch.zeros(self.B, self.RC, dtype=torch.long, device=self.device)
        cnt.scatter_add_(1, slot.clamp(min=0), live.long())
        return per * cnt.double()

    def _governor_pass_route_gold(self, row: int) -> torch.Tensor:
        """[B, RC] f64 — CIV6 (Land Acquisition): "+3 Gold per turn from each
        foreign Trade Route passing through the city" — a foreign route passes
        through where its stored course (`seat_route_chain`) holds this
        centre."""
        per = self._governor_sum(row, "passRouteGold")
        if not bool((per != 0).any()):
            return per
        B, T = self.B, self.T
        cnt = torch.zeros(B, T, dtype=torch.long, device=self.device)
        for r2 in range(self.n_majors):
            if r2 == row:
                continue
            ch = self.seat_route_chain[:, r2]  # [B, K, CMAX]
            live = (self.seat_routes[:, r2, :, 0] >= 0).unsqueeze(2) & (ch >= 0)
            cnt.scatter_add_(1, ch.clamp(min=0).reshape(B, -1), live.reshape(B, -1).long())
        centres = self.city_center[:, row]
        return per * cnt.gather(1, centres.clamp(min=0)).double()

    def _patron_saint(self, row: int, landed: torch.Tensor, col: torch.Tensor) -> None:
        """CIV6 (Patron Saint): "Apostles and Warrior Monks trained in the
        city receive 1 extra Promotion when receiving their first promotion" —
        banked on the unit at the buy, `col` being the city column it came
        from."""
        if not self.n_governors or not bool(landed.any()):
            return
        n = self._governor_sum(row, "firstPromoBonus")
        if not bool((n != 0).any()):
            return
        rows = landed.nonzero(as_tuple=True)[0]
        slot = getattr(self, self.POOL_NEXT["major"])[rows] - 1
        self.major_unit_promo_bonus[rows, slot] = n[rows, col[rows].clamp(min=0, max=self.RC - 1)].long()

    def _governor_loyalty_aura(self, row: int) -> torch.Tensor:
        """[B, RC] f64 — CIV6 (Garrison Commander): "Your other cities within 9
        tiles gain +4 Loyalty per turn towards your civilization"; (Emissary):
        "Other cities within 9 tiles and not owned by you lose 2 Loyalty per
        turn." Both are measured from the GOVERNED city's centre and neither
        pays the governed city itself."""
        B, RC, dev = self.B, self.RC, self.device
        out = torch.zeros(B, RC, dtype=torch.float64, device=dev)
        if self.n_gov_promos == 0:
            return out
        own_r = self._gpromo.get("loyaltyToOwn")
        for_r = self._gpromo.get("loyaltyToForeign")
        if own_r is None or for_r is None:
            return out
        if not bool(((own_r[:, 1] != 0) | (for_r[:, 1] != 0)).any()):
            return out
        here = self.city_center[:, row].clamp(min=0)          # [B, RC]
        alive = self.city_alive[:, row]
        for src in range(self.n_majors):
            mask = self._governor_mask(src)                    # [B, RC, NP]
            same = src == row
            rng = (own_r if same else for_r)[:, 0]
            amt = (own_r if same else for_r)[:, 1]
            pay = torch.einsum("bjn,n->bj", mask.double(), amt)     # [B, RC] per SOURCE city
            reach = torch.einsum("bjn,n->bj", mask.double(), rng)
            live = self.city_alive[:, src] & (pay != 0)
            if not bool(live.any()):
                continue
            there = self.city_center[:, src].clamp(min=0)      # [B, RC]
            d = self.pair_dist[here.unsqueeze(2), there.unsqueeze(1)].double()  # [B, RC, RC]
            hit = live.unsqueeze(1) & (d <= reach.unsqueeze(1))
            if same:
                # a city never pays itself
                eye = torch.eye(RC, dtype=torch.bool, device=dev).unsqueeze(0)
                hit = hit & ~eye
            sign = 1.0 if same else -1.0
            out = out + sign * (hit.double() * pay.unsqueeze(1)).sum(dim=2)
        return torch.where(alive, out, torch.zeros_like(out))

    # ------------------------------------------------ the per-city overlay

    def _governor_bonus(self, row: int, pop: torch.Tensor, spec: torch.Tensor,
                        gov_percit: torch.Tensor) -> torch.Tensor:
        """[B, RC, 6] f64 — the governor's own share of `computeCityStats`'
        BONUSES bucket: the flat cityYields, the per-CITIZEN yields (the
        promotions' plus the two governments that pay by citizen in a governed
        city), and the faith per SPECIALTY district.

        `gov_percit` is the seat's `governorPerCitizen` [B, 6], which wants a
        SEATED governor where every promotion channel wants an established
        one."""
        seated = (self._governor_at(row) >= 0).double().unsqueeze(2)      # [B, RC, 1]
        out = self._governor_vec(row, "cityYields")
        out = out + (self._governor_vec(row, "perCitizen")
                     + gov_percit.double().unsqueeze(1) * seated) * pop.double().unsqueeze(2)
        out[:, :, 5] = out[:, :, 5] + self._governor_sum(row, "faithPerSpecialty") * spec.double()
        out[:, :, 2] = out[:, :, 2] + self._governor_feature_gold(row) + self._governor_pass_route_gold(row)
        return out

    def _governor_ymult(self, row: int, gov_ymult: torch.Tensor) -> torch.Tensor:
        """[B, RC, 6] f64 — the city's yield multipliers from its governor:
        `governorYieldMult` (Merchant Republic's gold, which names an
        ESTABLISHED governor) times every promotion's own."""
        est = self._governor_established(row).double().unsqueeze(2)       # [B, RC, 1]
        gate = 1.0 + (gov_ymult.double().unsqueeze(1) - 1.0) * est
        return gate * self._governor_vec_mult(row, "yieldMult")

    def _governor_house_amen(self, row: int) -> tuple[torch.Tensor, torch.Tensor]:
        """([B, RC], [B, RC]) f64 — CIV6 (Water Works): housing per
        Neighborhood/Aqueduct and amenities per Canal/Dam, and (Audience
        Chamber): "+2 Amenities and +4 Housing in Cities with Governors"."""
        B, RC, dev = self.B, self.RC, self.device
        house = torch.zeros(B, RC, dtype=torch.float64, device=dev)
        amen = torch.zeros(B, RC, dtype=torch.float64, device=dev)
        seated = self._governor_at(row) >= 0
        if bool((self._b_amen_gov != 0).any()):
            amen = amen + seated.double() * self._seat_building_sum(row, self._b_amen_gov).double().unsqueeze(1)
        if bool((self._b_house_gov != 0).any()):
            house = house + seated.double() * self._seat_building_sum(row, self._b_house_gov).double().unsqueeze(1)
        works = self._governor_flag(row, "waterWorks")
        if bool(works.any()) and self.districts_on:
            cnt = self._dist_counts(row)                                  # [B, RC, nD]
            h = torch.einsum("bjn,n->bj", cnt.double(), self._d_water_house)
            a = torch.einsum("bjn,n->bj", cnt.double(), self._d_water_amen)
            house = house + works.double() * h
            amen = amen + works.double() * a
        return house, amen

    def _governor_tile_adj(self, row: int, di: int) -> torch.Tensor:
        """[B, T] f64 — the adjacency multiplier the governor of each tile's
        OWNING city pays for district type `di` (CIV6, Harbormaster: "Double
        adjacency bonuses from Commercial Hubs and Harbors in the city")."""
        col = self._gpromo.get("adjacencyMult")
        if col is None or di >= col.shape[1]:
            return torch.ones(self.B, self.T, dtype=torch.float64, device=self.device)
        m = self._governor_mask(row)                                   # [B, RC, NP]
        one = torch.ones_like(col[:, di]).reshape(1, 1, -1)
        per = torch.where(m, col[:, di].reshape(1, 1, -1), one).prod(dim=2)  # [B, RC]
        slot = self.city_slot_at(row)
        return torch.where(slot >= 0, per.gather(1, slot.clamp(min=0)), torch.ones_like(per[:, :1]))

    def _governor_city_defense(self, hrow: torch.Tensor, hcol: torch.Tensor) -> torch.Tensor:
        """[B] long — CIV6 (Redoubt): "Increase city garrison Combat Strength
        by 5", read at the DEFENDING city's own (row, column)."""
        out = torch.zeros(hrow.shape, dtype=torch.long, device=self.device)
        if not self.n_governors:
            return out
        for r in range(self.n_majors):
            per = self._governor_sum(r, "cityDefense")
            if not bool((per != 0).any()):
                continue
            v = per.gather(1, hcol.clamp(min=0).reshape(self.B, -1)).reshape(hcol.shape)
            out = out + (hrow == r).long() * v.long()
        return out
