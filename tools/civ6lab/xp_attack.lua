-- InGame: make one named unit perform one ranged attack on a plot, after
-- reading what the preview says it will gain. EXPERIENCE_CHANGE is a field of
-- the preview blocks, so the award can be compared against what the unit
-- actually banks.
--   --set ZAU=123 --set ZTX=37 --set ZTY=15
local name = {}
for k, v in pairs(CombatResultParameters) do if type(v) == "number" then name[v] = k end end
local u = Players[0]:GetUnits():FindID(ZAU)
if u == nil then print("{\"kind\":\"xpattack\",\"error\":\"nounit\"}") return end
local pre = {}
local okS, res = pcall(function()
  return CombatManager.SimulateAttackInto(u:GetComponentID(), CombatTypes.RANGED, ZTX, ZTY)
end)
if okS and type(res) == "table" then
  for k, v in pairs(res) do
    local block = name[k] or tostring(k)
    if type(v) == "table" and (block == "ATTACKER" or block == "DEFENDER") then
      local xp, dmg, cs = "null", "null", "null"
      for kk, vv in pairs(v) do
        local f = name[kk] or tostring(kk)
        if f == "EXPERIENCE_CHANGE" then xp = tostring(vv) end
        if f == "DAMAGE_TO" then dmg = tostring(vv) end
        if f == "COMBAT_STRENGTH" then cs = tostring(vv) end
      end
      pre[#pre + 1] = "\"" .. block .. "\":{\"xp\":" .. xp .. ",\"damageTo\":" .. dmg
        .. ",\"strength\":" .. cs .. "}"
    end
  end
end
local p = {}
p[UnitOperationTypes.PARAM_X] = ZTX
p[UnitOperationTypes.PARAM_Y] = ZTY
local okc, can = pcall(function()
  return UnitManager.CanStartOperation(u, UnitOperationTypes.RANGE_ATTACK, nil, p)
end)
local fired = false
if okc and can then
  fired = pcall(function() UnitManager.RequestOperation(u, UnitOperationTypes.RANGE_ATTACK, p) end)
end
print("{\"kind\":\"xpattack\",\"unit\":" .. ZAU .. ",\"can\":" .. tostring(okc and can)
  .. ",\"fired\":" .. tostring(fired) .. "," .. table.concat(pre, ",") .. "}")
