-- GameCore_Tuner: place a Settler of seat 0 on the first plot at EXACTLY
-- distance ZD from (ZX, ZY) where the game would let it found a city
-- (land, passable, unowned by anyone else) and print where. The InGame
-- found request follows (`pop_foundcity.lua`).
--   --set ZX=19 --set ZY=15 --set ZD=4
local cands = {}
local w, h = Map.GetGridSize()
for y = 0, h - 1 do
  for x = 0, w - 1 do
    if Map.GetPlotDistance(ZX, ZY, x, y) == ZD then
      local p = Map.GetPlot(x, y)
      if p and not p:IsWater() and not p:IsImpassable() and not p:IsMountain()
          and (p:GetOwner() == -1 or p:GetOwner() == 0) and p:GetDistrictType() == -1 then
        cands[#cands + 1] = {x, y}
      end
    end
  end
end
print("candidates " .. #cands)
for _, c in ipairs(cands) do
  local u = UnitManager.InitUnit(0, "UNIT_SETTLER", c[1], c[2])
  if u ~= nil then
    print("settler at " .. c[1] .. "," .. c[2])
    return
  end
end
print("no settler placed")
