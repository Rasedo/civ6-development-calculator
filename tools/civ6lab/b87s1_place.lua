-- GameCore: B-87-S1's placements on seat ZP's city at ZX:ZY.
--   ZMODE = attach    AttachModifierByID(ZMOD) on the seat;
--   ZMODE = district  the placement API's CreateDistrict(ZDIST) on the first
--                     plot its seat owns within 3 of its centre and nearer it
--                     than any other city of the seat: land,
--                     or hills, no mountain, no district, no wonder (a
--                     resource may stand there; one call per plot — a second call on one plot
--                     took the tuner down once);
--   ZMODE = building  the ZHOW path for building ZBLD: "create" =
--                     `CreateBuilding` (whole), "incomplete" =
--                     `CreateIncompleteBuilding` then `FinishProgress`.
-- Prints what was done and HasBuilding / HasDistrict after it.
--   --set ZP=2 --set ZX=16 --set ZY=9 --set ZMODE=building --set ZBLD=BUILDING_AMPHITHEATER --set ZHOW=create
local P, mode = ZP, "ZMODE"
local c = CityManager.GetCityAt(ZX, ZY)
if c == nil or c:GetOwner() ~= P then print("nocity") return end
local bq = c:GetBuildQueue()
if mode == "attach" then
  local ok, e = pcall(function() return Players[P]:AttachModifierByID("ZMOD") end)
  print("attach ZMOD ok " .. tostring(ok) .. " " .. tostring(e))
elseif mode == "district" then
  local def = GameInfo.Districts["ZDIST"]
  if c:GetDistricts():HasDistrict(def.Index) then print("district ZDIST already") return end
  for i = 0, Map.GetPlotCount() - 1 do
    local q = Map.GetPlotByIndex(i)
    local d = Map.GetPlotDistance(ZX, ZY, q:GetX(), q:GetY())
    if d >= 1 and d <= 3 and q:GetOwner() == P and not q:IsWater() and not q:IsMountain() and not q:IsImpassable()
       and q:GetDistrictType() < 0 and q:GetWonderType() < 0 and not q:IsNaturalWonder() then
      local near, best = nil, 999
      for _, oc in Players[P]:GetCities():Members() do
        local od = Map.GetPlotDistance(q:GetX(), q:GetY(), oc:GetX(), oc:GetY())
        if od < best then near, best = oc, od end
      end
      local owning = near
      if owning ~= nil and owning:GetID() == c:GetID() then
        local ok, e = pcall(function() return bq:CreateDistrict(def.Index, q:GetIndex()) end)
        print(string.format("district ZDIST at %d:%d ok %s ret %s has %s", q:GetX(), q:GetY(), tostring(ok), tostring(e),
          tostring(c:GetDistricts():HasDistrict(def.Index))))
        return
      end
    end
  end
  print("district ZDIST: no plot")
else
  local def = GameInfo.Buildings["ZBLD"]
  local ok, e
  if "ZHOW" == "create" then
    ok, e = pcall(function() return bq:CreateBuilding(def.Index) end)
  else
    ok, e = pcall(function() bq:CreateIncompleteBuilding(def.Index, 1); return bq:FinishProgress() end)
  end
  print(string.format("building ZBLD via ZHOW ok %s ret %s has %s now building %s", tostring(ok), tostring(e),
    tostring(c:GetBuildings():HasBuilding(def.Index)), tostring(bq:CurrentlyBuilding())))
end
