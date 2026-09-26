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
  holds its turn, so it plays by itself — the watch logs each turn as the
  counter moves and, at the target, pauses the game (`Automation.Pause`,
  UNVERIFIED from the tuner; the pause's answer is printed) before anything
  else is read.
While a turn stands still, `lab.wait_turn` reads what holds it (a blocker,
an open session, a visible screen) and answers the cause at once, with the
blind sweep only after 30 s with no named cause.
`--at-end` then decides the game's fate: `menu` exits to the main menu
(ready for the next game), `close` ends this instance's process, `stay`
leaves it. `--min-free-mb` stops the run (saving first) when the box's free
memory falls below it, so a fleet of instances cannot starve the machine.
"""
from __future__ import annotations

import argparse
import datetime as dt
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

LUA_HALT = """
local ok, err = pcall(function() Automation.Pause(true) end)
local okp, p = pcall(function() return Automation.IsPaused() end)
print("pause " .. (ok and "requested" or ("err:" .. tostring(err)))
  .. " paused " .. (okp and tostring(p) or ("err:" .. tostring(p)))
  .. " at turn " .. Game.GetCurrentGameTurn())
"""


def _connect(host: str, port: int) -> Tuner:
    for _ in range(40):
        try:
            return Tuner(host, port).connect()
        except TunerError:
            time.sleep(3.0)
    raise TunerError("no tuner")


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
    p.add_argument("--min-free-mb", type=float, default=2048.0)
    p.add_argument("--wait", type=float, default=600.0, help="seconds to allow one turn")
    p.add_argument("--lua", action="append", help="a per-turn reader (repeatable); its log is named after it")
    p.add_argument("--state", action="append", help="the Lua state of the --lua in the same position")
    p.add_argument("--at-end", choices=game.AT_END, default="menu",
                   help="at the target: exit to the main menu, close the instance, or stay")
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

    def log(s: str) -> None:
        print(s, flush=True)

    t = _connect(a.host, a.port)
    t0 = lab.turn(t)
    target = t0 + a.turns
    lp = -1 if a.observer else lab.local_player(t)
    log(f"watching {a.host} from turn {t0} to {target}"
        f" ({'observer' if a.observer else f'seat {lp}'}) -> {', '.join(r[0].name for r in readers)}")
    handles = [open(path, "a", encoding="utf-8") for path, _, _ in readers]

    def read() -> None:
        for fh, (_, lua, state) in zip(handles, readers):
            for ln in t.run(state, lua, timeout=60):
                fh.write(ln + "\n")
            fh.flush()

    last = t0
    try:
        read()
        while last < target:
            try:
                if a.observer:
                    tn = lab.wait_turn(t, last, -1, a.wait, log)
                    if tn >= target:
                        # the game plays on by itself: stop it before any read
                        log("    " + t.run(IG, LUA_HALT)[-1])
                else:
                    tn = lab.advance(t, "autoplay", lp, a.wait, log)
            except TunerError as e:
                log(f"    {e} - reconnecting")
                t.close()
                t = _connect(a.host, a.port)
                continue
            last = tn
            read()
            if a.save_every and tn % a.save_every == 0:
                log("    " + t.run(IG, save.replace("SAVENAME", f"{a.tag}_t{tn}"))[-1])
            # the throughput record: wall clock and the box's free memory per
            # turn, so configurations compare turn window for turn window
            log(f"turn {tn} at {time.time():.1f} free_mb {free_mb():.0f}")
            if free_mb() < a.min_free_mb:
                log(f"    free memory {free_mb():.0f} MB below {a.min_free_mb:.0f} — saving and stopping")
                if a.observer:
                    log("    " + t.run(IG, LUA_HALT)[-1])
                log("    " + t.run(IG, save.replace("SAVENAME", f"{a.tag}_t{tn}_oom"))[-1])
                break
    finally:
        for fh in handles:
            fh.close()
    hist = lab.RUNS / f"event_history_{a.tag}_{stamp}.txt"
    with open(hist, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(t.run(IG, (HERE / "event_history.lua").read_text(encoding="utf-8"), timeout=120)))
    log(f"event history -> {hist.name}")
    log(f"    at end ({a.at_end}): {game.finish(t, a.host, a.at_end)}")
    if a.at_end != "close":
        t.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
