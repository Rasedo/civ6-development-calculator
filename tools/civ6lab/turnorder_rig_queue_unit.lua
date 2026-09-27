-- InGame: put unit ZU at the head of city ZC of player ZP (CityOperationTypes.BUILD,
-- exclusive insert) and print what the queue then builds, with the unit's
-- progress and cost.
--   --set ZP=0 --set ZC=65536 --set ZU=UNIT_SETTLER
local city = CityManager.GetCity(ZP, ZC)
if city == nil then print("nocity") return end
local row = GameInfo.Units["ZU"]
local tp = {}
tp[CityOperationTypes.PARAM_UNIT_TYPE] = row.Hash
tp[CityOperationTypes.PARAM_INSERT_MODE] = CityOperationTypes.VALUE_EXCLUSIVE
local can = CityManager.CanStartOperation(city, CityOperationTypes.BUILD, tp, true)
print("can=" .. tostring(can))
if can then CityManager.RequestOperation(city, CityOperationTypes.BUILD, tp) end
local bq = city:GetBuildQueue()
print("cur=" .. tostring(bq:CurrentlyBuilding()) .. " prog=" .. tostring(bq:GetUnitProgress(row.Index))
  .. " cost=" .. tostring(bq:GetUnitCost(row.Index)))
