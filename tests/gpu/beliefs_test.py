"""A RELIGION'S BELIEFS — one of each class, the Worship beliefs' buildings.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/beliefs_test.py

CIV6 (Beliefs.xml `BeliefClasses`): Follower, Worship, Founder and Enhancer
each carry `MaxInReligion` 1. (ReligionScreen.lua; the pedia: "A newly
established Religion will consist of two beliefs: a Follower belief, and one
of three additional types"): FOUNDING takes the Follower first and then one
belief of any other class; ENHANCING adds the classes the religion still
lacks. A Worship belief names the one Holy Site building its religion builds
or buys. The TS twin is tests/cpu/religion/religion-trade.test.ts.

Proven here, on the record's BELIEF arm (`_apply_beliefs`, `adoptBeliefs`'
twin) and the buildings:
  1 founding: the order, the count, the classes and the open pool decide; the
    founding writes the holy tile, the Holy City's pressure and the era score;
  2 enhancing: a second prophet, every lacking class once, the latch, and the
    Score's Religion line at four beliefs; a dry pool leaves the other class;
  3 the Worship belief's building: on the production list (never the gold
    one), faith-bought off the queue with its progress banked;
  4 the Mosque's spread charge, the Dar-e Mehr's disaster immunity;
  5 the observation's `belief` group, the driver's picks (every one lands),
    and the record's round trip.
"""

from __future__ import annotations

import inspect
import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "policy"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import load_rules, fixture_paths, FIXTURES, neutral, records
from warmup import warm_base, opened
import drive

B0, ROW = 0, 0
FOL, WOR, FOU, ENH = 0, 1, 2, 3
ONES = torch.ones(1, dtype=torch.bool)
BIDS = [b["id"] for b in json.loads((FIXTURES / "rules.json").read_text())["buildings"]]


def build(rules, path):
    return warm_base(str(path), lambda: opened(rules, path, 4))


def cap_slot(sim, row: int) -> int:
    cap = sim.city_is_cap[B0, row]
    return int(cap.long().argmax()) if bool(cap.any()) else int(sim.city_alive[B0, row].long().argmax())


def ready(sim, row: int, prophets: int = 1) -> int:
    """canFoundReligion's gates for seat row `row`: a pantheon, a COMPLETE
    Holy Site in its capital's registry (with a Shrine and a Temple), and the
    activated prophets. Returns the capital's slot."""
    j = cap_slot(sim, row)
    owned = ((sim.tile_seat[B0] == row) & (sim.district[B0] < 0) & (sim.centre_slot_at[B0] < 0)
             & (sim.built_wonder[B0] < 0)).nonzero(as_tuple=True)[0]
    t = int(owned[0])
    sim.district[B0, t] = sim._hs_idx
    sim.district_complete[B0, t] = True
    sim.city_dist_tile[B0, row, j, sim._hs_idx] = t
    sim.city_bldg[B0, row, j, sim._shrine_bidx] = True
    sim.city_bldg[B0, row, j, sim._temple_bidx] = True
    sim.civ_pantheon_done[B0, row] = True
    sim.civ_prophets[B0, row] = prophets
    sim.seat_ext[:, row] = True
    sim.city_current[:, row] = -1
    sim.city_progress[:, row] = 0.0
    sim._eff_version += 1
    return j


def adopt(sim, row: int, picks: list) -> None:
    """the record's BELIEF arm, exactly as the step applies it"""
    t = torch.tensor(picks, dtype=torch.long).reshape(1, -1, 2) if picks else torch.full((1, 1, 2), -1)
    sim.apply_seat_actions(row, beliefs=t)
    sim._seat_record_apply(row, ONES)


def held(sim, row: int) -> list:
    return [int(ids[B0, row]) for _m, ids, _n in sim._bel_pools()]


def claimed(sim) -> int:
    return sum(int(m[B0, :n].sum()) for m, _ids, n in sim._bel_pools())


