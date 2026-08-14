"""The decision-server orchestrator — the cross-engine gate.

BOTH engines are policy CLIENTS. Per turn: each TS child
(`cpu/driver/serve.ts`, which loads its seed's WORLD FILE and plays nothing on
its own) emits its observation per seat; the GPU renders its own via
`env.observe(seat)`; THIS process asserts the two agree — a mismatch BAILS and
names the field, so a divergence lands at its causal turn — asks the ladder
for the decision, sends it to the child as a per-seat record, applies it
GPU-side, steps both engines, and compares their state digests.

    python gpu/serve_gate.py --batched --turns 250   # the battery lane: one
                                                     # B=12 sim against all
                                                     # TS children in parallel
    python gpu/serve_gate.py --seed 9002 --turns 60  # the single-seed debug mode

--ckpt-every/--resume checkpoint both engines, so a probe at turn T costs O(1)
turns instead of a replay of both engines from t0.
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
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "policy"))  # drive + ladder
from core import load_rules, load_fixture, FIXTURES  # noqa: E402
from core import statecompare  # noqa: E402
from core.env import BatchEnv  # noqa: E402
import drive  # noqa: E402
import ladder  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent


def _q_eq(a, b, scale: int) -> bool:
    """Quantised equality, elementwise over nested lists — the same
    quantisation the digests fold, so a dump diff and a digest mismatch always
    agree about whether two values differ."""
    if isinstance(a, list) or isinstance(b, list):
        if not (isinstance(a, list) and isinstance(b, list)) or len(a) != len(b):
            return False
        return all(_q_eq(x, y, scale) for x, y in zip(a, b))
    return statecompare._quantise(a, scale) == statecompare._quantise(b, scale)


def digest_diff(man: dict, gdig: dict, tdig: dict | None) -> tuple[list[str], list[str]]:
    """Compare the two engines' per-group digests. Returns (bad group names,
    report lines). Row-count disagreement is reported as itself: a missing row
    and a drifted field are different findings."""
    bad: list[str] = []
    reps: list[str] = []
    for g in man["groups"]:
        name = g["name"]
        gv = gdig[name]
        tv = (tdig or {}).get(name)
        if tv is None:
            bad.append(name)
            reps.append(f"DIGEST group {name}: TS sent no digest")
            continue
        lines = []
        if gv["rows"] != tv["rows"]:
            lines.append(f"DIGEST group {name}: ROWS {gv['rows']} (GPU) vs {tv['rows']} (TS)")
        for kind in ("exact", "milli"):
            if gv[kind] != tv[kind]:
                lines.append(f"DIGEST group {name}.{kind}: GPU {gv[kind]} vs TS {tv[kind]}")
        if lines:
            bad.append(name)
            reps += lines
    return bad, reps


def dump_diff(man: dict, group: str, gdump: dict, tdump: dict, cap: int = 12) -> list[str]:
    """The by-name diff of one group's keyed dumps — the report names the
    field, never a row offset."""
    g = next(x for x in man["groups"] if x["name"] == group)
    scale = {f["name"]: (1000 if f["compare"] == "milli" else 1) for f in g["fields"]}
    td = {int(k): v for k, v in tdump.items()}
    reps: list[str] = []
    for k in sorted(set(gdump) - set(td)):
        reps.append(f"  {group}[{k}]: GPU-ONLY row {json.dumps(gdump[k])}")
    for k in sorted(set(td) - set(gdump)):
        reps.append(f"  {group}[{k}]: TS-ONLY row {json.dumps(td[k])}")
    for k in sorted(set(gdump) & set(td)):
        for fname, gval in gdump[k].items():
            tval = td[k].get(fname)
            if not _q_eq(gval, tval, scale.get(fname, 1)):
                reps.append(f"  {group}[{k}].{fname}: GPU {json.dumps(gval)} vs TS {json.dumps(tval)}")
    if len(reps) > cap:
        reps = reps[:cap] + [f"  ... and {len(reps) - cap} more differing rows/fields in group {group}"]
    return reps


def _buy_row(sim, seat: int, bc: dict, rk, rj, b: int) -> list:
    """One row of the BUY-candidate tripwire, in the TS driver twin's exact
    shape — shared by the batched and single-seed paths so the two cannot
    drift: [centre, bIdx, settlerOk, unitOk, tileOk, tile, tileCentre,
    worshipCentre, religKind, religCentre, levyIdx]."""
    def ctr(j: int) -> int:
        return int(sim.civ_city_center[b, seat - 1, j]) if j >= 0 else -1
    return [
        ctr(int(bc["jj"][b])) if bool(bc["can_building"][b]) else -1,
        int(bc["bb"][b]) if bool(bc["can_building"][b]) else -1,
        int(bool(bc["settler_ok"][b])), int(bool(bc["unit_ok"][b])),
        int(bool(bc["tile_ok"][b])),
        int(bc["tile"][b]) if bool(bc["tile_ok"][b]) else -1,
        ctr(int(bc["tile_j"][b])) if bool(bc["tile_ok"][b]) else -1,
        ctr(int(bc["worship_j"][b])) if bool(bc["worship_ok"][b]) else -1,
        int(rk[b]),
        ctr(int(rj[b])),
        int(bc["levy_cs"][b]) if bool(bc["levy_ok"][b]) else -1,
    ]


def _buy_rows(sim, seat: int) -> list:
    """The tripwire rows for every batch row of one seat (reads _buy_ctx +
    pick_faith once)."""
    bc = drive._buy_ctx(sim, seat - 1)
    _, rk = ladder.pick_faith(bc["worship_ok"], bc["missionary_ok"], bc["apostle_ok"])
    rj = torch.where(rk == 5, bc["missionary_j"],
                     torch.where(rk == 6, bc["apostle_j"], torch.full_like(rk, -1)))
    return [_buy_row(sim, seat, bc, rk, rj, b) for b in range(sim.B)]


def _field_name(i: int, S: int, R: int, C: int, NT: int, NC: int) -> str:
    """Index -> block.field, from the ladder layout (the ONE derivation)."""
    if i < ladder.EMP:
        return f"empire.{ladder.EMP_FIELDS[i]}"
    i -= ladder.EMP
    if i < ladder.PER_CS * S:
        return f"citystate[{i // ladder.PER_CS}].{i % ladder.PER_CS}"
    i -= ladder.PER_CS * S
    if i < ladder.PER_CIV * R:
        return f"civ[{i // ladder.PER_CIV}].{i % ladder.PER_CIV}"
    i -= ladder.PER_CIV * R
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


def run_batched(turns: int, eps: float, ckpt_every: int = 0,
                ckpt_dir: Path | None = None, resume: int = 0) -> None:
    """The battery-lane shape: ONE B=12 GPU sim, one TS child per seed in
    PARALLEL, a per-turn barrier. Children run concurrently between barriers
    (independent processes); the GPU pays batched dispatch once per step
    instead of one B=1 tax per seed. `main`'s sequential path is the
    single-seed debug mode.

    Checkpoint/resume: with --ckpt-every K, every K completed turns both
    engines dump — the GPU a torch.save of sim.snapshot() (the bit-exact
    mutable-tensor set), each TS child a JSON dump of its GameState (plain
    data; the child reloads it via CIV6_SERVE_LOAD). --resume T restores both
    sides from the turn-T checkpoint and continues."""
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
    # The extractor sets are checked against the manifest before a turn runs.
    sc_man = statecompare.load_manifest()
    statecompare.check_extractors(sc_man)
    dig_dumped = False
    for r in seats:
        drive.take_seat(sim, r)
    NT, NC = sim.civ_only_techs.shape[2], sim.civ_only_civics.shape[2]
    ctx_lo = env.observe(1).shape[1] - ladder.CTX_SEAT

    # Resume restores the GPU from its turn-T snapshot BEFORE the children
    # spawn; each child gets its own dumped GameState to reload.
    t0 = 0
    if ckpt_every or resume:
        assert ckpt_dir is not None
        ckpt_dir.mkdir(parents=True, exist_ok=True)
    if resume:
        assert ckpt_dir is not None
        assert resume < turns, f"--resume {resume} >= --turns {turns}: nothing left to run"
        ck = torch.load(ckpt_dir / f"b_t{resume}.pt", weights_only=False)
        assert ck["seeds"] == seeds, f"checkpoint seeds {ck['seeds']} != fixture seeds {seeds} — stale checkpoint"
        sim.restore(ck["snap"])
        t0 = int(ck["turn"])

    children = []
    for sd in seeds:
        child_env = dict(os.environ)
        child_env.update({
            "CIV6_SERVE": "1", "CIV6_SERVE_SEED": str(sd),
            "CIV6_SERVE_HORIZON": str(env.horizon), "PYTHONIOENCODING": "utf-8",
        })
        if resume:
            assert ckpt_dir is not None
            child_env["CIV6_SERVE_LOAD"] = str(ckpt_dir / f"b_seed{sd}_t{resume}.json")
        children.append(subprocess.Popen(
            ["npx", "vite-node", "cpu/driver/serve.ts", "--", str(turns), "seeder/worlds"],
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
        for t in range(t0, turns):
            msgs = [read_msg(ch) for ch in children]  # barrier
            for seat in [0] + [r + 1 for r in seats]:
                r = seat - 1
                gobs_all = env.observe(seat)
                gj_all = drive._builder_jobs(sim, seat).tolist()
                gs_all = drive._spread_targets(sim, seat).tolist()
                if seat == 0:
                    # seat-0 rows are RAW pool slots; TS emits per LIVE unit in
                    # array order — compact by seat0_unit_alive (append-only pool, dead
                    # slots never reused, so alive-ascending IS array order;
                    # civ seats get this via seat_slot_map instead).
                    _pa0 = sim.seat0_unit_alive.tolist()
                    gj_all = [[jv for jv, av in zip(row, arow) if av] for row, arow in zip(gj_all, _pa0)]
                    gs_all = [[sv for sv, av in zip(row, arow) if av] for row, arow in zip(gs_all, _pa0)]
                gb_all = None
                if seat >= 1:
                    # The BUY-candidate tripwire: _buy_ctx against the TS
                    # pre-turn twin, in the one row shape both paths share.
                    gb_all = _buy_rows(sim, seat)
                for b, msg in enumerate(msgs):
                    tobs = torch.tensor(msg["obs"][str(seat)], dtype=torch.float64)
                    gobs = gobs_all[b]
                    diff = (gobs - tobs).abs()
                    badm = torch.zeros_like(diff, dtype=torch.bool)
                    badm[:ctx_lo] = diff[:ctx_lo] > eps
                    badm[ctx_lo:] = diff[ctx_lo:] != 0
                    if bool(badm.any()):
                        i = int(badm.nonzero(as_tuple=True)[0][0])
                        flag(f"seed {seeds[b]} turn {t + 1} seat {seat}: OBS [{i}] {_field_name(i, sim.S, sim.R, sim.RC, NT, NC)}: GPU {float(gobs[i])!r} vs TS {float(tobs[i])!r}")
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
                            flag(f"seed {seeds[b]} turn {t + 1} seat {seat}: BUY [centre,bIdx,settler,unit,tileOk,tile,tileC,worshipC,religKind,religC,levy]: GPU {gb_all[b]} vs TS {tb}")
            if bad:
                break
            # SEAT 0 runs the same verbs as every seat; production is limited
            # to the base classes.
            m0 = env.masks(0)
            blocks0 = ladder.split(env.observe(0), sim.S, sim.R, sim.RC, NT, NC)
            pm0 = m0["production"].clone()
            _base_w0 = NB + 2 + sim.NU + len(sim._scaffold)
            pm0[:, :, _base_w0:] = False
            prod0 = ladder.pick_production(pm0, classes, roster, drive._prod_ctx(blocks0, sim, 0))
            # ALWAYS tensors, -1 where no pick: None would mean "not driven" to
            # the step, and the GPU's auto-research would fire while the TS
            # child accrued against a null.
            _neg0 = torch.full((sim.B,), -1, dtype=torch.long)
            tech0 = ladder.pick_research(blocks0, m0["tech"], "tech") if bool(m0["tech"].any()) else _neg0
            civic0 = ladder.pick_research(blocks0, m0["civic"], "civic") if bool(m0["civic"].any()) else _neg0
            # The UNIT verb, seat 0: the same _seat_unit_orders policy as every
            # seat; rows are RAW pool slots, exactly step()'s indexing. The
            # record carries [tile, col, civ] triples over PRE-step tiles with
            # HOLD dropped, and the "units" key is ALWAYS present — its mere
            # presence is what stands the TS walker down, mirroring units=.
            u0, _uj0, _us0, _um0, _uo0 = drive._seat_unit_orders(sim, 0)
            _u0_l = u0.tolist()
            _pt_l = sim.seat0_unit_tile.tolist()
            _pc_l = sim._type_civilian[sim.seat0_unit_type].tolist()
            _pa_l = sim.seat0_unit_alive.tolist()
            # The ENVOY verb, seat 0: the same greedy sequence as every seat
            # (bank-only — seat 0 converts no influence). ALWAYS a tensor: the
            # envoy= argument stands the GPU's scripted greedy down, and the
            # record's "envoys" key stands the TS loop down.
            env0 = drive._seat_envoys(sim, 0)
            env0_t = env0 if env0 is not None else _neg0.unsqueeze(1)
            _e0_l = env0_t.tolist()
            # The geopolitics decide ONCE per turn (the declare scan couples
            # the civ seats), stashed GPU-side and merged into every record.
            geo = drive.geo_decide_and_apply(sim)
            per_seat = {r: drive._decide_turn(env, sim, r, roster, classes, seeds=seeds, turn=t) for r in seats}
            for b, ch in enumerate(children):
                recs = {str(r + 1): {**drive._extract_record(sim, r, *per_seat[r], b),
                                     **drive._extract_geo(geo, r, b)} for r in seats}
                recs["0"] = {
                    "production": [[int(sim.site[b, c]), int(prod0[b, c])] for c in range(sim.RC)
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
            trs = [read_msg(ch) for ch in children]  # barrier: every child's post-step digest
            # THE DIGEST IS THE GATE. On the FIRST disagreement the mismatching
            # groups are dumped keyed from both engines and diffed BY NAME;
            # later ones get one line each, capped so a persistent drift cannot
            # flood the output.
            for b, ch in enumerate(children):
                if True:
                    gdig = statecompare.state_digest(sim, b, sc_man)
                    bad_groups, reps = digest_diff(sc_man, gdig, trs[b].get("digest"))
                    if bad_groups:
                        for rep in reps:
                            flag(f"seed {seeds[b]} turn {t + 1}: {rep}")
                        if not dig_dumped:
                            dig_dumped = True
                            ch.stdin.write(json.dumps({"dump": bad_groups}) + "\n")
                            ch.stdin.flush()
                            dmp = read_msg(ch)
                            for gname in bad_groups:
                                print(f"seed {seeds[b]} turn {t + 1}: KEYED DIFF group {gname}:")
                                for line in dump_diff(sc_man, gname,
                                                      statecompare.group_dump(sim, b, gname, sc_man),
                                                      dmp["dumps"][gname]):
                                    print(line)
                # The state has not moved since the digest, so a dump here IS
                # the state the digest hashed — that is the resume point.
                if ckpt_every and (t + 1) % ckpt_every == 0:
                    assert ckpt_dir is not None
                    ch.stdin.write(json.dumps({"ckpt": str(ckpt_dir / f"b_seed{seeds[b]}_t{t + 1}.json")}) + "\n")
                    ch.stdin.flush()
                    read_msg(ch)  # the write ack — the child holds the turn until acked
                ch.stdin.write(json.dumps({"go": 1}) + "\n")
                ch.stdin.flush()
            if ckpt_every and (t + 1) % ckpt_every == 0:
                assert ckpt_dir is not None
                torch.save({"seeds": seeds, "turn": t + 1, "snap": sim.snapshot()},
                           ckpt_dir / f"b_t{t + 1}.pt")
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
    print(f"SERVE GATE (BATCHED) OK — {len(seeds)} games x {turns} turns in one batch: "
          "obs + unit targets equal everywhere, state digests agree on every group")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=9002)
    ap.add_argument("--seeds", default=None, help="'all' = every seeder/worlds/seed*.json, or comma-separated; overrides --seed")
    ap.add_argument("--batched", action="store_true", help="the battery-lane shape: ONE B=12 sim, all TS children in parallel")
    ap.add_argument("--turns", type=int, default=60)
    ap.add_argument("--eps", type=float, default=1e-9, help="scaled-float obs tolerance; the raw ctx block is compared EXACTLY")
    # Checkpoint/resume: diagnosis starts from a checkpoint, never a full
    # two-engine replay.
    ap.add_argument("--ckpt-every", type=int, default=0, help="checkpoint both engines every K completed turns (0 = off)")
    ap.add_argument("--ckpt-dir", default=".claude/scratchpad/serve_ckpt", help="where checkpoints live (GPU .pt + per-seed TS .json)")
    ap.add_argument("--resume", type=int, default=0, help="resume from the checkpoint taken at this turn (a prior --ckpt-every run, same seeds)")
    args = ap.parse_args()
    ckpt_dir = Path(args.ckpt_dir)

    if args.batched:
        run_batched(args.turns, args.eps, args.ckpt_every, ckpt_dir, args.resume)
        return

    if args.seeds:
        if args.seeds == "all":
            seeds = sorted(int(p.stem[4:]) for p in FIXTURES.glob("seed*.json"))
        else:
            seeds = [int(x) for x in args.seeds.split(",")]
        bad = 0
        for sd in seeds:
            fwd = ["--ckpt-every", str(args.ckpt_every), "--ckpt-dir", str(ckpt_dir),
                   "--resume", str(args.resume)] if (args.ckpt_every or args.resume) else []
            rc = subprocess.call(
                [sys.executable, __file__, "--seed", str(sd), "--turns", str(args.turns), "--eps", str(args.eps)] + fwd,
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
    sc_man = statecompare.load_manifest()
    statecompare.check_extractors(sc_man)
    dig_dumped = False
    for r in seats:
        drive.take_seat(sim, r)
    NT, NC = sim.civ_only_techs.shape[2], sim.civ_only_civics.shape[2]
    ctx_lo = env.observe(1).shape[1] - ladder.CTX_SEAT

    # Resume — the batched path's twin (GPU snapshot + TS state dump).
    t0 = 0
    if args.ckpt_every or args.resume:
        ckpt_dir.mkdir(parents=True, exist_ok=True)
    if args.resume:
        assert args.resume < args.turns, f"--resume {args.resume} >= --turns {args.turns}: nothing left to run"
        ck = torch.load(ckpt_dir / f"s{args.seed}_t{args.resume}.pt", weights_only=False)
        sim.restore(ck["snap"])
        t0 = int(ck["turn"])

    child_env = dict(os.environ)
    child_env.update({
        "CIV6_SERVE": "1",
        "CIV6_SERVE_SEED": str(args.seed),
        "CIV6_SERVE_HORIZON": str(env.horizon),
        "PYTHONIOENCODING": "utf-8",
    })
    if args.resume:
        child_env["CIV6_SERVE_LOAD"] = str(ckpt_dir / f"s{args.seed}_t{args.resume}.json")
    child = subprocess.Popen(
        ["npx", "vite-node", "cpu/driver/serve.ts", "--", str(args.turns), "seeder/worlds"],
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
    for t in range(t0, args.turns):
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
                name = _field_name(i, sim.S, sim.R, sim.RC, NT, NC)
                rep = (f"turn {t + 1} seat {seat}: OBS MISMATCH at [{i}] {name}: "
                       f"GPU {float(gobs[i])!r} vs TS {float(tobs[i])!r}")
                print(rep)
                if first_report is None:
                    first_report = rep
                obs_bails += 1
        # Per-unit obs twins: the GPU extractors against the TS arrays, per
        # slot-map row (TS rows = live units in mirrored order; GPU rows beyond
        # the live count must be -1). Seat 0's raw pool rows are compacted by
        # seat0_unit_alive, as in the batched path.
        for seat in [0] + [r + 1 for r in seats]:
            gj = drive._builder_jobs(sim, seat)[0].tolist()
            gs = drive._spread_targets(sim, seat)[0].tolist()
            if seat == 0:
                _pa0 = sim.seat0_unit_alive[0].tolist()
                gj = [jv for jv, av in zip(gj, _pa0) if av]
                gs = [sv for sv, av in zip(gs, _pa0) if av]
            tj = msg.get("jobs", {}).get(str(seat), [])
            ts_ = msg.get("spreads", {}).get(str(seat), [])
            if seat >= 1:
                # The same 11-field row as the batched path.
                gb = _buy_rows(sim, seat)[0]
                tb = msg.get("buys", {}).get(str(seat), [])
                if tb and gb != tb:
                    rep = f"turn {t + 1} seat {seat}: BUY [centre,bIdx,settler,unit,tileOk,tile,tileC,worshipC,religKind,religC,levy]: GPU {gb} vs TS {tb}"
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
                                      f" vc {int(sim.civ_city_at[0, _dt])} pill {bool(sim.pillaged[0, _dt])}"
                                      f" dpill {bool(sim.district_pillaged[0, _dt])} farm {bool(sim.farm_flat[0, _dt])}"
                                      f" mine {bool(sim.mine_ok[0, _dt])} lumber {bool(sim.lumber_ok[0, _dt])}"
                                      f" res {int(sim.res_imp[0, _dt])}")
                            for _p in range(int(sim.seat0_unit_next[0])):
                                if not bool(sim.seat0_unit_alive[0, _p]):
                                    continue
                                print(f"  p[{_p}] tile {int(sim.seat0_unit_tile[0, _p])} type {int(sim.seat0_unit_type[0, _p])}"
                                      f" charges {int(sim.seat0_unit_charges[0, _p])}")
                        print(rep)
                        if first_report is None:
                            first_report = rep
                        obs_bails += 1
                        break
        if obs_bails:
            break
        # SEAT 0 runs the same verbs as every seat: production limited to the
        # base classes, envoys scripted on BOTH SIDES.
        m0 = env.masks(0)
        blocks0 = ladder.split(env.observe(0), sim.S, sim.R, sim.RC, NT, NC)
        pm0 = m0["production"].clone()
        _base_w0 = NB + 2 + sim.NU + len(sim._scaffold)
        pm0[:, :, _base_w0:] = False
        prod0 = ladder.pick_production(pm0, classes, roster, drive._prod_ctx(blocks0, sim, 0))
        # ALWAYS tensors, -1 where no pick: None would mean "not driven" to the
        # step, and the GPU's auto-research would fire while the TS child
        # accrued against a null.
        _neg0 = torch.full((sim.B,), -1, dtype=torch.long)
        tech0 = ladder.pick_research(blocks0, m0["tech"], "tech") if bool(m0["tech"].any()) else _neg0
        civic0 = ladder.pick_research(blocks0, m0["civic"], "civic") if bool(m0["civic"].any()) else _neg0
        # The UNIT verb, seat 0 — the batched path's twin block.
        u0, _uj0, _us0, _um0, _uo0 = drive._seat_unit_orders(sim, 0)
        _u0_l = u0[0].tolist()
        _pt_l = sim.seat0_unit_tile[0].tolist()
        _pc_l = sim._type_civilian[sim.seat0_unit_type][0].tolist()
        _pa_l = sim.seat0_unit_alive[0].tolist()
        env0 = drive._seat_envoys(sim, 0)
        env0_t = env0 if env0 is not None else _neg0.unsqueeze(1)
        # The geopolitics decide ONCE per turn — the batched path's twin.
        geo = drive.geo_decide_and_apply(sim)
        per_seat = {r: drive._decide_turn(env, sim, r, roster, classes, seeds=[args.seed], turn=t) for r in seats}
        recs = {str(r + 1): {**drive._extract_record(sim, r, *per_seat[r], 0),
                             **drive._extract_geo(geo, r, 0)} for r in seats}
        recs["0"] = {
            "production": [[int(sim.site[0, c]), int(prod0[0, c])] for c in range(sim.RC)
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
        tr = read_msg()
        # THE DIGEST IS THE GATE — the batched path's twin block.
        if True:
            gdig = statecompare.state_digest(sim, 0, sc_man)
            bad_groups, reps = digest_diff(sc_man, gdig, tr.get("digest"))
            if bad_groups:
                for rep in reps:
                    print(f"turn {t + 1}: {rep}")
                    if first_report is None:
                        first_report = f"turn {t + 1}: {rep}"
                    trace_bad += 1
                if not dig_dumped:
                    dig_dumped = True
                    child.stdin.write(json.dumps({"dump": bad_groups}) + "\n")
                    child.stdin.flush()
                    dmp = read_msg()
                    for gname in bad_groups:
                        print(f"turn {t + 1}: KEYED DIFF group {gname}:")
                        for line in dump_diff(sc_man, gname,
                                              statecompare.group_dump(sim, 0, gname, sc_man),
                                              dmp["dumps"][gname]):
                            print(line)
        # Checkpoint at the same post-digest point as the batched path.
        if args.ckpt_every and (t + 1) % args.ckpt_every == 0:
            child.stdin.write(json.dumps({"ckpt": str(ckpt_dir / f"s{args.seed}_t{t + 1}.json")}) + "\n")
            child.stdin.flush()
            read_msg()  # the write ack
            torch.save({"seed": args.seed, "turn": t + 1, "snap": sim.snapshot()},
                       ckpt_dir / f"s{args.seed}_t{t + 1}.pt")
        child.stdin.write(json.dumps({"go": 1}) + "\n")
        child.stdin.flush()
        if obs_bails or trace_bad:
            break

    child.stdin.close()
    child.kill()
    if obs_bails or trace_bad:
        print(f"SERVE GATE RED — first: {first_report}")
        sys.exit(1)
    print(f"SERVE GATE OK — seed {args.seed}, {args.turns} turns: obs equal on every (turn, seat), "
          "state digests agree on every group")


if __name__ == "__main__":
    main()
