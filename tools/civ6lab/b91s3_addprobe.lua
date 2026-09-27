-- GameCore_Tuner (after lab_json.lua): B-91-S3 — find AddBelief's argument
-- shape: religion ZR founded by ZF, belief ZBELIEF. Each shape is tried in
-- turn (optionally after ChangeNumBeliefsEarned(1) when ZEARN is 1) and the
-- religion's belief list read after each.
local gr = Game.GetReligion()
local b = GameInfo.Beliefs["ZBELIEF"]
local function beliefs()
  local out = {}
  for _, r in ipairs(gr:GetReligions()) do
    if r.Religion == ZR then
      for _, bi in ipairs(r.Beliefs or {}) do out[#out + 1] = GameInfo.Beliefs[bi] and GameInfo.Beliefs[bi].BeliefType or bi end
    end
  end
  return table.concat(out, ",")
end
local rec = {kind = "addprobe", before = beliefs()}
if ZEARN == 1 then rec.earn = P(function() Players[ZF]:GetReligion():ChangeNumBeliefsEarned(1) return true end) end
local shapes = {
  {"AddBelief(ZF, idx)", function() return gr:AddBelief(ZF, b.Index) end},
  {"AddBeliefHash(ZF, hash)", function() return gr:AddBeliefHash(ZF, b.Hash) end},
  {"AddBelief(ZR, idx)", function() return gr:AddBelief(ZR, b.Index) end},
  {"AddBeliefHash(ZR, hash)", function() return gr:AddBeliefHash(ZR, b.Hash) end},
  {"AddBelief(idx)", function() return gr:AddBelief(b.Index) end},
}
rec.tries = {}
for _, s in ipairs(shapes) do
  local v = P(s[2])
  local now = beliefs()
  rec.tries[#rec.tries + 1] = {s[1], v == nil and "nil" or v, now}
  if now ~= rec.before then break end
end
OUT(rec)
