-- GameCore_Tuner (after lab_json.lua): C-16 scene in a fresh game. Seat ZD
-- (the defender) gets every tech and civic, population ZPOP in its city at
-- ZCX:ZCY, a Commercial Hub H on a free ring-1 land plot, a Campus on a
-- free plot of rings 1-2 ADJACENT to H and a Theater Square on a free plot
-- of rings 1-2 at distance >= 2 from H (each CreateDistrict once), and one
-- created Spy on the centre. Seat 0 meets it and a seat-0 Scout stands beside
-- the city (it reveals the plots). Prints the plots and ids.
local d = Players[ZD]
local rec = {kind = "c16setup", seat = ZD}
if ZALL == 1 then
  for t in GameInfo.Technologies() do pcall(function() d:GetTechs():SetTech(t.Index, true) end) end
  for c in GameInfo.Civics() do pcall(function() d:GetCulture():SetCivic(c.Index, true) end) end
else
  -- only the spy civic: every other grant leaves the seat blockers a grabbed
  -- turn cannot answer (its requests are dropped)
  rec.civic = P(function() d:GetCulture():SetCivic(GameInfo.Civics["CIVIC_DIPLOMATIC_SERVICE"].Index, true) return true end)
end
local c = CityManager.GetCityAt(ZCX, ZCY)
if c:GetPopulation() < ZPOP then rec.pop = P(function() WorldBuilder.CityManager():SetCityValue(c, "Population", ZPOP) return true end) end
local function free(q)
  return q and not q:IsWater() and not q:IsImpassable() and not q:IsMountain() and q:GetDistrictType() < 0
    and q:GetOwner() == ZD and q:GetUnitCount() == 0 and q:GetResourceType() < 0 and not q:IsCity()
end
local ring = {}
for dx = -2, 2 do for dy = -2, 2 do
  local q = Map.GetPlotXYWithRangeCheck(ZCX, ZCY, dx, dy, 2)
  if free(q) then ring[#ring + 1] = q end
end end
local H, A, F
for _, q in ipairs(ring) do
  if H == nil and Map.GetPlotDistance(ZCX, ZCY, q:GetX(), q:GetY()) == 1 then H = q end
end
if H == nil then OUT({kind = "c16setup", error = "noH"}) return end
for _, q in ipairs(ring) do
  local dh = Map.GetPlotDistance(H:GetX(), H:GetY(), q:GetX(), q:GetY())
  if A == nil and dh == 1 then A = q end
  if F == nil and dh >= 2 then F = q end
end
local bq = c:GetBuildQueue()
local function mk(name, q)
  if q == nil then return "noplot" end
  return {q:GetX(), q:GetY(), P(function() bq:CreateDistrict(GameInfo.Districts[name].Index, q:GetIndex()) return c:GetDistricts():HasDistrict(GameInfo.Districts[name].Index) end)}
end
rec.hub = mk("DISTRICT_COMMERCIAL_HUB", H)
rec.campus = mk("DISTRICT_CAMPUS", A)
rec.theater = mk("DISTRICT_THEATER", F)
local s = P(function() return d:GetUnits():Create(GameInfo.Units["UNIT_SPY"].Index, ZCX, ZCY) end)
rec.spy = (type(s) == "table" or type(s) == "userdata") and s:GetID() or tostring(s)
if type(s) == "table" or type(s) == "userdata" then
  -- a new spy holds the XP of its free promotion; without it the seat's AI
  -- cannot promote the post above level 1
  local e = s:GetExperience()
  rec.xp0 = P(function() return e:GetExperiencePoints() end)
  rec.xpSet = P(function() e:SetExperience(0) return e:GetExperiencePoints() end)
  if type(rec.xpSet) ~= "number" then rec.xpChange = P(function() e:ChangeExperience(-rec.xp0) return e:GetExperiencePoints() end) end
end
rec.met = P(function() Players[0]:GetDiplomacy():SetHasMet(ZD) return Players[0]:GetDiplomacy():HasMet(ZD) end)
local sc
for dx = -3, 3 do for dy = -3, 3 do
  local q = Map.GetPlotXYWithRangeCheck(ZCX, ZCY, dx, dy, 3)
  if sc == nil and q and Map.GetPlotDistance(ZCX, ZCY, q:GetX(), q:GetY()) == 3 and not q:IsWater() and q:GetUnitCount() == 0 and not q:IsImpassable() then
    sc = P(function() local u = Players[0]:GetUnits():Create(GameInfo.Units["UNIT_SCOUT"].Index, q:GetX(), q:GetY()) return u and (q:GetX() .. ":" .. q:GetY()) end)
  end
end end
rec.scout = sc
OUT(rec)
