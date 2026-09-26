"""C-34-S1, the bomb's 50% boundary: a bomber strikes an unoccupied district
under an AA gun's cover (strategic bombing = a pillage when it lands). Per
trial: reset the district's and its buildings' pillage flags (GameCore
SetPillaged), set the bomber's damage to --pre, restore its moves, set the
seed, request AIR_ATTACK on the tile (InGame), poll, then read the bomber's
damage after the anti-air answer and the district's / buildings' pillage
state. The remaining health against the pillage result is the boundary.

    python tools/civ6lab/c34_bomb50.py --host 127.0.0.2 --bomber 0:4653065 --at 35:44 --city 6:720906 \
        --district DISTRICT_HOLY_SITE --trials 0:1001,10:2002 --out tools/civ6lab/runs/air_bomb50_X.jsonl
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

LUA_RESET = """
local c = Players[%s]:GetCities():FindID(%s)
local d = c:GetDistricts():GetDistrictByType(GameInfo.Districts["%s"].Index)
local okd = pcall(function() d:SetPillaged(false) end)
local b = c:GetBuildings()
local nb = 0
for r in GameInfo.Buildings() do
  if r.PrereqDistrict == "%s" and b:HasBuilding(r.Index) then
    if pcall(function() b:SetPillaged(r.Index, false) end) then nb = nb + 1 end
  end
end
local u = Players[%s]:GetUnits():FindID(%s)
u:SetDamage(%d)
UnitManager.RestoreMovement(u)
UnitManager.RestoreUnitAttacks(u)
Game.SetRandomSeed(%d)
print("reset district=" .. tostring(okd) .. " buildings=" .. nb .. " bomberDmg=" .. u:GetDamage() .. " seed=" .. Game.GetRandomSeed())
"""

LUA_READ = """
local c = CityManager.GetCity(%s, %s)
local d = CityManager.GetDistrictAt(%s, %s)
local out = {"districtPillaged=" .. tostring(d and d:IsPillaged())}
local b = c:GetBuildings()
for r in GameInfo.Buildings() do
  if r.PrereqDistrict == "%s" and b:HasBuilding(r.Index) then
    local ok, v = pcall(function() return b:IsPillaged(r.Hash) end)
    out[#out + 1] = r.BuildingType:sub(10) .. "=" .. (ok and tostring(v) or "err")
  end
end
local u = Players[%s]:GetUnits():FindID(%s)
out[#out + 1] = "bomberDmg=" .. (u and u:GetDamage() or "gone")
print(table.concat(out, " "))
"""

LUA_FIRE = """
local u = Players[%s]:GetUnits():FindID(%s)
local p = {[UnitOperationTypes.PARAM_X] = %s, [UnitOperationTypes.PARAM_Y] = %s}
local can = UnitManager.CanStartOperation(u, UnitOperationTypes.AIR_ATTACK, nil, p)
if can then UnitManager.RequestOperation(u, UnitOperationTypes.AIR_ATTACK, p) end
print("can " .. tostring(can))
"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.2")
    ap.add_argument("--bomber", required=True)
    ap.add_argument("--at", required=True)
    ap.add_argument("--city", required=True)
    ap.add_argument("--district", required=True)
    ap.add_argument("--trials", required=True, help="pre:seed,pre:seed,...")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    bp, bid = a.bomber.split(":")
    x, y = a.at.split(":")
    cp, cid = a.city.split(":")
    t = Tuner(a.host).connect()
    for trial in a.trials.split(","):
        pre, seed = (int(v) for v in trial.split(":"))
        reset = t.run(GC, LUA_RESET % (cp, cid, a.district, a.district, bp, bid, pre, seed))[-1]
        before = t.run(IG, LUA_READ % (cp, cid, x, y, a.district, bp, bid))[-1]
        fired = t.run(IG, LUA_FIRE % (bp, bid, x, y))[-1]
        after = before
        for _ in range(24):
            time.sleep(0.5)
            after = t.run(IG, LUA_READ % (cp, cid, x, y, a.district, bp, bid))[-1]
            if after != before:
                time.sleep(1.5)
                after = t.run(IG, LUA_READ % (cp, cid, x, y, a.district, bp, bid))[-1]
                break
        seed_after = t.run(GC, "print(Game.GetRandomSeed())")[-1]
        rec = {"kind": "bomb50", "pre": pre, "seed": seed, "reset": reset, "before": before, "fired": fired,
               "after": after, "seedAfter": seed_after}
        with open(a.out, "a", encoding="utf-8") as f:
            f.write(json.dumps(rec) + "\n")
        print(json.dumps(rec))
    t.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
