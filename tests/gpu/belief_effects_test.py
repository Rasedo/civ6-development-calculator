"""THE FOUNDER AND ENHANCER BELIEFS THE INSTALL SHIPS, AND THE DAR-E MEHR'S ERAS.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/belief_effects_test.py

CIV6 (Beliefs.xml, Expansion2_Beliefs.xml): LAY_MINISTRY (BELIEF_YIELD_PER_
DISTRICT, +1 Faith per Holy Site, +1 Culture per Theater Square), SACRED_PLACES
(BELIEF_YIELD_PER_CITY_WITH_WONDER, +2 Science, Culture, Gold and Faith),
MISSIONARY_ZEAL (ABILITY_RELIGIOUS_IGNORE_TERRAIN_COST), MONASTIC_ISOLATION
(EFFECT_ADJUST_RELIGIOUS_COMBAT_LOSS, ReductionPercent 100), HOLY_WATERS
(+10 religious healing at a following city's Holy Site), RELIGIOUS_COLONIZATION
(runs/b91c_colonization.jsonl: a founded city starts following the religion
on 200 x ceil(pop/2) + 2 of it); the Dar-e Mehr's Building_YieldsPerEra
(+1 Faith per game era since constructed or last repaired); a per-city founder
belief's cities following, worldwide; the worship building a city's majority
religion offers. The TS twin is tests/cpu/religion/belief-effects.test.ts.

Proven here:
  1 the pools: nine Founders and nine Enhancers, RELIGIOUS_COLONIZATION's 200;
  2 Lay Ministry and Sacred Places pay the capital per district / wonder city;
  3 Missionary Zeal zeroes a religious unit's terrain and river terms;
  4 Monastic Isolation keeps the pressure a condemned unit's religion sheds;
  5 Holy Waters heals any religious unit by a following city's Holy Site;
  6 the Dar-e Mehr stamps its era at the faith buy, pays per era since, and
    carries the stamp through a conquest; the digest names it;
  7 Pilgrimage pays per city following anywhere: a foreign major's, a
    city-state's; World Church 0.25 Culture per follower anywhere, unfloored;
  8 Religious Colonization: a city founded under a majority religion holding
    it starts following it on 202 (200 per two citizens, rounded up, + 2);
  9 a worship building is offered by the city's majority religion, whoever
    founded it, and none once the city holds one.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import load_rules, fixture_paths, FIXTURES
from core import statecompare
from warmup import opened, warm_base

B0, ROW = 0, 0
ONES = torch.ones(1, dtype=torch.bool)
RJ = json.loads((FIXTURES / "rules.json").read_text())
BIDS = [b["id"] for b in RJ["buildings"]]
FOU = RJ["beliefs"]["founders"]
ENH = RJ["beliefs"]["enhancers"]
LAY = next(i for i, r in enumerate(FOU) if any(any(v) for v in r["perD"]))
SACRED = next(i for i, r in enumerate(FOU) if any(r["perW"]))
ZEAL = next(i for i, r in enumerate(ENH) if r["zeal"])
MONASTIC = next(i for i, r in enumerate(ENH) if r["theoKeep"])
HW = next(i for i, r in enumerate(ENH) if r["hwHeal"])
COLON = next(i for i, r in enumerate(ENH) if r["colon"])
PILGRIM = next(i for i, r in enumerate(FOU) if r["perC"][5] > 0)
WORLD = next(i for i, r in enumerate(FOU) if r["perF"][0] > 0 and r["perF"][1 + 4] > 0)


def fresh(rules, path, turns: int = 0):
    """the opened world at `turns`, built once and restored for every scene —
    every plane a scene writes is `_MUTABLE`, so the restore is the whole job"""
    return warm_base((str(path), turns), lambda: opened(rules, path, turns))


def cap_slot(sim, row: int) -> int:
    cap = sim.city_is_cap[B0, row]
    return int(cap.long().argmax()) if bool(cap.any()) else int(sim.city_alive[B0, row].long().argmax())


def totals(sim, row: int) -> torch.Tensor:
    """[cols, 6] the row's city yields, and the amenity factor they carry"""
    _tier, _g, yf, _lux = sim._seat_amenity(row)
    maint, _h = sim._seat_housing(row)
    return sim._seat_city_walk(row, amen_yf=yf, maint=maint)[B0].double(), yf[B0].double()


def seat_belief(sim, row: int) -> torch.Tensor:
    """[6] the yields the row's beliefs pay the player, in no city"""
    sim._eff_version += 1
    return sim._belief_seat_yields(row)[B0].double()


