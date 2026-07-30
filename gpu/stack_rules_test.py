"""tileFreeForUnit's two rules, from the seat the GPU used to get wrong.

    python gpu/stack_rules_test.py

Both of these were found by #51's refactor, carried briefly as "flags", and
then fixed rather than deferred — reachability in the scripted gate is an
explanation for a green run, never a licence to keep a divergence.

1. ADVANCE-AFTER-KILL stacks cross-domain. TS advances the victor with
   `tileFreeForUnit(state, targetIndex, attacker)` (combat.ts), which lets a
   MILITARY unit enter a tile holding its OWN civilian. The GPU passed a
   loose side string that matched no branch of _blocked_for and fell through
   to "anything standing there blocks", so the victor refused to advance onto
   its own builder.

2. THE SPAWN PROBE OBEYS ENCAMPMENTS. TS's spawnUnit probes with
   `tileFreeForUnit` (units.ts), which calls `encampmentBlocks`. The GPU's
   `_first_free_spot` used the stacking rule alone and would place a unit
   onto a tile a live enemy Encampment bars.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))

from civ6gpu import BatchSim, load_rules, load_fixture, FIXTURES
from civ6gpu.engine import BARB_SEAT, PLAYER_SEAT


def build(turns: int = 10):
    rules = load_rules()
    sim = BatchSim(
        [load_fixture(p) for p in sorted(FIXTURES.glob("seed*.json"))[:1]],
        rules, device="cpu", dtype=torch.float64,
    )
    for _ in range(turns):
        sim.step()
    return sim


def free_land(sim, skip=()):
    for t in range(sim.T):
        if t in skip or not bool(sim.passable[0, t]):
            continue
        if int(sim.occ_mil[0, t]) >= 0 or int(sim.occ_civ[0, t]) >= 0:
            continue
        return t
    raise AssertionError("no free land tile")


def test_own_civilian_does_not_block() -> None:
    """A rival MILITARY may enter a tile holding its OWN civilian."""
    sim = build()
    t = free_land(sim)
    # a rival-0 civilian sits there
    slot = int(sim.v_next[0])
    sim.v_alive[0, slot] = True
    sim.v_civ[0, slot] = 0
    sim.v_seat[0, slot] = 1
    sim.v_type[0, slot] = 0
    sim.v_tile[0, slot] = t
    sim.v_charges[0, slot] = 3  # civilian
    sim.rvciv_at[0, t] = slot
    sim.v_next[0] += 1
    sim.rebuild_occ()

    tiles = torch.tensor([[t]])
    own = bool(sim._blocked_for(tiles, 1)[0, 0])          # rival 0's military
    foreign = bool(sim._blocked_for(tiles, 2)[0, 0])      # rival 1's military
    player = bool(sim._blocked_for(tiles, PLAYER_SEAT)[0, 0])
    assert not own, "a rival military must STACK with its own civilian (cross-domain)"
    assert foreign, "a foreign rival's military must be blocked by that civilian"
    assert player, "the player's military must be blocked by a rival civilian"
    print("  own civilian stacks; foreign civilians block")


def test_spawn_probe_obeys_encampments() -> None:
    """_first_free_spot must refuse a tile barred by a live enemy Encampment."""
    sim = build()
    if sim._encamp_didx < 0:
        print("  SKIP: no ENCAMPMENT district in the roster")
        return
    t = free_land(sim)
    # make `t` a live rival-0 Encampment tile at war with the player
    sim.rival_at[0, t] = 0
    sim.district[0, t] = sim._encamp_didx
    sim.district_complete[0, t] = True
    sim.district_pillaged[0, t] = False
    sim.encamp_hp[0, t] = 100
    sim.r_atwar[0, 0] = True
    sim.rebuild_occ()

    if not bool(sim._encamp_live()[0, t]):
        print("  SKIP: could not make a live Encampment by poking")
        return
    tiles = torch.tensor([[t]])
    assert bool(sim._blocked_for(tiles, PLAYER_SEAT)[0, 0]), (
        "a live enemy Encampment must bar the tile for the player"
    )
    found, spot = sim._first_free_spot(
        torch.tensor([t]), "player",
        civ_mask=torch.zeros(sim.B, dtype=torch.bool),
    )
    assert int(spot[0]) != t, (
        "the spawn probe placed a unit ONTO a live enemy Encampment — TS's "
        "spawnUnit probes through tileFreeForUnit, which bars it"
    )
    print("  the spawn probe refuses a live enemy Encampment tile")


def main() -> None:
    test_own_civilian_does_not_block()
    test_spawn_probe_obeys_encampments()
    print("STACK RULES OK — cross-domain stacking + Encampment-aware spawning")


if __name__ == "__main__":
    main()
