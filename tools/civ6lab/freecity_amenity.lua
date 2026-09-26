-- InGame: every city of the Free Cities seat, or of every living player when
-- ZALL is 1 (--set ZALL=1), one JSON line each: the amenity total, the need,
-- the tier, every GetAmenitiesFrom* / GetAmenitiesLostFrom* getter the city
-- panel calls (CitySupport.lua 526-544) and the residue the named sources
-- leave; the owner beside GetOriginalOwner; the players the owner is at war
-- with (IsAtWarWith); and the distance to the nearest unit of any of them
-- and to the nearest barbarian unit. A getter prints its value or
-- "err:<message>"; the sum counts only the values that are numbers.
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

local all = tonumber("ZALL") == 1
local getters = {"GetAmenitiesFromLuxuries", "GetAmenitiesFromEntertainment", "GetAmenitiesFromCivics",
  "GetAmenitiesFromGreatPeople", "GetAmenitiesFromCityStates", "GetAmenitiesFromReligion",
  "GetAmenitiesFromNationalParks", "GetAmenitiesFromStartingEra", "GetAmenitiesFromImprovements",
  "GetAmenitiesFromDistricts", "GetAmenitiesFromGovernors", "GetAmenitiesFromNaturalWonders",
  "GetAmenitiesFromTraits", "GetAmenitiesLostFromWarWeariness", "GetAmenitiesLostFromBankruptcy"}
local turn = Game.GetCurrentGameTurn()

-- every unit's position, by owner (the barbarians included)
local unitsOf, barb = {}, {}
for q = 0, 63 do
  local o = Players[q]
  if o ~= nil and o:IsAlive() then
    local list = {}
    for _, u in o:GetUnits():Members() do
      if u:GetX() >= 0 then list[#list + 1] = {u:GetX(), u:GetY(), u:GetType()} end
    end
    unitsOf[q] = list
    if o:IsBarbarian() then barb[q] = true end
  end
end
local function nearest(x, y, owners)
  local best, who, typ = nil, nil, nil
  for q in pairs(owners) do
    for _, u in ipairs(unitsOf[q] or {}) do
      local d = Map.GetPlotDistance(x, y, u[1], u[2])
      if best == nil or d < best then
        best, who = d, q
        local row = GameInfo.Units[u[3]]
        typ = row and row.UnitType
      end
    end
  end
  if best == nil then return nil end
  return {dist = best, owner = who, unit = typ}
end

local n = 0
for p = 0, 62 do
  local pl = Players[p]
  local free = pl ~= nil and pl:IsAlive() and P(function() return pl:IsFreeCities() end)
  if pl ~= nil and pl:IsAlive() and (all or free == true) then
    local wars, enemies = {}, {}
    local dip = pl:GetDiplomacy()
    for q = 0, 63 do
      local o = Players[q]
      if q ~= p and o ~= nil and o:IsAlive() then
        local w = P(function() return dip:IsAtWarWith(q) end)
        if w == true then wars[#wars + 1] = q; enemies[q] = true
        elseif w ~= false then wars[#wars + 1] = {q, w} end
      end
    end
    for _, c in pl:GetCities():Members() do
      local g = c:GetGrowth()
      local vals, sum = {}, 0
      for _, name in ipairs(getters) do
        local v = P(function() return g[name](g) end)
        vals[(name:gsub("GetAmenities", ""))] = v
        if type(v) == "number" then
          if name:find("Lost") then sum = sum - v else sum = sum + v end
        end
      end
      local amen = P(function() return g:GetAmenities() end)
      local orig = P(function() return c:GetOriginalOwner() end)
      print('{"kind":"city","turn":' .. turn .. ',"p":' .. p .. ',"isMajor":' .. J(pl:IsMajor()) .. ',"isFree":' .. J(free)
        .. ',"id":' .. c:GetID() .. ',"name":' .. J(c:GetName()) .. ',"x":' .. c:GetX() .. ',"y":' .. c:GetY()
        .. ',"pop":' .. c:GetPopulation() .. ',"amenities":' .. J(amen)
        .. ',"need":' .. J(P(function() return g:GetAmenitiesNeeded() end))
        .. ',"happiness":' .. J(P(function() return g:GetHappiness() end))
        .. ',"sources":' .. J(vals) .. ',"sum":' .. sum
        .. ',"residue":' .. J(type(amen) == "number" and amen - sum or nil)
        .. ',"origOwner":' .. J(orig) .. ',"founded":' .. J(orig == p)
        .. ',"wars":' .. J(wars) .. ',"nearestEnemyUnit":' .. J(nearest(c:GetX(), c:GetY(), enemies))
        .. ',"nearestBarbUnit":' .. J(nearest(c:GetX(), c:GetY(), barb)) .. '}')
      n = n + 1
    end
  end
end
print('{"kind":"summary","turn":' .. turn .. ',"cities":' .. n .. ',"all":' .. J(all) .. '}')
