-- GameCore: seat 0's captured spies (held off-map at -9999) still fill its spy
-- capacity, so the loop stops buying; ZN more copies of CIVIC_GRANT_SPY raise it
for i = 1, ZN do Players[0]:AttachModifierByID("CIVIC_GRANT_SPY") end
local n, off = 0, 0
for _, u in Players[0]:GetUnits():Members() do
  if u:GetType() == GameInfo.Units["UNIT_SPY"].Index then
    n = n + 1
    if u:GetX() < 0 then off = off + 1 end
  end
end
local ok, cap = pcall(function() return Players[0]:GetDiplomacy():GetSpyCapacity() end)
print(string.format("capacity +%d; spies %d (off-map %d); GetSpyCapacity %s", ZN, n, off, ok and tostring(cap) or ("err:" .. tostring(cap))))
