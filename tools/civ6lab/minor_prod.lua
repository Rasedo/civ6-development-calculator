-- InGame: every city-state city's Production yield, what it is building
-- and the progress on it, so two reads a turn apart give the production
-- that landed on the item — against the yield that gives the modifier the
-- item received (C-38: do the -50% and the item's percent multiply or add).
local turn = Game.GetCurrentGameTurn()
for p = 0, 62 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() and not pl:IsMajor() and not pl:IsBarbarian() and not pl:IsFreeCities() then
    for _, c in pl:GetCities():Members() do
      local q = c:GetBuildQueue()
      local h = q:GetCurrentProductionTypeHash()
      local name, prog, cost = "none", -1, -1
      if h ~= 0 then
        local row = GameInfo.Buildings[h] or GameInfo.Districts[h] or GameInfo.Units[h] or GameInfo.Projects[h]
        name = row and (row.BuildingType or row.DistrictType or row.UnitType or row.ProjectType) or tostring(h)
        if row and row.BuildingType then pcall(function() cost = q:GetBuildingCost(row.Index); prog = q:GetBuildingProgress(row.Index) end) end
        if row and row.DistrictType then pcall(function() cost = q:GetDistrictCost(row.Index); prog = q:GetDistrictProgress(row.Index) end) end
        if row and row.UnitType then pcall(function() cost = q:GetUnitCost(row.Index); prog = q:GetUnitProgress(row.Index) end) end
      end
      local y = c:GetYield(YieldTypes.PRODUCTION)
      local okp, ppt = pcall(function() return q:GetProductionYield() end)
      print(string.format('{"turn":%d,"p":%d,"city":%d,"yield":%.3f,"queueYield":%s,"build":"%s","progress":%s,"cost":%s}',
        turn, p, c:GetID(), y, okp and string.format("%.3f", ppt) or "null", name, tostring(prog), tostring(cost)))
    end
  end
end
