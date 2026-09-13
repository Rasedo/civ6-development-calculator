-- InGame: the local player's spies (where, which operation, turns left) and
-- the recent mission history with initial and escape results, counted.
local me = Game.GetLocalPlayer()
local pl = Players[me]
local names = {}
for k, v in pairs(EspionageResultTypes) do names[v] = k end
local active, idle = 0, 0
for _, u in pl:GetUnits():Members() do
  if GameInfo.Units[u:GetType()].UnitType == "UNIT_SPY" then
    local op = u:GetSpyOperation()
    if op ~= nil and op >= 0 then
      active = active + 1
      print(string.format("spy %d at %d:%d op %s ends t%s", u:GetID(), u:GetX(), u:GetY(),
        GameInfo.UnitOperations[op].OperationType:gsub("UNITOPERATION_SPY_", ""), tostring(u:GetSpyOperationEndTurn())))
    else
      idle = idle + 1
      print(string.format("spy %d at %d:%d IDLE", u:GetID(), u:GetX(), u:GetY()))
    end
  end
end
local hist = pl:GetDiplomacy():GetRecentMissions(me, 200, 0) or {}
local tally = {}
local n = 0
for _, m in pairs(hist) do
  n = n + 1
  local op = GameInfo.UnitOperations[m.Operation]
  local key = (op and op.OperationType:gsub("UNITOPERATION_SPY_", "") or tostring(m.Operation))
    .. " " .. tostring(names[m.InitialResult]) .. " / " .. tostring(names[m.EscapeResult])
  tally[key] = (tally[key] or 0) + 1
  local parts = {}
  for k, v in pairs(m) do parts[#parts + 1] = tostring(k) .. "=" .. tostring(v) end
  table.sort(parts)
  print("mission " .. table.concat(parts, " "))
end
local keys = {}
for k in pairs(tally) do keys[#keys + 1] = k end
table.sort(keys)
for _, k in ipairs(keys) do print("tally " .. tally[k] .. "  " .. k) end
print("turn " .. Game.GetCurrentGameTurn() .. " spies active " .. active .. " idle " .. idle .. " missions " .. n
      .. " captured-enemy " .. tostring(pl:GetDiplomacy():GetNumSpiesCaptured()))
