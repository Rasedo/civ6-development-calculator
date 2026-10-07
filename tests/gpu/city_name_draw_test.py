"""A CITY'S NAME DRAW — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/city_name_draw_test.py

The TS twin is tests/cpu/seats/city-name-draw.test.ts.

"Choosing a City Name" (GameCore_XP2 0x327c30 -> 0x328de0): a major's city
past its capital takes ONE draw over 55 (the first 10 unused names weighted
10 .. 1); the capital takes its leader's CapitalName with no draw.
"Choosing a Citizen Name" (0x486c20): a major's Spy at its birth and a storm
named for a major (0x28d4f0: the plot's major, else the nearest city's) take
ONE draw over the civilization's citizen names left.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import load_rules, fixture_paths
from warmup import warm_base, opened

B0 = 0
ROOT = Path(__file__).resolve().parent.parent.parent
RULES = json.loads((ROOT / "seeder" / "worlds" / "rules.json").read_text())


def lcg(s: int) -> int:
    return (1103515245 * s + 12345) & 0xFFFFFFFF


def _site(sim):
    """a land plot at least 4 from every centre, nobody's"""
    for t in range(sim.T):
        if bool(sim.water[B0, t]) or not bool(sim.passable[B0, t]) or not bool(sim.settle_ok[B0, t]):
            continue
        if int(sim.tile_seat[B0, t]) >= 0 or int(sim.district[B0, t]) >= 0 or int(sim.built_wonder[B0, t]) >= 0:
            continue
        far = True
        for r in range(sim.n_majors):
            for c in sim.city_center[B0, r][sim.city_alive[B0, r]].tolist():
                far &= int(sim.pair_dist[t, c]) >= 4
        for c in sim.citystate_center[B0][sim.citystate_alive[B0]].tolist():
            far &= int(sim.pair_dist[t, c]) >= 4
        if far:
            return t
    raise AssertionError("no free site")


def test_name_draw(path) -> None:
    sim = warm_base(str(path), lambda: opened(load_rules(), path), ())
    assert int(sim.rules.seats["cityNameDraw"]) == 55
    row = 0
    assert bool(sim.city_alive[B0, row].any()), "the row holds no capital"
    t = _site(sim)
    s0 = int(sim.rng_state[B0])
    made = sim._found_city_at(row, torch.tensor([True]), torch.tensor([t]))
    assert bool(made[B0]), "the founding did not land"
    assert int(sim.rng_state[B0]) == lcg(s0), "a city past the capital takes exactly one draw"
    print("  1 name draw OK — one draw over 55 for a city past the capital")


def test_citizen_names(path) -> None:
    sim = warm_base(str(path), lambda: opened(load_rules(), path), ())
    row = 0
    assert int(sim.row_civ[B0, row]) >= 0, "the row plays no civilization"
    pool = sim._citizen_name_rows[int(sim.row_civ[B0, row])]
    assert pool >= 40
    ctr = int(sim.city_center[B0, row][sim.city_alive[B0, row]].tolist()[0])
    s0 = int(sim.rng_state[B0])
    got = sim._spawn_unit(row, torch.tensor([True]), torch.tensor([ctr]), torch.tensor([sim._spy_idx]))
    assert bool(got[B0]), "the Spy did not land"
    assert int(sim.rng_state[B0]) == lcg(s0), "a Spy's birth takes one name draw"
    assert int(sim.civ_citizen_names[B0, row]) == 1
    # a storm is named for the plot's major, else the major nearest it
    assert int(sim._storm_namer(torch.tensor([ctr]))[B0]) == row
    print("  2 citizen names OK — a Spy's name draw, the storm's namer")


def main() -> int:
    path = fixture_paths()[0]
    test_name_draw(path)
    test_citizen_names(path)
    print("BATTERY OK city_name_draw")
    return 0


if __name__ == "__main__":
    sys.exit(main())
