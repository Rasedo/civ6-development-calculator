-- GameCore_Tuner: place exactly ONE interceptor at exactly distance ZD from the
-- aim plot and nothing else within 4, so the preview's ANTI_AIR block answers
-- "does this unit cover a tile ZD away?" with no other unit able to claim it.
-- ABILITY_ANTI_AIR_COVER carries no radius in the database (it is attached by
-- the CLASS_ANTI_AIR tag and nothing more), so the radius has to be measured.
--   --set ZAX=36 --set ZAY=15 --set ZWAR=1 --set ZUNIT=UNIT_MOBILE_SAM
--   --set ZD=1 --set ZMARKER=UNIT_WARRIOR --set ZWATER=0
local fm = Game.GetFalloutManager()
local aim = Map.GetPlot(ZAX, ZAY)
pcall(function() fm:SetFalloutTurnsRemaining(aim:GetIndex(), 0) end)
local pe = Players[ZWAR]
local doomed = {}
for _, u in pe:GetUnits():Members() do
  if Map.GetPlotDistance(ZAX, ZAY, u:GetX(), u:GetY()) <= 4 then doomed[#doomed + 1] = u:GetID() end
end
for _, id in ipairs(doomed) do
  local u = pe:GetUnits():FindID(id)
  if u ~= nil then pe:GetUnits():Destroy(u) end
end
local marker = pe:GetUnits():Create(GameInfo.Units["ZMARKER"].Index, ZAX, ZAY)
local placed, at = nil, "-"
for dx = -ZD - 1, ZD + 1 do
  for dy = -ZD - 1, ZD + 1 do
    local okp, q = pcall(function() return Map.GetPlot(ZAX + dx, ZAY + dy) end)
    if placed == nil and okp and q ~= nil then
      local d = Map.GetPlotDistance(ZAX, ZAY, q:GetX(), q:GetY())
      local wantWater = ZWATER == 1
      if d == ZD and q:IsWater() == wantWater and not q:IsImpassable() then
        local u = pe:GetUnits():Create(GameInfo.Units["ZUNIT"].Index, q:GetX(), q:GetY())
        if u ~= nil and Map.GetPlotDistance(ZAX, ZAY, u:GetX(), u:GetY()) == ZD then
          placed = u
          at = u:GetX() .. ":" .. u:GetY()
        elseif u ~= nil then
          pe:GetUnits():Destroy(u)
        end
      end
    end
  end
end
print("{\"kind\":\"aacover\",\"unit\":\"ZUNIT\",\"d\":" .. ZD
  .. ",\"placed\":" .. tostring(placed ~= nil) .. ",\"at\":\"" .. at .. "\""
  .. ",\"id\":" .. (placed and placed:GetID() or -1)
  .. ",\"marker\":" .. (marker and marker:GetID() or -1) .. "}")
