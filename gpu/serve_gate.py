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
import time
from collections import defaultdict
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "policy"))  # drive + ladder
from core import load_rules, load_fixture, fixture_paths, FIXTURES  # noqa: E402
from core import statecompare  # noqa: E402
from core.env import BatchEnv  # noqa: E402
import drive  # noqa: E402
import ladder  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent


def _q_eq(a, b, scale: int) -> bool:
    if isinstance(a, list) or isinstance(b, list):
        if not (isinstance(a, list) and isinstance(b, list)) or len(a) != len(b):
            return False
        return all(_q_eq(x, y, scale) for x, y in zip(a, b))
    return statecompare._quantise(a, scale) == statecompare._quantise(b, scale)


def digest_diff(man: dict, gdig: dict, tdig: dict | None) -> tuple[list[str], list[str]]:
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


def _buy_row(sim, seat: int, bc: dict, rk, rj, mk, b: int) -> list:
    """One row of the BUY-candidate tripwire, in the TS driver twin's exact
    shape — shared by the batched and single-seed paths so the two cannot
    drift: [centre, bIdx, settlerOk, unitOk, tileOk, tile, tileCentre,
    worshipCentre, religKind, religCentre, levyIdx, monuKind, monuCentre,
    natKind, natCentre]."""
    def ctr(j: int) -> int:
        return int(sim.city_center[b, seat, j]) if j >= 0 else -1
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
        int(mk[b]),
        ctr(int(bc["spawn_slot"][b])) if int(mk[b]) >= 0 else -1,
        10 if bool(bc["nat_ok"][b]) else -1,
        ctr(int(bc["nat_j"][b])) if bool(bc["nat_ok"][b]) else -1,
    ]


def _buy_rows(sim, seat: int, bc: dict | None = None) -> list:
    if bc is None:
        bc = drive._buy_ctx(sim, seat)
    _, rk = ladder.pick_faith(bc["worship_ok"], bc["missionary_ok"], bc["apostle_ok"],
                              bc["inquisitor_ok"])
    rj = torch.where(rk == 5, bc["missionary_j"],
                     torch.where(rk == 6, bc["apostle_j"],
                                 torch.where(rk == 11, bc["inquisitor_j"],
                                             torch.full_like(rk, -1))))
    mk = ladder.pick_monu(bc["monu_builder_ok"], bc["monu_settler_ok"])
    return [_buy_row(sim, seat, bc, rk, rj, mk, b) for b in range(sim.B)]


def _field_name(i: int, S: int, n_opponents: int, C: int, NT: int, NC: int) -> str:
    if i < ladder.EMP:
        return f"empire.{ladder.EMP_FIELDS[i]}"
    i -= ladder.EMP
    if i < ladder.PER_CS * S:
        return f"citystate[{i // ladder.PER_CS}].{i % ladder.PER_CS}"
    i -= ladder.PER_CS * S
    if i < ladder.PER_CIV * n_opponents:
        return f"civ[{i // ladder.PER_CIV}].{ladder.PER_CIV_FIELDS[i % ladder.PER_CIV]}"
    i -= ladder.PER_CIV * n_opponents
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
    if i < NT:
        return f"progTech.{i}"
    i -= NT
    if i < NC:
        return f"progCivic.{i}"
    i -= NC
    if i < ladder.CONGRESS:
        return f"congress.{ladder.CONGRESS_FIELDS[i]}"
    i -= ladder.CONGRESS
    return f"ctx.{ladder.CTX_FIELDS[i]}"


