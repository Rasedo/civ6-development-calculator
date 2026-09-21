-- GameCore_Tuner: did the blast land? Reads the aim plot's fallout, which is
-- the only unambiguous signal once the scene is reset each round (a unit killed
-- by the blast stays FINDABLE at -9999, so "the marker exists" proves nothing).
-- Also reports the marker's and guard's real state for cross-checking.
--   --set ZAX=36 --set ZAY=15 --set ZMARKER=1 --set ZGUARD=2 --set ZWAR=1
local fm = Game.GetFalloutManager()
local aim = Map.GetPlot(ZAX, ZAY)
local pe = Players[ZWAR]
local function state(id)
  local u = pe:GetUnits():FindID(id)
  if u == nil then return "\"gone\"" end
  local hp = u:GetMaxDamage() - u:GetDamage()
  return "{\"x\":" .. u:GetX() .. ",\"y\":" .. u:GetY() .. ",\"hp\":" .. hp .. "}"
end
local fo = fm:GetFalloutTurnsRemaining(aim:GetIndex())
print("{\"kind\":\"outcome\",\"aim\":\"" .. ZAX .. ":" .. ZAY .. "\""
  .. ",\"aimFallout\":" .. tostring(fo)
  .. ",\"landed\":" .. tostring(fo > 0)
  .. ",\"marker\":" .. state(ZMARKER)
  .. ",\"guard\":" .. state(ZGUARD)
  .. ",\"thermo\":" .. Players[0]:GetWMDs():GetWeaponCount(GameInfo.WMDs["WMD_THERMONUCLEAR_DEVICE"].Index) .. "}")
