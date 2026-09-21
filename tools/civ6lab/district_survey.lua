-- InGame: every city that owns an ENCAMPMENT (or any district named by ZD),
-- with the city centre's and the district's damage pools. Scene C's scouting.
--   --set ZD=DISTRICT_ENCAMPMENT
for p = 0, 62 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() then
    for _, c in pl:GetCities():Members() do
      local has = false
      for _, d in c:GetDistricts():Members() do
        local t = GameInfo.Districts[d:GetType()]
        if t ~= nil and t.DistrictType == "ZD" then has = true end
      end
      if has then
        local parts = {}
        for _, d in c:GetDistricts():Members() do
          local t = GameInfo.Districts[d:GetType()]
          local function n(f) local ok, v = pcall(f); return tostring(ok and v or -1) end
          parts[#parts + 1] = (t and t.DistrictType or "?") .. "@" .. d:GetX() .. ":" .. d:GetY()
            .. " def=" .. n(function() return d:GetDefenseStrength() end)
            .. " gar=" .. n(function() return d:GetDamage(DefenseTypes.DISTRICT_GARRISON) end)
            .. "/" .. n(function() return d:GetMaxDamage(DefenseTypes.DISTRICT_GARRISON) end)
            .. " out=" .. n(function() return d:GetDamage(DefenseTypes.DISTRICT_OUTER) end)
            .. "/" .. n(function() return d:GetMaxDamage(DefenseTypes.DISTRICT_OUTER) end)
        end
        print("p" .. p .. " " .. c:GetName() .. "#" .. c:GetID() .. "@" .. c:GetX() .. ":" .. c:GetY()
          .. " pop=" .. c:GetPopulation() .. " | " .. table.concat(parts, " | "))
      end
    end
  end
end
