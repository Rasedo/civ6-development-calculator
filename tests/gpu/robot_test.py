"""THE GIANT DEATH ROBOT — the GPU halves of C-33.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/robot_test.py

The TS twin is tests/cpu/units/robot.test.ts. Nothing here is gate-reachable —
the chassis needs Robotics and its four upgrades the Future era, which no seed
enters inside 250 turns — so every clause is pinned on the tensors.

Proven here:
  * the wire carries the four upgrades BY NAME, and `_gdr_u_*` resolve to them;
  * `_gdr_has` is the SEAT's tech and this chassis only — a rival's robot and
    the seat's other units are both unmoved by it;
  * Drone Air Defense raises `_anti_air_at` to 130;
  * the Particle Beam waives the city penalty in `_city_ranged_strength` and
    adds +30, leaving every other chassis where it was;
  * Reinforced Armor Plating pays +10 defending against land and naval units
    and nothing against a plane;
  * the chassis's own -17 against naval units, with no upgrade behind it;
  * Enhanced Mobility pays +3 Moves in `_full_mp` and opens a mountain hex in
    the MOVE mask;
  * the robot earns no experience and forms no Corps.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, fixture_paths, FIXTURES
from warmup import settle_all


def fresh(rules, path, n: int = 1) -> BatchSim:
    return BatchSim([load_fixture(path) for _ in range(n)], rules, device="cpu",
                    dtype=torch.float64)


def place_mil(sim, seat: int, t: int, type_idx: int, hp: int = 100) -> int:
    slot = int(sim.unit_next[0])
    sim.major_unit_alive[0, slot] = True
    sim.major_unit_seat[0, slot] = seat
    sim.major_unit_type[0, slot] = type_idx
    sim.major_unit_tile[0, slot] = t
    sim.major_unit_hp[0, slot] = hp
    sim.major_unit_charges[0, slot] = 0
    sim.major_unit_fortify[0, slot] = 0
    sim.major_unit_emb[0, slot] = False
    sim.major_unit_mp[0, slot] = float(sim._full_mp("major")[0, slot])
    sim.military_at[0, t] = slot + sim.POOL_LO["major"]
    sim.unit_next[0] += 1
    return slot


def L(sim, x) -> torch.Tensor:
    return torch.tensor([x], dtype=torch.long, device=sim.device)


def main() -> int:
    rules = load_rules()
    rj = json.load(open(FIXTURES / "rules.json", encoding="utf-8"))
    paths = fixture_paths()
    b, row, foe = 0, 0, 1

    units = rj["units"]
    gdr = next(i for i, u in enumerate(units) if int(u.get("gdr", 0)))
    land_r = next(i for i, u in enumerate(units)
                  if int(u.get("rangedStrength", u.get("ranged", 0)) or 0) > 0
                  and not int(u.get("naval", 0)) and not int(u.get("gdr", 0))
                  and not int(u.get("bombard", 0)) and not int(u.get("air", 0)))
    navy = next(i for i, u in enumerate(units) if int(u.get("naval", 0)))
    plane = next(i for i, u in enumerate(units) if int(u.get("air", 0)))
    foot = next(i for i, u in enumerate(units)
                if int(u.get("combat", 0)) > 0 and not int(u.get("naval", 0))
                and not int(u.get("air", 0)) and not int(u.get("gdr", 0)))

    # --- 1) the wire, and the names the engine addresses it by --------------
    g = rj["gdr"]
    assert g["upgradeId"] == ["DRONE_AIR_DEFENSE", "PARTICLE_BEAM",
                              "ENHANCED_MOBILITY", "REINFORCED_ARMOR"]
    assert len(g["upgradeTech"]) == 4 and all(int(x) >= 0 for x in g["upgradeTech"]), \
        f"every upgrade needs a real tech: {g['upgradeTech']}"
    assert (int(g["droneAA"]), int(g["particleBeamCS"]), int(g["enhancedMoves"]),
            int(g["armorPlatingCS"]), int(g["navalPenalty"])) == (130, 30, 3, 10, 17)
    s1 = fresh(rules, paths[0])
    assert (s1._gdr_u_drone, s1._gdr_u_beam, s1._gdr_u_moves, s1._gdr_u_armor) == (0, 1, 2, 3)
    assert s1._gdr_idx == gdr, f"_gdr_idx {s1._gdr_idx} vs wire row {gdr}"
    print("  1 wire OK (4 upgrades by name, 130/30/3/10/17)")

    # --- 2) the upgrade is the SEAT's tech, and this chassis alone -----------
    s2 = fresh(rules, paths[0])
    _tk = s2._gdr_upgrade_tech[s2._gdr_u_armor]
    assert not bool(s2._gdr_has(L(s2, gdr), L(s2, row), s2._gdr_u_armor)[0])
    s2.civ_techs[b, row, _tk] = True
    assert bool(s2._gdr_has(L(s2, gdr), L(s2, row), s2._gdr_u_armor)[0]), "the seat's own tech"
    assert not bool(s2._gdr_has(L(s2, gdr), L(s2, foe), s2._gdr_u_armor)[0]), \
        "a rival's robot is unmoved"
    assert not bool(s2._gdr_has(L(s2, foot), L(s2, row), s2._gdr_u_armor)[0]), \
        "and it reaches this chassis only"
    assert not bool(s2._gdr_has(L(s2, gdr), L(s2, -1), s2._gdr_u_armor)[0]), "NO_SEAT holds nothing"
    print("  2 the upgrade predicate OK (seat tech, this chassis, no barbarian)")

    # --- 3) Drone Air Defense ----------------------------------------------
    s3 = fresh(rules, paths[0])
    base_aa = int(s3._type_anti_air[gdr])
    assert base_aa > 0, "the chassis carries an Anti-Air stat of its own"
    assert int(s3._anti_air_at(L(s3, gdr), L(s3, row))[0]) == base_aa
    s3.civ_techs[b, row, s3._gdr_upgrade_tech[s3._gdr_u_drone]] = True
    # CIV6: "Anti-Air Defense Strength increased to 130."
    assert int(s3._anti_air_at(L(s3, gdr), L(s3, row))[0]) == 130
    assert int(s3._anti_air_at(L(s3, foot), L(s3, row))[0]) == int(s3._type_anti_air[foot])
    print("  3 Drone Air Defense OK (130, this chassis only)")

    # --- 4) the Particle Beam Siege Cannon ----------------------------------
    s4 = fresh(rules, paths[0])
    pen = int(s4._ranged_city_pen)
    rs = int(s4._type_ranged_strength[gdr])
    assert float(s4._city_ranged_strength(L(s4, gdr), L(s4, row), L(s4, 100))[0]) == rs - pen
    s4.civ_techs[b, row, s4._gdr_upgrade_tech[s4._gdr_u_beam]] = True
    # CIV6: "Ranged attacks against Cities and Encampments are 100% effective
    # and gain +30 Ranged Strength."
    for outer in (100, 0):
        assert float(s4._city_ranged_strength(L(s4, gdr), L(s4, row), L(s4, outer))[0]) == rs + 30
    lr = int(s4._type_ranged_strength[land_r])
    assert float(s4._city_ranged_strength(L(s4, land_r), L(s4, row), L(s4, 100))[0]) == lr - pen, \
        "no other chassis moves"
    # and the beam rides the MELEE assault too — one adder, asked by both
    assert int(s4._gdr_beam_cs(L(s4, gdr), L(s4, row))[0]) == 30
    assert int(s4._gdr_beam_cs(L(s4, foot), L(s4, row))[0]) == 0
    print("  4 Particle Beam OK (penalty waived, +30, melee and ranged)")

    # --- 5) Reinforced Armor Plating, and the chassis's own naval penalty ----
    s5 = fresh(rules, paths[0])
    assert int(s5._gdr_armor_cs(L(s5, gdr), L(s5, row), L(s5, foot))[0]) == 0
    s5.civ_techs[b, row, s5._gdr_upgrade_tech[s5._gdr_u_armor]] = True
    # CIV6: "+10 Combat Strength when defending against land and naval units."
    assert int(s5._gdr_armor_cs(L(s5, gdr), L(s5, row), L(s5, foot))[0]) == 10
    assert int(s5._gdr_armor_cs(L(s5, gdr), L(s5, row), L(s5, navy))[0]) == 10
    assert int(s5._gdr_armor_cs(L(s5, gdr), L(s5, row), L(s5, plane))[0]) == 0, "a plane is neither"
    assert int(s5._gdr_armor_cs(L(s5, gdr), L(s5, row), L(s5, -1))[0]) == 0, "and neither is a city"
    # CIV6: "-17 Ranged Strength against District defenses and naval units" —
    # no upgrade behind it, and the district half is `_ranged_city_pen`.
    s6 = fresh(rules, paths[0])
    assert int(s6._gdr_naval_cs(L(s6, gdr), L(s6, navy))[0]) == -17
    assert int(s6._gdr_naval_cs(L(s6, gdr), L(s6, foot))[0]) == 0
    assert int(s6._gdr_naval_cs(L(s6, land_r), L(s6, navy))[0]) == 0
    print("  5 armor plating + the naval penalty OK")

    # --- 6) Enhanced Mobility: the moves, and the mountain ------------------
    s7 = settle_all(fresh(rules, paths[0]))
    # a free land tile with a MOUNTAIN neighbour
    stand = -1
    d_mtn = -1
    for t in range(s7.T):
        if not (bool(s7.passable[b, t]) and not bool(s7.water[b, t])
                and int(s7.military_at[b, t]) < 0 and int(s7.district[b, t]) < 0):
            continue
        for d in range(6):
            n = int(s7.neigh[t, d])
            if n >= 0 and bool(s7.tile_mountain[b, n]):
                stand, d_mtn = t, d
                break
        if stand >= 0:
            break
    assert stand >= 0, "the fixture must hold a land tile beside a mountain"
    u = place_mil(s7, row, stand, gdr)
    before = float(s7._full_mp("major")[b, u])
    assert before == float(s7._mp_scale * s7._type_moves[gdr])
    smap = s7._seat_slot_map(row)
    rank = int((smap[b] == u).nonzero(as_tuple=True)[0][0])
    col = s7._act[f"MOVE_{d_mtn}"]
    assert not bool(s7._seat_unit_mask(row)[b, rank, col]), "a mountain is shut to everyone"
    s7.civ_techs[b, row, s7._gdr_upgrade_tech[s7._gdr_u_moves]] = True
    # CIV6: "+3 Moves. Can perform a Jump action to cross over mountain terrain."
    assert float(s7._full_mp("major")[b, u]) == before + float(s7._mp_scale * 3)
    s7.major_unit_mp[b, u] = float(s7._full_mp("major")[b, u])
    assert bool(s7._seat_unit_mask(row)[b, rank, col]), "the jump opens the hex"
    print(f"  6 Enhanced Mobility OK (+3 Moves, mountain hex {d_mtn} opens)")

    # --- 7) no experience, and no formation ---------------------------------
    s8 = settle_all(fresh(rules, paths[0]))
    assert not bool(s8._xp_eligible(L(s8, gdr))[0]), \
        "CIV6: 'Cannot earn experience or Promotions'"
    assert bool(s8._xp_eligible(L(s8, foot))[0]), "and every other chassis still does"
    # the FORM_UP column, with a same-type neighbour and the civic in hand
    tgt = -1
    for t in range(s8.T):
        if not (bool(s8.passable[b, t]) and not bool(s8.water[b, t])
                and int(s8.military_at[b, t]) < 0 and int(s8.district[b, t]) < 0):
            continue
        for d in range(6):
            n = int(s8.neigh[t, d])
            if (n >= 0 and bool(s8.passable[b, n]) and not bool(s8.water[b, n])
                    and int(s8.military_at[b, n]) < 0 and int(s8.district[b, n]) < 0):
                tgt = t
                d_nb = d
                break
        if tgt >= 0:
            break
    assert tgt >= 0, "the fixture must hold two free adjacent land tiles"
    for _k, _ci in enumerate(s8._formation_civic):
        if _ci >= 0:
            s8.civ_civics[b, row, _ci] = True
    a = place_mil(s8, row, tgt, gdr)
    place_mil(s8, row, int(s8.neigh[tgt, d_nb]), gdr)
    smap = s8._seat_slot_map(row)
    rank = int((smap[b] == a).nonzero(as_tuple=True)[0][0])
    fcol = s8._act[f"FORM_UP_{d_nb}"]
    assert not bool(s8._seat_unit_mask(row)[b, rank, fcol]), \
        "CIV6: 'Cannot form Corps or Armies by any means'"
    # the same pair of any other chassis DOES form
    s9 = settle_all(fresh(rules, paths[0]))
    for _k, _ci in enumerate(s9._formation_civic):
        if _ci >= 0:
            s9.civ_civics[b, row, _ci] = True
    a2 = place_mil(s9, row, tgt, foot)
    place_mil(s9, row, int(s9.neigh[tgt, d_nb]), foot)
    smap2 = s9._seat_slot_map(row)
    rank2 = int((smap2[b] == a2).nonzero(as_tuple=True)[0][0])
    assert bool(s9._seat_unit_mask(row)[b, rank2, fcol]), \
        "the ban is the chassis, not the fixture"
    print("  7 no experience, no formation OK")

    print("BATTERY OK robot")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
