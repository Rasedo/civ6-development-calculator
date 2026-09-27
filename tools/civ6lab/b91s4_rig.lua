-- GameCore_Tuner (after lab_json.lua): B-91-S4 rig (Holy Waters). When ZADD
-- is 1, add BELIEF_HOLY_WATERS to the religion founded by ZF
-- (`AddBelief(founder, belief index)`). Then create, for player ZP, one
-- UNIT_MISSIONARY per entry of ZUNITS ("x,y,religionIndex;..."), set its
-- religion and its damage to ZDMG. Prints each unit and the seat's wars.
if ZADD == 1 then
  P(function() Game.GetReligion():AddBelief(ZF, GameInfo.Beliefs["BELIEF_HOLY_WATERS"].Index) return true end)
end
local made = {}
for x, y, r in string.gmatch("ZUNITS", "(%d+),(%d+),(%d+)") do
  x, y, r = tonumber(x), tonumber(y), tonumber(r)
  local u = P(function() return Players[ZP]:GetUnits():Create(GameInfo.Units["UNIT_MISSIONARY"].Index, x, y) end)
  local rec = {x = x, y = y, r = r}
  if type(u) ~= "string" and u ~= nil then
    rec.id = u:GetID()
    rec.at = {u:GetX(), u:GetY()}
    rec.set = P(function() u:GetReligion():SetReligionType(GameInfo.Religions[r].ReligionType) return true end)
    rec.rel = P(function() return u:GetReligion():GetReligionType() end)
    rec.dmg = P(function() u:SetDamage(ZDMG) return u:GetDamage() end)
    rec.max = P(function() return u:GetMaxDamage() end)
  else
    rec.err = u
  end
  made[#made + 1] = rec
end
local wars = {}
for p = 0, 62 do
  local q = Players[p]
  if q ~= nil and q:IsAlive() and p ~= ZP and P(function() return Players[ZP]:GetDiplomacy():IsAtWarWith(p) end) == true then wars[#wars + 1] = p end
end
OUT({kind = "rig", add = ZADD, units = made, wars = wars})
