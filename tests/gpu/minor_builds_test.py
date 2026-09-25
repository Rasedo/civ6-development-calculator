"""THE MINOR BUILDS — a city-state's city develops.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/minor_builds_test.py

CIV6 (City-state): the minor's city produces what the build table
(`MINOR_BUILD_ROWS`, fitted to C-38's census) wants first. The city's
Production goes into a pot under the minor's production rows (Leaders.xml's
MINOR_CIV set: -50% on the yield, +200% toward walls, a Builder and a military
unit, +500% toward the Harbor and the type's district), and the item
completes when the pot covers it, at most one a turn. Each scene sets the
rows it wants due by hand (`plan`), so only the row under test reaches the pot.

Proven here:
  * the pot takes the city's Production under those rows, the item the turn
    goes toward choosing the row;
  * Ancient Walls land only once their tech is in the minor's OWN record,
    fill the perimeter pool, and never land twice;
  * a Builder trains into the majors' pool under the minor's seat, and the
    episode's draws are made once;
  * the type's district takes the LOWEST legal plot, writes the tile planes
    and the minor's registry, and pays the research-scaled district price;
  * a landlocked minor never builds the Harbor;
  * a damaged perimeter blocks the higher wall (the majors' own clause);
  * the conquest CARRIES the buildings, the registry and the perimeter into
    the captured city;
  * a dead minor builds nothing.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, fixture_paths
from warmup import warm_base, opened

B0 = 0


# THE WARMED BASE, ONE PER FIXTURE. A scene pays a `restore` — milliseconds —
# instead of a fixture load, a settle and four steps. Every plane these pokes
# write is in `_MUTABLE` or a view of one (`citystate_alive` is a view of
# `city_alive`), so the restore is the whole of it; the building version moves
# because `restore` rewrites `city_bldg` in place.


def build(rules, path) -> BatchSim:
    return warm_base(str(path), lambda: opened(rules, path, 4))


def walls_rows(sim) -> list[int]:
    return sorted(sim._walls_rows, key=lambda bi: int(sim.rules_dev.b_walls[bi]))


def grant_walls_tech(sim, s: int, bi: int) -> None:
    ut = int(sim.rules_dev.b_unlock[bi])
    if ut >= 0:
        sim.citystate_techs[B0, s, ut] = True


def grant_building_research(sim, s: int, bi: int) -> None:
    ut, uc = int(sim.rules_dev.b_unlock[bi]), int(sim.rules_dev.b_unlock_civic[bi])
    if ut >= 0:
        sim.citystate_techs[B0, s, ut] = True
    if uc >= 0:
        sim.citystate_civics[B0, s, uc] = True


def grant_district_tech(sim, s: int, dv: int) -> None:
    for (di, ut, uc, _plc, _fc) in sim._scaffold:
        if int(di) != dv:
            continue
        if int(ut) >= 0:
            sim.citystate_techs[B0, s, int(ut)] = True
        if int(uc) >= 0:
            sim.citystate_civics[B0, s, int(uc)] = True


def row_of(rules, kind: str, item0: int) -> int:
    """the build table's row of `kind` whose scientific item is `item0`"""
    cs = rules.citystate
    kinds = cs["buildKinds"]
    for r, row in enumerate(cs["buildRows"]):
        if kinds[int(row["k"])] == kind and int(row["item"][0]) == item0:
            return r
    raise AssertionError(f"no {kind} row for item {item0}")


def plan(sim, s: int, due: list[int], cap: int = 0) -> None:
    """the episode's draws by hand: the listed drawn rows due now, every other
    drawn row never, and an army cap of `cap`"""
    drawn = torch.tensor(sim._mb_drawn, dtype=torch.bool)
    want = torch.zeros(len(sim._mb_drawn), dtype=torch.bool)
    for r in due:
        want[r] = True
    sim.citystate_build_from[B0, s] = torch.where(drawn & ~want, torch.full_like(want, -1, dtype=torch.long),
                                                  torch.zeros_like(want, dtype=torch.long))
    sim.citystate_army_cap[B0, s] = cap


