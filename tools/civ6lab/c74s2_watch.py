"""C-74-S2 / C-38-S2 watch: play a human-seat game forward ONE Autoplay turn
at a time and run the per-turn readers after each turn, as `watch.py` does,
with two changes the Duel games needed:

* a turn that stands still re-arms Autoplay (the nudge, after every answered
  cause and every 20 s): a Dedication answered by `commemorate.lua` leaves
  Autoplay armed but idle, and `watch.py` then waits out its whole timeout;
* a game that has been WON stops the watch (`Game.GetWinningTeam() >= 0`,
  GameCore): a Duel reaches a victory well before turn 250 unless the setup
  switches the victories off (`c74s2_games.py` does).

    python tools/civ6lab/c74s2_watch.py --host 127.0.0.4 --turns 249 --tag c74s2_duel2 \\
        --lua c74s2_turn.lua --state GameCore_Tuner

Each reader appends to `runs/<reader>_<tag>_<stamp>.jsonl`; at the end the
event history (`event_history.lua`) goes to `runs/event_history_<tag>_<stamp>.txt`,
the victory line (`c74s2_victory.lua`) to the log, and the game exits to the
main menu (`--at-end`).
"""
from __future__ import annotations

import argparse
import datetime as dt
import pathlib
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from tuner import Tuner, TunerError  # noqa: E402
import game  # noqa: E402
import lab  # noqa: E402

HERE = pathlib.Path(__file__).parent

LUA_REARM = """
AutoplayManager.SetActive(false)
AutoplayManager.SetReturnAsPlayer(ZSEAT)
AutoplayManager.SetTurns(1)
AutoplayManager.SetActive(true)
print("rearmed " .. Game.GetCurrentGameTurn())
"""
LUA_WON = 'print(tostring(Game.GetWinningTeam()))'


def _connect(host: str) -> Tuner:
    for _ in range(40):
        try:
            return Tuner(host, 4318).connect()
        except TunerError:
            time.sleep(3.0)
    raise TunerError("no tuner")


def won(t: Tuner) -> bool:
    try:
        v = t.run(lab.GC, LUA_WON)[-1]
        return v not in ("nil", "-1") and int(v) >= 0
    except (TunerError, ValueError, IndexError):
        return False


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--host", required=True)
    p.add_argument("--turns", type=int, default=249)
    p.add_argument("--tag", required=True)
    p.add_argument("--wait", type=float, default=300.0)
    p.add_argument("--lua", action="append", default=[])
    p.add_argument("--state", action="append", default=[])
    p.add_argument("--at-end", choices=game.AT_END, default="menu")
    a = p.parse_args(argv)
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    readers = [(lab.RUNS / f"{pathlib.Path(n).stem}_{a.tag}_{stamp}.jsonl", (HERE / n).read_text(encoding="utf-8"), s)
               for n, s in zip(a.lua, a.state)]

    def log(s: str) -> None:
        print(s, flush=True)

    t = _connect(a.host)
    t0 = lab.turn(t)
    target = t0 + a.turns
    lp = lab.local_player(t)
    log(f"watching {a.host} from turn {t0} to {target} (seat {lp}) -> {', '.join(r[0].name for r in readers)}")
    handles = [open(path, "a", encoding="utf-8", newline="\n") for path, _, _ in readers]

    def read() -> None:
        for fh, (path, lua, state) in zip(handles, readers):
            try:
                for ln in t.run(state, lua, timeout=60):
                    fh.write(ln + "\n")
            except TunerError as e:
                log(f"    reader {path.name} failed: {str(e)[:300]}")
            fh.flush()

    def rearm() -> None:
        try:
            out = t.run(lab.GC, LUA_REARM.replace("ZSEAT", str(lp)))
            log("    " + (out[-1] if out else "rearm: no answer"))
        except TunerError as e:
            log(f"    rearm failed: {e}")

    last = t0
    try:
        read()
        while last < target:
            if won(t):
                log(f"    the game is WON at turn {last}; stopping")
                break
            try:
                t.run(lab.GC, lab.LUA_AUTOPLAY % lp)
                tn = lab.wait_turn(t, last, lp, a.wait, log, nudge=rearm)
            except TunerError as e:
                log(f"    {e} - reconnecting")
                t.close()
                t = _connect(a.host)
                continue
            if tn <= last:
                log(f"    turn {last} did not pass in {a.wait:.0f}s")
                if won(t):
                    log(f"    the game is WON at turn {last}; stopping")
                    break
                continue
            if tn > last + 1:
                log(f"    skipped: {last} -> {tn}")
            last = tn
            read()
            log(f"turn {tn} at {time.time():.1f}")
    finally:
        for fh in handles:
            fh.close()
    hist = lab.RUNS / f"event_history_{a.tag}_{stamp}.txt"
    with open(hist, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(t.run(lab.IG, (HERE / "event_history.lua").read_text(encoding="utf-8"), timeout=120)) + "\n")
    log(f"event history -> {hist.name}")
    try:
        log("    " + t.run(lab.IG, (HERE / "c74s2_victory.lua").read_text(encoding="utf-8"))[-1])
    except TunerError as e:
        log(f"    victory read failed: {e}")
    log(f"    at end ({a.at_end}): {game.finish(t, a.host, a.at_end)}")
    if a.at_end != "close":
        t.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
