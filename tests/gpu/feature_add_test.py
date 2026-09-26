"""VOLCANIC SOIL — an eruption paints its ring, the GPU twin.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/feature_add_test.py

The TS twin is tests/cpu/map/feature-add.test.ts. CIV6 (`RandomEvent_Yields`
FEATURE_VOLCANIC_SOIL YIELD_FOOD, `ReplaceFeature="true"`): each eligible land
plot of an erupting volcano's ring becomes Volcanic Soil with the severity's
chance, replacing Woods or Rainforest.

Proven here:
  * the envelope (`_soil_paintable`) — bare land, an improved plot, Woods and
    Rainforest are candidates; water, a Mountain, a district, a city centre, a
    wonder, Floodplains, Marsh, a Geothermal Fissure and soil already there
    are not;
  * a painted Woods reads exactly as a chopped one (yields, appeal, the
    bare-ground jobs, its Lumber Mill gone), with the soil's name live
    (`featureId`), and nothing can strip or chop the soil back;
  * the eruption draws once per eligible ring plot and paints at its row's
    `_er_paint_p`, never an ineligible plot, then six damage draws per ring
    plot, and the turn's draw names the severity in proportion to the three
    rows' weights;
  * Kilimanjaro erupts on its own two rows, 4 / 2.5 once while it stands,
    over its ring, with its own paint chance;
  * the damage rows (`_erupt_tile`): GENTLE pillages and takes nothing else,
    CATASTROPHIC destroys at 75, bands a land unit 40-60 and kills a
    civilian at 20, and no row touches a hull.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import load_rules, fixture_paths, FIXTURES  # noqa: E402
from core import statecompare as sc  # noqa: E402
from warmup import warm_base, opened  # noqa: E402

B0 = 0
UNI = [u["id"] for u in json.loads((FIXTURES / "rules.json").read_text(encoding="utf-8"))["units"]]
# FEAT_IDS: WOODS 0, RAINFOREST 1, MARSH 2, FLOODPLAINS 3, ..., GEOTHERMAL_FISSURE 7, VOLCANIC_SOIL 8
WOODS, RAINFOREST, MARSH, FLOODPLAINS, GEO, SOIL = 0, 1, 2, 3, 7, 8
STEP = 0x6D2B79F5  # mulberry32's per-draw increment, on both engines


def fresh(rules, path, slot: int = 0):
    return warm_base((str(path), slot), lambda: opened(rules, path))


def bare_land(sim, skip=()) -> int:
    ok = (~sim.water[B0] & ~sim.tile_submerged[B0] & ~sim.tile_mountain[B0] & sim.passable[B0]
          & (sim.feat_id[B0] < 0) & (sim.district[B0] < 0) & (sim.centre_slot_at[B0] < 0)
          & (sim.built_wonder[B0] < 0) & (sim.improvement[B0] < 0) & (sim.res_id[B0] < 0))
    for t in ok.nonzero(as_tuple=True)[0].tolist():
        if t not in skip:
            return int(t)
    raise AssertionError("no bare land tile")


def put(sim, tile: int, kind: str) -> int:
    """seat a unit of `kind` for row 0 on `tile`; returns its major-pool slot."""
    slot = int(sim.unit_next[0])
    sim.unit_next[0] += 1
    ty = UNI.index(kind)
    sim.major_unit_alive[B0, slot] = True
    sim.major_unit_seat[B0, slot] = 0
    sim.major_unit_type[B0, slot] = ty
    sim.major_unit_tile[B0, slot] = tile
    sim.major_unit_hp[B0, slot] = 100
    plane = sim.civilian_at if bool(sim._type_civilian[ty]) else sim.military_at
    plane[B0, tile] = slot + sim.POOL_LO["major"]
    sim._gen_ver += 1
    return slot


# the volcano's GENTLE row in `ERUPTION_ROWS` (Eyjafjallajokull's two,
# Kilimanjaro's two and Vesuvius's come first)
VOLC0 = 5


def ring_of(sim, t: int) -> torch.Tensor:
    """[B, 6] — plot `t`'s ring, the `_erupt` argument for a volcano."""
    return sim.neigh[t].unsqueeze(0).expand(sim.B, -1).clone()


def paintable(sim, t: int) -> bool:
    return bool(sim._soil_paintable(torch.tensor([t]))[0])


