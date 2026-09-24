-- InGame: every city of the Free Cities seat (and, for contrast, every
-- city at all when ZALL is 1): the amenity total, the need, the tier, and
-- every GetAmenitiesFrom* / GetAmenitiesLostFrom* getter the city panel
-- calls, so a total the named sources do not add up to shows its residue.
local getters = {"GetAmenitiesFromLuxuries", "GetAmenitiesFromEntertainment", "GetAmenitiesFromCivics",
  "GetAmenitiesFromGreatPeople", "GetAmenitiesFromCityStates", "GetAmenitiesFromReligion",
  "GetAmenitiesFromNationalParks", "GetAmenitiesFromStartingEra", "GetAmenitiesFromImprovements",
  "GetAmenitiesFromDistricts", "GetAmenitiesFromGovernors", "GetAmenitiesFromNaturalWonders",
  "GetAmenitiesFromTraits", "GetAmenitiesLostFromWarWeariness", "GetAmenitiesLostFromBankruptcy"}
local n = 0
for p = 0, 62 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() and (ZALL == 1 or pl:IsFreeCities()) then
    for _, c in pl:GetCities():Members() do
      local g = c:GetGrowth()
      local parts, sum = {}, 0
      for _, name in ipairs(getters) do
        local ok, v = pcall(function() return g[name](g) end)
        v = ok and v or 0
        if v ~= 0 then parts[#parts + 1] = name:gsub("GetAmenities", "") .. "=" .. v end
        if name:find("Lost") then sum = sum - v else sum = sum + v end
      end
      print(string.format("city p%d free=%s %s pop %d amen %d sum %d residue %d need %d tier %d | %s",
        p, tostring(pl:IsFreeCities()), c:GetName(), c:GetPopulation(), g:GetAmenities(), sum,
        g:GetAmenities() - sum, g:GetAmenitiesNeeded(), g:GetHappiness(), table.concat(parts, " ")))
      n = n + 1
    end
  end
end
print("turn " .. Game.GetCurrentGameTurn() .. " cities " .. n)
