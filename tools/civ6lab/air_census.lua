-- GameCore_Tuner: every AIR-domain unit the database carries, with its Combat.
-- SimulateAttackInto needs no warhead, so each one can be flown at the same
-- lone interceptor to sweep the damage curve's strength difference.
local out = {}
for r in GameInfo.Units() do
  if r.Domain == "DOMAIN_AIR" then
    out[#out + 1] = "{\"t\":\"" .. r.UnitType .. "\",\"combat\":" .. (r.Combat or 0)
      .. ",\"aa\":" .. (r.AntiAirCombat or 0) .. "}"
  end
end
print("{\"kind\":\"aircensus\",\"n\":" .. #out .. ",\"units\":[" .. table.concat(out, ",") .. "]}")
