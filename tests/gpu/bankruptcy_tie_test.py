"""BANKRUPTCY'S VICTIM IS THE FIRST UNIT WITH UPKEEP IN ROSTER ORDER — the GPU
half.

    python tests/gpu/bankruptcy_tie_test.py

The TS twin is tests/cpu/units/bankruptcy-tie.test.ts.

`_bankruptcy` takes the alive unit of a broke seat (S >= 10) with upkeep in
the LOWEST SLOT — not the priciest (runs/bankrupt_m15_20260926T083048Z.jsonl:
a Crossbowman went before four Musketmen). The lowest slot equals spawn order
only because the pool APPENDS — a fact this lane pins, since the whole
cross-engine agreement rests on it. TS takes spawn order too; the lowest unit
ID would not do, since it is spawn order for a trained unit and not for a
re-seated one (a converted barbarian keeps its barbarian-era id).
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


def build() -> BatchSim:
    return settle_all(BatchSim([load_fixture(fixture_paths()[0])], load_rules(),
                               device="cpu", dtype=torch.float64))


def spawn(sim: BatchSim, type_idx: int) -> int:
    """One unit of `type_idx` for ROW beside its capital; returns the slot."""
    cap = int(sim.civ_cap_tile[B0, ROW])
    nb = sim.neigh[cap]
    spot = next(int(nb[d]) for d in range(6)
                if int(nb[d]) >= 0 and int(sim.military_at[B0, int(nb[d])]) < 0 and not bool(sim.water[B0, int(nb[d])]))
    before = int(sim.unit_next[B0])
    ok = sim._spawn_unit(ROW, torch.tensor([True]), torch.tensor([spot]), torch.tensor([type_idx]))
    assert bool(ok[B0]), "spawn refused"
    return before


def paid_type(sim: BatchSim) -> int:
    upk = sim._unit_upkeep(ROW, torch.arange(sim.NU).unsqueeze(0))[0]
    return next(i for i in range(sim.NU) if float(upk[i]) > 0 and float(sim._type_combat[i]) > 0
                and not bool(sim._type_civilian[i]) and not bool(sim.unit_naval[i]))


def broke(sim: BatchSim) -> None:
    """ROW's turn falls exactly 10 Gold short: one disband."""
    maint = sim._unit_upkeep(ROW, sim.unit_type)
    sim.civ_treasury[B0, ROW] = sim._bankruptcy(
        ROW, torch.tensor([-10.0], dtype=sim.civ_treasury.dtype), torch.tensor([True]), maint)


def clear_row(sim: BatchSim) -> None:
    mine = sim.unit_alive[B0] & (sim.unit_seat[B0] == ROW)
    for s in mine.nonzero().flatten().tolist():
        sim._occ_clear(torch.tensor([B0]), sim.unit_tile[B0, s].reshape(1), torch.tensor([s]))
        sim.unit_alive[B0, s] = False


def test_the_pool_appends(sim) -> tuple[int, int]:
    clear_row(sim)
    t = paid_type(sim)
    a = spawn(sim, t)
    b = spawn(sim, t)
    assert b > a, f"the second spawn took slot {b} <= the first's {a}: the pool does not append"
    assert int(sim.unit_next[B0]) == b + 1, "unit_next did not advance past the last spawn"
    print(f"  1 the pool OK — appends: slots {a} then {b}")
    return a, b


def test_the_earliest_goes(sim, a: int, b: int) -> None:
    broke(sim)
    assert not bool(sim.unit_alive[B0, a]), f"slot {a} (the earliest with upkeep) should have gone"
    assert bool(sim.unit_alive[B0, b]), "the later-spawned unit must survive"
    print(f"  2 the roster order OK — slot {a} went, slot {b} stands")


def test_not_the_priciest(sim) -> None:
    upk_all = sim._unit_upkeep(ROW, torch.arange(sim.NU).unsqueeze(0))[0]
    cheap_t = paid_type(sim)
    dear_t = next((i for i in range(sim.NU) if float(upk_all[i]) > float(upk_all[cheap_t])
                   and float(sim._type_combat[i]) > 0 and not bool(sim.unit_naval[i])), None)
    if dear_t is None:
        print("  3 the price OK — (no pricier land chassis on this catalog; skipped)")
        return
    clear_row(sim)
    a = spawn(sim, cheap_t)
    d = spawn(sim, dear_t)
    broke(sim)
    assert not bool(sim.unit_alive[B0, a]) and bool(sim.unit_alive[B0, d]), \
        "the cheaper unit spawned first did not go first"
    print("  3 the price OK — the earlier, cheaper unit goes before the dearer one")


def main() -> int:
    sim = build()
    a, b = test_the_pool_appends(sim)
    test_the_earliest_goes(sim, a, b)
    test_not_the_priciest(sim)
    print("BATTERY OK bankruptcy_tie")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
