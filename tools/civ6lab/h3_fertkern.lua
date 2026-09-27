-- H-3: GetPlotFertility's neighbour kernel, measured in a live game
-- (GameCore_Tuner). A disc of radius R around P is made uniform (flat
-- grassland, no feature, resource or river), then one plot Q at a time is
-- changed and F(P) read; every change is undone.
local W, H = Map.GetGridSize()
local PX, PY, R = 22, 13, 6
local P = Map.GetPlot(PX, PY)
local disc = {}
for dx = -R, R do
  for dy = -R, R do
    local q = Map.GetPlotXYWithRangeCheck(PX, PY, dx, dy, R)
    if q then disc[#disc + 1] = q end
  end
end
local function clean(q, t)
  TerrainBuilder.SetTerrainType(q, t)
  TerrainBuilder.SetFeatureType(q, -1)
  ResourceBuilder.SetResourceType(q, -1)
  pcall(function() TerrainBuilder.SetWOfRiver(q, false, -1, -1) end)
  pcall(function() TerrainBuilder.SetNWOfRiver(q, false, -1, -1) end)
  pcall(function() TerrainBuilder.SetNEOfRiver(q, false, -1, -1) end)
end
local BASE = tonumber(BASE_TERRAIN or 0)
for _, q in ipairs(disc) do clean(q, BASE) end
local function F(p) return StartPositioner.GetPlotFertility(p:GetIndex(), -1) end
local rivers = 0
for _, q in ipairs(disc) do if q:IsRiver() then rivers = rivers + 1 end end
print("BASE t" .. BASE .. " F(P) " .. F(P) .. " rivers " .. rivers .. " yields " ..
  P:GetYield(0) .. "," .. P:GetYield(1) .. "," .. P:GetYield(2) .. "," .. P:GetYield(3) .. "," .. P:GetYield(4) .. "," .. P:GetYield(5))
local f0 = F(P)
-- change kinds: terrain t (index), or feature f, or resource r
local KINDS = {
  {"t", 3}, {"t", 6}, {"t", 1}, {"t", 2}, {"t", 9}, {"t", 12}, {"t", 15}, {"t", 16},
  {"f", 3}, {"f", 2}, {"r", 0}, {"r", 5}, {"r", 11},
}
local function apply(q, k)
  if k[1] == "t" then TerrainBuilder.SetTerrainType(q, k[2])
  elseif k[1] == "f" then TerrainBuilder.SetFeatureType(q, k[2])
  else ResourceBuilder.SetResourceType(q, k[2], 1) end
end
for _, k in ipairs(KINDS) do
  local out = {}
  for d = 0, 5 do
    local q = Map.GetPlotXYWithRangeCheck(PX, PY, d, 0, d)
    if d == 0 then q = P end
    apply(q, k)
    out[#out + 1] = tostring(F(P) - f0) .. "/" .. tostring(F(q))
    clean(q, BASE)
  end
  print("K " .. k[1] .. k[2] .. " dF(P)/F(Q) at d=0..5: " .. table.concat(out, " "))
end
