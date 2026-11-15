"""H-1: one recording round, unattended.

    python tools/civ6lab/h1/record_round.py --tag duels --seeds 1117 --turns 30 --hosts 127.0.0.2
    python tools/civ6lab/h1/record_round.py --tag duels --seeds 1117,1121,1124,1127,1128
    python tools/civ6lab/h1/record_round.py --tag duels --seeds 1131-1160

For a tag and a seed list (map seed s, game seed s + 1000, `fleet.py`): the
install patch and the lab profile with the AI's verbose logs (`game.py
patch apply`, `profile apply --ai-verbose`), one instance per host brought
to the main menu, the fleet
with the AI memory reader and the units' stream and no engine report
(`fleet.py run --aimem --no-report`), then, whatever happened, every
instance closed, the owner's options restored, the patch reverted and the
box checked for a CivilizationVI process left.

It refuses to start while a CivilizationVI process runs. An instance that
is gone a few seconds after its spawn (the binary exits at once where Steam
does not let it run: exit code 53) is a fault of the round: nothing is
recorded and the clean-up runs. A game that hangs or crashes is the
fleet's (`fleet.py`'s wall-bounded calls: `stalled` / `crash` in its
manifest line): it starts that host's instance anew and plays the seed once
more, and drops a host whose instance does not come back.

Every game's dump is read for its turns (`fleet.turns_of`). A seed is
recorded where its game reached the target with every turn from the first
held, or ended before it (`game_over`: the seat eliminated) with every turn
to its last record held — the game's valid range, `valid to t<N>` on its
line. A dump with a turn missing or a record whose counter moved is a
failed seed whatever its manifest line says.

Re-runnable: a seed recorded under the tag is left out (`--redo` records it
again), so the same command records what failed. Prints one line per game —
seed, turns reached, the end, the turns recorded, wall seconds, the files'
bytes, the faults — and, always as its last line, a `ROUND` line; exit 0
only where every asked seed is recorded and the clean-up left nothing.
`--runs` names the folder the recordings go to and the earlier rounds'
manifests are read from.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import subprocess
import sys
import time

HERE = pathlib.Path(__file__).resolve().parent
LAB = HERE.parent
ROOT = LAB.parents[1]
PY = sys.executable
sys.path.insert(0, str(LAB))
sys.path.insert(0, str(HERE))
import fleet  # noqa: E402
import game  # noqa: E402


def run(cmd: list[str], seconds: float) -> tuple[int, str]:
    """a lab command under a wall bound: its exit code (124 past the bound)
    and its output"""
    try:
        p = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace",
                           timeout=seconds, env=fleet.ENV)
        return p.returncode, (p.stdout or "") + (p.stderr or "")
    except subprocess.TimeoutExpired as e:
        out = e.stdout or ""
        return 124, out.decode("utf-8", "replace") if isinstance(out, bytes) else out


def civ_processes() -> list[str]:
    out = subprocess.run(["tasklist", "/fo", "csv", "/nh"], capture_output=True, text=True, encoding="utf-8",
                         errors="replace").stdout
    return [ln.split(",")[1].strip('"') for ln in out.splitlines() if ln.lower().startswith('"civilizationvi')]


def manifest_lines(manifest: pathlib.Path) -> tuple[dict[int, dict], list[dict]]:
    """a manifest's last line per seed, and its host events"""
    games: dict[int, dict] = {}
    events: list[dict] = []
    if manifest.exists():
        for ln in manifest.read_text(encoding="utf-8").splitlines():
            try:
                r = json.loads(ln)
            except ValueError:
                continue
            if isinstance(r.get("map_seed"), int):
                games[r["map_seed"]] = r
            elif "event" in r:
                events.append(r)
    return games, events


def recorded(runs: pathlib.Path, tag: str) -> dict[int, dict]:
    """per seed its last manifest line under the tag, over every stamp"""
    out: dict[int, dict] = {}
    for m in sorted(runs.glob(f"h1_fleet_{tag}_*.jsonl")):
        out.update(manifest_lines(m)[0])
    return out


def sizes(dump: pathlib.Path) -> tuple[int, dict[str, int]]:
    """the bytes of a game's files: in all, and per file"""
    per = {}
    for suf in fleet.SUFFIXES:
        f = fleet.stem_file(dump, suf)
        if f.exists():
            per[suf] = f.stat().st_size
    logs = dump.with_suffix(".logs")
    if logs.is_dir():
        per[".logs"] = sum(f.stat().st_size for f in logs.iterdir() if f.is_file())
    return sum(per.values()), per


