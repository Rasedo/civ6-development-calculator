-- InGame, with the spy's owner local: every Spy of the local seat with its
-- plot, moves, level, operation, and for the counterspy operation
-- CanStartOperation (empty table and with the plot) plus its failure reasons.
local me = Game.GetLocalPlayer()
local op = GameInfo.UnitOperations["UNITOPERATION_SPY_COUNTERSPY"]
local function reasons(res)
  local w = {}
  if type(res) == "table" then
    for k, v in pairs(res) do
      if type(v) == "table" then for _, s in ipairs(v) do w[#w + 1] = tostring(k) .. ":" .. Locale.Lookup(tostring(s)) end end
    end
  end
  return table.concat(w, "|")
end
for _, u in Players[me]:GetUnits():Members() do
  if u:GetType() == GameInfo.Units["UNIT_SPY"].Index then
    local ok1, c1, r1 = pcall(function() return UnitManager.CanStartOperation(u, op.Hash, nil, true, true) end)
    local t = {[UnitOperationTypes.PARAM_X] = u:GetX(), [UnitOperationTypes.PARAM_Y] = u:GetY()}
    local ok2, c2, r2 = pcall(function() return UnitManager.CanStartOperation(u, op.Hash, Map.GetPlot(u:GetX(), u:GetY()), t, true) end)
    local okt, tg = pcall(function() return UnitManager.GetOperationTargets(u, op.Hash) end)
    local nt = 0
    if okt and type(tg) == "table" then for _, l in pairs(tg) do if type(l) == "table" then nt = nt + #l end end end
    print(string.format("spy p%d id %d at %d:%d moves %s level %s op %s | empty: %s %s %s | plot: %s %s %s | targets %s",
      me, u:GetID(), u:GetX(), u:GetY(), tostring(u:GetMovesRemaining()), tostring(u:GetExperience():GetLevel()),
      tostring(u:GetSpyOperation()), tostring(ok1), tostring(c1), reasons(r1), tostring(ok2), tostring(c2), reasons(r2), tostring(nt)))
  end
end
