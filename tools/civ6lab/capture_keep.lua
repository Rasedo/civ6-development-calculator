-- InGame: answer the capture's Keep/Raze prompt the way RazeCity.lua does.
--   CityManager.RequestCommand(city, CityCommandTypes.DESTROY,
--     {[UnitOperationTypes.PARAM_FLAGS] = CityDestroyDirectives.KEEP})
-- The city plot is read straight off the map, so it works whichever seat the
-- half-captured city currently sits in.
--   --set ZCX=21 --set ZCY=22
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
local c = CityManager.GetCityAt(ZCX, ZCY)
if c == nil then c = Cities.GetCityInPlot(ZCX, ZCY) end
if c == nil then print("nocity at " .. ZCX .. ":" .. ZCY) return end
print("city " .. c:GetName() .. " owner=" .. c:GetOwner() .. " orig=" .. c:GetOriginalOwner())
local k = {}
for a, b in pairs(CityDestroyDirectives) do k[#k + 1] = tostring(a) .. "=" .. tostring(b) end
table.sort(k)
print("directives " .. table.concat(k, " "))
local params = {}
params[UnitOperationTypes.PARAM_FLAGS] = CityDestroyDirectives.KEEP
local okc, can = pcall(function() return CityManager.CanStartCommand(c, CityCommandTypes.DESTROY, params) end)
local oko, erro = pcall(function() CityManager.RequestCommand(c, CityCommandTypes.DESTROY, params) end)
print("keep can=" .. tri(okc, can) .. " requested=" .. tostring(oko) .. " err=" .. tostring(erro))
