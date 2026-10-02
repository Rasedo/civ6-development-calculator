-- InGame: a watch reader that logs the turn the UI state reads (the H-2
-- step check pairs it with h2h_sig.lua's GameCore turn).
print("{\"ig_turn\":" .. Game.GetCurrentGameTurn() .. ",\"wall\":" .. tostring(os.time()) .. "}")
