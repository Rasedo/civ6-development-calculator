-- GameCore_Tuner (after lab_json.lua): C-74-S3 — the plots within ZR of
-- ZX,ZY (terrain, feature, improvement and its pillage, district and its
-- pillage) and, for each city with a district there, every building with its
-- pillage state; plus this turn's event record. One JSON line.
local turn = Game.GetCurrentGameTurn()
local plots, cities = {}, {}
local function name(tbl, i, key) local r = i >= 0 and tbl[i] or nil return r and r[key] or i end
for dx = -ZR, ZR do
  for dy = -ZR, ZR do
    local q = Map.GetPlot(ZX + dx, ZY + dy)
    if q ~= nil and Map.GetPlotDistance(ZX, ZY, q:GetX(), q:GetY()) <= ZR then
      local imp = q:GetImprovementType()
      local dt = q:GetDistrictType()
      plots[#plots + 1] = {i = q:GetIndex(), x = q:GetX(), y = q:GetY(), d = Map.GetPlotDistance(ZX, ZY, q:GetX(), q:GetY()),
        terrain = name(GameInfo.Terrains, q:GetTerrainType(), "TerrainType"),
        feature = name(GameInfo.Features, q:GetFeatureType(), "FeatureType"),
        imp = name(GameInfo.Improvements, imp, "ImprovementType"),
        impPillaged = imp >= 0 and P(function() return q:IsImprovementPillaged() end) or nil,
        district = name(GameInfo.Districts, dt, "DistrictType"),
        distPillaged = dt >= 0 and P(function() return q:IsDistrictPillaged() end) or nil,
        owner = q:GetOwner()}
      if dt >= 0 and q:GetOwner() >= 0 then
        -- the owner's nearest city stands for the district's city
        local best, bd = nil, 99
        for _, c in Players[q:GetOwner()]:GetCities():Members() do
          local d = Map.GetPlotDistance(c:GetX(), c:GetY(), q:GetX(), q:GetY())
          if d < bd then best, bd = c, d end
        end
        if best ~= nil then cities[best:GetOwner() .. ":" .. best:GetID()] = best end
      end
    end
  end
end
local cl = {}
for k, c in pairs(cities) do
  local b = {}
  for row in GameInfo.Buildings() do
    if c:GetBuildings():HasBuilding(row.Index) then
      b[#b + 1] = {row.BuildingType, P(function() return c:GetBuildings():IsPillaged(row.Index) end)}
    end
  end
  cl[#cl + 1] = {key = k, name = c:GetName(), owner = c:GetOwner(), buildings = b,
    prod = P(function() return c:GetBuildQueue():CurrentlyBuilding() end)}
end
local ev = P(function() return GameRandomEvents.GetEventsForTurn(turn) end)
OUT({kind = "plots", turn = turn, x = ZX, y = ZY, plots = plots, cities = cl, events = ev})
