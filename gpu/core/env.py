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
#: The seat the ctx block's PAIRWISE columns are measured against — the
#: `cpu/core/observe.ts` CTX_PAIR_SEAT twin. The wire carries ONE such axis and
#: this is the seat on its far side; that seat's own row would be
#: self-referential, so it renders zero. An unfinished wire, not a rule.
CTX_PAIR_SEAT = 0
UNIT_FEATURES = 8


class BatchEnv:
    def __init__(self, fixtures: list[dict], rules: Rules, device: str = "cpu", dtype=torch.float32, horizon: int | None = None):
        self.sim = BatchSim(fixtures, rules, device=device, dtype=dtype)
        # None -> the game's own length: the scenario turn limit (TS
        # TURN_LIMIT). Episodes end when the score victory fires; training past
        # it would optimize turns the scoreboard never sees.
        self.horizon = int(rules.turn_limit) if horizon is None else horizon
        self._episode = 0
        self._last_score = self.sim.empire_score()
        s = self.sim
        # odd-r offset → axial, for hex distances in unit features
        t = torch.arange(s.T, device=s.device)
        row = torch.div(t, s.W, rounding_mode="floor")
        col = t % s.W
        self._ax_q = (col - torch.div(row - (row & 1), 2, rounding_mode="floor")).to(torch.long)
        self._ax_r = row.to(torch.long)

    def reset(self, scramble: int | None = None) -> torch.Tensor:
        """Restore the initial state (all games, lockstep).

        scramble=None replays the fixture's recorded RNG stream — identical
        worlds every episode, and what the gates compare against. Passing an
        int re-seeds each game's mulberry32 from (scramble, game index, episode
        counter): same maps, fresh barbarians/quests/wars/disasters each
        episode — the training setting.
        """
        self.sim.reset()
        if scramble is not None:
            s = self.sim
            h = hash_keys(scramble, torch.arange(s.B, dtype=torch.int64), self._episode)
            s.rng_state.copy_((h & _M32).to(s.rng_state.dtype).to(s.device))
            self._episode += 1
        self._last_score = self.sim.empire_score()
        return self.observe()

    def _seat_civ(self, seat: int) -> int:
        """Seat k>0 -> civ index k-1, for the interfaces that still speak civ
        indices (apply_seat_actions, civ_score)."""
        r = seat - 1
        if r < 0 or r >= self.sim.R:
            raise ValueError(f"seat {seat} out of range (O = {self.sim.R + 1})")
        return r

    def _row(self, seat: int) -> int:
        """The seat's ROW in the merged planes — 0 for seat 0, r+1 for civ r,
        which is also its index in the war matrix. Every mask and observation
        body below takes this and nothing else."""
        return 0 if seat == 0 else self._seat_civ(seat) + 1

    def masks(self, seat: int = 0) -> dict[str, torch.Tensor]:
        """The seat's decision space: production [B, C, NB+2+NU], tech [B, NT],
        civic [B, NC], units [B, P, n_unit_acts], envoy [B, S], war [B, 2R] —
        all-False rows mean no decision pends there this turn.

        ONE assembly for every seat. `seat_masks` is the engine's one legality
        body (its war head carries the WAR_COLUMN_SEAT fork, documented there);
        the unit mask is the same `_seat_unit_mask` at this seat's row.
        """
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
        """Returns (obs [B, F], reward [B], done). done is batch-wide —
        lockstep fixed-horizon episodes; the caller resets. Seat k>0: the
        actions route into that civ seat BEFORE the world steps, and the reward
        is that seat's score delta."""
        if seat != 0:
            r = self._seat_civ(seat)
            self.sim.seat_ext[:, r + 1] = True
            self.sim.apply_seat_actions(r, production=production, tech=tech, civic=civic, war=war)
            if units is not None:
                self.sim._apply_seat_unit_actions(r + 1, units)
            prev = getattr(self, "_last_civ_score", None)
            if prev is None or prev.get("r") != r:
                prev = {"r": r, "score": self.sim.civ_score(r)}
            self.sim.step()
            score = self.sim.civ_score(r)
            reward = score - prev["score"]
            self._last_civ_score = {"r": r, "score": score}
            return self.observe(seat), reward, self.sim.turn > self.horizon
        self.sim.step(production=production, tech=tech, civic=civic, units=units, envoy=envoy, war=war)
        score = self.sim.empire_score()
        reward = score - self._last_score
        self._last_score = score
        return self.observe(seat), reward, self.sim.turn > self.horizon

    def _escalators(self, techs, civics, builders, settler_cost) -> list:
        """The three production costs that ESCALATE with a seat's own state —
        district, settler, builder.

        Every other production price is static rules data, which the ladder
        already loads from `rules.json`. Static data is NOT state and does not
        belong in an observation; carrying the whole price table to express
        three moving numbers would be noise a policy has to learn to ignore.
        Computed HERE, with the engine's own helpers, so the escalation rule
        stays in the engine — the same reason research emits effective cost
        rather than a boost flag."""
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
        # `tile_city` the PERSISTENT id within it (#110) — the `ownerSeat` /
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
                # The production LADDER branches on isCapital — only the
                # capital queues a settler.
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
        cs = torch.stack(
            [
                s.seat_citystate_met[:, row, : s.S].to(d),
                s.seat_citystate_envoys[:, row, : s.S].to(d) / 6.0,
                (s.seat_citystate_quest[:, row, : s.S] > 0).to(d),
            ],
            dim=2,
        ) * s.citystate_alive.unsqueeze(2).to(d)  # [B, S, 3]
        # OPPONENTS, seat-symmetric: every OTHER major seat in ascending seat
        # order, and the war field is THIS seat's war with that opponent — read
        # off the symmetric `war` matrix, so no seat is privileged. A roster slot
        # with no seat renders zeros (TS walks `state.seats`, which has no such
        # entry); the width stays R for every asker.
        opp_cols = []
        for o in range(1 + s.R):
            if o == row:
                continue
            ex = s.civ_alive[:, o]
            opp_cols.append(
                torch.stack(
                    [
                        (s.war[:, row, o] & ex).to(d),
                        s.war_turns[:, o].to(d) / 14.0,
                        (s.city_alive[:, o].sum(dim=1) * ex.long()).to(d) / 6.0,
                    ],
                    dim=1,
                )
            )
        cv = torch.stack(opp_cols, dim=1) if opp_cols else torch.zeros(B, 0, 3, dtype=d, device=dev)
        # EFFECTIVE research cost per option — the quantity the decision
        # actually uses, not the boost flag it derives from. Emitting flags
        # would force the policy to apply `boosted ? base*(1-frac) : base`
        # itself, and that formula is a RULE: it must live in the engine, or a
        # rule leaks into the policy and the two can drift.
        #
        # FULL WIDTH on purpose, unmasked. The mask carries legality separately;
        # what the full vector buys is PLANNING — a boosted tech several prereqs
        # away should change which branch a policy walks toward now, and masking
        # to the legal frontier would delete exactly that signal.
        return torch.cat([emp, cs.reshape(B, -1), cv.reshape(B, -1), per_city.reshape(B, -1),
                          torch.stack(self._escalators(s.civ_techs[:, row], s.civ_civics[:, row],
                                                       s.civ_builders_trained[:, row],
                                                       s._seat_settler_cost(row).to(d)), dim=1),
                          s._eff_cost(s.rules_dev.t_cost.unsqueeze(0).expand(B, -1), s.civ_tech_boosted[:, row], row).to(d) / 1000.0,
                          s._eff_cost(s.rules_dev.c_cost.unsqueeze(0).expand(B, -1), s.civ_civic_boosted[:, row], row, is_civic=True).to(d) / 1000.0,
                          self._ctx_block(row)], dim=1)

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
        """The CTX block (ladder.CTX_FIELDS): the decide-time scalars
        `_prod_ctx`/`_war_ctx` read back out of the observation. RAW and
        unscaled, because the ladder compares them exactly and scaled floats do
        not round-trip bit-stably; the formulas are the scripted sites' own.

        The DoW-specific sextet (oppStr / prox / gang / aggression /
        peaceTurns / oppHasCities) is PAIRWISE, measured against
        CTX_PAIR_SEAT — the wire carries one such axis. That seat's own row
        would be self-referential and renders zero, exactly as
        `cpu/core/observe.ts` does. Read `oppStr`, `gang` and `oppHasCities` as
        the OPPONENT's (the policy gangs up on their warmongering and compares
        strength against theirs); `aggression` and `peaceTurns` are this seat's
        own."""
        s = self.sim
        d = s.dtype
        B = s.B
        dev = s.device
        rng_t = s._type_ranged_strength > 0
        alive = s.city_alive[:, row]
        n_cities = alive.sum(dim=1)
        # THE ONE production layout: queue codes are mask COLUMNS on every row.
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
        # atWarWithAny over the majors — this row's own line of the war matrix.
        # It feeds BOTH the unit cap and the atWarAny column, as TS's one
        # `atWarWithAny(state, seat)` feeds both.
        at_war = s.war[:, row, : 1 + s.R].any(dim=1)
        z = torch.zeros(B, dtype=d, device=dev)
        if row == CTX_PAIR_SEAT:
            opp_str = prox = gang = aggr = peace = has_cities = z
        else:
            opp_str = self._seat_strength(CTX_PAIR_SEAT).to(d)
            pair_ok = s.city_alive[:, CTX_PAIR_SEAT].unsqueeze(2) & alive.unsqueeze(1)
            d_pr = s.pair_dist[
                s.city_center[:, CTX_PAIR_SEAT].clamp(min=0).unsqueeze(2),
                s.city_center[:, row].clamp(min=0).unsqueeze(1),
            ].to(torch.long)
            prox = torch.where(pair_ok, d_pr, 999).reshape(B, -1).min(dim=1).values.to(d)
            gang = (s.civ_warmonger[:, CTX_PAIR_SEAT] >= s._wm_gang).to(d)
            aggr = s.civ_aggression[:, row].to(d)
            peace = s.peace_turns[:, row].to(d)
            has_cities = (s.city_alive[:, CTX_PAIR_SEAT].sum(dim=1) > 0).to(d)
        return torch.stack([
            n_cities.to(d), n_units.to(d), n_mel.to(d), n_rng.to(d),
            (n_cities * 2 + torch.where(at_war, 3, 1)).to(d),
            opp_str, self._seat_strength(row).to(d), prox,
            gang, aggr, peace,
            at_war.to(d), has_cities,
        ], dim=1)

    def unit_features(self, seat: int = 0) -> torch.Tensor:
        """[B, simbase.UNIT_SLOTS, 8] per unit-head-row features for the units
        head: alive, type, hp, map position, and range/bearing to the nearest
        barbarian camp (zeros when no camp stands — the head then has nothing
        to hunt).

        ONE layout over ONE slot map, so a policy reads any seat's units the
        same way. The camp columns are not a seat-0 feature: a camp is hostile
        to every seat and every seat's units can clear one.
        """
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
        )  # [B, N, 8]
