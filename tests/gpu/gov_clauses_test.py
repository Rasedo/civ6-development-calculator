"""THE FIVE PROMOTION CLAUSES THAT NEED NO NEW MECHANIC — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/gov_clauses_test.py

The TS twin is tests/cpu/city/governor-clauses.test.ts.

CIV6, one sourced sentence each: (Surplus Logistics) "Your Trade Routes ending
here provide +2 Food to their starting city"; (Vertical Integration) "This city
receives Production from any number of Industrial Zones within 6 tiles, not
just the first"; (Reinforced Materials) "This city's improvements, buildings
and Districts cannot be damaged by Environmental Effects"; (Forestry
Management) "This city receives +2 Gold for each unimproved feature. Tiles
adjacent to unimproved features receive +1 Appeal in this city"; (Patron Saint)
"Apostles and Warrior Monks trained in the city receive 1 extra Promotion when
receiving their first promotion."

Proven here:
  * the DESTINATION's governor pays the ORIGIN column of a domestic route, and
    an establishing posting pays nothing;
  * every in-range INDUSTRIAL ZONE pays a governed receiver, and no other
    regional line stacks with it;
  * `_env_immune` stops both the scorch and the flood's district pillage, and
    only on the governed city's own ground;
  * the gold counts the unimproved features the city OWNS and the appeal lifts
    only the tiles STANDING BESIDE one;
  * the bank lands on a unit bought in the governed city and is spent by its
    first promotion, re-arming it exactly once.
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

B0, ROW = 0, 0
BIDS = [b["id"] for b in json.loads(
    (Path(__file__).resolve().parent.parent.parent / "seeder" / "worlds" / "rules.json").read_text()
)["buildings"]]


def fresh(rules, path) -> BatchSim:
    return settle_all(BatchSim([load_fixture(path)], rules, device="cpu",
                               dtype=torch.float64))


def promo_with(sim, channel: str) -> int:
    """the catalog row carrying this promotion channel."""
    gp = sim.rules.governor_promotions
    hit = [i for i, p in enumerate(gp) if float(p[channel]) != 0]
    assert len(hit) == 1, f"{channel} is carried by rows {hit}"
    return hit[0]


def seat_gov(sim, row: int, promo: int, col: int = 0) -> int:
    """Seat the promotion's own governor in city column `col`, established."""
    g = int(sim._gpromo_gov[promo])
    sim.civ_gov_appointed[B0, row, g] = True
    sim.civ_gov_city[B0, row, g] = int(sim.city_id[B0, row, col])
    sim.civ_gov_establish[B0, row, g] = 0
    sim.civ_gov_promos[B0, row, g] = 1 << promo
    sim._eff_version += 1
    return g


# ---------------------------------------------------------------------------


def test_surplus_logistics(rules, path) -> None:
    sim = fresh(rules, path)
    P = promo_with(sim, "routeStartFood")
    amt = float(sim._gpromo["routeStartFood"][P])
    assert amt == 2.0, f"the sourced +2 Food moved to {amt}"
    # a second city of this seat, founded over the engine's own FOUND verb
    from warmup import plant_city
    plant_city(sim, ROW)
    assert bool(sim.city_alive[B0, ROW, 1]), "the seat needs two cities"
    a, b = int(sim.city_id[B0, ROW, 0]), int(sim.city_id[B0, ROW, 1])
    sim.seat_routes[B0, ROW, 0, 0] = a
    sim.seat_routes[B0, ROW, 0, 1] = b
    sim._eff_version += 1
    base = float(sim._seat_route_income(ROW)[B0, 0, 0])
    # the governor sits in the DESTINATION
    g = seat_gov(sim, ROW, P, col=1)
    assert float(sim._seat_route_income(ROW)[B0, 0, 0]) == base + amt, "the origin was not paid"
    assert float(sim._seat_route_income(ROW)[B0, 1, 0]) == 0.0, "the destination sends nothing"
    # ...and an establishing posting pays nothing
    sim.civ_gov_establish[B0, ROW, g] = 3
    sim._eff_version += 1
    assert float(sim._seat_route_income(ROW)[B0, 0, 0]) == base
    print("  1 Surplus Logistics OK — the destination's governor pays the origin column")


