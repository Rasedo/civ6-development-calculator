-- GameCore_Tuner (after lab_json.lua): one B-82-S3 arm.
--   ZKIND=remove   ZX/ZY city, ZWHAT=BUILDING_X        RemoveBuilding
--   ZKIND=pillage  ZX/ZY city, ZWHAT=BUILDING_X        SetPillaged(index, true)
--   ZKIND=movepal  ZX/ZY from, ZX2/ZY2 to              Palace removed, placed in the other city
--   ZKIND=convert  ZX/ZY city, ZWHAT=<religion index>  SetAllCityToReligion
--   ZKIND=place    ZX/ZY city, ZWHAT=BUILDING_X        WorldBuilder CreateBuilding on its district
--   ZKIND=pop      ZX/ZY city, ZWHAT=n                 ChangePopulation(n)
--   ZKIND=era      ZX/ZY a city of the player, ZWHAT=n Game.GetEras():ChangePlayerEraScore(owner, n)
-- Prints one JSON line: what was done, the call's result and the state after.
local function cityAt(x, y)
  for p = 0, 63 do
    local pl = Players[p]
    if pl ~= nil and pl:IsAlive() then
      for _, c in pl:GetCities():Members() do
        if c:GetX() == x and c:GetY() == y then return c end
      end
    end
  end
  return nil
end
local kind, what = "ZKIND", "ZWHAT"
local c = cityAt(ZX, ZY)
local rec = {kind = kind, what = what, x = ZX, y = ZY, city = c and c:GetName(), owner = c and c:GetOwner()}
if c == nil then rec.err = "no city" OUT(rec) return end
local bl = c:GetBuildings()
if kind == "remove" then
  local row = GameInfo.Buildings[what]
  rec.had = bl:HasBuilding(row.Index)
  rec.wasPillaged = P(function() return bl:IsPillaged(row.Index) end)
  rec.call = P(function() return bl:RemoveBuilding(row.Index) end)
  rec.has = bl:HasBuilding(row.Index)
elseif kind == "pillage" then
  local row = GameInfo.Buildings[what]
  rec.had = bl:HasBuilding(row.Index)
  rec.wasPillaged = P(function() return bl:IsPillaged(row.Index) end)
  rec.call = P(function() return bl:SetPillaged(row.Index, true) end)
  rec.isPillaged = P(function() return bl:IsPillaged(row.Index) end)
elseif kind == "movepal" then
  local row = GameInfo.Buildings["BUILDING_PALACE"]
  rec.call = P(function() return bl:RemoveBuilding(row.Index) end)
  rec.has = bl:HasBuilding(row.Index)
  local c2 = cityAt(ZX2, ZY2)
  rec.to = c2 and c2:GetName()
  rec.call2 = P(function()
    return WorldBuilder.CityManager():CreateBuilding(c2, "BUILDING_PALACE", 100, Map.GetPlot(c2:GetX(), c2:GetY()):GetIndex())
  end)
  rec.has2 = c2 and c2:GetBuildings():HasBuilding(row.Index)
elseif kind == "convert" then
  local cr = c:GetReligion()
  rec.before = P(function() return cr:GetMajorityReligion() end)
  rec.call = P(function() return cr:SetAllCityToReligion(tonumber(what)) end)
  rec.after = P(function() return cr:GetMajorityReligion() end)
  rec.followers = P(function() return cr:GetNumFollowers(tonumber(what)) end)
elseif kind == "pop" then
  rec.before = c:GetPopulation()
  rec.call = P(function() return c:ChangePopulation(tonumber(what)) end)
  rec.after = c:GetPopulation()
elseif kind == "era" then
  rec.before = P(function() return Game.GetEras():GetPlayerCurrentScore(c:GetOwner()) end)
  rec.call = P(function() return Game.GetEras():ChangePlayerEraScore(c:GetOwner(), tonumber(what)) end)
  rec.after = P(function() return Game.GetEras():GetPlayerCurrentScore(c:GetOwner()) end)
elseif kind == "place" then
  local row = GameInfo.Buildings[what]
  local where = Map.GetPlot(c:GetX(), c:GetY()):GetIndex()
  if row.PrereqDistrict and row.PrereqDistrict ~= "DISTRICT_CITY_CENTER" then
    local d = c:GetDistricts():GetDistrict(GameInfo.Districts[row.PrereqDistrict].Index)
    where = d and Map.GetPlot(d:GetX(), d:GetY()):GetIndex() or nil
  end
  rec.call = P(function() return WorldBuilder.CityManager():CreateBuilding(c, what, 100, where) end)
  rec.has = bl:HasBuilding(row.Index)
end
OUT(rec)
