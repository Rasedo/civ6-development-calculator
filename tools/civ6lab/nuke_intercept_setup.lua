-- GameCore_Tuner: the interception scene. CIV6 (Nuclear weapons): "Destroyers,
-- Battleships, Missile Cruisers, and Mobile SAMs can protect adjacent tiles
-- from nuclear strikes" — a clause BOTH engines ship (cpu/core/combat.ts
-- `nukeInterceptor`, gpu/core/sim_seats.py `_nuke_intercepted`) with no roll
-- behind it, and which nobody has ever fired at.
-- Puts one ZUNIT of player ZWAR at distance ZGD from the aim plot ZAX:ZAY and
-- a marker unit ON the aim plot, so the strike has something to kill if it
-- lands. ZGD=1 tests the clause; ZGD=2 tests whether ADJACENCY is what it
-- keys off, since a guard 2 away is still inside a thermonuclear's radius.
--   --set ZAX=33 --set ZAY=20 --set ZWAR=1 --set ZUNIT=UNIT_MOBILE_SAM --set ZGD=1
local pe = Players[ZWAR]
local aim = Map.GetPlot(ZAX, ZAY)
local row = GameInfo.Units["ZUNIT"]
if row == nil then print("{\"kind\":\"intercept-setup\",\"error\":\"nounitrow\"}") return end
-- the guard goes on the first empty passable land neighbour of the aim plot
local guard, gx, gy = nil, -1, -1
for i = 0, Map.GetPlotCount() - 1 do
  local q = Map.GetPlotByIndex(i)
  if guard == nil and Map.GetPlotDistance(ZAX, ZAY, q:GetX(), q:GetY()) == ZGD
     and not q:IsWater() and not q:IsImpassable() and q:GetUnitCount() == 0 then
    guard = pe:GetUnits():Create(row.Index, q:GetX(), q:GetY())
    if guard ~= nil then gx, gy = q:GetX(), q:GetY() end
  end
end
local marker = nil
if aim:GetUnitCount() == 0 then
  marker = pe:GetUnits():Create(GameInfo.Units["UNIT_WARRIOR"].Index, ZAX, ZAY)
end
local fm = Game.GetFalloutManager()
print("{\"kind\":\"intercept-setup\",\"aim\":\"" .. ZAX .. ":" .. ZAY .. "\",\"guard\":\"ZUNIT\""
  .. ",\"guardAt\":\"" .. gx .. ":" .. gy .. "\",\"guardMade\":" .. tostring(guard ~= nil)
  .. ",\"guardID\":" .. (guard and guard:GetID() or -1)
  .. ",\"markerMade\":" .. tostring(marker ~= nil)
  .. ",\"markerID\":" .. (marker and marker:GetID() or -1)
  .. ",\"aimUnits\":" .. aim:GetUnitCount()
  .. ",\"aimFallout\":" .. tostring(fm:GetFalloutTurnsRemaining(aim:GetIndex()))
  .. ",\"aimOwner\":" .. tostring(aim:GetOwner()) .. "}")
