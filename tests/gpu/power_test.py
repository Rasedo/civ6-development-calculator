"""GS POWER on the batched engine: demand, the two supplies, and what a lit
city pays.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/power_test.py

Scripted parity proves the two engines agree; these pokes prove the RULES,
because a gate lane reaches an Industrial-era grid only by accident:

  1. `_city_powered` — the base load is what the standing buildings ask plus
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
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, fixture_paths  # noqa: E402
from core.simbase import FIXTURES  # noqa: E402
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
    assert not bool(sim._city_powered(row)[0, j]), "a city with no load is not powered"
    sim.city_bldg[0, row, j, fac] = True
    assert not bool(sim._city_powered(row)[0, j]), "a load with no supply leaves the city dark"
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
    assert bool(sim._city_powered(row)[0, j]), "a plant on a complete Zone lights its own city"
    # every same-seat centre within the regional reach, and no farther
    reach = sim._regional_range
    for k in range(sim.RC):
        if k == j or not bool(sim.city_alive[0, row, k]):
            continue
        sim.city_bldg[0, row, k, fac] = True
        d = int(sim.pair_dist[izt, int(sim.city_center[0, row, k])])
        assert bool(sim._city_powered(row)[0, k]) == (d <= reach), \
            f"city {k} at {d} hexes from the plant's Zone (reach {reach})"
    # a pillaged Zone supplies nobody, itself included
    sim.district_pillaged[0, izt] = True
    assert not bool(sim._city_powered(row)[0, j]), "a pillaged Industrial Zone is not a supply"
    sim.district_pillaged[0, izt] = False
    # ...and neither is an unfinished one
    sim.district_complete[0, izt] = False
    assert not bool(sim._city_powered(row)[0, j]), "an unfinished Zone is not a supply"
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
    assert not bool(sim._city_powered(row)[0, j]), "no suzerain, no renewable supply"
    # make this row the strict suzerain of a minor carrying Cardiff's rule
    assert sim.S > 0, "the fixture must carry a city-state to suzerain"
    sim.seat_citystate_envoys[0, :, 0] = 0
    sim.seat_citystate_envoys[0, row, 0] = 3
    sim.citystate_suz_code[0, 0] = sim._suz_c_harbor_pow
    sim._eff_version += 1
    assert float(sim._cardiff_harbor_power) == 2.0, "CIV6 (Cardiff): +2 Power per Harbor building"
    assert bool(sim._city_powered(row)[0, j]), "one Harbor building covers the Factory's load of 2"
    # a second load the supply cannot cover darkens the WHOLE city
    sim.city_bldg[0, row, j, bidx(sim, "RESEARCH_LAB")] = True
    assert not bool(sim._city_powered(row)[0, j]), "the load is met in full or not at all"
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
    assert bool(sim._city_powered(row)[0, j])
    lit = sim._seat_city_walk(row, j, amen_yf=yf[:, j:j + 1])[0, 0, 3]
    # CIV6 (Research Lab, GS): "+3 Science", "+5 Science additionally when Powered"
    assert float(lit - dark) == 5.0, f"the powered half must be +5 science, got {float(lit - dark)}"
    # THE COAL PLANT's own local production: the Zone's adjacency
    adj = float(sim._district_adj_seat(row, sim._iz_idx)[0, izt])
    prod_lit = sim._seat_city_walk(row, j, amen_yf=yf[:, j:j + 1])[0, 0, 1]
    sim.city_bldg[0, row, j, bidx(sim, "COAL_POWER_PLANT")] = False
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
    base = sim._seat_regional(row)
    assert base is not None
    y_dark = float(base[0][0, j, 1])
    sim.city_bldg[0, row, j, coal] = True
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
    am_dark = float(sim._seat_regional(row)[1][0, j])
    sim.city_bldg[0, row, j, coal] = True
    am_lit = float(sim._seat_regional(row)[1][0, j])
    assert am_lit - am_dark == 2.0, f"the Stadium's powered amenities must land, got {am_lit - am_dark}"
    print("  regional OK: the powered half rides the same reach, yields and amenities")


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
               test_regional_powered, test_spec_tier):
        fn(build(rules, path))
    print("power_test OK — demand (buildings + stations, dark under pillage), the plant's reach, "
          "Cardiff's renewable supply, all-or-nothing, the powered halves (local, regional, "
          "amenities), the Coal plant's adjacency, and the three-plant specialist tier")


if __name__ == "__main__":
    main()
