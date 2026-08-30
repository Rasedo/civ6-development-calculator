"""GS POWER on the batched engine: demand, the two supplies, and what a lit
city pays.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/power_test.py

Scripted parity proves the two engines agree; these pokes prove the RULES,
because a gate lane reaches an Industrial-era grid only by accident:

  1. `_city_power_need` + `_resolve_seat_power` — the base load is what the standing buildings ask plus
     `laser_power_load` per Terrestrial Laser Station; a pillaged district's
     buildings drop out of it; the load is met in FULL or not at all.
  2. THE PLANT — a power plant on a COMPLETE, unpillaged Industrial Zone
     supplies every same-seat city centre within the regional reach, and no
     farther; a pillaged Zone supplies nobody.
  3. CARDIFF — the renewable supply, `cardiff_harbor_power` per Harbor
     building, and only for the city that holds them.
  4. THE POWERED HALVES — a lit city adds `b_pow_yields` to its local
     building bucket and `b_pow_amenities` to its amenity base, and a
     REGIONAL building pays its powered half from any lit source that reaches.
  5. THE COAL PLANT — its Industrial Zone's adjacency, as LOCAL production.
  6. `_spec_tb` — a district's specialist tier lifts on ANY ONE of its top
     buildings (the Industrial Zone accepts all three plants).
  7. THE RENEWABLES — a Solar/Wind Farm supplies the city that owns its
     plot, a pillaged one supplies nothing, and the Biosphere triples every
     renewable the seat holds (the Dam's included).
  8. THE REACTOR — its age ticks with the Nuclear plant standing, clears when
     the building goes, and the Recommission project puts it back to 0. The
     project's own gate is the plant plus Nuclear Fission.
  9. THE STOCKPILE the plants burn — `_seat_accrue_stockpile` per improved
     source and its ceiling, `_charge_unit_resource` at the train, and the
     heal `_res_starved` denies a unit whose source the seat has lost.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, fixture_paths  # noqa: E402
from core.simbase import FIXTURES, NO_SEAT  # noqa: E402
from warmup import settle_all  # noqa: E402


def build(rules, path, b: int = 2):
    sim = settle_all(BatchSim([load_fixture(path) for _ in range(b)], rules,
                              device="cpu", dtype=torch.float64))
    for _ in range(20):
        sim.step()
    return sim


def a_city(sim) -> tuple[int, int]:
    for row in range(sim.n_majors):
        live = sim.city_alive[0, row].nonzero().flatten()
        if live.numel():
            return row, int(live[0])
    raise AssertionError("no living city in the fixture")


BIDS = [b["id"] for b in json.loads((FIXTURES / "rules.json").read_text())["buildings"]]


def bidx(sim, name: str) -> int:
    return BIDS.index(name)


def lit(sim, row: int, j: int, fuel: int = 99) -> bool:
    """Resolve the grid with fuel to spare — the fuel's own rule has its own
    case, and every other case is about demand and reach."""
    sim.civ_stockpile[:, row] = fuel
    sim._resolve_seat_power(row)
    return bool(sim.city_powered[0, row, j])


def put_district(sim, row: int, j: int, di: int, *, complete: bool = True) -> int:
    """Give city (row, j) a district of catalog type `di` on a free owned plot."""
    free = [t for t in range(sim.T)
            if int(sim.tile_seat[0, t]) == row and int(sim.district[0, t]) < 0
            and int(sim.built_wonder[0, t]) < 0 and bool(sim.passable[0, t])
            and int(sim.centre_slot_at[0, t]) < 0]
    assert free, "the city owns no free plot"
    t = free[0]
    sim.district[0, t] = di
    sim.district_complete[0, t] = complete
    sim.district_pillaged[0, t] = False
    sim.city_dist_tile[0, row, j, di] = t
    sim._tile_owner_ver += 1
    return t


def demand_of(sim, row: int, j: int) -> float:
    stand = sim.city_bldg[0, row, j] & ~sim._bldg_dark(sim.city_dist_tile[:, row, :sim.RC])[0, j]
    return float(stand.double() @ sim._b_power) + float(sim.city_lasers[0, row, j]) * sim._laser_power_load


def test_demand(sim) -> None:
    row, j = a_city(sim)
    iz = sim._iz_idx
    assert iz >= 0, "the fixture's district catalog must carry an Industrial Zone"
    izt = put_district(sim, row, j, iz)
    fac, lab = bidx(sim, "FACTORY"), bidx(sim, "RESEARCH_LAB")
    assert float(sim._b_power[fac]) == 2.0, "CIV6 (Factory, GS): Base Load 2"
    assert float(sim._b_power[lab]) == 3.0, "CIV6 (Research Lab, GS): Base Load 3"
    assert not lit(sim, row, j), "a city with no load is not powered"
    sim.city_bldg[0, row, j, fac] = True
    assert not lit(sim, row, j), "a load with no supply leaves the city dark"
    assert demand_of(sim, row, j) == 2.0, "the Factory's load is the whole demand"
    # a laser station adds its own load, whether or not anything else does
    sim.city_lasers[0, row, j] = 2
    assert demand_of(sim, row, j) == 2.0 + 2 * sim._laser_power_load, "two stations add two loads"
    # a PILLAGED district takes its buildings out of the demand, like their yields
    sim.district_pillaged[0, izt] = True
    assert demand_of(sim, row, j) == 2 * sim._laser_power_load,         "a dark Factory asks for nothing; the stations still do"
    print("  demand OK: the standing buildings' Base Load plus the stations'")


def test_plant_reach(sim) -> None:
    row, j = a_city(sim)
    iz = sim._iz_idx
    izt = put_district(sim, row, j, iz)
    fac, coal = bidx(sim, "FACTORY"), bidx(sim, "COAL_POWER_PLANT")
    assert bool(sim._b_powerplant[coal]), "the Coal Power Plant supplies its region"
    sim.city_bldg[0, row, j, fac] = True
    sim.city_bldg[0, row, j, coal] = True
    assert lit(sim, row, j), "a plant on a complete Zone lights its own city"
    # every same-seat centre within the regional reach, and no farther
    reach = sim._regional_range
    for k in range(sim.RC):
        if k == j or not bool(sim.city_alive[0, row, k]):
            continue
        sim.city_bldg[0, row, k, fac] = True
        d = int(sim.pair_dist[izt, int(sim.city_center[0, row, k])])
        assert lit(sim, row, k) == (d <= reach), \
            f"city {k} at {d} hexes from the plant's Zone (reach {reach})"
    # a pillaged Zone supplies nobody, itself included
    sim.district_pillaged[0, izt] = True
    assert not lit(sim, row, j), "a pillaged Industrial Zone is not a supply"
    sim.district_pillaged[0, izt] = False
    # ...and neither is an unfinished one
    sim.district_complete[0, izt] = False
    assert not lit(sim, row, j), "an unfinished Zone is not a supply"
    print("  plant OK: the Zone's reach to a city CENTRE, complete and unpillaged")


def test_cardiff(sim) -> None:
    row, j = a_city(sim)
    assert sim._suz_c_harbor_pow >= 0, "harborPower must be a suzerain RULE"
    hb = sim._harbor_idx
    assert hb >= 0
    put_district(sim, row, j, hb)
    put_district(sim, row, j, sim._iz_idx)
    lgh, fac = bidx(sim, "LIGHTHOUSE"), bidx(sim, "FACTORY")
    sim.city_bldg[0, row, j, lgh] = True
    sim.city_bldg[0, row, j, fac] = True
    assert not lit(sim, row, j), "no suzerain, no renewable supply"
    # make this row the strict suzerain of a minor carrying Cardiff's rule
    assert sim.S > 0, "the fixture must carry a city-state to suzerain"
    sim.seat_citystate_envoys[0, :, 0] = 0
    sim.seat_citystate_envoys[0, row, 0] = 3
    sim.citystate_suz_code[0, 0] = sim._suz_c_harbor_pow
    sim._eff_version += 1
    assert float(sim._cardiff_harbor_power) == 2.0, "CIV6 (Cardiff): +2 Power per Harbor building"
    assert lit(sim, row, j, fuel=0), "one Harbor building covers the Factory's load of 2 with no plant at all"
    # a second load the supply cannot cover darkens the WHOLE city
    sim.city_bldg[0, row, j, bidx(sim, "RESEARCH_LAB")] = True
    assert not lit(sim, row, j, fuel=0), "the load is met in full or not at all"
    print("  cardiff OK: the renewable supply, and the all-or-nothing rule")


def test_powered_yields(sim) -> None:
    row, j = a_city(sim)
    campus = next(i for i, d in enumerate(sim.districts_cat) if d.get("id") == "CAMPUS")
    put_district(sim, row, j, campus)
    izt = put_district(sim, row, j, sim._iz_idx)
    lab = bidx(sim, "RESEARCH_LAB")
    sim.city_bldg[0, row, j, lab] = True
    yf = torch.ones(sim.B, sim.RC, dtype=torch.float64, device=sim.device)
    dark = sim._seat_city_walk(row, j, amen_yf=yf[:, j:j + 1])[0, 0, 3]
    sim.city_bldg[0, row, j, bidx(sim, "COAL_POWER_PLANT")] = True
    assert lit(sim, row, j)
    y_lit = sim._seat_city_walk(row, j, amen_yf=yf[:, j:j + 1])[0, 0, 3]
    # CIV6 (Research Lab, GS): "+3 Science", "+5 Science additionally when Powered"
    assert float(y_lit - dark) == 5.0, f"the powered half must be +5 science, got {float(y_lit - dark)}"
    # THE COAL PLANT's own local production: the Zone's adjacency
    adj = float(sim._district_adj_seat(row, sim._iz_idx)[0, izt])
    prod_lit = sim._seat_city_walk(row, j, amen_yf=yf[:, j:j + 1])[0, 0, 1]
    sim.city_bldg[0, row, j, bidx(sim, "COAL_POWER_PLANT")] = False
    lit(sim, row, j)
    prod_dark = sim._seat_city_walk(row, j, amen_yf=yf[:, j:j + 1])[0, 0, 1]
    assert float(prod_lit - prod_dark) == adj, \
        f"the Coal plant banks its Zone's adjacency ({adj}) as local production"
    print("  powered yields OK: the second half, and the Coal plant's adjacency")


def test_regional_powered(sim) -> None:
    row, j = a_city(sim)
    put_district(sim, row, j, sim._iz_idx)
    fac, coal = bidx(sim, "FACTORY"), bidx(sim, "COAL_POWER_PLANT")
    assert bool(sim._b_regional[fac]), "the Factory's production is regional"
    sim.city_bldg[0, row, j, fac] = True
    lit(sim, row, j)
    base = sim._seat_regional(row)
    assert base is not None
    y_dark = float(base[0][0, j, 1])
    sim.city_bldg[0, row, j, coal] = True
    assert lit(sim, row, j)
    y_lit = float(sim._seat_regional(row)[0][0, j, 1])
    # CIV6 (Factory, GS): +3 Production regionally, +3 more when powered
    assert y_lit - y_dark == float(sim._b_pow_y[fac, 1]) > 0, \
        f"the regional powered half must land, got {y_lit - y_dark}"
    # the AMENITY half of the same rule: a powered Stadium pays its second pair
    ec = next(i for i, d in enumerate(sim.districts_cat) if d.get("id") == "ENTERTAINMENT_COMPLEX")
    put_district(sim, row, j, ec)
    std = bidx(sim, "STADIUM")
    assert float(sim._b_pow_am[std]) == 2.0, "CIV6 (Stadium, GS): +2 Amenities when Powered"
    sim.city_bldg[0, row, j, std] = True
    sim.city_bldg[0, row, j, coal] = False
    lit(sim, row, j)
    am_dark = float(sim._seat_regional(row)[1][0, j])
    sim.city_bldg[0, row, j, coal] = True
    assert lit(sim, row, j)
    am_lit = float(sim._seat_regional(row)[1][0, j])
    assert am_lit - am_dark == 2.0, f"the Stadium's powered amenities must land, got {am_lit - am_dark}"
    print("  regional OK: the powered half rides the same reach, yields and amenities")


def test_fuel(sim) -> None:
    row, j = a_city(sim)
    izt = put_district(sim, row, j, sim._iz_idx)
    lab, coal = bidx(sim, "RESEARCH_LAB"), bidx(sim, "COAL_POWER_PLANT")
    sim.city_bldg[0, row, j, lab] = True     # Base Load 3
    sim.city_bldg[0, row, j, coal] = True
    slot, rate = int(sim._b_fuel_slot[coal]), int(sim._b_fuel_rate[coal])
    assert slot >= 0 and rate == 4, "CIV6 (Coal Power Plant): 1 Coal -> 4 Power"
    sim.civ_stockpile[:, row] = 0
    sim._resolve_seat_power(row)
    assert not bool(sim.city_powered[0, row, j]), "a plant with nothing to convert powers nothing"
    sim.civ_stockpile[:, row, slot] = 2
    sim._resolve_seat_power(row)
    assert bool(sim.city_powered[0, row, j]), "two Coal covers a load of 3"
    assert int(sim.civ_stockpile[0, row, slot]) == 1, "a load of 3 at 1:4 costs ONE Coal"
    sim._resolve_seat_power(row)
    assert int(sim.civ_stockpile[0, row, slot]) == 0
    sim._resolve_seat_power(row)
    assert not bool(sim.city_powered[0, row, j]), "the bank ran out"
    assert izt >= 0
    print("  fuel OK: the plant converts its own stockpile, and stops when it is empty")


def a_source(sim, row: int, rid: int = -1) -> tuple[int, int]:
    """A map tile carrying a strategic resource, handed to seat `row` and
    improved. Returns (tile, stockpile slot)."""
    strat = {r: k for k, r in enumerate(sim._strat_rid)}
    t = next(t for t in range(sim.T)
             if int(sim.res_id[0, t]) in strat and rid in (-1, int(sim.res_id[0, t])))
    sim.tile_seat[0, t] = row
    sim.improvement[0, t] = sim.res_imp[0, t]
    sim.pillaged[0, t] = False
    sim._tile_owner_ver += 1
    return t, strat[int(sim.res_id[0, t])]


def test_accrual(sim) -> None:
    row, _ = a_city(sim)
    t, k = a_source(sim, row)
    rate = sim._strat_rate[k]
    assert int(sim.res_imp[0, t]) >= 0, "a strategic source names the improvement that works it"
    sim.civ_stockpile[:, row] = 0
    sim._seat_accrue_stockpile(row)
    assert int(sim.civ_stockpile[0, row, k]) == rate, "one improved source pays its published number"
    sim._seat_accrue_stockpile(row)
    assert int(sim.civ_stockpile[0, row, k]) == 2 * rate
    # pillaged, then unimproved, pays nothing
    sim.pillaged[0, t] = True
    sim._seat_accrue_stockpile(row)
    assert int(sim.civ_stockpile[0, row, k]) == 2 * rate, "a pillaged source pays nothing"
    sim.pillaged[0, t] = False
    sim.improvement[0, t] = -1
    sim._seat_accrue_stockpile(row)
    assert int(sim.civ_stockpile[0, row, k]) == 2 * rate, "an unimproved source pays nothing"
    # the CAP, and what an Encampment building does to it
    cap0 = int(sim._stockpile_cap(row)[0])
    assert cap0 == sim._stock_cap_base, "the ceiling starts at the published base"
    enc = next(i for i in range(sim.NB) if int(sim._b_req_district[i]) == sim._encampment_didx)
    j = int(sim.city_alive[0, row].nonzero().flatten()[0])
    sim.city_bldg[0, row, j, enc] = True
    assert int(sim._stockpile_cap(row)[0]) == cap0 + sim._stock_cap_per_enc, \
        "every Encampment building raises the ceiling for ALL resources"
    sim.city_bldg[0, row, j, enc] = False
    sim.improvement[0, t] = sim.res_imp[0, t]
    sim.civ_stockpile[:, row, k] = sim._stock_cap_base
    sim._seat_accrue_stockpile(row)
    assert int(sim.civ_stockpile[0, row, k]) == sim._stock_cap_base, "the bank stops at the ceiling"
    print("  accrual OK: the published rate per improved source, and the ceiling")


def test_unit_charge(sim) -> None:
    row, _ = a_city(sim)
    assert sim._res_slot_units, "the roster must carry a resource-gated unit"
    u_idx, slot, cost = sim._res_slot_units[0]
    assert cost == 20, "CIV6 (GS): 20 of the resource to train"
    # give the seat ACCESS so only the bank is in question
    a_source(sim, row, int(sim._type_resource[u_idx]))
    sim.civ_techs[0, row, int(sim._type_tech[u_idx])] = True
    sim.civ_stockpile[:, row] = 0
    sim.civ_stockpile[0, row, slot] = cost - 1
    assert not bool(sim._seat_trainable_units(row)[0, u_idx]), "19 does not pay for a 20"
    sim.civ_stockpile[0, row, slot] = cost
    assert bool(sim._seat_trainable_units(row)[0, u_idx]), "20 does"
    # and the charge itself
    hit = torch.zeros(sim.B, dtype=torch.bool, device=sim.device)
    hit[0] = True
    sim._charge_unit_resource(row, hit, u_idx)
    assert int(sim.civ_stockpile[0, row, slot]) == 0, "entering production spends the 20"
    assert not bool(sim._seat_trainable_units(row)[0, u_idx]), "and the next one waits for the mines"
    print("  unit charge OK: the mask refuses what the bank cannot pay, and the charge lands")


def place(sim, tile: int, utype: int, seat: int, hp: int = 40) -> int:
    slot = int(sim.unit_next[0])
    sim.unit_next[0] += 1
    sim.major_unit_alive[0, slot] = True
    sim.major_unit_seat[0, slot] = seat
    sim.major_unit_type[0, slot] = utype
    sim.major_unit_tile[0, slot] = tile
    sim.major_unit_hp[0, slot] = hp
    sim.major_unit_mp[0, slot] = 4
    sim.major_unit_mp_full[0, slot] = 4
    return slot


def test_upkeep(sim) -> None:
    row, _ = a_city(sim)
    assert sim._upkeep_units, "the roster must carry a FUEL unit"
    u_idx, slot, rate = sim._upkeep_units[0]
    assert rate > 0
    home = int(sim.city_center[0, row, int(sim.city_alive[0, row].nonzero().flatten()[0])])
    a = place(sim, home, u_idx, row)
    sim.civ_stockpile[:, row] = 0
    sim.civ_stockpile[0, row, slot] = 3 * rate
    sim._seat_charge_upkeep(row)
    assert int(sim.civ_stockpile[0, row, slot]) == 2 * rate, "one fuel unit bills its own rate"
    b = place(sim, home, u_idx, row)
    sim._seat_charge_upkeep(row)
    assert int(sim.civ_stockpile[0, row, slot]) == 0, "two of them bill twice"
    sim._seat_charge_upkeep(row)
    assert int(sim.civ_stockpile[0, row, slot]) == 0, "and an empty bank floors at zero"
    # a bill is the OWNER's: hand one unit to another row and it leaves
    other = next((r for r in range(sim.n_majors) if r != row), None)
    if other is not None:
        sim.major_unit_seat[0, b] = other
        sim.civ_stockpile[0, row, slot] = 3 * rate
        sim._seat_charge_upkeep(row)
        assert int(sim.civ_stockpile[0, row, slot]) == 2 * rate, "only this seat's units bill it"
    sim.major_unit_alive[0, a] = False
    sim.major_unit_alive[0, b] = False
    print("  upkeep OK: the published per-turn rate, per living unit, out of the owner's own bank")


def test_starved_heal(sim) -> None:
    row, j = a_city(sim)
    u_idx, res_idx = sim._res_unit_pairs[0]
    t, _ = a_source(sim, row, res_idx)
    slot = place(sim, int(sim.city_center[0, row, j]), u_idx, row)
    assert not bool(sim._res_starved("major")[0, slot]), "an owned improved source IS access"
    sim.pillaged[0, t] = True
    assert bool(sim._res_starved("major")[0, slot]), "a pillaged source is not access"
    sim.tile_seat[0, t] = NO_SEAT
    sim.pillaged[0, t] = False
    sim._tile_owner_ver += 1
    assert bool(sim._res_starved("major")[0, slot]), "a source somebody else owns is not access"
    # a type that asks for nothing is never starved, whatever the map says
    free = next(u for u in range(sim.NU) if int(sim._type_resource[u]) < 0)
    other = place(sim, int(sim.city_center[0, row, j]), free, row)
    assert not bool(sim._res_starved("major")[0, other])
    hp0 = int(sim.major_unit_hp[0, slot])
    sim.step()
    assert int(sim.major_unit_hp[0, slot]) == hp0, "a starved unit does not heal"
    assert int(sim.major_unit_hp[0, other]) > hp0, "and the one beside it does"
    sim.tile_seat[0, t] = row
    sim._tile_owner_ver += 1
    sim.step()
    assert int(sim.major_unit_hp[0, slot]) > hp0, "restore the access and it heals again"
    print("  starved heal OK: no access to the source, no heal — and only for the types that ask")


def free_plot(sim, row: int, cid: int) -> int:
    """A plot this city owns, carrying nothing — where a generator can stand."""
    for t in range(sim.T):
        if (int(sim.tile_seat[0, t]) == row and int(sim.district[0, t]) < 0
                and int(sim.built_wonder[0, t]) < 0 and int(sim.improvement[0, t]) < 0
                and int(sim.centre_slot_at[0, t]) < 0 and bool(sim.passable[0, t])):
            sim.tile_city[0, t] = cid
            sim._tile_owner_ver += 1
            return t
    raise AssertionError("the city owns no free plot")


def supply_of(sim, row: int, j: int) -> float:
    return float(sim._city_power_need(row)[1][0, j])


def test_renewables(sim) -> None:
    row, j = a_city(sim)
    cid = int(sim.city_id[0, row, j])
    solar_i, wind_i = sim._imp_ids.index("SOLAR_FARM"), sim._imp_ids.index("WIND_FARM")
    assert float(sim._imp_power[solar_i]) == 2.0, "CIV6 (Solar Farm): +2 Power"
    assert float(sim._imp_power[wind_i]) == 2.0, "CIV6 (Wind Farm): +2 Power"
    # the supply is only ever read against a load, so give the city one
    sim.city_bldg[0, row, j, bidx(sim, "RESEARCH_LAB")] = True
    assert supply_of(sim, row, j) == 0.0, "no generator, no renewable supply"
    st = free_plot(sim, row, cid)
    sim.improvement[0, st] = solar_i
    sim.pillaged[0, st] = False
    assert supply_of(sim, row, j) == 2.0, "the Solar Farm supplies the city that owns its plot"
    wt = free_plot(sim, row, cid)
    sim.improvement[0, wt] = wind_i
    sim.pillaged[0, wt] = False
    assert supply_of(sim, row, j) == 4.0, "the Wind Farm adds its own"
    # a renewable answers the whole load by itself — no stockpile behind it
    assert lit(sim, row, j, fuel=0), "3 Power of load, 4 of renewable supply, no fuel"
    # a PILLAGED generator pays nothing
    sim.pillaged[0, st] = True
    assert supply_of(sim, row, j) == 2.0, "a pillaged Solar Farm is not a supply"
    sim.pillaged[0, st] = False
    # ...and a plot this city does not own pays some other city
    sim.tile_city[0, wt] = cid + 999
    sim._tile_owner_ver += 1
    assert supply_of(sim, row, j) == 2.0, "the generator belongs to the city that owns its plot"
    sim.tile_city[0, wt] = cid
    sim._tile_owner_ver += 1
    # CIV6 (Biosphere): "+200% Power" for every renewable the seat holds.
    flagged = sim._wond_renew_power.nonzero().flatten().tolist()
    assert len(flagged) == 1, "one wonder carries the renewable-power flag"
    bi = int(flagged[0])
    bt = free_plot(sim, row, cid)
    sim.built_wonder[0, bt] = bi
    sim.built_wonder_complete[0, bt] = True
    sim.city_wonder[0, row, j, bi] = bt
    sim._eff_version += 1
    assert supply_of(sim, row, j) == 4.0 * sim._biosphere_mult, "every renewable pays triple"
    # the Dam's own renewable supply is on the wonder's list too
    sim.city_bldg[0, row, j, bidx(sim, "HYDROELECTRIC_DAM")] = True
    assert supply_of(sim, row, j) == (4.0 + 6.0) * sim._biosphere_mult, \
        "CIV6 (Hydroelectric Dam): 6 Power, and the Biosphere names it"
    print("  renewables OK: the two generators, the owning city, pillage, and the Biosphere")


def test_generator_ground(sim) -> None:
    """The BUILD column each generator gets is its own catalog ground clause —
    the `validImprovementsIn` ground-only arm."""
    solar_i, wind_i = sim._imp_ids.index("SOLAR_FARM"), sim._imp_ids.index("WIND_FARM")
    assert sim._imp_ground[solar_i] and sim._imp_ground[wind_i], \
        "both generators are ground-only rows"
    assert not any(sim._imp_ground[k] for k in range(len(sim._imp_ids))
                   if k not in (solar_i, wind_i)), "and no other row claims that arm"
    sol, wnd = sim._imp_ground_ok(solar_i)[0], sim._imp_ground_ok(wind_i)[0]
    hills, snow = sim.hills[0], sim.terrain[0] == sim._imp_xterr[solar_i][0]
    assert bool((wnd == hills).all()), "CIV6 (Wind Farm): Hills, and only Hills"
    assert bool((sol == (~hills & ~snow)).all()), \
        "CIV6 (Solar Farm): flat terrain, and never Snow"
    assert not bool((sol & wnd).any()), "no plot takes both"
    print("  generator ground OK: flat-not-snow and hills, from the catalog clause alone")


def test_reactor_age(sim) -> None:
    row, j = a_city(sim)
    nuc = bidx(sim, "NUCLEAR_POWER_PLANT")
    assert sim._nuclear_bidx == nuc, "the reactor is the Nuclear Power Plant's own row"
    pi = next(i for i, p in enumerate(sim._proj_rows) if int(p.get("rec", 0)))
    rt = int(sim._proj_rows[pi].get("rt", -1))
    assert rt >= 0, "CIV6 (Recommission): the project asks for Nuclear Fission"
    put_district(sim, row, j, sim._iz_idx)
    assert int(sim.city_reactor_age[0, row, j]) == -1, "no plant, no reactor"
    assert not bool(sim._recommission_ok(row, j, pi)[0]), "and nothing to recommission"
    # CIV6 (Nuclear accident): the age counts the turns since the plant was
    # built, converted to, or last recommissioned.
    sim.city_bldg[0, row, j, nuc] = True
    for n in range(1, 4):
        sim._resolve_seat_power(row)
        assert int(sim.city_reactor_age[0, row, j]) == n, "the reactor ages a turn a turn"
    # the project's gate is the plant AND the tech
    sim.civ_techs[:, row, rt] = False
    assert not bool(sim._recommission_ok(row, j, pi)[0]), "the tech is half the gate"
    sim.civ_techs[:, row, rt] = True
    assert bool(sim._recommission_ok(row, j, pi)[0]), "plant plus tech, and it is offered"
    # completing it puts the clock back, and it ticks again from zero
    sim.city_current[:, row, j] = sim.PROJECT_BASE + pi
    sim.city_cost[:, row, j] = 10
    sim.city_progress[:, row, j] = 10.0 ** 9
    sim._seat_city_produce(
        row, torch.full((sim.B,), j, dtype=torch.long, device=sim.device),
        torch.ones(sim.B, dtype=torch.bool, device=sim.device),
        torch.zeros(sim.B, dtype=torch.float64, device=sim.device))
    assert int(sim.city_reactor_age[0, row, j]) == 0, "the recommission resets the age"
    sim._resolve_seat_power(row)
    assert int(sim.city_reactor_age[0, row, j]) == 1, "and the clock runs again"
    # repeatable: it is in no one-time ledger
    assert bool(sim._recommission_ok(row, j, pi)[0]), "the project is repeatable"
    # a plant lost with the building takes its clock with it
    sim.city_bldg[0, row, j, nuc] = False
    sim._resolve_seat_power(row)
    assert int(sim.city_reactor_age[0, row, j]) == -1, "no plant, no reactor"
    assert not bool(sim._recommission_ok(row, j, pi)[0])
    print("  reactor OK: the age ticks, the project resets it, and both halves of its gate")


def test_spec_tier(sim) -> None:
    iz = sim._iz_idx
    tier = sim._spec_tb[iz]
    plants = {bidx(sim, n) for n in ("COAL_POWER_PLANT", "OIL_POWER_PLANT", "NUCLEAR_POWER_PLANT")}
    assert set(tier) == plants, \
        "CIV6: all three plants pay '+1 Production per Specialist in this district'"
    assert all(isinstance(x, int) for x in tier), "the tier is a list of building indices"
    print("  spec tier OK: any ONE of the three plants lifts the Industrial Zone's specialists")


def main() -> None:
    rules = load_rules()
    path = fixture_paths()[0]
    for fn in (test_demand, test_plant_reach, test_cardiff, test_powered_yields,
               test_regional_powered, test_fuel, test_accrual, test_unit_charge,
               test_upkeep, test_starved_heal, test_renewables, test_generator_ground,
               test_reactor_age, test_spec_tier):
        fn(build(rules, path))
    print("power_test OK — demand (buildings + stations, dark under pillage), the plant's reach, "
          "Cardiff's renewable supply, all-or-nothing, the powered halves (local, regional, "
          "amenities), the Coal plant's adjacency, the FUEL it converts, the stockpile accrual "
          "and its ceiling, the unit charge, the per-turn FUEL upkeep, the heal a lost "
          "source denies, the two renewable generators with the Biosphere over them, the "
          "reactor's age and the project that resets it, and the three-plant specialist tier")


if __name__ == "__main__":
    main()
