-- InGame (after lab_json.lua): per city of the local seat, the Production
-- yield, its tooltip (the game's own breakdown, regional lines included),
-- GetBuildingYield(Production) of the Factory and the three plants, the
-- power state, and the assigned governor with its promotions.
local me = Game.GetLocalPlayer()
local rows = {}
local B = {"BUILDING_WORKSHOP", "BUILDING_FACTORY", "BUILDING_COAL_POWER_PLANT", "BUILDING_FOSSIL_FUEL_POWER_PLANT", "BUILDING_POWER_PLANT"}
for _, c in Players[me]:GetCities():Members() do
  local r = {id = c:GetID(), x = c:GetX(), y = c:GetY(), pop = c:GetPopulation(), tag = "ZTAG", turn = Game.GetCurrentGameTurn()}
  r.prod = P(function() return c:GetYield(YieldTypes.PRODUCTION) end)
  r.gold = P(function() return c:GetYield(YieldTypes.GOLD) end)
  r.tip = P(function() return c:GetYieldToolTip(YieldTypes.PRODUCTION) end)
  r.bprod = {}
  for _, n in ipairs(B) do
    if c:GetBuildings():HasBuilding(GameInfo.Buildings[n].Index) then
      r.bprod[n] = P(function() return c:GetBuildingYield(GameInfo.Buildings[n].Index, "YIELD_PRODUCTION") end)
    end
  end
  local pw = c:GetPower()
  if pw then
    r.power = {free = P(function() return pw:GetFreePower() end), req = P(function() return pw:GetRequiredPower() end),
      full = P(function() return pw:IsFullyPowered() end), gen = P(function() return pw:GetGeneratedPowerSources() end),
      freeSrc = P(function() return pw:GetFreePowerSources() end)}
  end
  local gv = P(function() return c:GetAssignedGovernor() end)
  if type(gv) ~= "string" and gv ~= nil then
    r.gov = GameInfo.Governors[gv:GetType()].GovernorType
    r.govEst = P(function() return gv:IsEstablished() end)
  end
  rows[#rows + 1] = r
end
OUT({kind = "prod", rows = rows})
