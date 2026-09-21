-- InGame: what governs how OFTEN a reactor accident fires? Reads, in order:
--   * whether a city may hold more than one Industrial Zone (the OnePerCity
--     column), which decides whether a sample of N reactors means N cities
--   * every column the three accident rows actually carry, in case a rate
--     lives there next to Severity / MinTurnAtRisk
--   * the game's realism setting and the per-game occurrence caps, which may
--     be the whole law: "at most N per game" rather than a per-turn chance
--   * the random-event manager's own names, for an occurrence counter
local d = GameInfo.Districts["DISTRICT_INDUSTRIAL_ZONE"]
print("{\"kind\":\"law\",\"district\":\"DISTRICT_INDUSTRIAL_ZONE\",\"OnePerCity\":\"" .. tostring(d.OnePerCity)
  .. "\",\"RequiresPopulation\":\"" .. tostring(d.RequiresPopulation) .. "\"}")
local b = GameInfo.Buildings["BUILDING_POWER_PLANT"]
local acc = {}
for k, v in pairs(b) do acc[#acc + 1] = tostring(k) .. "=" .. tostring(v) end
table.sort(acc)
print("{\"kind\":\"law\",\"powerPlantRow\":\"" .. table.concat(acc, " ") .. "\"}")
for r in GameInfo.RandomEvents() do
  if string.find(r.RandomEventType or "", "NUCLEAR_ACCIDENT", 1, true) then
    local a = {}
    for k, v in pairs(r) do a[#a + 1] = tostring(k) .. "=" .. tostring(v) end
    table.sort(a)
    print("{\"kind\":\"law\",\"event\":\"" .. r.RandomEventType .. "\",\"row\":\"" .. table.concat(a, " ") .. "\"}")
  end
end
local okr, rs = pcall(function() return GameConfiguration.GetValue("GAME_REALISM") end)
print("{\"kind\":\"law\",\"realismSetting\":\"" .. tostring(okr and rs or "err") .. "\"}")
for r in GameInfo.RandomEvent_RealismSettings() do
  if string.find(r.RandomEventType or "", "NUCLEAR_ACCIDENT", 1, true) then
    print("{\"kind\":\"law\",\"cap\":\"" .. r.RandomEventType .. "\",\"realism\":\"" .. tostring(r.RealismSettingType)
      .. "\",\"occurrencesPerGame\":\"" .. tostring(r.OccurrencesPerGame) .. "\"}")
  end
end
local okg, gre = pcall(function() return GameRandomEvents end)
if okg and gre ~= nil then
  local names = {}
  for k, v in pairs(gre) do if type(k) == "string" then names[#names + 1] = k end end
  table.sort(names)
  print("{\"kind\":\"law\",\"GameRandomEvents\":\"" .. table.concat(names, " ") .. "\"}")
end
