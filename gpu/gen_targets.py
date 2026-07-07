"""M3d slice 1 — search-derived training targets.

    python gpu/gen_targets.py --episodes 8 --every 5 --horizon 100 \
        --out gpu/targets/m3d-1.pt

Plays scripted-policy episodes and, every K turns, runs the M1 search
(`plan_production`, depth 1) for the capital's production choice,
recording (obs, unit features, production mask, the search's pick, the
search's root value) — the states where lookahead disagrees with myopia
are exactly the ones worth distilling. Output: a dict of stacked
tensors consumed by train_ppo --distill.

This is the minimal, proven-surface variant (capital production via the
M1 machinery); widening to the full 5-head gumbelsearch tuples over
net-driven states is the follow-up once distillation shows signal.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from civ6gpu import BatchEnv, load_rules, load_fixture, FIXTURES
from civ6gpu.mcts import plan_production


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--episodes", type=int, default=8)
    ap.add_argument("--per-episode", type=int, default=12, help="max searched decisions per episode")
    ap.add_argument("--horizon", type=int, default=100)
    ap.add_argument("--search-horizon", type=int, default=20)
    ap.add_argument("--out", default="gpu/targets/m3d-1.pt")
    args = ap.parse_args()

    rules = load_rules()
    pool = sorted(FIXTURES.glob("seed*.json"))
    rows: list[dict] = []
    for ep in range(args.episodes):
        env = BatchEnv([load_fixture(pool[ep % len(pool)])], rules, device="cpu", dtype=torch.float64, horizon=args.horizon)
        env.reset(scramble=999 + ep)
        taken = 0
        for t in range(args.horizon):
            if t >= 15 and taken < args.per_episode:
                m = env.masks()
                if int(m["production"][0, 0].sum()) >= 2:  # the capital faces a real choice
                    taken += 1
                    best, val = plan_production(env.sim, 0, horizon=args.search_horizon, depth=1)
                    rows.append(
                        {
                            "obs": env.observe()[0].float(),
                            "ufeat": env.unit_features()[0].float(),
                            "m_production": m["production"][0],
                            "a_production": torch.tensor(best, dtype=torch.long),
                            "value": torch.tensor(float(val[best]), dtype=torch.float32),
                        }
                    )
            env.step()  # scripted continuation
        print(f"episode {ep + 1}/{args.episodes}: {len(rows)} targets so far")

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    stacked = {k: torch.stack([r[k] for r in rows]) for k in rows[0]}
    torch.save(stacked, out)
    print(f"saved {len(rows)} search targets -> {out}")


if __name__ == "__main__":
    main()
