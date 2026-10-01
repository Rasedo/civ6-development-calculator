-- InGame: the profile's AutoEndTurn 1 ends a human turn with nothing to do; off for this instance (not saved)
Options.SetUserOption("Gameplay", "AutoEndTurn", 0)
print("AutoEndTurn " .. tostring(Options.GetUserOption("Gameplay", "AutoEndTurn")))
