-- InGame: calibrate how the DLL turns OccurrencesPerGame into a per-turn
-- chance. The accidents expose no chance reader, but the other random-event
-- families do — GameClimate:GetFloodPercentChance() and friends — and they are
-- driven by the SAME RandomEvent_Frequencies column. Printing the realised
-- chance beside the row's OccurrencesPerGame for every family that has both
-- gives the conversion, which then applies to the accidents by the same door.
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
local function T(f) return tri(pcall(f)) end
print("{\"kind\":\"rate\",\"turn\":" .. Game.GetCurrentGameTurn()
  .. ",\"maxTurns\":\"" .. T(function() return Game.GetMaxGameTurns() end) .. "\""
  .. ",\"gameSpeed\":\"" .. T(function() return GameConfiguration.GetGameSpeedType() end) .. "\"}")
print("{\"kind\":\"rate\",\"flood\":\"" .. T(function() return GameClimate.GetFloodPercentChance() end) .. "\""
  .. ",\"floodClimate\":\"" .. T(function() return GameClimate.GetFloodClimateIncreasedChance() end) .. "\""
  .. ",\"storm\":\"" .. T(function() return GameClimate.GetStormPercentChance() end) .. "\""
  .. ",\"drought\":\"" .. T(function() return GameClimate.GetDroughtPercentChance() end) .. "\""
  .. ",\"eruption\":\"" .. T(function() return GameClimate.GetEruptionPercentChance() end) .. "\""
  .. ",\"fire\":\"" .. T(function() return GameClimate.GetFirePercentChance() end) .. "\""
  .. ",\"climateLevel\":\"" .. T(function() return GameClimate.GetClimateChangeLevel() end) .. "\"}")
-- every frequency row at THIS game's realism setting, so the chances above can
-- be divided by the right OccurrencesPerGame
local realism = GameConfiguration.GetValue("GAME_REALISM")
local rname = "?"
for r in GameInfo.RealismSettings() do
  if tonumber(r.Index) == tonumber(realism) then rname = r.RealismSettingType end
end
print("{\"kind\":\"rate\",\"realismIndex\":\"" .. tostring(realism) .. "\",\"realism\":\"" .. rname .. "\"}")
for r in GameInfo.RandomEvent_Frequencies() do
  if tostring(r.RealismSettingType) == rname then
    print("{\"kind\":\"rate\",\"event\":\"" .. r.RandomEventType
      .. "\",\"occurrencesPerGame\":\"" .. tostring(r.OccurrencesPerGame) .. "\"}")
  end
end
-- what the manager says fired this turn, the instrument a sampling run needs
print("{\"kind\":\"rate\",\"currentTurnEvent\":\"" .. T(function() return GameRandomEvents.GetCurrentTurnEvent() end) .. "\""
  .. ",\"eventsForTurn\":\"" .. T(function() return GameRandomEvents.GetEventsForTurn(Game.GetCurrentGameTurn()) end) .. "\"}")
