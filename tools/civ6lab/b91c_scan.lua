-- InGame (after lab_json.lua): B-91 colonization at population >= 2 — per
-- major: golden age, founded religion, majority religion, capital continent,
-- and a settler count.
local eras = Game.GetEras()
local rows = {}
for _, p in ipairs(PlayerManager.GetAliveMajors()) do
  local id = p:GetID()
  local cap = p:GetCities():GetCapitalCity()
  rows[#rows + 1] = {p = id,
    golden = P(function() return eras:HasGoldenAge(id) end),
    heroic = P(function() return eras:HasHeroicGoldenAge(id) end),
    dark = P(function() return eras:HasDarkAge(id) end),
    founded = P(function() return p:GetReligion():GetReligionTypeCreated() end),
    majority = P(function() return p:GetReligion():GetReligionInMajorityOfCities() end),
    capCont = cap and P(function() return Map.GetPlot(cap:GetX(), cap:GetY()):GetContinentType() end) or nil,
    cap = cap and {cap:GetX(), cap:GetY()} or nil,
    comm = P(function() return eras:GetPlayerActiveCommemorations(id) end)}
end
OUT({kind = "scan", turn = Game.GetCurrentGameTurn(), era = P(function() return eras:GetCurrentEra() end), rows = rows})
