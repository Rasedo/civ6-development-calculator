-- GameCore_Tuner: Gathering Storm keeps resource upkeep and a few other unit
-- facts in a SEPARATE table, Units_XP2, so GameInfo.Units reports nil for them.
-- This prints whichever of the candidate tables exists, for the anti-air units
-- and for a unit known to be unable to earn experience.
local want = { UNIT_ANTIAIR_GUN = true, UNIT_MOBILE_SAM = true,
  UNIT_GIANT_DEATH_ROBOT = true, UNIT_DESTROYER = true, UNIT_MISSILE_CRUISER = true,
  UNIT_BUILDER = true, UNIT_WARRIOR = true }
for _, tbl in ipairs({ "Units_XP1", "Units_XP2", "Units" }) do
  local ok, it = pcall(function() return GameInfo[tbl] end)
  if ok and it ~= nil then
    local rows = {}
    for r in it() do
      if want[r.UnitType] then
        local parts = {}
        for _, col in ipairs({ "ResourceMaintenanceType", "ResourceMaintenanceAmount",
                               "ResourceCost", "CanEarnExperience", "AntiAirCombat" }) do
          local okc, v = pcall(function() return r[col] end)
          if okc and v ~= nil then parts[#parts + 1] = "\"" .. col .. "\":\"" .. tostring(v) .. "\"" end
        end
        if #parts > 0 then
          rows[#rows + 1] = "{\"u\":\"" .. r.UnitType .. "\"," .. table.concat(parts, ",") .. "}"
        end
      end
    end
    print("{\"kind\":\"xp2probe\",\"table\":\"" .. tbl .. "\",\"rows\":[" .. table.concat(rows, ",") .. "]}")
  else
    print("{\"kind\":\"xp2probe\",\"table\":\"" .. tbl .. "\",\"exists\":false}")
  end
end
