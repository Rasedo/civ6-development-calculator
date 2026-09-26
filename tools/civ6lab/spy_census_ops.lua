-- InGame: every Spy of every major — owner, id, plot, the city whose land it
-- stands on (owner), its operation (by name) and level — to find counterspies
-- the AI posted itself (C-16-S1).
local sp = GameInfo.Units["UNIT_SPY"].Index
for p = 0, 62 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() and pl:IsMajor() then
    for _, u in pl:GetUnits():Members() do
      if u:GetType() == sp then
        local ok, op = pcall(function() return u:GetSpyOperation() end)
        local okl, lv = pcall(function() return u:GetExperience():GetLevel() end)
        local c = Cities.GetPlotPurchaseCity(u:GetX(), u:GetY())
        local d = CityManager.GetDistrictAt and CityManager.GetDistrictAt(u:GetX(), u:GetY())
        local nm = (ok and op ~= nil and op >= 0 and GameInfo.UnitOperations[op]) and GameInfo.UnitOperations[op].OperationType or tostring(op)
        local dname = "none"
        if d ~= nil then dname = GameInfo.Districts[d:GetType()].DistrictType end
        print(string.format("spy p%d id %d at %d:%d city-owner %d city %s district %s op %s level %s", p, u:GetID(), u:GetX(), u:GetY(),
          c and c:GetOwner() or -1, c and c:GetName() or "none", dname, nm, okl and tostring(lv) or "err"))
      end
    end
  end
end
print("turn " .. Game.GetCurrentGameTurn())
