-- Any state: print the callable names of the objects the population question
-- needs, so no reader is guessed. Civ6's script objects are tables or userdata
-- with a metatable whose __index carries the methods; both are walked.
--   --set ZCX=36 --set ZCY=22
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
local c = nil
if Cities ~= nil and Cities.GetCityInPlot ~= nil then c = Cities.GetCityInPlot(ZCX, ZCY) end
if c == nil then
  for _, pl in ipairs(Players) do
    local ok, cs = pcall(function() return pl:GetCities() end)
    if ok and cs ~= nil then
      for _, x in cs:Members() do
        if x:GetX() == ZCX and x:GetY() == ZCY then c = x end
      end
    end
  end
end
if c == nil then print("nocity") return end
keys("city", c)
keys("citizens", c:GetCitizens())
keys("growth", c:GetGrowth())
local p = Map.GetPlot(ZCX, ZCY)
keys("plot", p)
keys("falloutManager", Game.GetFalloutManager and Game.GetFalloutManager() or nil)
