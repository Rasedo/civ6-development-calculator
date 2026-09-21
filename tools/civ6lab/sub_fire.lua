-- InGame: fire a submarine-launched warhead at a plot. Same unit operation as
-- the bomber's, so the only thing that differs from the bomber rounds is the
-- delivering unit.
--   --set ZAU=123 --set ZTX=36 --set ZTY=15
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
print("{\"kind\":\"subfire\",\"unit\":" .. ZAU .. ",\"can\":" .. tostring(okc and can)
  .. ",\"fired\":" .. tostring(fired) .. "}")
