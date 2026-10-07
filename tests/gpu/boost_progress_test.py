"""A BOOST LANDS AS PROGRESS — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/boost_progress_test.py

The TS twin is tests/cpu/city/fidelity.test.ts ('boosts').

The DLL's boost trigger (0x4cd900 techs, 0x3a3c00 civics) lands the row's
percent of the item's cost as PROGRESS on that item — never past its cost —,
and an item that reaches its cost completes at once (0x3a1fb0 -> 0x3a1ac0).
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import json

from core import BatchSim, load_rules, fixture_paths  # noqa: F401
from core.simbase import FIXTURES
from warmup import warm_base, opened

B0 = 0
ROW = 1


def build(path) -> BatchSim:
    return warm_base(str(path), lambda: opened(load_rules(), path), ("row_civ", "row_leader"))


def _idx(sim, name: str) -> int:
    return [t["id"] for t in json.loads((FIXTURES / "rules.json").read_text())["techs"]].index(name)


def test_the_amount(sim) -> None:
    amt = lambda c, p: int(sim._boost_amount(torch.tensor([c]), torch.tensor([40]), torch.tensor([p]))[0])  # noqa: E731
    # runs/h1_duelw11*: Rome's Astrology (25) lands 9, its Writing (40) 15;
    # China's ten points more land 12 and 19, its Craftsmanship (20) 9
    assert (amt(25, 0), amt(40, 0), amt(25, 10), amt(40, 10), amt(20, 10)) == (9, 15, 12, 19, 9)
    print("  1 the amount OK — the 24.8 fixed point's truncation, the seat's points on top")


def test_parked_and_current(sim) -> None:
    w = _idx(sim, "WRITING")
    cost = int(sim.rules_dev.t_cost[w])
    sim.civ_cur_tech[B0, ROW] = -1
    sim.civ_tech_retain[B0, ROW, w] = 3.0
    want = torch.zeros_like(sim.civ_techs[:, ROW])
    want[B0, w] = True
    pts = int(sim._boost_points(ROW, False)[B0])
    newly = sim._land_boosts(ROW, want, False)
    assert bool(newly[B0, w]) and bool(sim.civ_tech_boosted[B0, ROW, w])
    got = float(sim.civ_tech_retain[B0, ROW, w])
    want_amt = int(sim._boost_amount(torch.tensor([cost]), torch.tensor([40]), torch.tensor([pts]))[0])
    assert got == 3.0 + want_amt, f"the parked progress reads {got}, not {3.0 + want_amt}"
    again = sim._land_boosts(ROW, want, False)
    assert not bool(again[B0, w]) and float(sim.civ_tech_retain[B0, ROW, w]) == got, "a boost landed twice"
    print(f"  2 parked OK — Writing ({cost}) 3 -> {got}, and never twice")


def test_fills_and_completes(sim) -> None:
    a = _idx(sim, "ASTROLOGY")
    cost = float(sim.rules_dev.t_cost[a])
    sim.civ_techs[B0, ROW, a] = False
    sim.civ_tech_boosted[B0, ROW, a] = False
    sim.civ_cur_tech[B0, ROW] = a
    sim.civ_tech_prog[B0, ROW] = cost - 2
    want = torch.zeros_like(sim.civ_techs[:, ROW])
    want[B0, a] = True
    sim._land_boosts(ROW, want, False)
    assert bool(sim.civ_techs[B0, ROW, a]), "a boost that fills the current item did not complete it"
    assert int(sim.civ_cur_tech[B0, ROW]) == -1 and float(sim.civ_tech_prog[B0, ROW]) == 0.0
    print("  3 completion OK — the filled item completes at once, its pool spent")


def test_no_row_no_boost(sim) -> None:
    p = _idx(sim, "POTTERY")
    sim.civ_techs[B0, ROW, p] = False
    sim.civ_tech_boosted[B0, ROW, p] = False
    want = torch.zeros_like(sim.civ_techs[:, ROW])
    want[B0, p] = True
    newly = sim._land_boosts(ROW, want, False)
    assert not bool(newly[B0, p]) and not bool(sim.civ_tech_boosted[B0, ROW, p]), "Pottery has no Boosts row"
    print("  4 boostless OK — a row the install gives no boost takes none")


def main() -> None:
    path = fixture_paths()[0]
    for t in (test_the_amount, test_parked_and_current, test_fills_and_completes, test_no_row_no_boost):
        t(build(path))
    print("BATTERY OK boost_progress")


if __name__ == "__main__":
    main()
