"""A RANGED HIT ON A STACKED HEX GOES TO THE HULL ON A TIE (A-9r) — GPU half.

    python tests/gpu/stack_defender_tie_test.py

The TS twin is tests/cpu/units/stack-defender-tie.test.ts.

`_stack_fold` is `stackDefender`'s twin: against a ranged attack the
passenger defends only when its defence CS is STRICTLY greater than the
hull's, so a tie stays with the hull. TS used to start its comparison from
whichever fighter came first in the tile's array, so a passenger listed
before its hull took a volley the hull took here (seed 9209 t178). This side
is the oracle; the lane pins the tie and the strict case so the two can never
drift apart quietly.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, load_fixture, fixture_paths, FIXTURES
from warmup import settle_all

B0 = 0
ROW = 0       # the stack's owner
ATTACKER = 1  # the seat whose volley the fold resolves
UNI = [u["id"] for u in json.loads((FIXTURES / "rules.json").read_text(encoding="utf-8"))["units"]]


def build() -> BatchSim:
    sim = settle_all(BatchSim([load_fixture(fixture_paths()[0])], load_rules(),
                              device="cpu", dtype=torch.float64))
    sim.war[B0, ROW, ATTACKER] = sim.war[B0, ATTACKER, ROW] = True
    # era index 3: the embarked defence table reads 30 there — a Galley's CS
    ti = int((sim._tech_era == 3).nonzero()[0])
    sim.civ_techs[B0, ROW, ti] = True
    sim._eff_version += 1
    return sim


def water_tile(sim: BatchSim) -> int:
    for x in range(sim.T):
        if bool(sim.wpass[B0, x]) and int(sim.military_at[B0, x]) < 0 and int(sim.embarked_at[B0, x]) < 0:
            return x
    raise AssertionError("no free water tile on the map")


def put(sim: BatchSim, tile: int, kind: str, embarked: bool) -> int:
    """seat one unit of ROW on `tile`; returns its merged slot."""
    slot = int(sim.unit_next[B0])
    sim.unit_next[B0] += 1
    lo = sim.POOL_LO["major"]
    ty = UNI.index(kind)
    sim.major_unit_alive[B0, slot] = True
    sim.major_unit_seat[B0, slot] = ROW
    sim.major_unit_type[B0, slot] = ty
    sim.major_unit_tile[B0, slot] = tile
    sim.major_unit_hp[B0, slot] = 100
    sim.major_unit_mp[B0, slot] = 2
    sim.major_unit_mp_full[B0, slot] = 2
    sim.major_unit_emb[B0, slot] = embarked
    sim.major_unit_formation[B0, slot] = 0
    if embarked:
        sim.embarked_at[B0, tile] = slot + lo
    else:
        sim.military_at[B0, tile] = slot + lo
    sim._gen_ver += 1
    return slot + lo


def fold(sim: BatchSim, tile: int, hull: int, ranged: bool) -> int:
    one = lambda v, dt=torch.long: torch.tensor([v], dtype=dt)
    out = sim._stack_fold(one(tile), one(ATTACKER), one(hull), one(ROW), one(True, torch.bool),
                          one(-1), one(-1), one(False, torch.bool), ranged)
    return int(out[0][B0])


def main() -> int:
    sim = build()
    tile = water_tile(sim)
    # the PASSENGER is seated first, as it was listed first on TS
    pax = put(sim, tile, "WARRIOR", embarked=True)
    hull = put(sim, tile, "GALLEY", embarked=False)
    emb = int(sim._embarked_def_cs(torch.tensor([ROW]))[B0])
    hull_cs = int(sim._type_combat[UNI.index("GALLEY")])
    assert emb == hull_cs == 30, f"the scene must tie at 30: embarked {emb} vs galley {hull_cs}"
    print(f"  1 the scene OK — passenger slot {pax} before hull slot {hull}, both at 30 CS")

    assert fold(sim, tile, hull, ranged=True) == hull, "on a tie the hull must defend the volley"
    print("  2 the tie OK — the hull takes the ranged hit")

    sim.unit_formation[B0, pax] = 2
    assert int(sim._form_cs(torch.tensor([pax]))[B0]) > 0, "the army formation pays no CS on this catalog"
    assert fold(sim, tile, hull, ranged=True) == pax, "a strictly stronger passenger must defend"
    print("  3 the strict case OK — the stronger passenger takes it")

    assert fold(sim, tile, hull, ranged=False) == hull, "a melee hit goes to the hull regardless"
    print("  4 the melee OK — the hull, whatever the strengths")
    print("BATTERY OK stack_defender_tie")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
