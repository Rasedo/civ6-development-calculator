-- Either state: the method names of player 0's sub-objects (Diplomacy,
-- Culture, Stats, Treasury, Influence, Eras, the player itself) that match
-- ZPAT (a Lua pattern, lower-cased compare; "." for all).
--   --set ZPAT=wear
local function keys(o)
  local acc, seen = {}, {}
  local function add(t)
    if type(t) ~= "table" then return end
    for k, _ in pairs(t) do
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
  return acc
end
local p = Players[0]
local objs = {player = p}
for _, n in ipairs({"GetDiplomacy", "GetCulture", "GetStats", "GetTreasury", "GetInfluence", "GetEras", "GetUnits", "GetCities", "GetAi_Military", "GetGovernance"}) do
  local ok, o = pcall(function() return p[n](p) end)
  objs[n] = ok and o or nil
end
local ok, gd = pcall(function() return Game.GetGameDiplomacy() end)
if ok then objs.GameDiplomacy = gd end
for name, o in pairs(objs) do
  local hit = {}
  for _, k in ipairs(keys(o)) do
    if string.find(string.lower(k), "ZPAT") then hit[#hit + 1] = k end
  end
  print(name .. " [" .. #hit .. "] " .. table.concat(hit, " "))
end
