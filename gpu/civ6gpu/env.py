"""Batched RL environment over BatchSim: masks → actions → score-delta reward.

Fixed-horizon lockstep episodes (every game resets together, like the ES
trainer's fixed-length rollouts): call reset(), then step() `horizon`
times, reading masks() before each step to constrain the policy's three
heads — per-city production, research, civics. Rewards telescope to
empireScore(state, 'balanced') at the horizon, the exact fitness the TS
benchmarks report.
"""

from __future__ import annotations

import torch

from .engine import BatchSim, Rules


class BatchEnv:
    def __init__(self, fixtures: list[dict], rules: Rules, device: str = "cpu", dtype=torch.float32, horizon: int = 100):
        self.sim = BatchSim(fixtures, rules, device=device, dtype=dtype)
        self.horizon = horizon
        self._last_score = self.sim.empire_score()

    @property
    def obs_size(self) -> int:
        return 9 + 7 * self.sim.C

    def reset(self) -> torch.Tensor:
        self.sim.reset()
        self._last_score = self.sim.empire_score()
        return self.observe()

    def masks(self) -> dict[str, torch.Tensor]:
        """production [B, C, NB+2+NU], tech [B, NT], civic [B, NC], units
        [B, P, 13] — all-False rows mean no decision pends there this turn."""
        return {
            "production": self.sim.production_mask(),
            "tech": self.sim.tech_mask(),
            "civic": self.sim.civic_mask(),
            "units": self.sim.unit_action_mask(),
        }

    def step(
        self,
        production: torch.Tensor | None = None,
        tech: torch.Tensor | None = None,
        civic: torch.Tensor | None = None,
        units: torch.Tensor | None = None,
    ) -> tuple[torch.Tensor, torch.Tensor, bool]:
        """Returns (obs [B, F], reward [B], done). done is batch-wide —
        lockstep fixed-horizon episodes; the caller resets."""
        self.sim.step(production=production, tech=tech, civic=civic, units=units)
        score = self.sim.empire_score()
        reward = score - self._last_score
        self._last_score = score
        return self.observe(), reward, self.sim.turn > self.horizon

    def observe(self) -> torch.Tensor:
        """[B, 6 + 6C] — coarse empire + per-city-slot features, v0."""
        s = self.sim
        d = s.dtype
        B, C = s.B, s.C
        need = s._growth_needed(s.pop).clamp(min=1)
        denom = s.cur_cost.clamp(min=1)
        owned = (s.owner.unsqueeze(1) == torch.arange(C, device=s.device).view(1, C, 1)).sum(dim=2).to(d)
        per = torch.stack(
            [
                s.alive.to(d),
                s.pop.to(d) / 10.0,
                s.food_box / need,
                torch.where(s.current >= 0, s.progress / denom, torch.zeros_like(s.progress)),
                s.culture_box / s._border_cost(s.tiles_acquired).clamp(min=1),
                owned / 20.0,
                torch.where(s.alive, s.city_hp, torch.zeros_like(s.city_hp)).to(d) / 200.0,
            ],
            dim=2,
        )  # [B, C, 7]
        emp = torch.stack(
            [
                torch.full((B,), float(s.turn) / self.horizon, dtype=d, device=s.device),
                s.settlers.to(d),
                s.alive.sum(dim=1).to(d) / C,
                s.treasury / 100.0,
                s.tech_prog / 50.0,
                s.civic_prog / 50.0,
                s.u_alive.sum(dim=1).to(d) / 10.0,
                s.n_camps.to(d),
                s.p_alive.sum(dim=1).to(d) / 10.0,
            ],
            dim=1,
        )  # [B, 9]
        return torch.cat([emp, per.reshape(B, -1)], dim=1)
