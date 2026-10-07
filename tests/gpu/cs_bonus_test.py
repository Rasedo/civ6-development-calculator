"""City-state envoy/suzerain bonus self-test.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/cs_bonus_test.py

Scripted parity is the primary correctness bar; these pokes cover the part of
the surface the gate reaches only partially (seat 0 rarely passes ~5 envoys
in-gate, so the 3-/6-envoy rows and the suzerain contest edges are exercised
HERE):

  1. Catalog: the exported envoy rows (`CITY_STATE_ENVOY_ROWS`) and the GPU's
     per-bar type tables built from them, and the per-CS suzerain rule code
     round-trips from the fixture.
  2. Seat-0 envoy BUILDING rows: the capital and the LIBRARY pay at 1 envoy,
     the UNIVERSITY at 3, the RESEARCH_LAB at 6, all on the science channel
     (food untouched); removing the LIBRARY shrinks the 1-envoy step; a
     PILLAGED Campus darkens its LIBRARY (TS cityBuildingYields).
  3. Militaristic production toward units off the capital and the
     Barracks-or-Stable / Armory rows, never a yield.
  4. Seat-0 suzerain perk, the Valletta faith class, and the civ mirror of the
     building rows on `_seat_city_yields_all`.

CS slot 0 is FORCED to a type by overriding the derived per-CS tensors, so the
assertions are deterministic regardless of the fixture's placed CS types.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import load_rules, load_fixture, fixture_paths, FIXTURES
from warmup import opened

RULES_J = json.loads((FIXTURES / "rules.json").read_text())
BUILDING_IDS = [b["id"] for b in RULES_J["buildings"]]
SCIENCE = 3  # yield column
FOOD = 0
SCIENTIFIC, TRADE, MILITARISTIC = 0, 2, 4  # CITY_STATE_TYPES order


def city_totals(sim, row: int):
    tier_idx, growth_f, yield_f, _lux = sim._seat_amenity(row)
    maint, housing = sim._seat_housing(row)
    total = sim._seat_city_walk(row, amen_yf=yield_f, maint=maint)
    return total.to(sim.dtype), housing.to(sim.dtype), growth_f.to(sim.dtype), tier_idx


def bidx(bid: str) -> int:
    return BUILDING_IDS.index(bid)


def _force_type_cs0(sim, t: int) -> None:
    """Make CS slot 0 a city-state of type `t` by overriding the derived
    per-CS tensors."""
    sim._cs_type_onehot[0, 0, :] = 0.0
    sim._cs_type_onehot[0, 0, t] = 1.0
    kinds = sim.rules.citystate["typeItemKinds"][t]
    sim._citystate_item_type[0, 0] = len(kinds) > 0
    for _k in sim._citystate_item_kind:
        sim._citystate_item_kind[_k][0, 0] = _k in kinds
    sim.citystate_alive[0, 0] = True
    sim.seat_citystate_met[0, 0, 0] = True


def _force_scientific_cs0(sim) -> None:
    _force_type_cs0(sim, SCIENTIFIC)


def test_catalog(rules, path) -> None:
    sim = opened(rules, path)
    cs = rules.citystate
    rows = {(r["t"], r["e"], tuple(r["b"])): r["a"] for r in cs["envoyRows"]}
    sci = {k[1:]: a for k, a in rows.items() if k[0] == SCIENTIFIC}
    assert sci == {(1, ()): 1, (1, (bidx("LIBRARY"),)): 1, (3, (bidx("CONSULATE"),)): 2,
                   (3, (bidx("UNIVERSITY"),)): 2, (6, (bidx("CHANCERY"),)): 3,
                   (6, (bidx("RESEARCH_LAB"),)): 3}, f"scientific ladder {sci}"
    assert rows[(TRADE, 1, ())] == 2, "Trade's capital row pays 2 Gold"
    assert rows[(MILITARISTIC, 1, (bidx("BARRACKS"), bidx("STABLE")))] == 1, "Barracks OR Stable is one row"
    # the GPU's per-bar type tables
    assert sim._cs_env_bars == [1, 3, 6], sim._cs_env_bars
    assert float(sim._cs_env_ycap[1][SCIENTIFIC]) == 1.0 and float(sim._cs_env_ycap[1][TRADE]) == 2.0
    assert float(sim._cs_env_ycap[1][MILITARISTIC]) == 0.0, "a production type pays no capital yield"
    assert float(sim._cs_env_pcap[1][MILITARISTIC]) == 1.0, "the militaristic capital row toward units"
    assert float(sim._cs_env_ybld[1][SCIENTIFIC, bidx("LIBRARY")]) == 1.0
    assert float(sim._cs_env_ybld[3][SCIENTIFIC, bidx("UNIVERSITY")]) == 2.0
    assert float(sim._cs_env_ybld[6][SCIENTIFIC, bidx("CHANCERY")]) == 3.0
    # NO row rides a flat capital channel any more — every minor names a RULE
    assert "suzerainYield" not in cs, "the flat suzerain channel is retired"
    # per-CS suzerain RULE code round-trips from the fixture
    f = load_fixture(path)
    for s, csr in enumerate(f.get("cityStates", [])):
        assert int(sim.citystate_suz_code[0, s]) == int(csr.get("suzCode", -1)), f"citystate_suz_code[{s}] mismatch"
        assert int(csr.get("suzCode", -1)) >= 0, f"city-state {s} names no suzerain rule"
    print(f"  catalog OK: {len(cs['envoyRows'])} envoy rows, every minor names a rule, "
          f"{len(BUILDING_IDS)} bldgs")


def test_building_bonus(rules, path) -> None:
    sim = opened(rules, path, 6)
    _force_scientific_cs0(sim)
    # kill any other CS so only CS0 contributes
    if sim.S > 1:
        sim.citystate_alive[0, 1:] = False
    li, ui, ri = bidx("LIBRARY"), bidx("UNIVERSITY"), bidx("RESEARCH_LAB")
    sim.city_bldg[0, 0, 0, li] = True
    sim.city_bldg[0, 0, 0, ui] = True
    sim.city_bldg[0, 0, 0, ri] = True

    def sci0(envoys: int) -> tuple[float, float]:
        sim.seat_citystate_envoys[0, 0, 0] = envoys
        sim._eff_version += 1
        total, _, _, _ = city_totals(sim, 0)
        return float(total[0, 0, SCIENCE]), float(total[0, 0, FOOD])

    s0, f0 = sci0(0)
    s1, f1 = sci0(1)   # the capital and the LIBRARY
    s3, f3 = sci0(3)   # + the UNIVERSITY
    s6, f6 = sci0(6)   # + the RESEARCH_LAB
    assert s1 > s0 + 1e-9, f"1-envoy rows did not fire ({s0}->{s1})"
    assert s3 > s1 + 1e-9, f"3-envoy UNIVERSITY row did not fire ({s1}->{s3})"
    assert s6 > s3 + 1e-9, f"6-envoy RESEARCH_LAB row did not fire ({s3}->{s6})"
    assert abs(f1 - f0) < 1e-9 and abs(f3 - f0) < 1e-9 and abs(f6 - f0) < 1e-9, \
        "food changed — a row landed in the wrong channel"
    print(f"  seat-0 building rows OK: science {s0:.2f} -> {s1:.2f}(1e) -> {s3:.2f}(3e) -> {s6:.2f}(6e), food flat")

    # CONTROL: the 0->1 step crosses no suzerain bar; without the LIBRARY it
    # pays the capital row alone
    sim.city_bldg[0, 0, 0, li] = False
    s0b, _ = sci0(0)
    s1b, _ = sci0(1)
    assert (s1 - s0) > (s1b - s0b) + 1e-9, (
        f"the 1-envoy step paid the same with and without the LIBRARY ({s0}->{s1} vs {s0b}->{s1b})")
    print(f"  seat-0 building CONTROL OK: the 1-envoy step is {s1 - s0:.2f} with the LIBRARY "
          f"and {s1b - s0b:.2f} without")


def test_building_pillage(rules, path) -> None:
    sim = opened(rules, path, 6)
    _force_scientific_cs0(sim)
    if sim.S > 1:
        sim.citystate_alive[0, 1:] = False
    # plant a COMPLETE CAMPUS on an owned tile in city 0's window, holding a LIBRARY
    campus_idx = None
    for d in sim.districts_cat:
        if d.get("id") == "CAMPUS":
            campus_idx = int(d["idx"])
    if campus_idx is None:
        print("  pillage test SKIPPED (no CAMPUS district)")
        return
    owned = ((sim.city_slot_at(0)[0] == 0) & (sim.district[0] < 0)).nonzero(as_tuple=True)[0]
    if len(owned) == 0:
        print("  pillage test SKIPPED (no free owned tile)")
        return
    ct = int(owned[0])
    sim.district[0, ct] = campus_idx
    sim.district_complete[0, ct] = True
    sim.district_pillaged[0, ct] = False
    sim.district_dead[0, ct] = False
    # THE REGISTRY is what the yield walk reads (`_bldg_dark` takes the city's
    # district-tile row, TS's `city.districts` twin) — a poke that writes only
    # the tile plane builds a Campus no city owns, and nothing can go dark.
    sim.city_dist_tile[0, 0, 0, campus_idx] = ct
    li = bidx("LIBRARY")
    sim.city_bldg[0, 0, 0, li] = True

    def sci0(envoys: int) -> float:
        sim.seat_citystate_envoys[0, 0, 0] = envoys
        sim._eff_version += 1
        total, _, _, _ = city_totals(sim, 0)
        return float(total[0, 0, SCIENCE])

    s1_live = sci0(1)
    s0_live = sci0(0)
    live_delta = s1_live - s0_live
    assert live_delta > 1e-9, f"LIBRARY-in-Campus bonus did not fire live ({live_delta})"
    # pillage the Campus -> the building goes dark -> bonus vanishes
    sim.district_pillaged[0, ct] = True
    sim._eff_version += 1
    s1_dark = sci0(1)
    s0_dark = sci0(0)
    dark_delta = s1_dark - s0_dark
    # the capital row stands; the LIBRARY's share goes dark
    assert dark_delta < live_delta - 1e-9, (
        f"pillaging the Campus did not darken its LIBRARY: the 1-envoy step still pays "
        f"{dark_delta} against {live_delta} live"
    )
    print(f"  pillage-dark OK: 1-envoy step {live_delta:.2f} live -> {dark_delta:.2f} pillaged "
          "(the remainder is the capital row)")


def test_at_war(rules, path) -> None:
    """CIV6 (PLAYER_HAS_*_INFLUENCE hold REQUIRES_PLAYER_AT_PEACE): a seat at
    war with the minor draws none of its envoy rows (`envoysPaying`)."""
    sim = opened(rules, path, 6)
    _force_scientific_cs0(sim)
    if sim.S > 1:
        sim.citystate_alive[0, 1:] = False
    sim.city_bldg[0, 0, 0, bidx("LIBRARY")] = True

    def sci0(envoys: int) -> float:
        sim.seat_citystate_envoys[0, 0, 0] = envoys
        sim._eff_version += 1
        total, _, _, _ = city_totals(sim, 0)
        return float(total[0, 0, SCIENCE])

    s0, s6 = sci0(0), sci0(6)
    assert s6 > s0 + 1e-9, "the rows pay at peace"
    cs_row = sim.n_majors
    sim.war[0, 0, cs_row] = True
    sim.war[0, cs_row, 0] = True
    s6w = sci0(6)
    assert abs(s6w - s0) < 1e-9, f"at war the envoys still pay ({s0} -> {s6w})"
    print(f"  at-war OK: science {s0:.2f} -> {s6:.2f} at peace, {s6w:.2f} at war")


def test_militaristic_item_prod(rules, path) -> None:
    """CIV6 (Ethiopia_Buildings.xml, the MINOR_CIV_MILITARISTIC_* rows): the
    militaristic ladder is Production toward UNITS — a Settler among them —
    1 in the capital and 1 in a city with a Barracks OR Stable at 1 envoy, 2
    with an Armory (or Consulate) at 3, 3 with a Military Academy (or
    Chancery) at 6, and never a city yield (`cityStateItemProduction`)."""
    sim = opened(rules, path, 6)
    PROD = 1
    _force_type_cs0(sim, MILITARISTIC)
    sim.citystate_suz_code[0, 0] = -1  # keep the suzerain crossing out of the read
    if sim.S > 1:
        sim.citystate_alive[0, 1:] = False
    sim.city_bldg[0, 0, 0, bidx("STABLE")] = True
    col = torch.zeros(1, dtype=torch.long)
    unit = torch.full((1,), sim.UNIT_BASE, dtype=torch.long)
    settler = torch.full((1,), sim.SETTLER, dtype=torch.long)
    building = torch.full((1,), bidx("BARRACKS"), dtype=torch.long)

    def at(envoys: int, cur: torch.Tensor) -> tuple[float, float]:
        sim.seat_citystate_envoys[0, 0, 0] = envoys
        sim._eff_version += 1
        total, _, _, _ = city_totals(sim, 0)
        return float(total[0, 0, PROD]), float(sim._cs_item_prod(0, col, cur)[0])

    sim.city_is_cap[0, 0, 0] = False
    p0, f0 = at(0, unit)
    p1, f1 = at(1, unit)
    p3, f3 = at(3, unit)
    p6, f6 = at(6, unit)
    assert p0 == p1 == p3 == p6, f"the militaristic ladder paid a production YIELD ({p0}, {p1}, {p3}, {p6})"
    assert (f0, f1, f3, f6) == (0.0, 1.0, 1.0, 1.0), f"toward-unit ladder off the capital {(f0, f1, f3, f6)}"
    sim.city_bldg[0, 0, 0, bidx("ARMORY")] = True
    assert at(3, unit)[1] == 3.0, "the ARMORY did not collect the 3-envoy row"
    sim.city_is_cap[0, 0, 0] = True
    assert at(6, unit)[1] == 4.0 and at(6, settler)[1] == 4.0, "the capital row missed a unit or a Settler"
    assert at(6, building)[1] == 0.0, "the militaristic ladder paid toward a building"
    sim.city_bldg_pillaged[0, 0, 0, bidx("ARMORY")] = True
    assert at(6, unit)[1] == 2.0, "a pillaged ARMORY still counted"
    print(f"  militaristic toward-units OK: no yield ({p0:.2f}), 0/1/1/1 off the capital, "
          "+2 Armory, +1 capital, pillage-dark")


def test_suzerain(rules, path) -> None:
    sim = opened(rules, path, 6)
    _force_scientific_cs0(sim)
    if sim.S > 1:
        sim.citystate_alive[0, 1:] = False
    # seat 0 STRICTLY suzerain of CS0: 4 envoys, civ seats at 0
    sim.seat_citystate_envoys[0, 0, 0] = 4
    if sim.n_majors > 1:
        sim.seat_citystate_envoys[0, 1:, 0] = 0
    # Geneva's rule is the one whose whole effect lands on the SCIENCE column
    assert sim._suz_c_sci_peace >= 0, "the Geneva code is missing from the rules"
    sim.war[0, 0, : sim.n_majors] = False
    sim.war[0, : sim.n_majors, 0] = False
    sim.sync_war()

    def cap_sci(code: int) -> float:
        sim.citystate_suz_code[0, 0] = code
        sim._eff_version += 1
        total, _, _, _ = city_totals(sim, 0)
        return float(total[0, 0, SCIENCE])

    ship = cap_sci(sim._suz_c_sci_peace)
    desc = cap_sci(-1)
    assert ship > desc + 1e-9, f"the suzerain rule did not reach the city ({desc}->{ship})"
    print(f"  seat-0 suzerain OK: city science {desc:.2f} -> {ship:.2f} "
          f"(+{sim._suz_sci_pct:.0f}%)")

    # contest lost: a civ seat out-envoys seat 0 -> no perk
    if sim.n_majors > 1:
        sim.citystate_suz_code[0, 0] = sim._suz_c_sci_peace
        sim.seat_citystate_envoys[0, 1, 0] = 9  # civ 0 dominates
        sim._eff_version += 1
        total, _, _, _ = city_totals(sim, 0)
        contested = float(total[0, 0, SCIENCE])
        assert abs(contested - desc) < 1e-9, f"suzerain perk paid while contest LOST ({contested} vs {desc})"
        print("  seat-0 suzerain CONTEST OK: a civ out-envoys seat 0 -> no perk")


def test_faith_class(rules, path) -> None:
    """CIV6 (Valletta's suzerain): "City Center buildings and Encampment
    district buildings can be bought with Faith. Cost of purchasing Ancient,
    Medieval, and Renaissance Walls is reduced, but they can only be bought
    with Faith." Unreachable in the gate — the scripted seats never carry a
    minor past one envoy — so the class rule, the currency and the gold
    refusal are poked."""
    sim = opened(rules, path, 20)
    assert sim._suz_c_faith_bldg >= 0, "the suz-effect table carries no faithBuildings code"
    row = 1
    if sim.S > 1:
        sim.citystate_alive[0, 1:] = False
    sim.citystate_alive[0, 0] = True
    sim.citystate_suz_code[0, 0] = sim._suz_c_faith_bldg
    sim.seat_citystate_envoys[0, :, 0] = 0
    sim.seat_citystate_envoys[0, row, 0] = 4
    sim._eff_version += 1
    assert bool(sim._suz_effect(row, sim._suz_c_faith_bldg)[0]), "the suzerain read did not take"

    held = torch.ones(1, dtype=torch.bool)
    sim.civ_faith[0, row] = 10_000.0
    ok, j, b = sim._seat_class_buy_candidate(row, held)
    assert bool(ok[0]), "no class purchase offered to a Valletta suzerain with a full purse"
    bi = int(b[0])
    rq = int(sim._b_req_district[bi])
    assert rq == -1 or rq == sim._encamp_didx,         f"the candidate named {BUILDING_IDS[bi]}, which is neither a City Center nor an Encampment row"

    # CIV6: a building in the queue sells (`purchasableBuildings`) — put the
    # candidate on order, and it is still the candidate
    jc = int(j[0])
    sim.city_current[0, row, jc] = -1
    sim.city_current[0, row, jc, 0] = bi
    sim.city_progress[0, row, jc, 0] = 7.0
    bank0 = float(sim.city_prod_bank[0, row, jc])
    ok, j, b = sim._seat_class_buy_candidate(row, held)
    assert bool(ok[0]) and int(b[0]) == bi and int(j[0]) == jc, "a queued building stopped selling for faith"

    # the FAITH price, and the write
    price = float(sim._class_faith_cost(row, b)[0])
    assert abs(price - float(sim.rules_dev.b_cost[bi]) * sim.rules.faith_purchase_mult) < 1e-9,         "the class purchase is not priced at the faith rate"
    f0 = float(sim.civ_faith[0, row])
    sim._seat_buy_building_faith(row, ok, j, b, sim._class_faith_cost(row, b))
    assert bool(sim.city_bldg[0, row, jc, bi]), "the faith-bought building did not land in the city"
    assert abs(float(sim.civ_faith[0, row]) - (f0 - price)) < 1e-9, "the faith was not spent"
    assert int(sim.city_current[0, row, jc, 0]) == -1, "the bought building stayed on order"
    assert abs(float(sim.city_prod_bank[0, row, jc]) - (bank0 + 7.0)) < 1e-9, "the queued hammers did not bank"
    # CIV6: a pillaged building is repaired from the queue alone
    sim.city_bldg_pillaged[0, row, jc, bi] = True
    sim._eff_version += 1
    assert not bool(sim._seat_buildable(row, True, purchase=True)[0, jc, bi]), "a repair sells for faith"
    sim.city_bldg_pillaged[0, row, jc, bi] = False

    # CIV6 (Leaders.xml, MINOR_CIV_VALLETTA_PURCHASE_CHEAPER_{WALLS,CASTLE,
    # STAR}_BONUS): ADJUST_BUILDING_PURCHASE_COST Amount 50 — the three walls
    # come at half, and no other row of the class moves.
    _walls = [i for i in sim._walls_rows]
    assert _walls, "the catalog carries no walls row"
    _wi = torch.full((sim.B,), _walls[0], dtype=torch.long, device=sim.device)
    _full = float(sim.rules_dev.b_cost[_walls[0]]) * sim.rules.faith_purchase_mult
    _got = float(sim._class_faith_cost(row, _wi)[0])
    assert abs(_got - round(_full * (100 - sim._valletta_walls_pct) / 100)) < 1e-9, (
        f"a Valletta suzerain pays {_got} for the walls, not the discounted "
        f"{round(_full * (100 - sim._valletta_walls_pct) / 100)}")
    assert abs(float(sim._class_faith_cost(row, b)[0]) - price) < 1e-9, (
        "a non-walls row of the class must not take the discount")

    # a seat with no such suzerain is offered nothing
    sim.seat_citystate_envoys[0, row, 0] = 0
    sim._eff_version += 1
    ok2, _, _ = sim._seat_class_buy_candidate(row, held)
    assert not bool(ok2[0]), "the class purchase survived the loss of the suzerain"
    print(f"  faith-class OK: {BUILDING_IDS[bi]} bought for {price:.0f} faith, gone without the suzerain")


def test_walls_faith_only(rules, path) -> None:
    """... and the walls half: with the suzerain held, no walls row is offered
    to the GOLD buy any more."""
    sim = opened(rules, path, 20)
    assert sim._walls_rows, "no walls rows in this build"
    row = 1
    active = torch.ones(1, dtype=torch.bool)
    sim.civ_treasury[0, row] = 100_000.0
    if sim.S > 1:
        sim.citystate_alive[0, 1:] = False
    sim.citystate_alive[0, 0] = True
    sim.citystate_suz_code[0, 0] = sim._suz_c_faith_bldg
    sim.seat_citystate_envoys[0, :, 0] = 0
    sim._eff_version += 1
    _, _, _, _, elig_free = sim._seat_buy_candidates(row, active)
    sim.seat_citystate_envoys[0, row, 0] = 4
    sim._eff_version += 1
    _, _, _, _, elig_suz = sim._seat_buy_candidates(row, active)
    wr = torch.tensor(sim._walls_rows, dtype=torch.long)
    assert not bool(elig_suz[:, :, wr].any()), "a walls row survived the gold buy under the suzerain"
    kept = elig_suz[:, :, [i for i in range(elig_suz.shape[2]) if i not in set(sim._walls_rows)]]
    kept_free = elig_free[:, :, [i for i in range(elig_free.shape[2]) if i not in set(sim._walls_rows)]]
    assert bool((kept == kept_free).all()), "the walls refusal moved a NON-walls row"
    print("  walls faith-only OK: the three walls leave the gold buy, nothing else moves")


def test_civ_bonus(rules, path) -> None:
    sim = opened(rules, path, 20)
    if sim.n_majors == 1:
        print("  civ test SKIPPED (no civs)")
        return
    r = 0
    live = (sim.city_alive[0, r + 1]).nonzero(as_tuple=True)[0]
    if len(live) == 0:
        print("  civ test SKIPPED (civ 0 has no cities)")
        return
    j = int(live[0])
    _force_scientific_cs0(sim)
    if sim.S > 1:
        sim.citystate_alive[0, 1:] = False
    li, ui = bidx("LIBRARY"), bidx("UNIVERSITY")
    sim.city_bldg[0, r + 1, j, li] = True
    sim.city_bldg[0, r + 1, j, ui] = True
    sim.city_bldg[0, r + 1, j, bidx("RESEARCH_LAB")] = True

    def rsci(renvoys: int, suz_code: int = -1) -> float:
        sim.seat_citystate_envoys[0, r + 1, 0] = renvoys
        sim.citystate_suz_code[0, 0] = suz_code
        sim._eff_version += 1
        # _seat_city_yields_all returns (food, prod, sci, cul, gold, faith).
        food, prod, sci, cul, gold, faith = sim._seat_city_yields_all(r + 1)
        return float(sci[0, j])

    r1 = rsci(1)   # the LIBRARY on THIS city (and the capital row if it is the capital)
    r3 = rsci(3)   # + the UNIVERSITY
    r6 = rsci(6)   # + the RESEARCH_LAB
    assert r3 > r1 + 1e-9, f"civ 3-envoy building bonus did not fire ({r1}->{r3})"
    assert r6 > r3 + 1e-9, f"civ 6-envoy building bonus did not fire ({r3}->{r6})"
    print(f"  civ building bonus OK: science {r1:.2f}(1e) -> {r3:.2f}(3e) -> {r6:.2f}(6e)")

    # civ suzerain perk on the CAPITAL: force this rc to be the capital and
    # make the civ seat strictly suzerain (envoys 4, every other seat at 0)
    sim.city_is_cap[0, r + 1, j] = True
    sim.seat_citystate_envoys[0, 0, 0] = 0
    sim.seat_citystate_envoys[0, 1:, 0] = 0
    sim.seat_citystate_envoys[0, r + 1, 0] = 4
    sim.war[0, r + 1, : sim.n_majors] = False
    sim.war[0, : sim.n_majors, r + 1] = False
    sim.sync_war()
    ship = rsci(4, suz_code=sim._suz_c_sci_peace)
    desc = rsci(4, suz_code=-1)
    assert ship > desc + 1e-9, f"civ suzerain perk did not reach the city ({desc}->{ship})"
    print(f"  civ suzerain OK: rc science with the rule {ship:.2f} vs without {desc:.2f}")


def main() -> None:
    rules = load_rules()
    paths = fixture_paths()
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    p = paths[0]
    print(f"cs_bonus_test on {p.name}:")
    test_catalog(rules, p)
    test_building_bonus(rules, p)
    test_building_pillage(rules, p)
    test_at_war(rules, p)
    test_militaristic_item_prod(rules, p)
    test_suzerain(rules, p)
    test_faith_class(rules, p)
    test_walls_faith_only(rules, p)
    test_civ_bonus(rules, p)
    print("CS_BONUS OK")


if __name__ == "__main__":
    main()
