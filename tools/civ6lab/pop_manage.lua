-- InGame: move a citizen OFF a tile with the city panel's own command
--   CityManager.RequestCommand(city, CityCommandTypes.MANAGE,
--       { PARAM_MANAGE_CITIZEN = <mode>, PARAM_X, PARAM_Y })
-- (PlotInfo.lua:OnClickCitizen). The mode comes from an interface-mode
-- parameter in the UI, so both plausible values are tried and the worked flag
-- is read back after each. Prints the before/after worked flag and the city's
-- population, so a mode that does nothing is visible as "no change".
--   --set ZCX=36 --set ZCY=22 --set ZPX=38 --set ZPY=23 --set ZMODE=1
local c = Cities.GetCityInPlot(ZCX, ZCY)
if c == nil then print("{\"error\":\"nocity\"}") return end
local cz = c:GetCitizens()
local function worked() local ok, v = pcall(function() return cz:IsPlotWorked(ZPX, ZPY) end); return tostring(ok and v) end
local before, pop0 = worked(), c:GetPopulation()
local params = {}
params[CityCommandTypes.PARAM_MANAGE_CITIZEN] = ZMODE
params[CityCommandTypes.PARAM_X] = ZPX
params[CityCommandTypes.PARAM_Y] = ZPY
local okc, can = pcall(function() return CityManager.CanStartCommand(c, CityCommandTypes.MANAGE, params) end)
local okr = pcall(function() CityManager.RequestCommand(c, CityCommandTypes.MANAGE, params) end)
print("{\"kind\":\"manage\",\"city\":\"" .. c:GetName():gsub("LOC_CITY_NAME_", "") .. "\",\"plot\":\"" .. ZPX .. ":" .. ZPY
  .. "\",\"mode\":\"ZMODE\",\"can\":" .. tostring(okc and can) .. ",\"requested\":" .. tostring(okr)
  .. ",\"workedBefore\":" .. before .. ",\"workedAfter\":" .. worked()
  .. ",\"popBefore\":" .. pop0 .. ",\"popAfter\":" .. c:GetPopulation() .. "}")
