-- InGame: resolve the ONE end-turn blocker the seat ZSEAT has (a pending
-- escape prompt first) with a legal choice, the way its screen would, and
-- print `unblock: blocker <name> -> <what was done>`. It never ends the turn:
-- `lab.py` requests that after it in the endturn mode. Blocker-driven on
-- purpose: calling the escape-route query or a forced end turn outside their
-- UI context crashed the game to desktop twice (dumps 7C1DF660 / B31A4D66).
-- The Dedication blocker is `commemorate.lua`'s. The handlers and the screen
-- each copies:
--   escape route        EspionageEscape.lua (SET_ESCAPE_ROUTE)
--   research / civic    the first item CanResearch / CanProgress allows
--   production          the first of a fixed list CanStartOperation allows
--   pantheon            PantheonChooser.lua (FOUND_PANTHEON, the first free
--                       pantheon belief)                                     UNVERIFIED
--   governor appoint    GovernorPanel.lua (APPOINT_GOVERNOR, the row Index)  UNVERIFIED
--   governor promote    GovernorDetailsPanel.lua (PROMOTE_GOVERNOR, the
--                       promotion Index, first CanEarnPromotion)            UNVERIFIED
--   government change   GovernmentScreen.lua (SetGovernmentChangeConsidered) UNVERIFIED
--   influence token     GIVE_INFLUENCE_TOKEN to the first met city-state
--   raze a city         RazeCity.lua (DESTROY with KEEP on GetNextCapturedCity) UNVERIFIED
-- Any other blocker is named and left alone.
local me = tonumber("ZSEAT") or Game.GetLocalPlayer()
if me == nil or me < 0 then print("unblock: no seat") return end
local pl = Players[me]
local b = NotificationManager.GetFirstEndTurnBlocking(me)
local bname = tostring(b)
for k, v in pairs(EndTurnBlockingTypes) do if v == b then bname = k end end
local did = "nothing"
local B = EndTurnBlockingTypes
-- an escape prompt can sit BEHIND another blocker (a city that keeps asking
-- for production) and then is never the first one; its notification says
-- it is there, the way the notification panel finds it
local escaping = false
for _, nid in ipairs(NotificationManager.GetList(me) or {}) do
  local n = NotificationManager.Find(me, nid)
  if n ~= nil and n:GetType() == NotificationTypes.SPY_CHOOSE_ESCAPE_ROUTE then escaping = true end
end
if escaping then
  b = B.ENDTURN_BLOCKING_SPY_CHOOSE_ESCAPE_ROUTE
  bname = "ENDTURN_BLOCKING_SPY_CHOOSE_ESCAPE_ROUTE"
end
local function op(kind, t)
  local ok, err = pcall(function() UI.RequestPlayerOperation(me, kind, t) end)
  return ok and "" or (" (err:" .. tostring(err) .. ")")
