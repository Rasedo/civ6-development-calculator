"""THE MINOR'S PURSE, ITS UNITS' WANDER, AND THE FREE CITY'S OWN PLAY — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/minor_purse_test.py

The TS twins are tests/cpu/minors/minor-purse.test.ts and
tests/cpu/city/free-city-build.test.ts:
  1. the minor's Gold pays its units' upkeep and stops at 0
  2. a city its knowledge base sees a barbarian army beside is threatened
     and buys its unit list's first unit while its savings or, threatened,
     its balance meet the price (`_minor_purchases`); an unthreatened one
     buys nothing
  3. one upgrade per research completion, first in slot order, flat price
  4. a city-state's unit wanders on one draw over its reach near its city
  5. the Free City banks its Production with nothing in hand and its AI
     queues its Default Specialization's pick; the item completes at its
     price; a unit lands, the walls fill their pool; on seed9001 its tables
     and picks are the TS twin's numbers; its units wander near it
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import load_rules, fixture_paths  # noqa: E402
from core.simbase import BARB_SEAT, FREE_SEAT  # noqa: E402
from warmup import warm_base, opened  # noqa: E402
import free_city_test as fct  # noqa: E402

B0 = 0
ROOT = Path(__file__).resolve().parent.parent.parent
RULES = json.loads((ROOT / "seeder" / "worlds" / "rules.json").read_text())
UNI = [u["id"] for u in RULES["units"]]
BLD = [b["id"] for b in RULES["buildings"]]
TECHS = [t["id"] for t in RULES["techs"]]
M32 = 0xFFFFFFFF


def draw(st: int) -> int:
    """the next draw over 10000 of the stream from state `st` (`_rand_range`:
    one LCG step's top 16 bits times 10000, over 2^16)"""
    return ((((st * 1103515245 + 12345) & M32) >> 16) * 10000) >> 16


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
    sim._minor_economy(s)
    assert abs(float(sim.citystate_treasury[B0, s]) - max(0.0, 10.0 + gold - upkeep)) < 1e-9
    sim.citystate_treasury[B0, s] = 0.0
    sim._minor_economy(s)
    got = float(sim.citystate_treasury[B0, s])
    assert got >= 0.0 and abs(got - max(0.0, gold - upkeep)) < 1e-9, (got, gold, upkeep)
    print("  1 upkeep OK — the units' Maintenance out of the city's Gold, never below 0")


def threaten(sim, s: int) -> None:
    """six barbarian Horsemen in minor `s`'s knowledge base, two plots from
    its centre"""
    ctr = int(sim.citystate_center[B0, s])
    ring = [t for t in range(sim.T) if int(sim.pair_dist[ctr, t]) == 2][:6]
    assert len(ring) == 6
    sim.citystate_kb_slot[B0, s] = -2
    for k, t in enumerate(ring):
        sim.citystate_kb_slot[B0, s, k] = -1
        sim.citystate_kb_owner[B0, s, k] = BARB_SEAT
        sim.citystate_kb_type[B0, s, k] = UNI.index("HORSEMAN")
        sim.citystate_kb_seen[B0, s, k] = int(sim.turn)
        sim.citystate_kb_plot[B0, s, k] = t


def test_threatened_buys(rules, path) -> None:
    sim = build(rules, path)
    s = a_minor(sim)
    clear_army(sim, s)
    threaten(sim, s)
    assert int(sim._minor_threat(s)[B0]) > -1, "six Horsemen beside the city did not threaten it"
    sim.citystate_treasury[B0, s] = 2000.0
    sim.citystate_ai_on[B0, s] = True
    sim._minor_military_turn(s)
    sim._minor_ai_turn(s)
    assert int(sim.citystate_threat[B0, s]) > -1
    assert kinds(sim, s), "the threatened city bought nothing"
    assert float(sim.citystate_treasury[B0, s]) < 2000.0
    got = kinds(sim, s)
    # an unthreatened city buys nothing
    sim = build(rules, path)
    clear_army(sim, s)
    sim.citystate_kb_slot[B0, s] = -2
    sim.citystate_treasury[B0, s] = 2000.0
    sim.citystate_ai_on[B0, s] = True
    sim._minor_military_turn(s)
    sim._minor_ai_turn(s)
    assert int(sim.citystate_threat[B0, s]) == -1
    assert kinds(sim, s) == [] and float(sim.citystate_treasury[B0, s]) == 2000.0
    print(f"  2 purchases OK — threatened, it buys {got}; unthreatened, nothing")


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
    print("  3 upgrades OK — one per completion, first in slot order, the flat price")


def test_wander(rules, path) -> None:
    """a city-state's tactical turn (`_minor_tactics`, `cityStateTactics`):
    its unit wanders on ONE "Random Direction" draw over the plots its reach
    takes this turn within 5 of its city, none its own stacking, in the
    order the pathfinder closed them, and moves to the one drawn"""
    sim = build(rules, path)
    s = a_minor(sim)
    seat = 100 + s
    clear_army(sim, s)
    # no barbarian about to chase
    lo = sim.POOL_LO["barb"]
    for i in (sim.barb_unit_alive[B0] & (sim.barb_unit_seat[B0] != FREE_SEAT)).nonzero(as_tuple=True)[0].tolist():
        sim._occ_clear(torch.tensor([B0]), torch.tensor([int(sim.barb_unit_tile[B0, i])]), torch.tensor([i + lo]))
        sim.barb_unit_alive[B0, i] = False
    sim._gen_ver += 1
    u = give(sim, s, "WARRIOR")
    sim.major_unit_mp[B0, u] = sim.major_unit_mp_full[B0, u]
    ctr = int(sim.citystate_center[B0, s])
    res = sim._tac_search(torch.tensor([B0]), torch.tensor([u]), seat, 2, False, pre="major")
    turns, rank = res["turns"][0].tolist(), res["rank"][0].tolist()
    own = sim._tac_own_mil(seat)[B0].tolist()
    cand = sorted((rank[t], t) for t in range(sim.T)
                  if turns[t] == 1 and not own[t] and int(sim.pair_dist[ctr, t]) <= 5)
    tiles = [t for _r, t in cand]
    assert len(tiles) > 1, tiles
    st = int(sim.rng_state[B0])
    sim._minor_tactics(s)
    s1 = (st * 1103515245 + 12345) & M32
    assert int(sim.rng_state[B0]) == s1, "not one draw"
    assert int(sim.major_unit_tile[B0, u]) == tiles[((s1 >> 16) * (len(tiles) & 0xFFFF)) >> 16]
    assert int(sim.unit_pslot[B0, u + sim.POOL_LO["major"]]) >= 0, "no pool slot"
    print("  4 wander OK — one draw over the reach's plots near the city, the one drawn")


def test_free_city(rules, path) -> None:
    sim = fct.fresh(rules, path)
    centre = fct.revolt(sim)
    j = fct.free_slot(sim, centre)
    F = sim.FREE_ROW
    act = torch.zeros(sim.B, dtype=torch.bool)
    act[B0] = True
    for t in ("POTTERY", "ARCHERY", "MASONRY"):
        sim.citystate_techs[B0, sim.FR, TECHS.index(t)] = True
    # nothing in hand: the Production banks, and the AI queues its pick
    sim._q_clear(torch.tensor([B0]), F, j)
    sim.city_prod_bank[B0, F, j] = 0.0
    prod = torch.full((sim.B,), 5.0, dtype=torch.float64)
    sim._free_city_build(j, act, prod)
    assert float(sim.city_prod_bank[B0, F, j]) == 5.0
    head = int(sim.city_current[B0, F, j, 0])
    assert head >= 0, "the Free City's AI queued nothing"
    sim._free_city_build(j, act, torch.full((sim.B,), 3.0, dtype=torch.float64))
    if int(sim.city_current[B0, F, j, 0]) == head:
        assert float(sim.city_progress[B0, F, j, 0]) == 8.0 and float(sim.city_prod_bank[B0, F, j]) == 0.0
    # the item completes at its price: the Monument rises, 2 left in the bank
    mon = BLD.index("MONUMENT")
    sim._q_clear(torch.tensor([B0]), F, j)
    one = torch.zeros(sim.B, dtype=torch.bool)
    one[B0] = True
    sim._q_push(F, torch.full((sim.B,), j, dtype=torch.long), one, torch.full((sim.B,), mon, dtype=torch.long),
                torch.zeros(sim.B, dtype=torch.float64))
    sim.city_progress[B0, F, j, 0] = float(sim.rules_dev.b_cost[mon]) - 1
    sim.city_prod_bank[B0, F, j] = 0.0
    sim._free_city_build(j, act, torch.full((sim.B,), 3.0, dtype=torch.float64))
    assert bool(sim.city_bldg[B0, F, j, mon]) and float(sim.city_prod_bank[B0, F, j]) == 2.0
    assert int(sim.city_current[B0, F, j, 0]) != mon
    # a unit lands on or beside the centre; the walls fill their pool
    units0 = len(fct.free_units(sim))
    arc = UNI.index("ARCHER")
    sim._q_clear(torch.tensor([B0]), F, j)
    sim._q_push(F, torch.full((sim.B,), j, dtype=torch.long), one, torch.full((sim.B,), sim.UNIT_BASE + arc, dtype=torch.long),
                torch.full((sim.B,), float(sim._type_cost[arc]), dtype=torch.float64))
    sim.city_progress[B0, F, j, 0] = float(sim._type_cost[arc])
    sim._free_city_build(j, act, torch.ones(sim.B, dtype=torch.float64))
    got = fct.free_units(sim)
    assert len(got) == units0 + 1 and UNI[got[-1][1]] == "ARCHER", got
    walls = BLD.index("ANCIENT_WALLS")
    sim._q_clear(torch.tensor([B0]), F, j)
    sim._q_push(F, torch.full((sim.B,), j, dtype=torch.long), one, torch.full((sim.B,), walls, dtype=torch.long),
                torch.zeros(sim.B, dtype=torch.float64))
    sim.city_progress[B0, F, j, 0] = float(sim.rules_dev.b_cost[walls])
    sim._free_city_build(j, act, torch.ones(sim.B, dtype=torch.float64))
    mx = int(sim._free_walls_max(j)[B0])
    assert bool(sim.city_bldg[B0, F, j, walls]) and int(sim.city_outer_hp[B0, F, j]) == mx > 0
    # its units wander near it in its own phase
    before = [t for _s, _u, t in fct.free_units(sim)]
    for k in range(6):
        sim.turn = int(sim.turn) + 1
        sim._free_cities_phase()
    after = fct.free_units(sim)
    assert any(t != b for (_s, _u, t), b in zip(after, before)), "no Free Cities unit wandered"
    assert all(int(sim.pair_dist[centre, t]) <= 6 for _s, _u, t in after)
    assert all(int(sim.unit_seat[B0, s_]) == FREE_SEAT for s_, _u, _t in after)
    print("  5 Free City OK — the bank and the pick, the Monument at its price, the Archer, the walls, the wander")


def test_free_city_pick(rules) -> None:
    """seed9001's opening, a second city for seat 0 on plot 652 (population
    3) revolting: the Free City's tables and its picks over eight steps of 5
    Production — the numbers tests/cpu/city/free-city-build.test.ts pins"""
    from core.simbase import FIXTURES
    from core.sim_cityvalue import _FreeFacts
    sim = opened(rules, FIXTURES / "seed9001.json", 0)
    tile = 652
    one = torch.ones(sim.B, dtype=torch.bool)
    sim._spawn_unit(0, one, torch.full((sim.B,), tile, dtype=torch.long), sim._settler_idx)
    ext = sim.seat_ext.clone()
    sim.seat_ext[:, 0] = True
    smap = sim._seat_slot_map(0)
    typ = sim.unit_type.gather(1, smap.clamp(min=0))
    tl = sim.unit_tile.gather(1, smap.clamp(min=0))
    sim._apply_seat_unit_actions(0, torch.where((smap >= 0) & (typ == sim._settler_idx) & (tl == tile),
                                                torch.full_like(smap, sim._A_FOUND), torch.full_like(smap, -1)))
    sim.seat_ext.copy_(ext)
    col = int(sim.city_alive[B0, 0].nonzero()[-1])
    assert int(sim.city_center[B0, 0, col]) == tile
    sim.city_pop[B0, 0, col] = 3
    flip = torch.zeros(sim.B, sim.RC, dtype=torch.bool)
    flip[B0, col] = True
    sim._seat_loyalty_flips(0, flip)
    F = sim.FREE_ROW
    j = int(sim.centre_slot_at[B0, tile])
    f = _FreeFacts(sim, j)
    fx_min = -9999 * 256
    bt = [int(v[0]) for v in sim._cv_building_table(f) if int(v[0]) != fx_min]
    ut = [int(v[0]) for v, read in sim._cv_unit_table(f) if bool(read[0]) and int(v[0]) != fx_min]
    assert (len(bt), sum(bt), len(ut), sum(ut)) == (1, 7728, 6, 25778), (len(bt), sum(bt), len(ut), sum(ut))
    act = torch.zeros(sim.B, dtype=torch.bool)
    act[B0] = True
    seq = []
    for _ in range(8):
        sim._free_city_build(j, act, torch.full((sim.B,), 5.0, dtype=torch.float64))
        code = int(sim.city_current[B0, F, j, 0])
        name = (BLD[code] if 0 <= code < sim.NB else UNI[code - sim.UNIT_BASE] if code >= sim.UNIT_BASE else "-")
        seq.append((name, float(sim.city_progress[B0, F, j, 0]), float(sim.city_prod_bank[B0, F, j])))
    want = [("MONUMENT", 0.0, 5.0), ("MONUMENT", 10.0, 0.0), ("MONUMENT", 15.0, 0.0), ("MONUMENT", 20.0, 0.0),
            ("MONUMENT", 25.0, 0.0), ("SCOUT", 0.0, 0.0), ("SCOUT", 5.0, 0.0), ("SCOUT", 10.0, 0.0)]
    assert seq == want, seq
    print("  6 Free City's pick OK — seed9001's revolt: the tables and eight steps as the TS twin pins")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_upkeep(rules, path)
    test_threatened_buys(rules, path)
    test_upgrades(rules, path)
    test_wander(rules, path)
    test_free_city(rules, path)
    test_free_city_pick(rules)
    print("BATTERY OK minor_purse")
    return 0


if __name__ == "__main__":
    sys.exit(main())
