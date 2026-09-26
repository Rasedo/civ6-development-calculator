-- InGame: the pillage state of a reactor's city, read with the reader lab 2
-- proved is the right one — city:GetBuildings():IsPillaged(row.Hash) — because
-- the GameCore buildings object answers the same question FALSE for a building
-- the InGame one calls pillaged. One line per building plus the district.
--   --set ZCX=36 --set ZCY=22 --set ZTAG=before
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
local c = Cities.GetCityInPlot(ZCX, ZCY)
if c == nil then print("{\"kind\":\"reactor-pillage\",\"error\":\"nocity\"}") return end
local cb = c:GetBuildings()
local acc = {}
for b in GameInfo.Buildings() do
  if cb:HasBuilding(b.Index) then
    local ok, p = pcall(function() return cb:IsPillaged(b.Hash) end)
    acc[#acc + 1] = "\"" .. b.BuildingType:gsub("BUILDING_", "") .. "\":" .. trij(ok, p)
  end
end
local dacc = {}
for _, d in c:GetDistricts():Members() do
  local t = GameInfo.Districts[d:GetType()]
  dacc[#dacc + 1] = "\"" .. ((t and t.DistrictType or "?"):gsub("DISTRICT_", "")) .. "\":"
    .. trij(pcall(function() return d:IsPillaged() end))
end
print("{\"kind\":\"reactor-pillage\",\"stage\":\"ZTAG\",\"turn\":" .. Game.GetCurrentGameTurn()
  .. ",\"city\":\"" .. c:GetName():gsub("LOC_CITY_NAME_", "") .. "\",\"pop\":" .. c:GetPopulation()
  .. ",\"buildings\":{" .. table.concat(acc, ",") .. "}"
  .. ",\"districts\":{" .. table.concat(dacc, ",") .. "}}")
