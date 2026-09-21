-- GameCore_Tuner: valid found locations that would bring a target inside
-- Bomber Range 10. Prints every plot with IsValidFoundLocation() true whose
-- distance to ZTX:ZTY is at most ZMAX, nearest first by that distance.
--   --set ZTX=29 --set ZTY=12 --set ZMAX=9
local acc = {}
for i = 0, Map.GetPlotCount() - 1 do
  local q = Map.GetPlotByIndex(i)
  local d = Map.GetPlotDistance(ZTX, ZTY, q:GetX(), q:GetY())
  if d <= ZMAX and not q:IsWater() then
    local ok, v = pcall(function() return q:IsValidFoundLocation() end)
    if ok and v == true then
      acc[#acc + 1] = { x = q:GetX(), y = q:GetY(), d = d, o = q:GetOwner() }
    end
  end
end
table.sort(acc, function(a, b) return a.d < b.d end)
local out = {}
for k = 1, math.min(#acc, 25) do
  out[#out + 1] = "{\"x\":" .. acc[k].x .. ",\"y\":" .. acc[k].y .. ",\"dTarget\":" .. acc[k].d .. ",\"owner\":" .. acc[k].o .. "}"
end
print("{\"kind\":\"found-scan\",\"target\":\"" .. ZTX .. ":" .. ZTY .. "\",\"count\":" .. #acc
  .. ",\"best\":[" .. table.concat(out, ",") .. "]}")
