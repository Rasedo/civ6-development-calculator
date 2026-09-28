-- InGame (after lab_json.lua): C-34 / B-89 — a seat's XP-percent sources.
-- Seat ZP: its leader, civ, government and slotted policies (each with the
-- policy's modifiers whose type adjusts unit experience); every unit of type
-- ZUNIT with its experience points, level and the Experience object's method
-- names; the local seat's handicap.
local p = Players[ZP]
local cfg = PlayerConfigurations[ZP]
local rec = {kind = "xpseat", seat = ZP, leader = cfg:GetLeaderTypeName(), civ = cfg:GetCivilizationTypeName(),
  handicap = P(function() return GameInfo.Difficulties[cfg:GetHandicapTypeID()].DifficultyType end),
  human = p:IsHuman()}
local cu = p:GetCulture()
rec.gov = P(function() local g = cu:GetCurrentGovernment() return g >= 0 and GameInfo.Governments[g].GovernmentType or g end)
rec.policies = {}
local n = P(function() return cu:GetNumPolicySlots() end)
if type(n) == "number" then
  for i = 0, n - 1 do
    local pol = P(function() return cu:GetSlotPolicy(i) end)
    if type(pol) == "number" and pol >= 0 then
      local row = GameInfo.Policies[pol]
      local xp = {}
      for pm in GameInfo.PolicyModifiers() do
        if pm.PolicyType == row.PolicyType then
          local m = GameInfo.Modifiers[pm.ModifierId]
          if m and string.find(m.ModifierType, "EXPERIENCE") then xp[#xp + 1] = pm.ModifierId .. ":" .. m.ModifierType end
        end
      end
      rec.policies[#rec.policies + 1] = {slot = i, policy = row.PolicyType, xp = xp}
    end
  end
end
rec.units = {}
for _, u in p:GetUnits():Members() do
  local t = GameInfo.Units[u:GetType()].UnitType
  if t == "ZUNIT" then
    local e = u:GetExperience()
    rec.units[#rec.units + 1] = {id = u:GetID(), x = u:GetX(), y = u:GetY(),
      xp = P(function() return e:GetExperiencePoints() end), level = P(function() return e:GetLevel() end),
      next = P(function() return e:GetExperienceForNextLevel() end)}
  end
end
local e1
for _, u in p:GetUnits():Members() do e1 = u:GetExperience() break end
if e1 then
  local acc, seen = {}, {}
  local mt = getmetatable(e1)
  local function add(t) if type(t) == "table" then for k in pairs(t) do if type(k) == "string" and not seen[k] then seen[k] = true acc[#acc + 1] = k end end end end
  add(mt)
  if type(mt) == "table" then local ok, ix = pcall(function() return mt["__index"] end) if ok then add(ix) end end
  table.sort(acc)
  rec.expMethods = acc
end
OUT(rec)
