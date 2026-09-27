-- GameCore_Tuner or InGame: the turn-order recorder. ZMODE=arm registers one
-- listener per event name below on every source this state has (GameCore:
-- GameEvents and Events; InGame: Events), each appending one line
--   seq|turn|seed|src.name|arg1|arg2|...
-- to the global LAB_TO.log (globals persist across tuner calls). `seed` is
-- Game.GetRandomSeed() at the moment the listener runs (GameCore only; "-"
-- elsewhere), so the sync draws between two lines are countable offline.
-- ZMODE=on / off turns recording on / off; ZMODE=clear empties the log;
-- ZMODE=read prints lines ZOFF+1 .. ZOFF+ZN; ZMODE=count prints the length.
--   --set ZMODE=arm --set ZSTATE=GC
local mode = "ZMODE"
if LAB_TO == nil then LAB_TO = { n = 0, log = {}, on = true, armed = false, ok = {}, bad = {} } end
local T = LAB_TO

local NAMES = [[
OnGameTurnStarted PlayerTurnStarted PlayerTurnStartComplete OnPlayerTurnEnded OnPlayerTurnEnd
OnGameTurnEnded OnGameTurnEnd PlayerTurnEnded CityBuilt CityConquered UnitCreated UnitInitialized
OnPillage OnDistrictConstructed OnCombatOccurred TradeRoutePlundered PostUnitPromotionEarned
PolicyChanged PlotPropertyChanged OnWMDCountChanged OnUnitRetreated OnPlayerGaveInfluenceToken
OnNuclearWeaponDetonated OnImprovementPillaged OnGreatPersonActivated OnFaithEarned
OnCivicCulturevated OnCityPopulationChanged BuildingPillageStateChanged BuildingConstructed
OnCityProductionCompleted CityProductionCompleted OnResearchCompleted OnCivicCompleted
OnTechBoostTriggered OnCivicBoostTriggered UnitTriggerGoodyHut
TurnBegin TurnEnd PreTurnBegin PhaseBegin PlayerTurnActivated PlayerTurnDeactivated
LocalPlayerTurnBegin LocalPlayerTurnEnd RemotePlayerTurnBegin RemotePlayerTurnEnd
CityPopulationChanged CityProjectCompleted CityProductionChanged CityProductionUpdated
CityTileOwnershipChanged CityLoyaltyChanged CityTransfered CulturalIdentityCityConverted
CulturalIdentityConversionOutcomeChanged CityReligionChanged CityReligionFollowersChanged
ReligionFounded PantheonFounded BeliefAdded ResearchCompleted CivicCompleted TechBoostTriggered
CivicBoostTriggered ResearchChanged CivicChanged TreasuryChanged FaithChanged FavorChanged
InfluenceChanged InfluenceGiven GreatPeoplePointsChanged UnitGreatPersonActivated
UnitDamageChanged UnitKilledInCombat UnitKilledByFallout UnitRemovedFromMap UnitAddedToMap
UnitUpgraded UnitPromoted UnitMovementPointsRestored UnitMovementPointsCleared
UnitFortificationChanged UnitChargesChanged UnitCaptured UnitTeleported UnitMoved
RandomEventOccurred RandomEventStarted EmergencyStarted EmergencyCompleted EmergencyAvailable
EmergencyRejected EmergenciesUpdated WorldCongressFinished WorldCongressSpecialSessionBeingCalled
WorldCongressEmergencyReady GameEraChanged PlayerEraChanged PlayerAgeChanged PlayerDarkAgeChanged
PlayerEraTransitionBegins GovernorAppointed GovernorAssigned GovernorChanged GovernorPointsChanged
GovernorPromoted GovernorEjected CityOccupationChanged CitySiegeStatusChanged
CityDefenseStatusChanged DistrictDamageChanged DistrictAddedToMap DistrictBuildProgressChanged
DistrictPillaged DistrictRemovedFromMap BuildingAddedToMap BuildingChanged WonderCompleted
QuestChanged SpyMissionCompleted SpyMissionUpdated TradeRouteActivityChanged TradeRouteAddedToMap
DiplomacyDeclareWar DiplomacyMakePeace DiplomacyDealEnacted DiplomacyRelationshipChanged
PlayerDefeat PlayerDestroyed TeamVictory WMDFalloutChanged WMDDetonated FeatureAddedToMap
FeatureRemovedFromMap FeatureChanged ImprovementAddedToMap ImprovementChanged
ImprovementRemovedFromMap TerrainTypeChanged PlayerResourceChanged PowerGeneratedFromResource
CityPowerChanged CityFocusChanged GoodyHutReward CapitalCityChanged AnarchyBegins AnarchyEnds
GovernmentChanged GovernmentPolicyChanged GovernmentPolicyObsoleted LevyCounterChanged
CorporationAdded GreatWorkCreated CityMadePurchase CityLiberated CityAddedToMap
CityRemovedFromMap CityInitialized CityWorkerChanged NotificationAdded CityCommandStarted
UnitCommandStarted UnitOperationStarted AllianceAvailable AllianceEnded PlayerIntroduced
DiplomacyMeet NationalParkAdded ResourceAddedToMap ResourceRemovedFromMap ResourceChanged
RouteAddedToMap RouteChanged FloodplainRevealed VolcanoRevealed PlayerInfoChanged

]]

