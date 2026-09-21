-- GameCore_Tuner: a repeatable combat scene for the experience question.
-- A unit may attack once per turn, so the battery cannot re-attack with one
-- unit; instead N IDENTICAL attackers are placed and each fires once, at its
-- own seed. Everything else is held fixed, so the only thing that differs
-- between rounds is the damage roll.
--   --set ZN=6 --set ZATT=UNIT_CROSSBOWMAN --set ZAX=38 --set ZAY=16
--   --set ZDEF=UNIT_WARRIOR --set ZDX=37 --set ZDY=15 --set ZWAR=1
local p0 = Players[0]
local pe = Players[ZWAR]
local old = {}
for _, u in p0:GetUnits():Members() do
  if GameInfo.Units[u:GetType()].UnitType == "ZATT" then old[#old + 1] = u:GetID() end
end
for _, id in ipairs(old) do
  local u = p0:GetUnits():FindID(id)
  if u ~= nil then p0:GetUnits():Destroy(u) end
end
local doomed = {}
for _, u in pe:GetUnits():Members() do
  if u:GetX() == ZDX and u:GetY() == ZDY then doomed[#doomed + 1] = u:GetID() end
end
for _, id in ipairs(doomed) do
  local u = pe:GetUnits():FindID(id)
  if u ~= nil then pe:GetUnits():Destroy(u) end
end
local d = pe:GetUnits():Create(GameInfo.Units["ZDEF"].Index, ZDX, ZDY)
local made = {}
for i = 1, ZN do
  local u = p0:GetUnits():Create(GameInfo.Units["ZATT"].Index, ZAX, ZAY)
  if u ~= nil then
    local xp = -1
    pcall(function() xp = u:GetExperience():GetExperiencePoints() end)
    made[#made + 1] = "{\"id\":" .. u:GetID() .. ",\"xp\":" .. xp
      .. ",\"moves\":" .. u:GetMovesRemaining() .. "}"
  end
end
print("{\"kind\":\"xpscene\",\"defender\":" .. (d and d:GetID() or -1)
  .. ",\"defenderHP\":" .. (d and (d:GetMaxDamage() - d:GetDamage()) or -1)
  .. ",\"defenderCombat\":" .. (d and d:GetCombat() or -1)
  .. ",\"canEarnXP\":" .. tostring(GameInfo.Units["ZATT"].CanEarnExperience)
  .. ",\"attackers\":[" .. table.concat(made, ",") .. "]}")
