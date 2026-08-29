"""THE GOVERNMENT PLAZA'S FOUR EFFECT BODIES.

    python tests/gpu/plaza_test.py

The Plaza's tier-1 and tier-3 rows each carry a rule beyond their governor
title, and every one of them is out of the scripted gate's reach — a Plaza is
built, but the tier-3 chain needs a tier-3 government. These pokes force the
buildings into memory and drive the twin bodies directly.

Covered here:
  1. the catalog wire: each row's magnitude reaches its tensor, and no other
     building carries the channel.
  2. the Ancestral Hall: +50% toward a SETTLER in its own city, nothing toward
     anything else, and a free Builder in every city the seat FOUNDS.
  3. the Warlord's Throne: a capture opens the five-turn window, the window
     pays every city, and the tail ticks it out.
  4. the National History Museum: four slots for any Great Work — one shared
     pool over the three kinds and relics, spent only after the dedicated
     slots are.
  5. the War Department: 20 hit points off a kill, capped at full, and paid to
     nobody who does not hold the building.
  6. the Royal Society: a Builder's whole charge bank into the District Project
     it stands on, 2% of the cost each, once per city per turn.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, fixture_paths, FIXTURES
from warmup import settle_all

ROW = 1  # a civ row: every body below is seat-generic
RJ = json.loads((FIXTURES / "rules.json").read_text(encoding="utf-8"))
BLD = [b["id"] for b in RJ["buildings"]]
UNI = [u["id"] for u in RJ["units"]]
SCF = RJ["districtScaffold"]


def fresh(rules, path, turns=20):
    sim = settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64))
    for _ in range(turns):
        sim.step()
    return sim


def bidx_of(sim, row):
    """the first live city column of `row`, and its slot index."""
    live = sim.city_alive[0, row].nonzero(as_tuple=True)[0]
    assert len(live) > 0, "the row has no city"
    return int(live[0])


def stand(sim, row, col, name):
    """put building `name` up in one of the row's cities."""
    bi = BLD.index(name)
    sim.city_bldg[0, row, col, bi] = True
    sim._eff_version += 1
    sim._bldg_version += 1  # every `city_bldg` write moves it, engine or poke
    return bi


def poke_catalog(rules, path):
    sim = fresh(rules, path, turns=1)
    cat = BLD
    ah, wt = cat.index("ANCESTRAL_HALL"), cat.index("WARLORDS_THRONE")
    nh, wd = cat.index("NATIONAL_HISTORY_MUSEUM"), cat.index("WAR_DEPARTMENT")
    rs = cat.index("ROYAL_SOCIETY")
    u = UNI
    assert float(sim._b_settler_prod[ah]) == 50.0, "Ancestral Hall +50% settler production"
    assert int(sim._b_grant_new_city[ah]) == u.index("BUILDER"), "Ancestral Hall grants a BUILDER"
    assert float(sim._b_conquest_pct[wt]) == 20.0, "Warlord's Throne +20% production"
    assert int(sim._b_conquest_turns[wt]) == 5, "Warlord's Throne runs five turns"
    assert int(sim._b_any_work[nh]) == 4, "National History Museum: four any-work slots"
    assert int(sim._b_heal_kill[wd]) == 20, "War Department heals 20"
    assert float(sim._b_project_charge[rs]) == 2.0, "Royal Society pays 2% a charge"
    for i in range(len(cat)):
        if i != ah:
            assert float(sim._b_settler_prod[i]) == 0.0 and int(sim._b_grant_new_city[i]) < 0, cat[i]
        if i != wt:
            assert float(sim._b_conquest_pct[i]) == 0.0 and int(sim._b_conquest_turns[i]) == 0, cat[i]
        if i != nh:
            assert int(sim._b_any_work[i]) == 0, cat[i]
        if i != wd:
            assert int(sim._b_heal_kill[i]) == 0, cat[i]
        if i != rs:
            assert float(sim._b_project_charge[i]) == 0.0, cat[i]
    assert sim._heal_kill_live and sim._any_work_live, "both catalog gates arm"
    assert sim._project_charge_live and sim._A_BOOST >= 0, "the Royal Society's verb is wired"
    print("  1 catalog OK — five rows, five channels, nothing else carrying them")


