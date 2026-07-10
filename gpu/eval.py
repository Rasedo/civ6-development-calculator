"""Evaluate a policy on the vectorized env — the phase-5 benchmark protocol.

    python gpu/eval.py --policy random
    python gpu/eval.py --policy scripted
    python gpu/eval.py --policy gpu/runs/ppo/best.pt [--sample]

Runs N independent episodes (fixtures round-robin, worlds re-seeded per
episode from --seed) and reports the empireScore(state, 'balanced')
distribution at the horizon — the same fitness the TS benchmark table
uses, though the worlds differ: this env has direct unit control and the
full hostile world, so compare numbers only WITHIN this table:

  random    masked-uniform actions every head
  scripted  the engine's built-in autopilot (the parity scenario's policy)
  <ckpt>    a train_ppo.py checkpoint (greedy by default, --sample to draw)
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from civ6gpu import load_rules, load_fixture, FIXTURES
from civ6gpu.env import BatchEnv
from civ6gpu.rng import masked_choice
from civ6gpu.engine import P_MAX


def build_env(episodes: int, device: str, horizon: int) -> BatchEnv:
    paths = sorted(FIXTURES.glob("seed*.json"))
    if not paths:
        print("no fixtures — run `npm run gpu:export` first")
        raise SystemExit(1)
    pool = [load_fixture(p) for p in paths]
    fixtures = [pool[i % len(pool)] for i in range(episodes)]
    return BatchEnv(fixtures, load_rules(), device=device, dtype=torch.float32, horizon=horizon)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--policy", default="random", help="random | scripted | path/to/ckpt.pt")
    ap.add_argument("--episodes", type=int, default=50)
    ap.add_argument("--horizon", type=int, default=None, help="default: the fixtures' turnLimit (TS TURN_LIMIT)")
    ap.add_argument("--seed", type=int, default=424242)
    ap.add_argument("--sample", action="store_true", help="sample the checkpoint policy instead of argmax")
    ap.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    args = ap.parse_args()

    if args.horizon is None:  # single knob: the game's own length
        args.horizon = load_rules().turn_limit
    env = build_env(args.episodes, args.device, args.horizon)
    B = env.sim.B
    env.reset(scramble=args.seed)

    policy = None
    if args.policy not in ("random", "scripted"):
        from train_ppo import Policy, sample_heads, fit_env_to_checkpoint, load_compat

        ck = torch.load(args.policy, map_location=args.device)
        policy = Policy(ck["obs_size"], ck["dims"], hidden=ck.get("hidden", 256)).to(args.device)
        load_compat(policy, ck["model"])
        policy.eval()
        assert ck["obs_size"] == env.obs_size, "checkpoint obs layout doesn't match this env build"
        if fit_env_to_checkpoint(env, ck):
            print("note: checkpoint pre-dates purchases — purchase columns disabled for this run")

    game_seed = torch.tensor([args.seed * 7_368_787 + i for i in range(B)], dtype=torch.int64)
    slots = torch.arange(env.sim.C, dtype=torch.int64).view(1, -1)
    pslots = torch.arange(P_MAX, dtype=torch.int64).view(1, -1)

    obs = env.observe()
    with torch.no_grad():
        for t in range(args.horizon):
            if args.policy == "scripted":
                env.step()  # all heads None → the engine's scripted fallback
                continue
            m = env.masks()
            if policy is None:  # random
                acts = {
                    "production": masked_choice(m["production"], game_seed.view(B, 1), slots, t, 11),
                    "tech": masked_choice(m["tech"], game_seed, t, 22),
                    "civic": masked_choice(m["civic"], game_seed, t, 33),
                    "units": masked_choice(m["units"], game_seed.view(B, 1), pslots, t, 44),
                    "envoy": masked_choice(m["envoy"], game_seed, t, 55),
                }
            else:
                pout = policy(obs, env.unit_features())
                acts, _, _ = sample_heads(pout, m, greedy=not args.sample)
            obs, _, _ = env.step(**acts)

    scores = env.sim.empire_score()
    mean = float(scores.mean())
    std = float(scores.std())
    ci = 1.96 * std / (B**0.5)
    print(f"{args.policy}: {mean:.1f} ± {ci:.1f} (95% CI)  [min {float(scores.min()):.1f}, max {float(scores.max()):.1f}]  over {B} episodes")


if __name__ == "__main__":
    main()
