-- InGame: everything one city and its surroundings can say about the
-- population question, before or after a strike. One JSON line per plot within
-- ZR of the centre plus one city line.
--   city line  : pop, food box, surplus, growth/starvation clocks, housing and
--                its sources, amenities, happiness, occupied, districts,
--                buildings and how many of them read pillaged
--   plot line  : owner, worked BY THIS CITY (city:GetCitizens():IsPlotWorked),
--                plot:GetWorkerCount() for contrast, improvement + its pillage
--                flag, district + complete/pillaged, resource, feature, yields,
--                fallout turns, whether fallout prevents work there
--   --set ZCX=36 --set ZCY=22 --set ZR=3 --set ZTAG=before
local c = Cities.GetCityInPlot(ZCX, ZCY)
if c == nil then print("{\"error\":\"nocity\",\"x\":" .. ZCX .. ",\"y\":" .. ZCY .. "}") return end
local cz, cb, g = c:GetCitizens(), c:GetBuildings(), c:GetGrowth()
local fm = Game.GetFalloutManager()
local function N(f, d) local ok, v = pcall(f); if ok and v ~= nil then return v end return d end
local function S(f) local ok, v = pcall(f); if ok and v ~= nil then return tostring(v) end return "err" end
local YF = GameInfo.Yields["YIELD_FOOD"].Index
local YP = GameInfo.Yields["YIELD_PRODUCTION"].Index