def poke_settler_prod(rules, path):
    """the Ancestral Hall's own city fills a SETTLER half again as fast."""
    def run(hall: bool) -> float:
        sim = fresh(rules, path)
        col = bidx_of(sim, ROW)
        if hall:
            stand(sim, ROW, col, "ANCESTRAL_HALL")
        sim.city_current[0, ROW, col] = sim.SETTLER
        sim.city_progress[0, ROW, col] = 0.0
        sim.city_cost[0, ROW, col] = 10_000.0  # never completes inside the poke
        sim.city_prod_bank[0, ROW, col] = 0.0
        sim.step()
        return float(sim.city_progress[0, ROW, col])

    plain = run(False)
    assert plain > 0, "the control city produced nothing"
    boosted = run(True)
    assert abs(boosted - plain * 1.5) < 1e-9, f"settler production {boosted} vs {plain} x 1.5"

    # and NOT toward a building
    def run_b(hall: bool) -> float:
        sim = fresh(rules, path)
        col = bidx_of(sim, ROW)
        if hall:
            stand(sim, ROW, col, "ANCESTRAL_HALL")
        sim.city_current[0, ROW, col] = 0  # the first building row
        sim.city_progress[0, ROW, col] = 0.0
        sim.city_cost[0, ROW, col] = 10_000.0
        sim.city_prod_bank[0, ROW, col] = 0.0
        sim.step()
        return float(sim.city_progress[0, ROW, col])

    assert abs(run_b(True) - run_b(False)) < 1e-9, "the Hall paid a BUILDING"
    print("  2 Ancestral Hall production OK — x1.5 on a settler, x1 on a building")


def poke_new_city_builder(rules, path):
    sim = fresh(rules, path)
    col = bidx_of(sim, ROW)
    assert int(sim._seat_new_city_unit(ROW)[0]) < 0, "a seat with no Hall grants nothing"
    stand(sim, ROW, col, "ANCESTRAL_HALL")
    bi = UNI.index("BUILDER")
    assert int(sim._seat_new_city_unit(ROW)[0]) == bi, "the Hall grants a BUILDER"

    before = int((sim.unit_alive[0] & (sim.unit_seat[0] == ROW)
                  & (sim.unit_type[0] == bi)).sum())
    # a legal, unclaimed, land tile — `_found_city_at` re-checks the rest
    tile = -1
    for t in range(sim.T):
        if bool(sim.water[0, t]) or int(sim.tile_seat[0, t]) >= 0:
            continue
        tile = t
        break
    assert tile >= 0, "no free land tile in the fixture"
    want = torch.ones(1, dtype=torch.bool)
    tt = torch.tensor([tile])
    found = sim._found_city_at(ROW, want, tt)
    sim._grant_new_city_unit(ROW, found, tt)
    if bool(found[0]):
        after = int((sim.unit_alive[0] & (sim.unit_seat[0] == ROW)
                     & (sim.unit_type[0] == bi)).sum())
        assert after == before + 1, f"the founding granted {after - before} builders"
        assert int(sim.civilian_at[0, tile]) >= 0, "the Builder did not land on the new centre"
    print("  3 Ancestral Hall founding grant OK — one BUILDER per city founded")


