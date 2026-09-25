"""THE FOUNDER AND ENHANCER BELIEFS THE INSTALL SHIPS, AND THE DAR-E MEHR'S ERAS.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/belief_effects_test.py

CIV6 (Beliefs.xml, Expansion2_Beliefs.xml): LAY_MINISTRY (BELIEF_YIELD_PER_
DISTRICT, +1 Faith per Holy Site, +1 Culture per Theater Square), SACRED_PLACES
(BELIEF_YIELD_PER_CITY_WITH_WONDER, +2 Science, Culture, Gold and Faith),
MISSIONARY_ZEAL (ABILITY_RELIGIOUS_IGNORE_TERRAIN_COST), MONASTIC_ISOLATION
(EFFECT_ADJUST_RELIGIOUS_COMBAT_LOSS, ReductionPercent 100), HOLY_WATERS
(+10 religious healing at a following city's Holy Site); the Dar-e Mehr's
Building_YieldsPerEra (+1 Faith per game era since constructed or last
repaired). The TS twin is tests/cpu/religion/belief-effects.test.ts.

Proven here:
  1 the pools: nine Founders and nine Enhancers, RELIGIOUS_COLONIZATION inert;
  2 Lay Ministry and Sacred Places pay the capital per district / wonder city;
  3 Missionary Zeal zeroes a religious unit's terrain and river terms;
  4 Monastic Isolation keeps the pressure a condemned unit's religion sheds;
  5 Holy Waters heals any religious unit by a following city's Holy Site;
  6 the Dar-e Mehr stamps its era at the faith buy, pays per era since, and
    carries the stamp through a conquest; the digest names it.
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
from warmup import opened

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


def cap_slot(sim, row: int) -> int:
    cap = sim.city_is_cap[B0, row]
    return int(cap.long().argmax()) if bool(cap.any()) else int(sim.city_alive[B0, row].long().argmax())


def totals(sim, row: int) -> torch.Tensor:
    """[cols, 6] the row's city yields, and the amenity factor they carry"""
    _tier, _g, yf, _lux = sim._seat_amenity(row)
    maint, _h = sim._seat_housing(row)
    return sim._seat_city_walk(row, amen_yf=yf, maint=maint)[B0].double(), yf[B0].double()


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
    sim = opened(rules, path)
    assert sim._bel_class_n[2] == 9 and sim._bel_class_n[3] == 9, f"pools {sim._bel_class_n}"
    colon = [i for i, r in enumerate(ENH) if not any((r["zeal"], r["theoKeep"], r["hwHeal"], r["presR"],
                                                      r["cnear"], r["cdef"], r["mcostMult"] != 1,
                                                      r["mlump"] != int(RJ["beliefs"]["spreadPressure"])))]
    assert len(colon) == 1, f"one inert Enhancer (RELIGIOUS_COLONIZATION), got {colon}"
    print(f"  1 pools OK — 9 Founders, 9 Enhancers, Enhancer {colon[0]} inert")


def test_founders(rules, path) -> None:
    sim = opened(rules, path, 4)
    j = cap_slot(sim, ROW)
    district(sim, ROW, j, sim._hs_idx)
    ts_idx = int(next(d for d in sim.districts_cat if d["id"] == "THEATER_SQUARE")["idx"])
    district(sim, ROW, j, ts_idx)
    t0, yf = totals(sim, ROW)
    religion(sim, ROW, founder=LAY)
    t1, _ = totals(sim, ROW)
    d = t1[j] - t0[j]
    assert abs(float(d[5]) - float(yf[j])) < 1e-9, f"Lay Ministry faith {d.tolist()}"
    assert abs(float(d[4]) - float(yf[j])) < 1e-9, f"Lay Ministry culture {d.tolist()}"
    # an unfinished Theater Square pays nothing
    sim.district_complete[B0, int(sim.city_dist_tile[B0, ROW, j, ts_idx])] = False
    sim._eff_version += 1
    t2, _ = totals(sim, ROW)
    assert float(t2[j, 4]) < float(t1[j, 4]), "an unfinished Theater Square paid"
    # SACRED PLACES: +2 of four yields per city holding a completed wonder
    sim2 = opened(rules, path, 4)
    j2 = cap_slot(sim2, ROW)
    w = 0
    t = own_tile(sim2, ROW, j2)
    sim2.built_wonder[B0, t] = w
    sim2.built_wonder_complete[B0, t] = True
    sim2.city_wonder[B0, ROW, j2, w] = t
    sim2._eff_version += 1
    s0, yf2 = totals(sim2, ROW)
    religion(sim2, ROW, founder=SACRED)
    s1, _ = totals(sim2, ROW)
    d2 = s1[j2] - s0[j2]
    for k in (2, 3, 4, 5):
        assert abs(float(d2[k]) - 2 * float(yf2[j2])) < 1e-9, f"Sacred Places {d2.tolist()}"
    print(f"  2 Lay Ministry {d[4:].tolist()} and Sacred Places {d2[2:].tolist()} OK")


def test_zeal(rules, path) -> None:
    sim = opened(rules, path)
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
        sim = opened(rules, path, 4)
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
    sim = opened(rules, path, 4)
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
    sim = opened(rules, path, 4)
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
    sim.turn = sim._era_len + 3
    sim.civ_faith[B0, ROW] = 10_000.0
    sim._stash_buy(ROW, worship=torch.full((1,), j, dtype=torch.long))
    sim._seat_buy_ladder(ROW, ONES, sim._seat_army_count(ROW))
    assert bool(sim.city_bldg[B0, ROW, j, dem]), "the Dar-e Mehr was not bought"
    assert int(sim.city_bldg_era[B0, ROW, j, 0]) == 1, "the stamp is not the game era"
    f0 = float(totals(sim, ROW)[0][j, 5])
    sim.turn = 3 * sim._era_len
    t1, yf = totals(sim, ROW)
    assert abs(float(t1[j, 5]) - f0 - 2 * float(yf[j])) < 1e-9, f"two eras: {float(t1[j, 5]) - f0}"
    # the digest names the stamp
    got = statecompare.CITY["buildingEras"](sim, B0, [(ROW, j)])[0]
    assert got == [dem, 1], f"digest {got}"
    # a conquest carries it
    ctr = int(sim.city_center[B0, ROW, j])
    assert sim._transfer_city(B0, ROW, j, 1, conquest=True), "the conquest failed"
    k = int((sim.city_center[B0, 1] == ctr).long().argmax())
    assert bool(sim.city_alive[B0, 1, k]) and int(sim.city_bldg_era[B0, 1, k, 0]) == 1, "the stamp did not ride"
    print("  6 Dar-e Mehr OK — stamped at era 1, +2 Faith at era 3, carried through a conquest, in the digest")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_pools(rules, path)
    test_founders(rules, path)
    test_zeal(rules, path)
    test_monastic(rules, path)
    test_holy_waters(rules, path)
    test_dar_e_mehr(rules, path)
    print("BATTERY OK belief_effects")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
