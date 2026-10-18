"""THE MINOR BUILDS — a city-state's city works the item its city AI picked.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/minor_builds_test.py

CIV6 (City-state): the minor's step (`_minor_build`, the twin of
`minorBuild`) works the item in hand. It pays the city's Production (the
minor's -50% among its yield percents) plus the overflow store under the
item's own production row (Leaders.xml's MINOR_CIV set: +200% toward walls,
a Builder and a military unit while the minor holds fewer than ten, +500%
toward the Harbor and the type's district), and the item completes when its
progress covers it, at most one a turn; with nothing in hand the step stores
the Production. Each scene puts the item in hand by hand (`in_hand`); the
TS twin is tests/cpu/minors/minor-build.test.ts.

Proven here:
  * the step pays the item's row, a completion leaves the store the
    Production less what the item lacked and the queue empty, nothing in
    hand banks the Production;
  * Ancient Walls fill the perimeter pool; a damaged perimeter refuses a
    higher wall (the queue takes it no more);
  * the district in hand lands on its plot, writes the tile planes and the
    minor's registry and paves the plot; a plot that no longer takes it
    drops the item;
  * a Builder trains into the majors' pool under the minor's seat and the
    next one costs more; with no free tile it waits;
  * the conquest CARRIES the buildings, the registry and the perimeter;
    the minor's Encampment fights at its centre's strength; the walled
    minor strikes;
  * a dead minor builds nothing;
  * the repair restores a quiet breached perimeter; a district project
    converts its percent; a running Logistics lights the grid; the worship
    building its religion names; the Flood Barrier costs by its lowland;
  * a pillaged building waits for the item in hand, then comes first and
    resumes at 75% of its cost; one in a pillaged district waits for it;
  * the city AI queues its Default Specialization's pick on an empty queue,
    runs no events the turn it first sees its city, and a unit its step
    trains joins the tree whose contract asked for it;
  * the trees' orders: CLEAR PLOT removes the feature with its lumps,
    BUILD IMPROVEMENT lays the improvement, each a charge.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, fixture_paths
from core.sim_citytrees import CP_IN_PROGRESS, new_contract
from warmup import warm_base, opened

B0 = 0
ROOT = Path(__file__).resolve().parent.parent.parent
RULES = json.loads((ROOT / "seeder" / "worlds" / "rules.json").read_text())
BLD = [b["id"] for b in RULES["buildings"]]
IMP = RULES["improvements"]["ids"]


# THE WARMED BASE, ONE PER FIXTURE: a scene pays a `restore` instead of a
# fixture load, a settle and four steps.
def build(rules, path) -> BatchSim:
    return warm_base(str(path), lambda: opened(rules, path, 4))


def walls_rows(sim) -> list[int]:
    return sorted(sim._walls_rows, key=lambda bi: int(sim.rules_dev.b_walls[bi]))


def grant_walls_tech(sim, s: int, bi: int) -> None:
    ut = int(sim.rules_dev.b_unlock[bi])
    if ut >= 0:
        sim.citystate_techs[B0, s, ut] = True


def grant_district_tech(sim, s: int, dv: int) -> None:
    for (di, ut, uc, _plc, _fc) in sim._scaffold:
        if int(di) != dv:
            continue
        if int(ut) >= 0:
            sim.citystate_techs[B0, s, int(ut)] = True
        if int(uc) >= 0:
            sim.citystate_civics[B0, s, int(uc)] = True


def in_hand(sim, s: int, key: int, v: float, site: int = -1) -> None:
    """item `key` (`minorItemKey`'s index) in hand with progress `v` (a
    district at `site`), nothing kept, the store empty"""
    sim.citystate_item[B0, s] = key
    sim.citystate_prod[B0, s] = v
    sim.citystate_kept[B0, s] = 0.0
    sim.citystate_ovf[B0, s] = 0.0
    sim.citystate_prod_site[B0, s] = site
    sim.citystate_repair_wait[B0, s] = False
    sim._mi_ver = getattr(sim, "_mi_ver", 0) + 1


def a_minor(sim) -> int:
    live = sim.citystate_alive[B0].nonzero().flatten().tolist()
    assert live, "the fixture holds no living city-state"
    return live[0]


def free_plot(sim, s: int) -> int:
    """a plot of the minor's beside its centre with no district on it"""
    ctr = int(sim.citystate_center[B0, s])
    ok = [t for t in range(sim.T) if int(sim.tile_seat[B0, t]) == 100 + s and int(sim.district[B0, t]) < 0
          and bool(sim.passable[B0, t]) and t != ctr]
    assert ok, "the minor owns no free plot"
    return ok[0]


