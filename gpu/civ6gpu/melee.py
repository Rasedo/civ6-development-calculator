"""C3c — the O-seat free-for-all surface over one BatchSim.

Seat 0 = the player civ (full surface); seats 1..O-1 = rivals 0..O-2,
all controlled through the C2 seat surface (economics + research + the
units head; war stays on the scripted rolls until the symmetric war
head lands). Rewards per seat with the FFA phase switch:

  reward="dense"     — own score delta
  reward="relative"  — own delta minus the MEAN of the other seats'
                       (zero-sum across seats by construction)

The O=2 special case reproduces DuelEnv's semantics exactly.
"""

from __future__ import annotations

import torch

from .engine import Rules
from .env import BatchEnv


class MeleeEnv:
    def __init__(
        self,
        fixtures: list[dict],
        rules: Rules,
        device: str = "cpu",
        dtype=torch.float32,
        horizon: int = 100,
        reward: str = "dense",
        seats: int | None = None,
    ):
        assert reward in ("dense", "relative")
        self.env = BatchEnv(fixtures, rules, device=device, dtype=dtype, horizon=horizon)
        self.O = (self.sim.R + 1) if seats is None else seats
        assert 2 <= self.O <= self.sim.R + 1, f"seats {self.O} needs {self.O - 1} rivals in the fixtures"
        self.reward_mode = reward
        self.horizon = horizon

    @property
    def sim(self):
        return self.env.sim

    @property
    def obs_size(self) -> int:
        return self.env.obs_size

    def _scores(self) -> torch.Tensor:
        s = self.sim
        cols = [s.empire_score()] + [s.rival_score(r) for r in range(self.O - 1)]
        return torch.stack(cols, dim=1)  # [B, O]

    def reset(self, scramble: int | None = None) -> torch.Tensor:
        self.env.reset(scramble=scramble)
        for r in range(self.O - 1):
            self.sim.controlled[:, r] = True
        self._last = self._scores()
        return self.observe_all()

    def observe_all(self) -> torch.Tensor:
        return torch.stack([self.env.observe(seat=k) for k in range(self.O)], dim=1)  # [B, O, F]

    def masks(self) -> list[dict[str, torch.Tensor]]:
        return [self.env.masks(seat=k) for k in range(self.O)]

    def unit_features_all(self) -> torch.Tensor:
        return torch.stack([self.env.unit_features(seat=k) for k in range(self.O)], dim=1)

    def step(self, actions: list[dict | None]) -> tuple[torch.Tensor, torch.Tensor, bool]:
        """actions[k] = seat k's dict (None = abstain). Rival choices apply
        first (seat order), then the world advances with seat 0's."""
        s = self.sim
        assert len(actions) == self.O
        for k in range(1, self.O):
            a = actions[k] or {}
            s.apply_rival_actions(k - 1, production=a.get("production"), tech=a.get("tech"), civic=a.get("civic"), war=a.get("war"))
            if a.get("units") is not None:
                s._apply_rival_unit_actions(k - 1, a["units"])
        a0 = actions[0] or {}
        s.step(
            production=a0.get("production"),
            tech=a0.get("tech"),
            civic=a0.get("civic"),
            units=a0.get("units"),
            envoy=a0.get("envoy"),
            war=a0.get("war"),
        )
        score = self._scores()
        delta = score - self._last
        self._last = score
        if self.reward_mode == "relative":
            others = (delta.sum(dim=1, keepdim=True) - delta) / max(self.O - 1, 1)
            rew = delta - others
        else:
            rew = delta
        return self.observe_all(), rew, s.turn > self.horizon
