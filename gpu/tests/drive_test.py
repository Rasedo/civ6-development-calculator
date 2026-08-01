"""#70: the LADDER DRIVES a seat for a whole game.

This is the seam #51 exists to create. A rival's decisions used to be made inside
the engine by `_rival_phase`, a transcription of `rivals.ts` — two copies of one
policy that drifted apart in ways no gate could see (#85's stale unit ladder,
#86's optimistic districts). Here the engine hands out an observation and
legality masks, `gpu/ladder.py` returns actions, and the engine only applies.

The lane asserts the DRIVEN seat is a real competitor, not merely that the code
runs. A driver that silently held every turn would "pass" any smoke test while
quietly producing a civ that never builds anything — which is exactly the failure
#87 and #90 were about (idle-on-unplaceable, one-tile-per-turn), and neither
would have shown up as an error.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from civ6gpu import load_rules, load_fixture, FIXTURES
from civ6gpu.env import BatchEnv
import drive
import stamp


TURNS = 120
WARMUP = 10


def seat_state(sim, r=0):
    return {
        "cities": int(sim.rc_alive[0, r].sum()),
        "units": int((sim.v_alive[0] & (sim.v_civ[0] == r)).sum()),
        "techs": int(sim.r_techs[0, r].sum()),
        "civics": int(sim.r_civics[0, r].sum()),
    }


def main() -> None:
    rules = load_rules()
    stamp.check(FIXTURES)
    path = sorted(FIXTURES.glob("seed*.json"))[0]

    # the scripted transcription, for reference
    a = BatchEnv([load_fixture(path)], rules, device="cpu", dtype=torch.float64)
    for _ in range(WARMUP + TURNS):
        a.sim.step()
    ref = seat_state(a.sim)

    # the same seat, driven by the ladder from WARMUP onward
    b = BatchEnv([load_fixture(path)], rules, device="cpu", dtype=torch.float64)
    for _ in range(WARMUP):
        b.sim.step()
    log = drive.drive(b, TURNS, seats=[0])
    got = seat_state(b.sim)

    assert len(log) == TURNS, f"driver logged {len(log)} turns, expected {TURNS}"
    assert bool(b.sim.controlled[0, 0]), "the driven seat must be marked controlled"
    print(f"  scripted: {ref}")
    print(f"  ladder  : {got}")

    # 1. the seat SURVIVED and kept its cities — a driver that holds every turn
    #    still passes a smoke test, so assert the civ is actually alive.
    assert got["cities"] >= 1, "the ladder-driven civ lost every city"

    # 2. it RESEARCHED. The research verb is mask-gated and ported; a driven seat
    #    that never picks would sit at its warm-up tech count forever.
    assert got["techs"] >= ref["techs"] - 2, (
        f"driven seat fell behind on tech ({got['techs']} vs scripted {ref['techs']}) "
        "— the research verb is not being applied"
    )

    # 3. it BUILT things. Production is the verb with the most machinery behind
    #    it (#84/#85/#86/#87); if the driven seat fields no units at all, the
    #    preference apply or the mask is refusing everything.
    assert got["units"] >= 1, "the driven seat fielded no units at all"

    # 4. it is COMPETITIVE with the transcription it replaces. Not identical —
    #    the ladder agrees with the picker on 98.87% of production decisions, so
    #    the trajectories legitimately diverge — but a driven civ that ends with
    #    a third of the scripted one's cities means a verb is silently refusing.
    assert got["cities"] >= max(1, ref["cities"] - 2), (
        f"driven civ has {got['cities']} cities against the scripted {ref['cities']} "
        "— check the settler column and #87's preference apply"
    )
    print(f"  {TURNS} turns driven by gpu/ladder.py, seat competitive with the script OK")

    # 5. THE FILE IS THE INTERFACE. Replaying the recorded actions — with no
    #    ladder and no picker — must reproduce the run EXACTLY. This is the
    #    contract the TS engine has to satisfy before any transcription can be
    #    deleted: if a replay had to ask the ladder anything, the file would not
    #    be a complete record of the decisions and TS could never reproduce the
    #    trajectory from it.
    c = BatchEnv([load_fixture(path)], rules, device="cpu", dtype=torch.float64)
    for _ in range(WARMUP):
        c.sim.step()
    drive.replay(c, log, seats=[0])
    rep = seat_state(c.sim)
    assert rep == got, f"replay diverged from the driven run: {rep} vs {got}"
    assert bool((b.sim.v_tile == c.sim.v_tile).all()), "replay put units on different tiles"
    assert bool((b.sim.rc_current == c.sim.rc_current).all()), "replay left different city queues"
    assert bool((b.sim.r_treasury == c.sim.r_treasury).all()), "replay diverged on treasury"
    print("  action file replays to IDENTICAL state (no ladder, no picker) OK")
    print("DRIVE OK")


if __name__ == "__main__":
    main()
