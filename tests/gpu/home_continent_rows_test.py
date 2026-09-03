"""THE HOME-CONTINENT ROWS — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/home_continent_rows_test.py

The TS twin is tests/cpu/seats/home-continent-rows.test.ts.

The three clauses that read a city's landmass against its seat's HOME one
(C-48): Spain's district Production off the capital's continent, Victoria's
Trade Route capacity per foreign-continent city, and Phoenicia's 100%-loyal
coastal cities at home. No fixture seats any of the three, so these lanes are
the only evidence any of them fires.
"""

from __future__ import annotations

import json
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


def _two_continent_fixture():
    for p in fixture_paths():
        fx = json.loads(Path(p).read_text(encoding="utf-8"))
        if len({int(t.get("cont", -1)) for t in fx["tiles"]} - {-1}) >= 2:
            return p
    raise AssertionError("no fixture carries two landmasses")


def _seat(sim, row: int, civ=None, leader=None) -> None:
    if civ is None and leader is None:
        sim.row_civ[B0, row] = -1
        sim.row_leader[B0, row] = -1
    elif leader is not None:
        li = sim._leader_idx(leader)
        sim.row_civ[B0, row] = sim._pair_civ[li]
        sim.row_leader[B0, row] = li
    else:
        ci = sim._civ_ids.index(civ)
        sim.row_civ[B0, row] = ci
        sim.row_leader[B0, row] = sim._pair_civ.index(ci)
    sim._eff_version += 1
    sim._gen_ver += 1
    sim._bldg_version += 1


CITY_MIN_DIST = 4    # world/types.ts — every centre keeps this much room


def _found_abroad(sim, row: int) -> int:
    """Found one city on a landmass that is NOT the row's home; answer its tile.
    The site must clear CITY_MIN_DIST of every existing centre, own or not, or
    the founding is refused and the lane measures nothing."""
    home = int(sim._home_continent(row)[B0])
    assert home >= 0
    centres = [int(t) for t in sim.centre_slot_at[B0].nonzero().flatten().tolist()
               if int(sim.centre_slot_at[B0, t]) >= 0]
    site = None
    for t in range(sim.T):
        if int(sim.tile_continent[B0, t]) < 0 or int(sim.tile_continent[B0, t]) == home:
            continue
        if int(sim.tile_seat[B0, t]) >= 0 or bool(sim.water[B0, t]):
            continue
        if not bool(sim.passable[B0, t]) or int(sim.district[B0, t]) >= 0:
            continue
        if any(int(sim.pair_dist[t, c]) < CITY_MIN_DIST for c in centres):
            continue
        site = t
        break
    assert site is not None, "no free, well-spaced tile on another landmass"
    sim._found_city_at(row, torch.tensor([True]), torch.tensor([site]))
    assert int(sim.tile_seat[B0, site]) == row, "the founding did not land"
    return site


def test_the_wire(rules, path) -> None:
    sim = build(path)
    prod = [r for r in sim._prod_mult_rows if r[9]]
    assert len(prod) == 1, f"one off-home production row expected, wire has {len(prod)}"
    assert float(prod[0][5]) == 25.0 and prod[0][7] == 3, "not +25% on EVERY district item"
    cap = [r for r in sim._route_cap_rows if r[7]]
    assert len(cap) == 1 and cap[0][2] == 1, "one capacity row of amount 1 expected"
    assert bool(sim._coastal_home_loyal.any()), "no civilization is coastal-home loyal"
    assert int(sim._coastal_home_loyal.long().sum()) == 1, "more than one claims the clause"
    print("  1 the wire OK — +25% districts, +1 capacity per city, one loyal civ")


