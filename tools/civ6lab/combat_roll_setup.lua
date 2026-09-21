-- GameCore_Tuner: a repeatable ranged shot, for measuring the combat random
-- multiplier against a KNOWN rng stream. Ranged fire is used because it does
-- no damage back to the attacker, so one attacker can fire shot after shot;
-- the defender is healed to full between shots because a damaged unit's
-- combat strength is reduced and would move the strength difference.
-- Spawns the pair if they are missing and reports both units' state.
--   --set ZAX=36 --set ZAY=24 --set ZDX=36 --set ZDY=25 --set ZDEF=1
local p0, pd = Players[0], Players[ZDEF]
local function findAt(pl, x, y, t)
  for _, u in pl:GetUnits():Members() do
    if u:GetX() == x and u:GetY() == y and GameInfo.Units[u:GetType()].UnitType == t then return u end
  end
  return nil
end
local a = findAt(p0, ZAX, ZAY, "UNIT_ARCHER")
if a == nil then a = p0:GetUnits():Create(GameInfo.Units["UNIT_ARCHER"].Index, ZAX, ZAY) end
local d = findAt(pd, ZDX, ZDY, "UNIT_WARRIOR")
if d == nil then d = pd:GetUnits():Create(GameInfo.Units["UNIT_WARRIOR"].Index, ZDX, ZDY) end
if a == nil or d == nil then print("{\"kind\":\"combat\",\"error\":\"spawn\"}") return end
pcall(function() d:SetDamage(0) end)
pcall(function() a:SetDamage(0) end)
print("{\"kind\":\"combat-setup\",\"attacker\":" .. a:GetID() .. ",\"ax\":" .. a:GetX() .. ",\"ay\":" .. a:GetY()
  .. ",\"attackerHP\":" .. (a:GetMaxDamage() - a:GetDamage())
  .. ",\"defender\":" .. d:GetID() .. ",\"dx\":" .. d:GetX() .. ",\"dy\":" .. d:GetY()
  .. ",\"defenderHP\":" .. (d:GetMaxDamage() - d:GetDamage())
  .. ",\"atWar\":" .. tostring(p0:GetDiplomacy():IsAtWarWith(ZDEF)) .. "}")
