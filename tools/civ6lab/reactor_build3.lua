-- GameCore_Tuner: build a nuclear reactor from the socket, satisfying whatever
-- the world builder's status table names. CreateBuilding/CreateDistrict return
-- (ok, status) and the status carries NeededDistrict / NeededBuilding /
-- NeededPopulation / NeededTech / NeededCivic as INDICES, so the chain
-- (Industrial Zone -> Workshop -> Factory -> Power Plant) can be walked
-- automatically. In Gathering Storm BUILDING_POWER_PLANT is the reactor:
-- ResourceTypeConvertedToPower="RESOURCE_URANIUM" NuclearReactor="true".
--   --set ZCX=32 --set ZCY=16 --set ZPOP=12
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
if c == nil then print("{\"kind\":\"reactor3\",\"error\":\"nocity\"}") return end
-- districts are capped by population, so lift it first
pcall(function() cm:SetCityValue(c, "Population", ZPOP) end)
local spot = nil
for dx = -2, 2 do
  for dy = -2, 2 do
    local okp, q = pcall(function() return Map.GetPlot(ZCX + dx, ZCY + dy) end)
    if spot == nil and okp and q ~= nil then
      local d = Map.GetPlotDistance(ZCX, ZCY, q:GetX(), q:GetY())
      if d == 1 and not q:IsWater() and not q:IsImpassable() and not q:IsMountain()
         and q:GetDistrictType() < 0 and q:GetOwner() == owner then spot = q end
    end
  end
end
if spot == nil then print("{\"kind\":\"reactor3\",\"error\":\"nospot\"}") return end
local function brief(s)
  if type(s) ~= "table" then return tostring(s) end
  local acc = {}
  for _, k in ipairs({ "MeetsRequirements", "FullFailure", "NeededDistrict", "NeededBuilding",
                       "NeededBuildingTheSecond", "NeededPopulation", "NeededTech", "NeededCivic",
                       "NeedsResources", "AlreadyExists" }) do
    acc[#acc + 1] = "\"" .. k .. "\":\"" .. tostring(s[k]) .. "\""
  end
  return "{" .. table.concat(acc, ",") .. "}"
end
local function step(kind, name, depth)
  if depth > 4 then return false end
  local ok, b, s = pcall(function()
    if kind == "d" then return cm:CreateDistrict(c, name, 100, spot:GetIndex())
    else return cm:CreateBuilding(c, name, 100, spot:GetIndex()) end
  end)
  print("{\"kind\":\"reactor3\",\"place\":\"" .. name .. "\",\"depth\":" .. depth
    .. ",\"ok\":" .. tostring(ok) .. ",\"result\":" .. tostring(b) .. ",\"status\":" .. brief(s) .. "}")
  if not ok or type(s) ~= "table" then return b == true end
  if b == true then return true end
  local changed = false
  if (s.NeededPopulation or 0) > 0 then
    pcall(function() cm:SetCityValue(c, "Population", s.NeededPopulation) end) changed = true
  end
  if (s.NeededTech or -1) ~= -1 then
    pcall(function() pm:SetPlayerHasTech(owner, s.NeededTech, 100) end) changed = true
  end
  if (s.NeededCivic or -1) ~= -1 then
    pcall(function() pm:SetPlayerHasCivic(owner, s.NeededCivic, 100) end) changed = true
  end
  if (s.NeededDistrict or -1) ~= -1 then
    local row = GameInfo.Districts[s.NeededDistrict]
    if row ~= nil then changed = step("d", row.DistrictType, depth + 1) or changed end
  end
  if (s.NeededBuilding or -1) ~= -1 then
    local row = GameInfo.Buildings[s.NeededBuilding]
    if row ~= nil then changed = step("b", row.BuildingType, depth + 1) or changed end
  end
  if not changed then return false end
  local ok2, b2 = pcall(function()
    if kind == "d" then return cm:CreateDistrict(c, name, 100, spot:GetIndex())
    else return cm:CreateBuilding(c, name, 100, spot:GetIndex()) end
  end)
  print("{\"kind\":\"reactor3\",\"retry\":\"" .. name .. "\",\"ok\":" .. tostring(ok2)
    .. ",\"result\":" .. tostring(b2) .. "}")
  return ok2 and b2 == true
end
step("b", "BUILDING_POWER_PLANT", 0)
local fm = Game.GetFalloutManager()
print("{\"kind\":\"reactor3\",\"city\":\"" .. c:GetName():gsub("LOC_CITY_NAME_", "")
  .. "\",\"pop\":" .. c:GetPopulation() .. ",\"spot\":\"" .. spot:GetX() .. ":" .. spot:GetY() .. "\""
  .. ",\"hasPowerPlant\":" .. tostring(c:GetBuildings():HasBuilding(GameInfo.Buildings["BUILDING_POWER_PLANT"].Index))
  .. ",\"reactorCount\":" .. tostring(fm:GetReactorCount()) .. "}")
