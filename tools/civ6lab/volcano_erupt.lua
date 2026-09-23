-- GameCore_Tuner: erupt the volcano at VX,VY with severity row EVENT
-- (RANDOM_EVENT_VOLCANO_GENTLE / _CATASTROPHIC / _MEGACOLOSSAL). A volcano
-- event ignores `Location` alone; a NAMED volcano is passed by its type
-- (`MapFeatureManager.GetVolcanoType(plot)` — matching by displayed name
-- breaks under a localized game), an unnamed one (type -1) by its location.
local def = GameInfo.RandomEvents["EVENT"]
if def == nil then print("noevent EVENT") return end
local target = Map.GetPlot(VX, VY)
local nv = MapFeatureManager.GetVolcanoType(target)
local ev = { EventType = def.Index, Location = Map.GetPlotIndex(VX, VY) }
if nv ~= nil and nv >= 0 then ev.NamedVolcano = nv end
GameRandomEvents.ApplyEvent(ev)
print("applied EVENT at VX:VY named " .. tostring(nv) .. " erupting " .. tostring(MapFeatureManager.IsVolcanoErupting(target)))
