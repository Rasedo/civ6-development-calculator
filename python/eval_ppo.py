"""Evaluate a trained MaskablePPO model on the SAME held-out seeds the
TypeScript evaluator uses (100 + i*97), so tables are directly comparable:

    python eval_ppo.py --model ppo_civ6.zip --seeds 40
"""

from __future__ import annotations

import argparse

import numpy as np
from gymnasium import spaces
from sb3_contrib import MaskablePPO

from civ6_env import Civ6Env


def run_episode(model: MaskablePPO, seed: int, horizon: int, objective: str) -> float:
    spatial = isinstance(model.observation_space, spaces.Dict)
    env = Civ6Env(seed=seed, horizon=horizon, objective=objective, spatial=spatial)
    obs, _ = env.reset()
    score = 0.0
    while True:
        action, _ = model.predict(obs, action_masks=env.action_masks(), deterministic=True)
        obs, _, done, _, info = env.step(int(action))
        if done:
            score = info["episode_score"]
            break
    env.close()
    return score


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--model", default="ppo_civ6.zip")
    p.add_argument("--seeds", type=int, default=40)
    p.add_argument("--horizon", type=int, default=100)
    p.add_argument("--objective", default="balanced")
    args = p.parse_args()

    model = MaskablePPO.load(args.model)
    seeds = [100 + i * 97 for i in range(args.seeds)]
    scores = []
    for s in seeds:
        scores.append(run_episode(model, s, args.horizon, args.objective))
        print(f"seed {s}: {scores[-1]:.0f}")
    arr = np.array(scores)
    rng = np.random.default_rng(42)
    boots = [np.mean(rng.choice(arr, len(arr))) for _ in range(1000)]
    lo, hi = np.percentile(boots, [2.5, 97.5])
    print(f"\nPPO mean {arr.mean():.1f}  [{lo:.1f}, {hi:.1f}]  over {len(arr)} seeds")
    print("compare with: npm run rl:eval -- --seeds", args.seeds)


if __name__ == "__main__":
    main()
