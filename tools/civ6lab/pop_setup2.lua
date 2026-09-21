-- GameCore_Tuner: pop_setup.lua with the DELIVERY unit as a parameter, so the
-- Jet Bomber (Combat 90) can be flown against the same interception scene as
-- the Bomber (Combat 85). Reports the stock and every unit of that type.
--   --set ZBX=39 --set ZBY=16 --set ZN=1 --set ZSTOCK=40 --set ZDELIVER=UNIT_JET_BOMBER
local p0 = Players[0]
local w = p0:GetWMDs()
local iT = GameInfo.WMDs["WMD_THERMONUCLEAR_DEVICE"].Index
local iN = GameInfo.WMDs["WMD_NUCLEAR_DEVICE"].Index
local have = w:GetWeaponCount(iT)
if have < ZSTOCK then pcall(function() w:ChangeWeaponCount(iT, ZSTOCK - have) end) end
local haveN = w:GetWeaponCount(iN)
if haveN < ZSTOCK then pcall(function() w:ChangeWeaponCount(iN, ZSTOCK - haveN) end) end
local row = GameInfo.Units["ZDELIVER"]
if row == nil then print("{\"kind\":\"setup2\",\"error\":\"nounitrow\"}") return end
local made = 0
for _ = 1, ZN do
  if p0:GetUnits():Create(row.Index, ZBX, ZBY) ~= nil then made = made + 1 end
end
local list = {}
for _, u in p0:GetUnits():Members() do
  if GameInfo.Units[u:GetType()].UnitType == "ZDELIVER" and u:GetMovesRemaining() > 0 then
    list[#list + 1] = "{\"id\":" .. u:GetID() .. ",\"x\":" .. u:GetX() .. ",\"y\":" .. u:GetY()
      .. ",\"combat\":" .. u:GetCombat() .. ",\"moves\":" .. u:GetMovesRemaining() .. "}"
  end
end
print("{\"kind\":\"setup2\",\"unit\":\"ZDELIVER\",\"combat\":" .. row.Combat
  .. ",\"thermo\":" .. w:GetWeaponCount(iT) .. ",\"nuclear\":" .. w:GetWeaponCount(iN)
  .. ",\"made\":" .. made .. ",\"ready\":[" .. table.concat(list, ",") .. "]}")
