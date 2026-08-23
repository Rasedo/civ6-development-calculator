"""Run the battery's poke lanes STANDALONE, through a bounded pool.

NOT a pre-battery pass, and not a second opinion. `battery.py` runs its own
poke group through a draining pool (`lane_parallel`, `bail=False`), so a
plain battery already surfaces EVERY poke red in one run, and it makes the
same both-directions lane check before it starts. A sweep in FRONT of a
battery buys nothing.

What it is for is iteration AFTER a red, where the battery's other lanes are
dead weight: all 73 pokes in ~140s against the battery's ~450s, or one
mechanic's lanes in seconds with `-k`.

    python tools/gpu/poke_sweep.py              # every lane
    python tools/gpu/poke_sweep.py --jobs 12    # more workers
    python tools/gpu/poke_sweep.py -k district  # only lanes whose name matches

The lane list is READ OUT OF `gpu/battery.py`, so the sweep and the battery
can never disagree about what a lane is. Lanes start longest-first —
measured from `stats/battery.jsonl` where it has seen the lane, `POKE_COST`
where it has not — because a short lane starting last costs nothing and a
long one costs the makespan.
"""
from __future__ import annotations

import argparse
import ast
import json
import os
import re
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BATTERY = ROOT / "gpu" / "battery.py"
STATS = ROOT / "stats" / "battery.jsonl"

LANE_RE = re.compile(r'\("([a-z0-9_]+)", \[py, "(tests/gpu/[a-z0-9_]+\.py)"\]')

# The box is 24 cores and is the OWNER's: workers x OMP is the whole budget.
DEFAULT_JOBS = 8
DEFAULT_OMP = 1
DEFAULT_COST = 10.0
STATS_RUNS = 5  # how many recent battery records to take lane costs from


def registered_lanes() -> list[tuple[str, str]]:
    return LANE_RE.findall(BATTERY.read_text(encoding="utf-8"))


def static_cost() -> dict[str, float]:
    """`POKE_COST` out of the battery source, without importing it."""
    tree = ast.parse(BATTERY.read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(
            isinstance(t, ast.Name) and t.id == "POKE_COST" for t in node.targets
        ):
            return {str(k): float(v) for k, v in ast.literal_eval(node.value).items()}
    return {}


def measured_cost() -> dict[str, float]:
    """The SLOWEST time each lane has taken in the last few battery runs. A
    scheduler that underestimates a long lane pays for it in makespan, so the
    max is the useful statistic here, not the median."""
    out: dict[str, float] = {}
    if not STATS.exists():
        return out
    rows = []
    for line in STATS.read_text(encoding="utf-8").splitlines():
        if line.strip():
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    for rec in rows[-STATS_RUNS:]:
        for step in rec.get("steps", []):
            if step.get("status") == "ok":
                name, secs = str(step.get("lane", "")), float(step.get("secs", 0.0))
                out[name] = max(out.get(name, 0.0), secs)
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--jobs", type=int, default=DEFAULT_JOBS)
    ap.add_argument("--omp", type=int, default=DEFAULT_OMP)
    ap.add_argument("-k", dest="pattern", default="", help="only lanes whose name or path matches")
    ap.add_argument("--list", action="store_true", help="print the schedule and exit")
    args = ap.parse_args()

    lanes = registered_lanes()
    onwire = {p for _n, p in lanes}
    ondisk = {f"tests/gpu/{p.name}" for p in (ROOT / "tests" / "gpu").glob("*_test.py")}
    unregistered = sorted(ondisk - onwire)
    missing = sorted(p for p in onwire if not (ROOT / p).exists())

    cost = {**static_cost(), **measured_cost()}
    sched = [(n, p) for n, p in lanes if (ROOT / p).exists()]
    if args.pattern:
        sched = [(n, p) for n, p in sched if args.pattern in n or args.pattern in p]
    sched.sort(key=lambda np: -cost.get(np[0], DEFAULT_COST))
    if not sched:
        # a filter that selects nothing must not read as a clean sweep
        print(f"SWEEP RED: -k {args.pattern!r} matched no lane")
        return 1

    print(f"{len(lanes)} lanes registered, {len(ondisk)} *_test.py on disk — "
          f"{args.jobs} workers x OMP {args.omp}")
    for p in unregistered:
        # A test the battery never runs is an instrument that SHRANK without
        # saying so, which is the same failure as a lane naming a file that
        # is gone. Both are red here, not warnings.
        print(f"  UNREGISTERED  {p}  (on disk, in no battery lane)")
    for p in missing:
        print(f"  MISSING FILE  {p}  (registered, not on disk)")
    if args.list:
        for n, p in sched:
            print(f"  {cost.get(n, DEFAULT_COST):7.1f}s  {n:24s} {p}")
        return 1 if (unregistered or missing) else 0

    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    env["PYTHONUTF8"] = "1"
    env["OMP_NUM_THREADS"] = str(args.omp)
    env["MKL_NUM_THREADS"] = str(args.omp)

    lock = threading.Lock()
    done = [0]
    bad: list[str] = [*missing, *unregistered]
    serial = [0.0]

    def one(name: str, path: str) -> None:
        t0 = time.time()
        r = subprocess.run([sys.executable, path], cwd=ROOT, env=env,
                           capture_output=True, text=True,
                           encoding="utf-8", errors="replace")
        dt = time.time() - t0
        with lock:
            done[0] += 1
            serial[0] += dt
            ok = r.returncode == 0
            print(f"  {'ok  ' if ok else 'RED '} {name:24s} {dt:6.1f}s  "
                  f"({done[0]}/{len(sched)})", flush=True)
            if not ok:
                bad.append(name)
                for stream in (r.stdout, r.stderr):
                    tail = stream.splitlines()[-12:]
                    if tail:
                        print("      " + "\n      ".join(tail), flush=True)

    t0 = time.time()
    with ThreadPoolExecutor(max_workers=max(1, args.jobs)) as pool:
        futures = {pool.submit(one, n, p): n for n, p in sched}
    for fut, name in futures.items():
        # a future's exception is otherwise swallowed, and a lane that
        # silently never ran reads exactly like a lane that passed
        if fut.exception() is not None:
            bad.append(name)
            print(f"  RED  {name:24s} launcher: {fut.exception()!r}")
    wall = time.time() - t0

    speedup = f", {serial[0] / wall:.1f}x" if wall > 0 else ""
    print(f"wall {wall:.0f}s (serial-equivalent {serial[0]:.0f}s{speedup})")
    print(("SWEEP RED: " + ", ".join(bad)) if bad
          else f"SWEEP OK — {len(sched)} lanes")
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