def prod(sim, s: int) -> float:
    p = float(sim._minor_production(s)[B0])
    assert p > 0, "a live minor's city produces something"
    return p


def test_the_item_in_hand(rules, path) -> None:
    sim = build(rules, path)
    s = a_minor(sim)
    row = sim._CITY_MINOR0 + s
    anc = walls_rows(sim)[0]
    cs = rules.citystate
    assert float(cs["productionPct"]) == -50 and float(cs["wallsProdPct"]) == 200
    # nothing in hand: the step stores the Production
    in_hand(sim, s, -1, 0.0)
    p = prod(sim, s)
    sim._minor_build(s, sim._minor_production(s))
    assert int(sim.citystate_item[B0, s]) == -1
    assert float(sim.citystate_ovf[B0, s]) == p, "the store did not take the city's Production"
    # the walls in hand: x3 on the Production
    grant_walls_tech(sim, s, anc)
    in_hand(sim, s, sim._mk_b0 + anc, 0.0)
    sim._minor_build(s, sim._minor_production(s))
    assert float(sim.citystate_prod[B0, s]) == p * 3, "toward the walls the step did not pay the Production x3"
    # one point short: the step covers it, the store keeps the Production less 1
    cost = float(sim.rules_dev.b_cost[anc])
    in_hand(sim, s, sim._mk_b0 + anc, cost - 1)
    sim._minor_build(s, sim._minor_production(s))
    assert bool(sim.city_bldg[B0, row, 0, anc]), "Ancient Walls did not land"
    assert int(sim.citystate_item[B0, s]) == -1 and float(sim.citystate_prod[B0, s]) == 0.0
    assert float(sim.citystate_ovf[B0, s]) == p - 1, float(sim.citystate_ovf[B0, s])
    tier1 = int(sim._walls_tier_hp[int(sim.rules_dev.b_walls[anc])])
    assert int(sim.city_outer_hp[B0, row, 0]) == tier1, "the perimeter pool did not fill"
    print("  1 item in hand OK — the row's percent, the store, the walls land once")


def test_damaged_walls_block_the_higher_tier(rules, path) -> None:
    sim = build(rules, path)
    s = a_minor(sim)
    row = sim._CITY_MINOR0 + s
    tiers = walls_rows(sim)
    if len(tiers) < 2:
        print("  2 damage SKIPPED — one walls tier in the catalog")
        return
    anc, med = tiers[0], tiers[1]
    for bi in (anc, med):
        grant_walls_tech(sim, s, bi)
    sim.city_bldg[B0, row, 0, anc] = True
    full = int(sim._walls_tier_hp[int(sim.rules_dev.b_walls[anc])])
    key = torch.full((sim.B,), sim._mk_b0 + med, dtype=torch.long)
    none = torch.full((sim.B,), -1, dtype=torch.long)
    sim.city_outer_hp[B0, row, 0] = full - 7
    assert not bool(sim._minor_queue_ok(s, key, none)[B0]), "a damaged perimeter took a higher wall"
    sim.city_outer_hp[B0, row, 0] = full
    assert bool(sim._minor_queue_ok(s, key, none)[B0]), "an intact perimeter refused the higher wall"
    print("  2 damage OK — the majors' walls clause holds the minor's queue")


def test_the_district_in_hand(rules, path) -> None:
    sim = build(rules, path)
    s = a_minor(sim)
    row = sim._CITY_MINOR0 + s
    dv = int(sim._citystate_didx[B0, s])
    assert dv >= 0, "the minor's type names no district"
    grant_district_tech(sim, s, dv)
    plane = sim._minor_district_plane(s, dv, True, True)
    if not bool(plane[B0].any()):
        print("  3 district SKIPPED — no legal plot for the type district on this fixture")
        return
    site = int(plane[B0].long().argmax())
    sim.improvement[B0, site] = IMP.index("FARM")
    assert bool(sim._minor_district_plane(s, dv, True, True)[B0, site]), "an improved plot stopped being a site"
    # the type's district: x6 on the Production
    in_hand(sim, s, sim._mk_d0 + dv, 0.0, site)
    p = prod(sim, s)
    sim._minor_build(s, sim._minor_production(s))
    assert float(sim.citystate_prod[B0, s]) == p * 6, "toward the type's district the step did not pay x6"
    assert int(sim.citystate_prod_site[B0, s]) == site, "the district's plot left the hand"
    in_hand(sim, s, sim._mk_d0 + dv, 10_000.0, site)
    sim._minor_build(s, sim._minor_production(s))
    assert int(sim.city_dist_tile[B0, row, 0, dv]) == site, "the district did not land on its plot"
    assert int(sim.district[B0, site]) == dv and bool(sim.district_complete[B0, site])
    assert int(sim.improvement[B0, site]) == -1, "the district left the Farm standing"
    assert int(sim.citystate_item[B0, s]) == -1 and int(sim.citystate_prod_site[B0, s]) == -1
    # a plot that no longer takes the district: the item leaves the queue
    sim = build(rules, path)
    grant_district_tech(sim, s, dv)
    sim.district[B0, site] = sim._encamp_didx if sim._encamp_didx != dv else sim._campus_idx
    in_hand(sim, s, sim._mk_d0 + dv, 10_000.0, site)
    sim._minor_build(s, sim._minor_production(s))
    assert int(sim.city_dist_tile[B0, row, 0, dv]) < 0, "the district landed on a taken plot"
    assert int(sim.citystate_item[B0, s]) == -1, "the refused district stayed in hand"
    print(f"  3 district OK — district {dv} on plot {site}, paved, registry and tiles agree")


