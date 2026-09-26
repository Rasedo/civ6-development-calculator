"""civ6lab save_sweep — SESSION5 instrument 1: load each named save, run the
scene readers on it, play nothing.

    python tools/civ6lab/save_sweep.py --list
    python tools/civ6lab/save_sweep.py --hosts 127.0.0.1,127.0.0.2 --readers score,ww
    python tools/civ6lab/save_sweep.py --hosts 3 --saves "lab4_t*" --readers events --redo

The saves are the named single-player ones on disk (lab4_t25 ... lab4_t250,
obs1_t50 ... obs6_t250); `--saves` takes globs over their names. Each
reader has its own default save list (below); `--saves` replaces it for every
reader chosen.

One worker thread per game instance (`--hosts`), each with its own tuner
connection; the saves wait in one queue, so each is loaded on exactly one
host (`game.cmd_load`). Per save and reader: `Game.GetCurrentGameTurn()` is
read before and after the reader (observer saves keep playing after a load);
a read whose turn moved is repeated up to `--retries` times and, if it still
moved, written with `"moved": true` and ledgered as `moved`. The ledger
(`runs/save_sweep_ledger.jsonl`, one line per save and reader) makes a rerun
skip every pair already `ok`; `--redo` reads them again. Records are appended
under a lock.

The readers (Lua under tools/civ6lab/, state, output under runs/):
  score         B-82-S1  score_read.lua, InGame              score_xsec_<stamp>.jsonl
  ww            B-D-S0   freecity_amenity.lua ZALL=1, InGame ww_xsec_<stamp>.log
  freecity_def  C-60-S1  city_probe.lua ZWHO=free, InGame    freecity_def_<stamp>.jsonl
  minor_def     C-38-S2  city_probe.lua (every city), InGame minor_def_<stamp>.jsonl
  events        C-74-S1  event_history.lua, InGame           event_turns_<save>.jsonl
                         event_map.lua, InGame and GameCore  event_map_<save>.json
  citydef       C-60-S1  city_defense_preview.lua, InGame    citydef_<stamp>.jsonl
                         (every centre's strength by the combat preview's own terms; C-38-S2 too)
  ladder        -        ladder_read.lua, InGame             ladder_read_<stamp>.jsonl
`ladder` (every city's amenity balance beside the tier the game reports) has
no scene and runs only when named.
The <stamp> files hold one record per save (`--stamp` appends to an earlier
run's files); the per-save event files are rewritten whole.

`--at-end` says what each worker does with its instance when the queue is
empty: `menu` (Events.ExitToMainMenu, the default), `close` (end the Civ 6
process whose command line carries `-TunerIP <host>`), `stay`.
"""
from __future__ import annotations

import argparse
import datetime as dt
import fnmatch
import json
import pathlib
import queue
import re
import subprocess
import sys
import threading
from dataclasses import dataclass, field

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from tuner import Tuner, TunerError  # noqa: E402
import game  # noqa: E402
import lab  # noqa: E402

HERE = pathlib.Path(__file__).parent
GC, IG = lab.GC, lab.IG
PORT = 4318
# where the game's save list (UI.QuerySaveGameList, LOCAL_STORAGE,
# SINGLE_PLAYER) reads from on this box
SAVES_DIR = pathlib.Path.home() / "Documents" / "My Games" / "Sid Meier's Civilization VI" / "Saves" / "Single"
SWEEP_RE = re.compile(r"^(lab4|obs\d+)_t(\d+)$")
LEDGER = lab.RUNS / "save_sweep_ledger.jsonl"
ALL = ("lab4_t*", "obs*_t*")

# the Free Cities SESSION5 lists for C-60-S1, checked against what the save holds
FREECITY_EXPECT: dict[str, list[tuple[int, int]]] = {
    "obs1_t150": [(53, 18)], "obs2_t150": [(43, 26)], "lab4_t200": [(69, 21), (20, 32)],
    "lab4_t225": [(69, 21)], "lab4_t250": [(69, 21)], "obs3_t250": [(73, 24)],
}


@dataclass(frozen=True)
class Part:
    state: str
    lua: str
    sets: tuple[tuple[str, str], ...] = ()
    key: str = ""


@dataclass(frozen=True)
class Reader:
    name: str
    scene: str
    parts: tuple[Part, ...]
    out: str
    saves: tuple[str, ...] = ALL


