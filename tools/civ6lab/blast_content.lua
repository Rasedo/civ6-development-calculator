-- InGame: for every candidate target, what is INSIDE the blast before it is
-- struck. Ask 5's population loss is deterministic but not a function of
-- population, so this measures the surviving candidate drivers:
--   districtsInBlast  the city's own COMPLETE districts within ZR of the centre
--   buildingsTotal    every building the city owns
--   workersInBlast    sum of plot:GetWorkerCount() over the city's plots in
--                     the blast - the citizens standing where the bomb lands
--   plotsOwnedInBlast the city's tiles inside the radius
--   --set ZR=2 --set ZTAG=before
local T = {
  { x = 20, y = 29, tag = "okayama" },
  { x = 26, y = 28, tag = "osaka" },
  { x = 26, y = 32, tag = "nagoya" },
  { x = 30, y = 20, tag = "otsu" },
  { x = 22, y = 12, tag = "meroe" },
  { x = 19, y = 14, tag = "napata" },
  { x = 13, y = 19, tag = "dundee" },
  { x = 12, y = 23, tag = "montrose" },
  { x = 26, y = 18, tag = "ngazargamu" },
  { x = 17, y = 25, tag = "nanmadol" },
  { x = 18, y = 18, tag = "muscat" },
  { x = 29, y = 29, tag = "akkad" },
}
for _, r in ipairs(T) do
  local c = Cities.GetCityInPlot(r.x, r.y)
  if c == nil then
    print("{\"scene\":\"D\",\"kind\":\"content\",\"stage\":\"ZTAG\",\"tag\":\"" .. r.tag .. "\",\"exists\":false}")
  else
    local dIn, dAll, names = 0, 0, {}
    for _, d in c:GetDistricts():Members() do
      dAll = dAll + 1
      local t = GameInfo.Districts[d:GetType()]
      if Map.GetPlotDistance(r.x, r.y, d:GetX(), d:GetY()) <= ZR and d:IsComplete() then
        dIn = dIn + 1
        names[#names + 1] = (t and t.DistrictType or "?"):gsub("DISTRICT_", "")
      end
    end
    local nb = 0
    for b in GameInfo.Buildings() do
      if c:GetBuildings():HasBuilding(b.Index) then nb = nb + 1 end
    end
    local owner = c:GetOwner()
    local workers, plotsOwned = 0, 0
    for i = 0, Map.GetPlotCount() - 1 do
      local q = Map.GetPlotByIndex(i)
      if Map.GetPlotDistance(r.x, r.y, q:GetX(), q:GetY()) <= ZR and q:GetOwner() == owner then
        plotsOwned = plotsOwned + 1
        local ok, w = pcall(function() return q:GetWorkerCount() end)
        if ok and w ~= nil then workers = workers + w end
      end
    end
    print("{\"scene\":\"D\",\"kind\":\"content\",\"stage\":\"ZTAG\",\"tag\":\"" .. r.tag
      .. "\",\"city\":\"" .. c:GetName() .. "\",\"owner\":" .. owner
      .. ",\"isMinor\":" .. tostring(not Players[owner]:IsMajor())
      .. ",\"x\":" .. r.x .. ",\"y\":" .. r.y .. ",\"pop\":" .. c:GetPopulation()
      .. ",\"districtsInBlast\":" .. dIn .. ",\"districtsTotal\":" .. dAll
      .. ",\"buildingsTotal\":" .. nb
      .. ",\"workersInBlast\":" .. workers .. ",\"plotsOwnedInBlast\":" .. plotsOwned
      .. ",\"districts\":\"" .. table.concat(names, " ") .. "\"}")
  end
end
