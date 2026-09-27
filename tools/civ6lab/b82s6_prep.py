"""B-82-S6 prep: a save whose HUMAN seat is not the lower seat.

From a running game (the one `game.py new --config tools/civ6lab/b82s4_tie.json`
hosts; seat 0 human), play Autoplay turns returning to seat 0 until turn
`--at - 1`, then one Autoplay turn returning to `--human` (AutoplayManager
.SetReturnAsPlayer), so that seat is the local, human one; read who is human
and local; save as `--save`.

    python tools/civ6lab/b82s6_prep.py --host 127.0.0.2 --at 6 --human 1 --save b82s6_t6_h1
"""
from __future__ import annotations

import argparse
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from tuner import Tuner  # noqa: E402
import game  # noqa: E402
import lab  # noqa: E402

LUA_WHO = """
local t = {}
for p = 0, 62 do
  local pl = Players[p]
  if pl ~= nil and pl:IsMajor() then t[#t + 1] = p .. ":human=" .. tostring(pl:IsHuman()) end
end
print("turn " .. Game.GetCurrentGameTurn() .. " local " .. tostring(Game.GetLocalPlayer()) .. " " .. table.concat(t, " "))
"""


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--at", type=int, default=6, help="the turn the save is written at")
    ap.add_argument("--human", type=int, default=1, help="the seat made local for the last Autoplay turn")
    ap.add_argument("--save", required=True)
    a = ap.parse_args(argv)
    t = Tuner(a.host).connect()
    while lab.turn(t) < a.at - 1:
        lab.advance(t, "autoplay", 0, 600.0)
    print("before:", t.run(lab.IG, LUA_WHO)[-1])
    lab.advance(t, "autoplay", a.human, 600.0)
    print("after:", t.run(lab.IG, LUA_WHO)[-1])
    print("gamecore:", t.run(lab.GC, LUA_WHO.replace("Game.GetLocalPlayer()", "'-'"))[-1])
    t.close()
    return game.cmd_save(argparse.Namespace(host=a.host, port=4318, name=a.save))


if __name__ == "__main__":
    sys.exit(main())
