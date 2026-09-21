-- GameCore_Tuner: stage the whole scene-D population pass in one call.
-- Declares war on every target's owner, stocks warheads, spawns one Bomber
-- per planned strike on the base tile (UNIT_BOMBER is Stackable="true", and
-- an air unit can only be CREATED on a tile its owner holds a city on), and
-- sets each target city's population to the planned value.
--   --set ZBX=21 --set ZBY=22
local PLAN = {
  { x = 23, y = 26, owner = 1, pop = 18, d = 0, wmd = "WMD_THERMONUCLEAR_DEVICE", tag = "pop18-d0-thermo" },
  { x = 20, y = 29, owner = 1, pop = 12, d = 0, wmd = "WMD_THERMONUCLEAR_DEVICE", tag = "pop12-d0-thermo" },
  { x = 26, y = 28, owner = 1, pop = 8,  d = 0, wmd = "WMD_THERMONUCLEAR_DEVICE", tag = "pop8-d0-thermo" },
  { x = 26, y = 32, owner = 1, pop = 4,  d = 0, wmd = "WMD_THERMONUCLEAR_DEVICE", tag = "pop4-d0-thermo" },
  { x = 19, y = 14, owner = 2, pop = 16, d = 0, wmd = "WMD_THERMONUCLEAR_DEVICE", tag = "pop16-d0-thermo" },
  { x = 30, y = 20, owner = 1, pop = 20, d = 0, wmd = "WMD_THERMONUCLEAR_DEVICE", tag = "pop20-d0-thermo" },
  { x = 17, y = 25, owner = 6, pop = 12, d = 1, wmd = "WMD_THERMONUCLEAR_DEVICE", tag = "pop12-d1-thermo" },
  { x = 18, y = 18, owner = 9, pop = 12, d = 2, wmd = "WMD_THERMONUCLEAR_DEVICE", tag = "pop12-d2-thermo" },
  { x = 26, y = 18, owner = 4, pop = 12, d = 3, wmd = "WMD_THERMONUCLEAR_DEVICE", tag = "pop12-d3-thermo" },
  { x = 12, y = 23, owner = 3, pop = 12, d = 0, wmd = "WMD_NUCLEAR_DEVICE", tag = "pop12-d0-nuclear" },
  { x = 13, y = 19, owner = 3, pop = 12, d = 1, wmd = "WMD_NUCLEAR_DEVICE", tag = "pop12-d1-nuclear" },
  { x = 22, y = 12, owner = 2, pop = 6,  d = 0, wmd = "WMD_NUCLEAR_DEVICE", tag = "pop6-d0-nuclear" },
}
local p0 = Players[0]
-- war with every owner in the plan
local seen = {}
for _, r in ipairs(PLAN) do
  if not seen[r.owner] then
    seen[r.owner] = true
    local d = p0:GetDiplomacy()
    if not d:IsAtWarWith(r.owner) then
      pcall(function() d:DeclareWarOn(r.owner, WarTypes.SURPRISE_WAR, true) end)
    end
    print("war p" .. r.owner .. "=" .. tostring(d:IsAtWarWith(r.owner)))
  end
end
-- warheads
local w = p0:GetWMDs()
local tn = GameInfo.WMDs["WMD_THERMONUCLEAR_DEVICE"].Index
local nd = GameInfo.WMDs["WMD_NUCLEAR_DEVICE"].Index
pcall(function() w:ChangeWeaponCount(tn, 30) end)
pcall(function() w:ChangeWeaponCount(nd, 30) end)
print("warheads thermo=" .. w:GetWeaponCount(tn) .. " nuclear=" .. w:GetWeaponCount(nd))
-- one bomber per planned strike, on the base tile
local made = 0
for _ = 1, #PLAN + 2 do
  local b = p0:GetUnits():Create(GameInfo.Units["UNIT_BOMBER"].Index, ZBX, ZBY)
  if b ~= nil then made = made + 1 end
end
print("bombers spawned " .. made .. " at " .. ZBX .. ":" .. ZBY)
-- populations
for _, r in ipairs(PLAN) do
  local city = nil
  for _, c in Players[r.owner]:GetCities():Members() do
    if c:GetX() == r.x and c:GetY() == r.y then city = c end
  end
  if city == nil then
    print("{\"tag\":\"" .. r.tag .. "\",\"error\":\"nocity\"}")
  else
    local before = city:GetPopulation()
    local delta = r.pop - before
    if delta ~= 0 then pcall(function() city:ChangePopulation(delta) end) end
    print("{\"scene\":\"D\",\"kind\":\"pass-setup\",\"tag\":\"" .. r.tag .. "\",\"city\":\"" .. city:GetName()
      .. "\",\"owner\":" .. r.owner .. ",\"x\":" .. r.x .. ",\"y\":" .. r.y
      .. ",\"popWanted\":" .. r.pop .. ",\"popWas\":" .. before .. ",\"popNow\":" .. city:GetPopulation()
      .. ",\"aimOffset\":" .. r.d .. ",\"wmd\":\"" .. r.wmd .. "\"}")
  end
end
