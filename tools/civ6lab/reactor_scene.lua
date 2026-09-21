-- GameCore_Tuner: ask 4's rig, built from the socket instead of waiting for a
-- save with power plants. In Gathering Storm the reactor is BUILDING_POWER_PLANT
-- (Expansion2_Buildings: ResourceTypeConvertedToPower="RESOURCE_URANIUM"
-- NuclearReactor="true"), and it sits on an Industrial Zone behind a Workshop
-- and a Factory.
--
-- SAFETY, paid for with a crash: city:GetBuildQueue():CreateDistrict(idx, plot)
-- works, but calling it a SECOND time for a plot that already carries a
-- district took the game down. Every create below is guarded by the matching
-- Has* reader and runs at most once.
--   --set ZCX=32 --set ZCY=16 --set ZPOP=12
local c, owner = nil, -1
for _, pl in ipairs(Players) do
  local ok, list = pcall(function() return pl:GetCities() end)
  if ok and list ~= nil then
    for _, x in list:Members() do
      if x:GetX() == ZCX and x:GetY() == ZCY then c = x owner = pl:GetID() end
    end
  end
end
if c == nil then print("{\"kind\":\"reactor-scene\",\"error\":\"nocity\"}") return end
local bq, bl, ds = c:GetBuildQueue(), c:GetBuildings(), c:GetDistricts()
local iz = GameInfo.Districts["DISTRICT_INDUSTRIAL_ZONE"].Index
-- population gates how many districts a city may hold
if c:GetPopulation() < ZPOP then
  pcall(function() WorldBuilder.CityManager():SetCityValue(c, "Population", ZPOP) end)
end
local hasIZ = ds:HasDistrict(iz)
local izPlot = -1
if hasIZ then
  local okl, loc = pcall(function() return ds:GetDistrictLocation(iz) end)
  if okl and loc ~= nil then izPlot = loc end
else
  -- one free, owned, buildable ring-1 plot, chosen ONCE
  local spot = nil
  for dx = -1, 1 do
    for dy = -1, 1 do
      local okp, q = pcall(function() return Map.GetPlot(ZCX + dx, ZCY + dy) end)
      if spot == nil and okp and q ~= nil then
        local d = Map.GetPlotDistance(ZCX, ZCY, q:GetX(), q:GetY())
        if d == 1 and not q:IsWater() and not q:IsImpassable() and not q:IsMountain()
           and q:GetDistrictType() < 0 and q:GetOwner() == owner and q:GetUnitCount() == 0 then
          spot = q
        end
      end
    end
  end
  if spot == nil then print("{\"kind\":\"reactor-scene\",\"error\":\"nospot\"}") return end
  izPlot = spot:GetIndex()
  local ok, r = pcall(function() return bq:CreateDistrict(iz, izPlot) end)
  print("{\"kind\":\"reactor-scene\",\"step\":\"district\",\"plot\":\"" .. spot:GetX() .. ":" .. spot:GetY()
    .. "\",\"ok\":" .. tostring(ok) .. ",\"ret\":\"" .. tostring(r) .. "\",\"hasIZ\":" .. tostring(ds:HasDistrict(iz)) .. "}")
end
-- the building chain, each guarded by HasBuilding so nothing is placed twice
local chain = { "BUILDING_WORKSHOP", "BUILDING_FACTORY", "BUILDING_POWER_PLANT" }
for _, name in ipairs(chain) do
  local row = GameInfo.Buildings[name]
  if row == nil then
    print("{\"kind\":\"reactor-scene\",\"step\":\"" .. name .. "\",\"error\":\"norow\"}")
  elseif bl:HasBuilding(row.Index) then
    print("{\"kind\":\"reactor-scene\",\"step\":\"" .. name .. "\",\"already\":true}")
  else
    local ok, r = pcall(function() return bq:CreateBuilding(row.Index, izPlot) end)
    print("{\"kind\":\"reactor-scene\",\"step\":\"" .. name .. "\",\"ok\":" .. tostring(ok)
      .. ",\"ret\":\"" .. tostring(r) .. "\",\"has\":" .. tostring(bl:HasBuilding(row.Index)) .. "}")
  end
end
print("{\"kind\":\"reactor-scene\",\"city\":\"" .. c:GetName():gsub("LOC_CITY_NAME_", "")
  .. "\",\"pop\":" .. c:GetPopulation() .. ",\"izPlot\":" .. izPlot
  .. ",\"hasIZ\":" .. tostring(ds:HasDistrict(iz))
  .. ",\"hasPowerPlant\":" .. tostring(bl:HasBuilding(GameInfo.Buildings["BUILDING_POWER_PLANT"].Index))
  .. ",\"reactorCount\":" .. tostring(Game.GetFalloutManager():GetReactorCount()) .. "}")
