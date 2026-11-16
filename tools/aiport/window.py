"""WINDOW: one seed's turn window scored under a worktree, kept under a tag,
compared with an earlier tag's window or with the bar's rows of those turns.

    python tools/aiport/window.py <worktree> <seed> <from> <to> <tag> [--vs <tag>|bar|<dir>|none] [--trace SPEC]... [--rows [N]]
    python tools/aiport/window.py <worktree> --status
    python tools/aiport/window.py <worktree> --unlock

Runs, with the worktree's own launcher and AISCORE_MISSES=1:

    node <wt>/cpu/harness/bundled.mjs <wt>/cpu/harness/run.ts -- <dump> --aiscore <out> --memory aimem --from <from> --to <to>

(`--from` left out for a window from turn 1), the dump the seed's recording
in the main checkout. It scores the turns <from> .. <to>-1. Output, the
layout of a bar directory, so every aiport tool reads it:

    <wt>/.claude/scratchpad/win/<tag>/ai<seed>.log    the run's output: the SCORE rows and the TRACE lines
    <wt>/.claude/scratchpad/win/<tag>/ai<seed>.json   the harness's report
    <wt>/.claude/scratchpad/win/<tag>/ai<seed>.md
    <wt>/.claude/scratchpad/win/<tag>/ai<seed>.meta.json   the window, the tree's head and the size of its diff, seconds, rc

A tag names one state of the tree (`base`, `a1`, ...) and holds one window
a seed: the same tag and seed run again replaces it.

ONE scoring run a worktree at a time: `win/.lock` holds the running
window's process ids, and a second start is REFUSED while either lives. One
seed a run. A window longer than 120 turns is refused (--span lifts it for
a task that names one).

Then the compare (`rows.py --cmp`): against `--vs <tag>` (that tag's window
of the seed), or by default against the newest bar holding the seed, cut to
the window's turns. Against a bar, the rows the window's FIRST TWO turns
newly miss are counted apart: a mid-game window opens on the record and the
game's memory alone, without what our own turns before it carried (the
README's "what a window lacks"), so compare a change with a window of the
base tree, not with the bar, wherever those rows matter.
"""
from __future__ import annotations

import argparse
import ctypes
import json
import os
import pathlib
import subprocess
import sys
import time

import common

MAX_SPAN = 120


def alive(pid: int) -> bool:
    if pid <= 0:
        return False
    if os.name == "nt":
        k = ctypes.windll.kernel32
        h = k.OpenProcess(0x1000, False, pid)
        if not h:
            return False
        code = ctypes.c_ulong()
        ok = k.GetExitCodeProcess(h, ctypes.byref(code))
        k.CloseHandle(h)
        return bool(ok) and code.value == 259
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


