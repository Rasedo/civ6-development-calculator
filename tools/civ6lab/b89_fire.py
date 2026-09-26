"""B-89-S1, the fired half: request one InGame action, then read the named
units in GameCore until the state stops changing (operations resolve on the
game's clock). Appends the before/after reads to the run record.

    python tools/civ6lab/b89_fire.py --host 127.0.0.2 --act condemn --unit 0:4915205 \
        --watch 6:10551298,0:4915205 --out tools/civ6lab/runs/religious_target_X.jsonl
    --act attack --unit 0:4456455 --x 35 --y 47      (MOVE_TO with the ATTACK modifier)
    --act ranged --unit 0:4522001 --x 35 --y 48      (RANGE_ATTACK at a plot)
    --act cityranged --x 36 --y 46 --tx 35 --ty 47   (the city at x,y strikes tx,ty)
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from tuner import Tuner  # noqa: E402

GC, IG = "GameCore_Tuner", "InGame"

READ = """
for p, id in string.gmatch("%s", "(%%d+):(%%d+)") do
  local u = Players[tonumber(p)]:GetUnits():FindID(tonumber(id))
  if u == nil then print(p .. ":" .. id .. " gone") else
    print(p .. ":" .. id .. " " .. GameInfo.Units[u:GetType()].UnitType .. " at=" .. u:GetX() .. ":" .. u:GetY()
      .. " owner=" .. u:GetOwner() .. " dmg=" .. u:GetDamage() .. " moves=" .. u:GetMovesRemaining()
      .. " dead=" .. tostring(u:IsDead()))
  end
end
"""

ACT = {
    "condemn": """
local u = Players[ZP]:GetUnits():FindID(ZID)
local ok, r = pcall(function() return UnitManager.RequestCommand(u, UnitCommandTypes.CONDEMN_HERETIC) end)
print("request " .. tostring(ok) .. " " .. tostring(r))
""",
    "attack": """
local u = Players[ZP]:GetUnits():FindID(ZID)
local ok, r = pcall(function() return UnitManager.RequestOperation(u, UnitOperationTypes.MOVE_TO,
  {[UnitOperationTypes.PARAM_X] = ZTX, [UnitOperationTypes.PARAM_Y] = ZTY,
   [UnitOperationTypes.PARAM_MODIFIERS] = UnitOperationMoveModifiers.ATTACK}) end)
print("request " .. tostring(ok) .. " " .. tostring(r))
""",
    "ranged": """
local u = Players[ZP]:GetUnits():FindID(ZID)
local ok, r = pcall(function() return UnitManager.RequestOperation(u, UnitOperationTypes.RANGE_ATTACK,
  {[UnitOperationTypes.PARAM_X] = ZTX, [UnitOperationTypes.PARAM_Y] = ZTY}) end)
print("request " .. tostring(ok) .. " " .. tostring(r))
""",
    "cityranged": """
local c = CityManager.GetCityAt(ZCX, ZCY)
local ok, r = pcall(function() return CityManager.RequestCommand(c, CityCommandTypes.RANGE_ATTACK,
  {[CityCommandTypes.PARAM_X] = ZTX, [CityCommandTypes.PARAM_Y] = ZTY}) end)
print("request " .. tostring(ok) .. " " .. tostring(r))
""",
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.2")
    ap.add_argument("--act", choices=sorted(ACT), required=True)
    ap.add_argument("--unit", default="0:0")
    ap.add_argument("--x", type=int, default=0)
    ap.add_argument("--y", type=int, default=0)
    ap.add_argument("--tx", type=int, default=0)
    ap.add_argument("--ty", type=int, default=0)
    ap.add_argument("--watch", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--tag", default="")
    ap.add_argument("--wait", type=float, default=8.0)
    a = ap.parse_args()
    p, uid = a.unit.split(":")
    tx, ty = (a.tx, a.ty) if a.act == "cityranged" else (a.x, a.y)
    lua = (ACT[a.act].replace("ZP", p).replace("ZID", uid).replace("ZTX", str(tx)).replace("ZTY", str(ty))
           .replace("ZCX", str(a.x)).replace("ZCY", str(a.y)))
    t = Tuner(a.host).connect()
    before = t.run(GC, READ % a.watch)
    req = t.run(IG, lua)
    # poll until two consecutive reads agree after a change, or the wait ends
    deadline = time.monotonic() + a.wait
    last = before
    after = before
    stable = 0
    while time.monotonic() < deadline:
        time.sleep(0.5)
        after = t.run(GC, READ % a.watch)
        if after == last:
            stable += 1
            if stable >= 3 and after != before:
                break
        else:
            stable = 0
        last = after
    rec = {"kind": "b89fire", "tag": a.tag, "act": a.act, "unit": a.unit, "target": [tx, ty],
           "request": req, "before": before, "after": after}
    with open(a.out, "a", encoding="utf-8") as f:
        f.write(json.dumps(rec) + "\n")
    print(json.dumps(rec, indent=1))
    t.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
