-- InGame, with the DEFENDER as the local seat (C-16-S1): its counterspy.
--   ZMODE = buy   buy one Spy with gold in its city at ZX:ZY
--                 (CityCommandTypes.PURCHASE; never a socket-spawned spy);
--   ZMODE = post  for its Spy ZID: travel to the district plot ZDX:ZDY
--                 (SPY_TRAVEL_NEW_CITY by plot, as the chooser sends it) unless
--                 it stands there, then start UNITOPERATION_SPY_COUNTERSPY
--                 (`CanStartOperation(spy, hash, nil, true)`, an empty table);
--   ZMODE = read  every Spy of the seat: id, plot, level, operation, moves,
--                 the travel targets on offer.
-- Every read prints its value or "err:<msg>".
--   --set ZMODE=post --set ZID=123 --set ZDX=54 --set ZDY=11 --set ZX=54 --set ZY=11
local function tri(ok, v)
  local s = ok and tostring(v) or ("err:" .. tostring(v):match("[^\n]*"))
  return (s:gsub('[%c"\\]', function(c) return string.format("\\u%04x", c:byte()) end))
end
local me = Game.GetLocalPlayer()
local pl = Players[me]
local spyRow = GameInfo.Units["UNIT_SPY"]
local mode = "ZMODE"
if mode == "buy" then
  local c = CityManager.GetCityAt(ZX, ZY)
  local params = {}
  params[CityCommandTypes.PARAM_UNIT_TYPE] = spyRow.Hash
  params[CityCommandTypes.PARAM_MILITARY_FORMATION_TYPE] = MilitaryFormationTypes.STANDARD_MILITARY_FORMATION
  params[CityCommandTypes.PARAM_YIELD_TYPE] = GameInfo.Yields["YIELD_GOLD"].Index
  local okc, can = pcall(function() return CityManager.CanStartCommand(c, CityCommandTypes.PURCHASE, params) end)
  local okr = false
  if okc and can then okr = pcall(function() CityManager.RequestCommand(c, CityCommandTypes.PURCHASE, params) end) end
  print("buy seat " .. me .. " can " .. tri(okc, can) .. " requested " .. tostring(okr))
elseif mode == "post" then
  local u = pl:GetUnits():FindID(ZID)
  if u == nil then print("post: nospy") return end
  local op = GameInfo.UnitOperations["UNITOPERATION_SPY_COUNTERSPY"]
  if u:GetX() ~= ZDX or u:GetY() ~= ZDY then
    local t = {}
    t[UnitOperationTypes.PARAM_X] = ZDX
    t[UnitOperationTypes.PARAM_Y] = ZDY
    local okc, can = pcall(function() return UnitManager.CanStartOperation(u, UnitOperationTypes.SPY_TRAVEL_NEW_CITY, Map.GetPlot(ZDX, ZDY), t) end)
    local okr = false
    if okc and can then okr = pcall(function() UnitManager.RequestOperation(u, UnitOperationTypes.SPY_TRAVEL_NEW_CITY, t) end) end
    print("post: travel to " .. ZDX .. ":" .. ZDY .. " can " .. tri(okc, can) .. " requested " .. tostring(okr))
  else
    local okc, can = pcall(function() return UnitManager.CanStartOperation(u, op.Hash, nil, true) end)
    local okr = false
    if okc and can then okr = pcall(function() UnitManager.RequestOperation(u, op.Hash, {}) end) end
    print("post: counterspy at " .. ZDX .. ":" .. ZDY .. " can " .. tri(okc, can) .. " requested " .. tostring(okr))
  end
else
  for _, u in pl:GetUnits():Members() do
    if u:GetType() == spyRow.Index then
      local okl, lv = pcall(function() return u:GetExperience():GetLevel() end)
      local oko, op = pcall(function() return u:GetSpyOperation() end)
      local opname = (oko and op ~= nil and op >= 0 and GameInfo.UnitOperations[op]) and GameInfo.UnitOperations[op].OperationType or tri(oko, op)
      local okt, tg = pcall(function() return UnitManager.GetOperationTargets(u, UnitOperationTypes.SPY_TRAVEL_NEW_CITY) end)
      local tl = {}
      if okt and type(tg) == "table" then
        for _, list in pairs(tg) do
          if type(list) == "table" then
            for _, pi in ipairs(list) do
              local q = Map.GetPlotByIndex(pi)
              if q ~= nil and q:GetOwner() == me then tl[#tl + 1] = q:GetX() .. ":" .. q:GetY() end
            end
          end
        end
      end
      print(string.format("spy seat %d id %d at %d:%d level %s op %s moves %s own-targets %s", me, u:GetID(), u:GetX(), u:GetY(),
        tri(okl, lv), opname, tostring(u:GetMovesRemaining()), table.concat(tl, ",")))
    end
  end
end
