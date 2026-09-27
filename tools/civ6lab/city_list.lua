-- Any state (after lab_json.lua): every living player's cities, one JSON
-- line each: owner, major flag, id, name, x, y, population, majority religion.
for p = 0, 63 do
  local q = Players[p]
  if q ~= nil and q:IsAlive() then
    for _, c in q:GetCities():Members() do
      OUT({p = p, major = q:IsMajor(), id = c:GetID(), name = c:GetName(), x = c:GetX(), y = c:GetY(),
        pop = c:GetPopulation(), maj = P(function() return c:GetReligion():GetMajorityReligion() end)})
    end
  end
end
