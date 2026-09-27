-- InGame: every living city-state's purse — balance, gold yield, total
-- maintenance, unit count (and how many carry maintenance), its cities with
-- position, population, amenities, need and loss to bankruptcy. One JSON
-- line per minor. Every read prints its value or "err:<msg>".
local function esc(s) return (tostring(s):gsub('[%c"\\]', function(c) return string.format("\\u%04x", c:byte()) end)) end
local function J(ok, v)
  if not ok then return '"err:' .. esc(tostring(v):match("[^\n]*")) .. '"' end
  if type(v) == "number" then return string.format("%.4g", v) end
  if type(v) == "boolean" then return tostring(v) end
  if v == nil then return "null" end
  return '"' .. esc(v) .. '"'
end
for _, p in ipairs(PlayerManager.GetAliveMinorIDs()) do
  local pl = Players[p]
  local tr = pl:GetTreasury()
  local n, paid = 0, 0
  for _, u in pl:GetUnits():Members() do
    n = n + 1
    local ok, m = pcall(function() return UnitManager.GetUnitMaintenance(u) end)
    if ok and type(m) == "number" and m > 0 then paid = paid + 1 end
  end
  local cs = {}
  for _, c in pl:GetCities():Members() do
    local g = c:GetGrowth()
    cs[#cs + 1] = string.format('{"id":%d,"x":%d,"y":%d,"pop":%d,"amen":%s,"need":%s,"lost":%s}', c:GetID(), c:GetX(), c:GetY(),
      c:GetPopulation(), J(pcall(function() return g:GetAmenities() end)), J(pcall(function() return g:GetAmenitiesNeeded() end)),
      J(pcall(function() return g:GetAmenitiesLostFromBankruptcy() end)))
  end
  print(string.format('{"kind":"minor","turn":%d,"p":%d,"civ":"%s","balance":%s,"goldYield":%s,"maintenance":%s,"units":%d,"paid":%d,"cities":[%s]}',
    Game.GetCurrentGameTurn(), p, esc(PlayerConfigurations[p]:GetCivilizationTypeName()),
    J(pcall(function() return tr:GetGoldBalance() end)), J(pcall(function() return tr:GetGoldYield() end)),
    J(pcall(function() return tr:GetTotalMaintenance() end)), n, paid, table.concat(cs, ",")))
end
