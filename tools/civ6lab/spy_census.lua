-- InGame: every spy on the map, whose it is, where it stands and what it is
-- doing. A city that ALREADY holds an established counterspy is a free
-- control: the offensive odds can be read there and against a city without
-- one, with no turn passing and no unit of mine involved.
-- a pcall read in three states: its value, or "err:<msg>" when the call threw
local function tri(ok, v)
  local s = ok and tostring(v) or ("err:" .. tostring(v))
  return (s:gsub('[%c"\\]', function(c) return string.format("\\u%04x", c:byte()) end))
end
local function trij(ok, v)
  if ok and (type(v) == "boolean" or type(v) == "number") then return tostring(v) end
  if ok and v == nil then return "null" end
  return "\"" .. tri(ok, v) .. "\""
end
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
          .. ",\"activity\":\"" .. tri(oko, oph) .. "\""
          .. ",\"moves\":" .. tostring(u:GetMovesRemaining()) .. "}")
      end
    end
  end
end
print("{\"kind\":\"spy-census\",\"total\":" .. n .. ",\"turn\":" .. Game.GetCurrentGameTurn() .. "}")
