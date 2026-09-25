"""THE MINOR'S PURSE, ITS WALKER, AND THE FREE CITY'S OWN PLAY — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/minor_purse_test.py

The TS twins are tests/cpu/minors/minor-purse.test.ts and
tests/cpu/city/free-city-build.test.ts. Fitted to C-38's and C-60's census
(tools/civ6lab/minor_play_census.py):
  1. the episode's Builder purchase rate is drawn once, from its slots
  2. the minor's Gold pays its units' upkeep and stops at 0
  3. a Builder is bought when none stands and the treasury covers it
  4. a military unit is bought at its military count's rate above the floor,
     three times it after a loss, never at eight or more
  5. a Warrior Monk is bought with Faith where the majority religion allows
  6. one upgrade per research completion, first in slot order, flat price
  7. the walker takes its drawn step toward the weighted ring
  8. the Free City banks its Production and trains, raises and repairs down
     its build table; its units walk
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import load_rules, fixture_paths  # noqa: E402
from core.simbase import FREE_SEAT  # noqa: E402
from warmup import warm_base, opened  # noqa: E402
import free_city_test as fct  # noqa: E402

B0 = 0
ROOT = Path(__file__).resolve().parent.parent.parent
RULES = json.loads((ROOT / "seeder" / "worlds" / "rules.json").read_text())
UNI = [u["id"] for u in RULES["units"]]
BLD = [b["id"] for b in RULES["buildings"]]
M32 = 0xFFFFFFFF


def draw(st: int) -> float:
    """the next draw of the mulberry32 stream from state `st` (`_next_random`)"""
    a = (st + 0x6D2B79F5) & M32
    t = ((a ^ (a >> 15)) * (1 | a)) & M32
    t = (((t + (((t ^ (t >> 7)) * (61 | t)) & M32)) & M32) ^ t) & M32
    return ((t ^ (t >> 14)) & M32) / 4294967296.0


def seek(sim, pred) -> None:
    """set game 0's stream so its next draw satisfies `pred`"""
    for s in range(1, 1_000_000):
        if pred(draw(s)):
            sim.rng_state[B0] = s
            return
    raise AssertionError("no stream state draws that")


def build(rules, path):
    return warm_base(str(path), lambda: opened(rules, path, 0))


def a_minor(sim) -> int:
    live = sim.citystate_alive[B0].nonzero().flatten().tolist()
    assert live, "the fixture holds no living city-state"
    return live[0]


def clear_army(sim, s: int) -> None:
    """remove minor `s`'s units, leaving its plots free"""
    lo = sim.POOL_LO["major"]
    mine = (sim.major_unit_alive[B0] & (sim.major_unit_seat[B0] == 100 + s)).nonzero(as_tuple=True)[0]
    for i in mine.tolist():
        t = int(sim.major_unit_tile[B0, i])
        sim._occ_clear(torch.tensor([B0]), torch.tensor([t]), torch.tensor([i + lo]))
        sim.major_unit_alive[B0, i] = False
    sim._gen_ver += 1


def give(sim, s: int, kind: str) -> int:
    """a unit of `kind` for minor `s`, on or beside its centre; its slot"""
    one = torch.zeros(sim.B, dtype=torch.bool)
    one[B0] = True
    landed = sim._minor_spawn(s, one, torch.full((sim.B,), UNI.index(kind), dtype=torch.long), grants=False)
    assert bool(landed[B0]), f"the {kind} did not land"
    mine = (sim.major_unit_alive[B0] & (sim.major_unit_seat[B0] == 100 + s)).nonzero(as_tuple=True)[0]
    return int(mine[-1])


def kinds(sim, s: int) -> list[str]:
    mine = (sim.major_unit_alive[B0] & (sim.major_unit_seat[B0] == 100 + s)).nonzero(as_tuple=True)[0]
    return [UNI[int(sim.major_unit_type[B0, i])] for i in mine.tolist()]


def price(sim, unit: str, mult: float) -> float:
    return float(sim._purchase_step(torch.tensor([float(sim._type_cost[UNI.index(unit)]) * mult]))[0])


def test_plan(rules, path) -> None:
    sim = build(rules, path)
    s = a_minor(sim)
    sim.citystate_army_cap[B0, s] = -1
    sim._minor_plan(s)
    slots = [int(x) for x in rules.citystate["builderBuySlots"]]
    rate = int(sim.citystate_builder_buy[B0, s])
    assert rate in slots, rate
    rng = int(sim.rng_state[B0])
    sim._minor_plan(s)
    assert int(sim.citystate_builder_buy[B0, s]) == rate and int(sim.rng_state[B0]) == rng
    print("  1 plan OK — the Builder purchase rate drawn once, from its slots")


