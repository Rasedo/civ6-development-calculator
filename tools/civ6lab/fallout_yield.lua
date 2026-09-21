-- GameCore_Tuner: contaminate EVERY plot within ZR of a city centre with no
-- blast at all (SetFalloutTurnsRemaining), so the question "does fallout cost
-- the owner anything in yield?" is asked with nothing pillaged, nothing killed
-- and no district damaged. The InGame reader then compares the city's food
-- surplus and per-plot yields before and after.
--   --set ZCX=21 --set ZCY=22 --set ZR=2 --set ZTURNS=12
local fm = Game.GetFalloutManager()
local n = 0
for dx = -ZR, ZR do
  for dy = -ZR, ZR do
    local ok, q = pcall(function() return Map.GetPlot(ZCX + dx, ZCY + dy) end)
    if ok and q ~= nil and Map.GetPlotDistance(ZCX, ZCY, q:GetX(), q:GetY()) <= ZR then
      local i = q:GetIndex()
      if fm:GetFalloutTurnsRemaining(i) < ZTURNS then
        pcall(function() fm:SetFalloutTurnsRemaining(i, ZTURNS) end)
        if fm:GetFalloutTurnsRemaining(i) >= ZTURNS then n = n + 1 end
      end
    end
  end
end
print("{\"kind\":\"fallout-flood\",\"centre\":\"" .. ZCX .. ":" .. ZCY .. "\",\"radius\":" .. ZR
  .. ",\"contaminated\":" .. n .. ",\"turns\":" .. ZTURNS .. "}")
