-- InGame: scene D's fallout half. Gathering Storm has NO FEATURE_FALLOUT row;
-- contamination is its own manager:
--   Game.GetFalloutManager():GetFalloutTurnsRemaining(plotIndex)
-- Prints every plot within ZR of ZCX:ZCY that still has turns on it.
--   --set ZCX=23 --set ZCY=26 --set ZR=4 --set ZTAG=after-draw1
local fm = Game.GetFalloutManager()
print("falloutManager=" .. tostring(fm ~= nil))
if fm == nil then return end
local k = {}
for a, b in pairs(getmetatable(fm) and getmetatable(fm).__index or fm) do k[#k + 1] = tostring(a) end
table.sort(k)
print("methods: " .. table.concat(k, " "))
local n = 0
for i = 0, Map.GetPlotCount() - 1 do
  local q = Map.GetPlotByIndex(i)
  local d = Map.GetPlotDistance(ZCX, ZCY, q:GetX(), q:GetY())
  if d <= ZR then
    local ok, t = pcall(function() return fm:GetFalloutTurnsRemaining(i) end)
    if ok and t ~= nil and t > 0 then
      n = n + 1
      print("{\"scene\":\"D\",\"tag\":\"ZTAG\",\"kind\":\"fallout\",\"turn\":" .. Game.GetCurrentGameTurn()
        .. ",\"ring\":" .. d .. ",\"x\":" .. q:GetX() .. ",\"y\":" .. q:GetY()
        .. ",\"turnsRemaining\":" .. t .. "}")
    end
  end
end
print("contaminated plots within " .. ZR .. ": " .. n)