def test_spain_production_is_off_home_only(rules, path) -> None:
    sim = build(path)
    _seat(sim, ROW, civ="SPAIN")
    off = ~sim._on_home_continent(ROW, sim.city_center[:, ROW])
    # the row's own gate, read exactly as the queue reads it
    assert not bool(off[B0, 0]), "the FIRST city is off its own home continent"
    site = _found_abroad(sim, ROW)
    off2 = ~sim._on_home_continent(ROW, sim.city_center[:, ROW])
    col = next(j for j in range(sim.RC)
               if bool(sim.city_alive[B0, ROW, j]) and int(sim.city_center[B0, ROW, j]) == site)
    assert bool(off2[B0, col]), "the city founded abroad did not read as off-home"
    assert not bool(off2[B0, 0]), "the capital's own city drifted off-home"
    # ...and RUN the production path at B > 1, which is where the row is
    # actually read. The predicate alone missed a shape fault here, and so
    # did a B=1 run: a full-width [B, RC] read BROADCASTS silently against a
    # [B] one when B is 1, and only reds when the batch is wider (the
    # battery's shard was B=3).
    wide = settle_all(BatchSim([load_fixture(path), load_fixture(path)],
                               load_rules(), device="cpu", dtype=torch.float64))
    assert wide.B > 1, "this lane needs a batch wider than one to mean anything"
    _seat(wide, ROW, civ="SPAIN")
    # a DISTRICT must actually be at the queue head, or the row's own arm
    # never runs and the lane passes without touching it
    for j in (0, 1):
        wide.city_current[:, ROW, j, 0] = wide.DISTRICT_BASE
        wide.city_qtile[:, ROW, j, 0] = wide.city_center[:, ROW, j]
    wide._eff_version += 1
    for j in (0, 1):
        jc = torch.full((wide.B,), j, dtype=torch.long)
        wide._seat_city_produce(ROW, jc, torch.ones(wide.B, dtype=torch.bool),
                                torch.full((wide.B,), 10.0, dtype=wide.dtype))
    print("  2 Spain OK — the gate reads right, and the production path runs",
          "at B =", wide.B)


def test_victoria_capacity_counts_cities_abroad(rules, path) -> None:
    sim = build(path)
    _seat(sim, ROW, leader="VICTORIA")
    base = int(sim._roster_route_capacity(ROW)[B0])
    assert base == 0, f"a seat with every city at home already had {base} capacity"
    _found_abroad(sim, ROW)
    one = int(sim._roster_route_capacity(ROW)[B0])
    assert one == 1, f"one city abroad gave {one} capacity, expected 1"
    _found_abroad(sim, ROW)
    two = int(sim._roster_route_capacity(ROW)[B0])
    assert two == 2, f"two cities abroad gave {two} capacity, expected 2"
    # ...and a seat the roster does not name counts nothing
    _seat(sim, ROW, None)
    assert int(sim._roster_route_capacity(ROW)[B0]) == 0, "a plain seat was paid"
    print("  3 Victoria OK — one per city abroad, nothing for a plain seat")


def test_phoenicia_is_loyal_coastal_at_home(rules, path) -> None:
    sim = build(path)
    _seat(sim, ROW, civ="PHOENICIA")
    ci = int(sim.row_civ[B0, ROW])
    assert bool(sim._coastal_home_loyal[ci]), "Phoenicia does not carry the clause"
    # every other civilization the roster holds does NOT
    others = [c for c in range(len(sim._civ_ids)) if c != ci and bool(sim._coastal_home_loyal[c])]
    assert not others, f"other civilizations claim the clause: {others}"
    # the clause needs BOTH halves: coastal, and the home landmass
    ctr = sim.city_center[:, ROW, 0]
    assert bool(sim._on_home_continent(ROW, ctr)[B0]), "the capital is not on its own landmass"
    site = _found_abroad(sim, ROW)
    away = torch.full((sim.B,), site, dtype=torch.long)
    assert not bool(sim._on_home_continent(ROW, away)[B0]), \
        "a city across the water read as the home continent"
    print("  4 Phoenicia OK — the clause is hers, and needs the home landmass")


def main() -> int:
    rules = load_rules()
    path = _two_continent_fixture()
    test_the_wire(rules, path)
    test_spain_production_is_off_home_only(rules, path)
    test_victoria_capacity_counts_cities_abroad(rules, path)
    test_phoenicia_is_loyal_coastal_at_home(rules, path)
    print("BATTERY OK home_continent_rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
