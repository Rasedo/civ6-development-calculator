-- InGame: SimulateAttackVersus with its keys DECODED. The result table is keyed
-- by hashes, which are the values of the CombatResultParameters enum, so a
-- hash->name map turns the preview into readable fields — including each side's
-- modified strength and the list of modifiers that produced it, which is the
-- whole point: buffs read rather than inferred from damage.
--   --set ZAP=0 --set ZAU=123 --set ZDP=1 --set ZDU=456 --set ZTYPE=RANGED
local name = {}
for _, tbl in ipairs({ "CombatResultParameters", "CombatResultStats", "CombatResults" }) do
  local ok, t = pcall(function() return _ENV and _ENV[tbl] end)
  if not ok or t == nil then
    if tbl == "CombatResultParameters" then t = CombatResultParameters end
  end
  if type(t) == "table" then
    for k, v in pairs(t) do
      if type(v) == "number" then name[v] = tbl .. "." .. k end
    end
  end
end
local a = Players[ZAP]:GetUnits():FindID(ZAU)
local d = Players[ZDP]:GetUnits():FindID(ZDU)
if a == nil or d == nil then print("{\"kind\":\"sim3\",\"error\":\"nounit\"}") return end
local res = CombatManager.SimulateAttackVersus(a:GetComponentID(), d:GetComponentID(), CombatTypes["ZTYPE"])
local function label(k)
  if name[k] then return name[k] end
  return tostring(k)
end
local function dump(prefix, t, depth)
  for k, v in pairs(t) do
    local key = prefix .. "/" .. label(k)
    if type(v) == "table" and depth > 0 then
      dump(key, v, depth - 1)
    else
      print("{\"kind\":\"sim3\",\"field\":\"" .. key .. "\",\"value\":\"" .. tostring(v) .. "\"}")
    end
  end
end
if type(res) ~= "table" then print("{\"kind\":\"sim3\",\"result\":\"" .. tostring(res) .. "\"}") return end
dump("r", res, 2)
