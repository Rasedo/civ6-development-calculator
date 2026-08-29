"""THE PROMOTION EFFECTS THAT ARE NOT COMBAT STRENGTH.

    python tests/gpu/promo_effects_test.py

tests/gpu/promotions_test.py proves the ladder, the head and the Combat
Strength evaluator. This lane proves the OTHER seventeen effect kinds — the ones that
move a unit further, let it scale a cliff, keep its turn after a blow, heal it
on foreign ground, or change what a religious spread does — each on the body
that reads it, because a scripted 250-turn game reaches a tier-4 promotion at
best by accident.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))

from core import BatchSim, load_rules, load_fixture, fixture_paths
from core.simbase import BARB_SEAT
from warmup import settle_all

ROW = 0


def build():
    rules = load_rules()
    sim = settle_all(BatchSim([load_fixture(p) for p in fixture_paths()[:1]],
                              rules, device="cpu", dtype=torch.float64))
    for _ in range(10):
        sim.step()
    return sim


def cls_of(sim, name: str) -> int:
    return list(sim.rules.promo_classes).index(name)


def col_with_kind(sim, cls_name: str, kind: str) -> tuple[int, int, int]:
    """(class, column, value) of the first row in `cls_name` carrying `kind`."""
    c = cls_of(sim, cls_name)
    ki = sim._pk[kind]
    rd = sim.rules_dev
    for k in range(int(rd.promo_rows[c])):
        hit = rd.promo_kind[c, k] == ki
        if bool(hit.any()):
            return c, k, int(rd.promo_v[c, k][hit].sum())
    raise AssertionError(f"{cls_name} carries no {kind} row")


def type_in_class(sim, name: str) -> int:
    c = cls_of(sim, name)
    hit = (sim.rules_dev.u_promo_class == c).nonzero(as_tuple=True)[0]
    assert hit.numel(), f"no chassis promotes from {name}"
    return int(hit[0])


def place(sim, tile: int, utype: int, seat: int, *, hp=100, charges=0, promos=0) -> int:
    slot = int(sim.unit_next[0])
    sim.unit_next[0] += 1
    sim.major_unit_alive[0, slot] = True
    sim.major_unit_seat[0, slot] = seat
    sim.major_unit_type[0, slot] = utype
    sim.major_unit_tile[0, slot] = tile
    sim.major_unit_hp[0, slot] = hp
    sim.major_unit_charges[0, slot] = charges
    sim.major_unit_mp[0, slot] = 4
    sim.major_unit_mp_full[0, slot] = 4
    sim.major_unit_attacks[0, slot] = 1
    sim.major_unit_promos[0, slot] = promos
    sim.major_unit_promo_offer[0, slot] = 0
    sim.major_unit_promo_used[0, slot] = 0
    sim.major_unit_level[0, slot] = 1
    plane = sim.civilian_at if bool(sim._type_civilian[utype]) else sim.military_at
    plane[0, tile] = slot + sim.POOL_LO["major"]
    return slot


def order(sim, row: int, slot: int, action: int) -> None:
    smap = sim._seat_slot_map(row)
    rank = int((smap[0] == slot + sim.POOL_LO["major"]).long().argmax())
    assert int(smap[0, rank]) == slot + sim.POOL_LO["major"], "the unit is not in the slot map"
    a = torch.full(smap.shape, -1, dtype=torch.long)
    a[0, rank] = action
    sim._apply_seat_unit_actions(row, a)


def free_tile(sim, near: int) -> int:
    for n in sim.neigh[near].tolist():
        if n >= 0 and bool(sim.passable[0, n]) and int(sim.military_at[0, n]) < 0 \
                and int(sim.civilian_at[0, n]) < 0:
            return n
    raise AssertionError("no free neighbour")


# ---------------------------------------------------------------- movement --
def test_moves(sim) -> None:
    _c, k, v = col_with_kind(sim, "LIGHT_CAV", "MOVES")
    assert v >= 1, "the MOVES row grants nothing"
    ty = type_in_class(sim, "LIGHT_CAV")
    ctr = int(sim.city_center[0, ROW, 0])
    slot = place(sim, free_tile(sim, ctr), ty, ROW)
    base = int(sim._full_mp("major")[0, slot])
    sim.major_unit_promos[0, slot] = 1 << k
    assert int(sim._full_mp("major")[0, slot]) == base + v, "the MOVES promotion did not reach the pool"
    sim.major_unit_alive[0, slot] = False
    print(f"  MOVES OK — the pool rose by {v}")


def test_terrain_move(sim) -> None:
    """Alpine and Ranger each waive ONE of `moveCostInto`'s two charges."""
    ty = type_in_class(sim, "RECON")
    _c, kh, _v = col_with_kind(sim, "RECON", "TERRAIN_MOVE_HILLS")
    _c2, kw, _v2 = col_with_kind(sim, "RECON", "TERRAIN_MOVE_WOODS")
    hills = (sim.hills[0] & sim.passable[0]).nonzero(as_tuple=True)[0]
    assert len(hills), "no hills on this map"
    dest = torch.tensor([int(hills[0])])
    frm = torch.tensor([int(sim.neigh[int(hills[0]), 0].clamp(min=0))])
    z = torch.zeros(1, dtype=torch.long)
    ut = torch.tensor([ty])
    plain, _r = sim._road_terms(frm, dest, z, ut, torch.zeros(1, dtype=torch.long))
    waived, _r2 = sim._road_terms(frm, dest, z, ut, torch.tensor([1 << kh]))
    assert int(plain[0]) >= 1, "the hills tile charges nothing to enter"
    assert int(waived[0]) == int(plain[0]) - 1, "Alpine did not waive the hills charge"
    # the WOODS waiver must NOT touch a hills-only charge
    woods_only, _r3 = sim._road_terms(frm, dest, z, ut, torch.tensor([1 << kw]))
    assert int(woods_only[0]) == int(plain[0]), "Ranger waived a HILLS charge"
    print(f"  TERRAIN_MOVE OK — hills {int(plain[0])} -> {int(waived[0])}, and Ranger left it alone")


