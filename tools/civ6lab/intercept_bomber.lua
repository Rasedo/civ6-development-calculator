-- GameCore_Tuner: the state of the DELIVERING bomber, the interceptor and the
-- aim plot after a strike. The community's account of Civ 6 interception is
-- that a Mobile SAM does not roll a percentage at all: it makes an anti-air
-- attack on the bomber, and the strike fails only if that attack takes the
-- bomber below 50% HP. If that is right, an intercepted strike leaves a bomber
-- under 50 HP and a strike that got through leaves one at or above it, and the
-- single rng draw a guarded strike consumes is the ordinary combat damage roll.
--   --set ZBOMBER=123 --set ZGUARD=456 --set ZWAR=1 --set ZAX=36 --set ZAY=15
local fm = Game.GetFalloutManager()
local aim = Map.GetPlot(ZAX, ZAY)
local function unit(pid, id)
  local pl = Players[pid]
  if pl == nil then return "\"noplayer\"" end
  local u = pl:GetUnits():FindID(id)
  if u == nil then return "\"gone\"" end
  return "{\"x\":" .. u:GetX() .. ",\"y\":" .. u:GetY()
    .. ",\"hp\":" .. (u:GetMaxDamage() - u:GetDamage())
    .. ",\"damage\":" .. u:GetDamage()
    .. ",\"moves\":" .. u:GetMovesRemaining() .. "}"
end
print("{\"kind\":\"bomberstate\""
  .. ",\"bomber\":" .. unit(0, ZBOMBER)
  .. ",\"guard\":" .. unit(ZWAR, ZGUARD)
  .. ",\"aimFallout\":" .. tostring(fm:GetFalloutTurnsRemaining(aim:GetIndex()))
  .. ",\"landed\":" .. tostring(fm:GetFalloutTurnsRemaining(aim:GetIndex()) > 0)
  .. ",\"thermo\":" .. Players[0]:GetWMDs():GetWeaponCount(GameInfo.WMDs["WMD_THERMONUCLEAR_DEVICE"].Index)
  .. ",\"seed\":" .. tostring(Game.GetRandomSeed()) .. "}")
