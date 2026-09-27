-- GameCore (after lab_json.lua): B-91 colonization at population >= 2.
-- ZADD 1: AddBelief(ZP, BELIEF_RELIGIOUS_COLONIZATION) to ZP's founded religion.
-- ZMOD n: attach n copies of COMMEMORATION_EXPLORATION_GA_NEW_CITY_POPULATION to ZP (a city
-- founded off the capital's continent in a golden age starts larger).
-- Then a Settler for ZP at ZX,ZY with its moves restored.
local gr = Game.GetReligion()
local pl = Players[ZP]
local rel = pl:GetReligion():GetReligionTypeCreated()
local rec = {kind = "rig", p = ZP, rel = rel, add = ZADD, mod = ZMOD, x = ZX, y = ZY}
local function beliefs()
  local out = {}
  for _, r in ipairs(gr:GetReligions()) do
    if r.Religion == rel then
      for _, bi in ipairs(r.Beliefs or {}) do
        local row = GameInfo.Beliefs[bi]
        out[#out + 1] = row and row.BeliefType or bi
      end
    end
  end
  return out
end
if ZADD == 1 then
  rec.addCall = P(function() gr:AddBelief(ZP, GameInfo.Beliefs["BELIEF_RELIGIOUS_COLONIZATION"].Index) return true end)
end
rec.beliefs = P(beliefs)
rec.attach = {}
for k = 1, ZMOD do
  rec.attach[k] = P(function() return pl:AttachModifierByID("COMMEMORATION_EXPLORATION_GA_NEW_CITY_POPULATION") end)
end
local u = P(function() return pl:GetUnits():Create(GameInfo.Units["UNIT_SETTLER"].Index, ZX, ZY) end)
rec.settler = (type(u) == "table" or type(u) == "userdata") and u:GetID() or tostring(u)
if type(rec.settler) == "number" then P(function() UnitManager.RestoreMovement(u) end) end
OUT(rec)
