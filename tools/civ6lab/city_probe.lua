-- InGame: one city, everything scene B and scene C need, as one JSON line.
--   loyalty   city:GetCulturalIdentity():GetLoyalty()/GetMaxLoyalty()/GetLoyaltyPerTurn()/GetLoyaltyLevel()
--   amenities city:GetGrowth():GetAmenities()/GetAmenitiesNeeded()/GetHappiness()
--   defence   district:GetDefenseStrength(), :GetDamage(DefenseTypes.X), :GetMaxDamage(DefenseTypes.X)
--   --set ZX=32 --set ZY=26
local c = Cities.GetCityInPlot(ZX, ZY)
if c == nil then print("{\"error\":\"nocity\",\"x\":" .. ZX .. ",\"y\":" .. ZY .. "}") return end
local function num(f, d)
  local ok, v = pcall(f)
  if ok and v ~= nil then return tostring(v) end
  return tostring(d)
end
local g = c:GetGrowth()
local ci = c:GetCulturalIdentity()
local ds = {}
for _, d in c:GetDistricts():Members() do
  local t = GameInfo.Districts[d:GetType()]
  ds[#ds + 1] = "{\"d\":\"" .. (t and t.DistrictType or "?") .. "\",\"x\":" .. d:GetX() .. ",\"y\":" .. d:GetY()
    .. ",\"complete\":" .. tostring(d:IsComplete()) .. ",\"pillaged\":" .. tostring(d:IsPillaged())
    .. ",\"def\":" .. num(function() return d:GetDefenseStrength() end, -1)
    .. ",\"garrison\":" .. num(function() return d:GetDamage(DefenseTypes.DISTRICT_GARRISON) end, -1)
    .. ",\"garrisonMax\":" .. num(function() return d:GetMaxDamage(DefenseTypes.DISTRICT_GARRISON) end, -1)
    .. ",\"outer\":" .. num(function() return d:GetDamage(DefenseTypes.DISTRICT_OUTER) end, -1)
    .. ",\"outerMax\":" .. num(function() return d:GetMaxDamage(DefenseTypes.DISTRICT_OUTER) end, -1) .. "}"
end
local bq = c:GetBuildQueue()
local cur = "nothing"
local h = bq:GetCurrentProductionTypeHash()
for r in GameInfo.Units() do if r.Hash == h then cur = r.UnitType end end
for r in GameInfo.Buildings() do if r.Hash == h then cur = r.BuildingType end end
for r in GameInfo.Districts() do if r.Hash == h then cur = r.DistrictType end end
local units = {}
for p = 0, 62 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() then
    for _, u in pl:GetUnits():Members() do
      if math.abs(u:GetX() - ZX) <= 2 and math.abs(u:GetY() - ZY) <= 2 then
        units[#units + 1] = "{\"p\":" .. p .. ",\"u\":\"" .. GameInfo.Units[u:GetType()].UnitType
          .. "\",\"id\":" .. u:GetID() .. ",\"x\":" .. u:GetX() .. ",\"y\":" .. u:GetY()
          .. ",\"dmg\":" .. u:GetDamage() .. "}"
      end
    end
  end
end
print("{\"scene\":\"B\",\"turn\":" .. Game.GetCurrentGameTurn() .. ",\"city\":\"" .. c:GetName()
  .. "\",\"id\":" .. c:GetID() .. ",\"owner\":" .. c:GetOwner() .. ",\"origOwner\":" .. c:GetOriginalOwner()
  .. ",\"x\":" .. c:GetX() .. ",\"y\":" .. c:GetY() .. ",\"pop\":" .. c:GetPopulation()
  .. ",\"loyalty\":" .. num(function() return ci:GetLoyalty() end, -1)
  .. ",\"loyaltyMax\":" .. num(function() return ci:GetMaxLoyalty() end, -1)
  .. ",\"loyaltyPerTurn\":" .. num(function() return ci:GetLoyaltyPerTurn() end, -1)
  .. ",\"loyaltyLevel\":" .. num(function() return ci:GetLoyaltyLevel() end, -1)
  .. ",\"amenities\":" .. num(function() return g:GetAmenities() end, -1)
  .. ",\"amenitiesNeeded\":" .. num(function() return g:GetAmenitiesNeeded() end, -1)
  .. ",\"happiness\":" .. num(function() return g:GetHappiness() end, -1)
  .. ",\"amenLux\":" .. num(function() return g:GetAmenitiesFromLuxuries() end, -1)
  .. ",\"amenWarWeary\":" .. num(function() return g:GetAmenitiesLostFromWarWeariness() end, -1)
  .. ",\"walls\":" .. tostring(c:GetBuildings():HasBuilding(GameInfo.Buildings["BUILDING_WALLS"].Index))
  .. ",\"producing\":\"" .. cur .. "\""
  .. ",\"districts\":[" .. table.concat(ds, ",") .. "]"
  .. ",\"unitsWithin2\":[" .. table.concat(units, ",") .. "]}")
