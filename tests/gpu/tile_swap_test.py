"""THE TILE SWAP — the GPU twin of `swapTileOk` and its record arm.

    python tests/gpu/tile_swap_test.py

"Claim this tile to be worked by this city, instead of your other city.
Ownership cannot be swapped if the tile has a district, a wonder, or is next
to the other city's center tile." (LOC_PLOTINFO_SWAP_TILE_OWNER_TOOLTIP), and
the Golf Course's and Open-Air Museum's "Tiles with <row> cannot be swapped"
(`_imp_no_swap`). The claimant's reach is its work radius.

The scenes mirror `tests/cpu/city/tile-swap.test.ts`: a second city of the
same row is planted four hexes from the first, every refusal is asked of
`_swap_tile_ok`, the record arm (`_apply_citizens`'s swap) retags only what
the predicate allows and keeps a pinned plot's pin, and the driver's rule
(`_decide_swap`) names a plot the predicate allows.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "gpu"))
sys.path.insert(0, str(ROOT / "policy"))

from core import BatchSim, load_rules, load_fixture, fixture_paths  # noqa: E402
from warmup import settle_all  # noqa: E402
import drive  # noqa: E402


def build():
    rules = load_rules()
    paths = fixture_paths()
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    sim = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    for _ in range(3):
        sim.step()
    return sim


def plant(sim):
    """(row, a slot, b slot) — the row's first living city A, and a second
    city B planted in a free slot on a tile four hexes from A's centre. Every
    plot within 3 of either centre is the row's, the nearer centre's."""
    for row in range(sim.n_majors):
        live = sim.city_alive[0, row].nonzero().flatten()
        if live.numel():
            break
    else:
        raise AssertionError("no living city in the fixture")
    ja = int(live[0])
    jb = int((~sim.city_alive[0, row]).nonzero().flatten()[0])
    ca = int(sim.city_center[0, row, ja])
    pd = sim.pair_dist.long()
    far = [t for t in range(sim.T) if int(pd[ca, t]) == 4
           and all(int(pd[t, u]) >= 7 for u in range(sim.T)
                   if int(sim.centre_slot_at[0, u]) >= 0 and u != ca)]
    assert far, "no tile four hexes from the city and clear of every other centre"
    cb = far[0]
    new_id = int(sim.city_id[0, row].max()) + 100
    sim.city_alive[0, row, jb] = True
    sim.city_id[0, row, jb] = new_id
    sim.city_center[0, row, jb] = cb
    sim.centre_slot_at[0, cb] = jb
    sim.city_pop[0, row, jb] = 1
    sim.city_worked[0, row, jb] = -1
    ida = int(sim.city_id[0, row, ja])
    for t in range(sim.T):
        da, db = int(pd[ca, t]), int(pd[cb, t])
        if min(da, db) > 3:
            continue
        sim.tile_seat[0, t] = row
        sim.tile_city[0, t] = ida if da <= db else new_id
        sim.district[0, t] = -1
        sim.built_wonder[0, t] = -1
        sim.improvement[0, t] = -1
        sim.tile_locked[0, t] = False
    sim.tile_city[0, cb] = new_id
    sim._tile_owner_ver += 1
    sim._claim_version += 1
    sim._eff_version += 1
    return row, ja, jb, ca, cb


def ok(sim, row, j, t) -> bool:
    return bool(sim._swap_tile_ok(row, torch.tensor([[j]]), torch.tensor([[t]]))[0, 0])


def main() -> None:
    sim = build()
    row, ja, jb, ca, cb = plant(sim)
    pd = sim.pair_dist.long()
    idb = int(sim.city_id[0, row, jb])
    ida = int(sim.city_id[0, row, ja])

    def b_plot(pred) -> int:
        for t in range(sim.T):
            if int(sim.tile_seat[0, t]) == row and int(sim.tile_city[0, t]) == idb and t != cb and pred(t):
                return t
        raise AssertionError("no plot of B fits the scene")

    good = b_plot(lambda t: int(pd[ca, t]) <= 3 and int(pd[cb, t]) >= 2)
    next_b = b_plot(lambda t: int(pd[ca, t]) <= 3 and int(pd[cb, t]) == 1)
    reach = b_plot(lambda t: int(pd[ca, t]) > 3)

    # --- 1) every refusal the text names, and the reach --------------------
    assert ok(sim, row, ja, good), "a plain plot of the sibling inside the radius must be swappable"
    assert not ok(sim, row, ja, next_b), "a plot next to the losing city's centre is refused"
    assert not ok(sim, row, ja, cb), "the losing city's centre is a district"
    assert not ok(sim, row, ja, reach), "a plot outside the claimant's work radius is refused"
    di = 0
    sim.district[0, good] = di
    sim.district_complete[0, good] = False
    assert not ok(sim, row, ja, good), "a district under construction is refused"
    sim.district_complete[0, good] = True
    assert not ok(sim, row, ja, good), "a complete district is refused"
    sim.district[0, good] = -1
    sim.district_complete[0, good] = False
    sim.built_wonder[0, good] = 0
    sim.built_wonder_complete[0, good] = False
    assert not ok(sim, row, ja, good), "a wonder site is refused"
    sim.built_wonder[0, good] = -1
    for ns in sim._imp_no_swap.nonzero().flatten().tolist():
        sim.improvement[0, good] = ns
        assert not ok(sim, row, ja, good), f"a noSwap improvement ({ns}) is refused"
        sim.pillaged[0, good] = True
        assert not ok(sim, row, ja, good), f"a pillaged noSwap improvement ({ns}) is refused"
        sim.pillaged[0, good] = False
    assert int(sim._imp_no_swap.sum()) == 2, "the Golf Course and the Open-Air Museum are the two noSwap rows"
    plain = int((~sim._imp_no_swap).nonzero().flatten()[0])
    sim.improvement[0, good] = plain
    assert ok(sim, row, ja, good), "an improvement the text does not name is swapped"
    sim.improvement[0, good] = -1
    other = (row + 1) % sim.n_majors
    sim.tile_seat[0, good] = other
    assert not ok(sim, row, ja, good), "another seat's plot is refused"
    sim.tile_seat[0, good] = row
    sim.tile_city[0, good] = ida
    assert not ok(sim, row, ja, good), "the claimant's own plot is refused"
    sim.tile_city[0, good] = idb
    print("  every refusal: district, wonder, next to the centre, noSwap, other seat, own plot, out of reach")

    # --- 2) THE RECORD ARM: a refused swap does nothing, an allowed one lands,
    # the pin stays (a retag inside one seat is not a change of hands) ------
    act = torch.ones(sim.B, dtype=torch.bool)
    sim.tile_locked[0, good] = True
    sim._apply_citizens(row, act, None, None,
                        torch.tensor([[[ca, next_b], [cb, good], [good, good], [ca, good]]], dtype=torch.long))
    assert int(sim.tile_city[0, next_b]) == idb, "a refused swap must not land"
    assert int(sim.tile_city[0, good]) == ida, "the allowed swap must retag the plot to the claimant"
    assert int(sim.tile_seat[0, good]) == row
    assert bool(sim.tile_locked[0, good]), "a same-seat retag keeps the plot's pin"
    sim.tile_locked[0, good] = False
    tiles, valid = sim._work_window(row)
    win = {int(t) for t, v in zip(tiles[0, ja].tolist(), valid[0, ja].tolist()) if v}
    assert good in win, "the claimant works the swapped plot"
    print("  the record retags what the predicate allows and nothing else")

    # --- 3) THE DRIVER'S RULE: a short city takes a spare sibling's plot ----
    sim.tile_city[0, good] = idb
    sim._tile_owner_ver += 1
    sim._eff_version += 1
    tiles, valid = sim._work_window(row)
    sim.city_pop[0, row, ja] = int(valid[0, ja].sum()) + 1
    sim.city_pop[0, row, jb] = 1
    sim.city_worked[0, row] = -1
    sim._eff_version += 1
    pick = drive._decide_swap(sim, row)
    assert pick is not None, "a short city beside a spare sibling must claim a plot"
    c, t = int(pick[0, 0, 0]), int(pick[0, 0, 1])
    assert c == ca, "the short city is the claimant"
    assert ok(sim, row, ja, t), "the driver names only a plot the predicate allows"
    sim.city_pop[0, row, ja] = 1
    assert drive._decide_swap(sim, row) is None, "no city short of plots, no swap"
    print(f"  the driver's rule claims plot {t} for the short city")

    print("TILE SWAP OK — the predicate, its record arm and the driver's rule")


if __name__ == "__main__":
    main()
