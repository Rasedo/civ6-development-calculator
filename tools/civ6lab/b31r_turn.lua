-- InGame, once per turn of B-31r-S1: for seat 0's unit ZUID, if an enemy
-- Trader (of a major at war with seat 0) stands within ZREACH, attack-move
-- onto it (MOVE_TO + ATTACK) and, when the plunder command is offered on
-- that plot, request UNITCOMMAND_PLUNDER_TRADE_ROUTE. One JSON line: the
-- unit, the trader (owner, id, plot, water), the gold, faith, science and
-- culture progress before, and what was requested. The payout is read by
-- the caller once the command has landed.
--   --set ZUID=123 --set ZREACH=2
local function tri(ok, v)
  local s = ok and tostring(v) or ("err:" .. tostring(v):match("[^\n]*"))
  return (s:gsub('[%c"\\]', function(c) return string.format("\\u%04x", c:byte()) end))
end
local pl = Players[0]
local u = pl:GetUnits():FindID(ZUID)
local turn = Game.GetCurrentGameTurn()
if u == nil then print('{"kind":"plunder","turn":' .. turn .. ',"unit":ZUID,"state":"nounit"}') return end
local tr = GameInfo.Units["UNIT_TRADER"].Index
local best, bd = nil, 99
for p = 1, 62 do
  local o = Players[p]
  if o ~= nil and o:IsAlive() and o:IsMajor() and pl:GetDiplomacy():IsAtWarWith(p) then
    for _, x in o:GetUnits():Members() do
      if x:GetType() == tr then
        local d = Map.GetPlotDistance(u:GetX(), u:GetY(), x:GetX(), x:GetY())
        if d < bd then best, bd = x, d end
      end
    end
  end
end
local function purse()
  local ok1, g = pcall(function() return pl:GetTreasury():GetGoldBalance() end)
  local ok2, f = pcall(function() return pl:GetReligion():GetFaithBalance() end)
  local ok3, s = pcall(function() local t = pl:GetTechs(); return t:GetResearchProgress(t:GetResearchingTech()) end)
  local ok4, c = pcall(function() local k = pl:GetCulture(); return k:GetCulturalProgress(k:GetProgressingCivic()) end)
  return string.format('"gold":"%s","faith":"%s","sci":"%s","cul":"%s"', tri(ok1, g), tri(ok2, f), tri(ok3, s), tri(ok4, c))
end
if best == nil or bd > ZREACH then
  print(string.format('{"kind":"plunder","turn":%d,"unit":%d,"state":"notrader","nearest":%d}', turn, ZUID, bd))
  return
end
local state = "on"
if bd > 0 then
  local t = {}
  t[UnitOperationTypes.PARAM_X] = best:GetX()
  t[UnitOperationTypes.PARAM_Y] = best:GetY()
  t[UnitOperationTypes.PARAM_MODIFIERS] = UnitOperationMoveModifiers.ATTACK + UnitOperationMoveModifiers.MOVE_IGNORE_UNEXPLORED_DESTINATION
  local okc, can = pcall(function() return UnitManager.CanStartOperation(u, UnitOperationTypes.MOVE_TO, nil, t) end)
  if okc and can then UnitManager.RequestOperation(u, UnitOperationTypes.MOVE_TO, t); state = "moved" else state = "cannotmove" end
end
local q = Map.GetPlot(best:GetX(), best:GetY())
print(string.format('{"kind":"plunder","turn":%d,"unit":%d,"state":"%s","trader":%d,"owner":%d,"x":%d,"y":%d,"water":%s,"dist":%d,%s}',
  turn, ZUID, state, best:GetID(), best:GetOwner(), best:GetX(), best:GetY(), tostring(q:IsWater()), bd, purse()))
