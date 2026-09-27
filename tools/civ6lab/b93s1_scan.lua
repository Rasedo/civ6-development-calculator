-- GameCore_Tuner (after lab_json.lua): B-93-S1 — every natural-wonder plot
-- (feature, impassable, water, owner, units standing) and, for every
-- passable land plot on or next to one, how many wonder plots are underfoot
-- (0/1) and adjacent. One JSON line.
local function nwAt(q)
  local f = q:GetFeatureType()
  local fr = f >= 0 and GameInfo.Features[f] or nil
  return fr and fr.NaturalWonder and fr.FeatureType or nil
end
local wonders, cands, seen = {}, {}, {}
for i = 0, Map.GetPlotCount() - 1 do
  local q = Map.GetPlotByIndex(i)
  local w = nwAt(q)
  if w then
    local n = 0
    for _ in ipairs(Units.GetUnitsInPlot(q) or {}) do n = n + 1 end
    wonders[#wonders + 1] = {w, q:GetX(), q:GetY(), q:IsImpassable(), q:IsWater(), q:GetOwner(), n}
    local list = {q}
    for d = 0, 5 do local a = Map.GetAdjacentPlot(q:GetX(), q:GetY(), d) if a then list[#list + 1] = a end end
    for _, s in ipairs(list) do
      if not seen[s:GetIndex()] and not s:IsImpassable() and not s:IsWater() then
        seen[s:GetIndex()] = true
        local adj = 0
        for d = 0, 5 do
          local a = Map.GetAdjacentPlot(s:GetX(), s:GetY(), d)
          if a and nwAt(a) then adj = adj + 1 end
        end
        local n = 0
        for _ in ipairs(Units.GetUnitsInPlot(s) or {}) do n = n + 1 end
        cands[#cands + 1] = {s:GetX(), s:GetY(), nwAt(s) and 1 or 0, adj, s:GetOwner(), n}
      end
    end
  end
end
OUT({kind = "nwscan", wonders = wonders, stands = cands})
