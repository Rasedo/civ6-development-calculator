"""Custom feature extractor for the spatial observation: a small CNN over
the map planes concatenated with an MLP over the summary+candidate vector.
(SB3's built-in NatureCNN expects ≥36×36 Atari-style frames; our map is
26×44 with 20 semantic planes, so we roll our own 3×3 tower.)
"""

from __future__ import annotations

import torch
import torch.nn as nn
from gymnasium import spaces
from stable_baselines3.common.torch_layers import BaseFeaturesExtractor


class Civ6CnnExtractor(BaseFeaturesExtractor):
    def __init__(self, observation_space: spaces.Dict, features_dim: int = 384):
        super().__init__(observation_space, features_dim)
        planes, h, w = observation_space["map"].shape
        vec_dim = observation_space["vec"].shape[0]

        self.cnn = nn.Sequential(
            nn.Conv2d(planes, 32, kernel_size=3, padding=1),
            nn.ReLU(),
            nn.Conv2d(32, 64, kernel_size=3, padding=1, stride=2),
            nn.ReLU(),
            nn.Conv2d(64, 64, kernel_size=3, padding=1, stride=2),
            nn.ReLU(),
            nn.Flatten(),
        )
        with torch.no_grad():
            cnn_out = self.cnn(torch.zeros(1, planes, h, w)).shape[1]
        self.cnn_head = nn.Sequential(nn.Linear(cnn_out, 256), nn.ReLU())
        self.vec_head = nn.Sequential(nn.Linear(vec_dim, 128), nn.ReLU())
        self.out = nn.Sequential(nn.Linear(256 + 128, features_dim), nn.ReLU())

    def forward(self, obs: dict[str, torch.Tensor]) -> torch.Tensor:
        # uint8 planes hold small counts (0–6); a /4 scale keeps them O(1).
        m = self.cnn_head(self.cnn(obs["map"].float() / 4.0))
        v = self.vec_head(obs["vec"])
        return self.out(torch.cat([m, v], dim=1))
