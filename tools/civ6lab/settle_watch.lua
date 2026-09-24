-- InGame, once per turn (`watch.py --lua settle_watch.lua --state InGame`),
-- ask 18: DON'T SETTLE NEAR ME's reach. One JSON line per major pair where
-- a has made the promise to b (`IsPromiseMade`, as DiplomacyActionView
-- reads it), one per major's city (a new id is a founding), and one per
-- pair's grievances where the reader answers — a promise that vanishes
-- right after a founding, with a grievance jump, is a broken one.
local turn = Game.GetCurrentGameTurn()
local majors = {}
for p = 0, 62 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() and pl:IsMajor() then majors[#majors + 1] = p end
end
for _, a in ipairs(majors) do
  local d = Players[a]:GetDiplomacy()
  for _, b in ipairs(majors) do
    if a ~= b then
      local ok, made = pcall(function() return d:IsPromiseMade(b, PromiseTypes.DONT_SETTLE_NEAR_ME) end)
      if ok and made then
        print(string.format('{"kind":"promise","turn":%d,"a":%d,"b":%d}', turn, a, b))
      end
      local okg, g = pcall(function() return d:GetGrievancesAgainst(b) end)
      if okg and g ~= nil and g ~= 0 then
        print(string.format('{"kind":"grievance","turn":%d,"a":%d,"b":%d,"g":%d}', turn, a, b, g))
      end
    end
  end
  for _, c in Players[a]:GetCities():Members() do
    print(string.format('{"kind":"city","turn":%d,"p":%d,"id":%d,"x":%d,"y":%d,"orig":%d}',
      turn, a, c:GetID(), c:GetX(), c:GetY(), c:GetOriginalOwner()))
  end
end
