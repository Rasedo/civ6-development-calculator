-- Any state: the build queue's own names. Ask 4 (reactor accidents) needs a
-- Nuclear Power Plant to exist, and the cheapest route is whatever the queue
-- exposes for progress; the city panel's district/building placement is a
-- CityOperationTypes.BUILD request, but a finished district needs production.
--   --set ZCX=36 --set ZCY=22
local function keys(label, o)
  if o == nil then print(label .. " = nil") return end
  local acc = {}
  local mt = getmetatable(o)
  local okx, idx = pcall(function() return mt and mt["__index"] end)
  local src = (okx and type(idx) == "table") and idx or o
  for k, v in pairs(src) do if type(k) == "string" then acc[#acc + 1] = k end end
  table.sort(acc)
  print(label .. " [" .. #acc .. "] " .. table.concat(acc, " "))
end
local c = nil
local okc, cs = pcall(function() return Cities.GetCityInPlot(ZCX, ZCY) end)
if okc and cs ~= nil then c = cs end
if c == nil then
  for _, pl in ipairs(Players) do
    local ok, list = pcall(function() return pl:GetCities() end)
    if ok and list ~= nil then
      for _, x in list:Members() do if x:GetX() == ZCX and x:GetY() == ZCY then c = x end end
    end
  end
end
if c == nil then print("nocity") return end
keys("buildQueue", c:GetBuildQueue())
keys("buildings", c:GetBuildings())
keys("districts", c:GetDistricts())
keys("player", Players[0])
