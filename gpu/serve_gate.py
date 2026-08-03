"""#95 S1(c) FIRST LIGHT — the decision-server orchestrator.

BOTH engines are policy CLIENTS. Per turn: the TS child (export-gpu.ts in
CIV6_SERVE mode — its scripted player, the wire replacing the driven file)
emits its observation per rival seat; the GPU renders its own via
env.observe(seat); THIS process asserts the two observations agree (a
mismatch BAILS and names the field — the divergence lands at its causal
turn, no statelog hunt), asks the ladder for the decision, sends it to the
TS child (record schema, the rivalActions[turn-1] key), applies it GPU-side
(drive's stash machinery), steps both, and compares trace rows.

First light: ONE seed, B=1, decisions GPU-sourced (correct by construction
once the obs are proven equal — the TS per-unit obs twins land next, after
which decisions come from the SHARED obs alone).

    python gpu/serve_gate.py --seed 9002 --turns 60
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from civ6gpu import load_rules, load_fixture, FIXTURES  # noqa: E402
from civ6gpu.env import BatchEnv  # noqa: E402
import drive  # noqa: E402
import ladder  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent


def _field_name(i: int, S: int, R: int, C: int, NT: int, NC: int) -> str:
    """Index -> block.field, from the ladder layout (the ONE derivation)."""
    if i < ladder.EMP:
        return f"empire.{ladder.EMP_FIELDS[i]}"
    i -= ladder.EMP
    if i < ladder.PER_CS * S:
        return f"cs[{i // ladder.PER_CS}].{i % ladder.PER_CS}"
    i -= ladder.PER_CS * S
    if i < ladder.PER_RIVAL * R:
        return f"rival[{i // ladder.PER_RIVAL}].{i % ladder.PER_RIVAL}"
    i -= ladder.PER_RIVAL * R
    if i < ladder.PER_CITY * C:
        return f"city[{i // ladder.PER_CITY}].{i % ladder.PER_CITY}"
    i -= ladder.PER_CITY * C
    if i < ladder.ESCALATORS:
        return f"escalators.{i}"
    i -= ladder.ESCALATORS
    if i < NT:
        return f"costTech.{i}"
    i -= NT
    if i < NC:
        return f"costCivic.{i}"
    i -= NC
    return f"ctx.{ladder.CTX_FIELDS[i]}"


def run_batched(turns: int, eps: float) -> None:
    """#95 (iii): the battery-lane shape — ONE B=12 GPU sim, twelve TS
    children in PARALLEL, a per-turn barrier. Children run concurrently
    between barriers (independent processes); the GPU pays batched
    dispatch once per step instead of twelve B=1 taxes (#94's lesson).
    The sequential per-seed mode stays as the single-seed debug tool."""
    rules = load_rules()
    paths = sorted(FIXTURES.glob("seed*.json"))
    fixtures = [load_fixture(p) for p in paths]
    seeds = [int(fx["seed"]) for fx in fixtures]
    env = BatchEnv(fixtures, rules, device="cpu", dtype=torch.float64)
    sim = env.sim
    seats = list(range(sim.R))
    NB = sim.rules_dev.b_cost.shape[0]
    classes = ladder.prod_classes(NB, sim.NU, len(sim._scaffold), sim._wond_n if sim.districts_on else 0, len(sim._proj_rows) if sim.districts_on else 0)
    rj = json.loads((FIXTURES / "rules.json").read_text(encoding="utf-8"))
    roster = ladder.unit_roster(rj["units"])
    for r in seats:
        drive.take_seat(sim, r)
    NT, NC = sim.r_techs.shape[2], sim.r_civics.shape[2]
    ctx_lo = env.observe(1).shape[1] - ladder.CTX_SEAT

    children = []
    for sd in seeds:
        child_env = dict(os.environ)
        child_env.update({
            "CIV6_SERVE": "1", "CIV6_SERVE_SEED": str(sd),
            "CIV6_SERVE_HORIZON": str(env.horizon), "PYTHONIOENCODING": "utf-8",
        })
        children.append(subprocess.Popen(
            ["npx", "vite-node", "scripts/export-gpu.ts", "--", "24", str(turns), "5", str(sim.R), "gpu/fixtures"],
            cwd=ROOT, env=child_env, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL, text=True, encoding="utf-8", shell=True,
        ))

    def read_msg(ch) -> dict:
        while True:
            line = ch.stdout.readline()
            if not line:
                raise RuntimeError("a TS child closed its stdout (crashed?)")
            if line.startswith("@@"):
                return json.loads(line[2:])

    bad = 0
    first: str | None = None

    def flag(rep: str) -> None:
        nonlocal bad, first
        print(rep)
        if first is None:
            first = rep
        bad += 1

    try:
        for t in range(turns):
            msgs = [read_msg(ch) for ch in children]  # barrier
            for r in seats:
                gobs_all = env.observe(r + 1)
                gj_all = drive._builder_jobs(sim, r).tolist()
                gs_all = drive._spread_targets(sim, r).tolist()
                for b, msg in enumerate(msgs):
                    tobs = torch.tensor(msg["obs"][str(r)], dtype=torch.float64)
                    gobs = gobs_all[b]
                    diff = (gobs - tobs).abs()
                    badm = torch.zeros_like(diff, dtype=torch.bool)
                    badm[:ctx_lo] = diff[:ctx_lo] > eps
                    badm[ctx_lo:] = diff[ctx_lo:] != 0
                    if bool(badm.any()):
                        i = int(badm.nonzero(as_tuple=True)[0][0])
                        flag(f"seed {seeds[b]} turn {t + 1} r{r}: OBS [{i}] {_field_name(i, sim.S, sim.R, sim.C, NT, NC)}: GPU {float(gobs[i])!r} vs TS {float(tobs[i])!r}")
                    for name, ga, ta in (("job", gj_all[b], msg.get("jobs", {}).get(str(r), [])),
                                         ("spread", gs_all[b], msg.get("spreads", {}).get(str(r), []))):
                        for i in range(max(len(ga), len(ta))):
                            gv = ga[i] if i < len(ga) else -1
                            tv = ta[i] if i < len(ta) else -1
                            if gv != tv:
                                flag(f"seed {seeds[b]} turn {t + 1} r{r}: {name.upper()} row {i}: GPU {gv} vs TS {tv}")
                                break
            if bad:
                break
            per_seat = {r: drive._decide_turn(env, sim, r, roster, classes, seeds=seeds, turn=t) for r in seats}
            for b, ch in enumerate(children):
                recs = {str(r): drive._extract_record(sim, r, *per_seat[r], b) for r in seats}
                ch.stdin.write(json.dumps({"recs": recs}) + "\n")
                ch.stdin.flush()
            sim.step()
            trs = [read_msg(ch) for ch in children]
            grows = sim.trace_row().tolist()
            for b, tr in enumerate(trs):
                trow = tr["trace"]
                for i in range(min(len(grows[b]), len(trow))):
                    if abs(float(grows[b][i]) - float(trow[i])) > 1.0:
                        flag(f"seed {seeds[b]} turn {t + 1}: TRACE col {i}: GPU {grows[b][i]} vs TS {trow[i]}")
                        break
            if bad:
                break
    finally:
        for ch in children:
            try:
                ch.stdin.close()
            except OSError:
                pass
            ch.kill()
    if bad:
        print(f"SERVE GATE (BATCHED) RED — first: {first}")
        sys.exit(1)
    print(f"SERVE GATE (BATCHED) OK — {len(seeds)} games x {turns} turns in one batch: obs + unit targets equal everywhere, traces within milli")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=9002)
    ap.add_argument("--seeds", default=None, help="'all' = every gpu/fixtures/seed*.json, or comma-separated; overrides --seed")
    ap.add_argument("--batched", action="store_true", help="the battery-lane shape: ONE B=12 sim, all TS children in parallel")
    ap.add_argument("--turns", type=int, default=60)
    ap.add_argument("--eps", type=float, default=1e-9, help="scaled-float obs tolerance; the raw ctx block is compared EXACTLY")
    args = ap.parse_args()

    if args.batched:
        run_batched(args.turns, args.eps)
        return

    if args.seeds:
        if args.seeds == "all":
            seeds = sorted(int(p.stem[4:]) for p in FIXTURES.glob("seed*.json"))
        else:
            seeds = [int(x) for x in args.seeds.split(",")]
        bad = 0
        for sd in seeds:
            rc = subprocess.call(
                [sys.executable, __file__, "--seed", str(sd), "--turns", str(args.turns), "--eps", str(args.eps)],
                cwd=ROOT,
            )
            bad += 1 if rc else 0
        print(f"SERVE SWEEP {'OK' if bad == 0 else f'RED ({bad}/{len(seeds)} seeds)'} — {len(seeds)} seeds x {args.turns} turns")
        sys.exit(1 if bad else 0)

    rules = load_rules()
    fx = load_fixture(FIXTURES / f"seed{args.seed}.json")
    env = BatchEnv([fx], rules, device="cpu", dtype=torch.float64)
    sim = env.sim
    seats = list(range(sim.R))
    NB = sim.rules_dev.b_cost.shape[0]
    classes = ladder.prod_classes(NB, sim.NU, len(sim._scaffold), sim._wond_n if sim.districts_on else 0, len(sim._proj_rows) if sim.districts_on else 0)
    rj = json.loads((FIXTURES / "rules.json").read_text(encoding="utf-8"))
    roster = ladder.unit_roster(rj["units"])
    for r in seats:
        drive.take_seat(sim, r)
    NT, NC = sim.r_techs.shape[2], sim.r_civics.shape[2]
    ctx_lo = env.observe(1).shape[1] - ladder.CTX_SEAT

    child_env = dict(os.environ)
    child_env.update({
        "CIV6_SERVE": "1",
        "CIV6_SERVE_SEED": str(args.seed),
        "CIV6_SERVE_HORIZON": str(env.horizon),
        "PYTHONIOENCODING": "utf-8",
    })
    child = subprocess.Popen(
        ["npx", "vite-node", "scripts/export-gpu.ts", "--", "24", str(args.turns), "5", str(sim.R), "gpu/fixtures"],
        cwd=ROOT, env=child_env, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL, text=True, encoding="utf-8", shell=True,
    )

    def read_msg() -> dict:
        while True:
            line = child.stdout.readline()
            if not line:
                raise RuntimeError("TS child closed its stdout (crashed?)")
            if line.startswith("@@"):
                return json.loads(line[2:])

    obs_bails = 0
    trace_bad = 0
    first_report: str | None = None
    for t in range(args.turns):
        msg = read_msg()
        assert msg.get("t") == t + 1, f"turn frame skew: TS says {msg.get('t')}, orchestrator at {t + 1}"
        for r in seats:
            gobs = env.observe(r + 1)[0]
            tobs = torch.tensor(msg["obs"][str(r)], dtype=torch.float64)
            if gobs.shape[0] != tobs.shape[0]:
                print(f"turn {t + 1} seat r{r}: WIDTH {int(tobs.shape[0])} (TS) vs {int(gobs.shape[0])} (GPU)")
                child.kill()
                sys.exit(1)
            diff = (gobs - tobs).abs()
            # the raw ctx block is exact; the scaled blocks get eps
            bad = torch.zeros_like(diff, dtype=torch.bool)
            bad[:ctx_lo] = diff[:ctx_lo] > args.eps
            bad[ctx_lo:] = diff[ctx_lo:] != 0
            if bool(bad.any()):
                i = int(bad.nonzero(as_tuple=True)[0][0])
                name = _field_name(i, sim.S, sim.R, sim.C, NT, NC)
                rep = (f"turn {t + 1} seat r{r}: OBS MISMATCH at [{i}] {name}: "
                       f"GPU {float(gobs[i])!r} vs TS {float(tobs[i])!r}")
                print(rep)
                if first_report is None:
                    first_report = rep
                obs_bails += 1
        # #95 per-unit obs twins: the GPU extractors vs the TS arrays, per
        # slot-map row (TS rows = live units in mirrored order; GPU rows
        # beyond the live count must be -1).
        for r in seats:
            gj = drive._builder_jobs(sim, r)[0].tolist()
            gs = drive._spread_targets(sim, r)[0].tolist()
            tj = msg.get("jobs", {}).get(str(r), [])
            ts_ = msg.get("spreads", {}).get(str(r), [])
            for name, ga, ta in (("job", gj, tj), ("spread", gs, ts_)):
                for i in range(max(len(ga), len(ta))):
                    gv = ga[i] if i < len(ga) else -1
                    tv = ta[i] if i < len(ta) else -1
                    if gv != tv:
                        rep = f"turn {t + 1} seat r{r}: {name.upper()} TARGET row {i}: GPU {gv} vs TS {tv}"
                        print(rep)
                        if first_report is None:
                            first_report = rep
                        obs_bails += 1
                        break
        if obs_bails:
            break
        per_seat = {r: drive._decide_turn(env, sim, r, roster, classes, seeds=[args.seed], turn=t) for r in seats}
        recs = {str(r): drive._extract_record(sim, r, *per_seat[r], 0) for r in seats}
        child.stdin.write(json.dumps({"recs": recs}) + "\n")
        child.stdin.flush()
        sim.step()
        tr = read_msg()
        grow = sim.trace_row()[0].tolist()
        trow = tr["trace"]
        n = min(len(grow), len(trow))
        for i in range(n):
            if abs(float(grow[i]) - float(trow[i])) > 1.0:  # milli units
                rep = f"turn {t + 1}: TRACE col {i}: GPU {grow[i]} vs TS {trow[i]}"
                print(rep)
                if first_report is None:
                    first_report = rep
                trace_bad += 1
                break
        if obs_bails or trace_bad:
            break

    child.stdin.close()
    child.kill()
    if obs_bails or trace_bad:
        print(f"SERVE GATE RED — first: {first_report}")
        sys.exit(1)
    print(f"SERVE GATE OK — seed {args.seed}, {args.turns} turns: obs equal on every (turn, seat), traces within milli")


if __name__ == "__main__":
    main()
