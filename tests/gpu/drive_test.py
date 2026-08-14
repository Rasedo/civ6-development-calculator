"""The LADDER DRIVES a seat for a whole game.

The engine hands out an observation and legality masks, `policy/ladder.py`
returns actions, and the engine only applies them.

The lane asserts the DRIVEN seat is a real competitor, not merely that the code
runs: a driver that silently held every turn would "pass" any smoke test while
quietly producing a civ that never builds anything, and that failure raises
nothing.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "policy"))
from core import load_rules, load_fixture, FIXTURES
from core.env import BatchEnv
import drive


TURNS = 120
WARMUP = 10


def seat_state(sim, r=0):
    return {
        "cities": int(sim.city_alive[0, r + 1].sum()),
        "units": int((sim.major_unit_alive[0] & ((sim.major_unit_seat[0] - 1) == r)).sum()),
        "techs": int(sim.civ_techs[0, r + 1].sum()),
        "civics": int(sim.civ_civics[0, r + 1].sum()),
    }


def main() -> None:
    rules = load_rules()
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
    assert bool(b.sim.seat_ext[0, 1]), "the driven seat must be marked controlled"
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

    # 3. it BUILT things. Production carries the most machinery of any verb; if
    #    the driven seat fields no units at all, the preference apply or the
    #    mask is refusing everything.
    assert got["units"] >= 1, "the driven seat fielded no units at all"

    # 4. it is COMPETITIVE with the scripted picker. Not identical — the two
    #    disagree on a few production decisions, so the trajectories legitimately
    #    diverge — but a driven civ that ends with a third of the scripted one's
    #    cities means a verb is silently refusing.
    assert got["cities"] >= max(1, ref["cities"] - 2), (
        f"driven civ has {got['cities']} cities against the scripted {ref['cities']} "
        "— check the settler column and #87's preference apply"
    )
    print(f"  {TURNS} turns driven by policy/ladder.py, seat competitive with the script OK")

    # 5. THE FILE IS THE INTERFACE. Replaying the recorded actions — with no
    #    ladder and no picker — must reproduce the run EXACTLY, which is what
    #    makes the log a COMPLETE record of the decisions: if a replay had to ask
    #    the ladder anything, no other engine could reproduce the trajectory
    #    from the file.
    c = BatchEnv([load_fixture(path)], rules, device="cpu", dtype=torch.float64)
    for _ in range(WARMUP):
        c.sim.step()
    drive.replay(c, log, seats=[0])
    rep = seat_state(c.sim)
    assert rep == got, f"replay diverged from the driven run: {rep} vs {got}"
    assert bool((b.sim.major_unit_tile == c.sim.major_unit_tile).all()), "replay put units on different tiles"
    assert bool((b.sim.city_current[:, 1:1 + max(b.sim.R, 1)] == c.sim.city_current[:, 1:1 + max(c.sim.R, 1)]).all()), "replay left different city queues"
    assert bool((b.sim.civ_treasury[:, 1:] == c.sim.civ_treasury[:, 1:]).all()), "replay diverged on treasury"
    print("  action file replays to IDENTICAL state (no ladder, no picker) OK")
    print("DRIVE OK")


if __name__ == "__main__":
    main()