def poke_conquest_window(rules, path):
    sim = fresh(rules, path)
    col = bidx_of(sim, ROW)
    stand(sim, ROW, col, "WARLORDS_THRONE")
    assert int(sim._seat_building_sum(ROW, sim._b_conquest_turns)[0]) == 5
    assert int(sim.conquest_turns[0, ROW]) == 0, "the window starts shut"

    # the CAPTURE opens it: take a city off another live major row
    other = next((r for r in range(sim.n_majors)
                  if r != ROW and bool(sim.city_alive[0, r].any())), -1)
    assert other >= 0, "the fixture has no second major with a city"
    scol = int(sim.city_alive[0, other].nonzero(as_tuple=True)[0][0])
    sim._transfer_city(0, other, scol, ROW, conquest=True)
    assert int(sim.conquest_turns[0, ROW]) == 5, "the capture did not open the window"

    # and the tail ticks it out
    sim.conquest_turns[0, ROW] = 2
    sim.step()
    assert int(sim.conquest_turns[0, ROW]) == 1, "the window did not tick"
    sim.step()
    assert int(sim.conquest_turns[0, ROW]) == 0
    sim.step()
    assert int(sim.conquest_turns[0, ROW]) == 0, "the window went negative"
    print("  4 Warlord's Throne window OK — opened by a capture, five turns, ticks to zero")


def poke_conquest_prod(rules, path):
    def run(open_window: bool) -> float:
        sim = fresh(rules, path)
        col = bidx_of(sim, ROW)
        stand(sim, ROW, col, "WARLORDS_THRONE")
        if open_window:
            sim.conquest_turns[0, ROW] = 5
        sim.city_current[0, ROW, col] = sim.SETTLER
        sim.city_progress[0, ROW, col] = 0.0
        sim.city_cost[0, ROW, col] = 10_000.0
        sim.city_prod_bank[0, ROW, col] = 0.0
        sim.step()
        return float(sim.city_progress[0, ROW, col])

    shut = run(False)
    assert shut > 0, "the control city produced nothing"
    assert abs(run(True) - shut * 1.2) < 1e-9, "the window did not pay +20%"
    print("  5 Warlord's Throne production OK — x1.2 in the window, x1 outside it")


def poke_any_work_pool(rules, path):
    sim = fresh(rules, path)
    col = bidx_of(sim, ROW)
    assert int(sim._any_work_free_all()[0, ROW, col]) == 0, "no museum, no pool"
    stand(sim, ROW, col, "NATIONAL_HISTORY_MUSEUM")
    assert int(sim._any_work_free_all()[0, ROW, col]) == 4, "the museum opens four"
    # every kind draws on the same pool
    assert int(sim._gw_capacity(ROW, 0)[0, col]) == 4
    assert int(sim._gw_capacity(ROW, 2)[0, col]) == 4
    sim.city_gw_writing[0, ROW, col] = 2
    assert int(sim._any_work_free_all()[0, ROW, col]) == 2, "two works did not take two slots"
    assert int(sim._gw_capacity(ROW, 1)[0, col]) == 2, "the art capacity ignored the pool"
    sim.city_relics[0, ROW, col] = 1
    assert int(sim._any_work_free_all()[0, ROW, col]) == 1, "a relic did not take a slot"
    assert int(sim._relic_cap()[0, ROW, col]) == 2, "the relic capacity ignored the pool"

    # a DEDICATED slot is spent first: the Amphitheater's own two come before
    # anything reaches the pool
    sim2 = fresh(rules, path)
    col2 = bidx_of(sim2, ROW)
    stand(sim2, ROW, col2, "NATIONAL_HISTORY_MUSEUM")
    stand(sim2, ROW, col2, "AMPHITHEATER")
    assert int(sim2._gw_capacity(ROW, 0)[0, col2]) == 6, "two dedicated plus four pooled"
    sim2.city_gw_writing[0, ROW, col2] = 2
    assert int(sim2._any_work_free_all()[0, ROW, col2]) == 4, "the dedicated slots touched the pool"
    sim2.city_gw_writing[0, ROW, col2] = 3
    assert int(sim2._any_work_free_all()[0, ROW, col2]) == 3, "the third work missed the pool"
    print("  6 National History Museum OK — one shared pool over three kinds and relics")


