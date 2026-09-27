-- GameCore_Tuner (after lab_json.lua): C-74-S3 — fire sites: every Woods
-- plot with at least one Rainforest neighbour, with its Woods and Rainforest
-- neighbour counts and owner, best (most Woods + Rainforest around) first;
-- and every natural-wonder plot's terrain (the Blizzard question).
local F, J = GameInfo.Features["FEATURE_FOREST"].Index, GameInfo.Features["FEATURE_JUNGLE"].Index
local sites = {}
for i = 0, Map.GetPlotCount() - 1 do
  local q = Map.GetPlotByIndex(i)
  if q:GetFeatureType() == F then
    local nf, nj = 0, 0
    for d = 0, 5 do
      local a = Map.GetAdjacentPlot(q:GetX(), q:GetY(), d)
      if a then
        if a:GetFeatureType() == F then nf = nf + 1 end
        if a:GetFeatureType() == J then nj = nj + 1 end
      end
    end
    if nj > 0 then sites[#sites + 1] = {q:GetX(), q:GetY(), nf, nj, q:GetOwner()} end
  end
end
table.sort(sites, function(a, b) return a[3] + a[4] > b[3] + b[4] end)
local top = {}
for k = 1, math.min(15, #sites) do top[k] = sites[k] end
local nws = {}
for i = 0, Map.GetPlotCount() - 1 do
  local q = Map.GetPlotByIndex(i)
  local f = q:GetFeatureType()
  local fr = f >= 0 and GameInfo.Features[f] or nil
  if fr and fr.NaturalWonder then
    nws[#nws + 1] = {fr.FeatureType, q:GetX(), q:GetY(), GameInfo.Terrains[q:GetTerrainType()].TerrainType}
  end
end
OUT({kind = "firesites", n = #sites, top = top, wonders = nws})
