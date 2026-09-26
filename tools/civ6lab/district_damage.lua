-- GameCore_Tuner: set a city's district damage pools directly. The GameCore
-- city districts object has no Members(); it answers GetDistrictByType(idx)
-- and GetDistrictByIndex(i) / GetNumDistricts().
--   pDistrict:SetDamage(DefenseTypes.DISTRICT_GARRISON|DISTRICT_OUTER, value)
--   --set ZP=1 --set ZCID=131073 --set ZCGAR=195 --set ZCOUT=200 --set ZEGAR=40 --set ZEOUT=120
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
local ds = c:GetDistricts()
local function touch(typeName, gar, out)
  local row = GameInfo.Districts[typeName]
  local d = ds:GetDistrictByType(row.Index)
  if d == nil then print(typeName .. " absent") return end
  if gar >= 0 then pcall(function() d:SetDamage(DefenseTypes.DISTRICT_GARRISON, gar) end) end
  if out >= 0 then pcall(function() d:SetDamage(DefenseTypes.DISTRICT_OUTER, out) end) end
  local function n(f) local ok, v = pcall(f); return tri(ok, v) end
  print(typeName .. "@" .. d:GetX() .. ":" .. d:GetY()
    .. " gar=" .. n(function() return d:GetDamage(DefenseTypes.DISTRICT_GARRISON) end)
    .. "/" .. n(function() return d:GetMaxDamage(DefenseTypes.DISTRICT_GARRISON) end)
    .. " out=" .. n(function() return d:GetDamage(DefenseTypes.DISTRICT_OUTER) end)
    .. "/" .. n(function() return d:GetMaxDamage(DefenseTypes.DISTRICT_OUTER) end))
end
touch("DISTRICT_CITY_CENTER", ZCGAR, ZCOUT)
touch("DISTRICT_ENCAMPMENT", ZEGAR, ZEOUT)
