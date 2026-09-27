"""C-34 (lab, host 4): an AI seat's patrol by `PlayerManager.SetLocalPlayerAndObserver`.
On the loaded `c34s1_t226_patrols`: destroy seat --p's anti-air guns within 2
of --at (so only the patrol answers a strike there), create a Fighter for --p
in the city at --spawn, make --p local, REBASE the fighter to --base, restore
its moves (GameCore), DEPLOY it over --at, and make seat 0 local again. Every
step's read goes to one jsonl under runs/. One wall-clock deadline for the
whole run (`--deadline`).

    python tools/civ6lab/c34w_rig.py --p 6 --spawn 36:42 --base 39:43 --at 36:44
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

LUA_RIG = """
local p = ZP
local out = {}
for dx = -3, 3 do for dy = -3, 3 do
  local q = Map.GetPlot(ZAX + dx, ZAY + dy)
  if q ~= nil and Map.GetPlotDistance(ZAX, ZAY, q:GetX(), q:GetY()) <= 2 then
    for _, u in ipairs(Units.GetUnitsInPlot(q) or {}) do
      local d = GameInfo.Units[u:GetType()]
      if u:GetOwner() == p and (d.AntiAirCombat or 0) > 0 then
        out[#out + 1] = d.UnitType .. "@" .. q:GetX() .. ":" .. q:GetY()
        Players[p]:GetUnits():Destroy(u)
      end
    end
  end
end end
local f = Players[p]:GetUnits():Create(GameInfo.Units["UNIT_FIGHTER"].Index, ZSX, ZSY)
print('{"kind":"rig","destroyedAA":"' .. table.concat(out, ",") .. '","fighter":' .. (f and f:GetID() or -1) .. '}')
"""

LUA_LOCAL = """
local ok, e = pcall(function() PlayerManager.SetLocalPlayerAndObserver(ZP) end)
print('{"kind":"setlocal","p":ZP,"ok":' .. tostring(ok) .. ',"err":"' .. tostring(e):gsub('"', "'") .. '"}')
"""

LUA_RESTORE = """
local u = Players[ZP]:GetUnits():FindID(ZU)
UnitManager.RestoreMovement(u)
UnitManager.RestoreUnitAttacks(u)
print('{"kind":"restore","moves":' .. u:GetMovesRemaining() .. ',"at":"' .. u:GetX() .. ':' .. u:GetY() .. '"}')
"""


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="127.0.0.4")
    ap.add_argument("--p", type=int, default=6)
    ap.add_argument("--spawn", default="36:42")
    ap.add_argument("--base", default="39:43")
    ap.add_argument("--at", default="36:44")
    ap.add_argument("--fighter", type=int, default=0, help="use this existing fighter; skip the rig")
    ap.add_argument("--skip-rebase", action="store_true")
    ap.add_argument("--deadline", type=float, default=170.0)
    a = ap.parse_args(argv)
    h4.guard(a.deadline, "c34w_rig")
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = HERE / "runs" / f"c34w_rig_{stamp}.jsonl"
    fh = open(path, "w", encoding="utf-8", newline="\n")

    def rec(line: str) -> None:
        print(line, flush=True)
        fh.write((line if line.startswith("{") else json.dumps({"raw": line}, ensure_ascii=False)) + "\n")
        fh.flush()

    t = h4.connect(a.host)
    ax, ay = a.at.split(":")
    sx, sy = a.spawn.split(":")
    bx, by = a.base.split(":")
    fid = a.fighter
    if not fid:
        out = t.run(GC, LUA_RIG.replace("ZP", str(a.p)).replace("ZAX", ax).replace("ZAY", ay)
                    .replace("ZSX", sx).replace("ZSY", sy))
        for ln in out:
            rec(ln)
        fid = json.loads(out[-1])["fighter"]
        if fid < 0:
            rec('{"kind":"abort","why":"Create refused the fighter"}')
            return 1
    for ln in t.run(GC, LUA_LOCAL.replace("ZP", str(a.p))):
        rec(ln)
    rec(json.dumps({"kind": "local_ig", "local": t.run(IG, "print(Game.GetLocalPlayer())")[0]}))
    op = (HERE / "scene2_op.lua").read_text(encoding="utf-8")

    def request(opname: str, x: str, y: str, go: int) -> dict:
        lua = op
        for k, v in (("ZU", str(fid)), ("ZOP", opname), ("ZX", x), ("ZY", y), ("ZGO", str(go))):
            lua = lua.replace(k, v)
        ln = t.run(IG, lua)[-1]
        rec(ln.replace('"kind":"op"', f'"kind":"op","go":{go}'))
        return json.loads(ln)

    def land(opname: str, x: str, y: str) -> None:
        # the switched seat's operation targets appear some seconds after the
        # switch: ask until the op can start, then request it and wait for it
        for _ in range(30):
            if request(opname, x, y, 0).get("can") == "true":
                break
            time.sleep(1.0)
        request(opname, x, y, 1)
        for _ in range(20):
            time.sleep(0.5)
            if request(opname, x, y, 0).get("at") == f"{x}:{y}":
                break

    try:
        if not a.skip_rebase:
            land("REBASE", bx, by)
            for ln in t.run(GC, LUA_RESTORE.replace("ZP", str(a.p)).replace("ZU", str(fid))):
                rec(ln)
        land("DEPLOY", ax, ay)
    finally:
        for ln in t.run(GC, LUA_LOCAL.replace("ZP", "0")):
            rec(ln)
        rec(json.dumps({"kind": "local_ig", "local": t.run(IG, "print(Game.GetLocalPlayer())")[0]}))
        rec(json.dumps({"kind": "turn", "turn": t.run(GC, "print(Game.GetCurrentGameTurn())")[0]}))
    t.close()
    fh.close()
    print("->", path.name)
    return 0


if __name__ == "__main__":
    sys.exit(main())
