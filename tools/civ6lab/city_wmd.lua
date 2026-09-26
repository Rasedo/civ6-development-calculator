-- InGame: launch a WMD from a CITY. CityCommandTypes.WMD_STRIKE exists
-- (hash 681683161) beside PURCHASE and RANGE_ATTACK, and the wiki describes
-- silo- and submarine-launched weapons as a DIFFERENT interception mechanic
-- from the bomber's — so this is the delivery channel most likely to behave
-- unlike everything measured so far.
--   --set ZCX=39 --set ZCY=16 --set ZTX=36 --set ZTY=15 --set ZWMD=WMD_NUCLEAR_DEVICE
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
local c = Cities.GetCityInPlot(ZCX, ZCY)
if c == nil then print("{\"kind\":\"citywmd\",\"error\":\"nocity\"}") return end
local params = {}
params[CityCommandTypes.PARAM_X] = ZTX
params[CityCommandTypes.PARAM_Y] = ZTY
params[CityCommandTypes.PARAM_WMD_TYPE] = GameInfo.WMDs["ZWMD"].Index
local okc, can = pcall(function()
  return CityManager.CanStartCommand(c, CityCommandTypes.WMD_STRIKE, params)
end)
local okc2, can2 = pcall(function()
  return CityManager.CanStartCommand(c, CityCommandTypes.WMD_STRIKE, true)
end)
local fired = false
if (okc and can) or (okc2 and can2) then
  fired = pcall(function() CityManager.RequestCommand(c, CityCommandTypes.WMD_STRIKE, params) end)
end
print("{\"kind\":\"citywmd\",\"city\":\"" .. ZCX .. ":" .. ZCY .. "\",\"target\":\"" .. ZTX .. ":" .. ZTY
  .. "\",\"wmd\":\"ZWMD\",\"can\":" .. trij(okc, can)
  .. ",\"canNoParams\":" .. trij(okc2, can2) .. ",\"fired\":" .. tostring(fired) .. "}")
