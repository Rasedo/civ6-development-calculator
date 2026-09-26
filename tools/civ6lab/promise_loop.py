"""civ6lab promise_loop — ask 18: pass turns on a human-seat game (by
Autoplay, or `--advance endturn`: the seat's blockers answered and the turn
ended, no AI playing it), answering every AI diplomacy session with the seat
POSITIVE (the leader screen's AddResponse) instead of closing it, and log the
Don't-Settle-Near-Me promises, grievance totals and the game's grievance log
entries (`settle_watch.lua`, the city lines dropped) once before the first
turn passes — the turn of the act — and after every turn, plus every session
seen.

    python tools/civ6lab/promise_loop.py --host 127.0.0.2 --turns 10 --tag near5
    python tools/civ6lab/promise_loop.py --turns 1 --advance endturn --tag border1
"""
from __future__ import annotations

import argparse
import datetime as dt
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from tuner import Tuner  # noqa: E402
import lab  # noqa: E402

HERE = pathlib.Path(__file__).parent

# the seat is ZSEAT (the UI's local player reads -1 while Autoplay holds it)
LUA_ACCEPT = """
local me = tonumber("ZSEAT") or Game.GetLocalPlayer()
if me == nil or me < 0 then return end
for p = 0, 62 do
  if p ~= me and Players[p] ~= nil and Players[p]:IsMajor() then
    local sid = DiplomacyManager.FindOpenSessionID(p, me)
    if sid ~= nil and sid >= 0 then
      local info = DiplomacyManager.GetSessionInfo(sid)
      local parts = {}
      if info then for k, v in pairs(info) do parts[#parts + 1] = tostring(k) .. "=" .. tostring(v) end end
      pcall(function() DiplomacyManager.AddResponse(sid, me, "POSITIVE") end)
      print("session p" .. p .. " sid " .. sid .. " " .. table.concat(parts, " ") .. " -> POSITIVE")
    end
  end
end
"""


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--host", default="127.0.0.2")
    p.add_argument("--turns", type=int, default=10)
    p.add_argument("--tag", default="promise")
    p.add_argument("--wait", type=float, default=300.0)
    p.add_argument("--advance", choices=("autoplay", "endturn"), default="autoplay")
    a = p.parse_args(argv)
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = lab.RUNS / f"promise_{a.tag}_{stamp}.log"
    watch = (HERE / "settle_watch.lua").read_text(encoding="utf-8")
    t = Tuner(a.host).connect()
    lp = lab.local_player(t)
    with open(path, "w", encoding="utf-8") as fh:
        def log(s: str) -> None:
            fh.write(s + "\n")
            fh.flush()
            print(s, flush=True)
        def read() -> None:
            for ln in t.run(lab.IG, watch, timeout=60):
                if '"city"' not in ln:
                    log(ln)

        # the turn of the act (near_probe's founding lands just before this
        # call): the promise, the grievances and the log before any turn ends
        log(f"turn {lab.turn(t)} (start)")
        read()
        for _ in range(a.turns):
            # an open session is answered POSITIVE within a second; the other
            # causes (a blocker, a screen) as lab.wait_turn answers them
            lab.advance(t, a.advance, lp, a.wait, log, session_lua=LUA_ACCEPT, first=0.5, poll=1.0)
            for ln in t.run(lab.IG, LUA_ACCEPT.replace("ZSEAT", str(lp))):
                log(ln)
            read()
            log(f"turn {lab.turn(t)}")
    t.close()
    print("->", path.name)
    return 0


if __name__ == "__main__":
    sys.exit(main())