def test_the_builder(rules, path) -> None:
    sim = build(rules, path)
    s = a_minor(sim)
    bi = sim._builder_idx
    trained = int(sim.citystate_builders_trained[B0, s])
    cost0 = float(sim._builder_cost(sim.citystate_builders_trained[:, s])[B0])
    in_hand(sim, s, bi, 0.0)
    p = prod(sim, s)
    sim._minor_build(s, sim._minor_production(s))
    assert float(sim.citystate_prod[B0, s]) == p * 3, "toward a Builder the step did not pay x3"
    in_hand(sim, s, bi, cost0)
    mine0 = int((sim.major_unit_alive[B0] & (sim.major_unit_seat[B0] == 100 + s) & (sim.major_unit_type[B0] == bi)).sum())
    sim._minor_build(s, sim._minor_production(s))
    mine1 = int((sim.major_unit_alive[B0] & (sim.major_unit_seat[B0] == 100 + s) & (sim.major_unit_type[B0] == bi)).sum())
    assert mine1 == mine0 + 1, "the Builder did not train"
    assert int(sim.citystate_builders_trained[B0, s]) == trained + 1
    assert float(sim._builder_cost(sim.citystate_builders_trained[:, s])[B0]) > cost0, "the next Builder costs no more"
    # no free tile on or beside the centre: it waits
    sim = build(rules, path)
    ctr = int(sim.citystate_center[B0, s])
    one = torch.zeros(sim.B, dtype=torch.bool)
    one[B0] = True
    for t in [ctr] + [int(x) for x in sim.neigh[ctr].tolist() if int(x) >= 0]:
        if int(sim.civilian_at[B0, t]) < 0 and bool(sim.passable[B0, t]):
            sim._spawn_unit(0, one, torch.full((sim.B,), t, dtype=torch.long), torch.full((sim.B,), bi, dtype=torch.long))
    in_hand(sim, s, bi, cost0)
    sim._minor_build(s, sim._minor_production(s))
    if int(sim.citystate_item[B0, s]) == bi:
        assert float(sim.citystate_prod[B0, s]) > cost0, "a waiting Builder lost its progress"
        print("  4 builder OK — x3, trained with its charges, the next dearer, waits for a free tile")
    else:
        print("  4 builder OK — x3, trained with its charges, the next dearer (a plot stayed free)")


def test_the_conquest_carries_the_build(rules, path) -> None:
    sim = build(rules, path)
    s = a_minor(sim)
    row = sim._CITY_MINOR0 + s
    anc = walls_rows(sim)[0]
    grant_walls_tech(sim, s, anc)
    sim.city_bldg[B0, row, 0, anc] = True
    full = int(sim._walls_tier_hp[int(sim.rules_dev.b_walls[anc])])
    sim.city_outer_hp[B0, row, 0] = full - 5
    dv = int(sim._citystate_didx[B0, s])
    grant_district_tech(sim, s, dv)
    plane = sim._minor_district_plane(s, dv, True, True)
    dt = -1
    if bool(plane[B0].any()):
        dt = int(plane[B0].long().argmax())
        in_hand(sim, s, sim._mk_d0 + dv, 10_000.0, dt)
        sim._minor_build(s, sim._minor_production(s))
        assert int(sim.city_dist_tile[B0, row, 0, dv]) == dt
    cols_before = sim.city_alive[B0, 0].sum()
    sim._capture_city_state(torch.tensor([B0]), torch.full((sim.B,), s, dtype=torch.long), 0)
    assert int(sim.city_alive[B0, 0].sum()) == int(cols_before) + 1, "the conquest founded no city"
    ctr = [j for j in range(sim.RC)
           if bool(sim.city_alive[B0, 0, j]) and int(sim.city_id[B0, 0, j]) == int(sim.civ_next_city_id[B0, 0]) - 1]
    assert ctr, "the annexed city column was not found"
    j = ctr[0]
    assert bool(sim.city_bldg[B0, 0, j, anc]), "the conquest dropped the walls"
    assert int(sim.city_outer_hp[B0, 0, j]) == full - 5, "the conquest reset the perimeter"
    if dt >= 0:
        assert int(sim.city_dist_tile[B0, 0, j, dv]) == dt, "the conquest dropped the district registry"
    print("  5 conquest OK — walls, perimeter and registry all arrive")