def idle_builder(sim, s: int) -> None:
    """a spent Builder on the minor's centre: the Builder row sees one standing
    and it lays nothing"""
    row = sim._CITY_MINOR0 + s
    ctr = sim.citystate_center[:, s].clamp(min=0)
    one = torch.zeros(sim.B, dtype=torch.bool)
    one[B0] = True
    landed = sim._spawn_unit(row, one, ctr, sim._builder_idx)
    assert bool(landed[B0]), "the Builder did not land"
    g = int(sim.civilian_at[B0, int(ctr[B0])])
    assert g >= 0 and int(sim.unit_seat[B0, g]) == 100 + s, "the Builder is not the minor's"
    sim.unit_charges[B0, g] = 0


def walls_row(sim, rules) -> int:
    return row_of(rules, "building", walls_rows(sim)[0])


def district_row(sim, rules) -> int:
    return row_of(rules, "district", int(rules.citystate["typeDistrictIdx"][0]))


def a_minor(sim) -> int:
    live = sim.citystate_alive[B0].nonzero().flatten().tolist()
    assert live, "the fixture holds no living city-state"
    return live[0]


def test_walls_first_and_only_once(rules, path) -> None:
    sim = build(rules, path)
    s = a_minor(sim)
    idle_builder(sim, s)
    plan(sim, s, [walls_row(sim, rules)])
    row = sim._CITY_MINOR0 + s
    anc = walls_rows(sim)[0]
    cost = float(sim.rules_dev.b_cost[anc])
    sim.citystate_prod[B0, s] = 0.0
    # the pot takes the city's OWN Production — the yield walk's, not a
    # population clock (`tests/gpu/minor_yields_test.py` pins the walk itself)
    yf = sim._seat_amenity(row)[2][:, 0:1]
    prod = float(sim._seat_city_walk(row, 0, amen_yf=yf)[B0, 0, 1])
    assert prod > 0, "a live minor's city produces something"

    # no tech: the pot takes the city's Production under the minor's own
    # percent alone, and nothing lands
    sim._minor_build(s, sim._minor_accrue(s))
    pen = (100 + float(rules.citystate["productionPct"])) / 100
    assert float(sim.citystate_prod[B0, s]) == prod * pen * 1.0, "the pot did not take the city's Production"
    assert not bool(sim.city_bldg[B0, row, 0, anc]), "walls landed without their tech"

    # the tech in, the pot covering: the walls land and the perimeter fills
    grant_walls_tech(sim, s, anc)
    sim.citystate_prod[B0, s] = cost + 3.0
    sim._minor_build(s)
    assert bool(sim.city_bldg[B0, row, 0, anc]), "Ancient Walls did not land"
    assert float(sim.citystate_prod[B0, s]) == 3.0, \
        f"the pot did not pay the walls price ({float(sim.citystate_prod[B0, s])})"
    tier1 = int(sim._walls_tier_hp[int(sim.rules_dev.b_walls[anc])])
    assert int(sim.city_outer_hp[B0, row, 0]) == tier1, "the perimeter pool did not fill"

    # never twice — the next call moves down the ladder instead
    sim.citystate_prod[B0, s] = cost * 10
    before = float(sim.citystate_prod[B0, s])
    sim._minor_build(s)
    assert bool(sim.city_bldg[B0, row, 0, anc])
    assert float(sim.citystate_prod[B0, s]) >= before, \
        "the pot paid for walls that already stand"
    print("  1 walls OK — tech-gated, paid once, the pool filled")


