-- GameCore_Tuner: where every major stands right now — cities, units, yields.
-- The reconnaissance snapshot every scene starts from.
print("turn " .. Game.GetCurrentGameTurn())
for p = 0, 62 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() then
    local kind = pl:IsMajor() and "major" or (pl:IsBarbarian() and "barb" or "minor")
    local civ = "?"
    local okc, c = pcall(function() return PlayerConfigurations[p]:GetCivilizationTypeName() end)
    if okc and c ~= nil then civ = c end
    local cities = {}
    for _, city in pl:GetCities():Members() do
      cities[#cities + 1] = city:GetName() .. "#" .. city:GetID() .. "@" .. city:GetX() .. ":" .. city:GetY()
        .. "p" .. city:GetPopulation()
    end
    local units = {}
    for _, u in pl:GetUnits():Members() do
      units[#units + 1] = GameInfo.Units[u:GetType()].UnitType:gsub("UNIT_", "") .. "#" .. u:GetID()
        .. "@" .. u:GetX() .. ":" .. u:GetY()
    end
    local gold, faith = -1, -1
    pcall(function() gold = math.floor(pl:GetTreasury():GetGoldBalance()) end)
    pcall(function() faith = math.floor(pl:GetReligion():GetFaithBalance()) end)
    print(p .. " " .. kind .. " " .. civ .. " human=" .. tostring(pl:IsHuman())
      .. " gold=" .. gold .. " faith=" .. faith
      .. " cities[" .. table.concat(cities, ",") .. "]"
      .. " units[" .. table.concat(units, ",") .. "]")
  end
end
