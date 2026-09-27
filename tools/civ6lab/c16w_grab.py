"""C-16-S1 (lab, host 4): take an AI seat's turn while it is ACTIVE. An AI
seat's turn is active only while the turn processes (between seat 0's end of
turn and the next turn), and its spy operations are refused outside it. So:
request seat 0's end of turn, poll GameCore `Players[p]:IsTurnActive()`, and
the moment it reads true make --p local (`SetLocalPlayerAndObserver`) — a
human seat with an active turn holds the turn open. Then run each --run
(an InGame Lua file with its `K=V` tokens, comma-separated after a `?`),
each --poll first until its output contains --until, and make seat 0 local
again. One jsonl under runs/, one deadline.

    python tools/civ6lab/c16w_grab.py --p 1 --run "tools/civ6lab/c16s1_defender.lua?ZMODE=read"
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import h4  # noqa: E402

HERE = pathlib.Path(__file__).parent
GC, IG = "GameCore_Tuner", "InGame"
LUA_STATE = (HERE / "c16w_watchturn.lua").read_text(encoding="utf-8")
LUA_GRAB = """
if Players[ZOWNER]:IsTurnActive() then
  PlayerManager.SetLocalPlayerAndObserver(ZOWNER)
  print("grabbed " .. Game.GetCurrentGameTurn())
else
  print("wait " .. Game.GetCurrentGameTurn())
end
"""


def lua_of(spec: str) -> str:
    path, _, sets = spec.partition("?")
    code = pathlib.Path(path).read_text(encoding="utf-8")
    for kv in [s for s in sets.split(",") if s]:
        k, v = kv.split("=", 1)
        code = code.replace(k, v)
    return code


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="127.0.0.4")
    ap.add_argument("--p", type=int, default=1)
    ap.add_argument("--poll", default="", help="InGame Lua spec polled once a second first")
    ap.add_argument("--until", default="")
    ap.add_argument("--polls", type=int, default=20)
    ap.add_argument("--run", action="append", default=[])
    ap.add_argument("--end-turn", action="store_true", help="end the grabbed seat's turn before switching back")
    ap.add_argument("--no-endturn", action="store_true", help="do not request seat 0's end of turn first")
    ap.add_argument("--deadline", type=float, default=170.0)
    a = ap.parse_args(argv)
    h4.guard(a.deadline, "c16w_grab")
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = HERE / "runs" / f"c16w_grab_{stamp}.jsonl"
    fh = open(path, "w", encoding="utf-8", newline="\n")

    def rec(obj) -> None:
        line = obj if isinstance(obj, str) else json.dumps(obj, ensure_ascii=False)
        print(line, flush=True)
        fh.write((line if line.startswith("{") else json.dumps({"raw": line}, ensure_ascii=False)) + "\n")
        fh.flush()

    t = h4.connect(a.host)
    st = LUA_STATE.replace("ZSEAT", str(a.p))
    rec(t.run(GC, st)[-1])
    if not a.no_endturn:
        rec(t.run(IG, 'UI.RequestAction(ActionTypes.ACTION_ENDTURN); print("endturn requested")')[-1])
    grab = LUA_GRAB.replace("ZOWNER", str(a.p))
    got = False
    end = time.monotonic() + 100
    while time.monotonic() < end:
        out = t.run(GC, grab)[-1]
        if out.startswith("grabbed"):
            got = True
            rec(out)
            break
        time.sleep(0.05)
    rec(t.run(GC, st)[-1])
    if not got:
        rec("never saw the seat's turn active")
        t.close()
        return 1
    try:
        if a.poll:
            code = lua_of(a.poll)
            last = None
            for _ in range(a.polls):
                out = t.run(IG, code, timeout=20)
                if out != last:
                    for ln in out:
                        rec("poll: " + ln)
                    last = out
                if a.until and any(a.until in ln for ln in out):
                    break
                time.sleep(1.0)
        for spec in a.run:
            for ln in t.run(IG, lua_of(spec), timeout=30):
                rec("run: " + ln)
            time.sleep(1.0)
        if a.poll:
            for ln in t.run(IG, lua_of(a.poll), timeout=20):
                rec("after: " + ln)
        if a.end_turn:
            rec(t.run(IG, 'UI.RequestAction(ActionTypes.ACTION_ENDTURN); print("grabbed seat ends its turn")')[-1])
            time.sleep(1.0)
    finally:
        t.run(GC, "PlayerManager.SetLocalPlayerAndObserver(0)")
        rec(t.run(GC, st)[-1])
    t.close()
    fh.close()
    print("->", path.name)
    return 0


if __name__ == "__main__":
    sys.exit(main())