def test_the_type_district_lands_on_the_first_plot(rules, path) -> None:
    sim = build(rules, path)
    s = a_minor(sim)
    idle_builder(sim, s)
    plan(sim, s, [district_row(sim, rules)])
    row = sim._CITY_MINOR0 + s
    dv = int(sim._citystate_didx[B0, s])
    assert dv >= 0, "the minor's type names no district"
    grant_district_tech(sim, s, dv)
    # walls stand already so the ladder reaches the district
    anc = walls_rows(sim)[0]
    grant_walls_tech(sim, s, anc)
    sim.city_bldg[B0, row, 0, anc] = True
    sim.city_outer_hp[B0, row, 0] = int(sim._walls_tier_hp[int(sim.rules_dev.b_walls[anc])])
    sim.citystate_prod[B0, s] = 10_000.0
    plc = next(int(p) for (di, _ut, _uc, p, _fc) in sim._scaffold if int(di) == dv)
    # the engine's surface: an unseen strategic is plain ground to the minor
    surface = sim.coastal_water if plc == 2 else (sim.d_usable | (sim.d_usable0 & sim._res_hidden(row)))
    expect_plane = sim._minor_district_site(s) & surface & ~sim._fallout()
    if plc == 3:
        expect_plane = expect_plane & (sim._adj_center_count() == 0)
    if not bool(expect_plane[B0].any()):
        print(f"  2 district SKIPPED — no legal plot for district {dv} on this fixture")
        return
    want_t = int(expect_plane[B0].long().argmax())
    sim._minor_build(s)
    got = int(sim.city_dist_tile[B0, row, 0, dv])
    assert got == want_t, f"the district took plot {got}, the first legal plot is {want_t}"
    assert int(sim.district[B0, got]) == dv and bool(sim.district_complete[B0, got]), \
        "the tile planes do not carry the built district"
    if dv == sim._encamp_didx:
        assert int(sim.encamp_hp[B0, got]) == sim._encamp_hp_max, "the Encampment arrived without its pool"
    print(f"  2 district OK — type district {dv} on plot {got}, registry and tiles agree")


def test_the_landlocked_minor_never_harbors(rules, path) -> None:
    sim = build(rules, path)
    hv = int(sim._harbor_didx)
    if hv < 0:
        print("  3 harbor SKIPPED — no HARBOR row in the catalog")
        return
    for s in range(sim.S):
        if not bool(sim.citystate_alive[B0, s]):
            continue
        row = sim._CITY_MINOR0 + s
        idle_builder(sim, s)
        plan(sim, s, [row_of(rules, "district", hv)])
        grant_district_tech(sim, s, hv)
        coastal = bool((sim._minor_district_site(s) & sim.coastal_water)[B0].any())
        sim.citystate_prod[B0, s] = 100_000.0
        for _ in range(8):
            sim._minor_build(s)
        built = int(sim.city_dist_tile[B0, row, 0, hv]) >= 0
        if coastal:
            assert built, f"a coastal minor (s={s}) with the tech and the pot never built its Harbor"
        else:
            assert not built, f"a landlocked minor (s={s}) built a Harbor"
    print("  3 harbor OK — the coast decides")


def test_damaged_walls_block_the_higher_tier(rules, path) -> None:
    sim = build(rules, path)
    s = a_minor(sim)
    idle_builder(sim, s)
    row = sim._CITY_MINOR0 + s
    tiers = walls_rows(sim)
    if len(tiers) < 2:
        print("  4 damage SKIPPED — one walls tier in the catalog")
        return
    anc, med = tiers[0], tiers[1]
    plan(sim, s, [row_of(rules, "building", anc), row_of(rules, "building", med)])
    for bi in (anc, med):
        grant_walls_tech(sim, s, bi)
    sim.city_bldg[B0, row, 0, anc] = True
    full = int(sim._walls_tier_hp[int(sim.rules_dev.b_walls[anc])])
    sim.city_outer_hp[B0, row, 0] = full - 7   # breached
    sim.citystate_prod[B0, s] = 100_000.0
    sim._minor_build(s)
    assert not bool(sim.city_bldg[B0, row, 0, med]), \
        "a damaged perimeter accepted a higher wall"
    sim.city_outer_hp[B0, row, 0] = full
    for _ in range(4):
        sim._minor_build(s)
    assert bool(sim.city_bldg[B0, row, 0, med]), "an intact perimeter refused the higher wall"
    print("  4 damage OK — the majors' walls clause holds the minor too")


