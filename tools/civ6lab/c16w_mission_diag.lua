-- InGame, seat 0 local: for the first idle spy of the seat standing in the
-- city at ZCX:ZCY, the offensive operation ZOP — its target plots and
-- CanStartOperation in three call shapes, with failure reasons.
local me = Game.GetLocalPlayer()
local op = GameInfo.UnitOperations["ZOP"]
local function reasons(res)
  local w = {}
  if type(res) == "table" then
    for k, v in pairs(res) do
      if type(v) == "table" then for _, s in ipairs(v) do w[#w + 1] = Locale.Lookup(tostring(s)) end end
    end
  end
  return table.concat(w, "|")
end
for _, u in Players[me]:GetUnits():Members() do
  if u:GetType() == GameInfo.Units["UNIT_SPY"].Index and u:GetX() == ZCX and u:GetY() == ZCY then
    local okt, tg = pcall(function() return UnitManager.GetOperationTargets(u, op.Hash) end)
    local tl = {}
    if okt and type(tg) == "table" then
      for _, l in pairs(tg) do
        if type(l) == "table" then for _, pi in ipairs(l) do local q = Map.GetPlotByIndex(pi) if q then tl[#tl + 1] = q:GetX() .. ":" .. q:GetY() end end end
      end
    end
    local t = {[UnitOperationTypes.PARAM_X] = ZDX, [UnitOperationTypes.PARAM_Y] = ZDY}
    local a1, c1, r1 = pcall(function() return UnitManager.CanStartOperation(u, op.Hash, Map.GetPlot(ZDX, ZDY), t, true) end)
    local a2, c2, r2 = pcall(function() return UnitManager.CanStartOperation(u, op.Hash, nil, t, true) end)
    local a3, c3, r3 = pcall(function() return UnitManager.CanStartOperation(u, op.Hash, nil, true, true) end)
    print(string.format("spy %d op %s moves %s targets [%s] | plot,t: %s %s %s | nil,t: %s %s %s | nil,true: %s %s %s",
      u:GetID(), tostring(u:GetSpyOperation()), tostring(u:GetMovesRemaining()), table.concat(tl, ","),
      tostring(a1), tostring(c1), reasons(r1), tostring(a2), tostring(c2), reasons(r2), tostring(a3), tostring(c3), reasons(r3)))
    return
  end
end
print("no spy of the seat in the city")
