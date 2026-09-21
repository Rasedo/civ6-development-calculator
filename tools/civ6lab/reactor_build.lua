-- GameCore_Tuner: ask 4 needs Nuclear Power Plants to exist, and lab 2 left it
-- "waiting for a save with plants". It does not need one: the tuner's own
-- WorldBuilder city manager builds a finished district or building outright
--   WorldBuilder.CityManager():CreateDistrict(city, "DISTRICT_X", 100, plotIndex)
--   WorldBuilder.CityManager():CreateBuilding(city, "BUILDING_X", 100, plotIndex)
-- (Base/Assets/UI/WorldBuilderPlacement.lua, construction level 100 = complete).
-- Puts an Industrial Zone next to the city at ZCX:ZCY, then a Factory and a
-- Nuclear Power Plant on it, and reports what the fallout manager then counts.
--   --set ZCX=36 --set ZCY=22
local cm = WorldBuilder.CityManager()
local c = nil
for _, pl in ipairs(Players) do
  local ok, list = pcall(function() return pl:GetCities() end)
  if ok and list ~= nil then
    for _, x in list:Members() do if x:GetX() == ZCX and x:GetY() == ZCY then c = x end end
  end
end
if c == nil then print("{\"kind\":\"reactor\",\"error\":\"nocity\"}") return end
-- a free owned plot next to the centre for the district
local spot = nil
for dx = -2, 2 do
  for dy = -2, 2 do
    local okp, q = pcall(function() return Map.GetPlot(ZCX + dx, ZCY + dy) end)
    if spot == nil and okp and q ~= nil then
      local d = Map.GetPlotDistance(ZCX, ZCY, q:GetX(), q:GetY())
      if d >= 1 and d <= 2 and not q:IsWater() and not q:IsImpassable() and not q:IsMountain()
         and q:GetDistrictType() < 0 and q:GetOwner() == c:GetOwner() then
        spot = q
      end
    end
  end
end
if spot == nil then print("{\"kind\":\"reactor\",\"error\":\"nospot\"}") return end
local function try(label, f)
  local ok, a, b = pcall(f)
  print("{\"kind\":\"reactor\",\"step\":\"" .. label .. "\",\"ok\":" .. tostring(ok)
    .. ",\"status\":\"" .. tostring(a) .. "\",\"text\":\"" .. tostring(b) .. "\"}")
end
try("district", function() return cm:CreateDistrict(c, "DISTRICT_INDUSTRIAL_ZONE", 100, spot:GetIndex()) end)
try("factory", function() return cm:CreateBuilding(c, "BUILDING_FACTORY", 100, spot:GetIndex()) end)
try("reactor", function() return cm:CreateBuilding(c, "BUILDING_POWER_PLANT_NUCLEAR", 100, spot:GetIndex()) end)
try("reactorAlt", function() return cm:CreateBuilding(c, "BUILDING_NUCLEAR_POWER_PLANT", 100, spot:GetIndex()) end)
local fm = Game.GetFalloutManager()
print("{\"kind\":\"reactor\",\"city\":\"" .. c:GetName():gsub("LOC_CITY_NAME_", "")
  .. "\",\"spot\":\"" .. spot:GetX() .. ":" .. spot:GetY() .. "\""
  .. ",\"reactorCount\":" .. tostring(fm:GetReactorCount()) .. "}")
