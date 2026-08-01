"""The verification battery, parallelized.

    python gpu/battery.py             # everything an ENGINE stage must pass
    python gpu/battery.py --full      # + the slow MPC quality benchmarks
    python gpu/battery.py --eval      # + the two 50-episode RL baselines (P8 only)

Stage 0 (serial, everything depends on it): tsc type gate + fixture
export (P5: the vite build artifact feeds no gate; vitest runs in a
lane). Then the lanes run concurrently on the measured bottleneck split:

    vitest+parity : the TS suite, then the 24-seed scripted gate
    cputests      : purchase/war/ranged/snapshot/... self-tests (CPU f64)
                    (same assertions/seeds — pure process split)
    gpu           : rollout --shards 4 --pipeline-replay (P3 sharding;
                    P5: each shard's TS replay runs as the shard lands,
                    hiding the serial replay tail), then the evals

Wall-clock is stage0 + the slowest lane, with the RL search/MPC
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
# EVALS ARE OFF BY DEFAULT (#78). Owner directive 2026-07-10: no per-stage
# eval re-baselining during engine development — "commit on battery green
# WITHOUT running gpu/eval.py", with ONE baseline pass when the engine
# settles, right before P8 training. Across the whole P1-P5 campaign the
# parity gates caught every real problem first; the baseline never
# independently caught one. They were also the largest cost in the battery,
# so running them per-stage paid a lot for parked work. `--no-eval` is still
# accepted and is now a no-op, since it describes the default.
EVAL = "--eval" in sys.argv
NO_BAIL = "--no-bail" in sys.argv  # #78: keep every lane running past a failure

# Poke pool (#78): 4 workers x OMP 2 = 8 threads, up from the old serial lane's
# single OMP-4 process. Deliberately small — the box is 24 cores and parity (6)
# + gpu-gate (4 shards x 4) already claim most of them.
POKE_WORKERS = 4
POKE_OMP = 2

# Measured poke-lane wall times (seconds), used ONLY to order the poke
# group cheapest-first so bail-fast surfaces a red sooner. Values from this
# box's battery logs; a stale entry costs ordering quality, never correctness.
POKE_COST = {
    "great_works": 2.7, "religion_gp": 3.2, "government": 3.3, "builder_gain": 3.4,
    "relics": 3.4, "trade2": 3.5, "bankruptcy": 3.7, "domination": 3.8,
    "culture_victory": 4.3, "space_race": 4.8, "encampment": 4.9, "cs_verbs": 6.6,
    "cs_bonus": 7.9, "rival_purchase": 9.2, "rc_registry": 12.4, "controlled": 13.8,
    "combat_mod": 17.1, "ranged": 18.5, "duel": 20.6, "occupancy": 21.0,
    "governors": 22.2, "war_weariness": 23.2, "geopolitics": 23.8, "seat": 29.0,
    "gp_aura": 31.6, "war": 32.5, "purchase": 38.8, "religion2": 51.7,
    "naval": 53.7, "districts": 87.9, "watermill": 12.0, "fort": 6.0,
    "festival": 4.0, "cs_war": 6.0, "snapshot": 30.0, "golden_move": 3.0, "pref_apply": 8.0,
    "rr_strike": 12.0,
    "spawn_reclaim": 6.0,
    "city_first": 14.0,
}

results: list[tuple[str, float, int]] = []
lock = threading.Lock()
failed = threading.Event()


def run(name: str, cmd: list[str], threads: int = 8, bail: bool = True) -> None:
    env = os.environ.copy()
    env.setdefault("PYTHONUTF8", "1")
    env["OMP_NUM_THREADS"] = str(threads)
    env["MKL_NUM_THREADS"] = str(threads)
    t0 = time.time()
    # BAIL-FAST (#78): the standing process is to fix and RE-RUN the whole
    # battery, so once any lane fails every other lane is wasted wall-clock —
    # and the expensive ones (eval ~1650s, parity ~650s, gpu-gate ~594s) would
    # otherwise run to completion after the verdict is already known. Poll
    # instead of blocking so a failure elsewhere can kill this lane now.
    # `--no-bail` restores the old run-everything behaviour when the full
    # picture is wanted (e.g. counting how many lanes a change breaks).
    p = subprocess.Popen(
        cmd, cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, encoding="utf-8", errors="replace",
    )
    while True:
        try:
            out, err = p.communicate(timeout=1.0)
            break
        except subprocess.TimeoutExpired:
            if bail and failed.is_set() and not NO_BAIL:
                p.kill()
                p.communicate()
                dt = time.time() - t0
                with lock:
                    results.append((name, dt, -3))
                    print(f"  {name:<14} {dt:6.1f}s  bail  (another lane failed)", flush=True)
                return
    p = subprocess.CompletedProcess(cmd, p.returncode, out, err)
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


def lane_parallel(steps: list[tuple[str, list[str], int]], workers: int, threads: int) -> None:
    """Run one lane's steps CONCURRENTLY through a bounded pool.

    #78: the poke group used to run strictly serial (~348s). That was never
    about safety — rule (7)'s standalone sweep has always run these in
    parallel, and the #55 round caught three reds in one such pass; no poke
    test writes a file (checked), they are independent processes over
    read-only fixtures. It was about not oversubscribing the box.

    Bounded is the point: all 31 at OMP 4 would be 124 threads on 24 cores,
    and this box has measured evidence that oversubscription starves the
    critical lanes (6 rollout shards thrash: gpu 282s, parity starved). So a
    small pool at a lower OMP instead — same total core-seconds, concentrated
    into a shorter window. The critical path is the ~3720s GPU lane, so a
    brief squeeze costs it almost nothing, while every poke red now surfaces
    in one pass instead of one-per-battery-run.
    """
    pos = [0]
    lk = threading.Lock()

    def worker() -> None:
        while True:
            with lk:
                if pos[0] >= len(steps):
                    return
                name, cmd, _ = steps[pos[0]]
                pos[0] += 1
            # DRAIN, don't bail (#78): a poke failure still sets `failed` and so
            # still kills the expensive lanes immediately — but the pool itself
            # runs to completion, because finishing it costs only ~90s and it is
            # what makes ALL poke reds surface in ONE run. That is precisely
            # what rule (7)'s standalone parallel sweep existed to provide, so
            # the sweep is now redundant rather than merely cheaper to skip.
            run(name, cmd, threads, bail=False)

    ws = [threading.Thread(target=worker) for _ in range(workers)]
    for w in ws:
        w.start()
    for w in ws:
        w.join()


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
    # #51/S7.8f (task #55): ruff ships in the venv beside the interpreter.
    ruff = Path(py).with_name("ruff.exe" if os.name == "nt" else "ruff")
    t0 = time.time()

    print("stage 0 (serial): tsc, export", flush=True)
    for name, cmd in (
        # P5 battery trim: the vite build ARTIFACT feeds no gate (export,
        # replay and vitest all run from source via vite/vite-node) — the
        # type check IS the gate, so run tsc alone. vitest moved into the
        # parity lane (it needs no fixtures).
        ("tsc", [npx, "tsc", "--noEmit"]),
        # #51/S1.3i: most of scripts/ cannot be typechecked (@types/node is not
        # installed) and it IS the parity harness. A parse costs ~200ms and
        # catches the class that killed this gate with an empty error message.
        ("parse", ["node", "scripts/parse-check.mjs"]),
        ("lint", [npx, "oxlint", "src", "scripts", "tests"]),  # #51: no-constant-binary-expression et al
        # #51/S7.8f (task #55): F821 = UNDEFINED NAME on the Python side. Costs
        # ~0.3s and catches the class that cost this session hours: `cs_slot`
        # was undefined in a new engine hook, so every shard that reached that
        # branch CRASHED, rollout.py then waited forever on the dead worker, and
        # the lane presented as a HANG rather than as an error. Python cannot
        # catch it at import time and the branch was unreachable from scripted
        # parity, so nothing before the rollout would have found it.
        ("f821", [str(ruff), "check", "--select", "F821", "gpu", "scripts"]),
        ("export", [npm, "run", "gpu:export"]),
    ):
        run(name, cmd, threads=24)
        if failed.is_set():
            break

    if not failed.is_set():
        print("lanes (parallel): vitest+parity | cpu self-tests | gpu rollout(sharded, replay pipelined)/evals", flush=True)
        lanes = [
            [
                ("vitest", [npm, "test"], 8),
                ("parity", [py, "gpu/parity_test.py"], 6),
            ],
            [
                ("purchase", [py, "gpu/tests/purchase_test.py"], 4),
                ("rival_purchase", [py, "gpu/tests/rival_purchase_test.py"], 4),
                ("war", [py, "gpu/tests/war_test.py"], 4),
                ("ranged", [py, "gpu/tests/ranged_test.py"], 4),
                ("combat_mod", [py, "gpu/tests/combat_mod_test.py"], 4),  # B-29 wounded + river
                ("occupancy", [py, "gpu/tests/occupancy_test.py"], 4),
                ("builder_gain", [py, "gpu/tests/builder_gain_test.py"], 4),
                ("domination", [py, "gpu/tests/domination_test.py"], 4),
                ("melee", [py, "gpu/tests/melee_test.py"], 4),  # #51/S3.4: was UNGATED — an S3.2 regression hid here
                ("peace_target", [py, "gpu/tests/peace_target_test.py"], 2),  # #51: no attack without a war
                ("rr_strike", [py, "gpu/tests/rr_strike_test.py"], 2),  # #51/S7.1 (#59): a rival city fires on an enemy RIVAL
                ("spawn_reclaim", [py, "gpu/tests/spawn_reclaim_test.py"], 2),
                ("city_first", [py, "gpu/tests/city_first_test.py"], 2),  # #51/S7.10a: a garrison shields no city  # #51/S7.2: a reclaimed slot hands on no drowned unit's MP
                ("stack_rules", [py, "gpu/tests/stack_rules_test.py"], 2),  # #51: cross-domain stacking + Encampment spawn wall
                ("golden_move", [py, "gpu/tests/golden_move_test.py"], 2),  # B-24: MONUMENTALITY / EXODUS +2 MP, per seat
                ("bankruptcy", [py, "gpu/tests/bankruptcy_test.py"], 4),
                ("seat", [py, "gpu/tests/seat_test.py"], 4),
                ("government", [py, "gpu/tests/government_test.py"], 4),
                ("controlled", [py, "gpu/tests/controlled_test.py"], 4),
                ("pref_apply", [py, "gpu/tests/pref_apply_test.py"], 4),  # #87: preference-order apply — the ONLY lane that reaches it
                ("duel", [py, "gpu/tests/duel_test.py"], 4),
                ("religion_gp", [py, "gpu/tests/religion_gp_test.py"], 4),
                ("war_weariness", [py, "gpu/tests/war_weariness_test.py"], 4),
                ("space_race", [py, "gpu/tests/space_race_test.py"], 4),
                ("culture_victory", [py, "gpu/tests/culture_victory_test.py"], 4),  # B-25 (#72): the gate-unreachable culture win
                ("relics", [py, "gpu/tests/relics_test.py"], 4),  # B-20 (#73): martyr relics — temple slots, faith + tourism
                ("festival", [py, "gpu/tests/festival_test.py"], 4),  # #79: Festival pays THREE GP classes at 0.11 (gate-unreachable)
                ("cs_war", [py, "gpu/tests/cs_war_test.py"], 4),  # A-18 (#79): player<->CS war gates the attack mask
                ("snapshot", [py, "gpu/tests/snapshot_restore_test.py"], 4),  # ENGINE: _MUTABLE round-trip + step determinism (the ONLY coverage; parity never restores)
                ("naval", [py, "gpu/tests/naval_test.py"], 4),  # #45/B-6 gate-unreachable naval surfaces
                ("districts", [py, "gpu/tests/district_breadth_test.py"], 4),  # B9/A-9 catalog-breadth surfaces
                ("rc_registry", [py, "gpu/tests/rc_registry_test.py"], 4),  # B10/A-24 rival district/tile registry consistency
                ("religion2", [py, "gpu/tests/religion2_test.py"], 4),  # B6 missionary/enhancer/religious-victory surfaces
                ("encampment", [py, "gpu/tests/encampment_test.py"], 4),  # B7/B-17 Encampment strike + training XP + specialist surfaces
                ("great_works", [py, "gpu/tests/great_works_test.py"], 4),  # B7/B-20 Writer/Musician Great-Work slots + yield
                ("gp_aura", [py, "gpu/tests/gp_aura_test.py"], 4),  # B7-G/B-8 Great General/Admiral spawn/walk/aura/capture (gate-unreachable GENERAL)
                ("cs_bonus", [py, "gpu/tests/cs_bonus_test.py"], 4),  # B8-K/B-21 CS envoy building re-key + suzerain perk (6-envoy tier gate-unreachable)
                ("cs_verbs", [py, "gpu/tests/cs_verbs_test.py"], 4),  # B8/A-12 rival levy + rival CS quests (zero-draw)
                ("trade2", [py, "gpu/tests/trade2_test.py"], 4),  # B8/B-23 international routes + route duration surfaces
                ("geopolitics", [py, "gpu/tests/geopolitics_test.py"], 4),  # #55 A-19/B-33/B-22 per-pair wars + casus belli + rc->rc transfer
                ("governors", [py, "gpu/tests/governors_test.py"], 4),  # #68/B-24 era-score hooks + Ages loyalty modulation + governor anchors
                ("watermill", [py, "gpu/tests/watermill_test.py"], 4),
                ("unit_head", [py, "gpu/tests/unit_head_test.py"], 4),  # #51/S0.3: action enum == mask width == RL head width
                ("state_discipline", [py, "gpu/tests/state_discipline_test.py"], 4),  # #51/S0.4: alias-rebind + _MUTABLE drift net
                ("inplace", [py, "gpu/tests/inplace_discipline_test.py"], 1),  # #51/S3.1: static — no self-rebinds, no stale captures
                ("fort", [py, "gpu/tests/fort_test.py"], 4),  # #78/B-27 Fort +4 defence — gate reachability is ZERO, so this lane is the only proof  # #78 Water Mill: farm-improved bonus resources +1 food (gate coverage is thin)
                ("ladder", [py, "gpu/tests/ladder_test.py"], 4),  # #51/S8.3: the ladder leaves the parity gate — this is its only guard
            ],
            [
                # P3→P5: sharded rollout (4 procs × OMP 4 — measured best on
                # this 24-CPU box; 6 shards THRASH: gpu 282s, parity starved);
                # replay runs AS THE SHARD LANDS (--pipeline-replay), hiding
                # the ~35s serial replay tail. Merge + gate semantics identical.
                ("gpu-gate", [py, "gpu/rollout.py", "--shards", "4", "--pipeline-replay"], 4),
            ]
            + (
                [
                    ("eval-random", [py, "gpu/eval/eval.py", "--policy", "random", "--episodes", "50"], 8),
                    ("eval-scripted", [py, "gpu/eval/eval.py", "--policy", "scripted", "--episodes", "50"], 8),
                ]
                if EVAL
                else []
            ),
        ]
        # BAIL-FAST ORDERING (#78). The poke group is ONE lane on purpose: at
        # ~348s serial it is nowhere near the critical path (parity ~650s,
        # gpu-gate ~594s, eval ~1650s), so splitting it could not shorten the
        # wall — it would only steal cores from the lanes that set it.
        # But bail-fast made TIME-TO-FIRST-FAILURE matter, and list order alone
        # decides that: the #78 red sat behind ~177s of slower pokes before
        # `government` (3.3s) reported. Running the cheap ones first surfaces
        # most reds in seconds at zero CPU cost. Times are measured medians;
        # unknown/new lanes default mid-pack so they are neither starved nor
        # promoted. Pokes are independent processes over read-only fixtures,
        # so order carries no semantics.
        for L in lanes:
            if len(L) > 5:  # only the cpu self-test group is this long
                L.sort(key=lambda s: POKE_COST.get(s[0], 30.0))

        # The poke group runs through the bounded pool; every other lane is
        # serial as before (they are 1-3 steps and sit on the critical path).
        threads = [
            threading.Thread(target=lane_parallel, args=(l, POKE_WORKERS, POKE_OMP))
            if len(l) > 5
            else threading.Thread(target=lane, args=(l,))
            for l in lanes
        ]
        for th in threads:
            th.start()
        for th in threads:
            th.join()

    wall = time.time() - t0
    print(f"\n{'step':<14} {'time':>7}  status")
    for name, dt, rc in results:
        print(f"{name:<14} {dt:6.1f}s  {'ok' if rc == 0 else 'SKIP' if rc == -1 else 'BAIL' if rc == -3 else 'FAIL'}")
    serial = sum(dt for _, dt, _ in results)
    print(f"\nwall {wall:.0f}s (serial-equivalent {serial:.0f}s, {serial / max(wall, 1):.1f}x)")
    if failed.is_set():
        print("BATTERY FAILED")
        return 1
    print("BATTERY OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
