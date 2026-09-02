"""THE GRANTED ABILITIES AS ROWS — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/combat_rows_test.py

The TS twin is tests/cpu/seats/combat-rows.test.ts.

CIV6 (the install's UnitAbilities and their modifiers): a flat Combat
Strength under a clause (`_roster_cs` — Barbarossa vs a city-state's unit,
Tomyris vs the wounded, Genghis Khan's cavalry, Hojo's coasts, the Great
Turkish Bombard on a city), the heal on a kill (`_heal_on_kill`), embarked
Movement (`_roster_embark_mp`) and no shore penalty (`_ignore_shores`).
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


def fresh(rules, path) -> BatchSim:
    sim = BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64)
    for r, name in enumerate(("ROME", "EGYPT", "NORWAY")):
        play(sim, r, name)
    return settle_all(sim)


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
    assert len(sim._combat_cs_rows) == 6 and len(sim._post_kill_heal_rows) == 1
    assert len(sim._embark_move_rows) == 2 and len(sim._ignore_shores_rows) == 2
    print("  1 wire OK — 6 + 1 + 2 + 2 rows")


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


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_wire(rules, path)
    test_barbarossa_tomyris(rules, path)
    test_genghis_hojo_ottoman(rules, path)
    test_embarked(rules, path)
    print("BATTERY OK combat_rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
