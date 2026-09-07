"""THE MINOR'S CITY PAYS ITS YIELDS — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/minor_yields_test.py

The TS twin is tests/cpu/citystates/minor-yields.test.ts.

CIV6 (City-state): a city-state's city is an ordinary city — its Campus
yields Science, its Commercial Hub Gold — and it "will apparently research
certain techs" on that output. No gate lane drives a minor's yields (a minor
takes no decision), so these scenes are the whole evidence:
  1. the minor's row rides `_seat_city_walk`: a Campus with a Library raises
     its Science over the bare city, and the walk reads the minor's OWN
     record (research, ownership by seat id 100+s)
  2. the clock: `_city_state_phase` advances the tech pot by exactly that
     Science, the civic pot by the Culture and the build pot by the
     Production; Gold and Faith bank in `citystate_treasury` / `citystate_faith`
  3. a unit levied from a minor holding a Barracks carries its +25% training
     experience, and a pillaged Barracks pays none
  4. power: nothing the minor's ladder builds draws or supplies Power — the
     grid has no minor arm because it would compute zero
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
ROOT = Path(__file__).resolve().parent.parent.parent
RULES = json.loads((ROOT / "seeder" / "worlds" / "rules.json").read_text())
BLD = [b["id"] for b in RULES["buildings"]]
MINOR_LADDER = ("ANCIENT_WALLS", "MEDIEVAL_WALLS", "RENAISSANCE_WALLS", "LIBRARY", "AMPHITHEATER",
                "MARKET", "WORKSHOP", "BARRACKS", "STABLE", "SHRINE")


def fresh(rules, path):
    sim = settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64))
    for _ in range(3):
        sim.step()
    if int(sim.turn) % 12 == 0:  # keep the population tick out of the clock scene
        sim.step()
    return sim


def a_minor(sim) -> int:
    s = int((sim.citystate_alive[B0] & (sim.citystate_center[B0] >= 0)).long().argmax())
    assert bool(sim.citystate_alive[B0, s]), "the fixture seats no live city-state"
    return s


def give_minor_district(sim, s: int, di: int) -> int:
    """A COMPLETE district of type `di` on a free plot the minor owns."""
    row = sim._CITY_MINOR0 + s
    ctr = int(sim.citystate_center[B0, s])
    free = [t for t in range(sim.T)
            if int(sim.tile_seat[B0, t]) == 100 + s and int(sim.district[B0, t]) < 0
            and int(sim.built_wonder[B0, t]) < 0 and bool(sim.passable[B0, t]) and t != ctr]
    assert free, "the minor owns no free plot"
    t = free[0]
    sim.district[B0, t] = di
    sim.district_complete[B0, t] = True
    sim.city_dist_tile[B0, row, 0, di] = t
    sim._eff_version += 1
    sim._tile_owner_ver += 1
    return t


def walk(sim, row: int) -> list[float]:
    yf = sim._seat_amenity(row)[2][:, 0:1]
    return sim._seat_city_walk(row, 0, amen_yf=yf)[B0, 0].tolist()


def test_walk(rules, path) -> None:
    sim = fresh(rules, path)
    s = a_minor(sim)
    row = sim._CITY_MINOR0 + s
    bare = walk(sim, row)
    pop = int(sim.citystate_pop[B0, s])
    yf = float(sim._seat_amenity(row)[2][B0, 0])
    # nothing but its citizens pays Science yet — and the amenity tier
    # scales it exactly as it scales a major's
    assert abs(bare[3] - pop * sim.rules.citizen_science * yf) < 1e-9, \
        f"the bare city's Science is {bare[3]}, not {pop} citizens x {sim.rules.citizen_science} x {yf}"
    assert bare[0] > 0 and bare[1] > 0, "a live city works its centre at least"
    lib = BLD.index("LIBRARY")
    give_minor_district(sim, s, sim._campus_idx)
    sim.city_bldg[B0, row, 0, lib] = True
    sim._bldg_version += 1
    sim._eff_version += 1
    with_campus = walk(sim, row)
    assert with_campus[3] > bare[3], f"a Campus with a Library pays no Science ({bare[3]} -> {with_campus[3]})"
    # a pillaged Library pays nothing again
    sim.city_bldg_pillaged[B0, row, 0, lib] = True
    sim._eff_version += 1
    dark = walk(sim, row)
    assert dark[3] < with_campus[3], "a pillaged Library still pays"
    sim.city_bldg_pillaged[B0, row, 0, lib] = False
    sim._eff_version += 1
    # the FREE row and the majors are untouched by the minor's walk
    assert walk(sim, 0)[3] > 0
    print(f"  1 walk OK — bare {bare[3]:.2f} Science, with a Campus+Library {with_campus[3]:.2f}")


def test_clock(rules, path) -> None:
    sim = fresh(rules, path)
    s = a_minor(sim)
    row = sim._CITY_MINOR0 + s
    give_minor_district(sim, s, sim._campus_idx)
    sim.citystate_tech_prog[B0, s] = 0.0
    sim.citystate_civic_prog[B0, s] = 0.0
    sim.citystate_prod[B0, s] = 0.0
    sim.citystate_treasury[B0, s] = 0.0
    sim.citystate_faith[B0, s] = 0.0
    tot = walk(sim, row)
    sim._city_state_phase()
    assert abs(float(sim.citystate_tech_prog[B0, s]) - tot[3]) < 1e-9, "the tech pot did not take the walk's Science"
    assert abs(float(sim.citystate_civic_prog[B0, s]) - tot[4]) < 1e-9, "the civic pot did not take the Culture"
    assert abs(float(sim.citystate_prod[B0, s]) - tot[1]) < 1e-9, "the build pot did not take the Production"
    assert abs(float(sim.citystate_treasury[B0, s]) - tot[2]) < 1e-9, "the Gold did not bank"
    assert abs(float(sim.citystate_faith[B0, s]) - tot[5]) < 1e-9, "the Faith did not bank"
    # a dead minor accrues nothing
    sim.citystate_alive[B0, s] = False
    before = float(sim.citystate_tech_prog[B0, s])
    sim._city_state_phase()
    assert float(sim.citystate_tech_prog[B0, s]) == before, "a dead minor's pot moved"
    print(f"  2 clock OK — {tot[3]:.2f} Science, {tot[4]:.2f} Culture, {tot[1]:.2f} Production a turn")


def test_levy_xp(rules, path) -> None:
    sim = fresh(rules, path)
    mil_idx = int(sim.rules.citystate.get("militaristicIdx", -1))
    assert mil_idx >= 0 and sim._encamp_didx >= 0
    s = a_minor(sim)
    row = sim._CITY_MINOR0 + s
    bar = BLD.index("BARRACKS")
    pct = int(sim.rules_dev.b_train_xp_pct[bar])
    assert pct == 25, f"the Barracks row reads {pct}%"
    give_minor_district(sim, s, sim._encamp_didx)
    sim.city_bldg[B0, row, 0, bar] = True
    sim._bldg_version += 1
    sim._eff_version += 1
    sim.citystate_type[B0, s] = mil_idx
    suz_min = int(sim.rules.citystate.get("suzerainEnvoys", 3))
    sim.seat_citystate_envoys[B0, :, s] = 0
    sim.seat_citystate_envoys[B0, 0, s] = suz_min
    sim.citystate_last_levy[B0, s] = -10_000
    sim.civ_treasury[B0, 0] = 100_000.0
    assert bool(sim._suzerain_mask(0)[B0, s])
    active = torch.ones(sim.B, dtype=torch.bool)

    def levy() -> list[int]:
        was = set(sim.major_unit_alive[B0].nonzero().flatten().tolist())
        sim._stash_buy(0, levy=torch.tensor([s]))
        sim._seat_buy_ladder(0, active, sim._seat_army_count(0))
        got = sorted(set(sim.major_unit_alive[B0].nonzero().flatten().tolist()) - was)
        assert got, "the levy spawned nobody"
        return got

    for slot in levy():
        assert int(sim.major_unit_xp_pct[B0, slot]) == pct, "the levied unit carries no Barracks experience"
        assert bool(sim.major_unit_levied[B0, slot])
    # a pillaged Barracks trains nobody
    sim.city_bldg_pillaged[B0, row, 0, bar] = True
    sim._eff_version += 1
    sim.citystate_last_levy[B0, s] = -10_000
    for slot in levy():
        assert int(sim.major_unit_xp_pct[B0, slot]) == 0, "a pillaged Barracks still trained the levy"
    print(f"  3 levy OK — +{pct}% from the minor's Barracks, none once it is pillaged")


def test_power_vacuous() -> None:
    by_id = {b["id"]: b for b in RULES["buildings"]}
    for bid in MINOR_LADDER:
        b = by_id[bid]
        assert "power" in b and "powerSupply" in b, f"{bid}: the wire dropped its power columns"
        assert int(b["power"]) == 0 and int(b["powerSupply"]) == 0, f"{bid} draws or supplies Power"
    print("  4 power OK — nothing the minor's ladder builds draws or supplies Power")


def main() -> None:
    rules = load_rules()
    path = fixture_paths()[0]
    test_walk(rules, path)
    test_clock(rules, path)
    test_levy_xp(rules, path)
    test_power_vacuous()
    print("BATTERY OK minor_yields")


if __name__ == "__main__":
    main()
