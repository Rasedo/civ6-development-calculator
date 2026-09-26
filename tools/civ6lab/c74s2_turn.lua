-- GameCore_Tuner (every call pcall'd; InGame answers the same reads): the
-- C-74-S2 per-turn reader, one small map (Duel) read whole every turn.
--   {"kind":"t"}     the turn: each living player's era and tech count (in
--                    "alive" order), the world era, GameClimate chances, temperature, CO2, the
--                    site counts (floodable rivers, active / normal volcanoes),
--                    and the event records of turns t-1 and t
--   {"kind":"volc"}  every volcano plot: [plot, IsActiveVolcano, IsVolcanoErupting, owner,
--                    natural wonder, feature type, [players who revealed it]]
--   {"kind":"fp"}    every floodplain plot (a FLOODPLAINS feature, a river's
--                    "floodplain" list, or CanBeFlooded): [plot, CanBeFlooded,
--                    owner, [players who revealed it], improvement, district]
--   {"kind":"rv"}    every river: [z, first floodplain plot, floodplain length,
--                    CanBeFlooded plots on it, the floodplain list] (-1 / 0 / [] when
--                    the list is absent)
--   {"kind":"rp"}    every river's own plots ("plots" list): [z, [[plot, owner, [revealed by]]]]
--   {"kind":"cities"} every city: [owner, id, x, y, population]
--   {"kind":"dmap"}  on a turn whose record (t or t-1) is a drought: every land
--                    plot [plot, owner, owning city id, terrain, feature,
--                    improvement, pillaged, district, river, fresh water] and
--                    the index legends
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
    if depth > 6 then return '"<deep>"' end
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
local nplots = Map.GetPlotCount()

