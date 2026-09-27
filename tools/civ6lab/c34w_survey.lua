-- InGame: every AIR-domain unit of players ZPLAYERS (comma list) with its
-- plot, activity, damage, XP and moves; the war state between the pairs; the
-- local player. One JSON line per unit.
--   --set ZPLAYERS=0,6
local actName = {}
for k, v in pairs(ActivityTypes or {}) do actName[v] = k end
local function tri(f)
  local ok, v = pcall(f)
  if not ok then return '"err:' .. tostring(v):gsub('"', "'") .. '"' end
  if v == nil then return "null" end
  if type(v) == "number" or type(v) == "boolean" then return tostring(v) end
  return '"' .. tostring(v) .. '"'
end
print('{"kind":"local","turn":' .. Game.GetCurrentGameTurn() .. ',"local":' .. Game.GetLocalPlayer() .. '}')
local ps = {}
for p in string.gmatch("ZPLAYERS", "(%d+)") do ps[#ps + 1] = tonumber(p) end
for _, a in ipairs(ps) do
  for _, b in ipairs(ps) do
    if a < b then
      print('{"kind":"war","a":' .. a .. ',"b":' .. b .. ',"atWar":' .. tri(function() return Players[a]:GetDiplomacy():IsAtWarWith(b) end) .. '}')
    end
  end
  for _, u in Players[a]:GetUnits():Members() do
    local d = GameInfo.Units[u:GetType()]
    if d.Domain == "DOMAIN_AIR" then
      print('{"kind":"air","p":' .. a .. ',"id":' .. u:GetID() .. ',"type":"' .. d.UnitType .. '","x":' .. u:GetX()
        .. ',"y":' .. u:GetY() .. ',"dmg":' .. u:GetDamage() .. ',"moves":' .. u:GetMovesRemaining()
        .. ',"activity":"' .. tostring(actName[UnitManager.GetActivityType(u)] or UnitManager.GetActivityType(u)) .. '"'
        .. ',"xp":' .. tri(function() return u:GetExperience():GetExperiencePoints() end)
        .. ',"level":' .. tri(function() return u:GetExperience():GetLevel() end)
        .. ',"combat":' .. d.Combat .. ',"ranged":' .. d.RangedCombat .. ',"bombard":' .. d.Bombard .. '}')
    end
  end
end
