-- GameCore_Tuner (after lab_json.lua): B-89 Bomber scene rig. ZSPEC is
-- "owner:UNIT_TYPE@x:y;..." — each unit created (moves and attacks restored),
-- with its plot's terrain, hills, feature, owner and the units already there.
local out = {}
for o, ty, x, y in string.gmatch("ZSPEC", "(%d+):([%w_]+)@(%d+):(%d+)") do
  o, x, y = tonumber(o), tonumber(x), tonumber(y)
  local pl = Map.GetPlot(x, y)
  local there = {}
  for _, v in ipairs(Units.GetUnitsInPlot(pl) or {}) do there[#there + 1] = v:GetOwner() .. ":" .. GameInfo.Units[v:GetType()].UnitType end
  local u = P(function() return Players[o]:GetUnits():Create(GameInfo.Units[ty].Index, x, y) end)
  local rec = {owner = o, type = ty, x = x, y = y, terrain = GameInfo.Terrains[pl:GetTerrainType()].TerrainType,
    hills = pl:IsHills(), feature = pl:GetFeatureType(), plotOwner = pl:GetOwner(), before = there}
  if type(u) == "table" or type(u) == "userdata" then
    rec.id = u:GetID()
    rec.at = u:GetX() .. ":" .. u:GetY()
    P(function() UnitManager.RestoreMovement(u) UnitManager.RestoreUnitAttacks(u) end)
  else
    rec.id = -1
    rec.err = tostring(u)
  end
  out[#out + 1] = rec
end
OUT({kind = "rig", turn = Game.GetCurrentGameTurn(), units = out})
