"""C2c — the O=2 duel surface: two seats over one BatchSim.

Seat 0 = the player civ (the full 5-head surface); seat 1 = rival 0,
controlled through the C2b seat surface (economics + research; its
military stays under the scripted AI until C3-prep's war verbs). Each
step: seat 1's choices are applied first, then the world advances one
turn carrying seat 0's actions — exactly the ordering the engine's
rival phase honors.

Rewards are per-seat with the C2 phase switch:
  reward="dense"     — own score delta (bootstrap)
  reward="relative"  — own minus opponent delta (symmetrized, zero-sum;
                       the self-play setting)
"""

from __future__ import annotations

import torch

from .engine import Rules
from .env import BatchEnv


class DuelEnv:
    SEATS = 2

    def __init__(
        self,
        fixtures: list[dict],
        rules: Rules,
        device: str = "cpu",
        dtype=torch.float32,
        horizon: int | None = None,
        reward: str = "dense",
    ):
        assert reward in ("dense", "relative")
        self.env = BatchEnv(fixtures, rules, device=device, dtype=dtype, horizon=horizon)
        self.reward_mode = reward
        self.horizon = self.env.horizon  # None resolved to rules.turn_limit there
        self.war_shaping = 0.0  # V-WS: set by the trainer (--war-shaping)
        self._ws_prev = None

    @property
    def sim(self):
        return self.env.sim

    @property
    def obs_size(self) -> int:
        return self.env.obs_size

    def reset(self, scramble: int | None = None) -> torch.Tensor:
        self.env.reset(scramble=scramble)
        s = self.sim
        s.controlled[:, 0] = True
        self._last = torch.stack([s.empire_score(), s.rival_score(0)], dim=1)  # [B, 2]
        self._ws_prev = None
        return self.observe_all()

    def observe_all(self) -> torch.Tensor:
        return torch.stack([self.env.observe(seat=0), self.env.observe(seat=1)], dim=1)  # [B, 2, F]

    def masks(self) -> list[dict[str, torch.Tensor]]:
        return [self.env.masks(seat=0), self.env.masks(seat=1)]

    def step(self, seat0: dict | None = None, seat1: dict | None = None) -> tuple[torch.Tensor, torch.Tensor, bool]:
        """seat0/seat1: {'production': ..., 'tech': ..., 'civic': ...,
        seat0 also 'units'/'envoy'} action dicts (missing keys = abstain).
        Returns (obs [B, 2, F], rewards [B, 2], done)."""
        s = self.sim
        a1 = seat1 or {}
        s.apply_rival_actions(0, production=a1.get("production"), tech=a1.get("tech"), civic=a1.get("civic"), war=a1.get("war"))
        if a1.get("units") is not None:
            s._apply_rival_unit_actions(0, a1["units"])
        a0 = seat0 or {}
        s.step(
            production=a0.get("production"),
            tech=a0.get("tech"),
            civic=a0.get("civic"),
            units=a0.get("units"),
            envoy=a0.get("envoy"),
            war=a0.get("war"),
        )
        score = torch.stack([s.empire_score(), s.rival_score(0)], dim=1)
        delta = score - self._last
        self._last = score
        if self.reward_mode == "relative":
            rew = delta - delta.flip(1)  # own minus opponent — zero-sum by construction
        else:
            rew = delta
        if self.war_shaping > 0.0:
            # V-WS: a DENSE siege gradient — seat 0 is paid for rival-city HP
            # damage and (heavily) for eliminations; seat 1 symmetrically for
            # player-city damage/eliminations. Shaping rides on TOP of the
            # game reward (potential-free, so it biases exploration, not the
            # final objective's sign).
            rc_hp = s.rc_hp.clamp(min=0).sum(dim=(1, 2)).to(rew.dtype)
            rc_n = s.rc_alive.sum(dim=(1, 2)).to(rew.dtype)
            p_hp = s.city_hp.sum(dim=1).to(rew.dtype)
            p_n = s.alive.sum(dim=1).to(rew.dtype)
            if self._ws_prev is not None:
                dmg0 = (self._ws_prev[0] - rc_hp).clamp(min=0) / 100.0
                elim0 = (self._ws_prev[1] - rc_n).clamp(min=0)
                dmg1 = (self._ws_prev[2] - p_hp).clamp(min=0) / 100.0
                elim1 = (self._ws_prev[3] - p_n).clamp(min=0)
                rew = rew.clone()
                rew[:, 0] += self.war_shaping * (dmg0 + 10.0 * elim0)
                rew[:, 1] += self.war_shaping * (dmg1 + 10.0 * elim1)
            self._ws_prev = (rc_hp, rc_n, p_hp, p_n)
        return self.observe_all(), rew, s.turn > self.horizon
