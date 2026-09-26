-- GameCore_Tuner: hand every human seat to the AI for ZTURNS turns (Autoplay,
-- returning to that seat, never -1), for a game `game.py new` hosted with a
-- human slot still taken. Prints the seat and whether Autoplay is on.
local seat = -1
for i = 0, 63 do
  local p = Players[i]
  if p ~= nil and p:IsAlive() and p:IsHuman() then seat = i break end
end
if seat < 0 then print("no human seat") return end
AutoplayManager.SetReturnAsPlayer(seat)
AutoplayManager.SetTurns(ZTURNS)
AutoplayManager.SetActive(true)
print("autoplay seat " .. seat .. " turns ZTURNS active " .. tostring(AutoplayManager.IsActive()))
