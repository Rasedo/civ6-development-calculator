"""Train MaskablePPO on the Civ 6 simulator through the node bridge.

    python train_ppo.py --envs 16 --timesteps 2000000 --device auto

Checkpoints land in ./checkpoints, TensorBoard logs in ./tb (view with
`tensorboard --logdir tb`), and the final model in ppo_civ6.zip.
Resume by passing --load checkpoints/<file>.zip.
"""

from __future__ import annotations

import argparse
import time

import numpy as np
from sb3_contrib import MaskablePPO
from sb3_contrib.common.maskable.utils import get_action_masks
from stable_baselines3.common.callbacks import BaseCallback, CheckpointCallback
from stable_baselines3.common.vec_env import SubprocVecEnv

from civ6_env import make_env


class ScoreLogger(BaseCallback):
    """Log the true (unscaled) empire score of finished episodes."""

    def __init__(self, window: int = 100):
        super().__init__()
        self.scores: list[float] = []
        self.window = window

    def _on_step(self) -> bool:
        for info in self.locals.get("infos", []):
            if "episode_score" in info:
                self.scores.append(info["episode_score"])
        if self.scores and self.num_timesteps % 2048 < self.training_env.num_envs:
            recent = self.scores[-self.window :]
            self.logger.record("civ6/score_mean", float(np.mean(recent)))
            self.logger.record("civ6/score_max", float(np.max(recent)))
            self.logger.record("civ6/episodes", len(self.scores))
        return True


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--envs", type=int, default=8, help="parallel node simulators")
    p.add_argument("--timesteps", type=int, default=1_000_000, help="total decisions to train on")
    p.add_argument("--horizon", type=int, default=100)
    p.add_argument("--objective", default="balanced")
    p.add_argument("--seed", type=int, default=1)
    p.add_argument("--device", default="auto", help="auto | cpu | cuda")
    p.add_argument("--lr", type=float, default=3e-4)
    p.add_argument("--n-steps", type=int, default=256, help="rollout length per env per update")
    p.add_argument("--load", default=None, help="checkpoint .zip to resume from")
    p.add_argument("--cnn", action="store_true", help="spatial map observation + CNN policy")
    args = p.parse_args()

    env = SubprocVecEnv(
        [
            make_env(i, seed=args.seed, horizon=args.horizon, objective=args.objective, spatial=args.cnn)
            for i in range(args.envs)
        ]
    )

    try:
        import tensorboard  # noqa: F401

        tb_dir: str | None = "tb"
    except ImportError:
        tb_dir = None
        print("(tensorboard not installed — curves logged to stdout only)")

    if args.cnn:
        from cnn_policy import Civ6CnnExtractor

        policy = "MultiInputPolicy"
        policy_kwargs = dict(
            features_extractor_class=Civ6CnnExtractor,
            net_arch=dict(pi=[128], vf=[128]),
        )
    else:
        policy = "MlpPolicy"
        policy_kwargs = dict(net_arch=dict(pi=[128, 128], vf=[128, 128]))

    if args.load:
        model = MaskablePPO.load(args.load, env=env, device=args.device)
        print(f"resumed from {args.load}")
    else:
        model = MaskablePPO(
            policy,
            env,
            learning_rate=args.lr,
            n_steps=args.n_steps,
            batch_size=256,
            gamma=0.999,  # long games: value nearly undiscounted
            ent_coef=0.01,
            policy_kwargs=policy_kwargs,
            verbose=1,
            tensorboard_log=tb_dir,
            device=args.device,
        )

    t0 = time.time()
    model.learn(
        total_timesteps=args.timesteps,
        callback=[
            ScoreLogger(),
            CheckpointCallback(save_freq=max(10_000 // args.envs, 1), save_path="checkpoints", name_prefix="ppo_civ6"),
        ],
        reset_num_timesteps=args.load is None,
        progress_bar=True,
    )
    model.save("ppo_civ6")
    print(f"done in {(time.time() - t0) / 60:.1f} min → ppo_civ6.zip")
    env.close()


if __name__ == "__main__":
    main()