def test_the_minor_encampment_fights_as_its_centre(rules, path) -> None:
    """CIV6: a defensible district fights "similar to the parent City
    Center, excluding any bonus obtained for a Garrisoned unit" - a minor's
    Encampment at its OWN centre's standing strength less the garrison."""
    sim = build(rules, path)
    s = a_minor(sim)
    row = sim._CITY_MINOR0 + s
    dv = int(sim._encamp_didx)
    if dv < 0:
        print("  6 encampment SKIPPED — no ENCAMPMENT row in the catalog")
        return
    et = free_plot(sim, s)
    sim.city_dist_tile[B0, row, 0, dv] = et
    sim.district[B0, et] = dv
    sim.district_complete[B0, et] = True
    sim.encamp_hp[B0, et] = 100
    anc = walls_rows(sim)[0]
    grant_walls_tech(sim, s, anc)
    sim.city_bldg[B0, row, 0, anc] = True
    _rr = torch.full((sim.B,), row, dtype=torch.long)
    _cc = torch.zeros(sim.B, dtype=torch.long)
    sim.city_outer_hp[B0, row, 0] = int(sim._walls_max_at(_rr, _cc)[B0])
    tt = torch.full((sim.B,), et, dtype=torch.long)
    d, _hrow, hcol, wtier, held = sim._encamp_terms(tt)
    csx = torch.full((sim.B,), s, dtype=torch.long)
    tier = int(sim._minor_walls_tier_at(csx)[B0])
    want = (int(sim.citystate_best_melee[B0, s]) - int(sim._city_base_melee_cut) + int((sim.city_bldg[B0, row, 0].long() * sim._b_walls_cs).sum())
            + int(sim._palace_city_cs) + int(sim._d_city_str[dv])
            + int(sim._minor_envoys_received()[B0, s]) * int(sim._envoy_city_cs))
    assert tier >= 1, "the walls did not reach the tier read"
    assert int(d[B0]) == want, f"the minor's Encampment defends at {int(d[B0])}, its centre says {want}"
    assert bool(held[B0]) and int(wtier[B0]) == tier and int(hcol[B0]) < 0
    print("  6 encampment OK — the minor's district fights at its centre's strength")


def test_the_walled_minor_strikes(rules, path) -> None:
    """CIV6: walls give a city its ranged strike, through the majors' own
    body (`_city_strikes`), from its centre's standing strength. The TS twin
    is tests/cpu/minors/minor-strike.test.ts."""
    sim = build(rules, path)
    s = a_minor(sim)
    row = sim._CITY_MINOR0 + s
    anc = walls_rows(sim)[0]
    grant_walls_tech(sim, s, anc)
    sim.city_bldg[B0, row, 0, anc] = True
    sim.city_outer_hp[B0, row, 0] = int(sim._walls_tier_hp[int(sim.rules_dev.b_walls[anc])])
    ctr = int(sim.citystate_center[B0, s])
    ring2 = ((sim.pair_dist[ctr] == 2) & ~sim.water[B0] & (sim.military_at[B0] < 0)
             & (sim.civilian_at[B0] < 0))
    at = int(ring2.long().argmax())
    assert bool(ring2[at]), "no free land plot two from the minor's centre"
    one = torch.ones(sim.B, dtype=torch.bool)
    sim._spawn_unit(0, one, torch.full((sim.B,), at, dtype=torch.long),
                    torch.full((sim.B,), sim._warrior_idx, dtype=torch.long))
    slot = int(sim.military_at[B0, at])
    assert slot >= 0, "the warrior did not take the plot"
    col0 = torch.zeros(sim.B, dtype=torch.long)
    alive = sim.citystate_alive[:, s].clone()
    hp0 = int(sim.unit_hp[B0, slot])
    sim._city_strikes(row, col0, alive)
    assert int(sim.unit_hp[B0, slot]) == hp0, "the minor fired at a unit at peace with it"
    sim.war[:, 0, row] = True
    sim.war[:, row, 0] = True
    sim._city_strikes(row, col0, alive)
    assert int(sim.unit_hp[B0, slot]) < hp0, "the walled minor held fire at a unit at war with it"
    print("  7 strike OK — the walled minor fires at war, holds at peace")


