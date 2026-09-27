"""THE TURN'S ORDER — the GPU half of `tests/cpu/turn-order.test.ts`
(tools/civ6lab/turn_order_civ6.md): a seat's economy before its cities, so a
shortfall's amenity penalty reaches the same turn's cities; one heal of every
city at the turn's end, a city-state's centre +20 like the rest.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/turn_order_test.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import load_rules, fixture_paths
from warmup import opened

B0 = 0


def test_shortfall_same_turn(rules, path) -> None:
    sim = opened(rules, path)
    row = 0
    assert bool(sim.city_alive[B0, row].any()), "the seat needs a city"
    # the balance stays below 0 after the turn's gold: the shortfall lands in
    # the economy, before the walk reads the cities
    sim.civ_treasury[B0, row] = -50.0
    sim._seat_turn(row)
    assert int(sim.seat_shortfall[B0, row]) != 0, "no shortfall"
    live = sim.city_alive[B0, row]
    now = sim._seat_amenity(row)[0][B0]
    assert torch.equal(sim.city_amen_tier[B0, row, : sim.RC][live].long(), now[live].long()), \
        "the walk did not read the shortfall its own turn made"
    print("  1 economy OK — the shortfall's amenity penalty reaches the same turn's cities")


def test_city_state_heal(rules, path) -> None:
    sim = opened(rules, path)
    if not sim.S or not bool(sim.citystate_alive[B0, 0]):
        print("  2 city-state heal SKIPPED — no minor on this fixture")
        return
    cmax = int(rules.citystate["maxHp"])
    sim.citystate_hp[B0, 0] = 100
    sim._heal_cities()
    assert int(sim.citystate_hp[B0, 0]) == 120, f"a city-state healed {int(sim.citystate_hp[B0, 0]) - 100}"
    sim.citystate_hp[B0, 0] = cmax - 5
    sim._heal_cities()
    assert int(sim.citystate_hp[B0, 0]) == cmax, "the heal overshot the pool"
    print("  2 city-state heal OK — +20, the pool its cap")


def main() -> int:
    rules = load_rules()
    paths = fixture_paths()
    if not paths:
        print("no fixtures — run `npm run seed && npm run export` first")
        return 1
    test_shortfall_same_turn(rules, paths[0])
    test_city_state_heal(rules, paths[0])
    print("BATTERY OK turn_order")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
