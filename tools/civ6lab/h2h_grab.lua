-- GameCore: arm (a) — the c16n_hook.lua way on an observer game. When seat
-- ZP's turn starts at turn >= ZT (GameEvents.PlayerTurnStarted), make it
-- local (PlayerManager.SetLocalPlayerAndObserver) so the turn waits on it.
local seat, target = ZP, ZT
local ok, err = pcall(function()
  GameEvents.PlayerTurnStarted.Add(function(p)
    if p == seat and Game.GetCurrentGameTurn() >= target and Game.GetProperty("H2H_GRABBED") == nil then
      Game.SetProperty("H2H_GRABBED", Game.GetCurrentGameTurn())
      PlayerManager.SetLocalPlayerAndObserver(seat)
    end
  end)
end)
print("grab hook seat " .. seat .. " at " .. target .. " installed " .. tostring(ok) .. " " .. tostring(err))
