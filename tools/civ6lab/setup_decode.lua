-- FrontEnd: decode the setup's hashes into names, so the game that is about to
-- start is on the record: era, speed, map, players, and the turn limit the
-- menus do not expose.
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
local function nameFor(tbl, hash, field)
  local ok, it = pcall(function() return GameInfo[tbl]() end)
  if not ok or it == nil then return "?" end
  for r in GameInfo[tbl]() do
    if r.Hash == hash then return tostring(r[field]) end
  end
  return "unmatched(" .. tostring(hash) .. ")"
end
local era = GameConfiguration.GetStartEra()
local speed = GameConfiguration.GetGameSpeedType()
local tlt = GameConfiguration.GetTurnLimitType()
local tltName = "?"
for k, v in pairs(TurnLimitTypes) do if v == tlt then tltName = k end end
print("{\"kind\":\"setupdecode\""
  .. ",\"startEra\":\"" .. nameFor("Eras", era, "EraType") .. "\""
  .. ",\"gameSpeed\":\"" .. nameFor("GameSpeeds", speed, "GameSpeedType") .. "\""
  .. ",\"turnLimitType\":\"" .. tltName .. "\""
  .. ",\"maxTurns\":" .. tostring(GameConfiguration.GetMaxTurns())
  .. ",\"realism\":\"" .. tostring(GameConfiguration.GetValue("GAME_REALISM")) .. "\""
  .. ",\"humans\":" .. tostring(GameConfiguration.GetHumanPlayerCount())
  .. ",\"ai\":" .. tostring(GameConfiguration.GetAIPlayerCount())
  .. ",\"participants\":" .. tostring(GameConfiguration.GetParticipatingPlayerCount())
  .. ",\"ruleset\":\"" .. tostring(GameConfiguration.GetRuleSet()) .. "\""
  .. ",\"startTurn\":" .. tostring(GameConfiguration.GetStartTurn()) .. "}")
for _, key in ipairs({ "GAME_NO_BARBARIANS", "GAME_NO_DISASTERS", "MAP_SCRIPT_NAME", "GAME_DIFFICULTY",
                       "GAME_START_YEAR", "GAME_SYNC_RANDOM_SEED", "GAME_RANDOM_SEED" }) do
  local ok, v = pcall(function() return GameConfiguration.GetValue(key) end)
  print("{\"kind\":\"setupdecode\",\"key\":\"" .. key .. "\",\"value\":\"" .. tri(ok, v) .. "\"}")
end