def test_cliffs(sim) -> None:
    _c, k, _v = col_with_kind(sim, "MELEE", "CLIFFS")
    cur = torch.arange(sim.T).reshape(1, -1)
    nb6 = sim.neigh[cur.reshape(-1)].reshape(1, sim.T, 6)
    shut = sim._cliff_block_dirs(cur, nb6)
    if not bool(shut.any()):
        print("  CLIFFS skipped — this map closes no land/water edge")
        return
    waived = sim._cliff_block_dirs(cur, nb6, None, torch.ones(1, sim.T, dtype=torch.bool))
    assert not bool(waived.any()), "Commando did not scale the cliff"
    print(f"  CLIFFS OK — {int(shut.sum())} closed edges, all open to Commando (col {k})")


def test_sight(sim) -> None:
    _c, k, v = col_with_kind(sim, "RECON", "SIGHT")
    assert v >= 1, "the SIGHT row grants nothing"
    ctr = int(sim.city_center[0, ROW, 0])
    rows = torch.tensor([0])
    sim.seat_explored[0, ROW] = False
    sim._reveal_around(rows, ROW, torch.tensor([ctr]), 2)
    near = int(sim.seat_explored[0, ROW].sum())
    sim.seat_explored[0, ROW] = False
    sim._reveal_around(rows, ROW, torch.tensor([ctr]), torch.tensor([2 + v]))
    far = int(sim.seat_explored[0, ROW].sum())
    assert far > near, f"the wider sight revealed no more ({far} vs {near})"
    print(f"  SIGHT OK — radius 2 lifts {near} tiles, 2+{v} lifts {far}")


# ------------------------------------------------------------------ combat --
def test_move_after_attack(sim) -> None:
    _c, k, _v = col_with_kind(sim, "RECON", "MOVE_AFTER_ATTACK")
    ty = type_in_class(sim, "RECON")
    ctr = int(sim.city_center[0, ROW, 0])
    slot = place(sim, free_tile(sim, ctr), ty, ROW)
    fired = torch.zeros(sim.B, dtype=torch.bool)
    fired[0] = True
    sim._spend_attack("major", slot, fired)
    assert int(sim.major_unit_mp[0, slot]) == 0, "an ordinary blow left movement behind"
    sim.major_unit_mp[0, slot] = 4
    sim.major_unit_promos[0, slot] = 1 << k
    sim._spend_attack("major", slot, fired)
    assert int(sim.major_unit_mp[0, slot]) == 4, "Guerrilla's blow still consumed the turn"
    sim.major_unit_alive[0, slot] = False
    print("  MOVE_AFTER_ATTACK OK — the blow costs the turn without it and nothing with it")


