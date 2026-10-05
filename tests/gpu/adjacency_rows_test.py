"""THE DISTRICT ADJACENCY ROWS AS THE GAME COUNTS THEM — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/adjacency_rows_test.py

The TS twin is tests/cpu/city/adjacency-rows.test.ts.

CIV6 (GameCore 0x365ae0, one Adjacency_YieldChanges row): OtherDistrictAdjacent
counts a neighbour of the district's own owner holding a complete, unpillaged
district; AdjacentDistrict a complete, unpillaged district of the type,
whoever owns it; AdjacentImprovement an unpillaged improvement; a resource
row the resource as the owner sees it; AdjacentTerrain the terrain alone.
The Industrial Zone's Lumber Mill and strategic-resource rows; Machu Picchu's
MODIFIER_PLAYER_CITIES_TERRAIN_ADJACENCY.

Proven here:
  * `_adj_district_count` drops a foreign or pillaged district, and
    `_adj_dtype_count` a pillaged one but never a foreign one;
  * the MINE source drops a pillaged Mine;
  * two Lumber Mills pay the Industrial Zone 1, an unseen Iron nothing, a
    seen one 1 (`_district_adj_base`, `_adj_hidden_cut`);
  * Machu Picchu held complete pays the Industrial Zone 1 per adjacent
    Mountain, a natural wonder's mountain among them.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import load_rules, fixture_paths
from warmup import opened, warm_base

B0, ROW = 0, 0


def fresh(rules, path):
    return warm_base(str(path), lambda: opened(rules, path), (), ())


def site(sim) -> tuple[int, list[int]]:
    """A land plot two or more from every centre with six land neighbours,
    those neighbours cleared and the lot owned by ROW."""
    nb = sim.neigh
    centres = (sim.centre_slot_at[B0] >= 0).nonzero().flatten().tolist()
    for t in range(sim.T):
        ns = nb[t].tolist()
        if min(ns) < 0 or bool(sim.water[B0, t]) or any(bool(sim.water[B0, n]) for n in ns):
            continue
        if any(int(sim.pair_dist[t, c]) < 3 for c in centres):
            continue
        for x in [t] + ns:
            sim.district[B0, x] = -1
            sim.district_complete[B0, x] = False
            sim.district_pillaged[B0, x] = False
            sim.improvement[B0, x] = -1
            sim.pillaged[B0, x] = False
            sim.res_id[B0, x] = -1
            sim.built_wonder[B0, x] = -1
            sim.built_wonder_complete[B0, x] = False
            sim.tile_mountain[B0, x] = False
            sim.nwonder[B0, x] = False
            sim.tile_seat[B0, x] = ROW
        sim._eff_version += 1
        return t, ns
    raise AssertionError("no inland plot on this map")


def test_district_owner(rules, path) -> None:
    sim = fresh(rules, path)
    t, ns = site(sim)
    ch = sim._commhub_idx
    n0 = ns[0]
    sim.district[B0, n0] = ch
    sim.district_complete[B0, n0] = True
    assert int(sim._adj_district_count()[B0, t]) == 1, "a live district of the owner is not counted"
    assert int(sim._adj_dtype_count(ch)[B0, t]) == 1
    sim.tile_seat[B0, n0] = 1
    assert int(sim._adj_district_count()[B0, t]) == 0, "a foreign district counts as OtherDistrictAdjacent"
    assert int(sim._adj_dtype_count(ch)[B0, t]) == 1, "AdjacentDistrict reads the owner"
    sim.tile_seat[B0, n0] = ROW
    sim.district_pillaged[B0, n0] = True
    assert int(sim._adj_district_count()[B0, t]) == 0, "a pillaged district counts"
    assert int(sim._adj_dtype_count(ch)[B0, t]) == 0, "a pillaged district counts as AdjacentDistrict"
    print("  1 district neighbours OK — the owner's live districts only; AdjacentDistrict any owner's live one")


def test_improvements_and_resources(rules, path) -> None:
    sim = fresh(rules, path)
    t, ns = site(sim)
    iz = sim._iz_idx
    mine = sim._adj_src_names.index("MINE")
    sim.improvement[B0, ns[1]] = sim._mine_iidx
    assert float(sim._adj_source_plane(mine)[B0, t]) == 1.0
    sim.pillaged[B0, ns[1]] = True
    assert float(sim._adj_source_plane(mine)[B0, t]) == 0.0, "a pillaged Mine counts"
    sim.improvement[B0, ns[1]] = -1
    sim.pillaged[B0, ns[1]] = False
    base0 = float(sim._district_adj_base(ROW, iz)[B0, t])
    sim.improvement[B0, ns[1]] = sim._lumber_iidx
    sim.improvement[B0, ns[2]] = sim._lumber_iidx
    base1 = float(sim._district_adj_base(ROW, iz)[B0, t])
    assert base1 == base0 + 1, f"two Lumber Mills pay {base1 - base0}, not 1"
    strat = [r for r in range(sim._strat_slot_of.numel())
             if int(sim._strat_slot_of[r]) >= 0 and int(sim._res_reveal_tech[r]) >= 0]
    ri = strat[0]
    tech = int(sim._res_reveal_tech[ri])
    sim.civ_techs[:, ROW, tech] = False
    sim.res_id[B0, ns[3]] = ri
    sim._eff_version += 1
    hid = float(sim._district_adj_base(ROW, iz)[B0, t])
    assert hid == base1, f"an unseen strategic pays {hid - base1}"
    sim.civ_techs[:, ROW, tech] = True
    sim._eff_version += 1
    seen = float(sim._district_adj_base(ROW, iz)[B0, t])
    assert seen == base1 + 1, f"a seen strategic pays {seen - base1}, not 1"
    print("  2 improvements and resources OK — a pillaged Mine 0, two Lumber Mills 1, unseen Iron 0, seen 1")


def test_machu_picchu(rules, path) -> None:
    sim = fresh(rules, path)
    t, ns = site(sim)
    iz = sim._iz_idx
    mtn = sim._adj_src_names.index("MOUNTAIN")
    w = int((sim._wond_dist_adj[:, iz, mtn] > 0).nonzero().flatten()[0])
    for n in ns[:3]:
        sim.tile_mountain[B0, n] = True
    sim.nwonder[B0, ns[2]] = True
    sim._eff_version += 1
    assert float(sim._adj_source_plane(mtn)[B0, t]) == 3.0, "a natural wonder's mountain is not a mountain"
    base0 = float(sim._district_adj_base(ROW, iz)[B0, t])
    sim.built_wonder[B0, ns[0]] = w
    sim.built_wonder_complete[B0, ns[0]] = True
    sim.city_wonder[B0, ROW, 0, w] = ns[0]
    sim._eff_version += 1
    base1 = float(sim._district_adj_base(ROW, iz)[B0, t])
    assert base1 == base0 + 3, f"Machu Picchu pays the Industrial Zone {base1 - base0} for 3 mountains"
    other = float(sim._district_adj_base(1, iz)[B0, t])
    sim.city_wonder[B0, ROW, 0, w] = -1
    sim._eff_version += 1
    assert other == float(sim._district_adj_base(1, iz)[B0, t]), "another seat takes the owner's wonder rule"
    print("  3 Machu Picchu OK — +1 per adjacent Mountain to its owner's Industrial Zone")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_district_owner(rules, path)
    test_improvements_and_resources(rules, path)
    test_machu_picchu(rules, path)
    print("BATTERY OK adjacency_rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
