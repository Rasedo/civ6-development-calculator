-- GameCore_Tuner: put a finished district (and optionally a building) into ANY
-- city, mine or not. Offensive spy missions each target a particular district,
-- and a fresh Information-era start gives every city nothing but its centre.
-- Guarded by HasDistrict: CreateDistrict twice on one plot crashed the game
-- once already.
--   --set ZCX=8 --set ZCY=12 --set ZDISTRICT=DISTRICT_COMMERCIAL_HUB --set ZPOP=14
local c, owner = nil, -1
for _, pl in ipairs(Players) do
  local ok, list = pcall(function() return pl:GetCities() end)
  if ok and list ~= nil then
    for _, x in list:Members() do
      if x:GetX() == ZCX and x:GetY() == ZCY then c = x owner = pl:GetID() end
    end
  end
end
if c == nil then print("{\"kind\":\"builddistrict\",\"error\":\"nocity\"}") return end
local row = GameInfo.Districts["ZDISTRICT"]
if row == nil then print("{\"kind\":\"builddistrict\",\"error\":\"norow\"}") return end
if c:GetPopulation() < ZPOP then
  pcall(function() WorldBuilder.CityManager():SetCityValue(c, "Population", ZPOP) end)
end
local ds = c:GetDistricts()
if ds:HasDistrict(row.Index) then
  print("{\"kind\":\"builddistrict\",\"already\":true,\"district\":\"ZDISTRICT\",\"city\":\"" .. c:GetName() .. "\"}")
  return
end
local spot = nil
for dx = -1, 1 do
  for dy = -1, 1 do
    local okp, q = pcall(function() return Map.GetPlot(ZCX + dx, ZCY + dy) end)
    if spot == nil and okp and q ~= nil then
      local d = Map.GetPlotDistance(ZCX, ZCY, q:GetX(), q:GetY())
      if d == 1 and not q:IsWater() and not q:IsImpassable() and not q:IsMountain()
         and q:GetDistrictType() < 0 and q:GetOwner() == owner and q:GetUnitCount() == 0 then
        spot = q
      end
    end
  end
end
if spot == nil then print("{\"kind\":\"builddistrict\",\"error\":\"nospot\"}") return end
local ok, r = pcall(function() return c:GetBuildQueue():CreateDistrict(row.Index, spot:GetIndex()) end)
print("{\"kind\":\"builddistrict\",\"city\":\"" .. c:GetName():gsub("LOC_CITY_NAME_", "")
  .. "\",\"owner\":" .. owner .. ",\"district\":\"ZDISTRICT\""
  .. ",\"plot\":\"" .. spot:GetX() .. ":" .. spot:GetY() .. "\",\"ok\":" .. tostring(ok)
  .. ",\"ret\":\"" .. tostring(r) .. "\",\"has\":" .. tostring(ds:HasDistrict(row.Index)) .. "}")
