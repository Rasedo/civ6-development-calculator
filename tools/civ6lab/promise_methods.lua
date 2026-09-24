-- Any state: the Diplomacy object's methods and the global managers' names
-- that mention a promise, a demand, a session or a grievance — so a scene
-- that must MAKE a Don't-Settle-Near-Me promise uses a reader that exists.
local pat = {"Promise", "Demand", "Session", "Grievance", "Settle"}
local function hit(k)
  for _, p in ipairs(pat) do if k:find(p) then return true end end
  return false
end
local function keys(label, o)
  if o == nil then print(label .. " = nil") return end
  local acc, seen = {}, {}
  local function add(t)
    if type(t) ~= "table" then return end
    for k in pairs(t) do if type(k) == "string" and not seen[k] and hit(k) then seen[k] = true; acc[#acc + 1] = k end end
  end
  add(o)
  local mt = getmetatable(o)
  if type(mt) == "table" then
    add(mt)
    local ok, idx = pcall(function() return mt["__index"] end)
    if ok then add(idx) end
  end
  table.sort(acc)
  print(label .. ": " .. table.concat(acc, " "))
end
keys("Diplomacy", Players[0]:GetDiplomacy())
keys("DiplomacyManager", DiplomacyManager)
local g = {}
for k in pairs(_G) do if type(k) == "string" and hit(k) then g[#g + 1] = k end end
table.sort(g)
print("globals: " .. table.concat(g, " "))
if PromiseTypes then
  local t = {}
  for k, v in pairs(PromiseTypes) do t[#t + 1] = k .. "=" .. tostring(v) end
  print("PromiseTypes: " .. table.concat(t, " "))
end
