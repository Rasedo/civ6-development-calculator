"""Batched RL environment over BatchSim: masks → actions → score-delta reward.

Fixed-horizon lockstep episodes, every game resetting together: call reset(),
then step() `horizon` times, reading masks() before each step to constrain the
policy's heads — per-city production, research, civics, per-unit orders,
envoys, war. Rewards telescope to the seat's empire score at the horizon, the
same fitness `cpu/core/score.ts` computes.

Two observation streams feed the policy:

  observe()        [B, F]    — empire, city-state, opponent, per-city-slot,
                               escalator, research-cost and ctx blocks, in that
                               order. `policy/ladder.py`'s block widths (EMP /
                               PER_CS / PER_CIV / PER_CITY / CTX_FIELDS) are the
                               ONE layout definition — this file holds no second
                               copy of the arithmetic.
  unit_features()  [B, P, 8] — per unit slot, for the units head (alive, type,
                               hp, position, and the bearing to the nearest
                               barbarian camp)

reset(scramble=...) re-seeds each game's in-state mulberry32 per episode,
so consecutive episodes see different barbarian spawns, quests, wars and
disasters on the same maps; reset() without it reproduces the fixture's
exact stream — the gate setting.
"""

from __future__ import annotations

import torch

from .engine import BatchSim, Rules, UNIT_SLOTS

def n_unit_acts(rules: Rules) -> int:
    """The unit head's width, read from the SHIPPED action enum — never a literal.

    `rules.actions.unit` is exported alongside the engine, so the head width
    cannot drift away from the mask width.
    """
    names = (rules.actions or {}).get("unit", [])
    if not names:
        raise ValueError("rules.actions.unit missing - re-export (npm run seed && npm run export)")
    return len(names)
from .rng import hash_keys

_M32 = (1 << 32) - 1
UNIT_FEATURES = 8


