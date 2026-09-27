local f = Fractal.Create(8, 8, 2, {}, -1, -1)
local acc = {}
local function add(tag, t) if type(t) == "table" then for k, v in pairs(t) do acc[#acc + 1] = tag .. tostring(k) .. ":" .. type(v) end end end
print("type " .. type(f))
add("f.", f)
local mt = getmetatable(f)
print("mt " .. type(mt))
if type(mt) == "table" then add("mt.", mt); local ok, idx = pcall(function() return mt["__index"] end); if ok then print("idx " .. type(idx)); add("idx.", idx) end end
add("Fractal.", Fractal)
add("TerrainBuilder.", TerrainBuilder)
add("AreaBuilder.", AreaBuilder)
table.sort(acc)
for _, s in ipairs(acc) do print(s) end
print("flags " .. (function() local t = TerrainBuilder.GetFractalFlags(); local o = {}; for k, v in pairs(t) do o[#o+1] = tostring(k) .. "=" .. tostring(v) end; return table.concat(o, ",") end)())
