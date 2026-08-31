"""THE MINOR BUILDS — a city-state's city develops.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/minor_builds_test.py

CIV6 (City-state): a city-state "will build a district within their territory
that corresponds to their type", a Harbor when it sits on the coast, and
walls. The pace is the `minorResearch` stylization: POPULATION points a turn
into a production pot, and the ladder's first buildable item completes when
the pot covers it, at most one a turn.

Proven here:
  * the pot accrues population points and the first item is Ancient Walls —
    landing only once its tech is in the minor's OWN record, filling the
    perimeter pool, and never landing twice;
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
from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all

B0 = 0


def build(rules, path) -> BatchSim:
    sim = settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64))
    for _ in range(4):
        sim.step()
    return sim


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


def a_minor(sim) -> int:
    live = sim.citystate_alive[B0].nonzero().flatten().tolist()
    assert live, "the fixture holds no living city-state"
    return live[0]


def test_walls_first_and_only_once(rules, path) -> None:
    sim = build(rules, path)
    s = a_minor(sim)
    row = sim._CITY_MINOR0 + s
    anc = walls_rows(sim)[0]
    cost = float(sim.rules_dev.b_cost[anc])
    sim.citystate_prod[B0, s] = 0.0
    pop = int(sim.citystate_pop[B0, s])

    # no tech: the pot accrues, nothing lands
    sim._minor_build()
    assert float(sim.citystate_prod[B0, s]) == pop, "the pot did not take its population points"
    assert not bool(sim.city_bldg[B0, row, 0, anc]), "walls landed without their tech"

    # the tech in, the pot covering: the walls land and the perimeter fills
    grant_walls_tech(sim, s, anc)
    sim.citystate_prod[B0, s] = cost + 3.0
    sim._minor_build()
    assert bool(sim.city_bldg[B0, row, 0, anc]), "Ancient Walls did not land"
    assert float(sim.citystate_prod[B0, s]) == 3.0 + pop, \
        f"the pot did not pay the walls price ({float(sim.citystate_prod[B0, s])})"
    tier1 = int(sim._walls_tier_hp[int(sim.rules_dev.b_walls[anc])])
    assert int(sim.city_outer_hp[B0, row, 0]) == tier1, "the perimeter pool did not fill"

    # never twice — the next call moves down the ladder instead
    sim.citystate_prod[B0, s] = cost * 10
    before = float(sim.citystate_prod[B0, s])
    sim._minor_build()
    assert bool(sim.city_bldg[B0, row, 0, anc])
    assert float(sim.citystate_prod[B0, s]) >= before, \
        "the pot paid for walls that already stand"
    print("  1 walls OK — tech-gated, paid once, the pool filled")


def test_the_type_district_lands_on_the_first_plot(rules, path) -> None:
    sim = build(rules, path)
    s = a_minor(sim)
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
    surface = sim.coastal_water if plc == 2 else sim.d_usable
    expect_plane = sim._minor_district_site(s) & surface & ~sim._fallout()
    if plc == 3:
        expect_plane = expect_plane & (sim._adj_center_count() == 0)
    if not bool(expect_plane[B0].any()):
        print(f"  2 district SKIPPED — no legal plot for district {dv} on this fixture")
        return
    want_t = int(expect_plane[B0].long().argmax())
    sim._minor_build()
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
        grant_district_tech(sim, s, hv)
        coastal = bool((sim._minor_district_site(s) & sim.coastal_water)[B0].any())
        sim.citystate_prod[B0, s] = 100_000.0
        for _ in range(8):
            sim._minor_build()
        built = int(sim.city_dist_tile[B0, row, 0, hv]) >= 0
        if coastal:
            assert built, f"a coastal minor (s={s}) with the tech and the pot never built its Harbor"
        else:
            assert not built, f"a landlocked minor (s={s}) built a Harbor"
    print("  3 harbor OK — the coast decides")


def test_damaged_walls_block_the_higher_tier(rules, path) -> None:
    sim = build(rules, path)
    s = a_minor(sim)
    row = sim._CITY_MINOR0 + s
    tiers = walls_rows(sim)
    if len(tiers) < 2:
        print("  4 damage SKIPPED — one walls tier in the catalog")
        return
    anc, med = tiers[0], tiers[1]
    for bi in (anc, med):
        grant_walls_tech(sim, s, bi)
    sim.city_bldg[B0, row, 0, anc] = True
    full = int(sim._walls_tier_hp[int(sim.rules_dev.b_walls[anc])])
    sim.city_outer_hp[B0, row, 0] = full - 7   # breached
    sim.citystate_prod[B0, s] = 100_000.0
    sim._minor_build()
    assert not bool(sim.city_bldg[B0, row, 0, med]), \
        "a damaged perimeter accepted a higher wall"
    sim.city_outer_hp[B0, row, 0] = full
    for _ in range(4):
        sim._minor_build()
    assert bool(sim.city_bldg[B0, row, 0, med]), "an intact perimeter refused the higher wall"
    print("  4 damage OK — the majors' walls clause holds the minor too")


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
    sim.citystate_prod[B0, s] = 10_000.0
    sim._minor_build()
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


def test_a_dead_minor_builds_nothing(rules, path) -> None:
    sim = build(rules, path)
    s = a_minor(sim)
    row = sim._CITY_MINOR0 + s
    anc = walls_rows(sim)[0]
    grant_walls_tech(sim, s, anc)
    sim.citystate_prod[B0, s] = 100_000.0
    sim.citystate_alive[B0, s] = False
    pot = float(sim.citystate_prod[B0, s])
    sim._minor_build()
    assert float(sim.citystate_prod[B0, s]) == pot, "a dead minor's pot moved"
    assert not bool(sim.city_bldg[B0, row, 0, anc]), "a dead minor built walls"
    print("  6 dead OK — nothing accrues, nothing lands")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_walls_first_and_only_once(rules, path)
    test_the_type_district_lands_on_the_first_plot(rules, path)
    test_the_landlocked_minor_never_harbors(rules, path)
    test_damaged_walls_block_the_higher_tier(rules, path)
    test_the_conquest_carries_the_build(rules, path)
    test_the_minor_encampment_fights_as_its_centre(rules, path)
    test_a_dead_minor_builds_nothing(rules, path)
    print("BATTERY OK minor_builds")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
