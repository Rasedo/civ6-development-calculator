-- InGame: READ ONLY. What is stopping the turn from ending? Autoplay timed out
-- at turn 160 while the tuner stayed healthy, so the turn is blocked on
-- something the UI would normally be asked about. Names the blocker rather
-- than acting on it — a forced end turn from outside its UI context crashed
-- the game twice in session 1.
local me = Game.GetLocalPlayer()
print("{\"kind\":\"blocker\",\"localPlayer\":" .. tostring(me)
  .. ",\"turn\":" .. Game.GetCurrentGameTurn() .. "}")
if me == nil or me < 0 then return end
local okb, b = pcall(function() return NotificationManager.GetFirstEndTurnBlocking(me) end)
local bname = tostring(b)
if okb then
  for k, v in pairs(EndTurnBlockingTypes) do if v == b then bname = k end end
end
print("{\"kind\":\"blocker\",\"firstEndTurnBlocking\":\"" .. bname .. "\",\"ok\":" .. tostring(okb) .. "}")
-- every notification the local player is holding
local okn, n = pcall(function() return NotificationManager.GetCount(me) end)
print("{\"kind\":\"blocker\",\"notificationCount\":\"" .. tostring(okn and n or "err") .. "\"}")
if okn and n ~= nil and n > 0 then
  for i = 0, math.min(n - 1, 20) do
    local oki, id = pcall(function() return NotificationManager.GetIDByIndex(me, i) end)
    if oki and id ~= nil then
      local okt, nt = pcall(function() return NotificationManager.GetType(me, id) end)
      local row = nil
      if okt and nt ~= nil then
        for r in GameInfo.Notifications() do if r.Hash == nt then row = r end end
      end
      print("{\"kind\":\"blocker\",\"notification\":" .. i
        .. ",\"type\":\"" .. (row and row.NotificationType or tostring(okt and nt or "err")) .. "\""
        .. ",\"blocking\":\"" .. tostring(select(2, pcall(function() return NotificationManager.IsBlocking(me, id) end))) .. "\"}")
    end
  end
end
local oka, act = pcall(function() return AutoplayManager.IsActive() end)
print("{\"kind\":\"blocker\",\"autoplayActive\":\"" .. tostring(oka and act or "err") .. "\""
  .. ",\"turnActive\":\"" .. tostring(select(2, pcall(function() return Players[me]:IsTurnActive() end))) .. "\"}")
