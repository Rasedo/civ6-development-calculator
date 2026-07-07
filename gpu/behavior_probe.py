"""Behavioral readout: what does a checkpoint DO differently?

    python gpu/behavior_probe.py gpu/runs/c3a-1/best.pt gpu/runs/c3a-4/best.pt

Runs each checkpoint greedily over the SAME worlds (matched scramble)
and reports end-state behavior stats side by side: cities, population,
techs/civics, districts, buildings, improvements, units trained, camps
cleared, war exposure. The interesting deltas are strategy, not score.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from civ6gpu import BatchEnv, load_rules, load_fixture, FIXTURES
from train_ppo import Policy, sample_heads, fit_env_to_checkpoint


def run(path: str, episodes: int, horizon: int, dev: str) -> dict:
    pool = [load_fixture(p) for p in sorted(FIXTURES.glob("seed*.json"))]
    fixtures = [pool[i % len(pool)] for i in range(episodes)]
    env = BatchEnv(fixtures, load_rules(), device=dev, dtype=torch.float32, horizon=horizon)
    ck = torch.load(path, map_location=dev)
    m0 = env.masks()
    dims = ck.get("dims") or {
        "C": m0["production"].shape[1], "AP": m0["production"].shape[2],
        "NT": m0["tech"].shape[1], "NC": m0["civic"].shape[1], "S": m0["envoy"].shape[1],
    }
    pol = Policy(env.obs_size, dims, hidden=ck.get("hidden", 256)).to(dev)
    pol.load_state_dict(ck["model"])
    pol.eval()
    fit_env_to_checkpoint(env, ck)
    obs = env.reset(scramble=1234)
    with torch.no_grad():
        for _ in range(horizon):
            out = pol(obs, env.unit_features())
            acts, _, _ = sample_heads(out, env.masks(), greedy=True)
            obs, _, _ = env.step(**acts)
    s = env.sim
    B = s.B
    stat = {
        "score": float(s.empire_score().mean()),
        "cities": float(s.alive.sum(dim=1).float().mean()),
        "pop": float(s.pop.sum(dim=1).float().mean()),
        "techs": float(s.techs.sum(dim=1).float().mean()),
        "civics": float(s.civics.sum(dim=1).float().mean()),
        "districts": float(((s.district >= 0) & (s.owner >= 0)).sum(dim=1).float().mean()),
        "bldgs": float(s.buildings.sum(dim=(1, 2)).float().mean()),
        "improvements": float(((s.improvement >= 0) & (s.owner >= 0)).sum(dim=1).float().mean()),
        "own units": float(s.p_alive.sum(dim=1).float().mean()),
        "treasury": float(s.treasury.mean()),
        "camps left": float(s.n_camps.float().mean()),
        "rival cities": float(s.rc_alive.sum(dim=(1, 2)).float().mean()),
        "wars seen": float(s.r_atwar.any(dim=1).float().mean()),
    }
    return stat


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("checkpoints", nargs="+")
    ap.add_argument("--episodes", type=int, default=24)
    ap.add_argument("--horizon", type=int, default=100)
    ap.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    args = ap.parse_args()
    rows = [(Path(c).parent.name, run(c, args.episodes, args.horizon, args.device)) for c in args.checkpoints]
    keys = list(rows[0][1].keys())
    header = f"{'':<14}" + "".join(f"{name:>12}" for name, _ in rows)
    print(header)
    for k in keys:
        print(f"{k:<14}" + "".join(f"{st[k]:>12.1f}" for _, st in rows))


if __name__ == "__main__":
    main()
