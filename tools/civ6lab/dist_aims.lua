-- GameCore_Tuner: candidate aim plots at a chosen distance from the silo, for
-- testing whether the launch DISTANCE changes how hard a warhead is to shoot
-- down. An aim only qualifies if it is land, passable, not a city centre, and
-- has at least one passable LAND neighbour for the interceptor to stand on.
--   --set ZSX=37 --set ZSY=17 --set ZD=6 --set ZN=3
local out = {}
for dx = -ZD - 2, ZD + 2 do
  for dy = -ZD - 2, ZD + 2 do
    local okp, q = pcall(function() return Map.GetPlot(ZSX + dx, ZSY + dy) end)
    if okp and q ~= nil and #out < ZN then
      local d = Map.GetPlotDistance(ZSX, ZSY, q:GetX(), q:GetY())
      if d == ZD and not q:IsWater() and not q:IsImpassable() and not q:IsMountain()
         and q:GetDistrictType() < 0 then
        local land = 0
        for ax = -1, 1 do
          for ay = -1, 1 do
            local ok2, n = pcall(function() return Map.GetPlot(q:GetX() + ax, q:GetY() + ay) end)
            if ok2 and n ~= nil and Map.GetPlotDistance(q:GetX(), q:GetY(), n:GetX(), n:GetY()) == 1
               and not n:IsWater() and not n:IsImpassable() and not n:IsMountain() then
              land = land + 1
            end
          end
        end
        if land >= 1 then
          out[#out + 1] = "{\"at\":\"" .. q:GetX() .. ":" .. q:GetY() .. "\",\"landNeighbours\":" .. land .. "}"
        end
      end
    end
  end
end
print("{\"kind\":\"distaims\",\"silo\":\"" .. ZSX .. ":" .. ZSY .. "\",\"d\":" .. ZD
  .. ",\"n\":" .. #out .. ",\"aims\":[" .. table.concat(out, ",") .. "]}")
