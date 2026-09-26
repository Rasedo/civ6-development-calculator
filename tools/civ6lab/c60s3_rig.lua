-- GameCore: C-60-S3, a Free City grant with no free tile. ZMODE = rig
-- fills every plot within ZR of the city at ZX:ZY (the centre excluded)
-- that holds no unit with a unit of seat 0 (at war with the Free Cities)
-- and heals every seat-0 unit already standing there:
-- land plots with the first land type `Create` accepts, water plots with the
-- first naval type. ZMODE = read prints, as JSON lines, the city's owner,
-- every unit of player 62 (id, type, plot, damage) and every unit within ZR
-- of the city (owner, id, type, plot, damage).
--   --set ZMODE=rig --set ZX=69 --set ZY=21 --set ZR=1
local LAND = {"UNIT_MODERN_ARMOR", "UNIT_TANK", "UNIT_MECHANIZED_INFANTRY", "UNIT_INFANTRY", "UNIT_MUSKETMAN", "UNIT_SWORDSMAN"}
local SEA = {"UNIT_DESTROYER", "UNIT_BATTLESHIP", "UNIT_IRONCLAD", "UNIT_FRIGATE", "UNIT_GALLEY"}
local turn = Game.GetCurrentGameTurn()
local plots = {}
for i = 0, Map.GetPlotCount() - 1 do
  local q = Map.GetPlotByIndex(i)
  local d = Map.GetPlotDistance(ZX, ZY, q:GetX(), q:GetY())
  if d >= 1 and d <= ZR then plots[#plots + 1] = {q, d} end
end
if "ZMODE" == "rig" then
  for _, e in ipairs(plots) do
    local q, d = e[1], e[2]
    if q:GetUnitCount() == 0 and not q:IsMountain() and not q:IsImpassable() then
      local list = q:IsWater() and SEA or LAND
      local made = "none"
      for _, name in ipairs(list) do
        local u = Players[0]:GetUnits():Create(GameInfo.Units[name].Index, q:GetX(), q:GetY())
        if u ~= nil then made = name .. ":" .. u:GetID() break end
      end
      print(string.format('{"kind":"rig","turn":%d,"x":%d,"y":%d,"ring":%d,"water":%s,"made":"%s"}', turn, q:GetX(), q:GetY(), d, tostring(q:IsWater()), made))
    else
      local healed = 0
      for _, u in ipairs(Units.GetUnitsInPlot(q) or {}) do
        if u:GetOwner() == 0 and u:GetDamage() > 0 then u:SetDamage(0); healed = healed + 1 end
      end
      print(string.format('{"kind":"rig","turn":%d,"x":%d,"y":%d,"ring":%d,"water":%s,"made":"skip","units":%d,"healed":%d}', turn, q:GetX(), q:GetY(), d, tostring(q:IsWater()), q:GetUnitCount(), healed))
    end
  end
else
  local c = CityManager.GetCityAt(ZX, ZY)
  print(string.format('{"kind":"city","turn":%d,"owner":%d}', turn, c and c:GetOwner() or -1))
  for _, u in Players[62]:GetUnits():Members() do
    print(string.format('{"kind":"p62","turn":%d,"id":%d,"type":"%s","x":%d,"y":%d,"damage":%d,"dist":%d}', turn, u:GetID(),
      GameInfo.Units[u:GetType()].UnitType, u:GetX(), u:GetY(), u:GetDamage(), Map.GetPlotDistance(ZX, ZY, u:GetX(), u:GetY())))
  end
  for _, e in ipairs(plots) do
    local q = e[1]
    for _, u in ipairs(Units.GetUnitsInPlot(q) or {}) do
      print(string.format('{"kind":"ring","turn":%d,"x":%d,"y":%d,"ring":%d,"owner":%d,"id":%d,"type":"%s","damage":%d}', turn,
        q:GetX(), q:GetY(), e[2], u:GetOwner(), u:GetID(), GameInfo.Units[u:GetType()].UnitType, u:GetDamage()))
    end
  end
end
