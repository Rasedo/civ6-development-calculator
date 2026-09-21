-- GameCore_Tuner: the state transition of the game's RNG. For each seed in the
-- list: set it, read it back, draw ONCE at a fixed range, read the new seed.
-- A handful of (seedBefore -> seedAfter) pairs identifies a linear congruential
-- recurrence outright (two pairs solve for a and c; the rest verify), and the
-- draw beside each pair shows how the state is folded into a number in range.
--   --set ZRANGE=1000000
local seeds = { 0, 1, 2, 3, 12345, 65536, 2147483647, -1 }
local ok0, seed0 = pcall(function() return Game.GetRandomSeed() end)
for _, s in ipairs(seeds) do
  pcall(function() Game.SetRandomSeed(s) end)
  local before = Game.GetRandomSeed()
  local d = Game.GetRandNum(ZRANGE, "labtrans")
  local after = Game.GetRandomSeed()
  print("{\"kind\":\"rngtrans\",\"setSeed\":" .. s .. ",\"seedBefore\":" .. tostring(before)
    .. ",\"range\":" .. ZRANGE .. ",\"draw\":" .. tostring(d) .. ",\"seedAfter\":" .. tostring(after) .. "}")
end
-- the same seed drawn at several ranges, to separate the raw value from the fold
for _, r in ipairs({ 2, 6, 100, 1024, 32768, 1000000 }) do
  pcall(function() Game.SetRandomSeed(12345) end)
  local d = Game.GetRandNum(r, "labfold")
  local after = Game.GetRandomSeed()
  print("{\"kind\":\"rngfold\",\"seed\":12345,\"range\":" .. r .. ",\"draw\":" .. tostring(d)
    .. ",\"seedAfter\":" .. tostring(after) .. "}")
end
if ok0 and seed0 ~= nil then pcall(function() Game.SetRandomSeed(seed0) end) end
print("{\"kind\":\"rngtrans\",\"seedRestored\":" .. tostring(Game.GetRandomSeed()) .. "}")
