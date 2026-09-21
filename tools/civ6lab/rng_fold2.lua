-- GameCore_Tuner: the range fold across the 2^15 boundary. Every range up to
-- 32768 fits draw = floor(top15(state') * range / 32768), but range 1000000
-- does not, so the large-range path is something else. Same seed every time,
-- so every row folds the SAME state.
--   --set ZSEED=12345
local ok0, seed0 = pcall(function() return Game.GetRandomSeed() end)
local ranges = { 16384, 32767, 32768, 32769, 40000, 65535, 65536, 65537, 100000,
                 131072, 262144, 1000000, 16777216, 2147483647 }
for _, r in ipairs(ranges) do
  pcall(function() Game.SetRandomSeed(ZSEED) end)
  local ok, d = pcall(function() return Game.GetRandNum(r, "labfold2") end)
  local after = Game.GetRandomSeed()
  print("{\"kind\":\"rngfold2\",\"seed\":" .. ZSEED .. ",\"range\":" .. r
    .. ",\"draw\":\"" .. tostring(ok and d or "err") .. "\",\"seedAfter\":" .. tostring(after) .. "}")
end
if ok0 and seed0 ~= nil then pcall(function() Game.SetRandomSeed(seed0) end) end
