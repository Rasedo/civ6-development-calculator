-- GameCore_Tuner (after lab_json.lua): B-91-S2 — turn the city at ZX,ZY
-- wholly to religion ZR (`city:GetReligion():SetAllCityToReligion`, GameCore
-- only). Prints the owner, the majority before and after, the followers.
local c = nil
local q = Map.GetPlot(ZX, ZY)
local owner = q:GetOwner()
if owner >= 0 then
  for _, x in Players[owner]:GetCities():Members() do
    if x:GetX() == ZX and x:GetY() == ZY then c = x end
  end
end
if c == nil then OUT({kind = "convert", x = ZX, y = ZY, err = "no city"}) return end
local before = P(function() return c:GetReligion():GetMajorityReligion() end)
local call = P(function() c:GetReligion():SetAllCityToReligion(ZR) return true end)
OUT({kind = "convert", x = ZX, y = ZY, owner = owner, major = Players[owner]:IsMajor(), r = ZR, before = before, call = call,
  after = P(function() return c:GetReligion():GetMajorityReligion() end),
  followers = P(function() return c:GetReligion():GetNumFollowers(ZR) end), pop = c:GetPopulation()})
