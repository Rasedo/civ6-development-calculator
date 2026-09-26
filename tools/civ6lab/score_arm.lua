-- GameCore_Tuner: one B-82-S2 arm in the capital of player ZP.
--   ZKIND=building ZWHAT=BUILDING_X  (placed on its district if the city has it)
--   ZKIND=district ZWHAT=DISTRICT_X  (on a free owned land plot within 3)
--   ZKIND=pop      ZWHAT=1           (ChangePopulation)
-- Prints one JSON line: what was done and whether it took.
local pl = Players[ZP]
local cm = WorldBuilder.CityManager()
local c = pl:GetCities():GetCapitalCity()
local kind, what = "ZKIND", "ZWHAT"
local ok, err, took = true, nil, false
if kind == "building" then
  local row = GameInfo.Buildings[what]
  local where = Map.GetPlot(c:GetX(), c:GetY()):GetIndex()
  if row and row.PrereqDistrict and row.PrereqDistrict ~= "DISTRICT_CITY_CENTER" then
    local drow = GameInfo.Districts[row.PrereqDistrict]
    local d = drow and c:GetDistricts():GetDistrict(drow.Index)
    where = d and Map.GetPlot(d:GetX(), d:GetY()):GetIndex() or nil
  end
  if row and where then ok, err = pcall(function() return cm:CreateBuilding(c, what, 100, where) end) end
  took = row ~= nil and c:GetBuildings():HasBuilding(row.Index)
elseif kind == "district" then
  -- WorldBuilder refuses some plots without an error: try every candidate
  -- until the city holds the district
  local drow = GameInfo.Districts[what]
  for dx = -3, 3 do
    for dy = -3, 3 do
      local q = Map.GetPlot(c:GetX() + dx, c:GetY() + dy)
      if not took and drow and q ~= nil then
        local dd = Map.GetPlotDistance(c:GetX(), c:GetY(), q:GetX(), q:GetY())
        if dd >= 1 and dd <= 3 and not q:IsWater() and not q:IsImpassable() and not q:IsMountain()
           and q:GetDistrictType() < 0 and q:GetOwner() == c:GetOwner() and q:GetResourceType() < 0 then
          ok, err = pcall(function() return cm:CreateDistrict(c, what, 100, q:GetIndex()) end)
          took = c:GetDistricts():GetDistrict(drow.Index) ~= nil
        end
      end
    end
  end
elseif kind == "remove" then
  local row = GameInfo.Buildings[what]
  ok, err = pcall(function() return c:GetBuildings():RemoveBuilding(row.Index) end)
  took = not c:GetBuildings():HasBuilding(row.Index)
elseif kind == "pop" then
  local before = c:GetPopulation()
  ok, err = pcall(function() return c:ChangePopulation(tonumber(what)) end)
  took = c:GetPopulation() == before + tonumber(what)
end
print('{"kind":"' .. kind .. '","what":"' .. what .. '","ok":' .. tostring(ok) .. ',"took":' .. tostring(took) .. '}')
