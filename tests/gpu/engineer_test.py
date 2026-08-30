"""THE MILITARY ENGINEER'S BUILD LIST.

    python tests/gpu/engineer_test.py

CIV6 (Military Engineer): "Can construct Roads, Forts, Airstrips, and Missile
Silos (uses 1 charge)" and "Can spend a charge to complete 20% of an
engineering type of district (Aqueduct, Bath, Canal, Dam) and Flood Barrier
building." CIV6 (Railroad): "Can only be constructed by Military Engineers.
Does not cost a charge, but does cost 1 Iron and 1 Coal." Of that list the
Missile Silo waits on nuclear devices and the Mountain Tunnel on a passability
bit that can move; the Fort, the Airstrip, both routes and the 20% charge all
ship.

Both engineer improvements go "in your own or NEUTRAL territory", which is the
one place a build reaches outside its own borders — the Builder's whole
improvement ladder refuses there. Every rule below is poked straight into
`_seat_unit_mask` / `_apply_seat_unit_actions`, the entry points
`policy/drive.py` uses.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all


def fresh(rules, path, turns=30):
    sim = settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64))
    for _ in range(turns):
        sim.step()
    return sim


def retype(sim, row, ty, tile=None):
    """Retype a live row-`row` unit and stand it where asked."""
    for v in range(sim.major_unit_alive.shape[1]):
        if bool(sim.major_unit_alive[0, v]) and int(sim.major_unit_seat[0, v]) == row:
            here = int(sim.major_unit_tile[0, v])
            lo = sim.POOL_LO["major"]
            if sim.military_at[0, here] == v + lo:
                sim.military_at[0, here] = -1
            if sim.civilian_at[0, here] == v + lo:
                sim.civilian_at[0, here] = -1
            sim.major_unit_type[0, v] = ty
            sim.major_unit_mp[0, v] = float(sim._type_moves[ty])
            sim.major_unit_hp[0, v] = 100
            sim.major_unit_charges[0, v] = int(sim._type_charges[ty]) if hasattr(sim, "_type_charges") else 2
            if tile is not None:
                sim.major_unit_tile[0, v] = tile
                sim.civilian_at[0, tile] = v + lo
            sim._gen_ver += 1
            return v
    raise AssertionError(f"row {row} holds no live unit to retype")


def rank_of(sim, row, slot):
    smap = sim._seat_slot_map(row)[0]
    return int((smap == slot).nonzero(as_tuple=True)[0][0])


def mask_of(sim, row, slot):
    return sim._seat_unit_mask(row)[0, rank_of(sim, row, slot)]


def order(sim, row, slot, col):
    smap = sim._seat_slot_map(row)[0]
    acts = torch.full((1, smap.shape[0]), -1, dtype=torch.long)
    acts[0, rank_of(sim, row, slot)] = col
    sim.seat_ext[0, row] = True
    sim._apply_seat_unit_actions(row, acts)


def clear_tile(sim, t):
    """Bare ground: no improvement, no district, no pave, no feature."""
    sim.improvement[0, t] = -1
    sim.district[0, t] = -1
    sim.built_wonder[0, t] = -1
    sim.pillaged[0, t] = False
    sim.feat_stripped[0, t] = True
    sim.road[0, t] = False
    sim._eff_version += 1


def own_flat(sim, row, avoid=()):
    for t in range(sim.T):
        if (int(sim.tile_seat[0, t]) == row and not bool(sim.water[0, t])
                and bool(sim.passable[0, t]) and not bool(sim.hills[0, t])
                and int(sim.centre_slot_at[0, t]) < 0 and t not in avoid):
            return t
    raise AssertionError(f"row {row} owns no flat plot")


def neutral_flat(sim, avoid=()):
    for t in range(sim.T):
        if (int(sim.tile_seat[0, t]) < 0 and not bool(sim.water[0, t])
                and bool(sim.passable[0, t]) and not bool(sim.hills[0, t])
                and t not in avoid):
            return t
    raise AssertionError("the map holds no neutral flat plot")


def main() -> None:
    rules = load_rules()
    path = fixture_paths()[0]
    row = 1

    sim = fresh(rules, path)
    ENG = sim._eng_idx
    assert ENG >= 0, "the roster fields no Military Engineer — every check below is vacuous"
    FORT, AIR = sim.FORT, next(
        (k for k, e in enumerate(sim._imp_eng) if k != sim.FORT and e), -1)
    assert FORT >= 0 and AIR >= 0, "the catalog carries no Fort and no Airstrip"

    # -- 1: the catalog says who builds what, and on what ground -----------
    assert sim._imp_eng[FORT] and sim._imp_eng[AIR], "both rows are the ENGINEER's"
    assert not sim._imp_suz[FORT] and not sim._imp_suz[AIR], "neither rides a suzerainty"
    assert sim._imp_no_feat[FORT], "CIV6 (Fort): 'any featureless land tile'"
    assert sim._imp_elev[AIR] == [0], "CIV6 (Airstrip): 'may be built on flat terrain'"
    assert int(sim._imp_air_slots[AIR]) == 3, "CIV6 (Airstrip): '+3 aircraft slots'"
    assert int(sim._imp_appeal_adj[AIR]) == -1, "CIV6 (Airstrip): '-1 Appeal'"
    print(f"  1 catalog OK (fort featureless, airstrip flat / 3 slots / -1 appeal)")

    # the ground predicate is the one body both the mask and the apply ask
    t_flat = own_flat(sim, row)
    clear_tile(sim, t_flat)
    hill = next(t for t in range(sim.T)
                if bool(sim.hills[0, t]) and not bool(sim.water[0, t]))
    clear_tile(sim, hill)
    g_air = sim._imp_ground_ok(AIR)[0]
    assert bool(g_air[t_flat]) and not bool(g_air[hill]), "an Airstrip refuses hills"
    sim.feat_stripped[0, t_flat] = False
    if int(sim.feat_id[0, t_flat]) >= 0:
        assert not bool(sim._imp_ground_ok(FORT)[0, t_flat]), "a Fort refuses a featured tile"
    sim.feat_stripped[0, t_flat] = True
    print("  2 ground OK (airstrip flat-only, fort featureless)")

    # -- 3: the MASK offers both rows, on OWN and on NEUTRAL ground --------
    for k in (FORT, AIR):
        ut = int(sim._imp_unlock[k])
        if ut >= 0:
            sim.civ_techs[0, row, ut] = True
    sim._eff_version += 1
    v = retype(sim, row, ENG, t_flat)
    um = mask_of(sim, row, v)
    c_fort, c_air = sim._A_IMP[FORT], sim._A_IMP[AIR]
    assert bool(um[c_fort]) and bool(um[c_air]), (
        "an engineer on bare own flat land must be offered both of its rows")
    assert not bool(um[sim._A_IMP[sim.FARM]]), "an engineer is never offered a Farm"

    t_neu = neutral_flat(sim, avoid=(t_flat,))
    clear_tile(sim, t_neu)
    sim.major_unit_tile[0, v] = t_neu
    sim._gen_ver += 1
    um = mask_of(sim, row, v)
    assert bool(um[c_air]), (
        "CIV6 (Airstrip): 'in your own or neutral territory' — the mask refused neutral ground")

    # a BUILDER on the same ground gets neither
    if sim._builder_idx >= 0:
        sim.major_unit_type[0, v] = sim._builder_idx
        sim._gen_ver += 1
        bm = mask_of(sim, row, v)
        assert not bool(bm[c_fort]) and not bool(bm[c_air]), (
            "the Fort and the Airstrip are the ENGINEER's alone")
        sim.major_unit_type[0, v] = ENG
        sim._gen_ver += 1
    print("  3 mask OK (own + neutral ground, engineer only, no Farm)")

    # -- 4: the APPLY places it, spends a charge, and the last one disbands -
    sim.major_unit_charges[0, v] = 2
    order(sim, row, v, c_air)
    assert int(sim.improvement[0, t_neu]) == AIR, "the airstrip was not placed"
    assert int(sim.major_unit_charges[0, v]) == 1, "the build spends exactly one charge"
    assert float(sim.major_unit_mp[0, v]) == 0.0, "the turn is spent"
    t2 = neutral_flat(sim, avoid=(t_flat, t_neu))
    clear_tile(sim, t2)
    sim.major_unit_tile[0, v] = t2
    sim.major_unit_mp[0, v] = 2.0
    sim._gen_ver += 1
    order(sim, row, v, c_air)
    assert int(sim.improvement[0, t2]) == AIR, "the second airstrip was not placed"
    assert not bool(sim.major_unit_alive[0, v]), "the last charge disbands the engineer"
    print("  4 apply OK (placed, one charge each, disbanded on the last)")

    # -- 5: an Airstrip BASES aircraft ------------------------------------
    sim = fresh(rules, path)
    t = own_flat(sim, row)
    clear_tile(sim, t)
    sim.improvement[0, t] = AIR
    sim._eff_version += 1
    assert int(sim._air_slots_at(row)[0, t]) == 3, "an own Airstrip bases 3"
    other = next(r for r in range(sim.n_majors) if r != row)
    assert int(sim._air_slots_at(other)[0, t]) == 0, "a rival's Airstrip bases nothing for you"
    sim.pillaged[0, t] = True
    sim._eff_version += 1
    assert int(sim._air_slots_at(row)[0, t]) == 0, "a pillaged Airstrip bases nothing"
    print("  5 bases OK (3 for its owner, 0 for a rival, 0 while pillaged)")

    # -- 6: the APPEAL column, for the airstrip and for the mine ----------
    sim.pillaged[0, t] = False
    sim.improvement[0, t] = -1
    sim._eff_version += 1
    nb = [int(x) for x in sim.neigh[t].tolist() if x >= 0]
    base = [int(sim._tile_appeal()[0, x]) for x in nb]
    sim.improvement[0, t] = AIR
    sim._eff_version += 1
    with_air = [int(sim._tile_appeal()[0, x]) for x in nb]
    assert all(a == b - 1 for a, b in zip(with_air, base)), (
        f"CIV6 (Airstrip): '-1 Appeal' to each neighbour — {base} -> {with_air}")
    if sim.MINE >= 0:
        sim.improvement[0, t] = sim.MINE
        sim._eff_version += 1
        with_mine = [int(sim._tile_appeal()[0, x]) for x in nb]
        assert with_mine == with_air, "a mine takes the same point off, off the same column"
    print(f"  6 appeal OK (-1 per neighbour, read off `_imp_appeal_adj`)")

    # -- 7: the ROAD verb --------------------------------------------------
    sim = fresh(rules, path)
    assert sim._A_ROAD >= 0, "the action enum carries no BUILD_ROAD column"
    t = own_flat(sim, row)
    clear_tile(sim, t)
    v = retype(sim, row, ENG, t)
    sim.major_unit_charges[0, v] = 2
    assert bool(mask_of(sim, row, v)[sim._A_ROAD]), "an unroaded own tile offers the road"
    sim.road[0, t] = True
    assert not bool(mask_of(sim, row, v)[sim._A_ROAD]), "a road already laid is nothing to lay"
    sim.road[0, t] = False
    order(sim, row, v, sim._A_ROAD)
    assert bool(sim.road[0, t]), "the road was not laid"
    assert int(sim.major_unit_charges[0, v]) == 1, "the road spends one charge"
    print("  7 road OK (offered once, laid, one charge)")

    # -- 8: the 20% charge into a district and into the Flood Barrier ------
    sim = fresh(rules, path)
    assert sim._A_FINISH >= 0, "the action enum carries no FINISH_DISTRICT column"
    assert sim._eng_finish_slots, "no engineering district is in the scaffold"
    j = int(sim.city_alive[0, row].nonzero().flatten()[0])
    s = sim._eng_finish_slots[0]
    di = sim._scaffold[s][0]
    site = own_flat(sim, row, avoid=(int(sim.city_center[0, row, j]),))
    clear_tile(sim, site)
    sim.district[0, site] = di
    sim.district_complete[0, site] = False
    sim.city_dist_tile[0, row, j, di] = site
    sim.city_qtile[0, row, j] = site
    sim.city_current[0, row, j] = sim.DISTRICT_BASE + s
    sim.city_cost[0, row, j] = 200
    sim.city_progress[0, row, j] = 0
    sim._eff_version += 1
    v = retype(sim, row, ENG, site)
    sim.major_unit_charges[0, v] = 2
    assert bool(mask_of(sim, row, v)[sim._A_FINISH]), (
        "an engineer standing on the site being dug must be offered the charge")
    order(sim, row, v, sim._A_FINISH)
    got = float(sim.city_progress[0, row, j])
    assert got == 40.0, f"CIV6: a charge completes 20% of a 200-cost district -> 40, read {got}"
    assert int(sim.major_unit_charges[0, v]) == 1, "the charge is spent"

    if sim._barrier_bidx >= 0:
        ctr = int(sim.city_center[0, row, j])
        sim.city_current[0, row, j] = sim._barrier_bidx
        sim.city_qtile[0, row, j] = -1
        sim.city_progress[0, row, j] = 0
        sim.major_unit_tile[0, v] = ctr
        sim.major_unit_mp[0, v] = 2.0
        sim._gen_ver += 1
        sim._reprice_live(row)
        cost = float(sim.city_cost[0, row, j])
        assert bool(mask_of(sim, row, v)[sim._A_FINISH]), (
            "the Flood Barrier is a BUILDING, so its charge is spent at the centre")
        order(sim, row, v, sim._A_FINISH)
        want = round(cost * sim._eng_finish_frac)
        got = float(sim.city_progress[0, row, j])
        assert abs(got - want) < 1e-6, f"a barrier charge is 20% of its LIVE price {cost} -> {want}, read {got}"
    print("  8 charge OK (20% of a district, and of the Flood Barrier's live price)")

    # -- 9: the TRAIN gate names the whole list, not the Fort alone --------
    sim = fresh(rules, path)
    jobs = sim._seat_engineer_job_mask(row)
    assert bool(jobs[0].any()), (
        "an engineer always has SOMEWHERE to lay road, so the column is offerable")
    print("  9 job mask OK (the road alone keeps the column live)")

    # -- 10: the RAILROAD asks a tech and a BANK, and no charge ------------
    sim = fresh(rules, path)
    assert sim._A_RAIL >= 0, "the action enum carries no BUILD_RAILROAD column"
    assert sim._railroad_cost, "the Railroad names no resource cost, so nothing below bites"
    t = own_flat(sim, row)
    clear_tile(sim, t)
    sim.railroad[0, t] = False
    v = retype(sim, row, ENG, t)
    sim.major_unit_charges[0, v] = 2
    if sim._railroad_tech >= 0:
        sim.civ_techs[0, row, sim._railroad_tech] = False
    for _sl, _n in sim._railroad_cost:
        sim.civ_stockpile[0, row, _sl] = 0
    assert not bool(mask_of(sim, row, v)[sim._A_RAIL]), (
        "no Steam Power and an empty bank: there is nothing to offer")
    if sim._railroad_tech >= 0:
        sim.civ_techs[0, row, sim._railroad_tech] = True
        assert not bool(mask_of(sim, row, v)[sim._A_RAIL]), (
            "the tech alone does not pay for the tile")
    for _sl, _n in sim._railroad_cost:
        sim.civ_stockpile[0, row, _sl] = _n + 3
    assert bool(mask_of(sim, row, v)[sim._A_RAIL]), "the tech and a payable bank offer it"

    co2 = float(sim.civ_co2[0, row])
    burn = sum(float(_n * sim._carbon_per_resource[_sl]) for _sl, _n in sim._railroad_cost)
    order(sim, row, v, sim._A_RAIL)
    assert bool(sim.railroad[0, t]), "the railroad was not laid"
    assert int(sim.major_unit_charges[0, v]) == 2, "CIV6 (Railroad): 'does not cost a charge'"
    assert float(sim.major_unit_mp[0, v]) == 0, "laying one spends the turn"
    for _sl, _n in sim._railroad_cost:
        assert int(sim.civ_stockpile[0, row, _sl]) == 3, "one tile spends its named units"
    assert abs(float(sim.civ_co2[0, row]) - (co2 + burn)) < 1e-6, (
        "the Coal it burns discharges the same per-resource carbon a plant's does")
    assert not bool(mask_of(sim, row, v)[sim._A_RAIL]), (
        "a rail already laid is nothing to lay")
    print("  10 railroad OK (its tech, 1 Iron + 1 Coal, no charge, and its carbon)")

    # -- 11: what a route STEP costs, up the ladder ------------------------
    nb = next(int(n) for n in sim.neigh[t].tolist()
              if n >= 0 and not bool(sim.water[0, n]) and bool(sim.passable[0, n]))
    frm = torch.tensor([t]), torch.tensor([nb])
    dry = torch.zeros(1, dtype=torch.long)
    sim.road[0, t] = sim.road[0, nb] = True
    sim.railroad[0, t] = sim.railroad[0, nb] = False
    for tier, mp in enumerate(sim._road_tier_mp):
        sim.road_tier = tier
        terr, _ = sim._road_terms(frm[0], frm[1], dry)
        assert int(terr[0]) + sim._mp_scale == int(mp), (
            f"CIV6: a tier-{tier} road step costs {mp} quarter points")
    sim.railroad[0, t] = sim.railroad[0, nb] = True
    terr, _ = sim._road_terms(frm[0], frm[1], dry)
    assert int(terr[0]) + sim._mp_scale == sim._railroad_mp, (
        "CIV6 (Railroad): 'Movement Cost 0.25' — a quarter of a point")
    # the Ancient road fords; every tier above it bridges
    wet = torch.full((1,), 3 * sim._mp_scale, dtype=torch.long)
    sim.railroad[0, t] = sim.railroad[0, nb] = False
    for tier, bridged in enumerate(sim._road_tier_bridges):
        sim.road_tier = tier
        _, riv = sim._road_terms(frm[0], frm[1], wet)
        assert (int(riv[0]) == 0) == bool(bridged), (
            f"a tier-{tier} route {'bridges' if bridged else 'fords'} a river")
    print("  11 route step OK (the four tiers, the railroad's quarter, and the bridge)")

    print("engineer_test OK — fort, airstrip, both routes and the 20% charge, "
          "on own and neutral ground")


if __name__ == "__main__":
    main()
