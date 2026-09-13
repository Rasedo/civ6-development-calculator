-- Give player 0's Spy one promotion (GameCore_Tuner) and report its level.
-- PROMO is substituted by lab.py --set. Every read is pcall'd: the GameCore
-- state binds fewer methods than the UI's, and a missing one should name
-- itself instead of aborting the snippet.
local spy = nil
for _, u in Players[0]:GetUnits():Members() do
  if GameInfo.Units[u:GetType()].UnitType == "UNIT_SPY" then spy = u end
end
if spy == nil then print("nospy") return end
local xp = spy:GetExperience()
local function try(label, f)
  local ok, v = pcall(f)
  print(label .. ": " .. (ok and tostring(v) or ("ERR " .. tostring(v))))
  return ok, v
end
try("before level", function() return xp:GetLevel() end)
try("before xp", function() return xp:GetExperiencePoints() end)
local promo = GameInfo.UnitPromotions["PROMO"]
if promo == nil then print("nopromo PROMO") return end
local ok = try("SetPromotion", function() xp:SetPromotion(promo.Index) return "done" end)
if not ok then
  try("ChangeExperience(100)", function() xp:ChangeExperience(100) return "done" end)
end
try("after level", function() return xp:GetLevel() end)
try("after has", function() return xp:HasPromotion(promo.Index) end)
