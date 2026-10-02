"""civ6lab watch — play a game forward and log it each turn with one or more
readers (AUDIT C-38: what a city-state spends, builds and fields).

    python tools/civ6lab/watch.py --turns 250 --save-every 25 --tag lab4
    python tools/civ6lab/watch.py --host 127.0.0.3 --observer --turns 250 --tag obs3
    python tools/civ6lab/watch.py --observer --turns 250 --tag obs3 \\
        --lua cs_watch.lua --state GameCore_Tuner --lua cs_watch2.lua --state InGame

Each `--lua` / `--state` pair is a per-turn reader run in that Lua state
(default: `cs_watch.lua` in GameCore_Tuner, one line per living minor per
turn); the pairs are matched in order, and with no `--state` at all every
reader runs in GameCore_Tuner. Each reader appends to its own JSONL under
tools/civ6lab/runs/, `<reader>_<tag>_<stamp>.jsonl`. A named save every
`--save-every` turns (`<tag>_t<turn>`) lets a later scene start from any
point; the whole random-event history (`event_history.lua`) is read at the
end — GetEventsForTurn reads any past turn.

Two ways to pass the turns:
* a game with a human seat: Autoplay ONE turn at a time, handing the seat
  back after each (`lab.advance`); at the target the seat simply holds its
  turn;
* `--observer`, an all-AI game (`game.py new` with "all_ai": true): nothing
  holds its turn, so it plays by itself. The turn lock (`turn_lock.lua`,
  `lab.lock`) holds it at the target's TurnBegin, so the end-of-run reads
  land on the target turn; between, the watch logs each turn as the counter
  moves and can miss one (the early Duel turns pass in ~0.4 s). `--step`
  holds EVERY turn from the first one the lock holds after the start: the
  readers read the held turn, the lock steps to the next, and no turn is
  missed or read twice (`res["skips"]` lists any held turn that was not the
  last one + 1). A save asked for under the lock is written when the turn is
  let go and carries the held turn; the target's own save is let through by
  stepping one turn past it before `--at-end`, so the game then stands held
  at target + 1.
While a turn stands still, `lab.wait_turn` reads what holds it (a blocker,
an open session, a visible screen) and answers the cause at once, with the
blind sweep only after 30 s with no named cause. A game that ENDS first (the
seat defeated, or a victory: `lab.endgame`) is written to every reader's log
as a `game_over` line with its turn, and the watch proceeds to `--at-end`;
a victory whose end screen offers Just One More Turn while the seat lives is
played through instead, so the watch reaches its target.
`--at-end` then decides the game's fate: `menu` exits to the main menu
(ready for the next game), `close` ends this instance's process, `stay`
leaves it. `--min-free-mb` stops the run (saving first) when the box's free
memory falls below it, so a fleet of instances cannot starve the machine;
`--stop-at` (epoch seconds) stops it at a wall-clock time.

A lost tuner is reconnected and each reconnect recorded. The instance counts
as CRASHED — the watch ends at once, exit code 3, no event history and no
`--at-end` — when its process (the one carrying `-TunerIP <host>` at the
start) is gone, when the tuner stays unreachable for `--unreachable`
seconds, or when a turn stands still for the whole `--wait`.
`--result <file>` is rewritten after every turn as one JSON object: host,
tag, wall start and end, start turn, target, the turn reached, the end
(`target`, `game_over`, `stop`, `crash`, or null while it runs) and why, the
reader logs, the event history file and the reconnects — what `fleet.py`
builds its manifest from.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import subprocess
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from tuner import Tuner, TunerError  # noqa: E402
import game  # noqa: E402
import lab  # noqa: E402

HERE = pathlib.Path(__file__).parent
IG = lab.IG


class Crash(RuntimeError):
    """The instance is gone: its process died, its tuner stayed unreachable
    past the limit, or its turn stood still past `--wait`."""


def _connect(host: str, port: int, limit: float, pids: list[int]) -> Tuner:
    """a tuner connection within `limit` seconds; `Crash` when the limit
    passes, or at once when every one of `pids` (the instance's processes
    when the watch began; empty for a game started without -TunerIP) has
    ended"""
    deadline = time.monotonic() + limit
    checked = 0.0
    while True:
        try:
            return Tuner(host, port).connect()
        except TunerError as e:
            err = e
        now = time.monotonic()
        if now >= deadline:
            raise Crash(f"tuner unreachable for {limit:.0f}s: {err}")
        if pids and now - checked >= 10.0:
            checked = now
            if not set(pids) & set(game.instance_pids(host)):
                raise Crash(f"process died (pid {pids})")
        time.sleep(3.0)


def free_mb() -> float:
    out = subprocess.run(["wmic", "OS", "get", "FreePhysicalMemory", "/value"],
                         capture_output=True, text=True).stdout
    for ln in out.splitlines():
        if ln.startswith("FreePhysicalMemory="):
            return int(ln.split("=")[1]) / 1024
    return float("inf")


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=4318)
    p.add_argument("--turns", type=int, default=250, help="turns to play")
    p.add_argument("--save-every", type=int, default=25)
    p.add_argument("--tag", default="watch")
    p.add_argument("--observer", action="store_true", help="an all-AI game: it plays itself; the watch follows it")
    p.add_argument("--step", action="store_true",
                   help="with --observer: hold every turn with the turn lock, read it, step to the next")
    p.add_argument("--min-free-mb", type=float, default=2048.0)
    p.add_argument("--wait", type=float, default=600.0, help="seconds to allow one turn")
    p.add_argument("--lua", action="append", help="a per-turn reader (repeatable); its log is named after it")
    p.add_argument("--state", action="append", help="the Lua state of the --lua in the same position")
    p.add_argument("--at-end", choices=game.AT_END, default="menu",
                   help="at the target: exit to the main menu, close the instance, or stay")
    p.add_argument("--unreachable", type=float, default=300.0,
                   help="seconds the tuner may stay unreachable before the instance counts as crashed")
    p.add_argument("--stop-at", type=float, help="a wall-clock time (epoch seconds) at which the watch stops")
    p.add_argument("--result", type=pathlib.Path, help="a JSON file rewritten every turn with the watch's state")
    a = p.parse_args(argv)
    luas = a.lua or ["cs_watch.lua"]
    states = a.state or [lab.GC] * len(luas)
    if len(states) != len(luas):
        p.error(f"{len(luas)} --lua but {len(states)} --state: give one state per reader, or none")
    lab.RUNS.mkdir(exist_ok=True)
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    readers = [(lab.RUNS / f"{pathlib.Path(n).stem}_{a.tag}_{stamp}.jsonl", (HERE / n).read_text(encoding="utf-8"), s)
               for n, s in zip(luas, states)]
    save = (HERE / "save_named.lua").read_text(encoding="utf-8")
    hist = lab.RUNS / f"event_history_{a.tag}_{stamp}.txt"
    res: dict = {"host": a.host, "tag": a.tag, "wall_start": time.time(), "wall_end": None,
                 "start_turn": None, "target": None, "turn": None, "end": None, "why": None,
                 "readers": [str(r[0]) for r in readers], "event_history": None, "reconnects": []}

    def write_result() -> None:
        if a.result is None:
            return
        tmp = a.result.with_suffix(".tmp")
        tmp.write_text(json.dumps(res), encoding="utf-8")
        tmp.replace(a.result)

    def log(s: str) -> None:
        print(s, flush=True)

    def ended(end: str, why: str) -> None:
        res["end"], res["why"] = end, why
        log(f"    end: {end} ({why})")

    pids = game.instance_pids(a.host)
    try:
        t = _connect(a.host, a.port, a.unreachable, pids)
        t0 = lab.turn(t)
    except (Crash, TunerError) as e:
        ended("crash", str(e))
        res["wall_end"] = time.time()
        write_result()
        return 3
    held = False  # the turn lock holds turn `last`
    unsaved = False  # a save asked for under the lock, not yet written
    if a.observer:
        # a lock left standing (a watch that ended `stay`) is let go; a
        # stepped watch then starts at the first turn the lock holds, an
        # unstepped one aims the lock at its target
        res.update(step=a.step, holds=0, skips=[])
        try:
            s = lab.lock(t, "read")
            if s["id"] is not None:
                log("    " + lab.lock(t, "release")["line"])
            if a.step:
                log("    " + lab.lock(t, "target", s["turn"] + 1)["line"])
                t0 = lab.wait_hold(t, s["turn"] + 1, a.wait)["held"]
                held = True
                res["holds"] = 1
            else:
                log("    " + lab.lock(t, "target", t0 + a.turns)["line"])
        except TunerError as e:
            ended("crash", f"the turn lock: {e}")
            res["wall_end"] = time.time()
            write_result()
            return 3
    target = t0 + a.turns
    res.update(start_turn=t0, target=target, turn=t0)
    write_result()
    lp = -1 if a.observer else lab.local_player(t)
    log(f"watching {a.host} from turn {t0} to {target}"
        f" ({'observer' if a.observer else f'seat {lp}'}{', stepped' if a.step else ''})"
        f" -> {', '.join(r[0].name for r in readers)}")
    handles = [open(path, "a", encoding="utf-8") for path, _, _ in readers]

    def read() -> None:
        for fh, (_, lua, state) in zip(handles, readers):
            for ln in t.run(state, lua, timeout=60):
                fh.write(ln + "\n")
            fh.flush()

    last = t0
    fresh = True  # the readers have not read turn `last` yet
    try:
        while True:
            try:
                if fresh:
                    read()
                    fresh = False
                if last >= target:
                    ended("target", f"turn {last}")
                    break
                if a.stop_at is not None and time.time() >= a.stop_at:
                    ended("stop", "wall-clock budget")
                    break
                if a.observer:
                    if held:
                        lab.lock(t, "step")  # aims at last + 1, then lets `last` go
                        held = False
                    tn = lab.wait_turn(t, last, -1, a.wait, log, one_more_turn=True, tick=0.05 if a.step else 0.25)
                    if a.step or tn >= target:
                        # read only once the lock holds the turn
                        tn = lab.wait_hold(t, tn, a.wait)["held"]
                        held = True
                        res["holds"] += 1
                        if a.step and tn != last + 1:
                            res["skips"].append([last, tn])
                            log(f"    SKIP: held {tn} after {last}")
                else:
                    tn = lab.advance(t, "autoplay", lp, a.wait, log, one_more_turn=True)
                last, fresh = tn, True
                read()
                fresh = False
                res["turn"] = tn
                write_result()
                if a.save_every and tn % a.save_every == 0:
                    # under the lock the save is written once the turn is
                    # let go, and carries the held turn
                    log("    " + t.run(IG, save.replace("SAVENAME", f"{a.tag}_t{tn}"))[-1])
                    unsaved = held
                mb = free_mb()
                if mb < a.min_free_mb:
                    log(f"    free memory {mb:.0f} MB below {a.min_free_mb:.0f} — saving and stopping")
                    log("    " + t.run(IG, save.replace("SAVENAME", f"{a.tag}_t{tn}_oom"))[-1])
                    unsaved = held
                    ended("stop", "free memory")
                    break
                if held and tn < target:
                    lab.lock(t, "step")  # aims at tn + 1, then lets tn go
                    held = unsaved = False
                # the throughput record: wall clock and the box's free memory
                # per turn, so configurations compare turn window for turn window
                log(f"turn {tn} at {time.time():.1f} free_mb {mb:.0f}")
            except lab.GameOver as e:
                # a defeat, or a victory with no Just One More Turn to play
                # through: the game has ended short of the target
                try:
                    now_turn = lab.turn(t)
                except TunerError:
                    now_turn = last
                rec = json.dumps({"kind": "game_over", "turn": now_turn, "target": target, **e.info})
                log(f"    {rec}")
                for fh in handles:
                    fh.write(rec + "\n")
                    fh.flush()
                res["game_over"] = e.info
                ended("game_over", e.info.get("why", ""))
                break
            except lab.TurnStalled as e:
                ended("crash", f"stalled: {e}")
                break
            except TunerError as e:
                log(f"    {e} - reconnecting")
                res["reconnects"].append({"at": time.time(), "turn": last, "error": str(e)})
                write_result()
                t.close()
                t = _connect(a.host, a.port, a.unreachable, pids)
    except Crash as e:
        ended("crash", str(e))
    finally:
        for fh in handles:
            fh.close()
        res["wall_end"] = time.time()
        write_result()
    if res["end"] == "crash":
        return 3
    try:
        with open(hist, "w", encoding="utf-8", newline="\n") as fh:
            fh.write("\n".join(t.run(IG, (HERE / "event_history.lua").read_text(encoding="utf-8"), timeout=120)))
        res["event_history"] = str(hist)
        log(f"event history -> {hist.name}")
        if unsaved:
            # a save asked for under the held last turn is written only once
            # the turn is let go (an exit drops it): step one turn
            lab.lock(t, "step")
            log(f"    save of turn {last} let through; held again at {lab.wait_hold(t, last + 1, a.wait)['held']}")
        log(f"    at end ({a.at_end}): {game.finish(t, a.host, a.at_end)}")
    except TunerError as e:
        log(f"    after the end: {e}")
    if a.at_end != "close":
        t.close()
    res["wall_end"] = time.time()
    write_result()
    return 0


if __name__ == "__main__":
    sys.exit(main())
