-- Any state: which builder/manager globals exist here. `_G`, `load` and
-- `rawget` are all absent from the tuner's wrapped chunk, so each name is
-- referenced literally inside a pcall.
local out = {}
local function T(n, f) local ok, v = pcall(f); out[#out + 1] = n .. "=" .. (ok and type(v) or "err") end
T("ImprovementBuilder", function() return ImprovementBuilder end)
T("BuildingBuilder", function() return BuildingBuilder end)
T("DistrictBuilder", function() return DistrictBuilder end)
T("UnitBuilder", function() return UnitBuilder end)
T("CityBuilder", function() return CityBuilder end)
T("MapManager", function() return MapManager end)
T("WorldBuilder", function() return WorldBuilder end)
T("CityManager", function() return CityManager end)
T("UnitManager", function() return UnitManager end)
T("PlayerManager", function() return PlayerManager end)
T("TerrainBuilder", function() return TerrainBuilder end)
T("ResourceBuilder", function() return ResourceBuilder end)
T("RouteBuilder", function() return RouteBuilder end)
T("Game", function() return Game end)
T("Map", function() return Map end)
T("Players", function() return Players end)
T("Cities", function() return Cities end)
T("PlayersVisibility", function() return PlayersVisibility end)
T("GameInfo", function() return GameInfo end)
print(table.concat(out, " "))
