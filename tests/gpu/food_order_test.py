"""Tile-food ORDER self-test — where the seat's Farm adjacency food lands.

`tileYields` adds the Farm adjacency food INSIDE the improvement block, so
fertility and the drought floor come after it. The GPU splits that column in
two because the row is per SEAT (its own civics/techs) while everything
under it is shared: `_food_base` is the pre-tail plane every row sees, and
`_rcy_food_plane` puts the row's adjacency food on top of THAT and takes
`_food_tail` again. Adding it to `_eff_food` instead would put the floor on
the wrong side.

CIV6 (Farms_MedievalAdjacency, Farms_MechanizedAdjacency): +1 Food per 2
adjacent Farms from Feudalism, per 1 from Replaceable Parts, which obsoletes
the first. Both rates are proven here on the same two neighbours.

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
from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all


def main() -> None:
    rules = load_rules()
    paths = fixture_paths()
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    sim = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    assert sim.FARM >= 0, "no FARM in the improvement roster"
    civ_i, civ_per, civ_food = sim._farmadj_civic
    tech_i, tech_per, tech_food = sim._farmadj_tech
    assert civ_i >= 0 and tech_i >= 0, "a Farm adjacency row is missing from the catalog"
    assert (civ_per, civ_food, tech_per, tech_food) == (2, 1, 1, 1), \
        f"the sourced rates moved: {sim._farmadj_civic} {sim._farmadj_tech}"

    # an interior LAND tile with at least two neighbours to farm
    t = n1 = n2 = -1
    for cand in range(sim.T):
        nb = [int(x) for x in sim.neigh[cand].tolist() if int(x) >= 0]
        if len(nb) >= 3 and not bool(sim.nwonder[0, cand]) and not bool(sim.water[0, cand]):
            t, n1, n2 = cand, nb[0], nb[1]
            break
    assert t >= 0, "no interior land tile in the fixture"

    row = 0
    sim.civ_civics[0, row, civ_i] = True
    sim.civ_techs[0, row, tech_i] = False
    for x in [int(y) for y in sim.neigh[t].tolist() if int(y) >= 0]:
        sim.improvement[0, x] = -1
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

    # Feudalism: two adjacent Farms make one group of 2 -> +1, then the floor
    got = float(sim._rcy_food_plane(row, sim._rcy_globals())[0, t])
    assert abs(got - 0.0) < 1e-12, \
        f"the adjacency food belongs BEFORE the drought floor: expected 0, got {got}"
    assert abs(got - (floored + 1.0)) > 1e-12, \
        "the lane is vacuous here — adding the food after the floor gives the same answer"

    # ...and with no drought the floor is not involved: the food lands whole.
    sim.drought[0, t] = 0
    sim._eff_version += 1
    dry = float(sim._rcy_food_plane(row, sim._rcy_globals())[0, t])
    assert abs(dry - 1.0) < 1e-12, f"Feudalism pays 1 per 2 adjacent Farms: expected 1, got {dry}"

    # Replaceable Parts: one per adjacent Farm, the Medieval row obsoleted
    sim.civ_techs[0, row, tech_i] = True
    sim._eff_version += 1
    mech = float(sim._rcy_food_plane(row, sim._rcy_globals())[0, t])
    assert abs(mech - 2.0) < 1e-12, f"Replaceable Parts pays 1 per adjacent Farm: expected 2, got {mech}"

    # A seat WITHOUT the unlock reads the shared plane, floor and all.
    other = 1 if sim.n_majors >= 2 else 0
    if other != row:
        sim.civ_civics[0, other, civ_i] = False
        sim.civ_techs[0, other, tech_i] = False
        assert int(sim._farmadj_row(sim._seat_civics(other), sim._seat_techs(other))[0][0]) == 0
        sim.drought[0, t] = 1
        sim._eff_version += 1
        assert abs(float(sim._rcy_food_plane(other, sim._rcy_globals())[0, t])) < 1e-12, \
            "a seat with no Farm adjacency row reads _eff_food unchanged"

    print("food_order_test OK — the Farm adjacency food lands before the fertility/drought tail, "
          "at 1 per 2 Farms (Feudalism) and 1 per Farm (Replaceable Parts)")


if __name__ == "__main__":
    main()
