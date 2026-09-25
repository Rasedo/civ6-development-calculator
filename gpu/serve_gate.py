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
import tempfile
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
from core import neutral, records  # noqa: E402

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


def diff_pairs(gpu_lines: list[str], ts_lines: list[str]) -> list[str]:
    """The amenity log, paired by CITY and trimmed to the disagreements.

    Both sides emit `c:<id> base.. lux.. ww.. have.. need.. bal.. tier..` once
    per recorded walk, so the LAST line for a city is that turn's. A seat's
    whole dump is a wall; what a hunt wants is the cities where the two walls
    differ, and nothing else — the same reason the combat log prints at the
    first diff rather than the whole stream.
    """
    def bare(ln: str | None) -> str | None:
        """the line without its ANNOTATION — everything after ` #`.

        One engine can name the rule that spawned a unit by reading its own
        frame; the other cannot. Context only one side can produce must not
        decide whether the two AGREE, or it reports a disagreement in a field
        that does not exist on the other engine at all.
        """
        return ln.split(" #", 1)[0] if ln is not None else None

    def by_city(lines: list[str]) -> dict[str, str]:
        out: dict[str, str] = {}
        for ln in lines:
            out[ln.split(" ", 1)[0]] = ln
        return out

    def order(k: str) -> tuple:
        # FIELD BY FIELD AND NUMERICALLY. A string sort puts rank 10 before
        # rank 2, and for the step log the FIRST disagreement is the cause
        # while every later one is its consequence.
        parts = k.split(":")
        return (parts[0], tuple(int(p) if p.lstrip("-").isdigit() else 0
                                for p in parts[1:]))

    # CIV6_DIFFLOG_ALL prints EVERY key from both sides, agreeing or not. The
    # pairing exists to hide the noise, and hiding it is exactly wrong once a
    # divergence is localised: what a row DID on the turns around the one that
    # differs is the next question, and it is a question about the lines the
    # filter throws away.
    _all = bool(os.environ.get("CIV6_DIFFLOG_ALL"))
    g, t = by_city(gpu_lines), by_city(ts_lines)
    reps: list[str] = []
    seen: dict[str, int] = {}
    dropped: dict[str, int] = {}
    for c in sorted(set(g) | set(t), key=order):
        gl, tl = g.get(c), t.get(c)
        if bare(gl) == bare(tl) and not _all:
            continue
        kind = c.split(":", 1)[0]
        seen[kind] = seen.get(kind, 0) + 1
        if seen[kind] > 10 and not _all:
            dropped[kind] = dropped.get(kind, 0) + 1
            continue
        reps.append(f"  D-GPU  {gl if gl is not None else '(no line)'}")
        reps.append(f"  D-TS   {tl if tl is not None else '(no line)'}")
    for kind, n in sorted(dropped.items()):
        reps.append(f"  D      ...and {n} more `{kind}:` disagreements after the first ten")
    # ...and EVERY kind reports, agreeing or not. A kind that is silent
    # because it never fired and one that is silent because it agreed are
    # different facts, and reading the first as the second cost this hunt a
    # battery run.
    _kinds: dict[str, int] = {}
    for c in set(g) | set(t):
        _k = c.split(":", 1)[0]
        _kinds[_k] = _kinds.get(_k, 0) + 1
    for kind in sorted(_kinds):
        if kind not in seen:
            reps.append(f"  D      {_kinds[kind]} `{kind}:` keys agree term for term")
    if not reps:
        reps.append("  D      the decomposition log is EMPTY — no kind fired at all")
    return reps


def dump_diff(man: dict, group: str, gdump: dict, tdump: dict,
              cap: int = int(os.environ.get("CIV6_DIFF_CAP", "12"))) -> list[str]:
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


