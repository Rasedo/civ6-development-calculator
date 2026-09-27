-- GameCore_Tuner: the method names on WorldBuilder's managers, a player's
-- Diplomacy object and a plot, so a setter is found, not guessed.
local function keys(label, o)
  if o == nil then print(label .. " = nil") return end
  local acc, seen = {}, {}
  local function add(t)
    if type(t) ~= "table" then return end
    for k in pairs(t) do
      if type(k) == "string" and not seen[k] then seen[k] = true; acc[#acc + 1] = k end
    end
  end
  add(o)
  local mt = getmetatable(o)
  if type(mt) == "table" then
    add(mt)
    local okx, idx = pcall(function() return mt["__index"] end)
    if okx then add(idx) end
  end
  table.sort(acc)
  print(label .. " [" .. #acc .. "] " .. table.concat(acc, " "))
end
keys("WorldBuilder", WorldBuilder)
keys("WorldBuilder.MapManager()", WorldBuilder.MapManager and WorldBuilder.MapManager())
keys("WorldBuilder.CityManager()", WorldBuilder.CityManager and WorldBuilder.CityManager())
keys("WorldBuilder.PlayerManager()", WorldBuilder.PlayerManager and WorldBuilder.PlayerManager())
keys("Players[0]:GetDiplomacy()", Players[0]:GetDiplomacy())
keys("Map.GetPlot(0,0)", Map.GetPlot(0, 0))
keys("UnitManager", UnitManager)
