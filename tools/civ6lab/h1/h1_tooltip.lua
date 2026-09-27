-- InGame: every major's first city's yield tooltips, the game's own account
-- of each yield's terms (localized text).
for p = 0, 63 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() and pl:IsMajor() then
    for _, c in pl:GetCities():Members() do
      for row in GameInfo.Yields() do
        local ok, s = pcall(function() return c:GetYieldToolTip(row.Index) end)
        print(p .. " " .. c:GetName() .. " " .. row.YieldType .. ": " .. tostring(ok and s or ("err:" .. tostring(s))))
      end
      break
    end
  end
end
print("handicap " .. tostring(PlayerConfigurations[1]:GetHandicapTypeID()) .. " / " .. tostring(PlayerConfigurations[0]:GetHandicapTypeID()))
