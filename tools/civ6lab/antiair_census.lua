-- InGame: every unit in the live database that can make an anti-air attack, and
-- every unit that can carry or launch a WMD. Together these define the test
-- matrix for interception: which channels can shoot, and which can deliver.
local aa, wmd, air = {}, {}, {}
for r in GameInfo.Units() do
  if (r.AntiAirCombat or 0) > 0 then
    aa[#aa + 1] = r.UnitType:gsub("UNIT_", "") .. "(aa=" .. tostring(r.AntiAirCombat)
      .. ",cs=" .. tostring(r.Combat) .. ",dom=" .. tostring(r.Domain):gsub("DOMAIN_", "") .. ")"
  end
  if r.Domain == "DOMAIN_AIR" then
    air[#air + 1] = r.UnitType:gsub("UNIT_", "") .. "(cs=" .. tostring(r.Combat)
      .. ",range=" .. tostring(r.Range) .. ")"
  end
end
print("{\"kind\":\"aa\",\"antiAirUnits\":\"" .. table.concat(aa, " ") .. "\"}")
print("{\"kind\":\"aa\",\"airUnits\":\"" .. table.concat(air, " ") .. "\"}")
-- who may carry a WMD, from the build/launch side
for r in GameInfo.Units() do
  local t = r.UnitType
  if string.find(t, "NUCLEAR", 1, true) or string.find(t, "MISSILE", 1, true)
     or string.find(t, "BOMBER", 1, true) or string.find(t, "SUBMARINE", 1, true) then
    wmd[#wmd + 1] = t:gsub("UNIT_", "") .. "(dom=" .. tostring(r.Domain):gsub("DOMAIN_", "")
      .. ",range=" .. tostring(r.Range) .. ")"
  end
end
print("{\"kind\":\"aa\",\"deliveryCandidates\":\"" .. table.concat(wmd, " ") .. "\"}")
-- the improvement that launches, and the command a CITY can issue
local silo = GameInfo.Improvements["IMPROVEMENT_MISSILE_SILO"]
print("{\"kind\":\"aa\",\"silo\":\"" .. tostring(silo and silo.ImprovementType or "none")
  .. "\",\"siloIndex\":" .. tostring(silo and silo.Index or -1)
  .. ",\"cityWmdStrike\":\"" .. tostring(CityCommandTypes.WMD_STRIKE) .. "\"}")
