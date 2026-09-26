-- GameCore_Tuner (after lab_json.lua): the religion counters GetStats carries
-- in GameCore, per major, for the religion it founded (and with no argument).
for p = 0, 62 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() and pl:IsMajor() then
    local st = pl:GetStats()
    local r = pl:GetReligion():GetReligionTypeCreated()
    OUT({kind = "relstats", p = p, religion = r,
      beliefs = P(function() return st:GetNumBeliefsInReligion(r) end),
      beliefs0 = P(function() return st:GetNumBeliefsInReligion() end),
      foreignCities = P(function() return st:GetNumForeignCitiesFollowingReligion(r) end),
      foreignCities0 = P(function() return st:GetNumForeignCitiesFollowingReligion() end),
      foreignFollowers = P(function() return st:GetNumForeignFollowers(r) end),
      foreignFollowers0 = P(function() return st:GetNumForeignFollowers() end),
      citiesFollowing = P(function() return st:GetNumCitiesFollowingReligion(r) end),
      followers = P(function() return st:GetNumFollowers(r) end),
      myCities = P(function() return st:GetNumMyCitiesFollowingSpecificReligion(r) end)})
  end
end
