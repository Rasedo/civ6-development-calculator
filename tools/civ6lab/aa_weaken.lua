-- GameCore_Tuner: make an interceptor as WEAK as the game allows, and report
-- the strength the engine actually gives it.
--   * health: the combat-strength penalty is 10 * (1 - hp/100), so 1 HP is the
--     floor (-9.9)
--   * strategic resource: Expansion2 ships
--     COMBAT_STRENGTH_REDUCTION_INSUFFICIENT_FUEL = 20 for a unit whose
--     ResourceMaintenanceType cannot be paid, so draining the owner's stockpile
--     is worth twice as much as being nearly dead
-- Reports each anti-air unit's resource upkeep so the right lever is picked.
--   --set ZPLAYER=1 --set ZUNIT=123 --set ZHP=1 --set ZDRAIN=1
local rows = {}
for r in GameInfo.Units() do
  if (r.AntiAirCombat or 0) > 0 then
    rows[#rows + 1] = "{\"t\":\"" .. r.UnitType .. "\",\"aa\":" .. r.AntiAirCombat
      .. ",\"resource\":\"" .. tostring(r.ResourceMaintenanceType)
      .. "\",\"amount\":" .. tostring(r.ResourceMaintenanceAmount or 0) .. "}"
  end
end
print("{\"kind\":\"aaupkeep\",\"units\":[" .. table.concat(rows, ",") .. "]}")
local pl = Players[ZPLAYER]
local u = pl:GetUnits():FindID(ZUNIT)
if u == nil then print("{\"kind\":\"aaweaken\",\"error\":\"nounit\"}") return end
if ZHP > 0 then pcall(function() u:SetDamage(u:GetMaxDamage() - ZHP) end) end
local drained = {}
if ZDRAIN == 1 then
  local res = pl:GetResources()
  for r in GameInfo.Resources() do
    if r.ResourceClassType == "RESOURCECLASS_STRATEGIC" then
      local ok, have = pcall(function() return res:GetResourceAmount(r.Index) end)
      if ok and have ~= nil and have > 0 then
        pcall(function() res:ChangeResourceAmount(r.Index, -have) end)
        drained[#drained + 1] = "\"" .. r.ResourceType .. ":" .. have .. "\""
      end
    end
  end
end
print("{\"kind\":\"aaweaken\",\"unit\":" .. ZUNIT
  .. ",\"type\":\"" .. GameInfo.Units[u:GetType()].UnitType .. "\""
  .. ",\"hp\":" .. (u:GetMaxDamage() - u:GetDamage())
  .. ",\"aaBase\":" .. u:GetAntiAirCombat()
  .. ",\"combat\":" .. u:GetCombat()
  .. ",\"drained\":[" .. table.concat(drained, ",") .. "]}")
