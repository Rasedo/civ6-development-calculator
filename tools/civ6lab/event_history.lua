-- InGame: the whole game's random-event history, tallied. GetEventsForTurn(t)
-- returns ONE record per turn carrying `RandomEvent` (an index into
-- GameInfo.RandomEvents) plus what it did, so walking every turn played gives
-- the observed count of each event against its RandomEvent_Frequencies
-- OccurrencesPerGame — the only empirical handle on how the DLL converts a
-- per-game rate into a per-turn chance, and therefore on the accident rate.
local now = Game.GetCurrentGameTurn()
local tally, turnsWithEvent = {}, 0
for t = 1, now do
  local ok, e = pcall(function() return GameRandomEvents.GetEventsForTurn(t) end)
  if ok and type(e) == "table" and e.RandomEvent ~= nil then
    local idx = e.RandomEvent
    tally[idx] = (tally[idx] or 0) + 1
    turnsWithEvent = turnsWithEvent + 1
  end
end
local maxTurns = Game.GetMaxGameTurns()
print("{\"kind\":\"history\",\"turnsPlayed\":" .. now .. ",\"maxTurns\":" .. tostring(maxTurns)
  .. ",\"turnsWithAnEvent\":" .. turnsWithEvent .. "}")
-- one line per event type seen, with its parameter beside the observation
local realism = GameConfiguration.GetValue("GAME_REALISM")
local rname = "?"
for r in GameInfo.RealismSettings() do
  if tonumber(r.Index) == tonumber(realism) then rname = r.RealismSettingType end
end
local rate = {}
for r in GameInfo.RandomEvent_Frequencies() do
  if tostring(r.RealismSettingType) == rname then rate[r.RandomEventType] = r.OccurrencesPerGame end
end
for idx, n in pairs(tally) do
  local row = GameInfo.RandomEvents[idx]
  local name = row and row.RandomEventType or ("index" .. tostring(idx))
  print("{\"kind\":\"history\",\"event\":\"" .. name .. "\",\"index\":" .. tostring(idx)
    .. ",\"observed\":" .. n .. ",\"occurrencesPerGame\":\"" .. tostring(rate[name]) .. "\"}")
end
