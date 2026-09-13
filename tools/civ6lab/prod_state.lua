-- InGame: the build queue of player 0's city CITYID — every item with
-- progress, plus the treasury. Used around a purchase to see what the
-- hammers did.
local city = Players[0]:GetCities():FindID(CITYID)
if city == nil then print("nocity") return end
local bq = city:GetBuildQueue()
local h = bq:GetCurrentProductionTypeHash()
local cur = "nothing"
for r in GameInfo.Units() do if r.Hash == h then cur = r.UnitType end end
for r in GameInfo.Buildings() do if r.Hash == h then cur = r.BuildingType end end
for r in GameInfo.Districts() do if r.Hash == h then cur = r.DistrictType end end
local parts = {}
for r in GameInfo.Units() do local p = bq:GetUnitProgress(r.Index); if p > 0 then parts[#parts + 1] = r.UnitType:gsub("UNIT_", "") .. "=" .. p .. "/" .. bq:GetUnitCost(r.Index) end end
for r in GameInfo.Buildings() do local p = bq:GetBuildingProgress(r.Index); if p > 0 then parts[#parts + 1] = r.BuildingType:gsub("BUILDING_", "") .. "=" .. p .. "/" .. bq:GetBuildingCost(r.Index) end end
for r in GameInfo.Districts() do local p = bq:GetDistrictProgress(r.Index); if p > 0 then parts[#parts + 1] = r.DistrictType:gsub("DISTRICT_", "") .. "=" .. p .. "/" .. bq:GetDistrictCost(r.Index) end end
local n = 0
for _, u in Players[0]:GetUnits():Members() do if GameInfo.Units[u:GetType()].UnitType == "UNIT_WARRIOR" then n = n + 1 end end
print("turn " .. Game.GetCurrentGameTurn() .. " current=" .. cur .. " progress{" .. table.concat(parts, " ") .. "} gold=" .. math.floor(Players[0]:GetTreasury():GetGoldBalance())
      .. " warriors=" .. n .. " hasMonument=" .. tostring(city:GetBuildings():HasBuilding(GameInfo.Buildings["BUILDING_MONUMENT"].Index)))
