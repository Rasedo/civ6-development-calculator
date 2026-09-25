"""THE GATHERING STORM PACK ROWS — the Meteor Shower, the fires, and the
natural wonders' eruptions, the GPU twin of tests/cpu/map/pack-events.test.ts.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/pack_events_test.py

CIV6 (`DLC/GranColombia_Maya/Data/GranColombia_Maya_Expansion2.xml`, loaded in
every Gathering Storm game; `VikingsLandmarks_Expansion2.xml`;
`Expansion2_RandomEvents.xml`).

Proven here:
  * the wire: the eight eruption rows and their weights, the pack rows'
    weights, the draw's row order (the live table's `index`);
  * THE METEOR: its envelope (`_meteor_cands`), ONE site at weight 6 and a
    second draw for the plot, and its site's grant — the Heavy Cavalry one
    past the seat's research, in its nearest city, burning no fuel;
  * THE FIRE: a plot burns, is burnt at its fire's Turn 2 (+1 Food) and
    regrows at Turn 6 (+1 Production) with its chop planes and the adjacency
    it lends restored exactly; it spreads on turns 1-2 on the same clock; it
    pillages, kills civilians and strikes land units 50-101 on turns 0-2 and
    costs one citizen on turn 0; while it lasts the plot takes no Lumber Mill,
    city, district or wonder, and lends the fire's Appeal;
  * a two-plot wonder's eruption ring holds every plot touching either, once.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import load_rules, fixture_paths, FIXTURES  # noqa: E402
from warmup import warm_base, opened  # noqa: E402

B0 = 0
_R = json.loads((FIXTURES / "rules.json").read_text(encoding="utf-8"))
UNI = [u["id"] for u in _R["units"]]
TECH = [t["id"] for t in _R["techs"]]
STEP = 0x6D2B79F5  # mulberry32's per-draw increment, on both engines


def fresh(rules, path, slot: int = 0):
    return warm_base((str(path), slot), lambda: opened(rules, path))


def draws(s0: int, s1: int) -> int:
    for n in range(64):
        if (s0 + n * STEP) & 0xFFFFFFFF == s1 & 0xFFFFFFFF:
            return n
    raise AssertionError("more than 64 draws")


def put(sim, row: int, kind: str, tile: int) -> int:
    was = set(sim.major_unit_alive[B0].nonzero().flatten().tolist())
    sim._spawn_unit(row, torch.ones(sim.B, dtype=torch.bool), torch.full((sim.B,), tile, dtype=torch.long),
                    torch.full((sim.B,), UNI.index(kind), dtype=torch.long))
    got = set(sim.major_unit_alive[B0].nonzero().flatten().tolist()) - was
    assert len(got) == 1, f"no slot for a {kind}"
    sim._gen_ver += 1
    return got.pop()


def only(sim, keep: str) -> None:
    """zero every row of the draw but `keep`'s family"""
    if keep != "flood":
        sim._flood_weight = [0.0] * len(sim._flood_weight)
    if keep != "eruption":
        sim._eruption_weight = [0.0] * len(sim._eruption_weight)
    sim._st_weight = [0.0] * len(sim._st_weight)
    sim._accident_weight = [0.0] * len(sim._accident_weight)
    sim._drought_weight = [0.0] * len(sim._drought_weight)
    if keep != "meteor":
        sim._meteor_weight = 0.0
    if keep != "fire":
        sim._fire_weight = [0.0] * len(sim._fire_weight)


