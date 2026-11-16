"""WINDOW: one seed's turn window scored under a worktree, kept under a tag,
compared with an earlier tag's window or with the bar's rows of those turns.

    python tools/aiport/window.py <worktree> <seed> <from> <to> <tag> [--vs <tag>|bar|<dir>|none] [--trace SPEC]... [--rows [N]]
                                  [--no-state | --state <dir>] [--warm N]
    python tools/aiport/window.py <worktree> --status
    python tools/aiport/window.py <worktree> --unlock

Runs, with the worktree's own launcher and AISCORE_MISSES=1:

    node <wt>/cpu/harness/bundled.mjs <wt>/cpu/harness/run.ts -- <dump> --aiscore <out> --memory aimem --from <from> --to <to> --load-state <dir>

(`--from` left out for a window from turn 1), the dump the seed's recording
in the main checkout. It scores the turns <from> .. <to>-1.

THE BAR is the newest aimem bar holding the seed that ran at a commit of the
worktree's own history (`bar_of`; its `BAR:` lines name it, every newer bar
it passed over and the commits of that bar the tree lacks). A bar run at a
head the tree does not hold is another tree's: its rows differ from the
window's by those commits, and its saves carry what their code built. Where
no bar ran in the tree's history the newest is taken, and the line says so.

THE WINDOW RESUMES FROM THE BAR'S SAVED STATE: that bar's saves of the seed
(`.claude/scratchpad/aiscore/p<N>m/state/`, one as every tenth turn closes;
`--state <dir>` names another directory, `--no-state` none).
The harness takes the newest save closing a turn at or before <from>-1
(`--warm N`: <from>-1-N), runs the turns between unscored and scores from
<from> on what a whole-game run carries there. The tool prints the save it
resumed from, or why it resumed from none (the window then opens on the
record and the game's memory alone, as `--no-state`), and how the tree
differs from the tree that wrote the save.

Output, the layout of a bar directory, so every aiport tool reads it:

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
of the seed), or by default against the bar, cut to the window's turns;
`--vs <a bar's directory>` names another, and a `BAR:` line says where that
bar ran at a head the tree lacks. A window that resumed from no save opens without what
our own turns before it carried: against a bar, the rows its FIRST TWO turns
newly miss are counted apart (the README's "A window without a save").
"""
from __future__ import annotations

import argparse
import ctypes
import json
import os
import pathlib
import re
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


def held(wt: pathlib.Path, sha: str | None) -> bool:
    """whether the commit is the worktree's head or one of its history"""
    if not sha:
        return False
    try:
        return subprocess.run(["git", "-C", str(wt), "merge-base", "--is-ancestor", sha, "HEAD"], capture_output=True, check=False).returncode == 0
    except OSError:
        return False


def lacked(wt: pathlib.Path, sha: str | None) -> str:
    """the commits of `sha`'s history the worktree's head does not hold,
    counted and named"""
    if not sha:
        return "at a head it does not name"
    shas = git(wt, "log", "--format=%h", f"HEAD..{sha}").split()
    if not shas:
        return f"at {sha[:8]}, a commit this worktree does not know"
    return f"at {sha[:8]}, {len(shas)} commit{'s' if len(shas) > 1 else ''} this tree does not hold ({', '.join(shas[:6])}{' ...' if len(shas) > 6 else ''})"


def bar_of(wt: pathlib.Path, seed: str) -> tuple[pathlib.Path | None, list[str]]:
    """the bar a window of the worktree resumes from and is compared with,
    and the lines that say so: the newest bar holding the seed that ran at
    the tree's head or a commit of its history. A newer bar ran at a head
    the tree lacks: the rows those commits closed are in the window and not
    in that bar. Where no bar ran in the tree's history the newest is taken."""
    said: list[str] = []
    found = common.bars(seed)
    for bar in found:
        sha = common.bar_head(bar, seed)
        if held(wt, sha):
            return bar, said + [f"BAR: {bar.name} ran at {str(sha)[:8]}, in this tree's history: the window resumes from its saves and is compared with its rows"]
        said.append(f"BAR: {bar.name} NOT TAKEN: it ran {lacked(wt, sha)}; a row one of those closed is still this tree's, and its saves carry "
                    f"what their code built")
    if not found:
        return None, []
    return found[0], [f"BAR: no bar holding seed {seed} ran in this tree's history. {found[0].name} TAKEN, which ran {lacked(wt, common.bar_head(found[0], seed))}: "
                      f"against it the rows those commits closed show as NEW and the rows they opened as GONE, and neither is the window's own"]


