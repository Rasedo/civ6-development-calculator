-- GameCore_Tuner (after lab_json.lua): C-34 / B-89 XP rig. For each unit type
-- in ZTYPES ("UNIT_A,UNIT_B"), a unit of seat ZO is created on the next free
-- land plot (no unit, no city, no district, passable) at distance ZD0..ZD1
-- from ZX:ZY, moves and attacks restored. Prints each unit's id and plot.
local used = {}
local plots = {}
for d = ZD0, ZD1 do
  for dx = -d, d do for dy = -d, d do
    local q = Map.GetPlotXYWithRangeCheck(ZX, ZY, dx, dy, d)
    if q and Map.GetPlotDistance(ZX, ZY, q:GetX(), q:GetY()) == d and not q:IsWater() and not q:IsImpassable()
       and not q:IsMountain() and q:GetUnitCount() == 0 and not q:IsCity() and q:GetDistrictType() < 0 then
      plots[#plots + 1] = q
    end
  end end
end
local out, k = {}, 1
for ty in string.gmatch("ZTYPES", "([%w_]+)") do
  local q = plots[k]
  k = k + 1
  if q == nil then out[#out + 1] = {type = ty, err = "noplot"} break end
  local u = P(function() return Players[ZO]:GetUnits():Create(GameInfo.Units[ty].Index, q:GetX(), q:GetY()) end)
  local r = {type = ty, owner = ZO, x = q:GetX(), y = q:GetY()}
  if type(u) == "table" or type(u) == "userdata" then r.id = u:GetID() else r.err = tostring(u) end
  out[#out + 1] = r
end
OUT({kind = "xprig", owner = ZO, units = out})
