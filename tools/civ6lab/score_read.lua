-- InGame: Civ 6's game Score for every living major, per category
-- (`GetCategoryScore`, as the scores panel reads it) beside what the
-- ScoringLineItems count: techs and civics held with each one's era and
-- cost, wonders with era and cost, cities, districts, population, Great
-- People, era score. One JSON line per major, so `ScaleByCost` can be fitted.
local function eraIdx(t) return t and GameInfo.Eras[t] and GameInfo.Eras[t].Index or -1 end
for p = 0, 62 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() and pl:IsMajor() then
    local cats = {}
    for c in GameInfo.ScoringCategories() do
      local ok, v = pcall(function() return pl:GetCategoryScore(c.Index) end)
      cats[#cats + 1] = '"' .. c.CategoryType .. '":' .. tostring(ok and v or "null")
    end
    local techs, civics, wonders = {}, {}, {}
    local tt = pl:GetTechs()
    for t in GameInfo.Technologies() do
      if tt:HasTech(t.Index) then techs[#techs + 1] = "[" .. eraIdx(t.EraType) .. "," .. t.Cost .. "]" end
    end
    local cu = pl:GetCulture()
    for c in GameInfo.Civics() do
      if cu:HasCivic(c.Index) then civics[#civics + 1] = "[" .. eraIdx(c.EraType) .. "," .. c.Cost .. "]" end
    end
    local ncity, ndist, pop = 0, 0, 0
    for _, city in pl:GetCities():Members() do
      ncity = ncity + 1
      pop = pop + city:GetPopulation()
      for _, d in city:GetDistricts():Members() do
        if d:IsComplete() and GameInfo.Districts[d:GetType()].DistrictType ~= "DISTRICT_CITY_CENTER" then ndist = ndist + 1 end
      end
      local bl = city:GetBuildings()
      for b in GameInfo.Buildings() do
        if b.IsWonder and bl:HasBuilding(b.Index) then
          wonders[#wonders + 1] = "[" .. eraIdx(b.PrereqTech and GameInfo.Technologies[b.PrereqTech] and GameInfo.Technologies[b.PrereqTech].EraType
            or (b.PrereqCivic and GameInfo.Civics[b.PrereqCivic] and GameInfo.Civics[b.PrereqCivic].EraType)) .. "," .. b.Cost .. "]"
        end
      end
    end
    local gp = 0
    pcall(function()
      for _, e in ipairs(Game.GetGreatPeople():GetPastTimeline()) do
        if e.Claimant == p then gp = gp + 1 end
      end
    end)
    local nbld = 0
    for _, city in pl:GetCities():Members() do
      local bl = city:GetBuildings()
      for b in GameInfo.Buildings() do
        if not b.IsWonder and bl:HasBuilding(b.Index) then nbld = nbld + 1 end
      end
    end
    local rel, mine, foreign, beliefs = -1, 0, 0, 0
    pcall(function() rel = pl:GetReligion():GetReligionTypeCreated() end)
    pcall(function()
      for _, r in ipairs(Game.GetReligion():GetReligions()) do
        if r.Religion == rel or (rel < 0 and r.Founder == p) then beliefs = #r.Beliefs end
      end
    end)
    -- buildings by the ERA of their prereq, so the era-buildings line's subset shows
    local byEra = {}
    for _, city in pl:GetCities():Members() do
      local bl = city:GetBuildings()
      for b in GameInfo.Buildings() do
        if not b.IsWonder and bl:HasBuilding(b.Index) then
          local e = eraIdx(b.PrereqTech and GameInfo.Technologies[b.PrereqTech] and GameInfo.Technologies[b.PrereqTech].EraType
            or (b.PrereqCivic and GameInfo.Civics[b.PrereqCivic] and GameInfo.Civics[b.PrereqCivic].EraType))
          byEra[e] = (byEra[e] or 0) + 1
        end
      end
    end
    local eraParts = {}
    for e = -1, 9 do if byEra[e] then eraParts[#eraParts + 1] = '"' .. e .. '":' .. byEra[e] end end
    if rel ~= nil and rel >= 0 then
      for q = 0, 62 do
        local o = Players[q]
        if o ~= nil and o:IsAlive() and o:IsMajor() then
          for _, city in o:GetCities():Members() do
            if city:GetReligion():GetMajorityReligion() == rel then
              if q == p then mine = mine + 1 else foreign = foreign + 1 end
            end
          end
        end
      end
    end
    local era = 0
    pcall(function() era = Game.GetEras():GetPlayerCurrentScore(p) end)
    print(string.format('{"p":%d,"score":%d,"cats":{%s},"techs":[%s],"civics":[%s],"wonders":[%s],"cities":%d,"districts":%d,"pop":%d,"eraScore":%d,"gp":%d,"buildings":%d,"religion":%d,"relMine":%d,"relForeign":%d,"beliefs":%d,"bldByEra":{%s},"curEra":%d}',
      p, pl:GetScore(), table.concat(cats, ","), table.concat(techs, ","), table.concat(civics, ","),
      table.concat(wonders, ","), ncity, ndist, pop, era, gp, nbld, rel, mine, foreign, beliefs,
      table.concat(eraParts, ","), Game.GetEras():GetCurrentEra()))
  end
end
