-- GameCore_Tuner (after lab_json.lua): B-D-S4 step — for each player in
-- ZPLAYERS, grant (ZDIR=1) or remove (ZDIR=-1) ONE tech (ZKIND=tech) or civic
-- (ZKIND=civic): the cheapest the player lacks / holds (ZORDER=cheap) or the
-- dearest (ZORDER=dear); the one in progress is never touched. Also prints,
-- per player, the GameCore counts and base-cost sums of techs and civics held
-- BEFORE the step (a separate call from the previous step, so they are
-- settled).
for ps in string.gmatch("ZPLAYERS", "(%d+)") do
  local p = tonumber(ps)
  local pl = Players[p]
  local te, cu = pl:GetTechs(), pl:GetCulture()
  local nT, sT, nC, sC = 0, 0, 0, 0
  for t in GameInfo.Technologies() do if te:HasTech(t.Index) then nT = nT + 1; sT = sT + t.Cost end end
  for c in GameInfo.Civics() do if cu:HasCivic(c.Index) then nC = nC + 1; sC = sC + c.Cost end end
  local rec = {kind = "step", p = p, dir = ZDIR, what = "ZKIND", T = nT, sumT = sT, C = nC, sumC = sC}
  if ZDIR ~= 0 then
    local tbl, has, set, cur
    if "ZKIND" == "tech" then
      tbl = GameInfo.Technologies
      has = function(i) return te:HasTech(i) end
      set = function(i, v) te:SetTech(i, v) end
      cur = P(function() return te:GetResearchingTech() end)
    else
      tbl = GameInfo.Civics
      has = function(i) return cu:HasCivic(i) end
      set = function(i, v) cu:SetCivic(i, v) end
      cur = P(function() return cu:GetProgressingCivic() end)
    end
    local cand = {}
    for row in tbl() do
      local h = has(row.Index)
      if row.Index ~= cur and ((ZDIR == 1 and not h) or (ZDIR == -1 and h)) then cand[#cand + 1] = row end
    end
    local up = ("ZORDER" == "cheap")
    table.sort(cand, function(a, b)
      if a.Cost ~= b.Cost then if up then return a.Cost < b.Cost else return a.Cost > b.Cost end end
      return a.Index < b.Index
    end)
    local pick = cand[1]
    if pick then
      rec.moved = pick.TechnologyType or pick.CivicType
      rec.cost = pick.Cost
      rec.call = P(function() set(pick.Index, ZDIR == 1) return true end)
    end
  end
  OUT(rec)
end