end
if b == B.ENDTURN_BLOCKING_SPY_CHOOSE_ESCAPE_ROUTE then
  -- the routes the escape popup offers (EspionageEscape.lua): a district the
  -- city has, the city centre always; the spy's id picks one, so a batch
  -- spreads over every route on offer
  local id = pl:GetDiplomacy():GetNextEscapingSpyID()
  if id ~= nil and id >= 0 then
    local spy = pl:GetUnits():FindID(id)
    local city = Cities.GetPlotPurchaseCity(spy:GetX(), spy:GetY())
    local routes = {}
    for _, d in ipairs({"DISTRICT_AERODROME", "DISTRICT_HARBOR", "DISTRICT_COMMERCIAL_HUB"}) do
      if city ~= nil and city:GetDistricts():HasDistrict(GameInfo.Districts[d].Index, true, true) then routes[#routes + 1] = d end
    end
    routes[#routes + 1] = "DISTRICT_CITY_CENTER"
    local pick = routes[(id % #routes) + 1]
    local t = {}
    t[PlayerOperations.PARAM_DISTRICT_TYPE] = GameInfo.Districts[pick].Index
    UI.RequestPlayerOperation(me, PlayerOperations.SET_ESCAPE_ROUTE, t)
    local pursuer = spy:GetPursuingSpyName()
    did = "escape route " .. pick .. " of " .. #routes .. " for spy " .. id .. " " .. spy:GetName()
      .. " level " .. spy:GetExperience():GetLevel() .. " turn " .. Game.GetCurrentGameTurn()
      .. " city " .. (city ~= nil and (city:GetName() .. " p" .. city:GetOwner()) or "none")
      .. " at " .. spy:GetX() .. ":" .. spy:GetY()
      .. " pursuer " .. ((pursuer == nil or pursuer == "") and "police" or pursuer)
  else
    did = "escape blocker but no escaping spy id"
  end
elseif b == B.ENDTURN_BLOCKING_RESEARCH then
  local techs = pl:GetTechs()
  for row in GameInfo.Technologies() do
    if techs:CanResearch(row.Index) then
      local t = {}
      t[PlayerOperations.PARAM_TECH_TYPE] = row.Hash
      t[PlayerOperations.PARAM_INSERT_MODE] = PlayerOperations.VALUE_EXCLUSIVE
      did = "research " .. row.TechnologyType .. op(PlayerOperations.RESEARCH, t)
      break
    end
  end
elseif b == B.ENDTURN_BLOCKING_CIVIC then
  local cul = pl:GetCulture()
  for row in GameInfo.Civics() do
    if cul:CanProgress(row.Index) then
      local t = {}
      t[PlayerOperations.PARAM_CIVIC_TYPE] = row.Hash
      t[PlayerOperations.PARAM_INSERT_MODE] = PlayerOperations.VALUE_EXCLUSIVE
      did = "civic " .. row.CivicType .. op(PlayerOperations.PROGRESS_CIVIC, t)
      break
    end
  end
elseif b == B.ENDTURN_BLOCKING_PRODUCTION then
  for _, c in pl:GetCities():Members() do
    if c:GetBuildQueue():GetCurrentProductionTypeHash() == 0 then
      for _, name in ipairs({"BUILDING_GRANARY", "BUILDING_MONUMENT", "BUILDING_WALLS", "BUILDING_LIBRARY", "BUILDING_WATER_MILL", "BUILDING_SHRINE", "UNIT_WARRIOR", "UNIT_SLINGER", "UNIT_BUILDER"}) do
        local t = {}
        if GameInfo.Buildings[name] then t[CityOperationTypes.PARAM_BUILDING_TYPE] = GameInfo.Buildings[name].Hash
        else t[CityOperationTypes.PARAM_UNIT_TYPE] = GameInfo.Units[name].Hash end
        t[CityOperationTypes.PARAM_INSERT_MODE] = CityOperationTypes.VALUE_EXCLUSIVE
        if CityManager.CanStartOperation(c, CityOperationTypes.BUILD, t) then
          CityManager.RequestOperation(c, CityOperationTypes.BUILD, t)
          did = c:GetName():gsub("LOC_CITY_NAME_", "") .. " builds " .. name
          break
        end
      end
    end
  end
elseif b == B.ENDTURN_BLOCKING_PANTHEON then
  local gr = Game.GetReligion()
  for row in GameInfo.Beliefs() do
    if row.BeliefClassType == "BELIEF_CLASS_PANTHEON" and not gr:IsInSomePantheon(row.Index)
       and not gr:IsInSomeReligion(row.Index) then
      local t = {}
      t[PlayerOperations.PARAM_BELIEF_TYPE] = row.Hash
      t[PlayerOperations.PARAM_INSERT_MODE] = PlayerOperations.VALUE_EXCLUSIVE
      did = "pantheon " .. row.BeliefType .. op(PlayerOperations.FOUND_PANTHEON, t)
      break
    end
  end
elseif b == B.ENDTURN_BLOCKING_GOVERNOR_APPOINTMENT then
  local g = pl:GetGovernors()
  for row in GameInfo.Governors() do
    if g:CanAppoint() and not g:HasGovernor(row.Hash) and g:CanEverAppointGovernor(row.Hash) then
      local t = {}
      t[PlayerOperations.PARAM_GOVERNOR_TYPE] = row.Index
      did = "appoint " .. row.GovernorType .. op(PlayerOperations.APPOINT_GOVERNOR, t)
      break
    end
  end
elseif b == B.ENDTURN_BLOCKING_GOVERNOR_PROMOTION then
  local g = pl:GetGovernors()
  for set in GameInfo.GovernorPromotionSets() do
    local gov = GameInfo.Governors[set.GovernorType]
    local promo = GameInfo.GovernorPromotions[set.GovernorPromotion]
    if did == "nothing" and gov and promo and g:HasGovernor(gov.Hash) and g:CanEarnPromotion(gov.Hash, promo.Hash) then
      local t = {}
      t[PlayerOperations.PARAM_GOVERNOR_TYPE] = gov.Index
      t[PlayerOperations.PARAM_GOVERNOR_PROMOTION_TYPE] = promo.Index
      did = "promote " .. gov.GovernorType .. " " .. promo.GovernorPromotionType .. op(PlayerOperations.PROMOTE_GOVERNOR, t)
    end
  end
elseif b == B.ENDTURN_BLOCKING_CONSIDER_GOVERNMENT_CHANGE then
  local ok, err = pcall(function() pl:GetCulture():SetGovernmentChangeConsidered(true) end)
  did = "government change considered" .. (ok and "" or (" (err:" .. tostring(err) .. ")"))
elseif b == B.ENDTURN_BLOCKING_GIVE_INFLUENCE_TOKEN then
  for p = 0, 62 do
    local m = Players[p]
    if did == "nothing" and m ~= nil and m:IsAlive() and not m:IsMajor() and not m:IsBarbarian()
       and not m:IsFreeCities() and pl:GetDiplomacy():HasMet(p) then
      local t = {}
      t[PlayerOperations.PARAM_PLAYER_ONE] = p
      did = "envoy to p" .. p .. op(PlayerOperations.GIVE_INFLUENCE_TOKEN, t)
    end
  end
elseif b == B.ENDTURN_BLOCKING_CONSIDER_RAZE_CITY then
  local c = pl:GetCities():GetNextCapturedCity()
  if c ~= nil then
    local t = {}
    t[UnitOperationTypes.PARAM_FLAGS] = CityDestroyDirectives.KEEP
    local ok, err = pcall(function() CityManager.RequestCommand(c, CityCommandTypes.DESTROY, t) end)
    did = "keep " .. tostring(c:GetName()) .. (ok and "" or (" (err:" .. tostring(err) .. ")"))
  end
end
print("unblock: blocker " .. bname .. " -> " .. did)
