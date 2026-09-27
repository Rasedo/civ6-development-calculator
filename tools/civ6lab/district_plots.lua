-- GameCore_Tuner (after lab_json.lua): the district plots of the city at
-- ZX,ZY (type, plot, pillaged) and, for the district of type ZDIST, its six
-- neighbours (terrain, feature, units standing, owner) and the ring-2 plots.
local c = nil
local owner = Map.GetPlot(ZX, ZY):GetOwner()
for _, x in Players[owner]:GetCities():Members() do if x:GetX() == ZX and x:GetY() == ZY then c = x end end
local out = {}
local target = nil
for i = 0, 63 do
  local q = nil
  for d in GameInfo.Districts() do
    if d.Index == i then q = d end
  end
end
for d in GameInfo.Districts() do
  local dd = P(function() return c:GetDistricts():GetDistrictByType(d.Index) end)
  if type(dd) ~= "string" and dd ~= nil then
    out[#out + 1] = {d.DistrictType, dd:GetX(), dd:GetY(), P(function() return dd:IsPillaged() end)}
    if d.DistrictType == "ZDIST" then target = dd end
  end
end
local ring = {}
if target ~= nil then
  for _, q in ipairs(Map.GetNeighborPlots(target:GetX(), target:GetY(), 2)) do
    local n = 0
    for _ in ipairs(Units.GetUnitsInPlot(q) or {}) do n = n + 1 end
    ring[#ring + 1] = {q:GetX(), q:GetY(), Map.GetPlotDistance(target:GetX(), target:GetY(), q:GetX(), q:GetY()),
      q:IsWater(), q:IsImpassable(), q:GetDistrictType(), n, q:GetOwner()}
  end
end
OUT({kind = "districts", owner = owner, city = c and c:GetName(), districts = out, ring = ring})
