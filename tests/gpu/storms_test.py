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
  2. a storm tile draws TEN times whatever stands there, then once per unit
     its share strikes; a footprint is its first `hexes` disc slots (1 / 3 /
     7 / 19 tiles' worth of draws)
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
import math
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, fixture_paths, FIXTURES
from warmup import warm_base, opened


def _lcg_n(s: int, k: int) -> int:
    """the generator's state k steps on from s (the LCG, `_lcg_step`)"""
    s &= 0xFFFFFFFF
    for _ in range(k):
        s = (s * 1103515245 + 12345) & 0xFFFFFFFF
    return s


ROW = 0   # the carrier's seat
FOE = 1   # a seat at war with it
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
        if _lcg_n(s0, k) == s1 & M32:
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
    # naval, and the two fertility yields
    assert draws(s0, int(sim.rng_state[0])) == 10, "a storm tile draws TEN times"
    put(sim, FOE, land, "WARRIOR")
    s0 = int(sim.rng_state[0])
    # ...whatever stands there, then the struck unit's own damage draw
    # (GameCore_XP2_Release.dll 0x3366a0) when the land share hit
    for _ in range(6):
        sim._next_random(hit)
    land_hit = float(sim._next_random(hit)[0]) < float(sim._st_land_p[TOR1])
    sim.rng_state[0] = s0
    sim._storm_tile(hit, torch.tensor([land]), torch.tensor([TOR1]), torch.tensor([False]))
    assert draws(s0, int(sim.rng_state[0])) == 10 + int(land_hit), "...whatever stands there"
    if bool(sim.military_at[0, land] >= 0):
        drop(sim, int(sim.military_at[0, land]))
    # a footprint is the first `hexes` slots of the disc: 1 / 3 / 7 / 19 tiles' draws
    centre = None
    from core.simbase import tiles_from_offsets
    for t in range(sim.T):
        fp = tiles_from_offsets(torch.tensor([t]), sim._storm_offs, sim.W, sim.H, sim.wrap_x)
        if bool((fp >= 0).all()) and bool((sim.military_at[0, fp.flatten()] < 0).all()) \
                and bool((sim.support_at[0, fp.flatten()] < 0).all()) \
                and bool((sim.embarked_at[0, fp.flatten()] < 0).all()):
            centre = t
            break
    assert centre is not None
    for k, (ev, n) in enumerate(((TOR1, 1), (TOR2, 3), (CAT4, 7), (CAT5, 19))):
        sim.storm_event[0, 0] = ev
        sim.storm_at[0, 0] = centre
        sim.storm_id[0, 0] = 100 + k
        sim.storm_struck[0, 0] = False   # a fresh storm: nothing struck yet
        s0 = int(sim.rng_state[0])
        sim._storm_turn(hit, 0, torch.tensor([False]), torch.tensor([100]))
        assert draws(s0, int(sim.rng_state[0]), 260) == 10 * n, f"{ids[ev]} footprint"
        assert int(sim.storm_struck[0, 0].sum()) == n
        # the same storm strikes no plot twice
        s0 = int(sim.rng_state[0])
        sim._storm_turn(hit, 0, torch.tensor([False]), torch.tensor([100]))
        assert int(sim.rng_state[0]) == s0, f"{ids[ev]} struck a plot twice"
    sim.storm_event[0, 0] = -1
    sim.storm_at[0, 0] = -1
    sim.storm_id[0, 0] = -1
    sim.storm_struck[0, 0] = False
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
    sim2.storm_event[0, 0] = TOR1
    sim2.storm_at[0, 0] = c
    sim2.storm_left[0, 0] = 3
    sim2.storm_id[0, 0] = 1
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
    assert int((sim2.storm_at[0] >= 0).sum()) == 0 and not bool(sim2.storm_struck[0].any()), \
        "an expired storm leaves its slot empty"
    print("  6 persistence OK — a live storm counts down 3 -> 0, travels, and leaves the table at 0")
    # a natural wonder takes its row and the silt on top of it
    # (runs/h1_duelw1111 plot 184: Ubsunur Hollow's 1 Food read 2 after a
    # Significant Blizzard's fertility)
    sim3 = fresh(rules)
    nw = sim3.nwonder[0].nonzero().flatten()
    if nw.numel():
        w = int(nw[0])
        sim3.fertility[0, w] = 2
        sim3.fertility_prod[0, w] = 1
        sim3._eff_version += 1
        assert float(sim3._neutral_prod()[0, w]) == float(sim3.tile_yields[0, w, 1]) + 1, 'silt production on a natural wonder'
        assert float(sim3._eff_food()[0, w]) == float(sim3.tile_yields[0, w, 0]) + 2, 'silt food on a natural wonder'
        print('  7 natural wonder OK — silt on it pays food and production on top of its row')
    else:
        print('  7 natural wonder — the fixture holds none; no scene')
    # -- 8: the prevailing winds ride the wire, pooled at each row's latitude,
    # both ends inclusive (`windWeights`) -----------------------------------
    rj8 = json.loads((FIXTURES / "rules.json").read_text())["disasters"]
    winds = rj8["winds"]
    assert len(winds) == 8 and sum(int(v > 0) for b in winds for v in b) == 22, "PrevailingWinds: 22 rows over 8 bands"
    H, W = sim.H, sim.W

    def _pool(r):
        lat = 90 - (180 * ((100 * r) // H)) // 100
        out = [0] * 6
        for b, (lo, hi) in enumerate(zip(rj8["windBandLo"], rj8["windBandHi"])):
            if lo <= lat <= hi:
                out = [a + int(v) for a, v in zip(out, winds[b])]
        return out
    got = [sim._wind_pool[r * W].tolist() for r in range(H)]
    assert got == [_pool(r) for r in range(H)], f"the pooled weights per row are not windWeights': {got}"
    assert got[0] == [int(v) for v in winds[0]]
    print("  8 winds OK — 22 weighted rows over 8 latitude bands, pooled at each row's latitude")
    # -- 9: the walk — 8 points, 1 a step on the storm's own terrain and 2
    # elsewhere, the footprint striking at every step, each plot once -------
    sim9 = fresh(rules)
    assert (sim9._st_movement, sim9._st_step_on, sim9._st_step_off, sim9._st_last_pct) == (8, 1, 2, 50)
    CAT4_ = ids.index("HURRICANE_CAT_4")
    # an open-sea plot with all six neighbours on the map (a corner's winds
    # may name no neighbour at all, and then no step is drawn)
    sea = next(t for t in range(sim9.T) if bool(sim9.ocean_tile[0, t]) and all(n >= 0 for n in sim9.neigh[t].tolist())
               and int(sim9.military_at[0, t]) < 0 and int(sim9.embarked_at[0, t]) < 0)
    def seat_storm(k: int, at: int, left: int, sid: int) -> None:
        sim9.storm_event[0, k] = CAT4_
        sim9.storm_at[0, k] = at
        sim9.storm_left[0, k] = left
        sim9.storm_id[0, k] = sid
        sim9.storm_struck[0, k] = False

    seat_storm(0, sea, 2, 9)
    no = torch.tensor([False])
    full = torch.tensor([100])
    seed = int(sim9.rng_state[0])
    s0 = seed
    sim9._storm_walk(torch.tensor([True]), 0, no, full)
    end = int(sim9.storm_at[0, 0])
    struck = int(sim9.storm_struck[0, 0].sum())
    spent = draws(s0, int(sim9.rng_state[0]), 2000)
    # the step draws (one per step, and the one it cannot pay) and ten a
    # newly struck plot (no unit stands in these footprints' way)
    steps = spent - 10 * struck
    assert 1 <= steps <= 9, (spent, struck)
    assert end != sea, "the walk took no step"
    assert int(sim9.storm_event[0, 0]) == CAT4_ and int(sim9.storm_left[0, 0]) == 2, "the record changed on its walk"
    assert int(sim9.storm_id[0, 0]) == 9, "the serial did not stay with the record"
    assert int(sim9.pair_dist[sea, end]) <= 8
    assert int((sim9.storm_left[0] > 0).sum()) == 1
    # other storms' centres on the walker's neighbours block nothing: from the
    # same stream the walk takes the same steps and the same draws
    seat_storm(0, sea, 2, 9)
    nbrs = [n for n in sim9.neigh[sea].tolist() if n >= 0]
    for k in range(1, sim9.storm_left.shape[1]):
        seat_storm(k, nbrs[k - 1], 1, 9 + k)
    sim9.rng_state[0] = seed
    sim9._storm_walk(torch.tensor([True]), 0, no, full)
    assert int(sim9.storm_at[0, 0]) == end and draws(seed, int(sim9.rng_state[0]), 2000) == spent, \
        "another storm's centre changed the walk"
    # a game with `walk` off draws nothing and keeps its centre
    seat_storm(0, sea, 2, 9)
    s0 = int(sim9.rng_state[0])
    sim9._storm_walk(torch.tensor([False]), 0, no, full)
    assert int(sim9.storm_at[0, 0]) == sea and int(sim9.rng_state[0]) == s0
    for k in range(sim9.storm_left.shape[1]):
        sim9.storm_left[0, k] = 0
    sim9._compact_storms()
    print(f"  9 walk OK — {steps} step draws, {struck} plots struck once each, other storms block nothing")
    # -- 10: THE TURN'S ONE RANDOM EVENT: at most one event a turn; each
    # (row, site) pair weighs its integer weight (tenths of
    # OccurrencesPerGame, a once-per-map row scaled by the map's area) over
    # the draw's span 10 x N, the rest of the turn is empty. A flood counts once per river a major has revealed, an
    # eruption once per ACTIVE volcano (a wonder once while it stands); a
    # storm, a drought, the meteor and a fire count once per map whether or
    # not they find a plot, and a drawn row that finds none is an empty turn.
    # Every (row, site) pair is marked fired, so no first-occurrence boost
    # enters. Each family's firing is counted here with its effect taken
    # out, so the shares read the draw alone.
    sim10 = fresh(rules)
    sim10.volcano_active.copy_(sim10.volcano_at)
    sim10.tile_event_fired.fill_((1 << len(sim10._event_rows())) - 1)
    fired = {"flood": 0, "volcano": 0, "storm": 0, "drought": 0, "accident": 0, "meteor": 0, "fire": 0,
             "empty": 0}
    turn = {}
    sim10._flood_river = lambda hit, tile, sev: turn.__setitem__("flood", bool(hit[0]))
    sim10._erupt = lambda hit, ring, sev: turn.__setitem__("volcano", bool(hit[0]))
    sim10._nuclear_accident = lambda hit, centre, sev: turn.__setitem__("accident", bool(hit[0]))
    sim10._ignite = lambda rows, tiles, start: turn.__setitem__("fire", bool((rows == 0).any()))
    strip = sim10._desertification_live()
    N = 4000
    for _ in range(N):
        turn.clear()
        sim10.storm_left.zero_()
        sim10._compact_storms()
        sim10.drought.zero_()
        sim10.drought_left.zero_()
        sim10._compact_droughts()
        sim10.tile_meteor.zero_()
        s0 = int(sim10.rng_state[0])
        sim10._random_event(strip)
        turn["storm"] = bool((sim10.storm_left[0] > 0).any())
        turn["drought"] = bool((sim10.drought[0] > 0).any())
        turn["meteor"] = bool(sim10.tile_meteor[0].any())
        n_fired = sum(1 for v in turn.values() if v)
        assert n_fired <= 1, f"the turn fired {n_fired} events: {turn}"
        # the event draw, then the storm's, the meteor's or the fire's plot
        # pick, or the drought's weighted plot and one draw per land plot of
        # its footprint
        spent = draws(s0, int(sim10.rng_state[0]))
        dry = int((sim10.drought[0] > 0).sum())
        picks = turn.get("storm") or turn.get("meteor") or turn.get("fire")
        assert spent == (2 if picks else 2 + dry if turn["drought"] else 1), (spent, turn)
        for k, v in turn.items():
            fired[k] += int(v)
        fired["empty"] += int(n_fired == 0)
    del sim10._flood_river, sim10._erupt, sim10._nuclear_accident, sim10._ignite
    storm_lands = [bool(sim10._storm_cands(e)[0].any()) for e in range(len(sim10._st_weight))]
    span = sim10._event_occ_scale * sim10._event_turns
    assert span == 2500
    has_dry = bool(sim10._drought_cands(sim10._live_event_plots())[0].any())
    has_met = bool(sim10._meteor_cands()[0].any())
    has_fire = [bool(sim10._fire_cands(s)[0].any()) for s in range(2)]
    # each row's mass at the world's warming (`_event_rows`), what each
    # family LANDS, and the whole drawn mass
    name = {sim10._EV_FLOOD: "flood", sim10._EV_ERUPTION: "volcano", sim10._EV_STORM: "storm",
            sim10._EV_DROUGHT: "drought", sim10._EV_ACCIDENT: "accident", sim10._EV_METEOR: "meteor",
            sim10._EV_FIRE: "fire"}
    w = {k: 0.0 for k in name.values()}
    drawn = 0.0
    for fam, s, wt in sim10._event_rows():
        if fam == sim10._EV_FLOOD:
            n, lands = int(sim10._flood_open()[0].sum()), True
        elif fam == sim10._EV_ERUPTION:
            n = (int(sim10.volcano_active[0].sum()) if sim10._er_on_volcano[s]
                 else int(sim10._wonder_plots(sim10._er_wonder_fid[s])[0].any()))
            lands = True
        elif fam == sim10._EV_ACCIDENT:
            n, lands = int((sim10._reactor_plane()[0] >= sim10._accident_min_turn[s]).sum()), True
        else:
            n = 1
            lands = {sim10._EV_STORM: storm_lands[s] if fam == sim10._EV_STORM else False, sim10._EV_DROUGHT: has_dry,
                     sim10._EV_METEOR: has_met, sim10._EV_FIRE: has_fire[s] if fam == sim10._EV_FIRE else False}[fam]
        # every pair already fired: no boost, the row weight per site
        mass = float(wt[0]) * n
        drawn += mass
        if lands:
            w[name[fam]] += mass
    scale = max(float(span), drawn)
    w["empty"] = scale - sum(w.values())
    for k in fired:
        # 0.025 is about 3 sigma on the empty share's 4,000 turns
        assert abs(fired[k] / N - w[k] / scale) < 0.025, f"{k}: {fired[k]}/{N} against {w[k]}/{scale}: {fired} {w}"
    print(f"  10 one event a turn OK — {fired} over {N} turns against chances {w}")

    # 11 — RANDOM_EVENT_START_TURN: on turn 1 the phase fires nothing and
    # spends no draw; on the start turn it draws
    s11 = fresh(rules)
    s11.disasters = True
    assert s11._random_event_start_turn == 2
    s11.turn = 1
    s11.storm_left.zero_()
    s11._compact_storms()
    # every volcano dormant: turn 1 draws the map's one volcano roll (and its
    # pick where it lands) and nothing more
    s11.volcano_active.zero_()
    n_volc = int(s11.volcano_at[0].sum())
    assert n_volc > 0, "the fixture holds no volcano"
    r0 = int(s11.rng_state[0])
    woke0 = int(s11.volcano_active[0].sum())
    s11._disaster_phase()
    woke = int(s11.volcano_active[0].sum()) - woke0
    assert draws(r0, int(s11.rng_state[0])) == 1 + woke and woke in (0, 1), "turn 1: the roll, and its pick"
    # no volcano on the map: turn 1 draws nothing
    s11.volcano_at.zero_()
    s11.volcano_active.zero_()
    r0 = int(s11.rng_state[0])
    s11._disaster_phase()
    assert int(s11.rng_state[0]) == r0, "turn 1 spent a draw"
    s11.turn = 2
    s11._disaster_phase()
    assert int(s11.rng_state[0]) != r0, "the start turn drew nothing"
    print("  11 start turn OK — nothing before turn 2 but the volcano roll")

    # 12 — THE DROUGHT (`drought`): a featureless start, its listed
    # improvements pillaged (EXTREME destroys 30), barred from building and
    # repair while it lasts, and a PreventsDrought city keeps its food
    s12 = fresh(rules)
    live12 = s12._live_event_plots()
    cand = s12._drought_cands(live12)[0]
    assert bool((cand <= s12.drought_cand[0]).all()), "a candidate is drought ground"
    paved = (s12.district[0] >= 0) | s12._centre_plane()[0]
    dry = (s12.drought_cand[0] & (((s12.feat_id[0] < 0) | s12.feat_stripped[0]) | paved)
           & ~s12.tile_submerged[0] & ~s12.tile_river[0] & ~s12.coastal_land[0] & ~live12[0])
    assert not bool((cand & (s12.feat_id[0] >= 0) & ~s12.feat_stripped[0] & ~paved).any()), \
        "a drought starts on no feature"
    # the seven-plot patch: every candidate's six neighbours are dry ground
    for t in cand.nonzero().flatten().tolist():
        ring = s12.neigh[t].tolist()
        assert all(n >= 0 and bool(dry[n]) for n in ring), f"candidate {t} has a wet or missing neighbour"
    lone = dry & ~cand
    assert bool(lone.any()), "every dry plot of the fixture is a patch's centre"
    c = int(cand.nonzero()[0][0])
    from core.simbase import tiles_from_offsets  # noqa: E402
    area = [int(t) for t in tiles_from_offsets(torch.tensor([c]), s12._storm_offs[: s12._drought_hexes],
                                                  s12.W, s12.H, s12.wrap_x)[0].tolist()
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
            assert int(s.drought_left[0, 0]) == int(s._drought_duration[sev]), "the record keeps the row's turns"
            assert s.drought_plots[0, 0, : len(area)].tolist() == area, "the record keeps the footprint in disc order"
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
    # ...and a Builder finds no job on a Farm plot the drought holds
    # (`builderJobAt` reads `validImprovementsIn`, which drops the Farm)
    s = fresh(rules)
    farm_only = (s._seat_job_mask(0)[0] & s._farm_ground(0)[0] & ~s.mine_ok[0] & ~s.lumber_ok[0]
                 & (s.res_imp[0] <= 0) & ~s.pillaged[0] & ~s.district_pillaged[0])
    t = int(farm_only.nonzero()[0][0])
    s.drought[0, t] = 3
    assert not bool(s._seat_job_mask(0)[0, t]), "a drought's Farm plot is a Builder job"
    s.drought[0, t] = 0
    assert bool(s._seat_job_mask(0)[0, t]), "the rain gives the job back"
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

    # 13 — THE DROUGHT'S START (`droughtStart`, GameCore_XP2 0x287e80): ONE
    # weighted draw over every candidate plot of the map, each weighing 1 +
    # min(its distance to the nearest live drought's LAST footprint plot, the
    # spacing 15); no city anchor, and a storm's centre spaces nothing
    s13 = fresh(rules)
    assert s13._drought_spacing == 15
    s13.storm_left.zero_()
    s13._compact_storms()
    s13.drought.zero_()
    s13.drought_left.zero_()
    s13._compact_droughts()
    cand0 = s13._drought_cands(s13._live_event_plots())[0]
    assert bool(cand0.any()), "the fixture holds no drought start"
    # a live drought whose footprint ENDS on a candidate's far side: the
    # weights tilt away from its last plot
    ev = int(cand0.nonzero().flatten()[0])
    head = int(s13.neigh[ev][0])
    s13.drought[0, ev] = 5
    s13.drought[0, head] = 5
    s13.drought_left[0, 0] = 5
    s13.drought_plots[0, 0, :2] = torch.tensor([head, ev])
    # a storm far off: the plot it struck is under an event, yet it spaces nothing
    far = int(s13.pair_dist[ev].argmax())
    s13.storm_event[0, 0] = 0
    s13.storm_at[0, 0] = far
    s13.storm_left[0, 0] = 2
    s13.storm_struck[0, 0, far] = True
    live13 = s13._live_event_plots()
    assert bool(live13[0, far]), "a plot a live storm struck is under a live event"
    cand = s13._drought_cands(live13)[0]
    # a drought's own plot is no bar (0x28de40 reads the storms alone)
    assert bool(cand[ev]), "a drought's plot barred a new drought"
    wts = (1 + s13.pair_dist[ev].long().clamp(max=15)) * cand.long()
    near = cand & (s13.pair_dist[ev] <= 6)
    p_near = float(wts[near].sum()) / float(wts.sum())
    one = torch.tensor([True])
    N13 = 3000
    hits = 0
    for _ in range(N13):
        s0 = int(s13.rng_state[0])
        got, tile = s13._drought_start(one)
        assert bool(got[0]) and draws(s0, int(s13.rng_state[0])) == 1, "one weighted draw"
        t = int(tile[0])
        assert bool(cand[t]), "the start is a drought candidate"
        hits += int(bool(near[t]))
    assert abs(hits / N13 - p_near) < 0.03, (hits / N13, p_near)
    none = s13._drought_start(torch.tensor([False]))
    assert not bool(none[0][0])
    print(f"  13 drought start OK — {int(cand.sum())} candidates, {hits}/{N13} near a live event against {p_near:.3f}")

    # 14 — BUILDING_PILLAGED on a district not itself pillaged takes ONE
    # building, the dearest standing; DISTRICT_PILLAGED takes every one; a
    # city-state's district alike, its repair then waiting
    # (runs/c74s3_bldg_pillage_20260926T133346Z.jsonl)
    s = fresh(rules)
    bids = [b["id"] for b in rules.buildings]
    lib, uni = bids.index("LIBRARY"), bids.index("UNIVERSITY")
    campus = next(int(d["idx"]) for d in s.districts_cat if d["id"] == "CAMPUS")
    j = int(s.city_alive[0, 0].long().argmax())
    sl = s.city_slot_at(0)[0]
    t = next(x for x in range(s.T) if int(sl[x]) == j and int(s.district[0, x]) < 0
             and int(s.centre_slot_at[0, x]) < 0 and not bool(s.water[0, x]))
    s.district[0, t] = campus
    s.district_complete[0, t] = True
    s.district_pillaged[0, t] = False
    s.city_dist_tile[0, 0, j, campus] = t
    s.city_bldg[0, 0, j, lib] = True
    s.city_bldg[0, 0, j, uni] = True
    one, tt = torch.tensor([0]), torch.tensor([t])

    def fell(row: int, col: int) -> list:
        return [bids[i] for i in s.city_bldg_pillaged[0, row, col].nonzero(as_tuple=True)[0].tolist()]

    s._pillage_tile_buildings(one, tt)
    assert fell(0, j) == ["UNIVERSITY"], fell(0, j)
    s._pillage_tile_buildings(one, tt)
    assert sorted(fell(0, j)) == ["LIBRARY", "UNIVERSITY"], fell(0, j)
    s.city_bldg_pillaged[0, 0, j] = False
    s._pillage_district(one, tt)
    assert bool(s.district_pillaged[0, t]) and sorted(fell(0, j)) == ["LIBRARY", "UNIVERSITY"], fell(0, j)
    m = int(s.citystate_alive[0].long().argmax())
    mrow = s._CITY_MINOR0 + m
    ctr = int(s.citystate_center[0, m])
    ct = next(n for n in s.neigh[ctr].tolist() if n >= 0 and int(s.tile_seat[0, n]) == 100 + m
              and int(s.district[0, n]) < 0 and not bool(s.water[0, n]))
    s.district[0, ct] = campus
    s.district_complete[0, ct] = True
    s.city_dist_tile[0, mrow, 0, campus] = ct
    s.city_bldg[0, mrow, 0, lib] = True
    s.city_bldg[0, mrow, 0, uni] = True
    s._pillage_tile_buildings(one, torch.tensor([ct]))
    assert fell(mrow, 0) == ["UNIVERSITY"], fell(mrow, 0)
    assert bool(s.citystate_repair_wait[0, m]), "the minor's repair did not wait"
    # a Dar-e Mehr on top of the chain: nothing falls (0x24af90 / 0x33a780)
    temple, dem = bids.index("TEMPLE"), bids.index("DAR_E_MEHR")
    holy = next(int(d["idx"]) for d in s.districts_cat if d["id"] == "HOLY_SITE")
    h = next(x for x in range(s.T) if int(sl[x]) == j and int(s.district[0, x]) < 0 and x != t
             and int(s.centre_slot_at[0, x]) < 0 and not bool(s.water[0, x]))
    s.district[0, h] = holy
    s.district_complete[0, h] = True
    s.district_pillaged[0, h] = False
    s.city_dist_tile[0, 0, j, holy] = h
    s.city_bldg[0, 0, j, temple] = True
    s.city_bldg[0, 0, j, dem] = True
    s.city_bldg_pillaged[0, 0, j] = False
    s._pillage_tile_buildings(one, torch.tensor([h]))
    assert fell(0, j) == [], fell(0, j)
    s.city_bldg[0, 0, j, dem] = False
    s._pillage_tile_buildings(one, torch.tensor([h]))
    assert fell(0, j) == ["TEMPLE"], fell(0, j)
    print("  14 building pillage OK — the top of the chain alone (none under a Dar-e Mehr), all with the district, "
          "a city-state's alike")

    # the last turn's percent scales the fertility rows too, each row's
    # Percentage x pct // 100 (0x286f80)
    fe = int(sim._st_fert_food.argmax())
    pf = float(sim._st_fert_food[fe])
    assert pf > 0.2, pf
    plot = free_tile(sim, False)

    def fert_rate(pct: int, n: int = 1500) -> float:
        got = 0
        for _ in range(n):
            sim.fertility[0, plot] = 0
            sim._storm_tile(torch.tensor([True]), torch.tensor([plot]), torch.tensor([fe]),
                            torch.tensor([False]), pct)
            got += int(sim.fertility[0, plot] > 0)
        return got / n

    half = math.floor(round(pf * 100) * sim._st_last_pct / 100) / 100
    assert abs(fert_rate(100) - pf) < 0.04
    assert abs(fert_rate(sim._st_last_pct) - half) < 0.04, half
    print("  15 last turn OK — the fertility rows at the last turn's percent, truncated")
    print("BATTERY OK storms")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
