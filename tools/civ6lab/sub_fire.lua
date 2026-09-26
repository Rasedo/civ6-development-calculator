-- InGame: fire a submarine-launched warhead at a plot. Same unit operation as
-- the bomber's, so the only thing that differs from the bomber rounds is the
-- delivering unit.
--   --set ZAU=123 --set ZTX=36 --set ZTY=15
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
local u = Players[0]:GetUnits():FindID(ZAU)
if u == nil then print("{\"kind\":\"subfire\",\"error\":\"nosub\"}") return end
local p = {}
p[UnitOperationTypes.PARAM_X] = ZTX
p[UnitOperationTypes.PARAM_Y] = ZTY
p[UnitOperationTypes.PARAM_WMD_TYPE] = GameInfo.WMDs["WMD_NUCLEAR_DEVICE"].Index
local okc, can = pcall(function()
  return UnitManager.CanStartOperation(u, UnitOperationTypes.WMD_STRIKE, nil, p)
end)
local fired = false
if okc and can then
  fired = pcall(function() UnitManager.RequestOperation(u, UnitOperationTypes.WMD_STRIKE, p) end)
end
print("{\"kind\":\"subfire\",\"unit\":" .. ZAU .. ",\"can\":" .. trij(okc, can)
  .. ",\"fired\":" .. tostring(fired) .. "}")
