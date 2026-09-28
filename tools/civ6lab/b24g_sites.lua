-- GameCore_Tuner (after lab_json.lua): two land sites B, C at distance ZD from
-- the city at ZX:ZY and ZD from each other (passable, not water, unowned, no
-- unit, not within 3 of another city), a Settler of seat ZP created on each.
-- ZGO=1 creates; 0 only lists the first pair.
local function ok(q)
  if q == nil or q:IsWater() or q:IsMountain() or q:IsImpassable() or q:GetOwner() ~= -1 or q:GetUnitCount() > 0 then return false end
  for _, pl in ipairs(Players) do
    local okc, cs = pcall(function() return pl:GetCities() end)
    if okc and cs then for _, c in cs:Members() do
      if Map.GetPlotDistance(q:GetX(), q:GetY(), c:GetX(), c:GetY()) < 4 then return false end
    end end
  end
  return true
end
local ring = {}
for dx = -ZD, ZD do for dy = -ZD, ZD do
  local q = Map.GetPlotXYWithRangeCheck(ZX, ZY, dx, dy, ZD)
  if q and Map.GetPlotDistance(ZX, ZY, q:GetX(), q:GetY()) == ZD and ok(q) then ring[#ring + 1] = q end
end end
local pb, pc
for i = 1, #ring do for j = i + 1, #ring do
  if pb == nil and Map.GetPlotDistance(ring[i]:GetX(), ring[i]:GetY(), ring[j]:GetX(), ring[j]:GetY()) == ZD then
    pb, pc = ring[i], ring[j]
  end
end end
if pb == nil then OUT({kind = "sites", error = "none", ring = #ring}) return end
local rec = {kind = "sites", b = {pb:GetX(), pb:GetY()}, c = {pc:GetX(), pc:GetY()}, ring = #ring}
if ZGO == 1 then
  local s = GameInfo.Units["UNIT_SETTLER"].Index
  rec.ub = P(function() local u = Players[ZP]:GetUnits():Create(s, pb:GetX(), pb:GetY()) return u and u:GetID() or "nil" end)
  rec.uc = P(function() local u = Players[ZP]:GetUnits():Create(s, pc:GetX(), pc:GetY()) return u and u:GetID() or "nil" end)
end
OUT(rec)