def test_upkeep(rules, path) -> None:
    sim = build(rules, path)
    s = a_minor(sim)
    clear_army(sim, s)
    give(sim, s, "SWORDSMAN")
    give(sim, s, "ARCHER")
    upkeep = float(sim._type_maintenance[UNI.index("SWORDSMAN")] + sim._type_maintenance[UNI.index("ARCHER")])
    assert upkeep > 0
    gold = float(sim._seat_city_stats(sim._CITY_MINOR0 + s)[0][B0, 0, 2])
    sim.citystate_treasury[B0, s] = 10.0
    sim._minor_accrue(s)
    assert abs(float(sim.citystate_treasury[B0, s]) - max(0.0, 10.0 + gold - upkeep)) < 1e-9
    # the accrual grows the city and its borders, so its Gold is read again
    gold = float(sim._seat_city_stats(sim._CITY_MINOR0 + s)[0][B0, 0, 2])
    sim.citystate_treasury[B0, s] = 0.0
    sim._minor_accrue(s)
    got = float(sim.citystate_treasury[B0, s])
    assert got >= 0.0 and abs(got - max(0.0, gold - upkeep)) < 1e-9, (got, gold, upkeep)
    print("  2 upkeep OK — the units' Maintenance out of the city's Gold, never below 0")


def test_builder_buy(rules, path) -> None:
    sim = build(rules, path)
    s = a_minor(sim)
    clear_army(sim, s)
    sim.citystate_builder_buy[B0, s] = 1000
    p = float(sim._purchase_step(sim._builder_cost(sim.citystate_builders_trained[:, s]).double()
                                 * float(sim.rules.gold_purchase_mult))[B0])
    bt = int(sim.citystate_builders_trained[B0, s])
    sim.citystate_treasury[B0, s] = p + 50.0
    sim._minor_purchases(s)
    assert kinds(sim, s) == ["BUILDER"], kinds(sim, s)
    assert float(sim.citystate_treasury[B0, s]) == 50.0
    assert int(sim.citystate_builders_trained[B0, s]) == bt + 1
    sim.citystate_treasury[B0, s] = 1000.0
    sim._minor_purchases(s)
    assert kinds(sim, s).count("BUILDER") == 1, "a second Builder was bought"
    # a rate of 0 still draws; a treasury short of the price asks nothing
    sim = build(rules, path)
    clear_army(sim, s)
    sim.citystate_builder_buy[B0, s] = 0
    sim.citystate_treasury[B0, s] = 500.0
    rng = int(sim.rng_state[B0])
    sim._minor_purchases(s)
    assert kinds(sim, s) == [] and int(sim.rng_state[B0]) != rng
    sim.citystate_treasury[B0, s] = 10.0
    rng = int(sim.rng_state[B0])
    sim._minor_purchases(s)
    assert int(sim.rng_state[B0]) == rng
    print("  3 Builder purchase OK — none standing, the price covered, the episode's rate")


def test_military_buy(rules, path) -> None:
    sim = build(rules, path)
    s = a_minor(sim)
    clear_army(sim, s)
    give(sim, s, "BUILDER")
    give(sim, s, "WARRIOR")
    bp = int(rules.citystate["militaryBuyBp"][1])
    floor = float(rules.citystate["militaryBuyFloor"])
    sim.citystate_treasury[B0, s] = floor - 1
    rng = int(sim.rng_state[B0])
    sim._minor_purchases(s)
    assert int(sim.rng_state[B0]) == rng, "a treasury under the floor drew"
    sim.citystate_treasury[B0, s] = 500.0
    seek(sim, lambda r: int(r * 10000) >= bp)
    sim._minor_purchases(s)
    assert len(kinds(sim, s)) == 2
    seek(sim, lambda r: int(r * 10000) < bp)
    sim._minor_purchases(s)
    assert kinds(sim, s).count("SLINGER") == 1, kinds(sim, s)
    assert float(sim.citystate_treasury[B0, s]) == 500.0 - price(sim, "SLINGER", float(sim.rules.gold_purchase_mult))
    # three times the rate after a loss
    sim = build(rules, path)
    clear_army(sim, s)
    give(sim, s, "BUILDER")
    give(sim, s, "WARRIOR")
    sim.citystate_treasury[B0, s] = 500.0
    sim.citystate_loss_turn[B0, s] = int(sim.turn) - 1
    mult = int(rules.citystate["lossBuyMult"])
    seek(sim, lambda r: bp <= int(r * 10000) < bp * mult)
    sim._minor_purchases(s)
    assert len(kinds(sim, s)) == 3, kinds(sim, s)
    print("  4 military purchase OK — the count's rate over the floor, tripled after a loss")


