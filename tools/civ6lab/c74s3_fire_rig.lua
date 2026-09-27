-- GameCore_Tuner (after lab_json.lua): C-74-S3 fire rig — set the features
-- listed in ZFEAT ("x,y,FEATURE_X;...") with WorldBuilder's MapManager, check
-- each (WorldBuilder refuses silently), then fire RandomEvents row ZEV at
-- ZX,ZY. Prints each placement's result and the apply call.
local placed = {}
for x, y, f in string.gmatch("ZFEAT", "(%d+),(%d+),([A-Z_]+)") do
  x, y = tonumber(x), tonumber(y)
  local q = Map.GetPlot(x, y)
  local row = GameInfo.Features[f]
  local call = P(function() WorldBuilder.MapManager():SetFeatureType(q, row.Index) return true end)
  local now = q:GetFeatureType()
  placed[#placed + 1] = {x, y, f, call, now >= 0 and GameInfo.Features[now].FeatureType or -1}
end
local def = GameInfo.RandomEvents["ZEV"]
local q = Map.GetPlot(ZX, ZY)
OUT({kind = "fire_rig", placed = placed, ev = "ZEV", x = ZX, y = ZY,
  apply = P(function() GameRandomEvents.ApplyEvent({EventType = def.Index, Location = q:GetIndex()}) return true end),
  feature = P(function() return GameInfo.Features[q:GetFeatureType()].FeatureType end)})
