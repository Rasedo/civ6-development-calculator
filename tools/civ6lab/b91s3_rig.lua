-- GameCore_Tuner (after lab_json.lua): B-91-S3 rig — when ZADD is 1, add
-- belief ZBELIEF to religion ZR founded by ZF (`Game.GetReligion():AddBelief(founder,
-- belief index)`, GameCore — the shape `b91s3_addprobe.lua` found); then, when ZSET is 1, create a Settler for
-- player ZP at ZX,ZY. Prints the calls' answers and the religion's beliefs.
local gr = Game.GetReligion()
local b = GameInfo.Beliefs["ZBELIEF"]
local rec = {kind = "rig", r = ZR, belief = "ZBELIEF"}
local function beliefs()
  local out = {}
  for _, r in ipairs(gr:GetReligions()) do
    if r.Religion == ZR then
      for _, bi in ipairs(r.Beliefs or {}) do
        local row = GameInfo.Beliefs[bi]
        out[#out + 1] = row and row.BeliefType or bi
      end
    end
  end
  return out
end
rec.before = P(beliefs)
if ZADD == 1 then
  rec.add = P(function() gr:AddBelief(ZF, b.Index) return true end)
end
rec.after = P(beliefs)
if ZSET == 1 then
  local u = P(function() return Players[ZP]:GetUnits():Create(GameInfo.Units["UNIT_SETTLER"].Index, ZX, ZY) end)
  rec.settler = type(u) == "table" or type(u) == "userdata"
  if rec.settler then rec.settlerId = u:GetID(); P(function() UnitManager.RestoreMovement(u) end) end
end
OUT(rec)
