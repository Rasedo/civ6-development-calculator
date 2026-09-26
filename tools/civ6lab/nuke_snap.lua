-- GameCore_Tuner: scene D — the ground truth around a target city, ring by
-- ring. One JSON line per plot within ZR of ZCX:ZCY, plus one for the city.
-- Fallout is a FEATURE (FEATURE_FALLOUT), not a plot field of its own.
--   --set ZCX=23 --set ZCY=26 --set ZR=3 --set ZTAG=before
local cx, cy, r = ZCX, ZCY, ZR
local city = nil
for p = 0, 62 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() then
    for _, c in pl:GetCities():Members() do
      if c:GetX() == cx and c:GetY() == cy then city = c end
    end
  end
end
local turn = Game.GetCurrentGameTurn()
print("{\"scene\":\"D\",\"tag\":\"ZTAG\",\"turn\":" .. turn .. ",\"kind\":\"city\",\"x\":" .. cx .. ",\"y\":" .. cy
  .. ",\"exists\":" .. tostring(city ~= nil)
  .. ",\"name\":\"" .. (city and city:GetName() or "-") .. "\""
  .. ",\"owner\":" .. (city and city:GetOwner() or -1)
  .. ",\"pop\":" .. (city and city:GetPopulation() or -1) .. "}")
for i = 0, Map.GetPlotCount() - 1 do
  local q = Map.GetPlotByIndex(i)
  local d = Map.GetPlotDistance(cx, cy, q:GetX(), q:GetY())
  if d <= r then
    local imp = q:GetImprovementType()
    local impName = (imp ~= nil and imp >= 0 and GameInfo.Improvements[imp] and GameInfo.Improvements[imp].ImprovementType) or "-"
    local dis = q:GetDistrictType()
    local disName = (dis ~= nil and dis >= 0 and GameInfo.Districts[dis] and GameInfo.Districts[dis].DistrictType) or "-"
    local ft = q:GetFeatureType()
    local ftName = (ft ~= nil and ft >= 0 and GameInfo.Features[ft] and GameInfo.Features[ft].FeatureType) or "-"
    local tt = q:GetTerrainType()
    local ttName = (tt ~= nil and tt >= 0 and GameInfo.Terrains[tt] and GameInfo.Terrains[tt].TerrainType) or "-"
    local res = q:GetResourceType()
    local resName = (res ~= nil and res >= 0 and GameInfo.Resources[res] and GameInfo.Resources[res].ResourceType) or "-"
    local units = {}
    for p = 0, 62 do
      local pl = Players[p]
      if pl ~= nil and pl:IsAlive() then
        for _, u in pl:GetUnits():Members() do
          if u:GetX() == q:GetX() and u:GetY() == q:GetY() then
            units[#units + 1] = "{\"p\":" .. p .. ",\"u\":\"" .. GameInfo.Units[u:GetType()].UnitType
              .. "\",\"id\":" .. u:GetID() .. ",\"dmg\":" .. u:GetDamage() .. "}"
          end
        end
      end
    end
    -- true / false / null, or "err:<msg>" when the call threw
    local function b(f)
      local ok, v = pcall(f)
      if not ok then return "\"err:" .. tostring(v):gsub('[%c"\\]', "'") .. "\"" end
      if v == nil then return "null" end
      return tostring(v)
    end
    print("{\"scene\":\"D\",\"tag\":\"ZTAG\",\"turn\":" .. turn .. ",\"kind\":\"plot\",\"ring\":" .. d
      .. ",\"x\":" .. q:GetX() .. ",\"y\":" .. q:GetY() .. ",\"owner\":" .. q:GetOwner()
      .. ",\"terrain\":\"" .. ttName .. "\",\"feature\":\"" .. ftName .. "\",\"resource\":\"" .. resName .. "\""
      .. ",\"improvement\":\"" .. impName .. "\",\"impPillaged\":" .. b(function() return q:IsImprovementPillaged() end)
      .. ",\"district\":\"" .. disName .. "\""
      .. ",\"route\":" .. tostring(q:GetRouteType()) .. ",\"routePillaged\":" .. b(function() return q:IsRoutePillaged() end)
      .. ",\"units\":[" .. table.concat(units, ",") .. "]}")
  end
end
