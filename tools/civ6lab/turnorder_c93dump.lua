-- Any state: the readers the C-93 LAB lines need — the method names of the
-- climate, great-people, eras and player objects, the DefenseTypes values,
-- and player ZP's research cost of techs ZTA and ZTB. Every read pcall'd.
--   --set ZP=0 --set ZTA=20 --set ZTB=19
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
  if ok then keys(label, v) else print(label .. " err:" .. tostring(v):sub(1, 80)) end
end
local function val(label, f)
  local ok, v = pcall(f)
  print(label .. " = " .. (ok and tostring(v) or ("err:" .. tostring(v):sub(1, 80))))
end
local P = Players[ZP]
try("GameClimate", function() return GameClimate end)
try("GreatPeople", function() return Game.GetGreatPeople() end)
try("Eras", function() return Game.GetEras() end)
try("player", function() return P end)
try("stats", function() return P:GetStats() end)
try("culture", function() return P:GetCulture() end)
try("diplomacy", function() return P:GetDiplomacy() end)
try("Game", function() return Game end)
try("GameConfiguration", function() return GameConfiguration end)
try("DefenseTypes", function() return DefenseTypes end)
val("DISTRICT_GARRISON", function() return DefenseTypes.DISTRICT_GARRISON end)
val("DISTRICT_OUTER", function() return DefenseTypes.DISTRICT_OUTER end)
val("costA", function() return P:GetTechs():GetResearchCost(ZTA) end)
val("costB", function() return P:GetTechs():GetResearchCost(ZTB) end)
val("sci", function() return P:GetTechs():GetScienceYield() end)
val("maxTurns", function() return Game.GetMaxGameTurns() end)
val("cfgMaxTurns", function() return GameConfiguration.GetMaxTurns() end)
val("turnLimitType", function() return GameConfiguration.GetTurnLimitType() end)
