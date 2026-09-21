-- InGame: put the DEFENDER's spy on counterspy duty in its own city, so the
-- offensive odds can be read with and without it. Lists the defensive spy
-- operations first (the category the UI uses), then starts the first one that
-- CanStartOperation accepts for the spy standing at ZX:ZY owned by ZDEFENDER.
--   --set ZX=23 --set ZY=26 --set ZDEFENDER=1
for op in GameInfo.UnitOperations() do
  local c = tostring(op.CategoryInUI)
  if c == "DEFENSIVESPY" or string.find(op.OperationType, "COUNTER", 1, true) then
    print("{\"kind\":\"counterspy\",\"operation\":\"" .. op.OperationType .. "\",\"category\":\"" .. c
      .. "\",\"base\":\"" .. tostring(op.BaseProbability) .. "\"}")
  end
end
local spy = nil
for _, u in Players[ZDEFENDER]:GetUnits():Members() do
  if GameInfo.Units[u:GetType()].UnitType == "UNIT_SPY" and u:GetX() == ZX and u:GetY() == ZY then spy = u end
end
if spy == nil then print("{\"kind\":\"counterspy\",\"error\":\"nodefenderspy\"}") return end
-- UNITOPERATION_SPY_COUNTERSPY's CategoryInUI is "MOVE", not "DEFENSIVESPY",
-- so it has to be named rather than found by category.
local started = "none"
local op = GameInfo.UnitOperations["UNITOPERATION_SPY_COUNTERSPY"]
if op ~= nil then
  local params = {}
  params[UnitOperationTypes.PARAM_X] = ZX
  params[UnitOperationTypes.PARAM_Y] = ZY
  local okc, can = pcall(function() return UnitManager.CanStartOperation(spy, op.Hash, nil, params) end)
  local okc2, can2 = pcall(function() return UnitManager.CanStartOperation(spy, op.Hash, nil, true) end)
  print("{\"kind\":\"counterspy\",\"can\":" .. tostring(okc and can)
    .. ",\"canNoParams\":" .. tostring(okc2 and can2)
    .. ",\"moves\":" .. tostring(spy:GetMovesRemaining())
    .. ",\"at\":\"" .. spy:GetX() .. ":" .. spy:GetY() .. "\"}")
  -- the counterspy operation takes NO location: CanStartOperation(spy, hash,
  -- nil, true) is the UI's own shape (UnitPanel.lua) and it answers true where
  -- a PARAM_X/PARAM_Y table answers false.
  if okc2 and can2 then
    local okr = pcall(function() UnitManager.RequestOperation(spy, op.Hash, {}) end)
    if okr then started = op.OperationType end
  elseif okc and can then
    local okr = pcall(function() UnitManager.RequestOperation(spy, op.Hash, params) end)
    if okr then started = op.OperationType end
  end
end
print("{\"kind\":\"counterspy\",\"defenderSpy\":" .. spy:GetID() .. ",\"started\":\"" .. started .. "\"}")
