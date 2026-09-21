-- InGame: the LIGHT poller for the scene-D content wave — populations and the
-- centre's pillage flag only. blast_content.lua walks every plot and is far
-- too slow to poll a hundred times while the WMD queue drains.
--   --set ZTAG=poll1
local T = {
  { x = 20, y = 29, tag = "okayama" }, { x = 26, y = 28, tag = "osaka" },
  { x = 26, y = 32, tag = "nagoya" },  { x = 30, y = 20, tag = "otsu" },
  { x = 22, y = 12, tag = "meroe" },   { x = 19, y = 14, tag = "napata" },
  { x = 13, y = 19, tag = "dundee" },  { x = 12, y = 23, tag = "montrose" },
  { x = 26, y = 18, tag = "ngazargamu" }, { x = 17, y = 25, tag = "nanmadol" },
  { x = 18, y = 18, tag = "muscat" },  { x = 29, y = 29, tag = "akkad" },
}
local parts = {}
for _, r in ipairs(T) do
  local c = Cities.GetCityInPlot(r.x, r.y)
  local pil = "-"
  if c ~= nil then
    for _, d in c:GetDistricts():Members() do
      local t = GameInfo.Districts[d:GetType()]
      if t ~= nil and t.DistrictType == "DISTRICT_CITY_CENTER" then pil = tostring(d:IsPillaged()) end
    end
  end
  parts[#parts + 1] = "\"" .. r.tag .. "\":{\"pop\":" .. (c and c:GetPopulation() or -1) .. ",\"pil\":\"" .. pil .. "\"}"
end
print("{\"scene\":\"D\",\"kind\":\"pops\",\"stage\":\"ZTAG\",\"turn\":" .. Game.GetCurrentGameTurn()
  .. "," .. table.concat(parts, ",") .. "}")
