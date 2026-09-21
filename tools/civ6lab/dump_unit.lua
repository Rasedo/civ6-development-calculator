-- Any state: the unit object's own names. Combat strength has been inferred
-- from damage so far, which is backwards if the game exposes the modified
-- strength directly — this lists every method a unit carries in this state, and
-- then tries the plausible strength readers on a named unit.
--   --set ZPLAYER=1 --set ZUNIT=123
local pl = Players[ZPLAYER]
local u = pl:GetUnits():FindID(ZUNIT)
if u == nil then print("{\"kind\":\"dumpunit\",\"error\":\"nounit\"}") return end
local acc = {}
local mt = getmetatable(u)
local okx, idx = pcall(function() return mt and mt["__index"] end)
local src = (okx and type(idx) == "table") and idx or u
for k, v in pairs(src) do if type(k) == "string" then acc[#acc + 1] = k end end
table.sort(acc)
print("{\"kind\":\"dumpunit\",\"methods\":\"" .. table.concat(acc, " ") .. "\"}")
local function T(name, f)
  local ok, v = pcall(f)
  print("{\"kind\":\"dumpunit\",\"call\":\"" .. name .. "\",\"ok\":" .. tostring(ok)
    .. ",\"value\":\"" .. tostring(ok and v or "err") .. "\"}")
end
T("GetCombat", function() return u:GetCombat() end)
T("GetRangedCombat", function() return u:GetRangedCombat() end)
T("GetBombardCombat", function() return u:GetBombardCombat() end)
T("GetAntiAirCombat", function() return u:GetAntiAirCombat() end)
T("GetReligiousStrength", function() return u:GetReligiousStrength() end)
T("GetMaxDamage", function() return u:GetMaxDamage() end)
T("GetDamage", function() return u:GetDamage() end)
