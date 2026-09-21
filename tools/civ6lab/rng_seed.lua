-- GameCore_Tuner: read or set the game's rng state. Game.GetRandomSeed and
-- Game.SetRandomSeed live ONLY in GameCore (the InGame Game object has
-- neither), so a scene that wants a known stream has to set the seed here and
-- act in InGame as a separate call.
--   --set ZSET=1   --set ZSEED=1000      (set, then report)
--   --set ZSET=0   --set ZSEED=0         (report only)
if ZSET == 1 then pcall(function() Game.SetRandomSeed(ZSEED) end) end
print("{\"kind\":\"seed\",\"set\":" .. ZSET .. ",\"seed\":" .. tostring(Game.GetRandomSeed())
  .. ",\"turn\":" .. Game.GetCurrentGameTurn() .. "}")
