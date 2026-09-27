-- GameCore_Tuner (after lab_json.lua): C-16 level-1 arm — remove p ZP's spy
-- ZOLD and create a fresh (level 1, no promotion) Spy for ZP at ZX,ZY (the
-- city centre, the only plot a created spy posts from). Prints the new id.
local pl = Players[ZP]
local old = pl:GetUnits():FindID(ZOLD)
local rec = {kind = "swap", p = ZP, old = ZOLD}
if old then rec.removed = P(function() pl:GetUnits():Destroy(old) return true end) end
local u = P(function() return pl:GetUnits():Create(GameInfo.Units["UNIT_SPY"].Index, ZX, ZY) end)
if type(u) == "table" or type(u) == "userdata" then
  rec.id = u:GetID()
  rec.at = {u:GetX(), u:GetY()}
  P(function() UnitManager.RestoreMovement(u) end)
else
  rec.id = -1
  rec.err = tostring(u)
end
OUT(rec)
