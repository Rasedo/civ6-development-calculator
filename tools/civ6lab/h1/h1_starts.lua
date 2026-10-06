-- GameCore_Tuner: the turn-start witness for the autoplay differential
-- harness (lab_json.lua's J / P / OUT are prefixed by the caller).
--
-- Every player's start of turn runs inside its own block, one player at a
-- time in ascending id (tools/civ6lab/turn_order_civ6.md, A1-A11):
-- GameEvents.PlayerTurnStarted(p) fires before the block banks anything,
-- GameEvents.PlayerTurnStartComplete(p) after its cities, units and banks.
-- GameEvents fire synchronously inside the DLL, so a listener reads the
-- state at exactly those two points. ZMODE:
--   arm   install the two listeners once per game (the GameCore_Tuner state's
--         global LAB_H1 lives as long as the game; a loaded game installs
--         afresh), then print the starts line
--   starts  print {k = "starts", ...}: per player the last turn each event
--         fired for it
--   read  the same with the witness of the record's turn and the one before
--
-- The witness of a player's start, `pre` at PlayerTurnStarted and `post` at
-- PlayerTurnStartComplete: the player's gold, faith, research and civic
-- progress, era score; per city its population, food, food surplus, growth
-- threshold, culture box and yield, next plot, owned plots, loyalty and its
-- rate, the head of its queue and that item's progress, its yields, the
-- plots it works and its religions. `pre` is what the start banks from (the
-- player's last actions done); `post` what it left.
local mode = "ZMODE"
local now = Game.GetCurrentGameTurn()
if LAB_H1 == nil then LAB_H1 = { armed = false, started = {}, complete = {}, witness = {} } end
local H = LAB_H1

local function cityWitness(c)
  local w = {}
  local function r(k, f)
    local ok, v = pcall(f)
    w[k] = ok and v or ("err:" .. tostring(v))
  end
  r("id", function() return c:GetID() end)
  r("pop", function() return c:GetPopulation() end)
  r("food", function() return c:GetGrowth():GetFood() end)
  r("foodSurplus", function() return c:GetGrowth():GetFoodSurplus() end)
  r("growthThreshold", function() return c:GetGrowth():GetGrowthThreshold() end)
  r("culture", function() return c:GetCulture():GetCurrentCulture() end)
  r("cultureYield", function() return c:GetCulture():GetCultureYield() end)
  r("nextPlot", function() return c:GetCulture():GetNextPlot() end)
  r("plots", function() return #c:GetOwnedPlots() end)
  r("loyalty", function() return c:GetCulturalIdentity():GetLoyalty() end)
  r("loyaltyPerTurn", function() return c:GetCulturalIdentity():GetLoyaltyPerTurn() end)
  r("production", function() return c:GetBuildQueue():GetCurrentProductionTypeHash() end)
  r("productionProgress", function()
    local bq = c:GetBuildQueue()
    local e = bq:GetAt(0)
    if type(e) ~= "table" then return -1 end
    if e.DistrictType ~= nil and e.DistrictType >= 0 then return bq:GetDistrictProgress(e.DistrictType) end
    if e.ProjectType ~= nil and e.ProjectType >= 0 then return bq:GetProjectProgress(e.ProjectType) end
    if e.UnitType ~= nil and e.UnitType >= 0 then return bq:GetUnitProgress(e.UnitType) end
    if e.BuildingType ~= nil and e.BuildingType >= 0 then return bq:GetBuildingProgress(e.BuildingType) end
    return -1
  end)
  r("yields", function()
    local y = {}
    for row in GameInfo.Yields() do y[#y + 1] = c:GetYield(row.Index) end
    return y
  end)
  r("worked", function()
    local out = {}
    local cit = c:GetCitizens()
    for dx = -3, 3 do
      for dy = -3, 3 do
        local q = Map.GetPlotXYWithRangeCheck(c:GetX(), c:GetY(), dx, dy, 3)
        if q ~= nil and cit:IsPlotWorked(q:GetX(), q:GetY()) then out[#out + 1] = q:GetIndex() end
      end
    end
    return out
  end)
  r("religions", function() return c:GetReligion():GetReligionsInCity() end)
  return w
end

local function playerWitness(p)
  local pl = Players[p]
  if pl == nil then return "noplayer" end
  local w = {}
  local function r(k, f)
    local ok, v = pcall(f)
    w[k] = ok and v or ("err:" .. tostring(v))
  end
  r("gold", function() return pl:GetTreasury():GetGoldBalance() end)
  r("faith", function() return pl:GetReligion():GetFaithBalance() end)
  r("researching", function() return pl:GetTechs():GetResearchingTech() end)
  r("researchProgress", function()
    local t = pl:GetTechs():GetResearchingTech()
    return t >= 0 and pl:GetTechs():GetResearchProgress(t) or -1
  end)
  r("civic", function() return pl:GetCulture():GetProgressingCivic() end)
  r("civicProgress", function()
    local cv = pl:GetCulture():GetProgressingCivic()
    return cv >= 0 and pl:GetCulture():GetCulturalProgress(cv) or -1
  end)
  r("eraScore", function() return Game.GetEras():GetPlayerCurrentScore(p) end)
  local cities = {}
  pcall(function()
    for _, c in pl:GetCities():Members() do cities[#cities + 1] = cityWitness(c) end
  end)
  w.cities = cities
  return w
end

-- the witness of turn `t` for player `p`, `slot` "pre" or "post"; the
-- turns before t - 2 are dropped
local function keep(p, slot)
  local t = Game.GetCurrentGameTurn()
  H.witness[t] = H.witness[t] or {}
  local byP = H.witness[t]
  byP[p] = byP[p] or {}
  byP[p][slot] = playerWitness(p)
  for k in pairs(H.witness) do if k < t - 2 then H.witness[k] = nil end end
end

if mode == "arm" and not H.armed then
  GameEvents.PlayerTurnStarted.Add(function(p)
    H.started[p] = Game.GetCurrentGameTurn()
    pcall(keep, p, "pre")
  end)
  GameEvents.PlayerTurnStartComplete.Add(function(p)
    pcall(keep, p, "post")
    H.complete[p] = Game.GetCurrentGameTurn()
  end)
  H.armed = true
end

local starts = {}
for p = 0, 63 do
  if H.started[p] ~= nil or H.complete[p] ~= nil then
    starts[tostring(p)] = { H.started[p] or -1, H.complete[p] or -1 }
  end
end
-- the witness as a flat list (J writes six levels deep): one entry per
-- turn, player and point, its player fields and cities beside them
local wit = {}
for _, t in ipairs(mode == "read" and { ZTURN - 1, ZTURN } or {}) do
  for p, v in pairs(H.witness[t] or {}) do
    for _, slot in ipairs({ "pre", "post" }) do
      local w = v[slot]
      if type(w) == "table" then
        local e = { turn = t, player = p, point = slot }
        for k2, x in pairs(w) do e[k2] = x end
        wit[#wit + 1] = e
      end
    end
  end
end
OUT({ k = "starts", turn = now, armed = H.armed, starts = starts, witness = wit })
