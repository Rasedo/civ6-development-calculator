-- GameCore: a signature of the live game state, to show whether anything
-- moves while a turn is held: per alive major, its units' plots and moves
-- left summed, its gold and science, and the game's rand seed.
local parts = { "turn " .. Game.GetCurrentGameTurn() }
for _, p in ipairs(PlayerManager.GetAliveMajorIDs()) do
  local pl = Players[p]
  local sx, mv, n = 0, 0, 0
  for _, u in pl:GetUnits():Members() do
    n = n + 1
    sx = sx + u:GetX() * 131 + u:GetY() * 7
    mv = mv + u:GetMovesRemaining()
  end
  parts[#parts + 1] = string.format("p%d u%d pos%d mv%d g%.1f act%s", p, n, sx, mv,
    pl:GetTreasury():GetGoldBalance(), tostring(pl:IsTurnActive()))
end
parts[#parts + 1] = "seed " .. tostring(Game.GetRandomSeed())
print(table.concat(parts, " | "))