def test_a_dead_minor_builds_nothing(rules, path) -> None:
    sim = build(rules, path)
    s = a_minor(sim)
    row = sim._CITY_MINOR0 + s
    anc = walls_rows(sim)[0]
    grant_walls_tech(sim, s, anc)
    in_hand(sim, s, sim._mk_b0 + anc, 100_000.0)
    sim.citystate_alive[B0, s] = False
    sim._minor_build(s, sim._minor_production(s))
    assert float(sim.citystate_prod[B0, s]) == 100_000.0, "a dead minor's progress moved"
    assert not bool(sim.city_bldg[B0, row, 0, anc]), "a dead minor built walls"
    print("  8 dead OK — nothing accrues, nothing lands")


def test_the_repair_project(rules, path) -> None:
    sim = build(rules, path)
    s = a_minor(sim)
    row = sim._CITY_MINOR0 + s
    anc = walls_rows(sim)[0]
    grant_walls_tech(sim, s, anc)
    sim.city_bldg[B0, row, 0, anc] = True
    full = int(sim._walls_tier_hp[sim._minor_walls_tier(s)][B0])
    sim.city_outer_hp[B0, row, 0] = full - 7
    sim.city_last_hit[B0, row, 0] = int(sim.turn) - 10
    ok, cost = sim._minor_repair(s)
    assert bool(ok[B0]) and float(cost[B0]) == 7.0, "the repair's price is the HP it puts back"
    in_hand(sim, s, sim._mk_p0 + sim._repair_proj_idx, 7.0)
    sim._minor_build(s, sim._minor_production(s))
    assert int(sim.city_outer_hp[B0, row, 0]) == full, "the repair did not restore the walls"
    assert int(sim.citystate_item[B0, s]) == -1
    print("  9 repair OK — quiet and breached: restored at the HP it puts back")


