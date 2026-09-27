-- Any state: the callable names of the global tables named in ZNAMES
-- (comma-separated, e.g. UnitManager,CombatManager,WorldBuilder).
--   --set ZNAMES=UnitManager,CombatManager
local function keys(label, o)
  if o == nil then print(label .. " = nil") return end
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
  print(label .. " [" .. #acc .. "] " .. table.concat(acc, " "))
end
local G = {UnitManager = UnitManager, CombatManager = CombatManager, WorldBuilder = WorldBuilder,
  PlayerManager = PlayerManager, Game = Game, Units = Units, UnitManagerWB = nil}
pcall(function() G.UnitManagerWB = WorldBuilder.UnitManager() end)
pcall(function() G.PlayerManagerWB = WorldBuilder.PlayerManager() end)
for n in string.gmatch("ZNAMES", "([%w_]+)") do keys(n, G[n]) end
