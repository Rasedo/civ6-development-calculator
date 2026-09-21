-- InGame: what does CityCommandTypes.MANAGE actually offer? PlotInfo.lua calls
-- GetCommandTargets with only the interface-mode parameter (which the UI never
-- sets, so it goes in nil) and reads back a table of plots. Printing the raw
-- shape says whether the tuner can move a citizen at all, and with which key.
--   --set ZCX=36 --set ZCY=22
local c = Cities.GetCityInPlot(ZCX, ZCY)
if c == nil then print("{\"error\":\"nocity\"}") return end
local params = {}
local ok, res = pcall(function() return CityManager.GetCommandTargets(c, CityCommandTypes.MANAGE, params) end)
if not ok or res == nil then print("{\"kind\":\"manage-targets\",\"result\":\"nil\"}") return end
for k, v in pairs(res) do
  if type(v) == "table" then
    local n = 0
    local sample = {}
    for kk, vv in pairs(v) do
      n = n + 1
      if n <= 8 then sample[#sample + 1] = tostring(kk) .. ":" .. tostring(vv) end
    end
    print("{\"kind\":\"manage-targets\",\"key\":\"" .. tostring(k) .. "\",\"type\":\"table\",\"count\":" .. n
      .. ",\"sample\":\"" .. table.concat(sample, " ") .. "\"}")
  else
    print("{\"kind\":\"manage-targets\",\"key\":\"" .. tostring(k) .. "\",\"value\":\"" .. tostring(v) .. "\"}")
  end
end
