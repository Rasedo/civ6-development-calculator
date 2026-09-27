"""civ6lab h4 — one instance's short-lived, deadline-bound verbs. Every call
carries a wall-clock deadline (`--deadline`, seconds): on expiry the process
closes its tuner connection and exits 124, whatever the call was doing.

    python tools/civ6lab/h4.py --host 127.0.0.4 spawn               # start the instance if none carries -TunerIP
    python tools/civ6lab/h4.py --host 127.0.0.4 menu                # wait (<= deadline) for the main menu
    python tools/civ6lab/h4.py --host 127.0.0.4 load-start <save>   # send the load, return
    python tools/civ6lab/h4.py --host 127.0.0.4 load-wait           # wait (<= deadline) for GameCore + InGame, check the log
    python tools/civ6lab/h4.py --host 127.0.0.4 load <save>         # both, one deadline
    python tools/civ6lab/h4.py --host 127.0.0.4 lua --state InGame --file x.lua --set ZA=1
    python tools/civ6lab/h4.py --host 127.0.0.4 close

`guard(seconds)` is the same watchdog for a scene script: it arms a timer that
closes the registered tuner and exits the process.
"""
from __future__ import annotations

import argparse
import os
import pathlib
import sys
import threading
import time

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from tuner import Tuner, TunerError  # noqa: E402
import game  # noqa: E402

HERE = pathlib.Path(__file__).parent
LUA_LOG = game.USER_DIR / "Logs" / "Lua.log"
# the Lua.log offset a load starts at (scratch, per checkout)
LOGPOS = HERE.parents[1] / ".claude" / "scratchpad" / "_h4_logpos.txt"
_OPEN: list[Tuner] = []


def guard(seconds: float, what: str = "call") -> threading.Timer:
    """Arm a watchdog: after `seconds` every registered tuner is closed and
    the process exits 124."""
    def fire() -> None:
        print(f"DEADLINE {seconds:.0f}s expired during {what}; closing the connection", flush=True)
        for t in _OPEN:
            try:
                t.close()
            except Exception:  # noqa: BLE001
                pass
        os._exit(124)
    tm = threading.Timer(seconds, fire)
    tm.daemon = True
    tm.start()
    return tm


def connect(host: str, wait: float = 20.0) -> Tuner:
    t = game._connect(host, 4318, wait)
    _OPEN.append(t)
    return t


def log_size() -> int:
    try:
        return LUA_LOG.stat().st_size
    except OSError:
        return 0


def log_errors(since: int) -> list[str]:
    """Lua.log lines written after byte `since` that name an error."""
    try:
        with LUA_LOG.open("rb") as f:
            f.seek(since)
            text = f.read().decode("utf-8", errors="replace")
    except OSError:
        return []
    # the offline main menu's per-frame error (MainMenu.lua:1373) is noise
    return [ln for ln in text.splitlines()
            if ("rror" in ln or "failed" in ln.lower()) and "MainMenu.lua:1373" not in ln]


def cmd_spawn(a) -> int:
    pids = game.instance_pids(a.host)
    if pids:
        print("already running:", pids)
        return 0
    if game.up(a.host, 4318):
        print("a tuner answers on", a.host, "with no process carrying its -TunerIP; refusing")
        return 1
    game.spawn(a.host, game.CIV6_EXE)
    time.sleep(3.0)
    print("spawned:", game.instance_pids(a.host))
    return 0


def cmd_menu(a) -> int:
    t = game.wait_for_state(a.host, 4318, game.FE, max(5.0, a.deadline - 8))
    _OPEN.append(t)
    print("states:", ", ".join(sorted(t.states)))
    t.close()
    game.retile()
    return 0


def load_start(a) -> int:
    t = connect(a.host)
    states = t.refresh_states()
    where = game.IG if game.IG in states else game.FE
    (LOGPOS).write_text(str(log_size()), encoding="utf-8")
    print("   ", t.run(where, game.LUA_LOAD.replace("SAVENAME", a.name), timeout=20)[-1])
    status = "pending"
    end = time.monotonic() + 25
    while status == "pending" and time.monotonic() < end:
        time.sleep(1.0)
        try:
            status = t.run(where, game.LUA_LOAD_STATUS, timeout=5)[-1]
        except TunerError:
            status = "started"
            break
    t.close()
    print("load status:", status)
    return 1 if status == "notfound" else 0


def load_wait(a) -> int:
    probe = "print(Game.GetCurrentGameTurn())"
    left = max(5.0, a.deadline - (time.monotonic() - a.t0) - 8)
    t = game.wait_for_state(a.host, 4318, game.GC, left, probe)
    _OPEN.append(t)
    turn = t.run(game.GC, probe)[0]
    ig = game.IG in t.refresh_states()
    lp = t.run(game.IG, "print(Game.GetLocalPlayer())")[0] if ig else "?"
    try:
        since = int((LOGPOS).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        since = 0
    errs = log_errors(since)
    print(f"loaded: turn {turn} InGame={ig} local={lp} lua-log errors since the load: {len(errs)}")
    for e in errs[:10]:
        print("   LOG", e[:200])
    t.close()
    return 0 if ig else 1


def cmd_load(a) -> int:
    rc = load_start(a)
    if rc:
        return rc
    time.sleep(4.0)
    return load_wait(a)


def cmd_lua(a) -> int:
    code = pathlib.Path(a.file).read_text(encoding="utf-8") if a.file else a.code
    for kv in a.set or []:
        k, v = kv.split("=", 1)
        code = code.replace(k, v)
    t = connect(a.host)
    for ln in t.run(a.state, code, timeout=max(5.0, a.deadline - 10)):
        print(ln)
    t.close()
    return 0


def cmd_close(a) -> int:
    pids = game.close_instance(a.host)
    print(f"closed {pids}" if pids else f"no Civ 6 process carries -TunerIP {a.host}")
    return 0


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--host", default="127.0.0.4")
    p.add_argument("--deadline", type=float, default=55.0)
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("spawn").set_defaults(fn=cmd_spawn)
    sub.add_parser("menu").set_defaults(fn=cmd_menu)
    s = sub.add_parser("load-start")
    s.add_argument("name")
    s.set_defaults(fn=load_start)
    sub.add_parser("load-wait").set_defaults(fn=load_wait)
    s = sub.add_parser("load")
    s.add_argument("name")
    s.set_defaults(fn=cmd_load)
    s = sub.add_parser("lua")
    s.add_argument("code", nargs="?", default="")
    s.add_argument("--file")
    s.add_argument("--state", default=game.GC)
    s.add_argument("--set", action="append")
    s.set_defaults(fn=cmd_lua)
    sub.add_parser("close").set_defaults(fn=cmd_close)
    a = p.parse_args(argv)
    a.t0 = time.monotonic()
    guard(a.deadline, a.cmd)
    try:
        return a.fn(a)
    except TunerError as e:
        print("TUNER:", e)
        return 1


if __name__ == "__main__":
    sys.exit(main())