def main() -> None:
    rules = load_rules()
    path = fixture_paths()[0]

    # 1 — the wire and the row order
    sim = fresh(rules, path)
    assert sim._eruption_weight == [4, 2.5, 4, 2.5, 7, 4, 2.5, 1.5]
    assert sim._er_on_volcano == [False] * 5 + [True] * 3
    assert sim._er_wonder_fid[0] == sim._er_wonder_fid[1] == sim._er_wonder_fid[4] == -1, \
        "the roster carries no Eyjafjallajokull and no Vesuvius"
    assert sim._er_wonder_fid[2] >= 0 and sim._er_wonder_fid[2] == sim._er_wonder_fid[3]
    assert sim._er_dmg_lo.tolist() == [40, 60, 0, 40, 70, 0, 40, 60]
    assert sim._er_pop_p.tolist() == [0.3, 0.4, 0, 0.2, 1, 0, 0.2, 0.35]
    assert sim._meteor_weight == 6 and sim._fire_weight == [6, 6] and sim._fire_cipd == [50, 50]
    assert (sim._fire_burnt_turn, sim._fire_regrow_turn, sim._fire_spread_p) == (2, 6, 0.5)
    assert sim._fire_spread_turns == [1, 2] and sim._fire_damage_turns == [0, 2] and sim._fire_dmg == [50, 101]
    fam = [(f, s) for f, s, _w in sim._event_rows()]
    E, F, M, X = sim._EV_ERUPTION, sim._EV_FLOOD, sim._EV_METEOR, sim._EV_FIRE
    assert fam[:5] == [(E, 0), (E, 1), (F, 0), (F, 1), (F, 2)]
    assert fam[5:11] == [(E, r) for r in range(2, 8)]
    assert fam[-3:] == [(M, 0), (X, 0), (X, 1)]
    print("  1 wire OK — eight eruption rows, the pack's three last, Eyjafjallajokull first")

    # 2 — the meteor's envelope
    sim = fresh(rules, path, slot=1)
    cand = sim._meteor_cands()[B0]
    assert bool(cand.any()), "the fixture offers the meteor nowhere"
    assert not bool((cand & (sim.tile_seat[B0] >= 0)).any()), "AvoidTerritory"
    assert not bool((cand & (sim.water[B0] | sim.tile_mountain[B0])).any())
    assert not bool((cand & ((sim.improvement[B0] >= 0) | sim.tile_goody[B0])).any())
    live_f = (sim.feat_id[B0] >= 0) & ~sim.feat_stripped[B0]
    ok_f = torch.zeros_like(live_f)
    for f in sim._meteor_fids:
        ok_f |= sim.feat_id[B0] == f
    assert not bool((cand & live_f & ~ok_f).any()), "only Woods, Rainforest or Marsh stand under a site"
    t = int(cand.nonzero()[0][0])
    sim.tile_goody[B0, t] = True
    assert not bool(sim._meteor_cands()[B0, t])
    sim.tile_goody[B0, t] = False
    sim.tile_meteor[B0, t] = True
    assert not bool(sim._meteor_cands()[B0, t])
    sim.tile_meteor[B0, t] = False
    print(f"  2 meteor envelope OK — {int(cand.sum())} plots nobody owns")

    # 3 — ONE site at weight 6: with the rest zeroed every draw strikes, and
    # spends the event draw and the plot's pick
    only(sim, "meteor")
    strip = sim._desertification_live()
    for _ in range(20):
        sim.tile_meteor.zero_()
        s0 = int(sim.rng_state[B0])
        sim._random_event(strip)
        assert int(sim.tile_meteor[B0].sum()) == 1
        hit = int(sim.tile_meteor[B0].nonzero()[0][0])
        assert bool(cand[hit])
        assert draws(s0, int(sim.rng_state[B0])) == 2
    print("  3 meteor draw OK — one site, the event draw and the plot's pick")

    # 4 — the site's grant: one past the seat's research, at its nearest city,
    # burning no fuel
    sim = fresh(rules, path, slot=2)
    line = [UNI[u] for u, _t, _c in sim._meteor_line]
    assert line == ["HEAVY_CHARIOT", "KNIGHT", "CUIRASSIER", "TANK", "MODERN_ARMOR"]
    sim.civ_techs[B0, 0] = False
    assert UNI[int(sim._meteor_grant_type(0)[B0])] == "HEAVY_CHARIOT"
    for tech in ("WHEEL", "STIRRUPS", "BALLISTICS"):
        sim.civ_techs[B0, 0, TECH.index(tech)] = True
    assert UNI[int(sim._meteor_grant_type(0)[B0])] == "TANK"
    free = [x for x in range(sim.T) if int(sim.tile_seat[B0, x]) < 0 and bool(sim.passable[B0, x])
            and not bool(sim.water[B0, x]) and int(sim.military_at[B0, x]) < 0 and int(sim.civilian_at[B0, x]) < 0]
    site = free[0]
    sim.tile_meteor[B0, site] = True
    tank = UNI.index("TANK")
    before = int((sim.major_unit_alive[B0] & (sim.major_unit_type[B0] == tank)).sum())
    one = torch.ones(sim.B, dtype=torch.bool)
    sim._claim_meteor_site(one, torch.full((sim.B,), site, dtype=torch.long), torch.zeros(sim.B, dtype=torch.long))
    assert not bool(sim.tile_meteor[B0, site]), "the site is taken"
    got = (sim.major_unit_alive[B0] & (sim.major_unit_type[B0] == tank)).nonzero().flatten().tolist()
    assert len(got) == before + 1
    g = got[-1]
    assert bool(sim.major_unit_no_res_upkeep[B0, g]), "the grant burns no fuel"
    # the nearest city, by the goody's own measure
    cols = sim.city_alive[B0, 0].nonzero().flatten()
    near = int(cols[int(sim.pair_dist[sim.city_center[B0, 0, cols], site].argmin())])
    ctr = int(sim.city_center[B0, 0, near])
    assert int(sim.pair_dist[ctr, int(sim.major_unit_tile[B0, g])]) <= 1
    oil = int(sim._type_res_slot[tank])
    sim.civ_stockpile[B0, 0, oil] = 0
    sim._seat_charge_upkeep(0)
    assert not bool(sim.civ_fuel_short[B0, 0, oil]), "a grant never runs short"
    assert int(sim._fuel_short_cs_pool("major", g)[B0]) == 0
    # a second claim finds nothing
    sim._claim_meteor_site(one, torch.full((sim.B,), site, dtype=torch.long), torch.zeros(sim.B, dtype=torch.long))
    assert int((sim.major_unit_alive[B0] & (sim.major_unit_type[B0] == tank)).sum()) == before + 1
    print(f"  4 meteor grant OK — {line[3]} at city {near}, no fuel bill")

    # 5 — THE FIRE's chain on one isolated Woods plot the row-0 city owns
    sim = fresh(rules, path, slot=3)
    woods = sim._fire_start_fid[1]
    burning, burnt = sim._fire_burning_fid[1], sim._fire_burnt_fid[1]
    slot0 = sim.city_slot_at(0)[B0]
    pick = [x for x in range(sim.T) if int(sim.feat_id[B0, x]) == woods and not bool(sim.feat_stripped[B0, x])
            and int(slot0[x]) >= 0]
    assert pick, "row 0 owns no Woods"
    w = pick[0]
    for n in sim.neigh[w].tolist():
        if n >= 0 and int(sim.feat_id[B0, n]) in sim._fire_start_fid:
            sim.feat_id[B0, n] = -1  # nothing to spread to
    sim._eff_version += 1
    planes0 = {p: getattr(sim, p).clone() for p in ("tile_ftr", "tile_ftu", "feat_removable", "d_static_adj")}
    lumber0 = sim._plane_seen("lumber_ok", 0)[B0, w].item()
    appeal0 = sim._tile_appeal()[B0].clone()
    prod0, food0 = float(sim._rcy_globals()["p_plane"][B0, w]), float(sim._eff_food()[B0, w])
    start = 40
    rows, tiles = torch.tensor([B0]), torch.tensor([w])
    sim._ignite(rows, tiles, torch.tensor([start]))
    assert int(sim.feat_id[B0, w]) == burning and int(sim.fire_start[B0, w]) == start
    # the burning plot yields its terrain alone: the Woods' +1 Production goes
    woods_prod = float(sim._feat_cat_y[woods, 1])
    assert woods_prod == 1 and float(sim._feat_cat_y[burning].abs().sum()) == 0
    assert float(sim._rcy_globals()["p_plane"][B0, w]) == prod0 - woods_prod, "the Woods' Production goes with it"
    assert float(sim._eff_food()[B0, w]) == food0
    assert int(sim.tile_ftr[B0, w]) == 0 and not bool(sim.feat_removable[B0, w]), "a burning plot is not choppable"
    assert not bool(sim._plane_seen("lumber_ok", 0)[B0, w]), "no Lumber Mill on a burning plot"
    assert bool(sim._fire_plots()[B0, w])
    ap = sim._tile_appeal()[B0]
    for n in sim.neigh[w].tolist():
        if n >= 0 and int(sim.appeal_over[B0, n]) == -999:
            assert int(ap[n]) == int(appeal0[n]) - int(sim.appeal_feat[B0, w]) + sim._fire_appeal, "the fire's Appeal"
    f0 = int(sim.fertility[B0, w])
    p0 = int(sim.fertility_prod[B0, w])
    for age in range(0, 7):
        sim.turn = start + age
        s0 = int(sim.rng_state[B0])
        sim._fire_turn()
        # one band draw per turn while it burns (turns 0, 1, 2), none after
        assert draws(s0, int(sim.rng_state[B0])) == (1 if age <= 2 else 0), age
        want = burning if age < 2 else burnt if age < 6 else woods
        assert int(sim.feat_id[B0, w]) == want, (age, int(sim.feat_id[B0, w]))
    assert int(sim.fertility[B0, w]) == min(3, f0 + 1), "+1 Food when burnt"
    assert int(sim.fertility_prod[B0, w]) == min(3, p0 + 1), "+1 Production when regrown"
    assert float(sim._rcy_globals()["p_plane"][B0, w]) == prod0 + 1, "the regrown Woods pays its Production again, and its silt"
    assert float(sim._eff_food()[B0, w]) == food0 + 1, "and the burn's silt feeds"
    assert int(sim.fire_start[B0, w]) == -1
    for p, v in planes0.items():
        assert torch.equal(getattr(sim, p), v), f"{p} is not restored after the regrowth"
    assert sim._plane_seen("lumber_ok", 0)[B0, w].item() == lumber0
    print("  5 fire chain OK — burning, burnt at 2 (+1 Food), regrown at 6 (+1 Production), planes restored")

    # 6 — the burning plot's damage: a unit struck 50-101 on turns 0-2, a
    # civilian killed, the improvement pillaged, one citizen on turn 0
    sim = fresh(rules, path, slot=3)
    for n in sim.neigh[w].tolist():
        if n >= 0 and int(sim.feat_id[B0, n]) in sim._fire_start_fid:
            sim.feat_id[B0, n] = -1
    sim.improvement[B0, w] = sim.LUMBER
    sim.pillaged[B0, w] = False
    col = int(slot0[w])
    sim.city_pop[B0, 0, col] = 5
    war = put(sim, 0, "WARRIOR", w)
    assert int(sim.major_unit_tile[B0, war]) == w
    sim.major_unit_hp[B0, war] = 1000
    bld = put(sim, 0, "BUILDER", w)
    sim._ignite(rows, tiles, torch.tensor([start]))
    hp = 1000
    for age in range(0, 4):
        sim.turn = start + age
        sim._fire_turn()
        hit = hp - int(sim.major_unit_hp[B0, war])
        hp = int(sim.major_unit_hp[B0, war])
        if age <= 2:
            assert 50 <= hit <= 101, (age, hit)
        else:
            assert hit == 0
        assert int(sim.city_pop[B0, 0, col]) == 4, "one citizen, on turn 0 alone"
    assert bool(sim.pillaged[B0, w]) and int(sim.improvement[B0, w]) == sim.LUMBER
    assert not bool(sim.major_unit_alive[B0, bld]), "a civilian is killed"
    print("  6 fire damage OK — the band on turns 0-2, the civilian, the Lumber Mill, one citizen")

    # 7 — the spread: each adjacent live Woods catches at 50% on turns 1 and 2,
    # on the fire's clock; one draw per candidate neighbour
    caught = ring = 0
    for it in range(150):
        sim = fresh(rules, path, slot=4)
        sim.rng_state[B0] = 7919 * (it + 1)
        nb = [n for n in sim.neigh[w].tolist() if n >= 0 and not bool(sim.water[B0, n])
              and not bool(sim.tile_mountain[B0, n]) and int(sim.centre_slot_at[B0, n]) < 0
              and int(sim.district[B0, n]) < 0]
        for n in nb:
            sim.feat_id[B0, n] = woods
            sim.feat_stripped[B0, n] = False
        sim._eff_version += 1
        sim._ignite(rows, tiles, torch.tensor([start]))
        sim.turn = start
        s0 = int(sim.rng_state[B0])
        sim._fire_turn()
        assert draws(s0, int(sim.rng_state[B0])) == 1, "turn 0 spreads nothing"
        sim.turn = start + 1
        s0 = int(sim.rng_state[B0])
        sim._fire_turn()
        burning_now = [n for n in nb if int(sim.feat_id[B0, n]) == burning]
        # one spread draw per neighbour, then one band draw per burning plot
        assert draws(s0, int(sim.rng_state[B0])) == len(nb) + 1 + len(burning_now)
        sim.turn = start + 2
        sim._fire_turn()
        for n in nb:
            ring += 1
            if int(sim.feat_id[B0, n]) == burnt:
                caught += 1
                assert int(sim.fire_start[B0, n]) == start, "a caught plot shares the fire's clock"
            else:
                assert int(sim.feat_id[B0, n]) == woods
    assert caught / ring > 0.72, f"{caught}/{ring} caught"
    print(f"  7 fire spread OK — {caught}/{ring} neighbours caught on turns 1-2, on the fire's clock")

    # 8 — a two-plot wonder's ring: every plot touching either, each once
    sim = fresh(rules, path, slot=5)
    a = next(x for x in range(sim.T) if all(n >= 0 for n in sim.neigh[x].tolist()))
    b = int(sim.neigh[a][0])
    plots = torch.zeros(sim.B, sim.T, dtype=torch.bool)
    plots[B0, a] = plots[B0, b] = True
    ring8 = [n for n in sim._eruption_ring(torch.ones(sim.B, dtype=torch.bool), plots)[B0].tolist() if n >= 0]
    assert len(ring8) == len(set(ring8)) and a not in ring8 and b not in ring8
    want = ({n for n in sim.neigh[a].tolist() if n >= 0} | {n for n in sim.neigh[b].tolist() if n >= 0}) - {a, b}
    assert set(ring8) == want and len(ring8) == 8
    one = torch.zeros(sim.B, dtype=torch.bool)
    one[B0] = True
    single = torch.zeros(sim.B, sim.T, dtype=torch.bool)
    single[B0, a] = True
    assert sim._eruption_ring(one, single)[B0].tolist() == sim.neigh[a].tolist(), "one plot's ring is its neighbours"
    print("  8 wonder ring OK — eight plots around a two-plot wonder, a volcano's ring its neighbours")

    print("PACK EVENTS OK — the meteor, the fires, the wonders' rings")


if __name__ == "__main__":
    main()
