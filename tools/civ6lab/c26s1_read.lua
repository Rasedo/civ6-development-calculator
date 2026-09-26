-- InGame: C-26-S1's read. For every city of seat ZP (and the city at ZX:ZY
-- whoever owns it, when ZX >= 0): owner, original owner, capital flag and
-- every building it holds (HasBuilding over GameInfo.Buildings), one line
-- per city.
--   --set ZP=0 --set ZX=-1 --set ZY=-1
local function line(c)
  local have = {}
  local b = c:GetBuildings()
  for row in GameInfo.Buildings() do
    local ok, h = pcall(function() return b:HasBuilding(row.Index) end)
    if ok and h then have[#have + 1] = row.BuildingType:sub(10) elseif not ok then have[#have + 1] = row.BuildingType:sub(10) .. "=err" end
  end
  print(string.format("city t%d owner %d orig %d id %d %s %d:%d capital %s pop %d: %s", Game.GetCurrentGameTurn(),
    c:GetOwner(), c:GetOriginalOwner(), c:GetID(), c:GetName(), c:GetX(), c:GetY(), tostring(c:IsCapital()),
    c:GetPopulation(), table.concat(have, ",")))
end
for _, c in Players[ZP]:GetCities():Members() do line(c) end
if ZX >= 0 then
  local c = CityManager.GetCityAt(ZX, ZY)
  if c ~= nil and c:GetOwner() ~= ZP then line(c) end
end
