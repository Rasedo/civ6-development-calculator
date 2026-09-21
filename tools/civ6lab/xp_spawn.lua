-- GameCore_Tuner: one unit of ZUNIT for ZPLAYER on one named tile, clearing
-- whatever of that player's already stands there (two land units of one player
-- cannot share a plot, and a stale one silently makes Create return nil).
--   --set ZPLAYER=0 --set ZUNIT=UNIT_WARRIOR --set ZX=38 --set ZY=13
local pl = Players[ZPLAYER]
local doomed = {}
for _, u in pl:GetUnits():Members() do
  if u:GetX() == ZX and u:GetY() == ZY then doomed[#doomed + 1] = u:GetID() end
end
for _, id in ipairs(doomed) do
  local u = pl:GetUnits():FindID(id)
  if u ~= nil then pl:GetUnits():Destroy(u) end
end
local u = pl:GetUnits():Create(GameInfo.Units["ZUNIT"].Index, ZX, ZY)
local xp = -1
if u ~= nil then pcall(function() xp = u:GetExperience():GetExperiencePoints() end) end
print("{\"kind\":\"xpspawn\",\"id\":" .. (u and u:GetID() or -1)
  .. ",\"at\":\"" .. ZX .. ":" .. ZY .. "\",\"cleared\":" .. #doomed
  .. ",\"xp\":" .. xp .. ",\"moves\":" .. (u and u:GetMovesRemaining() or -1) .. "}")
