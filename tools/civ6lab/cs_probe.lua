-- ASK 9 / C-38: what a city-state does with its bank. InGame (treasury and
-- build queue are readable there). Print per living minor: gold, faith,
-- what it is building, its units by class, its city's population.
for p = 0, 62 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() and not pl:IsMajor() and not pl:IsBarbarian() then
    local name = PlayerConfigurations[p]:GetCivilizationShortDescription()
    local gold = pl:GetTreasury():GetGoldBalance()
    local okf, faith = pcall(function() return pl:GetReligion():GetFaithBalance() end)
    local units, mil = 0, 0
    for _, u in pl:GetUnits():Members() do
      units = units + 1
      if GameInfo.Units[u:GetType()].Combat > 0 or GameInfo.Units[u:GetType()].RangedCombat > 0 then mil = mil + 1 end
    end
    for _, c in pl:GetCities():Members() do
      local bq = c:GetBuildQueue()
      local okb, cur = pcall(function() return bq:CurrentlyBuilding() end)
      local okp, prog = pcall(function() return bq:GetProductionProgress() end)
      print(string.format("cs p%d %-14s gold %6.1f faith %5s pop %2d units %2d (mil %d) building %s progress %s",
        p, name, gold, tostring(okf and faith or "?"), c:GetPopulation(), units, mil, tostring(okb and cur or "?"), tostring(okp and prog or "?")))
    end
  end
end
print("turn " .. Game.GetCurrentGameTurn())
