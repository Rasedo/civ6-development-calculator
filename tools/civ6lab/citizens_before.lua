-- InGame: the wiki's claim is "citizens WORKING the affected tiles are
-- eliminated". This measures that properly, with city:GetCitizens():IsPlotWorked(x,y)
-- (plot:GetWorkerCount() counts any owner's citizens and leaks neighbouring
-- cities in, which is how the first pass got a nonsense column), for the two
-- cities still untouched and in bomber range.
--   --set ZR=2 --set ZTAG=before
local T = { { x = 32, y = 26, tag = "sendai" }, { x = 29, y = 29, tag = "akkad" } }
for _, r in ipairs(T) do
  local c = Cities.GetCityInPlot(r.x, r.y)
  if c == nil then print("{\"tag\":\"" .. r.tag .. "\",\"exists\":false}") return end
  local cz = c:GetCitizens()
  local worked, workedInBlast, ownedInBlast = 0, 0, 0
  for i = 0, Map.GetPlotCount() - 1 do
    local q = Map.GetPlotByIndex(i)
    local dist = Map.GetPlotDistance(r.x, r.y, q:GetX(), q:GetY())
    local ok, w = pcall(function() return cz:IsPlotWorked(q:GetX(), q:GetY()) end)
    if ok and w == true then
      worked = worked + 1
      if dist <= ZR then workedInBlast = workedInBlast + 1 end
    end
    if dist <= ZR and q:GetOwner() == c:GetOwner() then ownedInBlast = ownedInBlast + 1 end
  end
  local dIn, dAll, names = 0, 0, {}
  for _, d in c:GetDistricts():Members() do
    dAll = dAll + 1
    local t = GameInfo.Districts[d:GetType()]
    if Map.GetPlotDistance(r.x, r.y, d:GetX(), d:GetY()) <= ZR and d:IsComplete() then
      dIn = dIn + 1
      names[#names + 1] = (t and t.DistrictType or "?"):gsub("DISTRICT_", "")
    end
  end
  print("{\"scene\":\"D-validate\",\"kind\":\"citizens-before\",\"stage\":\"ZTAG\",\"tag\":\"" .. r.tag
    .. "\",\"city\":\"" .. c:GetName() .. "\",\"owner\":" .. c:GetOwner()
    .. ",\"isMinor\":" .. tostring(not Players[c:GetOwner()]:IsMajor())
    .. ",\"pop\":" .. c:GetPopulation()
    .. ",\"tilesWorkedTotal\":" .. worked .. ",\"tilesWorkedInBlast\":" .. workedInBlast
    .. ",\"plotsOwnedInBlast\":" .. ownedInBlast
    .. ",\"districtsInBlast\":" .. dIn .. ",\"districtsTotal\":" .. dAll
    .. ",\"districts\":\"" .. table.concat(names, " ") .. "\"}")
end
