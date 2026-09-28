-- GameCore_Tuner: answer a grabbed seat's research / civic blocker from
-- GameCore (the seat's own requests are dropped while it is grabbed): seat
-- ZSEAT researches the first tech it can research and progresses the first
-- civic it lacks, when none is set.
local p = Players[ZSEAT]
local out = {}
local tc = p:GetTechs()
local rt = tc:GetResearchingTech()
if rt == nil or rt < 0 or tc:HasTech(rt) then
  for t in GameInfo.Technologies() do
    if not tc:HasTech(t.Index) and tc:CanResearch(t.Index) then tc:SetResearchingTech(t.Index) out[#out + 1] = "tech " .. t.TechnologyType break end
  end
end
local cu = p:GetCulture()
local pc = cu:GetProgressingCivic()
if pc == nil or pc < 0 or cu:HasCivic(pc) then
  for c in GameInfo.Civics() do
    if not cu:HasCivic(c.Index) then cu:SetProgressingCivic(c.Index) out[#out + 1] = "civic " .. c.CivicType break end
  end
end
-- ZHOLD 1: the seat's research and civic progress go back to 0 every turn, so
-- no completion opens a blocker the grabbed seat cannot answer
if ZHOLD == 1 then
  local rt2 = tc:GetResearchingTech()
  if rt2 ~= nil and rt2 >= 0 then out[#out + 1] = "tech0 " .. tostring(pcall(function() tc:SetResearchProgress(rt2, 0) end)) end
  local pc2 = cu:GetProgressingCivic()
  if pc2 ~= nil and pc2 >= 0 then out[#out + 1] = "civic0 " .. tostring(pcall(function() cu:SetCulturalProgress(pc2, 0) end)) end
end
-- the seat's cities: what each builds and in how many turns
for _, c in p:GetCities():Members() do
  local bq = c:GetBuildQueue()
  local cb = bq:CurrentlyBuilding()
  out[#out + 1] = "city " .. c:GetID() .. " builds " .. tostring(cb) .. " in " .. tostring(bq:GetTurnsLeft())
end
print("gcfix seat ZSEAT " .. (#out > 0 and table.concat(out, ", ") or "nothing"))
