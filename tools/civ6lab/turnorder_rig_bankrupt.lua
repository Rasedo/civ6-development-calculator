-- GameCore_Tuner: the bankruptcy arm. Sets player ZP's gold to ZGOLD and
-- creates ZN units of ZU on free land plots around its first city (one per
-- plot, the centre skipped), so the next turn's net income is negative.
-- Prints the treasury's yield and maintenance before and after.
--   --set ZP=0 --set ZGOLD=0 --set ZNUM=4 --set ZU=UNIT_CROSSBOWMAN
local P = Players[ZP]
local T = P:GetTreasury()
print("before gold=" .. T:GetGoldBalance() .. " yield=" .. T:GetGoldYield() .. " maint=" .. T:GetTotalMaintenance()
  .. " unitMaint=" .. T:GetUnitMaintenance())
local city = nil
for _, c in P:GetCities():Members() do city = c break end
local cx, cy = city:GetX(), city:GetY()
local made = 0
local ids = {}
for dy = -2, 2 do
  for dx = -2, 2 do
    if made < ZNUM and not (dx == 0 and dy == 0) then
      local pl = Map.GetPlot(cx + dx, cy + dy)
      if pl ~= nil and not pl:IsWater() and not pl:IsMountain() and pl:GetOwner() == ZP and pl:GetUnitCount() == 0 then
        local u = P:GetUnits():Create(GameInfo.Units["ZU"].Index, cx + dx, cy + dy)
        if u ~= nil then made = made + 1; ids[#ids + 1] = u:GetID() .. "@" .. (cx + dx) .. "," .. (cy + dy) end
      end
    end
  end
end
T:SetGoldBalance(ZGOLD)
print("made " .. made .. " " .. table.concat(ids, " "))
print("after gold=" .. T:GetGoldBalance() .. " yield=" .. T:GetGoldYield() .. " maint=" .. T:GetTotalMaintenance()
  .. " unitMaint=" .. T:GetUnitMaintenance())
local n = 0
for _, u in P:GetUnits():Members() do n = n + 1 end
print("units " .. n)