def test_monk_buy(rules, path) -> None:
    sim = build(rules, path)
    s = a_minor(sim)
    if sim._monk_idx < 0:
        print("  5 Warrior Monk SKIPPED — no Warrior Monk in the catalog")
        return
    clear_army(sim, s)
    give(sim, s, "BUILDER")
    row = sim._CITY_MINOR0 + s
    sim.civ_follower[B0, 0] = sim._monk_follower
    sim.city_pressure[B0, row, 0].zero_()
    sim.city_pressure[B0, row, 0, 0] = 100_000
    sim.city_bldg[B0, row, 0, sim._shrine_bidx] = True
    sim.city_bldg[B0, row, 0, sim._temple_bidx] = True
    ctr = int(sim.citystate_center[B0, s])
    hs = next(int(n) for n in sim.neigh[ctr].tolist() if n >= 0 and int(sim.district[B0, n]) < 0)
    sim.district[B0, hs] = sim._hs_idx
    sim.district_complete[B0, hs] = True
    sim.city_dist_tile[B0, row, 0, sim._hs_idx] = hs
    sim._bldg_version += 1
    sim._eff_version += 1
    assert bool(sim._minor_monk_ok(s)[B0]), "the monk's city is not eligible"
    mp = price(sim, "WARRIOR_MONK", float(sim.rules.faith_purchase_mult))
    sim.citystate_faith[B0, s] = mp + 7.0
    sim.citystate_treasury[B0, s] = 0.0
    seek(sim, lambda r: int(r * 10000) < int(rules.citystate["militaryBuyBp"][0]))
    sim._minor_purchases(s)
    assert kinds(sim, s).count("WARRIOR_MONK") == 1, kinds(sim, s)
    assert float(sim.citystate_faith[B0, s]) == 7.0
    print("  5 Warrior Monk OK — bought with Faith where the majority religion allows")


def test_upgrades(rules, path) -> None:
    sim = build(rules, path)
    s = a_minor(sim)
    clear_army(sim, s)
    a = give(sim, s, "WARRIOR")
    b = give(sim, s, "WARRIOR")
    up = UNI[int(sim._type_up_to[UNI.index("WARRIOR")])]
    t_need = int(sim._type_tech[UNI.index(up)])
    gold = float(rules.citystate["upgradeGold"])
    one = torch.ones(sim.B, dtype=torch.long)
    sim.citystate_treasury[B0, s] = 100.0
    sim._minor_upgrades(s, one)
    assert kinds(sim, s) == ["WARRIOR", "WARRIOR"], "an upgrade the research does not open"
    if t_need >= 0:
        sim.citystate_techs[B0, s, t_need] = True
    sim.citystate_treasury[B0, s] = 20.0
    sim._minor_upgrades(s, one)
    assert UNI[int(sim.major_unit_type[B0, a])] == up and UNI[int(sim.major_unit_type[B0, b])] == "WARRIOR"
    assert int(sim.major_unit_mp[B0, a]) == 0
    assert float(sim.citystate_treasury[B0, s]) == 20.0 - gold
    sim.citystate_treasury[B0, s] = gold - 1
    sim._minor_upgrades(s, one * 2)
    assert UNI[int(sim.major_unit_type[B0, b])] == "WARRIOR", "an upgrade the treasury cannot pay"
    sim.citystate_treasury[B0, s] = 100.0
    sim._minor_upgrades(s, one * 2)
    assert UNI[int(sim.major_unit_type[B0, b])] == up
    assert float(sim.citystate_treasury[B0, s]) == 100.0 - gold
    print("  6 upgrades OK — one per completion, first in slot order, the flat price")


def test_walker(rules, path) -> None:
    sim = build(rules, path)
    s = a_minor(sim)
    clear_army(sim, s)
    u = give(sim, s, "WARRIOR")
    ctr = int(sim.citystate_center[B0, s])
    assert int(sim.major_unit_tile[B0, u]) == ctr
    act = torch.zeros(sim.B, dtype=torch.bool)
    act[B0] = True
    home = sim.pair_dist[sim.citystate_center[:, s].clamp(min=0)].long()
    one_step = torch.tensor([0, 1000, 0, 0])
    ring_w = sim._walk_weight_plane(home, act, torch.tensor([0, 1000]), torch.tensor([0, 1000]))
    sim._walk_units("major", 100 + s, act, lambda hp: one_step.unsqueeze(0).expand(sim.B, -1), ring_w)
    assert int(sim.pair_dist[ctr, int(sim.major_unit_tile[B0, u])]) == 1, "the step did not reach the ring"
    sim.major_unit_mp[B0, u] = sim.major_unit_mp_full[B0, u]
    home_w = sim._walk_weight_plane(home, act, torch.tensor([1000]), torch.tensor([1000]))
    sim._walk_units("major", 100 + s, act, lambda hp: one_step.unsqueeze(0).expand(sim.B, -1), home_w)
    assert int(sim.major_unit_tile[B0, u]) == ctr, "the walk did not come home"
    # a step of 0 is one draw and no move
    still = torch.tensor([1000, 0, 0, 0])
    st = int(sim.rng_state[B0])
    sim._walk_units("major", 100 + s, act, lambda hp: still.unsqueeze(0).expand(sim.B, -1), home_w)
    assert int(sim.major_unit_tile[B0, u]) == ctr
    assert int(sim.rng_state[B0]) == (st + 0x6D2B79F5) & M32
    print("  7 walker OK — the drawn step toward the weighted ring, home again, a still turn one draw")


