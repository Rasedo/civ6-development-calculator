-- GameCore_Tuner: did the blast land on a plot a Mobile SAM was standing next
-- to? Reads the aim plot's fallout, the marker unit on it and the guard unit
-- beside it. A strike that was INTERCEPTED spends the warhead and leaves no
-- fallout; a strike that landed contaminates the aim plot and kills both units.
--   --set ZAX=33 --set ZAY=20 --set ZGUARD=7536674 --set ZMARKER=7602209 --set ZWAR=1
local fm = Game.GetFalloutManager()
local aim = Map.GetPlot(ZAX, ZAY)
local pe = Players[ZWAR]
local g = pe:GetUnits():FindID(ZGUARD)
local m = pe:GetUnits():FindID(ZMARKER)
local function u(x)
  if x == nil then return "\"dead\"" end
  return "{\"x\":" .. x:GetX() .. ",\"y\":" .. x:GetY() .. ",\"hp\":" .. (x:GetMaxDamage() - x:GetDamage()) .. "}"
end
local ring = 0
for i = 0, Map.GetPlotCount() - 1 do
  local q = Map.GetPlotByIndex(i)
  if Map.GetPlotDistance(ZAX, ZAY, q:GetX(), q:GetY()) <= 2
     and fm:GetFalloutTurnsRemaining(q:GetIndex()) > 0 then ring = ring + 1 end
end
print("{\"kind\":\"intercept-read\",\"turn\":" .. Game.GetCurrentGameTurn()
  .. ",\"aim\":\"" .. ZAX .. ":" .. ZAY .. "\",\"aimFallout\":" .. tostring(fm:GetFalloutTurnsRemaining(aim:GetIndex()))
  .. ",\"contaminatedWithin2\":" .. ring
  .. ",\"aimUnits\":" .. aim:GetUnitCount()
  .. ",\"guard\":" .. u(g) .. ",\"marker\":" .. u(m) .. "}")
