"""C-2: how long a broken promise stays broken. Calls promise_loop.py (endturn,
POSITIVE answers) --turns-per turns at a time, each call under a wall-clock
deadline, up to --calls calls; after each call reads the newest
runs/promise_<tag>_*.log and stops once the last turn logged carries no
`IsPromiseMade(--a, --b)` line (the promise no longer reads made).

    python tools/civ6lab/c2d_loop.py --tag c2d_watch --calls 10 --a 1 --b 0
"""
from __future__ import annotations

import argparse
import json
import pathlib
import subprocess
import sys

HERE = pathlib.Path(__file__).parent


def last_turn_state(log: pathlib.Path, a: int, b: int) -> tuple[int, bool]:
    last, made = -1, {}
    for ln in log.read_text(encoding="utf-8", errors="replace").splitlines():
        if not ln.startswith("{"):
            continue
        try:
            r = json.loads(ln)
        except json.JSONDecodeError:
            continue
        t = r.get("turn")
        if isinstance(t, int):
            last = max(last, t)
            made.setdefault(t, False)
            if r.get("kind") == "promise" and r.get("a") == a and r.get("b") == b and r.get("made") is True:
                made[t] = True
    return last, made.get(last, False)


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--host", default="127.0.0.4")
    p.add_argument("--tag", required=True)
    p.add_argument("--calls", type=int, default=10)
    p.add_argument("--turns-per", type=int, default=5)
    p.add_argument("--a", type=int, default=1)
    p.add_argument("--b", type=int, default=0)
    a = p.parse_args()
    for k in range(a.calls):
        cmd = [sys.executable, str(HERE / "promise_loop.py"), "--host", a.host, "--turns", str(a.turns_per),
               "--tag", a.tag, "--advance", "endturn", "--answer", "POSITIVE"]
        try:
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=178)
            rc = r.returncode
        except subprocess.TimeoutExpired:
            rc = 124
        logs = sorted((HERE / "runs").glob(f"promise_{a.tag}_*.log"))
        last, made = last_turn_state(logs[-1], a.a, a.b) if logs else (-1, True)
        print(f"call {k}: rc {rc} last turn {last} made {made}", flush=True)
        if not made:
            print("the promise no longer reads made")
            return 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
