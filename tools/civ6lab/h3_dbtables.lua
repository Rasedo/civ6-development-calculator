-- H-3, GameCore_Tuner: the live database's child tables behind
-- CanHaveFeature / CanHaveResource and the floodplains, one row a line:
-- "<table> k=v,k=v".
local names = { "Feature_AdjacentFeatures", "Feature_AdjacentTerrains", "Feature_NotAdjacentTerrains",
  "Feature_NotNearFeatures", "Feature_ValidTerrains", "Feature_Floodplains", "Resource_ValidFeatures",
  "Resource_ValidTerrains", "Resource_Conditions", "Resource_Distribution", "Resource_SeaLuxuries",
  "Resource_SeaStrategics", "Maps" }
for _, t in ipairs(names) do
  local ok, err = pcall(function()
    local n = 0
    for r in GameInfo[t]() do
      local ks = {}
      for k, v in pairs(r) do
        if type(v) ~= "function" and type(v) ~= "table" then ks[#ks + 1] = tostring(k) .. "=" .. tostring(v) end
      end
      table.sort(ks)
      print(t .. " " .. table.concat(ks, ","))
      n = n + 1
    end
    print("COUNT " .. t .. " " .. n)
  end)
  if not ok then print("ERR " .. t .. " " .. tostring(err)) end
end
for _, k in ipairs({ "LAKE_MAX_AREA_SIZE", "OCEAN_MIN_WATER_SIZE", "ICE_TILES_PERCENT", "RIVER_SOURCE_RANGE_DEFAULT",
  "RIVER_PLOTS_PER_EDGE", "START_DISTANCE_MAJOR_NATURAL_WONDER", "START_DISTANCE_MINOR_NATURAL_WONDER",
  "CLIMATE_CHANGE_PERCENT_COASTAL_LOWLANDS", "LAKE_PLOT_RANDOM" }) do
  print("GP " .. k .. "=" .. tostring(GlobalParameters[k]))
end
