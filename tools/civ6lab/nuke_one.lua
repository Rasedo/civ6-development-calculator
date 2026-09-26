-- InGame: ONE WMD strike, so the read either side of it is unambiguous.
-- Picks the first Bomber of player 0 that is on the base tile with moves left
-- (never the stale one parked elsewhere — a bomber out of Range 10 reports
-- can=false and wastes the row), aims ZD tiles off ZCX:ZCY, and fires.
-- ZSKIP picks a DIFFERENT bomber each call. A requested strike does NOT spend
-- the bomber's moves until the operation actually executes (seconds later), so
-- a "first bomber with moves" rule hands the same unit to every call and only
-- ONE of the queued strikes ever lands.
--   --set ZCX=23 --set ZCY=26 --set ZD=0 --set ZWMD=WMD_THERMONUCLEAR_DEVICE --set ZBX=21 --set ZBY=22 --set ZSKIP=0
-- a pcall read in three states: its value, or "err:<msg>" when the call threw
local function tri(ok, v)
  local s = ok and tostring(v) or ("err:" .. tostring(v))
  return (s:gsub('[%c"\\]', function(c) return string.format("\\u%04x", c:byte()) end))
end
local function trij(ok, v)
  if ok and (type(v) == "boolean" or type(v) == "number") then return tostring(v) end
  if ok and v == nil then return "null" end
  return "\"" .. tri(ok, v) .. "\""
end
local u = nil
local seen = 0
for _, x in Players[0]:GetUnits():Members() do
  if u == nil and GameInfo.Units[x:GetType()].UnitType == "UNIT_BOMBER"
     and x:GetX() == ZBX and x:GetY() == ZBY and x:GetMovesRemaining() > 0 then
    if seen >= ZSKIP then u = x else seen = seen + 1 end
  end
end
if u == nil then print("{\"error\":\"nobomber\"}") return end
local ax, ay = ZCX, ZCY
if ZD > 0 then
  ax, ay = nil, nil
  for i = 0, Map.GetPlotCount() - 1 do
    local q = Map.GetPlotByIndex(i)
    if Map.GetPlotDistance(ZCX, ZCY, q:GetX(), q:GetY()) == ZD
       and not q:IsWater() and not q:IsImpassable() then
      ax, ay = q:GetX(), q:GetY()
      break
    end
  end
end
if ax == nil then print("{\"error\":\"noaimplot\"}") return end
local v = PlayersVisibility[0]
local params = {}
params[UnitOperationTypes.PARAM_X] = ax
params[UnitOperationTypes.PARAM_Y] = ay
params[UnitOperationTypes.PARAM_WMD_TYPE] = GameInfo.WMDs["ZWMD"].Index
local okc, can = pcall(function() return UnitManager.CanStartOperation(u, UnitOperationTypes.WMD_STRIKE, nil, params) end)
local fired = false
if okc and can then fired = pcall(function() UnitManager.RequestOperation(u, UnitOperationTypes.WMD_STRIKE, params) end) end
print("{\"scene\":\"D\",\"kind\":\"one-strike\",\"turn\":" .. Game.GetCurrentGameTurn()
  .. ",\"cx\":" .. ZCX .. ",\"cy\":" .. ZCY .. ",\"aimX\":" .. ax .. ",\"aimY\":" .. ay
  .. ",\"aimOffset\":" .. ZD .. ",\"wmd\":\"ZWMD\""
  .. ",\"bomber\":" .. u:GetID() .. ",\"bomberDist\":" .. Map.GetPlotDistance(u:GetX(), u:GetY(), ax, ay)
  .. ",\"aimRevealed\":" .. tostring(v:IsRevealed(ax, ay))
  .. ",\"can\":" .. trij(okc, can) .. ",\"fired\":" .. tostring(fired) .. "}")
