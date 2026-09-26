-- Any state: the callable names of a few objects, walked through the
-- metatable's __index. ZP = a major, ZCX/ZCY = one of its cities.
local function keys(label, o)
  if o == nil then print(label .. " = nil") return end
  local acc, seen = {}, {}
  local function add(t)
    if type(t) ~= "table" then return end
    for k, v in pairs(t) do
      if type(k) == "string" and not seen[k] then seen[k] = true; acc[#acc + 1] = k end
    end
  end
  add(o)
  local mt = getmetatable(o)
  if type(mt) == "table" then
    add(mt)
    local okx, idx = pcall(function() return mt["__index"] end)
    if okx then add(idx) end
  end
  table.sort(acc)
  print(label .. " [" .. #acc .. "] " .. table.concat(acc, " "))
end
local pl = Players[ZP]
local c = nil
for _, x in pl:GetCities():Members() do
  if x:GetX() == ZCX and x:GetY() == ZCY then c = x end
end
local function S(label, f)
  local ok, v = pcall(f)
  if ok then keys(label, v) else print(label .. " err:" .. tostring(v)) end
end
S("city", function() return c end)
S("city:GetReligion", function() return c:GetReligion() end)
S("city:GetBuildings", function() return c:GetBuildings() end)
S("city:GetBuildQueue", function() return c:GetBuildQueue() end)
S("player", function() return pl end)
S("player:GetCulture", function() return pl:GetCulture() end)
S("player:GetReligion", function() return pl:GetReligion() end)
S("player:GetTechs", function() return pl:GetTechs() end)
S("player:GetDiplomacy", function() return pl:GetDiplomacy() end)
S("player:GetInfluence", function() return pl:GetInfluence() end)
S("player:GetGreatPeoplePoints", function() return pl:GetGreatPeoplePoints() end)
S("player:GetStats", function() return pl:GetStats() end)
S("Game", function() return Game end)
S("Game.GetEras", function() return Game.GetEras() end)
S("Game.GetReligion", function() return Game.GetReligion() end)
S("Game.GetGreatPeople", function() return Game.GetGreatPeople() end)
S("GameRandomEvents", function() return GameRandomEvents end)
S("WorldBuilder.CityManager", function() return WorldBuilder.CityManager() end)
S("WorldBuilder.PlayerManager", function() return WorldBuilder.PlayerManager() end)
S("WorldBuilder.MapManager", function() return WorldBuilder.MapManager() end)
