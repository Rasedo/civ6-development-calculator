-- GameCore_Tuner (after lab_json.lua): C-74-S3 — every active storm (type,
-- start turn, current location as x,y and its terrain/feature) and this
-- turn's first event record; tag ZTAG.
local out = {}
local n = P(function() return GameClimate.GetNumActiveStorms() end)
if type(n) == "number" then
  for i = 0, n - 1 do
    local s = P(function() return GameClimate.GetActiveStormByIndex(i) end)
    if type(s) == "table" then
      local q = Map.GetPlotByIndex(s.CurrentLocation or -1)
      local rec = {type = GameInfo.RandomEvents[s.StormType] and GameInfo.RandomEvents[s.StormType].RandomEventType or s.StormType,
        start = s.StartTurn, loc = s.CurrentLocation, dir = s.CurrentDirection}
      if q then
        rec.x, rec.y = q:GetX(), q:GetY()
        rec.terrain = GameInfo.Terrains[q:GetTerrainType()].TerrainType
        local f = q:GetFeatureType()
        rec.feature = f >= 0 and GameInfo.Features[f].FeatureType or nil
      end
      rec.plots = P(function() return #GameClimate.GetActiveStormPlotsByIndex(i) end)
      out[#out + 1] = rec
    end
  end
end
OUT({kind = "storms", tag = "ZTAG", turn = Game.GetCurrentGameTurn(), n = n, storms = out,
  current = P(function() return GameRandomEvents.GetCurrentTurnEvent() end)})
