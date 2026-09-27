-- InGame, B-95: the combat preview's base for every DEFENDED district of
-- player ZP (centre, Encampment, any with outer defence), attacked by the first
-- land melee unit of another player. One line per district: type, base,
-- GetDefenseStrength, the DEFENSES texts.
--   --set ZP=1
local atk = nil
for q = 0, 62 do
  if q ~= ZP and Players[q] ~= nil and Players[q]:IsAlive() and atk == nil then
    for _, u in Players[q]:GetUnits():Members() do
      local row = GameInfo.Units[u:GetType()]
      if atk == nil and row.FormationClass == "FORMATION_CLASS_LAND_COMBAT" and (row.RangedCombat or 0) == 0 and (row.Combat or 0) > 0 then atk = u end
    end
  end
end
for _, c in Players[ZP]:GetCities():Members() do
  for _, d in c:GetDistricts():Members() do
    local ty = GameInfo.Districts[d:GetType()].DistrictType
    local ok, res = pcall(function() return CombatManager.SimulateAttackVersus(atk:GetComponentID(), d:GetComponentID()) end)
    local D = ok and res and res[CombatResultParameters.DEFENDER]
    if D ~= nil then
      local lines = {}
      for _, s in ipairs(D[CombatResultParameters.PREVIEW_TEXT_DEFENSES] or {}) do lines[#lines + 1] = s end
      print(c:GetName() .. " " .. ty .. " base=" .. tostring(D[CombatResultParameters.COMBAT_STRENGTH])
        .. " def=" .. tostring(d:GetDefenseStrength()) .. " | " .. table.concat(lines, " ; "))
    end
  end
end
