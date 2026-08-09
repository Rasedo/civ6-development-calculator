"""Bankruptcy self-test: the GPU `_bankrupt_disband()` mirrors the TS rule in
`tests/cpu/city/bankruptcy.test.ts` — an insolvent treasury disbands ONE of seat
0's units per turn, the priciest (tie -> lowest slot = oldest, matching TS's
lowest id). The gate stays gold-positive, so this poke hand-sets the unit roster
and treasury and asserts the disband.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/bankruptcy_test.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, FIXTURES


def build(rules, path):
    return BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64)


def setup(sim, types, tiles, treasury):
    """Wipe seat 0's roster and plant a known set at slots 0.. (spawn order)."""
    sim.seat0_unit_alive[0, :] = False
    _pl = sim.military_at[0]  # clear only this pool's entries
    _pl[(_pl >= sim.POOL_LO["seat0"]) & (_pl < sim.POOL_HI["seat0"])] = -1
    _pl = sim.civilian_at[0]  # clear only this pool's entries
    _pl[(_pl >= sim.POOL_LO["seat0"]) & (_pl < sim.POOL_HI["seat0"])] = -1
    for i, (ty, ti) in enumerate(zip(types, tiles)):
        sim.seat0_unit_alive[0, i] = True
        sim.seat0_unit_type[0, i] = ty
        sim.seat0_unit_tile[0, i] = ti
        sim.military_at[0, ti] = i
    sim.treasury[0] = treasury


def main() -> int:
    rules = load_rules()
    # resolve the fixture by POSITION: the lane only needs "some fixture", so a
    # seed-set change cannot break it.
    paths = sorted(FIXTURES.glob("seed*.json"))
    if not paths:
        print("no fixtures — run `npm run seed && npm run export` first")
        return 1
    path = paths[6] if len(paths) > 6 else paths[0]
    ru = rules.units

    def uidx(name):
        return next(i for i, u in enumerate(ru) if u["id"] == name)

    H, S, W = uidx("HORSEMAN"), uidx("SPEARMAN"), uidx("WARRIOR")
    assert ru[H]["maintenance"] == 2 and ru[S]["maintenance"] == 1 and ru[W]["maintenance"] == 0, \
        "test assumes HORSEMAN=2 / SPEARMAN=1 / WARRIOR=0 upkeep"

    # 1. Priciest + tie -> lowest slot: two HORSEMEN (slots 0,2) + a SPEARMAN;
    #    slot 0 (oldest horseman) goes, and ONLY one this turn.
    sim = build(rules, path)
    setup(sim, [H, S, H], [100, 101, 102], -4.0)
    sim._bankrupt_disband()
    assert not bool(sim.seat0_unit_alive[0, 0]), "slot 0 (priciest, oldest) should disband"
    assert bool(sim.seat0_unit_alive[0, 1]) and bool(sim.seat0_unit_alive[0, 2]), "exactly one per turn"
    assert int(sim.pmil_at[0, 100]) == -1, "disbanded unit's occupancy cleared"

    # 2. Solvent -> nothing disbands.
    sim = build(rules, path)
    setup(sim, [H, S], [100, 101], 50.0)
    sim._bankrupt_disband()
    assert bool(sim.seat0_unit_alive[0, 0]) and bool(sim.seat0_unit_alive[0, 1]), "solvent keeps all"

    # 3. Only free units, deep in the red -> nothing disbands (0-upkeep is never a victim).
    sim = build(rules, path)
    setup(sim, [W, W], [100, 101], -50.0)
    sim._bankrupt_disband()
    assert bool(sim.seat0_unit_alive[0, 0]) and bool(sim.seat0_unit_alive[0, 1]), "0-upkeep units are kept"

    print("bankruptcy OK — priciest/tie-lowest-slot/solvent/free all match TS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
