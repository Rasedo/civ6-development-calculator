-- GameCore_Tuner (after lab_json.lua): B-91 World Church reach. One step, then
-- a snapshot: founder ZF's culture yield and every city's followers of ZR
-- (owner, major/minor, majority, population).
--   ZSTEP = snap | add (AddBelief ZF ZBELIEF) | convert (SetAllCityToReligion ZR at ZX,ZY)
--         | convertnone (SetAllCityToReligion -1 at ZX,ZY) | pop (ChangePopulation ZN at ZX,ZY)
local pl = Players[ZF]
local function cityAt(x, y)
  local q = Map.GetPlot(x, y)
  local o = q:GetOwner()
  if o < 0 then return nil end
  for _, c in Players[o]:GetCities():Members() do
    if c:GetX() == x and c:GetY() == y then return c end
  end
end
local rec = {kind = "step", step = "ZSTEP", tag = "ZTAG", turn = Game.GetCurrentGameTurn()}
if "ZSTEP" == "add" then
  rec.call = P(function() Game.GetReligion():AddBelief(ZF, GameInfo.Beliefs["ZBELIEF"].Index) return true end)
elseif "ZSTEP" == "convert" or "ZSTEP" == "convertnone" or "ZSTEP" == "pop" then
  local c = cityAt(ZX, ZY)
  rec.x, rec.y = ZX, ZY
  if c == nil then rec.err = "no city" else
    if "ZSTEP" == "convert" then rec.call = P(function() c:GetReligion():SetAllCityToReligion(ZR) return true end)
    elseif "ZSTEP" == "convertnone" then rec.call = P(function() c:GetReligion():SetAllCityToReligion(-1) return true end)
    else rec.call = P(function() c:ChangePopulation(ZN) return true end) end
  end
end
local total, own, foreign, inMaj, foreignInMaj = 0, 0, 0, 0, 0
local cities = {}
for p = 0, 63 do
  local q = Players[p]
  if q ~= nil and q:IsAlive() then
    for _, c in q:GetCities():Members() do
      local n = P(function() return c:GetReligion():GetNumFollowers(ZR) end)
      local maj = P(function() return c:GetReligion():GetMajorityReligion() end)
      if type(n) == "number" and n > 0 then
        total = total + n
        if p == ZF then own = own + n else foreign = foreign + n end
        if maj == ZR then inMaj = inMaj + n; if p ~= ZF then foreignInMaj = foreignInMaj + n end end
        cities[#cities + 1] = {p, c:GetX(), c:GetY(), n, c:GetPopulation(), maj, q:IsMajor()}
      end
    end
  end
end
rec.culture = P(function() return pl:GetCulture():GetCultureYield() end)
rec.faith = P(function() return pl:GetReligion():GetFaithYield() end)
rec.total, rec.own, rec.foreign, rec.inMaj, rec.foreignInMaj = total, own, foreign, inMaj, foreignInMaj
rec.cities = cities
OUT(rec)
