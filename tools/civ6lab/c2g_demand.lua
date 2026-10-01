-- InGame (C-2, lab 5g), seat ZA local: ask seat ZB to promise not to spy, as
-- DiplomacyActionView.lua's CHOICE_DEMAND_PROMISE_DONT_SPY does
-- (`DiplomacyManager.RequestSession(local, other, "WARNING_STOP_SPYING_ON_ME")`).
local ok, r = pcall(function() return DiplomacyManager.RequestSession(ZA, ZB, "WARNING_STOP_SPYING_ON_ME") end)
local sid = DiplomacyManager.FindOpenSessionID(ZB, ZA)
print(string.format("demand p%d -> p%d WARNING_STOP_SPYING_ON_ME %s; open session %s", ZA, ZB,
  ok and tostring(r) or ("err:" .. tostring(r)), tostring(sid)))
