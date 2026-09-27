-- GameCore_Tuner (after lab_json.lua): B-93-S1 — put Charles Darwin for
-- player ZP on plot ZX,ZY. `CreatePerson` places nothing from the tuner
-- (b93s1_probe.lua), so: when ZFREE is 1 the plot is first made unowned
-- (`plot:SetOwner(-1)` — a Great Person cannot be placed in a foreign
-- territory with closed borders; PlaceUnit then puts it on the nearest plot it
-- may stand on); `GrantPerson` lands him at the capital; `UnitManager.PlaceUnit`
-- moves him; `RestoreMovement`. Prints where he stands, the plot's natural
-- wonder and its neighbours' and the research state.
local pl = Players[ZP]
local gp = GameInfo.GreatPersonIndividuals["GREAT_PERSON_INDIVIDUAL_CHARLES_DARWIN"]
local te = pl:GetTechs()
local q = Map.GetPlot(ZX, ZY)
local rec = {kind = "place", p = ZP, x = ZX, y = ZY, owner0 = q:GetOwner()}
if ZFREE == 1 and q:GetOwner() ~= ZP then
  rec.free = P(function() q:SetOwner(-1) return q:GetOwner() end)
  if rec.free ~= -1 then rec.free2 = P(function() q:SetOwner(-1, -1, true) return q:GetOwner() end) end
end
local before = {}
for _, u in pl:GetUnits():Members() do before[u:GetID()] = true end
local cls = GameInfo.GreatPersonClasses[gp.GreatPersonClassType].Index
local era = GameInfo.Eras[gp.EraType].Index
rec.grant = P(function() Game.GetGreatPeople():GrantPerson(gp.Index, cls, era, 0, ZP, false) return true end)
for _, u in pl:GetUnits():Members() do
  if not before[u:GetID()] then
    rec.uid = u:GetID()
    rec.type = GameInfo.Units[u:GetType()].UnitType
    rec.individual = P(function() return u:GetGreatPerson():GetIndividual() end)
    rec.place = P(function() UnitManager.PlaceUnit(u, ZX, ZY) return true end)
    rec.restore = P(function() UnitManager.RestoreMovement(u) return true end)
    rec.at = {u:GetX(), u:GetY()}
    rec.moves = P(function() return u:GetMovesRemaining() end)
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
rec.onPlot = nw(q)
rec.adj = adj
-- research the dearest tech the seat lacks, so the payout cannot complete it
if ZDEAR == 1 then
  local best, cost = nil, -1
  for t in GameInfo.Technologies() do
    local c = P(function() return te:GetResearchCost(t.Index) end)
    if not te:HasTech(t.Index) and type(c) == "number" and c > cost then best, cost = t, c end
  end
  rec.dear = {best and best.TechnologyType, cost}
  rec.set = P(function() te:SetResearchingTech(best.Index) return te:GetResearchingTech() end)
end
rec.researching = te:GetResearchingTech()
rec.progress = P(function() return te:GetResearchProgress(te:GetResearchingTech()) end)
OUT(rec)
