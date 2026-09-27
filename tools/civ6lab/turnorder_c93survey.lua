-- InGame: the C-93 rig survey. Per major 0..7: gold, gold yield, maintenance,
-- science yield, the researching tech, whether it has TECH_CARTOGRAPHY /
-- TECH_BANKING; per city: loyalty, loyalty per turn, max loyalty, pop, the
-- current item and the number of WORKED Quarries and Fishing Boats. Then the
-- method names of the first city's CulturalIdentity object.
local function r(f)
  local ok, v = pcall(f)
  if ok then return tostring(v) end
  return "E"
end
local QUARRY = GameInfo.Improvements["IMPROVEMENT_QUARRY"].Index
local BOATS = GameInfo.Improvements["IMPROVEMENT_FISHING_BOATS"].Index
local CART = GameInfo.Technologies["TECH_CARTOGRAPHY"].Index
local BANK = GameInfo.Technologies["TECH_BANKING"].Index
local firstCity = nil
for p = 0, 7 do
  local P = Players[p]
  if P ~= nil and P:IsAlive() then
    local T = P:GetTechs()
    print("P" .. p .. " gold=" .. r(function() return P:GetTreasury():GetGoldBalance() end)
      .. " gy=" .. r(function() return P:GetTreasury():GetGoldYield() end)
      .. " maint=" .. r(function() return P:GetTreasury():GetTotalMaintenance() end)
      .. " sci=" .. r(function() return T:GetScienceYield() end)
      .. " rt=" .. r(function() return T:GetResearchingTech() end)
      .. " cart=" .. r(function() return T:HasTech(CART) end)
      .. " bank=" .. r(function() return T:HasTech(BANK) end)
      .. " costCart=" .. r(function() return T:GetResearchCost(CART) end)
      .. " costBank=" .. r(function() return T:GetResearchCost(BANK) end)
      .. " canCart=" .. r(function() return T:CanResearch(CART) end)
      .. " canBank=" .. r(function() return T:CanResearch(BANK) end))
    for _, c in P:GetCities():Members() do
      if firstCity == nil then firstCity = c end
      local cit = c:GetCitizens()
      local nq, nb = 0, 0
      pcall(function()
        for _, pi in ipairs(Map.GetCityPlots():GetPurchasedPlots(c)) do
          local pl = Map.GetPlotByIndex(pi)
          if cit:IsPlotWorked(pl:GetX(), pl:GetY()) then
            local imp = pl:GetImprovementType()
            if imp == QUARRY and not pl:IsImprovementPillaged() then nq = nq + 1 end
            if imp == BOATS and not pl:IsImprovementPillaged() then nb = nb + 1 end
          end
        end
      end)
      local ci = c:GetCulturalIdentity()
      print("  city " .. c:GetID() .. " " .. c:GetName():gsub(" ", "_") .. " @" .. c:GetX() .. "," .. c:GetY()
        .. " pop=" .. r(function() return c:GetPopulation() end)
        .. " loy=" .. r(function() return ci:GetLoyalty() end)
        .. " lpt=" .. r(function() return ci:GetLoyaltyPerTurn() end)
        .. " max=" .. r(function() return ci:GetMaxLoyalty() end)
        .. " item=" .. r(function() return c:GetBuildQueue():CurrentlyBuilding() end)
        .. " quarries=" .. nq .. " boats=" .. nb)
    end
  end
end
if firstCity ~= nil then
  local ci = firstCity:GetCulturalIdentity()
  local acc, seen = {}, {}
  local function add(t)
    if type(t) ~= "table" then return end
    for k in pairs(t) do if type(k) == "string" and not seen[k] then seen[k] = true; acc[#acc + 1] = k end end
  end
  add(ci)
  local mt = getmetatable(ci)
  if type(mt) == "table" then add(mt); pcall(function() add(mt["__index"]) end) end
  table.sort(acc)
  print("identity [" .. #acc .. "] " .. table.concat(acc, " "))
end
