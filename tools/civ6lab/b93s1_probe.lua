-- GameCore_Tuner (after lab_json.lua): B-93-S1 — where does a created Great
-- Person land? Lists player ZP's Great Person units, calls
-- CreatePerson(ZP, Darwin, ZX, ZY) (ZHOW=create) or GrantPerson(Darwin,
-- class, era, 0, ZP, false) (ZHOW=grant), lists them again, and when a new
-- one stands elsewhere tries `UnitManager.PlaceUnit(u, ZX, ZY)`.
local gp = GameInfo.GreatPersonIndividuals["GREAT_PERSON_INDIVIDUAL_CHARLES_DARWIN"]
local function list()
  local t = {}
  for _, u in Players[ZP]:GetUnits():Members() do
    local row = GameInfo.Units[u:GetType()]
    if row.UnitType:find("GREAT_") then
      t[#t + 1] = {id = u:GetID(), type = row.UnitType, x = u:GetX(), y = u:GetY(),
        ind = P(function() return u:GetGreatPerson():GetIndividual() end)}
    end
  end
  return t
end
local rec = {kind = "gpprobe", how = "ZHOW", before = list()}
if "ZHOW" == "create" then
  rec.call = P(function() return Game.GetGreatPeople():CreatePerson(ZP, gp.Index, ZX, ZY) end)
else
  local cls = GameInfo.GreatPersonClasses[gp.GreatPersonClassType].Index
  local era = GameInfo.Eras[gp.EraType].Index
  rec.call = P(function() return Game.GetGreatPeople():GrantPerson(gp.Index, cls, era, 0, ZP, false) end)
end
rec.after = list()
local seen = {}
for _, e in ipairs(rec.before) do seen[e.id] = true end
for _, e in ipairs(rec.after) do
  if not seen[e.id] and (e.x ~= ZX or e.y ~= ZY) then
    local u = Players[ZP]:GetUnits():FindID(e.id)
    rec.place = P(function() UnitManager.PlaceUnit(u, ZX, ZY) return true end)
    rec.at = {u:GetX(), u:GetY()}
    rec.restore = P(function() UnitManager.RestoreMovement(u) return true end)
  end
end
-- the timeline's Darwin row: who holds him
rec.timeline = P(function()
  local t = {}
  for _, e in ipairs(Game.GetGreatPeople():GetTimeline()) do
    if e.Individual == gp.Index then t[#t + 1] = {e.Claimant, e.Era, e.Cost} end
  end
  return t
end)
OUT(rec)
