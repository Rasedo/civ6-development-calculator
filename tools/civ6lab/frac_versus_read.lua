-- InGame: read SimulateAttackVersus between two named units at %.6f.
-- CombatManager lives on the InGame side only; frac_versus.lua does the
-- spawning on GameCore and this reads the preview.
--   --set ZAP=0 --set ZAU=123 --set ZDP=1 --set ZDU=456 --set ZTYPE=MELEE
local name = {}
for k, v in pairs(CombatResultParameters) do if type(v) == "number" then name[v] = k end end
local a = Players[ZAP]:GetUnits():FindID(ZAU)
local d = Players[ZDP]:GetUnits():FindID(ZDU)
if a == nil or d == nil then print("{\"kind\":\"fracvsr\",\"error\":\"nounit\"}") return end
local ok, res = pcall(function()
  return CombatManager.SimulateAttackVersus(a:GetComponentID(), d:GetComponentID(), CombatTypes[ZTYPE])
end)
if not ok or type(res) ~= "table" then
  print("{\"kind\":\"fracvsr\",\"error\":\"nosim\",\"why\":\"" .. tostring(res) .. "\"}") return
end
for k, v in pairs(res) do
  local block = name[k] or tostring(k)
  if type(v) == "table" then
    local parts = {}
    for kk, vv in pairs(v) do
      if type(vv) == "number" then
        parts[#parts + 1] = "\"" .. (name[kk] or tostring(kk)) .. "\":" .. string.format("%.6f", vv)
      end
    end
    print("{\"kind\":\"fracvsr\",\"type\":\"ZTYPE\",\"block\":\"" .. block .. "\"," .. table.concat(parts, ",") .. "}")
  end
end
