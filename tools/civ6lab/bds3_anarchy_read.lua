-- Any state (after lab_json.lua): B-D-S3 — per living major, the current
-- government, anarchy state, and GetAnarchyTurns(g) for every government.
local turn = Game.GetCurrentGameTurn()
for p = 0, 62 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() and pl:IsMajor() then
    local cu = pl:GetCulture()
    local an = {}
    for g in GameInfo.Governments() do
      an[g.GovernmentType] = {turns = P(function() return cu:GetAnarchyTurns(g.Index) end),
        unlocked = P(function() return cu:IsGovernmentUnlocked(g.Index) end)}
    end
    OUT({kind = "anarchy", turn = turn, p = p, gov = P(function() return cu:GetCurrentGovernment() end),
      inAnarchy = P(function() return cu:IsInAnarchy() end), anarchyEnd = P(function() return cu:GetAnarchyEndTurn() end),
      civicDone = P(function() return cu:CivicCompletedThisTurn() end),
      changeMade = P(function() return cu:GovernmentChangeMade() end),
      canChangeAtAll = P(function() return cu:CanChangeGovernmentAtAll() end),
      govs = an})
  end
end
