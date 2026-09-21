-- GameCore_Tuner: the SPECIALIST scene, step one. To build a city whose every
-- citizen is inside a radius-2 blast AND which still has a citizen on no tile
-- at all, its ring-3 tiles have to stop being workable: an enemy unit standing
-- on a tile blockades it. Declares war on ZWAR, then puts one unit of ZWAR on
-- every plot at distance ZD from ZCX:ZCY that is land, passable and empty.
--   --set ZCX=36 --set ZCY=22 --set ZD=3 --set ZWAR=1 --set ZUNIT=UNIT_WARRIOR
local p0, pe = Players[0], Players[ZWAR]
local d = p0:GetDiplomacy()
if not d:IsAtWarWith(ZWAR) then pcall(function() d:DeclareWarOn(ZWAR, WarTypes.SURPRISE_WAR, true) end) end
local made, skipped = 0, 0
for dx = -ZD, ZD do
  for dy = -ZD, ZD do
    local ok, q = pcall(function() return Map.GetPlot(ZCX + dx, ZCY + dy) end)
    if ok and q ~= nil and Map.GetPlotDistance(ZCX, ZCY, q:GetX(), q:GetY()) == ZD then
      if not q:IsWater() and not q:IsImpassable() and q:GetUnitCount() == 0 and not q:IsCity() then
        if pe:GetUnits():Create(GameInfo.Units["ZUNIT"].Index, q:GetX(), q:GetY()) ~= nil then made = made + 1
        else skipped = skipped + 1 end
      else skipped = skipped + 1 end
    end
  end
end
print("{\"kind\":\"block\",\"turn\":" .. Game.GetCurrentGameTurn() .. ",\"centre\":\"" .. ZCX .. ":" .. ZCY
  .. "\",\"ring\":" .. ZD .. ",\"war\":" .. tostring(d:IsAtWarWith(ZWAR))
  .. ",\"placed\":" .. made .. ",\"skipped\":" .. skipped .. "}")
