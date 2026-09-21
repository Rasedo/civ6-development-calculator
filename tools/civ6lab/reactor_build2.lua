-- GameCore_Tuner: build a working nuclear reactor from the socket, the way the
-- world builder's own UI does it — CreateDistrict/CreateBuilding return
-- (bStatus, sStatus) where sStatus names what is MISSING (NeededPopulation,
-- NeededTech, NeededCivic), and the UI grants it and retries
-- (Base/Assets/UI/WorldBuilderPlacement.lua:1160).
-- In Gathering Storm the reactor is BUILDING_POWER_PLANT: Expansion2_Buildings
-- gives it ResourceTypeConvertedToPower="RESOURCE_URANIUM" NuclearReactor="true".
--   --set ZCX=36 --set ZCY=22
local cm = WorldBuilder.CityManager()
local pm = WorldBuilder.PlayerManager()
local c, owner = nil, -1
for _, pl in ipairs(Players) do
  local ok, list = pcall(function() return pl:GetCities() end)
  if ok and list ~= nil then
    for _, x in list:Members() do
      if x:GetX() == ZCX and x:GetY() == ZCY then c = x owner = pl:GetID() end
    end
  end
end
if c == nil then print("{\"kind\":\"reactor2\",\"error\":\"nocity\"}") return end
local spot = nil
for dx = -2, 2 do
  for dy = -2, 2 do
    local okp, q = pcall(function() return Map.GetPlot(ZCX + dx, ZCY + dy) end)
    if spot == nil and okp and q ~= nil then
      local d = Map.GetPlotDistance(ZCX, ZCY, q:GetX(), q:GetY())
      if d >= 1 and d <= 2 and not q:IsWater() and not q:IsImpassable() and not q:IsMountain()
         and q:GetDistrictType() < 0 and q:GetOwner() == owner then spot = q end
    end
  end
end
if spot == nil then print("{\"kind\":\"reactor2\",\"error\":\"nospot\"}") return end
local function status(s)
  if type(s) ~= "table" then return "\"" .. tostring(s) .. "\"" end
  local acc = {}
  for k, v in pairs(s) do acc[#acc + 1] = "\"" .. tostring(k) .. "\":\"" .. tostring(v) .. "\"" end
  return "{" .. table.concat(acc, ",") .. "}"
end
local function place(kind, name)
  for attempt = 1, 4 do
    local ok, b, s = pcall(function()
      if kind == "d" then return cm:CreateDistrict(c, name, 100, spot:GetIndex())
      else return cm:CreateBuilding(c, name, 100, spot:GetIndex()) end
    end)
    print("{\"kind\":\"reactor2\",\"place\":\"" .. name .. "\",\"attempt\":" .. attempt
      .. ",\"ok\":" .. tostring(ok) .. ",\"result\":" .. tostring(b) .. ",\"status\":" .. status(s) .. "}")
    if not ok then return false end
    if b == true then return true end
    if type(s) ~= "table" then return false end
    local fixed = false
    if (s.NeededPopulation or 0) > 0 then
      pcall(function() cm:SetCityValue(c, "Population", s.NeededPopulation) end)
      fixed = true
    end
    if (s.NeededTech or -1) ~= -1 then
      pcall(function() pm:SetPlayerHasTech(owner, s.NeededTech, 100) end)
      fixed = true
    end
    if (s.NeededCivic or -1) ~= -1 then
      pcall(function() pm:SetPlayerHasCivic(owner, s.NeededCivic, 100) end)
      fixed = true
    end
    if not fixed then return false end
  end
  return false
end
place("d", "DISTRICT_INDUSTRIAL_ZONE")
place("b", "BUILDING_FACTORY")
place("b", "BUILDING_POWER_PLANT")
local fm = Game.GetFalloutManager()
print("{\"kind\":\"reactor2\",\"city\":\"" .. c:GetName():gsub("LOC_CITY_NAME_", "")
  .. "\",\"spot\":\"" .. spot:GetX() .. ":" .. spot:GetY() .. "\""
  .. ",\"hasFactory\":" .. tostring(c:GetBuildings():HasBuilding(GameInfo.Buildings["BUILDING_FACTORY"].Index))
  .. ",\"hasPowerPlant\":" .. tostring(c:GetBuildings():HasBuilding(GameInfo.Buildings["BUILDING_POWER_PLANT"].Index))
  .. ",\"reactorCount\":" .. tostring(fm:GetReactorCount()) .. "}")
