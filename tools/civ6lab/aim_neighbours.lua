-- GameCore_Tuner: the aim plot's surroundings, with the two things that move an
-- anti-air attack's strength — distance (is the tile actually ADJACENT?) and
-- terrain (hills and features give combat bonuses). The stacking test placed
-- interceptors on tiles without checking either, which is enough to explain a
-- damage change by itself.
--   --set ZAX=36 --set ZAY=15 --set ZR=2
for dx = -ZR, ZR do
  for dy = -ZR, ZR do
    local ok, q = pcall(function() return Map.GetPlot(ZAX + dx, ZAY + dy) end)
    if ok and q ~= nil then
      local d = Map.GetPlotDistance(ZAX, ZAY, q:GetX(), q:GetY())
      if d <= ZR then
        local t = GameInfo.Terrains[q:GetTerrainType()]
        local f = q:GetFeatureType() >= 0 and GameInfo.Features[q:GetFeatureType()] or nil
        print("{\"kind\":\"neighbour\",\"at\":\"" .. q:GetX() .. ":" .. q:GetY() .. "\",\"dist\":" .. d
          .. ",\"terrain\":\"" .. (t and t.TerrainType:gsub("TERRAIN_", "") or "?") .. "\""
          .. ",\"hills\":" .. tostring(q:IsHills())
          .. ",\"feature\":\"" .. (f and f.FeatureType:gsub("FEATURE_", "") or "-") .. "\""
          .. ",\"water\":" .. tostring(q:IsWater())
          .. ",\"units\":" .. q:GetUnitCount()
          .. ",\"defenceMod\":" .. tostring(q:GetDefenseModifier()) .. "}")
      end
    end
  end
end
