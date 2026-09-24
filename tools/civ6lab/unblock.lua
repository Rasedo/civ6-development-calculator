-- InGame: resolve the ONE blocker the game reports, the way the UI would,
-- then request the end of turn. Blocker-driven on purpose: calling the
-- escape-route query or a forced end turn outside their UI context crashed
-- the game to desktop twice (2026-09-13, dumps 7C1DF660 / B31A4D66).
local me = Game.GetLocalPlayer()
if me == nil or me < 0 then print("unblock: no local player") return end
local pl = Players[me]
local b = NotificationManager.GetFirstEndTurnBlocking(me)
local bname = tostring(b)
for k, v in pairs(EndTurnBlockingTypes) do if v == b then bname = k end end
local did = "nothing"
if b == EndTurnBlockingTypes.ENDTURN_BLOCKING_SPY_CHOOSE_ESCAPE_ROUTE then
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
    did = "escape route " .. pick .. " of " .. #routes .. " for spy " .. id .. " " .. spy:GetName()
      .. " level " .. spy:GetExperience():GetLevel() .. " turn " .. Game.GetCurrentGameTurn()
  else
    did = "escape blocker but no escaping spy id"
  end
elseif b == EndTurnBlockingTypes.ENDTURN_BLOCKING_RESEARCH then
  local techs = pl:GetTechs()
  for row in GameInfo.Technologies() do
    if techs:CanResearch(row.Index) then
      local t = {}
      t[PlayerOperations.PARAM_TECH_TYPE] = row.Hash
      t[PlayerOperations.PARAM_INSERT_MODE] = PlayerOperations.VALUE_EXCLUSIVE
      UI.RequestPlayerOperation(me, PlayerOperations.RESEARCH, t)
      did = "research " .. row.TechnologyType
      break
    end
  end
elseif b == EndTurnBlockingTypes.ENDTURN_BLOCKING_CIVIC then
  local cul = pl:GetCulture()
  for row in GameInfo.Civics() do
    if cul:CanProgress(row.Index) then
      local t = {}
      t[PlayerOperations.PARAM_CIVIC_TYPE] = row.Hash
      t[PlayerOperations.PARAM_INSERT_MODE] = PlayerOperations.VALUE_EXCLUSIVE
      UI.RequestPlayerOperation(me, PlayerOperations.PROGRESS_CIVIC, t)
      did = "civic " .. row.CivicType
      break
    end
  end
elseif b == EndTurnBlockingTypes.ENDTURN_BLOCKING_PRODUCTION then
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
end
UI.RequestAction(ActionTypes.ACTION_ENDTURN)
print("unblock: blocker " .. bname .. " -> " .. did .. " | end turn requested")
