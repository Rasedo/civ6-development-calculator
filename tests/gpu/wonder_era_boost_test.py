"""A WONDER'S ERA BOOST — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/wonder_era_boost_test.py

The TS twin is tests/cpu/city/wonder-era-boost.test.ts.

CIV6 (Dynastic Cycle): "When completing a wonder receive a random Eureka and
Inspiration from the era of the wonder, IF AVAILABLE." Each of the install's
two modifiers is Amount 1 (C-54).

The parity-critical half is the rng: TS returns out of its draw loop when a
pool is empty, so the stream must not move for that game either.
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
ROW = 1


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


def _n_boosted(sim, row: int) -> int:
    return int(sim.civ_tech_boosted[B0, row].sum()) + int(sim.civ_civic_boosted[B0, row].sum())


def test_the_wire(rules, path) -> None:
    sim = build(path)
    rows = sim._wonder_era_boost_rows
    assert len(rows) == 1, f"one carrier expected, wire has {len(rows)}"
    _c, _l, _t, _v = rows[0]
    assert _t == 1 and _v == 1, f"the install writes Amount 1 twice, wire has {_t}/{_v}"
    assert _c >= 0, "the carrier names no civilization"
    print("  1 the wire OK — one row, one Eureka and one Inspiration")


def test_grants_one_of_each_from_the_era(rules, path) -> None:
    sim = build(path)
    _c, _l, _t, _v = sim._wonder_era_boost_rows[0]
    _seat(sim, ROW, sim._civ_ids[_c])
    era = 0
    before_t = int(sim.civ_tech_boosted[B0, ROW].sum())
    before_c = int(sim.civ_civic_boosted[B0, ROW].sum())
    m = torch.ones(sim.B, dtype=torch.bool)
    sim._grant_era_boosts(ROW, m, torch.full((sim.B,), era, dtype=torch.long))
    got_t = int(sim.civ_tech_boosted[B0, ROW].sum()) - before_t
    got_c = int(sim.civ_civic_boosted[B0, ROW].sum()) - before_c
    assert got_t == 1 and got_c == 1, f"granted {got_t} eurekas and {got_c} inspirations"
    # ...and both came from THAT era
    for plane, era_of in ((sim.civ_tech_boosted, sim._tech_era),
                          (sim.civ_civic_boosted, sim._civic_era)):
        k = min(era_of.numel(), plane.shape[2])
        on = plane[B0, ROW, :k].nonzero().flatten().tolist()
        for i in on:
            assert int(era_of[i]) == era, f"boosted index {i} is era {int(era_of[i])}, not {era}"
    print("  2 the grant OK — one of each, both from the wonder's era")


def test_an_empty_pool_takes_no_draw(rules, path) -> None:
    """The parity-critical pin: TS returns out of its loop when a pool is
    empty, so the rng must not move for that game either."""
    sim = build(path)
    _c, _l, _t, _v = sim._wonder_era_boost_rows[0]
    _seat(sim, ROW, sim._civ_ids[_c])
    era = 0
    # hold every tech and civic of the era, so both pools are empty
    for plane, era_of in ((sim.civ_techs, sim._tech_era), (sim.civ_civics, sim._civic_era)):
        k = min(era_of.numel(), plane.shape[2])
        plane[B0, ROW, :k] |= (era_of[:k] == era)
    rng0 = sim.rng_state.clone()
    before = _n_boosted(sim, ROW)
    sim._grant_era_boosts(ROW, torch.ones(sim.B, dtype=torch.bool),
                          torch.full((sim.B,), era, dtype=torch.long))
    assert _n_boosted(sim, ROW) == before, "an empty era still granted a boost"
    assert bool(torch.equal(sim.rng_state, rng0)), "an empty pool moved the rng stream"
    print("  3 the empty pool OK — no boost, and the rng did not move")


def test_a_plain_seat_draws_nothing(rules, path) -> None:
    sim = build(path)
    _seat(sim, ROW, None)
    rng0 = sim.rng_state.clone()
    before = _n_boosted(sim, ROW)
    sim._grant_era_boosts(ROW, torch.ones(sim.B, dtype=torch.bool),
                          torch.zeros(sim.B, dtype=torch.long))
    assert _n_boosted(sim, ROW) == before, "a seat the roster does not name was boosted"
    assert bool(torch.equal(sim.rng_state, rng0)), "a plain seat moved the rng stream"
    print("  4 the plain seat OK — no boost, and the rng did not move")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_the_wire(rules, path)
    test_grants_one_of_each_from_the_era(rules, path)
    test_an_empty_pool_takes_no_draw(rules, path)
    test_a_plain_seat_draws_nothing(rules, path)
    print("BATTERY OK wonder_era_boost")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