def tree_against_save(wt: pathlib.Path, save: str, turn: int) -> str:
    """how the worktree's cpu/ stands against the tree that wrote the save:
    the turns to the save's ran under that tree's code, the turns after it
    run under the worktree's"""
    head = common.save_head(save) or {}
    sha = str(head.get("sha", "unknown"))
    was = f"the save's tree {sha[:8]}" + (f" (+{head['dirty']} files changed under cpu/)" if head.get("dirty") else "")
    if not git(wt, "cat-file", "-t", sha):
        return f"STATE: {was} is not a commit this worktree knows: what its code carried to t{turn} cannot be told from yours"
    if not held(wt, sha):
        return (f"STATE: the save was written {lacked(wt, sha)}. The turns to t{turn} ran under code this tree lacks and the turns from "
                f"t{turn + 1} under yours: the window is neither tree's whole game (resume from a bar of this tree's history, or --no-state)")
    files = [f for f in git(wt, "diff", "--name-only", sha, "--", "cpu").splitlines() if f]
    files += [f for f in git(wt, "ls-files", "--others", "--exclude-standard", "--", "cpu").splitlines() if f]
    if not files and not head.get("dirty"):
        return f"STATE: this tree's cpu/ is {was}'s: the window scores what a whole-game run of this tree scores on these turns"
    base = git(wt, "merge-base", sha, "HEAD")
    names = ", ".join(pathlib.PurePosixPath(f).name for f in files[:8]) + (f" and {len(files) - 8} more" if len(files) > 8 else "")
    return (f"STATE: this tree's cpu/ differs from {was} in {len(files)} files ({names}; merge-base {base[:8] or 'none'}). The turns to t{turn} "
            f"ran under the save's code, the turns from t{turn + 1} under yours: a change to what the engine CARRIES across turns shows "
            f"only as far as it builds up after t{turn} (the README's \"A save from another tree\"; --warm N resumes N turns earlier)")


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
    ap.add_argument("--no-state", action="store_true", help="open on the record and the game's memory alone")
    ap.add_argument("--state", metavar="DIR", help="the saves to resume from (default: the bar's of the seed)")
    ap.add_argument("--warm", type=int, default=0, metavar="N", help="resume from a save closing a turn at or before <from>-1-N")
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
    resumes = a.turn_from > 1 and not a.no_state
    bar, bar_said = bar_of(wt, a.seed) if (resumes and not a.state) or a.vs == "bar" else (None, [])
    saves = None
    if resumes:
        saves = pathlib.Path(a.state).resolve() if a.state else bar / "state" if bar and common.bar_saves(bar, a.seed) else None
        if saves:
            cmd += ["--load-state", str(saves)] + (["--warm", str(a.warm)] if a.warm else [])
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
    log_path = stem.with_name(stem.name + ".log")
    said = [l.rstrip("\n") for l in open(log_path, encoding="utf-8", errors="replace") if l.startswith("STATE: ")]
    m = re.match(r"STATE: RESUMED from (.+?) \(seed \d+, turn (\d+) closed", said[-1]) if said else None
    meta["state"] = {"dir": str(saves) if saves else None, "save": m.group(1) if m else None, "turn": int(m.group(2)) if m else None}
    stem.with_name(stem.name + ".meta.json").write_text(json.dumps(meta, indent=1) + "\n", encoding="utf-8")
    rows = common.read_rows(str(log_path))
    done = stem.with_name(stem.name + ".json").exists()
    print(f"window {a.seed} t{a.turn_from}-{a.turn_to} tag {a.tag}: rc={rc} {secs}s, {len(rows)} missed rows, head {meta['head']} ({meta['diff']}) -> {out}")
    for l in bar_said:
        print(l)
    if rc != 0 or not done:
        tail = log_path.read_text(encoding="utf-8", errors="replace").splitlines()[-12:]
        print("the run FAILED; the log's tail:\n  " + "\n  ".join(l[:300] for l in tail))
        return 1
    stopped = json.loads(stem.with_name(stem.name + ".json").read_text(encoding="utf-8")).get("stopped")
    if stopped:
        print(f"the harness stopped: {stopped}")
    resumed = m is not None
    if a.turn_from > 1:
        for l in said:
            print(l[:700])
        if a.no_state:
            print("STATE: --no-state: the window opens on the record and the game's memory alone")
        elif not saves:
            print(f"STATE: NO RESUME ({f'the bar {bar.name} holds no save' if bar else 'no bar holds a report'} of seed {a.seed}): "
                  f"the window opens on the record and the game's memory alone")
        if resumed:
            print(tree_against_save(wt, m.group(1), int(m.group(2))))
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
        if not bar:
            print("no bar holds the seed: nothing to compare with")
            return 0
        other, is_bar = str(bar), True
    else:
        d = win / a.vs
        other = str(d) if d.is_dir() else a.vs
        if not pathlib.Path(other).exists():
            raise SystemExit(f"--vs {a.vs}: no such tag under {win} and no such directory")
        is_bar = common.BARS.resolve() in pathlib.Path(other).resolve().parents
        named = common.bar_head(pathlib.Path(other), a.seed) if is_bar else None
        if named and not held(wt, named):
            print(f"BAR: {pathlib.Path(other).name} ran {lacked(wt, named)}: against it the rows those commits closed show as NEW and the rows "
                  f"they opened as GONE, and neither is the window's own")
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
        if a.turn_from > 1 and not resumed:
            print(f"new against the bar: {len(early)} in the window's first two turns (t{a.turn_from}-{a.turn_from + 1}: the start state's, see the README), "
                  f"{len(late)} later")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
