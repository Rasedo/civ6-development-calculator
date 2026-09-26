-- InGame: B-31r-S1, move seat 0's unit ZUID onto ZX:ZY by MOVE_TO with the
-- ATTACK modifier (the README's attack-move; a bare MOVE_TO is accepted and
-- never moves). Prints whether the move was allowed and requested.
--   --set ZUID=123 --set ZX=63 --set ZY=17
local u = Players[0]:GetUnits():FindID(ZUID)
if u == nil then print("move: nounit") return end
local t = {}
t[UnitOperationTypes.PARAM_X] = ZX
t[UnitOperationTypes.PARAM_Y] = ZY
t[UnitOperationTypes.PARAM_MODIFIERS] = UnitOperationMoveModifiers.ATTACK + UnitOperationMoveModifiers.MOVE_IGNORE_UNEXPLORED_DESTINATION
local okc, can = pcall(function() return UnitManager.CanStartOperation(u, UnitOperationTypes.MOVE_TO, nil, t) end)
local okr = false
if okc and can then okr = pcall(function() UnitManager.RequestOperation(u, UnitOperationTypes.MOVE_TO, t) end) end
print("move to " .. ZX .. ":" .. ZY .. " can " .. tostring(okc and can) .. " requested " .. tostring(okr))
