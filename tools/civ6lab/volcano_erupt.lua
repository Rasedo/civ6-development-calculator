-- GameCore_Tuner: erupt the volcano at VX,VY with severity row EVENT
-- (RANDOM_EVENT_VOLCANO_GENTLE / _CATASTROPHIC / _MEGACOLOSSAL). A volcano
-- event ignores `Location`; it needs the NAMED volcano's index, matched here
-- by the plot's displayed name.
local def = GameInfo.RandomEvents["EVENT"]
if def == nil then print("noevent EVENT") return end
local target = Map.GetPlot(VX, VY)
local want = MapFeatureManager.GetVolcanoName(target)
local chosen = nil
for z = 0, MapFeatureManager.GetNumVolcanoes() - 1 do
  local row = GameInfo.NamedVolcanoes[MapFeatureManager.GetVolcanoTypeAtIndex(z)]
  if row ~= nil and Locale.Lookup(row.Name) == want then chosen = row.Index end
end
if chosen == nil then print("nonamed for VX:VY") return end
GameRandomEvents.ApplyEvent({ EventType = def.Index, Location = Map.GetPlotIndex(VX, VY), NamedVolcano = chosen })
print("applied EVENT at VX:VY named " .. chosen)
