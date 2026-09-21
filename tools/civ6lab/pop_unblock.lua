-- GameCore_Tuner: undo pop_block. Destroys every unit of ZWAR within ZD of
-- ZCX:ZCY, so an experiment never leaves an enemy army parked on the owner's
-- capital when a turn is finally played.
--   --set ZCX=36 --set ZCY=22 --set ZD=3 --set ZWAR=1
local pe = Players[ZWAR]
local doomed = {}
for _, u in pe:GetUnits():Members() do
  if Map.GetPlotDistance(ZCX, ZCY, u:GetX(), u:GetY()) <= ZD then doomed[#doomed + 1] = u:GetID() end
end
local n = 0
for _, id in ipairs(doomed) do
  local u = pe:GetUnits():FindID(id)
  if u ~= nil then pe:GetUnits():Destroy(u) n = n + 1 end
end
print("{\"kind\":\"unblock\",\"centre\":\"" .. ZCX .. ":" .. ZCY .. "\",\"removed\":" .. n .. "}")
