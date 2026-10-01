-- InGame (C-2, lab 5g): every diplomacy statement between two majors, its type
-- and subtype by `DiplomacyManager.GetKeyName` as DiplomacyActionView.lua's
-- OnDiplomacyStatement reads them, printed to Lua.log as "C2STMT ..." lines
-- (the handler outlives this call; a load drops it).
local function name(h)
  local ok, n = pcall(function() return DiplomacyManager.GetKeyName(h) end)
  return ok and tostring(n) or ("err:" .. tostring(n))
end
Events.DiplomacyStatement.Add(function(from, to, kv)
  local parts = {}
  for k, v in pairs(kv or {}) do
    if type(v) ~= "table" then parts[#parts + 1] = tostring(k) .. "=" .. tostring(v) end
  end
  print(string.format("C2STMT turn %d from %d to %d type %s sub %s | %s", Game.GetCurrentGameTurn(), from, to,
    name(kv and kv.StatementType), name(kv and kv.StatementSubType), table.concat(parts, " ")))
end)
print("C2STMT listener installed")
