-- InGame: cities' defence, loyalty and amenities, one JSON line per city.
-- Three modes, by the tokens set:
--   --set ZX=32 --set ZY=26   the city on that plot (role "target") and the
--                             nearest city of a major to it (role "contrast")
--   --set ZWHO=free           every Free City (role "free") and, for each, the
--                             nearest city of a major (role "contrast")
--   neither                   every city of every living player (role "census")
-- Per city: owner, civ, IsMajor, IsFreeCities, the city-state category
-- (TypeProperties CityStateCategory), population, GetOriginalOwner; the world
-- era (Game.GetEras():GetCurrentEra()) and the owner's GetEra(); the centre's
-- and the Encampment's GetDefenseStrength (the Encampment's unique
-- replacements included); every district with IsComplete, IsPillaged,
-- GetDefenseStrength and its garrison / outer pools; the walls (every building
-- with OuterDefenseHitPoints > 0 the city has); the units on the centre and
-- within 2; loyalty, amenities and what the city is producing. A pcall'd read
-- prints its value or "err:<message>".
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

local zx, zy, who = tonumber("ZX"), tonumber("ZY"), "ZWHO"
local turn = Game.GetCurrentGameTurn()
local gameEra = P(function() return Game.GetEras():GetCurrentEra() end)

local walls = {}
for b in GameInfo.Buildings() do
  if (tonumber(b.OuterDefenseHitPoints) or 0) > 0 then walls[#walls + 1] = b end
end
local encampment = {DISTRICT_ENCAMPMENT = true}
for r in GameInfo.DistrictReplaces() do
  if r.ReplacesDistrictType == "DISTRICT_ENCAMPMENT" then encampment[r.CivUniqueDistrictType] = true end
end
local category = {}
for r in GameInfo.TypeProperties() do
  if r.Name == "CityStateCategory" then category[r.Type] = r.Value end
end

-- every unit, keyed by its plot
local unitsAt = {}
for q = 0, 63 do
  local o = Players[q]
  if o ~= nil and o:IsAlive() then
    for _, u in o:GetUnits():Members() do
      local k = u:GetX() .. ":" .. u:GetY()
      unitsAt[k] = unitsAt[k] or {}
      local row = GameInfo.Units[u:GetType()]
      local list = unitsAt[k]
      list[#list + 1] = {p = q, u = row and row.UnitType, id = u:GetID(), x = u:GetX(), y = u:GetY(),
        dmg = P(function() return u:GetDamage() end)}
    end
  end
end

local function producing(c)
  local h = P(function() return c:GetBuildQueue():GetCurrentProductionTypeHash() end)
  if type(h) ~= "number" or h == 0 then return h end
  local row = GameInfo.Buildings[h] or GameInfo.Districts[h] or GameInfo.Units[h] or GameInfo.Projects[h]
  return row and (row.BuildingType or row.DistrictType or row.UnitType or row.ProjectType) or h
end

local function emit(c, role, extra)
  local o = c:GetOwner()
  local pl = Players[o]
  local civ = P(function() return PlayerConfigurations[o]:GetCivilizationTypeName() end)
  local ds, centreDef, encDef = {}, nil, nil
  for _, d in c:GetDistricts():Members() do
    local row = GameInfo.Districts[d:GetType()]
    local dt = row and row.DistrictType or tostring(d:GetType())
    local def = P(function() return d:GetDefenseStrength() end)
    if dt == "DISTRICT_CITY_CENTER" then centreDef = def end
    if encampment[dt] then encDef = def end
    ds[#ds + 1] = {d = dt, x = d:GetX(), y = d:GetY(),
      complete = P(function() return d:IsComplete() end),
      pillaged = P(function() return d:IsPillaged() end),
      def = def,
      garrison = P(function() return d:GetDamage(DefenseTypes.DISTRICT_GARRISON) end),
      garrisonMax = P(function() return d:GetMaxDamage(DefenseTypes.DISTRICT_GARRISON) end),
      outer = P(function() return d:GetDamage(DefenseTypes.DISTRICT_OUTER) end),
      outerMax = P(function() return d:GetMaxDamage(DefenseTypes.DISTRICT_OUTER) end)}
  end
  local bl = c:GetBuildings()
  local w = {}
  for _, b in ipairs(walls) do
    if bl:HasBuilding(b.Index) then w[#w + 1] = {b.BuildingType, P(function() return bl:IsPillaged(b.Hash) end)} end
  end
  local cx, cy = c:GetX(), c:GetY()
  local near = {}
  for dx = -2, 2 do
    for dy = -2, 2 do
      for _, u in ipairs(unitsAt[(cx + dx) .. ":" .. (cy + dy)] or {}) do
        if Map.GetPlotDistance(cx, cy, u.x, u.y) <= 2 then near[#near + 1] = u end
      end
    end
  end
  local g = c:GetGrowth()
  local ci = P(function() return c:GetCulturalIdentity() end)
  local function loy(name) return type(ci) == "string" and ci or P(function() return ci[name](ci) end) end
  local rec = {kind = "city", role = role, turn = turn, owner = o, civ = civ, isMajor = pl:IsMajor(),
    isFree = P(function() return pl:IsFreeCities() end), category = type(civ) == "string" and category[civ] or nil,
    city = c:GetName(), id = c:GetID(), x = cx, y = cy, pop = c:GetPopulation(),
    origOwner = P(function() return c:GetOriginalOwner() end),
    gameEra = gameEra, ownerEra = P(function() return pl:GetEra() end),
    centreDef = centreDef, encampmentDef = encDef, walls = w, districts = ds,
    unitsOnCentre = unitsAt[cx .. ":" .. cy] or {}, unitsWithin2 = near,
    loyalty = loy("GetLoyalty"), loyaltyMax = loy("GetMaxLoyalty"), loyaltyPerTurn = loy("GetLoyaltyPerTurn"),
    loyaltyLevel = loy("GetLoyaltyLevel"),
    amenities = P(function() return g:GetAmenities() end), amenitiesNeeded = P(function() return g:GetAmenitiesNeeded() end),
    happiness = P(function() return g:GetHappiness() end),
    amenWarWeary = P(function() return g:GetAmenitiesLostFromWarWeariness() end),
    producing = producing(c)}
  for k, v in pairs(extra or {}) do rec[k] = v end
  print(J(rec))
end

local majors = {}
for p = 0, 62 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() and pl:IsMajor() then
    for _, c in pl:GetCities():Members() do majors[#majors + 1] = c end
  end
end
local contrasted = {}
local function contrast(c)
  local best, bd = nil, nil
  for _, m in ipairs(majors) do
    local d = Map.GetPlotDistance(c:GetX(), c:GetY(), m:GetX(), m:GetY())
    if d > 0 and (bd == nil or d < bd) then best, bd = m, d end
  end
  if best == nil then return end
  local key = best:GetOwner() .. ":" .. best:GetID()
  contrasted[key] = contrasted[key] or {city = best, forCities = {}}
  local f = contrasted[key].forCities
  f[#f + 1] = {owner = c:GetOwner(), id = c:GetID(), dist = bd}
end

if zx ~= nil and zy ~= nil then
  local c = Cities.GetCityInPlot(zx, zy)
  if c == nil then print(J({kind = "error", error = "nocity", x = zx, y = zy, turn = turn})) return end
  emit(c, "target")
  contrast(c)
elseif who == "free" then
  for p = 0, 62 do
    local pl = Players[p]
    if pl ~= nil and pl:IsAlive() and P(function() return pl:IsFreeCities() end) == true then
      for _, c in pl:GetCities():Members() do
        emit(c, "free")
        contrast(c)
      end
    end
  end
else
  for p = 0, 62 do
    local pl = Players[p]
    if pl ~= nil and pl:IsAlive() then
      for _, c in pl:GetCities():Members() do emit(c, "census") end
    end
  end
end
for _, e in pairs(contrasted) do emit(e.city, "contrast", {contrastFor = e.forCities}) end
