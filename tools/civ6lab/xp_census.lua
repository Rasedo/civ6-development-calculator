-- GameCore_Tuner: which units can earn experience at all, and what the shipped
-- experience constants are. A zero XP gain after a real anti-air attack means
-- either "interception awards none" or "this unit cannot earn any" -- the
-- database tells them apart.
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
local off = {}
for r in GameInfo.Units() do
  if r.CanEarnExperience == false then off[#off + 1] = "\"" .. r.UnitType .. "\"" end
end
print("{\"kind\":\"xpcensus\",\"cannotEarnXP\":" .. #off .. ",\"units\":[" .. table.concat(off, ",") .. "]}")
local want = { "EXPERIENCE_COMBAT_RANGED", "EXPERIENCE_NOT_COMBAT_RANGED",
  "EXPERIENCE_COMBAT_ATTACKER_BONUS", "EXPERIENCE_KILL_BONUS",
  "EXPERIENCE_MAXIMUM_ONE_COMBAT", "EXPERIENCE_ACTIVATE_GOODY_HUT",
  "EXPERIENCE_REVEAL_NATURAL_WONDER", "EXPERIENCE_CITY_CAPTURED",
  "EXPERIENCE_DISTRICT_VS_UNIT", "EXPERIENCE_MAX_BARB_LEVEL",
  "EXPERIENCE_BARB_SOFT_CAP", "EXPERIENCE_NEEDED_FOR_NEXT_LEVEL_MULTIPLIER" }
local vals = {}
for _, n in ipairs(want) do
  local ok, v = pcall(function() return GlobalParameters[n] end)
  vals[#vals + 1] = "\"" .. n .. "\":" .. trij(ok, v)
end
print("{\"kind\":\"xpparams\"," .. table.concat(vals, ",") .. "}")
