-- GameCore_Tuner: the strike rig for the population scenes. Stocks
-- thermonuclear devices on player 0 and bases ZN Bombers on a tile player 0
-- has a city on (a Bomber can only be CREATED there). Reports the stock and
-- every Bomber it can see, so a strike call never has to guess which unit.
--   --set ZBX=36 --set ZBY=22 --set ZN=4 --set ZSTOCK=20
local p0 = Players[0]
local w = p0:GetWMDs()
local iT = GameInfo.WMDs["WMD_THERMONUCLEAR_DEVICE"].Index
local iN = GameInfo.WMDs["WMD_NUCLEAR_DEVICE"].Index
local have = w:GetWeaponCount(iT)
if have < ZSTOCK then pcall(function() w:ChangeWeaponCount(iT, ZSTOCK - have) end) end
local made = 0
for _ = 1, ZN do
  if p0:GetUnits():Create(GameInfo.Units["UNIT_BOMBER"].Index, ZBX, ZBY) ~= nil then made = made + 1 end
end
local bombers = {}
for _, u in p0:GetUnits():Members() do
  if GameInfo.Units[u:GetType()].UnitType == "UNIT_BOMBER" then
    bombers[#bombers + 1] = "{\"id\":" .. u:GetID() .. ",\"x\":" .. u:GetX() .. ",\"y\":" .. u:GetY()
      .. ",\"moves\":" .. u:GetMovesRemaining() .. "}"
  end
end
print("{\"kind\":\"setup\",\"turn\":" .. Game.GetCurrentGameTurn()
  .. ",\"thermo\":" .. w:GetWeaponCount(iT) .. ",\"nuclear\":" .. w:GetWeaponCount(iN)
  .. ",\"bombersMade\":" .. made .. ",\"bombers\":[" .. table.concat(bombers, ",") .. "]}")
