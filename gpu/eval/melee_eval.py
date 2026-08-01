"""C3c kingmaking telemetry: per-seat outcome distributions in O=4 FFA.

    python gpu/melee_eval.py --policy gpu/runs/ffa-2/best.pt --episodes 24

One checkpoint drives every seat (greedy) over the fixtures_o4 pool.
Reported per seat: mean score, win rate (top score), last-place rate,
and the kingmaking signal — the correlation between a seat's own score
and the WINNER's margin (a seat that loses while deciding who wins
shows low score with high influence; the honest first-order proxy is
the per-seat spread between its win rate and its score share).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from civ6gpu import load_rules, load_fixture
from civ6gpu.melee import MeleeEnv
from train_ppo import Policy, sample_heads, load_compat

O4 = Path(__file__).resolve().parent.parent / "fixtures_o4"  # #51/S8.5


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--policy", required=True)
    ap.add_argument("--episodes", type=int, default=24)
    ap.add_argument("--horizon", type=int, default=None, help="default: the fixtures' turnLimit (TS TURN_LIMIT)")
    ap.add_argument("--device", default="cpu")
    args = ap.parse_args()

    rules = load_rules(O4 / "rules.json")
    if args.horizon is None:  # single knob: the game's own length
        args.horizon = rules.turn_limit
    pool = [load_fixture(p) for p in sorted(O4.glob("seed*.json"))]
    fixtures = [pool[i % len(pool)] for i in range(args.episodes)]
    env = MeleeEnv(fixtures, rules, device=args.device, dtype=torch.float32, horizon=args.horizon, reward="dense", seats=4)
    env.reset()

    ck = torch.load(args.policy, map_location=args.device)
    m0 = env.masks()[0]
    dims = ck.get("dims") or {
        "C": m0["production"].shape[1], "AP": m0["production"].shape[2],
        "NT": m0["tech"].shape[1], "NC": m0["civic"].shape[1],
        "S": m0["envoy"].shape[1], "W": m0.get("war", torch.zeros(1, 0)).shape[1],
    }
    net = Policy(env.obs_size, dims, hidden=ck.get("hidden", 256)).to(args.device)
    load_compat(net, ck["model"])
    net.eval()

    obs = env.observe_all()
    with torch.no_grad():
        for _ in range(args.horizon):
            masks = env.masks()
            ufeat = env.unit_features_all()
            acts = []
            for k in range(4):
                out = net(obs[:, k], ufeat[:, k])
                a, _, _ = sample_heads(out, masks[k], greedy=True)
                acts.append(a)
            obs, _, _ = env.step(acts)

    scores = env._scores()  # [B, 4]
    win = (scores == scores.max(dim=1, keepdim=True).values).float()
    last = (scores == scores.min(dim=1, keepdim=True).values).float()
    share = scores / scores.sum(dim=1, keepdim=True)
    print(f"{'seat':<6}{'mean':>8}{'win%':>8}{'last%':>8}{'share':>8}")
    for k in range(4):
        print(f"{k:<6}{float(scores[:, k].mean()):>8.1f}{float(win[:, k].mean() * 100):>8.1f}{float(last[:, k].mean() * 100):>8.1f}{float(share[:, k].mean()):>8.3f}")
    spread = float(scores.mean(dim=0).max() - scores.mean(dim=0).min())
    print(f"seat spread (structural asymmetry): {spread:.1f}")


if __name__ == "__main__":
    main()