def test_siege_move_shoot(sim) -> None:
    _c, k, _v = col_with_kind(sim, "SIEGE", "SIEGE_MOVE_SHOOT")
    ty = type_in_class(sim, "SIEGE")
    assert int(sim._type_bombard[ty]) > 0, "the SIEGE chassis does not bombard"
    ctr = int(sim.city_center[0, ROW, 0])
    slot = place(sim, free_tile(sim, ctr), ty, ROW)
    sim.major_unit_mp[0, slot] = 1  # spent since the refresh
    sim.major_unit_mp_full[0, slot] = 2
    assert not bool(sim._siege_may_shoot("major")[0, slot]), "a moved siege unit could still shoot"
    sim.major_unit_promos[0, slot] = 1 << k
    assert bool(sim._siege_may_shoot("major")[0, slot]), "Expert Crew cannot attack after moving"
    sim.major_unit_alive[0, slot] = False
    print("  SIEGE_MOVE_SHOOT OK — the gate lifts for Expert Crew only")


def test_heal_anywhere(sim) -> None:
    _c, k, _v = col_with_kind(sim, "NAVAL_MELEE", "HEAL_ANYWHERE")
    ty = type_in_class(sim, "NAVAL_MELEE")
    foreign = (sim.tile_seat[0] >= 0) & (sim.tile_seat[0] != ROW) & (sim.tile_seat[0] < 100)
    if not bool(foreign.any()):
        t = int((sim.tile_seat[0] < 0).nonzero(as_tuple=True)[0][0])
        sim.tile_seat[0, t] = ROW + 1
    else:
        t = int(foreign.nonzero(as_tuple=True)[0][0])
    slot = place(sim, t, ty, ROW, hp=50)
    assert int(sim._seat_heal("major")[0, slot]) == 5, "foreign ground does not pay 5"
    sim.major_unit_promos[0, slot] = 1 << k
    assert int(sim._seat_heal("major")[0, slot]) == 15, "Auxiliary Ships did not heal outside"
    sim.major_unit_alive[0, slot] = False
    print("  HEAL_ANYWHERE OK — 5 on foreign ground, 15 with the promotion")


def test_pillage_cheap(sim) -> None:
    _c, k, v = col_with_kind(sim, "LIGHT_CAV", "PILLAGE_CHEAP")
    assert v == 1, f"Depredation costs {v} MP, want the sourced 1"
    print(f"  PILLAGE_CHEAP OK — column {k} prices the raid at {v} MP")


# --------------------------------------------------------------- religious --
def test_chaplain(sim) -> None:
    _c, k, v = col_with_kind(sim, "APOSTLE", "CHAPLAIN")
    ctr = int(sim.city_center[0, ROW, 0])
    spot = free_tile(sim, ctr)
    mel = type_in_class(sim, "MELEE")
    hurt = place(sim, spot, mel, ROW, hp=50)
    base = int(sim._seat_heal("major")[0, hurt])
    ap_tile = free_tile(sim, spot)
    ap = place(sim, ap_tile, sim._apostle_idx, ROW, charges=3, promos=1 << k)
    assert int(sim._seat_heal("major")[0, hurt]) == base + v, "the Chaplain healed nobody"
    sim.major_unit_alive[0, hurt] = False
    sim.major_unit_alive[0, ap] = False
    sim.military_at[0, spot] = -1
    sim.civilian_at[0, ap_tile] = -1
    print(f"  CHAPLAIN OK — an adjacent apostle adds {v} HP")


