-- GameCore_Tuner (after lab_json.lua): hold seat ZP's spy ZID at level 1:
-- CanPromote and XP before; the stored (free) promotion removed
-- (ChangeStoredPromotions -1 while CanPromote reads true, at most 3), the XP
-- taken to 0 and locked (SetExperienceLocked); the state after.
local u = Players[ZP]:GetUnits():FindID(ZID)
local e = u:GetExperience()
local rec = {kind = "lock", p = ZP, id = ZID}
rec.before = {can = P(function() return e:CanPromote() end), xp = P(function() return e:GetExperiencePoints() end)}
local n = 0
while n < 3 and P(function() return e:CanPromote() end) == true do
  P(function() e:ChangeStoredPromotions(-1) end)
  n = n + 1
end
rec.stored = n
rec.xpChange = P(function() e:ChangeExperience(-e:GetExperiencePoints()) return e:GetExperiencePoints() end)
rec.locked = P(function() e:SetExperienceLocked(true) return true end)
rec.after = {can = P(function() return e:CanPromote() end), xp = P(function() return e:GetExperiencePoints() end),
  next = P(function() return e:GetExperienceForNextLevel() end)}
OUT(rec)
