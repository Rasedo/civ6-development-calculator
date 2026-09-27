-- H-3: GetPlotFertility, third pass: every resource and feature on P
-- (with P's yields), snow and tundra P with mountains, a one-plot lake and
-- a coast next to P after AreaBuilder.Recalculate.
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
local function F(p) return StartPositioner.GetPlotFertility(p:GetIndex(), -1) end
local function reset() for _, q in ipairs(disc) do clean(q, 0) end end
local function ys(p) local t = {} for y = 0, 5 do t[#t + 1] = p:GetYield(y) end return table.concat(t, ",") end
reset()
for row in GameInfo.Resources() do
  reset()
  local ok = pcall(function() ResourceBuilder.SetResourceType(P, row.Index, 1) end)
  print("RES " .. row.Index .. " " .. row.ResourceType .. " " .. tostring(row.ResourceClassType) .. " F " .. F(P) ..
    " y " .. ys(P) .. " set " .. tostring(P:GetResourceType() == row.Index))
end
for row in GameInfo.Features() do
  if not row.NaturalWonder then
    reset()
    TerrainBuilder.SetFeatureType(P, row.Index)
    print("FEAT " .. row.Index .. " " .. row.FeatureType .. " F " .. F(P) .. " y " .. ys(P) ..
      " set " .. tostring(P:GetFeatureType() == row.Index))
  end
end
local adj = {}
for d = 0, 5 do adj[d] = Map.GetAdjacentPlot(PX, PY, d) end
for _, pt in ipairs({12, 13, 10, 7}) do
  local out = {}
  for n = 0, 6 do
    reset()
    TerrainBuilder.SetTerrainType(P, pt)
    for d = 0, n - 1 do TerrainBuilder.SetTerrainType(adj[d], 2) end
    out[#out + 1] = tostring(F(P))
  end
  print("MTN P t" .. pt .. " y " .. ys(P) .. " F with 0..6 adjacent mountains: " .. table.concat(out, " "))
end
reset()
TerrainBuilder.SetTerrainType(adj[1], 15)
AreaBuilder.Recalculate()
print("LAKE1 F " .. F(P) .. " fresh " .. tostring(P:IsFreshWater()) .. " lake " .. tostring(adj[1]:IsLake()) ..
  " coastal " .. tostring(P:IsCoastalLand()) .. " F(lake) " .. F(adj[1]))
reset()
AreaBuilder.Recalculate()
print("RESET F " .. F(P))
