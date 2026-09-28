-- InGame: seat 0's unit standing on ZFX:ZFY attack-moves onto ZCX:ZCY (the
-- capture step of `capture_move.lua`, the unit found by its plot, since
-- FindID can miss a unit GameCore created this turn).
local u = nil
for _, v in ipairs(Units.GetUnitsInPlot(Map.GetPlot(ZFX, ZFY)) or {}) do
  if v:GetOwner() == 0 then u = v end
end
if u == nil then u = Players[0]:GetUnits():FindID(ZUID) end
if u == nil then print("nounit") return end
local params = {}
params[UnitOperationTypes.PARAM_X] = ZCX
params[UnitOperationTypes.PARAM_Y] = ZCY
params[UnitOperationTypes.PARAM_MODIFIERS] = UnitOperationMoveModifiers.ATTACK
  + UnitOperationMoveModifiers.MOVE_IGNORE_UNEXPLORED_DESTINATION
local okc, can = pcall(function() return UnitManager.CanStartOperation(u, UnitOperationTypes.MOVE_TO, nil, params) end)
local oko, erro = pcall(function() UnitManager.RequestOperation(u, UnitOperationTypes.MOVE_TO, params) end)
print("attackmove unit=" .. u:GetID() .. " from " .. u:GetX() .. ":" .. u:GetY() .. " to " .. ZCX .. ":" .. ZCY
  .. " moves=" .. tostring(u:GetMovesRemaining()) .. " can=" .. tostring(can) .. " requested=" .. tostring(oko) .. " err=" .. tostring(erro))
