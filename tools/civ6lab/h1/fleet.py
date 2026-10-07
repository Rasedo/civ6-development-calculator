"""H-1: autoplay games on the fleet, dump every turn, and check each game
against the engine.

    python tools/civ6lab/h1/fleet.py run --hosts 127.0.0.2 --seeds 1102,1103 --turns 250 --tag duel
    python tools/civ6lab/h1/fleet.py run --hosts 127.0.0.2,127.0.0.4 --seeds 1200-1209 --config tools/civ6lab/h1/h1_duel.json
    python tools/civ6lab/h1/fleet.py summary tools/civ6lab/runs/h1_fleet_duel_<stamp>.jsonl

Per seed (map seed s, game seed s + 1000), on the next free host: a new game
from the main menu (`game.py new`), then `dump.py play` in wall-bounded
chunks until the game reaches `--turns` or ends or stalls, then the exit to
the main menu, then the game's map orders beside the dump (`map_orders.py`,
`.orders.json`), then the engine's report over the dump (`.report.json`, `.report.md`)
(`npx vite-node cpu/harness/run.ts`). Every game call is a subprocess under
`--chunk` seconds (`h3_bounded.py`'s kill-on-deadline), so no call can hang
the loop. One manifest line per game: host, seeds, dump and report paths,
turns recorded, the end, wall time, and the report's pass / fail / skip
counts per check. `summary` folds a manifest's reports into one table.
The game's own logs (Logs/*.csv and CultureBordersLog.txt: the per-draw
RandCalls.csv, the war-weariness and combat ledgers, the AI's build,
policy and research choices, boosts, barbarians, borders) grow across
games or restart with one; the bytes a game wrote to each are copied to
`<dump stem>.logs/` (RandCalls.csv also beside the dump as
`.randcalls.csv`). Each instance writes its own Logs folder (its host's
profile, `game.logs_dir`), so games on several hosts never mix rows.
The instances must already stand at the main menu (`h4.py spawn` / `menu`),
spawned through `game.spawn` so each runs in its host's profile.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import queue
import subprocess
import sys
import threading
import time

HERE = pathlib.Path(__file__).resolve().parent
LAB = HERE.parent
ROOT = LAB.parents[1]
RUNS = LAB / "runs"
PY = sys.executable
sys.path.insert(0, str(LAB))
import game  # noqa: E402


# the AI's behaviour-tree trace runs to 150 MB a game and carries no rule
SKIP_LOGS = {"AI_Behavior_Trees.csv"}


def log_files(host: str) -> list[pathlib.Path]:
    logs = game.logs_dir(host)
    return sorted([f for f in logs.glob("*.csv") if f.name not in SKIP_LOGS] + [logs / "CultureBordersLog.txt"])


def log_sizes(host: str) -> dict[str, int]:
    out = {}
    for f in log_files(host):
        try:
            out[f.name] = f.stat().st_size
        except OSError:
            pass
    return out


def save_slice(src: pathlib.Path, start: int, out: pathlib.Path) -> int:
    """Copy `src`'s bytes past `start` (the game's own) to `out` with the
    file's header; a file that restarted below `start` is copied whole."""
    try:
        data = src.read_bytes()
    except OSError:
        return 0
    head, _, _ = data.partition(b"\n")
    body = data[start:] if len(data) >= start else data
    if body.startswith(head):
        body = body[len(head) + 1:]
    out.write_bytes(head + b"\n" + body)
    return body.count(b"\n")


def save_logs(host: str, starts: dict[str, int], dump: pathlib.Path) -> dict[str, int]:
    """Every log's slice of `host`'s Logs folder to `<dump stem>.logs/`;
    RandCalls.csv also beside the dump."""
    folder = dump.with_suffix(".logs")
    folder.mkdir(exist_ok=True)
    rows = {}
    for f in log_files(host):
        if f.exists():
            rows[f.name] = save_slice(f, starts.get(f.name, 0), folder / f.name)
    if (folder / "RandCalls.csv").exists():
        dump.with_suffix(".randcalls.csv").write_bytes((folder / "RandCalls.csv").read_bytes())
    return rows


def bounded(cmd: list[str], seconds: float, log: pathlib.Path) -> tuple[int, str]:
    """Run `cmd` for at most `seconds`; kill its whole tree past that (rc 124).
    Output appended to `log`; the tail returned."""
    with open(log, "a", encoding="utf-8") as fh:
        fh.write(f"\n$ {' '.join(cmd)}\n")
        fh.flush()
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, cwd=ROOT, text=True,
                                encoding="utf-8", errors="replace")
        try:
            out, _ = proc.communicate(timeout=seconds)
            rc = proc.returncode
        except subprocess.TimeoutExpired:
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True)
            out, _ = proc.communicate()
            rc = 124
        fh.write(out or "")
    return rc, (out or "")[-2000:]


def game_turn(tail: str) -> int | None:
    for ln in reversed(tail.splitlines()):
        if "the game is at turn" in ln:
            return int(ln.rsplit(" ", 1)[-1])
    return None


