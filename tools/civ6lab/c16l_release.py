"""C-16: release a grabbed seat whose turn stands — make --p local, answer its
blockers once (unblock.lua for that seat), request its end of turn, then make
seat 0 local again and report the turn state. One deadline.

    python tools/civ6lab/c16l_release.py --p 1
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
STATE = "print(Game.GetCurrentGameTurn(), Players[0]:IsTurnActive(), Players[ZP]:IsTurnActive())"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.4")
    ap.add_argument("--p", type=int, default=1)
    a = ap.parse_args()
    h4.guard(90, "c16l_release")
    t = h4.connect(a.host)
    st = STATE.replace("ZP", str(a.p))
    print("before", t.run(GC, st)[-1])
    t.run(GC, f"PlayerManager.SetLocalPlayerAndObserver({a.p})")
    for _ in range(30):
        if t.run(IG, "print(Game.GetLocalPlayer())")[-1] == str(a.p):
            break
        time.sleep(0.2)
    blocker = lab._seat(lab.LUA_BLOCKER, a.p)
    unblock = lab._seat(lab.UNBLOCK.read_text(encoding="utf-8"), a.p)
    for _ in range(6):
        name = t.run(IG, blocker)[-1].split()[-1]
        print("blocker", name)
        if name == "none":
            break
        if name == "ENDTURN_BLOCKING_COMMEMORATION_AVAILABLE":
            com = lab.COMMEMORATE.read_text(encoding="utf-8").replace("ZSEAT", str(a.p)).replace("ZPICK", "")
            print("  ", t.run(IG, com, timeout=30)[-1])
            time.sleep(0.5)
            continue
        print("  ", t.run(IG, unblock, timeout=30)[-1])
    print(t.run(IG, lab.LUA_ENDTURN)[-1])
    time.sleep(1.0)
    t.run(GC, "PlayerManager.SetLocalPlayerAndObserver(0)")
    for _ in range(40):
        time.sleep(0.5)
        s = t.run(GC, st)[-1]
        if s.split()[1] == "true":
            break
    print("after", t.run(GC, st)[-1])
    t.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
