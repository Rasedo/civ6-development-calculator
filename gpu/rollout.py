"""Off-script rollout generator: the GPU engine plays random masked actions.

    python gpu/rollout.py                 # 3 random games per fixture
    npx vite-node scripts/replay-gpu.ts   # the TS oracle must agree

This is the parity gate for the phase-3 action interface. A seeded
counter-based random policy drives the three action heads (per-city
production, research, civics) through the masks, logging every action it
takes plus the engine's per-turn trace. The replay script then feeds that
exact action log through the REAL TypeScript engine — same maps, same
sites — and compares every trace row. Scripted-trace parity can't catch
bugs that only off-script trajectories reach (eureka detection timing,
settler-cost sequencing, research banking, idling); this can.

Writes gpu/fixtures/rollout.json.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from civ6gpu import BatchSim, load_rules, load_fixture, FIXTURES
from civ6gpu.rng import masked_choice

HEAD_PROD, HEAD_TECH, HEAD_CIVIC, HEAD_UNIT, HEAD_ENVOY = 101, 202, 303, 404, 505


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--replicas", type=int, default=3, help="random games per fixture")
    ap.add_argument("--turns", type=int, default=100)
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--out", default=str(FIXTURES / "rollout.json"))
    args = ap.parse_args()

    rules_raw = json.loads((FIXTURES / "rules.json").read_text())
    rules = load_rules()
    paths = sorted(FIXTURES.glob("seed*.json"))
    if not paths:
        print("no fixtures — run `npm run gpu:export` first")
        raise SystemExit(1)
    fixtures = [load_fixture(p) for p in paths for _ in range(args.replicas)]

    sim = BatchSim(fixtures, rules, device="cpu", dtype=torch.float64)
    B, C = sim.B, sim.C
    game_seed = torch.tensor([args.seed * 1_000_003 + i for i in range(B)], dtype=torch.int64)
    slots = torch.arange(C, dtype=torch.int64).view(1, C)
    from civ6gpu.engine import P_MAX

    pslots = torch.arange(P_MAX, dtype=torch.int64).view(1, P_MAX)

    games = [
        {"seed": f["seed"], "rng": int(game_seed[i]), "sites": [c["site"] for c in f["cities"]], "actions": [], "trace": []}
        for i, f in enumerate(fixtures)
    ]

    HOLD = 12
    for _ in range(args.turns):
        turn = sim.turn
        pa = masked_choice(sim.production_mask(), game_seed.view(B, 1), slots, turn, HEAD_PROD)  # [B, C]
        ta = masked_choice(sim.tech_mask(), game_seed, turn, HEAD_TECH)  # [B]
        ca = masked_choice(sim.civic_mask(), game_seed, turn, HEAD_CIVIC)  # [B]
        # Attack-preferring random orders: units that CAN fight always do —
        # random pacifists would leave the kill/advance/camp-clear paths
        # (and the camp-list splice they exercise) untested.
        um = sim.unit_action_mask()
        has_attack = um[:, :, 6:12].any(dim=2, keepdim=True)
        um = um & ~(has_attack & (torch.arange(13).view(1, 1, 13) < 6))  # drop moves when a fight is on
        um[:, :, 12:13] = um[:, :, 12:13] & ~has_attack  # and don't hold back either
        ua = masked_choice(um, game_seed.view(B, 1), pslots, turn, HEAD_UNIT)  # [B, P]
        ea = masked_choice(sim.envoy_mask(), game_seed, turn, HEAD_ENVOY)  # [B]
        for b in range(B):
            entry: dict = {"t": turn}
            prods = [[c, int(pa[b, c])] for c in range(C) if pa[b, c] >= 0]
            if prods:
                entry["p"] = prods
            if ta[b] >= 0:
                entry["r"] = int(ta[b])
            if ca[b] >= 0:
                entry["c"] = int(ca[b])
            if ea[b] >= 0:
                entry["e"] = int(ea[b])
            orders = [[p, int(ua[b, p])] for p in range(P_MAX) if 0 <= ua[b, p] < HOLD]
            if orders:
                entry["u"] = orders
            if len(entry) > 1:
                games[b]["actions"].append(entry)
        sim.step(production=pa, tech=ta, civic=ca, units=ua, envoy=ea)
        rows = sim.trace_row()
        for b in range(B):
            games[b]["trace"].append([float(x) for x in rows[b]])

    out = {
        "width": sim.W,
        "height": sim.H,
        "unitsMode": int(fixtures[0].get("unitsMode", 0)),
        "csMax": int(fixtures[0].get("csMax", 0)),
        "rMax": int(fixtures[0].get("rMax", 0)),
        "unitIds": [u["id"] for u in rules_raw.get("units", [])],
        "buildings": [b["id"] for b in rules_raw["buildings"]],
        "techs": [t["id"] for t in rules_raw["techs"]],
        "civics": [c["id"] for c in rules_raw["civics"]],
        "games": games,
    }
    Path(args.out).write_text(json.dumps(out))
    score = sim.empire_score()
    cities = sim.alive.sum(dim=1)
    print(f"{B} random games × {args.turns} turns → {args.out}")
    print(
        f"final: score {score.min():.1f}/{score.mean():.1f}/{score.max():.1f} (min/mean/max), "
        f"cities {int(cities.min())}–{int(cities.max())}, settlers banked {int(sim.settlers.max())} max"
    )
    print("now verify with: npx vite-node scripts/replay-gpu.ts")


if __name__ == "__main__":
    main()
