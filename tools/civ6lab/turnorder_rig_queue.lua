-- InGame: put building ZB at the head of city ZC of player ZP (the ProductionPanel's
-- own request: CityOperationTypes.BUILD, exclusive insert), and print what the
-- queue then builds, its progress and cost, and whether the building exists.
--   --set ZP=0 --set ZC=196609 --set ZB=BUILDING_GRANARY
local city = CityManager.GetCity(ZP, ZC)
if city == nil then print("nocity") return end
local row = GameInfo.Buildings["ZB"]
if row == nil then print("nobuilding") return end
local has = city:GetBuildings():HasBuilding(row.Index)
print("has=" .. tostring(has))
local tp = {}
tp[CityOperationTypes.PARAM_BUILDING_TYPE] = row.Hash
tp[CityOperationTypes.PARAM_INSERT_MODE] = CityOperationTypes.VALUE_EXCLUSIVE
local can = CityManager.CanStartOperation(city, CityOperationTypes.BUILD, tp, true)
print("can=" .. tostring(can))
if can then CityManager.RequestOperation(city, CityOperationTypes.BUILD, tp) end
local bq = city:GetBuildQueue()
print("cur=" .. tostring(bq:CurrentlyBuilding()) .. " prog=" .. tostring(bq:GetBuildingProgress(row.Index))
  .. " cost=" .. tostring(bq:GetBuildingCost(row.Index)))