def test_the_project_conversion(rules, path) -> None:
    sim = build(rules, path)
    s = a_minor(sim)
    row = sim._CITY_MINOR0 + s
    grants = next(i for i, p in enumerate(sim._proj_rows) if int(p["d"]) == sim._campus_idx and int(p["y"]) == 3)
    t = free_plot(sim, s)
    sim.district[B0, t] = sim._campus_idx
    sim.district_complete[B0, t] = True
    sim.city_dist_tile[B0, row, 0, sim._campus_idx] = t
    sim._eff_version += 1
    prow = sim._proj_rows[grants]
    in_hand(sim, s, sim._mk_p0 + grants, 0.0)
    cost = float(sim._minor_item_cost(s, sim.citystate_item[:, s])[B0])
    turn = 4.0
    sim._minor_build(s, torch.full((sim.B,), turn, dtype=torch.float64))
    want = min(turn, cost) * ((int(prow["yp"]) * 256 // 100) / 256)
    assert int(sim.city_proj_yield[B0, row, 0]) == 3, "the conversion is the project's Science"
    assert abs(float(sim.city_proj_conv[B0, row, 0]) - want) < 1e-12
    assert int(sim.citystate_build_proj[B0, s]) == grants, "the running project is the queue's head"
    print(f"  10 project OK — Research Grants: {want:.2f} Science of {turn:.0f} Production converted")


def test_the_logistics_power(rules, path) -> None:
    sim = build(rules, path)
    s = a_minor(sim)
    row = sim._CITY_MINOR0 + s
    sim.citystate_type[B0, s] = 3  # industrial
    logi = next(i for i, p in enumerate(sim._proj_rows) if int(p["d"]) == sim._iz_idx and int(p["fp"]))
    t = free_plot(sim, s)
    sim.district[B0, t] = sim._iz_idx
    sim.district_complete[B0, t] = True
    sim.city_dist_tile[B0, row, 0, sim._iz_idx] = t
    for name in ("WORKSHOP", "FACTORY"):
        sim.city_bldg[B0, row, 0, BLD.index(name)] = True
    sim._eff_version += 1
    sim._minor_power(s)
    assert not bool(sim.city_powered[B0, row, 0]), "the Factory's load, nothing to meet it"
    in_hand(sim, s, sim._mk_p0 + logi, 0.0)
    sim._minor_build(s, sim._minor_production(s))
    assert bool(sim.citystate_full_power[B0, s]), "the step went toward Logistics"
    sim._minor_power(s)
    assert bool(sim.city_powered[B0, row, 0]), "a running Logistics meets the whole load"
    in_hand(sim, s, sim._mk_p0 + logi, 1.0e4)
    sim._minor_build(s, sim._minor_production(s))
    assert float(sim.citystate_prod[B0, s]) == 0.0 and not bool(sim.citystate_full_power[B0, s])
    print("  11 logistics OK — a running project lights the minor's grid, a finished one does not")


def test_the_worship_building(rules, path) -> None:
    sim = build(rules, path)
    s = a_minor(sim)
    row = sim._CITY_MINOR0 + s
    cath = BLD.index("CATHEDRAL")
    wi = int((sim._worship_bidx == cath).long().argmax())
    rel = 0
    sim.civ_religion_done[B0, rel] = True
    sim.civ_worship[B0, rel] = wi
    sim.city_pressure[B0, row, 0, rel] = 100_000
    assert int(sim._minor_worship(s)[B0]) == cath
    t = free_plot(sim, s)
    sim.district[B0, t] = sim._hs_idx
    sim.district_complete[B0, t] = True
    sim.city_dist_tile[B0, row, 0, sim._hs_idx] = t
    sim.city_bldg[B0, row, 0, BLD.index("SHRINE")] = True
    sim.city_bldg[B0, row, 0, BLD.index("TEMPLE")] = True
    sim._bldg_version += 1
    sim._eff_version += 1
    key = torch.full((sim.B,), sim._mk_b0 + cath, dtype=torch.long)
    assert bool(sim._minor_queue_ok(s, key, torch.full((sim.B,), -1, dtype=torch.long))[B0]), "the queue refused the Cathedral"
    in_hand(sim, s, sim._mk_b0 + cath, float(sim.rules_dev.b_cost[cath]))
    sim._minor_build(s, sim._minor_production(s))
    assert bool(sim.city_bldg[B0, row, 0, cath]), "the Cathedral did not rise"
    print("  12 worship OK — the building its religion names")


def test_the_flood_barrier(rules, path) -> None:
    sim = build(rules, path)
    s = a_minor(sim)
    row = sim._CITY_MINOR0 + s
    fb = sim._barrier_bidx
    sim.citystate_techs[B0, s] = True
    sim.tile_lowland[B0] = 0
    key = torch.full((sim.B,), sim._mk_b0 + fb, dtype=torch.long)
    none = torch.full((sim.B,), -1, dtype=torch.long)
    assert not bool(sim._minor_queue_ok(s, key, none)[B0]), "a barrier with no lowland to cover"
    low = [t for t in range(sim.T) if int(sim.tile_seat[B0, t]) == 100 + s and t != int(sim.citystate_center[B0, s])][0]
    sim.tile_lowland[B0, low] = 1
    cost = float(sim._flood_barrier_cost(row)[B0, 0])
    assert cost > 0 and float(sim._minor_item_cost(s, key)[B0]) == cost
    in_hand(sim, s, sim._mk_b0 + fb, cost)
    sim._minor_build(s, sim._minor_production(s))
    assert bool(sim.city_bldg[B0, row, 0, fb]), "the barrier did not land on its lowland"
    print(f"  13 flood barrier OK — lowland-gated, {cost:.0f} for one lowland tile")


def test_the_pillaged_repair(rules, path) -> None:
    sim = build(rules, path)
    s = a_minor(sim)
    row = sim._CITY_MINOR0 + s
    anc = walls_rows(sim)[0]
    grant_walls_tech(sim, s, anc)
    lib = BLD.index("LIBRARY")
    t = free_plot(sim, s)
    sim.district[B0, t] = sim._campus_idx
    sim.district_complete[B0, t] = True
    sim.city_dist_tile[B0, row, 0, sim._campus_idx] = t
    sim.city_bldg[B0, row, 0, lib] = True
    sim.city_bldg_pillaged[B0, row, 0, lib] = True
    sim._bldg_version += 1
    sim._eff_version += 1
    # the walls are the item in hand: they land, the Library waits
    in_hand(sim, s, sim._mk_b0 + anc, float(sim.rules_dev.b_cost[anc]))
    sim.citystate_repair_wait[B0, s] = True
    sim._minor_build(s, sim._minor_production(s))
    assert bool(sim.city_bldg[B0, row, 0, anc]), "the walls in hand did not land"
    assert not bool(sim.citystate_repair_wait[B0, s]), "the wait outlived the item in hand"
    assert bool(sim.city_bldg_pillaged[B0, row, 0, lib]), "the repair jumped the item in hand"
    # the repair comes first now, ahead of the item in hand, under no row
    in_hand(sim, s, sim._warrior_idx, 0.0)
    p = prod(sim, s)
    sim._minor_build(s, sim._minor_production(s))
    assert int(sim.citystate_item[B0, s]) == sim._mk_r0 + lib, "the repair is not the item"
    assert float(sim.citystate_prod[B0, s]) == p
    assert float(sim.citystate_kept[B0, s].sum()) == 0.0
    assert sim._mb_repair_resume_pct == 75.0
    full = float(sim.rules_dev.b_cost[lib])
    left = full - (full * 75 // 100)
    in_hand(sim, s, sim._mk_r0 + lib, left - p)
    sim._minor_build(s, sim._minor_production(s))
    assert not bool(sim.city_bldg_pillaged[B0, row, 0, lib]), "the Library was not repaired"
    # a pillaged district holds its buildings' repair back
    sim.city_bldg_pillaged[B0, row, 0, lib] = True
    sim.district_pillaged[B0, t] = True
    in_hand(sim, s, sim._mk_r0 + lib, 1000.0)
    sim._minor_build(s, sim._minor_production(s))
    assert bool(sim.city_bldg_pillaged[B0, row, 0, lib]), "repaired inside a pillaged district"
    print(f"  14 repair OK — after the item in hand, {left:.0f} of {full:.0f} left to build")


def test_the_city_ai(rules, path) -> None:
    sim = build(rules, path)
    s = a_minor(sim)
    # the AI's turn on an empty queue: its Default Specialization's pick
    sim.citystate_ai_on[B0, s] = True
    in_hand(sim, s, -1, 0.0)
    f = sim._cv_minor_facts(s)
    b, u, p = sim._cv_minor_tables(s, f)
    kind, prow, val = sim._cv_pick(b, u, p, f)
    want = int(sim._minor_pick_key(kind, prow)[B0])
    sim.cai_c_id[B0, s] = -1
    sim.cai_c_listed[B0, s] = False
    sim.cai_in_hand[B0, s] = -1
    sim._minor_ai_turn(s)
    got = int(sim.citystate_item[B0, s])
    assert got == want, f"the AI queued item {got}, its pick is {want}"
    assert int(sim.citystate_prod_set_value[B0, s]) == int(val[B0])
    # a city its AI first sees this turn runs no events
    sim = build(rules, path)
    sim.citystate_ai_on[B0, s] = False
    sim.cai_slots[B0, s] = -1
    sim.cai_tr_alive[B0, s] = False
    t0 = int(sim.cai_t_serial[B0, s])
    sim._minor_ai_turn(s)
    assert bool(sim.citystate_ai_on[B0, s]), "the AI did not mark its city seen"
    assert int(sim.cai_t_serial[B0, s]) == t0, "a fresh city's events started a tree"
    # a unit its step trains joins the tree whose contract asked for it
    sim = build(rules, path)
    T = sim._cv_tables()
    war_row = T["unit_index"]["UNIT_WARRIOR"]
    one = torch.zeros(sim.B, dtype=torch.bool)
    one[B0] = True
    sim.citystate_ai_on[B0, s] = True
    k = 0
    sim.cai_tr_alive[B0, s, k] = True
    sim.cai_tr_id[B0, s, k] = 900
    sim.cai_tr_units[B0, s, k] = -1
    j = new_contract(sim.cityai, s, one, tree=900, unit=war_row, progress=CP_IN_PROGRESS, in_tree=True, assign=True,
                     queued=True, city=-1)
    assert int(j[B0]) >= 0
    in_hand(sim, s, sim._warrior_idx, 1000.0)
    sim._minor_build(s, sim._minor_production(s))
    held = [int(x) for x in sim.cai_tr_units[B0, s, k].tolist() if int(x) >= 0]
    assert len(held) == 1, f"the trained Warrior did not join its tree ({held})"
    g = held[0]
    assert bool(sim.unit_alive[B0, g]) and int(sim.unit_seat[B0, g]) == 100 + s and int(sim.unit_type[B0, g]) == sim._warrior_idx
    print("  15 city AI OK — the pick queued, a fresh city runs no events, the trained unit joins its tree")


def test_the_trees_orders(rules, path) -> None:
    """the trees' orders carried out (`minorTreeWorld.order`): CLEAR PLOT
    removes the plot's feature with its Feature_Removes rows as lumps (the
    Production to the item in hand) and spends a charge; BUILD IMPROVEMENT
    lays the improvement and spends a charge"""
    from core.sim_minorai import _MinorWorld
    sim = build(rules, path)
    s = a_minor(sim)
    row = sim._CITY_MINOR0 + s
    lo = sim.POOL_LO["major"]
    one = torch.zeros(sim.B, dtype=torch.bool)
    one[B0] = True

    def world():
        f = sim._cv_minor_facts(s)
        return _MinorWorld(sim, s, f, sim._cv_minor_tables(s, f), sim._minor_plot_evals(s, f), sim._minor_threat(s))

    def builder_on(t: int) -> int:
        slot = int(sim.unit_next[B0])
        landed = sim._spawn_unit(row, one, torch.full((sim.B,), t, dtype=torch.long), torch.full((sim.B,), sim._builder_idx, dtype=torch.long))
        assert bool(landed[B0]) and int(sim.unit_tile[B0, lo + slot]) == t, "the Builder did not stand on its plot"
        return lo + slot
    # the first minor owning a plot whose feature a chop removes
    chop = []
    for s in sim.citystate_alive[B0].nonzero().flatten().tolist():
        row = sim._CITY_MINOR0 + s
        chop = [t for t in range(sim.T) if int(sim.tile_seat[B0, t]) == 100 + s and int(sim.tile_ftr[B0, t]) > 0
                and not bool(sim.feat_stripped[B0, t]) and int(sim.civilian_at[B0, t]) < 0 and int(sim.tile_ftu[B0, t]) >= 0]
        if chop:
            break
    if chop:
        t = chop[0]
        sim.citystate_techs[B0, s, int(sim.tile_ftu[B0, t])] = True
        g = builder_on(t)
        ch0 = int(sim.unit_charges[B0, g])
        in_hand(sim, s, sim._warrior_idx, 0.0)
        food, prd = [int(x) for x in sim._chop_rows[int(sim.tile_ftr[B0, t])].tolist()]
        world().order(torch.full((sim.B,), g, dtype=torch.long), "clear", torch.full((sim.B,), t, dtype=torch.long),
                      torch.full((sim.B,), -1, dtype=torch.long), one)
        assert bool(sim.feat_stripped[B0, t]), "CLEAR PLOT left the feature standing"
        assert int(sim.unit_charges[B0, g]) == ch0 - 1, "the clear spent no charge"
        if prd > 0:
            assert float(sim.citystate_prod[B0, s]) > 0, "the chop's Production missed the item in hand"
        print(f"  16a clear OK — plot {t}'s feature removed, lumps {food} Food / {prd} Production")
    else:
        print("  16a clear SKIPPED — no minor owns a choppable plot")
    sim = build(rules, path)
    s = a_minor(sim)
    row = sim._CITY_MINOR0 + s
    ground = sim._minor_ground_imps(s)[B0]
    farm = sim.FARM
    plots = [t for t in range(sim.T) if bool(ground[t, farm]) and int(sim.improvement[B0, t]) < 0 and int(sim.civilian_at[B0, t]) < 0]
    assert plots, "no plot of the minor's takes a Farm"
    t = plots[0]
    g = builder_on(t)
    ch0 = int(sim.unit_charges[B0, g])
    farm_row = [r["type"] for r in rules.ai_city_build["improvements"]].index("IMPROVEMENT_FARM")
    w = world()
    assert bool(w.can_improve(torch.full((sim.B,), t, dtype=torch.long), torch.full((sim.B,), farm_row, dtype=torch.long))[B0])
    w.order(torch.full((sim.B,), g, dtype=torch.long), "improve", torch.full((sim.B,), t, dtype=torch.long),
            torch.full((sim.B,), farm_row, dtype=torch.long), one)
    assert int(sim.improvement[B0, t]) == farm, "BUILD IMPROVEMENT laid no Farm"
    assert int(sim.unit_charges[B0, g]) == ch0 - 1 and int(sim.unit_mp[B0, g]) == 0, "the Farm spent no charge or turn"
    print(f"  16b improve OK — a Farm on plot {t}, a charge and the turn spent")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_the_item_in_hand(rules, path)
    test_damaged_walls_block_the_higher_tier(rules, path)
    test_the_district_in_hand(rules, path)
    test_the_builder(rules, path)
    test_the_conquest_carries_the_build(rules, path)
    test_the_minor_encampment_fights_as_its_centre(rules, path)
    test_the_walled_minor_strikes(rules, path)
    test_a_dead_minor_builds_nothing(rules, path)
    test_the_repair_project(rules, path)
    test_the_project_conversion(rules, path)
    test_the_logistics_power(rules, path)
    test_the_worship_building(rules, path)
    test_the_flood_barrier(rules, path)
    test_the_pillaged_repair(rules, path)
    test_the_city_ai(rules, path)
    test_the_trees_orders(rules, path)
    print("BATTERY OK minor_builds")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
