-- GameCore_Tuner: experience, level and health of every unit of ZPLAYER within
-- 2 of a plot. Experience is the question: GlobalParameters ships only FIXED
-- amounts (EXPERIENCE_KILL_BONUS 2, EXPERIENCE_COMBAT_RANGED 1,
-- EXPERIENCE_MAXIMUM_ONE_COMBAT 8 in Expansion2, ...) with no range anywhere,
-- so the prediction is that repeated combats at different seeds -- hence at
-- different DAMAGE -- award exactly the same experience.
--   --set ZPLAYER=1 --set ZX=36 --set ZY=15
local pl = Players[ZPLAYER]
local out = {}
for _, u in pl:GetUnits():Members() do
  if Map.GetPlotDistance(ZX, ZY, u:GetX(), u:GetY()) <= 2 then
    local xp, lvl = -1, -1
    pcall(function()
      local e = u:GetExperience()
      xp = e:GetExperiencePoints()
      lvl = e:GetLevel()
    end)
    out[#out + 1] = "{\"id\":" .. u:GetID() .. ",\"t\":\"" .. GameInfo.Units[u:GetType()].UnitType
      .. "\",\"at\":\"" .. u:GetX() .. ":" .. u:GetY() .. "\""
      .. ",\"hp\":" .. (u:GetMaxDamage() - u:GetDamage())
      .. ",\"xp\":" .. xp .. ",\"level\":" .. lvl .. "}"
  end
end
print("{\"kind\":\"xpread\",\"player\":" .. ZPLAYER .. ",\"units\":[" .. table.concat(out, ",") .. "]}")
