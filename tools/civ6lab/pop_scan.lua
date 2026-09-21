-- InGame: one line per city with the shape the population rule needs, over
-- the only plots a citizen can be on (distance <= 3 of the centre):
--   workers        tiles worked by this city EXCLUDING the free centre
--   workersIn      those within ZR of the centre (what a centred strike covers)
--   workersOut     workers - workersIn
--   idle           pop - workers  (specialists or unemployed: citizens that
--                  are NOT standing on a tile at all)
-- plus the district / pillage / fallout state, so an already-struck city is
-- never mistaken for a fresh one.
--   --set ZR=2
for _, pl in ipairs(Players) do
  local ok, cities = pcall(function() return pl:GetCities() end)
  if ok and cities ~= nil then
    for _, c in cities:Members() do
      local cx, cy = c:GetX(), c:GetY()
      local cz = c:GetCitizens()
      local fm = Game.GetFalloutManager()
      local workers, workersIn, improvedIn, falloutOnWorked = 0, 0, 0, 0
      for dx = -3, 3 do
        for dy = -3, 3 do
          local okp, q = pcall(function() return Map.GetPlot(cx + dx, cy + dy) end)
          if okp and q ~= nil then
            local dist = Map.GetPlotDistance(cx, cy, q:GetX(), q:GetY())
            if dist <= 3 and dist > 0 then
              local okw, w = pcall(function() return cz:IsPlotWorked(q:GetX(), q:GetY()) end)
              if okw and w == true then
                workers = workers + 1
                if dist <= ZR then
                  workersIn = workersIn + 1
                  local imp = q:GetImprovementType()
                  if imp ~= nil and imp >= 0 then improvedIn = improvedIn + 1 end
                end
                local okf, t = pcall(function() return fm:GetFalloutTurnsRemaining(q:GetIndex()) end)
                if okf and t ~= nil and t > 0 then falloutOnWorked = falloutOnWorked + 1 end
              end
            end
          end
        end
      end
      local dAll, dIn, pil = 0, 0, "-"
      for _, d in c:GetDistricts():Members() do
        dAll = dAll + 1
        local t = GameInfo.Districts[d:GetType()]
        if d:IsComplete() and Map.GetPlotDistance(cx, cy, d:GetX(), d:GetY()) <= ZR then dIn = dIn + 1 end
        if t ~= nil and t.DistrictType == "DISTRICT_CITY_CENTER" then pil = tostring(d:IsPillaged()) end
      end
      print("{\"kind\":\"scan\",\"turn\":" .. Game.GetCurrentGameTurn()
        .. ",\"owner\":" .. pl:GetID() .. ",\"major\":" .. tostring(pl:IsMajor())
        .. ",\"city\":\"" .. c:GetName():gsub("LOC_CITY_NAME_", "") .. "\",\"x\":" .. cx .. ",\"y\":" .. cy
        .. ",\"pop\":" .. c:GetPopulation()
        .. ",\"workers\":" .. workers .. ",\"workersIn\":" .. workersIn
        .. ",\"workersOut\":" .. (workers - workersIn)
        .. ",\"idle\":" .. (c:GetPopulation() - workers)
        .. ",\"improvedIn\":" .. improvedIn .. ",\"falloutOnWorked\":" .. falloutOnWorked
        .. ",\"districtsTotal\":" .. dAll .. ",\"districtsCompleteIn\":" .. dIn
        .. ",\"centrePillaged\":\"" .. pil .. "\"}")
    end
  end
end
