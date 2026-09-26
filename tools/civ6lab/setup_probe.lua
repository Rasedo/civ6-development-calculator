-- FrontEnd / HostGame: the new game's setup, as the setup screen sees it.
-- AdvancedSetup.lua writes these through GameConfiguration, so the same keys
-- can be read (and possibly written) from the tuner while the game is being
-- configured — which is the only place a turn limit or a disaster intensity
-- can be chosen at all.
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
  print("{\"kind\":\"setup\",\"field\":\"" .. label .. "\",\"ok\":" .. tostring(ok)
    .. ",\"value\":\"" .. tri(ok, v) .. "\"}")
end
local acc = {}
local okg, gc = pcall(function() return GameConfiguration end)
if okg and gc ~= nil then
  for k, v in pairs(gc) do if type(k) == "string" then acc[#acc + 1] = k end end
  table.sort(acc)
  print("{\"kind\":\"setup\",\"GameConfiguration\":\"" .. table.concat(acc, " ") .. "\"}")
end
T("GetMaxTurns", function() return GameConfiguration.GetMaxTurns() end)
T("GAME_TURN_LIMIT_TYPE", function() return GameConfiguration.GetValue("GAME_TURN_LIMIT_TYPE") end)
T("GAME_MAX_TURNS", function() return GameConfiguration.GetValue("GAME_MAX_TURNS") end)
T("GAME_REALISM", function() return GameConfiguration.GetValue("GAME_REALISM") end)
T("GAME_START_ERA", function() return GameConfiguration.GetValue("GAME_START_ERA") end)
T("GAME_SPEED_TYPE", function() return GameConfiguration.GetValue("GAME_SPEED_TYPE") end)
T("GetGameSpeedType", function() return GameConfiguration.GetGameSpeedType() end)
T("MAP_SCRIPT", function() return GameConfiguration.GetValue("MAP_SCRIPT") end)
T("GetMapScript", function() return GameConfiguration.GetMapScript() end)
T("GAME_VICTORY_SCORE", function() return GameConfiguration.GetValue("VICTORY_SCORE") end)
T("GAME_NO_BARBARIANS", function() return GameConfiguration.GetValue("GAME_NO_BARBARIANS") end)
T("GAME_RANDOM_SEED", function() return GameConfiguration.GetValue("GAME_RANDOM_SEED") end)
T("GAME_SYNC_RANDOM_SEED", function() return GameConfiguration.GetValue("GAME_SYNC_RANDOM_SEED") end)
-- every parameter the setup screen knows about, if the query exists
local okp, params = pcall(function() return GameConfiguration.GetParameters() end)
if okp and type(params) == "table" then
  local names = {}
  for k, v in pairs(params) do names[#names + 1] = tostring(k) end
  table.sort(names)
  print("{\"kind\":\"setup\",\"parameters\":\"" .. table.concat(names, " ") .. "\"}")
end
