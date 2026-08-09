"""step(): the turn loop and seat-0's half of it.

One mixin of BatchSim (assembled in engine.py); state and helpers live on
self / gpu/core/simbase.py.
"""
from __future__ import annotations

from .simbase import *  # noqa: F401,F403 — torch, constants, helpers: the shared floor
from .simbase import _MUTABLE  # noqa: F401 — private names do not ride a star import
from . import simbase  # the PATCHABLE globals (POOL_MAX/SEAT0_POOL_MAX/_ALIAS_CHECK) must be read live


class SimStep:
    def step(
        self,
        production: torch.Tensor | None = None,
        tech: torch.Tensor | None = None,
        civic: torch.Tensor | None = None,
        units: torch.Tensor | None = None,
        envoy: torch.Tensor | None = None,
        war: torch.Tensor | None = None,
    ) -> None:
        """Advance every game one turn, applying seat 0's orders.

        Every argument is optional and None means "seat 0 decides nothing" —
        no queue, no pick, no order. Invalid entries are masked to no-ops.

        production: [B, C] long — per-city action (0..NB-1 building, NB
        settler, NB+1 idle, NB+2..NB+1+NU train that roster unit,
        NB+2+NU.. place that scaffold district; with _rl_purchase_active,
        NB+2+NU+nScaffold.. buy that building / a settler / that unit with
        gold).
        tech/civic: [B] long picks applied where the research slot is empty
        (validated against the masks; -1 = no pick).
        units: [B, simbase.SEAT0_POOL_MAX] long unit orders (0–5 move, 6–11 attack, 12
        hold), executed in slot order before the turn advances.
        envoy: [B] or [B, K] long — back that city-state with one available
        envoy (validated; -1 = none).
        war: [B] long (ignored while _rl_war_active is off) — 0..R-1 declare
        war on that civ seat, R..2R-1 sue for peace with it, -1 none. Applied
        FIRST, before unit orders, so a same-turn declaration legalizes
        attacks at execution; the pre-step masks lag it by one turn.
        """
        r, B, C, T, dev = self.rules, self.B, self.C, self.T, self.device
        rd = self.rules_dev

        # --- seat-0 diplomacy (gated) --------------------------------------------
        if war is not None and self._rl_war_active and self.R > 0:
            w = war.to(torch.long)
            ok = (w >= 0) & self.war_mask().gather(1, w.clamp(min=0).unsqueeze(1)).squeeze(1)
            if bool(ok.any()):
                decl = ok & (w < self.R)
                if bool(decl.any()):
                    oh = torch.nn.functional.one_hot(w.clamp(min=0, max=self.R - 1), self.R).bool() & decl.unsqueeze(1)
                    self.civ_only_atwar.logical_or_(oh)
                    self.war[:, 1:1 + self.civ_only_atwar.shape[1], 0] |= oh
                    self.civ_only_warturns.copy_(torch.where(oh, torch.zeros_like(self.civ_only_warturns), self.civ_only_warturns))
                pea = ok & (w >= self.R)
                if bool(pea.any()):
                    ri = (w - self.R).clamp(min=0, max=self.R - 1)
                    rr = self.rules.seats
                    cost = rr.get("peaceGold0", 150) + rr.get("peaceGoldSlope", 10) * self.civ_only_warturns.gather(
                        1, ri.unsqueeze(1)
                    ).squeeze(1).to(self.dtype)
                    oh = torch.nn.functional.one_hot(ri, self.R).bool() & pea.unsqueeze(1)
                    self.treasury.copy_(torch.where(pea, self.treasury - cost, self.treasury))
                    self.civ_only_atwar.logical_and_(~oh)
                    self.war[:, 1:1 + self.civ_only_atwar.shape[1], 0] &= ~oh
                    self.civ_only_warturns.copy_(torch.where(oh, torch.zeros_like(self.civ_only_warturns), self.civ_only_warturns))
                    self.civ_only_peaceturns.copy_(torch.where(oh, torch.zeros_like(self.civ_only_peaceturns), self.civ_only_peaceturns))

        # --- seat-0 unit orders (before the turn advances) ----------------------
        if units is not None and self.units_mode:
            self._apply_unit_actions(units)

        # --- war weariness: seat-0 accrual ---------------------------------------
        # Accrue once per turn while at war with any LIVE civ seat; decay 4× in
        # peace. Mirrors endTurn's top-of-turn update in game.ts, which runs
        # AFTER this seat's unit orders — a capture that eliminates the last
        # at-war civ seat must flip ww to DECAY the same turn. The war verb and
        # last turn's civ phase both precede this point, exactly like TS.
        # Seat 0 settles through the same `_ww_decay` every civ seat calls, on
        # row 0; there is no seat-0-specific rule.
        self._ww_decay(0)

        # --- envoys --------------------------------------------------------------
        if self.S > 0:
            if envoy is not None:
                # A [B, K] SEQUENCE like the civ-seat records; a [B] single
                # pick is accepted too. Each pick re-validates against the LIVE
                # mask, and every increment bumps _eff_version — an envoy
                # crossing the 1/3/6 thresholds changes the capital's cached
                # yields.
                e_seq = envoy.to(torch.long)
                if e_seq.dim() == 1:
                    e_seq = e_seq.unsqueeze(1)
                for _ek in range(int(e_seq.shape[1])):
                    e_act = e_seq[:, _ek]
                    ok = (e_act >= 0) & self.envoy_mask().gather(1, e_act.clamp(min=0).unsqueeze(1)).squeeze(1)
                    if bool(ok.any()):
                        rows = ok.nonzero(as_tuple=True)[0]
                        self.citystate_envoys[rows, e_act[rows]] += 1
                        self.envoys_avail.sub_(ok.long())
                        self._eff_version += 1

        # --- production choice ---------------------------------------------------
        if production is not None:
            act = torch.where(self.alive & (self.current == -1), production.to(torch.long), torch.full_like(production.to(torch.long), -1))
            buildable = self._buildable()
            is_b = (act >= 0) & (act < self.NB)
            valid_b = is_b & buildable.gather(2, act.clamp(min=0, max=self.NB - 1).unsqueeze(2)).squeeze(2)
            is_s = act == self.SETTLER
            is_u = (act >= self.UNIT_BASE) & (act < self.UNIT_BASE + self.NU)
            ut = (act - self.UNIT_BASE).clamp(min=0, max=self.NU - 1)
            trainable = (self._type_tech.unsqueeze(0) < 0) | self.techs.gather(
                1, self._type_tech.clamp(min=0).unsqueeze(0).expand(B, -1)
            )  # [B, NU]
            trainable = trainable & self._res_avail_mask(self.tile_seat == 0)  # re-validate strategic-resource access
            trainable = trainable & ~self._type_faith_only.reshape(1, -1)  # faith-only never queues (trainableUnits mirror)
            valid_u = is_u & trainable.gather(1, ut)
            if self._rl_purchase_active and self._builder_idx >= 0:
                # With purchases live, builder queues are order-coupled with
                # builder PURCHASES in the same turn (both move the escalator)
                # — the sequential walk below handles them instead.
                valid_u = valid_u & (ut != self._builder_idx)
            self.progress.copy_(torch.where(valid_b | valid_u, torch.zeros_like(self.progress), self.progress))
            self.cur_cost.copy_(torch.where(valid_b, rd.b_cost[act.clamp(min=0, max=self.NB - 1)], self.cur_cost))
            self.cur_cost.copy_(torch.where(valid_u, self._type_cost[ut], self.cur_cost))
            if self._builder_idx >= 0:
                # Builder queues escalate like the settler prefix-sum — earlier
                # slots' queues raise later slots' price (current is
                # pre-decision here, exactly like base_q). This is the only
                # line that overrides the static roster price with the
                # escalator.
                is_bu = valid_u & (ut == self._builder_idx)
                if bool(is_bu.any()):
                    bq_n = self.builders_trained.unsqueeze(1)
                    self.cur_cost.copy_(torch.where(is_bu, self._builder_cost(bq_n), self.cur_cost))
            self.current.copy_(torch.where(valid_b | valid_u, act, self.current))
            if not self._rl_purchase_active:
                # Queues resolve city-by-city in slot order, and each queued
                # settler raises the next one's price — an exclusive prefix sum
                # reproduces that sequential cost exactly. (Building/unit codes
                # above never write SETTLER, so counting current==SETTLER after
                # them sees exactly the pre-decision queue.)
                base_q = (self.current == self.SETTLER).sum(dim=1, keepdim=True)
                prefix = is_s.long().cumsum(dim=1) - is_s.long()
                n_cities = self.alive.sum(dim=1, keepdim=True)
                s_cost = r.settler_base + r.settler_per_city * (n_cities - 1 + self._seat0_settlers().unsqueeze(1) + base_q + prefix).clamp(min=0).to(self.dtype)
                self.progress.copy_(torch.where(is_s, torch.zeros_like(self.progress), self.progress))
                self.cur_cost.copy_(torch.where(is_s, s_cost, self.cur_cost))
                self.current.copy_(torch.where(is_s, torch.full_like(self.current, self.SETTLER), self.current))
            else:
                # With purchases live, settler prices and the treasury are
                # order-coupled across slots (a queued OR bought settler raises
                # the next slot's price; every purchase drains shared gold), so
                # walk slots sequentially. The mask here is the PURCHASE-eligible
                # one (worship included), not the production one the queue
                # decision uses.
                self._apply_settlers_and_purchases(act, self._buildable(include_worship=True))

            # District placement: the production decision QUEUES a scaffold
            # district — the tile is paved + feature-stripped at once
            # (queueDistrict semantics, districtComplete = false) and the build
            # slot works it off at districtCost(state), exactly like the civ
            # path. The district codes double as CURRENT codes (above the unit
            # range at NB+2+NU+si). Cities in slot order, adjacency recomputed
            # at each placement.
            if self.districts_on and self._scaffold and self._rl_district_active:
                dbase = self.UNIT_BASE + self.NU  # district action base code (NB+2+NU)
                dcp = self.rules.district_cost
                # floor(base·(1 + scale·max(tech%, civic%)))
                t_pct = self.techs.sum(dim=1).double() / float(rd.t_cost.shape[0])
                c_pct = self.civics.sum(dim=1).double() / float(rd.c_cost.shape[0])
                d_cost = torch.floor(dcp.get("base", 32) * (1 + dcp.get("scale", 9) * torch.maximum(t_pct, c_pct))).to(self.dtype)
                for c in range(C if self._rl_any_city else 1):
                    ac = act[:, c]  # city c's chosen action (-1 where not idle/alive)
                    cap_c = torch.div(self.pop[:, c] - 1, 3, rounding_mode="floor") + 1  # maxSpecialtyDistricts(pop_c)
                    for si, (di, utech, uciv, plc) in enumerate(self._scaffold):
                        has_tech = self.techs[:, utech] if utech >= 0 else (self.civics[:, uciv] if uciv >= 0 else torch.ones(B, dtype=torch.bool, device=dev))  # tech- or civic-gated
                        spec_count = ((self.district >= 0) & self._is_specialty[self.district.clamp(min=0)] & (self.owner == c) & ~self.district_dead).sum(dim=1)  # LIVE specialty only (recomputed)
                        not_owned = ~((self.district == di) & (self.owner == c) & ~self.district_dead).any(dim=1)  # one-per-type (LIVE)
                        under_cap = (plc == 1) | (spec_count < cap_c)  # Aqueduct is non-specialty → no cap
                        want = (ac == dbase + si) & has_tech & under_cap & not_owned
                        if bool(want.any()):
                            # the discount reads BEFORE the placement registers
                            disc = self._district_discounted(di)
                            d_cost_si = torch.where(disc, torch.floor(d_cost * 0.6), d_cost)
                            placed, best = self._place_district(di, want, c, plc)
                            if bool(placed.any()):
                                self.current[:, c] = torch.where(placed, torch.full_like(self.current[:, c], dbase + si), self.current[:, c])
                                self.cur_cost[:, c] = torch.where(placed, d_cost_si, self.cur_cost[:, c])
                                self.progress[:, c] = torch.where(placed, torch.zeros_like(self.progress[:, c]), self.progress[:, c])
                                self.q_dtile[:, c] = torch.where(placed, best, self.q_dtile[:, c])

        # --- research choice (validated; -1 or invalid = keep pending) ---------
        if tech is not None:
            t_act = tech.to(torch.long)
            ok = (self.cur_tech == -1) & (t_act >= 0) & self._available_mask(self.techs, self._prereq_t).gather(1, t_act.clamp(min=0).unsqueeze(1)).squeeze(1)
            self.cur_tech.copy_(torch.where(ok, t_act, self.cur_tech))
        if civic is not None:
            c_act = civic.to(torch.long)
            ok = (self.cur_civic == -1) & (c_act >= 0) & self._available_mask(self.civics, self._prereq_c).gather(1, c_act.clamp(min=0).unsqueeze(1)).squeeze(1)
            self.cur_civic.copy_(torch.where(ok, c_act, self.cur_civic))

        # --- eurekas (mirrors detectBoosts at the start of endTurn) ------------
        self._detect_boosts()

        # --- refreshUnits: heal only units that spent NO MP since their last
        # refresh — +20 in a friendly city (barbs: on their camp), +15 own
        # territory, +10 neutral ground, +5 foreign-owned land. The heal
        # precedes the MP reset, so seat-0 orders from THIS step and
        # hostile-phase acts from the PREVIOUS step both gate. -------------------
        if self.units_mode:
            cap = self.rules.combat.get("unitHp", 100)
            # ONE heal rule, three pools. See _seat_heal.
            for _pre in ("barb", "civ", "seat0"):
                _hp = getattr(self, f"{_pre}_hp")
                _hp.copy_(torch.where(
                    getattr(self, f"{_pre}_alive") & ~self._spent_mp(_pre),
                    (_hp + self._seat_heal(_pre)).clamp(max=cap), _hp,
                ))
            # FORTIFY: co-located with the heal and keyed on the EXACT SAME
            # gate (movesLeft >= movesFull = spent no MP since the last
            # refresh). A live MILITARY unit that stayed put digs in (+1, cap
            # 2); a move or attack resets it. Civilians and NAVAL units never
            # fortify. ONE rule, three pools — every pool can hold a hull, so
            # the naval gate applies to all three.
            for _pre in ("barb", "civ", "seat0"):
                _alive = getattr(self, f"{_pre}_alive")
                _typ = getattr(self, f"{_pre}_type")
                _spent = self._spent_mp(_pre)
                _fort = getattr(self, f"{_pre}_fortify")
                _mil = (self._type_combat[_typ] > 0) & ~self.unit_naval[_typ]
                _fort.copy_(torch.where(
                    _alive & _mil & ~_spent, (_fort + 1).clamp(max=2),
                    torch.where(_alive & _mil & _spent, torch.zeros_like(_fort), _fort),
                ))
            # The movesLeft reset: a fresh turn begins, granting
            # `full + generalAuraMP`. The aura is FROZEN here, inside the
            # refreshUnits mirror, so every later walker reads the snapshot
            # rather than the live (by then possibly moved) generals.
            self._refresh_aura_mp()
            # The movesLeft/movesFull reset itself, for ALL THREE pools —
            # refreshUnits loops every unit regardless of seat, and the phases
            # below (seatPhase, barbarianPhase) then overwrite the two hostile
            # pools.
            for _pre in ("seat0", "civ", "barb"):
                self._reset_mp(_pre)

        # --- worked tiles + city yields: the PER-CITY interleave ------------------
        # endTurn recomputes computeCityStats FRESH for every city inside its
        # loop, so an EARLIER city's mid-turn mutation — a district/building
        # completion shifting a later city's adjacency gold, a growth
        # reshuffling the luxury ranking, a border claim — feeds every LATER
        # city's APPLIED yields the same turn. Mirror with an invalidation-gated
        # recompute: totals refresh only when _eff_version moved or a pop
        # changed since the last compute (completions/claims bump the version;
        # growth rides the pop dirty flag).
        total, housing, growth_f, tier_idx = self._city_totals()
        lux0 = self._last_lux  # frozen for the whole walk (luxMap semantics)
        _tot_ver = self._eff_version
        # Pop changes ride a dirty FLAG set at the walk's only pop writes
        # (settler completion, growth, starvation). A clamp-at-1 write that
        # leaves pop unchanged forces a spurious recompute of identical values
        # (bit-exact, rare).
        _pop_dirty = False
        y_sum = self._eff_yields().sum(dim=2) * ((self.district < 0) & (self.built_wonder < 0)).to(self.dtype)  # paved/wondered tiles yield 0 (tileYields, yields.ts)
        # Loyalty mirrors the loop-top view: city c's tier and pop are captured
        # FRESH at its own iteration (post earlier cities' same-turn mutations,
        # pre its own production/growth) — applyLoyalty runs at the top of the
        # per-city block; the flips still resolve after the loop.
        tier_fresh = tier_idx.clone()
        pop_loyal = self.pop.clone()
        gold_add = torch.zeros(B, dtype=self.dtype, device=dev)
        sci_add = torch.zeros(B, dtype=self.dtype, device=dev)
        cul_add = torch.zeros(B, dtype=self.dtype, device=dev)
        fth_add = torch.zeros(B, dtype=self.dtype, device=dev)
        neigh_flat = self.neigh.clamp(min=0).reshape(1, -1).expand(B, -1)
        neigh_valid = (self.neigh >= 0).reshape(1, T, 6)
        # The TS side iterates state.cities in ARRAY order (splice on death,
        # push on found/capture = acquisition order), which column order stops
        # matching once a founding reuses a hole. Every cross-city coupling in
        # this walk — a completion's _eff_version bump feeding a later city's
        # totals, a border claim consuming a shared candidate tile, spawn-spot
        # contention, the accumulators' float association — depends on that
        # order, so walk the columns by city_seq rank (per-batch gathers).
        # Dead/unfounded columns sort last and stay masked no-ops. Cities
        # cannot be founded or die inside the walk, so the order is fixed here.
        walk_ord = torch.argsort(torch.where(self.alive, self.city_seq, self.city_seq + 10**6), dim=1, stable=True)
        bidx = self._bidx
        for s_rank in range(C):
            col = walk_ord[:, s_rank]  # [B] — each game's s_rank-th city by acquisition
            if self._eff_version != _tot_ver or _pop_dirty:
                total, housing, growth_f, tier_idx = self._city_totals(lux=lux0)
                _tot_ver = self._eff_version
                _pop_dirty = False
                # tileYields carries FARM-ADJACENCY food (yields.ts), which the
                # border ySum must include — a raze can free farmland onto the
                # frontier. Same plane the walk's scoring uses.
                y_sum = (self._eff_yields().sum(dim=2) + self._farmadj_food()) * ((self.district < 0) & (self.built_wonder < 0)).to(self.dtype)  # paved/wondered tiles yield 0 (tileYields, yields.ts)
            tier_fresh[bidx, col] = tier_idx[bidx, col]
            pop_loyal[bidx, col] = self.pop[bidx, col]
            t_c = total[bidx, col]  # [B, 6] this city's FRESH yields
            popf_c = self.pop[bidx, col].to(self.dtype)
            pop_c0 = self.pop[bidx, col].clone()  # loop-top pop: stats.growthNeeded freezes here, and a settler completion can shrink pop mid-block

            # --- production (this city's column) -----------------------------------
            cur_c = self.current[bidx, col]
            has_item = cur_c >= 0
            # Banked chop production pays into the head the moment a build
            # exists (game.ts consumes productionBank inside the production
            # add). VETERANCY: production toward an ENCAMPMENT item (the
            # district or its buildings) is multiplied FIRST, then the bank
            # adds unmultiplied — that order matters.
            prod_add = t_c[:, 1]
            if self._gov_has_effects and self._encamp_didx >= 0:
                emult_p = self._gov_policy_mods_cached("seat0", self.civics)[5]
                en_item = (cur_c >= 0) & (cur_c < self.NB) & (self._b_req_district[cur_c.clamp(min=0, max=self.NB - 1)] == self._encamp_didx)
                if self._encamp_si >= 0:
                    en_item = en_item | (cur_c == self.UNIT_BASE + self.NU + self._encamp_si)
                prod_add = torch.where(en_item, t_c[:, 1] * emult_p, t_c[:, 1])
            self.progress[bidx, col] = torch.where(has_item, self.progress[bidx, col] + prod_add + self.prod_bank[bidx, col], self.progress[bidx, col])
            self.prod_bank[bidx, col] = torch.where(has_item, torch.zeros_like(self.prod_bank[bidx, col]), self.prod_bank[bidx, col])
            done = has_item & (self.progress[bidx, col] >= self.cur_cost[bidx, col])
            made_settler = done & (cur_c == self.SETTLER)
            if self._settler_idx >= 0 and bool(made_settler.any()):
                # Completion SPAWNS the settler at the city — a unit like any
                # other; WHERE it founds is a later FOUND_CITY order.
                self._spawn_seat0(made_settler, self.site[bidx, col], torch.full((B,), self._settler_idx, dtype=torch.long, device=dev))
            # A completed Settler costs the city 1 pop; the dirty flag
            # refreshes later cities' totals.
            self.pop[bidx, col] = torch.where(made_settler, (self.pop[bidx, col] - 1).clamp(min=1), self.pop[bidx, col])
            made_building = done & (cur_c < self.NB)
            if bool(made_building.any()):
                bi = made_building.nonzero(as_tuple=True)[0]
                self.buildings[bi, col[bi], cur_c[bi]] = True
                # completing ANCIENT_WALLS fills the outer pool.
                if self._walls_bidx >= 0:
                    wm = bi[cur_c[bi] == self._walls_bidx]
                    if len(wm) > 0:
                        self.outer_hp[wm, col[wm]] = self._walls_hp
                self._eff_version += 1  # its yields join LATER cities' totals this turn
            made_unit = done & (cur_c >= self.UNIT_BASE) & (cur_c < self.UNIT_BASE + self.NU)
            if bool(made_unit.any()):
                # clamp max too: unmasked rows may hold district codes.
                # A trained military unit inherits city `col`'s Encampment training XP (best tier).
                xp_col = (self.buildings[bidx, col, :].long() * self._b_train_xp.reshape(1, -1)).max(dim=1).values
                self._spawn_seat0(made_unit, self.site[bidx, col], (cur_c - self.UNIT_BASE).clamp(min=0, max=self.NU - 1), init_xp=xp_col)
                if self._builder_idx >= 0:
                    # a completed builder moves the cost escalator
                    made_b = made_unit & (cur_c == self.UNIT_BASE + self._builder_idx)
                    self.builders_trained.add_(made_b.long())
            # A finished district completes its paved tile (the tile was
            # reserved at queue time in q_dtile).
            made_district = done & (cur_c >= self.UNIT_BASE + self.NU)
            if bool(made_district.any()):
                db_ = made_district.nonzero(as_tuple=True)[0]
                _dt = self.q_dtile[db_, col[db_]].clamp(min=0)
                self.district_complete[db_, _dt] = True
                # MONUMENTALITY pays era score per SPECIALTY district completed
                # (a city centre is never queued here).
                _mon = torch.zeros(self.B, dtype=torch.bool, device=self.device)
                _mon[db_] = True
                self._dedication_event(0, 0, _mon)
                # a completed ENCAMPMENT musters its garrison.
                _enc = self.district[db_, _dt] == self._encamp_didx
                self.encamp_hp[db_, _dt] = torch.where(
                    _enc, torch.full_like(_dt, self._encamp_hp_max), self.encamp_hp[db_, _dt]
                )
                self.q_dtile[db_, col[db_]] = -1
                self._eff_version += 1
            self.current[bidx, col] = torch.where(done, torch.full_like(cur_c, -1), cur_c)
            # Completion OVERFLOW is BANKED. game.ts carries it into a queued
            # item where one exists and banks otherwise; a single-slot build
            # head always has an empty queue after a completion, so the bank is
            # the only branch reachable here.
            _ovf = (self.progress[bidx, col] - self.cur_cost[bidx, col]).clamp(min=0)
            self.prod_bank[bidx, col] = torch.where(done, self.prod_bank[bidx, col] + _ovf, self.prod_bank[bidx, col])
            self.progress[bidx, col] = torch.where(done, torch.zeros_like(self.progress[bidx, col]), self.progress[bidx, col])

            # --- growth (the pop snapshot re-triggers totals for later cities) ---
            surplus = t_c[:, 0] - popf_c * r.food_per_citizen
            head = housing[bidx, col] - popf_c
            hf = torch.where(head >= 2, 1.0, torch.where(head >= 1, 0.5, 0.25).to(self.dtype)).to(self.dtype)
            effective = torch.where(surplus > 0, surplus * hf * growth_f[bidx, col], surplus)
            self.food_box[bidx, col] = self.food_box[bidx, col] + effective
            need = self._growth_needed(pop_c0)  # stats.growthNeeded: loop-top pop
            alive_c = self.alive[bidx, col]
            grow = alive_c & (self.food_box[bidx, col] >= need)
            self.pop[bidx, col] = self.pop[bidx, col] + grow.long()
            fb = self.food_box[bidx, col]
            self.food_box[bidx, col] = torch.where(grow, fb - need, fb)
            starve = alive_c & ~grow & (self.food_box[bidx, col] < 0)
            self.pop[bidx, col] = torch.where(starve, (self.pop[bidx, col] - 1).clamp(min=1), self.pop[bidx, col])
            fb2 = self.food_box[bidx, col]
            self.food_box[bidx, col] = torch.where(starve, torch.zeros_like(fb2), fb2)
            # all three pop-write masks of this rank in one host check
            if bool((made_settler | grow | starve).any()):
                _pop_dirty = True

            # --- borders (later cities see earlier claims) -------------------
            # pickBorderTile reads the LIVE map: refresh the yield ranking if
            # THIS city's own completion/growth just changed it (the box add
            # itself stays the loop-top stats value).
            if self._eff_version != _tot_ver or _pop_dirty:
                total, housing, growth_f, tier_idx = self._city_totals(lux=lux0)
                _tot_ver = self._eff_version
                _pop_dirty = False
                # tileYields carries FARM-ADJACENCY food (yields.ts), which the
                # border ySum must include — a raze can free farmland onto the
                # frontier. Same plane the walk's scoring uses.
                y_sum = (self._eff_yields().sum(dim=2) + self._farmadj_food()) * ((self.district < 0) & (self.built_wonder < 0)).to(self.dtype)  # paved/wondered tiles yield 0 (tileYields, yields.ts)
            self.culture_box[bidx, col] = self.culture_box[bidx, col] + t_c[:, 4]
            dist_c = self.dist[bidx, col]  # [B, T] — static per city, hoisted out of the claim loop
            adj_own = None  # dense on the first ready iteration, then incremental
            for _ in range(BORDER_LOOPS):
                cost_b = self._border_cost(self.tiles_acquired[bidx, col])
                ready = self.alive[bidx, col] & (self.culture_box[bidx, col] >= cost_b)
                if not ready.any():
                    break
                if adj_own is None:
                    owner_nb = self.owner.gather(1, neigh_flat).reshape(B, T, 6)
                    adj_own = ((owner_nb == col.reshape(B, 1, 1)) & neigh_valid).any(dim=2)
                cand_b = (self.owner == -1) & (self.citystate_at < 0) & (self.civ_at < 0) & (dist_c <= 5) & adj_own
                # order: dist asc, resource priority desc, yield sum desc, index asc
                # priority reads LIVE — a paved bonus resource is GONE, and an
                # orphaned pave is unowned and claimable.
                key = (
                    dist_c.to(self.dtype) * 1e12
                    - (self.res_priority * (~self.res_stripped).long()).to(self.dtype) * 1e9
                    - torch.round(y_sum * 1000) * 1e4
                    + self._arangeT.to(self.dtype)
                )
                key = torch.where(cand_b, key, self._inf_f)
                best = key.argmin(dim=1)
                has_cand = cand_b.any(dim=1)
                expand = ready & has_cand
                if expand.any():
                    rows = expand.nonzero(as_tuple=True)[0]
                    self.tile_city[rows, best[rows]] = col[rows]
                    self.tile_seat[rows, best[rows]] = 0  # seat + which city: the two halves of ownerSeat/ownerCity
                    self._tile_owner_ver += 1
                    # Each claim flips ONE tile (-1 → col, per the cand_b
                    # owner==-1 gate), so adjacency-to-col only GROWS, and only
                    # at the claimed tile's ≤6 on-map neighbours — the same
                    # booleans a dense re-derive would produce.
                    nb_b = self.neigh[best[rows]]  # [n, 6]
                    ok_b = nb_b >= 0
                    civ_pair_b = rows.unsqueeze(1).expand_as(nb_b)
                    adj_own[civ_pair_b[ok_b], nb_b[ok_b]] = True
                    cb = self.culture_box[bidx, col]
                    self.culture_box[bidx, col] = torch.where(expand, cb - cost_b, cb)
                    self.tiles_acquired[bidx, col] = self.tiles_acquired[bidx, col] + expand.long()
                    self._eff_version += 1  # a claim widens LATER cities' worked candidates
                capped = ready & ~has_cand
                cb2 = self.culture_box[bidx, col]
                self.culture_box[bidx, col] = torch.where(capped, torch.minimum(cb2, cost_b), cb2)
                if not expand.any():
                    break

            # --- empire accumulators (FRESH values; the seq-order walk makes
            # each game's float association match game.ts exactly) ------------
            gold_add = gold_add + t_c[:, 2]
            sci_add = sci_add + t_c[:, 3]
            cul_add = cul_add + t_c[:, 4]
            fth_add = fth_add + t_c[:, 5]  # faith rides the same walk

        self.treasury.add_(gold_add)
        self.science_total.add_(sci_add)
        self.culture_total.add_(cul_add)
        # Seat 0's per-turn faith income, banked in the same city walk as
        # gold/science/culture (the civ-seat twin is `civ_only_faith + faith_sum`).
        self.faith.add_(fth_add)
        # TOURISM — accumulated ONCE per turn at the seat level, right after
        # the city loop and BEFORE the loyalty collapses.
        self.tourism_total.copy_(self.tourism_total + self._tourism_of(
            self.gw_writing, self.gw_art, self.gw_music, self.alive, self.tile_seat == 0, self._civ_era(self.techs, self.civics),
            self.relics,
            self.techs[:, self._gw_printing_tech] if self._gw_printing_tech >= 0 else None,
            self.artifacts,
        ))
        # DIPLOMATIC FAVOR — government TIER + suzerainties, once per turn at
        # the seat level.
        self.diplo_favor.add_(self._adopted_gov_tier(self.civics) + self._favor_per_suz * self._suzerain_count())
        # Seat 0's grievances decay by 1 each turn at peace with EVERY civ seat
        # (floor 0), immediately after the tourism accumulator. The
        # +WARMONGER_DOW accrual on declaring has no twin here because no
        # declare-war grievance path reaches seat 0; the CAPTURE accrual does
        # mirror, in _capture_civ_city.
        self.warmonger.copy_(torch.where(
            (self.warmonger > 0) & ~self.civ_only_atwar.any(dim=1),
            self.warmonger - 1,
            self.warmonger,
        ))

        # --- loyalty & defections (right after the city loop) ------------------------------
        self._apply_loyalty_and_flips(tier_fresh, pop_loyal)
        # Every POST-WALK consumer (empire_score, the state digest) must see
        # FRESH stats: computeCityStats re-ranks luxuryAmenities LIVE, so a
        # mid-walk pop change can move a luxury grant and flip amenity tiers
        # away from the walk's FROZEN map. The walk's accumulators keep the
        # frozen-map yields; only the cached totals must not leak past the walk.
        self._eff_version += 1

        # --- the hostile world (after the city loop, before research) ----------------------
        if self.units_mode:
            self.treasury.sub_((self.seat0_unit_alive.to(self.dtype) * self._type_maintenance[self.seat0_unit_type]).sum(dim=1))
            self._bankrupt_disband()  # after upkeep, before the barb phase
            self._barbarian_phase()
        if self.disasters:
            self._disaster_phase()
        self._city_state_phase()
        self._seat_phase()

        # --- research ---------------------------------------------------------------------
        # The research streams use the same per-city FRESH sums the city loop
        # accumulated (turnScience/turnCulture in game.ts). An empty research
        # slot stays empty without a pick — there is no auto-research.
        turn_science = sci_add
        turn_culture = cul_add
        self.tech_prog.add_(turn_science)
        for _ in range(RESEARCH_LOOPS):
            active = self.cur_tech >= 0
            eff = self._eff_cost(
                rd.t_cost.gather(0, self.cur_tech.clamp(min=0)),
                self.tech_boosted.gather(1, self.cur_tech.clamp(min=0).unsqueeze(1)).squeeze(1),
                golden_civ=0,  # seat 0's golden FREE_INQUIRY dedication
            )
            fin = active & (self.tech_prog >= eff)
            if not fin.any():
                break
            rows = fin.nonzero(as_tuple=True)[0]
            self.techs[rows, self.cur_tech[rows]] = True
            # ANY tech completion bumps — unlocks feed _buildable, and the
            # mine-boost/Replaceable-Parts techs feed the yield/score caches.
            # Over-invalidation only costs a recompute of identical values.
            self._eff_version += 1
            self.tech_prog.copy_(torch.where(fin, self.tech_prog - eff, self.tech_prog))
            self.cur_tech.copy_(torch.where(fin, torch.full_like(self.cur_tech, -1), self.cur_tech))
        # Banked progress only drains once the tree is exhausted (mirrors
        # advanceResearch; progress banks while the slot is undecided).
        no_tech = (self.cur_tech == -1) & ~self._available_mask(self.techs, self._prereq_t).any(dim=1)
        self.tech_prog.copy_(torch.where(no_tech, torch.minimum(self.tech_prog, torch.zeros_like(self.tech_prog)), self.tech_prog))

        self.civic_prog.add_(turn_culture)
        for _ in range(RESEARCH_LOOPS):
            active = self.cur_civic >= 0
            eff = self._eff_cost(
                rd.c_cost.gather(0, self.cur_civic.clamp(min=0)),
                self.civic_boosted.gather(1, self.cur_civic.clamp(min=0).unsqueeze(1)).squeeze(1),
                golden_civ=0, is_civic=True,  # seat 0's golden PEN_BRUSH dedication
            )
            fin = active & (self.civic_prog >= eff)
            if not fin.any():
                break
            rows = fin.nonzero(as_tuple=True)[0]
            self.civics[rows, self.cur_civic[rows]] = True
            # ANY civic completion bumps (Feudalism farm-adjacency +
            # civic-gated buildings in _buildable).
            self._eff_version += 1
            self.civic_prog.copy_(torch.where(fin, self.civic_prog - eff, self.civic_prog))
            self.cur_civic.copy_(torch.where(fin, torch.full_like(self.cur_civic, -1), self.cur_civic))
        no_civic = (self.cur_civic == -1) & ~self._available_mask(self.civics, self._prereq_c).any(dim=1)
        self.civic_prog.copy_(torch.where(no_civic, torch.minimum(self.civic_prog, torch.zeros_like(self.civic_prog)), self.civic_prog))

        # Seat 0's great people (advanceGreatPeople) — after research,
        # mirroring endTurn's order (the civ seats claimed earlier this step).
        # Science/culture bank toward the next turn's tech/civic;
        # gold/production apply now.
        self._advance_great_people()

        # --- Dead-slot reclamation, at the step END and never the top:
        # callers sample slot-keyed unit actions from the PRE-step masks, so
        # the layout must hold from unit_action_mask() through this step's
        # applies. Stable compaction is otherwise behavior-invariant (the TS
        # arrays splice; living relative order is the spec). Fires when a
        # pool's high-water nears its cap, or constantly under
        # CIV6_RECLAIM_AT.
        if self.units_mode:
            if int(self.next_slot.max()) >= self._reclaim_at:
                self._reclaim_pool("barb")
            if int(self.civ_unit_next.max()) >= self._reclaim_at:
                self._reclaim_pool("civ")
            if int(self.seat0_unit_next.max()) >= self._reclaim_at:
                self._reclaim_pool("seat0")
        if self.R > 0:
            # rc high-water = last-alive slot + 1 (what the next append uses)
            civ_city_hw = (self.civ_city_alive.long() * (torch.arange(self.RC, device=dev).reshape(1, 1, -1) + 1)).amax(dim=2)
            if int(civ_city_hw.max()) >= self._civ_city_reclaim_at:
                self._reclaim_civ_cities()
            # After compaction (the riskiest registry reshuffle) and all of
            # this step's placements/captures — env-gated, so free when off.
            if self._civ_city_reg_check:
                self._check_rc_registry_invariant()

        # Religious pressure spread — after all foundings/settles/flips and the
        # rc compaction, mirroring endTurn's tail.
        self._spread_religious_pressure()

        self._ww_audit()
        self.turn += 1
        # Era boundary — the eraBoundary mirror, run right after the turn
        # increment. Every seat's Age for the NEW era comes from the just-ended
        # window's score (Dark < darkT ≤ Normal < goldenT ≤ Golden), THEN the
        # window resets. Padded/dead seats get Dark from score 0 — harmless:
        # their factor only ever multiplies alive-masked zero contributions.
        if self._era_len > 0 and self.turn % self._era_len == 0:
            # Roads reach the CLASSICAL tier (bridges) at the first era
            # boundary, latched at the same site TS latches it.
            self.road_bridged = True
            sc = self.era_score
            # The PREVIOUS age, the Heroic test's substrate. CLONED because
            # civ_age is written IN PLACE below — a bare reference would read
            # back the NEW age and the Dark->Golden test could never fire.
            _was = self.civ_age.clone()
            self.civ_age.copy_(torch.where(
                sc < self._era_dark,
                torch.zeros_like(self.civ_age),
                torch.where(sc >= self._era_gold, torch.full_like(self.civ_age, 2), torch.ones_like(self.civ_age)),
            ))
            # DEDICATIONS. One per seat per era, except the HEROIC age —
            # Dark -> Golden — which grants heroicDedications. The current age
            # alone cannot tell a Heroic age from an ordinary Golden one, which
            # is why prev_age is substrate. prev_age is preallocated in
            # __init__; write it rather than rebind it, so it stays the same
            # tensor for aliasing and _MUTABLE.
            self.prev_age.copy_(_was)
            self.dedications.copy_(torch.where(
                (_was == 0) & (self.civ_age == 2),
                torch.full_like(self.dedications, self._heroic_ded),
                torch.ones_like(self.dedications),
            ))
            # Commit to NAMED dedications — the stateless round-robin twin:
            # catalog index (era + civ + k) % N, taking `dedications[c]`
            # entries (three on a Heroic age).
            _era_i = int(self.turn // self._era_len)
            self.ded_picks[:] = -1
            for _c in range(1 + self.R):
                for _k in range(self.ded_picks.shape[2]):
                    _take = self.dedications[:, _c] > _k
                    self.ded_picks[:, _c, _k] = torch.where(
                        _take,
                        torch.full_like(self.ded_picks[:, _c, _k], (_era_i + _c + _k) % self._n_ded),
                        torch.full_like(self.ded_picks[:, _c, _k], -1),
                    )
            self.era_score[:] = 0
        # The WORLD CONGRESS convenes on the same post-increment turn number
        # the era boundary uses.
        self._world_congress()
        # DEDICATION payouts, every turn, immediately after eraBoundary. A
        # GOLDEN/HEROIC age pays faith; a DARK or NORMAL age pays era score
        # (the climb-out dedication). Both scale with the dedication COUNT, so
        # a Heroic age pays triple. Zero-draw, integer-only.
        if self._ded_payouts_live and (self._ded_faith > 0 or self._ded_era > 0):
            _gold = self.civ_age == 2
            _fa = torch.where(_gold, self.dedications * self._ded_faith, torch.zeros_like(self.dedications))
            _es = torch.where(_gold, torch.zeros_like(self.dedications), self.dedications * self._ded_era)
            self.era_score.add_(_es)
            self.faith.copy_(self.faith + _fa[:, 0].to(self.faith.dtype))
            if self.R > 0:
                self.civ_only_faith.copy_(self.civ_only_faith + _fa[:, 1 : 1 + self.R].to(self.civ_only_faith.dtype))
        dom = self._domination()
        # A science victory (3, seat 0) / defeat (4, a civ seat) set during
        # THIS turn's project completions takes precedence over the
        # domination/score recompute and is preserved.
        space_won = (self.victory_type == 3) | (self.victory_type == 4)
        rel = self._religious_victor()  # on the follow set the spread just flipped
        # CULTURE victory, evaluated only where religion did not already win.
        cul = torch.where(rel >= 0, torch.full_like(rel, -1), self._culture_victor())
        # DIPLOMATIC victory, evaluated only where neither religion nor culture
        # already won.
        dip = torch.where((rel >= 0) | (cul >= 0), torch.full_like(rel, -1), self._diplomatic_victor())
        self.game_over = space_won | (dom >= 0) | (rel >= 0) | (cul >= 0) | (dip >= 0) | (self.turn > self.rules.turn_limit)
        # precedence space > domination > religion (5/6) > culture (7/8) > DIPLOMATIC (9/10) > score
        rel_vt = torch.where(rel == 0, torch.full_like(rel, 5), torch.full_like(rel, 6))
        cul_vt = torch.where(cul == 0, torch.full_like(cul, 7), torch.full_like(cul, 8))
        dip_vt = torch.where(dip == 0, torch.full_like(dip, 9), torch.full_like(dip, 10))
        self.victory_type.copy_(torch.where(space_won, self.victory_type, torch.where(dom >= 0, torch.full_like(dom, 2), torch.where(rel >= 0, rel_vt, torch.where(cul >= 0, cul_vt, torch.where(dip >= 0, dip_vt, torch.where(self.game_over, torch.ones_like(dom), torch.zeros_like(dom))))))))
        # leader() is a full score pass over every seat and only matters where
        # a game just ENDED; winner stays -1 for running games either way.
        lead = self.leader() if bool(self.game_over.any()) else torch.full_like(dom, -1)
        self.winner = torch.where(dom >= 0, dom, torch.where(self.game_over, lead, torch.full_like(dom, -1)))

        if simbase._ALIAS_CHECK:
            self._check_state_discipline()
