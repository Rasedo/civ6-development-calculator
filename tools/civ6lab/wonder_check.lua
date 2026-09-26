-- InGame: the decisive wonder test. For every wonder the city owns, print the
-- PLOT it stands on (plot:GetWonderType(), the only reliable locator - a
-- wonder row has no PrereqDistrict), its distance from the blast centre, and
-- BOTH pillage readers side by side:
--   district:IsPillaged()            on the DISTRICT_WONDER tile
--   city:GetBuildings():IsPillaged() on the wonder BUILDING itself
-- Each read prints true / false / null, or "err:<msg>" when the call threw.
--   --set ZCX=23 --set ZCY=26 --set ZR=2
local function tri(ok, v)
  local s = ok and tostring(v) or ("err:" .. tostring(v))
  return (s:gsub('[%c"\\]', function(c) return string.format("\\u%04x", c:byte()) end))
end
local function trij(ok, v)
  if ok and (type(v) == "boolean" or type(v) == "number") then return tostring(v) end
  if ok and v == nil then return "null" end
  return "\"" .. tri(ok, v) .. "\""
end
local c = Cities.GetCityInPlot(ZCX, ZCY)
if c == nil then print("{\"error\":\"nocity\"}") return end
local cb = c:GetBuildings()
local function B(f) return trij(pcall(f)) end
-- locate every wonder by walking the map for plot:GetWonderType()
for i = 0, Map.GetPlotCount() - 1 do
  local q = Map.GetPlotByIndex(i)
  local wt = q:GetWonderType()
  if wt ~= nil and wt >= 0 then
    local dist = Map.GetPlotDistance(ZCX, ZCY, q:GetX(), q:GetY())
    if dist <= ZR + 2 then
      local row = GameInfo.Buildings[wt]
      local name = row and row.BuildingType or ("id" .. wt)
      local dPil = "\"nodistrict\""
      for _, d in c:GetDistricts():Members() do
        if d:GetX() == q:GetX() and d:GetY() == q:GetY() then dPil = B(function() return d:IsPillaged() end) end
      end
      print("{\"scene\":\"D-validate\",\"kind\":\"wonder\",\"wonder\":\"" .. name
        .. "\",\"x\":" .. q:GetX() .. ",\"y\":" .. q:GetY() .. ",\"dist\":" .. dist
        .. ",\"inBlast\":" .. tostring(dist <= ZR)
        .. ",\"cityHasIt\":" .. B(function() return row ~= nil and cb:HasBuilding(row.Index) end)
        .. ",\"districtIsPillaged\":" .. dPil
        .. ",\"buildingIsPillaged\":" .. (row and B(function() return cb:IsPillaged(row.Hash) end) or "\"norow\"")
        .. ",\"plotImprovementPillaged\":" .. B(function() return q:IsImprovementPillaged() end) .. "}")
    end
  end
end
