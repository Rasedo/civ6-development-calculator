"""THE NEGOTIATED DEAL — `cpu/core/deals.ts`'s twin.

CIV6 (Trade, Demand, and Discuss): "You can trade anything from Gold to
resources to cities!" A deal is two bundles that move together, and only when
the other side confirms "the trade that is on the table".

The wire carries one seat's unilateral record per turn, so the two halves are
two records: an `offer` that parks a bundle on the table and an `accept` that
takes it. Every item is RE-VALIDATED here, at accept time, because the state
the offer was priced against has moved on by then.
"""

from __future__ import annotations

import torch


class SimDeals:
    """The table, the clock and the cell."""

    # ------------------------------------------------------------- the cell
    def _spies_held_of(self, row: int) -> torch.Tensor:
        """[B] — how many of this row's spies are sitting in someone's cell.
        CIV6: they are "imprisoned, but not killed" and still count against the
        owner's capacity. `spiesHeldOf`'s twin."""
        return self.seat_spy_held[:, row, : self.n_majors].sum(dim=(1, 2))

    def _spy_cell_release(self, owner: int, captor: int, ok: torch.Tensor) -> torch.Tensor:
        """[B] long — take ONE spy out of `captor`'s cell for `owner` in the
        games `ok` names and return its level: the highest level held, the
        `releaseSpy` twin. 0 where the cell is empty (nothing is taken)."""
        cell = self.seat_spy_held[:, owner, captor]
        has = cell > 0
        top = cell.shape[1] - 1 - has.flip(1).long().argmax(dim=1)
        take = ok & has.any(dim=1)
        tr = take.nonzero(as_tuple=True)[0]
        self.seat_spy_held[tr, owner, captor, top[tr]] -= 1
        return torch.where(take, top, torch.zeros_like(top))

    def _deal_capital_col(self, row: int) -> tuple[torch.Tensor, torch.Tensor]:
        """[B] city column and [B] live mask — where a released spy goes home.
        CIV6: it "is immediately returned to the original owner's Capital"; a
        seat that has lost that city takes delivery in its first. Reads
        `civ_cap_tile`, so it is `capitalCityOf`'s twin by construction."""
        alive = self.city_alive[:, row]
        cap = self.civ_cap_tile[:, row].unsqueeze(1)
        is_cap = alive & (self.city_center[:, row] == cap)
        col = torch.where(is_cap.any(dim=1), is_cap.long().argmax(dim=1), alive.long().argmax(dim=1))
        return col, alive.any(dim=1)

    # -------------------------------------------------------------- one item
    def _deal_kind_ok(self, kind: int, giver: int, taker: int,
                      va: torch.Tensor, vb: torch.Tensor) -> torch.Tensor:
        """[B] — can `giver` hand `taker` this one thing right now?
        `dealItemPayable`'s per-kind twin."""
        z = torch.zeros(self.B, dtype=torch.bool, device=self.device)
        if kind == self._deal_k_gold:
            return (va > 0) & (self.civ_treasury[:, giver] >= va.to(self.civ_treasury.dtype))
        if kind == self._deal_k_gpt:
            # The flow, not the balance: a per-turn payment is priced against
            # the turns it runs, and a treasury here may go negative.
            return va > 0
        if kind == self._deal_k_favor:
            return (va > 0) & (self.civ_diplo_favor[:, giver] >= va)
        if kind == self._deal_k_res:
            ns = self.civ_stockpile.shape[2]
            have = self.civ_stockpile[:, giver].gather(1, va.clamp(min=0, max=ns - 1).unsqueeze(1)).squeeze(1)
            return (va >= 0) & (va < self._n_strategic) & (vb > 0) & (have >= vb)
        if kind == self._deal_k_gw:
            out = z.clone()
            for k in range(3):
                sel = va == k
                if not bool(sel.any()):
                    continue
                gw = (self.city_gw_writing, self.city_gw_art, self.city_gw_music)[k]
                src = (self.city_alive[:, giver] & (gw[:, giver] > 0)).any(dim=1)
                dst = (self.city_alive[:, taker] & (gw[:, taker] < self._gw_capacity(taker, k))).any(dim=1)
                out |= sel & src & dst
            return out
        if kind == self._deal_k_city:
            cell = self._deal_city_cell(giver, va)
            if not bool(cell.any()):
                return z
            col = cell.long().argmax(dim=1)
            rowt = torch.full_like(col, giver)
            full_hp = self.city_hp[:, giver].gather(1, col.unsqueeze(1)).squeeze(1) >= int(self.rules.combat["cityMaxHp"])
            wmax = self._walls_max_at(rowt, col)
            outer = torch.minimum(self.city_outer_hp[:, giver].gather(1, col.unsqueeze(1)).squeeze(1), wmax)
            return cell.any(dim=1) & full_hp & (outer >= wmax)
        if kind == self._deal_k_spy:
            # The giver is the CAPTOR: it lets one of the taker's own spies go.
            return self.seat_spy_held[:, taker, giver].sum(dim=1) > 0
        if kind == self._deal_k_borders:
            return ~z
        return z

    def _deal_city_cell(self, row: int, centre: torch.Tensor) -> torch.Tensor:
        """[B, RC] — that row's live city standing on `centre`, if any."""
        return self.city_alive[:, row] & (self.city_center[:, row] == centre.unsqueeze(1))

    def _deal_move_kind(self, kind: int, giver: int, taker: int,
                        va: torch.Tensor, vb: torch.Tensor, ok: torch.Tensor) -> None:
        """Move it. The caller has checked `_deal_kind_ok`. `moveDealItem`'s twin."""
        if not bool(ok.any()):
            return
        if kind == self._deal_k_gold:
            paid = torch.where(ok, va.to(self.civ_treasury.dtype), torch.zeros_like(self.civ_treasury[:, giver]))
            self.civ_treasury[:, giver] = self.civ_treasury[:, giver] - paid
            self.civ_treasury[:, taker] = self.civ_treasury[:, taker] + paid
        elif kind == self._deal_k_gpt:
            pass  # the term pays it; accepting only starts the clock
        elif kind == self._deal_k_favor:
            paid = torch.where(ok, va, torch.zeros_like(va))
            self.civ_diplo_favor[:, giver] = self.civ_diplo_favor[:, giver] - paid
            self.civ_diplo_favor[:, taker] = self.civ_diplo_favor[:, taker] + paid
        elif kind == self._deal_k_res:
            self._deal_move_res(giver, taker, va, vb, ok)
        elif kind == self._deal_k_gw:
            for k in range(3):
                sel = ok & (va == k)
                if bool(sel.any()):
                    self._gift_work(giver, taker, k, sel)
        elif kind == self._deal_k_city:
            cell = self._deal_city_cell(giver, va) & ok.unsqueeze(1)
            for b in torch.nonzero(cell.any(dim=1)).flatten().tolist():
                self._transfer_city(int(b), giver, int(cell[b].long().argmax()), taker, conquest=False)
        elif kind == self._deal_k_spy:
            # the spy that comes home is the one that was caught, at the level
            # it was caught at; when the cell holds several, the HIGHEST goes
            # first — the real deal names a spy, this model ranks them
            lvl = self._spy_cell_release(taker, giver, ok)
            col, live = self._deal_capital_col(taker)
            home = ok & live
            if bool(home.any()) and self._spy_idx >= 0:
                at = self.city_center[:, taker].gather(1, col.unsqueeze(1)).squeeze(1)
                slot0 = getattr(self, self.POOL_NEXT["major"]).clone()
                got = self._spawn_unit(taker, home, at, self._spy_idx)
                gr = got.nonzero(as_tuple=True)[0]
                self.major_unit_spy_level[gr, slot0[gr]] = lvl[gr]
        elif kind == self._deal_k_borders:
            self.seat_borders_turns[:, giver, taker] = torch.where(
                ok, torch.full_like(self.seat_borders_turns[:, giver, taker], self._agreement_turns),
                self.seat_borders_turns[:, giver, taker])

    def _deal_move_res(self, giver: int, taker: int, va: torch.Tensor,
                       vb: torch.Tensor, ok: torch.Tensor) -> None:
        """A lump of a CONSUMABLE resource, capped by what the taker can hold.
        C-5's stockpile is the only resource with a quantity to hand over."""
        ns = self.civ_stockpile.shape[2]
        idx = va.clamp(min=0, max=ns - 1).unsqueeze(1)
        held = self.civ_stockpile[:, taker].gather(1, idx).squeeze(1)
        room = (self._stockpile_cap(taker) - held).clamp(min=0)
        moved = torch.where(ok, torch.minimum(vb, room), torch.zeros_like(vb))
        self.civ_stockpile[:, giver] = self.civ_stockpile[:, giver].scatter_add(
            1, idx, (-moved).unsqueeze(1))
        self.civ_stockpile[:, taker] = self.civ_stockpile[:, taker].scatter_add(
            1, idx, moved.unsqueeze(1))

    # ------------------------------------------------------------ one bundle
    def _deal_bundle_ok(self, giver: int, taker: int, bundle: torch.Tensor,
                        live: torch.Tensor) -> torch.Tensor:
        """[B] — every slot on one side of the table, checked against one giver.
        A deal is atomic: the table confirms whole or not at all."""
        good = live.clone()
        for s in range(self._deal_items):
            it = bundle[:, s]
            kind, va, vb = it[:, 0], it[:, 1], it[:, 2]
            slot = kind < 0                       # an empty slot asks nothing
            for k in range(len(self._deal_kinds)):
                sel = kind == k
                if bool((sel & live).any()):
                    slot = slot | (sel & self._deal_kind_ok(k, giver, taker, va, vb))
            good &= slot
        return good

    def _deal_move_bundle(self, giver: int, taker: int, bundle: torch.Tensor,
                          go: torch.Tensor) -> None:
        """Move every slot, in the slot order TS walks."""
        for s in range(self._deal_items):
            it = bundle[:, s]
            kind, va, vb = it[:, 0], it[:, 1], it[:, 2]
            for k in range(len(self._deal_kinds)):
                sel = go & (kind == k)
                if bool(sel.any()):
                    self._deal_move_kind(k, giver, taker, va, vb, sel)

    # ------------------------------------------------------------- the table
    def _deal_offer(self, a: int, b: int, want: torch.Tensor,
                    give: torch.Tensor, ask: torch.Tensor, live: torch.Tensor) -> None:
        """Park a bundle on the table. `setDealOffer`'s twin."""
        if not bool((want & live).any()):
            return
        put = want & live
        self.deal_offer_left[:, a, b] = torch.where(
            put, torch.full_like(self.deal_offer_left[:, a, b], self._deal_offer_turns + 1),
            self.deal_offer_left[:, a, b])
        m = put.reshape(-1, 1, 1)
        self.deal_offer_give[:, a, b] = torch.where(m, give, self.deal_offer_give[:, a, b])
        self.deal_offer_ask[:, a, b] = torch.where(m, ask, self.deal_offer_ask[:, a, b])

    def _accept_deal(self, a: int, b: int, ok: torch.Tensor) -> torch.Tensor:
        """[B] where `b` confirmed `a`'s standing offer. `acceptDeal`'s twin —
        and CIV6 (Ending a War): "the peaceful resolution of a war involves
        diplomatic negotiations", so a table between two seats at war IS the
        peace deal, and the caller makes the peace on the mask this returns."""
        z = torch.zeros(self.B, dtype=torch.bool, device=self.device)
        live = ok & (self.deal_offer_left[:, a, b] > 0)
        if not bool(live.any()):
            return z
        war = self.war[:, a, b]
        # "You can trade with all the leaders except the ones you're at war
        # with" — and the one table a war does not close is the one that ends
        # it, which cannot be reached before the war has run its minimum.
        live = live & (~war | (self.war_turns[:, a, b] >= int(self.rules.seats["warMinTurns"])))
        give = self.deal_offer_give[:, a, b]
        ask = self.deal_offer_ask[:, a, b]
        go = self._deal_bundle_ok(a, b, give, live)
        go = self._deal_bundle_ok(b, a, ask, go)
        if not bool(go.any()):
            return z
        self._deal_move_bundle(a, b, give, go)
        self._deal_move_bundle(b, a, ask, go)
        self._deal_set_term(a, b, give, go)
        self._deal_set_term(b, a, ask, go)
        self.deal_offer_left[:, a, b] = torch.where(
            go, torch.zeros_like(self.deal_offer_left[:, a, b]), self.deal_offer_left[:, a, b])
        return go

    def _deal_set_term(self, giver: int, taker: int, bundle: torch.Tensor, go: torch.Tensor) -> None:
        """What the giver still owes after the table clears: only the TEMPORARY
        kinds, on the 30-turn clock. An OPEN BORDERS grant runs on the border
        clock it already has, so it leaves nothing here."""
        keep = torch.zeros_like(bundle)
        keep[:] = -1
        any_kept = torch.zeros(self.B, dtype=torch.bool, device=self.device)
        for s in range(self._deal_items):
            kind = bundle[:, s, 0]
            temp = torch.zeros(self.B, dtype=torch.bool, device=self.device)
            for k in range(len(self._deal_kinds)):
                if self._deal_permanent[k] or k == self._deal_k_borders:
                    continue
                temp |= kind == k
            sel = go & temp
            if not bool(sel.any()):
                continue
            keep[:, s] = torch.where(sel.unsqueeze(1), bundle[:, s], keep[:, s])
            any_kept |= sel
        if not bool(any_kept.any()):
            return
        self.deal_term_left[:, giver, taker] = torch.where(
            any_kept, torch.full_like(self.deal_term_left[:, giver, taker], self._deal_turns),
            self.deal_term_left[:, giver, taker])
        self.deal_term_item[:, giver, taker] = torch.where(
            any_kept.reshape(-1, 1, 1), keep, self.deal_term_item[:, giver, taker])

    # -------------------------------------------------------------- the turn
    def _deal_phase(self) -> None:
        """The turn's deal bookkeeping: the per-turn payments, the 30-turn
        clock, and the offer nobody answered. `dealPhase`'s twin."""
        nrow = self.n_majors
        for a in range(nrow):
            for b in range(nrow):
                if a == b:
                    continue
                left = self.deal_term_left[:, a, b]
                run = left > 0
                if bool(run.any()):
                    items = self.deal_term_item[:, a, b]
                    for s in range(self._deal_items):
                        kind, va = items[:, s, 0], items[:, s, 1]
                        pay = run & (kind == self._deal_k_gpt)
                        if bool(pay.any()):
                            amt = torch.where(pay, va.to(self.civ_treasury.dtype),
                                              torch.zeros_like(self.civ_treasury[:, a]))
                            self.civ_treasury[:, a] = self.civ_treasury[:, a] - amt
                            self.civ_treasury[:, b] = self.civ_treasury[:, b] + amt
                    self.deal_term_left[:, a, b] = torch.where(run, left - 1, left)
                    done = run & (self.deal_term_left[:, a, b] <= 0)
                    if bool(done.any()):
                        self._deal_end_term(a, b, items, done)
                # "All Deals, Demands, and Promises last for 30 turns" says
                # nothing about how long an OFFER waits, and a record is one
                # turn's decision: an offer nobody answered was priced against
                # a state that no longer exists.
                stale = self.deal_offer_left[:, a, b]
                if bool((stale > 0).any()):
                    self.deal_offer_left[:, a, b] = (stale - 1).clamp(min=0)

    def _deal_end_term(self, giver: int, taker: int, items: torch.Tensor, done: torch.Tensor) -> None:
        """CIV6: "Resources and gold per turn ... are temporary, and once the
        deal has run its course you will get them back" — the payments stop on
        their own, and a lump of resource goes home. `endTerm`'s twin."""
        ns = self.civ_stockpile.shape[2]
        for s in range(self._deal_items):
            kind, va, vb = items[:, s, 0], items[:, s, 1], items[:, s, 2]
            sel = done & (kind == self._deal_k_res)
            if not bool(sel.any()):
                continue
            idx = va.clamp(min=0, max=ns - 1).unsqueeze(1)
            held = self.civ_stockpile[:, taker].gather(1, idx).squeeze(1)
            back = torch.where(sel, torch.minimum(vb, held), torch.zeros_like(vb))
            # `grantStockpile`'s ceiling: coming home is a grant like any other,
            # and the stockpile maximum is a HARD one — a lump handed back to a
            # seat already at the cap is lost, not banked over it.
            mine = self.civ_stockpile[:, giver].gather(1, idx).squeeze(1)
            room = torch.minimum(mine + back, self._stockpile_cap(giver)) - mine
            gain = torch.where(back > 0, room, torch.zeros_like(room))
            self.civ_stockpile[:, taker] = self.civ_stockpile[:, taker].scatter_add(1, idx, (-back).unsqueeze(1))
            self.civ_stockpile[:, giver] = self.civ_stockpile[:, giver].scatter_add(1, idx, gain.unsqueeze(1))
        self.deal_term_item[:, giver, taker] = torch.where(
            done.reshape(-1, 1, 1), torch.full_like(items, -1), self.deal_term_item[:, giver, taker])
