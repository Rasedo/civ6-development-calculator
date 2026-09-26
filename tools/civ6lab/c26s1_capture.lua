-- GameCore: C-26-S1's capture rig for the city at ZX:ZY. Seat 0 declares war
-- on its owner (the three-argument DeclareWarOn), every unit on the centre is
-- destroyed, the centre's garrison and outer pools are set one short of
-- their maximum (`GetDistrictByType(CITY_CENTER):SetDamage`, GameCore only),
-- and one ZUNIT of seat 0 is created on the first free land plot beside it.
-- Prints the unit's id; `b31r_move.lua` then attack-moves it onto the centre.
--   --set ZX=63 --set ZY=20 --set ZUNIT=UNIT_CAVALRY
local c = CityManager.GetCityAt(ZX, ZY)
if c == nil then print("capture: nocity") return end
local owner = c:GetOwner()
local d = Players[0]:GetDiplomacy()
if not d:IsAtWarWith(owner) then pcall(function() d:DeclareWarOn(owner, WarTypes.SURPRISE_WAR, true) end) end
for _, u in ipairs(Units.GetUnitsInPlot(Map.GetPlot(ZX, ZY)) or {}) do
  Players[u:GetOwner()]:GetUnits():Destroy(u)
end
local center = c:GetDistricts():GetDistrictByType(GameInfo.Districts["DISTRICT_CITY_CENTER"].Index)
for _, k in ipairs({DefenseTypes.DISTRICT_GARRISON, DefenseTypes.DISTRICT_OUTER}) do
  local m = center:GetMaxDamage(k)
  if m > 0 then center:SetDamage(k, m - 1) end
end
local made = nil
for dir = 0, 5 do
  local q = Map.GetAdjacentPlot(ZX, ZY, dir)
  if made == nil and q ~= nil and not q:IsWater() and not q:IsMountain() and not q:IsImpassable() and q:GetUnitCount() == 0 then
    made = Players[0]:GetUnits():Create(GameInfo.Units["ZUNIT"].Index, q:GetX(), q:GetY())
  end
end
print(string.format("capture rig city %d %s owner %d war %s garrison %d/%d outer %d/%d unit %s", c:GetID(), c:GetName(), owner,
  tostring(d:IsAtWarWith(owner)), center:GetDamage(DefenseTypes.DISTRICT_GARRISON), center:GetMaxDamage(DefenseTypes.DISTRICT_GARRISON),
  center:GetDamage(DefenseTypes.DISTRICT_OUTER), center:GetMaxDamage(DefenseTypes.DISTRICT_OUTER), made and tostring(made:GetID()) or "none"))
