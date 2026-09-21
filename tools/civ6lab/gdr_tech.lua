-- GameCore_Tuner: does TECH_ADVANCED_AI's +40 anti-air promotion apply to a
-- Giant Death Robot's INTERCEPTION, or only when it is itself attacked?
-- The promotion's requirements are PLAYER_IS_DEFENDER and OPPONENT_IS_AIR_UNIT,
-- which an interception arguably satisfies. Grants the tech to ZPLAYER, then
-- reports whether each GDR carries the promotion.
--   --set ZPLAYER=1 --set ZGRANT=1
local pl = Players[ZPLAYER]
local techs = pl:GetTechs()
local row = GameInfo.Technologies["TECH_ADVANCED_AI"]
local had = techs:HasTech(row.Index)
if ZGRANT == 1 and not had then pcall(function() techs:SetTech(row.Index, true) end) end
local promo = GameInfo.UnitPromotions["PROMOTION_GDR_AA_DEFENSE"]
local out = {}
for _, u in pl:GetUnits():Members() do
  if GameInfo.Units[u:GetType()].UnitType == "UNIT_GIANT_DEATH_ROBOT" then
    local ok, has = pcall(function() return u:GetExperience():HasPromotion(promo.Index) end)
    out[#out + 1] = "{\"id\":" .. u:GetID() .. ",\"at\":\"" .. u:GetX() .. ":" .. u:GetY()
      .. "\",\"aaBase\":" .. u:GetAntiAirCombat()
      .. ",\"hasAAPromotion\":" .. tostring(ok and has) .. "}"
  end
end
print("{\"kind\":\"gdrtech\",\"player\":" .. ZPLAYER .. ",\"hadAdvancedAI\":" .. tostring(had)
  .. ",\"hasNow\":" .. tostring(techs:HasTech(row.Index))
  .. ",\"gdrs\":[" .. table.concat(out, ",") .. "]}")
