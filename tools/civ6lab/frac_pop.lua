-- GameCore_Tuner: is a combat strength strictly an integer on the backend?
-- GlobalParameters ships COMBAT_POPULATION_PER_STRENGTH = 2, so a city's
-- defence strength carries population/2 -- a term that is a HALF whenever the
-- population is odd. This sets the population; the defence strength is read
-- on the InGame side by city_probe.lua / frac_read.lua.
--   --set ZCX=0 --set ZCY=0 --set ZPOP=0   (0:0 = just list every city)
for _, pl in ipairs(Players) do
  local ok, list = pcall(function() return pl:GetCities() end)
  if ok and list ~= nil then
    for _, c in list:Members() do
      if ZCX == 0 and ZCY == 0 then
        print("{\"kind\":\"fracpop\",\"owner\":" .. pl:GetID() .. ",\"city\":" .. c:GetID()
          .. ",\"at\":\"" .. c:GetX() .. ":" .. c:GetY() .. "\",\"pop\":" .. c:GetPopulation() .. "}")
      elseif c:GetX() == ZCX and c:GetY() == ZCY then
        if ZPOP > 0 then
          pcall(function() WorldBuilder.CityManager():SetCityValue(c, "Population", ZPOP) end)
        end
        print("{\"kind\":\"fracpop\",\"owner\":" .. pl:GetID() .. ",\"city\":" .. c:GetID()
          .. ",\"at\":\"" .. c:GetX() .. ":" .. c:GetY() .. "\",\"pop\":" .. c:GetPopulation() .. "}")
      end
    end
  end
end