def test_vertical_integration(rules, path) -> None:
    sim = fresh(rules, path)
    P = promo_with(sim, "industryAllSources")
    iz = sim._iz_idx
    assert iz >= 0, "no INDUSTRIAL_ZONE in the district catalog"
    fac = BIDS.index("FACTORY")
    assert fac in sim._reg_bidx and int(sim._b_req_district[fac]) == iz
    ctr = int(sim.city_center[B0, ROW, 0])
    reach = int(sim._regional_range)
    # two SOURCE columns, each holding a complete Industrial Zone in range of
    # the receiver's centre — the registry is what the walk reads, so the
    # district tile need not touch its own city.
    src = [t for t in range(sim.T)
           if 0 < int(sim.pair_dist[ctr, t]) <= reach and int(sim.district[B0, t]) < 0][:2]
    assert len(src) == 2, "no two free tiles inside the regional range"
    for j, t in enumerate(src, start=1):
        sim.city_alive[B0, ROW, j] = True
        sim.city_center[B0, ROW, j] = t
        sim.city_dist_tile[B0, ROW, j, iz] = t
        sim.district[B0, t] = iz
        sim.district_complete[B0, t] = True
        sim.city_bldg[B0, ROW, j, fac] = True
    sim._eff_version += 1
    sim._bldg_version += 1
    y6, _am = sim._seat_regional(ROW)
    once = float(y6[B0, 0, 1])
    base = float(sim.rules_dev.b_yields[fac][1])
    assert once == base, f"one Factory paid {once}, want {base}"
    seat_gov(sim, ROW, P)
    y6b, _am2 = sim._seat_regional(ROW)
    assert float(y6b[B0, 0, 1]) == 2 * base, (
        f"every Industrial Zone must pay: {float(y6b[B0, 0, 1])} vs {2 * base}")
    # a regional line OUTSIDE the Industrial Zone still pays once
    zoo = BIDS.index("ZOO")
    ec = int(sim._b_req_district[zoo])
    assert ec != iz
    for j, t in enumerate(src, start=1):
        n = [x for x in range(sim.T)
             if 0 < int(sim.pair_dist[ctr, x]) <= reach and int(sim.district[B0, x]) < 0][0]
        sim.city_dist_tile[B0, ROW, j, ec] = n
        sim.district[B0, n] = ec
        sim.district_complete[B0, n] = True
        sim.city_bldg[B0, ROW, j, zoo] = True
    sim._eff_version += 1
    sim._bldg_version += 1
    _y, am3 = sim._seat_regional(ROW)
    assert float(am3[B0, 0]) == float(sim.rules.b_amenities[zoo]), (
        "the promotion names ONE district — the Zoo must still pay once")
    print("  2 Vertical Integration OK — every in-range Industrial Zone, and nothing else")


def test_reinforced_materials(rules, path) -> None:
    sim = fresh(rules, path)
    P = promo_with(sim, "envDamageImmune")
    slot = sim.city_slot_at(ROW)
    mine = [t for t in range(sim.T) if int(slot[B0, t]) == 0]
    assert len(mine) >= 2, "the capital owns too little ground"
    imp, dist = mine[0], mine[1]
    other = [t for t in range(sim.T) if int(sim.tile_seat[B0, t]) < 0][0]
    rows = torch.tensor([B0, B0, B0])
    tiles = torch.tensor([imp, dist, other])

    for t in (imp, other):
        sim.improvement[B0, t] = 0
        sim.pillaged[B0, t] = False
    sim.district[B0, dist] = sim._iz_idx
    sim.district_complete[B0, dist] = True
    sim.district_pillaged[B0, dist] = False
    sim._eff_version += 1
    assert not bool(sim._env_immune()[B0].any()), "nobody holds the promotion yet"

    seat_gov(sim, ROW, P)
    assert bool(sim._env_immune()[B0, imp]) and bool(sim._env_immune()[B0, dist])
    assert not bool(sim._env_immune()[B0, other]), "unowned ground is not covered"
    sim._scorch(rows, tiles)
    sim._flood_district(rows, tiles)
    assert not bool(sim.pillaged[B0, imp]), "the governed improvement was scorched"
    assert not bool(sim.district_pillaged[B0, dist]), "the governed district was pillaged"
    assert bool(sim.pillaged[B0, other]), "the UNGOVERNED tile must still burn"
    print("  3 Reinforced Materials OK — the scorch and the flood both stop at the border")


