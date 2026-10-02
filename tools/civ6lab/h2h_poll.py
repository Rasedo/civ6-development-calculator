"""H-2 hold: poll one instance's turn, local player and autoplay state for a
bounded time and print every change (a probe, not a tool).

    python tools/civ6lab/h2h_poll.py --host 127.0.0.4 --secs 40
"""
from __future__ import annotations

import argparse
import pathlib
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import h4  # noqa: E402

READ = ("print(Game.GetCurrentGameTurn() .. ' lp=' .. Game.GetLocalPlayer() .. ' obs=' .. Game.GetLocalObserver()"
        " .. ' ap=' .. tostring(AutoplayManager.IsActive()) .. ' apt=' .. AutoplayManager.GetTurns()"
        " .. ' h1=' .. tostring(Players[1]:IsHuman()) .. ' a1=' .. tostring(Players[1]:IsTurnActive())"
        " .. ' h2=' .. tostring(Players[2]:IsHuman()) .. ' a2=' .. tostring(Players[2]:IsTurnActive()))")


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--host", default="127.0.0.4")
    p.add_argument("--secs", type=float, default=40)
    p.add_argument("--every", type=float, default=0.2)
    a = p.parse_args()
    h4.guard(a.secs + 20, "h2h_poll")
    t = h4.connect(a.host)
    t0 = time.monotonic()
    last = None
    while time.monotonic() - t0 < a.secs:
        s = t.run("GameCore_Tuner", READ)[-1]
        if s != last:
            print(f"{time.monotonic() - t0:7.2f} {s}", flush=True)
            last = s
        time.sleep(a.every)
    t.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
