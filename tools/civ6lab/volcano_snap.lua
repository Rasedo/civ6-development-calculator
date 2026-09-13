-- ASK 1 / C-41: which tiles an eruption paints. GameCore_Tuner. Lists every
-- volcano; for the volcano at VX,VY (or the first one when VX is the token)
-- prints each plot within 3: distance, terrain, feature, improvement,
-- district, owner. Run before and after the eruption and diff.
local vx, vy = tonumber("VX"), tonumber("VY")
local volcanoes = {}
for i = 0, Map.GetPlotCount() - 1 do
  local ok, isv = pcall(function() return MapFeatureManager.IsVolcano(i) end)
  if ok and isv then local q = Map.GetPlotByIndex(i); volcanoes[#volcanoes + 1] = q:GetX() .. ":" .. q:GetY() end
end
print("volcanoes " .. #volcanoes .. " " .. table.concat(volcanoes, " "))
if vx == nil and #volcanoes > 0 then vx, vy = volcanoes[1]:match("(%d+):(%d+)"); vx, vy = tonumber(vx), tonumber(vy) end
if vx == nil then print("novolcano") return end
print("volcano " .. vx .. ":" .. vy .. " erupting=" .. tostring(pcall(function() return MapFeatureManager.IsVolcanoErupting(Map.GetPlot(vx, vy)) end)))
for i = 0, Map.GetPlotCount() - 1 do
  local q = Map.GetPlotByIndex(i)
  local d = Map.GetPlotDistance(vx, vy, q:GetX(), q:GetY())
  if d <= 3 then
    local f = q:GetFeatureType(); local imp = q:GetImprovementType(); local dis = q:GetDistrictType(); local res = q:GetResourceType()
    print(string.format("plot %d:%d d%d %s feat=%s res=%s imp=%s dist=%s owner=%d units=%d", q:GetX(), q:GetY(), d,
      GameInfo.Terrains[q:GetTerrainType()].TerrainType:gsub("TERRAIN_", ""),
      f >= 0 and GameInfo.Features[f].FeatureType:gsub("FEATURE_", "") or "-",
      res >= 0 and GameInfo.Resources[res].ResourceType:gsub("RESOURCE_", "") or "-",
      imp >= 0 and GameInfo.Improvements[imp].ImprovementType:gsub("IMPROVEMENT_", "") .. (q:IsImprovementPillaged() and "(P)" or "") or "-",
      dis >= 0 and GameInfo.Districts[dis].DistrictType:gsub("DISTRICT_", "") or "-", q:GetOwner(), #Units.GetUnitsInPlot(q)))
  end
end
