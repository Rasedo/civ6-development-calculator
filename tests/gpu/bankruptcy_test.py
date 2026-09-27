"""BANKRUPTCY — the GPU half of `tests/cpu/city/bankruptcy.test.ts`.

On the turn's SHORTFALL (GOLD_NEGATIVE_BALANCE_*, runs/bankrupt_*.jsonl): the
treasury clamps at 0 every turn and S is the whole Gold the balance would have
stood below 0 (`seat_shortfall`). Every city of the seat loses
1 + floor(S / 10) amenities while S > 0, and one unit disbands a turn while
S >= 10 — the first alive unit of the seat with upkeep, the lowest slot. Every
seat alike: a major, a city-state and the Free Cities. The gate stays
gold-positive, so these pokes hand-set the roster and the balance.

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


def setup(sim, types, tiles, seat=0):
    """Wipe EVERY major's roster (they share one window) and plant `seat`'s
    known set at slots 0.. — the merged window appends, so the low slots are
    this seat's oldest units, which is TS's roster order."""
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


def bankrupt(sim, row: int, balance: float) -> float:
    """`_bankruptcy` for major row `row` at `balance`; returns the clamped
    balance."""
    maint = sim._unit_upkeep(row, sim.unit_type)
    out = sim._bankruptcy(row, torch.tensor([balance], dtype=sim.civ_treasury.dtype), torch.tensor([True]), maint)
    return float(out[0])


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

    # 1. the shortfall in whole Gold off the milli-rounded balance, the
    #    amenities it costs — the TS test's vectors
    sim = build(rules, path)
    setup(sim, [], [], 0)
    short, amen = [], []
    for bal in (5, 0, -0.0004, -0.0006, -0.5, -9.3, -10, -12.3, -35):
        assert bankrupt(sim, 0, bal) == max(0.0, bal), bal
        short.append(int(sim.seat_shortfall[0, 0]))
    assert short == [0, 0, 0, 1, 1, 10, 10, 13, 35], short
    for s in (0, 1, 5, 9, 10, 17, 21, 30, 35):
        sim.seat_shortfall[0, 0] = s
        amen.append(int(sim._bankrupt_amenities(0)[0]))
    assert amen == [0, 1, 1, 1, 2, 2, 3, 4, 4], amen

    # ONE body serves every seat row, so every case runs on seat 0 AND on a civ
    # seat: a rule that only fired for row 0 would be a merge that never landed.
    seats = [0, 1] if sim.n_majors > 1 else [0]
    for seat in seats:
        # 2. ONE unit a turn while S >= 10, the first with upkeep in roster
        #    order: [warrior, spearman, horseman A, horseman B]
        for balance, standing in ((-5.0, [True, True, True, True]),
                                  (-10.0, [True, False, True, True]),
                                  (-45.0, [True, False, True, True])):
            sim = build(rules, path)
            setup(sim, [W, S, H, H], [100, 101, 102, 103], seat)
            assert bankrupt(sim, seat, balance) == 0.0, "the treasury clamps at 0"
            got = [bool(sim.major_unit_alive[0, i]) for i in range(4)]
            assert got == standing, f"seat {seat} balance {balance}: {got} != {standing}"
            assert int(sim.seat_shortfall[0, seat]) == int(-balance)
            for i, ti in enumerate((100, 101, 102, 103)):
                if not standing[i]:
                    assert int(sim.military_at[0, ti]) == -1, f"seat {seat}: disbanded unit's occupancy cleared"

        # 3. ...and a unit of ANOTHER seat is never the victim, however early:
        #    one window holds them all, so the seat filter is the whole guard.
        other = 1 - seat if sim.n_majors > 1 else None
        if other is not None:
            sim = build(rules, path)
            setup(sim, [H], [102], other)
            sim.major_unit_alive[0, 5] = True
            sim.major_unit_type[0, 5] = S
            sim.major_unit_tile[0, 5] = 101
            sim.major_unit_seat[0, 5] = seat
            sim.military_at[0, 101] = 5
            bankrupt(sim, seat, -10.0)
            assert bool(sim.major_unit_alive[0, 0]), (
                f"seat {seat} disbanded seat {other}'s HORSEMAN — the victim search "
                f"is not filtered by seat")
            assert not bool(sim.major_unit_alive[0, 5]), f"seat {seat}: its own SPEARMAN should have gone"

    # 4. every city of a seat loses amenities to its last shortfall, not to its
    #    balance: the capital's tier falls four amenities' worth at S 30
    sim = build(rules, path)
    rich = sim._seat_amenity(0)[0][0].clone()
    sim.civ_treasury[0, 0] = -50.0
    assert torch.equal(sim._seat_amenity(0)[0][0], rich), "a balance below 0 alone cost amenities"
    sim.seat_shortfall[0, 0] = 30
    poor = sim._seat_amenity(0)[0][0]
    live = sim.city_alive[0, 0, : sim.RC]
    assert bool((poor[live] > rich[live]).all()), (rich[live].tolist(), poor[live].tolist())
    assert torch.equal(sim._bankrupt_amenities(0), torch.tensor([4.0], dtype=torch.float64))
    # ...and the Free Cities row and a minor's row read their own
    sim.seat_shortfall[0, sim.FREE_ROW] = 15
    assert int(sim._bankrupt_amenities(sim.FREE_ROW)[0]) == 2

    # 5. a city-state meets the same bankruptcy in its economy
    msg = "no minor on this fixture"
    if sim.S and bool(sim.citystate_alive[0, 0]):
        sim = build(rules, path)
        setup(sim, [S] + [H] * 12, list(range(100, 113)), 100)
        sim.citystate_treasury[0, 0] = 0.0
        sim._minor_economy(0)
        assert float(sim.citystate_treasury[0, 0]) == 0.0, "the minor's treasury clamps at 0"
        assert int(sim.seat_shortfall[0, sim._CITY_MINOR0]) >= 10
        assert not bool(sim.major_unit_alive[0, 0]), "the minor's first unit with upkeep should have gone"
        assert int(sim.major_unit_alive[0, 1:13].sum()) == 12
        msg = "a minor disbands its first unit with upkeep"

    print(f"bankruptcy OK on seats {seats} — the shortfall, one unit a turn in roster order, "
          f"the other seat, every city's amenities; {msg}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
