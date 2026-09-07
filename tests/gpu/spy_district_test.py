"""THE SPY STANDS ON A DISTRICT — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/spy_district_test.py

The TS twin is tests/cpu/espionage/spy-district.test.ts.

CIV6 (UnitOperations): every spy operation names a `TargetDistrict` — Steal
Tech Boost the Campus, Sabotage Production the Industrial Zone — or none,
the City Center. A spy occupies the district it works out of. No gate lane
runs a spy mission end to end, so these scenes are the evidence:
  1. the travel head offers the DISTRICT tiles of a revealed city, nearest
     first, and a jump lands the spy on the tile it named
  2. a mission is offered where its district stands under the spy — the
     Zone's on the Zone, the centre's on the centre — and the counterspy
     post on any district of an own city
  3. CIV6 (Surveillance): the post defends every district of its city, and
     works a level higher within one hex of where it stands; Polygraph reads
     the whole city
  4. CIV6 (Sabotage Production) pillages the Zone's BUILDINGS: the yield
     walk skips them, the queue offers the repair at a quarter of the price,
     the gold arm does not, and the repair completing clears the flag
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


def fresh(rules, path, turns=30):
    sim = settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64))
    for _ in range(turns):
        sim.step()
    return sim


def a_city(sim, row):
    live = sim.city_alive[B0, row].nonzero().flatten()
    assert live.numel(), f"row {row} holds no city"
    return int(live[0])


def give_district(sim, row, j, di, dist: int | None = None):
    """A COMPLETE district of type `di` on a free plot the city owns — at
    exactly `dist` from the centre when asked."""
    ctr = int(sim.city_center[B0, row, j])
    free = [t for t in range(sim.T)
            if int(sim.tile_seat[B0, t]) == row and int(sim.district[B0, t]) < 0
            and int(sim.built_wonder[B0, t]) < 0 and bool(sim.passable[B0, t]) and t != ctr
            and (dist is None or int(sim.pair_dist[ctr, t]) == dist)]
    assert free, f"the city owns no free plot at distance {dist}"
    t = free[0]
    sim.district[B0, t] = di
    sim.district_complete[B0, t] = True
    sim.district_pillaged[B0, t] = False
    sim.city_dist_tile[B0, row, j, di] = t
    sim._eff_version += 1
    sim._tile_owner_ver += 1
    return t


def spawn_spy(sim, row, tile):
    was = set(sim.major_unit_alive[B0].nonzero().flatten().tolist())
    sim._spawn_unit(row, torch.ones(1, dtype=torch.bool), torch.tensor([tile]),
                    torch.tensor([sim._spy_idx]))
    got = set(sim.major_unit_alive[B0].nonzero().flatten().tolist()) - was
    assert len(got) == 1, "the spawn found no slot"
    sim._gen_ver += 1
    return got.pop()


def rank_of(sim, row, slot):
    smap = sim._seat_slot_map(row)[B0]
    return int((smap == slot).nonzero(as_tuple=True)[0][0])


def order(sim, row, slot, col):
    smap = sim._seat_slot_map(row)[B0]
    acts = torch.full((1, smap.shape[0]), -1, dtype=torch.long)
    acts[0, rank_of(sim, row, slot)] = col
    sim.seat_ext[B0, row] = True
    sim._apply_seat_unit_actions(row, acts)


def missions(sim, row, slot):
    m = sim._seat_unit_mask(row)
    return m[B0, rank_of(sim, row, slot)][sim._A_SPY_MISSION:sim._A_SPY_MISSION + sim._n_spy_missions]


def pcol(sim, kind):
    rd = sim.rules_dev
    ec = list(rd.promo_classes).index("ESPIONAGE")
    k = sim._pk[kind]
    hit = [j for j in range(int(rd.promo_rows[ec]))
           if any(int(rd.promo_kind[ec, j, s]) == k for s in range(rd.promo_kind.shape[2]))]
    assert len(hit) == 1, f"{kind} names {len(hit)} columns"
    return hit[0]


def main() -> None:
    rules = load_rules()
    path = fixture_paths()[0]
    row, foe = 1, 2
    sim = fresh(rules, path)
    assert sim._spy_idx >= 0 and sim._iz_idx >= 0 and sim._campus_idx >= 0
    mine, theirs = a_city(sim, row), a_city(sim, foe)
    ctr_m = int(sim.city_center[B0, row, mine])
    ctr_t = int(sim.city_center[B0, foe, theirs])
    iz = give_district(sim, foe, theirs, sim._iz_idx, dist=1)
    far = give_district(sim, foe, theirs, sim._campus_idx, dist=2)
    sim.seat_explored[B0, row] = True

    # -- 1: the travel head names district tiles, nearest first -------------
    v = spawn_spy(sim, row, ctr_m)
    cols = sim._spy_destinations(row, torch.tensor([[v]]), torch.tensor([[ctr_m]]),
                                 torch.tensor([[sim._spy_idx]]))[B0, 0].tolist()
    live = [c for c in cols if c >= 0]
    assert ctr_t in live and iz in live and far in live, "a district tile of a revealed city is missing"
    assert ctr_m not in live, "the spy's own tile is offered"
    d = [int(sim.pair_dist[ctr_m, c]) for c in live]
    assert d == sorted(d), f"the head is not nearest-first: {d}"
    k = live.index(iz)
    order(sim, row, v, sim._A_SPY_TRAVEL + k)
    assert int(sim.unit_spy_target[B0, v]) == iz, "the jump did not name the Zone's tile"
    for _ in range(int(sim.unit_spy_turns[B0, v])):
        sim._tick_spies(row)
    assert int(sim.unit_tile[B0, v]) == iz, "the spy did not land on the Zone"
    hrow, hcol = sim._spy_here(torch.tensor([[iz]]))
    assert (int(hrow[0, 0]), int(hcol[0, 0])) == (foe, theirs), "the Zone is not read as its city's"
    print("  1 travel OK — district tiles offered nearest first, the spy lands on the one it named")

    # -- 2: the geometry of the mask ----------------------------------------
    mm = missions(sim, row, v)
    assert bool(mm[sim._spy_m_sabotage]), "Sabotage is not offered on the Zone"
    assert not bool(mm[sim._spy_m_sources]) and not bool(mm[sim._spy_m_unrest]), "a centre mission lit on the Zone"
    sim.unit_tile[B0, v] = ctr_t
    sim._gen_ver += 1
    mm = missions(sim, row, v)
    assert not bool(mm[sim._spy_m_sabotage]), "Sabotage is offered from the centre"
    assert bool(mm[sim._spy_m_unrest]), "a centre mission is not offered on the centre"
    assert not bool(mm[sim._spy_m_counterspy]), "the post is offered in a rival's city"
    own_c = give_district(sim, row, mine, sim._campus_idx)
    sim.unit_tile[B0, v] = own_c
    sim._gen_ver += 1
    mm = missions(sim, row, v)
    assert bool(mm[sim._spy_m_counterspy]), "the post is not offered on an own district"
    sim.unit_tile[B0, v] = ctr_m
    sim._gen_ver += 1
    assert bool(missions(sim, row, v)[sim._spy_m_counterspy]), "the post is not offered on the own centre"
    print("  2 mask OK — a mission where its district stands, the post on any own district")

    # -- 3: Surveillance's reach and Polygraph's whole city -----------------
    guard = spawn_spy(sim, foe, ctr_t)
    sim.unit_spy_mission[B0, guard] = sim._spy_m_counterspy
    base_iz = sim._counter_levels(B0, foe, theirs, iz)
    base_far = sim._counter_levels(B0, foe, theirs, far)
    sim.unit_promos[B0, guard] = 1 << pcol(sim, "SPY_SURVEIL")
    assert sim._counter_levels(B0, foe, theirs, iz) == base_iz + 1, "no +1 level within one hex of the post"
    assert sim._counter_levels(B0, foe, theirs, far) == base_far, "the +1 reached two hexes out"
    assert sim._counter_levels(B0, foe, theirs, ctr_t) == base_iz + 1, "the post's own tile is within reach"
    # the post GUARDS the district the intruder works from: its own tile
    # always, every district of the city with Surveillance
    sim.unit_promos[B0, guard] = 0
    assert sim._counterspies_guarding(B0, foe, theirs, iz).numel() == 0, "a post on the centre guarded the Zone unpromoted"
    assert sim._counterspies_guarding(B0, foe, theirs, ctr_t).tolist() == [guard]
    sim.unit_promos[B0, guard] = 1 << pcol(sim, "SPY_SURVEIL")
    assert sim._counterspies_guarding(B0, foe, theirs, iz).tolist() == [guard], "Surveillance did not extend the guard"
    assert sim._counterspies_guarding(B0, foe, theirs, far).tolist() == [guard]
    # Polygraph: the post reads anywhere in the city
    sim.unit_promos[B0, guard] = 1 << pcol(sim, "SPY_HOME_ENEMY_LEVEL")
    sim.unit_tile[B0, guard] = far
    sim._gen_ver += 1
    assert sim._counter_levels(B0, foe, theirs, iz) == base_iz + 1, "Polygraph on a district did not reach the city"
    sim.unit_alive[B0, guard] = False
    sim._gen_ver += 1
    print("  3 surveillance OK — every district guarded, +1 level within one hex; Polygraph city-wide")

    # -- 4: Sabotage pillages the Zone's buildings; the queue repairs them ---
    wk = int((sim._b_req_district == sim._iz_idx).nonzero(as_tuple=True)[0][0])
    sim.city_bldg[B0, foe, theirs, wk] = True
    # the repair is offered under the building's own unlock, like the build
    ut, uc = int(sim.rules_dev.b_unlock[wk]), int(sim.rules_dev.b_unlock_civic[wk])
    if ut >= 0:
        sim.civ_techs[B0, foe, ut] = True
    if uc >= 0:
        sim.civ_civics[B0, foe, uc] = True
    sim._bldg_version += 1
    sim._eff_version += 1
    yf = sim._seat_amenity(foe)[2][:, theirs:theirs + 1]
    prod_lit = float(sim._seat_city_walk(foe, theirs, amen_yf=yf)[B0, 0, 1])
    sim.unit_tile[B0, v] = iz
    sim.unit_spy_mission[B0, v] = sim._spy_idle
    sim._gen_ver += 1
    order(sim, row, v, sim._A_SPY_MISSION + sim._spy_m_sabotage)
    sim.rng_state[B0] = 7  # a draw that clears the success bar
    for _ in range(int(sim.unit_spy_turns[B0, v])):
        sim._tick_spies(row)
    assert bool(sim.city_bldg_pillaged[B0, foe, theirs, wk]), "Sabotage did not pillage the Workshop"
    assert not bool(sim.district_pillaged[B0, iz]), "Sabotage darkened the district"
    yf = sim._seat_amenity(foe)[2][:, theirs:theirs + 1]
    prod_dark = float(sim._seat_city_walk(foe, theirs, amen_yf=yf)[B0, 0, 1])
    assert prod_dark < prod_lit, f"the yield walk still pays the pillaged Workshop ({prod_lit} -> {prod_dark})"
    # the REPAIR: the building's own column, at a quarter of the price, from the queue alone
    assert bool(sim._seat_buildable(foe)[B0, theirs, wk]), "the pillaged Workshop is not offered for repair"
    assert not bool(sim._seat_buildable(foe, gold=True)[B0, theirs, wk]), "the gold arm sells a repair"
    full = float(sim.rules_dev.b_cost[wk])
    pct = float(sim.rules.pillage_building_repair_pct)
    want = round(full * pct / 100.0)
    got = float(sim._building_cost_in(foe, theirs, torch.tensor([wk]))[B0])
    assert got == want, f"the repair is priced {got}, want {want} ({pct}% of {full})"
    hit = torch.zeros(sim.B, dtype=torch.bool)
    hit[B0] = True
    sim._q_push(foe, theirs, hit, torch.full((sim.B,), wk, dtype=torch.long),
                torch.full((sim.B,), want, dtype=sim.city_cost.dtype))
    sim._seat_city_produce(foe, torch.full((sim.B,), theirs, dtype=torch.long), hit,
                           torch.full((sim.B,), want, dtype=torch.float64))
    assert not bool(sim.city_bldg_pillaged[B0, foe, theirs, wk]), "the repair completing did not clear the flag"
    assert bool(sim.city_bldg[B0, foe, theirs, wk]), "the repair lost the building"
    assert not bool(sim._seat_buildable(foe)[B0, theirs, wk]), "a repaired building is still offered"
    print(f"  4 sabotage OK — the Workshop pillaged and dark, repaired at {want:.0f} of {full:.0f}")

    print("BATTERY OK spy_district")


if __name__ == "__main__":
    main()
