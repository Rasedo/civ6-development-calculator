-- InGame: delete every Apostle of player 0 (UnitCommandTypes.DELETE), so a
-- religion scene is not disturbed by a leftover spreader on a later turn.
local n = 0
local kill = {}
for _, u in Players[0]:GetUnits():Members() do
  if GameInfo.Units[u:GetType()].UnitType == "UNIT_APOSTLE" then kill[#kill + 1] = u end
end
for _, u in ipairs(kill) do
  local ok, err = pcall(function() UnitManager.RequestCommand(u, UnitCommandTypes.DELETE) end)
  n = n + 1
  print("delete " .. u:GetID() .. " ok=" .. tostring(ok) .. " err=" .. tostring(err))
end
print("apostles removed " .. n)
