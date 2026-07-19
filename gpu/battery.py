"""The verification battery, parallelized.

    python gpu/battery.py             # everything an ENGINE stage must pass
    python gpu/battery.py --full      # + the slow MPC quality benchmarks
    python gpu/battery.py --no-eval   # skip the two 50-episode baselines

Stage 0 (serial, everything depends on it): tsc type gate + fixture
export (P5: the vite build artifact feeds no gate; vitest runs in a
lane). Then the lanes run concurrently on the measured bottleneck split:

    vitest+parity : the TS suite, then the 24-seed scripted gate
    cputests      : purchase/war/ranged/gumbel/... self-tests (CPU f64)
    mcts x3       : snapshot | search | planning as separate processes
                    (same assertions/seeds — pure process split)
    gpu           : rollout --shards 4 --pipeline-replay (P3 sharding;
                    P5: each shard's TS replay runs as the shard lands,
                    hiding the serial replay tail), then the evals

Wall-clock is stage0 + the slowest lane, with mcts_test's MPC
benchmarks (search-quality, not engine-facing) behind --full.

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

    print("stage 0 (serial): tsc, export", flush=True)
    for name, cmd in (
        # P5 battery trim: the vite build ARTIFACT feeds no gate (export,
        # replay and vitest all run from source via vite/vite-node) — the
        # type check IS the gate, so run tsc alone. vitest moved into the
        # parity lane (it needs no fixtures).
        ("tsc", [npx, "tsc", "--noEmit"]),
        ("export", [npm, "run", "gpu:export"]),
    ):
        run(name, cmd, threads=24)
        if failed.is_set():
            break

    if not failed.is_set():
        print("lanes (parallel): vitest+parity | cpu self-tests | mcts x3 parts | gpu rollout(sharded, replay pipelined)/evals", flush=True)
        mcts = [py, "gpu/mcts_test.py"] + (["--full"] if FULL else [])
        lanes = [
            [
                ("vitest", [npm, "test"], 8),
                ("parity", [py, "gpu/parity_test.py"], 6),
            ],
            [
                ("purchase", [py, "gpu/purchase_test.py"], 4),
                ("rival_purchase", [py, "gpu/rival_purchase_test.py"], 4),
                ("war", [py, "gpu/war_test.py"], 4),
                ("ranged", [py, "gpu/ranged_test.py"], 4),
                ("combat_mod", [py, "gpu/combat_mod_test.py"], 4),  # B-29 wounded + river
                ("occupancy", [py, "gpu/occupancy_test.py"], 4),
                ("builder_gain", [py, "gpu/builder_gain_test.py"], 4),
                ("domination", [py, "gpu/domination_test.py"], 4),
                ("bankruptcy", [py, "gpu/bankruptcy_test.py"], 4),
                ("seat", [py, "gpu/seat_test.py"], 4),
                ("government", [py, "gpu/government_test.py"], 4),
                ("controlled", [py, "gpu/controlled_test.py"], 4),
                ("duel", [py, "gpu/duel_test.py"], 4),
                ("gumbel", [py, "gpu/gumbel_test.py"], 4),
                ("religion_gp", [py, "gpu/religion_gp_test.py"], 4),
                ("war_weariness", [py, "gpu/war_weariness_test.py"], 4),
                ("space_race", [py, "gpu/space_race_test.py"], 4),
                ("naval", [py, "gpu/naval_test.py"], 4),  # #45/B-6 gate-unreachable naval surfaces
                ("districts", [py, "gpu/district_breadth_test.py"], 4),  # B9/A-9 catalog-breadth surfaces
                ("rc_registry", [py, "gpu/rc_registry_test.py"], 4),  # B10/A-24 rival district/tile registry consistency
                ("religion2", [py, "gpu/religion2_test.py"], 4),  # B6 missionary/enhancer/religious-victory surfaces
                ("encampment", [py, "gpu/encampment_test.py"], 4),  # B7/B-17 Encampment strike + training XP + specialist surfaces
                ("great_works", [py, "gpu/great_works_test.py"], 4),  # B7/B-20 Writer/Musician Great-Work slots + yield
                ("gp_aura", [py, "gpu/gp_aura_test.py"], 4),  # B7-G/B-8 Great General/Admiral spawn/walk/aura/capture (gate-unreachable GENERAL)
            ],
            # P5: mcts split into its three independent groups, run as three
            # parallel lanes (same assertions/seeds — pure process split).
            [("mcts-snap", mcts + ["--part", "snapshot"], 4)],
            [("mcts-search", mcts + ["--part", "search"], 4)],
            [("mcts-plan", mcts + ["--part", "planning"], 4)],
            [
                # P3→P5: sharded rollout (4 procs × OMP 4 — measured best on
                # this 24-CPU box; 6 shards THRASH: gpu 282s, parity starved);
                # replay runs AS THE SHARD LANDS (--pipeline-replay), hiding
                # the ~35s serial replay tail. Merge + gate semantics identical.
                ("gpu-gate", [py, "gpu/rollout.py", "--shards", "4", "--pipeline-replay"], 4),
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
