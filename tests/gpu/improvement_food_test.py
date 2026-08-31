"""AN IMPROVEMENT'S FOOD IS PART OF THE TILE, NOT A FARM PRIVILEGE.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/improvement_food_test.py

CIV6: `tileYields`' improvement block pays the improvement's own catalog yield
on every column it names. TS reads the whole row; the GPU splits it three ways
— food on `_food_base`, production on `_neutral_prod`, gold and up on the
static columns of `_rcy_globals` — and the food arm knew only the FARM. The
FISHING_BOATS food a worked sea resource earns was therefore missing on one
engine, while the same improvement's HOUSING and its resource's LUXURY both
landed, so nothing about the tile looked wrong: only the city that worked it
grew slower.

Proven here, per catalog row rather than per improvement, so a row added later
is covered the day it ships:
  * every improvement carrying food raises a bare tile's food by exactly it;
  * PILLAGE suspends that food, as it suspends the production;
  * food and production answer the SAME catalog row — the assertion the split
    needs, because a column with its own arm is a column that can drift;
  * the FARM is paid once, through the loader's own constant.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all

B0 = 0


def build(rules, path) -> BatchSim:
    return settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64))


def plain_tile(sim) -> int:
    """A tile whose food answers `_food_base` plainly — no natural wonder to
    early-return over it, no fertility or drought riding the tail, and nothing
    improved on it yet."""
    for t in range(sim.T):
        if bool(sim.nwonder[B0, t]) or int(sim.improvement[B0, t]) >= 0:
            continue
        if float(sim.fertility[B0, t]) != 0 or int(sim.drought[B0, t]) > 0:
            continue
        if bool(sim.feat_stripped[B0, t]):
            continue
        return t
    raise AssertionError("no plain unimproved tile on this fixture")


def yields_at(sim, tile: int, imp: int, pillaged: bool = False) -> tuple[float, float]:
    """(food, production) of one tile under one improvement."""
    sim.improvement[B0, tile] = imp
    sim.pillaged[B0, tile] = pillaged
    sim._eff_version += 1
    return float(sim._eff_food()[B0, tile]), float(sim._neutral_prod()[B0, tile])


# ---------------------------------------------------------------------------


def test_every_food_row_reaches_the_tile(rules, path) -> None:
    sim = build(rules, path)
    tile = plain_tile(sim)
    bare_f, _ = yields_at(sim, tile, -1)
    paid = []
    for i in range(sim._imp_yields.shape[0]):
        want = float(sim._imp_yields[i, 0])
        if want == 0:
            continue
        got, _ = yields_at(sim, tile, i)
        assert got - bare_f == want, \
            f"improvement {i} owes {want} food and the tile gained {got - bare_f}"
        paid.append(i)
    assert paid, "no improvement in the catalog carries food — this proves nothing"
    print(f"  1 catalog OK — {len(paid)} food-bearing rows each reach the tile")


def test_pillage_suspends_it(rules, path) -> None:
    sim = build(rules, path)
    tile = plain_tile(sim)
    bare_f, bare_p = yields_at(sim, tile, -1)
    for i in range(sim._imp_yields.shape[0]):
        if float(sim._imp_yields[i, 0]) == 0:
            continue
        got_f, got_p = yields_at(sim, tile, i, pillaged=True)
        assert (got_f, got_p) == (bare_f, bare_p), \
            f"a pillaged improvement {i} still paid ({got_f}, {got_p}) over ({bare_f}, {bare_p})"
    sim.pillaged[B0, tile] = False
    print("  2 pillage OK — a suspended improvement pays neither column")


def test_the_two_columns_answer_one_catalog(rules, path) -> None:
    """The class guard. Food and production are computed by separate arms, so
    assert row by row that both arms read the same table — the drift that hid
    a missing food arm behind a working production one."""
    sim = build(rules, path)
    tile = plain_tile(sim)
    bare_f, bare_p = yields_at(sim, tile, -1)
    for i in range(sim._imp_yields.shape[0]):
        got_f, got_p = yields_at(sim, tile, i)
        assert got_f - bare_f == float(sim._imp_yields[i, 0]), \
            f"improvement {i}: food arm paid {got_f - bare_f}, catalog says {float(sim._imp_yields[i, 0])}"
        assert got_p - bare_p == float(sim._imp_yields[i, 1]), \
            f"improvement {i}: production arm paid {got_p - bare_p}, catalog says {float(sim._imp_yields[i, 1])}"
    print(f"  3 columns OK — all {sim._imp_yields.shape[0]} rows agree on both arms")


def test_the_farm_is_paid_once(rules, path) -> None:
    sim = build(rules, path)
    tile = plain_tile(sim)
    bare_f, _ = yields_at(sim, tile, -1)
    got_f, _ = yields_at(sim, tile, sim.FARM)
    assert got_f - bare_f == sim._farm_food, \
        f"the FARM paid {got_f - bare_f}, not its loader constant {sim._farm_food}"
    assert sim.FARM < 3 and sim.MINE < 3 and sim.LUMBER < 3, (
        "the loader's three named improvements moved past the generic arm's "
        f"cutoff — FARM {sim.FARM}, MINE {sim.MINE}, LUMBER_MILL {sim.LUMBER}")
    print(f"  4 farm OK — paid once at {sim._farm_food}, and the three named rows stay under the cutoff")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_every_food_row_reaches_the_tile(rules, path)
    test_pillage_suspends_it(rules, path)
    test_the_two_columns_answer_one_catalog(rules, path)
    test_the_farm_is_paid_once(rules, path)
    print("BATTERY OK improvement_food")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
