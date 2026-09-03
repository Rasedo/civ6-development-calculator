"""THE CITY'S ROSTER ROWS — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/city_rows_test.py

The TS twin is tests/cpu/seats/city-rows.test.ts.

CIV6 (the install's TraitModifiers): the centre's terrain adjacency (Songs
of the Jeli), the per-work yields and the Great Person factor (Nkisi), the
powered building's extra yield, strategic accumulation and its ceiling,
build charges (Workshop of the World), the tile price and the Farm's
ground (The Last Best West), the route's per-improvement yields (Favorable
Terms), the granted units and spy capacity, and the first city (Kupe).
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
BLDGS = [b["id"] for b in RULES["buildings"]]
TECHS = [t["id"] for t in RULES["techs"]]
IMPS = RULES["improvements"]["ids"]


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


def bare(rules, path) -> BatchSim:
    """Unsettled, so a founding clause can be measured at its own moment."""
    sim = BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64)
    for r in range(sim.n_majors):
        play(sim, r, None)
    return sim


def T(*xs) -> torch.Tensor:
    return torch.tensor(list(xs), dtype=torch.long)


# ---------------------------------------------------------------------------


def test_wire(rules, path) -> None:
    sim = fresh(rules, path)
    assert len(sim._center_adj_rows) == 2 and len(sim._great_work_yield_rows) == 8
    assert len(sim._gpp_class_rows) == 3 and len(sim._powered_yield_rows) == 5
    assert len(sim._stockpile_rate_rows) == 4 and len(sim._stockpile_cap_rows) == 3
    # the charge family grew with Qin's Builder, Philip's Inquisitor and
    # Dharma's Missionary — a census pin is a count, so it moves with them
    assert len(sim._unit_charge_rows) == 4 and len(sim._tile_cost_rows) == 2
    assert len(sim._farm_terrain_rows) == 2 and len(sim._route_improvement_rows) == 4
    # the TECH-keyed grant rows, not the list's length: the family also
    # carries founding grants now (`foreignContinent`)
    assert sum(1 for r in sim._grant_unit_rows if r[3] >= 0) == 2
    assert len(sim._spy_capacity_rows) == 1
    assert len(sim._capital_rows) == 1
    print("  1 wire OK — the city's thirteen row families")


def test_district_production(rules, path) -> None:
    """A district queue code is a SCAFFOLD slot, not a district index: the row
    names the district, so only that district's own slot may pay."""
    sim = fresh(rules, path)
    dcat = [d["id"] for d in sim.districts_cat]

    def slot_of(name: str) -> int:
        di = dcat.index(name)
        return next(si for si, p in enumerate(sim._scaffold) if p[0] == di)

    def produce(name, district: str) -> float:
        s2 = fresh(rules, path)
        play(s2, 0, name)
        s2.city_current[B0, 0, 0, 0] = s2.DISTRICT_BASE + slot_of(district)
        s2.city_qtile[B0, 0, 0, 0] = int(s2.city_center[B0, 0, 0])
        s2.city_progress[B0, 0, 0, 0] = 0
        s2.city_cost[B0, 0, 0, 0] = 100000
        s2._eff_version += 1
        s2._seat_city_produce(0, torch.tensor([0]), torch.tensor([True]),
                              torch.tensor([20.0], dtype=torch.float64))
        return float(s2.city_progress[B0, 0, 0, 0])

    base = produce("ROME", "DAM")
    assert base > 0
    assert abs(produce("NETHERLANDS", "DAM") - base * 1.5) < 1e-9, "Grote Rivieren's Dam"
    assert abs(produce("NETHERLANDS", "PRESERVE") - produce("ROME", "PRESERVE")) < 1e-9, "the Dam row paid a Preserve"
    assert abs(produce("JAPAN", "HOLY_SITE") - produce("ROME", "HOLY_SITE") * 2.0) < 1e-9, "Divine Wind's half time"
    assert abs(produce("JAPAN", "CAMPUS") - produce("ROME", "CAMPUS")) < 1e-9, "Divine Wind paid a Campus"
    print("  2 district production OK — the Dam, the three of Divine Wind, and nothing else")


def test_powered_and_gpp(rules, path) -> None:
    sim = fresh(rules, path)
    play(sim, 0, "ENGLAND")
    add = sim._powered_add(0)
    assert add is not None and float(add[B0, 3]) == 4.0 and float(add[B0, 2]) == 4.0
    play(sim, 0, "ROME")
    assert sim._powered_add(0) is None or float(sim._powered_add(0)[B0].abs().sum()) == 0.0
    play(sim, 0, "KONGO")
    artist = next(i for i, r in enumerate(sim._gpp_class_rows) if r[2] >= 0)
    cls = sim._gpp_class_rows[artist][2]
    assert abs(float(sim._gpp_class_mult(0, cls)[B0]) - 1.5) < 1e-12
    other = next(c for c in range(sim.civ_gpp.shape[2]) if c not in {r[2] for r in sim._gpp_class_rows})
    assert float(sim._gpp_class_mult(0, other)[B0]) == 1.0
    play(sim, 0, "ROME")
    assert float(sim._gpp_class_mult(0, cls)[B0]) == 1.0
    print("  2 powered yields + the Great Person factor OK")