READERS: dict[str, Reader] = {r.name: r for r in (
    Reader("score", "B-82-S1", (Part(IG, "score_read.lua"),), "score_xsec_{stamp}.jsonl"),
    Reader("ww", "B-D-S0", (Part(IG, "freecity_amenity.lua", (("ZALL", "1"),)),), "ww_xsec_{stamp}.log"),
    Reader("freecity_def", "C-60-S1", (Part(IG, "city_probe.lua", (("ZWHO", "free"),)),),
           "freecity_def_{stamp}.jsonl", tuple(FREECITY_EXPECT)),
    Reader("minor_def", "C-38-S2", (Part(IG, "city_probe.lua"),), "minor_def_{stamp}.jsonl",
           ("lab4_t50", "lab4_t100", "lab4_t150")),
    Reader("events", "C-74-S1", (Part(IG, "event_history.lua", key="turns"),
                                 Part(IG, "event_map.lua", key=IG),
                                 Part(GC, "event_map.lua", key=GC)), "event_turns_{save}.jsonl"),
    Reader("citydef", "C-60-S1", (Part(IG, "city_defense_preview.lua", (("ZMAX", "-1"),)),),
           "citydef_{stamp}.jsonl"),
    Reader("ladder", "", (Part(IG, "ladder_read.lua"),), "ladder_read_{stamp}.jsonl"),
)}
SCENES = ",".join(r.name for r in READERS.values() if r.scene)
# event_map kinds that come as one line; the others are lists
MAP_SINGLE = ("climate", "rivers", "volcanoes", "terrain")


