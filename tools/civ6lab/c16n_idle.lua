-- GameCore_Tuner: take seat ZSEAT's units that still wait for orders
-- (IsReadyToSelect with moves left: an idle spy held back by --max-start, a
-- Builder) out of ENDTURN_BLOCKING_UNITS by spending their moves
-- (ChangeMovesRemaining); they get them back next turn.
local n, how = 0, {}
for _, u in Players[ZSEAT]:GetUnits():Members() do
  local ok, ready = pcall(function() return u:IsReadyToSelect() end)
  if ok and ready and u:GetMovesRemaining() > 0 and u:GetX() >= 0 then
    u:ChangeMovesRemaining(-u:GetMovesRemaining())
    n = n + 1
    how[#how + 1] = GameInfo.Units[u:GetType()].UnitType:gsub("UNIT_", "")
  end
end
print("idle seat ZSEAT " .. n .. " " .. table.concat(how, ","))
