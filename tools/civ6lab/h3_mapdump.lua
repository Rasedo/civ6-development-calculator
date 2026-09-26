-- H-3, GameCore_Tuner: the whole map, one line per row y:
--   "R <y> <plot>|<plot>|..." with plot = terrain.feature.resource.count.
--   improvement.continent.flags, flags = bits (1 NE river, 2 NW river,
--   4 W river, 8 NE cliff, 16 NW cliff, 32 W cliff, 64 starting plot)
-- then "U <player> <unit type> <x> <y>" for every unit and
-- "S <player> <x> <y>" for GetStartingPlot where it answers.
local W, H = Map.GetGridSize()
print("G " .. W .. " " .. H .. " " .. tostring(MapConfiguration.GetValue("RANDOM_SEED")) .. " "
  .. tostring(GameConfiguration.GetValue("GAME_SYNC_RANDOM_SEED")))
local function b(ok, v) return (ok and v) and 1 or 0 end
for y = 0, H - 1 do
  local row = {}
  for x = 0, W - 1 do
    local q = Map.GetPlot(x, y)
    local o1, v1 = pcall(function() return q:IsNEOfRiver() end)
    local o2, v2 = pcall(function() return q:IsNWOfRiver() end)
    local o3, v3 = pcall(function() return q:IsWOfRiver() end)
    local o4, v4 = pcall(function() return q:IsNEOfCliff() end)
    local o5, v5 = pcall(function() return q:IsNWOfCliff() end)
    local o6, v6 = pcall(function() return q:IsWOfCliff() end)
    local o7, v7 = pcall(function() return q:IsStartingPlot() end)
    local fl = b(o1, v1) + 2 * b(o2, v2) + 4 * b(o3, v3) + 8 * b(o4, v4) + 16 * b(o5, v5) + 32 * b(o6, v6) + 64 * b(o7, v7)
    row[#row + 1] = q:GetTerrainType() .. "." .. q:GetFeatureType() .. "." .. q:GetResourceType() .. "."
      .. q:GetResourceCount() .. "." .. q:GetImprovementType() .. "." .. q:GetContinentType() .. "." .. fl
  end
  print("R " .. y .. " " .. table.concat(row, "|"))
end
for p = 0, 62 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() then
    local oks, sp = pcall(function() return pl:GetStartingPlot() end)
    if oks and sp ~= nil then print("S " .. p .. " " .. sp:GetX() .. " " .. sp:GetY()) end
    for _, u in pl:GetUnits():Members() do
      print("U " .. p .. " " .. GameInfo.Units[u:GetType()].UnitType .. " " .. u:GetX() .. " " .. u:GetY())
    end
  end
end
