-- InGame: every operation a named unit can currently start, with the target
-- the WMD ones are offered. Faster than guessing why a launch was refused.
--   --set ZPLAYER=0 --set ZUNIT=123 --set ZTX=35 --set ZTY=11
local u = nil
for _, x in Players[ZPLAYER]:GetUnits():Members() do if x:GetID() == ZUNIT then u = x end end
if u == nil then print("{\"kind\":\"unitops\",\"error\":\"nounit\"}") return end
local can = {}
for op in GameInfo.UnitOperations() do
  local ok, v = pcall(function() return UnitManager.CanStartOperation(u, op.Hash, nil, true) end)
  if ok and v then can[#can + 1] = op.OperationType:gsub("UNITOPERATION_", "") end
end
table.sort(can)
print("{\"kind\":\"unitops\",\"unit\":" .. ZUNIT .. ",\"type\":\""
  .. GameInfo.Units[u:GetType()].UnitType .. "\",\"at\":\"" .. u:GetX() .. ":" .. u:GetY() .. "\""
  .. ",\"moves\":" .. u:GetMovesRemaining()
  .. ",\"canStart\":\"" .. table.concat(can, " ") .. "\"}")
local p = {}
p[UnitOperationTypes.PARAM_X] = ZTX
p[UnitOperationTypes.PARAM_Y] = ZTY
p[UnitOperationTypes.PARAM_WMD_TYPE] = GameInfo.WMDs["WMD_NUCLEAR_DEVICE"].Index
local okt, targets = pcall(function()
  return UnitManager.GetOperationTargets(u, UnitOperationTypes.WMD_STRIKE, p)
end)
if okt and type(targets) == "table" then
  local n = 0
  for k, v in pairs(targets) do
    if type(v) == "table" then for _ in pairs(v) do n = n + 1 end end
  end
  print("{\"kind\":\"unitops\",\"wmdTargetEntries\":" .. n .. "}")
else
  print("{\"kind\":\"unitops\",\"wmdTargets\":\"" .. tostring(okt and targets or "err") .. "\"}")
end
