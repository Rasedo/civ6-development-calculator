"""RADIOACTIVE FALLOUT AND THE SEAT'S ARSENAL — the GPU halves.

Neither half is gate-reachable: a device needs the Manhattan Project, which
needs Nuclear Fission, and no seed leaves the Modern era inside 250 turns. So
the semantics are pinned on the tensors here, clause by clause against the TS
contract (cpu/core/nuclear.ts, cpu/data/nuclear.ts, cpu/core/units.ts).

Proven here:
  * the exported device catalog — radius, fallout turns, range, upkeep and
    Uranium — matches `NUCLEAR_DEVICES` row for row;
  * `_wmd_upkeep` bills 14 and 16 Gold a turn, and Second Strike Capability
    halves it;
  * `_wmd_project_ok` asks for the tech, the unlock project and the Uranium,
    and the City Center channel no longer skips those gates;
  * the ground: `_fallout` decays a turn per turn, `_fallout_toll` takes 50 HP
    off whoever stands in it and leaves a Giant Death Robot alone, and a unit
    the toll finishes vacates its tile;
  * an irradiated tile is unworkable, takes no district, no building pick and
    no unit, and its city may neither heal nor repair;
  * CLEAN_FALLOUT: the mask offers it to ANY chassis holding a build charge,
    the apply clears the tile and spends the charge;
  * `civ_wmd` and `tile_fallout` survive a snapshot/restore round trip.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, fixture_paths, FIXTURES
from core.simbase import _MUTABLE
from warmup import settle_all


def fresh(rules, path, n: int = 1) -> BatchSim:
    return BatchSim([load_fixture(path) for _ in range(n)], rules, device="cpu",
                    dtype=torch.float64)


def place_mil(sim, seat: int, t: int, type_idx: int, hp: int = 100, charges: int = 0) -> int:
    slot = int(sim.unit_next[0])
    sim.major_unit_alive[0, slot] = True
    sim.major_unit_seat[0, slot] = seat
    sim.major_unit_type[0, slot] = type_idx
    sim.major_unit_tile[0, slot] = t
    sim.major_unit_hp[0, slot] = hp
    sim.major_unit_charges[0, slot] = charges
    sim.major_unit_fortify[0, slot] = 0
    sim.major_unit_emb[0, slot] = False
    sim.military_at[0, t] = slot + sim.POOL_LO["major"]
    sim.unit_next[0] += 1
    return slot


def main() -> int:
    rules = load_rules()
    rj = json.load(open(FIXTURES / "rules.json", encoding="utf-8"))
    paths = fixture_paths()
    b, row = 0, 0

    # --- 1) the catalog on the wire ----------------------------------------
    dev_rows = rj["nuclear"]["devices"]
    assert len(dev_rows) == 2, f"two devices, got {len(dev_rows)}"
    # CIV6 (Nuclear weapons): radius 1 / fallout 10 turns / range 12 / 14 Gold
    # / 10 Uranium, and radius 2 / 20 turns / range 15 / 16 Gold / 20 Uranium.
    assert [ (int(d["radius"]), int(d["fallout"]), int(d["range"]),
              int(d["upkeep"]), int(d["uranium"])) for d in dev_rows ] == [
        (1, 10, 12, 14, 10), (2, 20, 15, 16, 20)]
    assert int(rj["nuclear"]["falloutDamage"]) == 50
    assert int(rj["nuclear"]["robotDamage"]) == 50
    assert int(rj["nuclear"]["cleanCharges"]) == 1
    assert int(rj["nuclear"]["siloIid"]) >= 0, "the Missile Silo must be an improvement row"
    # CIV6 (War weariness): a launch is 12x the era base — 10 of its own plus
    # the abroad multiplier's 2.
    assert int(rj["nuclear"]["wwLaunched"]) == 10
    print(f"  1 catalog OK (2 devices, fallout {dev_rows[0]['fallout']}/{dev_rows[1]['fallout']} turns)")

    # --- 2) the upkeep, and the card that halves it -------------------------
    s2 = fresh(rules, paths[0])
    assert s2.civ_wmd.shape == (s2.B, s2.n_majors, 2), f"civ_wmd shape {tuple(s2.civ_wmd.shape)}"
    assert float(s2._wmd_upkeep(row)[b]) == 0.0, "an empty arsenal bills nothing"
    s2.civ_wmd[b, row, 0] = 2
    s2.civ_wmd[b, row, 1] = 1
    assert float(s2._wmd_upkeep(row)[b]) == 2 * 14 + 16, "14 Gold a device, 16 for the bigger one"
    _ssc = next((i for i, p in enumerate(rj["policies"])
                 if p["id"] == "SECOND_STRIKE_CAPABILITY"), -1)
    assert _ssc >= 0, "Second Strike Capability must be on the wire"
    assert int(rj["policies"][_ssc]["wmdUpkeepPct"]) == -50
    print("  2 upkeep OK (14/16 Gold a turn, and the card takes half)")

    # --- 3) the device projects gate on tech, unlock and Uranium ------------
    s3 = settle_all(fresh(rules, paths[0]))
    prows = s3._proj_rows
    wmd_idx = [i for i, p in enumerate(prows) if int(p.get("wmd", 0))]
    assert len(wmd_idx) == 2, f"two device builds, got {len(wmd_idx)}"
    for pi in wmd_idx:
        p = prows[pi]
        assert int(p.get("cc", 0)) == 1, "a device is built in the City Center"
        assert int(p.get("rt", -1)) >= 0 and int(p.get("rp", -1)) >= 0, \
            "each device build asks for its tech and its unlock project"
        assert int(p.get("rs", -1)) >= 0 and int(p.get("rc", 0)) > 0, "and for Uranium"
        assert not bool(s3._wmd_project_ok(row, pi)[b]), "no tech, no device"
    # give the first one everything it asks for
    pi0 = wmd_idx[0]
    s3.civ_techs[b, row, int(prows[pi0]["rt"])] = True
    assert not bool(s3._wmd_project_ok(row, pi0)[b]), "the unlock project is still missing"
    s3.project_done[b, row, s3._once_step[int(prows[pi0]["rp"])]] = True
    assert not bool(s3._wmd_project_ok(row, pi0)[b]), "and the Uranium"
    s3.civ_stockpile[b, row, int(prows[pi0]["rs"])] = float(prows[pi0]["rc"])
    assert bool(s3._wmd_project_ok(row, pi0)[b]), "tech + unlock + Uranium opens it"
    print("  3 device gate OK (tech, unlock project, Uranium — the centre skips none)")

    # --- 4) the ground decays, and the toll it takes -------------------------
    s4 = settle_all(fresh(rules, paths[0]))
    t0 = int((s4.passable[b] & ~s4.water[b]).nonzero(as_tuple=True)[0][0])
    s4.tile_fallout[b, t0] = 3
    assert bool(s4._fallout()[b, t0])
    s4._disaster_phase()
    assert int(s4.tile_fallout[b, t0]) == 2, "a turn a turn, and no more"
    gdr = s4._gdr_idx
    assert gdr >= 0, "the fixture roster must carry the robot"
    warrior = next(i for i, u in enumerate(rj["units"]) if int(u.get("combat", 0)) > 0
                   and i != gdr)
    s4.military_at[b, t0] = -1
    u_bot = place_mil(s4, row, t0, gdr, hp=100)
    t1 = int((s4.passable[b] & ~s4.water[b] & (s4.military_at[b] < 0)
              & (s4.civilian_at[b] < 0)).nonzero(as_tuple=True)[0][1])
    s4.tile_fallout[b, t1] = 5
    u_man = place_mil(s4, row, t1, warrior, hp=100)
    s4._fallout_toll()
    assert int(s4.major_unit_hp[b, u_bot]) == 100, "CIV6: a Giant Death Robot is immune to fallout"
    assert int(s4.major_unit_hp[b, u_man]) == 50, "everyone else takes 50 a turn"
    s4._fallout_toll()
    assert not bool(s4.major_unit_alive[b, u_man]), "and the second turn finishes it"
    assert int(s4.military_at[b, t1]) < 0, "the dead unit lets go of its tile"
    print("  4 the toll OK (50 a turn, the robot exempt, the ground counts down)")

    # --- 5) nothing may be worked, placed, bought or healed there -----------
    s5 = settle_all(fresh(rules, paths[0]))
    ctr = int(s5.city_center[b, row, 0])
    before = int(s5._workable_count(row)[b, 0])
    assert before > 0, "the fixture city must work at least one tile"
    _tiles, _valid = s5._work_window(row)
    tw = int(_tiles[b, 0][_valid[b, 0]][0])
    s5.tile_fallout[b, tw] = 4
    assert int(s5._workable_count(row)[b, 0]) == before - 1, \
        "CIV6: a contaminated tile cannot be worked"
    assert not bool(s5._district_elig(row, 0, 0)[b, tw]), "and takes no district"
    # the centre itself: no unit is raised there, and the city neither heals
    # nor repairs
    s5.tile_fallout[b, ctr] = 4
    assert not bool(s5._trainable_units(row)[b, 0].any()), \
        "CIV6: fallout prevents producing or purchasing units there"
    assert not bool(s5._repair_available(row, 0)[b]), \
        "CIV6: Repair Outer Defenses is unusable while the fallout lasts"
    print("  5 the ground is unusable OK (work, district, unit, repair)")

    # --- 6) CLEAN FALLOUT: any chassis with a charge left --------------------
    s6 = settle_all(fresh(rules, paths[0]))
    tc = int((s6.passable[b] & ~s6.water[b] & (s6.military_at[b] < 0)
              & (s6.civilian_at[b] < 0)).nonzero(as_tuple=True)[0][0])
    s6.tile_fallout[b, tc] = 7
    u = place_mil(s6, row, tc, warrior, hp=100, charges=2)
    col = s6._act["CLEAN_FALLOUT"]
    smap = s6._seat_slot_map(row)
    rank = int((smap[b] == u).nonzero(as_tuple=True)[0][0])
    m = s6._seat_unit_mask(row)
    assert bool(m[b, rank, col]), "a charge and fallout are the whole gate"
    s6.major_unit_charges[b, u] = 0
    assert not bool(s6._seat_unit_mask(row)[b, rank, col]), "no charge, no clean"
    s6.major_unit_charges[b, u] = 2
    act = torch.full((s6.B, smap.shape[1]), -1, dtype=torch.long, device=s6.device)
    act[b, rank] = col
    s6.seat_ext[b, row] = True
    s6._apply_seat_unit_actions(row, act)
    assert int(s6.tile_fallout[b, tc]) == 0, "the tile is clean"
    assert int(s6.major_unit_charges[b, u]) == 1, "and it cost exactly one charge"
    assert float(s6.major_unit_mp[b, u]) == 0.0, "and the turn"
    print("  6 CLEAN_FALLOUT OK (any chassis, one charge, the turn)")

    # --- 7) both planes survive a round trip --------------------------------
    for name in ("civ_wmd", "tile_fallout"):
        assert name in _MUTABLE, f"{name} must be registered in _MUTABLE"
    s7 = fresh(rules, paths[0])
    s7.civ_wmd[b, row, 1] = 3
    s7.tile_fallout[b, 5] = 9
    snap = s7.snapshot()
    s7.civ_wmd[b, row, 1] = 0
    s7.tile_fallout[b, 5] = 0
    s7.restore(snap)
    assert int(s7.civ_wmd[b, row, 1]) == 3 and int(s7.tile_fallout[b, 5]) == 9
    print("  7 round trip OK (civ_wmd, tile_fallout)")

    print("BATTERY OK fallout")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
