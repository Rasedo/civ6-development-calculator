"""SPAIN'S TREASURE FLEET — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/treasure_fleet_test.py

The TS twin is tests/cpu/city/treasure-fleet.test.ts.

CIV6 (Treasure Fleet): "Trade Routes receive +3 Gold, +2 Faith, and +1
Production. Trade Routes between multiple continents receive TRIPLE these
numbers." The install ships the plain row and a second one carrying
`Intercontinental` at DOUBLE, so the two together make the triple — which is
why the intercontinental row ADDS rather than replaces (C-48).

No fixture seats Spain, so no gate lane reaches these rows: this is the only
evidence they are paid, and paid only across a real continent boundary.
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
ROW = 1
PLAIN = {2: 3, 5: 2, 1: 1}   # yield column -> the published plain amount: gold, faith, production


def build(path) -> BatchSim:
    return settle_all(BatchSim([load_fixture(path)], load_rules(),
                               device="cpu", dtype=torch.float64))


def _two_continent_fixture():
    for p in fixture_paths():
        import json
        fx = json.loads(Path(p).read_text(encoding="utf-8"))
        if len({int(t.get("cont", -1)) for t in fx["tiles"]} - {-1}) >= 2:
            return p
    raise AssertionError("no fixture carries two landmasses")


def _seat(sim, row: int, name):
    if name is None:
        sim.row_civ[B0, row] = -1
        sim.row_leader[B0, row] = -1
    else:
        ci = sim._civ_ids.index(name)
        sim.row_civ[B0, row] = ci
        sim.row_leader[B0, row] = sim._pair_civ.index(ci)
    sim._eff_version += 1
    sim._gen_ver += 1
    sim._bldg_version += 1


def test_the_wire(rules, path) -> None:
    """Six rows in each list, the plain three and their doubles."""
    sim = build(path)
    es = sim._civ_ids.index("SPAIN")
    for name, rows in (("international", sim._intl_route_rows),
                       ("domestic", sim._domestic_route_rows)):
        mine = [r for r in rows if r[0] == es]
        assert len(mine) == 6, f"{name}: Spain has {len(mine)} rows, expected 6"
        for ycol, base in PLAIN.items():
            plain = [r for r in mine if r[2] == ycol and not r[4]]
            across = [r for r in mine if r[2] == ycol and r[4]]
            assert len(plain) == 1 and len(across) == 1, f"{name}: yield {ycol}"
            assert float(plain[0][3]) == base, f"{name}: plain {ycol}"
            assert float(across[0][3]) == base * 2, f"{name}: intercontinental {ycol}"
            # the two TOGETHER are the published triple
            assert float(plain[0][3]) + float(across[0][3]) == base * 3
    print("  1 the wire OK — 3/2/1 plain and double again across, both lists")


def _route_to(sim, row: int, dest_seat: int, dest_col: int) -> None:
    """One live international route from the row's first city."""
    sim.seat_routes[B0, row, 0, 0] = int(sim.city_id[B0, row, 0])
    # -1 in the OWN-city field: an international leg is not also a domestic
    # one, and the engine reads the two from different columns
    sim.seat_routes[B0, row, 0, 1] = -1
    sim.seat_route_dseat[B0, row, 0] = dest_seat
    sim.seat_route_dcity[B0, row, 0] = int(sim.city_id[B0, dest_seat, dest_col])
    sim.seat_route_exp[B0, row, 0] = int(sim.turn) + 5
    sim.seat_route_chain[B0, row, 0, :] = -1
    sim._eff_version += 1


def _gold_faith_prod(sim, row: int):
    inc = sim._seat_route_income(row)
    assert inc is not None, "no route income at all"
    return tuple(float(inc[B0, 0, c]) for c in (2, 5, 1))


def test_pays_plain_then_triple(rules, path) -> None:
    """The SAME route, measured with the two cities on one continent and then
    on two: the only thing that moves is the continent of the destination."""
    sim = build(path)
    other = 0 if ROW else 1
    # a destination city of another seat, on a landmass we can choose
    dseat, dcol = other, 0
    assert bool(sim.city_alive[B0, dseat, dcol]), "the other seat never founded"
    _route_to(sim, ROW, dseat, dcol)

    octr = int(sim.city_center[B0, ROW, 0])
    dctr = int(sim.city_center[B0, dseat, dcol])
    home = int(sim.tile_continent[B0, octr])
    assert home >= 0

    _seat(sim, ROW, None)
    sim.tile_continent[B0, dctr] = home          # same landmass
    base_same = _gold_faith_prod(sim, ROW)
    _seat(sim, ROW, "SPAIN")
    spain_same = _gold_faith_prod(sim, ROW)
    got = [spain_same[i] - base_same[i] for i in range(3)]
    assert got == [3.0, 2.0, 1.0], f"a one-continent route paid {got}, expected the plain 3/2/1"

    # ...and now the destination sits on another landmass
    away = next(int(c) for c in sim.tile_continent[B0].tolist() if c >= 0 and c != home)
    sim.tile_continent[B0, dctr] = away
    sim._eff_version += 1
    spain_away = _gold_faith_prod(sim, ROW)
    _seat(sim, ROW, None)
    base_away = _gold_faith_prod(sim, ROW)
    got2 = [spain_away[i] - base_away[i] for i in range(3)]
    assert got2 == [9.0, 6.0, 3.0], f"an intercontinental route paid {got2}, expected the triple"
    print("  2 the payout OK — 3/2/1 within a landmass, 9/6/3 across")


def test_water_is_not_another_continent(rules, path) -> None:
    """A -1 endpoint must NOT read as intercontinental, or every route out of
    an unplaced city would silently pay triple."""
    sim = build(path)
    other = 0 if ROW else 1
    _route_to(sim, ROW, other, 0)
    dctr = int(sim.city_center[B0, other, 0])
    _seat(sim, ROW, "SPAIN")
    sim.tile_continent[B0, dctr] = -1
    sim._eff_version += 1
    with_unknown = _gold_faith_prod(sim, ROW)
    sim.tile_continent[B0, dctr] = int(sim.tile_continent[B0, int(sim.city_center[B0, ROW, 0])])
    sim._eff_version += 1
    same = _gold_faith_prod(sim, ROW)
    assert with_unknown == same, (
        f"an unknown continent paid {with_unknown}, a same-continent route {same} "
        "— water must never make a route intercontinental")
    print("  3 the unknown endpoint OK — -1 is not another landmass")


def main() -> int:
    rules = load_rules()
    path = _two_continent_fixture()
    test_the_wire(rules, path)
    test_pays_plain_then_triple(rules, path)
    test_water_is_not_another_continent(rules, path)
    print("BATTERY OK treasure_fleet")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
