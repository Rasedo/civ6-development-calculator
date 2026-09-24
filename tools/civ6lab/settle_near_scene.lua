-- GameCore: place a Settler for seat 0 on an unowned, featureless, passable
-- land plot exactly ZD from the nearest city of seat ZP and at least ZD from
-- every other city (so ZD is the distance that counts), scanning plots in
-- index order from ZSKIP. Prints "site X Y" or "nosite".
local function nearest(x, y)
  local best, who = 999, -1
  for _, pl in ipairs(Players) do
    local ok, cs = pcall(function() return pl:GetCities() end)
    if ok and cs then
      for _, c in cs:Members() do
        local d = Map.GetPlotDistance(x, y, c:GetX(), c:GetY())
        if d < best then best, who = d, c:GetOwner() end
      end
    end
  end
  return best, who
end
local skipped = 0
for i = 0, Map.GetPlotCount() - 1 do
  local p = Map.GetPlotByIndex(i)
  if not p:IsWater() and not p:IsImpassable() and not p:IsMountain() and p:GetOwner() == -1
     and p:GetFeatureType() < 0 and p:GetResourceType() < 0 then
    local d, who = nearest(p:GetX(), p:GetY())
    if d == ZD and who == ZP then
      if skipped >= ZSKIP then
        UnitManager.InitUnit(0, "UNIT_SETTLER", p:GetX(), p:GetY())
        print("site " .. p:GetX() .. " " .. p:GetY())
        return
      end
      skipped = skipped + 1
    end
  end
end
print("nosite")
