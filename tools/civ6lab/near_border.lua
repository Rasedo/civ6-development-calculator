-- GameCore: for each site "x:y" in ZSITES, the distance to seat ZP's
-- nearest CITY and to its nearest OWNED plot (the border), so a grievance can
-- be matched against either reading of "near".
for site in string.gmatch("ZSITES", "[^,]+") do
  local x, y = site:match("(%d+):(%d+)")
  x, y = tonumber(x), tonumber(y)
  local dc, db = 999, 999
  for _, c in Players[ZP]:GetCities():Members() do
    dc = math.min(dc, Map.GetPlotDistance(x, y, c:GetX(), c:GetY()))
  end
  for i = 0, Map.GetPlotCount() - 1 do
    local p = Map.GetPlotByIndex(i)
    if p:GetOwner() == ZP then db = math.min(db, Map.GetPlotDistance(x, y, p:GetX(), p:GetY())) end
  end
  print(string.format("site %d:%d city %d border %d", x, y, dc, db))
end
