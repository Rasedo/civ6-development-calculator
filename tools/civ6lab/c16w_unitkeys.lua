-- Either state: the method names of player ZOWNER's first Spy (and of
-- UnitManager) that match ZPAT (lower-case find).
--   --set ZOWNER=1 --set ZPAT=spy
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
local spy = nil
for _, u in Players[ZOWNER]:GetUnits():Members() do
  if u:GetType() == GameInfo.Units["UNIT_SPY"].Index then spy = u end
end
for name, o in pairs({unit = spy, UnitManager = UnitManager, Diplomacy = Players[ZOWNER]:GetDiplomacy()}) do
  local hit = {}
  for _, k in ipairs(keys(o)) do if string.find(string.lower(k), "ZPAT") then hit[#hit + 1] = k end end
  print(name .. " [" .. #hit .. "] " .. table.concat(hit, " "))
end
