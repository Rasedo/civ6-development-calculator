-- InGame: found a city with the Settler standing at ZX:ZY. A brand-new city
-- owns only its centre and ring 1, so every citizen it can seat is inside a
-- radius-2 blast and any surplus population has nowhere to go but idle - the
-- scene that separates "the kill is compared to the POPULATION" from "the kill
-- is compared to the number of worked tiles".
--   --set ZX=32 --set ZY=16
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
local u = nil
for _, x in Players[0]:GetUnits():Members() do
  if GameInfo.Units[x:GetType()].UnitType == "UNIT_SETTLER" and x:GetX() == ZX and x:GetY() == ZY then u = x end
end
if u == nil then print("{\"kind\":\"found\",\"error\":\"nosettler\"}") return end
local params = {}
params[UnitOperationTypes.PARAM_X] = ZX
params[UnitOperationTypes.PARAM_Y] = ZY
local okc, can = pcall(function() return UnitManager.CanStartOperation(u, UnitOperationTypes.FOUND_CITY, nil, params) end)
local okr = false
if okc and can then okr = pcall(function() UnitManager.RequestOperation(u, UnitOperationTypes.FOUND_CITY, params) end) end
print("{\"kind\":\"found\",\"x\":" .. ZX .. ",\"y\":" .. ZY .. ",\"settler\":" .. u:GetID()
  .. ",\"can\":" .. trij(okc, can) .. ",\"requested\":" .. tostring(okr) .. "}")
