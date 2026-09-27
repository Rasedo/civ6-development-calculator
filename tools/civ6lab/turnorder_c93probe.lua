-- InGame: the C-93 pre-rig reads. Player ZP city ZC: identity breakdown,
-- loyalty, the queue's item progress / cost; city-state ZS's first city:
-- position, garrison / outer damage and max, and every unit on its six
-- neighbours (owner, type, war with ZS). Every read pcall'd.
--   --set ZP=0 --set ZC=196609 --set ZS=13
local function r(f)
  local ok, v = pcall(f)
  if ok then return tostring(v) end
  return "E:" .. tostring(v):sub(1, 60)
end
local function dump(label, t, depth)
  depth = depth or 0
  if type(t) ~= "table" then print(label .. " = " .. tostring(t)) return end
  for k, v in pairs(t) do
    if type(v) == "table" and depth < 2 then dump(label .. "." .. tostring(k), v, depth + 1)
    else print(label .. "." .. tostring(k) .. " = " .. tostring(v)) end
  end
end
local city = CityManager.GetCity(ZP, ZC)
local ci = city:GetCulturalIdentity()
print("loy=" .. r(function() return ci:GetLoyalty() end) .. " lpt=" .. r(function() return ci:GetLoyaltyPerTurn() end)
  .. " fromRatio=" .. r(function() return ci:GetLoyaltyPerTurnFromIdentityPressureRatio() end))
pcall(function() dump("breakdown", ci:GetIdentitySourcesBreakdown()) end)
local bq = city:GetBuildQueue()
local h = bq:GetCurrentProductionTypeHash()
local b = GameInfo.Buildings[h]
print("item=" .. r(function() return b.BuildingType end) .. " prog=" .. r(function() return bq:GetBuildingProgress(b.Index) end)
  .. " cost=" .. r(function() return bq:GetBuildingCost(b.Index) end) .. " prod=" .. r(function() return city:GetYield(1) end))
local cs = nil
for _, c in Players[ZS]:GetCities():Members() do cs = c break end
if cs == nil then print("no city-state city") return end
local d = nil
for _, x in cs:GetDistricts():Members() do
  if x:GetX() == cs:GetX() and x:GetY() == cs:GetY() then d = x end
end
print("cs city " .. cs:GetID() .. " @" .. cs:GetX() .. "," .. cs:GetY()
  .. " garrison=" .. r(function() return d:GetDamage(DefenseTypes.DISTRICT_GARRISON) end) .. "/" .. r(function() return d:GetMaxDamage(DefenseTypes.DISTRICT_GARRISON) end)
  .. " outer=" .. r(function() return d:GetDamage(DefenseTypes.DISTRICT_OUTER) end) .. "/" .. r(function() return d:GetMaxDamage(DefenseTypes.DISTRICT_OUTER) end))
for dir = 0, 5 do
  local pl = Map.GetAdjacentPlot(cs:GetX(), cs:GetY(), dir)
  if pl ~= nil then
    local us = {}
    for _, u in ipairs(Units.GetUnitsInPlot(pl)) do
      local o = u:GetOwner()
      us[#us + 1] = o .. ":" .. GameInfo.Units[u:GetType()].UnitType .. ":war=" .. tostring(Players[o]:GetDiplomacy():IsAtWarWith(ZS))
    end
    print("  dir" .. dir .. " " .. pl:GetX() .. "," .. pl:GetY() .. " owner=" .. pl:GetOwner() .. " water=" .. tostring(pl:IsWater())
      .. " mtn=" .. tostring(pl:IsMountain()) .. " units=" .. table.concat(us, " "))
  end
end