def poke_heal_on_kill(rules, path):
    sim = fresh(rules, path)
    col = bidx_of(sim, ROW)
    cap = int(sim.rules.combat.get("unitHp", 100))
    rows = torch.tensor([ROW])
    won = torch.ones(1, dtype=torch.bool)
    hp = torch.tensor([40], dtype=sim.unit_hp.dtype)
    assert int(sim._heal_on_kill(rows, won, hp)[0]) == 40, "healed with no building standing"
    stand(sim, ROW, col, "WAR_DEPARTMENT")
    assert int(sim._heal_on_kill(rows, won, hp)[0]) == 60, "the kill did not heal 20"
    full = torch.tensor([cap - 5], dtype=sim.unit_hp.dtype)
    assert int(sim._heal_on_kill(rows, won, full)[0]) == cap, "the heal ran past full"
    lost = torch.zeros(1, dtype=torch.bool)
    assert int(sim._heal_on_kill(rows, lost, hp)[0]) == 40, "a unit that killed nothing healed"
    # a barbarian row is off the major roster and heals nothing
    barb = torch.tensor([sim.n_majors + 40])
    assert int(sim._heal_on_kill(barb, won, hp)[0]) == 40, "an off-roster seat healed"
    print("  7 War Department OK — 20 off a kill, capped at full, its own seat only")


def _working_campus(sim, col):
    """Give ROW's city `col` a finished CAMPUS of its own and put the Campus
    project on its queue head. Returns (tile, project index)."""
    ctr = int(sim.city_center[0, ROW, col])
    cid = int(sim.city_id[0, ROW, col])
    didx = int(SCF["campusIdx"])
    pi = next(i for i, p in enumerate(sim._proj_rows) if int(p["d"]) == didx)
    for n in sim.neigh[ctr].tolist():
        if n < 0 or not bool(sim.passable[0, n]) or int(sim.district[0, n]) >= 0:
            continue
        sim.district[0, n] = didx
        sim.district_complete[0, n] = True
        sim.district_pillaged[0, n] = False
        sim.tile_seat[0, n] = ROW
        sim.tile_city[0, n] = cid
        sim.city_current[0, ROW, col] = sim.PROJECT_BASE + pi
        sim.city_cost[0, ROW, col] = 300
        sim.city_progress[0, ROW, col] = 0
        return n, pi
    raise AssertionError("no free plot beside the centre for a Campus")


