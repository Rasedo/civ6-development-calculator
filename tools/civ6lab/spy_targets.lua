-- InGame: ask 10 — is a FREE CITY offered as a spy destination?
-- Lists UnitManager.GetOperationTargets(spy, UnitOperationTypes.SPY_TRAVEL_NEW_CITY)
-- for every Spy alive, naming the owner of each offered city.
--   --set ZFX=21 --set ZFY=22   (the Free City, flagged in the output)
local op = UnitOperationTypes.SPY_TRAVEL_NEW_CITY
print("SPY_TRAVEL_NEW_CITY=" .. tostring(op))
for p = 0, 62 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() then
    for _, u in pl:GetUnits():Members() do
      if GameInfo.Units[u:GetType()].UnitType == "UNIT_SPY" then
        local ok, t = pcall(function() return UnitManager.GetOperationTargets(u, op) end)
        print("spy p" .. p .. " #" .. u:GetID() .. " at " .. u:GetX() .. ":" .. u:GetY()
          .. " targetsOk=" .. tostring(ok) .. " type=" .. type(t))
        if ok and type(t) == "table" then
          local keys = {}
          for k, v in pairs(t) do keys[#keys + 1] = tostring(k) .. "(" .. type(v) .. (type(v) == "table" and ("#" .. #v) or "") .. ")" end
          table.sort(keys)
          print("  keys " .. table.concat(keys, " "))
          local cities = t[UnitOperationTypes.PARAM_CITY_ID] or t.CityID or t[1]
          local owners = t[UnitOperationTypes.PARAM_CITY_PLAYER] or t.CityPlayer
          if type(cities) == "table" then
            local out = {}
            for i = 1, #cities do
              local ow = (type(owners) == "table") and owners[i] or -1
              local nm = "?"
              local pc = Players[ow]
              if pc ~= nil then
                local c = pc:GetCities():FindID(cities[i])
                if c ~= nil then
                  nm = c:GetName() .. "@" .. c:GetX() .. ":" .. c:GetY()
                  if c:GetX() == ZFX and c:GetY() == ZFY then nm = nm .. " <== FREE CITY" end
                end
              end
              out[#out + 1] = "p" .. tostring(ow) .. ":" .. tostring(cities[i]) .. " " .. nm
            end
            print("  targets " .. #cities .. ": " .. table.concat(out, " | "))
          end
        end
      end
    end
  end
end
local k = {}
for r in GameInfo.Happinesses() do k[#k + 1] = tostring(r.Index) .. "=" .. tostring(r.HappinessType) end
print("happiness tiers: " .. table.concat(k, " "))
