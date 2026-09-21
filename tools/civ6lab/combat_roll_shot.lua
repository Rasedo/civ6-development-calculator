-- InGame: one ranged shot against a KNOWN rng state. Sets the seed, heals the
-- defender (a wounded unit fights weaker, which would move the strength
-- difference), fires, and reports the seed before and after so the number of
-- draws the shot consumed can be counted by stepping the LCG
--   state' = (1103515245*state + 12345) mod 2^32
-- outside the game. The damage read belongs to the NEXT call, because an
-- operation resolves on a later tick.
--   --set ZATT=123 --set ZDEF=456 --set ZDOWNER=1 --set ZSEED=1000 --set ZDX=36 --set ZDY=25
local a = nil
for _, u in Players[0]:GetUnits():Members() do if u:GetID() == ZATT then a = u end end
local d = nil
for _, u in Players[ZDOWNER]:GetUnits():Members() do if u:GetID() == ZDEF then d = u end end
if a == nil or d == nil then print("{\"kind\":\"shot\",\"error\":\"nounit\"}") return end
-- the seed is set from GameCore in a SEPARATE call: the InGame Game object
-- carries neither GetRandomSeed nor SetRandomSeed, and reading one here is
-- what broke the first version of this probe.
local params = {}
params[UnitOperationTypes.PARAM_X] = ZDX
params[UnitOperationTypes.PARAM_Y] = ZDY
local okc, can = pcall(function()
  return UnitManager.CanStartOperation(a, UnitOperationTypes.RANGE_ATTACK, nil, params)
end)
local fired = false
if okc and can then
  fired = pcall(function() UnitManager.RequestOperation(a, UnitOperationTypes.RANGE_ATTACK, params) end)
end
print("{\"kind\":\"shot\",\"seedExpected\":" .. ZSEED
  .. ",\"can\":" .. tostring(okc and can) .. ",\"fired\":" .. tostring(fired)
  .. ",\"attackerMoves\":" .. a:GetMovesRemaining()
  .. ",\"defenderHPbefore\":" .. (d:GetMaxDamage() - d:GetDamage()) .. "}")
