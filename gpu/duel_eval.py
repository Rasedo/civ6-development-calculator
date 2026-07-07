"""Head-to-head duel evaluation (the C3 eval protocol's core).

    python gpu/duel_eval.py --a gpu/runs/c3a-2/best.pt --b gpu/runs/c3a-1/best.pt

Plays checkpoint A (seat 0, the full surface) against checkpoint B
driving seat 1's economics through the C2 seat surface, over matched
worlds, and reports per-episode score margins and the win rate. `--b
scripted` leaves seat 1 to the scripted picker (controlled off) — the
baseline anchor. Reported both ways is the fair protocol (seat
asymmetry is real until the rival seat gets full verbs): swap --a/--b.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from civ6gpu import load_rules, load_fixture, FIXTURES
from civ6gpu.duel import DuelEnv
from train_ppo import Policy, sample_heads, fit_env_to_checkpoint


def load_policy(path: str, env, dev: str):
    ck = torch.load(path, map_location=dev)
    dims = ck.get("dims")
    if dims is None:
        m0 = env.masks(seat=0)
        dims = {
            "C": m0["production"].shape[1],
            "AP": m0["production"].shape[2],
            "NT": m0["tech"].shape[1],
            "NC": m0["civic"].shape[1],
            "S": m0["envoy"].shape[1],
        }
    hidden = ck.get("hidden", 256)
    pol = Policy(env.obs_size, dims, hidden=hidden).to(dev)
    pol.load_state_dict(ck["model"])
    pol.eval()
    return pol


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--a", required=True, help="checkpoint for seat 0")
    ap.add_argument("--b", required=True, help="checkpoint for seat 1, or 'scripted'")
    ap.add_argument("--episodes", type=int, default=24)
    ap.add_argument("--horizon", type=int, default=100)
    ap.add_argument("--seed", type=int, default=17)
    ap.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    args = ap.parse_args()
    dev = args.device

    pool = [load_fixture(p) for p in sorted(FIXTURES.glob("seed*.json"))]
    fixtures = [pool[i % len(pool)] for i in range(args.episodes)]
    duel = DuelEnv(fixtures, load_rules(), device=dev, dtype=torch.float32, horizon=args.horizon, reward="dense")
    env = duel.env

    pa = load_policy(args.a, env, dev)
    pb = None if args.b == "scripted" else load_policy(args.b, env, dev)

    duel.reset(scramble=args.seed)
    if pb is None:
        duel.sim.controlled[:, 0] = False  # scripted seat 1: the picker drives

    with torch.no_grad():
        for _ in range(args.horizon):
            m0 = env.masks(seat=0)
            out0 = pa(env.observe(seat=0), env.unit_features(seat=0))
            a0, _, _ = sample_heads(out0, m0, greedy=True)
            a1 = None
            if pb is not None:
                m1 = env.masks(seat=1)
                out1 = pb(env.observe(seat=1), env.unit_features(seat=1))
                s1, _, _ = sample_heads(out1, m1, greedy=True)
                a1 = {"production": s1["production"], "tech": s1["tech"], "civic": s1["civic"]}
            duel.step(seat0=a0, seat1=a1)

    s = duel.sim
    a_scores = s.empire_score()
    b_scores = s.rival_score(0)
    margin = a_scores - b_scores
    wins = (margin > 0).float().mean()
    print(
        f"A={args.a} vs B={args.b}: A {float(a_scores.mean()):.1f} | B {float(b_scores.mean()):.1f} | "
        f"margin {float(margin.mean()):+.1f} ± {float(margin.std() / max(len(margin), 1) ** 0.5 * 1.96):.1f} | "
        f"A wins {float(wins) * 100:.0f}% of {args.episodes}"
    )


if __name__ == "__main__":
    main()
