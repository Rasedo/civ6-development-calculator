-- InGame, C-20-S1: every route the game would path from player ZP's cities to
-- every city of anyone (AI origins included — GetTradeRoutePath takes any
-- origin). Only routes with a path are printed. Each plot is one token:
--   w / l / M     water, land, mountain
--   r             railroad on it (d = any other road)
--   C             a city centre; t = the origin player holds an ACTIVE trading
--                 post there (city:GetTrade():HasActiveTradingPost), i = an
--                 inactive one
--   P / X         a portal entrance / exit (GetTradeRoutePath's 2nd / 3rd
--                 returns, -1 = none)
--   T             a Mountain Tunnel improvement
-- plus the origin gold From PotentialRoute (D) and From Path (P).
--   --set ZP=1 --set ZTAG=sweep
local tm = Game.GetTradeManager()
local gold = GameInfo.Yields["YIELD_GOLD"].Index
local rail = GameInfo.Routes["ROUTE_RAILROAD"].Index
local tunnel = GameInfo.Improvements["IMPROVEMENT_MOUNTAIN_TUNNEL"].Index
local op = ZP
local pl = Players[op]
if pl == nil or not pl:IsAlive() then return end
local function tok(q, i, pe, px)
  local s = q:IsWater() and "w" or (q:IsMountain() and "M" or "l")
  local r = q:GetRouteType()
  if r == rail then s = s .. "r" elseif r >= 0 then s = s .. "d" end
  if q:IsCity() then
    s = s .. "C" .. q:GetOwner()
    local c = Cities.GetCityInPlot(q:GetX(), q:GetY())
    if c ~= nil then
      local ok1, a = pcall(function() return c:GetTrade():HasActiveTradingPost(op) end)
      local ok2, b = pcall(function() return c:GetTrade():HasInactiveTradingPost(op) end)
      if ok1 and a then s = s .. "t" end
      if ok2 and b then s = s .. "i" end
    end
  end
  if pe and pe[i] ~= nil and pe[i] ~= -1 then s = s .. "P" end
  if px and px[i] ~= nil and px[i] ~= -1 then s = s .. "X" end
  if q:GetImprovementType() == tunnel then s = s .. "T" end
  return s
end
for _, oc in pl:GetCities():Members() do
  for dp = 0, 63 do
    local dpl = Players[dp]
    if dpl ~= nil and dpl:IsAlive() then
      for _, dc in dpl:GetCities():Members() do
        if not (dp == op and dc:GetID() == oc:GetID()) then
          local ok, path, pe, px = pcall(function() return tm:GetTradeRoutePath(op, oc:GetID(), dp, dc:GetID()) end)
          if ok and type(path) == "table" and #path > 0 then
            local s = {}
            for i, pi in ipairs(path) do s[#s + 1] = tok(Map.GetPlotByIndex(pi), i, pe, px) end
            local g1 = tm:CalculateOriginYieldFromPotentialRoute(op, oc:GetID(), dp, dc:GetID(), gold)
            local g2 = tm:CalculateOriginYieldFromPath(op, oc:GetID(), dp, dc:GetID(), gold)
            print(string.format('{"kind":"tradesweep","tag":"ZTAG","o":"%d:%d","d":"%d:%d","n":%d,"D":%s,"P":%s,"s":"%s"}',
              op, oc:GetID(), dp, dc:GetID(), #path, tostring(g1), tostring(g2), table.concat(s, " ")))
          end
        end
      end
    end
  end
end
