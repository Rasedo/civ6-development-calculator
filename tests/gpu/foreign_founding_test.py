"""A CITY FOUNDED ON A FOREIGN CONTINENT — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/foreign_founding_test.py

The TS twin is tests/cpu/seats/foreign-founding.test.ts.

CIV6 (Pax Britannica): "All cities founded on a continent other than your
home continent receive a free melee unit." CIV6 (Treasure Fleet): "Cities not
on your original Capital's continent receive ... a builder when founded."
Both fire at the SAME hook, keyed on the founded tile's landmass against the
seat's ORIGINAL capital's.

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


# THE WARMED BASE, ONE PER FIXTURE. A scene pays a `restore` — milliseconds —
# instead of a fixture load and a settle. `_STATIC` names the roster planes
# `_seat` writes that `snapshot`/`restore` does not carry (they are not in
# `_MUTABLE`), so the helper puts them back by hand and re-bumps exactly the
# versions a re-seating bumps.
_STATIC = ("row_civ", "row_leader")
_BASE: dict = {}


def build(path) -> BatchSim:
    key = str(path)
    if key not in _BASE:
        sim = settle_all(BatchSim([load_fixture(path)], load_rules(),
                                  device="cpu", dtype=torch.float64))
        _BASE[key] = (sim, sim.snapshot(), {k: getattr(sim, k).clone() for k in _STATIC})
    sim, snap, stat = _BASE[key]
    sim.restore(snap)
    for k, v in stat.items():
        getattr(sim, k).copy_(v)
    sim._eff_version += 1
    sim._gen_ver += 1
    sim._bldg_version += 1
    return sim


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
    made = sim._found_city_at(row, torch.tensor([True]), torch.tensor([site]))
    assert int(sim.tile_seat[B0, site]) == row, "the founding did not land"
    assert _n_units(sim, row) == before, "the founding body itself spawned a unit"
    sim._found_city_grants(row, made, torch.tensor([site]))
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
    made = sim._found_city_at(ROW, torch.tensor([True]), torch.tensor([site]))
    sim._found_city_grants(ROW, made, torch.tensor([site]))
    assert _n_units(sim, ROW) == before, "a home-continent founding granted a unit"

    # ...and a seat the roster does not name gets nothing abroad either
    sim2 = build(path)
    _seat(sim2, ROW, None)
    assert _found_off_home(sim2, ROW) == 0, "a plain seat was granted a unit abroad"
    print("  4 the refusals OK — nothing at home, nothing for a plain seat")


def _place(sim, tile: int, row: int, utype: int) -> int:
    """a unit through the engine's own plane writer; returns the merged slot"""
    slot = int(sim.unit_next[B0])
    sim.major_unit_alive[B0, slot] = True
    sim.major_unit_seat[B0, slot] = row
    sim.major_unit_type[B0, slot] = utype
    sim.major_unit_tile[B0, slot] = tile
    sim.major_unit_hp[B0, slot] = 100
    sim.unit_next[B0] += 1
    g = slot + sim.POOL_LO["major"]
    sim._occ_set(torch.tensor([B0]), torch.tensor([tile]), torch.tensor([g]))
    sim._gen_ver += 1
    return g


def test_the_grant_lands_where_the_settler_stood(rules, path) -> None:
    """THE APPLIER'S ORDER: found, clear the settler, THEN grant. With the
    settler still on the centre and an own civilian on every land
    neighbour, a grant spawned early finds no tile at all; spawned after
    the clear it lands on the centre, where TS puts it (seed 9144 t118)."""
    sim = build(path)
    _seat(sim, ROW, civ="SPAIN")
    home = int(sim._home_continent(ROW)[B0])
    builder = UNITS.index("BUILDER")
    site = None
    for t in range(sim.T):
        c = int(sim.tile_continent[B0, t])
        if c < 0 or c == home or bool(sim.water[B0, t]) or not bool(sim.passable[B0, t]):
            continue
        if int(sim.tile_seat[B0, t]) >= 0 or int(sim.centre_slot_at[B0, t]) >= 0 or int(sim.district[B0, t]) >= 0:
            continue
        if int(sim.military_at[B0, t]) >= 0 or int(sim.civilian_at[B0, t]) >= 0:
            continue
        nbs = [int(n) for n in sim.neigh[t].tolist() if int(n) >= 0]
        if any(int(sim.civilian_at[B0, n]) >= 0 or int(sim.military_at[B0, n]) >= 0 for n in nbs):
            continue
        site = t
        break
    assert site is not None, "no quiet tile on another landmass"
    settler = _place(sim, site, ROW, int(sim._settler_idx))
    ring = [int(n) for n in sim.neigh[site].tolist()
            if int(n) >= 0 and bool(sim.passable[B0, n]) and not bool(sim.water[B0, n])]
    for n in ring:
        _place(sim, n, ROW, builder)
    before = _n_units(sim, ROW)
    made = sim._found_city_at(ROW, torch.tensor([True]), torch.tensor([site]))
    assert bool(made[B0]), "the founding was refused"
    # the applier's two lines between the founding and the grants
    sim._occ_clear(torch.tensor([B0]), torch.tensor([site]), torch.tensor([settler]))
    sim.unit_alive[B0, settler] = False
    sim._found_city_grants(ROW, made, torch.tensor([site]))
    assert _n_units(sim, ROW) == before, f"expected the settler traded for one Builder, got {_n_units(sim, ROW) - before:+d}"
    live = sim.major_unit_alive[B0] & (sim.major_unit_seat[B0] == ROW)
    newest = int(live.nonzero().flatten().tolist()[-1])
    assert int(sim.major_unit_type[B0, newest]) == builder
    assert int(sim.major_unit_tile[B0, newest]) == site, (
        f"the granted Builder stands on {int(sim.major_unit_tile[B0, newest])}, not the centre {site}")
    assert int(sim.civilian_at[B0, site]) == newest + sim.POOL_LO["major"]
    print("  5 the order OK — the grant lands on the centre the settler just left")


def main() -> int:
    rules = load_rules()
    path = _two_continent_fixture()
    test_the_wire(rules, path)
    test_spain_gets_a_builder_abroad(rules, path)
    test_victoria_gets_the_best_melee(rules, path)
    test_home_and_a_plain_seat_get_nothing(rules, path)
    test_the_grant_lands_where_the_settler_stood(rules, path)
    print("BATTERY OK foreign_founding")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
