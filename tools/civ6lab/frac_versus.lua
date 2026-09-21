-- GameCore_Tuner: the COMBAT_DAMAGE_MULTIPLIER_MINIMUM = 0.25 floor.
-- GlobalParameters says the damage multiplier e^(0.04*delta) is clamped below
-- at 0.25, so a hopeless attacker should still deal (24 + 12u) * 0.25 = 6..9
-- rather than the 1 that COMBAT_MINIMUM_DAMAGE would give. A Warrior (20)
-- against a Giant Death Robot (140) is delta = -120, where the unclamped
-- value is 24 * e^(-4.8) = 0.2 -- the two rules disagree by 6x.
-- Spawns the attacker for ZAP beside ZDU, then dumps the preview at %.6f.
--   --set ZAP=0 --set ZATT=UNIT_WARRIOR --set ZAX=38 --set ZAY=14
--   --set ZDP=1 --set ZDU=123
local pa = Players[ZAP]
local existing = nil
for _, u in pa:GetUnits():Members() do
  if u:GetX() == ZAX and u:GetY() == ZAY
    and GameInfo.Units[u:GetType()].UnitType == "ZATT" then existing = u end
end
local a = existing or pa:GetUnits():Create(GameInfo.Units["ZATT"].Index, ZAX, ZAY)
if a == nil then print("{\"kind\":\"fracvs\",\"error\":\"nospawn\"}") return end
local d = Players[ZDP]:GetUnits():FindID(ZDU)
if d == nil then print("{\"kind\":\"fracvs\",\"error\":\"nodefender\"}") return end
local name = {}
for k, v in pairs(CombatResultParameters) do if type(v) == "number" then name[v] = k end end
print("{\"kind\":\"fracvs\",\"attacker\":" .. a:GetID() .. ",\"type\":\"ZATT\""
  .. ",\"at\":\"" .. a:GetX() .. ":" .. a:GetY() .. "\""
  .. ",\"attCombat\":" .. a:GetCombat() .. ",\"defCombat\":" .. d:GetCombat()
  .. ",\"defAt\":\"" .. d:GetX() .. ":" .. d:GetY() .. "\"}")
local ok, res = pcall(function()
  return CombatManager.SimulateAttackVersus(a:GetComponentID(), d:GetComponentID(), CombatTypes.MELEE)
end)
if not ok or type(res) ~= "table" then
  print("{\"kind\":\"fracvs\",\"error\":\"nosim\",\"why\":\"" .. tostring(res) .. "\"}") return
end
for k, v in pairs(res) do
  local block = name[k] or tostring(k)
  if type(v) == "table" then
    local parts = {}
    for kk, vv in pairs(v) do
      if type(vv) == "number" then
        parts[#parts + 1] = "\"" .. (name[kk] or tostring(kk)) .. "\":" .. string.format("%.6f", vv)
      end
    end
    print("{\"kind\":\"fracvs\",\"block\":\"" .. block .. "\"," .. table.concat(parts, ",") .. "}")
  end
end