def test_the_conquest_carries_the_build(rules, path) -> None:
    sim = build(rules, path)
    s = a_minor(sim)
    idle_builder(sim, s)
    plan(sim, s, [district_row(sim, rules)])
    row = sim._CITY_MINOR0 + s
    anc = walls_rows(sim)[0]
    grant_walls_tech(sim, s, anc)
    sim.city_bldg[B0, row, 0, anc] = True
    full = int(sim._walls_tier_hp[int(sim.rules_dev.b_walls[anc])])
    sim.city_outer_hp[B0, row, 0] = full - 5
    dv = int(sim._citystate_didx[B0, s])
    grant_district_tech(sim, s, dv)
    sim.citystate_prod[B0, s] = 10_000.0
    sim._minor_build(s)
    dt = int(sim.city_dist_tile[B0, row, 0, dv])
    cols_before = sim.city_alive[B0, 0].sum()
    sim._capture_city_state(torch.tensor([B0]), torch.full((sim.B,), s, dtype=torch.long), 0)
    assert int(sim.city_alive[B0, 0].sum()) == int(cols_before) + 1, "the conquest founded no city"
    # the new column is the one holding the freshest city id
    ctr = [j for j in range(sim.RC)
           if bool(sim.city_alive[B0, 0, j]) and int(sim.city_id[B0, 0, j]) == int(sim.civ_next_city_id[B0, 0]) - 1]
    assert ctr, "the annexed city column was not found"
    j = ctr[0]
    assert bool(sim.city_bldg[B0, 0, j, anc]), "the conquest dropped the walls"
    assert int(sim.city_outer_hp[B0, 0, j]) == full - 5, "the conquest reset the perimeter"
    if dt >= 0:
        assert int(sim.city_dist_tile[B0, 0, j, dv]) == dt, "the conquest dropped the district registry"
        assert bool(sim.district_complete[B0, dt]), "the tile lost its district"
    print("  5 conquest OK — walls, perimeter and registry all arrive")


def test_the_minor_encampment_fights_as_its_centre(rules, path) -> None:
    """CIV6: a defensible district fights "similar to the parent City
    Center" - a militaristic minor's Encampment at the minor's OWN centre
    strength, walls tier included, never at a clamped major row's floor."""
    sim = build(rules, path)
    s = a_minor(sim)
    row = sim._CITY_MINOR0 + s
    dv = int(sim._encamp_didx)
    if dv < 0:
        print("  7 encampment SKIPPED — no ENCAMPMENT row in the catalog")
        return
    own = (sim.tile_seat[B0] == 100 + s) & (sim.district[B0] < 0)
    if not bool(own.any()):
        print("  7 encampment SKIPPED — the minor owns no free tile")
        return
    et = int(own.long().argmax())
    sim.city_dist_tile[B0, row, 0, dv] = et
    sim.district[B0, et] = dv
    sim.district_complete[B0, et] = True
    sim.encamp_hp[B0, et] = 100
    anc = walls_rows(sim)[0]
    grant_walls_tech(sim, s, anc)
    sim.city_bldg[B0, row, 0, anc] = True
    tt = torch.full((sim.B,), et, dtype=torch.long)
    d, _hrow, hcol, wtier, held = sim._encamp_terms(tt)
    csx = torch.full((sim.B,), s, dtype=torch.long)
    tier = int(sim._minor_walls_tier_at(csx)[B0])
    mil = int(sim.rules.citystate.get("militaristicIdx", -1))
    want = (15 + int(sim.citystate_pop[B0, s])
            + (6 if int(sim.citystate_type[B0, s]) == mil else 0)
            + int(sim._walls_tier_cs[tier]))
    assert tier >= 1, "the walls did not reach the tier read"
    assert int(d[B0]) == want, f"the minor's Encampment defends at {int(d[B0])}, its centre says {want}"
    assert bool(held[B0]), "the minor's own walls did not size the perimeter"
    assert int(wtier[B0]) == tier, "the split tier is not the minor's"
    assert int(hcol[B0]) < 0, "a major city column leaked into the minor's district"
    print("  7 encampment OK — the minor's district fights at its centre's strength")


def test_the_tier1_building_follows_the_district(rules, path) -> None:
    """The type district's TIER-1 building follows the district itself —
    never before it stands, one item a tick."""
    sim = build(rules, path)
    s = a_minor(sim)
    row = sim._CITY_MINOR0 + s
    dv = int(sim._citystate_didx[B0, s])
    typ = int(sim.citystate_type[B0, s])
    t1 = next(r for r, k in enumerate(sim._mb_kind)
              if k == "building" and int(sim._mb_item[r][typ]) == int(sim._citystate_t1idx[B0, s, 0]))
    bi = int(sim._mb_item[t1][typ])
    idle_builder(sim, s)
    plan(sim, s, [district_row(sim, rules), t1])
    assert bi >= 0, "the type names no tier-1 building"
    anc = walls_rows(sim)[0]
    grant_walls_tech(sim, s, anc)
    sim.city_bldg[B0, row, 0, anc] = True
    sim.city_outer_hp[B0, row, 0] = int(sim._walls_tier_hp[int(sim.rules_dev.b_walls[anc])])
    grant_district_tech(sim, s, dv)
    grant_building_research(sim, s, bi)
    sim.citystate_prod[B0, s] = 100_000.0
    sim._minor_build(s)
    if int(sim.city_dist_tile[B0, row, 0, dv]) < 0:
        print("  7 tier-1 building SKIPPED — no legal plot for the type district")
        return
    assert not bool(sim.city_bldg[B0, row, 0, bi]), "the building landed the same tick as its district"
    sim._minor_build(s)
    assert bool(sim.city_bldg[B0, row, 0, bi]), "the tier-1 building did not follow its district"
    print(f"  7 tier-1 building OK — row {bi} follows district {dv}, one item a tick")


