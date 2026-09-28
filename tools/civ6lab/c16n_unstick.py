"""C-16 (lab, host 4): end a grabbed seat's standing turn. When seat --p's
turn is active it is made local, its blockers are answered by `unblock.lua`
(seat --p) until none is named, its end of turn is requested, and seat 0 is
made local again. One deadline.

    python tools/civ6lab/c16n_unstick.py --host 127.0.0.4 --p 1
"""
from __future__ import annotations

import argparse
import pathlib
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import h4  # noqa: E402
import lab  # noqa: E402

GC, IG = lab.GC, lab.IG
POLICIES = (pathlib.Path(__file__).parent / "c16n_policies.lua").read_text(encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.4")
    ap.add_argument("--p", type=int, default=1)
    a = ap.parse_args()
    h4.guard(120, "c16n_unstick")
    t = h4.connect(a.host)
    if t.run(GC, f"print(Players[{a.p}]:IsTurnActive())")[-1] != "true":
        print("seat", a.p, "turn not active")
        return 0
    t.run(GC, f"PlayerManager.SetLocalPlayerAndObserver({a.p})")
    try:
        for _ in range(50):
            if t.run(IG, "print(Game.GetLocalPlayer())")[-1] == str(a.p):
                break
            time.sleep(0.1)
        unblock = lab._seat(lab.UNBLOCK.read_text(encoding="utf-8"), a.p)
        blocker = lab._seat(lab.LUA_BLOCKER, a.p)
        seen: set[str] = set()
        for _ in range(8):
            name = t.run(IG, blocker)[-1].split()[-1]
            print("blocker", name)
            if name == "none" or name in seen:
                break
            seen.add(name)
            if name == "ENDTURN_BLOCKING_FILL_CIVIC_SLOT":
                print("   ", t.run(IG, POLICIES, timeout=30)[-1])
                time.sleep(1.0)
            else:
                print("   ", t.run(IG, unblock, timeout=30)[-1])
        print(t.run(IG, lab.LUA_ENDTURN)[-1])
        # stay local until the seat's turn has ended: a request resolves on
        # the game's clock, and one made local then handed back is dropped
        end = time.monotonic() + 20
        while time.monotonic() < end:
            if t.run(GC, f"print(Players[{a.p}]:IsTurnActive())")[-1] != "true":
                print("turn ended")
                break
            time.sleep(0.5)
        else:
            print("still active; blocker", t.run(IG, blocker)[-1].split()[-1])
    finally:
        t.run(GC, "PlayerManager.SetLocalPlayerAndObserver(0)")
    t.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
