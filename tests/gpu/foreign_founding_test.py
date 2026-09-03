"""A CITY FOUNDED ON A FOREIGN CONTINENT — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/foreign_founding_test.py

The TS twin is tests/cpu/seats/foreign-founding.test.ts.

CIV6 (Pax Britannica): "All cities founded on a continent other than your
home continent receive a free melee unit." CIV6 (Treasure Fleet): "Cities not
on your original Capital's continent receive ... a builder when founded."
Both fire at the SAME hook, keyed on the founded tile's landmass against the
seat's ORIGINAL capital's (C-48).

No fixture seats Spain or England, so no gate lane reaches either row.
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
ROOT = Path(__file__).resolve().parent.parent.parent
RULES = json.loads((ROOT / "seeder" / "worlds" / "rules.json").read_text())
UNITS = [u["id"] for u in RULES["units"]]


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


def _n_units(sim, row: int) -> int:
    return int((sim.major_unit_alive[B0] & (sim.major_unit_seat[B0] == row)).sum())


def _types(sim, row: int):
    live = sim.major_unit_alive[B0] & (sim.major_unit_seat[B0] == row)
    return [UNITS[int(t)] for t in sim.major_unit_type[B0][live].tolist()]


def _found_off_home(sim, row: int) -> int:
    """Found one city on a landmass that is NOT the row's home, and answer the
    unit count it gained."""
    home = int(sim._home_continent(row)[B0])
    assert home >= 0, "the row never founded, so this lane would prove nothing"
    site = None
    for t in range(sim.T):
        c = int(sim.tile_continent[B0, t])
        if c < 0 or c == home or bool(sim.water[B0, t]) or not bool(sim.passable[B0, t]):
            continue
        if int(sim.tile_seat[B0, t]) >= 0 or int(sim.centre_slot_at[B0, t]) >= 0:
            continue
        if int(sim.district[B0, t]) >= 0:
            continue
        site = t
        break
    assert site is not None, "no free tile on another landmass"
    before = _n_units(sim, row)
    sim._found_city_at(row, torch.tensor([True]), torch.tensor([site]))
    assert int(sim.tile_seat[B0, site]) == row, "the founding did not land"
    return _n_units(sim, row) - before


def test_the_wire(rules, path) -> None:
    sim = build(path)
    rows = [r for r in sim._grant_unit_rows if r[6]]
    assert len(rows) == 2, f"the install names two foreign-continent carriers, wire has {len(rows)}"
    for r in rows:
        # exactly one of the two ways to name what is granted
        assert (r[2] >= 0) != (r[5] >= 0), f"row {r} names both a chassis and a class, or neither"
    print("  1 the wire OK — two carriers, each naming a chassis or a class")


def test_spain_gets_a_builder_abroad(rules, path) -> None:
    sim = build(path)
    _seat(sim, ROW, civ="SPAIN")
    before = _types(sim, ROW)
    gained = _found_off_home(sim, ROW)
    assert gained == 1, f"founding abroad granted {gained} units, expected one Builder"
    after = _types(sim, ROW)
    added = [t for t in after if after.count(t) > before.count(t)]
    assert "BUILDER" in added, f"the granted unit was {added}, not a Builder"
    print("  2 Spain OK — a Builder for a city off the capital's landmass")


def test_victoria_gets_the_best_melee(rules, path) -> None:
    sim = build(path)
    _seat(sim, ROW, leader="VICTORIA")
    pcls = sim.rules.promo_classes.index("MELEE")
    want = int(sim._best_trainable_of_class(ROW, pcls)[B0])
    assert want >= 0, "the seat could train no melee chassis at all"
    before = _n_units(sim, ROW)
    gained = _found_off_home(sim, ROW)
    assert gained == 1, f"founding abroad granted {gained} units, expected one"
    live = sim.major_unit_alive[B0] & (sim.major_unit_seat[B0] == ROW)
    newest = int(sim.major_unit_type[B0][live].tolist()[-1])
    assert newest == want, (
        f"granted {UNITS[newest]}, but the best trainable melee is {UNITS[want]}")
    assert _n_units(sim, ROW) == before + 1
    print("  3 Victoria OK — the strongest melee chassis she could train:", UNITS[want])


def test_home_and_a_plain_seat_get_nothing(rules, path) -> None:
    sim = build(path)
    _seat(sim, ROW, civ="SPAIN")
    home = int(sim._home_continent(ROW)[B0])
    # a second city on the SAME landmass grants nothing
    site = next(t for t in range(sim.T)
                if int(sim.tile_continent[B0, t]) == home
                and int(sim.tile_seat[B0, t]) < 0 and bool(sim.passable[B0, t])
                and not bool(sim.water[B0, t]) and int(sim.centre_slot_at[B0, t]) < 0)
    before = _n_units(sim, ROW)
    sim._found_city_at(ROW, torch.tensor([True]), torch.tensor([site]))
    assert _n_units(sim, ROW) == before, "a home-continent founding granted a unit"

    # ...and a seat the roster does not name gets nothing abroad either
    sim2 = build(path)
    _seat(sim2, ROW, None)
    assert _found_off_home(sim2, ROW) == 0, "a plain seat was granted a unit abroad"
    print("  4 the refusals OK — nothing at home, nothing for a plain seat")


def main() -> int:
    rules = load_rules()
    path = _two_continent_fixture()
    test_the_wire(rules, path)
    test_spain_gets_a_builder_abroad(rules, path)
    test_victoria_gets_the_best_melee(rules, path)
    test_home_and_a_plain_seat_get_nothing(rules, path)
    print("BATTERY OK foreign_founding")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
