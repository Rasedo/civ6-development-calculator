-- GameCore: the plots within 2 of ZCX:ZCY — water, mountain, impassable,
-- district, owner, and the units on each (owner:type).   --set ZCX=20 --set ZCY=32
for dy = -2, 2 do
  for dx = -3, 3 do
    local q = Map.GetPlot(ZCX + dx, ZCY + dy)
    if q ~= nil then
      local d = Map.GetPlotDistance(ZCX, ZCY, q:GetX(), q:GetY())
      if d >= 1 and d <= 2 then
        local us = {}
        for _, u in ipairs(Units.GetUnitsInPlot(q) or {}) do us[#us + 1] = u:GetOwner() .. ":" .. GameInfo.Units[u:GetType()].UnitType end
        print(string.format('{"kind":"ring","d":%d,"x":%d,"y":%d,"water":%s,"mountain":%s,"impassable":%s,"district":%d,"owner":%d,"units":"%s"}',
          d, q:GetX(), q:GetY(), tostring(q:IsWater()), tostring(q:IsMountain()), tostring(q:IsImpassable()),
          q:GetDistrictType(), q:GetOwner(), table.concat(us, ",")))
      end
    end
  end
end
