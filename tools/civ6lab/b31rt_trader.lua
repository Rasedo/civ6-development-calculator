-- InGame, B-31r: one Trader of player ZP (id ZT) — where it stands on its
-- route: the route's origin / destination, both sides' yields, the path
-- (GetTradeRoutePath) length, the Trader's index on that path (-1 when off
-- it), its hex distance to both ends, and its moves. One JSON line.
--   --set ZP=1 --set ZT=1900555
local tm = Game.GetTradeManager()
local u = Players[ZP]:GetUnits():FindID(ZT)
if u == nil then print('{"kind":"trader","id":ZT,"error":"gone"}') return end
local found = nil
for _, c in Players[ZP]:GetCities():Members() do
  local ok, routes = pcall(function() return c:GetTrade():GetOutgoingRoutes() end)
  for _, r in ipairs(ok and routes or {}) do if r.TraderUnitID == ZT then found = {c, r} end end
end
if found == nil then
  print(string.format('{"kind":"trader","id":%d,"x":%d,"y":%d,"error":"noroute"}', ZT, u:GetX(), u:GetY())) return
end
local c, r = found[1], found[2]
local dc = Players[r.DestinationCityPlayer]:GetCities():FindID(r.DestinationCityID)
local path = {}
pcall(function() path = tm:GetTradeRoutePath(r.OriginCityPlayer, r.OriginCityID, r.DestinationCityPlayer, r.DestinationCityID) end)
local here = Map.GetPlotIndex(u:GetX(), u:GetY())
local at = -1
for i, pi in ipairs(path) do if pi == here then at = i - 1 end end
local function ys(t) local o = {} for _, y in ipairs(t or {}) do o[#o + 1] = string.format("%.4f", y.Amount) end return "[" .. table.concat(o, ",") .. "]" end
local water = 0
for _, pi in ipairs(path) do if Map.GetPlotByIndex(pi):IsWater() then water = water + 1 end end
print(string.format('{"kind":"trader","turn":%d,"id":%d,"x":%d,"y":%d,"origin":"%s","ox":%d,"oy":%d,"destPlayer":%d,"dest":"%s","dx":%d,"dy":%d,'
  .. '"pathLen":%d,"pathWater":%d,"at":%d,"toOrigin":%d,"toDest":%d,"moves":%d,"originYields":%s,"destYields":%s}',
  Game.GetCurrentGameTurn(), ZT, u:GetX(), u:GetY(), c:GetName(), c:GetX(), c:GetY(), r.DestinationCityPlayer,
  dc and dc:GetName() or "?", dc and dc:GetX() or -1, dc and dc:GetY() or -1, #path, water, at,
  Map.GetPlotDistance(u:GetX(), u:GetY(), c:GetX(), c:GetY()), dc and Map.GetPlotDistance(u:GetX(), u:GetY(), dc:GetX(), dc:GetY()) or -1,
  u:GetMovesRemaining(), ys(r.OriginYields), ys(r.DestinationYields)))
