-- InGame: scene C setup — wound the target city's centre to one hit from
-- falling and put a KNOWN damage on its Encampment, so the capture's effect on
-- that pool is visible. District damage is set from InGame (the city object
-- there answers GetDistricts():Members(); GameCore's does not).
--   pDistrict:SetDamage(DefenseTypes.DISTRICT_GARRISON, value)   [Debug/City.ltp]
--   --set ZP=1 --set ZCID=131073
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
local c = Players[ZP]:GetCities():FindID(ZCID)
if c == nil then print("nocity") return end
for _, d in c:GetDistricts():Members() do
  local t = GameInfo.Districts[d:GetType()]
  local name = t and t.DistrictType or "?"
  if name == "DISTRICT_CITY_CENTER" then
    pcall(function() d:SetDamage(DefenseTypes.DISTRICT_OUTER, d:GetMaxDamage(DefenseTypes.DISTRICT_OUTER)) end)
    pcall(function() d:SetDamage(DefenseTypes.DISTRICT_GARRISON, d:GetMaxDamage(DefenseTypes.DISTRICT_GARRISON) - 5) end)
  elseif name == "DISTRICT_ENCAMPMENT" then
    pcall(function() d:SetDamage(DefenseTypes.DISTRICT_OUTER, 120) end)
    pcall(function() d:SetDamage(DefenseTypes.DISTRICT_GARRISON, 40) end)
  end
  local function n(f) local ok, v = pcall(f); return tri(ok, v) end
  print("district " .. name .. "@" .. d:GetX() .. ":" .. d:GetY()
    .. " gar=" .. n(function() return d:GetDamage(DefenseTypes.DISTRICT_GARRISON) end)
    .. "/" .. n(function() return d:GetMaxDamage(DefenseTypes.DISTRICT_GARRISON) end)
    .. " out=" .. n(function() return d:GetDamage(DefenseTypes.DISTRICT_OUTER) end)
    .. "/" .. n(function() return d:GetMaxDamage(DefenseTypes.DISTRICT_OUTER) end))
end