def test_forestry_management(rules, path) -> None:
    sim = fresh(rules, path)
    P = promo_with(sim, "goldPerFeature")
    gold = float(sim._gpromo["goldPerFeature"][P])
    appeal = float(sim._gpromo["appealNearFeature"][P])
    assert (gold, appeal) == (2.0, 1.0), f"the sourced +2/+1 moved to {gold}/{appeal}"
    slot = sim.city_slot_at(ROW)
    mine = [t for t in range(sim.T) if int(slot[B0, t]) == 0]
    assert len(mine) >= 3
    # three owned tiles carry a live feature, one of them improved
    for t in mine[:3]:
        sim.feat_id[B0, t] = 0
        sim.feat_stripped[B0, t] = False
        sim.improvement[B0, t] = -1
    sim._eff_version += 1
    n = int(sim._unimproved_feature()[B0].sum())
    before_gold = float(sim._governor_feature_gold(ROW)[B0, 0])
    assert before_gold == 0.0
    seat_gov(sim, ROW, P)
    assert float(sim._governor_feature_gold(ROW)[B0, 0]) == gold * len(
        [t for t in mine if bool(sim._unimproved_feature()[B0, t])])
    sim.improvement[B0, mine[0]] = 0
    sim._eff_version += 1
    assert int(sim._unimproved_feature()[B0].sum()) == n - 1, "an improved feature still counts"

    # the appeal half: only a tile of this city STANDING BESIDE a live feature.
    # One feature on a bare map, so "beside" means beside THIS one.
    sim.feat_id[B0, :] = -1
    sim.improvement[B0, :] = -1
    sim.feat_id[B0, mine[0]] = 0
    sim._eff_version += 1
    nb = sim.neigh
    live = sim._unimproved_feature()
    beside = [t for t in mine
              if t != mine[0] and any(int(x) >= 0 and bool(live[B0, int(x)]) for x in nb[t])]
    away = [t for t in mine
            if not any(int(x) >= 0 and bool(live[B0, int(x)]) for x in nb[t])]
    assert beside and away, "the capital's ground gives no both-sides check"
    plane = sim._gov_appeal_plane()
    assert int(plane[B0, beside[0]]) == int(appeal)
    assert int(plane[B0, away[0]]) == 0
    # and it reaches `_tile_appeal`, which is what every reader asks
    lifted = int(sim._tile_appeal()[B0, beside[0]])
    sim.civ_gov_promos[B0, ROW, int(sim._gpromo_gov[P])] = 0
    sim._eff_version += 1
    assert int(sim._tile_appeal()[B0, beside[0]]) == lifted - int(appeal)
    print(f"  4 Forestry Management OK — {gold}/feature owned, +{appeal} Appeal beside one")


def test_patron_saint(rules, path) -> None:
    sim = fresh(rules, path)
    P = promo_with(sim, "firstPromoBonus")
    bank = int(sim._gpromo["firstPromoBonus"][P])
    assert bank == 1, f"the sourced 1 extra Promotion moved to {bank}"
    assert sim._apostle_idx >= 0
    ctr = int(sim.city_center[B0, ROW, 0])
    col = torch.zeros(sim.B, dtype=torch.long)
    landed = torch.zeros(sim.B, dtype=torch.bool)
    landed[B0] = True

    # no governor: nothing is banked
    slot = int(sim.unit_next[B0])
    sim.unit_next[B0] += 1
    sim.major_unit_alive[B0, slot] = True
    sim.major_unit_seat[B0, slot] = ROW
    sim.major_unit_type[B0, slot] = sim._apostle_idx
    sim.major_unit_tile[B0, slot] = ctr
    sim.major_unit_hp[B0, slot] = 100
    sim.major_unit_promo_bonus[B0, slot] = 0
    sim._patron_saint(ROW, landed, col)
    assert int(sim.major_unit_promo_bonus[B0, slot]) == 0, "an ungoverned city banked one"

    seat_gov(sim, ROW, P)
    sim._patron_saint(ROW, landed, col)
    assert int(sim.major_unit_promo_bonus[B0, slot]) == bank, "the buy banked nothing"

    # the SPEND: the first promotion takes it and re-arms the unit once
    cls = int(sim.rules_dev.u_promo_class[sim._apostle_idx])
    ncol = int(sim.rules_dev.promo_rows[cls])
    assert ncol >= 2, "the Apostle's class is too narrow for a second promotion"
    sim.major_unit_promo_offer[B0, slot] = 0
    sim.major_unit_xp[B0, slot] = sim._promo_xp_per_level
    sim.major_unit_level[B0, slot] = 1
    sim.civilian_at[B0, ctr] = slot + sim.POOL_LO["major"]
    sim.seat_ext[:, ROW] = True

    smap = sim._seat_slot_map(ROW)
    rank = int((smap[B0] == slot + sim.POOL_LO["major"]).long().argmax())
    a = torch.full(smap.shape, -1, dtype=torch.long)
    a[B0, rank] = sim._A_PROMOTE + 0
    sim._apply_seat_unit_actions(ROW, a)
    assert int(sim.major_unit_promos[B0, slot]) == 1, "the first promotion did not land"
    assert int(sim.major_unit_level[B0, slot]) == 2
    assert int(sim.major_unit_promo_bonus[B0, slot]) == 0, "the bank was not spent"
    assert int(sim.major_unit_xp[B0, slot]) == int(
        sim._xp_to_next(torch.tensor(2))), "the unit was not re-armed"

    sim.major_unit_mp[B0, slot] = sim._mp_scale * 2
    a2 = torch.full(smap.shape, -1, dtype=torch.long)
    a2[B0, rank] = sim._A_PROMOTE + 1
    sim._apply_seat_unit_actions(ROW, a2)
    assert int(sim.major_unit_promos[B0, slot]) == 0b11, "the second promotion did not land"
    assert int(sim.major_unit_xp[B0, slot]) == 0, "the bank re-armed it twice"
    print("  5 Patron Saint OK — banked at the buy, spent by the first promotion")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_surplus_logistics(rules, path)
    test_vertical_integration(rules, path)
    test_reinforced_materials(rules, path)
    test_forestry_management(rules, path)
    test_patron_saint(rules, path)
    print("BATTERY OK gov_clauses")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
