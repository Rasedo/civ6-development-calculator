-- InGame: read a city centre's defence strength with FULL precision.
-- GetDefenseStrength() is printed with %.6f (and with %s beside it), so a
-- half point from COMBAT_POPULATION_PER_STRENGTH = 2 on an odd population
-- would be visible rather than hidden by tostring's integer formatting.
--   --set ZX=36 --set ZY=15
local c = Cities.GetCityInPlot(ZX, ZY)
if c == nil then print("{\"kind\":\"fracread\",\"error\":\"nocity\"}") return end
local function show(f)
  local ok, v = pcall(f)
  if not ok or type(v) ~= "number" then return "null,\"raw\":\"" .. tostring(ok and v or "err") .. "\"" end
  return string.format("%.6f", v) .. ",\"raw\":\"" .. tostring(v) .. "\""
end
for _, d in c:GetDistricts():Members() do
  local t = GameInfo.Districts[d:GetType()]
  if t and t.DistrictType == "DISTRICT_CITY_CENTER" then
    print("{\"kind\":\"fracread\",\"at\":\"" .. ZX .. ":" .. ZY .. "\",\"pop\":" .. c:GetPopulation()
      .. ",\"def\":" .. show(function() return d:GetDefenseStrength() end)
      .. ",\"outerMax\":" .. string.format("%.6f", d:GetMaxDamage(DefenseTypes.DISTRICT_OUTER))
      .. "}")
  end
end