-- the players alive, and their reveal maps
local alive = {}
for p = 0, 63 do
  local pl = Players[p]
  if pl ~= nil and P(function() return pl:IsAlive() end) == true then alive[#alive + 1] = p end
end
local vis = {}
local visErr = nil
for _, p in ipairs(alive) do
  local v = P(function() return PlayersVisibility[p] end)
  if type(v) == "string" or v == nil then visErr = tostring(v) else vis[p] = v end
end

-- the turn line
local cl = {}
for _, name in ipairs({"GetFloodPercentChance", "GetStormPercentChance", "GetDroughtPercentChance",
    "GetEruptionPercentChance", "GetFirePercentChance", "GetFloodClimateIncreasedChance",
    "GetStormClimateIncreasedChance", "GetDroughtClimateIncreasedChance", "GetTemperatureChange",
    "GetClimateChangeLevel", "GetTotalCO2Footprint", "GetNextSeaLevelRiseTurns"}) do
  cl[name] = P(function() return GameClimate[name]() end)
end
local vc = {}
for _, name in ipairs({"GetNumNormalVolcanoes", "GetNumActiveVolcanoes", "GetNumEruptions",
    "GetNumNaturalWonderVolcanoes"}) do
  vc[name] = P(function() return MapFeatureManager[name]() end)
end
local function rec(t)
  local e = P(function() return GameRandomEvents.GetEventsForTurn(t) end)
  if type(e) ~= "table" then return e end
  local filled = false
  for _ in pairs(e) do filled = true; break end
  if not filled then return nil end
  local row = e.RandomEvent ~= nil and GameInfo.RandomEvents[e.RandomEvent] or nil
  e.type = row and row.RandomEventType
  return e
end
local evPrev, evNow = rec(turn - 1), rec(turn)
-- each player's era and tech count, and the world era
local eras, techs = {}, {}
for _, p in ipairs(alive) do
  eras[#eras + 1] = P(function() return Players[p]:GetEras():GetEra() end)
  techs[#techs + 1] = P(function()
    local n, pt = 0, Players[p]:GetTechs()
    for r in GameInfo.Technologies() do if pt:HasTech(r.Index) then n = n + 1 end end
    return n
  end)
end
local worldEra = P(function() return Game.GetEras():GetCurrentEra() end)
local nr = P(function() return RiverManager.GetNumRivers() end)
print('{"kind":"t","turn":' .. turn .. ',"alive":' .. J(alive) .. ',"visErr":' .. J(visErr)
  .. ',"eras":' .. J(eras) .. ',"techs":' .. J(techs) .. ',"worldEra":' .. J(worldEra)
  .. ',"climate":' .. J(cl) .. ',"volcanoes":' .. J(vc)
  .. ',"numRivers":' .. J(nr)
  .. ',"numFloodable":' .. J(P(function() return RiverManager.GetNumFloodableRivers() end))
  .. ',"evPrev":' .. J(evPrev) .. ',"evNow":' .. J(evNow) .. '}')

-- the volcanoes
local fVolcano = GameInfo.Features["FEATURE_VOLCANO"] and GameInfo.Features["FEATURE_VOLCANO"].Index or -99
local nwVolcano = {}
for r in GameInfo.RandomEvents() do
  if r.NaturalWonder ~= nil and r.NaturalWonder ~= "" and GameInfo.Features[r.NaturalWonder] then
    nwVolcano[GameInfo.Features[r.NaturalWonder].Index] = true
  end
end
local vl = {}
for i = 0, nplots - 1 do
  local q = Map.GetPlotByIndex(i)
  local f = q:GetFeatureType()
  if f == fVolcano or nwVolcano[f] then
    local by = {}
    for _, p in ipairs(alive) do
      if vis[p] and P(function() return vis[p]:IsRevealed(q:GetX(), q:GetY()) end) == true then by[#by + 1] = p end
    end
    vl[#vl + 1] = {i, P(function() return MapFeatureManager.IsActiveVolcano(q) end),
      P(function() return MapFeatureManager.IsVolcanoErupting(q) end), q:GetOwner(), nwVolcano[f] == true,
      GameInfo.Features[f].FeatureType, by}
  end
end
print('{"kind":"volc","turn":' .. turn .. ',"v":' .. J(vl) .. '}')

-- the rivers and their floodplains
local fpFeat = {}
for _, n in ipairs({"FEATURE_FLOODPLAINS", "FEATURE_FLOODPLAINS_GRASSLAND", "FEATURE_FLOODPLAINS_PLAINS"}) do
  if GameInfo.Features[n] then fpFeat[GameInfo.Features[n].Index] = true end
end
local inList, rv = {}, {}
local cbf = {}
for i = 0, nplots - 1 do
  local q = Map.GetPlotByIndex(i)
  cbf[i] = P(function() return RiverManager.CanBeFlooded(q) end)
end
if type(nr) == "number" then
  for z = 0, nr - 1 do
    local fp = P(function() return RiverManager.GetRiverByIndex(z, "floodplain") end)
    local list = type(fp) == "table" and fp.Floodplain or nil
    if type(list) == "table" then
      local k = 0
      for _, i in ipairs(list) do inList[i] = true; if cbf[i] == true then k = k + 1 end end
      rv[#rv + 1] = {z, list[1] or -1, #list, k, list}
    else
      rv[#rv + 1] = {z, -1, 0, 0, {}}
    end
  end
end
print('{"kind":"rv","turn":' .. turn .. ',"r":' .. J(rv) .. '}')
-- every river's own plots (the "plots" list): [z, [[plot, owner, [revealed by]], ...]]
local rp = {}
if type(nr) == "number" then
  for z = 0, nr - 1 do
    local pl = P(function() return RiverManager.GetRiverByIndex(z, "plots") end)
    local list = type(pl) == "table" and pl.Plots or nil
    local row = {}
    if type(list) == "table" then
      for _, i in ipairs(list) do
        local q = Map.GetPlotByIndex(i)
        local by = {}
        for _, p in ipairs(alive) do
          if vis[p] and P(function() return vis[p]:IsRevealed(q:GetX(), q:GetY()) end) == true then by[#by + 1] = p end
        end
        row[#row + 1] = {i, q:GetOwner(), by}
      end
    end
    rp[#rp + 1] = {z, row}
  end
end
print('{"kind":"rp","turn":' .. turn .. ',"r":' .. J(rp) .. '}')
local fl = {}
for i = 0, nplots - 1 do
  local q = Map.GetPlotByIndex(i)
  if fpFeat[q:GetFeatureType()] or inList[i] or cbf[i] == true then
    local by = {}
    for _, p in ipairs(alive) do
      if vis[p] and P(function() return vis[p]:IsRevealed(q:GetX(), q:GetY()) end) == true then by[#by + 1] = p end
    end
    fl[#fl + 1] = {i, cbf[i], q:GetOwner(), by, q:GetImprovementType(), q:GetDistrictType()}
  end
end
print('{"kind":"fp","turn":' .. turn .. ',"p":' .. J(fl) .. '}')

-- the cities
local cs = {}
for _, p in ipairs(alive) do
  local ok = pcall(function()
    for _, c in Players[p]:GetCities():Members() do
      cs[#cs + 1] = {p, c:GetID(), c:GetX(), c:GetY(), c:GetPopulation()}
    end
  end)
end
print('{"kind":"cities","turn":' .. turn .. ',"c":' .. J(cs) .. '}')

-- a drought's map
local function isDrought(e)
  return type(e) == "table" and type(e.type) == "string" and e.type:find("DROUGHT") ~= nil
end
if isDrought(evPrev) or isDrought(evNow) then
  local pl = {}
  for i = 0, nplots - 1 do
    local q = Map.GetPlotByIndex(i)
    if not q:IsWater() then
      local cid = P(function()
        local c = Cities.GetPlotPurchaseCity(q)
        return c and c:GetID() or -1
      end)
      pl[#pl + 1] = {i, q:GetOwner(), cid, q:GetTerrainType(), q:GetFeatureType(), q:GetImprovementType(),
        P(function() return q:IsImprovementPillaged() end), q:GetDistrictType(),
        P(function() return q:IsRiver() end), P(function() return q:IsFreshWater() end)}
    end
  end
  local tl, fl2, il, dl = {}, {}, {}, {}
  for r in GameInfo.Terrains() do tl[#tl + 1] = {r.Index, r.TerrainType} end
  for r in GameInfo.Features() do fl2[#fl2 + 1] = {r.Index, r.FeatureType} end
  for r in GameInfo.Improvements() do il[#il + 1] = {r.Index, r.ImprovementType} end
  for r in GameInfo.Districts() do dl[#dl + 1] = {r.Index, r.DistrictType} end
  print('{"kind":"dmap","turn":' .. turn .. ',"grid":' .. J({Map.GetGridSize()}) .. ',"evPrev":' .. J(evPrev)
    .. ',"evNow":' .. J(evNow) .. ',"plots":' .. J(pl) .. ',"terrains":' .. J(tl) .. ',"features":' .. J(fl2)
    .. ',"improvements":' .. J(il) .. ',"districts":' .. J(dl) .. '}')
end
