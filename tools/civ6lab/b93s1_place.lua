-- GameCore_Tuner (after lab_json.lua): B-93-S1 — put Charles Darwin for
-- player ZP on plot ZX,ZY (CreatePerson, the Tuner map panel's call) and set
-- the player researching ZTECH if it researches nothing. Prints the unit ids
-- on the plot, the plot's natural-wonder neighbourhood and the research state.
local pl = Players[ZP]
local gp = GameInfo.GreatPersonIndividuals["GREAT_PERSON_INDIVIDUAL_CHARLES_DARWIN"]
local te = pl:GetTechs()
if te:GetResearchingTech() < 0 then P(function() te:SetResearchingTech(GameInfo.Technologies["ZTECH"].Index) end) end
local before = {}
local q = Map.GetPlot(ZX, ZY)
for _, u in ipairs(Units.GetUnitsInPlot(q) or {}) do before[u:GetID()] = true end
local call = P(function() return Game.GetGreatPeople():CreatePerson(ZP, gp.Index, ZX, ZY) end)
local made = {}
for _, u in ipairs(Units.GetUnitsInPlot(q) or {}) do
  if not before[u:GetID()] then
    made[#made + 1] = {id = u:GetID(), owner = u:GetOwner(), type = GameInfo.Units[u:GetType()].UnitType,
      restore = P(function() UnitManager.RestoreMovement(u) return true end), moves = P(function() return u:GetMovesRemaining() end)}
  end
end
local function nw(p)
  local f = p:GetFeatureType()
  local fr = f >= 0 and GameInfo.Features[f] or nil
  return fr and fr.NaturalWonder and fr.FeatureType or nil
end
local adj = {}
for d = 0, 5 do
  local a = Map.GetAdjacentPlot(ZX, ZY, d)
  if a then adj[#adj + 1] = {x = a:GetX(), y = a:GetY(), nw = nw(a)} end
end
OUT({kind = "place", p = ZP, x = ZX, y = ZY, call = call, made = made, onPlot = nw(q), adj = adj,
  researching = te:GetResearchingTech(), progress = P(function() return te:GetResearchProgress(te:GetResearchingTech()) end)})
