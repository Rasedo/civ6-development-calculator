-- InGame: dump EVERY numeric field of an attack preview at %.6f.
-- The question is whether any combat quantity the engine hands back is a
-- non-integer. tostring() on a Lua number hides nothing below 1e-14, but
-- %.6f makes it unmistakable, and %s beside it shows the raw formatting.
--   --set ZAP=0 --set ZAU=123 --set ZX=36 --set ZY=15 --set ZTYPE=AIR
local name = {}
for k, v in pairs(CombatResultParameters) do if type(v) == "number" then name[v] = k end end
local a = Players[ZAP]:GetUnits():FindID(ZAU)
if a == nil then print("{\"kind\":\"fracsim\",\"error\":\"nounit\"}") return end
local ok, res = pcall(function()
  return CombatManager.SimulateAttackInto(a:GetComponentID(), CombatTypes[ZTYPE], ZX, ZY)
end)
if not ok or type(res) ~= "table" then print("{\"kind\":\"fracsim\",\"error\":\"nosim\"}") return end
local function walk(prefix, t, depth)
  for k, v in pairs(t) do
    local key = prefix .. "/" .. (name[k] or tostring(k))
    if type(v) == "number" then
      local frac = v - math.floor(v)
      if frac ~= 0 or key:find("STRENGTH") or key:find("DAMAGE") then
        print("{\"kind\":\"fracsim\",\"field\":\"" .. key .. "\",\"f\":" .. string.format("%.6f", v)
          .. ",\"raw\":\"" .. tostring(v) .. "\",\"fractional\":" .. tostring(frac ~= 0) .. "}")
      end
    elseif type(v) == "table" and depth > 0 then
      walk(key, v, depth - 1)
    end
  end
end
walk("r", res, 3)
