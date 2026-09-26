-- InGame: the Score cross-section, three kinds of JSON line.
--   {"kind":"seat"}      every living major: GetScore, GetCategoryScore per
--                        ScoringCategories row (WorldRankings.lua's reader),
--                        and what the ScoringLineItems count: techs and
--                        civics with era and cost, wonders, cities, completed
--                        non-centre districts, population, Great People, era
--                        score, non-wonder buildings (all and by prereq era),
--                        the religion founded and its majority cities.
--   {"kind":"city"}      every city of every living player (majors, minors,
--                        the Free Cities): owner, IsMajor, each non-wonder
--                        building with IsPillaged, each wonder with
--                        IsPillaged, each district (DISTRICT_WONDER included)
--                        with IsComplete / IsPillaged / the plot's
--                        IsDistrictPillaged, the religions in the city, the
--                        majority religion and the religion it is holy city of.
--   {"kind":"religion"}  every founded religion: its GetReligions() entry
--                        and its founder's GetHolyCityID() resolved to a city.
-- A pcall'd read prints its value (true / false / a number / a table) or
-- "err:<message>"; an IsPillaged that throws is recorded, not skipped.
-- UNVERIFIED from the tuner: GetHolyCityID (ReligionScreen.lua:795),
-- plot:GetWonderType (PlotToolTip.lua:669) and the GetReligions() entry's
-- fields.
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

local function eraIdx(t) return t and GameInfo.Eras[t] and GameInfo.Eras[t].Index or -1 end
local function bldEra(b)
  return eraIdx(b.PrereqTech and GameInfo.Technologies[b.PrereqTech] and GameInfo.Technologies[b.PrereqTech].EraType
    or (b.PrereqCivic and GameInfo.Civics[b.PrereqCivic] and GameInfo.Civics[b.PrereqCivic].EraType))
end
local turn = Game.GetCurrentGameTurn()

-- the religions and their holy cities, keyed "owner:cityId"
local holy = {}
local okr, rels = pcall(function() return Game.GetReligion():GetReligions() end)
if okr and type(rels) == "table" then
  for _, r in ipairs(rels) do
    local hc = P(function()
      local c = CityManager.GetCity(Players[r.Founder]:GetReligion():GetHolyCityID())
      if c == nil then return nil end
      return {owner = c:GetOwner(), id = c:GetID(), x = c:GetX(), y = c:GetY()}
    end)
    if type(hc) == "table" then holy[hc.owner .. ":" .. hc.id] = r.Religion end
    local row = GameInfo.Religions[r.Religion]
    print('{"kind":"religion","turn":' .. turn .. ',"religionType":' .. J(row and row.ReligionType)
      .. ',"entry":' .. J(r) .. ',"holyCity":' .. J(hc) .. '}')
  end
else
  print('{"kind":"religion","turn":' .. turn .. ',"error":' .. J(okr and "not a table" or ("err:" .. tostring(rels))) .. '}')
end

-- every city of every living player
for p = 0, 62 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() then
    local civ = P(function() return PlayerConfigurations[p]:GetCivilizationTypeName() end)
    for _, c in pl:GetCities():Members() do
      local bl = c:GetBuildings()
      local blds, wonders = {}, {}
      for b in GameInfo.Buildings() do
        if bl:HasBuilding(b.Index) then
          local pil = P(function() return bl:IsPillaged(b.Hash) end)
          if b.IsWonder then wonders[#wonders + 1] = {b.BuildingType, pil}
          else blds[#blds + 1] = {b.BuildingType, pil} end
        end
      end
      local ds = {}
      for _, d in c:GetDistricts():Members() do
        local row = GameInfo.Districts[d:GetType()]
        local plot = Map.GetPlot(d:GetX(), d:GetY())
        local wt = P(function() return plot:GetWonderType() end)
        local wrow = type(wt) == "number" and wt >= 0 and GameInfo.Buildings[wt] or nil
        ds[#ds + 1] = {d = row and row.DistrictType or tostring(d:GetType()), x = d:GetX(), y = d:GetY(),
          complete = P(function() return d:IsComplete() end),
          pillaged = P(function() return d:IsPillaged() end),
          plotPillaged = P(function() return plot:IsDistrictPillaged() end),
          wonder = wrow and wrow.BuildingType or wt}
      end
      local cr = c:GetReligion()
      local maj = P(function() return cr:GetMajorityReligion() end)
      local mrow = type(maj) == "number" and maj >= 0 and GameInfo.Religions[maj] or nil
      print('{"kind":"city","turn":' .. turn .. ',"owner":' .. p .. ',"isMajor":' .. J(pl:IsMajor())
        .. ',"isFree":' .. J(P(function() return pl:IsFreeCities() end)) .. ',"civ":' .. J(civ)
        .. ',"id":' .. c:GetID() .. ',"name":' .. J(c:GetName()) .. ',"x":' .. c:GetX() .. ',"y":' .. c:GetY()
        .. ',"pop":' .. c:GetPopulation() .. ',"origOwner":' .. J(P(function() return c:GetOriginalOwner() end))
        .. ',"majority":' .. J(maj) .. ',"majorityType":' .. J(mrow and mrow.ReligionType)
        .. ',"religions":' .. J(P(function() return cr:GetReligionsInCity() end))
        .. ',"holyOf":' .. J(holy[p .. ":" .. c:GetID()])
        .. ',"buildings":' .. J(blds) .. ',"wonders":' .. J(wonders) .. ',"districts":' .. J(ds) .. '}')
    end
  end
end

-- every living major's score beside the counted items
for p = 0, 62 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() and pl:IsMajor() then
    local cats = {}
    for c in GameInfo.ScoringCategories() do
      cats[c.CategoryType] = P(function() return pl:GetCategoryScore(c.Index) end)
    end
    local techs, civics, wonders = {}, {}, {}
    local tt = pl:GetTechs()
    for t in GameInfo.Technologies() do
      if tt:HasTech(t.Index) then techs[#techs + 1] = {eraIdx(t.EraType), t.Cost} end
    end
    local cu = pl:GetCulture()
    for c in GameInfo.Civics() do
      if cu:HasCivic(c.Index) then civics[#civics + 1] = {eraIdx(c.EraType), c.Cost} end
    end
    local ncity, ndist, pop, nbld, byEra = 0, 0, 0, 0, {}
    for _, city in pl:GetCities():Members() do
      ncity = ncity + 1
      pop = pop + city:GetPopulation()
      for _, d in city:GetDistricts():Members() do
        if d:IsComplete() and GameInfo.Districts[d:GetType()].DistrictType ~= "DISTRICT_CITY_CENTER" then ndist = ndist + 1 end
      end
      local bl = city:GetBuildings()
      for b in GameInfo.Buildings() do
        if bl:HasBuilding(b.Index) then
          if b.IsWonder then
            wonders[#wonders + 1] = {bldEra(b), b.Cost}
          else
            nbld = nbld + 1
            local e = tostring(bldEra(b))
            byEra[e] = (byEra[e] or 0) + 1
          end
        end
      end
    end
    local gp = P(function()
      local n = 0
      for _, e in ipairs(Game.GetGreatPeople():GetPastTimeline()) do
        if e.Claimant == p then n = n + 1 end
      end
      return n
    end)
    local rel = P(function() return pl:GetReligion():GetReligionTypeCreated() end)
    local beliefs = P(function()
      for _, r in ipairs(Game.GetReligion():GetReligions()) do
        if r.Religion == rel then return #r.Beliefs end
      end
      return 0
    end)
    local mine, foreign = 0, 0
    if type(rel) == "number" and rel >= 0 then
      for q = 0, 62 do
        local o = Players[q]
        if o ~= nil and o:IsAlive() and o:IsMajor() then
          for _, city in o:GetCities():Members() do
            if city:GetReligion():GetMajorityReligion() == rel then
              if q == p then mine = mine + 1 else foreign = foreign + 1 end
            end
          end
        end
      end
    end
    print('{"kind":"seat","turn":' .. turn .. ',"p":' .. p .. ',"score":' .. J(P(function() return pl:GetScore() end))
      .. ',"cats":' .. J(cats) .. ',"techs":' .. J(techs) .. ',"civics":' .. J(civics) .. ',"wonders":' .. J(wonders)
      .. ',"cities":' .. ncity .. ',"districts":' .. ndist .. ',"pop":' .. pop
      .. ',"eraScore":' .. J(P(function() return Game.GetEras():GetPlayerCurrentScore(p) end))
      .. ',"gp":' .. J(gp) .. ',"buildings":' .. nbld .. ',"religion":' .. J(rel)
      .. ',"relMine":' .. mine .. ',"relForeign":' .. foreign .. ',"beliefs":' .. J(beliefs)
      .. ',"bldByEra":' .. J(byEra) .. ',"curEra":' .. J(P(function() return Game.GetEras():GetCurrentEra() end)) .. '}')
  end
end
