-- InGame or GameCore_Tuner: the map a random event draws its sites from. Run
-- it in both states: every read is pcall'd and prints its value or
-- "err:<message>", so the record shows which state answers which call.
--   {"kind":"climate"}   GameClimate chances, the climate increase, the
--                        temperature change and the other Climate-screen reads
--                        (ClimateScreen.lua 398-452, InGame; the Get*PercentChance
--                        reads are verified in GameCore, the rest UNVERIFIED there)
--   {"kind":"rivers"}    RiverManager.GetNumRivers / GetNumFloodableRivers and
--                        the plots RiverManager.CanBeFlooded(plot) accepts
--                        (SettlerWarningIconManager.lua:57, InGame; UNVERIFIED in
--                        GameCore)
--   {"kind":"river"}     per river: GetRiverByIndex(z) and its "floodplain" and
--                        "plots" lists (Debug/Rivers.ltp, GameCore_Tuner;
--                        UNVERIFIED in InGame)
--   {"kind":"volcanoes"} MapFeatureManager.GetNumNormalVolcanoes /
--                        GetNumActiveVolcanoes / GetNumEruptions /
--                        GetNumNaturalWonderVolcanoes (ClimateScreen.lua 433-436,
--                        InGame) and GetNumVolcanoes / GetVolcanoTypeAtIndex
--                        (Debug/Random Events.ltp, TunerGameRandomEvents); all
--                        UNVERIFIED in the other state
--   {"kind":"volcano"}   per volcano plot (FEATURE_VOLCANO, IsVolcano, or a
--                        RandomEvents NaturalWonder feature): IsVolcano(index),
--                        IsActiveVolcano(plot) (PlotTooltip_Expansion2.lua:21,
--                        InGame; UNVERIFIED in GameCore), IsVolcanoErupting(plot)
--   {"kind":"terrain"}   plot counts by terrain|feature, by feature, per
--                        RandomEvent_Terrains event (all and featureless), and the
--                        drought start: featureless plots of the drought terrains
--                        by how many of their six neighbours are featureless
--                        drought terrain too
local function esc(s)
  s = tostring(s):gsub('\\', '\\\\'):gsub('"', '\\"')
  return (s:gsub('%c', function(c) return string.format('\\u%04x', c:byte()) end))
