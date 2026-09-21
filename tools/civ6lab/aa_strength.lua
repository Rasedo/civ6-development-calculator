-- InGame: the anti-air preview, in full and without firing anything.
-- CombatManager.SimulateAttackInto(bomber, CombatTypes.AIR, x, y) returns an
-- ANTI_AIR block carrying
--   COMBAT_STRENGTH      the chosen interceptor's BASE anti-air value
--   PREVIEW_TEXT_ASSIST  the support bonus as text ("+15 anti-air unit support")
--   PREVIEW_TEXT_MODIFIER other strength modifiers (difficulty, etc.)
--   DAMAGE_FROM          the damage the bomber is expected to take
--   ID / LOCATION        WHICH interceptor the game picked
-- so the stacking bonus, the chosen unit and the expected damage are all reads.
--   --set ZAU=123 --set ZX=36 --set ZY=15
local name = {}
for k, v in pairs(CombatResultParameters) do if type(v) == "number" then name[v] = k end end
local a = Players[0]:GetUnits():FindID(ZAU)
if a == nil then print("{\"kind\":\"aastr\",\"error\":\"nobomber\"}") return end
local ok, res = pcall(function()
  return CombatManager.SimulateAttackInto(a:GetComponentID(), CombatTypes.AIR, ZX, ZY)
end)
if not ok or type(res) ~= "table" then print("{\"kind\":\"aastr\",\"error\":\"nosim\"}") return end
local function esc(s) return tostring(s):gsub('"', "'") end
for k, v in pairs(res) do
  local blockName = name[k] or tostring(k)
  if type(v) == "table" and (blockName == "ANTI_AIR" or blockName == "INTERCEPTOR") then
    local cs, dmgFrom, dmgTo, uid, lx, ly = "?", "?", "?", "?", "?", "?"
    local texts = {}
    for kk, vv in pairs(v) do
      local f = name[kk] or tostring(kk)
      if f == "COMBAT_STRENGTH" then cs = tostring(vv) end
      if f == "DAMAGE_FROM" then dmgFrom = tostring(vv) end
      if f == "DAMAGE_TO" then dmgTo = tostring(vv) end
      if f == "ID" and type(vv) == "table" then uid = tostring(vv.id) end
      if f == "LOCATION" and type(vv) == "table" then lx, ly = tostring(vv.x), tostring(vv.y) end
      if (f == "PREVIEW_TEXT_ASSIST" or f == "PREVIEW_TEXT_MODIFIER") and type(vv) == "table" then
        for _, line in pairs(vv) do texts[#texts + 1] = esc(line) end
      end
    end
    print("{\"kind\":\"aastr\",\"block\":\"" .. blockName .. "\",\"strength\":" .. cs
      .. ",\"damageFrom\":" .. dmgFrom .. ",\"damageTo\":" .. dmgTo
      .. ",\"unit\":" .. uid .. ",\"at\":\"" .. lx .. ":" .. ly .. "\""
      .. ",\"texts\":\"" .. table.concat(texts, " | ") .. "\"}")
  end
end
