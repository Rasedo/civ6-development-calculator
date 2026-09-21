-- GameCore_Tuner: put a Missile Silo on a tile player 0 owns. The city-side
-- WMD_STRIKE command refuses without one, and the silo is the delivery channel
-- the wiki describes as having a DIFFERENT interception rule from a bomber's.
--   ImprovementBuilder.SetImprovementType(plot, improvementIndex, playerID)
--   --set ZCX=39 --set ZCY=16 --set ZR=3
local idx = GameInfo.Improvements["IMPROVEMENT_MISSILE_SILO"].Index
local placed = nil
for dx = -ZR, ZR do
  for dy = -ZR, ZR do
    local ok, q = pcall(function() return Map.GetPlot(ZCX + dx, ZCY + dy) end)
    if placed == nil and ok and q ~= nil then
      local d = Map.GetPlotDistance(ZCX, ZCY, q:GetX(), q:GetY())
      if d >= 1 and d <= ZR and not q:IsWater() and not q:IsImpassable() and not q:IsMountain()
         and q:GetOwner() == 0 and q:GetDistrictType() < 0 and q:GetImprovementType() < 0 then
        pcall(function() ImprovementBuilder.SetImprovementType(q, idx, 0) end)
        if q:GetImprovementType() == idx then placed = q end
      end
    end
  end
end
if placed == nil then print("{\"kind\":\"silo\",\"placed\":false}") return end
print("{\"kind\":\"silo\",\"placed\":true,\"at\":\"" .. placed:GetX() .. ":" .. placed:GetY()
  .. "\",\"improvement\":\"" .. GameInfo.Improvements[placed:GetImprovementType()].ImprovementType .. "\"}")
