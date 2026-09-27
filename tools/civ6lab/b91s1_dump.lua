-- Any state: B-91-S1 — the method names on the religion objects (a city's,
-- a player's, the game's) and on a unit's, so a religion setter is found, not
-- guessed. City: the first city of player ZP.
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
local pl = Players[ZP]
local c = nil
for _, x in pl:GetCities():Members() do c = x break end
keys("city:GetReligion()", c and c:GetReligion())
keys("player:GetReligion()", pl:GetReligion())
keys("Game.GetReligion()", Game.GetReligion and Game.GetReligion())
local u = nil
for _, x in pl:GetUnits():Members() do u = x break end
keys("unit:GetReligion()", u and u:GetReligion())
keys("unit:GetGreatPerson()", u and u:GetGreatPerson())
keys("Game.GetGreatPeople()", Game.GetGreatPeople and Game.GetGreatPeople())
keys("player:GetTechs()", pl:GetTechs())
keys("player:GetCulture()", pl:GetCulture())
