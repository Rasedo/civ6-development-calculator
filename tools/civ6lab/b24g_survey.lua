-- GameCore_Tuner (after lab_json.lua): seat ZP's cities (id, plot, population,
-- districts with their plots, the Factory / plant chain) and the distances
-- between them; then every land plot within ZR of city ZCID, as rows
-- "x:y owner district water/mountain/impassable".
local me = ZP
local out = {kind = "survey", seat = me, cities = {}}
local names = {"BUILDING_WORKSHOP", "BUILDING_FACTORY", "BUILDING_COAL_POWER_PLANT", "BUILDING_FOSSIL_FUEL_POWER_PLANT", "BUILDING_POWER_PLANT"}
local cl = {}
for _, c in Players[me]:GetCities():Members() do
  local e = {id = c:GetID(), x = c:GetX(), y = c:GetY(), pop = c:GetPopulation(), districts = {}, bld = {}}
  local ds = c:GetDistricts()
  for row in GameInfo.Districts() do
    if ds:HasDistrict(row.Index) then
      local loc = P(function() return ds:GetDistrictLocation(row.Index) end)
      local px, py = "?", "?"
      if type(loc) == "number" then local q = Map.GetPlotByIndex(loc); px, py = q:GetX(), q:GetY() end
      e.districts[#e.districts + 1] = row.DistrictType .. "@" .. px .. ":" .. py
    end
  end
  for _, n in ipairs(names) do
    if c:GetBuildings():HasBuilding(GameInfo.Buildings[n].Index) then e.bld[#e.bld + 1] = n end
  end
  out.cities[#out.cities + 1] = e
  cl[#cl + 1] = c
end
out.dist = {}
for i = 1, #cl do for j = i + 1, #cl do
  out.dist[#out.dist + 1] = {cl[i]:GetID(), cl[j]:GetID(), Map.GetPlotDistance(cl[i]:GetX(), cl[i]:GetY(), cl[j]:GetX(), cl[j]:GetY())}
end end
OUT(out)
local c0
for _, c in ipairs(cl) do if c:GetID() == ZCID then c0 = c end end
if c0 then
  local rows = {}
  for dx = -ZR, ZR do for dy = -ZR, ZR do
    local q = Map.GetPlotXYWithRangeCheck(c0:GetX(), c0:GetY(), dx, dy, ZR)
    if q and not q:IsWater() then
      local flags = (q:IsMountain() and "M" or "") .. (q:IsImpassable() and "I" or "") .. (q:GetUnitCount() > 0 and "u" or "")
      rows[#rows + 1] = q:GetX() .. ":" .. q:GetY() .. " o" .. q:GetOwner() .. " d" .. q:GetDistrictType() .. " r" .. q:GetResourceType() .. " " .. flags
    end
  end end
  OUT({kind = "plots", city = ZCID, r = ZR, rows = rows})
end
