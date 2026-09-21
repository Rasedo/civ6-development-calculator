-- GameCore_Tuner: stage the content wave on the turn-125 timeline. War with
-- every target's owner, warheads, one Bomber per strike on the base tile, and
-- a Scout beside each target (the AIM PLOT must be revealed or the strike is
-- refused silently). Populations are NEVER touched - an inflated city snaps
-- down for a reason that is not the blast.
--   --set ZBX=21 --set ZBY=22
local T = {
  { x = 20, y = 29, owner = 1 }, { x = 26, y = 28, owner = 1 },
  { x = 26, y = 32, owner = 1 }, { x = 30, y = 20, owner = 1 },
  { x = 22, y = 12, owner = 2 }, { x = 19, y = 14, owner = 2 },
  { x = 13, y = 19, owner = 3 }, { x = 12, y = 23, owner = 3 },
  { x = 26, y = 18, owner = 4 }, { x = 17, y = 25, owner = 6 },
  { x = 18, y = 18, owner = 9 }, { x = 29, y = 29, owner = 8 },
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
pcall(function() w:ChangeWeaponCount(GameInfo.WMDs["WMD_THERMONUCLEAR_DEVICE"].Index, 40) end)
local made = 0
for _ = 1, 16 do
  if p0:GetUnits():Create(GameInfo.Units["UNIT_BOMBER"].Index, ZBX, ZBY) ~= nil then made = made + 1 end
end
print("bombers " .. made .. " thermo=" .. w:GetWeaponCount(GameInfo.WMDs["WMD_THERMONUCLEAR_DEVICE"].Index))
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
  print("scout " .. r.x .. ":" .. r.y .. " placed=" .. tostring(placed))
end
