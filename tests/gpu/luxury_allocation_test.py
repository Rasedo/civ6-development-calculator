"""THE LUXURY ALLOCATION — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/luxury_allocation_test.py

The TS twin is tests/cpu/city/luxury-allocation.test.ts.

The DLL (Player_Resources 0x4a6110) gives each luxury ONE pass: the first
`_lux_k` cities of a list stably sorted by need, re-sorted after every pass.
A Luxury Policy duplicate is a no-cap resource whose pass reaches `_lux_k`
per copy held and wraps round the list; the passes run widest first.
runs/h1_duelw1112 t83: China's five cities read 3, 5, 4, 5, 3.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import load_rules, fixture_paths
from warmup import warm_base, opened


def scene(rules, path, copies: list[int], policy: bool):
    """Row 0 with five live cities (ids 0..4) holding `copies[i]` of luxury i,
    Luxury Policy A on luxury 0 where `policy`."""
    sim = warm_base(str(path), lambda: opened(rules, path))
    B, L = sim.B, sim._n_lux
    held = torch.zeros(B, L, dtype=torch.long)
    for i, n in enumerate(copies):
        held[:, i] = n
    sim._lux_holdings = lambda row: (held.clone(), held.clone())
    real = sim._congress_by_id

    def congress(name):
        if name != "LUXURY_POLICY":
            return real(name)
        on = torch.full((B,), 0 if policy else -1, dtype=torch.long)
        return on, torch.zeros(B, dtype=torch.long)
    sim._congress_by_id = congress
    sim.city_alive[:, 0, :] = False
    sim.city_alive[:, 0, :5] = True
    sim.city_id[:, 0, :5] = torch.arange(5)
    return sim


def amen(sim, needs: list[int]) -> list[int]:
    cols = sim.RC
    have = torch.zeros(sim.B, cols, dtype=torch.float64)
    need = torch.zeros(sim.B, cols, dtype=torch.float64)
    need[:, :5] = torch.tensor(needs, dtype=torch.float64)
    return [int(x) for x in sim._luxury_amenities(0, have, need)[0, :5]]


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    needs = [1, 2, 2, 4, 1]

    sim = scene(rules, path, [2, 1, 1, 1], policy=True)
    got = amen(sim, needs)
    assert got == [3, 5, 4, 5, 3], got
    print("  1 a duplicate pass reaches four cities per copy and wraps; the rest serve the neediest")

    sim = scene(rules, path, [2, 1, 1, 1], policy=False)
    got = amen(sim, needs)
    assert got == [2, 4, 4, 4, 2], got
    print("  2 with no policy each luxury is one pass of four")
    print("luxury allocation OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
