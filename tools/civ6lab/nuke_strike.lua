-- InGame: scene D — launch a WMD at ZCX:ZCY with unit ZUID.
--   WorldInput.lua:WMDStrike -> UnitManager.RequestOperation(u,
--       UnitOperationTypes.WMD_STRIKE,
--       {PARAM_X, PARAM_Y, PARAM_WMD_TYPE = GameInfo.WMDs[...].Index})
-- The UI puts a confirm dialog in front of this; the operation itself is the
-- whole action.
--   --set ZUID=3801101 --set ZCX=23 --set ZCY=26 --set ZWMD=WMD_THERMONUCLEAR_DEVICE
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
if u == nil then print("nounit " .. ZUID) return end
local wmd = GameInfo.WMDs["ZWMD"].Index
local params = {}
params[UnitOperationTypes.PARAM_X] = ZCX
params[UnitOperationTypes.PARAM_Y] = ZCY
params[UnitOperationTypes.PARAM_WMD_TYPE] = wmd
print("unit " .. ZUID .. " at " .. u:GetX() .. ":" .. u:GetY()
  .. " dist " .. Map.GetPlotDistance(u:GetX(), u:GetY(), ZCX, ZCY)
  .. " moves " .. tostring(u:GetMovesRemaining())
  .. " wmd ZWMD=" .. wmd)
local okc, can = pcall(function() return UnitManager.CanStartOperation(u, UnitOperationTypes.WMD_STRIKE, nil, params) end)
print("canStrike=" .. tri(okc, can))
if okc and can then
  local oko, erro = pcall(function() UnitManager.RequestOperation(u, UnitOperationTypes.WMD_STRIKE, params) end)
  print("STRIKE requested=" .. tostring(oko) .. " err=" .. tostring(erro))
else
  print("STRIKE not attempted")
end
