"""C-16-S1 (lab, host 4): an AI seat's counterspy, posted through
`PlayerManager.SetLocalPlayerAndObserver`. Creates a Spy for --p on the
district plot --at (GameCore; the defender's spy never escapes, so a created
one is safe), gives it --promos (GameCore `SetPromotion`, promotions with no
level term), makes --p local, asks until `UNITOPERATION_SPY_COUNTERSPY` can
start on that plot and requests it, reads the post back while --p is local,
and makes seat 0 local again. One jsonl under runs/, one deadline.

    python tools/civ6lab/c16w_rig.py --p 1 --at 54:10 --promos PROMOTION_SPY_CAT_BURGLAR,PROMOTION_SPY_DEMOLITIONS
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

LUA_CREATE = """
local u = nil
for _, v in ipairs(Units.GetUnitsInPlot(Map.GetPlot(ZX, ZY)) or {}) do
  if v:GetOwner() == ZOWNER and v:GetType() == GameInfo.Units["UNIT_SPY"].Index then u = v end
end
local made = "held"
if u == nil then
  u = Players[ZOWNER]:GetUnits():Create(GameInfo.Units["UNIT_SPY"].Index, ZX, ZY)
  made = "created"
end
if u == nil then print('{"kind":"create","id":-1}') return end
local xp = u:GetExperience()
local got = {}
for n in string.gmatch("ZPROMOS", "([%w_]+)") do
  local ok, e = pcall(function() xp:SetPromotion(GameInfo.UnitPromotions[n].Index) end)
  got[#got + 1] = n .. "=" .. tostring(ok)
end
print('{"kind":"create","made":"' .. made .. '","id":' .. u:GetID() .. ',"promos":"' .. table.concat(got, ",") .. '"}')
"""

LUA_LOCAL = """
local ok, e = pcall(function() PlayerManager.SetLocalPlayerAndObserver(ZOWNER) end)
print('{"kind":"setlocal","p":ZOWNER,"ok":' .. tostring(ok) .. '}')
"""

# InGame, the defender local: ask / request the counterspy post
LUA_POST = """
local u = Players[Game.GetLocalPlayer()]:GetUnits():FindID(ZID)
if u == nil then print('{"kind":"post","error":"nospy","local":' .. Game.GetLocalPlayer() .. '}') return end
local op = GameInfo.UnitOperations["UNITOPERATION_SPY_COUNTERSPY"]
local okc, can = pcall(function() return UnitManager.CanStartOperation(u, op.Hash, nil, true) end)
local req = "no"
if ZGO == 1 and okc and can then
  local okr = pcall(function() UnitManager.RequestOperation(u, op.Hash, {}) end)
  req = tostring(okr)
end
local oko, sop = pcall(function() return u:GetSpyOperation() end)
local name = (oko and sop ~= nil and sop >= 0 and GameInfo.UnitOperations[sop]) and GameInfo.UnitOperations[sop].OperationType or tostring(sop)
local okl, lv = pcall(function() return u:GetExperience():GetLevel() end)
print('{"kind":"post","go":ZGO,"local":' .. Game.GetLocalPlayer() .. ',"can":"' .. (okc and tostring(can) or "err") .. '","request":"' .. req
  .. '","op":"' .. name .. '","level":"' .. tostring(lv) .. '","at":"' .. u:GetX() .. ':' .. u:GetY() .. '"}')
"""


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="127.0.0.4")
    ap.add_argument("--p", type=int, default=1)
    ap.add_argument("--at", default="54:10")
    ap.add_argument("--promos", default="")
    ap.add_argument("--spy", type=int, default=0, help="post this existing spy instead of creating one")
    ap.add_argument("--deadline", type=float, default=150.0)
    a = ap.parse_args(argv)
    h4.guard(a.deadline, "c16w_rig")
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = HERE / "runs" / f"c16w_rig_{stamp}.jsonl"
    fh = open(path, "w", encoding="utf-8", newline="\n")

    def rec(line: str) -> dict:
        print(line, flush=True)
        fh.write(line + "\n")
        fh.flush()
        return json.loads(line)

    x, y = a.at.split(":")
    t = h4.connect(a.host)
    sid = a.spy
    if not sid:
        sid = rec(t.run(GC, LUA_CREATE.replace("ZOWNER", str(a.p)).replace("ZX", x).replace("ZY", y)
                         .replace("ZPROMOS", a.promos))[-1])["id"]
        if sid < 0:
            return 1
    rec(json.dumps({"kind": "turn", "turn": t.run(GC, "print(Game.GetCurrentGameTurn())")[0]}))
    rec(t.run(GC, LUA_LOCAL.replace("ZOWNER", str(a.p)))[-1])
    try:
        post = LUA_POST.replace("ZID", str(sid))
        for _ in range(40):
            r = json.loads(t.run(IG, post.replace("ZGO", "0"))[-1])
            if r.get("can") == "true":
                break
            time.sleep(1.0)
        rec(t.run(IG, post.replace("ZGO", "1"))[-1])
        for _ in range(20):
            time.sleep(0.5)
            r = json.loads(t.run(IG, post.replace("ZGO", "0"))[-1])
            if r.get("op") == "UNITOPERATION_SPY_COUNTERSPY":
                break
        rec(json.dumps(r))
    finally:
        rec(t.run(GC, LUA_LOCAL.replace("ZOWNER", "0"))[-1])
        rec(json.dumps({"kind": "after", "local": t.run(IG, "print(Game.GetLocalPlayer())")[0],
                        "turn": t.run(GC, "print(Game.GetCurrentGameTurn())")[0]}))
    t.close()
    fh.close()
    print("->", path.name)
    return 0


if __name__ == "__main__":
    sys.exit(main())
