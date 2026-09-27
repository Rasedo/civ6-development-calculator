-- InGame, the defender local (C-16-S1): its spy ZID.
--   ZMODE=promote  take one offered promotion with no level or counterspy
--                  term (never Seduction, Surveillance, Quartermaster,
--                  Polygraph, Ace Driver);
--   ZMODE=post     start UNITOPERATION_SPY_COUNTERSPY on the district plot
--                  ZDX:ZDY (the plot table first, the empty table second);
--   ZMODE=read     the spy's plot, level, XP, promotions, operation and the
--                  counterspy's target plots.
local me = Game.GetLocalPlayer()
local u = Players[me]:GetUnits():FindID(ZID)
if u == nil then print("def: nospy local " .. me) return end
local op = GameInfo.UnitOperations["UNITOPERATION_SPY_COUNTERSPY"]
local mode = "ZMODE"
local BAD = {PROMOTION_SPY_SEDUCTION = 1, PROMOTION_SPY_SURVEILLANCE = 1, PROMOTION_SPY_QUARTERMASTER = 1,
  PROMOTION_SPY_POLYGRAPH = 1, PROMOTION_SPY_ACE_DRIVER = 1}
if mode == "promote" then
  local can, res = UnitManager.CanStartCommand(u, UnitCommandTypes.PROMOTE, true, true)
  local off = can and res and res[UnitCommandResults.PROMOTIONS] or {}
  local names, pick = {}, nil
  for _, e in ipairs(off) do
    local n = GameInfo.UnitPromotions[e].UnitPromotionType
    names[#names + 1] = n
    if pick == nil and BAD[n] == nil then pick = e end
  end
  if pick ~= nil then
    UnitManager.RequestCommand(u, UnitCommandTypes.PROMOTE, {[UnitCommandTypes.PARAM_PROMOTION_TYPE] = pick})
  end
  print("def: promote can " .. tostring(can) .. " offered " .. table.concat(names, ",") .. " took "
    .. (pick and GameInfo.UnitPromotions[pick].UnitPromotionType or "none"))
elseif mode == "post" then
  local t = {[UnitOperationTypes.PARAM_X] = ZDX, [UnitOperationTypes.PARAM_Y] = ZDY}
  local ok1, c1 = pcall(function() return UnitManager.CanStartOperation(u, op.Hash, nil, t) end)
  local how = "none"
  if ok1 and c1 then
    UnitManager.RequestOperation(u, op.Hash, t)
    how = "plot"
  else
    local ok2, c2 = pcall(function() return UnitManager.CanStartOperation(u, op.Hash, nil, true) end)
    if ok2 and c2 then
      UnitManager.RequestOperation(u, op.Hash, {})
      how = "empty"
    end
  end
  print("def: post at " .. ZDX .. ":" .. ZDY .. " plotcan " .. tostring(c1) .. " requested " .. how)
else
  local x = u:GetExperience()
  local pr = {}
  for r in GameInfo.UnitPromotions() do
    if r.PromotionClass == "PROMOTION_CLASS_SPY" and x:HasPromotion(r.Index) then pr[#pr + 1] = r.UnitPromotionType end
  end
  local okt, tg = pcall(function() return UnitManager.GetOperationTargets(u, op.Hash) end)
  local tl = {}
  if okt and type(tg) == "table" then
    for _, l in pairs(tg) do
      if type(l) == "table" then
        for _, pi in ipairs(l) do local q = Map.GetPlotByIndex(pi) if q then tl[#tl + 1] = q:GetX() .. ":" .. q:GetY() end end
      end
    end
  end
  local sop = u:GetSpyOperation()
  print(string.format("def: spy %d at %d:%d level %d xp %d promos %s op %s targets %s", u:GetID(), u:GetX(), u:GetY(),
    x:GetLevel(), x:GetExperiencePoints(), table.concat(pr, ","),
    (sop ~= nil and sop >= 0 and GameInfo.UnitOperations[sop]) and GameInfo.UnitOperations[sop].OperationType or tostring(sop),
    table.concat(tl, ",")))
end
