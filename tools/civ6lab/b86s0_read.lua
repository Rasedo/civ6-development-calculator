-- InGame, once a turn for B-86-S0 (raising an emergency): for every major p,
-- `Game.GetEmergencyManager():GetEmergencyInfoTable(p)` flattened (the
-- diplomacy view's call), and the World Congress's emergencies
-- (`GetWorldCongress():GetEmergencies(ZSEAT)`, WorldCongressPopup.lua) and
-- meeting status, one JSON line each. Every read prints its value or
-- "err:<msg>".
--   --set ZSEAT=0
local function esc(s) return (tostring(s):gsub('[%c"\\]', function(c) return string.format("\\u%04x", c:byte()) end)) end
local function flat(v, depth)
  if type(v) ~= "table" then return esc(v) end
  if depth > 3 then return "<deep>" end
  local parts = {}
  for k, x in pairs(v) do parts[#parts + 1] = esc(k) .. ":" .. flat(x, depth + 1) end
  table.sort(parts)
  return "{" .. table.concat(parts, ",") .. "}"
end
local turn = Game.GetCurrentGameTurn()
local em = Game.GetEmergencyManager()
for p = 0, 62 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() and pl:IsMajor() then
    local ok, t = pcall(function() return em:GetEmergencyInfoTable(p) end)
    local n = 0
    if ok and type(t) == "table" then for _ in pairs(t) do n = n + 1 end end
    print(string.format('{"kind":"emergency","turn":%d,"p":%d,"n":%d,"table":"%s"}', turn, p, n,
      ok and flat(t, 0) or ("err:" .. esc(tostring(t):match("[^\n]*")))))
  end
end
local wc = Game.GetWorldCongress()
local ok1, e = pcall(function() return wc:GetEmergencies(ZSEAT) end)
print(string.format('{"kind":"wc_emergencies","turn":%d,"value":"%s"}', turn, ok1 and flat(e, 0) or ("err:" .. esc(tostring(e):match("[^\n]*")))))
local ok2, m = pcall(function() return wc:GetMeetingStatus() end)
print(string.format('{"kind":"wc_meeting","turn":%d,"value":"%s"}', turn, ok2 and flat(m, 0) or ("err:" .. esc(tostring(m):match("[^\n]*")))))
