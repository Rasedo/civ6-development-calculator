-- GameCore_Tuner: install the synchronous grab. When seat ZP's turn starts
-- (GameEvents.PlayerTurnStarted) and its property LAB_GRAB reads 1, it is
-- made local before its AI acts — the 20 ms poll of c16w_cycle.py misses an
-- early-game AI turn, which is over within a frame. Install once per load
-- (a second install adds a second handler; both do the same).
local seat = ZP
local ok, err = pcall(function()
  GameEvents.PlayerTurnStarted.Add(function(p)
    if p == seat and Players[seat]:GetProperty("LAB_GRAB") == 1 then
      PlayerManager.SetLocalPlayerAndObserver(seat)
    end
  end)
end)
print("hook seat " .. seat .. " installed " .. tostring(ok) .. " " .. tostring(err))
