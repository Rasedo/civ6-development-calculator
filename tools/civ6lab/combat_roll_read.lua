-- GameCore_Tuner: the result of one shot — the damage taken and the rng state
-- afterwards, which together say what the roll was. Also heals both units so
-- the next shot starts from the same strength difference.
--   --set ZATT=123 --set ZDEF=456 --set ZDOWNER=1 --set ZHEAL=1
local a = nil
for _, u in Players[0]:GetUnits():Members() do if u:GetID() == ZATT then a = u end end
local d = nil
for _, u in Players[ZDOWNER]:GetUnits():Members() do if u:GetID() == ZDEF then d = u end end
local seedNow = Game.GetRandomSeed()
if d == nil then
  print("{\"kind\":\"shotread\",\"defender\":\"dead\",\"seedAfter\":" .. tostring(seedNow) .. "}")
  return
end
print("{\"kind\":\"shotread\",\"seedAfter\":" .. tostring(seedNow)
  .. ",\"defenderDamage\":" .. d:GetDamage()
  .. ",\"defenderHP\":" .. (d:GetMaxDamage() - d:GetDamage())
  .. ",\"attackerDamage\":" .. (a and a:GetDamage() or -1)
  .. ",\"attackerMoves\":" .. (a and a:GetMovesRemaining() or -1) .. "}")
if ZHEAL == 1 then
  pcall(function() d:SetDamage(0) end)
  if a ~= nil then pcall(function() a:SetDamage(0) end) end
end
