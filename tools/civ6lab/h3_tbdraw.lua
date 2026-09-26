-- H-3, GameCore_Tuner: ZN draws of TerrainBuilder.GetRandomNumber(ZR) in a
-- row, and the game's sync seed around them. One line: "tb <range> <draws...>".
local seed0 = Game.GetRandomSeed()
local out = {}
for i = 1, ZN do
  out[#out + 1] = tostring(TerrainBuilder.GetRandomNumber(ZR, "civ6lab h3"))
end
local seed1 = Game.GetRandomSeed()
print("tb " .. tostring(ZR) .. " " .. table.concat(out, " "))
print("sync " .. tostring(seed0) .. " " .. tostring(seed1))
local okm, mr = pcall(function() return math.random(1000) end)
print("math.random " .. tostring(okm) .. " " .. tostring(mr))
