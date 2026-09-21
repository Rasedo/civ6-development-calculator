-- InGame: a melee attack is a MOVE_TO onto the defender's plot. Reads the
-- preview's EXPERIENCE_CHANGE for both sides first, so the award can be
-- compared against what the unit actually banks.
--   --set ZAU=123 --set ZTX=37 --set ZTY=13
local name = {}
for k, v in pairs(CombatResultParameters) do if type(v) == "number" then name[v] = k end end
local u = Players[0]:GetUnits():FindID(ZAU)
if u == nil then print("{\"kind\":\"xpmelee\",\"error\":\"nounit\"}") return end
local pre = {}
local okS, res = pcall(function()
  return CombatManager.SimulateAttackInto(u:GetComponentID(), CombatTypes.MELEE, ZTX, ZTY)
end)
if okS and type(res) == "table" then
  for k, v in pairs(res) do
    local block = name[k] or tostring(k)
    if type(v) == "table" and (block == "ATTACKER" or block == "DEFENDER") then
      local xp, dmgTo, dmgFrom, cs = "null", "null", "null", "null"
      for kk, vv in pairs(v) do
        local f = name[kk] or tostring(kk)
        if f == "EXPERIENCE_CHANGE" then xp = tostring(vv) end
        if f == "DAMAGE_TO" then dmgTo = tostring(vv) end
        if f == "DAMAGE_FROM" then dmgFrom = tostring(vv) end
        if f == "COMBAT_STRENGTH" then cs = tostring(vv) end
      end
      pre[#pre + 1] = "\"" .. block .. "\":{\"xp\":" .. xp .. ",\"damageTo\":" .. dmgTo
        .. ",\"damageFrom\":" .. dmgFrom .. ",\"strength\":" .. cs .. "}"
    end
  end
end
local p = {}
p[UnitOperationTypes.PARAM_X] = ZTX
p[UnitOperationTypes.PARAM_Y] = ZTY
local okc, can = pcall(function()
  return UnitManager.CanStartOperation(u, UnitOperationTypes.MOVE_TO, nil, p)
end)
local fired = false
if okc and can then
  fired = pcall(function() UnitManager.RequestOperation(u, UnitOperationTypes.MOVE_TO, p) end)
end
print("{\"kind\":\"xpmelee\",\"unit\":" .. ZAU .. ",\"can\":" .. tostring(okc and can)
  .. ",\"fired\":" .. tostring(fired) .. "," .. table.concat(pre, ",") .. "}")
