-- GameCore: every city-state's owned plots as a Builder would see them — per
-- minor the owned land plots (no Mountain, no water), those with no
-- improvement and no district, those among them holding a resource, those
-- holding a feature, the pillaged improvements, and the unimproved plots'
-- coordinates. One JSON line per minor.
for p = 0, 61 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() and not pl:IsMajor() and not pl:IsBarbarian() then
    local land, bare, res, feat, pill, list, seaRes = 0, 0, 0, 0, 0, {}, 0
    local W, H = Map.GetGridSize()
    for i = 0, W * H - 1 do
      local q = Map.GetPlotByIndex(i)
      if q:GetOwner() == p and q:IsWater() and q:GetResourceType() ~= -1 and q:GetImprovementType() == -1 then
        seaRes = seaRes + 1
        list[#list + 1] = string.format('"sea%d:%d:%d"', q:GetX(), q:GetY(), q:GetResourceType())
      end
      if q:GetOwner() == p and not q:IsWater() and not q:IsMountain() then
        land = land + 1
        if q:GetImprovementType() ~= -1 and q:IsImprovementPillaged() then pill = pill + 1 end
        if q:GetImprovementType() == -1 and q:GetDistrictType() == -1 then
          bare = bare + 1
          if q:GetResourceType() ~= -1 then res = res + 1 end
          if q:GetFeatureType() ~= -1 then feat = feat + 1 end
          list[#list + 1] = string.format('"%d:%d:%d:%d"', q:GetX(), q:GetY(), q:GetResourceType(), q:GetFeatureType())
        end
      end
    end
    local nb = 0
    for _, u in pl:GetUnits():Members() do
      if GameInfo.Units[u:GetType()].UnitType == "UNIT_BUILDER" then nb = nb + 1; list[#list + 1] = string.format('"B%d:%d:%d"', u:GetX(), u:GetY(), u:GetBuildCharges()) end
    end
    print(string.format('{"kind":"plots","turn":%d,"p":%d,"civ":"%s","land":%d,"bare":%d,"bareRes":%d,"bareFeat":%d,"pillaged":%d,"seaRes":%d,"builders":%d,"gold":%.1f,"bareList":[%s]}',
      Game.GetCurrentGameTurn(), p, PlayerConfigurations[p]:GetCivilizationTypeName(), land, bare, res, feat, pill, seaRes, nb,
      pl:GetTreasury():GetGoldBalance(), table.concat(list, ",")))
  end
end