def holder(lock: pathlib.Path) -> dict | None:
    """the live run the lock names, None where there is none (a dead run's
    lock is removed)"""
    try:
        d = json.loads(lock.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        d = None
    if d and any(alive(int(p)) for p in d.get("pids", [])):
        return d
    lock.unlink(missing_ok=True)
    return None


def take(lock: pathlib.Path, what: dict) -> None:
    """the lock taken, or the run refused"""
    lock.parent.mkdir(parents=True, exist_ok=True)
    for _ in range(2):
        try:
            fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        except FileExistsError:
            d = holder(lock)
            if d:
                raise SystemExit(f"REFUSED: a window run of this worktree is alive (seed {d.get('seed')} t{d.get('from')}-{d.get('to')} tag "
                                 f"{d.get('tag')}, pids {d.get('pids')}, started {d.get('started')}). One scoring run at a time: wait for it, "
                                 f"or stop it and `window.py <worktree> --unlock`.") from None
            continue
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(what, f)
        return
    raise SystemExit(f"REFUSED: cannot take {lock}")


def git(wt: pathlib.Path, *args: str) -> str:
    try:
        return subprocess.run(["git", "-C", str(wt), *args], capture_output=True, text=True, encoding="utf-8", errors="replace", check=False).stdout.strip()
    except OSError:
        return ""


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("worktree")
    ap.add_argument("seed", nargs="?")
    ap.add_argument("turn_from", nargs="?", type=int, metavar="from")
    ap.add_argument("turn_to", nargs="?", type=int, metavar="to")
    ap.add_argument("tag", nargs="?")
    ap.add_argument("--vs", default="bar")
    ap.add_argument("--trace", action="append", default=[], metavar="KIND:TURN[:TEXT]")
    ap.add_argument("--rows", nargs="?", type=int, const=0, default=None, metavar="N")
    ap.add_argument("--span", action="store_true", help="allow a window longer than 120 turns")
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--unlock", action="store_true")
    a = ap.parse_args()
    common.utf8()
    wt = pathlib.Path(a.worktree).resolve()
    win = wt / ".claude" / "scratchpad" / "win"
    lock = win / ".lock"
    if a.status or a.unlock:
        d = holder(lock) if lock.exists() else None
        if a.unlock and d:
            raise SystemExit(f"its run is alive (pids {d['pids']}): stop it first")
        print(f"running: seed {d['seed']} t{d['from']}-{d['to']} tag {d['tag']} pids {d['pids']} since {d['started']}" if d else "no window run alive")
        return 0
    if not (a.seed and a.turn_from is not None and a.turn_to is not None and a.tag):
        ap.error("window.py <worktree> <seed> <from> <to> <tag>")
    if not a.seed.isdigit():
        raise SystemExit(f"REFUSED: one seed a run, a number ({a.seed})")
    if not a.tag.replace("_", "").replace("-", "").replace(".", "").isalnum():
        raise SystemExit(f"tag {a.tag}: letters, digits, _ - . only")
    if a.turn_to <= a.turn_from:
        raise SystemExit("the window scores the turns <from> .. <to>-1: <to> must be above <from>")
    if a.turn_to - a.turn_from > MAX_SPAN and not a.span:
        raise SystemExit(f"REFUSED: {a.turn_to - a.turn_from} turns. Windows only (the bar measures whole games); --span for a task that names a longer one")
    launcher, entry = wt / "cpu" / "harness" / "bundled.mjs", wt / "cpu" / "harness" / "run.ts"
    if not launcher.exists() or not entry.exists():
        raise SystemExit(f"{wt}: no cpu/harness/bundled.mjs or run.ts (not a worktree of this project?)")
    files = common.files_of(a.seed)
    if not files["dump"].exists():
        raise SystemExit(f"no dump {files['dump']}")
    out = win / a.tag
    out.mkdir(parents=True, exist_ok=True)
    stem = out / f"ai{a.seed}"
    cmd = ["node", str(launcher), str(entry), "--", str(files["dump"]), "--aiscore", str(stem), "--memory", "aimem"]
    if a.turn_from > 1:
        cmd += ["--from", str(a.turn_from)]
    cmd += ["--to", str(a.turn_to)]
    for t in a.trace:
        cmd += ["--trace", t]
    started = time.strftime("%Y-%m-%dT%H:%M:%S")
    what = {"pids": [os.getpid()], "seed": a.seed, "from": a.turn_from, "to": a.turn_to, "tag": a.tag, "started": started}
    take(lock, what)
    t0 = time.time()
    rc = -1
    try:
        for suf in (".json", ".md"):
            stem.with_name(stem.name + suf).unlink(missing_ok=True)
        with open(stem.with_name(stem.name + ".log"), "w", encoding="utf-8", newline="\n") as log:
            p = subprocess.Popen(cmd, stdout=log, stderr=subprocess.STDOUT, env={**os.environ, "AISCORE_MISSES": "1"})
            what["pids"].append(p.pid)
            lock.write_text(json.dumps(what), encoding="utf-8")
            try:
                rc = p.wait()
            except BaseException:
                p.kill()
                raise
    finally:
        lock.unlink(missing_ok=True)
    secs = round(time.time() - t0)
    diff = git(wt, "diff", "--shortstat", "HEAD")
    meta = {"seed": a.seed, "from": a.turn_from, "to": a.turn_to, "tag": a.tag, "stem": files["stem"], "head": git(wt, "rev-parse", "--short", "HEAD"),
            "diff": diff or "clean", "trace": a.trace, "started": started, "seconds": secs, "rc": rc, "cmd": " ".join(cmd)}
    stem.with_name(stem.name + ".meta.json").write_text(json.dumps(meta, indent=1) + "\n", encoding="utf-8")
    log_path = stem.with_name(stem.name + ".log")
    rows = common.read_rows(str(log_path))
    done = stem.with_name(stem.name + ".json").exists()
    print(f"window {a.seed} t{a.turn_from}-{a.turn_to} tag {a.tag}: rc={rc} {secs}s, {len(rows)} missed rows, head {meta['head']} ({meta['diff']}) -> {out}")
    if rc != 0 or not done:
        tail = log_path.read_text(encoding="utf-8", errors="replace").splitlines()[-12:]
        print("the run FAILED; the log's tail:\n  " + "\n  ".join(l[:300] for l in tail))
        return 1
    stopped = json.loads(stem.with_name(stem.name + ".json").read_text(encoding="utf-8")).get("stopped")
    if stopped:
        print(f"the harness stopped: {stopped}")
    traces = [l.rstrip("\n") for l in open(log_path, encoding="utf-8", errors="replace") if l.startswith("TRACE ")]
    if a.trace:
        print(f"-- trace ({len(traces)} lines; all in {log_path.name})")
        for l in traces[:60]:
            print(l[:600])
        if len(traces) > 60:
            print(f'... {len(traces) - 60} more TRACE lines in {log_path}')
    if a.vs == "none":
        return 0
    if a.vs == "bar":
        bar = common.newest_bar(a.seed)
        if not bar:
            print("no bar holds the seed: nothing to compare with")
            return 0
        other, is_bar = str(bar), True
    else:
        d = win / a.vs
        other, is_bar = (str(d) if d.is_dir() else a.vs), not d.is_dir() and "aiscore" in a.vs.replace("\\", "/")
        if not pathlib.Path(other).exists():
            raise SystemExit(f"--vs {a.vs}: no such tag under {win} and no such directory")
    print(f"-- against {other} (A) -> this window (B), seed {a.seed}")
    sys.stdout.flush()
    rows_cmd = [sys.executable, "-X", "utf8", str(common.HERE / "rows.py"), other, "--cmp", str(out), "--seed", a.seed, "--all"]
    if a.rows is not None:
        rows_cmd += ["--rows"] + ([str(a.rows)] if a.rows else [])
    subprocess.run(rows_cmd, check=False)
    if is_bar:
        base = {r.line for r in common.read_rows(other) if r.seed == a.seed}
        early = [r for r in rows if r.turn < a.turn_from + 2 and r.line not in base]
        late = [r for r in rows if r.turn >= a.turn_from + 2 and r.line not in base]
        if a.turn_from > 1:
            print(f"new against the bar: {len(early)} in the window's first two turns (t{a.turn_from}-{a.turn_from + 1}: the start state's, see the README), "
                  f"{len(late)} later")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
