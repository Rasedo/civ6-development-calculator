-- ASK 11: is sight a BUDGET spent along the path, or a radius OCCLUDED behind
-- a blocker? Census of geometries for the matrix
--   observer {flat, hill}  x  first tile A {open, woods, hill, hillwoods, mountain}
-- with B and C (distances 2 and 3 along the same ray) open flat ground, all
-- far from player 0's own eyes. GameCore_Tuner. Output:
--   geo <observer> <A-kind> Hx Hy dir Ax Ay Bx By Cx Cy
local hills, flat, mountain = {}, {}, {}
for t in GameInfo.Terrains() do
  if t.TerrainType:find("_HILLS") then hills[t.Index] = true
  elseif t.TerrainType:find("_MOUNTAIN") then mountain[t.Index] = true
  elseif t.TerrainType ~= "TERRAIN_COAST" and t.TerrainType ~= "TERRAIN_OCEAN" then flat[t.Index] = true end
end
local woods = { [GameInfo.Features["FEATURE_FOREST"].Index] = true, [GameInfo.Features["FEATURE_JUNGLE"].Index] = true }
local eyes = {}
for _, u in Players[0]:GetUnits():Members() do eyes[#eyes + 1] = { u:GetX(), u:GetY() } end
for _, c in Players[0]:GetCities():Members() do eyes[#eyes + 1] = { c:GetX(), c:GetY() } end
local function far(x, y)
  for _, e in ipairs(eyes) do if Map.GetPlotDistance(x, y, e[1], e[2]) <= 7 then return false end end
  return true
end
local function openflat(q) return q ~= nil and flat[q:GetTerrainType()] and q:GetFeatureType() == -1 and q:GetDistrictType() < 0 and not q:IsWater() end
local function akind(a)
  if a == nil or a:IsWater() or a:GetDistrictType() >= 0 then return nil end
  local t, f = a:GetTerrainType(), a:GetFeatureType()
  if mountain[t] then return "mountain" end
  if hills[t] and f == -1 then return "hill" end
  if hills[t] and woods[f] then return "hillwoods" end
  if flat[t] and f == -1 then return "open" end
  if flat[t] and woods[f] then return "woods" end
  return nil
end
local count = {}
local total = 0
for i = 0, Map.GetPlotCount() - 1 do
  local h = Map.GetPlotByIndex(i)
  local okind = nil
  if h:GetFeatureType() == -1 and h:GetDistrictType() < 0 and not h:IsWater() then
    if hills[h:GetTerrainType()] then okind = "hill" elseif flat[h:GetTerrainType()] then okind = "flat" end
  end
  if okind and #Units.GetUnitsInPlot(h) == 0 and far(h:GetX(), h:GetY()) then
    for d = 0, 5 do
      local a = Map.GetAdjacentPlot(h:GetX(), h:GetY(), d)
      local b = a and Map.GetAdjacentPlot(a:GetX(), a:GetY(), d)
      local c = b and Map.GetAdjacentPlot(b:GetX(), b:GetY(), d)
      local ak = akind(a)
      if ak and openflat(b) and openflat(c) then
        local key = okind .. "/" .. ak
        count[key] = (count[key] or 0) + 1
        if count[key] <= 2 then
          total = total + 1
          print("geo " .. okind .. " " .. ak .. " " .. h:GetX() .. " " .. h:GetY() .. " " .. d .. " " .. a:GetX() .. " " .. a:GetY() .. " " .. b:GetX() .. " " .. b:GetY() .. " " .. c:GetX() .. " " .. c:GetY())
        end
      end
    end
  end
end
local ks = {}
for k, v in pairs(count) do ks[#ks + 1] = k .. "=" .. v end
table.sort(ks)
print("found " .. total .. " of " .. table.concat(ks, " "))
