-- InGame: walk a unit onto the tribal village. A plain MOVE_TO is enough for a
-- friendly empty tile (the ATTACK modifier is only needed to enter a hostile
-- city), and the pop resolves when the unit arrives.
--   --set ZUNIT=131073 --set ZX=37 --set ZY=16
local u = nil
for _, x in Players[0]:GetUnits():Members() do if x:GetID() == ZUNIT then u = x end end
if u == nil then print("{\"kind\":\"goodypop\",\"error\":\"nounit\"}") return end
local params = {}
params[UnitOperationTypes.PARAM_X] = ZX
params[UnitOperationTypes.PARAM_Y] = ZY
local okc, can = pcall(function()
  return UnitManager.CanStartOperation(u, UnitOperationTypes.MOVE_TO, nil, params)
end)
local fired = false
if okc and can then
  fired = pcall(function() UnitManager.RequestOperation(u, UnitOperationTypes.MOVE_TO, params) end)
end
print("{\"kind\":\"goodypop\",\"unit\":" .. ZUNIT .. ",\"target\":\"" .. ZX .. ":" .. ZY .. "\""
  .. ",\"can\":" .. tostring(okc and can) .. ",\"fired\":" .. tostring(fired)
  .. ",\"at\":\"" .. u:GetX() .. ":" .. u:GetY() .. "\",\"moves\":" .. u:GetMovesRemaining() .. "}")
