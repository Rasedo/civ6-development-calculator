"""THE ROSTER'S DATA ROWS — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/roster_rows_test.py

The TS twin is tests/cpu/seats/roster-rows.test.ts.

CIV6 (the install's TraitModifiers): the production percentages (England,
Georgia, the Netherlands, the Ottomans), Meiji Restoration's district
adjacency, Radio Oranje's route culture, and the capacity rows of Nîhithaw
and Founder of Carthage — each on the site that pays it, the seat's
civilization or leader alone.
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


def district_idx(sim, name: str) -> int:
    return next(i for i, d in enumerate(sim.districts_cat) if d["id"] == name)


def produce(sim, row: int, code: int) -> float:
    sim.city_current[B0, row, 0, 0] = code
    sim.city_qtile[B0, row, 0, 0] = -1
    sim.city_progress[B0, row, 0, 0] = 0
    sim.city_cost[B0, row, 0, 0] = 100000
    sim._eff_version += 1
    sim._seat_city_produce(row, torch.tensor([0]), torch.tensor([True]), torch.tensor([20.0], dtype=torch.float64))
    return float(sim.city_progress[B0, row, 0, 0])


# ---------------------------------------------------------------------------


def test_wire(rules, path) -> None:
    sim = fresh(rules, path)
    assert len(sim._prod_mult_rows) == 6 and len(sim._district_adj_rows) == 6
    assert len(sim._intl_route_rows) == 1 and len(sim._route_cap_rows) == 5
    assert all(r[4] >= 0 for r in sim._prod_mult_rows if r[2] < 0 and r[3] < 0), "a unit-class row lost its class"
    print("  1 wire OK — 6 + 6 + 1 + 5 rows")


def test_production(rules, path) -> None:
    ws, walls, cat = BLDGS.index("WORKSHOP"), BLDGS.index("ANCIENT_WALLS"), UNITS.index("CATAPULT")

    def run(as_civ: str, code: int) -> float:
        sim = fresh(rules, path)
        play(sim, 0, as_civ)
        return produce(sim, 0, code)

    base_ws = run("AMERICA", ws)  # America holds no production row
    assert base_ws > 0 and abs(run("ENGLAND", ws) - base_ws * 1.2) < 1e-9, "Workshop of the World"
    assert abs(run("OTTOMAN", ws) - base_ws) < 1e-9, "the Ottomans paid a Workshop"
    base_w = run("AMERICA", walls)
    assert abs(run("GEORGIA", walls) - base_w * 1.5) < 1e-9, "Strength in Unity"
    base_c = run("AMERICA", sim_code := sim_unit_code(fresh(rules, path), cat))
    assert abs(run("OTTOMAN", sim_code) - base_c * 1.5) < 1e-9, "Great Turkish Bombard"
    print("  2 production rows OK — England x1.2, Georgia x1.5, the Ottomans x1.5")


def sim_unit_code(sim, utype: int) -> int:
    return sim.UNIT_BASE + utype


def test_meiji(rules, path) -> None:
    def faith_at(as_civ: str) -> float:
        sim = fresh(rules, path)
        play(sim, 0, as_civ)
        hs, campus = district_idx(sim, "HOLY_SITE"), district_idx(sim, "CAMPUS")
        ctr = int(sim.city_center[B0, 0, 0])
        ring = [int(x) for x in sim.neigh[ctr].tolist() if x >= 0 and not bool(sim.water[B0, x]) and bool(sim.passable[B0, x])]
        site = ring[0]
        beside = next(x for x in sim.neigh[site].tolist() if x >= 0 and x != ctr and not bool(sim.water[B0, x]) and bool(sim.passable[B0, x]))
        for t, di in ((site, hs), (beside, campus)):
            sim.tile_seat[B0, t] = 0
            sim.district[B0, t] = di
            sim.district_complete[B0, t] = True
            sim.city_dist_tile[B0, 0, 0, di] = t
        sim._tile_owner_ver += 1
        sim._eff_version += 1
        # the centre is an adjacent district too: +1 per neighbour holding one
        n = sum(1 for x in sim.neigh[site].tolist() if x >= 0 and (int(sim.centre_slot_at[B0, x]) >= 0
                or (int(sim.district[B0, x]) >= 0 and bool(sim.district_complete[B0, x]))))
        return float(sim._district_adj_floor(hs)[B0, site]) - (n if as_civ == "JAPAN" else 0)

    assert faith_at("JAPAN") == faith_at("AMERICA"), "Meiji Restoration"
    print("  3 Meiji Restoration OK — +1 per adjacent district")


def test_radio_oranje(rules, path) -> None:
    sim = fresh(rules, path)
    play(sim, 0, "NETHERLANDS")
    assert bool(sim._row_leads(0, "WILHELMINA")[B0])
    sim.seat_routes[B0, 0, 0, 0] = int(sim.city_id[B0, 0, 0])
    sim.seat_routes[B0, 0, 0, 1] = -1
    sim.seat_route_dseat[B0, 0, 0] = 1
    sim.seat_route_dcity[B0, 0, 0] = int(sim.city_id[B0, 1, 0])
    sim.seat_route_exp[B0, 0, 0] = int(sim.turn) + 20
    sim._eff_version += 1
    inc = sim._seat_route_income(0)
    assert inc is not None and abs(float(inc[B0, 0, 4]) - 2.0) < 1e-9, float(inc[B0, 0, 4])
    play(sim, 0, "ROME")
    assert float(sim._seat_route_income(0)[B0, 0, 4]) == 0.0, "the culture outlived Wilhelmina"
    print("  4 Radio Oranje OK — +2 Culture on the international leg")


def test_capacity(rules, path) -> None:
    sim = fresh(rules, path)
    play(sim, 0, "CREE")
    pottery = TECHS.index("POTTERY")
    sim.civ_techs[B0, 0, pottery] = False
    assert int(sim._roster_route_capacity(0)[B0]) == 0
    sim.civ_techs[B0, 0, pottery] = True
    assert int(sim._roster_route_capacity(0)[B0]) == 1, "Nîhithaw"
    before = int(sim._trade_capacity(0)[B0])
    play(sim, 0, "ROME")
    assert int(sim._trade_capacity(0)[B0]) == before - 1, "the capacity outlived the Cree"
    sim = fresh(rules, path)
    play(sim, 0, "PHOENICIA")
    assert bool(sim._row_leads(0, "DIDO")[B0])
    assert int(sim._roster_route_capacity(0)[B0]) == 0
    plaza = district_idx(sim, "GOVERNMENT_PLAZA")
    ctr = int(sim.city_center[B0, 0, 0])
    t = next(int(x) for x in sim.neigh[ctr].tolist() if x >= 0 and not bool(sim.water[B0, x]) and bool(sim.passable[B0, x]))
    sim.district[B0, t] = plaza
    sim.district_complete[B0, t] = True
    sim.city_dist_tile[B0, 0, 0, plaza] = t
    sim._eff_version += 1
    assert int(sim._roster_route_capacity(0)[B0]) == 1, "the plaza"
    sim.city_bldg[B0, 0, 0, BLDGS.index("ANCESTRAL_HALL")] = True
    assert int(sim._roster_route_capacity(0)[B0]) == 2, "tier 1"
    sim.city_bldg[B0, 0, 0, BLDGS.index("GRAND_MASTERS_CHAPEL")] = True
    assert int(sim._roster_route_capacity(0)[B0]) == 3, "tier 2"
    print("  5 capacity rows OK — Pottery with a capital; the plaza and its tiers")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_wire(rules, path)
    test_production(rules, path)
    test_meiji(rules, path)
    test_radio_oranje(rules, path)
    test_capacity(rules, path)
    print("BATTERY OK roster_rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
