-- GameCore_Tuner: N archers, one per tile within range of the defender, so a
-- seeded shot can be fired N times without waiting a turn (a shot spends all
-- of a unit's moves, and one military unit per tile is the standing rule).
-- Prints the ids in firing order.
--   --set ZDX=36 --set ZDY=25 --set ZN=6
local p0 = Players[0]
local ids = {}
for i = 0, Map.GetPlotCount() - 1 do
  local q = Map.GetPlotByIndex(i)
  local dist = Map.GetPlotDistance(ZDX, ZDY, q:GetX(), q:GetY())
  if #ids < ZN and dist >= 1 and dist <= 2 and not q:IsWater() and not q:IsImpassable()
     and not q:IsMountain() and q:GetUnitCount() == 0 and not q:IsCity() then
    local u = p0:GetUnits():Create(GameInfo.Units["UNIT_ARCHER"].Index, q:GetX(), q:GetY())
    if u ~= nil then
      ids[#ids + 1] = "{\"id\":" .. u:GetID() .. ",\"x\":" .. q:GetX() .. ",\"y\":" .. q:GetY()
        .. ",\"dist\":" .. dist .. ",\"moves\":" .. u:GetMovesRemaining() .. "}"
    end
  end
end
print("{\"kind\":\"fleet\",\"made\":" .. #ids .. ",\"archers\":[" .. table.concat(ids, ",") .. "]}")
