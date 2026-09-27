"""The B-89 tail, fired: one order from a seat-0 unit or city at a plot, with
the generator's seed set first (GameCore) and read after, and the watched
units read before and until they stop changing (orders land on the game's
clock). The attacker's moves and attacks are restored and the watched units
healed first. One JSON line appended per shot.

    python tools/civ6lab/b89t_fire.py --host 127.0.0.4 --act air --unit 0:4653065 --at 36:43 \
        --watch 6:11206661 --seed 1001 --out tools/civ6lab/runs/b89t_fire_X.jsonl
    --act ranged --unit 0:5242880 --at 37:44     (RANGE_ATTACK)
    --act city --city 36:46 --at 37:44           (the city's RANGE_ATTACK command)
    --act priority --unit 0:4653065 --at 36:44   (PRIORITY_TARGET command)
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

PREP = """
local function U(p, id) return Players[p]:GetUnits():FindID(id) end
for p, id in string.gmatch("%s", "(%%d+):(%%d+)") do
  local u = U(tonumber(p), tonumber(id))
  if u ~= nil then u:SetDamage(0) end
end
local a = %s
if a ~= nil then UnitManager.RestoreMovement(a) UnitManager.RestoreUnitAttacks(a) end
Game.SetRandomSeed(%d)
print("seed " .. Game.GetRandomSeed())
"""

READ = """
local o = {}
for p, id in string.gmatch("%s", "(%%d+):(%%d+)") do
  local u = Players[tonumber(p)]:GetUnits():FindID(tonumber(id))
  if u == nil then o[#o + 1] = p .. ":" .. id .. "=gone"
  else o[#o + 1] = p .. ":" .. id .. "=" .. u:GetOwner() .. "/" .. GameInfo.Units[u:GetType()].UnitType .. "/"
    .. u:GetDamage() .. "@" .. u:GetX() .. ":" .. u:GetY() .. "/mv" .. u:GetMovesRemaining() end
end
print(table.concat(o, " ") .. " seed=" .. Game.GetRandomSeed())
"""

REASONS = """
local function reasons(res)
  if type(res) ~= "table" then return "" end
  local fr = res[UnitOperationResults.FAILURE_REASONS] or res[UnitCommandResults.FAILURE_REASONS]
    or res[CityCommandResults.FAILURE_REASONS]
  if type(fr) ~= "table" then return "" end
  local o = {}
  for _, s in ipairs(fr) do o[#o + 1] = Locale.Lookup(s) end
  return table.concat(o, "|")
end
"""

FIRE = {
    "air": """
local u = Players[ZP]:GetUnits():FindID(ZID)
local p = {[UnitOperationTypes.PARAM_X] = ZTX, [UnitOperationTypes.PARAM_Y] = ZTY}
local can, r = UnitManager.CanStartOperation(u, UnitOperationTypes.AIR_ATTACK, nil, p, true)
local ok, q = pcall(function() return UnitManager.RequestOperation(u, UnitOperationTypes.AIR_ATTACK, p) end)
print("can " .. tostring(can) .. " why=" .. reasons(r) .. " request=" .. tostring(ok) .. ":" .. tostring(q))
""",
    "ranged": """
local u = Players[ZP]:GetUnits():FindID(ZID)
local p = {[UnitOperationTypes.PARAM_X] = ZTX, [UnitOperationTypes.PARAM_Y] = ZTY}
local can, r = UnitManager.CanStartOperation(u, UnitOperationTypes.RANGE_ATTACK, nil, p, true)
local ok, q = pcall(function() return UnitManager.RequestOperation(u, UnitOperationTypes.RANGE_ATTACK, p) end)
print("can " .. tostring(can) .. " why=" .. reasons(r) .. " request=" .. tostring(ok) .. ":" .. tostring(q))
""",
    "priority": """
local u = Players[ZP]:GetUnits():FindID(ZID)
local p = {[UnitCommandTypes.PARAM_X] = ZTX, [UnitCommandTypes.PARAM_Y] = ZTY}
local can, r = UnitManager.CanStartCommand(u, UnitCommandTypes.PRIORITY_TARGET, p, true)
local ok, q = pcall(function() return UnitManager.RequestCommand(u, UnitCommandTypes.PRIORITY_TARGET, p) end)
print("can " .. tostring(can) .. " why=" .. reasons(r) .. " request=" .. tostring(ok) .. ":" .. tostring(q))
""",
    "city": """
local c = CityManager.GetCityAt(ZCX, ZCY)
local p = {[CityCommandTypes.PARAM_X] = ZTX, [CityCommandTypes.PARAM_Y] = ZTY}
local can, r = CityManager.CanStartCommand(c, CityCommandTypes.RANGE_ATTACK, p, true)
local ok, q = pcall(function() return CityManager.RequestCommand(c, CityCommandTypes.RANGE_ATTACK, p) end)
print("can " .. tostring(can) .. " why=" .. reasons(r) .. " request=" .. tostring(ok) .. ":" .. tostring(q))
""",
}


def draws(seed: int, n: int, rng: int = 12) -> list[int]:
    s = seed & 0xFFFFFFFF
    out = []
    for _ in range(n):
        s = (1103515245 * s + 12345) & 0xFFFFFFFF
        out.append(((s >> 17) * (rng & 0xFFFF)) >> 15)
    return out


def steps(seed: int, after: int, limit: int = 50) -> int | None:
    """How many generator steps lead from seed to after (None past limit)."""
    s = seed & 0xFFFFFFFF
    want = after & 0xFFFFFFFF
    for k in range(limit + 1):
        if s == want:
            return k
        s = (1103515245 * s + 12345) & 0xFFFFFFFF
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.4")
    ap.add_argument("--act", choices=sorted(FIRE), required=True)
    ap.add_argument("--unit", default="0:0")
    ap.add_argument("--city", default="0:0")
    ap.add_argument("--at", required=True)
    ap.add_argument("--watch", required=True)
    ap.add_argument("--seed", type=int, default=1001)
    ap.add_argument("--heal", default="1")
    ap.add_argument("--out", required=True)
    ap.add_argument("--tag", default="")
    ap.add_argument("--wait", type=float, default=10.0)
    a = ap.parse_args()
    p, uid = a.unit.split(":")
    cx, cy = a.city.split(":")
    tx, ty = a.at.split(":")
    everyone = a.watch if a.act == "city" else a.unit + "," + a.watch
    t = Tuner(a.host).connect()
    att = "nil" if a.act == "city" else f"Players[{p}]:GetUnits():FindID({uid})"
    seed_line = t.run(GC, PREP % (a.watch if a.heal == "1" else "", att, a.seed))
    before = t.run(GC, READ % everyone)[-1]
    lua = REASONS + (FIRE[a.act].replace("ZP", p).replace("ZID", uid).replace("ZTX", tx).replace("ZTY", ty)
                     .replace("ZCX", cx).replace("ZCY", cy))
    fired = t.run(IG, lua)
    after = before
    last = before
    stable = 0
    deadline = time.monotonic() + a.wait
    while time.monotonic() < deadline:
        time.sleep(0.5)
        after = t.run(GC, READ % everyone)[-1]
        if after == last:
            stable += 1
            if stable >= 3 and after != before:
                break
        else:
            stable = 0
        last = after
    seed_after = int(after.rsplit("seed=", 1)[1])
    rec = {"kind": "b89tfire", "tag": a.tag, "act": a.act, "unit": a.unit, "city": a.city, "at": a.at,
           "seed": a.seed, "seedSet": seed_line, "fired": fired, "before": before, "after": after,
           "draws": steps(a.seed, seed_after), "draws12": draws(a.seed, 4)}
    with open(a.out, "a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    print(f"{a.tag} {a.act} at {a.at}: fired {fired}\n  before {before}\n  after  {after}\n  draws {rec['draws']}"
          f" draws12 {rec['draws12']}")
    t.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
