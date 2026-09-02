"""THE UNIQUE UNITS on the GPU engine — the twin of tests/cpu/units/uniques.test.ts.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/uniques_test.py

Checks:
  A. `row_civ` reads the fixture's `leader`; `_civ_unit_ok` hands each unique
     to its civilization and removes the chassis it replaces there; a
     city-state row trains no unique.
  B. `_up_to_row` lands the upgrade on the civilization's replacement and
     `_seat_trainable_units` / the production mask follow `_civ_unit_ok`.
  C. the chariot classes are cavalry but not an anti-cavalry target; the
     Heavy Chariot halts in enemy ZOC where the War-Cart, the Maryannu and the
     Longship walk through.
  D. `_start_tile_mp`: open flat ground pays the chariots, hills and snow do
     not; the Berserker draws +2 in enemy territory only at war; the Longship
     +1 on coast only.
  E. Berserker Rage: `_chassis_atk_cs_pool` reads +10, `_type_def_melee_cs` -5.
  F. the Legion is military with one charge, lays the FORT column on the
     engineer's ground without the Fort's tech, and outlives the charge.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import load_rules, fixture_paths  # noqa: E402
from engineer_test import retype, mask_of, order, clear_tile, own_flat, neutral_flat  # noqa: E402


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


def stand(sim, row, ty, tile):
    """A live row-`row` unit retyped to `ty` on `tile`, registered on the
    occupancy plane its domain owns."""
    v = retype(sim, row, ty, tile)
    lo = sim.POOL_LO["major"]
    sim.civilian_at[0, tile] = -1
    sim.military_at[0, tile] = -1
    if bool(sim._type_civilian[ty]):
        sim.civilian_at[0, tile] = v + lo
    else:
        sim.military_at[0, tile] = v + lo
    sim._gen_ver += 1
    return v


def main() -> None:
    rules = load_rules()
    path = fixture_paths()[0]
    U = {u["id"]: i for i, u in enumerate(rules.units)}
    sim = fresh(rules, path)
    R = sim.n_majors
    rome, egypt, norway = 0, 1, 2
    play(sim, rome, "ROME")
    play(sim, egypt, "EGYPT")
    play(sim, norway, "NORWAY")
    assert all(int(sim.row_civ[0, r]) >= 0 for r in range(R)), "every major plays a civilization"
    cs_row = R
    assert int(sim.row_civ[0, cs_row]) < 0, "a city-state row plays none"

    # -- A: who may train what ---------------------------------------------
    def ok(row, uid):
        return bool(sim._civ_unit_ok(row)[0, U[uid]])

    assert ok(rome, "LEGION") and not ok(rome, "SWORDSMAN")
    assert ok(egypt, "SWORDSMAN") and not ok(egypt, "LEGION")
    assert ok(egypt, "MARYANNU_CHARIOT_ARCHER") and not ok(rome, "MARYANNU_CHARIOT_ARCHER")
    assert ok(norway, "LONGSHIP") and not ok(norway, "GALLEY")
    assert ok(norway, "BERSERKER") and not ok(norway, "MAN_AT_ARMS")
    assert ok(rome, "GALLEY") and ok(rome, "MAN_AT_ARMS")
    assert not ok(rome, "WAR_CART") and not ok(norway, "WAR_CART")
    assert ok(cs_row, "SWORDSMAN") and ok(cs_row, "GALLEY")
    for uid in ("LEGION", "MARYANNU_CHARIOT_ARCHER", "BERSERKER", "LONGSHIP", "WAR_CART"):
        assert not ok(cs_row, uid), f"a city-state row trains no unique ({uid})"
    print("  A civ_unit_ok OK")

    # -- B: the upgrade target and the two trainable masks -----------------
    assert int(sim._up_to_row(norway)[0, U["SWORDSMAN"]]) == U["BERSERKER"]
    assert int(sim._up_to_row(rome)[0, U["SWORDSMAN"]]) == U["MAN_AT_ARMS"]
    assert int(sim._up_to_row(rome)[0, U["WARRIOR"]]) == U["LEGION"]
    assert int(sim._up_to_row(norway)[0, U["LEGION"]]) == U["BERSERKER"]
    assert int(sim._up_to_row(cs_row)[0, U["SWORDSMAN"]]) == U["MAN_AT_ARMS"]
    assert int(sim._up_to_row(norway)[0, U["QUADRIREME"]]) == int(sim._type_up_to[U["QUADRIREME"]])
    wheel = int(sim._type_tech[U["MARYANNU_CHARIOT_ARCHER"]])
    assert wheel >= 0
    for r in (egypt, rome):
        sim.civ_techs[0, r, wheel] = True
    sim._gen_ver += 1
    assert bool(sim._seat_trainable_units(egypt)[0, U["MARYANNU_CHARIOT_ARCHER"]])
    assert not bool(sim._seat_trainable_units(rome)[0, U["MARYANNU_CHARIOT_ARCHER"]])
    assert bool(sim._seat_trainable_units(rome)[0, U["HEAVY_CHARIOT"]])
    pm_e = sim._trainable_units(egypt)
    pm_r = sim._trainable_units(rome)
    assert bool(pm_e[..., U["MARYANNU_CHARIOT_ARCHER"]].any()), "Egypt's production mask offers the Maryannu"
    assert not bool(pm_r[..., U["MARYANNU_CHARIOT_ARCHER"]].any()), "Rome's production mask does not"
    assert not bool(pm_r[..., U["SWORDSMAN"]].any()), "Rome never sees the Swordsman"
    print("  B upgrade target + trainable masks OK")

    # -- C: chariots vs the anti-cavalry bonus, and ZOC --------------------
    def cs(a, d):
        return int(sim._class_matchup_cs(torch.tensor([U[a]]), torch.tensor([U[d]]))[0])

    assert cs("SPEARMAN", "HORSEMAN") == 10
    assert cs("SPEARMAN", "HEAVY_CHARIOT") == 0
    assert cs("SPEARMAN", "WAR_CART") == 0
    assert cs("SPEARMAN", "MARYANNU_CHARIOT_ARCHER") == 10
    assert bool(sim._type_cavalry[U["HEAVY_CHARIOT"]]) and bool(sim._type_cavalry[U["WAR_CART"]])
    t_foe = own_flat(sim, egypt)
    clear_tile(sim, t_foe)
    stand(sim, egypt, U["WARRIOR"], t_foe)
    # CIV6 (Zone of Control): rivers block ZOC — the step must not cross one
    rm = sim.river_mask[0, t_foe] if sim.river_mask.dim() == 2 else sim.river_mask[t_foe]
    dest = next(int(x) for d, x in enumerate(sim.neigh[t_foe].tolist())
                if x >= 0 and not bool(sim.water[0, x]) and bool(sim.passable[0, x])
                and not ((int(rm) >> d) & 1))
    ra, rb = sim._seat_row[rome], sim._seat_row[egypt]
    sim.war[0, ra, rb] = sim.war[0, rb, ra] = True
    sim._gen_ver += 1

    def zoc(uid):
        return bool(sim._in_enemy_zoc(torch.tensor([dest]), rome, torch.tensor([U[uid]]))[0])

    assert zoc("HEAVY_CHARIOT"), "a Heavy Chariot halts in enemy ZOC"
    assert not zoc("HORSEMAN")
    assert not zoc("WAR_CART"), "CLASS_WAR_CART ignores ZOC"
    assert not zoc("MARYANNU_CHARIOT_ARCHER"), "CLASS_RANGED_CAVALRY ignores ZOC"
    assert not zoc("LONGSHIP"), "CLASS_LONGSHIP ignores ZOC"
    print("  C chariot matchup + ZOC OK")

    # -- D: the start-tile Movement ---------------------------------------
    mp = sim._mp_scale
    open_t = [int(t) for t in sim._open_terr.tolist()]
    flat = next(t for t in range(sim.T)
                if int(sim.terrain[0, t]) in open_t and not bool(sim.hills[0, t])
                and not bool(sim.water[0, t]) and bool(sim.passable[0, t]))
    hill = next(t for t in range(sim.T)
                if int(sim.terrain[0, t]) in open_t and bool(sim.hills[0, t]) and bool(sim.passable[0, t]))
    snow = next((t for t in range(sim.T)
                 if int(sim.terrain[0, t]) not in open_t and not bool(sim.hills[0, t])
                 and not bool(sim.water[0, t]) and bool(sim.passable[0, t])), -1)

    def full(row, uid, tile):
        v = stand(sim, row, U[uid], tile)
        return float(sim._full_mp("major")[0, v]) / mp

    assert full(rome, "HEAVY_CHARIOT", flat) == 3.0
    assert full(rome, "HEAVY_CHARIOT", hill) == 2.0
    if snow >= 0:
        assert full(rome, "HEAVY_CHARIOT", snow) == 2.0
    assert full(egypt, "MARYANNU_CHARIOT_ARCHER", flat) == 4.0
    assert full(rome, "WAR_CART", flat) == 4.0
    assert full(rome, "WARRIOR", flat) == 2.0
    theirs = own_flat(sim, egypt, avoid=(t_foe,))
    assert full(rome, "BERSERKER", theirs) == 4.0, "at war: +2 in enemy territory"
    sim.war[0, ra, rb] = sim.war[0, rb, ra] = False
    sim._gen_ver += 1
    assert full(rome, "BERSERKER", theirs) == 2.0, "at peace: their land is not 'enemy territory'"
    assert full(rome, "BERSERKER", own_flat(sim, rome)) == 2.0
    coast = next(t for t in range(sim.T) if int(sim.terrain[0, t]) == sim._coast_terr)
    ocean = next((t for t in range(sim.T)
                  if bool(sim.water[0, t]) and int(sim.terrain[0, t]) != sim._coast_terr), -1)
    assert full(norway, "LONGSHIP", coast) == 4.0, "+1 Movement while in coastal waters"
    assert full(norway, "GALLEY", coast) == 3.0
    if ocean >= 0:
        assert full(norway, "LONGSHIP", ocean) == 3.0
    print("  D start-tile Movement OK")

    # -- E: Berserker Rage ------------------------------------------------
    v = stand(sim, norway, U["BERSERKER"], own_flat(sim, norway))
    assert int(sim._chassis_atk_cs_pool("major", torch.tensor([v]))[0]) == 10
    assert int(sim._type_def_melee_cs[U["BERSERKER"]]) == -5
    v2 = stand(sim, norway, U["MAN_AT_ARMS"], own_flat(sim, norway))
    assert int(sim._chassis_atk_cs_pool("major", torch.tensor([v2]))[0]) == 0
    assert int(sim._type_def_melee_cs[U["MAN_AT_ARMS"]]) == 0
    print("  E Berserker Rage OK")

    # -- F: the Legion's Fort ---------------------------------------------
    sim = fresh(rules, path)
    FORT = sim.FORT
    assert FORT >= 0 and sim._imp_eng[FORT]
    assert not bool(sim._type_civilian[U["LEGION"]]) and int(sim._type_charges[U["LEGION"]]) == 1
    assert bool(sim._type_fort_builder[U["LEGION"]])
    t = own_flat(sim, rome)
    clear_tile(sim, t)
    v = stand(sim, rome, U["LEGION"], t)
    ut = int(sim._imp_unlock[FORT])
    if ut >= 0:
        sim.civ_techs[0, rome, ut] = False
    sim._gen_ver += 1
    um = mask_of(sim, rome, v)
    c_fort = sim._A_IMP[FORT]
    assert bool(um[c_fort]), "a Legion on bare own flat land is offered the Fort, no tech needed"
    others = [k for k, e in enumerate(sim._imp_eng) if e and k != FORT and sim._A_IMP[k] >= 0]
    for k in others:
        assert not bool(um[sim._A_IMP[k]]), "the Legion lays the Fort alone, not the engineer's other rows"
    v_sw = stand(sim, rome, U["SWORDSMAN"], t)
    assert v_sw == v
    assert not bool(mask_of(sim, rome, v_sw)[c_fort]), "a Swordsman lays nothing"
    stand(sim, rome, U["LEGION"], t)
    t_neu = neutral_flat(sim, avoid=(t,))
    clear_tile(sim, t_neu)
    stand(sim, rome, U["LEGION"], t_neu)
    assert bool(mask_of(sim, rome, v)[c_fort]), "the engineer's ground: neutral tiles too"
    order(sim, rome, v, c_fort)
    assert int(sim.improvement[0, t_neu]) == FORT, "the Fort was not placed"
    assert int(sim.major_unit_charges[0, v]) == 0, "the charge is spent"
    assert float(sim.major_unit_mp[0, v]) == 0.0, "the turn is spent"
    assert bool(sim.major_unit_alive[0, v]), "a military chassis outlives its last charge"
    assert not bool(mask_of(sim, rome, v)[c_fort]), "no charge, no second Fort"
    print("  F Legion Fort OK")
    print("UNIQUES OK")


if __name__ == "__main__":
    main()
