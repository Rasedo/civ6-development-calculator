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
            for seat in [0] + [r + 1 for r in seats]:
                r = seat - 1
                gobs_all = env.observe(seat)
                gj_all = drive._builder_jobs(sim, seat).tolist()
                gs_all = drive._spread_targets(sim, seat).tolist()
                if seat == 0:
                    # seat-0 rows are RAW p-pool slots; TS emits per LIVE unit
                    # in array order — compact by p_alive (append-only pool,
                    # dead slots never reused, so alive-ascending IS array
                    # order; the rivals get this via rival_slot_map instead).
                    _pa0 = sim.p_alive.tolist()
                    gj_all = [[jv for jv, av in zip(row, arow) if av] for row, arow in zip(gj_all, _pa0)]
                    gs_all = [[sv for sv, av in zip(row, arow) if av] for row, arow in zip(gs_all, _pa0)]
                gb_all = None
                if seat >= 1:
                    # A-5r piece 4: the BUY-candidate tripwire — _buy_ctx vs
                    # the TS pre-turn twin, [centre, bIdx, settlerOk, unitOk].
                    _bc = drive._buy_ctx(sim, seat - 1)
                    gb_all = [
                        [int(sim.rc_center[b2, seat - 1, int(_bc["jj"][b2])]) if bool(_bc["can_building"][b2]) else -1,
                         int(_bc["bb"][b2]) if bool(_bc["can_building"][b2]) else -1,
                         int(bool(_bc["settler_ok"][b2])), int(bool(_bc["unit_ok"][b2]))]
                        for b2 in range(sim.B)
                    ]
                for b, msg in enumerate(msgs):
                    tobs = torch.tensor(msg["obs"][str(seat)], dtype=torch.float64)
                    gobs = gobs_all[b]
                    diff = (gobs - tobs).abs()
                    badm = torch.zeros_like(diff, dtype=torch.bool)
                    badm[:ctx_lo] = diff[:ctx_lo] > eps
                    badm[ctx_lo:] = diff[ctx_lo:] != 0
                    if bool(badm.any()):
                        i = int(badm.nonzero(as_tuple=True)[0][0])
                        flag(f"seed {seeds[b]} turn {t + 1} seat {seat}: OBS [{i}] {_field_name(i, sim.S, sim.R, sim.C, NT, NC)}: GPU {float(gobs[i])!r} vs TS {float(tobs[i])!r}")
                    for name, ga, ta in (("job", gj_all[b], msg.get("jobs", {}).get(str(seat), [])),
                                         ("spread", gs_all[b], msg.get("spreads", {}).get(str(seat), []))):
                        for i in range(max(len(ga), len(ta))):
                            gv = ga[i] if i < len(ga) else -1
                            tv = ta[i] if i < len(ta) else -1
                            if gv != tv:
                                flag(f"seed {seeds[b]} turn {t + 1} seat {seat}: {name.upper()} row {i}: GPU {gv} vs TS {tv}")
                                break
                    if gb_all is not None:
                        tb = msg.get("buys", {}).get(str(seat), [])
                        if tb and gb_all[b] != tb:
                            flag(f"seed {seeds[b]} turn {t + 1} seat {seat}: BUY [centre,bIdx,settler,unit]: GPU {gb_all[b]} vs TS {tb}")
            if bad:
                break
            # SEAT 0: the same seat verbs — v1 base classes (see the
            # single-seed path's twin block).
            m0 = env.masks(0)
            blocks0 = ladder.split(env.observe(0), sim.S, sim.R, sim.C, NT, NC)
            pm0 = m0["production"].clone()
            _base_w0 = NB + 2 + sim.NU + len(sim._scaffold)
            pm0[:, :, _base_w0:] = False
            prod0 = ladder.pick_production(pm0, classes, roster, drive._prod_ctx(blocks0, sim, 0))
            # ALWAYS tensors, -1 where no pick: None means "not driven" to the
            # step and the GPU auto-research fires (the drift the s0 probe named
            # at 9002 t7 — TS tech null + unbounded accrual while the GPU
            # auto-picked). The rollout's ta contract, exactly.
            _neg0 = torch.full((sim.B,), -1, dtype=torch.long)
            tech0 = ladder.pick_research(blocks0, m0["tech"], "tech") if bool(m0["tech"].any()) else _neg0
            civic0 = ladder.pick_research(blocks0, m0["civic"], "civic") if bool(m0["civic"].any()) else _neg0
            # #51 the UNIT verb, seat 0: the same rank-0 policy text as every
            # seat (_seat_unit_orders), single-rank like the scripted walker's
            # own gait; rows are RAW p-pool slots, exactly step()'s indexing.
            # The rec carries the ROLLOUT's triple text ([tile, col, civ],
            # pre-step tiles, HOLD dropped); "units" is ALWAYS present so the
            # TS walker's stand-down keys on the KEY, mirroring units= below.
            u0, _uj0, _us0, _um0, _uo0 = drive._seat_unit_orders(sim, 0)
            _u0_l = u0.tolist()
            _pt_l = sim.p_tile.tolist()
            _pc_l = sim._p_civ[sim.p_type].tolist()
            _pa_l = sim.p_alive.tolist()
            # #51 the ENVOY verb, seat 0: the same greedy sequence as every
            # seat (bank-only — the player converts no influence). ALWAYS a
            # tensor: the envoy= key stands the GPU's scripted greedy down,
            # the rec-0 "envoys" key stands the TS while-loop down.
            env0 = drive._seat_envoys(sim, 0)
            env0_t = env0 if env0 is not None else _neg0.unsqueeze(1)
            _e0_l = env0_t.tolist()
            per_seat = {r: drive._decide_turn(env, sim, r, roster, classes, seeds=seeds, turn=t) for r in seats}
            for b, ch in enumerate(children):
                recs = {str(r + 1): drive._extract_record(sim, r, *per_seat[r], b) for r in seats}
                recs["0"] = {
                    "production": [[int(sim.site[b, c]), int(prod0[b, c])] for c in range(sim.C)
                                   if int(prod0[b, c]) >= 0 and bool(sim.alive[b, c])],
                    "tech": None if int(tech0[b]) < 0 else int(tech0[b]),
                    "civic": None if int(civic0[b]) < 0 else int(civic0[b]),
                    "units": [[_pt_l[b][p], v, int(_pc_l[b][p])]
                              for p, v in enumerate(_u0_l[b])
                              if _pa_l[b][p] and v >= 0 and v != 12],
                    "envoys": [x for x in _e0_l[b] if x >= 0],
                }
                ch.stdin.write(json.dumps({"recs": recs}) + "\n")
                ch.stdin.flush()
            sim.step(production=prod0, tech=tech0, civic=civic0, units=u0, envoy=env0_t)
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
    _slog = None
    if os.environ.get("CIV6_SERVE_STATELOG"):
        from tools.statelog import gpu_state_lines  # noqa: E402
        _slog = open(str(FIXTURES / "gpu_statelog.txt"), "w", encoding="utf-8")
    for t in range(args.turns):
        msg = read_msg()
        assert msg.get("t") == t + 1, f"turn frame skew: TS says {msg.get('t')}, orchestrator at {t + 1}"
        for seat in [0] + [r + 1 for r in seats]:
            gobs = env.observe(seat)[0]
            tobs = torch.tensor(msg["obs"][str(seat)], dtype=torch.float64)
            if gobs.shape[0] != tobs.shape[0]:
                print(f"turn {t + 1} seat {seat}: WIDTH {int(tobs.shape[0])} (TS) vs {int(gobs.shape[0])} (GPU)")
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
                rep = (f"turn {t + 1} seat {seat}: OBS MISMATCH at [{i}] {name}: "
                       f"GPU {float(gobs[i])!r} vs TS {float(tobs[i])!r}")
                print(rep)
                if first_report is None:
                    first_report = rep
                obs_bails += 1
        # #95 per-unit obs twins: the GPU extractors vs the TS arrays, per
        # slot-map row (TS rows = live units in mirrored order; GPU rows
        # beyond the live count must be -1). Seat 0's raw p-pool rows are
        # compacted by p_alive — the batched path's own convention.
        for seat in [0] + [r + 1 for r in seats]:
            gj = drive._builder_jobs(sim, seat)[0].tolist()
            gs = drive._spread_targets(sim, seat)[0].tolist()
            if seat == 0:
                _pa0 = sim.p_alive[0].tolist()
                gj = [jv for jv, av in zip(gj, _pa0) if av]
                gs = [sv for sv, av in zip(gs, _pa0) if av]
            tj = msg.get("jobs", {}).get(str(seat), [])
            ts_ = msg.get("spreads", {}).get(str(seat), [])
            if seat >= 1:
                _bc = drive._buy_ctx(sim, seat - 1)
                gb = [int(sim.rc_center[0, seat - 1, int(_bc["jj"][0])]) if bool(_bc["can_building"][0]) else -1,
                      int(_bc["bb"][0]) if bool(_bc["can_building"][0]) else -1,
                      int(bool(_bc["settler_ok"][0])), int(bool(_bc["unit_ok"][0]))]
                tb = msg.get("buys", {}).get(str(seat), [])
                if tb and gb != tb:
                    rep = f"turn {t + 1} seat {seat}: BUY [centre,bIdx,settler,unit]: GPU {gb} vs TS {tb}"
                    print(rep)
                    if first_report is None:
                        first_report = rep
                    obs_bails += 1
            for name, ga, ta in (("job", gj, tj), ("spread", gs, ts_)):
                for i in range(max(len(ga), len(ta))):
                    gv = ga[i] if i < len(ga) else -1
                    tv = ta[i] if i < len(ta) else -1
                    if gv != tv:
                        rep = f"turn {t + 1} seat {seat}: {name.upper()} TARGET row {i}: GPU {gv} vs TS {tv}"
                        if os.environ.get("CIV6_SERVE_DEBUG_JOB0") and name == "job":
                            for _dt in (gv, tv):
                                if _dt < 0:
                                    continue
                                print(f"  tile {_dt}: owner {int(sim.owner[0, _dt])} tile_seat {int(sim.tile_seat[0, _dt])}"
                                      f" water {bool(sim.water[0, _dt])} imp {int(sim.improvement[0, _dt])}"
                                      f" dist {int(sim.district[0, _dt])} wond {int(sim.built_wonder[0, _dt])}"
                                      f" rvc {int(sim.rvcity_at[0, _dt])} pill {bool(sim.pillaged[0, _dt])}"
                                      f" dpill {bool(sim.district_pillaged[0, _dt])} farm {bool(sim.farm_flat[0, _dt])}"
                                      f" mine {bool(sim.mine_ok[0, _dt])} lumber {bool(sim.lumber_ok[0, _dt])}"
                                      f" res {int(sim.res_imp[0, _dt])}")
                            for _p in range(int(sim.p_next[0])):
                                if not bool(sim.p_alive[0, _p]):
                                    continue
                                print(f"  p[{_p}] tile {int(sim.p_tile[0, _p])} type {int(sim.p_type[0, _p])}"
                                      f" charges {int(sim.p_charges[0, _p])}")
                        print(rep)
                        if first_report is None:
                            first_report = rep
                        obs_bails += 1
                        break
        if obs_bails:
            break
        # SEAT 0: THE SAME SEAT VERBS (owner: there are no rival verbs).
        # v1 = base production classes (the scripted player's own
        # expressiveness); wonder/project/purchase arms port with the TS
        # replay dispatch. Envoys stay scripted BOTH SIDES.
        m0 = env.masks(0)
        blocks0 = ladder.split(env.observe(0), sim.S, sim.R, sim.C, NT, NC)
        pm0 = m0["production"].clone()
        _base_w0 = NB + 2 + sim.NU + len(sim._scaffold)
        pm0[:, :, _base_w0:] = False
        prod0 = ladder.pick_production(pm0, classes, roster, drive._prod_ctx(blocks0, sim, 0))
        # ALWAYS tensors, -1 where no pick: None means "not driven" to the
        # step and the GPU auto-research fires (the drift the s0 probe named
        # at 9002 t7 — TS tech null + unbounded accrual while the GPU
        # auto-picked). The rollout's ta contract, exactly.
        _neg0 = torch.full((sim.B,), -1, dtype=torch.long)
        tech0 = ladder.pick_research(blocks0, m0["tech"], "tech") if bool(m0["tech"].any()) else _neg0
        civic0 = ladder.pick_research(blocks0, m0["civic"], "civic") if bool(m0["civic"].any()) else _neg0
        # #51 the UNIT verb, seat 0 — the batched path's twin block.
        u0, _uj0, _us0, _um0, _uo0 = drive._seat_unit_orders(sim, 0)
        _u0_l = u0[0].tolist()
        _pt_l = sim.p_tile[0].tolist()
        _pc_l = sim._p_civ[sim.p_type][0].tolist()
        _pa_l = sim.p_alive[0].tolist()
        env0 = drive._seat_envoys(sim, 0)
        env0_t = env0 if env0 is not None else _neg0.unsqueeze(1)
        per_seat = {r: drive._decide_turn(env, sim, r, roster, classes, seeds=[args.seed], turn=t) for r in seats}
        recs = {str(r + 1): drive._extract_record(sim, r, *per_seat[r], 0) for r in seats}
        recs["0"] = {
            "production": [[int(sim.site[0, c]), int(prod0[0, c])] for c in range(sim.C)
                           if int(prod0[0, c]) >= 0 and bool(sim.alive[0, c])],
            "tech": None if int(tech0[0]) < 0 else int(tech0[0]),
            "civic": None if int(civic0[0]) < 0 else int(civic0[0]),
            "units": [[_pt_l[p], v, int(_pc_l[p])]
                      for p, v in enumerate(_u0_l)
                      if _pa_l[p] and v >= 0 and v != 12],
            "envoys": [x for x in env0_t[0].tolist() if x >= 0],
        }
        if os.environ.get("CIV6_SERVE_DEBUG_BUY") and any("buy" in v for v in recs.values()):
            print(f"BUYREC turn {t + 1}: " + json.dumps({k: v["buy"] for k, v in recs.items() if "buy" in v}))
        child.stdin.write(json.dumps({"recs": recs}) + "\n")
        child.stdin.flush()
        sim.step(production=prod0, tech=tech0, civic=civic0, units=u0, envoy=env0_t)
        if _slog is not None:
            from tools.statelog import gpu_state_lines  # noqa: E402
            _slog.write(chr(10).join(gpu_state_lines(sim, 0)) + chr(10))
            _slog.flush()
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
                if not os.environ.get("CIV6_SERVE_ALL_COLS"):
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
