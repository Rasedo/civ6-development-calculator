"""The Great Person CHANNEL clauses (AUDIT B-61r, batch A) — gate-unreachable.

    python tests/gpu/gp_channels_test.py

Seven persons whose page clause is a channel an existing composer reads; the
scripted rollout claims none of them in 250 turns, so each is forced here and
the exact twin is driven:

  Tesla / Paxton   a DISTRICT tile perm (`tile_gp_perm`): +3 regional reach,
                   +2 Production / +1 Amenity per regional building of that
                   district (`_seat_regional`)
  Breedlove        +25% Tourism on an international route (`_tourism_intl_pct`)
  Tata / Ibuka     +10 Tourism per complete Campus / Industrial Zone
  Kenzo Tange      a city's district adjacency as Tourism (`_gp_district_tourism`)
  Leif Erikson     hulls enter the Ocean and see one farther, land units do not
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, fixture_paths, FIXTURES
from warmup import settle_all

B0 = 0


def build(rules, path, steps: int = 8):
    sim = settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64))
    for _ in range(steps):
        sim.step()
    return sim


def put_district(sim, row: int, j: int, di: int, within: int = 2) -> int:
    """a COMPLETE district of catalog index `di` on a free plot this city owns,
    within `within` of its centre (the reach scene needs a close one)."""
    c = int(sim.city_center[B0, row, j])
    free = [t for t in range(sim.T)
            if int(sim.tile_seat[B0, t]) == row and int(sim.district[B0, t]) < 0
            and int(sim.built_wonder[B0, t]) < 0 and bool(sim.passable[B0, t])
            and int(sim.centre_slot_at[B0, t]) < 0 and int(sim.pair_dist[c, t]) <= within]
    assert free, "the city owns no free plot"
    t = free[0]
    sim.district[B0, t] = di
    sim.district_complete[B0, t] = True
    sim.district_pillaged[B0, t] = False
    sim.city_dist_tile[B0, row, j, di] = t
    sim._tile_owner_ver += 1
    sim._eff_version += 1
    return t


def main() -> None:
    rules = load_rules()
    R = json.loads((FIXTURES / "rules.json").read_text(encoding="utf-8"))
    bidx = {b["id"]: i for i, b in enumerate(R["buildings"])}
    uidx = {u["id"]: i for i, u in enumerate(R["units"])}
    sim = build(rules, fixture_paths()[0])
    if not sim.districts_on:
        print("gp_channels: districts off on this fixture — nothing to poke")
        return
    dcat = {d["id"]: i for i, d in enumerate(sim.districts_cat)}
    ones = torch.ones(sim.B, dtype=torch.bool)

    def col(run: str, name: str) -> int:
        if run == "perm":
            return sim._GP_PERM0 + sim._gp_perm_names.index(name)
        if run == "city":
            return sim._GP_CPERM0 + sim._gp_city_perm_names.index(name)
        return sim._GP_TPERM0 + sim._gp_tile_perm_names.index(name)

    def find_person(want: dict) -> tuple[int, int]:
        """the (class, queue position) whose row carries exactly these columns"""
        for cls in range(sim._gp_effects.shape[0]):
            for at in range(int(sim._gp_roster[cls])):
                row = sim._gp_effects[cls, at]
                if all(float(row[c]) == v for c, v in want.items()):
                    return cls, at
        raise AssertionError(f"no person carries {want}")

    def spend(cls: int, at: int, tile: int) -> None:
        """stand the person up and spend its one charge on `tile` — the
        applier's site legality is another poke's; this drives the SPEND."""
        u = int(sim._gp_class_unit[cls])
        t = torch.full((sim.B,), tile, dtype=torch.long)
        born = sim._spawn_unit(0, ones.clone(), t, u,
                               charges=torch.ones(sim.B, dtype=torch.long),
                               gp_at=torch.full((sim.B,), at, dtype=torch.long))
        assert bool(born.all()), "the person did not spawn"
        slot = getattr(sim, sim.POOL_NEXT["major"]) - 1 + sim.POOL_LO["major"]
        sim._gp_apply(0, ones.clone(), slot, t)
        sim._eff_version += 1

    cap = int(sim.city_center[B0, 0, 0])
    assert bool(sim.city_alive[B0, 0, 0]), "the fixture capital must be alive"

    # ---- 1. Tesla: the Industrial Zone's regional buildings, +2 Production
    iz = sim._iz_idx
    t_iz = put_district(sim, 0, 0, iz)
    sim.city_bldg[B0, 0, 0, bidx["FACTORY"]] = True
    sim._bldg_version += 1
    sim._eff_version += 1
    reg = sim._seat_regional(0)
    assert reg is not None, "a Factory is a regional building"
    p0 = float(reg[0][B0, 0, 1])
    assert p0 > 0, f"the Factory's own regional Production must reach the owning city: {p0}"
    tesla = find_person({col("tile", "regionalRange"): 3.0, col("tile", "regionalProduction"): 2.0})
    spend(*tesla, t_iz)
    assert sim.tile_gp_perm[B0, t_iz].tolist() == [3, 2, 0], sim.tile_gp_perm[B0, t_iz].tolist()
    p1 = float(sim._seat_regional(0)[0][B0, 0, 1])
    assert p1 == p0 + 2, f"Tesla's district must pay +2 Production per regional building: {p0} -> {p1}"
    # the +3 REACH: with the shared range pulled below the centre's distance,
    # the bonus alone brings the capital back into range
    _rr = sim._regional_range
    sim._regional_range = -1
    sim._eff_version += 1
    assert float(sim._seat_regional(0)[0][B0, 0, 1]) == p1, "a -1 range plus Tesla's 3 still reaches a centre within 2"
    sim.tile_gp_perm[B0, t_iz, 0] = 0
    sim._eff_version += 1
    reg_far = sim._seat_regional(0)
    assert reg_far is None or float(reg_far[0][B0, 0, 1]) == 0.0, "without the reach bonus a -1 range reaches nobody"
    sim.tile_gp_perm[B0, t_iz, 0] = 3
    sim._regional_range = _rr
    sim._eff_version += 1
    # a pillaged source is dark, extra and all
    sim.district_pillaged[B0, t_iz] = True
    sim._eff_version += 1
    reg_d = sim._seat_regional(0)
    assert reg_d is None or float(reg_d[0][B0, 0, 1]) == 0.0, "a pillaged Tesla district pays nothing"
    sim.district_pillaged[B0, t_iz] = False
    sim._eff_version += 1
    print(f"  1 Tesla OK — Factory regional Production {p0} -> {p1}, reach +3 reaches a centre a -1 range misses")

    # ---- 2. Paxton: the Entertainment Complex's regional buildings, +1 Amenity
    ec = dcat["ENTERTAINMENT_COMPLEX"]
    t_ec = put_district(sim, 0, 0, ec)
    sim.city_bldg[B0, 0, 0, bidx["ZOO"]] = True
    sim._bldg_version += 1
    sim._eff_version += 1
    a0 = float(sim._seat_regional(0)[1][B0, 0])
    assert a0 >= 1, f"the Zoo's regional Amenity must reach the owning city: {a0}"
    paxton = find_person({col("tile", "regionalRange"): 3.0, col("tile", "regionalAmenities"): 1.0})
    spend(*paxton, t_ec)
    assert sim.tile_gp_perm[B0, t_ec].tolist() == [3, 0, 1]
    a1 = float(sim._seat_regional(0)[1][B0, 0])
    assert a1 == a0 + 1, f"Paxton's district must pay +1 Amenity per regional building: {a0} -> {a1}"
    assert float(sim._seat_regional(0)[0][B0, 0, 1]) == p1, "Paxton moves no Production"
    print(f"  2 Paxton OK — Zoo regional Amenities {a0} -> {a1}")

    # ---- 3. Breedlove: +25% Tourism on an international route
    sim.seat_route_dseat[B0, 0, 0] = 1
    i0 = int(sim._tourism_intl_pct(0, 1)[B0])
    breedlove = find_person({col("perm", "tourismRouteBonus"): 25.0})
    spend(*breedlove, cap)
    assert float(sim._gp_perm(0, "tourismRouteBonus")[B0]) == 25.0
    i1 = int(sim._tourism_intl_pct(0, 1)[B0])
    assert i1 == i0 + 25, f"Breedlove: {i0} -> {i1}"
    sim.seat_route_dseat[B0, 0, 0] = -1
    assert int(sim._tourism_intl_pct(0, 1)[B0]) == i0 - int(rules.seats.get("tourismRoutePct", 25)), "no route, no bonus"
    print(f"  3 Breedlove OK — international percent {i0} -> {i1} on the route, the base without it")

    # ---- 4. Tata / Ibuka: +10 Tourism per complete Campus / Industrial Zone
    campus = sim._campus_idx
    t_c = put_district(sim, 0, 0, campus)
    assert int(sim._gp_district_tourism(0)[B0]) == 0
    tata = find_person({col("perm", "campusTourism"): 10.0})
    spend(*tata, t_c)
    d1 = int(sim._gp_district_tourism(0)[B0])
    assert d1 == 10, f"Tata: one Campus must pay 10, read {d1}"
    ibuka = find_person({col("perm", "izTourism"): 10.0})
    spend(*ibuka, t_iz)
    d2 = int(sim._gp_district_tourism(0)[B0])
    assert d2 == 20, f"Ibuka: the Industrial Zone adds 10, read {d2}"
    sim.district_pillaged[B0, t_c] = True
    sim._eff_version += 1
    assert int(sim._gp_district_tourism(0)[B0]) == 10, "a pillaged Campus is dark"
    sim.district_pillaged[B0, t_c] = False
    sim._eff_version += 1
    print("  4 Tata / Ibuka OK — 10 per Campus, 10 per Industrial Zone, dark when pillaged")

    # ---- 5. Kenzo Tange: this city's district adjacency as Tourism
    kenzo = find_person({col("city", "adjTourism"): 1.0})
    spend(*kenzo, cap)
    assert float(sim._gp_city_perm(0, "adjTourism")[B0, 0]) == 1.0
    want = 20
    pct = sim._gp_adj_tour_pct
    for di in (campus, iz, ec):
        yc = int(sim.districts_cat[di].get("adjYield", -1))
        if yc < 0 or pct[yc] == 0:
            continue
        t = int(sim.city_dist_tile[B0, 0, 0, di])
        adj = float(sim._district_adj_seat(0, di)[B0, t])
        want += int(torch.floor(torch.tensor(adj * pct[yc] / 100)))
    d3 = int(sim._gp_district_tourism(0)[B0])
    assert d3 == want, f"Kenzo Tange: expected {want} (20 + the adjacency shares), read {d3}"
    print(f"  5 Kenzo Tange OK — district tourism {d2} -> {d3} with the city's adjacency shares")

    # ---- 6. Leif Erikson: hulls enter the Ocean and see one farther
    galley = torch.tensor([uidx["GALLEY"]], dtype=torch.long)
    warrior = torch.tensor([uidx["WARRIOR"]], dtype=torch.long)
    zero = torch.zeros(1, dtype=torch.long)
    seat0 = torch.zeros(1, dtype=torch.long)
    s_g0 = int(sim._unit_sight(galley, zero, seat0)[0])
    s_w0 = int(sim._unit_sight(warrior, zero, seat0)[0])
    base_open = bool(sim._row_ocean_open(0)[B0])
    assert not bool(sim._row_ocean_open_naval(0)[B0]) or base_open
    leif = find_person({col("perm", "navalOcean"): 1.0, col("perm", "navalSight"): 1.0})
    spend(*leif, cap)
    assert bool(sim._row_ocean_open_naval(0)[B0]), "Leif: the hull's ocean gate opens"
    assert bool(sim._row_ocean_open(0)[B0]) == base_open, "the embarked plane keeps waiting for Cartography"
    assert bool(sim._ocean_open_leif(seat0)[0]) and not bool(sim._ocean_open_leif(torch.ones(1, dtype=torch.long))[0])
    assert int(sim._unit_sight(galley, zero, seat0)[0]) == s_g0 + 1, "a hull sees one farther"
    assert int(sim._unit_sight(warrior, zero, seat0)[0]) == s_w0, "a land unit does not"
    assert int(sim._unit_sight(galley, zero, torch.ones(1, dtype=torch.long))[0]) == s_g0, "another seat's hull does not"
    assert int(sim._unit_sight(galley, zero)[0]) == s_g0, "no seat named, no grant read"
    print(f"  6 Leif Erikson OK — ocean open for hulls (base {base_open}), galley sight {s_g0} -> {s_g0 + 1}")

    # ---- the planes ride snapshot/restore
    snap = sim.snapshot()
    sim.tile_gp_perm[B0, t_iz] = 0
    sim.restore(snap)
    assert sim.tile_gp_perm[B0, t_iz].tolist() == [3, 2, 0], "tile_gp_perm must be in _MUTABLE"
    print("gp_channels OK")


if __name__ == "__main__":
    main()
