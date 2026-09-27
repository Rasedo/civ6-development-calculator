-- Any state: the method names of player ZP's objects and first city/unit.
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
local P = Players[ZP]
local city = nil
for _, c in P:GetCities():Members() do city = c break end
keys("city", city)
keys("growth", city:GetGrowth())
keys("bq", city:GetBuildQueue())
keys("techs", P:GetTechs())
keys("culture", P:GetCulture())
keys("treasury", P:GetTreasury())
local u = nil
for _, x in P:GetUnits():Members() do u = x break end
keys("unit", u)
