-- GameCore_Tuner: what did the tribal village pay, and what did it cost the rng
-- stream? Reads the hut plot, the mover's position, player 0's balances and the
-- rng state, so the reward category is visible (gold and faith move directly, a
-- MILITARY or SURVIVORS reward adds a unit) and the draws consumed can be
-- counted by stepping the LCG outside the game.
--   --set ZX=37 --set ZY=16 --set ZUNIT=131073 --set ZTAG=after
-- a pcall read in three states: its value, or "err:<msg>" when the call threw
local function tri(ok, v)
  local s = ok and tostring(v) or ("err:" .. tostring(v))
  return (s:gsub('[%c"\\]', function(c) return string.format("\\u%04x", c:byte()) end))
end
local function trij(ok, v)
  if ok and (type(v) == "boolean" or type(v) == "number") then return tostring(v) end
  if ok and v == nil then return "null" end
  return "\"" .. tri(ok, v) .. "\""
end
local p0 = Players[0]
local q = Map.GetPlot(ZX, ZY)
local imp = q:GetImprovementType()
local impRow = imp >= 0 and GameInfo.Improvements[imp] or nil
local u = nil
for _, x in p0:GetUnits():Members() do if x:GetID() == ZUNIT then u = x end end
local n = 0
local hist = {}
for _, x in p0:GetUnits():Members() do
  n = n + 1
  local t = GameInfo.Units[x:GetType()].UnitType:gsub("UNIT_", "")
  hist[t] = (hist[t] or 0) + 1
end
local parts = {}
for k, v in pairs(hist) do parts[#parts + 1] = k .. ":" .. v end
table.sort(parts)
print("{\"kind\":\"goodyread\",\"stage\":\"ZTAG\",\"turn\":" .. Game.GetCurrentGameTurn()
  .. ",\"hutPlot\":\"" .. ZX .. ":" .. ZY .. "\""
  .. ",\"hutImprovement\":\"" .. (impRow and impRow.ImprovementType or "none") .. "\""
  .. ",\"moverAt\":\"" .. (u and (u:GetX() .. ":" .. u:GetY()) or "gone") .. "\""
  .. ",\"gold\":" .. string.format("%.2f", p0:GetTreasury():GetGoldBalance())
  .. ",\"faith\":" .. string.format("%.2f", p0:GetReligion():GetFaithBalance())
  .. ",\"units\":" .. n
  .. ",\"hist\":\"" .. table.concat(parts, " ") .. "\""
  .. ",\"science\":" .. trij(pcall(function() return p0:GetTechs():GetScienceYield() end))
  .. ",\"culture\":" .. trij(pcall(function() return p0:GetCulture():GetCultureYield() end))
  .. ",\"seed\":" .. tostring(Game.GetRandomSeed()) .. "}")
