-- InGame: start one offensive spy mission. Seed accounting only works on an
-- action that resolves INSIDE the call — combat does, and this probe finds out
-- whether an espionage roll does too, by being fired between a GameCore seed
-- set and a GameCore seed read. If the state advances here, the outcome is
-- rolled at REQUEST time and the whole espionage roll becomes measurable; if it
-- does not, the roll waits for the mission's completion turn, where the stream
-- is shared with every other actor and seed accounting cannot isolate it.
--   --set ZSPY=123 --set ZTX=8 --set ZTY=12 --set ZOP=UNITOPERATION_SPY_SIPHON_FUNDS
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
local spy = nil
for _, u in Players[0]:GetUnits():Members() do
  if u:GetID() == ZSPY then spy = u end
end
if spy == nil then print("{\"kind\":\"spymission\",\"error\":\"nospy\"}") return end
local op = GameInfo.UnitOperations["ZOP"]
if op == nil then print("{\"kind\":\"spymission\",\"error\":\"noop\"}") return end
local params = {}
params[UnitOperationTypes.PARAM_X] = ZTX
params[UnitOperationTypes.PARAM_Y] = ZTY
local okc, can = pcall(function() return UnitManager.CanStartOperation(spy, op.Hash, nil, params) end)
local okc2, can2 = pcall(function() return UnitManager.CanStartOperation(spy, op.Hash, nil, true) end)
local fired = false
if (okc and can) or (okc2 and can2) then
  fired = pcall(function() UnitManager.RequestOperation(spy, op.Hash, params) end)
end
print("{\"kind\":\"spymission\",\"op\":\"ZOP\",\"spy\":" .. ZSPY
  .. ",\"can\":" .. trij(okc, can) .. ",\"canNoParams\":" .. trij(okc2, can2)
  .. ",\"fired\":" .. tostring(fired)
  .. ",\"spyAt\":\"" .. spy:GetX() .. ":" .. spy:GetY() .. "\""
  .. ",\"moves\":" .. spy:GetMovesRemaining() .. "}")