def test_first_use(sim) -> None:
    """PILGRIM and INDULGENCE each pay a unit ONCE."""
    for cls_name, kind in (("APOSTLE", "PILGRIM"), ("APOSTLE", "INDULGENCE")):
        _c, k, v = col_with_kind(sim, cls_name, kind)
        ut = torch.tensor([sim._apostle_idx])
        pro = torch.tensor([1 << k])
        used = torch.zeros(1, dtype=torch.long)
        got, used2 = sim._promo_first_use(ut, pro, used, kind)
        assert int(got[0]) == v, f"{kind} paid {int(got[0])}, want {v}"
        assert int(used2[0]) == (1 << k), f"{kind} did not stamp its column"
        again, used3 = sim._promo_first_use(ut, pro, used2, kind)
        assert int(again[0]) == 0, f"{kind} paid twice"
        assert int(used3[0]) == int(used2[0]), "the stamp moved on a second read"
    print("  PILGRIM / INDULGENCE OK — each pays once and stamps its own column")


def test_spread_promos(sim) -> None:
    """ORATOR's charges, TRANSLATOR's multiplier and PROSELYTIZER's strip."""
    _c, ko, vo = col_with_kind(sim, "APOSTLE", "SPREAD_CHARGES")
    _c1, kt, vt = col_with_kind(sim, "APOSTLE", "TRANSLATOR")
    _c2, kp, vp = col_with_kind(sim, "APOSTLE", "PROSELYTIZER")
    assert vt == 3 and vp == 75 and vo == 2, f"sourced values moved: {vo}/{vt}/{vp}"
    sim.civ_religion_done[:, ROW] = True

    # ORATOR arrives with the CHOICE, at the PROMOTE column
    ctr = int(sim.city_center[0, ROW, 0])
    ap = place(sim, ctr, sim._apostle_idx, ROW, charges=1)
    sim.major_unit_promo_offer[0, ap] = 1 << ko
    sim.major_unit_xp[0, ap] = 15
    sim.seat_ext[:, ROW] = True
    order(sim, ROW, ap, sim._A_PROMOTE + ko)
    assert int(sim.major_unit_promos[0, ap]) == (1 << ko), "the Orator column did not land"
    assert int(sim.major_unit_charges[0, ap]) == 1 + vo, "Orator brought no extra spreads"
    sim.major_unit_alive[0, ap] = False
    sim.civilian_at[0, ctr] = -1

    # TRANSLATOR triples the lump in a FOREIGN city, PROSELYTIZER strips the rest
    other = 1 if sim.n_majors > 1 else 0
    assert other != ROW, "this fixture has one major — the foreign-city arm cannot be reached"
    fctr = int(sim.city_center[0, other, 0])
    assert fctr >= 0 and bool(sim.city_alive[0, other, 0]), "no foreign city to spread into"
    near = free_tile(sim, fctr)
    lump = int(sim._enh["mlump"][int(sim.civ_enhancer[0, ROW]) + 1])

    sim.city_pressure[0, other, 0, :] = 0
    sim.city_pressure[0, other, 0, other] = 400
    ap2 = place(sim, near, sim._apostle_idx, ROW, charges=3,
                promos=(1 << kt) | (1 << kp))
    d = int((sim.neigh[near] == fctr).long().argmax())
    order(sim, ROW, ap2, sim._A_SPREAD + 1 + d)
    assert int(sim.city_pressure[0, other, 0, ROW]) == lump * vt, \
        f"the foreign spread landed {int(sim.city_pressure[0, other, 0, ROW])}, want {lump * vt}"
    assert int(sim.city_pressure[0, other, 0, other]) == 400 * (100 - vp) // 100, \
        "Proselytizer left the other religion standing"
    sim.major_unit_alive[0, ap2] = False
    sim.civilian_at[0, near] = -1
    print(f"  ORATOR / TRANSLATOR / PROSELYTIZER OK — +{vo} charges, x{vt} abroad, -{vp}% pressure")


