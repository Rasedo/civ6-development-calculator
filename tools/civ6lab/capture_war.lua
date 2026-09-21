-- GameCore_Tuner: scene C setup — declare war on ZP, kill whatever garrisons
-- the target city's centre tile, and spawn ONE melee unit for player 0 on
-- ZSX:ZSY (one unit per tile, always).
--   Players[0]:GetDiplomacy():DeclareWarOn(p, WarTypes.SURPRISE_WAR, true)
--   The panel's SetAtWarWith is a Civ5 spelling and is NOT on this object.
--   The ONE-argument DeclareWarOn(p) returns ok and leaves IsAtWarWith false;
--   only the three-argument form actually starts the war.
--   Debug/Unit.ltp: pUnit:SetDamage(100)
--   --set ZP=1 --set ZCX=21 --set ZCY=22 --set ZSX=22 --set ZSY=22 --set ZUNIT=UNIT_TANK
local tp = ZP
local d = Players[0]:GetDiplomacy()
print("atWarBefore=" .. tostring(d:IsAtWarWith(tp)))
local okw, errw = pcall(function() d:DeclareWarOn(tp, WarTypes.SURPRISE_WAR, true) end)
print("declareWar ok=" .. tostring(okw) .. " err=" .. tostring(errw) .. " atWar=" .. tostring(d:IsAtWarWith(tp)))
for _, u in Players[tp]:GetUnits():Members() do
  if u:GetX() == ZCX and u:GetY() == ZCY then
    pcall(function() u:SetDamage(u:GetMaxDamage()) end)
    print("garrison " .. GameInfo.Units[u:GetType()].UnitType .. "#" .. u:GetID()
      .. " damage now " .. tostring(u:GetDamage()) .. "/" .. tostring(u:GetMaxDamage()))
  end
end
local u = Players[0]:GetUnits():Create(GameInfo.Units["ZUNIT"].Index, ZSX, ZSY)
print("attacker " .. tostring(u and u:GetID()) .. " at " .. ZSX .. ":" .. ZSY)
