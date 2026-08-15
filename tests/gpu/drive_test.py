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
from core import load_rules, load_fixture, fixture_paths
from core.env import BatchEnv
import drive


TURNS = 120


def seat_state(sim, row=1):
    return {
        "cities": int(sim.city_alive[0, row].sum()),
        "units": int((sim.major_unit_alive[0] & (sim.major_unit_seat[0] == row)).sum()),
        "techs": int(sim.civ_techs[0, row].sum()),
        "civics": int(sim.civ_civics[0, row].sum()),
    }


def main() -> None:
    rules = load_rules()
    path = fixture_paths()[0]

    # Driven from t0: the seat starts as a settler and a warrior, and the
    # engine takes no decision of its own — every city, tech and unit below is
    # the driver's doing, so the floors are ABSOLUTE (there is no scripted
    # reference to compare against; an undriven seat stays at 0/2/0/0 forever).
    b = BatchEnv([load_fixture(path)], rules, device="cpu", dtype=torch.float64)
    log = drive.drive(b, TURNS, seats=[1])
    got = seat_state(b.sim)

    assert len(log) == TURNS, f"driver logged {len(log)} turns, expected {TURNS}"
    assert bool(b.sim.seat_ext[0, 1]), "the driven seat must be marked controlled"
    print(f"  ladder  : {got}")

    # 1. it FOUNDED — the driver must play the settler's one verb, over the
    #    real order path, or the seat never enters the game at all.
    assert got["cities"] >= 1, "the driver never founded a city from the starting settler"

    # 2. it RESEARCHED. The research verb is mask-gated and ported; a driven
    #    seat that never picks holds 0 techs forever.
    assert got["techs"] >= 8, f"only {got['techs']} techs in {TURNS} turns — the research verb is not being applied"
    assert got["civics"] >= 6, f"only {got['civics']} civics in {TURNS} turns — the civic verb is not being applied"

    # 3. it BUILT things. Production carries the most machinery of any verb; a
    #    driven seat still holding only its two starting units means the
    #    preference apply or the mask is refusing everything.
    assert got["units"] >= 3, f"the driven seat fielded no units beyond its start ({got['units']})"
    print(f"  {TURNS} turns driven by policy/ladder.py from the settler start OK")

    # 4. THE FILE IS THE INTERFACE. Replaying the recorded actions — with no
    #    ladder and no picker — must reproduce the run EXACTLY, which is what
    #    makes the log a COMPLETE record of the decisions: if a replay had to ask
    #    the ladder anything, no other engine could reproduce the trajectory
    #    from the file.
    c = BatchEnv([load_fixture(path)], rules, device="cpu", dtype=torch.float64)
    drive.replay(c, log, seats=[1])
    rep = seat_state(c.sim)
    assert rep == got, f"replay diverged from the driven run: {rep} vs {got}"
    assert bool((b.sim.major_unit_tile == c.sim.major_unit_tile).all()), "replay put units on different tiles"
    assert bool((b.sim.city_current[:, 1:b.sim.n_majors] == c.sim.city_current[:, 1:c.sim.n_majors]).all()), "replay left different city queues"
    assert bool((b.sim.civ_treasury[:, 1:] == c.sim.civ_treasury[:, 1:]).all()), "replay diverged on treasury"
    print("  action file replays to IDENTICAL state (no ladder, no picker) OK")
    print("DRIVE OK")


if __name__ == "__main__":
    main()