def play_game(host: str, seed: int, a, stamp: str, lock: threading.Lock) -> dict:
    tag = f"{a.tag}{seed}"
    dump = RUNS / f"h1_{tag}_{stamp}.jsonl"
    log = RUNS / f"h1_fleet_{tag}_{stamp}.log"
    rec: dict = {"host": host, "map_seed": seed, "game_seed": seed + 1000, "config": a.config, "dump": str(dump),
                 "log": str(log), "wall_start": time.time(), "end": None}
    rc, tail = bounded([PY, str(LAB / "h4.py"), "--host", host, "--deadline", str(a.chunk), "menu"], a.chunk + 10, log)
    if rc != 0:
        rec.update(end="crash", why=f"no main menu: {tail[-300:]}")
        return rec
    log_start = log_sizes(host)  # the new game's set-up rows are its own
    rc, tail = bounded([PY, str(LAB / "game.py"), "--host", host, "new", "--config", a.config,
                        "--map-seed", str(seed), "--game-seed", str(seed + 1000), "--wait", str(a.chunk - 10)],
                       a.chunk + 10, log)
    if rc != 0 or "in game" not in tail:
        rec.update(end="crash", why=f"new game failed: {tail[-300:]}")
        return rec
    last, still = 0, 0
    while True:
        rc, tail = bounded([PY, str(HERE / "dump.py"), "--host", host, "--deadline", str(a.chunk), "play",
                            "--out", str(dump), "--turns", str(max(1, a.turns - last))], a.chunk + 20, log)
        now = game_turn(tail)
        if now is None or now <= last:
            still += 1
            if still >= 3:
                rec.update(end="stalled", why=tail[-300:])
                break
        else:
            still, last = 0, now
        if now is not None and now >= a.turns:
            rec["end"] = "target"
            break
        if "GameOver" in tail or "game_over" in tail:
            rec["end"] = "game_over"
            break
    rec["turn"] = last
    bounded([PY, str(LAB / "h4.py"), "--host", host, "--deadline", "30", "lua", "--state", "InGame",
             "Events.ExitToMainMenu()"], 40, log)
    rec["logs"] = save_logs(host, log_start, dump)
    # the game's river and volcano orders beside the dump (`map_orders.py`)
    bounded([PY, str(HERE / "map_orders.py"), str(dump), "--map-seed", str(seed), "--config", a.config], 120, log)
    with lock:  # the report is CPU work; one at a time keeps the box for the games
        rc, tail = bounded(["npx.cmd" if sys.platform == "win32" else "npx", "vite-node", "cpu/harness/run.ts", "--",
                            str(dump)], a.report_timeout, log)
    report = dump.with_suffix(".report.json")
    rec["report"] = str(report) if report.exists() else None
    if report.exists():
        r = json.loads(report.read_text(encoding="utf-8"))
        rec["records"] = r["records"]
        rec["checks"] = {k: {"pass": v["pass"], "fail": v["fail"], "skip": sum(v["skip"].values())}
                         for k, v in r["checks"].items()}
        rec["gaps"] = r["gaps"]
    rec["wall_end"] = time.time()
    return rec


def seeds_of(spec: str) -> list[int]:
    out: list[int] = []
    for part in spec.split(","):
        if "-" in part:
            lo, hi = part.split("-")
            out.extend(range(int(lo), int(hi) + 1))
        elif part.strip():
            out.append(int(part))
    return out


def cmd_run(a) -> int:
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    manifest = RUNS / f"h1_fleet_{a.tag}_{stamp}.jsonl"
    jobs: "queue.Queue[int]" = queue.Queue()
    for s in seeds_of(a.seeds):
        jobs.put(s)
    lock, mlock = threading.Lock(), threading.Lock()

    def worker(host: str) -> None:
        while True:
            try:
                seed = jobs.get_nowait()
            except queue.Empty:
                return
            rec = play_game(host, seed, a, stamp, lock)
            with mlock, open(manifest, "a", encoding="utf-8", newline="\n") as fh:
                fh.write(json.dumps(rec) + "\n")
            print(f"[{host}] seed {seed}: {rec.get('end')} turn {rec.get('turn')} report {rec.get('report')}", flush=True)

    threads = [threading.Thread(target=worker, args=(h.strip(),)) for h in a.hosts.split(",") if h.strip()]
    for th in threads:
        th.start()
    for th in threads:
        th.join()
    print(f"manifest -> {manifest}")
    return 0


def cmd_summary(a) -> int:
    rows = [json.loads(ln) for ln in pathlib.Path(a.manifest).read_text(encoding="utf-8").splitlines() if ln.strip()]
    tot: dict[str, dict[str, int]] = {}
    for r in rows:
        print(f"seed {r['map_seed']}: {r.get('end')} turn {r.get('turn')} records {r.get('records')}")
        for k, v in (r.get("checks") or {}).items():
            t = tot.setdefault(k, {"pass": 0, "fail": 0, "skip": 0})
            for f in t:
                t[f] += v[f]
    print(f"{'check':26s} {'pass':>8s} {'fail':>8s} {'skip':>8s}")
    for k in sorted(tot):
        print(f"{k:26s} {tot[k]['pass']:8d} {tot[k]['fail']:8d} {tot[k]['skip']:8d}")
    return 0


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("run")
    s.add_argument("--hosts", default="127.0.0.2")
    s.add_argument("--seeds", required=True, help="map seeds: a comma list and lo-hi ranges")
    s.add_argument("--turns", type=int, default=250)
    s.add_argument("--config", default=str(HERE / "h1_duel.json"))
    s.add_argument("--tag", default="duel")
    s.add_argument("--chunk", type=float, default=170.0, help="wall seconds per game call")
    s.add_argument("--report-timeout", type=float, default=1800.0)
    s.set_defaults(fn=cmd_run)
    s = sub.add_parser("summary")
    s.add_argument("manifest")
    s.set_defaults(fn=cmd_summary)
    a = p.parse_args(argv)
    return a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
