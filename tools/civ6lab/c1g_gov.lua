-- InGame (after lab_json.lua): C-1 — Liang (GOVERNOR_THE_BUILDER) for seat 0:
-- ZSTEP appoint | promote (ZPROMO, by Hash then Index) | assign (reactor ZK's
-- city) | read. Prints the governor's state after the step.
local me = 0
local g = Players[me]:GetGovernors()
local row = GameInfo.Governors["GOVERNOR_THE_BUILDER"]
local rec = {kind = "gov", step = "ZSTEP"}
local function gov()
  local ok, has, list = pcall(function() return g:GetGovernorList() end)
  if not ok or not list then return nil end
  for _, x in ipairs(list) do
    local t = GameInfo.Governors[x:GetType()]
    if t and t.GovernorType == "GOVERNOR_THE_BUILDER" then return x end
  end
end
if "ZSTEP" == "appoint" then
  local k = {}
  k[PlayerOperations.PARAM_GOVERNOR_TYPE] = ZGT
  rec.can = P(function() return g:CanAppoint() end)
  rec.call = P(function() UI.RequestPlayerOperation(me, PlayerOperations.APPOINT_GOVERNOR, k) return true end)
elseif "ZSTEP" == "promote" then
  local pr = GameInfo.GovernorPromotions["ZPROMO"]
  local k = {}
  k[PlayerOperations.PARAM_GOVERNOR_TYPE] = ZGT
  k[PlayerOperations.PARAM_GOVERNOR_PROMOTION_TYPE] = pr.Index
  rec.canIdx = P(function() return g:CanPromoteGovernor(row.Index, pr.Index) end)
  rec.canHash = P(function() return g:CanPromoteGovernor(row.Index, pr.Hash) end)
  rec.call = P(function() UI.RequestPlayerOperation(me, PlayerOperations.PROMOTE_GOVERNOR, k) return true end)
elseif "ZSTEP" == "promoteh" then
  local pr = GameInfo.GovernorPromotions["ZPROMO"]
  local k = {}
  k[PlayerOperations.PARAM_GOVERNOR_TYPE] = ZGT
  k[PlayerOperations.PARAM_GOVERNOR_PROMOTION_TYPE] = pr.Hash
  rec.call = P(function() UI.RequestPlayerOperation(me, PlayerOperations.PROMOTE_GOVERNOR, k) return true end)
elseif "ZSTEP" == "assign" then
  local r = Game.GetFalloutManager():GetReactorByIndex(ZK)
  local k = {}
  k[PlayerOperations.PARAM_GOVERNOR_TYPE] = ZGT
  k[PlayerOperations.PARAM_PLAYER_ONE] = me
  k[PlayerOperations.PARAM_CITY_DEST] = r.CityID
  rec.city = r.CityID
  rec.call = P(function() UI.RequestPlayerOperation(me, PlayerOperations.ASSIGN_GOVERNOR, k) return true end)
end
rec.points = P(function() return g:GetGovernorPoints() end)
rec.spent = P(function() return g:GetGovernorPointsSpent() end)
local x = gov()
if x then
  rec.appointed = true
  rec.promos = {}
  for pr in GameInfo.GovernorPromotions() do
    if P(function() return x:HasPromotion(pr.Hash) end) == true then rec.promos[#rec.promos + 1] = pr.GovernorPromotionType end
  end
  rec.city = P(function() local c = x:GetAssignedCity() return c and c:GetID() or -1 end)
  rec.established = P(function() return x:IsEstablished() end)
  rec.turnsLeft = P(function() return x:GetTurnsToEstablish() end)
else
  rec.appointed = false
end
OUT(rec)
