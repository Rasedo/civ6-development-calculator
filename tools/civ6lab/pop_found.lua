-- GameCore_Tuner: put a Settler on a remote unowned plot. A Bomber can only be
-- CREATED on a tile its owner has a city on, so reaching a target past Bomber
-- Range 10 means founding a city nearer to it; this is step one.
--   --set ZX=34 --set ZY=17
local q = Map.GetPlot(ZX, ZY)
print("{\"kind\":\"found-probe\",\"x\":" .. ZX .. ",\"y\":" .. ZY
  .. ",\"owner\":" .. tostring(q:GetOwner()) .. ",\"water\":" .. tostring(q:IsWater())
  .. ",\"impassable\":" .. tostring(q:IsImpassable())
  .. ",\"validFound\":" .. tostring(q:IsValidFoundLocation()) .. "}")
local u = Players[0]:GetUnits():Create(GameInfo.Units["UNIT_SETTLER"].Index, ZX, ZY)
if u == nil then
  print("{\"kind\":\"found-probe\",\"settler\":\"nil\"}")
else
  print("{\"kind\":\"found-probe\",\"settler\":" .. u:GetID() .. ",\"x\":" .. u:GetX() .. ",\"y\":" .. u:GetY() .. "}")
end
