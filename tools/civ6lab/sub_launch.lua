-- GameCore_Tuner: put a Nuclear Submarine on water within launch range of the
-- aim plot. The wiki describes silo- and submarine-launched weapons as having a
-- DIFFERENT interception rule from a bomber's ("a chance of being shot down"),
-- and the bomber rule measured here is an anti-air attack on the DELIVERING
-- UNIT — so the question is whether a submarine takes that attack at all.
--   --set ZX=36 --set ZY=10 --set ZSTOCK=10
local p0 = Players[0]
-- a spent submarine still occupies the tile, and a naval unit cannot stack, so
-- Create returns nil on the second round and the battery reads "nosub" as if
-- the launch had been refused. Clear the previous one first.
local old = {}
for _, x in p0:GetUnits():Members() do
  if GameInfo.Units[x:GetType()].UnitType == "UNIT_NUCLEAR_SUBMARINE" then old[#old + 1] = x:GetID() end
end
for _, id in ipairs(old) do
  local x = p0:GetUnits():FindID(id)
  if x ~= nil then p0:GetUnits():Destroy(x) end
end
local u = p0:GetUnits():Create(GameInfo.Units["UNIT_NUCLEAR_SUBMARINE"].Index, ZX, ZY)
local w = p0:GetWMDs()
local iN = GameInfo.WMDs["WMD_NUCLEAR_DEVICE"].Index
if w:GetWeaponCount(iN) < ZSTOCK then
  pcall(function() w:ChangeWeaponCount(iN, ZSTOCK - w:GetWeaponCount(iN)) end)
end
print("{\"kind\":\"sub\",\"made\":" .. tostring(u ~= nil)
  .. ",\"id\":" .. (u and u:GetID() or -1)
  .. ",\"at\":\"" .. (u and (u:GetX() .. ":" .. u:GetY()) or "-") .. "\""
  .. ",\"hp\":" .. (u and (u:GetMaxDamage() - u:GetDamage()) or -1)
  .. ",\"moves\":" .. (u and u:GetMovesRemaining() or -1)
  .. ",\"nuclear\":" .. w:GetWeaponCount(iN) .. "}")