def own_tile(sim, row: int, j: int, skip=()) -> int:
    owned = ((sim.city_slot_at(row)[B0] == j) & (sim.district[B0] < 0) & (sim.centre_slot_at[B0] < 0)
             & (sim.built_wonder[B0] < 0) & sim.passable[B0]).nonzero(as_tuple=True)[0].tolist()
    return next(t for t in owned if t not in skip)


def district(sim, row: int, j: int, di: int, skip=()) -> int:
    t = own_tile(sim, row, j, skip)
    sim.district[B0, t] = di
    sim.district_complete[B0, t] = True
    sim.city_dist_tile[B0, row, j, di] = t
    sim._eff_version += 1
    return t


def religion(sim, row: int, founder: int = -1, enhancer: int = -1) -> None:
    sim.civ_religion_done[B0, row] = True
    sim.civ_founder[B0, row] = founder
    sim.civ_enhancer[B0, row] = enhancer
    sim._bel_version += 1
    sim._eff_version += 1


def test_pools(rules, path) -> None:
    sim = fresh(rules, path)
    assert sim._bel_class_n[2] == 9 and sim._bel_class_n[3] == 9, f"pools {sim._bel_class_n}"
    colon = [i for i, r in enumerate(ENH) if r["colon"]]
    assert colon == [COLON] and int(ENH[COLON]["colon"]) == 200, f"Religious Colonization {colon}"
    print(f"  1 pools OK — 9 Founders, 9 Enhancers, Enhancer {COLON} the 200 a founded city starts with")


def test_founders(rules, path) -> None:
    sim = fresh(rules, path, 4)
    j = cap_slot(sim, ROW)
    district(sim, ROW, j, sim._hs_idx)
    ts_idx = int(next(d for d in sim.districts_cat if d["id"] == "THEATER_SQUARE")["idx"])
    district(sim, ROW, j, ts_idx)
    t0, _ = totals(sim, ROW)
    b0 = seat_belief(sim, ROW)
    religion(sim, ROW, founder=LAY)
    t1, _ = totals(sim, ROW)
    d = seat_belief(sim, ROW) - b0
    assert torch.equal(t1[j], t0[j]), f"Lay Ministry paid the capital {(t1[j] - t0[j]).tolist()}"
    assert abs(float(d[5]) - 1) < 1e-9, f"Lay Ministry faith {d.tolist()}"
    assert abs(float(d[4]) - 1) < 1e-9, f"Lay Ministry culture {d.tolist()}"
    # an unfinished Theater Square pays nothing
    sim.district_complete[B0, int(sim.city_dist_tile[B0, ROW, j, ts_idx])] = False
    assert float(seat_belief(sim, ROW)[4] - b0[4]) < 1e-9, "an unfinished Theater Square paid"
    # SACRED PLACES: +2 of four yields per city holding a completed wonder
    sim2 = fresh(rules, path, 4)
    j2 = cap_slot(sim2, ROW)
    w = 0
    t = own_tile(sim2, ROW, j2)
    sim2.built_wonder[B0, t] = w
    sim2.built_wonder_complete[B0, t] = True
    sim2.city_wonder[B0, ROW, j2, w] = t
    sim2._eff_version += 1
    s0 = seat_belief(sim2, ROW)
    religion(sim2, ROW, founder=SACRED)
    d2 = seat_belief(sim2, ROW) - s0
    for k in (2, 3, 4, 5):
        assert abs(float(d2[k]) - 2) < 1e-9, f"Sacred Places {d2.tolist()}"
    print(f"  2 Lay Ministry {d[4:].tolist()} and Sacred Places {d2[2:].tolist()} OK")


