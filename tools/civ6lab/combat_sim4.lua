-- InGame: the two calls that could read an interception BEFORE it happens.
--   CombatManager.SimulateAttackInto(attackerComponentID, eCombatType, x, y)
--     — the plot-targeted preview the UI uses for an attack into a tile
--   CombatManager.GetBestInterceptor(...)
--     — the game's own answer to "which unit intercepts?", signature unknown,
--       so every plausible shape is tried once
-- Keys are decoded through CombatResultParameters.
--   --set ZAP=0 --set ZAU=123 --set ZX=36 --set ZY=15 --set ZTYPE=AIR
-- a pcall read in three states: its value, or "err:<msg>" when the call threw
local function tri(ok, v)
  local s = ok and tostring(v) or ("err:" .. tostring(v))
  return (s:gsub('[%c"\\]', function(c) return string.format("\\u%04x", c:byte()) end))
end
local function trij(ok, v)
  if ok and (type(v) == "boolean" or type(v) == "number") then return tostring(v) end
  if ok and v == nil then return "null" end
  return "\"" .. tri(ok, v) .. "\""
end
local name = {}
if type(CombatResultParameters) == "table" then
  for k, v in pairs(CombatResultParameters) do
    if type(v) == "number" then name[v] = k end
  end
end
local a = Players[ZAP]:GetUnits():FindID(ZAU)
if a == nil then print("{\"kind\":\"sim4\",\"error\":\"nounit\"}") return end
local acid = a:GetComponentID()
local function label(k) return name[k] or tostring(k) end
local function dump(prefix, t, depth)
  if type(t) ~= "table" then
    print("{\"kind\":\"sim4\",\"field\":\"" .. prefix .. "\",\"value\":\"" .. tostring(t) .. "\"}")
    return
  end
  for k, v in pairs(t) do
    local key = prefix .. "/" .. label(k)
    if type(v) == "table" and depth > 0 then dump(key, v, depth - 1)
    else print("{\"kind\":\"sim4\",\"field\":\"" .. key .. "\",\"value\":\"" .. tostring(v) .. "\"}") end
  end
end
for _, n in ipairs({ "AIR", "ICBM", "RANGED" }) do
  local ok, res = pcall(function()
    return CombatManager.SimulateAttackInto(acid, CombatTypes[n], ZX, ZY)
  end)
  if ok and type(res) == "table" then dump("into_" .. n, res, 2)
  else print("{\"kind\":\"sim4\",\"into_" .. n .. "\":\"" .. tri(ok, res) .. "\"}") end
end
local function T(label2, f)
  local ok, v = pcall(f)
  local out = v
  if type(v) == "table" then
    local parts = {}
    for k, vv in pairs(v) do parts[#parts + 1] = tostring(k) .. "=" .. tostring(vv) end
    out = table.concat(parts, " ")
  end
  print("{\"kind\":\"sim4\",\"call\":\"" .. label2 .. "\",\"ok\":" .. tostring(ok)
    .. ",\"value\":\"" .. tri(ok, out) .. "\"}")
end
T("GetBestInterceptor(acid,x,y)", function() return CombatManager.GetBestInterceptor(acid, ZX, ZY) end)
T("GetBestInterceptor(x,y)", function() return CombatManager.GetBestInterceptor(ZX, ZY) end)
T("GetBestInterceptor(acid)", function() return CombatManager.GetBestInterceptor(acid) end)
T("GetBestInterceptor(player,x,y)", function() return CombatManager.GetBestInterceptor(ZAP, ZX, ZY) end)
T("GetBestDefender(x,y)", function() return CombatManager.GetBestDefender(ZX, ZY) end)
T("CanAttackTarget(acid,x,y)", function() return CombatManager.CanAttackTarget(acid, ZX, ZY) end)
