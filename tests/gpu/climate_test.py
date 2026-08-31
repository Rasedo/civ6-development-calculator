"""THE CLIMATE ARC — the GPU halves.

None of it is gate-reachable: the Duel threshold is 250,000 raw carbon units
per Climate Change point and a power plant waits on INDUSTRIALIZATION, so a
driven 250-turn game never leaves Phase 0. The semantics are therefore pinned
directly on the tensors here, turn-exact with the TS contract
(cpu/core/climate.ts, cpu/data/climate.ts, cpu/core/disasters.ts).

Proven here:
  * the catalog the wire carries — the seven phases, the five deforestation
    bands, the per-resource carbon table and the two feature-id lists — each
    against the exported rules.json;
  * `tile_lowland` is what the fixture shipped, which is what TS's
    `deriveLowlands` computed: ONE derivation, two engines;
  * `_deforestation_level` and `_defor_modifier` scale `_world_carbon`;
  * `_climate_points` -> `_climate_turn`, which never steps a phase back;
  * a phase floods its own lowland band, a FLOOD BARRIER holds the sea off
    its city's tiles, and one built late repairs what already went under;
  * `_melt_ice` takes the published fraction off the front of the map;
  * `_disaster_rate` and `_severity_split` ride the melt curve, and
    `_fertility_live` / `_desertification_live` flip at IV and V;
  * `_pollution_favor_penalty` is -1 per 3 points over average, capped at 20;
  * `_flood_barrier_cost` is the published formula and `_seat_buildable`
    refuses the row to a city with no lowland;
  * the Global Energy Treaty's discount and its ban;
  * a building's price is never locked at queue — `_reprice_live` follows
    both things that move it, and the digest reads the live number.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, fixture_paths, FIXTURES
from warmup import settle_all


def _bidx(rj, bid: str) -> int:
    return next(i for i, b in enumerate(rj["buildings"]) if b["id"] == bid)


def fresh(rules, path, n: int = 1) -> BatchSim:
    return BatchSim([load_fixture(path) for _ in range(n)], rules, device="cpu",
                    dtype=torch.float64)


def _emit_points(sim, row: int, points: float) -> None:
    """Emit exactly what `points` costs RIGHT NOW — the deforestation band
    scales every raw unit before it becomes a point, and a map in the cleanest
    band pays 20% less for the same carbon (`emitPoints` in the TS lane)."""
    mod = 1.0 + sim._defor_modifier()
    sim._emit_carbon(row, sim._co2_per_point * points / mod)


def main() -> int:
    rules = load_rules()
    rj = json.load(open(FIXTURES / "rules.json", encoding="utf-8"))
    paths = fixture_paths()
    cj = rj["climate"]
    b, row = 0, 0

    # --- 1) the catalog the wire carries ----------------------------------
    sim = fresh(rules, paths[0])
    assert [r[0] for r in cj["phases"]] == [2, 3, 4, 5, 6, 7, 8]
    assert [r[3] for r in cj["phases"]] == [0.10, 0.20, 0.30, 0.40, 0.55, 0.70, 0.85]
    assert sim._cl_flood.tolist() == [0, 1, 2, 0, 3, 0, 0]
    assert sim._cl_submerge.tolist() == [0, 0, 0, 1, 0, 2, 3]
    assert sim._cl_fertility == [True, True, True, False, False, False, False]
    assert sim._cl_desertify == [False, False, False, False, True, True, True]
    assert sim._defor_cuts == [(0.5, 0.5), (0.4, 0.3), (0.25, 0.1), (0.1, 0.0), (0.0, -0.2)]
    assert sim._co2_per_point == 250_000, "the Duel row, and this world is 44x26"
    # CIV6: 820/490/48 carbon per Power, over 4/4/16 Power per resource.
    cpr = sim._carbon_per_resource.tolist()
    assert 3280 in cpr and 1960 in cpr and 768 in cpr, cpr
    assert sim._ice_fid >= 0 and len(sim._clear_fids) == 3
    # CIV6 (Advanced Power Cells): "halves the CO2 emitted by units"
    assert sim._carbon_cells_tech >= 0 and float(sim._power_cells(row)[b]) == 1.0
    sim.civ_techs[b, row, sim._carbon_cells_tech] = True
    assert float(sim._power_cells(row)[b]) == 0.5
    print("  1 catalog OK (7 phases, 5 bands, carbon per resource)")

    # --- 2) the lowland plane is the FIXTURE's, not a second derivation ----
    fx = load_fixture(paths[0])
    want = torch.tensor([int(t.get("lw", 0)) for t in fx["tiles"]], dtype=torch.long)
    assert torch.equal(sim.tile_lowland[b], want), "the band must be read, never re-derived"
    assert int((sim.tile_lowland > 0).sum()) > 0, "this fixture has a coast"
    assert int(sim.tile_lowland.max()) <= int(cj["lowlandMaxBand"])
    print(f"  2 lowland plane OK ({int((sim.tile_lowland[b] > 0).sum())} banded tiles)")

    # --- 3) deforestation scales the world total --------------------------
    s3 = fresh(rules, paths[0])
    start = int(s3._removable_at_start[b])
    assert start > 0, "this fixture carries clearable features"
    assert float(s3._deforestation_level()[b]) == 0.0
    assert float(s3._defor_modifier()[b]) == -0.2, "0-9% cleared is the -20% band"
    s3._emit_carbon(row, torch.full((s3.B,), 1_000_000.0, dtype=torch.float64))
    assert abs(float(s3._world_carbon()[b]) - 800_000) < 1e-6
    # clear half the map's removable features -> +50%
    _clear = torch.zeros(s3.T, dtype=torch.bool)
    for f in s3._clear_fids.tolist():
        _clear |= s3.feat_id[b] == f
    idx = _clear.nonzero(as_tuple=True)[0][: start // 2 + 1]
    s3.feat_stripped[b, idx] = True
    assert float(s3._defor_modifier()[b]) == 0.5, float(s3._deforestation_level()[b])
    assert abs(float(s3._world_carbon()[b]) - 1_500_000) < 1e-6
    print("  3 deforestation OK (-20% clean, +50% at half cleared)")

    # --- 4) points -> phase, and the phase never steps back ---------------
    s4 = fresh(rules, paths[0])
    _emit_points(s4, row, 4)
    assert int(s4._climate_points()[b]) == 4
    assert int(s4.climate_idx[b]) == -1, "nothing has applied it yet"
    s4._climate_turn()
    assert int(s4.climate_idx[b]) == 2, "4 points is Phase III"
    # CIV6: "It is not possible to revert climate change to an earlier phase."
    s4._emit_carbon(row, -s4.civ_co2[:, row].clone())
    s4._climate_turn()
    assert int(s4.climate_idx[b]) == 2
    print("  4 points -> phase OK, monotone")

    # --- 5) a phase floods its own band, and a barrier holds it off -------
    s5 = fresh(rules, paths[0])
    band1 = (s5.tile_lowland[b] == 1).nonzero(as_tuple=True)[0]
    band2 = (s5.tile_lowland[b] == 2).nonzero(as_tuple=True)[0]
    assert len(band1) and len(band2)
    _emit_points(s5, row, 3)
    s5._climate_turn()
    assert int(s5.climate_idx[b]) == 1
    assert bool(s5.tile_flooded[b, band1].all()), "Phase II takes the 1m band"
    assert not bool(s5.tile_flooded[b, band2].any()), "and leaves the 2m band dry"
    # CIV6: flooded tiles "get pillaged", which is what costs them their
    # improvement bonus while they stay workable.
    assert bool(s5.pillaged[b, band1].all())
    _emit_points(s5, row, 1)
    s5._climate_turn()
    assert int(s5.climate_idx[b]) == 2
    assert bool(s5.tile_flooded[b, band2].all())
    print(f"  5 flooding OK ({len(band1)} band-1 tiles under at Phase II)")

    # --- 5b) a phase that SUBMERGES takes its band forever ----------------
    s5b = fresh(rules, paths[0])
    keep = (s5b.tile_lowland[b] == 2).nonzero(as_tuple=True)[0]
    take = (s5b.tile_lowland[b] == 1) & ~s5b._centre_plane()[b]
    ti = take.nonzero(as_tuple=True)[0]
    assert len(ti), "no band-1 tile to drown on this seed"
    t0 = int(ti[0])
    # stand a LAND unit on it and a hull beside it, and pave the ground
    s5b.improvement[b, t0] = 0
    s5b.road[b, t0] = True
    land = next((v for v in range(s5b.major_unit_alive.shape[1])
                 if bool(s5b.major_unit_alive[b, v])
                 and not bool(s5b.unit_naval[s5b.major_unit_type[b, v]])), -1)
    assert land >= 0, "the fixture fields no unit to drown"
    lo = s5b.POOL_LO["major"]
    s5b.military_at[b, s5b.major_unit_tile[b, land]] = -1
    s5b.civilian_at[b, s5b.major_unit_tile[b, land]] = -1
    s5b.major_unit_tile[b, land] = t0
    s5b.military_at[b, t0] = land + lo
    wh0 = float(s5b.tile_wh[b, t0])
    _emit_points(s5b, row, 5)
    s5b._climate_turn()
    assert int(s5b.climate_idx[b]) == 3, "Phase IV is the first that submerges"
    # CIV6 (Coastal Lowlands): the band is "lost forever" — open water for
    # every rule that asks, and unusable besides.
    assert bool(s5b.tile_submerged[b, t0]) and bool(s5b.water[b, t0])
    assert bool(s5b.wpass[b, t0]) and not bool(s5b.passable[b, t0])
    assert not bool(s5b.work_ok[b, t0]) and float(s5b.tile_yields[b, t0].sum()) == 0
    assert not bool(s5b.settle_ok[b, t0]) and not bool(s5b.d_usable[b, t0])
    assert not bool(s5b.camp_ok[b, t0]) and not bool(s5b.coastal_land[b, t0])
    assert int(s5b.improvement[b, t0]) == -1 and not bool(s5b.road[b, t0])
    assert int(s5b.tile_lowland[b, t0]) == 0, "nothing left to price a barrier against"
    assert int(s5b.wok[b, t0]) == 0, "and no built wonder may stand in the sea"
    if wh0 != s5b._h_fresh:
        assert float(s5b.tile_wh[b, t0]) == s5b._h_none, (
            "the ground the sea took is no longer coastal LAND")
    assert not bool(s5b.major_unit_alive[b, land]), "the land unit went down with it"
    assert int(s5b.military_at[b, t0]) < 0, "and left the plane it was holding"
    assert not bool(s5b.tile_submerged[b, keep].any()), "band 2 goes at Phase VI"
    _emit_points(s5b, row, 2)
    s5b._climate_turn()
    assert int(s5b.climate_idx[b]) == 5
    assert bool(s5b.tile_submerged[b, keep].all()), "and it does"
    print(f"  5b submersion OK ({len(ti)} band-1 tiles lost forever at Phase IV)")

    # --- 5c) a barrier holds the sea off, and no CENTRE is ever taken ------
    s5c = settle_all(fresh(rules, paths[0]))
    ctr = s5c._centre_plane()[b] & (s5c.tile_lowland[b] > 0)
    if bool(ctr.any()):
        c0 = int(ctr.nonzero(as_tuple=True)[0][0])
        band = int(s5c.tile_lowland[b, c0])
        _emit_points(s5c, row, 8)
        s5c._climate_turn()
        assert int(s5c.climate_idx[b]) == 6, "every phase crossed at once"
        assert not bool(s5c.tile_submerged[b, c0]), (
            f"a band-{band} CENTRE stayed above water: no sea destroys a city")
    print("  5c centre exemption OK (a city is never taken by the sea)")

    # --- 6) the FLOOD BARRIER: cost, gate, protection, repair -------------
    s6 = settle_all(fresh(rules, paths[0]))
    bidx = _bidx(rj, "FLOOD_BARRIER")
    assert s6._barrier_bidx == bidx
    low = s6._city_lowland_count(row)  # [B, RC]
    col = int(low[b].argmax())
    n = int(low[b, col])
    assert n > 0, "no settled city on this fixture holds a lowland tile"
    # CIV6: "(80 x coastal lowland tiles) + (80 x coastal lowland tiles x
    # flood level)"
    assert int(s6._flood_level()[b]) == 0
    assert int(s6._flood_barrier_cost(row)[b, col]) == 80 * n
    s6.climate_idx[b] = 1
    assert int(s6._flood_level()[b]) == 1
    assert int(s6._flood_barrier_cost(row)[b, col]) == 80 * n * 2
    bi = torch.full((s6.B,), bidx, dtype=torch.long)
    assert int(s6._building_cost_in(row, col, bi)[b]) == 80 * n * 2

    # a city with no lowland is never offered the row
    s6.climate_idx[b] = -1
    s6.civ_techs[:, row, :] = True
    s6._eff_version += 1
    off = s6._seat_buildable(row)[b, col, bidx]
    mine = (s6.tile_city[b] == s6.city_id[b, row, col]) & (s6.tile_seat[b] == row)
    s6.tile_lowland[b, mine] = 0
    s6._eff_version += 1
    assert bool(off) and not bool(s6._seat_buildable(row)[b, col, bidx]), (
        "CIV6: a Flood Barrier 'must be built in a city with one or more "
        "Coastal Lowland tiles'")
    print(f"  6 barrier cost + gate OK ({n} lowland tiles, 80*n*(1+level))")

    # --- 7) the barrier holds the sea off, and repairs what went under ----
    s7 = settle_all(fresh(rules, paths[0]))
    col7 = int(s7._city_lowland_count(row)[b].argmax())
    assert bool(s7.city_alive[b, row, col7]), "the lowland argmax is a live city"
    ids7 = s7.city_id[b, row, col7]
    mine7 = (s7.tile_city[b] == ids7) & (s7.tile_seat[b] == row)
    # the bands THIS city holds; a start position need not reach the shoreline
    held = [k for k in range(1, int(cj["lowlandMaxBand"]) + 1)
            if bool((mine7 & (s7.tile_lowland[b] == k)).any())]
    assert held, "no settled city on this fixture holds a lowland tile"
    at = {int(f): p for p, f in enumerate(s7._cl_flood.tolist()) if f > 0}
    pts = s7._cl_points.tolist()

    lo = mine7 & (s7.tile_lowland[b] == held[0])
    _emit_points(s7, row, pts[at[held[0]]])
    s7._climate_turn()
    assert int(s7.climate_idx[b]) == at[held[0]]
    assert bool(s7.tile_flooded[b, lo].all()), "no barrier: the band goes under"
    s7.city_bldg[b, row, col7, s7._barrier_bidx] = True
    s7._repair_behind_barrier(row, torch.full((s7.B,), col7, dtype=torch.long),
                              torch.ones(s7.B, dtype=torch.bool))
    assert not bool(s7.tile_flooded[b, lo].any())
    assert not bool(s7.pillaged[b, lo].any())
    # and the next band it holds never goes under at all, while the same band
    # outside the barrier does
    if len(held) > 1:
        hi = mine7 & (s7.tile_lowland[b] == held[1])
        out = ~mine7 & (s7.tile_lowland[b] == held[1])
        _emit_points(s7, row, pts[at[held[1]]] - pts[at[held[0]]])
        s7._climate_turn()
        assert int(s7.climate_idx[b]) == at[held[1]]
        assert not bool(s7.tile_flooded[b, hi].any()), "a barrier holds the next band"
        assert bool(s7.tile_flooded[b, out].all()), "and holds back nothing else"
    print(f"  7 barrier protection + repair OK (bands {held})")

    # --- 8) the polar ice melts by the published fraction ------------------
    s8 = fresh(rules, paths[0])
    ice0 = int(s8._ice_at_start[b])
    assert ice0 > 0, "this fixture has ice"
    _emit_points(s8, row, 2)
    s8._climate_turn()
    gone = int((s8.feat_stripped[b] & (s8.feat_id[b] == s8._ice_fid)).sum())
    assert gone == int(ice0 * 0.10), f"Phase I melts 10%: {gone} of {ice0}"
    _emit_points(s8, row, 2)
    s8._climate_turn()
    gone = int((s8.feat_stripped[b] & (s8.feat_id[b] == s8._ice_fid)).sum())
    assert gone == int(ice0 * 0.30), f"through Phase III, 30%: {gone} of {ice0}"
    print(f"  8 ice melt OK ({gone} of {ice0} floes gone by Phase III)")

    # --- 9) a warmed world's weather --------------------------------------
    s9 = fresh(rules, paths[0])
    assert float(s9._disaster_rate()[b]) == 1.0
    assert bool(s9._fertility_live()[b]) and not bool(s9._desertification_live()[b])
    base = s9._flood_sev_p
    assert s9._severity_split(base)[b].tolist() == list(base)
    prev = 1.0
    for p in range(7):
        s9.climate_idx[b] = p
        r = float(s9._disaster_rate()[b])
        assert r > prev, f"phase {p} must run its draws more often than {p - 1}"
        prev = r
        sp = s9._severity_split(base)[b].tolist()
        assert sp[0] < base[0] and sp[-1] > base[-1]
        assert abs(sum(sp) - 1.0) < 1e-12
    s9.climate_idx[b] = 3  # Phase IV
    assert not bool(s9._fertility_live()[b]) and not bool(s9._desertification_live()[b])
    s9.climate_idx[b] = 4  # Phase V
    assert bool(s9._desertification_live()[b])
    # and the silt comes back off
    t9 = torch.tensor([0], dtype=torch.long)
    r9 = torch.tensor([b], dtype=torch.long)
    s9.fertility[b, 0] = 2
    s9.fertility_prod[b, 0] = 1
    s9._defertilize(r9, t9)
    assert int(s9.fertility[b, 0]) == 1 and int(s9.fertility_prod[b, 0]) == 0
    s9._defertilize(r9, t9)
    assert int(s9.fertility[b, 0]) == 0 and int(s9.fertility_prod[b, 0]) == 0
    print("  9 rate + severity + fertility gates OK")

    # --- 10) what pollution costs in the Congress -------------------------
    s10 = fresh(rules, paths[0])
    assert s10.n_majors >= 2
    s10.civ_co2[b, :] = 0
    s10.civ_co2[b, 0] = 12_000 * s10.n_majors  # avg = 12000/... see below
    # one seat at N points and the rest at 0: average = N/n_majors
    pts = 12_000 * s10.n_majors / 1000.0
    avg = pts / s10.n_majors
    want = min(20, int((pts - avg) // 3))
    assert int(s10._pollution_favor_penalty(0)[b]) == want, (
        f"-1 per 3 points over average: {pts} vs {avg}")
    assert int(s10._pollution_favor_penalty(1)[b]) == 0, "below average pays nothing"
    s10.civ_co2[b, 0] = 10_000_000
    assert int(s10._pollution_favor_penalty(0)[b]) == 20, "the penalty caps at 20"
    print(f"  10 pollution favor OK (-{want} over average, cap 20)")

    # --- 11) Carbon Recapture and the Global Energy Treaty ----------------
    prow = next(p for p in rj["projects"]["rows"] if int(p.get("cr", 0)))
    assert int(prow["rv"]) >= 0, "Carbon Recapture waits on a CIVIC"
    assert int(cj["recaptureUnits"]) == 50_000 and int(cj["recaptureFavor"]) == 30

    s11 = settle_all(fresh(rules, paths[0]))
    res = next((i for i, r in enumerate(rj["eras"]["congressResolutions"])
                if r["id"] == "GLOBAL_ENERGY_TREATY"), -1)
    assert res >= 0, "the treaty is on the wire"
    assert s11._congress_space(int(rj["eras"]["congressResolutions"][res]["t"])) == len(s11._plant_bidx)
    plant = s11._plant_bidx[0]
    s11.congress_active[b, 0] = torch.tensor([res, 0, 0])   # outcome A: discount
    assert int(s11._congress_energy_discount()[b]) == plant
    assert int(s11._congress_energy_blocked()[b]) == -1
    bi11 = torch.full((s11.B,), plant, dtype=torch.long)
    full = float(rules.b_cost[plant])
    assert int(s11._building_cost_in(row, 0, bi11)[b]) == round(full * 0.5), (
        "CIV6: '50% discount on the production of buildings of this type'")
    s11.congress_active[b, 0, 1] = 1   # outcome B: the ban
    s11._eff_version += 1
    assert int(s11._congress_energy_blocked()[b]) == plant
    s11.civ_techs[:, row, :] = True
    s11._eff_version += 1
    assert not bool(s11._seat_buildable(row)[b, :, plant].any()), (
        "CIV6: 'Buildings of this type cannot be created by any player'")
    print("  11 recapture row + energy treaty OK")

    # --- 12) a building's price is never LOCKED ---------------------------
    # TS holds no `q.cost` for a building: `buildingCostIn` is re-read at every
    # completion check and again for the digest, so both movers have to be
    # followed here rather than frozen at queue.
    s12 = settle_all(fresh(rules, paths[0]))
    col12 = int(s12._city_lowland_count(row)[b].argmax())
    n12 = int(s12._city_lowland_count(row)[b, col12])
    s12.city_current[b, row, col12, 0] = s12._barrier_bidx
    s12.city_cost[b, row, col12, 0] = 80 * n12
    s12.climate_idx[b] = 1
    s12._reprice_live(row)
    assert int(s12.city_cost[b, row, col12, 0]) == 80 * n12 * 2, "the sea moved the price"

    plant = s12._plant_bidx[0]
    col13 = next(c for c in range(s12.RC)
                 if c != col12 and bool(s12.city_alive[b, row, c])) if bool(
        s12.city_alive[b, row].sum() > 1) else col12
    s12.city_current[b, row, col13, 0] = plant
    full = float(rules.b_cost[plant])
    s12.city_cost[b, row, col13, 0] = full
    res12 = next(i for i, r in enumerate(rj["eras"]["congressResolutions"])
                 if r["id"] == "GLOBAL_ENERGY_TREATY")
    s12.congress_active[b, 0] = torch.tensor([res12, 0, 0])
    s12._eff_version += 1
    s12._reprice_live(row)
    assert int(s12.city_cost[b, row, col13, 0]) == round(full * 0.5), (
        "the treaty's discount moved the price")
    # and the digest reads the same live number the plane now holds
    from core.statecompare import EXTRACTORS  # noqa: PLC0415
    live = EXTRACTORS["city"]["queueCost"](s12, b, [(row, col13)])
    assert int(live[0][0]) == round(full * 0.5)   # the extractor answers per QUEUE SLOT
    print("  12 live building price OK (the sea and the treaty both move it)")

    print("BATTERY OK climate")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
