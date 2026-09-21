-- InGame: launch a warhead FROM A MISSILE SILO.
-- The earlier attempt failed because it passed PARAM_X / PARAM_Y. The shipped
-- UI (WorldInput.lua OnICBMStrikeEnd / ICBMStrike, and CityBannerManager.lua
-- UpdateWMDBanner) uses FOUR plot parameters on the CITY command:
--   PARAM_X0 / PARAM_Y0  the SILO's plot
--   PARAM_X1 / PARAM_Y1  the target plot
--   PARAM_WMD_TYPE
-- and the city is Cities.GetPlotPurchaseCity(siloPlot), not the nearest one.
--   --set ZSX=38 --set ZSY=16 --set ZTX=36 --set ZTY=15
--   --set ZWMD=WMD_NUCLEAR_DEVICE --set ZFIRE=0
local silo = Map.GetPlot(ZSX, ZSY)
if silo == nil then print("{\"kind\":\"silolaunch\",\"error\":\"noplot\"}") return end
local imp = silo:GetImprovementType()
local impName = imp >= 0 and GameInfo.Improvements[imp].ImprovementType or "none"
local city = Cities.GetPlotPurchaseCity(silo)
if city == nil then
  print("{\"kind\":\"silolaunch\",\"error\":\"nocity\",\"improvement\":\"" .. impName .. "\"}") return
end
local eW = GameInfo.WMDs["ZWMD"].Index
local p = {}
p[CityCommandTypes.PARAM_X0] = ZSX
p[CityCommandTypes.PARAM_Y0] = ZSY
p[CityCommandTypes.PARAM_X1] = ZTX
p[CityCommandTypes.PARAM_Y1] = ZTY
p[CityCommandTypes.PARAM_WMD_TYPE] = eW
local okT, res = pcall(function()
  local q = {}
  q[CityCommandTypes.PARAM_WMD_TYPE] = eW
  q[CityCommandTypes.PARAM_X0] = ZSX
  q[CityCommandTypes.PARAM_Y0] = ZSY
  return CityManager.GetCommandTargets(city, CityCommandTypes.WMD_STRIKE, q)
end)
local nTargets, hasTarget = -1, false
if okT and type(res) == "table" then
  local plots = res[CityCommandResults.PLOTS]
  if plots ~= nil then
    nTargets = #plots
    local want = Map.GetPlot(ZTX, ZTY):GetIndex()
    for _, i in ipairs(plots) do if i == want then hasTarget = true end end
  end
end
local okC, can = pcall(function()
  return CityManager.CanStartCommand(city, CityCommandTypes.WMD_STRIKE, p)
end)
local fired = false
if ZFIRE == 1 and okC and can then
  fired = true
  pcall(function() CityManager.RequestCommand(city, CityCommandTypes.WMD_STRIKE, p) end)
end
print("{\"kind\":\"silolaunch\",\"silo\":\"" .. ZSX .. ":" .. ZSY .. "\",\"improvement\":\"" .. impName
  .. "\",\"city\":" .. city:GetID() .. ",\"cityAt\":\"" .. city:GetX() .. ":" .. city:GetY() .. "\""
  .. ",\"targets\":" .. nTargets .. ",\"targetOffered\":" .. tostring(hasTarget)
  .. ",\"canStart\":" .. tostring(okC and can) .. ",\"requested\":" .. tostring(fired) .. "}")
