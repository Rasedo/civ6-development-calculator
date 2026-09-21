-- InGame: decode what GameRandomEvents actually hands back, so a sampling run
-- has an instrument. GetCurrentTurnEvent() and GetEventsForTurn(t) both return
-- tables; this prints their shape and walks the last ZBACK turns looking for
-- anything that fired, which is also the only way to see whether the game has
-- already spent its per-game budget of an event.
--   --set ZBACK=40
local function dump(label, t, depth)
  if type(t) ~= "table" then
    print("{\"kind\":\"evlog\",\"" .. label .. "\":\"" .. tostring(t) .. "\"}")
    return
  end
  local n = 0
  for k, v in pairs(t) do
    n = n + 1
    if type(v) == "table" and depth > 0 then dump(label .. "." .. tostring(k), v, depth - 1)
    else print("{\"kind\":\"evlog\",\"path\":\"" .. label .. "." .. tostring(k) .. "\",\"value\":\"" .. tostring(v) .. "\"}") end
  end
  if n == 0 then print("{\"kind\":\"evlog\",\"path\":\"" .. label .. "\",\"value\":\"EMPTY\"}") end
end
dump("currentTurnEvent", GameRandomEvents.GetCurrentTurnEvent(), 2)
local now = Game.GetCurrentGameTurn()
for t = math.max(now - ZBACK, 1), now do
  local ok, e = pcall(function() return GameRandomEvents.GetEventsForTurn(t) end)
  if ok and type(e) == "table" then
    local n = 0
    for _ in pairs(e) do n = n + 1 end
    if n > 0 then dump("turn" .. t, e, 2) end
  end
end