def test_zeal(rules, path) -> None:
    sim = fresh(rules, path)
    frm, dest = 0, int(sim.neigh[0][sim.neigh[0] >= 0][0])
    sim.road[B0, frm] = False
    sim.road[B0, dest] = False
    sim.railroad[B0, frm] = False
    sim.railroad[B0, dest] = False
    tm0 = sim.tmove[B0, dest].clone()
    sim.tmove[B0, dest] = 2 * sim._mp_scale
    one = lambda v: torch.tensor([v], dtype=torch.long)  # noqa: E731
    river = one(3 * sim._mp_scale)
    mis, war = one(sim._missionary_idx), one(0 if sim._missionary_idx != 0 else 1)
    promos, seat = one(0), one(ROW)
    base = sim._road_terms(one(frm), one(dest), river, mis, promos, seat)
    assert [int(x) for x in base] == [2 * sim._mp_scale, 3 * sim._mp_scale], f"base terms {base}"
    religion(sim, ROW, enhancer=ZEAL)
    zt = sim._road_terms(one(frm), one(dest), river, mis, promos, seat)
    assert [int(x) for x in zt] == [0, 0], f"Missionary Zeal terms {zt}"
    wt = sim._road_terms(one(frm), one(dest), river, war, promos, seat)
    assert int(wt[1]) == 3 * sim._mp_scale, "a military unit lost its river charge"
    other = sim._road_terms(one(frm), one(dest), river, mis, promos, one(1))
    assert [int(x) for x in other] == [2 * sim._mp_scale, 3 * sim._mp_scale], "another seat's missionary took it"
    sim.tmove[B0, dest] = tm0
    print("  3 Missionary Zeal OK — terrain and river terms zero for the seat's religious units alone")


def place(sim, tile: int, utype: int, seat: int) -> int:
    slot = int(sim.unit_next[B0])
    sim.unit_next[B0] += 1
    sim.major_unit_alive[B0, slot] = True
    sim.major_unit_seat[B0, slot] = seat
    sim.major_unit_type[B0, slot] = utype
    sim.major_unit_tile[B0, slot] = tile
    sim.major_unit_hp[B0, slot] = 100
    sim.major_unit_charges[B0, slot] = 1
    sim.major_unit_mp[B0, slot] = 0
    sim.major_unit_promos[B0, slot] = 0
    plane = sim.civilian_at if bool(sim._type_civilian[utype]) else sim.military_at
    plane[B0, tile] = slot + sim.POOL_LO["major"]
    return slot


def test_monastic(rules, path) -> None:
    lost = {}
    for enh in (-1, MONASTIC):
        sim = fresh(rules, path, 4)
        j = cap_slot(sim, ROW)
        ctr = int(sim.city_center[B0, ROW, j])
        religion(sim, 1, enhancer=enh)
        sim.city_pressure[B0, ROW, j, 1] = 500
        slot = place(sim, ctr, sim._missionary_idx, 1)
        sc = torch.full((1,), place(sim, ctr, 0, ROW), dtype=torch.long)
        sim._condemn_heretic(ROW, ONES, torch.full((1,), ctr, dtype=torch.long),
                             torch.full((1,), slot, dtype=torch.long), sc)
        assert not bool(sim.major_unit_alive[B0, slot]), "the heretic stood"
        lost[enh] = 500 - int(sim.city_pressure[B0, ROW, j, 1])
    assert lost == {-1: sim._condemn_swing, MONASTIC: 0}, f"pressure lost {lost}"
    # the last scene's religion holds the belief: a lost duel costs it nothing too
    assert int(sim._theo_loss(torch.tensor([B0]), torch.tensor([1]), 250)[0]) == 0, "the duel's loss"
    assert int(sim._theo_loss(torch.tensor([B0]), torch.tensor([ROW]), 250)[0]) == 250, "a religion without it"
    print(f"  4 Monastic Isolation OK — a condemnation costs {lost[-1]}, nothing with the belief")


def test_holy_waters(rules, path) -> None:
    sim = fresh(rules, path, 4)
    j = cap_slot(sim, ROW)
    hs = district(sim, ROW, j, sim._hs_idx)
    sim.city_followed[B0, ROW, j] = ROW
    near = next(n for n in sim.neigh[hs].tolist()
                if n >= 0 and int(sim.civilian_at[B0, n]) < 0 and bool(sim.passable[B0, n]))
    mine = place(sim, near, sim._missionary_idx, ROW)
    theirs = place(sim, hs, sim._missionary_idx, 1)
    h0 = sim._religious_heal("major")[B0].clone()
    religion(sim, ROW, enhancer=HW)
    h1 = sim._religious_heal("major")[B0]
    assert int(h1[mine] - h0[mine]) == 10 and int(h1[theirs] - h0[theirs]) == 10, \
        f"Holy Waters {int(h1[mine] - h0[mine])}, {int(h1[theirs] - h0[theirs])}"
    sim.city_followed[B0, ROW, j] = -1
    assert int(sim._religious_heal("major")[B0, mine] - h0[mine]) == 0, "a city not following paid"
    print("  5 Holy Waters OK — +10 by a following city's Holy Site, any seat's religious unit")


