-- InGame: every city's religion ledger — followers and pressure per religion,
-- the majority, and each major's own religion / majority-of-cities reading.
--   city:GetReligion():GetReligionsInCity() -> { {Religion=, Followers=, Pressure=}, ... }
--   city:GetReligion():GetMajorityReligion()
local function relname(i)
  if i == nil or i < 0 then return "none(" .. tostring(i) .. ")" end
  local r = GameInfo.Religions[i]
  return (r ~= nil and r.ReligionType or ("id" .. i))
end
print("turn " .. Game.GetCurrentGameTurn())
for p = 0, 62 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() then
    local pr = pl:GetReligion()
    local created, majcities = -1, -1
    if pr ~= nil then
      pcall(function() created = pr:GetReligionTypeCreated() end)
      pcall(function() majcities = pr:GetReligionInMajorityOfCities() end)
    end
    local any = false
    for _, city in pl:GetCities():Members() do
      local cr = city:GetReligion()
      if cr ~= nil then
        local parts = {}
        local ok, rows = pcall(function() return cr:GetReligionsInCity() end)
        if ok and type(rows) == "table" then
          for _, row in ipairs(rows) do
            parts[#parts + 1] = relname(row.Religion) .. ":f=" .. tostring(row.Followers) .. ",p=" .. tostring(row.Pressure)
          end
        end
        local maj = -1
        pcall(function() maj = cr:GetMajorityReligion() end)
        print("city p" .. p .. " " .. city:GetName() .. "#" .. city:GetID() .. "@" .. city:GetX() .. ":" .. city:GetY()
          .. " pop=" .. city:GetPopulation() .. " majority=" .. relname(maj)
          .. " [" .. table.concat(parts, " | ") .. "]")
        any = true
      end
    end
    if any or created >= 0 then
      print("player " .. p .. " created=" .. relname(created) .. " majorityOfCities=" .. relname(majcities))
    end
  end
end