def test_free_city(rules, path) -> None:
    sim = fct.fresh(rules, path)
    centre = fct.revolt(sim)
    j = fct.free_slot(sim, centre)
    F = sim.FREE_ROW
    act = torch.zeros(sim.B, dtype=torch.bool)
    act[B0] = True
    techs, civics = sim._free_research()
    era = int(sim._world_era()[B0].clamp(min=0))
    assert int(techs[B0].sum()) == int((sim._tech_era <= era).sum()) > 0
    train = sim._trainable_in(techs, civics, sim._free_any_res)
    units0 = len(fct.free_units(sim))
    prod = torch.full((sim.B,), 5.0, dtype=torch.float64)
    sim._free_city_build(j, act, prod, techs, civics, train)
    assert float(sim.city_free_pot[B0, F, j]) == 5.0 and len(fct.free_units(sim)) == units0
    sim._free_city_build(j, act, prod * 20, techs, civics, train)
    got = fct.free_units(sim)
    assert len(got) == units0 + 1 and UNI[got[-1][1]] == "ARCHER", got
    assert int(sim.unit_free_city[B0, got[-1][0]]) == -1, "a trained unit carries a grant's mark"
    assert float(sim.city_free_pot[B0, F, j]) == 105.0 - float(sim._type_cost[UNI.index("ARCHER")])
    # the Monument, then the Granary
    sim.city_free_pot[B0, F, j] = 0.0
    sim._free_city_build(j, act, prod * 20, techs, civics, train)
    assert bool(sim.city_bldg[B0, F, j, BLD.index("MONUMENT")])
    sim._free_city_build(j, act, prod * 20, techs, civics, train)
    assert bool(sim.city_bldg[B0, F, j, BLD.index("GRANARY")])
    # the walls fill their pool; a breach is repaired at the HP it puts back
    sim._free_city_build(j, act, prod * 20, techs, civics, train)
    assert bool(sim.city_bldg[B0, F, j, BLD.index("ANCIENT_WALLS")])
    mx = int(sim._free_walls_max(j)[B0])
    assert int(sim.city_outer_hp[B0, F, j]) == mx > 0
    sim.city_outer_hp[B0, F, j] = mx - 30
    sim.city_last_hit[B0, F, j] = int(sim.turn) - 10
    sim.city_free_pot[B0, F, j] = 0.0
    sim._free_city_build(j, act, torch.full_like(prod, 29.0), techs, civics, train)
    assert int(sim.city_outer_hp[B0, F, j]) == mx - 30
    sim._free_city_build(j, act, torch.full_like(prod, 1.0), techs, civics, train)
    assert int(sim.city_outer_hp[B0, F, j]) == mx and float(sim.city_free_pot[B0, F, j]) == 0.0
    # its units walk in its own phase
    before = [t for _s, _u, t in fct.free_units(sim)]
    for k in range(6):
        sim.turn = int(sim.turn) + 1
        sim._free_cities_phase()
    after = fct.free_units(sim)
    assert any(t != b for (_s, _u, t), b in zip(after, before)), "no Free Cities unit walked"
    assert all(int(sim.pair_dist[centre, t]) <= 6 for _s, _u, t in after)
    assert all(int(sim.unit_seat[B0, s_]) == FREE_SEAT for s_, _u, _t in after)
    print("  8 Free City OK — the pot, the ranged class, Monument and Granary, walls and their repair, the walk")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_plan(rules, path)
    test_upkeep(rules, path)
    test_builder_buy(rules, path)
    test_military_buy(rules, path)
    test_monk_buy(rules, path)
    test_upgrades(rules, path)
    test_walker(rules, path)
    test_free_city(rules, path)
    print("BATTERY OK minor_purse")
    return 0


if __name__ == "__main__":
    sys.exit(main())
