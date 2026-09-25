"""THE EIGHT NAMED STORMS — the GPU half.

    python tests/gpu/storms_test.py

The TS twin is tests/cpu/map/storms.test.ts.

CIV6 (`Expansion2_RandomEvents.xml`): a storm's FAMILY is the terrain it
starts on, each family has two severities, each severity its own footprint,
frequency, damage columns and unit band; a storm PERSISTS three turns. The
roster's eight rows: Divine Wind (Hojo) waives hurricane damage to Japan's
units and doubles it for enemies on Japanese ground; Mother Russia the same
over blizzards.

  1. the wire: eight rows in table order, the canonical disc, one start list
     per family off the `sf` plane (ocean = hurricane, grass = tornado)
  2. a storm tile draws ELEVEN times whatever stands there; a footprint is its
     first `hexes` disc slots (1 / 3 / 7 / 19 tiles' worth of draws)
  3. a CAT_5 hurricane hits a hull for 60-80 and a land unit for 40-60;
     CAT_4 spares land; the milder severities spare every unit
  4. PREVENTION: Japan's units take nothing from a hurricane, still 40-60
     from a blizzard; Russia the mirror
  5. DOUBLE: an enemy on Japanese ground takes +100% (80-120 on 100 HP);
     off it, or at peace, the plain band
  6. persistence: a live storm counts down 3 -> 0 through `_disaster_phase`
     and clears its event at 0
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, fixture_paths, FIXTURES
from warmup import warm_base, opened

ROW = 0   # the carrier's seat
FOE = 1   # a seat at war with it
STEP = 0x6D2B79F5
M32 = 0xFFFFFFFF
UNI = [u["id"] for u in json.loads((FIXTURES / "rules.json").read_text(encoding="utf-8"))["units"]]


def play(sim, row: int, name) -> None:
    if name is None:
        sim.row_civ[0, row] = -1
        sim.row_leader[0, row] = -1
    else:
        ci = sim._civ_ids.index(name)
        sim.row_civ[0, row] = ci
        sim.row_leader[0, row] = sim._pair_civ.index(ci)
    sim._eff_version += 1
    sim._gen_ver += 1
    sim._bldg_version += 1


# THE WARMED BASE, ONE PER FIXTURE. A scene pays a `restore` — milliseconds —
# instead of a fixture load and a settle. `_STATIC` names the planes these
# pokes write that `snapshot`/`restore` does not carry (they are not in
# `_MUTABLE`), and `_ATTRS` the plain attributes a scene REPLACES outright
# (`disasters`, the storm weights) — the helper puts both back by hand.
_STATIC = ("row_civ", "row_leader")
_ATTRS = ("disasters", "_st_weight")


def fresh(rules) -> BatchSim:
    path = fixture_paths()[0]
    sim = warm_base(str(path), lambda: opened(rules, path), _STATIC, _ATTRS)
    sim.war[0, ROW, FOE] = sim.war[0, FOE, ROW] = True
    return sim


def put(sim, row: int, tile: int, kind: str, hp: int = 100) -> int:
    """seat a unit of `kind` on `tile` and return its merged slot."""
    slot = int(sim.unit_next[0])
    sim.unit_next[0] += 1
    lo = sim.POOL_LO["major"]
    ty = UNI.index(kind)
    sim.major_unit_alive[0, slot] = True
    sim.major_unit_seat[0, slot] = row
    sim.major_unit_type[0, slot] = ty
    sim.major_unit_tile[0, slot] = tile
    sim.major_unit_hp[0, slot] = hp
    sim.major_unit_mp[0, slot] = 2
    sim.major_unit_mp_full[0, slot] = 2
    sim.major_unit_attacks[0, slot] = 1
    plane = sim.civilian_at if bool(sim._type_civilian[ty]) else sim.military_at
    plane[0, tile] = slot + lo
    sim._gen_ver += 1
    return slot + lo


def drop(sim, slot_merged: int) -> None:
    lo = sim.POOL_LO["major"]
    s = slot_merged - lo
    if bool(sim.major_unit_alive[0, s]):
        sim.major_unit_alive[0, s] = False
        sim._vacate("major", torch.tensor([0]), torch.tensor([s]))


def free_tile(sim, want_water: bool) -> int:
    for t in range(sim.T):
        if bool(sim.water[0, t]) != want_water:
            continue
        if want_water and not bool(sim.ocean_tile[0, t]):
            continue
        if not want_water and (not bool(sim.passable[0, t]) or bool(sim.wpass[0, t])):
            continue
        if int(sim.military_at[0, t]) >= 0 or int(sim.civilian_at[0, t]) >= 0 or int(sim.embarked_at[0, t]) >= 0:
            continue
        if int(sim.tile_seat[0, t]) >= 0 or int(sim.tile_lowland[0, t]) > 0:
            continue
        return t
    raise AssertionError("no free tile of that kind")


def draws(s0: int, s1: int, cap: int = 200) -> int:
    for k in range(cap + 1):
        if (s0 + k * STEP) & M32 == s1 & M32:
            return k
    raise AssertionError(f"the stream moved by more than {cap} draws")


def band(sim, tile: int, ev: int, kind: str, seat: int, n: int = 300) -> set[int]:
    """run `_storm_tile` n times with a fresh unit each time; the damages seen (100 = died)."""
    hit = torch.tensor([True])
    evt = torch.tensor([ev])
    strip = torch.tensor([False])
    seen: set[int] = set()
    # ONE slot, re-armed each round — the pool is finite
    slot = put(sim, seat, tile, kind)
    s = slot - sim.POOL_LO["major"]
    plane = sim.civilian_at if bool(sim._type_civilian[UNI.index(kind)]) else sim.military_at
    for _ in range(n):
        sim.major_unit_alive[0, s] = True
        sim.major_unit_hp[0, s] = 100
        plane[0, tile] = slot
        sim._storm_tile(hit, torch.tensor([tile]), evt, strip)
        seen.add(100 - int(sim.major_unit_hp[0, s]) if bool(sim.major_unit_alive[0, s]) else 100)
    drop(sim, slot)
    plane[0, tile] = -1
    return seen


def main() -> int:
    rules = load_rules()
    sim = fresh(rules)
    ids = sim._st_ids
    assert ids == ["BLIZZARD_SIGNIFICANT", "BLIZZARD_CRIPPLING", "DUST_STORM_GRADIENT", "DUST_STORM_HABOOB",
                   "TORNADO_FAMILY", "TORNADO_OUTBREAK", "HURRICANE_CAT_4", "HURRICANE_CAT_5"], ids
    assert sim._st_hexes.tolist() == [7, 19, 3, 7, 1, 3, 7, 19]
    assert sim._st_weight == [8, 2, 8, 2, 15, 3, 15, 3]
    # ChanceIncreasePerDegree: 0 on each family's milder row, 50 on its worse
    assert sim._st_cipd == [0, 50, 0, 50, 0, 50, 0, 50]
    offs = sim._storm_offs.tolist()
    assert len(offs) == 19 and offs[0] == [0, 0]
    ring = [max(abs(q), abs(r), abs(q + r)) for q, r in offs]
    assert ring == [0] + [1] * 6 + [2] * 12, ring
    assert len(sim._storm_lists) == 4
    fam = sim.storm_fam[0]
    assert bool(((fam == 3) == sim.ocean_tile[0]).all()), "a hurricane starts on the OCEAN terrain alone"
    assert not bool((fam[sim.water[0] & ~sim.ocean_tile[0]] >= 0).any()), "shallow water hosts no storm"
    assert bool((fam[~sim.water[0]] >= 0).any()), "land hosts the other three"
    assert len(sim._storm_unit_rows) == 8
    print("  1 the wire OK — eight rows, the canonical disc, one start list per family")

    CAT4, CAT5 = ids.index("HURRICANE_CAT_4"), ids.index("HURRICANE_CAT_5")
    BLZ1, BLZ2 = ids.index("BLIZZARD_SIGNIFICANT"), ids.index("BLIZZARD_CRIPPLING")
    TOR1, TOR2 = ids.index("TORNADO_FAMILY"), ids.index("TORNADO_OUTBREAK")

    land = free_tile(sim, False)
    hit = torch.tensor([True])
    s0 = int(sim.rng_state[0])
    sim._storm_tile(hit, torch.tensor([land]), torch.tensor([TOR1]), torch.tensor([False]))
    # improvement, destroy, district, BUILDING, population, civilian, land,
    # naval, one HP band, and the two fertility yields
    assert draws(s0, int(sim.rng_state[0])) == 11, "a storm tile draws ELEVEN times"
    put(sim, FOE, land, "WARRIOR")
    s0 = int(sim.rng_state[0])
    sim._storm_tile(hit, torch.tensor([land]), torch.tensor([TOR1]), torch.tensor([False]))
    assert draws(s0, int(sim.rng_state[0])) == 11, "...whatever stands there"
    drop(sim, int(sim.military_at[0, land]))
    # a footprint is the first `hexes` slots of the disc: 1 / 3 / 7 / 19 tiles' draws
    centre = None
    from core.simbase import tiles_from_offsets
    for t in range(sim.T):
        if bool((tiles_from_offsets(torch.tensor([t]), sim._storm_offs, sim.W, sim.H) >= 0).all()):
            centre = t
            break
    assert centre is not None
    for ev, n in ((TOR1, 1), (TOR2, 3), (CAT4, 7), (CAT5, 19)):
        sim.storm_event[0, centre] = ev
        s0 = int(sim.rng_state[0])
        sim._storm_turn(hit, torch.tensor([centre]), torch.tensor([False]))
        assert draws(s0, int(sim.rng_state[0]), 260) == 11 * n, f"{ids[ev]} footprint"
    sim.storm_event[0, centre] = -1
    print("  2 the draws OK — ten per tile, a footprint of 1 / 3 / 7 / 19 tiles")

    sea = free_tile(sim, True)
    naval = band(sim, sea, CAT5, "GALLEY", FOE)
    assert naval and all(60 <= d <= 80 for d in naval), f"CAT_5 naval band {sorted(naval)}"
    foot = band(sim, land, CAT5, "WARRIOR", FOE)
    assert len(foot) > 3 and all(40 <= d <= 60 for d in foot), f"CAT_5 land band {sorted(foot)}"
    assert band(sim, land, CAT4, "WARRIOR", FOE) == {0}, "CAT_4 has no land row"
    for ev in (BLZ1, TOR1, ids.index("DUST_STORM_GRADIENT")):
        assert band(sim, land, ev, "WARRIOR", FOE, 150) == {0}, f"{ids[ev]} damages nobody"
    assert all(40 <= d <= 60 for d in band(sim, land, BLZ2, "WARRIOR", FOE)), "the common band"
    print("  3 the bands OK — CAT_5 60-80 at sea and 40-60 ashore, CAT_4 spares land, the mild rows spare all")

    play(sim, ROW, "JAPAN")
    assert band(sim, land, CAT5, "WARRIOR", ROW) == {0}, "Divine Wind: no hurricane damage"
    assert band(sim, land, CAT4, "WARRIOR", ROW) == {0}
    assert all(40 <= d <= 60 for d in band(sim, land, BLZ2, "WARRIOR", ROW)), "a blizzard is not Hojo's row"
    play(sim, ROW, "RUSSIA")
    assert band(sim, land, BLZ2, "WARRIOR", ROW) == {0}, "Mother Russia: no blizzard damage"
    assert band(sim, land, BLZ2, "SETTLER", ROW) == {0}, "...nor a civilian killed"
    assert all(40 <= d <= 60 for d in band(sim, land, CAT5, "WARRIOR", ROW)), "a hurricane is not Russia's row"
    print("  4 PREVENTION OK — the carrier's units take nothing from its event, and only from it")

    play(sim, ROW, "JAPAN")
    sim.tile_seat[0, land] = ROW
    sim._eff_version += 1
    doubled = band(sim, land, CAT5, "WARRIOR", FOE)
    assert doubled and all(d >= 80 for d in doubled) and 100 in doubled, f"doubled band {sorted(doubled)}"
    sim.war[0, ROW, FOE] = sim.war[0, FOE, ROW] = False
    assert all(40 <= d <= 60 for d in band(sim, land, CAT5, "WARRIOR", FOE)), "at peace: the plain band"
    sim.war[0, ROW, FOE] = sim.war[0, FOE, ROW] = True
    play(sim, ROW, None)
    assert all(40 <= d <= 60 for d in band(sim, land, CAT5, "WARRIOR", FOE)), "a non-carrier's ground doubles nothing"
    sim.tile_seat[0, land] = -1
    print("  5 DOUBLE OK — +100% for an enemy on the carrier's ground, the plain band off it or at peace")

    sim2 = fresh(rules)
    sim2.disasters = True
    c = free_tile(sim2, False)
    sim2.storm_event[0, c] = TOR1
    sim2.storm_left[0, c] = 3
    sim2._st_weight = [0.0] * len(sim2._st_weight)  # no second storm forms in this scene
    # the record MOVES with the walk on its second and third turns: follow it
    lefts, count = [], []
    for _ in range(3):
        sim2._disaster_phase()
        live = (sim2.storm_left[0] > 0).nonzero().flatten().tolist()
        count.append(len(live))
        lefts.append(int(sim2.storm_left[0, live[0]]) if live else 0)
    assert lefts == [2, 1, 0] and count == [1, 1, 0], (lefts, count)
    assert int((sim2.storm_event[0] >= 0).sum()) == 0, "an expired storm clears its event"
    print("  6 persistence OK — a live storm counts down 3 -> 0, travels, and clears at 0")
    # a natural wonder keeps its row: silt that lands on one pays nothing,
    # food or production (tileYields early-returns above the fertility lines)
    sim3 = fresh(rules)
    nw = sim3.nwonder[0].nonzero().flatten()
    if nw.numel():
        w = int(nw[0])
        sim3.fertility[0, w] = 2
        sim3.fertility_prod[0, w] = 1
        sim3._eff_version += 1
        assert float(sim3._neutral_prod()[0, w]) == float(sim3.tile_yields[0, w, 1]), 'silt paid production on a natural wonder'
        assert float(sim3._eff_food()[0, w]) == float(sim3.tile_yields[0, w, 0]), 'silt paid food on a natural wonder'
        print('  7 natural wonder OK — silt on it pays neither food nor production')
    else:
        print('  7 natural wonder — the fixture holds none; no scene')
    # -- 8: the prevailing winds ride the wire, banded by signed latitude ----
    assert sim._wind_w.shape == (8, 6) and int((sim._wind_w > 0).sum()) == 22, "PrevailingWinds: 22 rows over 8 bands"
    assert sim._wind_w[1].tolist() == [2, 2, 0, 0, 0, 1] and sim._wind_w[6].tolist() == [2, 1, 0, 0, 0, 2]
    H, W = sim.H, sim.W
    def _band(r):
        s, x = H - 1, (H - 1) - 2 * r
        for b, ok in ((0, 3 * x >= 2 * s), (1, 3 * x >= s), (2, 18 * x >= s), (3, x >= 0),
                      (4, 18 * x >= -s), (5, 3 * x >= -s), (6, 3 * x >= -2 * s)):
            if ok:
                return b
        return 7
    got = [int(sim._wind_band[r * W]) for r in range(H)]
    assert got == [_band(r) for r in range(H)], f"the band per row is not windBand's: {got}"
    assert got[0] == 0 and got[H - 1] == 7
    print("  8 winds OK — 22 weighted rows over 8 latitude bands, north to south")
    # -- 9: the walk — eight band-drawn steps, one draw each, dropped where the
    # family cannot go ------------------------------------------------------
    sim9 = fresh(rules)
    assert sim9._st_movement == 8
    CAT4_ = ids.index("HURRICANE_CAT_4")
    sea = free_tile(sim9, True)
    sim9.storm_event[0, sea] = CAT4_
    sim9.storm_left[0, sea] = 2
    s0 = int(sim9.rng_state[0])
    end = int(sim9._storm_walk(torch.tensor([True]), torch.tensor([sea]), torch.tensor([CAT4_]))[0])
    assert draws(s0, int(sim9.rng_state[0])) == 8, "the walk draws once per step, taken or dropped"
    assert int(sim9.storm_event[0, end]) == CAT4_ and int(sim9.storm_left[0, end]) == 2, "the record did not travel with the centre"
    assert end == sea or int(sim9.storm_event[0, sea]) == -1, "the record was duplicated"
    assert bool(sim9.ocean_tile[0, end]), "a hurricane left the ocean"
    assert int(sim9.pair_dist[sea, end]) <= 8
    assert int((sim9.storm_left[0] > 0).sum()) == 1
    # every neighbour holding a live storm: eight draws, no step
    sim9.storm_event[0, end] = -1
    sim9.storm_left[0, end] = 0
    sim9.storm_event[0, sea] = CAT4_
    sim9.storm_left[0, sea] = 2
    for n in sim9.neigh[sea].tolist():
        if n >= 0:
            sim9.storm_event[0, n] = CAT4_
            sim9.storm_left[0, n] = 1
    s0 = int(sim9.rng_state[0])
    end2 = int(sim9._storm_walk(torch.tensor([True]), torch.tensor([sea]), torch.tensor([CAT4_]))[0])
    assert end2 == sea and draws(s0, int(sim9.rng_state[0])) == 8, "a blocked walk still draws its eight"
    # a game with `walk` off draws nothing and keeps its centre
    s0 = int(sim9.rng_state[0])
    end3 = int(sim9._storm_walk(torch.tensor([False]), torch.tensor([sea]), torch.tensor([CAT4_]))[0])
    assert end3 == sea and int(sim9.rng_state[0]) == s0
    print("  9 walk OK — eight draws per walk, the record travels, the ocean and other storms bound it")
    # -- 10: THE TURN'S ONE RANDOM EVENT — MEASURED (lab 4): at most one event
    # a turn, drawn over the eligible (row, site) pairs with each row's
    # OccurrencesPerGame as the pair's weight. A flood weighs once per river,
    # an eruption once per volcano (Kilimanjaro once per its plot), a storm
    # or a drought once when its terrain exists. Each family's firing is
    # counted here with its effect taken out, so the shares read the draw
    # alone.
    sim10 = fresh(rules)
    fired = {"flood": 0, "volcano": 0, "storm": 0, "drought": 0, "accident": 0}
    turn = {}
    sim10._flood_river = lambda hit, tile, sev: turn.__setitem__("flood", bool(hit[0]))
    sim10._erupt = lambda hit, volc, sev: turn.__setitem__("volcano", bool(hit[0]))
    sim10._nuclear_accident = lambda hit, centre, sev: turn.__setitem__("accident", bool(hit[0]))
    strip = sim10._desertification_live()
    N = 4000
    for _ in range(N):
        turn.clear()
        sim10.storm_left.zero_()
        sim10.storm_event.fill_(-1)
        sim10.drought.zero_()
        s0 = int(sim10.rng_state[0])
        sim10._random_event(strip)
        turn["storm"] = bool((sim10.storm_left[0] > 0).any())
        turn["drought"] = bool((sim10.drought[0] > 0).any())
        n_fired = sum(1 for v in turn.values() if v)
        assert n_fired == 1, f"the turn fired {n_fired} events: {turn}"
        # the event draw, then the storm's or the drought's centre pick, and
        # one draw per land plot of the drought's footprint
        spent = draws(s0, int(sim10.rng_state[0]))
        dry = int((sim10.drought[0] > 0).sum())
        assert spent == (2 if turn["storm"] else 2 + dry if turn["drought"] else 1), (spent, turn)
        for k, v in turn.items():
            fired[k] += int(v)
    del sim10._flood_river, sim10._erupt, sim10._nuclear_accident
    fams = {int(f) for f in range(len(sim10._storm_lists)) if int(sim10._storm_lists[f][1][0]) > 0}
    w = {
        "flood": 4.5 * int(sim10._flood_sites[1][0]),
        "volcano": 8.0 * int(sim10._volc_n[0]) + 6.5 * int(((sim10.feat_id[0] == sim10._kilimanjaro_fid)
                                                          & ~sim10.feat_stripped[0]).sum()),
        "storm": sum(sim10._st_weight[e] for e in range(8) if sim10._st_family[e] in fams),
        "drought": 28.0 if bool(sim10._drought_cands()[0].any()) else 0.0,
        "accident": 0.0,
    }
    total = sum(w.values())
    for k in fired:
        assert abs(fired[k] / N - w[k] / total) < 0.03, f"{k}: {fired[k]}/{N} against {w[k]}/{total}"
    print(f"  10 one event a turn OK — {fired} over {N} turns against weights {w}")

    # 11 — RANDOM_EVENT_START_TURN: on turn 1 the phase fires nothing and
    # spends no draw; on the start turn it draws
    s11 = fresh(rules)
    s11.disasters = True
    assert s11._random_event_start_turn == 2
    s11.turn = 1
    s11.storm_left.zero_()
    s11.storm_event.fill_(-1)
    r0 = int(s11.rng_state[0])
    s11._disaster_phase()
    assert int(s11.rng_state[0]) == r0, "turn 1 spent a draw"
    s11.turn = 2
    s11._disaster_phase()
    assert int(s11.rng_state[0]) != r0, "the start turn drew nothing"
    print("  11 start turn OK — nothing before turn 2")

    # 12 — THE DROUGHT (`drought`): a featureless start, its listed
    # improvements pillaged (EXTREME destroys 30), barred from building and
    # repair while it lasts, and a PreventsDrought city keeps its food
    s12 = fresh(rules)
    cand = s12._drought_cands()[0]
    assert bool((cand <= s12.drought_cand[0]).all()), "a candidate is drought ground"
    assert not bool((cand & (s12.feat_id[0] >= 0) & ~s12.feat_stripped[0]).any()), \
        "a drought starts on no feature"
    c = int(cand.nonzero()[0][0])
    from core.simbase import tiles_from_offsets  # noqa: E402
    area = [int(t) for t in tiles_from_offsets(torch.tensor([c]), s12._storm_offs[: s12._drought_hexes],
                                                  s12.W, s12.H)[0].tolist()
            if int(t) >= 0 and not bool(s12.water[0, int(t)])]
    one = torch.tensor([True])
    strip = torch.tensor([False])
    for sev, want in ((0, 0.0), (1, 0.3)):
        farms = gone = 0
        for it in range(200):
            s = fresh(rules)
            s.rng_state[0] = 7919 * (it + 1) + sev
            for t in area:
                s.improvement[0, t] = s.FARM if t != area[-1] else s.MINE
                s.pillaged[0, t] = False
            r0 = int(s.rng_state[0])
            s._drought(one, torch.tensor([c]), torch.tensor([sev]), strip)
            assert draws(r0, int(s.rng_state[0])) == len(area), "one draw per land plot"
            assert int(s.improvement[0, area[-1]]) == s.MINE and not bool(s.pillaged[0, area[-1]]), \
                "a Mine is not the drought's"
            for t in area[:-1]:
                assert int(s.drought[0, t]) == int(s._drought_duration[sev])
                farms += 1
                if int(s.improvement[0, t]) < 0:
                    gone += 1
                else:
                    assert bool(s.pillaged[0, t]), "SPECIFIC_IMPROVEMENT_PILLAGED 100"
        assert abs(gone / farms - want) < 0.05, f"severity {sev}: destroyed {gone}/{farms}"
    # the bar: a pillaged Farm under a live drought is neither rebuilt nor repaired
    s = fresh(rules)
    t = area[0]
    s.improvement[0, t] = s.FARM
    s.pillaged[0, t] = True
    assert not bool(s._drought_barred()[0, t])
    s.drought[0, t] = 3
    assert bool(s._drought_barred()[0, t]), "a drought bars its own improvement"
    s.improvement[0, t] = s.MINE
    assert not bool(s._drought_barred()[0, t]), "...and no other"
    # the shield: a plot's city with a complete Aqueduct keeps its food
    s = fresh(rules)
    owned = (s.tile_seat[0] == 0) & (s.centre_slot_at[0] < 0) & ~s.water[0] & (s.district[0] < 0)
    t = int(owned.nonzero()[0][0])
    s.improvement[0, t] = -1
    s._eff_version += 1
    wet = float(s._eff_food()[0, t])
    s.drought[0, t] = 3
    s._eff_version += 1
    assert float(s._eff_food()[0, t]) == max(0.0, wet - 1), "a drought starves the plot"
    same = (s.tile_seat[0] == 0) & (s.tile_city[0] == s.tile_city[0, t]) & (s.centre_slot_at[0] < 0)
    same[t] = False
    aq = int(same.nonzero()[0][0])
    aq_d = s._drought_shield_dists[0]
    s.district[0, aq] = aq_d
    s.district_complete[0, aq] = True
    s._eff_version += 1
    assert float(s._eff_food()[0, t]) == wet, "the Aqueduct's city keeps its food"
    s.district_pillaged[0, aq] = True
    s._eff_version += 1
    assert float(s._eff_food()[0, t]) == max(0.0, wet - 1), "a pillaged Aqueduct shields nothing"
    s.district[0, aq] = -1
    s.district_complete[0, aq] = False
    s.district_pillaged[0, aq] = False
    s.improvement[0, aq] = s._drought_shield_imps[0]
    s._eff_version += 1
    assert float(s._eff_food()[0, t]) == wet, "a Stepwell's city keeps its food"
    print(f"  12 drought OK — featureless start, pillage and destroy, the bar, the shield")
    print("BATTERY OK storms")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
