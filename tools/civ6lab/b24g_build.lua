-- GameCore_Tuner (after lab_json.lua): city ZCX:ZCY of seat 0 gets population
-- ZPOP (only raised), an Industrial Zone on its first free owned ring-1 land
-- plot (once: CreateDistrict twice on a plot took the game down), then the
-- Workshop, the Factory and the plant ZPLANT, each guarded by HasBuilding.
local c = CityManager.GetCityAt(ZCX, ZCY)
if c == nil then OUT({kind = "build", error = "nocity"}) return end
local owner = c:GetOwner()
local bq, bl, ds = c:GetBuildQueue(), c:GetBuildings(), c:GetDistricts()
local iz = GameInfo.Districts["DISTRICT_INDUSTRIAL_ZONE"].Index
local rec = {kind = "build", city = c:GetID(), x = ZCX, y = ZCY}
if c:GetPopulation() < ZPOP then
  rec.pop = P(function() WorldBuilder.CityManager():SetCityValue(c, "Population", ZPOP) return true end)
end
local izPlot = -1
if ds:HasDistrict(iz) then
  local d = ds:GetDistrict(iz)
  izPlot = Map.GetPlot(d:GetX(), d:GetY()):GetIndex()
else
  local spot
  for dx = -1, 1 do for dy = -1, 1 do
    local q = Map.GetPlotXYWithRangeCheck(ZCX, ZCY, dx, dy, 1)
    if spot == nil and q and Map.GetPlotDistance(ZCX, ZCY, q:GetX(), q:GetY()) == 1 and not q:IsWater()
       and not q:IsImpassable() and not q:IsMountain() and q:GetDistrictType() < 0 and q:GetOwner() == owner
       and q:GetUnitCount() == 0 and q:GetResourceType() < 0 then
      spot = q
    end
  end end
  if spot == nil then OUT({kind = "build", error = "nospot"}) return end
  izPlot = spot:GetIndex()
  rec.district = P(function() return bq:CreateDistrict(iz, izPlot) end)
end
local q = Map.GetPlotByIndex(izPlot)
rec.iz = {q:GetX(), q:GetY()}
for _, name in ipairs({"BUILDING_WORKSHOP", "BUILDING_FACTORY", "ZPLANT"}) do
  local row = GameInfo.Buildings[name]
  if bl:HasBuilding(row.Index) then rec[name] = "already"
  else rec[name] = P(function() bq:CreateBuilding(row.Index, izPlot) return bl:HasBuilding(row.Index) end) end
end
rec.popNow = c:GetPopulation()
rec.reactors = P(function() return Game.GetFalloutManager():GetReactorCount() end)
OUT(rec)