def test_heathen(sim) -> None:
    """CIV6 (Heathen Conversion): every adjacent raider changes sides."""
    _c, k, _v = col_with_kind(sim, "APOSTLE", "HEATHEN")
    assert sim._A_HEATHEN >= 0, "no CONVERT_HEATHEN column in the enum"
    ctr = int(sim.city_center[0, ROW, 0])
    spot = free_tile(sim, ctr)
    ap = place(sim, spot, sim._apostle_idx, ROW, charges=2, promos=1 << k)
    # two raiders, on two different neighbours
    barbs = []
    for n in sim.neigh[spot].tolist():
        if n < 0 or not bool(sim.passable[0, n]) or int(sim.military_at[0, n]) >= 0:
            continue
        b = int(sim.next_slot[0])
        sim.next_slot[0] += 1
        gslot = b + sim.POOL_LO["barb"]
        sim.barb_unit_alive[0, b] = True
        sim.barb_unit_seat[0, b] = BARB_SEAT
        sim.barb_unit_type[0, b] = int(sim.major_unit_type[0, ap]) * 0 + 2
        sim.barb_unit_tile[0, b] = n
        sim.barb_unit_hp[0, b] = 70
        sim.barb_unit_fortify[0, b] = 2
        sim.military_at[0, n] = gslot
        barbs.append((b, n, gslot))
        if len(barbs) == 2:
            break
    assert len(barbs) == 2, "no room for two raiders beside the apostle"

    sim.seat_ext[:, ROW] = True
    um = sim._seat_unit_mask(ROW)
    smap = sim._seat_slot_map(ROW)
    rank = int((smap[0] == ap + sim.POOL_LO["major"]).long().argmax())
    assert bool(um[0, rank, sim._A_HEATHEN]), "the mask refuses a legal conversion"

    order(sim, ROW, ap, sim._A_HEATHEN)
    for b, n, gslot in barbs:
        assert not bool(sim.unit_alive[0, gslot]), "the raider kept its barbarian slot"
        held = int(sim.military_at[0, n])
        assert held >= 0, f"tile {n} lost its unit"
        assert int(sim.unit_seat[0, held]) == ROW, "the convert did not change sides"
        assert held < sim.POOL_LO["barb"], "the convert stayed in the barbarian pool"
        assert int(sim.unit_hp[0, held]) == 70, "the convert lost the damage it carried"
        assert int(sim.unit_mp[0, held]) == 0, "the convert kept a turn it no longer has"
        assert int(sim.unit_fortify[0, held]) == 0, \
            "the convert kept the fortification it dug in for the barbarians"
    assert int(sim.major_unit_charges[0, ap]) == 1, "the conversion cost no charge"
    assert int(sim.major_unit_mp[0, ap]) == 0, "the conversion left the turn unspent"
    print("  HEATHEN OK — both raiders changed sides for one charge, undug and spent")


def test_range(sim) -> None:
    _c, k, v = col_with_kind(sim, "SIEGE", "RANGE")
    assert v == 1, f"Forward Observers grants {v}, want the sourced 1"
    ut = torch.tensor([type_in_class(sim, "SIEGE")])
    assert int(sim._promo_val(ut, torch.tensor([1 << k]), "RANGE")[0]) == 1, \
        "the RANGE value does not reach the evaluator"
    print(f"  RANGE OK — column {k} adds {v} to the chassis reach")


# ------------------------------------------------------------ the monk tree --
def test_extra_attack(sim) -> None:
    """CIV6 (Sweeping Wind): "+1 additional attack per turn if Movement
    allows." Every other unit gets exactly one, and MOVE_AFTER_ATTACK buys
    movement, never a second blow."""
    _c, k, v = col_with_kind(sim, "MONK", "EXTRA_ATTACK")
    assert v == 1, f"Sweeping Wind should add ONE attack, not {v}"
    ty = type_in_class(sim, "MONK")
    ctr = int(sim.city_center[0, ROW, 0])
    slot = place(sim, free_tile(sim, ctr), ty, ROW)
    fired = torch.zeros(sim.B, dtype=torch.bool)
    fired[0] = True
    assert int(sim._full_attacks("major")[0, slot]) == 1, "a plain unit gets one attack"
    sim._spend_one_attack("major", slot, fired)
    assert int(sim.major_unit_attacks[0, slot]) == 0, "the blow did not spend the attack"
    sim._spend_one_attack("major", slot, fired)
    assert int(sim.major_unit_attacks[0, slot]) == 0, "the counter went negative"
    sim.major_unit_promos[0, slot] = 1 << k
    assert int(sim._full_attacks("major")[0, slot]) == 2, "Sweeping Wind bought nothing"
    sim.major_unit_alive[0, slot] = False
    print("  EXTRA_ATTACK OK — one blow a turn, two with Sweeping Wind")


