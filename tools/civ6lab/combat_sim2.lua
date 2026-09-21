-- InGame: crack CombatManager.SimulateAttackVersus. The UI calls it as
--   CombatManager.SimulateAttackVersus(attacker:GetComponentID(), defender:GetComponentID(), eCombatType)
-- (UnitPanel.lua:3352). Asking the SAM to attack the bomber failed; the owner's
-- reading is that the ATTACK must be one the attacker could actually make, so
-- this tries the BOMBER attacking the SAM (an ordinary air strike) and dumps
-- every key of whatever comes back, including nested tables, so the modified
-- strengths can be read rather than inferred from damage.
--   --set ZAP=0 --set ZAU=123 --set ZDP=1 --set ZDU=456
local a = Players[ZAP]:GetUnits():FindID(ZAU)
local d = Players[ZDP]:GetUnits():FindID(ZDU)
if a == nil or d == nil then print("{\"kind\":\"sim2\",\"error\":\"nounit\"}") return end
local acc = {}
for k, v in pairs(CombatManager) do if type(k) == "string" then acc[#acc + 1] = k end end
table.sort(acc)
print("{\"kind\":\"sim2\",\"CombatManager\":\"" .. table.concat(acc, " ") .. "\"}")
local function dump(label, t, depth)
  if type(t) ~= "table" then
    print("{\"kind\":\"sim2\",\"" .. label .. "\":\"" .. tostring(t) .. "\"}")
    return
  end
  for k, v in pairs(t) do
    if type(v) == "table" and depth > 0 then
      dump(label .. "." .. tostring(k), v, depth - 1)
    else
      print("{\"kind\":\"sim2\",\"path\":\"" .. label .. "." .. tostring(k)
        .. "\",\"value\":\"" .. tostring(v) .. "\"}")
    end
  end
end
local names = { "MELEE", "RANGED", "BOMBARD", "AIR", "ICBM" }
for _, n in ipairs(names) do
  local ct = CombatTypes[n]
  local ok, res = pcall(function()
    return CombatManager.SimulateAttackVersus(a:GetComponentID(), d:GetComponentID(), ct)
  end)
  if ok and type(res) == "table" then
    dump("bomberAttacks_" .. n, res, 2)
  else
    print("{\"kind\":\"sim2\",\"bomberAttacks_" .. n .. "\":\"" .. tostring(ok and res or "err") .. "\"}")
  end
end
