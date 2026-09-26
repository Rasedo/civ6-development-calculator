-- Any state: the callable names on the managers instrument 2 leans on.
local function keys(label, o)
  if o == nil then print(label .. " = nil") return end
  local acc, seen = {}, {}
  local function add(t)
    if type(t) ~= "table" then return end
    for k, _ in pairs(t) do
      if type(k) == "string" and not seen[k] then seen[k] = true; acc[#acc + 1] = k end
    end
  end
  if type(o) == "table" then add(o) end
  local mt = getmetatable(o)
  if type(mt) == "table" then
    add(mt)
    local okx, idx = pcall(function() return mt["__index"] end)
    if okx then add(idx) end
  end
  table.sort(acc)
  print(label .. " [" .. #acc .. "] " .. table.concat(acc, " "))
end
keys("UnitManager", UnitManager)
keys("CombatManager", CombatManager)
keys("CityManager", CityManager)
local ok, tm = pcall(function() return Game.GetTradeManager() end)
keys("TradeManager", ok and tm or nil)
local okw, wb = pcall(function() return WorldBuilder end)
if okw and wb ~= nil then
  keys("WorldBuilder", wb)
  pcall(function() keys("WB.UnitManager", WorldBuilder.UnitManager()) end)
  pcall(function() keys("WB.MapManager", WorldBuilder.MapManager()) end)
  pcall(function() keys("WB.CityManager", WorldBuilder.CityManager()) end)
end
local u = nil
for _, x in Players[0]:GetUnits():Members() do u = x break end
keys("unit", u)
pcall(function() keys("unitReligion", u:GetReligion()) end)
pcall(function() keys("playerTrade", Players[0]:GetTrade()) end)
pcall(function() keys("ImprovementBuilder", ImprovementBuilder) end)
pcall(function() keys("RouteBuilder", RouteBuilder) end)
