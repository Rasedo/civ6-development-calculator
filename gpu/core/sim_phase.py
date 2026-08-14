"""The seat phase: rules processing for the civ seats (yields, growth, borders, completion, loyalty, transfers).

One mixin of BatchSim (assembled in engine.py); state and helpers live on
self / gpu/core/simbase.py.
"""
from __future__ import annotations

from .simbase import *  # noqa: F401,F403 — torch, constants, helpers: the shared floor
from .simbase import _MUTABLE  # noqa: F401 — private names do not ride a star import
from . import simbase  # the PATCHABLE globals (the pool caps/_ALIAS_CHECK) must be read live


class SimPhase:
    def _seat_phase(self, war: torch.Tensor | None = None) -> None:
        """Runs EVERY seat in id order — the seatPhase twin. Row 0 takes its
        turn first through _seat0_row; the civ rows follow through the loop
        below, one body each. Every row's DECISIONS arrive through the same
        stash (`_stash_record` / `_stash_buy`, keyed by absolute row), so the
        only wire argument left here is `war` — seat 0's declare column, which
        applies at the geo pass below rather than at the record position.

        Per seat: ww decay, boosts, CS diplomacy/quests, record picks, the
        buy ladder, trade, per-city economy (yields, growth, queue progress/
        completion — settlers and units spawn at their own city), border
        growth, loyalty, research, upkeep, great-people/pantheon/belief races
        (draws), then war or peace acts with their end-of-branch rolls."""
        rr, B, dev = self.rules.seats, self.B, self.device
        # Freeze the MAJORS' aura MP here: the seatPhase movesLeft reset
        # covers every isCiv unit — seat 0's pool included — ahead of any
        # general war-walk, so both engines read the same pre-move general
        # positions.
        if self.units_mode:
            self._refresh_aura_mp()
            self._reset_mp("major")
        # The geopolitics arms run BEFORE the per-seat loop — denounce and
        # alliance first (a fresh grudge blocks a same-turn alliance and
        # starts the formal clock), then the declarations in ACTOR order
        # (seat 0's declare arm leads, then the civ↔civ pass — the war is
        # live for both sides' war-acts this turn); peace at the tail.
        if self.R > 0:
            self._geo_denounce_and_ally()
        # Seat 0 declares through the geo pass like every seat (the rec.war
        # self-guard's twin: its own war column can never mean itself). The
        # arm re-validates against the LIVE mask at this position.
        if war is not None and self._rl_war_active and self.R > 0:
            w0 = war.to(torch.long)
            ok0 = self.alive.any(dim=1) & (w0 >= 0) & self.war_mask().gather(1, w0.clamp(min=0).unsqueeze(1)).squeeze(1)
            decl = ok0 & (w0 < self.R)
            if bool(decl.any()):
                oh = torch.nn.functional.one_hot(w0.clamp(min=0, max=self.R - 1), self.R).bool() & decl.unsqueeze(1)
                self.civ_only_atwar.logical_or_(oh)
                self.war[:, 1:1 + self.civ_only_atwar.shape[1], 0] |= oh
                self.civ_only_warturns.copy_(torch.where(oh, torch.zeros_like(self.civ_only_warturns), self.civ_only_warturns))
        if self.R > 0:
            self._geo_declare_wars()
        # ROW 0: seat 0's whole turn, through the same body order as every
        # civ row below (the TS loop iterates state.seats — seat 0 first).
        self._seat0_row()
        for r in range(self.R):
            n_cities = self.civ_city_alive[:, r].sum(dim=1)
            active = self.civ_only_alive[:, r] & (n_cities > 0)
            if not bool(active.any()):
                # TS's eliminated-actor `continue` — but the record intents are
                # for THIS turn and must not survive into the next one.
                self._seat_record_apply(r + 1, active)
                continue
            # War weariness SETTLES here: accrual happens per BATTLE as the
            # fighting resolves, so what is left for the block top is the
            # decay. The same function every seat calls, on this civ's row.
            # civ_pair_war is fixed for the turn by the phase-top declaration pass,
            # so the "at war with somebody" test inside is stable.
            self._ww_decay(r + 1, active)
            # Eurekas/inspirations from this seat — the TS twin runs at the
            # same point (the seat's block top).
            self._detect_seat_boosts(r + 1, active)
            # The CS-diplomacy block sits right after boost detection — the
            # seatPhase position. Row addressing: civ r is seat row r+1.
            self._seat_influence_phase(r + 1, active)
            # CS quests resolve/issue right after the envoy accrual (the
            # seatPhase quest block sits at the tail of the same CS block), so
            # a completed quest's envoy is visible to the levy suzerain test
            # later this phase.
            self._seat_quest_phase(r + 1, active)
            # THE RECORD: tech, civic, envoys, production — one body, every seat
            # row, at applySeatActionRecord's own position.
            self._seat_record_apply(r + 1, active)
            # THE gold/faith block — one body, every seat row.
            self._seat_buy_ladder(r + 1, active)
            # The trade creation block sits between the buy block and the
            # city-loop snapshot — the seatPhase position.
            self._seat_trade_phase(r + 1, active)
            # The city-loop snapshot is taken AFTER the buy block (the
            # [...civ.cities] discipline): a bought-settler newborn acts this
            # turn (amenity + yields), a queue-completion newborn (founded
            # inside the loop, later) does not.
            alive_c = self.civ_city_alive[:, r].clone()

            # phase-top unlock snapshot
            prod_sum = torch.zeros(B, dtype=torch.float64, device=dev)
            sci_sum = torch.zeros(B, dtype=torch.float64, device=dev)
            cul_sum = torch.zeros(B, dtype=torch.float64, device=dev)
            gold_sum = torch.zeros(B, dtype=torch.float64, device=dev)
            faith_sum = torch.zeros(B, dtype=torch.float64, device=dev)
            # The amenity map freezes at the loop top (the luxMap discipline)
            # — loyalty, growth and yields all read it.
            amen_tidx, amen_gf, amen_yf, _ = self._seat_amenity(r + 1)
            # This civ's governor seats for THIS turn — the loop-top
            # governorPicks mirror (quantized milli loyalty snapshot, ties by
            # slot index == TS array order; alive-masked).
            _titles_r = (self.civ_only_civics[:, r].sum(dim=1) // self._gov_per).clamp(max=self._gov_max)  # [B]
            _q_rloy = js_round(self.civ_city_loyalty[:, r] * 1000).long()
            _gk = torch.where(self.civ_city_alive[:, r], _q_rloy * 64 + torch.arange(self.RC, device=dev).reshape(1, -1), torch.full_like(_q_rloy, 1 << 40))
            _gr = torch.empty_like(_gk)
            _gr.scatter_(1, _gk.argsort(dim=1, stable=True), torch.arange(self.RC, device=dev).expand(B, self.RC))
            civ_city_gov = (_gr < _titles_r.unsqueeze(1)) & self.civ_city_alive[:, r]  # [B, RC]
            civ_city_flip = torch.zeros(B, self.RC, dtype=torch.bool, device=dev)
            # Unbesieged cities heal the flat rate, war or not (real Civ 6) —
            # the same cityHealPerTurn rules field _barbarian_phase reads.
            heal = int(self.rules.combat.get("cityHealPerTurn", 20))
            # The Hanging-Gardens growth product reads the CIV-wide wonder
            # registry — identical for every j, so it is hoisted per r. A
            # wonder COMPLETION mid-loop (the only in-loop write to its inputs:
            # a settler founding only rewrites an all--1 free slot, product
            # term 1.0 either way) drops the cache and the next j recomputes
            # the same expression on the fresh state.
            gw_cache = self._wonder_growth_mult(self._completed_wonders(r + 1))
            # One guard sync for the whole economy loop. This is exact because
            # alive_c is a pre-loop CLONE (a queue-completion newborn founded
            # inside the loop does not act this turn — the [...civ.cities]
            # discipline above) and `active` is a loop-invariant local, so the
            # precomputed columns equal a per-j compute.
            cact_all = active.unsqueeze(1) & alive_c  # [B, RC]
            cact_any_l = cact_all.any(dim=0).tolist()
            _rcy_bel = self._seat_has_beliefs(r + 1)  # capital fallback gate (capY live-pop)
            # The per-j housing/maintenance/growth-need math, batched over j.
            # Inputs are planes (eff-covered), own-column registries (a city's
            # own completions land at the END of its iteration, after these
            # values are consumed — no cross-column write exists), and ONE live
            # edge: civ_at at window tiles in the improvement-housing term (a
            # mid-loop border claim can put an ORPHANED improvement into a
            # later city's window), so the batch recomputes when
            # (_eff_version, _claim_version) moves — the same key discipline as
            # the yields cache. Every batched sum is dyadic/int-valued:
            # bit-exact in any shape.
            _gmul_r = self._bel_mul("growth", r + 1) if _rcy_bel else 1.0

            def _g5_hm() -> tuple[torch.Tensor, torch.Tensor]:
                housing = self._seat_housing(r + 1)[1]  # THE shared body
                p64a = self.civ_city_pop[:, r].double()
                need = torch.floor(15 + 8 * (p64a - 1) + (p64a - 1).clamp(min=0) ** 1.5)
                return housing, need

            _h_key = None
            housing_all = need_all = None
            for j in range(self.RC):
                if not cact_any_l[j]:
                    continue
                cact = cact_all[:, j]  # post-buy snapshot (a bought settler's city acts this turn)
                # City loyalty at the loop top (before yields/growth) — own =
                # THIS civ, foreign = seat 0 + every other civ; LIVE pops
                # (earlier slots in this loop have already grown, the TS
                # mid-loop mirror). The capital is immune, identified by
                # civ_city_is_cap per BATCH because compaction can move it off slot 0.
                cap_j = self.civ_city_is_cap[:, r, j]
                pin = cact & cap_j
                if bool(pin.any()):
                    self.civ_city_loyalty[:, r, j] = torch.where(pin, torch.full_like(self.civ_city_loyalty[:, r, j], 100.0), self.civ_city_loyalty[:, r, j])
                ncap = cact & ~cap_j
                if bool(ncap.any()):
                    lrng = int(rr.get("loyaltyRange", 9))
                    lscale = float(rr.get("loyaltyScale", 20))
                    here_j = self.civ_city_center[:, r, j].clamp(min=0)
                    # Per-SOURCE-seat age factors. Terms are multiples of 0.5,
                    # so the f64 sum is exact and association-free.
                    f_own = self._age_factor[self.civ_age[:, r + 1]]
                    d_own = self.pair_dist[here_j.unsqueeze(1), self.civ_city_center[:, r].clamp(min=0)].to(torch.float64)
                    own_p = ((lrng + 1 - d_own).clamp(min=0) * self.civ_city_pop[:, r].double() * self.civ_city_alive[:, r].double()).sum(dim=1) * f_own
                    d_pl = self.pair_dist[here_j.unsqueeze(1), self.site.clamp(min=0)].to(torch.float64)
                    for_p = ((lrng + 1 - d_pl).clamp(min=0) * self.pop.double() * self.alive.double()).sum(dim=1) * self._age_factor[self.civ_age[:, 0]]
                    others = self.alive.any(dim=1)
                    oth = [r2 for r2 in range(self.R) if r2 != r]
                    if oth:
                        ctr_o = self.civ_city_center[:, oth].reshape(B, -1)
                        alive_o = self.civ_city_alive[:, oth].reshape(B, -1)
                        d_o = self.pair_dist[here_j.unsqueeze(1), ctr_o.clamp(min=0)].to(torch.float64)
                        sub_o = ((lrng + 1 - d_o).clamp(min=0) * self.civ_city_pop[:, oth].reshape(B, -1).double() * alive_o.double()).reshape(B, len(oth), self.RC).sum(dim=2)
                        f_oth = self._age_factor[self.civ_age[:, [r2 + 1 for r2 in oth]]]  # [B, len(oth)]
                        for_p = for_p + (sub_o * f_oth).sum(dim=1)
                        others = others | alive_o.any(dim=1)
                    tot_p = own_p + for_p
                    press = torch.where(tot_p > 0, lscale * (own_p - for_p) / tot_p.clamp(min=1e-9), torch.zeros_like(tot_p))
                    delta_l = press + self._loyalty_amenity[amen_tidx[:, j].clamp(min=0, max=self._loyalty_amenity.shape[0] - 1)].double() + civ_city_gov[:, j].double() * self._gov_loy
                    upd_l = ncap & others
                    nxt_l = (self.civ_city_loyalty[:, r, j] + delta_l).clamp(min=0, max=float(rr.get("loyaltyMax", 100)))
                    self.civ_city_loyalty[:, r, j] = torch.where(upd_l, nxt_l, self.civ_city_loyalty[:, r, j])
                    civ_city_flip[:, j] = upd_l & (self.civ_city_loyalty[:, r, j] <= 0)
                # Column j of the keyed batched twin stands in for a per-j pass
                # (see _rcy_all_cached's exactness argument). The one
                # snapshot-vs-live divergence is capY's civ-total follower pop
                # under beliefs — TS sums pops LIVE at the capital's own loop
                # position, so capital columns take the per-j path.
                if _rcy_bel and bool(self.civ_city_is_cap[:, r, j].any()):
                    food, prod, sci, cul, gold_y, faith_y = self._seat_city_yields(r, j, cact, amen_yf=amen_yf[:, j])
                else:
                    F6 = self._rcy_all_cached(r, amen_yf)
                    zj = torch.zeros_like(F6[0][:, j])
                    food = torch.where(cact, F6[0][:, j], zj)
                    prod = torch.where(cact, F6[1][:, j], zj)
                    sci = torch.where(cact, F6[2][:, j], zj)
                    cul = torch.where(cact, F6[3][:, j], zj)
                    gold_y = torch.where(cact, F6[4][:, j], zj)
                    faith_y = torch.where(cact, F6[5][:, j], zj)
                prod_sum = torch.where(cact, prod_sum + prod, prod_sum)
                # Tile/center columns plus the citizens' contribution.
                # ASSOCIATION MATTERS: TS `sciSum += y.science + 0.7*pop`
                # desugars to sciSum + (y.science + 0.7*pop) — the city term
                # sums FIRST. (cul_sum + cul) + 0.3*pop is one ulp off and
                # flips completions when a cost lands inside it. The citizens'
                # term is already inside sci/cul, and inside the amenity tier
                # with it.
                sci_sum = torch.where(cact, sci_sum + sci, sci_sum)
                cul_c = cul  # pre-growth pop; feeds civics AND this city's border box
                cul_sum = torch.where(cact, cul_sum + cul_c, cul_sum)
                # `gold_y` is ALREADY net of the city's upkeep — the walk
                # subtracts cityMaintenance where computeCityStats does, so
                # phase.ts adds stats.total.gold straight in.
                if _h_key != (self._eff_version, self._claim_version):
                    _h_key = (self._eff_version, self._claim_version)
                    housing_all, need_all = _g5_hm()
                gold_sum = torch.where(cact, gold_sum + gold_y, gold_sum)
                faith_sum = torch.where(cact, faith_sum + faith_y, faith_sum)
                # Growth accounting: true surplus (can be negative), the
                # unscaled Civ 6 curve, grow SUBTRACTS the need, starvation
                # shrinks (pop floor 1, box reset). Housing throttles positive
                # surplus (housingGrowthFactor). The whole housing chain
                # (water/aqueduct, building housing, windowed improvement
                # housing, belief housing) is batched in _g5_hm above; the
                # dyadic/int-valued sums make the batched shapes bit-exact.
                housing_j = housing_all[:, j]
                head_j = housing_j - self.civ_city_pop[:, r, j].double()
                hfac = torch.where(head_j >= 2, torch.ones_like(head_j), torch.where(head_j >= 1, torch.full_like(head_j, 0.5), torch.full_like(head_j, 0.25)))
                surplus = food - self.rules.food_per_citizen * self.civ_city_pop[:, r, j].double()
                # Fertility Rites — the belief growth multiplier rides the
                # chain like computeCityStats (hf × tier × growthMult). Hoisted
                # (belief ids are static mid-loop, claims are post-phase);
                # gmul rebinds below, never mutates in place.
                # Hanging Gardens — the seat-wide completed-wonder growth
                # product, LIVE per city; hoisted per r above and recomputed
                # when a completion drops the cache. It stays a SEPARATE factor
                # instead of folding into gmul: computeCityStats multiplies
                # surplus × housing × tier × empireGrowthMult × m.growthMult
                # left to right, and (X × hg) × mgrowth is not X × (hg × mgrowth).
                if self._wond_n and gw_cache is None:
                    gw_cache = self._wonder_growth_mult(self._completed_wonders(r + 1))
                _gf_j = surplus * hfac * amen_gf[:, j]
                if gw_cache is not None:
                    _gf_j = _gf_j * gw_cache
                _gf_j = _gf_j * _gmul_r
                self.civ_city_growth[:, r, j] = torch.where(cact, self.civ_city_growth[:, r, j] + torch.where(surplus > 0, _gf_j, surplus), self.civ_city_growth[:, r, j])
                need = need_all[:, j]  # pre-growth pop == the batch's entry value for this column
                grow = cact & (self.civ_city_growth[:, r, j] >= need)
                self.civ_city_pop[:, r, j] = self.civ_city_pop[:, r, j] + grow.long()
                self.civ_city_growth[:, r, j] = torch.where(grow, self.civ_city_growth[:, r, j] - need, self.civ_city_growth[:, r, j])
                starve = cact & ~grow & (self.civ_city_growth[:, r, j] < 0)
                self.civ_city_pop[:, r, j] = torch.where(starve, (self.civ_city_pop[:, r, j] - 1).clamp(min=1), self.civ_city_pop[:, r, j])
                self.civ_city_growth[:, r, j] = torch.where(starve, torch.zeros_like(self.civ_city_growth[:, r, j]), self.civ_city_growth[:, r, j])
                # Queue progress + completion; a completed unit spawns at THIS
                # city, drawing no RNG. Clear-then-resolve mirrors the TS
                # shift-then-act order.
                cur = self.civ_city_current[:, r, j].clone()
                has_q = cact & (cur >= 0)
                if bool(has_q.any()):
                    # The bank pays in right after the production add, where
                    # phase.ts spends it. Then this civ's OWN
                    # encampmentProdMult, on the queue head only: the
                    # multiplier keys on the ITEM (an Encampment district or
                    # one of its buildings), not on the seat.
                    _rem = self._gov_mods(r + 1)[5] if self._gov_has_effects else None
                    if _rem is not None:
                        # A BUILDING head is its own production column (0..NB-1)
                        # on every row, so one decode serves every seat.
                        _enc_i = (cur >= 0) & (cur < self.NB) & (
                            self._b_req_district[cur.clamp(min=0, max=self.NB - 1)] == self._encamp_didx)
                        if self._encamp_si >= 0:
                            _enc_i = _enc_i | (cur == self.DISTRICT_BASE + self._encamp_si)
                        prod = torch.where(_enc_i, prod * _rem, prod)
                    self.civ_city_progress[:, r, j] = torch.where(
                        has_q, self.civ_city_progress[:, r, j] + prod + self.civ_city_prod_bank[:, r, j], self.civ_city_progress[:, r, j])
                    self.civ_city_prod_bank[:, r, j] = torch.where(
                        has_q, torch.zeros_like(self.civ_city_prod_bank[:, r, j]), self.civ_city_prod_bank[:, r, j])
                    done_q = has_q & (self.civ_city_progress[:, r, j] >= self.civ_city_cost[:, r, j])
                    if bool(done_q.any()):
                        cost_locked = self.civ_city_cost[:, r, j].clone()  # the project lump reads the LOCKED cost
                        self.civ_city_current[:, r, j] = torch.where(done_q, torch.full_like(cur, -1), self.civ_city_current[:, r, j])
                        # BANK the overflow — the phase.ts twin. Most city
                        # completions carry some, so dropping it would be a
                        # large standing production leak.
                        _rovf = (self.civ_city_progress[:, r, j] - self.civ_city_cost[:, r, j]).clamp(min=0)
                        self.civ_city_prod_bank[:, r, j] = torch.where(
                            done_q, self.civ_city_prod_bank[:, r, j] + _rovf, self.civ_city_prod_bank[:, r, j])
                        self.civ_city_progress[:, r, j] = torch.where(done_q, torch.zeros_like(self.civ_city_progress[:, r, j]), self.civ_city_progress[:, r, j])
                        self.civ_city_cost[:, r, j] = torch.where(done_q, torch.zeros_like(self.civ_city_cost[:, r, j]), self.civ_city_cost[:, r, j])
                        found_s = done_q & (cur == self.SETTLER)
                        if bool(found_s.any()):
                            # A completed settler is a UNIT: it spawns at the
                            # city and the producing city pays 1 pop (floored
                            # at 1). WHERE it founds is a later FOUND_CITY
                            # order.
                            self.civ_city_pop[:, r, j] = torch.where(
                                found_s, (self.civ_city_pop[:, r, j] - 1).clamp(min=1), self.civ_city_pop[:, r, j]
                            )
                            if self._settler_idx >= 0:
                                self._spawn_unit(r + 1, found_s, self.civ_city_center[:, r, j], self._settler_idx)
                        spawn_u = done_q & (cur >= self.UNIT_BASE) & (cur < self.UNIT_BASE + self.NU)
                        is_bldr = spawn_u & (cur - self.UNIT_BASE == self._builder_idx)
                        if bool(is_bldr.any()):
                            self._spawn_unit(r + 1, is_bldr, self.civ_city_center[:, r, j], self._builder_idx)
                            self.civ_only_builders_trained[:, r] = self.civ_only_builders_trained[:, r] + is_bldr.long()
                        spawn_u = spawn_u & ~is_bldr
                        # The MILITARY ENGINEER is a CIVILIAN chassis (charges,
                        # no combat), so it spawns through the civilian path
                        # like the Builder — the military spawner would leave
                        # it without charges. Charges come from the roster.
                        if self._seat_eng_live and self._eng_idx >= 0:
                            is_eng = spawn_u & (cur - self.UNIT_BASE == self._eng_idx)
                            if bool(is_eng.any()):
                                self._spawn_unit(r + 1, is_eng, self.civ_city_center[:, r, j], self._eng_idx)
                            spawn_u = spawn_u & ~is_eng
                        if bool(spawn_u.any()):
                            # A trained military unit inherits city j's Encampment training XP (best tier).
                            xp_rj = (self.civ_city_bldg[:, r, j, :].long() * self._b_train_xp.reshape(1, -1)).max(dim=1).values
                            self._spawn_unit(r + 1, spawn_u, self.civ_city_center[:, r, j], (cur - self.UNIT_BASE).clamp(min=0), init_xp=xp_rj)
                        # a finished district completes its paved tile
                        nS_b4 = len(self._scaffold)
                        done_d = done_q & (cur >= self.DISTRICT_BASE) & (cur < self.DISTRICT_BASE + nS_b4)
                        if bool(done_d.any()):
                            dr = done_d.nonzero(as_tuple=True)[0]
                            dtile = self.civ_city_qtile[:, r, j]
                            _dt = dtile[dr].clamp(min=0)
                            self.district_complete[dr, _dt] = True
                            # MONUMENTALITY fires on the district completion.
                            _monr = torch.zeros(self.B, dtype=torch.bool, device=self.device)
                            _monr[dr] = True
                            self._dedication_event(r + 1, 0, _monr)
                            # a completed ENCAMPMENT musters its garrison
                            _enc = self.district[dr, _dt] == self._encamp_didx
                            self.encamp_hp[dr, _dt] = torch.where(
                                _enc, torch.full_like(_dt, self._encamp_hp_max), self.encamp_hp[dr, _dt]
                            )
                            self.civ_city_qtile[dr, r, j] = -1
                            self._eff_version += 1
                        # a finished building joins the registry (bounded
                        # above: project codes sit past NB)
                        NBc = self.rules_dev.b_cost.shape[0]
                        done_b = done_q & (cur >= 0) & (cur < NBc)
                        if bool(done_b.any()):
                            br = done_b.nonzero(as_tuple=True)[0]
                            bi_done = cur.clamp(min=0, max=NBc - 1)
                            self.civ_city_bldg[br, r, j, bi_done[br]] = True
                            # A completed REGIONAL building reaches OTHER
                            # cities' yields THIS phase (TS accrues later
                            # cities live), so an civ_city_bldg write must
                            # invalidate the economy caches.
                            self._eff_version += 1
                            if self._walls_bidx >= 0:
                                wm = br[bi_done[br] == self._walls_bidx]
                                if len(wm) > 0:
                                    self.civ_city_outer_hp[wm, r, j] = self._walls_hp
                        # a finished wonder completes its tile (effects read
                        # built_wonder_complete live from the registry)
                        if self._wond_n:
                            done_w = done_q & (cur >= self.WONDER_BASE) & (cur < self.WONDER_BASE + self._wond_n)
                            if bool(done_w.any()):
                                wi_done = (cur - self.WONDER_BASE).clamp(min=0)
                                wr_ = done_w.nonzero(as_tuple=True)[0]
                                wt_ = self.civ_city_wonder[wr_, r, j, wi_done[wr_]]
                                self.built_wonder_complete[wr_, wt_.clamp(min=0)] = True
                                self.era_score[wr_, r + 1] += self._era_pts["wonder"]
                                self._eff_version += 1
                                gw_cache = None  # the hoisted growth product changed
                        # A finished project pays js_round(cost×frac) into the
                        # CIV's own streams + GPP (the completeProject twin).
                        if self._proj_rows:
                            done_p = done_q & (cur >= self.PROJECT_BASE) & (cur < self.PROJECT_BASE + len(self._proj_rows))
                            if bool(done_p.any()):
                                pi_done = (cur - self.PROJECT_BASE).clamp(min=0)
                                amt_y = js_round(cost_locked * self._proj_yf)
                                for pi_, prow in enumerate(self._proj_rows):
                                    hitp = done_p & (pi_done == pi_)
                                    if not bool(hitp.any()):
                                        continue
                                    y_i = int(prow.get("y", -1))
                                    if y_i == 3:
                                        self.civ_only_tech_prog[:, r] = torch.where(hitp, self.civ_only_tech_prog[:, r] + amt_y, self.civ_only_tech_prog[:, r])
                                    elif y_i == 4:
                                        self.civ_only_civic_prog[:, r] = torch.where(hitp, self.civ_only_civic_prog[:, r] + amt_y, self.civ_only_civic_prog[:, r])
                                    elif y_i == 2:
                                        self.civ_only_treasury[:, r] = torch.where(hitp, self.civ_only_treasury[:, r] + amt_y, self.civ_only_treasury[:, r])
                                    elif y_i == 5:
                                        self.civ_only_faith[:, r] = torch.where(hitp, self.civ_only_faith[:, r] + amt_y, self.civ_only_faith[:, r])
                                    # Pay EVERY listed class at THIS row's rate
                                    # — the Festival pays Writer/Artist/
                                    # Musician at 0.11 each, every other
                                    # project one class at 0.22. `gs`/`gf` fall
                                    # back to a single `g` + the global
                                    # fraction when the row omits them.
                                    amt_g = js_round(cost_locked * float(prow.get("gf", self._proj_gf)))
                                    g_list = prow.get("gs")
                                    if not g_list:
                                        g_one = int(prow.get("g", -1))
                                        g_list = [g_one] if g_one >= 0 else []
                                    for g_i in (int(x) for x in g_list):
                                        if 0 <= g_i < self.civ_only_gpp.shape[2]:
                                            self.civ_only_gpp[:, r, g_i] = torch.where(hitp, self.civ_only_gpp[:, r, g_i] + amt_g, self.civ_only_gpp[:, r, g_i])
                                    # A space-race step records chain progress
                                    # (space_done, seat r+1); completing the
                                    # VICTORY step ends the game as a seat-0
                                    # DEFEAT — victory_type 4, the
                                    # domination-defeat mirror. Space rows
                                    # carry y=g=-1, so the yield/GPP blocks
                                    # above are no-ops for them.
                                    if int(prow.get("sp", 0)):
                                        self.space_done[hitp, r + 1, self._space_step[pi_]] = True
                                        if pi_ in self._space_victory_idx:
                                            self.victory_type.copy_(torch.where(hitp, torch.full_like(self.victory_type, 4), self.victory_type))
                                            self.game_over.logical_or_(hitp)
                self._seat_border_growth(r + 1, torch.full((B,), j, dtype=torch.long, device=self.device), cact, cul_c)
                # City strike: a civ city with ANCIENT_WALLS fires once/turn at
                # the nearest unit hostile to THIS civ (barbarians always;
                # at-war seats' units, civilians included), range 2, lowest
                # tile index breaking ties. One roll at the city's defense vs
                # the target's (single roll, no retaliation, never captures).
                # rc (slot) order, before the heal — a kill advances the RNG.
                if self._walls_bidx >= 0:
                    Bn, Tn, dev2 = self.B, self.T, self.device
                    bidx = torch.arange(Bn, device=dev2)
                    walled = cact & self.civ_city_bldg[:, r, j, self._walls_bidx]
                    if bool(walled.any()):
                        ctr = self.civ_city_center[:, r, j].clamp(min=0)  # [B]
                        dist = self.pair_dist[ctr].to(torch.long)  # [B, T]
                        # ANY unit hostile to this civ, read off _seats_hostile
                        # — the war relation is one symmetric matrix, so
                        # hostility is looked up rather than transcribed.
                        _mil, _civ = self.military_at, self.civilian_at
                        _mseat = torch.where(_mil >= 0, self.unit_seat.gather(1, _mil.clamp(min=0)), torch.full_like(_mil, -1))
                        _cseat = torch.where(_civ >= 0, self.unit_seat.gather(1, _civ.clamp(min=0)), torch.full_like(_civ, -1))
                        hm = self._seats_hostile(r + 1, _mseat)
                        hc = self._seats_hostile(r + 1, _cseat)
                        hostile = hm | hc  # [B, T]
                        valid = walled.unsqueeze(1) & hostile & (dist >= 1) & (dist <= 2)
                        arangeT = torch.arange(Tn, device=dev2)
                        key = torch.where(valid, dist * (Tn + 1) + arangeT.reshape(1, -1), torch.full((Bn, Tn), 10**9, device=dev2, dtype=torch.long))
                        best_key = key.min(dim=1).values
                        tt = key.argmin(dim=1)  # [B]
                        strike = walled & (best_key < 10**9)
                        if bool(strike.any()):
                            # ONE defender slot; "military first" is the entire
                            # priority (one military + one civilian per tile
                            # makes the rest unreachable).
                            _okm, _okc = hm[bidx, tt], hc[bidx, tt]
                            d_slot = torch.where(_okm, _mil[bidx, tt], torch.where(_okc, _civ[bidx, tt], torch.full_like(tt, -1)))
                            d_seat = torch.where(_okm, _mseat[bidx, tt], torch.where(_okc, _cseat[bidx, tt], torch.full_like(tt, -1)))
                            ds0 = d_slot.clamp(min=0)
                            is_barb = d_seat == BARB_SEAT
                            # A MILITARY target whose seat class earns xp
                            # (caps.xp) — seat 0 or a civ seat, never a
                            # barbarian.
                            is_vet_mil = _okm & ~is_barb
                            d_type = self.unit_type[bidx, ds0]
                            # only a target whose class earns xp carries veterancy
                            def_xp = torch.where(is_vet_mil, self._xp_lvl_bonus(self.unit_xp[bidx, ds0]), torch.zeros_like(tt))
                            def_cs = self._type_combat[d_type] + self._tdef_i(bidx, tt) + def_xp
                            # An embarked target (military or civilian; barbs
                            # never embark) → flat CS, no terrain, no support.
                            d_emb = self.unit_emb[bidx, ds0] & (d_slot >= 0)
                            def_cs = torch.where(d_emb, torch.full_like(def_cs, self._embarked_defense_cs), def_cs)
                            # Garrison bonus: this civ's OWN military standing
                            # on the city's centre tile.
                            gslot = self.military_at[bidx, ctr]
                            gar = ((gslot >= 0) & (self.unit_seat[bidx, gslot.clamp(min=0)] == r + 1)).long()
                            atk_cs = torch.maximum(self.civ_only_best_melee[:, r], torch.full_like(self.civ_only_best_melee[:, r], 15)) + gar * 5
                            # the defending unit is wounded (the attacker is the city)
                            def_hp = self.unit_hp[bidx, ds0]
                            def_e = def_cs - self._wound(def_hp)
                            # The struck unit gains support from adjacent
                            # same-side military; the attacker is the city, so
                            # there is no flanking.
                            # Support keys on the DEFENDER's own seat:
                            # supportCount counts units with
                            # `u.seat === defender.seat`, which is what
                            # `d_seat` holds.
                            _, _sp = self._flank_support(tt, d_seat, torch.full((Bn,), -1, dtype=torch.long, device=dev2))
                            def_e = def_e + SUPPORT_CS * torch.where(d_emb, torch.zeros_like(_sp), _sp)  # embarked → no support
                            # DEFENDER-side general aura (the roll is
                            # atk_cs - def_e, so the aura REDUCES the damage
                            # taken), outside the embarked override. The aura
                            # is the DEFENDER's OWN seat's, which is what
                            # `d_seat` holds. Barbs own no general (-1) and a
                            # CIVILIAN is combat-0, so the aura is 0 for both.
                            _def_civ_u = torch.where(is_vet_mil, d_seat, torch.full_like(tt, -1))
                            _def_nav = torch.where(is_vet_mil, self.unit_naval[d_type.clamp(min=0, max=self.NU - 1)], torch.zeros_like(d_emb))
                            def_e = def_e + self._gen_aura_cs(_def_civ_u, tt, d_emb | _def_nav).to(def_e.dtype)
                            self._city_strike_resolve(  # one rule, four callers
                                strike, tt, d_slot, d_seat, _okm, _okc, is_vet_mil, atk_cs,
                                def_e, def_hp, r + 1, "rcstk")
                # The ADDITIONAL Encampment strike (k="restk", the twin of
                # walls' "rcstk"). City (r, j), if it owns a COMPLETE
                # unpillaged ENCAMPMENT, fires the same once/turn ranged strike
                # right AFTER its walls strike — walls first, then Encampment,
                # per rc, before the heal. civ_city_dist_tile is districts_cat-
                # indexed, matching self._encamp_didx and self.district.
                if self._encamp_didx >= 0 and self.districts_on:
                    Bn, Tn, dev2 = self.B, self.T, self.device
                    bidx = torch.arange(Bn, device=dev2)
                    enc_reg = self.civ_city_dist_tile[:, r, j, self._encamp_didx]  # [B]
                    # `encamp_hp > 0` is part of the gate: a beaten-down
                    # Encampment is occupied and fires nothing (the pestk twin).
                    enc_ok = (enc_reg >= 0) & self.district_complete.gather(1, enc_reg.clamp(min=0).unsqueeze(1)).squeeze(1) & ~self.district_pillaged.gather(1, enc_reg.clamp(min=0).unsqueeze(1)).squeeze(1) & (self.encamp_hp.gather(1, enc_reg.clamp(min=0).unsqueeze(1)).squeeze(1) > 0)
                    has_enc = cact & enc_ok
                    if bool(has_enc.any()):
                        ctr = self.civ_city_center[:, r, j].clamp(min=0)  # [B]
                        dist = self.pair_dist[ctr].to(torch.long)  # [B, T]
                        # ANY unit hostile to this civ, read off _seats_hostile
                        # — the war relation is one symmetric matrix, so
                        # hostility is looked up rather than transcribed.
                        _mil, _civ = self.military_at, self.civilian_at
                        _mseat = torch.where(_mil >= 0, self.unit_seat.gather(1, _mil.clamp(min=0)), torch.full_like(_mil, -1))
                        _cseat = torch.where(_civ >= 0, self.unit_seat.gather(1, _civ.clamp(min=0)), torch.full_like(_civ, -1))
                        hm = self._seats_hostile(r + 1, _mseat)
                        hc = self._seats_hostile(r + 1, _cseat)
                        hostile = hm | hc  # [B, T]
                        valid = has_enc.unsqueeze(1) & hostile & (dist >= 1) & (dist <= 2)
                        arangeT = torch.arange(Tn, device=dev2)
                        key = torch.where(valid, dist * (Tn + 1) + arangeT.reshape(1, -1), torch.full((Bn, Tn), 10**9, device=dev2, dtype=torch.long))
                        best_key = key.min(dim=1).values
                        tt = key.argmin(dim=1)  # [B]
                        strike = has_enc & (best_key < 10**9)
                        if bool(strike.any()):
                            # ONE defender slot; "military first" is the entire
                            # priority (one military + one civilian per tile
                            # makes the rest unreachable).
                            _okm, _okc = hm[bidx, tt], hc[bidx, tt]
                            d_slot = torch.where(_okm, _mil[bidx, tt], torch.where(_okc, _civ[bidx, tt], torch.full_like(tt, -1)))
                            d_seat = torch.where(_okm, _mseat[bidx, tt], torch.where(_okc, _cseat[bidx, tt], torch.full_like(tt, -1)))
                            ds0 = d_slot.clamp(min=0)
                            is_barb = d_seat == BARB_SEAT
                            # A MILITARY target whose seat class earns xp
                            # (caps.xp) — seat 0 or a civ seat, never a
                            # barbarian.
                            is_vet_mil = _okm & ~is_barb
                            d_type = self.unit_type[bidx, ds0]
                            def_xp = torch.where(is_vet_mil, self._xp_lvl_bonus(self.unit_xp[bidx, ds0]), torch.zeros_like(tt))
                            def_cs = self._type_combat[d_type] + self._tdef_i(bidx, tt) + def_xp
                            d_emb = self.unit_emb[bidx, ds0] & (d_slot >= 0)
                            def_cs = torch.where(d_emb, torch.full_like(def_cs, self._embarked_defense_cs), def_cs)
                            # Garrison bonus: this civ's OWN military standing
                            # on the city's centre tile.
                            gslot = self.military_at[bidx, ctr]
                            gar = ((gslot >= 0) & (self.unit_seat[bidx, gslot.clamp(min=0)] == r + 1)).long()
                            atk_cs = torch.maximum(self.civ_only_best_melee[:, r], torch.full_like(self.civ_only_best_melee[:, r], 15)) + gar * 5
                            def_hp = self.unit_hp[bidx, ds0]
                            def_e = def_cs - self._wound(def_hp)
                            # Support keys on the DEFENDER's own seat:
                            # supportCount counts units with
                            # `u.seat === defender.seat`, which is what
                            # `d_seat` holds.
                            _, _sp = self._flank_support(tt, d_seat, torch.full((Bn,), -1, dtype=torch.long, device=dev2))
                            def_e = def_e + SUPPORT_CS * torch.where(d_emb, torch.zeros_like(_sp), _sp)
                            # The rcstk mirror: defender-side general aura
                            # (MILITARY only), outside the embarked override.
                            _def_civ_u = torch.where(is_vet_mil, d_seat, torch.full_like(tt, -1))  # the DEFENDER's own seat
                            _def_nav = torch.where(is_vet_mil, self.unit_naval[d_type.clamp(min=0, max=self.NU - 1)], torch.zeros_like(d_emb))
                            def_e = def_e + self._gen_aura_cs(_def_civ_u, tt, d_emb | _def_nav).to(def_e.dtype)
                            self._city_strike_resolve(  # one rule, four callers
                                strike, tt, d_slot, d_seat, _okm, _okc, is_vet_mil, atk_cs,
                                def_e, def_hp, r + 1, "restk")
                # A siege pins the HP: any adjacent unit hostile to THIS civ —
                # an at-war seat's units, CIVILIANS included per unitsHostile,
                # or barbarians — read live at this point in the city loop.
                nbh = self.neigh[self.civ_city_center[:, r, j].clamp(min=0)]  # [B, 6]
                nbhc = nbh.clamp(min=0)
                _ha_m = self.military_at.gather(1, nbhc)
                _ha_s = torch.where(_ha_m >= 0, self.unit_seat.gather(1, _ha_m.clamp(min=0)), torch.full_like(_ha_m, -1))
                _ha_c = self.civilian_at.gather(1, nbhc)
                _ha_cs = torch.where(_ha_c >= 0, self.unit_seat.gather(1, _ha_c.clamp(min=0)), torch.full_like(_ha_c, -1))
                hostile_adj = (_ha_s == BARB_SEAT) | (
                    ((_ha_s == 0) | (_ha_cs == 0))
                    & self.civ_only_atwar[:, r].unsqueeze(1)
                )
                # An adjacent AT-WAR civ seat's unit (military or civilian)
                # besieges this city too — the symmetric unitsHostile. civ_pair_war[:,
                # r] is gathered by the neighbour's civ index, read straight off
                # its seat; own-civ units (== r) never besiege.
                vmn = torch.where((_ha_s > 0) & (_ha_s != BARB_SEAT), _ha_m, torch.full_like(_ha_m, -1))
                vcn = torch.where((_ha_cs > 0) & (_ha_cs != BARB_SEAT), _ha_c, torch.full_like(_ha_c, -1))
                vmn_civ = torch.where(vmn >= 0, _ha_s - 1, torch.full_like(vmn, -1))
                vcn_civ = torch.where(vcn >= 0, _ha_cs - 1, torch.full_like(vcn, -1))
                war_vmn = (vmn >= 0) & (vmn_civ != r) & self.civ_pair_war[:, r].gather(1, vmn_civ.clamp(min=0))
                war_vcn = (vcn >= 0) & (vcn_civ != r) & self.civ_pair_war[:, r].gather(1, vcn_civ.clamp(min=0))
                hostile_adj = hostile_adj | war_vmn | war_vcn
                besieged_j = ((nbh >= 0) & hostile_adj).any(dim=1)
                self.civ_city_hp[:, r, j] = torch.where(
                    cact & ~besieged_j, (self.civ_city_hp[:, r, j] + heal).clamp(max=rr.get("cityMaxHp", 200)), self.civ_city_hp[:, r, j]
                )
                # the outer wall pool heals on the same gate
                if self._walls_bidx >= 0:
                    heal_oj = cact & ~besieged_j & self.civ_city_bldg[:, r, j, self._walls_bidx]
                    self.civ_city_outer_hp[:, r, j] = torch.where(
                        heal_oj, (self.civ_city_outer_hp[:, r, j] + heal).clamp(max=self._walls_hp), self.civ_city_outer_hp[:, r, j]
                    )
                # The Encampment garrison repairs on the same gate and rate.
                # civ_city_dist_tile is districts_cat-indexed, so the Encampment
                # column holds the tile.
                if self._encamp_didx >= 0:
                    _et = self.civ_city_dist_tile[:, r, j, self._encamp_didx]  # [B]
                    _etc = _et.clamp(min=0)
                    _live = (
                        (_et >= 0)
                        & self.district_complete.gather(1, _etc.unsqueeze(1)).squeeze(1)
                        & ~self.district_pillaged.gather(1, _etc.unsqueeze(1)).squeeze(1)
                    )
                    _ok = cact & ~besieged_j & _live
                    _cur = self.encamp_hp.gather(1, _etc.unsqueeze(1)).squeeze(1)
                    self.encamp_hp[:, :] = self.encamp_hp.scatter(
                        1,
                        _etc.unsqueeze(1),
                        torch.where(_ok, (_cur + heal).clamp(max=self._encamp_hp_max), _cur).unsqueeze(1),
                    )

            # Loyalty collapses resolve after the city loop, to the
            # max-pressure seat (first_argmax over [seat 0, civ 0, civ 1, ...],
            # so seat 0 wins ties, then civs by id).
            if bool(civ_city_flip.any()):
                lrng = int(rr.get("loyaltyRange", 9))
                # Every slot is walked, slot 0 included: compaction can move a
                # survivor into slot 0, so slot 0 is not capital-by-
                # construction. civ_city_flip is only ever set for non-capitals.
                for j2 in range(self.RC):
                    fl = civ_city_flip[:, j2] & self.civ_city_alive[:, r, j2]
                    if not bool(fl.any()):
                        continue
                    here_j = self.civ_city_center[:, r, j2].clamp(min=0)
                    d_pl = self.pair_dist[here_j.unsqueeze(1), self.site.clamp(min=0)].to(torch.float64)
                    p_pl = ((lrng + 1 - d_pl).clamp(min=0) * self.pop.double() * self.alive.double()).sum(dim=1)
                    press_all = [p_pl]
                    for r2 in range(self.R):
                        if r2 == r:
                            press_all.append(torch.full_like(p_pl, -1.0))
                        else:
                            d_o = self.pair_dist[here_j.unsqueeze(1), self.civ_city_center[:, r2].clamp(min=0)].to(torch.float64)
                            press_all.append(((lrng + 1 - d_o).clamp(min=0) * self.civ_city_pop[:, r2].double() * self.civ_city_alive[:, r2].double()).sum(dim=1))
                    winner = first_argmax(torch.stack(press_all, dim=1))  # index 0 = seat 0
                    for b in fl.nonzero(as_tuple=True)[0].tolist():
                        # `winner` indexes [seat 0, civ 0, civ 1, ...] — already
                        # the block row. A flip is never a conquest, so it never
                        # razes and never plunders, whoever receives.
                        self._transfer_city(b, r + 1, j2, int(winner[b]), conquest=False)


            # The seat block's TAIL — banking, upkeep, research, tourism,
            # favor, grievances, the great-people and belief races: ONE body,
            # every seat row, on this row's own city sums.
            self._seat_research_tail(r + 1, active, sci_sum, cul_sum, gold_sum, faith_sum)

            # Builder verbs and missionary SPREAD verbs ride the wire; their
            # phase.ts call positions are here, builders then missionaries.

            # Great General moves ride the wire; their phase.ts call position
            # is here, BEFORE the war loop, so the aura reflects the advanced
            # position (a general spawned in the GP claim above walks this turn
            # on full MP).

            # War or peace (branch on the value at entry; a peace made this
            # turn still runs the war branch, like the TS if/else). A seat at
            # war with ANYONE takes the WAR branch — its units run the war-act,
            # which scans every at-war seat's units and cities. civ_only_warturns
            # tracks the seat-0 war only (atw), while the seat-0 declaration
            # roll is skipped for a seat already in ANY war via
            # pea = ~atw_any, so both engines drop the conditional draw in
            # lockstep.
            atw = active & self.civ_only_atwar[:, r]
            atw_any = atw | (active & self.civ_pair_war[:, r, : self.R].any(dim=1))
            self.civ_only_warturns[:, r] = self.civ_only_warturns[:, r] + atw.long()
            # This seat's live slots, computed once (deaths only shrink
            # mid-loop; neither loop spawns) — the war AND peace walks reuse it.
            # Replayed unit acts fire HERE, at the walkers' own position in the
            # phase, never before step(): battles DRAW, so they must consume
            # their combat draws at the same position in the stream as the TS
            # in-phase replay. Draw-free actions (production/tech/civic) stay
            # pre-step. War rows here, peace rows at the peace loop below.
            _dsq = getattr(self, "_driven_useq", None)
            if _dsq is not None and r in _dsq:
                _rows_w = atw_any & self.controlled[:, r]
                if bool(_rows_w.any()):
                    _ord_w = torch.where(_rows_w.view(-1, 1, 1), _dsq[r], torch.full_like(_dsq[r], -1))
                    self.apply_seat_unit_sequence(r + 1, _ord_w)
            # Suing for peace rides the wire's war verb.
            pea = active & ~atw_any  # a seat at ANY war neither patrols nor rolls the seat-0 declaration
            self.civ_only_peaceturns[:, r] = self.civ_only_peaceturns[:, r] + pea.long()
            if _dsq is not None and r in _dsq:
                _rows_p = pea & self.controlled[:, r]
                if bool(_rows_p.any()):
                    _ord_p = torch.where(_rows_p.view(-1, 1, 1), _dsq[r], torch.full_like(_dsq[r], -1))
                    self.apply_seat_unit_sequence(r + 1, _ord_p)
            # War declarations arrive on the wire.

        # Drop the route-income cache at phase end: its key
        # (turn, r, eff, _rp_kill_version) does not cover unit deaths in the
        # war/peace acts above, so post-phase callers (leader/domination/
        # trace) must recompute against post-war state. With R>=2 the single
        # slot is overwritten before any same-r re-read, but that must not be
        # load-bearing for R=1 configs.
        self._seat_route_cache = None

        # The PEACE pass runs AFTER every seat acted, in actor order — seat
        # 0's sue-for-peace arm leads (the geoPeace pass position), then the
        # civ↔civ pairs. Re-validated against the LIVE mask; the gold
        # schedule is the seat-0 war verb's own rule (the TS geoPeace arm
        # carries no terms — a WAR_COLUMN_SEAT-family residual).
        if war is not None and self._rl_war_active and self.R > 0:
            w0p = war.to(torch.long)
            okp = self.alive.any(dim=1) & (w0p >= 0) & self.war_mask().gather(1, w0p.clamp(min=0).unsqueeze(1)).squeeze(1)
            pea = okp & (w0p >= self.R)
            if bool(pea.any()):
                ri = (w0p - self.R).clamp(min=0, max=self.R - 1)
                cost = rr.get("peaceGold0", 150) + rr.get("peaceGoldSlope", 10) * self.civ_only_warturns.gather(
                    1, ri.unsqueeze(1)
                ).squeeze(1).to(self.dtype)
                oh = torch.nn.functional.one_hot(ri, self.R).bool() & pea.unsqueeze(1)
                self.treasury.copy_(torch.where(pea, self.treasury - cost, self.treasury))
                self.civ_only_atwar.logical_and_(~oh)
                self.war[:, 1:1 + self.civ_only_atwar.shape[1], 0] &= ~oh
                self.civ_only_warturns.copy_(torch.where(oh, torch.zeros_like(self.civ_only_warturns), self.civ_only_warturns))
                self.civ_only_peaceturns.copy_(torch.where(oh, torch.zeros_like(self.civ_only_peaceturns), self.civ_only_peaceturns))
        if self.R > 0:
            self._geo_make_peace()

    def _seat_research_tail(self, row: int, active: torch.Tensor, sci_sum: torch.Tensor,
                            cul_sum: torch.Tensor, gold_sum: torch.Tensor,
                            faith_sum: torch.Tensor) -> None:
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
            """`plane[:, row] += add` where the seat is active. Written as ONE
            expression so no row accumulates at a different precision: the sum
            adds at ITS dtype and the store casts, on every row alike."""
            plane[:, row] = plane[:, row] + torch.where(active, add, torch.zeros_like(add))

        bank(self.civ_tech_prog, sci_sum)
        # LIFETIME science — Seat.scienceTotal's twin, beside the stream add.
        bank(self.seat_science_total, sci_sum)
        bank(self.civ_treasury, gold_sum)
        bank(self.civ_faith, faith_sum)
        # Unit upkeep + the bankruptcy rule, right after the gold lands and
        # before any war march.
        self._seat_upkeep_and_bankruptcy(row, active)
        for _ in range(RESEARCH_LOOPS):
            curt = self.civ_cur_tech[:, row]
            # a boosted tech completes at the discounted cost (_eff_cost —
            # identical rounding to effectiveResearchCostIn)
            cost_t = self._eff_cost(
                rdv.t_cost.gather(0, curt.clamp(min=0)),
                self.civ_tech_boosted[:, row].gather(1, curt.clamp(min=0).unsqueeze(1)).squeeze(1),
                golden_civ=row,  # golden FREE_INQUIRY, per seat
            )
            fin = active & (curt >= 0) & (self.civ_tech_prog[:, row] >= cost_t)
            if not bool(fin.any()):
                break
            rows = fin.nonzero(as_tuple=True)[0]
            self.civ_techs[rows, row, curt[rows]] = True
            # ANY tech completion bumps: unlocks feed _seat_buildable, and the
            # mine-boost/Replaceable-Parts techs feed the yield/score caches.
            self._eff_version += 1
            self.civ_tech_prog[:, row] = torch.where(fin, self.civ_tech_prog[:, row] - cost_t, self.civ_tech_prog[:, row])
            self.civ_cur_tech[:, row] = torch.where(fin, torch.full_like(curt, -1), self.civ_cur_tech[:, row])
        # Banked progress only drains once the tree is exhausted (advanceResearch:
        # progress banks while the slot is undecided).
        no_t = active & (self.civ_cur_tech[:, row] == -1) & ~self._available_mask(self.civ_techs[:, row], self._prereq_t).any(dim=1)
        self.civ_tech_prog[:, row] = torch.where(no_t, torch.minimum(self.civ_tech_prog[:, row], torch.zeros_like(self.civ_tech_prog[:, row])), self.civ_tech_prog[:, row])
        # TOURISM — once per turn at the seat level, in the load-bearing slot.
        bank(self.civ_tourism, self._tourism_of(
            self.city_gw_writing[:, row],
            self.city_gw_art[:, row],
            self.city_gw_music[:, row],
            self.city_alive[:, row],
            self.tile_seat == row,
            self._civ_era(self.civ_techs[:, row], self.civ_civics[:, row]),
            self.city_relics[:, row],
            self.civ_techs[:, row, self._gw_printing_tech] if self._gw_printing_tech >= 0 else None,
            self.city_artifacts[:, row],
        ))
        # DIPLOMATIC FAVOR — government TIER + suzerainties.
        bank(self.civ_diplo_favor,
             self._adopted_gov_tier(self.civ_civics[:, row]) + self._favor_per_suz * self._suzerain_count(row))
        # grievances DECAY by 1 per turn at peace with every MAJOR — the row's
        # own line of the war matrix, minus the city-state columns (TS's
        # atWarWithAny reads Seat.wars, the majors' list).
        at_peace = ~self.war[:, row, :1 + self.R].any(dim=1)
        self.civ_warmonger[:, row] = torch.where(
            active & at_peace & (self.civ_warmonger[:, row] > 0),
            self.civ_warmonger[:, row] - 1,
            self.civ_warmonger[:, row],
        )
        bank(self.civ_civic_prog, cul_sum)
        # LIFETIME culture — the cultureTotal twin, immediately after
        # civicProgress takes the same sum. Draws no RNG.
        bank(self.civ_culture, cul_sum)
        for _ in range(RESEARCH_LOOPS):
            curc = self.civ_cur_civic[:, row]
            cost_c = self._eff_cost(
                rdv.c_cost.gather(0, curc.clamp(min=0)),
                self.civ_civic_boosted[:, row].gather(1, curc.clamp(min=0).unsqueeze(1)).squeeze(1),
                golden_civ=row, is_civic=True,  # golden PEN_BRUSH_AND_VOICE
            )
            fin = active & (curc >= 0) & (self.civ_civic_prog[:, row] >= cost_c)
            if not bool(fin.any()):
                break
            rows = fin.nonzero(as_tuple=True)[0]
            self.civ_civics[rows, row, curc[rows]] = True
            self._eff_version += 1  # Feudalism moves this seat's farm-adj plane
            self.civ_civic_prog[:, row] = torch.where(fin, self.civ_civic_prog[:, row] - cost_c, self.civ_civic_prog[:, row])
            self.civ_cur_civic[:, row] = torch.where(fin, torch.full_like(curc, -1), self.civ_cur_civic[:, row])
        no_c = active & (self.civ_cur_civic[:, row] == -1) & ~self._available_mask(self.civ_civics[:, row], self._prereq_c).any(dim=1)
        self.civ_civic_prog[:, row] = torch.where(no_c, torch.minimum(self.civ_civic_prog[:, row], torch.zeros_like(self.civ_civic_prog[:, row])), self.civ_civic_prog[:, row])
        # Great-people race (advanceGreatPeople), then the BELIEF RACES
        # (pantheon / religion / enhancer, #73) — the loop position every seat
        # shares.
        self._advance_great_people(row, active)
        self._seat_belief_claims(row, active)

    def _advance_great_people(self, row: int, active: torch.Tensor) -> None:
        """advanceGreatPeople(state, seat) — ONE body for every seat row
        (0 = seat 0, r+1 = civ r), at the shared loop position after the
        research tail. Accrual per class: 1 + beliefGppFlat + (that
        district's built buildings) per city owning a COMPLETED unpillaged
        district of the class, read through the seat-axis registry
        (captured districts never ENTER a registry, so the tile plane's
        district_dead needs no gate here). Claims come from the SHARED
        earned pool at gpCost(earned), overflow kept; effects land in this
        row's own streams (tech/civic progress, treasury, faith, the
        capital's build head); WRITER/ARTIST/MUSICIAN culture slots Great
        Works; GENERAL/ADMIRAL spawn at the capital; a PROPHET banks for
        the belief races. No RNG draws."""
        if self._gp_nc == 0:
            return
        B, dev = self.B, self.device
        for cls in range(self._gp_nc):  # all GP classes (incl Admiral/General)
            # Accrual = 1 + (that district's buildings) per city owning a
            # COMPLETED district of the class, so a seat accrues nothing
            # until its first Campus/Holy Site/Commercial Hub completes.
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
                    gflat = self._bel_add("gpp", row)[:, cls].double().unsqueeze(1)  # [B, 1]
                else:
                    gflat = torch.zeros(B, 1, dtype=torch.float64, device=dev)
                pts = (comp_c.double() * (1.0 + gflat + nb_of.double())).sum(dim=1)
            else:
                pts = torch.zeros(B, dtype=torch.float64, device=dev)
            # Golden EXODUS pays +4 PROPHET points a turn, seat-wide and
            # district-free — greatPersonPointsPerTurn adds it OUTSIDE its
            # per-city loop, so it joins `pts` before the `pts > 0` guard,
            # not after.
            if cls == self._prophet_cls:
                pts = pts + self._golden_ded(row, self._ded_exodus).double() * 4.0
            self.civ_gpp[:, row, cls] = torch.where(
                active & (pts > 0), self.civ_gpp[:, row, cls] + pts, self.civ_gpp[:, row, cls]
            )
            # Claim loop: overflow is KEPT (gpp −= cost, not zeroed) and
            # the person's effect lands in this seat's own streams,
            # mirroring applyGreatPersonEffect. PROPHETs gate the religion.
            maxN = self._gp_effects.shape[1]
            for _ in range(maxN):
                earned_c = self.gp_earned[:, cls]
                has_person = earned_c < self._gp_roster[cls]
                gcost = self._gp_costs[earned_c.clamp(max=self._gp_costs.shape[0] - 1)]
                hit = active & has_person & (self.civ_gpp[:, row, cls] >= gcost)
                if not bool(hit.any()):
                    break
                hf = hit.to(torch.float64)
                eff = self._gp_effects[cls, earned_c.clamp(max=maxN - 1)]  # [B, 5]
                self.civ_tech_prog[:, row] = self.civ_tech_prog[:, row] + eff[:, 0].double() * hf
                # WRITER/ARTIST/MUSICIAN culture is slotted as Great Works
                # into this seat's cities (deferred per-kind culture);
                # overflow charges fall back to the instant lump inside
                # _place_works.
                _kind = self._gw_cls.index(cls) if cls in self._gw_cls else -1
                if _kind >= 0:
                    self._place_works(row, hit, eff[:, 1].double(), _kind)
                else:
                    self.civ_civic_prog[:, row] = self.civ_civic_prog[:, row] + eff[:, 1].double() * hf
                self.civ_treasury[:, row] = self.civ_treasury[:, row] + eff[:, 2].double() * hf
                prod_fx = eff[:, 3].double() * hf
                if bool((prod_fx != 0).any()):
                    # The capital's build head (cities.find(isCapital),
                    # queue non-empty). city_is_cap identifies it because
                    # compaction can move the capital off slot 0; at most
                    # one flag per (b, row), so the masked add lands on
                    # exactly the capital's head or nowhere.
                    _capa = self.city_is_cap[:, row] & self.city_alive[:, row]
                    capm = _capa & (self.city_current[:, row] >= 0)
                    self.city_progress[:, row] = self.city_progress[:, row] + torch.where(capm, prod_fx.unsqueeze(1), torch.zeros_like(self.city_progress[:, row]))
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
                self.era_score[:, row] += hit.long() * self._era_pts["gp"]  # per GP earned
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
        """The BELIEF RACES for ONE seat row (0 = seat 0, r+1 = civ r), at the
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
            self._bel_version += 1  # belief change -> _bel_add / _belief_feat_plane invalidate
        self.civ_faith[:, row] = torch.where(popen, self.civ_faith[:, row] - pfc, self.civ_faith[:, row])
        self.pantheon_claimed_n.add_(popen.long())
        self.civ_pantheon_done[:, row] = self.civ_pantheon_done[:, row] | popen
        self.era_score[:, row] += popen.long() * self._era_pts["pantheon"]
        d_hs = int(self._gp_class_district[self._prophet_cls]) if self._prophet_cls < self._gp_nc else -1
        if d_hs >= 0 and self.districts_on:
            reg_hs = self.city_dist_tile[:, row, :, d_hs]  # [B, cols]
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
            self._bel_version += 1  # follower/founder change -> _bel_add / _belief_feat_plane invalidate
        self.claimed_f_n.add_(ropen.long())
        self.claimed_o_n.add_(ropen.long())
        self.civ_religion_done[:, row] = self.civ_religion_done[:, row] | ropen
        self.era_score[:, row] += ropen.long() * self._era_pts["religion"]
        # Freeze this religion's holy tile at founding — it is the pressure
        # source. civ_religion_done latches, so ropen fires once and the tile
        # never re-writes. The tile is the LIVE capital at founding time,
        # else the FIRST LIVE CITY (`cities.find(isCapital) ?? cities[0]`);
        # a static capital tile would go stale when the capital fell before
        # founding. The city planes are still split by row (the city-block
        # base unification collapses this branch).
        if row == 0:
            _alv = self.alive
            _cap = self.is_cap & _alv
            _ctr = self.site
        else:
            _alv = self.civ_city_alive[:, row - 1]
            _cap = self.civ_city_is_cap[:, row - 1] & _alv
            _ctr = self.civ_city_center[:, row - 1]
        _h_slot = torch.where(_cap.any(dim=1), _cap.long().argmax(dim=1), _alv.long().argmax(dim=1))
        _holy = _ctr.gather(1, _h_slot.unsqueeze(1)).squeeze(1)
        _holy = torch.where(_alv.any(dim=1), _holy, torch.full_like(_holy, -1))  # ?? null
        self.holy_tile[:, row] = torch.where(ropen, _holy, self.holy_tile[:, row])

        # Enhance the founded religion: a SECOND earned Prophet claims an
        # enhancer belief, denying it from the shared pool (the mirror of
        # the follower/founder claim). The draw sits AFTER the founder
        # draw, gated on religionFounded && !enhancerClaimed &&
        # prophets >= 2 && pool-open, and advances only where eopen, so it
        # is RNG-neutral when it never fires. The effects are live: presR
        # (pressure range), tradeRel (route income), cnear/cdef/cvs
        # (combat CS) read civ_enhancer through the _enh tables.
        edue = active & self.civ_religion_done[:, row] & ~self.civ_enhancer_done[:, row] & (self.civ_prophets[:, row] >= 2)
        eopen = edue & (self.claimed_e_n < rr.get("enhancerPool", 0))
        re_ = self._next_random(eopen)  # third belief draw — after follower/founder
        if bool(eopen.any()) and self._enh_any:
            erow = eopen.nonzero(as_tuple=True)[0]
            n_open = (~self.enh_claimed).sum(dim=1)
            k = torch.floor(re_ * n_open.to(torch.float64)).to(torch.long)
            cum = (~self.enh_claimed).long().cumsum(dim=1)
            sel = (~self.enh_claimed) & (cum == (k + 1).unsqueeze(1))
            eid = sel.long().argmax(dim=1)
            self.enh_claimed[erow, eid[erow]] = True
            self.civ_enhancer[erow, row] = eid[erow]
            self._bel_version += 1  # an enhancer claim moves the belief epoch too
        self.claimed_e_n.add_(eopen.long())
        self.civ_enhancer_done[:, row] = self.civ_enhancer_done[:, row] | eopen

    def _apply_loyalty_and_flips(self, tier_idx: torch.Tensor, pop_before: torch.Tensor) -> None:
        """Applies seat-0 loyalty inside the city loop, then the deferred flips.

        Mirrors applyLoyalty. City c's own-pressure mixes pops: cities EARLIER
        in the loop already grew this turn, later ones did not. Capitals pin to
        100. A city at 0 defects to the highest-pressure civ (ties → lowest
        id)."""
        if self.R == 0:
            return
        B, C, dev = self.B, self.RC, self.device
        any_rc = (self.civ_city_alive.any(dim=2) & self.civ_only_alive).any(dim=1)
        if not bool(any_rc.any()):
            return
        rng = int(self.rules.seats.get("loyaltyRange", 9))
        scale = float(self.rules.seats.get("loyaltyScale", 20))
        sitec = self.site.clamp(min=0)
        d_cc = self.pair_dist[sitec.unsqueeze(2), sitec.unsqueeze(1)].to(self.dtype)
        # d_cc[b, c, c'] = dist(site[c], site[c']) — weight by source c'
        w = (rng + 1 - d_cc).clamp(min=0)
        # "Earlier in the loop" is ARRAY order — column order under
        # append+reclaim (#110): an earlier column is an array-earlier city.
        cols_e = torch.arange(C, device=dev)
        earlier = (cols_e.reshape(1, C, 1) > cols_e.reshape(1, 1, C)).expand(B, C, C)  # [B, c, c'] → c' earlier than c
        pop_mix = torch.where(earlier, self.pop.unsqueeze(1).to(self.dtype), pop_before.unsqueeze(1).to(self.dtype))
        # Contributions scale by the SOURCE seat's age factor (the loyaltyDelta
        # mirror: per-seat subtotal × factor — halves-exact in this dtype, so
        # grouping stays association-free).
        f_age = self._age_factor[self.civ_age].to(self.dtype)  # [B, 1+R]
        own = (w * pop_mix * self.alive.unsqueeze(1).to(self.dtype)).sum(dim=2) * f_age[:, 0].unsqueeze(1)
        # foreign pressure from civ-seat cities, per SOURCE civ × its factor
        civ_city_flat = self.civ_city_center.reshape(B, -1).clamp(min=0)
        civ_city_live = self.civ_city_alive.reshape(B, -1)
        d_cr = self.pair_dist[sitec.unsqueeze(2), civ_city_flat.unsqueeze(1)].to(self.dtype)
        wf = (rng + 1 - d_cr).clamp(min=0)
        foreign_r = (
            wf.reshape(B, C, self.R, self.RC)
            * self.civ_city_pop.reshape(B, 1, self.R, self.RC).to(self.dtype)
            * self.civ_city_alive.reshape(B, 1, self.R, self.RC).to(self.dtype)
        ).sum(dim=3)  # [B, C, R]
        foreign = (foreign_r * f_age[:, 1 : 1 + self.R].unsqueeze(1)).sum(dim=2)
        tot = own + foreign
        pressure = torch.where(tot > 0, scale * (own - foreign) / tot.clamp(min=1e-9), torch.zeros_like(tot))
        # Seat 0's governor seats — the endTurn governorPicks mirror. Rank
        # alive cities on QUANTIZED milli loyalty (raw-f64 ranking is
        # float-association-fragile), ties by TS array position = column
        # order (#110). Pick from the PRE-update snapshot.
        titles_p = (self.civics.sum(dim=1) // self._gov_per).clamp(max=self._gov_max)  # [B]
        q_loy = js_round(self.loyalty * 1000).long()
        gov_key = torch.where(self.alive, q_loy * 256 + cols_e, torch.full_like(q_loy, 1 << 40))
        gov_rank = torch.empty_like(gov_key)
        gov_rank.scatter_(1, gov_key.argsort(dim=1, stable=True), torch.arange(C, device=dev).expand(B, C))
        gov_b = (gov_rank < titles_p.unsqueeze(1)) & self.alive
        delta = pressure + self._loyalty_amenity[tier_idx.clamp(min=0, max=self._loyalty_amenity.shape[0] - 1)] + gov_b.to(self.dtype) * self._gov_loy
        upd = self.alive & any_rc.unsqueeze(1)
        nxt = (self.loyalty + delta).clamp(min=0, max=float(self.rules.seats.get("loyaltyMax", 100)))
        self.loyalty.copy_(torch.where(upd, nxt, self.loyalty))
        # pin/guard by IDENTITY (isCapital), not column 0
        cap_pin = upd & self.is_cap
        self.loyalty.copy_(torch.where(cap_pin, torch.full_like(self.loyalty, 100.0), self.loyalty))
        flip = upd & (self.loyalty <= 0) & ~self.is_cap
        if not bool(flip.any()):
            return
        # Winner per flipping city: the civ with the most pressure (ties →
        # lowest id; zero pressure still wins over the -1 sentinel).
        # Defectors resolve in ACQUISITION order (the TS array-order loop) with
        # pressures read LIVE per defection — an earlier transfer moves pops
        # that later defections must see.
        pairs: list[tuple[int, int]] = []
        for c in range(C):
            for b in flip[:, c].nonzero(as_tuple=True)[0].tolist():
                pairs.append((b, c))
        for b, c in sorted(pairs):
            site_c = int(self.site[b, c])
            d_rc1 = self.pair_dist[site_c, civ_city_flat[b].clamp(min=0)].to(self.dtype)
            wr = (rng + 1 - d_rc1).clamp(min=0) * self.civ_city_pop[b].reshape(-1).to(self.dtype) * civ_city_live[b].to(self.dtype)
            press_r = wr.reshape(self.R if self.R > 0 else 1, self.RC).sum(dim=1)
            press_r = torch.where(self.civ_only_alive[b], press_r, torch.full_like(press_r, -1.0))
            winner = int(first_argmax(press_r.unsqueeze(0))[0])  # ties -> lowest civ id (the strict-`>` scan)
            self._transfer_city(b, 0, c, winner + 1, conquest=False)  # civ w is block row w+1

    # --- one full turn -----------------------------------------------------------

    #: Every per-slot plane a captured unit must carry. One list, so a NEW
    #: plane cannot be silently forgotten by a capture. Ownership-reset planes
    #: are named separately below rather than copied.
    _CAPTURE_CARRY = ("type", "hp", "charges", "emb", "xp", "mp_full")
    #: Reset on an ownership change: a captured civilian never fortifies, never
    #: auras, and has movesLeft = 0 (acted) so the heal skips it this turn.
    _CAPTURE_RESET = {"fortify": 0, "aura_mp": 0, "mp": 0}

    def _carry_capture(self, rows: torch.Tensor, src: torch.Tensor, dst: torch.Tensor) -> None:
        """Move a unit's per-slot state from MERGED slot `src` to `dst`.

        One loop over _CAPTURE_CARRY instead of a hand-written block per
        capture path. Reads are taken BEFORE any write, so src and dst may be
        in the same pool.
        """
        vals = {k: getattr(self, f"unit_{k}")[rows, src].clone() for k in self._CAPTURE_CARRY}
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
        perm = torch.argsort((~alive).long(), dim=1, stable=True)  # living first, order kept
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
        # The merged maps hold MERGED slots, so the inverse permutation applies
        # only to entries inside THIS pool's range.
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
        "city_acquired", "city_hp", "city_outer_hp", "city_id", "city_is_cap", "city_current", "city_progress",
        "city_prod_bank",  # banked overflow: it rides the permutation with
                         # city_progress or a compaction hands one city's bank
                         # to its neighbour
        "city_cost", "city_qtile",
        # ALL work counts must ride the compaction permutation; one left out
        # stays at the old slot index, so the city loses its works or inherits
        # its neighbour's.
        "city_gw_writing", "city_gw_art", "city_gw_music", "city_relics", "city_artifacts",
    )
    def _reclaim_cities(self) -> None:
        """Stably compacts city slots per (game, seat row), every major row.

        TS SPLICES seat.cities on capture/flip/transfer and pushes on
        settle/receive, so the LIVING's relative order IS the spec — stable
        compaction preserves it exactly (the per-slot loops, the arange
        tie-breaks and empire-score's sequential association all see the
        same cities in the same order). tile_city needs no rebuild — it is
        id-keyed for every seat (#110) — but centre_slot_at carries SLOT
        VALUES, so live centres re-map through their row's inverse
        permutation. Runs at the step END like _reclaim_pool: the controlled
        head samples slot-keyed city actions from the PRE-step masks, so the
        layout must hold through this step's applies.
        CIV6_RC_RECLAIM_AT lowers the trigger for forced-compaction gates."""
        nrows = 1 + self.R
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
        # staleness latent (AUDIT A-27(2)) — center_at's value-readers see
        # fresh slots after every compaction.
        inv = torch.argsort(perm, dim=2)  # [B, nrows, RC] slot -> new slot
        seat_t = self.tile_seat
        is_major_ctr = (seat_t >= 0) & (seat_t < nrows) & (self.centre_slot_at >= 0)
        rowt = seat_t.clamp(min=0, max=nrows - 1)  # a major's seat IS its block row
        inv_flat = inv.reshape(self.B, -1)
        idx = (rowt * self.RC + self.centre_slot_at.clamp(min=0)).clamp(max=inv_flat.shape[1] - 1)
        self.centre_slot_at.copy_(torch.where(is_major_ctr, inv_flat.gather(1, idx), self.centre_slot_at))
        self._eff_version += 1  # no (row, j)-keyed cache may survive the permutation
        self._tile_owner_ver += 1  # owner / center_at derive slots from permuted state

    def _check_rc_registry_invariant(self) -> None:
        """Machine-checks district/wonder <-> tile-registry coherence for every alive civ city.

        Env-gated via self._civ_city_reg_check, so it costs nothing on the hot path
        when off. Two directions of the tile_city contract:

          (1) FORWARD: every district tile (civ_city_dist_tile) and wonder tile
              (civ_city_wonder) an rc lists registers BACK to that rc — its
              tile_city equals civ_city_id (a district/wonder sits on a tile owned
              by THAT city). A tile registered to a SIBLING fails here.
          (2) BACKWARD: every populated registry cell points at a tile whose
              civ_at is a live civ (no dangling index into re-owned/razed
              land). The registry never lists a tile it does not own.

        Raises AssertionError naming (game, civ, slot, kind, di/wi, tile,
        expected id, actual tile_city) on the first violation."""
        if self.R == 0:
            return
        B = self.B
        for r in range(self.R):
            expect = self.civ_city_id[:, r].unsqueeze(2)  # [B, RC, 1] this rc's id
            alive = self.civ_city_alive[:, r].unsqueeze(2)  # [B, RC, 1]
            for name in ("civ_city_dist_tile", "civ_city_wonder"):
                reg = getattr(self, name)[:, r]  # [B, RC, K] tile per (city, type/slot)
                has = (reg >= 0) & alive
                if not bool(has.any()):
                    continue
                # tile_city at the listed tile, per cell
                rt = self.tile_city.gather(1, reg.clamp(min=0).reshape(B, -1)).reshape_as(reg)  # [B, RC, K]
                ra = self.civ_at.gather(1, reg.clamp(min=0).reshape(B, -1)).reshape_as(reg)
                bad_fwd = has & (rt != expect)  # (1) registers to a sibling / no one
                bad_bwd = has & (ra < 0)        # (2) tile no longer civ-owned
                bad = bad_fwd | bad_bwd
                if bool(bad.any()):
                    idx = bad.nonzero(as_tuple=False)[0]
                    b, j, k = int(idx[0]), int(idx[1]), int(idx[2])
                    tile = int(reg[b, j, k])
                    raise AssertionError(
                        f"A-24 registry incoherence: game={b} civ={r} slot={j} "
                        f"{name}[{k}] tile={tile} expected_id={int(self.civ_city_id[b, r, j])} "
                        f"actual_rc_tile_id={int(self.tile_city[b, tile])} "
                        f"civ_at={int(self.civ_at[b, tile])} turn={self.turn}"
                    )
