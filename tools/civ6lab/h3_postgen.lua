-- H-3, GameCore_Tuner at turn 1: what the map natives left behind that the
-- map dump does not carry. Lines:
--   RIVERS n=<GetNumRivers> floodable=<GetNumFloodableRivers>
--   RIVER <index> id=<GetRiverIDAtIndex> type=<GetRiverTypeAtIndex> keys=<fields of GetRiverByIndex(i, "plots")> plots=<Plots>
--   FPLOC <index> <GetFloodplainLocation or err>
--   FP <plot index> river=<GetRiverForFloodplain(x, y)>        (only plots where it is >= 0)
--   FPPLOTS <river> <GetFloodplainPlots(river)>
--   LOW <plot index>=<TerrainManager.GetCoastalLowlandType>   (only >= 0)
--   CHOKE <plot indices with IsChokepoint>
local function tri(f) local ok, v = pcall(f); if ok then return v end; return "err:" .. tostring(v) end
local function lst(t)
  if type(t) ~= "table" then return tostring(t) end
  local a = {}
  for _, v in ipairs(t) do a[#a + 1] = tostring(v) end
  return table.concat(a, ",")
end
local W, H = Map.GetGridSize()
local n = tri(function() return RiverManager.GetNumRivers() end)
print("RIVERS n=" .. tostring(n) .. " floodable=" .. tostring(tri(function() return RiverManager.GetNumFloodableRivers() end)))
if type(n) == "number" then
  for i = 0, n - 1 do
    local r = tri(function() return RiverManager.GetRiverByIndex(i, "plots") end)
    local ks = {}
    if type(r) == "table" then for k, v in pairs(r) do if type(v) ~= "table" then ks[#ks + 1] = tostring(k) .. "=" .. tostring(v) else ks[#ks + 1] = tostring(k) end end end
    table.sort(ks)
    print("RIVER " .. i .. " id=" .. tostring(tri(function() return RiverManager.GetRiverIDAtIndex(i) end))
      .. " type=" .. tostring(tri(function() return RiverManager.GetRiverTypeAtIndex(i) end))
      .. " keys=" .. table.concat(ks, "|") .. " plots=" .. (type(r) == "table" and lst(r.Plots) or tostring(r)))
    print("FPLOC " .. i .. " " .. lst(tri(function() return RiverManager.GetFloodplainLocation(i) end)))
  end
end
local seen = {}
for i = 0, W * H - 1 do
  local x, y = i % W, math.floor(i / W)
  local r = tri(function() return RiverManager.GetRiverForFloodplain(x, y) end)
  if type(r) ~= "number" or r >= 0 then
    print("FP " .. i .. " river=" .. tostring(r))
    if type(r) == "number" then seen[r] = true end
  end
end
for r, _ in pairs(seen) do print("FPPLOTS " .. r .. " " .. lst(tri(function() return RiverManager.GetFloodplainPlots(r) end))) end
local low = {}
for i = 0, W * H - 1 do
  local v = tri(function() return TerrainManager.GetCoastalLowlandType(Map.GetPlotByIndex(i)) end)
  if type(v) ~= "number" or v >= 0 then low[#low + 1] = i .. "=" .. tostring(v) end
end
print("LOW " .. table.concat(low, ","))
local ch = {}
for i = 0, W * H - 1 do
  local v = tri(function() local p = Map.GetPlotByIndex(i); return p:IsChokepoint() end)
  if v ~= false then ch[#ch + 1] = i .. "=" .. tostring(v) end
end
print("CHOKE " .. table.concat(ch, ","))
-- the direction convention: Map.GetAdjacentPlot from an even and an odd row
for _, xy in ipairs({ { 10, 10 }, { 10, 11 } }) do
  local o = {}
  for d = 0, 5 do
    local q = Map.GetAdjacentPlot(xy[1], xy[2], d)
    o[#o + 1] = d .. ":" .. (q and (q:GetX() .. "," .. q:GetY()) or "nil")
  end
  print("ADJ " .. xy[1] .. "," .. xy[2] .. " " .. table.concat(o, " "))
end
