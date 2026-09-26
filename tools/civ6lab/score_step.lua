-- GameCore_Tuner: B-82-S2 — what one building adds to CATEGORY_EMPIRE.
-- In the capital of player ZP, for each building type in ZLIST (comma list,
-- placed on the district it needs if the city has it, else skipped), read the
-- player's Empire score, place the building complete through the tuner's
-- WorldBuilder city manager, read it again. One JSON line per step.
--   --set ZP=1 --set ZLIST=BUILDING_MONUMENT,BUILDING_GRANARY
local pid = tonumber("ZP")
local pl = Players[pid]
local cm = WorldBuilder.CityManager()
local empire = GameInfo.ScoringCategories["CATEGORY_EMPIRE"].Index
local c = pl:GetCities():GetCapitalCity()
local function score()
  local ok, v = pcall(function() return pl:GetCategoryScore(empire) end)
  if ok then return v end
  return "err:" .. tostring(v)
end
local function total()
  local ok, v = pcall(function() return pl:GetScore() end)
  if ok then return v end
  return "err:" .. tostring(v)
end
local list = "ZLIST"
for name in string.gmatch(list, "[^,]+") do
  local row = GameInfo.Buildings[name]
  local plot = c:GetX() .. ":" .. c:GetY()
  local where = Map.GetPlot(c:GetX(), c:GetY()):GetIndex()
  local have = "none"
  if row ~= nil and row.PrereqDistrict ~= nil and row.PrereqDistrict ~= "DISTRICT_CITY_CENTER" then
    local drow = GameInfo.Districts[row.PrereqDistrict]
    where = nil
    for _, d in c:GetDistricts():Members() do
      if drow ~= nil and d:GetType() == drow.Index then where = Map.GetPlot(d:GetX(), d:GetY()):GetIndex() end
    end
    have = where and "district" or "no district"
  end
  local before, tb = score(), total()
  local had = row ~= nil and c:GetBuildings():HasBuilding(row.Index)
  local ok, err = true, nil
  if row ~= nil and where ~= nil and not had then
    ok, err = pcall(function() return cm:CreateBuilding(c, name, 100, where) end)
  end
  local after, ta = score(), total()
  print('{"kind":"step","p":' .. pid .. ',"building":"' .. name .. '","era":"'
    .. tostring(row and (row.PrereqTech or row.PrereqCivic)) .. '","district":"' .. have
    .. '","had":' .. tostring(had) .. ',"ok":' .. tostring(ok) .. ',"err":"' .. tostring(err)
    .. '","empireBefore":' .. tostring(before) .. ',"empireAfter":' .. tostring(after)
    .. ',"scoreBefore":' .. tostring(tb) .. ',"scoreAfter":' .. tostring(ta)
    .. ',"has":' .. tostring(row ~= nil and c:GetBuildings():HasBuilding(row.Index)) .. '}')
end
