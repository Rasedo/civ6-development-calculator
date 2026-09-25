"""THE GRANTED ABILITIES AS ROWS — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/combat_rows_test.py

The TS twin is tests/cpu/seats/combat-rows.test.ts.

CIV6 (the install's UnitAbilities and their modifiers): a flat Combat
Strength under a clause (`_roster_cs` — Barbarossa vs a city-state's unit,
Tomyris vs the wounded, Genghis Khan's cavalry, Hojo's coasts, the Great
Turkish Bombard on a city, Swift Hawk vs the Free Cities — and the same rows
on the unit a city's strike hits, `_seat_city_strike`), the heal on a kill
(`_heal_on_kill`), embarked Movement (`_roster_embark_mp`) and no shore
penalty (`_ignore_shores`).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from core.simbase import FREE_SEAT
from warmup import settle_all, warm_base

B0 = 0
RULES = json.loads((Path(__file__).resolve().parent.parent.parent
                    / "seeder" / "worlds" / "rules.json").read_text())
UNITS = [u["id"] for u in RULES["units"]]


def play(sim, row: int, name):
    if name is None:
        sim.row_civ[0, row] = -1
        sim.row_leader[0, row] = -1
    else:
        ci = sim._civ_ids.index(name)
        sim.row_civ[0, row] = ci
        sim.row_leader[0, row] = sim._pair_civ.index(ci)
    sim._eff_version += 1
    sim._gen_ver += 1
    sim._bldg_version += 1


# THE WARMED BASE, ONE PER FIXTURE. A scene pays a `restore` — milliseconds —
# instead of a fixture load and a settle. `_STATIC` names the roster planes
# `play` writes that `snapshot`/`restore` does not carry (they are not in
# `_MUTABLE`), so the helper puts them back by hand — the base is already
# seated ROME/EGYPT/NORWAY — and re-bumps exactly the versions `play` bumps.
_STATIC = ("row_civ", "row_leader")


def fresh(rules, path) -> BatchSim:
    def make():
        sim = BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64)
        for r, name in enumerate(("ROME", "EGYPT", "NORWAY")):
            play(sim, r, name)
        sim = settle_all(sim)
        return sim
    return warm_base(str(path), make, _STATIC)


def T(*xs) -> torch.Tensor:
    return torch.tensor(list(xs), dtype=torch.long)


def cs(sim, seat: int, utype: str, tile: int, foe_seat: int, foe_hp, foe_city: bool) -> int:
    hp = None if foe_hp is None else torch.tensor([foe_hp], dtype=sim.unit_hp.dtype)
    return int(sim._roster_cs(T(seat), T(UNITS.index(utype)), T(tile), T(foe_seat), hp, foe_city)[B0])


def a_tile(sim, pred) -> int:
    return int(next(t for t in range(sim.T) if pred(t)))


# ---------------------------------------------------------------------------


def test_wire(rules, path) -> None:
    sim = fresh(rules, path)
    assert len(sim._combat_cs_rows) == 10 and len(sim._post_kill_heal_rows) == 1
    assert len(sim._embark_move_rows) == 2 and len(sim._ignore_shores_rows) == 2
    print("  1 wire OK — 9 + 1 + 2 + 2 rows")


def test_barbarossa_tomyris(rules, path) -> None:
    sim = fresh(rules, path)
    land = a_tile(sim, lambda t: not bool(sim.water[B0, t]) and bool(sim.passable[B0, t]) and not bool(sim.coastal_land[B0, t]))
    play(sim, 0, "GERMANY")
    assert bool(sim._row_leads(0, "BARBAROSSA")[B0])
    assert cs(sim, 0, "WARRIOR", land, 100, 100, False) == 7, "vs a city-state's unit"
    assert cs(sim, 0, "WARRIOR", land, 1, 100, False) == 0, "vs a major's unit"
    assert cs(sim, 0, "WARRIOR", land, 100, None, True) == 7, "vs a city-state's city"
    assert cs(sim, 0, "SETTLER", land, 100, 100, False) == 0, "a civilian has no strength to add to"
    play(sim, 0, "SCYTHIA")
    assert cs(sim, 0, "WARRIOR", land, 1, 100, False) == 0 and cs(sim, 0, "WARRIOR", land, 1, 60, False) == 5, "Tomyris vs the wounded"
    assert cs(sim, 0, "WARRIOR", land, 1, None, True) == 0, "a city is never wounded"
    hp = torch.tensor([40.0], dtype=sim.unit_hp.dtype)
    healed = sim._heal_on_kill(T(0), torch.tensor([True]), hp)
    assert float(healed[B0]) == 70.0, "30 HP after a kill"
    assert float(sim._heal_on_kill(T(0), torch.tensor([False]), hp)[B0]) == 40.0
    play(sim, 0, "AMERICA")
    assert float(sim._heal_on_kill(T(0), torch.tensor([True]), hp)[B0]) == 40.0, "the heal outlived Tomyris"
    print("  2 Barbarossa + Tomyris OK — +7 vs a city-state, +5 vs the wounded, 30 HP on a kill")


def test_genghis_hojo_ottoman(rules, path) -> None:
    sim = fresh(rules, path)
    inland = a_tile(sim, lambda t: not bool(sim.water[B0, t]) and bool(sim.passable[B0, t]) and not bool(sim.coastal_land[B0, t]))
    shore = a_tile(sim, lambda t: bool(sim.coastal_land[B0, t]) and bool(sim.passable[B0, t]))
    coast = a_tile(sim, lambda t: bool(sim.water[B0, t]) and not bool(sim.ocean_tile[B0, t]))
    ocean = a_tile(sim, lambda t: bool(sim.ocean_tile[B0, t]))
    play(sim, 0, "MONGOLIA")
    assert cs(sim, 0, "HORSEMAN", inland, 1, 100, False) == 3 and cs(sim, 0, "WARRIOR", inland, 1, 100, False) == 0, "Genghis Khan's cavalry"
    play(sim, 0, "JAPAN")
    assert cs(sim, 0, "WARRIOR", inland, 1, 100, False) == 0 and cs(sim, 0, "WARRIOR", shore, 1, 100, False) == 5, "Hojo's coastal land"
    assert cs(sim, 0, "GALLEY", coast, 1, 100, False) == 5 and cs(sim, 0, "GALLEY", ocean, 1, 100, False) == 0, "Hojo's shallow water"
    lake = next((t for t in range(sim.T) if int(sim.terrain[B0, t]) == 6), None)  # `TERRAIN_IDS`[6] is LAKE
    if lake is not None:
        assert cs(sim, 0, "GALLEY", lake, 1, 100, False) == 5, "a lake is shallow water"
    play(sim, 0, "OTTOMAN")
    assert cs(sim, 0, "CATAPULT", inland, 1, None, True) == 5 and cs(sim, 0, "CATAPULT", inland, 1, 100, False) == 0, "the Bombard on a city"
    assert cs(sim, 0, "WARRIOR", inland, 1, None, True) == 0, "siege alone"
    print("  3 Genghis Khan + Hojo + the Bombard OK")


def test_embarked(rules, path) -> None:
    sim = fresh(rules, path)
    warrior, settler = UNITS.index("WARRIOR"), UNITS.index("SETTLER")
    play(sim, 0, "MAORI")
    mp = sim._roster_embark_mp(T(0, 0), T(warrior, settler))
    assert mp.tolist() == [2, 2], mp.tolist()
    play(sim, 0, "PHOENICIA")
    mp = sim._roster_embark_mp(T(0, 0), T(warrior, settler))
    assert mp.tolist() == [0, 2], mp.tolist()
    assert sim._ignore_shores(T(0, 0), T(warrior, settler)).tolist() == [False, True]
    play(sim, 0, "NORWAY")
    assert sim._ignore_shores(T(0, 0), T(warrior, settler)).tolist() == [True, True]
    play(sim, 0, "AMERICA")
    assert sim._ignore_shores(T(0), T(warrior)).tolist() == [False]
    assert sim._roster_embark_mp(T(0), T(warrior)).tolist() == [0]
    print("  4 embarked rows OK — Mana's +2, the Colonies' Settlers, the Knarr's shores")


def test_site_census(rules, path) -> None:
    """Every strength composition that names ONE seat-keyed adder names them
    all: a site with `_congress_unit_cs` and no `_roster_cs` is a roster
    clause the other engine pays and this one does not (seed 9248's melee
    assault was exactly that)."""
    import ast

    root = Path(__file__).resolve().parent.parent.parent
    missing = []
    for name in ("gpu/core/sim_seats.py", "gpu/core/sim_phase.py"):
        tree = ast.parse((root / name).read_text(encoding="utf-8"))
        for fn in ast.walk(tree):
            if not isinstance(fn, ast.FunctionDef):
                continue
            calls = {n.func.attr for n in ast.walk(fn)
                     if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute)}
            if "_congress_unit_cs" in calls and "_roster_cs" not in calls:
                missing.append(f"{name}::{fn.name}")
    assert not missing, f"a strength composition without the roster's own: {missing}"
    print(f"  5 site census OK — every `_congress_unit_cs` site carries `_roster_cs`")


def test_swift_hawk(rules, path) -> None:
    """CIV6 (Swift Hawk, OPPONENT_IS_IN_GOLDEN_AGE_FREE_CITY_REQUIREMENTS,
    REQUIREMENTSET_TEST_ANY): +10 against the Free Cities, or a civilization
    in a golden age — never a city-state."""
    sim = fresh(rules, path)
    land = a_tile(sim, lambda t: not bool(sim.water[B0, t]) and bool(sim.passable[B0, t]))
    play(sim, 0, "MAPUCHE")
    assert bool(sim._row_leads(0, "LAUTARO")[B0])
    assert cs(sim, 0, "WARRIOR", land, FREE_SEAT, 100, False) == 10, "vs a Free City's unit"
    assert cs(sim, 0, "WARRIOR", land, FREE_SEAT, None, True) == 10, "vs a Free City"
    sim.civ_age[B0, 1] = 1
    assert cs(sim, 0, "WARRIOR", land, 1, 100, False) == 0, "vs a civilization out of its golden age"
    sim.civ_age[B0, 1] = 2
    assert cs(sim, 0, "WARRIOR", land, 1, 100, False) == 10, "vs a civilization in its golden age"
    assert cs(sim, 0, "WARRIOR", land, 100, 100, False) == 0, "a city-state is neither"
    print("  7 Swift Hawk OK — +10 vs the Free Cities and a golden civilization")


def _strike_def_e(sim, utype: str) -> float:
    """The defender's strength `_seat_city_strike` hands its resolver: row 0's
    first city fires at a lone row-1 `utype` beside its centre, with every
    other unit gone and row 1 the only war."""
    assert bool(sim.city_alive[B0, 0, 0]), "row 0 holds no first city — the scene would prove nothing"
    ctr = int(sim.city_center[B0, 0, 0])
    for _pl in (sim.military_at, sim.civilian_at, sim.embarked_at):
        _pl[:] = -1
    sim.major_unit_alive[:] = False
    sim.barb_unit_alive[:] = False
    sim.war[B0, 0, :] = False
    sim.war[B0, :, 0] = False
    sim.war[B0, 0, 1] = sim.war[B0, 1, 0] = True
    sim.sync_war()
    tt = next(int(t) for t in sim.neigh[ctr].tolist()
              if t >= 0 and bool(sim.passable[B0, t]) and not bool(sim.water[B0, t])
              and int(sim.centre_slot_at[B0, t]) < 0)
    slot = int(sim.unit_next[B0])
    sim.major_unit_alive[B0, slot] = True
    sim.major_unit_seat[B0, slot] = 1
    sim.major_unit_type[B0, slot] = UNITS.index(utype)
    sim.major_unit_tile[B0, slot] = tt
    sim.major_unit_hp[B0, slot] = 100
    sim.major_unit_emb[B0, slot] = False
    sim.major_unit_formation[B0, slot] = 0
    sim.major_unit_levied[B0, slot] = False
    sim.military_at[B0, tt] = slot + sim.POOL_LO["major"]
    sim.unit_next[B0] += 1
    got = []
    sim._city_strike_resolve = lambda *a: got.append(a)
    try:
        sim._seat_city_strike(0, torch.zeros(sim.B, dtype=torch.long),
                              torch.ones(sim.B, dtype=torch.bool), "cstk")
    finally:
        del sim._city_strike_resolve
    assert got, "the city found no target"
    strike, t_hit, d_slot, def_e = got[0][0], got[0][1], got[0][2], got[0][8]
    assert bool(strike[B0]) and int(t_hit[B0]) == tt and int(d_slot[B0]) == slot + sim.POOL_LO["major"]
    return float(def_e[B0])


def test_city_strike_roster(rules, path) -> None:
    """The unit a city's strike hits takes its roster's rows: no row's
    requirement set asks who attacks, and the striking city is its opponent
    — a district (OPPONENT_IS_DISTRICT), of the city's seat, never wounded
    (`cityStrikeDefenderCS`)."""
    def gap(civ: str, utype: str) -> float:
        sim = fresh(rules, path)
        play(sim, 1, civ)
        with_rows = _strike_def_e(sim, utype)
        play(sim, 1, None)
        return with_rows - _strike_def_e(sim, utype)

    assert gap("OTTOMAN", "CATAPULT") == 5, "the Bombard's +5 against the shooting district"
    assert gap("OTTOMAN", "WARRIOR") == 0, "the Bombard is siege alone"
    assert gap("GERMANY", "WARRIOR") == 0, "Barbarossa's +7 is against a city-state's city only"
    assert gap("SCYTHIA", "WARRIOR") == 0, "a city is never wounded"
    print("  8 city strike OK — the struck unit takes its roster's rows")


def test_roosevelt(rules, path) -> None:
    """CIV6 (Roosevelt Corollary): "+5 Combat Strength on their home
    continent" — the ORIGINAL capital's landmass, and nothing off it."""
    sim = fresh(rules, path)
    row = 0
    play(sim, row, "AMERICA")
    assert bool(sim._row_leads(row, "T_ROOSEVELT")[B0])
    cap = int(sim.civ_cap_tile[B0, row])
    assert cap >= 0, "the row never founded, so this lane would prove nothing"
    home = int(sim.tile_continent[B0, cap])
    assert home >= 0
    on = a_tile(sim, lambda t: int(sim.tile_continent[B0, t]) == home
                and bool(sim.passable[B0, t]) and not bool(sim.water[B0, t]))
    off = next((t for t in range(sim.T)
                if int(sim.tile_continent[B0, t]) >= 0
                and int(sim.tile_continent[B0, t]) != home), None)
    assert off is not None, "this fixture has ONE landmass — the lane would prove nothing"
    assert cs(sim, row, "WARRIOR", on, 1, 100, False) == 5, "no bonus at home"
    assert cs(sim, row, "WARRIOR", off, 1, 100, False) == 0, "the bonus followed it abroad"
    # ...and a seat the roster does not name takes nothing anywhere
    play(sim, row, None)
    assert cs(sim, row, "WARRIOR", on, 1, 100, False) == 0, "a plain seat was paid"
    print("  6 Roosevelt OK — +5 on the original capital's landmass, 0 off it")

def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_wire(rules, path)
    test_barbarossa_tomyris(rules, path)
    test_genghis_hojo_ottoman(rules, path)
    test_embarked(rules, path)
    test_site_census(rules, path)
    test_roosevelt(rules, path)
    test_swift_hawk(rules, path)
    test_city_strike_roster(rules, path)
    print("BATTERY OK combat_rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
