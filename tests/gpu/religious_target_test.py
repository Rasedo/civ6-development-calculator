"""WHAT MAY TARGET A RELIGIOUS UNIT OR A CIVILIAN, on the GPU side — the twin
of `tests/cpu/units/religious-target.test.ts`, from the lab's records
(`tools/civ6lab/runs/religious_target_20260926T_{read,pairs,fire}.jsonl`): a
ranged attack or a city's strike never targets a Missionary, an Apostle or a
Builder; a melee order onto a religious unit is a MOVE onto its tile, onto a
Builder a seizure that steps onto its plot, whoever moves (a barbarian's
captive is theirs and holds where it stands); Condemn Heretic is legal on the heretic's own tile only; a
shot from the ground never takes a lone Support chassis
(`tools/civ6lab/runs/b89t_fire_20260926.jsonl`).

    python tests/gpu/religious_target_test.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import load_rules, fixture_paths
from warmup import warm_base, opened

ROW, FOE = 1, 0


def fresh(rules, path, turns=30):
    return warm_base((str(path), turns), lambda: opened(rules, path, turns))


def spawn(sim, row, ty, tile):
    """a fresh row-`row` unit of `ty` standing on `tile` exactly"""
    was = set(sim.major_unit_alive[0].nonzero().flatten().tolist())
    sim._spawn_unit(row, torch.ones(1, dtype=torch.bool), torch.tensor([tile]), torch.tensor([ty]))
    got = set(sim.major_unit_alive[0].nonzero().flatten().tolist()) - was
    assert len(got) == 1, "the spawn found no slot"
    v = got.pop()
    at = int(sim.unit_tile[0, v])
    if at != tile:
        r, s = torch.tensor([0]), torch.tensor([v])
        sim._occ_clear(r, torch.tensor([at]), s)
        sim.unit_tile[0, v] = tile
        sim._occ_set(r, torch.tensor([tile]), s)
    sim._gen_ver += 1
    return v


def order(sim, row, slot, col):
    smap = sim._seat_slot_map(row)[0]
    rank = int((smap == slot).nonzero(as_tuple=True)[0][0])
    acts = torch.full((1, smap.shape[0]), -1, dtype=torch.long)
    acts[0, rank] = col
    sim.seat_ext[0, row] = True
    sim._apply_seat_unit_actions(row, acts)


def mask_of(sim, row, slot):
    smap = sim._seat_slot_map(row)[0]
    rank = int((smap == slot).nonzero(as_tuple=True)[0][0])
    return sim._seat_unit_mask(row)[0, rank]


def at_war(sim, a, b):
    sim.war[0, a, b] = True
    sim.war[0, b, a] = True


def bare(sim, t):
    return (t >= 0 and bool(sim.passable[0, t]) and not bool(sim.water[0, t])
            and int(sim.district[0, t]) < 0 and int(sim.centre_slot_at[0, t]) < 0
            and int(sim.built_wonder[0, t]) < 0 and int(sim.military_at[0, t]) < 0
            and int(sim.civilian_at[0, t]) < 0 and int(sim.support_at[0, t]) < 0
            and int(sim.embarked_at[0, t]) < 0)


def trio(sim):
    """a bare tile with two bare neighbours, far from every centre"""
    for t in range(sim.T):
        if not bare(sim, t) or int(sim.tile_seat[0, t]) >= 0:
            continue
        nb = [n for n in sim.neigh[t].tolist() if bare(sim, n) and int(sim.tile_seat[0, n]) < 0]
        if len(nb) >= 2:
            return t, nb[0], nb[1]
    raise AssertionError("no bare trio of plots")


def type_id(sim, name):
    return next(i for i, u in enumerate(sim.rules.units) if u["id"] == name)


def main() -> None:
    rules = load_rules()
    path = fixture_paths()[0]

    # -- 1: a ranged attack refuses a Missionary and a Builder ----------------
    sim = fresh(rules, path)
    at_war(sim, ROW, FOE)
    a, b, c = trio(sim)
    arch = spawn(sim, ROW, type_id(sim, "ARCHER"), a)
    miss = spawn(sim, FOE, sim._missionary_idx, b)
    bld = spawn(sim, FOE, sim._builder_idx, c)
    db, dc = sim.neigh[a].tolist().index(b), sim.neigh[a].tolist().index(c)
    m = mask_of(sim, ROW, arch)
    assert not bool(m[6 + db]) and not bool(m[6 + dc]), "a ranged unit is offered a civilian"
    order(sim, ROW, arch, 6 + db)
    assert int(sim.unit_hp[0, miss]) == 100 and bool(sim.unit_alive[0, miss]), "the shot took a Missionary"
    order(sim, ROW, arch, 6 + dc)
    assert int(sim.unit_hp[0, bld]) == 100 and int(sim.unit_seat[0, bld]) == FOE, "the shot took a Builder"
    # the barbarian raider's reach passes over them too
    plane = sim._nonbarb_unit_plane()[0]
    assert not bool(plane[b]) and not bool(plane[c]), "a barbarian's shot reaches a civilian"
    print("  1 a shot never takes a civilian OK (the mask, the order, the raider's reach)")

    # -- 2: a walled city's strike passes over a civilian ---------------------
    sim = fresh(rules, path)
    at_war(sim, ROW, FOE)
    j = int(sim.city_alive[0, FOE].nonzero().flatten()[0])
    ctr = int(sim.city_center[0, FOE, j])
    d1 = [t for t in range(sim.T) if int(sim.pair_dist[ctr, t]) == 1 and bare(sim, t)]
    d2 = [t for t in range(sim.T) if int(sim.pair_dist[ctr, t]) == 2 and bare(sim, t)]
    assert d1 and d2, "the foe centre has no bare ring"
    bld = spawn(sim, ROW, sim._builder_idx, d1[0])
    miss = spawn(sim, ROW, sim._missionary_idx, d1[1] if len(d1) > 1 else d2[1])
    war = spawn(sim, ROW, sim._warrior_idx, d2[0])
    col = torch.full((sim.B,), j, dtype=torch.long)
    sim._seat_city_strike(FOE, col, torch.ones(sim.B, dtype=torch.bool), "cstk")
    assert int(sim.unit_hp[0, bld]) == 100 and int(sim.unit_hp[0, miss]) == 100, (
        "the city's strike took a civilian")
    assert int(sim.unit_hp[0, war]) < 100, "the city's strike held fire at the warrior"
    print("  2 a city's strike takes the nearest unit it may shoot, never a civilian OK")

    # -- 3: a melee order onto a religious unit shares its tile ----------------
    sim = fresh(rules, path)
    at_war(sim, ROW, FOE)
    a, b, c = trio(sim)
    w = spawn(sim, ROW, sim._warrior_idx, a)
    miss = spawn(sim, FOE, sim._missionary_idx, b)
    db = sim.neigh[a].tolist().index(b)
    assert not bool(mask_of(sim, ROW, w)[sim._A_CONDEMN]), "Condemn offered from beside the heretic"
    assert bool(mask_of(sim, ROW, w)[6 + db]), "the melee order onto a religious unit is shut"
    att0 = int(sim.unit_attacks[0, w])
    order(sim, ROW, w, 6 + db)
    assert int(sim.unit_tile[0, w]) == b and int(sim.military_at[0, b]) == w, "the warrior did not step on"
    assert int(sim.civilian_at[0, b]) == miss and bool(sim.unit_alive[0, miss]), "the religious unit left"
    assert int(sim.unit_hp[0, miss]) == 100 and int(sim.unit_seat[0, miss]) == FOE, "the religious unit was taken"
    assert int(sim.unit_hp[0, w]) == 100, "the step was a fight"
    assert int(sim.unit_attacks[0, w]) == att0, "the step spent an attack"
    sim.unit_mp[0, w] = sim.unit_mp_full[0, w]
    assert bool(mask_of(sim, ROW, w)[sim._A_CONDEMN]), "Condemn shut on the heretic's own tile"
    order(sim, ROW, w, sim._A_CONDEMN)
    assert not bool(sim.unit_alive[0, miss]) and int(sim.civilian_at[0, b]) < 0, "Condemn did not kill"
    assert int(sim.unit_mp[0, w]) == 0, "Condemn did not end the condemner's moves"
    print("  3 a melee order onto a religious unit is a move; Condemn on its own tile OK")

    # -- 4: onto a Builder it seizes it and steps on ---------------------------
    sim = fresh(rules, path)
    at_war(sim, ROW, FOE)
    a, b, c = trio(sim)
    w = spawn(sim, ROW, sim._warrior_idx, a)
    bld = spawn(sim, FOE, sim._builder_idx, b)
    sim.unit_charges[0, bld] = 2
    att0 = int(sim.unit_attacks[0, w])
    order(sim, ROW, w, 6 + sim.neigh[a].tolist().index(b))
    got = int(sim.civilian_at[0, b])
    assert got >= 0 and int(sim.unit_seat[0, got]) == ROW, "the Builder was not captured"
    assert int(sim.unit_type[0, got]) == sim._builder_idx and int(sim.unit_charges[0, got]) == 2, (
        "the captive is not the Builder with its charges")
    assert int(sim.unit_tile[0, w]) == b and int(sim.military_at[0, b]) == w, "the mover did not step on"
    assert int(sim.unit_attacks[0, w]) == att0, "the seizure spent an attack"
    print("  4 a melee order onto a Builder seizes it and steps onto its plot OK")

    # -- 4b: a barbarian's seizure: the captive is theirs, a Trader dies -------
    sim = fresh(rules, path)
    a, b, c = trio(sim)
    one = torch.ones(sim.B, dtype=torch.bool)
    was = set(sim.barb_unit_alive[0].nonzero().flatten().tolist())
    sim._spawn_barb(one, torch.full((sim.B,), a, dtype=torch.long), sim._warrior_idx)
    bw = (set(sim.barb_unit_alive[0].nonzero().flatten().tolist()) - was).pop()
    lo = sim.POOL_LO["barb"]
    if int(sim.unit_tile[0, bw + lo]) != a:
        r, g = torch.tensor([0]), torch.tensor([bw + lo])
        sim._occ_clear(r, torch.tensor([int(sim.unit_tile[0, bw + lo])]), g)
        sim.unit_tile[0, bw + lo] = a
        sim._occ_set(r, torch.tensor([a]), g)
    sim.unit_mp[0, bw + lo] = sim.unit_mp_full[0, bw + lo] = 2 * sim._mp_scale
    bld = spawn(sim, FOE, sim._builder_idx, b)
    sim.unit_charges[0, bld] = 3
    sim._hostile_vs_unit(one, torch.full((sim.B,), b, dtype=torch.long), "barb", bw)
    got = int(sim.civilian_at[0, b])
    assert got >= lo and int(sim.unit_seat[0, got]) == 200, "the barbarians did not take the Builder"
    assert int(sim.unit_type[0, got]) == sim._builder_idx and int(sim.unit_charges[0, got]) == 3, (
        "the barbarians' captive is not the Builder with its charges")
    assert int(sim.barb_unit_tribe[0, got - lo]) == -1, "the captive joined a tribe"
    assert int(sim.unit_tile[0, bw + lo]) == b, "the barbarian did not step onto the plot"
    sim._barbarian_phase()
    assert bool(sim.unit_alive[0, got]) and int(sim.unit_tile[0, got]) == b, "the barbarians' captive moved"
    trd = spawn(sim, FOE, type_id(sim, "TRADER"), c)
    sim.unit_mp[0, bw + lo] = 2 * sim._mp_scale
    sim.unit_attacks[0, bw + lo] = 1
    sim._hostile_vs_unit(one, torch.full((sim.B,), c, dtype=torch.long), "barb", bw)
    assert not bool(sim.unit_alive[0, trd]) and int(sim.unit_tile[0, bw + lo]) == c, (
        "a Trader stepped on lived, or the barbarian stood off")
    print("  4b a barbarian's seizure OK — the captive is theirs and holds; a Trader dies to the step")

    # -- 5: a shot from the ground never takes a lone Support chassis ----------
    # runs/b89t_fire_20260926.jsonl, runs/b89t_read_20260926.jsonl: a lone
    # Anti-Air Gun refused to a Field Cannon, a Trebuchet and a city, no draw;
    # an Infantry beside it made the tile a target and took the shot
    sim = fresh(rules, path)
    at_war(sim, ROW, FOE)
    a, b, c = trio(sim)
    arch = spawn(sim, ROW, type_id(sim, "ARCHER"), a)
    ram = spawn(sim, FOE, type_id(sim, "BATTERING_RAM"), b)
    db = sim.neigh[a].tolist().index(b)
    assert not bool(mask_of(sim, ROW, arch)[6 + db]), "a ranged unit is offered a lone Support chassis"
    r0 = sim.rng_state.clone()
    order(sim, ROW, arch, 6 + db)
    assert int(sim.unit_hp[0, ram]) == 100 and torch.equal(r0, sim.rng_state), "the shot took a lone ram"
    assert not bool(sim._nonbarb_unit_plane()[0][b]), "a barbarian's shot reaches a lone Support chassis"
    guard = spawn(sim, FOE, sim._warrior_idx, b)
    assert bool(mask_of(sim, ROW, arch)[6 + db]), "beside a combat unit the tile is a target"
    order(sim, ROW, arch, 6 + db)
    assert int(sim.unit_hp[0, guard]) < 100 and int(sim.unit_hp[0, ram]) == 100, (
        "the combat unit beside the ram takes the shot")
    # a walled city's strike passes over a lone Medic for the warrior behind it
    sim = fresh(rules, path)
    at_war(sim, ROW, FOE)
    j = int(sim.city_alive[0, FOE].nonzero().flatten()[0])
    ctr = int(sim.city_center[0, FOE, j])
    d1 = [t for t in range(sim.T) if int(sim.pair_dist[ctr, t]) == 1 and bare(sim, t)]
    d2 = [t for t in range(sim.T) if int(sim.pair_dist[ctr, t]) == 2 and bare(sim, t)]
    med = spawn(sim, ROW, type_id(sim, "MEDIC"), d1[0])
    war = spawn(sim, ROW, sim._warrior_idx, d2[0])
    col = torch.full((sim.B,), j, dtype=torch.long)
    sim._seat_city_strike(FOE, col, torch.ones(sim.B, dtype=torch.bool), "cstk")
    assert int(sim.unit_hp[0, med]) == 100, "the city's strike took a lone Medic"
    assert int(sim.unit_hp[0, war]) < 100, "the city's strike held fire at the warrior"
    print("  5 a shot from the ground never takes a lone Support chassis OK (the mask, the order, "
          "the raider's reach, the city's strike)")
    print("RELIGIOUS TARGET OK — no shot at a civilian or a lone Support chassis, the melee move, "
          "Condemn on its own tile")


if __name__ == "__main__":
    main()
