-- InGame: the civ-wide half of scene E — every city's majority for one
-- player against Players[p]:GetReligion():GetReligionInMajorityOfCities().
--   --set ZP=0
local p = ZP
local pl = Players[p]
local counts, parts = {}, {}
for _, c in pl:GetCities():Members() do
  local cr = c:GetReligion()
  local m = cr:GetMajorityReligion()
  counts[m] = (counts[m] or 0) + 1
  local tot = {}
  for _, r in ipairs(cr:GetReligionsInCity()) do tot[#tot + 1] = tostring(r.Religion) .. ":f" .. tostring(r.Followers) .. ",p" .. tostring(r.Pressure) end
  parts[#parts + 1] = "{\"city\":\"" .. c:GetName() .. "\",\"pop\":" .. c:GetPopulation()
    .. ",\"majority\":" .. tostring(m) .. ",\"rows\":\"" .. table.concat(tot, " ") .. "\"}"
end
local cs = {}
for k, v in pairs(counts) do cs[#cs + 1] = tostring(k) .. "=" .. v end
table.sort(cs)
print("{\"scene\":\"E-civwide\",\"turn\":" .. Game.GetCurrentGameTurn() .. ",\"player\":" .. p
  .. ",\"created\":" .. tostring(pl:GetReligion():GetReligionTypeCreated())
  .. ",\"majorityOfCities\":" .. tostring(pl:GetReligion():GetReligionInMajorityOfCities())
  .. ",\"cityMajorityCounts\":\"" .. table.concat(cs, " ") .. "\",\"cities\":[" .. table.concat(parts, ",") .. "]}")
