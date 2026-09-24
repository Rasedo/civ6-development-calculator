-- GameCore: the amenity ladder as the game applies it, on a turn with no
-- poke. One line per city of every living player: amenities, the need, the
-- balance and the Happinesses tier `GetHappiness` reports, beside the tier
-- the install's ladder (MinimumAmenityScore..MaximumAmenityScore) predicts.
local ladder = {}
for r in GameInfo.Happinesses() do
  ladder[#ladder + 1] = { idx = r.Index, name = r.HappinessType, lo = r.MinimumAmenityScore, hi = r.MaximumAmenityScore }
end
local function predict(b)
  for _, r in ipairs(ladder) do
    if (r.lo == nil or b >= r.lo) and (r.hi == nil or b <= r.hi) then return r.name end
  end
  return "none"
end
local names = {}
for _, r in ipairs(ladder) do names[r.idx] = r.name end
for p = 0, 62 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() then
    for _, c in pl:GetCities():Members() do
      local g = c:GetGrowth()
      local am, need, h = g:GetAmenities(), g:GetAmenitiesNeeded(), g:GetHappiness()
      print(string.format("city p%d %s pop %d amen %d need %d bal %d tier %s ladder %s",
        p, c:GetName(), c:GetPopulation(), am, need, am - need, tostring(names[h]), predict(am - need)))
    end
  end
end
print("turn " .. Game.GetCurrentGameTurn())