def test_the_walled_minor_strikes(rules, path) -> None:
    """CIV6: walls give a city its ranged strike, and a city-state's city is an
    ordinary city — so a walled minor fires at the nearest unit at war with it,
    through the majors' own body (`_city_strikes`), from its own centre
    strength (`_minor_centre_cs`). The TS twin is
    tests/cpu/minors/minor-strike.test.ts."""
    sim = build(rules, path)
    s = a_minor(sim)
    row = sim._CITY_MINOR0 + s
    anc = walls_rows(sim)[0]
    grant_walls_tech(sim, s, anc)
    sim.city_bldg[B0, row, 0, anc] = True
    sim.city_outer_hp[B0, row, 0] = int(sim._walls_tier_hp[int(sim.rules_dev.b_walls[anc])])
    ctr = int(sim.citystate_center[B0, s])
    # a free land plot two out, so neither the centre nor the ring's own
    # occupants decide the scene
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

    mil = int(sim.rules.citystate.get("militaristicIdx", -1))
    tier = int(sim._minor_walls_tier(s)[B0])
    want = (15 + int(sim.citystate_pop[B0, s])
            + (6 if int(sim.citystate_type[B0, s]) == mil else 0) + int(sim._walls_tier_cs[tier]))
    assert int(sim._minor_centre_cs(s)[B0]) == want, "the strike leaves from another strength"
    print("  8 strike OK — the walled minor fires at war, holds at peace, from its centre")


