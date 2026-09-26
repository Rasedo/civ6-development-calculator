-- InGame (after lab_json.lua): C-38-S4 — the levy price every major would
-- pay each living minor (`GetLevyMilitaryCost`, CityStates.lua's reader),
-- with CanLevyMilitary, the suzerain, and the minor's military units and
-- their gold purchase costs in its capital (the base the 25% rides on).
local turn = Game.GetCurrentGameTurn()
local gold = GameInfo.Yields["YIELD_GOLD"].Index
for m = 0, 62 do
  local mp = Players[m]
  if mp ~= nil and mp:IsAlive() and not mp:IsMajor() and P(function() return mp:IsFreeCities() end) ~= true
     and not mp:IsBarbarian() then
    local cap = mp:GetCities():GetCapitalCity()
    local units = {}
    local sum = 0
    for _, u in mp:GetUnits():Members() do
      local row = GameInfo.Units[u:GetType()]
      if row and row.FormationClass == "FORMATION_CLASS_LAND_COMBAT" or row and row.FormationClass == "FORMATION_CLASS_NAVAL" then
        local cost = cap and P(function() return cap:GetGold():GetPurchaseCost(gold, row.Hash, MilitaryFormationTypes.STANDARD_MILITARY_FORMATION) end)
        local bcost = cap and P(function() return cap:GetBuildQueue():GetUnitCost(row.Index) end)
        units[#units + 1] = {row.UnitType, cost, bcost, row.Cost}
        if type(cost) == "number" then sum = sum + cost end
      end
    end
    local prices = {}
    for p = 0, 62 do
      local pl = Players[p]
      if pl ~= nil and pl:IsAlive() and pl:IsMajor() then
        local inf = pl:GetInfluence()
        prices[#prices + 1] = {p = p, cost = P(function() return inf:GetLevyMilitaryCost(m) end),
          can = P(function() return inf:CanLevyMilitary(m) end), gold = P(function() return pl:GetTreasury():GetGoldBalance() end)}
      end
    end
    OUT({kind = "levy", turn = turn, minor = m, suzerain = P(function() return mp:GetInfluence():GetSuzerain() end),
      units = units, unitGoldSum = sum, prices = prices})
  end
end
