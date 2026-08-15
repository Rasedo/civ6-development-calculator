"""Civ-seat unit verbs: the full column set behind `_seat_unit_mask`.

`_seat_unit_mask` matches the action enum, so a driven civ can REPAIR, build any
RESOURCE improvement, build a FORT, PILLAGE and SNIPE — every one of which the
SCRIPTED civ does.

This lane exists because A WIDER MASK IS HALF THE JOB: a verb dispatched on the
wrong column no-ops on BOTH engines, and the rollout stays green while the verb
does nothing at all. Legality is not execution — every check here asserts the
WORLD CHANGED, never that a column was legal.

Poked straight into `_apply_seat_unit_actions` / `apply_seat_unit_sequence`,
the same entry points `policy/drive.py` uses.
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


def a_civ_builder(sim, r):
    """(slot, tile) of a civ-r BUILDER — retyping a live unit rather than
    waiting for the fixture to field one, so the lane does not depend on which
    turn a civ happens to train a builder."""
    for v in range(sim.major_unit_alive.shape[1]):
        if bool(sim.major_unit_alive[0, v]) and int((sim.major_unit_seat[0, v] - 1)) == r:
            sim.major_unit_type[0, v] = sim._builder_idx
            sim.major_unit_charges[0, v] = 3
            sim.major_unit_mp[0, v] = 2
            return v, int(sim.major_unit_tile[0, v])
    return None, None


def a_civ_soldier(sim, r):
    for v in range(sim.major_unit_alive.shape[1]):
        if bool(sim.major_unit_alive[0, v]) and int((sim.major_unit_seat[0, v] - 1)) == r and float(sim._type_combat[int(sim.major_unit_type[0, v])]) > 0:
            return v, int(sim.major_unit_tile[0, v])
    return None, None


def order(sim, r, slot, col):
    """Issue `col` to the civ unit occupying `slot`, via the head layout."""
    smap = sim._seat_slot_map(r + 1)[0]
    row = int((smap == slot).nonzero(as_tuple=True)[0][0])
    acts = torch.full((1, smap.shape[0]), -1, dtype=torch.long)
    acts[0, row] = col
    sim.seat_ext[0, r + 1] = True
    sim._apply_seat_unit_actions(r, acts)


def main() -> None:
    rules = load_rules()
    path = fixture_paths()[0]
    r = 0

    # -- 1: a RESOURCE improvement lands -----------------------------------
    sim = fresh(rules, path)
    A_REP, A_PIL = sim._A_REPAIR, sim._A_PILLAGE
    res_lo = A_REP + 1
    slot, tile = a_civ_builder(sim, r)
    assert slot is not None, "civ 0 has no live unit at t30"
    # make the builder's own tile demand a resource improvement it can unlock
    k = 3  # first resource improvement in the roster
    sim.tile_seat[0, tile] = r + 1
    sim.res_imp[0, tile] = k
    sim.improvement[0, tile] = -1
    sim.district[0, tile] = -1
    sim.built_wonder[0, tile] = -1
    sim.centre_slot_at[0, tile] = -1
    sim._tile_owner_ver += 1
    ut = int(sim._imp_unlock[k])
    if ut >= 0:
        sim.civ_techs[0, r + 1, ut] = True
    ch0 = int(sim.major_unit_charges[0, slot])
    order(sim, r, slot, res_lo + (k - 3))
    assert int(sim.improvement[0, tile]) == k, (
        f"#89 DISPATCH DEAD: resource improvement column {res_lo + (k - 3)} did nothing "
        f"(improvement is {int(sim.improvement[0, tile])}, wanted {k})"
    )
    assert int(sim.major_unit_charges[0, slot]) == ch0 - 1, "a build must spend a charge"
    print(f"  1 resource improvement {k} built by a civ builder OK (charge spent)")

    # -- 2: REPAIR clears a pillaged tile ----------------------------------
    sim = fresh(rules, path)
    slot, tile = a_civ_builder(sim, r)
    assert slot is not None
    sim.tile_seat[0, tile] = r + 1
    sim.improvement[0, tile] = 0
    sim.pillaged[0, tile] = True
    sim._tile_owner_ver += 1
    order(sim, r, slot, A_REP)
    assert not bool(sim.pillaged[0, tile]), "#89 DISPATCH DEAD: REPAIR left the tile pillaged"
    print("  2 REPAIR clears a pillaged civ tile OK")

    # -- 3: PILLAGE wrecks an enemy improvement ----------------------------
    # The highest-reachability of these verbs — legal on 39% of civ unit-turns.
    sim = fresh(rules, path)
    slot, tile = a_civ_soldier(sim, r)
    assert slot is not None, "no civ military unit by t30"
    sim.war[0, 0, 1 + r] = sim.war[0, 1 + r, 0] = True
    sim.tile_seat[0, tile] = 0        # seat-0 land — the enemy this civ is at war with
    sim.improvement[0, tile] = 0
    sim.pillaged[0, tile] = False
    sim.district[0, tile] = -1
    sim._tile_owner_ver += 1
    order(sim, r, slot, A_PIL)
    assert bool(sim.pillaged[0, tile]), "#89 DISPATCH DEAD: PILLAGE did not wreck the improvement"
    print("  3 PILLAGE wrecks an enemy improvement OK")

    # -- 4: PILLAGE is REFUSED on the civ's own land ----------------------
    # The gate must be enemy-ownership, not merely "an improvement is here".
    sim = fresh(rules, path)
    slot, tile = a_civ_soldier(sim, r)
    sim.war[0, 0, 1 + r] = sim.war[0, 1 + r, 0] = True
    sim.tile_seat[0, tile] = r + 1    # OWN land
    sim.improvement[0, tile] = 0
    sim.pillaged[0, tile] = False
    sim._tile_owner_ver += 1
    order(sim, r, slot, A_PIL)
    assert not bool(sim.pillaged[0, tile]), "a civ pillaged its OWN improvement"
    print("  4 PILLAGE refused on own land OK")

    # -- 5: a MULTI-STEP order walks real MP -------------------------------
    # The scripted patrol moves 2.78 tiles per moving unit-turn, so one order
    # per turn would cut civ mobility by ~two thirds. The action is a SEQUENCE
    # and the engine walks it, validating each step — it never extends a move.
    def setup():
        s2 = fresh(rules, path)
        s2.seat_ext[0, r + 1] = True
        sl = next(
            v for v in range(s2.major_unit_alive.shape[1])
            if bool(s2.major_unit_alive[0, v]) and int(s2.major_unit_seat[0, v]) == r + 1
            and float(s2._type_combat[int(s2.major_unit_type[0, v])]) > 0
        )
        s2.major_unit_mp[0, sl] = 4.0
        sm = s2._seat_slot_map(r + 1)[0]
        rw = int((sm == sl).nonzero(as_tuple=True)[0][0])
        return s2, sl, rw, sm.shape[0]

    def seq_of(cols, n_rows, rw):
        q = torch.full((1, n_rows, len(cols)), -1, dtype=torch.long)
        for i, c in enumerate(cols):
            q[0, rw, i] = c
        return q

    # pick a legal first direction, then a legal SECOND one from where it lands
    s5, sl5, rw5, nrows = setup()
    m5 = s5._seat_unit_mask(r + 1)[0, rw5]
    d0 = next((d for d in range(6) if bool(m5[d])), None)
    assert d0 is not None, "no legal first step for this unit"
    s5.apply_seat_unit_sequence(r, seq_of([d0], nrows, rw5))
    one_tile = int(s5.major_unit_tile[0, sl5])
    m5b = s5._seat_unit_mask(r + 1)[0, rw5]
    d1 = next((d for d in range(6) if bool(m5b[d])), None)
    assert d1 is not None, "no legal second step — pick another fixture/turn"

    s6, sl6b, rw6b, nrows2 = setup()
    start_t = int(s6.major_unit_tile[0, sl6b])
    s6.apply_seat_unit_sequence(r, seq_of([d0, d1], nrows2, rw6b))
    two_tile = int(s6.major_unit_tile[0, sl6b])
    assert two_tile != one_tile, (
        f"#90 DEAD: the 2-step sequence ended where the 1-step did ({two_tile}) "
        "— the second rank never executed"
    )
    assert int(s6.pair_dist[start_t, two_tile]) >= 1
    print(f"  5 multi-step order walks real MP OK ({start_t} -> {one_tile} -> {two_tile})")

    # -- 5b: an ILLEGAL later step is REFUSED, not skipped past --------------
    # The engine validates every rank; it must not silently substitute another
    # direction, and it must not carry the unit past a blocked tile.
    # Find a direction that is legal NOW but illegal from where it lands, so the
    # refusal happens mid-sequence rather than at rank 0 — that is the case the
    # walk has to get right.
    s7, sl7, rw7, nrows3 = setup()
    dead = None
    for d in range(6):
        probe, slp, rwp, nrp = setup()
        if not bool(probe._seat_unit_mask(r + 1)[0, rwp][d]):
            continue
        probe.apply_seat_unit_sequence(r, seq_of([d], nrp, rwp))
        if not bool(probe._seat_unit_mask(r + 1)[0, rwp][d]):
            dead = (d, int(probe.major_unit_tile[0, slp]))
            break
    assert dead is not None, "no direction becomes illegal after one step — pick another fixture"
    d_dead, stop_tile = dead
    s7.apply_seat_unit_sequence(r, seq_of([d_dead, d_dead], nrows3, rw7))
    assert int(s7.major_unit_tile[0, sl7]) == stop_tile, (
        f"#90: the walk did not stop at the illegal rank — ended {int(s7.major_unit_tile[0, sl7])}, "
        f"expected {stop_tile}"
    )
    print(f"  5b the walk STOPS at an illegal later step (dir {d_dead}, halted at {stop_tile}) OK")

    # -- 6: a NON-MOVE verb at rank 0 consumes the turn ---------------------
    # PILLAGE then a move: the move must NOT happen (mp spent), which is what
    # keeps the sequence from smuggling a free action after a turn-ending verb.
    sim6 = fresh(rules, path)
    sim6.seat_ext[0, r + 1] = True
    sl6, t6 = a_civ_soldier(sim6, r)
    sim6.war[0, 0, 1 + r] = sim6.war[0, 1 + r, 0] = True
    sim6.tile_seat[0, t6] = 0         # seat-0 land, the pillage target
    sim6.improvement[0, t6] = 0
    sim6.pillaged[0, t6] = False
    sim6.district[0, t6] = -1
    sim6._tile_owner_ver += 1
    sm6 = sim6._seat_slot_map(r + 1)[0]
    rw6 = int((sm6 == sl6).nonzero(as_tuple=True)[0][0])
    sq6 = torch.full((1, sm6.shape[0], 2), -1, dtype=torch.long)
    sq6[0, rw6, 0] = sim6._A_PILLAGE
    sq6[0, rw6, 1] = 0
    sim6.apply_seat_unit_sequence(r, sq6)
    assert bool(sim6.pillaged[0, t6]), "the rank-0 PILLAGE did not fire"
    assert int(sim6.major_unit_tile[0, sl6]) == t6, "a turn-ending verb must not be followed by a move"
    print("  6 a turn-ending verb at rank 0 blocks later steps OK")

    # -- 7: SNIPE — a ranged unit strikes a ring-2 barbarian ----------------
    # Execution, not legality: the strike must DAMAGE the target. A legal
    # column that executes nothing would teach a net that sniping is worthless.
    sim7 = fresh(rules, path)
    sim7.seat_ext[0, r + 1] = True
    sl7b, t7 = a_civ_soldier(sim7, r)
    assert sl7b is not None
    # retype to ARCHER via the roster index in the sim's own tables
    ai = next(i for i in range(sim7.NU) if float(sim7._type_ranged_strength[i]) > 0 and int(sim7._type_ranged_range[i]) >= 2)
    sim7.major_unit_type[0, sl7b] = ai
    sim7.major_unit_mp[0, sl7b] = 2.0
    ring = sim7.ring2[t7]
    rk = next(k for k in range(12) if int(ring[k]) >= 0 and bool(sim7.passable[0, int(ring[k])]))
    rt = int(ring[rk])
    # plant a barbarian on that ring tile (u-pool)
    bslot = next(i for i in range(sim7.barb_unit_alive.shape[1]) if not bool(sim7.barb_unit_alive[0, i]))
    sim7.barb_unit_alive[0, bslot] = True
    sim7.barb_unit_tile[0, bslot] = rt
    sim7.barb_unit_hp[0, bslot] = 100.0
    sim7.barb_unit_type[0, bslot] = sim7._warrior_idx
    sim7.military_at[0, rt] = bslot + sim7.POOL_LO["barb"]
    m7b = sim7._seat_unit_mask(r + 1)
    sm7 = sim7._seat_slot_map(r + 1)[0]
    rw7b = int((sm7 == sl7b).nonzero(as_tuple=True)[0][0])
    A_SN = sim7._A_SNIPE
    assert bool(m7b[0, rw7b, A_SN + rk]), "#92: the snipe column for a ring-2 barb must be LEGAL"
    hp0 = float(sim7.barb_unit_hp[0, bslot])
    acts7 = torch.full((1, sm7.shape[0]), -1, dtype=torch.long)
    acts7[0, rw7b] = A_SN + rk
    sim7._apply_seat_unit_actions(r, acts7)
    hp1 = float(sim7.barb_unit_hp[0, bslot]) if bool(sim7.barb_unit_alive[0, bslot]) else 0.0
    assert hp1 < hp0, f"#92 DISPATCH DEAD: snipe left the barb at {hp1} hp (was {hp0})"
    assert float(sim7.major_unit_mp[0, sl7b]) == 0.0, "a snipe must spend the turn"
    print(f"  7 SNIPE strikes a ring-2 barbarian OK ({hp0:.0f} -> {hp1:.0f} hp)")

    # -- 8: a replayed NAVAL water move SAILS -------------------------------
    # The apply carries the mask's own three-way terrain body, so a driven hull
    # sails where the mask (and TS) moves it: naval water is cartography-gated
    # and war-free, and a land step is refused at the apply.
    sim8 = fresh(rules, path)
    sim8.seat_ext[0, r + 1] = True
    sl8, t8 = a_civ_soldier(sim8, r)
    assert sl8 is not None
    ni = next(i for i in range(sim8.NU) if bool(sim8.unit_naval[i]))
    sim8.major_unit_type[0, sl8] = ni
    sim8.major_unit_mp[0, sl8] = 3.0
    # park it on coastal water with a free water neighbour (occ bookkeeping
    # by hand, the centre_defence_test idiom)
    w8 = None
    for cand in (sim8.wpass[0] & ~sim8.ocean_tile[0]).nonzero(as_tuple=True)[0].tolist():
        if int(sim8.military_at[0, cand]) >= 0:
            continue
        for d8 in range(6):
            nb8 = int(sim8.neigh[cand, d8])
            if nb8 >= 0 and bool(sim8.wpass[0, nb8]) and not bool(sim8.ocean_tile[0, nb8]) and int(sim8.military_at[0, nb8]) < 0:
                w8 = (int(cand), d8, nb8)
                break
        if w8:
            break
    assert w8 is not None, "fixture has no free coastal pair"
    wt8, dir8, nb8 = w8
    sim8.military_at[0, t8] = -1
    sim8.major_unit_tile[0, sl8] = wt8
    sim8.military_at[0, wt8] = sl8 + sim8.POOL_LO["major"]
    sm8 = sim8._seat_slot_map(r + 1)[0]
    rw8 = int((sm8 == sl8).nonzero(as_tuple=True)[0][0])
    acts8 = torch.full((1, sm8.shape[0]), -1, dtype=torch.long)
    acts8[0, rw8] = dir8
    sim8._apply_seat_unit_actions(r, acts8)
    assert int(sim8.major_unit_tile[0, sl8]) == nb8, (
        f"#70 t43 sibling: a replayed naval water step must SAIL (stuck at {int(sim8.major_unit_tile[0, sl8])}, wanted {nb8})"
    )
    # and the same hull never walks onto land
    sim8.major_unit_mp[0, sl8] = 3.0
    landd = next((d for d in range(6) if int(sim8.neigh[nb8, d]) >= 0 and bool(sim8.passable[0, int(sim8.neigh[nb8, d])]) and not bool(sim8.wpass[0, int(sim8.neigh[nb8, d])])), None)
    if landd is not None:
        acts8[0, rw8] = landd
        sim8._apply_seat_unit_actions(r, acts8)
        assert int(sim8.major_unit_tile[0, sl8]) == nb8, "a naval hull must refuse a land step at the apply"
    print(f"  8 replayed naval move sails OK ({wt8} -> {nb8}), land step refused")

    print("CIV VERBS OK")


if __name__ == "__main__":
    main()
