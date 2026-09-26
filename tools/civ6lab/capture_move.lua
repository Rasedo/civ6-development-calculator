-- InGame: move player 0's unit ZUID onto ZCX:ZCY — the capture step.
-- A bare MOVE_TO is REFUSED into a hostile plot (accepted, then never executed).
-- Civ6Common.lua's RequestMoveOperation adds the modifier that makes it an
-- attack move, and that is what takes a city:
--   tParameters[UnitOperationTypes.PARAM_MODIFIERS] =
--       UnitOperationMoveModifiers.ATTACK + UnitOperationMoveModifiers.MOVE_IGNORE_UNEXPLORED_DESTINATION
--   --set ZUID=3211275 --set ZCX=21 --set ZCY=22
-- a pcall read in three states: its value, or "err:<msg>" when the call threw
local function tri(ok, v)
  local s = ok and tostring(v) or ("err:" .. tostring(v))
  return (s:gsub('[%c"\\]', function(c) return string.format("\\u%04x", c:byte()) end))
end
local function trij(ok, v)
  if ok and (type(v) == "boolean" or type(v) == "number") then return tostring(v) end
  if ok and v == nil then return "null" end
  return "\"" .. tri(ok, v) .. "\""
end
local u = Players[0]:GetUnits():FindID(ZUID)
if u == nil then print("nounit") return end
local params = {}
params[UnitOperationTypes.PARAM_X] = ZCX
params[UnitOperationTypes.PARAM_Y] = ZCY
params[UnitOperationTypes.PARAM_MODIFIERS] = UnitOperationMoveModifiers.ATTACK
  + UnitOperationMoveModifiers.MOVE_IGNORE_UNEXPLORED_DESTINATION
local okc, can = pcall(function() return UnitManager.CanStartOperation(u, UnitOperationTypes.MOVE_TO, nil, params) end)
local oko, erro = pcall(function() UnitManager.RequestOperation(u, UnitOperationTypes.MOVE_TO, params) end)
print("attackmove unit=" .. ZUID .. " from " .. u:GetX() .. ":" .. u:GetY() .. " to " .. ZCX .. ":" .. ZCY
  .. " moves=" .. tostring(u:GetMovesRemaining())
  .. " can=" .. tri(okc, can) .. " requested=" .. tostring(oko) .. " err=" .. tostring(erro))
