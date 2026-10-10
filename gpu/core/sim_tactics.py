from __future__ import annotations

from .simbase import *  # noqa: F401,F403 — torch, constants, helpers: the shared floor
from . import simbase

# the pathfinder's fixed point: one Movement is 256
_FIX = 256
# UnitAiTypes (unit +0x1c0)
_AI_EXPLORE = 2
_AI_COMBAT = 3
_AI_DEFENDER = 4
# WANDER NEAR CAMP's radius (0x77b9a0), DEFEND CAMPS' reach (0x774e90), the
# planning's breadth-first search (0x7920d0)
_WANDER_CAMP_RANGE = 5
_DEFEND_CAMP_TURNS = 3
_PLAN_TURNS = 2
# an open node's key: its cost, then its order among equal costs
_KEY_SHIFT = 1 << 22
_TIE_OFF = 1 << 21
_KEY_NONE = 1 << 62


class SimTactics:
    """THE GAME'S UNIT AI — `cpu/core/tactical.ts`'s twin: the unit
    pathfinder's reach and path, and the barbarians' tactical pass
    (GameCore_XP2 TacticalAI; tools/civ6lab/dll_readings.md "C-95: the unit
    pathfinder and the planning's reach", "C-95: the tactical pass")."""

    # what a tactical pass holds while it runs: the steps' costs (dropped at
    # a pillage) and the units' full Movement
    _tac_in_pass = False
    _tac_cost_held = None
    _tac_full_held = None

    # ------------------------------------------------------- the unit pool

    def _barb_slots(self) -> None:
        """`barbSlots`: the slots whose unit was gone when the barbarians'
        last turn ended go free, pushed in ascending order; each barbarian
        unit without a slot takes one in pool order — the slot pushed last,
        else a new one past the end."""
        P = simbase.BARB_POOL_MAX
        dy = self.barb_pool_dying
        if bool(dy.count_nonzero()):
            pos = self.barb_pool_nfree.unsqueeze(1) + dy.long().cumsum(dim=1) - 1
            b_i, s_i = dy.nonzero(as_tuple=True)
            self.barb_pool_free[b_i, pos[b_i, s_i]] = s_i
            self.barb_pool_nfree += dy.sum(dim=1)
            self.barb_pool_dying.zero_()
        need = self.barb_unit_alive & (self.barb_unit_seat == BARB_SEAT) & (self.barb_unit_slotno < 0)
        if not bool(need.count_nonzero()):
            return
        r = need.long().cumsum(dim=1) - 1
        nf = self.barb_pool_nfree.unsqueeze(1)
        s_free = self.barb_pool_free.gather(1, (nf - 1 - r).clamp(min=0, max=P - 1))
        s_new = self.barb_pool_size.unsqueeze(1) + (r - nf)
        self.barb_unit_slotno.copy_(torch.where(need, torch.where(r < nf, s_free, s_new), self.barb_unit_slotno))
        n = need.sum(dim=1)
        used = torch.minimum(n, self.barb_pool_nfree)
        self.barb_pool_nfree -= used
        self.barb_pool_size += n - used
        assert int(self.barb_pool_size.max()) <= P, "barbarian slot numbers exhausted — raise simbase.BARB_POOL_MAX"

    def _barb_slots_dying(self) -> None:
        """`barbSlotsDying`: the barbarians' turn ends, and the slots no unit
        holds and none free wait for the next turn to go free."""
        P = simbase.BARB_POOL_MAX
        dev = self.device
        B = self.B
        ar = torch.arange(P, device=dev).unsqueeze(0)
        held = torch.zeros(B, P + 1, dtype=torch.bool, device=dev)
        hm = self.barb_unit_alive & (self.barb_unit_seat == BARB_SEAT) & (self.barb_unit_slotno >= 0)
        held.scatter_(1, torch.where(hm, self.barb_unit_slotno, P), True)
        infree = torch.zeros(B, P + 1, dtype=torch.bool, device=dev)
        infree.scatter_(1, torch.where(ar < self.barb_pool_nfree.unsqueeze(1), self.barb_pool_free, P), True)
        self.barb_pool_dying.copy_((ar < self.barb_pool_size.unsqueeze(1)) & ~held[:, :P] & ~infree[:, :P])

    # ------------------------------------------------------ the pathfinder

    def _tac_step_cost(self) -> torch.Tensor:
        """[B, T, 6] long — `stepCost` for a step off each plot along each
        neighbour column onto LAND, in `mp_scale` units: the plot's own cost
        (an improvement's Movement in its place), a route at both ends its
        tier's instead, and the river crossing a bridging tier drops. A
        barbarian's chassis waives no terrain, and its steps never cross the
        shore."""
        nb = self.neigh.clamp(min=0)  # [T, 6]
        tm = self.tmove[:, nb]
        if self._imp_move_cost_any:
            mi = self.improvement[:, nb]
            mc = self._imp_move_cost.take(mi.clamp(min=0)) * ((mi >= 0) & ~self.pillaged[:, nb]).long()
            tm = torch.where(mc > 0, (mc - 1) * self._mp_scale, tm)
        rr_f = self.railroad.unsqueeze(2)
        rr_t = self.railroad[:, nb]
        rd = (self.road.unsqueeze(2) | rr_f) & (self.road[:, nb] | rr_t)
        tier = self._road_tier_mp.take(self.road_tier).view(-1, 1, 1)
        step = torch.where(rr_f & rr_t, torch.full_like(tm, self._railroad_mp), tier.expand_as(tm))
        terr = torch.where(rd, step - self._mp_scale, tm)
        bits = torch.arange(6, device=self.device).view(1, 1, 6)
        river_mp = (2 * self._mp_scale) * ((self.river_mask.unsqueeze(2) >> bits) & 1)
        bridged = self._road_tier_bridges.take(self.road_tier).view(-1, 1, 1)
        riv = torch.where(rd & bridged, torch.zeros_like(river_mp), river_mp)
        return self._mp_scale + terr + riv

    def _tac_foreign(self, seat: int) -> torch.Tensor:
        """[B, T] bool — a unit of another player than `seat` holds the plot
        (an aircraft or a spy holds none)."""
        out = torch.zeros(self.B, self.T, dtype=torch.bool, device=self.device)
        for pl in (self.military_at, self.civilian_at, self.support_at, self.embarked_at):
            s = torch.where(pl >= 0, self.unit_seat.gather(1, pl.clamp(min=0)), torch.full_like(pl, seat))
            out |= s != seat
        return out

    def _tac_enter(self, seat: int) -> tuple[torch.Tensor, torch.Tensor]:
        """[B, T] bool twice — the plots a LAND and a NAVAL unit of `seat` may
        enter (`enterable`): its domain's ground, no unit of another player, no
        city centre, no live enemy Encampment."""
        block = self._tac_foreign(seat) | self._centre_plane()
        if self._encamp_didx >= 0:
            block = block | self._encamp_block_plane(seat)
        cart = self._ocean_open(torch.full((self.B,), seat, dtype=torch.long, device=self.device))
        land = self.passable & ~block
        naval = self.wpass & (~self.ocean_tile | cart.unsqueeze(1)) & ~block
        return land, naval

    def _tac_zoc(self, seat: int) -> torch.Tensor:
        """[B, T] bool — `inEnemyZoc` for a military mover of `seat` at every
        plot: a military unit hostile to it beside the plot that exerts a zone
        (no Ranged or Siege class without SUPPRESSION, none embarked, none of a
        chassis that exerts none), none across a river. The mover's own
        ignoring is the caller's."""
        mil = self.military_at
        here = mil >= 0
        ms = mil.clamp(min=0)
        mtype = self.unit_type.gather(1, ms).clamp(min=0, max=self.NU - 1)
        mseat = torch.where(here, self.unit_seat.gather(1, ms), torch.full_like(mil, -1))
        pc = self.rules_dev.u_promo_class.take(mtype)
        no_ex = (pc == self._pc_ranged) | (pc == self._pc_siege)
        if bool(no_ex.count_nonzero()):
            no_ex = no_ex & ~self._promo_flag(mtype, self.unit_promos.gather(1, ms), "ZOC_EXERT")
        ex = here & ~self.unit_emb.gather(1, ms) & ~self._type_zoc_none.take(mtype) & ~no_ex
        ex = ex & self._seats_hostile(seat, mseat)
        nb = self.neigh.clamp(min=0)
        bits = torch.arange(6, device=self.device).view(1, 1, 6)
        riv = (self.river_mask.unsqueeze(2) >> bits) & 1
        return ((self.neigh >= 0).unsqueeze(0) & (riv == 0) & ex[:, nb]).any(dim=2)

    def _tac_zoc_ignored(self, utype: torch.Tensor) -> torch.Tensor:
        """bool — the chassis ignores zones of control (a naval raider, the
        cavalry classes but the chariot)."""
        ign = self._type_zoc_ignore | (self._type_cavalry & ~self._type_chariot)
        return ign.take(utype.clamp(min=0, max=self.NU - 1))

    def _tac_cost(self) -> torch.Tensor:
        """`_tac_step_cost`, held through a tactical pass until a pillage
        changes the ground"""
        if not self._tac_in_pass:
            return self._tac_step_cost()
        if self._tac_cost_held is None:
            self._tac_cost_held = self._tac_step_cost()
        return self._tac_cost_held

    def _tac_full(self) -> torch.Tensor:
        """[B, P] — each barbarian's full Movement (`unitFullMoves`, no
        aura), held through a tactical pass"""
        if self._tac_in_pass and self._tac_full_held is not None:
            return self._tac_full_held
        f = self._full_mp("barb") - self.barb_unit_aura_mp
        if self._tac_in_pass:
            self._tac_full_held = f
        return f

    def _tac_search(self, rows: torch.Tensor, slots: torch.Tensor, seat: int, max_turns: int, zoc: bool,
                    dest: torch.Tensor | None = None) -> dict:
        """THE PATHFINDER (`search`) for the units at local `slots` of the
        barbarian pool in the games `rows` [N]: Dijkstra from each unit's
        plot over the open nodes by (cost, tie) — a node inserted where its
        cost lies nearer the cheapest open node goes before its equals, else
        after them; a node made cheaper goes after its new equals; each closed
        node links its neighbours in DirectionTypes order. Returns the closing
        rank and turns of each plot ([N, T], -1 never closed) and each node's
        parent; with `dest` [N] each row stops once its plot closes."""
        dev = self.device
        N, T = rows.shape[0], self.T
        NONE = _KEY_NONE
        ar = torch.arange(N, device=dev)
        utype = self.barb_unit_type[rows, slots].clamp(min=0, max=self.NU - 1)
        naval = self.unit_naval.take(utype)
        start = self.barb_unit_tile[rows, slots].clamp(min=0)
        mp = self.barb_unit_mp[rows, slots]
        granted = self.barb_unit_mp_full[rows, slots]
        full_mp = self._tac_full()[rows, slots]
        full = torch.div(full_mp * _FIX, self._mp_scale, rounding_mode="floor")
        unmoved = mp >= granted
        land, wat = self._tac_enter(seat)
        ent_n = torch.where(naval.unsqueeze(1), wat[rows], land[rows])  # [N, T]
        cost_b = self._tac_cost()  # [B, T, 6]
        zp = (self._tac_zoc(seat)[rows] & ~self._tac_zoc_ignored(utype).unsqueeze(1)) if zoc else None
        tseat = self.tile_seat
        g = torch.full((N, T), NONE, dtype=torch.long, device=dev)
        tie = torch.zeros(N, T, dtype=torch.long, device=dev)
        mv = torch.zeros(N, T, dtype=torch.long, device=dev)
        tn = torch.zeros(N, T, dtype=torch.long, device=dev)
        st = torch.zeros(N, T, dtype=torch.long, device=dev)
        par = torch.full((N, T), -1, dtype=torch.long, device=dev)
        rank = torch.full((N, T), -1, dtype=torch.long, device=dev)
        rturn = torch.full((N, T), -1, dtype=torch.long, device=dev)
        # each open node's key (cost, then its order among equal costs), NONE
        # off the open list
        key = torch.full((N, T), NONE, dtype=torch.long, device=dev)
        g[ar, start] = 0
        mv[ar, start] = torch.div(mp * _FIX, self._mp_scale, rounding_mode="floor")
        tn[ar, start] = 1
        st[ar, start] = 1
        key[ar, start] = _TIE_OFF
        # the open list's dearest key (-1 empty)
        hi = torch.full((N,), _TIE_OFF, dtype=torch.long, device=dev)
        seq = torch.zeros(N, dtype=torch.long, device=dev)
        cnt = torch.zeros(N, dtype=torch.long, device=dev)
        run = torch.ones(N, dtype=torch.bool, device=dev)
        found = torch.zeros(N, dtype=torch.bool, device=dev)
        cols = torch.tensor(list(self._DIRECTION_TYPES), device=dev)
        neigh = self.neigh[:, cols]  # [T, 6] in DirectionTypes order
        none6 = torch.full((N, 6), NONE, dtype=torch.long, device=dev)
        neg6 = torch.full((N, 6), -1, dtype=torch.long, device=dev)
        big6 = torch.full((N, 6), NONE, dtype=torch.long, device=dev)
        two = 2 if T >= 2 else 1
        while True:
            # the cheapest open node, and the cheapest once it is out
            vals, idx = key.topk(two, dim=1, largest=False)
            kmin, best = vals[:, 0], idx[:, 0]
            act = run & (kmin < NONE)
            if not bool(act.count_nonzero()):
                break
            lo = vals[:, 1] if two == 2 else torch.full_like(kmin, NONE)
            b1 = best.unsqueeze(1)
            st.scatter_(1, b1, torch.where(act, 2, st.gather(1, b1).squeeze(1)).unsqueeze(1))
            key.scatter_(1, b1, torch.where(act, NONE, kmin).unsqueeze(1))
            rank.scatter_(1, b1, torch.where(act, cnt, rank.gather(1, b1).squeeze(1)).unsqueeze(1))
            rturn.scatter_(1, b1, torch.where(act, tn.gather(1, b1).squeeze(1), rturn.gather(1, b1).squeeze(1)).unsqueeze(1))
            cnt += act.long()
            hi = torch.where(act & (lo >= NONE), -1, hi)
            if dest is not None:
                hit = act & (best == dest)
                found |= hit
                act &= ~hit
            run &= act
            if not bool(act.count_nonzero()):
                continue
            bg, bm, bt = g.gather(1, b1), mv.gather(1, b1), tn.gather(1, b1)  # [N, 1]
            nb = neigh[best]  # [N, 6]
            nbc = nb.clamp(min=0)
            cst = cost_b[rows, best][:, cols]
            cst = torch.where(naval.unsqueeze(1), self._mp_scale, cst)
            cst = torch.div(cst * _FIX, self._mp_scale, rounding_mode="floor")
            fresh = bm <= 0
            pm = torch.where(fresh, full.unsqueeze(1), bm).expand(-1, 6)
            turns = (bt + fresh.long()).expand(-1, 6)
            moves = pm - cst
            short = moves < 0
            moves = moves.clamp(min=0)
            at_start = ((best == start) & unmoved).unsqueeze(1)
            same_turn = bt == turns
            cst = torch.where(short & at_start, pm, cst)
            turns = torch.where(short & ~at_start & same_turn, turns + 1, turns)
            cst = torch.where(short & ~at_start & ~same_turn, torch.where(pm > 0, pm, _FIX), cst)
            if zp is not None:
                inz = zp.gather(1, nbc) & (moves > 0)
                cst = torch.where(inz, pm, cst)
                moves = torch.where(inz, 0, moves)
            ok = act.unsqueeze(1) & (nb >= 0) & ent_n.gather(1, nbc) & (turns <= max_turns)
            ends = torch.where(moves <= 0, (tseat[rows.unsqueeze(1), nbc] != seat).long() * 3 + 4, 0)
            gn = bg + cst * 1000 + (ends + 2) * _FIX
            s0 = st.gather(1, nbc)
            g0 = g.gather(1, nbc)
            t0 = tie.gather(1, nbc)
            new6 = ok & (s0 == 0)
            upd6 = ok & (s0 != 0) & (gn < g0)
            upo6 = upd6 & (s0 == 1)
            chg = new6 | upd6
            if not bool(chg.count_nonzero()):
                continue
            ins6 = new6 | upo6
            # the keys the six plots hold in the open list as the links land
            cur6 = key.gather(1, nbc)
            cur6 = torch.where(s0 == 1, cur6, none6)
            if bool((upo6 & (cur6 == hi.unsqueeze(1))).count_nonzero()):
                # a link makes the dearest open node cheaper: the links land
                # one by one, the dearest found again past it
                kx = key.clone()
                kx.scatter_(1, torch.where(nb >= 0, nbc, b1), NONE)
                hi_rest = torch.where(kx < NONE, kx, -1).max(dim=1).values
                tie6 = t0.clone()
                for j in range(6):
                    new = new6[:, j]
                    upo = upo6[:, j]
                    ins = new | upo
                    if not bool(ins.count_nonzero()):
                        continue
                    gj = gn[:, j]
                    lo_g = torch.div(lo, _KEY_SHIFT, rounding_mode="floor")
                    hi_g = torch.div(hi, _KEY_SHIFT, rounding_mode="floor")
                    inr = new & (lo < NONE) & (gj >= lo_g) & (gj <= hi_g)
                    head = (gj - lo_g).abs() <= (gj - hi_g).abs()
                    seq += inr.long()
                    tnew = torch.where(inr, torch.where(head, -seq, seq), 0)
                    seq += upo.long()
                    tj = torch.where(new, tnew, torch.where(upo, seq, t0[:, j]))
                    tie6[:, j] = tj
                    nk = gj * _KEY_SHIFT + tj + _TIE_OFF
                    lo = torch.where(ins, torch.minimum(lo, nk), lo)
                    old = cur6[:, j].clone()
                    cur6[:, j] = torch.where(ins, nk, old)
                    hi = torch.where(new, torch.maximum(hi, nk), hi)
                    fix = upo & (old == hi)
                    if bool(fix.count_nonzero()):
                        top6 = torch.where(cur6 < NONE, cur6, neg6).max(dim=1).values
                        hi = torch.where(fix, torch.maximum(hi_rest, top6), hi)
                nk6 = gn * _KEY_SHIFT + tie6 + _TIE_OFF
            else:
                # no link touches the dearest open node: each link's cheapest
                # and dearest are the open list's widened by the links before it
                gi = torch.where(ins6, gn, big6)
                gx = torch.where(new6, gn, neg6)
                lo_g0 = torch.div(lo, _KEY_SHIFT, rounding_mode="floor")
                hi_g0 = torch.div(hi, _KEY_SHIFT, rounding_mode="floor")
                cmin = torch.cat((lo_g0.unsqueeze(1), gi[:, :5]), dim=1).cummin(dim=1).values
                hi_g0 = torch.where(hi >= 0, hi_g0, -1)
                cmax = torch.cat((hi_g0.unsqueeze(1), gx[:, :5]), dim=1).cummax(dim=1).values
                open_j = torch.cat(((lo < NONE).unsqueeze(1), ins6[:, :5]), dim=1).long().cummax(dim=1).values.bool()
                lo_gj = cmin
                inr = new6 & open_j & (gn >= lo_gj) & (gn <= cmax)
                head = (gn - lo_gj).abs() <= (gn - cmax).abs()
                steps = (inr | upo6).long().cumsum(dim=1) + seq.unsqueeze(1)
                tie6 = torch.where(new6, torch.where(inr, torch.where(head, -steps, steps), 0),
                                   torch.where(upo6, steps, t0))
                seq = steps[:, 5]
                nk6 = gn * _KEY_SHIFT + tie6 + _TIE_OFF
                hi = torch.maximum(hi, torch.where(new6, nk6, neg6).max(dim=1).values)

            def put(t: torch.Tensor, vals: torch.Tensor, m: torch.Tensor = chg) -> None:
                t.scatter_(1, torch.where(m, nbc, b1), torch.where(m, vals, t.gather(1, b1).expand(-1, 6)))

            put(g, gn)
            put(mv, moves)
            put(tn, turns)
            put(par, best.unsqueeze(1).expand(-1, 6))
            put(tie, tie6)
            put(st, torch.ones_like(s0), new6)
            put(key, nk6, ins6)
        return {"rank": rank, "turns": rturn, "parent": par, "found": found, "start": start}

    def _tac_move_to(self, mask: torch.Tensor, us: torch.Tensor, dest: torch.Tensor) -> None:
        """`moveTo` for the barbarian at local slot `us` [B] in the games of
        `mask`: the pathfinder's path to `dest` with zones of control, walked
        as far as its Movement carries it this turn (a zone of control ends
        it); it walks through its own units but stops short of a plot of its
        own unit that stacks with it."""
        if not bool(mask.count_nonzero()):
            return
        dev = self.device
        B = self.B
        rows = mask.nonzero(as_tuple=True)[0]
        sr = us[rows]
        dr = dest[rows].clamp(min=0)
        res = self._tac_search(rows, sr, BARB_SEAT, 1 << 30, True, dr)
        par = res["parent"]
        start = res["start"]
        R = rows.shape[0]
        ar = torch.arange(R, device=dev)
        # the path, dest first, back to the unit's plot
        back = []
        cur = torch.where(res["found"], dr, start)
        while True:
            more = cur != start
            if not bool(more.count_nonzero()):
                break
            back.append(torch.where(more, cur, torch.full_like(cur, -1)))
            cur = torch.where(more, par[ar, cur], cur)
        if not back:
            return
        L = len(back)
        path = torch.stack(back[::-1], dim=1)  # [R, L], -1 before each row's first plot
        lead = (path < 0).sum(dim=1)
        # each row's path from column 0, -1 past its end
        idx = (lead.unsqueeze(1) + torch.arange(L, device=dev).unsqueeze(0))
        path = torch.where(idx < L, path.gather(1, idx.clamp(max=L - 1)), torch.full_like(path, -1))
        plen = L - lead
        cost_land = self._tac_cost()
        ut = self.barb_unit_type[rows, sr].clamp(min=0, max=self.NU - 1)
        naval = self.unit_naval.take(ut)
        halts = self._tac_zoc(BARB_SEAT)[rows] & ~self._tac_zoc_ignored(ut).unsqueeze(1)
        mil_all = self.military_at[rows]
        own = (mil_all >= 0) & (self.unit_seat[rows].gather(1, mil_all.clamp(min=0)) == BARB_SEAT)
        # how far its Movement carries it
        mp = self.barb_unit_mp[rows, sr].clone()
        full = self.barb_unit_mp_full[rows, sr]
        frm = start.clone()
        stop = torch.zeros(R, dtype=torch.long, device=dev)
        on = torch.ones(R, dtype=torch.bool, device=dev)
        for i in range(L):
            p = path[:, i]
            on = on & (i < plen)
            if not bool(on.count_nonzero()):
                break
            pc = p.clamp(min=0)
            dcol = (self.neigh[frm] == pc.unsqueeze(1)).long().argmax(dim=1)
            c = torch.where(naval, torch.full_like(dcol, self._mp_scale), cost_land[rows, frm, dcol])
            on = on & ~((mp < c) & (mp < full))
            mp = torch.where(on, (mp - c).clamp(min=0), mp)
            stop = torch.where(on, torch.full_like(stop, i + 1), stop)
            frm = torch.where(on, pc, frm)
            on = on & (mp > 0) & ~halts[ar, pc]
        # never a turn's end on its own stacking unit
        for _ in range(L):
            back_off = (stop > 0) & own[ar, path.gather(1, (stop - 1).clamp(min=0).unsqueeze(1)).squeeze(1).clamp(min=0)]
            if not bool(back_off.count_nonzero()):
                break
            stop = stop - back_off.long()
        gslot = torch.zeros(B, dtype=torch.long, device=dev)
        gslot[rows] = sr + self.POOL_LO["barb"]
        going = stop > 0
        # the own unit the walker passes over on its plot (a merged slot, -1
        # none): the occupancy plane holds one unit, so it goes back once the
        # walker steps on
        under = torch.full((R,), -1, dtype=torch.long, device=dev)
        for i in range(L):
            go = going & (i < stop)
            if not bool(go.count_nonzero()):
                break
            here = self.barb_unit_tile[rows, sr].clamp(min=0)
            nxc = path[:, i].clamp(min=0)
            dcol = (self.neigh[here] == nxc.unsqueeze(1)).long().argmax(dim=1)
            mil = self.military_at[rows, nxc]
            stacked = own[ar, nxc]
            okB = torch.zeros(B, dtype=torch.bool, device=dev)
            okB[rows] = go
            hereB = torch.zeros(B, dtype=torch.long, device=dev)
            hereB[rows] = here
            nxtB = torch.zeros(B, dtype=torch.long, device=dev)
            nxtB[rows] = nxc
            dirB = torch.zeros(B, dtype=torch.long, device=dev)
            dirB[rows] = dcol
            mvB = self._step_verb(okB, gslot, hereB, nxtB, dirB, BARB_SEAT, torch.zeros_like(okB), clear_camp=False)
            moved = mvB[rows]
            back_on = moved & (under >= 0)
            if bool(back_on.count_nonzero()):
                self.military_at[rows[back_on], here[back_on]] = under[back_on]
            under = torch.where(moved, torch.where(stacked, mil, torch.full_like(mil, -1)), under)
            going = moved & (self.barb_unit_mp[rows, sr] > 0)

    # ------------------------------------------------------ the tactical pass

    def _tac_ai(self) -> tuple[torch.Tensor, torch.Tensor]:
        """[B, P] long twice — each barbarian's AI type (`aiTypeOf`: its
        tribe's camp defender DEFENDER while the camp stands, its scouts
        EXPLORE, a civilian none (-1), every other COMBAT) and the tribe that
        raised it (`tribeOf`, its defender included; -1 none)."""
        dev = self.device
        ut = self.barb_unit_type.clamp(min=0, max=self.NU - 1)
        fighter = self._type_dom_mil.take(ut)
        tribe = self.barb_unit_tribe.clone()
        isdef = torch.zeros_like(fighter)
        kt = torch.arange(self.KT, device=dev).unsqueeze(0)
        has = (self.tribe_defender >= 0) & (kt < self.n_tribes.unsqueeze(1))
        if bool(has.count_nonzero()):
            b_i, k_i = has.nonzero(as_tuple=True)
            d = self.tribe_defender[b_i, k_i]
            tribe[b_i, d] = k_i
            isdef[b_i, d] = self.tribe_alive[b_i, k_i]
        scout = self.barb_unit_scout & (self.barb_unit_tribe >= 0)
        ai = torch.where(isdef, _AI_DEFENDER, torch.where(scout, _AI_EXPLORE, _AI_COMBAT))
        return torch.where(fighter, ai, torch.full_like(ai, -1)), tribe

    def _barbarian_tactics(self, acting: torch.Tensor) -> None:
        """THE BARBARIANS' TACTICAL PASS (`barbarianTactics`) for the units
        of `acting` [B, P] — those that stood before their camps raised this
        turn's: each one's planning reach taken before any moves, then the
        moves of Tactics.xml's "Default Barbarian" and "Default Barbarian HL"
        lists in order, each walking the units the moves before it left — in
        their pool's slot order (`barb_unit_slotno`), the stand-ins in the
        engine's unit order."""
        self._tac_in_pass = True
        self._tac_cost_held = None
        self._tac_full_held = None
        try:
            self._tac_pass(acting)
        finally:
            self._tac_in_pass = False
            self._tac_cost_held = None
            self._tac_full_held = None

    def _tac_pass(self, acting: torch.Tensor) -> None:
        """`_barbarian_tactics`' moves"""
        dev = self.device
        B, T = self.B, self.T
        P = simbase.BARB_POOL_MAX
        BIG = 1 << 40
        bidx = torch.arange(B, device=dev)
        done = torch.zeros(B, P, dtype=torch.bool, device=dev)
        ai, utribe = self._tac_ai()

        def live() -> torch.Tensor:
            return acting & ~done & self.barb_unit_alive & (self.barb_unit_seat == BARB_SEAT)

        # the planning's reach, two turns, no zones of control
        want = live() & (ai >= _AI_EXPLORE)
        rows, slots = want.nonzero(as_tuple=True)
        rowof = torch.full((B, P), -1, dtype=torch.long, device=dev)
        if rows.numel():
            rowof[rows, slots] = torch.arange(rows.shape[0], device=dev)
            res = self._tac_search(rows, slots, BARB_SEAT, _PLAN_TURNS, False)
            rank, rturn = res["rank"], res["turns"]
        else:
            rank = torch.full((1, T), -1, dtype=torch.long, device=dev)
            rturn = rank.clone()
        rsafe = rowof.clamp(min=0)

        def reach_at(tiles: torch.Tensor) -> torch.Tensor:
            """[B, P] the turn each unit's reach reaches the game's plot, -1 none"""
            if not rows.numel():
                return torch.full((B, P), -1, dtype=torch.long, device=dev)
            v = rturn[rsafe, tiles.clamp(min=0, max=T - 1).unsqueeze(1).expand(-1, P)]
            return torch.where(rowof >= 0, v, torch.full_like(v, -1))

        slotno = torch.where(acting, self.barb_unit_slotno, torch.full_like(self.barb_unit_slotno, BIG))
        order = torch.argsort(slotno, dim=1, stable=True)
        npass = acting.sum(dim=1)

        def first_by_slot(cand: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
            k = torch.where(cand, slotno, torch.full_like(slotno, BIG))
            return cand.any(dim=1), k.argmin(dim=1)

        # an operation's units are the operation's
        op = self.barb_unit_op.clone()
        done |= self._barb_stand_in(live, lambda u, tgt: op[:, u])
        done |= op & acting
        # Barbarian Rampage
        ramp = (ai >= _AI_COMBAT) & (utribe >= 0) & ~self.tribe_alive.gather(1, utribe.clamp(min=0))
        done |= self._barb_stand_in(live, lambda u, tgt: ramp[:, u])
        # Attack High Priority
        done |= self._barb_stand_in(live, lambda u, tgt: None if tgt is None else (ai[:, u] >= _AI_COMBAT) & (tgt < T))

        # DEFEND CAMPS: each camp in plot order, its first DEFENDER by slot
        # whose reach takes it within three turns
        camps = torch.where(self.camp_tile >= 0, self.camp_tile, torch.full_like(self.camp_tile, BIG))
        camps = camps.sort(dim=1).values
        for c in range(camps.shape[1]):
            camp = camps[:, c]
            on = camp < BIG
            if not bool(on.count_nonzero()):
                break
            rt = reach_at(camp)
            cand = live() & (ai == _AI_DEFENDER) & (rt >= 1) & (rt <= _DEFEND_CAMP_TURNS) & on.unsqueeze(1)
            has, u_b = first_by_slot(cand)
            if not bool(has.count_nonzero()):
                continue
            away = has & (self.barb_unit_tile[bidx, u_b] != camp)
            self._tac_move_to(away, u_b, camp)
            done[bidx[has], u_b[has]] = True

        # PILLAGE District, then Improvement: the plots the barbarians see
        seen = self._barb_seen("barbarians")
        own = self.tile_seat
        terr = (own >= 0) & ((own < BARB_SEAT) | (own == FREE_SEAT))
        for districts in (True, False):
            if districts:
                ok = ((self.district >= 0) & (self.district != self._encamp_didx) & self.district_complete
                      & ~self.district_pillaged)
            else:
                ok = (self.improvement >= 0) & ~self.pillaged
            tgt = seen & terr & ok
            el = live() & (ai >= _AI_EXPLORE)
            er = el[rows, slots] if rows.numel() else torch.zeros(0, dtype=torch.bool, device=dev)
            if not bool(er.count_nonzero()):
                continue
            r1 = torch.zeros(B, T, dtype=torch.float32, device=dev)
            r1.index_add_(0, rows[er], (rturn[er] == 1).float())
            tgt &= r1 > 0
            ntg = tgt.sum(dim=1)
            J = int(ntg.max())
            tiles = torch.where(tgt, self._arange_bt, torch.full_like(self._arange_bt, T)).sort(dim=1).values
            for j in range(J):
                t = tiles[:, j]
                active = j < ntg
                last = torch.full((B,), -1, dtype=torch.long, device=dev)
                while bool(active.count_nonzero()):
                    rt = reach_at(t)
                    here = self.barb_unit_tile.clamp(min=0)
                    at_t = self.barb_unit_tile == t.unsqueeze(1)
                    if districts:
                        stand = (self.district.gather(1, here) >= 0) | self._centre_plane().gather(1, here)
                    else:
                        stand = self.improvement.gather(1, here) >= 0
                    cand = (live() & (ai >= _AI_EXPLORE) & (rt == 1) & (slotno > last.unsqueeze(1))
                            & (at_t | ~stand) & active.unsqueeze(1))
                    has, u_b = first_by_slot(cand)
                    if not bool(has.count_nonzero()):
                        break
                    last = torch.where(has, slotno[bidx, u_b], last)
                    away = has & ~at_t[bidx, u_b]
                    self._tac_move_to(away, u_b, t)
                    there = has & (self.barb_unit_tile[bidx, u_b] == t)
                    self._barb_pillage_here(there, u_b)
                    done[bidx[has], u_b[has]] = True
                    active = has & ~there

        # WANDER NEAR CAMP: by slot, each unit above EXPLORE whose camp stands
        for j in range(int(npass.max()) if B else 0):
            u_b = order[:, j]
            ok = (j < npass) & live()[bidx, u_b] & (ai[bidx, u_b] > _AI_EXPLORE)
            tr = utribe[bidx, u_b]
            ok &= (tr >= 0) & self.tribe_alive[bidx, tr.clamp(min=0)]
            if not bool(ok.count_nonzero()):
                continue
            camp = self.tribe_plot[bidx, tr.clamp(min=0)].clamp(min=0)
            row = rowof[bidx, u_b]
            rtu = torch.where((row >= 0).unsqueeze(1), rturn[row.clamp(min=0)], torch.full((B, T), -1, dtype=torch.long, device=dev))
            rku = rank[row.clamp(min=0)]
            mil = self.military_at
            stacked = (mil >= 0) & (self.unit_seat.gather(1, mil.clamp(min=0)) == BARB_SEAT)
            cseat = self.tile_seat[bidx, camp]
            ccity = self.tile_city[bidx, camp]
            bound = (cseat != NO_SEAT) & (ccity != -1)
            same = (self.tile_seat == cseat.unsqueeze(1)) & (self.tile_city == ccity.unsqueeze(1))
            cand = ((rtu == 1) & ~self._tac_foreign(BARB_SEAT) & ~stacked
                    & (self.pair_dist[camp].to(torch.long) <= _WANDER_CAMP_RANGE)
                    & (~bound.unsqueeze(1) | same))
            count = cand.sum(dim=1)
            pick = self._rand_range(ok & (count > 0), count)
            by_rank = torch.where(cand, rku, torch.full_like(rku, BIG)).argsort(dim=1, stable=True)
            dest = torch.where(count > 0, by_rank.gather(1, pick.clamp(max=T - 1).unsqueeze(1)).squeeze(1), camp)
            self._tac_move_to(ok, u_b, dest)
            done[bidx[ok], u_b[ok]] = True

        # Explore Land (the homeland list); the rest end their turn
        self._barb_stand_in(live, lambda u, tgt: ai[:, u] == _AI_EXPLORE)
