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
`--aimem` runs the AI memory reader beside each game (`aimem.py watch`,
started before the host loads the game DLL, armed before the first turn):
`<dump stem>.aimem.jsonl`, the manifest's `aimem` its path and last line.

A game's manifest line names what the dump holds (`recorded`, `turns_of`:
`first`, `last` — the run of turns recorded one after the other from the
first —, `missing`, `moved`) beside the turn the game reached (`turn`). Its
`end`: `target`; `game_over` (the seat eliminated or the game ended: the
records stop at `recorded.last`, the game's valid range); `fault` (a turn
was not recorded: `dump.py play`'s exit 3, or a dump at its target with a
turn missing); `stalled`; `crash`. After a `crash` or a `stalled` game the
host's instance is closed and started anew through the spawn path (`h4.py
spawn`, `menu`) and the seed goes back to the queue once, its partial files
deleted (`attempt` 2 on its second line); a host whose instance does not
come back is dropped (an `event` line) and the queue is the other hosts'.
`--runs` names the folder the recordings and the manifest are written to.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import pathlib
import queue
import re
import shutil
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
sys.path.insert(0, str(HERE))
import aimem  # noqa: E402
import aimem_hook  # noqa: E402
import game  # noqa: E402
import logstore  # noqa: E402
import procmem  # noqa: E402
from dump import FAULT  # noqa: E402

# a lab command started from here prints UTF-8, which is how its output is read
ENV = dict(os.environ, PYTHONIOENCODING="utf-8:replace")
# a game's files beside its dump, by suffix (and the folder `<stem>.logs`)
SUFFIXES = (".jsonl", ".aimem.jsonl", ".aiunits.jsonl", ".cat.json", ".orders.json", ".randcalls.csv", ".logs.sqlite")
# a record's head: `dump.py` writes these three keys first
HEAD = re.compile(rb'\{"turnBefore":(-?\d+),"turnAfter":(-?\d+),"moved":(true|false)')


def stdio_utf8() -> None:
    """this process prints UTF-8 whatever the console's or the pipe's code
    page, a character with no encoding replaced"""
    for stream in (sys.stdout, sys.stderr):
        stream.reconfigure(encoding="utf-8", errors="replace")


def stem_file(dump: pathlib.Path, suffix: str) -> pathlib.Path:
    return dump if suffix == ".jsonl" else dump.with_suffix("").with_suffix(suffix)


def turns_of(dump: pathlib.Path) -> dict:
    """The turns a dump holds, read from each record's head: `records` (the
    records whose counter stood), `first`, `last` (the end of the run of
    turns recorded one after the other from the first), `missing` (the turns
    between the lowest and the highest with no record), `moved` (the records
    whose counter moved under them), `repeated` (records of a turn already
    held) and `unread` (lines that open with no record's head)."""
    turns: list[int] = []
    out: dict = {"records": 0, "first": None, "last": None, "missing": [], "moved": [], "repeated": 0, "unread": 0}
    try:
        with open(dump, "rb") as fh:
            for ln in fh:
                if not ln.strip():
                    continue
                m = HEAD.match(ln[:96])
                if m is None:
                    out["unread"] += 1
                elif m.group(3) == b"true":
                    out["moved"].append(int(m.group(1)))
                else:
                    turns.append(int(m.group(1)))
    except OSError:
        return out
    if turns:
        have = set(turns)
        last = turns[0]
        while last + 1 in have:
            last += 1
        out.update(records=len(turns), first=turns[0], last=last, repeated=len(turns) - len(have),
                   missing=[t for t in range(min(have), max(have) + 1) if t not in have])
    return out


def gapless(t: dict) -> bool:
    """a dump's turns (`turns_of`) run from its first record to its last with
    none missing, moved, repeated or unread"""
    return bool(t["records"]) and not (t["missing"] or t["moved"] or t["repeated"] or t["unread"])


def clear(dump: pathlib.Path) -> None:
    """a game's files deleted: the dump, the streams, the logs"""
    for suf in SUFFIXES:
        stem_file(dump, suf).unlink(missing_ok=True)
    shutil.rmtree(dump.with_suffix(".logs"), ignore_errors=True)


# the AI's behaviour-tree trace runs to 150 MB a game and carries no rule
SKIP_LOGS = {"AI_Behavior_Trees.csv"}
# the game's .log files a recording keeps beside its CSVs: every unit
# operation added or refused (UnitOperations.log), every unit path search
# with its goal, flags and checksum (AStar_GC.log) — both with a header
# line — and, with no header, the game core's own log
LOG_FILES = {"UnitOperations.log": True, "AStar_GC.log": True, "GameCore.log": False}


def log_files(host: str) -> list[pathlib.Path]:
    logs = game.logs_dir(host)
    return sorted([f for f in logs.glob("*.csv") if f.name not in SKIP_LOGS] + [logs / "CultureBordersLog.txt"]
                  + [logs / name for name in LOG_FILES])


def log_sizes(host: str) -> dict[str, int]:
    out = {}
    for f in log_files(host):
        try:
            out[f.name] = f.stat().st_size
        except OSError:
            pass
    return out


def save_slice(src: pathlib.Path, start: int, out: pathlib.Path, header: bool = True) -> int:
    """Copy `src`'s bytes past `start` (the game's own) to `out` with the
    file's header (`header`: its first line is one); a file that restarted
    below `start` is copied whole."""
    try:
        data = src.read_bytes()
    except OSError:
        return 0
    body = data[start:] if len(data) >= start else data
    if not header:
        out.write_bytes(body)
        return body.count(b"\n")
    head, _, _ = data.partition(b"\n")
    if body.startswith(head):
        body = body[len(head) + 1:]
    out.write_bytes(head + b"\n" + body)
    return body.count(b"\n")


def save_logs(host: str, starts: dict[str, int], dump: pathlib.Path) -> dict[str, int]:
    """Every log's slice of `host`'s Logs folder to `<dump stem>.logs/`;
    RandCalls.csv also beside the dump; then the logs' SQLite store
    `<dump stem>.logs.sqlite` (logstore.py)."""
    folder = dump.with_suffix(".logs")
    folder.mkdir(exist_ok=True)
    rows = {}
    for f in log_files(host):
        if f.exists():
            rows[f.name] = save_slice(f, starts.get(f.name, 0), folder / f.name, LOG_FILES.get(f.name, True))
    if (folder / "RandCalls.csv").exists():
        dump.with_suffix(".randcalls.csv").write_bytes((folder / "RandCalls.csv").read_bytes())
    logstore.build(str(dump))
    return rows


def bounded(cmd: list[str], seconds: float, log: pathlib.Path) -> tuple[int, str]:
    """Run `cmd` for at most `seconds`; kill its whole tree past that (rc 124).
    Output appended to `log`; the tail returned."""
    with open(log, "a", encoding="utf-8") as fh:
        fh.write(f"\n$ {' '.join(cmd)}\n")
        fh.flush()
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, cwd=ROOT, text=True,
                                encoding="utf-8", errors="replace", env=ENV)
        try:
            out, _ = proc.communicate(timeout=seconds)
            rc = proc.returncode
        except subprocess.TimeoutExpired:
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True)
            out, _ = proc.communicate()
            rc = 124
        fh.write(out or "")
    return rc, (out or "")[-2000:]


class MemoryWatch:
    """The AI memory reader beside one game (`aimem.py watch`): started
    before the game is hosted, it arms the DLL the host loads, so its hooks
    stand before the first turn (`wait_armed`); `stop` closes the gate
    through the stop file and returns the reader's last line."""

    def __init__(self, host: str, out: pathlib.Path, log: pathlib.Path, units: pathlib.Path | None = None,
                 plan_from: int = 0):
        self.out, self.stopfile = out, out.with_suffix(out.suffix + ".stop")
        self.units = units
        self.stopfile.unlink(missing_ok=True)
        self.lines: list[str] = []
        cmd = [PY, str(LAB / "aimem.py"), "--host", host, "watch", "--out", str(out)]
        if units is not None:
            cmd += ["--units", str(units), "--plan-from", str(plan_from)]
        self.proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, cwd=ROOT, text=True,
                                     encoding="utf-8", errors="replace", env=ENV)
        self.log = log
        threading.Thread(target=self._read, daemon=True).start()

    def _read(self) -> None:
        for ln in self.proc.stdout:
            self.lines.append(ln.rstrip())
            with open(self.log, "a", encoding="utf-8") as fh:
                fh.write(f"[aimem] {ln}")

    def wait_armed(self, host: str, limit: float = 60.0) -> bool:
        """the game's DLL (loaded afresh by the host) carries the hooks and an
        open gate"""
        t0 = time.monotonic()
        pm = None
        while time.monotonic() - t0 < limit:
            try:
                pm = pm or procmem.ProcMem.of_host(host)
                base = pm.module(aimem.DLL)
                if base and pm.u32(base + aimem_hook.MAIL + aimem_hook.GATE) == 1 \
                        and pm.read(base + aimem_hook.SITES[0][1], 5) != aimem_hook.SITES[0][2]:
                    return True
            except procmem.MemError:
                pm = None
            time.sleep(0.2)
        return False

    def stop(self, wait: float = 60.0) -> str:
        self.stopfile.touch()
        try:
            self.proc.wait(timeout=wait)
        except subprocess.TimeoutExpired:
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(self.proc.pid)], capture_output=True)
        self.stopfile.unlink(missing_ok=True)
        return self.lines[-1] if self.lines else ""


def game_turn(tail: str) -> int | None:
    for ln in reversed(tail.splitlines()):
        if "the game is at turn" in ln:
            return int(ln.rsplit(" ", 1)[-1])
    return None


def play_game(host: str, seed: int, a, stamp: str, lock: threading.Lock, attempt: int = 1) -> dict:
    tag = f"{a.tag}{seed}"
    dump = a.runs / f"h1_{tag}_{stamp}.jsonl"
    log = a.runs / f"h1_fleet_{tag}_{stamp}.log"
    rec: dict = {"host": host, "map_seed": seed, "game_seed": seed + 1000, "config": a.config, "dump": str(dump),
                 "log": str(log), "wall_start": time.time(), "end": None, "attempt": attempt}
    # a seed played again starts from no file: `dump.py play` carries on from a dump's last record
    clear(dump)
    if not game.instance_pids(host):
        rec.update(end="crash", why=f"no instance: no CivilizationVI process carries -TunerIP {host}",
                   wall_end=time.time())
        return rec
    rc, tail = bounded([PY, str(LAB / "h4.py"), "--host", host, "--deadline", str(a.chunk), "menu"], a.chunk + 10, log)
    if rc != 0:
        rec.update(end="crash", why=f"no main menu: {tail[-300:]}", wall_end=time.time())
        return rec
    log_start = log_sizes(host)  # the new game's set-up rows are its own
    mem = MemoryWatch(host, dump.with_suffix(".aimem.jsonl"), log, dump.with_suffix(".aiunits.jsonl"),
                      a.majors) if a.aimem else None
    rc, tail = bounded([PY, str(LAB / "game.py"), "--host", host, "new", "--config", a.config,
                        "--map-seed", str(seed), "--game-seed", str(seed + 1000), "--wait", str(a.chunk - 10)],
                       a.chunk + 10, log)
    if rc != 0 or "in game" not in tail:
        if mem:
            mem.stop()
        rec.update(end="crash", why=f"new game failed: {tail[-300:]}", wall_end=time.time())
        return rec
    if mem and not mem.wait_armed(host):
        rec["aimem"] = {"armed": False}
    last, still = 0, 0
    while True:
        rc, tail = bounded([PY, str(HERE / "dump.py"), "--host", host, "--deadline", str(a.chunk), "play",
                            "--out", str(dump), "--turns", str(max(1, a.turns - last))], a.chunk + 20, log)
        if rc == FAULT:
            rec.update(end="fault", why=next((ln for ln in reversed(tail.splitlines()) if ln.startswith("fault:")), tail[-300:]))
            break
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
    # what the dump holds: the game's valid range ends at `recorded.last`
    rec["recorded"] = turns_of(dump)
    if rec["end"] == "target" and not (gapless(rec["recorded"]) and rec["recorded"]["last"] >= a.turns):
        rec.update(end="fault", why=f"the dump at its target holds turns {rec['recorded']['first']}..{rec['recorded']['last']},"
                                    f" missing {rec['recorded']['missing'][:8]}, moved {rec['recorded']['moved'][:8]}")
    if mem:
        rec["aimem"] = {**rec.get("aimem", {}), "path": str(mem.out), "units": str(mem.units), "end": mem.stop()}
    bounded([PY, str(LAB / "h4.py"), "--host", host, "--deadline", "30", "lua", "--state", "InGame",
             "Events.ExitToMainMenu()"], 40, log)
    if not rec["recorded"]["records"]:
        rec["wall_end"] = time.time()
        return rec
    rec["logs"] = save_logs(host, log_start, dump)
    # the game's river and volcano orders beside the dump (`map_orders.py`)
    bounded([PY, str(HERE / "map_orders.py"), str(dump), "--map-seed", str(seed), "--config", a.config], 120, log)
    if a.no_report:
        rec["wall_end"] = time.time()
        return rec
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


def respawn(host: str, log: pathlib.Path, menu: float = 230.0) -> bool:
    """`host`'s instance closed and started anew through the spawn path
    (`h4.py spawn`: `game.spawn` in the host's profile), up to the main menu"""
    game.close_instance(host)
    bounded([PY, str(LAB / "h4.py"), "--host", host, "spawn"], 60, log)
    rc, _ = bounded([PY, str(LAB / "h4.py"), "--host", host, "--deadline", str(menu), "menu"], menu + 20, log)
    return rc == 0


def seeds_of(spec: str) -> list[int]:
    out: list[int] = []
    for part in spec.split(","):
        if "-" in part:
            lo, hi = part.split("-")
            out.extend(range(int(lo), int(hi) + 1))
        elif part.strip():
            out.append(int(part))
    return out


# the ends after which a host's instance is started anew and the seed played once more
DEAD = ("crash", "stalled")


def run_queue(hosts: list[str], seeds: list[int], play, spawn, close, line, idle: float = 5.0) -> None:
    """The fleet's loop: each host takes the next seed (`play(host, seed,
    attempt)` returns the game's manifest line, written by `line`). After a
    game that ends `crash` or `stalled` the host's instance is started anew
    (`spawn(host, seed)`) and the seed, at its first attempt, is played
    again there; a host whose instance does not come back is dropped, its
    seed back in the queue for the others. A host with no seed left has its
    instance closed (`close`) and waits while another host plays, for a
    seed a dropped host may hand back; it starts its instance anew to take
    one."""
    jobs: "queue.Queue[int]" = queue.Queue()
    for s in seeds:
        jobs.put(s)
    lock = threading.Lock()
    playing: set[str] = set()
    attempts: dict[int, int] = {}

    def worker(host: str) -> None:
        up = True
        while True:
            with lock:
                try:
                    seed = jobs.get_nowait()
                    playing.add(host)
                    attempts[seed] = attempts.get(seed, 0) + 1
                except queue.Empty:
                    seed = None
                    others = bool(playing - {host})
            if seed is None:
                if up:
                    close(host)
                    up = False
                if not others:
                    return
                time.sleep(idle)
                continue
            if not up:
                up = spawn(host, seed)
            while up:
                rec = play(host, seed, attempts[seed])
                line(rec)
                if rec.get("end") not in DEAD:
                    break
                up = spawn(host, seed)
                if attempts[seed] >= 2:
                    seed = None
                    break
                if up:
                    attempts[seed] += 1
            if not up:
                # dropped: the seed it holds goes back to the queue before the host leaves the players
                line({"host": host, "event": "dropped", "seed": seed, "wall": time.time(),
                      "why": "the instance did not come back to the main menu"})
                if seed is not None:
                    jobs.put(seed)
                with lock:
                    playing.discard(host)
                return
            with lock:
                playing.discard(host)

    threads = [threading.Thread(target=worker, args=(h,)) for h in hosts]
    for th in threads:
        th.start()
    for th in threads:
        th.join()


def cmd_run(a) -> int:
    stamp = a.stamp or dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    a.runs.mkdir(parents=True, exist_ok=True)
    manifest = a.runs / f"h1_fleet_{a.tag}_{stamp}.jsonl"
    lock, mlock = threading.Lock(), threading.Lock()

    def line(rec: dict) -> None:
        with mlock, open(manifest, "a", encoding="utf-8", newline="\n") as fh:
            fh.write(json.dumps(rec) + "\n")
        if "event" in rec:
            print(f"[{rec['host']}] {rec['event']}: {rec.get('why', '')} (seed {rec.get('seed')})", flush=True)
        else:
            got = rec.get("recorded") or {}
            print(f"[{rec['host']}] seed {rec['map_seed']} attempt {rec['attempt']}: {rec.get('end')} turn {rec.get('turn')}"
                  f" recorded {got.get('first')}..{got.get('last')} report {rec.get('report')}", flush=True)

    def spawn(host: str, seed: int) -> bool:
        ok = respawn(host, a.runs / f"h1_fleet_{a.tag}{seed}_{stamp}.log")
        line({"host": host, "event": "respawn", "seed": seed, "ok": ok, "wall": time.time(),
              "why": "the instance started anew" if ok else "no main menu after the spawn"})
        return ok

    def close(host: str) -> None:
        # no seed left for this host: its instance closes now, not when the last host is done
        if not a.keep_open:
            print(f"[{host}] queue empty, closed {game.close_instance(host)}", flush=True)

    def play(host: str, seed: int, attempt: int) -> dict:
        try:
            return play_game(host, seed, a, stamp, lock, attempt)
        except Exception as e:  # noqa: BLE001 — the queue goes on whatever a game's calls raised
            return {"host": host, "map_seed": seed, "attempt": attempt, "end": "crash", "wall_end": time.time(),
                    "dump": str(a.runs / f"h1_{a.tag}{seed}_{stamp}.jsonl"), "why": f"{type(e).__name__}: {e}"}

    run_queue([h.strip() for h in a.hosts.split(",") if h.strip()], seeds_of(a.seeds), play, spawn, close, line)
    print(f"manifest -> {manifest}")
    return 0


def cmd_summary(a) -> int:
    rows = [json.loads(ln) for ln in pathlib.Path(a.manifest).read_text(encoding="utf-8").splitlines() if ln.strip()]
    tot: dict[str, dict[str, int]] = {}
    for r in rows:
        if "event" in r:
            print(f"host {r['host']}: {r['event']} (seed {r.get('seed')}) {r.get('why', '')}")
            continue
        got = r.get("recorded") or {}
        print(f"seed {r['map_seed']}: {r.get('end')} turn {r.get('turn')} recorded {got.get('first')}..{got.get('last')}"
              f" records {r.get('records')}")
        for k, v in (r.get("checks") or {}).items():
            t = tot.setdefault(k, {"pass": 0, "fail": 0, "skip": 0})
            for f in t:
                t[f] += v[f]
    print(f"{'check':26s} {'pass':>8s} {'fail':>8s} {'skip':>8s}")
    for k in sorted(tot):
        print(f"{k:26s} {tot[k]['pass']:8d} {tot[k]['fail']:8d} {tot[k]['skip']:8d}")
    return 0


def main(argv=None) -> int:
    stdio_utf8()
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
    s.add_argument("--keep-open", action="store_true", help="leave each instance running when its queue empties")
    s.add_argument("--aimem", action="store_true",
                   help="read the AI memory at the logs' moments beside each game (aimem.py, <dump stem>.aimem.jsonl"
                        " and the units' stream <dump stem>.aiunits.jsonl)")
    s.add_argument("--majors", type=int, default=2,
                   help="the config's major players (ids 0..n-1): the units' stream leaves their plannings out")
    s.add_argument("--no-report", action="store_true", help="record only: no engine report over the dump")
    s.add_argument("--stamp", help="the run's stamp in its file names (default: now, UTC)")
    s.add_argument("--runs", type=pathlib.Path, default=RUNS, help="the folder the recordings and the manifest go to")
    s.set_defaults(fn=cmd_run)
    s = sub.add_parser("summary")
    s.add_argument("manifest")
    s.set_defaults(fn=cmd_summary)
    a = p.parse_args(argv)
    if a.cmd == "run":
        a.runs = a.runs.resolve()
    return a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
