"""WONDER EFFECTS self-test — the fourteen channels a COMPLETE wonder pays.

Every row of `BUILT_WONDERS` is sourced from the GS Civilopedia, and most of
what those pages list is not a yield: Great Person points per turn, housing and
amenities for the holding city, terrain-keyed tile yields, policy slots by
kind, envoys per wonder built, unit charges, a certain Martyr, a duplicated
naval train, tourism multipliers, a loyalty aura, occupation defence, free
research, a treasury multiplier and era score per moment.

The serve gate reaches almost none of it — a 250-turn scripted game rarely
finishes a Medieval wonder, and never finishes two — so this lane is the only
proof that the channels are wired rather than merely exported.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, fixture_paths, FIXTURES
from warmup import settle_all


def _find(rows, pred, what):
    hits = [i for i, r in enumerate(rows) if pred(r)]
    assert len(hits) == 1, f"expected exactly one {what}, got rows {hits}"
    return hits[0]


def plant(sim, row: int, col: int, wi: int) -> int:
    """Put wonder `wi` on a tile of seat `row`'s city `col`, COMPLETE, through
    the same three planes the queue's completion writes. Returns the tile."""
    ctr = int(sim.city_center[0, row, col])
    near = (sim.pair_dist[ctr] <= 3).nonzero(as_tuple=True)[0].tolist()
    tile = next(int(t) for t in near
                if t != ctr and int(sim.built_wonder[0, t]) < 0 and int(sim.district[0, t]) < 0)
    sim.city_wonder[:, row, col, wi] = tile
    sim.built_wonder[:, tile] = wi
    sim.built_wonder_complete[:, tile] = True
    sim._eff_version += 1
    return tile


