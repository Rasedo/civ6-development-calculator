-- InGame (after lab_json.lua): every Settler of the local seat founds a city
-- where it stands (FOUND_CITY, CanStartOperation checked first).
local me = Game.GetLocalPlayer()
local rows = {}
for _, u in Players[me]:GetUnits():Members() do
  if GameInfo.Units[u:GetType()].UnitType == "UNIT_SETTLER" then
    local k = {}
    k[UnitOperationTypes.PARAM_X] = u:GetX()
    k[UnitOperationTypes.PARAM_Y] = u:GetY()
    local can = P(function() return UnitManager.CanStartOperation(u, UnitOperationTypes.FOUND_CITY, nil, k) end)
    local call = false
    if can == true then call = P(function() UnitManager.RequestOperation(u, UnitOperationTypes.FOUND_CITY, k) return true end) end
    rows[#rows + 1] = {id = u:GetID(), x = u:GetX(), y = u:GetY(), can = can, call = call}
  end
end
OUT({kind = "found", seat = me, settlers = rows})
