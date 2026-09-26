-- GameCore_Tuner: an ASCII map of a window, one cell per plot:
--   terrain letter (O ocean, c coast, M mountain, h hills, . flat, L lake),
--   then the owner (0-9, a-z for 10+, '-' none), then a mark:
--   C city centre, D district, U unit, R route (railroad r), F feature, ' ' none.
--   --set ZX0=20 --set ZX1=45 --set ZY0=30 --set ZY1=53
local ocean = GameInfo.Terrains["TERRAIN_OCEAN"].Index
local coast = GameInfo.Terrains["TERRAIN_COAST"].Index
local rail = GameInfo.Routes["ROUTE_RAILROAD"] and GameInfo.Routes["ROUTE_RAILROAD"].Index or -9
local function own(p)
  if p < 0 then return "-" end
  if p < 10 then return tostring(p) end
  if p < 36 then return string.char(87 + p) end
  return "+"
end
local hdr = "     "
for x = ZX0, ZX1 do hdr = hdr .. string.format("%-4d", x) end
print(hdr)
for y = ZY0, ZY1 do
  local row = string.format("%3d  ", y)
  for x = ZX0, ZX1 do
    local q = Map.GetPlot(x, y)
    if q == nil then row = row .. "    " else
      local t = q:GetTerrainType()
      local ch
      if t == ocean then ch = "O" elseif t == coast then ch = "c"
      elseif q:IsMountain() then ch = "M" elseif q:IsLake() then ch = "L"
      elseif q:IsHills() then ch = "h" else ch = "." end
      local mk = " "
      if q:IsCity() then mk = "C" elseif q:GetDistrictType() >= 0 then mk = "D"
      elseif q:GetUnitCount() > 0 then mk = "U"
      elseif q:GetRouteType() == rail then mk = "r"
      elseif q:GetRouteType() >= 0 then mk = "R"
      elseif q:GetFeatureType() >= 0 then mk = "F" end
      row = row .. ch .. own(q:GetOwner()) .. mk .. " "
    end
  end
  print(row)
end
