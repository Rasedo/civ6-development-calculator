-- InGame (after lab_json.lua): B-91-S1 — whose religion a worship building
-- follows. For every city of every living major: its majority religion, the
-- owner's founded religion, Holy Site / Temple, and for each worship building
-- (EnabledByReligion) CanProduce(hash, true) (the exclusion test), the full
-- CanProduce answer with its failure reasons, and the faith PURCHASE test.
local worship = {}
for b in GameInfo.Buildings() do
  if b.EnabledByReligion then worship[#worship + 1] = b end
end
local faith = GameInfo.Yields["YIELD_FAITH"].Index
local function reasons(res)
  if type(res) ~= "table" then return res end
  local out = {}
  if res[CityOperationResults.FAILURE_REASONS] ~= nil then
    for _, s in ipairs(res[CityOperationResults.FAILURE_REASONS]) do out[#out + 1] = tostring(s) end
  end
  for k, v in pairs(res) do
    if k ~= CityOperationResults.FAILURE_REASONS and v == true then out[#out + 1] = "key:" .. tostring(k) end
  end
  return out
end
-- the religions' beliefs
local rels = P(function() return Game.GetReligion():GetReligions() end)
if type(rels) == "table" then
  for _, r in ipairs(rels) do
    local names = {}
    for _, bi in ipairs(r.Beliefs or {}) do
      local row = GameInfo.Beliefs[bi]
      names[#names + 1] = row and row.BeliefType or bi
    end
    OUT({kind = "religion", religion = r.Religion, founder = r.Founder, beliefs = names})
  end
end
for p = 0, 62 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() and pl:IsMajor() then
    local founded = P(function() return pl:GetReligion():GetReligionTypeCreated() end)
    for _, c in pl:GetCities():Members() do
      local bq = c:GetBuildQueue()
      local bl = c:GetBuildings()
      local rows = {}
      for _, b in ipairs(worship) do
        local r = {b = b.BuildingType, has = bl:HasBuilding(b.Index)}
        r.canEx = P(function() return bq:CanProduce(b.Hash, true) end)
        local ok, can, res = pcall(function() return bq:CanProduce(b.Hash, false, true) end)
        if ok then r.can = can; r.canWhy = reasons(res) else r.can = "err:" .. tostring(can) end
        local params = {[CityCommandTypes.PARAM_BUILDING_TYPE] = b.Hash, [CityCommandTypes.PARAM_YIELD_TYPE] = faith}
        r.buyEx = P(function() return CityManager.CanStartCommand(c, CityCommandTypes.PURCHASE, true, params, false) end)
        local ok2, buy, res2 = pcall(function() return CityManager.CanStartCommand(c, CityCommandTypes.PURCHASE, false, params, true) end)
        if ok2 then r.buy = buy; r.buyWhy = reasons(res2) else r.buy = "err:" .. tostring(buy) end
        r.faithCost = P(function() return c:GetGold():GetPurchaseCost(faith, b.Hash) end)
        rows[#rows + 1] = r
      end
      local inCity = P(function()
        local t = {}
        for _, g in ipairs(c:GetReligion():GetReligionsInCity()) do t[#t + 1] = {g.Religion, g.Followers} end
        return t
      end)
      OUT({kind = "city", p = p, id = c:GetID(), name = c:GetName(), x = c:GetX(), y = c:GetY(), founded = founded,
        ownerMajority = P(function() return pl:GetReligion():GetReligionInMajorityOfCities() end),
        pop = c:GetPopulation(), religions = inCity,
        majority = P(function() return c:GetReligion():GetMajorityReligion() end),
        temple = bl:HasBuilding(GameInfo.Buildings["BUILDING_TEMPLE"].Index),
        holySite = c:GetDistricts():HasDistrict(GameInfo.Districts["DISTRICT_HOLY_SITE"].Index),
        worship = rows})
    end
  end
end
