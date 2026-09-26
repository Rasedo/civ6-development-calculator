-- InGame (after lab_json.lua): one line per living player — majors and minors —
-- with its cities (id, name, xy, pop, majority religion, buildings count,
-- pillaged buildings), the religion it founded, techs, civics, government,
-- and the category scores of majors.
local turn = Game.GetCurrentGameTurn()
for p = 0, 62 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() then
    local cities = {}
    for _, c in pl:GetCities():Members() do
      local bl = c:GetBuildings()
      local nb, pil = 0, {}
      for b in GameInfo.Buildings() do
        if bl:HasBuilding(b.Index) then
          nb = nb + 1
          local v = P(function() return bl:IsPillaged(b.Hash) end)
          if v == true then pil[#pil + 1] = b.BuildingType end
        end
      end
      local nd = 0
      for _, d in c:GetDistricts():Members() do
        if P(function() return d:IsComplete() end) == true then nd = nd + 1 end
      end
      local maj = P(function() return c:GetReligion():GetMajorityReligion() end)
      cities[#cities + 1] = {id = c:GetID(), name = c:GetName(), x = c:GetX(), y = c:GetY(), pop = c:GetPopulation(),
        maj = maj, nb = nb, nd = nd, pil = pil, cap = P(function() return c:IsCapital() end)}
    end
    local rec = {p = p, turn = turn, major = pl:IsMajor(),
      civ = P(function() return PlayerConfigurations[p]:GetCivilizationTypeName() end),
      founded = P(function() return pl:GetReligion():GetReligionTypeCreated() end),
      cities = cities}
    if pl:IsMajor() then
      local n = 0
      for t in GameInfo.Technologies() do if pl:GetTechs():HasTech(t.Index) then n = n + 1 end end
      rec.techs = n
      local cu = pl:GetCulture()
      local nc = 0
      for c in GameInfo.Civics() do if P(function() return cu:HasCivic(c.Index) end) == true then nc = nc + 1 end end
      rec.civics = nc
      rec.gov = P(function() return cu:GetCurrentGovernment() end)
      rec.policyCost = P(function() return cu:GetCostToUnlockPolicies() end)
      rec.progressing = P(function() return cu:GetProgressingCivic() end)
      rec.turnsLeft = P(function() return cu:GetTurnsLeft() end)
      rec.researching = P(function() return pl:GetTechs():GetResearchingTech() end)
      rec.score = P(function() return pl:GetScore() end)
      rec.eraScore = P(function() return Game.GetEras():GetPlayerCurrentScore(p) end)
      rec.anarchy = P(function() return cu:IsInAnarchy() end)
      rec.anarchyEnd = P(function() return cu:GetAnarchyEndTurn() end)
      rec.gold = P(function() return pl:GetTreasury():GetGoldBalance() end)
      local cs = {}
      for c in GameInfo.ScoringCategories() do cs[c.CategoryType] = P(function() return pl:GetCategoryScore(c.Index) end) end
      rec.cats = cs
    end
    OUT(rec)
  end
end
