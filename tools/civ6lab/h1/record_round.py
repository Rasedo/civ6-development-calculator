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
fleet's to skip (`fleet.py`'s wall-bounded calls: `stalled` / `crash` in
its manifest line); the round goes on with the next seed.

Re-runnable: a seed whose manifest line under the tag reads `target` is
left out (`--redo` records it again), so the same command records what
failed. Prints one line per game — seed, turns reached, the end, wall
seconds, the files' bytes, the faults — and a last `ROUND` line; exit 0
only where every asked seed reached its target and the clean-up left
nothing.
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
RUNS = LAB / "runs"
PY = sys.executable
sys.path.insert(0, str(LAB))
sys.path.insert(0, str(HERE))
import fleet  # noqa: E402
import game  # noqa: E402

SUFFIXES = (".jsonl", ".aimem.jsonl", ".aiunits.jsonl", ".cat.json", ".orders.json", ".randcalls.csv", ".logs.sqlite")


def run(cmd: list[str], seconds: float) -> tuple[int, str]:
    """a lab command under a wall bound: its exit code (124 past the bound)
    and its output"""
    try:
        p = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace",
                           timeout=seconds)
        return p.returncode, (p.stdout or "") + (p.stderr or "")
    except subprocess.TimeoutExpired as e:
        return 124, str(e.stdout or "")


def civ_processes() -> list[str]:
    out = subprocess.run(["tasklist", "/fo", "csv", "/nh"], capture_output=True, text=True, encoding="utf-8",
                         errors="replace").stdout
    return [ln.split(",")[1].strip('"') for ln in out.splitlines() if ln.lower().startswith('"civilizationvi')]


def recorded(tag: str) -> dict[int, dict]:
    """per seed its last manifest line under the tag, over every stamp"""
    out: dict[int, dict] = {}
    for m in sorted(RUNS.glob(f"h1_fleet_{tag}_*.jsonl")):
        for ln in m.read_text(encoding="utf-8").splitlines():
            try:
                r = json.loads(ln)
            except ValueError:
                continue
            if isinstance(r.get("map_seed"), int):
                out[r["map_seed"]] = r
    return out


def sizes(dump: pathlib.Path) -> tuple[int, dict[str, int]]:
    """the bytes of a game's files: in all, and per file"""
    per = {}
    for suf in SUFFIXES:
        f = dump.with_suffix("").with_suffix(suf) if suf != ".jsonl" else dump
        if f.exists():
            per[suf] = f.stat().st_size
    logs = dump.with_suffix(".logs")
    if logs.is_dir():
        per[".logs"] = sum(f.stat().st_size for f in logs.iterdir() if f.is_file())
    return sum(per.values()), per


