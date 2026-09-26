-- InGame: validate the wiki's claims about a nuclear blast against a city
-- that has already been struck. The readers that matter, and that the first
-- pass did NOT use:
--   city:GetBuildings():IsPillaged(row.Hash)   -- BUILDING-level pillage.
--       A wonder is a BUILDING standing on a DISTRICT_WONDER tile, so
--       district:IsPillaged() is the wrong question to ask about a wonder.
--   city:GetCitizens():IsPlotWorked(x, y)      -- the real "is this tile
--       worked by THIS city", instead of plot:GetWorkerCount(), which counts
--       any owner's citizens and so leaks neighbouring cities in.
--   district:GetDefenseStrength()              -- the wiki says a City Center
--       or Encampment in the blast drops to 0 defence.
--   --set ZCX=23 --set ZCY=26 --set ZR=2
-- a pcall read in three states: its value, or "err:<msg>" when the call threw
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
local cb, cz = c:GetBuildings(), c:GetCitizens()
print("{\"scene\":\"D-validate\",\"city\":\"" .. c:GetName() .. "\",\"owner\":" .. c:GetOwner()
  .. ",\"pop\":" .. c:GetPopulation() .. ",\"x\":" .. ZCX .. ",\"y\":" .. ZCY .. "}")
-- every district, with its distance, pillage flag and defence
for _, d in c:GetDistricts():Members() do
  local t = GameInfo.Districts[d:GetType()]
  local dist = Map.GetPlotDistance(ZCX, ZCY, d:GetX(), d:GetY())
  local function n(f) local ok, v = pcall(f); if not ok then return "\"err\"" end return tostring(v) end
  print("{\"scene\":\"D-validate\",\"kind\":\"district\",\"d\":\"" .. (t and t.DistrictType or "?")
    .. "\",\"x\":" .. d:GetX() .. ",\"y\":" .. d:GetY() .. ",\"dist\":" .. dist
    .. ",\"inBlast\":" .. tostring(dist <= ZR)
    .. ",\"complete\":" .. tostring(d:IsComplete())
    .. ",\"districtPillaged\":" .. tostring(d:IsPillaged())
    .. ",\"defense\":" .. n(function() return d:GetDefenseStrength() end)
    .. ",\"garrison\":" .. n(function() return d:GetDamage(DefenseTypes.DISTRICT_GARRISON) end)
    .. "/" .. n(function() return d:GetMaxDamage(DefenseTypes.DISTRICT_GARRISON) end) .. "}")
end
-- every building the city owns, with the BUILDING-level pillage flag and the
-- plot its district sits on, so a wonder can be located in or out of the blast
for b in GameInfo.Buildings() do
  if cb:HasBuilding(b.Index) then
    local okp, pil = pcall(function() return cb:IsPillaged(b.Hash) end)
    local bx, by, dist = -1, -1, -1
    for _, d in c:GetDistricts():Members() do
      local t = GameInfo.Districts[d:GetType()]
      if t ~= nil and b.PrereqDistrict ~= nil and t.DistrictType == b.PrereqDistrict then
        bx, by = d:GetX(), d:GetY()
        dist = Map.GetPlotDistance(ZCX, ZCY, bx, by)
      end
    end
    print("{\"scene\":\"D-validate\",\"kind\":\"building\",\"b\":\"" .. b.BuildingType
      .. "\",\"isWonder\":" .. tostring(b.IsWonder == true)
      .. ",\"prereqDistrict\":\"" .. tostring(b.PrereqDistrict) .. "\",\"x\":" .. bx .. ",\"y\":" .. by
      .. ",\"dist\":" .. dist .. ",\"buildingPillaged\":" .. trij(okp, pil) .. "}")
  end
end
-- which tiles inside the blast this city is actually working
local worked, workedInBlast, contaminated = 0, 0, 0
local fm = Game.GetFalloutManager()
for i = 0, Map.GetPlotCount() - 1 do
  local q = Map.GetPlotByIndex(i)
  local dist = Map.GetPlotDistance(ZCX, ZCY, q:GetX(), q:GetY())
  local okw, w = pcall(function() return cz:IsPlotWorked(q:GetX(), q:GetY()) end)
  if okw and w then
    worked = worked + 1
    if dist <= ZR then workedInBlast = workedInBlast + 1 end
  end
  if dist <= ZR then
    local okf, t = pcall(function() return fm:GetFalloutTurnsRemaining(i) end)
    if okf and t ~= nil and t > 0 then contaminated = contaminated + 1 end
  end
end
print("{\"scene\":\"D-validate\",\"kind\":\"citizens\",\"pop\":" .. c:GetPopulation()
  .. ",\"tilesWorkedTotal\":" .. worked .. ",\"tilesWorkedInBlast\":" .. workedInBlast
  .. ",\"contaminatedPlotsInRadius\":" .. contaminated .. "}")