-- districts
local dparts, dIn, dAll = {}, 0, 0
for _, d in c:GetDistricts():Members() do
  dAll = dAll + 1
  local t = GameInfo.Districts[d:GetType()]
  local dist = Map.GetPlotDistance(ZCX, ZCY, d:GetX(), d:GetY())
  if dist <= 2 and d:IsComplete() then dIn = dIn + 1 end
  dparts[#dparts + 1] = "{\"t\":\"" .. ((t and t.DistrictType or "?"):gsub("DISTRICT_", ""))
    .. "\",\"x\":" .. d:GetX() .. ",\"y\":" .. d:GetY() .. ",\"dist\":" .. dist
    .. ",\"complete\":" .. S(function() return d:IsComplete() end)
    .. ",\"pillaged\":" .. S(function() return d:IsPillaged() end) .. "}"
end
-- buildings
local nb, nbp = 0, 0
for b in GameInfo.Buildings() do
  if cb:HasBuilding(b.Index) then
    nb = nb + 1
    if N(function() return cb:IsPillaged(b.Hash) end, false) == true then nbp = nbp + 1 end
  end
end
-- worked tiles over the whole map (a city can only work within 3, but the
-- sweep is cheap enough once and never misses a locked outlier)
local worked, workedIn, workedImp, workedImpIn, workedFallout = 0, 0, 0, 0, 0
for i = 0, Map.GetPlotCount() - 1 do
  local q = Map.GetPlotByIndex(i)
  if N(function() return cz:IsPlotWorked(q:GetX(), q:GetY()) end, false) == true then
    worked = worked + 1
    local dist = Map.GetPlotDistance(ZCX, ZCY, q:GetX(), q:GetY())
    local imp = N(function() return q:GetImprovementType() end, -1)
    if dist <= 2 then workedIn = workedIn + 1 end
    if imp ~= nil and imp >= 0 then
      workedImp = workedImp + 1
      if dist <= 2 then workedImpIn = workedImpIn + 1 end
    end
    if N(function() return fm:GetFalloutTurnsRemaining(i) end, 0) > 0 then workedFallout = workedFallout + 1 end
  end
end
print("{\"kind\":\"city\",\"stage\":\"ZTAG\",\"turn\":" .. Game.GetCurrentGameTurn()
  .. ",\"city\":\"" .. c:GetName() .. "\",\"x\":" .. ZCX .. ",\"y\":" .. ZCY
  .. ",\"owner\":" .. c:GetOwner() .. ",\"major\":" .. S(function() return Players[c:GetOwner()]:IsMajor() end)
  .. ",\"pop\":" .. c:GetPopulation()
  .. ",\"food\":" .. N(function() return g:GetFood() end, -1)
  .. ",\"foodSurplus\":" .. N(function() return g:GetFoodSurplus() end, -1)
  .. ",\"growthThreshold\":" .. N(function() return g:GetGrowthThreshold() end, -1)
  .. ",\"turnsToGrow\":" .. N(function() return g:GetTurnsUntilGrowth() end, -1)
  .. ",\"turnsToStarve\":" .. N(function() return g:GetTurnsUntilStarvation() end, -1)
  .. ",\"housing\":" .. N(function() return g:GetHousing() end, -1)
  .. ",\"housingBuildings\":" .. N(function() return g:GetHousingFromBuildings() end, -1)
  .. ",\"housingImprovements\":" .. N(function() return g:GetHousingFromImprovements() end, -1)
  .. ",\"housingDistricts\":" .. N(function() return g:GetHousingFromDistricts() end, -1)
  .. ",\"amenities\":" .. N(function() return g:GetAmenities() end, -1)
  .. ",\"amenitiesNeeded\":" .. N(function() return g:GetAmenitiesNeeded() end, -1)
  .. ",\"happiness\":" .. N(function() return g:GetHappiness() end, -1)
  .. ",\"occupied\":" .. S(function() return c:IsOccupied() end)
  .. ",\"capital\":" .. S(function() return c:IsCapital() end)
  .. ",\"originalOwner\":" .. N(function() return c:GetOriginalOwner() end, -1)
  .. ",\"districtsTotal\":" .. dAll .. ",\"districtsCompleteInBlast\":" .. dIn
  .. ",\"buildings\":" .. nb .. ",\"buildingsPillaged\":" .. nbp
  .. ",\"tilesWorked\":" .. worked .. ",\"tilesWorkedInBlast\":" .. workedIn
  .. ",\"tilesWorkedImproved\":" .. workedImp .. ",\"tilesWorkedImprovedInBlast\":" .. workedImpIn
  .. ",\"tilesWorkedWithFallout\":" .. workedFallout
  .. ",\"specialistsOrIdle\":" .. (c:GetPopulation() - (worked - 1))
  .. ",\"districts\":[" .. table.concat(dparts, ",") .. "]}")

for dx = -ZR, ZR do
  for dy = -ZR, ZR do
    local q = N(function() return Map.GetPlot(ZCX + dx, ZCY + dy) end, nil)
    if q ~= nil then
      local dist = Map.GetPlotDistance(ZCX, ZCY, q:GetX(), q:GetY())
      if dist <= ZR then
        local i = q:GetIndex()
        local imp = N(function() return q:GetImprovementType() end, -1)
        local impRow = (imp ~= nil and imp >= 0) and GameInfo.Improvements[imp] or nil
        local dt = N(function() return q:GetDistrictType() end, -1)
        local dtRow = (dt ~= nil and dt >= 0) and GameInfo.Districts[dt] or nil
        local res = N(function() return q:GetResourceType() end, -1)
        local resRow = (res ~= nil and res >= 0) and GameInfo.Resources[res] or nil
        local ft = N(function() return q:GetFeatureType() end, -1)
        local ftRow = (ft ~= nil and ft >= 0) and GameInfo.Features[ft] or nil
        print("{\"kind\":\"plot\",\"stage\":\"ZTAG\",\"city\":\"" .. c:GetName() .. "\""
          .. ",\"x\":" .. q:GetX() .. ",\"y\":" .. q:GetY() .. ",\"dist\":" .. dist
          .. ",\"owner\":" .. N(function() return q:GetOwner() end, -1)
          .. ",\"worked\":" .. S(function() return cz:IsPlotWorked(q:GetX(), q:GetY()) end)
          .. ",\"workerCount\":" .. N(function() return q:GetWorkerCount() end, -1)
          .. ",\"improvement\":\"" .. (impRow and impRow.ImprovementType:gsub("IMPROVEMENT_", "") or "-") .. "\""
          .. ",\"improvementPillaged\":" .. S(function() return q:IsImprovementPillaged() end)
          .. ",\"district\":\"" .. (dtRow and dtRow.DistrictType:gsub("DISTRICT_", "") or "-") .. "\""
          .. ",\"resource\":\"" .. (resRow and resRow.ResourceType:gsub("RESOURCE_", "") or "-") .. "\""
          .. ",\"feature\":\"" .. (ftRow and ftRow.FeatureType:gsub("FEATURE_", "") or "-") .. "\""
          .. ",\"water\":" .. S(function() return q:IsWater() end)
          .. ",\"food\":" .. N(function() return q:GetYield(YF) end, -1)
          .. ",\"prod\":" .. N(function() return q:GetYield(YP) end, -1)
          .. ",\"falloutTurns\":" .. N(function() return fm:GetFalloutTurnsRemaining(i) end, 0)
          .. ",\"falloutPreventsWork\":" .. S(function() return fm:GetFalloutPreventsWork(i) end)
          .. ",\"units\":" .. N(function() return q:GetUnitCount() end, -1) .. "}")
      end
    end
  end
end
