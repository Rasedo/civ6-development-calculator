-- Any state: the RANDOMNESS surface. Before measuring any single law, find out
-- which of the game's own random entry points the tuner can reach — a direct
-- RNG call would let the generator itself be sampled, rather than inferred
-- from a mechanic's outcomes.
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
local function keys(label, o)
  if o == nil then print("{\"kind\":\"rng\",\"" .. label .. "\":\"nil\"}") return end
  local acc = {}
  local mt = getmetatable(o)
  local okx, idx = pcall(function() return mt and mt["__index"] end)
  local src = (okx and type(idx) == "table") and idx or o
  for k, v in pairs(src) do if type(k) == "string" then acc[#acc + 1] = k end end
  table.sort(acc)
  print("{\"kind\":\"rng\",\"" .. label .. "\":\"" .. table.concat(acc, " ") .. "\"}")
end
keys("Game", Game)
local function T(label, f)
  local ok, v = pcall(f)
  print("{\"kind\":\"rng\",\"call\":\"" .. label .. "\",\"ok\":" .. tostring(ok)
    .. ",\"value\":\"" .. tri(ok, v) .. "\"}")
end
T("Game.GetRandNum(100)", function() return Game.GetRandNum(100, "lab") end)
T("Game.GetRandNum(6)", function() return Game.GetRandNum(6, "lab") end)
T("Map.GetRandomSeed", function() return Map.GetRandomSeed() end)
T("Game.GetTurnRandomSeed", function() return Game.GetTurnRandomSeed() end)
T("GameConfiguration.GetValue(GAME_SYNC_SEED)", function() return GameConfiguration.GetValue("GAME_SYNC_SEED") end)
T("GameConfiguration.GetValue(GAME_RANDOM_SEED)", function() return GameConfiguration.GetValue("GAME_RANDOM_SEED") end)