def main() -> None:
    rules = load_rules()
    rj = json.loads((FIXTURES / "rules.json").read_text(encoding="utf-8"))
    rows = rj["wonders"]["rows"]
    paths = fixture_paths()
    assert paths, "no fixtures — run `npm run seed && npm run export` first"

    # --- 1) the catalog carries every channel, on the sourced rows ----------
    alhambra = _find(rows, lambda r: r["occupyDefense"] == 4, "wonder with +4 occupation defence")
    montsm = _find(rows, lambda r: r["occupyDefense"] == 6, "wonder with +6 occupation defence")
    bigben = _find(rows, lambda r: r["treasuryMult"] != 1, "wonder multiplying the treasury")
    apadana = _find(rows, lambda r: r["envoysPerWonder"] > 0, "wonder paying envoys per wonder")
    hagia = _find(rows, lambda r: r["spreadCharges"] > 0, "wonder granting spread charges")
    pyramids = _find(rows, lambda r: r["buildCharges"] > 0, "wonder granting build charges")
    arsenal = _find(rows, lambda r: r["dupNaval"], "wonder duplicating a naval train")
    basils = _find(rows, lambda r: r["relicTourismMult"] != 1, "wonder doubling relic tourism")
    cristo = _find(rows, lambda r: r["resortTourismMult"] != 1, "wonder doubling resort tourism")
    liberty = _find(rows, lambda r: r["loyaltyAura"] > 0, "wonder with a loyalty aura")
    taj = _find(rows, lambda r: r["eraScorePerMoment"] > 0, "wonder paying era score per moment")
    artemis = _find(rows, lambda r: r["amenImp"], "wonder paying amenities per improvement")
    oxford = _find(rows, lambda r: r["freeTechs"] > 0, "wonder granting free technologies")
    ruhr = _find(rows, lambda r: r["impY"], "wonder paying yields per improvement")
    library = _find(rows, lambda r: r["boostTechEra"] >= 0, "wonder boosting an era of technologies")
    oracle = _find(rows, lambda r: r["distGpp"] > 0, "wonder paying its districts GP points")
    bolshoi = _find(rows, lambda r: r["freeCivics"] > 0, "wonder granting free civics")
    assert rows[montsm]["apostleMartyr"] == 1, "the +6 defence wonder is Mont St. Michel — it grants MARTYR"
    assert rows[artemis]["amenImpRange"] == 4, "Temple of Artemis reaches 4 tiles"
    assert rows[liberty]["loyaltyAura"] == 6, "the Statue of Liberty reaches 6 tiles"
    assert rows[alhambra]["slots"] == [1, 0, 0, 0], "the Alhambra's slot is MILITARY"
    assert rows[bigben]["slots"] == [0, 1, 0, 0], "Big Ben's slot is ECONOMIC"
    # ten wonders pay per-turn Great Person points, and no row is all-zero cy
    # AND all-zero everything (a row with no effect at all would be a bug)
    gpp_rows = [i for i, r in enumerate(rows) if any(r["gpp"])]
    assert len(gpp_rows) == 10, f"ten wonders pay per-turn GP points, found {len(gpp_rows)}"
    tiley_rows = [i for i, r in enumerate(rows) if r["tiley"]]
    assert len(tiley_rows) == 4, f"four wonders key yields on terrain/feature, found {len(tiley_rows)}"
    assert any(t["emp"] for t in rows[[i for i in tiley_rows if any(x["emp"] for x in rows[i]["tiley"])][0]]["tiley"]), \
        "Etemenanki's Marsh term is EMPIRE-wide"
    assert rows[ruhr]["impYYields"][1] == 1 and len(rows[ruhr]["impY"]) == 2, \
        "Ruhr Valley pays +1 PRODUCTION for each of two improvements"
    assert rows[library]["boostTechEra"] == 1, "the Great Library reaches the CLASSICAL era"
    assert rows[oracle]["distGpp"] == 2, "the Oracle pays its districts +2"
    print(f"  catalog OK — {len(rows)} rows, {len(gpp_rows)} pay GP points, {len(tiley_rows)} key on terrain")

    sim = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    ncls = sim._wond_gpp.shape[1]

    # --- 2) per-turn Great Person points reach the seat ---------------------
    before = [float(sim._seat_wonder_sum(0, sim._wond_gpp[:, c])[0]) for c in range(ncls)]
    assert sum(before) == 0.0, "no wonder stands yet, so no wonder pays points"
    hermitage = _find(rows, lambda r: r["gwslots"] == [0, 4, 0], "wonder with four Great Work of Art slots")
    plant(sim, 0, 0, hermitage)
    after = [float(sim._seat_wonder_sum(0, sim._wond_gpp[:, c])[0]) for c in range(ncls)]
    assert sum(after) == 3.0, f"the Hermitage pays 3 points to one class, got {after}"
    assert float(sim._seat_wonder_sum(1, sim._wond_gpp[:, after.index(3.0)])[0]) == 0.0, \
        "another seat must not collect this seat's wonder points"
    print("  GP points OK — the owner collects, a neighbour does not")

    # --- 3) housing and amenities land on the HOLDING city ------------------
    s3 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    h0 = s3._seat_housing(0)[1][0, 0].item()
    gbath = _find(rows, lambda r: r["cityHousing"] == 3 and r["cityAmenities"] == 1, "the Great Bath")
    plant(s3, 0, 0, gbath)
    h1 = s3._seat_housing(0)[1][0, 0].item()
    assert h1 == h0 + 3, f"the Great Bath pays 3 housing to its city, {h0} -> {h1}"
    amen = s3._city_wonder_flat(0, s3._wond_cityamen)
    assert float(amen[0, 0]) == 1.0, "and 1 amenity to that city only"
    assert float(amen[0, 1:].sum()) == 0.0, "never to a sibling city"
    s3._seat_amenity(0)  # the tier body reads both terms — it must survive them
    print("  housing/amenities OK — paid to the holding city, not to its siblings")

    # --- 4) policy slots, by KIND ------------------------------------------
    s4 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    assert int(s4._wonder_extra_slots(0).sum()) == 0, "no wonder, no extra slot"
    plant(s4, 0, 0, alhambra)
    xs = s4._wonder_extra_slots(0)
    assert xs[0].tolist() == [1, 0, 0, 0], f"the Alhambra adds a MILITARY slot, got {xs[0].tolist()}"
    plant(s4, 0, 0, bigben)
    xs = s4._wonder_extra_slots(0)
    assert xs[0].tolist() == [1, 1, 0, 0], f"Big Ben adds an ECONOMIC slot beside it, got {xs[0].tolist()}"
    print("  policy slots OK — military and economic, counted per kind")

    # --- 5) occupation defence, and its fortification floor -----------------
    s5 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    assert s5._occupy_def() is None or int(s5._occupy_def().sum()) == 0, "no wonder stands, so no tile defends"
    wt = plant(s5, 0, 0, montsm)
    occ = s5._occupy_def()
    assert occ is not None and int(occ[0, wt]) == 6, f"Mont St. Michel defends its tile by 6, got {int(occ[0, wt])}"
    tiles = torch.full((s5.B,), wt, dtype=torch.long)
    bare = torch.full((s5.B,), int(s5.city_center[0, 0, 0]), dtype=torch.long)
    assert int(s5._tdef_g(tiles)[0]) - int(s5._tdef_g(bare)[0]) == 6 - int(s5.tdef[0, bare[0]]) + int(s5.tdef[0, wt]), \
        "the wonder term must ride the terrain-defence reader every combat site calls"
    # an INCOMPLETE wonder defends nothing
    s5.built_wonder_complete[:, wt] = False
    s5._eff_version += 1
    assert s5._occupy_def() is None or int(s5._occupy_def()[0, wt]) == 0, "an unfinished wonder defends nobody"
    print("  occupation defence OK — complete only, through the tdef reader")

    # --- 6) Mont St. Michel makes the MARTYR draw certain -------------------
    s6 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    r0 = torch.zeros(1, dtype=torch.long)
    got = 0
    for _ in range(40):
        got += int(s6._martyr_draw(r0, r0)[0])
    assert got < 40, "a bare seat cannot martyr every apostle"
    plant(s6, 0, 0, montsm)
    st = s6.rng_state.clone()
    assert all(bool(s6._martyr_draw(r0, r0)[0]) for _ in range(20)), \
        "with Mont St. Michel every Apostle carries MARTYR"
    assert int(s6.rng_state[0]) != int(st[0]), "the draw must still run, so the stream keeps its length"
    print("  martyr OK — certain with the wonder, and the stream still advances")

    # --- 7) the loyalty aura clamps a city in range -------------------------
    s7 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    here = s7.city_center[:, 0, 0].clamp(min=0)
    assert not bool(s7._wonder_loyalty_aura(0, here)[0]), "no wonder, no aura"
    plant(s7, 0, 0, liberty)
    assert bool(s7._wonder_loyalty_aura(0, here)[0]), "the Statue of Liberty covers its own city"
    far = torch.full_like(here, int((here[0] + s7.T // 2) % s7.T))
    d = int(s7.pair_dist[int(s7.city_wonder[0, 0, 0, liberty]), int(far[0])])
    if d > 6:
        assert not bool(s7._wonder_loyalty_aura(0, far)[0]), f"a centre {d} tiles away is out of reach"
    print("  loyalty aura OK — its own city in, a distant centre out")

    # --- 8) the wonder charges ride EVERY spawn path ------------------------
    s8 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    ti_b = torch.full((s8.B,), s8._builder_idx, dtype=torch.long)
    assert int(s8._extra_charges(0, ti_b)[0]) == 0, "no wonder, no extra charge"
    plant(s8, 0, 0, pyramids)
    assert int(s8._extra_charges(0, ti_b)[0]) == 1, "the Pyramids give every Builder one more build charge"
    ti_a = torch.full((s8.B,), s8._apostle_idx, dtype=torch.long)
    assert int(s8._extra_charges(0, ti_a)[0]) == 0, "the Pyramids say nothing about Apostles"
    plant(s8, 0, 0, hagia)
    assert int(s8._extra_charges(0, ti_a)[0]) == 1, "the Hagia Sophia gives every Apostle one more spread"
    assert int(s8._extra_charges(1, ti_a)[0]) == 0, "and only to its owner"
    print("  charges OK — builder and spread, per owner, at creation")

    # --- 9) free research completes the FIRST available rows ----------------
    s9 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    t_before = int(s9.civ_techs[0, 0].sum())
    c_before = int(s9.civ_civics[0, 0].sum())
    two = torch.full((s9.B,), 2, dtype=torch.long)
    zero = torch.zeros(s9.B, dtype=torch.long)
    s9._grant_free_research(0, two, zero)
    assert int(s9.civ_techs[0, 0].sum()) == t_before + 2, "Oxford's two free technologies must land"
    assert int(s9.civ_civics[0, 0].sum()) == c_before, "and no civic with them"
    s9._grant_free_research(0, zero, two)
    assert int(s9.civ_civics[0, 0].sum()) == c_before + 2, "the Bolshoi's two free civics must land"
    assert int(s9.civ_techs[0, 1].sum()) == t_before, "another seat's tree must not move"
    print("  free research OK — techs and civics, first available, owner only")

    # --- 10) the tourism multipliers ---------------------------------------
    s10 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    assert float(s10._seat_wonder_mult(0, s10._wond_resorttour)[0]) == 1.0, "no wonder, no multiplier"
    plant(s10, 0, 0, cristo)
    assert float(s10._seat_wonder_mult(0, s10._wond_resorttour)[0]) == 2.0, "Cristo Redentor doubles resort tourism"
    plant(s10, 0, 0, basils)
    rm = s10._city_wonder_mult(0, s10._wond_relictour)
    assert float(rm[0, 0]) == 2.0, "St. Basil's doubles the relic tourism of ITS city"
    assert float(rm[0, 1]) == 1.0, "and of no other"
    print("  tourism multipliers OK — the resort one is the seat's, the relic one its city's")

    # --- 11) the terrain-keyed tile yields are read off the LIVE feature ----
    s11 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    assert s11._wond_tiley, "the tile-yield rules must survive the export"
    emp = [r for r in s11._wond_tiley if r[4]]
    assert emp, "Etemenanki's Marsh rule is empire-wide"
    _wi, _tid, _fid, _xfid, _emp, _y = emp[0]
    assert _fid >= 0 and float(_y[3]) == 2.0 and float(_y[1]) == 1.0, \
        f"the empire rule pays +2 science +1 production on a FEATURE, got {[float(v) for v in _y]}"
    print(f"  tile yields OK — {len(s11._wond_tiley)} rules, {len(emp)} empire-wide")

    # --- 12) the whole thing still steps ------------------------------------
    s12 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    for wi in (alhambra, montsm, artemis, taj, oxford, bolshoi, apadana, arsenal):
        plant(s12, 0, 0, wi)
    for _ in range(6):
        s12.step()
    assert int(s12.turn) > 0, "the sim must still advance with every channel live"
    print("  step OK — eight wonders standing, six turns clean")

    # --- 13) Ruhr Valley: +1 production per Mine and Quarry the CITY owns ---
    s13 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    ctr13 = int(s13.city_center[0, 0, 0])
    mine_i, quarry_i = s13._mine_iidx, s13._quarry_iidx
    own = [int(t) for t in (s13.city_slot_at(0)[0] == 0).nonzero(as_tuple=True)[0].tolist()
           if t != ctr13 and int(s13.district[0, t]) < 0 and int(s13.built_wonder[0, t]) < 0]
    assert len(own) >= 3, "the fixture city owns too few plain tiles"
    plant(s13, 0, 0, ruhr)
    base13 = s13._wonder_improvement_yields(0)
    assert base13 is not None and float(base13[0, 0, 1]) == 0.0, "no improvement, no production"
    s13.improvement[0, own[0]] = mine_i
    s13.improvement[0, own[1]] = quarry_i
    s13._eff_version += 1
    assert float(s13._wonder_improvement_yields(0)[0, 0, 1]) == 2.0, "a Mine and a Quarry pay 2"
    s13.pillaged[0, own[0]] = True
    assert float(s13._wonder_improvement_yields(0)[0, 0, 1]) == 1.0, "a pillaged Mine pays nothing"
    s13.pillaged[0, own[0]] = False
    s13.tile_seat[0, own[0]] = 1  # another seat's ground
    s13._tile_owner_ver += 1
    assert float(s13._wonder_improvement_yields(0)[0, 0, 1]) == 1.0, \
        "a Mine outside the city pays nothing"
    print("  Ruhr Valley OK — a Mine and a Quarry the city owns, pillage and ownership gated")

    # --- 14) the Oracle: every district in ITS city, +2 of its own type -----
    s14 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    cls14 = next(c for c in range(s14._gp_nc) if int(s14._gp_class_district[c]) >= 0)
    d14 = int(s14._gp_class_district[cls14])
    ctr14 = int(s14.city_center[0, 0, 0])
    site = next(int(t) for t in (s14.pair_dist[ctr14] <= 3).nonzero(as_tuple=True)[0].tolist()
                if t != ctr14 and int(s14.district[0, t]) < 0 and int(s14.built_wonder[0, t]) < 0)
    s14.district[0, site] = d14
    s14.district_complete[0, site] = True
    s14.district_pillaged[0, site] = False
    s14.city_dist_tile[0, 0, 0, d14] = site
    s14._eff_version += 1
    s14.civ_gpp[:, 0, cls14] = 0.0
    s14._advance_great_people(0, torch.ones(s14.B, dtype=torch.bool, device=s14.device))
    plain = float(s14.civ_gpp[0, 0, cls14])
    assert plain >= 1.0, f"a bare district must pay at least 1, got {plain}"
    plant(s14, 0, 0, oracle)
    s14.civ_gpp[:, 0, cls14] = 0.0
    s14._advance_great_people(0, torch.ones(s14.B, dtype=torch.bool, device=s14.device))
    assert float(s14.civ_gpp[0, 0, cls14]) == plain + 2.0, \
        f"the Oracle must add 2, got {float(s14.civ_gpp[0, 0, cls14])} vs {plain}"
    print("  Oracle OK — its own city's district pays +2 of its class")

    # --- 15) the Great Library boosts every Ancient/Classical technology ----
    s15 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    nt15 = min(s15.civ_tech_boosted.shape[2], s15._tech_era.numel())
    early = (s15._tech_era[:nt15] <= 1)
    s15.civ_tech_boosted[:, 0, :nt15] = False
    s15.civ_techs[:, 0, :nt15] = False
    s15.civ_techs[0, 0, int(early.nonzero()[0])] = True  # already researched: no eureka
    tile15 = plant(s15, 0, 0, library)
    s15.built_wonder_complete[0, tile15] = False
    s15.city_current[:, 0, 0] = s15.WONDER_BASE + library
    s15.city_progress[:, 0, 0] = 10.0 ** 9
    s15._seat_city_produce(
        0, torch.zeros(s15.B, dtype=torch.long, device=s15.device),
        torch.ones(s15.B, dtype=torch.bool, device=s15.device),
        torch.zeros(s15.B, dtype=torch.float64, device=s15.device))
    got = s15.civ_tech_boosted[0, 0, :nt15]
    assert bool((got[early] | s15.civ_techs[0, 0, :nt15][early]).all()), \
        "an Ancient or Classical technology was left unboosted"
    assert not bool(got[~early].any()), "a later technology was boosted"
    assert not bool(got[int(early.nonzero()[0])]), "a researched technology took a eureka"
    print(f"  Great Library OK — {int(early.sum())} early technologies boosted, no later one")

    print("WONDER EFFECTS OK")


if __name__ == "__main__":
    main()
