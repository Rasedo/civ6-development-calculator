"""BANKRUPTCY — the GPU half of `tests/cpu/city/bankruptcy.test.ts`.

CIV6 (the Gold pedia, GOLD_NEGATIVE_BALANCE_*): "-1 penalty to your Amenities
per every 10 Gold you drop below 0 ... at -10 Gold you will automatically
disband a unit, at -20 two units". Every city loses 0 amenities above 0 gold,
else 1 + floor(-treasury / 10); the seat disbands 0 units above -10 gold, else
1 + floor((-10 - treasury) / 10), the priciest first, a tie to the lowest slot
(the oldest). The gate stays gold-positive, so these pokes hand-set the roster
and the treasury.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/bankruptcy_test.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import load_rules, fixture_paths
from warmup import opened


def build(rules, path):
    return opened(rules, path)


def setup(sim, types, tiles, treasury, seat=0):
    """Wipe EVERY major's roster (they share one window) and plant `seat`'s
    known set at slots 0.. — the merged window appends, so the low slots are
    this seat's oldest units, which is the tie-break TS's spawn order names."""
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
    paths = fixture_paths()
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

    # 1. the counts, on the milli-rounded treasury — the TS test's vectors
    sim = build(rules, path)
    amen = []
    for t in (5, 0.001, 0.0006, 0.0004, 0, -0.5, -9.99, -10, -10.5, -25):
        sim.civ_treasury[0, 0] = t
        amen.append(int(sim._bankrupt_amenities(0)[0]))
    assert amen == [0, 0, 0, 0, 0, 1, 1, 2, 2, 3], amen
    disb = []
    for t in (5, 0, -9.999, -9.9996, -10, -19.99, -20, -35):
        sim.civ_treasury[0, 0] = t
        disb.append(int(sim._bankruptcy_count(0, sim._bk_disband_line, sim._bk_disband_step, True)[0]))
    assert disb == [0, 0, 0, 1, 1, 1, 2, 3], disb

    # ONE body serves every seat row, so every case runs on seat 0 AND on a civ
    # seat: a rule that only fired for row 0 would be a merge that never landed.
    seats = [0, 1] if sim.n_majors > 1 else [0]
    for seat in seats:
        # 2. the count, the priciest first, a tie to the lowest slot, never a
        #    free unit: [horseman A, spearman, horseman B, warrior]
        for treasury, standing in ((-5.0, [True, True, True, True]),
                                   (-10.0, [False, True, True, True]),
                                   (-20.0, [False, True, False, True]),
                                   (-45.0, [False, False, False, True])):
            sim = build(rules, path)
            setup(sim, [H, S, H, W], [100, 101, 102, 103], treasury, seat)
            sim._bankrupt_disband(seat)
            got = [bool(sim.major_unit_alive[0, i]) for i in range(4)]
            assert got == standing, f"seat {seat} treasury {treasury}: {got} != {standing}"
            assert float(sim.civ_treasury[0, seat]) == treasury, "a disband refunds nothing"
            for i, ti in enumerate((100, 101, 102, 103)):
                if not standing[i]:
                    assert int(sim.military_at[0, ti]) == -1, f"seat {seat}: disbanded unit's occupancy cleared"

        # 3. ...and a unit of ANOTHER seat is never the victim, however pricey:
        #    one window holds them all, so the seat filter is the whole guard.
        other = 1 - seat if sim.n_majors > 1 else None
        if other is not None:
            sim = build(rules, path)
            setup(sim, [S], [101], -10.0, seat)
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

    # 4. every city of a seat loses amenities to its treasury: the capital's
    #    tier falls four amenities' worth at -30
    sim = build(rules, path)
    sim.civ_treasury[0, 0] = 100.0
    rich = sim._seat_amenity(0)[0][0].clone()
    sim.civ_treasury[0, 0] = -30.0
    poor = sim._seat_amenity(0)[0][0]
    live = sim.city_alive[0, 0, : sim.RC]
    assert bool((poor[live] > rich[live]).all()), (rich[live].tolist(), poor[live].tolist())
    # ...and the Free Cities row reads its own treasury, a minor its own
    assert sim._treasury_of(sim.FREE_ROW).data_ptr() == sim.free_treasury.data_ptr()
    if sim.S:
        assert sim._treasury_of(sim._CITY_MINOR0).data_ptr() == sim.citystate_treasury[:, 0].data_ptr()
    sim.free_treasury[0] = -15.0
    assert int(sim._bankrupt_amenities(sim.FREE_ROW)[0]) == 2
    assert torch.equal(sim._bankrupt_amenities(0), torch.tensor([4.0], dtype=torch.float64))

    print(f"bankruptcy OK on seats {seats} — the counts, the priciest first, the tie, "
          f"the free unit, the other seat, every city's amenities")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
