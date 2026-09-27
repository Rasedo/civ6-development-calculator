-- GameCore_Tuner (after lab_json.lua): B-D-S3 ladder step — for each player
-- in ZPLAYERS ("3,4,7"), grant (ZDIR=1) or remove (ZDIR=-1) ONE tech, picked
-- by ZORDER: "cheap" (the cheapest the player lacks / the dearest it holds),
-- "dear" (the reverse). The researching tech is never touched. One JSON line
-- per player: the tech moved, its cost and era, the count after.
for ps in string.gmatch("ZPLAYERS", "(%d+)") do
  local p = tonumber(ps)
  local pl = Players[p]
  local te = pl:GetTechs()
  local cur = P(function() return te:GetResearchingTech() end)
  local cand = {}
  for t in GameInfo.Technologies() do
    local has = te:HasTech(t.Index)
    if t.Index ~= cur and ((ZDIR == 1 and not has) or (ZDIR == -1 and has)) then cand[#cand + 1] = t end
  end
  local up = ("ZORDER" == "cheap") == (ZDIR == 1)
  table.sort(cand, function(a, b)
    if a.Cost ~= b.Cost then if up then return a.Cost < b.Cost else return a.Cost > b.Cost end end
    return a.Index < b.Index
  end)
  local pick = cand[1]
  local rec = {kind = "step", p = p, dir = ZDIR}
  if pick then
    rec.tech = pick.TechnologyType
    rec.cost = pick.Cost
    rec.era = pick.EraType
    rec.call = P(function() te:SetTech(pick.Index, ZDIR == 1) return true end)
  end
  OUT(rec)
end
