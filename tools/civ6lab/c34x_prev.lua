-- InGame (after lab_json.lua): the air-strike preview's XP. Attacker ZA
-- ("owner:id"), each plot of ZPLOTS ("x:y;x:y"): SimulateAttackInto
-- (CombatTypes.AIR); per block (ATTACKER, DEFENDER, INTERCEPTOR, ANTI_AIR)
-- its unit, COMBAT_STRENGTH and EXPERIENCE_CHANGE (blocks with no unit ID
-- are skipped: they carry garbage).
local ap, aid = string.match("ZA", "(%d+):(%d+)")
local a = Players[tonumber(ap)]:GetUnits():FindID(tonumber(aid))
local name = {}
for k, v in pairs(CombatResultParameters) do if type(v) == "number" then name[v] = k end end
local rows = {}
for x, y in string.gmatch("ZPLOTS", "(%d+):(%d+)") do
  x, y = tonumber(x), tonumber(y)
  local ok, res = pcall(function() return CombatManager.SimulateAttackInto(a:GetComponentID(), CombatTypes.AIR, x, y) end)
  local r = {x = x, y = y}
  if not ok then r.err = tostring(res)
  elseif type(res) ~= "table" then r.err = "result " .. tostring(res)
  else
    for k, v in pairs(res) do
      local bn = name[k] or tostring(k)
      if type(v) == "table" then
        local id = v[CombatResultParameters.ID]
        if id and id.player and id.player >= 0 then
          local u = Players[id.player]:GetUnits():FindID(id.id)
          r[bn] = {owner = id.player, unit = u and GameInfo.Units[u:GetType()].UnitType or ("type" .. tostring(id.type)),
            cs = v[CombatResultParameters.COMBAT_STRENGTH], xp = v[CombatResultParameters.EXPERIENCE_CHANGE],
            dmg = v[CombatResultParameters.DAMAGE_TO]}
        end
      end
    end
  end
  rows[#rows + 1] = r
end
OUT({kind = "xpprev", tag = "ZTAG", att = "ZA", rows = rows})
