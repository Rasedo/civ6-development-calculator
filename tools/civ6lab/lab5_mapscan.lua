-- GameCore_Tuner (after lab_json.lua): the plots the B-93 and C-74 scenes pick
-- from — every natural-wonder plot (terrain, impassable, owner), and each
-- minor's districts with their buildings.
local W, H = Map.GetGridSize()
for i = 0, W * H - 1 do
  local q = Map.GetPlotByIndex(i)
  local f = q:GetFeatureType()
  local fr = f >= 0 and GameInfo.Features[f] or nil
  if fr and fr.NaturalWonder then
    OUT({kind = "nw", i = i, x = q:GetX(), y = q:GetY(), feature = fr.FeatureType,
      terrain = GameInfo.Terrains[q:GetTerrainType()].TerrainType, impassable = P(function() return q:IsImpassable() end),
      water = q:IsWater(), owner = q:GetOwner()})
  end
end
for p = 0, 62 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() and not pl:IsMajor() then
    for _, c in pl:GetCities():Members() do
      for d = 0, c:GetDistricts():GetNumDistricts() - 1 do
        local dd = c:GetDistricts():GetDistrictByIndex(d)
        local row = dd and GameInfo.Districts[dd:GetType()]
        local blds = {}
        for b in GameInfo.Buildings() do
          if b.PrereqDistrict == (row and row.DistrictType) and c:GetBuildings():HasBuilding(b.Index) then
            blds[#blds + 1] = b.BuildingType
          end
        end
        OUT({kind = "minor_district", p = p, city = c:GetName(), cx = c:GetX(), cy = c:GetY(),
          d = row and row.DistrictType, x = dd and dd:GetX(), y = dd and dd:GetY(), buildings = blds})
      end
    end
  end
end
