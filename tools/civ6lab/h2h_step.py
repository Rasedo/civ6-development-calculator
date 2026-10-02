"""H-2 hold: measure the turn lock (`turn_lock.lua`) on an all-AI observer
game — hold at a turn, read, release, hold at the next — and write one JSON
line per hold to --log.

    python tools/civ6lab/h2h_step.py --host 127.0.0.4 --log runs/h2h_step_B.jsonl --steps 30
    python tools/civ6lab/h2h_step.py --host 127.0.0.4 --log runs/h2h_hold_A.jsonl --hold-at 41

`--steps N`: hold the next turn (or keep the hold already standing), then N
times read and step; each line carries the turn held, the turn GameCore and
InGame read during the hold, the state signature (`h2h_sig.lua`) read twice
`--settle` seconds apart (equal = nothing moved while held), the wall time
from release to the next hold, and the time spent reading. `--hold-at T`:
one hold at T with no stepping; the turn changes it saw on the way are
logged with their wall times (the free-running baseline). Every call is
bounded by --deadline.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys
import time

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
import h4  # noqa: E402
import lab  # noqa: E402

GC, IG = "GameCore_Tuner", "InGame"
SIG = (HERE / "h2h_sig.lua").read_text(encoding="utf-8")


EVENT = ["TurnBegin", -1]  # the lock's event and the player it must name (--event, --who)


def lock(t, mode: str, arg: int = 0) -> dict:
    return lab.lock(t, mode, arg, EVENT[0], EVENT[1])


def gc_turn(t) -> int:
    return int(t.run(GC, "print(Game.GetCurrentGameTurn())")[-1])


def wait_hold(t, want: int, limit: float, changes: list) -> tuple[dict, float]:
    """poll until the lock holds turn `want` (or any later turn: a skip);
    the turn changes seen on the way go to `changes`"""
    t0 = time.monotonic()
    last = None
    while time.monotonic() - t0 < limit:
        tn = gc_turn(t)
        if tn != last:
            changes.append((round(time.time(), 3), tn))
            last = tn
        if tn >= want:
            s = lock(t, "read")
            if s["id"] is not None:
                return s, time.monotonic() - t0
        time.sleep(0.05)
    raise TimeoutError(f"no hold at {want} within {limit}s (last turn {last})")


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--host", default="127.0.0.4")
    p.add_argument("--log", type=pathlib.Path, required=True)
    p.add_argument("--steps", type=int, default=0)
    p.add_argument("--hold-at", type=int)
    p.add_argument("--event", default="TurnBegin", help="the InGame event the lock is taken in")
    p.add_argument("--who", type=int, default=-1, help="the player a per-player event must name")
    p.add_argument("--settle", type=float, default=1.0)
    p.add_argument("--turn-wait", type=float, default=60.0)
    p.add_argument("--deadline", type=float, default=170.0)
    a = p.parse_args()
    h4.guard(a.deadline, "h2h_step")
    EVENT[:] = [a.event, a.who]
    t = h4.connect(a.host)
    out = a.log.open("a", encoding="utf-8", newline="\n")

    def rec(d: dict) -> None:
        out.write(json.dumps(d) + "\n")
        out.flush()
        print(json.dumps(d), flush=True)

    s = lock(t, "read")
    rec({"kind": "start", "wall": time.time(), **s})
    if a.hold_at is not None:
        if s["id"] is not None:
            lock(t, "release")  # a standing hold is let go: the run to T is free
        lock(t, "target", a.hold_at)
        changes: list = []
        s, waited = wait_hold(t, a.hold_at, a.deadline - 20, changes)
        sig = t.run(GC, SIG)[-1]
        rec({"kind": "hold", "want": a.hold_at, "held": s["held"], "gc": gc_turn(t),
             "ig": s["turn"], "waited": round(waited, 3), "sig": sig, "changes": changes})
        return 0
    if s["id"] is None:
        want = gc_turn(t) + 1
        lock(t, "target", want)
        s, _ = wait_hold(t, want, a.turn_wait, [])
    for _ in range(a.steps):
        r0 = time.monotonic()
        gc = gc_turn(t)
        sig1 = t.run(GC, SIG)[-1]
        time.sleep(a.settle)
        sig2 = t.run(GC, SIG)[-1]
        ig = int(t.run(IG, "print(Game.GetCurrentGameTurn())")[-1])
        read_s = time.monotonic() - r0 - a.settle
        held = s["held"]
        rel = lock(t, "step")
        r1 = time.monotonic()
        changes: list = []
        s, waited = wait_hold(t, held + 1, a.turn_wait, changes)
        rec({"kind": "step", "held": held, "gc": gc, "ig": ig, "still": sig1 == sig2, "sig": sig1,
             "read_s": round(read_s, 3), "release": rel["line"], "next_held": s["held"],
             "release_to_hold_s": round(time.monotonic() - r1, 3), "changes": changes,
             "skip": s["held"] != held + 1})
    t.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
