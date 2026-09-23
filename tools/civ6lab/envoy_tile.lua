-- InGame: scene 5, WHICH plot a city-state takes per envoy. Each call diffs
-- minor ZM's owned plots against the previous call's (kept in ExposedMembers),
-- prints every new plot with what could have chosen it — distance from the
-- centre, the plot's yields, terrain/feature/resource, how many owned plots it
-- touches — and the candidates it was chosen OVER (every unowned land/coast
-- plot adjacent to the owned set), then sends ONE more envoy from seat 0.
--   --set ZM=6
local m = ZM
local pl = Players[m]
local city = nil
for _, c in pl:GetCities():Members() do city = c end
if not ExposedMembers then ExposedMembers = {} end
local prev = ExposedMembers.EnvoyOwned or {}
local now, cnt = {}, 0
for i = 0, Map.GetPlotCount() - 1 do
  if Map.GetPlotByIndex(i):GetOwner() == m then now[i] = true; cnt = cnt + 1 end
end
local function info(p)
  local y = {}
  for _, t in ipairs({"YIELD_FOOD", "YIELD_PRODUCTION", "YIELD_GOLD"}) do
    y[#y + 1] = p:GetYield(GameInfo.Yields[t].Index)
  end
  local touching = 0
  for d = 0, 5 do
    local n = Map.GetAdjacentPlot(p:GetX(), p:GetY(), d)
    if n and now[n:GetIndex()] then touching = touching + 1 end
  end
  local tr = GameInfo.Terrains[p:GetTerrainType()]
  local fe = p:GetFeatureType() >= 0 and GameInfo.Features[p:GetFeatureType()].FeatureType or "-"
  local re = p:GetResourceType() >= 0 and GameInfo.Resources[p:GetResourceType()].ResourceType or "-"
  return "[" .. p:GetX() .. "," .. p:GetY() .. "] d" .. Map.GetPlotDistance(city:GetX(), city:GetY(), p:GetX(), p:GetY())
    .. " fpg " .. table.concat(y, "/") .. " " .. (tr and tr.TerrainType or "?") .. " " .. fe .. " " .. re
    .. " touch" .. touching .. " idx" .. p:GetIndex()
end
local recv = -1
pcall(function() recv = pl:GetInfluence():GetTokensReceived(0) end)
print("envoys " .. recv .. " plots " .. cnt)
for i in pairs(now) do
  if next(prev) ~= nil and not prev[i] then print("  NEW " .. info(Map.GetPlotByIndex(i))) end
end
ExposedMembers.EnvoyOwned = now
local p0 = Players[0]
local tok = 0
pcall(function() tok = p0:GetInfluence():GetTokensToGive() end)
if tok < 1 then pcall(function() p0:GetInfluence():ChangeTokensToGive(1) end) end
local params = {}
params[PlayerOperations.PARAM_PLAYER_ONE] = m
UI.RequestPlayerOperation(0, PlayerOperations.GIVE_INFLUENCE_TOKEN, params)