def main() -> None:
    rules = load_rules()
    path = fixture_paths()[0]
    sim = fresh(rules, path)
    assert sim._soil_fid == SOIL and sim._soil_replaces == [WOODS, RAINFOREST, MARSH], "the catalog order moved"

    # 1 — the envelope
    t = bare_land(sim)
    assert paintable(sim, t), "bare land is a candidate"
    sim.improvement[B0, t] = 0
    assert paintable(sim, t), "an improvement does not refuse the soil"
    sim.improvement[B0, t] = -1
    for f in (WOODS, RAINFOREST, MARSH):
        sim.feat_id[B0, t] = f
        assert paintable(sim, t), f"feature {f} is replaced"
    sim.feat_stripped[B0, t] = True
    assert paintable(sim, t), "a chopped plot is bare"
    sim.feat_stripped[B0, t] = False
    for f in (FLOODPLAINS, GEO, SOIL):
        sim.feat_id[B0, t] = f
        assert not paintable(sim, t), f"feature {f} is never painted"
    sim.feat_id[B0, t] = -1
    for plane, v in ((sim.district, 0), (sim.centre_slot_at, 0), (sim.built_wonder, 0)):
        plane[B0, t] = v
        assert not paintable(sim, t), "a district, a city centre or a wonder refuses"
        plane[B0, t] = -1
    for plane in (sim.water, sim.tile_mountain, sim.tile_submerged):
        plane[B0, t] = True
        assert not paintable(sim, t), "water, a Mountain or a drowned plot refuses"
        plane[B0, t] = False
    assert not paintable(sim, -1)
    print("  1 envelope OK — bare, improved, Woods, Rainforest, Marsh in; the rest out")

    # 2 — a painted Woods reads as a chopped one, plus the soil's name
    chop = fresh(rules, path, slot=1)
    paint = fresh(rules, path, slot=2)
    w = int(((chop.feat_id[B0] == WOODS) & ~chop.feat_stripped[B0] & (chop.district[B0] < 0)
             & (chop.centre_slot_at[B0] < 0) & (chop.built_wonder[B0] < 0)
             & (chop.res_id[B0] < 0)).nonzero(as_tuple=True)[0][0])
    for s in (chop, paint):
        s.improvement[B0, w] = s.LUMBER
        s.lumber_ok[B0, w] = True
        s._eff_version += 1
    rows, tiles = torch.tensor([B0]), torch.tensor([w])
    chop._strip_feature_at(rows, tiles)
    assert paintable(paint, w)
    paint._paint_soil(rows, tiles)
    assert int(paint.feat_id[B0, w]) == SOIL and not bool(paint.feat_stripped[B0, w])
    assert int(paint.improvement[B0, w]) == -1, "the Lumber Mill goes with the Woods"
    assert int(sc.TILE["featureId"](paint, B0, None)[w]) == SOIL, "featureId reads the soil"
    gc, gp = chop._rcy_globals(), paint._rcy_globals()
    for k in ("p_plane",):
        assert abs(float(gc[k][B0, w]) - float(gp[k][B0, w])) < 1e-9, f"{k}: painted Woods pays as a chopped one"
    assert abs(float(chop._food_base()[B0, w]) - float(paint._food_base()[B0, w])) < 1e-9
    assert torch.equal(chop._tile_appeal(), paint._tile_appeal()), "appeal reads as the chopped plot"
    for p in ("farm_flat", "farm_hill", "mine_ok", "lumber_ok", "tdef", "tmove", "d_static_adj"):
        assert torch.equal(getattr(chop, p), getattr(paint, p)), f"{p}: painted Woods differs from chopped"
    assert int(paint.tile_ftr[B0, w]) == 0 and int(paint.tile_ftu[B0, w]) == -1, "the soil cannot be chopped"
    assert not bool(paint.feat_removable[B0, w]), "the soil cannot be stripped by a founding"
    adj = paint.d_static_adj.clone()
    paint._strip_feature_at(rows, tiles)  # a district paving it withdraws nothing twice
    assert torch.equal(adj, paint.d_static_adj)
    print("  2 painted Woods OK — reads as chopped, Lumber Mill gone, soil live and permanent")

    # 3 — the eruption: one draw per eligible ring plot, at its SEVERITY's
    # chance (GENTLE / CATASTROPHIC / MEGACOLOSSAL 35 / 50 / 75)
    sim3 = fresh(rules, path, slot=3)
    volc = [int(v) for v in sim3.volcano_tile[B0].tolist() if int(v) >= 0]
    assert volc, "the fixture carries no volcano"
    # the eight rows: Eyjafjallajokull CATASTROPHIC / MEGACOLOSSAL, Kilimanjaro
    # GENTLE / CATASTROPHIC, Vesuvius MEGACOLOSSAL, then the volcano's three
    assert sim3._er_paint_p.tolist() == [0.5, 0.75, 0.5, 0.5, 0.25, 0.35, 0.5, 0.75]
    assert sim3._eruption_weight == [4, 2.5, 4, 2.5, 7, 4, 2.5, 1.5]
    hit = torch.zeros(sim3.B, dtype=torch.bool)
    hit[B0] = True
    # a painted plot's +1 Production / Science / Culture chances, per row
    assert sim3._er_prod_p.tolist()[VOLC0:] == [0.15, 0.25, 0.35]
    assert sim3._er_sci_p.tolist()[VOLC0:] == [0.0, 0.1, 0.15]
    assert sim3._er_cul_p.tolist() == [0, 0, 0, 0, 0.5, 0, 0, 0]
    silted = [[0, 0, 0] for _ in range(3)]
    for sev in range(3):
        plots = painted = 0
        for it in range(400):
            sim3 = fresh(rules, path, slot=3)
            sim3.rng_state[B0] = 7919 * (it + 1) + sev
            v = volc[it % len(volc)]
            ring = [int(n) for n in sim3.neigh[v].tolist() if int(n) >= 0]
            elig = {n for n in ring if paintable(sim3, n)}
            before = sim3.feat_id[B0].clone()
            s0 = int(sim3.rng_state[B0])
            sim3._erupt(hit, ring_of(sim3, v), torch.full((sim3.B,), VOLC0 + sev, dtype=torch.long))
            assert (s0 + (4 * len(elig) + 6 * len(ring)) * STEP) & 0xFFFFFFFF == int(sim3.rng_state[B0]), \
                "an eruption draws four times per eligible ring plot, then six per ring plot"
            for n in ring:
                silt = (int(sim3.fertility_prod[B0, n]), int(sim3.fertility_sci[B0, n]),
                        int(sim3.fertility_cul[B0, n]))
                if n in elig:
                    plots += 1
                    painted += int(int(sim3.feat_id[B0, n]) == SOIL)
                    if int(sim3.feat_id[B0, n]) != SOIL:
                        assert silt == (0, 0, 0), f"unpainted plot {n} silted {silt}"
                    silted[sev] = [a + int(b > 0) for a, b in zip(silted[sev], silt)]
                else:
                    assert int(sim3.feat_id[B0, n]) == int(before[n]), f"ineligible plot {n} was painted"
            if plots >= 1200:
                break
        p = float(sim3._er_paint_p[VOLC0 + sev])
        assert plots >= 300, f"only {plots} eligible ring plots over the runs"
        rate = painted / plots
        assert abs(rate - p) < 0.05, f"severity {sev}: painted {painted}/{plots} = {rate:.3f} against {p}"
        for k, py in enumerate((sim3._er_prod_p, sim3._er_sci_p, sim3._er_cul_p)):
            want = float(py[VOLC0 + sev])
            got = silted[sev][k] / painted
            assert abs(got - want) < 0.06, f"severity {sev} silt {k}: {silted[sev][k]}/{painted} against {want}"
        print(f"  3 eruption paint OK — severity {sev}: {painted}/{plots} = {rate:.3f} against {p}, "
              f"silt {silted[sev]} of {painted}")

    # 4 — the turn's draw names the severity: over the eruptions it fires,
    # GENTLE / CATASTROPHIC / MEGACOLOSSAL come in proportion to 4 / 2.5 / 1.5
    sim4 = fresh(rules, path, slot=3)
    ew, sim4._eruption_weight = sim4._eruption_weight, [0.0] * VOLC0 + sim4._eruption_weight[VOLC0:]
    seen = [0, 0, 0]
    sim4._erupt = lambda hit, ring, row: [seen.__setitem__(int(x) - VOLC0, seen[int(x) - VOLC0] + 1)
                                          for x in row[hit].tolist()]
    sim4._flood_river = lambda hit, tile, sev: None
    strip = sim4._desertification_live()
    for _ in range(8000):
        sim4.storm_left.zero_()
        sim4._random_event(strip)
    del sim4._erupt, sim4._flood_river
    sim4._eruption_weight = ew
    n = sum(seen)
    assert n > 300, f"only {n} eruptions in 8000 draws"
    for s, w in enumerate((4, 2.5, 1.5)):
        assert abs(seen[s] / n - w / 8) < 0.05, f"severity {s}: {seen[s]}/{n} against {w}/8"
    print(f"  4 eruption severity OK — {seen} over {n} eruptions against 4 / 2.5 / 1.5")

    # 5 — KILIMANJARO: its own two rows, 4 / 2.5 once while it stands, each
    # painting the wonder's ring at its own 50 / 50; with every other row's
    # weight zeroed the draw fires Kilimanjaro alone, over its ring.
    # Eyjafjallajokull's and Vesuvius's rows name their own roster features
    sim5 = fresh(rules, path, slot=4)
    assert sim5._er_wonder_fid[0] == sim5._er_wonder_fid[1] >= 0 and sim5._er_wonder_fid[4] >= 0
    assert sim5._er_wonder_fid[5:] == [-1, -1, -1]
    kf = sim5._er_wonder_fid[2]
    assert kf >= 0 and kf == sim5._er_wonder_fid[3] and sim5._eruption_weight[2:4] == [4, 2.5]
    assert sim5._er_paint_p[2:4].tolist() == [0.5, 0.5]
    sim5.feat_id[sim5.feat_id == kf] = -1
    kt = bare_land(sim5)
    sim5.feat_id[B0, kt] = kf
    sim5._flood_weight = [0.0] * len(sim5._flood_weight)
    # scaled past the normaliser, so the capped chances sum to 1: every turn
    # fires, in the rows' 4 : 2.5
    sim5._eruption_weight = [0.0, 0.0, 400.0, 250.0, 0.0, 0.0, 0.0, 0.0]
    sim5._meteor_weight = 0.0
    sim5._fire_weight = [0.0] * len(sim5._fire_weight)
    sim5._st_weight = [0.0] * len(sim5._st_weight)
    sim5._accident_weight = [0.0] * len(sim5._accident_weight)
    sim5._drought_weight = [0.0] * len(sim5._drought_weight)
    rows_seen = [0, 0]
    tiles_seen: set[int] = set()

    def spy(hit, ring, row):
        assert bool(hit[B0]), "only Kilimanjaro can fire"
        rows_seen[int(row[B0]) - 2] += 1
        tiles_seen.update(int(n) for n in ring[B0].tolist() if int(n) >= 0)

    sim5._erupt = spy
    strip = sim5._desertification_live()
    for _ in range(3000):
        sim5._random_event(strip)
    del sim5._erupt
    want = {int(n) for n in sim5.neigh[kt].tolist() if int(n) >= 0}
    assert tiles_seen == want, f"Kilimanjaro's ring {tiles_seen}, its plot's neighbours {want}"
    n = sum(rows_seen)
    assert n == 3000, f"{n} of 3000 draws fired Kilimanjaro"
    assert abs(rows_seen[0] / n - 4 / 6.5) < 0.03, f"GENTLE {rows_seen[0]}/{n} against 4/6.5"
    print(f"  5 Kilimanjaro OK — {rows_seen} over {n} draws against 4 / 2.5, over its ring")

    # 6 — THE DAMAGE ROWS, plot by plot (`eruptTile`), on OWNED plots only:
    # every open ring plot a Farm, all but one owned; a Warrior and a Builder
    # on an owned one, a Warrior and a bonus resource on the unowned one, a
    # Galley on a water one
    probe = fresh(rules, path, slot=5)

    def open_land(v: int) -> list[int]:
        ring = [int(n) for n in probe.neigh[v].tolist() if int(n) >= 0]
        return [n for n in ring if not bool(probe.water[B0, n]) and not bool(probe.tile_mountain[B0, n])
                and bool(probe.passable[B0, n]) and int(probe.centre_slot_at[B0, n]) < 0
                and int(probe.district[B0, n]) < 0 and int(probe.built_wonder[B0, n]) < 0
                and int(probe.military_at[B0, n]) < 0 and int(probe.civilian_at[B0, n]) < 0
                and int(probe.res_priority[B0, n]) == 0]
    # any volcano of the map, active or not: `_erupt` is handed its ring
    v6 = max((int(v) for v in probe.volcano_at[B0].nonzero().flatten().tolist()), key=lambda v: len(open_land(v)))
    ring6 = [int(n) for n in probe.neigh[v6].tolist() if int(n) >= 0]
    land6 = open_land(v6)
    sea6 = [n for n in ring6 if bool(probe.water[B0, n]) and int(probe.military_at[B0, n]) < 0]
    assert len(land6) >= 2, f"volcano {v6} has too little open land on its ring"
    owned6, open6 = land6[:-1], land6[-1]
    one = torch.zeros(probe.B, dtype=torch.bool)
    one[B0] = True
    for row, want_destroy, want_kill in ((VOLC0, 0.0, 0.0), (VOLC0 + 1, 0.75, 0.2)):
        farms = gone = kills = 0
        bands: set[int] = set()
        N6 = 300
        for it in range(N6):
            s = fresh(rules, path, slot=5)
            s.rng_state[B0] = 104729 * (it + 1) + row
            for n in land6:
                s.improvement[B0, n] = s.FARM
                s.pillaged[B0, n] = False
                s.tile_seat[B0, n] = 0 if n != open6 else -1
            s.res_priority[B0, open6] = 1
            w = put(s, owned6[0], "WARRIOR")
            b = put(s, owned6[0], "BUILDER")
            u = put(s, open6, "WARRIOR")
            g = put(s, sea6[0], "GALLEY") if sea6 else -1
            s._erupt(one, ring_of(s, v6), torch.full((s.B,), row, dtype=torch.long))
            assert int(s.improvement[B0, open6]) == s.FARM and not bool(s.pillaged[B0, open6]), \
                "an unowned plot takes no damage row"
            assert int(s.major_unit_hp[B0, u]) == 100, "a unit on an unowned plot is untouched"
            assert bool(s.res_stripped[B0, open6]) and int(s.res_priority[B0, open6]) == 0, \
                "a bonus resource on the ring goes whoever owns the plot"
            for n in owned6:
                farms += 1
                if int(s.improvement[B0, n]) < 0:
                    gone += 1
                else:
                    assert bool(s.pillaged[B0, n]), "IMPROVEMENT_PILLAGED 100 on every row"
            bands.add(100 - int(s.major_unit_hp[B0, w]) if bool(s.major_unit_alive[B0, w]) else 100)
            kills += int(not bool(s.major_unit_alive[B0, b]))
            if g >= 0:
                assert bool(s.major_unit_alive[B0, g]) and int(s.major_unit_hp[B0, g]) == 100, \
                    "no eruption row names UNIT_DAMAGE_NAVAL"
        rate = gone / farms
        assert abs(rate - want_destroy) < 0.04, f"row {row}: destroyed {gone}/{farms} = {rate:.3f}"
        assert abs(kills / N6 - want_kill) < 0.06, f"row {row}: civilians killed {kills}/{N6}"
        if row == VOLC0:
            assert bands == {0}, f"GENTLE hurt a land unit: {bands}"
        else:
            assert all(40 <= d <= 60 for d in bands) and len(bands) > 5, f"CATASTROPHIC band {bands}"
        print(f"  6 eruption damage OK — row {row}: destroyed {gone}/{farms}, civilians {kills}/{N6}, "
              f"land band {min(bands)}-{max(bands)}")

    # 7 — the catalog rows read their own Improvement_ValidFeatures list
    # (`featureOk`): a live Woods refuses every row below, Volcanic Soil only
    # those that list it
    g = fresh(rules, path, slot=7)
    t7 = bare_land(g)
    g.feat_stripped[B0, t7] = False
    soil_rows = ("FORT", "AIRSTRIP", "MISSILE_SILO", "COLOSSAL_HEADS", "TERRACE_FARM")
    none_rows = ("SOLAR_FARM", "WIND_FARM", "CITY_PARK", "KURGAN", "MISSION", "STEPWELL", "MEKEWAP",
                 "CHEMAMULL", "GOLF_COURSE", "ICE_HOCKEY_RINK", "OPEN_AIR_MUSEUM", "MONASTERY",
                 "BATEY", "MAORI_PA")
    for name in soil_rows + none_rows:
        k = g._imp_ids.index(name)
        assert g._imp_feats_ok[k] == ([SOIL] if name in soil_rows else []), f"{name}: {g._imp_feats_ok[k]}"
        g.feat_id[B0, t7] = WOODS
        assert not bool(g._imp_ground_ok(k)[B0, t7]), f"{name} stands on Woods"
        g.feat_id[B0, t7] = SOIL
        # the row's other clauses may refuse this plot; the feature alone must not
        g.feat_stripped[B0, t7] = True
        bare = bool(g._imp_ground_ok(k)[B0, t7])
        g.feat_stripped[B0, t7] = False
        assert bool(g._imp_ground_ok(k)[B0, t7]) == (bare and name in soil_rows), f"{name} on Volcanic Soil"
    print(f"  7 ValidFeatures OK — {len(soil_rows)} rows take Volcanic Soil alone, {len(none_rows)} no feature")

    print("VOLCANIC SOIL OK — the envelope, the replacement, the per-plot chance, the damage rows")


if __name__ == "__main__":
    main()
