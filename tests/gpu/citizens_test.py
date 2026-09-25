"""CITIZEN ASSIGNMENT — the two overrides the automatic rule answers to.

    python tests/gpu/citizens_test.py

Real Civ 6 lets the player place every citizen: click a plot to pin one there,
click a district slot to make one a specialist. Both engines carry those as
wire intents — `Tile.locked` / `tile_locked` and `City.specialistPref` /
`city_spec_pin` — and fill everything left over with the automatic rule
(overflow citizens into open slots, the rest onto the best-scoring plots).

The driven gate reaches a pin only late, once a city is big enough to spare a
citizen, and reaches the plot lock only where a worked window holds a resource.
This lane pins the rules themselves: the pin outranks the overflow, both clamp,
and a locked plot is worked whatever it scores.
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
    paths = fixture_paths()
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    sim = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    for _ in range(20):
        sim.step()
    return sim


def a_city(sim) -> tuple[int, int]:
    for row in range(sim.n_majors):
        live = sim.city_alive[0, row].nonzero().flatten()
        if live.numel():
            return row, int(live[0])
    raise AssertionError("no living city in the fixture")


def seat_district(sim, row: int, j: int) -> int:
    """Give the city a COMPLETE district that seats specialists, plus a
    building in it, and return the district's catalog index."""
    di = int(sim._spec_any.nonzero().flatten()[0])
    free = [t for t in range(sim.T)
            if int(sim.tile_seat[0, t]) == row and int(sim.district[0, t]) < 0
            and int(sim.built_wonder[0, t]) < 0 and bool(sim.passable[0, t])
            and t != int(sim.city_center[0, row, j])]
    assert free, "the city owns no free plot to put a district on"
    t = free[0]
    sim.district[0, t] = di
    sim.district_complete[0, t] = True
    sim.district_pillaged[0, t] = False
    sim.city_dist_tile[0, row, j, di] = t
    # every building whose district is this one, so the slot count is real
    b_of = sim._b_dist_oh[:, di].nonzero().flatten()
    assert b_of.numel(), "no building in the catalog seats a specialist here"
    sim.city_bldg[0, row, j, int(b_of[0])] = True
    sim._eff_version += 1
    sim._tile_owner_ver += 1
    return di


