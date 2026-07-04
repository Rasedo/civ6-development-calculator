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

    def masks(self) -> dict[str, torch.Tensor]:
        """production [B, C, NB+2+NU], tech [B, NT], civic [B, NC], units
        [B, P, 13], envoy [B, S] — all-False rows mean no decision pends
        there this turn."""
        return {
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
    ) -> tuple[torch.Tensor, torch.Tensor, bool]:
        """Returns (obs [B, F], reward [B], done). done is batch-wide —
        lockstep fixed-horizon episodes; the caller resets."""
        self.sim.step(production=production, tech=tech, civic=civic, units=units, envoy=envoy)
        score = self.sim.empire_score()
        reward = score - self._last_score
        self._last_score = score
        return self.observe(), reward, self.sim.turn > self.horizon

    def observe(self) -> torch.Tensor:
        """[B, obs_size] — empire globals, city-state courtship, rival
        posture, and per-city-slot economy/defense, all roughly unit-scaled."""
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

    def unit_features(self) -> torch.Tensor:
        """[B, P, 8] per player-unit-slot features for the units head:
        alive, type, hp, map position, and range/bearing to the nearest
        barbarian camp (zeros when no camp stands — the head then has
        nothing to hunt)."""
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
