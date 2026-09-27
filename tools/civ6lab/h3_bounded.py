"""H-3: run a command under a wall-clock deadline; on expiry kill it (the
whole process tree) and exit 124.

    python tools/civ6lab/h3_bounded.py --deadline 170 --log runs/x.log -- python tools/civ6lab/h3_session.py ...
"""
from __future__ import annotations

import argparse
import subprocess
import sys


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--deadline", type=float, default=170)
    p.add_argument("--log", required=True)
    p.add_argument("cmd", nargs=argparse.REMAINDER)
    a = p.parse_args()
    cmd = a.cmd[1:] if a.cmd and a.cmd[0] == "--" else a.cmd
    if cmd and cmd[0] == "python":
        cmd = [sys.executable] + cmd[1:]
    with open(a.log, "w", encoding="utf-8") as f:
        proc = subprocess.Popen(cmd, stdout=f, stderr=subprocess.STDOUT)
        try:
            rc = proc.wait(timeout=a.deadline)
        except subprocess.TimeoutExpired:
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True)
            f.write(f"\n[h3_bounded] killed after {a.deadline}s\n")
            rc = 124
    print(open(a.log, encoding="utf-8", errors="replace").read()[-3000:])
    return rc


if __name__ == "__main__":
    sys.exit(main())
