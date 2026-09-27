-- GameCore: the turn, the local seat's view, and seats 0 and ZSEAT's turn state.
print("turn " .. Game.GetCurrentGameTurn() .. " p0 active " .. tostring(Players[0]:IsTurnActive()) .. " human " .. tostring(Players[0]:IsHuman())
  .. " | pZSEAT active " .. tostring(Players[ZSEAT]:IsTurnActive()) .. " human " .. tostring(Players[ZSEAT]:IsHuman()))
