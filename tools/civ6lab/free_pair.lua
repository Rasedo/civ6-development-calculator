-- GameCore_Tuner: find two ADJACENT free land plots near ZCX:ZCY for a combat
-- pair, and report them. The new map is small and crowded with the starting
-- army, so picking spawn tiles by hand fails.
--   --set ZCX=39 --set ZCY=16 --set ZR=4
local best = nil
for dx = -ZR, ZR do
  for dy = -ZR, ZR do
    local ok, a = pcall(function() return Map.GetPlot(ZCX + dx, ZCY + dy) end)
    if best == nil and ok and a ~= nil and Map.GetPlotDistance(ZCX, ZCY, a:GetX(), a:GetY()) <= ZR
       and not a:IsWater() and not a:IsImpassable() and not a:IsMountain()
       and a:GetUnitCount() == 0 and not a:IsCity() and a:GetDistrictType() < 0 then
      for ex = -1, 1 do
        for ey = -1, 1 do
          local ok2, b = pcall(function() return Map.GetPlot(a:GetX() + ex, a:GetY() + ey) end)
          if best == nil and ok2 and b ~= nil
             and Map.GetPlotDistance(a:GetX(), a:GetY(), b:GetX(), b:GetY()) == 1
             and not b:IsWater() and not b:IsImpassable() and not b:IsMountain()
             and b:GetUnitCount() == 0 and not b:IsCity() and b:GetDistrictType() < 0 then
            best = { ax = a:GetX(), ay = a:GetY(), bx = b:GetX(), by = b:GetY() }
          end
        end
      end
    end
  end
end
if best == nil then print("{\"kind\":\"freepair\",\"error\":\"none\"}") return end
print("{\"kind\":\"freepair\",\"ax\":" .. best.ax .. ",\"ay\":" .. best.ay
  .. ",\"bx\":" .. best.bx .. ",\"by\":" .. best.by .. "}")
