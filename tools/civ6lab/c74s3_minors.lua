-- InGame (after lab_json.lua): C-74-S3 — every city of every non-major
-- (city-states, Free Cities; ZALL=1 adds the majors): its districts (type,
-- plot, terrain, feature, river, pillaged) and its buildings with their
-- pillage state (`GetBuildings():IsPillaged(hash)`, the InGame reader), the
-- item in production and its progress. One JSON line per city; tag ZTAG.
local turn = Game.GetCurrentGameTurn()
local function name(tbl, i, key) local r = i >= 0 and tbl[i] or nil return r and r[key] or i end
for p = 0, 63 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() and (ZALL == 1 or not pl:IsMajor()) then
    for _, c in pl:GetCities():Members() do
      local ds = {}
      for _, d in c:GetDistricts():Members() do
        local q = Map.GetPlot(d:GetX(), d:GetY())
        ds[#ds + 1] = {name(GameInfo.Districts, d:GetType(), "DistrictType"), d:GetX(), d:GetY(),
          name(GameInfo.Terrains, q:GetTerrainType(), "TerrainType"), name(GameInfo.Features, q:GetFeatureType(), "FeatureType"),
          q:IsRiver(), P(function() return d:IsPillaged() end), P(function() return d:IsComplete() end)}
      end
      local bs = {}
      for row in GameInfo.Buildings() do
        if c:GetBuildings():HasBuilding(row.Index) then
          bs[#bs + 1] = {row.BuildingType, P(function() return c:GetBuildings():IsPillaged(row.Hash) end)}
        end
      end
      local bq = c:GetBuildQueue()
      local h = P(function() return bq:GetCurrentProductionTypeHash() end)
      local prod, prog = "none", nil
      if type(h) == "number" and h ~= 0 then
        local row = GameInfo.Buildings[h] or GameInfo.Districts[h] or GameInfo.Units[h] or GameInfo.Projects[h]
        prod = row and (row.BuildingType or row.DistrictType or row.UnitType or row.ProjectType) or tostring(h)
        if row and row.BuildingType then prog = P(function() return bq:GetBuildingProgress(row.Index) end) end
        if row and row.DistrictType then prog = P(function() return bq:GetDistrictProgress(row.Index) end) end
        if row and row.UnitType then prog = P(function() return bq:GetUnitProgress(row.Index) end) end
        if row and row.ProjectType then prog = P(function() return bq:GetProjectProgress(row.Index) end) end
      end
      OUT({kind = "city", tag = "ZTAG", turn = turn, p = p, id = c:GetID(), name = c:GetName(), x = c:GetX(), y = c:GetY(),
        districts = ds, buildings = bs, prod = prod, prodProgress = prog,
        gold = P(function() return pl:GetTreasury():GetGoldBalance() end)})
    end
  end
end
