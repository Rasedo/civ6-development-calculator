-- GameCore_Tuner: B-94 — how `Feature_AdjacentTerrains` reads. For every
-- feature with such rows, over every plot: the count of neighbours whose
-- terrain is listed (0..6), whether the plot's own terrain is one of the
-- feature's `Feature_ValidTerrains`, and `TerrainBuilder.CanHaveFeature`'s
-- answer. One line per (feature, own-terrain-valid, listed neighbours,
-- answer) with its plot count.
local adj = {}
for r in GameInfo.Feature_AdjacentTerrains() do
  adj[r.FeatureType] = adj[r.FeatureType] or {}
  adj[r.FeatureType][GameInfo.Terrains[r.TerrainType].Index] = true
end
local valid = {}
for r in GameInfo.Feature_ValidTerrains() do
  valid[r.FeatureType] = valid[r.FeatureType] or {}
  valid[r.FeatureType][GameInfo.Terrains[r.TerrainType].Index] = true
end
for ftype, terr in pairs(adj) do
  local f = GameInfo.Features[ftype]
  local tally = {}
  for i = 0, Map.GetPlotCount() - 1 do
    local p = Map.GetPlotByIndex(i)
    local n = 0
    for d = 0, 5 do
      local q = Map.GetAdjacentPlot(p:GetX(), p:GetY(), d)
      if q and terr[q:GetTerrainType()] then n = n + 1 end
    end
    local own = valid[ftype] == nil or valid[ftype][p:GetTerrainType()] == true
    local ok, v = pcall(function() return TerrainBuilder.CanHaveFeature(p, f.Index) end)
    local key = tostring(own) .. " " .. n .. " " .. (ok and tostring(v) or "err")
    tally[key] = (tally[key] or 0) + 1
  end
  for k, c in pairs(tally) do print(ftype .. " " .. k .. " " .. c) end
end
