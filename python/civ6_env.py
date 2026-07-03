"""Gymnasium wrapper around the TypeScript Civ 6 simulator.

Each Civ6Env owns one `node dist-rl/rl-bridge.js` subprocess and talks a
JSON-lines protocol over stdin/stdout. Use SubprocVecEnv to run many in
parallel (one node process each).

Observation: Box(obs_size + max_cands * cand_size)  — empire summary
followed by the flattened, zero-padded candidate feature matrix.
Action: Discrete(max_cands) with `action_masks()` marking valid entries
(sb3-contrib's MaskablePPO consumes this automatically).
Reward: per-decision empire-score delta (episode return = final − start),
scaled by `reward_scale`.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

import numpy as np

try:
    import gymnasium as gym
    from gymnasium import spaces
except ImportError as e:  # pragma: no cover
    raise ImportError("pip install -r requirements.txt first") from e

REPO_ROOT = Path(__file__).resolve().parent.parent
BRIDGE_JS = REPO_ROOT / "dist-rl" / "rl-bridge.js"


class BridgeError(RuntimeError):
    pass


class Civ6Env(gym.Env):
    metadata = {"render_modes": []}

    def __init__(
        self,
        seed: int = 1,
        horizon: int = 100,
        objective: str = "balanced",
        reward_scale: float = 0.01,
        node: str = "node",
        bridge_js: str | Path = BRIDGE_JS,
    ):
        super().__init__()
        if not Path(bridge_js).exists():
            raise FileNotFoundError(
                f"{bridge_js} not found — run `npm run rl:build` in the repo root first."
            )
        self._proc = subprocess.Popen(
            [node, str(bridge_js)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            bufsize=1,
        )
        self.reward_scale = reward_scale
        info = self._request(
            {"cmd": "init", "envs": 1, "horizon": horizon, "objective": objective, "seed": seed}
        )
        if not info.get("ok"):
            raise BridgeError(f"bridge init failed: {info}")
        self.obs_size = info["obsSize"]
        self.cand_size = info["candSize"]
        self.max_cands = info["maxCands"]
        self.feature_version = info["featureVersion"]

        dim = self.obs_size + self.max_cands * self.cand_size
        self.observation_space = spaces.Box(low=-np.inf, high=np.inf, shape=(dim,), dtype=np.float32)
        self.action_space = spaces.Discrete(self.max_cands)
        self._mask = np.ones(self.max_cands, dtype=bool)
        self._last_final_score: float | None = None

    # --- protocol ---------------------------------------------------------

    def _request(self, msg: dict) -> dict:
        assert self._proc.stdin and self._proc.stdout
        self._proc.stdin.write(json.dumps(msg) + "\n")
        self._proc.stdin.flush()
        line = self._proc.stdout.readline()
        if not line:
            raise BridgeError("bridge process died (empty response)")
        out = json.loads(line)
        if "error" in out:
            raise BridgeError(out["error"])
        return out

    def _unpack(self, r: dict) -> np.ndarray:
        self._mask = np.asarray(r["mask"], dtype=bool)
        return np.concatenate(
            [np.asarray(r["obs"], dtype=np.float32), np.asarray(r["cands"], dtype=np.float32)]
        )

    # --- gym api ----------------------------------------------------------

    def action_masks(self) -> np.ndarray:
        """Valid-action mask for MaskablePPO."""
        return self._mask

    def reset(self, *, seed: int | None = None, options: Any = None):
        super().reset(seed=seed)
        r = self._request({"cmd": "reset"})["results"][0]
        return self._unpack(r), {}

    def step(self, action):
        r = self._request({"cmd": "step", "actions": [int(action)]})["results"][0]
        obs = self._unpack(r)
        reward = float(r["reward"]) * self.reward_scale
        done = bool(r["done"])
        info: dict[str, Any] = {}
        if done:
            # Auto-reset semantics: obs already belongs to the fresh episode.
            self._last_final_score = float(r.get("score", 0.0))
            info["episode_score"] = self._last_final_score
            info["episode_turns"] = r.get("turn", 0)
        return obs, reward, done, False, info

    def close(self):
        try:
            if self._proc.stdin:
                self._proc.stdin.write(json.dumps({"cmd": "close"}) + "\n")
                self._proc.stdin.flush()
        except (BrokenPipeError, ValueError):
            pass
        self._proc.terminate()
        self._proc.wait(timeout=5)


def make_env(rank: int, seed: int = 1, **kwargs):
    """Factory for SubprocVecEnv: each rank gets its own seed stream."""

    def _init() -> Civ6Env:
        return Civ6Env(seed=seed + rank * 1000, **kwargs)

    return _init
