"""THE ESCORT FORMATION.

    python tests/gpu/escort_test.py

CIV6 (Formations): "A military unit can create a formation with a support or
civilian unit at any time"; the formation's Movement "is equal to that of the
slowest unit that belongs to it", and the pair moves as one until it is
broken. CIV6 (Escort Mobility, Light Cavalry): "Formation units all inherit
escort's Movement speed."

The engine already seats one military and one civilian unit to a tile, so the
formation is a LINK rather than a stack: the civilian carries the flag and the
tile names its escort. Nothing in the scripted gate takes the verb, so every
body below is driven directly.

Covered here:
  1. the wire: two columns at the end of the enum, and the promotion carries a
     real effect kind.
  2. the mask: offered to a civilian standing with an own military unit, and
     to nobody else; BREAK only to a formed one; a formed civilian is offered
     no step of its own.
  3. the drag: the escort steps, the rider lands with it, and both pay.
  4. the slowest member: a rider that cannot afford the step stops the escort.
  5. Escort Mobility: the rider rides free and stops nothing.
  6. a flag with no escort beside it is no formation.
  7. a naval hull forms with its PASSENGER, and CONVOY pays the escort +10.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, fixture_paths, FIXTURES

from warmup import settle_all

ROW = 1  # a civ row: every body below is seat-generic
RJ = json.loads((FIXTURES / "rules.json").read_text(encoding="utf-8"))
UNI = [u["id"] for u in RJ["units"]]
PRO = RJ["promotions"]


def fresh(rules, path, turns=6):
    sim = settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64))
    for _ in range(turns):
        sim.step()
    return sim


def put(sim, row, tile, kind, mp=2, escorted=False):
    """seat a unit of `kind` on `tile` and return its merged slot."""
    slot = int(sim.unit_next[0])
    sim.unit_next[0] += 1
    lo = sim.POOL_LO["major"]
    ty = UNI.index(kind)
    sim.major_unit_alive[0, slot] = True
    sim.major_unit_seat[0, slot] = row
    sim.major_unit_type[0, slot] = ty
    sim.major_unit_tile[0, slot] = tile
    sim.major_unit_hp[0, slot] = 100
    sim.major_unit_mp[0, slot] = mp
    sim.major_unit_mp_full[0, slot] = 2
    sim.major_unit_escorted[0, slot] = escorted
    if bool(sim._type_civilian[ty]):
        sim.civilian_at[0, tile] = slot + lo
    else:
        sim.military_at[0, tile] = slot + lo
    sim._gen_ver += 1
    return slot + lo


def free_pair(sim):
    """two adjacent passable land tiles with nothing standing on either."""
    for t in range(sim.T):
        if (not bool(sim.passable[0, t]) or bool(sim.wpass[0, t])
                or int(sim.military_at[0, t]) >= 0 or int(sim.civilian_at[0, t]) >= 0):
            continue
        for n in sim.neigh[t].tolist():
            if n < 0 or not bool(sim.passable[0, n]) or bool(sim.wpass[0, n]):
                continue
            if int(sim.military_at[0, n]) >= 0 or int(sim.civilian_at[0, n]) >= 0:
                continue
            return t, n
    raise AssertionError("no adjacent free land pair on the map")


def rank_of(sim, row, slot_merged):
    smap = sim._seat_slot_map(row)
    return int((smap[0] == slot_merged).long().argmax())


def mask_of(sim, row, slot_merged):
    sim.seat_ext[:, row] = True
    return sim._seat_unit_mask(row)[0, rank_of(sim, row, slot_merged)]


def order(sim, row, slot_merged, col):
    smap = sim._seat_slot_map(row)[0]
    acts = torch.full((1, smap.shape[0]), -1, dtype=torch.long)
    acts[0, rank_of(sim, row, slot_merged)] = col
    sim.seat_ext[0, row] = True
    sim._apply_seat_unit_actions(row, acts)


def _dir_of(sim, frm, to):
    d = [i for i, n in enumerate(sim.neigh[frm].tolist()) if n == to]
    assert d, "tiles are not adjacent"
    return d[0]


def _promo(sim, slot_merged, cls, pid):
    """give the unit in this slot one named promotion of `cls`."""
    ci = PRO["classes"].index(cls)
    sim.unit_promos[0, slot_merged] = 1 << PRO["ids"][ci].index(pid)


def _mobility(sim, slot_merged):
    _promo(sim, slot_merged, "LIGHT_CAV", "ESCORT_MOBILITY")


def water_pair(sim):
    """two adjacent open water tiles with nothing standing on either."""
    def bare(x):
        return (bool(sim.wpass[0, x]) and int(sim.military_at[0, x]) < 0
                and int(sim.embarked_at[0, x]) < 0)
    for x in range(sim.T):
        if not bare(x):
            continue
        for n in sim.neigh[x].tolist():
            if n >= 0 and bare(n):
                return x, n
    raise AssertionError("no adjacent free water pair on the map")


# ------------------------------------------------------------------- 1 wire
def poke_wire(rules, path):
    sim = fresh(rules, path, turns=1)
    assert sim._A_ESCORT >= 0 and sim._A_UNESCORT >= 0, "the escort verbs have no columns"
    assert sim._A_UNESCORT == sim._A_ESCORT + 1, "the two columns are one pair"
    assert sim._A_UNESCORT == len(sim._act_names) - 1, "the newest verbs close the enum"
    assert "ESCORT_SPEED" in sim._pk, "the promotion kind never reached the wire"
    ci = PRO["classes"].index("LIGHT_CAV")
    col = PRO["ids"][ci].index("ESCORT_MOBILITY")
    assert PRO["kind"][ci][col][0] == sim._pk["ESCORT_SPEED"], \
        "Escort Mobility carries something other than its own effect"
    assert not bool(sim.unit_escorted.any()), "nobody starts in a formation"
    print("  1 wire OK — two columns, one promotion kind, nobody formed")


# ------------------------------------------------------------------- 2 mask
def poke_mask(rules, path):
    sim = fresh(rules, path)
    a_t, b_t = free_pair(sim)
    bld = put(sim, ROW, a_t, "BUILDER")
    d = _dir_of(sim, a_t, b_t)

    assert not bool(mask_of(sim, ROW, bld)[sim._A_ESCORT]), "a lone civilian was offered an escort"
    assert not bool(mask_of(sim, ROW, bld)[sim._A_UNESCORT]), "an unformed civilian was offered a break"
    assert bool(mask_of(sim, ROW, bld)[d]), "a lone civilian was refused its own step"

    war = put(sim, ROW, a_t, "WARRIOR")
    assert bool(mask_of(sim, ROW, bld)[sim._A_ESCORT]), "the escort standing here was not offered"
    assert not bool(mask_of(sim, ROW, war)[sim._A_ESCORT]), "a military unit was offered to be escorted"

    # another seat's military unit escorts nobody
    sim.unit_seat[0, war] = ROW + 1
    sim._gen_ver += 1
    assert not bool(mask_of(sim, ROW, bld)[sim._A_ESCORT]), "a foreign unit was offered as an escort"
    sim.unit_seat[0, war] = ROW
    sim._gen_ver += 1

    order(sim, ROW, bld, sim._A_ESCORT)
    assert bool(sim.unit_escorted[0, bld]), "the verb did not form the pair"
    assert not bool(mask_of(sim, ROW, bld)[sim._A_ESCORT]), "a formed civilian was offered it twice"
    assert bool(mask_of(sim, ROW, bld)[sim._A_UNESCORT]), "a formed civilian was refused the break"
    assert not bool(mask_of(sim, ROW, bld)[d]), "a formed civilian kept a step of its own"

    order(sim, ROW, bld, sim._A_UNESCORT)
    assert not bool(sim.unit_escorted[0, bld]), "the break did not land"
    assert bool(mask_of(sim, ROW, bld)[d]), "the broken civilian did not get its step back"
    print("  2 mask OK — the escort gates it, the break frees it, the step follows")


# ------------------------------------------------------------------- 3 drag
def poke_drag(rules, path):
    sim = fresh(rules, path)
    a_t, b_t = free_pair(sim)
    bld = put(sim, ROW, a_t, "BUILDER")
    war = put(sim, ROW, a_t, "WARRIOR")
    order(sim, ROW, bld, sim._A_ESCORT)
    mp0 = int(sim.unit_mp[0, bld])

    order(sim, ROW, war, _dir_of(sim, a_t, b_t))
    assert int(sim.unit_tile[0, war]) == b_t, "the escort did not step"
    assert int(sim.unit_tile[0, bld]) == b_t, "the rider was left behind"
    assert int(sim.civilian_at[0, b_t]) == bld, "the rider's occupancy did not follow it"
    assert int(sim.civilian_at[0, a_t]) < 0, "the rider still holds the tile it left"
    assert int(sim.unit_mp[0, bld]) < mp0, "the rider paid nothing for the step"
    assert bool(sim.unit_escorted[0, bld]), "the formation broke on a step"
    print("  3 drag OK — the pair lands together, both occupancy and both pools")


# --------------------------------------------------------------- 4 the slower
def poke_slowest(rules, path):
    sim = fresh(rules, path)
    a_t, b_t = free_pair(sim)
    bld = put(sim, ROW, a_t, "BUILDER", mp=0)
    war = put(sim, ROW, a_t, "WARRIOR")
    order(sim, ROW, bld, sim._A_ESCORT)

    order(sim, ROW, war, _dir_of(sim, a_t, b_t))
    assert int(sim.unit_tile[0, war]) == a_t, "the escort outran its own formation"
    assert int(sim.unit_tile[0, bld]) == a_t, "the rider moved with no movement left"

    # break it and the escort is free again
    order(sim, ROW, bld, sim._A_UNESCORT)
    order(sim, ROW, war, _dir_of(sim, a_t, b_t))
    assert int(sim.unit_tile[0, war]) == b_t, "the broken escort was still held"
    print("  4 slowest OK — a spent rider stops the pair, and the break releases it")


# ------------------------------------------------------------- 5 the promotion
def poke_mobility(rules, path):
    sim = fresh(rules, path)
    a_t, b_t = free_pair(sim)
    bld = put(sim, ROW, a_t, "BUILDER", mp=0)
    hor = put(sim, ROW, a_t, "HORSEMAN")
    _mobility(sim, hor)
    order(sim, ROW, bld, sim._A_ESCORT)

    order(sim, ROW, hor, _dir_of(sim, a_t, b_t))
    assert int(sim.unit_tile[0, hor]) == b_t, "Escort Mobility did not release the pair"
    assert int(sim.unit_tile[0, bld]) == b_t, "the rider was left behind"
    assert int(sim.unit_mp[0, bld]) == 0, "the free rider was charged after all"
    print("  5 mobility OK — the rider inherits the escort's speed and pays nothing")


# --------------------------------------------------------------- 6 no escort
def poke_orphan(rules, path):
    sim = fresh(rules, path)
    a_t, b_t = free_pair(sim)
    bld = put(sim, ROW, a_t, "BUILDER", escorted=True)
    d = _dir_of(sim, a_t, b_t)
    assert bool(mask_of(sim, ROW, bld)[d]), "a flag with no escort beside it held the civilian"
    order(sim, ROW, bld, d)
    assert int(sim.unit_tile[0, bld]) == b_t, "the orphaned civilian could not walk"
    print("  6 orphan OK — a flag alone is not a formation")


# CIV6 (Formations): "Naval military units may also create a formation with
# embarked land units"; (Convoy, Naval Melee): "+10 Combat Strength when in a
# formation" — the escort formation, so the term rides the HULL.
def poke_convoy(rules, path):
    sim = fresh(rules, path)
    # a hull sails and a passenger stands at sea only behind their own techs;
    # both engines ask `tileFreeForUnit` at the destination either way.
    for _tech in (sim._sailing_tech, sim._cartography_tech, sim._shipbuilding_tech):
        if _tech >= 0:
            sim.civ_techs[0, ROW, _tech] = True
    a_t, b_t = water_pair(sim)
    hull = put(sim, ROW, a_t, "GALLEY")
    rider = put(sim, ROW, a_t, "WARRIOR")
    # the WARRIOR rides as a PASSENGER, which is its stacking class on water
    sim.military_at[0, a_t] = hull
    sim.unit_emb[0, rider] = True
    sim.embarked_at[0, a_t] = rider
    sim._gen_ver += 1

    assert bool(mask_of(sim, ROW, rider)[sim._A_ESCORT]), "a passenger was refused its hull"
    _promo(sim, hull, "NAVAL_MELEE", "CONVOY")
    assert int(sim._convoy_cs(torch.tensor([hull]))[0]) == 0,         "Convoy paid a hull that carries nobody"
    order(sim, ROW, rider, sim._A_ESCORT)
    assert bool(sim.unit_escorted[0, rider]), "the passenger did not form up"
    assert int(sim._convoy_cs(torch.tensor([hull]))[0]) == 10,         "Convoy did not pay the escort of a formation"
    assert int(sim._convoy_cs(torch.tensor([rider]))[0]) == 0,         "Convoy paid the carried unit rather than the carrier"

    order(sim, ROW, hull, _dir_of(sim, a_t, b_t))
    assert int(sim.unit_tile[0, hull]) == b_t, "the hull did not sail"
    assert int(sim.unit_tile[0, rider]) == b_t, "the passenger was left at sea"
    assert int(sim.embarked_at[0, b_t]) == rider, "the passenger plane did not follow"
    assert int(sim.embarked_at[0, a_t]) < 0, "the passenger still holds the water it left"
    print("  7 convoy OK — a hull forms with its passenger, and the escort is paid 10")


def main() -> None:
    rules = load_rules()
    paths = fixture_paths()
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    p = paths[0]
    print(f"escort_test on {p.name}")
    poke_wire(rules, p)
    poke_mask(rules, p)
    poke_drag(rules, p)
    poke_slowest(rules, p)
    poke_mobility(rules, p)
    poke_orphan(rules, p)
    poke_convoy(rules, p)
    print("ESCORT POKES OK")


if __name__ == "__main__":
    main()
