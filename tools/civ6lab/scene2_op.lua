-- InGame: ask and (ZGO=1) request one unit operation at a plot for a local
-- unit: the operation's target list, CanStartOperation with its failure
-- reasons, and the unit's activity after the request.
--   --set ZU=4456455 --set ZOP=DEPLOY --set ZX=35 --set ZY=47 --set ZGO=1
local u = Players[Game.GetLocalPlayer()]:GetUnits():FindID(ZU)
if u == nil then print('{"kind":"op","error":"nounit"}') return end
local op = UnitOperationTypes["ZOP"]
local okT, tr = pcall(function() return UnitManager.GetOperationTargets(u, op) end)
local plots = {}
if okT and type(tr) == "table" and type(tr[UnitOperationResults.PLOTS]) == "table" then
  for _, pi in ipairs(tr[UnitOperationResults.PLOTS]) do
    local q = Map.GetPlotByIndex(pi)
    plots[#plots + 1] = q:GetX() .. ":" .. q:GetY()
  end
end
local params = {[UnitOperationTypes.PARAM_X] = ZX, [UnitOperationTypes.PARAM_Y] = ZY}
local okC, can, res = pcall(function() return UnitManager.CanStartOperation(u, op, nil, params, true) end)
local why = {}
if okC and type(res) == "table" and type(res[UnitOperationResults.FAILURE_REASONS]) == "table" then
  for _, s in ipairs(res[UnitOperationResults.FAILURE_REASONS]) do why[#why + 1] = Locale.Lookup(s) end
end
local req = "no"
if ZGO == 1 and okC and can then
  local okR, r = pcall(function() return UnitManager.RequestOperation(u, op, params) end)
  req = tostring(okR) .. ":" .. tostring(r)
end
local act = "?"
pcall(function() act = tostring(UnitManager.GetActivityType(u)) end)
local actName = act
for k, v in pairs(ActivityTypes or {}) do if tostring(v) == act then actName = k end end
print('{"kind":"op","unit":' .. ZU .. ',"op":"ZOP","x":' .. ZX .. ',"y":' .. ZY
  .. ',"targets":' .. #plots .. ',"targetHasXY":' .. tostring((function() for _, s in ipairs(plots) do if s == ZX .. ":" .. ZY then return true end end return false end)())
  .. ',"can":"' .. (okC and tostring(can) or ("err:" .. tostring(can))) .. '","why":"' .. table.concat(why, "|"):gsub('"', "'")
  .. '","request":"' .. req .. '","at":"' .. u:GetX() .. ':' .. u:GetY() .. '","moves":' .. u:GetMovesRemaining()
  .. ',"activity":"' .. actName .. '"}')
