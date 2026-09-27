-- GameCore_Tuner (after lab_json.lua): C-1 — the accident's draws. Reactor ZK:
-- prepare its city (ZPREP: repair = Workshop, Factory, Power Plant and the
-- Industrial Zone unpillaged; plant = repair, then the Power Plant pillaged;
-- izp = repair, then the Industrial Zone pillaged; keep = as found), set the
-- seed ZSEED, ApplyEvent ZEVENT at the reactor, read the seed back, and the
-- city's state before and after. The draw count is recovered in Python.
local fm = Game.GetFalloutManager()
local iz = GameInfo.Districts["DISTRICT_INDUSTRIAL_ZONE"].Index
local r = fm:GetReactorByIndex(ZK)
local c = CityManager.GetCity(r.Owner, r.CityID)
local B = {"BUILDING_WORKSHOP", "BUILDING_FACTORY", "BUILDING_POWER_PLANT"}
local function state()
  local s = {pop = c:GetPopulation()}
  local bl = c:GetBuildings()
  for _, b in ipairs(B) do
    local i = GameInfo.Buildings[b].Index
    if bl:HasBuilding(i) then s[b] = P(function() return bl:IsPillaged(i) end) else s[b] = "absent" end
  end
  local d = c:GetDistricts():GetDistrict(iz)
  if d then s.iz = P(function() return d:IsPillaged() end) else s.iz = "absent" end
  s.fallout = fm:GetFalloutTurnsRemaining(r.PlotIndex)
  local centre = c:GetDistricts():GetDistrict(GameInfo.Districts["DISTRICT_CITY_CENTER"].Index)
  s.garrison = centre and P(function() return centre:GetDamage(DefenseTypes.DISTRICT_GARRISON) end) or "none"
  s.outer = centre and P(function() return centre:GetDamage(DefenseTypes.DISTRICT_OUTER) end) or "none"
  s.izGarrison = d and P(function() return d:GetDamage(DefenseTypes.DISTRICT_GARRISON) end) or "none"
  local rp = Map.GetPlotByIndex(r.PlotIndex)
  s.units = {}
  for q = 0, 63 do
    local o = Players[q]
    if o ~= nil and o:IsAlive() then
      for _, u in o:GetUnits():Members() do
        if u:GetX() == rp:GetX() and u:GetY() == rp:GetY() then
          s.units[#s.units + 1] = {u:GetID(), GameInfo.Units[u:GetType()].UnitType, u:GetDamage()}
        end
      end
    end
  end
  local imps, pils = 0, 0
  for dx = -3, 3 do for dy = -3, 3 do
    local p = Map.GetPlotXYWithRangeCheck(rp:GetX(), rp:GetY(), dx, dy, 3)
    if p and p:GetImprovementType() >= 0 then
      imps = imps + 1
      if p:IsImprovementPillaged() then pils = pils + 1 end
    end
  end end
  s.imps, s.impPil = imps, pils
  return s
end
local bl = c:GetBuildings()
if "ZPREP" ~= "keep" then
  for _, b in ipairs(B) do pcall(function() bl:SetPillaged(GameInfo.Buildings[b].Index, false) end) end
  local d = c:GetDistricts():GetDistrict(iz)
  if d then pcall(function() d:SetPillaged(false) end) end
  if "ZPREP" == "plant" then pcall(function() bl:SetPillaged(GameInfo.Buildings["BUILDING_POWER_PLANT"].Index, true) end) end
  if "ZPREP" == "izp" and d then pcall(function() d:SetPillaged(true) end) end
end
local before = state()
Game.SetRandomSeed(ZSEED)
local def = GameInfo.RandomEvents["ZEVENT"]
local call = P(function() GameRandomEvents.ApplyEvent({EventType = def.Index, Location = r.PlotIndex}) return true end)
local seed1 = Game.GetRandomSeed()
OUT({kind = "fire", k = ZK, city = r.CityID, plot = r.PlotIndex, event = "ZEVENT", prep = "ZPREP", seed0 = ZSEED,
  seed1 = seed1, call = call, before = before, after = state()})
