-- GameCore: create one unit of type ZTYPE for player ZOWNER on each plot of
-- ZXYS ("x:y;x:y"), printing each plot's new id (nil when Create refused).
--   --set ZOWNER=6 --set ZTYPE=UNIT_INFANTRY --set "ZXYS=36:44;37:44;38:44"
local o = {}
for x, y in string.gmatch("ZXYS", "(%d+):(%d+)") do
  local u = Players[ZOWNER]:GetUnits():Create(GameInfo.Units["ZTYPE"].Index, tonumber(x), tonumber(y))
  o[#o + 1] = x .. ":" .. y .. "=" .. (u and u:GetID() or "nil")
end
print("created " .. table.concat(o, " "))
