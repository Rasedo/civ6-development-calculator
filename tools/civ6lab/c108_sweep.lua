-- InGame, C-108: for origin player ZP, every origin city against every other
-- living city of anyone (barbarians excepted): CanStartRoute, the path
-- GetTradeRoutePath answers (plot indices, portal entrance / exit arrays,
-- -1 = none) and the pair's standing (met, at war), one JSON line a pair.
-- ZP = -1 instead prints the constructed trading posts: one line per city,
-- the players holding an active / an inactive post there.
--   --set ZP=<player> --set ZTAG=<label>
local tm = Game.GetTradeManager()
local function list(t)
  local o = {}
  for i = 1, #(t or {}) do o[i] = tostring(t[i]) end
  return "[" .. table.concat(o, ",") .. "]"
end
local function plotOf(c) return Map.GetPlot(c:GetX(), c:GetY()):GetIndex() end
local living = {}
for p = 0, 62 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() and pl:GetCities():GetCount() > 0 then living[#living + 1] = p end
end
if ZP < 0 then
  for _, p in ipairs(living) do
    for _, c in Players[p]:GetCities():Members() do
      local act, ina = {}, {}
      for _, q in ipairs(living) do
        local ok1, a = pcall(function() return c:GetTrade():HasActiveTradingPost(q) end)
        local ok2, b = pcall(function() return c:GetTrade():HasInactiveTradingPost(q) end)
        if ok1 and a then act[#act + 1] = q end
        if ok2 and b then ina[#ina + 1] = q end
      end
      print(string.format('{"kind":"c108post","tag":"ZTAG","turn":%d,"city":"%d:%d","plot":%d,"active":%s,"inactive":%s}',
        Game.GetCurrentGameTurn(), p, c:GetID(), plotOf(c), list(act), list(ina)))
    end
  end
  return
end
local op = ZP
local pl = Players[op]
if pl == nil or not pl:IsAlive() then return end
local dip = pl:GetDiplomacy()
for _, oc in pl:GetCities():Members() do
  for _, dp in ipairs(living) do
    local met = dp == op or (pcall(function() return dip:HasMet(dp) end) and dip:HasMet(dp))
    local war = dp ~= op and (pcall(function() return dip:IsAtWarWith(dp) end) and dip:IsAtWarWith(dp))
    for _, dc in Players[dp]:GetCities():Members() do
      if not (dp == op and dc:GetID() == oc:GetID()) then
        local okc, can = pcall(function() return tm:CanStartRoute(op, oc:GetID(), dp, dc:GetID()) end)
        local okp, path, pe, px = pcall(function() return tm:GetTradeRoutePath(op, oc:GetID(), dp, dc:GetID()) end)
        local ent, ex = {}, {}
        if okp then
          for i, v in ipairs(pe or {}) do if v ~= -1 then ent[#ent + 1] = i - 1 end end
          for i, v in ipairs(px or {}) do if v ~= -1 then ex[#ex + 1] = i - 1 end end
        end
        print(string.format('{"kind":"c108pair","tag":"ZTAG","o":"%d:%d","op":%d,"oplot":%d,"d":"%d:%d","dp":%d,"dplot":%d,'
          .. '"can":%s,"met":%s,"war":%s,"path":%s,"portalIn":%s,"portalOut":%s}',
          op, oc:GetID(), op, plotOf(oc), dp, dc:GetID(), dp, plotOf(dc),
          okc and tostring(can == true) or '"err"', tostring(met == true), tostring(war == true),
          (okp and type(path) == "table") and list(path) or "[]", list(ent), list(ex)))
      end
    end
  end
end
