"""THE EIGHT NAMED STORMS (C-49) — the GPU half.

    python tests/gpu/storms_test.py

The TS twin is tests/cpu/map/storms.test.ts.

CIV6 (`Expansion2_RandomEvents.xml`): a storm's FAMILY is the terrain it
starts on, each family has two severities, each severity its own footprint,
frequency, damage columns and unit band; a storm PERSISTS three turns. The
roster's eight rows: Divine Wind (Hojo) waives hurricane damage to Japan's
units and doubles it for enemies on Japanese ground; Mother Russia the same
over blizzards.

  1. the wire: eight rows in table order, the canonical disc, one start list
     per family off the `sf` plane (ocean = hurricane, grass = tornado)
  2. a storm tile draws ELEVEN times whatever stands there; a footprint is its
     first `hexes` disc slots (1 / 3 / 7 / 19 tiles' worth of draws)
  3. a CAT_5 hurricane hits a hull for 60-80 and a land unit for 40-60;
     CAT_4 spares land; the milder severities spare every unit
  4. PREVENTION: Japan's units take nothing from a hurricane, still 40-60
     from a blizzard; Russia the mirror
  5. DOUBLE: an enemy on Japanese ground takes +100% (80-120 on 100 HP);
     off it, or at peace, the plain band
  6. persistence: a live storm counts down 3 -> 0 through `_disaster_phase`
     and clears its event at 0
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

ROW = 0   # the carrier's seat
FOE = 1   # a seat at war with it
STEP = 0x6D2B79F5
M32 = 0xFFFFFFFF
UNI = [u["id"] for u in json.loads((FIXTURES / "rules.json").read_text(encoding="utf-8"))["units"]]


def play(sim, row: int, name) -> None:
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


def fresh(rules) -> BatchSim:
    sim = settle_all(BatchSim([load_fixture(fixture_paths()[0])], rules, device="cpu", dtype=torch.float64))
    sim.war[0, ROW, FOE] = sim.war[0, FOE, ROW] = True
    return sim


def put(sim, row: int, tile: int, kind: str, hp: int = 100) -> int:
    """seat a unit of `kind` on `tile` and return its merged slot."""
    slot = int(sim.unit_next[0])
    sim.unit_next[0] += 1
    lo = sim.POOL_LO["major"]
    ty = UNI.index(kind)
    sim.major_unit_alive[0, slot] = True
    sim.major_unit_seat[0, slot] = row
    sim.major_unit_type[0, slot] = ty
    sim.major_unit_tile[0, slot] = tile
    sim.major_unit_hp[0, slot] = hp
    sim.major_unit_mp[0, slot] = 2
    sim.major_unit_mp_full[0, slot] = 2
    sim.major_unit_attacks[0, slot] = 1
    plane = sim.civilian_at if bool(sim._type_civilian[ty]) else sim.military_at
    plane[0, tile] = slot + lo
    sim._gen_ver += 1
    return slot + lo


def drop(sim, slot_merged: int) -> None:
    lo = sim.POOL_LO["major"]
    s = slot_merged - lo
    if bool(sim.major_unit_alive[0, s]):
        sim.major_unit_alive[0, s] = False
        sim._vacate("major", torch.tensor([0]), torch.tensor([s]))


def free_tile(sim, want_water: bool) -> int:
    for t in range(sim.T):
        if bool(sim.water[0, t]) != want_water:
            continue
        if want_water and not bool(sim.ocean_tile[0, t]):
            continue
        if not want_water and (not bool(sim.passable[0, t]) or bool(sim.wpass[0, t])):
            continue
        if int(sim.military_at[0, t]) >= 0 or int(sim.civilian_at[0, t]) >= 0 or int(sim.embarked_at[0, t]) >= 0:
            continue
        if int(sim.tile_seat[0, t]) >= 0 or int(sim.tile_lowland[0, t]) > 0:
            continue
        return t
    raise AssertionError("no free tile of that kind")


def draws(s0: int, s1: int, cap: int = 200) -> int:
    for k in range(cap + 1):
        if (s0 + k * STEP) & M32 == s1 & M32:
            return k
    raise AssertionError(f"the stream moved by more than {cap} draws")


def band(sim, tile: int, ev: int, kind: str, seat: int, n: int = 300) -> set[int]:
    """run `_storm_tile` n times with a fresh unit each time; the damages seen (100 = died)."""
    hit = torch.tensor([True])
    evt = torch.tensor([ev])
    strip = torch.tensor([False])
    seen: set[int] = set()
    # ONE slot, re-armed each round — the pool is finite
    slot = put(sim, seat, tile, kind)
    s = slot - sim.POOL_LO["major"]
    plane = sim.civilian_at if bool(sim._type_civilian[UNI.index(kind)]) else sim.military_at
    for _ in range(n):
        sim.major_unit_alive[0, s] = True
        sim.major_unit_hp[0, s] = 100
        plane[0, tile] = slot
        sim._storm_tile(hit, torch.tensor([tile]), evt, strip)
        seen.add(100 - int(sim.major_unit_hp[0, s]) if bool(sim.major_unit_alive[0, s]) else 100)
    drop(sim, slot)
    plane[0, tile] = -1
    return seen


def main() -> int:
    rules = load_rules()
    sim = fresh(rules)
    ids = sim._st_ids
    assert ids == ["BLIZZARD_SIGNIFICANT", "BLIZZARD_CRIPPLING", "DUST_STORM_GRADIENT", "DUST_STORM_HABOOB",
                   "TORNADO_FAMILY", "TORNADO_OUTBREAK", "HURRICANE_CAT_4", "HURRICANE_CAT_5"], ids
    assert sim._st_hexes.tolist() == [7, 19, 3, 7, 1, 3, 7, 19]
    assert [round(c * 500) for c in sim._st_chance] == [8, 2, 8, 2, 15, 3, 15, 3]
    assert sim._st_pairs == [(0, 1), (2, 3), (4, 5), (6, 7)]
    offs = sim._storm_offs.tolist()
    assert len(offs) == 19 and offs[0] == [0, 0]
    ring = [max(abs(q), abs(r), abs(q + r)) for q, r in offs]
    assert ring == [0] + [1] * 6 + [2] * 12, ring
    assert len(sim._storm_lists) == 4
    fam = sim.storm_fam[0]
    assert bool(((fam == 3) == sim.ocean_tile[0]).all()), "a hurricane starts on the OCEAN terrain alone"
    assert not bool((fam[sim.water[0] & ~sim.ocean_tile[0]] >= 0).any()), "shallow water hosts no storm"
    assert bool((fam[~sim.water[0]] >= 0).any()), "land hosts the other three"
    assert len(sim._storm_unit_rows) == 8
    print("  1 the wire OK — eight rows, the canonical disc, one start list per family")

    CAT4, CAT5 = ids.index("HURRICANE_CAT_4"), ids.index("HURRICANE_CAT_5")
    BLZ1, BLZ2 = ids.index("BLIZZARD_SIGNIFICANT"), ids.index("BLIZZARD_CRIPPLING")
    TOR1, TOR2 = ids.index("TORNADO_FAMILY"), ids.index("TORNADO_OUTBREAK")

    land = free_tile(sim, False)
    hit = torch.tensor([True])
    s0 = int(sim.rng_state[0])
    sim._storm_tile(hit, torch.tensor([land]), torch.tensor([TOR1]), torch.tensor([False]))
    # improvement, destroy, district, BUILDING, population, civilian, land,
    # naval, one HP band, and the two fertility yields
    assert draws(s0, int(sim.rng_state[0])) == 11, "a storm tile draws ELEVEN times"
    put(sim, FOE, land, "WARRIOR")
    s0 = int(sim.rng_state[0])
    sim._storm_tile(hit, torch.tensor([land]), torch.tensor([TOR1]), torch.tensor([False]))
    assert draws(s0, int(sim.rng_state[0])) == 11, "...whatever stands there"
    drop(sim, int(sim.military_at[0, land]))
    # a footprint is the first `hexes` slots of the disc: 1 / 3 / 7 / 19 tiles' draws
    centre = None
    from core.simbase import tiles_from_offsets
    for t in range(sim.T):
        if bool((tiles_from_offsets(torch.tensor([t]), sim._storm_offs, sim.W, sim.H) >= 0).all()):
            centre = t
            break
    assert centre is not None
    for ev, n in ((TOR1, 1), (TOR2, 3), (CAT4, 7), (CAT5, 19)):
        sim.storm_event[0, centre] = ev
        s0 = int(sim.rng_state[0])
        sim._storm_turn(hit, torch.tensor([centre]), torch.tensor([False]))
        assert draws(s0, int(sim.rng_state[0]), 260) == 11 * n, f"{ids[ev]} footprint"
    sim.storm_event[0, centre] = -1
    print("  2 the draws OK — ten per tile, a footprint of 1 / 3 / 7 / 19 tiles")

    sea = free_tile(sim, True)
    naval = band(sim, sea, CAT5, "GALLEY", FOE)
    assert naval and all(60 <= d <= 80 for d in naval), f"CAT_5 naval band {sorted(naval)}"
    foot = band(sim, land, CAT5, "WARRIOR", FOE)
    assert len(foot) > 3 and all(40 <= d <= 60 for d in foot), f"CAT_5 land band {sorted(foot)}"
    assert band(sim, land, CAT4, "WARRIOR", FOE) == {0}, "CAT_4 has no land row"
    for ev in (BLZ1, TOR1, ids.index("DUST_STORM_GRADIENT")):
        assert band(sim, land, ev, "WARRIOR", FOE, 150) == {0}, f"{ids[ev]} damages nobody"
    assert all(40 <= d <= 60 for d in band(sim, land, BLZ2, "WARRIOR", FOE)), "the common band"
    print("  3 the bands OK — CAT_5 60-80 at sea and 40-60 ashore, CAT_4 spares land, the mild rows spare all")

    play(sim, ROW, "JAPAN")
    assert band(sim, land, CAT5, "WARRIOR", ROW) == {0}, "Divine Wind: no hurricane damage"
    assert band(sim, land, CAT4, "WARRIOR", ROW) == {0}
    assert all(40 <= d <= 60 for d in band(sim, land, BLZ2, "WARRIOR", ROW)), "a blizzard is not Hojo's row"
    play(sim, ROW, "RUSSIA")
    assert band(sim, land, BLZ2, "WARRIOR", ROW) == {0}, "Mother Russia: no blizzard damage"
    assert band(sim, land, BLZ2, "SETTLER", ROW) == {0}, "...nor a civilian killed"
    assert all(40 <= d <= 60 for d in band(sim, land, CAT5, "WARRIOR", ROW)), "a hurricane is not Russia's row"
    print("  4 PREVENTION OK — the carrier's units take nothing from its event, and only from it")

    play(sim, ROW, "JAPAN")
    sim.tile_seat[0, land] = ROW
    sim._eff_version += 1
    doubled = band(sim, land, CAT5, "WARRIOR", FOE)
    assert doubled and all(d >= 80 for d in doubled) and 100 in doubled, f"doubled band {sorted(doubled)}"
    sim.war[0, ROW, FOE] = sim.war[0, FOE, ROW] = False
    assert all(40 <= d <= 60 for d in band(sim, land, CAT5, "WARRIOR", FOE)), "at peace: the plain band"
    sim.war[0, ROW, FOE] = sim.war[0, FOE, ROW] = True
    play(sim, ROW, None)
    assert all(40 <= d <= 60 for d in band(sim, land, CAT5, "WARRIOR", FOE)), "a non-carrier's ground doubles nothing"
    sim.tile_seat[0, land] = -1
    print("  5 DOUBLE OK — +100% for an enemy on the carrier's ground, the plain band off it or at peace")

    sim2 = fresh(rules)
    sim2.disasters = True
    c = free_tile(sim2, False)
    sim2.storm_event[0, c] = TOR1
    sim2.storm_left[0, c] = 3
    lefts = []
    for _ in range(3):
        sim2._disaster_phase()
        lefts.append(int(sim2.storm_left[0, c]))
    assert lefts == [2, 1, 0], lefts
    assert int(sim2.storm_event[0, c]) == -1, "an expired storm clears its event"
    print("  6 persistence OK — a live storm counts down 3 -> 0 and clears at 0")
    # a natural wonder keeps its row: silt that lands on one pays nothing,
    # food or production (tileYields early-returns above the fertility lines)
    sim3 = fresh(rules)
    nw = sim3.nwonder[0].nonzero().flatten()
    if nw.numel():
        w = int(nw[0])
        sim3.fertility[0, w] = 2
        sim3.fertility_prod[0, w] = 1
        sim3._eff_version += 1
        assert float(sim3._neutral_prod()[0, w]) == float(sim3.tile_yields[0, w, 1]), 'silt paid production on a natural wonder'
        assert float(sim3._eff_food()[0, w]) == float(sim3.tile_yields[0, w, 0]), 'silt paid food on a natural wonder'
        print('  7 natural wonder OK — silt on it pays neither food nor production')
    else:
        print('  7 natural wonder — the fixture holds none; no scene')
    print("BATTERY OK storms")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
