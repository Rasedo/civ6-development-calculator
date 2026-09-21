-- InGame: every city on the map, one JSON line each. Owner, position, pop,
-- districts (total / complete), whether the CITY CENTRE reads pillaged (the
-- tell that this timeline has already been struck), housing, food, amenities.
-- No plot walk: this must stay cheap enough to run on a whole map.
for _, pl in ipairs(Players) do
  local pid = pl:GetID()
  local ok, cities = pcall(function() return pl:GetCities() end)
  if ok and cities ~= nil then
    for _, c in cities:Members() do
      local dAll, dDone, pil = 0, 0, "-"
      for _, d in c:GetDistricts():Members() do
        dAll = dAll + 1
        if d:IsComplete() then dDone = dDone + 1 end
        local t = GameInfo.Districts[d:GetType()]
        if t ~= nil and t.DistrictType == "DISTRICT_CITY_CENTER" then pil = tostring(d:IsPillaged()) end
      end
      local g = c:GetGrowth()
      local hs, fd, sr, am, an = -1, -1, -1, -1, -1
      pcall(function() hs = g:GetHousing() end)
      pcall(function() fd = g:GetFood() end)
      pcall(function() sr = g:GetFoodSurplus() end)
      pcall(function() am = g:GetAmenities() end)
      pcall(function() an = g:GetAmenitiesNeeded() end)
      print("{\"kind\":\"survey\",\"turn\":" .. Game.GetCurrentGameTurn()
        .. ",\"owner\":" .. pid .. ",\"major\":" .. tostring(pl:IsMajor())
        .. ",\"city\":\"" .. c:GetName() .. "\",\"x\":" .. c:GetX() .. ",\"y\":" .. c:GetY()
        .. ",\"pop\":" .. c:GetPopulation()
        .. ",\"districtsTotal\":" .. dAll .. ",\"districtsComplete\":" .. dDone
        .. ",\"centrePillaged\":\"" .. pil .. "\""
        .. ",\"housing\":" .. hs .. ",\"food\":" .. fd .. ",\"foodSurplus\":" .. sr
        .. ",\"amenities\":" .. am .. ",\"amenitiesNeeded\":" .. an .. "}")
    end
  end
end
