"""Tile-food ORDER self-test — where the seat's farm-adjacency tier lands.

`tileYields` adds the farm-adjacency bonus INSIDE the improvement block, so
fertility and the drought floor come after it. The GPU splits that column in
two because the tier is per SEAT (its own civics/techs) while everything
under it is shared: `_food_base` is the pre-tail plane every row sees, and
`_rcy_food_plane` puts the row's tier on top of THAT and takes `_food_tail`
again. Adding the tier to `_eff_food` instead would put the floor on the
wrong side.

No terrain in the catalog is poor enough for the floor to bite a farmed tile
(a FARM's own food is 1), so the regime here is reached by POKING the tile's
food to zero. That is the point: the order is unobservable in a driven game
today and this is the only instrument that would catch it being inverted.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, FIXTURES


def main() -> None:
    rules = load_rules()
    paths = sorted(FIXTURES.glob("seed*.json"))
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    sim = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)
    assert sim.improvements_on, "improvements must be on or the farm-adjacency term never fires"
    assert sim.FARM >= 0, "no FARM in the improvement roster"
    assert sim._farmadj_civic >= 0 or sim._farmadj_tech >= 0, \
        "no farm-adjacency unlock in the catalog — this lane would prove nothing"

    # an interior LAND tile with at least two neighbours to farm
    t = n1 = n2 = -1
    for cand in range(sim.T):
        nb = [int(x) for x in sim.neigh[cand].tolist() if int(x) >= 0]
        if len(nb) >= 2 and not bool(sim.nwonder[0, cand]) and not bool(sim.water[0, cand]):
            t, n1, n2 = cand, nb[0], nb[1]
            break
    assert t >= 0, "no interior land tile in the fixture"

    row = 0
    if sim._farmadj_civic >= 0:
        sim.civ_civics[0, row, sim._farmadj_civic] = True
    else:
        sim.civ_techs[0, row, sim._farmadj_tech] = True
    tier = int(sim._farmadj_tier(sim._seat_civics(row), sim._seat_techs(row))[0])
    assert tier >= 1, f"the farm-adjacency tier should be at least 1 once unlocked, got {tier}"

    for x in (t, n1, n2):
        sim.improvement[0, x] = sim.FARM
        sim.pillaged[0, x] = False
    # Zero the tile's food AFTER the FARM's own +1 — the only regime in which
    # the drought floor can reach a farmed tile.
    sim.tile_yields[0, t, 0] = -sim._farm_food
    sim.fertility[0, t] = 0
    sim.drought[0, t] = 1
    sim._eff_version += 1

    base = float(sim._food_base()[0, t])
    assert abs(base) < 1e-12, f"the poke should leave 0 base food, got {base}"
    floored = float(sim._eff_food()[0, t])
    assert abs(floored) < 1e-12, "the drought floor must clamp 0 - 1 to 0"

    want = max(0.0, float(tier) - 1.0)  # tileYields: (0 + tier) then the floor
    got = float(sim._rcy_food_plane(row, sim._rcy_globals())[0, t])
    assert abs(got - want) < 1e-12, \
        f"the tier belongs BEFORE the drought floor: expected {want}, got {got}"
    assert abs(got - (floored + tier)) > 1e-12, \
        "the lane is vacuous here — adding the tier after the floor gives the same answer"

    # ...and with no drought the floor is not involved: the tier lands whole.
    sim.drought[0, t] = 0
    sim._eff_version += 1
    dry = float(sim._rcy_food_plane(row, sim._rcy_globals())[0, t])
    assert abs(dry - float(tier)) < 1e-12, f"without drought the tier lands whole: expected {tier}, got {dry}"

    # A seat WITHOUT the unlock reads the shared plane, floor and all.
    other = 1 if sim.n_majors >= 2 else 0
    if other != row:
        assert int(sim._farmadj_tier(sim._seat_civics(other), sim._seat_techs(other))[0]) == 0, \
            "the second row must not have the unlock, or the control below proves nothing"
        sim.drought[0, t] = 1
        sim._eff_version += 1
        assert abs(float(sim._rcy_food_plane(other, sim._rcy_globals())[0, t])) < 1e-12, \
            "a seat with no farm-adjacency tier reads _eff_food unchanged"

    print("food_order_test OK — the farm-adjacency tier lands before the fertility/drought tail, "
          "and a seat without the unlock reads the shared plane")


if __name__ == "__main__":
    main()
