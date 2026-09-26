-- InGame: B-95's garrison line against the garrison's health. In the capital of
-- player ZP, the military unit on the centre (placed beforehand in GameCore) is
-- set to each damage in ZDMGS (GameCore call through UnitManager, guarded),
-- and the combat preview from another player's land unit reads the centre's
-- DEFENSES lines each time. One JSON line per damage step.
local pid = ZP
local c = Players[pid]:GetCities():GetCapitalCity()
local centre = nil
for _, d in c:GetDistricts():Members() do
  if GameInfo.Districts[d:GetType()].DistrictType == "DISTRICT_CITY_CENTER" then centre = d end
end
local gar = nil
for _, u in Players[pid]:GetUnits():Members() do
  if u:GetX() == c:GetX() and u:GetY() == c:GetY() and GameInfo.Units[u:GetType()].FormationClass == "FORMATION_CLASS_LAND_COMBAT" then gar = u end
end
local atk = nil
for q = 0, 62 do
  if q ~= pid and Players[q] ~= nil and Players[q]:IsAlive() then
    for _, u in Players[q]:GetUnits():Members() do
      local row = GameInfo.Units[u:GetType()]
      if atk == nil and row.FormationClass == "FORMATION_CLASS_LAND_COMBAT" and (row.RangedCombat or 0) == 0 then atk = u end
    end
  end
end
if gar == nil or atk == nil or centre == nil then print('{"error":"no garrison, attacker or centre"}') return end
local res = CombatManager.SimulateAttackVersus(atk:GetComponentID(), centre:GetComponentID())
local d = res and res[CombatResultParameters.DEFENDER]
local lines = {}
for _, item in ipairs((d and d[CombatResultParameters.PREVIEW_TEXT_DEFENSES]) or {}) do lines[#lines + 1] = '"' .. tostring(item):gsub('"', "'") .. '"' end
print('{"unit":"' .. GameInfo.Units[gar:GetType()].UnitType .. '","combat":' .. GameInfo.Units[gar:GetType()].Combat
  .. ',"damage":' .. gar:GetDamage() .. ',"def":' .. centre:GetDefenseStrength()
  .. ',"base":' .. tostring(d and d[CombatResultParameters.COMBAT_STRENGTH]) .. ',"defenses":[' .. table.concat(lines, ",") .. ']}')