def test_founding(rules, path) -> None:
    sim = build(rules, path)
    j = ready(sim, ROW)
    era0 = int(sim.era_score[B0, ROW])
    # the order, the count and the classes are the rule
    for bad in ([[FOU, 0], [FOL, 2]], [[FOL, 2], [FOL, 1]], [[FOL, 2]], [[FOL, 2], [FOU, 0], [WOR, 3]],
                [[FOL, 99], [FOU, 0]], [[7, 0], [FOU, 0]]):
        adopt(sim, ROW, bad)
        assert not bool(sim.civ_religion_done[B0, ROW]), f"founded on {bad}"
    # a belief another religion holds is out of the pool
    sim.enh_claimed[B0, 1] = True
    adopt(sim, ROW, [[FOL, 2], [ENH, 1]])
    assert not bool(sim.civ_religion_done[B0, ROW]) and claimed(sim) == 1, "founded on a held belief"
    # no activated prophet, no founding
    sim.civ_prophets[B0, ROW] = 0
    adopt(sim, ROW, [[FOL, 2], [ENH, 0]])
    assert not bool(sim.civ_religion_done[B0, ROW]), "founded with no prophet"
    sim.civ_prophets[B0, ROW] = 1
    # an Enhancer is as good a second belief as a Founder or a Worship one
    press0 = int(sim.city_pressure[B0, ROW, j, ROW])
    adopt(sim, ROW, [[FOL, 2], [ENH, 0]])
    assert bool(sim.civ_religion_done[B0, ROW]), "the founding was refused"
    assert held(sim, ROW) == [2, -1, -1, 0], f"held {held(sim, ROW)}"
    assert not bool(sim.civ_enhanced[B0, ROW]), "the founding enhanced the religion"
    assert claimed(sim) == 3, f"claimed {claimed(sim)}"
    assert int(sim.holy_tile[B0, ROW]) == int(sim.city_center[B0, ROW, j]), "the holy tile is the capital's centre"
    assert int(sim.city_pressure[B0, ROW, j, ROW]) - press0 == \
        int(sim._holy_founding_per_pop) * int(sim.city_pop[B0, ROW, j]), "the Holy City's founding pressure"
    assert int(sim.era_score[B0, ROW]) - era0 == int(sim._era_pts["religion"]), "the founding's era score"
    print("  1 founding OK — the Follower first, one other class, the open pool; holy tile, pressure, era score")


def test_enhancing(rules, path) -> None:
    sim = build(rules, path)
    ready(sim, ROW)
    adopt(sim, ROW, [[FOL, 2], [FOU, 0]])
    assert bool(sim.civ_religion_done[B0, ROW])
    # one prophet founded it: no enhancement yet
    adopt(sim, ROW, [[ENH, 0], [WOR, 4]])
    assert not bool(sim.civ_enhanced[B0, ROW]), "enhanced on one prophet"
    sim.civ_prophets[B0, ROW] = 2
    assert sim._enhanceable(ROW)[B0].tolist() == [False, True, False, True]
    for bad in ([[WOR, 4]], [[WOR, 4], [FOL, 1]], [[WOR, 4], [FOU, 1]], [[WOR, 4], [WOR, 5]]):
        adopt(sim, ROW, bad)
        assert not bool(sim.civ_enhanced[B0, ROW]), f"enhanced on {bad}"
    adopt(sim, ROW, [[ENH, 3], [WOR, 4]])
    assert bool(sim.civ_enhanced[B0, ROW]), "the enhancement was refused"
    assert held(sim, ROW) == [2, 4, 0, 3], f"held {held(sim, ROW)}"
    assert not bool(sim._can_enhance(ROW)[B0]), "a second enhancement is open"
    line = next(i for i, ln in enumerate(sim.rules.scoring) if ln["count"] == "religion")
    assert int(sim.score_lines(ROW)[B0, line]) == 4 * 5, "the Score's Religion line: 5 per belief, four beliefs"
    # a dry Worship pool leaves the enhancement to the Enhancer alone
    sim2 = build(rules, path)
    ready(sim2, ROW, prophets=2)
    adopt(sim2, ROW, [[FOL, 2], [FOU, 0]])
    sim2.wor_claimed[B0, :] = True
    adopt(sim2, ROW, [[ENH, 3], [WOR, 4]])
    assert not bool(sim2.civ_enhanced[B0, ROW]), "enhanced with a belief no pool holds"
    adopt(sim2, ROW, [[ENH, 3]])
    assert bool(sim2.civ_enhanced[B0, ROW]) and held(sim2, ROW) == [2, -1, 0, 3], "the dry-pool enhancement"
    print("  2 enhancing OK — a second prophet, every lacking class once, the latch; Religion line 20")


