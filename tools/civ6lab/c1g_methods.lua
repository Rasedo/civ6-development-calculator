-- Any state: the method names of Players[0]:GetGovernors() and of one governor.
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
local g = Players[0]:GetGovernors()
keys("governors", g)
local ok, list = pcall(function() return g:GetGovernorList() end)
if ok and list and list[1] then keys("governor", list[1]) end
print("points", pcall(function() return g:GetGovernorPoints() end))
