-- Any state: the callable names on every object the per-turn dump reads, so
-- no reader is guessed. Walks the object and its metatable's __index.
local function keys(label, o)
  if o == nil then print(label .. " = nil") return end
  local acc, seen = {}, {}
  local function add(t)
    if type(t) ~= "table" then return end
    for k in pairs(t) do
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
local function try(label, f)
  local ok, v = pcall(f)
  if ok then keys(label, v) else print(label .. " err:" .. tostring(v)) end
end
local pl, city = nil, nil
for p = 0, 62 do
  local q = Players[p]
  if q ~= nil and q:IsAlive() and q:IsMajor() then
    pl = pl or q
    for _, c in q:GetCities():Members() do city = city or c end
  end
end
keys("Game", Game)
keys("Map", Map)
try("plot", function() return Map.GetPlotByIndex(0) end)
keys("player", pl)
try("treasury", function() return pl:GetTreasury() end)
try("techs", function() return pl:GetTechs() end)
try("culture", function() return pl:GetCulture() end)
try("preligion", function() return pl:GetReligion() end)
try("eras", function() return Game.GetEras() end)
try("peras", function() return pl:GetEras() end)
try("governors", function() return pl:GetGovernors() end)
try("influence", function() return pl:GetInfluence() end)
try("diplomacy", function() return pl:GetDiplomacy() end)
try("resources", function() return pl:GetResources() end)
try("stats", function() return pl:GetStats() end)
try("units", function() return pl:GetUnits() end)
try("favor", function() return pl:GetFavor() end)
try("religionMgr", function() return Game.GetReligion() end)
if city == nil then print("nocity") return end
keys("city", city)
try("growth", function() return city:GetGrowth() end)
try("citizens", function() return city:GetCitizens() end)
try("cculture", function() return city:GetCulture() end)
try("creligion", function() return city:GetReligion() end)
try("gold", function() return city:GetGold() end)
try("identity", function() return city:GetCulturalIdentity() end)
try("buildqueue", function() return city:GetBuildQueue() end)
try("buildings", function() return city:GetBuildings() end)
try("districts", function() return city:GetDistricts() end)
try("trade", function() return city:GetTrade() end)
try("cstrength", function() return city:GetStrengthValue() end)
for _, u in pl:GetUnits():Members() do keys("unit", u) break end
