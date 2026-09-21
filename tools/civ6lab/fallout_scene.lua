-- GameCore_Tuner: fallout WITHOUT a blast. Game.GetFalloutManager():AddFallout
-- contaminates a plot on its own, so the tile-yield question ("does fallout
-- zero what a citizen standing in it produces?") can be asked with no pillaged
-- improvement and no pillaged building anywhere near it.
-- Also parks ZN units of player 0 on contaminated plots and one on a clean
-- plot as the control, to measure the per-turn damage both engines take from
-- the pedia (50) with no install table behind it.
-- The garrison is anchored at ZGX:ZGY (within 4) so the units sit in the
-- owner's own quiet territory and nothing but the fallout can hurt them.
--   --set ZPX=21 --set ZPY=21 --set ZTURNS=10 --set ZN=3 --set ZUNIT=UNIT_WARRIOR
--   --set ZGX=36 --set ZGY=22
local fm = Game.GetFalloutManager()
local q = Map.GetPlot(ZPX, ZPY)
local before = fm:GetFalloutTurnsRemaining(q:GetIndex())
pcall(function() fm:SetFalloutTurnsRemaining(q:GetIndex(), ZTURNS) end)
local after = fm:GetFalloutTurnsRemaining(q:GetIndex())
if after == before then
  pcall(function() fm:AddFallout(q:GetIndex(), ZTURNS) end)
  after = fm:GetFalloutTurnsRemaining(q:GetIndex())
end
print("{\"kind\":\"fallout-plant\",\"plot\":\"" .. ZPX .. ":" .. ZPY .. "\",\"before\":" .. before
  .. ",\"after\":" .. after .. "}")
-- garrison: ZN units on contaminated plots, one on a clean plot
local p0 = Players[0]
local placed, control = {}, nil
for i = 0, Map.GetPlotCount() - 1 do
  local p = Map.GetPlotByIndex(i)
  if #placed < ZN and fm:GetFalloutTurnsRemaining(i) > 0 and not p:IsWater()
     and not p:IsImpassable() and p:GetUnitCount() == 0 and not p:IsCity()
     and Map.GetPlotDistance(ZGX, ZGY, p:GetX(), p:GetY()) <= 4 then
    local u = p0:GetUnits():Create(GameInfo.Units["ZUNIT"].Index, p:GetX(), p:GetY())
    if u ~= nil then
      placed[#placed + 1] = "{\"id\":" .. u:GetID() .. ",\"x\":" .. p:GetX() .. ",\"y\":" .. p:GetY()
        .. ",\"fallout\":" .. fm:GetFalloutTurnsRemaining(i)
        .. ",\"hp\":" .. (u:GetMaxDamage() - u:GetDamage()) .. "}"
    end
  end
  if control == nil and fm:GetFalloutTurnsRemaining(i) == 0 and not p:IsWater()
     and not p:IsImpassable() and p:GetUnitCount() == 0 and not p:IsCity()
     and Map.GetPlotDistance(ZGX, ZGY, p:GetX(), p:GetY()) <= 4 then
    local u = p0:GetUnits():Create(GameInfo.Units["ZUNIT"].Index, p:GetX(), p:GetY())
    if u ~= nil then
      control = "{\"id\":" .. u:GetID() .. ",\"x\":" .. p:GetX() .. ",\"y\":" .. p:GetY()
        .. ",\"fallout\":0,\"hp\":" .. (u:GetMaxDamage() - u:GetDamage()) .. "}"
    end
  end
end
print("{\"kind\":\"fallout-garrison\",\"turn\":" .. Game.GetCurrentGameTurn()
  .. ",\"inFallout\":[" .. table.concat(placed, ",") .. "],\"control\":" .. (control or "null") .. "}")
