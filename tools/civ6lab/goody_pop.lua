-- InGame: walk a unit onto the tribal village. A plain MOVE_TO is enough for a
-- friendly empty tile (the ATTACK modifier is only needed to enter a hostile
-- city), and the pop resolves when the unit arrives.
--   --set ZUNIT=131073 --set ZX=37 --set ZY=16
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
local u = nil
for _, x in Players[0]:GetUnits():Members() do if x:GetID() == ZUNIT then u = x end end
if u == nil then print("{\"kind\":\"goodypop\",\"error\":\"nounit\"}") return end
local params = {}
params[UnitOperationTypes.PARAM_X] = ZX
params[UnitOperationTypes.PARAM_Y] = ZY
local okc, can = pcall(function()
  return UnitManager.CanStartOperation(u, UnitOperationTypes.MOVE_TO, nil, params)
end)
local fired = false
if okc and can then
  fired = pcall(function() UnitManager.RequestOperation(u, UnitOperationTypes.MOVE_TO, params) end)
end
print("{\"kind\":\"goodypop\",\"unit\":" .. ZUNIT .. ",\"target\":\"" .. ZX .. ":" .. ZY .. "\""
  .. ",\"can\":" .. trij(okc, can) .. ",\"fired\":" .. tostring(fired)
  .. ",\"at\":\"" .. u:GetX() .. ":" .. u:GetY() .. "\",\"moves\":" .. u:GetMovesRemaining() .. "}")
