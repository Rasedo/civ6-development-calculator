"""Batched RL environment over BatchSim: masks → actions → score-delta reward.

Fixed-horizon lockstep episodes (every game resets together, like the ES
trainer's fixed-length rollouts): call reset(), then step() `horizon`
times, reading masks() before each step to constrain the policy's five
heads — per-city production, research, civics, per-unit orders, envoys.
Rewards telescope to empireScore(state, 'balanced') at the horizon, the
exact fitness the TS benchmarks report.

Two observation streams feed the phase-5 policy:

  observe()        [B, obs_size]  — empire + per-city-slot features
  unit_features()  [B, P, 8]      — per unit slot, for the units head
                                    (alive, type, hp, position, and the
                                    bearing to the nearest barbarian camp)

reset(scramble=...) re-seeds each game's in-state mulberry32 per episode,
so consecutive episodes see different barbarian spawns, quests, wars and
disasters on the same maps; reset() without it reproduces the fixture's
exact stream — the parity setting.
"""

from __future__ import annotations

import torch

from .engine import BatchSim, Rules, P_MAX

N_UNIT_ACTS = 16  # keep in sync with the unit head (train_ppo)
from .rng import hash_keys

_M32 = (1 << 32) - 1
_GLOBAL_F = 14
_PER_CS_F = 3
_PER_RIVAL_F = 3
_PER_CITY_F = 9
UNIT_FEATURES = 8


