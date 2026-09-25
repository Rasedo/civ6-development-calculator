"""INDUSTRIALIST AND RENEWABLE SUBSIDIZER — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/governor_power_test.py

The TS twin is tests/cpu/city/governor-power.test.ts.

CIV6 (DLC/Expansion2/Data/Expansion1_Governors.xml): Industrialist's
INDUSTRIALIST_{COAL,OIL,NUCLEAR}_POWER_PLANT_PRODUCTION (+2 Production on each
plant) and INDUSTRIALIST_RESOURCE_POWER_PROVIDED (+1 Power per resource);
Renewable Subsidizer's RENEWABLE_ENERGY_IMPROVEMENT_PLOTS_GOLD (+2 Gold on a
renewable plot), RENEWABLE_ENERGY_IMPROVEMENT_BUILDING_GOLD (+2 Gold on the
Hydroelectric Dam) and the MERCHANT_RENEWABLE_ENERGY_* +2 Power rows.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, fixture_paths  # noqa: E402
from core.simbase import FIXTURES  # noqa: E402
from warmup import warm_base, opened  # noqa: E402

B0, ROW = 0, 0
RJ = json.loads((FIXTURES / "rules.json").read_text())
BIDS = [b["id"] for b in RJ["buildings"]]
IIDS = RJ["improvements"]["ids"]
PROMOS = [p["id"] for p in RJ["governorPromotions"]]


def fresh(rules, path) -> BatchSim:
    return warm_base(str(path), lambda: opened(rules, path))


def seat_gov(sim, promo: int, col: int = 0) -> None:
    g = int(sim._gpromo_gov[promo])
    sim.civ_gov_appointed[B0, ROW, g] = True
    sim.civ_gov_city[B0, ROW, g] = int(sim.city_id[B0, ROW, col])
    sim.civ_gov_establish[B0, ROW, g] = 0
    sim.civ_gov_promos[B0, ROW, g] = 1 << promo
    sim._eff_version += 1


def put_district(sim, di: int) -> int:
    free = [t for t in range(sim.T)
            if int(sim.tile_seat[B0, t]) == ROW and int(sim.district[B0, t]) < 0
            and int(sim.built_wonder[B0, t]) < 0 and bool(sim.passable[B0, t])
            and int(sim.centre_slot_at[B0, t]) < 0 and int(sim.improvement[B0, t]) < 0]
    assert free, "the capital owns no free plot"
    t = free[0]
    sim.district[B0, t] = di
    sim.district_complete[B0, t] = True
    sim.district_pillaged[B0, t] = False
    sim.city_dist_tile[B0, ROW, 0, di] = t
    sim._tile_owner_ver += 1
    return t


def test_the_rows(rules, path) -> None:
    sim = fresh(rules, path)
    ind, ren = PROMOS.index("INDUSTRIALIST"), PROMOS.index("RENEWABLE_SUBSIDIZER")
    assert float(sim._gpromo["plantPowerPerResource"][ind]) == 1.0
    ys = {(p, BIDS[n]): y for p, n, y in sim._gpromo_bldg_y}
    for plant in ("COAL_POWER_PLANT", "OIL_POWER_PLANT", "NUCLEAR_POWER_PLANT"):
        assert ys[(ind, plant)] == [0.0, 2.0, 0.0, 0.0, 0.0, 0.0], f"{plant}: +2 Production"
    assert ys[(ren, "HYDROELECTRIC_DAM")] == [0.0, 0.0, 2.0, 0.0, 0.0, 0.0], "the Dam: +2 Gold"
    assert [(p, BIDS[n], a) for p, n, a in sim._gpromo_bldg_pow] == [(ren, "HYDROELECTRIC_DAM", 2.0)]
    for imp in ("SOLAR_FARM", "WIND_FARM", "GEOTHERMAL_PLANT"):
        k = IIDS.index(imp)
        assert sim._imp_gov_power[k] == (ren, 2.0), f"{imp}: +2 Power"
        assert sim._imp_gov_yield[k] == {"promo": ren, "y": [0, 0, 2, 0, 0, 0]}, f"{imp}: +2 Gold"
    print("  1 the rows OK — the plants' +2 Production and +1 Power, the renewables' +2 Gold and +2 Power")


def test_industrialist(rules, path) -> None:
    sim = fresh(rules, path)
    ind = PROMOS.index("INDUSTRIALIST")
    coal = BIDS.index("COAL_POWER_PLANT")
    put_district(sim, sim._iz_idx)
    sim.city_bldg[B0, ROW, 0, coal] = True
    sim.city_bldg[B0, ROW, 0, BIDS.index("FACTORY")] = True
    sim.city_bldg[B0, ROW, 0, BIDS.index("RESEARCH_LAB")] = True
    sim._bldg_version += 1
    base = int(sim._b_fuel_rate[coal])
    pi = sim._plant_bidx.index(coal)
    assert float(sim._governor_building_yields(ROW)[B0, 0, 1]) == 0.0
    _d, _s, _r, rate = sim._city_power_need(ROW)
    assert int(rate[B0, 0, pi]) == base
    seat_gov(sim, ind)
    assert float(sim._governor_building_yields(ROW)[B0, 0, 1]) == 2.0, "the plant's +2 Production"
    demand, _s, reach, rate = sim._city_power_need(ROW)
    assert bool(reach[B0, 0, pi]) and int(rate[B0, 0, pi]) == base + 1, "each resource provides 1 more"
    slot = int(sim._b_fuel_slot[coal])
    sim.civ_stockpile[:, ROW] = 10
    sim._resolve_seat_power(ROW)
    assert bool(sim.city_powered[B0, ROW, 0])
    want = 10 - (int(demand[B0, 0]) + base) // (base + 1)
    assert int(sim.civ_stockpile[B0, ROW, slot]) == want, "the burn follows the raised rate"
    # a pillaged plant pays nothing
    sim.city_bldg_pillaged[B0, ROW, 0, coal] = True
    sim._bldg_version += 1
    assert float(sim._governor_building_yields(ROW)[B0, 0, 1]) == 0.0, "a dark plant pays nothing"
    print("  2 Industrialist OK — +2 Production on a lit plant, +1 Power per resource burned")


def test_renewable_subsidizer(rules, path) -> None:
    sim = fresh(rules, path)
    ren = PROMOS.index("RENEWABLE_SUBSIDIZER")
    dam = BIDS.index("HYDROELECTRIC_DAM")
    sim.city_bldg[B0, ROW, 0, BIDS.index("RESEARCH_LAB")] = True   # a load, so supply is read
    sim.city_bldg[B0, ROW, 0, dam] = True
    sim._bldg_version += 1
    # a Solar Farm on a plot of the capital
    slot = sim.city_slot_at(ROW)
    t = next(x for x in range(sim.T) if int(slot[B0, x]) == 0 and int(sim.centre_slot_at[B0, x]) < 0
             and int(sim.improvement[B0, x]) < 0 and int(sim.district[B0, x]) < 0)
    solar = IIDS.index("SOLAR_FARM")
    sim.improvement[B0, t] = solar
    sim.pillaged[B0, t] = False
    sim._eff_version += 1
    sup0 = float(sim._city_power_need(ROW)[1][B0, 0])
    gold0 = float(sim._governor_building_yields(ROW)[B0, 0, 2])
    plot0 = sim._imp_unique_plane(ROW)
    plot0 = 0.0 if plot0 is None else float(plot0[B0, t, 2])
    seat_gov(sim, ren)
    assert float(sim._city_power_need(ROW)[1][B0, 0]) == sup0 + 2 + 2, "the Dam's +2 and the farm's +2"
    assert float(sim._governor_building_yields(ROW)[B0, 0, 2]) == gold0 + 2, "the Dam's +2 Gold"
    assert float(sim._imp_unique_plane(ROW)[B0, t, 2]) == plot0 + 2, "the farm's plot +2 Gold"
    # a pillaged generator supplies nothing, the promotion's share included
    sim.pillaged[B0, t] = True
    sim._eff_version += 1
    assert float(sim._city_power_need(ROW)[1][B0, 0]) == sup0 + 2 - float(sim._imp_power[solar])
    print("  3 Renewable Subsidizer OK — the Dam and the generators, +2 Power and +2 Gold each")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_the_rows(rules, path)
    test_industrialist(rules, path)
    test_renewable_subsidizer(rules, path)
    print("BATTERY OK governor_power")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