def test_dar_e_mehr(rules, path) -> None:
    sim = fresh(rules, path, 4)
    j = cap_slot(sim, ROW)
    district(sim, ROW, j, sim._hs_idx)
    sim.city_bldg[B0, ROW, j, sim._shrine_bidx] = True
    sim.city_bldg[B0, ROW, j, sim._temple_bidx] = True
    dem = BIDS.index("DAR_E_MEHR")
    wk = sim._worship_bidx.tolist().index(dem)
    religion(sim, ROW)
    sim.civ_worship[B0, ROW] = wk
    sim.city_followed[B0, ROW, j] = ROW
    sim._bel_version += 1
    sim._eff_version += 1
    assert sim._bpe_n == 1 and int(sim._bpe_bidx[0]) == dem, "the Dar-e Mehr carries the per-era row"
    sim.game_era[:] = 1
    sim._era_version += 1
    sim.civ_faith[B0, ROW] = 10_000.0
    sim._stash_buy(ROW, worship=torch.full((1,), j, dtype=torch.long))
    sim._seat_buy_ladder(ROW, ONES, sim._seat_army_count(ROW))
    assert bool(sim.city_bldg[B0, ROW, j, dem]), "the Dar-e Mehr was not bought"
    assert int(sim.city_bldg_era[B0, ROW, j, 0]) == 1, "the stamp is not the game era"
    f0 = float(totals(sim, ROW)[0][j, 5])
    sim.game_era[:] = 3
    sim._era_version += 1
    t1, yf = totals(sim, ROW)
    assert abs(float(t1[j, 5]) - f0 - 2 * float(yf[j])) < 1e-9, f"two eras: {float(t1[j, 5]) - f0}"
    # the digest names the stamp
    got = statecompare.CITY["buildingEras"](sim, B0, [(ROW, j)])[0]
    assert got == [dem, 1], f"digest {got}"
    # a conquest carries it
    ctr = int(sim.city_center[B0, ROW, j])
    assert sim._transfer_city(B0, ROW, j, 1, conquest=True, loyalty=False), "the conquest failed"
    k = int((sim.city_center[B0, 1] == ctr).long().argmax())
    assert bool(sim.city_alive[B0, 1, k]) and int(sim.city_bldg_era[B0, 1, k, 0]) == 1, "the stamp did not ride"
    print("  6 Dar-e Mehr OK — stamped at era 1, +2 Faith at era 3, carried through a conquest, in the digest")


def test_pilgrimage(rules, path) -> None:
    sim = fresh(rules, path, 4)
    j = cap_slot(sim, ROW)
    religion(sim, ROW, founder=PILGRIM)
    f0 = float(seat_belief(sim, ROW)[5])

    def gain() -> float:
        return float(seat_belief(sim, ROW)[5]) - f0

    sim.city_followed[B0, ROW, j] = ROW
    assert abs(gain() - 2) < 1e-9, gain()
    k = int(sim.city_alive[B0, 1].long().argmax())
    sim.city_followed[B0, 1, k] = ROW
    assert abs(gain() - 4) < 1e-9, gain()
    s = int(sim.citystate_alive[B0].long().argmax())
    assert bool(sim.citystate_alive[B0, s]), "no live city-state"
    sim.city_pressure[B0, sim._CITY_MINOR0 + s, 0, ROW] = 500
    assert abs(gain() - 6) < 1e-9, gain()
    sim.city_followed[B0, 1, k] = 1
    assert abs(gain() - 4) < 1e-9, gain()
    print("  7 Pilgrimage OK — +2 Faith per city following: its own, a foreign major's, a city-state's")


