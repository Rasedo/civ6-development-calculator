-- InGame: the whole game state for the autoplay differential harness, one
-- JSON object per line (lab_json.lua's J / P / OUT are prefixed by the
-- caller). Kinds: "head", "cat" (only with ZCAT=1: every catalog's index ->
-- type name), "row" (one map row), "player", "city", "unit".
-- Every read goes through P, so a call the game lacks records "err:<msg>".
local W, H = Map.GetGridSize()
local turn = Game.GetCurrentGameTurn()
local YI = {}
for row in GameInfo.Yields() do YI[#YI + 1] = row.Index end
local function yields6(f)
  local out = {}
  for i = 1, #YI do out[i] = P(function() return f(YI[i]) end) end
  return out
end
local function bits(tbl, f)
  local s = {}
  for row in tbl() do
    local ok, v = pcall(f, row)
    s[#s + 1] = (ok and v) and "1" or "0"
  end
  return table.concat(s)
end

OUT({k = "head", turn = turn, W = W, H = H,
  wrapX = P(function() return Map.IsWrapX() end),
  localPlayer = P(function() return Game.GetLocalPlayer() end),
  phase = P(function() return Game.GetCurrentTurnPhase() end),
  segment = P(function() return Game.GetCurrentTurnSegment() end)})

if ZCAT == 1 then
  local function names(tbl, col)
    local out = {}
    for row in tbl() do out[row.Index + 1] = row[col] end
    return out
  end
  -- a table only some rulesets carry: an empty list where the game lacks it
  local function namesIf(tname, col)
    local ok, out = pcall(function() return names(GameInfo[tname], col) end)
    return ok and out or {}
  end
  local function pairsOf(tbl, a, b)
    local out = {}
    for row in tbl() do
      if row[b] ~= nil then out[#out + 1] = {row[a], row[b]} end
    end
    return out
  end
  local function wonderNames()
    local out = {}
    for row in GameInfo.Buildings() do
      if row.IsWonder then out[#out + 1] = row.BuildingType end
    end
    return out
  end
  -- per GreatWorks row: [type, object type, the person who makes it, era],
  -- "" for a column the row leaves empty
  local function greatWorkRows()
    local out = {}
    pcall(function()
      for row in GameInfo.GreatWorks() do
        out[row.Index + 1] = {row.GreatWorkType, row.GreatWorkObjectType,
          row.GreatPersonIndividualType or "", row.EraType or ""}
      end
    end)
    return out
  end
  OUT({k = "cat",
    terrains = names(GameInfo.Terrains, "TerrainType"),
    features = names(GameInfo.Features, "FeatureType"),
    resources = names(GameInfo.Resources, "ResourceType"),
    improvements = names(GameInfo.Improvements, "ImprovementType"),
    districts = names(GameInfo.Districts, "DistrictType"),
    buildings = names(GameInfo.Buildings, "BuildingType"),
    units = names(GameInfo.Units, "UnitType"),
    techs = names(GameInfo.Technologies, "TechnologyType"),
    civics = names(GameInfo.Civics, "CivicType"),
    policies = names(GameInfo.Policies, "PolicyType"),
    governments = names(GameInfo.Governments, "GovernmentType"),
    beliefs = names(GameInfo.Beliefs, "BeliefType"),
    religions = names(GameInfo.Religions, "ReligionType"),
    routes = names(GameInfo.Routes, "RouteType"),
    projects = names(GameInfo.Projects, "ProjectType"),
    eras = names(GameInfo.Eras, "EraType"),
    governors = names(GameInfo.Governors, "GovernorType"),
    promotions = names(GameInfo.GovernorPromotions, "GovernorPromotionType"),
    unitPromotions = namesIf("UnitPromotions", "UnitPromotionType"),
    commemorations = namesIf("CommemorationTypes", "CommemorationType"),
    alliances = namesIf("Alliances", "AllianceType"),
    greatPeople = namesIf("GreatPersonIndividuals", "GreatPersonIndividualType"),
    greatPersonClasses = namesIf("GreatPersonClasses", "GreatPersonClassType"),
    randomEvents = namesIf("RandomEvents", "RandomEventType"),
    coastalLowlands = namesIf("CoastalLowlands", "CoastalLowlandType"),
    buildingReplaces = pairsOf(GameInfo.BuildingReplaces, "CivUniqueBuildingType", "ReplacesBuildingType"),
    districtReplaces = pairsOf(GameInfo.DistrictReplaces, "CivUniqueDistrictType", "ReplacesDistrictType"),
    unitReplaces = pairsOf(GameInfo.UnitReplaces, "CivUniqueUnitType", "ReplacesUnitType"),
    leaderInherits = pairsOf(GameInfo.Leaders, "LeaderType", "InheritFrom"),
    wonders = wonderNames(),
    greatWorks = greatWorkRows()})
end

-- the map: per plot [terrain, feature, resource, resourceCount, improvement,
-- improvementPillaged, owner, district, wonder, wonderComplete, route,
-- riverBits (1 NE, 2 NW, 4 W), cliffBits (same), freshWater, appeal,
-- workers, yields x6, isLake, routePillaged, owning city id (-1 unowned),
-- coastal lowland band (TerrainManager, -1 none), flooded, submerged]
for y = 0, H - 1 do
  local row = {}
  for x = 0, W - 1 do
    local q = Map.GetPlot(x, y)
    local function b(f) local ok, v = pcall(f); return (ok and v) and 1 or 0 end
    row[#row + 1] = {
      q:GetTerrainType(), q:GetFeatureType(), q:GetResourceType(), P(function() return q:GetResourceCount() end),
      q:GetImprovementType(), b(function() return q:IsImprovementPillaged() end), q:GetOwner(),
      q:GetDistrictType(), P(function() return q:GetWonderType() end), b(function() return q:IsWonderComplete() end),
      P(function() return q:GetRouteType() end),
      b(function() return q:IsNEOfRiver() end) + 2 * b(function() return q:IsNWOfRiver() end)
        + 4 * b(function() return q:IsWOfRiver() end),
      b(function() return q:IsNEOfCliff() end) + 2 * b(function() return q:IsNWOfCliff() end)
        + 4 * b(function() return q:IsWOfCliff() end),
      b(function() return q:IsFreshWater() end), P(function() return q:GetAppeal() end),
      P(function() return q:GetWorkerCount() end),
      yields6(function(i) return q:GetYield(i) end),
      b(function() return q:IsLake() end), b(function() return q:IsRoutePillaged() end),
      q:GetOwner() >= 0 and P(function() local c = Cities.GetPlotPurchaseCity(q); return c and c:GetID() or -1 end) or -1,
      P(function() return TerrainManager.GetCoastalLowlandType(q) end),
      b(function() return TerrainManager.IsFlooded(q) end), b(function() return TerrainManager.IsSubmerged(q) end)}
  end
  OUT({k = "row", y = y, plots = row})
end

local eras = Game.GetEras()
local players = {}
for p = 0, 63 do
  local pl = Players[p]
  if pl ~= nil and (pl:IsAlive() or pl:IsBarbarian()) then players[#players + 1] = p end
end
for _, p in ipairs(players) do
  local pl = Players[p]
  local cfg = PlayerConfigurations[p]
  local techs, culture, rel, tre = pl:GetTechs(), pl:GetCulture(), pl:GetReligion(), pl:GetTreasury()
  local rec = {k = "player", id = p,
    major = P(function() return pl:IsMajor() end), minor = P(function() return pl:IsMinor() end),
    barb = P(function() return pl:IsBarbarian() end), free = P(function() return pl:IsFreeCities() end),
    human = P(function() return pl:IsHuman() end),
    civ = P(function() return cfg:GetCivilizationTypeName() end),
    leader = P(function() return cfg:GetLeaderTypeName() end),
    turnActive = P(function() return pl:IsTurnActive() end),
    gold = P(function() return tre:GetGoldBalance() end), goldYield = P(function() return tre:GetGoldYield() end),
    maintTotal = P(function() return tre:GetTotalMaintenance() end),
    maintBuildings = P(function() return tre:GetBuildingMaintenance() end),
    maintDistricts = P(function() return tre:GetDistrictMaintenance() end),
    maintUnits = P(function() return tre:GetUnitMaintenance() end),
    faith = P(function() return rel:GetFaithBalance() end), faithYield = P(function() return rel:GetFaithYield() end),
    pantheon = P(function() return rel:GetPantheon() end),
    religionCreated = P(function() return rel:GetReligionTypeCreated() end),
    holyCity = P(function() return rel:GetHolyCityID() end),
    scienceYield = P(function() return techs:GetScienceYield() end),
    researching = P(function() return techs:GetResearchingTech() end),
    cultureYield = P(function() return culture:GetCultureYield() end),
    civic = P(function() return culture:GetProgressingCivic() end),
    government = P(function() return culture:GetCurrentGovernment() end),
    inAnarchy = P(function() return culture:IsInAnarchy() end),
    anarchyEnd = P(function() return culture:GetAnarchyEndTurn() end),
    techs = bits(GameInfo.Technologies, function(r) return techs:HasTech(r.Index) end),
    techBoosts = bits(GameInfo.Technologies, function(r) return techs:HasBoostBeenTriggered(r.Index) end),
    civics = bits(GameInfo.Civics, function(r) return culture:HasCivic(r.Index) end),
    civicBoosts = bits(GameInfo.Civics, function(r) return culture:HasBoostBeenTriggered(r.Index) end),
    era = P(function() return pl:GetEra() end),
    eraScore = P(function() return eras:GetPlayerCurrentScore(p) end),
    darkThreshold = P(function() return eras:GetPlayerDarkAgeThreshold(p) end),
    goldenThreshold = P(function() return eras:GetPlayerGoldenAgeThreshold(p) end),
    darkAge = P(function() return eras:HasDarkAge(p) end), goldenAge = P(function() return eras:HasGoldenAge(p) end),
    heroic = P(function() return eras:HasHeroicGoldenAge(p) end),
    favor = P(function() return pl:GetFavor() end), favorPerTurn = P(function() return pl:GetFavorPerTurn() end),
    score = P(function() return pl:GetScore() end),
    tourism = P(function() return pl:GetStats():GetTourism() end),
    tokens = P(function() return pl:GetInfluence():GetTokensToGive() end),
    suzerain = P(function() return pl:GetInfluence():GetSuzerain() end),
    influencePoints = P(function() return pl:GetInfluence():GetPointsEarned() end),
    governorPoints = P(function() return pl:GetGovernors():GetGovernorPoints() end),
    -- the moments of this turn and the last: [id, MomentType, era score, turn]
    moments = P(function()
      local out = {}
      for _, m in ipairs(Game.GetHistoryManager():GetAllMomentsData(p, 0)) do
        if m.Turn >= turn - 1 then
          local info = GameInfo.Moments[m.Type]
          out[#out + 1] = {m.ID, info and info.MomentType or tostring(m.Type), m.EraScore or 0, m.Turn}
        end
      end
      return out
    end)}
  local ok, cur = pcall(function() return techs:GetResearchingTech() end)
  if ok and cur ~= nil and cur >= 0 then
    rec.researchProgress = P(function() return techs:GetResearchProgress(cur) end)
    rec.researchCost = P(function() return techs:GetResearchCost(cur) end)
  end
  local okc, civ = pcall(function() return culture:GetProgressingCivic() end)
  if okc and civ ~= nil and civ >= 0 then
    rec.civicProgress = P(function() return culture:GetCulturalProgress(civ) end)
    rec.civicCost = P(function() return culture:GetCultureCost(civ) end)
  end
  local slots = {}
  local okn, n = pcall(function() return culture:GetNumPolicySlots() end)
  if okn and n then for i = 0, n - 1 do slots[#slots + 1] = P(function() return culture:GetSlotPolicy(i) end) end end
  rec.policies = slots
  local wars, met = {}, {}
  local dip = pl:GetDiplomacy()
  for _, q in ipairs(players) do
    if q ~= p then
      local okw, w = pcall(function() return dip:IsAtWarWith(q) end)
      if okw and w then wars[#wars + 1] = q end
      local okm, m = pcall(function() return dip:HasMet(q) end)
      if okm and m then met[#met + 1] = q end
    end
  end
  rec.wars, rec.met = wars, met
  -- [player, alliance type, alliance level] per alliance; the players this
  -- one has declared friendship with
  local allies, friends = {}, {}
  for _, q in ipairs(players) do
    if q ~= p then
      local oka, a = pcall(function() return dip:HasAllied(q) end)
      if oka and a then
        allies[#allies + 1] = {q, P(function() return dip:GetAllianceType(q) end), P(function() return dip:GetAllianceLevel(q) end)}
      end
      local okf, f = pcall(function() return dip:HasDeclaredFriendship(q) end)
      if okf and f then friends[#friends + 1] = q end
    end
  end
  rec.allies, rec.friends = allies, friends
  -- the dedications this player holds for the current era
  rec.commemorations = P(function() return eras:GetPlayerActiveCommemorations(p) end)
  local tokens = {}
  local inf = pl:GetInfluence()
  for _, q in ipairs(players) do
    local okt, v = pcall(function() return inf:GetTokensReceived(q) end)
    if okt and v and v > 0 then tokens[#tokens + 1] = {q, v} end
  end
  rec.envoysReceived = tokens
  -- [resource, amount held, amount exported] per luxury held or exported
  local lux = {}
  local res = pl:GetResources()
  for row in GameInfo.Resources() do
    if row.ResourceClassType == "RESOURCECLASS_LUXURY" then
      local oka, n = pcall(function() return res:GetResourceAmount(row.Index) end)
      local oke, e = pcall(function() return res:GetExportedResourceAmount(row.Index) end)
      n = (oka and n) or 0
      e = (oke and e) or 0
      if n > 0 or e > 0 then lux[#lux + 1] = {row.Index, n, e} end
    end
  end
  rec.luxuries = lux
  -- [type, assigned city owner, assigned city id, established, turns to
  -- establish, neutralized turns, {promotion indices}] per appointed governor
  local govs = {}
  local okg, hasGovs, list = pcall(function() return pl:GetGovernors():GetGovernorList() end)
  if okg and hasGovs and list then
    for _, g in ipairs(list) do
      local c = nil
      pcall(function() c = g:GetAssignedCity() end)
      local promos = {}
      for row in GameInfo.GovernorPromotions() do
        local okp, hp = pcall(function() return g:HasPromotion(row.Hash) end)
        if okp and hp then promos[#promos + 1] = row.Index end
      end
      govs[#govs + 1] = {P(function() return g:GetType() end), c and c:GetOwner() or -1, c and c:GetID() or -1,
        P(function() return g:IsEstablished() end), P(function() return g:GetTurnsToEstablish() end),
        P(function() return g:GetNeutralizedTurns() end), promos}
    end
  end
  rec.governors = govs
  local gpp = {}
  for row in GameInfo.GreatPersonClasses() do
    gpp[#gpp + 1] = P(function() return pl:GetGreatPeoplePoints():GetPointsTotal(row.Index) end)
  end
  rec.gpp = gpp
  OUT(rec)
end
OUT({k = "religions", list = P(function() return Game.GetReligion():GetReligions() end)})
-- the World Congress's resolutions table as the first major reads it (raw)
local firstMajor = -1
for _, p in ipairs(players) do if firstMajor < 0 and Players[p]:IsMajor() then firstMajor = p end end
OUT({k = "congress", resolutions = P(function() return Game.GetWorldCongress():GetResolutions(firstMajor) end)})
-- the random event of this turn and the last (floods, eruptions, storms,
-- droughts …), as the climate screen reads them: [turn, RandomEvents index,
-- current plot, start plot, fertility added, tiles damaged, population lost,
-- units lost, river id (-1 none), volcano id, natural-wonder volcano id,
-- start turn, end turn, current direction]
local events = {}
for t = turn - 1, turn do
  local okv, ev = pcall(function() return GameRandomEvents.GetEventsForTurn(t) end)
  if okv and type(ev) == "table" and ev.RandomEvent ~= nil then
    events[#events + 1] = {t, ev.RandomEvent, P(function() return ev.CurrentLocation end),
      P(function() return ev.StartLocation end), P(function() return ev.FertilityAdded end),
      P(function() return ev.TilesDamaged end), P(function() return ev.PopLost end),
      P(function() return ev.UnitsLost end), P(function() return ev.River end),
      P(function() return ev.Volcano end), P(function() return ev.NaturalWonderVolcano end),
      P(function() return ev.StartTurn end), P(function() return ev.EndTurn end),
      P(function() return ev.CurrentDirection end)}
  end
end
OUT({k = "events", list = events})
-- every great person recruited so far, by individual: [GreatPersonIndividuals
-- index, claimant player, class, era, turn granted]
OUT({k = "greatPeople", past = P(function()
  local out = {}
  for _, e in ipairs(Game.GetGreatPeople():GetPastTimeline()) do
    if e.Claimant ~= nil then
      out[#out + 1] = {e.Individual, e.Claimant, e.Class, e.Era, e.TurnGranted}
    end
  end
  return out
end)})
-- the National Parks: [name, {plot indices}]
OUT({k = "parks", list = P(function()
  local out = {}
  for _, np in pairs(Game.GetNationalParks():EnumerateNationalParks()) do
    out[#out + 1] = {np.Name, np.Plots}
  end
  return out
end)})

local DG = DefenseTypes and DefenseTypes.DISTRICT_GARRISON
local DO = DefenseTypes and DefenseTypes.DISTRICT_OUTER
local YG = GameInfo.Yields["YIELD_GOLD"].Index
local YF = GameInfo.Yields["YIELD_FAITH"].Index
for _, p in ipairs(players) do
  local pl = Players[p]
  for _, c in pl:GetCities():Members() do
    local g, cul, rel, bq, cit = c:GetGrowth(), c:GetCulture(), c:GetReligion(), c:GetBuildQueue(), c:GetCitizens()
    local idn, gold, bl, ds = c:GetCulturalIdentity(), c:GetGold(), c:GetBuildings(), c:GetDistricts()
    local rec = {k = "city", owner = p, id = c:GetID(), name = c:GetName(), x = c:GetX(), y = c:GetY(),
      pop = c:GetPopulation(), capital = P(function() return c:IsCapital() end),
      originalCapital = P(function() return c:IsOriginalCapital() end),
      originalOwner = P(function() return c:GetOriginalOwner() end),
      occupied = P(function() return c:IsOccupied() end),
      yields = yields6(function(i) return c:GetYield(i) end),
      food = P(function() return g:GetFood() end), foodSurplus = P(function() return g:GetFoodSurplus() end),
      growthThreshold = P(function() return g:GetGrowthThreshold() end),
      turnsToGrow = P(function() return g:GetTurnsUntilGrowth() end),
      housing = P(function() return g:GetHousing() end),
      housingParts = {P(function() return g:GetHousingFromWater() end), P(function() return g:GetHousingFromBuildings() end),
        P(function() return g:GetHousingFromDistricts() end), P(function() return g:GetHousingFromImprovements() end),
        P(function() return g:GetHousingFromCivics() end), P(function() return g:GetHousingFromGreatPeople() end),
        P(function() return g:GetHousingFromStartingEra() end)},
      housingGrowthMod = P(function() return g:GetHousingGrowthModifier() end),
      happinessGrowthMod = P(function() return g:GetHappinessGrowthModifier() end),
      overallGrowthMod = P(function() return g:GetOverallGrowthModifier() end),
      amenities = P(function() return g:GetAmenities() end), amenitiesNeeded = P(function() return g:GetAmenitiesNeeded() end),
      happiness = P(function() return g:GetHappiness() end),
      happinessYieldMod = P(function() return g:GetHappinessNonFoodYieldModifier() end),
      amenityParts = {P(function() return g:GetAmenitiesFromLuxuries() end), P(function() return g:GetAmenitiesFromEntertainment() end),
        P(function() return g:GetAmenitiesFromCivics() end), P(function() return g:GetAmenitiesFromGreatPeople() end),
        P(function() return g:GetAmenitiesFromCityStates() end), P(function() return g:GetAmenitiesFromReligion() end),
        P(function() return g:GetAmenitiesFromNationalParks() end), P(function() return g:GetAmenitiesFromStartingEra() end),
        P(function() return g:GetAmenitiesFromImprovements() end), P(function() return g:GetAmenitiesFromDistricts() end),
        P(function() return g:GetAmenitiesFromNaturalWonders() end), P(function() return g:GetAmenitiesFromTraits() end),
        P(function() return g:GetAmenitiesFromGovernors() end),
        P(function() return g:GetAmenitiesLostFromWarWeariness() end), P(function() return g:GetAmenitiesLostFromBankruptcy() end)},
      culture = P(function() return cul:GetCurrentCulture() end), cultureYield = P(function() return cul:GetCultureYield() end),
      nextPlot = P(function() return cul:GetNextPlot() end), nextPlotCost = P(function() return cul:GetNextPlotCultureCost() end),
      turnsToExpand = P(function() return cul:GetTurnsUntilExpansion() end),
      tourism = P(function() return cul:GetTourism() end),
      loyalty = P(function() return idn:GetLoyalty() end), maxLoyalty = P(function() return idn:GetMaxLoyalty() end),
      loyaltyPerTurn = P(function() return idn:GetLoyaltyPerTurn() end), loyaltyLevel = P(function() return idn:GetLoyaltyLevel() end),
      loyaltyBreakdown = P(function() return idn:GetIdentitySourcesBreakdown() end),
      majorityReligion = P(function() return rel:GetMajorityReligion() end),
      religions = P(function() return rel:GetReligionsInCity() end),
      -- what this city presses on each city in range a turn (the banner's outward reader)
      pressureOut = P(function() return rel:GetPressureFromCity() end),
      currentProduction = P(function() return bq:GetCurrentProductionTypeHash() end),
      productionYield = P(function() return bq:GetProductionYield() end),
      queueSize = P(function() return bq:GetSize() end),
      governor = P(function() local gv = c:GetAssignedGovernor(); return gv and gv:GetType() or -1 end)}
    -- the queue, and beside it the production each entry has banked
    local qs, qp = {}, {}
    local okq, qn = pcall(function() return bq:GetSize() end)
    if okq and qn then
      for i = 0, qn - 1 do
        local e = P(function() return bq:GetAt(i) end)
        qs[#qs + 1] = e
        qp[#qp + 1] = P(function()
          if type(e) ~= "table" then return -1 end
          if e.DistrictType ~= nil and e.DistrictType >= 0 then return bq:GetDistrictProgress(e.DistrictType) end
          if e.ProjectType ~= nil and e.ProjectType >= 0 then return bq:GetProjectProgress(e.ProjectType) end
          if e.UnitType ~= nil and e.UnitType >= 0 then return bq:GetUnitProgress(e.UnitType) end
          if e.BuildingType ~= nil and e.BuildingType >= 0 then return bq:GetBuildingProgress(e.BuildingType) end
          return -1
        end)
      end
    end
    rec.queue = qs
    rec.queueProgress = qp
    local bs, gws = {}, {}
    for row in GameInfo.Buildings() do
      local okh, has = pcall(function() return bl:HasBuilding(row.Index) end)
      if okh and has then
        local okp, pil = pcall(function() return bl:IsPillaged(row.Hash) end)
        bs[#bs + 1] = {row.Index, (okp and pil) and 1 or 0}
        local okn, n = pcall(function() return bl:GetNumGreatWorkSlots(row.Index) end)
        if okn and n then
          for s = 0, n - 1 do
            local okw, gw = pcall(function() return bl:GetGreatWorkInSlot(row.Index, s) end)
            if okw and gw and gw >= 0 then
              gws[#gws + 1] = {row.Index, s, gw, P(function() return Game.GetGreatWorkType(gw) end)}
            end
          end
        end
      end
    end
    rec.buildings = bs
    -- [building, slot, great work index, GreatWorks row]
    rec.greatWorks = gws
    local dl = {}
    for _, d in ds:Members() do
      dl[#dl + 1] = {P(function() return d:GetType() end), P(function() return d:GetX() end), P(function() return d:GetY() end),
        P(function() return d:IsComplete() end), P(function() return d:IsPillaged() end),
        P(function() return d:GetDefenseStrength() end),
        P(function() return d:GetDamage(DG) end), P(function() return d:GetMaxDamage(DG) end),
        P(function() return d:GetDamage(DO) end), P(function() return d:GetMaxDamage(DO) end)}
    end
    rec.districts = dl
    -- the plots this city works: every plot within 3 whose citizen flag is set
    local worked = {}
    for dx = -3, 3 do
      for dy = -3, 3 do
        local q = Map.GetPlotXYWithRangeCheck(c:GetX(), c:GetY(), dx, dy, 3)
        if q ~= nil then
          local okw, w = pcall(function() return cit:IsPlotWorked(q:GetX(), q:GetY()) end)
          if okw and w then worked[#worked + 1] = q:GetIndex() end
        end
      end
    end
    rec.worked = worked
    -- the citizen manager's yield flags (the city focus): the Yields indices
    -- favored and disfavored
    local fav, dis = {}, {}
    for _, yi in ipairs(YI) do
      local okf, f = pcall(function() return cit:IsFavoredYield(yi) end)
      if okf and f then fav[#fav + 1] = yi end
      local okd, d = pcall(function() return cit:IsDisfavoredYield(yi) end)
      if okd and d then dis[#dis + 1] = yi end
    end
    rec.favored, rec.disfavored = fav, dis
    -- the luxury allocation's entries naming this city: [resource, amount]
    rec.luxAlloc = P(function()
      local out = {}
      for _, e in ipairs(pl:GetResources():GetCityResourceAllocations(c:GetID())) do
        out[#out + 1] = {e.Resource, e.AllocationAmount}
      end
      return out
    end)
    -- purchase prices: every building and unit this city can produce now, and
    -- every plot within 3 it could buy
    local buy = {}
    for row in GameInfo.Buildings() do
      local okc, can = pcall(function() return bq:CanProduce(row.Hash, true) end)
      if okc and can then
        buy[#buy + 1] = {"B", row.Index, P(function() return bq:GetBuildingCost(row.Index) end),
          P(function() return gold:GetPurchaseCost(YG, row.Hash) end), P(function() return gold:GetPurchaseCost(YF, row.Hash) end)}
      end
    end
    for row in GameInfo.Units() do
      local okc, can = pcall(function() return bq:CanProduce(row.Hash, true) end)
      if okc and can then
        buy[#buy + 1] = {"U", row.Index, P(function() return bq:GetUnitCost(row.Index) end),
          P(function() return gold:GetPurchaseCost(YG, row.Hash, MilitaryFormationTypes.STANDARD_MILITARY_FORMATION) end),
          P(function() return gold:GetPurchaseCost(YF, row.Hash, MilitaryFormationTypes.STANDARD_MILITARY_FORMATION) end)}
      end
    end
    for row in GameInfo.Districts() do
      local okc, can = pcall(function() return bq:CanProduce(row.Hash, true) end)
      if okc and can then
        buy[#buy + 1] = {"D", row.Index, P(function() return bq:GetDistrictCost(row.Index) end),
          P(function() return gold:GetPurchaseCost(YG, row.Hash) end), P(function() return gold:GetPurchaseCost(YF, row.Hash) end)}
      end
    end
    rec.buy = buy
    local plotBuy = {}
    for dx = -3, 3 do
      for dy = -3, 3 do
        local q = Map.GetPlotXYWithRangeCheck(c:GetX(), c:GetY(), dx, dy, 3)
        if q ~= nil and q:GetOwner() == -1 then
          local okg, v = pcall(function() return gold:GetPlotPurchaseCost(q:GetIndex()) end)
          if okg and v and v > 0 then plotBuy[#plotBuy + 1] = {q:GetIndex(), v} end
        end
      end
    end
    rec.plotBuy = plotBuy
    -- the trade routes leaving this city, as the game's route table gives them
    rec.routes = P(function() return c:GetTrade():GetOutgoingRoutes() end)
    OUT(rec)
  end
end

-- the unit promotions each unit holds, by UnitPromotions index
local function unitPromos(u)
  local out = {}
  local okx, xp = pcall(function() return u:GetExperience() end)
  if not okx or not xp then return out end
  for row in GameInfo.UnitPromotions() do
    local okp, hp = pcall(function() return xp:HasPromotion(row.Index) end)
    if okp and hp then out[#out + 1] = row.Index end
  end
  return out
end
for _, p in ipairs(players) do
  for _, u in Players[p]:GetUnits():Members() do
    OUT({k = "unit", owner = p, id = u:GetID(), type = u:GetType(), x = u:GetX(), y = u:GetY(),
      promotions = unitPromos(u),
      damage = P(function() return u:GetDamage() end), moves = P(function() return u:GetMovesRemaining() end),
      maxMoves = P(function() return u:GetMaxMoves() end), xp = P(function() return u:GetExperience():GetExperiencePoints() end),
      level = P(function() return u:GetExperience():GetLevel() end),
      formation = P(function() return u:GetMilitaryFormation() end),
      buildCharges = P(function() return u:GetBuildCharges() end), spreadCharges = P(function() return u:GetSpreadCharges() end),
      religion = P(function() return u:GetReligionType() end), embarked = P(function() return u:IsEmbarked() end),
      fortify = P(function() return u:GetFortifyTurns() end)})
  end
end
-- each major's revealed plots (PlayersVisibility IsRevealed), a hex string
-- of the plot bits in plot order, four plots a digit (plot 4k the digit's
-- lowest bit)
local HEX = "0123456789abcdef"
local revealed = {}
for _, p in ipairs(players) do
  if Players[p]:IsMajor() then
    revealed[tostring(p)] = P(function()
      local vis = PlayersVisibility[p]
      local s = {}
      for i = 0, W * H - 1, 4 do
        local d = 0
        for b = 0, 3 do
          local j = i + b
          if j < W * H and vis:IsRevealed(j % W, math.floor(j / W)) then d = d + 2 ^ b end
        end
        s[#s + 1] = HEX:sub(d + 1, d + 1)
      end
      return table.concat(s)
    end)
  end
end
OUT({k = "revealed", players = revealed})

OUT({k = "end", turn = Game.GetCurrentGameTurn()})