local function rec(tag, ...)
  if not T.on or (T.skip ~= nil and T.skip[tag]) then return end
  T.n = T.n + 1
  local parts = { tostring(T.n) }
  local okt, tn = pcall(function() return Game.GetCurrentGameTurn() end)
  parts[2] = okt and tostring(tn) or "?"
  local oks, sd = pcall(function() return Game.GetRandomSeed() end)
  parts[3] = oks and tostring(sd) or "-"
  parts[4] = tag
  local args = { ... }
  for i = 1, 8 do
    local v = args[i]
    if v == nil then break end
    if type(v) == "table" then
      local kv = {}
      for k, x in pairs(v) do
        if #kv < 6 then kv[#kv + 1] = tostring(k) .. "=" .. tostring(x) end
      end
      parts[#parts + 1] = "{" .. table.concat(kv, ";") .. "}"
    else
      parts[#parts + 1] = tostring(v)
    end
  end
  T.log[#T.log + 1] = table.concat(parts, "|")
end

if mode == "arm" then
  if T.armed then print("already armed ok=" .. #T.ok .. " bad=" .. #T.bad) return end
  local sources = {}
  if "ZSTATE" == "GC" then
    local okg, g = pcall(function() return GameEvents end)
    if okg and g ~= nil then sources[#sources + 1] = { "GE", g } end
  end
  local oke, e = pcall(function() return Events end)
  if oke and e ~= nil then sources[#sources + 1] = { "EV", e } end
  for name in string.gmatch(NAMES, "%S+") do
    for _, s in ipairs(sources) do
      local tag = s[1] .. "." .. name
      local ok, err = pcall(function()
        local ev = s[2][name]
        if ev == nil then error("nil") end
        ev.Add(function(...) rec(tag, ...) end)
      end)
      if ok then T.ok[#T.ok + 1] = tag else T.bad[#T.bad + 1] = tag end
    end
  end
  T.armed = true
  print("armed ok=" .. #T.ok .. " bad=" .. #T.bad)
  print("bad: " .. table.concat(T.bad, " "))
elseif mode == "on" then
  T.on = true; print("on n=" .. #T.log)
elseif mode == "off" then
  T.on = false; print("off n=" .. #T.log)
elseif mode == "swap" then
  T.taken = T.log; T.log = {}; print("swapped " .. #T.taken)
elseif mode == "readtaken" then
  local tk = T.taken or {}
  for i = ZOFF + 1, math.min(#tk, ZOFF + ZN) do print(tk[i]) end
  print("END " .. #tk)
elseif mode == "clear" then
  T.log = {}; T.n = 0; print("cleared")
elseif mode == "list" then
  print("ok: " .. table.concat(T.ok, " "))
  print("bad: " .. table.concat(T.bad, " "))
elseif mode == "count" then
  print("count " .. #T.log .. " on=" .. tostring(T.on) .. " armed=" .. tostring(T.armed))
elseif mode == "mark" then
  rec("MARK", "ZMARK")
  print("marked " .. #T.log)
else
  local off, n = ZOFF, ZN
  for i = off + 1, math.min(#T.log, off + n) do print(T.log[i]) end
  print("END " .. #T.log)
end
