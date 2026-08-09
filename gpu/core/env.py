"""Batched RL environment over BatchSim: masks → actions → score-delta reward.

Fixed-horizon lockstep episodes, every game resetting together: call reset(),
then step() `horizon` times, reading masks() before each step to constrain the
policy's heads — per-city production, research, civics, per-unit orders,
envoys, war. Rewards telescope to the seat's empire score at the horizon, the
same fitness `cpu/core/score.ts` computes.

Two observation streams feed the policy:

  observe()        [B, obs_size]  — empire + per-city-slot features
  unit_features()  [B, P, 8]      — per unit slot, for the units head
                                    (alive, type, hp, position, and the
                                    bearing to the nearest barbarian camp)

reset(scramble=...) re-seeds each game's in-state mulberry32 per episode,
so consecutive episodes see different barbarian spawns, quests, wars and
disasters on the same maps; reset() without it reproduces the fixture's
exact stream — the gate setting.
"""

from __future__ import annotations

import torch

from .engine import BatchSim, Rules, SEAT0_POOL_MAX

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
_GLOBAL_F = 14
_PER_CS_F = 3
_PER_CIV_F = 3
_PER_CITY_F = 9
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

    @property
    def obs_size(self) -> int:
        s = self.sim
        return _GLOBAL_F + _PER_CS_F * s.S + _PER_CIV_F * s.R + _PER_CITY_F * s.C

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
        """Seat k>0 -> civ index k-1. Seat 0 has its own tensor family and
        raises here."""
        r = seat - 1
        if r < 0 or r >= self.sim.R:
            raise ValueError(f"seat {seat} out of range (O = {self.sim.R + 1})")
        return r

    def masks(self, seat: int = 0) -> dict[str, torch.Tensor]:
        """The seat's decision space: production [B, C, NB+2+NU], tech [B, NT],
        civic [B, NC], units [B, P, n_unit_acts], envoy [B, S], war [B, 2R] —
        all-False rows mean no decision pends there this turn. Seat k>0 renders
        the same layouts from the civ tensor family, with envoy all-False (civ
        seats have no envoys)."""
        if seat != 0:
            r = self._seat_civ(seat)
            s = self.sim
            m = s.seat_masks(r)
            prod = m["production"][:, : s.C]  # city axis mirrors seat 0's width
            pw = s.production_mask().shape[2]
            if prod.shape[2] < pw:  # purchase block active: pad all-False
                pad = torch.zeros(s.B, prod.shape[1], pw - prod.shape[2], dtype=torch.bool, device=s.device)
                prod = torch.cat([prod, pad], dim=2)
            return {
                "war": m["war"],  # [B, 2R]: column 0 declares, column R sues for peace
                "production": prod,
                "tech": m["tech"],
                "civic": m["civic"],
                "units": s.seat_unit_mask(r),
                "envoy": torch.zeros(s.B, s.S, dtype=torch.bool, device=s.device),
            }
        return {
            "war": self.sim.war_mask(),  # [B, 2R] declare/peace
            "production": self.sim.production_mask(),
            "tech": self.sim.tech_mask(),
            "civic": self.sim.civic_mask(),
            "units": self.sim.unit_action_mask(),
            "envoy": self.sim.envoy_mask(),
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
            self.sim.controlled[:, r] = True
            self.sim.apply_seat_actions(r, production=production, tech=tech, civic=civic, war=war)
            if units is not None:
                self.sim._apply_seat_unit_actions(r, units)
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

    def _escalators(self, seat: int, techs, civics, builders, settler_cost) -> list:
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
        """[B, obs_size] — empire globals, city-state courtship, opponent
        posture, and per-city-slot economy/defense, all roughly unit-scaled.
        The schema is seat-invariant by design: seat k>0 renders the same
        layout from the civ tensor family."""
        if seat != 0:
            return self._observe_civ(self._seat_civ(seat))
        s = self.sim
        d = s.dtype
        B, C = s.B, s.C
        dev = s.device
        need = s._growth_needed(s.pop).clamp(min=1)
        denom = s.cur_cost.clamp(min=1)
        owned = (s.owner.unsqueeze(1) == torch.arange(C, device=dev).view(1, C, 1)).sum(dim=2).to(d)
        per_city = torch.stack(
            [
                s.alive.to(d),
                s.pop.to(d) / 10.0,
                s.food_box / need,
                torch.where(s.current >= 0, s.progress / denom, torch.zeros_like(s.progress)),
                s.culture_box / s._border_cost(s.tiles_acquired).clamp(min=1),
                owned / 20.0,
                torch.where(s.alive, s.city_hp, torch.zeros_like(s.city_hp)).to(d) / 200.0,
                s.loyalty.to(d) / 100.0,
                (s.current >= 0).to(d),
                # The production LADDER branches on isCapital — only the
                # capital queues a settler.
                s.is_cap.to(d),
            ],
            dim=2,
        ) * s.alive.unsqueeze(2).to(d)  # [B, C, 10] — dead slots ZERO, the TS zero-fill twin
        # The city AXIS is LIVING ORDER, not slot order: the TS array shifts
        # down when a city is lost. Compact alive slots to the front, stable in
        # slot (= founding) order.
        _ord = torch.argsort((~s.alive).long(), dim=1, stable=True)
        per_city = per_city.gather(1, _ord.unsqueeze(2).expand(-1, -1, per_city.shape[2]))
        emp = torch.stack(
            [
                torch.full((B,), float(s.turn) / self.horizon, dtype=d, device=dev),
                s.techs.sum(dim=1).to(d) / max(s.techs.shape[1], 1),
                s.civics.sum(dim=1).to(d) / max(s.civics.shape[1], 1),
                s.tech_prog / 50.0,
                s.civic_prog / 50.0,
                s._seat0_settlers().to(d),  # LIVE settler units
                # LIVE queued-settler count: current == the settler column NB.
                # It is the live queue, never a cumulative counter.
                (s.current == s.rules_dev.b_cost.shape[0]).sum(dim=1).to(d),
                s.alive.sum(dim=1).to(d) / C,
                (s.treasury / 200.0).clamp(max=5.0),
                s.envoys_avail.to(d) / 5.0,
                s.influence / 100.0,
                s.n_camps.to(d) / 5.0,
                s.barb_unit_alive.sum(dim=1).to(d) / 10.0,
                s.seat0_unit_alive.sum(dim=1).to(d) / 10.0,
                # Army COMPOSITION: the ladder trains ranged while the army
                # holds melee, so a bare COUNT cannot express the decision.
                (s.seat0_unit_alive & (s._type_ranged_strength[s.seat0_unit_type.clamp(min=0, max=s.NU - 1)] > 0)).sum(dim=1).to(d) / 10.0,
            ],
            dim=1,
        )  # [B, 15]
        cs = torch.stack(
            [
                s.citystate_met.to(d),
                s.citystate_envoys.to(d) / 6.0,
                (s.citystate_quest > 0).to(d),
            ],
            dim=2,
        ) * s.citystate_alive.unsqueeze(2).to(d)  # [B, S, 3] — captured city-states render ZEROS
        cv = torch.stack(
            [
                (s.civ_only_alive & s.civ_only_atwar).to(d),
                s.civ_only_warturns.to(d) / 14.0,
                (s.civ_city_alive.sum(dim=2) * s.civ_only_alive.long()).to(d) / 6.0,
            ],
            dim=2,
        )  # [B, R, 3]
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
                          torch.stack(self._escalators(0, s.techs, s.civics, s.builders_trained,
                                                      # settlerCost counts cities-1 + LIVE + LIVE-QUEUED settlers,
                                                      # the queued count being (current == the settler column)
                                                      (s.rules.settler_base + s.rules.settler_per_city
                                                       * (s.alive.sum(dim=1) - 1 + s._seat0_settlers()
                                                          + (s.current == s.rules_dev.b_cost.shape[0]).sum(dim=1)).clamp(min=0).to(d))), dim=1),
                          s._eff_cost(s.rules_dev.t_cost.unsqueeze(0).expand(B, -1), s.tech_boosted, 0).to(d) / 1000.0,
                          s._eff_cost(s.rules_dev.c_cost.unsqueeze(0).expand(B, -1), s.civic_boosted, 0, is_civic=True).to(d) / 1000.0,
                          self._ctx_block(None)], dim=1)

    def _ctx_block(self, r: int | None) -> torch.Tensor:
        """The CTX block (ladder.CTX_FIELDS): the decide-time scalars
        `_prod_ctx`/`_war_ctx` read back out of the observation. RAW and
        unscaled, because the ladder compares them exactly and scaled floats do
        not round-trip bit-stably; the formulas are the scripted sites' own.
        Seat 0 renders its own family's twins, except the DoW-specific quintet
        (oppStr/prox/gang/aggression/peaceTurns), which is zero for seat 0 — it
        runs no scripted DoW policy."""
        s = self.sim
        d = s.dtype
        B = s.B
        dev = s.device
        rng_t = s._type_ranged_strength > 0
        if r is None:
            n_cities = s.alive.sum(dim=1)
            qcur = s.current
            # seat 0's queue codes are MASK COLUMNS (units at NB+2..NB+1+NU),
            # not the civ family's 1..NU coding.
            _nb0 = s.rules_dev.b_cost.shape[0]
            q_ty = (qcur - (_nb0 + 2)).clamp(min=0, max=s.NU - 1)
            q_u = (qcur >= _nb0 + 2) & (qcur < _nb0 + 2 + s.NU)
            q_mil = q_u & (s._type_combat[q_ty] > 0)
            pt = s.seat0_unit_type.clamp(min=0, max=s.NU - 1)
            mil = s.seat0_unit_alive & (s._type_combat[pt] > 0)
            n_units = s.seat0_unit_alive.sum(dim=1) + q_u.sum(dim=1)
            n_rng = (mil & rng_t[pt]).sum(dim=1) + (q_mil & rng_t[q_ty]).sum(dim=1)
            n_mel = (mil & ~rng_t[pt]).sum(dim=1) + (q_mil & ~rng_t[q_ty]).sum(dim=1)
            at_opp = s.civ_only_atwar.any(dim=1) if s.R > 0 else torch.zeros(B, dtype=torch.bool, device=dev)
            # ONE strength formula for every seat — nCities*8 + own-unit
            # combat, the `_civ_pair_strengths` text.
            own_str = n_cities * 8 + (s.seat0_unit_alive.to(torch.long) * s._type_combat[pt]).sum(dim=1)
            z = torch.zeros(B, dtype=d, device=dev)
            return torch.stack([
                n_cities.to(d), n_units.to(d), n_mel.to(d), n_rng.to(d),
                (n_cities * 2 + torch.where(at_opp, 3, 1)).to(d),
                z, own_str.to(d), z, z, z, z,
                at_opp.to(d), z,
            ], dim=1)
        n_cities = s.civ_city_alive[:, r].sum(dim=1)
        qcur = s.civ_city_current[:, r]
        q_ty = (qcur - 1).clamp(min=0, max=s.NU - 1)
        q_u = (qcur >= 1) & (qcur <= s.NU)
        q_mil = q_u & (s._type_combat[q_ty] > 0)
        vt = s.civ_unit_type.clamp(min=0, max=s.NU - 1)
        mine = s.civ_unit_alive & (s.civ_unit_civ == r)
        mil = mine & (s._type_combat[vt] > 0)
        n_units = mine.sum(dim=1) + q_u.sum(dim=1)
        n_rng = (mil & rng_t[vt]).sum(dim=1) + (q_mil & rng_t[q_ty]).sum(dim=1)
        n_mel = (mil & ~rng_t[vt]).sum(dim=1) + (q_mil & ~rng_t[q_ty]).sum(dim=1)
        # The SAME 8-per-city text: this civ seat's view of seat 0, on the one
        # ruler `civ_only_str` below also uses.
        p_str = s.alive.sum(dim=1) * 8 + (s.seat0_unit_alive.to(torch.long) * s._type_combat[s.seat0_unit_type.clamp(min=0, max=s.NU - 1)]).sum(dim=1)
        own_cs = mine.to(torch.long) * s._type_combat[vt]
        civ_only_str = torch.floor(n_cities.double() * 8 + own_cs.sum(dim=1).double() + 0.5)
        d_pr = s.pair_dist[
            s.site.clamp(min=0).unsqueeze(2), s.civ_city_center[:, r].clamp(min=0).unsqueeze(1)
        ].to(torch.long)
        pair_ok = s.alive.unsqueeze(2) & s.civ_city_alive[:, r].unsqueeze(1)
        prox = torch.where(pair_ok, d_pr, 999).reshape(B, -1).min(dim=1).values
        gang = s.warmonger >= s._wm_gang
        atwar_any = s.civ_only_atwar[:, r] | (s.civ_pair_war[:, r].any(dim=1) if s.R > 0 else torch.zeros(B, dtype=torch.bool, device=dev))
        return torch.stack([
            n_cities.to(d), n_units.to(d), n_mel.to(d), n_rng.to(d),
            (n_cities * 2 + torch.where(s.civ_only_atwar[:, r], 3, 1)).to(d),
            p_str.to(d), civ_only_str.to(d), prox.to(d),
            gang.to(d), s.civ_only_aggression[:, r].to(d), s.civ_only_peaceturns[:, r].to(d),
            atwar_any.to(d), (s.alive.sum(dim=1) > 0).to(d),
        ], dim=1)

    def _civ_unit_features(self, r: int) -> torch.Tensor:
        """[B, P, 8] — the same unit-feature layout over civ r's slot map:
        alive, type, hp, axial position; the camp-bearing columns are zero,
        the scripted hunt heuristic being a seat-0 feature."""
        s = self.sim
        d = s.dtype
        B = s.B
        smap = s.seat_slot_map(r)
        present = smap >= 0
        sc = smap.clamp(min=0)
        tile = s.civ_unit_tile.gather(1, sc).clamp(min=0)
        out = torch.stack(
            [
                present.to(d),
                s.civ_unit_type.gather(1, sc).to(d) / 10.0,
                s.civ_unit_hp.gather(1, sc).to(d) / 100.0,
                self._ax_q[tile].to(d) / 20.0,
                self._ax_r[tile].to(d) / 20.0,
                torch.zeros(B, SEAT0_POOL_MAX, dtype=d, device=s.device),
                torch.zeros(B, SEAT0_POOL_MAX, dtype=d, device=s.device),
                s.civ_unit_charges.gather(1, sc).to(d) / 3.0,
            ],
            dim=2,
        )
        return out * present.unsqueeze(2).to(d)

    def _observe_civ(self, r: int) -> torch.Tensor:
        """The seat-invariant obs layout rendered from civ r's tensors: this
        seat's empire from the rc_*/r_* family (slots beyond C are invisible —
        RC > C by flips only), then an opponent block covering every OTHER civ
        seat in seat order, each read from THIS seat's point of view.
        `cpu/core/observe.ts:observeSeat` is the twin."""
        s = self.sim
        d = s.dtype
        B, C = s.B, s.C
        dev = s.device
        # The city AXIS is LIVING ORDER over the FULL RC width: the TS list
        # shifts down when a city dies, and a live city can sit in a slot >= C
        # after flips and captures, so the width cannot be sliced to C before
        # ordering. Gather the first C living slots (stable = founding order).
        _ordR = torch.argsort((~s.civ_city_alive[:, r]).long(), dim=1, stable=True)[:, :C]  # [B, C] slot ids
        pop = s.civ_city_pop[:, r].gather(1, _ordR).to(d)
        alive = s.civ_city_alive[:, r].gather(1, _ordR)
        needs = s._growth_needed(s.civ_city_pop[:, r].gather(1, _ordR)).clamp(min=1)
        denom = s.civ_city_cost[:, r].gather(1, _ordR).clamp(min=1)
        _cur = s.civ_city_current[:, r].gather(1, _ordR)
        per_city = torch.stack(
            [
                alive.to(d),
                pop / 10.0,
                s.civ_city_growth[:, r].gather(1, _ordR).to(d) / needs.to(d),
                torch.where(_cur >= 0, s.civ_city_progress[:, r].gather(1, _ordR).to(d) / denom.to(d), torch.zeros_like(pop)),
                s.civ_city_cbox[:, r].gather(1, _ordR).to(d) / s._border_cost(s.civ_city_acquired[:, r].gather(1, _ordR)).clamp(min=1).to(d),
                torch.where(
                    alive,
                    ((s.tile_city.unsqueeze(1) == s.civ_city_id[:, r].gather(1, _ordR).unsqueeze(2))
                     & (s.civ_at == r).unsqueeze(1)).sum(dim=2).to(d),  # civ_city_id is PER-CIV — gate by owner plane
                    torch.zeros(B, C, dtype=d, device=dev),
                ) / 20.0,
                torch.where(alive, s.civ_city_hp[:, r].gather(1, _ordR).to(d), torch.zeros_like(pop)) / 200.0,
                s.civ_city_loyalty[:, r].gather(1, _ordR).to(d) / 100.0,
                (_cur >= 0).to(d),
                # The production LADDER branches on isCapital — only the
                # capital queues a settler.
                s.civ_city_is_cap[:, r].gather(1, _ordR).to(d),
            ],
            dim=2,
        ) * alive.unsqueeze(2).to(d)  # [B, C, 10] — dead rows ZERO, the TS zero-fill twin
        n_own_units = (s.civ_unit_alive & (s.civ_unit_civ == r)).sum(dim=1).to(d)
        emp = torch.stack(
            [
                torch.full((B,), float(s.turn) / self.horizon, dtype=d, device=dev),
                s.civ_only_techs[:, r].sum(dim=1).to(d) / max(s.civ_only_techs.shape[2], 1),
                s.civ_only_civics[:, r].sum(dim=1).to(d) / max(s.civ_only_civics.shape[2], 1),
                s.civ_only_tech_prog[:, r].to(d) / 50.0,
                s.civ_only_civic_prog[:, r].to(d) / 50.0,
                # Field 5 is this seat's LIVE settler units and field 6 how
                # many are QUEUED — the same two meanings seat 0 renders.
                s._civ_only_settlers_of(r).to(d),
                (s.civ_city_current[:, r] == 0).sum(dim=1).to(d),
                s.civ_city_alive[:, r].sum(dim=1).to(d) / C,
                (s.civ_only_treasury[:, r] / 200.0).clamp(max=5.0),
                s.civ_only_envoys_avail[:, r].to(d) / 5.0,
                s.civ_only_influence[:, r].to(d) / 100.0,
                s.n_camps.to(d) / 5.0,
                s.barb_unit_alive.sum(dim=1).to(d) / 10.0,
                n_own_units / 10.0,
                # Army COMPOSITION for this seat, the twin of seat 0's — the
                # ladder trains ranged while the army holds melee, so a bare
                # unit COUNT cannot express the decision.
                (s.civ_unit_alive & (s.civ_unit_civ == r)
                 & (s._type_ranged_strength[s.civ_unit_type.clamp(min=0, max=s.NU - 1)] > 0)).sum(dim=1).to(d) / 10.0,
            ],
            dim=1,
        )  # [B, 15]
        # THIS SEAT'S OWN courtship view (civ_only_citystate_met / civ_only_citystate_envoys). The quest
        # column stays zero — quests are a seat-0 mechanic, and TS renders 0
        # for civ seats too. Captured city-states zero out.
        cs = torch.stack(
            [
                s.civ_only_citystate_met[:, r, : s.S].to(d),
                s.civ_only_citystate_envoys[:, r, : s.S].to(d) / 6.0,
                torch.zeros(B, s.S, dtype=d, device=dev),
            ],
            dim=2,
        ) * s.citystate_alive.unsqueeze(2).to(d)
        # OPPONENTS, seat-symmetric: every OTHER civ seat in ascending seat
        # order, and the war field is THIS seat's war with that opponent — read
        # off the symmetric `war` matrix, so no seat is privileged. The twin is
        # `cpu/core/observe.ts:observeSeat`; the two must move together.
        me = r + 1  # this seat's index in the seat-ordered walk below
        opp_cols = []
        for o in range(1 + s.R):  # every civ seat, in seat order
            if o == me:
                continue
            if o == 0:
                cities = s.alive.sum(dim=1).to(d)
            else:
                cities = (s.civ_city_alive[:, o - 1].sum(dim=1) * s.civ_only_alive[:, o - 1].long()).to(d)
            opp_cols.append(
                torch.stack(
                    [
                        s.war[:, me, o].to(d),
                        s.war_turns[:, o].to(d) / 14.0,
                        cities / 6.0,
                    ],
                    dim=1,
                )
            )
        cv = torch.stack(opp_cols, dim=1)  # [B, R, 3]
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
                          torch.stack(self._escalators(r + 1, s.civ_only_techs[:, r], s.civ_only_civics[:, r],
                                                      s.civ_only_builders_trained[:, r] if hasattr(s, "civ_only_builders_trained")
                                                      else torch.zeros(B, dtype=torch.long, device=dev),
                                                      torch.zeros(B, dtype=d, device=dev)), dim=1),
                          s._eff_cost(s.rules_dev.t_cost.unsqueeze(0).expand(B, -1), s.civ_only_tech_boosted[:, r], r + 1).to(d) / 1000.0,
                          s._eff_cost(s.rules_dev.c_cost.unsqueeze(0).expand(B, -1), s.civ_only_civic_boosted[:, r], r + 1, is_civic=True).to(d) / 1000.0,
                          self._ctx_block(r)], dim=1)

    def unit_features(self, seat: int = 0) -> torch.Tensor:
        """[B, P, 8] per unit-slot features for the units head: alive, type,
        hp, map position, and range/bearing to the nearest barbarian camp
        (zeros when no camp stands — the head then has nothing to hunt). Seat
        k>0 renders the same layout over that civ's slot map."""
        if seat != 0:
            return self._civ_unit_features(self._seat_civ(seat))
        s = self.sim
        d = s.dtype
        B = s.B
        tile = s.seat0_unit_tile.clamp(min=0)
        uq, ur = self._ax_q[tile], self._ax_r[tile]  # [B, P]
        camp = s.camp_tile  # [B, K], -1 padded
        live_camp = camp >= 0
        cq, cr = self._ax_q[camp.clamp(min=0)], self._ax_r[camp.clamp(min=0)]  # [B, K]
        dq = cq.unsqueeze(1) - uq.unsqueeze(2)  # [B, P, K]
        dr = cr.unsqueeze(1) - ur.unsqueeze(2)
        dist = (dq.abs() + dr.abs() + (dq + dr).abs()) // 2
        dist = torch.where(live_camp.unsqueeze(1), dist, torch.full_like(dist, 9999))
        near_d, near_k = dist.min(dim=2)  # [B, P]
        has_camp = live_camp.any(dim=1, keepdim=True)  # [B, 1]
        ndq = dq.gather(2, near_k.unsqueeze(2)).squeeze(2)
        ndr = dr.gather(2, near_k.unsqueeze(2)).squeeze(2)
        alive = s.seat0_unit_alive
        z = torch.zeros(B, SEAT0_POOL_MAX, dtype=d, device=s.device)
        keep = alive & has_camp
        feats = torch.stack(
            [
                alive.to(d),
                torch.where(alive, s.seat0_unit_type, torch.zeros_like(s.seat0_unit_type)).to(d) / max(len(s.rules.units or []), 1),
                torch.where(alive, s.seat0_unit_hp, torch.zeros_like(s.seat0_unit_hp)).to(d) / 100.0,
                torch.where(alive, (tile % s.W).to(d) / s.W, z),
                torch.where(alive, torch.div(tile, s.W, rounding_mode="floor").to(d) / s.H, z),
                torch.where(keep, (near_d.to(d) / 20.0).clamp(max=1.0), z),
                torch.where(keep, (ndq.to(d) / 10.0).clamp(min=-1.0, max=1.0), z),
                torch.where(keep, (ndr.to(d) / 10.0).clamp(min=-1.0, max=1.0), z),
            ],
            dim=2,
        )  # [B, P, 8]
        return feats