def main() -> None:
    sim = build()
    row, j = a_city(sim)
    di = seat_district(sim, row, j)
    slots = int(sim._city_spec_slots(row)[0, j, di])
    assert slots >= 1, f"the seated district offers {slots} slots"

    # --- 1) NOTHING PINNED: the automatic overflow rule, unchanged ----------
    work = int(sim._workable_count(row)[0, j])
    sim.city_pop[0, row, j] = work + 1
    sim.city_spec_pin[0, row, j, :] = -1
    sim._eff_version += 1
    auto = sim._city_specialists(row)[0, j]
    assert int(auto[di]) == 1, f"one overflow citizen should man one slot, got {int(auto[di])}"
    sim.city_pop[0, row, j] = work
    sim._eff_version += 1
    assert int(sim._city_specialists(row)[0, j].sum()) == 0, (
        "with no overflow and nothing pinned the automatic rule seats nobody"
    )
    print("  the automatic rule is untouched where nothing is pinned")

    # --- 2) A PIN OUTRANKS THE OVERFLOW -------------------------------------
    # population sits AT the workable pool, so nothing overflows; the pin is
    # the only reason a citizen leaves a plot.
    sim.city_spec_pin[0, row, j, di] = 1
    sim._eff_version += 1
    assert int(sim._city_specialists(row)[0, j, di]) == 1, (
        "a pinned citizen must take the slot even with no overflow"
    )
    print("  a pin seats a citizen the overflow rule never would")

    # --- 3) BOTH CLAMPS: the open slots, and the population -----------------
    sim.city_spec_pin[0, row, j, di] = slots + 5
    sim._eff_version += 1
    assert int(sim._city_specialists(row)[0, j, di]) == slots, (
        "a pin over the open slots must clamp to the slots"
    )
    sim.city_pop[0, row, j] = 1
    sim._eff_version += 1
    assert int(sim._city_specialists(row)[0, j, di]) == 1, (
        "a pin over the population must clamp to the population"
    )
    sim.city_pop[0, row, j] = work
    sim.city_spec_pin[0, row, j, :] = -1
    sim._eff_version += 1
    print("  a pin clamps to the open slots and to the population")

    # --- 4) A PILLAGED district darkens the slot, pin or no pin -------------
    dt = int(sim.city_dist_tile[0, row, j, di])
    sim.district_pillaged[0, dt] = True
    sim.city_spec_pin[0, row, j, di] = 1
    sim._eff_version += 1
    assert int(sim._city_specialists(row)[0, j, di]) == 0, (
        "a pillaged district seats nobody, however the player pinned it"
    )
    sim.district_pillaged[0, dt] = False
    sim.city_spec_pin[0, row, j, :] = -1
    sim._eff_version += 1
    print("  a pillaged district takes its slots with it")

    # --- 5) A LOCKED PLOT IS WORKED whatever it scores ----------------------
    # Shrink a city to ONE worked plot and lock the worst one in its window:
    # if the lock is honoured the city works that plot instead of its best.
    # The city is the first one, on any seat, whose window holds two plots
    # that score apart, so the scene reads whatever world the fixture holds.
    def food_prod(r: int, c: int) -> tuple[float, float]:
        yf = sim._seat_amenity(r)[2]
        tot = sim._seat_city_walk(r, amen_yf=yf)
        return float(tot[0, c, 0]), float(tot[0, c, 1])

    def locked_keys(r: int, c: int, win: list[int]) -> dict[int, tuple[float, float]]:
        keys = {}
        for t in win:
            sim.tile_locked[0, :] = False
            sim.tile_locked[0, t] = True
            sim._eff_version += 1
            keys[t] = food_prod(r, c)
        sim.tile_locked[0, :] = False
        sim._eff_version += 1
        return keys

    scene = None
    for r in range(sim.n_majors):
        tiles, valid = sim._work_window(r)
        for c in sim.city_alive[0, r].nonzero().flatten().tolist():
            win = [int(t) for t, v in zip(tiles[0, c].tolist(), valid[0, c].tolist()) if v]
            if len(win) < 2:
                continue
            pop0 = int(sim.city_pop[0, r, c])
            sim.city_pop[0, r, c] = 1
            sim._eff_version += 1
            keys = locked_keys(r, c, win)
            if len(set(keys.values())) > 1:
                scene = (r, c, win, keys)
                break
            sim.city_pop[0, r, c] = pop0
            sim._eff_version += 1
        if scene:
            break
    assert scene, "no city's window holds two plots that score apart"
    row, j, win, keys = scene
    base = food_prod(row, j)
    worst = min(keys, key=lambda t: keys[t])
    worst_key = keys[worst]
    assert worst_key <= base, (
        f"locking the weakest plot {worst} should not beat the free choice {base} — got {worst_key}"
    )
    other = min((t for t in keys if keys[t] != base), key=lambda t: keys[t], default=-1)
    assert other >= 0, "no lock changed the city's yield — the ranking is ignoring tile_locked"
    sim.tile_locked[0, other] = True
    sim._eff_version += 1
    assert food_prod(row, j) == keys[other], "the lock did not survive being set again"
    print(f"  a locked plot displaces the city's own pick ({base} -> {keys[other]})")

    # --- 6) THE WIRE: a flip needs the seat's own ground --------------------
    sim.tile_locked[0, :] = False
    foreign = next((t for t in range(sim.T) if int(sim.tile_seat[0, t]) != row), -1)
    assert foreign >= 0, "every plot on the map belongs to this seat"
    mine = win[0]
    sim._apply_citizens(
        row,
        torch.ones(sim.B, dtype=torch.bool),
        None,
        torch.tensor([[mine, foreign]], dtype=torch.long),
    )
    assert bool(sim.tile_locked[0, mine]), "a flip on the seat's own plot must land"
    assert not bool(sim.tile_locked[0, foreign]), "a flip on someone else's plot must be refused"
    sim._apply_citizens(row, torch.ones(sim.B, dtype=torch.bool), None,
                        torch.tensor([[mine]], dtype=torch.long))
    assert not bool(sim.tile_locked[0, mine]), "a second flip must clear the pin"
    print("  a flip lands on the seat's own ground and nowhere else")

    print("CITIZENS OK — the pin, its two clamps, the pillage gate and the plot lock")


if __name__ == "__main__":
    main()
