-- GameCore: C-16-S1's ground. Seat ZP's city at ZX:ZY — each district's
-- type, plot, distance to the centre and complete / pillaged state — and
-- every Spy of every major with its plot, level and current operation.
--   --set ZP=1 --set ZX=54 --set ZY=11
local c = CityManager.GetCityAt(ZX, ZY)
if c == nil then print("nocity") return end
local ds = c:GetDistricts()
for i = 0, ds:GetNumDistricts() - 1 do
  local d = ds:GetDistrictByIndex(i)
  if d ~= nil then
    local row = GameInfo.Districts[d:GetType()]
    print(string.format("district %s at %d:%d dist %d complete %s pillaged %s", row.DistrictType, d:GetX(), d:GetY(),
      Map.GetPlotDistance(ZX, ZY, d:GetX(), d:GetY()), tostring(d:IsComplete()), tostring(d:IsPillaged())))
  end
end
local spy = GameInfo.Units["UNIT_SPY"].Index
for p = 0, 62 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() and pl:IsMajor() then
    for _, u in pl:GetUnits():Members() do
      if u:GetType() == spy then
        local ok, op = pcall(function() return u:GetSpyOperation() end)
        local okl, lv = pcall(function() return u:GetExperience():GetLevel() end)
        print(string.format("spy p%d id %d at %d:%d level %s op %s", p, u:GetID(), u:GetX(), u:GetY(),
          okl and tostring(lv) or "err", ok and tostring(op) or "err"))
      end
    end
  end
end
