-- GameCore_Tuner, C-20-S1: give the destination city one more district so its
-- route gold is larger (finer steps for the path multiplier). WorldBuilder's
-- CreateDistrict, ONE call per plot (a second call on a plot took the tuner
-- down in lab 2), on the first free owned land plot within 2 of the centre.
--   --set ZP=14 --set ZC=65536 --set ZD=DISTRICT_COMMERCIAL_HUB
local c = Players[ZP]:GetCities():FindID(ZC)
local cx, cy = c:GetX(), c:GetY()
local idx = GameInfo.Districts["ZD"].Index
if c:GetDistricts():HasDistrict(idx) then print('{"kind":"c20district","already":true}') return end
local spot = nil
for dx = -2, 2 do
  for dy = -2, 2 do
    local q = Map.GetPlot(cx + dx, cy + dy)
    if spot == nil and q ~= nil and not q:IsWater() and not q:IsMountain() and not q:IsImpassable()
       and q:GetDistrictType() < 0 and q:GetOwner() == ZP and q:GetResourceType() < 0
       and Map.GetPlotDistance(cx, cy, q:GetX(), q:GetY()) >= 1 then spot = q end
  end
end
if spot == nil then print('{"kind":"c20district","error":"nospot"}') return end
local ok, a, b = pcall(function() return WorldBuilder.CityManager():CreateDistrict(c, "ZD", 100, spot:GetIndex()) end)
print('{"kind":"c20district","ok":' .. tostring(ok) .. ',"status":"' .. tostring(a) .. '","spot":"' .. spot:GetX() .. ':' .. spot:GetY()
  .. '","has":' .. tostring(c:GetDistricts():HasDistrict(idx)) .. '}')
