"""SKI RESORT — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/ski_resort_test.py

The TS twin is tests/cpu/map/ski-resort.test.ts.

CIV6 (Expansion2_Improvements.xml, IMPROVEMENT_SKI_RESORT): "Provides +4
Tourism. Provides an Amenity. Can only be built on a Mountain. Cannot be built
adjacent to another Ski Resort. Cannot be pillaged, worked or removed."
PrereqCivic CIVIC_PROFESSIONAL_SPORTS, UNIT_BUILDER, BuildOnAdjacentPlot,
SameAdjacentValid false, Workable false, SKI_RESORT_AMENITY 1,
Improvement_Tourism TOURISMSOURCE_APPEAL.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, fixture_paths  # noqa: E402
from core.simbase import FIXTURES  # noqa: E402
from warmup import warm_base, opened  # noqa: E402

B0 = 0
RJ = json.loads((FIXTURES / "rules.json").read_text())
IIDS = RJ["improvements"]["ids"]
K = IIDS.index("SKI_RESORT")


def build(path) -> BatchSim:
    return warm_base(str(path), lambda: opened(load_rules(), path))


def _builder_beside_mountain(sim):
    """A row-0 Builder with three charges on a land tile beside exactly one
    bare mountain — the others around it improved — every tile row 0's.
    Answers (slot, rank, the tile it stands on, the mountain)."""
    for mt in sim.tile_mountain[B0].nonzero().flatten().tolist():
        if int(sim.feat_id[B0, mt]) >= 0 or bool(sim.volcano_at[B0, mt]):
            continue
        nb = [int(x) for x in sim.neigh[mt].tolist()
              if x >= 0 and not bool(sim.water[B0, x]) and bool(sim.passable[B0, x])]
        if nb:
            break
    else:
        raise AssertionError("this fixture carries no bare mountain beside land")
    here = nb[0]
    for x in sim.neigh[here].tolist():
        if x >= 0 and x != mt and bool(sim.tile_mountain[B0, x]) and int(sim.improvement[B0, x]) < 0:
            sim.improvement[B0, x] = sim.TUNNEL
    for t in [mt, here] + [int(x) for x in sim.neigh[mt].tolist() if x >= 0]:
        sim.tile_seat[B0, t] = 0
    lo = sim.POOL_LO["major"]
    for v in range(sim.major_unit_alive.shape[1]):
        if not bool(sim.major_unit_alive[B0, v]) or int(sim.major_unit_seat[B0, v]) != 0:
            continue
        was = int(sim.major_unit_tile[B0, v])
        for plane in (sim.military_at, sim.civilian_at, sim.support_at, sim.embarked_at):
            if int(plane[B0, was]) == v + lo:
                plane[B0, was] = -1
        sim.major_unit_type[B0, v] = sim._builder_idx
        sim.major_unit_mp[B0, v] = float(sim._type_moves[sim._builder_idx])
        sim.major_unit_hp[B0, v] = 100
        sim.major_unit_charges[B0, v] = 3
        sim.major_unit_tile[B0, v] = here
        sim.civilian_at[B0, here] = v + lo
        sim._eff_version += 1
        sim._gen_ver += 1
        sim._tile_owner_ver += 1
        smap = sim._seat_slot_map(0)[0]
        return v, int((smap == v + lo).nonzero(as_tuple=True)[0][0]), here, mt
    raise AssertionError("row 0 holds no live unit to retype")


def test_the_wire(rules, path) -> None:
    sim = build(path)
    assert K == 39, "appended after the Offshore Wind Farm, so no earlier column moved"
    assert sim._imp_adj_plot[K], "built on an ADJACENT plot"
    assert sim._imp_no_adj_same[K], "SameAdjacentValid false"
    assert bool(sim._imp_unwork[K + 1]), "Workable false"
    assert sim._imp_amenity[K] == 1, "SKI_RESORT_AMENITY 1"
    assert K in sim._imp_tour_appeal, "TOURISMSOURCE_APPEAL"
    assert bool(sim._imp_no_pillage[K]) and sim._imp_disaster_ok[K]
    assert not sim._imp_outside[K] and not bool(sim._imp_portal[K]) and not sim._imp_eng[K]
    assert int(sim._imp_unlock[K]) < 0 and int(sim._imp_unlock_civic[K]) >= 0, "a civic opens it"
    print("  1 the wire OK — a Builder row on an adjacent owned mountain, never beside its kind")


def test_the_mask_and_the_applier(rules, path) -> None:
    sim = build(path)
    col = int(sim._A_IMP[K])
    slot, rank, here, mt = _builder_beside_mountain(sim)
    civic = int(sim._imp_unlock_civic[K])
    sim.civ_civics[B0, 0, civic] = False
    sim._eff_version += 1
    assert not bool(sim._seat_unit_mask(0)[0, rank, col]), "offered before Professional Sports"
    sim.civ_civics[B0, 0, civic] = True
    sim._eff_version += 1
    assert bool(sim._seat_unit_mask(0)[0, rank, col]), "a Builder beside an owned bare mountain"
    # a Ski Resort beside the mountain shuts it
    other = [int(x) for x in sim.neigh[mt].tolist() if x >= 0 and x != here][0]
    was = int(sim.improvement[B0, other])
    sim.improvement[B0, other] = K
    sim._eff_version += 1
    assert not bool(sim._seat_unit_mask(0)[0, rank, col]), "offered beside another Ski Resort"
    sim.improvement[B0, other] = was
    # another seat's mountain is nobody's to improve from here
    sim.tile_seat[B0, mt] = -1
    sim._eff_version += 1
    sim._tile_owner_ver += 1
    assert not bool(sim._seat_unit_mask(0)[0, rank, col]), "offered on an unowned mountain"
    sim.tile_seat[B0, mt] = 0
    sim._eff_version += 1
    sim._tile_owner_ver += 1

    acts = torch.full((1, sim._seat_slot_map(0)[0].shape[0]), -1, dtype=torch.long)
    acts[0, rank] = col
    sim.seat_ext[B0, 0] = True
    sim._apply_seat_unit_actions(0, acts)
    assert int(sim.improvement[B0, mt]) == K, "the applier did not lay it on the mountain"
    assert int(sim.improvement[B0, here]) < 0, "nothing is laid underfoot"
    assert int(sim.major_unit_charges[B0, slot]) == 2, "one charge spent"
    print("  2 the build OK — after Professional Sports, onto the owned mountain beside it")


def test_amenity_tourism_and_work(rules, path) -> None:
    sim = build(path)
    r = 0
    sl = sim.city_slot_at(r)
    owned = (sl[B0] >= 0).nonzero().flatten().tolist()
    owned = [t for t in owned if int(sim.improvement[B0, t]) < 0 and int(sim.centre_slot_at[B0, t]) < 0]
    assert owned, "row 0's city holds no bare plot"
    ap = sim._tile_appeal()[B0]
    t = max(owned, key=lambda x: int(ap[x]))   # a plot whose Appeal pays
    assert int(ap[t]) > 0, "row 0's city holds no plot of positive Appeal"
    c = int(sl[B0, t])
    a0 = sim._improvement_amenities(r)[B0, c].item()
    own = sim.tile_seat == r
    era = sim._civ_era(sim.civ_techs[:, r], sim.civ_civics[:, r])
    gw = torch.zeros(sim.B, dtype=torch.long)
    t0 = int(sim._tourism_of(gw, sim.city_alive[:, r], own, era)[B0])
    sim.improvement[B0, t] = K
    sim._eff_version += 1
    assert sim._improvement_amenities(r)[B0, c].item() - a0 == 1.0, "the owning city's Amenity"
    t1 = int(sim._tourism_of(gw, sim.city_alive[:, r], own, era)[B0])
    assert t1 - t0 == max(0, int(sim._tile_appeal()[B0, t])), "Tourism equal to the plot's Appeal"
    assert not bool(sim._work_ground(r)[B0, t]), "a citizen may work it"
    print(f"  3 the plot OK — +1 Amenity, +{t1 - t0} Tourism, unworked")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_the_wire(rules, path)
    test_the_mask_and_the_applier(rules, path)
    test_amenity_tourism_and_work(rules, path)
    print("BATTERY OK ski_resort")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
