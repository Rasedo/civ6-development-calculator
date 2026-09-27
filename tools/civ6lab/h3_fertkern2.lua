-- H-3: GetPlotFertility, second pass: adjacent mountains by count and
-- direction, under several plots P; rivers on and next to P; lakes.
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
reset()
local adj = {}
for d = 0, 5 do adj[d] = Map.GetAdjacentPlot(PX, PY, d) end
for _, pt in ipairs({0, 3, 1, 6, 9}) do
  local out = {}
  for n = 0, 6 do
    reset()
    TerrainBuilder.SetTerrainType(P, pt)
    for d = 0, n - 1 do TerrainBuilder.SetTerrainType(adj[d], 2) end
    out[#out + 1] = tostring(F(P))
  end
  print("MTN P t" .. pt .. " F with 0..6 adjacent mountains: " .. table.concat(out, " "))
end
-- one mountain in each direction
local out = {}
for d = 0, 5 do
  reset()
  TerrainBuilder.SetTerrainType(adj[d], 2)
  out[#out + 1] = tostring(F(P))
end
print("MTN dir 0..5: " .. table.concat(out, " "))
-- other adjacent kinds, 3 of them
local kinds = { {"t", 5}, {"t", 8}, {"t", 11}, {"t", 14}, {"t", 1}, {"t", 4}, {"f", 3}, {"f", 2}, {"f", 5}, {"f", 4}, {"r", 11}, {"r", 0} }
for _, k in ipairs(kinds) do
  reset()
  for d = 0, 2 do
    local q = adj[d]
    if k[1] == "t" then TerrainBuilder.SetTerrainType(q, k[2])
    elseif k[1] == "f" then TerrainBuilder.SetFeatureType(q, k[2])
    else ResourceBuilder.SetResourceType(q, k[2], 1) end
  end
  print("ADJ3 " .. k[1] .. k[2] .. " F(P) " .. F(P))
end
-- rivers: an edge of P, and an edge of a neighbour only
reset()
TerrainBuilder.SetWOfRiver(P, true, 0, 0)
print("RIVER W of P: F " .. F(P) .. " IsRiver " .. tostring(P:IsRiver()))
reset()
TerrainBuilder.SetWOfRiver(adj[1], true, 0, 0)
print("RIVER W of E-neighbour (P's E edge): F " .. F(P) .. " IsRiver " .. tostring(P:IsRiver()))
reset()
local e2 = Map.GetAdjacentPlot(adj[1]:GetX(), adj[1]:GetY(), 1)
TerrainBuilder.SetWOfRiver(e2, true, 0, 0)
print("RIVER one plot away: F " .. F(P) .. " IsRiver " .. tostring(P:IsRiver()) .. " adj " .. tostring(P:IsRiverAdjacent()))
reset()
print("RESET F " .. F(P))
