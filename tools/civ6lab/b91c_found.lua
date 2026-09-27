-- InGame (after lab_json.lua): B-91 — found a city with ZP's Settler at ZX,ZY
-- (the seat made local first by GameCore SetLocalPlayerAndObserver). Prints
-- the test and the request.
local u = nil
for _, x in Players[ZP]:GetUnits():Members() do
  if GameInfo.Units[x:GetType()].UnitType == "UNIT_SETTLER" and x:GetX() == ZX and x:GetY() == ZY then u = x end
end
if u == nil then OUT({kind = "found", error = "nosettler"}) return end
local params = {}
params[UnitOperationTypes.PARAM_X] = ZX
params[UnitOperationTypes.PARAM_Y] = ZY
local can = P(function() return UnitManager.CanStartOperation(u, UnitOperationTypes.FOUND_CITY, nil, params) end)
local req = false
if can == true then req = P(function() UnitManager.RequestOperation(u, UnitOperationTypes.FOUND_CITY, params) return true end) end
OUT({kind = "found", p = ZP, x = ZX, y = ZY, settler = u:GetID(), local_ = Game.GetLocalPlayer(), can = can, requested = req})
