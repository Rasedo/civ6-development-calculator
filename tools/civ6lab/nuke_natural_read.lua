-- InGame: read all eight natural-population targets in one line.
--   --set ZTAG=baseline
local T = {
  { x = 30, y = 20, tag = "otsu" },
  { x = 19, y = 14, tag = "napata" },
  { x = 17, y = 25, tag = "nanmadol" },
  { x = 12, y = 23, tag = "montrose" },
  { x = 26, y = 18, tag = "ngazargamu" },
  { x = 18, y = 18, tag = "muscat" },
  { x = 20, y = 29, tag = "okayama" },
  { x = 23, y = 26, tag = "tokyo" },
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
  -- housing is the hypothesis: a nuke wrecks the buildings and farms that
  -- supply it, and the population snaps down to whatever is left
  local hou, food = -1, -1
  if c ~= nil then
    pcall(function() hou = c:GetGrowth():GetHousing() end)
    pcall(function() food = c:GetGrowth():GetFoodSurplus() end)
  end
  parts[#parts + 1] = "\"" .. r.tag .. "\":{\"pop\":" .. (c and c:GetPopulation() or -1)
    .. ",\"housing\":" .. hou .. ",\"food\":" .. food
    .. ",\"pil\":\"" .. pil .. "\"}"
end
print("{\"scene\":\"D\",\"kind\":\"natural\",\"stage\":\"ZTAG\",\"turn\":" .. Game.GetCurrentGameTurn()
  .. "," .. table.concat(parts, ",") .. "}")
