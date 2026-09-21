-- InGame: clear ENDTURN_BLOCKING_COMMEMORATION_AVAILABLE. A new era asks the
-- player for a Dedication and autoplay will not pass the turn until one is
-- chosen, which is what stalled turn 160. The UI's own call is
--   kParameters[PlayerOperations.PARAM_COMMEMORATION_TYPE] = <hash>
--   UI.RequestPlayerOperation(me, PlayerOperations.COMMEMORATE, kParameters)
-- (DLC/Expansion2/UI/Additions/DedicationPopup.lua:214).
local me = Game.GetLocalPlayer()
local function blocker()
  local b = NotificationManager.GetFirstEndTurnBlocking(me)
  for k, v in pairs(EndTurnBlockingTypes) do if v == b then return k end end
  return tostring(b)
end
local before = blocker()
local picked = "none"
-- the table is CommemorationTypes, not Commemorations (Expansion1 data), and
-- each row has a MinimumGameEra/MaximumGameEra window — the FIRST row is the
-- wrong one late in the game, so the caller names the one that fits the era.
--   --set ZPICK=COMMEMORATION_MILITARY
local r = GameInfo.CommemorationTypes["ZPICK"]
if r ~= nil then
  local t = {}
  t[PlayerOperations.PARAM_COMMEMORATION_TYPE] = r.Hash
  local ok = pcall(function() UI.RequestPlayerOperation(me, PlayerOperations.COMMEMORATE, t) end)
  if ok then picked = r.CommemorationType end
end
print("{\"kind\":\"commemorate\",\"picked\":\"" .. picked .. "\",\"blockerBefore\":\"" .. before
  .. "\",\"blockerNow\":\"" .. blocker() .. "\",\"turn\":" .. Game.GetCurrentGameTurn() .. "}")
