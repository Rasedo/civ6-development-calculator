-- InGame: seat ZSEAT asks the Dedication of CommemorationTypes row index ZIDX
-- (the call DedicationPopup.lua's OnConfirm makes), then reads the allowance
local e = Game.GetEras()
local row = GameInfo.CommemorationTypes[ZIDX]
local ok, r = pcall(function()
  return UI.RequestPlayerOperation(ZSEAT, PlayerOperations.COMMEMORATE, {[PlayerOperations.PARAM_COMMEMORATION_TYPE] = ZIDX})
end)
print(string.format("commemorate %d %s -> %s; allowed now %s; local %d", ZIDX, row and row.CommemorationType or "?",
  ok and tostring(r) or ("err:" .. tostring(r)), tostring(e:GetPlayerNumAllowedCommemorations(ZSEAT)), Game.GetLocalPlayer()))