def poke_project_boost(rules, path):
    """the Royal Society: the whole bank in one blow, once a city a turn."""
    sim = fresh(rules, path)
    col = bidx_of(sim, ROW)
    stand(sim, ROW, col, "ROYAL_SOCIETY")
    tile, _pi = _working_campus(sim, col)
    bi = UNI.index("BUILDER")

    # the site predicate answers for the district and for nothing else
    span = torch.arange(sim.T).reshape(1, -1)
    slots = sim._project_boost_slot(ROW, span)
    assert int(slots[0, tile]) == col, "the campus is no boost site"
    assert int((slots[0] >= 0).sum()) == 1, "some other plot answers too"
    assert int(slots[0, int(sim.city_center[0, ROW, col])]) < 0, "the centre is not a district project"

    slot = int(sim.unit_next[0])
    sim.unit_next[0] += 1
    sim.major_unit_alive[0, slot] = True
    sim.major_unit_seat[0, slot] = ROW
    sim.major_unit_type[0, slot] = bi
    sim.major_unit_tile[0, slot] = tile
    sim.major_unit_hp[0, slot] = 100
    sim.major_unit_charges[0, slot] = 3
    sim.major_unit_mp[0, slot] = 2
    sim.major_unit_mp_full[0, slot] = 2
    sim.civilian_at[0, tile] = slot + sim.POOL_LO["major"]

    sim.seat_ext[:, ROW] = True
    um = sim._seat_unit_mask(ROW)
    smap = sim._seat_slot_map(ROW)
    rank = int((smap[0] == slot + sim.POOL_LO["major"]).long().argmax())
    assert bool(um[0, rank, sim._A_BOOST]), "the mask refuses a legal payment"

    a = torch.full(smap.shape, -1, dtype=torch.long)
    a[0, rank] = sim._A_BOOST
    sim._apply_seat_unit_actions(ROW, a)
    assert float(sim.city_progress[0, ROW, col]) == 18.0, (
        f"3 charges x 2% x 300 = 18, got {float(sim.city_progress[0, ROW, col])}")
    assert not bool(sim.unit_alive[0, slot]), "the Builder survived its whole bank"
    assert int(sim.city_boost_turn[0, ROW, col]) == sim.turn, "the city took no stamp"

    # a second Builder the same turn finds the column shut
    slot2 = int(sim.unit_next[0])
    sim.unit_next[0] += 1
    sim.major_unit_alive[0, slot2] = True
    sim.major_unit_seat[0, slot2] = ROW
    sim.major_unit_type[0, slot2] = bi
    sim.major_unit_tile[0, slot2] = tile
    sim.major_unit_hp[0, slot2] = 100
    sim.major_unit_charges[0, slot2] = 3
    sim.major_unit_mp[0, slot2] = 2
    sim.major_unit_mp_full[0, slot2] = 2
    sim.civilian_at[0, tile] = slot2 + sim.POOL_LO["major"]
    um2 = sim._seat_unit_mask(ROW)
    smap2 = sim._seat_slot_map(ROW)
    rank2 = int((smap2[0] == slot2 + sim.POOL_LO["major"]).long().argmax())
    assert not bool(um2[0, rank2, sim._A_BOOST]), "the city paid twice in one turn"

    # ...and opens again next turn
    sim.turn += 1
    um3 = sim._seat_unit_mask(ROW)
    assert bool(um3[0, rank2, sim._A_BOOST]), "the stamp never expires"
    print("  8 royal society OK — 2% a charge, the bank in one blow, one payment a turn")


def poke_boost_needs_the_building(rules, path):
    """no Royal Society, no column — the same city, the same project."""
    sim = fresh(rules, path)
    col = bidx_of(sim, ROW)
    tile, _pi = _working_campus(sim, col)
    span = torch.arange(sim.T).reshape(1, -1)
    assert int(sim._project_boost_slot(ROW, span)[0, tile]) == col, "the site itself is unconditional"
    bi = UNI.index("BUILDER")
    slot = int(sim.unit_next[0])
    sim.unit_next[0] += 1
    sim.major_unit_alive[0, slot] = True
    sim.major_unit_seat[0, slot] = ROW
    sim.major_unit_type[0, slot] = bi
    sim.major_unit_tile[0, slot] = tile
    sim.major_unit_hp[0, slot] = 100
    sim.major_unit_charges[0, slot] = 3
    sim.major_unit_mp[0, slot] = 2
    sim.major_unit_mp_full[0, slot] = 2
    sim.civilian_at[0, tile] = slot + sim.POOL_LO["major"]
    sim.seat_ext[:, ROW] = True
    um = sim._seat_unit_mask(ROW)
    smap = sim._seat_slot_map(ROW)
    rank = int((smap[0] == slot + sim.POOL_LO["major"]).long().argmax())
    assert not bool(um[0, rank, sim._A_BOOST]), "a seat with no Society still pays"
    print("  9 the verb needs the building — the column is shut without it")


def main() -> None:
    rules = load_rules()
    paths = fixture_paths()
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    p = paths[0]
    print(f"plaza_test on {p.name}")
    poke_catalog(rules, p)
    poke_settler_prod(rules, p)
    poke_new_city_builder(rules, p)
    poke_conquest_window(rules, p)
    poke_conquest_prod(rules, p)
    poke_any_work_pool(rules, p)
    poke_heal_on_kill(rules, p)
    poke_project_boost(rules, p)
    poke_boost_needs_the_building(rules, p)
    print("PLAZA POKES OK")


if __name__ == "__main__":
    main()
