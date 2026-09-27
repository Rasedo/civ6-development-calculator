-- H-3: GetPlotFertility(i, major, bCheckOthers) against (i, -1), measured in
-- a live game (GameCore_Tuner): a uniform grassland disc of radius 8 around
-- P, then single changes; majors 0 and 1, check false and true; and the
-- dependence on the distance to the players' current start plots.
local PX, PY, R = 22, 13, 8
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
local function reset() for _, q in ipairs(disc) do clean(q, 0) end end
local function F(p, m, c) return StartPositioner.GetPlotFertility(p:GetIndex(), m, c) end
local function all(p)
  return F(p, -1) .. " " .. F(p, 0, false) .. " " .. F(p, 0, true) .. " " .. F(p, 1, false) .. " " .. F(p, 1, true)
end
for pid = 0, 1 do
  local s = Players[pid]:GetStartingPlot()
  print("START " .. pid .. " " .. tostring(s and s:GetX()) .. "," .. tostring(s and s:GetY()))
end
reset()
print("BASE F(-1) F(0,f) F(0,t) F(1,f) F(1,t): " .. all(P))
-- rings: F of plots at distance d along the E direction
local out = {}
for d = 0, 7 do
  local q = Map.GetPlotXYWithRangeCheck(PX, PY, d, 0, d)
  out[#out + 1] = d .. ":" .. all(q):gsub(" ", "/")
end
print("ROW " .. table.concat(out, " "))
local kinds = { {"t", 3}, {"t", 1}, {"t", 2}, {"t", 6}, {"t", 15}, {"f", 3}, {"r", 11}, {"r", 42}, {"r", 0} }
for _, k in ipairs(kinds) do
  local res = {}
  for d = 0, 4 do
    reset()
    local q = d == 0 and P or Map.GetPlotXYWithRangeCheck(PX, PY, d, 0, d)
    if k[1] == "t" then TerrainBuilder.SetTerrainType(q, k[2])
    elseif k[1] == "f" then TerrainBuilder.SetFeatureType(q, k[2])
    else ResourceBuilder.SetResourceType(q, k[2], 1) end
    res[#res + 1] = d .. ":" .. all(P):gsub(" ", "/")
  end
  print("K " .. k[1] .. k[2] .. " " .. table.concat(res, " "))
end
reset()
print("END " .. all(P))
