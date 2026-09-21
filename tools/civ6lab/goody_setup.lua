-- GameCore_Tuner: plant a tribal village next to one of player 0's units and
-- snapshot everything a reward could move. GoodyHuts.xml is a two-level
-- weighted draw — category (six rows, weight 100 each) then subtype (weights
-- 15/30/55, gated by a minimum Turn and by MinOneCity) — so popping one with a
-- known rng state should consume a countable number of draws.
--   --set ZTAG=before --set ZPLANT=1
local p0 = Players[0]
local out = {}
-- a unit with moves, and a free land plot next to it
local mover, spot = nil, nil
for _, u in p0:GetUnits():Members() do
  if mover == nil and u:GetMovesRemaining() > 0 and not GameInfo.Units[u:GetType()].IgnoreMoves then
    local okp = false
    for dx = -1, 1 do
      for dy = -1, 1 do
        local ok, q = pcall(function() return Map.GetPlot(u:GetX() + dx, u:GetY() + dy) end)
        if not okp and ok and q ~= nil and Map.GetPlotDistance(u:GetX(), u:GetY(), q:GetX(), q:GetY()) == 1
           and not q:IsWater() and not q:IsImpassable() and not q:IsMountain()
           and q:GetUnitCount() == 0 and not q:IsCity() and q:GetDistrictType() < 0
           and q:GetImprovementType() < 0 and q:GetResourceType() < 0 then
          okp = true mover = u spot = q
        end
      end
    end
  end
end
if mover == nil or spot == nil then print("{\"kind\":\"goody\",\"error\":\"nospot\"}") return end
if ZPLANT == 1 then
  local idx = GameInfo.Improvements["IMPROVEMENT_GOODY_HUT"].Index
  local ok = pcall(function() ImprovementBuilder.SetImprovementType(spot, idx, -1) end)
  if not ok or spot:GetImprovementType() ~= idx then
    pcall(function() ImprovementBuilder.SetImprovementType(spot, idx) end)
  end
end
local imp = spot:GetImprovementType()
local impRow = imp >= 0 and GameInfo.Improvements[imp] or nil
print("{\"kind\":\"goody\",\"stage\":\"ZTAG\",\"turn\":" .. Game.GetCurrentGameTurn()
  .. ",\"mover\":" .. mover:GetID() .. ",\"moverAt\":\"" .. mover:GetX() .. ":" .. mover:GetY() .. "\""
  .. ",\"hutPlot\":\"" .. spot:GetX() .. ":" .. spot:GetY() .. "\""
  .. ",\"hutImprovement\":\"" .. (impRow and impRow.ImprovementType or "none") .. "\""
  .. ",\"gold\":" .. string.format("%.2f", p0:GetTreasury():GetGoldBalance())
  .. ",\"faith\":" .. string.format("%.2f", p0:GetReligion():GetFaithBalance())
  .. ",\"units\":" .. (function() local n = 0 for _ in p0:GetUnits():Members() do n = n + 1 end return n end)()
  .. ",\"seed\":" .. tostring(Game.GetRandomSeed()) .. "}")
