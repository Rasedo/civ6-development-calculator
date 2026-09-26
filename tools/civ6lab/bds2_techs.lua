-- GameCore_Tuner (after lab_json.lua): B-D-S2 arm — grant ZN techs to every
-- living major but seat 0: the cheapest techs it lacks, never the one it is
-- researching. One JSON line per player: the techs granted, the count after.
for p = 1, 62 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() and pl:IsMajor() then
    local te = pl:GetTechs()
    local cur = P(function() return te:GetResearchingTech() end)
    local cand = {}
    for t in GameInfo.Technologies() do
      if not te:HasTech(t.Index) and t.Index ~= cur then cand[#cand + 1] = t end
    end
    table.sort(cand, function(a, b) return a.Cost < b.Cost or (a.Cost == b.Cost and a.Index < b.Index) end)
    local granted = {}
    for i = 1, math.min(ZN, #cand) do
      local ok = P(function() te:SetTech(cand[i].Index, true) return true end)
      granted[#granted + 1] = {cand[i].TechnologyType, ok}
    end
    local n = 0
    for t in GameInfo.Technologies() do if te:HasTech(t.Index) then n = n + 1 end end
    OUT({kind = "grant", p = p, n = ZN, granted = granted, techs = n})
  end
end
