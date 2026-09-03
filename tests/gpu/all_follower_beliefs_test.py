"""EVERY PRESENT RELIGION'S FOLLOWER BELIEF — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/all_follower_beliefs_test.py

The TS twin is tests/cpu/city/all-follower-beliefs.test.ts.

CIV6 (Dharma, EFFECT_ADJUST_GAINS_ALL_FOLLOWER_BELIEFS): "Receives Follower
Belief bonuses in a city from each Religion that has at least 1 Follower."
Every other seat pays exactly ONE — its city's own followed religion. This is
the QUANTIFIER, and it was the half of the ability with no reader on either
engine: the row, the wire and this list all shipped and nothing read them
(C-57).
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
ROW = 0


def build(path) -> BatchSim:
    return settle_all(BatchSim([load_fixture(path)], load_rules(),
                               device="cpu", dtype=torch.float64))


def _seat(sim, row: int, civ) -> None:
    if civ is None:
        sim.row_civ[B0, row] = -1
        sim.row_leader[B0, row] = -1
    else:
        ci = sim._civ_ids.index(civ)
        sim.row_civ[B0, row] = ci
        sim.row_leader[B0, row] = sim._pair_civ.index(ci)
    sim._eff_version += 1
    sim._gen_ver += 1
    sim._bldg_version += 1


def _two_beliefs(sim):
    """Two follower beliefs whose SHRINE-and-friends table rows differ, so
    which of them landed is readable off the returned tensor alone."""
    tab = sim._bel["fol"]["bldgY"]          # [1 + n_beliefs, NB, 6], slot 0 zero
    live = [i for i in range(1, tab.shape[0]) if bool(tab[i].abs().sum() > 0)]
    assert len(live) >= 2, f"the wire carries {len(live)} paying follower beliefs"
    for a in live:
        for b in live:
            if a != b and not bool(torch.equal(tab[a], tab[b])):
                return a - 1, b - 1       # back to belief ids; _fol_tab adds the 1
    raise AssertionError("every paying follower belief has the same table")


def scene(path):
    """Two rival religions with different follower beliefs, both present in
    this row's cities, the row's own the followed one."""
    sim = build(path)
    a, b = _two_beliefs(sim)
    sim.civ_follower[B0, 0] = a
    sim.civ_follower[B0, 1] = b
    sim.city_followed[B0, ROW, :] = 0
    sim.city_pressure[B0, ROW, :, 0] = 10
    sim.city_pressure[B0, ROW, :, 1] = 4
    sim._eff_version += 1
    return sim, a, b


def test_the_wire(rules, path) -> None:
    sim = build(path)
    rows = sim._all_follower_belief_rows
    assert len(rows) == 1, f"one carrier expected, wire has {len(rows)}"
    assert rows[0][0] >= 0, "the carrier names no civilization"
    print("  1 the wire OK — one row, and it names a civilization")


def test_a_plain_seat_pays_its_one_religion(rules, path) -> None:
    sim, a, b = scene(path)
    _seat(sim, ROW, "AMERICA")
    tab = sim._bel["fol"]["bldgY"]
    got = sim._fol_tab_for("bldgY", ROW)
    assert bool(torch.equal(got[B0, 0], tab[a + 1])), "a plain seat did not pay its followed belief"
    assert not bool(torch.equal(got[B0, 0], tab[a + 1] + tab[b + 1])), \
        "a plain seat paid the rival religion too"
    print("  2 the plain seat OK — its own belief, and not the rival's")


def test_india_pays_every_present_religion(rules, path) -> None:
    sim, a, b = scene(path)
    _seat(sim, ROW, "INDIA")
    tab = sim._bel["fol"]["bldgY"]
    got = sim._fol_tab_for("bldgY", ROW)
    assert bool(torch.equal(got[B0, 0], tab[a + 1] + tab[b + 1])), \
        "India did not stack both present religions' beliefs"
    print("  3 India OK — both beliefs, from one city")


def test_a_religion_with_no_pressure_is_never_paid(rules, path) -> None:
    sim, a, b = scene(path)
    _seat(sim, ROW, "INDIA")
    sim.city_pressure[B0, ROW, :, 1] = 0          # the rival has no follower here
    sim._eff_version += 1
    tab = sim._bel["fol"]["bldgY"]
    got = sim._fol_tab_for("bldgY", ROW)
    assert bool(torch.equal(got[B0, 0], tab[a + 1])), "a religion with no pressure was paid"
    print("  4 the empty religion OK — pressure is the follower proxy")


def test_a_dead_city_pays_nothing(rules, path) -> None:
    """`city_alive` gates the sum, or a compacted empty slot would pay every
    religion the plane still holds pressure for."""
    sim, a, b = scene(path)
    _seat(sim, ROW, "INDIA")
    dead = next((j for j in range(sim.RC) if not bool(sim.city_alive[B0, ROW, j])), None)
    assert dead is not None, "this fixture has no empty city slot to test"
    sim.city_pressure[B0, ROW, dead, :] = 10
    sim._eff_version += 1
    got = sim._fol_tab_for("bldgY", ROW)
    zero = torch.zeros_like(got[B0, dead])
    assert bool(torch.equal(got[B0, dead], zero)), "a dead city slot was paid a belief"
    print("  5 the dead slot OK — city_alive gates the sum")


def test_the_batch_is_per_game(rules, path) -> None:
    """A [B] roster mask reduced with .any() would pay EVERY game for what one
    game seats — the collapsed-mask class. Seat India in ONE game of two."""
    wide = settle_all(BatchSim([load_fixture(path), load_fixture(path)],
                               load_rules(), device="cpu", dtype=torch.float64))
    assert wide.B > 1
    a, b = _two_beliefs(wide)
    wide.civ_follower[:, 0] = a
    wide.civ_follower[:, 1] = b
    wide.city_followed[:, ROW, :] = 0
    wide.city_pressure[:, ROW, :, 0] = 10
    wide.city_pressure[:, ROW, :, 1] = 4
    ci = wide._civ_ids.index("INDIA")
    wide.row_civ[0, ROW] = ci
    wide.row_leader[0, ROW] = wide._pair_civ.index(ci)
    cj = wide._civ_ids.index("AMERICA")
    wide.row_civ[1, ROW] = cj
    wide.row_leader[1, ROW] = wide._pair_civ.index(cj)
    wide._eff_version += 1
    wide._gen_ver += 1
    wide._bldg_version += 1
    tab = wide._bel["fol"]["bldgY"]
    got = wide._fol_tab_for("bldgY", ROW)
    assert bool(torch.equal(got[0, 0], tab[a + 1] + tab[b + 1])), "game 0 (India) did not stack"
    assert bool(torch.equal(got[1, 0], tab[a + 1])), "game 1 paid for the OTHER game's India"
    print("  6 the batch OK — the clause is per game, not per batch")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_the_wire(rules, path)
    test_a_plain_seat_pays_its_one_religion(rules, path)
    test_india_pays_every_present_religion(rules, path)
    test_a_religion_with_no_pressure_is_never_paid(rules, path)
    test_a_dead_city_pays_nothing(rules, path)
    test_the_batch_is_per_game(rules, path)
    print("BATTERY OK all_follower_beliefs")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
