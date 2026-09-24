-- InGame, once per turn of the ask-14 escape loop (`spy_loop.py`): keep the
-- local player's spies busy on foreign MAJOR city centres.
--   * a spy with a pending promotion takes PROMOTION_SPY_TECHNOLOGIST when
--     offered, else any offered one but Ace Driver (the one with an escape
--     term);
--   * an idle spy standing in a foreign major's city starts ZOP on its centre;
--   * an idle spy anywhere else travels to the foreign major city with the
--     fewest of my spies;
--   * while the spy count is under ZCAP, a Spy is BOUGHT in a city of mine
--     (trained in a city, never spawned from the socket).
-- One `spy ...` line per spy and one summary line.
local me = Game.GetLocalPlayer()
local pl = Players[me]
local op = GameInfo.UnitOperations["ZOP"]
local techno = GameInfo.UnitPromotions["PROMOTION_SPY_TECHNOLOGIST"]
local spyRow = GameInfo.Units["UNIT_SPY"]
local function isForeignMajor(p)
  return p >= 0 and p ~= me and Players[p] ~= nil and Players[p]:IsMajor()
end
local load = {}
local spies = {}
for _, u in pl:GetUnits():Members() do
  if u:GetType() == spyRow.Index then
    spies[#spies + 1] = u
    local c = Cities.GetCityInPlot(u:GetX(), u:GetY())
    if c ~= nil then
      local k = c:GetOwner() * 100000 + c:GetID()
      load[k] = (load[k] or 0) + 1
    end
  end
end
local started, travelled, promoted, bought = 0, 0, 0, 0
for _, u in ipairs(spies) do
  local xp = u:GetExperience()
  -- the promotion popup's own query (UnitPromotionPopup.lua): the offered
  -- promotions, Technologist first, never Ace Driver
  local canP, res = UnitManager.CanStartCommand(u, UnitCommandTypes.PROMOTE, true, true)
  local offered = canP and res and res[UnitCommandResults.PROMOTIONS] or nil
  if offered ~= nil and #offered > 0 then
    local pick = nil
    for _, e in ipairs(offered) do if e == techno.Index then pick = e end end
    if pick == nil then
      for _, e in ipairs(offered) do
        if pick == nil and GameInfo.UnitPromotions[e].UnitPromotionType ~= "PROMOTION_SPY_ACE_DRIVER" then pick = e end
      end
    end
    if pick ~= nil then
      local pt = {}
      pt[UnitCommandTypes.PARAM_PROMOTION_TYPE] = pick
      UnitManager.RequestCommand(u, UnitCommandTypes.PROMOTE, pt)
      promoted = promoted + 1
    end
  end
  local busy = (u:GetSpyOperation() or -1) >= 0
  local c = Cities.GetCityInPlot(u:GetX(), u:GetY())
  local state = busy and "busy" or "idle"
  if not busy then
    if c ~= nil and isForeignMajor(c:GetOwner()) then
      local t = {}
      t[UnitOperationTypes.PARAM_X] = c:GetX()
      t[UnitOperationTypes.PARAM_Y] = c:GetY()
      if UnitManager.CanStartOperation(u, op.Hash, Map.GetPlot(c:GetX(), c:GetY()), t) then
        UnitManager.RequestOperation(u, op.Hash, t)
        started = started + 1
        state = "start"
      else
        state = "refused"
      end
    else
      local best, bestLoad = nil, 1e9
      for p = 0, 62 do
        if isForeignMajor(p) and Players[p]:IsAlive() then
          for _, fc in Players[p]:GetCities():Members() do
            local k = p * 100000 + fc:GetID()
            local t = {}
            t[UnitOperationTypes.PARAM_X] = fc:GetX()
            t[UnitOperationTypes.PARAM_Y] = fc:GetY()
            if (load[k] or 0) < bestLoad
               and UnitManager.CanStartOperation(u, UnitOperationTypes.SPY_TRAVEL_NEW_CITY, Map.GetPlot(fc:GetX(), fc:GetY()), t) then
              best, bestLoad = fc, load[k] or 0
            end
          end
        end
      end
      if best ~= nil then
        local t = {}
        t[UnitOperationTypes.PARAM_X] = best:GetX()
        t[UnitOperationTypes.PARAM_Y] = best:GetY()
        UnitManager.RequestOperation(u, UnitOperationTypes.SPY_TRAVEL_NEW_CITY, t)
        local k = best:GetOwner() * 100000 + best:GetID()
        load[k] = (load[k] or 0) + 1
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
print(string.format("turn %d spies %d started %d travelled %d promoted %d bought %d gold %d",
  Game.GetCurrentGameTurn(), #spies, started, travelled, promoted, bought, math.floor(pl:GetTreasury():GetGoldBalance())))
