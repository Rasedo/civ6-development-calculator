-- GameCore_Tuner: clear ONLY the aim plot's fallout, and put a fresh marker on
-- it if none stands there, WITHOUT touching the interceptors. intercept_stack
-- wipes and rebuilds the guards, which is exactly what the once-per-turn
-- battery must not do.
--   --set ZAX=36 --set ZAY=15 --set ZWAR=1 --set ZMARKER=UNIT_WARRIOR
local fm = Game.GetFalloutManager()
local aim = Map.GetPlot(ZAX, ZAY)
pcall(function() fm:SetFalloutTurnsRemaining(aim:GetIndex(), 0) end)
local pe = Players[ZWAR]
local here = nil
for _, u in pe:GetUnits():Members() do
  if u:GetX() == ZAX and u:GetY() == ZAY then here = u end
end
local made = false
if here == nil then
  local u = pe:GetUnits():Create(GameInfo.Units["ZMARKER"].Index, ZAX, ZAY)
  made = u ~= nil
  here = u
end
print("{\"kind\":\"clearaim\",\"at\":\"" .. ZAX .. ":" .. ZAY .. "\""
  .. ",\"fallout\":" .. tostring(fm:GetFalloutTurnsRemaining(aim:GetIndex()))
  .. ",\"markerMade\":" .. tostring(made)
  .. ",\"marker\":" .. (here and here:GetID() or -1) .. "}")
