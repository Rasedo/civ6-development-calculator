"""A fallen city takes its garrison with it.

    python tests/gpu/city_falls_test.py

CIV 6: "when a city is captured, all units within it are destroyed". This
engine takes a city the moment its centre reaches 0 HP, and CITY-FIRST
targeting means the units standing on that centre were never attackable in
their own right — so they fall with it, and the centre carries a district so
none of the deaths leaves a dig.

The driven gate rarely parks a defender ON a centre that then falls, so the
lane builds the configuration.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))

from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all


def build():
    rules = load_rules()
    sim = settle_all(BatchSim([load_fixture(p) for p in fixture_paths()[:1]],
                              rules, device="cpu", dtype=torch.float64))
    for _ in range(12):
        sim.step()
    return sim


def place(sim, tile, seat, military=True):
    """Put `seat`'s unit on `tile` and return its merged slot."""
    slot = int(sim.unit_next[0])
    sim.major_unit_alive[0, slot] = True
    sim.major_unit_seat[0, slot] = seat
    sim.major_unit_type[0, slot] = 2 if military else 0  # WARRIOR / SETTLER
    sim.major_unit_tile[0, slot] = tile
    sim.major_unit_hp[0, slot] = 100
    if military:
        sim.military_at[0, tile] = slot + sim.POOL_LO["major"]
    else:
        sim.civilian_at[0, tile] = slot + sim.POOL_LO["major"]
    sim.unit_next[0] += 1
    return slot


def victim(sim):
    """A living city of row 1 and a free land tile beside its centre."""
    for col in range(sim.RC):
        if not bool(sim.city_alive[0, 1, col]):
            continue
        centre = int(sim.city_center[0, 1, col])
        for n in sim.neigh[centre].tolist():
            if n < 0 or not bool(sim.passable[0, n]):
                continue
            if int(sim.military_at[0, n]) >= 0 or int(sim.civilian_at[0, n]) >= 0:
                continue
            return col, centre, n
    raise AssertionError("no row-1 city with a free land neighbour")


def main() -> None:
    sim = build()
    assert sim.n_majors >= 2, "the capture is a PAIR fact — this fixture has one major"
    col, centre, from_tile = victim(sim)

    sim.war[0, 0, 1] = sim.war[0, 1, 0] = True
    sim.sync_war()
    garrison = place(sim, centre, seat=1)
    civilian = place(sim, centre, seat=1, military=False)
    attacker = place(sim, from_tile, seat=0)
    sim.city_hp[0, 1, col] = 1
    sim.city_outer_hp[0, 1, col] = 0
    dig_before = bool(sim.antiquity[0, centre])

    att = torch.zeros(sim.B, dtype=torch.bool)
    att[0] = True
    tgt = torch.full((sim.B,), centre, dtype=torch.long)
    sim._melee_city(att, tgt, "major", attacker)

    assert int(sim.tile_seat[0, centre]) == 0, "the city did not change hands — the scene is inert"
    assert not bool(sim.major_unit_alive[0, garrison]), "the garrison outlived the city it was holding"
    assert not bool(sim.major_unit_alive[0, civilian]), "a civilian outlived the city it was sheltering in"
    assert int(sim.military_at[0, centre]) < 0, "the dead garrison still holds the centre"
    assert int(sim.civilian_at[0, centre]) < 0, "the dead civilian still holds the centre"
    print("  both units on the fallen centre die, and the occupancy planes are clear")

    assert bool(sim.antiquity[0, centre]) == dig_before, \
        "a death on a centre left a dig — TS refuses one on any tile carrying a district"
    print("  no dig is stamped on the centre")

    # The captor never entered: this engine takes the city from the adjacent
    # tile it attacked from.
    assert bool(sim.major_unit_alive[0, attacker]), "the attacker died — the assertions above are about a corpse"
    assert int(sim.major_unit_tile[0, attacker]) == from_tile, "the captor moved into the city"
    print("  the captor stays on the tile it attacked from")

    print("CITY FALLS OK — the garrison dies with the centre it was holding")


if __name__ == "__main__":
    main()
