-- InGame (after lab_json.lua): one governor operation for the local seat,
-- with the parameters the install's screens pass (GovernorPanel.lua,
-- GovernorDetailsPanel.lua, GovernorAssignmentChooser.lua): the governor
-- row's INDEX, the promotion's INDEX, PARAM_PLAYER_ONE the city's owner and
-- PARAM_CITY_DEST the city ID.
--   ZGOV   the governor row (GOVERNOR_THE_BUILDER ...)
--   ZSTEP  appoint | promote (ZPROMO) | assign (ZCITY, or reactor ZK's city when ZCITY is -1) | read
-- Prints the governor's state after the request (the request resolves on the
-- game's clock: read again with ZSTEP=read to see it land).
local me = Game.GetLocalPlayer()
local g = Players[me]:GetGovernors()
local row = GameInfo.Governors["ZGOV"]
local rec = {kind = "gov", step = "ZSTEP", gov = "ZGOV", govIndex = row.Index, seat = me}
local function gov()
  local ok, has, list = pcall(function() return g:GetGovernorList() end)
  if not ok or not list then return nil end
  for _, x in ipairs(list) do
    local t = GameInfo.Governors[x:GetType()]
    if t and t.GovernorType == "ZGOV" then return x end
  end
end
if "ZSTEP" == "appoint" then
  local k = {}
  k[PlayerOperations.PARAM_GOVERNOR_TYPE] = row.Index
  rec.can = P(function() return g:CanAppoint() end)
  rec.call = P(function() UI.RequestPlayerOperation(me, PlayerOperations.APPOINT_GOVERNOR, k) return true end)
elseif "ZSTEP" == "promote" then
  local pr = GameInfo.GovernorPromotions["ZPROMO"]
  rec.promo, rec.promoIndex = "ZPROMO", pr.Index
  rec.canPromote = P(function() return g:CanPromoteGovernor(row.Hash) end)
  local k = {}
  k[PlayerOperations.PARAM_GOVERNOR_TYPE] = row.Index
  k[PlayerOperations.PARAM_GOVERNOR_PROMOTION_TYPE] = pr.Index
  rec.call = P(function() UI.RequestPlayerOperation(me, PlayerOperations.PROMOTE_GOVERNOR, k) return true end)
elseif "ZSTEP" == "assign" then
  local cid = ZCITY
  if cid == -1 then cid = Game.GetFalloutManager():GetReactorByIndex(ZK).CityID end
  local k = {}
  k[PlayerOperations.PARAM_GOVERNOR_TYPE] = row.Index
  k[PlayerOperations.PARAM_PLAYER_ONE] = me
  k[PlayerOperations.PARAM_CITY_DEST] = cid
  rec.target = cid
  rec.call = P(function() UI.RequestPlayerOperation(me, PlayerOperations.ASSIGN_GOVERNOR, k) return true end)
end
rec.points = P(function() return g:GetGovernorPoints() end)
rec.spent = P(function() return g:GetGovernorPointsSpent() end)
local x = gov()
if x then
  rec.appointed = true
  rec.type = x:GetType()
  rec.promos = {}
  for pr in GameInfo.GovernorPromotionSets() do
    if pr.GovernorType == "ZGOV" and P(function() return x:HasPromotion(DB.MakeHash(pr.GovernorPromotion)) end) == true then
      rec.promos[#rec.promos + 1] = pr.GovernorPromotion
    end
  end
  rec.city = P(function() local c = x:GetAssignedCity() return c and c:GetID() or -1 end)
  rec.established = P(function() return x:IsEstablished() end)
  rec.turnsLeft = P(function() return g:GetTurnsToEstablish(row.Hash) end)
else
  rec.appointed = false
end
OUT(rec)
