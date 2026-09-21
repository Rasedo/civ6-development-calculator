-- GameCore_Tuner: the weakest interceptor the game allows.
-- Units_XP2 (the Gathering Storm table, which OVERRIDES Units) says the
-- Destroyer and the Missile Cruiser pay RESOURCE_OIL 1 per turn, and
-- COMBAT_STRENGTH_REDUCTION_INSUFFICIENT_FUEL = 20 is the penalty for not
-- paying it -- twice what being nearly dead costs. Sets the owner's stockpile
-- and the unit's health, and reports both so the preview's damage can be read
-- against a known strength.
--   --set ZPLAYER=1 --set ZUNIT=123 --set ZHP=1 --set ZOIL=0
local pl = Players[ZPLAYER]
local res = pl:GetResources()
local before = {}
for r in GameInfo.Resources() do
  if r.ResourceClassType == "RESOURCECLASS_STRATEGIC" then
    local ok, have = pcall(function() return res:GetResourceAmount(r.Index) end)
    if ok and have ~= nil and have ~= 0 then
      before[#before + 1] = "\"" .. r.ResourceType:gsub("RESOURCE_", "") .. "\":" .. have
    end
  end
end
local oil = GameInfo.Resources["RESOURCE_OIL"]
local haveOil = 0
pcall(function() haveOil = res:GetResourceAmount(oil.Index) end)
if ZOIL >= 0 and haveOil ~= ZOIL then
  pcall(function() res:ChangeResourceAmount(oil.Index, ZOIL - haveOil) end)
end
local u = pl:GetUnits():FindID(ZUNIT)
if u ~= nil and ZHP > 0 then pcall(function() u:SetDamage(u:GetMaxDamage() - ZHP) end) end
local nowOil = 0
pcall(function() nowOil = res:GetResourceAmount(oil.Index) end)
print("{\"kind\":\"fuel\",\"player\":" .. ZPLAYER
  .. ",\"stockBefore\":{" .. table.concat(before, ",") .. "}"
  .. ",\"oilNow\":" .. nowOil
  .. ",\"unit\":" .. (u and u:GetID() or -1)
  .. ",\"type\":\"" .. (u and GameInfo.Units[u:GetType()].UnitType or "-") .. "\""
  .. ",\"hp\":" .. (u and (u:GetMaxDamage() - u:GetDamage()) or -1)
  .. ",\"aaBase\":" .. (u and u:GetAntiAirCombat() or -1) .. "}")
