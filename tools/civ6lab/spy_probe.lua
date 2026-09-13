-- ASK 14: the spy mission odds, straight from the engine.
-- Run in InGame (UnitManager.GetResultProbability is the UI's own source
-- for the percentages it shows). Expects player 0 to own a Spy; the target
-- is the district plot given by TX, TY (substituted by lab.py).
local me = 0
local spy = nil
local want = tonumber("SPYID")   -- a unit id, or the token itself = last spy
for _, u in Players[me]:GetUnits():Members() do
  if GameInfo.Units[u:GetType()].UnitType == "UNIT_SPY" and (want == nil or u:GetID() == want) then spy = u end
end
if spy == nil then print("nospy") return end
local promos = {}
for row in GameInfo.UnitPromotions() do
  if spy:GetExperience():HasPromotion(row.Index) then promos[#promos + 1] = row.UnitPromotionType:gsub("PROMOTION_SPY_", "") end
end
print("promotions [" .. table.concat(promos, ",") .. "]")
print("spy id " .. spy:GetID() .. " at " .. spy:GetX() .. ":" .. spy:GetY()
      .. " level " .. tostring(spy:GetExperience():GetLevel()))
local target = Map.GetPlot(TX, TY)
print("target " .. TX .. ":" .. TY .. " district " .. tostring(target:GetDistrictType())
      .. " owner " .. tostring(target:GetOwner()))
for op in GameInfo.UnitOperations() do
  if op.CategoryInUI == "OFFENSIVESPY" then
    local ok, res = pcall(UnitManager.GetResultProbability, op.Index, spy, target)
    if not ok then
      print(op.OperationType .. " ERR " .. tostring(res))
    elseif type(res) ~= "table" then
      print(op.OperationType .. " -> " .. tostring(res))
    else
      local parts = {}
      for k, v in pairs(res) do parts[#parts + 1] = tostring(k) .. "=" .. tostring(v) end
      table.sort(parts)
      print(op.OperationType .. " base=" .. tostring(op.BaseProbability)
            .. " -> " .. table.concat(parts, " "))
    end
  end
end
