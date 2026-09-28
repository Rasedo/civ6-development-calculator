-- GameCore_Tuner (after lab_json.lua): in city ZCX:ZCY remove building ZOLD
-- (when present) and create ZNEW on the city's Industrial Zone.
local c = CityManager.GetCityAt(ZCX, ZCY)
local bq, bl = c:GetBuildQueue(), c:GetBuildings()
local d = c:GetDistricts():GetDistrict(GameInfo.Districts["DISTRICT_INDUSTRIAL_ZONE"].Index)
local plot = Map.GetPlot(d:GetX(), d:GetY()):GetIndex()
local rec = {kind = "swap", city = c:GetID(), old = "ZOLD", new = "ZNEW"}
local o, n = GameInfo.Buildings["ZOLD"], GameInfo.Buildings["ZNEW"]
if o and bl:HasBuilding(o.Index) then rec.removed = P(function() bq:RemoveBuilding(o.Index) return not bl:HasBuilding(o.Index) end) end
if not bl:HasBuilding(n.Index) then rec.created = P(function() bq:CreateBuilding(n.Index, plot) return bl:HasBuilding(n.Index) end) end
rec.reactors = P(function() return Game.GetFalloutManager():GetReactorCount() end)
OUT(rec)