def neutral_seat_diffs(seat: int, gpu_obs: dict, msg: dict) -> tuple[list[str], int]:
    """Every per-seat neutral group the TS child sent for `seat`, compared
    with the GPU observation's group of the SAME NAME; a name the GPU does
    not emit is a red. Returns (reds, groups compared)."""
    ts = ((msg.get("neutral") or {}).get(str(seat))) or {}
    reds: list[str] = []
    for name, val in ts.items():
        if name not in gpu_obs:
            reds.append(f"seat{seat}.{name}: the GPU observation has no such group")
            continue
        d = neutral_diff(f"seat{seat}.{name}", gpu_obs[name], val)
        if d:
            reds.append(d)
    return reds, len(ts)


def neutral_diff(path: str, g, t) -> str | None:
    """The first place two neutral-observation values differ, as
    `<path>: GPU <value> vs TS <value>` naming the field and the row, or
    None where they are equal. Dicts walk the GPU's keys in order, then any
    key only TS sent; lists walk by index, then a length difference."""
    if isinstance(g, dict) and isinstance(t, dict):
        for k in [*g, *(k for k in t if k not in g)]:
            if k not in g or k not in t:
                return f"{path}.{k}: GPU {json.dumps(g.get(k))} vs TS {json.dumps(t.get(k))}"
            d = neutral_diff(f"{path}.{k}", g[k], t[k])
            if d:
                return d
        return None
    if isinstance(g, list) and isinstance(t, list):
        for i, (x, y) in enumerate(zip(g, t)):
            d = neutral_diff(f"{path}[{i}]", x, y)
            if d:
                return d
        if len(g) != len(t):
            n = min(len(g), len(t))
            return (f"{path}: GPU {len(g)} rows vs TS {len(t)} rows, from [{n}]: "
                    f"GPU {json.dumps(g[n:n + 3])} vs TS {json.dumps(t[n:n + 3])}")
        return None
    if type(g) is not type(t) or g != t:
        return f"{path}: GPU {json.dumps(g)} vs TS {json.dumps(t)}"
    return None



def ts_seat_obs(msg: dict, seat: int) -> dict:
    """Seat `seat`'s neutral observation built from the TS child's message
    alone: its registered per-seat groups, the turn, and its RL vector — the
    shape `neutral.seat_obs` builds from the GPU."""
    return {**((msg.get("neutral") or {}).get(str(seat)) or {}),
            "turn": int(msg["world"]["turn"]), "vec": msg["obs"][str(seat)]}


def decision_diff(path: str, g, t, b: int) -> str | None:
    """The first place game `b`'s two decisions differ — tensors (batch
    first), tuples, lists and dicts of them — as `path: GPU x vs TS y`."""
    if isinstance(g, dict):
        for k in g:
            d = decision_diff(f"{path}.{k}", g[k], t[k], b)
            if d:
                return d
        return None
    if isinstance(g, (tuple, list)):
        for i, (x, y) in enumerate(zip(g, t)):
            d = decision_diff(f"{path}[{i}]", x, y, b)
            if d:
                return d
        return None
    if torch.is_tensor(g):
        x, y = g[b], t[b]
        if x.shape != y.shape or not bool(torch.equal(x, y)):
            ne = (x != y).nonzero().tolist() if x.shape == y.shape else []
            at = f" at {ne[0]}" if ne else f" shape {tuple(x.shape)} vs {tuple(y.shape)}"
            return f"{path}{at}: GPU {x.tolist()!r:.200} vs TS {y.tolist()!r:.200}"
        return None
    return None if g == t else f"{path}: GPU {g!r} vs TS {t!r}"


