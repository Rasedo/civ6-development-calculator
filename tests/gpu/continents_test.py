"""CONTINENTS — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/continents_test.py

The TS twin is tests/cpu/map/continents.test.ts.

CIV6 (Continents): every contiguous LANDMASS gets an id; water is -1. A
seat's HOME continent is its ORIGINAL capital's, which is what the install's
requirements read (REQUIREMENT_PLOT_IS_OWNER_CAPITAL_CONTINENT and its
city/unit siblings) — C-48.

The ids are NOT flood-filled here: the exporter derives them once and ships
them per tile, so this half's job is to prove the plane arrives intact and
that the predicates read it the way TS's do.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all

B0 = 0
ROOT = Path(__file__).resolve().parent.parent.parent


def build(path) -> BatchSim:
    return settle_all(BatchSim([load_fixture(path)], load_rules(),
                               device="cpu", dtype=torch.float64))


def test_the_plane_is_the_fixture(rules, path) -> None:
    """The exporter's ids arrive unchanged — the two engines must not each
    flood-fill their own, or a lake or an edge case renumbers one of them."""
    sim = build(path)
    fx = json.loads(Path(path).read_text(encoding="utf-8"))
    want = [int(t.get("cont", -1)) for t in fx["tiles"]]
    got = sim.tile_continent[B0].tolist()
    assert got == want, "the shipped continent ids did not survive the load"
    assert len(want) == sim.T
    print("  1 the plane OK —", sim.T, "tiles carried across intact")


def test_water_carries_none(rules, path) -> None:
    sim = build(path)
    wet = sim.water[B0] | sim.tile_submerged[B0]
    assert bool((sim.tile_continent[B0][wet] == -1).all()), "a water tile carries a continent"
    dry = ~wet
    assert bool((sim.tile_continent[B0][dry] >= 0).all()), "a land tile carries none"
    ids = sorted({int(x) for x in sim.tile_continent[B0].tolist() if x >= 0})
    assert ids == list(range(len(ids))), f"the ids are not a dense 0..n run: {ids}"
    assert len(ids) >= 2, (
        "this fixture has ONE landmass, so nothing here could tell an "
        "intercontinental route from a domestic one — pick another seed")
    print("  2 the ids OK —", len(ids), "landmasses, dense from 0, water at -1")


def test_home_is_the_original_capital(rules, path) -> None:
    sim = build(path)
    row = 1
    cap = int(sim.civ_cap_tile[B0, row])
    assert cap >= 0, "the row never founded, so this lane would prove nothing"
    home = int(sim._home_continent(row)[B0])
    assert home == int(sim.tile_continent[B0, cap]), "home is not the capital's continent"
    assert home >= 0

    # the plane answers per tile, and never for water
    tiles = torch.arange(sim.T).reshape(1, -1).expand(sim.B, -1)
    on = sim._on_home_continent(row, tiles)[B0]
    same = sim.tile_continent[B0] == home
    assert bool(torch.equal(on, same)), "the per-tile read disagrees with the id"
    wet = sim.water[B0] | sim.tile_submerged[B0]
    assert not bool(on[wet].any()), "water answered as the home continent"
    print("  3 the home OK — the ORIGINAL capital's landmass,", home)


def test_a_seat_with_no_capital_reads_minus_one(rules, path) -> None:
    """-1, so a clause keyed on the home continent never pays by accident."""
    sim = build(path)
    row = 1
    sim.civ_cap_tile[B0, row] = -1
    assert int(sim._home_continent(row)[B0]) == -1
    tiles = torch.arange(sim.T).reshape(1, -1).expand(sim.B, -1)
    assert not bool(sim._on_home_continent(row, tiles)[B0].any()), \
        "a seat with no capital claimed a continent"
    print("  4 the empty seat OK — no capital, no home, nothing pays")


def test_intercontinental_needs_two_known_ids(rules, path) -> None:
    sim = build(path)
    land = (~(sim.water[B0] | sim.tile_submerged[B0])).nonzero().flatten()
    cont = sim.tile_continent[B0]
    a = int(land[0])
    same = next(int(t) for t in land.tolist() if t != a and cont[t] == cont[a])
    other = next(int(t) for t in land.tolist() if cont[t] >= 0 and cont[t] != cont[a])
    sea = int((sim.water[B0]).nonzero().flatten()[0])

    def rc(x: int, y: int) -> bool:
        return bool(sim._route_intercontinental(
            torch.full((sim.B,), x, dtype=torch.long),
            torch.full((sim.B,), y, dtype=torch.long))[B0])

    assert rc(a, other), "two different landmasses did not read as intercontinental"
    assert not rc(a, same), "one landmass read as intercontinental"
    assert not rc(a, sea), "water made a route intercontinental"
    print("  5 the route OK — two KNOWN, different ids and nothing else")


def main() -> int:
    rules = load_rules()
    # a fixture with more than one landmass, or the lanes prove nothing
    for p in fixture_paths():
        fx = json.loads(Path(p).read_text(encoding="utf-8"))
        if len({int(t.get("cont", -1)) for t in fx["tiles"]} - {-1}) >= 2:
            path = p
            break
    else:
        raise AssertionError("no fixture carries two landmasses")
    test_the_plane_is_the_fixture(rules, path)
    test_water_carries_none(rules, path)
    test_home_is_the_original_capital(rules, path)
    test_a_seat_with_no_capital_reads_minus_one(rules, path)
    test_intercontinental_needs_two_known_ids(rules, path)
    print("BATTERY OK continents")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
