"""civ6lab watch — play a game forward by Autoplay and log every city-state
each turn (AUDIT C-38: what a city-state spends, builds and fields).

    python tools/civ6lab/watch.py --turns 250 --save-every 25 --tag lab4
    python tools/civ6lab/watch.py --host 127.0.0.3 --observer --turns 250 --tag obs3

One JSONL per run under tools/civ6lab/runs/ (`cs_watch.lua`, one line per
living city-state per turn), a named save every `--save-every` turns
(`<tag>_t<turn>`) so a later scene can start from any point, and the whole
random-event history (`event_history.lua`) at the end — GetEventsForTurn reads
any past turn, so the one-event-a-turn premise (C-74) needs no per-turn log.

Two ways to pass the turns:
* a game with a human seat: Autoplay ONE turn at a time, handing the seat
  back after each (`lab.advance`, which answers a Dedication and unsticks an
  AI's open diplomacy session);
* `--observer`, an all-AI game (`game.py new` with "all_ai": true): nobody to
  hand the seat back to, so ONE Autoplay run of all the turns, observed as
  PlayerTypes.OBSERVER — Firaxis's smoke test does exactly this — and the
  watch logs each turn as the counter moves.
`--min-free-mb` stops the run (saving first) when the box's free memory falls
below it, so a fleet of instances cannot starve the machine.
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
import lab  # noqa: E402

HERE = pathlib.Path(__file__).parent
IG = "InGame"

LUA_OBSERVE = """
AutoplayManager.SetTurns(%d)
AutoplayManager.SetObserveAsPlayer(PlayerTypes.OBSERVER)
AutoplayManager.SetActive(true)
print("autoplay " .. tostring(AutoplayManager.IsActive()))
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
    p.add_argument("--observer", action="store_true", help="an all-AI game: one Autoplay run, observed")
    p.add_argument("--min-free-mb", type=float, default=2048.0)
    p.add_argument("--wait", type=float, default=600.0, help="seconds to allow one turn")
    a = p.parse_args(argv)
    lab.RUNS.mkdir(exist_ok=True)
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = lab.RUNS / f"cs_watch_{a.tag}_{stamp}.jsonl"
    watch = (HERE / "cs_watch.lua").read_text(encoding="utf-8")
    save = (HERE / "save_named.lua").read_text(encoding="utf-8")
    t = _connect(a.host, a.port)
    t0 = lab.turn(t)
    lp = -1 if a.observer else lab.local_player(t)
    print(f"watching {a.host} from turn {t0} for {a.turns} turns"
          f" ({'observer' if a.observer else f'seat {lp}'}) -> {out.name}", flush=True)
    if a.observer:
        print("   ", t.run(lab.GC, LUA_OBSERVE % a.turns)[-1], flush=True)
    last = t0
    with open(out, "a", encoding="utf-8") as fh:
        for ln in t.run(lab.GC, watch, timeout=60):
            fh.write(ln + "\n")
        while last < t0 + a.turns:
            try:
                if a.observer:
                    tn = last
                    deadline = time.monotonic() + a.wait
                    while tn == last and time.monotonic() < deadline:
                        time.sleep(0.25)
                        tn = lab.turn(t)
                    if tn == last:
                        raise TunerError(f"turn stuck at {last} for {a.wait}s")
                else:
                    tn = lab.advance(t, "autoplay", lp, a.wait)
            except TunerError as e:
                print("   ", e, "- reconnecting", flush=True)
                t.close()
                t = _connect(a.host, a.port)
                continue
            last = tn
            for ln in t.run(lab.GC, watch, timeout=60):
                fh.write(ln + "\n")
            fh.flush()
            if a.save_every and tn % a.save_every == 0:
                print("   ", t.run(IG, save.replace("SAVENAME", f"{a.tag}_t{tn}"))[-1], flush=True)
            # the throughput record: wall clock and the box's free memory per
            # turn, so configurations compare turn window for turn window
            print(f"turn {tn} at {time.time():.1f} free_mb {free_mb():.0f}", flush=True)
            if free_mb() < a.min_free_mb:
                print(f"    free memory {free_mb():.0f} MB below {a.min_free_mb:.0f} — saving and stopping",
                      flush=True)
                print("   ", t.run(IG, save.replace("SAVENAME", f"{a.tag}_t{tn}_oom"))[-1], flush=True)
                break
    if a.observer:
        # the run's own count did not end it: two lab games ran 11 and 22
        # turns past SetTurns(250) — the watch's target is the end, so the
        # watch ends it
        print("   ", t.run(lab.GC, 'AutoplayManager.SetActive(false); print("autoplay stopped at turn "'
                                  ' .. Game.GetCurrentGameTurn())')[-1], flush=True)
    hist = lab.RUNS / f"event_history_{a.tag}_{stamp}.txt"
    hist.write_text("\n".join(t.run(IG, (HERE / "event_history.lua").read_text(encoding="utf-8"), timeout=120)),
                    encoding="utf-8")
    print("event history ->", hist.name)
    t.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
