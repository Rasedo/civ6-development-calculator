"""THE MAP'S TWO NEW ROWS AND THE WATER IMPROVEMENT — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/geothermal_test.py

The TS twin is tests/cpu/map/geothermal.test.ts.

CIV6, one sourced sentence each: (Geothermal Fissure) "+1 Science", "Campus
districts get +2 Science if adjacent", "Aqueduct districts adjacent to a
Geothermal Fissure provide 1 Amenity"; (Geothermal Plant) "May only be
constructed on a special terrain feature: the Geothermal Fissure"; (Dance of
the Aurora) "Holy Site districts get +1 Faith from adjacent Tundra tiles";
(Desert Folklore) the same from Desert, (Sacred Path) the same from
Rainforest; (Fishing Boats) a Builder improves the sea resource it stands on.

Proven here:
  * `_adj_src_count` counts the LIVE map for every source a belief may name,
    and the fixture reaches the Fissure;
  * a Geothermal Plant stands on a Fissure and on nothing else, in the mask
    AND in the applier — whose GROUND-ONLY arm the whole Solar/Wind/Geothermal
    family shares;
  * the Aqueduct's Amenity is `amount x adjacent Fissures`, dark while the
    district is pillaged and absent where no Fissure stands;
  * a pantheon's adjacency joins the sum INSIDE the floor, per seat;
  * a Builder standing on a sea resource places FISHING_BOATS, and none
    without the resource's tech.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all

B0, ROW = 0, 0
GEO_FID = 7          # FEAT_IDS: ..., ICE 6, GEOTHERMAL_FISSURE 7, VOLCANIC_SOIL 8
PLANT = 17           # IMPROVEMENT_IDS
BOATS = 18


def fresh(rules, path) -> BatchSim:
    return settle_all(BatchSim([load_fixture(path)], rules, device="cpu",
                               dtype=torch.float64))


def neigh_count(sim, on: torch.Tensor) -> torch.Tensor:
    """[B, T] hand-rolled: how many on-map neighbours answer `on`."""
    nb = sim.neigh
    return (on[:, nb.clamp(min=0)] & (nb >= 0).unsqueeze(0)).sum(dim=2)


def give(sim, row: int, k: int) -> None:
    """Research whatever improvement `k` waits on."""
    ut = int(sim._imp_unlock[k])
    if ut >= 0:
        sim.civ_techs[:, row, ut] = True
    sim._eff_version += 1


def own(sim, t: int, row: int = ROW) -> None:
    sim.tile_seat[B0, t] = row
    sim.tile_city[B0, t] = int(sim.city_id[B0, row, 0])
    sim._eff_version += 1


def build_at(sim, t: int, k: int, row: int = ROW) -> bool:
    """Spawn a Builder ON tile `t` and issue BUILD_<k> over the real order
    path. Returns whether the improvement landed."""
    slot = int(sim.unit_next[B0])
    sim._spawn_unit(row, torch.ones(sim.B, dtype=torch.bool),
                    torch.full((sim.B,), int(sim.city_center[B0, row, 0]), dtype=torch.long),
                    sim._builder_idx)
    # walk it onto the plot — a water plot needs the embarked plane, which is
    # what `_occ_set` reads to file the unit.
    old = int(sim.unit_tile[B0, slot])
    rows = torch.tensor([B0])
    sim._occ_clear(rows, torch.tensor([old]), torch.tensor([slot]))
    sim.unit_tile[B0, slot] = t
    sim.unit_emb[B0, slot] = bool(sim.water[B0, t])
    sim._occ_set(rows, torch.tensor([t]), torch.tensor([slot]))
    sim.unit_mp[B0, slot] = sim._mp_scale
    smap = sim._seat_slot_map(row)
    rank = int((smap[B0] == slot).nonzero()[0])
    act = torch.full(smap.shape, -1, dtype=torch.long)
    act[B0, rank] = sim._A_IMP[k]
    sim._apply_seat_unit_actions(row, act)
    return int(sim.improvement[B0, t]) == k


# ---------------------------------------------------------------------------


def test_source_counts(rules, path) -> None:
    sim = fresh(rules, path)
    assert sim._adj_src_feat and sim._adj_src_terr, "the source tables never loaded"
    hit = 0
    for src, fid in enumerate(sim._adj_src_feat):
        tid = sim._adj_src_terr[src]
        if fid < 0 and tid < 0:
            assert not bool(sim._adj_src_count(src).any()), \
                f"source {src} names neither a feature nor a terrain, yet counts"
            continue
        on = ((sim.feat_id == fid) & ~sim.feat_stripped) if fid >= 0 else (sim.terrain == tid)
        got = sim._adj_src_count(src)
        assert torch.equal(got, neigh_count(sim, on).to(got.dtype)), f"source {src} miscounts"
        hit += 1
    assert hit >= 4, f"only {hit} sources resolve to a feature or a terrain"
    fis = ((sim.feat_id == GEO_FID) & ~sim.feat_stripped)
    assert bool(fis.any()), "the generator placed no Geothermal Fissure — nothing here is reachable"
    print(f"  1 adjacency sources OK — {hit} live sources, {int(fis[B0].sum())} Fissures on the map")


def test_geothermal_plant(rules, path) -> None:
    sim = fresh(rules, path)
    assert sim._imp_req_feat[PLANT] == GEO_FID, "the Plant lost its feature clause"
    assert sim._imp_ground[PLANT], "the Plant is not a ground-only row"
    fis = ((sim.feat_id == GEO_FID) & ~sim.feat_stripped)
    ok = sim._imp_ground_ok(PLANT)
    assert bool(ok.any()), "no tile at all admits the Plant"
    assert not bool((ok & ~fis).any()), "the Plant is offered off a Fissure"
    # the applier's GROUND-ONLY arm, which the Solar Farm and Wind Farm share
    give(sim, ROW, PLANT)
    t = int(fis[B0].nonzero()[0])
    own(sim, t)
    assert build_at(sim, t, PLANT), "the Plant did not land on a Fissure"
    bare = int((~fis[B0] & ~sim.water[B0] & sim.passable[B0]
                & (sim.improvement[B0] < 0) & (sim.district[B0] < 0)
                & (sim.res_imp[B0] == -1)).nonzero()[0])
    own(sim, bare)
    assert not build_at(sim, bare, PLANT), "the Plant landed on bare ground"
    print("  2 Geothermal Plant OK — the mask and the applier both hold it to its Fissure")


def test_aqueduct_amenity(rules, path) -> None:
    sim = fresh(rules, path)
    aq = next(i for i, d in enumerate(sim.districts_cat) if d["id"] == "AQUEDUCT")
    src, amt = sim._d_amen_adj[aq]
    assert (src, amt) == (17, 1.0), f"the Aqueduct's amenity clause reads {(src, amt)}"
    assert sim._adj_src_feat[src] == GEO_FID, "that source is not the Geothermal Fissure"
    cnt = sim._adj_src_count(src)
    beside = int((cnt[B0] > 0).nonzero()[0])
    away = int(((cnt[B0] == 0) & (sim.district[B0] < 0)).nonzero()[0])

    def tier(at: int, pillaged: bool) -> int:
        sim.city_dist_tile[B0, ROW, 0, aq] = at
        sim.district[B0, at] = aq
        sim.district_complete[B0, at] = True
        sim.district_pillaged[B0, at] = pillaged
        sim._eff_version += 1
        return int(sim._seat_amenity(ROW)[0][B0, 0])

    base = tier(away, False)
    # the count and the amount are each proven above; a large amount is what
    # makes their PRODUCT visible in the tier the city lands in.
    sim._d_amen_adj[aq] = (src, -1000.0)
    assert tier(beside, False) == len(sim.rules.amenity_tiers) - 1, \
        "an Aqueduct beside a Fissure was paid nothing"
    assert tier(beside, True) == base, "a PILLAGED Aqueduct was paid"
    assert tier(away, False) == base, "an Aqueduct with no Fissure beside it was paid"
    print(f"  3 Aqueduct amenity OK — {int(cnt[B0, beside])} Fissure(s) beside it, dark while pillaged")


def test_pantheon_adjacency(rules, path) -> None:
    sim = fresh(rules, path)
    hs = next(i for i, d in enumerate(sim.districts_cat) if d["id"] == "HOLY_SITE")
    assert set(sim._bel_adj_srcs) == {hs}, \
        f"only the Holy Site takes a belief's adjacency, not {sorted(sim._bel_adj_srcs)}"
    pan = sim._bel["pan"]["distAdj"]           # [1 + rows, nDist, nSrc]
    for src in sim._bel_adj_srcs[hs]:
        # the ONE pantheon row that names this source, found by its own payload
        rows = (pan[:, hs, src] != 0).nonzero().flatten().tolist()
        assert len(rows) == 1, f"source {src} is named by pantheon rows {rows}"
        amt = float(pan[rows[0], hs, src])
        assert amt == 1.0, f"the sourced +1 moved to {amt}"
        sim.civ_pantheon[:, ROW] = rows[0] - 1  # the table carries a zero pad row
        sim.civ_follower[:, ROW] = -1
        sim.civ_founder[:, ROW] = -1
        sim._bel_version += 1
        sim._eff_version += 1
        raw = sim._district_adj_raw(hs, sim._adj_district_count().to(sim.dtype))
        want = torch.floor(raw + amt * sim._adj_src_count(src))
        got = sim._district_adj_seat(ROW, hs)
        assert torch.equal(got, want), f"source {src}: the belief did not ride inside the floor"
        assert bool((want > torch.floor(raw)).any()), f"source {src} reaches no tile on this map"
        # ...and a seat holding no pantheon is paid nothing
        sim.civ_pantheon[:, ROW] = -1
        sim._bel_version += 1
        sim._eff_version += 1
        assert torch.equal(sim._district_adj_seat(ROW, hs), torch.floor(raw))
    print(f"  4 pantheon adjacency OK — {len(sim._bel_adj_srcs[hs])} sources, each inside the floor")


def test_fishing_boats(rules, path) -> None:
    sim = fresh(rules, path)
    assert sim._imp_ids[BOATS] == "FISHING_BOATS", "the roster moved"
    assert sim._A_IMP[BOATS] >= 0, "the action head carries no BUILD verb for it"
    sea = ((sim.res_imp[B0] == BOATS) & sim.water[B0])
    assert bool(sea.any()), "no sea resource on this map — nothing here is reachable"
    t = int(sea.nonzero()[0])
    own(sim, t)
    assert not build_at(sim, t, BOATS), "the Boats landed without the resource's tech"
    give(sim, ROW, BOATS)
    assert build_at(sim, t, BOATS), "a Builder standing on the resource placed nothing"
    print(f"  5 Fishing Boats OK — placed on tile {t}, refused before its tech")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_source_counts(rules, path)
    test_geothermal_plant(rules, path)
    test_aqueduct_amenity(rules, path)
    test_pantheon_adjacency(rules, path)
    test_fishing_boats(rules, path)
    print("BATTERY OK geothermal")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
