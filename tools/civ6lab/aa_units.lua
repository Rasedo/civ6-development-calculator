-- GameCore_Tuner: every unit in the database with AntiAirCombat > 0, with the
-- columns that could plausibly set its coverage radius. Civ 6 describes
-- anti-air as "defends tiles within N", and the question is which column N is.
local out = {}
for r in GameInfo.Units() do
  if (r.AntiAirCombat or 0) > 0 then
    out[#out + 1] = "{\"t\":\"" .. r.UnitType .. "\",\"aa\":" .. r.AntiAirCombat
      .. ",\"combat\":" .. (r.Combat or 0)
      .. ",\"range\":" .. (r.Range or 0)
      .. ",\"rangedCombat\":" .. (r.RangedCombat or 0)
      .. ",\"domain\":\"" .. tostring(r.Domain) .. "\""
      .. ",\"class\":\"" .. tostring(r.PromotionClass) .. "\""
      .. ",\"canEarnXP\":\"" .. tostring(r.CanEarnExperience) .. "\"}"
  end
end
print("{\"kind\":\"aaunits\",\"n\":" .. #out .. ",\"units\":[" .. table.concat(out, ",") .. "]}")
local t = {}
for r in GameInfo.Types() do
  if r.Type ~= nil and r.Type:find("ANTI_AIR") then t[#t + 1] = "\"" .. r.Type .. "\"" end
end
print("{\"kind\":\"aatypes\",\"types\":[" .. table.concat(t, ",") .. "]}")