class BatchEnv:
    def __init__(self, fixtures: list[dict], rules: Rules, device: str = "cpu", dtype=torch.float32, horizon: int | None = None):
        self.sim = BatchSim(fixtures, rules, device=device, dtype=dtype)
        # None -> the game's own length: the scenario turn limit (TS
        # TURN_LIMIT). Episodes end when the score victory fires; training past
        # it would optimize turns the scoreboard never sees.
        self.horizon = int(rules.turn_limit) if horizon is None else horizon
        self._episode = 0
        self._score_prev: dict[int, torch.Tensor] = {}
        s = self.sim
        t = torch.arange(s.T, device=s.device)
        row = torch.div(t, s.W, rounding_mode="floor")
        col = t % s.W
        self._ax_q = (col - torch.div(row - (row & 1), 2, rounding_mode="floor")).to(torch.long)
        self._ax_r = row.to(torch.long)

    def reset(self, scramble: int | None = None) -> torch.Tensor:
        self.sim.reset()
        if scramble is not None:
            s = self.sim
            h = hash_keys(scramble, torch.arange(s.B, dtype=torch.int64), self._episode)
            s.rng_state.copy_((h & _M32).to(s.rng_state.dtype).to(s.device))
            self._episode += 1
        self._score_prev.clear()
        return self.observe()

    def _row(self, seat: int) -> int:
        if not 0 <= seat < self.sim.n_majors:
            raise ValueError(f"seat {seat} is not a major row (0..{self.sim.n_majors - 1})")
        return seat

    def masks(self, seat: int = 0) -> dict[str, torch.Tensor]:
        s = self.sim
        row = self._row(seat)
        m = s.seat_masks(row)
        return {
            "war": m["war"],
            "production": m["production"][:, : s.RC],
            "tech": m["tech"],
            "civic": m["civic"],
            "units": s._seat_unit_mask(row),
            "envoy": m["envoy"],
        }

    def step(
        self,
        production: torch.Tensor | None = None,
        tech: torch.Tensor | None = None,
        civic: torch.Tensor | None = None,
        units: torch.Tensor | None = None,
        envoy: torch.Tensor | None = None,
        war: torch.Tensor | None = None,
        seat: int = 0,
    ) -> tuple[torch.Tensor, torch.Tensor, bool]:
        row = self._row(seat)
        prev = self._score_prev.get(row)
        if prev is None:
            prev = self.sim.seat_score(row)
        self.sim.apply_seat_actions(row, production=production, tech=tech,
                                    civic=civic, war=war, envoys=envoy)
        if units is not None and self.sim.units_mode:
            self.sim._apply_seat_unit_actions(row, units)
        self.sim.step()
        score = self.sim.seat_score(row)
        self._score_prev[row] = score
        return self.observe(seat), score - prev, self.sim.turn > self.horizon

    def _escalators(self, techs, civics, builders, settler_cost) -> list:
        s = self.sim
        d = s.dtype
        dcp = s.rules.district_cost
        t_pct = techs.sum(dim=1).to(d) / max(s.rules_dev.t_cost.shape[0], 1)
        c_pct = civics.sum(dim=1).to(d) / max(s.rules_dev.c_cost.shape[0], 1)
        d_cost = torch.floor(dcp.get("base", 32) * (1 + dcp.get("scale", 9) * torch.maximum(t_pct, c_pct)))
        return [d_cost / 1000.0, settler_cost / 1000.0, s._builder_cost(builders).to(d) / 1000.0]

    def observe(self, seat: int = 0) -> torch.Tensor:
        """[B, F] — empire globals, city-state courtship, opponent posture, and
        per-city-slot economy/defense, all roughly unit-scaled.

        ONE renderer for every seat, the twin of `cpu/core/observe.ts`'s one
        `observeSeat`: it takes the seat's ROW in the merged planes and reads
        nothing that names a particular seat. The two engines must move
        together here — the gate compares them field for field before every
        step.
        """
        s = self.sim
        d = s.dtype
        B, C = s.B, s.RC
        dev = s.device
        row = self._row(seat)

        alive = s.city_alive[:, row]
        pop = s.city_pop[:, row]
        cur = s.city_current[:, row]
        need = s._growth_needed(pop).clamp(min=1)
        denom = s.city_cost[:, row].clamp(min=1)
        # OWNED TILES per city: `tile_seat` names the holding row and
        # `tile_city` the PERSISTENT id within it — the `ownerSeat` /
        # `ownerCity` pair TS filters on, one derivation for every seat.
        owned = (
            (s.tile_city.unsqueeze(1) == s.city_id[:, row, :C].unsqueeze(2))
            & (s.tile_seat == row).unsqueeze(1)
        ).sum(dim=2).to(d)
        per_city = torch.stack(
            [
                alive.to(d),
                pop.to(d) / 10.0,
                s.city_growth[:, row] / need,
                torch.where(cur >= 0, s.city_progress[:, row] / denom, torch.zeros_like(denom)),
                s.city_cbox[:, row] / s._border_cost(s.city_acquired[:, row]).clamp(min=1),
                owned / 20.0,
                torch.where(alive, s.city_hp[:, row], torch.zeros_like(s.city_hp[:, row])).to(d) / 200.0,
                s.city_loyalty[:, row].to(d) / 100.0,
                (cur >= 0).to(d),
                s.city_is_cap[:, row].to(d),
            ],
            dim=2,
        ) * alive.unsqueeze(2).to(d)  # [B, C, 10] — dead slots ZERO, the TS zero-fill twin
        # The city AXIS is LIVING ORDER, not slot order: the TS array shifts
        # down when a city is lost. Compact alive slots to the front, stable in
        # slot (= founding) order.
        _ord = torch.argsort((~alive).long(), dim=1, stable=True)
        per_city = per_city.gather(1, _ord.unsqueeze(2).expand(-1, -1, per_city.shape[2]))

        mine = s.major_unit_alive & (s.major_unit_seat == row)
        emp = torch.stack(
            [
                torch.full((B,), float(s.turn) / self.horizon, dtype=d, device=dev),
                s.civ_techs[:, row].sum(dim=1).to(d) / max(s.civ_techs.shape[2], 1),
                s.civ_civics[:, row].sum(dim=1).to(d) / max(s.civ_civics.shape[2], 1),
                s.civ_tech_prog[:, row].to(d) / 50.0,
                s.civ_civic_prog[:, row].to(d) / 50.0,
                # LIVE settler units, then LIVE QUEUED ones (current == the
                # settler column). Both are live reads, never a cumulative
                # counter, and both gate on a LIVING city as TS's reduce does.
                s._seat_settlers(row).to(d),
                (alive & (cur == s.SETTLER)).sum(dim=1).to(d),
                alive.sum(dim=1).to(d) / C,
                (s.civ_treasury[:, row] / 200.0).clamp(max=5.0),
                s.civ_envoys_avail[:, row].to(d) / 5.0,
                s.civ_influence[:, row].to(d) / 100.0,
                s.n_camps.to(d) / 5.0,
                s.barb_unit_alive.sum(dim=1).to(d) / 10.0,
                mine.sum(dim=1).to(d) / 10.0,
                # Army COMPOSITION: the ladder trains ranged while the army
                # holds melee, so a bare COUNT cannot express the decision.
                (mine & (s._type_ranged_strength[s.major_unit_type.clamp(min=0, max=s.NU - 1)] > 0)).sum(dim=1).to(d) / 10.0,
            ],
            dim=1,
        )  # [B, 15]
        # THIS SEAT'S OWN courtship view: met, envoys and quest are all
        # seat-keyed stores, one row per seat, and every seat can hold a quest
        # (`_seat_quest_phase` runs on every row). Captured city-states ZERO.
        cs_lo = s.n_majors
        cs = torch.stack(
            [
                s.seat_citystate_met[:, row, : s.S].to(d),
                s.seat_citystate_envoys[:, row, : s.S].to(d) / 6.0,
                (s.seat_citystate_quest[:, row, : s.S] > 0).to(d),
                # the war head's MINOR columns decide off these two
                s.war[:, row, cs_lo:cs_lo + s.S].to(d),
                s.war_turns[:, row, cs_lo:cs_lo + s.S].to(d) / 14.0,
            ],
            dim=2,
        ) * s.citystate_alive.unsqueeze(2).to(d)  # [B, S, PER_CS]
        # OPPONENTS, seat-symmetric: every OTHER major seat in ascending seat
        # order — `war_targets(row)`, the war head's own order, so column k
        # here and column k of the head name the same seat. Everything is read
        # from THIS seat's point of view off symmetric stores, so no seat is
        # privileged. A roster slot with no seat renders zeros (TS walks
        # `state.seats`, which has no such entry); the width stays n_opponents for every
        # asker.
        #
        # The DoW terms were a single pairwise sextet in the ctx block, measured
        # against one fixed seat, which is why a policy could not choose WHICH
        # opponent to declare on. RAW and unscaled, like the ctx block and for
        # the same reason. The AGREEMENT clocks close the block: every one of
        # them is the precondition of a verb this seat can play here.
        opp_cols = []
        for o in range(s.n_majors):
            if o == row:
                continue
            ex = s.civ_alive[:, o]
            o_alive = s.city_alive[:, o]
            n_opp_cities = o_alive.sum(dim=1) * ex.long()
            pair_ok = o_alive.unsqueeze(2) & alive.unsqueeze(1)
            d_pr = s.pair_dist[
                s.city_center[:, o].clamp(min=0).unsqueeze(2),
                s.city_center[:, row].clamp(min=0).unsqueeze(1),
            ].to(torch.long)
            opp_cols.append(
                torch.stack(
                    [
                        (s.war[:, row, o] & ex).to(d),
                        s.war_turns[:, row, o].to(d) / 14.0,
                        n_opp_cities.to(d) / 6.0,
                        torch.where(ex, self._seat_strength(o), torch.zeros_like(ex, dtype=torch.long)).to(d),
                        torch.where(pair_ok, d_pr, 999).reshape(B, -1).min(dim=1).values.to(d),
                        ((s._grievances_against(o) >= s._griev_gang) & ex).to(d),
                        (n_opp_cities > 0).to(d),
                        s.seat_friend_turns[:, row, o].to(d) / s._agreement_turns,
                        s.seat_ally_turns[:, row, o].to(d) / s._agreement_turns,
                        s.seat_borders_turns[:, o, row].to(d) / s._agreement_turns,
                        s.seat_borders_turns[:, row, o].to(d) / s._agreement_turns,
                        s._denounce_left(row, o).to(d) / s._agreement_turns,
                        s._denounce_left(o, row).to(d) / s._agreement_turns,
                    ],
                    dim=1,
                )
            )
        cv = (torch.stack(opp_cols, dim=1) if opp_cols
              else torch.zeros(B, 0, 7, dtype=d, device=dev))
        return torch.cat([emp, cs.reshape(B, -1), cv.reshape(B, -1), per_city.reshape(B, -1),
                          torch.stack(self._escalators(s.civ_techs[:, row], s.civ_civics[:, row],
                                                       s.civ_builders_trained[:, row],
                                                       s._seat_settler_cost(row).to(d)), dim=1),
                          s._eff_cost(s.rules_dev.t_cost.unsqueeze(0).expand(B, -1), s.civ_tech_boosted[:, row], row).to(d) / 1000.0,
                          s._eff_cost(s.rules_dev.c_cost.unsqueeze(0).expand(B, -1), s.civ_civic_boosted[:, row], row, is_civic=True).to(d) / 1000.0,
                          # PARKED progress per option, on the cost blocks'
                          # scale so the two read as a ratio. Switching is a
                          # legal move, and it cannot be decided from the
                          # cost alone: what a seat has already sunk into an
                          # abandoned tech is the other half of the comparison.
                          # The CURRENT item reads 0 here — its progress is the
                          # pool, in the empire block — so the two never
                          # double-count.
                          s.civ_tech_retain[:, row].to(d) / 1000.0,
                          s.civ_civic_retain[:, row].to(d) / 1000.0,
                          self._congress_block(row),
                          self._ctx_block(row)], dim=1)

    def _congress_block(self, row: int) -> torch.Tensor:
        """[B, ladder.CONGRESS] — the ballot currency and the STANDING slate,
        the same layout `observeSeat` renders."""
        s = self.sim
        d = s.dtype
        cols = [s.civ_diplo_favor[:, row].to(d) / 100.0,
                s.civ_diplo_points[:, row].to(d) / float(s._dvp_win)]
        for k in range(2):
            res = s.congress_active[:, k, 0]
            live = res >= 0
            cols.append((res + 1).clamp(min=0).to(d))
            cols.append(torch.where(live, s.congress_active[:, k, 1], torch.zeros_like(res)).to(d))
            cols.append(torch.where(live, s.congress_active[:, k, 2], torch.zeros_like(res)).to(d))
        kind, phase, is_me, member = s._emergency_view(row)
        cols += [kind.to(d), phase.to(d), is_me.to(d), member.to(d)]
        return torch.stack(cols, dim=1)

    def _seat_strength(self, row: int) -> torch.Tensor:
        """[B] long — the `seatStrength` twin: 8 per city plus the combat of
        every unit this seat owns. Our own heuristic, not a Civ 6 rule, so the
        only thing that matters is that ONE number answers for everybody: the
        DoW comparison puts two of them side by side against a 1.3x bar."""
        s = self.sim
        ut = s.major_unit_type.clamp(min=0, max=s.NU - 1)
        mine = s.major_unit_alive & (s.major_unit_seat == row)
        return s.city_alive[:, row].sum(dim=1) * 8 + (mine.long() * s._type_combat[ut]).sum(dim=1)

    def _ctx_block(self, row: int) -> torch.Tensor:
        s = self.sim
        d = s.dtype
        rng_t = s._type_ranged_strength > 0
        alive = s.city_alive[:, row]
        n_cities = alive.sum(dim=1)
        qcur = s.city_current[:, row]
        q_ty = (qcur - s.UNIT_BASE).clamp(min=0, max=s.NU - 1)
        q_u = alive & (qcur >= s.UNIT_BASE) & (qcur < s.UNIT_BASE + s.NU)
        q_mil = q_u & (s._type_combat[q_ty] > 0)
        ut = s.major_unit_type.clamp(min=0, max=s.NU - 1)
        mine = s.major_unit_alive & (s.major_unit_seat == row)
        mil = mine & (s._type_combat[ut] > 0)
        n_units = mine.sum(dim=1) + q_u.sum(dim=1)
        n_rng = (mil & rng_t[ut]).sum(dim=1) + (q_mil & rng_t[q_ty]).sum(dim=1)
        n_mel = (mil & ~rng_t[ut]).sum(dim=1) + (q_mil & ~rng_t[q_ty]).sum(dim=1)
        # atWarWithAny — this row's whole line of the war matrix, majors and
        # city-states alike, because `Seat.wars` holds both and nothing ever
        # enters a war cell against the barbarian row. It feeds BOTH the unit
        # cap and the atWarAny column, as TS's one call feeds both.
        at_war = s.war[:, row].any(dim=1)
        return torch.stack([
            n_cities.to(d), n_units.to(d), n_mel.to(d), n_rng.to(d),
            (n_cities * 2 + torch.where(at_war, 3, 1)).to(d),
            self._seat_strength(row).to(d),
            s.civ_aggression[:, row].to(d),
            s.peace_turns[:, row].to(d),
            at_war.to(d),
        ], dim=1)

    def unit_features(self, seat: int = 0) -> torch.Tensor:
        s = self.sim
        d = s.dtype
        B = s.B
        row = self._row(seat)
        smap = s._seat_slot_map(row)
        alive = smap >= 0
        sc = smap.clamp(min=0)
        tile = s.unit_tile.gather(1, sc).clamp(min=0)
        uq, ur = self._ax_q[tile], self._ax_r[tile]  # [B, N]
        camp = s.camp_tile  # [B, K], -1 padded
        live_camp = camp >= 0
        cq, cr = self._ax_q[camp.clamp(min=0)], self._ax_r[camp.clamp(min=0)]  # [B, K]
        dq = cq.unsqueeze(1) - uq.unsqueeze(2)  # [B, N, K]
        dr = cr.unsqueeze(1) - ur.unsqueeze(2)
        dist = (dq.abs() + dr.abs() + (dq + dr).abs()) // 2
        dist = torch.where(live_camp.unsqueeze(1), dist, torch.full_like(dist, 9999))
        near_d, near_k = dist.min(dim=2)  # [B, N]
        has_camp = live_camp.any(dim=1, keepdim=True)  # [B, 1]
        ndq = dq.gather(2, near_k.unsqueeze(2)).squeeze(2)
        ndr = dr.gather(2, near_k.unsqueeze(2)).squeeze(2)
        z = torch.zeros(B, UNIT_SLOTS, dtype=d, device=s.device)
        keep = alive & has_camp
        utype = s.unit_type.gather(1, sc)
        uhp = s.unit_hp.gather(1, sc)
        return torch.stack(
            [
                alive.to(d),
                torch.where(alive, utype, torch.zeros_like(utype)).to(d) / max(len(s.rules.units or []), 1),
                torch.where(alive, uhp, torch.zeros_like(uhp)).to(d) / 100.0,
                torch.where(alive, (tile % s.W).to(d) / s.W, z),
                torch.where(alive, torch.div(tile, s.W, rounding_mode="floor").to(d) / s.H, z),
                torch.where(keep, (near_d.to(d) / 20.0).clamp(max=1.0), z),
                torch.where(keep, (ndq.to(d) / 10.0).clamp(min=-1.0, max=1.0), z),
                torch.where(keep, (ndr.to(d) / 10.0).clamp(min=-1.0, max=1.0), z),
            ],
            dim=2,
        )
