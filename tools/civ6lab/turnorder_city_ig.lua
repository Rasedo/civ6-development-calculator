-- InGame: every city of player ZP, one line each, between turns:
--   city id name pop food thr surplus housing amen | item progress cost prodYield
--   | loyalty lpt | culture curCulture nextCost | religion followers-per-religion
-- plus the player's gold, faith, research and civic progress. Every read is
-- pcall'd and prints its value or E.
local P = Players[ZP]
local function r(f)
  local ok, v = pcall(f)
  if ok then return tostring(v) end
  return "E"
end
local T = P:GetTechs()
local C = P:GetCulture()
print("player " .. ZP .. " turn=" .. r(function() return Game.GetCurrentGameTurn() end)
  .. " gold=" .. r(function() return P:GetTreasury():GetGoldBalance() end)
  .. " goldYield=" .. r(function() return P:GetTreasury():GetGoldYield() end)
  .. " maint=" .. r(function() return P:GetTreasury():GetTotalMaintenance() end)
  .. " faith=" .. r(function() return P:GetReligion():GetFaithBalance() end)
  .. " tech=" .. r(function() return T:GetResearchingTech() end)
  .. " techProg=" .. r(function() return T:GetResearchProgress(T:GetResearchingTech()) end)
  .. " techCost=" .. r(function() return T:GetResearchCost(T:GetResearchingTech()) end)
  .. " sci=" .. r(function() return T:GetScienceYield() end)
  .. " civic=" .. r(function() return C:GetProgressingCivic() end)
  .. " civicProg=" .. r(function() return C:GetCulturalProgress(C:GetProgressingCivic()) end)
  .. " civicCost=" .. r(function() return C:GetCultureCost(C:GetProgressingCivic()) end)
  .. " cul=" .. r(function() return C:GetCultureYield() end))
for _, c in P:GetCities():Members() do
  local g = c:GetGrowth()
  local bq = c:GetBuildQueue()
  local cur = r(function() return bq:CurrentlyBuilding() end)
  local prog, cost = "E", "E"
  local okh, h = pcall(function() return bq:GetCurrentProductionTypeHash() end)
  if okh and h ~= nil and h ~= 0 then
    local b = GameInfo.Buildings[h]
    local u = GameInfo.Units[h]
    local d = GameInfo.Districts[h]
    local pj = GameInfo.Projects[h]
    if b ~= nil then prog = r(function() return bq:GetBuildingProgress(b.Index) end); cost = r(function() return bq:GetBuildingCost(b.Index) end)
    elseif u ~= nil then prog = r(function() return bq:GetUnitProgress(u.Index) end); cost = r(function() return bq:GetUnitCost(u.Index) end)
    elseif d ~= nil then prog = r(function() return bq:GetDistrictProgress(d.Index) end); cost = r(function() return bq:GetDistrictCost(d.Index) end)
    elseif pj ~= nil then prog = r(function() return bq:GetProjectProgress(pj.Index) end); cost = r(function() return bq:GetProjectCost(pj.Index) end) end
  end
  local rel = {}
  pcall(function()
    for _, x in ipairs(c:GetReligion():GetReligionsInCity()) do
      rel[#rel + 1] = x.Religion .. ":" .. x.Followers .. ":" .. string.format("%.1f", x.Pressure)
    end
  end)
  print("city " .. c:GetID() .. " " .. c:GetName():gsub(" ", "_")
    .. " pop=" .. r(function() return c:GetPopulation() end)
    .. " food=" .. r(function() return g:GetFood() end)
    .. " thr=" .. r(function() return g:GetGrowthThreshold() end)
    .. " surplus=" .. r(function() return g:GetFoodSurplus() end)
    .. " housing=" .. r(function() return g:GetHousing() end)
    .. " amen=" .. r(function() return g:GetAmenities() end) .. "/" .. r(function() return g:GetAmenitiesNeeded() end)
    .. " item=" .. cur .. " prog=" .. prog .. " cost=" .. cost
    .. " prod=" .. r(function() return c:GetYield(1) end)
    .. " loy=" .. r(function() return c:GetCulturalIdentity():GetLoyalty() end)
    .. " lpt=" .. r(function() return c:GetCulturalIdentity():GetLoyaltyPerTurn() end)
    .. " culture=" .. r(function() return c:GetCulture():GetCurrentCulture() end)
    .. "/" .. r(function() return c:GetCulture():GetNextPlotCultureCost() end)
    .. " plots=" .. r(function() return #c:GetOwnedPlots() end)
    .. " rel=" .. table.concat(rel, ","))
end
