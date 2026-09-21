-- GameCore_Tuner: the OTHER placement route. The game's own tuner panel builds
-- districts through the city's build queue with INDICES, not type names:
--   pBuildQueue:CreateIncompleteDistrict(districtIndex, plotIndex, pct)
--   pBuildQueue:CreateIncompleteBuilding(buildingIndex, plotIndex, pct)
-- (Base/Assets/UI/Tuner/TunerCityPanel.lua). CreateDistrict / CreateBuilding
-- sit beside them for the finished article; the arity is not documented, so
-- each is tried and the city is re-read after every attempt.
--   --set ZCX=32 --set ZCY=16
local c, owner = nil, -1
for _, pl in ipairs(Players) do
  local ok, list = pcall(function() return pl:GetCities() end)
  if ok and list ~= nil then
    for _, x in list:Members() do
      if x:GetX() == ZCX and x:GetY() == ZCY then c = x owner = pl:GetID() end
    end
  end
end
if c == nil then print("{\"kind\":\"reactor4\",\"error\":\"nocity\"}") return end
local bq = c:GetBuildQueue()
local iz = GameInfo.Districts["DISTRICT_INDUSTRIAL_ZONE"].Index
local spot = nil
for dx = -1, 1 do
  for dy = -1, 1 do
    local okp, q = pcall(function() return Map.GetPlot(ZCX + dx, ZCY + dy) end)
    if spot == nil and okp and q ~= nil then
      local d = Map.GetPlotDistance(ZCX, ZCY, q:GetX(), q:GetY())
      if d == 1 and not q:IsWater() and not q:IsImpassable() and not q:IsMountain()
         and q:GetDistrictType() < 0 and q:GetOwner() == owner then spot = q end
    end
  end
end
if spot == nil then print("{\"kind\":\"reactor4\",\"error\":\"nospot\"}") return end
local pi = spot:GetIndex()
local function has()
  return tostring(c:GetDistricts():HasDistrict(iz))
end
local function try(label, f)
  local ok, r = pcall(f)
  print("{\"kind\":\"reactor4\",\"call\":\"" .. label .. "\",\"ok\":" .. tostring(ok)
    .. ",\"ret\":\"" .. tostring(r) .. "\",\"hasIZ\":" .. has() .. "}")
end
try("CreateDistrict(idx,plot)", function() return bq:CreateDistrict(iz, pi) end)
try("CreateDistrict(idx,plot,100)", function() return bq:CreateDistrict(iz, pi, 100) end)
try("CreateIncompleteDistrict(idx,plot,100)", function() return bq:CreateIncompleteDistrict(iz, pi, 100) end)
print("{\"kind\":\"reactor4\",\"city\":\"" .. c:GetName():gsub("LOC_CITY_NAME_", "")
  .. "\",\"spot\":\"" .. spot:GetX() .. ":" .. spot:GetY() .. "\",\"hasIZ\":" .. has()
  .. ",\"districts\":" .. c:GetDistricts():GetNumDistricts() .. "}")
