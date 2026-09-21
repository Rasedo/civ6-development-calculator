-- GameCore_Tuner: does the City Gold object answer GetPurchaseCost here?
-- Two units, two buildings, gold and faith, against the build queue's cost.
local city = Players[0]:GetCities():GetCapitalCity()
if city == nil then print("nocity") return end
local bq = city:GetBuildQueue()
local g = city:GetGold()
print("city " .. city:GetName() .. " id=" .. city:GetID() .. " gold_obj=" .. tostring(g ~= nil))
local YG = GameInfo.Yields["YIELD_GOLD"].Index
local YF = GameInfo.Yields["YIELD_FAITH"].Index
print("YIELD_GOLD=" .. YG .. " YIELD_FAITH=" .. YF)
print("formations=" .. tostring(MilitaryFormationTypes ~= nil))
if MilitaryFormationTypes ~= nil then
  for k, v in pairs(MilitaryFormationTypes) do print("  formation " .. tostring(k) .. "=" .. tostring(v)) end
end
for _, n in ipairs({ "UNIT_WARRIOR", "UNIT_SLINGER" }) do
  local r = GameInfo.Units[n]
  local okg, cg = pcall(function() return g:GetPurchaseCost(YG, r.Hash, MilitaryFormationTypes.STANDARD_MILITARY_FORMATION) end)
  local okf, cf = pcall(function() return g:GetPurchaseCost(YF, r.Hash, MilitaryFormationTypes.STANDARD_MILITARY_FORMATION) end)
  local okb, cb = pcall(function() return bq:GetUnitCost(r.Index) end)
  print("unit " .. n .. " xmlCost=" .. tostring(r.Cost) .. " bqCost=" .. tostring(okb and cb or "ERR:" .. tostring(cb))
    .. " gold=" .. tostring(okg and cg or "ERR:" .. tostring(cg))
    .. " faith=" .. tostring(okf and cf or "ERR:" .. tostring(cf)))
end
for _, n in ipairs({ "BUILDING_MONUMENT", "BUILDING_GRANARY" }) do
  local r = GameInfo.Buildings[n]
  local okg, cg = pcall(function() return g:GetPurchaseCost(YG, r.Hash) end)
  local okf, cf = pcall(function() return g:GetPurchaseCost(YF, r.Hash) end)
  local okb, cb = pcall(function() return bq:GetBuildingCost(r.Index) end)
  print("bldg " .. n .. " xmlCost=" .. tostring(r.Cost) .. " bqCost=" .. tostring(okb and cb or "ERR:" .. tostring(cb))
    .. " gold=" .. tostring(okg and cg or "ERR:" .. tostring(cg))
    .. " faith=" .. tostring(okf and cf or "ERR:" .. tostring(cf)))
end
