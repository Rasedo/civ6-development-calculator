-- InGame (after lab_json.lua): B-91-S3 — the city at ZX,ZY: owner,
-- population, majority, every religion group's followers and pressure, and
-- the total pressure; tag ZTAG. Prints {found=false} when no city stands.
local c = Cities.GetCityInPlot(ZX, ZY)
if c == nil then OUT({kind = "city", tag = "ZTAG", x = ZX, y = ZY, found = false}) return end
local groups = P(function()
  local t = {}
  for _, g in ipairs(c:GetReligion():GetReligionsInCity()) do t[#t + 1] = {g.Religion, g.Followers, g.Pressure} end
  return t
end)
OUT({kind = "city", tag = "ZTAG", turn = Game.GetCurrentGameTurn(), x = ZX, y = ZY, found = true, owner = c:GetOwner(),
  pop = c:GetPopulation(), majority = P(function() return c:GetReligion():GetMajorityReligion() end),
  total = P(function() return c:GetReligion():GetTotalPressureOnCity() end), groups = groups,
  ownerMajority = P(function() return Players[c:GetOwner()]:GetReligion():GetReligionInMajorityOfCities() end)})
