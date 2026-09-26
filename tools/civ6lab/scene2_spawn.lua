-- GameCore_Tuner: spawn a list of units, one JSON line each.
--   --set ZSPEC=0:UNIT_MISSIONARY:33:45;63:UNIT_ARCHER:32:45 --set ZREL=RELIGION_ORTHODOXY
-- p = 63 means the barbarian player, whatever its slot. Religious units get
-- ZREL. Seat 0's units get their moves and attacks restored (GameCore
-- UnitManager.RestoreMovement / RestoreUnitAttacks). A tile that already holds
-- a unit is spawned on anyway (Create decides) and says so.
local function esc(s) return (tostring(s):gsub('\\', '\\\\'):gsub('"', '\\"')) end
local function P(f) local ok, v = pcall(f) if ok then return v end return "err:" .. tostring(v) end
local function out(t)
  local o = {}
  for k, v in pairs(t) do
    local s = (type(v) == "number" or type(v) == "boolean") and tostring(v) or ('"' .. esc(v) .. '"')
    o[#o + 1] = '"' .. k .. '":' .. s
  end
  print("{" .. table.concat(o, ",") .. "}")
end
local barb = -1
for p = 0, 63 do
  local pl = Players[p]
  if pl ~= nil and P(function() return pl:IsBarbarian() end) == true then barb = p end
end
for p, ty, x, y in string.gmatch("ZSPEC", "(%d+):([%w_]+):(%d+):(%d+)") do
  p, x, y = tonumber(p), tonumber(x), tonumber(y)
  if p == 63 then p = barb end
  local q = Map.GetPlot(x, y)
  local rec = {kind = "spawn", owner = p, type = ty, x = x, y = y, occupied = q:GetUnitCount()}
  local u = P(function() return Players[p]:GetUnits():Create(GameInfo.Units[ty].Index, x, y) end)
  if type(u) == "string" then rec.error = u elseif u == nil then rec.error = "nil" else
    rec.id = u:GetID()
    rec.at = u:GetX() .. ":" .. u:GetY()
    if p == 0 then
      rec.restore = tostring(P(function() UnitManager.RestoreMovement(u) UnitManager.RestoreUnitAttacks(u) return true end))
      rec.moves = u:GetMovesRemaining()
    end
    if GameInfo.Units[ty].ReligiousStrength ~= nil and (GameInfo.Units[ty].ReligiousStrength > 0 or ty == "UNIT_MISSIONARY") then
      rec.setReligion = tostring(P(function() u:GetReligion():SetReligionType("ZREL") return true end))
      rec.religion = tostring(P(function() return u:GetReligion():GetReligionType() end))
    end
  end
  out(rec)
end