def test_worship_building(rules, path) -> None:
    sim = build(rules, path)
    j = ready(sim, ROW)
    wat_k = [BIDS[int(b)] for b in sim._worship_bidx.tolist()].index("WAT")
    wat = int(sim._worship_bidx[wat_k])
    others = [int(b) for b in sim._worship_bidx.tolist() if int(b) != wat]
    assert not bool(sim._seat_buildable(ROW)[B0, j, wat]), "a worship building with no religion"
    adopt(sim, ROW, [[FOL, 2], [WOR, wat_k]])
    assert int(sim._worship_bidx_of(ROW)[B0]) == wat
    buildable = sim._seat_buildable(ROW)[B0, j]
    assert bool(buildable[wat]), "the Worship belief's building is not on the production list"
    assert not any(bool(buildable[b]) for b in others), "another worship building is on the list"
    assert not bool(sim._seat_buildable(ROW, gold=True)[B0, j, wat]), "a worship building sells for gold"
    # on the queue with progress; the faith buy takes it off and banks it
    code = torch.full((1,), wat, dtype=torch.long)
    sim._q_push(ROW, j, ONES, code, torch.full((1,), 114.0, dtype=sim.city_progress.dtype))
    q = sim.city_current[B0, ROW, j].tolist()
    k = q.index(wat)
    sim.city_progress[B0, ROW, j, k] = 30.0
    bank0 = float(sim.city_prod_bank[B0, ROW, j])
    sim.civ_faith[B0, ROW] = 10_000.0
    sim._stash_buy(ROW, worship=torch.full((1,), j, dtype=torch.long))
    sim._seat_buy_ladder(ROW, ONES, sim._seat_army_count(ROW))
    assert bool(sim.city_bldg[B0, ROW, j, wat]), "the worship faith buy did not land"
    assert wat not in sim.city_current[B0, ROW, j].tolist(), "the bought building stayed on the queue"
    assert float(sim.city_prod_bank[B0, ROW, j]) - bank0 == 30.0, "the queued progress did not bank"
    print(f"  3 worship building OK — {BIDS[wat]} on the production list alone, bought off the queue")


