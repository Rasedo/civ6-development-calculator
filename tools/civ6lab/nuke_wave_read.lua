-- InGame: read ALL six clean-wave targets in one line, so a strike on one can
-- never hide a change in another. Population, existence and the city centre's
-- pillage state per target.
--   --set ZTAG=before-1
local T = {
  { x = 17, y = 25, tag = "nanmadol" },
  { x = 12, y = 23, tag = "montrose" },
  { x = 23, y = 26, tag = "tokyo" },
  { x = 18, y = 18, tag = "muscat" },
  { x = 30, y = 20, tag = "otsu" },
  { x = 22, y = 12, tag = "meroe" },
}
local parts = {}
for _, r in ipairs(T) do
  local c = Cities.GetCityInPlot(r.x, r.y)
  local pil = "-"
  if c ~= nil then
    for _, dd in c:GetDistricts():Members() do
      local t = GameInfo.Districts[dd:GetType()]
      if t ~= nil and t.DistrictType == "DISTRICT_CITY_CENTER" then pil = tostring(dd:IsPillaged()) end
    end
  end
  parts[#parts + 1] = "\"" .. r.tag .. "\":{\"pop\":" .. (c and c:GetPopulation() or -1)
    .. ",\"pillaged\":\"" .. pil .. "\"}"
end
print("{\"scene\":\"D\",\"kind\":\"wave\",\"stage\":\"ZTAG\",\"turn\":" .. Game.GetCurrentGameTurn()
  .. "," .. table.concat(parts, ",") .. "}")
