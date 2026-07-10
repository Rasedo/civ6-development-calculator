"""The verification battery, parallelized.

    python gpu/battery.py             # everything an ENGINE stage must pass
    python gpu/battery.py --full      # + the slow MPC quality benchmarks
    python gpu/battery.py --no-eval   # skip the two 50-episode baselines

Stage 0 (serial, everything depends on it): tsc build, vitest, fixture
export. Then four lanes run concurrently on the measured bottleneck split:

    parity   : the 24-seed scripted gate (CPU f64)
    cputests : purchase/war/ranged/gumbel/... self-tests (CPU f64)
    mcts     : mcts_test alone (~170s — co-critical, so its own lane)
    gpu      : rollout --shards 3 (P3: 3 processes x OMP 4; tiny-tensor
               torch scales across processes, the merge is byte-identical)
               -> replay (off-script gate), then the two eval baselines

Wall-clock is stage0 + the slowest lane (~3 min pre-P3, ~2 min after)
instead of the ~13 min serial sum, with mcts_test's MPC benchmarks (66%
of the old cost; search-quality, not engine-facing) behind --full.

Each step's OMP thread count is capped so three torch processes don't
oversubscribe the box. Exit code is nonzero if ANY step fails; the table
at the end shows per-step wall time and status.
"""

from __future__ import annotations

import os
import subprocess
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FULL = "--full" in sys.argv
NO_EVAL = "--no-eval" in sys.argv

results: list[tuple[str, float, int]] = []
lock = threading.Lock()
failed = threading.Event()


def run(name: str, cmd: list[str], threads: int = 8) -> None:
    env = os.environ.copy()
    env.setdefault("PYTHONUTF8", "1")
    env["OMP_NUM_THREADS"] = str(threads)
    env["MKL_NUM_THREADS"] = str(threads)
    t0 = time.time()
    p = subprocess.run(cmd, cwd=ROOT, env=env, capture_output=True, text=True, encoding="utf-8", errors="replace")
    dt = time.time() - t0
    with lock:
        results.append((name, dt, p.returncode))
        status = "ok" if p.returncode == 0 else f"FAIL rc={p.returncode}"
        print(f"  {name:<14} {dt:6.1f}s  {status}", flush=True)
        if p.returncode == 0 and name.startswith("eval"):
            # baselines are results, not just gates — always surface them
            for ln in p.stdout.strip().splitlines()[-1:]:
                print(f"    | {ln}", flush=True)
        if p.returncode != 0:
            failed.set()
            tail = (p.stdout + "\n" + p.stderr).strip().splitlines()[-15:]
            print("    | " + "\n    | ".join(tail), flush=True)


def lane(steps: list[tuple[str, list[str], int]]) -> None:
    for name, cmd, threads in steps:
        if failed.is_set():
            with lock:
                results.append((name, 0.0, -1))
                print(f"  {name:<14}   skip  (earlier failure)", flush=True)
            continue
        run(name, cmd, threads)


def main() -> int:
    npx = "npx.cmd" if os.name == "nt" else "npx"
    npm = "npm.cmd" if os.name == "nt" else "npm"
    py = sys.executable
    t0 = time.time()

    print("stage 0 (serial): build, vitest, export", flush=True)
    for name, cmd in (
        ("build", [npm, "run", "build"]),
        ("vitest", [npm, "test"]),
        ("export", [npm, "run", "gpu:export"]),
    ):
        run(name, cmd, threads=24)
        if failed.is_set():
            break

    if not failed.is_set():
        print("lanes (parallel): parity | cpu self-tests | mcts | gpu rollout(sharded)/replay/evals", flush=True)
        mcts_cmd = [py, "gpu/mcts_test.py"] + (["--full"] if FULL else [])
        lanes = [
            [("parity", [py, "gpu/parity_test.py"], 6)],
            [
                ("purchase", [py, "gpu/purchase_test.py"], 4),
                ("war", [py, "gpu/war_test.py"], 4),
                ("ranged", [py, "gpu/ranged_test.py"], 4),
                ("occupancy", [py, "gpu/occupancy_test.py"], 4),
                ("domination", [py, "gpu/domination_test.py"], 4),
                ("bankruptcy", [py, "gpu/bankruptcy_test.py"], 4),
                ("seat", [py, "gpu/seat_test.py"], 4),
                ("controlled", [py, "gpu/controlled_test.py"], 4),
                ("duel", [py, "gpu/duel_test.py"], 4),
                ("gumbel", [py, "gpu/gumbel_test.py"], 4),
            ],
            # P3: mcts is its own lane (~170s) — inside the tests lane it made
            # that lane co-critical with the gpu lane.
            [("mcts", mcts_cmd, 6)],
            [
                # P3: sharded rollout — 3 processes × OMP 4 (tiny-tensor torch
                # scales across processes, not threads; the merge is
                # byte-identical, every game keeps its global seed).
                ("rollout", [py, "gpu/rollout.py", "--shards", "3"], 4),
                ("replay", [npm, "run", "gpu:replay"], 8),
            ]
            + (
                []
                if NO_EVAL
                else [
                    ("eval-random", [py, "gpu/eval.py", "--policy", "random", "--episodes", "50"], 8),
                    ("eval-scripted", [py, "gpu/eval.py", "--policy", "scripted", "--episodes", "50"], 8),
                ]
            ),
        ]
        threads = [threading.Thread(target=lane, args=(l,)) for l in lanes]
        for th in threads:
            th.start()
        for th in threads:
            th.join()

    wall = time.time() - t0
    print(f"\n{'step':<14} {'time':>7}  status")
    for name, dt, rc in results:
        print(f"{name:<14} {dt:6.1f}s  {'ok' if rc == 0 else 'SKIP' if rc == -1 else 'FAIL'}")
    serial = sum(dt for _, dt, _ in results)
    print(f"\nwall {wall:.0f}s (serial-equivalent {serial:.0f}s, {serial / max(wall, 1):.1f}x)")
    if failed.is_set():
        print("BATTERY FAILED")
        return 1
    print("BATTERY OK" + (" (fast mcts; --full for MPC benchmarks)" if not FULL else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
