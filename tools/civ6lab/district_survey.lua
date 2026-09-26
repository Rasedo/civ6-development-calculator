-- InGame: every city that owns an ENCAMPMENT (or any district named by ZD),
-- with the city centre's and the district's damage pools. Scene C's scouting.
--   --set ZD=DISTRICT_ENCAMPMENT
-- a pcall read in three states: its value, or "err:<msg>" when the call threw
local function tri(ok, v)
  local s = ok and tostring(v) or ("err:" .. tostring(v))
  return (s:gsub('[%c"\\]', function(c) return string.format("\\u%04x", c:byte()) end))
end
local function trij(ok, v)
  if ok and (type(v) == "boolean" or type(v) == "number") then return tostring(v) end
  if ok and v == nil then return "null" end
  return "\"" .. tri(ok, v) .. "\""
end
for p = 0, 62 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() then
    for _, c in pl:GetCities():Members() do
      local has = false
      for _, d in c:GetDistricts():Members() do
        local t = GameInfo.Districts[d:GetType()]
        if t ~= nil and t.DistrictType == "ZD" then has = true end
      end
      if has then
        local parts = {}
        for _, d in c:GetDistricts():Members() do
          local t = GameInfo.Districts[d:GetType()]
          local function n(f) local ok, v = pcall(f); return tri(ok, v) end
          parts[#parts + 1] = (t and t.DistrictType or "?") .. "@" .. d:GetX() .. ":" .. d:GetY()
            .. " def=" .. n(function() return d:GetDefenseStrength() end)
            .. " gar=" .. n(function() return d:GetDamage(DefenseTypes.DISTRICT_GARRISON) end)
            .. "/" .. n(function() return d:GetMaxDamage(DefenseTypes.DISTRICT_GARRISON) end)
            .. " out=" .. n(function() return d:GetDamage(DefenseTypes.DISTRICT_OUTER) end)
            .. "/" .. n(function() return d:GetMaxDamage(DefenseTypes.DISTRICT_OUTER) end)
        end
        print("p" .. p .. " " .. c:GetName() .. "#" .. c:GetID() .. "@" .. c:GetX() .. ":" .. c:GetY()
          .. " pop=" .. c:GetPopulation() .. " | " .. table.concat(parts, " | "))
      end
    end
  end
end
