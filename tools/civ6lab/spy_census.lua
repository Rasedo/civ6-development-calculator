-- InGame: every spy on the map, whose it is, where it stands and what it is
-- doing. A city that ALREADY holds an established counterspy is a free
-- control: the offensive odds can be read there and against a city without
-- one, with no turn passing and no unit of mine involved.
local n = 0
for _, pl in ipairs(Players) do
  local pid = pl:GetID()
  local ok, units = pcall(function() return pl:GetUnits() end)
  if ok and units ~= nil then
    for _, u in units:Members() do
      if GameInfo.Units[u:GetType()].UnitType == "UNIT_SPY" then
        n = n + 1
        local opName = "?"
        local oko, oph = pcall(function() return u:GetActivityType() end)
        local okq, q = pcall(function() return Map.GetPlot(u:GetX(), u:GetY()) end)
        local city = "-"
        if okq and q ~= nil then
          local c = Cities.GetCityInPlot(u:GetX(), u:GetY())
          if c ~= nil then city = c:GetName():gsub("LOC_CITY_NAME_", "") .. "/p" .. c:GetOwner() end
        end
        print("{\"kind\":\"spy\",\"owner\":" .. pid .. ",\"id\":" .. u:GetID()
          .. ",\"x\":" .. u:GetX() .. ",\"y\":" .. u:GetY() .. ",\"city\":\"" .. city .. "\""
          .. ",\"activity\":\"" .. tostring(oko and oph or "err") .. "\""
          .. ",\"moves\":" .. tostring(u:GetMovesRemaining()) .. "}")
      end
    end
  end
end
print("{\"kind\":\"spy-census\",\"total\":" .. n .. ",\"turn\":" .. Game.GetCurrentGameTurn() .. "}")