def test_stealth_promo(sim) -> None:
    """CIV6 (Twilight Veil): "Only adjacent enemy units can reveal this unit"
    — and a blow gives it away for the turn."""
    _c, k, _v = col_with_kind(sim, "MONK", "STEALTH")
    ty = type_in_class(sim, "MONK")
    assert sim._stealth_live, "the veil must arm the stealth machinery"
    ctr = int(sim.city_center[0, ROW, 0])
    hide = free_tile(sim, ctr)
    slot = place(sim, hide, ty, ROW, promos=1 << k)
    sim.major_unit_revealed_turn[0, slot] = -1
    # an enemy TWO tiles away sees nothing; the same enemy adjacent does
    far = next(x for x in range(sim.T)
               if int(sim.pair_dist[hide, x]) == 2 and bool(sim.passable[0, x])
               and int(sim.military_at[0, x]) < 0)
    near = free_tile(sim, hide)
    eye = place(sim, far, type_in_class(sim, "RECON"), 1)
    assert bool(sim._stealth_hidden(1)[0, hide]), "a veiled unit was visible at range 2"
    sim._occ_clear(torch.tensor([0]), torch.tensor([far]),
                   torch.tensor([eye + sim.POOL_LO["major"]]))
    sim.major_unit_tile[0, eye] = near
    sim._occ_set(torch.tensor([0]), torch.tensor([near]),
                 torch.tensor([eye + sim.POOL_LO["major"]]))
    assert not bool(sim._stealth_hidden(1)[0, hide]), "an ADJACENT enemy must reveal it"
    # a blow reveals it wherever it stands
    sim.major_unit_tile[0, eye] = far
    sim._occ_clear(torch.tensor([0]), torch.tensor([near]),
                   torch.tensor([eye + sim.POOL_LO["major"]]))
    sim._occ_set(torch.tensor([0]), torch.tensor([far]),
                 torch.tensor([eye + sim.POOL_LO["major"]]))
    assert bool(sim._stealth_hidden(1)[0, hide])
    fired = torch.zeros(sim.B, dtype=torch.bool)
    fired[0] = True
    sim._spend_one_attack("major", slot, fired)
    assert int(sim.major_unit_revealed_turn[0, slot]) == int(sim.turn), \
        "the blow did not mark the hider"
    assert not bool(sim._stealth_hidden(1)[0, hide]), "a hider that attacked is seen"
    sim.major_unit_alive[0, slot] = False
    sim.major_unit_alive[0, eye] = False
    sim._occ_clear(torch.tensor([0, 0]), torch.tensor([hide, far]),
                   torch.tensor([slot + sim.POOL_LO["major"], eye + sim.POOL_LO["major"]]))
    print("  STEALTH OK — adjacency reveals, and so does its own blow")


def test_kill_spread(sim) -> None:
    """CIV6 (Disciples): 250 Religious Pressure "to cities within 10 hexes when
    it kills a non-Barbarian unit"."""
    _c, k, v = col_with_kind(sim, "MONK", "KILL_SPREAD")
    assert v == 250, f"Disciples should apply 250 pressure, not {v}"
    ty = type_in_class(sim, "MONK")
    ctr = int(sim.city_center[0, ROW, 0])
    sim.civ_religion_done[0, ROW] = True
    sim.city_pressure[0, ROW, 0, ROW] = 0
    killed = torch.zeros(sim.B, dtype=torch.bool)
    killed[0] = True
    tile = torch.full((sim.B,), ctr, dtype=torch.long)
    seat = torch.zeros(sim.B, dtype=torch.long)
    kt = torch.full((sim.B,), ty, dtype=torch.long)
    kp = torch.full((sim.B,), 1 << k, dtype=torch.long)
    barb = torch.zeros(sim.B, dtype=torch.bool)
    sim._disciples_spread(seat, kt, kp, barb, tile, killed)
    assert int(sim.city_pressure[0, ROW, 0, ROW]) == v, "the kill spread nothing"
    # a BARBARIAN victim pays nothing, and neither does a monk without the row
    sim._disciples_spread(seat, kt, kp, ~barb, tile, killed)
    sim._disciples_spread(seat, kt, torch.zeros_like(kp), barb, tile, killed)
    assert int(sim.city_pressure[0, ROW, 0, ROW]) == v, "a barbarian kill spread"
    sim.city_pressure[0, ROW, 0, ROW] = 0
    print("  KILL_SPREAD OK — a non-barbarian kill preaches, a barbarian one does not")


