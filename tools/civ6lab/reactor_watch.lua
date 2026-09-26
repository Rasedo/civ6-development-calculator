-- GameCore_Tuner: ask 4's reader. The fallout manager carries the reactor API
--   GetReactorCount() / GetReactorByIndex(i) / GetReactorAge(?) /
--   GetReactorAccidentThreshold(?) / GetFalloutDamageOverride(?)
-- and nobody knows what GetReactorByIndex returns, so its TYPE and value are
-- printed first and then fed to the other two both ways (as the handle it
-- returned, and as a plot index) — whichever answers is the signature.
--   --set ZTAG=t0
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
local fm = Game.GetFalloutManager()
local n = -1
local okn, cnt = pcall(function() return fm:GetReactorCount() end)
if okn and cnt ~= nil then n = cnt end
print("{\"kind\":\"reactor-watch\",\"stage\":\"ZTAG\",\"turn\":" .. Game.GetCurrentGameTurn()
  .. ",\"reactorCount\":" .. n .. "}")
for i = 0, math.max(n - 1, -1) do
  local okr, h = pcall(function() return fm:GetReactorByIndex(i) end)
  local htype = okr and type(h) or tri(okr, h)
  local hval = "?"
  if okr and type(h) == "number" then hval = tostring(h) end
  if okr and type(h) == "table" then
    local acc = {}
    for k, v in pairs(h) do acc[#acc + 1] = tostring(k) .. "=" .. tostring(v) end
    table.sort(acc)
    hval = table.concat(acc, " ")
  end
  local function T(f) return tri(pcall(f)) end
  local where = "?"
  if okr and type(h) == "number" then
    local okp, q = pcall(function() return Map.GetPlotByIndex(h) end)
    if okp and q ~= nil then where = q:GetX() .. ":" .. q:GetY() end
  end
  print("{\"kind\":\"reactor-watch\",\"stage\":\"ZTAG\",\"i\":" .. i
    .. ",\"handleType\":\"" .. htype .. "\",\"handle\":\"" .. hval .. "\",\"plot\":\"" .. where .. "\""
    .. ",\"ageByHandle\":\"" .. T(function() return fm:GetReactorAge(h) end) .. "\""
    .. ",\"ageByIndex\":\"" .. T(function() return fm:GetReactorAge(i) end) .. "\""
    .. ",\"thresholdByHandle\":\"" .. T(function() return fm:GetReactorAccidentThreshold(h) end) .. "\""
    .. ",\"thresholdByIndex\":\"" .. T(function() return fm:GetReactorAccidentThreshold(i) end) .. "\""
    .. ",\"damageOverride\":\"" .. T(function() return fm:GetFalloutDamageOverride() end) .. "\"}")
end
