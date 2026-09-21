-- InGame: load a named single-player save. Shape copied from
-- Automation_StandardTests.lua's loadGame table.
--   Network.LoadGame(loadGame, ServerType.SERVER_TYPE_NONE)
-- The tuner listener drops through the load transition and comes back when
-- the map is up; the caller must reconnect (lab.py opens a fresh socket per
-- command, so the next call simply retries).
--   --set LOADNAME=lab2_nuke_pre
local g = {}
g.Location = SaveLocations.LOCAL_STORAGE
g.Type = SaveTypes.SINGLE_PLAYER
g.IsAutosave = false
g.IsQuicksave = false
g.Directory = SaveDirectories.DEFAULT
g.Name = "LOADNAME"
print("loading " .. g.Name .. " from turn " .. Game.GetCurrentGameTurn())
local ok, res = pcall(function() return Network.LoadGame(g, ServerType.SERVER_TYPE_NONE) end)
print("load ok=" .. tostring(ok) .. " result=" .. tostring(res))
