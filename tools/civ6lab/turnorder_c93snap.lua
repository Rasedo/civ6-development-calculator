-- GameCore_Tuner: the C-93 synchronous witness. ZMODE=arm registers GE
-- listeners; when each fires it appends one line to LAB_C93.log:
--   seq|turn|seed|event|args|P p g= gy= mt= rt= rp= sy= f= sc=|W ...|C ...
-- P: the event player's gold, gold yield, maintenance, researching tech and
--    its progress, science yield, faith, score.
-- W (at PlayerTurnStarted / PlayerTurnStartComplete / the game-turn events
--    only): total CO2, average temperature, climate level, turns to the next
--    sea-level rise, every major's score and favor, the great-people timeline
--    (class:individual per slot), the winning team.
-- C (same events): every watched plot of LAB_C93_WATCH ({ {x,y}, ... }, set
--    by turnorder_c93rig.lua ZRIG=watch): the city there (owner:id:pop), its
--    centre's garrison / outer damage, and its six neighbours' units as
--    counts of units at war with the owner / the owner's own.
-- ZMODE=swap / readtaken (ZOFF, ZN) / clear / on / mark as turnorder_arm.lua.
local mode = "ZMODE"
if LAB_C93 == nil then LAB_C93 = { n = 0, log = {}, armed = false } end
local S = LAB_C93

local function v(f)
  local ok, x = pcall(f)
  if ok then return tostring(x) end
  return "E"
end

local function playerLine(p)
  local P = Players[p]
  if P == nil then return "P" .. p .. " none" end
  local rt = -1
  pcall(function() rt = P:GetTechs():GetResearchingTech() end)
  return "P" .. p .. " g=" .. v(function() return P:GetTreasury():GetGoldBalance() end)
    .. " gy=" .. v(function() return P:GetTreasury():GetGoldYield() end)
    .. " mt=" .. v(function() return P:GetTreasury():GetTotalMaintenance() end)
    .. " rt=" .. rt .. " rp=" .. v(function() return P:GetTechs():GetResearchProgress(rt) end)
    .. " sy=" .. v(function() return P:GetTechs():GetScienceYield() end)
    .. " f=" .. v(function() return P:GetReligion():GetFaithBalance() end)
    .. " sc=" .. v(function() return P:GetScore() end)
end