def test_stockpile_and_charges(rules, path) -> None:
    sim = fresh(rules, path)
    play(sim, 0, "ENGLAND")
    base = int(sim._stockpile_cap(0)[B0])
    sim.city_bldg[B0, 0, 0, BLDGS.index("LIGHTHOUSE")] = True
    assert int(sim._stockpile_cap(0)[B0]) == base + 10, "Workshop of the World's ceiling"
    sim.city_bldg[B0, 0, 0, BLDGS.index("SEAPORT")] = True
    assert int(sim._stockpile_cap(0)[B0]) == base + 20
    play(sim, 0, "ROME")
    assert int(sim._stockpile_cap(0)[B0]) == base, "the ceiling outlived England"
    me = UNITS.index("MILITARY_ENGINEER")
    play(sim, 0, "ENGLAND")
    assert int(sim._extra_charges(0, T(me))[B0]) == 2
    assert int(sim._extra_charges(0, T(UNITS.index("BUILDER")))[B0]) == 0
    play(sim, 0, "ROME")
    assert int(sim._extra_charges(0, T(me))[B0]) == 0
    print("  3 stockpile ceiling + build charges OK")


def test_stockpile_rate(rules, path) -> None:
    """Each resource row of `STOCKPILE_RATE_ROWS`, on a mine of its own kind."""
    def bank_of(name, rid: int) -> int:
        sim = fresh(rules, path)
        play(sim, 0, name)
        k = next(i for i, r in enumerate(sim._strat_rid) if int(r) == rid)
        mine = IMPS.index("MINE")
        t = next(t for t in range(sim.T)
                 if int(sim.tile_seat[B0, t]) == 0 and not bool(sim.water[B0, t]))
        sim.res_id[B0, t] = rid
        sim.res_imp[B0, t] = mine
        sim.improvement[B0, t] = mine
        sim.pillaged[B0, t] = False
        sim.civ_stockpile[B0, 0, :] = 0
        sim._seat_accrue_stockpile(0)
        return int(sim.civ_stockpile[B0, 0, k])

    sim = fresh(rules, path)
    rows = [r for r in sim._stockpile_rate_rows if r[2] >= 0]
    assert rows, "no resource rate row on the wire"
    for _sc, _sl, rid, _st, amt, _pct in rows:
        assert bank_of("ENGLAND", rid) == bank_of("ROME", rid) + amt, f"resource {rid} accumulates {amt} more"
    print(f"  4 accumulation rows OK — {len(rows)} resources at +2 per mine")


def test_tile_price(rules, path) -> None:
    sim = fresh(rules, path)
    tundra = next((t for t in range(sim.T) if int(sim.terrain[B0, t]) == 3), None)
    if tundra is None:
        print("  5 tile price SKIPPED — this fixture holds no Tundra")
        return
    ctr = sim.city_center[B0, 0, 0].reshape(1)
    tgt = torch.tensor([tundra], dtype=torch.long)
    play(sim, 0, "ROME")
    plain = float(sim._seat_tile_price(0, ctr, tgt)[B0])
    play(sim, 0, "CANADA")
    assert abs(float(sim._seat_tile_price(0, ctr, tgt)[B0]) - round(plain * 0.5)) < 1e-9, "The Last Best West"
    print("  5 tile price OK — half on the tundra")


def build_at(sim, t: int, k: int, row: int = 0) -> bool:
    """Spawn a Builder ON tile `t` and issue BUILD_<k> over the real order
    path (the geothermal lane's helper). Did the improvement land?"""
    slot = int(sim.unit_next[B0])
    sim._spawn_unit(row, torch.ones(sim.B, dtype=torch.bool),
                    torch.full((sim.B,), int(sim.city_center[B0, row, 0]), dtype=torch.long),
                    sim._builder_idx)
    old_t = int(sim.unit_tile[B0, slot])
    rows = torch.tensor([B0])
    sim._occ_clear(rows, torch.tensor([old_t]), torch.tensor([slot]))
    sim.unit_tile[B0, slot] = t
    sim._occ_set(rows, torch.tensor([t]), torch.tensor([slot]))
    sim.unit_mp[B0, slot] = sim._mp_scale
    smap = sim._seat_slot_map(row)
    rank = int((smap[B0] == slot).nonzero()[0])
    act = torch.full(smap.shape, -1, dtype=torch.long)
    act[B0, rank] = sim._A_IMP[k]
    sim._apply_seat_unit_actions(row, act)
    return int(sim.improvement[B0, t]) == k


