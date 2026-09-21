-- GameCore_Tuner: every column of the WMDs table. The silo/submarine stop turns
-- out to obey the SAME law as the bomber's -- damage > 50 cancels -- but with a
-- fixed defence around 72 instead of the delivering unit's Combat. If the
-- warhead itself carries a strength, it is in this table.
local cols = {}
for r in GameInfo.WMDs() do
  local parts = {}
  for k, v in pairs(r) do
    if type(k) == "string" then parts[#parts + 1] = "\"" .. k .. "\":\"" .. tostring(v) .. "\"" end
  end
  table.sort(parts)
  cols[#cols + 1] = "{" .. table.concat(parts, ",") .. "}"
end
print("{\"kind\":\"wmds\",\"rows\":[" .. table.concat(cols, ",") .. "]}")
