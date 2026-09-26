-- GameCore_Tuner: is the realism (disaster intensity) setting readable and
-- SETTABLE at runtime? If it is, the per-turn disaster chances can be read at
-- every intensity inside one game, and measuring at max costs nothing — the
-- default setting is then a read, not a second campaign.
-- Also prints the chance readers so any change is visible immediately.
--   --set ZSET=-1   (read only)    --set ZSET=4   (try to set intensity 4)
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
  print("{\"kind\":\"realism\",\"field\":\"" .. label .. "\",\"ok\":" .. tostring(ok)
    .. ",\"value\":\"" .. tri(ok, v) .. "\"}")
end
local function chances(tag)
  print("{\"kind\":\"realism\",\"stage\":\"" .. tag .. "\""
    .. ",\"flood\":\"" .. tri(pcall(function() return GameClimate.GetFloodPercentChance() end))
    .. "\",\"storm\":\"" .. tri(pcall(function() return GameClimate.GetStormPercentChance() end))
    .. "\",\"drought\":\"" .. tri(pcall(function() return GameClimate.GetDroughtPercentChance() end))
    .. "\",\"eruption\":\"" .. tri(pcall(function() return GameClimate.GetEruptionPercentChance() end))
    .. "\",\"fire\":\"" .. tri(pcall(function() return GameClimate.GetFirePercentChance() end))
    .. "\",\"floodClimateInc\":\"" .. tri(pcall(function() return GameClimate.GetFloodClimateIncreasedChance() end))
    .. "\",\"stormClimateInc\":\"" .. tri(pcall(function() return GameClimate.GetStormClimateIncreasedChance() end))
    .. "\",\"droughtClimateInc\":\"" .. tri(pcall(function() return GameClimate.GetDroughtClimateIncreasedChance() end))
    .. "\",\"climateLevel\":\"" .. tri(pcall(function() return GameClimate.GetClimateChangeLevel() end))
    .. "\",\"climateFromRealism\":\"" .. tri(pcall(function() return GameClimate.GetClimateChangeFromRealism() end)) .. "\"}")
end
T("cfg GAME_REALISM", function() return GameConfiguration.GetValue("GAME_REALISM") end)
chances("before")
if ZSET >= 0 then
  T("SetValue GAME_REALISM", function() GameConfiguration.SetValue("GAME_REALISM", ZSET) return "sent" end)
  T("cfg GAME_REALISM after", function() return GameConfiguration.GetValue("GAME_REALISM") end)
  chances("after")
end
