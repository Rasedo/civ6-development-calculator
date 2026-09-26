"""THE FREE CITY'S AMENITIES — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/free_city_amenity_test.py

The TS twin is tests/cpu/city/free-city-amenities.test.ts.

CIV6 (measured, a pop-9 Free City watched ten turns): the Free City keeps the
full need of its population — 5 at pop 9, `GetAmenitiesNeeded` as for any
city — and only the supply the Free Cities seat itself holds, which sat it at
UNREST or UNHAPPY. The need is ceil(pop / CITY_POP_PER_AMENITY); the ladder is
the seven `Happinesses` rows. The Free Cities phase records the tier off the
ordinary composer (`_seat_amenity`) over the free row.
  1. the wire: CITY_POP_PER_AMENITY, the seven tiers, one loyalty per tier
  2. an ordinary pop-9 city and the same city Free: the same need; the
     owner's luxury serves only the owner's city; the Free City's own luxury
     serves it
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import load_rules, fixture_paths
from core.simbase import FREE_SEAT
from free_city_test import fresh, free_slot, B0, RULES

UNHAPPY, UNREST = 4, 5


def test_wire(rules, path) -> None:
    sim = fresh(rules, path)
    assert sim.rules.amenity_pop_per == 2, "CITY_POP_PER_AMENITY is 2"
    tiers = sim.rules.amenity_tiers
    assert len(tiers) == 7, f"the Happinesses table has seven rows, the wire {len(tiers)}"
    assert [t[0] for t in tiers[3:]] == [-2, -4, -6, -999], "Displeased -1..-2, Unhappy -3..-4, Unrest -5..-6, Revolt"
    assert tiers[UNREST][1:] == (0, 0.7) and tiers[6][1:] == (0, 0.6), "Unrest -100%/-30%, Revolt -100%/-40%"
    assert [float(x) for x in sim._loyalty_amenity] == [6, 3, 0, -3, -6, -6, -6]
    print("  1 the wire OK — need per 2 citizens, seven tiers, seven loyalty rows")


def _lux_on(sim, tile: int, lux: int, imp: int) -> None:
    sim.lux_id[B0, tile] = lux
    sim.lux_req[B0, tile] = imp
    sim.improvement[B0, tile] = imp
    sim._eff_version += 1
    sim._gen_ver += 1


def test_need_and_supply(rules, path) -> None:
    sim = fresh(rules, path)
    # solvent seats: bankruptcy's amenity loss is its own lane
    sim.civ_treasury[B0, 0] = 50.0
    imp = RULES["improvements"]["ids"].index("PLANTATION")
    for t in range(sim.T):  # a clean slate: no luxury anywhere
        if int(sim.lux_id[B0, t]) >= 0:
            sim.lux_id[B0, t] = -1
    # the owner's luxury, on its capital's own ground
    cap = int(sim.civ_cap_tile[B0, 0])
    own = [t for t in range(sim.T) if int(sim.tile_seat[B0, t]) == 0 and t != cap
           and int(sim.district[B0, t]) < 0 and int(sim.pair_dist[cap, t]) == 1]
    assert own, "the capital owns no ring tile"
    _lux_on(sim, own[0], 0, imp)
    # THE ORDINARY CITY: a pop-9 second city of seat 0, served by the owner's luxury
    from warmup import plant_city
    plant_city(sim, 0)
    col = int(sim.city_alive[B0, 0].nonzero()[-1])
    centre = int(sim.city_center[B0, 0, col])
    sim.city_pop[B0, 0, col] = 9
    ordinary = int(sim._seat_amenity(0)[0][B0, col])
    assert ordinary == UNHAPPY, f"pop 9 needs 5 and the owner's luxury pays 1 (-4): tier {ordinary}"
    # ...and the same city FREE: the owner's luxury stayed with the owner
    flip = torch.zeros(sim.B, sim.RC, dtype=torch.bool)
    flip[B0, col] = True
    sim._seat_loyalty_flips(0, flip)
    fc = free_slot(sim, centre)
    F = sim.FREE_ROW
    assert int(sim.city_pop[B0, F, fc]) == 9
    assert int(sim.city_amen_tier[B0, F, fc]) == -1, "no walk has read the Free City yet"
    sim.free_treasury[B0] = 50.0
    sim._free_cities_phase()
    assert bool(sim.city_alive[B0, F, fc]), "the Free City joined somebody"
    got = int(sim.city_amen_tier[B0, F, fc])
    assert got == UNREST, f"the Free City has nothing against 5 (-5), UNREST as measured: tier {got}"
    # its OWN luxury, inside its own border, is the Free Cities seat's and pays
    mine = [t for t in range(sim.T) if int(sim.tile_seat[B0, t]) == FREE_SEAT and t != centre
            and int(sim.district[B0, t]) < 0]
    assert mine, "the Free City owns no ground beyond its centre"
    _lux_on(sim, mine[0], 1, imp)
    sim.free_treasury[B0] = 50.0
    sim._free_cities_phase()
    got = int(sim.city_amen_tier[B0, F, fc])
    assert got == UNHAPPY, f"its own luxury pays 1 against 5 (-4), UNHAPPY: tier {got}"
    print("  2 need and supply OK — 5 at pop 9 either way; Unhappy with the owner's luxury, "
          "Unrest Free, Unhappy on its own")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_wire(rules, path)
    test_need_and_supply(rules, path)
    print("BATTERY OK free_city_amenity")
    return 0


if __name__ == "__main__":
    sys.exit(main())