def turn_faults(r: dict, turns: int) -> tuple[list[str], dict]:
    """what a game's dump lacks, read from the dump itself, and its turns:
    nothing where the game reached the target with every turn held, or ended
    before it with every turn to its last record held"""
    got = fleet.turns_of(pathlib.Path(r["dump"]))
    faults = []
    if not got["records"]:
        return ["no turn recorded"], got
    if got["missing"]:
        faults.append(f"turns not recorded {got['missing'][:6]}{'...' if len(got['missing']) > 6 else ''}")
    if got["moved"]:
        faults.append(f"records whose counter moved {got['moved'][:6]}")
    if got["repeated"] or got["unread"]:
        faults.append(f"{got['repeated']} repeated record(s), {got['unread']} unread line(s)")
    if r.get("end") == "target" and got["last"] < turns:
        faults.append(f"the records end at turn {got['last']}")
    return faults, got


def whole(r: dict | None, turns: int) -> bool:
    """a seed's manifest line names a recorded game"""
    return r is not None and r.get("end") in ("target", "game_over") and not turn_faults(r, turns)[0]


def game_line(r: dict, turns: int) -> tuple[str, bool, int | None]:
    """a manifest line as the round prints it, whether the seed is recorded,
    and the last turn of its dump's run from the first"""
    faults = []
    if r.get("end") not in ("target", "game_over"):
        faults.append(f"end {r.get('end')}: {str(r.get('why', ''))[-160:]}".strip())
    mem = r.get("aimem") or {}
    if mem.get("armed") is False:
        faults.append("aimem not armed")
    dump = pathlib.Path(r["dump"])
    total, per = sizes(dump)
    for suf in (".jsonl", ".aimem.jsonl", ".aiunits.jsonl", ".randcalls.csv"):
        if not per.get(suf):
            faults.append(f"no {suf}")
    lacks, got = turn_faults(r, turns)
    faults += lacks
    wall = (r.get("wall_end") or time.time()) - r.get("wall_start", time.time())
    early = f" (valid to t{got['last']})" if r.get("end") == "game_over" and not lacks else ""
    return (f"GAME seed {r['map_seed']} host {r.get('host')} attempt {r.get('attempt', 1)} turn {r.get('turn')}"
            f" end {r.get('end')} recorded {got['first']}..{got['last']}{early} wall {wall:.0f}s"
            f" files {total / 2**20:.0f} MB ({', '.join(f'{k} {v / 2**20:.0f}' for k, v in per.items())})"
            f" aimem [{mem.get('end', '')}] faults: {'; '.join(faults) or 'none'}"), not faults, got["last"]