def run_batched(turns: int, eps: float, ckpt_every: int = 0,
                ckpt_dir: Path | None = None, resume: int = 0,
                profile: bool = False, cprofile: str = "",
                only: list[int] | None = None, cprofile_out: str = "") -> None:
    """The battery-lane shape: ONE B=N GPU sim, one TS child per seed in
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
    paths = fixture_paths()
    if only:
        want = set(only)
        paths = [p for p in paths if int(p.stem[4:]) in want]
        missing = want - {int(p.stem[4:]) for p in paths}
        assert not missing, f"no fixture for seed(s) {sorted(missing)}"
    fixtures = [load_fixture(p) for p in paths]
    seeds = [int(fx["seed"]) for fx in fixtures]
    env = BatchEnv(fixtures, rules, device="cpu", dtype=torch.float64)
    sim = env.sim
    # EVERY major row, seat 0 first — the order `_seat_phase` walks and the
    # order TS's seatPhase applies records in.
    seats = list(range(sim.n_majors))
    NB = sim.rules_dev.b_cost.shape[0]
    classes = ladder.prod_classes(NB, sim.NU, len(sim._scaffold), sim._wond_n if sim.districts_on else 0, len(sim._proj_rows) if sim.districts_on else 0)
    rj = json.loads((FIXTURES / "rules.json").read_text(encoding="utf-8"))
    roster = ladder.unit_roster(rj["units"])
    sc_man = statecompare.load_manifest()
    statecompare.check_extractors(sc_man)
    dig_dumped = False
    for row in seats:
        drive.take_seat(sim, row)
    NT, NC = sim.civ_techs.shape[2], sim.civ_civics.shape[2]
    ctx_lo = env.observe(1).shape[1] - ladder.CTX_SEAT

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

    # --profile: wall-time split of the turn loop. `wait_*` buckets are time
    # BLOCKED on the TS children (the decision-server share); the rest is this
    # process — GPU or orchestration.
    prof: dict[str, float] = defaultdict(float)
    _pc = time.perf_counter
    # --cprofile T0-T1: function-level attribution over that turn window, in
    # situ — a bare sim outside the serve loop is decision-free and EMPTY
    # (settler starts, nothing founds), so only the live loop measures truth.
    cp = cp_lo = cp_hi = None
    if cprofile:
        import cProfile
        lo, _, hi = cprofile.partition("-")
        cp_lo, cp_hi = int(lo), int(hi)
        cp = cProfile.Profile()

    try:
        for t in range(t0, turns):
            if cp is not None:
                if t == cp_lo:
                    cp.enable()
                elif t == cp_hi:
                    cp.disable()
            _t = _pc()
            msgs = [read_msg(ch) for ch in children]
            prof["wait_obs (TS children)"] += _pc() - _t
            _t = _pc()
            pre_seat: dict = {}
            for seat in seats:
                gobs_all = env.observe(seat)
                gj_t = drive._builder_jobs(sim, seat)
                gs_t = drive._spread_targets(sim, seat)
                gj_all = gj_t.tolist()
                gs_all = gs_t.tolist()
                # Every seat's rows already ride `_seat_slot_map` — this
                # seat's LIVING units in slot order, which IS the TS array
                # order it emits per unit. No seat needs a compaction of its
                # own any more.
                # The BUY-candidate tripwire: _buy_ctx against the TS
                # pre-turn twin, in the one row shape both paths share —
                # EVERY seat, row 0 included.
                bc = drive._buy_ctx(sim, seat)
                gb_all = _buy_rows(sim, seat, bc)
                # the ROUTE-candidate tripwire rides the same pattern: the
                # GPU scan against the TS driver's routeCandidateRow, and the
                # SAME reads feed the policy below.
                gr_f, gr_d = sim._seat_route_candidate(seat)
                # the decide pass reuses these pre-decide reads verbatim —
                # nothing between here and _decide_turn mutates their inputs
                # (geo_decide_and_apply only STASHES; observe reads none of it)
                pre_seat[seat] = {"jobs": gj_t, "spreads": gs_t, "bctx": bc, "obs": gobs_all,
                                  "route": (gr_f, gr_d)}
                for b, msg in enumerate(msgs):
                    tobs = torch.tensor(msg["obs"][str(seat)], dtype=torch.float64)
                    gobs = gobs_all[b]
                    diff = (gobs - tobs).abs()
                    badm = torch.zeros_like(diff, dtype=torch.bool)
                    badm[:ctx_lo] = diff[:ctx_lo] > eps
                    badm[ctx_lo:] = diff[ctx_lo:] != 0
                    if bool(badm.any()):
                        i = int(badm.nonzero(as_tuple=True)[0][0])
                        flag(f"seed {seeds[b]} turn {t + 1} seat {seat}: OBS [{i}] {_field_name(i, sim.S, sim.n_majors - 1, sim.RC, NT, NC)}: GPU {float(gobs[i])!r} vs TS {float(tobs[i])!r}")
                    for name, ga, ta in (("job", gj_all[b], msg.get("jobs", {}).get(str(seat), [])),
                                         ("spread", gs_all[b], msg.get("spreads", {}).get(str(seat), []))):
                        for i in range(max(len(ga), len(ta))):
                            gv = ga[i] if i < len(ga) else -1
                            tv = ta[i] if i < len(ta) else -1
                            if gv != tv:
                                flag(f"seed {seeds[b]} turn {t + 1} seat {seat}: {name.upper()} row {i}: GPU {gv} vs TS {tv}")
                                break
                    if True:
                        tb = msg.get("buys", {}).get(str(seat), [])
                        if tb and gb_all[b] != tb:
                            flag(f"seed {seeds[b]} turn {t + 1} seat {seat}: BUY [centre,bIdx,settler,unit,tileOk,tile,tileC,worshipC,religKind,religC,levy,monuKind,monuC,natKind,natC]: GPU {gb_all[b]} vs TS {tb}")
                        tr = msg.get("routes", {}).get(str(seat), [])
                        gr_b = [int(gr_f[b]), int(gr_d[b])]
                        if tr and gr_b != tr:
                            flag(f"seed {seeds[b]} turn {t + 1} seat {seat}: ROUTE [from,dest]: GPU {gr_b} vs TS {tr}")
            prof["obs+targets compare (GPU obs, buys, jobs)"] += _pc() - _t
            if bad:
                break
            _t = _pc()
            geo = drive.geo_decide_and_apply(sim, seeds)
            # ONE decide body, ONE record shape, every major row, seat 0 first.
            # Seat 0 rides `_decide_turn` like the rest, which also hands it the
            # MULTI-RANK unit plan every other row already had (its own block
            # only ever emitted rank 0) and the `denounce`/`ally` record fields
            # its block never carried at all — the GPU has been applying row 0's
            # geo intents while the wire told the TS child nothing about them.
            per_seat = {row: drive._decide_turn(env, sim, row, roster, classes, seeds=seeds, turn=t, pre=pre_seat.get(row)) for row in seats}
            prof["decide (policy on GPU)"] += _pc() - _t
            _t = _pc()
            for b, ch in enumerate(children):
                recs = {str(row): {**drive._extract_record(sim, row, *per_seat[row], b),
                                   **drive._extract_geo(geo, row, b)} for row in seats}
                ch.stdin.write(json.dumps({"recs": recs}) + "\n")
                ch.stdin.flush()
            prof["extract+send records"] += _pc() - _t
            _t = _pc()
            sim.step()
            prof["sim.step (GPU engine)"] += _pc() - _t
            _t = _pc()
            trs = [read_msg(ch) for ch in children]  # barrier: every child's post-step digest
            prof["wait_digest (TS children)"] += _pc() - _t
            # THE DIGEST IS THE GATE. On the FIRST disagreement the mismatching
            # groups are dumped keyed from both engines and diffed BY NAME;
            # later ones get one line each, capped so a persistent drift cannot
            # flood the output.
            for b, ch in enumerate(children):
                if True:
                    _t = _pc()
                    gdig = statecompare.state_digest(sim, b, sc_man)
                    prof["state_digest (GPU extract)"] += _pc() - _t
                    _t = _pc()
                    bad_groups, reps = digest_diff(sc_man, gdig, trs[b].get("digest"))
                    prof["digest_diff (compare)"] += _pc() - _t
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
                if ckpt_every and (t + 1) % ckpt_every == 0:
                    assert ckpt_dir is not None
                    ch.stdin.write(json.dumps({"ckpt": str(ckpt_dir / f"b_seed{seeds[b]}_t{t + 1}.json")}) + "\n")
                    ch.stdin.flush()
                    read_msg(ch)
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
    if profile:
        total = sum(prof.values())
        print(f"PROFILE — turn-loop wall {total:.1f}s over {turns - t0} turns "
              f"({len(seeds)} seeds); buckets, largest first:")
        for k, v in sorted(prof.items(), key=lambda kv: -kv[1]):
            print(f"  {k:<42} {v:8.1f}s  {100 * v / total:5.1f}%")
        ts_wait = sum(v for k, v in prof.items() if k.startswith("wait_"))
        print(f"  blocked on TS children: {ts_wait:.1f}s ({100 * ts_wait / total:.1f}%) — "
              "the rest is this process (GPU + orchestration)")
    if cp is not None:
        import pstats
        cp.create_stats()
        if cprofile_out:
            cp.dump_stats(cprofile_out)
            print(f"\nCPROFILE — stats written to {cprofile_out}")
        print(f"\nCPROFILE — turns {cp_lo}..{cp_hi}, full loop body:")
        st = pstats.Stats(cp)
        st.sort_stats("cumulative").print_stats(30)
        st.sort_stats("tottime").print_stats(20)
    if bad:
        print(f"SERVE GATE (BATCHED) RED — first: {first}")
        sys.exit(1)
    print(f"SERVE GATE (BATCHED) OK — {len(seeds)} games x {turns} turns in one batch: "
          "obs + unit targets equal everywhere, state digests agree on every group")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=9002)
    ap.add_argument("--seeds", default=None, help="'all' = every seeder/worlds/seed*.json, or comma-separated; overrides --seed. With --batched a comma list narrows the BATCH")
    ap.add_argument("--batched", action="store_true", help="the battery-lane shape: ONE B=12 sim, all TS children in parallel")
    ap.add_argument("--turns", type=int, default=60)
    ap.add_argument("--eps", type=float, default=1e-9, help="scaled-float obs tolerance; the raw ctx block is compared EXACTLY")
    # Checkpoint/resume: diagnosis starts from a checkpoint, never a full
    # two-engine replay.
    ap.add_argument("--ckpt-every", type=int, default=0, help="checkpoint both engines every K completed turns (0 = off)")
    ap.add_argument("--ckpt-dir", default=".claude/scratchpad/serve_ckpt", help="where checkpoints live (GPU .pt + per-seed TS .json)")
    ap.add_argument("--resume", type=int, default=0, help="resume from the checkpoint taken at this turn (a prior --ckpt-every run, same seeds)")
    ap.add_argument("--profile", action="store_true", help="batched only: print the turn-loop wall-time split (TS-children wait vs GPU vs digest)")
    ap.add_argument("--cprofile", default="", help="batched only: 'T0-T1' — cProfile the loop body over that turn window, in situ")
    ap.add_argument("--cprofile-out", default="", help="with --cprofile: also dump the raw pstats there, for caller attribution")
    args = ap.parse_args()
    ckpt_dir = Path(args.ckpt_dir)

    if args.batched:
        only = None
        if args.seeds and args.seeds != "all":
            only = [int(x) for x in args.seeds.split(",")]
        run_batched(args.turns, args.eps, args.ckpt_every, ckpt_dir, args.resume,
                    profile=args.profile, cprofile=args.cprofile, only=only,
                    cprofile_out=args.cprofile_out)
        return

    if args.seeds:
        if args.seeds == "all":
            seeds = sorted(int(p.stem[4:]) for p in fixture_paths())
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
    seats = list(range(sim.n_majors))
    NB = sim.rules_dev.b_cost.shape[0]
    classes = ladder.prod_classes(NB, sim.NU, len(sim._scaffold), sim._wond_n if sim.districts_on else 0, len(sim._proj_rows) if sim.districts_on else 0)
    rj = json.loads((FIXTURES / "rules.json").read_text(encoding="utf-8"))
    roster = ladder.unit_roster(rj["units"])
    sc_man = statecompare.load_manifest()
    statecompare.check_extractors(sc_man)
    dig_dumped = False
    for row in seats:
        drive.take_seat(sim, row)
    NT, NC = sim.civ_techs.shape[2], sim.civ_civics.shape[2]
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
        obs_seat: dict = {}
        for seat in seats:
            obs_seat[seat] = env.observe(seat)
            gobs = obs_seat[seat][0]
            tobs = torch.tensor(msg["obs"][str(seat)], dtype=torch.float64)
            if gobs.shape[0] != tobs.shape[0]:
                print(f"turn {t + 1} seat {seat}: WIDTH {int(tobs.shape[0])} (TS) vs {int(gobs.shape[0])} (GPU)")
                child.kill()
                sys.exit(1)
            diff = (gobs - tobs).abs()
            bad = torch.zeros_like(diff, dtype=torch.bool)
            bad[:ctx_lo] = diff[:ctx_lo] > args.eps
            bad[ctx_lo:] = diff[ctx_lo:] != 0
            if bool(bad.any()):
                i = int(bad.nonzero(as_tuple=True)[0][0])
                name = _field_name(i, sim.S, sim.n_majors - 1, sim.RC, NT, NC)
                rep = (f"turn {t + 1} seat {seat}: OBS MISMATCH at [{i}] {name}: "
                       f"GPU {float(gobs[i])!r} vs TS {float(tobs[i])!r}")
                print(rep)
                if first_report is None:
                    first_report = rep
                obs_bails += 1
        # Per-unit obs twins: the GPU extractors against the TS arrays, per
        # slot-map row (TS rows = live units in mirrored order; GPU rows beyond
        # the live count must be -1). EVERY seat rides `_seat_slot_map` now,
        # so no seat needs a compaction of its own.
        pre_seat: dict = {}
        for seat in seats:
            gj_t = drive._builder_jobs(sim, seat)
            gs_t = drive._spread_targets(sim, seat)
            gj = gj_t[0].tolist()
            gs = gs_t[0].tolist()
            tj = msg.get("jobs", {}).get(str(seat), [])
            ts_ = msg.get("spreads", {}).get(str(seat), [])
            if True:
                bc = drive._buy_ctx(sim, seat)
                gr_f, gr_d = sim._seat_route_candidate(seat)
                pre_seat[seat] = {"jobs": gj_t, "spreads": gs_t, "bctx": bc, "obs": obs_seat[seat],
                                  "route": (gr_f, gr_d)}
                gb = _buy_rows(sim, seat, bc)[0]
                tb = msg.get("buys", {}).get(str(seat), [])
                if tb and gb != tb:
                    rep = f"turn {t + 1} seat {seat}: BUY [centre,bIdx,settler,unit,tileOk,tile,tileC,worshipC,religKind,religC,levy,monuKind,monuC,natKind,natC]: GPU {gb} vs TS {tb}"
                    print(rep)
                    if first_report is None:
                        first_report = rep
                    obs_bails += 1
                tr = msg.get("routes", {}).get(str(seat), [])
                gr_b = [int(gr_f[0]), int(gr_d[0])]
                if tr and gr_b != tr:
                    rep = f"turn {t + 1} seat {seat}: ROUTE [from,dest]: GPU {gr_b} vs TS {tr}"
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
                        if os.environ.get("CIV6_SERVE_DEBUG_JOB") and name == "job":
                            for _dt in (gv, tv):
                                if _dt < 0:
                                    continue
                                print(f"  tile {_dt}: city_slot {int(sim.city_slot_at(seat)[0, _dt])} tile_seat {int(sim.tile_seat[0, _dt])}"
                                      f" water {bool(sim.water[0, _dt])} imp {int(sim.improvement[0, _dt])}"
                                      f" dist {int(sim.district[0, _dt])} wond {int(sim.built_wonder[0, _dt])}"
                                      f" ctr {int(sim.centre_slot_at[0, _dt])} pill {bool(sim.pillaged[0, _dt])}"
                                      f" dpill {bool(sim.district_pillaged[0, _dt])} farm {bool(sim.farm_flat[0, _dt])}"
                                      f" mine {bool(sim.mine_ok[0, _dt])} lumber {bool(sim.lumber_ok[0, _dt])}"
                                      f" res {int(sim.res_imp[0, _dt])}")
                            for _p in range(int(sim.unit_next[0])):
                                if not bool(sim.major_unit_alive[0, _p]):
                                    continue
                                print(f"  u[{_p}] seat {int(sim.major_unit_seat[0, _p])}"
                                      f" tile {int(sim.major_unit_tile[0, _p])} type {int(sim.major_unit_type[0, _p])}"
                                      f" charges {int(sim.major_unit_charges[0, _p])}")
                        print(rep)
                        if first_report is None:
                            first_report = rep
                        obs_bails += 1
                        break
        if obs_bails:
            break
        geo = drive.geo_decide_and_apply(sim, [args.seed])
        per_seat = {row: drive._decide_turn(env, sim, row, roster, classes, seeds=[args.seed], turn=t, pre=pre_seat.get(row)) for row in seats}
        recs = {str(row): {**drive._extract_record(sim, row, *per_seat[row], 0),
                           **drive._extract_geo(geo, row, 0)} for row in seats}
        if os.environ.get("CIV6_SERVE_DEBUG_BUY") and any("buy" in v for v in recs.values()):
            print(f"BUYREC turn {t + 1}: " + json.dumps({k: v["buy"] for k, v in recs.items() if "buy" in v}))
        child.stdin.write(json.dumps({"recs": recs}) + "\n")
        child.stdin.flush()
        sim.step()
        tr = read_msg()
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
        if args.ckpt_every and (t + 1) % args.ckpt_every == 0:
            child.stdin.write(json.dumps({"ckpt": str(ckpt_dir / f"s{args.seed}_t{t + 1}.json")}) + "\n")
            child.stdin.flush()
            read_msg()
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