def tundra_plot(sim, hills: bool) -> int | None:
    """An owned, empty land tile made Tundra — the row's own ground."""
    t = next((t for t in range(sim.T)
              if int(sim.tile_seat[B0, t]) == 0 and not bool(sim.water[B0, t])
              and bool(sim.passable[B0, t]) and int(sim.improvement[B0, t]) < 0
              and int(sim.district[B0, t]) < 0 and int(sim.centre_slot_at[B0, t]) < 0
              and int(sim.built_wonder[B0, t]) < 0), None)
    if t is None:
        return None
    sim.terrain[B0, t] = 3  # `TERRAIN_IDS`[3] is TUNDRA
    sim.hills[B0, t] = hills
    sim.feat_id[B0, t] = -1
    sim.res_id[B0, t] = -1
    sim.res_cat[B0, t] = 0
    sim.farm_flat[B0, t] = False
    sim.farm_hill[B0, t] = False
    sim._eff_version += 1
    return t


def test_farm_ground(rules, path) -> None:
    farm = IMPS.index("FARM")
    civil = next((i for i, c in enumerate(RULES["civics"]) if c["id"] == "CIVIL_ENGINEERING"), -1)

    def farms(name, hills: bool, civic: bool) -> bool:
        sim = fresh(rules, path)
        play(sim, 0, name)
        for tname in ("POTTERY", "IRRIGATION"):
            sim.civ_techs[B0, 0, TECHS.index(tname)] = True
        if civic and civil >= 0:
            sim.civ_civics[B0, 0, civil] = True
        sim._eff_version += 1
        t = tundra_plot(sim, hills)
        assert t is not None, "no owned empty land tile"
        return build_at(sim, t, farm)

    assert farms("CANADA", False, False), "The Last Best West did not farm the Tundra"
    assert not farms("ROME", False, False), "a plain seat farmed the Tundra"
    assert not farms("CANADA", True, False), "Tundra Hills before Civil Engineering"
    assert farms("CANADA", True, True), "Tundra Hills at Civil Engineering"
    print("  6 farm ground OK — Tundra, and its hills at Civil Engineering")


def test_grants_and_capital(rules, path) -> None:
    sim = bare(rules, path)
    play(sim, 0, "MAORI")
    n0 = int(sim.unit_next[B0])
    settle_all(sim)
    assert int(sim.city_pop[B0, 0, 0]) == 2, "Kupe's first city starts at 2 Population"
    builder = UNITS.index("BUILDER")
    made = [s for s in range(n0, int(sim.unit_next[B0]))
            if bool(sim.unit_alive[B0, s]) and int(sim.unit_type[B0, s]) == builder
            and int(sim.unit_seat[B0, s]) == 0]
    assert len(made) == 1, "Kupe's free Builder"
    plain = bare(rules, path)
    play(plain, 0, "ROME")
    p0 = int(plain.unit_next[B0])
    settle_all(plain)
    assert int(plain.city_pop[B0, 0, 0]) == 1
    assert not [s for s in range(p0, int(plain.unit_next[B0]))
                if bool(plain.unit_alive[B0, s]) and int(plain.unit_type[B0, s]) == builder
                and int(plain.unit_seat[B0, s]) == 0], "the Builder outlived Kupe"
    print("  7 Kupe's first city OK — 2 Population and a Builder")


def test_spy_capacity(rules, path) -> None:
    sim = fresh(rules, path)
    castles = TECHS.index("CASTLES")
    play(sim, 0, "FRANCE")
    if int(sim.row_leader[B0, 0]) != sim._leader_idx("CATHERINE_DE_MEDICI"):
        # France's first row is Catherine; a later row would be Eleanor
        sim.row_leader[B0, 0] = sim._leader_idx("CATHERINE_DE_MEDICI")
        sim._eff_version += 1
    sim.civ_techs[B0, 0, castles] = False
    base = int(sim._spy_capacity(0)[B0])
    sim.civ_techs[B0, 0, castles] = True
    assert int(sim._spy_capacity(0)[B0]) == base + 1, "the Flying Squadron"
    play(sim, 0, "ROME")
    assert int(sim._spy_capacity(0)[B0]) == base, "the capacity outlived Catherine"
    print("  8 spy capacity OK — +1 at Castles")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_wire(rules, path)
    test_district_production(rules, path)
    test_powered_and_gpp(rules, path)
    test_stockpile_and_charges(rules, path)
    test_stockpile_rate(rules, path)
    test_tile_price(rules, path)
    test_farm_ground(rules, path)
    test_grants_and_capital(rules, path)
    test_spy_capacity(rules, path)
    print("BATTERY OK city_rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
