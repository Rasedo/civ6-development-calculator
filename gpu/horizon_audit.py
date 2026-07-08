"""G-V slice (i): the horizon-300 robustness audit.

Runs the SCRIPTED autopilot (sim.step() with no actions — the deterministic
baseline) out to 300 turns on the fixture pool and reports, at checkpoints,
what EXHAUSTS: the objective flattens (score delta -> 0), the trees deplete
(no tech/civic left to pick), production runs dry (only settler/idle left),
gold banks unspent. The point is to find the cliffs BEFORE building G-V, not
to fix anything here.

    python gpu/horizon_audit.py --turns 300 --seeds 12
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import civ6gpu.engine as _eng
from civ6gpu import BatchSim, load_rules, load_fixture, FIXTURES


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--turns", type=int, default=300)
    ap.add_argument("--seeds", type=int, default=12)
    ap.add_argument("--every", type=int, default=50)
    ap.add_argument("--pool", type=int, default=640, help="AUDIT ONLY: bump the append-only unit pools past their 96 cap so the run survives to --turns (the cap itself is G-S cliff #1)")
    args = ap.parse_args()

    _eng.U_MAX = args.pool  # sized at construction; the committed cap stays 96
    _eng.P_MAX = args.pool

    rules = load_rules()
    pool = [load_fixture(p) for p in sorted(FIXTURES.glob("seed*.json"))[: args.seeds]]
    sim = BatchSim(pool, rules, device="cpu", dtype=torch.float64)
    B = sim.B
    NT = int(sim.techs.shape[1])
    NC = int(sim.civics.shape[1])
    print(f"B={B}  tech tree={NT}  civic tree={NC}  horizon={args.turns}\n")

    hdr = f"{'turn':>5}{'score':>9}{'d/turn':>8}{'techs':>7}{'tAvail':>7}{'civics':>8}{'cAvail':>7}{'pop':>7}{'cities':>7}{'rCity':>7}{'barbs':>7}{'camps':>7}{'gold':>8}{'dry':>7}"
    print(hdr)
    prev_score = float(sim.empire_score().mean())
    prev_turn = 0

    def snap(t: int) -> None:
        nonlocal prev_score, prev_turn
        score = float(sim.empire_score().mean())
        dt = (score - prev_score) / max(t - prev_turn, 1)
        # tree depletion: pickable = not-done AND prereqs met (ignore busy flag)
        t_avail = sim._available_mask(sim.techs, sim._prereq_t).sum(dim=1).float().mean()
        c_avail = sim._available_mask(sim.civics, sim._prereq_c).sum(dim=1).float().mean()
        # production dry: a living city whose ONLY options are settler+idle
        pm = sim.production_mask()  # [B, C, W]
        NBn = sim.NB
        # columns that are "real builds": buildings 0..NB-1 + units NB+2..
        real = pm.clone()
        real[:, :, NBn] = False  # settler
        real[:, :, NBn + 1] = False  # idle
        dry = (sim.alive & ~real.any(dim=2)).sum(dim=1).float().mean()
        gold = float(sim.treasury.mean())
        techs = sim.techs.sum(dim=1).float().mean()
        civics = sim.civics.sum(dim=1).float().mean()
        pop = sim.pop.sum(dim=1).float().mean()
        cities = sim.alive.sum(dim=1).float().mean()
        rcities = sim.rc_alive.sum(dim=(1, 2)).float().mean()
        barbs = sim.u_alive.sum(dim=1).float().mean()
        camps = sim.n_camps.float().mean() if hasattr(sim, "n_camps") else torch.tensor(0.0)
        print(f"{t:>5}{score:>9.1f}{dt:>8.2f}{techs:>7.1f}{t_avail:>7.1f}{civics:>8.1f}{c_avail:>7.1f}{pop:>7.1f}{cities:>7.1f}{rcities:>7.1f}{float(barbs):>7.1f}{float(camps):>7.1f}{gold:>8.0f}{dry:>7.1f}")
        prev_score, prev_turn = score, t

    for t in range(1, args.turns + 1):
        sim.step()
        if t % args.every == 0:
            snap(t)


if __name__ == "__main__":
    main()
