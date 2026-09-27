-- GameCore_Tuner: the C-93 rigs, one per ZRIG. Each prints what it read
-- before and after. The numeric tokens take plain numbers.
--   ZRIG=research ZP ZT ZQ  player ZP researches tech ZT with progress ZQ
--   ZRIG=bankrupt ZP ZNUM      gold 0 and ZNUM crossbowmen on free owned land
--                              plots around the first city (upkeep past income)
--   ZRIG=build ZP ZC ZADD      ZADD production into city ZC's current item
--   ZRIG=loyalty ZP ZC ZLOY    city ZC's loyalty stock changed by ZLOY
--   ZRIG=pop ZX ZY ZADD        the city on (ZX, ZY) changes population by ZADD
--   ZRIG=damage ZP ZC ZADD     city ZC's centre garrison damage set to ZADD
--   ZRIG=watch ZW              LAB_C93_WATCH = the plots "x,y;x,y" (the witness's C part)
--   ZRIG=victory ZP ZADD       player ZP's science victory points changed by ZADD
local rig = "ZRIG"
local function v(f)
  local ok, x = pcall(f)
  if ok then return tostring(x) end
  return "err:" .. tostring(x):sub(1, 80)
end
local function cityOf(p, id)
  return Players[p]:GetCities():FindID(id)
end
if rig == "research" then
  local T = Players[ZP]:GetTechs()
  print("before rt=" .. v(function() return T:GetResearchingTech() end) .. " cost=" .. v(function() return T:GetResearchCost(ZT) end)
    .. " prog=" .. v(function() return T:GetResearchProgress(ZT) end) .. " sy=" .. v(function() return T:GetScienceYield() end))
  print("set=" .. v(function() T:SetResearchingTech(ZT) return T:GetResearchingTech() end))
  print("prog2=" .. v(function() T:SetResearchProgress(ZT, ZQ) return T:GetResearchProgress(ZT) end))
  print("after rt=" .. v(function() return T:GetResearchingTech() end) .. " prog=" .. v(function() return T:GetResearchProgress(ZT) end))
elseif rig == "bankrupt" then
  local P = Players[ZP]
  local Tr = P:GetTreasury()
  print("before gold=" .. Tr:GetGoldBalance() .. " gy=" .. Tr:GetGoldYield() .. " maint=" .. Tr:GetTotalMaintenance())
  local city = nil
  for _, c in P:GetCities():Members() do city = c break end
  local cx, cy = city:GetX(), city:GetY()
  local made, ids = 0, {}
  for dy = -2, 2 do
    for dx = -2, 2 do
      if made < ZNUM and not (dx == 0 and dy == 0) then
        local pl = Map.GetPlot(cx + dx, cy + dy)
        if pl ~= nil and not pl:IsWater() and not pl:IsMountain() and pl:GetOwner() == ZP and pl:GetUnitCount() == 0 then
          local u = P:GetUnits():Create(GameInfo.Units["UNIT_CROSSBOWMAN"].Index, cx + dx, cy + dy)
          if u ~= nil then made = made + 1; ids[#ids + 1] = u:GetID() .. "@" .. (cx + dx) .. "," .. (cy + dy) end
        end
      end
    end
  end
  Tr:SetGoldBalance(0)
  print("made " .. made .. " " .. table.concat(ids, " "))
  print("after gold=" .. Tr:GetGoldBalance() .. " gy=" .. Tr:GetGoldYield() .. " maint=" .. Tr:GetTotalMaintenance())
elseif rig == "build" then
  local bq = cityOf(ZP, ZC):GetBuildQueue()
  print("cur=" .. v(function() return bq:CurrentlyBuilding() end))
  print("add=" .. v(function() bq:AddProgress(ZADD) return true end))
elseif rig == "loyalty" then
  local c = cityOf(ZP, ZC)
  print("change=" .. v(function() return c:ChangeLoyalty(ZLOY) end))
elseif rig == "pop" then
  local c = Cities.GetCityInPlot(ZX, ZY)
  print("city owner=" .. v(function() return c:GetOwner() end) .. " pop=" .. v(function() return c:GetPopulation() end))
  print("change=" .. v(function() c:ChangePopulation(ZADD) return c:GetPopulation() end))
elseif rig == "damage" then
  local c = cityOf(ZP, ZC)
  local d = c:GetDistricts():GetDistrictByType(GameInfo.Districts["DISTRICT_CITY_CENTER"].Index)
  print("before gar=" .. v(function() return d:GetDamage(DefenseTypes.DISTRICT_GARRISON) end))
  print("set=" .. v(function() d:SetDamage(DefenseTypes.DISTRICT_GARRISON, ZADD) return d:GetDamage(DefenseTypes.DISTRICT_GARRISON) end))
elseif rig == "watch" then
  LAB_C93_WATCH = {}
  for x, y in string.gmatch("ZW", "(%d+),(%d+)") do LAB_C93_WATCH[#LAB_C93_WATCH + 1] = { tonumber(x), tonumber(y) } end
  print("watch " .. #LAB_C93_WATCH)
elseif rig == "victory" then
  print("change=" .. v(function() Players[ZP]:GetStats():ChangeScienceVictoryPoints(ZADD) return true end))
  print("win=" .. v(function() return Game.GetWinningTeam() end))
else
  print("unknown rig " .. rig)
end
