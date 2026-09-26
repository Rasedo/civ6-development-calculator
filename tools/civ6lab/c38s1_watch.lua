-- InGame: C-38-S1 + C-60-S2, the extended observer watch — one read a turn.
-- Every read is pcall'd: a value, null, or "err:<msg>".
--   {"kind":"era"}    the world era; the majors alive
--   {"kind":"quests"} every active quest: [major, minor, QuestType, name, reward]
--                     (Game.GetQuestsManager():HasActiveQuestFromPlayer, CityStates.lua 255-275)
--   {"kind":"minor"}  per living minor (city-states and the Free Cities, p62):
--                     treasury (balance, gold yield, maintenance), tech count and
--                     tech list, suzerain, the majors it is at war with, every city
--                     [id, x, y, pop, centre defence, walls tier, production item,
--                     progress, original owner, loyalty, amenities, need,
--                     bankruptcy loss], every unit [id, type, x, y, moves left,
--                     damage, XP, build charges]
--   {"kind":"imps"}   per living city-state: every improved plot within 5 of a
--                     city of it: [plot, owner, improvement, pillaged]
local function esc(s) return (tostring(s):gsub('\\', '\\\\'):gsub('"', '\\"'):gsub('%c', ' ')) end
local function J(v)
  local t = type(v)
  if t == "nil" then return "null" end
  if t == "number" then
    if v ~= v then return '"nan"' end
    if v == math.floor(v) and math.abs(v) < 1e15 then return string.format("%d", v) end
    return string.format("%.4g", v)
  end
  if t == "boolean" then return tostring(v) end
  if t == "table" then
    local n, count = #v, 0
    for _ in pairs(v) do count = count + 1 end
    if count == n then
      local o = {}
      for i = 1, n do o[i] = J(v[i]) end
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
local majors, minors = {}, {}
for p = 0, 62 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() then
    if pl:IsMajor() then majors[#majors + 1] = p elseif not pl:IsBarbarian() then minors[#minors + 1] = p end
  end
end
print('{"kind":"era","turn":' .. turn .. ',"worldEra":' .. J(P(function() return Game.GetEras():GetCurrentEra() end))
  .. ',"majors":' .. J(majors) .. ',"minors":' .. J(minors) .. '}')

-- quests
local qm = P(function() return Game.GetQuestsManager() end)
local qs = {}
local qerr = nil
if type(qm) == "string" or qm == nil then
  qerr = tostring(qm)
else
  for _, m in ipairs(majors) do
    for _, p in ipairs(minors) do
      if p ~= 62 then
        for q in GameInfo.Quests() do
          local has = P(function() return qm:HasActiveQuestFromPlayer(m, p, q.Index) end)
          if has == true then
            qs[#qs + 1] = {m, p, q.QuestType, P(function() return qm:GetActiveQuestName(m, p, q.Index) end),
              P(function() return qm:GetActiveQuestReward(m, p, q.Index) end)}
          elseif type(has) == "string" then
            qerr = has
          end
        end
      end
    end
  end
end
print('{"kind":"quests","turn":' .. turn .. ',"err":' .. J(qerr) .. ',"q":' .. J(qs) .. '}')

-- the minors and the Free Cities
local WALLS = {}
for i, n in ipairs({"BUILDING_WALLS", "BUILDING_CASTLE", "BUILDING_STAR_FORT"}) do
  if GameInfo.Buildings[n] then WALLS[#WALLS + 1] = GameInfo.Buildings[n].Index end
end
local nTech = 0
for _ in GameInfo.Technologies() do nTech = nTech + 1 end
for _, p in ipairs(minors) do
  local pl = Players[p]
  local rec = {kind = "minor", turn = turn, p = p, civ = P(function() return PlayerConfigurations[p]:GetCivilizationTypeName() end)}
  rec.gold = P(function() return pl:GetTreasury():GetGoldBalance() end)
  rec.goldYield = P(function() return pl:GetTreasury():GetGoldYield() end)
  rec.maintenance = P(function() return pl:GetTreasury():GetTotalMaintenance() end)
  local techs = {}
  P(function()
    local pt = pl:GetTechs()
    for r in GameInfo.Technologies() do if pt:HasTech(r.Index) then techs[#techs + 1] = r.Index end end
  end)
  rec.techs = techs
  rec.suzerain = P(function() return pl:GetInfluence():GetSuzerain() end)
  local wars = {}
  for _, m in ipairs(majors) do
    if P(function() return pl:GetDiplomacy():IsAtWarWith(m) end) == true then wars[#wars + 1] = m end
  end
  rec.wars = wars
  local cities = {}
  P(function()
    for _, c in pl:GetCities():Members() do
      local def = -1
      for _, d in c:GetDistricts():Members() do
        if GameInfo.Districts[d:GetType()].DistrictType == "DISTRICT_CITY_CENTER" then
          def = P(function() return d:GetDefenseStrength() end)
        end
      end
      local walls = 0
      for i, idx in ipairs(WALLS) do
        if P(function() return c:GetBuildings():HasBuilding(idx) end) == true then walls = i end
      end
      local q = c:GetBuildQueue()
      local h = P(function() return q:GetCurrentProductionTypeHash() end)
      local name, prog = "none", -1
      if type(h) == "number" and h ~= 0 then
        local row = GameInfo.Buildings[h] or GameInfo.Districts[h] or GameInfo.Units[h] or GameInfo.Projects[h]
        name = row and (row.BuildingType or row.DistrictType or row.UnitType or row.ProjectType) or tostring(h)
        if row and row.BuildingType then prog = P(function() return q:GetBuildingProgress(row.Index) end) end
        if row and row.DistrictType then prog = P(function() return q:GetDistrictProgress(row.Index) end) end
        if row and row.UnitType then prog = P(function() return q:GetUnitProgress(row.Index) end) end
        if row and row.ProjectType then prog = P(function() return q:GetProjectProgress(row.Index) end) end
      end
      local g = c:GetGrowth()
      cities[#cities + 1] = {c:GetID(), c:GetX(), c:GetY(), c:GetPopulation(), def, walls, name, prog,
        P(function() return c:GetOriginalOwner() end),
        P(function() return c:GetCulturalIdentity():GetLoyalty() end),
        P(function() return g:GetAmenities() end), P(function() return g:GetAmenitiesNeeded() end),
        P(function() return g:GetAmenitiesLostFromBankruptcy() end)}
    end
  end)
  rec.cities = cities
  local units = {}
  P(function()
    for _, u in pl:GetUnits():Members() do
      local row = GameInfo.Units[u:GetType()]
      units[#units + 1] = {u:GetID(), row and row.UnitType or u:GetType(), u:GetX(), u:GetY(),
        P(function() return u:GetMovesRemaining() end), u:GetDamage(),
        P(function() return u:GetExperience():GetExperiencePoints() end),
        P(function() return u:GetBuildCharges() end)}
    end
  end)
  rec.units = units
  print(J(rec))
end

-- the city-states' improved plots within 5 of their cities
for _, p in ipairs(minors) do
  if p ~= 62 then
    local seen, out = {}, {}
    P(function()
      for _, c in Players[p]:GetCities():Members() do
        local cx, cy = c:GetX(), c:GetY()
        for dx = -5, 5 do
          for dy = -5, 5 do
            local q = Map.GetPlot(cx + dx, cy + dy)
            if q ~= nil and not seen[q:GetIndex()] and Map.GetPlotDistance(cx, cy, q:GetX(), q:GetY()) <= 5 then
              seen[q:GetIndex()] = true
              local imp = q:GetImprovementType()
              if imp >= 0 then
                out[#out + 1] = {q:GetIndex(), q:GetOwner(), GameInfo.Improvements[imp].ImprovementType,
                  P(function() return q:IsImprovementPillaged() end)}
              end
            end
          end
        end
      end
    end)
    print('{"kind":"imps","turn":' .. turn .. ',"p":' .. p .. ',"plots":' .. J(out) .. '}')
  end
end
