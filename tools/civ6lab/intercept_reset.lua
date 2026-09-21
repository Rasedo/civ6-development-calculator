-- GameCore_Tuner: rebuild the interception scene from scratch, so every strike
-- in a battery starts identical and the outcome is unambiguous.
--   * clears fallout on the aim plot (it otherwise stays at 20 and stops being
--     a signal after the first blast that lands)
--   * destroys any old guard/marker and creates fresh ones — a unit killed by a
--     blast is still FINDABLE, parked at -9999, which is what made the first
--     reading of this scene ambiguous
-- Returns the new ids so the reader knows exactly what to look for.
--   --set ZAX=36 --set ZAY=15 --set ZWAR=1 --set ZUNIT=UNIT_MOBILE_SAM
--   --set ZGX=37 --set ZGY=14
local fm = Game.GetFalloutManager()
local aim = Map.GetPlot(ZAX, ZAY)
pcall(function() fm:SetFalloutTurnsRemaining(aim:GetIndex(), 0) end)
local pe = Players[ZWAR]
-- clear everything of ZWAR within 1 of the aim plot
local doomed = {}
for _, u in pe:GetUnits():Members() do
  if Map.GetPlotDistance(ZAX, ZAY, u:GetX(), u:GetY()) <= 1 then doomed[#doomed + 1] = u:GetID() end
end
for _, id in ipairs(doomed) do
  local u = pe:GetUnits():FindID(id)
  if u ~= nil then pe:GetUnits():Destroy(u) end
end
-- a fresh marker ON the aim plot and a fresh guard NEXT to it
local marker = pe:GetUnits():Create(GameInfo.Units["UNIT_WARRIOR"].Index, ZAX, ZAY)
-- the guard goes on a FIXED tile. Letting it land on "the first free neighbour"
-- moved it between rounds, and with it the terrain bonuses — which is why one
-- anti-air base could not fit five rounds of damage.
local guard, gx, gy = nil, ZGX, ZGY
guard = pe:GetUnits():Create(GameInfo.Units["ZUNIT"].Index, ZGX, ZGY)
if guard == nil then gx, gy = -1, -1 end
print("{\"kind\":\"reset\",\"aim\":\"" .. ZAX .. ":" .. ZAY .. "\""
  .. ",\"marker\":" .. (marker and marker:GetID() or -1)
  .. ",\"guard\":" .. (guard and guard:GetID() or -1)
  .. ",\"guardAt\":\"" .. gx .. ":" .. gy .. "\""
  .. ",\"aimFallout\":" .. tostring(fm:GetFalloutTurnsRemaining(aim:GetIndex()))
  .. ",\"cleared\":" .. #doomed .. "}")
