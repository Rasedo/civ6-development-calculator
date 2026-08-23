"""National parks, shipwrecks and museum theming — the GPU halves.

None of this is gate-reachable: the Archaeologist waits on NATURAL_HISTORY
(an Industrial civic) and the Naturalist on CONSERVATION (a Modern one), and
a driven 250-turn game reaches neither. So the semantics are pinned directly
on the tensors here, turn-exact with the TS contract (cpu/core/units.ts
naturalistPark / archaeologistExcavate, cpu/core/city.ts parkAmenities +
seatTourism, cpu/data/greatPeople.ts museumThemed).

Proven here:
  * the exported constants: park min appeal 2, owner amenities 2, four other
    cities, and the theming multiplier;
  * the new planes are _MUTABLE, long, and ride snapshot/restore;
  * `_park_cluster` is the hex rhombus — a pair plus the two tiles adjacent
    to BOTH, sorted, and empty for a non-adjacent pair;
  * `_park_cluster_legal` refuses a built-on tile, a two-city cluster and a
    tile below Charming;
  * `_do_park` writes the ANCHOR into four tiles and consumes the Naturalist;
  * a park pays TOURISM equal to the total appeal of its tiles, and amenities
    2 / 1-to-four;
  * `_do_excavate` works an antiquity site AND a shipwreck, carries the
    provenance into the museum slot, clears the dig and spends the charge;
  * `_museum_themed` wants one era, three civilizations and every slot full,
    and a themed museum DOUBLES artifact tourism.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, fixture_paths, FIXTURES
from core.engine import _MUTABLE
from warmup import settle_all

PLANES = ("antiquity_era", "antiquity_seat", "shipwreck", "shipwreck_era",
          "shipwreck_seat", "park", "city_artifact_era", "city_artifact_seat")


def main() -> None:
    rules = load_rules()
    rj = json.loads((FIXTURES / "rules.json").read_text(encoding="utf-8"))
    paths = fixture_paths()
    assert paths, "no fixtures — run `npm run seed && npm run export` first"

    # --- 1) the exported constants and the plane contract ------------------
    ri = rj["improvements"]
    assert ri["parkMinAppeal"] == 2, "Charming is appeal 2"
    assert ri["parkAmenitiesOwner"] == 2, "NATIONAL_PARK_AMENITIES_OWNING_CITY"
    assert ri["parkAmenitiesNear"] == 1
    assert ri["parkAmenityCities"] == 4, "NATIONAL_PARK_NUM_OTHER_AMENITY_CITIES"
    assert rj["seats"]["themingMult"] == 2, "a themed museum doubles what it holds"
    assert ri["shipwreckCivic"] >= 0, "CULTURAL_HERITAGE must resolve or wrecks are unworkable"
    for _p in PLANES:
        assert _p in _MUTABLE, f"{_p} must be _MUTABLE — it rides snapshot/restore"

    sim = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    assert sim._naturalist_idx >= 0 and sim._archaeologist_idx >= 0
    assert sim._A_PARK >= 0 and sim._A_EXCAVATE >= 0, "both verbs must have columns"
    for _p in ("antiquity_era", "antiquity_seat", "shipwreck_era", "shipwreck_seat", "park"):
        t = getattr(sim, _p)
        assert t.shape == (sim.B, sim.T), f"{_p} shape"
        assert t.dtype == torch.long, f"{_p} dtype"
    assert sim.city_artifact_era.shape[-1] == sim._artifact_slots
    print("constants + planes ok")

    # --- 2) the rhombus ----------------------------------------------------
    anchor = int(sim.city_center[0, 0, 0])
    tc = torch.tensor([[anchor]], dtype=torch.long)
    quad = sim._park_cluster(tc)              # [1, 1, 6, 4]
    assert quad.shape == (1, 1, 6, 4)
    for d in range(6):
        q = quad[0, 0, d]
        if int(q[0]) < 0:
            continue                            # a map-edge pair has no rhombus
        assert len(set(q.tolist())) == 4, "four DISTINCT tiles"
        assert list(q.tolist()) == sorted(q.tolist()), "sorted, so the anchor is q[0]"
        assert anchor in q.tolist(), "the anchor is in its own cluster"
    print("rhombus ok")

    # --- 3) legality, the designation, and what a park pays ----------------
    s2 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    row = 1
    # ANCHOR OFF EVERY CENTRE: a rhombus touching a city centre is refused
    # (`foundCity` writes `tile.district = 'CITY_CENTER'` TS-side), so
    # anchoring on one would make this whole lane assert the wrong answer.
    _centre = s2.centre_slot_at[0]

    def _clean(anchor: int):
        q = s2._park_cluster(torch.tensor([[anchor]], dtype=torch.long))[0, 0]
        for d in range(6):
            if int(q[d, 0]) >= 0 and all(int(_centre[int(t)]) < 0 for t in q[d].tolist()):
                return q, d
        return None

    ctr, found = -1, None
    for _t in s2.neigh[s2.neigh[int(s2.city_center[0, row, 0])].clamp(min=0)].reshape(-1).tolist():
        if _t < 0 or int(_centre[_t]) >= 0:
            continue
        found = _clean(_t)
        if found is not None:
            ctr = _t
            break
    assert found is not None, "no centre-free rhombus near this city — the lane cannot run"
    # MAKE the rhombus legal: this seat's ground, nothing built, appeal lifted
    # by planting woods around it.
    q_all, pick = found
    quad4 = q_all[pick]
    for t in quad4.tolist():
        s2.tile_seat[0, t] = row
        s2.tile_city[0, t] = s2.city_id[0, row, 0]
        s2.improvement[0, t] = -1
        s2.district[0, t] = -1
        s2.built_wonder[0, t] = -1
        # `appeal_base` is each tile's CONTRIBUTION to its neighbours; lifting
        # the ring is how a poke reaches Charming without a terrain rewrite.
        for nb in s2.neigh[t].tolist():
            if nb >= 0:
                s2.appeal_base[0, nb] = s2.appeal_base[0, nb] + 2
    s2._eff_version += 1
    ap = s2._tile_appeal()[0]
    assert all(int(ap[t]) >= s2._park_min_appeal for t in quad4.tolist()), "the cluster must be Charming+"
    legal = s2._park_cluster_legal(row, s2._park_cluster(torch.tensor([[ctr]], dtype=torch.long)))
    assert bool(legal[0, 0, pick]), "a prepared rhombus is legal"
    # a district on one tile refuses the whole cluster
    keep = int(s2.district[0, int(quad4[1])])
    s2.district[0, int(quad4[1])] = 0
    assert not bool(s2._park_cluster_legal(row, s2._park_cluster(torch.tensor([[ctr]], dtype=torch.long)))[0, 0, pick])
    s2.district[0, int(quad4[1])] = keep
    # ...and so does a CITY CENTRE, which `foundCity` writes into
    # `tile.district` TS-side and into the centre registry here
    keepc = int(s2.centre_slot_at[0, int(quad4[1])])
    s2.centre_slot_at[0, int(quad4[1])] = 0
    assert not bool(s2._park_cluster_legal(row, s2._park_cluster(torch.tensor([[ctr]], dtype=torch.long)))[0, 0, pick]), \
        "a rhombus touching a city centre must be refused"
    s2.centre_slot_at[0, int(quad4[1])] = keepc
    assert bool(s2._park_cluster_legal(row, s2._park_cluster(torch.tensor([[ctr]], dtype=torch.long)))[0, 0, pick])

    ok = s2._spawn_unit(row, torch.ones(s2.B, dtype=torch.bool),
                        torch.full((s2.B,), ctr, dtype=torch.long), s2._naturalist_idx)
    assert bool(ok[0]), "the Naturalist must land for this lane to prove anything"
    slot = int(((s2.major_unit_seat[0] == row) & s2.major_unit_alive[0]
                & (s2.major_unit_type[0] == s2._naturalist_idx)).long().argmax())
    tour_before = s2._tourism_of(
        s2.city_gw_writing[:, row], s2.city_gw_art[:, row], s2.city_gw_music[:, row],
        s2.city_alive[:, row], s2.tile_seat == row,
        s2._civ_era(s2.civ_techs[:, row], s2.civ_civics[:, row]),
        s2.city_relics[:, row], None, s2.city_artifacts[:, row],
        themed=s2._museum_themed(row))[0]
    s2._do_park(row, torch.ones(s2.B, dtype=torch.bool),
                torch.full((s2.B,), ctr, dtype=torch.long),
                torch.full((s2.B,), slot, dtype=torch.long))
    parked = (s2.park[0] >= 0).nonzero(as_tuple=True)[0].tolist()
    assert len(parked) == 4, f"a park is four tiles, got {len(parked)}"
    anchors = {int(s2.park[0, t]) for t in parked}
    assert anchors == {min(parked)}, "every tile names the cluster's lowest index"
    assert not bool(s2.major_unit_alive[0, slot]), "the Naturalist is CONSUMED"
    ap2 = s2._tile_appeal()[0]
    tour_after = s2._tourism_of(
        s2.city_gw_writing[:, row], s2.city_gw_art[:, row], s2.city_gw_music[:, row],
        s2.city_alive[:, row], s2.tile_seat == row,
        s2._civ_era(s2.civ_techs[:, row], s2.civ_civics[:, row]),
        s2.city_relics[:, row], None, s2.city_artifacts[:, row],
        themed=s2._museum_themed(row))[0]
    want = sum(int(ap2[t]) for t in parked)
    assert int(tour_after - tour_before) == want, f"park tourism = total appeal ({want}), got {int(tour_after - tour_before)}"
    amen = s2._park_amenities(row)[0]
    assert float(amen.sum()) >= s2._park_amen_owner, "the owning city banks its two amenities"
    print("park designation + payouts ok")

    # --- 4) the two digs ---------------------------------------------------
    s3 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    row = 0
    site = int(s3.city_center[0, row, 0])
    site = next(t for t in s3.neigh[site].tolist() if t >= 0 and not bool(s3.water[0, t]))
    s3.tile_seat[0, site] = row
    s3.antiquity[0, site] = True
    s3.antiquity_era[0, site] = 3
    s3.antiquity_seat[0, site] = 2
    s3.city_bldg[0, row, 0, s3._artifact_bidx] = True
    assert bool(s3._museum_room(row)[0]), "a free slot must exist for the find to land"
    ok = s3._spawn_unit(row, torch.ones(s3.B, dtype=torch.bool),
                        torch.full((s3.B,), site, dtype=torch.long), s3._archaeologist_idx)
    assert bool(ok[0])
    slot = int(((s3.major_unit_seat[0] == row) & s3.major_unit_alive[0]
                & (s3.major_unit_type[0] == s3._archaeologist_idx)).long().argmax())
    ch0 = int(s3.major_unit_charges[0, slot]) if hasattr(s3, "major_unit_charges") else int(s3.unit_charges[0, s3._seat_slot_map(row)[0, 0]])
    assert bool(s3._excavate_ok(row, torch.tensor([[site]]), torch.tensor([[s3._archaeologist_idx]]),
                                torch.tensor([[ch0]]))[0, 0]), "the column must be open on the dig"
    s3._do_excavate(row, torch.ones(s3.B, dtype=torch.bool),
                    torch.full((s3.B,), site, dtype=torch.long),
                    torch.full((s3.B,), slot, dtype=torch.long))
    assert int(s3.city_artifacts[0, row, 0]) == 1, "the find lands in the museum"
    assert int(s3.city_artifact_era[0, row, 0, 0]) == 3, "and carries its era"
    assert int(s3.city_artifact_seat[0, row, 0, 0]) == 2, "...and its civilization"
    assert not bool(s3.antiquity[0, site]), "the dig is spent"
    assert int(s3.antiquity_era[0, site]) == -1, "its provenance goes with it"

    # a WRECK is the same verb over water, once the civic reveals it
    wreck = next((t for t in range(s3.T) if bool(s3.water[0, t])), -1)
    assert wreck >= 0, "the fixture must hold water for this half"
    s3.shipwreck[0, wreck] = True
    s3.shipwreck_era[0, wreck] = 1
    s3.shipwreck_seat[0, wreck] = 1
    civ_i = s3._shipwreck_civic
    s3.civ_civics[0, row, civ_i] = False
    assert not bool(s3._dig_here(row, torch.tensor([[wreck]]))[0, 0]), "no civic, no wreck to work"
    s3.civ_civics[0, row, civ_i] = True
    assert bool(s3._dig_here(row, torch.tensor([[wreck]]))[0, 0]), "CULTURAL_HERITAGE reveals it"
    print("digs ok")

    # --- 5) theming --------------------------------------------------------
    s4 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    row, n = 0, s4._artifact_slots
    s4.city_artifacts[0, row, 0] = n
    for i in range(n):
        s4.city_artifact_era[0, row, 0, i] = 2
        s4.city_artifact_seat[0, row, 0, i] = i
    assert bool(s4._museum_themed(row)[0, 0]), "one era, three civilizations, every slot"
    s4.city_artifact_seat[0, row, 0, 1] = 0  # a repeated civilization
    assert not bool(s4._museum_themed(row)[0, 0])
    s4.city_artifact_seat[0, row, 0, 1] = 1
    s4.city_artifact_era[0, row, 0, 1] = 5   # a mixed era
    assert not bool(s4._museum_themed(row)[0, 0])
    s4.city_artifact_era[0, row, 0, 1] = 2
    s4.city_artifacts[0, row, 0] = n - 1     # an empty slot
    assert not bool(s4._museum_themed(row)[0, 0])
    s4.city_artifacts[0, row, 0] = n
    own = s4.tile_seat == row
    era = s4._civ_era(s4.civ_techs[:, row], s4.civ_civics[:, row])
    t_plain = s4._tourism_of(s4.city_gw_writing[:, row], s4.city_gw_art[:, row], s4.city_gw_music[:, row],
                             s4.city_alive[:, row], own, era, s4.city_relics[:, row], None,
                             s4.city_artifacts[:, row], themed=None)[0]
    t_themed = s4._tourism_of(s4.city_gw_writing[:, row], s4.city_gw_art[:, row], s4.city_gw_music[:, row],
                              s4.city_alive[:, row], own, era, s4.city_relics[:, row], None,
                              s4.city_artifacts[:, row], themed=s4._museum_themed(row))[0]
    assert int(t_themed - t_plain) == s4._artifact_tourism * n, "theming DOUBLES the museum's tourism"
    print("theming ok")

    # --- 6) snapshot/restore ----------------------------------------------
    s5 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    snap = s5.snapshot()
    s5.park[0, 0] = 7
    s5.shipwreck[0, 0] = True
    s5.city_artifact_era[0, 0, 0, 0] = 4
    s5.restore(snap)
    assert int(s5.park[0, 0]) == -1 and not bool(s5.shipwreck[0, 0])
    assert int(s5.city_artifact_era[0, 0, 0, 0]) == -1
    print("snapshot ok")

    # --- the district and outpost appeal terms ----------------------------
    # CIV6 ("Appeal"): +1 per adjacent Holy Site / Theater Square /
    # Entertainment Complex, -1 per adjacent barbarian outpost.
    s6 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    good = [i for i, v in enumerate(s6._appeal_adj.tolist()) if v > 0]
    bad = [i for i, v in enumerate(s6._appeal_adj.tolist()) if v < 0]
    assert good, "no district raises appeal — the catalog column is empty"
    mid = int(s6.T // 2)
    nb = [x for x in s6.neigh[mid].tolist() if x >= 0]
    assert len(nb) >= 2, "need a tile with neighbours"
    s6.district[0, :] = -1
    s6.camp_tile[0, :] = -1
    s6._eff_version += 1
    base = int(s6._tile_appeal()[0, mid])
    s6.district[0, nb[0]] = good[0]
    s6._eff_version += 1
    assert int(s6._tile_appeal()[0, mid]) == base + 1, "an adjacent good district must add +1"
    if bad:
        s6.district[0, nb[1]] = bad[0]
        s6._eff_version += 1
        assert int(s6._tile_appeal()[0, mid]) == base, "a bad district must cancel it, cumulatively"
        s6.district[0, nb[1]] = -1
        s6._eff_version += 1
    # an OUTPOST on a neighbour costs 1, and the cache sees the camp write
    s6.camp_tile[0, 0] = nb[1]
    s6._eff_version += 1
    assert int(s6._tile_appeal()[0, mid]) == base, "an adjacent outpost must subtract 1"
    far = next((t for t in range(s6.T) if t != mid and nb[1] not in s6.neigh[t].tolist()), None)
    if far is not None:
        before_far = int(s6._tile_appeal()[0, far])
        s6.camp_tile[0, 0] = -1
        s6._eff_version += 1
        assert int(s6._tile_appeal()[0, far]) == before_far, "a distant tile must not feel the outpost"
    print("  appeal district + outpost terms OK")

    print("parks_test OK — constants + planes, the rhombus, designation with tourism and "
          "amenities, both digs with provenance, theming, appeal terms, snapshot round-trip")


if __name__ == "__main__":
    main()