def test_world_church(rules, path) -> None:
    """World Church: 0.25 Culture per follower of the religion anywhere,
    unfloored, a minority's followers included (runs/b91w_worldchurch.jsonl)."""
    sim = fresh(rules, path, 4)
    j = cap_slot(sim, ROW)
    religion(sim, ROW, founder=WORLD)
    sim.city_pressure[B0] = 0
    sim.city_pop[B0, ROW, j] = 1
    k = int(sim.city_alive[B0, 1].long().argmax())
    sim.city_pop[B0, 1, k] = 4
    s = int(sim.citystate_alive[B0].long().argmax())
    assert bool(sim.citystate_alive[B0, s]), "no live city-state"
    sim.citystate_pop[B0, s] = 2
    c0 = float(seat_belief(sim, ROW)[4])

    def gain() -> float:
        return float(seat_belief(sim, ROW)[4]) - c0

    def followers() -> int:
        return int(sim._religion_followers(torch.tensor([ROW]))[B0])

    # one follower at home: a quarter, not floored away
    sim.city_pressure[B0, ROW, j, ROW] = 500
    assert followers() == 1 and abs(gain() - 0.25) < 1e-9, (followers(), gain())
    # one of a foreign city's four citizens, the unconverted its majority
    sim.city_pressure[B0, 1, k, ROW] = 60
    assert followers() == 2 and abs(gain() - 0.5) < 1e-9, (followers(), gain())
    # a city-state's two
    sim.city_pressure[B0, sim._CITY_MINOR0 + s, 0, ROW] = 500
    assert followers() == 4 and abs(gain() - 1.0) < 1e-9, (followers(), gain())
    # another religion's followers count nothing
    sim.city_pressure[B0, 1, k, ROW] = 0
    sim.city_pressure[B0, 1, k, 1] = 60
    assert followers() == 3 and abs(gain() - 0.75) < 1e-9, (followers(), gain())
    print("  7b World Church OK — 0.25 Culture a follower anywhere, a minority's included")


def test_colonization(rules, path) -> None:
    for enh, want in ((-1, -1), (COLON, ROW)):
        sim = fresh(rules, path, 4)
        religion(sim, ROW, enhancer=enh)
        sim.city_followed[B0, ROW] = torch.where(sim.city_alive[B0, ROW], ROW, -1)
        centres = torch.cat([(sim.centre_slot_at[B0] >= 0).nonzero(as_tuple=True)[0],
                             sim.citystate_center[B0][sim.citystate_alive[B0]]])
        spaced = (sim.pair_dist[centres].to(torch.long) >= 4).all(dim=0)
        ok = (~sim.water[B0] & sim.passable[B0] & sim.settle_ok[B0] & (sim.tile_seat[B0] < 0)
              & (sim.district[B0] < 0) & (sim.built_wonder[B0] < 0) & spaced)
        t = int(ok.nonzero(as_tuple=True)[0][0])
        assert bool(sim._found_city_at(ROW, ONES, torch.tensor([t]))[B0]), "the founding failed"
        k = int(((sim.city_center[B0, ROW] == t) & sim.city_alive[B0, ROW]).long().argmax())
        assert int(sim.city_followed[B0, ROW, k]) == want, int(sim.city_followed[B0, ROW, k])
        # 200 per two citizens, rounded up, plus 2: 202 at population 1
        assert int(sim.city_pressure[B0, ROW, k, ROW]) == (202 if want >= 0 else 0), int(sim.city_pressure[B0, ROW, k, ROW])
    assert sim._colonize_extra == 2
    print("  8 Religious Colonization OK — the founded city follows the majority religion on 202")


def test_worship_offer(rules, path) -> None:
    sim = fresh(rules, path, 4)
    j = cap_slot(sim, ROW)
    district(sim, ROW, j, sim._hs_idx)
    sim.city_bldg[B0, ROW, j, sim._shrine_bidx] = True
    sim.city_bldg[B0, ROW, j, sim._temple_bidx] = True
    wat, mosque = BIDS.index("WAT"), BIDS.index("MOSQUE")
    wb = sim._worship_bidx.tolist()
    religion(sim, ROW)
    sim.civ_worship[B0, ROW] = wb.index(wat)
    religion(sim, 1)
    sim.civ_worship[B0, 1] = wb.index(mosque)
    worship = sim._b_worship

    def offered() -> list:
        sim._eff_version += 1
        row = sim._seat_buildable(ROW)[B0, j] & worship
        return [BIDS[i] for i in row.nonzero(as_tuple=True)[0].tolist()]

    sim.city_followed[B0, ROW, j] = -1
    assert offered() == [], offered()
    sim.city_followed[B0, ROW, j] = 1
    assert offered() == ["MOSQUE"], offered()
    sim.city_followed[B0, ROW, j] = ROW
    assert offered() == ["WAT"], offered()
    sim.city_bldg[B0, ROW, j, wat] = True
    sim.city_followed[B0, ROW, j] = 1
    assert offered() == [], offered()
    print("  9 worship offer OK — the city's majority religion's building, none once one stands")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_pools(rules, path)
    test_founders(rules, path)
    test_zeal(rules, path)
    test_monastic(rules, path)
    test_holy_waters(rules, path)
    test_dar_e_mehr(rules, path)
    test_pilgrimage(rules, path)
    test_world_church(rules, path)
    test_colonization(rules, path)
    test_worship_offer(rules, path)
    print("BATTERY OK belief_effects")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
