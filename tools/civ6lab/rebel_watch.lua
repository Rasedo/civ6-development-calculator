-- InGame, once per turn (`watch.py --lua rebel_watch.lua --state InGame`):
-- the REBELLION trail. One JSON line per major's city in Unrest or Revolt
-- (the Happinesses index 1 or 0) and one per unit of the barbarians and of
-- the Free Cities, so a rebel squad shows as unit ids that appear beside an
-- unhappy city (Unit_RebellionTags: anti-cavalry, then ranged, by level).
local turn = Game.GetCurrentGameTurn()
for p = 0, 63 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() then
    if pl:IsMajor() then
      for _, c in pl:GetCities():Members() do
        local g = c:GetGrowth()
        local h = g:GetHappiness()
        if h <= 1 then
          print(string.format('{"kind":"city","turn":%d,"p":%d,"id":%d,"x":%d,"y":%d,"tier":%d,"amen":%d,"need":%d,"pop":%d}',
            turn, p, c:GetID(), c:GetX(), c:GetY(), h, g:GetAmenities(), g:GetAmenitiesNeeded(), c:GetPopulation()))
        end
      end
    end
    if pl:IsBarbarian() or pl:IsFreeCities() then
      for _, u in pl:GetUnits():Members() do
        print(string.format('{"kind":"unit","turn":%d,"p":%d,"id":%d,"type":"%s","x":%d,"y":%d}',
          turn, p, u:GetID(), GameInfo.Units[u:GetType()].UnitType, u:GetX(), u:GetY()))
      end
    end
  end
end
