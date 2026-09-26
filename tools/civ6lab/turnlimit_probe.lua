-- GameCore_Tuner: can the turn limit be lifted on the CURRENT save, instead of
-- starting a new game? Game.GetMaxGameTurns() reads 250 here. This reads every
-- configuration key that could carry it and tries the obvious setters, then
-- re-reads the limit so a silent no-op is visible.
--   --set ZTRY=0   (read only)   --set ZTRY=1   (attempt the setters)
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
  print("{\"kind\":\"turnlimit\",\"field\":\"" .. label .. "\",\"ok\":" .. tostring(ok)
    .. ",\"value\":\"" .. tri(ok, v) .. "\"}")
end
T("Game.GetMaxGameTurns", function() return Game.GetMaxGameTurns() end)
T("cfg GAME_MAX_TURNS", function() return GameConfiguration.GetValue("GAME_MAX_TURNS") end)
T("cfg GAME_TURN_LIMIT_TYPE", function() return GameConfiguration.GetValue("GAME_TURN_LIMIT_TYPE") end)
T("cfg GAME_TURN_LIMIT", function() return GameConfiguration.GetValue("GAME_TURN_LIMIT") end)
T("GameConfiguration.GetMaxTurns", function() return GameConfiguration.GetMaxTurns() end)
T("GameConfiguration.GetTurnLimitType", function() return GameConfiguration.GetTurnLimitType() end)
T("victory SCORE enabled", function() return Game.IsVictoryEnabled("VICTORY_SCORE") end)
T("defeat enabled", function() return Game.IsDefeatEnabled("DEFEAT_SCORE") end)
if ZTRY == 1 then
  T("SetValue GAME_MAX_TURNS=9999", function()
    GameConfiguration.SetValue("GAME_MAX_TURNS", 9999) return "sent" end)
  T("SetValue GAME_TURN_LIMIT=9999", function()
    GameConfiguration.SetValue("GAME_TURN_LIMIT", 9999) return "sent" end)
  T("SetMaxTurns(9999)", function() GameConfiguration.SetMaxTurns(9999) return "sent" end)
  T("re-read Game.GetMaxGameTurns", function() return Game.GetMaxGameTurns() end)
  T("re-read cfg GAME_MAX_TURNS", function() return GameConfiguration.GetValue("GAME_MAX_TURNS") end)
end
