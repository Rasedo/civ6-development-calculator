-- InGame: scene C setup — wound the target city's centre to one hit from
-- falling and put a KNOWN damage on its Encampment, so the capture's effect on
-- that pool is visible. District damage is set from InGame (the city object
-- there answers GetDistricts():Members(); GameCore's does not).
--   pDistrict:SetDamage(DefenseTypes.DISTRICT_GARRISON, value)   [Debug/City.ltp]
--   --set ZP=1 --set ZCID=131073
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
  local function n(f) local ok, v = pcall(f); return tostring(ok and v or -1) end
  print("district " .. name .. "@" .. d:GetX() .. ":" .. d:GetY()
    .. " gar=" .. n(function() return d:GetDamage(DefenseTypes.DISTRICT_GARRISON) end)
    .. "/" .. n(function() return d:GetMaxDamage(DefenseTypes.DISTRICT_GARRISON) end)
    .. " out=" .. n(function() return d:GetDamage(DefenseTypes.DISTRICT_OUTER) end)
    .. "/" .. n(function() return d:GetMaxDamage(DefenseTypes.DISTRICT_OUTER) end))
end
