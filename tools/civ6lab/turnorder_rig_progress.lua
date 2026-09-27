-- GameCore_Tuner: add ZADD production to the item city ZC of player ZP is
-- building (BuildQueue:AddProgress), and print what it builds.
--   --set ZP=0 --set ZC=196609 --set ZADD=20
local P = Players[ZP]
local city = nil
for _, c in P:GetCities():Members() do if c:GetID() == ZC then city = c end end
if city == nil then print("nocity") return end
local bq = city:GetBuildQueue()
print("cur=" .. tostring(bq:CurrentlyBuilding()))
local ok, err = pcall(function() bq:AddProgress(ZADD) end)
print("add " .. ZADD .. " ok=" .. tostring(ok) .. (ok and "" or (" " .. tostring(err))))
