-- InGame: B-87-S1's reads for seat ZP. Its era score (`GetPlayerCurrentScore`),
-- golden / dark age flags, the moments it holds (count, and the last few:
-- type, era score, turn), and per city the culture-building candidates it
-- has (HasBuilding) with their Great Work slots from the live DB. Every read
-- prints its value or "err:<msg>".
--   --set ZP=2
local function tri(ok, v)
  local s = ok and tostring(v) or ("err:" .. tostring(v):match("[^\n]*"))
  return (s:gsub('[%c"\\]', function(c) return string.format("\\u%04x", c:byte()) end))
end
local P = ZP
local eras = Game.GetEras()
local out = {"turn=" .. Game.GetCurrentGameTurn(), "p=" .. P}
local function r(name, f) local ok, v = pcall(f); out[#out + 1] = name .. "=" .. tri(ok, v) end
r("score", function() return eras:GetPlayerCurrentScore(P) end)
r("golden", function() return eras:HasGoldenAge(P) end)
r("dark", function() return eras:HasDarkAge(P) end)
r("era", function() return eras:GetCurrentEra() end)
print(table.concat(out, " "))
local okm, moments = pcall(function() return Game.GetHistoryManager():GetAllMomentsData(P, 1) end)
if okm and type(moments) == "table" then
  print("moments " .. #moments)
  for i = math.max(1, #moments - 4), #moments do
    local m = moments[i]
    local def = GameInfo.Moments[m.Type]
    print(string.format("moment %s score %s turn %s", def and def.MomentType or tostring(m.Type), tostring(m.EraScore), tostring(m.Turn)))
  end
else
  print("moments " .. tri(okm, moments))
end
local watch = {"BUILDING_MONUMENT", "BUILDING_AMPHITHEATER", "BUILDING_MARAE", "BUILDING_SHRINE", "BUILDING_TEMPLE",
  "BUILDING_MUSEUM_ART", "BUILDING_MUSEUM_ARTIFACT", "BUILDING_STAVE_CHURCH", "BUILDING_CATHEDRAL"}
local slots = {}
for row in GameInfo.Building_GreatWorks() do slots[row.BuildingType] = (slots[row.BuildingType] or 0) + (row.NumSlots or 1) end
for _, c in Players[P]:GetCities():Members() do
  local have = {}
  for _, n in ipairs(watch) do
    local def = GameInfo.Buildings[n]
    if def ~= nil then
      local ok, h = pcall(function() return c:GetBuildings():HasBuilding(def.Index) end)
      have[#have + 1] = n:sub(10) .. "=" .. tri(ok, h) .. "/" .. tostring(slots[n] or 0)
    end
  end
  print(string.format("city %d %s %d:%d %s", c:GetID(), c:GetName(), c:GetX(), c:GetY(), table.concat(have, " ")))
end
