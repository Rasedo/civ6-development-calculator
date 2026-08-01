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

    print("RIVAL VERBS OK")


if __name__ == "__main__":
    main()
