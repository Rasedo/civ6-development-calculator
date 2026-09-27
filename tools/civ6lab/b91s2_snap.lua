-- GameCore_Tuner (after lab_json.lua): B-91-S2 — founder ZF's faith, gold,
-- science and culture yields beside the cities whose majority is religion ZR,
-- counted over ZF's own cities, other majors' and city-states' / Free
-- Cities'. One JSON line; tag ZTAG.
local pl = Players[ZF]
local own, foreignMajor, minor, followers = 0, 0, 0, 0
local list = {}
for p = 0, 63 do
  local q = Players[p]
  if q ~= nil and q:IsAlive() then
    for _, c in q:GetCities():Members() do
      local maj = P(function() return c:GetReligion():GetMajorityReligion() end)
      if maj == ZR then
        if p == ZF then own = own + 1 elseif q:IsMajor() then foreignMajor = foreignMajor + 1 else minor = minor + 1 end
        list[#list + 1] = {p, c:GetID(), c:GetX(), c:GetY()}
      end
      local n = P(function() return c:GetReligion():GetNumFollowers(ZR) end)
      if type(n) == "number" then followers = followers + n end
    end
  end
end
local tr = pl:GetTreasury()
OUT({kind = "snap", tag = "ZTAG", turn = Game.GetCurrentGameTurn(), f = ZF, r = ZR,
  faith = P(function() return pl:GetReligion():GetFaithYield() end),
  gold = P(function() return tr:GetGoldYield() end),
  science = P(function() return pl:GetTechs():GetScienceYield() end),
  culture = P(function() return pl:GetCulture():GetCultureYield() end),
  own = own, foreignMajor = foreignMajor, minor = minor, followers = followers, cities = list})
