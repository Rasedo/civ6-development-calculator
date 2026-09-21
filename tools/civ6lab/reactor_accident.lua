-- GameCore_Tuner: fire a nuclear accident on purpose and measure what each
-- severity does. Expansion2_RandomEvents gives three rows with
-- EffectOperatorType="NUCLEAR_ACCIDENT" and Severity 0/1/2 (MinTurnAtRisk
-- 10/20/30), and GameRandomEvents.ApplyEvent{EventType, Location} is the same
-- door session 1 used for storms and volcanoes.
-- Reads the reactor's city and the ground around it BEFORE and leaves the
-- after-read to a second call, because an event resolves on a later tick.
-- ZIDX picks WHICH reactor, so a second, freshly built one can be used to
-- attribute the pillage flags that the first reactor's nuke history confuses.
--   --set ZEVENT=RANDOM_EVENT_NUCLEAR_ACCIDENT_MINOR --set ZTAG=before --set ZFIRE=0 --set ZIDX=0
local fm = Game.GetFalloutManager()
if fm:GetReactorCount() <= ZIDX then print("{\"kind\":\"accident\",\"error\":\"noreactor\"}") return end
local r = fm:GetReactorByIndex(ZIDX)
local q = Map.GetPlotByIndex(r.PlotIndex)
local city = nil
for _, pl in ipairs(Players) do
  local ok, cs = pcall(function() return pl:GetCities() end)
  if ok and cs ~= nil then
    for _, c in cs:Members() do
      if c:GetOwner() == r.Owner and c:GetID() == r.CityID then city = c end
    end
  end
end
local contaminated, maxDist = 0, -1
for i = 0, Map.GetPlotCount() - 1 do
  if fm:GetFalloutTurnsRemaining(i) > 0 then
    contaminated = contaminated + 1
    local p = Map.GetPlotByIndex(i)
    local d = Map.GetPlotDistance(q:GetX(), q:GetY(), p:GetX(), p:GetY())
    if d > maxDist then maxDist = d end
  end
end
local pp = GameInfo.Buildings["BUILDING_POWER_PLANT"].Index
print("{\"kind\":\"accident\",\"stage\":\"ZTAG\",\"turn\":" .. Game.GetCurrentGameTurn()
  .. ",\"reactorPlot\":\"" .. q:GetX() .. ":" .. q:GetY() .. "\""
  .. ",\"age\":" .. tostring(r.Age) .. ",\"lastAccidentTurn\":" .. tostring(r.LastAccidentTurn)
  .. ",\"city\":\"" .. (city and city:GetName():gsub("LOC_CITY_NAME_", "") or "?") .. "\""
  .. ",\"pop\":" .. (city and city:GetPopulation() or -1)
  .. ",\"hasPowerPlant\":" .. tostring(city and city:GetBuildings():HasBuilding(pp))
  .. ",\"plantPillaged\":" .. tostring(city and city:GetBuildings():IsPillaged(GameInfo.Buildings["BUILDING_POWER_PLANT"].Hash))
  .. ",\"falloutAtReactor\":" .. tostring(fm:GetFalloutTurnsRemaining(r.PlotIndex))
  .. ",\"contaminatedPlotsMap\":" .. contaminated
  .. ",\"reactorCount\":" .. fm:GetReactorCount() .. "}")
if ZFIRE == 1 then
  local def = GameInfo.RandomEvents["ZEVENT"]
  if def == nil then print("{\"kind\":\"accident\",\"error\":\"noeventrow\"}") return end
  local ok = pcall(function() GameRandomEvents.ApplyEvent({ EventType = def.Index, Location = r.PlotIndex }) end)
  print("{\"kind\":\"accident\",\"fired\":\"ZEVENT\",\"ok\":" .. tostring(ok)
    .. ",\"severity\":" .. tostring(def.Severity) .. ",\"location\":" .. r.PlotIndex .. "}")
end
