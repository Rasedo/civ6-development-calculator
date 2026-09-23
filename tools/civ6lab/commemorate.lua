-- InGame: clear ENDTURN_BLOCKING_COMMEMORATION_AVAILABLE. A new era asks the
-- player for its Dedications and autoplay will not pass the turn until they
-- are chosen. The UI's own call (DLC/Expansion2/UI/Additions/DedicationPopup.lua
-- OnConfirm) passes the CommemorationTypes row's INDEX — the index
-- `GetPlayerCommemorateChoices` hands out, not the row's Hash:
--   kParameters[PlayerOperations.PARAM_COMMEMORATION_TYPE] = index
--   UI.RequestPlayerOperation(me, PlayerOperations.COMMEMORATE, kParameters)
-- It asks once per allowed Dedication (`GetPlayerNumAllowedCommemorations`).
-- ZPICK names a preferred row (e.g. --set ZPICK=COMMEMORATION_MILITARY); the
-- rest of the allowance takes the offered choices in the order offered.
local me = Game.GetLocalPlayer()
local eras = Game.GetEras()
local function blocker()
  local b = NotificationManager.GetFirstEndTurnBlocking(me)
  for k, v in pairs(EndTurnBlockingTypes) do if v == b then return k end end
  return tostring(b)
end
local before = blocker()
local allowed = eras:GetPlayerNumAllowedCommemorations(me) or 0
local offered = eras:GetPlayerCommemorateChoices(me) or {}
local order = {}
local want = GameInfo.CommemorationTypes["ZPICK"]
if want ~= nil then
  for _, idx in ipairs(offered) do if idx == want.Index then order[#order + 1] = idx end end
end
for _, idx in ipairs(offered) do
  if want == nil or idx ~= want.Index then order[#order + 1] = idx end
end
local picked = {}
for i = 1, math.min(allowed, #order) do
  local t = {}
  t[PlayerOperations.PARAM_COMMEMORATION_TYPE] = order[i]
  local ok = pcall(function() UI.RequestPlayerOperation(me, PlayerOperations.COMMEMORATE, t) end)
  local row = GameInfo.CommemorationTypes[order[i]]
  if ok and row then picked[#picked + 1] = row.CommemorationType end
end
print("{\"kind\":\"commemorate\",\"allowed\":" .. allowed .. ",\"picked\":\"" .. table.concat(picked, ",")
  .. "\",\"blockerBefore\":\"" .. before .. "\",\"blockerNow\":\"" .. blocker()
  .. "\",\"turn\":" .. Game.GetCurrentGameTurn() .. "}")