class BatchEnv:
    def __init__(self, fixtures: list[dict], rules: Rules, device: str = "cpu", dtype=torch.float32, horizon: int = 100):
        self.sim = BatchSim(fixtures, rules, device=device, dtype=dtype)
        self.horizon = horizon
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
        return _GLOBAL_F + _PER_CS_F * s.S + _PER_RIVAL_F * s.R + _PER_CITY_F * s.C

    def reset(self, scramble: int | None = None) -> torch.Tensor:
        """Restore the initial state (all games, lockstep).

        scramble=None replays the fixture's recorded RNG stream — identical
        worlds every episode, and what the parity gates compare against.
        Passing an int re-seeds each game's mulberry32 from (scramble, game
        index, episode counter): same maps, fresh barbarians/quests/wars/
        disasters each episode — the training setting.
        """
        self.sim.reset()
        if scramble is not None:
            s = self.sim
            h = hash_keys(scramble, torch.arange(s.B, dtype=torch.int64), self._episode)
            s.rng_state.copy_((h & _M32).to(s.rng_state.dtype).to(s.device))
            self._episode += 1
        self._last_score = self.sim.empire_score()
        return self.observe()

    def _seat_rival(self, seat: int) -> int:
        """Seat k>0 maps to rival k-1; seat 0 is the player civ."""
        r = seat - 1
        if r < 0 or r >= self.sim.R:
            raise ValueError(f"seat {seat} out of range (O = {self.sim.R + 1})")
        return r

    def masks(self, seat: int = 0) -> dict[str, torch.Tensor]:
        """production [B, C, NB+2+NU], tech [B, NT], civic [B, NC], units
        [B, P, 13], envoy [B, S] — all-False rows mean no decision pends
        there this turn. Seat k>0 (C2b): the controlled rival's decision
        space in the same layouts; units/envoy all-False (the rival unit
        AI stays scripted until C3-prep; rivals have no envoys)."""
        if seat != 0:
            r = self._seat_rival(seat)
            s = self.sim
            m = s.rival_masks(r)
            prod = m["production"][:, : s.C]  # city axis mirrors the player width
            pw = s.production_mask().shape[2]
            if prod.shape[2] < pw:  # purchase block active: pad all-False
                pad = torch.zeros(s.B, prod.shape[1], pw - prod.shape[2], dtype=torch.bool, device=s.device)
                prod = torch.cat([prod, pad], dim=2)
            return {
                "war": torch.zeros(s.B, 2 * max(s.R, 1), dtype=torch.bool, device=s.device),  # rival war stays scripted
                "production": prod,
                "tech": m["tech"],
                "civic": m["civic"],
                "units": s.rival_unit_mask(r),  # C3-prep: the rival units head is live
                "envoy": torch.zeros(s.B, s.S, dtype=torch.bool, device=s.device),
            }
        return {
            "war": self.sim.war_mask(),  # V-W1 active: [B, 2R] declare/peace
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
        lockstep fixed-horizon episodes; the caller resets. Seat k>0
        (C2b): actions route into the controlled rival BEFORE the world
        steps; reward is that rival's score delta."""
        if seat != 0:
            r = self._seat_rival(seat)
            self.sim.controlled[:, r] = True
            self.sim.apply_rival_actions(r, production=production, tech=tech, civic=civic)
            if units is not None:
                self.sim._apply_rival_unit_actions(r, units)
            prev = getattr(self, "_last_rival_score", None)
            if prev is None or prev.get("r") != r:
                prev = {"r": r, "score": self.sim.rival_score(r)}
            self.sim.step()
            score = self.sim.rival_score(r)
            reward = score - prev["score"]
            self._last_rival_score = {"r": r, "score": score}
            return self.observe(seat), reward, self.sim.turn > self.horizon
        self.sim.step(production=production, tech=tech, civic=civic, units=units, envoy=envoy, war=war)
        score = self.sim.empire_score()
        reward = score - self._last_score
        self._last_score = score
        return self.observe(seat), reward, self.sim.turn > self.horizon

    def observe(self, seat: int = 0) -> torch.Tensor:
        """[B, obs_size] — empire globals, city-state courtship, rival
        posture, and per-city-slot economy/defense, all roughly unit-scaled.
        The schema is seat-invariant by design (C2): seat k>0 renders the
        same layout from the rival tensor family (C2b)."""
        if seat != 0:
            return self._observe_rival(self._seat_rival(seat))
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
            ],
            dim=2,
        )  # [B, C, 9]
        emp = torch.stack(
            [
                torch.full((B,), float(s.turn) / self.horizon, dtype=d, device=dev),
                s.techs.sum(dim=1).to(d) / max(s.techs.shape[1], 1),
                s.civics.sum(dim=1).to(d) / max(s.civics.shape[1], 1),
                s.tech_prog / 50.0,
                s.civic_prog / 50.0,
                s.settlers.to(d),
                s.settlers_queued.to(d),
                s.alive.sum(dim=1).to(d) / C,
                (s.treasury / 200.0).clamp(max=5.0),
                s.envoys_avail.to(d) / 5.0,
                s.influence / 100.0,
                s.n_camps.to(d) / 5.0,
                s.u_alive.sum(dim=1).to(d) / 10.0,
                s.p_alive.sum(dim=1).to(d) / 10.0,
            ],
            dim=1,
        )  # [B, 14]
        cs = torch.stack(
            [
                s.cs_met.to(d),
                s.cs_envoys.to(d) / 6.0,
                (s.cs_quest > 0).to(d),
            ],
            dim=2,
        )  # [B, S, 3]
        riv = torch.stack(
            [
                (s.r_alive & s.r_atwar).to(d),
                s.r_warturns.to(d) / 14.0,
                (s.rc_alive.sum(dim=2) * s.r_alive.long()).to(d) / 6.0,
            ],
            dim=2,
        )  # [B, R, 3]
        return torch.cat([emp, cs.reshape(B, -1), riv.reshape(B, -1), per_city.reshape(B, -1)], dim=1)

    def _rival_unit_features(self, r: int) -> torch.Tensor:
        """[B, P, 8] the player unit-feature layout over the rival's slot
        map: alive, type, hp, axial position, camp bearing zeros (the
        scripted hunt heuristic is a player-policy feature)."""
        s = self.sim
        d = s.dtype
        B = s.B
        smap = s.rival_slot_map(r)
        present = smap >= 0
        sc = smap.clamp(min=0)
        tile = s.v_tile.gather(1, sc).clamp(min=0)
        out = torch.stack(
            [
                present.to(d),
                s.v_type.gather(1, sc).to(d) / 10.0,
                s.v_hp.gather(1, sc).to(d) / 100.0,
                self._ax_q[tile].to(d) / 20.0,
                self._ax_r[tile].to(d) / 20.0,
                torch.zeros(B, P_MAX, dtype=d, device=s.device),
                torch.zeros(B, P_MAX, dtype=d, device=s.device),
                s.v_charges.gather(1, sc).to(d) / 3.0,
            ],
            dim=2,
        )
        return out * present.unsqueeze(2).to(d)

    def _observe_rival(self, r: int) -> torch.Tensor:
        """The seat-invariant obs layout rendered from rival r's tensors:
        my empire = the rc_*/r_* family (slots beyond C invisible — RC>C by
        flips only), the CS block zeros (no rival courtship), the rival
        block's slot 0 = THE PLAYER viewed as an opponent, then the other
        rivals. Fields without a rival analog (treasury, envoys, influence)
        render zero; loyalty renders full."""
        s = self.sim
        d = s.dtype
        B, C = s.B, s.C
        dev = s.device
        pop = s.rc_pop[:, r, :C].to(d)
        alive = s.rc_alive[:, r, :C]
        needs = s._growth_needed(s.rc_pop[:, r, :C]).clamp(min=1)
        denom = s.rc_cost[:, r, :C].clamp(min=1)
        per_city = torch.stack(
            [
                alive.to(d),
                pop / 10.0,
                s.rc_growth[:, r, :C].to(d) / needs.to(d),
                torch.where(s.rc_current[:, r, :C] >= 0, s.rc_progress[:, r, :C].to(d) / denom.to(d), torch.zeros_like(pop)),
                torch.zeros(B, C, dtype=d, device=dev),  # no per-city border box
                s.rc_acquired[:, r, :C].to(d) / 20.0 if hasattr(s, "rc_acquired") else torch.zeros(B, C, dtype=d, device=dev),
                torch.where(alive, s.rc_hp[:, r, :C].to(d), torch.zeros_like(pop)) / 200.0,
                torch.ones(B, C, dtype=d, device=dev),  # rivals hold full loyalty
                (s.rc_current[:, r, :C] >= 0).to(d),
            ],
            dim=2,
        )  # [B, C, 9]
        n_own_units = (s.v_alive & (s.v_civ == r)).sum(dim=1).to(d)
        emp = torch.stack(
            [
                torch.full((B,), float(s.turn) / self.horizon, dtype=d, device=dev),
                s.r_techs[:, r].sum(dim=1).to(d) / max(s.r_techs.shape[2], 1),
                s.r_civics[:, r].sum(dim=1).to(d) / max(s.r_civics.shape[2], 1),
                s.r_tech_prog[:, r].to(d) / 50.0,
                s.r_civic_prog[:, r].to(d) / 50.0,
                (s.rc_current[:, r] == 0).sum(dim=1).to(d),  # settlers in production
                (s.rc_current[:, r] == 0).any(dim=1).to(d),
                s.rc_alive[:, r].sum(dim=1).to(d) / C,
                torch.zeros(B, dtype=d, device=dev),  # no rival treasury
                torch.zeros(B, dtype=d, device=dev),  # no envoys
                torch.zeros(B, dtype=d, device=dev),  # no influence
                s.n_camps.to(d) / 5.0,
                s.u_alive.sum(dim=1).to(d) / 10.0,
                n_own_units / 10.0,
            ],
            dim=1,
        )  # [B, 14]
        cs = torch.zeros(B, s.S, _PER_CS_F, dtype=d, device=dev)
        # opponents: slot 0 = the player, then the other rivals in order
        opp_cols = [
            torch.stack(
                [
                    (s.r_alive[:, r] & s.r_atwar[:, r]).to(d),  # the war IS vs the player
                    s.r_warturns[:, r].to(d) / 14.0,
                    s.alive.sum(dim=1).to(d) / 6.0,
                ],
                dim=1,
            )
        ]
        for o in range(s.R):
            if o == r:
                continue
            opp_cols.append(
                torch.stack(
                    [
                        (s.r_alive[:, o] & s.r_atwar[:, o]).to(d),
                        s.r_warturns[:, o].to(d) / 14.0,
                        (s.rc_alive[:, o].sum(dim=1) * s.r_alive[:, o].long()).to(d) / 6.0,
                    ],
                    dim=1,
                )
            )
        riv = torch.stack(opp_cols, dim=1)  # [B, R, 3]
        return torch.cat([emp, cs.reshape(B, -1), riv.reshape(B, -1), per_city.reshape(B, -1)], dim=1)

    def unit_features(self, seat: int = 0) -> torch.Tensor:
        """[B, P, 8] per player-unit-slot features for the units head:
        alive, type, hp, map position, and range/bearing to the nearest
        barbarian camp (zeros when no camp stands — the head then has
        nothing to hunt). Seat k>0: zeros — a controlled rival's unit head
        is masked off until C3-prep, so there is nothing to featurize."""
        if seat != 0:
            return self._rival_unit_features(self._seat_rival(seat))
        s = self.sim
        d = s.dtype
        B = s.B
        tile = s.p_tile.clamp(min=0)
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
        alive = s.p_alive
        z = torch.zeros(B, P_MAX, dtype=d, device=s.device)
        keep = alive & has_camp
        feats = torch.stack(
            [
                alive.to(d),
                torch.where(alive, s.p_type, torch.zeros_like(s.p_type)).to(d) / max(len(s.rules.units or []), 1),
                torch.where(alive, s.p_hp, torch.zeros_like(s.p_hp)).to(d) / 100.0,
                torch.where(alive, (tile % s.W).to(d) / s.W, z),
                torch.where(alive, torch.div(tile, s.W, rounding_mode="floor").to(d) / s.H, z),
                torch.where(keep, (near_d.to(d) / 20.0).clamp(max=1.0), z),
                torch.where(keep, (ndq.to(d) / 10.0).clamp(min=-1.0, max=1.0), z),
                torch.where(keep, (ndr.to(d) / 10.0).clamp(min=-1.0, max=1.0), z),
            ],
            dim=2,
        )  # [B, P, 8]
        return feats
