-- GameCore_Tuner (after lab_json.lua): C-74-S3 — fire RandomEvents row ZEV
-- at plot ZX,ZY (ApplyEvent ignores the row's own gates) and print the call's
-- answer and this turn's event record.
local def = GameInfo.RandomEvents["ZEV"]
local q = Map.GetPlot(ZX, ZY)
local call = P(function() return GameRandomEvents.ApplyEvent({EventType = def.Index, Location = q:GetIndex()}) end)
OUT({kind = "apply", ev = "ZEV", x = ZX, y = ZY, i = q:GetIndex(), call = call,
  current = P(function() return GameRandomEvents.GetCurrentTurnEvent() end),
  events = P(function() return GameRandomEvents.GetEventsForTurn(Game.GetCurrentGameTurn()) end)})
