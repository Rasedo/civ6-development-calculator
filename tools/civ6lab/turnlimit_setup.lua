-- FrontEnd: read (and optionally set) the NEW game's turn limit. The setup
-- screen's own automation does
--   GameConfiguration.SetTurnLimitType(TurnLimitTypes.CUSTOM)
--   GameConfiguration.SetMaxTurns(n)
-- (Base/Assets/UI/Automation/Automation_StandardTests.lua:220), so the same two
-- calls choose how long the game runs — including whatever value means "no
-- limit". Prints the enum first so the choice is made from real values.
--   --set ZSET=0 --set ZTURNS=0 --set ZTYPE=0
local acc = {}
local okt, tl = pcall(function() return TurnLimitTypes end)
if okt and tl ~= nil then
  for k, v in pairs(tl) do acc[#acc + 1] = k .. "=" .. tostring(v) end
  table.sort(acc)
  print("{\"kind\":\"turnlimit\",\"TurnLimitTypes\":\"" .. table.concat(acc, " ") .. "\"}")
else
  print("{\"kind\":\"turnlimit\",\"TurnLimitTypes\":\"nil\"}")
end
local function report(tag)
  print("{\"kind\":\"turnlimit\",\"stage\":\"" .. tag
    .. "\",\"turnLimitType\":\"" .. tostring(select(2, pcall(function() return GameConfiguration.GetTurnLimitType() end)))
    .. "\",\"maxTurns\":\"" .. tostring(select(2, pcall(function() return GameConfiguration.GetMaxTurns() end)))
    .. "\",\"startEra\":\"" .. tostring(select(2, pcall(function() return GameConfiguration.GetStartEra() end)))
    .. "\",\"speed\":\"" .. tostring(select(2, pcall(function() return GameConfiguration.GetGameSpeedType() end)))
    .. "\",\"realism\":\"" .. tostring(select(2, pcall(function() return GameConfiguration.GetValue("GAME_REALISM") end))) .. "\"}")
end
report("before")
if ZSET == 1 then
  pcall(function() GameConfiguration.SetTurnLimitType(ZTYPE) end)
  pcall(function() GameConfiguration.SetMaxTurns(ZTURNS) end)
  report("after")
end
