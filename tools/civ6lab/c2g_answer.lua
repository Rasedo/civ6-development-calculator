-- InGame (C-2, lab 5g): seat ZB answers an open session from seat ZA with
-- ZANSWER (`DiplomacyManager.AddResponse`, as promise_loop.py's LUA_ACCEPT),
-- then the promise and grievances both ways.
local sid = DiplomacyManager.FindOpenSessionID(ZA, ZB)
local r = "none"
if sid ~= nil and sid >= 0 then
  local ok, e = pcall(function() return DiplomacyManager.AddResponse(sid, ZB, "ZANSWER") end)
  r = ok and ("answered " .. tostring(e)) or ("err:" .. tostring(e))
end
local function tri(f)
  local ok, v = pcall(f)
  if ok then return tostring(v) end
  return "err:" .. tostring(v)
end
print(string.format("session %s %s; local %d; p1 promised p0 %s; p0 promised p1 %s; griev p0 vs p1 %s; p1 vs p0 %s", tostring(sid), r,
  Game.GetLocalPlayer(),
  tri(function() return Players[1]:GetDiplomacy():IsPromiseMade(0, PromiseTypes.DONT_SPY_ON_ME) end),
  tri(function() return Players[0]:GetDiplomacy():IsPromiseMade(1, PromiseTypes.DONT_SPY_ON_ME) end),
  tri(function() return Players[0]:GetDiplomacy():GetGrievancesAgainst(1) end),
  tri(function() return Players[1]:GetDiplomacy():GetGrievancesAgainst(0) end)))
