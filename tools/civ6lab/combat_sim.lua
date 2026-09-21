-- InGame: read a combat BEFORE it happens. The UI's own preview is
--   CombatManager.SimulateAttackVersus(attackerComponentID, defenderComponentID [, eCombatType])
-- (Base/Assets/UI/Panels/UnitPanel.lua:3352), which returns the modified
-- strengths and the expected damage — so an interceptor's anti-air strength,
-- WITH whatever bonuses it currently has, can be read directly instead of being
-- inferred backwards from the damage it did.
--   --set ZAP=1 --set ZAU=123 --set ZDP=0 --set ZDU=456
local a = Players[ZAP]:GetUnits():FindID(ZAU)
local d = Players[ZDP]:GetUnits():FindID(ZDU)
if a == nil or d == nil then print("{\"kind\":\"sim\",\"error\":\"nounit\"}") return end
local acc = {}
local okc, ct = pcall(function() return CombatTypes end)
if okc and ct ~= nil then
  for k, v in pairs(ct) do acc[#acc + 1] = k .. "=" .. tostring(v) end
  table.sort(acc)
  print("{\"kind\":\"sim\",\"CombatTypes\":\"" .. table.concat(acc, " ") .. "\"}")
end
local function dump(label, res)
  if type(res) ~= "table" then
    print("{\"kind\":\"sim\",\"" .. label .. "\":\"" .. tostring(res) .. "\"}")
    return
  end
  local parts = {}
  for k, v in pairs(res) do
    if type(v) ~= "table" then parts[#parts + 1] = "\"" .. tostring(k) .. "\":\"" .. tostring(v) .. "\"" end
  end
  table.sort(parts)
  print("{\"kind\":\"sim\",\"" .. label .. "\":{" .. table.concat(parts, ",") .. "}}")
end
local okp, res = pcall(function()
  return CombatManager.SimulateAttackVersus(a:GetComponentID(), d:GetComponentID())
end)
dump("default", okp and res or "err")
if okc and ct ~= nil then
  for k, v in pairs(ct) do
    local ok2, r2 = pcall(function()
      return CombatManager.SimulateAttackVersus(a:GetComponentID(), d:GetComponentID(), v)
    end)
    if ok2 and type(r2) == "table" then dump("type_" .. k, r2) end
  end
end
print("{\"kind\":\"sim\",\"attackerAntiAir\":" .. tostring(a:GetAntiAirCombat())
  .. ",\"attackerCombat\":" .. tostring(a:GetCombat())
  .. ",\"defenderCombat\":" .. tostring(d:GetCombat())
  .. ",\"defenderRanged\":" .. tostring(d:GetRangedCombat())
  .. ",\"defenderHP\":" .. (d:GetMaxDamage() - d:GetDamage()) .. "}")
