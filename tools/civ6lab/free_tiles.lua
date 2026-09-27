-- Either state: the plots within ZR of ZX:ZY, one line each — distance, land or
-- water, mountain / impassable, units on it (owner:type), owner, district,
-- city. For choosing where a rig's units stand.
--   --set ZX=36 --set ZY=46 --set ZR=3
for dx = -ZR - 1, ZR + 1 do
  for dy = -ZR - 1, ZR + 1 do
    local q = Map.GetPlot(ZX + dx, ZY + dy)
    if q ~= nil then
      local d = Map.GetPlotDistance(ZX, ZY, q:GetX(), q:GetY())
      if d <= ZR then
        local us = {}
        pcall(function()
          for _, u in ipairs(Units.GetUnitsInPlot(q)) do us[#us + 1] = u:GetOwner() .. ":" .. GameInfo.Units[u:GetType()].UnitType end
        end)
        if #us == 0 and q:GetUnitCount() > 0 then us[1] = "n=" .. q:GetUnitCount() end
        local dt = q:GetDistrictType()
        print(q:GetX() .. ":" .. q:GetY() .. " d=" .. d .. (q:IsWater() and " WATER" or " land")
          .. (q:IsMountain() and " MOUNTAIN" or "") .. (q:IsImpassable() and " IMPASS" or "")
          .. " owner=" .. q:GetOwner() .. " district=" .. (dt >= 0 and GameInfo.Districts[dt].DistrictType or "-")
          .. (q:IsCity() and " CITY" or "") .. " units=" .. table.concat(us, ","))
      end
    end
  end
end