def test_mosque_and_dar_e_mehr(rules, path) -> None:
    sim = build(rules, path)
    j = ready(sim, ROW)
    mosque = BIDS.index("MOSQUE")
    mk = sim._worship_bidx.tolist().index(mosque)
    adopt(sim, ROW, [[FOL, 2], [WOR, mk]])
    sim.city_followed[B0, ROW, j] = ROW
    ctr = int(sim.city_center[B0, ROW, j])

    def buy_missionary() -> int:
        if int(sim.civilian_at[B0, ctr]) >= 0:
            s0 = int(sim.civilian_at[B0, ctr]) - sim.POOL_LO["major"]
            sim.major_unit_alive[B0, s0] = False
            sim.civilian_at[B0, ctr] = -1
        sim.civ_faith[B0, ROW] = 10_000.0
        live0 = (sim.major_unit_alive[B0] & (sim.major_unit_type[B0] == sim._missionary_idx)).clone()
        sim._stash_buy(ROW, relig=(torch.full((1,), 5, dtype=torch.long), torch.full((1,), j, dtype=torch.long)))
        sim._seat_buy_ladder(ROW, ONES, sim._seat_army_count(ROW))
        new = sim.major_unit_alive[B0] & (sim.major_unit_type[B0] == sim._missionary_idx) & ~live0
        assert int(new.sum()) == 1, "the Missionary was not bought"
        return int(sim.major_unit_charges[B0][new][0])

    base = buy_missionary()
    sim.city_bldg[B0, ROW, j, mosque] = True
    sim._eff_version += 1
    assert buy_missionary() == base + 1, "the Mosque's +1 spread did not reach the Missionary"

    # the Dar-e Mehr stands through a disaster that darkens the Temple
    dem = BIDS.index("DAR_E_MEHR")
    sim.city_bldg[B0, ROW, j, dem] = True
    t = int(sim.city_dist_tile[B0, ROW, j, sim._hs_idx])
    sim._pillage_tile_buildings(torch.tensor([B0]), torch.tensor([t]))
    assert bool(sim.city_bldg_pillaged[B0, ROW, j, sim._temple_bidx]), "the disaster missed the Temple"
    assert not bool(sim.city_bldg_pillaged[B0, ROW, j, dem]), "a disaster pillaged the Dar-e Mehr"
    print("  4 Mosque +1 spread, Dar-e Mehr disaster-proof OK")


def test_obs_driver_record(rules, path) -> None:
    sim = build(rules, path)
    ready(sim, ROW)
    base = sim.snapshot()
    ob = neutral.seat_obs(sim, ROW)[B0]["belief"]
    assert ob["found"] and not ob["enhance"], f"belief group {ob}"
    assert ob["held"] == [-1, -1, -1, -1] and ob["worship"] == list(range(sim._bel_class_n[WOR])), f"{ob}"
    # every founding the driver draws lands, and it reaches every second class
    seconds = set()
    for turn in range(40):
        sim.restore(base)
        nobs = neutral.seat_obs(sim, ROW)
        dec = drive._decide_beliefs(nobs, ROW, [42], turn, sim.device)
        assert dec is not None, "the driver skipped an open founding"
        # every decision slot by NAME, the others empty
        kw = {name: None for name in inspect.signature(records.extract_record).parameters}
        kw.update(sim=sim, row=ROW, b=B0, prod=(torch.full((1, 1), -1), torch.full((1, 1), -1)),
                  seq=torch.full((1, 1, 1), -1), beliefs=dec)
        rec = records.extract_record(**kw)
        assert rec["beliefs"] == dec[B0].tolist(), f"the record wrote {rec['beliefs']}"
        records.replay_seat(sim, ROW, rec)
        sim._seat_record_apply(ROW, ONES)
        assert bool(sim.civ_religion_done[B0, ROW]), f"the driver's founding {rec['beliefs']} was refused"
        seconds.add(int(dec[B0, 1, 0]))
        # ...and the enhancement it draws next lands too
        sim.civ_prophets[B0, ROW] = 2
        ob2 = neutral.seat_obs(sim, ROW)
        assert ob2[B0]["belief"]["enhance"], "the observation missed the open enhancement"
        dec2 = drive._decide_beliefs(ob2, ROW, [42], turn + 1, sim.device)
        adopt(sim, ROW, dec2[B0].tolist())
        assert bool(sim.civ_enhanced[B0, ROW]) and -1 not in held(sim, ROW), f"the driver's enhancement {dec2[B0].tolist()}"
    assert seconds == {WOR, FOU, ENH}, f"the driver's second classes {seconds}"
    print("  5 observation, driver and record OK — 40 foundings and enhancements, every second class reached")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_founding(rules, path)
    test_enhancing(rules, path)
    test_worship_building(rules, path)
    test_mosque_and_dar_e_mehr(rules, path)
    test_obs_driver_record(rules, path)
    print("BATTERY OK beliefs")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
