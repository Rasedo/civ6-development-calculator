-- InGame: the SIDE EFFECTS of having launched. Both engines raise a Nuclear
-- Emergency against the LAUNCHER's own capital and add war weariness per
-- launch (GlobalParameters WAR_WEARINESS_PER_WMD_LAUNCHED = 10); 21 warheads
-- have gone off this session and nobody has looked. Reads whatever the live
-- game exposes about emergencies, grievances and war weariness for player 0.
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
local function T(label, f)
  local ok, v = pcall(f)
  print("{\"kind\":\"launch-state\",\"field\":\"" .. label .. "\",\"ok\":" .. tostring(ok)
    .. ",\"value\":\"" .. tri(ok, v) .. "\"}")
end
T("emergencyCount", function() return Game.GetEmergencyManager():GetNumEmergencies() end)
T("emergenciesForPlayer", function() return #Game.GetEmergencyManager():GetEmergenciesForPlayer(0) end)
T("warWeariness1", function() return Players[0]:GetCulture():GetWarWeariness(1) end)
T("amenitiesLostWarWeariness", function()
  local c = Players[0]:GetCities()
  for _, x in c:Members() do return x:GetGrowth():GetAmenitiesLostFromWarWeariness() end
end)
T("grievances1", function() return Players[0]:GetDiplomacy():GetGrievancesAgainst(1) end)
T("grievancesAgainstMe1", function() return Players[1]:GetDiplomacy():GetGrievancesAgainst(0) end)
-- the emergency manager's own names, so a failed call above is a spelling
-- problem rather than an absence
local ok, em = pcall(function() return Game.GetEmergencyManager() end)
if ok and em ~= nil then
  local acc = {}
  local mt = getmetatable(em)
  local okx, idx = pcall(function() return mt["__index"] end)
  if okx and type(idx) == "table" then
    for k, _ in pairs(idx) do if type(k) == "string" then acc[#acc + 1] = k end end
  end
  table.sort(acc)
  print("{\"kind\":\"launch-state\",\"emergencyManager\":\"" .. table.concat(acc, " ") .. "\"}")
else
  print("{\"kind\":\"launch-state\",\"emergencyManager\":\"nil\"}")
end
