-- GameCore_Tuner: plot:IsValidFoundLocation() answers FALSE for every plot on
-- the map from the tuner, so it is not a usable reader here. This finds sites
-- by the rule instead: unowned land, passable, not a mountain, at least ZMIN
-- from EVERY city, and within ZR of the base at ZBX:ZBY (Bomber Range).
--   --set ZBX=36 --set ZBY=22 --set ZR=9 --set ZMIN=4
local cities = {}
for _, pl in ipairs(Players) do
  local ok, cs = pcall(function() return pl:GetCities() end)
  if ok and cs ~= nil then
    for _, c in cs:Members() do cities[#cities + 1] = { x = c:GetX(), y = c:GetY() } end
  end
end
local out, n = {}, 0
for i = 0, Map.GetPlotCount() - 1 do
  local q = Map.GetPlotByIndex(i)
  if not q:IsWater() and not q:IsImpassable() and not q:IsMountain()
     and q:GetOwner() == -1 and Map.GetPlotDistance(ZBX, ZBY, q:GetX(), q:GetY()) <= ZR then
    local far = true
    for _, c in ipairs(cities) do
      if Map.GetPlotDistance(c.x, c.y, q:GetX(), q:GetY()) < ZMIN then far = false break end
    end
    if far then
      n = n + 1
      if n <= 12 then
        out[#out + 1] = "{\"x\":" .. q:GetX() .. ",\"y\":" .. q:GetY()
          .. ",\"dBase\":" .. Map.GetPlotDistance(ZBX, ZBY, q:GetX(), q:GetY()) .. "}"
      end
    end
  end
end
print("{\"kind\":\"site-scan\",\"base\":\"" .. ZBX .. ":" .. ZBY .. "\",\"count\":" .. n
  .. ",\"sites\":[" .. table.concat(out, ",") .. "]}")
