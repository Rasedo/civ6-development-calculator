"""The six districts that arrived together — the GPU halves.

None of them is gate-reachable end to end: the Dam waits on BUTTRESS, the
Canal on STEAM_POWER, the Water Park on NATURAL_HISTORY and the Preserve on
MYSTICISM, and only the Government Plaza and the Diplomatic Quarter unlock
early enough for a driven 250-turn game to place one. So the semantics are
pinned directly on the tensors here, turn-exact with the TS contract
(cpu/core/rules.ts canPlaceDistrictIn, cpu/core/city.ts computeHousing +
seatBuildingSum, cpu/core/yields.ts cityDistrictSum + cityPower,
cpu/core/phase.ts standingLoyalty, cpu/core/eras.ts grantedGovernorTitles,
cpu/core/espionage.ts cityCounterLevels, cpu/core/effects.ts
preserveTileYields).

Proven here:
  * the catalog columns the wire carries: appeal, amenity, loyalty, governor
    title, envoy, one-per-civ, exclusivity, appeal housing, flood shield,
    the unowned bomb, the spy penalty and the Preserve housing table, each
    against the exported rules.json;
  * `_dam_plot` wants two river sides and takes one Dam per river component;
  * `_canal_plot` wants an entry and an exit 2, 3 or 4 directions apart;
  * `_district_elig` closes every plot for a one-per-civ district the seat
    already holds, and closes a Water Park against its Entertainment Complex;
  * `_seat_housing` pays the Dam's +3 off the registry, the Preserve's off
    the appeal band, and the Water Park's maintenance;
  * `_seat_amenity` reads the district's own amenity column, dark when
    pillaged;
  * `_granted_titles`, `_standing_loyalty`, `_ungoverned_loyalty` and
    `_seat_building_sum` over favor / influence / spy capacity;
  * `_city_power_need` takes the Hydroelectric Dam's renewable supply;
  * `_counter_levels` = the Diplomatic Quarter's 2 plus the Consulate's 1;
  * `_river_shielded` is the Dam's flood half, and BREACH_DAM has a column;
  * `_tile_appeal` reads `_appeal_adj` in both directions;
  * `_preserve_plane` pays the Grove's band yields to unimproved neighbours;
  * `_culture_bomb(unowned_only=True)` leaves a rival's tile alone;
  * the government-tier gate closes a Plaza building the seat cannot run.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, fixture_paths, FIXTURES
from warmup import settle_all

NEW = ("DAM", "CANAL", "WATER_PARK", "PRESERVE", "GOVERNMENT_PLAZA", "DIPLOMATIC_QUARTER")


def _didx(sim, did: str) -> int:
    return next(i for i, d in enumerate(sim.districts_cat) if d.get("id") == did)


def _bidx(sim, rj, bid: str) -> int:
    return next(i for i, b in enumerate(rj["buildings"]) if b["id"] == bid)


def _put(sim, b: int, row: int, col: int, di: int, tile: int, complete: bool = True) -> None:
    """Stand a district of type `di` on `tile` and register it in city slot
    `col` — the two writes `_place_district` makes."""
    sim.district[b, tile] = di
    sim.district_complete[b, tile] = complete
    sim.district_pillaged[b, tile] = False
    sim.tile_seat[b, tile] = row
    sim.tile_city[b, tile] = sim.city_id[b, row, col]
    sim.city_dist_tile[b, row, col, di] = tile
    sim._eff_version += 1
    sim._tile_owner_ver += 1
    sim._claim_version += 1


def _claim(sim, b: int, row: int, col: int) -> None:
    """Hand every workable tile around the centre to this city, cleared — a
    fresh capital owns too few plots for a placement lane to have a choice."""
    ctr = int(sim.city_center[b, row, col])
    for t in (sim.pair_dist[ctr] <= 3).nonzero().reshape(-1).tolist():
        if int(sim.centre_slot_at[b, t]) >= 0 or int(sim.district[b, t]) >= 0:
            continue
        sim.tile_seat[b, t] = row
        sim.tile_city[b, t] = sim.city_id[b, row, col]
        sim.improvement[b, t] = -1
        sim.built_wonder[b, t] = -1
        sim.res_priority[b, t] = 0
        sim.feat_stripped[b, t] = True
    sim._eff_version += 1
    sim._tile_owner_ver += 1
    sim._claim_version += 1


def main() -> None:
    rules = load_rules()
    rj = json.loads((FIXTURES / "rules.json").read_text(encoding="utf-8"))
    paths = fixture_paths()
    assert paths, "no fixtures — run `npm run seed && npm run export` first"

    # --- 1) the catalog columns the wire carries ---------------------------
    sim = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    cat = {d["id"]: i for i, d in enumerate(sim.districts_cat)}
    for did in NEW:
        assert did in cat, f"{did} must be a placeable district column"
    place = [d["id"] for d in rj["districts"]]
    assert place[-6:] == list(NEW), "the six appended LAST — earlier indices are wire meaning"

    dam, canal, wp, pres = cat["DAM"], cat["CANAL"], cat["WATER_PARK"], cat["PRESERVE"]
    gp, dq, ec = cat["GOVERNMENT_PLAZA"], cat["DIPLOMATIC_QUARTER"], cat["ENTERTAINMENT_COMPLEX"]
    iz = cat["INDUSTRIAL_ZONE"]

    for i, d in enumerate(rj["districts"]):
        assert int(sim._appeal_adj[i]) == int(d.get("appealAdjacent", 0)), f"{d['id']} appeal"
    assert int(sim._appeal_adj[dam]) == 1 and int(sim._appeal_adj[iz]) == -1
    assert int(sim._appeal_adj[gp]) == 0
    assert float(sim._d_amenity[wp]) == 1.0, "CIV6 (Water Park): +1 Amenity"
    assert float(sim._d_loyalty[gp]) == 8.0, "CIV6 (Government Plaza): +8 Loyalty"
    assert int(sim._d_gov_title[gp]) == 1 and int(sim._d_envoy_centre[dq]) == 1
    assert int(sim._d_spy_pen[dq]) == 2 and int(sim._d_spy_pen[gp]) == 0
    assert bool(sim._d_one_civ[gp]) and bool(sim._d_one_civ[dq]) and not bool(sim._d_one_civ[dam])
    assert sim._d_exclusive[wp] == [ec] and sim._d_exclusive[ec] == [wp], "either way round"
    assert bool(sim._d_appeal_housing[pres]) and bool(sim._d_bomb_unowned[pres])
    assert bool(sim._d_flood_shield[dam]) and not bool(sim._d_flood_shield[canal])
    assert float(sim._d_housing[dam]) == 3.0, "CIV6 (Dam): +3 Housing"
    assert sim._preserve_housing == list(rj["eras"]["preserveHousing"])
    assert pres in sim._appeal_house_idx
    scaf = {place[s["idx"]]: s for s in rj["districtScaffold"]["place"]}
    assert scaf["DAM"]["placement"] == 5 and scaf["CANAL"]["placement"] == 6
    assert scaf["WATER_PARK"]["placement"] == 2 and scaf["PRESERVE"]["placement"] == 3
    print("catalog ok")

    # --- 2) the Dam's plot: two river sides, one per river -----------------
    row, col = 0, 0
    b = 0
    ctr = int(sim.city_center[b, row, col])
    free = [int(t) for t in sim.neigh[sim.neigh[ctr].clamp(min=0)].reshape(-1).tolist()
            if t >= 0 and int(sim.centre_slot_at[b, int(t)]) < 0 and int(sim.district[b, int(t)]) < 0]
    a_t, b_t = free[0], free[1]
    keep_rm = sim.river_mask[b].clone()
    keep_rc = sim.river_comp[b].clone()
    sim.river_mask[b, a_t] = 0
    sim.river_comp[b, a_t] = 0
    assert not bool(sim._dam_plot(dam)[b, a_t]), "no river sides, no Dam"
    sim.river_mask[b, a_t] = (1 << 0) | (1 << 1)
    assert bool(sim._dam_plot(dam)[b, a_t]), "two sides on a real river is a plot"
    sim.river_mask[b, b_t] = (1 << 2) | (1 << 3)
    sim.river_comp[b, b_t] = 0
    keep_d = int(sim.district[b, b_t])
    sim.district[b, b_t] = dam
    # CIV6 (Dam): "Limit of one per River."
    assert not bool(sim._dam_plot(dam)[b, a_t]), "one Dam closes its whole river"
    sim.river_comp[b, b_t] = 1
    assert bool(sim._dam_plot(dam)[b, a_t]), "a second river takes its own"
    sim.district[b, b_t] = keep_d
    sim.river_mask[b] = keep_rm
    sim.river_comp[b] = keep_rc
    print("dam plot ok")

    # --- 3) the Canal's passage -------------------------------------------
    s2 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    tgt = a_t
    nb = [int(t) for t in s2.neigh[tgt].tolist()]
    assert all(t >= 0 for t in nb), "the lane wants an inland tile with six neighbours"
    keep_w = s2.water[b].clone()
    keep_o = s2.ocean_tile[b].clone()
    s2.water[b, :] = False
    assert not bool(s2._canal_plot()[b, tgt])
    s2.water[b, nb[0]] = True
    s2.ocean_tile[b, nb[0]] = False
    s2.water[b, nb[3]] = True
    s2.ocean_tile[b, nb[3]] = False
    # CIV6 (Canal): straight through is a 3-direction gap.
    assert bool(s2._canal_plot()[b, tgt]), "water on both sides, straight through"
    s2.water[b, nb[3]] = False
    s2.water[b, nb[1]] = True
    s2.ocean_tile[b, nb[1]] = False
    assert not bool(s2._canal_plot()[b, tgt]), "a 120-degree turn is no passage"
    s2.water[b] = keep_w
    s2.ocean_tile[b] = keep_o
    print("canal plot ok")

    # --- 4) one per civilization, and the Water Park's exclusion -----------
    s3 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    _claim(s3, b, row, col)
    assert bool(s3._district_elig(row, col, gp)[b].any()), "the Plaza needs somewhere to go"
    _put(s3, b, row, col, gp, a_t)
    for j in range(s3.RC):
        # CIV6: one per civilization closes every plot in every city.
        assert not bool(s3._district_elig(row, j, gp)[b].any())

    s4 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    _claim(s4, b, row, col)
    s4.coastal_water[b, a_t] = True   # the Water Park's surface
    assert bool(s4._district_elig(row, col, wp, 2)[b, a_t])
    _put(s4, b, row, col, ec, b_t)
    # CIV6 (Water Park): refused where an Entertainment Complex stands.
    assert not bool(s4._district_elig(row, col, wp, 2)[b, a_t])
    assert not bool(s4._d_one_civ[wp]), "...and that is a per-CITY refusal"
    print("one-civ + exclusivity ok")

    # --- 5) housing, maintenance and the amenity column --------------------
    s5 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    m0, h0 = s5._seat_housing(row)
    _put(s5, b, row, col, dam, a_t)
    m1, h1 = s5._seat_housing(row)
    assert float(h1[b, col] - h0[b, col]) == 3.0, "CIV6 (Dam): +3 Housing"
    assert float(m1[b, col] - m0[b, col]) == 0.0, "the Dam costs nothing to keep"
    s5.district_pillaged[b, a_t] = True
    s5._eff_version += 1
    _, h2 = s5._seat_housing(row)
    assert float(h2[b, col]) == float(h0[b, col]), "a pillaged Dam pays nothing"

    s6 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    m0, _ = s6._seat_housing(row)
    _put(s6, b, row, col, wp, a_t)
    m1, _ = s6._seat_housing(row)
    assert float(m1[b, col] - m0[b, col]) == 1.0, "CIV6 (Water Park): 1 Gold maintenance"
    t0 = s6._seat_amenity(row)[0][b, col].clone()
    s6._d_amenity[wp] = 12.0   # amplified past the tier steps, so the read must show
    s6._eff_version += 1
    assert int(s6._seat_amenity(row)[0][b, col]) != int(t0), "the district's own amenity is read"
    s6.district_pillaged[b, a_t] = True
    s6._eff_version += 1
    assert int(s6._seat_amenity(row)[0][b, col]) == int(t0), "a pillaged district's amenity is dark"
    s6._d_amenity[wp] = 1.0

    # the Preserve's housing comes off the appeal band, not the catalog column
    s7 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    _, hp0 = s7._seat_housing(row)
    _put(s7, b, row, col, pres, a_t)
    for t in s7.neigh[a_t].tolist():
        if t >= 0:
            s7.appeal_base[b, t] = s7.appeal_base[b, t] + 4
    s7._eff_version += 1
    band = 0
    ap = int(s7._tile_appeal()[b, a_t])
    for k, cut in enumerate(s7._appeal_bands):
        if ap >= cut:
            band = k
            break
    else:
        band = len(s7._appeal_bands)
    _, hp1 = s7._seat_housing(row)
    assert float(hp1[b, col] - hp0[b, col]) == float(s7._preserve_housing[band]), \
        "CIV6 (Preserve): housing by the appeal of its own tile"
    print("housing + amenity ok")

    # --- 6) what the seat gets: titles, loyalty, favor, influence, spies ---
    s8 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    bidx = torch.tensor([b], dtype=torch.long)
    cidx = torch.tensor([col], dtype=torch.long)
    l0 = float(s8._standing_loyalty(row, bidx, cidx)[0])
    assert int(s8._granted_titles(row)[b]) == 0
    _put(s8, b, row, col, gp, a_t)
    # CIV6 (Government Plaza): "+8 Loyalty to this city", "Awards +1 Governor
    # Title", and every building in it awards one more.
    assert float(s8._standing_loyalty(row, bidx, cidx)[0]) - l0 == 8.0
    assert int(s8._granted_titles(row)[b]) == 1
    hall = _bidx(s8, rj, "ANCESTRAL_HALL")
    s8.city_bldg[b, row, col, hall] = True
    s8._eff_version += 1
    assert int(s8._granted_titles(row)[b]) == 2, "a Plaza building awards one more"
    s8.district_pillaged[b, a_t] = True
    s8._eff_version += 1
    assert int(s8._granted_titles(row)[b]) == 0, "a pillaged Plaza pays none of them"
    assert float(s8._standing_loyalty(row, bidx, cidx)[0]) == l0

    s9 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    _put(s9, b, row, col, gp, a_t)
    ac = _bidx(s9, rj, "AUDIENCE_CHAMBER")
    s9.city_bldg[b, row, col, ac] = True
    s9._eff_version += 1
    # CIV6 (Audience Chamber): "-2 Loyalty in Cities without Governors."
    assert float(s9._ungoverned_loyalty(row)[b]) == -2.0
    ia = _bidx(s9, rj, "INTELLIGENCE_AGENCY")
    s9.city_bldg[b, row, col, ia] = True
    s9._eff_version += 1
    # CIV6 (Intelligence Agency): "+1 Spy and Spy capacity."
    assert int(s9._seat_building_sum(row, s9._b_spy_capacity)[b]) == 1

    _put(s9, b, row, col, dq, b_t)
    fm = _bidx(s9, rj, "FOREIGN_MINISTRY")
    cons = _bidx(s9, rj, "CONSULATE")
    s9.city_bldg[b, row, col, fm] = True
    s9.city_bldg[b, row, col, cons] = True
    s9._eff_version += 1
    # CIV6 (Foreign Ministry): "+3 Diplomatic Favor per turn"; (Consulate)
    # "+2 Influence Points per turn."
    assert float(s9._seat_building_sum(row, s9._b_favor)[b]) == 3.0
    assert float(s9._seat_building_sum(row, s9._b_influence)[b]) == 2.0
    # CIV6 (Diplomatic Quarter): "Enemy Spies operate at 2 levels below normal",
    # and (Consulate) "one level lower when targeting this city".
    assert s9._counter_levels(b, row, col) == 3
    s9.district_pillaged[b, b_t] = True
    s9._eff_version += 1
    assert s9._counter_levels(b, row, col) == 0, "a pillaged Quarter takes its Consulate with it"
    print("seat terms ok")

    # --- 7) the Hydroelectric Dam's renewable supply -----------------------
    s10 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    hyd = _bidx(s10, rj, "HYDROELECTRIC_DAM")
    load = next(i for i in range(s10.NB) if float(s10._b_power[i]) > 0)
    _put(s10, b, row, col, dam, a_t)
    _put(s10, b, row, col, int(s10._b_req_district[load]), b_t)
    s10.city_bldg[b, row, col, load] = True
    s10.city_bldg[b, row, col, hyd] = True
    s10._eff_version += 1
    dem, sup, _ = s10._city_power_need(row)
    assert float(dem[b, col]) > 0, "the lane needs a load before a supply is asked"
    # CIV6 (Hydroelectric Dam): "Provides 6 Power to the city."
    assert float(sup[b, col]) == float(rj["buildings"][hyd]["powerSupply"]) == 6.0
    s10.district_pillaged[b, a_t] = True
    s10._eff_version += 1
    assert float(s10._city_power_need(row)[1][b, col]) == 0.0, "a pillaged Dam supplies nothing"
    print("power ok")

    # --- 8) the flood shield, and the mission that breaks it ---------------
    s11 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    reach = torch.zeros(s11.B, s11.T, dtype=torch.bool)
    reach[b, a_t] = True
    assert not bool(s11._river_shielded(reach)[b])
    _put(s11, b, row, col, dam, a_t)
    # CIV6 (Dam): "Prevents damage from Floods on this River."
    assert bool(s11._river_shielded(reach)[b])
    s11.district_pillaged[b, a_t] = True
    assert not bool(s11._river_shielded(reach)[b]), "a pillaged Dam shields nothing"
    assert s11._spy_m_breach >= 0, "BREACH_DAM must have a mission column"
    print("flood shield ok")

    # --- 9) appeal, the Grove, and the unowned bomb ------------------------
    s12 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    near = next(int(t) for t in s12.neigh[a_t].tolist() if t >= 0)
    ap0 = int(s12._tile_appeal()[b, near])
    _put(s12, b, row, col, dam, a_t)
    assert int(s12._tile_appeal()[b, near]) - ap0 == 1, "a Dam is +1 to its neighbours"
    s12.district[b, a_t] = iz
    s12._eff_version += 1
    assert int(s12._tile_appeal()[b, near]) - ap0 == -1, "an Industrial Zone -1"

    s13 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    grove = _bidx(s13, rj, "GROVE")
    _put(s13, b, row, col, pres, a_t)
    s13.city_bldg[b, row, col, grove] = True
    for t in s13.neigh[a_t].tolist():
        if t >= 0:
            s13.improvement[b, t] = -1
            for nn in s13.neigh[t].tolist():
                if nn >= 0:
                    s13.appeal_base[b, nn] = s13.appeal_base[b, nn] + 4
    s13._eff_version += 1
    plane = s13._preserve_plane(row)
    assert plane is not None, "a Grove over a Preserve must build a plane"
    gy = rj["buildings"][grove]["appealYields"]  # [[breathtaking], [charming]]
    tgt2 = next(int(t) for t in s13.neigh[a_t].tolist() if t >= 0)
    top = int(s13._tile_appeal()[b, tgt2]) >= s13._appeal_bands[0]
    want = gy[0] if top else gy[1]
    assert [float(x) for x in plane[b, tgt2].tolist()] == [float(x) for x in want], \
        "CIV6 (Grove): the band's row, and the two bands do not stack"
    s13.improvement[b, tgt2] = 0
    s13._eff_version += 1
    assert float(s13._preserve_plane(row)[b, tgt2].abs().sum()) == 0.0, \
        "CIV6 (Grove): adjacent UNIMPROVED tiles only"

    s14 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    ring = [int(t) for t in s14.neigh[a_t].tolist() if t >= 0]
    s14.tile_seat[b, ring[0]] = -1
    s14.tile_city[b, ring[0]] = -1
    s14.tile_seat[b, ring[1]] = row + 1 if s14.n_majors > 1 else 200
    s14.district[b, ring[0]] = -1
    s14.district[b, ring[1]] = -1
    s14._tile_owner_ver += 1
    s14._eff_version += 1
    theirs = int(s14.tile_seat[b, ring[1]])
    s14._culture_bomb(row, torch.tensor([b]), torch.tensor([a_t]), torch.tensor([col]),
                      unowned_only=True)
    # CIV6 (Preserve): "Initiate a Culture Bomb on adjacent UNOWNED tiles."
    assert int(s14.tile_seat[b, ring[0]]) == row, "the unowned tile annexes"
    assert int(s14.tile_seat[b, ring[1]]) == theirs, "a rival keeps his"
    print("appeal + grove + bomb ok")

    # --- 10) the government-tier gate --------------------------------------
    s15 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    _put(s15, b, row, col, gp, a_t)
    hall = _bidx(s15, rj, "ANCESTRAL_HALL")
    assert int(s15._b_gov_tier[hall]) == 1, "a tier-1 government building"
    s15.civ_civics[b, row, :] = False
    s15._eff_version += 1
    assert not bool(s15._seat_buildable(row)[b, col, hall]), "a Chiefdom is tier 0"
    gcv = {g["id"]: g for g in rj["governments"]}
    tier1 = next(g for g in rj["governments"] if int(g["tier"]) == 1)
    s15.civ_civics[b, row, int(tier1["unlockCivic"])] = True
    s15._eff_version += 1
    assert int(s15._adopted_gov_tier(s15.civ_civics[:, row])[b]) >= 1
    assert bool(s15._seat_buildable(row)[b, col, hall]), "a tier-1 government opens it"
    assert gcv["CHIEFDOM"]["tier"] == 0
    print("gov tier ok")

    # --- 11) a REPEATABLE district is counted per INSTANCE, not per registry --
    # The registry keeps ONE tile per (city, type), so a boost that asks for
    # two of a repeatable district cannot be answered from it. The Dam and the
    # Canal are repeatable for the same reason the Neighborhood is.
    rep = [i for i, d in enumerate(rj["districts"]) if d["allowMultiple"]]
    assert dam in rep and canal in rep, "the Dam and Canal are repeatable"
    brow = next((x for x in rj["boosts"]
                 if x["kind"] == "district" and x["dtype"] in rep and x["count"] >= 2), None)
    if brow is None:
        print("repeatable boost SKIPPED (no boost row names a repeatable district)")
    else:
        s16 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
        di = int(brow["dtype"])
        ctr16 = int(s16.city_center[b, row, col])
        spots = [int(t) for t in (s16.pair_dist[ctr16] <= 3).nonzero().reshape(-1).tolist()
                 if int(s16.centre_slot_at[b, t]) < 0 and int(s16.district[b, t]) < 0][:int(brow["count"])]
        assert len(spots) == int(brow["count"]), "not enough free tiles for the lane"
        for t_i in spots:
            # every instance stands in the SAME city, which is what the
            # registry cannot represent
            _put(s16, b, row, col, di, t_i)
        tgt = s16.civ_tech_boosted if brow["target"] == "tech" else s16.civ_civic_boosted
        assert not bool(tgt[b, row, int(brow["idx"])]), "the lane must start unboosted"
        s16._detect_seat_boosts(row, torch.ones(s16.B, dtype=torch.bool, device=s16.device))
        assert bool(tgt[b, row, int(brow["idx"])]), (
            f"{brow['count']} of district {di} in ONE city must fire the boost — "
            "the registry holds one tile per type, so this counts off the tile plane")
        print(f"repeatable boost ok ({brow['count']}x district {di} in one city)")

    print("BATTERY OK districts_new")


if __name__ == "__main__":
    main()
