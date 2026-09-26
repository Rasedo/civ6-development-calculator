-- GameCore_Tuner: one line per turn — the turn, the winner (nil while none)
-- and each major's IsAlive; the watch's per-turn reader for the end-game test.
local alive = {}
for p = 0, 62 do
  local pl = Players[p]
  if pl ~= nil and pl:IsMajor() then alive[#alive + 1] = '"' .. p .. '":' .. tostring(pl:IsAlive()) end
end
local ok, w = pcall(function() return Game.GetWinningTeam() end)
print('{"turn":' .. Game.GetCurrentGameTurn() .. ',"winner":"' .. tostring(ok and w or "err") .. '","alive":{' .. table.concat(alive, ",") .. '}}')