end
local function J(v, depth)
  local t = type(v)
  depth = depth or 0
  if v == nil then return "null" end
  if t == "boolean" then return tostring(v) end
  if t == "number" then
    if v ~= v or v == math.huge or v == -math.huge then return '"' .. tostring(v) .. '"' end
    if v == math.floor(v) and math.abs(v) < 1e15 then return string.format("%d", v) end
    return string.format("%.10g", v)
  end
  if t == "table" then
    if depth > 5 then return '"<deep>"' end
    local n, count, arr = #v, 0, true
    for k in pairs(v) do count = count + 1; if type(k) ~= "number" then arr = false end end
    local parts = {}
    if arr and count == n then
      for i = 1, n do parts[i] = J(v[i], depth + 1) end
      return "[" .. table.concat(parts, ",") .. "]"
    end
    local keys = {}
    for k in pairs(v) do keys[#keys + 1] = k end
    table.sort(keys, function(a, b) return tostring(a) < tostring(b) end)
    for _, k in ipairs(keys) do parts[#parts + 1] = '"' .. esc(k) .. '":' .. J(v[k], depth + 1) end
    return "{" .. table.concat(parts, ",") .. "}"
  end
  return '"' .. esc(v) .. '"'
end
local function P(f)
  local ok, v = pcall(f)
  if ok then return v end
  return "err:" .. tostring(v)
end

local turn = Game.GetCurrentGameTurn()
local w, h = Map.GetGridSize()
local nplots = Map.GetPlotCount()

-- the climate
local cl = {}
for _, name in ipairs({"GetFloodPercentChance", "GetStormPercentChance", "GetDroughtPercentChance",
    "GetEruptionPercentChance", "GetFirePercentChance", "GetFloodClimateIncreasedChance",
    "GetStormClimateIncreasedChance", "GetDroughtClimateIncreasedChance", "GetTemperatureChange",
    "GetClimateChangeLevel", "GetTotalCO2Footprint", "GetCO2FootprintModifier", "GetDeforestationType",
    "GetTilesFlooded", "GetTilesSubmerged", "GetNextSeaLevelRiseTurns", "GetNextIceLossTurns"}) do
  cl[name] = P(function() return GameClimate[name]() end)
end
local realism = P(function() return GameConfiguration.GetValue("GAME_REALISM") end)
local pva = nil
for r in GameInfo.RealismSettings() do
  if tonumber(r.Index) == tonumber(realism) then pva = {r.RealismSettingType, r.PercentVolcanoesActive} end
end
print('{"kind":"climate","turn":' .. turn .. ',"grid":[' .. w .. ',' .. h .. '],"plots":' .. nplots
  .. ',"realism":' .. J(realism) .. ',"realismSetting":' .. J(pva) .. ',"climate":' .. J(cl) .. '}')

-- the rivers
local nr = P(function() return RiverManager.GetNumRivers() end)
local floodable = {}
local floodErr = nil
for i = 0, nplots - 1 do
  local q = Map.GetPlotByIndex(i)
  local v = P(function() return RiverManager.CanBeFlooded(q) end)
  if v == true then floodable[#floodable + 1] = i
  elseif type(v) == "string" then floodErr = v; break end
end
print('{"kind":"rivers","turn":' .. turn .. ',"numRivers":' .. J(nr)
  .. ',"numFloodable":' .. J(P(function() return RiverManager.GetNumFloodableRivers() end))
  .. ',"canBeFlooded":' .. J(floodErr or floodable) .. '}')
if type(nr) == "number" then
  for z = 0, nr - 1 do
    local base = P(function() return RiverManager.GetRiverByIndex(z) end)
    local fp = P(function() return RiverManager.GetRiverByIndex(z, "floodplain") end)
    local pl = P(function() return RiverManager.GetRiverByIndex(z, "plots") end)
    local named = nil
    if type(base) == "table" and base.TypeID ~= nil then
      local row = GameInfo.NamedRivers[base.TypeID]
      named = row and row.NamedRiverType
    end
    print('{"kind":"river","turn":' .. turn .. ',"z":' .. z .. ',"river":' .. J(base) .. ',"named":' .. J(named)
      .. ',"floodplain":' .. J(type(fp) == "table" and (fp.Floodplain or fp) or fp)
      .. ',"plots":' .. J(type(pl) == "table" and (pl.Plots or pl) or pl) .. '}')
  end
end

-- the volcanoes
local vc = {}
for _, name in ipairs({"GetNumNormalVolcanoes", "GetNumActiveVolcanoes", "GetNumEruptions",
    "GetNumNaturalWonderVolcanoes", "GetNumVolcanoes"}) do
  vc[name] = P(function() return MapFeatureManager[name]() end)
end
local vtypes = {}
if type(vc.GetNumVolcanoes) == "number" then
  for z = 0, vc.GetNumVolcanoes - 1 do
    local vt = P(function() return MapFeatureManager.GetVolcanoTypeAtIndex(z) end)
    local row = type(vt) == "number" and GameInfo.NamedVolcanoes[vt] or nil
    vtypes[#vtypes + 1] = {vt, row and row.NamedVolcanoType}
  end
end
vc.volcanoTypes = vtypes
print('{"kind":"volcanoes","turn":' .. turn .. ',"counts":' .. J(vc) .. '}')
local fVolcano = GameInfo.Features["FEATURE_VOLCANO"] and GameInfo.Features["FEATURE_VOLCANO"].Index or -99
local nwVolcano = {}
for r in GameInfo.RandomEvents() do
  if r.NaturalWonder ~= nil and r.NaturalWonder ~= "" and GameInfo.Features[r.NaturalWonder] then
    nwVolcano[GameInfo.Features[r.NaturalWonder].Index] = r.NaturalWonder
  end
end
for i = 0, nplots - 1 do
  local q = Map.GetPlotByIndex(i)
  local f = q:GetFeatureType()
  local isv = P(function() return MapFeatureManager.IsVolcano(i) end)
  if f == fVolcano or nwVolcano[f] ~= nil or isv == true then
    local frow = f >= 0 and GameInfo.Features[f] or nil
    print('{"kind":"volcano","turn":' .. turn .. ',"plot":' .. i .. ',"x":' .. q:GetX() .. ',"y":' .. q:GetY()
      .. ',"feature":' .. J(frow and frow.FeatureType) .. ',"naturalWonder":' .. J(nwVolcano[f] ~= nil)
      .. ',"owner":' .. q:GetOwner() .. ',"isVolcano":' .. J(isv)
      .. ',"isActive":' .. J(P(function() return MapFeatureManager.IsActiveVolcano(q) end))
      .. ',"isErupting":' .. J(P(function() return MapFeatureManager.IsVolcanoErupting(q) end)) .. '}')
  end
end

-- the terrain the storms, droughts and fires draw on
local byTF, byF = {}, {}
local terr, feat = {}, {}
for i = 0, nplots - 1 do
  local q = Map.GetPlotByIndex(i)
  local t, f = q:GetTerrainType(), q:GetFeatureType()
  terr[i], feat[i] = t, f
  local tn = GameInfo.Terrains[t] and GameInfo.Terrains[t].TerrainType or tostring(t)
  local fn = f >= 0 and GameInfo.Features[f] and GameInfo.Features[f].FeatureType or "NONE"
  byTF[tn .. "|" .. fn] = (byTF[tn .. "|" .. fn] or 0) + 1
  byF[fn] = (byF[fn] or 0) + 1
end
local evTerr = {}
for r in GameInfo.RandomEvent_Terrains() do
  local t = GameInfo.Terrains[r.TerrainType]
  if t then
    evTerr[r.RandomEventType] = evTerr[r.RandomEventType] or {}
    evTerr[r.RandomEventType][t.Index] = true
  end
end
local perEvent = {}
for ev, set in pairs(evTerr) do
  local all, bare = 0, 0
  for i = 0, nplots - 1 do
    if set[terr[i]] then
      all = all + 1
      if feat[i] < 0 then bare = bare + 1 end
    end
  end
  perEvent[ev] = {all = all, featureless = bare}
end
local drought = evTerr["RANDOM_EVENT_DROUGHT_MAJOR"] or {}
local byNeighbours = {0, 0, 0, 0, 0, 0, 0}
for i = 0, nplots - 1 do
  if drought[terr[i]] and feat[i] < 0 then
    local q = Map.GetPlotByIndex(i)
    local k = 0
    for d = 0, 5 do
      local a = Map.GetAdjacentPlot(q:GetX(), q:GetY(), d)
      if a ~= nil and drought[a:GetTerrainType()] and a:GetFeatureType() < 0 then k = k + 1 end
    end
    byNeighbours[k + 1] = byNeighbours[k + 1] + 1
  end
end
print('{"kind":"terrain","turn":' .. turn .. ',"terrainFeature":' .. J(byTF) .. ',"feature":' .. J(byF)
  .. ',"perEvent":' .. J(perEvent) .. ',"droughtBareByBareNeighbours":' .. J(byNeighbours) .. '}')
