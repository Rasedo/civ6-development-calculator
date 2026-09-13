-- InGame: every IDLE spy of the local player standing on a foreign city
-- centre starts OPNAME there (target = that centre). Prints each start.
local me = Game.GetLocalPlayer()
local pl = Players[me]
local op = GameInfo.UnitOperations["OPNAME"]
if op == nil then print("noop OPNAME") return end
local started, refused = 0, 0
for _, u in pl:GetUnits():Members() do
  if GameInfo.Units[u:GetType()].UnitType == "UNIT_SPY" and (u:GetSpyOperation() or -1) < 0 then
    local plot = Map.GetPlot(u:GetX(), u:GetY())
    local t = {}
    t[UnitOperationTypes.PARAM_X] = u:GetX()
    t[UnitOperationTypes.PARAM_Y] = u:GetY()
    local ok = UnitManager.CanStartOperation(u, op.Hash, plot, t)
    if ok then
      UnitManager.RequestOperation(u, op.Hash, t)
      started = started + 1
    else
      refused = refused + 1
      print("refused: spy " .. u:GetID() .. " at " .. u:GetX() .. ":" .. u:GetY() .. " owner " .. plot:GetOwner())
    end
  end
end
print("OPNAME started " .. started .. " refused " .. refused)
