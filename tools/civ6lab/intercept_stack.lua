-- GameCore_Tuner: rebuild the interception scene with N interceptors on NAMED
-- tiles, to separate the stacking rules. If each adjacent interceptor makes its
-- own anti-air attack the bomber takes two rolls (two draws, damage adds); if
-- only one fires, the second changes nothing.
-- Every unit of ZWAR within 1 of the aim plot is cleared first, the fallout is
-- reset, and a fresh marker is placed, so each round starts identical.
--   --set ZAX=36 --set ZAY=15 --set ZWAR=1 --set ZUNIT=UNIT_MOBILE_SAM
--   --set ZN=2 --set ZG1X=37 --set ZG1Y=14 --set ZG2X=35 --set ZG2Y=14 --set ZG3X=36 --set ZG3Y=16
local fm = Game.GetFalloutManager()
local aim = Map.GetPlot(ZAX, ZAY)
pcall(function() fm:SetFalloutTurnsRemaining(aim:GetIndex(), 0) end)
local pe = Players[ZWAR]
local doomed = {}
for _, u in pe:GetUnits():Members() do
  if Map.GetPlotDistance(ZAX, ZAY, u:GetX(), u:GetY()) <= 1 then doomed[#doomed + 1] = u:GetID() end
end
for _, id in ipairs(doomed) do
  local u = pe:GetUnits():FindID(id)
  if u ~= nil then pe:GetUnits():Destroy(u) end
end
-- the marker must be able to STAND on the aim plot: a Warrior cannot sit on
-- water, and without a defender there the attack preview comes back empty,
-- which reads exactly like "no interception".
local marker = pe:GetUnits():Create(GameInfo.Units["ZMARKER"].Index, ZAX, ZAY)
local tiles = { { ZG1X, ZG1Y }, { ZG2X, ZG2Y }, { ZG3X, ZG3Y }, { ZG4X, ZG4Y } }
local ids = {}
for i = 1, ZN do
  local t = tiles[i]
  local u = pe:GetUnits():Create(GameInfo.Units["ZUNIT"].Index, t[1], t[2])
  ids[#ids + 1] = "{\"id\":" .. (u and u:GetID() or -1) .. ",\"at\":\"" .. t[1] .. ":" .. t[2]
    .. "\",\"made\":" .. tostring(u ~= nil) .. "}"
end
print("{\"kind\":\"stackreset\",\"aim\":\"" .. ZAX .. ":" .. ZAY .. "\",\"marker\":"
  .. (marker and marker:GetID() or -1) .. ",\"guards\":[" .. table.concat(ids, ",") .. "]"
  .. ",\"cleared\":" .. #doomed
  .. ",\"aimFallout\":" .. tostring(fm:GetFalloutTurnsRemaining(aim:GetIndex())) .. "}")
