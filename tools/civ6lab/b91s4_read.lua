-- GameCore_Tuner (after lab_json.lua): B-91-S4 — every religious unit of
-- player ZP: id, type, plot, damage, religion, spread charges. One JSON line.
local out = {}
for _, u in Players[ZP]:GetUnits():Members() do
  local row = GameInfo.Units[u:GetType()]
  if row.ReligiousStrength and row.ReligiousStrength > 0 then
    out[#out + 1] = {id = u:GetID(), type = row.UnitType, x = u:GetX(), y = u:GetY(), dmg = u:GetDamage(),
      r = P(function() return u:GetReligion():GetReligionType() end),
      charges = P(function() return u:GetReligion():GetSpreadCharges() end)}
  end
end
OUT({kind = "religious_units", turn = Game.GetCurrentGameTurn(), p = ZP, units = out})