def record(a, out: dict) -> int:
    """the round; `out["line"]` is its ROUND line at every moment"""
    hosts = [h.strip() for h in a.hosts.split(",") if h.strip()]
    asked = fleet.seeds_of(a.seeds)
    have = recorded(a.runs, a.tag)
    todo = [s for s in asked if a.redo or not whole(have.get(s), a.turns)]
    left_out = [s for s in asked if s not in todo]
    print(f"round {a.tag}: {len(todo)} seed(s) to record on {len(hosts)} host(s), {len(left_out)} already recorded"
          f" {left_out}", flush=True)
    if not todo:
        out["line"] = f"ROUND {a.tag}: nothing to record"
        return 0
    if civ_processes():
        out["line"] = f"ROUND {a.tag}: REFUSED, a CivilizationVI process runs: {civ_processes()}"
        return 2

    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    manifest = a.runs / f"h1_fleet_{a.tag}_{stamp}.jsonl"
    faults: list[str] = []
    t0 = time.time()
    out["line"] = f"ROUND {a.tag}: ended before its summary, manifest {manifest}"
    g = [PY, str(LAB / "game.py")]
    h4 = [PY, str(LAB / "h4.py")]
    try:
        rc, text = run(g + ["patch", "apply"], 120)
        if rc != 0 or "NOT applied" in text:
            raise RuntimeError(f"patch apply: {text[-300:]}")
        rc, text = run(g + ["profile", "apply", "--ai-verbose"], 60)
        if rc != 0:
            raise RuntimeError(f"profile apply: {text[-300:]}")
        up = []
        for h in hosts:
            run(h4 + ["--host", h, "spawn"], 60)
            # the binary exits within a second where it may not run
            end = time.monotonic() + 12
            while time.monotonic() < end and not game.instance_pids(h):
                time.sleep(1.0)
            time.sleep(3.0)
            if game.instance_pids(h):
                up.append(h)
            else:
                faults.append(f"host {h}: the instance is gone after its spawn")
        if not up:
            raise RuntimeError("no instance stayed up after its spawn (the binary exits with code 53 where Steam does"
                               " not let it run: the logged-in account, steam_appid.txt)")
        ready = []
        for h in up:
            rc, text = run(h4 + ["--host", h, "--deadline", "230", "menu"], 250)
            if rc == 0:
                ready.append(h)
            else:
                faults.append(f"host {h}: no main menu: {text[-160:].strip()}")
        if not ready:
            raise RuntimeError("no instance reached the main menu")
        # the fleet: its own calls are wall-bounded, a game that stands is `stalled`
        games = -(-len(todo) // len(ready))
        rc, text = run([PY, str(HERE / "fleet.py"), "run", "--hosts", ",".join(ready), "--seeds", ",".join(map(str, todo)),
                        "--turns", str(a.turns), "--config", a.config, "--tag", a.tag, "--aimem", "--no-report",
                        "--majors", str(a.majors), "--stamp", stamp, "--runs", str(a.runs)],
                       60 * a.game_minutes * games + 600)
        if rc != 0:
            faults.append(f"fleet rc {rc}: {text[-300:].strip()}")
    except BaseException as e:  # noqa: BLE001 — the clean-up below runs whatever failed, an interrupt too
        faults.append(f"{type(e).__name__}: {e}")
    finally:
        for h in hosts:
            run(g + ["--host", h, "close"], 60)
        rc, text = run(g + ["profile", "restore"], 60)
        if rc != 0:
            faults.append(f"profile restore: {text[-200:].strip()}")
        # the DLL stays locked until the last instance has exited
        for _ in range(40):
            rc, text = run(g + ["patch", "revert"], 120)
            if rc == 0:
                break
            time.sleep(3.0)
        else:
            faults.append(f"patch revert FAILED, run `python tools/civ6lab/game.py patch revert`: {text[-200:].strip()}")
        left = civ_processes()
        if left:
            faults.append(f"CivilizationVI processes left: {left}")

    lines, events = manifest_lines(manifest)
    done, early, failed = 0, [], []
    for s in todo:
        try:
            if s not in lines:
                failed.append(s)
                print(f"GAME seed {s}: not played", flush=True)
                continue
            text, ok, last = game_line(lines[s], a.turns)
            if ok:
                done += 1
                if lines[s].get("end") == "game_over":
                    early.append(f"{s} to t{last}")
            else:
                failed.append(s)
            print(text, flush=True)
        except Exception as e:  # noqa: BLE001 — one game's line never costs the others' or the ROUND line
            failed.append(s)
            print(f"GAME seed {s}: its line failed, {type(e).__name__}: {e}", flush=True)
        out["line"] = (f"ROUND {a.tag}: ended in its summary after seed {s}: {done} recorded so far, failed {failed},"
                       f" manifest {manifest}, faults: {'; '.join(faults) or 'none'}")
    faults += [f"host {e.get('host')} dropped at seed {e.get('seed')}" for e in events if e.get("event") == "dropped"]
    notes = [f"host {e.get('host')} started anew at seed {e.get('seed')}" for e in events
             if e.get("event") == "respawn" and e.get("ok")]
    out["line"] = (f"ROUND {a.tag}: {done} of {len(todo)} recorded in {time.time() - t0:.0f}s"
                   f" ({len(early)} ended early: {', '.join(early) or 'none'}), failed {failed}, manifest {manifest},"
                   f" notes: {'; '.join(notes) or 'none'}, faults: {'; '.join(faults) or 'none'}")
    return 0 if not failed and not faults else 1


def main(argv=None) -> int:
    fleet.stdio_utf8()
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--tag", required=True, help="the recordings' tag: <runs>/h1_<tag><seed>_<stamp>.jsonl")
    p.add_argument("--seeds", required=True, help="map seeds: a comma list and lo-hi ranges")
    p.add_argument("--hosts", default="127.0.0.2,127.0.0.3,127.0.0.4")
    p.add_argument("--turns", type=int, default=250)
    p.add_argument("--config", default=str(HERE / "h1_duel.json"))
    p.add_argument("--majors", type=int, default=2, help="the config's major players (fleet.py --majors)")
    p.add_argument("--redo", action="store_true", help="record again the seeds already recorded under the tag")
    p.add_argument("--game-minutes", type=float, default=60.0, help="the wall a game may take before the round gives it up")
    p.add_argument("--runs", type=pathlib.Path, default=fleet.RUNS,
                   help="the folder the recordings go to and the tag's earlier manifests are read from")
    a = p.parse_args(argv)
    a.runs = a.runs.resolve()
    # the ROUND line is the output's last line whatever fails before it
    out = {"line": f"ROUND {a.tag}: ended before it began"}
    code = 1
    try:
        code = record(a, out)
    except BaseException as e:  # noqa: BLE001
        out["line"] += f" [{type(e).__name__}: {e}]"
    finally:
        print(out["line"], flush=True)
    return code


if __name__ == "__main__":
    sys.exit(main())