@dataclass
class Sweep:
    stamp: str
    retries: int
    timeout: float
    lock: threading.Lock = field(default_factory=threading.Lock)
    tally: dict[tuple[str, str], int] = field(default_factory=dict)

    def append(self, path: pathlib.Path, obj: dict) -> None:
        with self.lock:
            with open(path, "a", encoding="utf-8", newline="\n") as fh:
                fh.write(json.dumps(obj, ensure_ascii=False) + "\n")

    def ledger(self, save: str, reader: str, status: str, out: str, host: str,
               before: int | None, after: int | None) -> None:
        self.append(LEDGER, {"save": save, "reader": reader, "status": status, "out": out, "host": host,
                             "turnBefore": before, "turnAfter": after,
                             "at": dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")})
        with self.lock:
            self.tally[(reader, status)] = self.tally.get((reader, status), 0) + 1


def lua_of(part: Part) -> str:
    code = (HERE / part.lua).read_text(encoding="utf-8")
    for k, v in part.sets:
        code = code.replace(k, v)
    return code


def run_part(t: Tuner, part: Part, timeout: float) -> dict:
    """The part's printed lines: JSON ones parsed into `rows`, the rest kept
    in `raw`; a Lua or wire error in `error`."""
    rows: list = []
    raw: list[str] = []
    err = None
    try:
        for ln in t.run(part.state, lua_of(part), timeout=timeout):
            try:
                rows.append(json.loads(ln))
            except ValueError:
                raw.append(ln)
    except TunerError as e:
        err = str(e)
    return {"state": part.state, "lua": part.lua, "sets": dict(part.sets), "rows": rows, "raw": raw, "error": err}


def read_once(t: Tuner, reader: Reader, timeout: float) -> tuple[int, int, dict[str, dict]]:
    before = lab.turn(t)
    parts = {p.key or p.lua: run_part(t, p, timeout) for p in reader.parts}
    return before, lab.turn(t), parts


def expected_check(save: str, rows: list) -> list[dict]:
    got = {(r.get("x"), r.get("y")): r for r in rows if isinstance(r, dict) and r.get("role") == "free"}
    return [{"x": x, "y": y, "found": (x, y) in got, "city": got.get((x, y), {}).get("city")}
            for x, y in FREECITY_EXPECT.get(save, [])]


def write(sw: Sweep, host: str, save: str, reader: Reader, before: int, after: int,
          attempts: int, parts: dict[str, dict]) -> tuple[str, str]:
    """Write one save's reads for one reader; returns (status, output name)."""
    moved = before != after
    errors = [p["error"] for p in parts.values() if p["error"]]
    status = "error" if errors else ("moved" if moved else "ok")
    head = {"save": save, "reader": reader.name, "scene": reader.scene, "host": host,
            "turnBefore": before, "turnAfter": after, "moved": moved, "attempts": attempts}
    if reader.name == "events":
        turns = lab.RUNS / f"event_turns_{save}.jsonl"
        with sw.lock, open(turns, "w", encoding="utf-8", newline="\n") as fh:
            p = parts["turns"]
            for r in p["rows"]:
                fh.write(json.dumps({**head, **r} if isinstance(r, dict) else {**head, "row": r},
                                    ensure_ascii=False) + "\n")
            if p["raw"] or p["error"]:
                fh.write(json.dumps({**head, "kind": "unparsed", "raw": p["raw"], "error": p["error"]},
                                    ensure_ascii=False) + "\n")
        doc: dict = dict(head)
        for state in (IG, GC):
            p = parts[state]
            by: dict[str, list] = {}
            for r in p["rows"]:
                by.setdefault(r.get("kind", "?") if isinstance(r, dict) else "?", []).append(r)
            doc[state] = {k: (v[0] if k in MAP_SINGLE and len(v) == 1 else v) for k, v in by.items()}
            doc[state]["raw"], doc[state]["error"] = p["raw"], p["error"]
        with sw.lock, open(lab.RUNS / f"event_map_{save}.json", "w", encoding="utf-8", newline="\n") as fh:
            fh.write(json.dumps(doc, ensure_ascii=False) + "\n")
        return status, turns.name
    (p,) = parts.values()
    rec = {**head, "state": p["state"], "lua": p["lua"], "sets": p["sets"], "rows": p["rows"],
           "raw": p["raw"], "error": p["error"]}
    if reader.name == "freecity_def":
        rec["expected"] = expected_check(save, p["rows"])
    out = lab.RUNS / reader.out.format(stamp=sw.stamp, save=save)
    sw.append(out, rec)
    return status, out.name


def sweep_save(sw: Sweep, host: str, save: str, readers: list[Reader]) -> None:
    try:
        if game.cmd_load(argparse.Namespace(host=host, port=PORT, name=save, wait=600.0)) != 0:
            raise TunerError(f"game.py load {save} failed")
        t = game.wait_for_state(host, PORT, IG, 300.0, lab.LUA_TURN)
    except TunerError as e:
        print(f"[{host}] {save}: load FAILED: {e}", flush=True)
        for r in readers:
            sw.ledger(save, r.name, "error", "", host, None, None)
        return
    try:
        for r in readers:
            try:
                attempts = 0
                while True:
                    attempts += 1
                    before, after, parts = read_once(t, r, sw.timeout)
                    if before == after or attempts > sw.retries:
                        break
                    print(f"[{host}] {save} {r.name}: turn moved {before}->{after}, reading again", flush=True)
                status, out = write(sw, host, save, r, before, after, attempts, parts)
                sw.ledger(save, r.name, status, out, host, before, after)
                print(f"[{host}] {save} {r.name}: {status} t{before}->{after} -> {out}", flush=True)
            except TunerError as e:
                print(f"[{host}] {save} {r.name}: FAILED: {e}", flush=True)
                sw.ledger(save, r.name, "error", "", host, None, None)
    finally:
        t.close()


def close_instance(host: str) -> str:
    """End the Civ 6 process launched with `-TunerIP <host>`."""
    ps = ("Get-CimInstance Win32_Process -Filter \"Name LIKE 'CivilizationVI%'\" | "
          "Select-Object ProcessId, CommandLine | ConvertTo-Json -Compress")
    out = subprocess.run(["powershell", "-NoProfile", "-Command", ps], capture_output=True, text=True,
                         encoding="utf-8", errors="replace").stdout.strip()
    procs = json.loads(out) if out else []
    if isinstance(procs, dict):
        procs = [procs]
    flag = re.compile(r"-TunerIP\s+" + re.escape(host) + r"(\s|$)")
    pids = [p["ProcessId"] for p in procs if flag.search(p.get("CommandLine") or "")]
    if not pids:
        return f"no Civ 6 process carries -TunerIP {host}"
    for pid in pids:
        subprocess.run(["taskkill", "/PID", str(pid), "/F"], capture_output=True, text=True)
    return f"closed pid {' '.join(map(str, pids))}"


def at_end(host: str, how: str) -> str:
    if how == "stay":
        return "stays"
    if how == "close":
        return close_instance(host)
    try:
        t = Tuner(host, PORT).connect()
    except TunerError as e:
        return f"no tuner: {e}"
    try:
        if IG not in t.refresh_states():
            return "already at the main menu"
        t.run(IG, "Events.ExitToMainMenu()", timeout=10)
        return "back to the main menu"
    except TunerError:
        return "back to the main menu (the state went with the exit)"
    finally:
        t.close()


def worker(sw: Sweep, host: str, jobs: "queue.Queue[tuple[str, list[Reader]]]", how: str) -> None:
    while True:
        try:
            save, readers = jobs.get_nowait()
        except queue.Empty:
            break
        sweep_save(sw, host, save, readers)
    print(f"[{host}] queue empty; {at_end(host, how)}", flush=True)


def saves_on_disk(d: pathlib.Path) -> list[str]:
    names = [f.stem for f in d.glob("*.Civ6Save")] if d.is_dir() else []

    def key(n: str) -> tuple[str, int, str]:
        m = SWEEP_RE.match(n)
        return (m.group(1), int(m.group(2)), n) if m else (n, -1, n)
    return sorted(names, key=key)


def pick(names: list[str], globs: tuple[str, ...] | list[str]) -> list[str]:
    return [n for n in names if SWEEP_RE.match(n) and any(fnmatch.fnmatchcase(n, g) for g in globs)]


def hosts_of(spec: str) -> list[str]:
    if spec.isdigit():
        return [f"127.0.0.{i}" for i in range(1, int(spec) + 1)]
    return [h.strip() for h in spec.split(",") if h.strip()]


def done_pairs() -> set[tuple[str, str]]:
    done: set[tuple[str, str]] = set()
    if LEDGER.exists():
        for ln in LEDGER.read_text(encoding="utf-8").splitlines():
            try:
                r = json.loads(ln)
            except ValueError:
                continue
            if r.get("status") == "ok":
                done.add((r["save"], r["reader"]))
    return done


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--hosts", default="127.0.0.1",
                   help="instances to fan out over: a comma list of tuner addresses, or N for 127.0.0.1..N")
    p.add_argument("--saves", nargs="+", metavar="GLOB",
                   help="save names or globs (replaces every reader's default list)")
    p.add_argument("--readers", default=SCENES, help=f"comma list of {', '.join(READERS)}")
    p.add_argument("--redo", action="store_true", help="read pairs the ledger already has as ok")
    p.add_argument("--retries", type=int, default=2, help="extra reads when the turn moved under one")
    p.add_argument("--timeout", type=float, default=300.0, help="seconds one Lua reader may take")
    p.add_argument("--stamp", default=dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ"),
                   help="the <stamp> in the output names; an earlier run's stamp appends to its files")
    p.add_argument("--saves-dir", default=str(SAVES_DIR))
    p.add_argument("--at-end", choices=("menu", "close", "stay"), default="menu")
    p.add_argument("--list", action="store_true", help="print the plan and stop; no game is touched")
    a = p.parse_args(argv)

    chosen = [r.strip() for r in a.readers.split(",") if r.strip()]
    unknown = [r for r in chosen if r not in READERS]
    if unknown:
        p.error(f"unknown reader(s) {unknown}; pick from {list(READERS)}")
    disk = saves_on_disk(pathlib.Path(a.saves_dir))
    if a.saves:
        for g in a.saves:
            if not any(fnmatch.fnmatchcase(n, g) for n in disk):
                print(f"warning: no save on disk matches {g!r}")
    done = set() if a.redo else done_pairs()
    plan: dict[str, list[Reader]] = {}
    for name in chosen:
        r = READERS[name]
        for s in pick(disk, a.saves or r.saves):
            if (s, name) not in done:
                plan.setdefault(s, []).append(r)
    order = [s for s in disk if s in plan]
    skipped = sum(1 for name in chosen for s in pick(disk, a.saves or READERS[name].saves) if (s, name) in done)
    print(f"{len(order)} saves to load, {sum(len(v) for v in plan.values())} reads pending,"
          f" {skipped} already ok in {LEDGER.name}; hosts {', '.join(hosts_of(a.hosts))}")
    for s in order:
        print(f"  {s:12s} {' '.join(r.name for r in plan[s])}")
    if a.list or not order:
        return 0

    lab.RUNS.mkdir(exist_ok=True)
    sw = Sweep(stamp=a.stamp, retries=a.retries, timeout=a.timeout)
    jobs: "queue.Queue[tuple[str, list[Reader]]]" = queue.Queue()
    for s in order:
        jobs.put((s, plan[s]))
    threads = [threading.Thread(target=worker, args=(sw, h, jobs, a.at_end), name=h) for h in hosts_of(a.hosts)]
    for th in threads:
        th.start()
    for th in threads:
        th.join()
    print("done:", ", ".join(f"{r} {st} {n}" for (r, st), n in sorted(sw.tally.items())))
    return 0 if all(st == "ok" for (_, st) in sw.tally) else 1


if __name__ == "__main__":
    sys.exit(main())
