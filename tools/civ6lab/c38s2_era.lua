-- InGame: C-38-S2 (era half) — at the first turns of a later-era start, every
-- player's era, cities and units. One JSON line per player:
--   {"kind":"player","turn":T,"p":p,"major":bool,"civ":...,"leader":...,
--    "csType":<the minor's TypeProperties category or null>,"era":<the world era,
--    Game.GetEras():GetCurrentEra()>,"startEra":<GameConfiguration.GetStartEra, a hash>,
--    "cities":[{name,x,y,pop,def,walls,districts:[...],buildings:[...]}],
--    "units":[{id,type,combat,ranged,x,y,damage}],
--    "envoysReceived":<minor: tokens from every major together>}
-- Every read is pcall'd: a value, null, or "err:<msg>".
local function esc(s) return (tostring(s):gsub('\\', '\\\\'):gsub('"', '\\"'):gsub('%c', ' ')) end
local function J(v)
  local t = type(v)
  if t == "nil" then return "null" end
  if t == "number" or t == "boolean" then return tostring(v) end
  if t == "table" then
    if #v > 0 or next(v) == nil then
      local o = {}
      for _, x in ipairs(v) do o[#o + 1] = J(x) end
      return "[" .. table.concat(o, ",") .. "]"
    end
    local o = {}
    for k, x in pairs(v) do o[#o + 1] = '"' .. esc(k) .. '":' .. J(x) end
    return "{" .. table.concat(o, ",") .. "}"
  end
  return '"' .. esc(v) .. '"'
end
local function P(f)
  local ok, v = pcall(f)
  if ok then return v end
  return "err:" .. tostring(v)
end

local turn = Game.GetCurrentGameTurn()
local startEra = P(function() return GameConfiguration.GetStartEra() end)
local wallsIdx = {}
for _, n in ipairs({"BUILDING_WALLS", "BUILDING_CASTLE", "BUILDING_STAR_FORT", "BUILDING_TSIKHE"}) do
  if GameInfo.Buildings[n] then wallsIdx[n] = GameInfo.Buildings[n].Index end
end
local majors = {}
for p = 0, 63 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() and pl:IsMajor() then majors[#majors + 1] = p end
end
for p = 0, 63 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() then
    local cfg = PlayerConfigurations[p]
    local civ = P(function() return cfg:GetCivilizationTypeName() end)
    local cat = nil
    if type(civ) == "string" then
      for r in GameInfo.TypeProperties() do
        if r.Type == civ and r.Name == "CityStateCategory" then cat = r.Value end
      end
    end
    local rec = {kind = "player", turn = turn, p = p, major = pl:IsMajor(), civ = civ,
      leader = P(function() return cfg:GetLeaderTypeName() end), csType = cat,
      era = P(function() return Game.GetEras():GetCurrentEra() end), startEra = startEra,
      gold = P(function() return pl:GetTreasury():GetGoldBalance() end)}
    if not pl:IsMajor() then
      local tot = 0
      for _, m in ipairs(majors) do
        local v = P(function() return Players[m]:GetInfluence():GetTokensReceived(p) end)
        if type(v) == "number" then tot = tot + v else tot = v; break end
      end
      rec.envoysReceived = tot
    end
    local cities = {}
    P(function()
      for _, c in pl:GetCities():Members() do
        local cr = {name = c:GetName(), id = c:GetID(), x = c:GetX(), y = c:GetY(), pop = c:GetPopulation()}
        local ds, bs = {}, {}
        for _, d in c:GetDistricts():Members() do
          local dt = GameInfo.Districts[d:GetType()].DistrictType
          ds[#ds + 1] = dt
          if dt == "DISTRICT_CITY_CENTER" then
            cr.def = P(function() return d:GetDefenseStrength() end)
            cr.garrisonMax = P(function() return d:GetMaxDamage(DefenseTypes.DISTRICT_GARRISON) end)
            cr.outerMax = P(function() return d:GetMaxDamage(DefenseTypes.DISTRICT_OUTER) end)
          end
        end
        for r in GameInfo.Buildings() do
          if P(function() return c:GetBuildings():HasBuilding(r.Index) end) == true then bs[#bs + 1] = r.BuildingType end
        end
        cr.districts, cr.buildings = ds, bs
        cities[#cities + 1] = cr
      end
    end)
    rec.cities = cities
    local units = {}
    P(function()
      for _, u in pl:GetUnits():Members() do
        local row = GameInfo.Units[u:GetType()]
        units[#units + 1] = {id = u:GetID(), type = row and row.UnitType, combat = P(function() return u:GetCombat() end),
          ranged = P(function() return u:GetRangedCombat() end), x = u:GetX(), y = u:GetY(),
          damage = P(function() return u:GetDamage() end)}
      end
    end)
    rec.units = units
    print(J(rec))
  end
end
