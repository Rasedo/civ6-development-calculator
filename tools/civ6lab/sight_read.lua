-- InGame: after a Warrior of player 0 was placed at HX,HY, report whether
-- the plots along one ray are visible NOW (IsVisible = current sight, not
-- "revealed"). Tokens HX HY AX AY BX BY CX CY are substituted by lab.py.
local vis = PlayersVisibility[0]
local function v(x, y) return vis:IsVisible(Map.GetPlotIndex(x, y)) and "V" or "." end
local h = Map.GetPlot(HX, HY)
local us = Units.GetUnitsInPlot(h)
print("observer at HX:HY units=" .. #us .. " terrain=" .. GameInfo.Terrains[h:GetTerrainType()].TerrainType:gsub("TERRAIN_", "")
      .. " A=" .. v(AX, AY) .. " B=" .. v(BX, BY) .. " C=" .. v(CX, CY))
