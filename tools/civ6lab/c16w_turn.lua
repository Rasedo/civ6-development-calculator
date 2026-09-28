-- InGame, seat 0 local, once per turn of the C-16-S1 guarded-city loop
-- (`c16w_run.py`): every spy of the local seat works ONE city.
--   * a pending promotion: PROMOTION_SPY_TECHNOLOGIST when offered, else any
--     offered one but Ace Driver (escape term) and Polygraph / Quartermaster
--     (level terms);
--   * an idle spy in the target city (the centre ZCX:ZCY) starts ZOP on the
--     district plot ZDX:ZDY;
--   * an idle spy anywhere else travels to the target city;
--   * while the spy count is under ZCAP, a Spy is BOUGHT in a city of mine.
-- Then the defender's spy ZDEF (player ZDP): plot, level, operation.
local me = Game.GetLocalPlayer()
local pl = Players[me]
local op = GameInfo.UnitOperations["ZOP"]
local techno = GameInfo.UnitPromotions["PROMOTION_SPY_TECHNOLOGIST"]
local spyRow = GameInfo.Units["UNIT_SPY"]
local BAD = {PROMOTION_SPY_ACE_DRIVER = 1, PROMOTION_SPY_POLYGRAPH = 1, PROMOTION_SPY_QUARTERMASTER = 1}
local spies = {}
for _, u in pl:GetUnits():Members() do
  if u:GetType() == spyRow.Index then spies[#spies + 1] = u end
end
local started, travelled, promoted, bought = 0, 0, 0, 0
-- ZMAXSTART (c16n_cycle.py --max-start): at most that many missions started
-- a turn, so missions complete one batch at a time; unset, no limit
local maxStart = tonumber("ZMAXSTART") or 99
for _, u in ipairs(spies) do
  local xp = u:GetExperience()
  local canP, res = UnitManager.CanStartCommand(u, UnitCommandTypes.PROMOTE, true, true)
  local offered = canP and res and res[UnitCommandResults.PROMOTIONS] or nil
  if offered ~= nil and #offered > 0 then
    local pick = nil
    for _, e in ipairs(offered) do if e == techno.Index then pick = e end end
    if pick == nil then
      for _, e in ipairs(offered) do
        if pick == nil and BAD[GameInfo.UnitPromotions[e].UnitPromotionType] == nil then pick = e end
      end
    end
    if pick ~= nil then
      UnitManager.RequestCommand(u, UnitCommandTypes.PROMOTE, {[UnitCommandTypes.PARAM_PROMOTION_TYPE] = pick})
      promoted = promoted + 1
    end
  end
  local busy = (u:GetSpyOperation() or -1) >= 0
  local c = Cities.GetCityInPlot(u:GetX(), u:GetY())
  local state = busy and ("busy:" .. tostring(GameInfo.UnitOperations[u:GetSpyOperation()] and GameInfo.UnitOperations[u:GetSpyOperation()].OperationType)) or "idle"
  if not busy then
    if c ~= nil and c:GetX() == ZCX and c:GetY() == ZCY then
      local t = {[UnitOperationTypes.PARAM_X] = ZDX, [UnitOperationTypes.PARAM_Y] = ZDY}
      if started >= maxStart then
        state = "wait"
      elseif UnitManager.CanStartOperation(u, op.Hash, nil, t) then
        UnitManager.RequestOperation(u, op.Hash, t)
        started = started + 1
        state = "start"
      else
        state = "refused"
      end
    elseif u:GetX() >= 0 then
      local t = {[UnitOperationTypes.PARAM_X] = ZCX, [UnitOperationTypes.PARAM_Y] = ZCY}
      if UnitManager.CanStartOperation(u, UnitOperationTypes.SPY_TRAVEL_NEW_CITY, Map.GetPlot(ZCX, ZCY), t) then
        UnitManager.RequestOperation(u, UnitOperationTypes.SPY_TRAVEL_NEW_CITY, t)
        travelled = travelled + 1
        state = "travel"
      else
        state = "notarget"
      end
    end
  end
  print(string.format("spy %d %s level %d at %d:%d %s", u:GetID(), u:GetName(), xp:GetLevel(), u:GetX(), u:GetY(), state))
end
if #spies < ZCAP then
  local params = {}
  params[CityCommandTypes.PARAM_UNIT_TYPE] = spyRow.Hash
  params[CityCommandTypes.PARAM_MILITARY_FORMATION_TYPE] = MilitaryFormationTypes.STANDARD_MILITARY_FORMATION
  params[CityCommandTypes.PARAM_YIELD_TYPE] = GameInfo.Yields["YIELD_GOLD"].Index
  for _, c in pl:GetCities():Members() do
    if #spies + bought < ZCAP and CityManager.CanStartCommand(c, CityCommandTypes.PURCHASE, params) then
      CityManager.RequestCommand(c, CityCommandTypes.PURCHASE, params)
      bought = bought + 1
    end
  end
end
local d = Players[ZDP]:GetUnits():FindID(ZDEF)
local dop = d and d:GetSpyOperation() or nil
print(string.format("defender %s", d == nil and "gone" or string.format("%d at %d:%d level %d op %s", ZDEF, d:GetX(), d:GetY(),
  d:GetExperience():GetLevel(), (dop ~= nil and dop >= 0 and GameInfo.UnitOperations[dop]) and GameInfo.UnitOperations[dop].OperationType or tostring(dop))))
print(string.format("turn %d spies %d started %d travelled %d promoted %d bought %d gold %d",
  Game.GetCurrentGameTurn(), #spies, started, travelled, promoted, bought, math.floor(pl:GetTreasury():GetGoldBalance())))
