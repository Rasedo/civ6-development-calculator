-- InGame: C-60-S4, bankruptcy over the turns of insolvency. One JSON line
-- for seat ZSEAT (treasury: balance, gold yield, total maintenance; the
-- first end-turn blocker; every unit's id and type) and one per city
-- (amenities, need, lost to bankruptcy). Every read prints its value or
-- "err:<msg>".
--   --set ZSEAT=0
local function esc(s) return (tostring(s):gsub('[%c"\\]', function(c) return string.format("\\u%04x", c:byte()) end)) end
local function J(ok, v)
  if not ok then return '"err:' .. esc(tostring(v):match("[^\n]*")) .. '"' end
  if type(v) == "number" then return string.format("%.4g", v) end
  if type(v) == "boolean" then return tostring(v) end
  if v == nil then return "null" end
  return '"' .. esc(v) .. '"'
end
local me = ZSEAT
local pl = Players[me]
local tr = pl:GetTreasury()
local turn = Game.GetCurrentGameTurn()
local b = NotificationManager.GetFirstEndTurnBlocking(me)
local bname = tostring(b)
for k, v in pairs(EndTurnBlockingTypes) do if v == b then bname = k end end
local units = {}
for _, u in pl:GetUnits():Members() do
  units[#units + 1] = '[' .. u:GetID() .. ',"' .. GameInfo.Units[u:GetType()].UnitType .. '"]'
end
print(string.format('{"kind":"seat","turn":%d,"seat":%d,"balance":%s,"goldYield":%s,"maintenance":%s,"blocker":"%s","nUnits":%d,"units":[%s]}',
  turn, me, J(pcall(function() return tr:GetGoldBalance() end)), J(pcall(function() return tr:GetGoldYield() end)),
  J(pcall(function() return tr:GetTotalMaintenance() end)), bname, #units, table.concat(units, ",")))
for _, c in pl:GetCities():Members() do
  local g = c:GetGrowth()
  print(string.format('{"kind":"city","turn":%d,"id":%d,"name":"%s","pop":%d,"amenities":%s,"need":%s,"lostBankruptcy":%s,"happiness":%s}',
    turn, c:GetID(), esc(c:GetName()), c:GetPopulation(), J(pcall(function() return g:GetAmenities() end)),
    J(pcall(function() return g:GetAmenitiesNeeded() end)), J(pcall(function() return g:GetAmenitiesLostFromBankruptcy() end)),
    J(pcall(function() return g:GetHappiness() end))))
end
