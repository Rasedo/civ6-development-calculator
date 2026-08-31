"""THE PASS ON A GREAT PERSON.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/gp_pass_test.py

CIV6 (Great People): a civilization that could claim the standing person may
PASS instead — it sacrifices points equal to 20% of the person's cost, the
cost falls 20% for everyone ELSE, and the passer cannot claim or patronize
THAT individual. Points keep accruing, the lockout ends when someone else
claims, and a person already passed on cannot be passed again.

Proven here:
  * the pass pays 20% of the price from the passer's points, drops the price
    20%, and stamps the passer;
  * only a seat that could claim right now may pass, only while an offer
    stands, and only FIRST — the second passer is refused;
  * the lockout: the passer's race never claims the passed individual, a
    rival's race claims at the discounted price, and the claim lifts the
    lockout for the next person;
  * patronage refuses the passer and serves the rival;
  * the driver's arm never names a class the applier would refuse.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all

B0, ROW = 0, 0


def build(rules, path) -> BatchSim:
    sim = settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64))
    for _ in range(4):
        sim.step()
    return sim


def stand_offer(sim, cls: int = 0, price: float = 60.0) -> None:
    """Put a person on offer by hand — these pokes are about the PASS, not
    about how the draw picked anyone."""
    sim.gp_offer[B0, cls] = 0
    sim.gp_price[B0, cls] = price
    sim.gp_passed_by[B0, cls] = -1


def do_pass(sim, row: int, cls: int) -> None:
    t = torch.full((sim.B,), cls, dtype=torch.long)
    sim.apply_seat_actions(row, gp_pass=t)
    sim._seat_record_apply(row, torch.ones(sim.B, dtype=torch.bool))


def test_the_pass_pays_and_discounts(rules, path) -> None:
    sim = build(rules, path)
    assert sim._gp_nc > 0, "no Great Person classes on the wire"
    stand_offer(sim, 0, 60.0)
    sim.civ_gpp[B0, ROW, 0] = 100.0
    do_pass(sim, ROW, 0)
    assert int(sim.gp_passed_by[B0, 0]) == ROW, "the pass did not stamp the passer"
    assert float(sim.civ_gpp[B0, ROW, 0]) == 100.0 - 60.0 * 0.2, \
        f"the pass cost {100.0 - float(sim.civ_gpp[B0, ROW, 0])}, wanted {60.0 * 0.2}"
    assert float(sim.gp_price[B0, 0]) == 60.0 * 0.8, \
        f"the price is {float(sim.gp_price[B0, 0])}, wanted {60.0 * 0.8}"
    print("  1 pass OK — a fifth of the cost paid, a fifth of the price gone")


def test_only_a_claimant_and_only_first(rules, path) -> None:
    sim = build(rules, path)
    # short of the claim: refused
    stand_offer(sim, 0, 60.0)
    sim.civ_gpp[B0, ROW, 0] = 59.0
    do_pass(sim, ROW, 0)
    assert int(sim.gp_passed_by[B0, 0]) == -1, "a seat short of the claim was allowed to pass"
    assert float(sim.civ_gpp[B0, ROW, 0]) == 59.0, "the refused pass still charged points"
    # no offer standing: refused
    sim.gp_offer[B0, 0] = -1
    sim.civ_gpp[B0, ROW, 0] = 100.0
    do_pass(sim, ROW, 0)
    assert int(sim.gp_passed_by[B0, 0]) == -1, "a pass landed while the redraw was pending"
    # the second passer: refused, and the price falls only once
    stand_offer(sim, 0, 60.0)
    sim.civ_gpp[B0, ROW, 0] = 100.0
    sim.civ_gpp[B0, 1, 0] = 100.0
    do_pass(sim, ROW, 0)
    do_pass(sim, 1, 0)
    assert int(sim.gp_passed_by[B0, 0]) == ROW, "the first passer's stamp moved"
    assert float(sim.gp_price[B0, 0]) == 60.0 * 0.8, "the second passer discounted again"
    assert float(sim.civ_gpp[B0, 1, 0]) == 100.0, "the refused second passer still paid"
    print("  2 gates OK — the claim in hand, an offer standing, and only the first")


def test_the_lockout_and_the_rivals_claim(rules, path) -> None:
    sim = build(rules, path)
    stand_offer(sim, 0, 60.0)
    sim.civ_gpp[B0, ROW, 0] = 100.0
    do_pass(sim, ROW, 0)
    ones = torch.ones(sim.B, dtype=torch.bool)
    # the passer's race: the person still stands, the points wait
    pts0 = float(sim.civ_gpp[B0, ROW, 0])
    sim._advance_great_people(ROW, ones)
    assert int(sim.gp_offer[B0, 0]) == 0, "the passer claimed the individual they passed on"
    assert float(sim.civ_gpp[B0, ROW, 0]) >= pts0, "the locked-out passer lost points"
    # the rival's race: claims at the DISCOUNTED price, and the claim lifts
    # the lockout for the next person
    sim.civ_gpp[B0, 1, 0] = 50.0   # short of 60, past 48
    sim._advance_great_people(1, ones)
    assert int(sim.gp_offer[B0, 0]) != 0, "the rival could not claim at the discounted price"
    assert int(sim.gp_passed_by[B0, 0]) == -1, "the claim did not lift the lockout"
    print("  3 lockout OK — the passer waits, the rival claims at 80%, the stamp clears")


def test_patronage_refuses_the_passer(rules, path) -> None:
    sim = build(rules, path)
    stand_offer(sim, 0, 60.0)
    sim.civ_gpp[B0, ROW, 0] = 100.0
    do_pass(sim, ROW, 0)
    sim.civ_faith[B0, ROW] = 100000.0
    want = torch.zeros(sim.B, dtype=torch.bool)
    want[B0] = True
    cls_t = torch.zeros(sim.B, dtype=torch.long)
    done = sim._patronize(ROW, want, cls_t, gold=False)
    assert not bool(done[B0]), "the passer bought their way back to the individual"
    assert int(sim.gp_offer[B0, 0]) == 0, "the refused patronage still claimed"
    # ...and the RIVAL's patronage is served
    sim.civ_faith[B0, 1] = 100000.0
    done1 = sim._patronize(1, want, cls_t, gold=False)
    assert bool(done1[B0]), "the rival's patronage was refused"
    assert int(sim.gp_passed_by[B0, 0]) == -1, "the patronage claim did not lift the lockout"
    print("  4 patronage OK — the passer is refused, the rival is served")


def test_the_driver_mirrors_the_applier(rules, path) -> None:
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "policy"))
    from drive import _decide_gp_pass
    sim = build(rules, path)
    stand_offer(sim, 0, 60.0)
    sim.civ_gpp[B0, ROW, 0] = 100.0
    picks = []
    for turn in range(60):
        out = _decide_gp_pass(sim, ROW, [42], turn)
        if out is not None and int(out[B0]) >= 0:
            picks.append(int(out[B0]))
    assert picks, "sixty turns of an eligible pass and the driver never took it"
    assert all(p == 0 for p in picks), f"the driver named a class it cannot pass: {sorted(set(picks))}"
    # a passed class leaves the driver's menu too
    sim.gp_passed_by[B0, 0] = 1
    for turn in range(60):
        out = _decide_gp_pass(sim, ROW, [42], turn)
        assert out is None or int(out[B0]) < 0, "the driver named an already-passed individual"
    print(f"  5 driver OK — {len(picks)}/60 passes, all on the offered class, none after the stamp")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_the_pass_pays_and_discounts(rules, path)
    test_only_a_claimant_and_only_first(rules, path)
    test_the_lockout_and_the_rivals_claim(rules, path)
    test_patronage_refuses_the_passer(rules, path)
    test_the_driver_mirrors_the_applier(rules, path)
    print("BATTERY OK gp_pass")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
