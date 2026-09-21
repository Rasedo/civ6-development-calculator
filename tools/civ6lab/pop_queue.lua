-- GameCore_Tuner: has the WMD queue drained? A requested strike spends the
-- warhead and the bomber's moves only when it EXECUTES, so the stock plus the
-- per-bomber moves say how many of the requested strikes have actually landed.
local p0 = Players[0]
local w = p0:GetWMDs()
local withMoves, spent = 0, 0
for _, u in p0:GetUnits():Members() do
  if GameInfo.Units[u:GetType()].UnitType == "UNIT_BOMBER" then
    if u:GetMovesRemaining() > 0 then withMoves = withMoves + 1 else spent = spent + 1 end
  end
end
print("{\"kind\":\"queue\",\"turn\":" .. Game.GetCurrentGameTurn()
  .. ",\"thermo\":" .. w:GetWeaponCount(GameInfo.WMDs["WMD_THERMONUCLEAR_DEVICE"].Index)
  .. ",\"bombersWithMoves\":" .. withMoves .. ",\"bombersSpent\":" .. spent .. "}")
