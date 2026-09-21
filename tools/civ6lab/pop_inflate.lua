-- GameCore_Tuner: add ZN citizens to the city at ZCX:ZCY and print what the
-- city then owns, so the scene's INPUTS are measured rather than assumed. Used
-- only on a city founded for the experiment: the population is read back and
-- the worked-tile layout is measured in InGame before anything is struck.
--   --set ZCX=32 --set ZCY=16 --set ZN=9
local c = nil
for _, x in Players[0]:GetCities():Members() do
  if x:GetX() == ZCX and x:GetY() == ZCY then c = x end
end
if c == nil then print("{\"kind\":\"inflate\",\"error\":\"nocity\"}") return end
c:ChangePopulation(ZN)
local owned, byRing = 0, { 0, 0, 0, 0 }
for _, q in ipairs(c:GetOwnedPlots()) do
  local p = Map.GetPlotByIndex(q)
  local d = Map.GetPlotDistance(ZCX, ZCY, p:GetX(), p:GetY())
  owned = owned + 1
  if d <= 3 then byRing[d + 1] = byRing[d + 1] + 1 end
end
print("{\"kind\":\"inflate\",\"city\":\"" .. c:GetName():gsub("LOC_CITY_NAME_", "") .. "\",\"pop\":" .. c:GetPopulation()
  .. ",\"ownedPlots\":" .. owned .. ",\"ring0\":" .. byRing[1] .. ",\"ring1\":" .. byRing[2]
  .. ",\"ring2\":" .. byRing[3] .. ",\"ring3\":" .. byRing[4] .. "}")
