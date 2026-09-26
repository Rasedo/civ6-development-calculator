"""A CITY CENTRE'S STANDING STRENGTH — `_centre_strength`, `centreStrength`'s twin.

    python tests/gpu/centre_strength_test.py

One rule for every holder, the combat preview's DEFENSES lines: the holder's
base (its strongest melee fielded, floored at 15), `Districts.CityStrengthModifier`
over the complete, unpillaged districts, the walls tier, the Palace's +3, a
garrison's +10, and a city-state's +1 per envoy. Each scene asserts the number
the TS twin (tests/cpu/units/city-combat.test.ts, "a city centre's standing
strength") asserts for the same scene.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))

from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all

B0 = 0


def build():
    rules = load_rules()
    return settle_all(BatchSim([load_fixture(fixture_paths()[0])], rules,
                               device="cpu", dtype=torch.float64))


def strength(sim, row: int, col: int, garrisoned: bool = True) -> int:
    r = torch.full((sim.B,), row, dtype=torch.long)
    c = torch.full((sim.B,), col, dtype=torch.long)
    return int(sim._centre_strength(r, c, garrisoned)[B0])


def clear(sim, tile: int) -> None:
    """Take every unit off `tile`."""
    for plane in ("military_at", "civilian_at", "support_at"):
        occ = int(getattr(sim, plane)[B0, tile])
        if occ >= 0:
            sim.unit_alive[B0, occ] = False
            getattr(sim, plane)[B0, tile] = -1


def didx(sim, name: str) -> int:
    return next(i for i, d in enumerate(sim.districts_cat) if d["id"] == name)


def own_tiles(sim, row: int, col: int, k: int) -> list[int]:
    """k land plots of the city, off its centre, with no district on them."""
    ctr = int(sim.city_center[B0, row, col])
    mine = ((sim.tile_seat[B0] == int(sim._ROW_SEAT[row]))
            & (sim.tile_city[B0] == sim.city_id[B0, row, col])
            & (sim.district[B0] < 0) & ~sim.water[B0])
    mine[ctr] = False
    out = mine.nonzero(as_tuple=True)[0].tolist()[:k]
    assert len(out) == k, "the city holds too few free plots"
    return out


def lay(sim, tile: int, name: str) -> None:
    sim.district[B0, tile] = didx(sim, name)
    sim.district_complete[B0, tile] = True
    sim.district_pillaged[B0, tile] = False


def a_capital(sim) -> tuple[int, int]:
    for r in range(sim.n_majors):
        for j in range(sim.RC):
            if bool(sim.city_alive[B0, r, j]) and bool(sim.city_is_cap[B0, r, j]):
                return r, j
    raise AssertionError("no capital")


def test_base_and_palace(sim) -> None:
    r, j = a_capital(sim)
    clear(sim, int(sim.city_center[B0, r, j]))
    sim.civ_best_melee[B0, r] = 0
    assert int(sim._palace_city_cs) == 3
    assert strength(sim, r, j) == 15 + 3, strength(sim, r, j)
    sim.city_is_cap[B0, r, j] = False
    assert strength(sim, r, j) == 15, strength(sim, r, j)
    sim.city_is_cap[B0, r, j] = True
    print("  1 the base and the Palace OK — 15 floored, +3 in the capital")


def test_districts(sim) -> None:
    r, j = a_capital(sim)
    sim.city_is_cap[B0, r, j] = False
    clear(sim, int(sim.city_center[B0, r, j]))
    sim.civ_best_melee[B0, r] = 0
    a, b = own_tiles(sim, r, j, 2)
    lay(sim, a, "CAMPUS")
    lay(sim, b, "AQUEDUCT")
    assert strength(sim, r, j) == 15 + 2, "a Campus and an Aqueduct add 2, not 4"
    lay(sim, b, "COMMERCIAL_HUB")
    assert strength(sim, r, j) == 15 + 4
    sim.district_pillaged[B0, a] = True
    assert strength(sim, r, j) == 15 + 2, "a pillaged district added strength"
    sim.district_complete[B0, b] = False
    assert strength(sim, r, j) == 15, "an unfinished district added strength"
    for t in (a, b):
        sim.district[B0, t] = -1
        sim.district_complete[B0, t] = False
        sim.district_pillaged[B0, t] = False
    sim.city_is_cap[B0, r, j] = True
    print("  2 the districts OK — 2 each, none for the Aqueduct, none pillaged or unfinished")


def test_garrison(sim) -> None:
    r, j = a_capital(sim)
    sim.city_is_cap[B0, r, j] = False
    ctr = int(sim.city_center[B0, r, j])
    clear(sim, ctr)
    one = torch.ones(sim.B, dtype=torch.bool)
    sim._spawn_unit(r, one, torch.full((sim.B,), ctr, dtype=torch.long),
                    torch.full((sim.B,), sim._warrior_idx, dtype=torch.long))
    assert int(sim.military_at[B0, ctr]) >= 0, "the garrison did not take the centre"
    sim.civ_best_melee[B0, r] = 35
    assert int(sim._garrison_city_cs) == 10
    assert strength(sim, r, j) == 35 + 10, strength(sim, r, j)
    assert strength(sim, r, j, garrisoned=False) == 35, "the Encampment's read kept the garrison"
    sim.city_is_cap[B0, r, j] = True
    print("  3 the garrison OK — +10, and none on the Encampment's read")


def test_minor(sim) -> None:
    assert sim.S > 0 and sim.n_majors > 1
    s = next(s for s in range(sim.S) if bool(sim.citystate_alive[B0, s]))
    row = sim._CITY_MINOR0 + s
    ctr = int(sim.citystate_center[B0, s])
    clear(sim, ctr)
    sim.citystate_best_melee[B0, s] = 0
    sim.seat_citystate_envoys[B0, :, s] = 0
    sim.seat_citystate_envoys[B0, 0, s] = 2
    sim.seat_citystate_envoys[B0, 1, s] = 1
    assert strength(sim, row, 0) == 15 + 3 + 3, strength(sim, row, 0)
    # the strongest melee it fields, not its population or its type
    ring2 = ((sim.pair_dist[ctr] == 2) & ~sim.water[B0] & (sim.military_at[B0] < 0)
             & (sim.civilian_at[B0] < 0) & sim.passable[B0])
    at = int(ring2.long().argmax())
    assert bool(ring2[at]), "no free plot two from the minor's centre"
    one = torch.ones(sim.B, dtype=torch.bool)
    sim._spawn_unit(row, one, torch.full((sim.B,), at, dtype=torch.long),
                    torch.full((sim.B,), sim._warrior_idx, dtype=torch.long))
    assert int(sim.citystate_best_melee[B0, s]) == 20, "the minor's tracker missed its Warrior"
    assert strength(sim, row, 0) == 20 + 3 + 3, strength(sim, row, 0)
    print("  4 the city-state OK — its best melee, the Palace, +1 per envoy from every major")


def test_seeded_tracker() -> None:
    """The minors' starting Warriors seed the tracker as TS's `loadWorld`
    spawns count them."""
    sim = build()
    for s in range(sim.S):
        if bool(sim.citystate_alive[B0, s]):
            assert int(sim.citystate_best_melee[B0, s]) == 20, int(sim.citystate_best_melee[B0, s])
    print("  5 the seeded tracker OK — every minor starts at its Warriors' 20")


def main() -> None:
    sim = build()
    test_base_and_palace(sim)
    test_districts(sim)
    test_garrison(sim)
    test_minor(sim)
    test_seeded_tracker()
    print("centre_strength_test OK")


if __name__ == "__main__":
    main()