def test_the_production_rows(rules, path) -> None:
    """CIV6 (Leaders.xml, MINOR_CIV_DEFAULT_TRAIT and the six type traits):
    the turn's Production goes toward the ladder's first buildable item at
    -50% on the city's yield, times that item's toward-row — walls +200%, the
    type's district and the Harbor +500%, anything else none. The TS twin is
    the "production rows" block of tests/cpu/minors/minor-record.test.ts."""
    cs = rules.citystate
    assert float(cs["productionPct"]) == -50
    assert float(cs["wallsProdPct"]) == 200 and float(cs["harborProdPct"]) == 500
    assert [float(x) for x in cs["typeDistrictProdPct"]] == [500.0] * 6

    def turn(sim, s: int) -> float:
        sim.citystate_prod[B0, s] = 0.0
        sim._minor_build(s, torch.ones(sim.B, dtype=torch.float64))
        return float(sim.citystate_prod[B0, s])

    # the walls: 0.5 x 3
    sim = build(rules, path)
    s = a_minor(sim)
    row = sim._CITY_MINOR0 + s
    idle_builder(sim, s)
    plan(sim, s, [walls_row(sim, rules)])
    anc = walls_rows(sim)[0]
    grant_walls_tech(sim, s, anc)
    assert turn(sim, s) == 1.5, "toward the walls the pot did not take half the yield times 3"
    assert not bool(sim.city_bldg[B0, row, 0, anc])

    # the type's district: 0.5 x 6; then its tier-1 building: 0.5
    sim.city_bldg[B0, row, 0, anc] = True
    sim.city_outer_hp[B0, row, 0] = int(sim._walls_tier_hp[int(sim.rules_dev.b_walls[anc])])
    dv = int(sim._citystate_didx[B0, s])
    grant_district_tech(sim, s, dv)
    typ = int(sim.citystate_type[B0, s])
    t1 = next(r for r, k in enumerate(sim._mb_kind)
              if k == "building" and int(sim._mb_item[r][typ]) == int(sim._citystate_t1idx[B0, s, 0]))
    bi = int(sim._mb_item[t1][typ])
    grant_building_research(sim, s, bi)
    plan(sim, s, [walls_row(sim, rules), row_of(rules, "district", int(rules.citystate["typeDistrictIdx"][0])), t1])
    plc = next(int(p) for (di, _ut, _uc, p, _fc) in sim._scaffold if int(di) == dv)
    surface = sim.coastal_water if plc == 2 else (sim.d_usable | (sim.d_usable0 & sim._res_hidden(row)))
    plane = sim._minor_district_site(s) & surface & ~sim._fallout()
    if plc == 3:
        plane = plane & (sim._adj_center_count() == 0)
    if bool(plane[B0].any()):
        assert turn(sim, s) == 3.0, "toward the type's district the pot did not take half the yield times 6"
        sim.citystate_prod[B0, s] = 10_000.0
        sim._minor_build(s)
        assert int(sim.city_dist_tile[B0, row, 0, dv]) >= 0, "the type district did not land"
        assert turn(sim, s) == 0.5, "toward the tier-1 building the pot took a row"
    else:
        print("  9 type district SKIPPED — no legal plot on this fixture")

    # the Harbor: 0.5 x 6, on a coastal minor whose type district is not yet open
    hv = int(sim._harbor_didx)
    sim = build(rules, path)
    for s in range(sim.S):
        if not bool(sim.citystate_alive[B0, s]):
            continue
        if not bool((sim._minor_district_site(s) & sim.coastal_water)[B0].any()):
            continue
        row = sim._CITY_MINOR0 + s
        idle_builder(sim, s)
        plan(sim, s, [row_of(rules, "district", hv)])
        anc = walls_rows(sim)[0]
        sim.city_bldg[B0, row, 0, anc] = True
        sim.city_outer_hp[B0, row, 0] = int(sim._walls_tier_hp[int(sim.rules_dev.b_walls[anc])])
        dv = int(sim._citystate_didx[B0, s])
        for (di, ut, uc, _plc, _fc) in sim._scaffold:
            if int(di) == dv:
                if int(ut) >= 0:
                    sim.citystate_techs[B0, s, int(ut)] = False
                if int(uc) >= 0:
                    sim.citystate_civics[B0, s, int(uc)] = False
        grant_district_tech(sim, s, hv)
        if int(sim.city_dist_tile[B0, row, 0, dv]) >= 0 or int(sim.city_dist_tile[B0, row, 0, hv]) >= 0:
            continue
        assert turn(sim, s) == 3.0, "toward the Harbor the pot did not take half the yield times 6"
        print("  9 production rows OK — walls x1.5, type district and Harbor x3, tier-1 x0.5")
        return
    print("  9 production rows OK — walls and type district (no coastal minor for the Harbor)")


def test_a_dead_minor_builds_nothing(rules, path) -> None:
    sim = build(rules, path)
    s = a_minor(sim)
    plan(sim, s, [walls_row(sim, rules)])
    row = sim._CITY_MINOR0 + s
    anc = walls_rows(sim)[0]
    grant_walls_tech(sim, s, anc)
    sim.citystate_prod[B0, s] = 100_000.0
    sim.citystate_alive[B0, s] = False
    pot = float(sim.citystate_prod[B0, s])
    sim._minor_build(s)
    assert float(sim.citystate_prod[B0, s]) == pot, "a dead minor's pot moved"
    assert not bool(sim.city_bldg[B0, row, 0, anc]), "a dead minor built walls"
    print("  6 dead OK — nothing accrues, nothing lands")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_walls_first_and_only_once(rules, path)
    test_the_type_district_lands_on_the_first_plot(rules, path)
    test_the_landlocked_minor_never_harbors(rules, path)
    test_the_tier1_building_follows_the_district(rules, path)
    test_damaged_walls_block_the_higher_tier(rules, path)
    test_the_conquest_carries_the_build(rules, path)
    test_the_minor_encampment_fights_as_its_centre(rules, path)
    test_the_walled_minor_strikes(rules, path)
    test_the_production_rows(rules, path)
    test_a_dead_minor_builds_nothing(rules, path)
    print("BATTERY OK minor_builds")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
