-- InGame: the pillage state of a reactor's city, read with the reader lab 2
-- proved is the right one — city:GetBuildings():IsPillaged(row.Hash) — because
-- the GameCore buildings object answers the same question FALSE for a building
-- the InGame one calls pillaged. One line per building plus the district.
--   --set ZCX=36 --set ZCY=22 --set ZTAG=before
local c = Cities.GetCityInPlot(ZCX, ZCY)
if c == nil then print("{\"kind\":\"reactor-pillage\",\"error\":\"nocity\"}") return end
local cb = c:GetBuildings()
local acc = {}
for b in GameInfo.Buildings() do
  if cb:HasBuilding(b.Index) then
    local ok, p = pcall(function() return cb:IsPillaged(b.Hash) end)
    acc[#acc + 1] = "\"" .. b.BuildingType:gsub("BUILDING_", "") .. "\":" .. tostring(ok and p or "err")
  end
end
local dacc = {}
for _, d in c:GetDistricts():Members() do
  local t = GameInfo.Districts[d:GetType()]
  dacc[#dacc + 1] = "\"" .. ((t and t.DistrictType or "?"):gsub("DISTRICT_", "")) .. "\":"
    .. tostring(select(2, pcall(function() return d:IsPillaged() end)))
end
print("{\"kind\":\"reactor-pillage\",\"stage\":\"ZTAG\",\"turn\":" .. Game.GetCurrentGameTurn()
  .. ",\"city\":\"" .. c:GetName():gsub("LOC_CITY_NAME_", "") .. "\",\"pop\":" .. c:GetPopulation()
  .. ",\"buildings\":{" .. table.concat(acc, ",") .. "}"
  .. ",\"districts\":{" .. table.concat(dacc, ",") .. "}}")
