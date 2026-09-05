"""A BANKRUPTCY TIE GOES TO THE EARLIEST-SPAWNED UNIT (A-7r) — the GPU half.

    python tests/gpu/bankruptcy_tie_test.py

The TS twin is tests/cpu/units/bankruptcy-tie.test.ts.

`_bankrupt_disband` takes the priciest alive unit of a broke seat and breaks
a tie to the LOWEST SLOT. That equals spawn order only because the pool
APPENDS — a fact this lane pins, since the whole cross-engine agreement
rests on it. TS used to tie on the lowest unit ID, which is spawn order for
a trained unit and not for a re-seated one (a converted barbarian keeps its
barbarian-era id); it ties on spawn order now, and this side is the oracle.
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


def test_the_pool_appends(sim) -> None:
    t = paid_type(sim)
    a = spawn(sim, t)
    b = spawn(sim, t)
    assert b > a, f"the second spawn took slot {b} <= the first's {a}: the pool does not append"
    assert int(sim.unit_next[B0]) == b + 1, "unit_next did not advance past the last spawn"
    print(f"  1 the pool OK — appends: slots {a} then {b}")
    return a, b


def test_the_tie_goes_to_the_lower_slot(sim, a: int, b: int) -> None:
    upk = sim._unit_upkeep(ROW, sim.unit_type)[B0]
    assert float(upk[a]) == float(upk[b]) > 0, "the two units do not tie on upkeep"
    # every OTHER paid unit of the row must cost no more, or it goes first
    mine = sim.unit_alive[B0] & (sim.unit_seat[B0] == ROW)
    others = [s for s in mine.nonzero().flatten().tolist() if s not in (a, b)]
    for s in others:
        assert float(upk[s]) <= float(upk[a]), f"slot {s} costs more than the pair and would go first"
    lower_others = [s for s in others if float(upk[s]) == float(upk[a]) and s < a]
    victim_expected = min(lower_others) if lower_others else a
    sim.civ_treasury[B0, ROW] = -1000.0
    sim._bankrupt_disband(ROW, torch.tensor([True]))
    assert not bool(sim.unit_alive[B0, victim_expected]), \
        f"slot {victim_expected} (earliest-spawned of the priciest) should have gone"
    assert bool(sim.unit_alive[B0, b]), "the later-spawned unit of the tie must survive"
    print(f"  2 the tie OK — slot {victim_expected} went, slot {b} stands")


def test_the_pricier_goes_first(sim) -> None:
    upk_all = sim._unit_upkeep(ROW, torch.arange(sim.NU).unsqueeze(0))[0]
    cheap_t = paid_type(sim)
    dear_t = next((i for i in range(sim.NU) if float(upk_all[i]) > float(upk_all[cheap_t])
                   and float(sim._type_combat[i]) > 0 and not bool(sim.unit_naval[i])), None)
    if dear_t is None:
        print("  3 the price OK — (no pricier land chassis on this catalog; skipped)")
        return
    mine = sim.unit_alive[B0] & (sim.unit_seat[B0] == ROW)
    for s in mine.nonzero().flatten().tolist():
        sim.unit_alive[B0, s] = False
    a = spawn(sim, cheap_t)
    d = spawn(sim, dear_t)
    sim.civ_treasury[B0, ROW] = -1000.0
    sim._bankrupt_disband(ROW, torch.tensor([True]))
    assert not bool(sim.unit_alive[B0, d]) and bool(sim.unit_alive[B0, a]), \
        "the pricier unit did not go first"
    print("  3 the price OK — the dearer unit goes before any tie")


def main() -> int:
    sim = build()
    a, b = test_the_pool_appends(sim)
    test_the_tie_goes_to_the_lower_slot(sim, a, b)
    test_the_pricier_goes_first(sim)
    print("BATTERY OK bankruptcy_tie")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
