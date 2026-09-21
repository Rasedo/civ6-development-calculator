-- GameCore_Tuner: stage the NATURAL-population scene-D wave. Nothing sets a
-- population here on purpose: ChangePopulation inflates a city above what its
-- housing supports, and a nuke collapses that housing, so an artificially
-- grown city snaps down for a reason that is NOT the blast. Eight targets,
-- natural pops 4..18, every one at least 4 tiles from the next.
-- Also: war with every owner, warheads, ten Bombers on the base tile, and a
-- Scout beside each target (a WMD_STRIKE is refused unless the AIM PLOT is
-- revealed to the striking player).
--   --set ZBX=21 --set ZBY=22
local T = {
  { x = 30, y = 20, owner = 1, tag = "otsu" },
  { x = 19, y = 14, owner = 2, tag = "napata" },
  { x = 17, y = 25, owner = 6, tag = "nanmadol" },
  { x = 12, y = 23, owner = 3, tag = "montrose" },
  { x = 26, y = 18, owner = 4, tag = "ngazargamu" },
  { x = 18, y = 18, owner = 9, tag = "muscat" },
  { x = 20, y = 29, owner = 1, tag = "okayama" },
  { x = 23, y = 26, owner = 1, tag = "tokyo" },
}
local p0 = Players[0]
local d = p0:GetDiplomacy()
local seen = {}
for _, r in ipairs(T) do
  if not seen[r.owner] then
    seen[r.owner] = true
    if not d:IsAtWarWith(r.owner) then pcall(function() d:DeclareWarOn(r.owner, WarTypes.SURPRISE_WAR, true) end) end
  end
end
local w = p0:GetWMDs()
pcall(function() w:ChangeWeaponCount(GameInfo.WMDs["WMD_THERMONUCLEAR_DEVICE"].Index, 30) end)
pcall(function() w:ChangeWeaponCount(GameInfo.WMDs["WMD_NUCLEAR_DEVICE"].Index, 30) end)
local made = 0
for _ = 1, 12 do
  if p0:GetUnits():Create(GameInfo.Units["UNIT_BOMBER"].Index, ZBX, ZBY) ~= nil then made = made + 1 end
end
print("bombers " .. made .. " warheads thermo=" .. w:GetWeaponCount(GameInfo.WMDs["WMD_THERMONUCLEAR_DEVICE"].Index))
for _, r in ipairs(T) do
  local placed = false
  for i = 0, Map.GetPlotCount() - 1 do
    local q = Map.GetPlotByIndex(i)
    local dd = Map.GetPlotDistance(r.x, r.y, q:GetX(), q:GetY())
    if not placed and dd >= 1 and dd <= 2 and not q:IsWater() and not q:IsImpassable()
       and q:GetUnitCount() == 0 and not q:IsCity() then
      if p0:GetUnits():Create(GameInfo.Units["UNIT_SCOUT"].Index, q:GetX(), q:GetY()) ~= nil then placed = true end
    end
  end
  local city = nil
  for _, c in Players[r.owner]:GetCities():Members() do
    if c:GetX() == r.x and c:GetY() == r.y then city = c end
  end
  print("{\"scene\":\"D\",\"kind\":\"natural-setup\",\"tag\":\"" .. r.tag
    .. "\",\"city\":\"" .. (city and city:GetName() or "-") .. "\",\"owner\":" .. r.owner
    .. ",\"x\":" .. r.x .. ",\"y\":" .. r.y
    .. ",\"naturalPop\":" .. (city and city:GetPopulation() or -1)
    .. ",\"scoutPlaced\":" .. tostring(placed) .. "}")
end
