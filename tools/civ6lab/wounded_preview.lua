-- InGame: C-26's Tomyris clause (BONUS_VS_WOUNDED_UNITS, attached to seat 0 in
-- GameCore beforehand). Player ZA's first land melee unit previews an attack on
-- the capital centre of player ZP (or, if seat 0 cannot preview it, the first
-- other major whose capital it can) and on that player's first land military
-- unit; prints the ATTACKER's strength and modifier lines and the targets'
-- damage. Run before and after the GameCore damage steps.
local function lines(res, side)
  local out = {}
  local d = res and res[side]
  if not d then return out end
  for _, key in ipairs({"PREVIEW_TEXT_MODIFIER", "PREVIEW_TEXT_OPPONENT", "PREVIEW_TEXT_PROMOTION", "PREVIEW_TEXT_TERRAIN",
                        "PREVIEW_TEXT_DEFENSES", "PREVIEW_TEXT_HEALTH", "PREVIEW_TEXT_ASSIST", "PREVIEW_TEXT_RESOURCES"}) do
    for _, item in ipairs(d[CombatResultParameters[key]] or {}) do out[#out + 1] = key:sub(14) .. ":" .. tostring(item) end
  end
  return out
end
local function J(list)
  local o = {}
  for _, s in ipairs(list) do o[#o + 1] = '"' .. s:gsub('"', "'") .. '"' end
  return "[" .. table.concat(o, ",") .. "]"
end
local function strength(res)
  local a = res and res[CombatResultParameters.ATTACKER]
  return a and a[CombatResultParameters.COMBAT_STRENGTH]
end
local atk = nil
for _, u in Players[ZA]:GetUnits():Members() do
  local row = GameInfo.Units[u:GetType()]
  if atk == nil and row.FormationClass == "FORMATION_CLASS_LAND_COMBAT" and (row.RangedCombat or 0) == 0 then atk = u end
end
local order = {ZP}
for q = 0, 62 do if q ~= ZP and q ~= ZA then order[#order + 1] = q end end
for _, p in ipairs(order) do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() and pl:IsMajor() and pl:GetCities():GetCapitalCity() ~= nil then
    local c = pl:GetCities():GetCapitalCity()
    local centre = nil
    for _, d in c:GetDistricts():Members() do
      if GameInfo.Districts[d:GetType()].DistrictType == "DISTRICT_CITY_CENTER" then centre = d end
    end
    local r1 = CombatManager.SimulateAttackVersus(atk:GetComponentID(), centre:GetComponentID())
    if r1 ~= nil and strength(r1) ~= nil then
      print('{"target":"city","p":' .. p .. ',"garrisonDamage":' .. centre:GetDamage(DefenseTypes.DISTRICT_GARRISON)
        .. ',"atk":' .. tostring(strength(r1)) .. ',"lines":' .. J(lines(r1, CombatResultParameters.ATTACKER)) .. '}')
      for _, u in pl:GetUnits():Members() do
        local row = GameInfo.Units[u:GetType()]
        if row.FormationClass == "FORMATION_CLASS_LAND_COMBAT" then
          local r2 = CombatManager.SimulateAttackVersus(atk:GetComponentID(), u:GetComponentID())
          if r2 ~= nil and strength(r2) ~= nil then
            print('{"target":"unit","p":' .. p .. ',"unit":"' .. row.UnitType .. '","damage":' .. u:GetDamage()
              .. ',"atk":' .. tostring(strength(r2)) .. ',"lines":' .. J(lines(r2, CombatResultParameters.ATTACKER)) .. '}')
            break
          end
        end
      end
      return
    end
  end
end
print('{"error":"no previewable capital"}')