def dual_decide(st, seats: list, decs: dict, geo_dec, msgs: list, roster: dict, classes: dict,
                seeds: list) -> list[tuple[int, str]]:
    """THE DUAL DECIDE. The driver decides again from the TS engine's own
    observation — the per-seat groups, the diplomatic table, the RL vector
    — and every decision must equal the one taken from the GPU's. Returns
    (game, first difference) per game that differs."""
    reds: dict[int, str] = {}
    geo_ts = drive.decide_geo(st, [m["geo"] for m in msgs], seeds)
    for b in range(len(msgs)):
        d = decision_diff("geo", geo_dec, geo_ts, b)
        if d:
            reds.setdefault(b, d)
    for row in seats:
        dec_ts = records.decide(st, row, [ts_seat_obs(m, row) for m in msgs], roster, classes, seeds=seeds)
        for b in range(len(msgs)):
            if b in reds:
                continue
            d = decision_diff(f"seat{row}", {f: decs[row][f] for f in drive.DECIDE_FIELDS},
                              {f: dec_ts[f] for f in drive.DECIDE_FIELDS}, b)
            if d:
                reds[b] = d
    return sorted(reds.items())


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


def _crash_text(ch, ef) -> str:
    """What a dead TS child has to say for itself. `read_msg` sees only the
    closed stdout, so without this the gate reports the symptom and never the
    cause — which is what a battery lane hands back when a child dies."""
    rc = ch.poll()
    tail = ""
    if ef is not None:
        try:
            ef.seek(0)
            tail = ef.read()[-4000:].strip()
        except (OSError, ValueError):
            tail = ""
    head = f"a TS child closed its stdout (exit {rc})"
    return f"{head}:\n{tail}" if tail else f"{head} and wrote nothing to stderr"


# THE RECORD LOG: `CIV6_REC_LOG=<dir>` appends every turn's decided records,
# one JSONL file per seed (`recs_<seed>.jsonl`, shards never share a file).
# It changes nothing the engines see; `tools/gpu/rec_diff.py` compares two
# directories, which is how a driver refactor proves its decisions unchanged.
_REC_LOG = os.environ.get("CIV6_REC_LOG")


