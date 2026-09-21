-- GameCore_Tuner: is the realism (disaster intensity) setting readable and
-- SETTABLE at runtime? If it is, the per-turn disaster chances can be read at
-- every intensity inside one game, and measuring at max costs nothing — the
-- default setting is then a read, not a second campaign.
-- Also prints the chance readers so any change is visible immediately.
--   --set ZSET=-1   (read only)    --set ZSET=4   (try to set intensity 4)
local function T(label, f)
  local ok, v = pcall(f)
  print("{\"kind\":\"realism\",\"field\":\"" .. label .. "\",\"ok\":" .. tostring(ok)
    .. ",\"value\":\"" .. tostring(ok and v or "err") .. "\"}")
end
local function chances(tag)
  print("{\"kind\":\"realism\",\"stage\":\"" .. tag .. "\""
    .. ",\"flood\":\"" .. tostring(select(2, pcall(function() return GameClimate.GetFloodPercentChance() end)))
    .. "\",\"storm\":\"" .. tostring(select(2, pcall(function() return GameClimate.GetStormPercentChance() end)))
    .. "\",\"drought\":\"" .. tostring(select(2, pcall(function() return GameClimate.GetDroughtPercentChance() end)))
    .. "\",\"eruption\":\"" .. tostring(select(2, pcall(function() return GameClimate.GetEruptionPercentChance() end)))
    .. "\",\"fire\":\"" .. tostring(select(2, pcall(function() return GameClimate.GetFirePercentChance() end)))
    .. "\",\"floodClimateInc\":\"" .. tostring(select(2, pcall(function() return GameClimate.GetFloodClimateIncreasedChance() end)))
    .. "\",\"stormClimateInc\":\"" .. tostring(select(2, pcall(function() return GameClimate.GetStormClimateIncreasedChance() end)))
    .. "\",\"droughtClimateInc\":\"" .. tostring(select(2, pcall(function() return GameClimate.GetDroughtClimateIncreasedChance() end)))
    .. "\",\"climateLevel\":\"" .. tostring(select(2, pcall(function() return GameClimate.GetClimateChangeLevel() end)))
    .. "\",\"climateFromRealism\":\"" .. tostring(select(2, pcall(function() return GameClimate.GetClimateChangeFromRealism() end))) .. "\"}")
end
T("cfg GAME_REALISM", function() return GameConfiguration.GetValue("GAME_REALISM") end)
chances("before")
if ZSET >= 0 then
  T("SetValue GAME_REALISM", function() GameConfiguration.SetValue("GAME_REALISM", ZSET) return "sent" end)
  T("cfg GAME_REALISM after", function() return GameConfiguration.GetValue("GAME_REALISM") end)
  chances("after")
end
