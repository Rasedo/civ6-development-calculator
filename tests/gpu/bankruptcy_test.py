"""Bankruptcy self-test: the GPU `_bankrupt_disband(row)` mirrors the TS rule in
`tests/cpu/city/bankruptcy.test.ts` — an insolvent treasury disbands ONE of THAT
SEAT's units per turn, the priciest (tie -> lowest slot = oldest, matching TS's
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


def setup(sim, types, tiles, treasury, seat=0):
    """Wipe EVERY major's roster (they share one window) and plant `seat`'s
    known set at slots 0.. — the merged window appends, so the low slots are
    this seat's oldest units, which is the tie-break TS's lowest id names."""
    sim.major_unit_alive[0, :] = False
    _pl = sim.military_at[0]  # clear only this window's entries
    _pl[(_pl >= sim.POOL_LO["major"]) & (_pl < sim.POOL_HI["major"])] = -1
    _pl = sim.civilian_at[0]  # clear only this window's entries
    _pl[(_pl >= sim.POOL_LO["major"]) & (_pl < sim.POOL_HI["major"])] = -1
    for i, (ty, ti) in enumerate(zip(types, tiles)):
        sim.major_unit_alive[0, i] = True
        sim.major_unit_type[0, i] = ty
        sim.major_unit_tile[0, i] = ti
        sim.major_unit_seat[0, i] = seat  # a slot is nobody's until its seat says so
        sim.military_at[0, ti] = i
    sim.civ_treasury[0, seat] = treasury


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

    # ONE body serves every seat row, so every case runs on seat 0 AND on a civ
    # seat: a rule that only fired for row 0 would be a merge that never landed.
    sim = build(rules, path)
    seats = [0, 1] if sim.R > 0 else [0]
    for seat in seats:
        # 1. Priciest + tie -> lowest slot: two HORSEMEN (slots 0,2) + a SPEARMAN;
        #    slot 0 (oldest horseman) goes, and ONLY one this turn.
        sim = build(rules, path)
        setup(sim, [H, S, H], [100, 101, 102], -4.0, seat)
        sim._bankrupt_disband(seat)
        assert not bool(sim.major_unit_alive[0, 0]), f"seat {seat}: slot 0 (priciest, oldest) should disband"
        assert bool(sim.major_unit_alive[0, 1]) and bool(sim.major_unit_alive[0, 2]), f"seat {seat}: exactly one per turn"
        assert int(sim.military_at[0, 100]) == -1, f"seat {seat}: disbanded unit's occupancy cleared"

        # 2. Solvent -> nothing disbands.
        sim = build(rules, path)
        setup(sim, [H, S], [100, 101], 50.0, seat)
        sim._bankrupt_disband(seat)
        assert bool(sim.major_unit_alive[0, 0]) and bool(sim.major_unit_alive[0, 1]), f"seat {seat}: solvent keeps all"

        # 3. Only free units, deep in the red -> nothing disbands (0-upkeep is never a victim).
        sim = build(rules, path)
        setup(sim, [W, W], [100, 101], -50.0, seat)
        sim._bankrupt_disband(seat)
        assert bool(sim.major_unit_alive[0, 0]) and bool(sim.major_unit_alive[0, 1]), f"seat {seat}: 0-upkeep units are kept"

        # 4. ...and a unit of ANOTHER seat is never the victim, however pricey:
        #    one window holds them all, so the seat filter is the whole guard.
        other = 1 - seat if sim.R > 0 else None
        if other is not None:
            sim = build(rules, path)
            setup(sim, [S], [101], -4.0, seat)
            sim.major_unit_alive[0, 5] = True
            sim.major_unit_type[0, 5] = H  # the priciest unit on the map...
            sim.major_unit_tile[0, 5] = 102
            sim.major_unit_seat[0, 5] = other  # ...but not this seat's
            sim.military_at[0, 102] = 5
            sim._bankrupt_disband(seat)
            assert bool(sim.major_unit_alive[0, 5]), (
                f"seat {seat} disbanded seat {other}'s HORSEMAN — the victim search "
                f"is not filtered by seat"
            )
            assert not bool(sim.major_unit_alive[0, 0]), f"seat {seat}: its own SPEARMAN should have gone"

    print(f"bankruptcy OK on seats {seats} — priciest/tie-lowest-slot/solvent/free/other-seat all match TS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
