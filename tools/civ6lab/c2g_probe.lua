-- InGame (C-2, lab 5g): seat 0's cities and their districts, seat 1's spies,
-- and what seat 0's diplomacy says about seat 1 (the promise both ways,
-- grievances both ways).
for _, c in Players[0]:GetCities():Members() do
  local ds = {}
  for _, d in c:GetDistricts():Members() do
    local row = GameInfo.Districts[d:GetType()]
    ds[#ds + 1] = string.format("%s@%d:%d", row and row.DistrictType or tostring(d:GetType()), d:GetX(), d:GetY())
  end
  print(string.format("city %s %d:%d %s", c:GetName(), c:GetX(), c:GetY(), table.concat(ds, ",")))
end
for _, u in Players[1]:GetUnits():Members() do
  if u:GetType() == GameInfo.Units["UNIT_SPY"].Index then
    local op = u:GetSpyOperation()
    print(string.format("p1 spy %d at %d:%d level %d op %s", u:GetID(), u:GetX(), u:GetY(), u:GetExperience():GetLevel(),
      (op ~= nil and op >= 0 and GameInfo.UnitOperations[op]) and GameInfo.UnitOperations[op].OperationType or tostring(op)))
  end
end
local function tri(f)
  local ok, v = pcall(f)
  if ok then return tostring(v) end
  return "err:" .. tostring(v)
end
print("turn " .. Game.GetCurrentGameTurn() .. " p1 promised p0 DONT_SPY " .. tri(function() return Players[1]:GetDiplomacy():IsPromiseMade(0, PromiseTypes.DONT_SPY_ON_ME) end)
  .. "; p0 promised p1 DONT_SPY " .. tri(function() return Players[0]:GetDiplomacy():IsPromiseMade(1, PromiseTypes.DONT_SPY_ON_ME) end)
  .. "; griev p0 vs p1 " .. tri(function() return Players[0]:GetDiplomacy():GetGrievancesAgainst(1) end)
  .. "; griev p1 vs p0 " .. tri(function() return Players[1]:GetDiplomacy():GetGrievancesAgainst(0) end))
