-- GameCore_Tuner: the lay of the land for instrument 2's scenes. Every
-- major's cities (x, y, pop, coastal), wars with seat 0, era, a few techs;
-- the air units on the map; seat 0's units by type.
local function P(f) local ok, v = pcall(f) if ok then return tostring(v) end return "err:" .. tostring(v) end
local turn = Game.GetCurrentGameTurn()
print("turn " .. turn)
local techs = {"TECH_RAILROAD", "TECH_FLIGHT", "TECH_ADVANCED_FLIGHT", "TECH_CHEMISTRY", "TECH_SHIPBUILDING",
  "TECH_CARTOGRAPHY", "TECH_CELESTIAL_NAVIGATION", "TECH_STEAM_POWER", "TECH_COMBUSTION"}
for p = 0, 63 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() and (pl:IsMajor() or p == 0) then
    local th = {}
    for _, t in ipairs(techs) do
      local row = GameInfo.Technologies[t]
      if row ~= nil and pl:GetTechs():HasTech(row.Index) then th[#th + 1] = t:sub(6) end
    end
    print("player " .. p .. " " .. tostring(PlayerConfigurations[p]:GetCivilizationTypeName())
      .. " era=" .. P(function() return pl:GetEra() end)
      .. " human=" .. tostring(pl:IsHuman())
      .. " war0=" .. P(function() return Players[0]:GetDiplomacy():IsAtWarWith(p) end)
      .. " techs=" .. table.concat(th, ","))
    for _, c in pl:GetCities():Members() do
      local pl2 = Map.GetPlot(c:GetX(), c:GetY())
      print("  city " .. c:GetID() .. " " .. c:GetName() .. " @" .. c:GetX() .. "," .. c:GetY()
        .. " pop=" .. c:GetPopulation() .. " coastal=" .. P(function() return pl2:IsCoastalLand() end)
       )
    end
  end
end
-- air units anywhere
for p = 0, 63 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() then
    for _, u in pl:GetUnits():Members() do
      local row = GameInfo.Units[u:GetType()]
      if row ~= nil and (row.Domain == "DOMAIN_AIR" or (row.AntiAirCombat or 0) > 0) then
        print("air p" .. p .. " id=" .. u:GetID() .. " " .. row.UnitType .. " @" .. u:GetX() .. "," .. u:GetY()
          .. " dmg=" .. u:GetDamage())
      end
    end
  end
end
local cnt = {}
for _, u in Players[0]:GetUnits():Members() do
  local ty = GameInfo.Units[u:GetType()].UnitType
  cnt[ty] = (cnt[ty] or 0) + 1
end
local s = {}
for k, v in pairs(cnt) do s[#s + 1] = k .. "=" .. v end
table.sort(s)
print("p0units " .. table.concat(s, " "))
