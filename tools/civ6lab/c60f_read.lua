-- GameCore: the Free Cities seat around a fall — p62 alive, its cities, every
-- p62 unit (id, type, class, plot, distance from ZCX:ZCY), every unit within
-- 3 of ZCX:ZCY by owner, the city on ZCX:ZCY (owner, original owner) and
-- seat 0's war with p62.   --set ZCX=69 --set ZCY=21 --set ZTAG=before
local turn = Game.GetCurrentGameTurn()
local fc = Players[62]
local ncity = 0
for _, c in fc:GetCities():Members() do
  ncity = ncity + 1
  print(string.format('{"kind":"fcity","tag":"ZTAG","turn":%d,"id":%d,"x":%d,"y":%d}', turn, c:GetID(), c:GetX(), c:GetY()))
end
print(string.format('{"kind":"seat","tag":"ZTAG","turn":%d,"alive":%s,"cities":%d,"war0":%s,"gold":%.2f}', turn,
  tostring(fc:IsAlive()), ncity, tostring(Players[0]:GetDiplomacy():IsAtWarWith(62)), fc:GetTreasury():GetGoldBalance()))
for _, u in fc:GetUnits():Members() do
  local d = GameInfo.Units[u:GetType()]
  print(string.format('{"kind":"p62","tag":"ZTAG","turn":%d,"id":%d,"type":"%s","class":"%s","x":%d,"y":%d,"dist":%d,"damage":%d}',
    turn, u:GetID(), d.UnitType, tostring(d.FormationClass), u:GetX(), u:GetY(),
    Map.GetPlotDistance(ZCX, ZCY, u:GetX(), u:GetY()), u:GetDamage()))
end
for dx = -4, 4 do
  for dy = -4, 4 do
    local q = Map.GetPlot(ZCX + dx, ZCY + dy)
    if q ~= nil and Map.GetPlotDistance(ZCX, ZCY, q:GetX(), q:GetY()) <= 3 then
      for _, u in ipairs(Units.GetUnitsInPlot(q) or {}) do
        print(string.format('{"kind":"near","tag":"ZTAG","turn":%d,"owner":%d,"id":%d,"type":"%s","x":%d,"y":%d,"damage":%d}',
          turn, u:GetOwner(), u:GetID(), GameInfo.Units[u:GetType()].UnitType, q:GetX(), q:GetY(), u:GetDamage()))
      end
    end
  end
end
local c = Cities.GetCityInPlot(ZCX, ZCY)
if c ~= nil then
  print(string.format('{"kind":"city","tag":"ZTAG","turn":%d,"owner":%d,"orig":%d,"pop":%d}', turn, c:GetOwner(),
    c:GetOriginalOwner(), c:GetPopulation()))
end
