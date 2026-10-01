-- InGame (C-2, lab 5g): close the open session between seats ZA and ZB, as
-- DiplomacyActionView.lua does after an answer (`DiplomacyManager.CloseSession`)
local sid = DiplomacyManager.FindOpenSessionID(ZA, ZB)
local r = "none"
if sid ~= nil and sid >= 0 then
  local ok, e = pcall(function() return DiplomacyManager.CloseSession(sid) end)
  r = ok and ("closed " .. tostring(e)) or ("err:" .. tostring(e))
end
local after = DiplomacyManager.FindOpenSessionID(ZA, ZB)
print(string.format("session %s %s; after: %s", tostring(sid), r, tostring(after)))
