-- Any state: the event names on GameEvents and Events (a table, or userdata
-- with a metatable whose __index carries the names), one line each.
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
  print(label .. " [" .. #acc .. "]")
  local line = {}
  for i, k in ipairs(acc) do
    line[#line + 1] = k
    if #line == 12 then print("  " .. table.concat(line, " ")); line = {} end
  end
  if #line > 0 then print("  " .. table.concat(line, " ")) end
end
local okG, G = pcall(function() return GameEvents end)
keys("GameEvents", okG and G or nil)
local okE, E = pcall(function() return Events end)
keys("Events", okE and E or nil)
local okL, L = pcall(function() return LuaEvents end)
keys("LuaEvents", okL and L or nil)
