-- InGame: the Nuclear Emergency both engines raise after a launch
-- (cpu/core/combat.ts calls raiseEmergency(EMERGENCY_NUCLEAR, ...) against the
-- LAUNCHER's own capital). The live manager carries GetEmergencyInfoTable /
-- GetSingleEmergency / GetNextBlockingEmergency and nothing else, so both
-- shapes are tried and whatever comes back is printed field by field.
local em = Game.GetEmergencyManager()
local function dump(label, t, depth)
  if type(t) ~= "table" then
    print("{\"kind\":\"emergency\",\"" .. label .. "\":\"" .. tostring(t) .. "\"}")
    return
  end
  local n = 0
  for k, v in pairs(t) do
    n = n + 1
    if type(v) == "table" and depth > 0 then
      dump(label .. "." .. tostring(k), v, depth - 1)
    else
      print("{\"kind\":\"emergency\",\"path\":\"" .. label .. "." .. tostring(k) .. "\",\"value\":\"" .. tostring(v) .. "\"}")
    end
  end
  if n == 0 then print("{\"kind\":\"emergency\",\"path\":\"" .. label .. "\",\"value\":\"EMPTY\"}") end
end
local ok, t = pcall(function() return em:GetEmergencyInfoTable(0) end)
if ok then dump("infoTable(0)", t, 2) else
  local ok2, t2 = pcall(function() return em:GetEmergencyInfoTable() end)
  if ok2 then dump("infoTable()", t2, 2) else print("{\"kind\":\"emergency\",\"infoTable\":\"err\"}") end
end
-- grievances, which a launch also feeds
local d0 = Players[0]:GetDiplomacy()
local parts = {}
for _, pl in ipairs(Players) do
  local i = pl:GetID()
  if i >= 0 and i < 12 then
    local okg, g = pcall(function() return Players[i]:GetDiplomacy():GetGrievancesAgainst(0) end)
    if okg and g ~= nil then parts[#parts + 1] = "\"" .. i .. "\":" .. tostring(g) end
  end
end
print("{\"kind\":\"grievances-against-player0\"," .. table.concat(parts, ",") .. "}")
