-- InGame: the COMPLETE ANTI_AIR and INTERCEPTOR blocks of the attack preview.
-- The block's COMBAT_STRENGTH turned out to be the chosen interceptor's BASE
-- anti-air value (100 for a Mobile SAM whether wounded, alone or stacked), so
-- the modifiers must live elsewhere in the block if they are exposed at all —
-- STRENGTH_MODIFIER and PREVIEW_TEXT_ASSIST are the candidates.
--   --set ZAU=123 --set ZX=36 --set ZY=15
local name = {}
for k, v in pairs(CombatResultParameters) do if type(v) == "number" then name[v] = k end end
local a = Players[0]:GetUnits():FindID(ZAU)
if a == nil then print("{\"kind\":\"aablock\",\"error\":\"nobomber\"}") return end
local res = CombatManager.SimulateAttackInto(a:GetComponentID(), CombatTypes.AIR, ZX, ZY)
if type(res) ~= "table" then print("{\"kind\":\"aablock\",\"error\":\"nosim\"}") return end
for k, v in pairs(res) do
  local blockName = name[k] or tostring(k)
  if type(v) == "table" and (blockName == "ANTI_AIR" or blockName == "INTERCEPTOR"
                             or blockName == "ATTACKER") then
    for kk, vv in pairs(v) do
      local f = name[kk] or tostring(kk)
      if type(vv) == "table" then
        for k3, v3 in pairs(vv) do
          print("{\"kind\":\"aablock\",\"block\":\"" .. blockName .. "\",\"field\":\"" .. f
            .. "." .. tostring(k3) .. "\",\"value\":\"" .. tostring(v3) .. "\"}")
        end
      else
        print("{\"kind\":\"aablock\",\"block\":\"" .. blockName .. "\",\"field\":\"" .. f
          .. "\",\"value\":\"" .. tostring(vv) .. "\"}")
      end
    end
  end
end
