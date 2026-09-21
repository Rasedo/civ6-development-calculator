-- GameCore_Tuner: ask 4's reader. The fallout manager carries the reactor API
--   GetReactorCount() / GetReactorByIndex(i) / GetReactorAge(?) /
--   GetReactorAccidentThreshold(?) / GetFalloutDamageOverride(?)
-- and nobody knows what GetReactorByIndex returns, so its TYPE and value are
-- printed first and then fed to the other two both ways (as the handle it
-- returned, and as a plot index) — whichever answers is the signature.
--   --set ZTAG=t0
local fm = Game.GetFalloutManager()
local n = -1
local okn, cnt = pcall(function() return fm:GetReactorCount() end)
if okn and cnt ~= nil then n = cnt end
print("{\"kind\":\"reactor-watch\",\"stage\":\"ZTAG\",\"turn\":" .. Game.GetCurrentGameTurn()
  .. ",\"reactorCount\":" .. n .. "}")
for i = 0, math.max(n - 1, -1) do
  local okr, h = pcall(function() return fm:GetReactorByIndex(i) end)
  local htype = okr and type(h) or "err"
  local hval = "?"
  if okr and type(h) == "number" then hval = tostring(h) end
  if okr and type(h) == "table" then
    local acc = {}
    for k, v in pairs(h) do acc[#acc + 1] = tostring(k) .. "=" .. tostring(v) end
    table.sort(acc)
    hval = table.concat(acc, " ")
  end
  local function T(f)
    local ok, v = pcall(f)
    if ok and v ~= nil then return tostring(v) end
    return "err"
  end
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
