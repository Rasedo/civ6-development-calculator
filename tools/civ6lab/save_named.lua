-- InGame: write a named single-player save. The destructive scenes reload
-- from it. Shape copied from Automation_StandardTests.lua (saveGame table).
--   --set SAVENAME=lab2_t109
local g = {}
g.Name = "SAVENAME"
g.Location = SaveLocations.LOCAL_STORAGE
g.Type = SaveTypes.SINGLE_PLAYER
g.IsAutosave = false
g.IsQuicksave = false
local ok, err = pcall(function() Network.SaveGame(g) end)
print("save requested name=" .. g.Name .. " ok=" .. tostring(ok) .. " err=" .. tostring(err)
  .. " turn=" .. Game.GetCurrentGameTurn())
