-- GameCore: C-38-S3's intervention on every living city-state (not the Free
-- Cities): its bank set to ZGOLD (`GetTreasury():SetGoldBalance`), then
--   ZARM = builder   every Builder it owns destroyed;
--   ZARM = military  its military (land / naval / air combat formation
--                    classes) cut or raised to exactly ZK units: the extras
--                    destroyed (last listed first), the shortfall created as
--                    the type of its first military unit (UNIT_SWORDSMAN when
--                    it has none), one per free land plot within 3 of its
--                    city, nearest first;
--   ZARM = none      the bank alone.
-- One JSON line per minor: what it holds after the setup.
--   --set ZGOLD=300 --set ZARM=military --set ZK=4
local GOLD, ARM, K = ZGOLD, "ZARM", ZK
local function isMilitary(row)
  local f = row.FormationClass
  return f == "FORMATION_CLASS_LAND_COMBAT" or f == "FORMATION_CLASS_NAVAL" or f == "FORMATION_CLASS_AIR"
end
for p = 0, 62 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() and not pl:IsMajor() and not pl:IsBarbarian()
     and PlayerConfigurations[p]:GetCivilizationTypeName() ~= "CIVILIZATION_FREE_CITIES" then
    pl:GetTreasury():SetGoldBalance(GOLD)
    local units = pl:GetUnits()
    local mil, bld = {}, {}
    for _, u in units:Members() do
      local row = GameInfo.Units[u:GetType()]
      if row.UnitType == "UNIT_BUILDER" then bld[#bld + 1] = u
      elseif isMilitary(row) then mil[#mil + 1] = u end
    end
    local made, cut, failed = 0, 0, 0
    if ARM == "builder" then
      for _, u in ipairs(bld) do units:Destroy(u); cut = cut + 1 end
    elseif ARM == "military" then
      while #mil > K do units:Destroy(mil[#mil]); mil[#mil] = nil; cut = cut + 1 end
      if #mil < K then
        local kind = (#mil > 0) and GameInfo.Units[mil[1]:GetType()].UnitType or "UNIT_SWORDSMAN"
        local idx = GameInfo.Units[kind].Index
        local city = pl:GetCities():GetCapitalCity()
        if city == nil then for _, c in pl:GetCities():Members() do city = c; break end end
        local plots = {}
        if city ~= nil then
          local cx, cy = city:GetX(), city:GetY()
          for dx = -4, 4 do
            for dy = -4, 4 do
              local q = Map.GetPlot(cx + dx, cy + dy)
              if q ~= nil then
                local d = Map.GetPlotDistance(cx, cy, q:GetX(), q:GetY())
                if d >= 1 and d <= 3 and not q:IsWater() and not q:IsImpassable() and not q:IsMountain()
                   and q:GetUnitCount() == 0 and (q:GetOwner() == p or q:GetOwner() == -1) then
                  plots[#plots + 1] = {d, q:GetX(), q:GetY()}
                end
              end
            end
          end
          table.sort(plots, function(a, b) if a[1] ~= b[1] then return a[1] < b[1] end
            if a[2] ~= b[2] then return a[2] < b[2] end return a[3] < b[3] end)
        end
        local i = 1
        while #mil + made < K and i <= #plots do
          local u = units:Create(idx, plots[i][2], plots[i][3])
          if u ~= nil then made = made + 1 else failed = failed + 1 end
          i = i + 1
        end
      end
    end
    local nm, nb = 0, 0
    for _, u in units:Members() do
      local row = GameInfo.Units[u:GetType()]
      if row.UnitType == "UNIT_BUILDER" then nb = nb + 1 elseif isMilitary(row) then nm = nm + 1 end
    end
    print(string.format('{"kind":"setup","p":%d,"arm":"%s","gold":%.2f,"military":%d,"builders":%d,"made":%d,"cut":%d,"failed":%d,"warWith0":%s}',
      p, ARM, pl:GetTreasury():GetGoldBalance(), nm, nb, made, cut, failed, tostring(pl:GetDiplomacy():IsAtWarWith(0))))
  end
end
