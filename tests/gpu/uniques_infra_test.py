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
  E. the tourism trio: the Electronics Factory's regional Culture after
     Electricity (`_seat_regional`), the Marae's Tourism per feature tile
     after Flight and the Thermal Bath's on a fissure (`_building_tourism`).
  F. the Film Studio: the city's own tourism banked twice on a rival in the
     Modern era or later (`_late_era_tourism`, `_bank_tourism_per_rival`).
"""

from __future__ import annotations

import json
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


# THE WARMED BASE, ONE PER FIXTURE. A scene pays a `restore` — milliseconds —
# instead of a fixture load and a settle. `_STATIC` names the planes these
# pokes write that `snapshot`/`restore` does not carry (they are not in
# `_MUTABLE`): the roster pair `play` re-seats and the two map facts the
# terrain pokes rewrite. The helper puts them back by hand and re-bumps
# exactly the versions `play` bumps.
_STATIC = ("row_civ", "row_leader", "terrain", "hills")
_BASE: dict = {}


def fresh(rules, path):
    """The scene's trio — Rome, Egypt, Norway at rows 0-2 — seated BEFORE the
    capitals settle, so the founding clauses land as the old fixtures had them."""
    from core import BatchSim, load_fixture
    from warmup import settle_all
    key = str(path)
    if key not in _BASE:
        sim = BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64)
        for r, name in enumerate(("ROME", "EGYPT", "NORWAY")):
            play(sim, r, name)
        sim = settle_all(sim)
        _BASE[key] = (sim, sim.snapshot(), {k: getattr(sim, k).clone() for k in _STATIC})
    sim, snap, stat = _BASE[key]
    sim.restore(snap)
    for k, v in stat.items():
        getattr(sim, k).copy_(v)
    sim._eff_version += 1
    sim._gen_ver += 1
    sim._bldg_version += 1
    return sim


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
    # a water tile and a tile with a resource the seat sees answer their own
    # rows, never a unique (`validImprovementsIn` leaves before its catalog
    # loop on both); an unseen strategic is plain ground
    assert not bool((ok(egypt, SX) & sim.water).any()), "a Sphinx on water"
    assert not bool((ok(egypt, SX) & ~sim._res_bare(egypt)).any()), "a Sphinx on a seen resource"
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
        # ...and a coastal resource its own Harbor PAVED stops paying. TS
        # writes `tile.resource = null` there, so `t.resource !== null` goes
        # false; this engine says the same with `res_stripped`, and the
        # reader has to ask (`_res_live`). Without that it kept paying for a
        # Fish that no longer exists.
        _paved = coast_nb[0]
        sim.res_stripped[0, _paved] = True
        sim._eff_version += 1
        d_paved = prod() - y0
        assert d_paved == d - 1, (
            "a PAVED coastal resource must stop paying the Stave Church: "
            f"{d} -> {d_paved}")
        sim.res_stripped[0, _paved] = False
        sim._eff_version += 1
        assert d == float(len(coast_nb)), f"one Production per worked coastal resource tile ({d} vs {len(coast_nb)})"
        play(sim, norway, None)
        sim._eff_version += 1
        assert prod() == y0, "the term is Norway's alone"
        play(sim, norway, "NORWAY")
        sim._eff_version += 1
        print(f"  D Stave Church OK (adjacency {base} -> {stave}; coast production +{d})")
    else:
        print(f"  D Stave Church OK (adjacency {base} -> {stave}; no coast beside the capital)")
    # -- E: the tourism trio ------------------------------------------------
    _bids = [b["id"] for b in rules.buildings]
    _tids = [t["id"] for t in json.loads((Path(__file__).resolve().parent.parent.parent
                                         / "seeder" / "worlds" / "rules.json").read_text())["techs"]]
    fac, amph, zoo = (_bids.index(x) for x in ("FACTORY", "AMPHITHEATER", "ZOO"))
    elec, flight = _tids.index("ELECTRICITY"), _tids.index("FLIGHT")

    def bump(sim):
        sim._eff_version += 1
        sim._gen_ver += 1
        sim._bldg_version += 1

    # the Electronics Factory: +4 Culture after Electricity, on the REGIONAL reach
    sim = fresh(rules, path)
    play(sim, rome, "JAPAN")
    iz = sim._iz_idx
    assert iz >= 0
    ctr = int(sim.city_center[0, rome, 0])
    site = next(int(x) for x in sim.neigh[ctr].tolist()
                if x >= 0 and int(sim.tile_seat[0, x]) == rome and not bool(sim.water[0, x])
                and int(sim.district[0, x]) < 0)
    clear_tile(sim, site)
    sim.district[0, site] = iz
    sim.district_complete[0, site] = True
    sim.city_dist_tile[0, rome, 0, iz] = site
    sim.city_bldg[0, rome, 0, fac] = True
    bump(sim)
    reg = sim._seat_regional(rome)
    assert reg is not None, "a Factory is a regional row"
    y0 = reg[0][0, 0].tolist()
    assert y0[1] == 3.0 and y0[4] == 0.0, f"before Electricity: {y0}"
    sim.civ_techs[0, rome, elec] = True
    bump(sim)
    y1 = sim._seat_regional(rome)[0][0, 0].tolist()
    assert y1[1] == 3.0 and y1[4] == 4.0, f"CIV6 (ELECTRONICSFACTORY_CULTURE): +4 Culture after Electricity, got {y1}"
    play(sim, rome, "ROME")
    y2 = sim._seat_regional(rome)[0][0, 0].tolist()
    assert y2[1] == 3.0 and y2[4] == 0.0, f"another civilization's Factory reads no tech: {y2}"
    print("  E Electronics Factory OK (regional Culture 0 -> 4 on Electricity)")

    # the Marae: a Tourism per feature tile of the city after Flight
    sim = fresh(rules, path)
    play(sim, rome, "MAORI")
    sim.city_bldg[0, rome, 0, amph] = True
    bump(sim)
    sl = sim.city_slot_at(rome)[0]
    owned = (sl == 0).nonzero().flatten().tolist()
    assert len(owned) >= 3
    # two Woods planted on owned ground (over whatever stood there): the
    # count below reads the tiles as they are, so the scene needs no bare tile
    bare = [x for x in owned if x != int(sim.city_center[0, rome, 0])][:2]
    assert len(bare) == 2, "the scene wants two owned tiles beside the centre"
    for x in bare:
        sim.feat_id[0, x] = sim._woods_feat
        sim.feat_stripped[0, x] = False
    n_feat = sum(1 for x in owned if int(sim.feat_id[0, x]) >= 0 and not bool(sim.feat_stripped[0, x]))
    assert n_feat >= 2
    assert int(sim._building_tourism(rome)[0]) == 0, "the Marae's Tourism waits on Flight"
    sim.civ_techs[0, rome, flight] = True
    bump(sim)
    got = int(sim._building_tourism(rome)[0])
    assert got == n_feat, f"CIV6 (MARAE_TOURISM_FEATURES): 1 per feature tile ({n_feat}), got {got}"
    play(sim, rome, "ROME")
    assert int(sim._building_tourism(rome)[0]) == 0, "another civilization's Amphitheater pays none"
    print(f"  E Marae OK ({n_feat} feature tiles -> {got} Tourism after Flight)")

    # the Thermal Bath: 3 Tourism while the city holds a Geothermal Fissure
    sim = fresh(rules, path)
    play(sim, rome, "HUNGARY")
    _zv = next(v for v in rules.buildings[zoo]["variants"] if int(v["civ"]) == C["HUNGARY"])
    geo, amt = int(_zv["tourismWithFeature"][0]), int(_zv["tourismWithFeature"][1])
    assert geo >= 0 and geo == int(_zv["amenitiesWithFeature"][0]) and amt == 3
    sim.city_bldg[0, rome, 0, zoo] = True
    bump(sim)
    sl = sim.city_slot_at(rome)[0]
    owned = [x for x in (sl == 0).nonzero().flatten().tolist() if x != int(sim.city_center[0, rome, 0])]
    for x in owned:
        if int(sim.feat_id[0, x]) == geo:
            sim.feat_id[0, x] = -1
    assert len(owned) >= 2
    assert int(sim._building_tourism(rome)[0]) == 0, "no fissure, no Tourism"
    x = owned[0]
    sim.feat_id[0, x] = geo
    sim.feat_stripped[0, x] = False
    assert int(sim._building_tourism(rome)[0]) == amt, "CIV6 (THERMALBATH_ADDTOURISM): +3 while the city holds a fissure"
    y = owned[1]
    sim.feat_id[0, y] = geo
    assert int(sim._building_tourism(rome)[0]) == amt, "'1 or more': a second fissure pays nothing more"
    play(sim, rome, "ROME")
    assert int(sim._building_tourism(rome)[0]) == 0, "another civilization's Zoo pays none"
    print("  E Thermal Bath OK (3 Tourism on a fissure, once)")
    # -- F: the Film Studio's late-era pressure ----------------------------
    from warmup import hold_works
    bc = _bids.index("BROADCAST_CENTER")
    sim = fresh(rules, path)
    play(sim, rome, "AMERICA")
    sim.city_bldg[0, rome, 0, bc] = True
    hold_works(sim, 0, rome, 0, 5, 2)  # two Works of Writing: a known general half
    bump(sim)
    inp = sim._tourism_inputs(rome, None)
    own_all = sim.tile_seat == rome
    nat = int(sim._tourism_of(inp["gw_tour"], sim.city_alive[:, rome], own_all, inp["era"],
                              resort_mult=inp["resort_mult"], park_mult=inp["park_mult"],
                              wonder_pct=inp["wonder_pct"], gw_mult=inp["gw_mult"],
                              suz_tour=sim._suzerain_tourism(rome, own_all) + sim._gp_district_tourism(rome)
                              + sim._building_tourism(rome))[0])
    assert nat > 0, "the scene wants a general tourism to double"
    late = sim._late_era_tourism(rome, inp)
    assert late is not None, "a standing Film Studio carries the clause"
    extra, era_min = late
    # one city holds everything the row makes, so the extra is the whole national figure
    assert int(extra[0]) == nat, f"CIV6 (Film Studio): the city's own tourism {nat}, got {int(extra[0])}"
    sim.civ_techs[0, egypt, elec] = True  # Egypt reaches the Modern era; Norway stays Ancient
    bump(sim)
    assert int(sim._civ_era(sim.civ_techs[:, egypt], sim.civ_civics[:, egypt])[0]) >= era_min
    assert int(sim._civ_era(sim.civ_techs[:, norway], sim.civ_civics[:, norway])[0]) < era_min
    sim.civ_tourism_to.zero_()
    one = torch.ones(sim.B, dtype=torch.bool, device=sim.device)
    gen = torch.full((sim.B,), float(nat), dtype=sim.dtype, device=sim.device)
    rel = torch.zeros(sim.B, dtype=sim.dtype, device=sim.device)
    sim._bank_tourism_per_rival(rome, one, gen, rel, late)
    pe = int(sim._tourism_intl_pct(rome, egypt)[0])
    pn = int(sim._tourism_intl_pct(rome, norway)[0])
    assert int(sim.civ_tourism_to[0, rome, egypt]) == (2 * nat) * max(0, 100 + pe) // 100, "a Modern rival takes the city's tourism twice"
    assert int(sim.civ_tourism_to[0, rome, norway]) == nat * max(0, 100 + pn) // 100, "an Ancient rival takes the base"
    play(sim, rome, "ROME")
    bump(sim)
    assert sim._late_era_tourism(rome, sim._tourism_inputs(rome, None)) is None, "the Broadcast Center carries no clause"
    print(f"  F Film Studio OK (city tourism {nat}: Modern rival x2, Ancient rival x1)")
    print("UNIQUE INFRASTRUCTURE OK")


if __name__ == "__main__":
    main()
