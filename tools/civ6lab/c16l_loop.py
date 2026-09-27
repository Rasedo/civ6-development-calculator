"""C-16 arms: call c16w_cycle.py (each call deadline-bound, 3 turns) --calls
times in a row; stops after two failed calls in a row or at the stop file
runs/c16l.stop.

    python tools/civ6lab/c16l_loop.py --calls 15 --log tools/civ6lab/runs/escape_cs_c16l_lvl1.log --defender 1:7602178
"""
from __future__ import annotations

import argparse
import pathlib
import subprocess
import sys

HERE = pathlib.Path(__file__).parent


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--calls", type=int, default=15)
    p.add_argument("--log", required=True)
    p.add_argument("--defender", required=True)
    p.add_argument("--district", default="54:10")
    p.add_argument("--host", default="127.0.0.4")
    a = p.parse_args()
    fails = 0
    for k in range(a.calls):
        if (HERE / "runs" / "c16l.stop").exists():
            print("stop file")
            break
        cmd = [sys.executable, str(HERE / "c16w_cycle.py"), "--host", a.host, "--log", a.log, "--turns", "3",
               "--defender", a.defender, "--district", a.district, "--lazy"]
        try:
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=200)
            rc, out = r.returncode, r.stdout.strip().replace("\n", " | ")
        except subprocess.TimeoutExpired:
            rc, out = 124, "timeout"
        print(f"call {k}: rc {rc} {out}", flush=True)
        fails = fails + 1 if rc else 0
        if fails >= 2:
            print("two failures in a row; stopping")
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