def test_extra_attack_still(sim) -> None:
    """CIV6 (Expert Marksman): "+1 additional attack per turn if unit has not
    moved" — the refresh hands it out and the first step takes it back, while
    Breakthrough's "if Movement allows" survives the same step."""
    _c, k, v = col_with_kind(sim, "RANGED", "EXTRA_ATTACK_STILL")
    assert v == 1, f"Expert Marksman should add ONE attack, not {v}"
    ok = torch.zeros(sim.B, dtype=torch.bool)
    ok[0] = True
    ctr = int(sim.city_center[0, ROW, 0])

    def walk(slot: int, here: int) -> int:
        dest = free_tile(sim, here)
        gs = torch.full((sim.B,), slot + sim.POOL_LO["major"], dtype=torch.long)
        moved = sim._step_verb(
            ok, gs, torch.full((sim.B,), here, dtype=torch.long),
            torch.full((sim.B,), dest, dtype=torch.long),
            torch.full((sim.B,), sim.neigh[here].tolist().index(dest), dtype=torch.long),
            ROW, torch.ones(sim.B, dtype=torch.bool))
        assert bool(moved[0]), "the step refused"
        return dest

    here = free_tile(sim, ctr)
    slot = place(sim, here, type_in_class(sim, "RANGED"), ROW, promos=1 << k)
    sim._reset_mp("major")
    assert int(sim.major_unit_attacks[0, slot]) == 2, "the refresh withheld the still-bonus"
    # "It can still move BEFORE it attacks, however."
    here = walk(slot, here)
    assert int(sim.major_unit_attacks[0, slot]) == 2, "a step before the blow cost an attack"
    sim.major_unit_attacks[0, slot] = 1                       # one blow struck
    sim.major_unit_mp[0, slot] = 4
    here = walk(slot, here)
    assert int(sim.major_unit_attacks[0, slot]) == 0, "the step kept the still-bonus"
    # Breakthrough's is not a still-bonus, so the same step leaves it alone
    _c2, k2, _v2 = col_with_kind(sim, "HEAVY_CAV", "EXTRA_ATTACK")
    here2 = free_tile(sim, ctr)
    slot2 = place(sim, here2, type_in_class(sim, "HEAVY_CAV"), ROW, promos=1 << k2)
    sim._reset_mp("major")
    assert int(sim.major_unit_attacks[0, slot2]) == 2
    sim.major_unit_attacks[0, slot2] = 1
    here2 = walk(slot2, here2)
    assert int(sim.major_unit_attacks[0, slot2]) == 1, "a step took Breakthrough's attack"
    for s, tl in ((slot, here), (slot2, here2)):
        sim.major_unit_alive[0, s] = False
        sim._occ_clear(torch.tensor([0]), torch.tensor([tl]),
                       torch.tensor([s + sim.POOL_LO["major"]]))
    print("  EXTRA_ATTACK_STILL OK — a step before the blow is free, one after revokes it")


def main() -> None:
    sim = build()
    test_moves(sim)
    test_terrain_move(sim)
    test_cliffs(sim)
    test_sight(sim)
    test_move_after_attack(sim)
    test_siege_move_shoot(sim)
    test_heal_anywhere(sim)
    test_pillage_cheap(sim)
    test_range(sim)
    test_chaplain(sim)
    test_first_use(sim)
    test_spread_promos(sim)
    test_heathen(sim)
    test_extra_attack(sim)
    test_extra_attack_still(sim)
    test_stealth_promo(sim)
    test_kill_spread(sim)
    print("PROMO EFFECTS OK")


if __name__ == "__main__":
    main()
