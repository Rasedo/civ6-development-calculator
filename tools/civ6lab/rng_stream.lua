-- GameCore_Tuner: the generator itself. Game.GetRandNum(range, "reason") draws
-- from the game's own RNG and Game.GetRandomSeed / SetRandomSeed read and write
-- its state, so the stream can be made REPRODUCIBLE and then identified:
--   * set a known seed, dump N draws
--   * set the SAME seed again, dump N draws -> identical means the seed alone
--     determines the stream (no hidden entropy, no per-call reseed)
--   * dump raw-ish draws at a power-of-two range so the underlying bits show
-- The original seed is read first and put back at the end, so the game's own
-- stream is disturbed as little as possible.
--   --set ZSEED=12345 --set ZN=24 --set ZRANGE=32768
local ok0, seed0 = pcall(function() return Game.GetRandomSeed() end)
print("{\"kind\":\"rngstream\",\"originalSeed\":\"" .. tostring(ok0 and seed0 or "err") .. "\"}")
local function run(tag)
  pcall(function() Game.SetRandomSeed(ZSEED) end)
  local acc = {}
  for i = 1, ZN do acc[#acc + 1] = tostring(Game.GetRandNum(ZRANGE, "labstream")) end
  print("{\"kind\":\"rngstream\",\"pass\":\"" .. tag .. "\",\"seed\":" .. ZSEED
    .. ",\"range\":" .. ZRANGE .. ",\"draws\":[" .. table.concat(acc, ",") .. "]}")
end
run("A")
run("B")
-- and the seed as the game reports it after a known number of draws
pcall(function() Game.SetRandomSeed(ZSEED) end)
local seedBefore = Game.GetRandomSeed()
local d1 = Game.GetRandNum(ZRANGE, "labstream")
local seedAfter = Game.GetRandomSeed()
print("{\"kind\":\"rngstream\",\"seedBeforeDraw\":\"" .. tostring(seedBefore)
  .. "\",\"firstDraw\":" .. d1 .. ",\"seedAfterDraw\":\"" .. tostring(seedAfter) .. "\"}")
if ok0 and seed0 ~= nil then pcall(function() Game.SetRandomSeed(seed0) end) end
print("{\"kind\":\"rngstream\",\"seedRestored\":\"" .. tostring(Game.GetRandomSeed()) .. "\"}")
