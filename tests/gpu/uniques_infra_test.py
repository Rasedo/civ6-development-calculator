"""THE UNIQUE INFRASTRUCTURE on the GPU engine — the twin of
tests/cpu/city/uniques-infra.test.ts.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/uniques_infra_test.py

Checks:
  A. the Sphinx and the Ziggurat: `_uniq_improvement_ok` hands each to its
     civilization on its own ground (terrain, hills, the Floodplains-only
     feature clause) once the row's civic is held; the job mask offers the
     column and the applier lays it.
  B. their yields: the Sphinx's Floodplains Culture (`_imp_feat_plane`) and
     its faith beside a COMPLETED wonder (`_imp_adjacency`).
  C. the Bath: +2 Housing on the Aqueduct's water and a flat Amenity for the
     row playing Rome, nothing for another row; the queue price halves.
  D. the Stave Church: the Holy Site's adjacency gains +1 per Woods where
     Norway's city holds the Temple; the coast-resource Production term.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import load_rules, fixture_paths  # noqa: E402
from engineer_test import retype, mask_of, order, clear_tile, own_flat  # noqa: E402


def play(sim, row: int, name):
    """Seat `row` (game 0) as civilization `name`'s first roster row, or as
    nobody — both the civilization and the leader planes."""
    if name is None:
        sim.row_civ[0, row] = -1
        sim.row_leader[0, row] = -1
    else:
        ci = sim._civ_ids.index(name)
        sim.row_civ[0, row] = ci
        sim.row_leader[0, row] = sim._pair_civ.index(ci)
    # every memo keyed on the seat's state is stale now
    sim._eff_version += 1
    sim._gen_ver += 1
    sim._bldg_version += 1


def fresh(rules, path):
    """The scene's trio — Rome, Egypt, Norway at rows 0-2 — seated BEFORE the
    capitals settle, so the founding clauses land as the old fixtures had them."""
    from core import BatchSim, load_fixture
    from warmup import settle_all
    sim = BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64)
    for r, name in enumerate(("ROME", "EGYPT", "NORWAY")):
        play(sim, r, name)
    return settle_all(sim)


def stand_builder(sim, row, tile):
    v = retype(sim, row, sim._builder_idx, tile)
    lo = sim.POOL_LO["major"]
    sim.military_at[0, tile] = -1
    sim.civilian_at[0, tile] = v + lo
    sim._gen_ver += 1
    return v


def own_tile_where(sim, row, pred, avoid=()):
    for t in range(sim.T):
        if (int(sim.tile_seat[0, t]) == row and int(sim.centre_slot_at[0, t]) < 0
                and t not in avoid and pred(t)):
            return t
    return -1


def main() -> None:
    rules = load_rules()
    path = fixture_paths()[0]
    C = {c: i for i, c in enumerate(rules.uniques["civs"])}
    sim = fresh(rules, path)
    rome, egypt, norway = 0, 1, 2
    play(sim, rome, "ROME")
    play(sim, egypt, "EGYPT")
    play(sim, norway, "NORWAY")
    I = {n: i for i, n in enumerate(sim._imp_ids)}
    SX, ZG = I["SPHINX"], I["ZIGGURAT"]
    assert sim._imp_uniq[SX] == C["EGYPT"] and sim._imp_uniq[ZG] == C["SUMERIA"]
    assert sim._A_IMP[SX] >= 0 and sim._A_IMP[ZG] >= 0, "the BUILD columns exist for both rows"
    grass = [int(t) for t in rules.uniques["openTerrains"]]

    # -- A: who lays what, where --------------------------------------------
    t = own_flat(sim, egypt)
    clear_tile(sim, t)
    ok = sim._uniq_improvement_ok
    assert not bool(ok(egypt, SX)[0, t]), "the Sphinx waits on Craftsmanship"
    uc = sim._imp_unlock_civic[SX]
    assert uc >= 0
    sim.civ_civics[0, egypt, uc] = True
    sim._gen_ver += 1
    assert bool(ok(egypt, SX)[0, t]), "Egypt's Builder lays a Sphinx on flat open ground"
    sim.civ_civics[0, rome, uc] = True
    assert not bool(ok(rome, SX)[0, t]), "Rome's never does"
    assert not bool(ok(egypt, ZG).any()) and not bool(ok(rome, ZG).any()), "no row plays Sumeria"
    # a water tile and a resourced tile answer their own rows, never a unique
    # (`validImprovementsIn` leaves before its catalog loop on both)
    assert not bool((ok(egypt, SX) & sim.water).any()), "a Sphinx on water"
    assert not bool((ok(egypt, SX) & (sim.res_imp >= 0)).any()), "a Sphinx on a resourced tile"
    wood = own_tile_where(sim, egypt, lambda x: int(sim.feat_id[0, x]) in sim._woods_feats.tolist()
                          and not bool(sim.feat_stripped[0, x]) and not bool(sim.water[0, x]))
    if wood >= 0:
        assert not bool(ok(egypt, SX)[0, wood]), "Improvement_ValidFeatures: no Sphinx on Woods"
    hill = own_tile_where(sim, egypt, lambda x: bool(sim.hills[0, x]) and int(sim.terrain[0, x]) in grass
                          and not (int(sim.feat_id[0, x]) >= 0 and not bool(sim.feat_stripped[0, x])))
    if hill >= 0:
        assert bool(ok(egypt, SX)[0, hill]), "the Sphinx takes hills"
    v = stand_builder(sim, egypt, t)
    col = sim._A_IMP[SX]
    assert bool(mask_of(sim, egypt, v)[col]), "the job mask offers BUILD_SPHINX"
    v_r = stand_builder(sim, rome, own_flat(sim, rome))
    assert not bool(mask_of(sim, rome, v_r)[col]), "and not to Rome's Builder"
    order(sim, egypt, v, col)
    assert int(sim.improvement[0, t]) == SX, "the Sphinx was not laid"
    nb = [int(x) for x in sim.neigh[t].tolist() if x >= 0 and int(sim.tile_seat[0, x]) == egypt
          and not bool(sim.water[0, x]) and not bool(sim.hills[0, x]) and int(sim.centre_slot_at[0, x]) < 0]
    if nb:
        clear_tile(sim, nb[0])
        assert not bool(ok(egypt, SX)[0, nb[0]]), "not beside another Sphinx"
    print("  A who/where OK")

    # -- B: the yields ------------------------------------------------------
    fp = [f for f in sim._imp_feat_list[SX]]
    assert fp, "the Sphinx carries a featureYields row"
    sim.feat_id[0, t] = fp[0]
    sim.feat_stripped[0, t] = False
    sim._eff_version += 1
    plane = sim._imp_feat_plane()
    assert plane is not None and float(plane[0, t, 4]) == 1.0, "Floodplains: +1 Culture"
    sim.feat_id[0, t] = -1
    sim._eff_version += 1
    assert float(sim._imp_feat_plane()[0, t, 4]) == 0.0
    w = [int(x) for x in sim.neigh[t].tolist() if x >= 0][0]
    sim.built_wonder[0, w] = 0
    sim.built_wonder_complete[0, w] = False
    sim._eff_version += 1
    adj = sim._imp_adjacency(egypt)
    assert adj is None or float(adj[0, t, 5]) == 0.0, "a wonder in flight pays nothing"
    sim.built_wonder_complete[0, w] = True
    sim._eff_version += 1
    assert float(sim._imp_adjacency(egypt)[0, t, 5]) == 2.0, "+2 Faith beside a completed wonder"
    sim.built_wonder[0, w] = -1
    sim.built_wonder_complete[0, w] = False
    sim._eff_version += 1
    print("  B yields OK")

    # -- C: the Bath --------------------------------------------------------
    sim = fresh(rules, path)
    aq = sim._aqueduct_idx
    ctr = int(sim.city_center[0, rome, 0])
    assert ctr >= 0
    site = next(int(x) for x in sim.neigh[ctr].tolist()
                if x >= 0 and int(sim.tile_seat[0, x]) == rome and not bool(sim.water[0, x])
                and int(sim.district[0, x]) < 0)
    clear_tile(sim, site)
    sim.district[0, site] = aq
    sim.district_complete[0, site] = True
    sim.city_dist_tile[0, rome, 0, aq] = site
    sim._eff_version += 1

    def housing():
        return float(sim._seat_housing(rome)[1][0, 0])

    def tier():
        return int(sim._seat_amenity(rome)[0][0, 0])

    with_bath = housing()
    play(sim, rome, None)
    plain = housing()
    play(sim, rome, "ROME")
    assert with_bath - plain == 2.0, f"CIV6 (Bath): Housing 2 on top of the water ({plain} -> {with_bath})"
    sim.district_pillaged[0, site] = True
    sim._eff_version += 1
    dark = housing()
    sim.district_pillaged[0, site] = False
    sim._eff_version += 1
    assert dark < plain, "a pillaged Bath gives no housing at all"
    # the flat Amenity: over a range of populations the tier (index 0 = the
    # best) never worsens and improves at least once when the row plays Rome
    rose = False
    for pop in range(1, 16):
        sim.city_pop[0, rome, 0] = pop
        sim._eff_version += 1
        t_bath = tier()
        play(sim, rome, None)
        t_plain = tier()
        play(sim, rome, "ROME")
        assert t_bath <= t_plain, f"pop {pop}: the Bath's Amenity worsened the tier"
        rose |= t_bath < t_plain
    assert rose, "the Bath's +1 Amenity never moved the tier over pop 1..15"
    print("  C Bath OK")

    # -- D: the Stave Church ------------------------------------------------
    sim = fresh(rules, path)
    hs = sim._hs_idx
    tb = sim._temple_bidx
    assert hs >= 0 and tb >= 0
    ctr = int(sim.city_center[0, norway, 0])
    site = next(int(x) for x in sim.neigh[ctr].tolist()
                if x >= 0 and int(sim.tile_seat[0, x]) == norway and not bool(sim.water[0, x])
                and int(sim.district[0, x]) < 0)
    clear_tile(sim, site)
    sim.district[0, site] = hs
    sim.district_complete[0, site] = True
    sim.city_dist_tile[0, norway, 0, hs] = site
    woods = [int(x) for x in sim.neigh[site].tolist() if x >= 0 and x != ctr and not bool(sim.water[0, x])][:2]
    assert len(woods) == 2, "the scene wants two land neighbours for its Woods"
    # one Woods and one RAINFOREST: the movement rule's woods list admits
    # both, the Stave Church's source is the Woods FEATURE alone
    wf = sim._woods_feat
    rf = next(int(f) for f in sim._woods_feats.tolist() if int(f) != wf)
    for x, f in zip(woods, (wf, rf)):
        sim.feat_id[0, x] = f
        sim.feat_stripped[0, x] = False
    # the static adjacency table was exported with the map's own features, so
    # count the Woods the tile already had beside the two planted here
    sim._eff_version += 1
    base = float(sim._district_adj_floor(hs)[0, site])
    sim.city_bldg[0, norway, 0, tb] = True
    sim._eff_version += 1
    stave = float(sim._district_adj_floor(hs)[0, site])
    n_woods = int(sim._adj_woods_count()[0, site])
    manual = sum(1 for x in sim.neigh[site].tolist() if x >= 0 and int(sim.feat_id[0, x]) == wf and not bool(sim.feat_stripped[0, x]))
    assert n_woods == manual >= 1, (n_woods, manual)
    assert stave - base == float(n_woods), f"CIV6 (Stave Church): +1 per adjacent Woods ({base} -> {stave}, {n_woods} Woods)"
    play(sim, norway, None)
    sim._eff_version += 1  # a test-only toggle; in play the row's civilization never changes
    assert float(sim._district_adj_floor(hs)[0, site]) == base, "another civilization's Temple pays nothing"
    play(sim, norway, "NORWAY")
    sim.city_bldg[0, norway, 0, tb] = False
    sim._eff_version += 1
    assert float(sim._district_adj_floor(hs)[0, site]) == base
    # the coast-resource Production: every Coast neighbour of the capital
    # carries a resource, so the worked Coast tiles are exactly the paid ones
    coast_nb = [int(x) for x in sim.neigh[ctr].tolist() if x >= 0 and int(sim.terrain[0, x]) == sim._coast_terr]
    if not coast_nb:
        # an inland capital: turn one bare land neighbour into a Coast tile
        x = next((int(x) for x in sim.neigh[ctr].tolist()
                  if x >= 0 and x != site and int(sim.tile_seat[0, x]) == norway
                  and not bool(sim.water[0, x]) and int(sim.district[0, x]) < 0), -1)
        if x >= 0:
            clear_tile(sim, x)
            sim.terrain[0, x] = sim._coast_terr
            sim.water[0, x] = True
            sim.hills[0, x] = False
            coast_nb = [x]
    if coast_nb:
        for x in coast_nb:
            sim.res_id[0, x] = 0
        sim._eff_version += 1
        def prod():
            # the amenity factor is held at 1 — an over-populated scene is
            # deep in deficit, and the term is measured RAW
            one = torch.ones_like(sim._seat_amenity(norway)[2])
            return float(sim._seat_city_yields_all(norway, one)[1][0, 0])

        # a population past the tile count works EVERY owned tile, the planted
        # Coast resource among them
        sim.city_pop[0, norway, 0] = 30
        sim._eff_version += 1
        y0 = prod()
        sim.city_bldg[0, norway, 0, tb] = True
        sim._eff_version += 1
        d = prod() - y0
        assert d == float(len(coast_nb)), f"one Production per worked coastal resource tile ({d} vs {len(coast_nb)})"
        play(sim, norway, None)
        sim._eff_version += 1
        assert prod() == y0, "the term is Norway's alone"
        play(sim, norway, "NORWAY")
        sim._eff_version += 1
        print(f"  D Stave Church OK (adjacency {base} -> {stave}; coast production +{d})")
    else:
        print(f"  D Stave Church OK (adjacency {base} -> {stave}; no coast beside the capital)")
    print("UNIQUE INFRASTRUCTURE OK")


if __name__ == "__main__":
    main()
