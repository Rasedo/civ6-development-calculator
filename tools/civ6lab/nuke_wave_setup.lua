-- GameCore_Tuner: stage the CLEAN scene-D wave. Six targets, deliberately far
-- apart (>= 5 tiles) so no blast can touch another's land, each set to its own
-- starting population. Also: war with every owner, warheads, one Bomber per
-- strike on the base tile, and a Scout beside each target — a WMD_STRIKE is
-- REFUSED unless the AIM PLOT is revealed to the striking player, and a
-- spawned unit's sight is enough to reveal it.
--   --set ZBX=21 --set ZBY=22 --set ZP1=4 --set ZP2=8 --set ZP3=12 --set ZP4=16 --set ZP5=20 --set ZP6=24
local T = {
  { x = 17, y = 25, owner = 6, pop = ZP1, tag = "nanmadol" },
  { x = 12, y = 23, owner = 3, pop = ZP2, tag = "montrose" },
  { x = 23, y = 26, owner = 1, pop = ZP3, tag = "tokyo" },
  { x = 18, y = 18, owner = 9, pop = ZP4, tag = "muscat" },
  { x = 30, y = 20, owner = 1, pop = ZP5, tag = "otsu" },
  { x = 22, y = 12, owner = 2, pop = ZP6, tag = "meroe" },
}
local p0 = Players[0]
local d = p0:GetDiplomacy()
local seen = {}
for _, r in ipairs(T) do
  if not seen[r.owner] then
    seen[r.owner] = true
    if not d:IsAtWarWith(r.owner) then pcall(function() d:DeclareWarOn(r.owner, WarTypes.SURPRISE_WAR, true) end) end
    print("war p" .. r.owner .. "=" .. tostring(d:IsAtWarWith(r.owner)))
  end
end
local w = p0:GetWMDs()
pcall(function() w:ChangeWeaponCount(GameInfo.WMDs["WMD_THERMONUCLEAR_DEVICE"].Index, 30) end)
pcall(function() w:ChangeWeaponCount(GameInfo.WMDs["WMD_NUCLEAR_DEVICE"].Index, 30) end)
print("warheads thermo=" .. w:GetWeaponCount(GameInfo.WMDs["WMD_THERMONUCLEAR_DEVICE"].Index)
  .. " nuclear=" .. w:GetWeaponCount(GameInfo.WMDs["WMD_NUCLEAR_DEVICE"].Index))
local made = 0
for _ = 1, 10 do
  if p0:GetUnits():Create(GameInfo.Units["UNIT_BOMBER"].Index, ZBX, ZBY) ~= nil then made = made + 1 end
end
print("bombers " .. made .. " at " .. ZBX .. ":" .. ZBY)
for _, r in ipairs(T) do
  -- a Scout within 2 of the target, to reveal it and its aim plots
  local placed = false
  for i = 0, Map.GetPlotCount() - 1 do
    local q = Map.GetPlotByIndex(i)
    local dd = Map.GetPlotDistance(r.x, r.y, q:GetX(), q:GetY())
    if not placed and dd >= 1 and dd <= 2 and not q:IsWater() and not q:IsImpassable()
       and q:GetUnitCount() == 0 and not q:IsCity() then
      if p0:GetUnits():Create(GameInfo.Units["UNIT_SCOUT"].Index, q:GetX(), q:GetY()) ~= nil then
        placed = true
        print("scout for " .. r.tag .. " at " .. q:GetX() .. ":" .. q:GetY())
      end
    end
  end
  local city = nil
  for _, c in Players[r.owner]:GetCities():Members() do
    if c:GetX() == r.x and c:GetY() == r.y then city = c end
  end
  if city == nil then
    print("{\"tag\":\"" .. r.tag .. "\",\"error\":\"nocity\"}")
  else
    local before = city:GetPopulation()
    if r.pop - before ~= 0 then pcall(function() city:ChangePopulation(r.pop - before) end) end
    print("{\"scene\":\"D\",\"kind\":\"wave-setup\",\"tag\":\"" .. r.tag .. "\",\"city\":\"" .. city:GetName()
      .. "\",\"owner\":" .. r.owner .. ",\"x\":" .. r.x .. ",\"y\":" .. r.y
      .. ",\"popWanted\":" .. r.pop .. ",\"popWas\":" .. before .. ",\"popNow\":" .. city:GetPopulation()
      .. ",\"scoutPlaced\":" .. tostring(placed) .. "}")
  end
end
