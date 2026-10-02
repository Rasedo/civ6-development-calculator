"""H-2 hold: when does a save asked for under the turn lock reach the disk?
Holds the next turn, asks for a save, steps one turn, then polls the save
folder (bounded) and prints how long after the release the file appeared
and which turn the lock holds by then.

    python tools/civ6lab/h2h_savecheck.py --host 127.0.0.4 --name h2hfin_a --wait 20
"""
from __future__ import annotations

import argparse
import pathlib
import sys
import time

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
import h4  # noqa: E402
import lab  # noqa: E402

SAVES = pathlib.Path.home() / "Documents" / "My Games" / "Sid Meier's Civilization VI" / "Saves" / "Single"


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--host", default="127.0.0.4")
    p.add_argument("--name", required=True)
    p.add_argument("--wait", type=float, default=20.0)
    p.add_argument("--steps", type=int, default=1, help="turns to step after the save request")
    a = p.parse_args()
    h4.guard(a.wait + 90, "h2h_savecheck")
    t = h4.connect(a.host)
    s = lab.lock(t, "read")
    if s["id"] is None:
        lab.lock(t, "target", lab.turn(t) + 1)
        s = lab.wait_hold(t, lab.turn(t), 30)
    held = s["held"]
    f = SAVES / f"{a.name}.Civ6Save"
    f.unlink(missing_ok=True)
    print(t.run(lab.IG, (HERE / "save_named.lua").read_text(encoding="utf-8").replace("SAVENAME", a.name))[-1])
    time.sleep(2.0)
    print(f"held {held}: on disk after 2 s under the hold: {f.exists()}")
    r0 = time.monotonic()
    for k in range(a.steps):
        lab.lock(t, "step")
        h = lab.wait_hold(t, held + k + 1, 60)["held"]
        print(f"   step {k + 1}: held {h} at {time.monotonic() - r0:.2f} s, on disk {f.exists()}")
    while not f.exists() and time.monotonic() - r0 < a.wait:
        time.sleep(0.1)
    print(f"on disk {f.exists()} at {time.monotonic() - r0:.2f} s after the release; lock holds {lab.lock(t, 'read')['held']}")
    t.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
