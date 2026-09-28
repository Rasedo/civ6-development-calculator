-- InGame, the local seat: answer the governor blockers the way the panels
-- do (GovernorPanel.lua / GovernorAssignmentChooser.lua, the row INDEX):
-- appoint the first appointable governor when a title is free, promote the
-- first earnable promotion, and assign every idle governor to the first city
-- with none. Prints what was requested.
local me = Game.GetLocalPlayer()
local g = Players[me]:GetGovernors()
local out = {}
local function op(kind, k)
  local ok, err = pcall(function() UI.RequestPlayerOperation(me, kind, k) end)
  return ok and "" or (" err:" .. tostring(err))
end
if g:CanAppoint() then
  for row in GameInfo.Governors() do
    if not g:HasGovernor(row.Hash) and g:CanEverAppointGovernor(row.Hash) then
      out[#out + 1] = "appoint " .. row.GovernorType .. op(PlayerOperations.APPOINT_GOVERNOR, {[PlayerOperations.PARAM_GOVERNOR_TYPE] = row.Index})
      break
    end
  end
end
-- a point with every governor appointed goes to a promotion
if #out == 0 then
  local done = false
  for set in GameInfo.GovernorPromotionSets() do
    local gov, pr = GameInfo.Governors[set.GovernorType], GameInfo.GovernorPromotions[set.GovernorPromotion]
    if not done and gov and pr and g:HasGovernor(gov.Hash) and g:CanEarnPromotion(gov.Hash, pr.Hash) then
      out[#out + 1] = "promote " .. gov.GovernorType .. " " .. pr.GovernorPromotionType
        .. op(PlayerOperations.PROMOTE_GOVERNOR, {[PlayerOperations.PARAM_GOVERNOR_TYPE] = gov.Index, [PlayerOperations.PARAM_GOVERNOR_PROMOTION_TYPE] = pr.Index})
      done = true
    end
  end
end
local _, list = g:GetGovernorList()
local taken = {}
for _, x in ipairs(list or {}) do
  local c = x:GetAssignedCity()
  if c then taken[c:GetID()] = true end
end
for _, x in ipairs(list or {}) do
  if x:GetAssignedCity() == nil then
    for _, c in Players[me]:GetCities():Members() do
      if not taken[c:GetID()] then
        taken[c:GetID()] = true
        local row = GameInfo.Governors[x:GetType()]
        out[#out + 1] = "assign " .. row.GovernorType .. " to " .. c:GetID()
          .. op(PlayerOperations.ASSIGN_GOVERNOR, {[PlayerOperations.PARAM_GOVERNOR_TYPE] = row.Index,
                 [PlayerOperations.PARAM_PLAYER_ONE] = me, [PlayerOperations.PARAM_CITY_DEST] = c:GetID()})
        break
      end
    end
  end
end
print("gov seat " .. me .. " " .. (#out > 0 and table.concat(out, ", ") or "nothing"))
