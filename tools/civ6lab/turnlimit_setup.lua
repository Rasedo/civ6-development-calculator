-- FrontEnd: read (and optionally set) the NEW game's turn limit. The setup
-- screen's own automation does
--   GameConfiguration.SetTurnLimitType(TurnLimitTypes.CUSTOM)
--   GameConfiguration.SetMaxTurns(n)
-- (Base/Assets/UI/Automation/Automation_StandardTests.lua:220), so the same two
-- calls choose how long the game runs — including whatever value means "no
-- limit". Prints the enum first so the choice is made from real values.
--   --set ZSET=0 --set ZTURNS=0 --set ZTYPE=0
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
    .. "\",\"turnLimitType\":\"" .. tri(pcall(function() return GameConfiguration.GetTurnLimitType() end))
    .. "\",\"maxTurns\":\"" .. tri(pcall(function() return GameConfiguration.GetMaxTurns() end))
    .. "\",\"startEra\":\"" .. tri(pcall(function() return GameConfiguration.GetStartEra() end))
    .. "\",\"speed\":\"" .. tri(pcall(function() return GameConfiguration.GetGameSpeedType() end))
    .. "\",\"realism\":\"" .. tri(pcall(function() return GameConfiguration.GetValue("GAME_REALISM") end)) .. "\"}")
end
report("before")
if ZSET == 1 then
  pcall(function() GameConfiguration.SetTurnLimitType(ZTYPE) end)
  pcall(function() GameConfiguration.SetMaxTurns(ZTURNS) end)
  report("after")
end
