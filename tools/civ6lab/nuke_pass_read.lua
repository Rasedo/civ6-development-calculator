-- InGame: read every target city of the scene-D pass after the strikes.
-- One JSON line per row: the population left, whether the city still exists,
-- and the city centre's pillage state.
--   --set ZTAG=after-pass
local PLAN = {
  { x = 23, y = 26, owner = 1, pop = 18, d = 0, wmd = "WMD_THERMONUCLEAR_DEVICE", tag = "pop18-d0-thermo" },
  { x = 20, y = 29, owner = 1, pop = 12, d = 0, wmd = "WMD_THERMONUCLEAR_DEVICE", tag = "pop12-d0-thermo" },
  { x = 26, y = 28, owner = 1, pop = 8,  d = 0, wmd = "WMD_THERMONUCLEAR_DEVICE", tag = "pop8-d0-thermo" },
  { x = 26, y = 32, owner = 1, pop = 4,  d = 0, wmd = "WMD_THERMONUCLEAR_DEVICE", tag = "pop4-d0-thermo" },
  { x = 19, y = 14, owner = 2, pop = 16, d = 0, wmd = "WMD_THERMONUCLEAR_DEVICE", tag = "pop16-d0-thermo" },
  { x = 30, y = 20, owner = 1, pop = 20, d = 0, wmd = "WMD_THERMONUCLEAR_DEVICE", tag = "pop20-d0-thermo" },
  { x = 17, y = 25, owner = 6, pop = 12, d = 1, wmd = "WMD_THERMONUCLEAR_DEVICE", tag = "pop12-d1-thermo" },
  { x = 18, y = 18, owner = 9, pop = 12, d = 2, wmd = "WMD_THERMONUCLEAR_DEVICE", tag = "pop12-d2-thermo" },
  { x = 26, y = 18, owner = 4, pop = 12, d = 3, wmd = "WMD_THERMONUCLEAR_DEVICE", tag = "pop12-d3-thermo" },
  { x = 12, y = 23, owner = 3, pop = 12, d = 0, wmd = "WMD_NUCLEAR_DEVICE", tag = "pop12-d0-nuclear" },
  { x = 13, y = 19, owner = 3, pop = 12, d = 1, wmd = "WMD_NUCLEAR_DEVICE", tag = "pop12-d1-nuclear" },
  { x = 22, y = 12, owner = 2, pop = 6,  d = 0, wmd = "WMD_NUCLEAR_DEVICE", tag = "pop6-d0-nuclear" },
}
for _, r in ipairs(PLAN) do
  local c = Cities.GetCityInPlot(r.x, r.y)
  local pil, gar, garMax = "-", -1, -1
  if c ~= nil then
    for _, d in c:GetDistricts():Members() do
      local t = GameInfo.Districts[d:GetType()]
      if t ~= nil and t.DistrictType == "DISTRICT_CITY_CENTER" then
        pil = tostring(d:IsPillaged())
        pcall(function() gar = d:GetDamage(DefenseTypes.DISTRICT_GARRISON) end)
        pcall(function() garMax = d:GetMaxDamage(DefenseTypes.DISTRICT_GARRISON) end)
      end
    end
  end
  print("{\"scene\":\"D\",\"kind\":\"pass-result\",\"stage\":\"ZTAG\",\"tag\":\"" .. r.tag
    .. "\",\"turn\":" .. Game.GetCurrentGameTurn()
    .. ",\"wmd\":\"" .. r.wmd .. "\",\"aimOffset\":" .. r.d .. ",\"popPlanned\":" .. r.pop
    .. ",\"exists\":" .. tostring(c ~= nil)
    .. ",\"popAfter\":" .. (c and c:GetPopulation() or -1)
    .. ",\"centrePillaged\":\"" .. pil .. "\",\"centreGarrison\":" .. gar .. ",\"centreGarrisonMax\":" .. garMax .. "}")
end
