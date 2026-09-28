-- Any state: the method names of seat ZP's Governors object and of its
-- governor ZGI (a GameInfo.Governors index), walked through the metatable.
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
local g = Players[ZP]:GetGovernors()
keys("governors", g)
local ok, has, list = pcall(function() return g:GetGovernorList() end)
if ok and list then
  for _, x in ipairs(list) do
    if x:GetType() == ZGI then keys("governor", x) end
  end
end