def game_line(r: dict, turns: int) -> tuple[str, bool]:
    """a manifest line as the round prints it, and whether it is whole"""
    faults = []
    if r.get("end") != "target":
        faults.append(f"end {r.get('end')}: {str(r.get('why', ''))[-120:]}".strip())
    mem = r.get("aimem") or {}
    if mem.get("armed") is False:
        faults.append("aimem not armed")
    dump = pathlib.Path(r["dump"])
    total, per = sizes(dump)
    for suf in (".jsonl", ".aimem.jsonl", ".aiunits.jsonl", ".randcalls.csv"):
        if not per.get(suf):
            faults.append(f"no {suf}")
    wall = (r.get("wall_end") or time.time()) - r.get("wall_start", time.time())
    ok = not faults and (r.get("turn") or 0) >= turns
    return (f"GAME seed {r['map_seed']} host {r.get('host')} turn {r.get('turn')} end {r.get('end')} wall {wall:.0f}s"
            f" files {total / 2**20:.0f} MB ({', '.join(f'{k} {v / 2**20:.0f}' for k, v in per.items())})"
            f" aimem [{mem.get('end', '')}] faults: {'; '.join(faults) or 'none'}"), ok


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--tag", required=True, help="the recordings' tag: runs/h1_<tag><seed>_<stamp>.jsonl")
    p.add_argument("--seeds", required=True, help="map seeds: a comma list and lo-hi ranges")
    p.add_argument("--hosts", default="127.0.0.2,127.0.0.3,127.0.0.4")
    p.add_argument("--turns", type=int, default=250)
    p.add_argument("--config", default=str(HERE / "h1_duel.json"))
    p.add_argument("--majors", type=int, default=2, help="the config's major players (fleet.py --majors)")
    p.add_argument("--redo", action="store_true", help="record again the seeds already at their target under the tag")
    p.add_argument("--game-minutes", type=float, default=60.0, help="the wall a game may take before the round gives it up")
    a = p.parse_args(argv)

    hosts = [h.strip() for h in a.hosts.split(",") if h.strip()]
    asked = fleet.seeds_of(a.seeds)
    have = recorded(a.tag)
    todo = [s for s in asked if a.redo or have.get(s, {}).get("end") != "target" or (have[s].get("turn") or 0) < a.turns]
    left_out = [s for s in asked if s not in todo]
    print(f"round {a.tag}: {len(todo)} seed(s) to record on {len(hosts)} host(s), {len(left_out)} already recorded"
          f" {left_out}", flush=True)
    if not todo:
        print(f"ROUND {a.tag}: nothing to record", flush=True)
        return 0
    if civ_processes():
        print(f"ROUND {a.tag}: REFUSED, a CivilizationVI process runs: {civ_processes()}", flush=True)
        return 2

    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    manifest = RUNS / f"h1_fleet_{a.tag}_{stamp}.jsonl"
    faults: list[str] = []
    t0 = time.time()
    g = [PY, str(LAB / "game.py")]
    h4 = [PY, str(LAB / "h4.py")]
    try:
        rc, out = run(g + ["patch", "apply"], 120)
        if rc != 0 or "NOT applied" in out:
            raise RuntimeError(f"patch apply: {out[-300:]}")
        rc, out = run(g + ["profile", "apply", "--ai-verbose"], 60)
        if rc != 0:
            raise RuntimeError(f"profile apply: {out[-300:]}")
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
            rc, out = run(h4 + ["--host", h, "--deadline", "230", "menu"], 250)
            if rc == 0:
                ready.append(h)
            else:
                faults.append(f"host {h}: no main menu: {out[-160:].strip()}")
        if not ready:
            raise RuntimeError("no instance reached the main menu")
        # the fleet: its own calls are wall-bounded, a game that stands is `stalled`
        games = -(-len(todo) // len(ready))
        rc, out = run([PY, str(HERE / "fleet.py"), "run", "--hosts", ",".join(ready), "--seeds", ",".join(map(str, todo)),
                       "--turns", str(a.turns), "--config", a.config, "--tag", a.tag, "--aimem", "--no-report",
                       "--majors", str(a.majors), "--stamp", stamp], 60 * a.game_minutes * games + 600)
        if rc != 0:
            faults.append(f"fleet rc {rc}: {out[-300:].strip()}")
    except Exception as e:  # noqa: BLE001 — the clean-up below runs whatever failed
        faults.append(f"{type(e).__name__}: {e}")
    finally:
        for h in hosts:
            run(g + ["--host", h, "close"], 60)
        rc, out = run(g + ["profile", "restore"], 60)
        if rc != 0:
            faults.append(f"profile restore: {out[-200:].strip()}")
        # the DLL stays locked until the last instance has exited
        for _ in range(40):
            rc, out = run(g + ["patch", "revert"], 120)
            if rc == 0:
                break
            time.sleep(3.0)
        else:
            faults.append(f"patch revert FAILED, run `python tools/civ6lab/game.py patch revert`: {out[-200:].strip()}")
        left = civ_processes()
        if left:
            faults.append(f"CivilizationVI processes left: {left}")

    done = 0
    lines = {}
    if manifest.exists():
        for ln in manifest.read_text(encoding="utf-8").splitlines():
            try:
                r = json.loads(ln)
            except ValueError:
                continue
            if isinstance(r.get("map_seed"), int):
                lines[r["map_seed"]] = r
    for s in todo:
        if s not in lines:
            print(f"GAME seed {s}: not played", flush=True)
            continue
        text, ok = game_line(lines[s], a.turns)
        done += ok
        print(text, flush=True)
    failed = [s for s in todo if s not in lines or not game_line(lines[s], a.turns)[1]]
    print(f"ROUND {a.tag}: {done} of {len(todo)} recorded in {time.time() - t0:.0f}s, failed {failed}, manifest {manifest},"
          f" faults: {'; '.join(faults) or 'none'}", flush=True)
    return 0 if not failed and not faults else 1


if __name__ == "__main__":
    sys.exit(main())
