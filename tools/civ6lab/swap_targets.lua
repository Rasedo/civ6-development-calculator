-- InGame: C-81, the tile swap's REACH. Every plot the sibling city ZB owns,
-- with its distance from the claimant ZA's centre and from ZB's, a district
-- or wonder on it, and whether `GetCommandTargets(SWAP_TILE_OWNER)` offers it
-- to ZA (read exactly as PlotInfo.lua ShowSwapTiles reads it).
--   --set ZA=65536 --set ZB=131073
local a = CityManager.GetCity(0, ZA)
local b = CityManager.GetCity(0, ZB)
local offered = {}
local res = CityManager.GetCommandTargets(a, CityCommandTypes.SWAP_TILE_OWNER, {})
local list = res and res[CityCommandResults.PLOTS] or {}
for _, id in pairs(list) do offered[id] = true end
local n = 0
for _, id in pairs(list) do n = n + 1 end
print("{\"kind\":\"swap_targets\",\"claimant\":" .. ZA .. ",\"offered\":" .. n .. "}")
local w, h = Map.GetGridSize()
for i = 0, w * h - 1 do
  local p = Map.GetPlotByIndex(i)
  local c = Cities.GetPlotPurchaseCity(p)
  if c ~= nil and c:GetOwner() == 0 and c:GetID() == ZB then
    print("{\"plot\":[" .. p:GetX() .. "," .. p:GetY() .. "],\"dA\":" .. Map.GetPlotDistance(a:GetX(), a:GetY(), p:GetX(), p:GetY())
      .. ",\"dB\":" .. Map.GetPlotDistance(b:GetX(), b:GetY(), p:GetX(), p:GetY())
      .. ",\"district\":" .. p:GetDistrictType() .. ",\"wonder\":" .. tostring(p:GetWonderType())
      .. ",\"offered\":" .. tostring(offered[i] == true) .. "}")
  end
end
