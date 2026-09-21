-- InGame: scene G — the purchase price of every buildable unit and building
-- in the local player's capital, against the city's own production cost.
--   city:GetGold():GetPurchaseCost(yieldIndex, row.Hash [, formation])
--   city:GetBuildQueue():GetUnitCost(idx) / :GetBuildingCost(idx)
-- One JSON object per line -> runs/purchase_<stamp>.jsonl
local city = Players[0]:GetCities():GetCapitalCity()
if city == nil then print("{\"error\":\"nocity\"}") return end
local bq = city:GetBuildQueue()
local g = city:GetGold()
local YG = GameInfo.Yields["YIELD_GOLD"].Index
local YF = GameInfo.Yields["YIELD_FAITH"].Index
local turn = Game.GetCurrentGameTurn()
local speed = "?"
local okS, sp = pcall(function() return GameConfiguration.GetGameSpeedType() end)
if okS then
  for r in GameInfo.GameSpeeds() do if r.Hash == sp or r.Index == sp then speed = r.GameSpeedType .. "/" .. tostring(r.CostMultiplier) end end
end
local function gp(name, def)
  local r = GameInfo.GlobalParameters[name]
  return (r ~= nil and r.Value) or def
end
print("{\"kind\":\"meta\",\"turn\":" .. turn .. ",\"speed\":\"" .. speed
  .. "\",\"goldMult\":\"" .. tostring(gp("GOLD_PURCHASE_MULTIPLIER", "nil"))
  .. "\",\"divisor\":\"" .. tostring(gp("PURCHASE_DIVISOR", "nil"))
  .. "\",\"faithMult\":\"" .. tostring(gp("FAITH_PURCHASE_MULTIPLIER", "nil"))
  .. "\",\"era\":" .. tostring(Game.GetEras():GetCurrentEra()) .. "}")

local function emit(kind, name, xmlCost, bqCost, progress, cg, cf)
  print("{\"kind\":\"" .. kind .. "\",\"turn\":" .. turn .. ",\"item\":\"" .. name
    .. "\",\"xmlCost\":" .. tostring(xmlCost) .. ",\"prodCost\":" .. tostring(bqCost)
    .. ",\"progress\":" .. tostring(progress)
    .. ",\"gold\":" .. tostring(cg) .. ",\"faith\":" .. tostring(cf) .. "}")
end

for r in GameInfo.Units() do
  if r.Cost ~= nil and r.Cost > 0 then
    local okb, cb = pcall(function() return bq:GetUnitCost(r.Index) end)
    if okb and cb ~= nil and cb > 0 then
      local okg, cg = pcall(function() return g:GetPurchaseCost(YG, r.Hash, MilitaryFormationTypes.STANDARD_MILITARY_FORMATION) end)
      local okf, cf = pcall(function() return g:GetPurchaseCost(YF, r.Hash, MilitaryFormationTypes.STANDARD_MILITARY_FORMATION) end)
      local okp, pg = pcall(function() return bq:GetUnitProgress(r.Index) end)
      emit("unit", r.UnitType, r.Cost, cb, okp and pg or -1, okg and cg or -1, okf and cf or -1)
    end
  end
end
for r in GameInfo.Buildings() do
  if r.Cost ~= nil and r.Cost > 0 then
    local okb, cb = pcall(function() return bq:GetBuildingCost(r.Index) end)
    if okb and cb ~= nil and cb > 0 then
      local okg, cg = pcall(function() return g:GetPurchaseCost(YG, r.Hash) end)
      local okf, cf = pcall(function() return g:GetPurchaseCost(YF, r.Hash) end)
      local okp, pg = pcall(function() return bq:GetBuildingProgress(r.Index) end)
      emit("building", r.BuildingType, r.Cost, cb, okp and pg or -1, okg and cg or -1, okf and cf or -1)
    end
  end
end
for r in GameInfo.Districts() do
  if r.Cost ~= nil and r.Cost > 0 then
    local okb, cb = pcall(function() return bq:GetDistrictCost(r.Index) end)
    if okb and cb ~= nil and cb > 0 then
      local okg, cg = pcall(function() return g:GetPurchaseCost(YG, r.Hash) end)
      local okf, cf = pcall(function() return g:GetPurchaseCost(YF, r.Hash) end)
      local okp, pg = pcall(function() return bq:GetDistrictProgress(r.Index) end)
      emit("district", r.DistrictType, r.Cost, cb, okp and pg or -1, okg and cg or -1, okf and cf or -1)
    end
  end
end
