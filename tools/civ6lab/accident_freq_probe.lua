-- InGame: the accident RATE. Each random event row points at a
-- RandomEvent_Frequencies collection keyed by realism setting, whose column is
-- OccurrencesPerGame — a rate, not a cap (the flood rows carry values like
-- ".6"). This reads the three accident rows against THIS game's realism
-- setting, the setting table's own order, and whatever counter the random
-- event manager exposes.
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
for r in GameInfo.RandomEvent_Frequencies() do
  if string.find(r.RandomEventType or "", "NUCLEAR_ACCIDENT", 1, true) then
    print("{\"kind\":\"freq\",\"event\":\"" .. r.RandomEventType
      .. "\",\"realism\":\"" .. tostring(r.RealismSettingType)
      .. "\",\"occurrencesPerGame\":\"" .. tostring(r.OccurrencesPerGame) .. "\"}")
  end
end
local i = 0
for r in GameInfo.RealismSettings() do
  print("{\"kind\":\"freq\",\"realismRow\":" .. i .. ",\"type\":\"" .. tostring(r.RealismSettingType)
    .. "\",\"index\":\"" .. tostring(r.Index) .. "\",\"name\":\"" .. tostring(r.Name) .. "\"}")
  i = i + 1
end
local okr, rs = pcall(function() return GameConfiguration.GetValue("GAME_REALISM") end)
print("{\"kind\":\"freq\",\"gameRealismValue\":\"" .. tri(okr, rs) .. "\"}")
local okg, gre = pcall(function() return GameRandomEvents end)
if okg and gre ~= nil then
  local names = {}
  for k, v in pairs(gre) do if type(k) == "string" then names[#names + 1] = k end end
  table.sort(names)
  print("{\"kind\":\"freq\",\"GameRandomEvents\":\"" .. table.concat(names, " ") .. "\"}")
end
local okc, cm = pcall(function() return GameClimate end)
if okc and cm ~= nil then
  local names = {}
  local mt = getmetatable(cm)
  local okx, idx = pcall(function() return mt and mt["__index"] end)
  local src = (okx and type(idx) == "table") and idx or cm
  for k, v in pairs(src) do if type(k) == "string" then names[#names + 1] = k end end
  table.sort(names)
  print("{\"kind\":\"freq\",\"GameClimate\":\"" .. table.concat(names, " ") .. "\"}")
end
