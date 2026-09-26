-- InGame, once per turn (`watch.py --lua settle_watch.lua --state InGame`,
-- `promise_loop.py`, and `near_probe.py` in the turn of the act): DON'T
-- SETTLE NEAR ME's reach and the grievances it moves. Per ordered major pair
-- (a, b):
--   {"kind":"promise"}   a has made the promise to b (`IsPromiseMade`, as
--                        DiplomacyActionView reads it);
--   {"kind":"grievance"} a's `GetGrievancesAgainst(b)` and the game's
--                        `GetGrievanceChangePerTurn(b, a)`, when either is
--                        not 0 or threw;
--   {"kind":"grievlog"}  each entry of `Game.GetGameDiplomacy():
--                        GetGrievanceLogEntries(b, a)` (the World Congress
--                        tab's call, DiplomacyActionView_WorldCongressTab.lua:44,
--                        with b the selected player and a the local one —
--                        UNVERIFIED from the tuner) whose Turn is at least
--                        ZSINCE (default: last turn), every field the entry
--                        carries; a call that threw prints one line with "err".
-- and one {"kind":"city"} line per major's city (a new id is a founding). A
-- promise that vanishes right after a founding, with a grievance entry, is a
-- broken one. Reads print their value, or "err:<msg>" when the call threw.
--   --set ZSINCE=<turn>
local turn = Game.GetCurrentGameTurn()
local since = tonumber("ZSINCE") or (turn - 1)
local function esc(s) return (tostring(s):gsub('[%c"\\]', function(c) return string.format("\\u%04x", c:byte()) end)) end
local function J(ok, v)
  if not ok then return "\"err:" .. esc(v) .. "\"" end
  if type(v) == "number" or type(v) == "boolean" then return tostring(v) end
  if v == nil then return "null" end
  return "\"" .. esc(v) .. "\""
end
local majors = {}
for p = 0, 62 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() and pl:IsMajor() then majors[#majors + 1] = p end
end
local okgd, gd = pcall(function() return Game.GetGameDiplomacy() end)
if not okgd or gd == nil then
  print(string.format('{"kind":"grievlog","turn":%d,"gameDiplomacy":%s}', turn, J(okgd, gd)))
  gd = nil
end
for _, a in ipairs(majors) do
  local d = Players[a]:GetDiplomacy()
  for _, b in ipairs(majors) do
    if a ~= b then
      local ok, made = pcall(function() return d:IsPromiseMade(b, PromiseTypes.DONT_SETTLE_NEAR_ME) end)
      if not ok or made then
        print(string.format('{"kind":"promise","turn":%d,"a":%d,"b":%d,"made":%s}', turn, a, b, J(ok, made)))
      end
      local okg, g = pcall(function() return d:GetGrievancesAgainst(b) end)
      local okr, r = pcall(function() return gd:GetGrievanceChangePerTurn(b, a) end)
      if not okg or not okr or (g ~= nil and g ~= 0) or (r ~= nil and r ~= 0) then
        print(string.format('{"kind":"grievance","turn":%d,"a":%d,"b":%d,"g":%s,"perTurn":%s}',
          turn, a, b, J(okg, g), J(okr, r)))
      end
      local okl, log = pcall(function() return gd:GetGrievanceLogEntries(b, a) end)
      if not okl or type(log) ~= "table" then
        print(string.format('{"kind":"grievlog","turn":%d,"a":%d,"b":%d,"err":%s}', turn, a, b, J(okl, log)))
      else
        for _, e in pairs(log) do
          if type(e) == "table" and (tonumber(e.Turn) or since) >= since then
            local f = {}
            for k, v in pairs(e) do f[#f + 1] = "\"" .. esc(k) .. "\":" .. J(true, v) end
            table.sort(f)
            print(string.format('{"kind":"grievlog","turn":%d,"a":%d,"b":%d,"entry":{%s}}',
              turn, a, b, table.concat(f, ",")))
          end
        end
      end
    end
  end
  for _, c in Players[a]:GetCities():Members() do
    print(string.format('{"kind":"city","turn":%d,"p":%d,"id":%d,"x":%d,"y":%d,"orig":%d}',
      turn, a, c:GetID(), c:GetX(), c:GetY(), c:GetOriginalOwner()))
  end
end
