-- GameCore_Tuner: scene D setup — grant player 0 every tech, stock ZN
-- thermonuclear devices, spawn a WMD-capable bomber at ZBX:ZBY, and fill the
-- target's rings 0..2 with ONE unit of player ZTP per land tile that has none
-- (one unit per tile, always) so the per-ring kill is countable.
--   Players[0]:GetWMDs():ChangeWeaponCount(GameInfo.WMDs[...].Index, n)
--   Debug/Player.ltp: pPlayerTechs:SetTech(i, true)
--   --set ZCX=23 --set ZCY=26 --set ZTP=1 --set ZBX=27 --set ZBY=24 --set ZN=5
-- a pcall read in three states: its value, or "err:<msg>" when the call threw
local function tri(ok, v)
  local s = ok and tostring(v) or ("err:" .. tostring(v))
  return (s:gsub('[%c"\\]', function(c) return string.format("\\u%04x", c:byte()) end))
end
local function trij(ok, v)
  if ok and (type(v) == "boolean" or type(v) == "number") then return tostring(v) end
  if ok and v == nil then return "null" end
  return "\"" .. tri(ok, v) .. "\""
end
local p0 = Players[0]
local techs = p0:GetTechs()
local granted = 0
for r in GameInfo.Technologies() do
  local ok = pcall(function() techs:SetTech(r.Index, true) end)
  if ok then granted = granted + 1 end
end
print("techs granted " .. granted)
local w = p0:GetWMDs()
local tn = GameInfo.WMDs["WMD_THERMONUCLEAR_DEVICE"].Index
local nd = GameInfo.WMDs["WMD_NUCLEAR_DEVICE"].Index
pcall(function() w:ChangeWeaponCount(tn, ZN) end)
pcall(function() w:ChangeWeaponCount(nd, ZN) end)
print("wmd thermo=" .. tostring(w:GetWeaponCount(tn)) .. " nuclear=" .. tostring(w:GetWeaponCount(nd))
  .. " canDeploy=" .. tri(pcall(function() return w:CanDeployWMD(tn) end)))
local b = p0:GetUnits():Create(GameInfo.Units["UNIT_BOMBER"].Index, ZBX, ZBY)
print("bomber " .. tostring(b and b:GetID()) .. " at " .. ZBX .. ":" .. ZBY
  .. " dist " .. Map.GetPlotDistance(ZBX, ZBY, ZCX, ZCY))
-- fill the rings with targets
local filler = { "UNIT_MUSKETMAN", "UNIT_PIKEMAN", "UNIT_CROSSBOWMAN", "UNIT_KNIGHT", "UNIT_SWORDSMAN" }
local made = 0
for i = 0, Map.GetPlotCount() - 1 do
  local q = Map.GetPlotByIndex(i)
  local d = Map.GetPlotDistance(ZCX, ZCY, q:GetX(), q:GetY())
  if d <= 2 and not q:IsWater() and not q:IsImpassable() and q:GetUnitCount() == 0 then
    local nm = filler[(made % #filler) + 1]
    local u = Players[ZTP]:GetUnits():Create(GameInfo.Units[nm].Index, q:GetX(), q:GetY())
    if u ~= nil then
      made = made + 1
      print("target ring" .. d .. " " .. q:GetX() .. ":" .. q:GetY() .. " " .. nm .. "#" .. u:GetID())
    end
  end
end
print("targets spawned " .. made)
