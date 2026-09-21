-- GameCore_Tuner: a land aim plot that has WATER neighbours, for the naval
-- interceptors (Destroyer, Battleship, Missile Cruiser) — they cannot stand on
-- the land tiles the Mobile SAM used. Reports the best candidate within ZR of
-- the bomber base, with its water and land neighbours listed.
--   --set ZBX=39 --set ZBY=16 --set ZR=9
local best = nil
for i = 0, Map.GetPlotCount() - 1 do
  local q = Map.GetPlotByIndex(i)
  if not q:IsWater() and not q:IsImpassable() and not q:IsMountain()
     and Map.GetPlotDistance(ZBX, ZBY, q:GetX(), q:GetY()) <= ZR then
    local water, land = {}, {}
    for dx = -1, 1 do
      for dy = -1, 1 do
        local ok, n = pcall(function() return Map.GetPlot(q:GetX() + dx, q:GetY() + dy) end)
        if ok and n ~= nil and Map.GetPlotDistance(q:GetX(), q:GetY(), n:GetX(), n:GetY()) == 1 then
          if n:IsWater() and not n:IsImpassable() then
            water[#water + 1] = n:GetX() .. ":" .. n:GetY()
          elseif not n:IsImpassable() and not n:IsMountain() then
            land[#land + 1] = n:GetX() .. ":" .. n:GetY()
          end
        end
      end
    end
    -- the aim plot must be REVEALED to player 0: an unrevealed plot refuses the
    -- strike and returns an empty attack preview, which is what made the first
    -- coastal candidate look like "naval interceptors do not work".
    local vis = PlayersVisibility[0]
    local revealed = vis ~= nil and vis:IsRevealed(q:GetX(), q:GetY())
    if revealed and #water >= 1 and #land >= 2 and (best == nil or #water > best.nw) then
      best = { x = q:GetX(), y = q:GetY(), nw = #water, water = water, land = land }
    end
  end
end
if best == nil then print("{\"kind\":\"coastal\",\"error\":\"none\"}") return end
print("{\"kind\":\"coastal\",\"aim\":\"" .. best.x .. ":" .. best.y .. "\",\"waterNeighbours\":\""
  .. table.concat(best.water, " ") .. "\",\"landNeighbours\":\"" .. table.concat(best.land, " ")
  .. "\",\"distFromBase\":" .. Map.GetPlotDistance(ZBX, ZBY, best.x, best.y) .. "}")
