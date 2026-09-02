"""A UNIT SHORT OF FUEL FIGHTS TWENTY WEAKER.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/fuel_short_test.py

CIV6 (Resource, GS): a fuel unit bills its resource every turn, and when the
bank cannot meet the bill the combat preview shows "-20 Insufficient
<resource>" — GlobalParameters COMBAT_STRENGTH_REDUCTION_INSUFFICIENT_FUEL.
The bill marks the SLOT short at the seat's upkeep pass
(`_seat_charge_upkeep`); `_fuel_short_cs` reads the mark on every strength
read of a unit that draws that slot, and nowhere else.

Proven here:
  * a bank that meets the bill marks nothing, and the term is zero;
  * a bank short of the bill (two Infantry, one Oil) marks Oil short and
    every Oil unit of that seat reads the full 20;
  * a unit that draws no fuel (a Warrior) and another seat's unit read zero;
  * the mark is per slot — a short Oil bank leaves a Coal unit untouched;
  * the next pass with the bill met clears the mark.
"""
from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all

B0 = 0


def build(rules, path) -> BatchSim:
    return settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64))


def type_of(rules, name: str) -> int:
    return next(i for i, u in enumerate(rules.units) if u["id"] == name)


def spawn(sim, row, ty, tile) -> int:
    was = set(sim.major_unit_alive[B0].nonzero().flatten().tolist())
    sim._spawn_unit(row, torch.ones(1, dtype=torch.bool), torch.tensor([tile]), torch.tensor([ty]))
    got = set(sim.major_unit_alive[B0].nonzero().flatten().tolist()) - was
    assert len(got) == 1, "the spawn found no slot"
    sim._gen_ver += 1
    return got.pop()


def free_land(sim, row, n: int) -> list[int]:
    out = [t for t in range(sim.T)
           if int(sim.tile_seat[B0, t]) == row and bool(sim.passable[B0, t]) and not bool(sim.water[B0, t])
           and int(sim.military_at[B0, t]) < 0 and int(sim.civilian_at[B0, t]) < 0]
    assert len(out) >= n, "the seat owns too little free ground"
    return out[:n]


def term(sim, v: int) -> int:
    return int(sim._fuel_short_cs_pool("major", v)[B0])


def main() -> int:
    rules = load_rules()
    sim = build(rules, fixture_paths()[0])
    inf, ironclad, warrior = type_of(rules, "INFANTRY"), type_of(rules, "IRONCLAD"), type_of(rules, "WARRIOR")
    oil, coal = int(sim._type_res_slot[inf]), int(sim._type_res_slot[ironclad])
    assert oil >= 0 and coal >= 0 and oil != coal
    assert int(sim._fuel_short_cs_val) == 20, "the penalty is the game's own 20"
    t0, t1, t2 = free_land(sim, 0, 3)
    a, b, w = spawn(sim, 0, inf, t0), spawn(sim, 0, inf, t1), spawn(sim, 0, warrior, t2)
    other = spawn(sim, 1, inf, free_land(sim, 1, 1)[0])
    rate = int(sim._type_res_upkeep[inf])
    assert rate > 0

    sim.civ_stockpile[B0, 0, oil] = 2 * rate
    sim.civ_stockpile[B0, 1, oil] = 0
    sim._seat_charge_upkeep(0)
    assert int(sim.civ_stockpile[B0, 0, oil]) == 0, "the bill drew the whole bank"
    assert not bool(sim.civ_fuel_short[B0, 0, oil]), "a met bill marked the slot short"
    assert term(sim, a) == 0 and term(sim, b) == 0, "the term fired with the bill met"
    assert term(sim, other) == 0, "seat 1's unit read seat 0's mark before its own pass"

    sim.civ_stockpile[B0, 0, oil] = rate
    sim._seat_charge_upkeep(0)
    assert bool(sim.civ_fuel_short[B0, 0, oil]), "one Oil for two Infantry did not mark the slot"
    assert not bool(sim.civ_fuel_short[B0, 0, coal]), "the Oil shortfall marked Coal"
    assert term(sim, a) == 20 and term(sim, b) == 20, "every Oil unit of the seat reads the 20"
    assert term(sim, w) == 0, "a Warrior read a fuel penalty"
    assert term(sim, other) == 0, "seat 1's unit read seat 0's mark"

    slot_a = torch.tensor([sim.POOL_LO["major"] + a])
    with_short = int(sim._fuel_short_cs(slot_a)[0])
    assert with_short == 20
    sim._seat_charge_upkeep(1)
    assert bool(sim.civ_fuel_short[B0, 1, oil]) and term(sim, other) == 20, "seat 1's empty bank did not mark"

    sim.civ_stockpile[B0, 0, oil] = 50
    sim._seat_charge_upkeep(0)
    assert not bool(sim.civ_fuel_short[B0, 0, oil]), "a met bill did not clear the mark"
    assert term(sim, a) == 0 and term(sim, b) == 0
    print("BATTERY OK fuel_short")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