local function worldLine()
  local out = { "co2=" .. v(function() return GameClimate.GetTotalCO2Footprint() end),
    "temp=" .. v(function() return GameClimate.GetCurrentAverageTemperature() end),
    "tch=" .. v(function() return GameClimate.GetTemperatureChange() end),
    "lvl=" .. v(function() return GameClimate.GetClimateChangeLevel() end),
    "sea=" .. v(function() return GameClimate.GetNextSeaLevelRiseTurns() end),
    "win=" .. v(function() return Game.GetWinningTeam() end) }
  local sc, fv = {}, {}
  for p = 0, 7 do
    sc[#sc + 1] = v(function() return Players[p]:GetScore() end)
    fv[#fv + 1] = v(function() return Players[p]:GetDiplomacy():GetFavor() end)
  end
  out[#out + 1] = "score=" .. table.concat(sc, ",")
  out[#out + 1] = "favor=" .. table.concat(fv, ",")
  local gp = {}
  pcall(function()
    for _, e in ipairs(Game.GetGreatPeople():GetTimeline()) do
      gp[#gp + 1] = tostring(e.Class) .. ":" .. tostring(e.Individual)
    end
  end)
  out[#out + 1] = "gp=" .. table.concat(gp, ",")
  return table.concat(out, " ")
end

local CENTER = GameInfo.Districts["DISTRICT_CITY_CENTER"].Index
local function watchLine()
  local W = LAB_C93_WATCH
  if W == nil then return "" end
  local out = {}
  for _, xy in ipairs(W) do
    local x, y = xy[1], xy[2]
    local s = x .. "," .. y .. ":"
    pcall(function()
      local pl = Map.GetPlot(x, y)
      local owner = pl:GetOwner()
      local c = nil
      pcall(function() c = Cities.GetCityInPlot(x, y) end)
      if c == nil then
        pcall(function()
          for _, cc in Players[owner]:GetCities():Members() do
            if cc:GetX() == x and cc:GetY() == y then c = cc end
          end
        end)
      end
      if c == nil then s = s .. "nocity o=" .. owner return end
      local co = c:GetOwner()
      s = s .. co .. ":" .. c:GetID() .. ":" .. v(function() return c:GetPopulation() end)
      local d = c:GetDistricts():GetDistrictByType(CENTER)
      s = s .. ":gar=" .. v(function() return d:GetDamage(DefenseTypes.DISTRICT_GARRISON) end)
        .. ":out=" .. v(function() return d:GetDamage(DefenseTypes.DISTRICT_OUTER) end)
      local war, own = 0, 0
      for dir = 0, 5 do
        local ap = Map.GetAdjacentPlot(x, y, dir)
        if ap ~= nil then
          pcall(function()
            for _, u in ipairs(Units.GetUnitsInPlot(ap)) do
              local o = u:GetOwner()
              if o == co then own = own + 1
              elseif Players[o]:GetDiplomacy():IsAtWarWith(co) then war = war + 1 end
            end
          end)
        end
      end
      s = s .. ":adjwar=" .. war .. ":adjown=" .. own
    end)
    out[#out + 1] = s
  end
  return table.concat(out, ";")
end

local BIG = { PlayerTurnStarted = true, PlayerTurnStartComplete = true, OnGameTurnStarted = true, OnGameTurnEnded = true }

local function rec(tag, ...)
  if S.on == false then return end
  S.n = S.n + 1
  local args = { ... }
  local a = {}
  for i = 1, 6 do if args[i] ~= nil then a[#a + 1] = tostring(args[i]) end end
  local head = S.n .. "|" .. v(function() return Game.GetCurrentGameTurn() end) .. "|"
    .. v(function() return Game.GetRandomSeed() end) .. "|" .. tag .. "|" .. table.concat(a, ",")
  local p = tonumber(args[1])
  local body = ""
  if p ~= nil and p >= 0 and p < 64 and tag ~= "OnGameTurnStarted" and tag ~= "OnGameTurnEnded" then
    body = "|" .. playerLine(p)
  else
    body = "|-"
  end
  if BIG[tag] then body = body .. "|W " .. worldLine() .. "|C " .. watchLine() end
  S.log[#S.log + 1] = head .. body
end

if mode == "arm" then
  if S.armed then print("already armed") return end
  local names = { "PlayerTurnStarted", "PlayerTurnStartComplete", "OnFaithEarned", "OnCivicCulturevated",
    "BuildingConstructed", "UnitCreated", "OnCityPopulationChanged", "OnDistrictConstructed",
    "PolicyChanged", "OnGameTurnEnded", "OnGameTurnStarted", "OnGreatPersonActivated", "CityBuilt",
    "CityConquered", "OnPillage", "OnCombatOccurred", "UnitInitialized", "OnUnitRetreated",
    "PostUnitPromotionEarned", "OnPlayerGaveInfluenceToken", "BuildingPillageStateChanged" }
  local ok = 0
  for _, nm in ipairs(names) do
    local tag = nm
    if pcall(function() GameEvents[nm].Add(function(...) rec(tag, ...) end) end) then ok = ok + 1 end
  end
  S.armed = true
  print("c93 armed " .. ok)
elseif mode == "swap" then
  S.taken = S.log; S.log = {}; print("swapped " .. #S.taken)
elseif mode == "readtaken" then
  local tk = S.taken or {}
  for i = ZOFF + 1, math.min(#tk, ZOFF + ZN) do print(tk[i]) end
  print("END " .. #tk)
elseif mode == "clear" then
  S.log = {}; print("cleared")
elseif mode == "on" then
  S.on = true; print("on")
elseif mode == "mark" then
  S.log[#S.log + 1] = "0|0|-|MARK|ZMARK|-"
  print("marked")
elseif mode == "now" then
  print(worldLine())
  print(watchLine())
else
  print("count " .. #S.log)
end
