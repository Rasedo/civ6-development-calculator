-- DiplomacyActionView state (C-2, lab 5g): is the context shown, the session
-- it holds, and with ZFORCE=1 its OnForceClose
local shown = ContextPtr ~= nil and not ContextPtr:IsHidden()
local sid = ms_ActiveSessionID
local r = ""
if ZFORCE == 1 and OnForceClose ~= nil then
  local ok, e = pcall(OnForceClose)
  r = ok and " forced" or (" force err:" .. tostring(e))
end
print(string.format("DAV shown %s activeSession %s%s; after shown %s", tostring(shown), tostring(sid), r,
  tostring(ContextPtr ~= nil and not ContextPtr:IsHidden())))
