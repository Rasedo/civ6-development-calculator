-- H-3, GameCore_Tuner or FrontEnd: the map-option values of the running (or
-- configured) game, and the map script.
local function v(k)
  local ok, a = pcall(function() return { MapConfiguration.GetValue(k) } end)
  if not ok then return "err" end
  if #a == 0 then return "none" end
  return tostring(a[1])
end
local out = {}
for _, k in ipairs({ "temperature", "world_age", "rainfall", "sea_level", "resources", "start",
  "RANDOM_SEED", "MAP_SCRIPT", "MAP_SIZE", "civ6lab_probe" }) do
  out[#out + 1] = k .. "=" .. v(k)
end
print(table.concat(out, " "))
local okp, pv = pcall(function() return Map.GetPlotByIndex(0):GetProperty("civ6lab_mapprobe") end)
print("plot0 civ6lab_mapprobe ok=" .. tostring(okp) .. " v=" .. tostring(pv))
