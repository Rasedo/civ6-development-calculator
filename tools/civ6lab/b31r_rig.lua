-- GameCore: B-31r-S1's rig. For every Trader of the players in ZPLAYERS, one
-- seat-0 unit on the first free plot adjacent to it: ZLAND on land beside a
-- land Trader, ZSEA on water beside a water Trader; a Trader that already
-- has a seat-0 unit beside it keeps that one. One line per Trader.
--   --set ZPLAYERS=1,3 --set ZLAND=UNIT_LINE_INFANTRY --set ZSEA=UNIT_DESTROYER
local tr = GameInfo.Units["UNIT_TRADER"].Index
for ps in string.gmatch("ZPLAYERS", "[^,]+") do
  local p = tonumber(ps)
  for _, x in Players[p]:GetUnits():Members() do
    if x:GetType() == tr and x:GetX() >= 0 then
      local tp = Map.GetPlot(x:GetX(), x:GetY())
      local made = nil
      for dir = 0, 5 do
        local q = Map.GetAdjacentPlot(x:GetX(), x:GetY(), dir)
        for _, v in ipairs(q and Units.GetUnitsInPlot(q) or {}) do if v:GetOwner() == 0 then made = v end end
      end
      for dir = 0, 5 do
        local q = Map.GetAdjacentPlot(x:GetX(), x:GetY(), dir)
        if made == nil and q ~= nil and q:GetUnitCount() == 0 and not q:IsMountain() and not q:IsImpassable()
           and q:IsWater() == tp:IsWater() and not q:IsCity() then
          local name = tp:IsWater() and "ZSEA" or "ZLAND"
          made = Players[0]:GetUnits():Create(GameInfo.Units[name].Index, q:GetX(), q:GetY())
        end
      end
      print(string.format("rig trader p%d %d at %d:%d water %s unit %s", p, x:GetID(), x:GetX(), x:GetY(),
        tostring(tp:IsWater()), made and tostring(made:GetID()) or "none"))
    end
  end
end
