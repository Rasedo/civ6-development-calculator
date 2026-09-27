-- GameCore_Tuner: what only the authoritative state answers for the
-- autoplay differential harness — the turn and the game's random seed at the
-- dump. One JSON line (lab_json.lua prefixed by the caller).
OUT({k = "gc", turn = Game.GetCurrentGameTurn(), seed = P(function() return Game.GetRandomSeed() end)})
