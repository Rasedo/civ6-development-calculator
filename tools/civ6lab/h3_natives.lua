-- H-3, any state: the map-generation natives visible here, walked through
-- the metatable's __index (the tuner chunk has no _G / rawget).
local function keys(label, o)
  if o == nil then print(label .. " = nil") return end
  local acc, seen = {}, {}
  local function add(t)
    if type(t) ~= "table" then return end
    for k, v in pairs(t) do
      if type(k) == "string" and not seen[k] then seen[k] = true; acc[#acc + 1] = k .. ":" .. type(v) end
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
  print(label .. " (" .. type(o) .. ") [" .. #acc .. "] " .. table.concat(acc, " "))
end
local function S(label, f)
  local ok, v = pcall(f)
  if ok then keys(label, v) else print(label .. " err:" .. tostring(v)) end
end
S("TerrainBuilder", function() return TerrainBuilder end)
S("Fractal", function() return Fractal end)
S("AreaBuilder", function() return AreaBuilder end)
S("ResourceBuilder", function() return ResourceBuilder end)
S("FeatureBuilder", function() return FeatureBuilder end)
S("StartPositioner", function() return StartPositioner end)
S("MapConfiguration", function() return MapConfiguration end)
S("RiverManager", function() return RiverManager end)
S("math", function() return math end)
S("os", function() return os end)
S("Map", function() return Map end)
