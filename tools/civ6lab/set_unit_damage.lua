-- GameCore_Tuner: wound a named unit to a chosen HP, for testing whether an
-- interceptor's health enters its anti-air attack. Civ 6 penalises a damaged
-- unit's combat strength, so a SAM at half health should do visibly less damage
-- to the bomber than one at full health, on the same rng draw.
--   --set ZPLAYER=1 --set ZUNIT=123 --set ZHP=50
local pl = Players[ZPLAYER]
local u = pl:GetUnits():FindID(ZUNIT)
if u == nil then print("{\"kind\":\"wound\",\"error\":\"nounit\"}") return end
local maxd = u:GetMaxDamage()
pcall(function() u:SetDamage(maxd - ZHP) end)
print("{\"kind\":\"wound\",\"unit\":" .. ZUNIT .. ",\"hp\":" .. (maxd - u:GetDamage())
  .. ",\"damage\":" .. u:GetDamage() .. ",\"maxDamage\":" .. maxd .. "}")
