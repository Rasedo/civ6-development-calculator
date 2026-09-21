-- InGame: one city's religion ledger, as one JSON line.
--   --set ZCX=38 --set ZCY=19
local c = Cities.GetCityInPlot(ZCX, ZCY)
if c == nil then print("{\"error\":\"nocity\"}") return end
local cr = c:GetReligion()
local parts = {}
for _, r in ipairs(cr:GetReligionsInCity()) do
  parts[#parts + 1] = "{\"rel\":" .. tostring(r.Religion) .. ",\"f\":" .. tostring(r.Followers)
    .. ",\"p\":" .. tostring(r.Pressure) .. "}"
end
print("{\"scene\":\"E\",\"turn\":" .. Game.GetCurrentGameTurn() .. ",\"city\":\"" .. c:GetName()
  .. "\",\"owner\":" .. c:GetOwner() .. ",\"pop\":" .. c:GetPopulation()
  .. ",\"majority\":" .. tostring(cr:GetMajorityReligion())
  .. ",\"rows\":[" .. table.concat(parts, ",") .. "]}")
