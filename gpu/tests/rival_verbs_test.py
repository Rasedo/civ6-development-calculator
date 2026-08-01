"""#89 rival unit verbs: the nine columns the rival surface was missing.

`rival_unit_mask` sat at 17 columns while the player's grew to 26, so a driven
rival could not REPAIR, build any RESOURCE improvement, build a FORT, or PILLAGE
— every one of which the SCRIPTED rival does. The mask now matches the enum.

This lane exists because A WIDER MASK IS HALF THE JOB. A-21's PILLAGE was once
dispatched on the wrong column and no-op'd on BOTH engines, so the rollout stayed
green while the verb did nothing at all. Legality is not execution: every check
here asserts the WORLD CHANGED, never that a column was legal.

Poked directly — no organic controller drives rival units yet.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from civ6gpu import BatchSim, load_rules, load_fixture, FIXTURES
import stamp


def fresh(rules, path, turns=30):
    sim = BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64)
    for _ in range(turns):
        sim.step()
    return sim


def a_rival_builder(sim, r):
    """(slot, tile) of a rival-r BUILDER — retyping a live unit rather than
    waiting for the fixture to field one, so the lane does not depend on which
    turn a rival happens to train a builder."""
    for v in range(sim.v_alive.shape[1]):
        if bool(sim.v_alive[0, v]) and int(sim.v_civ[0, v]) == r:
            sim.v_type[0, v] = sim._builder_idx
            sim.v_charges[0, v] = 3
            sim.v_mp[0, v] = 2
            return v, int(sim.v_tile[0, v])
    return None, None


def a_rival_soldier(sim, r):
    for v in range(sim.v_alive.shape[1]):
        if bool(sim.v_alive[0, v]) and int(sim.v_civ[0, v]) == r and float(sim._p_combat[int(sim.v_type[0, v])]) > 0:
            return v, int(sim.v_tile[0, v])
    return None, None


def order(sim, r, slot, col):
    """Issue `col` to the rival unit occupying `slot`, via the head layout."""
    smap = sim.rival_slot_map(r)[0]
    row = int((smap == slot).nonzero(as_tuple=True)[0][0])
    acts = torch.full((1, smap.shape[0]), -1, dtype=torch.long)
    acts[0, row] = col
    sim.controlled[0, r] = True
    sim._apply_rival_unit_actions(r, acts)


def main() -> None:
    rules = load_rules()
    stamp.check(FIXTURES)
    path = sorted(FIXTURES.glob("seed*.json"))[0]
    r = 0

    # -- 1: a RESOURCE improvement lands -----------------------------------
    sim = fresh(rules, path)
    A_REP, A_PIL = sim._A_REPAIR, sim._A_PILLAGE
    res_lo = A_REP + 1
    slot, tile = a_rival_builder(sim, r)
    assert slot is not None, "rival 0 has no live unit at t30"
    # make the builder's own tile demand a resource improvement it can unlock
    k = 3  # first resource improvement in the roster
    sim.rival_at[0, tile] = r
    sim.res_imp[0, tile] = k
    sim.improvement[0, tile] = -1
    sim.district[0, tile] = -1
    sim.built_wonder[0, tile] = -1
    sim.rvcity_at[0, tile] = -1
    ut = int(sim._imp_unlock[k])
    if ut >= 0:
        sim.r_techs[0, r, ut] = True
    ch0 = int(sim.v_charges[0, slot])
    order(sim, r, slot, res_lo + (k - 3))
    assert int(sim.improvement[0, tile]) == k, (
        f"#89 DISPATCH DEAD: resource improvement column {res_lo + (k - 3)} did nothing "
        f"(improvement is {int(sim.improvement[0, tile])}, wanted {k})"
    )
    assert int(sim.v_charges[0, slot]) == ch0 - 1, "a build must spend a charge"
    print(f"  1 resource improvement {k} built by a rival builder OK (charge spent)")

    # -- 2: REPAIR clears a pillaged tile ----------------------------------
    sim = fresh(rules, path)
    slot, tile = a_rival_builder(sim, r)
    assert slot is not None
    sim.rival_at[0, tile] = r
    sim.improvement[0, tile] = 0
    sim.pillaged[0, tile] = True
    order(sim, r, slot, A_REP)
    assert not bool(sim.pillaged[0, tile]), "#89 DISPATCH DEAD: REPAIR left the tile pillaged"
    print("  2 REPAIR clears a pillaged rival tile OK")

    # -- 3: PILLAGE wrecks an enemy improvement ----------------------------
    # The highest-reachability new verb: legal on 39% of rival unit-turns and
    # previously unexpressible.
    sim = fresh(rules, path)
    slot, tile = a_rival_soldier(sim, r)
    assert slot is not None, "no rival military unit by t30"
    sim.r_atwar[0, r] = True
    sim.owner[0, tile] = 0            # PLAYER-owned land (the enemy plane)
    sim.rival_at[0, tile] = -1
    sim.improvement[0, tile] = 0
    sim.pillaged[0, tile] = False
    sim.district[0, tile] = -1
    order(sim, r, slot, A_PIL)
    assert bool(sim.pillaged[0, tile]), "#89 DISPATCH DEAD: PILLAGE did not wreck the improvement"
    print("  3 PILLAGE wrecks an enemy improvement OK")

    # -- 4: PILLAGE is REFUSED on the rival's own land ----------------------
    # The gate must be enemy-ownership, not merely "an improvement is here".
    sim = fresh(rules, path)
    slot, tile = a_rival_soldier(sim, r)
    sim.r_atwar[0, r] = True
    sim.owner[0, tile] = -1
    sim.cs_at[0, tile] = -1
    sim.rival_at[0, tile] = r          # OWN land
    sim.improvement[0, tile] = 0
    sim.pillaged[0, tile] = False
    order(sim, r, slot, A_PIL)
    assert not bool(sim.pillaged[0, tile]), "a rival pillaged its OWN improvement"
    print("  4 PILLAGE refused on own land OK")

    # -- 5: #90 a MULTI-STEP order walks real MP ---------------------------
    # The scripted patrol moves 2.78 tiles per moving unit-turn; one order per
    # turn would cut rival mobility by ~two thirds. The action is a SEQUENCE and
    # the engine walks it, validating each step — it never extends a move itself.
    def setup():
        s2 = fresh(rules, path)
        s2.controlled[0, r] = True
        sl = next(
            v for v in range(s2.v_alive.shape[1])
            if bool(s2.v_alive[0, v]) and int(s2.v_civ[0, v]) == r
            and float(s2._p_combat[int(s2.v_type[0, v])]) > 0
        )
        s2.v_mp[0, sl] = 4.0
        sm = s2.rival_slot_map(r)[0]
        rw = int((sm == sl).nonzero(as_tuple=True)[0][0])
        return s2, sl, rw, sm.shape[0]

    def seq_of(cols, n_rows, rw):
        q = torch.full((1, n_rows, len(cols)), -1, dtype=torch.long)
        for i, c in enumerate(cols):
            q[0, rw, i] = c
        return q

    # pick a legal first direction, then a legal SECOND one from where it lands
    s5, sl5, rw5, nrows = setup()
    m5 = s5.rival_unit_mask(r)[0, rw5]
    d0 = next((d for d in range(6) if bool(m5[d])), None)
    assert d0 is not None, "no legal first step for this unit"
    s5.apply_rival_unit_sequence(r, seq_of([d0], nrows, rw5))
    one_tile = int(s5.v_tile[0, sl5])
    m5b = s5.rival_unit_mask(r)[0, rw5]
    d1 = next((d for d in range(6) if bool(m5b[d])), None)
    assert d1 is not None, "no legal second step — pick another fixture/turn"

    s6, sl6b, rw6b, nrows2 = setup()
    start_t = int(s6.v_tile[0, sl6b])
    s6.apply_rival_unit_sequence(r, seq_of([d0, d1], nrows2, rw6b))
    two_tile = int(s6.v_tile[0, sl6b])
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
    # walk has to get right, and it is real here (d0 twice runs into water).
    s7, sl7, rw7, nrows3 = setup()
    dead = None
    for d in range(6):
        probe, slp, rwp, nrp = setup()
        if not bool(probe.rival_unit_mask(r)[0, rwp][d]):
            continue
        probe.apply_rival_unit_sequence(r, seq_of([d], nrp, rwp))
        if not bool(probe.rival_unit_mask(r)[0, rwp][d]):
            dead = (d, int(probe.v_tile[0, slp]))
            break
    assert dead is not None, "no direction becomes illegal after one step — pick another fixture"
    d_dead, stop_tile = dead
    s7.apply_rival_unit_sequence(r, seq_of([d_dead, d_dead], nrows3, rw7))
    assert int(s7.v_tile[0, sl7]) == stop_tile, (
        f"#90: the walk did not stop at the illegal rank — ended {int(s7.v_tile[0, sl7])}, "
        f"expected {stop_tile}"
    )
    print(f"  5b the walk STOPS at an illegal later step (dir {d_dead}, halted at {stop_tile}) OK")

    # -- 6: a NON-MOVE verb at rank 0 consumes the turn ---------------------
    # PILLAGE then a move: the move must NOT happen (mp spent), which is what
    # keeps the sequence from smuggling a free action after a turn-ending verb.
    sim6 = fresh(rules, path)
    sim6.controlled[0, r] = True
    sl6, t6 = a_rival_soldier(sim6, r)
    sim6.r_atwar[0, r] = True
    sim6.owner[0, t6] = 0
    sim6.rival_at[0, t6] = -1
    sim6.improvement[0, t6] = 0
    sim6.pillaged[0, t6] = False
    sim6.district[0, t6] = -1
    sm6 = sim6.rival_slot_map(r)[0]
    rw6 = int((sm6 == sl6).nonzero(as_tuple=True)[0][0])
    sq6 = torch.full((1, sm6.shape[0], 2), -1, dtype=torch.long)
    sq6[0, rw6, 0] = sim6._A_PILLAGE
    sq6[0, rw6, 1] = 0
    sim6.apply_rival_unit_sequence(r, sq6)
    assert bool(sim6.pillaged[0, t6]), "the rank-0 PILLAGE did not fire"
    assert int(sim6.v_tile[0, sl6]) == t6, "a turn-ending verb must not be followed by a move"
    print("  6 a turn-ending verb at rank 0 blocks later steps OK")

    print("RIVAL VERBS OK")


if __name__ == "__main__":
    main()