def _log_recs(seed: int, turn: int, recs: dict) -> None:
    if not _REC_LOG:
        return
    d = Path(_REC_LOG)
    d.mkdir(parents=True, exist_ok=True)
    with open(d / f"recs_{seed}.jsonl", "a", encoding="utf-8") as fh:
        fh.write(json.dumps({"t": turn, "recs": recs}, sort_keys=True) + "\n")


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
    # the game's STATIC facts, built once from rules.json and the world: the
    # driver reads them and the observations, never the sim
    st = neutral.static_of(rules, fixtures[0])
    roster, classes = drive.tables(st)
    sc_man = statecompare.load_manifest()
    statecompare.check_extractors(sc_man)
    dig_dumped = False
    _cb = os.environ.get("CIV6_CBLOG_B")
    if _cb is not None:
        sim._log_combat_b = int(_cb)
    # CIV6_DIFFLOG_B arms the AMENITY decomposition for one game, the way
    # CIV6_CBLOG_B arms the combat rolls. The TS child reads CIV6_DIFFLOG from
    # the environment it inherits.
    if os.environ.get("CIV6_DIFFLOG"):
        sim._log_diff = True
    for row in seats:
        records.take_seat(sim, row)
    NT, NC = sim.civ_techs.shape[2], sim.civ_civics.shape[2]

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
    # A crashed child used to close its stdout and say nothing: its stderr went
    # to DEVNULL, so the gate could report the SYMPTOM and never the cause. A
    # real file rather than a PIPE, because nothing drains a pipe until the
    # read that discovers the crash — which is exactly when it would deadlock.
    errs: dict[int, object] = {}
    for sd in seeds:
        child_env = dict(os.environ)
        child_env.update({
            "CIV6_SERVE": "1", "CIV6_SERVE_SEED": str(sd),
            "CIV6_SERVE_HORIZON": str(env.horizon), "PYTHONIOENCODING": "utf-8",
            # A HEAP CAP for the child. The modifier memo (getModifiers by
            # input fingerprint) made its Modifiers objects long-lived, and V8
            # let the old space grow ~650 MB per child before collecting —
            # memory the battery's planner trades for shards. The child is
            # 95% idle, so the extra collections cost nothing it needs: 256 MB
            # holds a turn-250 state with room (its checkpoint dump is ~2 MB)
            # and the lane's peak came back to the pre-memo 945 MB.
            "NODE_OPTIONS": (os.environ.get("NODE_OPTIONS", "") + " --max-old-space-size=256").strip(),
        })
        if resume:
            assert ckpt_dir is not None
            child_env["CIV6_SERVE_LOAD"] = str(ckpt_dir / f"b_seed{sd}_t{resume}.json")
        # CIV6_SERVE_ERRDIR keeps each child's stderr where a hunt can read
        # it: the temp file is dumped only when a child CRASHES, and a
        # narration (CIV6_EXPORT_DEBUG) is wanted exactly when it does not.
        _errdir = os.environ.get("CIV6_SERVE_ERRDIR")
        if _errdir:
            os.makedirs(_errdir, exist_ok=True)
            ef = open(os.path.join(_errdir, f"seed{sd}.err"), "w+",
                      encoding="utf-8", errors="replace")
        else:
            ef = tempfile.TemporaryFile(mode="w+", encoding="utf-8", errors="replace")
        ch = subprocess.Popen(
            ["npx", "vite-node", "cpu/driver/serve.ts", "--", str(turns), str(FIXTURES)],
            cwd=ROOT, env=child_env, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=ef, text=True, encoding="utf-8", shell=True,
        )
        errs[id(ch)] = ef
        children.append(ch)

    def read_msg(ch) -> dict:
        while True:
            line = ch.stdout.readline()
            if not line:
                raise RuntimeError(_crash_text(ch, errs.get(id(ch))))
            if line.startswith("@@"):
                return json.loads(line[2:])

    bad = 0
    first: str | None = None
    world_checked = 0
    groups_checked = 0

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
            # THE NEUTRAL OBSERVATION'S WORLD GROUP, emitted by both engines
            # pre-decide and compared field by field
            for b, (gw, msg) in enumerate(zip(neutral.world_obs(sim), msgs)):
                d = neutral_diff("world", gw, msg.get("world"))
                if d:
                    flag(f"seed {seeds[b]} turn {t + 1}: NEUTRAL {d}")
                world_checked += 1
            # ...and the diplomatic table, which the geo decide reads
            geo_obs = neutral.geo_obs(sim)
            for b, (gg, msg) in enumerate(zip(geo_obs, msgs)):
                d = neutral_diff("geo", gg, msg.get("geo"))
                if d:
                    flag(f"seed {seeds[b]} turn {t + 1}: NEUTRAL {d}")
            nobs_seat: dict = {}
            for seat in seats:
                gobs_all = env.observe(seat)
                # THE NEUTRAL OBSERVATION the decide pass reads, taken here
                # pre-decide: nothing between here and the decide mutates its
                # inputs (the decide only STASHES).
                nobs_seat[seat] = neutral.seat_obs(sim, seat, gobs_all)
                # ...and every per-seat group the TS child emitted for this seat
                for b, msg in enumerate(msgs):
                    _reds, _n = neutral_seat_diffs(seat, nobs_seat[seat][b], msg)
                    for _d in _reds:
                        flag(f"seed {seeds[b]} turn {t + 1}: NEUTRAL {_d}")
                    # the DECOMPOSITION belongs to whatever flagged: a group
                    # red never reaches a digest dump, so its evidence prints here
                    if _reds and sim._log_diff:
                        for _ln in diff_pairs(sim._diff_events.get(b, []), msg.get("dl", [])):
                            print(_ln)
                    groups_checked += _n
                for b, msg in enumerate(msgs):
                    tobs = torch.tensor(msg["obs"][str(seat)], dtype=torch.float64)
                    gobs = gobs_all[b]
                    diff = (gobs - tobs).abs()
                    ctx_lo = diff.shape[0] - ladder.CTX_SEAT
                    badm = torch.zeros_like(diff, dtype=torch.bool)
                    badm[:ctx_lo] = diff[:ctx_lo] > eps
                    badm[ctx_lo:] = diff[ctx_lo:] != 0
                    if bool(badm.any()):
                        i = int(badm.nonzero(as_tuple=True)[0][0])
                        flag(f"seed {seeds[b]} turn {t + 1} seat {seat}: OBS [{i}] {_field_name(i, sim.S, sim.n_majors - 1, sim.RC, NT, NC)}: GPU {float(gobs[i])!r} vs TS {float(tobs[i])!r}")
            prof["obs+targets compare (GPU obs, buys, jobs)"] += _pc() - _t
            if bad:
                break
            _t = _pc()
            geo = records.geo_decide_and_apply(sim, st, geo_obs, seeds)
            # ONE decide body, ONE record shape, every major row, seat 0 first.
            decs = {row: records.decide(st, row, nobs_seat[row], roster, classes, seeds=seeds) for row in seats}
            prof["decide (policy on GPU)"] += _pc() - _t
            _t = _pc()
            for b, d in dual_decide(st, seats, decs, geo, msgs, roster, classes, seeds):
                flag(f"seed {seeds[b]} turn {t + 1}: DUAL DECIDE {d}")
            prof["dual decide (policy on the TS observation)"] += _pc() - _t
            if bad:
                break
            _t = _pc()
            per_seat = {row: records.apply(sim, row, decs[row]) for row in seats}
            _t = _pc()
            for b, ch in enumerate(children):
                recs = {str(row): {**records.extract_record(sim, row, *per_seat[row], b),
                                   **records.extract_geo(geo, row, b)} for row in seats}
                _log_recs(seeds[b], t + 1, recs)
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
            _t = _pc()
            gdigs = statecompare.state_digest_all(sim, sc_man)
            prof["state_digest (GPU extract)"] += _pc() - _t
            for b, ch in enumerate(children):
                if True:
                    gdig = gdigs[b]
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
                            if sim._log_combat_b == b:
                                for ev in sim._combat_events[-16:]:
                                    print(f"  CB-GPU {ev}")
                                for ev in dmp.get("cb", []):
                                    print(f"  CB-TS  {ev}")
                            if sim._log_diff:
                                for ln in diff_pairs(sim._diff_events.get(b, []),
                                                     dmp.get("dl", [])):
                                    print(ln)
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
          f"obs equal everywhere, the neutral world group and diplomatic table equal on {world_checked} "
          f"(game, turn) pairs and {groups_checked} per-seat groups, every decision equal from either observation, "
          f"state digests agree on every group")


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
    ap.add_argument("--styles", default=None,
                    help="comma list of ladder.STYLE_PRESETS names assigned per seat (cycled); "
                         "omit for the same run as `--styles default`, NOT a draw: "
                         "`_seat_style` answers STYLE_KNOBS for every seat when "
                         "STYLE_TABLE is None. Only the CARD style is drawn per "
                         "(seed, seat). The battery runs without it")
    ap.add_argument("--profile", action="store_true", help="batched only: print the turn-loop wall-time split (TS-children wait vs GPU vs digest)")
    ap.add_argument("--cprofile", default="", help="batched only: 'T0-T1' — cProfile the loop body over that turn window, in situ")
    ap.add_argument("--cprofile-out", default="", help="with --cprofile: also dump the raw pstats there, for caller attribution")
    args = ap.parse_args()
    ckpt_dir = Path(args.ckpt_dir)

    if args.styles:
        names = args.styles.split(",")
        bad = [n for n in names if n not in ladder.STYLE_PRESETS]
        assert not bad, f"unknown style preset(s) {bad}; have {sorted(ladder.STYLE_PRESETS)}"
        drive.STYLE_TABLE = names
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
    st = neutral.static_of(rules, fx)
    roster, classes = drive.tables(st)
    sc_man = statecompare.load_manifest()
    statecompare.check_extractors(sc_man)
    dig_dumped = False
    _cb = os.environ.get("CIV6_CBLOG_B")
    if _cb is not None:
        sim._log_combat_b = int(_cb)
    # CIV6_DIFFLOG_B arms the AMENITY decomposition for one game, the way
    # CIV6_CBLOG_B arms the combat rolls. The TS child reads CIV6_DIFFLOG from
    # the environment it inherits.
    if os.environ.get("CIV6_DIFFLOG"):
        sim._log_diff = True
    for row in seats:
        records.take_seat(sim, row)
    NT, NC = sim.civ_techs.shape[2], sim.civ_civics.shape[2]

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
    _ef = tempfile.TemporaryFile(mode="w+", encoding="utf-8", errors="replace")
    child = subprocess.Popen(
        ["npx", "vite-node", "cpu/driver/serve.ts", "--", str(args.turns), str(FIXTURES)],
        cwd=ROOT, env=child_env, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
        stderr=_ef, text=True, encoding="utf-8", shell=True,
    )

    def read_msg() -> dict:
        while True:
            line = child.stdout.readline()
            if not line:
                raise RuntimeError(_crash_text(child, _ef))
            if line.startswith("@@"):
                return json.loads(line[2:])

    obs_bails = 0
    trace_bad = 0
    world_checked = 0
    groups_checked = 0
    first_report: str | None = None
    for t in range(t0, args.turns):
        msg = read_msg()
        assert msg.get("t") == t + 1, f"turn frame skew: TS says {msg.get('t')}, orchestrator at {t + 1}"
        geo_obs = neutral.geo_obs(sim)
        for d in (neutral_diff("world", neutral.world_obs(sim)[0], msg.get("world")),
                  neutral_diff("geo", geo_obs[0], msg.get("geo"))):
            if d:
                rep = f"turn {t + 1}: NEUTRAL {d}"
                print(rep)
                if first_report is None:
                    first_report = rep
                obs_bails += 1
        world_checked += 1
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
            ctx_lo = diff.shape[0] - ladder.CTX_SEAT
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
        nobs_seat: dict = {}
        for seat in seats:
            nobs_seat[seat] = neutral.seat_obs(sim, seat, obs_seat[seat])
            _reds, _n = neutral_seat_diffs(seat, nobs_seat[seat][0], msg)
            for _d in _reds:
                rep = f"turn {t + 1}: NEUTRAL {_d}"
                print(rep)
                if first_report is None:
                    first_report = rep
                obs_bails += 1
            groups_checked += _n
        if obs_bails:
            break
        geo = records.geo_decide_and_apply(sim, st, geo_obs, [args.seed])
        decs = {row: records.decide(st, row, nobs_seat[row], roster, classes, seeds=[args.seed]) for row in seats}
        for _b, d in dual_decide(st, seats, decs, geo, [msg], roster, classes, [args.seed]):
            rep = f"turn {t + 1}: DUAL DECIDE {d}"
            print(rep)
            if first_report is None:
                first_report = rep
            obs_bails += 1
        if obs_bails:
            break
        per_seat = {row: records.apply(sim, row, decs[row]) for row in seats}
        recs = {str(row): {**records.extract_record(sim, row, *per_seat[row], 0),
                           **records.extract_geo(geo, row, 0)} for row in seats}
        if os.environ.get("CIV6_SERVE_DEBUG_BUY") and any("buy" in v for v in recs.values()):
            print(f"BUYREC turn {t + 1}: " + json.dumps({k: v["buy"] for k, v in recs.items() if "buy" in v}))
        _log_recs(args.seed, t + 1, recs)
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
          f"the neutral world group and diplomatic table equal on {world_checked} turns and {groups_checked} per-seat groups, every decision equal from either observation, "
          "state digests agree on every group")


if __name__ == "__main__":
    main()
