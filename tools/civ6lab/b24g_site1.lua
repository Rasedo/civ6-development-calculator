-- GameCore_Tuner (after lab_json.lua): one land site at distance ZD from
-- ZX:ZY, unowned, passable, no unit, at least 4 from every city; a Settler of
-- seat ZP is created there when ZGO is 1.
local best
for dx = -ZD, ZD do for dy = -ZD, ZD do
  local q = Map.GetPlotXYWithRangeCheck(ZX, ZY, dx, dy, ZD)
  if best == nil and q and Map.GetPlotDistance(ZX, ZY, q:GetX(), q:GetY()) == ZD and not q:IsWater() and not q:IsMountain()
     and not q:IsImpassable() and q:GetOwner() == -1 and q:GetUnitCount() == 0 then
    local far = true
    for _, pl in ipairs(Players) do
      local okc, cs = pcall(function() return pl:GetCities() end)
      if okc and cs then for _, c in cs:Members() do
        if Map.GetPlotDistance(q:GetX(), q:GetY(), c:GetX(), c:GetY()) < 4 then far = false end
      end end
    end
    if far then best = q end
  end
end end
if best == nil then OUT({kind = "site1", error = "none"}) return end
local rec = {kind = "site1", at = {best:GetX(), best:GetY()}}
if ZGO == 1 then
  rec.unit = P(function() local u = Players[ZP]:GetUnits():Create(GameInfo.Units["UNIT_SETTLER"].Index, best:GetX(), best:GetY()) return u and u:GetID() or "nil" end)
end
OUT(rec)
