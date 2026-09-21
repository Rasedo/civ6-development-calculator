-- InGame: answer the capture's Keep/Raze prompt the way RazeCity.lua does.
--   CityManager.RequestCommand(city, CityCommandTypes.DESTROY,
--     {[UnitOperationTypes.PARAM_FLAGS] = CityDestroyDirectives.KEEP})
-- The city plot is read straight off the map, so it works whichever seat the
-- half-captured city currently sits in.
--   --set ZCX=21 --set ZCY=22
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
print("keep can=" .. tostring(okc and can or "ERR") .. " requested=" .. tostring(oko) .. " err=" .. tostring(erro))
