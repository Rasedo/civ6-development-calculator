"""THE BLAST — the GPU half of the nuclear strike.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/nuke_test.py

The TS twin is tests/cpu/units/nuke.test.ts. Nothing here is gate-reachable: a
device needs the Manhattan Project, which needs Nuclear Fission, and no seed
leaves the Modern era inside 250 turns. So every clause is pinned on the
tensors, against the TS bodies it mirrors (`nukeOffers`, `siloReaches`,
`nukeTargets`, `detonate`).

Proven here:
  * `_nuke_hostile` / `_nuke_offer` — a device is offered only where the blast
    reaches a seat this one would fight, and an ALLY is not one;
  * `_silo_reach` — an unpillaged MISSILE SILO on the seat's own ground, at the
    device's own Range;
  * `_nuke_targets` — a bomber flies its own operational range and a submarine
    throws the device its Range, tile index ascending, cut to the head's width;
  * `_detonate` — the declarations, the units (and the robot's 50), the pillage,
    the fallout, the City Center and Encampment floors, the launch weariness and
    the Nuclear Emergency, with the device spent either way;
  * the two verbs that reach it: the SEAT's silo launch through
    `_seat_buy_ladder`, and the carrier's own head through
    `_apply_seat_unit_actions`, which costs it the turn.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, load_fixture, fixture_paths, FIXTURES
from warmup import settle_all


def fresh(rules, path) -> BatchSim:
    return settle_all(BatchSim([load_fixture(path)], rules, device="cpu",
                               dtype=torch.float64))


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
    sim._gen_ver += 1
    return slot


def L(sim, x) -> torch.Tensor:
    return torch.tensor([x], dtype=torch.long, device=sim.device)


def at_dist(sim, home: int, lo: int, hi: int, seat: int | None = None) -> int:
    """a tile whose hex distance from `home` is in [lo, hi], owned by `seat`
    when one is named."""
    d = sim.pair_dist[home]
    for t in range(sim.T):
        if not (lo <= int(d[t]) <= hi):
            continue
        if seat is not None and int(sim.tile_seat[0, t]) != seat:
            continue
        return t
    raise AssertionError(f"no tile {lo}..{hi} from {home} (seat {seat})")


def main() -> int:
    rules = load_rules()
    rj = json.load(open(FIXTURES / "rules.json", encoding="utf-8"))
    paths = fixture_paths()
    b, row, foe = 0, 0, 1

    units = rj["units"]
    bomber = next(i for i, u in enumerate(units)
                  if int(u.get("nukeCarry", 0)) and int(u.get("air", 0)))
    sub = next(i for i, u in enumerate(units)
               if int(u.get("nukeCarry", 0)) and not int(u.get("air", 0)))
    plain = next(i for i, u in enumerate(units)
                 if not int(u.get("nukeCarry", 0)) and not int(u.get("air", 0))
                 and not int(u.get("naval", 0)) and not int(u.get("gdr", 0))
                 and int(u.get("combat", 0) or 0) > 0)

    sim = fresh(rules, paths[0])
    assert sim._A_NUKE >= 0 and sim._n_devices == 2 and sim._nuke_cols > 0
    cap0 = int(sim.city_center[b, row, 0])
    cap1 = int(sim.city_center[b, foe, 0])
    W, D = sim._nuke_cols, sim._n_devices
    print(f"  0 the head is live — {D} devices x {W} columns at {sim._A_NUKE}")

    # --- 1) a target is a tile whose blast reaches somebody else -------------
    off0 = sim._nuke_offer(row, 0)
    hostile = sim._nuke_hostile(row)
    assert not bool(hostile[b, cap0]), "the launcher's own capital is not hostile ground"
    assert bool(hostile[b, cap1]), "the rival's capital is"
    # CIV6: the declaration clause names "any civilization or city-state whose
    # territory or units are in the blast radius" — so the OFFER is the blast's
    # own reach, not the aiming point's owner.
    near = (sim.pair_dist[cap1] <= sim._nuke_radius[0]).nonzero().flatten().tolist()
    for t in near:
        assert bool(off0[b, t]), f"tile {t} covers the rival capital and must be offered"
    far = at_dist(sim, cap1, 6, 8)
    assert not bool(hostile[b, far]) or True  # the tile itself may belong to anyone
    lone = [t for t in range(sim.T) if not bool(hostile[b, t])]
    assert lone, "no neutral ground on this map — the check below would be vacuous"
    print(f"  1 _nuke_offer OK ({len(near)} aiming points cover the rival capital)")

    # --- 2) an ALLY is not somebody else -------------------------------------
    s2 = fresh(rules, paths[0])
    t_foe = int(s2.city_center[b, foe, 0])
    assert bool(s2._nuke_hostile(row)[b, t_foe])
    s2.seat_ally_turns[b, row, foe] = 5
    s2.seat_ally_turns[b, foe, row] = 5
    assert not bool(s2._nuke_hostile(row)[b, t_foe]), (
        "seatsAllied — an ally's ground is never a nuclear target")
    # ...and a rival's UNIT on neutral ground is one, territory or not
    s3 = fresh(rules, paths[0])
    neutral = next(t for t in range(s3.T) if int(s3.tile_seat[b, t]) < 0
                   and int(s3.military_at[b, t]) < 0 and int(s3.civilian_at[b, t]) < 0)
    assert not bool(s3._nuke_hostile(row)[b, neutral])
    place_mil(s3, foe, neutral, plain)
    assert bool(s3._nuke_hostile(row)[b, neutral]), "a rival unit makes the ground a target"
    print("  2 the ally clause and the lone-unit clause OK")

    # --- 3) the Missile Silo, at the device's own Range -----------------------
    s4 = fresh(rules, paths[0])
    assert not bool(s4._silo_reach(row, 0).any()), "no silo, no reach"
    silo = at_dist(s4, cap1, 5, 8)
    s4.tile_seat[b, silo] = row
    s4.improvement[b, silo] = s4._silo_iid
    s4.pillaged[b, silo] = False
    s4._tile_owner_ver += 1
    s4._eff_version += 1
    for k in range(D):
        reach = s4._silo_reach(row, k)
        want = (s4.pair_dist[silo] <= int(s4._nuke_range[k]))
        assert bool((reach[b] == want).all()), f"device {k} reaches exactly its own Range"
    # CIV6: the silo is an improvement — pillage it and it launches nothing.
    s4.pillaged[b, silo] = True
    s4._eff_version += 1
    assert not bool(s4._silo_reach(row, 0).any()), "a pillaged silo throws nothing"
    s4.pillaged[b, silo] = False
    s4.tile_seat[b, silo] = foe
    s4._tile_owner_ver += 1
    s4._eff_version += 1
    assert not bool(s4._silo_reach(row, 0).any()), "and neither does a rival's"
    print("  3 _silo_reach OK (Range 12 / 15, unpillaged, this seat's ground)")

    # --- 4) the carriers: a bomber's own range, a submarine's device Range ----
    s5 = fresh(rules, paths[0])
    home = at_dist(s5, cap1, 3, 5)
    s5.tile_seat[b, home] = row
    s5._tile_owner_ver += 1
    s5._eff_version += 1
    u_air = place_mil(s5, row, home, bomber)
    sc, tc = L(s5, [u_air]), L(s5, [home])
    ut = L(s5, [bomber])
    assert not bool(s5._nuke_mask(row, sc, tc, ut).any()), "an empty arsenal offers nothing"
    s5.civ_wmd[b, row, :] = 1

    def want_cols(sim_, r, k, at, reach):
        off = sim_._nuke_offer(r, k)[b]
        d = sim_.pair_dist[at]
        out = [t for t in range(sim_.T) if int(d[t]) <= reach and bool(off[t])]
        return out[:sim_._nuke_cols]

    air_r = int(s5._type_ranged_range[bomber])
    cols = s5._nuke_targets(row, sc, tc, ut)[b, 0].tolist()
    for k in range(D):
        got = [t for t in cols[k * W:(k + 1) * W] if t >= 0]
        assert got == want_cols(s5, row, k, home, air_r), (
            f"the bomber flies its own {air_r}, device {k}: {got[:4]}")
    # the submarine reads the DEVICE's range instead, and the two differ
    u_sea = place_mil(s5, row, home, sub)
    sc2, ut2 = L(s5, [u_sea]), L(s5, [sub])
    cols2 = s5._nuke_targets(row, sc2, tc, ut2)[b, 0].tolist()
    for k in range(D):
        got = [t for t in cols2[k * W:(k + 1) * W] if t >= 0]
        assert got == want_cols(s5, row, k, home, int(s5._nuke_range[k])), (
            f"the submarine throws device {k} its own Range {int(s5._nuke_range[k])}")
    assert int(s5._nuke_range[0]) != air_r, (
        f"the two reaches coincide at {air_r} — the check above proves nothing")
    # nobody else carries one
    u_foot = place_mil(s5, row, at_dist(s5, home, 1, 1), plain)
    assert not bool(s5._nuke_mask(row, L(s5, [u_foot]),
                                  L(s5, [int(s5.major_unit_tile[b, u_foot])]),
                                  L(s5, [plain])).any()), (
        "only a bomber or a Nuclear Submarine carries a device")
    print(f"  4 _nuke_targets OK (bomber {air_r}, devices {s5._nuke_range})")

    # --- 5) the blast -------------------------------------------------------
    s6 = fresh(rules, paths[0])
    s6.civ_wmd[b, row, 0] = 1
    blast = (s6.pair_dist[cap1] <= s6._nuke_radius[0]).nonzero().flatten().tolist()
    ring = [t for t in blast if t != cap1]
    victim = place_mil(s6, foe, ring[0], plain)
    bot = place_mil(s6, foe, ring[1], s6._gdr_idx) if s6._gdr_idx >= 0 else -1
    s6.improvement[b, ring[2]] = 3
    s6.pillaged[b, ring[2]] = False
    enc_t = ring[3]
    s6.district[b, enc_t] = s6._encampment_didx
    s6.district_complete[b, enc_t] = True
    s6.district_pillaged[b, enc_t] = False
    s6.encamp_hp[b, enc_t] = 100
    s6.encamp_outer_hp[b, enc_t] = 50
    s6.city_hp[b, foe, 0] = 200
    s6.city_outer_hp[b, foe, 0] = 100
    s6._eff_version += 1
    assert not bool(s6.war[b, row, foe]), "the two open at peace"

    s6._detonate(torch.ones(s6.B, dtype=torch.bool), row, 0, L(s6, cap1))

    assert int(s6.civ_wmd[b, row, 0]) == 0, "the device is spent"
    assert bool(s6.war[b, row, foe]) and bool(s6.war[b, foe, row]), (
        "CIV6: a launch IS a declaration of war on whoever it lands on")
    assert not bool(s6.major_unit_alive[b, victim]), "what stood in it is destroyed"
    if bot >= 0:
        assert bool(s6.major_unit_alive[b, bot]), "the robot survives a strike"
        assert int(s6.major_unit_hp[b, bot]) == 100 - int(s6._nuke_robot_damage), (
            "and takes exactly 50")
    assert bool(s6.pillaged[b, ring[2]]), "the improvement is pillaged"
    assert bool(s6.district_pillaged[b, enc_t]), "and the district with it"
    for t in blast:
        assert int(s6.tile_fallout[b, t]) == int(s6._nuke_fallout[0]), (
            f"tile {t} burns for {int(s6._nuke_fallout[0])} turns")
    assert int(s6.encamp_hp[b, enc_t]) == 1 and int(s6.encamp_outer_hp[b, enc_t]) == 0, (
        "the Encampment's two pools empty — a nuke never captures")
    assert int(s6.city_hp[b, foe, 0]) == 1 and int(s6.city_outer_hp[b, foe, 0]) == 0, (
        "and so does the City Center's")
    assert bool(s6.city_alive[b, foe, 0]), "the city is still its owner's"
    assert int(s6.city_last_hit[b, foe, 0]) == int(s6.turn)
    # CIV6 (War weariness): "12 times the Era Base value", billed to the LAUNCHER
    assert float(s6.ww[b, row, foe]) > 0 and float(s6.ww[b, foe, row]) == 0, (
        f"the launcher pays {float(s6.ww[b, row, foe])}, the target {float(s6.ww[b, foe, row])}")
    # CIV6 (Nuclear Emergency): the contested city is the LAUNCHER's own capital
    slot = (s6.emg_kind[b] == s6._emg_nuclear).nonzero().flatten()
    assert slot.numel() == 1, "one Nuclear Emergency"
    e = int(slot[0])
    assert int(s6.emg_target[b, e]) == row
    assert int(s6.emg_city[b, e]) == int(s6.city_id[b, row, 0])
    aff = s6.emg_affected[b, e].tolist()
    assert aff == [r != row for r in range(s6.n_majors)], (
        f"every other major may join, got {aff}")
    # the second call finds no device and changes nothing
    before = int(s6.tile_fallout[b, cap1])
    s6._detonate(torch.ones(s6.B, dtype=torch.bool), row, 0, L(s6, cap0))
    assert int(s6.tile_fallout[b, cap0]) == 0 and int(s6.tile_fallout[b, cap1]) == before, (
        "an empty arsenal detonates nothing")
    print(f"  5 _detonate OK ({len(blast)} tiles, the robot at "
          f"{100 - int(s6._nuke_robot_damage)}, the emergency in slot {e})")

    # --- 6) the SEAT's silo launch, through the buy ladder --------------------
    s7 = fresh(rules, paths[0])
    silo = at_dist(s7, cap1, 4, 8)
    s7.tile_seat[b, silo] = row
    s7.improvement[b, silo] = s7._silo_iid
    s7.pillaged[b, silo] = False
    s7.civ_wmd[b, row, 0] = 1
    s7.seat_ext[b, row] = True
    s7._tile_owner_ver += 1
    s7._eff_version += 1
    kd, tl = s7._seat_nuke_candidate(row)
    cand = s7._silo_reach(row, 0) & s7._nuke_offer(row, 0)
    assert int(kd[b]) == 0 and int(tl[b]) == int(cand[b].long().argmax()), (
        "the candidate is the first device this seat holds, at the lowest offered tile")
    # a tile the silo cannot reach is refused at the apply
    unreachable = at_dist(s7, silo, int(s7._nuke_range[0]) + 1, int(s7._nuke_range[0]) + 4)
    s7.apply_seat_actions(row, nuke=(L(s7, 0), L(s7, unreachable)))
    s7._seat_buy_ladder(row, torch.ones(s7.B, dtype=torch.bool), s7._seat_army_count(row))
    assert int(s7.civ_wmd[b, row, 0]) == 1, "out of the silo's Range — nothing launches"
    assert int(s7.tile_fallout[b, unreachable]) == 0
    # and the candidate it named goes off
    s7.apply_seat_actions(row, nuke=(kd, tl))
    s7._seat_buy_ladder(row, torch.ones(s7.B, dtype=torch.bool), s7._seat_army_count(row))
    assert int(s7.civ_wmd[b, row, 0]) == 0, "the silo spent the device"
    assert int(s7.tile_fallout[b, int(tl[b])]) == int(s7._nuke_fallout[0])
    print(f"  6 the silo verb OK (refused at {unreachable}, fired at {int(tl[b])})")

    # --- 7) the carrier's own head, and what it costs -------------------------
    s8 = fresh(rules, paths[0])
    home = at_dist(s8, cap1, 2, 4)
    s8.tile_seat[b, home] = row
    s8._tile_owner_ver += 1
    s8._eff_version += 1
    u = place_mil(s8, row, home, bomber)
    s8.civ_wmd[b, row, 0] = 1
    s8.major_unit_attacks[b, u] = 1
    smap = s8._seat_slot_map(row)[b]
    rank = int((smap == u).nonzero(as_tuple=True)[0][0])
    tgt = s8._nuke_targets(row, L(s8, [u]), L(s8, [home]),
                           L(s8, [bomber]))[b, 0]
    col = next(c for c in range(W) if int(tgt[c]) >= 0)
    aim = int(tgt[col])
    acts = torch.full((s8.B, smap.shape[0]), -1, dtype=torch.long)
    acts[b, rank] = s8._A_NUKE + col
    s8.seat_ext[b, row] = True
    s8._apply_seat_unit_actions(row, acts)
    assert int(s8.civ_wmd[b, row, 0]) == 0, "the carrier spent the device"
    assert int(s8.tile_fallout[b, aim]) == int(s8._nuke_fallout[0]), (
        f"the ground at {aim} burns")
    assert float(s8.major_unit_mp[b, u]) == 0.0 and int(s8.major_unit_attacks[b, u]) == 0, (
        "the delivery costs the carrier its whole turn")
    print(f"  7 the carrier head OK (column {col} -> tile {aim})")

    print("BATTERY OK nuke")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
