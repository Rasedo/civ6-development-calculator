-- InGame: C-81's second half — perform one swap of plot ZX,ZY to claimant ZA
-- and read both cities' next-border-plot culture cost (which grows with the
-- plots a city has acquired) and the plot's owner, before and after.
--   --set ZA=65536 --set ZB=131073 --set ZX=18 --set ZY=14
local a = CityManager.GetCity(0, ZA)
local b = CityManager.GetCity(0, ZB)
local function state(tag)
  local c = Cities.GetPlotPurchaseCity(Map.GetPlot(ZX, ZY))
  print("{\"kind\":\"swap_do\",\"when\":\"" .. tag .. "\",\"owner\":" .. tostring(c and c:GetID())
    .. ",\"costA\":" .. a:GetCulture():GetNextPlotCultureCost() .. ",\"costB\":" .. b:GetCulture():GetNextPlotCultureCost()
    .. ",\"plotsA\":" .. #Map.GetCityPlots():GetPurchasedPlots(a) .. ",\"plotsB\":" .. #Map.GetCityPlots():GetPurchasedPlots(b) .. "}")
end
state("before")
local t = {}
t[CityCommandTypes.PARAM_SWAP_TILE_OWNER] = 1
t[CityCommandTypes.PARAM_X] = ZX
t[CityCommandTypes.PARAM_Y] = ZY
CityManager.RequestCommand(a, CityCommandTypes.SWAP_TILE_OWNER, t)
state("after")
